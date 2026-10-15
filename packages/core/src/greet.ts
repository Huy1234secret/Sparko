import type { Db } from './db.ts';
import { DiscordError, DiscordCodes, type Rest } from './discord.ts';
import { getModule, writeModule } from './store.ts';
import { rememberPost } from './studio-actions.ts';
import {
  normaliseStudio,
  studioPayload,
  type StudioMessage,
} from './studio-format.ts';
import { addTemplate, deleteTemplate, getTemplate } from './templates.ts';
import {
  greetTemplates,
  isLegacyWelcome,
  legacyMessage,
  upgradeLegacy,
  type GreetKind,
  type WelcomeConfig,
} from './welcome.ts';

/**
 * Sending welcome, leave and boost messages, and the log of what was sent.
 */

/**
 * The welcome settings. Settings saved before welcome messages used
 * templates are moved over first: the old message becomes a template.
 */
export function welcomeOf(db: Db, guildId: string, now: number) {
  const saved = getModule<unknown>(db, guildId, 'welcome');
  if (!isLegacyWelcome(saved.config))
    return { on: saved.on, config: saved.config as WelcomeConfig | null };
  const legacy = saved.config;
  const id = addTemplate(
    db,
    {
      guildId,
      moduleId: 'studio',
      name: 'Welcome message',
      who: 'Sparko',
      message: legacyMessage(legacy),
    },
    now,
  );
  // The bot and the dashboard can both get here; only one move counts.
  const again = getModule<unknown>(db, guildId, 'welcome');
  if (!isLegacyWelcome(again.config)) {
    deleteTemplate(db, guildId, 'studio', id);
    return { on: again.on, config: again.config as WelcomeConfig | null };
  }
  const config = upgradeLegacy(legacy, id);
  writeModule(db, guildId, 'welcome', { on: saved.on, config }, now);
  return { on: saved.on, config };
}

// The log ---------------------------------------------------------------------

export type GreetLogEntry = {
  id: string;
  kind: GreetKind;
  ok: boolean;
  template: string;
  /** Where it went; null for a direct message. */
  channelId: string | null;
  memberId: string;
  memberName: string;
  reason: string;
  at: number;
};

/** How many entries each server keeps. */
const KEEP = 500;

export function addGreetLog(
  db: Db,
  guildId: string,
  e: Omit<GreetLogEntry, 'id'>,
) {
  db.prepare(
    `INSERT INTO greet_log (guild_id, kind, ok, template, channel_id, member_id, member_name, reason, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    e.kind,
    e.ok ? 1 : 0,
    e.template,
    e.channelId,
    e.memberId,
    e.memberName,
    e.reason,
    e.at,
  );
  db.prepare(
    `DELETE FROM greet_log WHERE guild_id = ? AND id <= (
       SELECT id FROM greet_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listGreetLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM greet_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Record<string, unknown>[]
  ).map(
    (r): GreetLogEntry => ({
      id: String(r.id),
      kind: r.kind as GreetKind,
      ok: r.ok === 1,
      template: r.template as string,
      channelId: (r.channel_id as string | null) ?? null,
      memberId: r.member_id as string,
      memberName: r.member_name as string,
      reason: r.reason as string,
      at: r.at as number,
    }),
  );
}

// Sending ---------------------------------------------------------------------

export type GreetMember = {
  id: string;
  name: string;
  avatar?: string | undefined;
  createdAt?: number | undefined;
  joinedAt?: number | undefined;
};
export type GreetServer = {
  name: string;
  members: number;
  icon?: string | undefined;
  boosts?: number | undefined;
  level?: number | undefined;
};

/** Why Discord refused, in words for the log. */
function reasonOf(e: unknown) {
  if (e instanceof DiscordError) {
    if (
      e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess
    )
      return 'Sparko doesn’t have permission to send messages there.';
    if (e.code === DiscordCodes.unknownChannel)
      return 'the channel no longer exists.';
    if (e.code === DiscordCodes.cannotMessageUser)
      return 'they don’t accept direct messages from this server.';
    if (e.status === 400)
      return `Discord didn’t accept the message: ${e.message}`;
    return e.message;
  }
  return e instanceof Error ? e.message : 'something went wrong.';
}

/**
 * Sends the join, leave or boost message for one member, as the settings
 * say, and logs each send. Returns the channel message when it should be
 * deleted after a while, for the bot to delete then.
 */
export async function sendGreeting(
  rest: Rest,
  db: Db,
  g: {
    guildId: string;
    kind: GreetKind;
    member: GreetMember;
    server: GreetServer;
    now: number;
  },
) {
  const { on, config } = welcomeOf(db, g.guildId, g.now);
  if (!on || !config) return null;
  const s = config[g.kind];
  const ids = greetTemplates(s);
  const log = (template: string, channelId: string | null, reason: string) =>
    addGreetLog(db, g.guildId, {
      kind: g.kind,
      ok: !reason,
      template,
      channelId,
      memberId: g.member.id,
      memberName: g.member.name,
      reason,
      at: g.now,
    });
  const load = (id: string) => {
    const t = getTemplate<StudioMessage>(db, g.guildId, 'studio', id);
    return t && { name: t.name, message: normaliseStudio(t.message) };
  };
  const body = (m: StudioMessage, channel: string | undefined) => ({
    ...studioPayload(m, {
      now: g.now,
      user: g.member,
      server: g.server,
      channel,
    }),
    // The member it's about can be pinged; nobody else ever is.
    allowed_mentions: { parse: [], users: s.ping ? [g.member.id] : [] },
  });

  let toDelete: { channelId: string; messageId: string; after: number } | null =
    null;
  if (ids.channel) {
    const t = load(ids.channel);
    if (!t) log('a deleted template', s.channel, 'the template was deleted.');
    else
      try {
        const sent = await rest.post<{ id: string }>(
          `/channels/${s.channel}/messages`,
          body(t.message, s.channel),
        );
        rememberPost(db, g.guildId, sent.id, t.message, g.now);
        log(t.name, s.channel, '');
        if (s.deleteAfter)
          toDelete = {
            channelId: s.channel,
            messageId: sent.id,
            after: s.deleteAfter,
          };
      } catch (e) {
        log(t.name, s.channel, reasonOf(e));
      }
  }
  if (ids.dm) {
    const t = load(ids.dm);
    if (!t) log('a deleted template', null, 'the template was deleted.');
    else
      try {
        const dm = await rest.post<{ id: string }>('/users/@me/channels', {
          recipient_id: g.member.id,
        });
        const sent = await rest.post<{ id: string }>(
          `/channels/${dm.id}/messages`,
          body(t.message, undefined),
        );
        rememberPost(db, g.guildId, sent.id, t.message, g.now);
        log(t.name, null, '');
      } catch (e) {
        log(t.name, null, reasonOf(e));
      }
  }
  return toDelete;
}
