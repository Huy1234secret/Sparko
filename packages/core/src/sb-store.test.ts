import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import {
  SB_MODULE,
  getSbEntry,
  listSbEntries,
  listSbLog,
  sbBlockedList,
  sbBlockMember,
  sbBlockMessage,
  sbBoardDefault,
  sbClear,
  sbDefault,
  sbFreeze,
  sbIsBlocked,
  sbMessageDeleted,
  sbPruneBoards,
  sbRandom,
  sbRecount,
  sbRemove,
  sbRemovePosts,
  sbStats,
  sbStorage,
  sbSync,
  sbTestPost,
  sbTop,
  sbTrack,
  sbUnblock,
  type SbBoard,
  type SbMessage,
  type SbTrackInput,
  type Starboard,
} from './sb-store.ts';

const G = '1000';
const D = 86_400_000;
const NOW = 100 * D;
const staff = { id: '42', name: 'rhea' };

function setup(
  boards: Partial<SbBoard>[] = [{}],
  patch: Partial<Starboard> = {},
  plan = 'plus',
) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    {
      id: G,
      name: 'Pixel Plaza',
      icon: null,
      memberCount: 10,
      installed: true,
    },
    0,
  );
  db.prepare('UPDATE guilds SET plan = ? WHERE id = ?').run(plan, G);
  const config: Starboard = {
    ...sbDefault(),
    boards: boards.map((b, i) =>
      sbBoardDefault(String(100 + i), { id: i ? `b${i}` : 'main', ...b }),
    ),
    ...patch,
  };
  writeModule(db, G, SB_MODULE, { on: true, config }, 0);
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let id = 900;
  const rest = {
    get: vi.fn(async () => []),
    post: vi.fn(async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body });
      return { id: String(id++) };
    }),
    patch: vi.fn(async (path: string, body: unknown) => {
      calls.push({ method: 'PATCH', path, body });
      return {};
    }),
    put: vi.fn(async (path: string) => {
      calls.push({ method: 'PUT', path });
    }),
    delete: vi.fn(async (path: string) => {
      calls.push({ method: 'DELETE', path });
    }),
  } as unknown as Rest & {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  return { db, rest, calls };
}

const message = (patch: Partial<SbMessage> = {}): SbMessage => ({
  id: '300',
  channelId: '200',
  parentId: null,
  nsfw: false,
  authorId: '5',
  authorName: 'ayo',
  authorAvatar: 'https://cdn.discordapp.com/a.png',
  authorBot: false,
  authorRoles: [],
  content: 'Look at this cat',
  image: '',
  length: 16,
  createdAt: NOW - D,
  ...patch,
});

type T = ReturnType<typeof setup>;
const react = (
  t: T,
  user: string,
  patch: Partial<SbTrackInput> = {},
  now = NOW,
) =>
  sbTrack(
    t.db,
    {
      guildId: G,
      message: message(),
      reactor: { id: user, bot: false, roles: [] },
      emoji: '⭐',
      added: true,
      onPost: false,
      boardNsfw: () => false,
      ...patch,
    },
    now,
  );
const sync = (t: T, board = 'main', now = NOW) =>
  sbSync(t.rest, t.db, G, board, '300', now);
const stars = (t: T, board = 'main') =>
  getSbEntry(t.db, G, board, '300')?.stars;

