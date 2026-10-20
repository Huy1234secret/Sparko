import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import { normaliseStudio, type StudioMessage } from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import { getPosted, setPosted } from './tickets.ts';
import { rememberPost } from './studio-actions.ts';
import {
  TV_MODULE,
  tvBitrates,
  tvDefaultMessage,
  tvDue,
  tvLimits,
  tvMaxBitrate,
  tvOverwriteFor,
  tvOverwrites,
  tvPanelPayload,
  tvRegionName,
  tvRegions,
  tvRoomName,
  tvUpgrade,
  type TempVoice,
  type TvAct,
  type TvLogEntry,
  type TvOverwrite,
  type TvPrefs,
  type TvRoom,
  type TvRoomStyle,
} from './temp-voice.ts';

export * from './temp-voice.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
const VOICE = 2;
const list = (json: unknown) =>
  typeof json === 'string' ? (JSON.parse(json) as string[]) : [];

export function tvConfigOf(db: Db, guildId: string) {
  const m = getModule<TempVoice>(db, guildId, TV_MODULE);
  return { on: m.on, config: tvUpgrade(m.config) };
}

// Rooms -----------------------------------------------------------------------

const roomOf = (r: Row): TvRoom => ({
  channelId: r.channel_id as string,
  guildId: r.guild_id as string,
  ownerId: r.owner_id as string,
  ownerName: r.owner_name as string,
  hubId: r.hub_id as string,
  name: r.name as string,
  limit: r.user_limit as number,
  locked: r.locked === 1,
  hidden: r.hidden === 1,
  chat: r.chat === 1,
  trusted: list(r.trusted),
  blocked: list(r.blocked),
  members: r.members as number,
  state: r.state === 'open' ? 'open' : 'waiting',
  emptySince: (r.empty_since as number | null) ?? null,
  createdAt: r.created_at as number,
});

export function tvRoom(db: Db, channelId: string) {
  const r = db
    .prepare('SELECT * FROM tv_rooms WHERE channel_id = ?')
    .get(channelId) as Row | undefined;
  return r ? roomOf(r) : null;
}

/** A server's open rooms, newest first. */
export function tvRooms(db: Db, guildId: string) {
  return (
    db
      .prepare(
        'SELECT * FROM tv_rooms WHERE guild_id = ? ORDER BY created_at DESC',
      )
      .all(guildId) as Row[]
  ).map(roomOf);
}

/** The rooms a member owns, newest first. */
export function tvRoomsOwned(db: Db, guildId: string, userId: string) {
  return (
    db
      .prepare(
        `SELECT * FROM tv_rooms WHERE guild_id = ? AND owner_id = ?
         ORDER BY created_at DESC`,
      )
      .all(guildId, userId) as Row[]
  ).map(roomOf);
}

export function tvRoomCount(db: Db, guildId: string) {
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM tv_rooms WHERE guild_id = ?')
    .get(guildId) as { n: number };
  return n;
}

/** The category's overwrites a room started from. */
function baseOf(db: Db, channelId: string): TvOverwrite[] {
  const r = db
    .prepare('SELECT base_json FROM tv_rooms WHERE channel_id = ?')
    .get(channelId) as Row | undefined;
  return r ? (JSON.parse(r.base_json as string) as TvOverwrite[]) : [];
}

function saveRoom(db: Db, room: TvRoom, now: number) {
  db.prepare(
    `UPDATE tv_rooms SET owner_id = ?, owner_name = ?, name = ?, user_limit = ?,
       locked = ?, hidden = ?, chat = ?, trusted = ?, blocked = ?, updated_at = ?
     WHERE channel_id = ?`,
  ).run(
    room.ownerId,
    room.ownerName,
    room.name,
    room.limit,
    room.locked ? 1 : 0,
    room.hidden ? 1 : 0,
    room.chat ? 1 : 0,
    JSON.stringify(room.trusted),
    JSON.stringify(room.blocked),
    now,
    room.channelId,
  );
}

const dropRoom = (db: Db, channelId: string) =>
  db.prepare('DELETE FROM tv_rooms WHERE channel_id = ?').run(channelId);

