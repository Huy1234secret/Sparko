import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule } from './store.ts';
import { normaliseStudio, type StudioMessage } from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import { reactionPath } from './reaction-roles.ts';
import { rememberPost } from './studio-actions.ts';
import {
  SG_MODULE,
  sgCanSuggest,
  sgDefaultMessage,
  sgDmPayload,
  sgDuplicateKey,
  sgLengthProblem,
  sgLimits,
  sgOutcome,
  sgPayloads,
  sgStatusOf,
  sgUpgrade,
  type SgFile,
  type SgLogEntry,
  type SgSuggestion,
  type Suggestions,
} from './suggestions.ts';
import { parseDuration } from './auto-roles.ts';

export * from './suggestions.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
const json = <T>(v: unknown, fallback: T): T => {
  try {
    return (JSON.parse(String(v)) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

export function sgConfigOf(db: Db, guildId: string) {
  const m = getModule<Suggestions>(db, guildId, SG_MODULE);
  return { on: m.on, config: sgUpgrade(m.config) };
}

// Saved suggestions -----------------------------------------------------------

const suggestionOf = (r: Row): SgSuggestion => ({
  number: r.number as number,
  authorId: r.author_id as string,
  authorName: r.author_name as string,
  authorAvatar: r.author_avatar as string,
  title: r.title as string,
  body: r.body as string,
  files: json<SgFile[]>(r.files, []),
  status: r.status as string,
  closed: r.closed === 1,
  up: r.up as number,
  down: r.down as number,
  channelId: (r.channel_id as string | null) ?? null,
  messageId: (r.message_id as string | null) ?? null,
  threadId: (r.thread_id as string | null) ?? null,
  reason: json<SgSuggestion['reason']>(r.reason_json, null),
  createdAt: r.created_at as number,
  lastAt: r.last_at as number,
});

/** A suggestion and where its other messages are. */
type Stored = SgSuggestion & {
  guildId: string;
  moreIds: string[];
  reviewChannelId: string | null;
  reviewMessageId: string | null;
};
const storedOf = (r: Row): Stored => ({
  ...suggestionOf(r),
  guildId: r.guild_id as string,
  moreIds: json<string[]>(r.more_ids, []),
  reviewChannelId: (r.review_channel_id as string | null) ?? null,
  reviewMessageId: (r.review_message_id as string | null) ?? null,
});

export function getSuggestion(db: Db, guildId: string, number: number) {
  const r = db
    .prepare('SELECT * FROM suggestions WHERE guild_id = ? AND number = ?')
    .get(guildId, number) as Row | undefined;
  return r ? storedOf(r) : null;
}

/** The suggestion a message belongs to: its post, or its review message. */
export function suggestionByMessage(db: Db, messageId: string) {
  const r = db
    .prepare(
      'SELECT * FROM suggestions WHERE message_id = ? OR review_message_id = ?',
    )
    .get(messageId, messageId) as Row | undefined;
  return r ? storedOf(r) : null;
}

function save(db: Db, s: Stored) {
  db.prepare(
    `UPDATE suggestions SET status = ?, closed = ?, up = ?, down = ?,
       channel_id = ?, message_id = ?, more_ids = ?, thread_id = ?,
       review_channel_id = ?, review_message_id = ?, reason_json = ?, last_at = ?
     WHERE guild_id = ? AND number = ?`,
  ).run(
    s.status,
    s.closed ? 1 : 0,
    s.up,
    s.down,
    s.channelId,
    s.messageId,
    JSON.stringify(s.moreIds),
    s.threadId,
    s.reviewChannelId,
    s.reviewMessageId,
    s.reason ? JSON.stringify(s.reason) : null,
    s.lastAt,
    s.guildId,
    s.number,
  );
}

/** Suggestions for Storage, newest first, matching what staff typed. */
export function listSuggestions(
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
        `SELECT * FROM suggestions WHERE guild_id = ?
           AND (? = '' OR number = ? OR author_id = ? OR author_name LIKE ? ESCAPE '\\'
                OR title LIKE ? ESCAPE '\\')
           AND (? = '' OR status = ?)
         ORDER BY number DESC LIMIT ?`,
      )
      .all(guildId, q, n, q, like, like, status, status, limit) as Row[]
  ).map(suggestionOf);
}

/** How much of the server's storage suggestions use. */
export function sgStorage(db: Db, guildId: string) {
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM suggestions WHERE guild_id = ?')
    .get(guildId) as { n: number };
  const limits = sgLimits(getGuild(db, guildId)?.plan);
  return {
    count: n,
    limit: limits.suggestions,
    perKb: limits.perKb,
    usedKb: n * limits.perKb,
    limitMb: limits.storageMb,
  };
}

// The log ---------------------------------------------------------------------

export function addSgLog(db: Db, guildId: string, e: Omit<SgLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO sg_log (guild_id, action, number, user_id, user_name, detail, at)
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
    `DELETE FROM sg_log WHERE guild_id = ? AND id <= (
       SELECT id FROM sg_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listSgLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM sg_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): SgLogEntry => ({
      id: String(r.id),
      action: r.action as SgLogEntry['action'],
      number: (r.number as number | null) ?? null,
      userId: r.user_id as string,
      userName: r.user_name as string,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
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
const gone = (e: unknown) =>
  e instanceof DiscordError && e.code === DiscordCodes.unknownMessage;

function plain(e: unknown): never {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    throw new Plain(
      'Sparko can’t post in the suggestions channel. Give it View Channel, Send Messages, Embed Links, Add Reactions and Create Public Threads there.',
    );
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    throw new Plain('That channel no longer exists. Pick another one.');
  if (e instanceof DiscordError && e.status === 400)
    throw new Plain(`Discord didn’t accept the message: ${e.message}`);
  throw e;
}

/** The suggestion message: the server's template, or Sparko's own. */
export function sgMessage(db: Db, guildId: string, c: Suggestions) {
  const t = c.message
    ? getTemplate<StudioMessage>(db, guildId, 'studio', c.message)
    : undefined;
  return normaliseStudio(t?.message ?? sgDefaultMessage());
}

const serverOf = (db: Db, guildId: string) => {
  const g = getGuild(db, guildId);
  return g ? { name: g.name, members: g.memberCount } : undefined;
};

function bodies(db: Db, s: Stored, c: Suggestions, now: number) {
  return sgPayloads(c, sgMessage(db, s.guildId, c), s, {
    now,
    server: serverOf(db, s.guildId),
    channel: c.channel,
  });
}

/** Staff buttons under a suggestion waiting for review. */
function reviewBody(main: Record<string, unknown>, s: Stored, done?: string) {
  const v2 = !!main.flags;
  const note = done ?? `**New suggestion to check** from <@${s.authorId}>`;
  const row = {
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: 'Post it',
        custom_id: `sg:accept:${s.number}`,
      },
      {
        type: 2,
        style: 4,
        label: 'Reject',
        custom_id: `sg:reject:${s.number}`,
      },
    ],
  };
  // The vote buttons and the template's own don't belong on the review copy.
  const components = ((main.components ?? []) as { type: number }[]).filter(
    (x) => x.type !== 1 || !/"custom_id":"s[gp]:/.test(JSON.stringify(x)),
  );
  return v2
    ? {
        ...main,
        components: [
          { type: 10, content: note },
          ...components,
          ...(done ? [] : [row]),
        ],
      }
    : {
        ...main,
        content: note,
        components: done ? [] : [row],
      };
}

async function addReactions(rest: Rest, s: Stored, c: Suggestions) {
  if (c.vote.kind !== 'reaction' || !s.messageId || !s.channelId) return;
  const path = `/channels/${s.channelId}/messages/${s.messageId}/reactions`;
  for (const e of [c.vote.up.emoji, c.vote.down.emoji])
    await rest.put(`${path}/${reactionPath(e)}/@me`, {}).catch(() => {});
}

/**
 * Puts a suggestion in its channel: posts it (with any parts a long one
 * needs, its reactions and its thread), or edits the message already there.
 */
export async function sgPost(
  rest: Rest,
  db: Db,
  s: Stored,
  now = Date.now(),
): Promise<Stored> {
  const { config: c } = sgConfigOf(db, s.guildId);
  const { main, more } = bodies(db, s, c, now);
  // So the template's own buttons and menus work on the posted message.
  const remember = (messageId: string) =>
    rememberPost(db, s.guildId, messageId, sgMessage(db, s.guildId, c), now);
  let next = { ...s };
  try {
    if (next.messageId && next.channelId) {
      try {
        await rest.patch(
          `/channels/${next.channelId}/messages/${next.messageId}`,
          main,
        );
        remember(next.messageId);
        for (const [i, id] of next.moreIds.entries())
          if (more[i])
            await rest
              .patch(`/channels/${next.channelId}/messages/${id}`, more[i])
              .catch(ignoreGone);
        return next;
      } catch (e) {
        if (!gone(e)) throw e;
        next = { ...next, messageId: null, moreIds: [] };
      }
    }
    const channel = c.channel;
    const sent = await rest.post<{ id: string }>(
      `/channels/${channel}/messages`,
      main,
    );
    const moreIds: string[] = [];
    for (const body of more)
      moreIds.push(
        (await rest.post<{ id: string }>(`/channels/${channel}/messages`, body))
          .id,
      );
    next = { ...next, channelId: channel, messageId: sent.id, moreIds };
    remember(sent.id);
    await addReactions(rest, next, c);
    if (c.threads && !next.threadId) {
      const thread = await rest
        .post<{ id: string }>(
          `/channels/${channel}/messages/${sent.id}/threads`,
          {
            name: `#${s.number} ${s.title}`.slice(0, 100),
            auto_archive_duration: 10080,
          },
        )
        .catch(() => null);
      if (thread) next.threadId = thread.id;
    }
    save(db, next);
    return next;
  } catch (e) {
    plain(e);
  }
}

