import { SlashCommandBuilder } from 'discord.js';
import { commandRegistry } from '@sparko/contracts';

export function buildCommands() {
  return commandRegistry.map(({ name, description }) => {
    const command = new SlashCommandBuilder().setName(name).setDescription(description).setContexts(0);
    if (name === 'ticket') command
      .addSubcommand((sub) => sub.setName('open').setDescription('Open a private support ticket').addStringOption((option) => option.setName('category').setDescription('Configured ticket topic').setAutocomplete(true)))
      .addSubcommand((sub) => sub.setName('list').setDescription('View your tickets'))
      .addSubcommand((sub) => sub.setName('claim').setDescription('Claim this ticket as support staff'))
      .addSubcommand((sub) => sub.setName('close').setDescription('Close this ticket after transcript capture').addStringOption((option) => option.setName('reason').setDescription('Why this ticket is closing').setRequired(true).setMaxLength(1000)));
    return command.toJSON();
  });
}
