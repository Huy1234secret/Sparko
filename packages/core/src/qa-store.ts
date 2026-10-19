import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import { normaliseStudio, type StudioMessage } from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import { rememberPost } from './studio-actions.ts';
import { parseDuration } from './auto-roles.ts';
import {
  QA_MODULE,
  qaAnswerMax,
  qaAnswerPayload,
  qaCanAsk,
  qaCloseAt,
  qaDefaultMessage,
  qaDmPayload,
  qaLengthProblem,
  qaLimits,
  qaPayload,
  qaShorten,
  qaUpgrade,
  type QaAnswer,
  type QaFile,
  type QaLogEntry,
  type QaQuestion,
  type QaStatus,
  type Questions,
} from './questions.ts';

export * from './questions.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
const json = <T>(v: unknown, fallback: T): T => {
  try {
    return (JSON.parse(String(v)) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

export function qaConfigOf(db: Db, guildId: string) {
  const m = getModule<Questions>(db, guildId, QA_MODULE);
  return { on: m.on, config: qaUpgrade(m.config) };
}

// Saved questions -------------------------------------------------------------

const questionOf = (r: Row): QaQuestion => ({
  number: r.number as number,
  askerId: r.asker_id as string,
  askerName: r.asker_name as string,
  askerAvatar: r.asker_avatar as string,
  title: r.title as string,
  body: r.body as string,
  category: r.category as string,
  files: json<QaFile[]>(r.files, []),
  status: r.status as QaStatus,
  meToo: r.me_too as number,
  channelId: (r.channel_id as string | null) ?? null,
  messageId: (r.message_id as string | null) ?? null,
  threadId: (r.thread_id as string | null) ?? null,
  answerId: (r.answer_id as string | null) ?? null,
  answer: json<QaAnswer | null>(r.answer_json, null),
  closedBy: json<QaQuestion['closedBy']>(r.closed_json, null),
  createdAt: r.created_at as number,
  answeredAt: (r.answered_at as number | null) ?? null,
  closeAt: (r.close_at as number | null) ?? null,
  threadClosed: r.thread_closed === 1,
});

/** A question and the server it's in. */
type Stored = QaQuestion & { guildId: string };
const storedOf = (r: Row): Stored => ({
  ...questionOf(r),
  guildId: r.guild_id as string,
});

export function getQuestion(db: Db, guildId: string, number: number) {
  const r = db
    .prepare('SELECT * FROM questions WHERE guild_id = ? AND number = ?')
    .get(guildId, number) as Row | undefined;
  return r ? storedOf(r) : null;
}

/** The question a posted message belongs to. */
export function questionByMessage(db: Db, messageId: string) {
  const r = db
    .prepare('SELECT * FROM questions WHERE message_id = ?')
    .get(messageId) as Row | undefined;
  return r ? storedOf(r) : null;
}

function save(db: Db, q: Stored) {
  db.prepare(
    `UPDATE questions SET status = ?, me_too = ?, channel_id = ?, message_id = ?,
       thread_id = ?, answer_id = ?, answer_json = ?, closed_json = ?,
       answered_at = ?, close_at = ?, thread_closed = ?
     WHERE guild_id = ? AND number = ?`,
  ).run(
    q.status,
    q.meToo,
    q.channelId,
    q.messageId,
    q.threadId,
    q.answerId,
    q.answer ? JSON.stringify(q.answer) : null,
    q.closedBy ? JSON.stringify(q.closedBy) : null,
    q.answeredAt,
    q.closeAt,
    q.threadClosed ? 1 : 0,
    q.guildId,
    q.number,
  );
}

/** Questions for Storage, newest first, matching what staff typed. */
export function listQuestions(
  db: Db,
  guildId: string,
  { query = '', status = '', limit = 200 } = {},
) {
  const q = query.trim();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const n = /^#?\d{1,9}$/.test(q) ? Number(q.replace('#', '')) : -1;
  return (
    db
      .prepare(
        `SELECT * FROM questions WHERE guild_id = ?
           AND (? = '' OR number = ? OR asker_id = ? OR asker_name LIKE ? ESCAPE '\\'
                OR title LIKE ? ESCAPE '\\')
           AND (? = '' OR status = ?)
         ORDER BY number DESC LIMIT ?`,
      )
      .all(guildId, q, n, q, like, like, status, status, limit) as Row[]
  ).map(questionOf);
}

/**
 * Questions for a command's autocomplete, matching a typed number or
 * title, in some statuses. Open ones come first.
 */
export function qaSearch(
  db: Db,
  guildId: string,
  typed: string,
  statuses: QaStatus[],
  limit = 25,
) {
  const t = typed.trim().replace(/^#/, '');
  const like = `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const marks = statuses.map(() => '?').join(', ');
  return (
    db
      .prepare(
        `SELECT * FROM questions WHERE guild_id = ? AND status IN (${marks})
           AND (? = '' OR CAST(number AS TEXT) LIKE ? OR title LIKE ? ESCAPE '\\')
         ORDER BY status = 'open' DESC, number DESC LIMIT ?`,
      )
      .all(guildId, ...statuses, t, `${t}%`, like, limit) as Row[]
  ).map(questionOf);
}

/** How much of the server's storage questions use. */
export function qaStorage(db: Db, guildId: string) {
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM questions WHERE guild_id = ?')
    .get(guildId) as { n: number };
  const limits = qaLimits(getGuild(db, guildId)?.plan);
  return {
    count: n,
    limit: limits.questions,
    perKb: limits.perKb,
    usedKb: n * limits.perKb,
    limitMb: limits.storageMb,
  };
}

// The log ---------------------------------------------------------------------

export function addQaLog(db: Db, guildId: string, e: Omit<QaLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO qa_log (guild_id, action, number, user_id, user_name, detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    e.action,
    e.number,
    e.userId,
    e.userName,
    e.detail.slice(0, 300),
    e.at,
  );
  db.prepare(
    `DELETE FROM qa_log WHERE guild_id = ? AND id <= (
       SELECT id FROM qa_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listQaLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM qa_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): QaLogEntry => ({
      id: String(r.id),
      action: r.action as QaLogEntry['action'],
      number: (r.number as number | null) ?? null,
      userId: r.user_id as string,
      userName: r.user_name as string,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
}

// Posting ---------------------------------------------------------------------

const gone = (e: unknown) =>
  e instanceof DiscordError &&
  (e.code === DiscordCodes.unknownMessage ||
    e.code === DiscordCodes.unknownChannel);

function plain(e: unknown): never {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    throw new Plain(
      'Sparko can’t post in the questions channel. Give it View Channel, Send Messages, Embed Links, Create Public Threads, Send Messages in Threads and Manage Threads there.',
    );
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    throw new Plain('That channel no longer exists. Pick another one.');
  if (e instanceof DiscordError && e.status === 400)
    throw new Plain(`Discord didn’t accept the message: ${e.message}`);
  throw e;
}

const templateOf = (db: Db, guildId: string, id: string) => {
  const t = id
    ? getTemplate<StudioMessage>(db, guildId, 'studio', id)
    : undefined;
  return t ? normaliseStudio(t.message) : null;
};

/** The question message: the server's template, or Sparko's own. */
export const qaMessage = (db: Db, guildId: string, c: Questions) =>
  templateOf(db, guildId, c.message) ?? normaliseStudio(qaDefaultMessage());

const serverOf = (db: Db, guildId: string) => serverVars(getGuild(db, guildId));

const lockThread = (rest: Rest, threadId: string) =>
  rest
    .patch(`/channels/${threadId}`, { archived: true, locked: true })
    .then(() => true)
    .catch(() => false);
const openThread = (rest: Rest, threadId: string) =>
  rest
    .patch(`/channels/${threadId}`, { archived: false, locked: false })
    .then(() => true)
    .catch(() => false);

/**
 * Puts a question in its channel: posts it and opens its thread, or edits
 * the message already there. A message deleted in Discord isn't posted
 * again; the bot marks the question deleted.
 */
export async function qaPost(
  rest: Rest,
  db: Db,
  q: Stored,
  now = Date.now(),
): Promise<Stored> {
  const { config: c } = qaConfigOf(db, q.guildId);
  const message = qaMessage(db, q.guildId, c);
  const main = qaPayload(c, message, q, {
    now,
    server: serverOf(db, q.guildId),
    channel: q.channelId ?? c.channel,
  });
  // So the template's own buttons and menus work on the posted message.
  const remember = (messageId: string) =>
    rememberPost(db, q.guildId, messageId, message, now);
  if (q.messageId && q.channelId) {
    try {
      await rest.patch(
        `/channels/${q.channelId}/messages/${q.messageId}`,
        main,
      );
      remember(q.messageId);
    } catch (e) {
      if (!gone(e)) throw e;
    }
    return q;
  }
  let next: Stored = { ...q };
  try {
    const channel = c.channel;
    const sent = await rest.post<{ id: string }>(
      `/channels/${channel}/messages`,
      main,
    );
    next = { ...next, channelId: channel, messageId: sent.id };
    remember(sent.id);
    const thread = await rest
      .post<{ id: string }>(
        `/channels/${channel}/messages/${sent.id}/threads`,
        {
          name: `#${q.number} ${q.title}`.slice(0, 100),
          auto_archive_duration: c.archive,
        },
      )
      .catch(() => null);
    if (thread) {
      next.threadId = thread.id;
      // The asker follows the thread, so they see the answer. Anonymous
      // askers aren't added, as that would show who asked.
      if (!c.anonymous)
        await rest
          .put(`/channels/${thread.id}/thread-members/${q.askerId}`, {})
          .catch(() => {});
      // A message that mentions its thread is filled in now it exists.
      if (JSON.stringify(message).includes('{thread}'))
        await rest
          .patch(
            `/channels/${channel}/messages/${sent.id}`,
            qaPayload(c, message, next, {
              now,
              server: serverOf(db, q.guildId),
              channel,
            }),
          )
          .catch(() => {});
    }
    save(db, next);
    return next;
  } catch (e) {
    plain(e);
  }
}

/** Shows a question's latest status, answer and Me too count in its message. */
export async function qaRefresh(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  now = Date.now(),
) {
  const q = getQuestion(db, guildId, number);
  if (!q || !q.messageId) return q;
  return qaPost(rest, db, q, now);
}

// Asking ----------------------------------------------------------------------

export type QaAsker = {
  id: string;
  name: string;
  avatar: string;
  roles: string[];
};

/** A member's open questions, and when they last asked. */
export function qaAskerFacts(db: Db, guildId: string, userId: string) {
  const r = db
    .prepare(
      `SELECT COUNT(*) FILTER (WHERE status = 'open') AS open, MAX(created_at) AS last
         FROM questions WHERE guild_id = ? AND asker_id = ?`,
    )
    .get(guildId, userId) as { open: number; last: number | null };
  return { open: r.open, lastAt: r.last };
}

/**
 * A member asked something: checks they may, then posts it with its
 * thread. Returns the problem in plain words when it can't be posted.
 */
export async function qaSubmit(
  rest: Rest,
  db: Db,
  input: {
    guildId: string;
    asker: QaAsker;
    title: string;
    body: string;
    /** A category's id, or '' for none. */
    category: string;
    files: QaFile[];
  },
  now = Date.now(),
): Promise<
  | { ok: true; number: number; link: string; threadId: string | null }
  | { ok: false; problem: string }
> {
  const { guildId, asker } = input;
  const { on, config: c } = qaConfigOf(db, guildId);
  const refuse = (problem: string) => {
    addQaLog(db, guildId, {
      action: 'refused',
      number: null,
      userId: asker.id,
      userName: asker.name,
      detail: problem.replace(/<t:\d+:R>/, 'later'),
      at: now,
    });
    return { ok: false as const, problem };
  };
  if (!on || !c.channel)
    return { ok: false, problem: 'Questions are turned off in this server.' };
  const why = qaCanAsk(
    c,
    { roles: new Set(asker.roles), ...qaAskerFacts(db, guildId, asker.id) },
    now,
  );
  if (why) return refuse(why);
  const title = input.title.trim().slice(0, 100);
  if (title.length < 3) return refuse('Give your question a longer title.');
  const body = input.body.trim();
  const long = qaLengthProblem(c, body);
  if (long) return refuse(long);
  const category = c.categories.some((x) => x.id === input.category)
    ? input.category
    : '';
  const storage = qaStorage(db, guildId);
  if (storage.count >= storage.limit)
    return refuse(
      'This server’s question storage is full. Ask staff to delete old questions.',
    );

  const { n } = db
    .prepare(
      'SELECT COALESCE(MAX(number), 0) + 1 AS n FROM questions WHERE guild_id = ?',
    )
    .get(guildId) as { n: number };
  db.prepare(
    `INSERT INTO questions (guild_id, number, asker_id, asker_name, asker_avatar,
       title, body, category, files, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  ).run(
    guildId,
    n,
    asker.id,
    asker.name,
    asker.avatar,
    title,
    body,
    category,
    JSON.stringify(input.files.slice(0, 3)),
    now,
  );
  try {
    const posted = await qaPost(rest, db, getQuestion(db, guildId, n)!, now);
    addQaLog(db, guildId, {
      action: 'asked',
      number: n,
      userId: asker.id,
      userName: asker.name,
      detail: title,
      at: now,
    });
    return {
      ok: true,
      number: n,
      link: `https://discord.com/channels/${guildId}/${posted.channelId}/${posted.messageId}`,
      threadId: posted.threadId,
    };
  } catch (e) {
    // Nothing was posted, so nothing is kept.
    db.prepare('DELETE FROM questions WHERE guild_id = ? AND number = ?').run(
      guildId,
      n,
    );
    addQaLog(db, guildId, {
      action: 'failed',
      number: n,
      userId: asker.id,
      userName: asker.name,
      detail: e instanceof Error ? e.message : 'Couldn’t post it.',
      at: now,
    });
    return {
      ok: false,
      problem:
        e instanceof Plain
          ? e.message
          : 'Sparko couldn’t post your question. Ask staff to check its permissions.',
    };
  }
}

// Answering and closing -------------------------------------------------------

export type QaStaff = { id: string; name: string; avatar: string };

/** Sends a direct message; people who don't take DMs simply don't get it. */
async function dm(rest: Rest, userId: string, body: object) {
  try {
    const channel = await rest.post<{ id: string }>('/users/@me/channels', {
      recipient_id: userId,
    });
    await rest.post(`/channels/${channel.id}/messages`, body);
    return true;
  } catch {
    return false;
  }
}

const must = (db: Db, guildId: string, number: number) => {
  const q = getQuestion(db, guildId, number);
  if (!q) throw new Plain(`There’s no question #${number}.`);
  if (q.status === 'deleted')
    throw new Plain(
      `Question #${number}’s message was deleted in Discord, so it can’t be changed. Delete it from the dashboard instead.`,
    );
  return q;
};

/** Locks and archives the thread now when the settings say so. */
async function closeIfDue(rest: Rest, db: Db, q: Stored, now: number) {
  if (q.closeAt === null || q.closeAt > now || q.threadClosed) return q;
  const next = { ...q, threadClosed: true };
  if (q.threadId) await lockThread(rest, q.threadId);
  save(db, next);
  return next;
}

/**
 * Staff answered a question: the answer goes in its thread (replacing an
 * earlier answer there), the question shows it, the asker gets a DM if
 * that's on, and the thread closes as the settings say.
 */
export async function qaAnswer(
  rest: Rest,
  db: Db,
  input: { guildId: string; number: number; text: string; staff: QaStaff },
  now = Date.now(),
) {
  const { guildId, number, staff } = input;
  const { config: c } = qaConfigOf(db, guildId);
  const q = must(db, guildId, number);
  const text = input.text.trim().slice(0, qaAnswerMax);
  if (text.length < 2) throw new Plain('Write an answer first.');
  const again = !!q.answer;
  let next: Stored = {
    ...q,
    status: 'answered',
    answer: {
      text,
      byId: staff.id,
      byName: staff.name,
      byAvatar: staff.avatar,
      at: now,
    },
    closedBy: null,
    answeredAt: now,
    closeAt: qaCloseAt(c, now),
  };
  const problems: string[] = [];
  const ctx = { now, server: serverOf(db, guildId) };
  if (q.threadId) {
    // A closed thread opens again for the answer, then closes as set.
    if (q.threadClosed) {
      await openThread(rest, q.threadId);
      next.threadClosed = false;
    }
    const body = qaAnswerPayload(
      c,
      templateOf(db, guildId, c.answerMessage),
      next,
      { ...ctx, channel: q.threadId },
    );
    let posted = false;
    if (q.answerId)
      posted = await rest
        .patch(`/channels/${q.threadId}/messages/${q.answerId}`, body)
        .then(() => true)
        .catch(() => false);
    if (!posted) {
      const sent = await rest
        .post<{ id: string }>(`/channels/${q.threadId}/messages`, body)
        .catch(() => null);
      if (sent) next.answerId = sent.id;
      else problems.push('Sparko couldn’t post the answer in the thread');
    }
  }
  save(db, next);
  await qaRefresh(rest, db, guildId, number, now).catch(() => {});
  if (c.dm) {
    const sent = await dm(
      rest,
      next.askerId,
      qaDmPayload(c, templateOf(db, guildId, c.dmMessage), next, ctx),
    );
    if (!sent) problems.push('the asker doesn’t accept DMs');
  }
  next = await closeIfDue(rest, db, next, now);
  addQaLog(db, guildId, {
    action: again ? 'reanswered' : 'answered',
    number,
    userId: staff.id,
    userName: staff.name,
    detail: `${qaShorten(text, 200)}${problems.length ? ` (${problems.join(', ')})` : ''}`,
    at: now,
  });
  return { question: next, again, problems };
}

/** The asker or staff said it's answered, without writing an answer. */
export async function qaMarkAnswered(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const { config: c } = qaConfigOf(db, guildId);
  const q = must(db, guildId, number);
  if (q.status !== 'open')
    throw new Plain(`Question #${number} isn’t open any more.`);
  let next: Stored = {
    ...q,
    status: 'closed',
    closedBy: { id: by.id, name: by.name },
    answeredAt: now,
    closeAt: qaCloseAt(c, now),
  };
  save(db, next);
  await qaRefresh(rest, db, guildId, number, now).catch(() => {});
  next = await closeIfDue(rest, db, next, now);
  addQaLog(db, guildId, {
    action: 'marked',
    number,
    userId: by.id,
    userName: by.name,
    detail: '',
    at: now,
  });
  return next;
}

/**
 * Staff closed a question: an open one is closed without an answer, and
 * the thread is locked straight away either way.
 */
export async function qaClose(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const q = must(db, guildId, number);
  if (q.status !== 'open' && (q.threadClosed || !q.threadId))
    throw new Plain(`Question #${number} is already closed.`);
  const next: Stored = {
    ...q,
    status: q.status === 'open' ? 'closed' : q.status,
    closedBy: q.status === 'open' ? { id: by.id, name: by.name } : q.closedBy,
    answeredAt: q.answeredAt ?? now,
    closeAt: now,
    threadClosed: true,
  };
  save(db, next);
  await qaRefresh(rest, db, guildId, number, now).catch(() => {});
  if (q.threadId) await lockThread(rest, q.threadId);
  addQaLog(db, guildId, {
    action: 'closed',
    number,
    userId: by.id,
    userName: by.name,
    detail: q.status === 'open' ? 'without an answer' : 'the thread',
    at: now,
  });
  return next;
}

/** Staff reopened a question, so it can be answered again. */
export async function qaReopen(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const q = must(db, guildId, number);
  if (q.status === 'open') throw new Plain(`Question #${number} is open.`);
  const next: Stored = {
    ...q,
    status: 'open',
    // The log keeps the old answer; the question no longer shows it.
    answer: null,
    closedBy: null,
    answeredAt: null,
    closeAt: null,
    threadClosed: false,
  };
  save(db, next);
  if (q.threadId && q.threadClosed) await openThread(rest, q.threadId);
  await qaRefresh(rest, db, guildId, number, now).catch(() => {});
  addQaLog(db, guildId, {
    action: 'reopened',
    number,
    userId: by.id,
    userName: by.name,
    detail: '',
    at: now,
  });
  return next;
}

// Me too ----------------------------------------------------------------------

/** Someone pressed Me too: it counts them, or takes them off again. */
export function qaMeToo(
  db: Db,
  guildId: string,
  number: number,
  userId: string,
): { ok: false; problem: string } | { ok: true; on: boolean; count: number } {
  const { on, config: c } = qaConfigOf(db, guildId);
  const q = getQuestion(db, guildId, number);
  if (!on || !q || q.status === 'deleted')
    return { ok: false, problem: 'This question is gone.' };
  if (!c.meToo) return { ok: false, problem: 'Me too is turned off here.' };
  if (q.status !== 'open')
    return { ok: false, problem: 'This question isn’t open any more.' };
  if (q.askerId === userId)
    return { ok: false, problem: 'It’s your own question.' };
  const had = db
    .prepare(
      'SELECT 1 FROM qa_metoo WHERE guild_id = ? AND number = ? AND user_id = ?',
    )
    .get(guildId, number, userId);
  if (had)
    db.prepare(
      'DELETE FROM qa_metoo WHERE guild_id = ? AND number = ? AND user_id = ?',
    ).run(guildId, number, userId);
  else
    db.prepare(
      'INSERT INTO qa_metoo (guild_id, number, user_id) VALUES (?, ?, ?)',
    ).run(guildId, number, userId);
  const { count } = db
    .prepare(
      'SELECT COUNT(*) AS count FROM qa_metoo WHERE guild_id = ? AND number = ?',
    )
    .get(guildId, number) as { count: number };
  save(db, { ...q, meToo: count });
  return { ok: true, on: !had, count };
}

// Deleting --------------------------------------------------------------------

/** Where a deleted question's message and thread were, for taking them down. */
export type QaLeftovers = {
  channelId: string | null;
  messageId: string | null;
  threadId: string | null;
};

/** Forgets a question and its Me toos; returns where its message is. */
export function qaForget(
  db: Db,
  guildId: string,
  number: number,
  by: { id: string; name: string },
  now = Date.now(),
): QaLeftovers | null {
  const q = getQuestion(db, guildId, number);
  if (!q) return null;
  db.prepare('DELETE FROM questions WHERE guild_id = ? AND number = ?').run(
    guildId,
    number,
  );
  db.prepare('DELETE FROM qa_metoo WHERE guild_id = ? AND number = ?').run(
    guildId,
    number,
  );
  addQaLog(db, guildId, {
    action: 'deleted',
    number,
    userId: by.id,
    userName: by.name,
    detail: q.title,
    at: now,
  });
  return {
    channelId: q.channelId,
    messageId: q.messageId,
    threadId: q.threadId,
  };
}

/** Takes a deleted question's message and thread out of Discord. */
export async function qaRemoveMessages(rest: Rest, left: QaLeftovers) {
  if (left.channelId && left.messageId)
    await rest
      .delete(`/channels/${left.channelId}/messages/${left.messageId}`)
      .catch(() => {});
  if (left.threadId)
    await rest.delete(`/channels/${left.threadId}`).catch(() => {});
}

/** Staff deleted a question: its message, thread and data go. */
export async function qaDelete(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const left = qaForget(db, guildId, number, by, now);
  if (!left) return false;
  await qaRemoveMessages(rest, left);
  return true;
}

/**
 * A question's message was deleted in Discord: the question is marked
 * deleted and its thread is locked. Staff still see it in Storage.
 */
export async function qaMessageDeleted(
  rest: Rest,
  db: Db,
  messageId: string,
  now = Date.now(),
) {
  const q = questionByMessage(db, messageId);
  if (!q) return null;
  const next: Stored = {
    ...q,
    status: 'deleted',
    messageId: null,
    closeAt: null,
    threadClosed: !!q.threadId || q.threadClosed,
  };
  save(db, next);
  if (q.threadId && !q.threadClosed) await lockThread(rest, q.threadId);
  addQaLog(db, q.guildId, {
    action: 'deleted',
    number: q.number,
    userId: '0',
    userName: 'someone',
    detail: 'its message was deleted in Discord',
    at: now,
  });
  return next;
}

// Closing on time -------------------------------------------------------------

/**
 * Closes the threads of answered questions once their time is up, and
 * expires questions left unanswered too long. The bot runs it every minute.
 */
export async function qaSweep(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
) {
  const { on, config: c } = qaConfigOf(db, guildId);
  if (!on) return 0;
  const due = (
    db
      .prepare(
        `SELECT * FROM questions WHERE guild_id = ? AND thread_closed = 0
           AND close_at IS NOT NULL AND close_at <= ? AND status != 'open'`,
      )
      .all(guildId, now) as Row[]
  ).map(storedOf);
  for (const q of due) {
    save(db, { ...q, threadClosed: true });
    if (!q.threadId) continue;
    await lockThread(rest, q.threadId);
    addQaLog(db, guildId, {
      action: 'closed',
      number: q.number,
      userId: '0',
      userName: 'Sparko',
      detail: 'the thread, on time',
      at: now,
    });
  }
  const ms = parseDuration(c.expire);
  let expired: Stored[] = [];
  if (ms) {
    expired = (
      db
        .prepare(
          `SELECT * FROM questions WHERE guild_id = ? AND status = 'open' AND created_at <= ?`,
        )
        .all(guildId, now - ms) as Row[]
    ).map(storedOf);
    for (const q of expired) {
      save(db, {
        ...q,
        status: 'expired',
        closeAt: now,
        threadClosed: true,
      });
      await qaRefresh(rest, db, guildId, q.number, now).catch(() => {});
      if (q.threadId && !q.threadClosed) await lockThread(rest, q.threadId);
      addQaLog(db, guildId, {
        action: 'expired',
        number: q.number,
        userId: '0',
        userName: 'Sparko',
        detail: `${c.expire} passed`,
        at: now,
      });
    }
  }
  return due.length + expired.length;
}

/** Guilds with questions on, for the sweep. */
export function qaGuilds(db: Db) {
  return (
    db
      .prepare(
        'SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1',
      )
      .all(QA_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// Testing the messages --------------------------------------------------------

/** A made-up question, to show what the messages look like. */
export const qaSample = (
  by: QaAsker | QaStaff,
  answered = false,
): QaQuestion => ({
  number: 1,
  askerId: by.id,
  askerName: by.name,
  askerAvatar: by.avatar,
  title: 'How do I get the Artist role?',
  body: 'I’ve posted a few drawings in #art-share. Is there something else I need to do to get the role?',
  category: '',
  files: [],
  status: answered ? 'answered' : 'open',
  meToo: 4,
  channelId: null,
  messageId: null,
  threadId: null,
  answerId: null,
  answer: answered
    ? {
        text: 'Share three pieces in #art-share, then ask in #support. A moderator gives the role within a day.',
        byId: by.id,
        byName: by.name,
        byAvatar: by.avatar,
        at: Date.now(),
      }
    : null,
  closedBy: null,
  createdAt: Date.now(),
  answeredAt: answered ? Date.now() : null,
  closeAt: null,
  threadClosed: false,
});

/** Posts a sample question or answer in a channel, so staff can see it. */
export async function qaTestPost(
  rest: Rest,
  db: Db,
  guildId: string,
  channel: string,
  by: QaStaff,
  which: 'question' | 'answer' = 'question',
  now = Date.now(),
) {
  const { config } = qaConfigOf(db, guildId);
  // A test never pings anyone.
  const c = { ...config, ping: '' };
  const ctx = { now, server: serverOf(db, guildId), channel };
  const main =
    which === 'answer'
      ? qaAnswerPayload(
          c,
          templateOf(db, guildId, c.answerMessage),
          qaSample(by, true),
          ctx,
        )
      : qaPayload(c, qaMessage(db, guildId, c), qaSample(by), ctx, {
          buttons: false,
        });
  const note = `-# This is a test of the ${which} message.${which === 'question' ? ' The Answer, Mark answered and Me too buttons go under real questions.' : ''}`;
  try {
    const body = main.flags
      ? {
          ...main,
          components: [
            { type: 10, content: note },
            ...(main.components as object[]),
          ],
        }
      : { ...main, content: note };
    await rest.post(`/channels/${channel}/messages`, body);
  } catch (e) {
    plain(e);
  }
}