describe('counting stars', () => {
  it('posts once a message reaches the threshold, then edits the count', async () => {
    const t = setup();
    react(t, '7');
    react(t, '8');
    expect(await sync(t)).toBeNull();
    expect(t.calls).toEqual([]);
    expect(react(t, '9')).toEqual([{ boardId: 'main', recount: false }]);
    expect(await sync(t)).toBe('posted');
    const post = t.calls.find((c) => c.path === '/channels/100/messages')!;
    expect(JSON.stringify(post.body)).toContain('Jump to message');
    expect(JSON.stringify(post.body)).toContain('⭐ **3**');
    expect(getSbEntry(t.db, G, 'main', '300')).toMatchObject({
      stars: 3,
      postId: '900',
      postChannelId: '100',
    });
    expect(listSbLog(t.db, G)[0]).toMatchObject({
      action: 'posted',
      stars: 3,
      authorName: 'ayo',
      boardName: 'Starboard',
    });
    // Nothing changed, so nothing is edited.
    expect(await sync(t)).toBeNull();
    react(t, '10');
    expect(await sync(t)).toBe('edited');
    expect(t.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      path: '/channels/100/messages/900',
    });
    expect(JSON.stringify(t.calls.at(-1)!.body)).toContain('⭐ **4**');
    expect(sbStorage(t.db, G)).toMatchObject({ count: 1, usedKb: 2 });
  });

  it('counts each member once, whatever emojis they use', () => {
    const t = setup([{ emojis: ['⭐', '🌟'] }]);
    react(t, '7');
    react(t, '7', { emoji: '🌟' });
    expect(stars(t)).toBe(1);
    // Taking one off still leaves the other.
    react(t, '7', { emoji: '⭐', added: false });
    expect(stars(t)).toBe(1);
    react(t, '7', { emoji: '🌟', added: false });
    expect(stars(t)).toBe(0);
    // Other emojis aren't stars.
    expect(react(t, '8', { emoji: '👍' })).toEqual([]);
  });

  it('follows the rules on who and what counts', () => {
    const t = setup([{ blockedRoles: ['66'] }]);
    react(t, '5'); // the author
    react(t, '7', { reactor: { id: '7', bot: true, roles: [] } });
    react(t, '8', { reactor: { id: '8', bot: false, roles: ['66'] } });
    expect(stars(t)).toBeUndefined();
    react(t, '9');
    expect(stars(t)).toBe(1);
    // Messages in an unwatched place don't get an entry at all.
    expect(
      react(t, '9', { message: message({ id: '301', channelId: '100' }) }),
    ).toEqual([]);
    expect(
      react(t, '9', { message: message({ id: '302', authorBot: true }) }),
    ).toEqual([]);
  });

  it('drops a post below the threshold, or keeps it when the board says so', async () => {
    const t = setup([
      { threshold: 2 },
      { threshold: 2, belowThreshold: 'keep' },
    ]);
    react(t, '7');
    react(t, '8');
    expect(await sync(t)).toBe('posted');
    expect(await sync(t, 'b1')).toBe('posted');
    react(t, '8', { added: false });
    expect(await sync(t)).toBe('removed');
    expect(t.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/channels/100/messages/900',
    });
    expect(listSbLog(t.db, G)[0]).toMatchObject({
      action: 'removed',
      detail: 'below',
      stars: 1,
    });
    expect(await sync(t, 'b1')).toBe('edited');
    expect(getSbEntry(t.db, G, 'b1', '300')?.postId).toBe('901');
    // Starred again, it comes back.
    react(t, '9');
    expect(await sync(t)).toBe('posted');
  });

  it('logs milestones on the way up, not ones passed before posting', async () => {
    const t = setup([{ threshold: 12 }]);
    for (let i = 0; i < 12; i++) react(t, `u${i}`);
    await sync(t);
    expect(listSbLog(t.db, G).map((e) => e.action)).toEqual(['posted']);
    for (let i = 12; i < 26; i++) react(t, `u${i}`);
    await sync(t);
    expect(listSbLog(t.db, G)[0]).toMatchObject({
      action: 'milestone',
      stars: 25,
    });
  });

  it('works as a hall of fame with a second, higher board', async () => {
    const t = setup([{ threshold: 2 }, { name: 'Hall of fame', threshold: 3 }]);
    react(t, '7');
    expect(react(t, '8').map((c) => c.boardId)).toEqual(['main', 'b1']);
    expect(await sync(t)).toBe('posted');
    expect(await sync(t, 'b1')).toBeNull();
    react(t, '9');
    expect(await sync(t, 'b1')).toBe('posted');
    expect(t.calls.at(-1)!.path).toBe('/channels/101/messages');
  });

  it('counts stars on the board post as stars on the message', async () => {
    const t = setup([{ threshold: 1 }]);
    react(t, '7');
    await sync(t);
    react(t, '7', { onPost: true });
    expect(stars(t)).toBe(1);
    react(t, '8', { onPost: true });
    expect(stars(t)).toBe(2);
    // Clearing the post's reactions leaves the message's.
    expect(
      sbClear(t.db, { guildId: G, messageId: '300', onPost: true }),
    ).toEqual(['main']);
    expect(stars(t)).toBe(1);
    sbClear(t.db, { guildId: G, messageId: '300', onPost: false, emoji: '⭐' });
    expect(stars(t)).toBe(0);
  });

  it('counts stars Discord had before Sparko saw them', async () => {
    const t = setup([{ blockedRoles: ['66'] }]);
    t.rest.get.mockImplementation(async (path: string) =>
      path.includes('/messages/300/')
        ? [
            { id: '7' },
            { id: '8' },
            { id: '5' },
            { id: '6', bot: true },
            { id: '9' },
          ]
        : [],
    );
    const changes = react(t, '7', { discordCount: 5 });
    expect(changes).toEqual([{ boardId: 'main', recount: true }]);
    const rolesOf = vi.fn(async (id: string) => (id === '9' ? ['66'] : []));
    // The author, the bot and the blocked role don't count.
    expect(await sbRecount(t.rest, t.db, G, 'main', '300', { rolesOf })).toBe(
      2,
    );
    expect(t.rest.get).toHaveBeenCalledWith(
      `/channels/200/messages/300/reactions/${encodeURIComponent('⭐')}?limit=100`,
    );
  });

  it('stops counting while frozen, then catches up', async () => {
    const t = setup([{ threshold: 1 }]);
    react(t, '7');
    await sync(t);
    expect(sbFreeze(t.db, G, 'main', '300', true, staff, NOW)).toMatchObject({
      frozen: true,
      stars: 1,
    });
    react(t, '8');
    react(t, '9');
    expect(stars(t)).toBe(1);
    expect(await sync(t)).toBeNull();
    expect(sbFreeze(t.db, G, 'main', '300', false, staff, NOW)?.stars).toBe(3);
    expect(await sync(t)).toBe('edited');
    expect(listSbLog(t.db, G).map((e) => e.action)).toEqual([
      'unfrozen',
      'frozen',
      'posted',
    ]);
  });

  it('posts again if the post was deleted without Sparko noticing', async () => {
    const t = setup([{ threshold: 1 }]);
    react(t, '7');
    await sync(t);
    t.rest.patch.mockRejectedValueOnce(
      new DiscordError(404, 10008, 'Unknown Message'),
    );
    react(t, '8');
    expect(await sync(t)).toBe('posted');
    expect(getSbEntry(t.db, G, 'main', '300')?.postId).toBe('901');
  });

  it('logs a post Discord refuses, once', async () => {
    const t = setup([{ threshold: 1 }]);
    t.rest.post.mockRejectedValue(
      new DiscordError(403, 50013, 'Missing Permissions'),
    );
    react(t, '7');
    expect(await sync(t)).toBeNull();
    react(t, '8');
    expect(await sync(t)).toBeNull();
    const failed = listSbLog(t.db, G).filter((e) => e.action === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.detail).toMatch(/can’t post in Starboard’s channel/);
  });

  it('stops posting new messages when storage is full', async () => {
    const t = setup([{ threshold: 1 }], {}, 'free');
    db_fill(t, 5120);
    react(t, '7');
    expect(await sync(t)).toBeNull();
    expect(listSbLog(t.db, G)[0]?.detail).toMatch(/storage is full/);
  });

  it('forgets messages that waited too long for stars', () => {
    const t = setup();
    react(t, '7', {}, NOW);
    react(t, '7', { message: message({ id: '301' }) }, NOW + 31 * D);
    expect(getSbEntry(t.db, G, 'main', '300')).toBeNull();
    expect(getSbEntry(t.db, G, 'main', '301')).not.toBeNull();
  });
});

