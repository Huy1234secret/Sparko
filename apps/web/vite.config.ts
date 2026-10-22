import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The site's contact and operator details, kept out of the repository:
 * read from the shell or the server's env file when the site is built.
 * Only these keys are copied into the page; nothing else in the env file
 * (the bot token and other secrets) reaches it.
 */
const siteKeys = {
  site: 'PUBLIC_APP_URL',
  email: 'SUPPORT_EMAIL',
  discordInvite: 'SUPPORT_DISCORD_INVITE',
  operator: 'OPERATOR_NAME',
  country: 'OPERATOR_COUNTRY',
} as const;

function siteFacts() {
  const path =
    process.env['SPARKO_ENV_FILE'] || '/opt/sparko/shared/.env.production';
  let file: Record<string, string | undefined> = {};
  try {
    file = parseEnv(readFileSync(path, 'utf8'));
  } catch {
    // No env file here (a developer's machine): the defaults in legal.ts.
  }
  return Object.fromEntries(
    Object.entries(siteKeys).map(([fact, key]) => [
      fact,
      (process.env[key] ?? file[key] ?? '').trim(),
    ]),
  );
}

export default defineConfig(({ command }) => {
  // A NODE_ENV left over in the shell would otherwise bundle React's
  // development build into production.
  if (command === 'build') process.env['NODE_ENV'] = 'production';
  return {
    plugins: [react()],
    define: { __SITE_FACTS__: JSON.stringify(siteFacts()) },
    // The design system lives at the repository root, outside this app.
    server: { host: '0.0.0.0', port: 5173, fs: { allow: ['../..'] } },
    build: { target: 'es2022', sourcemap: true },
  };
});
