import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import { normaliseStudio, type StudioMessage } from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import { rememberPost } from './studio-actions.ts';
import {
  INV_MODULE,
  invDefaultMessage,
  invDiff,
  invIsFake,
  invPayload,
  invRewardPlan,
  invTotal,
  invUpgrade,
  type InvCode,
  type InvCounts,
  type InvJoinType,
  type InvKind,
  type InvLogEntry,
  type InvMessageFacts,
  type Invites,
} from './invites.ts';

export * from './invites.ts';

type Row = Record<string, unknown>;
const KEEP = 500;

export function invConfigOf(db: Db, guildId: string) {
  const m = getModule<Invites>(db, guildId, INV_MODULE);
  return { on: m.on, config: invUpgrade(m.config) };
}

/** Servers with invite tracking on. */
export function invGuilds(db: Db) {
  return (
    db
      .prepare(
        'SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1',
      )
      .all(INV_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// The log ---------------------------------------------------------------------

export function addInvLog(db: Db, guildId: string, e: Omit<InvLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO inv_log (guild_id, action, user_id, user_name, detail, at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(guildId, e.action, e.userId, e.userName, e.detail.slice(0, 300), e.at);
  db.prepare(
    `DELETE FROM inv_log WHERE guild_id = ? AND id <= (
       SELECT id FROM inv_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listInvLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM inv_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): InvLogEntry => ({
      id: String(r.id),
      action: r.action as InvLogEntry['action'],
      userId: r.user_id as string,
      userName: r.user_name as string,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
}

// Invites Sparko knows --------------------------------------------------------

const codeOf = (r: Row): InvCode => ({
  code: r.code as string,
  inviterId: (r.inviter_id as string | null) ?? null,
  inviterName: r.inviter_name as string,
  channelId: r.channel_id as string,
  channelName: r.channel_name as string,
  uses: r.uses as number,
  maxUses: r.max_uses as number,
  expiresAt: (r.expires_at as number | null) ?? null,
  createdAt: r.created_at as number,
});

/** Every invite Sparko remembers, including used-up ones it keeps a moment. */
export function storedCodes(db: Db, guildId: string) {
  return (
    db
      .prepare('SELECT * FROM inv_codes WHERE guild_id = ? ORDER BY uses DESC')
      .all(guildId) as Row[]
  ).map(codeOf);
}

/** The server's invites as Storage lists them: most used first, live ones only. */
export function listCodes(db: Db, guildId: string, now = Date.now()) {
  return storedCodes(db, guildId).filter(
    (c) => c.expiresAt === null || c.expiresAt > now,
  );
}

const insertCode = (db: Db, guildId: string, c: InvCode) =>
  db
    .prepare(
      `INSERT INTO inv_codes (guild_id, code, inviter_id, inviter_name, channel_id,
         channel_name, uses, max_uses, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, code) DO UPDATE SET
         inviter_id = excluded.inviter_id, inviter_name = excluded.inviter_name,
         channel_id = excluded.channel_id, channel_name = excluded.channel_name,
         uses = excluded.uses, max_uses = excluded.max_uses,
         expires_at = excluded.expires_at`,
    )
    .run(
      guildId,
      c.code,
      c.inviterId,
      c.inviterName,
      c.channelId,
      c.channelName,
      c.uses,
      c.maxUses,
      c.expiresAt,
      c.createdAt,
    );

/** Replaces what Sparko knows with Discord's list. */
export function saveCodes(
  db: Db,
  guildId: string,
  codes: InvCode[],
  now = Date.now(),
) {
  db.prepare('DELETE FROM inv_codes WHERE guild_id = ?').run(guildId);
  for (const c of codes) insertCode(db, guildId, c);
  setState(db, guildId, { can_list: 1, synced_at: now });
}

/** Someone made an invite. */
export function invCodeAdded(db: Db, guildId: string, c: InvCode) {
  insertCode(db, guildId, c);
}

/**
 * An invite was deleted. One a use away from its limit was probably just
 * used up by someone joining, so it's kept (as expired) until the join is
 * worked out; the next full read drops it.
 */
export function invCodeRemoved(
  db: Db,
  guildId: string,
  code: string,
  now = Date.now(),
) {
  const r = db
    .prepare('SELECT * FROM inv_codes WHERE guild_id = ? AND code = ?')
    .get(guildId, code) as Row | undefined;
  if (!r) return;
  const c = codeOf(r);
  if (c.maxUses > 0 && c.uses + 1 >= c.maxUses)
    db.prepare(
      'UPDATE inv_codes SET expires_at = ? WHERE guild_id = ? AND code = ?',
    ).run(now, guildId, code);
  else
    db.prepare('DELETE FROM inv_codes WHERE guild_id = ? AND code = ?').run(
      guildId,
      code,
    );
}

type StateRow = {
  vanityCode: string;
  vanityUses: number;
  canList: boolean;
  syncedAt: number | null;
};
export function invState(db: Db, guildId: string): StateRow {
  const r = db
    .prepare('SELECT * FROM inv_state WHERE guild_id = ?')
    .get(guildId) as Row | undefined;
  return {
    vanityCode: (r?.vanity_code as string | undefined) ?? '',
    vanityUses: (r?.vanity_uses as number | undefined) ?? 0,
    canList: r ? r.can_list === 1 : true,
    syncedAt: (r?.synced_at as number | null | undefined) ?? null,
  };
}
function setState(
  db: Db,
  guildId: string,
  patch: Partial<
    Record<'vanity_code' | 'vanity_uses' | 'can_list' | 'synced_at', unknown>
  >,
) {
  db.prepare('INSERT OR IGNORE INTO inv_state (guild_id) VALUES (?)').run(
    guildId,
  );
  for (const [k, v] of Object.entries(patch))
    db.prepare(`UPDATE inv_state SET ${k} = ? WHERE guild_id = ?`).run(
      v as string | number | null,
      guildId,
    );
}

/** An invite as Discord's API sends it. */
type DiscordInvite = {
  code: string;
  uses?: number;
  max_uses?: number;
  created_at?: string;
  expires_at?: string | null;
  inviter?:
    | { id: string; username: string; global_name?: string | null }
    | undefined;
  channel?: { id: string; name?: string } | null;
};

/** Discord's invite in Sparko's shape; the gateway's events use this too. */
export function codeFromDiscord(i: DiscordInvite): InvCode {
  return {
    code: i.code,
    inviterId: i.inviter?.id ?? null,
    inviterName: i.inviter ? i.inviter.global_name || i.inviter.username : '',
    channelId: i.channel?.id ?? '',
    channelName: i.channel?.name ?? '',
    uses: i.uses ?? 0,
    maxUses: i.max_uses ?? 0,
    expiresAt: i.expires_at ? Date.parse(i.expires_at) : null,
    createdAt: i.created_at ? Date.parse(i.created_at) : 0,
  };
}

/** Sparko needs Manage Server to see a server's invites. */
const noAccess = (e: unknown) =>
  e instanceof DiscordError &&
  (e.code === DiscordCodes.missingPermissions ||
    e.code === DiscordCodes.missingAccess ||
    e.status === 403);

/**
 * Reads the server's invites (and the vanity link's uses) from Discord.
 * Null when Sparko isn't allowed to: it needs Manage Server.
 */
export async function fetchCodes(rest: Rest, guildId: string) {
  try {
    const list = await rest.get<DiscordInvite[]>(`/guilds/${guildId}/invites`);
    // Only servers with a vanity link have one; anything else is "none".
    const vanity = await rest
      .get<{
        code: string | null;
        uses: number;
      }>(`/guilds/${guildId}/vanity-url`)
      .catch(() => null);
    return {
      codes: list.map(codeFromDiscord),
      vanity: vanity?.code ? { code: vanity.code, uses: vanity.uses } : null,
    };
  } catch (e) {
    if (noAccess(e)) return null;
    throw e;
  }
}

/** Reads and remembers the server's invites. False when Sparko can't see them. */
export async function invRefresh(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
) {
  const got = await fetchCodes(rest, guildId);
  if (!got) {
    setState(db, guildId, { can_list: 0 });
    return false;
  }
  saveCodes(db, guildId, got.codes, now);
  setState(db, guildId, {
    vanity_code: got.vanity?.code ?? '',
    vanity_uses: got.vanity?.uses ?? 0,
  });
  return true;
}

// Who joined with what --------------------------------------------------------

export type InvJoin = {
  id: number;
  userId: string;
  userName: string;
  avatar: string;
  inviterId: string | null;
  inviterName: string;
  code: string;
  type: InvJoinType;
  fake: boolean;
  /** Whether it counts for the inviter (not a rejoin, not reset). */
  counted: boolean;
  joinedAt: number;
  leftAt: number | null;
};

const joinOf = (r: Row): InvJoin => ({
  id: r.id as number,
  userId: r.user_id as string,
  userName: r.user_name as string,
  avatar: r.avatar as string,
  inviterId: (r.inviter_id as string | null) ?? null,
  inviterName: r.inviter_name as string,
  code: r.code as string,
  type: r.type as InvJoinType,
  fake: r.fake === 1,
  counted: r.counted === 1,
  joinedAt: r.joined_at as number,
  leftAt: (r.left_at as number | null) ?? null,
});

/** The last time someone joined: who invited them, with what. */
export function invitedBy(db: Db, guildId: string, userId: string) {
  const r = db
    .prepare(
      'SELECT * FROM inv_joins WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
    )
    .get(guildId, userId) as Row | undefined;
  return r ? joinOf(r) : null;
}

/** The members someone invited, newest first. */
export function invitedList(
  db: Db,
  guildId: string,
  inviterId: string,
  limit = 50,
) {
  return (
    db
      .prepare(
        `SELECT * FROM inv_joins WHERE guild_id = ? AND inviter_id = ?
         ORDER BY id DESC LIMIT ?`,
      )
      .all(guildId, inviterId, limit) as Row[]
  ).map(joinOf);
}

export type InvPerson = { id: string; name: string; avatar: string };

const remember = (db: Db, guildId: string, p: InvPerson) =>
  db
    .prepare(
      `INSERT INTO inv_people (guild_id, user_id, name, avatar) VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         name = excluded.name,
         avatar = CASE WHEN excluded.avatar = '' THEN inv_people.avatar ELSE excluded.avatar END`,
    )
    .run(guildId, p.id, p.name, p.avatar);

// Counting --------------------------------------------------------------------

/** A row of the leaderboard. */
export type InvRow = InvCounts & {
  /** Place on the leaderboard; null for someone who isn't on it. */
  rank: number | null;
  userId: string;
  name: string;
  avatar: string;
  total: number;
};

/** Every inviter's numbers. A fake member who left only counts once. */
function tally(db: Db, guildId: string, c: Invites) {
  const rows = db
    .prepare(
      `SELECT inviter_id AS id,
         SUM(counted) AS regular,
         SUM(CASE WHEN counted = 1 AND left_at IS NOT NULL THEN 1 ELSE 0 END) AS left_n,
         SUM(CASE WHEN counted = 1 AND fake = 1
           AND NOT (left_at IS NOT NULL AND ?) THEN 1 ELSE 0 END) AS fake_n
       FROM inv_joins WHERE guild_id = ? AND inviter_id IS NOT NULL
       GROUP BY inviter_id`,
    )
    .all(c.subtractLeaves ? 1 : 0, guildId) as Row[];
  return new Map(
    rows.map((r) => [
      r.id as string,
      {
        regular: Number(r.regular ?? 0),
        left: Number(r.left_n ?? 0),
        fake: Number(r.fake_n ?? 0),
      },
    ]),
  );
}

/** One member's invite counts. */
export function invCountsOf(db: Db, guildId: string, userId: string) {
  const { config: c } = invConfigOf(db, guildId);
  const n = tally(db, guildId, c).get(userId) ?? {
    regular: 0,
    left: 0,
    fake: 0,
  };
  const p = db
    .prepare('SELECT * FROM inv_people WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as Row | undefined;
  const counts = { ...n, bonus: (p?.bonus as number | undefined) ?? 0 };
  return {
    ...counts,
    total: invTotal(c, counts),
    name: (p?.name as string | undefined) ?? '',
    avatar: (p?.avatar as string | undefined) ?? '',
  };
}

/**
 * The leaderboard, most invites first. A search also finds members who
 * only joined (to see who invited them), after the inviters.
 */
export function invLeaderboard(
  db: Db,
  guildId: string,
  { query = '', page = 1, size = 25 } = {},
) {
  const { config: c } = invConfigOf(db, guildId);
  const counts = tally(db, guildId, c);
  const people = db
    .prepare('SELECT * FROM inv_people WHERE guild_id = ?')
    .all(guildId) as Row[];
  const all: InvRow[] = people.map((p) => {
    const id = p.user_id as string;
    const n = {
      ...(counts.get(id) ?? { regular: 0, left: 0, fake: 0 }),
      bonus: p.bonus as number,
    };
    return {
      rank: null,
      userId: id,
      name: p.name as string,
      avatar: p.avatar as string,
      ...n,
      total: invTotal(c, n),
    };
  });
  const board = all
    .filter((r) => r.regular > 0 || r.bonus !== 0)
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.regular - a.regular ||
        a.name.localeCompare(b.name, 'en'),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const q = query.trim().toLowerCase();
  const matches = (r: InvRow) =>
    !q || r.userId === q || r.name.toLowerCase().includes(q);
  const onBoard = new Set(board.map((r) => r.userId));
  const shown = q
    ? [
        ...board.filter(matches),
        ...all
          .filter((r) => !onBoard.has(r.userId) && matches(r))
          .sort((a, b) => a.name.localeCompare(b.name, 'en')),
      ]
    : board;
  const pages = Math.max(1, Math.ceil(shown.length / size));
  const at = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return {
    rows: shown.slice((at - 1) * size, at * size),
    total: shown.length,
    /** How many inviters are on the leaderboard. */
    count: board.length,
    page: at,
    pages,
  };
}

// Reward roles ----------------------------------------------------------------

/**
 * Gives and takes someone's reward roles to match their total. `roles` are
 * their roles now, when the bot already knows them; otherwise Discord is
 * asked. Someone who isn't in the server is left alone.
 */
export async function invApplyRewards(
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
  const { on, config: c } = invConfigOf(db, guildId);
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
  const counts = invCountsOf(db, guildId, userId);
  const plan = invRewardPlan(c, counts.total, new Set(has));
  const name = counts.name || userId;
  const given: string[] = [];
  const taken: string[] = [];
  const tierOf = (role: string) => c.rewards.find((r) => r.role === role);
  const log = (
    action: 'reward-given' | 'reward-removed' | 'failed',
    d: string,
  ) =>
    addInvLog(db, guildId, {
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
        `Reached ${tierOf(role)?.invites ?? ''} invites`,
      );
      given.push(role);
      log(
        'reward-given',
        `${label(role)} for ${tierOf(role)?.invites ?? 0} invites (now ${counts.total})`,
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
        'Invite reward no longer earned',
      );
      taken.push(role);
      log('reward-removed', `${label(role)} (now ${counts.total} invites)`);
    } catch {
      log(
        'failed',
        `Sparko couldn’t take ${label(role)} back. It needs Manage Roles, and its role has to be above it.`,
      );
    }
  return { given, taken };
}

/** Everyone who could have reward roles: inviters, and anyone with a bonus. */
export function invRewardTargets(db: Db, guildId: string, limit = 500) {
  return invLeaderboard(db, guildId, { size: limit }).rows.map((r) => r.userId);
}

// Joining and leaving ---------------------------------------------------------

/** A member, for their join or leave and the message's {user} variables. */
export type InvMember = InvPerson & {
  createdAt: number;
  joinedAt?: number | undefined;
};

/** A join or leave message: the server's template, or Sparko's own. */
export function invMessage(db: Db, guildId: string, c: Invites, kind: InvKind) {
  const id = c[kind].template;
  const t = id
    ? getTemplate<StudioMessage>(db, guildId, 'studio', id)
    : undefined;
  return normaliseStudio(t?.message ?? invDefaultMessage(kind));
}

function plain(e: unknown, what: string): string {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    return `Sparko can’t post the ${what} message. Give it View Channel, Send Messages and Embed Links there.`;
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    return `The ${what} channel no longer exists. Pick another one.`;
  if (e instanceof DiscordError && e.status === 400)
    return `Discord didn’t accept the ${what} message: ${e.message}`;
  return `Sparko couldn’t post the ${what} message.`;
}

/** Posts the join or leave message, if it's on. */
async function post(
  rest: Rest,
  db: Db,
  guildId: string,
  c: Invites,
  kind: InvKind,
  member: InvMember,
  facts: InvMessageFacts,
  now: number,
) {
  const m = c[kind];
  if (!m.on || !m.channel) return;
  const message = invMessage(db, guildId, c, kind);
  try {
    const sent = await rest.post<{ id: string }>(
      `/channels/${m.channel}/messages`,
      invPayload(message, facts, {
        now,
        user: member,
        server: serverVars(getGuild(db, guildId)),
        channel: m.channel,
      }),
    );
    rememberPost(db, guildId, sent.id, message, now);
  } catch (e) {
    addInvLog(db, guildId, {
      action: 'failed',
      userId: member.id,
      userName: member.name,
      detail: plain(e, kind),
      at: now,
    });
  }
}

const usesText = (n: number) => `${n} ${n === 1 ? 'use' : 'uses'}`;

/**
 * Someone joined: works out which invite they used by reading the
 * server's invites again, records the join for the inviter, posts the join
 * message and updates the inviter's reward roles.
 */
export async function invJoined(
  rest: Rest,
  db: Db,
  guildId: string,
  member: InvMember,
  {
    now = Date.now(),
    roleName,
    rolesOf,
  }: {
    now?: number;
    roleName?: (id: string) => string | undefined;
    /** Roles a member has, when the bot knows them. */
    rolesOf?: (id: string) => string[] | undefined;
  } = {},
) {
  const { on, config: c } = invConfigOf(db, guildId);
  if (!on) return null;
  const before = storedCodes(db, guildId);
  const state = invState(db, guildId);
  const fresh = await fetchCodes(rest, guildId);
  let used: InvCode | null = null;
  let type: InvJoinType = 'unknown';
  let uses = 0;
  if (fresh) {
    used = invDiff(before, fresh.codes);
    if (used) {
      type = 'normal';
      uses = used.uses;
    } else if (fresh.vanity && fresh.vanity.uses > state.vanityUses) {
      type = 'vanity';
      uses = fresh.vanity.uses;
    }
    saveCodes(db, guildId, fresh.codes, now);
    setState(db, guildId, {
      vanity_code: fresh.vanity?.code ?? '',
      vanity_uses: fresh.vanity?.uses ?? 0,
    });
  } else setState(db, guildId, { can_list: 0 });

  const inviter =
    used?.inviterId && used.inviterId !== member.id
      ? { id: used.inviterId, name: used.inviterName }
      : null;
  const fake = invIsFake(c, member.createdAt, now);
  const earlier = db
    .prepare(
      'SELECT * FROM inv_joins WHERE guild_id = ? AND user_id = ? ORDER BY id',
    )
    .all(guildId, member.id) as Row[];
  const rejoin = earlier.length > 0;
  // With rejoins not counting again, whoever first got them in keeps them.
  const first = earlier.map(joinOf).find((j) => j.counted && j.inviterId);
  const counted = !!inviter && (!rejoin || c.countRejoins);
  if (rejoin && !c.countRejoins && first)
    db.prepare('UPDATE inv_joins SET left_at = NULL WHERE id = ?').run(
      first.id,
    );
  remember(db, guildId, member);
  if (inviter) remember(db, guildId, { ...inviter, avatar: '' });
  db.prepare(
    `INSERT INTO inv_joins (guild_id, user_id, user_name, avatar, inviter_id,
       inviter_name, code, type, fake, counted, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    member.id,
    member.name,
    member.avatar,
    inviter?.id ?? null,
    inviter?.name ?? '',
    type === 'vanity' ? (fresh?.vanity?.code ?? '') : (used?.code ?? ''),
    type,
    fake ? 1 : 0,
    counted ? 1 : 0,
    now,
  );

  const notes: string[] = [];
  if (type === 'normal')
    notes.push(
      `invited by ${inviter ? `@${inviter.name}` : 'nobody Sparko knows'} with ${used!.code} (${usesText(used!.uses)})`,
    );
  else if (type === 'vanity')
    notes.push(`with the vanity link (${usesText(uses)})`);
  else
    notes.push(
      fresh
        ? 'Sparko couldn’t tell which invite they used'
        : 'Sparko can’t see invites without Manage Server',
    );
  if (fake) notes.push('a new account, counted as fake');
  if (rejoin)
    notes.push(
      c.countRejoins || !first
        ? 'they’d been here before'
        : `rejoined, still counted for @${first.inviterName}`,
    );
  addInvLog(db, guildId, {
    action: 'joined',
    userId: member.id,
    userName: member.name,
    detail: notes.join(', '),
    at: now,
  });

  // The inviter shown is whoever this join counts for.
  const creditTo =
    counted || !first?.inviterId
      ? inviter
      : { id: first.inviterId, name: first.inviterName };
  const total = creditTo ? invCountsOf(db, guildId, creditTo.id).total : 0;
  await post(
    rest,
    db,
    guildId,
    c,
    'join',
    member,
    {
      type,
      inviter: creditTo && { ...creditTo, total },
      code:
        type === 'vanity' ? (fresh?.vanity?.code ?? '') : (used?.code ?? ''),
      uses,
    },
    now,
  );
  for (const id of new Set(
    [inviter?.id, first && !c.countRejoins ? first.inviterId : null].filter(
      (x): x is string => !!x,
    ),
  ))
    await invApplyRewards(rest, db, guildId, id, {
      now,
      roles: rolesOf?.(id),
      ...(roleName ? { roleName } : {}),
    }).catch(() => {});
  return {
    type,
    inviterId: inviter?.id ?? null,
    code: used?.code ?? '',
    fake,
    counted,
  };
}

/**
 * Someone left: their joins are marked, the leave message names who had
 * invited them, and that inviter's reward roles follow their new total.
 */
export async function invLeft(
  rest: Rest,
  db: Db,
  guildId: string,
  member: InvMember,
  {
    now = Date.now(),
    roleName,
    rolesOf,
  }: {
    now?: number;
    roleName?: (id: string) => string | undefined;
    rolesOf?: (id: string) => string[] | undefined;
  } = {},
) {
  const { on, config: c } = invConfigOf(db, guildId);
  if (!on) return null;
  const rows = (
    db
      .prepare(
        'SELECT * FROM inv_joins WHERE guild_id = ? AND user_id = ? AND left_at IS NULL',
      )
      .all(guildId, member.id) as Row[]
  ).map(joinOf);
  db.prepare(
    'UPDATE inv_joins SET left_at = ? WHERE guild_id = ? AND user_id = ? AND left_at IS NULL',
  ).run(now, guildId, member.id);
  // Whoever their stay counted for: that's who loses an invite.
  const last = invitedBy(db, guildId, member.id);
  const counted = rows.find((r) => r.counted && r.inviterId);
  const by = counted ?? last;
  const inviter = by?.inviterId
    ? { id: by.inviterId, name: by.inviterName }
    : null;
  const total = inviter ? invCountsOf(db, guildId, inviter.id).total : 0;
  addInvLog(db, guildId, {
    action: 'left',
    userId: member.id,
    userName: member.name,
    detail: inviter
      ? `invited by @${inviter.name}${counted && c.subtractLeaves ? `, who now has ${total}` : ''}`
      : by?.type === 'vanity'
        ? 'they’d joined with the vanity link'
        : 'Sparko doesn’t know who invited them',
    at: now,
  });
  await post(
    rest,
    db,
    guildId,
    c,
    'leave',
    member,
    {
      type: by?.type ?? 'unknown',
      inviter: inviter && { ...inviter, total },
      code: by?.code ?? '',
      uses: by?.code
        ? (storedCodes(db, guildId).find((x) => x.code === by.code)?.uses ?? 0)
        : 0,
    },
    now,
  );
  if (counted?.inviterId)
    await invApplyRewards(rest, db, guildId, counted.inviterId, {
      now,
      roles: rolesOf?.(counted.inviterId),
      ...(roleName ? { roleName } : {}),
    }).catch(() => {});
  return { inviterId: inviter?.id ?? null };
}

// Staff changes ---------------------------------------------------------------

/** Adds (or with a negative amount, takes away) bonus invites. */
export function invBonus(
  db: Db,
  guildId: string,
  who: InvPerson,
  amount: number,
  by: { id: string; name: string },
  now = Date.now(),
) {
  remember(db, guildId, who);
  db.prepare(
    'UPDATE inv_people SET bonus = bonus + ? WHERE guild_id = ? AND user_id = ?',
  ).run(amount, guildId, who.id);
  const after = invCountsOf(db, guildId, who.id);
  addInvLog(db, guildId, {
    action: 'bonus',
    userId: who.id,
    userName: after.name || who.name,
    detail: `${amount > 0 ? '+' : ''}${amount} by @${by.name}, ${after.bonus} bonus and ${after.total} in total`,
    at: now,
  });
  return after;
}

/**
 * Resets someone's invites, or everyone's: their invites stop counting and
 * their bonus goes. Who invited whom is kept. Returns whose counts changed.
 */
export function invReset(
  db: Db,
  guildId: string,
  userId: string | null,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const touched = (
    db
      .prepare(
        `SELECT DISTINCT inviter_id AS id FROM inv_joins
         WHERE guild_id = ? AND counted = 1 AND inviter_id IS NOT NULL
           AND (? IS NULL OR inviter_id = ?)
         UNION SELECT user_id AS id FROM inv_people
         WHERE guild_id = ? AND bonus != 0 AND (? IS NULL OR user_id = ?)`,
      )
      .all(guildId, userId, userId, guildId, userId, userId) as Row[]
  ).map((r) => r.id as string);
  db.prepare(
    `UPDATE inv_joins SET counted = 0
     WHERE guild_id = ? AND (? IS NULL OR inviter_id = ?)`,
  ).run(guildId, userId, userId);
  db.prepare(
    `UPDATE inv_people SET bonus = 0 WHERE guild_id = ? AND (? IS NULL OR user_id = ?)`,
  ).run(guildId, userId, userId);
  const name = userId
    ? (((
        db
          .prepare(
            'SELECT name FROM inv_people WHERE guild_id = ? AND user_id = ?',
          )
          .get(guildId, userId) as Row | undefined
      )?.name as string | undefined) ?? userId)
    : 'everyone';
  addInvLog(db, guildId, {
    action: 'reset',
    userId: userId ?? '0',
    userName: name,
    detail: `by @${by.name}`,
    at: now,
  });
  return touched;
}

// Testing the messages --------------------------------------------------------

/** Posts a made-up join or leave message in a channel, so staff can see it. */
export async function invTestPost(
  rest: Rest,
  db: Db,
  guildId: string,
  channel: string,
  kind: InvKind,
  by: InvPerson,
  now = Date.now(),
) {
  const { config: c } = invConfigOf(db, guildId);
  const message = invMessage(db, guildId, c, kind);
  const body = invPayload(
    message,
    {
      type: 'normal',
      inviter: { id: by.id, name: by.name, total: 12 },
      code: 'sparko',
      uses: 12,
    },
    {
      now,
      user: { ...by, createdAt: now - 400 * 86_400_000, joinedAt: now },
      server: serverVars(getGuild(db, guildId)),
      channel,
    },
  );
  const note = 'This is a test. Nobody joined or left.';
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
            components: [
              { type: 10, content: `-# ${note}` },
              ...(flagged.components ?? []),
            ],
          }
        : { ...body, content: `-# ${note}\n${flagged.content ?? ''}`.trim() },
    );
  } catch (e) {
    throw new Plain(plain(e, kind));
  }
}
