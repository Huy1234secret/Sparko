import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  addTemplate,
  BD_MODULE,
  claimJob,
  DiscordError,
  finishJob,
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
const view = (): GuildView => ({
  perms: Perm.viewChannel | Perm.sendMessages | Perm.embedLinks,
  channels: [
    {
      id: '501',
      name: 'birthdays',
      category: 'Community',
      canPost: true,
      canThread: false,
    },
  ],
  roles: [
    {
      id: '301',
      name: 'Birthday',
      color: 0xf472b6,
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
  config: Record<string, unknown> & {
    commands: { group: { name: string } };
    messages: Record<string, string>;
  };
  count: number;
  roles: { id: string }[];
  log: { action: string; detail: string }[];
};
type List = {
  birthdays: {
    userId: string;
    name: string;
    day: number;
    year: number | null;
  }[];
  upcoming: { userId: string; next: { days: number } }[];
  count: number;
};

describe('birthdays API', () => {
  it('checks and saves the settings, then queues the bot', async () => {
    const state = await body<State>(await call('/9001/birthdays'));
    expect(state).toMatchObject({ on: false, count: 0, log: [] });
    expect(state.roles.map((r) => r.id)).toEqual(['301', '302']);
    expect(
      await problem(
        await put('/9001/birthdays', { on: true, config: state.config }),
      ),
    ).toBe('Pick the channel birthdays are announced in.');
    const config = { ...state.config, channel: '501' };
    expect(
      await problem(
        await put('/9001/birthdays', {
          on: true,
          config: { ...config, role: '302' },
        }),
      ),
    ).toMatch(/Sparko can’t give the birthday role/);
    expect(
      await problem(
        await put('/9001/birthdays', {
          on: true,
          config: { ...config, timeZone: 'Atlantis/Capital' },
        }),
      ),
    ).toMatch(/time zone/);
    expect(
      await problem(
        await put('/9001/birthdays', {
          on: true,
          config: { ...config, messages: { ...config.messages, dm: '999' } },
        }),
      ),
    ).toMatch(/birthday DM template was deleted/);
    expect(await problem(await put('/9001/birthdays', { config }))).toMatch(
      /on or off/,
    );
    const ok = await put('/9001/birthdays', {
      on: true,
      config: { ...config, role: '301', timeZone: 'Europe/London', extra: 1 },
    });
    expect(ok.status).toBe(204);
    expect(jobOf('birthdays')).not.toBeNull();
    const saved = await body<State>(await call('/9001/birthdays'));
    expect(saved.on).toBe(true);
    expect(saved.config).toMatchObject({
      role: '301',
      timeZone: 'Europe/London',
    });
    expect(saved.config).not.toHaveProperty('extra');
  });

  it('won’t take a command name a suggestion command uses', async () => {
    const config = (await body<State>(await call('/9001/birthdays'))).config;
    const sg = sgDefault('501');
    sg.commands.suggest.name = 'birthday';
    writeModule(db, '9001', SG_MODULE, { on: true, config: sg }, 0);
    expect(
      await problem(await put('/9001/birthdays', { on: true, config })),
    ).toBe(
      '/birthday is already a suggestion command. Pick another name in Commands.',
    );
    writeModule(db, '9001', SG_MODULE, { on: false }, 0);
    expect((await put('/9001/birthdays', { on: true, config })).status).toBe(
      204,
    );
  });

  it('finds members, and lets staff add, change and remove birthdays', async () => {
    type Found = {
      members: { userId: string; name: string; saved: boolean }[];
    };
    expect(
      (await body<Found>(await call('/9001/birthdays/members?q=mia'))).members,
    ).toEqual([
      {
        userId: '555',
        name: 'Mia',
        avatar: 'https://cdn.discordapp.com/avatars/555/abc.png?size=128',
        saved: false,
      },
    ]);
    expect(
      (await body<Found>(await call('/9001/birthdays/members?q=556'))).members,
    ).toMatchObject([{ userId: '556', name: 'Kit' }]);
    expect(
      (await body<Found>(await call('/9001/birthdays/members?q='))).members,
    ).toEqual([]);

    expect(
      await problem(
        await put('/9001/birthdays/members/555', { day: 31, month: 4 }),
      ),
    ).toMatch(/April has 30 days/);
    expect(
      await problem(
        await put('/9001/birthdays/members/555', {
          day: 1,
          month: 4,
          timeZone: 'Nope/Nope',
        }),
      ),
    ).toMatch(/time zone/);
    expect(
      await problem(
        await put('/9001/birthdays/members/777', { day: 1, month: 4 }),
      ),
    ).toBe('That member isn’t in the server.');
    const added = await put('/9001/birthdays/members/555', {
      day: 29,
      month: 2,
      year: 2000,
      timeZone: 'Asia/Tokyo',
    });
    expect(added.status).toBe(200);
    expect(
      (await body<{ birthday: { name: string; setByName: string } }>(added))
        .birthday,
    ).toMatchObject({ name: 'Mia', setByName: 'Quinn' });
    await put('/9001/birthdays/members/556', { day: 1, month: 1, year: '' });

    const list = await body<List>(await call('/9001/birthdays/list'));
    expect(list.count).toBe(2);
    expect(list.birthdays.map((b) => b.name)).toEqual(['Kit', 'Mia']);
    expect(list.birthdays[0]!.year).toBeNull();
    expect(list.upcoming).toHaveLength(2);
    expect(
      (await body<List>(await call('/9001/birthdays/list?q=mia'))).birthdays,
    ).toHaveLength(1);

    // Removing someone who has the role today takes it back.
    db.prepare(
      "UPDATE birthdays SET role_id = '301', role_until = ? WHERE user_id = '555'",
    ).run(Date.now() + 3_600_000);
    expect(
      (await call('/9001/birthdays/members/555', { method: 'DELETE' })).status,
    ).toBe(204);
    expect(jobOf('birthdays-role-off')?.payload).toEqual({
      userId: '555',
      roleId: '301',
    });
    expect(
      (await call('/9001/birthdays/members/555', { method: 'DELETE' })).status,
    ).toBe(404);
    const log = (await body<State>(await call('/9001/birthdays'))).log;
    expect(log.map((e) => e.action)).toEqual(['removed', 'set', 'set']);
    expect(log[0]!.detail).toBe('29 February 2000 (Asia/Tokyo) by @Quinn');
  });

  it('queues test messages', async () => {
    expect(
      await problem(
        await call('/9001/birthdays/test', {
          method: 'POST',
          body: JSON.stringify({ channel: '501', kind: 'party' }),
        }),
      ),
    ).toMatch(/which birthday message/);
    expect(
      (
        await call('/9001/birthdays/test', {
          method: 'POST',
          body: JSON.stringify({ channel: '501', kind: 'monthly' }),
        })
      ).status,
    ).toBe(204);
    expect(jobOf('birthdays-test')?.payload).toMatchObject({
      channel: '501',
      kind: 'monthly',
      userName: 'Quinn',
    });
  });

  it('tags the templates birthdays use in Message Studio', async () => {
    const id = addTemplate(
      db,
      {
        guildId: '9001',
        moduleId: 'studio',
        name: 'Party',
        who: 'Quinn',
        message: studioDefault('501'),
      },
      0,
    );
    const config = (await body<State>(await call('/9001/birthdays'))).config;
    writeModule(
      db,
      '9001',
      BD_MODULE,
      {
        on: true,
        config: { ...config, messages: { ...config.messages, monthly: id } },
      },
      0,
    );
    type Studio = {
      templates: { id: string; usedIn: { kind: string; where: string }[] }[];
    };
    const studio = await body<Studio>(await call('/9001/studio'));
    expect(studio.templates.find((t) => t.id === id)?.usedIn).toEqual([
      { kind: 'birthday', where: 'Birthdays (This month)' },
    ]);
  });
});
