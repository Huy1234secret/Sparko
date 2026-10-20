/**
 * Temporary voice channels: members get their own voice room by joining a
 * hub channel, pressing a button on the control panel, or with /voice
 * create. Rooms are deleted when they're empty. Nothing here touches the
 * database or the network, so the dashboard imports this file too.
 */
import { commandName } from './suggestions.ts';
import {
  componentRows,
  embedDefault,
  studioPayload,
  v2Default,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';

export const TV_MODULE = 'temp-voice';

/** What a panel button or a /voice subcommand does. */
export type TvAct =
  | 'create'
  | 'rename'
  | 'limit'
  | 'lock'
  | 'unlock'
  | 'hide'
  | 'show'
  | 'trust'
  | 'untrust'
  | 'invite'
  | 'kick'
  | 'block'
  | 'unblock'
  | 'claim'
  | 'transfer'
  | 'region'
  | 'bitrate'
  | 'delete';
export const tvActs: TvAct[] = [
  'create',
  'rename',
  'limit',
  'lock',
  'unlock',
  'hide',
  'show',
  'trust',
  'untrust',
  'invite',
  'kick',
  'block',
  'unblock',
  'claim',
  'transfer',
  'region',
  'bitrate',
  'delete',
];
export const tvActNames: Record<TvAct, string> = {
  create: 'Create room',
  rename: 'Rename',
  limit: 'Limit',
  lock: 'Lock',
  unlock: 'Unlock',
  hide: 'Hide',
  show: 'Show',
  trust: 'Trust',
  untrust: 'Untrust',
  invite: 'Invite',
  kick: 'Kick',
  block: 'Block',
  unblock: 'Unblock',
  claim: 'Claim',
  transfer: 'Transfer',
  region: 'Region',
  bitrate: 'Bitrate',
  delete: 'Delete',
};
/** The emoji on each panel button. */
export const tvActEmoji: Record<TvAct, string> = {
  create: '➕',
  rename: '✏️',
  limit: '👥',
  lock: '🔒',
  unlock: '🔓',
  hide: '🙈',
  show: '👁️',
  trust: '🤝',
  untrust: '✂️',
  invite: '📨',
  kick: '👢',
  block: '⛔',
  unblock: '♻️',
  claim: '👑',
  transfer: '🔁',
  region: '🌍',
  bitrate: '🎚️',
  delete: '🗑️',
};
export const tvActAbout: Record<TvAct, string> = {
  create:
    'Makes a new room and sends its link privately. If nobody joins within a minute, it’s deleted.',
  rename:
    'Gives the room a new name. Discord allows two renames every 10 minutes.',
  limit:
    'Sets how many people can be in the room, from 1 to 99, or 0 for no limit.',
  lock: 'Only trusted members can join. Everyone else can still see the room.',
  unlock: 'Anyone can join again.',
  hide: 'Only trusted members can see the room.',
  show: 'Everyone can see the room again.',
  trust: 'Lets a member join and see the room even when it’s locked or hidden.',
  untrust: 'Takes a member off the room’s trusted list.',
  invite:
    'Sends a member a link to the room in their DMs, and lets them in if it’s locked.',
  kick: 'Disconnects a member from the room. They can join again unless it’s locked.',
  block:
    'Stops a member joining the room, and disconnects them if they’re in it.',
  unblock: 'Lets a blocked member join again.',
  claim: 'Takes over a room after its owner left it.',
  transfer: 'Gives the room to another member who’s in it.',
  region: 'Picks the voice server region, or automatic.',
  bitrate: 'Sets the sound quality. Higher needs more server boosts.',
  delete: 'Deletes the room straight away.',
};

/** How rooms from a hub (or from the panel and /voice create) start out. */
export type TvRoomStyle = {
  /** The category rooms go in; '' for the hub's own (or where it was asked). */
  category: string;
  /** The room's name, with {user.name} and {count}. */
  name: string;
  /** How many can join, 0 for no limit. */
  limit: number;
  /** In kbps. */
  bitrate: number;
  locked: boolean;
  hidden: boolean;
  /** Members can write in the room's text chat. */
  chat: boolean;
};
export type TvHub = TvRoomStyle & {
  id: string;
  /** The voice channel members join to get a room. */
  channel: string;
};

export type TvCommand = { on: boolean; name: string; description: string };

export type TempVoice = {
  hubs: TvHub[];
  /** Rooms made with the panel's Create room button or /voice create. */
  create: TvRoomStyle;
  /** Seconds an empty room waits before it's deleted, 0 to 60. */
  deleteAfter: number;
  /** Rooms one member can own at once. */
  maxRooms: number;
  /** Members with this role can own any number of rooms and join any room. */
  bypassRole: string;
  /** Remembers each member's name, limit, lock and lists for next time. */
  remember: boolean;
  panel: {
    /** Where the control panel is posted; '' for nowhere. */
    channel: string;
    /** The Studio template for its text; '' for Sparko's own. */
    message: string;
    /** The buttons under it, in the order of tvActs. */
    buttons: TvAct[];
    /** Also posts the panel in each new room's chat. */
    inRooms: boolean;
    /** Buttons show their name beside the emoji. */
    labels: boolean;
  };
  /** The /voice command and its subcommands, as the server names them. */
  commands: { group: { name: string; description: string } } & Record<
    TvAct,
    TvCommand
  >;
};

export const tvDefaultCommands = (): TempVoice['commands'] => {
  const describe: Record<TvAct, string> = {
    create: 'Make your own voice room',
    rename: 'Rename your room',
    limit: 'Set how many can join your room',
    lock: 'Only trusted members can join',
    unlock: 'Anyone can join your room',
    hide: 'Hide your room from everyone else',
    show: 'Show your room again',
    trust: 'Let someone join even when locked',
    untrust: 'Take someone off your trusted list',
    invite: 'Send someone a link to your room',
    kick: 'Disconnect someone from your room',
    block: 'Stop someone joining your room',
    unblock: 'Let a blocked member join again',
    claim: 'Take over a room whose owner left',
    transfer: 'Give your room to someone in it',
    region: 'Pick the voice region',
    bitrate: 'Set the sound quality',
    delete: 'Delete your room',
  };
  return {
    group: { name: 'voice', description: 'Your temporary voice room' },
    ...(Object.fromEntries(
      tvActs.map((k) => [k, { on: true, name: k, description: describe[k] }]),
    ) as Record<TvAct, TvCommand>),
  };
};

export const tvDefaultStyle = (): TvRoomStyle => ({
  category: '',
  name: '{user.name}’s room',
  limit: 0,
  bitrate: 64,
  locked: false,
  hidden: false,
  chat: true,
});

export const tvNewHub = (id: string, channel = ''): TvHub => ({
  id,
  channel,
  ...tvDefaultStyle(),
});

export const tvDefault = (): TempVoice => ({
  hubs: [],
  create: tvDefaultStyle(),
  deleteAfter: 0,
  maxRooms: 1,
  bypassRole: '',
  remember: true,
  panel: {
    channel: '',
    message: '',
    buttons: tvActs.filter((a) => a !== 'region' && a !== 'bitrate'),
    inRooms: false,
    labels: true,
  },
  commands: tvDefaultCommands(),
});

/** What each plan allows. */
export const tvLimits = (plan?: string | null) => ({
  hubs: plan === 'plus' ? 10 : 1,
  maxRooms: 5,
  deleteAfter: 60,
  /** Members on a saved trusted or blocked list. */
  listed: 25,
});

/** A room made with the button or command waits this long for someone. */
export const TV_WAIT_MS = 60_000;

/** Bitrates people can pick, in kbps. */
export const tvBitrates = [8, 16, 32, 48, 64, 96, 128, 192, 256, 320, 384];
/** The highest bitrate a server's boost level allows, in kbps. */
export const tvMaxBitrate = (level: number) =>
  [96, 128, 256, 384][Math.max(0, Math.min(3, Math.floor(level || 0)))]!;

/** Discord's voice regions; '' lets Discord pick. */
export const tvRegions: { id: string; name: string }[] = [
  { id: '', name: 'Automatic' },
  { id: 'brazil', name: 'Brazil' },
  { id: 'hongkong', name: 'Hong Kong' },
  { id: 'india', name: 'India' },
  { id: 'japan', name: 'Japan' },
  { id: 'rotterdam', name: 'Rotterdam' },
  { id: 'singapore', name: 'Singapore' },
  { id: 'southafrica', name: 'South Africa' },
  { id: 'sydney', name: 'Sydney' },
  { id: 'us-central', name: 'US Central' },
  { id: 'us-east', name: 'US East' },
  { id: 'us-south', name: 'US South' },
  { id: 'us-west', name: 'US West' },
];
export const tvRegionName = (id: string | null) =>
  tvRegions.find((r) => r.id === (id ?? ''))?.name ?? id ?? 'Automatic';

/** A room's name from its pattern, within Discord's 100 characters. */
export function tvRoomName(
  pattern: string,
  ctx: { user: { name: string }; count: number },
) {
  const name = pattern
    .replace(/\{user\.name\}/g, ctx.user.name)
    .replace(/\{count\}/g, String(ctx.count))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return name || `${ctx.user.name}’s room`.slice(0, 100);
}

// Checks ----------------------------------------------------------------------

export type TvIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const itemId = /^[\w-]{1,40}$/;

/** Problems with how rooms start out, or null. */
function styleIssue(
  s: Partial<TvRoomStyle> | undefined,
  where: string,
  what: string,
  {
    categories,
    boostLevel,
  }: { categories?: Set<string> | undefined; boostLevel?: number | undefined },
): TvIssue | null {
  const missing = { at: '', problem: 'Some settings are missing.' };
  const at = (problem: string) => ({ at: where, problem });
  if (!s || typeof s !== 'object') return missing;
  if (typeof s.category !== 'string') return missing;
  if (s.category && !snowflake.test(s.category)) return missing;
  if (s.category && categories && !categories.has(s.category))
    return at(`The category for ${what} was deleted. Pick another one.`);
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 100)
    return at(`Give ${what} a name of up to 100 characters.`);
  if (!Number.isInteger(s.limit) || s.limit! < 0 || s.limit! > 99)
    return at(`The user limit for ${what} is 0 (no limit) to 99.`);
  if (!tvBitrates.includes(s.bitrate as number))
    return at(`Pick a bitrate for ${what} from the list.`);
  if (boostLevel !== undefined && s.bitrate! > tvMaxBitrate(boostLevel))
    return at(
      `Your server’s boost level allows up to ${tvMaxBitrate(boostLevel)} kbps. Pick a lower bitrate for ${what}.`,
    );
  for (const k of ['locked', 'hidden', 'chat'] as const)
    if (typeof s[k] !== 'boolean') return missing;
  return null;
}

