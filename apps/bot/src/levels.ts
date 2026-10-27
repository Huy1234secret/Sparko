import {
  ChannelType,
  MessageFlags,
  MessageType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Message,
} from 'discord.js';
import {
  LV_CRATE_ID,
  LV_MAX_CHANGE,
  LV_PAGE,
  lvApplyRewards,
  lvChangeXp,
  lvCommandFor,
  lvConfigOf,
  lvCrateSweep,
  lvGuilds,
  lvIsStaff,
  lvLeaderboard,
  lvOnMessage,
  lvOpenCrate,
  lvRankPayload,
  lvReset,
  lvRewardTargets,
  lvSwapCrateRow,
  lvTestPost,
  lvVoiceMinute,
  type Db,
  type Job,
  type Levels,
  type LvChange,
  type LvKind,
  type LvRow,
  type Rest,
} from '@sparko/core';
import { Explained } from './jobs.ts';
import { registerGuildCommands } from './guild-commands.ts';

const EPHEMERAL = MessageFlags.Ephemeral;
const n = (v: number) => v.toLocaleString('en-US');

const rolesOf = (m: GuildMember | null) =>
  new Set(m ? [...m.roles.cache.keys()] : []);
const isManager = (m: GuildMember | null) =>
  !!m?.permissions.has(PermissionFlagsBits.ManageGuild);
const personOf = (m: GuildMember) => ({
  id: m.id,
  name: m.displayName,
  avatar: m.user.displayAvatarURL({ extension: 'png', size: 256 }),
});

// What the commands say -------------------------------------------------------

/** A page of the leaderboard. */
export function leaderboardText(
  c: Levels,
  board: { rows: LvRow[]; page: number; pages: number },
) {
  if (!board.rows.length)
    return 'Nobody has any XP yet. Members earn it by chatting and spending time in voice.';
  return [
    `🏆 **Most active members**${board.pages > 1 ? ` · page ${board.page} of ${board.pages}` : ''}`,
    ...board.rows.map(
      (r) =>
        `**${r.rank}.** <@${r.userId}> · level **${n(r.level)}** · ${n(r.xp)} XP`,
    ),
    ...(board.page < board.pages
      ? [`-# More with /${c.commands.leaderboard.name} page:${board.page + 1}`]
      : []),
  ].join('\n');
}

/** What /xp says after a change. */
export function changeText(
  mode: LvChange,
  amount: number,
  who: string,
  after: { xp: number; level: number },
) {
  const did =
    mode === 'give'
      ? `Gave ${who} ${n(amount)} XP`
      : mode === 'take'
        ? `Took ${n(amount)} XP from ${who}`
        : `Set ${who}’s XP to ${n(amount)}`;
  return `${did}. They’re level **${n(after.level)}** with **${n(after.xp)}** XP now.`;
}

/** Messages that earn XP: what members type, not Discord's notices. */
const earns = (m: Message) =>
  !!m.guildId &&
  !!m.member &&
  !m.author.bot &&
  !m.webhookId &&
  (m.type === MessageType.Default || m.type === MessageType.Reply);

/**
 * Levels & XP in the bot: XP for messages and voice, crates, the server's
 * /rank, /leaderboard and /xp commands, and the jobs saves queue.
 */
