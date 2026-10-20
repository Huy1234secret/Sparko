/**
 * Polls: staff (and members, if allowed) ask a question with 2 to 25
 * options, members vote with buttons or a menu, and the message shows the
 * results as they come in. The poll and its results are Message Studio
 * templates with the option buttons or menu under them. Nothing here
 * touches the database or the network, so the dashboard imports this file
 * too.
 */
import { parseDuration } from './auto-roles.ts';
import {
  componentRows,
  embedDefault,
  emojiPayload,
  studioPayload,
  v2Default,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';
import { commandName } from './suggestions.ts';

export const POLL_MODULE = 'polls';

export type PollStyle = 'buttons' | 'menu';
export type PollOption = { id: string; label: string; emoji: string };

/** How one poll votes, set when it's made. */
export type PollRules = {
  style: PollStyle;
  /** Nobody sees who voted what, not even staff. */
  anonymous: boolean;
  /** Members can pick more than one option. */
  multiple: boolean;
  /** Most options one member picks in a multiple-choice poll; 0 for any. */
  maxPicks: number;
  changeVotes: boolean;
  /** The message shows only the total until the poll ends. */
  hideResults: boolean;
  /** Only members with one of these roles can vote; [] for everyone. */
  roles: string[];
  /** Ends once this many members have voted; 0 is off. */
  voteTarget: number;
  /** A role pinged when it's posted; '' for none. */
  ping: string;
};

export type PollCommandKey = 'create' | 'end' | 'results' | 'voters';
export type PollCommand = { on: boolean; name: string; description: string };

/** What a new poll starts with, in the builder and with the slash command. */
export type PollDefaults = {
  style: PollStyle;
  anonymous: boolean;
  multiple: boolean;
  changeVotes: boolean;
  hideResults: boolean;
  /** How long polls run, like "1d"; '' for no end. */
  duration: string;
};

export type Polls = {
  /** Where polls are posted unless another channel is picked. */
  channel: string;
  /** Roles that can make, end and reroll polls; [] for Manage Server. */
  creators: string[];
  /** Members who aren't staff can make polls with the slash command. */
  members: boolean;
  /** Only members with this role can, when `members` is on; '' for all. */
  memberRole: string;
  defaults: PollDefaults;
  /** The role new polls ping; '' for none. */
  ping: string;
  /** The Studio template a poll is posted with; '' for Sparko's own. */
  message: string;
  /** The Studio template a poll turns into when it ends; '' for Sparko's own. */
  results: string;
  /** One command (/poll) with a subcommand for each job. */
  commands: {
    name: string;
    description: string;
    subs: Record<PollCommandKey, PollCommand>;
  };
};

export const pollCommandKeys: PollCommandKey[] = [
  'create',
  'end',
  'results',
  'voters',
];
export const pollCommandAbout: Record<PollCommandKey, string> = {
  create:
    'Opens a form for the question, the options (one per line) and how long it runs. Options choose anonymous, multiple choice and the channel.',
  end: 'Staff, or whoever made the poll, end it now. The message shows the final results.',
  results:
    'Shows a poll’s results privately. Hidden results stay hidden from members until it ends.',
  voters: 'Lists who voted for what, privately. Anonymous polls never say.',
};

export const pollDefaultCommands = (): Polls['commands'] => ({
  name: 'poll',
  description: 'Polls in this server',
  subs: {
    create: { on: true, name: 'create', description: 'Make a poll' },
    end: { on: true, name: 'end', description: 'End a poll now' },
    results: { on: true, name: 'results', description: 'See a poll’s results' },
    voters: { on: true, name: 'voters', description: 'See who voted for what' },
  },
});

export const pollDefault = (channel = ''): Polls => ({
  channel,
  creators: [],
  members: false,
  memberRole: '',
  defaults: {
    style: 'buttons',
    anonymous: false,
    multiple: false,
    changeVotes: true,
    hideResults: false,
    duration: '1d',
  },
  ping: '',
  message: '',
  results: '',
  commands: pollDefaultCommands(),
});

/** What each plan allows. */
export const pollLimits = (plan?: string | null) => ({
  options: plan === 'plus' ? 25 : 5,
  /** Polls posted or waiting to be posted at once. */
  active: plan === 'plus' ? 50 : 3,
});

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** The shortest and longest times. */
export const pollRanges = {
  duration: { min: MINUTE, max: 30 * DAY, label: '1mi and 1mt' },
  /** How far ahead a poll can be scheduled, or set to end. */
  ahead: 60 * DAY,
} as const;
export const pollLengths = { question: 300, option: 80, minOptions: 2 };
export const pollVoteTargetMax = 100_000;

let counter = 0;
export const pollOptionId = () =>
  `o${Date.now().toString(36)}${(counter++).toString(36)}`;

// Checks ----------------------------------------------------------------------

export type PollIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const itemId = /^[\w-]{1,40}$/;
const emojiOk = (e: unknown) =>
  typeof e === 'string' &&
  e.length <= 64 &&
  (!e || /^<a?:\w{1,32}:\d{1,25}>$/.test(e) || !/[<>:\s]/.test(e));

/**
 * Checks settings sent by the dashboard. `roles` are the server's roles and
 * `templates` its Studio templates. Returns the first problem, and where.
 */
export function pollsIssue(
  input: unknown,
  { roles, templates }: { roles?: Set<string>; templates?: Set<string> } = {},
): PollIssue | null {
  const x = input as Partial<Polls> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const at = (where: string, problem: string) => ({ at: where, problem });

  if (typeof x.channel !== 'string' || !snowflake.test(x.channel))
    return at('channel', 'Pick the channel polls are posted in.');
  if (!Array.isArray(x.creators)) return missing;
  if (x.creators.length > 25)
    return at('creators', 'Pick up to 25 roles for Who can make polls.');
  for (const id of x.creators) {
    if (typeof id !== 'string' || !snowflake.test(id)) return missing;
    if (roles && !roles.has(id))
      return at(
        'creators',
        'A role in Who can make polls was deleted. Pick another one.',
      );
  }
  if (typeof x.members !== 'boolean') return missing;
  for (const [k, what] of [
    ['memberRole', 'The members’ role'],
    ['ping', 'The ping role'],
  ] as const) {
    const v = x[k];
    if (typeof v !== 'string') return missing;
    if (v && !snowflake.test(v)) return missing;
    if (v && roles && !roles.has(v))
      return at(k, `${what} was deleted. Pick another one.`);
  }
  const d = x.defaults;
  if (!d || typeof d !== 'object') return missing;
  if (!['buttons', 'menu'].includes(d.style)) return missing;
  for (const k of [
    'anonymous',
    'multiple',
    'changeVotes',
    'hideResults',
  ] as const)
    if (typeof d[k] !== 'boolean') return missing;
  if (typeof d.duration !== 'string') return missing;
  if (d.duration.trim()) {
    const ms = parseDuration(d.duration);
    if (ms === null)
      return at(
        'duration',
        'Write the default length with mi, h, d, w or mt, like 1d.',
      );
    if (ms < pollRanges.duration.min || ms > pollRanges.duration.max)
      return at(
        'duration',
        `The default length has to be between ${pollRanges.duration.label}.`,
      );
  }
  for (const [k, what] of [
    ['message', 'poll'],
    ['results', 'results'],
  ] as const) {
    const v = x[k];
    if (typeof v !== 'string') return missing;
    if (v && !templateId.test(v)) return missing;
    if (v && templates && !templates.has(v))
      return at(
        k,
        `The ${what} message template was deleted. Pick or make another one.`,
      );
  }

  const c = x.commands;
  if (!c || typeof c !== 'object' || !c.subs) return missing;
  if (typeof c.name !== 'string' || !commandName.test(c.name))
    return at(
      'command:group',
      'Command names are 1 to 32 lowercase letters, numbers, - or _.',
    );
  if (
    typeof c.description !== 'string' ||
    !c.description.trim() ||
    c.description.length > 100
  )
    return at(
      'command:group',
      `Give /${c.name} a description of up to 100 characters.`,
    );
  const used = new Set<string>();
  for (const key of pollCommandKeys) {
    const cmd = c.subs[key];
    const where = `command:${key}`;
    if (!cmd || typeof cmd.on !== 'boolean') return missing;
    if (typeof cmd.name !== 'string' || !commandName.test(cmd.name))
      return at(
        where,
        'Command names are 1 to 32 lowercase letters, numbers, - or _.',
      );
    if (used.has(cmd.name))
      return at(where, `Two commands are called /${c.name} ${cmd.name}.`);
    used.add(cmd.name);
    if (
      typeof cmd.description !== 'string' ||
      !cmd.description.trim() ||
      cmd.description.length > 100
    )
      return at(
        where,
        `Give /${c.name} ${cmd.name} a description of up to 100 characters.`,
      );
  }
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export function cleanPolls(c: Polls): Polls {
  return {
    channel: c.channel,
    creators: [...new Set(c.creators)],
    members: c.members,
    memberRole: c.memberRole,
    defaults: {
      style: c.defaults.style,
      anonymous: c.defaults.anonymous,
      multiple: c.defaults.multiple,
      changeVotes: c.defaults.changeVotes,
      hideResults: c.defaults.hideResults,
      duration: c.defaults.duration.trim(),
    },
    ping: c.ping,
    message: c.message,
    results: c.results,
    commands: {
      name: c.commands.name,
      description: c.commands.description.trim(),
      subs: Object.fromEntries(
        pollCommandKeys.map((k) => [
          k,
          {
            on: c.commands.subs[k].on,
            name: c.commands.subs[k].name,
            description: c.commands.subs[k].description.trim(),
          },
        ]),
      ) as Record<PollCommandKey, PollCommand>,
    },
  };
}

/** Settings saved by an older version, with anything newer from the defaults. */
export function pollUpgrade(saved: Partial<Polls> | null | undefined): Polls {
  const base = pollDefault();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    defaults: { ...base.defaults, ...saved.defaults },
    commands: {
      ...base.commands,
      ...saved.commands,
      subs: { ...base.commands.subs, ...saved.commands?.subs },
    },
  };
}

// A new poll ------------------------------------------------------------------

/** How a poll ends: never, a while after it's posted, or at a set time. */
export type PollEnd =
  | { kind: 'none' }
  | { kind: 'after'; duration: string }
  | { kind: 'at'; at: number };

/** A poll as the builder or the slash command's form makes it. */
export type PollDraft = {
  question: string;
  options: PollOption[];
  channel: string;
  rules: PollRules;
  end: PollEnd;
  /** When to post it; null posts it now. */
  postAt: number | null;
};

/** A new poll's rules, from the server's defaults. */
export const pollRulesFrom = (c: Polls): PollRules => ({
  style: c.defaults.style,
  anonymous: c.defaults.anonymous,
  multiple: c.defaults.multiple,
  maxPicks: 0,
  changeVotes: c.defaults.changeVotes,
  hideResults: c.defaults.hideResults,
  roles: [],
  voteTarget: 0,
  ping: c.ping,
});

/** Rows the options take under the message: up to 5 buttons a row, or one menu. */
export const pollOptionRows = (style: PollStyle, options: number) =>
  style === 'menu' ? 1 : Math.ceil(options / 5);

/**
 * Discord shows 5 rows of buttons and menus. A classic message's own
 * buttons share them with the options.
 */
export function pollRowsIssue(
  message: StudioMessage | null,
  style: PollStyle,
  options: number,
): PollIssue | null {
  if (!message || message.layout === 'v2') return null;
  const own = componentRows(message.components).length;
  const need = pollOptionRows(style, options);
  if (own + need <= 5) return null;
  const fit = Math.max(0, 5 - own) * 5;
  return {
    at: 'style',
    problem:
      style === 'menu' || !fit
        ? `The poll message has ${own} rows of its own buttons, so there’s no room for the options. Remove some in Edit.`
        : `The poll message has ${own} ${own === 1 ? 'row' : 'rows'} of its own buttons, so up to ${fit} options fit as buttons. Use a menu, or fewer options.`,
  };
}

/**
 * Checks a new poll. `roles` and `channels` are the server's, and
 * `active` is how many polls are already posted or waiting.
 */
export function pollDraftIssue(
  input: unknown,
  {
    plan,
    now,
    active = 0,
    roles,
    channels,
  }: {
    plan?: string | null | undefined;
    now: number;
    active?: number;
    roles?: Set<string>;
    channels?: Set<string>;
  },
): PollIssue | null {
  const x = input as Partial<PollDraft> | null;
  const missing = { at: '', problem: 'Some of the poll is missing.' };
  if (!x || typeof x !== 'object') return missing;
  const at = (where: string, problem: string) => ({ at: where, problem });
  const limits = pollLimits(plan);
  if (active >= limits.active)
    return at(
      '',
      `This plan runs up to ${limits.active} polls at once. End or delete one first.`,
    );

  if (typeof x.question !== 'string' || !x.question.trim())
    return at('question', 'Write the question.');
  if (x.question.length > pollLengths.question)
    return at(
      'question',
      `The question is up to ${pollLengths.question} characters.`,
    );
  if (!Array.isArray(x.options)) return missing;
  if (x.options.length < pollLengths.minOptions)
    return at('options', 'Add at least 2 options.');
  if (x.options.length > limits.options)
    return at(
      'options',
      `This plan has up to ${limits.options} options in a poll.`,
    );
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const o of x.options) {
    if (!o || typeof o.id !== 'string' || !itemId.test(o.id)) return missing;
    if (ids.has(o.id)) return missing;
    ids.add(o.id);
    const where = `option:${o.id}`;
    if (typeof o.label !== 'string' || !o.label.trim())
      return at(where, 'Give every option a name.');
    if (o.label.length > pollLengths.option)
      return at(
        where,
        `An option’s name is up to ${pollLengths.option} characters.`,
      );
    const key = o.label.trim().toLowerCase();
    if (labels.has(key))
      return at(where, `Two options are called “${o.label.trim()}”.`);
    labels.add(key);
    if (!emojiOk(o.emoji)) return at(where, 'That emoji can’t be used.');
  }

  if (typeof x.channel !== 'string' || !snowflake.test(x.channel))
    return at('channel', 'Pick the channel to post the poll in.');
  if (channels && !channels.has(x.channel))
    return at('channel', 'Sparko can’t post in that channel. Pick another.');

  const r = x.rules;
  if (!r || typeof r !== 'object') return missing;
  if (!['buttons', 'menu'].includes(r.style)) return missing;
  for (const k of [
    'anonymous',
    'multiple',
    'changeVotes',
    'hideResults',
  ] as const)
    if (typeof r[k] !== 'boolean') return missing;
  if (
    !Number.isInteger(r.maxPicks) ||
    r.maxPicks < 0 ||
    r.maxPicks > x.options.length
  )
    return at(
      'maxPicks',
      `Members pick up to 0 (any) to ${x.options.length} options.`,
    );
  if (r.multiple && r.maxPicks === 1)
    return at(
      'maxPicks',
      'A multiple-choice poll lets members pick 2 or more. Pick 0 for any number, or turn multiple choice off.',
    );
  if (!Array.isArray(r.roles) || r.roles.length > 25)
    return at('roles', 'Pick up to 25 roles that can vote.');
  for (const id of r.roles) {
    if (typeof id !== 'string' || !snowflake.test(id)) return missing;
    if (roles && !roles.has(id))
      return at('roles', 'A role that can vote was deleted. Pick another.');
  }
  if (typeof r.ping !== 'string') return missing;
  if (r.ping && (!snowflake.test(r.ping) || (roles && !roles.has(r.ping))))
    return at('ping', 'The role to ping was deleted. Pick another.');
  if (
    !Number.isInteger(r.voteTarget) ||
    r.voteTarget < 0 ||
    r.voteTarget > pollVoteTargetMax
  )
    return at(
      'voteTarget',
      'End after votes is a whole number from 0 (off) to 100,000.',
    );

  if (x.postAt !== null && x.postAt !== undefined) {
    if (!Number.isFinite(x.postAt)) return missing;
    if (x.postAt < now - MINUTE)
      return at('postAt', 'The time to post it has passed. Pick a later one.');
    if (x.postAt > now + pollRanges.ahead)
      return at('postAt', 'Polls can be scheduled up to 60 days ahead.');
  } else if (x.postAt !== null) return missing;
  const start = Math.max(now, x.postAt ?? now);
  const e = x.end;
  if (!e || typeof e !== 'object') return missing;
  if (e.kind === 'after') {
    if (typeof e.duration !== 'string') return missing;
    const ms = parseDuration(e.duration);
    if (ms === null)
      return at('end', 'Write how long it runs with mi, h, d or w, like 1d.');
    if (ms < pollRanges.duration.min || ms > pollRanges.duration.max)
      return at(
        'end',
        `A poll runs between ${pollRanges.duration.label} (1 minute and 30 days).`,
      );
  } else if (e.kind === 'at') {
    if (!Number.isFinite(e.at)) return missing;
    if (e.at < start + MINUTE)
      return at('end', 'Pick an end time after the poll is posted.');
    if (e.at > start + pollRanges.ahead)
      return at('end', 'A poll can end up to 60 days after it’s posted.');
  } else if (e.kind !== 'none') return missing;
  return null;
}

