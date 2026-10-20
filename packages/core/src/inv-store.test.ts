import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import { addTemplate } from './templates.ts';
import { studioDefault } from './studio-format.ts';
import {
  INV_MODULE,
  codeFromDiscord,
  invApplyRewards,
  invBonus,
  invCodeAdded,
  invCodeRemoved,
  invCountsOf,
  invDefault,
  invGuilds,
  invJoined,
  invLeaderboard,
  invLeft,
  invRefresh,
  invReset,
  invRewardTargets,
  invState,
  invTestPost,
  invitedBy,
  invitedList,
  listCodes,
  listInvLog,
  storedCodes,
  type Invites,
} from './inv-store.ts';

const G = '1000';
const D = 86_400_000;
const NOW = Date.parse('2026-06-01T12:00:00Z');

/** An invite as Discord's API sends it. */
const invite = (
  code: string,
  uses: number,
  inviter: string | null = '1',
  extra: object = {},
) => ({
  code,
  uses,
  max_uses: 0,
  created_at: '2026-01-01T00:00:00Z',
  expires_at: null,
  inviter: inviter
    ? { id: inviter, username: `user${inviter}`, global_name: null }
    : undefined,
  channel: { id: '100', name: 'general' },
  ...extra,
});

function setup(patch: Partial<Invites> = {}) {
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
  writeModule(
    db,
    G,
    INV_MODULE,
    { on: true, config: { ...invDefault('100'), ...patch } },
    0,
  );
  const discord = {
    invites: [invite('aaa', 3), invite('bbb', 0, '2')] as object[],
    vanity: null as { code: string; uses: number } | null,
    roles: {} as Record<string, string[]>,
    noAccess: false,
    failPost: null as Error | null,
  };
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const run = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path.endsWith('/invites')) {
      if (discord.noAccess)
        throw new DiscordError(403, 50013, 'Missing Permissions');
      return structuredClone(discord.invites);
    }
    if (method === 'GET' && path.endsWith('/vanity-url'))
      return discord.vanity ?? { code: null, uses: 0 };
    const member = path.match(/\/members\/(\d+)$/)?.[1];
    if (method === 'GET' && member) {
      if (!discord.roles[member])
        throw new DiscordError(404, 10007, 'Unknown Member');
      return { roles: discord.roles[member] };
    }
    const role = path.match(/\/members\/(\d+)\/roles\/(\d+)$/);
    if (role) {
      const list = (discord.roles[role[1]!] ??= []);
      if (method === 'PUT') list.push(role[2]!);
      else discord.roles[role[1]!] = list.filter((r) => r !== role[2]);
      return undefined;
    }
    if (method === 'POST' && discord.failPost) throw discord.failPost;
    return { id: '900' };
  };
  const rest = {
    get: vi.fn((p: string) => run('GET', p)),
    post: vi.fn((p: string, b: unknown) => run('POST', p, b)),
    put: vi.fn((p: string) => run('PUT', p)),
    delete: vi.fn((p: string) => run('DELETE', p)),
    patch: vi.fn((p: string, b: unknown) => run('PATCH', p, b)),
  } as unknown as Rest;
  const member = (id: string, ageDays = 400) => ({
    id,
    name: `m${id}`,
    avatar: '',
    createdAt: NOW - ageDays * D,
  });
  /** Someone joins using an invite: its uses go up first, as in Discord. */
  const join = async (id: string, code: string | null, ageDays = 400) => {
    if (code)
      discord.invites = discord.invites.map((i) =>
        (i as { code: string }).code === code
          ? { ...i, uses: (i as { uses: number }).uses + 1 }
          : i,
      );
    return invJoined(rest, db, G, member(id, ageDays), { now: NOW });
  };
  const leave = (id: string) => invLeft(rest, db, G, member(id), { now: NOW });
  const posts = () =>
    calls.filter(
      (c) => c.method === 'POST' && c.path === '/channels/100/messages',
    );
  return { db, rest, discord, calls, join, leave, posts, member };
}

