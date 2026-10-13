import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createAuth } from './auth.ts';
import { createHandler } from './static.ts';

// Exit code 78 means "fix the setup"; pm2 doesn't restart on it.
const root = resolve(
  process.env.WEB_ROOT ?? join(import.meta.dirname, '../../web/dist'),
);
if (!existsSync(join(root, 'index.html'))) {
  console.error(
    `No website build in ${root}. Run "pnpm build" in the Sparko folder first.`,
  );
  process.exit(78);
}

const port = Number(process.env.WEB_PORT ?? 8080);
const host = process.env.WEB_HOST ?? '127.0.0.1';
const handle = createHandler(root);
const auth = createAuth({
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  botToken: process.env.DISCORD_BOT_TOKEN,
  publicUrl: process.env.PUBLIC_APP_URL ?? `http://localhost:${port}`,
});
if (!auth.configured)
  console.warn(
    'Discord sign-in is off: set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in the env file.',
  );
const server = createServer((req, res) => {
  const respond = async () => {
    if (!(await auth.handle(req, res))) await handle(req, res);
  };
  respond().catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.listen(port, host, () =>
  console.log(`Sparko website on http://${host}:${port}, serving ${root}`),
);

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