/** Keeps only the known parts of a new poll, trimmed. */
export function cleanDraft(d: PollDraft): PollDraft {
  const r = d.rules;
  return {
    question: d.question.trim(),
    options: d.options.map((o) => ({
      id: o.id,
      label: o.label.trim(),
      emoji: o.emoji,
    })),
    channel: d.channel,
    rules: {
      style: r.style,
      anonymous: r.anonymous,
      multiple: r.multiple,
      maxPicks: r.multiple ? r.maxPicks : 1,
      changeVotes: r.changeVotes,
      hideResults: r.hideResults,
      roles: [...new Set(r.roles)],
      voteTarget: r.voteTarget,
      ping: r.ping,
    },
    end:
      d.end.kind === 'after'
        ? { kind: 'after', duration: d.end.duration.trim() }
        : d.end.kind === 'at'
          ? { kind: 'at', at: d.end.at }
          : { kind: 'none' },
    postAt: d.postAt,
  };
}

/**
 * "🍕 Pizza" → an option with its emoji. Options come one per line from
 * the slash command's form.
 */
export function parseOptionLines(text: string): PollOption[] {
  const lead =
    /^(<a?:\w{1,32}:\d{1,25}>|(?:\p{Regional_Indicator}{2})|(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:️|⃣|\p{Emoji_Modifier}|‍[\p{Extended_Pictographic}\p{Emoji_Presentation}]️?)*)|(?:[0-9#*]️?⃣))\s*(.*)$/u;
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '').trim())
    .filter(Boolean)
    .map((line, i) => {
      const m = lead.exec(line);
      return {
        id: `o${i + 1}`,
        emoji: m && m[2] ? m[1]! : '',
        label: (m && m[2] ? m[2] : line).trim(),
      };
    });
}

