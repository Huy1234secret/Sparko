// pm2 processes for Sparko. Start everything with:
//   pm2 start ecosystem.config.cjs
// Settings and secrets come from the env file below (never from this repo).
const envFile =
  process.env.SPARKO_ENV_FILE || '/opt/sparko/shared/.env.production';

const common = {
  cwd: __dirname,
  interpreter: 'node',
  node_args: `--env-file-if-exists=${envFile} --disable-warning=ExperimentalWarning`,
  env: { NODE_ENV: 'production' },
  // 78 means the setup needs fixing (missing build or token); don't loop.
  stop_exit_codes: [78],
  max_memory_restart: '400M',
  kill_timeout: 5000,
  time: true,
};

module.exports = {
  apps: [
    { name: 'sparko-web', script: 'apps/server/src/main.ts', ...common },
    { name: 'sparko-bot', script: 'apps/bot/src/main.ts', ...common },
  ],
};