/** Shows a suggestion's latest votes and status in its message. */
export async function sgRefresh(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  now = Date.now(),
) {
  const s = getSuggestion(db, guildId, number);
  if (!s) return null;
  if (s.status === 'review' || (s.reviewMessageId && !s.messageId)) {
    const { config: c } = sgConfigOf(db, guildId);
    if (!s.reviewChannelId || !s.reviewMessageId) return s;
    const { main } = bodies(db, s, c, now);
    const done =
      s.status === 'review'
        ? undefined
        : `**Rejected** by ${s.reason?.byName ?? 'staff'}`;
    await rest
      .patch(
        `/channels/${s.reviewChannelId}/messages/${s.reviewMessageId}`,
        reviewBody(main, s, done),
      )
      .catch(ignoreGone);
    return s;
  }
  return sgPost(rest, db, s, now);
}

// Suggesting ------------------------------------------------------------------

export type SgAuthor = {
  id: string;
  name: string;
  avatar: string;
  roles: string[];
};

/**
 * A member suggested something: checks they may, then posts it (or sends
 * it to staff to check first). Returns the problem in plain words when it
 * can't be posted.
 */
export async function sgSubmit(
  rest: Rest,
  db: Db,
  input: {
    guildId: string;
    author: SgAuthor;
    /** When their Discord account was made. */
    created: number;
    title: string;
    body: string;
    files: SgFile[];
  },
  now = Date.now(),
): Promise<
  | { ok: true; number: number; review: boolean; link: string }
  | { ok: false; problem: string }