describe('remembering invites', () => {
  it('reads the server’s invites and the vanity link', async () => {
    const t = setup();
    t.discord.vanity = { code: 'plaza', uses: 40 };
    expect(await invRefresh(t.rest, t.db, G, NOW)).toBe(true);
    expect(listCodes(t.db, G, NOW).map((c) => c.code)).toEqual(['aaa', 'bbb']);
    expect(invState(t.db, G)).toMatchObject({
      vanityCode: 'plaza',
      vanityUses: 40,
      canList: true,
      syncedAt: NOW,
    });
  });
  it('says when Sparko can’t see invites', async () => {
    const t = setup();
    t.discord.noAccess = true;
    expect(await invRefresh(t.rest, t.db, G, NOW)).toBe(false);
    expect(invState(t.db, G).canList).toBe(false);
  });
  it('follows invites made and deleted, keeping a used-up one a moment', async () => {
    const t = setup();
    await invRefresh(t.rest, t.db, G, NOW);
    invCodeAdded(
      t.db,
      G,
      codeFromDiscord(invite('once', 0, '3', { max_uses: 1 })),
    );
    expect(storedCodes(t.db, G)).toHaveLength(3);
    invCodeRemoved(t.db, G, 'once', NOW);
    // Hidden from the list, but still there to work out the join.
    expect(listCodes(t.db, G, NOW + 1).map((c) => c.code)).not.toContain(
      'once',
    );
    expect(storedCodes(t.db, G).map((c) => c.code)).toContain('once');
    invCodeRemoved(t.db, G, 'bbb', NOW);
    expect(storedCodes(t.db, G).map((c) => c.code)).not.toContain('bbb');
  });
  it('turns Discord’s invite into Sparko’s', () => {
    expect(
      codeFromDiscord(
        invite('x', 2, '5', {
          max_uses: 10,
          expires_at: '2026-07-01T00:00:00Z',
        }),
      ),
    ).toEqual({
      code: 'x',
      inviterId: '5',
      inviterName: 'user5',
      channelId: '100',
      channelName: 'general',
      uses: 2,
      maxUses: 10,
      expiresAt: Date.parse('2026-07-01T00:00:00Z'),
      createdAt: Date.parse('2026-01-01T00:00:00Z'),
    });
  });
});

