import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { emojiKey, reactionPath } from './reaction-roles.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import { normaliseStudio, type StudioMessage } from './studio-format.ts';
import { rememberPost } from './studio-actions.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import {
  SB_MODULE,
  sbDefaultMessage,
  sbIsStar,
  sbLimits,
  sbMilestones,
  sbMilestonesPassed,
  sbPayload,
  sbSample,
  sbSkipReason,
  sbStarCounts,
  sbUpgrade,
  type SbBlocked,
  type SbBoard,
  type SbEntry,
  type SbLogEntry,
  type SbMessageFacts,
  type SbReactor,
  type Starboard,
} from './starboard.ts';

export * from './starboard.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
/** Messages that never reached a board are forgotten after this long. */
const WAITING_MS = 30 * 86_400_000;

export function sbConfigOf(db: Db, guildId: string) {
  const m = getModule<Starboard>(db, guildId, SB_MODULE);
  return { on: m.on, config: sbUpgrade(m.config) };
}

const boardOf = (c: Starboard, id: string) => c.boards.find((b) => b.id === id);

// Starred messages ------------------------------------------------------------

type Stored = SbEntry & {
  guildId: string;
  /** The count the post shows. */
  shown: number;
  /** The highest milestone logged. */
  milestone: number;
};

const entryOf = (r: Row): Stored => ({
  guildId: r.guild_id as string,
  boardId: r.board_id as string,
  messageId: r.message_id as string,
  channelId: r.channel_id as string,
  authorId: r.author_id as string,
  authorName: r.author_name as string,
  authorAvatar: r.author_avatar as string,
  content: (r.content as string | null) ?? null,
  image: r.image as string,
  stars: r.stars as number,
  shown: r.shown as number,
  milestone: r.milestone as number,
  postChannelId: (r.post_channel_id as string | null) ?? null,
  postId: (r.post_id as string | null) ?? null,
  frozen: r.frozen === 1,
  deleted: r.deleted === 1,
  messageAt: r.message_at as number,
  postedAt: (r.posted_at as number | null) ?? null,
  updatedAt: r.updated_at as number,
});
/** What the dashboard sees of a starred message. */
const publicOf = ({
  guildId: _guild,
  shown: _shown,
  milestone: _milestone,
  ...e
}: Stored): SbEntry => e;

export function getSbEntry(
  db: Db,
  guildId: string,
  boardId: string,
  messageId: string,
) {
  const r = db
    .prepare(
      'SELECT * FROM sb_entries WHERE guild_id = ? AND board_id = ? AND message_id = ?',
    )
    .get(guildId, boardId, messageId) as Row | undefined;
  return r ? entryOf(r) : null;
}

/** Every board's entry for an original message. */
export function sbEntriesOf(db: Db, guildId: string, messageId: string) {
  return (
    db
      .prepare('SELECT * FROM sb_entries WHERE guild_id = ? AND message_id = ?')
      .all(guildId, messageId) as Row[]
  ).map(entryOf);
}

/** The entry whose board post this is. */
export function sbEntryByPost(db: Db, postId: string) {
  const r = db
    .prepare('SELECT * FROM sb_entries WHERE post_id = ?')
    .get(postId) as Row | undefined;
  return r ? entryOf(r) : null;
}

function saveEntry(db: Db, e: Stored) {
  db.prepare(
    `UPDATE sb_entries SET channel_id = ?, author_name = ?, author_avatar = ?,
       content = ?, image = ?, stars = ?, shown = ?, milestone = ?,
       post_channel_id = ?, post_id = ?, frozen = ?, deleted = ?, posted_at = ?,
       updated_at = ?
     WHERE guild_id = ? AND board_id = ? AND message_id = ?`,
  ).run(
    e.channelId,
    e.authorName,
    e.authorAvatar,
    e.content,
    e.image,
    e.stars,
    e.shown,
    e.milestone,
    e.postChannelId,
    e.postId,
    e.frozen ? 1 : 0,
    e.deleted ? 1 : 0,
    e.postedAt,
    e.updatedAt,
    e.guildId,
    e.boardId,
    e.messageId,
  );
}

