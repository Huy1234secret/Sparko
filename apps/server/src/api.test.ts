import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  claimJob,
  finishJob,
  listVersions,
  openDb,
  Perm,
  setStatus,
  upsertGuild,
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
let perms = Perm.viewChannel | Perm.sendMessages | Perm.embedLinks;
const view = (): GuildView => ({
  perms,
  channels: [
    {
      id: '501',
      name: 'welcome',
      category: 'Info',
      canPost: true,
      canThread: false,
    },
    {
      id: '502',
      name: 'rules',
      category: 'Info',
      canPost: false,
      canThread: false,
    },
  ],
  roles: [],
});
/** Signed in as Quinn, who manages server 9001 only. */
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
    Date.now() - 2 * 86_400_000,
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

describe('server API', () => {
  it('keeps out people who are signed out or can’t manage the server', async () => {
    expect((await fetch(`${base}/9001/overview`)).status).toBe(401);
    expect((await call('/9002/overview')).status).toBe(403);
    const forged = await call('/9001/modules/levels', {
      method: 'PUT',
      headers: { origin: 'https://evil.example' },
      body: JSON.stringify({ on: true }),
    });
    expect(forged.status).toBe(403);
  });

  it('switches a module on, keeps a version, and reports it live once the bot applies it', async () => {
    const put = await call('/9001/modules/levels', {
      method: 'PUT',
      body: JSON.stringify({ on: true }),
    });
    expect(put.status).toBe(204);
    expect(await body(await call('/9001/modules/levels'))).toEqual({
      on: true,
    });
    expect(listVersions(db, '9001', 'levels')[0]).toMatchObject({
      title: 'Turned on',
      who: 'Quinn',
    });
    // Nobody has applied it yet: the dashboard hears that honestly.
    const waiting = await body<{ status: string; message: string }>(
      await call('/9001/modules/levels/apply'),
    );
    expect(waiting.status).toBe('error');
    expect(waiting.message).toContain('hasn’t picked it up');
    // The bot applies it.
    finishJob(db, claimJob(db)!.id, null, Date.now());
    expect(await body(await call('/9001/modules/levels/apply'))).toEqual({
      status: 'live',
    });
  });

  it('refuses bad input', async () => {
    const res = await call('/9001/modules/levels', {
      method: 'PUT',
      body: '{"on":"yes"}',
    });
    expect(res.status).toBe(400);
    expect((await call('/9001/modules/NOT_A_MODULE')).status).toBe(404);
  });

  it('builds the overview from what is really on and what Sparko can do', async () => {
    setStatus(db, 'heartbeat', { ping: 42 }, Date.now());
    await call('/9001/modules/welcome', {
      method: 'PUT',
      body: JSON.stringify({ on: true }),
    });
    await call('/9001/steps/tickets', {
      method: 'PUT',
      body: JSON.stringify({ skipped: true }),
    });
    const o = await body<{
      steps: { id: string; status: string; needsPermission?: boolean }[];
      health: { latencyMs: number; missingPermission: { name: string } | null };
      activity: { who: string; what: string }[];
    }>(await call('/9001/overview'));
    const step = (id: string) => o.steps.find((s) => s.id === id);
    expect(step('welcome')?.status).toBe('done');
    expect(step('tickets')?.status).toBe('skipped');
    expect(step('starter-role')?.needsPermission).toBe(true);
    expect(o.health.latencyMs).toBe(42);
    expect(o.health.missingPermission?.name).toBe('Manage Roles');
    expect(o.activity[0]).toMatchObject({
      who: 'Quinn',
      what: 'turned on welcome',
    });

    perms |= Perm.manageRoles | Perm.createPrivateThreads;
    expect(
      await body(await call('/9001/permissions/check', { method: 'POST' })),
    ).toEqual({ ok: true });
  });

  it('lists channels and re-checks one Sparko can’t post in', async () => {
    const channels = await body<{ name: string; canPost: boolean }[]>(
      await call('/9001/channels'),
    );
    expect(channels.map((c) => [c.name, c.canPost])).toEqual([
      ['welcome', true],
      ['rules', false],
    ]);
    expect(
      await body(await call('/9001/channels/502/check', { method: 'POST' })),
    ).toEqual({ ok: false });
  });
});
