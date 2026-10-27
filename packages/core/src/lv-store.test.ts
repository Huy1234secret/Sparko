import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import {
  LV_MODULE,
  listLvLog,
  lvApplyRewards,
  lvChangeXp,
  lvCrateStats,
  lvCrateSweep,
  lvCrates,
  lvDefault,
  lvDetail,
  lvDropCrate,
  lvGuilds,
  lvLeaderboard,
  lvMember,
  lvOnMessage,
  lvOpenCrate,
  lvRankOf,
  lvRankPayload,
  lvReset,
  lvRewardTargets,
  lvTestPost,
  lvVoiceMinute,
  type Levels,
} from './lv-store.ts';

const G = '1000';
const NOW = Date.parse('2026-06-01T12:00:00Z');

function setup(patch: Partial<Levels> = {}, on = true) {
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
    LV_MODULE,
    { on, config: { ...lvDefault('100'), ...patch } },
    0,
  );
  const discord = {
    roles: {} as Record<string, string[]>,
    messages: {} as Record<string, { components?: object[] }>,
    failPost: null as Error | null,
  };
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let next = 900;
  const run = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
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
    if (method === 'GET') return discord.messages[path] ?? {};
    if (method === 'POST' && path === '/users/@me/channels')
      return { id: 'dm1' };
    if (method === 'POST' && discord.failPost) throw discord.failPost;
    if (method === 'POST') {
      const id = String(next++);
      discord.messages[`${path}/${id}`] = body as { components?: object[] };
      return { id };
    }
    return undefined;
  };
  const rest = {
    get: vi.fn((p: string) => run('GET', p)),
    post: vi.fn((p: string, b: unknown) => run('POST', p, b)),
    put: vi.fn((p: string) => run('PUT', p)),
    delete: vi.fn((p: string) => run('DELETE', p)),
    patch: vi.fn((p: string, b: unknown) => run('PATCH', p, b)),
  } as unknown as Rest;
  const member = (id: string, roles: string[] = []) => ({
    id,
    name: `m${id}`,
    avatar: '',
    roles,
  });
  /** A message, with a roll that gives the smallest XP and never drops a crate. */
  const say = (id: string, at: number, channelId = '100', roles?: string[]) =>
    lvOnMessage(
      rest,
      db,
      G,
      member(id, roles),
      { channelId },
      {
        now: at,
        random: () => 0.99,
      },
    );
  const posts = (channel = '100') =>
    calls.filter(
      (c) => c.method === 'POST' && c.path === `/channels/${channel}/messages`,
    );
  return { db, rest, discord, calls, member, say, posts };
}

describe('XP for chatting', () => {
  it('gives XP once per cooldown, and counts messages', async () => {
    const { db, say } = setup({
      message: { on: true, min: 10, max: 10, cooldown: 60 },
    });
    expect((await say('1', NOW))?.gained?.amount).toBe(10);
    expect((await say('1', NOW + 30_000))?.gained).toBeNull();
    expect((await say('1', NOW + 60_000))?.gained?.amount).toBe(10);
    expect(lvMember(db, G, '1')).toMatchObject({ xp: 20, messages: 2 });
  });

  it('gives nothing when off, in no-XP channels, or with a no-XP role', async () => {
    expect(await setup({}, false).say('1', NOW)).toBeNull();
    const { say } = setup({ noXpChannels: ['200'], noXpRoles: ['9'] });
    expect(await say('1', NOW, '200')).toBeNull();
    expect(await say('1', NOW, '100', ['9'])).toBeNull();
  });

  it('boosts XP with roles and channels', async () => {
    const { db, say } = setup({
      message: { on: true, min: 10, max: 10, cooldown: 0 },
      boosts: [{ id: 'a', kind: 'role', target: '5', multiplier: 2 }],
    });
    await say('1', NOW, '100', ['5']);
    expect(lvMember(db, G, '1')?.xp).toBe(20);
  });

  it('announces a level-up where they chatted, pinging only them', async () => {
    const { db, say, posts } = setup({
      message: { on: true, min: 100, max: 100, cooldown: 0 },
    });
    const done = await say('1', NOW);
    expect(done?.gained).toMatchObject({ from: 0, to: 1 });
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).toMatchObject({
      allowed_mentions: { parse: [], users: ['1'] },
    });
    expect(listLvLog(db, G)[0]).toMatchObject({
      action: 'level-up',
      detail: 'reached level 1',
    });
  });

  it('announces in a picked channel, by DM, every Nth level, or not at all', async () => {
    const channel = setup({
      message: { on: true, min: 100, max: 100, cooldown: 0 },
      levelUp: { where: 'channel', channel: '777', template: '', every: 1 },
    });
    await channel.say('1', NOW);
    expect(channel.posts('777')).toHaveLength(1);

    const dm = setup({
      message: { on: true, min: 100, max: 100, cooldown: 0 },
      levelUp: { where: 'dm', channel: '', template: '', every: 1 },
    });
    await dm.say('1', NOW);
    expect(dm.posts('dm1')[0]!.body).toMatchObject({
      allowed_mentions: { parse: [] },
    });

    const every2 = setup({
      message: { on: true, min: 100, max: 100, cooldown: 0 },
      levelUp: { where: 'same', channel: '', template: '', every: 2 },
    });
    await every2.say('1', NOW);
    expect(every2.posts()).toHaveLength(0);

    const off = setup({
      message: { on: true, min: 100, max: 100, cooldown: 0 },
      levelUp: { where: 'off', channel: '', template: '', every: 1 },
    });
    await off.say('1', NOW);
    expect(off.posts()).toHaveLength(0);
  });

  it('logs a level-up message Discord refused', async () => {
    const { db, discord, say } = setup({
      message: { on: true, min: 100, max: 100, cooldown: 0 },
    });
    discord.failPost = new DiscordError(403, 50013, 'Missing Permissions');
    await say('1', NOW);
    expect(listLvLog(db, G)[0]).toMatchObject({
      action: 'failed',
      detail: expect.stringMatching(/can’t post the level-up message/),
    });
  });
});

