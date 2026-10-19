import {
  MessageFlags,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
} from 'discord.js';
import {
  bdConfigOf,
  bdDateText,
  bdGuilds,
  bdIsStaff,
  bdJoined,
  bdLeft,
  bdMonths,
  bdNext,
  bdRemove,
  bdSet,
  bdSweep,
  bdTakeRole,
  bdTestPost,
  bdUpcoming,
  bdCommandFor,
  getBirthday,
  listBirthdays,
  searchZones,
  sgConfigOf,
  zoneOf,
  zoneOffset,
  zoneOk,
  type BdEntry,
  type BdKind,
  type Birthdays,
  type Db,
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
const personOf = (m: GuildMember) => ({
  id: m.id,
  name: m.displayName,
  avatar: m.displayAvatarURL({ extension: 'png', size: 256 }),
});

/**
 * A time zone as typed: one from the list, a city on its own ("london"),
 * or null when nothing was typed. undefined when it isn't one.
 */
export function zoneFrom(typed: string | null) {
  if (typed === null || !typed.trim()) return null;
  const t = typed.trim();
  const city = t.toLowerCase().replace(/\s+/g, '_');
  if (zoneOk(t)) return bdZoneName(t);
  return (
    searchZones(t, 50).find(
      (z) => z.toLowerCase().split('/').at(-1) === city,
    ) ?? undefined
  );
}
/** "europe/london" → "Europe/London", as the list writes it. */
const bdZoneName = (zone: string) =>
  searchZones(zone, 400).find((z) => z.toLowerCase() === zone.toLowerCase()) ??
  zone;

/** "today", "tomorrow" or "in 12 days". */
export const whenText = (days: number) =>
  days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

/** What /birthday view says about someone. */
export function viewText(
  c: Birthdays,
  b: BdEntry | null,
  who: string,
  self: boolean,
  now: number,
) {
  if (!b)
    return self
      ? `You haven’t saved your birthday. Save it with /${c.commands.group.name} ${c.commands.set.name}.`
      : `${who} hasn’t saved a birthday.`;
  const next = bdNext(b, now, zoneOf(c, b));
  const age = c.showAge && b.year !== null ? next.year - b.year : null;
  const whose = self ? 'Your' : `${who}’s`;
  return `🎂 ${whose} birthday is **${bdDateText(b.day, b.month)}**. ${
    next.days === 0
      ? `That’s today${age !== null ? `, turning ${age}` : ''}! 🎉`
      : `It’s ${whenText(next.days)}${age !== null ? `, turning ${age}` : ''}.`
  }`;
}

/** The next birthdays, one line each. */
export function upcomingText(c: Birthdays, list: BdEntry[], now: number) {
  const next = bdUpcoming(c, list, now);
  if (!next.length)
    return `Nobody has saved a birthday yet. Save yours with /${c.commands.group.name} ${c.commands.set.name}.`;
  return [
    '🎈 **Upcoming birthdays**',
    ...next.map(
      (b) =>
        `**${bdDateText(b.next.day, b.next.month)}** · <@${b.userId}>${b.age !== null ? ` turns ${b.age}` : ''} · ${whenText(b.next.days)}`,
    ),
  ].join('\n');
}

/** Every birthday in a month, one line each, within Discord's 2,000. */
export function monthText(c: Birthdays, list: BdEntry[], month: number) {
  const name = bdMonths[month - 1] ?? '';
  const shown = list.filter((b) => b.inServer || !c.hideLeft);
  if (!shown.length) return `Nobody has a birthday in ${name} yet.`;
  const lines = [`📅 **Birthdays in ${name}**`];
  for (const [i, b] of shown.entries()) {
    const line = `**${b.day}** · <@${b.userId}>`;
    if (lines.join('\n').length + line.length > 1900) {
      lines.push(`…and ${shown.length - i} more.`);
      break;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Birthdays in the bot: the server's /birthday command (with time zone
 * suggestions), members joining and leaving, and the sweep that
 * celebrates them.
 */
export function birthdaysBot(
  db: Db,
  rest: Rest,
  { appId }: { appId: () => string | undefined },
) {
  async function registerCommands(guildId: string) {
    const app = appId();
    if (!app) return;
    await registerGuildCommands(rest, db, app, guildId);
  }

  /** After a save: registers the commands, then checks the channel and role. */
  async function apply(guild: Guild | undefined) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const { on, config } = bdConfigOf(db, guild.id);
    await registerCommands(guild.id).catch(() => {
      throw new Explained(
        'Sparko couldn’t add the birthday commands. Re-invite it with the applications.commands permission.',
      );
    });
    if (!on) return;
    const me = guild.members.me;
    const channel = guild.channels.cache.get(config.channel);
    if (!channel)
      throw new Explained(
        'The birthday channel no longer exists. Pick another one.',
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
    if (!config.role) return;
    const role = guild.roles.cache.get(config.role);
    if (!role)
      throw new Explained('The birthday role no longer exists. Pick another.');
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles))
      throw new Explained(
        'Sparko needs Manage Roles to give the birthday role.',
      );
    if (role.position >= me.roles.highest.position)
      throw new Explained(
        `Sparko can’t give @${role.name}. Move Sparko’s role above it in Server Settings → Roles.`,
      );
  }

  /** The job handlers for saves, test messages and roles to take back. */
  const handlers = (guildOf: (id: string) => Guild | undefined) => ({
    birthdays: (job: Job) => apply(guildOf(job.guildId)),
    'birthdays-test': (job: Job) => {
      const p = job.payload as {
        channel: string;
        kind: BdKind;
        userId: string;
        userName: string;
        avatar?: string;
      };
      return bdTestPost(rest, db, job.guildId, p.channel, p.kind, {
        id: p.userId,
        name: p.userName,
        avatar: p.avatar ?? '',
      });
    },
    'birthdays-role-off': async (job: Job) => {
      const p = job.payload as { userId: string; roleId: string };
      await bdTakeRole(rest, job.guildId, p.userId, p.roleId).catch(() => {});
    },
  });

  /** On start: commands for servers that only have birthdays on. */
  async function registerAll(inGuild: (id: string) => boolean) {
    for (const id of bdGuilds(db))
      if (
        inGuild(id) &&
        bdConfigOf(db, id).on &&
        // Suggestions already registered the whole list for these.
        !sgConfigOf(db, id).on
      )
        await registerCommands(id).catch((e: unknown) =>
          console.error(`Birthday commands in ${id} failed`, e),
        );
  }

  const say = (i: ChatInputCommandInteraction<'cached'>, content: string) =>
    i.deferred || i.replied
      ? i.editReply({ content, allowedMentions: { parse: [] } })
      : i.reply({ content, flags: EPHEMERAL, allowedMentions: { parse: [] } });

  /** Handles /birthday; false when it's not one of this server's. */
  function command(i: ChatInputCommandInteraction<'cached'>) {
    const { on, config: c } = bdConfigOf(db, i.guildId);
    const key = on
      ? bdCommandFor(c, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!key) return false;
    void (async () => {
      try {
        const now = Date.now();
        const target = i.options.getUser('member');
        const other = !!target && target.id !== i.user.id;
        const staff = bdIsStaff(c, rolesOf(i.member), isManager(i.member));
        if (key === 'set' || key === 'remove') {
          if (other && !staff)
            return await say(
              i,
              `Only staff can ${key === 'set' ? 'set' : 'remove'} someone else’s birthday.`,
            );
          if (target?.bot) return await say(i, 'Bots don’t have birthdays.');
        }
        if (key === 'set') {
          const member = other
            ? await i.guild.members.fetch(target.id).catch(() => null)
            : i.member;
          if (!member) return await say(i, 'That member isn’t in the server.');
          const zone = zoneFrom(i.options.getString('timezone'));
          if (zone === undefined)
            return await say(
              i,
              'That time zone isn’t one Sparko knows. Start typing a city and pick one from the list, like Europe/London.',
            );
          const r = bdSet(
            db,
            {
              guildId: i.guildId,
              user: personOf(member),
              created: member.user.createdTimestamp,
              joined: member.joinedTimestamp ?? null,
              day: i.options.getInteger('day', true),
              month: i.options.getInteger('month', true),
              year: i.options.getInteger('year'),
              timeZone: zone,
              by: other ? personOf(i.member) : undefined,
            },
            now,
          );
          if (!r.ok) return await say(i, r.problem);
          const b = r.entry;
          const whose = other ? `${member.displayName}’s` : 'your';
          const at = `${String(c.hour).padStart(2, '0')}:00`;
          const zoneText =
            c.zoneMode === 'member' && b.timeZone
              ? `${b.timeZone} time`
              : `the server’s time (${c.timeZone})`;
          return await say(
            i,
            `🎂 Saved ${whose} birthday: **${bdDateText(b.day, b.month)}${b.year ? ` ${b.year}` : ''}**${b.year ? ' (the year is never shown)' : ''}. Sparko celebrates it in <#${c.channel}> at ${at}, ${zoneText}.`,
          );
        }
        if (key === 'remove') {
          const id = target?.id ?? i.user.id;
          const gone = bdRemove(db, i.guildId, id, personOf(i.member), now);
          if (!gone)
            return await say(
              i,
              other
                ? 'They haven’t saved a birthday.'
                : 'You haven’t saved a birthday.',
            );
          if (gone.roleId)
            await bdTakeRole(rest, i.guildId, id, gone.roleId).catch(() => {});
          return await say(
            i,
            other
              ? `Removed ${gone.entry.name}’s birthday.`
              : 'Sparko forgot your birthday.',
          );
        }
        if (key === 'view') {
          const id = target?.id ?? i.user.id;
          const b = getBirthday(db, i.guildId, id);
          return await say(
            i,
            viewText(
              c,
              b && (b.inServer || !c.hideLeft) ? b : null,
              `<@${id}>`,
              !other,
              now,
            ),
          );
        }
        if (key === 'upcoming')
          return await say(
            i,
            upcomingText(c, listBirthdays(db, i.guildId), now),
          );
        const month = i.options.getInteger('month', true);
        return await say(
          i,
          monthText(c, listBirthdays(db, i.guildId, { month }), month),
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

  /** Suggests time zones as members type, with their offset now. */
  function autocomplete(i: AutocompleteInteraction<'cached'>) {
    const { on, config } = bdConfigOf(db, i.guildId);
    if (
      !on ||
      bdCommandFor(config, i.commandName, i.options.getSubcommand(false)) !==
        'set'
    )
      return false;
    const typed = String(i.options.getFocused());
    const now = Date.now();
    void i
      .respond(
        searchZones(typed).map((z) => ({
          name: `${z.replace(/_/g, ' ')} (${zoneOffset(z, now)})`,
          value: z,
        })),
      )
      .catch(() => {});
    return true;
  }

  /** Someone joined: a birthday saved before they left counts again. */
  function joined(m: GuildMember) {
    bdJoined(db, m.guild.id, personOf(m));
  }
  /** Someone left: hidden, or forgotten if the server says so. */
  function left(guildId: string, userId: string) {
    bdLeft(db, guildId, userId);
  }

  /** Every minute: birthdays due, roles to take back, the monthly post. */
  function startSweep(inGuild: (id: string) => boolean) {
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      void (async () => {
        for (const id of bdGuilds(db))
          if (inGuild(id))
            await bdSweep(rest, db, id).catch((e: unknown) =>
              console.error(`Birthdays in ${id} failed`, e),
            );
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
    joined,
    left,
    startSweep,
  };
}
