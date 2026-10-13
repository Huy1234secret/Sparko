import { join } from 'node:path';
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type ButtonInteraction,
  type Guild,
} from 'discord.js';
import {
  addAudit,
  defaultDbPath,
  discordRest,
  ticketActions,
  ticketButtonPrefix,
  markOnlyInstalled,
  openDb,
  Plain,
  publishStudio,
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
const rest = discordRest({ token });
const tickets = ticketActions(rest, db);
let client: Client;
/** Discord only sends member joins with the Server Members Intent on. */
let membersIntent = true;
/** And only shares message text with the Message Content Intent on. */
let contentIntent = true;

/** What the bot does for each change saved in the dashboard. */
const handlers: Handlers = {
  // Switching a module on or off needs nothing in Discord yet; finishing the
  // job tells the dashboard the bot is running and has it.
  module: async () => {},
  welcome: async (job) =>
    checkWelcome(db, client.guilds.cache.get(job.guildId), membersIntent),
  tickets: (job) => tickets.applyPanel(job.guildId),
  studio: (job) => publishStudio(rest, db, job.guildId),
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
    if (
      interaction.isButton() &&
      interaction.customId.startsWith(ticketButtonPrefix) &&
      interaction.inGuild()
    ) {
      void openTicket(interaction);
      return;
    }
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
  c.on(Events.MessageCreate, (message) => {
    if (message.author.bot || !message.channel.isThread()) return;
    const file = message.attachments.first()?.name ?? null;
    tickets.recordMessage({
      threadId: message.channel.id,
      author: {
        id: message.author.id,
        name: message.member?.displayName ?? message.author.username,
      },
      text:
        message.content ||
        (contentIntent
          ? ''
          : '(Discord didn’t share this message’s text. Turn on the Message Content Intent.)'),
      file,
    });
  });
  c.on(Events.GuildMemberAdd, (member) => {
    welcomeMember(db, member).catch((error: unknown) =>
      console.error(
        `Welcoming ${member.id} in ${member.guild.id} failed`,
        error,
      ),
    );
  });
}

/** A member pressed a ticket panel button. */
async function openTicket(interaction: ButtonInteraction<'cached' | 'raw'>) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const opened = await tickets.openTicket({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      topicId: interaction.customId.slice(ticketButtonPrefix.length),
      member: {
        id: interaction.user.id,
        name:
          (interaction.member && 'displayName' in interaction.member
            ? interaction.member.displayName
            : null) ??
          interaction.user.globalName ??
          interaction.user.username,
      },
    });
    await interaction.editReply(
      opened.existing
        ? `You already have a ticket open: <#${opened.threadId}>`
        : `Your ticket is open: <#${opened.threadId}>`,
    );
  } catch (error) {
    if (!(error instanceof Plain))
      console.error('Opening a ticket failed', error);
    await interaction
      .editReply(
        error instanceof Plain
          ? error.message
          : 'Sparko couldn’t open a ticket just now. Try again in a moment.',
      )
      .catch(() => {});
  }
}

async function connect(members: boolean, content: boolean) {
  const c = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      ...(members ? [GatewayIntentBits.GuildMembers] : []),
      ...(content ? [GatewayIntentBits.MessageContent] : []),
    ],
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

// Discord refuses privileged intents that aren't turned on for the app, so
// try with both, then each, then neither; features explain what's missing.
for (const [members, content] of [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
] as const) {
  try {
    client = await connect(members, content);
    membersIntent = members;
    contentIntent = content;
    break;
  } catch (error) {
    const e = error as { code?: unknown; message?: string };
    if (
      e.code !== 'DisallowedIntents' &&
      !/disallowed intent/i.test(e.message ?? '')
    )
      throw error;
  }
}
if (!membersIntent || !contentIntent)
  console.warn(
    `Turn on ${[!membersIntent && 'Server Members Intent', !contentIntent && 'Message Content Intent'].filter(Boolean).join(' and ')} under Bot in the Discord Developer Portal, then run "pm2 restart sparko-bot". Welcome needs the first; ticket messages typed in Discord need the second.`,
  );
// Auto-close quiet tickets.
setInterval(() => void tickets.sweep(), 5 * 60_000).unref();
setStatus(
  db,
  'intents',
  { members: membersIntent, content: contentIntent },
  Date.now(),
);
