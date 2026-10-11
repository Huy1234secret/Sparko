import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionFlagsBits, type REST } from 'discord.js';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDatabase, json } from '@sparko/db';
import { TicketConfigSchema } from '@sparko/contracts';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import {
  DiscordRest,
  type DiscordChannel,
  type DiscordMember,
  type DiscordMessage,
} from './discord.js';
import { processOutbox } from './runner.js';
import { publicationFiles } from './attachments.js';
import {
  purgeExpiredExports,
  purgeExpiredPrivatePayloads,
} from './retention.js';

const guildId = '733456789012345671',
  ownerId = '933456789012345673',
  botId = '933456789012345674',
  botRole = '933456789012345675',
  channelId = '933456789012345676',
  roleId = '933456789012345677';
const db = createDatabase(testDatabaseUrl());
const notice = {
  schemaVersion: 1,
  mode: 'v2',
  name: 'Notice',
  blocks: [{ type: 'text', text: 'Welcome to this community.' }],
};
class Boundary extends DiscordRest {
  sequence = 833456789012345600n;
  channelsStore: DiscordChannel[] = [
    {
      id: channelId,
      guild_id: guildId,
      name: 'community',
      type: 0,
      permission_overwrites: [],
    },
  ];
  messageStore: DiscordMessage[] = [];
  members = new Map<string, string[]>();
  timeout = new Map<string, string | null>();
  failSendOnce = false;
  failChannelOnce = false;
  sends = 0;
  creates = 0;
  patches = 0;
  beforeSend: (() => Promise<void>) | undefined;
  constructor() {
    super('test-only', botId);
    this.rest.patch = (async (route: string, options: { body?: unknown }) => {
      this.patches++;
      const body = options.body as Record<string, unknown>;
      const member = /\/members\/(\d+)$/.exec(route)?.[1];
      if (!member) throw new Error('Unexpected test REST request');
      this.timeout.set(
        member,
        body['communication_disabled_until'] as string | null,
      );
      return {};
    }) as REST['patch'];
  }
  override async guild() {
    return { id: guildId, name: 'Worker integration', owner_id: ownerId };
  }
  override async roles() {
    return [
      {
        id: guildId,
        name: 'everyone',
        position: 0,
        permissions: '0',
        managed: false,
      },
      {
        id: botRole,
        name: 'bot',
        position: 10,
        permissions: PermissionFlagsBits.Administrator.toString(),
        managed: false,
      },
      {
        id: roleId,
        name: 'member',
        position: 1,
        permissions: '0',
        managed: false,
      },
    ];
  }
  override async member(_guildId: string, id: string): Promise<DiscordMember> {
    return {
      user: { id, username: id },
      roles: id === botId ? [botRole] : (this.members.get(id) ?? []),
      communication_disabled_until: this.timeout.get(id) ?? null,
    };
  }
  override async channels() {
    return this.channelsStore;
  }
  override async channel(id: string) {
    const found = this.channelsStore.find((row) => row.id === id);
    if (!found) throw new Error('Unknown test channel');
    return found;
  }
  override async createChannel(_guildId: string, body: unknown) {
    this.creates++;
    const data = body as DiscordChannel;
    const channel: DiscordChannel = {
      ...data,
      id: String(++this.sequence),
      guild_id: guildId,
    };
    this.channelsStore.push(channel);
    if (this.failChannelOnce) {
      this.failChannelOnce = false;
      throw new Error('Response lost after Discord accepted creation');
    }
    return channel;
  }
  override async deleteChannel(id: string) {
    this.channelsStore = this.channelsStore.filter((row) => row.id !== id);
  }
  override async send(id: string, body: unknown, nonce: string) {
    this.sends++;
    await this.beforeSend?.();
    const data = body as Record<string, unknown>;
    const message: DiscordMessage = {
      id: String(++this.sequence),
      channel_id: id,
      author: { id: botId, username: 'Sparko', bot: true },
      content: String(data['content'] ?? ''),
      timestamp: new Date().toISOString(),
      components: Array.isArray(data['components']) ? data['components'] : [],
      attachments: [],
      embeds: [],
      nonce,
    };
    this.messageStore.push(message);
    if (this.failSendOnce) {
      this.failSendOnce = false;
      throw new Error('Response lost after Discord accepted message');
    }
    return message;
  }
  override async messages(id: string) {
    return this.messageStore.filter((row) => row.channel_id === id);
  }
  override async message(channel: string, id: string) {
    const found = this.messageStore.find(
      (row) => row.id === id && row.channel_id === channel,
    );
    if (!found) throw new Error('Unknown message');
    return found;
  }
  override async addRole(_guild: string, user: string, role: string) {
    this.members.set(user, [
      ...new Set([...(this.members.get(user) ?? []), role]),
    ]);
  }
}
let discord: Boundary;
let storage: string;
const effect = (type: string, payload: unknown) =>
  db.outbox.create({ data: { guildId, type, payload: json(payload) } });