> {
  const { guildId, author } = input;
  const { on, config: c } = sgConfigOf(db, guildId);
  const refuse = (problem: string) => {
    addSgLog(db, guildId, {
      action: 'refused',
      number: null,
      userId: author.id,
      userName: author.name,
      detail: problem.replace(/<t:\d+:R>/, 'later'),
      at: now,
    });
    return { ok: false as const, problem };
  };
  if (!on || !c.channel)
    return { ok: false, problem: 'Suggestions are turned off in this server.' };
  const mine = db
    .prepare(
      `SELECT COUNT(*) FILTER (WHERE status IN ('open', 'review') AND closed = 0) AS pending,
              MAX(created_at) AS last
         FROM suggestions WHERE guild_id = ? AND author_id = ?`,
    )
    .get(guildId, author.id) as { pending: number; last: number | null };
  const why = sgCanSuggest(
    c,
    {
      roles: new Set(author.roles),
      created: input.created,
      pending: mine.pending,
      lastAt: mine.last,
    },
    now,
  );
  if (why) return refuse(why);
  const title = input.title.trim().slice(0, 100);
  const body = input.body.trim();
  const long = sgLengthProblem(c, body);
  if (long) return refuse(long);
  const key = sgDuplicateKey(title, body);
  if (c.duplicates) {
    const twin = db
      .prepare(
        'SELECT number FROM suggestions WHERE guild_id = ? AND dup_key = ? LIMIT 1',
      )
      .get(guildId, key) as { number: number } | undefined;
    if (twin)
      return refuse(
        `This is the same as suggestion #${twin.number}. Vote on that one instead.`,
      );
  }
  const storage = sgStorage(db, guildId);
  if (storage.count >= storage.limit)
    return refuse(
      'This server’s suggestion storage is full. Ask staff to delete old suggestions.',
    );

  const { n } = db
    .prepare(
      'SELECT COALESCE(MAX(number), 0) + 1 AS n FROM suggestions WHERE guild_id = ?',
    )
    .get(guildId) as { n: number };
  const review = !!c.review;
  db.prepare(
    `INSERT INTO suggestions (guild_id, number, author_id, author_name, author_avatar,
       title, body, files, dup_key, status, created_at, last_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    n,
    author.id,
    author.name,
    author.avatar,
    title,
    body,
    JSON.stringify(input.files.slice(0, 3)),
    key,
    review ? 'review' : 'open',
    now,
    now,
  );
  const s = getSuggestion(db, guildId, n)!;
  try {
    if (review) {
      const { main } = bodies(db, s, c, now);
      const sent = await rest.post<{ id: string }>(
        `/channels/${c.review}/messages`,
        reviewBody(main, s),
      );
      save(db, {
        ...s,
        reviewChannelId: c.review,
        reviewMessageId: sent.id,
      });
      addSgLog(db, guildId, {
        action: 'review',
        number: n,
        userId: author.id,
        userName: author.name,
        detail: title,
        at: now,
      });
      return {
        ok: true,
        number: n,
        review,
        link: `https://discord.com/channels/${guildId}/${c.review}/${sent.id}`,
      };
    }
    const posted = await sgPost(rest, db, s, now);
    addSgLog(db, guildId, {
      action: 'posted',
      number: n,
      userId: author.id,
      userName: author.name,
      detail: title,
      at: now,
    });
    return {
      ok: true,
      number: n,
      review,
      link: `https://discord.com/channels/${guildId}/${posted.channelId}/${posted.messageId}`,
    };
  } catch (e) {
    // Nothing was posted, so nothing is kept.
    db.prepare('DELETE FROM suggestions WHERE guild_id = ? AND number = ?').run(
      guildId,
      n,
    );
    addSgLog(db, guildId, {
      action: 'failed',
      number: n,
      userId: author.id,
      userName: author.name,
      detail: e instanceof Error ? e.message : 'Couldn’t post it.',
      at: now,
    });
    return {
      ok: false,
      problem:
        e instanceof Plain
          ? e.message
          : 'Sparko couldn’t post your suggestion. Ask staff to check its permissions.',
    };
  }
}

