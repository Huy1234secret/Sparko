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
  actionsFor,
  emojiKey,
  findPost,
  getSuggestion,
  parseStudioCustomId,
  runStudioActions,
  Plain,
  reactionPath,
  sgAccept,
  sgAllowed,
  sgAutoStatus,
  sgCanSuggest,
  sgCommandBodies,
  sgCommandFor,
  sgConfigOf,
  sgDelete,
  sgFindStatus,
  sgGuilds,
  sgMessage,
  sgMessageDeleted,
  sgRefresh,
  sgRemoveMessages,
  sgSetStatus,
  sgStatusName,
  sgSubmit,
  sgSweep,
  sgTestPost,
  sgVote,
  sgVoteOf,
  suggestionByMessage,
  type Db,
  type Job,
  type Rest,
  type SgFile,
  type SgLeftovers,
  type StudioAction,
  type Suggestions,
} from '@sparko/core';
import { studioInfo } from './studio-info.ts';
import { Explained } from './jobs.ts';

const EPHEMERAL = MessageFlags.Ephemeral;
/** Discord's longest text box in a form. */
const BOX = 4000;

// Forms -----------------------------------------------------------------------

/** The form /suggest opens: a title, then as many boxes as the text needs. */
export function suggestForm(c: Suggestions) {
  const boxes = Math.min(3, Math.ceil(c.maxLength / BOX));
  return {
    custom_id: 'sg:new',
    title: 'Make a suggestion',
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: 'title',
            style: 1,
            label: 'Title',
            placeholder: 'A short name for your idea',
            min_length: 3,
            max_length: 100,
            required: true,
          },
        ],
      },
      ...Array.from({ length: boxes }, (_, i) => ({
        type: 1,
        components: [
          {
            type: 4,
            custom_id: `body${i}`,
            style: 2,
            label: i === 0 ? 'Your suggestion' : 'More of your suggestion',
            placeholder:
              i === 0
                ? 'What should change, and why?'
                : 'Carries on from the box above (optional)',
            ...(i === 0 && c.minLength
              ? { min_length: Math.min(c.minLength, BOX) }
              : {}),
            max_length: Math.min(BOX, c.maxLength - i * BOX),
            required: i === 0,
          },
        ],
      })),
    ],
  };
}

/** The form staff fill in before a status is set: the reason is required. */
export const reasonForm = (
  customId: string,
  number: number,
  status: string,
) => ({
  custom_id: customId,
  title: `#${number}: ${status}`.slice(0, 45),
  components: [
    {
      type: 1,
      components: [
        {
          type: 4,
          custom_id: 'reason',
          style: 2,
          label: 'Reason or comment',
          placeholder: 'Members see this under the suggestion.',
          min_length: 2,
          max_length: 1000,
          required: true,
        },
      ],
    },
  ],
});

/** What a suggestion button, menu or form's id says. */
export function parseSgId(id: string) {
  if (id === 'sg:up') return { kind: 'vote' as const, vote: 1 as const };
  if (id === 'sg:down') return { kind: 'vote' as const, vote: -1 as const };
  if (id === 'sg:vote') return { kind: 'menu' as const };
  if (id === 'sg:new') return { kind: 'new' as const };
  const m = id.match(
    /^sg:(accept|reject|status):(\d{1,9})(?::([\w-]{1,40}))?$/,
  );
  if (!m) return null;
  return {
    kind: m[1] as 'accept' | 'reject' | 'status',
    number: Number(m[2]),
    status: m[3] ?? '',
  };
}

/** Pictures, videos and other files a member attached to /suggest. */
export function filesOf(
  list: { name: string; url: string; contentType: string | null }[],
): SgFile[] {
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

// Who's asking ----------------------------------------------------------------

const rolesOf = (m: GuildMember | null) =>
  new Set(m ? [...m.roles.cache.keys()] : []);
const isManager = (m: GuildMember | null) =>
  !!m?.permissions.has(PermissionFlagsBits.ManageGuild);
const staffOf = (m: GuildMember) => ({
  id: m.id,
  name: m.displayName,
  avatar: m.displayAvatarURL({ extension: 'png', size: 128 }),
});

const say = (
  i:
    | ChatInputCommandInteraction<'cached'>
    | ButtonInteraction<'cached'>
    | StringSelectMenuInteraction<'cached'>
    | ModalSubmitInteraction<'cached'>,
  content: string,
) =>
  i.deferred || i.replied
    ? i.editReply({ content, allowedMentions: { parse: [] } })
    : i.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });

/**
 * Suggestions in the bot: the server's own slash commands, the forms they
 * open, votes by button, menu or reaction, and the review buttons.
 */
export function suggestionsBot(
  db: Db,
  rest: Rest,
  { appId }: { appId: () => string | undefined },
) {
  // Editing a message on every vote would hit Discord's limits, so a burst
  // of votes becomes one edit.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const refreshSoon = (guildId: string, number: number) => {
    const key = `${guildId}:${number}`;
    if (pending.has(key)) return;
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        sgRefresh(rest, db, guildId, number).catch((e: unknown) =>
          console.error(`Refreshing suggestion #${number} failed`, e),
        );
      }, 1500),
    );
  };
  // Files from /suggest wait here while the member fills in the form.
  const files = new Map<string, { files: SgFile[]; at: number }>();
  // Reactions Sparko takes off itself, so their removal isn't a vote.
  const removing = new Set<string>();

  async function registerCommands(guildId: string) {
    const app = appId();
    if (!app) return;
    const { on, config } = sgConfigOf(db, guildId);
    await rest.put(
      `/applications/${app}/guilds/${guildId}/commands`,
      on ? sgCommandBodies(config) : [],
    );
  }

  /** After a save: checks the channels, then registers the commands. */
  async function apply(guild: Guild | undefined) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const { on, config } = sgConfigOf(db, guild.id);
    await registerCommands(guild.id).catch(() => {
      throw new Explained(
        'Sparko couldn’t add its suggestion commands. Re-invite it with the applications.commands permission.',
      );
    });
    if (!on) return;
    const me = guild.members.me;
    for (const [id, what] of [
      [config.channel, 'the suggestions channel'],
      [config.review, 'the review channel'],
    ] as const) {
      if (!id) continue;
      const channel = guild.channels.cache.get(id);
      if (!channel)
        throw new Explained(`${what} no longer exists. Pick another one.`);
      const can = me && channel.permissionsFor(me);
      if (
        !can?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ])
      )
        throw new Explained(
          `Sparko can’t post in ${what} (#${channel.name}). Give it View Channel, Send Messages and Embed Links there.`,
        );
      if (
        id === config.channel &&
        config.vote.kind === 'reaction' &&
        !can.has(PermissionFlagsBits.AddReactions)
      )
        throw new Explained(
          `Sparko can’t add reactions in #${channel.name}. Give it Add Reactions there, or vote with buttons.`,
        );
      if (
        id === config.channel &&
        config.threads &&
        !can.has(PermissionFlagsBits.CreatePublicThreads)
      )
        throw new Explained(
          `Sparko can’t open threads in #${channel.name}. Give it Create Public Threads there, or turn auto-threads off.`,
        );
    }
  }

  /** The job handlers for saves, test messages and deletes. */
  const handlers = (guildOf: (id: string) => Guild | undefined) => ({
    suggestions: (job: Job) => apply(guildOf(job.guildId)),
    'suggestions-test': (job: Job) => {
      const p = job.payload as {
        channel: string;
        userId: string;
        userName: string;
        avatar?: string;
      };
      return sgTestPost(rest, db, job.guildId, p.channel, {
        id: p.userId,
        name: p.userName,
        avatar: p.avatar ?? '',
      });
    },
    'suggestions-delete': (job: Job) =>
      sgRemoveMessages(rest, job.payload as SgLeftovers),
  });

  /** On start: every server's suggestion commands. */
  async function registerAll(inGuild: (id: string) => boolean) {
    for (const id of sgGuilds(db))
      if (inGuild(id))
        await registerCommands(id).catch((e: unknown) =>
          console.error(`Suggestion commands in ${id} failed`, e),
        );
  }

  // Slash commands --------------------------------------------------------------

  /** Handles a suggestion command; false when it's not one. */
  function command(i: ChatInputCommandInteraction<'cached'>) {
    const { on, config } = sgConfigOf(db, i.guildId);
    const key = on ? sgCommandFor(config, i.commandName) : undefined;
    if (!key) return false;
    void (async () => {
      try {
        if (key === 'suggest') {
          const why = sgCanSuggest(
            config,
            {
              roles: rolesOf(i.member),
              created: i.user.createdTimestamp,
              pending: 0,
              lastAt: null,
            },
            Date.now(),
          );
          // Pending and cooldown are checked when the form is sent.
          if (why && !/again|waiting/.test(why)) return say(i, why);
          const attached = ['file', 'file2', 'file3']
            .map((n) => i.options.getAttachment(n))
            .filter((a) => !!a);
          files.set(`${i.guildId}:${i.user.id}`, {
            files: filesOf(attached),
            at: Date.now(),
          });
          return i.showModal(suggestForm(config));
        }
        const number = i.options.getInteger('id', true);
        const s = getSuggestion(db, i.guildId, number);
        if (!s) return say(i, `There’s no suggestion #${number}.`);
        const manager = isManager(i.member);
        if (key === 'delete') {
          if (!sgAllowed(config.deleters, rolesOf(i.member), manager))
            return say(i, 'You can’t delete suggestions here.');
          await i.deferReply({ flags: EPHEMERAL });
          await sgDelete(rest, db, i.guildId, number, staffOf(i.member));
          return say(i, `Deleted suggestion #${number}.`);
        }
        if (!sgAllowed(config.approvers, rolesOf(i.member), manager))
          return say(i, 'You can’t set the status of suggestions here.');
        const status =
          key === 'approve'
            ? sgFindStatus(config, 'approved')
            : key === 'deny'
              ? sgFindStatus(config, 'denied')
              : sgFindStatus(config, i.options.getString('status', true));
        if (!status)
          return say(
            i,
            `That status doesn’t exist. Pick one of: ${config.statuses.map((x) => x.name).join(', ')}.`,
          );
        return i.showModal(
          reasonForm(`sg:status:${number}:${status.id}`, number, status.name),
        );
      } catch (e) {
        console.error(`/${i.commandName} failed`, e);
        await say(i, 'Something went wrong. Try again in a moment.').catch(
          () => {},
        );
      }
    })();
    return true;
  }

  /** Suggests statuses as staff type them. */
  function autocomplete(i: AutocompleteInteraction<'cached'>) {
    const { on, config } = sgConfigOf(db, i.guildId);
    if (!on || sgCommandFor(config, i.commandName) !== 'status') return false;
    const typed = String(i.options.getFocused()).toLowerCase();
    void i
      .respond(
        config.statuses
          .filter((s) => s.name.toLowerCase().includes(typed))
          .slice(0, 25)
          .map((s) => ({ name: s.name, value: s.id })),
      )
      .catch(() => {});
    return true;
  }

  // Forms -----------------------------------------------------------------------

  async function modal(i: ModalSubmitInteraction<'cached'>) {
    const id = parseSgId(i.customId);
    if (!id) return false;
    await i.deferReply({ flags: EPHEMERAL });
    try {
      if (id.kind === 'new') {
        const { config } = sgConfigOf(db, i.guildId);
        const key = `${i.guildId}:${i.user.id}`;
        const kept = files.get(key);
        files.delete(key);
        const body = Array.from({ length: 3 }, (_, n) => {
          try {
            return i.fields.getTextInputValue(`body${n}`);
          } catch {
            return '';
          }
        })
          .filter(Boolean)
          .join('\n');
        const done = await sgSubmit(rest, db, {
          guildId: i.guildId,
          author: {
            ...staffOf(i.member),
            roles: [...rolesOf(i.member)],
          },
          created: i.user.createdTimestamp,
          title: i.fields.getTextInputValue('title'),
          body,
          files: kept && Date.now() - kept.at < 30 * 60_000 ? kept.files : [],
        });
        if (!done.ok) return say(i, done.problem);
        return say(
          i,
          done.review
            ? `Thanks! Staff will check suggestion #${done.number} before it’s posted.`
            : `Posted your suggestion #${done.number}: ${done.link}${config.threads ? '\nThere’s a thread on it for discussion.' : ''}`,
        );
      }
      if (id.kind === 'status' || id.kind === 'reject') {
        const { config } = sgConfigOf(db, i.guildId);
        if (
          !sgAllowed(config.approvers, rolesOf(i.member), isManager(i.member))
        )
          return say(i, 'You can’t set the status of suggestions here.');
        const statusId = id.kind === 'reject' ? 'denied' : id.status;
        const { status, problems } = await sgSetStatus(rest, db, {
          guildId: i.guildId,
          number: id.number,
          status: statusId,
          reason: i.fields.getTextInputValue('reason'),
          staff: staffOf(i.member),
        });
        return say(
          i,
          `Suggestion #${id.number} is now **${status.name}**.${problems.length ? ` Note: ${problems.join('; ')}.` : ''}`,
        );
      }
      return false;
    } catch (e) {
      if (!(e instanceof Plain)) console.error('A suggestion form failed', e);
      await say(
        i,
        e instanceof Plain ? e.message : 'Something went wrong. Try again.',
      ).catch(() => {});
    }
    return true;
  }

  // Buttons and the menu --------------------------------------------------------

  /** Counts a vote, then runs what else that vote does. */
  async function vote(
    i: ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>,
    value: 1 | -1,
    then?: StudioAction[],
  ) {
    const s = suggestionByMessage(db, i.message.id);
    if (!s) return say(i, 'This suggestion is gone.');
    const r = sgVote(db, i.guildId, s.number, i.user, value);
    if (!r.ok) return say(i, r.problem);
    if (r.auto)
      void sgAutoStatus(rest, db, i.guildId, s.number, r.auto).catch(
        (e: unknown) => console.error('Auto status failed', e),
      );
    else refreshSoon(i.guildId, s.number);
    const { config } = sgConfigOf(db, i.guildId);
    const name = (v: number) =>
      v === 1
        ? config.vote.up.label || 'upvote'
        : config.vote.down.label || 'downvote';
    await say(
      i,
      r.vote === 0
        ? 'Took your vote back.'
        : r.was
          ? `Changed your vote to ${name(r.vote)}.`
          : `Voted ${name(r.vote)}.${config.changeVotes ? ' Press it again to take it back.' : ''}`,
    );
    // Taking a vote back doesn't run its actions.
    const more =
      then ?? (value === 1 ? config.vote.up : config.vote.down).actions;
    if (r.vote === value && more.length)
      await runStudioActions(rest, db, studioInfo(i), more, Date.now(), true);
  }

  async function component(
    i: ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>,
  ) {
    const id = parseSgId(i.customId);
    if (!id || id.kind === 'new') return false;
    try {
      if (id.kind === 'vote') {
        await vote(i, id.vote);
        return true;
      }
      if (id.kind === 'menu' && i.isStringSelectMenu()) {
        await vote(i, i.values[0] === 'down' ? -1 : 1);
        return true;
      }
      if (id.kind === 'accept' || id.kind === 'reject') {
        const { config } = sgConfigOf(db, i.guildId);
        if (
          !sgAllowed(config.approvers, rolesOf(i.member), isManager(i.member))
        )
          return await say(
            i,
            'Only staff who can approve suggestions can do this.',
          );
        if (id.kind === 'reject')
          return await i.showModal(
            reasonForm(`sg:reject:${id.number}`, id.number, 'Reject'),
          );
        await i.deferReply({ flags: EPHEMERAL });
        const posted = await sgAccept(
          rest,
          db,
          i.guildId,
          id.number,
          staffOf(i.member),
        );
        return await say(
          i,
          `Posted suggestion #${id.number}: https://discord.com/channels/${i.guildId}/${posted.channelId}/${posted.messageId}`,
        );
      }
    } catch (e) {
      if (!(e instanceof Plain)) console.error('A suggestion button failed', e);
      await say(
        i,
        e instanceof Plain ? e.message : 'Something went wrong. Try again.',
      ).catch(() => {});
    }
    return true;
  }

  /**
   * A suggestion action on one of the template's own buttons or menus.
   * Returns false when the click isn't one, so Message Studio answers it.
   */
  async function studioAction(
    i: ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>,
  ) {
    const parsed = parseStudioCustomId(i.customId);
    const s = parsed && suggestionByMessage(db, i.message.id);
    if (!parsed || !s || s.messageId !== i.message.id) return false;
    const { config } = sgConfigOf(db, i.guildId);
    const post = findPost(db, i.message.id);
    const message =
      post?.guildId === i.guildId
        ? post.message
        : sgMessage(db, i.guildId, config);
    const c = message.components.find(
      (x) => x.id === parsed.id && x.type === parsed.kind,
    );
    const action = c
      ? actionsFor(c, i.isStringSelectMenu() ? i.values : []).find(
          (a) => a.type === 'suggestion',
        )
      : undefined;
    if (action?.type !== 'suggestion') return false;
    try {
      if (action.act === 'upvote' || action.act === 'downvote')
        await vote(
          i,
          action.act === 'upvote' ? 1 : -1,
          actionsFor(c!, i.isStringSelectMenu() ? i.values : []).filter(
            (a) => a !== action,
          ),
        );
      else if (
        !sgAllowed(config.approvers, rolesOf(i.member), isManager(i.member))
      )
        await say(i, 'Only staff who can approve suggestions can do this.');
      else {
        const status = sgFindStatus(
          config,
          action.act === 'approve' ? 'approved' : 'denied',
        );
        if (!status) await say(i, 'That status doesn’t exist any more.');
        else
          await i.showModal(
            reasonForm(
              `sg:status:${s.number}:${status.id}`,
              s.number,
              status.name,
            ),
          );
      }
    } catch (e) {
      if (!(e instanceof Plain)) console.error('A suggestion action failed', e);
      await say(
        i,
        e instanceof Plain ? e.message : 'Something went wrong. Try again.',
      ).catch(() => {});
    }
    return true;
  }

  // Reactions -------------------------------------------------------------------

  /** Someone reacted on a suggestion, or took a reaction off. */
  async function reaction(
    r: { messageId: string; channelId: string; emoji: string },
    userId: string,
    added: boolean,
  ) {
    const key = `${r.messageId}:${userId}:${emojiKey(r.emoji)}`;
    if (!added && removing.delete(key)) return;
    const s = suggestionByMessage(db, r.messageId);
    if (!s || s.messageId !== r.messageId) return;
    const { config } = sgConfigOf(db, s.guildId);
    if (config.vote.kind !== 'reaction') return;
    const up = emojiKey(config.vote.up.emoji);
    const down = emojiKey(config.vote.down.emoji);
    const e = emojiKey(r.emoji);
    if (e !== up && e !== down) return;
    const value = e === up ? 1 : -1;
    const takeOff = (emoji: string) => {
      removing.add(`${r.messageId}:${userId}:${emojiKey(emoji)}`);
      return rest
        .delete(
          `/channels/${r.channelId}/messages/${r.messageId}/reactions/${reactionPath(emoji)}/${userId}`,
        )
        .catch(() =>
          removing.delete(`${r.messageId}:${userId}:${emojiKey(emoji)}`),
        );
    };
    if (added) {
      const was = sgVoteOf(db, s.guildId, s.number, userId);
      const result = sgVote(db, s.guildId, s.number, { id: userId }, value);
      // A refused vote doesn't stay on the message.
      if (!result.ok) return void (await takeOff(r.emoji));
      if (was && was !== value)
        await takeOff(
          was === 1 ? config.vote.up.emoji : config.vote.down.emoji,
        );
      if (result.auto)
        await sgAutoStatus(rest, db, s.guildId, s.number, result.auto);
      else refreshSoon(s.guildId, s.number);
      return;
    }
    if (sgVoteOf(db, s.guildId, s.number, userId) !== value) return;
    const result = sgVote(db, s.guildId, s.number, { id: userId }, 0);
    if (result.ok) refreshSoon(s.guildId, s.number);
  }

  // Deleted messages ------------------------------------------------------------

  /**
   * A message was deleted. If it was a suggestion, Discord's audit log says
   * who did it; only someone allowed to delete suggestions makes it stay
   * deleted.
   */
  async function deleted(guild: Guild, channelId: string, messageId: string) {
    const s = suggestionByMessage(db, messageId);
    if (!s || s.messageId !== messageId) return;
    const { config } = sgConfigOf(db, guild.id);
    let by: { id: string; name: string; allowed: boolean } | null = null;
    try {
      const logs = await guild.fetchAuditLogs({ type: 72, limit: 5 });
      const me = guild.members.me?.id;
      const entry = logs.entries.find(
        (x) =>
          x.targetId === me &&
          (x.extra as { channel?: { id: string } } | null)?.channel?.id ===
            channelId &&
          Date.now() - x.createdTimestamp < 5 * 60_000,
      );
      if (entry?.executorId) {
        const member = await guild.members
          .fetch(entry.executorId)
          .catch(() => null);
        by = {
          id: entry.executorId,
          name: member?.displayName ?? entry.executor?.username ?? 'someone',
          allowed: sgAllowed(
            config.deleters,
            rolesOf(member),
            isManager(member),
          ),
        };
      }
    } catch {
      // Without View Audit Log Sparko can't tell, so it posts it again.
    }
    await sgMessageDeleted(rest, db, messageId, by);
  }

  /** Every minute: closes voting on suggestions past their time. */
  function startSweep(inGuild: (id: string) => boolean) {
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      void (async () => {
        for (const id of sgGuilds(db))
          if (inGuild(id))
            await sgSweep(rest, db, id).catch((e: unknown) =>
              console.error(`Suggestions in ${id} failed`, e),
            );
        // Forgotten forms' files.
        for (const [k, v] of files)
          if (Date.now() - v.at > 30 * 60_000) files.delete(k);
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
    studioAction,
    reaction,
    deleted,
    startSweep,
    statusName: (guildId: string, number: number) => {
      const s = getSuggestion(db, guildId, number);
      return s ? sgStatusName(sgConfigOf(db, guildId).config, s) : null;
    },
  };
}
