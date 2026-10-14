import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  claimJob,
  finishJob,
  listVersions,
  openDb,
  Perm,
  createTicket,
  setStatus,
  upsertGuild,
  type GuildView,
  type Rest,
} from '@sparko/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from './api.ts';
import { createMedia } from './media.ts';

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
  roles: [
    { id: '301', name: 'Moderator', color: 0, managed: false },
    { id: '302', name: 'Sparko', color: 0, managed: true },
  ],
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

/** A pretend Discord REST API that records calls. */
const discordCalls: { method: string; path: string; body?: unknown }[] = [];
const fakeDiscord = (() => {
  const run = async (method: string, path: string, body?: unknown) => {
    discordCalls.push({ method, path, body });
    if (path.endsWith('/emojis'))
      return [{ id: '77', name: 'party', animated: true }] as never;
    if (path.includes('/members/'))
      return { joined_at: new Date().toISOString(), roles: [] } as never;
    return { id: '4242' } as never;
  };
  return {
    get: (p: string) => run('GET', p),
    post: (p: string, b: unknown) => run('POST', p, b),
    patch: (p: string, b: unknown) => run('PATCH', p, b),
    put: (p: string, b: unknown) => run('PUT', p, b),
    delete: (p: string) => run('DELETE', p),
  } as unknown as Rest;
})();

