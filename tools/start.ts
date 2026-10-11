const services = {
  api: '../apps/api/src/index.js',
  bot: '../apps/bot/src/index.js',
  worker: '../apps/worker/src/index.js',
};
const service = process.env['SERVICE'] ?? 'api';
if (!(service in services))
  throw new Error('SERVICE must be api, bot, or worker.');
await import(
  new URL(services[service as keyof typeof services], import.meta.url).href
);