/**
 * Checks settings sent by the dashboard. `voice` and `categories` are the
 * server's voice channels and categories, `roles` its roles, `templates`
 * its Studio templates. Returns the first problem, and where it is.
 */
export function tvIssue(
  input: unknown,
  {
    plan,
    voice,
    categories,
    channels,
    roles,
    templates,
    boostLevel,
  }: {
    plan?: string | null | undefined;
    voice?: Set<string> | undefined;
    categories?: Set<string> | undefined;
    channels?: Set<string> | undefined;
    roles?: Set<string> | undefined;
    templates?: Set<string> | undefined;
    boostLevel?: number | undefined;
  } = {},
): TvIssue | null {
  const x = input as Partial<TempVoice> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const limits = tvLimits(plan);
  const at = (where: string, problem: string) => ({ at: where, problem });

  if (!Array.isArray(x.hubs)) return missing;
  if (x.hubs.length > limits.hubs)
    return at(
      'hubs',
      limits.hubs === 1
        ? 'The Free plan has 1 hub. Upgrade to Plus for up to 10.'
        : `Use up to ${limits.hubs} hubs.`,
    );
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const [i, h] of x.hubs.entries()) {
    if (!h || typeof h !== 'object' || !itemId.test(h.id ?? '')) return missing;
    if (ids.has(h.id)) return missing;
    ids.add(h.id);
    const where = `hub:${h.id}`;
    const what = x.hubs.length > 1 ? `hub ${i + 1}’s rooms` : 'the hub’s rooms';
    if (typeof h.channel !== 'string' || !snowflake.test(h.channel))
      return at(where, 'Pick the voice channel members join to get a room.');
    if (voice && !voice.has(h.channel))
      return at(where, 'A hub channel was deleted. Pick another one.');
    if (seen.has(h.channel))
      return at(where, 'Two hubs use the same voice channel.');
    seen.add(h.channel);
    const s = styleIssue(h, where, what, { categories, boostLevel });
    if (s) return s;
  }
  const c = styleIssue(x.create, 'create', 'rooms made with Create room', {
    categories,
    boostLevel,
  });
  if (c) return c;

  if (
    !Number.isInteger(x.deleteAfter) ||
    x.deleteAfter! < 0 ||
    x.deleteAfter! > limits.deleteAfter
  )
    return at(
      'deleteAfter',
      `Empty rooms are deleted after 0 to ${limits.deleteAfter} seconds.`,
    );
  if (
    !Number.isInteger(x.maxRooms) ||
    x.maxRooms! < 1 ||
    x.maxRooms! > limits.maxRooms
  )
    return at(
      'maxRooms',
      `Members can own 1 to ${limits.maxRooms} rooms at once.`,
    );
  if (typeof x.bypassRole !== 'string') return missing;
  if (x.bypassRole) {
    if (!snowflake.test(x.bypassRole)) return missing;
    if (roles && !roles.has(x.bypassRole))
      return at('bypassRole', 'The bypass role was deleted. Pick another one.');
  }
  if (typeof x.remember !== 'boolean') return missing;

  const p = x.panel;
  if (!p || typeof p !== 'object') return missing;
  if (typeof p.channel !== 'string') return missing;
  if (p.channel) {
    if (!snowflake.test(p.channel)) return missing;
    if (channels && !channels.has(p.channel))
      return at(
        'panel:channel',
        'The panel’s channel was deleted. Pick another one.',
      );
  }
  if (typeof p.message !== 'string') return missing;
  if (p.message && !templateId.test(p.message)) return missing;
  if (p.message && templates && !templates.has(p.message))
    return at(
      'message',
      'The panel’s template was deleted. Pick or make another one.',
    );
  if (!Array.isArray(p.buttons)) return missing;
  if (
    p.buttons.some((b) => !tvActs.includes(b)) ||
    new Set(p.buttons).size !== p.buttons.length
  )
    return missing;
  if ((p.channel || p.inRooms) && !p.buttons.length)
    return at('panel:buttons', 'Pick at least one button for the panel.');
  if (typeof p.inRooms !== 'boolean' || typeof p.labels !== 'boolean')
    return missing;

  const cm = x.commands;
  if (!cm || typeof cm !== 'object' || !cm.group) return missing;
  if (typeof cm.group.name !== 'string' || !commandName.test(cm.group.name))
    return at(
      'command:group',
      'Command names are 1 to 32 lowercase letters, numbers, - or _.',
    );
  if (
    typeof cm.group.description !== 'string' ||
    !cm.group.description.trim() ||
    cm.group.description.length > 100
  )
    return at(
      'command:group',
      `Give /${cm.group.name} a description of up to 100.`,
    );
  const used = new Set<string>();
  for (const key of tvActs) {
    const cmd = cm[key];
    const where = `command:${key}`;
    if (!cmd || typeof cmd.on !== 'boolean') return missing;
    if (typeof cmd.name !== 'string' || !commandName.test(cmd.name))
      return at(
        where,
        'Command names are 1 to 32 lowercase letters, numbers, - or _.',
      );
    if (used.has(cmd.name))
      return at(
        where,
        `Two commands are called /${cm.group.name} ${cmd.name}.`,
      );
    used.add(cmd.name);
    if (
      typeof cmd.description !== 'string' ||
      !cmd.description.trim() ||
      cmd.description.length > 100
    )
      return at(
        where,
        `Give /${cm.group.name} ${cmd.name} a description of up to 100.`,
      );
  }
  return null;
}