// Saved polls -----------------------------------------------------------------

export type PollStatus = 'scheduled' | 'active' | 'ended';
export type PollEndWhy = 'time' | 'votes' | 'staff';

/** A poll, as the bot, the server and the dashboard pass it around. */
export type Poll = {
  id: number;
  question: string;
  options: PollOption[];
  rules: PollRules;
  channelId: string;
  messageId: string | null;
  status: PollStatus;
  /** When it was posted, or will be. */
  postAt: number;
  endsAt: number | null;
  endedAt: number | null;
  endedWhy: PollEndWhy | null;
  /** Who ended it, when staff did. */
  endedBy: string;
  /** The option picked at random when staff rerolled a tie. */
  picked: string | null;
  authorId: string;
  authorName: string;
  createdAt: number;
  /** Votes for each option, by its id. */
  counts: Record<string, number>;
  /** How many members voted. */
  voters: number;
};

/** One member's votes on a poll. */
export type PollVoter = {
  userId: string;
  userName: string;
  picks: string[];
  at: number;
};

/** Each option's votes and share, and which options lead. */
export function pollResults(p: Poll) {
  const total = p.options.reduce((n, o) => n + (p.counts[o.id] ?? 0), 0);
  const rows = p.options.map((o) => {
    const count = p.counts[o.id] ?? 0;
    return {
      option: o,
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
    };
  });
  const best = Math.max(0, ...rows.map((r) => r.count));
  const winners = best ? rows.filter((r) => r.count === best) : [];
  return {
    rows,
    /** Votes cast; a multiple-choice voter can cast several. */
    total,
    winners: winners.map((r) => r.option),
    tie: winners.length > 1,
  };
}

