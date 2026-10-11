import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import { testDatabaseUrl, testRedisUrl } from './test-targets.js';

const database = testDatabaseUrl(),
  redisUrl = testRedisUrl();
const pg = new Client({ connectionString: database });
await pg.connect();
try {
  await pg.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
} finally {
  await pg.end();
}
// Verify the same ordered native migration CLI used in deployment, including forward changes.
const requireDb = createRequire(
  new URL('../packages/db/package.json', import.meta.url),
);
const migrated = spawnSync(
  process.execPath,
  [requireDb.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
  {
    cwd: new URL('../packages/db/', import.meta.url),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: database },
  },
);
if (migrated.status !== 0) process.exit(migrated.status ?? 1);
const redis = new Redis(redisUrl);
try {
  await redis.flushdb();
} finally {
  await redis.quit();
}
const focus = process.argv
  .slice(2)
  .filter((arg) => arg !== '--' && arg.includes('.integration'));
const child = spawn(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    // Optional integration file filters narrow a focused run after the same reset.
    ...(focus.length ? focus : ['.integration.test.ts']),
    '--maxWorkers=2',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: database,
      TEST_REDIS_URL: redisUrl,
    },
  },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
