import { join } from 'node:path';
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  MessageType,
  Partials,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import {
  addAudit,
  arBoosted,
  arJoined,
  arLeft,
  arUpdated,
  defaultDbPath,
  discordRest,
  editStudioMessage,
  getModule,
  handleStudioInteraction,
  ticketActions,
  ticketButtonPrefix,
  markOnlyInstalled,
  openDb,
  Plain,
  publishStudio,
  rrButtonPrefix,
  rrPostByMessage,
  rrSummary,
  syncReactionRole,
  applyReactionRole,
  pruneJobs,
  requeueRunning,
  setStatus,
  upsertGuild,
  type StudioMessage,
} from '@sparko/core';
import { commands, handleCommand } from './commands.ts';
import { startJobLoop, type Handlers } from './jobs.ts';
import {
  applyAutoRoles,
  checkOne,
  factsOf,
  pendingBefore,
  startAutoRoleSweep,
} from './auto-roles.ts';
import { pollsBot } from './polls.ts';
import { starboardBot } from './starboard.ts';
import { questionsBot } from './questions.ts';
import { suggestionsBot } from './suggestions.ts';
import { birthdaysBot } from './birthdays.ts';
import { studioInfo } from './studio-info.ts';
import { registerAllGuildCommands } from './guild-commands.ts';
import {
  checkWelcome,
  memberJoined,
  memberLeft,
  memberUpdated,
} from './welcome.ts';

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
const suggestions = suggestionsBot(db, rest, {
  appId: () => client?.application?.id,
});
const birthdays = birthdaysBot(db, rest, {
  appId: () => client?.application?.id,
});
const questions = questionsBot(db, rest, {
  appId: () => client?.application?.id,
});
const starboard = starboardBot(db, rest, {
  appId: () => client?.application?.id,
  discord: {
    message: (guildId, channelId, messageId) =>
      starredMessage(guildId, channelId, messageId),
    roles: async (guildId, userId) => {
      const member = await client.guilds.cache
        .get(guildId)
        ?.members.fetch(userId)
        .catch(() => null);
      return member ? [...member.roles.cache.keys()] : null;
    },
    nsfw: (_, channelId) => {
      const channel = client.channels.cache.get(channelId);
      return !!channel && 'nsfw' in channel && channel.nsfw;
    },
  },
});
const polls = pollsBot(db, rest, { appId: () => client?.application?.id });
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
  autoroles: (job) =>
    applyAutoRoles(
      db,
      rest,
      client.guilds.cache.get(job.guildId),
      membersIntent,
    ),
  'autoroles-check': (job) =>
    checkOne(db, rest, job.guildId, (job.payload as { userId: string }).userId),
  studio: (job) => {
    const by = job.payload as { userId?: string; userName?: string };
    return publishStudio(
      rest,
      db,
      job.guildId,
      Date.now(),
      by.userId && by.userName
        ? { id: by.userId, name: by.userName }
        : undefined,
    );
  },
  ...suggestions.handlers((id) => client.guilds.cache.get(id)),
  ...polls.handlers((id) => client.guilds.cache.get(id)),
  ...starboard.handlers((id) => client.guilds.cache.get(id)),
  ...questions.handlers((id) => client.guilds.cache.get(id)),
  ...birthdays.handlers((id) => client.guilds.cache.get(id)),
  'rr-sync': (job) =>
    syncReactionRole(
      rest,
      db,
      job.guildId,
      (job.payload as { id: string }).id,
      Date.now(),
    ),
  'studio-edit': (job) => {
    const p = job.payload as {
      userId: string;
      userName: string;
      channelId: string;
      messageId: string;
      message: StudioMessage;
    };
    return editStudioMessage(
      rest,
      db,
      job.guildId,
      { channelId: p.channelId, messageId: p.messageId },
      p.message,
      Date.now(),
      { id: p.userId, name: p.userName },
    );
  },
};

/** A member, for {user}, {user.avatar}, {user.created} and {user.joined}. */
const memberVars = (member: GuildMember) => ({
  id: member.id,
  name: member.displayName,
  avatar: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
  createdAt: member.user.createdTimestamp,
  joinedAt: member.joinedTimestamp ?? undefined,
});