function forgetEntry(
  db: Db,
  guildId: string,
  boardId: string,
  messageId: string,
) {
  db.prepare(
    'DELETE FROM sb_entries WHERE guild_id = ? AND board_id = ? AND message_id = ?',
  ).run(guildId, boardId, messageId);
  db.prepare(
    'DELETE FROM sb_reactors WHERE guild_id = ? AND board_id = ? AND message_id = ?',
  ).run(guildId, boardId, messageId);
}

/** Forgets messages that never reached a board and nobody starred for a while. */
function pruneWaiting(db: Db, guildId: string, now: number) {
  const old = db
    .prepare(
      `SELECT board_id, message_id FROM sb_entries
         WHERE guild_id = ? AND posted_at IS NULL AND updated_at < ? LIMIT 200`,
    )
    .all(guildId, now - WAITING_MS) as Row[];
  for (const r of old)
    forgetEntry(db, guildId, r.board_id as string, r.message_id as string);
}

/** Starred messages for Storage, matching what staff typed. */
export function listSbEntries(
  db: Db,
  guildId: string,
  {
    board = '',
    sort = 'stars',
    query = '',
    limit = 200,
  }: {
    board?: string;
    sort?: 'stars' | 'newest';
    query?: string;
    limit?: number;
  } = {},
) {
  const q = query.trim();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return (
    db
      .prepare(
        `SELECT * FROM sb_entries WHERE guild_id = ? AND posted_at IS NOT NULL
           AND (? = '' OR board_id = ?)
           AND (? = '' OR author_id = ? OR message_id = ?
                OR author_name LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
         ORDER BY ${sort === 'newest' ? 'message_at DESC' : 'stars DESC, message_at DESC'}
         LIMIT ?`,
      )
      .all(guildId, board, board, q, q, q, like, like, limit) as Row[]
  ).map((r) => publicOf(entryOf(r)));
}

/** How much of the server's storage starred messages use. */
export function sbStorage(db: Db, guildId: string) {
  const { n } = db
    .prepare(
      'SELECT COUNT(*) AS n FROM sb_entries WHERE guild_id = ? AND posted_at IS NOT NULL',
    )
    .get(guildId) as { n: number };
  const limits = sbLimits(getGuild(db, guildId)?.plan);
  return {
    count: n,
    limit: limits.posts,
    perKb: limits.perKb,
    usedKb: n * limits.perKb,
    limitMb: limits.storageMb,
  };
}

/** Forgets the starred messages of boards that were removed in settings. */
export function sbPruneBoards(db: Db, guildId: string, keep: string[]) {
  const list = JSON.stringify(keep);
  for (const t of ['sb_entries', 'sb_reactors'])
    db.prepare(
      `DELETE FROM ${t} WHERE guild_id = ? AND board_id NOT IN (SELECT value FROM json_each(?))`,
    ).run(guildId, list);
}

// The log ---------------------------------------------------------------------

type LogInput = Omit<SbLogEntry, 'id'>;

