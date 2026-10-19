import {
  MessageFlags,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
} from 'discord.js';
import {
  getQuestion,
  Plain,
  qaAnswer,
  qaAnswerMax,
  qaAskerFacts,
  qaCanAsk,
  qaClose,
  qaCommandFor,
  qaConfigOf,
  qaDelete,
  qaFindCategory,
  qaGuilds,
  qaIsStaff,
  qaMarkAnswered,
  qaMeToo,
  qaMessageDeleted,
  qaRefresh,
  qaRemoveMessages,
  qaReopen,
  qaSearch,
  qaSubmit,
  qaSweep,
  qaTestPost,
  questionByMessage,
  type Db,
  type Job,
  type QaCommandKey,
  type QaFile,
  type QaLeftovers,
  type QaStatus,
  type Questions,
  type Rest,
} from '@sparko/core';
import { Explained } from './jobs.ts';
import { registerGuildCommands } from './guild-commands.ts';

const EPHEMERAL = MessageFlags.Ephemeral;

// Forms -----------------------------------------------------------------------

/** The form /question ask opens: a title and the details. */
export function askForm(c: Questions) {
  return {
    custom_id: 'qa:new',
    title: 'Ask a question',
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: 'title',
            style: 1,
            label: 'Title',
            placeholder: 'Your question, in a few words',
            min_length: 3,
            max_length: 100,
            required: true,
          },
        ],
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: 'details',
            style: 2,
            label: c.requireDetails ? 'Details' : 'Details (optional)',
            placeholder:
              'What have you tried? Anything that helps staff answer.',
            ...(c.minLength ? { min_length: c.minLength } : {}),
            max_length: c.maxLength,
            // A minimum only counts once something is written.
            required: c.requireDetails,
          },
        ],
      },
    ],
  };
}

/** The form staff write an answer in; it starts with the earlier answer. */
export const answerForm = (number: number, title: string, earlier = '') => ({
  custom_id: `qa:answer:${number}`,
  title: `Answer #${number}: ${title}`.slice(0, 45),
  components: [
    {
      type: 1,
      components: [
        {
          type: 4,
          custom_id: 'answer',
          style: 2,
          label: 'Your answer',
          placeholder: 'Posted in the thread and shown on the question.',
          min_length: 2,
          max_length: qaAnswerMax,
          required: true,
          ...(earlier ? { value: earlier } : {}),
        },
      ],
    },
  ],
});

/** What a question button or form's id says. */
export function parseQaId(id: string) {
  if (id === 'qa:new') return { kind: 'new' as const };
  if (id === 'qa:answer') return { kind: 'answer' as const };
  if (id === 'qa:done') return { kind: 'done' as const };
  if (id === 'qa:metoo') return { kind: 'metoo' as const };
  const m = id.match(/^qa:answer:(\d{1,9})$/);
  return m ? { kind: 'answered' as const, number: Number(m[1]) } : null;
}

/** Pictures, videos and other files a member attached to /question ask. */
export function filesOf(
  list: { name: string; url: string; contentType: string | null }[],
): QaFile[] {
  return list.slice(0, 3).map((a) => ({
    name: a.name,
    url: a.url,
    kind: a.contentType?.startsWith('image/')
      ? 'image'
      : a.contentType?.startsWith('video/')
        ? 'video'
        : 'file',
  }));
}

/** The questions each command's id autocompletes. */
const searchable: Record<Exclude<QaCommandKey, 'ask'>, QaStatus[]> = {
  answer: ['open', 'answered', 'closed', 'expired'],
  close: ['open', 'answered'],
  reopen: ['answered', 'closed', 'expired'],
  delete: ['open', 'answered', 'closed', 'expired', 'deleted'],
};

// Who's asking ----------------------------------------------------------------

const rolesOf = (m: GuildMember | null) =>
  new Set(m ? [...m.roles.cache.keys()] : []);
const isManager = (m: GuildMember | null) =>
  !!m?.permissions.has(PermissionFlagsBits.ManageGuild);