describe('joins', () => {
  it('credits the inviter whose invite was used, and posts the join message', async () => {
    const t = setup();
    await invRefresh(t.rest, t.db, G, NOW);
    expect(await t.join('50', 'aaa')).toMatchObject({
      type: 'normal',
      inviterId: '1',
      code: 'aaa',
      fake: false,
      counted: true,
    });
    expect(invCountsOf(t.db, G, '1')).toMatchObject({
      regular: 1,
      total: 1,
      name: 'user1',
    });
    expect(invitedBy(t.db, G, '50')).toMatchObject({
      inviterId: '1',
      code: 'aaa',
      type: 'normal',
    });
    const [sent] = t.posts();
    expect(JSON.stringify(sent!.body)).toContain(
      '<@50> was invited by <@1>, who now has **1** invites.',
    );
    expect(sent!.body).toMatchObject({ allowed_mentions: { parse: [] } });
    expect(listInvLog(t.db, G)[0]).toMatchObject({
      action: 'joined',
      detail: 'invited by @user1 with aaa (4 uses)',
    });
  });

  it('labels vanity and unknown joins, and joins Sparko can’t see', async () => {
    const t = setup();
    t.discord.vanity = { code: 'plaza', uses: 40 };
    await invRefresh(t.rest, t.db, G, NOW);
    t.discord.vanity = { code: 'plaza', uses: 41 };
    expect((await t.join('51', null))?.type).toBe('vanity');
    expect((await t.join('52', null))?.type).toBe('unknown');
    t.discord.noAccess = true;
    expect((await t.join('53', null))?.type).toBe('unknown');
    const log = listInvLog(t.db, G).map((e) => e.detail);
    expect(log).toEqual([
      'Sparko can’t see invites without Manage Server',
      'Sparko couldn’t tell which invite they used',
      'with the vanity link (41 uses)',
    ]);
    expect(JSON.stringify(t.posts()[0]!.body)).toContain('the vanity link');
    expect(invLeaderboard(t.db, G).rows).toEqual([]);
  });

  it('credits a one-use invite Discord deleted as it was used', async () => {
    const t = setup();
    t.discord.invites.push(invite('once', 0, '2', { max_uses: 1 }));
    await invRefresh(t.rest, t.db, G, NOW);
    t.discord.invites = t.discord.invites.filter(
      (i) => (i as { code: string }).code !== 'once',
    );
    invCodeRemoved(t.db, G, 'once', NOW);
    expect(await t.join('50', null)).toMatchObject({
      type: 'normal',
      inviterId: '2',
      code: 'once',
    });
  });

  it('counts new accounts as fake, and leaves, with each subtracted once', async () => {
    const t = setup({ fakeAge: '7d' });
    await invRefresh(t.rest, t.db, G, NOW);
    await t.join('50', 'aaa');
    await t.join('51', 'aaa', 2);
    await t.join('52', 'aaa', 1);
    await t.leave('50');
    await t.leave('52');
    // 3 regular; 50 and 52 left; 51 is fake (52 was fake too, but left).
    expect(invCountsOf(t.db, G, '1')).toMatchObject({
      regular: 3,
      left: 2,
      fake: 1,
      total: 0,
    });
    writeModule(
      t.db,
      G,
      INV_MODULE,
      {
        on: true,
        config: { ...invDefault('100'), subtractLeaves: false },
      },
      0,
    );
    // Leaves don't count against them now; the fake who left still does.
    expect(invCountsOf(t.db, G, '1')).toMatchObject({
      left: 2,
      fake: 2,
      total: 1,
    });
  });

  it('doesn’t count rejoins again, giving the first inviter their invite back', async () => {
    const t = setup();
    await invRefresh(t.rest, t.db, G, NOW);
    await t.join('50', 'aaa');
    await t.leave('50');
    expect(invCountsOf(t.db, G, '1').total).toBe(0);
    expect((await t.join('50', 'bbb'))?.counted).toBe(false);
    expect(invCountsOf(t.db, G, '1')).toMatchObject({ regular: 1, total: 1 });
    expect(invCountsOf(t.db, G, '2').regular).toBe(0);
    expect(listInvLog(t.db, G)[0]!.detail).toMatch(
      /rejoined, still counted for @user1/,
    );
    // The join message names whoever it counts for.
    expect(JSON.stringify(t.posts().at(-1)!.body)).toContain('by <@1>');
    // Leaving again takes it away again.
    await t.leave('50');
    expect(invCountsOf(t.db, G, '1').total).toBe(0);
  });

  it('counts rejoins when the setting says so', async () => {
    const t = setup({ countRejoins: true });
    await invRefresh(t.rest, t.db, G, NOW);
    await t.join('50', 'aaa');
    await t.leave('50');
    expect((await t.join('50', 'aaa'))?.counted).toBe(true);
    expect(invCountsOf(t.db, G, '1')).toMatchObject({
      regular: 2,
      left: 1,
      total: 1,
    });
  });

  it('does nothing while the module is off', async () => {
    const t = setup();
    writeModule(t.db, G, INV_MODULE, { on: false }, 0);
    expect(await t.join('50', 'aaa')).toBeNull();
    expect(await t.leave('50')).toBeNull();
    expect(t.calls).toHaveLength(0);
    expect(invGuilds(t.db)).toEqual([]);
  });

  it('logs a join message Discord refused', async () => {
    const t = setup();
    await invRefresh(t.rest, t.db, G, NOW);
    t.discord.failPost = new DiscordError(403, 50013, 'Missing Permissions');
    await t.join('50', 'aaa');
    expect(listInvLog(t.db, G)[0]).toMatchObject({
      action: 'failed',
      detail: expect.stringMatching(/can’t post the join message/),
    });
  });
});