const media = createMedia({
  dir: mkdtempSync(join(tmpdir(), 'sparko-media-')),
  publicUrl: site,
});
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
    discord: fakeDiscord,
    publicUrl: site,
    media,
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

  it('saves Welcome with a version, checks it, and retries after a fix', async () => {
    const empty = await body<{
      on: boolean;
      config: { channel: string; delivery: string };
      channels: { id: string }[];
      templates: unknown[];
    }>(await call('/9001/welcome'));
    expect(empty.config.channel).toBe('501');
    expect(empty.templates.length).toBeGreaterThan(0);

    const bad = await call('/9001/welcome', {
      method: 'PUT',
      body: JSON.stringify({
        on: true,
        config: { ...empty.config, color: 'red' },
      }),
    });
    expect(bad.status).toBe(400);
    expect((await body<{ message: string }>(bad)).message).toContain('colour');

    const config = { ...empty.config, channel: '502', message: 'Hi {user}' };
    const put = await call('/9001/welcome', {
      method: 'PUT',
      body: JSON.stringify({ on: true, config, extra: 'ignored' }),
    });
    expect(put.status).toBe(204);
    const saved = await body<{
      on: boolean;
      config: { message: string };
      versions: { title: string; who: string; whoColor: number }[];
    }>(await call('/9001/welcome'));
    expect(saved.on).toBe(true);
    expect(saved.config.message).toBe('Hi {user}');
    expect(saved.versions[0]).toMatchObject({
      title: 'Updated the welcome message',
      who: 'Quinn',
    });

    // The bot couldn't post there…
    let job = claimJob(db)!;
    while (job.kind !== 'welcome') {
      finishJob(db, job.id, null, Date.now());
      job = claimJob(db)!;
    }
    finishJob(db, job.id, 'Sparko can’t post in #rules yet.', Date.now());
    expect(await body(await call('/9001/modules/welcome/apply'))).toMatchObject(
      { status: 'error', message: 'Sparko can’t post in #rules yet.' },
    );
    // …the owner fixes it and asks again: a new attempt is queued.
    const retry = call('/9001/modules/welcome/apply', { method: 'POST' });
    await new Promise((done) => setTimeout(done, 50));
    const again = claimJob(db)!;
    expect(again.kind).toBe('welcome');
    finishJob(db, again.id, null, Date.now());
    expect(await body(await retry)).toEqual({ status: 'live' });
  });

  it('runs the ticket inbox: panel, list, reply, notes, assign, close, transcript', async () => {
    const state = await body<{
      panel: { roles: string[]; topics: unknown[] };
      roles: { id: string; name: string }[];
    }>(await call('/9001/tickets'));
    // Bot roles can't be staff roles.
    expect(state.roles).toEqual([{ id: '301', name: 'Moderator' }]);
    expect(
      (
        await call('/9001/tickets', {
          method: 'PUT',
          body: JSON.stringify({ on: true, panel: state.panel }),
        })
      ).status,
    ).toBe(400);
    const panel = { ...state.panel, roles: ['301'] };
    expect(
      (
        await call('/9001/tickets', {
          method: 'PUT',
          body: JSON.stringify({ on: true, panel }),
        })
      ).status,
    ).toBe(204);

    createTicket(
      db,
      {
        guildId: '9001',
        threadId: '7001',
        memberId: '123456789012345678',
        memberName: 'tomoko',
        category: 'Get help',
      },
      Date.now() - 90 * 60_000,
    );
    const list = await body<
      { number: number; status: string; waitingMinutes: number }[]
    >(await call('/9001/tickets/list'));
    expect(list[0]).toMatchObject({ number: 1, status: 'new' });
    expect(list[0]!.waitingMinutes).toBeGreaterThanOrEqual(89);

    discordCalls.length = 0;
    await call('/9001/tickets/1/messages', {
      method: 'POST',
      body: JSON.stringify({ text: 'On it!', note: false }),
    });
    expect(discordCalls[0]).toMatchObject({
      method: 'POST',
      path: '/channels/7001/messages',
      body: { content: '**Quinn:** On it!' },
    });
    await call('/9001/tickets/1/messages', {
      method: 'POST',
      body: JSON.stringify({ text: 'Probably the verify role.', note: true }),
    });
    // Notes stay in Sparko.
    expect(discordCalls).toHaveLength(1);

    const detail = await body<{
      status: string;
      assignee: string;
      messages: { kind: string; text: string }[];
      people: { person: { name: string } }[];
    }>(await call('/9001/tickets/1'));
    expect(detail).toMatchObject({ status: 'waiting', assignee: 'You' });
    expect(detail.messages.map((x) => x.kind)).toEqual(['message', 'note']);
    expect(detail.people[0]?.person.name).toBe('tomoko');

    await call('/9001/tickets/1', {
      method: 'PATCH',
      body: JSON.stringify({ priority: 'urgent', assignee: null }),
    });
    expect(
      await body<{ priority: string; assignee: null }>(
        await call('/9001/tickets/1'),
      ),
    ).toMatchObject({ priority: 'urgent', assignee: null });

    await call('/9001/tickets/1/close', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Solved', detail: '', dm: false }),
    });
    expect(discordCalls.at(-1)).toMatchObject({
      method: 'PATCH',
      path: '/channels/7001',
      body: { archived: true, locked: true },
    });
    expect(
      await body<{ status: string; closedBy: string }>(
        await call('/9001/tickets/1'),
      ),
    ).toMatchObject({ status: 'closed', closedBy: 'You' });

    const transcript = await call('/9001/tickets/1/transcript');
    expect(transcript.headers.get('content-disposition')).toContain(
      'ticket-1.html',
    );
    expect(await transcript.text()).toContain('Probably the verify role.');
    expect((await call('/9001/tickets/99')).status).toBe(404);
  });

  it('publishes Studio messages, keeps versions, and manages templates', async () => {
    const studio = await body<{
      message: { layout: string; channel: string; name: string };
      templates: unknown[];
      templateLimit: number;
    }>(await call('/9001/studio'));
    expect(studio.message).toMatchObject({ layout: 'embed', channel: '501' });
    expect(studio.templateLimit).toBe(100);

    const v2 = {
      ...studio.message,
      layout: 'v2',
      v2: {
        container: true,
        accent: '#FACC15',
        blocks: [{ id: 'a', type: 'text', content: '## Hi' }],
      },
    };
    const bad = await call('/9001/studio', {
      method: 'PUT',
      body: JSON.stringify({ ...v2, v2: { ...v2.v2, blocks: [] } }),
    });
    expect(bad.status).toBe(400);
    expect(
      (await call('/9001/studio', { method: 'PUT', body: JSON.stringify(v2) }))
        .status,
    ).toBe(204);
    const after = await body<{
      message: { layout: string };
      versions: { title: string }[];
    }>(await call('/9001/studio'));
    expect(after.message.layout).toBe('v2');
    expect(after.versions[0]?.title).toBe('Published changes');

    expect(
      (
        await call('/9001/studio/templates', {
          method: 'POST',
          body: JSON.stringify({ name: 'Weekly', message: v2 }),
        })
      ).status,
    ).toBe(204);
    const withTemplate = await body<{
      templates: { id: string; name: string; meta: string }[];
    }>(await call('/9001/studio'));
    expect(withTemplate.templates[0]).toMatchObject({ name: 'Weekly' });
    expect(withTemplate.templates[0]!.meta).toContain('by you');
    await call(`/9001/studio/templates/${withTemplate.templates[0]!.id}`, {
      method: 'DELETE',
    });
    expect(
      (await body<{ templates: unknown[] }>(await call('/9001/studio')))
        .templates,
    ).toHaveLength(0);
  });

  it('keeps templates in folders, in the order people put them', async () => {
    type Library = {
      templates: { id: string; name: string; folderId: string | null }[];
      folders: { id: string; name: string; parentId: string | null }[];
      folderLimit: number;
    };
    const message = (
      await body<{ message: object }>(await call('/9001/studio'))
    ).message;
    const post = (path: string, data?: unknown) =>
      call(`/9001${path}`, {
        method: 'POST',
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    for (const name of ['One', 'Two'])
      expect((await post('/studio/templates', { name, message })).status).toBe(
        204,
      );
    expect((await post('/studio/folders', { name: 'Recaps' })).status).toBe(
      204,
    );
    let lib = await body<Library>(await call('/9001/studio'));
    expect(lib.folderLimit).toBe(20);
    const folder = lib.folders[0]!;
    const one = lib.templates.find((t) => t.name === 'One')!;

    // A new folder inside, and a template moved into the outer one.
    expect(
      (await post('/studio/folders', { name: 'Old', parentId: folder.id }))
        .status,
    ).toBe(204);
    expect(
      (
        await post('/studio/library/move', {
          kind: 'template',
          id: one.id,
          folderId: folder.id,
          index: 0,
        })
      ).status,
    ).toBe(204);
    lib = await body<Library>(await call('/9001/studio'));
    const inner = lib.folders.find((f) => f.name === 'Old')!;
    expect(inner.parentId).toBe(folder.id);
    expect(lib.templates.find((t) => t.id === one.id)!.folderId).toBe(
      folder.id,
    );

    // A folder can't go inside itself.
    const loop = await post('/studio/library/move', {
      kind: 'folder',
      id: folder.id,
      folderId: inner.id,
      index: 0,
    });
    expect(loop.status).toBe(409);

    // A clone sits next to the original, in the same folder.
    expect((await post(`/studio/templates/${one.id}/clone`)).status).toBe(204);
    lib = await body<Library>(await call('/9001/studio'));
    expect(lib.templates.find((t) => t.name === 'One (copy)')!.folderId).toBe(
      folder.id,
    );

    // Renaming, then deleting the folder takes everything inside with it.
    expect(
      (
        await call(`/9001/studio/folders/${folder.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Weekly' }),
        })
      ).status,
    ).toBe(204);
    const gone = await call(`/9001/studio/folders/${folder.id}`, {
      method: 'DELETE',
    });
    expect(await gone.json()).toEqual({ templates: 2, folders: 1 });
    lib = await body<Library>(await call('/9001/studio'));
    expect(lib.folders).toHaveLength(0);
    expect(lib.templates.map((t) => t.name)).toEqual(['Two']);
  });

  it('lists roles for button actions and holds Free to one template per action', async () => {
    const studio = await body<{
      message: object;
      roles: { id: string; name: string }[];
      sendLimit: number;
    }>(await call('/9001/studio'));
    // Discord's own bot roles can't be given out, so they aren't listed.
    expect(studio.roles.map((r) => r.name)).toEqual(['Moderator']);
    expect(studio.sendLimit).toBe(1);
    const tooMany = {
      ...studio.message,
      components: [
        {
          id: 'b',
          type: 'button',
          label: 'Go',
          emoji: '',
          colour: 'blurple',
          link: false,
          url: '',
          actions: [
            {
              id: 'a',
              type: 'send',
              templates: ['1', '2'],
              dm: false,
              ephemeral: false,
            },
          ],
        },
      ],
    };
    const res = await call('/9001/studio/test', {
      method: 'POST',
      body: JSON.stringify(tooMany),
    });
    expect(res.status).toBe(400);
    expect((await body<{ message: string }>(res)).message).toMatch(
      /up to 1 template/,
    );
  });

  it('posts a test message, uploads pictures and lists server emojis', async () => {
    const { message } = await body<{ message: object }>(
      await call('/9001/studio'),
    );
    expect(
      (
        await call('/9001/studio/test', {
          method: 'POST',
          body: JSON.stringify(message),
        })
      ).status,
    ).toBe(204);
    expect(
      listVersions(db, '9001', 'studio')[0]?.title.startsWith('Posted'),
    ).toBe(true);

    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      Buffer.alloc(32),
    ]);
    const up = await call('/9001/studio/uploads', {
      method: 'POST',
      body: png,
      headers: { 'content-type': 'image/png' },
    });
    expect(up.status).toBe(200);
    const { url } = await body<{ url: string }>(up);
    expect(url).toMatch(
      /^https:\/\/panel\.example\/media\/9001-[0-9a-f]{24}\.png$/,
    );
    const notPicture = await call('/9001/studio/uploads', {
      method: 'POST',
      body: 'hello',
    });
    expect(notPicture.status).toBe(400);

    expect(await body(await call('/9001/studio/emojis'))).toEqual([
      {
        id: '77',
        name: 'party',
        animated: true,
        url: 'https://cdn.discordapp.com/emojis/77.gif?size=48',
      },
    ]);
  });
});