const cleanStyle = (s: TvRoomStyle): TvRoomStyle => ({
  category: s.category,
  name: s.name.trim(),
  limit: s.limit,
  bitrate: s.bitrate,
  locked: s.locked,
  hidden: s.hidden,
  chat: s.chat,
});

/** Keeps only the known fields, so nothing else is stored. */
export function cleanTempVoice(c: TempVoice): TempVoice {
  return {
    hubs: c.hubs.map((h) => ({
      id: h.id,
      channel: h.channel,
      ...cleanStyle(h),
    })),
    create: cleanStyle(c.create),
    deleteAfter: c.deleteAfter,
    maxRooms: c.maxRooms,
    bypassRole: c.bypassRole,
    remember: c.remember,
    panel: {
      channel: c.panel.channel,
      message: c.panel.message,
      // Always in the panel's own order.
      buttons: tvActs.filter((a) => c.panel.buttons.includes(a)),
      inRooms: c.panel.inRooms,
      labels: c.panel.labels,
    },
    commands: {
      group: {
        name: c.commands.group.name,
        description: c.commands.group.description.trim(),
      },
      ...(Object.fromEntries(
        tvActs.map((k) => [
          k,
          {
            on: c.commands[k].on,
            name: c.commands[k].name,
            description: c.commands[k].description.trim(),
          },
        ]),
      ) as Record<TvAct, TvCommand>),
    },
  };
}

