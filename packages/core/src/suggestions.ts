/**
 * Suggestions: members suggest ideas with a slash command, everyone votes,
 * and staff give each one a status (Approved, Denied, or their own) with a
 * reason. The message is a Message Studio template with fixed vote buttons,
 * a menu or reactions under it. Nothing here touches the database or the
 * network, so the dashboard imports this file too.
 */
import { parseDuration } from './auto-roles.ts';
import {
  actionsProblem,
  componentRows,
  embedDefault,
  emojiPayload,
  hasVoteButtons,
  IS_COMPONENTS_V2,
  studioPayload,
  v2Default,
  type ButtonColour,
  type StudioAction,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';

export const SG_MODULE = 'suggestions';

export type SgVoteKind = 'reaction' | 'button' | 'menu';
/** The upvote or the downvote: a reaction, a button or a menu option. */
export type SgVoteOption = {
  emoji: string;
  /** A button's name, or a menu option's title. */
  label: string;
  /** A menu option's description. */
  description: string;
  colour: ButtonColour;
  /** What else a vote does, after counting it (buttons and menus only). */
  actions: StudioAction[];
};

/** What a status does when staff set it, from top to bottom. */
export type SgAction =
  | { id: string; type: 'approve' | 'deny' | 'close' | 'blacklist' }
  /** DMs the author a Studio template, or Sparko's own message for ''. */
  | { id: string; type: 'dm'; template: string };
export type SgActionType = SgAction['type'];

export type SgStatus = {
  /** "approved" and "denied" are built in; others are the server's own. */
  id: string;
  name: string;
  color: string;
  actions: SgAction[];
};

export type SgCommandKey = 'suggest' | 'status' | 'approve' | 'deny' | 'delete';
export type SgCommand = { on: boolean; name: string; description: string };

export type Suggestions = {
  /** Where suggestions are posted. */
  channel: string;
  /** Where staff check new suggestions before they're posted; '' for none. */
  review: string;
  /** Roles that may suggest; [] for everyone. */
  suggesters: string[];
  /** Members with this role can't suggest; '' for nobody. */
  blacklist: string;
  /** How old an account has to be, like "7d"; '' for any age. */
  minAge: string;
  /** Members with a role from `suggesters` don't need the account age. */
  bypassAge: boolean;
  /** Roles that can approve, deny and set statuses; [] for Manage Server. */
  approvers: string[];
  /** Roles that can delete suggestions; [] for Manage Server. */
  deleters: string[];
  vote: {
    kind: SgVoteKind;
    up: SgVoteOption;
    down: SgVoteOption;
    /** Which vote comes first, as people drag them. */
    first: 'up' | 'down';
    /** The menu's text before anything is picked. */
    placeholder: string;
  };
  changeVotes: boolean;
  selfVote: boolean;
  /** Opens a discussion thread on each suggestion. */
  threads: boolean;
  /** Hides who suggested it in the post; staff still see it here. */
  anonymous: boolean;
  /** Approved and Denied first, then the server's own. */
  statuses: SgStatus[];
  /** Upvotes that approve it on their own; 0 is off. */
  autoApprove: number;
  /** Downvotes that deny it on their own; 0 is off. */
  autoDeny: number;
  /** Closes voting after this long, like "14d"; '' never closes. */
  autoClose: string;
  /** Each vote starts the auto-close time again. */
  restartOnVote: boolean;
  /** Time between one member's suggestions, like "1h"; '' for none. */
  cooldown: string;
  /** Suggestions one member can have waiting at once; 0 for no limit. */
  maxPending: number;
  minLength: number;
  maxLength: number;
  /** Refuses a suggestion that's the same as one already posted. */
  duplicates: boolean;
  /** The Studio template that is the message; '' for Sparko's own. */
  message: string;
  commands: Record<SgCommandKey, SgCommand>;
};

export const sgCommandKeys: SgCommandKey[] = [
  'suggest',
  'status',
  'approve',
  'deny',
  'delete',
];
export const sgCommandAbout: Record<SgCommandKey, string> = {
  suggest:
    'Members suggest an idea. It opens a form for the title and the suggestion, and can take up to 3 files.',
  status:
    'Staff set any status on a suggestion by its number. Sparko asks for a reason first.',
  approve: 'Staff approve a suggestion by its number, with a reason.',
  deny: 'Staff deny a suggestion by its number, with a reason.',
  delete:
    'Staff with a delete role take a suggestion away, its message and its data.',
};

export const sgDefaultCommands = (): Record<SgCommandKey, SgCommand> => ({
  suggest: {
    on: true,
    name: 'suggest',
    description: 'Suggest an idea for the server',
  },
  status: {
    on: true,
    name: 'suggestion-status',
    description: 'Set the status of a suggestion',
  },
  approve: {
    on: true,
    name: 'suggestion-approve',
    description: 'Approve a suggestion',
  },
  deny: { on: true, name: 'suggestion-deny', description: 'Deny a suggestion' },
  delete: {
    on: true,
    name: 'suggestion-delete',
    description: 'Delete a suggestion',
  },
});

let counter = 0;
export const sgId = () =>
  `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export const sgBuiltIn = (): SgStatus[] => [
  {
    id: 'approved',
    name: 'Approved',
    color: '#57F287',
    actions: [
      { id: 'a1', type: 'approve' },
      { id: 'a2', type: 'dm', template: '' },
    ],
  },
  {
    id: 'denied',
    name: 'Denied',
    color: '#ED4245',
    actions: [
      { id: 'a1', type: 'deny' },
      { id: 'a2', type: 'dm', template: '' },
    ],
  },
];

export const sgDefault = (channel = ''): Suggestions => ({
  channel,
  review: '',
  suggesters: [],
  blacklist: '',
  minAge: '',
  bypassAge: true,
  approvers: [],
  deleters: [],
  vote: {
    kind: 'button',
    up: {
      emoji: '👍',
      label: 'Upvote',
      description: '',
      colour: 'green',
      actions: [],
    },
    down: {
      emoji: '👎',
      label: 'Downvote',
      description: '',
      colour: 'red',
      actions: [],
    },
    first: 'up',
    placeholder: 'Vote on this suggestion',
  },
  changeVotes: true,
  selfVote: false,
  threads: false,
  anonymous: false,
  statuses: sgBuiltIn(),
  autoApprove: 0,
  autoDeny: 0,
  autoClose: '',
  restartOnVote: false,
  cooldown: '',
  maxPending: 0,
  minLength: 10,
  maxLength: 5000,
  duplicates: true,
  message: '',
  commands: sgDefaultCommands(),
});

/** What each plan allows. Every suggestion uses 4 KB of the server's storage. */
export const sgLimits = (plan?: string | null) => {
  const storageMb = plan === 'plus' ? 100 : 10;
  const perKb = 4;
  return {
    statuses: plan === 'plus' ? 20 : 6,
    actions: 5,
    storageMb,
    perKb,
    suggestions: Math.floor((storageMb * 1024) / perKb),
  };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The shortest and longest each time can be. */
export const sgRanges = {
  minAge: { min: DAY, max: 365 * DAY, label: '1d and 1y' },
  autoClose: { min: MINUTE, max: 30 * DAY, label: '1mi and 1mt' },
  cooldown: { min: HOUR, max: 30 * DAY, label: '1h and 1mt' },
} as const;
export const sgLengths = { min: 0, max: 12000, maxFloor: 100 } as const;
export const sgVotesMax = 10000;

// Checks ----------------------------------------------------------------------

export type SgIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const itemId = /^[\w-]{1,40}$/;
const hexColour = /^#[0-9a-f]{6}$/i;
/** Discord's rule for command names, kept to plain letters. */
export const commandName = /^[a-z0-9_-]{1,32}$/;
const actionTypes = new Set<SgActionType>([
  'approve',
  'deny',
  'close',
  'dm',
  'blacklist',
]);

/**
 * Checks settings sent by the dashboard. `roles` maps a role's id to
 * whether Sparko can give it; `templates` are the server's Studio
 * templates. Returns the first problem, and where it is.
 */
export function sgIssue(
  input: unknown,
  {
    roles,
    templates,
    plan,
  }: {
    roles?: Map<string, boolean>;
    templates?: Set<string>;
    plan?: string | null | undefined;
  } = {},
): SgIssue | null {
  const x = input as Partial<Suggestions> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const limits = sgLimits(plan);
  const at = (where: string, problem: string) => ({ at: where, problem });

  if (typeof x.channel !== 'string' || !snowflake.test(x.channel))
    return at('channel', 'Pick the channel suggestions are posted in.');
  if (typeof x.review !== 'string') return missing;
  if (x.review && !snowflake.test(x.review))
    return at('review', 'Pick a review channel, or none.');
  if (x.review && x.review === x.channel)
    return at(
      'review',
      'The review channel has to be another channel than the suggestions channel.',
    );

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
    roleList(x.suggesters, 'suggesters', 'Who can suggest') ??
    roleList(x.approvers, 'approvers', 'Who can approve or deny') ??
    roleList(x.deleters, 'deleters', 'Who can delete');
  if (roleIssue) return roleIssue;
  if (typeof x.blacklist !== 'string') return missing;
  if (x.blacklist) {
    if (!snowflake.test(x.blacklist)) return missing;
    if (roles && !roles.has(x.blacklist))
      return at('blacklist', 'The blacklisted role was deleted. Pick another.');
    if (x.suggesters!.includes(x.blacklist))
      return at(
        'blacklist',
        'The blacklisted role is also allowed to suggest. Pick one or the other.',
      );
    // A status that blacklists gives this role, so Sparko has to be able to.
    const gives = x.statuses?.some((s) =>
      s?.actions?.some((a) => a?.type === 'blacklist'),
    );
    if (gives && roles?.get(x.blacklist) === false)
      return at(
        'blacklist',
        'A status blacklists members, but Sparko can’t give the blacklisted role. Move Sparko’s role above it.',
      );
  }

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
      return at(where, `Write ${what} with mi, h, d, w, mt or y, like 7d.`);
    if (ms < range.min || ms > range.max)
      return at(where, `${what} has to be between ${range.label}.`);
    return null;
  };
  const timeIssue =
    duration(x.minAge, 'minAge', sgRanges.minAge, 'The account age') ??
    duration(x.autoClose, 'autoClose', sgRanges.autoClose, 'Auto-close') ??
    duration(x.cooldown, 'cooldown', sgRanges.cooldown, 'The cooldown');
  if (timeIssue) return timeIssue;

  for (const k of [
    'bypassAge',
    'changeVotes',
    'selfVote',
    'threads',
    'anonymous',
    'restartOnVote',
    'duplicates',
  ] as const)
    if (typeof x[k] !== 'boolean') return missing;

  // Voting.
  const v = x.vote;
  if (!v || !['reaction', 'button', 'menu'].includes(v.kind)) return missing;
  if (!['up', 'down'].includes(v.first)) return missing;
  for (const [o, name] of [
    [v.up, 'upvote'],
    [v.down, 'downvote'],
  ] as const) {
    if (!o || typeof o !== 'object') return missing;
    if (
      typeof o.emoji !== 'string' ||
      typeof o.label !== 'string' ||
      typeof o.description !== 'string' ||
      !['blurple', 'grey', 'green', 'red'].includes(o.colour)
    )
      return missing;
    if (o.emoji.length > 80)
      return at('vote', `The ${name} emoji is too long.`);
    // The vote itself is the first action; up to 9 more follow it.
    if (!Array.isArray(o.actions) || o.actions.length > 9)
      return at('vote', `The ${name} does up to 9 more things.`);
    if (o.actions.some((a) => a?.type === 'suggestion'))
      return at('vote', `The ${name} already votes; add other actions.`);
    const actions = actionsProblem(o.actions, 'vote');
    if (actions) return at('vote', `The ${name}: ${actions.problem}`);
    if (v.kind === 'reaction' && !o.emoji)
      return at('vote', `Pick an emoji for the ${name}.`);
    if (v.kind === 'button') {
      if (!o.emoji && !o.label.trim())
        return at('vote', `Give the ${name} button a name or an emoji.`);
      if (o.label.length > 80)
        return at('vote', `The ${name} button’s name is up to 80 characters.`);
    }
    if (v.kind === 'menu') {
      if (!o.label.trim() || o.label.length > 100)
        return at('vote', `Give the ${name} option a title of up to 100.`);
      if (o.description.length > 100)
        return at('vote', `The ${name} option’s description is up to 100.`);
    }
  }
  if (v.kind === 'reaction' && v.up.emoji === v.down.emoji)
    return at('vote', 'The upvote and downvote need different emojis.');
  if (typeof v.placeholder !== 'string' || v.placeholder.length > 150)
    return at('vote', 'The menu text is up to 150 characters.');

  // Statuses.
  const statuses = x.statuses;
  if (!Array.isArray(statuses) || statuses.length < 2) return missing;
  if (statuses.length > limits.statuses)
    return at('statuses', `This plan has up to ${limits.statuses} statuses.`);
  if (statuses[0]?.id !== 'approved' || statuses[1]?.id !== 'denied')
    return missing;
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const s of statuses) {
    if (!s || typeof s.id !== 'string' || !itemId.test(s.id)) return missing;
    if (ids.has(s.id)) return missing;
    ids.add(s.id);
    const where = `status:${s.id}`;
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (!name || name.length > 25)
      return at(where, 'Give each status a name of up to 25 characters.');
    if (['pending', 'review'].includes(name.toLowerCase()))
      return at(where, `“${name}” is used by Sparko. Pick another name.`);
    if (names.has(name.toLowerCase()))
      return at(where, `Two statuses are called “${name}”.`);
    names.add(name.toLowerCase());
    if (typeof s.color !== 'string' || !hexColour.test(s.color))
      return at(where, `Pick a colour for “${name}”.`);
    if (!Array.isArray(s.actions)) return missing;
    if (s.actions.length > limits.actions)
      return at(where, `A status has up to ${limits.actions} actions.`);
    for (const a of s.actions) {
      if (!a || typeof a.id !== 'string' || !itemId.test(a.id)) return missing;
      if (!actionTypes.has(a.type)) return missing;
      if (a.type === 'dm') {
        if (typeof a.template !== 'string') return missing;
        if (a.template && !templateId.test(a.template)) return missing;
        if (a.template && templates && !templates.has(a.template))
          return at(
            where,
            `A message “${name}” DMs was deleted. Pick another one.`,
          );
      }
      if (a.type === 'blacklist' && !x.blacklist)
        return at(
          where,
          `“${name}” blacklists the member, so pick a blacklisted role.`,
        );
    }
    const has = (t: SgActionType) => s.actions.some((a) => a.type === t);
    if (has('approve') && has('deny'))
      return at(where, `“${name}” can’t both approve and deny.`);
    if (s.id === 'approved' && !has('approve')) return missing;
    if (s.id === 'denied' && !has('deny')) return missing;
  }

  // Automatic approving, denying and closing.
  for (const [k, what] of [
    ['autoApprove', 'Auto-approve'],
    ['autoDeny', 'Auto-deny'],
  ] as const) {
    const n = x[k];
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > sgVotesMax)
      return at(k, `${what} has to be a whole number from 0 to 10,000.`);
  }

  // Limits.
  if (
    !Number.isInteger(x.maxPending) ||
    x.maxPending! < 0 ||
    x.maxPending! > 10
  )
    return at('maxPending', 'Max pending suggestions is 0 (no limit) to 10.');
  if (
    !Number.isInteger(x.maxLength) ||
    x.maxLength! < sgLengths.maxFloor ||
    x.maxLength! > sgLengths.max
  )
    return at('length', 'The longest suggestion is 100 to 12,000 characters.');
  if (
    !Number.isInteger(x.minLength) ||
    x.minLength! < 0 ||
    x.minLength! > x.maxLength!
  )
    return at(
      'length',
      'The shortest suggestion has to be 0 or more, and no more than the longest.',
    );

  if (typeof x.message !== 'string') return missing;
  if (x.message && !templateId.test(x.message)) return missing;
  if (x.message && templates && !templates.has(x.message))
    return at(
      'message',
      'The suggestion message template was deleted. Pick or make another one.',
    );

  // Commands.
  const c = x.commands;
  if (!c || typeof c !== 'object') return missing;
  const used = new Set<string>();
  for (const key of sgCommandKeys) {
    const cmd = c[key];
    const where = `command:${key}`;
    if (!cmd || typeof cmd.on !== 'boolean') return missing;
    if (typeof cmd.name !== 'string' || !commandName.test(cmd.name))
      return at(
        where,
        'Command names are 1 to 32 lowercase letters, numbers, - or _.',
      );
    if (used.has(cmd.name))
      return at(where, `Two commands are called /${cmd.name}.`);
    used.add(cmd.name);
    if (
      typeof cmd.description !== 'string' ||
      !cmd.description.trim() ||
      cmd.description.length > 100
    )
      return at(where, `Give /${cmd.name} a description of up to 100.`);
  }
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export function cleanSuggestions(c: Suggestions): Suggestions {
  const option = (o: SgVoteOption): SgVoteOption => ({
    emoji: o.emoji,
    label: o.label.trim(),
    description: o.description.trim(),
    colour: o.colour,
    actions: structuredClone(o.actions),
  });
  return {
    channel: c.channel,
    review: c.review,
    suggesters: [...new Set(c.suggesters)],
    blacklist: c.blacklist,
    minAge: c.minAge.trim(),
    bypassAge: c.bypassAge,
    approvers: [...new Set(c.approvers)],
    deleters: [...new Set(c.deleters)],
    vote: {
      kind: c.vote.kind,
      up: option(c.vote.up),
      down: option(c.vote.down),
      first: c.vote.first,
      placeholder: c.vote.placeholder.trim(),
    },
    changeVotes: c.changeVotes,
    selfVote: c.selfVote,
    threads: c.threads,
    anonymous: c.anonymous,
    statuses: c.statuses.map((s) => ({
      id: s.id,
      name: s.name.trim(),
      color: s.color.toUpperCase(),
      actions: s.actions.map((a) =>
        a.type === 'dm'
          ? { id: a.id, type: 'dm', template: a.template }
          : { id: a.id, type: a.type },
      ),
    })),
    autoApprove: c.autoApprove,
    autoDeny: c.autoDeny,
    autoClose: c.autoClose.trim(),
    restartOnVote: c.restartOnVote,
    cooldown: c.cooldown.trim(),
    maxPending: c.maxPending,
    minLength: c.minLength,
    maxLength: c.maxLength,
    duplicates: c.duplicates,
    message: c.message,
    commands: Object.fromEntries(
      sgCommandKeys.map((k) => [
        k,
        {
          on: c.commands[k].on,
          name: c.commands[k].name,
          description: c.commands[k].description.trim(),
        },
      ]),
    ) as Record<SgCommandKey, SgCommand>,
  };
}

/**
 * Settings saved by an older version, with anything added since filled in
 * from the defaults.
 */
export function sgUpgrade(saved: Partial<Suggestions> | null | undefined) {
  const base = sgDefault();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    vote: {
      ...base.vote,
      ...saved.vote,
      up: { ...base.vote.up, ...saved.vote?.up },
      down: { ...base.vote.down, ...saved.vote?.down },
    },
    commands: { ...base.commands, ...saved.commands },
  } as Suggestions;
}

/**
 * Problems with a suggestion message template: one embed or container and
 * no pictures. Its own buttons and menus sit above the vote buttons.
 */
export function sgMessageIssue(m: StudioMessage): SgIssue | null {
  if (
    m.layout !== 'v2' &&
    !hasVoteButtons(m) &&
    componentRows(m.components).length > 4
  )
    return {
      at: 'message',
      problem:
        'The vote buttons take one of Discord’s five rows, so a suggestion message has up to 4 rows of its own.',
    };
  if (m.layout === 'v2') {
    if (m.v2.gallery.length)
      return {
        at: 'message',
        problem:
          'Suggestion messages can’t have pictures. Members’ files are shown with {files}.',
      };
    return null;
  }
  if (m.embeds.length !== 1)
    return { at: 'message', problem: 'A suggestion message has one embed.' };
  if (m.embeds[0]!.image)
    return {
      at: 'message',
      problem:
        'Suggestion messages can’t have a picture. Members’ files are shown with {files}.',
    };
  return null;
}

// Who can do what -------------------------------------------------------------

/** What Sparko knows about someone suggesting. */
export type SgAuthorFacts = {
  roles: Set<string>;
  /** When their Discord account was made. */
  created: number;
  /** Their suggestions still waiting for a status. */
  pending: number;
  /** When they last suggested, if ever. */
  lastAt: number | null;
};

/** Why someone can't suggest right now, or null when they can. */
export function sgCanSuggest(c: Suggestions, f: SgAuthorFacts, now: number) {
  if (c.blacklist && f.roles.has(c.blacklist))
    return 'You can’t make suggestions in this server.';
  const listed = c.suggesters.some((r) => f.roles.has(r));
  if (c.suggesters.length && !listed)
    return `Only ${c.suggesters.map((r) => `<@&${r}>`).join(', ')} can make suggestions here.`;
  const age = parseDuration(c.minAge);
  if (age && !(c.bypassAge && c.suggesters.length && listed)) {
    if (now - f.created < age)
      return `Your Discord account has to be at least ${c.minAge} old to suggest here.`;
  }
  const cooldown = parseDuration(c.cooldown);
  if (cooldown && f.lastAt !== null && now - f.lastAt < cooldown)
    return `You can suggest again <t:${Math.ceil((f.lastAt + cooldown) / 1000)}:R>.`;
  if (c.maxPending && f.pending >= c.maxPending)
    return `You already have ${f.pending} ${f.pending === 1 ? 'suggestion' : 'suggestions'} waiting. Wait for staff to look at ${f.pending === 1 ? 'it' : 'them'} first.`;
  return null;
}

/** Why the text can't be posted, or null when it can. */
export function sgLengthProblem(c: Suggestions, text: string) {
  const n = text.trim().length;
  if (n < Math.max(1, c.minLength))
    return `Suggestions here are at least ${Math.max(1, c.minLength)} characters. Yours is ${n}.`;
  if (n > c.maxLength)
    return `Suggestions here are up to ${c.maxLength.toLocaleString('en-US')} characters. Yours is ${n.toLocaleString('en-US')}.`;
  return null;
}

/**
 * Whether someone may use a staff power. With no roles picked, only people
 * who can manage the server may.
 */
export const sgAllowed = (
  roles: string[],
  member: Set<string>,
  manager: boolean,
) => manager || roles.some((r) => member.has(r));

/** The same text written differently still counts as the same suggestion. */
export const sgDuplicateKey = (title: string, body: string) =>
  `${title}\n${body}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// Votes and statuses ----------------------------------------------------------

const signed = (n: number, unit = '') =>
  n > 0 ? `+${n}${unit}` : n < 0 ? `${n}${unit}` : `±0${unit}`;

/** `100 | 120 - -20` and `45% | 55% - -5%`. */
export function voteRatio(up: number, down: number) {
  const total = up + down;
  const upPercent = total ? Math.round((up / total) * 100) : 50;
  const downPercent = 100 - upPercent;
  return {
    amount: `\`${up} | ${down} - ${signed(up - down)}\``,
    percent: `\`${upPercent}% | ${downPercent}% - ${signed(upPercent - 50, '%')}\``,
    upPercent,
  };
}

/** Green when it's liked, yellow when it's even, red when it isn't. */
export function sgRatioColour(up: number, down: number) {
  const total = up + down;
  const share = total ? up / total : 0.5;
  return `hsl(${Math.round(share * 120)} 70% 45%)`;
}

export type SgFile = {
  name: string;
  url: string;
  kind: 'image' | 'video' | 'file';
};

/** A suggestion, as the bot, the server and the dashboard pass it around. */
export type SgSuggestion = {
  number: number;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  body: string;
  files: SgFile[];
  /** "review" while staff check it, "open" until a status is set. */
  status: string;
  closed: boolean;
  up: number;
  down: number;
  channelId: string | null;
  messageId: string | null;
  threadId: string | null;
  reason: {
    text: string;
    byId: string;
    byName: string;
    byAvatar: string;
    at: number;
  } | null;
  createdAt: number;
  lastAt: number;
};

export const sgStatusOf = (c: Suggestions, id: string) =>
  c.statuses.find((s) => s.id === id);

/** A status's name as members see it. */
export function sgStatusName(c: Suggestions, s: { status: string }) {
  if (s.status === 'review') return 'Waiting for review';
  if (s.status === 'open') return 'Pending';
  return sgStatusOf(c, s.status)?.name ?? 'Updated';
}

/** Finds a status by its name or id, as staff type it in a command. */
export function sgFindStatus(c: Suggestions, typed: string) {
  const t = typed.trim().toLowerCase();
  return c.statuses.find((s) => s.id === t || s.name.toLowerCase() === t);
}

/** Whether a status counts as approved, denied, or neither. */
export function sgOutcome(st: SgStatus | undefined) {
  if (!st) return null;
  if (st.actions.some((a) => a.type === 'approve')) return 'approved' as const;
  if (st.actions.some((a) => a.type === 'deny')) return 'denied' as const;
  return null;
}

// The message -----------------------------------------------------------------

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

export type SgPreset = {
  id: string;
  name: string;
  about: string;
  message: StudioMessage;
};

/** Ready-made suggestion messages to start from. */
export const sgPresets: SgPreset[] = [
  {
    id: 'sg-card',
    name: 'Suggestion card',
    about: 'An embed with the author, status and votes.',
    message: embedMessage('Suggestion card', '', {
      author: '{user.name}',
      authorIcon: '{user.avatar}',
      title: '💡 {suggestion.title}',
      description: '{user.suggestion}\n\n{files}',
      color: '#FACC15',
      fields: [
        { id: 'f1', name: 'Status', value: '{status}', inline: true },
        { id: 'f2', name: 'Votes', value: '{vote.ratio.amount}', inline: true },
      ],
      footer: 'Suggestion {suggestion.id}',
      timestamp: true,
    }),
  },
  {
    id: 'sg-compact',
    name: 'Compact',
    about: 'Just the idea, with the details in the footer.',
    message: embedMessage('Compact suggestion', '', {
      title: '{suggestion.title}',
      description: '{user.suggestion}\n{files}',
      color: '#5865F2',
      footer:
        '{suggestion.id} · {user.name} · {status} · {upvotes} up, {downvotes} down',
    }),
  },
  {
    id: 'sg-v2',
    name: 'Modern suggestion',
    about: 'A Components V2 card with the votes under a divider.',
    message: v2Message(
      'Modern suggestion',
      '#FACC15',
      '## 💡 {suggestion.title}\n{user.suggestion}\n{files}\n{separator}\n**Status:** {status}\n**Votes:** {vote.ratio.amount}\n-# Suggested by {user} · {suggestion.id}',
      '{user.avatar}',
    ),
  },
  {
    id: 'sg-percent',
    name: 'Poll style',
    about: 'Shows the votes as percentages.',
    message: embedMessage('Poll-style suggestion', '', {
      author: 'New suggestion from {user.name}',
      authorIcon: '{user.avatar}',
      title: '{suggestion.title}',
      description: '{user.suggestion}\n\n{files}',
      color: '#57F287',
      fields: [
        {
          id: 'f1',
          name: 'Votes',
          value: '{vote.ratio.percent}',
          inline: false,
        },
        { id: 'f2', name: 'Status', value: '{status}', inline: false },
      ],
      footer: '{suggestion.id}',
    }),
  },
];

/** The message Sparko sends until the server picks its own. */
export const sgDefaultMessage = () => sgPresets[0]!.message;

/** Sparko's own DM when a status is set, for "DM user" without a template. */
export const sgDmDefault = (color: string): StudioMessage =>
  embedMessage('Status update', '', {
    title: 'Your suggestion {suggestion.id} is now {status}',
    description:
      '**{suggestion.title}**\n\n**Reason:** {reason}\n\n— {staff}, {server}',
    color,
  });

/** Cuts long text at a line or a space near the limit. */
export function sgChunks(text: string, first: number, rest: number) {
  const out: string[] = [];
  let left = text;
  let size = first;
  while (left.length > size) {
    let cut = left.lastIndexOf('\n', size);
    if (cut < size * 0.6) cut = left.lastIndexOf(' ', size);
    if (cut < size * 0.6) cut = size;
    out.push(left.slice(0, cut).trimEnd());
    left = left.slice(cut).trimStart();
    size = rest;
  }
  out.push(left);
  return out;
}

const hexNumber = (h: string) => Number.parseInt(h.slice(1), 16);

/** The upvote and downvote, in the order people put them. */
export const sgVoteOrder = <T>(
  v: { first: 'up' | 'down' },
  pair: readonly [T, T],
) => (v.first === 'down' ? [pair[1], pair[0]] : [pair[0], pair[1]]);

/** Discord's vote buttons or menu for a suggestion. */
export function sgVoteComponents(c: Suggestions, closed: boolean) {
  const v = c.vote;
  if (v.kind === 'reaction') return [];
  const style = { blurple: 1, grey: 2, green: 3, red: 4 } as const;
  if (v.kind === 'button')
    return [
      {
        type: 1,
        components: sgVoteOrder(v, [
          ['sg:up', v.up],
          ['sg:down', v.down],
        ] as const).map(([id, o]) => ({
          type: 2,
          style: style[o.colour],
          custom_id: id,
          disabled: closed,
          ...(o.label ? { label: o.label } : {}),
          ...(o.emoji ? { emoji: emojiPayload(o.emoji) } : {}),
        })),
      },
    ];
  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: 'sg:vote',
          disabled: closed,
          placeholder: (closed ? 'Voting is closed' : v.placeholder) || 'Vote',
          min_values: 1,
          max_values: 1,
          options: sgVoteOrder(v, [
            ['up', v.up],
            ['down', v.down],
          ] as const).map(([value, o]) => ({
            label: o.label || (value === 'up' ? 'Upvote' : 'Downvote'),
            value,
            ...(o.description ? { description: o.description } : {}),
            ...(o.emoji ? { emoji: emojiPayload(o.emoji) } : {}),
          })),
        },
      ],
    },
  ];
}