const personOf = (m: GuildMember) => ({
  id: m.id,
  name: m.displayName,
  avatar: m.displayAvatarURL({ extension: 'png', size: 128 }),
});

const say = (
  i:
    | ChatInputCommandInteraction<'cached'>
    | ButtonInteraction<'cached'>
    | ModalSubmitInteraction<'cached'>,
  content: string,
) =>
  i.deferred || i.replied
    ? i.editReply({ content, allowedMentions: { parse: [] } })
    : i.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });

const notStaff = 'Only staff who answer questions can do this.';

/**
 * Questions & answers in the bot: the server's /question command, the
 * forms it opens, the Answer, Mark answered and Me too buttons, deleted
 * messages, and the minute sweep that closes threads on time.
 */
export function questionsBot(
  db: Db,
  rest: Rest,
  { appId }: { appId: () => string | undefined },
) {
  // A burst of Me toos becomes one edit, to stay inside Discord's limits.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const refreshSoon = (guildId: string, number: number) => {
    const key = `${guildId}:${number}`;
    if (pending.has(key)) return;
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        qaRefresh(rest, db, guildId, number).catch((e: unknown) =>
          console.error(`Refreshing question #${number} failed`, e),
        );
      }, 1500),
    );
  };
  // The files and category from /question ask wait here while the member
  // fills in the form.
  const asking = new Map<
    string,
    { files: QaFile[]; category: string; at: number }
  >();

  /** Every command the server's modules use, as Discord replaces them all. */
  async function registerCommands(guildId: string) {
    const app = appId();
    if (!app) return;
    await registerGuildCommands(rest, db, app, guildId);
  }

  /** After a save: registers the commands, then checks the channel. */
  async function apply(guild: Guild | undefined) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const { on, config } = qaConfigOf(db, guild.id);
    await registerCommands(guild.id).catch(() => {
      throw new Explained(
        'Sparko couldn’t add its question commands. Re-invite it with the applications.commands permission.',
      );
    });
    if (!on) return;
    const me = guild.members.me;
    const channel = guild.channels.cache.get(config.channel);
    if (!channel)
      throw new Explained(
        'The questions channel no longer exists. Pick another one.',
      );
    const can = me && channel.permissionsFor(me);
    const need = [
      [PermissionFlagsBits.ViewChannel, 'View Channel'],
      [PermissionFlagsBits.SendMessages, 'Send Messages'],
      [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
      [PermissionFlagsBits.CreatePublicThreads, 'Create Public Threads'],
      [PermissionFlagsBits.SendMessagesInThreads, 'Send Messages in Threads'],
      [PermissionFlagsBits.ManageThreads, 'Manage Threads'],
    ] as const;
    const missing = need.filter(([flag]) => !can?.has(flag)).map(([, n]) => n);
    if (missing.length)
      throw new Explained(
        `Sparko can’t run questions in #${channel.name}. Give it ${missing.join(', ')} there.`,
      );
    const ping = config.ping && guild.roles.cache.get(config.ping);
    if (
      ping &&
      !ping.mentionable &&
      !can?.has(PermissionFlagsBits.MentionEveryone)
    )
      throw new Explained(
        `Sparko can’t ping @${ping.name}. Make the role mentionable, or give Sparko Mention @everyone in #${channel.name}.`,
      );
  }

  /** The job handlers for saves, test messages and deletes. */
  const handlers = (guildOf: (id: string) => Guild | undefined) => ({
    questions: (job: Job) => apply(guildOf(job.guildId)),
    'questions-test': (job: Job) => {
      const p = job.payload as {
        channel: string;
        which?: 'question' | 'answer';
        userId: string;
        userName: string;
        avatar?: string;
      };
      return qaTestPost(
        rest,
        db,
        job.guildId,
        p.channel,
        { id: p.userId, name: p.userName, avatar: p.avatar ?? '' },
        p.which ?? 'question',
      );
    },
    'questions-delete': (job: Job) =>
      qaRemoveMessages(rest, job.payload as QaLeftovers),
  });

  /** On start: every server's commands, for servers with questions on. */
  async function registerAll(inGuild: (id: string) => boolean) {
    for (const id of qaGuilds(db))
      if (inGuild(id))
        await registerCommands(id).catch((e: unknown) =>
          console.error(`Question commands in ${id} failed`, e),
        );
  }

  // Slash commands --------------------------------------------------------------

  /** Handles a question command; false when it's not one. */
  function command(i: ChatInputCommandInteraction<'cached'>) {
    const { on, config } = qaConfigOf(db, i.guildId);
    const key = on
      ? qaCommandFor(config, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!key) return false;
    void (async () => {
      try {
        if (key === 'ask') {
          const why = qaCanAsk(
            config,
            {
              roles: rolesOf(i.member),
              ...qaAskerFacts(db, i.guildId, i.user.id),
            },
            Date.now(),
          );
          if (why) return await say(i, why);
          const typed = i.options.getString('category') ?? '';
          const category = qaFindCategory(config, typed);
          if (typed && !category)
            return await say(
              i,
              `There’s no “${typed}” category. Pick one of: ${config.categories.map((x) => x.name).join(', ')}.`,
            );
          const attached = ['file', 'file2', 'file3']
            .map((n) => i.options.getAttachment(n))
            .filter((a) => !!a);
          asking.set(`${i.guildId}:${i.user.id}`, {
            files: filesOf(attached),
            category: category?.id ?? '',
            at: Date.now(),
          });
          return await i.showModal(askForm(config));
        }
        if (!qaIsStaff(config, rolesOf(i.member), isManager(i.member)))
          return await say(i, notStaff);
        const number = i.options.getInteger('id', true);
        const q = getQuestion(db, i.guildId, number);
        if (!q) return await say(i, `There’s no question #${number}.`);
        await i.deferReply({ flags: EPHEMERAL });
        const by = personOf(i.member);
        if (key === 'answer') {
          const { again, problems } = await qaAnswer(rest, db, {
            guildId: i.guildId,
            number,
            text: i.options.getString('text', true),
            staff: by,
          });
          return await say(
            i,
            `${again ? 'Changed the answer to' : 'Answered'} question #${number}.${problems.length ? ` Note: ${problems.join('; ')}.` : ''}`,
          );
        }
        if (key === 'close') {
          await qaClose(rest, db, i.guildId, number, by);
          return await say(i, `Closed question #${number} and its thread.`);
        }
        if (key === 'reopen') {
          await qaReopen(rest, db, i.guildId, number, by);
          return await say(
            i,
            `Reopened question #${number}. It can be answered again.`,
          );
        }
        await qaDelete(rest, db, i.guildId, number, by);
        return await say(i, `Deleted question #${number}.`);
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

  /** Suggests categories and questions as people type. */
  function autocomplete(i: AutocompleteInteraction<'cached'>) {
    const { on, config } = qaConfigOf(db, i.guildId);
    const key = on
      ? qaCommandFor(config, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!key) return false;
    const focused = i.options.getFocused(true);
    const typed = String(focused.value).toLowerCase();
    const choices =
      key === 'ask'
        ? config.categories
            .filter((x) => x.name.toLowerCase().includes(typed))
            .map((x) => ({
              name: `${x.emoji && !x.emoji.startsWith('<') ? `${x.emoji} ` : ''}${x.name}`,
              value: x.name,
            }))
        : qaSearch(db, i.guildId, typed, searchable[key]).map((q) => ({
            name: `#${q.number} ${q.title}`.slice(0, 100),
            value: q.number,
          }));
    void i.respond(choices.slice(0, 25)).catch(() => {});
    return true;
  }

  // Forms -----------------------------------------------------------------------

  async function modal(i: ModalSubmitInteraction<'cached'>) {
    const id = parseQaId(i.customId);
    if (!id || (id.kind !== 'new' && id.kind !== 'answered')) return false;
    await i.deferReply({ flags: EPHEMERAL });
    try {
      const { config } = qaConfigOf(db, i.guildId);
      if (id.kind === 'new') {
        const key = `${i.guildId}:${i.user.id}`;
        const kept = asking.get(key);
        asking.delete(key);
        const fresh = kept && Date.now() - kept.at < 30 * 60_000;
        let details = '';
        try {
          details = i.fields.getTextInputValue('details');
        } catch {
          // Left empty.
        }
        const done = await qaSubmit(rest, db, {
          guildId: i.guildId,
          asker: { ...personOf(i.member), roles: [...rolesOf(i.member)] },
          title: i.fields.getTextInputValue('title'),
          body: details,
          category: fresh ? kept.category : '',
          files: fresh ? kept.files : [],
        });
        if (!done.ok) return await say(i, done.problem);
        return await say(
          i,
          `Posted your question #${done.number}: ${done.link}${done.threadId ? `\nStaff answer in <#${done.threadId}>.` : ''}${config.dm ? ' Sparko DMs you when it’s answered.' : ''}`,
        );
      }
      if (!qaIsStaff(config, rolesOf(i.member), isManager(i.member)))
        return await say(i, notStaff);
      const { again, problems } = await qaAnswer(rest, db, {
        guildId: i.guildId,
        number: id.number,
        text: i.fields.getTextInputValue('answer'),
        staff: personOf(i.member),
      });
      return await say(
        i,
        `${again ? 'Changed the answer to' : 'Answered'} question #${id.number}.${problems.length ? ` Note: ${problems.join('; ')}.` : ''}`,
      );
    } catch (e) {
      if (!(e instanceof Plain)) console.error('A question form failed', e);
      await say(
        i,
        e instanceof Plain ? e.message : 'Something went wrong. Try again.',
      ).catch(() => {});
    }
    return true;
  }

  // Buttons ---------------------------------------------------------------------

  async function component(i: ButtonInteraction<'cached'>) {
    const id = parseQaId(i.customId);
    if (!id || id.kind === 'new' || id.kind === 'answered') return false;
    try {
      const q = questionByMessage(db, i.message.id);
      const { on, config } = qaConfigOf(db, i.guildId);
      if (!on || !q || q.guildId !== i.guildId)
        return await say(i, 'This question is gone.');
      const staff = qaIsStaff(config, rolesOf(i.member), isManager(i.member));
      if (id.kind === 'answer') {
        if (!staff) return await say(i, notStaff);
        return await i.showModal(
          answerForm(q.number, q.title, q.answer?.text ?? ''),
        );
      }
      if (id.kind === 'done') {
        if (!staff && i.user.id !== q.askerId)
          return await say(
            i,
            'Only the member who asked, or staff, can mark it answered.',
          );
        await i.deferReply({ flags: EPHEMERAL });
        await qaMarkAnswered(rest, db, i.guildId, q.number, personOf(i.member));
        return await say(
          i,
          `Marked question #${q.number} as answered.${config.after === 'never' ? '' : ' Its thread closes as staff set.'}`,
        );
      }
      const r = qaMeToo(db, i.guildId, q.number, i.user.id);
      if (!r.ok) return await say(i, r.problem);
      refreshSoon(i.guildId, q.number);
      return await say(
        i,
        r.on
          ? `Added you. ${r.count === 1 ? '1 member has' : `${r.count} members have`} this question too. Press it again to take it back.`
          : 'Took you off this question.',
      );
    } catch (e) {
      if (!(e instanceof Plain)) console.error('A question button failed', e);
      await say(
        i,
        e instanceof Plain ? e.message : 'Something went wrong. Try again.',
      ).catch(() => {});
    }
    return true;
  }

  /** A message was deleted; a question's message marks it deleted. */
  async function deleted(messageId: string) {
    await qaMessageDeleted(rest, db, messageId);
  }

  /** Every minute: closes threads on time and expires old questions. */
  function startSweep(inGuild: (id: string) => boolean) {
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      void (async () => {
        for (const id of qaGuilds(db))
          if (inGuild(id))
            await qaSweep(rest, db, id).catch((e: unknown) =>
              console.error(`Questions in ${id} failed`, e),
            );
        // Forgotten forms' files.
        for (const [k, v] of asking)
          if (Date.now() - v.at > 30 * 60_000) asking.delete(k);
      })().finally(() => {
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
    deleted,
    startSweep,
  };
}
