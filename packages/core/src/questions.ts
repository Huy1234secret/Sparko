/**
 * Questions & answers: members ask with a slash command, Sparko posts the
 * question with a thread and an Answer button for staff, and once it's
 * answered the thread closes straight away or after a while. The messages
 * are Message Studio templates with fixed buttons under them. Nothing here
 * touches the database or the network, so the dashboard imports this file
 * too.
 */
import { parseDuration } from './auto-roles.ts';
import {
  componentRows,
  embedDefault,
  studioPayload,
  v2Default,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';
import { commandName, sgAllowed, type SgFile } from './suggestions.ts';

export const QA_MODULE = 'questions';

/** What happens to a question's thread once it's answered. */
export type QaAfter = 'now' | 'later' | 'never';
/** How long Discord waits before hiding a quiet thread, in minutes. */
export type QaArchive = 60 | 1440 | 4320 | 10080;
export const qaArchiveChoices: QaArchive[] = [60, 1440, 4320, 10080];

export type QaCategory = { id: string; name: string; emoji: string };

export type QaCommandKey = 'ask' | 'answer' | 'close' | 'reopen' | 'delete';
export type QaCommand = { on: boolean; name: string; description: string };

export type Questions = {
  /** Where questions are posted, each with its own thread. */
  channel: string;
  /** Roles that may ask; [] for everyone. */
  askers: string[];
  /** Members with this role can't ask; '' for nobody. */
  blacklist: string;
  /** Roles that can answer, close, reopen and delete; [] for Manage Server. */
  answerers: string[];
  /** Hides who asked in the post; staff still see it in the dashboard. */
  anonymous: boolean;
  /** The details box has to be filled in. */
  requireDetails: boolean;
  /** Characters the details need, and may have. */
  minLength: number;
  maxLength: number;
  /** Time between one member's questions, like "10mi"; '' for none. */
  cooldown: string;
  /** Questions one member can have open at once. */
  maxOpen: number;
  /** A role pinged when a new question is posted; '' for none. */
  ping: string;
  /** Topics members pick when they ask; [] for none. */
  categories: QaCategory[];
  /** A "Me too" button counting members with the same question. */
  meToo: boolean;
  /** Minutes a quiet thread stays in the channel list. */
  archive: QaArchive;
  /** Closing the thread once answered: now, after `closeAfter`, or never. */
  after: QaAfter;
  closeAfter: string;
  /** Unanswered questions expire after this long, like "7d"; '' never. */
  expire: string;
  /** DMs the asker when their question is answered. */
  dm: boolean;
  /** The Studio templates for the question, the answer and the DM; '' for Sparko's own. */
  message: string;
  answerMessage: string;
  dmMessage: string;
  /** The slash command; its subcommands are in `commands`. */
  command: { name: string; description: string };
  commands: Record<QaCommandKey, QaCommand>;
};

export const qaCommandKeys: QaCommandKey[] = [
  'ask',
  'answer',
  'close',
  'reopen',
  'delete',
];
export const qaCommandAbout: Record<QaCommandKey, string> = {
  ask: 'Members ask a question. It opens a form for the title and the details, and can take a category and up to 3 files.',
  answer:
    'Staff answer a question by its number. The answer is posted in its thread and shown on the question.',
  close:
    'Staff close a question by its number without answering it. Its thread is locked.',
  reopen:
    'Staff reopen a closed, answered or expired question, so it can be answered again.',
  delete: 'Staff take a question away: its message, its thread and its data.',
};

export const qaDefaultCommands = (): Record<QaCommandKey, QaCommand> => ({
  ask: { on: true, name: 'ask', description: 'Ask the staff a question' },
  answer: { on: true, name: 'answer', description: 'Answer a question' },
  close: {
    on: true,
    name: 'close',
    description: 'Close a question without answering it',
  },
  reopen: { on: true, name: 'reopen', description: 'Reopen a question' },
  delete: { on: true, name: 'delete', description: 'Delete a question' },
});

let counter = 0;
export const qaId = () =>
  `q${Date.now().toString(36)}${(counter++).toString(36)}`;

export const qaDefault = (channel = ''): Questions => ({
  channel,
  askers: [],
  blacklist: '',
  answerers: [],
  anonymous: false,
  requireDetails: false,
  minLength: 0,
  maxLength: 1000,
  cooldown: '',
  maxOpen: 3,
  ping: '',
  categories: [],
  meToo: true,
  archive: 1440,
  after: 'later',
  closeAfter: '1d',
  expire: '',
  dm: true,
  message: '',
  answerMessage: '',
  dmMessage: '',
  command: {
    name: 'question',
    description: 'Ask the staff a question, or answer one',
  },
  commands: qaDefaultCommands(),
});

/** What each plan allows. Every question uses 4 KB of the server's storage. */
export const qaLimits = (plan?: string | null) => {
  const plus = plan === 'plus';
  const storageMb = plus ? 100 : 10;
  const perKb = 4;
  return {
    categories: plus ? 25 : 5,
    /** The highest "open questions per member" can be set. */
    maxOpen: plus ? 20 : 3,
    storageMb,
    perKb,
    questions: Math.floor((storageMb * 1024) / perKb),
  };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The shortest and longest each time can be. */
export const qaRanges = {
  cooldown: { min: MINUTE, max: 30 * DAY, label: '1mi and 1mt' },
  closeAfter: { min: MINUTE, max: 30 * DAY, label: '1mi and 1mt' },
  expire: { min: HOUR, max: 365 * DAY, label: '1h and 1y' },
} as const;
/** The details box: Discord's form holds 4,000, Sparko keeps 2,000. */
export const qaLengths = { max: 2000, maxFloor: 100 } as const;
/** The longest answer, and how much of it the question shows. */
export const qaAnswerMax = 2000;
export const qaAnswerShown = 1000;

// Checks ----------------------------------------------------------------------

export type QaIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const itemId = /^[\w-]{1,40}$/;
const emojiOk = (e: unknown) =>
  typeof e === 'string' &&
  e.length <= 64 &&
  (!e || /^<a?:\w{1,32}:\d{1,25}>$/.test(e) || !/[<>:\s]/.test(e));

/**
 * Checks settings sent by the dashboard. `roles` maps a role's id to
 * whether Sparko can give it; `templates` are the server's Studio
 * templates. Returns the first problem, and where it is.
 */
export function qaIssue(
  input: unknown,
  {
    roles,
    templates,
    plan,
    taken,
  }: {
    roles?: Map<string, boolean>;
    templates?: Set<string>;
    plan?: string | null | undefined;
    /** Command names the server's other modules use. */
    taken?: Set<string>;
  } = {},
): QaIssue | null {
  const x = input as Partial<Questions> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const limits = qaLimits(plan);
  const at = (where: string, problem: string) => ({ at: where, problem });

  if (typeof x.channel !== 'string' || !snowflake.test(x.channel))
    return at('channel', 'Pick the channel questions are posted in.');

  const roleList = (list: unknown, where: string, what: string) => {
    if (!Array.isArray(list)) return missing;
    if (list.length > 25) return at(where, `Pick up to 25 roles for ${what}.`);
    for (const id of list) {
      if (typeof id !== 'string' || !snowflake.test(id)) return missing;
      if (roles && !roles.has(id))
        return at(where, `A role in ${what} was deleted. Pick another one.`);
    }
    return null;
  };
  const roleIssue =
    roleList(x.askers, 'askers', 'Who can ask') ??
    roleList(x.answerers, 'answerers', 'Who can answer');
  if (roleIssue) return roleIssue;
  for (const [k, what] of [
    ['blacklist', 'The blacklisted role'],
    ['ping', 'The role to ping'],
  ] as const) {
    const v = x[k];
    if (typeof v !== 'string') return missing;
    if (!v) continue;
    if (!snowflake.test(v)) return missing;
    if (roles && !roles.has(v))
      return at(k, `${what} was deleted. Pick another.`);
  }
  if (x.blacklist && x.askers!.includes(x.blacklist))
    return at(
      'blacklist',
      'The blacklisted role is also allowed to ask. Pick one or the other.',
    );

  for (const k of ['anonymous', 'requireDetails', 'meToo', 'dm'] as const)
    if (typeof x[k] !== 'boolean') return missing;

  if (
    !Number.isInteger(x.maxLength) ||
    x.maxLength! < qaLengths.maxFloor ||
    x.maxLength! > qaLengths.max
  )
    return at('length', 'The longest details are 100 to 2,000 characters.');
  if (
    !Number.isInteger(x.minLength) ||
    x.minLength! < 0 ||
    x.minLength! > x.maxLength!
  )
    return at(
      'length',
      'The shortest details have to be 0 or more, and no more than the longest.',
    );

  if (
    !Number.isInteger(x.maxOpen) ||
    x.maxOpen! < 1 ||
    x.maxOpen! > limits.maxOpen
  )
    return at(
      'maxOpen',
      `Open questions per member is 1 to ${limits.maxOpen} on this plan.`,
    );

  const duration = (
    value: unknown,
    where: string,
    range: { min: number; max: number; label: string },
    what: string,
  ) => {
    if (typeof value !== 'string') return missing;
    if (!value.trim()) return null;
    const ms = parseDuration(value);
    if (ms === null)
      return at(where, `Write ${what} with mi, h, d, w, mt or y, like 1d.`);
    if (ms < range.min || ms > range.max)
      return at(where, `${what} has to be between ${range.label}.`);
    return null;
  };
  const timeIssue =
    duration(x.cooldown, 'cooldown', qaRanges.cooldown, 'The cooldown') ??
    duration(x.closeAfter, 'closeAfter', qaRanges.closeAfter, 'Close after') ??
    duration(x.expire, 'expire', qaRanges.expire, 'Expire after');
  if (timeIssue) return timeIssue;

  if (!qaArchiveChoices.includes(x.archive as QaArchive)) return missing;
  if (!['now', 'later', 'never'].includes(x.after as string)) return missing;
  if (x.after === 'later' && !x.closeAfter!.trim())
    return at('closeAfter', 'Say how long after the answer the thread closes.');

  // Categories.
  const cats = x.categories;
  if (!Array.isArray(cats)) return missing;
  if (cats.length > limits.categories)
    return at(
      'categories',
      `This plan has up to ${limits.categories} categories.`,
    );
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const cat of cats) {
    if (!cat || typeof cat.id !== 'string' || !itemId.test(cat.id))
      return missing;
    if (ids.has(cat.id)) return missing;
    ids.add(cat.id);
    const where = `category:${cat.id}`;
    const name = typeof cat.name === 'string' ? cat.name.trim() : '';
    if (!name || name.length > 30)
      return at(where, 'Give each category a name of up to 30 characters.');
    if (names.has(name.toLowerCase()))
      return at(where, `Two categories are called “${name}”.`);
    names.add(name.toLowerCase());
    if (!emojiOk(cat.emoji))
      return at(where, `The emoji for “${name}” isn’t one Discord can show.`);
  }

  // Templates.
  for (const [k, what] of [
    ['message', 'question message'],
    ['answerMessage', 'answer message'],
    ['dmMessage', 'DM'],
  ] as const) {
    const v = x[k];
    if (typeof v !== 'string') return missing;
    if (v && !templateId.test(v)) return missing;
    if (v && templates && !templates.has(v))
      return at(k, `The ${what} template was deleted. Pick or make another.`);
  }

  // Commands.
  const g = x.command;
  if (!g || typeof g !== 'object') return missing;
  if (typeof g.name !== 'string' || !commandName.test(g.name))
    return at(
      'command',
      'Command names are 1 to 32 lowercase letters, numbers, - or _.',
    );
  if (taken?.has(g.name))
    return at(
      'command',
      `/${g.name} is already a command in this server. Pick another name.`,
    );
  if (
    typeof g.description !== 'string' ||
    !g.description.trim() ||
    g.description.length > 100
  )
    return at('command', `Give /${g.name} a description of up to 100.`);
  const c = x.commands;
  if (!c || typeof c !== 'object') return missing;
  const used = new Set<string>();
  for (const key of qaCommandKeys) {
    const cmd = c[key];
    const where = `command:${key}`;
    if (!cmd || typeof cmd.on !== 'boolean') return missing;
    if (typeof cmd.name !== 'string' || !commandName.test(cmd.name))
      return at(
        where,
        'Command names are 1 to 32 lowercase letters, numbers, - or _.',
      );
    if (used.has(cmd.name))
      return at(where, `Two commands are called /${g.name} ${cmd.name}.`);
    used.add(cmd.name);
    if (
      typeof cmd.description !== 'string' ||
      !cmd.description.trim() ||
      cmd.description.length > 100
    )
      return at(
        where,
        `Give /${g.name} ${cmd.name} a description of up to 100.`,
      );
  }
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export function cleanQuestions(c: Questions): Questions {
  const command = (k: QaCommandKey): QaCommand => ({
    on: c.commands[k].on,
    name: c.commands[k].name,
    description: c.commands[k].description.trim(),
  });
  return {
    channel: c.channel,
    askers: [...new Set(c.askers)],
    blacklist: c.blacklist,
    answerers: [...new Set(c.answerers)],
    anonymous: c.anonymous,
    requireDetails: c.requireDetails,
    minLength: c.minLength,
    maxLength: c.maxLength,
    cooldown: c.cooldown.trim(),
    maxOpen: c.maxOpen,
    ping: c.ping,
    categories: c.categories.map((x) => ({
      id: x.id,
      name: x.name.trim(),
      emoji: x.emoji,
    })),
    meToo: c.meToo,
    archive: c.archive,
    after: c.after,
    closeAfter: c.closeAfter.trim(),
    expire: c.expire.trim(),
    dm: c.dm,
    message: c.message,
    answerMessage: c.answerMessage,
    dmMessage: c.dmMessage,
    command: {
      name: c.command.name,
      description: c.command.description.trim(),
    },
    commands: Object.fromEntries(
      qaCommandKeys.map((k) => [k, command(k)]),
    ) as Record<QaCommandKey, QaCommand>,
  };
}

/**
 * Settings saved by an older version, with anything added since filled in
 * from the defaults.
 */
export function qaUpgrade(saved: Partial<Questions> | null | undefined) {
  const base = qaDefault();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    command: { ...base.command, ...saved.command },
    commands: { ...base.commands, ...saved.commands },
  } as Questions;
}

/**
 * Problems with a question or answer template: one embed or container
 * without pictures. The question's fixed buttons take one of Discord's
 * five rows.
 */
export function qaMessageIssue(
  m: StudioMessage,
  kind: 'question' | 'answer' = 'question',
): QaIssue | null {
  const at = kind === 'question' ? 'message' : 'answerMessage';
  const what = kind === 'question' ? 'A question message' : 'An answer message';
  if (
    kind === 'question' &&
    m.layout !== 'v2' &&
    componentRows(m.components).length > 4
  )
    return {
      at,
      problem:
        'The Answer, Mark answered and Me too buttons take one of Discord’s five rows, so a question message has up to 4 rows of its own.',
    };
  if (m.layout === 'v2') {
    if (m.v2.gallery.length)
      return {
        at,
        problem: `${what} can’t have pictures. Members’ files are shown with {files}.`,
      };
    return null;
  }
  if (m.embeds.length !== 1) return { at, problem: `${what} has one embed.` };
  if (m.embeds[0]!.image)
    return {
      at,
      problem: `${what} can’t have a picture. Members’ files are shown with {files}.`,
    };
  return null;
}

// Who can do what -------------------------------------------------------------

/** What Sparko knows about someone asking. */
export type QaAskerFacts = {
  roles: Set<string>;
  /** Their questions still open. */
  open: number;
  /** When they last asked, if ever. */
  lastAt: number | null;
};

/** Why someone can't ask right now, or null when they can. */
export function qaCanAsk(c: Questions, f: QaAskerFacts, now: number) {
  if (c.blacklist && f.roles.has(c.blacklist))
    return 'You can’t ask questions in this server.';
  if (c.askers.length && !c.askers.some((r) => f.roles.has(r)))
    return `Only ${c.askers.map((r) => `<@&${r}>`).join(', ')} can ask questions here.`;
  const cooldown = parseDuration(c.cooldown);
  if (cooldown && f.lastAt !== null && now - f.lastAt < cooldown)
    return `You can ask again <t:${Math.ceil((f.lastAt + cooldown) / 1000)}:R>.`;
  if (f.open >= c.maxOpen)
    return `You already have ${f.open} open ${f.open === 1 ? 'question' : 'questions'}. Wait for ${f.open === 1 ? 'it' : 'them'} to be answered first.`;
  return null;
}

/** Why the details can't be posted, or null when they can. */
export function qaLengthProblem(c: Questions, text: string) {
  const n = text.trim().length;
  if (!n && !c.requireDetails) return null;
  const min = Math.max(c.requireDetails ? 1 : 0, c.minLength);
  if (n < min)
    return `Questions here need at least ${min} ${min === 1 ? 'character' : 'characters'} of details. Yours has ${n}.`;
  if (n > c.maxLength)
    return `Details here are up to ${c.maxLength.toLocaleString('en-US')} characters. Yours has ${n.toLocaleString('en-US')}.`;
  return null;
}

/** Staff: the answerer roles, or Manage Server when none are picked. */
export const qaIsStaff = (
  c: Questions,
  member: Set<string>,
  manager: boolean,
) => sgAllowed(c.answerers, member, manager);

// Questions and their statuses -------------------------------------------------

export type QaStatus = 'open' | 'answered' | 'closed' | 'expired' | 'deleted';
export const qaStatuses: { id: QaStatus; name: string; color: string }[] = [
  { id: 'open', name: 'Open', color: '#5865F2' },
  { id: 'answered', name: 'Answered', color: '#57F287' },
  { id: 'closed', name: 'Closed', color: '#949BA4' },
  { id: 'expired', name: 'Expired', color: '#F0B232' },
  { id: 'deleted', name: 'Deleted in Discord', color: '#ED4245' },
];
export const qaStatusOf = (id: string) =>
  qaStatuses.find((s) => s.id === id) ?? qaStatuses[0]!;

export type QaFile = SgFile;

export type QaAnswer = {
  text: string;
  byId: string;
  byName: string;
  byAvatar: string;
  at: number;
};

/** A question, as the bot, the server and the dashboard pass it around. */
export type QaQuestion = {
  number: number;
  askerId: string;
  askerName: string;
  askerAvatar: string;
  title: string;
  body: string;
  /** The category's id, or '' for none. */
  category: string;
  files: QaFile[];
  status: QaStatus;
  /** Members who pressed Me too. */
  meToo: number;
  channelId: string | null;
  messageId: string | null;
  threadId: string | null;
  /** The answer message in the thread. */
  answerId: string | null;
  answer: QaAnswer | null;
  /** Who closed it with Mark answered or /close, if anyone. */
  closedBy: { id: string; name: string } | null;
  createdAt: number;
  answeredAt: number | null;
  /** When the thread closes on its own; null for not planned. */
  closeAt: number | null;
  /** The thread is locked and archived. */
  threadClosed: boolean;
};

export const qaCategoryOf = (c: Questions, id: string) =>
  c.categories.find((x) => x.id === id);
/** A category as text, like "🎮 Gaming"; "General" for none. */
export function qaCategoryName(c: Questions, id: string) {
  const cat = qaCategoryOf(c, id);
  return cat ? `${cat.emoji ? `${cat.emoji} ` : ''}${cat.name}` : 'General';
}

/** Finds a category by its id or name, as members type it in /ask. */
export function qaFindCategory(c: Questions, typed: string) {
  const t = typed.trim().toLowerCase();
  if (!t) return undefined;
  return c.categories.find((x) => x.id === t || x.name.toLowerCase() === t);
}

/** When an answered question's thread should close, or null for never. */
export function qaCloseAt(c: Questions, answeredAt: number) {
  if (c.after === 'now') return answeredAt;
  if (c.after === 'never') return null;
  const ms = parseDuration(c.closeAfter);
  return ms ? answeredAt + ms : null;
}

// The messages ----------------------------------------------------------------

const embedMessage = (
  name: string,
  content: string,
  embed: Partial<ReturnType<typeof embedDefault>>,
): StudioMessage => ({
  name,
  channel: '',
  layout: 'embed',
  content,
  embeds: [{ ...embedDefault(), ...embed }],
  components: [],
  v2: v2Default(),
});
const v2Message = (
  name: string,
  accent: string,
  text: string,
  thumbnail = '',
): StudioMessage => ({
  name,
  channel: '',
  layout: 'v2',
  content: '',
  embeds: [],
  components: [],
  v2: { ...v2Default(), accent, text, thumbnail },
});

export type QaPreset = {
  id: string;
  name: string;
  about: string;
  /** Which message it's for. */
  kind: 'question' | 'answer';
  message: StudioMessage;
};

/** Ready-made question and answer messages to start from. */
export const qaPresets: QaPreset[] = [
  {
    id: 'qa-card',
    kind: 'question',
    name: 'Question card',
    about: 'An embed with who asked, the status and the category.',
    message: embedMessage('Question card', '', {
      author: '{user.name} asked',
      authorIcon: '{user.avatar}',
      title: '❓ {question.title}',
      description: '{question.body}\n\n{files}',
      color: '#5865F2',
      fields: [
        { id: 'f1', name: 'Status', value: '{status}', inline: false },
        {
          id: 'f2',
          name: 'Category',
          value: '{question.category}',
          inline: false,
        },
      ],
      footer: 'Question {question.id} · Answers go in the thread',
      timestamp: true,
    }),
  },
  {
    id: 'qa-compact',
    kind: 'question',
    name: 'Compact',
    about: 'Just the question, with the details in the footer.',
    message: embedMessage('Compact question', '', {
      title: '{question.title}',
      description: '{question.body}\n{files}',
      color: '#5865F2',
      footer: '{question.id} · {user.name} · {status} · {question.category}',
    }),
  },
  {
    id: 'qa-v2',
    kind: 'question',
    name: 'Modern question',
    about: 'A Components V2 card with the status under a divider.',
    message: v2Message(
      'Modern question',
      '#5865F2',
      '## ❓ {question.title}\n{question.body}\n{files}\n{separator}\n**Status:** {status} · **Category:** {question.category}\n-# Asked by {asker} · {question.id} · Answers go in {thread}',
      '{user.avatar}',
    ),
  },
  {
    id: 'qa-answer-card',
    kind: 'answer',
    name: 'Answer card',
    about: 'An embed with the answer and who wrote it.',
    message: embedMessage('Answer card', '', {
      author: 'Answered by {answered.by.name}',
      title: '✅ {question.title}',
      description: '{answer}',
      color: '#57F287',
      footer: 'Question {question.id}',
      timestamp: true,
    }),
  },
  {
    id: 'qa-answer-v2',
    kind: 'answer',
    name: 'Modern answer',
    about: 'A Components V2 card with the answer.',
    message: v2Message(
      'Modern answer',
      '#57F287',
      '### ✅ Answer\n{answer}\n{separator}\n-# {answered.by} answered {asker}’s question {question.id}',
    ),
  },
];

export const qaPresetsFor = (kind: 'question' | 'answer') =>
  qaPresets.filter((p) => p.kind === kind);

/** The messages Sparko sends until the server picks its own. */
export const qaDefaultMessage = () => qaPresets[0]!.message;
export const qaDefaultAnswer = () =>
  qaPresets.find((p) => p.id === 'qa-answer-card')!.message;

/** Sparko's own DM when a question is answered. */
export const qaDmDefault = (): StudioMessage =>
  embedMessage('Question answered', '', {
    title: 'Your question {question.id} was answered',
    description:
      '**{question.title}**\n\n{answer}\n\n— {answered.by}, {server}\nRead it in the thread: {thread}',
    color: '#57F287',
  });

/** Cuts text to a length, at a space where it can. */
export function qaShorten(text: string, max: number) {
  if (text.length <= max) return text;
  let cut = text.lastIndexOf(' ', max - 1);
  if (cut < max * 0.6) cut = max - 1;
  return `${text.slice(0, cut).trimEnd()}…`;
}

/**
 * What fills a question's variables. `full` gives the whole answer (in the
 * thread and the DM); the question message shows the start of it.
 */
export function qaVariables(
  c: Questions,
  q: QaQuestion,
  { full = false }: { full?: boolean } = {},
) {
  const files = q.files
    .map((f) => `[${f.name.replace(/[[\]]/g, '')}](${f.url})`)
    .join('\n');
  const answer = q.answer
    ? full
      ? q.answer.text
      : qaShorten(q.answer.text, qaAnswerShown)
    : '';
  const asker = c.anonymous ? 'Anonymous' : `<@${q.askerId}>`;
  const extra: Record<string, string> = {
    'question.title': q.title,
    'question.body': q.body,
    'question.id': `#${q.number}`,
    'question.category': qaCategoryName(c, q.category),
    status: qaStatusOf(q.status).name,
    answer,
    'answered.by': q.answer ? `<@${q.answer.byId}>` : '',
    'answered.by.name': q.answer?.byName ?? '',
    asker,
    'metoo.count': String(q.meToo),
    thread: q.threadId ? `<#${q.threadId}>` : '',
    files,
  };
  if (c.anonymous)
    Object.assign(extra, {
      user: 'Anonymous',
      'user.name': 'Anonymous',
      'user.id': '',
      'user.avatar': '',
    });
  return extra;
}

type Payload = Record<string, unknown> & {
  content?: string;
  embeds?: Record<string, unknown>[];
  components?: object[];
  allowed_mentions?: { parse: string[]; roles?: string[] };
};

const hexNumber = (h: string) => Number.parseInt(h.slice(1), 16);

/**
 * The fixed buttons under a question: Answer (for staff), Mark answered
 * (for the asker and staff) while it's open, and Me too when it's on.
 */
export function qaButtons(c: Questions, q: QaQuestion) {
  const open = q.status === 'open';
  const buttons: object[] = [
    {
      type: 2,
      style: open ? 3 : 2,
      custom_id: 'qa:answer',
      label: q.answer ? 'Change answer' : 'Answer',
      emoji: { name: '✍️' },
    },
  ];
  if (open)
    buttons.push({
      type: 2,
      style: 2,
      custom_id: 'qa:done',
      label: 'Mark answered',
      emoji: { name: '✅' },
    });
  if (c.meToo)
    buttons.push({
      type: 2,
      style: 1,
      custom_id: 'qa:metoo',
      label: q.meToo ? `Me too · ${q.meToo}` : 'Me too',
      emoji: { name: '🙋' },
      disabled: !open,
    });
  return [{ type: 1, components: buttons }];
}

/**
 * Discord's message body for a question: the template, its pictures, the
 * answer under it (unless the template shows {answer} itself), the ping and
 * the fixed buttons. Open questions keep the template's colour; others take
 * their status's.
 */
export function qaPayload(
  c: Questions,
  message: StudioMessage,
  q: QaQuestion,
  ctx: { now: number } & StudioVars,
  { buttons = true }: { buttons?: boolean } = {},
) {
  const extra = qaVariables(c, q);
  const user = c.anonymous
    ? undefined
    : { id: q.askerId, name: q.askerName, avatar: q.askerAvatar };
  const main = studioPayload(message, {
    ...ctx,
    user,
    extra: { ...ctx.extra, ...extra },
  }) as Payload;
  const pictures = q.files.filter((f) => f.kind !== 'file');
  const status = qaStatusOf(q.status);
  const colour = q.status === 'open' ? null : hexNumber(status.color);
  const answer = q.answer;
  // A template that shows the answer itself doesn't get the box as well.
  const showsAnswer = JSON.stringify(message).includes('{answer}');
  const answerText = answer
    ? qaShorten(answer.text, qaAnswerShown) +
      (answer.text.length > qaAnswerShown && q.threadId
        ? `\n-# Read the whole answer in <#${q.threadId}>`
        : '')
    : '';
  const fixed = buttons ? qaButtons(c, q) : [];
  if (message.layout === 'v2') {
    const container = (main.components ?? []).find(
      (x) => (x as { type: number }).type === 17,
    ) as { components: object[]; accent_color?: number } | undefined;
    if (container) {
      if (pictures.length)
        container.components.push({
          type: 12,
          items: pictures.slice(0, 10).map((f) => ({ media: { url: f.url } })),
        });
      if (colour !== null) container.accent_color = colour;
    }
    if (answer && !showsAnswer)
      main.components!.push({
        type: 17,
        accent_color: hexNumber(qaStatusOf('answered').color),
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `**Answered by ${answer.byName}**\n${answerText}`,
              },
            ],
            accessory: {
              type: 11,
              media: {
                url:
                  answer.byAvatar ||
                  'https://cdn.discordapp.com/embed/avatars/0.png',
              },
            },
          },
        ],
      });
    if (c.ping)
      main.components = [
        { type: 10, content: `<@&${c.ping}>` },
        ...(main.components ?? []),
      ];
    main.components!.push(...fixed);
  } else {
    const embed = main.embeds?.[0];
    if (embed) {
      if (!embed.image && pictures[0]?.kind === 'image')
        embed.image = { url: pictures[0].url };
      if (colour !== null) embed.color = colour;
    }
    if (answer && !showsAnswer)
      (main.embeds ??= []).push({
        author: {
          name: `Answered by ${answer.byName}`,
          ...(answer.byAvatar ? { icon_url: answer.byAvatar } : {}),
        },
        description: answerText,
        color: hexNumber(qaStatusOf('answered').color),
        timestamp: new Date(answer.at).toISOString(),
      });
    if (c.ping)
      main.content = `<@&${c.ping}>${main.content ? ` ${main.content}` : ''}`;
    main.components = [...(main.components ?? []), ...fixed];
  }
  // The ping is the only mention that notifies anyone.
  if (c.ping) main.allowed_mentions = { parse: [], roles: [c.ping] };
  return main;
}

