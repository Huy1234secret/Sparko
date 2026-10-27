import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  addTemplate,
  claimJob,
  DiscordError,
  finishJob,
  INV_MODULE,
  invDefault,
  LV_MODULE,
  lvChangeXp,
  lvDefault,
  lvDropCrate,
  openDb,
  Perm,
  studioDefault,
  upsertGuild,
  writeModule,
  type GuildView,
  type Rest,
} from '@sparko/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from './api.ts';

const site = 'https://panel.example';
const db = openDb(':memory:');
const guild = {
  id: '9001',
  name: 'Pixel Plaza',
  icon: null,
  owner: true,
  permissions: '0',
};
const view = (): GuildView => ({
  perms: Perm.viewChannel | Perm.sendMessages | Perm.embedLinks,
  channels: [
    {
      id: '501',
      name: 'general',
      category: 'Community',
      canPost: true,
      canThread: false,
    },
  ],
  roles: [
    {
      id: '301',
      name: 'Regular',
      color: 0x57f287,
      color2: null,
      managed: false,
      assignable: true,
    },
    {
      id: '302',
      name: 'Admin',
      color: 0,
      color2: null,
      managed: false,
      assignable: false,
    },
  ],
});
const auth = {
  access: async (req: { headers: { cookie?: string } }, id: string) =>
    !req.headers.cookie
      ? { status: 401 as const }
      : id === guild.id
        ? {
            status: 200 as const,
            user: { id: 'u1', name: 'Quinn', avatarUrl: '' },
            guild,
          }
        : { status: 403 as const },
};

/** A pretend Discord: members 555 and 556 are in the server. */
const members: Record<string, object> = {
  '555': {
    nick: 'Mia',
    user: { id: '555', username: 'mia', global_name: null, avatar: 'abc' },
  },
  '556': {
    nick: null,
    user: { id: '556', username: 'kit', global_name: 'Kit', avatar: null },
  },
};
const fakeDiscord = {
  get: async (path: string) => {
    if (path.includes('/members/search'))
      return Object.values(members).filter((m) =>
        JSON.stringify(m).toLowerCase().includes('mia'),
      );
    const id = path.match(/\/members\/(\d+)$/)?.[1];
    if (id && members[id]) return members[id];
    throw new DiscordError(404, 10007, 'Unknown Member');
  },
  post: async () => ({ id: '1' }),
  put: async () => undefined,
  delete: async () => undefined,
} as unknown as Rest;

