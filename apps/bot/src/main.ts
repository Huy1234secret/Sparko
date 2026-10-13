import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { commands, handleCommand } from './commands.ts';

// Exit code 78 means "fix the setup"; pm2 doesn't restart on it.
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error(
    'DISCORD_BOT_TOKEN is not set. Add it to the server env file, then run "pm2 restart sparko-bot".',
  );
  process.exit(78);
}
const dashboardUrl = process.env.PUBLIC_APP_URL;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (ready) => {
  console.log(
    `Signed in as ${ready.user.tag}, in ${ready.guilds.cache.size} servers`,
  );
  ready.user.setPresence({
    activities: [
      { name: 'status', type: ActivityType.Custom, state: 'Being rebuilt' },
    ],
  });
  try {
    // Replaces the old bot's commands with the ones this bot answers.
    await ready.application.commands.set(commands);
    console.log(`Registered ${commands.length} slash command(s)`);
  } catch (error) {
    console.error('Couldn’t register slash commands', error);
  }
});

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  handleCommand(interaction, { dashboardUrl }).catch((error: unknown) =>
    console.error(`/${interaction.commandName} failed`, error),
  );
});
client.on(Events.Error, (error) => console.error(error));

const stop = () => {
  void client.destroy().finally(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await client.login(token);