/** "▰▰▰▰▰▰▱▱▱▱" for 60%. */
export const pollBar = (percent: number, width = 10) => {
  const full = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return '▰'.repeat(full) + '▱'.repeat(width - full);
};

const optionName = (o: PollOption) =>
  o.emoji ? `${o.emoji} ${o.label}` : o.label;

const list = (names: string[]) =>
  names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** Whether members can see the results yet. */
export const pollShowsResults = (p: Poll) =>
  p.status === 'ended' || !p.rules.hideResults;

/** The options as the message lists them, with bars once results show. */
export function pollOptionsText(p: Poll) {
  const { rows, winners } = pollResults(p);
  const show = pollShowsResults(p);
  const won = new Set(
    p.status === 'ended'
      ? p.picked
        ? [p.picked]
        : winners.map((o) => o.id)
      : [],
  );
  return rows
    .map((r) => {
      const name = `${won.has(r.option.id) ? '🏆 ' : ''}**${optionName(r.option)}**`;
      return show
        ? `${name}\n${pollBar(r.percent)} ${r.percent}% (${r.count})`
        : name;
    })
    .join('\n');
}

/** Who won: one option, a tie, or a tie staff rerolled. */
export function pollWinnerText(p: Poll) {
  const { winners, tie } = pollResults(p);
  if (!winners.length) return 'No votes';
  const picked = p.picked && p.options.find((o) => o.id === p.picked);
  if (picked)
    return `${optionName(picked)} (picked at random from a tie between ${list(winners.map(optionName))})`;
  return tie
    ? `Tie between ${list(winners.map(optionName))}`
    : optionName(winners[0]!);
}