export function addSbLog(db: Db, guildId: string, e: LogInput) {
  db.prepare(
    `INSERT INTO sb_log (guild_id, action, board_id, board_name, message_id, channel_id,
       author_id, author_name, user_id, user_name, stars, detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    e.action,
    e.boardId,
    e.boardName,
    e.messageId,
    e.channelId,
    e.authorId,
    e.authorName,
    e.userId,
    e.userName,
    e.stars,
    e.detail.slice(0, 300),
    e.at,
  );
  db.prepare(
    `DELETE FROM sb_log WHERE guild_id = ? AND id <= (
       SELECT id FROM sb_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listSbLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM sb_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): SbLogEntry => ({
      id: String(r.id),
      action: r.action as SbLogEntry['action'],
      boardId: r.board_id as string,
      boardName: r.board_name as string,
      messageId: r.message_id as string,
      channelId: r.channel_id as string,
      authorId: r.author_id as string,
      authorName: r.author_name as string,
      userId: r.user_id as string,
      userName: r.user_name as string,
      stars: r.stars as number,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
}

export type SbStaff = { id: string; name: string };
export const sparkoActor: SbStaff = { id: '0', name: 'Sparko' };

const logFor = (
  db: Db,
  guildId: string,
  b: { id: string; name: string } | undefined,
  e: SbEntry,
  action: SbLogEntry['action'],
  by: SbStaff,
  now: number,
  detail = '',
) =>
  addSbLog(db, guildId, {
    action,
    boardId: b?.id ?? e.boardId,
    boardName: b?.name ?? '',
    messageId: e.messageId,
    channelId: e.channelId,
    authorId: e.authorId,
    authorName: e.authorName,
    userId: by.id,
    userName: by.name,
    stars: e.stars,
    detail,
    at: now,
  });

/** Logs a failure, unless the same one was logged in the last hour. */
function logFailure(
  db: Db,
  guildId: string,
  b: SbBoard,
  e: Stored,
  detail: string,
  now: number,
) {
  const last = db
    .prepare(
      'SELECT action, detail, at FROM sb_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1',
    )
    .get(guildId) as { action: string; detail: string; at: number } | undefined;
  if (
    last?.action === 'failed' &&
    last.detail === detail.slice(0, 300) &&
    now - last.at < 3_600_000
  )
    return;
  logFor(db, guildId, b, e, 'failed', sparkoActor, now, detail);
}

// Blocking --------------------------------------------------------------------

export function sbBlockedList(db: Db, guildId: string): SbBlocked[] {
  return (
    db
      .prepare('SELECT * FROM sb_blocked WHERE guild_id = ? ORDER BY at DESC')
      .all(guildId) as Row[]
  ).map((r) => ({
    kind: r.kind as SbBlocked['kind'],
    id: r.target_id as string,
    channelId: r.channel_id as string,
    name: r.name as string,
    preview: r.preview as string,
    byName: r.by_name as string,
    at: r.at as number,
  }));
}

/** Whether staff blocked this message, or its author. */
export function sbIsBlocked(
  db: Db,
  guildId: string,
  who: { messageId?: string; userId?: string },
) {
  const r = db
    .prepare(
      `SELECT 1 FROM sb_blocked WHERE guild_id = ?
         AND ((kind = 'message' AND target_id = ?) OR (kind = 'member' AND target_id = ?))`,
    )
    .get(guildId, who.messageId ?? '', who.userId ?? '');
  return !!r;
}

/** Board posts to take out of Discord. */
export type SbLeftovers = { posts: { channelId: string; messageId: string }[] };

const postsOf = (list: Stored[]): SbLeftovers => ({
  posts: list
    .filter((e) => e.postId && e.postChannelId)
    .map((e) => ({ channelId: e.postChannelId!, messageId: e.postId! })),
});

/** Takes board posts down; ones already gone are fine. */
export async function sbRemovePosts(rest: Rest, left: SbLeftovers) {
  for (const p of left.posts)
    await rest
      .delete(`/channels/${p.channelId}/messages/${p.messageId}`)
      .catch(() => {});
}

/**
 * Keeps a message off every board: its posts come down and its stars are
 * forgotten. Returns the posts to take down.
 */
export function sbBlockMessage(
  db: Db,
  guildId: string,
  target: { messageId: string; channelId: string },
  by: SbStaff,
  now = Date.now(),
): SbLeftovers {
  const { config } = sbConfigOf(db, guildId);
  const entries = sbEntriesOf(db, guildId, target.messageId);
  const first = entries[0];
  db.prepare(
    `INSERT INTO sb_blocked (guild_id, kind, target_id, channel_id, name, preview, by_name, at)
     VALUES (?, 'message', ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, kind, target_id) DO NOTHING`,
  ).run(
    guildId,
    target.messageId,
    first?.channelId ?? target.channelId,
    first?.authorName ?? '',
    (first?.content ?? '').slice(0, 200),
    by.name,
    now,
  );
  for (const e of entries) forgetEntry(db, guildId, e.boardId, e.messageId);
  addSbLog(db, guildId, {
    action: 'blocked',
    boardId: '',
    boardName: entries.length
      ? (boardOf(config, entries[0]!.boardId)?.name ?? '')
      : '',
    messageId: target.messageId,
    channelId: first?.channelId ?? target.channelId,
    authorId: first?.authorId ?? '',
    authorName: first?.authorName ?? '',
    userId: by.id,
    userName: by.name,
    stars: Math.max(0, ...entries.map((e) => e.stars)),
    detail: '',
    at: now,
  });
  return postsOf(entries);
}

/** Keeps a member's messages off every board; their stars stop counting. */
export function sbBlockMember(
  db: Db,
  guildId: string,
  member: { id: string; name: string },
  by: SbStaff,
  now = Date.now(),
) {
  const r = db
    .prepare(
      `INSERT INTO sb_blocked (guild_id, kind, target_id, name, by_name, at)
       VALUES (?, 'member', ?, ?, ?, ?)
       ON CONFLICT (guild_id, kind, target_id) DO NOTHING`,
    )
    .run(guildId, member.id, member.name, by.name, now);
  if (!r.changes) return false;
  addSbLog(db, guildId, {
    action: 'blocked',
    boardId: '',
    boardName: '',
    messageId: '',
    channelId: '',
    authorId: member.id,
    authorName: member.name,
    userId: by.id,
    userName: by.name,
    stars: 0,
    detail: '',
    at: now,
  });
  return true;
}

/** Lets a message or member back on the board. */
export function sbUnblock(
  db: Db,
  guildId: string,
  kind: SbBlocked['kind'],
  id: string,
  by: SbStaff,
  now = Date.now(),
) {
  const was = sbBlockedList(db, guildId).find(
    (x) => x.kind === kind && x.id === id,
  );
  if (!was) return false;
  db.prepare(
    'DELETE FROM sb_blocked WHERE guild_id = ? AND kind = ? AND target_id = ?',
  ).run(guildId, kind, id);
  addSbLog(db, guildId, {
    action: 'unblocked',
    boardId: '',
    boardName: '',
    messageId: kind === 'message' ? id : '',
    channelId: was.channelId,
    authorId: kind === 'member' ? id : '',
    authorName: was.name,
    userId: by.id,
    userName: by.name,
    stars: 0,
    detail: '',
    at: now,
  });
  return true;
}

// Counting stars --------------------------------------------------------------

/** Counts each member once, however many of the board's emojis they used. */
function recount(db: Db, b: SbBoard, e: Stored) {
  const { n } = db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS n FROM sb_reactors
         WHERE guild_id = ? AND board_id = ? AND message_id = ?
           AND emoji IN (SELECT value FROM json_each(?))`,
    )
    .get(
      e.guildId,
      b.id,
      e.messageId,
      JSON.stringify(b.emojis.map(emojiKey)),
    ) as { n: number };
  return n;
}

/** A message someone reacted on, as the bot sees it. */
export type SbMessage = SbMessageFacts & {
  id: string;
  authorName: string;
  authorAvatar: string;
  /** Its text, or null when Discord didn't share it. */
  content: string | null;
  image: string;
};

export type SbTrackInput = {
  guildId: string;
  message: SbMessage;
  reactor: SbReactor;
  emoji: string;
  added: boolean;
  /** The reaction was on a board post, which counts as the original. */
  onPost: boolean;
  /** How many of this emoji the message has now, as Discord says. */
  discordCount?: number;
  /** Whether a board's channel is NSFW. */
  boardNsfw: (channelId: string) => boolean;
};

/**
 * Someone added or took off a reaction. Records it on every board it's a
 * star for, and returns the boards whose post needs updating, with whether
 * Discord already had stars Sparko never saw (so they're counted first).
 */
export function sbTrack(db: Db, input: SbTrackInput, now = Date.now()) {
  const { on, config } = sbConfigOf(db, input.guildId);
  if (!on) return [];
  const m = input.message;
  const changed: { boardId: string; recount: boolean }[] = [];
  const blocked = sbIsBlocked(db, input.guildId, {
    messageId: m.id,
    userId: m.authorId,
  });
  const reactorBlocked = sbIsBlocked(db, input.guildId, {
    userId: input.reactor.id,
  });
  for (const b of config.boards) {
    if (!sbIsStar(b, input.emoji)) continue;
    let e = getSbEntry(db, input.guildId, b.id, m.id);
    if (input.added) {
      if (
        sbSkipReason(b, m, {
          now,
          boardNsfw: input.boardNsfw(b.channel),
          blocked,
        })
      )
        continue;
      if (!sbStarCounts(b, input.reactor, m.authorId, reactorBlocked)) continue;
      let fresh = false;
      if (!e) {
        pruneWaiting(db, input.guildId, now);
        db.prepare(
          `INSERT INTO sb_entries (guild_id, board_id, message_id, channel_id, author_id,
             message_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          input.guildId,
          b.id,
          m.id,
          m.channelId,
          m.authorId,
          m.createdAt,
          now,
        );
        e = getSbEntry(db, input.guildId, b.id, m.id)!;
        fresh = true;
      }
      db.prepare(
        `INSERT INTO sb_reactors (guild_id, board_id, message_id, user_id, emoji, on_post)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      ).run(
        input.guildId,
        b.id,
        m.id,
        input.reactor.id,
        emojiKey(input.emoji),
        input.onPost ? 1 : 0,
      );
      changed.push({
        boardId: b.id,
        recount: fresh && (input.discordCount ?? 1) > 1,
      });
    } else {
      if (!e) continue;
      db.prepare(
        `DELETE FROM sb_reactors WHERE guild_id = ? AND board_id = ? AND message_id = ?
           AND user_id = ? AND emoji = ? AND on_post = ?`,
      ).run(
        input.guildId,
        b.id,
        m.id,
        input.reactor.id,
        emojiKey(input.emoji),
        input.onPost ? 1 : 0,
      );
      changed.push({ boardId: b.id, recount: false });
    }
    // The text and picture are kept current, for the post and Storage.
    const next: Stored = {
      ...e,
      channelId: m.channelId,
      authorName: m.authorName,
      authorAvatar: m.authorAvatar,
      content: m.content,
      image: m.image,
      updatedAt: now,
    };
    if (!next.frozen) next.stars = recount(db, b, next);
    saveEntry(db, next);
  }
  return changed;
}

/**
 * All reactions (or one emoji's) were cleared off a message or its board
 * post. Returns the boards whose post needs updating.
 */
export function sbClear(
  db: Db,
  input: {
    guildId: string;
    messageId: string;
    onPost: boolean;
    emoji?: string;
  },
  now = Date.now(),
) {
  const { config } = sbConfigOf(db, input.guildId);
  const changed: string[] = [];
  for (const e of sbEntriesOf(db, input.guildId, input.messageId)) {
    const b = boardOf(config, e.boardId);
    if (!b) continue;
    if (input.emoji && !sbIsStar(b, input.emoji)) continue;
    db.prepare(
      `DELETE FROM sb_reactors WHERE guild_id = ? AND board_id = ? AND message_id = ?
         AND on_post = ? AND (? = '' OR emoji = ?)`,
    ).run(
      input.guildId,
      b.id,
      e.messageId,
      input.onPost ? 1 : 0,
      input.emoji ? emojiKey(input.emoji) : '',
      input.emoji ? emojiKey(input.emoji) : '',
    );
    saveEntry(db, {
      ...e,
      stars: e.frozen ? e.stars : recount(db, b, e),
      updatedAt: now,
    });
    changed.push(b.id);
  }
  return changed;
}

type DiscordUser = { id: string; bot?: boolean };

/**
 * Counts the stars Discord already has on a message Sparko only just
 * noticed (from before it was watching, or while it was offline): the
 * people behind each of the board's emojis, on the message and its post.
 */
export async function sbRecount(
  rest: Rest,
  db: Db,
  guildId: string,
  boardId: string,
  messageId: string,
  { rolesOf }: { rolesOf?: (userId: string) => Promise<string[] | null> } = {},
) {
  const { config } = sbConfigOf(db, guildId);
  const b = boardOf(config, boardId);
  const e = getSbEntry(db, guildId, boardId, messageId);
  if (!b || !e) return null;
  const places = [
    { channelId: e.channelId, id: e.messageId, onPost: 0 },
    ...(e.postId && e.postChannelId
      ? [{ channelId: e.postChannelId, id: e.postId, onPost: 1 }]
      : []),
  ];
  const insert = db.prepare(
    `INSERT INTO sb_reactors (guild_id, board_id, message_id, user_id, emoji, on_post)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  );
  const roles = new Map<string, string[] | null>();
  for (const place of places)
    for (const emoji of b.emojis) {
      let after = '';
      // Up to 1,000 people per emoji, 100 at a time.
      for (let page = 0; page < 10; page++) {
        const users = await rest
          .get<
            DiscordUser[]
          >(`/channels/${place.channelId}/messages/${place.id}/reactions/${reactionPath(emoji)}?limit=100${after ? `&after=${after}` : ''}`)
          .catch(() => [] as DiscordUser[]);
        for (const u of users) {
          if (b.blockedRoles.length && !roles.has(u.id))
            roles.set(u.id, (await rolesOf?.(u.id)) ?? null);
          const reactor = {
            id: u.id,
            bot: !!u.bot,
            roles: roles.get(u.id) ?? null,
          };
          const blocked = sbIsBlocked(db, guildId, { userId: u.id });
          if (sbStarCounts(b, reactor, e.authorId, blocked))
            insert.run(
              guildId,
              b.id,
              messageId,
              u.id,
              emojiKey(emoji),
              place.onPost,
            );
        }
        if (users.length < 100) break;
        after = users.at(-1)!.id;
      }
    }
  const next = { ...e, stars: e.frozen ? e.stars : recount(db, b, e) };
  saveEntry(db, next);
  return next.stars;
}

// Posting ---------------------------------------------------------------------

const gone = (e: unknown) =>
  e instanceof DiscordError && e.code === DiscordCodes.unknownMessage;
const ignoreGone = (e: unknown) => {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.unknownMessage ||
      e.code === DiscordCodes.unknownChannel)
  )
    return;
  throw e;
};

