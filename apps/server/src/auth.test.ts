import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openDb } from '@sparko/core';
import { botPermissions, createAuth } from './auth.ts';

const MANAGE = String(0x20);
/** Stands in for Discord's API. */
const discord = vi.fn(
  async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status });
    if (u.endsWith('/oauth2/token')) {
      const body = new URLSearchParams(String(init?.body));
      return body.get('code') === 'good'
        ? reply({ access_token: 'user-token', expires_in: 604800 })
        : reply({ error: 'invalid_grant' }, 400);
    }
    const auth = new Headers(init?.headers).get('authorization');
    if (u.endsWith('/users/@me') && auth === 'Bearer user-token')
      return reply({
        id: '111111111111111111',
        username: 'quinn',
        global_name: 'Quinn',
        avatar: 'abc',
      });
    if (u.includes('/users/@me/guilds') && auth === 'Bearer user-token')
      return reply([
        {
          id: '9001',
          name: 'Mine',
          icon: 'ic',
          owner: true,
          permissions: '0',
          approximate_member_count: 50,
        },
        {
          id: '9002',
          name: 'Managed',
          icon: null,
          owner: false,
          permissions: MANAGE,
        },
        {
          id: '9003',
          name: 'Just a member',
          icon: null,
          owner: false,
          permissions: '1024',
        },
      ]);
    if (u.includes('/users/@me/guilds') && auth === 'Bot bot-token')
      return reply([{ id: '9001' }]);
    return reply({ message: 'Unauthorized' }, 401);
  },
);

let server: Server;
let base: string;
const site = 'https://panel.example';