export const pollStatusName = (p: Poll) =>
  p.status === 'ended'
    ? 'Ended'
    : p.status === 'scheduled'
      ? 'Scheduled'
      : 'Open';

const stamp = (at: number) => `<t:${Math.floor(at / 1000)}:R>`;

/** What fills a poll message's variables. */
export function pollVariables(p: Poll): Record<string, string> {
  return {
    'poll.question': p.question,
    'poll.options': pollOptionsText(p),
    'poll.id': `#${p.id}`,
    'votes.total': p.voters.toLocaleString('en-US'),
    'poll.ends':
      p.status === 'ended' && p.endedAt
        ? stamp(p.endedAt)
        : p.endsAt
          ? stamp(p.endsAt)
          : 'No end time',
    'poll.author': `<@${p.authorId}>`,
    'poll.winner': p.status === 'ended' ? pollWinnerText(p) : '',
    'poll.status': pollStatusName(p),
  };
}

// The message -----------------------------------------------------------------

const embedMessage = (
  name: string,
  embed: Partial<ReturnType<typeof embedDefault>>,
): StudioMessage => ({
  name,
  channel: '',
  layout: 'embed',
  content: '',
  embeds: [{ ...embedDefault(), ...embed }],
  components: [],
  v2: v2Default(),
});
const v2Message = (name: string, accent: string, text: string) => ({
  name,
  channel: '',
  layout: 'v2' as const,
  content: '',
  embeds: [],
  components: [],
  v2: { ...v2Default(), accent, text },
});

