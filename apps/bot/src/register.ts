import { REST, Routes } from 'discord.js';
import { loadConfig } from '@sparko/config';
import { buildCommands } from './commands.js';

const config = loadConfig();
if (!config.DISCORD_CLIENT_ID || !config.DISCORD_BOT_TOKEN)
  throw new Error(
    'Command registration requires DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN.',
  );
const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
const guildId = process.env['DISCORD_TEST_GUILD_ID'];
await rest.put(
  guildId
    ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId)
    : Routes.applicationCommands(config.DISCORD_CLIENT_ID),
  { body: buildCommands() },
);
process.stdout.write(
  `Registered ${buildCommands().length} validated commands${guildId ? ' in the configured test guild' : ' globally'}.\n`,
);
