/**
 * Invite tracking: Sparko remembers each server's invites, works out which
 * one a new member used, and counts invites for whoever made it. Leaves,
 * fake accounts and staff bonuses change the counts, reward roles follow
 * them, and join and leave messages say who invited whom. Nothing here
 * touches the database or the network, so the dashboard imports this file too.
 */
import { parseDuration } from './auto-roles.ts';
import { commandName } from './suggestions.ts';
import {
  embedDefault,
  studioPayload,
  v2Default,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';

export const INV_MODULE = 'invites';

/** The two messages: someone joined, someone left. */
export type InvKind = 'join' | 'leave';
export const invKinds: InvKind[] = ['join', 'leave'];

export type InvCommandKey =
  | 'view'
  | 'leaderboard'
  | 'who'
  | 'list'
  | 'bonus'
  | 'reset';
export type InvCommand = { on: boolean; name: string; description: string };

/** A message Sparko posts when someone joins or leaves. */
export type InvMessage = {
  on: boolean;
  /** Where it's posted. */
  channel: string;
  /** The Studio template; '' for Sparko's own. */
  template: string;
};

/** "N invites → role". */
export type InvReward = { id: string; invites: number; role: string };

export type Invites = {
  /** Accounts younger than this count as fake, like "7d"; '' for none. */
  fakeAge: string;
  /** Members who left come off their inviter's total. */
  subtractLeaves: boolean;
  /** Fake accounts come off their inviter's total. */
  subtractFakes: boolean;
  /** Someone who leaves and joins again counts again. */
  countRejoins: boolean;
  join: InvMessage;
  leave: InvMessage;
  rewards: InvReward[];
  /** Keep every reward earned, or only the highest. */
  stackRewards: boolean;
  /** Take a reward back when someone drops below it. */
  removeRewards: boolean;
  /** Roles that can give bonuses and reset counts; [] for Manage Server. */
  staff: string[];
  /** The /invites command and its subcommands, as the server names them. */
  commands: {
    group: { name: string; description: string };
  } & Record<InvCommandKey, InvCommand>;
};

export const invCommandKeys: InvCommandKey[] = [
  'view',
  'leaderboard',
  'who',
  'list',
  'bonus',
  'reset',
];
/** Staff-only commands. */
export const invStaffCommands: InvCommandKey[] = ['bonus', 'reset'];
export const invCommandAbout: Record<InvCommandKey, string> = {
  view: 'Shows a member’s invites: regular, left, fake, bonus and the total.',
  leaderboard: 'The server’s top inviters, 10 to a page.',
  who: 'Says who invited a member, with which invite and when.',
  list: 'Lists the members someone invited, newest first.',
  bonus:
    'Staff add or take away bonus invites. Use a negative number to take some away.',
  reset:
    'Staff reset a member’s invites, or everyone’s. Who invited whom is kept.',
};

export const invDefaultCommands = (): Invites['commands'] => ({
  group: { name: 'invites', description: 'Invites in this server' },
  view: { on: true, name: 'view', description: 'See someone’s invites' },
  leaderboard: {
    on: true,
    name: 'leaderboard',
    description: 'The top inviters',
  },
  who: { on: true, name: 'who', description: 'See who invited someone' },
  list: { on: true, name: 'list', description: 'Members someone invited' },
  bonus: {
    on: true,
    name: 'bonus',
    description: 'Staff: add or take away bonus invites',
  },
  reset: { on: true, name: 'reset', description: 'Staff: reset invites' },
});

export const invDefault = (channel = ''): Invites => ({
  fakeAge: '7d',
  subtractLeaves: true,
  subtractFakes: true,
  countRejoins: false,
  join: { on: true, channel, template: '' },
  leave: { on: false, channel, template: '' },
  rewards: [],
  stackRewards: true,
  removeRewards: true,
  staff: [],
  commands: invDefaultCommands(),
});

/** How many reward tiers each plan has. */
export const invLimits = (plan?: string | null) => ({
  rewards: plan === 'plus' ? 25 : 3,
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const invRanges = {
  fakeAge: { min: HOUR, max: 365 * DAY, label: '1h and 1y' },
} as const;
/** The most invites a tier can ask for, and a bonus can add or take. */
export const invMax = { tier: 100_000, bonus: 100_000 } as const;
/** Leaderboard rows per page in Discord. */
export const INV_PAGE = 10;

// Invites and which one was used ----------------------------------------------

/** An invite as Sparko remembers it. */
export type InvCode = {
  code: string;
  inviterId: string | null;
  inviterName: string;
  channelId: string;
  channelName: string;
  uses: number;
  /** 0 for no limit. */
  maxUses: number;
  /** When it runs out, or null for never. */
  expiresAt: number | null;
  createdAt: number;
};

/** How someone joined: an invite, the vanity link, or a way Sparko can't see. */
export type InvJoinType = 'normal' | 'vanity' | 'unknown';
export const invJoinTypes: InvJoinType[] = ['normal', 'vanity', 'unknown'];

/**
 * The invite a new member used, by comparing the uses Sparko knew with
 * Discord's now: the one invite that went up by one. An invite that's gone
 * and was one use from its limit counts too, since Discord deletes those
 * when they're used up. Null when it can't tell (none, or several at once).
 */
export function invDiff(before: InvCode[], now: InvCode[]): InvCode | null {
  const old = new Map(before.map((c) => [c.code, c]));
  const went = now.filter((c) => c.uses > (old.get(c.code)?.uses ?? 0));
  if (went.length === 1) return went[0]!;
  if (went.length > 1) return null;
  const here = new Set(now.map((c) => c.code));
  const usedUp = before.filter(
    (c) => !here.has(c.code) && c.maxUses > 0 && c.uses + 1 >= c.maxUses,
  );
  return usedUp.length === 1
    ? { ...usedUp[0]!, uses: usedUp[0]!.uses + 1 }
    : null;
}

/** Whether an account is new enough to count as fake. */
export function invIsFake(c: Invites, createdAt: number, now: number) {
  const age = parseDuration(c.fakeAge);
  return !!age && now - createdAt < age;
}

// Counting --------------------------------------------------------------------

/** One inviter's numbers. */
export type InvCounts = {
  regular: number;
  left: number;
  fake: number;
  bonus: number;
};

/** Total = regular − left − fake + bonus, with leaves and fakes as the settings say. */
export const invTotal = (c: Invites, n: InvCounts) =>
  n.regular -
  (c.subtractLeaves ? n.left : 0) -
  (c.subtractFakes ? n.fake : 0) +
  n.bonus;

/**
 * The reward roles someone should have at a total, and which of the ones
 * they have should go. `has` is their roles now.
 */
export function invRewardPlan(c: Invites, total: number, has: Set<string>) {
  const tiers = [...c.rewards]
    .filter((r) => r.role)
    .sort((a, b) => a.invites - b.invites);
  const earned = tiers.filter((r) => total >= r.invites);
  const keep = new Set(
    (c.stackRewards ? earned : earned.slice(-1)).map((r) => r.role),
  );
  const give = [...keep].filter((id) => !has.has(id));
  const take = [
    ...new Set(
      tiers
        .filter((r) => !keep.has(r.role) && has.has(r.role))
        // Below a tier: only taken back when that's on. A lower tier when
        // only the highest is kept: always swapped for the higher one.
        .filter(
          (r) => c.removeRewards || (!c.stackRewards && total >= r.invites),
        )
        .map((r) => r.role),
    ),
  ];
  return { give, take };
}

// Checks ----------------------------------------------------------------------

export type InvIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const itemId = /^[\w-]{1,40}$/;
const kindWords: Record<InvKind, string> = {
  join: 'join message',
  leave: 'leave message',
};

/**
 * Checks settings sent by the dashboard. `roles` maps a role's id to
 * whether Sparko can give it; `templates` are the server's Studio
 * templates. Returns the first problem, and where it is.
 */
export function invIssue(
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
): InvIssue | null {
  const x = input as Partial<Invites> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const at = (where: string, problem: string) => ({ at: where, problem });
  const limits = invLimits(plan);

  if (typeof x.fakeAge !== 'string') return missing;
  if (x.fakeAge.trim()) {
    const ms = parseDuration(x.fakeAge);
    if (ms === null)
      return at(
        'fakeAge',
        'Write the fake account age with h, d, w, mt or y, like 7d.',
      );
    if (ms < invRanges.fakeAge.min || ms > invRanges.fakeAge.max)
      return at(
        'fakeAge',
        `The fake account age has to be between ${invRanges.fakeAge.label}.`,
      );
  }
  for (const k of [
    'subtractLeaves',
    'subtractFakes',
    'countRejoins',
    'stackRewards',
    'removeRewards',
  ] as const)
    if (typeof x[k] !== 'boolean') return missing;

  for (const k of invKinds) {
    const m = x[k];
    if (!m || typeof m !== 'object' || typeof m.on !== 'boolean')
      return missing;
    if (typeof m.channel !== 'string' || typeof m.template !== 'string')
      return missing;
    if (m.channel && !snowflake.test(m.channel)) return missing;
    if (m.on && !m.channel)
      return at(
        `${k}:channel`,
        `Pick the channel the ${kindWords[k]} is posted in.`,
      );
    if (m.template && !templateId.test(m.template)) return missing;
    if (m.template && templates && !templates.has(m.template))
      return at(
        `message:${k}`,
        `The ${kindWords[k]} template was deleted. Pick or make another one.`,
      );
  }

  if (!Array.isArray(x.rewards)) return missing;
  if (x.rewards.length > limits.rewards)
    return at(
      'rewards',
      `This plan has up to ${limits.rewards} reward ${limits.rewards === 1 ? 'role' : 'roles'}.`,
    );
  const counts = new Set<number>();
  const rewardRoles = new Set<string>();
  for (const [i, r] of x.rewards.entries()) {
    const where = `reward:${(r as InvReward | null)?.id ?? i}`;
    if (!r || typeof r !== 'object' || typeof r.id !== 'string') return missing;
    if (!itemId.test(r.id)) return missing;
    if (
      !Number.isInteger(r.invites) ||
      r.invites < 1 ||
      r.invites > invMax.tier
    )
      return at(
        where,
        `Reward ${i + 1} needs a number of invites from 1 to ${invMax.tier.toLocaleString('en-US')}.`,
      );
    if (counts.has(r.invites))
      return at(where, `Two rewards are at ${r.invites} invites. Change one.`);
    counts.add(r.invites);
    if (typeof r.role !== 'string' || !snowflake.test(r.role))
      return at(where, `Pick a role for reward ${i + 1}.`);
    if (rewardRoles.has(r.role))
      return at(
        where,
        'Each reward needs its own role. Pick another one for this reward.',
      );
    rewardRoles.add(r.role);
    if (roles && !roles.has(r.role))
      return at(
        where,
        `The role for reward ${i + 1} was deleted. Pick another one.`,
      );
    if (roles?.get(r.role) === false)
      return at(
        where,
        `Sparko can’t give the role for reward ${i + 1}. Move Sparko’s role above it, or pick another one.`,
      );
  }

  if (!Array.isArray(x.staff)) return missing;
  if (x.staff.length > 25)
    return at('staff', 'Pick up to 25 roles for Who can manage invites.');
  for (const id of x.staff) {
    if (typeof id !== 'string' || !snowflake.test(id)) return missing;
    if (roles && !roles.has(id))
      return at(
        'staff',
        'A role in Who can manage invites was deleted. Pick another one.',
      );
  }

  const c = x.commands;
  if (!c || typeof c !== 'object' || !c.group) return missing;
  if (typeof c.group.name !== 'string' || !commandName.test(c.group.name))
    return at(
      'command:group',
      'Command names are 1 to 32 lowercase letters, numbers, - or _.',
    );
  if (
    typeof c.group.description !== 'string' ||
    !c.group.description.trim() ||
    c.group.description.length > 100
  )
    return at(
      'command:group',
      `Give /${c.group.name} a description of up to 100.`,
    );
  const used = new Set<string>();
  for (const key of invCommandKeys) {
    const cmd = c[key];
    const where = `command:${key}`;
    if (!cmd || typeof cmd.on !== 'boolean') return missing;
    if (typeof cmd.name !== 'string' || !commandName.test(cmd.name))
      return at(
        where,
        'Command names are 1 to 32 lowercase letters, numbers, - or _.',
      );
    if (used.has(cmd.name))
      return at(where, `Two commands are called /${c.group.name} ${cmd.name}.`);
    used.add(cmd.name);
    if (
      typeof cmd.description !== 'string' ||
      !cmd.description.trim() ||
      cmd.description.length > 100
    )
      return at(
        where,
        `Give /${c.group.name} ${cmd.name} a description of up to 100.`,
      );
  }
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export function cleanInvites(c: Invites): Invites {
  const cmd = (k: InvCommandKey) => ({
    on: c.commands[k].on,
    name: c.commands[k].name,
    description: c.commands[k].description.trim(),
  });
  const msg = (m: InvMessage): InvMessage => ({
    on: m.on,
    channel: m.channel,
    template: m.template,
  });
  return {
    fakeAge: c.fakeAge.trim(),
    subtractLeaves: c.subtractLeaves,
    subtractFakes: c.subtractFakes,
    countRejoins: c.countRejoins,
    join: msg(c.join),
    leave: msg(c.leave),
    rewards: c.rewards.map((r) => ({
      id: r.id,
      invites: r.invites,
      role: r.role,
    })),
    stackRewards: c.stackRewards,
    removeRewards: c.removeRewards,
    staff: [...new Set(c.staff)],
    commands: {
      group: {
        name: c.commands.group.name,
        description: c.commands.group.description.trim(),
      },
      view: cmd('view'),
      leaderboard: cmd('leaderboard'),
      who: cmd('who'),
      list: cmd('list'),
      bonus: cmd('bonus'),
      reset: cmd('reset'),
    },
  };
}

/** Settings saved by an older version, with anything added since filled in. */
export function invUpgrade(saved: Partial<Invites> | null | undefined) {
  const base = invDefault();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    join: { ...base.join, ...saved.join },
    leave: { ...base.leave, ...saved.leave },
    commands: {
      ...base.commands,
      ...saved.commands,
      group: { ...base.commands.group, ...saved.commands?.group },
    },
  } as Invites;
}

/** Whether someone can give bonuses and reset counts. */
export const invIsStaff = (c: Invites, member: Set<string>, manager: boolean) =>
  manager || c.staff.some((r) => member.has(r));

// Messages --------------------------------------------------------------------

export const invKindNames: Record<InvKind, string> = {
  join: 'Join',
  leave: 'Leave',
};
export const invKindAbout: Record<InvKind, string> = {
  join: 'Posted when someone joins, saying who invited them.',
  leave: 'Posted when someone leaves, saying who had invited them.',
};

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
const textMessage = (name: string, content: string): StudioMessage => ({
  name,
  channel: '',
  layout: 'embed',
  content,
  embeds: [],
  components: [],
  v2: v2Default(),
});
const v2Message = (
  name: string,
  accent: string,
  text: string,
): StudioMessage => ({
  name,
  channel: '',
  layout: 'v2',
  content: '',
  embeds: [],
  components: [],
  v2: { ...v2Default(), accent, text, thumbnail: '{user.avatar}' },
});

export type InvPreset = {
  id: string;
  kind: InvKind;
  name: string;
  about: string;
  message: StudioMessage;
};

/** Ready-made messages to start from; the first of each kind is Sparko's own. */
export const invPresets: InvPreset[] = [
  {
    id: 'inv-join',
    kind: 'join',
    name: 'Join card',
    about: 'An embed with who invited them and their new total.',
    message: embedMessage('Invite join card', '', {
      title: '📥 {user.name} joined',
      description:
        '{user} was invited by {inviter}, who now has **{inviter.invites}** invites.',
      thumbnail: '{user.avatar}',
      color: '#57F287',
      footer: 'Invite {invite.code} · used {invite.uses} times',
      timestamp: true,
    }),
  },
  {
    id: 'inv-join-short',
    kind: 'join',
    name: 'One line',
    about: 'A single line, no embed.',
    message: textMessage(
      'Invite join line',
      '📥 {user} joined, invited by {inviter} ({inviter.invites} invites).',
    ),
  },
  {
    id: 'inv-join-v2',
    kind: 'join',
    name: 'Modern card',
    about: 'A Components V2 card with their picture.',
    message: v2Message(
      'Modern invite join',
      '#57F287',
      '### {user.name} joined\nInvited by {inviter} · **{inviter.invites}** invites\n{separator}\n-# Invite {invite.code} · {join.type} join · account made {user.created}',
    ),
  },
  {
    id: 'inv-leave',
    kind: 'leave',
    name: 'Leave card',
    about: 'An embed with who had invited them.',
    message: embedMessage('Invite leave card', '', {
      title: '📤 {user.name} left',
      description:
        '{user.name} had been invited by {inviter}, who now has **{inviter.invites}** invites.',
      thumbnail: '{user.avatar}',
      color: '#ED4245',
      footer: 'Joined {user.joined}',
    }),
  },
  {
    id: 'inv-leave-short',
    kind: 'leave',
    name: 'One line',
    about: 'A single line, no embed.',
    message: textMessage(
      'Invite leave line',
      '📤 **{user.name}** left. They were invited by {inviter} ({inviter.invites} invites).',
    ),
  },
  {
    id: 'inv-leave-v2',
    kind: 'leave',
    name: 'Modern card',
    about: 'A Components V2 card in red.',
    message: v2Message(
      'Modern invite leave',
      '#ED4245',
      '### {user.name} left\nInvited by {inviter} · **{inviter.invites}** invites now\n{separator}\n-# Invite {invite.code}',
    ),
  },
];

/** Sparko's own message for a kind, used until the server picks one. */
export const invDefaultMessage = (kind: InvKind) =>
  invPresets.find((p) => p.kind === kind)!.message;

/** What a join or leave message fills in about the invite. */
export type InvMessageFacts = {
  type: InvJoinType;
  inviter: { id: string; name: string; total: number } | null;
  code: string;
  uses: number;
};

/** The invite variables: {inviter}, {inviter.name}, {invite.code}… */
export function invVariables(f: InvMessageFacts): Record<string, string> {
  const who =
    f.type === 'vanity'
      ? 'the vanity link'
      : f.inviter
        ? `<@${f.inviter.id}>`
        : 'an unknown invite';
  return {
    inviter: who,
    'inviter.name':
      f.type === 'vanity' ? 'Vanity link' : (f.inviter?.name ?? 'Unknown'),
    'inviter.invites': String(f.inviter?.total ?? 0),
    'invite.code': f.code || 'unknown',
    'invite.uses': String(f.uses),
    'join.type': f.type,
  };
}

/** A join or leave message from a template. It never pings anyone. */
export function invPayload(
  message: StudioMessage,
  facts: InvMessageFacts,
  ctx: { now: number } & StudioVars,
) {
  const body = studioPayload(message, {
    ...ctx,
    extra: { ...ctx.extra, ...invVariables(facts) },
  }) as Record<string, unknown>;
  return { ...body, allowed_mentions: { parse: [] } };
}

// Commands --------------------------------------------------------------------

/** The /invites command and its subcommands, as Discord registers them. */
export function invCommandBodies(c: Invites) {
  const member = (description: string, required = false) => ({
    type: 6,
    name: 'member',
    description,
    required,
  });
  const body: Record<InvCommandKey, object[]> = {
    view: [member('Whose invites (you if left empty)')],
    leaderboard: [
      {
        type: 4,
        name: 'page',
        description: 'Which page',
        required: false,
        min_value: 1,
        max_value: 1000,
      },
    ],
    who: [member('Who to look up (you if left empty)')],
    list: [member('Whose invited members (you if left empty)')],
    bonus: [
      member('Who gets the bonus', true),
      {
        type: 4,
        name: 'amount',
        description: 'Bonus invites; negative takes some away',
        required: true,
        min_value: -invMax.bonus,
        max_value: invMax.bonus,
      },
    ],
    reset: [
      member('Whose invites to reset'),
      {
        type: 5,
        name: 'everyone',
        description: 'Reset everyone’s invites instead',
        required: false,
      },
    ],
  };
  const subs = invCommandKeys
    .filter((k) => c.commands[k].on)
    .map((k) => ({
      type: 1,
      name: c.commands[k].name,
      description: c.commands[k].description,
      options: body[k],
    }));
  if (!subs.length) return [];
  return [
    {
      type: 1,
      name: c.commands.group.name,
      description: c.commands.group.description,
      options: subs,
      contexts: [0],
    },
  ];
}

/** Which invites subcommand a typed command is, in this server. */
export const invCommandFor = (c: Invites, name: string, sub: string | null) =>
  name === c.commands.group.name
    ? invCommandKeys.find((k) => c.commands[k].on && c.commands[k].name === sub)
    : undefined;

// Logs ------------------------------------------------------------------------

export type InvLogAction =
  | 'joined'
  | 'left'
  | 'reward-given'
  | 'reward-removed'
  | 'bonus'
  | 'reset'
  | 'failed';
export type InvLogEntry = {
  id: string;
  action: InvLogAction;
  userId: string;
  userName: string;
  detail: string;
  at: number;
};

/** One log line, like "[JOINED] @kit joined: invited by @rhea with abc". */
export function invLogLine(e: InvLogEntry) {
  const who = `@${e.userName}`;
  const more = e.detail ? `: ${e.detail}` : '';
  switch (e.action) {
    case 'joined':
      return `[JOINED] ${who} joined${more}`;
    case 'left':
      return `[LEFT] ${who} left${more}`;
    case 'reward-given':
      return `[REWARD GIVEN] ${who} got a reward role${more}`;
    case 'reward-removed':
      return `[REWARD REMOVED] ${who} lost a reward role${more}`;
    case 'bonus':
      return `[BONUS] ${who}’s bonus invites changed${more}`;
    case 'reset':
      return `[RESET] ${e.userId === '0' ? 'Everyone’s' : `${who}’s`} invites were reset${more}`;
    default:
      return `[FAILED] ${who}${more}`;
  }
}
