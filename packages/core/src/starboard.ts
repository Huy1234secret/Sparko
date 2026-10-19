/**
 * Starboard: messages that collect enough reactions are reposted to a
 * highlights channel. A server can have several boards, each with its own
 * channel, emojis, threshold and rules; a second board with a higher
 * threshold works as a hall of fame. The post is a Message Studio template
 * with a fixed "Jump to message" button. Nothing here touches the database
 * or the network, so the dashboard imports this file too.
 */
import { emojiKey } from './reaction-roles.ts';
import {
  componentRows,
  embedDefault,
  studioPayload,
  v2Default,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';
import { commandName } from './suggestions.ts';

export const SB_MODULE = 'starboard';

export type SbBoard = {
  id: string;
  name: string;
  /** Where highlighted messages are posted. */
  channel: string;
  /** A reaction with any of these counts as a star. */
  emojis: string[];
  /** Stars a message needs to reach the board. */
  threshold: number;
  /** Counts the author's own reaction. */
  selfStar: boolean;
  /** Reactions from bots don't count. */
  ignoreBots: boolean;
  /** Every channel except `channels`, or only `channels`. */
  watch: 'all' | 'only';
  channels: string[];
  /** Skips NSFW channels unless the board's channel is NSFW too. */
  skipNsfw: boolean;
  /** Messages older than this many days are ignored; 0 is no limit. */
  maxAgeDays: number;
  /** Members with any of these roles can't be starred, and their stars don't count. */
  blockedRoles: string[];
  /** The shortest message that can be starred; 0 is any length. */
  minLength: number;
  /** Messages from bots can be starred. */
  allowBots: boolean;
  /** When a post drops below the threshold: keep it, or take it down. */
  belowThreshold: 'keep' | 'remove';
  /** When the original message is deleted: keep the post, or take it down. */
  onDelete: 'keep' | 'remove';
  /** The Studio template the post uses; '' for Sparko's own. */
  message: string;
};

export type SbCommandKey =
  | 'starboard'
  | 'top'
  | 'random'
  | 'stats'
  | 'freeze'
  | 'block';
export type SbCommand = { on: boolean; name: string; description: string };

export type Starboard = {
  boards: SbBoard[];
  /** Roles that can freeze and block; [] for Manage Messages. */
  staff: string[];
  commands: Record<SbCommandKey, SbCommand>;
};

/** "starboard" is the command; the others are its subcommands. */
export const sbCommandKeys: SbCommandKey[] = [
  'starboard',
  'top',
  'random',
  'stats',
  'freeze',
  'block',
];
export const sbSubcommandKeys = sbCommandKeys.slice(1) as Exclude<
  SbCommandKey,
  'starboard'
>[];
export const sbCommandAbout: Record<SbCommandKey, string> = {
  starboard:
    'The command the others sit under, like /starboard top. Turning it off turns them all off.',
  top: 'Anyone can see the 10 most-starred messages, on one board or from one member.',
  random: 'Anyone can pull up a random message from the board.',
  stats: 'Anyone can see how many stars a member has received and given.',
  freeze:
    'Staff stop a post’s count from changing, or let it change again. Takes a message link or ID.',
  block:
    'Staff keep a message or a member off every board, or let them back on.',
};

export const sbDefaultCommands = (): Record<SbCommandKey, SbCommand> => ({
  starboard: {
    on: true,
    name: 'starboard',
    description: 'Highlights from the starboard',
  },
  top: { on: true, name: 'top', description: 'The most-starred messages' },
  random: {
    on: true,
    name: 'random',
    description: 'A random message from the board',
  },
  stats: {
    on: true,
    name: 'stats',
    description: 'Stars a member has received and given',
  },
  freeze: {
    on: true,
    name: 'freeze',
    description: 'Freeze or unfreeze a post’s count (staff)',
  },
  block: {
    on: true,
    name: 'block',
    description: 'Keep a message or member off the board (staff)',
  },
});

let counter = 0;
export const sbId = () =>
  `b${Date.now().toString(36)}${(counter++).toString(36)}`;

export const sbBoardDefault = (
  channel = '',
  patch: Partial<SbBoard> = {},
): SbBoard => ({
  id: 'main',
  name: 'Starboard',
  channel,
  emojis: ['⭐'],
  threshold: 3,
  selfStar: false,
  ignoreBots: true,
  watch: 'all',
  channels: [],
  skipNsfw: true,
  maxAgeDays: 0,
  blockedRoles: [],
  minLength: 0,
  allowBots: false,
  belowThreshold: 'remove',
  onDelete: 'remove',
  message: '',
  ...patch,
});

export const sbDefault = (channel = ''): Starboard => ({
  boards: [sbBoardDefault(channel)],
  staff: [],
  commands: sbDefaultCommands(),
});

/** What each plan allows. Every starred message uses 2 KB of the server's storage. */
export const sbLimits = (plan?: string | null) => {
  const storageMb = plan === 'plus' ? 100 : 10;
  const perKb = 2;
  return {
    boards: plan === 'plus' ? 5 : 1,
    emojis: 5,
    storageMb,
    perKb,
    posts: Math.floor((storageMb * 1024) / perKb),
  };
};
export const sbRanges = {
  threshold: { min: 1, max: 1000 },
  maxAgeDays: { min: 0, max: 365 },
  minLength: { min: 0, max: 2000 },
  channels: 50,
} as const;
/** Counts that get their own line in the log. */
export const sbMilestones = [10, 25, 50, 100] as const;

// Checks ----------------------------------------------------------------------

export type SbIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const itemId = /^[\w-]{1,40}$/;

/**
 * Checks settings sent by the dashboard. `roles` maps a role's id to
 * whether Sparko can give it; `templates` are the server's Studio
 * templates. Returns the first problem, and where it is: "board:<id>",
 * "board:<id>/<field>", "staff" or "command:<key>".
 */
export function sbIssue(
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
): SbIssue | null {
  const x = input as Partial<Starboard> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const limits = sbLimits(plan);
  const at = (where: string, problem: string) => ({ at: where, problem });

  const boards = x.boards;
  if (!Array.isArray(boards)) return missing;
  if (!boards.length) return at('boards', 'Add a board.');
  if (boards.length > limits.boards)
    return at(
      'boards',
      limits.boards === 1
        ? 'This plan has 1 board. Plus has up to 5.'
        : `This plan has up to ${limits.boards} boards.`,
    );
  const ids = new Set<string>();
  const names = new Set<string>();
  const channels = new Set<string>();
  for (const b of boards) {
    if (!b || typeof b !== 'object') return missing;
    if (typeof b.id !== 'string' || !itemId.test(b.id) || ids.has(b.id))
      return missing;
    ids.add(b.id);
    const where = `board:${b.id}`;
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name || name.length > 32)
      return at(`${where}/name`, 'Give each board a name of up to 32.');
    if (names.has(name.toLowerCase()))
      return at(`${where}/name`, `Two boards are called “${name}”.`);
    names.add(name.toLowerCase());
    const label = `“${name}”`;
    if (typeof b.channel !== 'string' || !snowflake.test(b.channel))
      return at(`${where}/channel`, `Pick the channel ${label} posts in.`);
    if (channels.has(b.channel))
      return at(
        `${where}/channel`,
        `Each board needs its own channel. ${label} uses one another board posts in.`,
      );
    channels.add(b.channel);

    if (!Array.isArray(b.emojis)) return missing;
    if (!b.emojis.length)
      return at(`${where}/emojis`, `Pick an emoji for ${label}.`);
    if (b.emojis.length > limits.emojis)
      return at(
        `${where}/emojis`,
        `A board has up to ${limits.emojis} emojis.`,
      );
    const keys = new Set<string>();
    for (const e of b.emojis) {
      if (typeof e !== 'string' || !e || e.length > 80) return missing;
      if (keys.has(emojiKey(e)))
        return at(`${where}/emojis`, `${label} has the same emoji twice.`);
      keys.add(emojiKey(e));
    }

    const whole = (
      v: unknown,
      range: { min: number; max: number },
      field: string,
      problem: string,
    ) =>
      !Number.isInteger(v) ||
      (v as number) < range.min ||
      (v as number) > range.max
        ? at(`${where}/${field}`, problem)
        : null;
    const numberIssue =
      whole(
        b.threshold,
        sbRanges.threshold,
        'threshold',
        'Stars needed is a whole number from 1 to 1,000.',
      ) ??
      whole(
        b.maxAgeDays,
        sbRanges.maxAgeDays,
        'maxAgeDays',
        'Ignore messages older than 0 (no limit) to 365 days.',
      ) ??
      whole(
        b.minLength,
        sbRanges.minLength,
        'minLength',
        'The shortest message is 0 (any) to 2,000 characters.',
      );
    if (numberIssue) return numberIssue;

    for (const k of [
      'selfStar',
      'ignoreBots',
      'skipNsfw',
      'allowBots',
    ] as const)
      if (typeof b[k] !== 'boolean') return missing;
    if (!['all', 'only'].includes(b.watch)) return missing;
    if (!['keep', 'remove'].includes(b.belowThreshold)) return missing;
    if (!['keep', 'remove'].includes(b.onDelete)) return missing;

    if (!Array.isArray(b.channels)) return missing;
    if (b.channels.length > sbRanges.channels)
      return at(`${where}/channels`, 'Pick up to 50 channels.');
    if (b.channels.some((c) => typeof c !== 'string' || !snowflake.test(c)))
      return missing;
    if (b.watch === 'only' && !b.channels.length)
      return at(
        `${where}/channels`,
        `Pick the channels ${label} watches, or watch every channel.`,
      );
    if (b.channels.includes(b.channel))
      return at(
        `${where}/channels`,
        `${label}’s own channel is never watched. Take it out of the list.`,
      );

    if (!Array.isArray(b.blockedRoles)) return missing;
    if (b.blockedRoles.length > 25)
      return at(`${where}/blockedRoles`, 'Pick up to 25 blocked roles.');
    for (const id of b.blockedRoles) {
      if (typeof id !== 'string' || !snowflake.test(id)) return missing;
      if (roles && !roles.has(id))
        return at(
          `${where}/blockedRoles`,
          `A blocked role on ${label} was deleted. Pick another one.`,
        );
    }

    if (typeof b.message !== 'string') return missing;
    if (b.message && !templateId.test(b.message)) return missing;
    if (b.message && templates && !templates.has(b.message))
      return at(
        `${where}/message`,
        `The message template ${label} posts with was deleted. Pick or make another one.`,
      );
  }

  if (!Array.isArray(x.staff)) return missing;
  if (x.staff.length > 25) return at('staff', 'Pick up to 25 staff roles.');
  for (const id of x.staff) {
    if (typeof id !== 'string' || !snowflake.test(id)) return missing;
    if (roles && !roles.has(id))
      return at('staff', 'A staff role was deleted. Pick another one.');
  }

  const c = x.commands;
  if (!c || typeof c !== 'object') return missing;
  const used = new Set<string>();
  for (const key of sbCommandKeys) {
    const cmd = c[key];
    const where = `command:${key}`;
    if (!cmd || typeof cmd.on !== 'boolean') return missing;
    if (typeof cmd.name !== 'string' || !commandName.test(cmd.name))
      return at(
        where,
        'Command names are 1 to 32 lowercase letters, numbers, - or _.',
      );
    // The subcommands sit under /starboard, so only they can't share a name.
    if (key !== 'starboard') {
      if (used.has(cmd.name))
        return at(
          where,
          `Two commands are called /${c.starboard?.name ?? 'starboard'} ${cmd.name}.`,
        );
      used.add(cmd.name);
    }
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
export function cleanStarboard(c: Starboard): Starboard {
  return {
    boards: c.boards.map((b) => ({
      id: b.id,
      name: b.name.trim(),
      channel: b.channel,
      emojis: [...b.emojis],
      threshold: b.threshold,
      selfStar: b.selfStar,
      ignoreBots: b.ignoreBots,
      watch: b.watch,
      channels: [...new Set(b.channels)],
      skipNsfw: b.skipNsfw,
      maxAgeDays: b.maxAgeDays,
      blockedRoles: [...new Set(b.blockedRoles)],
      minLength: b.minLength,
      allowBots: b.allowBots,
      belowThreshold: b.belowThreshold,
      onDelete: b.onDelete,
      message: b.message,
    })),
    staff: [...new Set(c.staff)],
    commands: Object.fromEntries(
      sbCommandKeys.map((k) => [
        k,
        {
          on: c.commands[k].on,
          name: c.commands[k].name,
          description: c.commands[k].description.trim(),
        },
      ]),
    ) as Record<SbCommandKey, SbCommand>,
  };
}

/**
 * Settings saved by an older version, with anything added since filled in
 * from the defaults.
 */
export function sbUpgrade(
  saved: Partial<Starboard> | null | undefined,
): Starboard {
  const base = sbDefault();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    boards: Array.isArray(saved.boards)
      ? saved.boards.map((b) => sbBoardDefault('', b))
      : base.boards,
    commands: { ...base.commands, ...saved.commands },
  };
}

/** Problems with a board post template: the jump button takes one row. */
export function sbMessageIssue(m: StudioMessage): SbIssue | null {
  if (m.layout !== 'v2' && componentRows(m.components).length > 4)
    return {
      at: 'message',
      problem:
        'The Jump to message button takes one of Discord’s five rows, so a board post has up to 4 rows of its own.',
    };
  return null;
}

// Which messages and stars count ---------------------------------------------

/** What Sparko knows about a message someone starred. */
export type SbMessageFacts = {
  channelId: string;
  /** The channel a thread is in, so watching a channel covers its threads. */
  parentId: string | null;
  nsfw: boolean;
  authorId: string;
  authorBot: boolean;
  authorRoles: string[];
  /** How long its text is. */
  length: number;
  createdAt: number;
};

/**
 * Why a message can't go on a board, or null when it can. `boardNsfw` is
 * whether the board's own channel is NSFW; `blocked` whether staff blocked
 * the message or its author.
 */
export function sbSkipReason(
  b: SbBoard,
  f: SbMessageFacts,
  ctx: { now: number; boardNsfw: boolean; blocked: boolean },
): string | null {
  if (ctx.blocked) return 'blocked';
  if (f.channelId === b.channel || f.parentId === b.channel)
    return 'the board’s own channel';
  const listed =
    b.channels.includes(f.channelId) ||
    (!!f.parentId && b.channels.includes(f.parentId));
  if (b.watch === 'only' ? !listed : listed) return 'a channel not watched';
  if (b.skipNsfw && f.nsfw && !ctx.boardNsfw) return 'an NSFW channel';
  if (b.maxAgeDays && ctx.now - f.createdAt > b.maxAgeDays * 86_400_000)
    return 'too old';
  if (f.authorBot && !b.allowBots) return 'a bot’s message';
  if (b.blockedRoles.some((r) => f.authorRoles.includes(r)))
    return 'a member with a blocked role';
  if (b.minLength && f.length < b.minLength) return 'too short';
  return null;
}

/** Someone who reacted. */
export type SbReactor = { id: string; bot: boolean; roles: string[] | null };

/** Whether a reaction from this person counts as a star on this board. */
export function sbStarCounts(
  b: SbBoard,
  r: SbReactor,
  authorId: string,
  blocked: boolean,
) {
  if (blocked) return false;
  if (r.bot && b.ignoreBots) return false;
  if (r.id === authorId && !b.selfStar) return false;
  if (r.roles && b.blockedRoles.some((x) => r.roles!.includes(x))) return false;
  return true;
}

/** Whether an emoji is one of the board's stars. */
export const sbIsStar = (b: SbBoard, emoji: string) =>
  b.emojis.some((e) => emojiKey(e) === emojiKey(emoji));

/** The milestones a count passed, going up from `was`. */
export const sbMilestonesPassed = (was: number, now: number) =>
  sbMilestones.filter((m) => was < m && now >= m);

// The post --------------------------------------------------------------------

/** A starred message, as the bot, the server and the dashboard pass it around. */
export type SbEntry = {
  boardId: string;
  messageId: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  /** Its text, or null when Discord didn't share it. */
  content: string | null;
  /** Its first picture. */
  image: string;
  stars: number;
  /** The board post, while there is one. */
  postChannelId: string | null;
  postId: string | null;
  frozen: boolean;
  /** The original message was deleted; the post stayed. */
  deleted: boolean;
  messageAt: number;
  postedAt: number | null;
  updatedAt: number;
};

export const sbJumpLink = (
  guildId: string,
  e: { channelId: string; messageId: string },
) => `https://discord.com/channels/${guildId}/${e.channelId}/${e.messageId}`;

/** What members see when Discord kept a message's text from Sparko. */
export const SB_NO_TEXT = '*Discord didn’t share the text of this message.*';

/** What fills a board post's variables. */
export function sbVariables(
  b: SbBoard,
  e: SbEntry,
  guildId: string,
): Record<string, string> {
  const unix = Math.floor(e.messageAt / 1000);
  return {
    stars: String(e.stars),
    'star.emoji': b.emojis[0] ?? '⭐',
    board: b.name,
    author: `<@${e.authorId}>`,
    'author.name': e.authorName,
    'author.avatar': e.authorAvatar,
    'jump.link': sbJumpLink(guildId, e),
    'message.content':
      e.content === null ? SB_NO_TEXT : e.content.slice(0, 3800),
    'message.image': e.image,
    'message.date': `<t:${unix}:f>`,
  };
}

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

export type SbPreset = {
  id: string;
  name: string;
  about: string;
  message: StudioMessage;
};

/** Ready-made board posts to start from. */
export const sbPresets: SbPreset[] = [
  {
    id: 'sb-classic',
    name: 'Classic starboard',
    about: 'The count above an embed with the author, text and picture.',
    message: embedMessage(
      'Classic starboard',
      '{star.emoji} **{stars}** · {channel}',
      {
        author: '{author.name}',
        authorIcon: '{author.avatar}',
        description: '{message.content}',
        image: '{message.image}',
        color: '#FACC15',
        fields: [
          { id: 'f1', name: 'Sent', value: '{message.date}', inline: false },
        ],
        footer: '{board}',
      },
    ),
  },
  {
    id: 'sb-compact',
    name: 'Compact',
    about: 'One small embed: who, where and the stars.',
    message: embedMessage('Compact starboard', '', {
      description:
        '{star.emoji} **{stars}** · {author} in {channel}\n{message.content}',
      thumbnail: '{message.image}',
      color: '#5865F2',
    }),
  },
  {
    id: 'sb-v2',
    name: 'Highlight card',
    about: 'A Components V2 card with the picture below the text.',
    message: {
      name: 'Highlight card',
      channel: '',
      layout: 'v2',
      content: '',
      embeds: [],
      components: [],
      v2: {
        ...v2Default(),
        accent: '#FACC15',
        text: '### {star.emoji} {stars} on {board}\n{message.content}\n{separator}\n-# {author} in {channel} · {message.date}',
        thumbnail: '{author.avatar}',
        gallery: [{ id: 'g1', url: '{message.image}', description: '' }],
        // The picture sits under the text, above the divider.
        place: [{ id: 'gallery', slot: { at: 'line', line: 1 } }],
      },
    },
  },
];

/** The post Sparko sends until the server picks its own. */
export const sbDefaultMessage = () => sbPresets[0]!.message;

type Payload = Record<string, unknown> & {
  embeds?: Record<string, unknown>[];
  components?: object[];
};

/** The fixed button under every post. */
export const sbJumpRow = (url: string) => ({
  type: 1,
  components: [{ type: 2, style: 5, label: 'Jump to message', url }],
});

/** Discord's message body for a board post: the template and the jump button. */
export function sbPayload(
  b: SbBoard,
  message: StudioMessage,
  e: SbEntry,
  ctx: { now: number; guildId: string } & StudioVars,
) {
  const extra = sbVariables(b, e, ctx.guildId);
  const main = studioPayload(message, {
    ...ctx,
    // {user…} is the author too, and {channel} where they wrote it.
    user: { id: e.authorId, name: e.authorName, avatar: e.authorAvatar },
    channel: e.channelId,
    extra: { ...ctx.extra, ...extra },
  }) as Payload;
  main.components = [
    ...(main.components ?? []),
    sbJumpRow(extra['jump.link']!),
  ];
  return main;
}

/** A made-up starred message, to show what the post looks like. */
export const sbSample = (
  by: { id: string; name: string; avatar: string },
  now: number,
  stars = 7,
): SbEntry => ({
  boardId: 'main',
  messageId: '1',
  channelId: '1',
  authorId: by.id,
  authorName: by.name,
  authorAvatar: by.avatar,
  content:
    'Finally finished the pixel-art version of our server mascot! Took three evenings but I think it was worth it.',
  image: '',
  stars,
  postChannelId: null,
  postId: null,
  frozen: false,
  deleted: false,
  messageAt: now - 3_600_000,
  postedAt: null,
  updatedAt: now,
});

// Commands --------------------------------------------------------------------

/** The /starboard command and its subcommands, as Discord registers them. */
export function sbCommandBodies(c: Starboard) {
  if (!c.commands.starboard.on) return [];
  const board = {
    type: 3,
    name: 'board',
    description: 'Which board',
    required: false,
    autocomplete: true,
  };
  const member = (description: string) => ({
    type: 6,
    name: 'member',
    description,
    required: false,
  });
  const message = (required: boolean) => ({
    type: 3,
    name: 'message',
    description: 'The message’s link or ID',
    required,
  });
  const options: Record<Exclude<SbCommandKey, 'starboard'>, object[]> = {
    top: [board, member('Only their messages')],
    random: [board],
    stats: [member('Whose stars to show (you by default)')],
    freeze: [message(true)],
    block: [message(false), member('A member to block or unblock')],
  };
  const subs = sbSubcommandKeys
    .filter((k) => c.commands[k].on)
    .map((k) => ({
      type: 1,
      name: c.commands[k].name,
      description: c.commands[k].description,
      options: options[k],
    }));
  if (!subs.length) return [];
  return [
    {
      type: 1,
      name: c.commands.starboard.name,
      description: c.commands.starboard.description,
      options: subs,
      contexts: [0],
    },
  ];
}

/** Which subcommand a typed one is, in this server. */
export function sbCommandFor(c: Starboard, name: string, sub: string | null) {
  if (!c.commands.starboard.on || c.commands.starboard.name !== name)
    return undefined;
  return sbSubcommandKeys.find(
    (k) => c.commands[k].on && c.commands[k].name === sub,
  );
}

/** Finds a board by its name or id, as people type it; the first without one. */
export function sbFindBoard(c: Starboard, typed: string | null | undefined) {
  const t = (typed ?? '').trim().toLowerCase();
  if (!t) return c.boards[0];
  return c.boards.find((b) => b.id === t || b.name.toLowerCase() === t);
}

/** Whether someone may freeze and block. With no roles, Manage Messages may. */
export const sbIsStaff = (
  c: Starboard,
  member: Set<string>,
  manager: boolean,
) => manager || c.staff.some((r) => member.has(r));

/** A message link, or a message ID with the channel it was used in. */
export function sbParseMessage(text: string, channelId: string) {
  const t = text.trim();
  const link = t.match(
    /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{1,25})\/(\d{1,25})\/(\d{1,25})\/?$/,
  );
  if (link) return { channelId: link[2]!, messageId: link[3]! };
  if (/^\d{1,25}$/.test(t)) return { channelId, messageId: t };
  return null;
}

