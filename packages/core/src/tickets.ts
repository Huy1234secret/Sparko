import type { Db } from './db.ts';

/** Tickets: the panel settings, and the tickets and messages Sparko keeps. */
export type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger';
export type TicketPanel = {
  channel: string;
  title: string;
  description: string;
  color: string;
  topics: { id: string; label: string; style: ButtonStyle; question: string }[];
  /** Staff role ids. */
  roles: string[];
  ping: boolean;
  onePerMember: boolean;
  autoClose: 'never' | '24h' | '48h' | '7d';
};
export type TicketStatus = 'new' | 'claimed' | 'waiting' | 'closed';
export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';

export const autoCloseMs: Record<TicketPanel['autoClose'], number> = {
  never: 0,
  '24h': 24 * 3_600_000,
  '48h': 48 * 3_600_000,
  '7d': 7 * 86_400_000,
};

export const ticketPanelDefault = (channel: string): TicketPanel => ({
  channel,
  title: 'Need a hand?',
  description:
    'Press a button below and a private thread opens with our staff. Only you and the team can see it.',
  color: '#FACC15',
  topics: [
    {
      id: 'help',
      label: 'Get help',
      style: 'primary',
      question: 'What can we help with?',
    },
    {
      id: 'report',
      label: 'Report a member',
      style: 'danger',
      question: 'Who is it, and what happened? Screenshots help a lot.',
    },
  ],
  roles: [],
  ping: true,
  onePerMember: true,
  autoClose: '48h',
});

const styles = ['primary', 'secondary', 'success', 'danger'];
const snowflake = /^\d{1,25}$/;

/** Checks panel settings from the dashboard. Returns a problem, or null. */
export function panelProblem(p: unknown): string | null {
  const x = p as Partial<TicketPanel> | null;
  if (!x || typeof x !== 'object') return 'The panel settings are missing.';
  if (!snowflake.test(x.channel ?? '')) return 'Pick a channel for the panel.';
  if (typeof x.title !== 'string' || !x.title.trim() || x.title.length > 256)
    return 'Give the panel a title of up to 256 characters.';
  if (typeof x.description !== 'string' || x.description.length > 1000)
    return 'The description must be 1,000 characters or fewer.';
  if (typeof x.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(x.color))
    return 'Use a colour like #FACC15.';
  if (!Array.isArray(x.topics) || x.topics.length < 1 || x.topics.length > 5)
    return 'Add between one and five buttons.';
  for (const t of x.topics)
    if (
      typeof t?.id !== 'string' ||
      !/^[\w-]{1,40}$/.test(t.id) ||
      typeof t.label !== 'string' ||
      !t.label.trim() ||
      t.label.length > 80 ||
      !styles.includes(t.style) ||
      typeof t.question !== 'string' ||
      t.question.length > 200
    )
      return 'Every button needs a label (up to 80 characters) and a question.';
  if (!Array.isArray(x.roles) || x.roles.some((r) => !snowflake.test(r)))
    return 'Pick staff roles from the list.';
  if (!x.roles.length) return 'Pick at least one staff role.';
  for (const key of ['ping', 'onePerMember'] as const)
    if (typeof x[key] !== 'boolean') return 'Some settings are missing.';
  if (!(x.autoClose! in autoCloseMs)) return 'Pick when tickets close.';
  return null;
}

export const cleanPanel = (p: TicketPanel): TicketPanel => ({
  channel: p.channel,
  title: p.title.trim(),
  description: p.description,
  color: p.color,
  topics: p.topics.map(({ id, label, style, question }) => ({
    id,
    label: label.trim(),
    style,
    question,
  })),
  roles: [...new Set(p.roles)],
  ping: p.ping,
  onePerMember: p.onePerMember,
  autoClose: p.autoClose,
});

// Stored tickets -------------------------------------------------------------

type Row = Record<string, unknown>;
export type TicketRow = {
  guildId: string;
  number: number;
  threadId: string;
  memberId: string;
  memberName: string;
  category: string;
  topic: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  openedAt: number;
  lastAt: number;
  lastBy: 'member' | 'staff';
  warnedAt: number | null;
  closedBy: string | null;
  closeReason: string | null;
};
const toTicket = (r: Row): TicketRow => ({
  guildId: r.guild_id as string,
  number: r.number as number,
  threadId: r.thread_id as string,
  memberId: r.member_id as string,
  memberName: r.member_name as string,
  category: r.category as string,
  topic: r.topic as string,
  status: r.status as TicketStatus,
  priority: r.priority as TicketPriority,
  assigneeId: (r.assignee_id as string | null) ?? null,
  assigneeName: (r.assignee_name as string | null) ?? null,
  openedAt: r.opened_at as number,
  lastAt: r.last_at as number,
  lastBy: r.last_by === 'staff' ? 'staff' : 'member',
  warnedAt: (r.warned_at as number | null) ?? null,
  closedBy: (r.closed_by as string | null) ?? null,
  closeReason: (r.close_reason as string | null) ?? null,
});

export function createTicket(
  db: Db,
  t: {
    guildId: string;
    threadId: string;
    memberId: string;
    memberName: string;
    category: string;
  },
  now: number,
) {
  const r = db
    .prepare(
      `INSERT INTO tickets (guild_id, number, thread_id, member_id, member_name,
         category, topic, opened_at, last_at)
       VALUES (?, (SELECT COALESCE(MAX(number), 0) + 1 FROM tickets WHERE guild_id = ?),
         ?, ?, ?, ?, ?, ?, ?)
       RETURNING number`,
    )
    .get(
      t.guildId,
      t.guildId,
      t.threadId,
      t.memberId,
      t.memberName,
      t.category,
      t.category,
      now,
      now,
    ) as Row;
  return r.number as number;
}

