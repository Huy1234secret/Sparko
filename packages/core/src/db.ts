import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Sparko keeps everything in one SQLite file, shared by the website and the
 * bot. WAL mode lets both read while one writes.
 */
export type Db = DatabaseSync;

/** Each entry runs once, in order; never edit one that has shipped. */
const migrations = [
  `CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_json TEXT NOT NULL,
    token_enc TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE guilds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    icon TEXT,
    installed INTEGER NOT NULL DEFAULT 0,
    member_count INTEGER NOT NULL DEFAULT 0,
    plan TEXT NOT NULL DEFAULT 'free',
    paused_json TEXT,
    joined_at INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE modules (
    guild_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, module_id)
  );
  CREATE TABLE versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    title TEXT NOT NULL,
    who_id TEXT,
    who_name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX versions_by_module ON versions (guild_id, module_id, id DESC);
  CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
  );
  CREATE INDEX jobs_by_status ON jobs (status, id);
  CREATE INDEX jobs_by_module ON jobs (guild_id, module_id, id DESC);
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    who TEXT NOT NULL,
    what TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'activity',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX audit_by_guild ON audit (guild_id, id DESC);
  CREATE TABLE skipped_steps (
    guild_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, step_id)
  );
  CREATE TABLE bot_status (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  // 2: people Sparko has already welcomed, for "welcome people who rejoin".
  `CREATE TABLE member_seen (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    first_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );`,
  // 3: tickets, their messages, and messages Sparko keeps up to date.
  `CREATE TABLE tickets (
    guild_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    thread_id TEXT NOT NULL UNIQUE,
    member_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    category TEXT NOT NULL,
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    priority TEXT NOT NULL DEFAULT 'normal',
    assignee_id TEXT,
    assignee_name TEXT,
    opened_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    last_by TEXT NOT NULL DEFAULT 'member',
    warned_at INTEGER,
    closed_by TEXT,
    close_reason TEXT,
    PRIMARY KEY (guild_id, number)
  );
  CREATE INDEX tickets_open ON tickets (status, last_at);
  CREATE TABLE ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    kind TEXT NOT NULL,
    author_id TEXT,
    author_name TEXT NOT NULL,
    staff INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    file TEXT,
    at INTEGER NOT NULL
  );
  CREATE INDEX ticket_messages_by_ticket ON ticket_messages (guild_id, number, id);
  CREATE TABLE posted (
    guild_id TEXT NOT NULL,
    key TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, key)
  );`,
];

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;`);
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  for (let i = version; i < migrations.length; i++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migrations[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}

/** Where the database lives unless DATABASE_PATH says otherwise. */
export const defaultDbPath = (repoRoot: string) =>
  process.env.DATABASE_PATH ?? join(repoRoot, '.data', 'sparko.db');

/** Runs fn in one transaction, retrying the start if another process holds it. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
