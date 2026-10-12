import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { createDatabase, json } from '@sparko/db';
import { TicketConfigSchema } from '@sparko/contracts';
import {
  communityConfigSchemas,
  economyConfigSchemas,
  providerConfigSchemas,
} from '@sparko/domain';
import { createApp } from './app.js';
import { digest, encrypt } from './auth.js';
import { BACKUP_LIMIT } from './config-tools.js';
import { testConfig } from '../test/fixtures.js';
import type { DiscordAdapter } from './discord.js';
import { testDatabaseUrl } from '../../../tools/test-targets.js';

const SOURCE = '931111111111111111',
  TARGET = '931111111111111112',
  CLOSED = '931111111111111113',
  ADMIN = '931111111111111114',
  MEMBER = '931111111111111115',
  SOURCE_CHANNEL = '931111111111111121',
  SOURCE_ROLE = '931111111111111122',
  TARGET_CHANNEL = '931111111111111131',
  TARGET_ROLE = '931111111111111132';
const guilds = [SOURCE, TARGET, CLOSED];
const db = createDatabase(testDatabaseUrl()),
  config = { ...testConfig(testDatabaseUrl()), OWNER_USER_IDS: ADMIN };
const role = (id: string) => ({
  id,
  name: id,
  position: 1,
  permissions: '0',
  managed: false,
  color: 0,
});
const discord: DiscordAdapter = {
  exchange: async () => ({
    access_token: 'admin-access',
    refresh_token: 'refresh',
    expires_in: 3600,
  }),
  refresh: async () => ({
    access_token: 'admin-access',
    refresh_token: 'refresh',
    expires_in: 3600,
  }),
  user: async () => ({ id: ADMIN, username: 'Backup admin' }),
  guilds: async (token) =>
    guilds.map((id) => ({
      id,
      name: id,
      owner: false,
      permissions: token === 'admin-access' ? '8' : '0',
    })),
  member: async () => ({ roles: [] }),
  botUser: async () => ({ id: config.DISCORD_CLIENT_ID }),
  emojis: async () => [],
  channels: async (guildId) => [
    {
      id: guildId === SOURCE ? SOURCE_CHANNEL : TARGET_CHANNEL,
      name: 'general',
      type: 0,
    },
  ],
  roles: async (guildId) => [
    role(guildId === SOURCE ? SOURCE_ROLE : TARGET_ROLE),
  ],
};
let app: Awaited<ReturnType<typeof createApp>>;
const headers = (userId: string, key: string) => ({
  origin: config.PUBLIC_APP_URL,
  'x-csrf-token': 'tools-csrf',
  'idempotency-key': key,
  cookie: `sparko=tools-session-${userId}; sparko_csrf=tools-csrf`,
});
async function identity(userId: string, token: string) {
  await db.user.create({ data: { id: userId, username: userId } });
  await db.session.create({
    data: {
      id: digest(`tools-session-${userId}`),
      userId,
      csrfHash: digest('tools-csrf'),
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
const levels = (channelId: string, roleId: string, multiplier = 2) => ({
  enabled: true,
  excludedRoleIds: [roleId],
  channelMultipliers: [{ channelId, multiplier }],
});
const schemas: Record<string, z.ZodType> = {
  tickets: TicketConfigSchema,
  ...communityConfigSchemas,
  ...economyConfigSchemas,
  ...providerConfigSchemas,
};
/** Saves settings the way the editor does: parsed, with defaults filled in. */
async function setConfig(guildId: string, featureId: string, raw: unknown) {
  const value = schemas[featureId]!.parse(raw),
    where = { guildId_featureId: { guildId, featureId } };
  await db.featureConfig.upsert({
    where,
    create: { guildId, featureId, revision: 1, config: json(value) },
    update: { revision: { increment: 1 }, config: json(value) },
  });
  return (await db.featureConfig.findUniqueOrThrow({ where })).revision;
}
const revisionOf = async (guildId: string, featureId: string) =>
  (
    await db.featureConfig.findUnique({
      where: { guildId_featureId: { guildId, featureId } },
    })
  )?.revision ?? 0;
type Json = Record<string, unknown>;
async function call(
  method: 'GET' | 'POST',
  url: string,
  payload?: unknown,
  key = crypto.randomUUID(),
  userId = ADMIN,
) {
  const result = await app.inject({
    method,
    url: `/api/v1${url}`,
    headers: headers(userId, key),
    ...(payload === undefined ? {} : { payload: payload as Json }),
  });
  return { status: result.statusCode, body: result.json<Json>() };
}
const data = <T = Json>(r: { body: Json }) => r.body['data'] as T;
const errorOf = (r: { body: Json }) =>
  r.body['error'] as { code: string; fieldErrors?: { path: string }[] };

beforeAll(async () => {
  await db.guild.deleteMany({ where: { id: { in: guilds } } });
  await db.user.deleteMany({ where: { id: { in: [ADMIN, MEMBER] } } });
  await db.guild.createMany({
    data: guilds.map((id) => ({ id, name: id, installed: true })),
  });
  await identity(ADMIN, 'admin-access');
  await identity(MEMBER, 'member-access');
  app = await createApp({ db, config, discord });
});
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
});

describe('configuration backups', () => {
  it('snapshots module settings but never access, billing, consent or public settings', async () => {
    await setConfig(SOURCE, 'R09', levels(SOURCE_CHANNEL, SOURCE_ROLE));
    await setConfig(SOURCE, 'R65', {
      enabled: true,
      dataSharingAcknowledged: true,
    });
    await setConfig(SOURCE, 'R70', { enabled: true, publicStatus: true });
    const denied = await call(
      'POST',
      `/guilds/${SOURCE}/backups`,
      { label: 'Nope' },
      undefined,
      MEMBER,
    );
    expect(denied.status).toBe(403);
    const created = await call('POST', `/guilds/${SOURCE}/backups`, {
      label: 'Before launch',
    });
    expect(created.status).toBe(200);
    const backup = data<{ id: string; featureIds: string[] }>(created);
    expect(backup.featureIds).toEqual(['R09']);
    const file = data<Json>(
      await call('GET', `/guilds/${SOURCE}/backups/${backup.id}`),
    );
    expect(file).toMatchObject({
      format: 'sparko.config-backup',
      version: 1,
      guildId: SOURCE,
      label: 'Before launch',
      features: [{ featureId: 'R09', revision: 1 }],
    });
    expect(JSON.stringify(file)).not.toContain('dataSharingAcknowledged');
    const list = data<{ backups: { id: string }[]; limit: number }>(
      await call('GET', `/guilds/${SOURCE}/backups`),
    );
    expect(list.limit).toBe(BACKUP_LIMIT);
    expect(list.backups.map((b) => b.id)).toContain(backup.id);
  });

  it('previews and restores only under the previewed revisions', async () => {
    const backup = data<{ id: string }>(
      await call('POST', `/guilds/${SOURCE}/backups`, { label: 'Known good' }),
    );
    const changedRevision = await setConfig(
      SOURCE,
      'R09',
      levels(SOURCE_CHANNEL, SOURCE_ROLE, 5),
    );
    const preview = data<{
      changes: {
        featureId: string;
        changed: boolean;
        expectedRevision: number;
      }[];
    }>(
      await call('POST', `/guilds/${SOURCE}/backups/${backup.id}/preview`, {}),
    );
    expect(preview.changes).toEqual([
      expect.objectContaining({
        featureId: 'R09',
        changed: true,
        expectedRevision: changedRevision,
      }),
    ]);
    // Someone else saves after the preview: nothing is restored.
    await setConfig(SOURCE, 'R09', levels(SOURCE_CHANNEL, SOURCE_ROLE, 3));
    const stale = await call(
      'POST',
      `/guilds/${SOURCE}/backups/${backup.id}/restore`,
      {
        featureIds: ['R09'],
        expectedRevisions: { R09: changedRevision },
      },
    );
    expect(stale.status).toBe(409);
    expect(errorOf(stale).code).toBe('REVISION_CONFLICT');
    const current = await revisionOf(SOURCE, 'R09');
    const restoreKey = crypto.randomUUID();
    const restore = () =>
      call(
        'POST',
        `/guilds/${SOURCE}/backups/${backup.id}/restore`,
        { featureIds: ['R09'], expectedRevisions: { R09: current } },
        restoreKey,
      );
    expect((await restore()).status).toBe(200);
    // A retry with the same key replays instead of writing again.
    expect((await restore()).status).toBe(200);
    const saved = await db.featureConfig.findUniqueOrThrow({
      where: { guildId_featureId: { guildId: SOURCE, featureId: 'R09' } },
    });
    expect(saved.revision).toBe(current + 1);
    expect(saved.config).toMatchObject({
      channelMultipliers: [{ channelId: SOURCE_CHANNEL, multiplier: 2 }],
    });
    expect(
      await db.auditLog.count({
        where: { guildId: SOURCE, action: 'backup.restore' },
      }),
    ).toBe(1);
  });

  it('imports another server’s file and restores it only once every channel and role is remapped', async () => {
    const file = data<Json>(
      await call(
        'GET',
        `/guilds/${SOURCE}/backups/${
          data<{ backups: { id: string }[] }>(
            await call('GET', `/guilds/${SOURCE}/backups`),
          ).backups[0]!.id
        }`,
      ),
    );
    const tampered = await call('POST', `/guilds/${TARGET}/backups/import`, {
      ...file,
      features: [{ featureId: 'R09', revision: 1, config: { enabled: 'yes' } }],
    });
    expect(tampered.status).toBe(400);
    expect(errorOf(tampered).fieldErrors?.[0]?.path).toBe('R09.enabled');
    const imported = data<{
      id: string;
      origin: string;
      sourceGuildId: string;
    }>(await call('POST', `/guilds/${TARGET}/backups/import`, file));
    expect(imported).toMatchObject({ origin: 'import', sourceGuildId: SOURCE });
    const preview = data<{
      changes: { missing: { channels: unknown[]; roles: unknown[] } }[];
    }>(
      await call(
        'POST',
        `/guilds/${TARGET}/backups/${imported.id}/preview`,
        {},
      ),
    );
    expect(preview.changes[0]!.missing.channels).toHaveLength(1);
    expect(preview.changes[0]!.missing.roles).toHaveLength(1);
    const unmapped = await call(
      'POST',
      `/guilds/${TARGET}/backups/${imported.id}/restore`,
      { featureIds: ['R09'], expectedRevisions: { R09: 0 } },
    );
    expect(unmapped.status).toBe(400);
    expect(
      errorOf(unmapped)
        .fieldErrors?.map((e) => e.path)
        .sort(),
    ).toEqual(['R09.channelMultipliers.0.channelId', 'R09.excludedRoleIds.0']);
    expect(await revisionOf(TARGET, 'R09')).toBe(0);
    const remap = {
      channels: { [SOURCE_CHANNEL]: TARGET_CHANNEL },
      roles: { [SOURCE_ROLE]: TARGET_ROLE },
    };
    const mapped = await call(
      'POST',
      `/guilds/${TARGET}/backups/${imported.id}/restore`,
      { featureIds: ['R09'], expectedRevisions: { R09: 0 }, remap },
    );
    expect(mapped.status).toBe(200);
    expect(
      (
        await db.featureConfig.findUniqueOrThrow({
          where: { guildId_featureId: { guildId: TARGET, featureId: 'R09' } },
        })
      ).config,
    ).toMatchObject(levels(TARGET_CHANNEL, TARGET_ROLE));
  });

  it('restores ticket settings only into a real category, like the editor', async () => {
    await setConfig(SOURCE, 'tickets', {
      enabled: true,
      categoryChannelId: SOURCE_CHANNEL,
    });
    const backup = data<{ id: string }>(
      await call('POST', `/guilds/${SOURCE}/backups`, { label: 'Tickets' }),
    );
    const refused = await call(
      'POST',
      `/guilds/${SOURCE}/backups/${backup.id}/restore`,
      {
        featureIds: ['tickets'],
        expectedRevisions: { tickets: await revisionOf(SOURCE, 'tickets') },
      },
    );
    expect(refused.status).toBe(400);
    expect(errorOf(refused).fieldErrors?.map((e) => e.path)).toEqual([
      'tickets.categoryChannelId',
    ]);
  });

  it('keeps a bounded number of backups and deletes on request', async () => {
    const before = await db.record.count({
      where: { guildId: CLOSED, kind: 'config.backup' },
    });
    await db.record.createMany({
      data: Array.from({ length: BACKUP_LIMIT - before }, (_, i) => ({
        guildId: CLOSED,
        kind: 'config.backup',
        key: `filler-${i}`,
        ownerId: ADMIN,
        data: { label: `Filler ${i}`, origin: 'snapshot', features: [] },
      })),
    });
    const full = await call('POST', `/guilds/${CLOSED}/backups`, {
      label: 'One too many',
    });
    expect(full.status).toBe(409);
    expect(errorOf(full).code).toBe('PLAN_LIMIT');
    const oldest = await db.record.findFirstOrThrow({
      where: { guildId: CLOSED, kind: 'config.backup' },
    });
    expect(
      (await call('POST', `/guilds/${CLOSED}/backups/${oldest.id}/delete`, {}))
        .status,
    ).toBe(200);
    expect(
      (await call('POST', `/guilds/${CLOSED}/backups`, { label: 'Fits now' }))
        .status,
    ).toBe(200);
  });
});

describe('multi-server rollout', () => {
  const optIn = (rollout: boolean) => ({
    enabled: true,
    allowComparison: true,
    allowRollout: rollout,
  });
  const plus = (guildId: string) =>
    db.record.create({
      data: {
        guildId,
        kind: 'billing.entitlement',
        key: `staff-grant-${guildId}`,
        ownerId: ADMIN,
        state: 'active',
        data: {
          provider: 'staff',
          plan: 'plus',
          active: true,
          revoked: false,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    });

  it('needs Plus and opt-in on every server, and writes only remapped settings under previewed revisions', async () => {
    await setConfig(SOURCE, 'R61', optIn(false));
    await setConfig(TARGET, 'R61', optIn(true));
    await setConfig(SOURCE, 'R09', levels(SOURCE_CHANNEL, SOURCE_ROLE, 4));
    const body = {
      sourceGuildId: SOURCE,
      targetGuildIds: [TARGET],
      featureIds: ['R09', 'R65'],
      remaps: {
        [TARGET]: {
          channels: { [SOURCE_CHANNEL]: TARGET_CHANNEL },
          roles: { [SOURCE_ROLE]: TARGET_ROLE },
        },
      },
    };
    const free = await call('POST', '/multi-server/preview', body);
    expect(free.status).toBe(403);
    expect(errorOf(free)).toMatchObject({
      code: 'PLAN_REQUIRED',
      guildId: SOURCE,
    });
    await plus(SOURCE);
    await plus(TARGET);
    const preview = data<{
      excludedFeatures: string[];
      targets: {
        rolloutAllowed: boolean;
        changes: {
          featureId: string;
          expectedRevision: number;
          missing: { channels: unknown[]; roles: unknown[] };
        }[];
      }[];
    }>(await call('POST', '/multi-server/preview', body));
    expect(preview.excludedFeatures).toEqual(['R65']);
    const [target] = preview.targets;
    expect(target!.rolloutAllowed).toBe(true);
    expect(target!.changes).toEqual([
      expect.objectContaining({
        featureId: 'R09',
        missing: { channels: [], roles: [] },
      }),
    ]);
    const expectedRevisions = { R09: target!.changes[0]!.expectedRevision };
    const rollout = await call('POST', '/multi-server/rollout', {
      sourceGuildId: SOURCE,
      featureIds: ['R09'],
      targets: [
        { guildId: TARGET, expectedRevisions, remap: body.remaps[TARGET] },
      ],
    });
    expect(data<{ results: Json[] }>(rollout).results).toEqual([
      expect.objectContaining({ guildId: TARGET, status: 'applied' }),
    ]);
    expect(
      (
        await db.featureConfig.findUniqueOrThrow({
          where: { guildId_featureId: { guildId: TARGET, featureId: 'R09' } },
        })
      ).config,
    ).toMatchObject(levels(TARGET_CHANNEL, TARGET_ROLE, 4));
    // The same stale preview now conflicts instead of overwriting.
    const again = await call('POST', '/multi-server/rollout', {
      sourceGuildId: SOURCE,
      featureIds: ['R09'],
      targets: [
        { guildId: TARGET, expectedRevisions, remap: body.remaps[TARGET] },
      ],
    });
    expect(data<{ results: Json[] }>(again).results[0]).toMatchObject({
      status: 'unchanged',
    });
    await setConfig(SOURCE, 'R09', levels(SOURCE_CHANNEL, SOURCE_ROLE, 6));
    const stale = await call('POST', '/multi-server/rollout', {
      sourceGuildId: SOURCE,
      featureIds: ['R09'],
      targets: [
        { guildId: TARGET, expectedRevisions, remap: body.remaps[TARGET] },
      ],
    });
    expect(data<{ results: Json[] }>(stale).results[0]).toMatchObject({
      status: 'conflict',
    });
  });

  it('refuses servers that have not opted in and reports targets that only allow comparison', async () => {
    await plus(CLOSED);
    const closed = await call('POST', '/multi-server/preview', {
      sourceGuildId: SOURCE,
      targetGuildIds: [CLOSED],
      featureIds: ['R09'],
    });
    expect(closed.status).toBe(409);
    expect(errorOf(closed)).toMatchObject({
      code: 'FEATURE_DISABLED',
      guildId: CLOSED,
    });
    await setConfig(CLOSED, 'R61', { enabled: true });
    expect(
      (
        await call('POST', '/multi-server/preview', {
          sourceGuildId: SOURCE,
          targetGuildIds: [CLOSED],
          featureIds: ['R09'],
        })
      ).status,
    ).toBe(403);
    await setConfig(CLOSED, 'R61', optIn(false));
    const result = await call('POST', '/multi-server/rollout', {
      sourceGuildId: SOURCE,
      featureIds: ['R09'],
      targets: [{ guildId: CLOSED, expectedRevisions: { R09: 0 } }],
    });
    expect(data<{ results: Json[] }>(result).results).toEqual([
      expect.objectContaining({ guildId: CLOSED, status: 'not-allowed' }),
    ]);
    expect(await revisionOf(CLOSED, 'R09')).toBe(0);
  });
});
