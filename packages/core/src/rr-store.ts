import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import { rememberPost } from './studio-actions.ts';
import {
  type StudioVars,
  normaliseStudio,
  studioPayload,
  type StudioMessage,
} from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import {
  RR_SPARKO,
  emojiKey,
  reactionPath,
  rrChangedLists,
  rrSparkoMessage,
  rrComponents,
  rrDecide,
  rrRoleList,
  type ReactionRole,
  type RRAction,
} from './reaction-roles.ts';

export * from './reaction-roles.ts';

/** Reaction role messages are kept as templates of this module. */
export const RR_MODULE = 'role-menus';

type Row = Record<string, unknown>;

// Where each one is posted ----------------------------------------------------

export type RRPost = {
  messageId: string;
  templateId: string;
  channelId: string;
  /** The reactions Sparko last added, to take away ones that went. */
  emojis: string[];
};
const postOf = (r: Row): RRPost => ({
  messageId: r.message_id as string,
  templateId: r.template_id as string,
  channelId: r.channel_id as string,
  emojis: JSON.parse(r.emojis as string) as string[],
});

export function rrPostFor(db: Db, guildId: string, templateId: string) {
  const r = db
    .prepare('SELECT * FROM rr_posts WHERE guild_id = ? AND template_id = ?')
    .get(guildId, templateId) as Row | undefined;
  return r ? postOf(r) : undefined;
}
export function rrPostByMessage(db: Db, messageId: string) {
  const r = db
    .prepare('SELECT * FROM rr_posts WHERE message_id = ?')
    .get(messageId) as Row | undefined;
  return r ? { ...postOf(r), guildId: r.guild_id as string } : undefined;
}
function savePost(db: Db, guildId: string, p: RRPost) {
  db.prepare('DELETE FROM rr_posts WHERE guild_id = ? AND template_id = ?').run(
    guildId,
    p.templateId,
  );
  db.prepare(
    'INSERT INTO rr_posts (message_id, guild_id, template_id, channel_id, emojis) VALUES (?, ?, ?, ?, ?)',
  ).run(
    p.messageId,
    guildId,
    p.templateId,
    p.channelId,
    JSON.stringify(p.emojis),
  );
}

// The log ---------------------------------------------------------------------

export type RRLogEntry = {
  id: string;
  action: 'added' | 'removed' | 'refused' | 'failed';
  template: string;
  userId: string;
  userName: string;
  roleId: string;
  reason: string;
  at: number;
};
const KEEP = 500;

