import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import {
  defaultDbPath,
  discordRest,
  guildViews,
  openDb,
  pruneSessions,
} from '@sparko/core';
import { createApi } from './api.ts';
import { createAuth } from './auth.ts';
import { json } from './http.ts';
import { createMedia } from './media.ts';
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
const publicUrl = process.env.PUBLIC_APP_URL ?? `http://localhost:${port}`;
const dbPath = defaultDbPath(join(import.meta.dirname, '../../..'));
const db = openDb(dbPath);
// Uploaded pictures sit next to the database unless MEDIA_DIR says otherwise.
const media = createMedia({
  dir: process.env.MEDIA_DIR ?? join(dirname(dbPath), 'media'),
  publicUrl,
});
const botToken = process.env.DISCORD_BOT_TOKEN;
const discord = botToken ? discordRest({ token: botToken }) : undefined;
const views = discord ? guildViews(discord) : undefined;
// Until the dashboard opens, only these Discord users can use it.
// DASHBOARD_USERS is a comma-separated list of user IDs, or * for everyone.
const dashboardUsers =
  process.env.DASHBOARD_USERS?.trim() === '*'
    ? undefined
    : (process.env.DASHBOARD_USERS ?? '902736357766594611,1416183744515276943')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
// 31 October 2026, 10:00 pm in UTC+7.
const dashboardOpensAt = Date.parse(
  process.env.DASHBOARD_OPENS_AT ?? '2026-10-31T15:00:00Z',
);
const auth = createAuth({
  db,
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  botToken,
  publicUrl,
  dashboardUsers,
  dashboardOpensAt: Number.isNaN(dashboardOpensAt)
    ? undefined
    : dashboardOpensAt,
});
const api = createApi({ db, auth, views, discord, publicUrl, media });
// Expired sign-ins are cleared once an hour.
setInterval(() => pruneSessions(db, Date.now()), 3_600_000).unref();
if (!auth.configured)
  console.warn(
    'Discord sign-in is off: set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in the env file.',
  );
const server = createServer((req, res) => {
  const respond = async () => {
    if (await auth.handle(req, res)) return;
    if (await api(req, res)) return;
    if (await media.handle(req, res)) return;
    if (req.url?.startsWith('/api/'))
      return json(res, 404, { error: 'not_found' });
    await handle(req, res);
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

const stop = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