// Logs ------------------------------------------------------------------------

export type SbLogAction =
  | 'posted'
  | 'milestone'
  | 'removed'
  | 'frozen'
  | 'unfrozen'
  | 'blocked'
  | 'unblocked'
  | 'failed';
export type SbLogEntry = {
  id: string;
  action: SbLogAction;
  boardId: string;
  boardName: string;
  messageId: string;
  channelId: string;
  /** Whose message it is (or who was blocked). */
  authorId: string;
  authorName: string;
  /** Who did it: staff, or Sparko. */
  userId: string;
  userName: string;
  stars: number;
  /** "below", "deleted" or "staff" for removals; the problem for failures. */
  detail: string;
  at: number;
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** One log line, like "[POSTED] @ayo’s message reached 5 stars on Starboard". */
export function sbLogLine(e: SbLogEntry) {
  const whose = e.authorName ? `@${e.authorName}’s message` : 'A message';
  const on = e.boardName ? ` on ${e.boardName}` : '';
  switch (e.action) {
    case 'posted':
      return `[POSTED] ${whose} reached ${plural(e.stars, 'star')}${on}`;
    case 'milestone':
      return `[MILESTONE] ${whose} passed ${plural(e.stars, 'star')}${on}`;
    case 'removed':
      return e.detail === 'below'
        ? `[REMOVED] ${whose} dropped to ${plural(e.stars, 'star')} and left ${e.boardName}`
        : e.detail === 'deleted'
          ? `[REMOVED] ${whose} was deleted, so its post left ${e.boardName}`
          : `[REMOVED] ${whose} was taken off ${e.boardName} by @${e.userName}`;
    case 'frozen':
      return `[FROZEN] ${whose}${on} was frozen at ${plural(e.stars, 'star')} by @${e.userName}`;
    case 'unfrozen':
      return `[UNFROZEN] ${whose}${on} counts stars again, by @${e.userName}`;
    case 'blocked':
      return e.messageId
        ? `[BLOCKED] ${whose} was blocked from the board by @${e.userName}`
        : `[BLOCKED] @${e.authorName} was blocked from the board by @${e.userName}`;
    case 'unblocked':
      return e.messageId
        ? `[UNBLOCKED] ${whose} can reach the board again, by @${e.userName}`
        : `[UNBLOCKED] @${e.authorName} can reach the board again, by @${e.userName}`;
    default:
      return `[FAILED] ${e.boardName ? `${e.boardName}: ` : ''}${e.detail}`;
  }
}

/** Someone or something staff keep off every board. */
export type SbBlocked = {
  kind: 'message' | 'member';
  /** The message's or member's id. */
  id: string;
  /** Where a blocked message is. */
  channelId: string;
  /** The member's name, or the message author's. */
  name: string;
  /** A blocked message's text, to recognise it. */
  preview: string;
  byName: string;
  at: number;
};
