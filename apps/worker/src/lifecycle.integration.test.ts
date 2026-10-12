import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDatabase, json } from '@sparko/db';
import {
  Platform,
  guildReinstalled,
  guildRemoved,
  REMOVAL_GRACE_DAYS,
} from '@sparko/domain';
import type { Actor } from '@sparko/contracts';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import { DiscordRest } from './discord.js';
import { processOutbox } from './runner.js';

const guildId = '743456789012345671',
  otherGuild = '743456789012345672',
  memberId = '943456789012345673',
  botId = '943456789012345674';
const db = createDatabase(testDatabaseUrl()),
  platform = new Platform(db),
  discord = new DiscordRest('', botId);
const bot = (id: string): Actor => ({
  userId: botId,
  guildId: id,
  roles: [],
  isAdmin: false,
  isOwner: false,
  capabilities: [],
  globalCapabilities: [],
});
const hashA = 'a'.repeat(64),
  hashShared = 'b'.repeat(64);
let storage = '';

async function seed() {
  await db.guild.createMany({
    data: [
      { id: guildId, name: 'Leaving', installed: true, memberCount: 40 },
      { id: otherGuild, name: 'Staying', installed: true },
    ],
  });
  await db.featureConfig.create({
    data: { guildId, featureId: 'R09', config: { enabled: true } },
  });
  await db.featurePolicy.create({
    data: {
      guildId,
      featureId: 'R09',
      allowed: false,
      reason: 'Abuse',
      actorId: memberId,
    },
  });
  await db.record.createMany({
    data: [
      {
        guildId,
        kind: 'level.profile',
        key: memberId,
        ownerId: memberId,
        data: { xp: 10 },
      },
      { guildId, kind: 'asset', key: 'a', data: { hash: hashA } },
      { guildId, kind: 'asset', key: 'shared', data: { hash: hashShared } },
      {
        guildId: otherGuild,
        kind: 'asset',
        key: 'shared',
        data: { hash: hashShared },
      },
      {
        guildId,
        kind: 'billing.entitlement',
        key: 'paid',
        data: { plan: 'plus' },
      },
    ],
  });
  await db.ticket.create({
    data: {
      guildId,
      number: 1,
      ownerId: memberId,
      channelId: '943456789012345675',
      state: 'closed',
      snapshot: {},
      answers: {},
      participants: [memberId],
    },
  });
  await db.transcript.create({
    data: {
      guildId,
      ticketId: 't',
      messages: json([{ content: 'private' }]),
      status: 'complete',
      checksum: 'x',
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const account = await db.ledgerAccount.create({
    data: { guildId, ownerId: memberId, balance: 0n },
  });
  const tx = await db.ledgerTransaction.create({
    data: { guildId, key: 'seed', kind: 'grant' },
  });
  await db.ledgerEntry.create({
    data: { transactionId: tx.id, accountId: account.id, amount: 0n },
  });
  for (const hash of [hashA, hashShared])
    await writeFile(resolve(storage, 'assets', `${hash}.png`), 'png');
}
const removeBot = () =>
  platform.mutate(
    bot(guildId),
    'gateway.observe',
    `remove-${Date.now()}`,
    {},
    guildRemoved,
  );
async function runDuePurges() {
  const jobs = await db.outbox.findMany({
    where: { guildId, type: 'guild.purge', state: 'pending' },
  });
  for (const job of jobs) {
    await db.outbox.update({
      where: { id: job.id },
      data: { dueAt: new Date() },
    });
    await processOutbox(db, discord, job.id);
  }
  return jobs;
}

beforeEach(async () => {
  storage = await mkdtemp(resolve(tmpdir(), 'sparko-purge-'));
  await mkdir(resolve(storage, 'assets'));
  process.env['STORAGE_PATH'] = storage;
  await db.ledgerEntry.deleteMany({
    where: { account: { guildId: { in: [guildId, otherGuild] } } },
  });
  await db.guild.deleteMany({ where: { id: { in: [guildId, otherGuild] } } });
  await db.transcript.deleteMany({ where: { guildId } });
  await seed();
});
afterAll(async () => {
  await rm(storage, { recursive: true, force: true });
  await db.$disconnect();
});

describe('server data after Sparko is removed', () => {
  it('schedules deletion after the grace period and deletes everything but billing and staff policy', async () => {
    const before = Date.now();
    await removeBot();
    const [job] = await db.outbox.findMany({
      where: { guildId, type: 'guild.purge' },
    });
    expect(job!.dueAt.getTime()).toBeGreaterThanOrEqual(
      before + REMOVAL_GRACE_DAYS * 86_400_000 - 1000,
    );
    expect(
      (await db.guild.findUniqueOrThrow({ where: { id: guildId } })).installed,
    ).toBe(false);

    await runDuePurges();
    expect(
      await db.record.findMany({ where: { guildId }, select: { kind: true } }),
    ).toEqual([{ kind: 'billing.entitlement' }]);
    expect(await db.featureConfig.count({ where: { guildId } })).toBe(0);
    expect(await db.featurePolicy.count({ where: { guildId } })).toBe(1);
    expect(await db.ticket.count({ where: { guildId } })).toBe(0);
    expect(await db.transcript.count({ where: { guildId } })).toBe(0);
    expect(await db.ledgerAccount.count({ where: { guildId } })).toBe(0);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: job!.id } })).state,
    ).toBe('applied');
    // The file only this server used is gone; the shared one stays.
    await expect(
      stat(resolve(storage, 'assets', `${hashA}.png`)),
    ).rejects.toThrow();
    await expect(
      stat(resolve(storage, 'assets', `${hashShared}.png`)),
    ).resolves.toBeTruthy();
    expect(await db.record.count({ where: { guildId: otherGuild } })).toBe(1);
  });

  it('keeps everything when the bot is added back before the purge runs', async () => {
    await removeBot();
    await db.guild.update({
      where: { id: guildId },
      data: { installed: true },
    });
    await platform.mutate(
      bot(guildId),
      'gateway.observe',
      'rejoin',
      {},
      guildReinstalled,
    );
    await runDuePurges();
    expect(await db.featureConfig.count({ where: { guildId } })).toBe(1);
    expect(await db.transcript.count({ where: { guildId } })).toBe(1);
  });

  it('waits for the latest removal when the bot was removed, re-added and removed again', async () => {
    await removeBot();
    await db.guild.update({
      where: { id: guildId },
      data: { installed: true },
    });
    await platform.mutate(
      bot(guildId),
      'gateway.observe',
      'rejoin-2',
      {},
      guildReinstalled,
    );
    await new Promise((r) => setTimeout(r, 5));
    await removeBot();
    const jobs = await db.outbox.findMany({
      where: { guildId, type: 'guild.purge' },
      orderBy: { createdAt: 'asc' },
    });
    // Only the first job runs now; it belongs to a superseded removal.
    await db.outbox.update({
      where: { id: jobs[0]!.id },
      data: { dueAt: new Date() },
    });
    await processOutbox(db, discord, jobs[0]!.id);
    expect(await db.featureConfig.count({ where: { guildId } })).toBe(1);
  });
});
