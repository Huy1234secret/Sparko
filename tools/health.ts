import { createDatabase } from '@sparko/db';

const service = process.argv[2];
if (!service || !['bot', 'worker'].includes(service))
  throw new Error('Health check service must be bot or worker.');
const database = process.env['DATABASE_URL'];
if (!database) throw new Error('DATABASE_URL is required.');
const db = createDatabase(database);
try {
  const heartbeat = await db.heartbeat.findUnique({ where: { service } });
  const details = heartbeat?.details as { redis?: string } | undefined;
  if (
    !heartbeat ||
    heartbeat.updatedAt.getTime() < Date.now() - 45_000 ||
    heartbeat.status !== (service === 'bot' ? 'connected' : 'running') ||
    (service === 'worker' && details?.redis !== 'ready')
  )
    process.exitCode = 1;
} finally {
  await db.$disconnect();
}