// Saved preferences -----------------------------------------------------------

const prefsOf = (r: Row): TvPrefs => ({
  userId: r.user_id as string,
  userName: r.user_name as string,
  name: r.name as string,
  limit: (r.user_limit as number | null) ?? null,
  locked: r.locked === 1,
  trusted: list(r.trusted),
  blocked: list(r.blocked),
  updatedAt: r.updated_at as number,
});

export function getTvPrefs(db: Db, guildId: string, userId: string) {
  const r = db
    .prepare('SELECT * FROM tv_prefs WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as Row | undefined;
  return r ? prefsOf(r) : null;
}

/** Saved preferences for Storage, matching what staff typed. */
export function listTvPrefs(
  db: Db,
  guildId: string,
  { query = '', limit = 500 } = {},
) {
  const q = query.trim();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return (
    db
      .prepare(
        `SELECT * FROM tv_prefs WHERE guild_id = ?
           AND (? = '' OR user_id = ? OR user_name LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(guildId, q, q, like, like, limit) as Row[]
  ).map(prefsOf);
}

export function tvPrefsCount(db: Db, guildId: string) {
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM tv_prefs WHERE guild_id = ?')
    .get(guildId) as { n: number };
  return n;
}

/** Forgets what a member saved. False when there was nothing. */
export function resetTvPrefs(db: Db, guildId: string, userId: string) {
  return (
    db
      .prepare('DELETE FROM tv_prefs WHERE guild_id = ? AND user_id = ?')
      .run(guildId, userId).changes > 0
  );
}

/** Remembers a room's settings for its owner, when the server keeps them. */
export function tvRemember(
  db: Db,
  room: TvRoom,
  now: number,
  { renamed = false } = {},
) {
  const { config: c } = tvConfigOf(db, room.guildId);
  if (!c.remember) return;
  const old = getTvPrefs(db, room.guildId, room.ownerId);
  const cap = tvLimits().listed;
  db.prepare(
    `INSERT INTO tv_prefs (guild_id, user_id, user_name, name, user_limit, locked,
       trusted, blocked, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET user_name = excluded.user_name,
       name = excluded.name, user_limit = excluded.user_limit,
       locked = excluded.locked, trusted = excluded.trusted,
       blocked = excluded.blocked, updated_at = excluded.updated_at`,
  ).run(
    room.guildId,
    room.ownerId,
    room.ownerName,
    // Only a name they picked is kept; otherwise the hub's pattern is used.
    renamed ? room.name : (old?.name ?? ''),
    room.limit,
    room.locked ? 1 : 0,
    JSON.stringify(room.trusted.slice(-cap)),
    JSON.stringify(room.blocked.slice(-cap)),
    now,
  );
}

// The log ---------------------------------------------------------------------

export function addTvLog(db: Db, guildId: string, e: Omit<TvLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO tv_log (guild_id, action, room_id, room_name, user_id, user_name, detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    e.action,
    e.roomId,
    e.roomName,
    e.userId,
    e.userName,
    e.detail.slice(0, 300),
    e.at,
  );
  db.prepare(
    `DELETE FROM tv_log WHERE guild_id = ? AND id <= (
       SELECT id FROM tv_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listTvLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM tv_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): TvLogEntry => ({
      id: String(r.id),
      action: r.action as TvLogEntry['action'],
      roomId: r.room_id as string,
      roomName: r.room_name as string,
      userId: r.user_id as string,
      userName: r.user_name as string,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
}

const logRoom = (
  db: Db,
  room: TvRoom,
  action: TvLogEntry['action'],
  by: { id: string; name: string },
  detail: string,
  now: number,
) =>
  addTvLog(db, room.guildId, {
    action,
    roomId: room.channelId,
    roomName: room.name,
    userId: by.id,
    userName: by.name,
    detail,
    at: now,
  });

// Discord ---------------------------------------------------------------------

const NEEDS =
  'Sparko needs Manage Channels, Manage Roles and Move Members for voice rooms. Check its role in Server Settings → Roles.';

/** A Discord error, in words for the member or the server owner. */
export function tvExplain(e: unknown, what = 'that'): unknown {
  if (e instanceof Plain) return e;
  if (e instanceof DiscordError) {
    if (
      e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess
    )
      return new Plain(`Sparko couldn’t do ${what}. ${NEEDS}`);
    if (e.code === DiscordCodes.unknownChannel)
      return new Plain('That room no longer exists.');
    if (e.status === 429)
      return new Plain(
        'Discord is limiting changes right now. Try again in a minute.',
      );
    if (e.status === 400)
      return new Plain(`Discord didn’t accept it: ${e.message}`);
  }
  return e;
}

const gone = (e: unknown) =>
  e instanceof DiscordError &&
  (e.code === DiscordCodes.unknownChannel || e.status === 404);

/** Moves a member into a voice channel, or disconnects them with null. */
export function tvMoveMember(
  rest: Rest,
  guildId: string,
  userId: string,
  channelId: string | null,
) {
  return rest.patch(
    `/guilds/${guildId}/members/${userId}`,
    { channel_id: channelId },
    channelId
      ? 'Moved into their voice room'
      : 'Disconnected from a voice room',
  );
}

export type TvMember = { id: string; name: string };

/**
 * Makes a room for a member: from a hub, the panel or /voice create. It
 * waits for someone to join, and is deleted if nobody does within a minute.
 */
export async function tvMakeRoom(
  rest: Rest,
  db: Db,
  input: {
    guildId: string;
    owner: TvMember;
    style: TvRoomStyle;
    /** The hub it's from; '' for the panel or the command. */
    hubId: string;
    /** The category it goes in, already worked out. */
    parentId: string | null;
    /** The category's overwrites, so private categories stay private. */
    base: TvOverwrite[];
    botId: string;
    boostLevel: number;
    /** A name and limit the member asked for. */
    name?: string | null | undefined;
    limit?: number | null | undefined;
    /** How it was made, for the log. */
    via: string;
  },
  now = Date.now(),
) {
  const { config: c } = tvConfigOf(db, input.guildId);
  const prefs = c.remember
    ? getTvPrefs(db, input.guildId, input.owner.id)
    : null;
  const style = input.style;
  const room: TvRoom = {
    channelId: '',
    guildId: input.guildId,
    ownerId: input.owner.id,
    ownerName: input.owner.name,
    hubId: input.hubId,
    name:
      input.name?.trim().slice(0, 100) ||
      prefs?.name ||
      tvRoomName(style.name, {
        user: input.owner,
        count: tvRoomCount(db, input.guildId) + 1,
      }),
    limit: input.limit ?? prefs?.limit ?? style.limit,
    locked: prefs ? prefs.locked : style.locked,
    hidden: style.hidden,
    chat: style.chat,
    trusted: prefs?.trusted ?? [],
    blocked: prefs?.blocked ?? [],
    members: 0,
    state: 'waiting',
    emptySince: now,
    createdAt: now,
  };
  const ids = {
    guildId: input.guildId,
    botId: input.botId,
    bypassRole: c.bypassRole,
  };
  let made: { id: string };
  try {
    made = await rest.post<{ id: string }>(
      `/guilds/${input.guildId}/channels`,
      {
        name: room.name,
        type: VOICE,
        parent_id: input.parentId,
        user_limit: room.limit,
        bitrate: Math.min(style.bitrate, tvMaxBitrate(input.boostLevel)) * 1000,
        permission_overwrites: tvOverwrites(room, ids, input.base),
      },
      `Temporary voice room for ${input.owner.name}`,
    );
  } catch (e) {
    addTvLog(db, input.guildId, {
      action: 'failed',
      roomId: '',
      roomName: room.name,
      userId: input.owner.id,
      userName: input.owner.name,
      detail:
        e instanceof DiscordError &&
        (e.code === DiscordCodes.missingPermissions ||
          e.code === DiscordCodes.missingAccess)
          ? `Sparko couldn’t make the room. ${NEEDS}`
          : 'Sparko couldn’t make the room.',
      at: now,
    });
    throw tvExplain(e, 'make your room');
  }
  room.channelId = made.id;
  db.prepare(
    `INSERT INTO tv_rooms (channel_id, guild_id, owner_id, owner_name, hub_id, name,
       user_limit, locked, hidden, chat, trusted, blocked, base_json, members,
       state, empty_since, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'waiting', ?, ?, ?)`,
  ).run(
    room.channelId,
    room.guildId,
    room.ownerId,
    room.ownerName,
    room.hubId,
    room.name,
    room.limit,
    room.locked ? 1 : 0,
    room.hidden ? 1 : 0,
    room.chat ? 1 : 0,
    JSON.stringify(room.trusted),
    JSON.stringify(room.blocked),
    JSON.stringify(input.base),
    now,
    now,
    now,
  );
  logRoom(db, room, 'created', input.owner, input.via, now);
  if (c.panel.inRooms && c.panel.buttons.length)
    await tvPostInRoom(rest, db, room, now).catch(() => {});
  return room;
}

/**
 * Someone joined a hub: makes their room and moves them in. A member who
 * already owns as many rooms as allowed is moved into their newest one.
 */
export async function tvJoinHub(
  rest: Rest,
  db: Db,
  input: {
    guildId: string;
    hubChannel: string;
    user: TvMember;
    parentId: string | null;
    base: TvOverwrite[];
    botId: string;
    boostLevel: number;
    /** They have the bypass role. */
    bypass: boolean;
  },
  now = Date.now(),
) {
  const { on, config: c } = tvConfigOf(db, input.guildId);
  const hub = c.hubs.find((h) => h.channel === input.hubChannel);
  if (!on || !hub) return null;
  const owned = tvRoomsOwned(db, input.guildId, input.user.id);
  if (!input.bypass && owned.length >= c.maxRooms) {
    await tvMoveMember(
      rest,
      input.guildId,
      input.user.id,
      owned[0]!.channelId,
    ).catch(() => {});
    return { room: owned[0]!, made: false };
  }
  const room = await tvMakeRoom(
    rest,
    db,
    {
      guildId: input.guildId,
      owner: input.user,
      style: hub,
      hubId: hub.id,
      parentId: input.parentId,
      base: input.base,
      botId: input.botId,
      boostLevel: input.boostLevel,
      via: 'joined the hub',
    },
    now,
  );
  // If they already left the hub, the room waits a minute, then goes.
  await tvMoveMember(rest, input.guildId, input.user.id, room.channelId).catch(
    () => {},
  );
  return { room, made: true };
}

/** How many are in a room now. Empty rooms start counting down. */
export function tvPresence(
  db: Db,
  channelId: string,
  members: number,
  now = Date.now(),
) {
  db.prepare(
    `UPDATE tv_rooms SET members = ?,
       state = CASE WHEN ? > 0 THEN 'open' ELSE state END,
       empty_since = CASE WHEN ? > 0 THEN NULL ELSE COALESCE(empty_since, ?) END
     WHERE channel_id = ?`,
  ).run(members, members, members, now, channelId);
  return tvRoom(db, channelId);
}

const deletedWhy = {
  empty: 'it was empty',
  owner: 'by its owner',
  staff: 'from the dashboard',
} as const;

/** Deletes a room in Discord and forgets it. */
export async function tvDeleteRoom(
  rest: Rest,
  db: Db,
  room: TvRoom,
  why: keyof typeof deletedWhy,
  by: TvMember,
  now = Date.now(),
) {
  try {
    await rest.delete(
      `/channels/${room.channelId}`,
      why === 'empty' ? 'The voice room was empty' : `Deleted by ${by.name}`,
    );
  } catch (e) {
    if (!gone(e)) throw tvExplain(e, 'delete the room');
  }
  dropRoom(db, room.channelId);
  logRoom(
    db,
    room,
    'deleted',
    by,
    why === 'staff' ? `${deletedWhy.staff} by @${by.name}` : deletedWhy[why],
    now,
  );
}

/** A room's channel was deleted in Discord: forget it. */
export function tvGone(db: Db, channelId: string, now = Date.now()) {
  const room = tvRoom(db, channelId);
  if (!room) return null;
  dropRoom(db, channelId);
  logRoom(
    db,
    room,
    'deleted',
    { id: '0', name: 'Sparko' },
    'someone deleted it in Discord',
    now,
  );
  return room;
}

/**
 * After a restart: rooms whose channel is gone are forgotten, and every
 * room's member count is read again, so empty ones get cleaned up.
 * `members` is how many are in a channel, or null when it no longer exists.
 */
export function tvReconcile(
  db: Db,
  guildId: string,
  members: (channelId: string) => number | null,
  now = Date.now(),
) {
  let forgotten = 0;
  for (const room of tvRooms(db, guildId)) {
    const n = members(room.channelId);
    if (n === null) {
      tvGone(db, room.channelId, now);
      forgotten++;
    } else tvPresence(db, room.channelId, n, now);
  }
  return forgotten;
}

/**
 * Deletes rooms that have been empty long enough, in every server Sparko
 * is in. Rooms are cleaned up even after the module is switched off.
 */
export async function tvSweep(
  rest: Rest,
  db: Db,
  now = Date.now(),
  inGuild: (guildId: string) => boolean = () => true,
) {
  const empty = (
    db
      .prepare(
        'SELECT * FROM tv_rooms WHERE members = 0 AND empty_since IS NOT NULL',
      )
      .all() as Row[]
  ).map(roomOf);
  const configs = new Map<string, TempVoice>();
  let deleted = 0;
  for (const room of empty) {
    if (!inGuild(room.guildId)) continue;
    let c = configs.get(room.guildId);
    if (!c) {
      c = tvConfigOf(db, room.guildId).config;
      configs.set(room.guildId, c);
    }
    if (!tvDue(c, room, now)) continue;
    try {
      await tvDeleteRoom(
        rest,
        db,
        room,
        'empty',
        { id: '0', name: 'Sparko' },
        now,
      );
      deleted++;
    } catch (e) {
      // Tried again in 10 minutes, so the log isn't flooded.
      db.prepare(
        'UPDATE tv_rooms SET state = ?, empty_since = ? WHERE channel_id = ?',
      ).run('open', now + 10 * 60_000, room.channelId);
      logRoom(
        db,
        room,
        'failed',
        { id: '0', name: 'Sparko' },
        e instanceof Plain
          ? e.message
          : 'Sparko couldn’t delete the empty room.',
        now,
      );
    }
  }
  return deleted;
}

/** Servers with temporary voice on, or with rooms still to clean up. */
export function tvGuilds(db: Db) {
  return (
    db
      .prepare(
        `SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1
         UNION SELECT DISTINCT guild_id FROM tv_rooms`,
      )
      .all(TV_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// Room actions ----------------------------------------------------------------

export const TV_OWNER_ONLY = 'Only the room’s owner can do this.';

const mentions = (people: TvMember[]) =>
  people.map((p) => `<@${p.id}>`).join(', ');

/**
 * A button or /voice subcommand on a room: checks the member owns it (or
 * can claim it), changes it in Discord, and says what happened. Problems
 * are thrown as Plain, already in words for the member.
 */
export async function tvAction(
  rest: Rest,
  db: Db,
  input: {
    room: TvRoom;
    act: Exclude<TvAct, 'create'>;
    by: TvMember;
    /** Who's in the room right now. */
    present: string[];
    /** Members picked, for trust, kick, block and the like. */
    targets?: (TvMember & { bot?: boolean })[];
    /** A name, limit, region id or bitrate. */
    value?: string | number | null;
    botId: string;
    boostLevel: number;
  },
  now = Date.now(),
): Promise<string> {
  const { config: c } = tvConfigOf(db, input.room.guildId);
  const room = { ...input.room };
  const { by, act } = input;
  if (act !== 'claim' && room.ownerId !== by.id) throw new Plain(TV_OWNER_ONLY);
  const ids = {
    guildId: room.guildId,
    botId: input.botId,
    bypassRole: c.bypassRole,
  };
  const path = `/channels/${room.channelId}`;
  const base = baseOf(db, room.channelId);
  /** Sets (or clears) one member's or role's overwrite to match the room. */
  const put = async (id: string, type: 0 | 1) => {
    const o = tvOverwriteFor(room, { id, type }, ids, base);
    if (o)
      await rest.put(`${path}/permissions/${id}`, {
        type,
        allow: o.allow,
        deny: o.deny,
      });
    else await rest.delete(`${path}/permissions/${id}`).catch(() => {});
  };
  const people = (input.targets ?? []).filter(
    (t) => !t.bot && t.id !== by.id && t.id !== input.botId,
  );
  const needPeople = () => {
    if (!people.length)
      throw new Plain(
        input.targets?.length
          ? 'Pick someone other than yourself or a bot.'
          : 'Pick a member first.',
      );
  };
  try {
    switch (act) {
      case 'rename': {
        const name = String(input.value ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100);
        if (!name) throw new Plain('Give the room a name.');
        if (name === room.name)
          return `Your room is already called **${name}**.`;
        try {
          await rest.patch(path, { name }, `Renamed by ${by.name}`);
        } catch (e) {
          if (e instanceof DiscordError && e.status === 429)
            throw new Plain(
              'Discord lets a channel be renamed twice every 10 minutes. Try again in a few minutes.',
            );
          throw e;
        }
        const old = room.name;
        room.name = name;
        saveRoom(db, room, now);
        logRoom(db, room, 'renamed', by, `“${old}” → “${name}”`, now);
        tvRemember(db, room, now, { renamed: true });
        return `Renamed your room to **${name}**.`;
      }
      case 'limit': {
        const n = Number(input.value);
        if (!Number.isInteger(n) || n < 0 || n > 99)
          throw new Plain('Write a number from 0 (no limit) to 99.');
        await rest.patch(path, { user_limit: n });
        room.limit = n;
        saveRoom(db, room, now);
        logRoom(db, room, 'limit', by, n ? `${n} people` : 'no limit', now);
        tvRemember(db, room, now);
        return n
          ? `Up to **${n}** can be in your room now.`
          : 'Your room has no limit now.';
      }
      case 'lock':
      case 'unlock': {
        const locked = act === 'lock';
        if (room.locked === locked)
          return `Your room is already ${locked ? 'locked' : 'unlocked'}.`;
        room.locked = locked;
        await put(room.guildId, 0);
        saveRoom(db, room, now);
        logRoom(db, room, locked ? 'locked' : 'unlocked', by, '', now);
        tvRemember(db, room, now);
        return locked
          ? '🔒 Locked. Only trusted members can join now.'
          : '🔓 Unlocked. Anyone can join.';
      }
      case 'hide':
      case 'show': {
        const hidden = act === 'hide';
        if (room.hidden === hidden)
          return `Your room is already ${hidden ? 'hidden' : 'shown'}.`;
        room.hidden = hidden;
        await put(room.guildId, 0);
        saveRoom(db, room, now);
        logRoom(db, room, hidden ? 'hidden' : 'shown', by, '', now);
        return hidden
          ? '🙈 Hidden. Only trusted members can see your room now.'
          : '👁️ Everyone can see your room again.';
      }
      case 'trust':
      case 'invite': {
        needPeople();
        for (const p of people) {
          room.blocked = room.blocked.filter((id) => id !== p.id);
          if (!room.trusted.includes(p.id)) room.trusted.push(p.id);
          await put(p.id, 1);
        }
        saveRoom(db, room, now);
        if (act === 'trust') {
          tvRemember(db, room, now);
          return `🤝 Trusted ${mentions(people)}. They can join even when your room is locked or hidden.`;
        }
        const link = `https://discord.com/channels/${room.guildId}/${room.channelId}`;
        const sent: TvMember[] = [];
        for (const p of people)
          try {
            const dm = await rest.post<{ id: string }>('/users/@me/channels', {
              recipient_id: p.id,
            });
            await rest.post(`/channels/${dm.id}/messages`, {
              content: `📨 **${by.name}** invited you to their voice room **${room.name}**: ${link}`,
              allowed_mentions: { parse: [] },
            });
            sent.push(p);
          } catch {
            // People who don't take DMs can still join with the link.
          }
        const missed = people.filter((p) => !sent.includes(p));
        return [
          sent.length ? `📨 Invited ${mentions(sent)}.` : '',
          missed.length
            ? `${mentions(missed)} ${missed.length === 1 ? 'doesn’t' : 'don’t'} take DMs, but can join now: ${link}`
            : '',
        ]
          .filter(Boolean)
          .join(' ');
      }
      case 'untrust': {
        needPeople();
        room.trusted = room.trusted.filter(
          (id) => !people.some((p) => p.id === id),
        );
        for (const p of people) await put(p.id, 1);
        saveRoom(db, room, now);
        tvRemember(db, room, now);
        return `Took ${mentions(people)} off your trusted list.`;
      }
      case 'kick': {
        needPeople();
        const inside = people.filter((p) => input.present.includes(p.id));
        if (!inside.length) throw new Plain('They aren’t in your room.');
        for (const p of inside)
          await tvMoveMember(rest, room.guildId, p.id, null);
        return `👢 Disconnected ${mentions(inside)}.`;
      }
      case 'block': {
        needPeople();
        for (const p of people) {
          room.trusted = room.trusted.filter((id) => id !== p.id);
          if (!room.blocked.includes(p.id)) room.blocked.push(p.id);
          await put(p.id, 1);
          if (input.present.includes(p.id))
            await tvMoveMember(rest, room.guildId, p.id, null);
        }
        saveRoom(db, room, now);
        tvRemember(db, room, now);
        return `⛔ Blocked ${mentions(people)}. They can’t join your room.`;
      }
      case 'unblock': {
        needPeople();
        room.blocked = room.blocked.filter(
          (id) => !people.some((p) => p.id === id),
        );
        for (const p of people) await put(p.id, 1);
        saveRoom(db, room, now);
        tvRemember(db, room, now);
        return `♻️ Unblocked ${mentions(people)}.`;
      }
      case 'claim': {
        if (room.ownerId === by.id) return 'This room is already yours.';
        if (!input.present.includes(by.id))
          throw new Plain('Join the room first, then claim it.');
        if (input.present.includes(room.ownerId))
          throw new Plain(
            'The owner is still in the room. You can claim it once they leave.',
          );
        const old = room.ownerId;
        room.ownerId = by.id;
        room.ownerName = by.name;
        await put(old, 1);
        await put(by.id, 1);
        saveRoom(db, room, now);
        logRoom(
          db,
          room,
          'owner',
          by,
          'they claimed it after the owner left',
          now,
        );
        return '👑 The room is yours now.';
      }
      case 'transfer': {
        needPeople();
        const to = people[0]!;
        if (!input.present.includes(to.id))
          throw new Plain('They have to be in your room to take it over.');
        room.ownerId = to.id;
        room.ownerName = to.name;
        await put(by.id, 1);
        await put(to.id, 1);
        saveRoom(db, room, now);
        logRoom(db, room, 'owner', to, `given to them by @${by.name}`, now);
        return `🔁 ${mentions([to])} owns the room now.`;
      }
      case 'region': {
        const id = String(input.value ?? '');
        const region = id === 'automatic' ? '' : id;
        if (!tvRegions.some((r) => r.id === region))
          throw new Plain('Pick a region from the list.');
        await rest.patch(path, { rtc_region: region || null });
        return `🌍 Voice region: **${tvRegionName(region)}**.`;
      }
      case 'bitrate': {
        const kbps = Number(input.value);
        if (!tvBitrates.includes(kbps))
          throw new Plain('Pick a bitrate from the list.');
        const max = tvMaxBitrate(input.boostLevel);
        if (kbps > max)
          throw new Plain(
            `This server’s boost level allows up to ${max} kbps.`,
          );
        await rest.patch(path, { bitrate: kbps * 1000 });
        return `🎚️ Bitrate: **${kbps} kbps**.`;
      }
      case 'delete':
        await tvDeleteRoom(rest, db, room, 'owner', by, now);
        return '🗑️ Deleted your room.';
    }
  } catch (e) {
    // The channel was deleted under us: forget it.
    if (gone(e)) tvGone(db, room.channelId, now);
    throw tvExplain(e);
  }
}

/** Staff closed a room from the dashboard. */
export async function tvClose(
  rest: Rest,
  db: Db,
  guildId: string,
  channelId: string,
  by: TvMember,
  now = Date.now(),
) {
  const room = tvRoom(db, channelId);
  if (!room || room.guildId !== guildId) return false;
  await tvDeleteRoom(rest, db, room, 'staff', by, now);
  return true;
}

// The panel -------------------------------------------------------------------

const PANEL = 'temp-voice-panel';

/** The panel's template, or Sparko's own. */
export function tvMessage(db: Db, guildId: string, c: TempVoice) {
  const t = c.panel.message
    ? getTemplate<StudioMessage>(db, guildId, 'studio', c.panel.message)
    : undefined;
  return normaliseStudio(t?.message ?? tvDefaultMessage());
}

/** Where the panel is posted now, if it is. */
export const tvPanelPost = (db: Db, guildId: string) =>
  getPosted(db, guildId, PANEL);

/**
 * Posts the control panel, edits it in place, or takes it down when the
 * module is off or has no panel channel.
 */
export async function tvApplyPanel(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
) {
  const { on, config: c } = tvConfigOf(db, guildId);
  const posted = getPosted(db, guildId, PANEL);
  const remove = async () => {
    if (!posted) return;
    await rest
      .delete(`/channels/${posted.channelId}/messages/${posted.messageId}`)
      .catch(() => {});
    setPosted(db, guildId, PANEL, null);
  };
  if (!on || !c.panel.channel || !c.panel.buttons.length) return remove();
  const message = tvMessage(db, guildId, c);
  const body = tvPanelPayload(message, c, {
    now,
    server: serverVars(getGuild(db, guildId)),
    channel: c.panel.channel,
  });
  try {
    if (posted?.channelId === c.panel.channel) {
      try {
        await rest.patch(
          `/channels/${posted.channelId}/messages/${posted.messageId}`,
          body,
        );
        rememberPost(db, guildId, posted.messageId, message, now);
        return;
      } catch (e) {
        // Someone deleted it: post it again below.
        if (
          !(e instanceof DiscordError && e.code === DiscordCodes.unknownMessage)
        )
          throw e;
      }
    } else await remove();
    const sent = await rest.post<{ id: string }>(
      `/channels/${c.panel.channel}/messages`,
      body,
    );
    setPosted(db, guildId, PANEL, {
      channelId: c.panel.channel,
      messageId: sent.id,
    });
    rememberPost(db, guildId, sent.id, message, now);
  } catch (e) {
    if (
      e instanceof DiscordError &&
      (e.code === DiscordCodes.missingPermissions ||
        e.code === DiscordCodes.missingAccess)
    )
      throw new Plain(
        'Sparko can’t post the voice panel. Give it View Channel, Send Messages and Embed Links in the panel’s channel.',
      );
    if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
      throw new Plain(
        'The panel’s channel no longer exists. Pick another one.',
      );
    if (e instanceof DiscordError && e.status === 400)
      throw new Plain(`Discord didn’t accept the panel: ${e.message}`);
    throw e;
  }
}

/** Posts the panel in a new room's own chat, filled in for that room. */
export async function tvPostInRoom(
  rest: Rest,
  db: Db,
  room: TvRoom,
  now = Date.now(),
) {
  const { config: c } = tvConfigOf(db, room.guildId);
  const message = tvMessage(db, room.guildId, c);
  const sent = await rest.post<{ id: string }>(
    `/channels/${room.channelId}/messages`,
    tvPanelPayload(message, c, {
      now,
      server: serverVars(getGuild(db, room.guildId)),
      channel: room.channelId,
      user: { id: room.ownerId, name: room.ownerName },
      room,
    }),
  );
  rememberPost(db, room.guildId, sent.id, message, now);
}