/** A Discord error in plain words. */
function plain(e: unknown, b: SbBoard): never {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    throw new Plain(
      `Sparko can’t post in ${b.name}’s channel. Give it View Channel, Send Messages and Embed Links there.`,
    );
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    throw new Plain(`${b.name}’s channel no longer exists. Pick another one.`);
  if (e instanceof DiscordError && e.status === 400)
    throw new Plain(`Discord didn’t accept the post: ${e.message}`);
  throw e;
}

/** A board's post template: the server's, or Sparko's own. */
export function sbMessage(db: Db, guildId: string, b: SbBoard) {
  const t = b.message
    ? getTemplate<StudioMessage>(db, guildId, 'studio', b.message)
    : undefined;
  return normaliseStudio(t?.message ?? sbDefaultMessage());
}

const bodyOf = (db: Db, b: SbBoard, e: SbEntry, guildId: string, now: number) =>
  sbPayload(b, sbMessage(db, guildId, b), e, {
    now,
    guildId,
    server: serverVars(getGuild(db, guildId)),
  });

/** The highest milestone a count has passed. */
const milestoneAt = (n: number) =>
  sbMilestones.filter((m) => n >= m).at(-1) ?? 0;

/**
 * Makes a board match its stars: posts a message that reached the
 * threshold, edits the count on one already there, or takes it down when
 * it dropped below (if the board says so). Frozen posts stay as they are.
 * The bot calls this at most once per post every couple of seconds.
 */