/** Each part of a long suggestion, and what fills the message's variables. */
export function sgVariables(
  c: Suggestions,
  s: SgSuggestion,
  layout: 'embed' | 'v2',
) {
  const parts = sgChunks(s.body, layout === 'v2' ? 2800 : 3400, 3800);
  const ratio = voteRatio(s.up, s.down);
  const files = s.files
    .map((f) => `[${f.name.replace(/[[\]]/g, '')}](${f.url})`)
    .join('\n');
  const status = sgStatusName(c, s) + (s.closed ? ' (closed)' : '');
  const extra: Record<string, string> = {
    'user.suggestion': parts[0]!,
    'suggestion.title': s.title,
    'suggestion.id': `#${s.number}`,
    status,
    'vote.ratio.amount': ratio.amount,
    'vote.ratio.percent': ratio.percent,
    upvotes: String(s.up),
    downvotes: String(s.down),
    files,
  };
  if (c.anonymous)
    Object.assign(extra, {
      user: 'Anonymous',
      'user.name': 'Anonymous',
      'user.id': '',
      'user.avatar': '',
    });
  return { parts, extra };
}

type Payload = Record<string, unknown> & {
  embeds?: Record<string, unknown>[];
  components?: object[];
};

/**
 * Discord's message bodies for a suggestion: the message itself, with its
 * pictures, the status box and the vote buttons, then one more message for
 * each part of a suggestion too long for the first.
 */
