import type { Db } from './db.ts';

/** Reads and writes for everything Sparko stores. Times are epoch ms. */

type Row = Record<string, unknown>;
const parse = <T>(json: unknown, fallback: T): T =>
  typeof json === 'string' ? (JSON.parse(json) as T) : fallback;

// Sessions ------------------------------------------------------------------

export type StoredUser = { id: string; name: string; avatarUrl: string };

export function saveSession(
  db: Db,
  s: {
    idHash: string;
    user: StoredUser;
    tokenEnc: string;
    expiresAt: number;
  },
) {
  db.prepare(
    `INSERT INTO sessions (id_hash, user_id, user_json, token_enc, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(s.idHash, s.user.id, JSON.stringify(s.user), s.tokenEnc, s.expiresAt);
}

export function findSession(db: Db, idHash: string, now: number) {
  const row = db
    .prepare('SELECT * FROM sessions WHERE id_hash = ?')
    .get(idHash) as Row | undefined;
  if (!row) return undefined;
  if ((row.expires_at as number) < now) {
    deleteSession(db, idHash);
    return undefined;
  }
  return {
    user: parse<StoredUser>(row.user_json, { id: '', name: '', avatarUrl: '' }),
    tokenEnc: row.token_enc as string,
  };
}

export function deleteSession(db: Db, idHash: string) {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
}

export function pruneSessions(db: Db, now: number) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}

// Servers -------------------------------------------------------------------

export type GuildRow = {
  id: string;
  name: string;
  icon: string | null;
  installed: boolean;
  memberCount: number;
  plan: 'free' | 'plus';
  paused: { reason: string; reference: string } | null;
  joinedAt: number | null;
};

const toGuild = (r: Row): GuildRow => ({
  id: r.id as string,
  name: r.name as string,
  icon: (r.icon as string | null) ?? null,
  installed: r.installed === 1,
  memberCount: r.member_count as number,
  plan: r.plan === 'plus' ? 'plus' : 'free',
  paused: parse(r.paused_json, null),
  joinedAt: (r.joined_at as number | null) ?? null,
});

export function getGuild(db: Db, id: string) {
  const r = db.prepare('SELECT * FROM guilds WHERE id = ?').get(id) as
    | Row
    | undefined;
  return r ? toGuild(r) : undefined;
}

export function installedGuildIds(db: Db) {
  const rows = db
    .prepare('SELECT id FROM guilds WHERE installed = 1')
    .all() as Row[];
  return new Set(rows.map((r) => r.id as string));
}

/** Records a server the bot is in (from Discord's gateway). */
export function upsertGuild(
  db: Db,
  g: {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
    installed: boolean;
  },
  now: number,
) {
  db.prepare(
    `INSERT INTO guilds (id, name, icon, member_count, installed, joined_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, icon = excluded.icon,
       member_count = excluded.member_count,
       joined_at = CASE WHEN guilds.installed = 0 AND excluded.installed = 1
         THEN excluded.joined_at ELSE guilds.joined_at END,
       installed = excluded.installed, updated_at = excluded.updated_at`,
  ).run(
    g.id,
    g.name,
    g.icon,
    g.memberCount,
    g.installed ? 1 : 0,
    g.installed ? now : null,
    now,
  );
}

/** Marks every server not in `ids` as no longer having the bot. */
export function markOnlyInstalled(db: Db, ids: Set<string>, now: number) {
  for (const id of installedGuildIds(db))
    if (!ids.has(id))
      db.prepare(
        'UPDATE guilds SET installed = 0, updated_at = ? WHERE id = ?',
      ).run(now, id);
}

// Modules -------------------------------------------------------------------

export function getModule<T>(db: Db, guildId: string, moduleId: string) {
  const r = db
    .prepare('SELECT * FROM modules WHERE guild_id = ? AND module_id = ?')
    .get(guildId, moduleId) as Row | undefined;
  return {
    on: r?.enabled === 1,
    config: parse<T | null>(r?.config_json, null),
    updatedAt: (r?.updated_at as number | undefined) ?? null,
  };
}

export function enabledModules(db: Db, guildId: string) {
  const rows = db
    .prepare('SELECT module_id FROM modules WHERE guild_id = ? AND enabled = 1')
    .all(guildId) as Row[];
  return Object.fromEntries(rows.map((r) => [r.module_id as string, true]));
}

export function writeModule(
  db: Db,
  guildId: string,
  moduleId: string,
  change: { on: boolean; config?: unknown },
  now: number,
) {
  db.prepare(
    `INSERT INTO modules (guild_id, module_id, enabled, config_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, module_id) DO UPDATE SET
       enabled = excluded.enabled,
       config_json = COALESCE(excluded.config_json, modules.config_json),
       updated_at = excluded.updated_at`,
  ).run(
    guildId,
    moduleId,
    change.on ? 1 : 0,
    change.config === undefined ? null : JSON.stringify(change.config),
    now,
  );
}

// Versions ------------------------------------------------------------------

export function addVersion(
  db: Db,
  v: {
    guildId: string;
    moduleId: string;
    title: string;
    who: { id: string; name: string };
    config: unknown;
  },
  now: number,
) {
  db.prepare(
    `INSERT INTO versions (guild_id, module_id, title, who_id, who_name, config_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    v.guildId,
    v.moduleId,
    v.title,
    v.who.id,
    v.who.name,
    JSON.stringify(v.config),
    now,
  );
}

export function listVersions<T>(
  db: Db,
  guildId: string,
  moduleId: string,
  limit = 20,
) {
  const rows = db
    .prepare(
      `SELECT * FROM versions WHERE guild_id = ? AND module_id = ?
       ORDER BY id DESC LIMIT ?`,
    )
    .all(guildId, moduleId, limit) as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title as string,
    whoId: (r.who_id as string | null) ?? null,
    who: r.who_name as string,
    at: r.created_at as number,
    config: parse<T>(r.config_json, null as T),
  }));
}