/** The answer posted in a question's thread: the server's template or Sparko's own. */
export function qaAnswerPayload(
  c: Questions,
  message: StudioMessage | null,
  q: QaQuestion,
  ctx: { now: number } & StudioVars,
) {
  const extra = qaVariables(c, q, { full: true });
  const user = c.anonymous
    ? undefined
    : { id: q.askerId, name: q.askerName, avatar: q.askerAvatar };
  return studioPayload(message ?? qaDefaultAnswer(), {
    ...ctx,
    user,
    extra: { ...ctx.extra, ...extra },
  }) as Payload;
}

/** The DM to the asker once their question is answered. */
export function qaDmPayload(
  c: Questions,
  message: StudioMessage | null,
  q: QaQuestion,
  ctx: { now: number } & StudioVars,
) {
  const extra = qaVariables(c, q, { full: true });
  return studioPayload(message ?? qaDmDefault(), {
    ...ctx,
    user: { id: q.askerId, name: q.askerName, avatar: q.askerAvatar },
    extra: {
      ...ctx.extra,
      ...extra,
      // The DM goes to the asker, so it can say who they are.
      user: `<@${q.askerId}>`,
      'user.name': q.askerName,
      'user.id': q.askerId,
      'user.avatar': q.askerAvatar,
      asker: `<@${q.askerId}>`,
      // Mentions don't show well in DMs, so names are used.
      'answered.by': q.answer?.byName ?? '',
    },
  }) as Payload;
}

