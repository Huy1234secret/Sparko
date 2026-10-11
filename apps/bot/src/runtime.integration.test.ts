import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Client, type Guild, type Interaction } from 'discord.js';
import { createDatabase, json } from '@sparko/db';
import { Platform, publishDocument } from '@sparko/domain';
import { MessageDocumentSchema, type MessageAction } from '@sparko/messages';
import type { Actor } from '@sparko/contracts';
import type { Config } from '@sparko/config';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import { BotRuntime } from './runtime.js';

const guildId = '744456789012345671',
  ownerId = '944456789012345673',
  memberId = '944456789012345674',
  channelId = '944456789012345675',
  messageId = '944456789012345676';
const db = createDatabase(testDatabaseUrl()),
  platform = new Platform(db);
const actor: Actor = {
  guildId,
  userId: ownerId,
  roles: [],
  isAdmin: true,
  isOwner: false,
  capabilities: [],
  globalCapabilities: [],
};
const config: Config = {
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl(),
  REDIS_URL: 'redis://localhost:56379/15',
  SESSION_SECRET: 'test-session-secret-with-at-least32',
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  APP_VERSION: 'test',
  PUBLIC_APP_URL: 'https://panel.coin-sprite.com',
  PORT: 3001,
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  DISCORD_BOT_TOKEN: '',
  DISCORD_REDIRECT_URI:
    'https://panel.coin-sprite.com/api/v1/auth/discord/callback',
  OWNER_USER_IDS: '',
  TRUST_PROXY: 'false',
  STORAGE_PATH: '.data/private',
  API_RATE_LIMIT_PER_MINUTE: 300,
};
beforeAll(async () => {
  await db.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, name: 'Bot control race test' },
    update: {},
  });
});
beforeEach(async () => {
  await db.outbox.deleteMany({ where: { guildId } });
  await db.auditLog.deleteMany({ where: { guildId } });
  await db.operation.deleteMany({ where: { guildId } });
  await db.issuedControl.deleteMany({ where: { guildId } });
  await db.publication.deleteMany({ where: { guildId } });
  await db.record.deleteMany({ where: { guildId } });
  await db.ticket.deleteMany({ where: { guildId } });
  await db.featureConfig.deleteMany({ where: { guildId } });
  await db.featureConfig.create({
    data: { guildId, featureId: 'tickets', config: json({ enabled: true }) },
  });
});
afterAll(async () => {
  await db.issuedControl.deleteMany({ where: { guildId } });
  await db.guild.delete({ where: { id: guildId } });
  await db.$disconnect();
});
async function publication(action: MessageAction) {
  const document = MessageDocumentSchema.parse({
    schemaVersion: 1,
    mode: 'v2',
    name: 'Action panel',
    blocks: [
      {
        type: 'controls',
        controls: [
          {
            type: 'button',
            key: 'action',
            label: 'Continue',
            style: 'primary',
            action,
          },
        ],
      },
    ],
  });
  const result = await platform.mutate(
    actor,
    'bot-test.publish',
    'panel',
    {},
    (ctx) => publishDocument(ctx, channelId, document),
  );
  await db.publication.update({
    where: { id: result.data.id },
    data: { state: 'applied', messageId },
  });
  return db.issuedControl.findFirstOrThrow({
    where: { publicationId: result.data.id },
  });
}
async function invoke(
  controlId: string,
  whileFetchingMember: () => Promise<void>,
) {
  const replies: string[] = [];
  const guild = {
    id: guildId,
    ownerId,
    members: {
      fetch: async () => {
        await whileFetchingMember();
        return {
          roles: { cache: new Map() },
          permissions: { has: () => false },
        };
      },
    },
  } as unknown as Guild;
  const state = {
    replied: false,
    deferred: false,
    guild,
    guildId,
    channelId,
    id: '944456789012345699',
    customId: controlId,
    user: { id: memberId },
    message: { id: messageId },
    isAutocomplete: () => false,
    isRepliable: () => true,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    deferReply: async () => {
      state.deferred = true;
    },
    reply: async (value: { content: string }) => {
      state.replied = true;
      replies.push(value.content);
    },
    editReply: async (value: { content: string }) => {
      replies.push(value.content);
    },
    followUp: async (value: { content: string }) => {
      replies.push(value.content);
    },
  };
  await new BotRuntime({} as Client, db, config).interaction(
    state as unknown as Interaction,
  );
  return replies;
}
describe('fresh published-control authorization', () => {
  it('revocation during the fresh Discord member fetch prevents role mutation and outbox creation', async () => {
    const control = await publication({
      type: 'role.add',
      roleId: '944456789012345677',
    });
    const replies = await invoke(control.id, async () => {
      await db.issuedControl.update({
        where: { id: control.id },
        data: { revoked: true },
      });
    });
    expect(replies.join(' ')).toContain('unavailable');
    expect(
      await db.record.count({ where: { guildId, kind: 'control.role' } }),
    ).toBe(0);
    expect(
      await db.outbox.count({ where: { guildId, type: 'control.role' } }),
    ).toBe(0);
  });
  it('archive during the fresh Discord member fetch prevents fieldless ticket creation', async () => {
    const control = await publication({
      type: 'ticket.create',
      categoryId: 'general',
    });
    await invoke(control.id, async () => {
      await db.publication.update({
        where: { id: control.publicationId },
        data: { state: 'archived', revision: { increment: 1 } },
      });
    });
    expect(await db.ticket.count({ where: { guildId } })).toBe(0);
    expect(
      await db.outbox.count({ where: { guildId, type: 'ticket.create' } }),
    ).toBe(0);
  });
});
