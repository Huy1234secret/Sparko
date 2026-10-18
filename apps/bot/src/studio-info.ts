import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { StudioInteraction } from '@sparko/core';

/** What Message Studio actions need to know about a click in a server. */
export function studioInfo(
  interaction: (ButtonInteraction | StringSelectMenuInteraction) & {
    guildId: string;
  },
): StudioInteraction {
  const member = interaction.member;
  return {
    id: interaction.id,
    token: interaction.token,
    applicationId: interaction.applicationId,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userName:
      member && 'displayName' in member
        ? member.displayName
        : interaction.user.displayName,
    userAvatar: interaction.user.displayAvatarURL({
      extension: 'png',
      size: 256,
    }),
    userCreated: interaction.user.createdTimestamp,
    userJoined:
      member && 'joinedTimestamp' in member
        ? (member.joinedTimestamp ?? undefined)
        : undefined,
    messageId: interaction.message.id,
    customId: interaction.customId,
    values: interaction.isStringSelectMenu() ? interaction.values : [],
  };
}