/** The next ticket number, for naming the thread before it's recorded. */
export function nextTicketNumber(db: Db, guildId: string) {
  const r = db
    .prepare(
      'SELECT COALESCE(MAX(number), 0) + 1 AS n FROM tickets WHERE guild_id = ?',
    )
    .get(guildId) as Row;
  return r.n as number;
}

export function getTicket(db: Db, guildId: string, number: number) {
  const r = db
    .prepare('SELECT * FROM tickets WHERE guild_id = ? AND number = ?')
    .get(guildId, number) as Row | undefined;
  return r ? toTicket(r) : undefined;
}

export function ticketByThread(db: Db, threadId: string) {
  const r = db
    .prepare('SELECT * FROM tickets WHERE thread_id = ?')
    .get(threadId) as Row | undefined;
  return r ? toTicket(r) : undefined;
}

export function listTickets(db: Db, guildId: string) {
  return (
    db
      .prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY number DESC')
      .all(guildId) as Row[]
  ).map(toTicket);
}

export function openTicketOf(db: Db, guildId: string, memberId: string) {
  const r = db
    .prepare(
      `SELECT * FROM tickets WHERE guild_id = ? AND member_id = ? AND status != 'closed'
       ORDER BY number DESC LIMIT 1`,
    )
    .get(guildId, memberId) as Row | undefined;
  return r ? toTicket(r) : undefined;
}

/** Tickets still open, for auto-closing. */
export function openTickets(db: Db) {
  return (
    db.prepare(`SELECT * FROM tickets WHERE status != 'closed'`).all() as Row[]
  ).map(toTicket);
}

const columns: Record<string, string> = {
  topic: 'topic',
  status: 'status',
  priority: 'priority',
  assigneeId: 'assignee_id',
  assigneeName: 'assignee_name',
  lastAt: 'last_at',
  lastBy: 'last_by',
  warnedAt: 'warned_at',
  closedBy: 'closed_by',
  closeReason: 'close_reason',
};

export function updateTicket(
  db: Db,
  guildId: string,
  number: number,
  change: Partial<
    Pick<
      TicketRow,
      | 'topic'
      | 'status'
      | 'priority'
      | 'assigneeId'
      | 'assigneeName'
      | 'lastAt'
      | 'lastBy'
      | 'warnedAt'
      | 'closedBy'
      | 'closeReason'
    >
  >,
) {
  const keys = Object.keys(change).filter((k) => k in columns);
  if (!keys.length) return;
  db.prepare(
    `UPDATE tickets SET ${keys.map((k) => `${columns[k]} = ?`).join(', ')}
     WHERE guild_id = ? AND number = ?`,
  ).run(
    ...keys.map((k) => (change as Record<string, string | number | null>)[k]!),
    guildId,
    number,
  );
}

export type StoredTicketMessage = {
  id: number;
  kind: 'opener' | 'message' | 'note';
  authorId: string | null;
  authorName: string;
  staff: boolean;
  text: string;
  file: string | null;
  at: number;
};

export function addTicketMessage(
  db: Db,
  m: {
    guildId: string;
    number: number;
    kind: StoredTicketMessage['kind'];
    authorId: string | null;
    authorName: string;
    staff: boolean;
    text: string;
    file?: string | null;
  },
  now: number,
) {
  db.prepare(
    `INSERT INTO ticket_messages (guild_id, number, kind, author_id, author_name, staff, text, file, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    m.guildId,
    m.number,
    m.kind,
    m.authorId,
    m.authorName,
    m.staff ? 1 : 0,
    m.text,
    m.file ?? null,
    now,
  );
}

export function ticketMessages(db: Db, guildId: string, number: number) {
  return (
    db
      .prepare(
        'SELECT * FROM ticket_messages WHERE guild_id = ? AND number = ? ORDER BY id',
      )
      .all(guildId, number) as Row[]
  ).map(
    (r): StoredTicketMessage => ({
      id: r.id as number,
      kind: r.kind as StoredTicketMessage['kind'],
      authorId: (r.author_id as string | null) ?? null,
      authorName: r.author_name as string,
      staff: r.staff === 1,
      text: r.text as string,
      file: (r.file as string | null) ?? null,
      at: r.at as number,
    }),
  );
}

/** People who have answered tickets as staff, for the assign menu. */
export function ticketStaff(db: Db, guildId: string) {
  return (
    db
      .prepare(
        `SELECT author_id, MAX(author_name) AS name FROM ticket_messages
         WHERE guild_id = ? AND staff = 1 AND author_id IS NOT NULL AND kind != 'opener'
         GROUP BY author_id`,
      )
      .all(guildId) as Row[]
  ).map((r) => ({ id: r.author_id as string, name: r.name as string }));
}

// Messages Sparko posted and keeps up to date (panels, Studio messages) ------

export function getPosted(db: Db, guildId: string, key: string) {
  const r = db
    .prepare('SELECT * FROM posted WHERE guild_id = ? AND key = ?')
    .get(guildId, key) as Row | undefined;
  return r
    ? { channelId: r.channel_id as string, messageId: r.message_id as string }
    : undefined;
}

export function setPosted(
  db: Db,
  guildId: string,
  key: string,
  where: { channelId: string; messageId: string } | null,
) {
  if (!where)
    db.prepare('DELETE FROM posted WHERE guild_id = ? AND key = ?').run(
      guildId,
      key,
    );
  else
    db.prepare(
      `INSERT INTO posted (guild_id, key, channel_id, message_id) VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, key) DO UPDATE SET channel_id = excluded.channel_id,
         message_id = excluded.message_id`,
    ).run(guildId, key, where.channelId, where.messageId);
}
