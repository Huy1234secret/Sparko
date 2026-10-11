import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Client,
  type Guild,
  type Interaction,
  type ModalBuilder,
} from 'discord.js';
import { createDatabase, json } from '@sparko/db';
import { Platform, jsonObject, publishDocument } from '@sparko/domain';
import { FormSchema, type Actor } from '@sparko/contracts';
import { MessageDocumentSchema, type MessageAction } from '@sparko/messages';
import type { Config } from '@sparko/config';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import { BotRuntime } from './runtime.js';

const guildId = '744456789012345672',
  ownerId = '944456789012345683',
  memberId = '944456789012345684',
  otherId = '944456789012345685',
  channelId = '944456789012345686',
  messageId = '944456789012345687',
  requiredRole = '944456789012345688';
const db = createDatabase(testDatabaseUrl()),
  platform = new Platform(db);
const actor: Actor = {
  guildId,
  userId: ownerId,
  roles: [],
  isAdmin: true,
  isOwner: true,
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
let memberRoles: string[];
beforeAll(async () => {
  await db.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, name: 'Persisted modal tests' },
    update: {},
  });
});
beforeEach(async () => {
  memberRoles = [requiredRole];
  await db.outbox.deleteMany({ where: { guildId } });
  await db.auditLog.deleteMany({ where: { guildId } });
  await db.operation.deleteMany({ where: { guildId } });
  await db.issuedControl.deleteMany({ where: { guildId } });
  await db.publication.deleteMany({ where: { guildId } });
  await db.record.deleteMany({ where: { guildId } });
  await db.ticket.deleteMany({ where: { guildId } });
  await db.featureConfig.deleteMany({ where: { guildId } });
  await db.featureConfig.create({
    data: { guildId, featureId: 'R25', config: { enabled: true } },
  });
});
afterAll(async () => {
  await db.issuedControl.deleteMany({ where: { guildId } });
  await db.guild.delete({ where: { id: guildId } });
  await db.$disconnect();
});
async function panel(action: MessageAction) {
  const document = MessageDocumentSchema.parse({
    schemaVersion: 1,
    mode: 'v2',
    name: 'Application panel',
    blocks: [
      {
        type: 'controls',
        controls: [
          {
            type: 'button',
            key: 'open',
            label: 'Apply',
            style: 'primary',
            action,
          },
        ],
      },
    ],
  });
  const result = await platform.mutate(
    actor,
    'forms-test.publish',
    randomUUID(),
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
async function applicationPanel() {
  const snapshot = FormSchema.parse({
    name: 'Tell us about yourself',
    requiredRoleIds: [requiredRole],
    fields: Array.from({ length: 7 }, (_, index) => ({
      id: `answer_${index}`,
      label: `Question ${index + 1}`,
      maxLength: 100,
      ...(index === 2 ? { choices: ['First option', 'Second option'] } : {}),
    })),
  });
  const form = await db.record.create({
    data: {
      guildId,
      kind: 'form',
      key: randomUUID(),
      state: 'published',
      data: json({
        ...snapshot,
        publishedVersion: 1,
        versions: [
          { number: 1, form: snapshot, publishedAt: new Date().toISOString() },
        ],
      }),
    },
  });
  return {
    form,
    control: await panel({ type: 'form.open', formVersionId: form.id }),
  };
}
async function fire(
  customId: string,
  options: {
    modal?: boolean;
    answers?: Record<string, string>;
    choices?: Record<string, string[]>;
    userId?: string;
    whileFetching?: () => Promise<void>;
  } = {},
) {
  const replies: { content: string; components?: unknown }[] = [];
  let shown: ReturnType<ModalBuilder['toJSON']> | undefined;
  const guild = {
    id: guildId,
    ownerId,
    members: {
      fetch: async () => {
        await options.whileFetching?.();
        return {
          roles: { cache: new Map(memberRoles.map((id) => [id, { id }])) },
          permissions: { has: () => false },
        };
      },
    },
  } as unknown as Guild;
  const state = {
    id: randomUUID(),
    customId,
    guild,
    guildId,
    channelId,
    user: { id: options.userId ?? memberId },
    message: { id: messageId },
    replied: false,
    deferred: false,
    isAutocomplete: () => false,
    isRepliable: () => true,
    isModalSubmit: () => !!options.modal,
    isButton: () => !options.modal,
    isStringSelectMenu: () => false,
    isChatInputCommand: () => false,
    fields: {
      getTextInputValue: (id: string) => {
        const value = options.answers?.[id.slice('field:'.length)];
        if (value === undefined) throw new Error(`Missing ${id}`);
        return value;
      },
      getStringSelectValues: (id: string) =>
        options.choices?.[id.slice('field:'.length)] ?? [],
    },
    deferReply: async () => {
      state.deferred = true;
    },
    reply: async (value: { content: string }) => {
      state.replied = true;
      replies.push(value);
    },
    editReply: async (value: { content: string; components?: unknown }) => {
      replies.push(value);
    },
    followUp: async (value: { content: string }) => {
      replies.push(value);
    },
    showModal: async (modal: ModalBuilder) => {
      state.replied = true;
      shown = modal.toJSON();
    },
  };
  // Every delivery creates a new runtime: continuation relies entirely on DB state.
  await new BotRuntime({} as Client, db, config).interaction(
    state as unknown as Interaction,
  );
  return {
    replies,
    shown,
    text: replies.map((value) => value.content).join(' '),
  };
}
const firstAnswers = {
  answer_0: 'One',
  answer_1: 'Two',
  answer_3: 'Four',
  answer_4: 'Five',
};
async function startApplication() {
  const prepared = await applicationPanel();
  const first = await fire(prepared.control.id);
  expect(first.shown?.components).toHaveLength(5);
  const flowId = first.shown!.custom_id.slice('spk:form:'.length);
  return { ...prepared, flowId, first };
}
async function submitFirst(flowId: string) {
  return fire(`spk:form:${flowId}`, {
    modal: true,
    answers: firstAnswers,
    choices: { answer_2: ['1'] },
  });
}

describe('persisted application and ticket modal flows', () => {
  it('uses real modal choices, survives restarts between five-field steps, and submits once under concurrency', async () => {
    const { flowId, first, form } = await startApplication();
    expect(first.shown!.components[2]).toMatchObject({
      type: 18,
      component: {
        type: 3,
        custom_id: 'field:answer_2',
        options: [{ value: '0' }, { value: '1' }],
      },
    });
    expect((await submitFirst(flowId)).text).toContain('answers are saved');
    const second = await fire(`spk:next:${flowId}`);
    expect(second.shown?.components).toHaveLength(2);
    const results = await Promise.all([
      fire(`spk:form:${flowId}`, {
        modal: true,
        answers: { answer_5: 'Six', answer_6: 'Seven' },
      }),
      fire(`spk:form:${flowId}`, {
        modal: true,
        answers: { answer_5: 'Six', answer_6: 'Seven' },
      }),
    ]);
    expect(
      results.filter((result) => result.text.includes('Application submitted')),
    ).toHaveLength(1);
    const applications = await db.record.findMany({
      where: { guildId, kind: 'application' },
    });
    expect(applications).toHaveLength(1);
    expect(applications[0]?.ownerId).toBe(memberId);
    expect(jsonObject(applications[0]?.data)).toMatchObject({
      formId: form.id,
      version: 1,
      answers: {
        ...firstAnswers,
        answer_2: 'Second option',
        answer_5: 'Six',
        answer_6: 'Seven',
      },
    });
    expect(
      (await fire(`spk:next:${flowId}`, { userId: otherId })).shown,
    ).toBeUndefined();
  });

  it('rejects forged choice indexes without saving progress', async () => {
    const { flowId } = await startApplication();
    const result = await fire(`spk:form:${flowId}`, {
      modal: true,
      answers: firstAnswers,
      choices: { answer_2: ['99'] },
    });
    expect(result.text).toContain('original form');
    expect(
      jsonObject(
        (await db.record.findUniqueOrThrow({ where: { id: flowId } })).data,
      ),
    ).toMatchObject({ step: 0, answers: {} });
  });

  it.each(['revoked', 'expired', 'role-lost', 'new-version'] as const)(
    'rejects final submission when %s after an earlier saved step',
    async (change) => {
      const { flowId, control, form } = await startApplication();
      await submitFirst(flowId);
      if (change === 'revoked')
        await db.issuedControl.update({
          where: { id: control.id },
          data: { revoked: true },
        });
      if (change === 'expired') {
        const current = await db.record.findUniqueOrThrow({
          where: { id: flowId },
        });
        await db.record.update({
          where: { id: flowId },
          data: {
            data: json({
              ...jsonObject(current.data),
              expiresAt: new Date(Date.now() - 1000).toISOString(),
            }),
          },
        });
      }
      if (change === 'role-lost') memberRoles = [];
      if (change === 'new-version')
        await db.record.update({
          where: { id: form.id },
          data: { state: 'draft', revision: { increment: 1 } },
        });
      const result = await fire(`spk:form:${flowId}`, {
        modal: true,
        answers: { answer_5: 'Six', answer_6: 'Seven' },
      });
      expect(result.text).not.toContain('Application submitted');
      expect(
        await db.record.count({ where: { guildId, kind: 'application' } }),
      ).toBe(0);
    },
  );

  it('cancels an application and removes saved answers while denying another actor cancellation', async () => {
    const { flowId } = await startApplication();
    await submitFirst(flowId);
    expect(
      (await fire(`spk:cancel:${flowId}`, { userId: otherId })).text,
    ).toContain('another member');
    expect((await fire(`spk:cancel:${flowId}`)).text).toContain(
      'answers were removed',
    );
    const record = await db.record.findUniqueOrThrow({ where: { id: flowId } });
    expect(record.state).toBe('cancelled');
    expect(jsonObject(record.data)['answers']).toBeUndefined();
    expect((await fire(`spk:next:${flowId}`)).shown).toBeUndefined();
  });

  it('persists seven-question ticket answers across restart and exposes cancellable continuation', async () => {
    await db.featureConfig.create({
      data: {
        guildId,
        featureId: 'tickets',
        config: json({
          enabled: true,
          categories: [
            {
              id: 'general',
              name: 'Support',
              fields: Array.from({ length: 7 }, (_, index) => ({
                id: `answer_${index}`,
                label: `Question ${index + 1}`,
                required: true,
                maxLength: 100,
              })),
            },
          ],
        }),
      },
    });
    const control = await panel({
      type: 'ticket.create',
      categoryId: 'general',
    });
    const first = await fire(control.id),
      flowId = first.shown!.custom_id.slice('spk:form:'.length);
    expect(first.shown?.components).toHaveLength(5);
    const result = await fire(`spk:form:${flowId}`, {
      modal: true,
      answers: { ...firstAnswers, answer_2: 'Three' },
    });
    expect(JSON.stringify(result.replies)).toContain('Cancel form');
    expect((await fire(`spk:next:${flowId}`)).shown?.components).toHaveLength(
      2,
    );
    await fire(`spk:form:${flowId}`, {
      modal: true,
      answers: { answer_5: 'Six', answer_6: 'Seven' },
    });
    const ticket = await db.ticket.findFirstOrThrow({ where: { guildId } });
    expect(ticket.answers).toMatchObject({
      answer_2: 'Three',
      answer_6: 'Seven',
    });
    expect(await db.ticket.count({ where: { guildId } })).toBe(1);
    const abandoned = await fire(control.id);
    const abandonedId = abandoned.shown!.custom_id.slice('spk:form:'.length);
    await fire(`spk:form:${abandonedId}`, {
      modal: true,
      answers: { ...firstAnswers, answer_2: 'Three' },
    });
    expect((await fire(`spk:cancel:${abandonedId}`)).text).toContain(
      'answers were removed',
    );
    expect(
      (
        await fire(`spk:form:${abandonedId}`, {
          modal: true,
          answers: { answer_5: 'Six', answer_6: 'Seven' },
        })
      ).text,
    ).not.toContain('Ticket requested');
    expect(await db.ticket.count({ where: { guildId } })).toBe(1);
  });
});