export type PollPreset = {
  id: string;
  name: string;
  about: string;
  message: StudioMessage;
};

/** Ready-made poll messages to start from. */
export const pollPresets: PollPreset[] = [
  {
    id: 'poll-card',
    name: 'Poll card',
    about: 'An embed with the question, the bars and when it ends.',
    message: embedMessage('Poll card', {
      author: '{user.name} asks',
      authorIcon: '{user.avatar}',
      title: '📊 {poll.question}',
      description: '{poll.options}',
      color: '#5865F2',
      fields: [
        { id: 'f1', name: 'Votes', value: '{votes.total}', inline: true },
        { id: 'f2', name: 'Ends', value: '{poll.ends}', inline: true },
      ],
      footer: 'Poll {poll.id}',
    }),
  },
  {
    id: 'poll-compact',
    name: 'Compact',
    about: 'Just the question and the options.',
    message: embedMessage('Compact poll', {
      title: '{poll.question}',
      description:
        '{poll.options}\n\n-# {votes.total} votes · ends {poll.ends}',
      color: '#FACC15',
    }),
  },
  {
    id: 'poll-v2',
    name: 'Modern poll',
    about: 'A Components V2 card with the details under a divider.',
    message: v2Message(
      'Modern poll',
      '#5865F2',
      '## 📊 {poll.question}\n{poll.options}\n{separator}\n**{votes.total}** votes · Ends {poll.ends}\n-# Poll {poll.id} by {poll.author}',
    ),
  },
];

/** Ready-made results messages, shown once a poll ends. */
export const pollResultPresets: PollPreset[] = [
  {
    id: 'poll-results',
    name: 'Results card',
    about: 'The final bars, the winner and how many voted.',
    message: embedMessage('Poll results', {
      author: '{user.name} asked',
      authorIcon: '{user.avatar}',
      title: '🏁 {poll.question}',
      description: '{poll.options}',
      color: '#57F287',
      fields: [
        { id: 'f1', name: 'Winner', value: '{poll.winner}', inline: false },
        { id: 'f2', name: 'Votes', value: '{votes.total}', inline: true },
        { id: 'f3', name: 'Ended', value: '{poll.ends}', inline: true },
      ],
      footer: 'Poll {poll.id} · {poll.status}',
    }),
  },
  {
    id: 'poll-results-compact',
    name: 'Compact results',
    about: 'The winner first, then the bars.',
    message: embedMessage('Compact results', {
      title: '🏆 {poll.winner}',
      description:
        '**{poll.question}**\n{poll.options}\n\n-# {votes.total} votes · ended {poll.ends}',
      color: '#FACC15',
    }),
  },
  {
    id: 'poll-results-v2',
    name: 'Modern results',
    about: 'A Components V2 card with the winner under a divider.',
    message: v2Message(
      'Modern results',
      '#57F287',
      '## 🏁 {poll.question}\n{poll.options}\n{separator}\n🏆 **{poll.winner}**\n-# {votes.total} votes · ended {poll.ends} · Poll {poll.id}',
    ),
  },
];

