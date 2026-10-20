import {
  MessageFlags,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import {
  sbBlockMember,
  sbBlockMessage,
  sbClear,
  sbCommandFor,
  sbConfigOf,
  sbEntriesOf,
  sbEntryByPost,
  sbFindBoard,
  sbFreeze,
  sbIsBlocked,
  sbIsStaff,
  sbIsStar,
  sbJumpLink,
  sbMessage,
  sbMessageDeleted,
  sbParseMessage,
  sbPayload,
  sbRandom,
  sbRecount,
  sbRemovePosts,
  sbStats,
  sbSync,
  sbTestPost,
  sbTop,
  sbTrack,
  sbUnblock,
  serverVars,
  getGuild,
  type Db,
  type Job,
  type Rest,
  type SbEntry,
  type SbLeftovers,
  type SbMessage,
  type Starboard,
} from '@sparko/core';
import { Explained } from './jobs.ts';
import { registerGuildCommands } from './guild-commands.ts';

const EPHEMERAL = MessageFlags.Ephemeral;
/** A post is edited at most once in this long, however fast stars come. */
export const SYNC_EVERY_MS = 2000;

/**
 * Runs a job for a key at most once every `ms`: the first change runs
 * straight away, and changes during the wait become one run after it.
 */
export function debouncer<T>(
  ms: number,
  run: (key: string, extra: T[]) => Promise<void>,
  clock = Date.now,
) {
  const keys = new Map<
    string,
    {
      last: number;
      timer: ReturnType<typeof setTimeout> | null;
      running: boolean;
      again: boolean;
      extra: T[];
    }
  >();
  const go = async (key: string) => {
    const s = keys.get(key)!;
    s.timer = null;
    s.running = true;
    const extra = s.extra;
    s.extra = [];
    try {
      await run(key, extra);
    } catch (e) {
      console.error(`Updating ${key} failed`, e);
    }
    s.last = clock();
    s.running = false;
    if (s.again) {
      s.again = false;
      schedule(key);
    } else
      // Forgotten once quiet, so the map doesn't grow forever.
      setTimeout(() => {
        const now = keys.get(key);
        if (now && !now.timer && !now.running && clock() - now.last >= ms)
          keys.delete(key);
      }, ms).unref?.();
  };
  function schedule(key: string, extra?: T) {
    let s = keys.get(key);
    if (!s) {
      s = {
        last: -Infinity,
        timer: null,
        running: false,
        again: false,
        extra: [],
      };
      keys.set(key, s);
    }
    if (extra !== undefined) s.extra.push(extra);
    if (s.timer) return;
    if (s.running) {
      s.again = true;
      return;
    }
    const wait = Math.max(0, s.last + ms - clock());
    s.timer = setTimeout(() => void go(key), wait);
  }
  return { schedule, size: () => keys.size };
}

/** What the bot needs from Discord, so tests can stand in for it. */
export type SbDiscord = {
  /** A message with its author and channel, or null when it's gone. */
  message: (
    guildId: string,
    channelId: string,
    messageId: string,
  ) => Promise<SbMessage | null>;
  /** A member's roles, or null when they aren't in the server. */
  roles: (guildId: string, userId: string) => Promise<string[] | null>;
  /** Whether a channel is NSFW. */
  nsfw: (guildId: string, channelId: string) => boolean;
};

/** A reaction, as the gateway sends it. */
export type SbReaction = {
  guildId: string;
  channelId: string;
  messageId: string;
  emoji: string;
  /** How many of this emoji the message has now. */
  count: number | null;
  user: { id: string; bot: boolean };
};

type Command = ChatInputCommandInteraction<'cached'>;

const say = (i: Command, content: string) =>
  i.deferred || i.replied
    ? i.editReply({ content, allowedMentions: { parse: [] } })
    : i.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });

