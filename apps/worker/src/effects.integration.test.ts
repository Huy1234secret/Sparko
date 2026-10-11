import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DiscordAPIError, PermissionFlagsBits, type REST } from 'discord.js';
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
  editedPayloads: Record<string, unknown>[] = [];
  beforeSend: (() => Promise<void>) | undefined;
  beforeMessageRead: (() => Promise<void>) | undefined;
  denyEdit = false;
  usableEmoji = false;
  botPermissions = PermissionFlagsBits.Administrator;
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
        permissions: this.botPermissions.toString(),
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
  override async emojis() {
    return [
      {
        id: '933456789012345679',
        name: 'spark',
        available: this.usableEmoji,
        animated: false,
        roles: [],
      },
    ];
  }
  override async channel(id: string) {
    const found = this.channelsStore.find((row) => row.id === id);
    if (!found)
      throw new DiscordAPIError(
        { code: 10003, message: 'Unknown Channel' },
        10003,
        404,
        'GET',
        'https://discord.com/api/v10/channels/test',
        {},
      );
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
      embeds: Array.isArray(data['embeds']) ? data['embeds'] : [],
      flags: Number(data['flags'] ?? 0),
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
    await this.beforeMessageRead?.();
    const found = this.messageStore.find(
      (row) => row.id === id && row.channel_id === channel,
    );
    if (!found)
      throw new DiscordAPIError(
        { code: 10008, message: 'Unknown Message' },
        10008,
        404,
        'GET',
        'https://discord.com/api/v10/channels/test/messages/test',
        {},
      );
    return found;
  }
  override async edit(channel: string, id: string, payload: unknown) {
    if (this.denyEdit)
      throw new DiscordAPIError(
        { code: 50013, message: 'Sensitive upstream permission context' },
        50013,
        403,
        'PATCH',
        'https://discord.com/api/v10/channels/test/messages/test',
        {},
      );
    const message = await this.message(channel, id);
    const data = payload as Record<string, unknown>;
    this.editedPayloads.push(data);
    if (Array.isArray(data['components']))
      message.components = data['components'];
    if (Array.isArray(data['embeds'])) message.embeds = data['embeds'];
    if (typeof data['content'] === 'string') message.content = data['content'];
    return message;
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
  it.each(['archived', 'replaced'])(
    'preserves V2 display while cleaning up %s controls',
    async (state) => {
      const action = { type: 'response.private', text: 'Saved response' };
      const document = {
        ...notice,
        blocks: [
          {
            type: 'container',
            accentColor: 123,
            children: [
              { type: 'text', text: 'Visible welcome' },
              {
                type: 'controls',
                controls: [
                  {
                    type: 'button',
                    key: 'row',
                    label: 'Open',
                    style: 'primary',
                    action,
                  },
                ],
              },
            ],
          },
          {
            type: 'section',
            texts: ['Visible support details'],
            accessory: {
              type: 'button',
              key: 'section',
              label: 'Support',
              style: 'secondary',
              action,
            },
          },
          {
            type: 'gallery',
            items: [
              { url: 'https://example.com/welcome.png', alt: 'Welcome image' },
            ],
          },
          {
            type: 'controls',
            controls: [
              {
                type: 'button',
                key: 'link',
                label: 'Website',
                style: 'link',
                url: 'https://example.com/',
              },
            ],
          },
        ],
      };
      const publication = await db.publication.create({
        data: { guildId, channelId, document: json(document) },
      });
      const ids = {
        row: `spk:ctl:row_${publication.id.replaceAll('-', '')}`,
        section: `spk:ctl:section_${publication.id.replaceAll('-', '')}`,
      };
      await db.issuedControl.createMany({
        data: Object.entries(ids).map(([key, id]) => ({
          id,
          guildId,
          publicationId: publication.id,
          key,
          action: json(action),
        })),
      });
      const send = await effect('publication.send', {
        publicationId: publication.id,
        revision: 1,
      });
      await processOutbox(db, discord, send.id);
      expect(discord.messageStore).toHaveLength(1);
      await db.publication.update({
        where: { id: publication.id },
        data: { state, revision: 2 },
      });
      await db.issuedControl.updateMany({
        where: { publicationId: publication.id },
        data: { revoked: true },
      });
      const archive = await effect('publication.archive', {
        publicationId: publication.id,
        revision: 2,
      });
      await processOutbox(db, discord, archive.id);
      expect(
        (await db.outbox.findUniqueOrThrow({ where: { id: archive.id } }))
          .state,
      ).toBe('applied');
      expect(
        await db.publication.findUniqueOrThrow({
          where: { id: publication.id },
        }),
      ).toMatchObject({ state, revision: 2, appliedRevision: 1 });
      expect(discord.editedPayloads).toHaveLength(1);
      const components = discord.messageStore[0]!.components;
      expect(components[0]).toEqual({
        type: 17,
        accent_color: 123,
        components: [{ type: 10, content: 'Visible welcome' }],
      });
      expect(components[1]).toMatchObject({
        type: 9,
        components: [{ type: 10, content: 'Visible support details' }],
        accessory: { custom_id: ids.section, disabled: true },
      });
      expect(components[2]).toMatchObject({
        type: 12,
        items: [
          {
            media: { url: 'https://example.com/welcome.png' },
            description: 'Welcome image',
          },
        ],
      });
      expect(components[3]).toMatchObject({
        type: 1,
        components: [{ style: 5, url: 'https://example.com/' }],
      });
      expect(JSON.stringify(components)).not.toContain(ids.row);
      expect(discord.sends).toBe(1);
    },
  );
  it('recovers an ambiguous archived POST by revoked controls and fences the stale send', async () => {
    const action = { type: 'response.private', text: 'Saved response' };
    const document = {
      ...notice,
      blocks: [
        ...notice.blocks,
        {
          type: 'controls',
          controls: [
            {
              type: 'button',
              key: 'open',
              label: 'Open',
              style: 'primary',
              action,
            },
          ],
        },
      ],
    };
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(document) },
    });
    const controlId = `spk:ctl:open_${publication.id.replaceAll('-', '')}`;
    await db.issuedControl.create({
      data: {
        id: controlId,
        guildId,
        publicationId: publication.id,
        key: 'open',
        action: json(action),
      },
    });
    const send = await effect('publication.send', {
      publicationId: publication.id,
      revision: 1,
    });
    discord.failSendOnce = true;
    await processOutbox(db, discord, send.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: send.id } })).state,
    ).toBe('unknown');
    expect(
      (
        await db.publication.findUniqueOrThrow({
          where: { id: publication.id },
        })
      ).messageId,
    ).toBeNull();
    discord.messageStore[0]!.nonce = null;
    await db.publication.update({
      where: { id: publication.id },
      data: { state: 'archived', revision: 2 },
    });
    await db.issuedControl.update({
      where: { id: controlId },
      data: { revoked: true },
    });
    const archive = await effect('publication.archive', {
      publicationId: publication.id,
      revision: 2,
    });
    await processOutbox(db, discord, archive.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: archive.id } })).state,
    ).toBe('applied');
    expect(
      await db.publication.findUniqueOrThrow({ where: { id: publication.id } }),
    ).toMatchObject({
      state: 'archived',
      revision: 2,
      messageId: discord.messageStore[0]!.id,
      appliedRevision: 0,
    });
    expect(discord.messageStore[0]!.components).toEqual([
      { type: 10, content: 'Welcome to this community.' },
    ]);
    await retry(send.id);
    await processOutbox(db, discord, send.id);
    expect(discord.sends).toBe(1);
    expect(discord.messageStore).toHaveLength(1);
  });
  it('leaves unidentified archived sends unknown instead of claiming cleanup succeeded', async () => {
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(notice) },
    });
    const send = await effect('publication.send', {
      publicationId: publication.id,
      revision: 1,
    });
    discord.failSendOnce = true;
    await processOutbox(db, discord, send.id);
    discord.messageStore = [];
    await db.publication.update({
      where: { id: publication.id },
      data: { state: 'replaced', revision: 2 },
    });
    const archive = await effect('publication.archive', {
      publicationId: publication.id,
      revision: 2,
    });
    await processOutbox(db, discord, archive.id);
    const job = await db.outbox.findUniqueOrThrow({
      where: { id: archive.id },
    });
    expect(job.state).toBe('unknown');
    expect(job.lastError).toContain('could not be identified');
    expect(
      await db.publication.findUniqueOrThrow({ where: { id: publication.id } }),
    ).toMatchObject({ state: 'replaced', revision: 2, messageId: null });
    expect(discord.editedPayloads).toHaveLength(0);
    await retry(send.id);
    await processOutbox(db, discord, send.id);
    expect(discord.sends).toBe(1);
  });
  it.each(['pending', 'rejected'])(
    'safely completes archive for a %s send that never created a message',
    async (attemptState) => {
      const publication = await db.publication.create({
        data: {
          guildId,
          channelId,
          document: json(notice),
          state: 'archived',
          revision: 2,
        },
      });
      const send = await effect('publication.send', {
        publicationId: publication.id,
        revision: 1,
      });
      if (attemptState === 'rejected') {
        await db.record.create({
          data: {
            guildId,
            kind: 'delivery.attempt',
            key: `${send.id}:send`,
            state: 'rejected',
            data: {},
          },
        });
        // The transport proved rejection even if a later unrelated failure made the job unknown.
        await db.outbox.update({
          where: { id: send.id },
          data: { state: 'unknown' },
        });
      }
      const archive = await effect('publication.archive', {
        publicationId: publication.id,
        revision: 2,
      });
      await processOutbox(db, discord, archive.id);
      expect(
        (await db.outbox.findUniqueOrThrow({ where: { id: archive.id } }))
          .state,
      ).toBe('applied');
      await retry(send.id);
      await processOutbox(db, discord, send.id);
      expect(discord.sends).toBe(0);
      expect(discord.editedPayloads).toHaveLength(0);
    },
  );
  it('explicitly clears prior embed message content when an updated design omits it', async () => {
    const document = {
      schemaVersion: 1,
      mode: 'embed',
      name: 'Embed notice',
      content: 'Prior content',
      embeds: [{ title: 'Saved title' }],
    };
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(document) },
    });
    const send = await effect('publication.send', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, send.id);
    expect(discord.messageStore[0]!.content).toBe('Prior content');
    const { content: _content, ...next } = document;
    await db.publication.update({
      where: { id: publication.id },
      data: { state: 'pending', revision: 2, document: json(next) },
    });
    const update = await effect('publication.update', {
      publicationId: publication.id,
      revision: 2,
    });
    await processOutbox(db, discord, update.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: update.id } })).state,
    ).toBe('applied');
    expect(discord.editedPayloads[0]).toMatchObject({
      content: '',
      embeds: [{ title: 'Saved title' }],
    });
    expect(discord.messageStore[0]!.content).toBe('');
    expect(discord.sends).toBe(1);
  });
  it('rechecks custom emoji access and applies the declared fallback without rewriting the saved design', async () => {
    const document = {
      ...notice,
      blocks: [
        {
          type: 'controls',
          controls: [
            {
              type: 'button',
              key: 'link',
              label: 'Dashboard',
              style: 'link',
              url: 'https://panel.coin-sprite.com/dashboard',
              emoji: {
                id: '933456789012345679',
                name: 'spark',
                fallback: '✨',
              },
            },
          ],
        },
      ],
    };
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(document) },
    });
    const send = await effect('publication.send', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, send.id);
    expect(JSON.stringify(discord.messageStore[0]?.components)).toContain('✨');
    expect(
      JSON.stringify(
        (
          await db.publication.findUniqueOrThrow({
            where: { id: publication.id },
          })
        ).document,
      ),
    ).toContain('933456789012345679');
  });
  it('requires Attach Files before an uploaded-image publication can send', async () => {
    const previousStorage = process.env['STORAGE_PATH'];
    process.env['STORAGE_PATH'] = storage;
    try {
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
          },
        },
      });
      const publication = await db.publication.create({
        data: {
          guildId,
          channelId,
          document: json({
            ...notice,
            blocks: [
              {
                type: 'gallery',
                items: [
                  {
                    url: `attachment://sparko-${asset.id}.png`,
                    alt: 'A spark',
                  },
                ],
              },
            ],
          }),
        },
      });
      discord.botPermissions =
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory;
      const send = await effect('publication.send', {
        publicationId: publication.id,
        revision: 1,
      });
      await processOutbox(db, discord, send.id);
      expect(
        await db.outbox.findUniqueOrThrow({ where: { id: send.id } }),
      ).toMatchObject({
        state: 'blocked',
        lastError: expect.stringContaining('Attach Files'),
      });
      expect(discord.sends).toBe(0);
    } finally {
      if (previousStorage === undefined) delete process.env['STORAGE_PATH'];
      else process.env['STORAGE_PATH'] = previousStorage;
    }
  });
  it('reconciles a matching message, records external drift/deletion, and never sends a replacement automatically', async () => {
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(notice) },
    });
    const send = await effect('publication.send', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, send.id);
    let reconcile = await effect('publication.reconcile', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, reconcile.id);
    expect(
      (
        await db.publication.findUniqueOrThrow({
          where: { id: publication.id },
        })
      ).state,
    ).toBe('applied');
    discord.messageStore[0]!.components = [
      { type: 10, content: 'Changed outside Sparko' },
    ];
    reconcile = await effect('publication.reconcile', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, reconcile.id);
    expect(
      (
        await db.publication.findUniqueOrThrow({
          where: { id: publication.id },
        })
      ).state,
    ).toBe('conflict');
    discord.messageStore = [];
    reconcile = await effect('publication.reconcile', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, reconcile.id);
    expect(
      (
        await db.publication.findUniqueOrThrow({
          where: { id: publication.id },
        })
      ).state,
    ).toBe('missing');
    await retry(send.id);
    await processOutbox(db, discord, send.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: send.id } })).state,
    ).toBe('blocked');
    expect(discord.sends).toBe(1);
  });
  it('keeps archive and revision fences when an external observation finishes late', async () => {
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(notice) },
    });
    const send = await effect('publication.send', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, send.id);
    discord.beforeMessageRead = async () => {
      await db.publication.update({
        where: { id: publication.id },
        data: { revision: 2, state: 'archived' },
      });
    };
    const reconcile = await effect('publication.reconcile', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, reconcile.id);
    expect(
      await db.publication.findUniqueOrThrow({ where: { id: publication.id } }),
    ).toMatchObject({ state: 'archived', revision: 2 });
    expect(discord.sends).toBe(1);
  });
  it('reconciles an accepted ambiguous POST by its saved nonce and leaves unidentified sends unknown', async () => {
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(notice) },
    });
    discord.failSendOnce = true;
    const send = await effect('publication.send', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, send.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: send.id } })).state,
    ).toBe('unknown');
    const reconcile = await effect('publication.reconcile', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, reconcile.id);
    expect(
      await db.publication.findUniqueOrThrow({ where: { id: publication.id } }),
    ).toMatchObject({
      state: 'applied',
      messageId: discord.messageStore[0]!.id,
    });
    const unidentified = await db.publication.create({
      data: { guildId, channelId, document: json(notice) },
    });
    const observation = await effect('publication.reconcile', {
      publicationId: unidentified.id,
      revision: 1,
    });
    await processOutbox(db, discord, observation.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: observation.id } }))
        .state,
    ).toBe('unknown');
    expect(
      (
        await db.publication.findUniqueOrThrow({
          where: { id: unidentified.id },
        })
      ).messageId,
    ).toBeNull();
    expect(discord.sends).toBe(1);
  });
  it('blocks a denied edit with sanitized permission guidance and preserves the original message', async () => {
    const publication = await db.publication.create({
      data: { guildId, channelId, document: json(notice) },
    });
    const send = await effect('publication.send', {
      publicationId: publication.id,
      revision: 1,
    });
    await processOutbox(db, discord, send.id);
    await db.publication.update({
      where: { id: publication.id },
      data: {
        revision: 2,
        state: 'pending',
        document: json({
          ...notice,
          blocks: [{ type: 'text', text: 'New text' }],
        }),
      },
    });
    discord.denyEdit = true;
    const update = await effect('publication.update', {
      publicationId: publication.id,
      revision: 2,
    });
    await processOutbox(db, discord, update.id);
    const failure = await db.outbox.findUniqueOrThrow({
      where: { id: update.id },
    });
    expect(failure.state).toBe('blocked');
    expect(failure.lastError).toContain('permissions');
    expect(failure.lastError).not.toContain('Sensitive');
    expect(
      (
        await db.publication.findUniqueOrThrow({
          where: { id: publication.id },
        })
      ).state,
    ).toBe('pending');
    expect(discord.sends).toBe(1);
    discord.denyEdit = false;
    await retry(update.id);
    await processOutbox(db, discord, update.id);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: update.id } })).state,
    ).toBe('applied');
    expect(discord.sends).toBe(1);
  });
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
  describe('community publications', () => {
    const fallbackChannel = '933456789012345690';
    const pending = (type: string) =>
      db.outbox.findFirstOrThrow({
        where: { guildId, type, state: { in: ['pending', 'retry'] } },
      });
    async function denySendIn(id: string) {
      discord.botPermissions =
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.EmbedLinks;
      discord.channelsStore = discord.channelsStore.map((channel) =>
        channel.id === id
          ? {
              ...channel,
              permission_overwrites: [
                {
                  id: botRole,
                  type: 0,
                  allow: '0',
                  deny: PermissionFlagsBits.SendMessages.toString(),
                },
              ],
            }
          : channel,
      );
    }
    it('keeps a role menu publishing until Discord applies its configured design', async () => {
      const menu = await db.record.create({
        data: {
          guildId,
          kind: 'role.menu',
          key: 'menu-a',
          ownerId,
          state: 'publishing',
          data: json({
            name: 'Pick a colour',
            channelId,
            document: notice,
            options: [
              {
                roleId,
                label: 'Member',
                requiredRoleIds: [],
                blockedRoleIds: [],
              },
            ],
            minSelections: 0,
            maxSelections: 1,
          }),
        },
      });
      const publish = await effect('community.role-menu.publish', {
        menuId: menu.id,
      });
      await processOutbox(db, discord, publish.id);
      expect(
        (await db.record.findUniqueOrThrow({ where: { id: menu.id } })).state,
      ).toBe('publishing');
      const applied = await pending('community.publication.applied');
      await processOutbox(db, discord, applied.id);
      expect(
        (await db.record.findUniqueOrThrow({ where: { id: menu.id } })).state,
      ).toBe('publishing');
      await processOutbox(db, discord, (await pending('publication.send')).id);
      await retry(applied.id);
      await processOutbox(db, discord, applied.id);
      const published = await db.record.findUniqueOrThrow({
        where: { id: menu.id },
      });
      expect(published.state).toBe('published');
      expect(published.data).toMatchObject({ publicationState: 'applied' });
      const message = JSON.stringify(discord.messageStore[0]);
      expect(message).toContain('Welcome to this community.');
      expect(message).toContain('"type":3');
      expect(message).toContain('"value":"' + roleId + '"');
    });
    it('posts a crate in the first usable fallback channel', async () => {
      discord.channelsStore.push({
        id: fallbackChannel,
        guild_id: guildId,
        name: 'fallback',
        type: 0,
        permission_overwrites: [],
      });
      await denySendIn(channelId);
      await db.featureConfig.create({
        data: {
          guildId,
          featureId: 'R10',
          config: json({
            enabled: true,
            fallbackChannelIds: [fallbackChannel],
          }),
        },
      });
      const drop = await db.record.create({
        data: {
          guildId,
          kind: 'crate.drop',
          key: 'drop-a',
          ownerId,
          state: 'publishing',
          data: json({
            type: {
              id: 'spark',
              name: 'Spark crate',
              weight: 1,
              minXp: 1,
              maxXp: 2,
            },
            channelId,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            capacity: 1,
            claims: 0,
            preview: false,
            failurePolicy: 'retry',
          }),
        },
      });
      const publish = await effect('community.crate.publish', {
        dropId: drop.id,
      });
      await processOutbox(db, discord, publish.id);
      const publication = await db.publication.findFirstOrThrow({
        where: { guildId },
      });
      expect(publication.channelId).toBe(fallbackChannel);
      expect(
        (await db.record.findUniqueOrThrow({ where: { id: drop.id } })).data,
      ).toMatchObject({ channelId: fallbackChannel });
    });
    it('records a skipped crate when no channel is usable instead of retrying', async () => {
      await denySendIn(channelId);
      const drop = await db.record.create({
        data: {
          guildId,
          kind: 'crate.drop',
          key: 'drop-b',
          ownerId,
          state: 'publishing',
          data: json({
            type: {
              id: 'spark',
              name: 'Spark crate',
              weight: 1,
              minXp: 1,
              maxXp: 2,
            },
            channelId,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            capacity: 1,
            claims: 0,
            preview: false,
            failurePolicy: 'skip',
          }),
        },
      });
      const publish = await effect('community.crate.publish', {
        dropId: drop.id,
      });
      await processOutbox(db, discord, publish.id);
      const failed = await db.record.findUniqueOrThrow({
        where: { id: drop.id },
      });
      expect(failed.state).toBe('failed');
      expect(failed.data).toMatchObject({
        publicationState: 'failed',
        deliveryError: expect.stringContaining('No crate channel is usable'),
      });
      expect(await db.publication.count({ where: { guildId } })).toBe(0);
      expect(discord.sends).toBe(0);
    });
    it('reports a giveaway whose delivery is blocked instead of waiting forever', async () => {
      await denySendIn(channelId);
      const giveaway = await db.record.create({
        data: {
          guildId,
          kind: 'giveaway',
          key: 'giveaway-a',
          ownerId,
          state: 'publishing',
          data: json({
            prize: 'Sticker pack',
            channelId,
            endsAt: new Date(Date.now() + 600000).toISOString(),
            winnerCount: 1,
          }),
        },
      });
      await processOutbox(
        db,
        discord,
        (
          await effect('community.giveaway.publish', {
            giveawayId: giveaway.id,
          })
        ).id,
      );
      await processOutbox(db, discord, (await pending('publication.send')).id);
      await processOutbox(
        db,
        discord,
        (await pending('community.publication.applied')).id,
      );
      const failed = await db.record.findUniqueOrThrow({
        where: { id: giveaway.id },
      });
      expect(failed.state).toBe('failed');
      expect(failed.data).toMatchObject({ publicationState: 'failed' });
      expect(discord.sends).toBe(0);
    });
  });
});
