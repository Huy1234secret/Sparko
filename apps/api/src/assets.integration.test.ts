import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createDatabase, json } from '@sparko/db';
import { normalizeUploadedImage } from '@sparko/rendering';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import { testConfig } from '../test/fixtures.js';
import { createApp } from './app.js';
import { digest, encrypt } from './auth.js';
import type { DiscordAdapter } from './discord.js';

const storageHook = vi.hoisted(() => ({
  beforeWrite: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...fs,
    writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
      if (String(args[0]).endsWith('.pending'))
        await storageHook.beforeWrite?.();
      return fs.writeFile(...args);
    },
  };
});

const GUILD = '934000000000000001',
  USER = '934000000000000002';
const db = createDatabase(testDatabaseUrl()),
  config = testConfig(testDatabaseUrl());
const discord: DiscordAdapter = {
  exchange: async () => ({
    access_token: 'asset-access',
    refresh_token: 'refresh',
    expires_in: 3600,
  }),
  refresh: async () => ({
    access_token: 'asset-access',
    refresh_token: 'refresh',
    expires_in: 3600,
  }),
  user: async () => ({ id: USER, username: 'Asset test' }),
  guilds: async () => [
    { id: GUILD, name: 'Asset tests', owner: true, permissions: '8' },
  ],
  member: async () => ({ roles: [] }),
  channels: async () => [],
  roles: async () => [],
  emojis: async () => [],
};
let app: Awaited<ReturnType<typeof createApp>>,
  directory: string,
  png: Buffer,
  otherPng: Buffer;
