import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  deleteSession,
  findSession,
  getGuild,
  installedGuildIds,
  saveSession,
  sealer,
  sha256,
  type Db,
  type StoredUser,
} from '@sparko/core';
import { cookies, json, redirect } from './http.ts';

/**
 * Discord sign-in and the signed-in person's servers, for the dashboard.
 * Sessions are stored (hashed, with the Discord token encrypted), so a
 * restart doesn't sign anyone out.
 */
export type AuthConfig = {
  db: Db;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  botToken?: string | undefined;
  /** The site's public origin, e.g. https://panel.coin-sprite.com */
  publicUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
};

type User = StoredUser;
export type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  approximate_member_count?: number;
};

const discord = 'https://discord.com/api/v10';
const sessionCookie = 'sparko_session';
const stateCookie = 'sparko_oauth_state';
const sessionDays = 7;
const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;
/**
 * What Sparko asks for when added to a server. Never Administrator:
 * view and send messages, embeds, files, history, reactions, external emoji,
 * manage messages, channels, roles and threads, kick, ban, time out, and
 * private threads for tickets.
 */
export const botPermissions = (
  [
    1n << 1n, // kick
    1n << 2n, // ban
    1n << 4n, // manage channels
    1n << 6n, // add reactions
    1n << 10n, // view channels
    1n << 11n, // send messages
    1n << 13n, // manage messages
    1n << 14n, // embed links
    1n << 15n, // attach files
    1n << 16n, // read message history
    1n << 18n, // use external emoji
    1n << 28n, // manage roles
    1n << 34n, // manage threads
    1n << 36n, // create private threads
    1n << 38n, // send messages in threads
    1n << 40n, // moderate members
  ] as const
).reduce((a, b) => a | b, 0n);

/** A tint from the server's id, for initials when it has no icon. */
const hueOf = (id: string) => Number(BigInt(id) % 360n);