export type SgStaff = { id: string; name: string; avatar: string };

/** Staff checked a suggestion waiting for review and posted it. */
export async function sgAccept(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  staff: SgStaff,
  now = Date.now(),
) {
  const s = getSuggestion(db, guildId, number);
  if (!s) throw new Plain(`There’s no suggestion #${number}.`);
  if (s.status !== 'review')
    throw new Plain(`Suggestion #${number} was already checked.`);
  const { config: c } = sgConfigOf(db, guildId);
  const open: Stored = { ...s, status: 'open', lastAt: now };
  save(db, open);
  const posted = await sgPost(rest, db, open, now);
  if (s.reviewChannelId && s.reviewMessageId) {
    const { main } = bodies(db, posted, c, now);
    await rest
      .patch(
        `/channels/${s.reviewChannelId}/messages/${s.reviewMessageId}`,
        reviewBody(
          main,
          posted,
          `**Posted** by ${staff.name}: https://discord.com/channels/${guildId}/${posted.channelId}/${posted.messageId}`,
        ),
      )
      .catch(ignoreGone);
  }
  addSgLog(db, guildId, {
    action: 'accepted',
    number,
    userId: staff.id,
    userName: staff.name,
    detail: '',
    at: now,
  });
  return posted;
}

// Statuses --------------------------------------------------------------------

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

/**
 * Sets a status with its reason and does what the status says: approves or
 * denies it, closes voting, DMs the author, or blacklists them. A
 * suggestion still waiting for review is posted first, unless it's denied.
 */
