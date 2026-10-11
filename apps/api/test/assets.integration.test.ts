import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@sparko/db';
import { createApp } from '../src/app.js';
import { digest, encrypt } from '../src/auth.js';
import { fakeDiscord, testConfig } from './fixtures.js';
import { testDatabaseUrl } from '../../../tools/test-targets.js';

const db = createDatabase(testDatabaseUrl()),
  userId = '815678901234567890',
  guildId = '815678901234567891',
  otherGuild = '815678901234567892';
const config = testConfig(testDatabaseUrl());
const headers = {
  origin: config.PUBLIC_APP_URL,
  cookie: 'sparko=asset-session; sparko_csrf=asset-csrf',
  'x-csrf-token': 'asset-csrf',
  'idempotency-key': 'asset-private',
};
let app: Awaited<ReturnType<typeof createApp>>, storage: string, base64: string;
beforeAll(async () => {
  await db.guild.deleteMany({ where: { id: { in: [guildId, otherGuild] } } });
  await db.user.deleteMany({ where: { id: userId } });
  storage = await mkdtemp(join(tmpdir(), 'sparko-media-test-'));
  config.STORAGE_PATH = storage;
  base64 = (
    await readFile(
      new URL(
        '../../../packages/assets/media/discord/ticket.png',
        import.meta.url,
      ),
    )
  ).toString('base64');
  await db.guild.createMany({
    data: [
      { id: guildId, name: 'Media test', installed: true },
      { id: otherGuild, name: 'Other media test', installed: true },
    ],
    skipDuplicates: true,
  });
  await db.user.upsert({
    where: { id: userId },
    create: { id: userId, username: 'Media tester' },
    update: {},
  });
  await db.session.create({
    data: {
      id: digest('asset-session'),
      userId,
      csrfHash: digest('asset-csrf'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.oAuthCredential.create({
    data: {
      userId,
      encryptedToken: encrypt('asset-access', config.TOKEN_ENCRYPTION_KEY),
      encryptedRefresh: encrypt('asset-refresh', config.TOKEN_ENCRYPTION_KEY),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const discord = fakeDiscord();
  discord.guilds = async () => [
    { id: guildId, name: 'Media test', owner: true, permissions: '8' },
    { id: otherGuild, name: 'Other media test', owner: true, permissions: '8' },
  ];
  app = await createApp({ db, config, discord });
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  await rm(storage, { recursive: true, force: true });
});

describe('persistent, scoped image library', () => {
  it('deduplicates upload operations and protects private bytes from public and cross-tenant reads', async () => {
    const body = {
      name: 'Private ticket icon',
      alt: 'Ticket icon',
      base64,
      visibility: 'private',
    };
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${guildId}/assets`,
      headers,
      payload: body,
    });
    expect(first.statusCode).toBe(200);
    const dto = first.json().data;
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${guildId}/assets`,
      headers,
      payload: body,
    });
    expect(replay.json().data.id).toBe(dto.id);
    expect(await db.record.count({ where: { guildId, kind: 'asset' } })).toBe(
      1,
    );
    expect(
      (await app.inject({ url: `/api/v1/public/assets/${dto.id}` })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: `/api/v1/guilds/${otherGuild}/assets/${dto.id}/download`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
    const download = await app.inject({ url: dto.previewUrl, headers });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['cache-control']).toContain('no-store');
    expect(download.rawPayload.length).toBe(dto.bytes);
  });
  it('requires explicit public sharing, then serves only normalized bytes', async () => {
    const body = {
      name: 'Public icon',
      alt: 'Ticket icon',
      base64,
      visibility: 'public',
    };
    const missing = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${guildId}/assets`,
      headers: { ...headers, 'idempotency-key': 'asset-public' },
      payload: body,
    });
    expect(missing.statusCode).toBe(400);
    const uploaded = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${guildId}/assets`,
      headers: { ...headers, 'idempotency-key': 'asset-public' },
      payload: { ...body, publicSharingAcknowledged: true },
    });
    expect(uploaded.statusCode).toBe(200);
    const response = await app.inject({ url: uploaded.json().data.previewUrl });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });
  it('rejects active files and CSRF without creating an asset', async () => {
    const body = {
      name: 'Unsafe SVG',
      alt: 'test',
      base64: Buffer.from('<svg><script>alert(1)</script></svg>').toString(
        'base64',
      ),
      visibility: 'private',
    };
    const unsafe = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${guildId}/assets`,
      headers: { ...headers, 'idempotency-key': 'asset-unsafe' },
      payload: body,
    });
    expect(unsafe.statusCode).toBe(400);
    const csrf = await app.inject({
      method: 'POST',
      url: `/api/v1/guilds/${guildId}/assets`,
      headers: { ...headers, origin: 'https://untrusted.invalid' },
      payload: body,
    });
    expect(csrf.statusCode).toBe(403);
    expect(await db.record.count({ where: { guildId, kind: 'asset' } })).toBe(
      2,
    );
  });
});
