import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  arTrack,
  claimJob,
  finishJob,
  listVersions,
  openDb,
  Perm,
  createTicket,
  studioDefault,
  qaDefaultMessage,
  setStatus,
  sgDefault,
  upsertGuild,
  writeModule,
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
    {
      id: '301',
      name: 'Moderator',
      color: 0xfacc15,
      color2: 0xed4245,
      managed: false,
      assignable: true,
    },
    {
      id: '302',
      name: 'Sparko',
      color: 0,
      color2: null,
      managed: true,
      assignable: false,
    },
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
  it('reports public status without signing in, from the bot’s heartbeat', async () => {
    const url = base.replace('/servers', '/public/status');
    setStatus(db, 'heartbeat', { ping: 37, guilds: 12 }, Date.now());
    const up = await fetch(url);
    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({
      status: 'operational',
      website: { online: true },
      bot: { online: true, latencyMs: 37, servers: 12 },
    });
    setStatus(db, 'heartbeat', { ping: 37 }, Date.now() - 5 * 60_000);
    expect(await (await fetch(url)).json()).toMatchObject({
      status: 'degraded',
      bot: { online: false, latencyMs: null },
    });
    setStatus(db, 'heartbeat', { ping: 42 }, Date.now());
  });

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

  it('saves Welcome messages with a template, checks it, and retries after a fix', async () => {
    type Greet = { template: string; channel: string; dm: string };
    const empty = await body<{
      on: boolean;
      config: { join: Greet; leave: Greet; boost: Greet };
      log: unknown[];
    }>(await call('/9001/welcome'));
    expect(empty.config.join).toMatchObject({ channel: '501', template: '' });
    expect(empty.log).toEqual([]);

    // A channel without a template to send isn't saved.
    const bad = await call('/9001/welcome', {
      method: 'PUT',
      body: JSON.stringify({ on: true, config: empty.config }),
    });
    expect(bad.status).toBe(400);
    expect((await body<{ message: string }>(bad)).message).toBe(
      'Pick a template for the join message.',
    );

    // Nor is one that doesn't exist.
    const missing = await call('/9001/welcome', {
      method: 'PUT',
      body: JSON.stringify({
        on: true,
        config: {
          ...empty.config,
          join: { ...empty.config.join, template: '999' },
          leave: { ...empty.config.leave, channel: '' },
          boost: { ...empty.config.boost, channel: '' },
        },
      }),
    });
    expect((await body<{ message: string }>(missing)).message).toContain(
      'was deleted',
    );

    const made = await call('/9001/studio/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Hello',
        message: { ...studioDefault('502'), name: 'Hello' },
        folderId: null,
      }),
    });
    const { id } = await body<{ id: string }>(made);
    const config = {
      ...empty.config,
      join: { ...empty.config.join, template: id, channel: '502', dm: 'same' },
      leave: { ...empty.config.leave, channel: '' },
      boost: { ...empty.config.boost, channel: '' },
    };
    const put = await call('/9001/welcome', {
      method: 'PUT',
      body: JSON.stringify({ on: true, config, extra: 'ignored' }),
    });
    expect(put.status).toBe(204);
    const saved = await body<{
      on: boolean;
      config: { join: Greet };
    }>(await call('/9001/welcome'));
    expect(saved.on).toBe(true);
    expect(saved.config.join).toMatchObject({
      template: id,
      channel: '502',
      dm: 'same',
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
    await call(`/9001/studio/templates/${id}`, { method: 'DELETE' });
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
      components: [],
      v2: {
        accent: '#FACC15',
        text: '## Hi',
        thumbnail: '',
        gallery: [],
        place: [],
      },
    };
    const bad = await call('/9001/studio', {
      method: 'PUT',
      body: JSON.stringify({ ...v2, v2: { ...v2.v2, text: '' } }),
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
    ).toBe(200);
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

  it('makes reaction roles, checks them, and has the bot post them', async () => {
    const made = await body<{ id: string }>(
      await call('/9001/reaction-roles', {
        method: 'POST',
        body: JSON.stringify({ name: 'Games' }),
      }),
    );
    type RR = {
      templates: {
        id: string;
        name: string;
        config: { message: string; items: { role: string }[] };
      }[];
      roles: { id: string; assignable: boolean }[];
      limit: number;
    };
    const state = await body<RR>(await call('/9001/reaction-roles'));
    expect(state.limit).toBe(10);
    expect(state.roles).toContainEqual(
      expect.objectContaining({ id: '302', assignable: false }),
    );
    const rr = state.templates.find((t) => t.id === made.id)!;
    // A role Sparko can't give is refused.
    const bad = await call(`/9001/reaction-roles/${made.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        config: {
          ...rr.config,
          items: rr.config.items.map((i) => ({ ...i, role: '302' })),
        },
      }),
    });
    expect((await body<{ message: string }>(bad)).message).toContain(
      'can’t give that role',
    );
    const ok = await call(`/9001/reaction-roles/${made.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        config: {
          ...rr.config,
          items: rr.config.items.map((i) => ({ ...i, role: '301' })),
        },
      }),
    });
    expect(ok.status).toBe(204);
    let job = claimJob(db)!;
    while (job.kind !== 'rr-sync') {
      finishJob(db, job.id, null, Date.now());
      job = claimJob(db)!;
    }
    expect(job.payload).toEqual({ id: made.id });
    finishJob(db, job.id, null, Date.now());

    // Its message template is tagged in Message Studio.
    const studio = await body<{
      templates: { id: string; usedIn: { kind: string; where: string }[] }[];
    }>(await call('/9001/studio'));
    expect(
      studio.templates.find((t) => t.id === rr.config.message)?.usedIn,
    ).toEqual([{ kind: 'reaction-role', where: 'Reaction roles (Games)' }]);

    // Deleting it has the bot take the message down.
    await call(`/9001/reaction-roles/${made.id}`, { method: 'DELETE' });
    expect(claimJob(db)?.kind).toBe('rr-sync');
    await call(`/9001/studio/templates/${rr.config.message}`, {
      method: 'DELETE',
    });
  });

  it('saves automatic roles, checks them, and lets staff edit member data', async () => {
    type AR = {
      on: boolean;
      config: { timed: unknown[] };
      limits: { timed: number; rules: number };
      roles: { id: string; assignable: boolean }[];
    };
    const state = await body<AR>(await call('/9001/autoroles'));
    expect(state.on).toBe(false);
    expect(state.limits).toMatchObject({ timed: 3, rules: 10 });
    const config = {
      join: { before: [], after: ['301'] },
      timed: [{ id: 't1', after: '7d', role: '301' }],
      restartOnLeave: true,
      stack: true,
      rules: [],
    };
    // A role Sparko can't give is refused.
    const bad = await call('/9001/autoroles', {
      method: 'PUT',
      body: JSON.stringify({
        on: true,
        config: { ...config, timed: [{ id: 't1', after: '7d', role: '302' }] },
      }),
    });
    expect((await body<{ message: string }>(bad)).message).toContain(
      'can’t give the role',
    );
    const ok = await call('/9001/autoroles', {
      method: 'PUT',
      body: JSON.stringify({ on: true, config }),
    });
    expect(ok.status).toBe(204);
    let job = claimJob(db)!;
    while (job.kind !== 'autoroles') {
      finishJob(db, job.id, null, Date.now());
      job = claimJob(db)!;
    }
    finishJob(db, job.id, null, Date.now());
    expect((await body<AR>(await call('/9001/autoroles'))).on).toBe(true);

    // Storage: nothing until searched, then edit and wipe.
    arTrack(
      db,
      '9001',
      [
        {
          userId: '555',
          name: 'mia',
          flags: 0,
          pending: false,
          boostingSince: null,
          joinedAt: Date.now() - 3_600_000,
        },
      ],
      Date.now(),
    );
    type Found = { members: { userId: string; servedMs: number }[] };
    expect(
      (await body<Found>(await call('/9001/autoroles/members?q='))).members,
    ).toEqual([]);
    expect(
      (await body<Found>(await call('/9001/autoroles/members?q=mi'))).members,
    ).toHaveLength(1);
    const edited = await body<{ member: { servedMs: number } }>(
      await call('/9001/autoroles/members/555', {
        method: 'PATCH',
        body: JSON.stringify({ servedMs: 86_400_000, boosts: 2 }),
      }),
    );
    expect(edited.member.servedMs).toBeGreaterThanOrEqual(86_400_000);
    const wiped = await body<{ member: { servedMs: number } }>(
      await call('/9001/autoroles/members/555', { method: 'DELETE' }),
    );
    expect(wiped.member.servedMs).toBeLessThan(60_000);
    expect(
      (await call('/9001/autoroles/members/777', { method: 'DELETE' })).status,
    ).toBe(404);
  });

  it('saves suggestions, checks them, lists them and deletes them', async () => {
    type SG = {
      on: boolean;
      config: Record<string, unknown> & {
        commands: Record<string, { name: string }>;
      };
      storage: { count: number; perKb: number };
      limits: { statuses: number };
    };
    const state = await body<SG>(await call('/9001/suggestions'));
    expect(state.on).toBe(false);
    expect(state.limits.statuses).toBe(6);
    expect(state.storage).toMatchObject({ count: 0, perKb: 4 });
    // Without a channel it can't be saved.
    const bad = await call('/9001/suggestions', {
      method: 'PUT',
      body: JSON.stringify({ on: true, config: state.config }),
    });
    expect((await body<{ message: string }>(bad)).message).toContain(
      'channel suggestions are posted in',
    );
    const config = { ...state.config, channel: '501', approvers: ['301'] };
    const ok = await call('/9001/suggestions', {
      method: 'PUT',
      body: JSON.stringify({ on: true, config }),
    });
    expect(ok.status).toBe(204);
    let job = claimJob(db)!;
    while (job.kind !== 'suggestions') {
      finishJob(db, job.id, null, Date.now());
      job = claimJob(db)!;
    }
    finishJob(db, job.id, null, Date.now());
    expect((await body<SG>(await call('/9001/suggestions'))).on).toBe(true);

    // A suggestion the bot posted shows in Storage, and can be deleted.
    db.prepare(
      `INSERT INTO suggestions (guild_id, number, author_id, author_name, title, body,
         dup_key, channel_id, message_id, created_at, last_at)
       VALUES ('9001', 1, '555', 'mia', 'Movie nights', 'Fridays', 'k', '501', '77', 0, 0)`,
    ).run();
    type List = { suggestions: { number: number; title: string }[] };
    expect(
      (await body<List>(await call('/9001/suggestions/list?q=movie')))
        .suggestions,
    ).toMatchObject([{ number: 1, title: 'Movie nights' }]);
    expect(
      (await call('/9001/suggestions/1', { method: 'DELETE' })).status,
    ).toBe(204);
    const del = claimJob(db)!;
    expect(del.kind).toBe('suggestions-delete');
    expect(del.payload).toMatchObject({ messageIds: ['77'] });
    finishJob(db, del.id, null, Date.now());
    expect(
      (await body<List>(await call('/9001/suggestions/list'))).suggestions,
    ).toEqual([]);
    expect(
      (await call('/9001/suggestions/1', { method: 'DELETE' })).status,
    ).toBe(404);

    // Test messages go to the bot.
    expect(
      (
        await call('/9001/suggestions/test', {
          method: 'POST',
          body: JSON.stringify({ channel: '501' }),
        })
      ).status,
    ).toBe(204);
    const test = claimJob(db)!;
    expect(test.kind).toBe('suggestions-test');
    finishJob(db, test.id, null, Date.now());
  });

  it('saves questions, checks them, lists them and deletes them', async () => {
    type QA = {
      on: boolean;
      config: Record<string, unknown> & {
        command: { name: string; description: string };
      };
      storage: { count: number; perKb: number };
      limits: { categories: number; maxOpen: number };
      channels: { id: string; canThread: boolean }[];
    };
    const state = await body<QA>(await call('/9001/questions'));
    expect(state.on).toBe(false);
    expect(state.limits).toMatchObject({ categories: 5, maxOpen: 3 });
    expect(state.storage).toMatchObject({ count: 0, perKb: 4 });
    expect(state.channels[0]).toHaveProperty('canThread');
    // Without a channel it can't be saved.
    const bad = await call('/9001/questions', {
      method: 'PUT',
      body: JSON.stringify({ on: true, config: state.config }),
    });
    expect(bad.status).toBe(400);
    expect((await body<{ message: string }>(bad)).message).toContain(
      'channel questions are posted in',
    );
    // More open questions than Free allows, or a deleted role, are refused.
    const put = (config: unknown) =>
      call('/9001/questions', {
        method: 'PUT',
        body: JSON.stringify({ on: true, config }),
      });
    const config = { ...state.config, channel: '501', answerers: ['301'] };
    expect(
      (await body<{ message: string }>(await put({ ...config, maxOpen: 10 })))
        .message,
    ).toContain('1 to 3');
    expect(
      (await body<{ message: string }>(await put({ ...config, ping: '999' })))
        .message,
    ).toContain('deleted');
    // A name Suggestions already uses is taken.
    writeModule(
      db,
      '9001',
      'suggestions',
      { on: true, config: sgDefault('501') },
      0,
    );
    expect(
      (
        await body<{ message: string }>(
          await put({
            ...config,
            command: { ...config.command, name: 'suggest' },
          }),
        )
      ).message,
    ).toContain('already a command');
    // The question message is a Studio template with one embed.
    const template = async (message: object) =>
      (
        await body<{ id: string }>(
          await call('/9001/studio/templates', {
            method: 'POST',
            body: JSON.stringify({ name: 'Q', message, folderId: null }),
          }),
        )
      ).id;
    const card = { ...qaDefaultMessage(), name: 'Q', channel: '501' };
    const two = await template({
      ...card,
      embeds: [card.embeds[0], { ...card.embeds[0], id: 'e2' }],
    });
    expect(
      (await body<{ message: string }>(await put({ ...config, message: two })))
        .message,
    ).toContain('one embed');
    const message = await template(card);
    const ok = await put({ ...config, message, extra: 'dropped' });
    expect(ok.status).toBe(204);
    type Studio = {
      templates: { id: string; usedIn: { kind: string; where: string }[] }[];
    };
    const tagged = (await body<Studio>(await call('/9001/studio'))).templates;
    expect(tagged.find((t) => t.id === message)!.usedIn).toEqual([
      {
        kind: 'question',
        where: 'Questions & answers (the question message)',
      },
    ]);
    let job = claimJob(db)!;
    while (job.kind !== 'questions') {
      finishJob(db, job.id, null, Date.now());
      job = claimJob(db)!;
    }
    finishJob(db, job.id, null, Date.now());
    const saved = await body<QA>(await call('/9001/questions'));
    expect(saved.on).toBe(true);
    expect(saved.config).not.toHaveProperty('extra');
    expect(saved.config.answerers).toEqual(['301']);

    // A question the bot posted shows in Storage, and can be deleted.
    db.prepare(
      `INSERT INTO questions (guild_id, number, asker_id, asker_name, title,
         channel_id, message_id, thread_id, created_at)
       VALUES ('9001', 1, '555', 'mia', 'Where are the rules?', '501', '77', '78', 0)`,
    ).run();
    type List = { questions: { number: number; title: string }[] };
    expect(
      (await body<List>(await call('/9001/questions/list?q=rules'))).questions,
    ).toMatchObject([{ number: 1, title: 'Where are the rules?' }]);
    expect(
      (await body<List>(await call('/9001/questions/list?status=answered')))
        .questions,
    ).toEqual([]);
    expect((await call('/9001/questions/1', { method: 'DELETE' })).status).toBe(
      204,
    );
    const del = claimJob(db)!;
    expect(del.kind).toBe('questions-delete');
    expect(del.payload).toEqual({
      channelId: '501',
      messageId: '77',
      threadId: '78',
    });
    finishJob(db, del.id, null, Date.now());
    expect(
      (await body<List>(await call('/9001/questions/list'))).questions,
    ).toEqual([]);
    expect((await call('/9001/questions/1', { method: 'DELETE' })).status).toBe(
      404,
    );

    // Test messages go to the bot, for the question or the answer.
    expect(
      (
        await call('/9001/questions/test', {
          method: 'POST',
          body: JSON.stringify({ channel: 'nope' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/9001/questions/test', {
          method: 'POST',
          body: JSON.stringify({ channel: '501', which: 'answer' }),
        })
      ).status,
    ).toBe(204);
    const test = claimJob(db)!;
    expect(test.kind).toBe('questions-test');
    expect(test.payload).toMatchObject({ channel: '501', which: 'answer' });
    finishJob(db, test.id, null, Date.now());
    writeModule(db, '9001', 'suggestions', { on: false }, 0);
    for (const id of [two, message])
      await call(`/9001/studio/templates/${id}`, { method: 'DELETE' });
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
        200,
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
    // Discord's own bot roles can't be given out, so they aren't listed;
    // gradient roles bring both colours.
    expect(studio.roles).toEqual([
      {
        id: '301',
        name: 'Moderator',
        color: '#facc15',
        color2: '#ed4245',
        assignable: true,
      },
    ]);
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

  it('edits a message Sparko sent, from its link', async () => {
    const { message } = await body<{ message: object }>(
      await call('/9001/studio'),
    );
    const edit = (link: string) =>
      call('/9001/studio/edit', {
        method: 'POST',
        body: JSON.stringify({ message, link }),
      });
    const other = await edit('https://discord.com/channels/42/500/600');
    expect(other.status).toBe(400);
    expect((await body<{ message: string }>(other)).message).toMatch(
      /another server/,
    );
    expect((await edit('not a link')).status).toBe(400);
    expect(
      (await edit('https://discord.com/channels/9001/500/600')).status,
    ).toBe(204);
    // Earlier tests leave jobs queued; this one is the newest.
    let job = claimJob(db);
    while (job && job.kind !== 'studio-edit') {
      finishJob(db, job.id, null, Date.now());
      job = claimJob(db);
    }
    expect(job?.payload).toMatchObject({ channelId: '500', messageId: '600' });
    finishJob(db, job!.id, null, Date.now());
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