export async function sbSync(
  rest: Rest,
  db: Db,
  guildId: string,
  boardId: string,
  messageId: string,
  now = Date.now(),
): Promise<'posted' | 'edited' | 'removed' | null> {
  const { on, config } = sbConfigOf(db, guildId);
  const b = boardOf(config, boardId);
  let e = getSbEntry(db, guildId, boardId, messageId);
  if (!on || !b || !e || e.frozen) return null;
  const show = e.stars >= b.threshold;
  const remember = (id: string) =>
    rememberPost(db, guildId, id, sbMessage(db, guildId, b), now);
  try {
    if (e.postId && e.postChannelId) {
      const path = `/channels/${e.postChannelId}/messages/${e.postId}`;
      if (!show && b.belowThreshold === 'remove') {
        // Forgotten first, so Discord's delete event isn't taken for staff.
        saveEntry(db, { ...e, postId: null, postChannelId: null, shown: 0 });
        await rest.delete(path).catch(ignoreGone);
        logFor(db, guildId, b, e, 'removed', sparkoActor, now, 'below');
        return 'removed';
      }
      if (e.shown === e.stars) return null;
      try {
        await rest.patch(path, bodyOf(db, b, e, guildId, now));
        remember(e.postId);
        const passed = sbMilestonesPassed(e.milestone, e.stars);
        saveEntry(db, {
          ...e,
          shown: e.stars,
          milestone: Math.max(e.milestone, milestoneAt(e.stars)),
        });
        for (const m of passed)
          logFor(
            db,
            guildId,
            b,
            { ...e, stars: m },
            'milestone',
            sparkoActor,
            now,
          );
        return 'edited';
      } catch (err) {
        // Someone deleted the post without Sparko noticing: post it again.
        if (!gone(err)) throw err;
        e = { ...e, postId: null, postChannelId: null, shown: 0 };
        saveEntry(db, e);
      }
    }
    if (!show || e.deleted) return null;
    const storage = sbStorage(db, guildId);
    if (!e.postedAt && storage.count >= storage.limit) {
      logFailure(
        db,
        guildId,
        b,
        e,
        'The server’s starboard storage is full, so new messages aren’t posted. Remove old ones in Storage.',
        now,
      );
      return null;
    }
    const sent = await rest
      .post<{
        id: string;
      }>(`/channels/${b.channel}/messages`, bodyOf(db, b, e, guildId, now))
      .catch((err: unknown) => plain(err, b));
    remember(sent.id);
    saveEntry(db, {
      ...e,
      postChannelId: b.channel,
      postId: sent.id,
      shown: e.stars,
      // Milestones already passed when it's first posted aren't logged.
      milestone: Math.max(e.milestone, milestoneAt(e.stars)),
      postedAt: e.postedAt ?? now,
    });
    logFor(db, guildId, b, e, 'posted', sparkoActor, now);
    return 'posted';
  } catch (err) {
    logFailure(
      db,
      guildId,
      b,
      e,
      err instanceof Plain ? err.message : 'Sparko couldn’t update the post.',
      now,
    );
    if (!(err instanceof Plain)) throw err;
    return null;
  }
}

