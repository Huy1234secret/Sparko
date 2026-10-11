import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createDatabase } from '@sparko/db';
import { Platform, openTicket, claimTicket } from '@sparko/domain';
import { type Actor } from '@sparko/contracts';
import { defaultTicketDocument } from '@sparko/messages';
import { createApp } from '../src/app.js';
import { digest, encrypt } from '../src/auth.js';
import {
  fakeDiscord,
  testConfig,
  GUILD_A,
  GUILD_B,
  ADMIN,
  MEMBER,
  STAFF,
  CHANNEL,
} from './fixtures.js';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
const db = createDatabase(testDatabaseUrl()),
  config = testConfig(testDatabaseUrl()),
  platform = new Platform(db);
let app: Awaited<ReturnType<typeof createApp>>;
const actor = (userId = ADMIN, admin = true, guildId = GUILD_A): Actor => ({
  userId,
  guildId,
  roles: [],
  isAdmin: admin,
  isOwner: admin,
  capabilities: admin ? [] : ['tickets.manage'],
  globalCapabilities: [],
});
const headers = {
  origin: config.PUBLIC_APP_URL,
  'x-csrf-token': 'test-csrf',
  'idempotency-key': 'config-1',
  cookie: 'sparko=test-session; sparko_csrf=test-csrf',
};
beforeAll(async () => {
  await db.guild.createMany({
    data: [
      { id: GUILD_A, name: 'Test A', installed: true },
      { id: GUILD_B, name: 'Test B', installed: true },
    ],
    skipDuplicates: true,
  });
  await db.user.createMany({
    data: [
      { id: ADMIN, username: 'Admin' },
      { id: MEMBER, username: 'Member' },
      { id: STAFF, username: 'Staff' },
    ],
    skipDuplicates: true,
  });
  await db.session.create({
    data: {
      id: digest('test-session'),
      userId: ADMIN,
      csrfHash: digest('test-csrf'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.oAuthCredential.create({
    data: {
      userId: ADMIN,
      encryptedToken: encrypt('test-access', config.TOKEN_ENCRYPTION_KEY),
      encryptedRefresh: encrypt('test-refresh', config.TOKEN_ENCRYPTION_KEY),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  app = await createApp({ db, config, discord: fakeDiscord() });
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
describe('real PostgreSQL API ticket journey', () => {
  it('stores settings but accurately reports pending runtime', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/guilds/${GUILD_A}/features/tickets/config`,
      headers,
      payload: { expectedRevision: 0, config: { enabled: true } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.revision).toBe(1);
    expect(body.data.appliedRevision).toBe(0);
    expect(body.operation.deliveryStatus).toBe('pending');
    expect(
      await db.outbox.count({ where: { operationId: body.operation.id } }),
    ).toBe(1);
  });
  it('rejects stale edits and changed idempotency payloads', async () => {
    const stale = await app.inject({
      method: 'PUT',
      url: `/api/v1/guilds/${GUILD_A}/features/tickets/config`,
      headers: { ...headers, 'idempotency-key': 'config-stale' },
      payload: { expectedRevision: 0, config: { enabled: true } },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('REVISION_CONFLICT');
    const conflict = await app.inject({
      method: 'PUT',
      url: `/api/v1/guilds/${GUILD_A}/features/tickets/config`,
      headers,
      payload: { expectedRevision: 0, config: { enabled: false } },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('publishes a persisted panel with opaque restart-safe controls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${GUILD_A}/messages/publish`,
      headers: { ...headers, 'idempotency-key': 'panel-1' },
      payload: { channelId: CHANNEL, document: defaultTicketDocument },
    });
    expect(res.statusCode).toBe(200);
    const pub = await db.publication.findUniqueOrThrow({
        where: { id: res.json().data.id },
      }),
      control = await db.issuedControl.findFirstOrThrow({
        where: { publicationId: pub.id },
      });
    expect(pub.state).toBe('pending');
    expect(control.id).toMatch(/^spk:ctl:[A-Za-z0-9_-]+$/);
    expect(control.guildId).toBe(GUILD_A);
  });
  it('deduplicates ticket creation across parallel callers', async () => {
    const results = await Promise.all([
      platform.mutate(
        actor(MEMBER, false),
        'ticket.open',
        'same-interaction',
        { categoryId: 'general' },
        (ctx) => openTicket(ctx, { categoryId: 'general' }),
      ),
      platform.mutate(
        actor(MEMBER, false),
        'ticket.open',
        'same-interaction',
        { categoryId: 'general' },
        (ctx) => openTicket(ctx, { categoryId: 'general' }),
      ),
    ]);
    expect(results[0]?.data.id).toBe(results[1]?.data.id);
    expect(
      await db.ticket.count({ where: { guildId: GUILD_A, ownerId: MEMBER } }),
    ).toBe(1);
    expect(
      await db.outbox.count({
        where: { guildId: GUILD_A, type: 'ticket.create' },
      }),
    ).toBe(1);
  });
  it('allows exactly one concurrent staff claim', async () => {
    const t = await db.ticket.findFirstOrThrow({
      where: { guildId: GUILD_A, ownerId: MEMBER },
    });
    await db.ticket.update({
      where: { id: t.id },
      data: { state: 'open', channelId: CHANNEL },
    });
    const results = await Promise.allSettled([
      platform.mutate(actor(ADMIN), 'claim', 'a', { id: t.id }, (ctx) =>
        claimTicket(ctx, t.id, 1),
      ),
      platform.mutate(actor(STAFF, false), 'claim', 'b', { id: t.id }, (ctx) =>
        claimTicket(ctx, t.id, 1),
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const saved = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(saved.state).toBe('claimed');
    expect(saved.revision).toBe(2);
  });
  it('fails CSRF and cross-tenant access before data disclosure', async () => {
    const csrf = await app.inject({
      method: 'PUT',
      url: `/api/v1/guilds/${GUILD_A}/features/tickets/config`,
      headers: { ...headers, origin: 'https://attacker.invalid' },
      payload: { expectedRevision: 1, config: { enabled: true } },
    });
    expect(csrf.statusCode).toBe(403);
    const tenant = await app.inject({
      method: 'GET',
      url: `/api/v1/guilds/${GUILD_B}/tickets`,
      headers,
    });
    expect(tenant.statusCode).toBe(403);
  });
  it('rejects replayed OAuth state and revokes sessions on logout', async () => {
    await db.oAuthState.create({
      data: {
        id: digest('nonce'),
        verifierHash: digest('verifier'),
        returnTo: '/dashboard',
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const login = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/callback?code=test&state=nonce',
      headers: { cookie: 'sparko_oauth=verifier' },
    });
    expect(login.statusCode).toBe(302);
    const replay = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/callback?code=test&state=nonce',
      headers: { cookie: 'sparko_oauth=verifier' },
    });
    expect(replay.statusCode).toBe(302);
    expect(replay.headers['location']).toBe('/dashboard?signin=expired');
    const replayCookies = [replay.headers['set-cookie'] ?? []].flat();
    expect(replayCookies.some((value) => value.startsWith('sparko='))).toBe(
      false,
    );
    const cancelled = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/callback?error=access_denied&state=other',
    });
    expect(cancelled.headers['location']).toBe('/dashboard?signin=cancelled');
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/session/logout',
      headers,
    });
    expect(logout.statusCode).toBe(200);
    const read = await app.inject({
      method: 'GET',
      url: '/api/v1/session',
      headers,
    });
    expect(read.statusCode).toBe(401);
  });
});