// Commands --------------------------------------------------------------------

/** The slash command a server's questions use, as Discord registers it. */
export function qaCommandBodies(c: Questions) {
  const number = (description: string) => ({
    type: 4,
    name: 'id',
    description,
    required: true,
    min_value: 1,
    autocomplete: true,
  });
  const options: Record<QaCommandKey, object[]> = {
    ask: [
      ...(c.categories.length
        ? [
            {
              type: 3,
              name: 'category',
              description: 'What your question is about',
              required: false,
              autocomplete: true,
            },
          ]
        : []),
      ...[1, 2, 3].map((n) => ({
        type: 11,
        name: n === 1 ? 'file' : `file${n}`,
        description:
          n === 1 ? 'A picture, video or file to add' : 'Another file to add',
        required: false,
      })),
    ],
    answer: [
      number('The question’s number'),
      {
        type: 3,
        name: 'text',
        description: 'Your answer',
        required: true,
        min_length: 2,
        max_length: qaAnswerMax,
      },
    ],
    close: [number('The question’s number')],
    reopen: [number('The question’s number')],
    delete: [number('The question’s number')],
  };
  const subs = qaCommandKeys.filter((k) => c.commands[k].on);
  if (!subs.length) return [];
  return [
    {
      type: 1,
      name: c.command.name,
      description: c.command.description,
      contexts: [0],
      options: subs.map((k) => ({
        type: 1,
        name: c.commands[k].name,
        description: c.commands[k].description,
        options: options[k],
      })),
    },
  ];
}