// Staff -----------------------------------------------------------------------

/**
 * Staff took a message off a board. Its stars are forgotten too, so it only
 * comes back if it's starred enough again. Returns the post to take down.
 */
export function sbRemove(
  db: Db,
  guildId: string,
  boardId: string,
  messageId: string,
  by: SbStaff,
  now = Date.now(),
): SbLeftovers | null {
  const e = getSbEntry(db, guildId, boardId, messageId);
  if (!e) return null;
  const { config } = sbConfigOf(db, guildId);
  forgetEntry(db, guildId, boardId, messageId);
  logFor(db, guildId, boardOf(config, boardId), e, 'removed', by, now, 'staff');
  return postsOf([e]);
}

/** Freezes a post's count, or lets it count again. */
export function sbFreeze(
  db: Db,
  guildId: string,
  boardId: string,
  messageId: string,
  frozen: boolean,
  by: SbStaff,
  now = Date.now(),
) {
  const { config } = sbConfigOf(db, guildId);
  const b = boardOf(config, boardId);
  const e = getSbEntry(db, guildId, boardId, messageId);
  if (!b || !e) return null;
  if (e.frozen === frozen) return publicOf(e);
  // Unfrozen, it shows the stars it got in the meantime.
  const next = {
    ...e,
    frozen,
    stars: frozen ? e.stars : recount(db, b, e),
    updatedAt: now,
  };
  saveEntry(db, next);
  logFor(db, guildId, b, next, frozen ? 'frozen' : 'unfrozen', by, now);
  return publicOf(next);
}

