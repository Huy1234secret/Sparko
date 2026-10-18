import type { Db } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import {
  IS_COMPONENTS_V2,
  normaliseStudio,
  studioPayload,
  type StudioAction,
  type StudioComponent,
  type StudioMessage,
} from './studio-format.ts';
import { getGuild, serverVars } from './store.ts';
import { getTemplate } from './templates.ts';

/**
 * Buttons and menus on Studio messages. Every message Sparko posts is kept,
 * so when someone uses one of its buttons or menus, the bot can find what
 * it should do.
 */

type Row = Record<string, unknown>;
const EPHEMERAL = 1 << 6;

export function rememberPost(
  db: Db,
  guildId: string,
  messageId: string,
  message: StudioMessage,
  now: number,
) {
  // Only messages with buttons or menus need remembering.
  if (!message.components.length) return;
  db.prepare(
    `INSERT INTO studio_posts (message_id, guild_id, json, posted_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (message_id) DO UPDATE SET json = excluded.json, posted_at = excluded.posted_at`,
  ).run(messageId, guildId, JSON.stringify(message), now);
}

export function findPost(db: Db, messageId: string) {
  const r = db
    .prepare('SELECT * FROM studio_posts WHERE message_id = ?')
    .get(messageId) as Row | undefined;
  return r
    ? {
        guildId: r.guild_id as string,
        message: normaliseStudio(JSON.parse(r.json as string) as StudioMessage),
      }
    : undefined;
}

/** The button or menu a custom id names, if it's one of Sparko's. */
export function parseStudioCustomId(customId: string) {
  const m = customId.match(/^sp:(b|m):([\w-]{1,40})$/);
  return m ? { kind: m[1] === 'b' ? 'button' : 'menu', id: m[2]! } : null;
}

/** The actions to run, in order: a button's, or each picked option's. */
export function actionsFor(c: StudioComponent, values: string[]) {
  if (c.type === 'button') return c.link ? [] : c.actions;
  return values.flatMap(
    (v) => c.options.find((o) => o.id === v)?.actions ?? [],
  );
}

export type StudioInteraction = {
  id: string;
  token: string;
  applicationId: string;
  guildId: string;
  channelId: string;
  userId: string;
  /** The clicker's name in the server, for {user.name}. */
  userName: string;
  /** Their picture, and when they made their account and joined. */
  userAvatar?: string | undefined;
  userCreated?: number | undefined;
  userJoined?: number | undefined;
  messageId: string;
  customId: string;
  /** What was picked in a menu. */
  values: string[];
};

const roleProblem = (e: unknown, role: string) =>
  e instanceof DiscordError && (e.code === 50013 || e.code === 50001)
    ? `Sparko can’t change <@&${role}>. Give it Manage Roles and put its role above that one.`
    : e instanceof DiscordError && e.code === 10011
      ? 'One of the roles no longer exists.'
      : `Changing <@&${role}> didn’t work. Try again in a moment.`;

/**
 * Answers a button or menu on a Studio message: acknowledges it within
 * Discord's three seconds, runs the actions from top to bottom, and tells
 * the person privately if anything didn't work.
 */
export async function handleStudioInteraction(
  rest: Rest,
  db: Db,
  i: StudioInteraction,
  now = Date.now(),
) {
  const callback = `/interactions/${i.id}/${i.token}/callback`;
  const parsed = parseStudioCustomId(i.customId);
  const post = findPost(db, i.messageId);
  const component =
    parsed && post?.guildId === i.guildId
      ? post.message.components.find(
          (c) => c.id === parsed.id && c.type === parsed.kind,
        )
      : undefined;
  if (!component) {
    await rest.post(callback, {
      type: 4,
      data: {
        content: 'This doesn’t do anything any more.',
        flags: EPHEMERAL,
      },
    });
    return;
  }

  await runStudioActions(rest, db, i, actionsFor(component, i.values), now);
}

/**
 * Runs actions for a click, from top to bottom. `acked` is for a click
 * something else already answered (a vote): private messages follow it.
 */
export async function runStudioActions(
  rest: Rest,
  db: Db,
  i: Omit<StudioInteraction, 'customId' | 'values'>,
  actions: StudioAction[],
  now = Date.now(),
  acked = false,
) {
  const callback = `/interactions/${i.id}/${i.token}/callback`;
  const webhook = `/webhooks/${i.applicationId}/${i.token}`;
  // A private reply is started straight away when one will be sent.
  const replies = actions.some(
    (a) => a.type === 'send' && a.ephemeral && !a.dm,
  );
  if (!acked)
    await rest.post(
      callback,
      replies ? { type: 5, data: { flags: EPHEMERAL } } : { type: 6 },
    );

  const problems: string[] = [];
  let answered = acked;
  const sendOne = async (action: Extract<StudioAction, { type: 'send' }>) => {
    for (const templateId of action.templates) {
      const template = getTemplate<StudioMessage>(
        db,
        i.guildId,
        'studio',
        templateId,
      );
      if (!template) {
        problems.push('A template this sends has been deleted.');
        continue;
      }
      const message = normaliseStudio(template.message);
      const guild = getGuild(db, i.guildId);
      const body = studioPayload(message, {
        now,
        user: {
          id: i.userId,
          name: i.userName,
          avatar: i.userAvatar,
          createdAt: i.userCreated,
          joinedAt: i.userJoined,
        },
        server: serverVars(guild),
        channel: i.channelId,
      }) as Record<string, unknown> & {
        flags?: number;
      };
      try {
        if (action.dm) {
          const dm = await rest.post<{ id: string }>('/users/@me/channels', {
            recipient_id: i.userId,
          });
          const sent = await rest.post<{ id: string }>(
            `/channels/${dm.id}/messages`,
            body,
          );
          rememberPost(db, i.guildId, sent.id, message, now);
        } else if (action.ephemeral) {
          const flags = (body.flags ?? 0) | EPHEMERAL;
          // The first private message fills the reply Discord is showing.
          const sent =
            !answered && !(flags & IS_COMPONENTS_V2)
              ? await rest.patch<{ id: string }>(
                  `${webhook}/messages/@original`,
                  body,
                )
              : await rest.post<{ id: string }>(webhook, { ...body, flags });
          answered = true;
          rememberPost(db, i.guildId, sent.id, message, now);
        } else {
          const sent = await rest.post<{ id: string }>(
            `/channels/${i.channelId}/messages`,
            body,
          );
          rememberPost(db, i.guildId, sent.id, message, now);
        }
      } catch (e) {
        problems.push(
          action.dm && e instanceof DiscordError && e.code === 50007
            ? 'Sparko can’t DM you. Allow direct messages from this server and try again.'
            : `Sending “${template.name}” didn’t work.`,
        );
      }
    }
  };

  for (const action of actions) {
    if (action.type === 'send') await sendOne(action);
    // Suggestion actions only work on suggestions, which answer them first.
    else if (action.type === 'role')
      for (const role of action.roles) {
        const path = `/guilds/${i.guildId}/members/${i.userId}/roles/${role}`;
        try {
          if (action.mode === 'give')
            await rest.put(path, undefined, 'Message Studio button');
          else await rest.delete(path, 'Message Studio button');
        } catch (e) {
          problems.push(roleProblem(e, role));
        }
      }
  }

  const note = problems.length ? problems.join('\n') : null;
  if (replies && !answered)
    await rest.patch(`${webhook}/messages/@original`, {
      content: note ?? 'Done.',
      allowed_mentions: { parse: [] },
    });
  else if (note)
    await rest.post(webhook, {
      content: note,
      flags: EPHEMERAL,
      allowed_mentions: { parse: [] },
    });
}
