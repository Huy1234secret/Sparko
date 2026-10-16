import type {
  ARMemberView,
  AvatarColor,
  PanelApi,
  Server,
  Session,
} from './types';

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

const problems: Record<string, string> = {
  signed_out: 'You’ve been signed out. Sign in again to keep going.',
  not_allowed: 'You need the Manage Server permission in this server.',
  not_installed: 'Sparko isn’t in this server any more.',
  forbidden: 'That request didn’t come from the dashboard.',
};

async function call<T>(method: string, path: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: {
      accept: 'application/json',
      // Dates come back in the viewer's own time zone.
      'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const info = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(
      info.message ??
        problems[info.error ?? ''] ??
        `The server answered ${res.status}. Try again in a moment.`,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
const getJson = <T>(path: string) => call<T>('GET', path);

const server = (id: string) => `/api/v1/servers/${id}`;

const colourOf = (id: string) =>
  ((Number(id.slice(-4)) % 6) + 1) as AvatarColor;

/**
 * The person signed in to the real backend, or null when they're signed out
 * or there's no backend. The public site uses this on its own, so it never
 * mistakes the dashboard's sample account for a real one.
 */
export async function liveSession(): Promise<Session | null> {
  if (!(await backend()).live) return null;
  const { user } = await getJson<{
    user: { id: string; name: string; avatarUrl: string } | null;
  }>('/api/v1/session');
  return user
    ? ({ user: { ...user, avatarColor: colourOf(user.id) } } as Session)
    : null;
}

/** Signs out of the real backend. */
export async function liveSignOut() {
  await fetch('/api/v1/auth/logout', { method: 'POST' });
}

export function withBackend(
  sample: PanelApi,
  adoptServers: (servers: Server[]) => void,
): PanelApi {
  return {
    ...sample,
    async getSession() {
      if (!(await backend()).live) return sample.getSession();
      return liveSession();
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
      await liveSignOut();
    },
    async getOverview(id) {
      if (!(await backend()).live) return sample.getOverview(id);
      return getJson(`${server(id)}/overview`);
    },
    async skipStep(id, stepId, skipped) {
      if (!(await backend()).live) return sample.skipStep(id, stepId, skipped);
      await call('PUT', `${server(id)}/steps/${stepId}`, { skipped });
    },
    async checkHealth(id) {
      if (!(await backend()).live) return sample.checkHealth(id);
      return getJson(`${server(id)}/health`);
    },
    async getModule(id, moduleId) {
      if (!(await backend()).live) return sample.getModule(id, moduleId);
      return getJson(`${server(id)}/modules/${moduleId}`);
    },
    async saveModule(id, moduleId, state) {
      if (!(await backend()).live)
        return sample.saveModule(id, moduleId, state);
      await call('PUT', `${server(id)}/modules/${moduleId}`, state);
    },
    async waitForApply(id, moduleId, options) {
      if (!(await backend()).live)
        return sample.waitForApply(id, moduleId, options);
      return call(
        options?.retry ? 'POST' : 'GET',
        `${server(id)}/modules/${moduleId}/apply`,
      );
    },
    async getWelcome(id) {
      if (!(await backend()).live) return sample.getWelcome(id);
      return getJson(`${server(id)}/welcome`);
    },
    async saveWelcome(id, change) {
      if (!(await backend()).live) return sample.saveWelcome(id, change);
      await call('PUT', `${server(id)}/welcome`, change);
    },
    async getTickets(id) {
      if (!(await backend()).live) return sample.getTickets(id);
      return getJson(`${server(id)}/tickets`);
    },
    async saveTickets(id, change) {
      if (!(await backend()).live) return sample.saveTickets(id, change);
      await call('PUT', `${server(id)}/tickets`, change);
    },
    async listTickets(id) {
      if (!(await backend()).live) return sample.listTickets(id);
      return getJson(`${server(id)}/tickets/list`);
    },
    async getTicket(id, n) {
      if (!(await backend()).live) return sample.getTicket(id, n);
      return getJson(`${server(id)}/tickets/${n}`);
    },
    async sendTicketMessage(id, n, message) {
      if (!(await backend()).live)
        return sample.sendTicketMessage(id, n, message);
      await call('POST', `${server(id)}/tickets/${n}/messages`, message);
    },
    async updateTicket(id, n, change) {
      if (!(await backend()).live) return sample.updateTicket(id, n, change);
      await call('PATCH', `${server(id)}/tickets/${n}`, change);
    },
    async closeTicket(id, n, close) {
      if (!(await backend()).live) return sample.closeTicket(id, n, close);
      await call('POST', `${server(id)}/tickets/${n}/close`, close);
    },
    async reopenTicket(id, n) {
      if (!(await backend()).live) return sample.reopenTicket(id, n);
      await call('POST', `${server(id)}/tickets/${n}/reopen`);
    },
    async getAutoRoles(id) {
      if (!(await backend()).live) return sample.getAutoRoles(id);
      return getJson(`${server(id)}/autoroles`);
    },
    async saveAutoRoles(id, change) {
      if (!(await backend()).live) return sample.saveAutoRoles(id, change);
      await call('PUT', `${server(id)}/autoroles`, change);
    },
    async searchARMembers(id, query) {
      if (!(await backend()).live) return sample.searchARMembers(id, query);
      const r = await getJson<{ members: ARMemberView[] }>(
        `${server(id)}/autoroles/members?q=${encodeURIComponent(query)}`,
      );
      return r.members;
    },
    async editARMember(id, userId, edit) {
      if (!(await backend()).live) return sample.editARMember(id, userId, edit);
      const r = await call<{ member: ARMemberView }>(
        'PATCH',
        `${server(id)}/autoroles/members/${userId}`,
        edit,
      );
      return r.member;
    },
    async wipeARMember(id, userId) {
      if (!(await backend()).live) return sample.wipeARMember(id, userId);
      const r = await call<{ member: ARMemberView | null }>(
        'DELETE',
        `${server(id)}/autoroles/members/${userId}`,
      );
      return r.member;
    },
    async getReactionRoles(id) {
      if (!(await backend()).live) return sample.getReactionRoles(id);
      return getJson(`${server(id)}/reaction-roles`);
    },
    async addReactionRole(id, name) {
      if (!(await backend()).live) return sample.addReactionRole(id, name);
      return call<{ id: string }>('POST', `${server(id)}/reaction-roles`, {
        name,
      });
    },
    async saveReactionRole(id, rrId, change) {
      if (!(await backend()).live)
        return sample.saveReactionRole(id, rrId, change);
      await call('PATCH', `${server(id)}/reaction-roles/${rrId}`, change);
    },
    async cloneReactionRole(id, rrId) {
      if (!(await backend()).live) return sample.cloneReactionRole(id, rrId);
      return call<{ id: string }>(
        'POST',
        `${server(id)}/reaction-roles/${rrId}/clone`,
      );
    },
    async deleteReactionRole(id, rrId) {
      if (!(await backend()).live) return sample.deleteReactionRole(id, rrId);
      await call('DELETE', `${server(id)}/reaction-roles/${rrId}`);
    },
    async getStudio(id) {
      if (!(await backend()).live) return sample.getStudio(id);
      return getJson(`${server(id)}/studio`);
    },
    async publishStudio(id, message) {
      if (!(await backend()).live) return sample.publishStudio(id, message);
      await call('PUT', `${server(id)}/studio`, message);
    },
    async saveTemplate(id, template) {
      if (!(await backend()).live) return sample.saveTemplate(id, template);
      return call<{ id: string }>(
        'POST',
        `${server(id)}/studio/templates`,
        template,
      );
    },
    async updateTemplate(id, templateId, change) {
      if (!(await backend()).live)
        return sample.updateTemplate(id, templateId, change);
      await call(
        'PATCH',
        `${server(id)}/studio/templates/${templateId}`,
        change,
      );
    },
    async cloneTemplate(id, templateId) {
      if (!(await backend()).live) return sample.cloneTemplate(id, templateId);
      await call('POST', `${server(id)}/studio/templates/${templateId}/clone`);
    },
    async deleteTemplate(id, templateId) {
      if (!(await backend()).live) return sample.deleteTemplate(id, templateId);
      await call('DELETE', `${server(id)}/studio/templates/${templateId}`);
    },
    async addFolder(id, folder) {
      if (!(await backend()).live) return sample.addFolder(id, folder);
      await call('POST', `${server(id)}/studio/folders`, folder);
    },
    async renameFolder(id, folderId, name) {
      if (!(await backend()).live)
        return sample.renameFolder(id, folderId, name);
      await call('PATCH', `${server(id)}/studio/folders/${folderId}`, { name });
    },
    async deleteFolder(id, folderId) {
      if (!(await backend()).live) return sample.deleteFolder(id, folderId);
      await call('DELETE', `${server(id)}/studio/folders/${folderId}`);
    },
    async postStudioTest(id, message) {
      if (!(await backend()).live) return sample.postStudioTest(id, message);
      await call('POST', `${server(id)}/studio/test`, message);
    },
    async editStudioMessage(id, message, link) {
      if (!(await backend()).live)
        return sample.editStudioMessage(id, message, link);
      await call('POST', `${server(id)}/studio/edit`, { message, link });
    },
    async uploadImage(id, file) {
      if (!(await backend()).live) return sample.uploadImage(id, file);
      const res = await fetch(`${server(id)}/studio/uploads`, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      const info = (await res.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
      };
      if (!res.ok || !info.url)
        throw new Error(
          info.message ?? 'The picture didn’t upload. Try again.',
        );
      return info.url;
    },
    async listServerEmojis(id) {
      if (!(await backend()).live) return sample.listServerEmojis(id);
      return getJson(`${server(id)}/studio/emojis`);
    },
    async moveLibraryItem(id, move) {
      if (!(await backend()).live) return sample.moveLibraryItem(id, move);
      await call('POST', `${server(id)}/studio/library/move`, move);
    },
    async checkChannel(id, channelId) {
      if (!(await backend()).live) return sample.checkChannel(id, channelId);
      return (
        await call<{ ok: boolean }>(
          'POST',
          `${server(id)}/channels/${channelId}/check`,
        )
      ).ok;
    },
    async checkPermissions(id) {
      if (!(await backend()).live) return sample.checkPermissions(id);
      return (
        await call<{ ok: boolean }>('POST', `${server(id)}/permissions/check`)
      ).ok;
    },
  };
}

/** Where "Continue with Discord" and "Add Sparko" go on the real site. */
export const signInUrl = '/api/v1/auth/discord';
export const inviteUrl = (serverId?: string) =>
  `/api/v1/invite${serverId ? `?guild=${serverId}` : ''}`;
export const ticketTranscriptUrl = (serverId: string, n: number) =>
  `/api/v1/servers/${serverId}/tickets/${n}/transcript`;