/**
 * A message was deleted in Discord. A board post deleted by hand leaves the
 * board; an original either takes its posts with it or leaves them, as each
 * board says. Returns the posts to take down.
 */
export function sbMessageDeleted(
  db: Db,
  guildId: string,
  messageId: string,
  now = Date.now(),
): SbLeftovers {
  const { config } = sbConfigOf(db, guildId);
  const post = sbEntryByPost(db, messageId);
  if (post && post.guildId === guildId) {
    forgetEntry(db, guildId, post.boardId, post.messageId);
    logFor(
      db,
      guildId,
      boardOf(config, post.boardId),
      post,
      'removed',
      { id: '0', name: 'someone' },
      now,
      'staff',
    );
    return { posts: [] };
  }
  const takeDown: Stored[] = [];
  for (const e of sbEntriesOf(db, guildId, messageId)) {
    const b = boardOf(config, e.boardId);
    if (!b || b.onDelete === 'remove' || !e.postId) {
      forgetEntry(db, guildId, e.boardId, e.messageId);
      if (e.postId) {
        takeDown.push(e);
        logFor(db, guildId, b, e, 'removed', sparkoActor, now, 'deleted');
      }
    } else {
      // The post stays as it was; its stars can't change any more.
      db.prepare(
        'DELETE FROM sb_reactors WHERE guild_id = ? AND board_id = ? AND message_id = ?',
      ).run(guildId, e.boardId, e.messageId);
      saveEntry(db, { ...e, deleted: true, frozen: true, updatedAt: now });
    }
  }
  return postsOf(takeDown);
}