function db_fill(t: T, n: number) {
  const insert = t.db.prepare(
    `INSERT INTO sb_entries (guild_id, board_id, message_id, channel_id, author_id,
       message_at, posted_at, updated_at) VALUES (?, 'main', ?, '200', '1', 0, 0, 0)`,
  );
  for (let i = 0; i < n; i++) insert.run(G, `f${i}`);
}

describe('deleted messages', () => {
  it('takes posts down with the original, or keeps them', async () => {
    const t = setup([{ threshold: 1 }, { threshold: 1, onDelete: 'keep' }]);
    react(t, '7');
    await sync(t);
    await sync(t, 'b1');
    const left = sbMessageDeleted(t.db, G, '300', NOW);
    expect(left).toEqual({ posts: [{ channelId: '100', messageId: '900' }] });
    expect(getSbEntry(t.db, G, 'main', '300')).toBeNull();
    expect(getSbEntry(t.db, G, 'b1', '300')).toMatchObject({
      deleted: true,
      frozen: true,
      postId: '901',
    });
    expect(listSbLog(t.db, G)[0]).toMatchObject({
      action: 'removed',
      detail: 'deleted',
    });
    await sbRemovePosts(t.rest, left);
    expect(t.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/channels/100/messages/900',
    });
  });

  it('a board post deleted by hand leaves the board', async () => {
    const t = setup([{ threshold: 1 }]);
    react(t, '7');
    await sync(t);
    expect(sbMessageDeleted(t.db, G, '900', NOW)).toEqual({ posts: [] });
    expect(getSbEntry(t.db, G, 'main', '300')).toBeNull();
    expect(listSbLog(t.db, G)[0]).toMatchObject({
      action: 'removed',
      detail: 'staff',
    });
  });
});