/**
 * Settings saved by an older version, with anything added since filled in
 * from the defaults.
 */
export function tvUpgrade(saved: Partial<TempVoice> | null | undefined) {
  const base = tvDefault();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    hubs: (saved.hubs ?? []).map((h) => ({ ...tvNewHub(h.id), ...h })),
    create: { ...base.create, ...saved.create },
    panel: { ...base.panel, ...saved.panel },
    commands: {
      ...base.commands,
      ...saved.commands,
      group: { ...base.commands.group, ...saved.commands?.group },
    },
  } as TempVoice;
}

/** The hub a voice channel is, if it's one. */
export const tvHubFor = (c: TempVoice, channelId: string | null) =>
  channelId ? c.hubs.find((h) => h.channel === channelId) : undefined;

// Rooms -----------------------------------------------------------------------

/** A permission overwrite as Discord takes it. */
export type TvOverwrite = {
  id: string;
  /** 0 for a role, 1 for a member. */
  type: 0 | 1;
  allow: string;
  deny: string;
};

/** A room Sparko made, as the bot, the server and the dashboard see it. */
export type TvRoom = {
  channelId: string;
  guildId: string;
  ownerId: string;
  ownerName: string;
  /** The hub it came from; '' for the panel or the command. */
  hubId: string;
  name: string;
  limit: number;
  locked: boolean;
  hidden: boolean;
  chat: boolean;
  trusted: string[];
  blocked: string[];
  /** Members in it right now. */
  members: number;
  /** "waiting" until someone first joins. */
  state: 'waiting' | 'open';
  /** When it last went empty, while it's empty. */
  emptySince: number | null;
  createdAt: number;
};