const record = (guild: Guild, installed: boolean) =>
  upsertGuild(
    db,
    {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      memberCount: guild.memberCount,
      installed,
      boosts: guild.premiumSubscriptionCount ?? 0,
      boostLevel: guild.premiumTier,
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
    // A boost is a change to a member, so Sparko needs to know them first.
    if (membersIntent)
      for (const guild of ready.guilds.cache.values())
        if (getModule(db, guild.id, 'welcome').on)
          void guild.members.fetch().catch(() => {});
    try {
      // Replaces the old bot's commands with the ones this bot answers.
      await ready.application.commands.set(commands);
      setStatus(db, 'commands', { count: commands.length }, Date.now());
      console.log(`Registered ${commands.length} slash command(s)`);
    } catch (error) {
      console.error('Couldn’t register slash commands', error);
    }
    // Every module's per-server commands, with the names each server picked.
    void registerAllGuildCommands(rest, db, ready.application.id, (id) =>
      ready.guilds.cache.has(id),
    );
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
    // Suggestions: the server's commands, their forms, votes and review.
    if (interaction.inCachedGuild()) {
      if (interaction.isAutocomplete() && suggestions.autocomplete(interaction))
        return;
      if (interaction.isChatInputCommand() && suggestions.command(interaction))
        return;
      // Birthdays: /birthday and its time zone suggestions.
      if (interaction.isAutocomplete() && birthdays.autocomplete(interaction))
        return;
      if (interaction.isChatInputCommand() && birthdays.command(interaction))
        return;
      // Questions & answers: /question, its forms and the question buttons.
      if (interaction.isAutocomplete() && questions.autocomplete(interaction))
        return;
      if (interaction.isChatInputCommand() && questions.command(interaction))
        return;
      // The starboard: /starboard and its board names.
      if (interaction.isAutocomplete() && starboard.autocomplete(interaction))
        return;
      if (interaction.isChatInputCommand() && starboard.command(interaction))
        return;
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('qa:')
      ) {
        void questions.modal(interaction);
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith('qa:')) {
        void questions.component(interaction);
        return;
      }
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('sg:')
      ) {
        void suggestions.modal(interaction);
        return;
      }
      if (
        (interaction.isButton() || interaction.isStringSelectMenu()) &&
        interaction.customId.startsWith('sg:')
      ) {
        void suggestions.component(interaction);
        return;
      }
      // Polls: the server's /poll command, its form and the votes.
      if (interaction.isAutocomplete() && polls.autocomplete(interaction))
        return;
      if (interaction.isChatInputCommand() && polls.command(interaction))
        return;
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('pl:')
      ) {
        void polls.modal(interaction);
        return;
      }
      if (
        (interaction.isButton() || interaction.isStringSelectMenu()) &&
        interaction.customId.startsWith('pl:')
      ) {
        void polls.component(interaction);
        return;
      }
    }
    if (
      interaction.isButton() &&
      interaction.customId.startsWith(ticketButtonPrefix) &&
      interaction.inGuild()
    ) {
      void openTicket(interaction);
      return;
    }
    // Reaction role buttons and menus.
    if (
      (interaction.isButton() || interaction.isStringSelectMenu()) &&
      interaction.customId.startsWith('rr:') &&
      interaction.inCachedGuild()
    ) {
      void reactionRoleInteraction(interaction);
      return;
    }
    // Buttons and menus on Message Studio messages.
    if (
      (interaction.isButton() || interaction.isStringSelectMenu()) &&
      interaction.customId.startsWith('sp:') &&
      interaction.inGuild()
    ) {
      studio(interaction).catch((error: unknown) =>
        console.error('A Message Studio button failed', error),
      );
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    handleCommand(interaction, { dashboardUrl }).catch((error: unknown) =>
      console.error(`/${interaction.commandName} failed`, error),
    );
  });
  /** Suggestion actions go to suggestions; everything else to Message Studio. */
  async function studio(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
  ) {
    if (!interaction.inGuild()) return;
    if (
      interaction.inCachedGuild() &&
      (await suggestions.studioAction(interaction))
    )
      return;
    await handleStudioInteraction(rest, db, studioInfo(interaction));
  }
  // Keeps the name, picture and boosts current for {server…} variables.
  c.on(Events.GuildUpdate, (_, guild) => record(guild, true));
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
    // Discord's "just boosted" notices, for automatic roles' boost count.
    if (
      message.guildId &&
      message.member &&
      [
        MessageType.GuildBoost,
        MessageType.GuildBoostTier1,
        MessageType.GuildBoostTier2,
        MessageType.GuildBoostTier3,
      ].includes(message.type)
    ) {
      arBoosted(
        db,
        message.guildId,
        factsOf(message.member),
        Math.max(1, Math.min(100, Number(message.content) || 1)),
        Date.now(),
      );
      return;
    }
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
  const failed = (what: string) => (error: unknown) =>
    console.error(`${what} failed`, error);
  c.on(Events.GuildMemberAdd, (member) => {
    memberJoined(db, rest, member).catch(
      failed(`Welcoming ${member.id} in ${member.guild.id}`),
    );
    if (!member.user.bot)
      arJoined(db, rest, member.guild.id, factsOf(member), Date.now()).catch(
        failed(`Automatic roles for ${member.id} in ${member.guild.id}`),
      );
    if (!member.user.bot) birthdays.joined(member);
  });
  c.on(Events.GuildMemberUpdate, (before, after) => {
    memberUpdated(db, rest, before, after).catch(
      failed(`Updating ${after.id} in ${after.guild.id}`),
    );
    if (!after.user.bot)
      arUpdated(
        db,
        rest,
        after.guild.id,
        pendingBefore(before),
        factsOf(after),
        Date.now(),
      ).catch(failed(`Automatic roles for ${after.id} in ${after.guild.id}`));
  });
  c.on(Events.MessageReactionAdd, (reaction, user) => {
    void reactionRoleReaction(reaction, user, 'react');
    void suggestionReaction(reaction, user, true);
    void starboardReaction(reaction, user, true);
  });
  c.on(Events.MessageReactionRemove, (reaction, user) => {
    void reactionRoleReaction(reaction, user, 'unreact');
    void suggestionReaction(reaction, user, false);
    void starboardReaction(reaction, user, false);
  });
  c.on(Events.MessageReactionRemoveAll, (message) => {
    if (message.guildId) starboard.cleared(message.guildId, message.id);
  });
  c.on(Events.MessageReactionRemoveEmoji, (reaction) => {
    const emoji = emojiOf(reaction);
    if (reaction.message.guildId && emoji)
      starboard.cleared(reaction.message.guildId, reaction.message.id, emoji);
  });
  c.on(Events.MessageDelete, (message) => {
    if (message.guildId)
      starboard
        .deleted(message.guildId, message.id)
        .catch(failed(`A deleted starred message in ${message.guildId}`));
    if (!message.guild) return;
    suggestions
      .deleted(message.guild, message.channelId, message.id)
      .catch(failed(`A deleted suggestion in ${message.guild.id}`));
    questions
      .deleted(message.id)
      .catch(failed(`A deleted question in ${message.guild.id}`));
  });
  c.on(Events.MessageBulkDelete, (messages) => {
    for (const message of messages.values())
      if (message.guildId)
        starboard
          .deleted(message.guildId, message.id)
          .catch(failed(`A deleted starred message in ${message.guildId}`));
  });
  c.on(Events.GuildMemberRemove, (member) => {
    if (!member.user?.bot) arLeft(db, member.guild.id, member.id, Date.now());
    if (!member.user?.bot) birthdays.left(member.guild.id, member.id);
    memberLeft(db, rest, member).catch(
      failed(`Saying goodbye to ${member.id} in ${member.guild.id}`),
    );
  });
}