export function levelsBot(
  db: Db,
  rest: Rest,
  { appId }: { appId: () => string | undefined },
) {
  let guildOf: (id: string) => Guild | undefined = () => undefined;
  const roleName = (guildId: string) => (id: string) =>
    guildOf(guildId)?.roles.cache.get(id)?.name;
  const rewards = (guildId: string, userId: string) => {
    const m = guildOf(guildId)?.members.cache.get(userId);
    return lvApplyRewards(rest, db, guildId, userId, {
      roleName: roleName(guildId),
      roles: m ? [...m.roles.cache.keys()] : undefined,
    });
  };

  /** After a save: commands, channels, roles, and everyone's rewards. */
  async function apply(guild: Guild | undefined, everyone: boolean) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const { on, config } = lvConfigOf(db, guild.id);
    const app = appId();
    if (app)
      await registerGuildCommands(rest, db, app, guild.id).catch(() => {
        throw new Explained(
          'Sparko couldn’t add the level commands. Re-invite it with the applications.commands permission.',
        );
      });
    if (!on) return;
    const me = guild.members.me;
    if (!me) return;
    const canPost = (id: string, what: string) => {
      const channel = guild.channels.cache.get(id);
      if (!channel)
        throw new Explained(
          `The ${what} channel no longer exists. Pick another one.`,
        );
      if (
        !channel
          .permissionsFor(me)
          ?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
          ])
      )
        throw new Explained(
          `Sparko can’t post in #${channel.name}. Give it View Channel, Send Messages and Embed Links there.`,
        );
    };
    if (config.levelUp.where === 'channel')
      canPost(config.levelUp.channel, 'level-up');
    if (config.crates.on)
      for (const id of config.crates.channels) canPost(id, 'XP crate');
    if (!config.rewards.length) return;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
      throw new Explained('Sparko needs Manage Roles to give reward roles.');
    for (const r of config.rewards) {
      const role = guild.roles.cache.get(r.role);
      if (!role)
        throw new Explained(
          `The reward role for level ${r.level} no longer exists. Pick another.`,
        );
      if (role.position >= me.roles.highest.position)
        throw new Explained(
          `Sparko can’t give @${role.name}. Move Sparko’s role above it in Server Settings → Roles.`,
        );
    }
    // New tiers, or a new curve, apply to everyone who already has XP.
    if (everyone)
      void (async () => {
        for (const id of lvRewardTargets(db, guild.id))
          await rewards(guild.id, id).catch(() => {});
      })();
  }

  /** The job handlers for saves, test messages and reward roles. */
  const handlers = (find: (id: string) => Guild | undefined) => {
    guildOf = find;
    return {
      levels: (job: Job) =>
        apply(
          find(job.guildId),
          !!(job.payload as { rewards?: boolean } | null)?.rewards,
        ),
      'levels-test': (job: Job) => {
        const p = job.payload as {
          channel: string;
          kind: LvKind;
          userId: string;
          userName: string;
          avatar?: string;
        };
        return lvTestPost(rest, db, job.guildId, p.channel, p.kind, {
          id: p.userId,
          name: p.userName,
          avatar: p.avatar ?? '',
        });
      },
      'levels-rewards': async (job: Job) => {
        const p = job.payload as { userIds?: string[] };
        for (const id of p.userIds ?? [])
          await rewards(job.guildId, id).catch(() => {});
      },
    };
  };

  /** Someone wrote a message: XP, a level-up, and maybe a crate. */
  async function message(m: Message) {
    if (!earns(m) || !lvConfigOf(db, m.guildId!).on) return;
    const member = m.member!;
    await lvOnMessage(
      rest,
      db,
      m.guildId!,
      { ...personOf(member), roles: [...member.roles.cache.keys()] },
      {
        channelId: m.channelId,
        parentId: m.channel.isThread() ? m.channel.parentId : null,
      },
      { roleName: roleName(m.guildId!) },
    );
  }

  /** A minute in voice: XP for everyone talking with someone else. */
  async function voiceMinute(guild: Guild) {
    const { on, config: c } = lvConfigOf(db, guild.id);
    if (!on || !c.voice.on) return;
    const earning = [];
    for (const channel of guild.channels.cache.values()) {
      if (
        channel.type !== ChannelType.GuildVoice &&
        channel.type !== ChannelType.GuildStageVoice
      )
        continue;
      if (channel.id === guild.afkChannelId) continue;
      const people = [...channel.members.values()].filter((x) => !x.user.bot);
      if (c.voice.needOthers && people.length < 2) continue;
      for (const member of people) {
        const v = member.voice;
        if (
          c.voice.skipMuted &&
          (v.selfMute || v.selfDeaf || v.serverMute || v.serverDeaf)
        )
          continue;
        earning.push({
          ...personOf(member),
          roles: [...member.roles.cache.keys()],
          place: { channelId: channel.id, parentId: channel.parentId },
        });
      }
    }
    if (earning.length)
      await lvVoiceMinute(rest, db, guild.id, earning, {
        roleName: roleName(guild.id),
      });
  }

  /** Every minute voice XP, and every 10 seconds crates that ran out. */
  function startSweep(inGuild: (id: string) => boolean) {
    setInterval(() => {
      void (async () => {
        for (const id of lvGuilds(db)) {
          const guild = inGuild(id) ? guildOf(id) : undefined;
          if (guild)
            await voiceMinute(guild).catch((e: unknown) =>
              console.error(`Voice XP in ${id} failed`, e),
            );
        }
      })();
    }, 60_000).unref();
    setInterval(() => {
      lvCrateSweep(rest, db).catch((e: unknown) =>
        console.error('Expiring XP crates failed', e),
      );
    }, 10_000).unref();
  }

  /** Someone pressed Open on a crate. */
  async function crate(i: ButtonInteraction<'cached'>) {
    try {
      const done = await lvOpenCrate(
        rest,
        db,
        i.guildId,
        i.message.id,
        { ...personOf(i.member), roles: [...i.member.roles.cache.keys()] },
        { roleName: roleName(i.guildId) },
      );
      const rows = i.message.components.map((c) => c.toJSON() as object);
      if (done.result === 'won') {
        await i.update({
          components: lvSwapCrateRow(rows, {
            claimedBy: i.member.displayName,
            xp: done.won,
          }) as never,
        });
        await i.followUp({
          content: `🎉 You opened the crate: **+${n(done.won)} XP**.${done.to > done.from ? ` You’re level **${n(done.to)}** now!` : ''}`,
          flags: EPHEMERAL,
        });
        return;
      }
      await i.reply({
        content:
          done.result === 'taken'
            ? `Too slow! ${done.by || 'Someone'} opened this crate first.`
            : 'This crate already vanished.',
        flags: EPHEMERAL,
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      console.error('Opening an XP crate failed', e);
      await i
        .reply({
          content: 'Sparko couldn’t open the crate just now. Try again.',
          flags: EPHEMERAL,
        })
        .catch(() => {});
    }
  }

  const say = (i: ChatInputCommandInteraction<'cached'>, content: string) =>
    i.deferred || i.replied
      ? i.editReply({ content, allowedMentions: { parse: [] } })
      : i.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });

  /** Handles /rank, /leaderboard and /xp; false when it's not one of them. */
  function command(i: ChatInputCommandInteraction<'cached'>) {
    const { on, config: c } = lvConfigOf(db, i.guildId);
    const key = on ? lvCommandFor(c, i.commandName) : undefined;
    if (!key) return false;
    void (async () => {
      try {
        const now = Date.now();
        if (key === 'rank') {
          const target = i.options.getMember('member') ?? i.member;
          if (target.user.bot) return await say(i, 'Bots don’t earn XP.');
          await i.deferReply(c.rank.public ? {} : { flags: EPHEMERAL });
          // Sent as Discord's own JSON, so Components V2 cards work too.
          await rest.patch(
            `/webhooks/${i.applicationId}/${i.token}/messages/@original`,
            lvRankPayload(
              db,
              i.guildId,
              {
                ...personOf(target),
                createdAt: target.user.createdTimestamp,
                ...(target.joinedTimestamp
                  ? { joinedAt: target.joinedTimestamp }
                  : {}),
              },
              now,
            ),
          );
          return;
        }
        if (key === 'leaderboard')
          return await say(
            i,
            leaderboardText(
              c,
              lvLeaderboard(db, i.guildId, {
                page: i.options.getInteger('page') ?? 1,
                size: LV_PAGE,
              }),
            ),
          );
        // /xp: staff only.
        if (!lvIsStaff(c, rolesOf(i.member), isManager(i.member)))
          return await say(i, 'Only staff can change XP.');
        const sub = i.options.getSubcommand(true);
        const target = i.options.getMember('member');
        const by = { id: i.user.id, name: i.member.displayName };
        if (sub === 'reset') {
          const everyone = i.options.getBoolean('everyone') ?? false;
          if (!target && !everyone)
            return await say(
              i,
              'Pick a member, or set everyone to True to reset everyone’s XP.',
            );
          const touched = lvReset(db, i.guildId, target?.id ?? null, by, now);
          await say(
            i,
            target
              ? `Reset <@${target.id}>’s XP to 0.`
              : 'Reset everyone’s XP to 0.',
          );
          for (const u of touched) await rewards(i.guildId, u).catch(() => {});
          return;
        }
        if (!target) return await say(i, 'Pick a member who’s in the server.');
        if (target.user.bot) return await say(i, 'Bots don’t earn XP.');
        const amount = i.options.getInteger('amount', true);
        const mode = sub as LvChange;
        if (amount < (mode === 'set' ? 0 : 1) || amount > LV_MAX_CHANGE)
          return await say(
            i,
            `Write a number of XP up to ${n(LV_MAX_CHANGE)}.`,
          );
        const done = lvChangeXp(
          db,
          i.guildId,
          personOf(target),
          mode,
          amount,
          by,
          now,
        );
        await say(
          i,
          changeText(mode, amount, `<@${target.id}>`, {
            xp: done.after,
            level: done.to,
          }),
        );
        if (done.from !== done.to)
          await rewards(i.guildId, target.id).catch(() => {});
      } catch (e) {
        console.error(`/${i.commandName} failed`, e);
        await say(i, 'Something went wrong. Try again in a moment.').catch(
          () => {},
        );
      }
    })();
    return true;
  }

  /** Whether a button is a crate's. */
  const isCrate = (id: string) => id === LV_CRATE_ID;

  return {
    handlers,
    message,
    startSweep,
    crate,
    isCrate,
    command,
  };
}
