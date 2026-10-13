import {
  PermissionFlagsBits as P,
  type Guild,
  type GuildMember,
} from 'discord.js';
import {
  getModule,
  markSeen,
  renderWelcome,
  type Db,
  type WelcomeConfig,
} from '@sparko/core';
import { Explained } from './jobs.ts';

function postingChannel(guild: Guild, config: WelcomeConfig) {
  const channel = guild.channels.cache.get(config.channel);
  if (!channel || !channel.isTextBased() || !guild.members.me)
    throw new Explained('That channel no longer exists. Pick another one.');
  if (
    !channel
      .permissionsFor(guild.members.me)
      .has([P.ViewChannel, P.SendMessages, P.EmbedLinks])
  )
    throw new Explained(
      `Sparko can’t post in #${channel.name} yet. Give it View Channel, Send Messages and Embed Links there.`,
    );
  return channel;
}

/** After a save: checks Sparko can greet people where the owner chose. */
export function checkWelcome(
  db: Db,
  guild: Guild | undefined,
  membersIntent: boolean,
) {
  if (!guild) throw new Explained('Sparko isn’t in this server any more.');
  const { on, config } = getModule<WelcomeConfig>(db, guild.id, 'welcome');
  if (!on || !config) return;
  if (!membersIntent)
    throw new Explained(
      'Welcome needs Discord’s Server Members Intent. Turn it on under Bot in the Discord Developer Portal, then restart Sparko.',
    );
  if (config.delivery !== 'dm') postingChannel(guild, config);
}

/** Greets someone who just joined, if Welcome is on. */
export async function welcomeMember(
  db: Db,
  member: GuildMember,
  now = Date.now(),
) {
  if (member.user.bot) return 'skipped';
  const { guild } = member;
  const joinedBefore = markSeen(db, guild.id, member.id, now);
  const { on, config } = getModule<WelcomeConfig>(db, guild.id, 'welcome');
  if (!on || !config) return 'off';
  if (joinedBefore && !config.rejoin) return 'rejoin';
  const message = renderWelcome(config, {
    id: member.id,
    server: guild.name,
    memberCount: guild.memberCount,
  });
  if (config.delivery !== 'dm')
    await postingChannel(guild, config).send(message);
  // People can turn off DMs from servers; that's fine.
  if (config.delivery !== 'channel') await member.send(message).catch(() => {});
  return 'sent';
}
