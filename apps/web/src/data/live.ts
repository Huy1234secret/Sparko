import type { BdEntry, EvEvent, EvRsvp, TvRoom } from './studio-format';
import type {
  ARMemberView,
  BDMemberFound,
  INVDetail,
  INVFound,
  LVDetail,
  LVFound,
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
export type Backend = {
  live: boolean;
  signIn: boolean;
  /** Whether the dashboard is open to everyone yet. */
  dashboardOpen: boolean;
  /** When it opens to everyone, if a date is set. */
  dashboardOpensAt: string | null;
};

let probe: Promise<Backend> | undefined;
const offline: Backend = {
  live: false,
  signIn: false,
  dashboardOpen: true,
  dashboardOpensAt: null,
};

export function backend(): Promise<Backend> {
  probe ??= fetch('/api/v1/health', { headers: { accept: 'application/json' } })
    .then(async (res) => {
      // Without a backend the address serves the app's HTML instead.
      if (!res.ok || !res.headers.get('content-type')?.includes('json'))
        return offline;
      const body = (await res.json()) as {
        signIn?: unknown;
        dashboard?: { open?: unknown; opensAt?: unknown };
      };
      return {
        live: true,
        signIn: body.signIn === true,
        // An older server without the field has an open dashboard.
        dashboardOpen: body.dashboard?.open !== false,
        dashboardOpensAt:
          typeof body.dashboard?.opensAt === 'string'
            ? body.dashboard.opensAt
            : null,
      };
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
  const { user, allowed } = await getJson<{
    user: { id: string; name: string; avatarUrl: string } | null;
    allowed?: boolean;
  }>('/api/v1/session');
  return user
    ? ({
        user: { ...user, avatarColor: colourOf(user.id) },
        allowed: allowed !== false,
      } as Session)
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
    async getSuggestions(id) {
      if (!(await backend()).live) return sample.getSuggestions(id);
      return getJson(`${server(id)}/suggestions`);
    },
    async saveSuggestions(id, change) {
      if (!(await backend()).live) return sample.saveSuggestions(id, change);
      await call('PUT', `${server(id)}/suggestions`, change);
    },
    async listSuggestions(id, filter) {
      if (!(await backend()).live) return sample.listSuggestions(id, filter);
      return getJson(
        `${server(id)}/suggestions/list?q=${encodeURIComponent(filter.query)}&status=${encodeURIComponent(filter.status)}`,
      );
    },
    async deleteSuggestion(id, number) {
      if (!(await backend()).live) return sample.deleteSuggestion(id, number);
      await call('DELETE', `${server(id)}/suggestions/${number}`);
    },
    async testSuggestion(id, channel) {
      if (!(await backend()).live) return sample.testSuggestion(id, channel);
      await call('POST', `${server(id)}/suggestions/test`, { channel });
    },
    async getBirthdays(id) {
      if (!(await backend()).live) return sample.getBirthdays(id);
      return getJson(`${server(id)}/birthdays`);
    },
    async saveBirthdays(id, change) {
      if (!(await backend()).live) return sample.saveBirthdays(id, change);
      await call('PUT', `${server(id)}/birthdays`, change);
    },
    async listBirthdays(id, query) {
      if (!(await backend()).live) return sample.listBirthdays(id, query);
      return getJson(
        `${server(id)}/birthdays/list?q=${encodeURIComponent(query)}`,
      );
    },
    async findBirthdayMembers(id, query) {
      if (!(await backend()).live) return sample.findBirthdayMembers(id, query);
      const r = await getJson<{ members: BDMemberFound[] }>(
        `${server(id)}/birthdays/members?q=${encodeURIComponent(query)}`,
      );
      return r.members;
    },
    async setBirthday(id, userId, date) {
      if (!(await backend()).live) return sample.setBirthday(id, userId, date);
      const r = await call<{ birthday: BdEntry }>(
        'PUT',
        `${server(id)}/birthdays/members/${userId}`,
        date,
      );
      return r.birthday;
    },
    async removeBirthday(id, userId) {
      if (!(await backend()).live) return sample.removeBirthday(id, userId);
      await call('DELETE', `${server(id)}/birthdays/members/${userId}`);
    },
    async testBirthday(id, channel, kind) {
      if (!(await backend()).live)
        return sample.testBirthday(id, channel, kind);
      await call('POST', `${server(id)}/birthdays/test`, { channel, kind });
    },
    async getQuestions(id) {
      if (!(await backend()).live) return sample.getQuestions(id);
      return getJson(`${server(id)}/questions`);
    },
    async saveQuestions(id, change) {
      if (!(await backend()).live) return sample.saveQuestions(id, change);
      await call('PUT', `${server(id)}/questions`, change);
    },
    async listQuestions(id, filter) {
      if (!(await backend()).live) return sample.listQuestions(id, filter);
      return getJson(
        `${server(id)}/questions/list?q=${encodeURIComponent(filter.query)}&status=${encodeURIComponent(filter.status)}`,
      );
    },
    async deleteQuestion(id, number) {
      if (!(await backend()).live) return sample.deleteQuestion(id, number);
      await call('DELETE', `${server(id)}/questions/${number}`);
    },
    async testQuestion(id, channel, which) {
      if (!(await backend()).live)
        return sample.testQuestion(id, channel, which);
      await call('POST', `${server(id)}/questions/test`, { channel, which });
    },
    async getStarboard(id) {
      if (!(await backend()).live) return sample.getStarboard(id);
      return getJson(`${server(id)}/starboard`);
    },
    async saveStarboard(id, change) {
      if (!(await backend()).live) return sample.saveStarboard(id, change);
      await call('PUT', `${server(id)}/starboard`, change);
    },
    async listStarred(id, filter) {
      if (!(await backend()).live) return sample.listStarred(id, filter);
      return getJson(
        `${server(id)}/starboard/list?board=${encodeURIComponent(filter.board)}&sort=${filter.sort}&q=${encodeURIComponent(filter.query)}`,
      );
    },
    async removeStarred(id, e) {
      if (!(await backend()).live) return sample.removeStarred(id, e);
      await call(
        'DELETE',
        `${server(id)}/starboard/entries/${encodeURIComponent(e.boardId)}/${e.messageId}`,
      );
    },
    async freezeStarred(id, e, frozen) {
      if (!(await backend()).live) return sample.freezeStarred(id, e, frozen);
      await call(
        'POST',
        `${server(id)}/starboard/entries/${encodeURIComponent(e.boardId)}/${e.messageId}/freeze`,
        { frozen },
      );
    },
    async blockStarboard(id, target) {
      if (!(await backend()).live) return sample.blockStarboard(id, target);
      await call('POST', `${server(id)}/starboard/blocked`, target);
    },
    async unblockStarboard(id, kind, target) {
      if (!(await backend()).live)
        return sample.unblockStarboard(id, kind, target);
      await call('DELETE', `${server(id)}/starboard/blocked/${kind}/${target}`);
    },
    async testStarboard(id, board, channel) {
      if (!(await backend()).live)
        return sample.testStarboard(id, board, channel);
      await call('POST', `${server(id)}/starboard/test`, { board, channel });
    },
    async getPolls(id) {
      if (!(await backend()).live) return sample.getPolls(id);
      return getJson(`${server(id)}/polls`);
    },
    async savePolls(id, change) {
      if (!(await backend()).live) return sample.savePolls(id, change);
      await call('PUT', `${server(id)}/polls`, change);
    },
    async listPolls(id) {
      if (!(await backend()).live) return sample.listPolls(id);
      return getJson(`${server(id)}/polls/list`);
    },
    async createPoll(id, draft) {
      if (!(await backend()).live) return sample.createPoll(id, draft);
      return call('POST', `${server(id)}/polls`, { draft });
    },
    async endPoll(id, poll) {
      if (!(await backend()).live) return sample.endPoll(id, poll);
      await call('POST', `${server(id)}/polls/${poll}/end`);
    },
    async rerollPoll(id, poll) {
      if (!(await backend()).live) return sample.rerollPoll(id, poll);
      return call('POST', `${server(id)}/polls/${poll}/reroll`);
    },
    async postPollNow(id, poll) {
      if (!(await backend()).live) return sample.postPollNow(id, poll);
      await call('POST', `${server(id)}/polls/${poll}/post`);
    },
    async deletePoll(id, poll) {
      if (!(await backend()).live) return sample.deletePoll(id, poll);
      await call('DELETE', `${server(id)}/polls/${poll}`);
    },
    async pollVoters(id, poll) {
      if (!(await backend()).live) return sample.pollVoters(id, poll);
      return getJson(`${server(id)}/polls/${poll}/voters`);
    },
    async testPoll(id, channel, kind) {
      if (!(await backend()).live) return sample.testPoll(id, channel, kind);
      await call('POST', `${server(id)}/polls/test`, { channel, kind });
    },
    async getInvites(id) {
      if (!(await backend()).live) return sample.getInvites(id);
      return getJson(`${server(id)}/invites`);
    },
    async saveInvites(id, change) {
      if (!(await backend()).live) return sample.saveInvites(id, change);
      await call('PUT', `${server(id)}/invites`, change);
    },
    async inviteLeaderboard(id, query, page) {
      if (!(await backend()).live)
        return sample.inviteLeaderboard(id, query, page);
      return getJson(
        `${server(id)}/invites/leaderboard?q=${encodeURIComponent(query)}&page=${page}`,
      );
    },
    async inviteMember(id, userId) {
      if (!(await backend()).live) return sample.inviteMember(id, userId);
      return getJson(`${server(id)}/invites/members/${userId}`);
    },
    async inviteCodes(id) {
      if (!(await backend()).live) return sample.inviteCodes(id);
      return getJson(`${server(id)}/invites/codes`);
    },
    async findInviteMembers(id, query) {
      if (!(await backend()).live) return sample.findInviteMembers(id, query);
      const r = await getJson<{ members: INVFound[] }>(
        `${server(id)}/invites/find?q=${encodeURIComponent(query)}`,
      );
      return r.members;
    },
    async giveInviteBonus(id, userId, amount) {
      if (!(await backend()).live)
        return sample.giveInviteBonus(id, userId, amount);
      return call<INVDetail>(
        'POST',
        `${server(id)}/invites/members/${userId}/bonus`,
        { amount },
      );
    },
    async resetInvites(id, userId) {
      if (!(await backend()).live) return sample.resetInvites(id, userId);
      await call(
        'POST',
        userId
          ? `${server(id)}/invites/members/${userId}/reset`
          : `${server(id)}/invites/reset`,
      );
    },
    async testInvite(id, channel, kind) {
      if (!(await backend()).live) return sample.testInvite(id, channel, kind);
      await call('POST', `${server(id)}/invites/test`, { channel, kind });
    },
    async getLevels(id) {
      if (!(await backend()).live) return sample.getLevels(id);
      return getJson(`${server(id)}/levels`);
    },
    async saveLevels(id, change) {
      if (!(await backend()).live) return sample.saveLevels(id, change);
      await call('PUT', `${server(id)}/levels`, change);
    },
    async levelLeaderboard(id, query, page) {
      if (!(await backend()).live)
        return sample.levelLeaderboard(id, query, page);
      return getJson(
        `${server(id)}/levels/leaderboard?q=${encodeURIComponent(query)}&page=${page}`,
      );
    },
    async levelMember(id, userId) {
      if (!(await backend()).live) return sample.levelMember(id, userId);
      return getJson(`${server(id)}/levels/members/${userId}`);
    },
    async levelCrates(id) {
      if (!(await backend()).live) return sample.levelCrates(id);
      return getJson(`${server(id)}/levels/crates`);
    },
    async findLevelMembers(id, query) {
      if (!(await backend()).live) return sample.findLevelMembers(id, query);
      const r = await getJson<{ members: LVFound[] }>(
        `${server(id)}/levels/find?q=${encodeURIComponent(query)}`,
      );
      return r.members;
    },
    async changeXp(id, userId, mode, amount) {
      if (!(await backend()).live)
        return sample.changeXp(id, userId, mode, amount);
      return call<LVDetail>(
        'POST',
        `${server(id)}/levels/members/${userId}/xp`,
        {
          mode,
          amount,
        },
      );
    },
    async resetXp(id, userId) {
      if (!(await backend()).live) return sample.resetXp(id, userId);
      await call(
        'POST',
        userId
          ? `${server(id)}/levels/members/${userId}/reset`
          : `${server(id)}/levels/reset`,
      );
    },
    async testLevels(id, channel, kind) {
      if (!(await backend()).live) return sample.testLevels(id, channel, kind);
      await call('POST', `${server(id)}/levels/test`, { channel, kind });
    },
    async getEvents(id) {
      if (!(await backend()).live) return sample.getEvents(id);
      return getJson(`${server(id)}/events`);
    },
    async saveEvents(id, change) {
      if (!(await backend()).live) return sample.saveEvents(id, change);
      await call('PUT', `${server(id)}/events`, change);
    },
    async listEvents(id, when) {
      if (!(await backend()).live) return sample.listEvents(id, when);
      const r = await getJson<{ events: EvEvent[] }>(
        `${server(id)}/events/items?when=${when}`,
      );
      return r.events;
    },
    async createEvent(id, details) {
      if (!(await backend()).live) return sample.createEvent(id, details);
      const r = await call<{ event: EvEvent }>(
        'POST',
        `${server(id)}/events/items`,
        details,
      );
      return r.event;
    },
    async updateEvent(id, number, details) {
      if (!(await backend()).live)
        return sample.updateEvent(id, number, details);
      const r = await call<{ event: EvEvent }>(
        'PUT',
        `${server(id)}/events/items/${number}`,
        details,
      );
      return r.event;
    },
    async cancelEvent(id, number) {
      if (!(await backend()).live) return sample.cancelEvent(id, number);
      await call('POST', `${server(id)}/events/items/${number}/cancel`);
    },
    async deleteEvent(id, number) {
      if (!(await backend()).live) return sample.deleteEvent(id, number);
      await call('DELETE', `${server(id)}/events/items/${number}`);
    },
    async listRsvps(id, number) {
      if (!(await backend()).live) return sample.listRsvps(id, number);
      const r = await getJson<{ rsvps: EvRsvp[] }>(
        `${server(id)}/events/items/${number}/rsvps`,
      );
      return r.rsvps;
    },
    async setNoShow(id, number, userId, noShow) {
      if (!(await backend()).live)
        return sample.setNoShow(id, number, userId, noShow);
      await call(
        'PUT',
        `${server(id)}/events/items/${number}/rsvps/${userId}`,
        {
          noShow,
        },
      );
    },
    async testEvent(id, channel, kind) {
      if (!(await backend()).live) return sample.testEvent(id, channel, kind);
      await call('POST', `${server(id)}/events/test`, { channel, kind });
    },
    async getTempVoice(id) {
      if (!(await backend()).live) return sample.getTempVoice(id);
      return getJson(`${server(id)}/temp-voice`);
    },
    async saveTempVoice(id, change) {
      if (!(await backend()).live) return sample.saveTempVoice(id, change);
      await call('PUT', `${server(id)}/temp-voice`, change);
    },
    async postVoicePanel(id) {
      if (!(await backend()).live) return sample.postVoicePanel(id);
      return call('POST', `${server(id)}/temp-voice/panel`);
    },
    async listVoiceRooms(id) {
      if (!(await backend()).live) return sample.listVoiceRooms(id);
      const r = await getJson<{ rooms: TvRoom[] }>(
        `${server(id)}/temp-voice/rooms`,
      );
      return r.rooms;
    },
    async closeVoiceRoom(id, channelId) {
      if (!(await backend()).live) return sample.closeVoiceRoom(id, channelId);
      await call('DELETE', `${server(id)}/temp-voice/rooms/${channelId}`);
    },
    async listVoicePrefs(id, query) {
      if (!(await backend()).live) return sample.listVoicePrefs(id, query);
      return getJson(
        `${server(id)}/temp-voice/prefs?q=${encodeURIComponent(query)}`,
      );
    },
    async resetVoicePrefs(id, userId) {
      if (!(await backend()).live) return sample.resetVoicePrefs(id, userId);
      await call('DELETE', `${server(id)}/temp-voice/prefs/${userId}`);
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
