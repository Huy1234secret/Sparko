import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule } from './store.ts';
import { getPosted, setPosted } from './tickets.ts';
import { Plain } from './ticket-actions.ts';
import { rememberPost } from './studio-actions.ts';
import {
  normaliseStudio,
  studioPayload,
  type StudioMessage,
} from './studio-format.ts';

export * from './studio-format.ts';

// Publishing ------------------------------------------------------------------

/**
 * Posts the Studio message, or edits the one already posted with the same
 * layout in the same channel. Discord can't switch a posted message between
 * the classic and Components V2 layouts, so a new layout is a new message.
 */
export async function publishStudio(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
  /** Who posted it, for {user} and the like. */
  user?: { id: string; name: string },
) {
  const { config } = getModule<StudioMessage>(db, guildId, 'studio');
  if (!config) return;
  const m = normaliseStudio(config);
  const guild = getGuild(db, guildId);
  const body = studioPayload(m, {
    now,
    user,
    server: guild && { name: guild.name, members: guild.memberCount },
    channel: m.channel,
  });
  const key = `studio:${m.layout}`;
  const posted = getPosted(db, guildId, key);
  try {
    if (posted?.channelId === m.channel) {
      try {
        await rest.patch(
          `/channels/${posted.channelId}/messages/${posted.messageId}`,
          body,
        );
        rememberPost(db, guildId, posted.messageId, m, now);
        return;
      } catch (e) {
        if (
          !(e instanceof DiscordError && e.code === DiscordCodes.unknownMessage)
        )
          throw e;
      }
    }
    const message = await rest.post<{ id: string }>(
      `/channels/${m.channel}/messages`,
      body,
    );
    setPosted(db, guildId, key, {
      channelId: m.channel,
      messageId: message.id,
    });
    rememberPost(db, guildId, message.id, m, now);
  } catch (e) {
    if (
      e instanceof DiscordError &&
      (e.code === DiscordCodes.missingPermissions ||
        e.code === DiscordCodes.missingAccess)
    )
      throw new Plain(
        'Sparko can’t post in that channel yet. Give it View Channel, Send Messages and Embed Links there.',
      );
    if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
      throw new Plain('That channel no longer exists. Pick another one.');
    if (e instanceof DiscordError && e.status === 400)
      throw new Plain(`Discord didn’t accept the message: ${e.message}`);
    throw e;
  }
}