const retry = (id: string) =>
  db.outbox.update({
    where: { id },
    data: { state: 'retry', dueAt: new Date(Date.now() - 1000) },
  });
beforeAll(async () => {
  storage = await mkdtemp(resolve(tmpdir(), 'sparko-worker-assets-'));
  await mkdir(resolve(storage, 'assets'));
  await db.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, name: 'Worker disposable test' },
    update: {},
  });
});
beforeEach(async () => {
  discord = new Boundary();
  await db.outbox.deleteMany({ where: { guildId } });
  await db.auditLog.deleteMany({ where: { guildId } });
  await db.operation.deleteMany({ where: { guildId } });
  await db.record.deleteMany({ where: { guildId } });
  await db.transcript.deleteMany({ where: { guildId } });
  await db.ticket.deleteMany({ where: { guildId } });
  await db.issuedControl.deleteMany({ where: { guildId } });
  await db.publication.deleteMany({ where: { guildId } });
  await db.featureConfig.deleteMany({ where: { guildId } });
  await db.featureConfig.create({
    data: { guildId, featureId: 'R19', config: { enabled: true } },
  });
});
afterAll(async () => {
  await db.guild.delete({ where: { id: guildId } });
  await rm(storage, { recursive: true, force: true });
  await db.$disconnect();
});

