import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import { normaliseStudio, type StudioMessage } from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import { rememberPost } from './studio-actions.ts';
import {
  LV_CRATE_ID,
  LV_MODULE,
  lvCrateCanDrop,
  lvCrateRow,
  lvDefaultMessage,
  lvEarns,
  lvLevelOf,
  lvMessageXp,
  lvMultiplier,
  lvPayload,
  lvProgress,
  lvRewardPlan,
  lvRoll,
  lvShouldAnnounce,
  lvUpgrade,
  type Levels,
  type LvFacts,
  type LvKind,
  type LvLogEntry,
  type LvPlace,
} from './levels.ts';

export * from './levels.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
/** Crates kept per server, for Storage. */
const KEEP_CRATES = 200;
const n = (v: number) => v.toLocaleString('en-US');

export function lvConfigOf(db: Db, guildId: string) {
  const m = getModule<Levels>(db, guildId, LV_MODULE);
  return { on: m.on, config: lvUpgrade(m.config) };
}

/** Servers with Levels & XP on. */
export function lvGuilds(db: Db) {
  return (
    db
      .prepare(
        'SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1',
      )
      .all(LV_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// The log ---------------------------------------------------------------------

export function addLvLog(db: Db, guildId: string, e: Omit<LvLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO lv_log (guild_id, action, user_id, user_name, detail, at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(guildId, e.action, e.userId, e.userName, e.detail.slice(0, 300), e.at);
  db.prepare(
    `DELETE FROM lv_log WHERE guild_id = ? AND id <= (
       SELECT id FROM lv_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listLvLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM lv_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): LvLogEntry => ({
      id: String(r.id),
      action: r.action as LvLogEntry['action'],
      userId: r.user_id as string,
      userName: r.user_name as string,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
}

// Members ---------------------------------------------------------------------

/** A member, for their XP and the message's {user} variables. */
export type LvPerson = { id: string; name: string; avatar: string };

/** A member's XP and what they did to earn it. */
export type LvMemberRow = {
  userId: string;
  name: string;
  avatar: string;
  xp: number;
  messages: number;
  voiceMinutes: number;
  lastMessageAt: number | null;
};

const memberOf = (r: Row): LvMemberRow => ({
  userId: r.user_id as string,
  name: r.name as string,
  avatar: r.avatar as string,
  xp: r.xp as number,
  messages: r.messages as number,
  voiceMinutes: r.voice_minutes as number,
  lastMessageAt: (r.last_message_at as number | null) ?? null,
});

export function lvMember(db: Db, guildId: string, userId: string) {
  const r = db
    .prepare('SELECT * FROM lv_members WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as Row | undefined;
  return r ? memberOf(r) : null;
}

/** Their place by XP; 0 for someone with none. */
export function lvRankOf(db: Db, guildId: string, userId: string) {
  const me = lvMember(db, guildId, userId);
  if (!me || me.xp <= 0) return 0;
  const r = db
    .prepare(
      `SELECT COUNT(*) AS above FROM lv_members
       WHERE guild_id = ? AND (xp > ? OR (xp = ? AND name < ?))`,
    )
    .get(guildId, me.xp, me.xp, me.name) as Row;
  return Number(r.above) + 1;
}

const remember = (db: Db, guildId: string, p: LvPerson, now: number) =>
  db
    .prepare(
      `INSERT INTO lv_members (guild_id, user_id, name, avatar, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         name = excluded.name,
         avatar = CASE WHEN excluded.avatar = '' THEN lv_members.avatar ELSE excluded.avatar END`,
    )
    .run(guildId, p.id, p.name, p.avatar, now);

/** The facts a level message fills in about a member. */
export function lvFactsOf(db: Db, guildId: string, userId: string): LvFacts {
  const m = lvMember(db, guildId, userId);
  return {
    xp: m?.xp ?? 0,
    rank: lvRankOf(db, guildId, userId),
    messages: m?.messages ?? 0,
    voiceMinutes: m?.voiceMinutes ?? 0,
  };
}

/** A row of the leaderboard, with where they are in their level. */
export type LvRow = Omit<LvMemberRow, 'lastMessageAt'> & {
  /** Place on the leaderboard; null for someone with no XP. */
  rank: number | null;
  level: number;
  percent: number;
};

/** The leaderboard, most XP first. A search finds anyone Sparko knows. */
export function lvLeaderboard(
  db: Db,
  guildId: string,
  { query = '', page = 1, size = 25 } = {},
) {
  const { config: c } = lvConfigOf(db, guildId);
  const all = (
    db
      .prepare(
        'SELECT * FROM lv_members WHERE guild_id = ? ORDER BY xp DESC, name',
      )
      .all(guildId) as Row[]
  ).map(memberOf);
  const ranked = all.filter((m) => m.xp > 0);
  const row = (m: LvMemberRow, rank: number | null): LvRow => {
    const p = lvProgress(c.curve, m.xp, c.maxLevel);
    return {
      rank,
      userId: m.userId,
      name: m.name,
      avatar: m.avatar,
      xp: m.xp,
      messages: m.messages,
      voiceMinutes: m.voiceMinutes,
      level: p.level,
      percent: p.percent,
    };
  };
  const board = ranked.map((m, i) => row(m, i + 1));
  const q = query.trim().toLowerCase();
  const matches = (r: LvRow) =>
    !q || r.userId === q || r.name.toLowerCase().includes(q);
  const shown = q
    ? [
        ...board.filter(matches),
        ...all
          .filter((m) => m.xp <= 0)
          .map((m) => row(m, null))
          .filter(matches),
      ]
    : board;
  const pages = Math.max(1, Math.ceil(shown.length / size));
  const at = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return {
    rows: shown.slice((at - 1) * size, at * size),
    total: shown.length,
    /** How many members have XP. */
    count: board.length,
    page: at,
    pages,
  };
}

/** One member: their row, level progress and place. */
export function lvDetail(db: Db, guildId: string, userId: string) {
  const { config: c } = lvConfigOf(db, guildId);
  const m = lvMember(db, guildId, userId);
  const xp = m?.xp ?? 0;
  const p = lvProgress(c.curve, xp, c.maxLevel);
  return {
    userId,
    name: m?.name || userId,
    avatar: m?.avatar ?? '',
    xp,
    messages: m?.messages ?? 0,
    voiceMinutes: m?.voiceMinutes ?? 0,
    rank: lvRankOf(db, guildId, userId) || null,
    level: p.level,
    into: p.into,
    need: p.need,
    next: p.next,
    percent: p.percent,
    max: p.max,
    /** Reward roles at or below their level, lowest first. */
    rewards: [...c.rewards]
      .sort((a, b) => a.level - b.level)
      .filter((r) => r.level <= p.level)
      .map((r) => ({ level: r.level, role: r.role })),
  };
}

/** Everyone who could have reward roles: members with XP. */
export function lvRewardTargets(db: Db, guildId: string, limit = 1000) {
  return (
    db
      .prepare(
        'SELECT user_id FROM lv_members WHERE guild_id = ? AND xp > 0 ORDER BY xp DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map((r) => r.user_id as string);
}

// Reward roles ----------------------------------------------------------------

/**
 * Gives and takes someone's reward roles to match their level. `roles`
 * are their roles now, when the bot already knows them; otherwise Discord
 * is asked. Someone who isn't in the server is left alone.
 */
export async function lvApplyRewards(
  rest: Rest,
  db: Db,
  guildId: string,
  userId: string,
  {
    now = Date.now(),
    roles,
    roleName = () => undefined,
  }: {
    now?: number;
    roles?: string[] | undefined;
    roleName?: (id: string) => string | undefined;
  } = {},
) {
  const { on, config: c } = lvConfigOf(db, guildId);
  if (!on || !c.rewards.length) return { given: [], taken: [] };
  let has = roles;
  if (!has) {
    try {
      has = (
        await rest.get<{ roles: string[] }>(
          `/guilds/${guildId}/members/${userId}`,
        )
      ).roles;
    } catch (e) {
      if (e instanceof DiscordError && e.status === 404)
        return { given: [], taken: [] };
      throw e;
    }
  }
  const m = lvMember(db, guildId, userId);
  const level = lvLevelOf(c, m?.xp ?? 0);
  const plan = lvRewardPlan(c, level, new Set(has));
  const name = m?.name || userId;
  const given: string[] = [];
  const taken: string[] = [];
  const tierOf = (role: string) => c.rewards.find((r) => r.role === role);
  const log = (
    action: 'reward-given' | 'reward-removed' | 'failed',
    d: string,
  ) =>
    addLvLog(db, guildId, {
      action,
      userId,
      userName: name,
      detail: d,
      at: now,
    });
  const label = (role: string) => `@${roleName(role) ?? 'a reward role'}`;
  for (const role of plan.give)
    try {
      await rest.put(
        `/guilds/${guildId}/members/${userId}/roles/${role}`,
        {},
        `Reached level ${tierOf(role)?.level ?? ''}`,
      );
      given.push(role);
      log(
        'reward-given',
        `${label(role)} for level ${tierOf(role)?.level ?? 0}`,
      );
    } catch {
      log(
        'failed',
        `Sparko couldn’t give ${label(role)}. It needs Manage Roles, and its role has to be above it.`,
      );
    }
  for (const role of plan.take)
    try {
      await rest.delete(
        `/guilds/${guildId}/members/${userId}/roles/${role}`,
        'Level reward no longer earned',
      );
      taken.push(role);
      log('reward-removed', `${label(role)} (now level ${level})`);
    } catch {
      log(
        'failed',
        `Sparko couldn’t take ${label(role)} back. It needs Manage Roles, and its role has to be above it.`,
      );
    }
  return { given, taken };
}

// Messages --------------------------------------------------------------------

/** A level message: the server's template, or Sparko's own. */
export function lvMessage(db: Db, guildId: string, c: Levels, kind: LvKind) {
  const id =
    kind === 'levelup'
      ? c.levelUp.template
      : kind === 'rank'
        ? c.rank.template
        : c.crates.template;
  const t = id
    ? getTemplate<StudioMessage>(db, guildId, 'studio', id)
    : undefined;
  return normaliseStudio(t?.message ?? lvDefaultMessage(kind));
}

function plain(e: unknown, what: string): string {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    return `Sparko can’t post the ${what}. Give it View Channel, Send Messages and Embed Links there.`;
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    return `The ${what} channel no longer exists. Pick another one.`;
  if (e instanceof DiscordError && e.status === 400)
    return `Discord didn’t accept the ${what}: ${e.message}`;
  return `Sparko couldn’t post the ${what}.`;
}

/** Where a level-up for this member goes, or null for nowhere. */
async function levelUpChannel(
  rest: Rest,
  c: Levels,
  userId: string,
  place: LvPlace | undefined,
) {
  if (c.levelUp.where === 'channel') return c.levelUp.channel || null;
  if (c.levelUp.where === 'same') return place?.channelId ?? null;
  if (c.levelUp.where === 'dm') {
    const dm = await rest.post<{ id: string }>('/users/@me/channels', {
      recipient_id: userId,
    });
    return dm.id;
  }
  return null;
}

/** Posts the level-up message, if this level is announced. */
async function announce(
  rest: Rest,
  db: Db,
  guildId: string,
  c: Levels,
  member: LvPerson,
  facts: LvFacts,
  place: LvPlace | undefined,
  now: number,
) {
  const level = lvLevelOf(c, facts.xp);
  if (!lvShouldAnnounce(c, level)) return;
  const message = lvMessage(db, guildId, c, 'levelup');
  try {
    const channel = await levelUpChannel(rest, c, member.id, place);
    if (!channel) return;
    const sent = await rest.post<{ id: string }>(
      `/channels/${channel}/messages`,
      lvPayload(message, c, facts, {
        now,
        user: member,
        server: serverVars(getGuild(db, guildId)),
        channel,
        // Only the member themselves is pinged, and not in their DMs.
        ping: c.levelUp.where === 'dm' ? undefined : member.id,
      }),
    );
    rememberPost(db, guildId, sent.id, message, now);
  } catch (e) {
    // Members who don't take DMs simply don't get one.
    if (c.levelUp.where === 'dm') return;
    addLvLog(db, guildId, {
      action: 'failed',
      userId: member.id,
      userName: member.name,
      detail: plain(e, 'level-up message'),
      at: now,
    });
  }
}

// Earning ---------------------------------------------------------------------

export type LvSource = 'message' | 'voice' | 'crate';

/**
 * Adds XP someone earned. A new level is logged, reward roles follow it,
 * and the level-up message goes out if that level is announced.
 */
export async function lvGain(
  rest: Rest,
  db: Db,
  guildId: string,
  member: LvPerson,
  amount: number,
  {
    now = Date.now(),
    source,
    place,
    roles,
    roleName,
  }: {
    now?: number;
    source: LvSource;
    place?: LvPlace | undefined;
    roles?: string[] | undefined;
    roleName?: ((id: string) => string | undefined) | undefined;
  },
) {
  const { config: c } = lvConfigOf(db, guildId);
  remember(db, guildId, member, now);
  const before = lvMember(db, guildId, member.id)!.xp;
  db.prepare(
    `UPDATE lv_members SET xp = xp + ?, updated_at = ?,
       messages = messages + ?, voice_minutes = voice_minutes + ?,
       last_message_at = CASE WHEN ? THEN ? ELSE last_message_at END
     WHERE guild_id = ? AND user_id = ?`,
  ).run(
    amount,
    now,
    source === 'message' ? 1 : 0,
    source === 'voice' ? 1 : 0,
    source === 'message' ? 1 : 0,
    now,
    guildId,
    member.id,
  );
  const xp = before + amount;
  const from = lvLevelOf(c, before);
  const to = lvLevelOf(c, xp);
  if (to <= from) return { xp, from, to, given: [] as string[] };
  addLvLog(db, guildId, {
    action: 'level-up',
    userId: member.id,
    userName: member.name,
    detail: `reached level ${to}${source === 'voice' ? ' in voice' : source === 'crate' ? ' with a crate' : ''}`,
    at: now,
  });
  const done = await lvApplyRewards(rest, db, guildId, member.id, {
    now,
    roles,
    ...(roleName ? { roleName } : {}),
  }).catch(() => ({ given: [] as string[] }));
  await announce(
    rest,
    db,
    guildId,
    c,
    member,
    {
      ...lvFactsOf(db, guildId, member.id),
      previous: from,
      rewards: done.given,
    },
    place,
    now,
  );
  return { xp, from, to, given: done.given };
}

/**
 * Someone wrote a message: XP once per cooldown where they earn it, then
 * maybe a crate. Null when nothing was given.
 */
export async function lvOnMessage(
  rest: Rest,
  db: Db,
  guildId: string,
  member: LvPerson & { roles: string[] },
  place: LvPlace,
  {
    now = Date.now(),
    random = Math.random,
    roleName,
  }: {
    now?: number;
    random?: () => number;
    roleName?: (id: string) => string | undefined;
  } = {},
) {
  const { on, config: c } = lvConfigOf(db, guildId);
  if (!on) return null;
  const roles = new Set(member.roles);
  if (!lvEarns(c, place, roles)) return null;
  let gained = null;
  if (c.message.on) {
    const last = lvMember(db, guildId, member.id)?.lastMessageAt ?? null;
    if (last === null || now - last >= c.message.cooldown * 1000) {
      const xp = lvMessageXp(c, lvMultiplier(c, place, roles), random);
      gained = {
        amount: xp,
        ...(await lvGain(rest, db, guildId, member, xp, {
          now,
          source: 'message',
          place,
          roles: member.roles,
          roleName,
        })),
      };
    }
  }
  const crate = await lvMaybeDrop(rest, db, guildId, place, { now, random });
  return { gained, crate };
}

/**
 * A minute in voice for each member the bot found earning: XP with their
 * boosts. Level-ups announced "where they earned it" go to the voice
 * channel's own chat.
 */
export async function lvVoiceMinute(
  rest: Rest,
  db: Db,
  guildId: string,
  members: (LvPerson & { roles: string[]; place: LvPlace })[],
  {
    now = Date.now(),
    roleName,
  }: { now?: number; roleName?: (id: string) => string | undefined } = {},
) {
  const { on, config: c } = lvConfigOf(db, guildId);
  if (!on || !c.voice.on) return 0;
  let given = 0;
  for (const m of members) {
    const roles = new Set(m.roles);
    if (!lvEarns(c, m.place, roles)) continue;
    const xp = Math.max(
      1,
      Math.round(c.voice.perMinute * lvMultiplier(c, m.place, roles)),
    );
    await lvGain(rest, db, guildId, m, xp, {
      now,
      source: 'voice',
      place: m.place,
      roles: m.roles,
      roleName,
    }).catch((e: unknown) => console.error('Voice XP failed', e));
    given++;
  }
  return given;
}

// Staff changes ---------------------------------------------------------------

export type LvChange = 'give' | 'take' | 'set';

/** Gives, takes or sets someone's XP. Never below 0. */
export function lvChangeXp(
  db: Db,
  guildId: string,
  who: LvPerson,
  mode: LvChange,
  amount: number,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const { config: c } = lvConfigOf(db, guildId);
  remember(db, guildId, who, now);
  const before = lvMember(db, guildId, who.id)!.xp;
  const after = Math.max(
    0,
    mode === 'give'
      ? before + amount
      : mode === 'take'
        ? before - amount
        : amount,
  );
  db.prepare(
    'UPDATE lv_members SET xp = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
  ).run(after, now, guildId, who.id);
  const from = lvLevelOf(c, before);
  const to = lvLevelOf(c, after);
  const words =
    mode === 'give'
      ? `+${n(amount)}`
      : mode === 'take'
        ? `−${n(amount)}`
        : `set to ${n(amount)}`;
  addLvLog(db, guildId, {
    action: 'xp-changed',
    userId: who.id,
    userName: lvMember(db, guildId, who.id)?.name || who.name,
    detail: `${words} by @${by.name}, now ${n(after)} XP (level ${to}${to !== from ? `, was ${from}` : ''})`,
    at: now,
  });
  return { before, after, from, to };
}

/**
 * Resets someone's XP, or everyone's: XP, messages and voice time go
 * back to 0. Returns whose XP changed.
 */
export function lvReset(
  db: Db,
  guildId: string,
  userId: string | null,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const touched = (
    db
      .prepare(
        `SELECT user_id FROM lv_members WHERE guild_id = ? AND xp > 0
         AND (? IS NULL OR user_id = ?)`,
      )
      .all(guildId, userId, userId) as Row[]
  ).map((r) => r.user_id as string);
  db.prepare(
    `UPDATE lv_members SET xp = 0, messages = 0, voice_minutes = 0, updated_at = ?
     WHERE guild_id = ? AND (? IS NULL OR user_id = ?)`,
  ).run(now, guildId, userId, userId);
  addLvLog(db, guildId, {
    action: 'reset',
    userId: userId ?? '0',
    userName: userId
      ? lvMember(db, guildId, userId)?.name || userId
      : 'everyone',
    detail: `by @${by.name}`,
    at: now,
  });
  return touched;
}

// XP crates -------------------------------------------------------------------

export type LvCrate = {
  id: number;
  channelId: string;
  messageId: string | null;
  xp: number;
  state: 'open' | 'claimed' | 'expired';
  droppedAt: number;
  endsAt: number;
  claimedBy: string | null;
  claimedName: string;
  claimedAt: number | null;
};

const crateOf = (r: Row): LvCrate => ({
  id: r.id as number,
  channelId: r.channel_id as string,
  messageId: (r.message_id as string | null) ?? null,
  xp: r.xp as number,
  state: r.state as LvCrate['state'],
  droppedAt: r.dropped_at as number,
  endsAt: r.ends_at as number,
  claimedBy: (r.claimed_by as string | null) ?? null,
  claimedName: r.claimed_name as string,
  claimedAt: (r.claimed_at as number | null) ?? null,
});

/** Crates that dropped in a server, newest first. */
export function lvCrates(db: Db, guildId: string, limit = 50) {
  return (
    db
      .prepare(
        'SELECT * FROM lv_crates WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(crateOf);
}

/** How many crates dropped, and how many were opened, in all. */
export function lvCrateStats(db: Db, guildId: string) {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS dropped,
         SUM(CASE WHEN state = 'claimed' THEN 1 ELSE 0 END) AS opened,
         SUM(CASE WHEN state = 'claimed' THEN xp ELSE 0 END) AS xp
       FROM lv_crates WHERE guild_id = ?`,
    )
    .get(guildId) as Row;
  return {
    dropped: Number(r.dropped ?? 0),
    opened: Number(r.opened ?? 0),
    xp: Number(r.xp ?? 0),
  };
}

const lastDrop = (db: Db, guildId: string, channelId: string) =>
  ((
    db
      .prepare(
        'SELECT MAX(dropped_at) AS at FROM lv_crates WHERE guild_id = ? AND channel_id = ?',
      )
      .get(guildId, channelId) as Row
  ).at as number | null) ?? null;

/** Posts a crate in a channel and remembers it. */
export async function lvDropCrate(
  rest: Rest,
  db: Db,
  guildId: string,
  channelId: string,
  { now = Date.now(), random = Math.random } = {},
) {
  const { config: c } = lvConfigOf(db, guildId);
  const xp = lvRoll(c.crates.min, c.crates.max, random);
  const endsAt = now + c.crates.time * 1000;
  const id = Number(
    db
      .prepare(
        `INSERT INTO lv_crates (guild_id, channel_id, xp, dropped_at, ends_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(guildId, channelId, xp, now, endsAt).lastInsertRowid,
  );
  const message = lvMessage(db, guildId, c, 'crate');
  try {
    const sent = await rest.post<{ id: string }>(
      `/channels/${channelId}/messages`,
      lvPayload(
        message,
        c,
        {
          xp: 0,
          rank: 0,
          messages: 0,
          voiceMinutes: 0,
          crate: { min: c.crates.min, max: c.crates.max, endsAt },
        },
        {
          now,
          server: serverVars(getGuild(db, guildId)),
          channel: channelId,
        },
        { open: true },
      ),
    );
    db.prepare('UPDATE lv_crates SET message_id = ? WHERE id = ?').run(
      sent.id,
      id,
    );
    addLvLog(db, guildId, {
      action: 'crate-dropped',
      userId: '0',
      userName: 'Sparko',
      detail: `A crate with ${n(xp)} XP dropped in <#${channelId}>`,
      at: now,
    });
  } catch (e) {
    db.prepare('DELETE FROM lv_crates WHERE id = ?').run(id);
    addLvLog(db, guildId, {
      action: 'failed',
      userId: '0',
      userName: 'Sparko',
      detail: plain(e, 'XP crate'),
      at: now,
    });
    return null;
  }
  db.prepare(
    `DELETE FROM lv_crates WHERE guild_id = ? AND id <= (
       SELECT id FROM lv_crates WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP_CRATES);
  return { id, xp, endsAt };
}

/** A message might drop a crate: by chance, and not too soon after the last. */
export async function lvMaybeDrop(
  rest: Rest,
  db: Db,
  guildId: string,
  place: LvPlace,
  { now = Date.now(), random = Math.random } = {},
) {
  const { config: c } = lvConfigOf(db, guildId);
  if (!c.crates.on) return null;
  if (!lvCrateCanDrop(c, place, lastDrop(db, guildId, place.channelId), now))
    return null;
  if (random() * 100 >= c.crates.chance) return null;
  return lvDropCrate(rest, db, guildId, place.channelId, { now, random });
}

/**
 * Someone pressed Open: the first press wins the crate's XP. Says what
 * happened, so the bot can answer and change the button.
 */
export async function lvOpenCrate(
  rest: Rest,
  db: Db,
  guildId: string,
  messageId: string,
  member: LvPerson & { roles: string[] },
  {
    now = Date.now(),
    roleName,
  }: { now?: number; roleName?: (id: string) => string | undefined } = {},
) {
  const r = db
    .prepare('SELECT * FROM lv_crates WHERE guild_id = ? AND message_id = ?')
    .get(guildId, messageId) as Row | undefined;
  if (!r) return { result: 'gone' as const };
  const crate = crateOf(r);
  if (crate.state === 'claimed')
    return { result: 'taken' as const, by: crate.claimedName };
  if (crate.state === 'expired' || crate.endsAt <= now) {
    lvExpire(db, guildId, crate, now);
    return { result: 'gone' as const };
  }
  const won = db
    .prepare(
      `UPDATE lv_crates SET state = 'claimed', claimed_by = ?, claimed_name = ?, claimed_at = ?
       WHERE id = ? AND state = 'open'`,
    )
    .run(member.id, member.name, now, crate.id);
  if (!Number(won.changes))
    return {
      result: 'taken' as const,
      by:
        lvCrates(db, guildId).find((x) => x.id === crate.id)?.claimedName ?? '',
    };
  addLvLog(db, guildId, {
    action: 'crate-opened',
    userId: member.id,
    userName: member.name,
    detail: `+${n(crate.xp)} XP in <#${crate.channelId}>`,
    at: now,
  });
  const gained = await lvGain(rest, db, guildId, member, crate.xp, {
    now,
    source: 'crate',
    place: { channelId: crate.channelId },
    roles: member.roles,
    roleName,
  });
  return {
    result: 'won' as const,
    won: crate.xp,
    total: gained.xp,
    from: gained.from,
    to: gained.to,
  };
}

function lvExpire(db: Db, guildId: string, crate: LvCrate, now: number) {
  const done = db
    .prepare(
      `UPDATE lv_crates SET state = 'expired' WHERE id = ? AND state = 'open'`,
    )
    .run(crate.id);
  if (Number(done.changes))
    addLvLog(db, guildId, {
      action: 'crate-expired',
      userId: '0',
      userName: 'Sparko',
      detail: `Nobody opened the ${n(crate.xp)} XP crate in <#${crate.channelId}>`,
      at: now,
    });
}

/** Swaps a crate's button row for what it is now, keeping the rest. */
export function lvSwapCrateRow(
  components: object[],
  state: Parameters<typeof lvCrateRow>[0],
) {
  const isCrate = (row: object) =>
    ((row as { components?: { custom_id?: string }[] }).components ?? []).some(
      (c) => c.custom_id === LV_CRATE_ID,
    );
  return components.map((row) => (isCrate(row) ? lvCrateRow(state) : row));
}

/** Crates past their time vanish: marked, and their button greyed out. */
export async function lvCrateSweep(rest: Rest, db: Db, now = Date.now()) {
  const due = (
    db
      .prepare(
        `SELECT * FROM lv_crates WHERE state = 'open' AND ends_at <= ? ORDER BY ends_at LIMIT 50`,
      )
      .all(now) as Row[]
  ).map((r) => ({ guildId: r.guild_id as string, crate: crateOf(r) }));
  for (const { guildId, crate } of due) {
    lvExpire(db, guildId, crate, now);
    if (!crate.messageId) continue;
    try {
      const path = `/channels/${crate.channelId}/messages/${crate.messageId}`;
      const msg = await rest.get<{ components?: object[] }>(path);
      await rest.patch(path, {
        components: lvSwapCrateRow(msg.components ?? [], { gone: true }),
      });
    } catch {
      // A deleted crate or channel has nothing left to grey out.
    }
  }
  return due.length;
}

// Rank cards and tests --------------------------------------------------------

/** The /rank card for a member, as Discord's message body. */
export function lvRankPayload(
  db: Db,
  guildId: string,
  member: LvPerson & { createdAt?: number; joinedAt?: number },
  now = Date.now(),
) {
  const { config: c } = lvConfigOf(db, guildId);
  return lvPayload(
    lvMessage(db, guildId, c, 'rank'),
    c,
    lvFactsOf(db, guildId, member.id),
    {
      now,
      user: member,
      server: serverVars(getGuild(db, guildId)),
    },
  );
}

/** Posts a made-up level-up, rank card or crate in a channel, to see it. */
export async function lvTestPost(
  rest: Rest,
  db: Db,
  guildId: string,
  channel: string,
  kind: LvKind,
  by: LvPerson,
  now = Date.now(),
) {
  const { config: c } = lvConfigOf(db, guildId);
  const message = lvMessage(db, guildId, c, kind);
  const xp = Math.max(lvMember(db, guildId, by.id)?.xp ?? 0, 4675);
  const body = lvPayload(
    message,
    c,
    {
      xp,
      rank: 3,
      messages: 412,
      voiceMinutes: 260,
      previous: lvLevelOf(c, xp) - 1,
      rewards: [],
      crate: {
        min: c.crates.min,
        max: c.crates.max,
        endsAt: now + c.crates.time * 1000,
      },
    },
    {
      now,
      user: { ...by, createdAt: now - 400 * 86_400_000, joinedAt: now },
      server: serverVars(getGuild(db, guildId)),
      channel,
    },
    // The test crate's button can't be opened.
    kind === 'crate' ? { gone: true } : undefined,
  );
  const note = 'This is a test. Nobody’s XP changed.';
  const flagged = body as {
    flags?: number;
    components?: object[];
    content?: string;
  };
  try {
    await rest.post(
      `/channels/${channel}/messages`,
      flagged.flags
        ? {
            ...body,
            allowed_mentions: { parse: [] },
            components: [
              { type: 10, content: `-# ${note}` },
              ...(flagged.components ?? []),
            ],
          }
        : {
            ...body,
            allowed_mentions: { parse: [] },
            content: `-# ${note}\n${flagged.content ?? ''}`.trim(),
          },
    );
  } catch (e) {
    throw new Plain(plain(e, lvKindWords[kind]));
  }
}

const lvKindWords: Record<LvKind, string> = {
  levelup: 'level-up message',
  rank: 'rank card',
  crate: 'XP crate',
};