/** What a member asked Sparko to remember about their rooms. */
export type TvPrefs = {
  userId: string;
  userName: string;
  /** '' to use the hub's name. */
  name: string;
  /** null to use the hub's limit. */
  limit: number | null;
  locked: boolean;
  trusted: string[];
  blocked: string[];
  updatedAt: number;
};

/** Discord's permission bits rooms use. */
export const tvPerm = {
  manageChannels: 1n << 4n,
  stream: 1n << 9n,
  viewChannel: 1n << 10n,
  sendMessages: 1n << 11n,
  connect: 1n << 20n,
  speak: 1n << 21n,
  moveMembers: 1n << 24n,
  manageRoles: 1n << 28n,
} as const;
const P = tvPerm;

/**
 * The overwrites for one member or role in a room, on top of what the
 * category had for them. null when there's nothing to set.
 */
export function tvOverwriteFor(
  room: Pick<
    TvRoom,
    'ownerId' | 'locked' | 'hidden' | 'chat' | 'trusted' | 'blocked'
  >,
  target: { id: string; type: 0 | 1 },
  ids: { guildId: string; botId: string; bypassRole: string },
  base: TvOverwrite[] = [],
): TvOverwrite | null {
  const was = base.find((o) => o.id === target.id && o.type === target.type);
  let allow = BigInt(was?.allow ?? '0');
  let deny = BigInt(was?.deny ?? '0');
  const give = (bits: bigint) => {
    allow |= bits;
    deny &= ~bits;
  };
  const take = (bits: bigint) => {
    deny |= bits;
    allow &= ~bits;
  };
  if (target.type === 0 && target.id === ids.guildId) {
    if (room.locked) take(P.connect);
    if (room.hidden) take(P.viewChannel);
    if (!room.chat) take(P.sendMessages);
  } else if (target.type === 0 && target.id === ids.bypassRole) {
    give(P.viewChannel | P.connect);
  } else if (target.type === 1 && target.id === ids.botId) {
    give(
      P.viewChannel |
        P.connect |
        P.sendMessages |
        P.manageChannels |
        P.moveMembers,
    );
  } else if (target.type === 1 && target.id === room.ownerId) {
    give(P.viewChannel | P.connect | P.speak | P.stream | P.sendMessages);
  } else if (target.type === 1 && room.blocked.includes(target.id)) {
    take(P.connect);
  } else if (target.type === 1 && room.trusted.includes(target.id)) {
    give(P.viewChannel | P.connect);
  }
  if (!allow && !deny && !was) return null;
  return {
    id: target.id,
    type: target.type,
    allow: allow.toString(),
    deny: deny.toString(),
  };
}

