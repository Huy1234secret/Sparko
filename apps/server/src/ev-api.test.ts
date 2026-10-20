import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  addTemplate,
  BD_MODULE,
  bdDefault,
  claimJob,
  EV_MODULE,
  evBlank,
  evDefault,
  finishJob,
  openDb,
  Perm,
  studioDefault,
  upsertGuild,
  writeModule,
  type EvDetails,
  type GuildView,
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
      name: 'events',
      category: 'Community',
      canPost: true,
      canThread: false,
    },
  ],
  roles: [
    {
      id: '301',
      name: 'Attending',
      color: 0x5865f2,
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
  voice: [{ id: '601', name: 'Stage', category: 'Voice', stage: true }],
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
const send = (method: string, path: string, data?: unknown) =>
  call(path, {
    method,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
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
  config: ReturnType<typeof evDefault>;
  upcoming: number;
  past: number;
  limits: { upcoming: number; reminders: number };
  canSync: boolean;
  voice: { id: string; stage: boolean }[];
  roles: { id: string }[];
  log: { action: string; number: number | null; detail: string }[];
};
type Item = {
  number: number;
  title: string;
  status: string;
  counts: { going: number };
};

const HOUR = 3_600_000;
const details = (patch: Partial<EvDetails> = {}): EvDetails => {
  const start = Math.ceil((Date.now() + 48 * HOUR) / HOUR) * HOUR;
  return {
    ...evBlank(evDefault('501'), Date.now()),
    title: 'Game night',
    start,
    end: start + 2 * HOUR,
    ...patch,
  };
};

describe('events API', () => {
  it('checks and saves the settings, then queues the bot', async () => {
    const state = await body<State>(await call('/9001/events'));
    expect(state).toMatchObject({
      on: false,
      upcoming: 0,
      past: 0,
      limits: { upcoming: 5, reminders: 2 },
      canSync: false,
      voice: [{ id: '601', stage: true }],
      log: [],
    });
    expect(state.roles.map((r) => r.id)).toEqual(['301', '302']);
    expect(
      await problem(
        await send('PUT', '/9001/events', { on: true, config: state.config }),
      ),
    ).toBe('Pick the channel events are announced in.');
    const config = { ...state.config, channel: '501' };
    expect(
      await problem(
        await send('PUT', '/9001/events', {
          on: true,
          config: { ...config, attending: true, attendingRole: '302' },
        }),
      ),
    ).toMatch(/Sparko can’t give the attending role/);
    expect(
      await problem(
        await send('PUT', '/9001/events', {
          on: true,
          config: { ...config, reminders: ['1d', '1h', '5m'] },
        }),
      ),
    ).toBe('Your plan has up to 2 reminders for each event.');
    expect(
      await problem(
        await send('PUT', '/9001/events', {
          on: true,
          config: {
            ...config,
            messages: { ...config.messages, waitlist: '999' },
          },
        }),
      ),
    ).toMatch(/waitlist DM template was deleted/);
    expect(
      await problem(await send('PUT', '/9001/events', { config })),
    ).toMatch(/on or off/);
    const ok = await send('PUT', '/9001/events', {
      on: true,
      config: {
        ...config,
        attending: true,
        attendingRole: '301',
        timeZone: 'Europe/London',
        extra: 1,
      },
    });
    expect(ok.status).toBe(204);
    expect(jobOf('events')).not.toBeNull();
    const saved = await body<State>(await call('/9001/events'));
    expect(saved.on).toBe(true);
    expect(saved.config).toMatchObject({
      attendingRole: '301',
      timeZone: 'Europe/London',
    });
    expect(saved.config).not.toHaveProperty('extra');
  });

  it('won’t take a command name another module uses', async () => {
    const config = (await body<State>(await call('/9001/events'))).config;
    const bd = bdDefault('501');
    bd.commands.group.name = 'event';
    writeModule(db, '9001', BD_MODULE, { on: true, config: bd }, 0);
    expect(
      await problem(await send('PUT', '/9001/events', { on: true, config })),
    ).toBe(
      '/event is already the birthday command. Pick another name in Commands.',
    );
    writeModule(db, '9001', BD_MODULE, { on: false }, 0);
    expect(
      (await send('PUT', '/9001/events', { on: true, config })).status,
    ).toBe(204);
    jobOf('events');
  });

  it('creates, edits, cancels and deletes events through the bot', async () => {
    expect(
      await problem(
        await send('POST', '/9001/events/items', details({ title: '' })),
      ),
    ).toBe('Give the event a title.');
    expect(
      await problem(
        await send(
          'POST',
          '/9001/events/items',
          details({ place: { id: '699', name: 'Gone', stage: false } }),
        ),
      ),
    ).toMatch(/voice channel was deleted/);
    expect(
      await problem(
        await send('POST', '/9001/events/items', details({ roles: ['999'] })),
      ),
    ).toMatch(/Who can answer was deleted/);

    const made = await send(
      'POST',
      '/9001/events/items',
      details({ place: { id: '601', name: 'Stage', stage: true } }),
    );
    expect(made.status).toBe(201);
    const { event } = await body<{ event: Item }>(made);
    expect(event).toMatchObject({ number: 1, status: 'scheduled' });
    expect(jobOf('events-post')?.payload).toEqual({ number: 1 });

    // One to post later isn't queued; the sweep posts it.
    await send(
      'POST',
      '/9001/events/items',
      details({ title: 'Later', postAt: Date.now() + HOUR }),
    );
    expect(jobOf('events-post')).toBeNull();

    const list = await body<{ events: Item[] }>(
      await call('/9001/events/items'),
    );
    expect(list.events.map((e) => e.title)).toEqual(['Game night', 'Later']);

    const edited = await send(
      'PUT',
      '/9001/events/items/1',
      details({ title: 'Board game night', capacity: 10 }),
    );
    expect(edited.status).toBe(200);
    expect(jobOf('events-edit')?.payload).toEqual({ number: 1, promoted: [] });
    expect((await send('PUT', '/9001/events/items/99', details())).status).toBe(
      400,
    );

    db.prepare(
      `INSERT INTO ev_rsvps (guild_id, number, user_id, name, answer, at) VALUES ('9001', 1, '555', 'mia', 'going', 1)`,
    ).run();
    const people = await body<{ rsvps: { userId: string; noShow: boolean }[] }>(
      await call('/9001/events/items/1/rsvps'),
    );
    expect(people.rsvps).toMatchObject([{ userId: '555', noShow: false }]);
    expect(
      (await send('PUT', '/9001/events/items/1/rsvps/555', { noShow: true }))
        .status,
    ).toBe(204);
    expect(
      (await send('PUT', '/9001/events/items/1/rsvps/556', { noShow: true }))
        .status,
    ).toBe(404);

    expect((await send('POST', '/9001/events/items/1/cancel')).status).toBe(
      200,
    );
    expect(jobOf('events-cancel')?.payload).toEqual({
      number: 1,
      going: ['555'],
    });
    expect(
      await problem(await send('POST', '/9001/events/items/1/cancel')),
    ).toBe('Event #1 has already been cancelled.');
    const past = await body<{ events: Item[] }>(
      await call('/9001/events/items?when=past'),
    );
    expect(past.events.map((e) => e.status)).toEqual(['cancelled']);

    expect((await send('DELETE', '/9001/events/items/1')).status).toBe(204);
    expect(jobOf('events-delete')?.payload).toMatchObject({
      guildId: '9001',
      roles: [],
    });
    expect((await send('DELETE', '/9001/events/items/1')).status).toBe(404);
    const log = (await body<State>(await call('/9001/events'))).log;
    expect(log.map((e) => e.action)).toEqual([
      'deleted',
      'cancelled',
      'edited',
      'created',
      'created',
    ]);
  });

  it('keeps to the plan’s upcoming events', async () => {
    for (let i = 0; i < 4; i++)
      await send('POST', '/9001/events/items', details({ title: `E${i}` }));
    expect(
      await problem(await send('POST', '/9001/events/items', details())),
    ).toMatch(/up to 5 upcoming events/);
  });

  it('queues test messages', async () => {
    expect(
      await problem(
        await send('POST', '/9001/events/test', {
          channel: '501',
          kind: 'party',
        }),
      ),
    ).toMatch(/which event message/);
    expect(
      (
        await send('POST', '/9001/events/test', {
          channel: '501',
          kind: 'reminder',
        })
      ).status,
    ).toBe(204);
    expect(jobOf('events-test')?.payload).toMatchObject({
      channel: '501',
      kind: 'reminder',
      userName: 'Quinn',
    });
  });

  it('tags the templates events use in Message Studio', async () => {
    const id = addTemplate(
      db,
      {
        guildId: '9001',
        moduleId: 'studio',
        name: 'Reminder',
        who: 'Quinn',
        message: studioDefault('501'),
      },
      0,
    );
    const config = (await body<State>(await call('/9001/events'))).config;
    writeModule(
      db,
      '9001',
      EV_MODULE,
      {
        on: true,
        config: { ...config, messages: { ...config.messages, reminder: id } },
      },
      0,
    );
    type Studio = {
      templates: { id: string; usedIn: { kind: string; where: string }[] }[];
    };
    const studio = await body<Studio>(await call('/9001/studio'));
    expect(studio.templates.find((t) => t.id === id)?.usedIn).toEqual([
      { kind: 'event', where: 'Events (Reminder DM)' },
    ]);
  });
});