/** A vote by reaction on a suggestion. */
async function suggestionReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  added: boolean,
) {
  try {
    if (user.bot || !reaction.message.guildId) return;
    const e = reaction.emoji;
    const emoji = e.id
      ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`
      : e.name;
    if (!emoji) return;
    await suggestions.reaction(
      {
        messageId: reaction.message.id,
        channelId: reaction.message.channelId,
        emoji,
      },
      user.id,
      added,
    );
  } catch (error) {
    console.error('A suggestion vote failed', error);
  }
}

/** A reaction's emoji, written the way settings save it. */
const emojiOf = (reaction: MessageReaction | PartialMessageReaction) => {
  const e = reaction.emoji;
  return e.id ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : e.name;
};

/** A star added to (or taken off) a message or a board post. */
async function starboardReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  added: boolean,
) {
  try {
    const guildId = reaction.message.guildId;
    const emoji = emojiOf(reaction);
    if (!guildId || !emoji) return;
    // Partial reactions don't say how many there are until fetched.
    const full =
      added && reaction.partial
        ? await reaction.fetch().catch(() => null)
        : reaction;
    const who = user.partial ? await user.fetch().catch(() => user) : user;
    await starboard.reaction(
      {
        guildId,
        channelId: reaction.message.channelId,
        messageId: reaction.message.id,
        emoji,
        count: full && !full.partial ? full.count : null,
        user: { id: who.id, bot: !!who.bot },
      },
      added,
    );
  } catch (error) {
    console.error('A starboard reaction failed', error);
  }
}

/** A message someone starred, with what the board's rules need to know. */
async function starredMessage(
  guildId: string,
  channelId: string,
  messageId: string,
) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !('messages' in channel) || channel.isDMBased()) return null;
  const msg: Message | null = await channel.messages
    .fetch(messageId)
    .catch(() => null);
  if (!msg || msg.guildId !== guildId) return null;
  const member =
    msg.member ??
    (await msg.guild?.members.fetch(msg.author.id).catch(() => null)) ??
    null;
  const thread = channel.isThread();
  const picture =
    msg.attachments.find((a) => !!a.contentType?.startsWith('image/'))?.url ??
    msg.embeds.map((e) => e.image?.url ?? e.thumbnail?.url).find(Boolean) ??
    '';
  // Without the Message Content Intent, Discord sends most text empty.
  const content = msg.content || (contentIntent ? '' : null);
  return {
    id: msg.id,
    channelId,
    parentId: thread ? channel.parentId : null,
    nsfw: thread ? !!channel.parent?.nsfw : 'nsfw' in channel && channel.nsfw,
    authorId: msg.author.id,
    authorName:
      member?.displayName ?? msg.author.globalName ?? msg.author.username,
    authorAvatar: (member ?? msg.author).displayAvatarURL({
      extension: 'png',
      size: 256,
    }),
    authorBot: msg.author.bot,
    authorRoles: member ? [...member.roles.cache.keys()] : [],
    content,
    image: picture,
    // Text Discord kept back can't be measured, so it isn't too short.
    length: content === null ? Number.MAX_SAFE_INTEGER : content.length,
    createdAt: msg.createdTimestamp,
  };
}

/** Sends a direct message; people who don't take DMs simply don't get it. */
async function dm(userId: string, body: object) {
  try {
    const channel = await rest.post<{ id: string }>('/users/@me/channels', {
      recipient_id: userId,
    });
    await rest.post(`/channels/${channel.id}/messages`, body);
  } catch {
    // Closed DMs aren't an error worth reporting.
  }
}

/** Someone reacted on (or took a reaction off) a reaction role message. */
async function reactionRoleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  action: 'react' | 'unreact',
) {
  try {
    if (user.bot || !reaction.message.guildId) return;
    if (!rrPostByMessage(db, reaction.message.id)) return;
    const guild = client.guilds.cache.get(reaction.message.guildId);
    if (!guild) return;
    const member = await guild.members.fetch(user.id);
    const e = reaction.emoji;
    const emoji = e.id
      ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`
      : e.name;
    if (!emoji) return;
    const done = await applyReactionRole(rest, db, {
      messageId: reaction.message.id,
      user: memberVars(member),
      roles: [...member.roles.cache.keys()],
      roleName: (id) => guild.roles.cache.get(id)?.name,
      action,
      emoji,
    });
    if (!done || done.off) return;
    // A refused reaction is taken back off, so it doesn't look like it worked.
    if (action === 'react' && done.refused.length && !done.given.length)
      await reaction.users.remove(user.id).catch(() => {});
    // Reactions can't be answered privately, so they get no reply.
  } catch (error) {
    console.error('A reaction role reaction failed', error);
  }
}