export function sgPayloads(
  c: Suggestions,
  message: StudioMessage,
  s: SgSuggestion,
  ctx: { now: number } & StudioVars,
) {
  const { parts, extra } = sgVariables(c, s, message.layout);
  const user = c.anonymous
    ? undefined
    : { id: s.authorId, name: s.authorName, avatar: s.authorAvatar };
  // Vote buttons the message places itself replace the row under it.
  const placed = c.vote.kind === 'button' && hasVoteButtons(message);
  const own = (o: SgVoteOption) => ({
    label: o.label,
    emoji: o.emoji,
    colour: o.colour,
  });
  const main = studioPayload(message, {
    ...ctx,
    user,
    extra: { ...ctx.extra, ...extra },
    votes: placed
      ? { up: own(c.vote.up), down: own(c.vote.down), closed: s.closed }
      : undefined,
  }) as Payload;
  const voteRow = placed ? [] : sgVoteComponents(c, s.closed);
  const pictures = s.files.filter((f) => f.kind !== 'file');
  const st = sgStatusOf(c, s.status);
  const color = st?.color ?? '#FACC15';
  const reason = s.reason;
  if (message.layout === 'v2') {
    const container = (main.components ?? []).find(
      (x) => (x as { type: number }).type === 17,
    ) as { components: object[] } | undefined;
    if (container && pictures.length)
      container.components.push({
        type: 12,
        items: pictures.slice(0, 10).map((f) => ({ media: { url: f.url } })),
      });
    if (reason)
      main.components!.push({
        type: 17,
        accent_color: hexNumber(color),
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `**${reason.byName}** set the status to **${st?.name ?? 'Updated'}**\n${reason.text
                  .split('\n')
                  .map((l) => `> ${l}`)
                  .join('\n')}\n-# ${reason.byId}`,
              },
            ],
            accessory: {
              type: 11,
              media: {
                url:
                  reason.byAvatar ||
                  'https://cdn.discordapp.com/embed/avatars/0.png',
              },
            },
          },
        ],
      });
    main.components!.push(...voteRow);
  } else {
    const embed = main.embeds?.[0];
    if (embed && !embed.image && pictures[0]?.kind === 'image')
      embed.image = { url: pictures[0].url };
    if (reason)
      (main.embeds ??= []).push({
        author: {
          name: reason.byName,
          ...(reason.byAvatar ? { icon_url: reason.byAvatar } : {}),
        },
        title: `Status: ${st?.name ?? 'Updated'}`,
        description: reason.text,
        color: hexNumber(color),
        footer: { text: reason.byId },
        timestamp: new Date(reason.at).toISOString(),
      });
    main.components = [...(main.components ?? []), ...voteRow];
  }
  const accent =
    message.layout === 'v2'
      ? message.v2.accent
      : (message.embeds[0]?.color ?? '#FACC15');
  const more = parts.slice(1).map((text, i) => {
    const label = `Suggestion #${s.number} · part ${i + 2} of ${parts.length}`;
    return message.layout === 'v2'
      ? {
          flags: IS_COMPONENTS_V2,
          components: [
            {
              type: 17,
              accent_color: hexNumber(accent),
              components: [
                { type: 10, content: text },
                { type: 10, content: `-# ${label}` },
              ],
            },
          ],
          allowed_mentions: { parse: [] },
        }
      : {
          embeds: [
            {
              description: text,
              color: hexNumber(accent),
              footer: { text: label },
            },
          ],
          allowed_mentions: { parse: [] },
        };
  });
  return { main, more };
}

