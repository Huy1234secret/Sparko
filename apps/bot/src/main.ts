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
import { checkWelcome, welcomeMember } from './welcome.ts';

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
let client: Client;
/** Discord only sends member joins with the Server Members Intent on. */
let membersIntent = true;

/** What the bot does for each change saved in the dashboard. */
const handlers: Handlers = {
  // Switching a module on or off needs nothing in Discord yet; finishing the
  // job tells the dashboard the bot is running and has it.
  module: async () => {},
  welcome: async (job) =>
    checkWelcome(db, client.guilds.cache.get(job.guildId), membersIntent),
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

function wire(c: Client) {
  c.once(Events.ClientReady, async (ready) => {
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

  c.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    handleCommand(interaction, { dashboardUrl }).catch((error: unknown) =>
      console.error(`/${interaction.commandName} failed`, error),
    );
  });
  c.on(Events.GuildCreate, (guild) => {
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
  c.on(Events.GuildDelete, (guild) => {
    if (!guild.available) return; // An outage, not a removal.
    record(guild, false);
  });
  c.on(Events.Error, (error) => console.error(error));
  c.on(Events.GuildMemberAdd, (member) => {
    welcomeMember(db, member).catch((error: unknown) =>
      console.error(
        `Welcoming ${member.id} in ${member.guild.id} failed`,
        error,
      ),
    );
  });
}

async function connect(withMembers: boolean) {
  const c = new Client({
    intents: withMembers
      ? [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
      : [GatewayIntentBits.Guilds],
  });
  wire(c);
  await c.login(token);
  return c;
}

const stop = () => {
  void client.destroy().finally(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  client = await connect(true);
} catch (error) {
  const e = error as { code?: unknown; message?: string };
  if (
    e.code !== 'DisallowedIntents' &&
    !/disallowed intent/i.test(e.message ?? '')
  )
    throw error;
  // Keep running without member events; Welcome explains what to turn on.
  console.warn(
    'The Server Members Intent is off, so Welcome can’t see new members. Turn it on under Bot in the Discord Developer Portal, then run "pm2 restart sparko-bot".',
  );
  membersIntent = false;
  client = await connect(false);
}
setStatus(db, 'intents', { members: membersIntent }, Date.now());