/** A member used a reaction role button or menu. */
async function reactionRoleInteraction(
  interaction:
    | ButtonInteraction<'cached'>
    | StringSelectMenuInteraction<'cached'>,
) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { member } = interaction;
    const base = {
      messageId: interaction.message.id,
      user: memberVars(member),
      roles: [...member.roles.cache.keys()],
      roleName: (id: string) => interaction.guild.roles.cache.get(id)?.name,
    };
    const done = await applyReactionRole(
      rest,
      db,
      interaction.isButton()
        ? {
            ...base,
            action: 'button',
            item: interaction.customId.slice(rrButtonPrefix.length),
          }
        : { ...base, action: 'menu', items: interaction.values },
    );
    const summary = rrSummary(done);
    const response = done && !done.off ? done.response : null;
    if (response && done && !done.off && done.delivery !== 'channel')
      await dm(member.id, response);
    if (response && done && !done.off && done.delivery !== 'dm')
      // Sent as Discord's own JSON, so Components V2 responses work too.
      await rest.patch(
        `/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`,
        response,
      );
    else
      await interaction.editReply({
        content: summary,
        allowedMentions: { parse: [] },
      });
  } catch (error) {
    console.error('A reaction role button or menu failed', error);
    await interaction
      .editReply('Sparko couldn’t change your roles just now. Try again.')
      .catch(() => {});
  }
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
      GatewayIntentBits.GuildMessageReactions,
      ...(members ? [GatewayIntentBits.GuildMembers] : []),
      ...(content ? [GatewayIntentBits.MessageContent] : []),
    ],
    // Someone Sparko hasn't seen yet can still leave.
    partials: [
      Partials.GuildMember,
      Partials.User,
      Partials.Message,
      Partials.Reaction,
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
// Timed roles and rules.
startAutoRoleSweep(db, rest, (id) => client.guilds.cache.has(id));
// Suggestions that close after a while.
// Question threads that close after a while, and questions that expire.
questions.startSweep((id) => client.guilds.cache.has(id));
suggestions.startSweep((id) => client.guilds.cache.has(id));
// Birthdays at each server's hour, their roles and the monthly post.
birthdays.startSweep((id) => client.guilds.cache.has(id));
// Scheduled polls, and polls whose time is up.
polls.startSweep((id) => client.guilds.cache.has(id));
setStatus(
  db,
  'intents',
  { members: membersIntent, content: contentIntent },
  Date.now(),
);
