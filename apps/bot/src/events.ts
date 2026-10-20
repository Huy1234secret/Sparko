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
  evAnswerNames,
  evBlank,
  evCancel,
  evCancelled,
  evCommandFor,
  evConfigOf,
  evCreate,
  evEdited,
  evGuilds,
  evIsManager,
  evLink,
  evOpen,
  evPost,
  evRemind,
  evRemoveLeftovers,
  evRespond,
  evSweep,
  evTestPost,
  evWhenText,
  evWhere,
  getEvent,
  goingIds,
  goingList,
  listEvents,
  listRsvps,
  parseEnd,
  parseEvId,
  parseWhen,
  Plain,
  zoneOffset,
  type Db,
  type EvAnswerResult,
  type EvChoice,
  type EvEvent,
  type EvKind,
  type EvLeftovers,
  type EvPlace,
  type Events,
  type Job,
  type Rest,
} from '@sparko/core';
import { Explained } from './jobs.ts';
import { registerGuildCommands } from './guild-commands.ts';

const EPHEMERAL = MessageFlags.Ephemeral;
/** Discord's channel types for voice and stage channels. */
const VOICE = 2;
const STAGE = 13;

const rolesOf = (m: GuildMember | null) =>
  new Set(m ? [...m.roles.cache.keys()] : []);
const isManager = (m: GuildMember | null) =>
  !!m?.permissions.has(PermissionFlagsBits.ManageGuild);
const personOf = (m: GuildMember) => ({
  id: m.id,
  name: m.displayName,
  avatar: m.displayAvatarURL({ extension: 'png', size: 128 }),
});

// The form --------------------------------------------------------------------

/** The form /event create opens. */
export function createForm(c: Events) {
  const box = (
    id: string,
    label: string,
    placeholder: string,
    more: object = {},
  ) => ({
    type: 1,
    components: [
      {
        type: 4,
        custom_id: id,
        style: 1,
        label,
        placeholder,
        required: false,
        ...more,
      },
    ],
  });
  return {
    custom_id: 'ev:new',
    title: 'Schedule an event',
    components: [
      box('title', 'Title', 'Movie night', {
        required: true,
        min_length: 1,
        max_length: 100,
      }),
      box(
        'description',
        'Description',
        'What’s happening, and anything to bring',
        {
          style: 2,
          max_length: 1000,
        },
      ),
      box(
        'start',
        `Starts (${c.timeZone.replace(/_/g, ' ')} time)`.slice(0, 45),
        'Like 2026-10-20 19:00, 20 Oct 7pm or tomorrow 18:00',
        { required: true, max_length: 60 },
      ),
      box(
        'length',
        'How long, or when it ends',
        'Like 2h, 90m or 21:00 (1 hour if empty)',
        {
          max_length: 60,
        },
      ),
      box('location', 'Where', 'A voice channel’s name, a place or a link', {
        max_length: 100,
      }),
    ],
  };
}

/**
 * A voice or stage channel named in the Where box (as its name or a
 * mention), or the text as written.
 */