let server: Server;
let base: string;
beforeAll(async () => {
  upsertGuild(
    db,
    {
      id: '9001',
      name: 'Pixel Plaza',
      icon: null,
      memberCount: 80,
      installed: true,
    },
    0,
  );
  const api = createApi({
    db,
    auth: auth as never,
    views: { get: async () => view(), refresh: async () => view() },
    discord: fakeDiscord,
    publicUrl: site,
    applyWaitMs: 400,
  });
  server = createServer((req, res) => {
    void api(req, res).then((handled) => {
      if (!handled) res.writeHead(418).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/servers`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

const call = (path: string, init: RequestInit = {}) =>
  fetch(base + path, {
    ...init,
    headers: { cookie: 's=1', origin: site, ...init.headers },
  });
const body = async <T>(res: Response) => (await res.json()) as T;
const put = (path: string, data: unknown) =>
  call(path, { method: 'PUT', body: JSON.stringify(data) });
const postJson = (path: string, data: unknown = {}) =>
  call(path, { method: 'POST', body: JSON.stringify(data) });
const problem = async (res: Response) =>
  (await body<{ message: string }>(res)).message;
/** The next job of a kind, finishing any others before it. */
const jobOf = (kind: string) => {
  for (let job = claimJob(db); job; job = claimJob(db)) {
    finishJob(db, job.id, null, Date.now());
    if (job.kind === kind) return job;
  }
  return null;
};

type State = {
  on: boolean;
  config: ReturnType<typeof lvDefault>;
  count: number;
  limits: { rewards: number; boosts: number };
  crates: { dropped: number; opened: number };
  roles: { id: string }[];
  log: { action: string; detail: string }[];
};
type Detail = { userId: string; name: string; xp: number; level: number };

describe('levels API', () => {
  it('checks and saves the settings, then queues the bot', async () => {
    const state = await body<State>(await call('/9001/levels'));
    expect(state).toMatchObject({
      on: false,
      count: 0,
      log: [],
      limits: { rewards: 5, boosts: 3 },
      crates: { dropped: 0, opened: 0 },
    });
    const config = state.config;
    expect(
      await problem(
        await put('/9001/levels', {
          on: true,
          config: {
            ...config,
            rewards: [{ id: 'a', level: 5, role: '302' }],
          },
        }),
      ),
    ).toMatch(/Sparko can’t give the role for reward 1/);
    expect(
      await problem(
        await put('/9001/levels', {
          on: true,
          config: { ...config, noXpChannels: ['999'] },
        }),
      ),
    ).toMatch(/no-XP channels was deleted/);
    expect(
      await problem(
        await put('/9001/levels', {
          on: true,
          config: { ...config, rank: { template: '42', public: true } },
        }),
      ),
    ).toMatch(/rank card template was deleted/);
    expect(await problem(await put('/9001/levels', { config }))).toMatch(
      /on or off/,
    );
    const ok = await put('/9001/levels', {
      on: true,
      config: {
        ...config,
        rewards: [{ id: 'a', level: 5, role: '301' }],
        extra: 1,
      },
    });
    expect(ok.status).toBe(204);
    expect(jobOf('levels')?.payload).toEqual({ rewards: true });
    const saved = await body<State>(await call('/9001/levels'));
    expect(saved.on).toBe(true);
    expect(saved.config.rewards).toEqual([{ id: 'a', level: 5, role: '301' }]);
    expect(saved.config).not.toHaveProperty('extra');
    expect(
      (await put('/9001/levels', { on: true, config: saved.config })).status,
    ).toBe(204);
    expect(jobOf('levels')?.payload).toEqual({ rewards: false });
  });

  it('won’t take a command name another module uses', async () => {
    const config = (await body<State>(await call('/9001/levels'))).config;
    const inv = invDefault('501');
    inv.commands.group.name = 'leaderboard';
    writeModule(db, '9001', INV_MODULE, { on: true, config: inv }, 0);
    expect(await problem(await put('/9001/levels', { on: true, config }))).toBe(
      '/leaderboard is already another module’s command. Pick another name in Commands.',
    );
    writeModule(db, '9001', INV_MODULE, { on: false }, 0);
    expect((await put('/9001/levels', { on: true, config })).status).toBe(204);
  });

  it('lists the leaderboard, a member and the crates', async () => {
    lvChangeXp(
      db,
      '9001',
      { id: '555', name: 'Mia', avatar: '' },
      'give',
      300,
      {
        id: 'u1',
        name: 'Quinn',
      },
    );
    type Board = { rows: { userId: string; rank: number; level: number }[] };
    expect(
      (await body<Board>(await call('/9001/levels/leaderboard'))).rows,
    ).toMatchObject([{ userId: '555', rank: 1, level: 2 }]);
    expect(
      await body<Detail>(await call('/9001/levels/members/555')),
    ).toMatchObject({ name: 'Mia', xp: 300, level: 2 });
    await lvDropCrate(fakeDiscord, db, '9001', '501', { now: 1000 });
    type Crates = {
      crates: { channelId: string }[];
      stats: { dropped: number };
    };
    const crates = await body<Crates>(await call('/9001/levels/crates'));
    expect(crates.stats.dropped).toBe(1);
    expect(crates.crates).toMatchObject([{ channelId: '501' }]);
  });

  it('gives, takes and sets XP, finds members and resets', async () => {
    expect(
      await problem(
        await postJson('/9001/levels/members/556/xp', {
          mode: 'give',
          amount: 0,
        }),
      ),
    ).toMatch(/whole number of XP from 1/);
    expect(
      await problem(
        await postJson('/9001/levels/members/556/xp', {
          mode: 'double',
          amount: 5,
        }),
      ),
    ).toMatch(/give, take or set/);
    const res = await postJson('/9001/levels/members/556/xp', {
      mode: 'give',
      amount: 120,
    });
    expect(await body<Detail>(res)).toMatchObject({
      name: 'Kit',
      xp: 120,
      level: 1,
    });
    expect(jobOf('levels-rewards')?.payload).toEqual({ userIds: ['556'] });
    expect(
      (
        await body<Detail>(
          await postJson('/9001/levels/members/556/xp', {
            mode: 'set',
            amount: 0,
          }),
        )
      ).xp,
    ).toBe(0);
    expect(jobOf('levels-rewards')?.payload).toEqual({ userIds: ['556'] });
    expect(
      await problem(
        await postJson('/9001/levels/members/999/xp', {
          mode: 'give',
          amount: 1,
        }),
      ),
    ).toBe('That member isn’t in the server.');
    type Found = { members: { userId: string; xp: number }[] };
    expect(
      (await body<Found>(await call('/9001/levels/find?q=mia'))).members,
    ).toMatchObject([{ userId: '555', xp: 300 }]);
    const reset = await postJson('/9001/levels/members/555/reset');
    expect((await body<Detail>(reset)).xp).toBe(0);
    expect(jobOf('levels-rewards')?.payload).toEqual({ userIds: ['555'] });
    expect((await postJson('/9001/levels/reset')).status).toBe(204);
    const log = (await body<State>(await call('/9001/levels'))).log;
    expect(log[0]).toMatchObject({ action: 'reset' });
  });

  it('queues test messages', async () => {
    expect(
      await problem(
        await postJson('/9001/levels/test', { channel: '501', kind: 'boost' }),
      ),
    ).toMatch(/level-up message, the rank card or the XP crate/);
    expect(
      (await postJson('/9001/levels/test', { channel: '501', kind: 'rank' }))
        .status,
    ).toBe(204);
    expect(jobOf('levels-test')?.payload).toMatchObject({
      channel: '501',
      kind: 'rank',
      userName: 'Quinn',
    });
  });

  it('tags the templates Levels & XP uses in Message Studio', async () => {
    const id = addTemplate(
      db,
      {
        guildId: '9001',
        moduleId: 'studio',
        name: 'Level up',
        who: 'Quinn',
        message: studioDefault('501'),
      },
      0,
    );
    const config = (await body<State>(await call('/9001/levels'))).config;
    writeModule(
      db,
      '9001',
      LV_MODULE,
      {
        on: true,
        config: { ...config, levelUp: { ...config.levelUp, template: id } },
      },
      0,
    );
    type Studio = {
      templates: { id: string; usedIn: { kind: string; where: string }[] }[];
    };
    const studio = await body<Studio>(await call('/9001/studio'));
    expect(studio.templates.find((t) => t.id === id)?.usedIn).toEqual([
      { kind: 'level', where: 'Levels & XP (level-up message)' },
    ]);
  });
});