/** Which question subcommand a typed command is, in this server. */
export const qaCommandFor = (c: Questions, name: string, sub: string | null) =>
  name === c.command.name && sub
    ? qaCommandKeys.find((k) => c.commands[k].on && c.commands[k].name === sub)
    : undefined;

// Logs ------------------------------------------------------------------------

export type QaLogAction =
  | 'asked'
  | 'answered'
  | 'reanswered'
  | 'marked'
  | 'closed'
  | 'reopened'
  | 'expired'
  | 'deleted'
  | 'refused'
  | 'failed';
export type QaLogEntry = {
  id: string;
  action: QaLogAction;
  /** The question it's about, if any. */
  number: number | null;
  userId: string;
  userName: string;
  detail: string;
  at: number;
};

/** One log line, like "[ANSWERED] #4 answered by @rhea: …". */
export function qaLogLine(e: QaLogEntry) {
  const n = e.number === null ? '' : `#${e.number} `;
  const who = `@${e.userName}`;
  const more = e.detail ? `: ${e.detail}` : '';
  switch (e.action) {
    case 'asked':
      return `[ASKED] ${n}asked by ${who}${more}`;
    case 'answered':
      return `[ANSWERED] ${n}answered by ${who}${more}`;
    case 'reanswered':
      return `[RE-ANSWERED] ${n}answered again by ${who}${more}`;
    case 'marked':
      return `[MARKED ANSWERED] ${n}marked answered by ${who}`;
    case 'closed':
      return `[CLOSED] ${n}closed by ${who}${more}`;
    case 'reopened':
      return `[REOPENED] ${n}reopened by ${who}`;
    case 'expired':
      return `[EXPIRED] ${n}expired unanswered${more}`;
    case 'deleted':
      return `[DELETED] ${n}deleted by ${who}${more}`;
    case 'refused':
      return `[REFUSED] ${who} couldn’t ask${more}`;
    default:
      return `[FAILED] ${n}${e.detail}`;
  }
}
