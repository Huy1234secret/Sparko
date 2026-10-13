import { MessageFlags } from 'discord.js';

/** The slash commands this bot registers with Discord. */
export const commands = [
  { name: 'ping', description: 'Check that Sparko is online' },
];

/** What the handler needs from a slash command interaction. */
export type CommandInteraction = {
  commandName: string;
  client: { ws: { ping: number } };
  reply: (message: { content: string; flags: number }) => Promise<unknown>;
};

export function handleCommand(
  interaction: CommandInteraction,
  { dashboardUrl }: { dashboardUrl?: string | undefined },
) {
  const dashboard = dashboardUrl ? ` Dashboard: ${dashboardUrl}` : '';
  if (interaction.commandName === 'ping') {
    const ping = interaction.client.ws.ping;
    return interaction.reply({
      content: `Pong! Sparko is online${ping >= 0 ? ` (${Math.round(ping)} ms)` : ''}.${dashboard}`,
      flags: MessageFlags.Ephemeral,
    });
  }
  return interaction.reply({
    content: `This command is being rebuilt and will be back soon.${dashboard}`,
    flags: MessageFlags.Ephemeral,
  });
}
