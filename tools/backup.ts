import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { archiveChecksum } from './archive.js';

const database = process.env['DATABASE_URL'];
if (!database) throw new Error('DATABASE_URL is required.');
let databaseUrl: URL;
try {
  databaseUrl = new URL(database);
} catch {
  throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
}
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol))
  throw new Error('DATABASE_URL must use PostgreSQL.');
process.umask(0o077);
const directory = resolve(process.env['BACKUP_DIRECTORY'] ?? '.data/backups');
await mkdir(directory, { recursive: true, mode: 0o700 });
const target = join(
  directory,
  `sparko-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.dump`,
);
const result = spawnSync(
  'pg_dump',
  ['--format=custom', '--no-owner', '--no-privileges', '--file', target],
  {
    stdio: 'inherit',
    env: { ...process.env, PGDATABASE: database, PGCONNECT_TIMEOUT: '10' },
  },
);
if (result.error || result.status !== 0) {
  await rm(target, { force: true });
  throw new Error(
    'pg_dump failed. Install a PostgreSQL client matching the server major version; no partial backup was retained.',
    { cause: result.error },
  );
}
const checksum = await archiveChecksum(target);
await writeFile(target + '.sha256', checksum + '\n', {
  mode: 0o600,
  flag: 'wx',
});
await writeFile(
  target + '.json',
  JSON.stringify(
    {
      format: 'postgresql-custom',
      createdAt: new Date().toISOString(),
      appVersion: process.env['APP_VERSION'] ?? null,
      bytes: (await stat(target)).size,
      sha256: checksum,
      includes: 'database only; private media must be backed up separately',
    },
    null,
    2,
  ) + '\n',
  { mode: 0o600, flag: 'wx' },
);
console.log('Database backup and checksum created: ' + target);
