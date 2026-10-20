import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Invite,
  type PartialGuildMember,
} from 'discord.js';
import {
  invApplyRewards,
  invBonus,
  invCodeAdded,
  invCodeRemoved,
  invCommandFor,
  invConfigOf,
  invCountsOf,
  invGuilds,
  invIsStaff,
  invJoined,
  invLeaderboard,
  invLeft,
  invMax,
  invRefresh,
  invReset,
  invRewardTargets,
  invStaffCommands,
  invTestPost,
  INV_PAGE,
  invitedBy,
  invitedList,
  type Db,
  type InvCode,
  type InvJoin,
  type InvKind,
  type InvRow,
  type Invites,
  type Job,
  type Rest,
} from '@sparko/core';
import { Explained } from './jobs.ts';
import { registerGuildCommands } from './guild-commands.ts';

const EPHEMERAL = MessageFlags.Ephemeral;

const rolesOf = (m: GuildMember | null) =>
  new Set(m ? [...m.roles.cache.keys()] : []);
const isManager = (m: GuildMember | null) =>
  !!m?.permissions.has(PermissionFlagsBits.ManageGuild);
const ago = (at: number) => `<t:${Math.floor(at / 1000)}:R>`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** An invite from the gateway, as Sparko remembers them. */
export function codeFromInvite(i: Invite): InvCode {
  return {
    code: i.code,
    inviterId: i.inviterId ?? i.inviter?.id ?? null,
    inviterName: i.inviter ? i.inviter.globalName || i.inviter.username : '',
    channelId: i.channelId ?? i.channel?.id ?? '',
    channelName: i.channel && 'name' in i.channel ? (i.channel.name ?? '') : '',
    uses: i.uses ?? 0,
    maxUses: i.maxUses ?? 0,
    expiresAt: i.expiresTimestamp ?? null,
    createdAt: i.createdTimestamp ?? Date.now(),
  };
}

// What the commands say ---------------------------------------------------------

/** "<@1> has **9** invites: 10 regular, 2 left, 1 fake and 2 bonus." */
export function viewText(
  c: Invites,
  n: {
    regular: number;
    left: number;
    fake: number;
    bonus: number;
    total: number;
  },
  who: string,
  self: boolean,
) {
  const parts = [
    plural(n.regular, 'regular', 'regular'),
    `${n.left.toLocaleString('en-US')} left${c.subtractLeaves ? '' : ' (not taken off)'}`,
    `${n.fake.toLocaleString('en-US')} fake${c.subtractFakes ? '' : ' (not taken off)'}`,
    `${n.bonus.toLocaleString('en-US')} bonus`,
  ];
  return `📨 ${self ? 'You have' : `${who} has`} **${n.total.toLocaleString('en-US')}** ${n.total === 1 ? 'invite' : 'invites'}: ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.`;
}

/** A page of the leaderboard. */
export function leaderboardText(
  c: Invites,
  board: { rows: InvRow[]; page: number; pages: number },
) {
  if (!board.rows.length)
    return 'Nobody has invited anyone yet. Invites count from when tracking was turned on.';
  return [
    `🏆 **Top inviters**${board.pages > 1 ? ` · page ${board.page} of ${board.pages}` : ''}`,
    ...board.rows.map(
      (r) =>
        `**${r.rank}.** <@${r.userId}> · **${r.total.toLocaleString('en-US')}** (${plural(r.regular, 'regular', 'regular')}${r.left ? `, ${r.left} left` : ''}${r.fake ? `, ${r.fake} fake` : ''}${r.bonus ? `, ${r.bonus > 0 ? '+' : ''}${r.bonus} bonus` : ''})`,
    ),
    ...(board.page < board.pages
      ? [
          `-# More with /${c.commands.group.name} ${c.commands.leaderboard.name} page:${board.page + 1}`,
        ]
      : []),
  ].join('\n');
}

/** Who invited someone, as /invites who says it. */
export function whoText(j: InvJoin | null, who: string) {
  if (!j)
    return `Sparko hasn’t seen ${who} join since invite tracking was turned on.`;
  const when = ago(j.joinedAt);
  if (j.type === 'vanity')
    return `${who} joined ${when} with the server’s vanity link.`;
  if (j.type === 'unknown' || !j.inviterId)
    return `${who} joined ${when}, but Sparko couldn’t tell which invite they used.`;
  return `${who} was invited by <@${j.inviterId}> with \`${j.code}\` ${when}.${j.leftAt ? ' They’ve left since.' : ''}`;
}

