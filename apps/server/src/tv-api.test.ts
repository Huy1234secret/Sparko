import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  addTemplate,
  claimJob,
  finishJob,
  getTvPrefs,
  openDb,
  Perm,
  sgDefault,
  SG_MODULE,
  studioDefault,
  TV_MODULE,
  tvNewHub,
  tvRoom,
  upsertGuild,
  writeModule,
  type GuildView,
  type TempVoice,
} from '@sparko/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from './api.ts';

const site = 'https://panel.example';
const db = openDb(':memory:');
const G = '9001';
const guild = {
  id: G,
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
      name: 'voice-panel',
      category: 'Voice',
      canPost: true,
      canThread: false,
    },
  ],
  voice: [
    { id: '700', name: 'Join to create', category: 'Voice', stage: false },
    { id: '701', name: 'Join for duos', category: 'Voice', stage: false },
  ],
  categories: [{ id: '600', name: 'Voice' }],
  roles: [
    {
      id: '301',
      name: 'Helpers',
      color: 0x60a5fa,
      color2: null,
      managed: false,
      assignable: true,
    },
    {
      id: '302',
      name: 'Some bot',
      color: 0,
      color2: null,
      managed: true,
      assignable: false,
    },
  ],
});
const auth = {
  access: async (req: { headers: { cookie?: string } }, id: string) =>
    !req.headers.cookie
      ? { status: 401 as const }
      : id === G
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
      id: G,
      name: 'Pixel Plaza',
      icon: null,
      memberCount: 80,
      installed: true,
      boostLevel: 1,
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
const put = (path: string, data: unknown) =>
  call(path, { method: 'PUT', body: JSON.stringify(data) });
const problem = async (res: Response) =>
  (await body<{ message: string }>(res)).message;
/** Finishes every waiting job, as the bot would; returns their kinds. */
const finishJobs = (error: string | null = null) => {
  const kinds: { kind: string; payload: unknown }[] = [];
  for (let job = claimJob(db); job; job = claimJob(db)) {
    finishJob(db, job.id, error, Date.now());
    kinds.push({ kind: job.kind, payload: job.payload });
  }
  return kinds;
};
/** Plays the bot: finishes jobs as they come in, for a moment. */
const bot = (error: string | null = null) => {
  const seen: { kind: string; payload: unknown }[] = [];
  const timer = setInterval(() => seen.push(...finishJobs(error)), 20);
  return {
    seen,
    stop: () => clearInterval(timer),
  };
};

type State = {
  on: boolean;
  config: TempVoice;
  limits: { hubs: number };
  boostLevel: number;
  rooms: number;
  prefs: number;
  panel: { channelId: string } | null;
  voice: { id: string }[];
  categories: { id: string }[];
  roles: { id: string }[];
  log: { action: string }[];
};
const state = async () => body<State>(await call(`/${G}/temp-voice`));

describe('temporary voice API', () => {
  it('reads the settings with voice channels, categories and limits', async () => {
    const s = await state();
    expect(s).toMatchObject({
      on: false,
      limits: { hubs: 1 },
      boostLevel: 1,
      rooms: 0,
      prefs: 0,
      panel: null,
      log: [],
    });
    expect(s.voice.map((c) => c.id)).toEqual(['700', '701']);
    expect(s.categories.map((c) => c.id)).toEqual(['600']);
    // Managed roles can't be a bypass role.
    expect(s.roles.map((r) => r.id)).toEqual(['301']);
  });

  it('checks the settings against the server and the plan', async () => {
    const { config } = await state();
    const hub = tvNewHub('h1', '700');
    const send = (c: Partial<TempVoice>) =>
      put(`/${G}/temp-voice`, { on: true, config: { ...config, ...c } });
    expect(await problem(await send({ hubs: [tvNewHub('h1', '999')] }))).toBe(
      'A hub channel was deleted. Pick another one.',
    );
    expect(
      await problem(await send({ hubs: [hub, tvNewHub('h2', '701')] })),
    ).toBe('The Free plan has 1 hub. Upgrade to Plus for up to 10.');
    expect(
      await problem(await send({ hubs: [{ ...hub, bitrate: 256 }] })),
    ).toMatch(/allows up to 128 kbps/);
    expect(
      await problem(await send({ hubs: [{ ...hub, category: '601' }] })),
    ).toMatch(/category for the hub’s rooms was deleted/);
    expect(await problem(await send({ bypassRole: '303' }))).toBe(
      'The bypass role was deleted. Pick another one.',
    );
    expect(
      await problem(await send({ panel: { ...config.panel, channel: '502' } })),
    ).toMatch(/panel’s channel was deleted/);
    expect((await put(`/${G}/temp-voice`, { config })).status).toBe(400);
  });

  it('keeps the template’s rows within what the buttons leave', async () => {
    const { config } = await state();
    const link = (id: string) => ({
      id,
      type: 'button' as const,
      label: id,
      emoji: '',
      colour: 'grey' as const,
      link: true,
      url: 'https://example.com',
      actions: [],
    });
    const menu = {
      id: 'm',
      type: 'menu' as const,
      placeholder: '',
      multiple: false,
      options: [
        { id: 'o', label: 'Go', emoji: '', description: '', actions: [] },
      ],
    };
    const id = addTemplate(
      db,
      {
        guildId: G,
        moduleId: 'studio',
        name: 'Busy panel',
        who: 'Quinn',
        message: { ...studioDefault(''), components: [link('a'), menu] },
      },
      0,
    );
    const res = await put(`/${G}/temp-voice`, {
      on: true,
      config: { ...config, panel: { ...config.panel, message: id } },
    });
    expect(await problem(res)).toMatch(/can have up to 1 row of its own/);
  });

  it('refuses a /voice name another module uses', async () => {
    const sg = sgDefault('501');
    sg.commands.suggest.name = 'voice';
    writeModule(db, G, SG_MODULE, { on: true, config: sg }, 0);
    const { config } = await state();
    expect(
      await problem(await put(`/${G}/temp-voice`, { on: true, config })),
    ).toBe(
      '/voice is already a suggestion command. Pick another name in Commands.',
    );
    writeModule(db, G, SG_MODULE, { on: false }, 0);
  });

  it('saves, then the bot applies it', async () => {
    const { config } = await state();
    const res = await put(`/${G}/temp-voice`, {
      on: true,
      config: {
        ...config,
        hubs: [{ ...tvNewHub('h1', '700'), name: '  Den  ' }],
        bypassRole: '301',
        panel: { ...config.panel, channel: '501' },
        junk: true,
      },
    });
    expect(res.status).toBe(204);
    expect(finishJobs().map((j) => j.kind)).toEqual(['temp-voice']);
    const s = await state();
    expect(s.on).toBe(true);
    expect(s.config.hubs[0]!.name).toBe('Den');
    expect(s.config).not.toHaveProperty('junk');
  });

  it('posts the panel and waits for the bot', async () => {
    const b = bot();
    const res = await call(`/${G}/temp-voice/panel`, { method: 'POST' });
    b.stop();
    expect(await body(res)).toEqual({ status: 'live' });
    expect(b.seen.map((j) => j.kind)).toEqual(['temp-voice-panel']);
    const failing = bot('Sparko can’t post the voice panel.');
    const again = await call(`/${G}/temp-voice/panel`, { method: 'POST' });
    failing.stop();
    expect(await body(again)).toEqual({
      status: 'error',
      message: 'Sparko can’t post the voice panel.',
    });
  });

  it('lists rooms, and closes one through the bot', async () => {
    db.prepare(
      `INSERT INTO tv_rooms (channel_id, guild_id, owner_id, owner_name, hub_id, name,
         members, state, created_at, updated_at)
       VALUES ('800', ?, '55', 'rhea', 'h1', 'Den', 2, 'open', 1, 1)`,
    ).run(G);
    type Rooms = { rooms: { channelId: string; ownerName: string }[] };
    const { rooms } = await body<Rooms>(await call(`/${G}/temp-voice/rooms`));
    expect(rooms).toEqual([
      expect.objectContaining({
        channelId: '800',
        ownerName: 'rhea',
        members: 2,
      }),
    ]);
    expect(
      (await call(`/${G}/temp-voice/rooms/801`, { method: 'DELETE' })).status,
    ).toBe(404);
    const b = bot();
    const res = await call(`/${G}/temp-voice/rooms/800`, { method: 'DELETE' });
    b.stop();
    expect(res.status).toBe(204);
    expect(b.seen).toEqual([
      {
        kind: 'temp-voice-close',
        payload: { channelId: '800', userId: 'u1', userName: 'Quinn' },
      },
    ]);
    // The bot deletes it; here it's still saved.
    expect(tvRoom(db, '800')).not.toBeNull();
    const failing = bot('Sparko couldn’t delete the room.');
    const no = await call(`/${G}/temp-voice/rooms/800`, { method: 'DELETE' });
    failing.stop();
    expect(await problem(no)).toBe('Sparko couldn’t delete the room.');
  });

  it('lists and resets saved preferences', async () => {
    db.prepare(
      `INSERT INTO tv_prefs (guild_id, user_id, user_name, name, user_limit, locked, trusted, blocked, updated_at)
       VALUES (?, '55', 'rhea', 'Den', 4, 1, '["56"]', '[]', 5),
              (?, '56', 'ayo', '', NULL, 0, '[]', '[]', 6)`,
    ).run(G, G);
    type Prefs = { prefs: { userId: string }[]; count: number };
    const all = await body<Prefs>(await call(`/${G}/temp-voice/prefs`));
    expect(all.count).toBe(2);
    expect(all.prefs.map((p) => p.userId)).toEqual(['56', '55']);
    const found = await body<Prefs>(await call(`/${G}/temp-voice/prefs?q=den`));
    expect(found.prefs).toEqual([
      expect.objectContaining({ userId: '55', limit: 4, trusted: ['56'] }),
    ]);
    expect(
      (await call(`/${G}/temp-voice/prefs/55`, { method: 'DELETE' })).status,
    ).toBe(204);
    expect(getTvPrefs(db, G, '55')).toBeNull();
    expect(
      (await call(`/${G}/temp-voice/prefs/55`, { method: 'DELETE' })).status,
    ).toBe(404);
    expect((await state()).prefs).toBe(1);
  });

  it('tags the panel template in Message Studio', async () => {
    const id = addTemplate(
      db,
      {
        guildId: G,
        moduleId: 'studio',
        name: 'Panel',
        who: 'Quinn',
        message: studioDefault('501'),
      },
      0,
    );
    const { config } = await state();
    writeModule(
      db,
      G,
      TV_MODULE,
      {
        on: true,
        config: { ...config, panel: { ...config.panel, message: id } },
      },
      0,
    );
    type Studio = {
      templates: { id: string; usedIn: { kind: string; where: string }[] }[];
    };
    const studio = await body<Studio>(await call(`/${G}/studio`));
    expect(studio.templates.find((t) => t.id === id)?.usedIn).toEqual([
      { kind: 'voice', where: 'Temporary voice (control panel)' },
    ]);
  });

  it('answers 404 for unknown paths', async () => {
    expect((await call(`/${G}/temp-voice/nope`)).status).toBe(404);
  });
});