export async function sgSetStatus(
  rest: Rest,
  db: Db,
  input: {
    guildId: string;
    number: number;
    status: string;
    reason: string;
    staff: SgStaff;
  },
  now = Date.now(),
) {
  const { guildId, number, staff } = input;
  const { config: c } = sgConfigOf(db, guildId);
  let s = getSuggestion(db, guildId, number);
  if (!s) throw new Plain(`There’s no suggestion #${number}.`);
  const st = sgStatusOf(c, input.status);
  if (!st) throw new Plain('That status doesn’t exist any more.');
  const outcome = sgOutcome(st);
  if (s.status === 'review' && outcome !== 'denied')
    s = { ...(await sgAccept(rest, db, guildId, number, staff, now)) };
  const next: Stored = {
    ...s,
    status: st.id,
    closed: s.closed || st.actions.some((a) => a.type === 'close'),
    reason: {
      text: input.reason.trim().slice(0, 1000),
      byId: staff.id,
      byName: staff.name,
      byAvatar: staff.avatar,
      at: now,
    },
    lastAt: now,
  };
  save(db, next);
  const problems: string[] = [];
  for (const a of st.actions) {
    if (a.type === 'dm') {
      const t = a.template
        ? getTemplate<StudioMessage>(db, guildId, 'studio', a.template)
        : undefined;
      const sent = await dm(
        rest,
        next.authorId,
        sgDmPayload(c, t ? normaliseStudio(t.message) : null, next, {
          now,
          server: serverOf(db, guildId),
        }),
      );
      if (!sent) problems.push('the author doesn’t accept DMs');
    } else if (a.type === 'blacklist' && c.blacklist) {
      await rest
        .put(
          `/guilds/${guildId}/members/${next.authorId}/roles/${c.blacklist}`,
          {},
          `Suggestion #${number}: ${st.name}`,
        )
        .catch(() => problems.push('Sparko couldn’t give the blacklist role'));
    }
  }
  await sgRefresh(rest, db, guildId, number, now);
  if (next.closed && next.threadId)
    await rest
      .patch(`/channels/${next.threadId}`, { archived: true, locked: true })
      .catch(() => {});
  addSgLog(db, guildId, {
    action: 'status',
    number,
    userId: staff.id,
    userName: staff.name,
    detail: `${st.name}${problems.length ? ` (${problems.join(', ')})` : ''}`,
    at: now,
  });
  return { suggestion: next, status: st, problems };
}

// Voting ----------------------------------------------------------------------

export type SgVoteResult =
  | { ok: false; problem: string }
  | {
      ok: true;
      /** What their vote is now: 1, -1, or 0 for none. */
      vote: number;
      /** What it was. */
      was: number;
      /** A status set because of the votes. */
      auto: 'approved' | 'denied' | null;
    };

/**
 * Someone voted (1), downvoted (-1) or took their vote back (0). Pressing
 * the same vote again takes it back where changing votes is allowed.
 */
export function sgVote(
  db: Db,
  guildId: string,
  number: number,
  user: { id: string },
  vote: 1 | -1 | 0,
  now = Date.now(),
): SgVoteResult {
  const { on, config: c } = sgConfigOf(db, guildId);
  const s = getSuggestion(db, guildId, number);
  if (!on || !s) return { ok: false, problem: 'This suggestion is gone.' };
  if (s.status === 'review')
    return { ok: false, problem: 'Staff haven’t posted this one yet.' };
  if (s.closed) return { ok: false, problem: 'Voting on this one is closed.' };
  if (!c.selfVote && user.id === s.authorId)
    return { ok: false, problem: 'You can’t vote on your own suggestion.' };
  const row = db
    .prepare(
      'SELECT vote FROM sg_votes WHERE guild_id = ? AND number = ? AND user_id = ?',
    )
    .get(guildId, number, user.id) as { vote: number } | undefined;
  const was = row?.vote ?? 0;
  let next: number = vote;
  if (was && vote === was) next = 0;
  if (was && next !== was && !c.changeVotes)
    return {
      ok: false,
      problem: 'You’ve already voted, and votes can’t be changed here.',
    };
  if (next === was) return { ok: true, vote: was, was, auto: null };
  if (next)
    db.prepare(
      `INSERT INTO sg_votes (guild_id, number, user_id, vote) VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, number, user_id) DO UPDATE SET vote = excluded.vote`,
    ).run(guildId, number, user.id, next);
  else
    db.prepare(
      'DELETE FROM sg_votes WHERE guild_id = ? AND number = ? AND user_id = ?',
    ).run(guildId, number, user.id);
  const counts = db
    .prepare(
      `SELECT COUNT(*) FILTER (WHERE vote = 1) AS up, COUNT(*) FILTER (WHERE vote = -1) AS down
         FROM sg_votes WHERE guild_id = ? AND number = ?`,
    )
    .get(guildId, number) as { up: number; down: number };
  save(db, {
    ...s,
    up: counts.up,
    down: counts.down,
    lastAt: c.restartOnVote ? now : s.lastAt,
  });
  // Statuses set by votes only happen once, to suggestions still pending.
  const auto =
    s.status !== 'open'
      ? null
      : c.autoApprove && counts.up >= c.autoApprove
        ? ('approved' as const)
        : c.autoDeny && counts.down >= c.autoDeny
          ? ('denied' as const)
          : null;
  return { ok: true, vote: next, was, auto };
}

