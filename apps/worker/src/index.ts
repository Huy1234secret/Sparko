import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadConfig } from '@sparko/config';
import { createDatabase, json } from '@sparko/db';
import { logger } from '@sparko/observability';
import { DiscordRest } from './discord.js';
import { processOutbox } from './runner.js';
import {
  purgeExpiredExports,
  purgeExpiredPrivatePayloads,
} from './retention.js';

export { processOutbox } from './runner.js';
export { DiscordRest } from './discord.js';
export { EffectExecutor } from './effects.js';

const config = loadConfig();
if (!config.DISCORD_BOT_TOKEN || !config.DISCORD_CLIENT_ID)
  logger.info(
    'Internal durable jobs are available. Discord delivery remains pending until bot credentials are configured.',
  );
const db = createDatabase(config.DATABASE_URL);
const discord = new DiscordRest(
  config.DISCORD_BOT_TOKEN,
  config.DISCORD_CLIENT_ID,
);
const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
redis.on('error', (error: Error) =>
  logger.warn(
    { error: error.name },
    'Redis is unavailable; PostgreSQL outbox retains pending work',
  ),
);
const queue = new Queue('sparko-outbox-v1', { connection: redis });
const worker = new Worker<{ outboxId: string }>(
  'sparko-outbox-v1',
  async (job) => {
    await processOutbox(db, discord, job.data.outboxId);
  },
  { connection: redis, concurrency: 4 },
);
worker.on('error', (error: Error) =>
  logger.error({ error: error.name }, 'Queue worker failed'),
);
worker.on('failed', (job, error) =>
  logger.warn(
    { jobId: job?.id, error: error.name },
    'Queue delivery failed; durable state remains in PostgreSQL',
  ),
);
let stopping = false;
let polling = false;
let lastRetentionAt = 0;
async function pump() {
  if (stopping || polling) return;
  polling = true;
  try {
    const now = new Date();
    if (now.getTime() - lastRetentionAt > 3_600_000) {
      await purgeExpiredExports(db, now);
      await purgeExpiredPrivatePayloads(db, now);
      lastRetentionAt = now.getTime();
    }
    const rows = await db.outbox.findMany({
      where: {
        OR: [
          { state: { in: ['pending', 'retry'] }, dueAt: { lte: now } },
          { state: 'running', leaseUntil: { lt: now } },
        ],
      },
      select: { id: true, fence: true },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });
    for (const row of rows)
      await queue.add(
        'deliver',
        { outboxId: row.id },
        {
          jobId: `${row.id}-${row.fence}`,
          removeOnComplete: true,
          removeOnFail: 100,
          attempts: 1,
        },
      );
    await db.heartbeat.upsert({
      where: { service: 'worker' },
      create: {
        service: 'worker',
        version: config.APP_VERSION,
        status: 'running',
        details: json({ dueInBatch: rows.length, redis: redis.status }),
      },
      update: {
        version: config.APP_VERSION,
        status: 'running',
        details: json({ dueInBatch: rows.length, redis: redis.status }),
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'Outbox reconstruction failed',
    );
  } finally {
    polling = false;
  }
}
const interval = setInterval(() => {
  void pump();
}, 2000);
interval.unref();
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(interval);
  await worker.close();
  await queue.close();
  await redis.quit();
  await db.heartbeat.upsert({
    where: { service: 'worker' },
    create: {
      service: 'worker',
      version: config.APP_VERSION,
      status: 'stopped',
      details: {},
    },
    update: { status: 'stopped' },
  });
  await db.$disconnect();
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
await pump();