describe('leaves', () => {
  it('posts the leave message with who had invited them', async () => {
    const t = setup({
      leave: { on: true, channel: '100', template: '' },
    });
    await invRefresh(t.rest, t.db, G, NOW);
    await t.join('50', 'aaa');
    await t.join('51', 'aaa');
    expect(await t.leave('50')).toEqual({ inviterId: '1' });
    expect(JSON.stringify(t.posts().at(-1)!.body)).toContain(
      'm50 had been invited by <@1>, who now has **1** invites.',
    );
    expect(listInvLog(t.db, G)[0]).toMatchObject({
      action: 'left',
      detail: 'invited by @user1, who now has 1',
    });
    expect(invitedBy(t.db, G, '50')?.leftAt).toBe(NOW);
    await t.leave('77');
    expect(listInvLog(t.db, G)[0]!.detail).toBe(
      'Sparko doesn’t know who invited them',
    );
  });
});

describe('the leaderboard, bonuses and resets', () => {
  async function busy() {
    const t = setup();
    await invRefresh(t.rest, t.db, G, NOW);
    await t.join('50', 'aaa');
    await t.join('51', 'aaa');
    await t.join('52', 'bbb');
    return t;
  }
  it('ranks inviters and finds members who only joined', async () => {
    const t = await busy();
    const board = invLeaderboard(t.db, G);
    expect(board.rows.map((r) => [r.rank, r.userId, r.total])).toEqual([
      [1, '1', 2],
      [2, '2', 1],
    ]);
    expect(board.count).toBe(2);
    const found = invLeaderboard(t.db, G, { query: 'm51' });
    expect(found.rows).toMatchObject([{ userId: '51', rank: null, total: 0 }]);
    expect(invLeaderboard(t.db, G, { query: 'user2' }).rows[0]!.rank).toBe(2);
    const paged = invLeaderboard(t.db, G, { size: 1, page: 9 });
    expect(paged).toMatchObject({ page: 2, pages: 2, total: 2 });
    expect(invitedList(t.db, G, '1').map((j) => j.userId)).toEqual([
      '51',
      '50',
    ]);
    expect(invRewardTargets(t.db, G)).toEqual(['1', '2']);
  });
  it('adds and takes bonus invites', async () => {
    const t = await busy();
    expect(
      invBonus(
        t.db,
        G,
        { id: '2', name: 'x', avatar: '' },
        5,
        { id: '9', name: 'quinn' },
        NOW,
      ),
    ).toMatchObject({ bonus: 5, total: 6 });
    invBonus(
      t.db,
      G,
      { id: '2', name: 'x', avatar: '' },
      -2,
      { id: '9', name: 'quinn' },
      NOW,
    );
    expect(invCountsOf(t.db, G, '2').bonus).toBe(3);
    expect(listInvLog(t.db, G)[0]!.detail).toBe(
      '-2 by @quinn, 3 bonus and 4 in total',
    );
    // Someone with only a bonus is on the leaderboard.
    invBonus(
      t.db,
      G,
      { id: '60', name: 'pip', avatar: '' },
      1,
      { id: '9', name: 'q' },
      NOW,
    );
    expect(invLeaderboard(t.db, G).rows.map((r) => r.userId)).toContain('60');
  });
  it('resets one member or everyone, keeping who invited whom', async () => {
    const t = await busy();
    invBonus(
      t.db,
      G,
      { id: '2', name: 'x', avatar: '' },
      5,
      { id: '9', name: 'q' },
      NOW,
    );
    expect(invReset(t.db, G, '1', { id: '9', name: 'quinn' }, NOW)).toEqual([
      '1',
    ]);
    expect(invCountsOf(t.db, G, '1').total).toBe(0);
    expect(invCountsOf(t.db, G, '2').total).toBe(6);
    expect(invitedBy(t.db, G, '50')?.inviterId).toBe('1');
    expect(listInvLog(t.db, G)[0]).toMatchObject({
      action: 'reset',
      userName: 'user1',
    });
    expect(invReset(t.db, G, null, { id: '9', name: 'quinn' }, NOW)).toEqual([
      '2',
    ]);
    expect(invLeaderboard(t.db, G).rows).toEqual([]);
    // A member who reset and then leaves doesn't lose another.
    await t.leave('50');
    expect(invCountsOf(t.db, G, '1').total).toBe(0);
  });
});