export const pollDefaultMessage = () => pollPresets[0]!.message;
export const pollDefaultResults = () => pollResultPresets[0]!.message;

/** Discord's buttons or menu for a poll's options; greyed out once it ends. */
export function pollComponents(p: Poll) {
  const ended = p.status === 'ended';
  const { winners } = pollResults(p);
  const won = new Set(
    ended ? (p.picked ? [p.picked] : winners.map((o) => o.id)) : [],
  );
  if (p.rules.style === 'menu') {
    const max = p.rules.multiple ? p.rules.maxPicks || p.options.length : 1;
    return [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: 'pl:m',
            disabled: ended,
            placeholder: ended
              ? 'This poll has ended'
              : p.rules.multiple
                ? max < p.options.length
                  ? `Pick up to ${max}`
                  : 'Pick any you like'
                : 'Pick one',
            min_values: 1,
            max_values: Math.min(max, p.options.length),
            options: p.options.map((o) => ({
              label: `${won.has(o.id) ? '🏆 ' : ''}${o.label}`.slice(0, 100),
              value: o.id,
              ...(o.emoji ? { emoji: emojiPayload(o.emoji) } : {}),
            })),
          },
        ],
      },
    ];
  }
  const rows: object[] = [];
  for (let i = 0; i < p.options.length; i += 5)
    rows.push({
      type: 1,
      components: p.options.slice(i, i + 5).map((o) => ({
        type: 2,
        style: won.has(o.id) ? 3 : 2,
        custom_id: `pl:v:${o.id}`,
        disabled: ended,
        label: o.label.slice(0, 80),
        ...(o.emoji ? { emoji: emojiPayload(o.emoji) } : {}),
      })),
    });
  return rows;
}

type Payload = Record<string, unknown> & {
  content?: string;
  components?: object[];
};

/**
 * Discord's message body for a poll: the poll template while it runs, the
 * results template once it ends, with the options under it. `post` lets
 * the ping role be pinged; edits never ping again.
 */
export function pollPayload(
  message: StudioMessage,
  p: Poll,
  ctx: { now: number; post?: boolean; avatar?: string } & StudioVars,
) {
  const main = studioPayload(message, {
    ...ctx,
    user: {
      id: p.authorId,
      name: p.authorName,
      ...(ctx.avatar ? { avatar: ctx.avatar } : {}),
    },
    extra: { ...ctx.extra, ...pollVariables(p) },
  }) as Payload;
  main.components = [...(main.components ?? []), ...pollComponents(p)];
  const ping = p.rules.ping;
  if (ping) {
    const mention = `<@&${ping}>`;
    if (main.flags)
      main.components = [{ type: 10, content: mention }, ...main.components];
    else main.content = `${mention} ${main.content ?? ''}`.trim();
    if (ctx.post) main.allowed_mentions = { parse: [], roles: [ping] };
  }
  return main;
}

/** What Sparko says privately after a vote. */
export function pollVoteReply(p: Poll, picks: string[], was: string[]) {
  if (!picks.length)
    return was.length ? 'Took your vote back.' : 'You haven’t voted yet.';
  const names = picks
    .map((id) => p.options.find((o) => o.id === id))
    .filter((o): o is PollOption => !!o)
    .map((o) => `**${optionName(o)}**`);
  const menu = p.rules.style === 'menu';
  const again = !p.rules.changeVotes
    ? ''
    : menu
      ? ' Pick again to change it.'
      : names.length > 1
        ? ' Press one again to take it back.'
        : ' Press again to take it back.';
  return `You voted ${list(names)}.${again}`;
}

// Who can do what -------------------------------------------------------------

/** Staff can make, end and reroll any poll. */
export const pollIsStaff = (c: Polls, member: Set<string>, manager: boolean) =>
  manager || c.creators.some((r) => member.has(r));

/** Why someone can't make a poll with the command, or null when they can. */
export function pollCanCreate(c: Polls, member: Set<string>, manager: boolean) {
  if (pollIsStaff(c, member, manager)) return null;
  if (!c.members)
    return c.creators.length
      ? `Only ${c.creators.map((r) => `<@&${r}>`).join(', ')} can make polls here.`
      : 'Only staff with Manage Server can make polls here.';
  if (c.memberRole && !member.has(c.memberRole))
    return `Only members with <@&${c.memberRole}> can make polls here.`;
  return null;
}