/** Every overwrite a new room starts with: the category's, then Sparko's. */
export function tvOverwrites(
  room: Pick<
    TvRoom,
    'ownerId' | 'locked' | 'hidden' | 'chat' | 'trusted' | 'blocked'
  >,
  ids: { guildId: string; botId: string; bypassRole: string },
  base: TvOverwrite[] = [],
) {
  const targets = new Map<string, { id: string; type: 0 | 1 }>();
  const add = (id: string, type: 0 | 1) => {
    if (id) targets.set(`${type}:${id}`, { id, type });
  };
  for (const o of base) add(o.id, o.type);
  add(ids.guildId, 0);
  add(ids.bypassRole, 0);
  add(ids.botId, 1);
  add(room.ownerId, 1);
  for (const id of room.trusted) add(id, 1);
  for (const id of room.blocked) add(id, 1);
  return [...targets.values()]
    .map((t) => tvOverwriteFor(room, t, ids, base))
    .filter((o): o is TvOverwrite => !!o);
}

/** Whether a room is due to be deleted at `now`. */
export function tvDue(c: TempVoice, room: TvRoom, now: number) {
  if (room.members > 0) return false;
  if (room.state === 'waiting') return now - room.createdAt >= TV_WAIT_MS;
  return (
    room.emptySince !== null && now - room.emptySince >= c.deleteAfter * 1000
  );
}

// The panel -------------------------------------------------------------------

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

export type TvPreset = {
  id: string;
  name: string;
  about: string;
  message: StudioMessage;
};

