import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDatabase } from '@sparko/db';
import { testDatabaseUrl } from './test-targets.js';
import { archiveChecksum } from './archive.js';

const target = testDatabaseUrl();
const value = process.env['RESTORE_FILE'];
if (!value)
  throw new Error(
    'RESTORE_FILE is required; only disposable TEST_DATABASE_URL is restored.',
  );
const file = resolve(value);
const expected = (await readFile(file + '.sha256', 'utf8')).trim();
if (
  !/^[a-f0-9]{64}$/.test(expected) ||
  (await archiveChecksum(file)) !== expected
)
  throw new Error('Backup checksum is missing or does not match.');
const result = spawnSync(
  'pg_restore',
  [
    '--dbname=',
    '--single-transaction',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    file,
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, PGDATABASE: target, PGCONNECT_TIMEOUT: '10' },
  },
);
if (result.error || result.status !== 0)
  throw new Error(
    'Restore failed; PostgreSQL rolled back the archive transaction.',
    { cause: result.error },
  );
const db = createDatabase(target);
try {
  await db.$queryRaw`SELECT 1`;
  await Promise.all([
    db.guild.count(),
    db.operation.count(),
    db.ledgerAccount.count(),
  ]);
  const rows = await db.$queryRaw<
    Array<{ invalid: bigint }>
  >`SELECT COUNT(*) AS invalid FROM (SELECT "transactionId" FROM "LedgerEntry" GROUP BY "transactionId" HAVING SUM(amount) <> 0) invalid_transactions`;
  if (rows[0]?.invalid !== 0n)
    throw new Error('Restored ledger has unbalanced transactions.');
  const balances = await db.$queryRaw<
    Array<{ invalid: bigint }>
  >`SELECT COUNT(*) AS invalid FROM "LedgerAccount" a LEFT JOIN (SELECT "accountId", SUM(amount) AS balance FROM "LedgerEntry" GROUP BY "accountId") e ON e."accountId" = a.id WHERE a.balance <> COALESCE(e.balance, 0)`;
  if (balances[0]?.invalid !== 0n)
    throw new Error('Restored ledger account balances do not reconcile.');
  console.log(
    'Checksum verified; database restored into disposable target; core relations and ledger reconciliation passed.',
  );
} finally {
  await db.$disconnect();
}
