import type { Rest } from './discord.ts';
import {
  basePermissions,
  channelPermissions,
  has,
  Perm,
  type Overwrite,
  type RoleInfo,
} from './permissions.ts';

export type ChannelView = {
  id: string;
  name: string;
  category: string;
  /** Sparko can see the channel, send messages and embed links there. */
  canPost: boolean;
  /** Sparko can open private threads (for tickets). */
  canThread: boolean;
};

export type GuildView = {
  /** Sparko's server-wide permissions. */
  perms: bigint;
  channels: ChannelView[];
  roles: {
    id: string;
    name: string;
    color: number;
    /** The second colour of a gradient role, if it is one. */
    color2: number | null;
    managed: boolean;
  }[];
};

type DiscordChannel = {
  id: string;
  type: number;
  name: string;
  position: number;
  parent_id: string | null;
  permission_overwrites?: Overwrite[];
};

const TEXT = 0;
const ANNOUNCEMENT = 5;
const CATEGORY = 4;

/**
 * What Sparko can do in a server, read from Discord with the bot token and
 * cached for a minute. `refresh` re-reads it after an owner fixes something.
 */
export function guildViews(rest: Rest, ttlMs = 60_000) {
  const cache = new Map<string, { at: number; view: Promise<GuildView> }>();
  let botId: Promise<string> | undefined;

  async function load(guildId: string): Promise<GuildView> {
    botId ??= rest.get<{ id: string }>('/users/@me').then((u) => u.id);
    const me = await botId;
    const [guild, channels, member] = await Promise.all([
      rest.get<{
        id: string;
        owner_id: string;
        roles: (RoleInfo & {
          name: string;
          color: number;
          colors?: { secondary_color?: number | null };
          position: number;
          managed: boolean;
        })[];
      }>(`/guilds/${guildId}`),
      rest.get<DiscordChannel[]>(`/guilds/${guildId}/channels`),
      rest.get<{ roles: string[] }>(`/guilds/${guildId}/members/${me}`),
    ]);
    const self = { id: me, roles: member.roles };
    const perms = basePermissions(
      { id: guild.id, ownerId: guild.owner_id },
      guild.roles,
      self,
    );
    const categories = new Map(
      channels
        .filter((c) => c.type === CATEGORY)
        .map((c) => [c.id, c] as const),
    );
    const sortKey = (c: DiscordChannel) => {
      const parent = c.parent_id ? categories.get(c.parent_id) : undefined;
      return [parent ? parent.position + 1 : 0, c.position] as const;
    };
    const list = channels
      .filter((c) => c.type === TEXT || c.type === ANNOUNCEMENT)
      .sort((a, b) => {
        const [pa, ca] = sortKey(a);
        const [pb, cb] = sortKey(b);
        return pa - pb || ca - cb;
      })
      .map((c) => {
        const inChannel = channelPermissions(
          perms,
          guild.id,
          self,
          c.permission_overwrites ?? [],
        );
        return {
          id: c.id,
          name: c.name,
          category:
            (c.parent_id && categories.get(c.parent_id)?.name) || 'No category',
          canPost: has(
            inChannel,
            Perm.viewChannel,
            Perm.sendMessages,
            Perm.embedLinks,
          ),
          canThread: has(
            inChannel,
            Perm.viewChannel,
            Perm.createPrivateThreads,
            Perm.sendMessagesInThreads,
          ),
        };
      });
    const roles = guild.roles
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        color2: r.colors?.secondary_color ?? null,
        managed: r.managed,
      }));
    return { perms, channels: list, roles };
  }

  function get(guildId: string, now = Date.now()) {
    const hit = cache.get(guildId);
    if (hit && now - hit.at < ttlMs) return hit.view;
    const view = load(guildId);
    cache.set(guildId, { at: now, view });
    // Don't keep a failed read around.
    view.catch(() => cache.delete(guildId));
    return view;
  }

  return {
    get,
    refresh: (guildId: string) => {
      cache.delete(guildId);
      return get(guildId);
    },
  };
}