export function createAuth(config: AuthConfig) {
  const http = config.fetch ?? fetch;
  const now = config.now ?? Date.now;
  const origin = new URL(config.publicUrl).origin;
  const secure = origin.startsWith('https:');
  const redirectUri = `${origin}/api/v1/auth/discord/callback`;
  const configured = !!(config.clientId && config.clientSecret);
  const { db } = config;
  const vault = sealer(config.clientSecret ?? 'sparko-dev');
  const guildCache = new Map<string, { at: number; list: DiscordGuild[] }>();
  let botGuilds: { at: number; ids: Set<string> } | undefined;

  const cookie = (name: string, value: string, maxAge: number) =>
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  /** The signed-in person, if any. */
  function current(req: IncomingMessage) {
    const raw = cookies(req)[sessionCookie];
    if (!raw) return undefined;
    const idHash = sha256(raw);
    const found = findSession(db, idHash, now());
    if (!found) return undefined;
    try {
      return { idHash, user: found.user, token: vault.open(found.tokenEnc) };
    } catch {
      // Sealed with an older secret: sign in again.
      deleteSession(db, idHash);
      return undefined;
    }
  }

  async function discordGet<T>(path: string, auth: string): Promise<T> {
    const res = await http(`${discord}${path}`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) throw new Error(`Discord ${path} answered ${res.status}`);
    return (await res.json()) as T;
  }

  /** Servers the bot is in, refreshed at most once a minute. */
  async function installedIds() {
    if (!config.botToken) return installedGuildIds(db);
    if (botGuilds && now() - botGuilds.at < 60_000) return botGuilds.ids;
    const ids = new Set<string>();
    let after = '0';
    for (;;) {
      const page = await discordGet<{ id: string }[]>(
        `/users/@me/guilds?limit=200&after=${after}`,
        `Bot ${config.botToken}`,
      );
      for (const g of page) ids.add(g.id);
      if (page.length < 200) break;
      after = page[page.length - 1]!.id;
    }
    botGuilds = { at: now(), ids };
    return ids;
  }

  async function userGuilds(session: { idHash: string; token: string }) {
    const hit = guildCache.get(session.idHash);
    if (hit && now() - hit.at < 30_000) return hit.list;
    const list = await discordGet<DiscordGuild[]>(
      '/users/@me/guilds?with_counts=true',
      `Bearer ${session.token}`,
    );
    guildCache.set(session.idHash, { at: now(), list });
    return list;
  }

  const canManage = (g: DiscordGuild) => {
    const p = BigInt(g.permissions);
    return g.owner || (p & MANAGE_GUILD) !== 0n || (p & ADMINISTRATOR) !== 0n;
  };

  /**
   * The signed-in person, if they may manage this server. Answers for the
   * API routes: 401 when signed out, 403 when they can't manage it.
   */
  async function access(req: IncomingMessage, guildId: string) {
    const session = current(req);
    if (!session) return { status: 401 as const };
    const guild = (await userGuilds(session)).find((g) => g.id === guildId);
    if (!guild || !canManage(guild)) return { status: 403 as const };
    return { status: 200 as const, user: session.user, guild };
  }

  async function callback(url: URL, req: IncomingMessage, res: ServerResponse) {
    const clear = cookie(stateCookie, '', 0);
    const error = url.searchParams.get('error');
    if (error)
      return redirect(
        res,
        `/signin?error=${error === 'access_denied' ? 'access_denied' : 'failed'}`,
        [clear],
      );
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!state || !code || cookies(req)[stateCookie] !== state)
      return redirect(res, '/signin?error=expired', [clear]);
    try {
      const token = await http(`${discord}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId!,
          client_secret: config.clientSecret!,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!token.ok) throw new Error(`token exchange answered ${token.status}`);
      const { access_token: accessToken, expires_in: expiresIn } =
        (await token.json()) as { access_token: string; expires_in: number };
      const me = await discordGet<{
        id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
      }>('/users/@me', `Bearer ${accessToken}`);
      const user: User = {
        id: me.id,
        name: me.global_name || me.username,
        avatarUrl: me.avatar
          ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(me.id) >> 22n) % 6n)}.png`,
      };
      const id = randomBytes(32).toString('base64url');
      const lifetime = Math.min(sessionDays * 86_400, expiresIn || Infinity);
      saveSession(db, {
        idHash: sha256(id),
        user,
        tokenEnc: vault.seal(accessToken),
        expiresAt: now() + lifetime * 1000,
      });
      return redirect(res, '/dashboard', [
        clear,
        cookie(sessionCookie, id, lifetime),
      ]);
    } catch (e) {
      console.error('Discord sign-in failed', e);
      return redirect(res, '/signin?error=failed', [clear]);
    }
  }

  /** Handles /api/v1/… requests. Returns false for anything else. */
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', origin);
    if (!url.pathname.startsWith('/api/')) return false;
    return api(url, req, res);
  }

  async function api(
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /api/v1/health')
      json(res, 200, { ok: true, signIn: configured });
    else if (route === 'GET /api/v1/session')
      json(res, 200, { user: current(req)?.user ?? null });
    else if (route === 'GET /api/v1/auth/discord') {
      if (!configured) {
        redirect(res, '/signin?error=not_configured');
        return true;
      }
      const state = randomBytes(16).toString('base64url');
      const to = new URL('https://discord.com/oauth2/authorize');
      to.search = new URLSearchParams({
        client_id: config.clientId!,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'identify guilds',
        state,
      }).toString();
      redirect(res, to.toString(), [cookie(stateCookie, state, 600)]);
    } else if (route === 'GET /api/v1/auth/discord/callback')
      await callback(url, req, res);
    else if (route === 'POST /api/v1/auth/logout') {
      // Only this site may sign people out (cookies alone don't prove it).
      if (req.headers.origin !== origin) {
        json(res, 403, { error: 'forbidden' });
        return true;
      }
      const found = current(req);
      if (found) {
        deleteSession(db, found.idHash);
        guildCache.delete(found.idHash);
      }
      res.writeHead(204, { 'Set-Cookie': cookie(sessionCookie, '', 0) });
      res.end();
    } else if (route === 'GET /api/v1/servers') {
      const found = current(req);
      if (!found) {
        json(res, 401, { error: 'signed_out' });
        return true;
      }
      try {
        const [guilds, installed] = await Promise.all([
          userGuilds(found),
          installedIds(),
        ]);
        json(
          res,
          200,
          guilds.filter(canManage).map((g) => {
            const saved = getGuild(db, g.id);
            return {
              id: g.id,
              name: g.name,
              hue: hueOf(g.id),
              members: g.approximate_member_count ?? saved?.memberCount ?? 0,
              plan: saved?.plan ?? 'free',
              installed: installed.has(g.id),
              ...(saved?.paused ? { paused: saved.paused } : {}),
              ...(g.icon
                ? {
                    icon: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`,
                  }
                : {}),
            };
          }),
        );
      } catch (e) {
        console.error('Loading servers failed', e);
        json(res, 502, { error: 'discord_unavailable' });
      }
    } else if (route === 'GET /api/v1/invite') {
      if (!config.clientId) {
        redirect(res, '/dashboard');
        return true;
      }
      const to = new URL('https://discord.com/oauth2/authorize');
      const guild = url.searchParams.get('guild');
      to.search = new URLSearchParams({
        client_id: config.clientId,
        scope: 'bot applications.commands',
        permissions: botPermissions.toString(),
        ...(guild && /^\d{1,25}$/.test(guild)
          ? { guild_id: guild, disable_guild_select: 'true' }
          : {}),
      }).toString();
      redirect(res, to.toString());
    } else return false;
    return true;
  }

  return { handle, configured, access, current };
}
