import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getModule } from './store.ts';
import {
  AR_MODULE,
  arDefault,
  arRoles,
  createdAt,
  ruleMet,
  servedOf,
  timedRoles,
  type ARLogEntry,
  type ARMember,
  type AutoRoles,
} from './auto-roles.ts';

export * from './auto-roles.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
const list = (v: unknown): string[] => {
  try {
    const x = JSON.parse(String(v)) as unknown;
    return Array.isArray(x) ? x.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
};

export function arConfigOf(db: Db, guildId: string) {
  const m = getModule<AutoRoles>(db, guildId, AR_MODULE);
  return { on: m.on, config: m.config ?? arDefault() };
}

// Saved member data -----------------------------------------------------------

const memberOf = (r: Row): ARMember => ({
  userId: r.user_id as string,
  name: r.name as string,
  joinedAt: (r.joined_at as number | null) ?? null,
  servedMs: r.served_ms as number,
  boosts: r.boosts as number,
  boostingSince: (r.boosting_since as number | null) ?? null,
  flags: r.flags as number,
  given: list(r.given),
  blocked: list(r.blocked),
  updatedAt: r.updated_at as number,
});

export function getARMember(db: Db, guildId: string, userId: string) {
  const r = db
    .prepare('SELECT * FROM ar_members WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as Row | undefined;
  return r ? memberOf(r) : null;
}

function putARMember(db: Db, guildId: string, m: ARMember) {
  db.prepare(
    `INSERT INTO ar_members (guild_id, user_id, name, joined_at, served_ms, boosts,
       boosting_since, flags, given, blocked, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       name = excluded.name, joined_at = excluded.joined_at,
       served_ms = excluded.served_ms, boosts = excluded.boosts,
       boosting_since = excluded.boosting_since, flags = excluded.flags,
       given = excluded.given, blocked = excluded.blocked,
       updated_at = excluded.updated_at`,
  ).run(
    guildId,
    m.userId,
    m.name,
    m.joinedAt,
    m.servedMs,
    m.boosts,
    m.boostingSince,
    m.flags,
    JSON.stringify(m.given),
    JSON.stringify(m.blocked),
    m.updatedAt,
  );
}

/** Members whose name or id matches what staff typed. */
export function searchARMembers(
  db: Db,
  guildId: string,
  query: string,
  limit = 20,
) {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return (
    db
      .prepare(
        `SELECT * FROM ar_members WHERE guild_id = ?
           AND (user_id = ? OR name LIKE ? ESCAPE '\\')
         ORDER BY (user_id = ?) DESC, joined_at IS NULL, name LIMIT ?`,
      )
      .all(guildId, q, like, q, limit) as Row[]
  ).map(memberOf);
}

// The log ---------------------------------------------------------------------

export function addARLog(db: Db, guildId: string, e: Omit<ARLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO ar_log (guild_id, action, user_id, user_name, role_id, trigger, reason, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    e.action,
    e.userId,
    e.userName,
    e.roleId,
    e.trigger,
    e.reason,
    e.at,
  );
  db.prepare(
    `DELETE FROM ar_log WHERE guild_id = ? AND id <= (
       SELECT id FROM ar_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listARLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM ar_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): ARLogEntry => ({
      id: String(r.id),
      action: r.action as ARLogEntry['action'],
      userId: r.user_id as string,
      userName: r.user_name as string,
      roleId: r.role_id as string,
      trigger: r.trigger as string,
      reason: r.reason as string,
      at: r.at as number,
    }),
  );
}

// Giving and taking -----------------------------------------------------------

const why = (e: unknown) =>
  e instanceof DiscordError && e.code === DiscordCodes.missingPermissions
    ? 'Sparko needs Manage Roles, and its role has to be above this one.'
    : e instanceof DiscordError && e.status === 404
      ? 'the role or the member no longer exists.'
      : 'Discord didn’t answer. Sparko will try again later.';

async function change(
  rest: Rest,
  guildId: string,
  userId: string,
  role: string,
  give: boolean,
) {
  const path = `/guilds/${guildId}/members/${userId}/roles/${role}`;
  if (give) await rest.put(path, {}, 'Automatic roles');
  else await rest.delete(path, 'Automatic roles');
}

/** What a member looks like in Discord, as the bot sees them. */
export type ARMemberFacts = {
  userId: string;
  name: string;
  flags: number;
  /** Still hasn't accepted the server's rules. */
  pending: boolean;
  boostingSince: number | null;
  /** When they joined, for members Sparko only learns about later. */
  joinedAt?: number | null;
};

const fresh = (f: ARMemberFacts, now: number): ARMember => ({
  userId: f.userId,
  name: f.name,
  joinedAt: f.joinedAt ?? now,
  servedMs: 0,
  boosts: f.boostingSince ? 1 : 0,
  boostingSince: f.boostingSince,
  flags: f.flags,
  given: [],
  blocked: [],
  updatedAt: now,
});

/**
 * Brings one member's timed and rule roles in line: gives the ones they've
 * reached, and takes back ones they've lost where the setting says so.
 */
export async function arCheck(
  db: Db,
  rest: Rest,
  guildId: string,
  m: ARMember,
  config: AutoRoles,
  now: number,
) {
  if (m.joinedAt === null) return m;
  const timed = timedRoles(config, servedOf(m, now));
  const facts = {
    created: createdAt(m.userId),
    flags: m.flags,
    boosts: m.boosts,
    boostingSince: m.boostingSince,
  };
  const met = config.rules.filter((r) => ruleMet(r, facts, now));
  const want = new Map<string, string>();
  for (const role of timed) {
    const t = config.timed.find((x) => x.role === role)!;
    want.set(role, `${t.after} in the server`);
  }
  for (const r of met) if (!want.has(r.role)) want.set(r.role, r.name);
  // Only roles whose trigger can take them back are taken.
  const takeable = (role: string) =>
    config.timed.some((t) => t.role === role) ||
    config.rules.some((r) => r.role === role && r.removeOnLoss);
  const ours = arRoles(config);
  const next = { ...m, given: m.given.filter((r) => ours.has(r)) };
  let changed = next.given.length !== m.given.length;
  for (const [role, trigger] of want) {
    if (next.given.includes(role) || next.blocked.includes(role)) continue;
    try {
      await change(rest, guildId, m.userId, role, true);
      next.given = [...next.given, role];
      addARLog(db, guildId, {
        action: 'met',
        userId: m.userId,
        userName: m.name,
        roleId: role,
        trigger,
        reason: '',
        at: now,
      });
    } catch (e) {
      next.blocked = [...next.blocked, role];
      addARLog(db, guildId, {
        action: 'failed',
        userId: m.userId,
        userName: m.name,
        roleId: role,
        trigger,
        reason: why(e),
        at: now,
      });
    }
    changed = true;
  }
  for (const role of next.given) {
    if (want.has(role) || !takeable(role)) continue;
    const trigger =
      config.rules.find((r) => r.role === role)?.name ??
      `${config.timed.find((t) => t.role === role)?.after ?? ''} in the server`;
    try {
      await change(rest, guildId, m.userId, role, false);
      next.given = next.given.filter((r) => r !== role);
      addARLog(db, guildId, {
        action: 'lost',
        userId: m.userId,
        userName: m.name,
        roleId: role,
        trigger,
        reason: '',
        at: now,
      });
      changed = true;
    } catch {
      // Tried again on the next check.
    }
  }
  if (changed) {
    next.updatedAt = now;
    putARMember(db, guildId, next);
  }
  return next;
}

async function giveJoinRoles(
  db: Db,
  rest: Rest,
  guildId: string,
  m: { userId: string; name: string },
  give: string[],
  take: string[],
  now: number,
) {
  for (const role of take)
    await change(rest, guildId, m.userId, role, false).catch(() => {});
  for (const role of give)
    try {
      await change(rest, guildId, m.userId, role, true);
      addARLog(db, guildId, {
        action: 'added',
        userId: m.userId,
        userName: m.name,
        roleId: role,
        trigger: 'Join role',
        reason: '',
        at: now,
      });
    } catch (e) {
      addARLog(db, guildId, {
        action: 'failed',
        userId: m.userId,
        userName: m.name,
        roleId: role,
        trigger: 'Join role',
        reason: why(e),
        at: now,
      });
    }
}

/** Someone joined: starts their clock and gives the join roles. */
export async function arJoined(
  db: Db,
  rest: Rest,
  guildId: string,
  f: ARMemberFacts,
  now: number,
) {
  const { on, config } = arConfigOf(db, guildId);
  if (!on) return null;
  const old = getARMember(db, guildId, f.userId);
  const m: ARMember = old
    ? {
        ...old,
        name: f.name,
        flags: f.flags,
        boostingSince: f.boostingSince,
        joinedAt: now,
        // Roles go when someone leaves, so nothing is still given.
        given: [],
        blocked: [],
        servedMs: config.restartOnLeave ? 0 : old.servedMs,
        updatedAt: now,
      }
    : fresh({ ...f, joinedAt: now }, now);
  putARMember(db, guildId, m);
  const { before, after } = config.join;
  await giveJoinRoles(
    db,
    rest,
    guildId,
    f,
    f.pending ? before : after,
    [],
    now,
  );
  return arCheck(db, rest, guildId, m, config, now);
}

/** A member changed: accepted the rules, boosted, or got a new badge. */
export async function arUpdated(
  db: Db,
  rest: Rest,
  guildId: string,
  was: { pending: boolean } | null,
  f: ARMemberFacts,
  now: number,
) {
  const { on, config } = arConfigOf(db, guildId);
  if (!on) return null;
  if (was?.pending && !f.pending) {
    const { before, after } = config.join;
    await giveJoinRoles(
      db,
      rest,
      guildId,
      f,
      after,
      before.filter((r) => !after.includes(r)),
      now,
    );
  }
  const old = getARMember(db, guildId, f.userId) ?? fresh(f, now);
  const m: ARMember = {
    ...old,
    name: f.name,
    flags: f.flags,
    boostingSince: f.boostingSince,
    // A new boost counts at least once.
    boosts:
      f.boostingSince && !old.boostingSince
        ? Math.max(old.boosts, 1)
        : old.boosts,
    joinedAt: old.joinedAt ?? now,
    updatedAt: now,
  };
  putARMember(db, guildId, m);
  return arCheck(db, rest, guildId, m, config, now);
}

/** Discord announced a boost by this member. */
export function arBoosted(
  db: Db,
  guildId: string,
  f: ARMemberFacts,
  count: number,
  now: number,
) {
  if (!arConfigOf(db, guildId).on) return;
  const old = getARMember(db, guildId, f.userId) ?? fresh(f, now);
  putARMember(db, guildId, {
    ...old,
    boosts: old.boosts + count,
    boostingSince: old.boostingSince ?? f.boostingSince ?? now,
    updatedAt: now,
  });
}

/** Someone left: keeps or forgets their time and boosts, as set. */
export function arLeft(db: Db, guildId: string, userId: string, now: number) {
  const { on, config } = arConfigOf(db, guildId);
  const old = getARMember(db, guildId, userId);
  if (!on || !old || old.joinedAt === null) return null;
  const forgetBoosts = config.rules.some(
    (r) => r.resetOnLeave && r.conditions.some((c) => c.kind === 'booster'),
  );
  const m: ARMember = {
    ...old,
    servedMs: config.restartOnLeave ? 0 : servedOf(old, now),
    boosts: forgetBoosts ? 0 : old.boosts,
    joinedAt: null,
    given: [],
    blocked: [],
    updatedAt: now,
  };
  const wiped = m.servedMs === 0 && m.boosts === 0;
  if (wiped)
    db.prepare('DELETE FROM ar_members WHERE guild_id = ? AND user_id = ?').run(
      guildId,
      userId,
    );
  else putARMember(db, guildId, m);
  addARLog(db, guildId, {
    action: wiped ? 'removed' : 'saved',
    userId,
    userName: old.name,
    roleId: '',
    trigger: '',
    reason: '',
    at: now,
  });
  return wiped ? null : m;
}

/** Records members already in the server, from when they joined. */
export function arTrack(
  db: Db,
  guildId: string,
  members: ARMemberFacts[],
  now: number,
) {
  let added = 0;
  for (const f of members) {
    const old = getARMember(db, guildId, f.userId);
    if (old?.joinedAt != null) continue;
    putARMember(
      db,
      guildId,
      old
        ? {
            ...old,
            name: f.name,
            flags: f.flags,
            boostingSince: f.boostingSince,
            joinedAt: f.joinedAt ?? now,
            updatedAt: now,
          }
        : fresh(f, now),
    );
    added++;
  }
  return added;
}

/** Checks everyone in the server; the bot runs this every minute. */
export async function arSweep(
  db: Db,
  rest: Rest,
  guildId: string,
  now: number,
  { retry = false } = {},
) {
  const { on, config } = arConfigOf(db, guildId);
  if (!on) return 0;
  const rows = (
    db
      .prepare(
        'SELECT * FROM ar_members WHERE guild_id = ? AND joined_at IS NOT NULL',
      )
      .all(guildId) as Row[]
  ).map(memberOf);
  for (const m of rows)
    await arCheck(
      db,
      rest,
      guildId,
      retry ? { ...m, blocked: [] } : m,
      config,
      now,
    );
  return rows.length;
}

/** Guilds with automatic roles on, for the sweep. */
export function arGuilds(db: Db) {
  return (
    db
      .prepare(
        'SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1',
      )
      .all(AR_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// Staff edits -----------------------------------------------------------------

/** Staff set a member's time in the server or their boosts. */
export function arEditMember(
  db: Db,
  guildId: string,
  userId: string,
  edit: { servedMs?: number; boosts?: number },
  now: number,
) {
  const old = getARMember(db, guildId, userId);
  if (!old) return null;
  const m: ARMember = { ...old, blocked: [], updatedAt: now };
  if (edit.servedMs !== undefined) {
    m.servedMs = edit.servedMs;
    if (m.joinedAt !== null) m.joinedAt = now;
  }
  if (edit.boosts !== undefined) m.boosts = edit.boosts;
  putARMember(db, guildId, m);
  addARLog(db, guildId, {
    action: 'saved',
    userId,
    userName: old.name,
    roleId: '',
    trigger: '',
    reason: '',
    at: now,
  });
  return m;
}

/** Staff wiped a member's data: their time and boosts start again. */
export function arWipeMember(
  db: Db,
  guildId: string,
  userId: string,
  now: number,
) {
  const old = getARMember(db, guildId, userId);
  if (!old) return null;
  if (old.joinedAt === null)
    db.prepare('DELETE FROM ar_members WHERE guild_id = ? AND user_id = ?').run(
      guildId,
      userId,
    );
  else
    putARMember(db, guildId, {
      ...old,
      joinedAt: now,
      servedMs: 0,
      boosts: 0,
      blocked: [],
      updatedAt: now,
    });
  addARLog(db, guildId, {
    action: 'removed',
    userId,
    userName: old.name,
    roleId: '',
    trigger: '',
    reason: '',
    at: now,
  });
  return old.joinedAt === null ? null : getARMember(db, guildId, userId);
}