beforeAll(async () => {
  const auth = createAuth({
    db: openDb(':memory:'),
    clientId: 'client-1',
    clientSecret: 'secret-1',
    botToken: 'bot-token',
    publicUrl: site,
    fetch: discord as typeof fetch,
  });
  server = createServer((req, res) => {
    void auth.handle(req, res).then((handled) => {
      if (!handled) res.writeHead(418).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

const get = (path: string, cookie = '') =>
  fetch(base + path, { redirect: 'manual', headers: { cookie } });
const cookieOf = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0];

async function signIn() {
  const start = await get('/api/v1/auth/discord');
  const state = new URL(start.headers.get('location')!).searchParams.get(
    'state',
  )!;
  const back = await get(
    `/api/v1/auth/discord/callback?code=good&state=${state}`,
    cookieOf(start, 'sparko_oauth_state'),
  );
  return { back, session: cookieOf(back, 'sparko_session')! };
}

describe('Discord sign-in', () => {
  it('sends people to Discord with a state check and the exact callback', async () => {
    const res = await get('/api/v1/auth/discord');
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location')!);
    expect(to.origin + to.pathname).toBe(
      'https://discord.com/oauth2/authorize',
    );
    expect(to.searchParams.get('client_id')).toBe('client-1');
    expect(to.searchParams.get('scope')).toBe('identify guilds');
    expect(to.searchParams.get('redirect_uri')).toBe(
      `${site}/api/v1/auth/discord/callback`,
    );
    const set = res.headers.getSetCookie().join();
    expect(set).toContain('HttpOnly');
    expect(set).toContain('Secure');
  });

  it('signs in, shows who you are and only the servers you can manage', async () => {
    const { back, session } = await signIn();
    expect(back.headers.get('location')).toBe('/dashboard');
    const me = (await (await get('/api/v1/session', session)).json()) as {
      user: unknown;
    };
    expect(me.user).toEqual({
      id: '111111111111111111',
      name: 'Quinn',
      avatarUrl:
        'https://cdn.discordapp.com/avatars/111111111111111111/abc.png?size=128',
    });
    const servers = (await (await get('/api/v1/servers', session)).json()) as {
      name: string;
      installed: boolean;
      members: number;
      icon?: string;
    }[];
    expect(servers.map((s) => s.name)).toEqual(['Mine', 'Managed']);
    expect(servers[0]).toMatchObject({ installed: true, members: 50 });
    expect(servers[0]!.icon).toContain('/icons/9001/ic.png');
    expect(servers[1]!.installed).toBe(false);
  });

  it('refuses a callback whose state doesn’t match, and cancelled sign-ins', async () => {
    const bad = await get(
      '/api/v1/auth/discord/callback?code=good&state=forged',
      'sparko_oauth_state=real',
    );
    expect(bad.headers.get('location')).toBe('/signin?error=expired');
    expect(cookieOf(bad, 'sparko_session')).toBeUndefined();
    const cancelled = await get(
      '/api/v1/auth/discord/callback?error=access_denied',
    );
    expect(cancelled.headers.get('location')).toBe(
      '/signin?error=access_denied',
    );
  });

  it('keeps signed-out people out of the server list', async () => {
    expect((await get('/api/v1/servers')).status).toBe(401);
    expect(await (await get('/api/v1/session')).json()).toEqual({
      user: null,
      allowed: false,
    });
  });

  it('signs out only from this site', async () => {
    const { session } = await signIn();
    const elsewhere = await fetch(base + '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: session, origin: 'https://evil.example' },
    });
    expect(elsewhere.status).toBe(403);
    const out = await fetch(base + '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: session, origin: site },
    });
    expect(out.status).toBe(204);
    const after = (await (await get('/api/v1/session', session)).json()) as {
      user: unknown;
    };
    expect(after.user).toBeNull();
  });

  it('adds the bot to a chosen server without Administrator', async () => {
    const res = await get('/api/v1/invite?guild=9002');
    const to = new URL(res.headers.get('location')!);
    expect(to.searchParams.get('guild_id')).toBe('9002');
    expect(to.searchParams.get('scope')).toBe('bot applications.commands');
    expect(BigInt(to.searchParams.get('permissions')!) & 0x8n).toBe(0n);
    expect(botPermissions & 0x8n).toBe(0n);
  });
});

describe('dashboard before it opens', () => {
  /** A site whose dashboard opens at `opensAt`, for the users listed. */
  async function site(users: string[], clock: { now: number }) {
    const auth = createAuth({
      db: openDb(':memory:'),
      clientId: 'client-1',
      clientSecret: 'secret-1',
      botToken: 'bot-token',
      publicUrl: 'https://panel.example',
      fetch: discord as typeof fetch,
      dashboardUsers: users,
      dashboardOpensAt: Date.parse('2026-10-31T15:00:00Z'),
      now: () => clock.now,
    });
    const s = createServer((req, res) => {
      void auth.handle(req, res).then((handled) => {
        if (!handled) res.writeHead(418).end();
      });
    });
    await new Promise<void>((done) => s.listen(0, '127.0.0.1', done));
    const at = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    const call = (path: string, cookie = '') =>
      fetch(at + path, { redirect: 'manual', headers: { cookie } });
    const start = await call('/api/v1/auth/discord');
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    )!;
    const back = await call(
      `/api/v1/auth/discord/callback?code=good&state=${state}`,
      cookieOf(start, 'sparko_oauth_state')!,
    );
    const session = cookieOf(back, 'sparko_session')!;
    return { s, call, session };
  }

  it('lets only listed users in until it opens, then everyone', async () => {
    const clock = { now: Date.parse('2026-10-31T14:58:00Z') };
    const { s, call, session } = await site(['222'], clock);
    try {
      const health = (await (await call('/api/v1/health')).json()) as {
        dashboard: unknown;
      };
      expect(health.dashboard).toEqual({
        open: false,
        opensAt: '2026-10-31T15:00:00.000Z',
      });
      expect(
        await (await call('/api/v1/session', session)).json(),
      ).toMatchObject({ allowed: false });
      const refused = await call('/api/v1/servers', session);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: 'not_open_yet' });

      clock.now = Date.parse('2026-10-31T15:00:01Z');
      expect(
        await (await call('/api/v1/session', session)).json(),
      ).toMatchObject({ allowed: true });
      expect((await call('/api/v1/servers', session)).status).toBe(200);
    } finally {
      s.close();
    }
  });

  it('lets listed users in before it opens', async () => {
    const clock = { now: Date.parse('2026-10-20T00:00:00Z') };
    const { s, call, session } = await site(['111111111111111111'], clock);
    try {
      expect(
        await (await call('/api/v1/session', session)).json(),
      ).toMatchObject({ allowed: true });
      expect((await call('/api/v1/servers', session)).status).toBe(200);
    } finally {
      s.close();
    }
  });
});