describe('reward roles', () => {
  it('gives rewards on a level-up, and takes them back when XP drops', async () => {
    const { db, rest, discord, say } = setup({
      message: { on: true, min: 255, max: 255, cooldown: 0 },
      rewards: [
        { id: 'a', level: 1, role: '51' },
        { id: 'b', level: 2, role: '52' },
      ],
    });
    discord.roles['1'] = [];
    await say('1', NOW);
    expect(discord.roles['1']).toEqual(['51', '52']);
    lvChangeXp(db, G, { id: '1', name: 'm1', avatar: '' }, 'set', 120, {
      id: '9',
      name: 'quinn',
    });
    await lvApplyRewards(rest, db, G, '1');
    expect(discord.roles['1']).toEqual(['51']);
    expect(listLvLog(db, G)[0]).toMatchObject({ action: 'reward-removed' });
  });

  it('leaves members who left alone', async () => {
    const { db, rest } = setup({
      rewards: [{ id: 'a', level: 1, role: '51' }],
    });
    lvChangeXp(db, G, { id: '2', name: 'm2', avatar: '' }, 'give', 500, {
      id: '9',
      name: 'quinn',
    });
    expect(await lvApplyRewards(rest, db, G, '2')).toEqual({
      given: [],
      taken: [],
    });
  });
});

describe('XP for voice', () => {
  it('gives each member a minute of XP, with boosts', async () => {
    const { db, rest } = setup({
      voice: { on: true, perMinute: 4, needOthers: true, skipMuted: true },
      boosts: [{ id: 'a', kind: 'channel', target: '300', multiplier: 1.5 }],
    });
    const given = await lvVoiceMinute(
      rest,
      db,
      G,
      [
        {
          id: '1',
          name: 'a',
          avatar: '',
          roles: [],
          place: { channelId: '300' },
        },
        {
          id: '2',
          name: 'b',
          avatar: '',
          roles: [],
          place: { channelId: '301' },
        },
      ],
      { now: NOW },
    );
    expect(given).toBe(2);
    expect(lvMember(db, G, '1')).toMatchObject({ xp: 6, voiceMinutes: 1 });
    expect(lvMember(db, G, '2')).toMatchObject({ xp: 4, voiceMinutes: 1 });
  });

  it('gives nothing while voice XP is off', async () => {
    const { db, rest } = setup({
      voice: { on: false, perMinute: 4, needOthers: true, skipMuted: true },
    });
    expect(
      await lvVoiceMinute(rest, db, G, [
        {
          id: '1',
          name: 'a',
          avatar: '',
          roles: [],
          place: { channelId: '300' },
        },
      ]),
    ).toBe(0);
  });
});

describe('the leaderboard and staff changes', () => {
  it('ranks members by XP and finds anyone by name', () => {
    const { db } = setup();
    const by = { id: '9', name: 'quinn' };
    lvChangeXp(db, G, { id: '1', name: 'ayo', avatar: '' }, 'give', 300, by);
    lvChangeXp(db, G, { id: '2', name: 'rhea', avatar: '' }, 'give', 900, by);
    lvChangeXp(db, G, { id: '3', name: 'kit', avatar: '' }, 'give', 0, by);
    const board = lvLeaderboard(db, G);
    expect(board.rows.map((r) => [r.rank, r.name, r.level])).toEqual([
      [1, 'rhea', 4],
      [2, 'ayo', 2],
    ]);
    expect(board.count).toBe(2);
    expect(lvLeaderboard(db, G, { query: 'ki' }).rows).toMatchObject([
      { name: 'kit', rank: null },
    ]);
    expect(lvRankOf(db, G, '1')).toBe(2);
    expect(lvRewardTargets(db, G)).toEqual(['2', '1']);
    expect(lvDetail(db, G, '1')).toMatchObject({
      xp: 300,
      level: 2,
      rank: 2,
      into: 45,
    });
  });

  it('gives, takes and sets XP without going below 0, then resets', () => {
    const { db } = setup();
    const by = { id: '9', name: 'quinn' };
    const who = { id: '1', name: 'ayo', avatar: '' };
    expect(lvChangeXp(db, G, who, 'give', 300, by)).toMatchObject({
      after: 300,
      to: 2,
    });
    expect(lvChangeXp(db, G, who, 'take', 500, by).after).toBe(0);
    expect(lvChangeXp(db, G, who, 'set', 120, by).after).toBe(120);
    expect(listLvLog(db, G)[0]!.detail).toMatch(/set to 120 by @quinn/);
    expect(lvReset(db, G, null, by)).toEqual(['1']);
    expect(lvMember(db, G, '1')?.xp).toBe(0);
    expect(listLvLog(db, G)[0]).toMatchObject({
      action: 'reset',
      userName: 'everyone',
    });
  });
});