const snippet = (e: SbEntry) => {
  const text = (e.content ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
};

/** The /starboard top list, as an embed. */
export function topEmbed(
  c: Starboard,
  boardId: string,
  guildId: string,
  list: SbEntry[],
  member: string | null,
) {
  const b = c.boards.find((x) => x.id === boardId)!;
  const star = b.emojis[0] ?? '⭐';
  return {
    title: `${star} Top on ${b.name}`,
    description: list.length
      ? list
          .map(
            (e, i) =>
              `**${i + 1}.** ${star} **${e.stars}** · <@${e.authorId}> in <#${e.channelId}> · [Jump](${sbJumpLink(guildId, e)})${snippet(e) ? `\n> ${snippet(e)}` : ''}`,
          )
          .join('\n')
      : member
        ? `<@${member}> has nothing on ${b.name} yet.`
        : `Nothing has reached ${b.name} yet.`,
    color: 0xfacc15,
  };
}

/**
 * The starboard in the bot: counts stars from reactions, keeps each board
 * post up to date (at most one edit per post every couple of seconds), and
 * answers /starboard.
 */
export function starboardBot(
  db: Db,
  rest: Rest,
  {
    appId,
    discord,
    clock = Date.now,
  }: {
    appId: () => string | undefined;
    discord: SbDiscord;
    clock?: () => number;
  },
) {
  const queue = debouncer<boolean>(
    SYNC_EVERY_MS,
    async (key, recounts) => {
      const [guildId, boardId, messageId] = key.split(':') as [
        string,
        string,
        string,
      ];
      if (recounts.some(Boolean))
        await sbRecount(rest, db, guildId, boardId, messageId, {
          rolesOf: (id) => discord.roles(guildId, id),
        });
      await sbSync(rest, db, guildId, boardId, messageId, clock());
    },
    clock,
  );
  const update = (
    guildId: string,
    boardId: string,
    messageId: string,
    recount = false,
  ) => queue.schedule(`${guildId}:${boardId}:${messageId}`, recount);

  // Reactions -----------------------------------------------------------------

  /** Someone added a reaction, or took one off. */
  async function reaction(r: SbReaction, added: boolean) {
    const { on, config } = sbConfigOf(db, r.guildId);
    if (!on || !config.boards.some((b) => sbIsStar(b, r.emoji))) return;
    // A star on a board post counts for the message it shows.
    const post = sbEntryByPost(db, r.messageId);
    const onPost = !!post && post.guildId === r.guildId;
    const target = onPost
      ? { channelId: post.channelId, messageId: post.messageId }
      : { channelId: r.channelId, messageId: r.messageId };
    // A star taken off a message that isn't counted changes nothing.
    if (!added && !sbEntriesOf(db, r.guildId, target.messageId).length) return;
    const message = await discord.message(
      r.guildId,
      target.channelId,
      target.messageId,
    );
    if (!message) return;
    const needRoles = config.boards.some(
      (b) => b.blockedRoles.length && sbIsStar(b, r.emoji),
    );
    const changed = sbTrack(
      db,
      {
        guildId: r.guildId,
        message,
        reactor: {
          ...r.user,
          roles: needRoles ? await discord.roles(r.guildId, r.user.id) : null,
        },
        emoji: r.emoji,
        added,
        onPost,
        // Only the message's own count says whether stars came before Sparko.
        ...(onPost || r.count === null ? {} : { discordCount: r.count }),
        boardNsfw: (id) => discord.nsfw(r.guildId, id),
      },
      clock(),
    );
    for (const c of changed)
      update(r.guildId, c.boardId, message.id, c.recount);
  }

  /** Every reaction, or every one of an emoji, was cleared off a message. */
  function cleared(guildId: string, messageId: string, emoji?: string) {
    const post = sbEntryByPost(db, messageId);
    const onPost = !!post && post.guildId === guildId;
    const original = onPost ? post.messageId : messageId;
    const changed = sbClear(
      db,
      { guildId, messageId: original, onPost, ...(emoji ? { emoji } : {}) },
      clock(),
    );
    for (const b of changed) update(guildId, b, original);
  }

  /** A message was deleted: its posts may come down with it. */
  async function deleted(guildId: string, messageId: string) {
    await sbRemovePosts(
      rest,
      sbMessageDeleted(db, guildId, messageId, clock()),
    );
  }

  // Saving in the dashboard ---------------------------------------------------

  /** After a save: registers the commands, then checks each board's channel. */
  async function apply(guild: Guild | undefined) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const app = appId();
    if (app)
      await registerGuildCommands(rest, db, app, guild.id).catch(() => {
        throw new Explained(
          'Sparko couldn’t add its starboard commands. Re-invite it with the applications.commands permission.',
        );
      });
    const { on, config } = sbConfigOf(db, guild.id);
    if (!on) return;
    const me = guild.members.me;
    for (const b of config.boards) {
      const channel = guild.channels.cache.get(b.channel);
      if (!channel)
        throw new Explained(
          `${b.name}’s channel no longer exists. Pick another one.`,
        );
      const can = me && channel.permissionsFor(me);
      if (
        !can?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ])
      )
        throw new Explained(
          `Sparko can’t post in #${channel.name} for ${b.name}. Give it View Channel, Send Messages and Embed Links there.`,
        );
    }
  }

  const handlers = (guildOf: (id: string) => Guild | undefined) => ({
    starboard: (job: Job) => apply(guildOf(job.guildId)),
    'starboard-sync': async (job: Job) => {
      const p = job.payload as { board: string; message: string };
      update(job.guildId, p.board, p.message);
    },
    'starboard-delete': (job: Job) =>
      sbRemovePosts(rest, job.payload as SbLeftovers),
    'starboard-test': (job: Job) => {
      const p = job.payload as {
        board: string;
        channel: string;
        userId: string;
        userName: string;
        avatar?: string;
      };
      return sbTestPost(rest, db, job.guildId, p.board, p.channel, {
        id: p.userId,
        name: p.userName,
        avatar: p.avatar ?? '',
      });
    },
  });

  // Commands ------------------------------------------------------------------

  const isStaff = (i: Command, c: Starboard) =>
    sbIsStaff(
      c,
      new Set(i.member.roles.cache.keys()),
      i.member.permissions.has(PermissionFlagsBits.ManageMessages),
    );

  /** Handles /starboard; false when it's not this server's. */
  function command(i: Command) {
    const { on, config } = sbConfigOf(db, i.guildId);
    const sub = (() => {
      try {
        return i.options.getSubcommand(false);
      } catch {
        return null;
      }
    })();
    const key = on ? sbCommandFor(config, i.commandName, sub) : undefined;
    if (!key) return false;
    void (async () => {
      try {
        if (key === 'top' || key === 'random') {
          const typed = i.options.getString('board');
          const b = sbFindBoard(config, typed);
          if (!b) return say(i, `There’s no board called “${typed}”.`);
          if (key === 'top') {
            const member = i.options.getUser('member');
            const list = sbTop(db, i.guildId, b.id, {
              ...(member ? { authorId: member.id } : {}),
            });
            return i.reply({
              embeds: [
                topEmbed(config, b.id, i.guildId, list, member?.id ?? null),
              ],
              allowedMentions: { parse: [] },
            });
          }
          const e = sbRandom(db, i.guildId, b.id);
          if (!e) return say(i, `Nothing has reached ${b.name} yet.`);
          await i.deferReply();
          // The same post the board shows, sent as Discord's own JSON.
          return rest.patch(
            `/webhooks/${i.applicationId}/${i.token}/messages/@original`,
            sbPayload(b, sbMessage(db, i.guildId, b), e, {
              now: clock(),
              guildId: i.guildId,
              server: serverVars(getGuild(db, i.guildId)),
            }),
          );
        }
        if (key === 'stats') {
          const member = i.options.getUser('member') ?? i.user;
          const s = sbStats(db, i.guildId, member.id);
          const star = config.boards[0]?.emojis[0] ?? '⭐';
          return i.reply({
            content: `${star} <@${member.id}> has received **${s.received.toLocaleString('en-US')}** ${s.received === 1 ? 'star' : 'stars'} and given **${s.given.toLocaleString('en-US')}**. ${s.posts === 1 ? '**1** of their messages made' : `**${s.posts.toLocaleString('en-US')}** of their messages made`} the board.`,
            allowedMentions: { parse: [] },
          });
        }
        if (!isStaff(i, config))
          return say(i, 'Only staff can freeze and block on the starboard.');
        const staff = { id: i.user.id, name: i.member.displayName };
        const typed = i.options.getString('message');
        const target = typed ? sbParseMessage(typed, i.channelId) : null;
        if (typed && !target) return say(i, 'Paste the message’s link or ID.');
        if (key === 'freeze') {
          const entries = sbEntriesOf(db, i.guildId, target!.messageId).filter(
            (e) => e.postId,
          );
          if (!entries.length)
            return say(i, 'That message isn’t on the board.');
          const freeze = entries.some((e) => !e.frozen);
          for (const e of entries) {
            sbFreeze(
              db,
              i.guildId,
              e.boardId,
              e.messageId,
              freeze,
              staff,
              clock(),
            );
            if (!freeze) update(i.guildId, e.boardId, e.messageId);
          }
          return say(
            i,
            freeze
              ? 'Frozen. Its star count won’t change until it’s unfrozen.'
              : 'Unfrozen. Its star count updates again.',
          );
        }
        // Block or unblock: a message, or a member.
        const member = i.options.getUser('member');
        if (!!target === !!member)
          return say(i, 'Pick a message or a member to block, not both.');
        if (target) {
          if (sbIsBlocked(db, i.guildId, { messageId: target.messageId })) {
            sbUnblock(
              db,
              i.guildId,
              'message',
              target.messageId,
              staff,
              clock(),
            );
            return say(i, 'That message can reach the board again.');
          }
          await i.deferReply({ flags: EPHEMERAL });
          await sbRemovePosts(
            rest,
            sbBlockMessage(db, i.guildId, target, staff, clock()),
          );
          return say(i, 'Blocked. That message won’t reach the board.');
        }
        if (sbIsBlocked(db, i.guildId, { userId: member!.id })) {
          sbUnblock(db, i.guildId, 'member', member!.id, staff, clock());
          return say(i, `<@${member!.id}> can reach the board again.`);
        }
        sbBlockMember(
          db,
          i.guildId,
          { id: member!.id, name: member!.displayName },
          staff,
          clock(),
        );
        return say(
          i,
          `Blocked <@${member!.id}>. Their messages won’t reach the board, and their stars don’t count.`,
        );
      } catch (e) {
        console.error(`/${i.commandName} ${sub ?? ''} failed`, e);
        await say(i, 'Something went wrong. Try again in a moment.').catch(
          () => {},
        );
      }
    })();
    return true;
  }

  /** Suggests board names as people type them. */
  function autocomplete(i: AutocompleteInteraction<'cached'>) {
    const { on, config } = sbConfigOf(db, i.guildId);
    const sub = i.options.getSubcommand(false);
    if (!on || !sbCommandFor(config, i.commandName, sub)) return false;
    const typed = String(i.options.getFocused()).toLowerCase();
    void i
      .respond(
        config.boards
          .filter((b) => b.name.toLowerCase().includes(typed))
          .slice(0, 25)
          .map((b) => ({ name: b.name, value: b.id })),
      )
      .catch(() => {});
    return true;
  }

  return {
    handlers,
    reaction,
    cleared,
    deleted,
    command,
    autocomplete,
    update,
  };
}