const headers = (key: string) => ({
  origin: config.PUBLIC_APP_URL,
  'x-csrf-token': 'asset-reservation-csrf',
  'idempotency-key': key,
  cookie: 'sparko=asset-reservation-session',
});
const upload = (key: string, changes: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/guilds/${GUILD}/assets`,
    headers: headers(key),
    payload: {
      name: 'Test image',
      alt: 'A test pixel',
      base64: png.toString('base64'),
      visibility: 'public',
      publicSharingAcknowledged: true,
      ...changes,
    },
  });
async function seedAssets(count: number, bytes = 24, state = 'clean') {
  await db.record.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      guildId: GUILD,
      kind: 'asset',
      key: `seed:${index}`,
      ownerId: USER,
      state,
      data: json({
        hash: 'ab'.repeat(32),
        bytes,
        width: 1,
        height: 1,
        mime: 'image/png',
        name: 'Reserved image',
        alt: 'Reserved image',
        visibility: 'public',
      }),
    })),
  });
}
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'sparko-assets-'));
  png = await readFile(
    new URL(
      '../../../packages/assets/media/discord/ticket.png',
      import.meta.url,
    ),
  );
  otherPng = await readFile(
    new URL(
      '../../../packages/assets/media/discord/trophy.png',
      import.meta.url,
    ),
  );
  config.STORAGE_PATH = directory;
  await db.user.deleteMany({ where: { id: USER } });
  await db.user.create({ data: { id: USER, username: 'Asset test' } });
  await db.session.create({
    data: {
      id: digest('asset-reservation-session'),
      userId: USER,
      csrfHash: digest('asset-reservation-csrf'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await db.oAuthCredential.create({
    data: {
      userId: USER,
      encryptedToken: encrypt('asset-access', config.TOKEN_ENCRYPTION_KEY),
      encryptedRefresh: encrypt('refresh', config.TOKEN_ENCRYPTION_KEY),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  app = await createApp({ db, config, discord });
});
beforeEach(async () => {
  storageHook.beforeWrite = undefined;
  config.STORAGE_PATH = directory;
  await db.guild.deleteMany({ where: { id: GUILD } });
  await db.guild.create({
    data: { id: GUILD, name: 'Asset tests', installed: true },
  });
  await rm(resolve(directory, 'assets'), { recursive: true, force: true });
});
afterAll(async () => {
  await app?.close();
  await db.guild.deleteMany({ where: { id: GUILD } });
  await db.user.deleteMany({ where: { id: USER } });
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});

describe('Durable image upload storage against PostgreSQL', () => {
  it('rejects conflicting replay before writing and returns the original completed upload', async () => {
    const first = await upload('replay');
    expect(first.statusCode).toBe(200);
    expect((await upload('replay')).json().data.id).toBe(first.json().data.id);
    const conflict = await upload('replay', {
      base64: otherPng.toString('base64'),
    });
    expect(conflict.statusCode).toBe(409);
    expect(await readdir(resolve(directory, 'assets'))).toHaveLength(1);
    expect(
      await db.record.count({ where: { guildId: GUILD, kind: 'asset' } }),
    ).toBe(1);
  });
  it('keeps failed filesystem writes pending, private, and charged until the same request resumes', async () => {
    const blockedPath = resolve(directory, 'blocked');
    await writeFile(blockedPath, 'not a directory');
    config.STORAGE_PATH = blockedPath;
    expect((await upload('interrupted')).statusCode).toBe(503);
    const reservation = await db.record.findFirstOrThrow({
      where: { guildId: GUILD, kind: 'asset' },
    });
    expect(reservation.state).toBe('pending');
    expect(await db.operation.count({ where: { guildId: GUILD } })).toBe(0);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/public/assets/${reservation.id}`,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await upload('interrupted', { name: 'A changed reservation' }))
        .statusCode,
    ).toBe(409);
    config.STORAGE_PATH = directory;
    await mkdir(resolve(directory, 'assets'));
    const priorLeaseId = (reservation.data as { storageLeaseId: string })
      .storageLeaseId;
    await writeFile(
      resolve(directory, 'assets', `${reservation.id}.${priorLeaseId}.pending`),
      'interrupted temporary bytes',
    );
    const resumed = await upload('interrupted');
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().data.id).toBe(reservation.id);
    expect(
      (await db.record.findUniqueOrThrow({ where: { id: reservation.id } }))
        .state,
    ).toBe('clean');
    expect(await readdir(resolve(directory, 'assets'))).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/public/assets/${reservation.id}`,
        })
      ).statusCode,
    ).toBe(200);
  });
  it('serializes concurrent final-slot reservations before either writes a file', async () => {
    await seedAssets(99);
    const responses = await Promise.all([upload('slot-a'), upload('slot-b')]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 429,
    ]);
    expect(
      await db.record.count({ where: { guildId: GUILD, kind: 'asset' } }),
    ).toBe(100);
    expect(await readdir(resolve(directory, 'assets'))).toHaveLength(1);
  });
  it('includes interrupted reservations in both metadata and byte budgets', async () => {
    await seedAssets(100, 24, 'pending');
    expect((await upload('count-full')).statusCode).toBe(429);
    await db.record.deleteMany({ where: { guildId: GUILD, kind: 'asset' } });
    await seedAssets(12, 4 * 1024 * 1024, 'pending');
    const image = await normalizeUploadedImage(png);
    await db.record.create({
      data: {
        guildId: GUILD,
        kind: 'asset',
        key: 'last-byte',
        state: 'pending',
        data: json({
          hash: 'cd'.repeat(32),
          bytes: 2 * 1024 * 1024 - image.bytes + 1,
          width: 1,
          height: 1,
          mime: 'image/png',
          name: 'Pending bytes',
          alt: 'Pending bytes',
          visibility: 'public',
        }),
      },
    });
    expect((await upload('bytes-full')).statusCode).toBe(429);
    await expect(readdir(resolve(directory, 'assets'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('keeps private completed uploads inaccessible from the public route', async () => {
    const response = await upload('private', {
      visibility: 'private',
      publicSharingAcknowledged: false,
    });
    expect(response.statusCode).toBe(200);
    const id = response.json().data.id;
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/public/assets/${id}` }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/guilds/${GUILD}/assets/${id}/download`,
          headers: headers('read'),
        })
      ).statusCode,
    ).toBe(200);
  });
  it('keeps one filesystem owner when the same unfinished upload is submitted concurrently', async () => {
    let reached!: () => void, release!: () => void;
    const storing = new Promise<void>((resolve) => {
        reached = resolve;
      }),
      continueStorage = new Promise<void>((resolve) => {
        release = resolve;
      });
    storageHook.beforeWrite = async () => {
      storageHook.beforeWrite = undefined;
      reached();
      await continueStorage;
    };
    const first = upload('one-owner');
    await storing;
    try {
      expect((await upload('one-owner')).statusCode).toBe(503);
      expect(
        await db.record.count({ where: { guildId: GUILD, kind: 'asset' } }),
      ).toBe(1);
    } finally {
      release();
    }
    expect((await first).statusCode).toBe(200);
    expect((await upload('one-owner')).statusCode).toBe(200);
    expect(await readdir(resolve(directory, 'assets'))).toHaveLength(1);
  });
  it('rejects session revocation during storage without exposing or orphaning retained bytes', async () => {
    storageHook.beforeWrite = async () => {
      storageHook.beforeWrite = undefined;
      await db.session.deleteMany({
        where: { id: digest('asset-reservation-session') },
      });
    };
    expect((await upload('revoked-during-write')).statusCode).toBe(401);
    const pending = await db.record.findFirstOrThrow({
      where: { guildId: GUILD, kind: 'asset' },
    });
    expect(pending.state).toBe('pending');
    expect(await db.operation.count({ where: { guildId: GUILD } })).toBe(0);
    expect(await readdir(resolve(directory, 'assets'))).toHaveLength(1);
    expect(
      (await app.inject({ url: `/api/v1/public/assets/${pending.id}` }))
        .statusCode,
    ).toBe(404);
    await db.session.create({
      data: {
        id: digest('asset-reservation-session'),
        userId: USER,
        csrfHash: digest('asset-reservation-csrf'),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const resumed = await upload('revoked-during-write');
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().data.id).toBe(pending.id);
    expect(await readdir(resolve(directory, 'assets'))).toHaveLength(1);
  });
});