/** The DM a status sends: the server's template or Sparko's own. */
export function sgDmPayload(
  c: Suggestions,
  message: StudioMessage | null,
  s: SgSuggestion,
  ctx: { now: number } & StudioVars,
) {
  const st = sgStatusOf(c, s.status);
  const m = message ?? sgDmDefault(st?.color ?? '#FACC15');
  const { extra } = sgVariables(c, s, m.layout);
  return studioPayload(m, {
    ...ctx,
    user: { id: s.authorId, name: s.authorName, avatar: s.authorAvatar },
    extra: {
      ...extra,
      // The DM goes to the author, so it can say who they are.
      user: `<@${s.authorId}>`,
      'user.name': s.authorName,
      reason: s.reason?.text ?? '',
      staff: s.reason?.byName ?? 'Sparko',
    },
  });
}

// Commands --------------------------------------------------------------------

/** The slash commands a server's suggestions use, as Discord registers them. */
export function sgCommandBodies(c: Suggestions) {
  const number = {
    type: 4,
    name: 'id',
    description: 'The suggestion’s number',
    required: true,
    min_value: 1,
  };
  const body: Record<SgCommandKey, object[]> = {
    suggest: [1, 2, 3].map((n) => ({
      type: 11,
      name: n === 1 ? 'file' : `file${n}`,
      description:
        n === 1 ? 'A picture, video or file to add' : 'Another file to add',
      required: false,
    })),
    status: [
      number,
      {
        type: 3,
        name: 'status',
        description: 'The status to set',
        required: true,
        autocomplete: true,
      },
    ],
    approve: [number],
    deny: [number],
    delete: [number],
  };
  return sgCommandKeys
    .filter((k) => c.commands[k].on)
    .map((k) => ({
      type: 1,
      name: c.commands[k].name,
      description: c.commands[k].description,
      options: body[k],
      contexts: [0],
    }));
}

