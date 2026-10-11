import { z } from 'zod';
import { DiscordAPIError, REST, Routes } from 'discord.js';
import { DomainError } from '@sparko/contracts';
export const OAuthToken = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});
export const DiscordUser = z.object({
  id: z.string(),
  username: z.string(),
  avatar: z.string().nullable().optional(),
});
export const OAuthGuild = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  owner: z.boolean(),
  permissions: z.string(),
});
export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.number(),
  parent_id: z.string().nullable().optional(),
  permission_overwrites: z
    .array(
      z.object({
        id: z.string(),
        type: z.number(),
        allow: z.string(),
        deny: z.string(),
      }),
    )
    .optional(),
});
export const GuildEmojiSchema = z
  .object({
    id: z.string().regex(/^[1-9][0-9]{16,19}$/),
    name: z.string().min(1).nullable(),
    animated: z.boolean().default(false),
    available: z.boolean().default(true),
    roles: z.array(z.string()).default([]),
  })
  .transform((emoji) => ({
    ...emoji,
    name: emoji.name ?? 'emoji',
    available: emoji.available && emoji.name !== null,
  }));
export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  permissions: z.string(),
  managed: z.boolean(),
  color: z.number(),
});
export interface DiscordAdapter {
  botUser?(): Promise<{ id: string }>;
  exchange(code: string): Promise<z.infer<typeof OAuthToken>>;
  refresh(token: string): Promise<z.infer<typeof OAuthToken>>;
  user(token: string): Promise<z.infer<typeof DiscordUser>>;
  guilds(token: string): Promise<z.infer<typeof OAuthGuild>[]>;
  member(guildId: string, userId: string): Promise<{ roles: string[] }>;
  channels(guildId: string): Promise<z.infer<typeof ChannelSchema>[]>;
  roles(guildId: string): Promise<z.infer<typeof RoleSchema>[]>;
  emojis(guildId: string): Promise<z.infer<typeof GuildEmojiSchema>[]>;
}
export function discordAdapter(
  clientId: string,
  secret: string,
  redirectUri: string,
  botToken: string,
): DiscordAdapter {
  const rest = new REST({ version: '10', timeout: 10000 }).setToken(botToken);
  async function botRead(path: `/${string}`) {
    try {
      return await rest.get(path);
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        [50001, 50013].includes(Number(error.code))
      )
        throw new DomainError(
          'MISSING_PERMISSION',
          'Sparko cannot access the selected Discord resources. Restore its permissions and retry.',
          403,
        );
      if (error instanceof DiscordAPIError && error.status === 404)
        throw new DomainError(
          'NOT_FOUND',
          'The selected Discord resource is no longer available.',
          404,
        );
      throw error;
    }
  }
  async function oauth(body: URLSearchParams) {
    if (!clientId || !secret)
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'Discord login is not configured.',
        503,
      );
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'Discord authorization could not be completed.',
        503,
      );
    return OAuthToken.parse(await response.json());
  }
  async function get(path: string, token: string) {
    const response = await fetch('https://discord.com/api/v10' + path, {
      headers: { authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'Current Discord access could not be established.',
        503,
      );
    return response.json() as Promise<unknown>;
  }
  return {
    botUser: async () =>
      z.object({ id: z.string() }).parse(await botRead(Routes.user('@me'))),
    exchange: (code) =>
      oauth(
        new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      ),
    refresh: (token) =>
      oauth(
        new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          grant_type: 'refresh_token',
          refresh_token: token,
        }),
      ),
    user: async (t) => DiscordUser.parse(await get('/users/@me', t)),
    guilds: async (t) =>
      z.array(OAuthGuild).parse(await get('/users/@me/guilds?limit=200', t)),
    member: async (g, u) =>
      z
        .object({ roles: z.array(z.string()) })
        .parse(await botRead(Routes.guildMember(g, u))),
    channels: async (g) =>
      z.array(ChannelSchema).parse(await botRead(Routes.guildChannels(g))),
    roles: async (g) =>
      z.array(RoleSchema).parse(await botRead(Routes.guildRoles(g))),
    emojis: async (g) =>
      z.array(GuildEmojiSchema).parse(await botRead(Routes.guildEmojis(g))),
  };
}