describe('XP crates', () => {
  const crates = {
    ...lvDefault().crates,
    on: true,
    chance: 100,
    min: 40,
    max: 40,
  };

  it('drops one by chance, then waits for the cooldown', async () => {
    const { db, rest, posts } = setup({ crates });
    const drop = (at: number, roll: number) =>
      lvOnMessage(
        rest,
        db,
        G,
        { id: '1', name: 'm1', avatar: '', roles: [] },
        {
          channelId: '100',
        },
        { now: at, random: () => roll },
      );
    expect((await drop(NOW, 0))?.crate).toMatchObject({ xp: 40 });
    expect((await drop(NOW + 60_000, 0))?.crate).toBeNull();
    expect((await drop(NOW + 11 * 60_000, 0))?.crate).toMatchObject({
      xp: 40,
    });
    const body = posts().at(-1)!.body as { components: object[] };
    expect(JSON.stringify(body.components.at(-1))).toContain('lv:crate');
    expect(lvCrates(db, G)).toHaveLength(2);
  });

  it('goes to the first to open it, once', async () => {
    const { db, rest } = setup({ crates });
    await lvDropCrate(rest, db, G, '100', { now: NOW });
    const messageId = lvCrates(db, G)[0]!.messageId!;
    const first = await lvOpenCrate(
      rest,
      db,
      G,
      messageId,
      {
        id: '1',
        name: 'kit',
        avatar: '',
        roles: [],
      },
      { now: NOW + 1000 },
    );
    expect(first).toMatchObject({ result: 'won', won: 40, total: 40 });
    const second = await lvOpenCrate(
      rest,
      db,
      G,
      messageId,
      {
        id: '2',
        name: 'rhea',
        avatar: '',
        roles: [],
      },
      { now: NOW + 2000 },
    );
    expect(second).toEqual({ result: 'taken', by: 'kit' });
    expect(lvMember(db, G, '1')?.xp).toBe(40);
    expect(lvCrateStats(db, G)).toEqual({ dropped: 1, opened: 1, xp: 40 });
  });

  it('vanishes after its time, and its button greys out', async () => {
    const { db, rest, calls } = setup({ crates });
    await lvDropCrate(rest, db, G, '100', { now: NOW });
    expect(await lvCrateSweep(rest, db, NOW + 30_000)).toBe(0);
    expect(await lvCrateSweep(rest, db, NOW + 60_000)).toBe(1);
    expect(lvCrates(db, G)[0]!.state).toBe('expired');
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(JSON.stringify(patch?.body)).toContain('Nobody opened it in time');
    const late = await lvOpenCrate(
      rest,
      db,
      G,
      lvCrates(db, G)[0]!.messageId!,
      { id: '1', name: 'kit', avatar: '', roles: [] },
      { now: NOW + 61_000 },
    );
    expect(late).toEqual({ result: 'gone' });
    expect(listLvLog(db, G)[0]).toMatchObject({ action: 'crate-expired' });
  });
});

describe('rank cards and tests', () => {
  it('fills in the member’s rank card', () => {
    const { db } = setup();
    lvChangeXp(db, G, { id: '1', name: 'ayo', avatar: '' }, 'give', 300, {
      id: '9',
      name: 'q',
    });
    const card = JSON.stringify(
      lvRankPayload(db, G, { id: '1', name: 'ayo', avatar: '' }),
    );
    expect(card).toContain('Level 2 · Rank #1');
    expect(card).toContain('300 / 475 XP');
  });

  it('posts a test with a note, and explains Discord’s refusals', async () => {
    const { db, rest, discord, posts } = setup();
    await lvTestPost(rest, db, G, '100', 'crate', {
      id: '1',
      name: 'ayo',
      avatar: '',
    });
    expect(JSON.stringify(posts()[0]!.body)).toContain('This is a test');
    discord.failPost = new DiscordError(403, 50013, 'Missing Permissions');
    await expect(
      lvTestPost(rest, db, G, '100', 'rank', {
        id: '1',
        name: 'a',
        avatar: '',
      }),
    ).rejects.toThrow(/can’t post the rank card/);
  });

  it('lists servers with levels on', () => {
    expect(lvGuilds(setup().db)).toEqual([G]);
    expect(lvGuilds(setup({}, false).db)).toEqual([]);
  });
});
