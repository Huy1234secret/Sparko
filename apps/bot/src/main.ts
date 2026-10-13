import { join } from 'node:path';
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  type Guild,
} from 'discord.js';
import {
  addAudit,
  defaultDbPath,
  markOnlyInstalled,
  openDb,
  pruneJobs,
  requeueRunning,
  setStatus,
  upsertGuild,
} from '@sparko/core';
import { commands, handleCommand } from './commands.ts';
import { startJobLoop, type Handlers } from './jobs.ts';

// Exit code 78 means "fix the setup"; pm2 doesn't restart on it.
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error(
    'DISCORD_BOT_TOKEN is not set. Add it to the server env file, then run "pm2 restart sparko-bot".',
  );
  process.exit(78);
}
const dashboardUrl = process.env.PUBLIC_APP_URL;

const db = openDb(defaultDbPath(join(import.meta.dirname, '../../..')));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/** What the bot does for each change saved in the dashboard. */
const handlers: Handlers = {
  // Switching a module on or off needs nothing in Discord yet; finishing the
  // job tells the dashboard the bot is running and has it.
  module: async () => {},
};

const record = (guild: Guild, installed: boolean) =>
  upsertGuild(
    db,
    {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      memberCount: guild.memberCount,
      installed,
    },
    Date.now(),
  );

client.once(Events.ClientReady, async (ready) => {
  console.log(
    `Signed in as ${ready.user.tag}, in ${ready.guilds.cache.size} servers`,
  );
  ready.user.setPresence({
    activities: [
      { name: 'status', type: ActivityType.Custom, state: 'Being rebuilt' },
    ],
  });
  // Remember which servers Sparko is in, for the dashboard.
  for (const guild of ready.guilds.cache.values()) record(guild, true);
  markOnlyInstalled(db, new Set(ready.guilds.cache.keys()), Date.now());
  try {
    // Replaces the old bot's commands with the ones this bot answers.
    await ready.application.commands.set(commands);
    setStatus(db, 'commands', { count: commands.length }, Date.now());
    console.log(`Registered ${commands.length} slash command(s)`);
  } catch (error) {
    console.error('Couldn’t register slash commands', error);
  }
  requeueRunning(db);
  startJobLoop(db, handlers);
  const beat = () => {
    setStatus(
      db,
      'heartbeat',
      { ping: ready.ws.ping, guilds: ready.guilds.cache.size },
      Date.now(),
    );
    pruneJobs(db, Date.now() - 7 * 86_400_000);
  };
  beat();
  setInterval(beat, 30_000).unref();
});

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  handleCommand(interaction, { dashboardUrl }).catch((error: unknown) =>
    console.error(`/${interaction.commandName} failed`, error),
  );
});
client.on(Events.GuildCreate, (guild) => {
  record(guild, true);
  addAudit(
    db,
    {
      guildId: guild.id,
      who: 'Sparko',
      what: 'joined the server',
      icon: 'plus',
    },
    Date.now(),
  );
});
client.on(Events.GuildDelete, (guild) => {
  if (!guild.available) return; // An outage, not a removal.
  record(guild, false);
});
client.on(Events.Error, (error) => console.error(error));

const stop = () => {
  void client.destroy().finally(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await client.login(token);