/** Ready-made panel messages; the first is Sparko's own. */
export const tvPresets: TvPreset[] = [
  {
    id: 'tv-panel',
    name: 'Voice control panel',
    about: 'An embed that explains each button.',
    message: embedMessage('Voice control panel', {
      title: '🎧 Your voice room',
      description:
        'Join a hub channel to get your own room, or press **Create room**.\nUse the buttons below to change the room you own.\n\n🔒 **Lock** · only trusted members can join\n🙈 **Hide** · only trusted members can see it\n🤝 **Trust** · let a friend in when it’s locked\n👑 **Claim** · take over a room its owner left',
      color: '#60A5FA',
      footer: '{server} · rooms are deleted when they’re empty',
    }),
  },
  {
    id: 'tv-panel-short',
    name: 'Short and simple',
    about: 'One line above the buttons.',
    message: embedMessage('Voice panel', {
      title: '🔊 Voice room controls',
      description: 'Manage the room you own with the buttons below.',
      color: '#34D399',
    }),
  },
  {
    id: 'tv-panel-v2',
    name: 'Modern panel',
    about: 'A Components V2 card.',
    message: v2Message(
      'Modern voice panel',
      '#A78BFA',
      '## 🎧 Voice rooms\nJoin a hub to get a room of your own. It’s yours to rename, lock, hide or hand over.\n{separator}\n-# Rooms are deleted when they’re empty · {server}',
    ),
  },
];

/** Sparko's own panel, used until the server picks a template. */
export const tvDefaultMessage = () => tvPresets[0]!.message;

/** How many of Discord's five rows the panel's buttons take. */
export const tvPanelRows = (c: TempVoice) =>
  Math.ceil(c.panel.buttons.length / 5);

/** Problems with a panel template next to the buttons, or null. */
export function tvMessageIssue(m: StudioMessage, c: TempVoice): TvIssue | null {
  const fixed = tvPanelRows(c);
  if (m.layout !== 'v2' && componentRows(m.components).length + fixed > 5)
    return {
      at: 'message',
      problem: `The panel’s buttons take ${fixed} of Discord’s five rows, so the message can have up to ${5 - fixed} ${5 - fixed === 1 ? 'row' : 'rows'} of its own.`,
    };
  return null;
}

/** The custom id of a panel button. */
export const tvCustomId = (a: TvAct) => `tv:${a}`;

/** The panel's buttons, five to a row. */
export function tvButtonRows(c: TempVoice) {
  const style: Partial<Record<TvAct, number>> = { create: 3, delete: 4 };
  const list = tvActs.filter((a) => c.panel.buttons.includes(a));
  const rows: object[] = [];
  for (let i = 0; i < list.length; i += 5)
    rows.push({
      type: 1,
      components: list.slice(i, i + 5).map((a) => ({
        type: 2,
        style: style[a] ?? 2,
        custom_id: tvCustomId(a),
        emoji: { name: tvActEmoji[a] },
        ...(c.panel.labels ? { label: tvActNames[a] } : {}),
      })),
    });
  return rows;
}

/** A room, for {room}, {room.name}, {room.owner} and {room.limit}. */
export const tvRoomVars = (room: {
  channelId: string;
  name: string;
  ownerId: string;
  limit: number;
}): Record<string, string> => ({
  room: `<#${room.channelId}>`,
  'room.name': room.name,
  'room.owner': `<@${room.ownerId}>`,
  'room.limit': room.limit ? String(room.limit) : 'No limit',
});

type Payload = Record<string, unknown> & { components?: object[] };

/** The control panel: the template's text, then the fixed buttons. */
export function tvPanelPayload(
  message: StudioMessage,
  c: TempVoice,
  ctx: { now: number; room?: Parameters<typeof tvRoomVars>[0] } & StudioVars,
) {
  const body = studioPayload(message, {
    ...ctx,
    extra: { ...ctx.extra, ...(ctx.room ? tvRoomVars(ctx.room) : {}) },
  }) as Payload;
  body.components = [...(body.components ?? []), ...tvButtonRows(c)];
  return body;
}