export function addRRLog(db: Db, guildId: string, e: Omit<RRLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO rr_log (guild_id, action, template, user_id, user_name, role_id, reason, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    e.action,
    e.template,
    e.userId,
    e.userName,
    e.roleId,
    e.reason,
    e.at,
  );
  db.prepare(
    `DELETE FROM rr_log WHERE guild_id = ? AND id <= (
       SELECT id FROM rr_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listRRLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM rr_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): RRLogEntry => ({
      id: String(r.id),
      action: r.action as RRLogEntry['action'],
      template: r.template as string,
      userId: r.user_id as string,
      userName: r.user_name as string,
      roleId: r.role_id as string,
      reason: r.reason as string,
      at: r.at as number,
    }),
  );
}

// Posting ---------------------------------------------------------------------

const ignoreGone = (e: unknown) => {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.unknownMessage ||
      e.code === DiscordCodes.unknownChannel)
  )
    return;
  throw e;
};

function plain(e: unknown): never {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    throw new Plain(
      'Sparko can’t post or react in that channel. Give it View Channel, Send Messages, Embed Links and Add Reactions there.',
    );
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    throw new Plain('That channel no longer exists. Pick another one.');
  if (e instanceof DiscordError && e.status === 400)
    throw new Plain(`Discord didn’t accept the message: ${e.message}`);
  throw e;
}

/**
 * Puts a reaction role's message in Discord as it's saved: posts it the
 * first time, edits it after, moves it when the channel changes, and keeps
 * Sparko's reactions in step with the list.
 */
export async function syncReactionRole(
  rest: Rest,
  db: Db,
  guildId: string,
  templateId: string,
  now = Date.now(),
) {
  const t = getTemplate<ReactionRole>(db, guildId, RR_MODULE, templateId);
  if (!t) return deleteReactionRolePost(rest, db, guildId, templateId);
  const r = t.message;
  const studio = getTemplate<StudioMessage>(db, guildId, 'studio', r.message);
  if (!studio)
    throw new Plain(
      `The message template “${t.name}” posts was deleted. Pick another one.`,
    );
  const m = normaliseStudio(studio.message);
  const guild = getGuild(db, guildId);
  const base = studioPayload(m, {
    now,
    server: serverVars(guild),
    channel: r.channel,
    roleList: rrRoleList(r),
  }) as { components?: object[] } & Record<string, unknown>;
  const body = {
    ...base,
    components: [...(base.components ?? []), ...rrComponents(r)],
  };
  if (m.layout !== 'v2' && body.components.length > 5)
    throw new Plain(
      'The message has too many rows of buttons and menus. Discord allows 5, counting the reaction role’s own.',
    );

  let post = rrPostFor(db, guildId, templateId);
  if (post && post.channelId !== r.channel) {
    // A new channel: the old message goes.
    await rest
      .delete(`/channels/${post.channelId}/messages/${post.messageId}`)
      .catch(ignoreGone);
    post = undefined;
  }
  try {
    if (post) {
      try {
        await rest.patch(
          `/channels/${post.channelId}/messages/${post.messageId}`,
          body,
        );
      } catch (e) {
        if (
          !(e instanceof DiscordError && e.code === DiscordCodes.unknownMessage)
        )
          throw e;
        post = undefined;
      }
    }
    if (!post) {
      const sent = await rest.post<{ id: string }>(
        `/channels/${r.channel}/messages`,
        body,
      );
      post = {
        messageId: sent.id,
        templateId,
        channelId: r.channel,
        emojis: [],
      };
    }
    rememberPost(db, guildId, post.messageId, m, now);
    // Sparko's own reactions show members what to press.
    const want = r.kind === 'reaction' ? r.items.map((i) => i.emoji) : [];
    const keys = new Set(want.map(emojiKey));
    const path = `/channels/${post.channelId}/messages/${post.messageId}/reactions`;
    for (const e of post.emojis)
      if (!keys.has(emojiKey(e)))
        await rest.delete(`${path}/${reactionPath(e)}`).catch(ignoreGone);
    for (const e of want) await rest.put(`${path}/${reactionPath(e)}/@me`, {});
    savePost(db, guildId, { ...post, emojis: want });
  } catch (e) {
    plain(e);
  }
}

/** Takes a deleted reaction role's message out of Discord. */
export async function deleteReactionRolePost(
  rest: Rest,
  db: Db,
  guildId: string,
  templateId: string,
) {
  const post = rrPostFor(db, guildId, templateId);
  if (!post) return;
  await rest
    .delete(`/channels/${post.channelId}/messages/${post.messageId}`)
    .catch(ignoreGone);
  db.prepare('DELETE FROM rr_posts WHERE message_id = ?').run(post.messageId);
}

// Using one -------------------------------------------------------------------

export type RRUse = {
  messageId: string;
  /** The member, for {user}, {user.avatar}, {user.joined}… in responses. */
  user: NonNullable<StudioVars['user']>;
  /** The roles the member has now. */
  roles: string[];
  /** Role names, for {role.name} in responses. */
  roleName?: (id: string) => string | undefined;
} & (
  | { action: 'react' | 'unreact'; emoji: string }
  | { action: 'button'; item: string }
  | { action: 'menu'; items: string[] }
);

/**
 * Applies what a member did on a reaction role message: gives and takes
 * roles, logs each change, and says what to tell them. Returns null when
 * the message isn't one of Sparko's reaction roles.
 */
export async function applyReactionRole(
  rest: Rest,
  db: Db,
  u: RRUse,
  now = Date.now(),
) {
  const post = rrPostByMessage(db, u.messageId);
  if (!post) return null;
  const { guildId } = post;
  if (!getModule(db, guildId, RR_MODULE).on)
    return { off: true as const, guildId, given: [], taken: [], refused: [] };
  const t = getTemplate<ReactionRole>(db, guildId, RR_MODULE, post.templateId);
  if (!t) return null;
  const r = t.message;
  let action: RRAction;
  // Only what the message offers counts: a stray reaction on a button
  // message gives nothing.
  const offered =
    u.action === 'react' || u.action === 'unreact'
      ? r.kind === 'reaction'
      : u.action === 'button'
        ? r.kind === 'button'
        : r.kind === 'menu';
  if (!offered) return null;
  if (u.action === 'react' || u.action === 'unreact') {
    const item = r.items.find((i) => emojiKey(i.emoji) === emojiKey(u.emoji));
    if (!item) return null;
    action = { kind: u.action, item: item.id };
  } else if (u.action === 'button') action = { kind: 'button', item: u.item };
  else if (u.action === 'menu') action = { kind: 'menu', items: u.items };
  else return null;

  const outcome = rrDecide(r, action, new Set(u.roles));
  const log = (
    a: 'added' | 'removed' | 'refused' | 'failed',
    roleId: string,
    reason = '',
  ) =>
    addRRLog(db, guildId, {
      action: a,
      template: t.name,
      userId: u.user.id,
      userName: u.user.name,
      roleId,
      reason,
      at: now,
    });
  const given: string[] = [];
  const taken: string[] = [];
  const failed: string[] = [];
  const member = `/guilds/${guildId}/members/${u.user.id}/roles`;
  for (const [list, done, verb] of [
    [outcome.give, given, 'added'],
    [outcome.take, taken, 'removed'],
  ] as const)
    for (const role of list)
      try {
        await (verb === 'added'
          ? rest.put(`${member}/${role}`, {}, 'Reaction role')
          : rest.delete(`${member}/${role}`, 'Reaction role'));
        done.push(role);
        log(verb, role);
      } catch (e) {
        const reason =
          e instanceof DiscordError &&
          (e.code === DiscordCodes.missingPermissions ||
            e.code === DiscordCodes.missingAccess)
            ? 'Sparko’s role is below it, or it lacks Manage Roles.'
            : e instanceof Error
              ? e.message
              : 'something went wrong.';
        failed.push(role);
        log('failed', role, reason);
      }
  for (const x of outcome.refused) log('refused', x.item.role, x.reason);

  // The response message, if one is set for what happened.
  const res = r.response;
  const pick = given.length ? res.claim : taken.length ? res.remove : '';
  const message: StudioMessage | undefined = !res.on
    ? undefined
    : pick === RR_SPARKO
      ? rrSparkoMessage(given.length ? 'claim' : 'remove')
      : pick
        ? getTemplate<StudioMessage>(db, guildId, 'studio', pick)?.message
        : undefined;
  const guild = getGuild(db, guildId);
  const role = given[0] ?? taken[0];
  const response = message
    ? studioPayload(normaliseStudio(message), {
        now,
        user: u.user,
        role: role ? { id: role, name: u.roleName?.(role) ?? role } : undefined,
        roleList: rrRoleList(r),
        server: serverVars(guild),
        channel: post.channelId,
        extra: rrChangedLists(given, taken),
      })
    : null;
  return {
    off: false as const,
    guildId,
    channelId: post.channelId,
    given,
    taken,
    failed,
    refused: outcome.refused.map((x) => x.reason),
    response,
    delivery: res.delivery,
  };
}

/** A short line for the member when no response message is set. */
export function rrSummary(
  u: Awaited<ReturnType<typeof applyReactionRole>>,
): string {
  if (!u) return 'This menu no longer works.';
  if (u.off) return 'Reaction roles are turned off in this server.';
  const roles = (ids: string[]) => ids.map((id) => `<@&${id}>`).join(', ');
  const parts = [
    u.given.length ? `You now have ${roles(u.given)}.` : '',
    u.taken.length ? `Removed ${roles(u.taken)}.` : '',
    u.failed?.length
      ? `Sparko couldn’t change ${roles(u.failed)}. Ask a moderator.`
      : '',
    ...u.refused,
  ].filter(Boolean);
  return parts.join('\n') || 'Nothing changed.';
}