export const sparkoStaff: SgStaff = { id: '0', name: 'Sparko', avatar: '' };

/** Sets Approved or Denied because a suggestion reached its votes. */
export function sgAutoStatus(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  auto: 'approved' | 'denied',
  now = Date.now(),
) {
  const { config: c } = sgConfigOf(db, guildId);
  const n = auto === 'approved' ? c.autoApprove : c.autoDeny;
  return sgSetStatus(
    rest,
    db,
    {
      guildId,
      number,
      status: auto,
      reason: `Reached ${n} ${auto === 'approved' ? 'upvotes' : 'downvotes'}.`,
      staff: sparkoStaff,
    },
    now,
  );
}

/** Someone's vote on a suggestion: 1, -1 or 0. */
export function sgVoteOf(
  db: Db,
  guildId: string,
  number: number,
  userId: string,
) {
  const r = db
    .prepare(
      'SELECT vote FROM sg_votes WHERE guild_id = ? AND number = ? AND user_id = ?',
    )
    .get(guildId, number, userId) as { vote: number } | undefined;
  return r?.vote ?? 0;
}

// Deleting --------------------------------------------------------------------

function forget(db: Db, guildId: string, number: number) {
  db.prepare('DELETE FROM suggestions WHERE guild_id = ? AND number = ?').run(
    guildId,
    number,
  );
  db.prepare('DELETE FROM sg_votes WHERE guild_id = ? AND number = ?').run(
    guildId,
    number,
  );
}

/** Where a deleted suggestion's messages were, for taking them down. */
export type SgLeftovers = {
  channelId: string | null;
  messageIds: string[];
  reviewChannelId: string | null;
  reviewMessageId: string | null;
  threadId: string | null;
};

/** Forgets a suggestion and its votes; returns where its messages are. */
export function sgForget(
  db: Db,
  guildId: string,
  number: number,
  by: { id: string; name: string },
  now = Date.now(),
): SgLeftovers | null {
  const s = getSuggestion(db, guildId, number);
  if (!s) return null;
  forget(db, guildId, number);
  addSgLog(db, guildId, {
    action: 'deleted',
    number,
    userId: by.id,
    userName: by.name,
    detail: s.title,
    at: now,
  });
  return {
    channelId: s.channelId,
    messageIds: [s.messageId, ...s.moreIds].filter((x): x is string => !!x),
    reviewChannelId: s.reviewChannelId,
    reviewMessageId: s.reviewMessageId,
    threadId: s.threadId,
  };
}

/** Takes a deleted suggestion's messages and thread out of Discord. */
export async function sgRemoveMessages(rest: Rest, left: SgLeftovers) {
  const del = (channel: string | null, id: string | null) =>
    channel && id
      ? rest.delete(`/channels/${channel}/messages/${id}`).catch(() => {})
      : Promise.resolve();
  for (const id of left.messageIds) await del(left.channelId, id);
  await del(left.reviewChannelId, left.reviewMessageId);
  if (left.threadId)
    await rest.delete(`/channels/${left.threadId}`).catch(() => {});
}