// Leaderboards ----------------------------------------------------------------

/** The most-starred messages on a board, optionally one member's. */
export function sbTop(
  db: Db,
  guildId: string,
  boardId: string,
  { authorId = '', limit = 10 }: { authorId?: string; limit?: number } = {},
) {
  return (
    db
      .prepare(
        `SELECT * FROM sb_entries WHERE guild_id = ? AND board_id = ? AND post_id IS NOT NULL
           AND (? = '' OR author_id = ?)
         ORDER BY stars DESC, message_at DESC LIMIT ?`,
      )
      .all(guildId, boardId, authorId, authorId, limit) as Row[]
  ).map((r) => publicOf(entryOf(r)));
}

/** A random message from a board. */
export function sbRandom(db: Db, guildId: string, boardId: string) {
  const r = db
    .prepare(
      `SELECT * FROM sb_entries WHERE guild_id = ? AND board_id = ? AND post_id IS NOT NULL
       ORDER BY RANDOM() LIMIT 1`,
    )
    .get(guildId, boardId) as Row | undefined;
  return r ? publicOf(entryOf(r)) : null;
}

/** Stars a member received (one per person per message) and gave. */
export function sbStats(db: Db, guildId: string, userId: string) {
  const received = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (SELECT DISTINCT r.message_id, r.user_id FROM sb_reactors r
         JOIN sb_entries e ON e.guild_id = r.guild_id AND e.board_id = r.board_id
           AND e.message_id = r.message_id
         WHERE r.guild_id = ? AND e.author_id = ?)`,
    )
    .get(guildId, userId) as { n: number };
  const given = db
    .prepare(
      `SELECT COUNT(DISTINCT message_id) AS n FROM sb_reactors
         WHERE guild_id = ? AND user_id = ?`,
    )
    .get(guildId, userId) as { n: number };
  const posts = db
    .prepare(
      `SELECT COUNT(DISTINCT message_id) AS n FROM sb_entries
         WHERE guild_id = ? AND author_id = ? AND posted_at IS NOT NULL`,
    )
    .get(guildId, userId) as { n: number };
  return { received: received.n, given: given.n, posts: posts.n };
}

/** Guilds with the starboard on. */
export function sbGuilds(db: Db) {
  return (
    db
      .prepare(
        'SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1',
      )
      .all(SB_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// Testing the post ------------------------------------------------------------

/** Posts a made-up starred message in a channel, so staff can see the post. */
export async function sbTestPost(
  rest: Rest,
  db: Db,
  guildId: string,
  boardId: string,
  channel: string,
  by: { id: string; name: string; avatar: string },
  now = Date.now(),
) {
  const { config } = sbConfigOf(db, guildId);
  const b = boardOf(config, boardId) ?? config.boards[0];
  if (!b) throw new Plain('Add a board first.');
  const sample = { ...sbSample(by, now, b.threshold), channelId: channel };
  const main = bodyOf(db, b, sample, guildId, now);
  const note = 'This is a test. Stars on it don’t count.';
  const body = main.flags
    ? {
        ...main,
        components: [
          { type: 10, content: `-# ${note}` },
          ...(main.components ?? []),
        ],
      }
    : { ...main, content: `-# ${note}\n${String(main.content ?? '')}`.trim() };
  await rest
    .post(`/channels/${channel}/messages`, body)
    .catch((err: unknown) => plain(err, b));
}