// Commands --------------------------------------------------------------------

/** The /voice command and its subcommands, as Discord registers them. */
export function tvCommandBodies(c: TempVoice) {
  const member = (description: string) => [
    { type: 6, name: 'member', description, required: true },
  ];
  const body: Record<TvAct, object[]> = {
    create: [
      {
        type: 3,
        name: 'name',
        description: 'The room’s name',
        required: false,
        max_length: 100,
      },
      {
        type: 4,
        name: 'limit',
        description: 'How many can join, 0 for no limit',
        required: false,
        min_value: 0,
        max_value: 99,
      },
    ],
    rename: [
      {
        type: 3,
        name: 'name',
        description: 'The new name',
        required: true,
        max_length: 100,
      },
    ],
    limit: [
      {
        type: 4,
        name: 'limit',
        description: 'How many can join, 0 for no limit',
        required: true,
        min_value: 0,
        max_value: 99,
      },
    ],
    lock: [],
    unlock: [],
    hide: [],
    show: [],
    trust: member('Who can join'),
    untrust: member('Who to take off the list'),
    invite: member('Who to invite'),
    kick: member('Who to disconnect'),
    block: member('Who to block'),
    unblock: member('Who to unblock'),
    claim: [],
    transfer: member('Who gets the room'),
    region: [
      {
        type: 3,
        name: 'region',
        description: 'The voice region',
        required: true,
        choices: tvRegions.map((r) => ({
          name: r.name,
          value: r.id || 'automatic',
        })),
      },
    ],
    bitrate: [
      {
        type: 4,
        name: 'kbps',
        description: 'Sound quality in kbps; boosts allow more',
        required: true,
        choices: tvBitrates.map((b) => ({ name: `${b} kbps`, value: b })),
      },
    ],
    delete: [],
  };
  const subs = tvActs
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

/** Which /voice subcommand a typed command is, in this server. */
export const tvCommandFor = (c: TempVoice, name: string, sub: string | null) =>
  name === c.commands.group.name
    ? tvActs.find((k) => c.commands[k].on && c.commands[k].name === sub)
    : undefined;

// Logs ------------------------------------------------------------------------

export type TvLogAction =
  | 'created'
  | 'renamed'
  | 'limit'
  | 'locked'
  | 'unlocked'
  | 'hidden'
  | 'shown'
  | 'owner'
  | 'deleted'
  | 'failed';
export type TvLogEntry = {
  id: string;
  action: TvLogAction;
  /** The room it's about, if any. */
  roomId: string;
  roomName: string;
  userId: string;
  userName: string;
  detail: string;
  at: number;
};

/** One log line, like "[LOCKED] @rhea locked Rhea’s room". */
export function tvLogLine(e: TvLogEntry) {
  const who = `@${e.userName}`;
  const room = e.roomName ? `“${e.roomName}”` : 'a room';
  const more = e.detail ? `: ${e.detail}` : '';
  switch (e.action) {
    case 'created':
      return `[CREATED] ${who} got ${room}${more}`;
    case 'renamed':
      return `[RENAMED] ${who} renamed ${room}${more}`;
    case 'limit':
      return `[LIMIT] ${who} changed ${room}’s limit${more}`;
    case 'locked':
      return `[LOCKED] ${who} locked ${room}`;
    case 'unlocked':
      return `[UNLOCKED] ${who} unlocked ${room}`;
    case 'hidden':
      return `[HIDDEN] ${who} hid ${room}`;
    case 'shown':
      return `[SHOWN] ${who} showed ${room} again`;
    case 'owner':
      return `[OWNER] ${room} now belongs to ${who}${more}`;
    case 'deleted':
      return `[DELETED] ${room} was deleted${more}`;
    default:
      return `[FAILED] ${room}${more}`;
  }
}