describe('reward roles', () => {
  const rewards = [
    { id: 'a', invites: 1, role: '701' },
    { id: 'b', invites: 2, role: '702' },
  ];
  it('gives rewards as invites come in and takes them back', async () => {
    const t = setup({ rewards });
    t.discord.roles['1'] = [];
    await invRefresh(t.rest, t.db, G, NOW);
    await t.join('50', 'aaa');
    expect(t.discord.roles['1']).toEqual(['701']);
    await t.join('51', 'aaa');
    expect(t.discord.roles['1']).toEqual(['701', '702']);
    await t.leave('51');
    expect(t.discord.roles['1']).toEqual(['701']);
    const log = listInvLog(t.db, G).map((e) => e.action);
    expect(log).toContain('reward-given');
    expect(log).toContain('reward-removed');
  });
  it('keeps only the highest reward when asked', async () => {
    const t = setup({ rewards, stackRewards: false });
    t.discord.roles['1'] = ['701'];
    invBonus(
      t.db,
      G,
      { id: '1', name: 'r', avatar: '' },
      2,
      { id: '9', name: 'q' },
      NOW,
    );
    expect(
      await invApplyRewards(t.rest, t.db, G, '1', {
        now: NOW,
        roleName: (id) => (id === '702' ? 'Recruiter' : undefined),
      }),
    ).toEqual({ given: ['702'], taken: ['701'] });
    expect(listInvLog(t.db, G)[1]!.detail).toBe(
      '@Recruiter for 2 invites (now 2)',
    );
  });
  it('leaves members who aren’t in the server, and logs roles it can’t give', async () => {
    const t = setup({ rewards });
    invBonus(
      t.db,
      G,
      { id: '1', name: 'r', avatar: '' },
      3,
      { id: '9', name: 'q' },
      NOW,
    );
    expect(await invApplyRewards(t.rest, t.db, G, '1', { now: NOW })).toEqual({
      given: [],
      taken: [],
    });
    const failing = {
      ...t.rest,
      put: vi.fn(async () => {
        throw new DiscordError(403, 50013, 'Missing Permissions');
      }),
    } as unknown as Rest;
    expect(
      await invApplyRewards(failing, t.db, G, '1', { now: NOW, roles: [] }),
    ).toEqual({ given: [], taken: [] });
    expect(listInvLog(t.db, G)[0]).toMatchObject({
      action: 'failed',
      detail: expect.stringMatching(/couldn’t give @a reward role/),
    });
  });
});

describe('test messages', () => {
  it('posts the saved template with a note, as a made-up join', async () => {
    const t = setup();
    const id = addTemplate(
      t.db,
      {
        guildId: G,
        moduleId: 'studio',
        name: 'Mine',
        who: 'q',
        message: {
          ...studioDefault('100'),
          layout: 'embed',
          embeds: [],
          content: '{user} via {inviter} with {invite.code}',
        },
      },
      0,
    );
    writeModule(
      t.db,
      G,
      INV_MODULE,
      {
        on: true,
        config: {
          ...invDefault('100'),
          join: { on: true, channel: '100', template: id },
        },
      },
      0,
    );
    await invTestPost(t.rest, t.db, G, '200', 'join', {
      id: '9',
      name: 'quinn',
      avatar: '',
    });
    expect(t.calls.at(-1)).toMatchObject({
      path: '/channels/200/messages',
      body: {
        content:
          '-# This is a test. Nobody joined or left.\n<@9> via <@9> with sparko',
      },
    });
    t.discord.failPost = new DiscordError(404, 10003, 'Unknown Channel');
    await expect(
      invTestPost(t.rest, t.db, G, '200', 'leave', {
        id: '9',
        name: 'q',
        avatar: '',
      }),
    ).rejects.toThrow('The leave channel no longer exists. Pick another one.');
  });
});