/** Which suggestion command a typed name is, in this server. */
export const sgCommandFor = (c: Suggestions, name: string) =>
  sgCommandKeys.find((k) => c.commands[k].on && c.commands[k].name === name);

// Logs ------------------------------------------------------------------------

export type SgLogAction =
  | 'posted'
  | 'review'
  | 'accepted'
  | 'status'
  | 'closed'
  | 'deleted'
  | 'resent'
  | 'refused'
  | 'failed';
export type SgLogEntry = {
  id: string;
  action: SgLogAction;
  /** The suggestion it's about, if any. */
  number: number | null;
  userId: string;
  userName: string;
  detail: string;
  at: number;
};

/** One log line, like "[STATUS] #4 set to Approved by @rhea: …". */
export function sgLogLine(e: SgLogEntry) {
  const n = e.number === null ? '' : `#${e.number} `;
  const who = `@${e.userName}`;
  switch (e.action) {
    case 'posted':
      return `[POSTED] ${n}suggested by ${who}${e.detail ? `: ${e.detail}` : ''}`;
    case 'review':
      return `[REVIEW] ${n}from ${who} is waiting for staff to check it`;
    case 'accepted':
      return `[ACCEPTED] ${n}was checked by ${who} and posted`;
    case 'status':
      return `[STATUS] ${n}set to ${e.detail} by ${who}`;
    case 'closed':
      return `[CLOSED] ${n}voting closed${e.detail ? `: ${e.detail}` : ''}`;
    case 'deleted':
      return `[DELETED] ${n}deleted by ${who}`;
    case 'resent':
      return `[RESENT] ${n}was deleted by ${who}, who can’t delete suggestions, so Sparko posted it again`;
    case 'refused':
      return `[REFUSED] ${who} couldn’t suggest: ${e.detail}`;
    default:
      return `[FAILED] ${n}${e.detail}`;
  }
}