// Jobs: changes waiting for the bot to apply in Discord ----------------------

export type Job = {
  id: number;
  guildId: string;
  moduleId: string;
  kind: string;
  payload: unknown;
  status: 'pending' | 'running' | 'done' | 'error';
  error: string | null;
  createdAt: number;
};

const toJob = (r: Row): Job => ({
  id: r.id as number,
  guildId: r.guild_id as string,
  moduleId: r.module_id as string,
  kind: r.kind as string,
  payload: parse(r.payload_json, {}),
  status: r.status as Job['status'],
  error: (r.error as string | null) ?? null,
  createdAt: r.created_at as number,
});

export function enqueueJob(
  db: Db,
  j: { guildId: string; moduleId: string; kind: string; payload?: unknown },
  now: number,
) {
  const r = db
    .prepare(
      `INSERT INTO jobs (guild_id, module_id, kind, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      j.guildId,
      j.moduleId,
      j.kind,
      JSON.stringify(j.payload ?? {}),
      now,
    ) as Row;
  return r.id as number;
}

/** Takes the oldest waiting job, so only one worker runs it. */
export function claimJob(db: Db) {
  const r = db
    .prepare(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1
       WHERE id = (SELECT id FROM jobs WHERE status = 'pending' ORDER BY id LIMIT 1)
       RETURNING *`,
    )
    .get() as Row | undefined;
  return r ? toJob(r) : undefined;
}

export function finishJob(
  db: Db,
  id: number,
  error: string | null,
  now: number,
) {
  db.prepare(
    `UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?`,
  ).run(error ? 'error' : 'done', error, now, id);
}

/** After a restart, jobs that were mid-run are tried again. */
export function requeueRunning(db: Db) {
  db.prepare(
    `UPDATE jobs SET status = 'pending' WHERE status = 'running'`,
  ).run();
}

export function latestJob(db: Db, guildId: string, moduleId: string) {
  const r = db
    .prepare(
      `SELECT * FROM jobs WHERE guild_id = ? AND module_id = ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(guildId, moduleId) as Row | undefined;
  return r ? toJob(r) : undefined;
}

export function pruneJobs(db: Db, before: number) {
  db.prepare(
    `DELETE FROM jobs WHERE status IN ('done', 'error') AND created_at < ?`,
  ).run(before);
}

// Activity ------------------------------------------------------------------

export function addAudit(
  db: Db,
  a: {
    guildId: string;
    who: string;
    what: string;
    detail?: string;
    icon?: string;
  },
  now: number,
) {
  db.prepare(
    `INSERT INTO audit (guild_id, who, what, detail, icon, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(a.guildId, a.who, a.what, a.detail ?? '', a.icon ?? 'activity', now);
}

export function listAudit(db: Db, guildId: string, limit = 6) {
  const rows = db
    .prepare('SELECT * FROM audit WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
    .all(guildId, limit) as Row[];
  return rows.map((r) => ({
    who: r.who as string,
    what: r.what as string,
    detail: r.detail as string,
    icon: r.icon as string,
    at: r.created_at as number,
  }));
}

// Setup checklist -----------------------------------------------------------

export function skippedSteps(db: Db, guildId: string) {
  const rows = db
    .prepare('SELECT step_id FROM skipped_steps WHERE guild_id = ?')
    .all(guildId) as Row[];
  return new Set(rows.map((r) => r.step_id as string));
}

export function setStepSkipped(
  db: Db,
  guildId: string,
  stepId: string,
  skipped: boolean,
) {
  if (skipped)
    db.prepare(
      'INSERT OR IGNORE INTO skipped_steps (guild_id, step_id) VALUES (?, ?)',
    ).run(guildId, stepId);
  else
    db.prepare(
      'DELETE FROM skipped_steps WHERE guild_id = ? AND step_id = ?',
    ).run(guildId, stepId);
}

// Bot status (heartbeat, commands) -------------------------------------------

export function setStatus(db: Db, key: string, value: unknown, now: number) {
  db.prepare(
    `INSERT INTO bot_status (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json,
       updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), now);
}

export function getStatus<T>(db: Db, key: string) {
  const r = db.prepare('SELECT * FROM bot_status WHERE key = ?').get(key) as
    | Row
    | undefined;
  return r
    ? { value: parse<T>(r.value_json, null as T), at: r.updated_at as number }
    : undefined;
}

// Display -------------------------------------------------------------------

/** "Just now", "12 min", "3 h", "Yesterday", "2 days", then a date. */
export function ago(at: number, now: number) {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days`;
  return new Date(at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