describe('PostgreSQL worker execution and recovery', () => {
  it('an archive committed during POST is preserved and the discovered message receives cleanup', async () => {
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(notice) },
    });
    discord.beforeSend = async () => {
      await db.publication.update({
        where: { id: publication.id },
        data: { state: 'archived', revision: { increment: 1 } },
      });
    };
    const send = await effect('publication.send', {
      publicationId: publication.id,
    });
    await processOutbox(db, discord, send.id);
    const canonical = await db.publication.findUniqueOrThrow({
      where: { id: publication.id },
    });
    expect(canonical.state).toBe('archived');
    expect(canonical.appliedRevision).toBe(0);
    expect(canonical.messageId).toBe(discord.messageStore[0]?.id);
    expect(
      await db.outbox.count({
        where: {
          guildId,
          type: 'publication.archive',
          payload: { path: ['publicationId'], equals: publication.id },
        },
      }),
    ).toBe(1);
  });
  it('a recovered ticket create never returns an already claimed ticket to open', async () => {
    const ticket = await db.ticket.create({
      data: {
        guildId,
        number: 1,
        ownerId,
        claimantId: ownerId,
        state: 'claimed',
        channelId,
        participants: [ownerId],
        snapshot: json(TicketConfigSchema.parse({ enabled: true })),
        answers: {},
      },
    });
    const work = await effect('ticket.create', { ticketId: ticket.id });
    await processOutbox(db, discord, work.id);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
    ).toMatchObject({ state: 'claimed', claimantId: ownerId, channelId });
    expect(discord.creates).toBe(0);
  });
  it('loads only public clean same-guild attachment bytes and rejects corrupt retained files', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    );
    const hash = createHash('sha256').update(png).digest('hex');
    await writeFile(resolve(storage, 'assets', `${hash}.png`), png);
    const asset = await db.record.create({
      data: {
        guildId,
        kind: 'asset',
        key: hash,
        ownerId,
        state: 'clean',
        data: {
          hash,
          width: 1,
          height: 1,
          mime: 'image/png',
          bytes: png.length,
          visibility: 'public',
          name: 'Image',
        },
      },
    });
    const document = { url: `attachment://sparko-${asset.id}.png` };
    expect(await publicationFiles(db, guildId, document, storage)).toEqual([
      { name: `sparko-${asset.id}.png`, data: png, contentType: 'image/png' },
    ]);
    await expect(
      publicationFiles(db, 'other-guild', document, storage),
    ).rejects.toThrow('belongs to another server');
    await db.record.update({
      where: { id: asset.id },
      data: {
        data: {
          hash,
          width: 1,
          height: 1,
          mime: 'image/png',
          bytes: png.length,
          visibility: 'private',
        },
      },
    });
    await expect(
      publicationFiles(db, guildId, document, storage),
    ).rejects.toThrow('private');
    await db.record.update({
      where: { id: asset.id },
      data: {
        data: {
          hash,
          width: 1,
          height: 1,
          mime: 'image/png',
          bytes: png.length,
          visibility: 'public',
        },
      },
    });
    const corrupt = Buffer.from(png);
    corrupt[corrupt.length - 1] = 0;
    await writeFile(resolve(storage, 'assets', `${hash}.png`), corrupt);
    await expect(
      publicationFiles(db, guildId, document, storage),
    ).rejects.toThrow('integrity');
  });
  it('purges expired export payloads while preserving current exports', async () => {
    const userId = '933456789012345699';
    await db.user.upsert({
      where: { id: userId },
      create: { id: userId, username: 'Retention test' },
      update: {},
    });
    const old = await db.accountRequest.create({
      data: {
        userId,
        kind: 'export',
        state: 'ready',
        createdAt: new Date(Date.now() - 31 * 86_400_000),
        data: { privateData: 'Expired export' },
      },
    });
    const current = await db.accountRequest.create({
      data: {
        userId,
        kind: 'export',
        state: 'ready',
        data: { privateData: 'Current export' },
      },
    });
    await purgeExpiredExports(db);
    expect(
      await db.accountRequest.findUniqueOrThrow({ where: { id: old.id } }),
    ).toMatchObject({ state: 'expired', data: {} });
    expect(
      await db.accountRequest.findUniqueOrThrow({ where: { id: current.id } }),
    ).toMatchObject({
      state: 'ready',
      data: { privateData: 'Current export' },
    });
    await db.user.delete({ where: { id: userId } });
  });
  it('removes expired AI prompts and observed transcripts while retaining unexpired records', async () => {
    const past = new Date(Date.now() - 1000),
      future = new Date(Date.now() + 60_000);
    const expired = await db.record.create({
      data: {
        guildId,
        kind: 'ai.request',
        key: 'expired-ai',
        ownerId,
        data: {
          prompt: 'Private expired prompt',
          expiresAt: past.toISOString(),
        },
      },
    });
    const current = await db.record.create({
      data: {
        guildId,
        kind: 'ai.request',
        key: 'current-ai',
        ownerId,
        data: { prompt: 'Current prompt', expiresAt: future.toISOString() },
      },
    });
    const oldTranscript = await db.transcript.create({
      data: {
        guildId,
        ticketId: 'retention-test',
        messages: { content: 'Expired private transcript' },
        status: 'complete',
        checksum: 'test',
        expiresAt: past,
      },
    });
    await purgeExpiredPrivatePayloads(db);
    expect(
      await db.record.findUnique({ where: { id: expired.id } }),
    ).toBeNull();
    expect(
      await db.transcript.findUnique({ where: { id: oldTranscript.id } }),
    ).toBeNull();
    expect(
      await db.record.findUnique({ where: { id: current.id } }),
    ).not.toBeNull();
  });
  it('reconciles an accepted ticket marker after timeout and creates its welcome independently', async () => {
    const ticket = await db.ticket.create({
      data: {
        guildId,
        number: 1,
        ownerId,
        participants: [ownerId],
        snapshot: json(TicketConfigSchema.parse({ enabled: true })),
        answers: {},
      },
    });
    const work = await effect('ticket.create', { ticketId: ticket.id });
    discord.failChannelOnce = true;
    await processOutbox(db, discord, work.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: work.id } })).state,
    ).toBe('unknown');
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).state,
    ).toBe('reconciliation_required');
    await retry(work.id);
    await processOutbox(db, discord, work.id);
    expect(discord.creates).toBe(1);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).state,
    ).toBe('open');
    const welcome = await db.outbox.findFirstOrThrow({
      where: { guildId, type: 'ticket.welcome' },
    });
    await processOutbox(db, discord, welcome.id);
    await processOutbox(db, discord, welcome.id);
    expect(discord.sends).toBe(1);
    expect(discord.messageStore).toHaveLength(1);
  });
  it('reconciles a tracked accepted message without sending again after a response loss', async () => {
    const work = await effect('community.message', {
      featureId: 'R19',
      channelId,
      document: notice,
    });
    discord.failSendOnce = true;
    await processOutbox(db, discord, work.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: work.id } })).state,
    ).toBe('unknown');
    await retry(work.id);
    await processOutbox(db, discord, work.id);
    expect(discord.sends).toBe(1);
    expect(discord.messageStore).toHaveLength(1);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: work.id } })).state,
    ).toBe('applied');
  });
  it('serializes same-guild jobs across independent runner calls without holding a transaction during REST', async () => {
    const one = await effect('community.message', {
      featureId: 'R19',
      channelId,
      document: notice,
    });
    const two = await effect('community.message', {
      featureId: 'R19',
      channelId,
      document: notice,
    });
    let entered: () => void = () => undefined,
      release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    discord.beforeSend = async () => {
      entered();
      await gate;
    };
    const first = processOutbox(db, discord, one.id);
    await started;
    await processOutbox(db, discord, two.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: two.id } })).state,
    ).toBe('pending');
    // Business transactions are still available while the network request is outstanding.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${guildId},0))`;
    });
    release();
    await first;
    discord.beforeSend = undefined;
    await processOutbox(db, discord, two.id);
    expect(discord.messageStore).toHaveLength(2);
  });
  it('retains the private ticket channel when the transcript is partial and required', async () => {
    const ticket = await db.ticket.create({
      data: {
        guildId,
        number: 1,
        ownerId,
        state: 'closing',
        channelId,
        participants: [ownerId],
        snapshot: json(
          TicketConfigSchema.parse({
            enabled: true,
            requireTranscriptBeforeCleanup: true,
          }),
        ),
        answers: {},
      },
    });
    discord.channelsStore[0]!.topic = `sparko:ticket:${ticket.id}`;
    const capture = await effect('ticket.capture', { ticketId: ticket.id });
    await processOutbox(db, discord, capture.id);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).state,
    ).toBe('capture_failed');
    expect(
      await db.transcript.findFirst({
        where: { guildId, ticketId: ticket.id },
      }),
    ).toMatchObject({ status: 'partial' });
    const cleanup = await effect('ticket.cleanup', { ticketId: ticket.id });
    await processOutbox(db, discord, cleanup.id);
    expect(discord.channelsStore).toHaveLength(1);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: cleanup.id } })).state,
    ).toBe('blocked');
  });
  it('never clears a manually extended timeout or a newer persisted punishment instance', async () => {
    const oldUntil = new Date(Date.now() - 1000).toISOString(),
      newUntil = new Date(Date.now() + 60_000).toISOString();
    const punishment = await db.record.create({
      data: {
        guildId,
        kind: 'safety.punishment',
        key: `timeout:${ownerId}`,
        ownerId,
        state: 'expiring',
        data: {
          activeCaseId: 'old-case',
          instanceId: 'old-instance',
          appliedTimeoutUntil: oldUntil,
        },
      },
    });
    discord.timeout.set(ownerId, newUntil);
    const work = await effect('safety.timeout.clear', {
      punishmentId: punishment.id,
      caseId: 'old-case',
      instanceId: 'old-instance',
      userId: ownerId,
    });
    await processOutbox(db, discord, work.id);
    expect(discord.patches).toBe(0);
    expect(discord.timeout.get(ownerId)).toBe(newUntil);
    await db.record.update({
      where: { id: punishment.id },
      data: {
        state: 'active',
        data: {
          activeCaseId: 'new-case',
          instanceId: 'new-instance',
          appliedTimeoutUntil: newUntil,
        },
      },
    });
    const stale = await effect('safety.timeout.clear', {
      punishmentId: punishment.id,
      caseId: 'old-case',
      instanceId: 'old-instance',
      userId: ownerId,
    });
    await processOutbox(db, discord, stale.id);
    expect(discord.patches).toBe(0);
    expect(
      (await db.record.findUniqueOrThrow({ where: { id: punishment.id } }))
        .state,
    ).toBe('active');
  });
  it('skips refunded role orders and records repaired pending delivery without a second purchase', async () => {
    const order = await db.record.create({
      data: {
        guildId,
        kind: 'shop.order',
        key: 'refunded',
        ownerId,
        state: 'refunded',
        data: { userId: ownerId, itemSnapshot: { roleId } },
      },
    });
    const refunded = await effect('economy.role.deliver', {
      orderId: order.id,
      userId: ownerId,
      roleId,
    });
    await processOutbox(db, discord, refunded.id);
    expect(discord.members.get(ownerId)).toBeUndefined();
    await db.record.update({
      where: { id: order.id },
      data: { state: 'pending-delivery' },
    });
    const deliver = await effect('economy.role.deliver', {
      orderId: order.id,
      userId: ownerId,
      roleId,
    });
    await processOutbox(db, discord, deliver.id);
    expect(discord.members.get(ownerId)).toEqual([roleId]);
    expect(
      (await db.record.findUniqueOrThrow({ where: { id: order.id } })).state,
    ).toBe('delivered');
    expect(await db.ledgerTransaction.count({ where: { guildId } })).toBe(0);
  });
});
