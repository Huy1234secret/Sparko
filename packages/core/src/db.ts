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
  // 4: saved message templates.
  `CREATE TABLE templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    name TEXT NOT NULL,
    json TEXT NOT NULL,
    who_name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX templates_by_module ON templates (guild_id, module_id, id DESC);`,
  // 5: template folders, and a shared order for templates and folders.
  `CREATE TABLE template_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX template_folders_by_module ON template_folders (guild_id, module_id);
  ALTER TABLE templates ADD COLUMN folder_id INTEGER;
  ALTER TABLE templates ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  UPDATE templates SET position = -id;`,
  // 6: Studio messages Sparko posted, so their buttons and menus can work.
  `CREATE TABLE studio_posts (
    message_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    json TEXT NOT NULL,
    posted_at INTEGER NOT NULL
  );
  CREATE INDEX studio_posts_by_guild ON studio_posts (guild_id);`,
  // 7: what welcome, leave and boost messages did, for their log.
  `CREATE TABLE greet_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    ok INTEGER NOT NULL,
    template TEXT NOT NULL,
    channel_id TEXT,
    member_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX greet_log_by_guild ON greet_log (guild_id, id DESC);`,
  // 8: reaction role messages Sparko posted, and what they did.
  `CREATE TABLE rr_posts (
    message_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    emojis TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX rr_posts_by_template ON rr_posts (guild_id, template_id);
  CREATE TABLE rr_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    template TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    role_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX rr_log_by_guild ON rr_log (guild_id, id DESC);`,
  // 9: what automatic roles knows about each member, and what it did.
  `CREATE TABLE ar_members (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    joined_at INTEGER,
    served_ms INTEGER NOT NULL DEFAULT 0,
    boosts INTEGER NOT NULL DEFAULT 0,
    boosting_since INTEGER,
    flags INTEGER NOT NULL DEFAULT 0,
    given TEXT NOT NULL DEFAULT '[]',
    blocked TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE ar_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    role_id TEXT NOT NULL DEFAULT '',
    trigger TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX ar_log_by_guild ON ar_log (guild_id, id DESC);`,
  // 10: suggestions, who voted on them, and what happened to them.
  `CREATE TABLE suggestions (
    guild_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_avatar TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    files TEXT NOT NULL DEFAULT '[]',
    dup_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    closed INTEGER NOT NULL DEFAULT 0,
    up INTEGER NOT NULL DEFAULT 0,
    down INTEGER NOT NULL DEFAULT 0,
    channel_id TEXT,
    message_id TEXT,
    more_ids TEXT NOT NULL DEFAULT '[]',
    thread_id TEXT,
    review_channel_id TEXT,
    review_message_id TEXT,
    reason_json TEXT,
    created_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, number)
  );
  CREATE INDEX suggestions_by_message ON suggestions (message_id);
  CREATE INDEX suggestions_by_review ON suggestions (review_message_id);
  CREATE INDEX suggestions_by_author ON suggestions (guild_id, author_id);
  CREATE INDEX suggestions_open ON suggestions (closed, last_at);
  CREATE TABLE sg_votes (
    guild_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    PRIMARY KEY (guild_id, number, user_id)
  );
  CREATE TABLE sg_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    number INTEGER,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX sg_log_by_guild ON sg_log (guild_id, id DESC);`,
  // Boosts, so {server.boosts} and {server.level} work in every message.
  `ALTER TABLE guilds ADD COLUMN boosts INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE guilds ADD COLUMN boost_level INTEGER NOT NULL DEFAULT 0;`,
  // Birthdays members saved, what Sparko did with them, and the monthly post.
  `CREATE TABLE birthdays (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    day INTEGER NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER,
    time_zone TEXT NOT NULL DEFAULT '',
    set_by_id TEXT NOT NULL,
    set_by_name TEXT NOT NULL,
    in_server INTEGER NOT NULL DEFAULT 1,
    celebrated_year INTEGER,
    role_id TEXT,
    role_until INTEGER,
    changed_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX birthdays_by_date ON birthdays (guild_id, month, day);
  CREATE INDEX birthdays_roles ON birthdays (role_until);
  CREATE TABLE bd_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX bd_log_by_guild ON bd_log (guild_id, id DESC);
  CREATE TABLE bd_state (
    guild_id TEXT PRIMARY KEY,
    monthly TEXT NOT NULL DEFAULT ''
  );`,
  // Questions & answers: the questions, who pressed Me too, and the log.
  `CREATE TABLE questions (
    guild_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    asker_id TEXT NOT NULL,
    asker_name TEXT NOT NULL,
    asker_avatar TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    files TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'open',
    me_too INTEGER NOT NULL DEFAULT 0,
    channel_id TEXT,
    message_id TEXT,
    thread_id TEXT,
    answer_id TEXT,
    answer_json TEXT,
    closed_json TEXT,
    created_at INTEGER NOT NULL,
    answered_at INTEGER,
    close_at INTEGER,
    thread_closed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, number)
  );
  CREATE INDEX questions_by_message ON questions (message_id);
  CREATE INDEX questions_by_asker ON questions (guild_id, asker_id);
  CREATE INDEX questions_due ON questions (thread_closed, close_at);
  CREATE TABLE qa_metoo (
    guild_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, number, user_id)
  );
  CREATE TABLE qa_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    number INTEGER,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX qa_log_by_guild ON qa_log (guild_id, id DESC);`,
  // Starboard: starred messages per board, who starred them, who's blocked,
  // and what happened.
  `CREATE TABLE sb_entries (
    guild_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL DEFAULT '',
    author_avatar TEXT NOT NULL DEFAULT '',
    content TEXT,
    image TEXT NOT NULL DEFAULT '',
    stars INTEGER NOT NULL DEFAULT 0,
    shown INTEGER NOT NULL DEFAULT 0,
    milestone INTEGER NOT NULL DEFAULT 0,
    post_channel_id TEXT,
    post_id TEXT,
    frozen INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    message_at INTEGER NOT NULL,
    posted_at INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, board_id, message_id)
  );
  CREATE INDEX sb_entries_by_post ON sb_entries (post_id);
  CREATE INDEX sb_entries_by_message ON sb_entries (message_id);
  CREATE INDEX sb_entries_by_author ON sb_entries (guild_id, author_id);
  CREATE INDEX sb_entries_waiting ON sb_entries (guild_id, posted_at, updated_at);
  CREATE TABLE sb_reactors (
    guild_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    on_post INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, board_id, message_id, user_id, emoji, on_post)
  );
  CREATE INDEX sb_reactors_by_user ON sb_reactors (guild_id, user_id);
  CREATE TABLE sb_blocked (
    guild_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    channel_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    preview TEXT NOT NULL DEFAULT '',
    by_name TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, kind, target_id)
  );
  CREATE TABLE sb_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    board_id TEXT NOT NULL DEFAULT '',
    board_name TEXT NOT NULL DEFAULT '',
    message_id TEXT NOT NULL DEFAULT '',
    channel_id TEXT NOT NULL DEFAULT '',
    author_id TEXT NOT NULL DEFAULT '',
    author_name TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    stars INTEGER NOT NULL DEFAULT 0,
    detail TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX sb_log_by_guild ON sb_log (guild_id, id DESC);`,
  // Polls, their votes, and what happened to them.
  `CREATE TABLE polls (
    guild_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    rules TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    post_at INTEGER NOT NULL,
    ends_at INTEGER,
    length_ms INTEGER,
    ended_at INTEGER,
    ended_why TEXT,
    ended_by TEXT NOT NULL DEFAULT '',
    picked TEXT,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_avatar TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, id)
  );
  CREATE INDEX polls_by_message ON polls (message_id);
  CREATE INDEX polls_due ON polls (guild_id, status, post_at);
  CREATE TABLE poll_votes (
    guild_id TEXT NOT NULL,
    poll_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    option_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, poll_id, user_id, option_id)
  );
  CREATE TABLE poll_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    poll INTEGER,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX poll_log_by_guild ON poll_log (guild_id, id DESC);`,
  // Invite tracking: each server's invites, who joined with which, inviters'
  // bonuses, the log, and the vanity link's uses.
  `CREATE TABLE inv_codes (
    guild_id TEXT NOT NULL,
    code TEXT NOT NULL,
    inviter_id TEXT,
    inviter_name TEXT NOT NULL DEFAULT '',
    channel_id TEXT NOT NULL DEFAULT '',
    channel_name TEXT NOT NULL DEFAULT '',
    uses INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, code)
  );
  CREATE TABLE inv_joins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    inviter_id TEXT,
    inviter_name TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    fake INTEGER NOT NULL DEFAULT 0,
    counted INTEGER NOT NULL DEFAULT 1,
    joined_at INTEGER NOT NULL,
    left_at INTEGER
  );
  CREATE INDEX inv_joins_by_inviter ON inv_joins (guild_id, inviter_id);
  CREATE INDEX inv_joins_by_member ON inv_joins (guild_id, user_id);
  CREATE TABLE inv_people (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    bonus INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE inv_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL
  );
  CREATE INDEX inv_log_by_guild ON inv_log (guild_id, id DESC);
  CREATE TABLE inv_state (
    guild_id TEXT PRIMARY KEY,
    vanity_code TEXT NOT NULL DEFAULT '',
    vanity_uses INTEGER NOT NULL DEFAULT 0,
    can_list INTEGER NOT NULL DEFAULT 1,
    synced_at INTEGER
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
