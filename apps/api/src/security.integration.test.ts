import { createHmac } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { createDatabase, json } from '@sparko/db';
import { encryptProviderSecret } from '@sparko/domain';
import { defaultTicketDocument } from '@sparko/messages';
import { createApp } from './app.js';
import { createAuth, digest, encrypt, decrypt } from './auth.js';
import { validatePublicationResources } from './publication-resources.js';
import { testConfig } from '../test/fixtures.js';
import type { DiscordAdapter } from './discord.js';
import { testDatabaseUrl } from '../../../tools/test-targets.js';

const GUILD = '911111111111111111',
  OTHER = '911111111111111112',
  ADMIN = '911111111111111113',
  MEMBER = '911111111111111114',
  STAFF_A = '911111111111111115',
  STAFF_B = '911111111111111116',
  DELETE_USER = '911111111111111117',
  CHANNEL = '911111111111111118',
  BOT = '911111111111111119';
const LEASE_USER = '911111111111111120',
  RACE_USER = '911111111111111121';
const db = createDatabase(testDatabaseUrl()),
  config = {
    ...testConfig(testDatabaseUrl()),
    OWNER_USER_IDS: ADMIN,
    DISCORD_CLIENT_ID: BOT,
  };
const providerEnv = {
  INTEGRATION_ENCRYPTION_KEY: '19'.repeat(32),
  STRIPE_WEBHOOK_SECRET: 'test-endpoint-signing-key',
};
const refresh = vi.fn(async () => ({
  access_token: 'member-access',
  refresh_token: 'rotated-refresh',
  expires_in: 3600,
}));
const discord: DiscordAdapter = {
  exchange: async () => ({
    access_token: 'admin-access',
    refresh_token: 'refresh',
    expires_in: 3600,
  }),
  refresh,
  user: async () => ({ id: ADMIN, username: 'API security admin' }),
  guilds: async (token) => [
    {
      id: GUILD,
      name: 'API security guild',
      owner: token === 'admin-access',
      permissions: token === 'admin-access' ? '8' : '0',
    },
  ],
  member: async (_guildId, id) => ({ roles: id === BOT ? [BOT] : [] }),
  botUser: async () => ({ id: BOT }),
  channels: async () => [{ id: CHANNEL, name: 'test', type: 0 }],
  roles: async () => [
    {
      id: BOT,
      name: 'Sparko',
      position: 10,
      permissions: '268435456',
      managed: true,
      color: 0,
    },
    {
      id: STAFF_A,
      name: 'Ordinary',
      position: 1,
      permissions: '0',
      managed: false,
      color: 0,
    },
    {
      id: STAFF_B,
      name: 'Administrator',
      position: 1,
      permissions: '8',
      managed: false,
      color: 0,
    },
  ],
};
let app: Awaited<ReturnType<typeof createApp>>;
const headers = (userId: string, key = 'action') => ({
  origin: config.PUBLIC_APP_URL,
  'x-csrf-token': 'security-csrf',
  'idempotency-key': key,
  cookie: `sparko=security-session-${userId}; sparko_csrf=security-csrf`,
});
async function identity(userId: string, token: string) {
  await db.user.create({ data: { id: userId, username: userId } });
  await db.session.create({
    data: {
      id: digest(`security-session-${userId}`),
      userId,
      csrfHash: digest('security-csrf'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.oAuthCredential.create({
    data: {
      userId,
      encryptedToken: encrypt(token, config.TOKEN_ENCRYPTION_KEY),
      encryptedRefresh: encrypt('refresh', config.TOKEN_ENCRYPTION_KEY),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
}
beforeAll(async () => {
  const userIds = [
    ADMIN,
    MEMBER,
    STAFF_A,
    STAFF_B,
    DELETE_USER,
    LEASE_USER,
    RACE_USER,
  ];
  await db.guild.deleteMany({ where: { id: { in: [GUILD, OTHER] } } });
  await db.accountRequest.deleteMany({ where: { userId: { in: userIds } } });
  await db.supportTicket.deleteMany({ where: { ownerId: { in: userIds } } });
  await db.globalGrant.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.guild.createMany({
    data: [
      { id: GUILD, name: 'API security', installed: true },
      { id: OTHER, name: 'Other security', installed: true },
    ],
  });
  for (const userId of [ADMIN, MEMBER, STAFF_A, STAFF_B, DELETE_USER])
    await identity(userId, userId === ADMIN ? 'admin-access' : 'member-access');
  await db.globalGrant.createMany({
    data: [
      {
        userId: STAFF_A,
        capabilities: ['support.reply'],
        expiresAt: new Date(Date.now() + 86400000),
      },
      {
        userId: STAFF_B,
        capabilities: ['support.reply', 'maintenance.manage'],
        expiresAt: new Date(Date.now() + 86400000),
      },
    ],
  });
  await db.auditLog.create({
    data: {
      guildId: GUILD,
      actorId: ADMIN,
      action: 'private.staff.audit',
      summary: { sensitive: 'private evidence' },
    },
  });
  await db.featureConfig.create({
    data: {
      guildId: GUILD,
      featureId: 'tickets',
      config: json({ enabled: true }),
      revision: 1,
    },
  });
  app = await createApp({ db, config, discord, providerEnv });
});
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
});

describe('API security against real PostgreSQL', () => {
  it('serializes OAuth refresh across separate API instances and retains rotation', async () => {
    await db.oAuthCredential.update({
      where: { userId: MEMBER },
      data: { expiresAt: new Date(0) },
    });
    const first = createAuth(db, config, discord),
      second = createAuth(db, config, discord);
    const tokens = await Promise.all([
      first.accessToken(MEMBER),
      second.accessToken(MEMBER),
      first.accessToken(MEMBER),
    ]);
    expect(tokens).toEqual(['member-access', 'member-access', 'member-access']);
    expect(refresh).toHaveBeenCalledTimes(1);
    const credential = await db.oAuthCredential.findUniqueOrThrow({
      where: { userId: MEMBER },
    });
    expect(
      decrypt(credential.encryptedRefresh, config.TOKEN_ENCRYPTION_KEY),
    ).toBe('rotated-refresh');
  });
  it('rejects a crashed expired refresh lease instead of replaying a possibly rotated token', async () => {
    await identity(LEASE_USER, 'member-access');
    await db.oAuthCredential.update({
      where: { userId: LEASE_USER },
      data: {
        expiresAt: new Date(0),
        refreshLeaseId: 'crashed-process',
        refreshLeaseUntil: new Date(0),
      },
    });
    const calls = refresh.mock.calls.length;
    await expect(
      createAuth(db, config, discord).accessToken(LEASE_USER),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(refresh.mock.calls).toHaveLength(calls);
    expect(
      await db.oAuthCredential.findUnique({ where: { userId: LEASE_USER } }),
    ).toBeNull();
  });
  it('rejects a session revoked while current Discord authority was being fetched', async () => {
    await identity(RACE_USER, 'admin-access');
    let announce!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        announce = resolve;
      }),
      proceed = new Promise<void>((resolve) => {
        release = resolve;
      });
    const racing = await createApp({
      db,
      config,
      discord: {
        ...discord,
        guilds: async (token) => {
          announce();
          await proceed;
          return discord.guilds(token);
        },
      },
    });
    const request = racing.inject({
      method: 'PUT',
      url: `/api/v1/guilds/${GUILD}/features/tickets/config`,
      headers: headers(RACE_USER, 'revoked-config'),
      payload: { expectedRevision: 1, config: { enabled: false } },
    });
    await reached;
    await db.session.delete({
      where: { id: digest(`security-session-${RACE_USER}`) },
    });
    release();
    const result = await request;
    expect(result.statusCode).toBe(401);
    expect(
      (
        await db.featureConfig.findUniqueOrThrow({
          where: {
            guildId_featureId: { guildId: GUILD, featureId: 'tickets' },
          },
        })
      ).revision,
    ).toBe(1);
    expect(
      await db.operation.count({
        where: { guildId: GUILD, actorId: RACE_USER },
      }),
    ).toBe(0);
    await racing.close();
  });
  it('checks revoked sessions before returning a prior idempotent result', async () => {
    await db.session.create({
      data: {
        id: digest(`security-session-${RACE_USER}`),
        userId: RACE_USER,
        csrfHash: digest('security-csrf'),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const payload = { expectedRevision: 0, config: { enabled: false } },
      url = `/api/v1/guilds/${GUILD}/features/R09/config`;
    const original = await app.inject({
      method: 'PUT',
      url,
      headers: headers(RACE_USER, 'guarded-replay'),
      payload,
    });
    expect(original.statusCode).toBe(200);
    let announce!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        announce = resolve;
      }),
      proceed = new Promise<void>((resolve) => {
        release = resolve;
      });
    const racing = await createApp({
      db,
      config,
      discord: {
        ...discord,
        guilds: async (token) => {
          announce();
          await proceed;
          return discord.guilds(token);
        },
      },
    });
    const request = racing.inject({
      method: 'PUT',
      url,
      headers: headers(RACE_USER, 'guarded-replay'),
      payload,
    });
    await reached;
    await db.session.delete({
      where: { id: digest(`security-session-${RACE_USER}`) },
    });
    release();
    const result = await request;
    expect(result.statusCode).toBe(401);
    expect(
      await db.operation.count({
        where: { guildId: GUILD, actorId: RACE_USER, scope: 'config:R09' },
      }),
    ).toBe(1);
    await racing.close();
  });
  it('keeps staff audit out of member overview and denies the audit endpoint', async () => {
    const member = await app.inject({
      url: `/api/v1/guilds/${GUILD}/overview`,
      headers: headers(MEMBER),
    });
    expect(member.statusCode).toBe(200);
    expect(member.json().data.activity).toEqual([]);
    const denied = await app.inject({
      url: `/api/v1/guilds/${GUILD}/audit`,
      headers: headers(MEMBER),
    });
    expect(denied.statusCode).toBe(403);
    const staff = await app.inject({
      url: `/api/v1/guilds/${GUILD}/overview`,
      headers: headers(ADMIN),
    });
    expect(
      staff
        .json()
        .data.activity.some(
          (row: { action: string }) => row.action === 'private.staff.audit',
        ),
    ).toBe(true);
  });
  it('returns honest unconfigured mandatory settings and mounts economy/provider routes', async () => {
    for (const id of ['R18', 'R39', 'R41', 'R51', 'R65']) {
      const response = await app.inject({
        url: `/api/v1/guilds/${GUILD}/features/${id}/config`,
        headers: headers(ADMIN),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.setupState).toBe('unconfigured');
      expect(response.json().data.config.enabled).toBe(false);
      if (['R18', 'R39', 'R41'].includes(id))
        expect(
          response.json().data.missingPrerequisites.length,
        ).toBeGreaterThan(0);
    }
    const economy = await app.inject({
      url: `/api/v1/guilds/${GUILD}/economy/me`,
      headers: headers(MEMBER),
    });
    expect(economy.statusCode).toBe(200);
    const providers = await app.inject({
      url: `/api/v1/guilds/${GUILD}/providers/status`,
      headers: headers(ADMIN),
    });
    expect(providers.statusCode).toBe(200);
    expect(providers.json().data.billing.liveVerified).toBe(false);
  });
  it('deduplicates support creation and atomically preserves concurrent staff replies', async () => {
    const input = { subject: 'Private request', message: 'First question' };
    const responses = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/account/support',
          headers: headers(MEMBER, 'support-create'),
          payload: input,
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    const id = responses[0]!.json().data.id;
    expect(responses[1]!.json().data.id).toBe(id);
    const replies = await Promise.all(
      [STAFF_A, STAFF_B].map((userId) =>
        app.inject({
          method: 'POST',
          url: `/api/v1/owner/support/${id}/reply`,
          headers: headers(userId, 'reply'),
          payload: { message: userId },
        }),
      ),
    );
    expect(replies.map((r) => r.statusCode)).toEqual([200, 200]);
    const repeat = await app.inject({
      method: 'POST',
      url: `/api/v1/owner/support/${id}/reply`,
      headers: headers(STAFF_A, 'reply'),
      payload: { message: STAFF_A },
    });
    expect(repeat.statusCode).toBe(200);
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/v1/owner/support/${id}/reply`,
      headers: headers(STAFF_A, 'reply'),
      payload: { message: 'changed' },
    });
    expect(conflict.statusCode).toBe(409);
    const saved = await db.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(saved.messages).toHaveLength(3);
    const privateRead = await app.inject({
      url: '/api/v1/owner/support',
      headers: headers(STAFF_A),
    });
    expect(privateRead.statusCode).toBe(403);
  });
  it('restricts global grant delegation to configured owners and known capabilities', async () => {
    const payload = {
      capabilities: ['diagnostics.read'],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      reason: 'Diagnostics only',
    };
    const denied = await app.inject({
      method: 'PUT',
      url: `/api/v1/owner/grants/${MEMBER}`,
      headers: headers(STAFF_B, 'grant-denied'),
      payload,
    });
    expect(denied.statusCode).toBe(403);
    const unknown = await app.inject({
      method: 'PUT',
      url: `/api/v1/owner/grants/${MEMBER}`,
      headers: headers(ADMIN, 'grant-secret'),
      payload: { ...payload, capabilities: ['provider.secrets.read'] },
    });
    expect(unknown.statusCode).toBe(400);
    const granted = await app.inject({
      method: 'PUT',
      url: `/api/v1/owner/grants/${MEMBER}`,
      headers: headers(ADMIN, 'grant-good'),
      payload,
    });
    expect(granted.statusCode).toBe(200);
    const maintenance = await app.inject({
      url: '/api/v1/owner/grants',
      headers: headers(MEMBER),
    });
    expect(maintenance.statusCode).toBe(403);
    const health = await app.inject({
      url: '/api/v1/owner/health',
      headers: headers(MEMBER),
    });
    expect(health.statusCode).toBe(200);
  });
  it('verifies callback exact raw bytes before writes and rejects replay content changes/revocation', async () => {
    await db.featureConfig.create({
      data: {
        guildId: GUILD,
        featureId: 'R69',
        config: json({ enabled: true }),
        revision: 1,
      },
    });
    const integration = await db.record.create({
      data: {
        guildId: GUILD,
        kind: 'webhook.integration',
        key: 'raw-body-test',
        data: json({
          name: 'Test integration',
          channelId: CHANNEL,
          allowedEvents: ['announcement'],
        }),
      },
    });
    const secret = 'test-signing-secret-with-32-characters';
    await db.record.create({
      data: {
        guildId: GUILD,
        kind: 'provider.secret',
        key: integration.id,
        data: json({
          encryptedSecret: encryptProviderSecret(
            secret,
            providerEnv.INTEGRATION_ENCRYPTION_KEY,
          ),
        }),
      },
    });
    const timestamp = String(Math.floor(Date.now() / 1000)),
      event = {
        eventId: 'security-raw',
        eventType: 'announcement',
        timestamp: new Date(Number(timestamp) * 1000).toISOString(),
        title: 'Signed',
        text: 'Exact bytes',
      },
      raw = JSON.stringify(event, null, 2);
    const sign = (body: string) =>
      createHmac('sha256', secret)
        .update(timestamp + '.')
        .update(body)
        .digest('hex');
    const callbackHeaders = {
        'content-type': 'application/json',
        'x-sparko-timestamp': timestamp,
        'x-sparko-signature': sign(raw),
      },
      url = `/api/v1/provider-events/${GUILD}/${integration.id}`;
    const forged = await app.inject({
      method: 'POST',
      url,
      headers: callbackHeaders,
      payload: JSON.stringify(event),
    });
    expect(forged.statusCode).toBe(403);
    expect(
      await db.record.count({
        where: { guildId: GUILD, kind: 'webhook.event' },
      }),
    ).toBe(0);
    const accepted = await app.inject({
      method: 'POST',
      url,
      headers: callbackHeaders,
      payload: raw,
    });
    expect(accepted.statusCode).toBe(200);
    const duplicate = await app.inject({
      method: 'POST',
      url,
      headers: callbackHeaders,
      payload: raw,
    });
    expect(duplicate.json().data.eventId).toBe(accepted.json().data.eventId);
    const changed = JSON.stringify({ ...event, text: 'Changed' }),
      conflict = await app.inject({
        method: 'POST',
        url,
        headers: { ...callbackHeaders, 'x-sparko-signature': sign(changed) },
        payload: changed,
      });
    expect(conflict.statusCode).toBe(409);
    expect(
      await db.outbox.count({
        where: { guildId: GUILD, type: 'provider.announcement' },
      }),
    ).toBe(1);
    await db.record.update({
      where: { id: integration.id },
      data: { state: 'revoked' },
    });
    const revoked = await app.inject({
      method: 'POST',
      url,
      headers: callbackHeaders,
      payload: raw,
    });
    expect(revoked.statusCode).toBe(403);
  });
  it('rejects private channel publication and privileged role controls before persisting', async () => {
    const doc = structuredClone(defaultTicketDocument);
    const privateResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${GUILD}/messages/publish`,
      headers: headers(ADMIN, 'private-publication'),
      payload: {
        channelId: CHANNEL,
        document: { ...doc, visibility: 'private' },
      },
    });
    expect(privateResponse.statusCode).toBe(400);
    const roleDocument = JSON.parse(
      JSON.stringify(doc).replace(
        '"type":"ticket.create","categoryId":"general"',
        `"type":"role.add","roleId":"${STAFF_B}"`,
      ),
    );
    const roleResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${GUILD}/messages/publish`,
      headers: headers(ADMIN, 'elevated-publication'),
      payload: { channelId: CHANNEL, document: roleDocument },
    });
    expect(roleResponse.statusCode).toBe(403);
    expect(await db.publication.count({ where: { guildId: GUILD } })).toBe(0);
  });
  it('validates published control records, poll choices and ordinary role hierarchy', async () => {
    const poll = await db.record.create({
      data: {
        guildId: GUILD,
        kind: 'poll',
        key: 'resource-poll',
        state: 'open',
        data: json({ choices: ['A', 'B'] }),
      },
    });
    const actor = {
      userId: ADMIN,
      guildId: GUILD,
      roles: [],
      isAdmin: false,
      isOwner: false,
      capabilities: ['messages.publish', 'community.manage'],
      globalCapabilities: [],
    };
    const document = {
      schemaVersion: 1,
      mode: 'embed',
      name: 'Validated poll',
      content: 'Choose',
      blocks: [
        {
          type: 'controls',
          controls: [
            {
              type: 'select',
              key: 'vote',
              options: [
                { label: 'A', value: '0' },
                { label: 'B', value: '1' },
              ],
              action: { type: 'vote.cast', pollId: poll.id },
            },
          ],
        },
      ],
    };
    await expect(
      validatePublicationResources(db, discord, config, actor, {
        channelId: CHANNEL,
        document,
      }),
    ).resolves.toBeUndefined();
    const invalid = structuredClone(document);
    invalid.blocks[0]!.controls[0]!.options[1]!.value = '9';
    await expect(
      validatePublicationResources(db, discord, config, actor, {
        channelId: CHANNEL,
        document: invalid,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const roleDocument = {
      schemaVersion: 1,
      mode: 'embed',
      name: 'Safe role',
      content: 'Choose',
      blocks: [
        {
          type: 'controls',
          controls: [
            {
              type: 'button',
              key: 'role',
              label: 'Role',
              style: 'primary',
              action: { type: 'role.add', roleId: STAFF_A },
            },
          ],
        },
      ],
    };
    await expect(
      validatePublicationResources(db, discord, config, actor, {
        channelId: CHANNEL,
        document: roleDocument,
      }),
    ).resolves.toBeUndefined();
    await expect(
      validatePublicationResources(
        db,
        discord,
        config,
        { ...actor, capabilities: ['messages.publish'] },
        { channelId: CHANNEL, document: roleDocument },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('expires private exports and deletes identity/access/opt-ins while retaining guild business history', async () => {
    const expired = await db.accountRequest.create({
      data: {
        userId: DELETE_USER,
        kind: 'export',
        state: 'ready',
        data: json({ private: true }),
        createdAt: new Date(Date.now() - 31 * 86400000),
      },
    });
    const expiredRead = await app.inject({
      url: `/api/v1/account/privacy/exports/${expired.id}`,
      headers: headers(DELETE_USER),
    });
    expect(expiredRead.statusCode).toBe(404);
    const liveExport = await app.inject({
      method: 'POST',
      url: '/api/v1/account/privacy/export',
      headers: headers(DELETE_USER, 'export'),
      payload: {},
    });
    expect(liveExport.statusCode).toBe(200);
    await db.supportTicket.create({
      data: {
        ownerId: DELETE_USER,
        subject: 'Remove private support',
        category: 'other',
        messages: json([]),
      },
    });
    await db.record.createMany({
      data: [
        {
          guildId: GUILD,
          kind: 'level.profile',
          key: DELETE_USER,
          ownerId: DELETE_USER,
          data: json({ xp: 123, publicProfile: true }),
        },
        {
          guildId: GUILD,
          kind: 'birthday',
          key: DELETE_USER,
          ownerId: DELETE_USER,
          data: json({ month: 1, day: 1 }),
        },
        {
          guildId: GUILD,
          kind: 'economy.reward',
          key: DELETE_USER,
          ownerId: DELETE_USER,
          data: json({ amount: '100' }),
        },
      ],
    });
    const deleted = await app.inject({
      method: 'POST',
      url: '/api/v1/account/privacy/deletion',
      headers: headers(DELETE_USER, 'delete'),
      payload: { reason: 'Remove my identity' },
    });
    expect(deleted.statusCode).toBe(200);
    expect(await db.session.count({ where: { userId: DELETE_USER } })).toBe(0);
    expect(
      await db.oAuthCredential.count({ where: { userId: DELETE_USER } }),
    ).toBe(0);
    expect(
      await db.supportTicket.count({ where: { ownerId: DELETE_USER } }),
    ).toBe(0);
    expect(
      await db.accountRequest.count({
        where: { userId: DELETE_USER, kind: 'export' },
      }),
    ).toBe(0);
    const user = await db.user.findUniqueOrThrow({
      where: { id: DELETE_USER },
    });
    expect(user.preferences).toMatchObject({
      notifications: false,
      publicProfile: false,
      motion: false,
    });
    expect(
      (
        await db.record.findUniqueOrThrow({
          where: {
            guildId_kind_key: {
              guildId: GUILD,
              kind: 'level.profile',
              key: DELETE_USER,
            },
          },
        })
      ).data,
    ).toMatchObject({ xp: 123, publicProfile: false });
    expect(
      (
        await db.record.findUniqueOrThrow({
          where: {
            guildId_kind_key: {
              guildId: GUILD,
              kind: 'birthday',
              key: DELETE_USER,
            },
          },
        })
      ).state,
    ).toBe('cancelled');
    expect(
      await db.record.count({
        where: { guildId: GUILD, ownerId: DELETE_USER, kind: 'economy.reward' },
      }),
    ).toBe(1);
    expect(
      (
        await app.inject({
          url: '/api/v1/session',
          headers: headers(DELETE_USER),
        })
      ).statusCode,
    ).toBe(401);
  });
});
