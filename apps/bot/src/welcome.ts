import {
  PermissionFlagsBits as P,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';
import {
  greetKinds,
  markSeen,
  sendGreeting,
  welcomeOf,
  type Db,
  type GreetKind,
  type Rest,
} from '@sparko/core';
import { Explained } from './jobs.ts';

function canPost(guild: Guild, channelId: string) {
  const channel = guild.channels.cache.get(channelId);
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
}

/** After a save: checks Sparko can post where each message goes. */
export function checkWelcome(
  db: Db,
  guild: Guild | undefined,
  membersIntent: boolean,
) {
  if (!guild) throw new Explained('Sparko isn’t in this server any more.');
  const { on, config } = welcomeOf(db, guild.id, Date.now());
  if (!on || !config) return;
  if (!membersIntent)
    throw new Explained(
      'Welcome messages need Discord’s Server Members Intent. Turn it on under Bot in the Discord Developer Portal, then restart Sparko.',
    );
  for (const kind of greetKinds) {
    const s = config[kind];
    if (s.channel && s.template) canPost(guild, s.channel);
  }
}

type Member = GuildMember | PartialGuildMember;

/** Sends one kind of message about a member, and deletes it later if asked. */
export async function greet(
  db: Db,
  rest: Rest,
  kind: GreetKind,
  member: Member,
  now = Date.now(),
) {
  const { guild, user } = member;
  const toDelete = await sendGreeting(rest, db, {
    guildId: guild.id,
    kind,
    member: {
      id: member.id,
      name: member.displayName ?? user.username,
      avatar: user.displayAvatarURL({ extension: 'png', size: 256 }),
      createdAt: user.createdTimestamp,
      joinedAt: member.joinedTimestamp ?? undefined,
    },
    server: {
      name: guild.name,
      members: guild.memberCount,
      icon: guild.iconURL({ extension: 'png', size: 256 }) ?? undefined,
      boosts: guild.premiumSubscriptionCount ?? 0,
      level: guild.premiumTier,
    },
    now,
  });
  // A restart forgets the timer, and the message stays; that's harmless.
  if (toDelete)
    setTimeout(() => {
      rest
        .delete(
          `/channels/${toDelete.channelId}/messages/${toDelete.messageId}`,
        )
        .catch(() => {});
    }, toDelete.after * 1000).unref();
  return toDelete;
}

/** New members waiting to accept the rules before they're welcomed. */
const waiting = new Set<string>();
const keyOf = (m: Member) => `${m.guild.id}:${m.id}`;

/** Someone joined: welcomes them now, or once they accept the rules. */
export async function memberJoined(
  db: Db,
  rest: Rest,
  member: GuildMember,
  now = Date.now(),
) {
  if (member.user.bot) return 'skipped';
  const joinedBefore = markSeen(db, member.guild.id, member.id, now);
  const { on, config } = welcomeOf(db, member.guild.id, now);
  if (!on || !config) return 'off';
  if (joinedBefore && !config.join.rejoin) return 'rejoin';
  if (member.pending && config.join.waitForRules) {
    waiting.add(keyOf(member));
    return 'waiting';
  }
  await greet(db, rest, 'join', member, now);
  return 'sent';
}

/** A member changed: they accepted the rules, or boosted the server. */
export async function memberUpdated(
  db: Db,
  rest: Rest,
  before: Member,
  after: GuildMember,
  now = Date.now(),
) {
  if (after.user.bot) return 'skipped';
  if (!after.pending && waiting.delete(keyOf(after))) {
    await greet(db, rest, 'join', after, now);
    return 'sent';
  }
  // Without the member's earlier state, a boost can't be told apart.
  if (!before.partial && !before.premiumSince && after.premiumSince) {
    await greet(db, rest, 'boost', after, now);
    return 'boosted';
  }
  return 'nothing';
}

/** Someone left. */
export async function memberLeft(
  db: Db,
  rest: Rest,
  member: Member,
  now = Date.now(),
) {
  waiting.delete(keyOf(member));
  if (member.user.bot) return 'skipped';
  await greet(db, rest, 'leave', member, now);
  return 'sent';
}