export function placeFrom(
  typed: string,
  channels: { id: string; name: string; type: number }[],
): { place: EvPlace | null; location: string } {
  const t = typed.trim();
  const id = t.match(/^<#(\d{1,25})>$/)?.[1];
  const name = t.replace(/^#/, '').toLowerCase();
  const found = channels.find(
    (c) =>
      (c.type === VOICE || c.type === STAGE) &&
      (c.id === id || c.name.toLowerCase() === name),
  );
  return found
    ? {
        place: { id: found.id, name: found.name, stage: found.type === STAGE },
        location: '',
      }
    : { place: null, location: t };
}

// What the commands say -------------------------------------------------------

/** One line for an event in a list. */
const line = (e: EvEvent) =>
  `**#${e.number} ${e.title}** · <t:${Math.floor(e.start / 1000)}:F>${
    e.status === 'started' ? ' · happening now' : ''
  } · ${e.counts.going}${e.capacity ? `/${e.capacity}` : ''} going`;

/** The upcoming events, one line each, within Discord's 2,000. */
export function listText(c: Events, events: EvEvent[]) {
  if (!events.length)
    return `There are no upcoming events. Staff can make one with /${c.commands.group.name} ${c.commands.create.name}.`;
  const lines = ['📅 **Upcoming events**'];
  for (const [i, e] of events.entries()) {
    const next = line(e);
    if (lines.join('\n').length + next.length > 1900) {
      lines.push(`…and ${events.length - i} more.`);
      break;
    }
    lines.push(next);
  }
  return lines.join('\n');
}

/** What /event info says about an event. */
export function infoText(
  c: Events,
  e: EvEvent,
  going: string[],
  guildId: string,
) {
  const unix = (ms: number) => Math.floor(ms / 1000);
  const link = evLink(guildId, e);
  return [
    `📅 **#${e.number} ${e.title}**${e.status === 'cancelled' ? ' (cancelled)' : e.status === 'ended' ? ' (ended)' : ''}`,
    e.description ? e.description.slice(0, 600) : '',
    `**When:** <t:${unix(e.start)}:F> to <t:${unix(e.end)}:t> (<t:${unix(e.start)}:R>)`,
    `**Where:** ${evWhere(e)}`,
    `**Host:** ${e.hostId !== '0' ? `<@${e.hostId}>` : e.hostName}`,
    `**Going:** ${e.counts.going}${e.capacity ? ` of ${e.capacity}` : ''}${e.counts.waitlist ? ` (${e.counts.waitlist} waiting)` : ''} · **Maybe:** ${e.counts.maybe}`,
    going.length ? goingList(going, c.listSize) : '',
    link,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
}

/** What a member is told after answering. */
export function answerText(r: Extract<EvAnswerResult, { ok: true }>) {
  const title = `**${r.event.title}**`;
  if (r.answer === null)
    return `Took back your ${evAnswerNames[r.was!]} answer to ${title}.`;
  if (r.answer === 'waitlist')
    return `${title} is full, so you’re #${r.position} on the waitlist. Sparko DMs you if a spot opens. Press Going again to leave it.`;
  if (r.answer === 'going')
    return `You’re going to ${title}! 🎉 Sparko reminds you before it starts.`;
  if (r.answer === 'maybe') return `Marked you as Maybe for ${title}.`;
  return `Marked you as can’t go for ${title}.`;
}

type Said =
  | ChatInputCommandInteraction<'cached'>
  | ButtonInteraction<'cached'>
  | ModalSubmitInteraction<'cached'>;
const say = (i: Said, content: string) =>
  i.deferred || i.replied
    ? i.editReply({ content, allowedMentions: { parse: [] } })
    : i.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });

/**
 * Events in the bot: the server's /event command and its form, the RSVP
 * buttons, the dashboard's jobs, and the sweep that reminds, starts and
 * ends events.
 */
export function eventsBot(
  db: Db,
  rest: Rest,
  { appId }: { appId: () => string | undefined },
) {
  // Editing the message on every answer would hit Discord's limits, so a
  // burst of answers becomes one edit.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const refreshSoon = (guildId: string, number: number) => {
    const key = `${guildId}:${number}`;
    if (pending.has(key)) return;
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        evPost(rest, db, guildId, number).catch((e: unknown) =>
          console.error(`Refreshing event #${number} failed`, e),
        );
      }, 1500),
    );
  };

  async function registerCommands(guildId: string) {
    const app = appId();
    if (!app) return;
    await registerGuildCommands(rest, db, app, guildId);
  }

  /** After a save: registers the commands, then checks what Sparko needs. */
  async function apply(guild: Guild | undefined) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const { on, config } = evConfigOf(db, guild.id);
    await registerCommands(guild.id).catch(() => {
      throw new Explained(
        'Sparko couldn’t add the event commands. Re-invite it with the applications.commands permission.',
      );
    });
    if (!on) return;
    const me = guild.members.me;
    const channel = guild.channels.cache.get(config.channel);
    if (!channel)
      throw new Explained(
        'The events channel no longer exists. Pick another one.',
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
        `Sparko can’t post in #${channel.name}. Give it View Channel, Send Messages and Embed Links there.`,
      );
    if (config.sync && !me?.permissions.has(PermissionFlagsBits.ManageEvents))
      throw new Explained(
        'Sparko needs the Manage Events permission to add events to Discord’s own list.',
      );
    if (!config.attending) return;
    const role = guild.roles.cache.get(config.attendingRole);
    if (!role)
      throw new Explained('The attending role no longer exists. Pick another.');
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles))
      throw new Explained(
        'Sparko needs Manage Roles to give the attending role.',
      );
    if (role.position >= me.roles.highest.position)
      throw new Explained(
        `Sparko can’t give @${role.name}. Move Sparko’s role above it in Server Settings → Roles.`,
      );
  }

  /** The job handlers for saves and the dashboard's changes to events. */
  const handlers = (guildOf: (id: string) => Guild | undefined) => ({
    events: (job: Job) => apply(guildOf(job.guildId)),
    'events-post': async (job: Job) => {
      const { number } = job.payload as { number: number };
      await evPost(rest, db, job.guildId, number);
    },
    'events-edit': (job: Job) => {
      const p = job.payload as { number: number; promoted: string[] };
      return evEdited(rest, db, job.guildId, p.number, p.promoted);
    },
    'events-cancel': async (job: Job) => {
      const p = job.payload as { number: number; going: string[] };
      const going = listRsvps(db, job.guildId, p.number).filter((r) =>
        p.going.includes(r.userId),
      );
      await evCancelled(rest, db, job.guildId, p.number, going);
    },
    'events-delete': (job: Job) =>
      evRemoveLeftovers(rest, job.payload as EvLeftovers),
    'events-test': (job: Job) => {
      const p = job.payload as {
        channel: string;
        kind: EvKind;
        userId: string;
        userName: string;
        avatar?: string;
      };
      return evTestPost(rest, db, job.guildId, p.channel, p.kind, {
        id: p.userId,
        name: p.userName,
        avatar: p.avatar ?? '',
      });
    },
  });

  /** The event a command names, if it's in this server. */
  const named = (i: ChatInputCommandInteraction<'cached'>) => {
    const number = i.options.getInteger('id', true);
    return { number, event: getEvent(db, i.guildId, number) };
  };

  /** Handles /event; false when it's not one of this server's. */
  function command(i: ChatInputCommandInteraction<'cached'>) {
    const { on, config: c } = evConfigOf(db, i.guildId);
    const key = on
      ? evCommandFor(c, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!key) return false;
    void (async () => {
      try {
        const manager = evIsManager(c, rolesOf(i.member), isManager(i.member));
        const staffOnly =
          key === 'create' || key === 'cancel' || key === 'remind';
        if (staffOnly && !manager)
          return await say(i, 'Only staff who manage events can do this.');
        if (key === 'create') return await i.showModal(createForm(c));
        if (key === 'list')
          return await say(i, listText(c, listEvents(db, i.guildId)));
        const { number, event } = named(i);
        if (!event) return await say(i, `There’s no event #${number}.`);
        if (key === 'info')
          return await say(
            i,
            infoText(c, event, goingIds(db, i.guildId, number), i.guildId),
          );
        if (key === 'rsvp') {
          const choice = i.options.getString('choice', true) as EvChoice;
          const r = await evRespond(rest, db, {
            guildId: i.guildId,
            number,
            user: personOf(i.member),
            choice,
            roles: rolesOf(i.member),
          });
          if (!r.ok) return await say(i, r.problem);
          refreshSoon(i.guildId, number);
          return await say(i, answerText(r));
        }
        await i.deferReply({ flags: EPHEMERAL });
        if (key === 'cancel') {
          const r = await evCancel(
            rest,
            db,
            i.guildId,
            number,
            personOf(i.member),
          );
          if (!r.ok) return await say(i, r.problem);
          return await say(
            i,
            `Cancelled **#${number} ${event.title}**.${r.going.length ? ` ${r.told} of ${r.going.length} going got a DM.` : ''}`,
          );
        }
        if (!evOpen(event))
          return await say(
            i,
            `Event #${number} is over, so there’s nobody to remind.`,
          );
        if (!c.dms.reminder)
          return await say(
            i,
            'Reminder DMs are off in this server’s settings, so nothing was sent.',
          );
        const sent = await evRemind(
          rest,
          db,
          i.guildId,
          number,
          '',
          Date.now(),
          personOf(i.member),
        );
        return await say(
          i,
          sent.of
            ? `Reminded ${sent.sent} of ${sent.of} ${sent.of === 1 ? 'member' : 'members'} about **${event.title}**.${sent.sent < sent.of ? ' The others don’t take DMs from the server.' : ''}`
            : 'Nobody has said they’re going yet, so nothing was sent.',
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

  /** Suggests events by number or title as people type. */
  function autocomplete(i: AutocompleteInteraction<'cached'>) {
    const { on, config: c } = evConfigOf(db, i.guildId);
    const key = on
      ? evCommandFor(c, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!key || key === 'create' || key === 'list') return false;
    const typed = String(i.options.getFocused())
      .trim()
      .toLowerCase()
      .replace(/^#/, '');
    const list = [
      ...listEvents(db, i.guildId),
      ...(key === 'info'
        ? listEvents(db, i.guildId, { when: 'past', limit: 25 })
        : []),
    ];
    void i
      .respond(
        list
          .filter(
            (e) =>
              !typed ||
              String(e.number).startsWith(typed) ||
              e.title.toLowerCase().includes(typed),
          )
          .slice(0, 25)
          .map((e) => ({
            name: `#${e.number} ${e.title} · ${evWhenText(e.start, e.end, e.timeZone)}`.slice(
              0,
              100,
            ),
            value: e.number,
          })),
      )
      .catch(() => {});
    return true;
  }

  /** The /event create form was sent. */
  async function modal(i: ModalSubmitInteraction<'cached'>) {
    if (i.customId !== 'ev:new') return false;
    await i.deferReply({ flags: EPHEMERAL });
    try {
      const { on, config: c } = evConfigOf(db, i.guildId);
      if (!on) return await say(i, 'Events are off in this server.');
      if (!evIsManager(c, rolesOf(i.member), isManager(i.member)))
        return await say(i, 'Only staff who manage events can do this.');
      const now = Date.now();
      const text = (id: string) => {
        try {
          return i.fields.getTextInputValue(id);
        } catch {
          return '';
        }
      };
      const zone = `${c.timeZone.replace(/_/g, ' ')}, ${zoneOffset(c.timeZone, now)}`;
      const start = parseWhen(text('start'), c.timeZone, now);
      if (start === null)
        return await say(
          i,
          `Sparko couldn’t read when it starts: “${text('start')}”. Write a day and a time, like 2026-10-20 19:00, 20 Oct 7pm or tomorrow 18:00 (${zone}).`,
        );
      const end = parseEnd(text('length'), start, c.timeZone);
      if (end === null)
        return await say(
          i,
          `Sparko couldn’t read how long it lasts: “${text('length')}”. Write a length like 2h or 90m, or when it ends, like 21:00.`,
        );
      const where = placeFrom(text('location'), [
        ...i.guild.channels.cache.values(),
      ]);
      const r = evCreate(
        db,
        i.guildId,
        {
          ...evBlank(c, now),
          title: text('title').trim(),
          description: text('description').trim(),
          start,
          end,
          ...where,
        },
        personOf(i.member),
        now,
      );
      if (!r.ok) return await say(i, r.problem);
      const posted = await evPost(rest, db, i.guildId, r.event.number, now);
      return await say(
        i,
        `Scheduled **#${r.event.number} ${r.event.title}** for <t:${Math.floor(start / 1000)}:F>. ${posted ? evLink(i.guildId, posted) : ''}\nChange the details, capacity, reminders or repeats in the dashboard.`.trim(),
      );
    } catch (e) {
      if (!(e instanceof Plain)) console.error('The event form failed', e);
      await say(
        i,
        e instanceof Plain ? e.message : 'Something went wrong. Try again.',
      ).catch(() => {});
    }
    return true;
  }

  /** An RSVP button was pressed. */
  async function component(i: ButtonInteraction<'cached'>) {
    const id = parseEvId(i.customId);
    if (!id) return false;
    try {
      await i.deferReply({ flags: EPHEMERAL });
      const r = await evRespond(rest, db, {
        guildId: i.guildId,
        number: id.number,
        user: personOf(i.member),
        choice: id.choice,
        roles: rolesOf(i.member),
      });
      if (!r.ok) return await say(i, r.problem);
      refreshSoon(i.guildId, id.number);
      await say(i, answerText(r));
    } catch (e) {
      console.error('An RSVP button failed', e);
      await say(i, 'Something went wrong. Try again.').catch(() => {});
    }
    return true;
  }

  /** Every minute: posting, reminders, starts, ends, repeats and roles. */
  function startSweep(inGuild: (id: string) => boolean) {
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      void (async () => {
        for (const id of evGuilds(db))
          if (inGuild(id))
            await evSweep(rest, db, id).catch((e: unknown) =>
              console.error(`Events in ${id} failed`, e),
            );
      })().finally(() => {
        running = false;
      });
    }, 60_000).unref();
  }

  return {
    handlers,
    command,
    autocomplete,
    modal,
    component,
    startSweep,
  };
}
