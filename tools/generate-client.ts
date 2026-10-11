import { spawnSync } from 'node:child_process';

// Use Prisma's supported generator. Do not replace migration engines or disable TLS.
const result = spawnSync('pnpm', ['--filter', '@sparko/db', 'generate'], {
  stdio: 'inherit',
  env: process.env,
});
if (result.error)
  throw new Error('Could not start Prisma generation.', {
    cause: result.error,
  });
process.exit(result.status ?? 1);