describe('staff', () => {
  it('removes a message from the board, forgetting its stars', async () => {
    const t = setup([{ threshold: 1 }]);
    react(t, '7');
    await sync(t);
    expect(sbRemove(t.db, G, 'main', '300', staff, NOW)).toEqual({
      posts: [{ channelId: '100', messageId: '900' }],
    });
    expect(getSbEntry(t.db, G, 'main', '300')).toBeNull();
    expect(listSbLog(t.db, G)[0]).toMatchObject({
      action: 'removed',
      detail: 'staff',
      userName: 'rhea',
    });
    expect(sbRemove(t.db, G, 'main', '300', staff, NOW)).toBeNull();
  });

  it('blocks a message from every board, and lets it back', async () => {
    const t = setup([{ threshold: 1 }, { threshold: 1 }]);
    react(t, '7');
    await sync(t);
    await sync(t, 'b1');
    const left = sbBlockMessage(
      t.db,
      G,
      { messageId: '300', channelId: '200' },
      staff,
      NOW,
    );
    expect(left.posts).toHaveLength(2);
    expect(sbBlockedList(t.db, G)).toMatchObject([
      { kind: 'message', id: '300', name: 'ayo', preview: 'Look at this cat' },
    ]);
    expect(react(t, '8')).toEqual([]);
    expect(sbUnblock(t.db, G, 'message', '300', staff, NOW)).toBe(true);
    expect(react(t, '8')).toHaveLength(2);
    expect(listSbLog(t.db, G).map((e) => e.action)).toContain('unblocked');
  });

  it('blocks a member: their messages stay off and their stars don’t count', () => {
    const t = setup();
    expect(sbBlockMember(t.db, G, { id: '5', name: 'ayo' }, staff, NOW)).toBe(
      true,
    );
    expect(sbBlockMember(t.db, G, { id: '5', name: 'ayo' }, staff, NOW)).toBe(
      false,
    );
    expect(sbIsBlocked(t.db, G, { userId: '5' })).toBe(true);
    expect(react(t, '7')).toEqual([]);
    sbBlockMember(t.db, G, { id: '8', name: 'kit' }, staff, NOW);
    expect(
      react(t, '8', { message: message({ id: '301', authorId: '6' }) }),
    ).toEqual([]);
    expect(listSbLog(t.db, G)[0]).toMatchObject({
      action: 'blocked',
      authorName: 'kit',
      messageId: '',
    });
  });
});

describe('leaderboards and storage', () => {
  it('lists the top, a random one and a member’s stats', async () => {
    const t = setup([{ threshold: 1 }]);
    react(t, '7');
    react(t, '8');
    await sync(t);
    const other = message({
      id: '301',
      authorId: '6',
      authorName: 'kit',
      createdAt: NOW,
    });
    react(t, '7', { message: other });
    await sbSync(t.rest, t.db, G, 'main', '301', NOW);
    expect(sbTop(t.db, G, 'main').map((e) => [e.messageId, e.stars])).toEqual([
      ['300', 2],
      ['301', 1],
    ]);
    expect(sbTop(t.db, G, 'main', { authorId: '6' })).toHaveLength(1);
    expect(['300', '301']).toContain(sbRandom(t.db, G, 'main')?.messageId);
    expect(sbStats(t.db, G, '5')).toEqual({ received: 2, given: 0, posts: 1 });
    expect(sbStats(t.db, G, '7')).toEqual({ received: 0, given: 2, posts: 0 });
    expect(
      listSbEntries(t.db, G, { sort: 'newest' }).map((e) => e.messageId),
    ).toEqual(['301', '300']);
    expect(listSbEntries(t.db, G, { query: 'kit' })).toHaveLength(1);
    expect(listSbEntries(t.db, G, { query: 'cat' })).toHaveLength(2);
    expect(listSbEntries(t.db, G, { board: 'other' })).toHaveLength(0);
  });

  it('forgets the messages of removed boards', async () => {
    const t = setup([{}, {}]);
    react(t, '7');
    sbPruneBoards(t.db, G, ['b1']);
    expect(getSbEntry(t.db, G, 'main', '300')).toBeNull();
    expect(getSbEntry(t.db, G, 'b1', '300')).not.toBeNull();
  });

  it('posts a test message with a note', async () => {
    const t = setup();
    await sbTestPost(
      t.rest,
      t.db,
      G,
      'main',
      '555',
      { id: '42', name: 'rhea', avatar: '' },
      NOW,
    );
    const body = t.calls.at(-1)!.body as { content: string };
    expect(t.calls.at(-1)!.path).toBe('/channels/555/messages');
    expect(body.content).toMatch(/^-# This is a test/);
    expect(body.content).toContain('⭐ **3**');
  });
});