/** Staff deleted a suggestion: its messages and its data go. */
export async function sgDelete(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  by: { id: string; name: string },
  now = Date.now(),
) {
  const left = sgForget(db, guildId, number, by, now);
  if (!left) return false;
  await sgRemoveMessages(rest, left);
  return true;
}

/**
 * A suggestion's message was deleted in Discord. Someone allowed to delete
 * suggestions deletes it for good; anyone else, and Sparko posts it again.
 */
export async function sgMessageDeleted(
  rest: Rest,
  db: Db,
  messageId: string,
  by: { id: string; name: string; allowed: boolean } | null,
  now = Date.now(),
) {
  const s = suggestionByMessage(db, messageId);
  if (!s || s.messageId !== messageId) return null;
  if (by?.allowed) {
    await sgDelete(rest, db, s.guildId, s.number, by, now);
    return 'deleted' as const;
  }
  const posted = await sgPost(
    rest,
    db,
    { ...s, messageId: null, moreIds: [], threadId: s.threadId },
    now,
  );
  // Votes by reaction were on the old message; buttons and menus keep theirs.
  addSgLog(db, s.guildId, {
    action: 'resent',
    number: s.number,
    userId: by?.id ?? '0',
    userName: by?.name ?? 'someone',
    detail: '',
    at: now,
  });
  return posted.messageId ? ('resent' as const) : null;
}

// Closing on time -------------------------------------------------------------

/** Closes voting on suggestions past their time; the bot runs this every minute. */
export async function sgSweep(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
) {
  const { on, config: c } = sgConfigOf(db, guildId);
  const ms = parseDuration(c.autoClose);
  if (!on || !ms) return 0;
  const due = (
    db
      .prepare(
        `SELECT * FROM suggestions WHERE guild_id = ? AND closed = 0 AND status != 'review'
           AND ${c.restartOnVote ? 'last_at' : 'created_at'} <= ?`,
      )
      .all(guildId, now - ms) as Row[]
  ).map(storedOf);
  for (const s of due) {
    save(db, { ...s, closed: true });
    await sgRefresh(rest, db, guildId, s.number, now).catch(() => {});
    if (s.threadId)
      await rest
        .patch(`/channels/${s.threadId}`, { archived: true, locked: true })
        .catch(() => {});
    addSgLog(db, guildId, {
      action: 'closed',
      number: s.number,
      userId: '0',
      userName: 'Sparko',
      detail: `${c.autoClose} passed`,
      at: now,
    });
  }
  return due.length;
}

/** Guilds with suggestions on, for the sweep. */
export function sgGuilds(db: Db) {
  return (
    db
      .prepare(
        'SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1',
      )
      .all(SG_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// Testing the message ---------------------------------------------------------

/** A made-up suggestion, to show what the message looks like. */
export const sgSample = (by: SgAuthor | SgStaff): SgSuggestion => ({
  number: 1,
  authorId: by.id,
  authorName: by.name,
  authorAvatar: by.avatar,
  title: 'Movie nights on Fridays',
  body: 'We could watch a film together in the voice channel every Friday evening, and vote on what to watch during the week.',
  files: [],
  status: 'open',
  closed: false,
  up: 12,
  down: 3,
  channelId: null,
  messageId: null,
  threadId: null,
  reason: null,
  createdAt: Date.now(),
  lastAt: Date.now(),
});

/** Posts a sample suggestion in a channel, so staff can see the message. */
export async function sgTestPost(
  rest: Rest,
  db: Db,
  guildId: string,
  channel: string,
  by: SgStaff,
  now = Date.now(),
) {
  const { config: c } = sgConfigOf(db, guildId);
  const { main, more } = sgPayloads(
    { ...c, vote: c.vote },
    sgMessage(db, guildId, c),
    sgSample(by),
    { now, server: serverOf(db, guildId), channel },
  );
  try {
    const content = 'This is a test. Votes on it don’t count.';
    const body = main.flags
      ? {
          ...main,
          components: [
            { type: 10, content: `-# ${content}` },
            ...(main.components as object[]),
          ],
        }
      : { ...main, content: `-# ${content}` };
    await rest.post(`/channels/${channel}/messages`, body);
    for (const m of more) await rest.post(`/channels/${channel}/messages`, m);
  } catch (e) {
    plain(e);
  }
}