/** Why someone can't vote on a poll, or null when they can. */
export function pollCanVote(p: Poll, member: Set<string>) {
  if (p.status === 'scheduled') return 'This poll hasn’t started yet.';
  if (p.status === 'ended') return 'This poll has ended.';
  if (p.rules.roles.length && !p.rules.roles.some((r) => member.has(r)))
    return `Only ${p.rules.roles.map((r) => `<@&${r}>`).join(', ')} can vote on this poll.`;
  return null;
}

// Commands --------------------------------------------------------------------

/** The server's /poll command and its subcommands, as Discord registers them. */
export function pollCommandBodies(c: Polls) {
  const id = {
    type: 4,
    name: 'id',
    description: 'The poll’s number',
    required: true,
    min_value: 1,
    autocomplete: true,
  };
  const body: Record<PollCommandKey, object[]> = {
    create: [
      {
        type: 5,
        name: 'anonymous',
        description: 'Hide who voted for what',
        required: false,
      },
      {
        type: 5,
        name: 'multiple',
        description: 'Let members pick more than one option',
        required: false,
      },
      {
        type: 7,
        name: 'channel',
        description: 'Where to post it (the polls channel if empty)',
        required: false,
        channel_types: [0, 5],
      },
    ],
    end: [id],
    results: [id],
    voters: [id],
  };
  const subs = pollCommandKeys.filter((k) => c.commands.subs[k].on);
  if (!subs.length) return [];
  return [
    {
      type: 1,
      name: c.commands.name,
      description: c.commands.description,
      contexts: [0],
      options: subs.map((k) => ({
        type: 1,
        name: c.commands.subs[k].name,
        description: c.commands.subs[k].description,
        options: body[k],
      })),
    },
  ];
}

/** Which poll subcommand a typed command is, in this server. */
export const pollCommandFor = (c: Polls, name: string, sub: string | null) =>
  name === c.commands.name
    ? pollCommandKeys.find(
        (k) => c.commands.subs[k].on && c.commands.subs[k].name === sub,
      )
    : undefined;

// Votes as a file -------------------------------------------------------------

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * A poll's votes as CSV: one row per vote with who and when, or, for an
 * anonymous poll, only each option's total.
 */
export function pollCsv(p: Poll, voters: PollVoter[] | null) {
  const label = (id: string) => p.options.find((o) => o.id === id)?.label ?? id;
  const lines: (string | number)[][] = [];
  if (p.rules.anonymous || !voters) {
    lines.push(['Option', 'Votes']);
    for (const r of pollResults(p).rows) lines.push([r.option.label, r.count]);
  } else {
    lines.push(['User ID', 'Name', 'Option', 'Voted at']);
    for (const v of voters)
      for (const id of v.picks)
        lines.push([
          v.userId,
          v.userName,
          label(id),
          new Date(v.at).toISOString(),
        ]);
  }
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Logs ------------------------------------------------------------------------

export type PollLogAction =
  | 'created'
  | 'posted'
  | 'ended'
  | 'rerolled'
  | 'deleted'
  | 'failed';
export type PollLogEntry = {
  id: string;
  action: PollLogAction;
  /** The poll it's about. */
  poll: number | null;
  userId: string;
  userName: string;
  detail: string;
  at: number;
};

const whyText: Record<string, string> = {
  time: 'its time ran out',
  votes: 'it reached its votes',
  staff: 'ended early',
};

/** One log line, like "[ENDED] #4 by @rhea: ended early". */
export function pollLogLine(e: PollLogEntry) {
  const n = e.poll === null ? '' : `#${e.poll} `;
  const who = `@${e.userName}`;
  switch (e.action) {
    case 'created':
      return `[CREATED] ${n}by ${who}${e.detail ? `: ${e.detail}` : ''}`;
    case 'posted':
      return `[POSTED] ${n}${e.detail ? `in ${e.detail}` : 'posted'}`;
    case 'ended':
      return `[ENDED] ${n}${whyText[e.detail] ?? e.detail}${e.detail === 'staff' ? ` by ${who}` : ''}`;
    case 'rerolled':
      return `[REROLLED] ${n}tie rerolled by ${who}: ${e.detail}`;
    case 'deleted':
      return `[DELETED] ${n}deleted by ${who}${e.detail ? `: ${e.detail}` : ''}`;
    default:
      return `[FAILED] ${n}${e.detail}`;
  }
}
