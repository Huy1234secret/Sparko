import 'dotenv/config';
import { createDatabase } from '@sparko/db';
if (
  process.env['NODE_ENV'] !== 'development' ||
  process.env['ALLOW_DEVELOPMENT_SEED'] !== 'true'
)
  throw new Error(
    'Seed requires NODE_ENV=development and ALLOW_DEVELOPMENT_SEED=true. Production is never seeded.',
  );
const value = process.env['DATABASE_URL'];
if (!value) throw new Error('DATABASE_URL is required.');
let url: URL;
try {
  url = new URL(value);
} catch {
  throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
}
if (!['postgres:', 'postgresql:'].includes(url.protocol))
  throw new Error('DATABASE_URL must use PostgreSQL.');
if (!['localhost', '127.0.0.1', 'postgres'].includes(url.hostname))
  throw new Error('Development seed only permits a local database.');
const db = createDatabase(value);
await db.guild.upsert({
  where: { id: '123456789012345678' },
  create: {
    id: '123456789012345678',
    name: 'Explicit development example',
    installed: false,
  },
  update: {},
});
await db.$disconnect();
console.log(
  'Added explicitly labeled development guild; no fake Discord installation or production activity.',
);
