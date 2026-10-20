import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  addTemplate,
  bdDefault,
  BD_MODULE,
  claimJob,
  DiscordError,
  finishJob,
  INV_MODULE,
  invDefault,
  invRefresh,
  invJoined,
  openDb,
  Perm,
  sgDefault,
  SG_MODULE,
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
let perms = Perm.viewChannel | Perm.sendMessages | Perm.embedLinks;
const view = (): GuildView => ({
  perms,
  channels: [
    {
      id: '501',
      name: 'invites',
      category: 'Community',
      canPost: true,
      canThread: false,
    },
  ],
  roles: [
    {
      id: '301',
      name: 'Recruiter',
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
let uses = 0;
const fakeDiscord = {
  get: async (path: string) => {
    if (path.endsWith('/invites'))
      return [
        {
          code: 'plaza',
          uses,
          max_uses: 0,
          created_at: '2026-01-01T00:00:00Z',
          expires_at: null,
          inviter: { id: '555', username: 'mia' },
          channel: { id: '501', name: 'invites' },
        },
      ];
    if (path.endsWith('/vanity-url')) return { code: null, uses: 0 };
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
  config: ReturnType<typeof invDefault>;
  count: number;
  canSeeInvites: boolean;
  limits: { rewards: number };
  roles: { id: string }[];
  log: { action: string; detail: string }[];
};
type Detail = {
  member: { userId: string; name: string; bonus: number; total: number };
  invitedBy: { inviterId: string } | null;
  invited: { userId: string }[];
};

describe('invites API', () => {
  it('checks and saves the settings, then queues the bot', async () => {
    const state = await body<State>(await call('/9001/invites'));
    expect(state).toMatchObject({
      on: false,
      count: 0,
      log: [],
      canSeeInvites: false,
      limits: { rewards: 3 },
    });
    expect(state.roles.map((r) => r.id)).toEqual(['301', '302']);
    expect(
      await problem(
        await put('/9001/invites', { on: true, config: state.config }),
      ),
    ).toBe('Pick the channel the join message is posted in.');
    const config = {
      ...state.config,
      join: { on: true, channel: '501', template: '' },
    };
    expect(
      await problem(
        await put('/9001/invites', {
          on: true,
          config: {
            ...config,
            rewards: [{ id: 'a', invites: 5, role: '302' }],
          },
        }),
      ),
    ).toMatch(/Sparko can’t give the role for reward 1/);
    const four = [1, 2, 3, 4].map((n) => ({
      id: `r${n}`,
      invites: n,
      role: '301',
    }));
    expect(
      await problem(
        await put('/9001/invites', {
          on: true,
          config: { ...config, rewards: four },
        }),
      ),
    ).toBe('This plan has up to 3 reward roles.');
    expect(
      await problem(
        await put('/9001/invites', {
          on: true,
          config: {
            ...config,
            leave: { on: true, channel: '501', template: '42' },
          },
        }),
      ),
    ).toMatch(/leave message template was deleted/);
    expect(await problem(await put('/9001/invites', { config }))).toMatch(
      /on or off/,
    );
    const ok = await put('/9001/invites', {
      on: true,
      config: {
        ...config,
        rewards: [{ id: 'a', invites: 1, role: '301' }],
        extra: 1,
      },
    });
    expect(ok.status).toBe(204);
    expect(jobOf('invites')).not.toBeNull();
    const saved = await body<State>(await call('/9001/invites'));
    expect(saved.on).toBe(true);
    expect(saved.config.rewards).toEqual([
      { id: 'a', invites: 1, role: '301' },
    ]);
    expect(saved.config).not.toHaveProperty('extra');
  });

  it('says whether Sparko can see invites', async () => {
    perms |= Perm.manageGuild;
    expect((await body<State>(await call('/9001/invites'))).canSeeInvites).toBe(
      true,
    );
  });

  it('won’t take a command name another module uses', async () => {
    const config = (await body<State>(await call('/9001/invites'))).config;
    const sg = sgDefault('501');
    sg.commands.suggest.name = 'invites';
    writeModule(db, '9001', SG_MODULE, { on: true, config: sg }, 0);
    expect(
      await problem(await put('/9001/invites', { on: true, config })),
    ).toBe(
      '/invites is already a suggestion command. Pick another name in Commands.',
    );
    writeModule(db, '9001', SG_MODULE, { on: false }, 0);
    const bd = bdDefault('501');
    bd.commands.group.name = 'invites';
    writeModule(db, '9001', BD_MODULE, { on: true, config: bd }, 0);
    expect(
      await problem(await put('/9001/invites', { on: true, config })),
    ).toBe(
      '/invites is already the birthday command. Pick another name in Commands.',
    );
    writeModule(db, '9001', BD_MODULE, { on: false }, 0);
    expect((await put('/9001/invites', { on: true, config })).status).toBe(204);
  });

  it('lists the leaderboard, a member’s invites and the invite codes', async () => {
    await invRefresh(fakeDiscord, db, '9001', 1000);
    uses = 1;
    await invJoined(
      fakeDiscord,
      db,
      '9001',
      { id: '700', name: 'pip', avatar: '', createdAt: -400 * 86_400_000 },
      { now: 2000 },
    );
    type Board = {
      rows: { userId: string; rank: number; total: number }[];
      count: number;
    };
    const board = await body<Board>(await call('/9001/invites/leaderboard'));
    expect(board.rows).toMatchObject([{ userId: '555', rank: 1, total: 1 }]);
    expect(
      (await body<Board>(await call('/9001/invites/leaderboard?q=pip'))).rows,
    ).toMatchObject([{ userId: '700', rank: null }]);
    const mia = await body<Detail>(await call('/9001/invites/members/555'));
    expect(mia.member).toMatchObject({ name: 'mia', total: 1 });
    expect(mia.invited.map((j) => j.userId)).toEqual(['700']);
    const pip = await body<Detail>(await call('/9001/invites/members/700'));
    expect(pip.invitedBy?.inviterId).toBe('555');
    type Codes = {
      codes: { code: string; uses: number }[];
      syncedAt: number;
    };
    const codes = await body<Codes>(await call('/9001/invites/codes'));
    expect(codes.codes).toMatchObject([{ code: 'plaza', uses: 1 }]);
    expect(codes.syncedAt).toBe(2000);
  });

  it('gives bonuses, finds members and resets, queueing reward roles', async () => {
    expect(
      await problem(
        await postJson('/9001/invites/members/555/bonus', { amount: 0 }),
      ),
    ).toMatch(/whole number/);
    const res = await postJson('/9001/invites/members/556/bonus', {
      amount: 4,
    });
    expect(res.status).toBe(200);
    expect((await body<Detail>(res)).member).toMatchObject({
      name: 'Kit',
      bonus: 4,
      total: 4,
    });
    expect(jobOf('invites-rewards')?.payload).toEqual({ userIds: ['556'] });
    expect(
      await problem(
        await postJson('/9001/invites/members/999/bonus', { amount: 1 }),
      ),
    ).toBe('That member isn’t in the server.');
    type Found = { members: { userId: string; total: number }[] };
    expect(
      (await body<Found>(await call('/9001/invites/find?q=mia'))).members,
    ).toMatchObject([{ userId: '555', total: 1 }]);
    expect(
      (await body<Found>(await call('/9001/invites/find?q='))).members,
    ).toEqual([]);

    const reset = await postJson('/9001/invites/members/556/reset');
    expect((await body<Detail>(reset)).member.total).toBe(0);
    expect(jobOf('invites-rewards')?.payload).toEqual({ userIds: ['556'] });
    expect((await postJson('/9001/invites/reset')).status).toBe(204);
    expect(jobOf('invites-rewards')?.payload).toEqual({ userIds: ['555'] });
    const log = (await body<State>(await call('/9001/invites'))).log;
    expect(log.map((e) => e.action).slice(0, 3)).toEqual([
      'reset',
      'reset',
      'bonus',
    ]);
  });

  it('queues test messages', async () => {
    expect(
      await problem(
        await postJson('/9001/invites/test', { channel: '501', kind: 'boost' }),
      ),
    ).toMatch(/join or the leave/);
    expect(
      (await postJson('/9001/invites/test', { channel: '501', kind: 'leave' }))
        .status,
    ).toBe(204);
    expect(jobOf('invites-test')?.payload).toMatchObject({
      channel: '501',
      kind: 'leave',
      userName: 'Quinn',
    });
  });

  it('tags the templates invite tracking uses in Message Studio', async () => {
    const id = addTemplate(
      db,
      {
        guildId: '9001',
        moduleId: 'studio',
        name: 'Hello',
        who: 'Quinn',
        message: studioDefault('501'),
      },
      0,
    );
    const config = (await body<State>(await call('/9001/invites'))).config;
    writeModule(
      db,
      '9001',
      INV_MODULE,
      {
        on: true,
        config: {
          ...config,
          leave: { on: true, channel: '501', template: id },
        },
      },
      0,
    );
    type Studio = {
      templates: { id: string; usedIn: { kind: string; where: string }[] }[];
    };
    const studio = await body<Studio>(await call('/9001/studio'));
    expect(studio.templates.find((t) => t.id === id)?.usedIn).toEqual([
      { kind: 'invite', where: 'Invite tracking (Leave message)' },
    ]);
  });
});
