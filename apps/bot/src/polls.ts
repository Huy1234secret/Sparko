import {
  MessageFlags,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import {
  findPolls,
  getPoll,
  parseOptionLines,
  Plain,
  pollByMessage,
  pollCanCreate,
  pollCommandFor,
  pollConfigOf,
  pollCreate,
  pollEnd,
  pollGuilds,
  pollIsStaff,
  pollLengths,
  pollOptionsText,
  pollPost,
  pollRefresh,
  pollRemoveMessage,
  pollRulesFrom,
  pollShowsResults,
  pollSweep,
  pollTestPost,
  pollVote,
  pollVoteReply,
  pollVoters,
  pollWinnerText,
  type Db,
  type Job,
  type Poll,
  type PollEnd,
  type PollLeftovers,
  type PollVoter,
  type Polls,
  type Rest,
} from '@sparko/core';
import { Explained } from './jobs.ts';
import { registerGuildCommands } from './guild-commands.ts';

const EPHEMERAL = MessageFlags.Ephemeral;
/** How long a burst of votes waits before the message is edited once. */
export const REFRESH_MS = 1500;

// Forms -----------------------------------------------------------------------

/** The form /poll create opens: the question, the options and how long. */
export function createForm(c: Polls) {
  const length = c.defaults.duration;
  return {
    custom_id: 'pl:new',
    title: 'Make a poll',
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: 'question',
            style: 1,
            label: 'Question',
            placeholder: 'What should we play on Friday?',
            min_length: 2,
            max_length: pollLengths.question,
            required: true,
          },
        ],
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: 'options',
            style: 2,
            label: 'Options, one per line',
            placeholder: '⛏️ Minecraft\n🚀 Among Us\n📦 Jackbox',
            min_length: 3,
            max_length: 2500,
            required: true,
          },
        ],
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: 'duration',
            style: 1,
            label: 'How long it runs',
            placeholder: length
              ? `Like 30mi, 12h or 3d. Empty for ${length}, or “never”`
              : 'Like 30mi, 12h or 3d. Empty for no end',
            max_length: 20,
            required: false,
          },
        ],
      },
    ],
  };
}

/** How a poll from the form ends: what was typed, or the server's default. */
export function endFrom(typed: string, c: Polls): PollEnd {
  const t = typed.trim().toLowerCase();
  if (!t)
    return c.defaults.duration
      ? { kind: 'after', duration: c.defaults.duration }
      : { kind: 'none' };
  if (['never', 'none', 'no end', 'no', '0', 'off'].includes(t))
    return { kind: 'none' };
  return { kind: 'after', duration: t };
}

/** What a poll button, menu or form's id says. */
export function parsePollId(id: string) {
  if (id === 'pl:new') return { kind: 'new' as const };
  if (id === 'pl:m') return { kind: 'menu' as const };
  const m = id.match(/^pl:v:([\w-]{1,40})$/);
  return m ? { kind: 'vote' as const, option: m[1]! } : null;
}

/** A poll's results, said privately. */
export function resultsText(p: Poll, staff: boolean) {
  const head = `**Poll #${p.id}: ${p.question}**`;
  const total = `${p.voters} ${p.voters === 1 ? 'member has' : 'members have'} voted`;
  if (!pollShowsResults(p) && !staff)
    return `${head}\nResults show when the poll ends. ${total} so far.`;
  const lines = [
    head,
    pollOptionsText({ ...p, rules: { ...p.rules, hideResults: false } }),
  ];
  lines.push(
    p.status === 'ended'
      ? `${total}. **Winner:** ${pollWinnerText(p)}`
      : `${total} so far.${!pollShowsResults(p) ? ' Members can’t see these until it ends.' : ''}`,
  );
  return lines.join('\n').slice(0, 2000);
}

/** Who voted for each option, said privately, without pinging anyone. */
export function votersText(p: Poll, voters: PollVoter[]) {
  if (p.rules.anonymous)
    return `Poll #${p.id} is anonymous, so nobody can see who voted.`;
  if (!voters.length) return `Nobody has voted on poll #${p.id} yet.`;
  const out = [`**Poll #${p.id}: ${p.question}**`];
  for (const o of p.options) {
    const who = voters.filter((v) => v.picks.includes(o.id));
    const name = o.emoji ? `${o.emoji} ${o.label}` : o.label;
    out.push(
      `**${name}** (${who.length}): ${who.length ? who.map((v) => `<@${v.userId}>`).join(', ') : 'nobody'}`,
    );
  }
  const text = out.join('\n');
  if (text.length <= 2000) return text;
  return `${text.slice(0, 1940).replace(/[,\s][^,\s]*$/, '')}\n…and more. Export the votes from the dashboard to see them all.`;
}

