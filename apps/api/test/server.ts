import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client as PostgresClient } from 'pg';
import { Client, ModalBuilder, type Interaction, type Guild } from 'discord.js';
import { z } from 'zod';
import { createDatabase } from '@sparko/db';
import {
  communityRoutes,
  communityConfigSchemas,
  safetyRoutes,
  safetyConfigSchemas,
  automationRoutes,
  automationConfigSchemas,
} from '@sparko/domain';
import { createApp } from '../src/app.js';
import { fakeDiscord, testConfig, GUILD_A, MEMBER } from './fixtures.js';
import { FakeRest } from './fake-rest.js';
import { BotRuntime } from '../../bot/src/runtime.js';
import { processOutbox } from '../../worker/src/runner.js';
import { testDatabaseUrl } from '../../../tools/test-targets.js';

// This executable is test-only. Production entrypoints never import test fixtures.
const target = testDatabaseUrl();
if (!new URL(target).pathname.endsWith('_browser_test'))
  throw new Error('Browser tests require a separate *_browser_test database.');
const pg = new PostgresClient({ connectionString: target });
await pg.connect();
await pg.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
await pg.end();
const migration = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  {
    cwd: fileURLToPath(new URL('../../../packages/db/', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: target },
  },
);
if (migration.status !== 0)
  throw new Error('Browser database migration failed.');
const db = createDatabase(target),
  rest = new FakeRest(),
  config = testConfig(target);
// API and worker share the same explicit disposable upload volume.
config.STORAGE_PATH = '.data/browser-test';
process.env['STORAGE_PATH'] = config.STORAGE_PATH;
await db.guild.create({
  data: { id: GUILD_A, name: 'Test community', installed: true },
});
await db.heartbeat.create({
  data: {
    service: 'bot',
    version: 'test',
    status: 'connected',
    details: { observationId: 'test-observer', intents: ['content'] },
  },
});
const app = await createApp({
  db,
  config,
  discord: fakeDiscord(),
  routes: [...communityRoutes, ...safetyRoutes, ...automationRoutes],
  configSchemas: {
    ...communityConfigSchemas,
    ...safetyConfigSchemas,
    ...automationConfigSchemas,
  },
});
const client = new Client({ intents: [] });
let runtime = new BotRuntime(client, db, config);
const guild = {
  id: GUILD_A,
  ownerId: '323456789012345678',
  members: {
    fetch: async () => ({
      roles: { cache: new Map<string, unknown>() },
      permissions: { has: () => false },
    }),
  },
} as unknown as Guild;
let workerPaused = false;
app.post('/__test/worker', async (req) => {
  workerPaused = z.object({ paused: z.boolean() }).parse(req.body).paused;
  return { paused: workerPaused };
});
app.post('/__test/restart-bot', async () => {
  runtime = new BotRuntime(client, db, config);
  return { restarted: true };
});
app.get('/__test/state', async () => ({
  templates: await db.template.findMany({
    include: { versions: { orderBy: { number: 'desc' } } },
  }),
  tickets: await db.ticket.findMany(),
  publications: await db.publication.findMany(),
  outbox: await db.outbox.findMany(),
  channels: rest.channelsStore,
  messages: rest.messageStore,
  uploadedFiles: rest.uploadedFiles,
}));
app.post('/__test/discord/writes', async (req) => {
  rest.failWrites = z.object({ fail: z.boolean() }).parse(req.body).fail;
  return { fail: rest.failWrites };
});
app.post('/__test/discord/messages/:id/delete', async (req) => {
  const { id } = z.object({ id: z.string() }).parse(req.params);
  rest.messageStore = rest.messageStore.filter((message) => message.id !== id);
  return { deleted: id };
});
app.post('/__test/discord/ticket', async (req, reply) => {
  const input = z
    .object({
      publicationId: z.string(),
      interactionId: z.string().default(randomUUID()),
      answers: z.record(z.string(), z.string()).default({}),
    })
    .parse(req.body);
  const control = await db.issuedControl.findFirst({
    where: { publicationId: input.publicationId },
    include: { publication: true },
  });
  if (!control?.publication.messageId)
    return reply
      .status(409)
      .send({ error: 'Wait for the panel to be published.' });
  let modal: ModalBuilder | undefined;
  const replies: string[] = [];
  function interaction(customId: string, modalSubmit = false): Interaction {
    const boundary = {
      id: input.interactionId + (modalSubmit ? '-submit' : ''),
      customId,
      guild,
      guildId: guild.id,
      channelId: control?.publication.channelId,
      user: { id: MEMBER, displayName: 'Test member' },
      message: { id: control?.publication.messageId },
      replied: false,
      deferred: false,
      isAutocomplete: () => false,
      isRepliable: () => true,
      isButton: () => !modalSubmit,
      isStringSelectMenu: () => false,
      isModalSubmit: () => modalSubmit,
      isChatInputCommand: () => false,
      fields: {
        getTextInputValue: (id: string) =>
          input.answers[id.slice('field:'.length)] ?? '',
      },
      showModal: async (value: ModalBuilder) => {
        modal = value;
        boundary.replied = true;
      },
      deferReply: async () => {
        boundary.deferred = true;
      },
      reply: async (value: { content: string }) => {
        replies.push(value.content);
        boundary.replied = true;
      },
      editReply: async (value: { content: string }) => {
        replies.push(value.content);
      },
      followUp: async (value: { content: string }) => {
        replies.push(value.content);
      },
    };
    return boundary as unknown as Interaction;
  }
  await runtime.interaction(interaction(control.id));
  if (modal)
    await runtime.interaction(interaction(modal.toJSON().custom_id, true));
  return {
    ticket: await db.ticket.findFirst({
      where: { guildId: GUILD_A, ownerId: MEMBER },
      orderBy: { createdAt: 'desc' },
    }),
    replies,
    modalShown: !!modal,
  };
});
await app.listen({ port: 3001, host: '127.0.0.1' });
let busy = false;
const timer = setInterval(async () => {
  if (busy || workerPaused) return;
  busy = true;
  try {
    await db.heartbeat.update({
      where: { service: 'bot' },
      data: { status: 'connected' },
    });
    for (const job of await db.outbox.findMany({
      where: {
        state: { in: ['pending', 'retry'] },
        dueAt: { lte: new Date() },
      },
      take: 20,
    }))
      await processOutbox(db, rest, job.id);
  } catch (error) {
    app.log.error(error);
  } finally {
    busy = false;
  }
}, 100);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    clearInterval(timer);
    void app
      .close()
      .then(() => db.$disconnect())
      .then(() => client.destroy())
      .then(() => process.exit(0));
  });