/** The members someone invited, within Discord's 2,000. */
export function listText(list: InvJoin[], who: string, self: boolean) {
  if (!list.length)
    return self
      ? 'You haven’t invited anyone yet.'
      : `${who} hasn’t invited anyone yet.`;
  const lines = [
    `📋 **Members ${self ? 'you' : who} invited** (${list.length.toLocaleString('en-US')}${list.length >= 50 ? '+' : ''})`,
  ];
  for (const [i, j] of list.entries()) {
    const notes = [
      j.leftAt && 'left',
      j.fake && 'fake',
      !j.counted && 'not counted',
    ].filter(Boolean);
    const line = `<@${j.userId}> · ${ago(j.joinedAt)}${notes.length ? ` · ${notes.join(', ')}` : ''}`;
    if (lines.join('\n').length + line.length > 1900) {
      lines.push(`…and ${list.length - i} more.`);
      break;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Invite tracking in the bot: the invite cache, joins and leaves, the
 * server's /invites command, and the jobs saves queue.
 */
export function invitesBot(
  db: Db,
  rest: Rest,
  { appId }: { appId: () => string | undefined },
) {
  let guildOf: (id: string) => Guild | undefined = () => undefined;
  /** What the bot knows about a server's roles, so it asks Discord less. */
  const known = (guildId: string) => {
    const g = guildOf(guildId);
    return {
      roleName: (id: string) => g?.roles.cache.get(id)?.name,
      rolesOf: (id: string) => {
        const m = g?.members.cache.get(id);
        return m ? [...m.roles.cache.keys()] : undefined;
      },
    };
  };
  const rewards = (guildId: string, userId: string) =>
    invApplyRewards(rest, db, guildId, userId, {
      roleName: known(guildId).roleName,
      roles: known(guildId).rolesOf(userId),
    });

  // One join or leave at a time per server, so each read of the invites
  // is compared with the one before it.
  const queues = new Map<string, Promise<unknown>>();
  function inOrder<T>(guildId: string, fn: () => Promise<T>) {
    const next = (queues.get(guildId) ?? Promise.resolve()).then(fn, fn);
    const settled = next.catch(() => {});
    queues.set(guildId, settled);
    void settled.then(() => {
      if (queues.get(guildId) === settled) queues.delete(guildId);
    });
    return next;
  }

  async function registerCommands(guildId: string) {
    const app = appId();
    if (!app) return;
    await registerGuildCommands(rest, db, app, guildId);
  }

  /** After a save: commands, invites, channels and reward roles. */
  async function apply(guild: Guild | undefined) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const { on, config } = invConfigOf(db, guild.id);
    await registerCommands(guild.id).catch(() => {
      throw new Explained(
        'Sparko couldn’t add the invite commands. Re-invite it with the applications.commands permission.',
      );
    });
    if (!on) return;
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuild))
      throw new Explained(
        'Sparko needs the Manage Server permission to see your invites and tell which one each member used. Give its role Manage Server, then check again.',
      );
    await inOrder(guild.id, () => invRefresh(rest, db, guild.id));
    for (const kind of ['join', 'leave'] as const) {
      const m = config[kind];
      if (!m.on) continue;
      const channel = guild.channels.cache.get(m.channel);
      if (!channel)
        throw new Explained(
          `The ${kind} message channel no longer exists. Pick another one.`,
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
    }
    if (!config.rewards.length) return;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
      throw new Explained('Sparko needs Manage Roles to give reward roles.');
    for (const r of config.rewards) {
      const role = guild.roles.cache.get(r.role);
      if (!role)
        throw new Explained(
          `The reward role for ${r.invites} invites no longer exists. Pick another.`,
        );
      if (role.position >= me.roles.highest.position)
        throw new Explained(
          `Sparko can’t give @${role.name}. Move Sparko’s role above it in Server Settings → Roles.`,
        );
    }
    // New or changed tiers apply to everyone who already has invites.
    void (async () => {
      for (const id of invRewardTargets(db, guild.id))
        await rewards(guild.id, id).catch(() => {});
    })();
  }

  /** The job handlers for saves, test messages and reward roles. */
  const handlers = (find: (id: string) => Guild | undefined) => {
    guildOf = find;
    return {
      invites: (job: Job) => apply(find(job.guildId)),
      'invites-test': (job: Job) => {
        const p = job.payload as {
          channel: string;
          kind: InvKind;
          userId: string;
          userName: string;
          avatar?: string;
        };
        return invTestPost(rest, db, job.guildId, p.channel, p.kind, {
          id: p.userId,
          name: p.userName,
          avatar: p.avatar ?? '',
        });
      },
      'invites-rewards': async (job: Job) => {
        const p = job.payload as { userIds?: string[] };
        for (const id of p.userIds ?? [])
          await rewards(job.guildId, id).catch(() => {});
      },
    };
  };

  /** On start: each server's invites, where tracking is on. */
  async function syncAll(inGuild: (id: string) => boolean) {
    for (const id of invGuilds(db)) if (inGuild(id)) await refresh(id);
  }

  /** Reads a server's invites again, if tracking is on there. */
  function refresh(guildId: string) {
    if (!invConfigOf(db, guildId).on) return Promise.resolve(false);
    return inOrder(guildId, () => invRefresh(rest, db, guildId)).catch(
      (e: unknown) => {
        console.error(`Reading invites in ${guildId} failed`, e);
        return false;
      },
    );
  }

  /** Someone made an invite. */
  function created(i: Invite) {
    if (!i.guild || !invConfigOf(db, i.guild.id).on) return;
    const guildId = i.guild.id;
    void inOrder(guildId, async () =>
      invCodeAdded(db, guildId, codeFromInvite(i)),
    );
  }
  /** An invite was deleted, by someone or by being used up. */
  function deleted(i: Invite) {
    if (!i.guild || !invConfigOf(db, i.guild.id).on) return;
    const guildId = i.guild.id;
    void inOrder(guildId, async () => invCodeRemoved(db, guildId, i.code));
  }

  const memberOf = (m: GuildMember | PartialGuildMember) => ({
    id: m.id,
    name: m.displayName ?? m.user.username,
    avatar: m.user.displayAvatarURL({ extension: 'png', size: 256 }),
    createdAt: m.user.createdTimestamp,
    joinedAt: m.joinedTimestamp ?? undefined,
  });
  /** Someone joined: which invite, for whom, and the join message. */
  function joined(m: GuildMember) {
    if (m.user.bot || !invConfigOf(db, m.guild.id).on)
      return Promise.resolve(null);
    return inOrder(m.guild.id, () =>
      invJoined(rest, db, m.guild.id, memberOf(m), known(m.guild.id)),
    );
  }
  /** Someone left: their inviter loses them, and the leave message. */
  function left(m: GuildMember | PartialGuildMember) {
    if (m.user.bot || !invConfigOf(db, m.guild.id).on)
      return Promise.resolve(null);
    return inOrder(m.guild.id, () =>
      invLeft(rest, db, m.guild.id, memberOf(m), known(m.guild.id)),
    );
  }

  const say = (i: ChatInputCommandInteraction<'cached'>, content: string) =>
    i.deferred || i.replied
      ? i.editReply({ content, allowedMentions: { parse: [] } })
      : i.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });

  /** Handles /invites; false when it's not one of this server's. */
  function command(i: ChatInputCommandInteraction<'cached'>) {
    const { on, config: c } = invConfigOf(db, i.guildId);
    const key = on
      ? invCommandFor(c, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!key) return false;
    void (async () => {
      try {
        const now = Date.now();
        const target = i.options.getUser('member');
        const self = !target || target.id === i.user.id;
        const id = target?.id ?? i.user.id;
        const who = `<@${id}>`;
        if (
          invStaffCommands.includes(key) &&
          !invIsStaff(c, rolesOf(i.member), isManager(i.member))
        )
          return await say(i, 'Only staff can change invite counts.');
        if (key === 'view')
          return await say(
            i,
            viewText(c, invCountsOf(db, i.guildId, id), who, self),
          );
        if (key === 'leaderboard')
          return await say(
            i,
            leaderboardText(
              c,
              invLeaderboard(db, i.guildId, {
                page: i.options.getInteger('page') ?? 1,
                size: INV_PAGE,
              }),
            ),
          );
        if (key === 'who')
          return await say(i, whoText(invitedBy(db, i.guildId, id), who));
        if (key === 'list')
          return await say(
            i,
            listText(invitedList(db, i.guildId, id), who, self),
          );
        if (key === 'bonus') {
          const amount = i.options.getInteger('amount', true);
          if (!target) return await say(i, 'Pick the member.');
          if (target.bot) return await say(i, 'Bots don’t invite anyone.');
          if (!amount || Math.abs(amount) > invMax.bonus)
            return await say(
              i,
              `Write a number of invites from -${invMax.bonus.toLocaleString('en-US')} to ${invMax.bonus.toLocaleString('en-US')}, but not 0.`,
            );
          const member = i.guild.members.cache.get(target.id);
          const after = invBonus(
            db,
            i.guildId,
            {
              id: target.id,
              name: member?.displayName ?? target.globalName ?? target.username,
              avatar: target.displayAvatarURL({ extension: 'png', size: 256 }),
            },
            amount,
            { id: i.user.id, name: i.member.displayName },
            now,
          );
          await rewards(i.guildId, target.id).catch(() => {});
          return await say(
            i,
            `${amount > 0 ? 'Gave' : 'Took'} ${who} ${amount > 0 ? '' : 'away '}${plural(Math.abs(amount), 'bonus invite')}. They have **${after.total.toLocaleString('en-US')}** now.`,
          );
        }
        // Reset: one member, or everyone.
        const everyone = i.options.getBoolean('everyone') ?? false;
        if (!target && !everyone)
          return await say(
            i,
            'Pick a member, or set everyone to True to reset everyone’s invites.',
          );
        const touched = invReset(
          db,
          i.guildId,
          target ? target.id : null,
          { id: i.user.id, name: i.member.displayName },
          now,
        );
        await say(
          i,
          target
            ? `Reset ${who}’s invites. Who they invited is kept.`
            : 'Reset everyone’s invites. Who invited whom is kept.',
        );
        for (const u of touched) await rewards(i.guildId, u).catch(() => {});
      } catch (e) {
        console.error(`/${i.commandName} failed`, e);
        await say(i, 'Something went wrong. Try again in a moment.').catch(
          () => {},
        );
      }
    })();
    return true;
  }

  return {
    handlers,
    syncAll,
    refresh,
    created,
    deleted,
    joined,
    left,
    command,
  };
}