// Who's asking ----------------------------------------------------------------

const rolesOf = (m: GuildMember | null) =>
  new Set(m ? [...m.roles.cache.keys()] : []);
const isManager = (m: GuildMember | null) =>
  !!m?.permissions.has(PermissionFlagsBits.ManageGuild);
const authorOf = (m: GuildMember) => ({
  id: m.id,
  name: m.displayName,
  avatar: m.displayAvatarURL({ extension: 'png', size: 128 }),
});

type Answerable =
  | ChatInputCommandInteraction<'cached'>
  | ButtonInteraction<'cached'>
  | StringSelectMenuInteraction<'cached'>
  | ModalSubmitInteraction<'cached'>;
const say = (i: Answerable, content: string) =>
  i.deferred || i.replied
    ? i.editReply({ content, allowedMentions: { parse: [] } })
    : i.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });

const link = (
  guildId: string,
  p: { channelId: string; messageId: string | null },
) =>
  p.messageId
    ? `https://discord.com/channels/${guildId}/${p.channelId}/${p.messageId}`
    : `<#${p.channelId}>`;

/**
 * Polls in the bot: the server's /poll command and its form, votes by
 * button or menu with the message edited as they come in, and the minute
 * sweep that posts scheduled polls and ends finished ones.
 */
export function pollsBot(
  db: Db,
  rest: Rest,
  { appId }: { appId: () => string | undefined },
) {
  // Editing the message on every vote would hit Discord's limits, so a
  // burst of votes becomes one edit.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const refreshSoon = (guildId: string, id: number) => {
    const key = `${guildId}:${id}`;
    if (pending.has(key)) return;
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        pollRefresh(rest, db, guildId, id).catch((e: unknown) =>
          console.error(`Refreshing poll #${id} failed`, e),
        );
      }, REFRESH_MS),
    );
  };
  /** Shows the results now, dropping any edit still waiting. */
  const refreshNow = async (guildId: string, id: number) => {
    const key = `${guildId}:${id}`;
    clearTimeout(pending.get(key));
    pending.delete(key);
    await pollRefresh(rest, db, guildId, id);
  };
  // What /poll create was given waits here while the form is filled in.
  const drafts = new Map<
    string,
    {
      anonymous: boolean | null;
      multiple: boolean | null;
      channel: string | null;
      at: number;
    }
  >();

  async function registerCommands(guildId: string) {
    const app = appId();
    if (!app) return;
    await registerGuildCommands(rest, db, app, guildId);
  }

  /** After a save: registers the commands, then checks the polls channel. */
  async function apply(guild: Guild | undefined) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const { on, config } = pollConfigOf(db, guild.id);
    await registerCommands(guild.id).catch(() => {
      throw new Explained(
        'Sparko couldn’t add its poll command. Re-invite it with the applications.commands permission.',
      );
    });
    if (!on) return;
    const channel = guild.channels.cache.get(config.channel);
    if (!channel)
      throw new Explained(
        'The polls channel no longer exists. Pick another one.',
      );
    const me = guild.members.me;
    const can = me && channel.permissionsFor(me);
    if (
      !can?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ])
    )
      throw new Explained(
        `Sparko can’t post in the polls channel (#${channel.name}). Give it View Channel, Send Messages and Embed Links there.`,
      );
  }

  /** The job handlers for saves, polls from the dashboard and tests. */
  const handlers = (guildOf: (id: string) => Guild | undefined) => ({
    polls: (job: Job) => apply(guildOf(job.guildId)),
    'polls-post': async (job: Job) => {
      await pollPost(rest, db, job.guildId, (job.payload as { id: number }).id);
    },
    'polls-refresh': async (job: Job) => {
      await refreshNow(job.guildId, (job.payload as { id: number }).id);
    },
    'polls-delete': (job: Job) =>
      pollRemoveMessage(rest, job.payload as PollLeftovers),
    'polls-test': (job: Job) => {
      const p = job.payload as {
        channel: string;
        kind: 'poll' | 'results';
        userId: string;
        userName: string;
        avatar?: string;
      };
      return pollTestPost(rest, db, job.guildId, p.channel, p.kind, {
        id: p.userId,
        name: p.userName,
        avatar: p.avatar ?? '',
      });
    },
  });

  /** On start: every server's poll command. */
  async function registerAll(inGuild: (id: string) => boolean) {
    for (const id of pollGuilds(db))
      if (inGuild(id))
        await registerCommands(id).catch((e: unknown) =>
          console.error(`Poll commands in ${id} failed`, e),
        );
  }

  // Slash commands --------------------------------------------------------------

  /** A poll by the id typed, or a reply saying it doesn't exist. */
  const pollFor = (i: ChatInputCommandInteraction<'cached'>) => {
    const id = i.options.getInteger('id', true);
    return { id, poll: getPoll(db, i.guildId, id) };
  };

  /** Handles a /poll subcommand; false when it's not one. */
  function command(i: ChatInputCommandInteraction<'cached'>) {
    const { on, config } = pollConfigOf(db, i.guildId);
    const key = on
      ? pollCommandFor(config, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!key) return false;
    void (async () => {
      try {
        const staff = pollIsStaff(
          config,
          rolesOf(i.member),
          isManager(i.member),
        );
        if (key === 'create') {
          const why = pollCanCreate(
            config,
            rolesOf(i.member),
            isManager(i.member),
          );
          if (why) return await say(i, why);
          const channel = i.options.getChannel('channel')?.id ?? null;
          // Members who aren't staff only post where they could write anyway.
          if (
            channel &&
            !staff &&
            !i.guild.channels.cache
              .get(channel)
              ?.permissionsFor(i.member)
              ?.has(PermissionFlagsBits.SendMessages)
          )
            return await say(i, `You can’t post in <#${channel}>.`);
          drafts.set(`${i.guildId}:${i.user.id}`, {
            anonymous: i.options.getBoolean('anonymous'),
            multiple: i.options.getBoolean('multiple'),
            channel,
            at: Date.now(),
          });
          return await i.showModal(createForm(config));
        }
        const { id, poll } = pollFor(i);
        if (!poll) return await say(i, `There’s no poll #${id}.`);
        if (key === 'results') return await say(i, resultsText(poll, staff));
        if (key === 'voters')
          return await say(i, votersText(poll, pollVoters(db, i.guildId, id)));
        // Ending: staff, or whoever made it.
        if (!staff && poll.authorId !== i.user.id)
          return await say(
            i,
            'Only staff or whoever made this poll can end it.',
          );
        await i.deferReply({ flags: EPHEMERAL });
        const ended = await pollEnd(
          rest,
          db,
          i.guildId,
          id,
          'staff',
          authorOf(i.member),
        );
        return await say(
          i,
          `Ended poll #${id}. ${ended.voters ? `**Winner:** ${pollWinnerText(ended)}` : 'Nobody voted.'} ${link(i.guildId, ended)}`,
        );
      } catch (e) {
        if (!(e instanceof Plain)) console.error(`/${i.commandName} failed`, e);
        await say(
          i,
          e instanceof Plain
            ? e.message
            : 'Something went wrong. Try again in a moment.',
        ).catch(() => {});
      }
    })();
    return true;
  }

  /** Suggests polls by number or question as people type the id. */
  function autocomplete(i: AutocompleteInteraction<'cached'>) {
    const { on, config } = pollConfigOf(db, i.guildId);
    const key = on
      ? pollCommandFor(config, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!key || key === 'create') return false;
    const typed = String(i.options.getFocused());
    void i
      .respond(
        findPolls(
          db,
          i.guildId,
          typed,
          key === 'end' ? ['active'] : ['active', 'ended'],
        ).map((p) => ({
          name: `#${p.id} ${p.question}${p.status === 'ended' ? ' (ended)' : ''}`.slice(
            0,
            100,
          ),
          value: p.id,
        })),
      )
      .catch(() => {});
    return true;
  }

  // The form --------------------------------------------------------------------

  /** Waits for a reply, then says the interaction was handled. */
  const answered = async (reply: Promise<unknown>) => {
    await reply;
    return true;
  };

  async function modal(i: ModalSubmitInteraction<'cached'>) {
    if (parsePollId(i.customId)?.kind !== 'new') return false;
    await i.deferReply({ flags: EPHEMERAL });
    try {
      const { config } = pollConfigOf(db, i.guildId);
      const why = pollCanCreate(config, rolesOf(i.member), isManager(i.member));
      if (why) return await answered(say(i, why));
      const key = `${i.guildId}:${i.user.id}`;
      const kept = drafts.get(key);
      drafts.delete(key);
      const fresh = kept && Date.now() - kept.at < 30 * 60_000 ? kept : null;
      const rules = pollRulesFrom(config);
      if (fresh?.anonymous !== null && fresh?.anonymous !== undefined)
        rules.anonymous = fresh.anonymous;
      if (fresh?.multiple !== null && fresh?.multiple !== undefined)
        rules.multiple = fresh.multiple;
      const field = (id: string) => {
        try {
          return i.fields.getTextInputValue(id);
        } catch {
          return '';
        }
      };
      const made = pollCreate(db, {
        guildId: i.guildId,
        author: authorOf(i.member),
        draft: {
          question: field('question'),
          options: parseOptionLines(field('options')),
          channel: fresh?.channel ?? config.channel,
          rules,
          end: endFrom(field('duration'), config),
          postAt: null,
        },
      });
      if (!made.ok) return await answered(say(i, made.problem));
      const posted = await pollPost(rest, db, i.guildId, made.poll.id);
      return await answered(
        say(
          i,
          `Posted poll #${made.poll.id}: ${posted ? link(i.guildId, posted) : `<#${made.poll.channelId}>`}`,
        ),
      );
    } catch (e) {
      if (!(e instanceof Plain)) console.error('The poll form failed', e);
      await say(
        i,
        e instanceof Plain ? e.message : 'Something went wrong. Try again.',
      ).catch(() => {});
    }
    return true;
  }

  // Buttons and the menu --------------------------------------------------------

  /** A vote by button or menu, answered privately. */
  async function component(
    i: ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>,
  ) {
    const id = parsePollId(i.customId);
    if (!id || id.kind === 'new') return false;
    try {
      const p = pollByMessage(db, i.message.id);
      if (!p || p.guildId !== i.guildId)
        return await answered(say(i, 'This poll is gone.'));
      const r = pollVote(
        db,
        i.guildId,
        p.id,
        {
          id: i.user.id,
          name: i.member.displayName,
          roles: [...rolesOf(i.member)],
        },
        id.kind === 'vote'
          ? { option: id.option }
          : { options: i.isStringSelectMenu() ? i.values : [] },
      );
      if (!r.ok) return await answered(say(i, r.problem));
      await say(
        i,
        r.ended
          ? `${pollVoteReply(p, r.picks, r.was).replace(/ (Press|Pick) .*$/, '')} That was the last vote it needed, so the poll has ended.`
          : pollVoteReply(p, r.picks, r.was),
      );
      if (r.ended) await refreshNow(i.guildId, p.id);
      else if (r.picks.join() !== r.was.join()) refreshSoon(i.guildId, p.id);
    } catch (e) {
      if (!(e instanceof Plain)) console.error('A poll vote failed', e);
      await say(
        i,
        e instanceof Plain ? e.message : 'Something went wrong. Try again.',
      ).catch(() => {});
    }
    return true;
  }

  /** Every minute: posts polls whose time has come and ends finished ones. */
  async function sweep(inGuild: (id: string) => boolean, now = Date.now()) {
    for (const id of pollGuilds(db))
      if (inGuild(id))
        await pollSweep(rest, db, id, now).catch((e: unknown) =>
          console.error(`Polls in ${id} failed`, e),
        );
    // Forgotten forms.
    for (const [k, v] of drafts) if (now - v.at > 30 * 60_000) drafts.delete(k);
  }
  function startSweep(inGuild: (id: string) => boolean) {
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      void sweep(inGuild).finally(() => {
        running = false;
      });
    }, 60_000).unref();
  }

  return {
    handlers,
    registerAll,
    command,
    autocomplete,
    modal,
    component,
    sweep,
    startSweep,
  };
}
