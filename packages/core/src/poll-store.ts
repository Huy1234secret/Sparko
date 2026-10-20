import { parseDuration } from './auto-roles.ts';
import { transaction, type Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import {
  POLL_MODULE,
  cleanDraft,
  pollCanVote,
  pollDefaultMessage,
  pollDefaultResults,
  pollDraftIssue,
  pollPayload,
  pollResults,
  pollRowsIssue,
  pollUpgrade,
  type Poll,
  type PollDraft,
  type PollEndWhy,
  type PollLogEntry,
  type PollOption,
  type PollRules,
  type PollVoter,
  type Polls,
} from './polls.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import { rememberPost } from './studio-actions.ts';
import { normaliseStudio, type StudioMessage } from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';

export * from './polls.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
const json = <T>(v: unknown, fallback: T): T => {
  try {
    return (JSON.parse(String(v)) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

export function pollConfigOf(db: Db, guildId: string) {
  const m = getModule<Polls>(db, guildId, POLL_MODULE);
  return { on: m.on, config: pollUpgrade(m.config) };
}

// Saved polls -----------------------------------------------------------------

/** A poll and what only the store needs. */
type Stored = Poll & {
  guildId: string;
  authorAvatar: string;
  /** How long it runs once posted, for polls set to end "after" a while. */
  lengthMs: number | null;
};

function countsOf(db: Db, guildId: string, id: number) {
  const rows = db
    .prepare(
      `SELECT option_id, COUNT(*) AS n FROM poll_votes
         WHERE guild_id = ? AND poll_id = ? GROUP BY option_id`,
    )
    .all(guildId, id) as { option_id: string; n: number }[];
  const { voters } = db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS voters FROM poll_votes
         WHERE guild_id = ? AND poll_id = ?`,
    )
    .get(guildId, id) as { voters: number };
  return {
    counts: Object.fromEntries(rows.map((r) => [r.option_id, r.n])),
    voters,
  };
}

const storedOf = (db: Db, r: Row): Stored => ({
  id: r.id as number,
  guildId: r.guild_id as string,
  question: r.question as string,
  options: json<PollOption[]>(r.options, []),
  rules: json<PollRules>(r.rules, {} as PollRules),
  channelId: r.channel_id as string,
  messageId: (r.message_id as string | null) ?? null,
  status: r.status as Poll['status'],
  postAt: r.post_at as number,
  endsAt: (r.ends_at as number | null) ?? null,
  endedAt: (r.ended_at as number | null) ?? null,
  endedWhy: (r.ended_why as PollEndWhy | null) ?? null,
  endedBy: r.ended_by as string,
  picked: (r.picked as string | null) ?? null,
  authorId: r.author_id as string,
  authorName: r.author_name as string,
  authorAvatar: r.author_avatar as string,
  lengthMs: (r.length_ms as number | null) ?? null,
  createdAt: r.created_at as number,
  ...countsOf(db, r.guild_id as string, r.id as number),
});

/** What the dashboard and commands see of a poll. */
const shown = ({ guildId, authorAvatar, lengthMs, ...p }: Stored): Poll => {
  void guildId;
  void authorAvatar;
  void lengthMs;
  return p;
};

export function getPoll(db: Db, guildId: string, id: number) {
  const r = db
    .prepare('SELECT * FROM polls WHERE guild_id = ? AND id = ?')
    .get(guildId, id) as Row | undefined;
  return r ? storedOf(db, r) : null;
}

/** The poll a message belongs to. */
export function pollByMessage(db: Db, messageId: string) {
  const r = db
    .prepare('SELECT * FROM polls WHERE message_id = ?')
    .get(messageId) as Row | undefined;
  return r ? storedOf(db, r) : null;
}

/** Polls for the dashboard: running first, then waiting, then ended. */
export function listPolls(db: Db, guildId: string, limit = 100): Poll[] {
  return (
    db
      .prepare(
        `SELECT * FROM polls WHERE guild_id = ?
           ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
                    id DESC
           LIMIT ?`,
      )
      .all(guildId, limit) as Row[]
  ).map((r) => shown(storedOf(db, r)));
}

/** Recent polls matching what someone typed, for command autocomplete. */
export function findPolls(
  db: Db,
  guildId: string,
  typed: string,
  statuses: Poll['status'][] = ['active', 'ended'],
) {
  const q = typed.trim();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return (
    db
      .prepare(
        `SELECT id, question, status FROM polls WHERE guild_id = ?
           AND status IN (${statuses.map(() => '?').join(', ')})
           AND (? = '' OR CAST(id AS TEXT) LIKE ? OR question LIKE ? ESCAPE '\\')
         ORDER BY id DESC LIMIT 25`,
      )
      .all(guildId, ...statuses, q, `${q}%`, like) as Row[]
  ).map((r) => ({
    id: r.id as number,
    question: r.question as string,
    status: r.status as Poll['status'],
  }));
}

/** Polls posted or waiting to be, which count toward the plan's limit. */
export function pollsOpen(db: Db, guildId: string) {
  const { n } = db
    .prepare(
      "SELECT COUNT(*) AS n FROM polls WHERE guild_id = ? AND status != 'ended'",
    )
    .get(guildId) as { n: number };
  return n;
}

/** Who voted for what, earliest first. */
export function pollVoters(db: Db, guildId: string, id: number): PollVoter[] {
  const p = getPoll(db, guildId, id);
  if (!p) return [];
  const order = new Map(p.options.map((o, i) => [o.id, i]));
  const by = new Map<string, PollVoter>();
  for (const r of db
    .prepare(
      `SELECT user_id, user_name, option_id, at FROM poll_votes
         WHERE guild_id = ? AND poll_id = ? ORDER BY at, rowid`,
    )
    .all(guildId, id) as Row[]) {
    const userId = r.user_id as string;
    const v = by.get(userId) ?? {
      userId,
      userName: r.user_name as string,
      picks: [],
      at: r.at as number,
    };
    v.picks.push(r.option_id as string);
    v.at = Math.max(v.at, r.at as number);
    by.set(userId, v);
  }
  return [...by.values()].map((v) => ({
    ...v,
    picks: v.picks.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
  }));
}

/** One member's picks on a poll, in the options' order. */
export function pollPicksOf(db: Db, p: Stored, userId: string) {
  const order = new Map(p.options.map((o, i) => [o.id, i]));
  return (
    db
      .prepare(
        'SELECT option_id FROM poll_votes WHERE guild_id = ? AND poll_id = ? AND user_id = ?',
      )
      .all(p.guildId, p.id, userId) as { option_id: string }[]
  )
    .map((r) => r.option_id)
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

// The log ---------------------------------------------------------------------

export function addPollLog(
  db: Db,
  guildId: string,
  e: Omit<PollLogEntry, 'id'>,
) {
  db.prepare(
    `INSERT INTO poll_log (guild_id, action, poll, user_id, user_name, detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    e.action,
    e.poll,
    e.userId,
    e.userName,
    e.detail.slice(0, 300),
    e.at,
  );
  db.prepare(
    `DELETE FROM poll_log WHERE guild_id = ? AND id <= (
       SELECT id FROM poll_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listPollLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM poll_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): PollLogEntry => ({
      id: String(r.id),
      action: r.action as PollLogEntry['action'],
      poll: (r.poll as number | null) ?? null,
      userId: r.user_id as string,
      userName: r.user_name as string,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
}

// Making a poll ---------------------------------------------------------------

/** The poll or results message: the server's template, or Sparko's own. */
export function pollMessage(
  db: Db,
  guildId: string,
  c: Polls,
  kind: 'poll' | 'results',
) {
  const id = kind === 'poll' ? c.message : c.results;
  const t = id
    ? getTemplate<StudioMessage>(db, guildId, 'studio', id)
    : undefined;
  return normaliseStudio(
    t?.message ??
      (kind === 'poll' ? pollDefaultMessage() : pollDefaultResults()),
  );
}

export type PollAuthor = { id: string; name: string; avatar: string };

/**
 * Saves a new poll, waiting to be posted (now, or at its time). Checks it
 * first; returns the problem in plain words when it can't be made.
 */
export function pollCreate(
  db: Db,
  input: {
    guildId: string;
    draft: unknown;
    author: PollAuthor;
    /** The server's roles and channels Sparko can post in, when known. */
    roles?: Set<string>;
    channels?: Set<string>;
  },
  now = Date.now(),
): { ok: true; poll: Poll } | { ok: false; problem: string; at: string } {
  const { guildId, author } = input;
  const { on, config: c } = pollConfigOf(db, guildId);
  if (!on) return { ok: false, at: '', problem: 'Polls are turned off here.' };
  const issue = pollDraftIssue(input.draft, {
    plan: getGuild(db, guildId)?.plan,
    now,
    active: pollsOpen(db, guildId),
    ...(input.roles ? { roles: input.roles } : {}),
    ...(input.channels ? { channels: input.channels } : {}),
  });
  if (issue) return { ok: false, ...issue };
  const d = cleanDraft(input.draft as PollDraft);
  for (const kind of ['poll', 'results'] as const) {
    const rows = pollRowsIssue(
      pollMessage(db, guildId, c, kind),
      d.rules.style,
      d.options.length,
    );
    if (rows) return { ok: false, ...rows };
  }
  const postAt = Math.max(now, d.postAt ?? now);
  const lengthMs =
    d.end.kind === 'after' ? parseDuration(d.end.duration) : null;
  const endsAt =
    d.end.kind === 'at' ? d.end.at : lengthMs ? postAt + lengthMs : null;
  const id = transaction(db, () => {
    const { n } = db
      .prepare(
        // Numbers of deleted polls stay used, so the log never mixes two up.
        `SELECT MAX(
           (SELECT COALESCE(MAX(id), 0) FROM polls WHERE guild_id = ?),
           (SELECT COALESCE(MAX(poll), 0) FROM poll_log WHERE guild_id = ?)
         ) + 1 AS n`,
      )
      .get(guildId, guildId) as { n: number };
    db.prepare(
      `INSERT INTO polls (guild_id, id, question, options, rules, channel_id, status,
         post_at, ends_at, length_ms, author_id, author_name, author_avatar, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      guildId,
      n,
      d.question,
      JSON.stringify(d.options),
      JSON.stringify(d.rules),
      d.channel,
      postAt,
      endsAt,
      lengthMs,
      author.id,
      author.name,
      author.avatar,
      now,
    );
    return n;
  });
  addPollLog(db, guildId, {
    action: 'created',
    poll: id,
    userId: author.id,
    userName: author.name,
    detail:
      postAt > now + 60_000
        ? `${d.question} (posts <t:${Math.floor(postAt / 1000)}:f>)`
        : d.question,
    at: now,
  });
  return { ok: true, poll: shown(getPoll(db, guildId, id)!) };
}

// Posting ---------------------------------------------------------------------

const ignoreGone = (e: unknown) => {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.unknownMessage ||
      e.code === DiscordCodes.unknownChannel)
  )
    return;
  throw e;
};

function plain(e: unknown): never {
  if (e instanceof Plain) throw e;
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    throw new Plain(
      'Sparko can’t post in that channel. Give it View Channel, Send Messages and Embed Links there.',
    );
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    throw new Plain('That channel no longer exists. Pick another one.');
  if (e instanceof DiscordError && e.status === 400)
    throw new Plain(`Discord didn’t accept the message: ${e.message}`);
  throw e;
}

const serverOf = (db: Db, guildId: string) => serverVars(getGuild(db, guildId));

function bodyOf(db: Db, p: Stored, now: number, post = false) {
  const { config: c } = pollConfigOf(db, p.guildId);
  const message = pollMessage(
    db,
    p.guildId,
    c,
    p.status === 'ended' ? 'results' : 'poll',
  );
  return {
    message,
    payload: pollPayload(message, shown(p), {
      now,
      post,
      avatar: p.authorAvatar,
      server: serverOf(db, p.guildId),
      channel: p.channelId,
    }),
  };
}

/** Takes a poll out completely: its row and its votes. */
function forget(db: Db, guildId: string, id: number) {
  db.prepare('DELETE FROM polls WHERE guild_id = ? AND id = ?').run(
    guildId,
    id,
  );
  db.prepare('DELETE FROM poll_votes WHERE guild_id = ? AND poll_id = ?').run(
    guildId,
    id,
  );
}

/**
 * Posts a poll that's waiting, once (a job and the minute sweep can both
 * try). A poll Discord refuses is removed and logged, and the problem is
 * thrown in plain words.
 */
export async function pollPost(
  rest: Rest,
  db: Db,
  guildId: string,
  id: number,
  now = Date.now(),
) {
  const claimed = db
    .prepare(
      `UPDATE polls SET status = 'active', post_at = ?,
         ends_at = CASE WHEN length_ms IS NULL THEN ends_at ELSE ? + length_ms END
       WHERE guild_id = ? AND id = ? AND status = 'scheduled'`,
    )
    .run(now, now, guildId, id);
  if (!claimed.changes) return null;
  const p = getPoll(db, guildId, id)!;
  try {
    const { message, payload } = bodyOf(db, p, now, true);
    const sent = await rest
      .post<{ id: string }>(`/channels/${p.channelId}/messages`, payload)
      .catch(plain);
    db.prepare(
      'UPDATE polls SET message_id = ? WHERE guild_id = ? AND id = ?',
    ).run(sent.id, guildId, id);
    rememberPost(db, guildId, sent.id, message, now);
    addPollLog(db, guildId, {
      action: 'posted',
      poll: id,
      userId: p.authorId,
      userName: p.authorName,
      detail: `<#${p.channelId}>`,
      at: now,
    });
    return { ...p, messageId: sent.id };
  } catch (e) {
    // Nothing was posted, so nothing is kept.
    forget(db, guildId, id);
    const problem =
      e instanceof Plain ? e.message : 'Sparko couldn’t post the poll.';
    addPollLog(db, guildId, {
      action: 'failed',
      poll: id,
      userId: p.authorId,
      userName: p.authorName,
      detail: `“${p.question}” wasn’t posted: ${problem}`,
      at: now,
    });
    if (e instanceof Plain) throw e;
    throw new Plain(problem);
  }
}

/** Moves a scheduled poll's time to now, so the next job or sweep posts it. */
export function pollPostSoon(
  db: Db,
  guildId: string,
  id: number,
  now = Date.now(),
) {
  return (
    db
      .prepare(
        "UPDATE polls SET post_at = ? WHERE guild_id = ? AND id = ? AND status = 'scheduled'",
      )
      .run(now, guildId, id).changes > 0
  );
}

/** Shows a poll's latest votes, or its results once it ended, in its message. */
export async function pollRefresh(
  rest: Rest,
  db: Db,
  guildId: string,
  id: number,
  now = Date.now(),
) {
  const p = getPoll(db, guildId, id);
  if (!p?.messageId) return p;
  const { message, payload } = bodyOf(db, p, now);
  await rest
    .patch(`/channels/${p.channelId}/messages/${p.messageId}`, payload)
    .catch(ignoreGone);
  rememberPost(db, guildId, p.messageId, message, now);
  return p;
}

// Voting ----------------------------------------------------------------------

export type PollVoteResult =
  | { ok: false; problem: string }
  | {
      ok: true;
      /** Their picks now, and before. */
      picks: string[];
      was: string[];
      /** The vote reached the poll's target, so it ended. */
      ended: boolean;
    };

/**
 * Someone pressed an option (`option`, which picks it or takes it back) or
 * picked from the menu (`options`, which replaces their picks).
 */
export function pollVote(
  db: Db,
  guildId: string,
  id: number,
  user: { id: string; name: string; roles: string[] },
  input: { option: string } | { options: string[] },
  now = Date.now(),
): PollVoteResult {
  const { on } = pollConfigOf(db, guildId);
  const p = getPoll(db, guildId, id);
  if (!on || !p) return { ok: false, problem: 'This poll is gone.' };
  const why = pollCanVote(p, new Set(user.roles));
  if (why) return { ok: false, problem: why };
  const valid = new Set(p.options.map((o) => o.id));
  const was = pollPicksOf(db, p, user.id);
  let next: string[];
  if ('option' in input) {
    if (!valid.has(input.option))
      return { ok: false, problem: 'That option isn’t in this poll any more.' };
    next = was.includes(input.option)
      ? was.filter((x) => x !== input.option)
      : p.rules.multiple
        ? [...was, input.option]
        : [input.option];
  } else {
    next = [...new Set(input.options)].filter((x) => valid.has(x));
    if (!p.rules.multiple) next = next.slice(0, 1);
  }
  const order = new Map(p.options.map((o, i) => [o.id, i]));
  next.sort((a, b) => order.get(a)! - order.get(b)!);
  const max = p.rules.multiple ? p.rules.maxPicks || p.options.length : 1;
  if (next.length > max)
    return {
      ok: false,
      problem: `You can pick up to ${max} options in this poll. Take one back first.`,
    };
  if (next.join() === was.join())
    return { ok: true, picks: was, was, ended: false };
  if (!p.rules.changeVotes && was.some((x) => !next.includes(x)))
    return {
      ok: false,
      problem: 'You’ve already voted, and votes can’t be changed in this poll.',
    };
  transaction(db, () => {
    db.prepare(
      'DELETE FROM poll_votes WHERE guild_id = ? AND poll_id = ? AND user_id = ?',
    ).run(guildId, id, user.id);
    const add = db.prepare(
      `INSERT INTO poll_votes (guild_id, poll_id, user_id, user_name, option_id, at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const o of next) add.run(guildId, id, user.id, user.name, o, now);
  });
  let ended = false;
  if (p.rules.voteTarget) {
    const { voters } = countsOf(db, guildId, id);
    if (voters >= p.rules.voteTarget)
      ended = !!pollClose(db, guildId, id, 'votes', pollSparko, now);
  }
  return { ok: true, picks: next, was, ended };
}

// Ending ----------------------------------------------------------------------

export const pollSparko = { id: '0', name: 'Sparko' };

/**
 * Ends a running poll in Sparko's data, and logs why. Returns the ended
 * poll, or null when it wasn't running. The message is edited after.
 */
export function pollClose(
  db: Db,
  guildId: string,
  id: number,
  why: PollEndWhy,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const done = db
    .prepare(
      `UPDATE polls SET status = 'ended', ended_at = ?, ended_why = ?, ended_by = ?
       WHERE guild_id = ? AND id = ? AND status = 'active'`,
    )
    .run(now, why, why === 'staff' ? by.name : '', guildId, id);
  if (!done.changes) return null;
  addPollLog(db, guildId, {
    action: 'ended',
    poll: id,
    userId: by.id,
    userName: by.name,
    detail: why,
    at: now,
  });
  return shown(getPoll(db, guildId, id)!);
}

/** Ends a poll and shows its results. */
export async function pollEnd(
  rest: Rest,
  db: Db,
  guildId: string,
  id: number,
  why: PollEndWhy,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const p = getPoll(db, guildId, id);
  if (!p) throw new Plain(`There’s no poll #${id}.`);
  if (p.status === 'scheduled')
    throw new Plain(
      `Poll #${id} hasn’t been posted yet. Delete it in the dashboard instead.`,
    );
  if (p.status === 'ended') throw new Plain(`Poll #${id} has already ended.`);
  const ended = pollClose(db, guildId, id, why, by, now);
  await pollRefresh(rest, db, guildId, id, now);
  return ended!;
}

/**
 * Staff reroll a tie: one of the tied options is picked at random (another
 * one than last time, when there's a choice). Returns it.
 */
export function pollReroll(
  db: Db,
  guildId: string,
  id: number,
  by: { id: string; name: string },
  now = Date.now(),
  random = Math.random,
) {
  const p = getPoll(db, guildId, id);
  if (!p) throw new Plain(`There’s no poll #${id}.`);
  if (p.status !== 'ended')
    throw new Plain('Only a poll that has ended can be rerolled.');
  const { winners, tie } = pollResults(p);
  if (!tie) throw new Plain('This poll has a clear winner, so there’s no tie.');
  const pool =
    winners.length > 1 ? winners.filter((o) => o.id !== p.picked) : winners;
  const pick = pool[Math.floor(random() * pool.length)] ?? winners[0]!;
  db.prepare('UPDATE polls SET picked = ? WHERE guild_id = ? AND id = ?').run(
    pick.id,
    guildId,
    id,
  );
  addPollLog(db, guildId, {
    action: 'rerolled',
    poll: id,
    userId: by.id,
    userName: by.name,
    detail: pick.label,
    at: now,
  });
  return pick;
}

// Deleting --------------------------------------------------------------------

/** Where a deleted poll's message was, for taking it down. */
export type PollLeftovers = { channelId: string; messageId: string | null };

/** Forgets a poll and its votes; returns where its message is. */
export function pollForget(
  db: Db,
  guildId: string,
  id: number,
  by: { id: string; name: string },
  now = Date.now(),
): PollLeftovers | null {
  const p = getPoll(db, guildId, id);
  if (!p) return null;
  forget(db, guildId, id);
  addPollLog(db, guildId, {
    action: 'deleted',
    poll: id,
    userId: by.id,
    userName: by.name,
    detail: p.question,
    at: now,
  });
  return { channelId: p.channelId, messageId: p.messageId };
}

/** Takes a deleted poll's message out of Discord. */
export async function pollRemoveMessage(rest: Rest, left: PollLeftovers) {
  if (left.messageId)
    await rest
      .delete(`/channels/${left.channelId}/messages/${left.messageId}`)
      .catch(() => {});
}

// The minute sweep ------------------------------------------------------------

/**
 * Posts polls whose time has come and ends ones past their end time; the
 * bot runs this every minute.
 */
export async function pollSweep(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
) {
  const { on } = pollConfigOf(db, guildId);
  if (!on) return { posted: 0, ended: 0 };
  const ids = (sql: string) =>
    (db.prepare(sql).all(guildId, now) as { id: number }[]).map((r) => r.id);
  let posted = 0;
  for (const id of ids(
    "SELECT id FROM polls WHERE guild_id = ? AND status = 'scheduled' AND post_at <= ? ORDER BY id",
  ))
    // A refused poll is removed and logged by pollPost.
    if (await pollPost(rest, db, guildId, id, now).catch(() => null)) posted++;
  let ended = 0;
  for (const id of ids(
    "SELECT id FROM polls WHERE guild_id = ? AND status = 'active' AND ends_at IS NOT NULL AND ends_at <= ? ORDER BY id",
  )) {
    if (!pollClose(db, guildId, id, 'time', pollSparko, now)) continue;
    ended++;
    await pollRefresh(rest, db, guildId, id, now).catch(() => {});
  }
  return { posted, ended };
}

/** Guilds with polls on, for the sweep. */
export function pollGuilds(db: Db) {
  return (
    db
      .prepare(
        'SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1',
      )
      .all(POLL_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// Testing the message ---------------------------------------------------------

/** A made-up poll, to show what the messages look like. */
export const pollSample = (
  by: { id: string; name: string },
  status: Poll['status'] = 'active',
  now = Date.now(),
): Poll => ({
  id: 1,
  question: 'What should our next game night be?',
  options: [
    { id: 'o1', label: 'Minecraft', emoji: '⛏️' },
    { id: 'o2', label: 'Among Us', emoji: '🚀' },
    { id: 'o3', label: 'Jackbox', emoji: '📦' },
  ],
  rules: {
    style: 'buttons',
    anonymous: false,
    multiple: false,
    maxPicks: 1,
    changeVotes: true,
    hideResults: false,
    roles: [],
    voteTarget: 0,
    ping: '',
  },
  channelId: '',
  messageId: null,
  status,
  postAt: now,
  endsAt: status === 'ended' ? null : now + 86_400_000,
  endedAt: status === 'ended' ? now : null,
  endedWhy: status === 'ended' ? 'time' : null,
  endedBy: '',
  picked: null,
  authorId: by.id,
  authorName: by.name,
  createdAt: now,
  counts: { o1: 12, o2: 7, o3: 3 },
  voters: 22,
});

/** Posts a sample poll or its results in a channel, so staff can see it. */
export async function pollTestPost(
  rest: Rest,
  db: Db,
  guildId: string,
  channel: string,
  kind: 'poll' | 'results',
  by: PollAuthor,
  now = Date.now(),
) {
  const { config: c } = pollConfigOf(db, guildId);
  const p = pollSample(by, kind === 'results' ? 'ended' : 'active', now);
  const main = pollPayload(pollMessage(db, guildId, c, kind), p, {
    now,
    avatar: by.avatar,
    server: serverOf(db, guildId),
    channel,
  });
  const note = '-# This is a test. Votes on it don’t count.';
  const body = main.flags
    ? {
        ...main,
        components: [{ type: 10, content: note }, ...main.components!],
      }
    : { ...main, content: `${note}\n${main.content ?? ''}`.trim() };
  await rest.post(`/channels/${channel}/messages`, body).catch(plain);
}
