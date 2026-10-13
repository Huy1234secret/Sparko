import type { AvatarColor, PanelApi, Server, Session } from './types';

/**
 * The real backend, where there is one. On the server, sign-in and the
 * server list come from Discord; everything else is still sample data.
 * Without a backend (local development, tests) it's all sample data.
 */
export type Backend = { live: boolean; signIn: boolean };

let probe: Promise<Backend> | undefined;
const offline: Backend = { live: false, signIn: false };

export function backend(): Promise<Backend> {
  probe ??= fetch('/api/v1/health', { headers: { accept: 'application/json' } })
    .then(async (res) => {
      // Without a backend the address serves the app's HTML instead.
      if (!res.ok || !res.headers.get('content-type')?.includes('json'))
        return offline;
      const body = (await res.json()) as { signIn?: unknown };
      return { live: true, signIn: body.signIn === true };
    })
    .catch(() => offline);
  return probe;
}
/** Tests use this to pretend a backend is (or isn't) there. */
export function resetBackend() {
  probe = undefined;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return (await res.json()) as T;
}

const colourOf = (id: string) =>
  ((Number(id.slice(-4)) % 6) + 1) as AvatarColor;

export function withBackend(
  sample: PanelApi,
  adoptServers: (servers: Server[]) => void,
): PanelApi {
  return {
    ...sample,
    async getSession() {
      if (!(await backend()).live) return sample.getSession();
      const { user } = await getJson<{
        user: { id: string; name: string; avatarUrl: string } | null;
      }>('/api/v1/session');
      return user
        ? ({ user: { ...user, avatarColor: colourOf(user.id) } } as Session)
        : null;
    },
    async listServers() {
      if (!(await backend()).live) return sample.listServers();
      const servers = await getJson<Server[]>('/api/v1/servers');
      // Module pages keep using sample settings, now for these servers.
      adoptServers(servers);
      return servers;
    },
    async signOut() {
      if (!(await backend()).live) return sample.signOut();
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    },
  };
}

/** Where "Continue with Discord" and "Add Sparko" go on the real site. */
export const signInUrl = '/api/v1/auth/discord';
export const inviteUrl = (serverId?: string) =>
  `/api/v1/invite${serverId ? `?guild=${serverId}` : ''}`;
