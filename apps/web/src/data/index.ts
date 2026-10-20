import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adoptServers, mockApi } from './mock';
import { backend, withBackend } from './live';
import { applyMove } from './library';
import type {
  BDDate,
  LibraryMove,
  ModuleState,
  PanelApi,
  StudioMessage,
  StudioState,
  TicketPanel,
  TicketPriority,
} from './types';
import type {
  PollDraft,
  Polls,
  Questions,
  AutoRoles,
  BdKind,
  Birthdays,
  InvKind,
  Invites,
  EvDetails,
  EvKind,
  Events,
  ReactionRole,
  Starboard,
  TempVoice,
  Suggestions,
  WelcomeConfig,
} from './studio-format';

export * from './types';
export * from './library';

/** Real sign-in and servers where the backend runs; sample data for the rest. */
export const api: PanelApi = withBackend(mockApi, adoptServers);
export { backend, inviteUrl, signInUrl, ticketTranscriptUrl } from './live';
export const useBackend = () =>
  useQuery({ queryKey: ['backend'], queryFn: backend, staleTime: Infinity });

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

export const keys = {
  session: ['session'] as const,
  servers: ['servers'] as const,
  overview: (id: string) => ['overview', id] as const,
  module: (id: string, moduleId: string) => ['module', id, moduleId] as const,
  welcome: (id: string) => ['welcome', id] as const,
  ticketList: (id: string) => ['tickets', id, 'list'] as const,
  ticket: (id: string, n: number) => ['tickets', id, 'one', n] as const,
  ticketsConfig: (id: string) => ['tickets', id, 'config'] as const,
  studio: (id: string) => ['studio', id] as const,
  rr: (id: string) => ['rr', id] as const,
  polls: (id: string) => ['polls', id] as const,
  pollList: (id: string) => ['polls', id, 'list'] as const,
  pollVoters: (id: string, poll: number) =>
    ['polls', id, 'voters', poll] as const,
  ar: (id: string) => ['ar', id] as const,
  arMembers: (id: string, q: string) => ['ar', id, 'members', q] as const,
  qa: (id: string) => ['qa', id] as const,
  qaList: (id: string, q: string, status: string) =>
    ['qa', id, 'list', q, status] as const,
  sb: (id: string) => ['sb', id] as const,
  sbList: (id: string, board: string, sort: string, q: string) =>
    ['sb', id, 'list', board, sort, q] as const,
  sg: (id: string) => ['sg', id] as const,
  sgList: (id: string, q: string, status: string) =>
    ['sg', id, 'list', q, status] as const,
  bd: (id: string) => ['bd', id] as const,
  bdList: (id: string, q: string) => ['bd', id, 'list', q] as const,
  bdMembers: (id: string, q: string) => ['bd', id, 'members', q] as const,
  inv: (id: string) => ['inv', id] as const,
  invBoard: (id: string, q: string, page: number) =>
    ['inv', id, 'board', q, page] as const,
  invMember: (id: string, userId: string) =>
    ['inv', id, 'member', userId] as const,
  invCodes: (id: string) => ['inv', id, 'codes'] as const,
  invFind: (id: string, q: string) => ['inv', id, 'find', q] as const,
  ev: (id: string) => ['ev', id] as const,
  evList: (id: string, when: string) => ['ev', id, 'list', when] as const,
  evRsvps: (id: string, number: number) => ['ev', id, 'rsvps', number] as const,
  tv: (id: string) => ['tv', id] as const,
  tvRooms: (id: string) => ['tv', id, 'rooms'] as const,
  tvPrefs: (id: string, q: string) => ['tv', id, 'prefs', q] as const,
};

export const useSession = () =>
  useQuery({ queryKey: keys.session, queryFn: () => api.getSession() });
export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.signOut(),
    onSettled: () => client.clear(),
  });
}
export const useServers = () =>
  useQuery({ queryKey: keys.servers, queryFn: () => api.listServers() });
export const useOverview = (serverId: string) =>
  useQuery({
    queryKey: keys.overview(serverId),
    queryFn: () => api.getOverview(serverId),
  });
export const useModuleState = (serverId: string, moduleId: string) =>
  useQuery({
    queryKey: keys.module(serverId, moduleId),
    queryFn: () => api.getModule(serverId, moduleId),
  });
export const useWelcome = (serverId: string) =>
  useQuery({
    queryKey: keys.welcome(serverId),
    queryFn: () => api.getWelcome(serverId),
  });
/** After any save, the overview and sidebar re-read what is on. */
function useRefresh(serverId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.overview(serverId) }),
      client.invalidateQueries({ queryKey: ['module', serverId] }),
      client.invalidateQueries({ queryKey: keys.sb(serverId) }),
      client.invalidateQueries({ queryKey: keys.qa(serverId) }),
      client.invalidateQueries({ queryKey: keys.welcome(serverId) }),
      client.invalidateQueries({ queryKey: ['tickets', serverId] }),
      client.invalidateQueries({ queryKey: keys.studio(serverId) }),
      client.invalidateQueries({ queryKey: keys.rr(serverId) }),
      client.invalidateQueries({ queryKey: keys.ar(serverId) }),
      client.invalidateQueries({ queryKey: keys.sg(serverId) }),
      client.invalidateQueries({ queryKey: keys.bd(serverId) }),
      client.invalidateQueries({ queryKey: keys.polls(serverId) }),
      client.invalidateQueries({ queryKey: keys.inv(serverId) }),
      client.invalidateQueries({ queryKey: keys.ev(serverId) }),
      client.invalidateQueries({ queryKey: keys.tv(serverId) }),
    ]);
}

export function useSaveModule(serverId: string, moduleId: string) {
  const refresh = useRefresh(serverId);
  return useMutation({
    mutationFn: (next: ModuleState) => api.saveModule(serverId, moduleId, next),
    onSuccess: refresh,
  });
}
export function useSaveWelcome(serverId: string) {
  const refresh = useRefresh(serverId);
  return useMutation({
    mutationFn: (change: { on: boolean; config: WelcomeConfig }) =>
      api.saveWelcome(serverId, change),
    onSuccess: refresh,
  });
}
export function useSkipStep(serverId: string) {
  const refresh = useRefresh(serverId);
  return useMutation({
    mutationFn: ({ stepId, skipped }: { stepId: string; skipped: boolean }) =>
      api.skipStep(serverId, stepId, skipped),
    onSuccess: refresh,
  });
}
export function useCheckPermissions(serverId: string) {
  const refresh = useRefresh(serverId);
  return useMutation({
    mutationFn: () => api.checkPermissions(serverId),
    onSuccess: refresh,
  });
}
export function useCheckChannel(serverId: string) {
  const refresh = useRefresh(serverId);
  return useMutation({
    mutationFn: (channelId: string) => api.checkChannel(serverId, channelId),
    onSuccess: refresh,
  });
}

export const useTicketList = (serverId: string) =>
  useQuery({
    queryKey: keys.ticketList(serverId),
    queryFn: () => api.listTickets(serverId),
  });
export const useTicket = (serverId: string, number: number) =>
  useQuery({
    queryKey: keys.ticket(serverId, number),
    queryFn: () => api.getTicket(serverId, number),
    // A missing ticket stays missing; only retry other failures.
    retry: (count, error) => error.message !== 'Ticket not found' && count < 1,
  });
export const useTicketsConfig = (serverId: string) =>
  useQuery({
    queryKey: keys.ticketsConfig(serverId),
    queryFn: () => api.getTickets(serverId),
  });
export const useStudio = (serverId: string) =>
  useQuery({
    queryKey: keys.studio(serverId),
    queryFn: () => api.getStudio(serverId),
  });

export function useTicketActions(serverId: string, number: number) {
  const refresh = useRefresh(serverId);
  const options = { onSuccess: refresh };
  return {
    send: useMutation({
      mutationFn: (m: { text: string; note: boolean }) =>
        api.sendTicketMessage(serverId, number, m),
      ...options,
    }),
    update: useMutation({
      mutationFn: (change: {
        priority?: TicketPriority;
        assignee?: string | null;
      }) => api.updateTicket(serverId, number, change),
      ...options,
    }),
    close: useMutation({
      mutationFn: (c: { reason: string; detail: string; dm?: boolean }) =>
        api.closeTicket(serverId, number, c),
      ...options,
    }),
    reopen: useMutation({
      mutationFn: () => api.reopenTicket(serverId, number),
      ...options,
    }),
  };
}
export function useSaveTickets(serverId: string) {
  const refresh = useRefresh(serverId);
  return useMutation({
    mutationFn: (change: { on: boolean; panel: TicketPanel }) =>
      api.saveTickets(serverId, change),
    onSuccess: refresh,
  });
}
export const useServerEmojis = (serverId: string, enabled = true) =>
  useQuery({
    queryKey: ['emojis', serverId],
    queryFn: () => api.listServerEmojis(serverId),
    enabled,
    staleTime: 5 * 60_000,
  });
export function useStudioActions(serverId: string) {
  const refresh = useRefresh(serverId);
  const client = useQueryClient();
  const toRefresh = { onSuccess: refresh };
  return {
    publish: useMutation({
      mutationFn: (message: StudioMessage) =>
        api.publishStudio(serverId, message),
      ...toRefresh,
    }),
    saveTemplate: useMutation({
      mutationFn: (t: {
        name: string;
        message: StudioMessage;
        folderId: string | null;
      }) => api.saveTemplate(serverId, t),
      ...toRefresh,
    }),
    updateTemplate: useMutation({
      mutationFn: ({
        id,
        ...change
      }: {
        id: string;
        name?: string;
        message?: StudioMessage;
      }) => api.updateTemplate(serverId, id, change),
      ...toRefresh,
    }),
    cloneTemplate: useMutation({
      mutationFn: (id: string) => api.cloneTemplate(serverId, id),
      ...toRefresh,
    }),
    deleteTemplate: useMutation({
      mutationFn: (id: string) => api.deleteTemplate(serverId, id),
      ...toRefresh,
    }),
    addFolder: useMutation({
      mutationFn: (f: { name: string; parentId: string | null }) =>
        api.addFolder(serverId, f),
      ...toRefresh,
    }),
    renameFolder: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        api.renameFolder(serverId, id, name),
      ...toRefresh,
    }),
    deleteFolder: useMutation({
      mutationFn: (id: string) => api.deleteFolder(serverId, id),
      ...toRefresh,
    }),
    postTest: useMutation({
      mutationFn: (message: StudioMessage) =>
        api.postStudioTest(serverId, message),
      ...toRefresh,
    }),
    editMessage: useMutation({
      mutationFn: ({
        message,
        link,
      }: {
        message: StudioMessage;
        link: string;
      }) => api.editStudioMessage(serverId, message, link),
      ...toRefresh,
    }),
    upload: useMutation({
      mutationFn: (file: File) => api.uploadImage(serverId, file),
    }),
    // Shows the move straight away and puts it back if the server says no.
    move: useMutation({
      mutationFn: (move: LibraryMove) => api.moveLibraryItem(serverId, move),
      onMutate: async (move) => {
        await client.cancelQueries({ queryKey: keys.studio(serverId) });
        const before = client.getQueryData<StudioState>(keys.studio(serverId));
        if (before)
          client.setQueryData<StudioState>(keys.studio(serverId), {
            ...before,
            ...applyMove(before, move),
          });
        return { before };
      },
      onError: (_e, _move, context) => {
        if (context?.before)
          client.setQueryData(keys.studio(serverId), context.before);
      },
      onSettled: refresh,
    }),
  };
}
export const useAutoRoles = (serverId: string) =>
  useQuery({
    queryKey: keys.ar(serverId),
    queryFn: () => api.getAutoRoles(serverId),
  });
export function useSaveAutoRoles(serverId: string) {
  const refresh = useRefresh(serverId);
  return useMutation({
    mutationFn: (change: { on: boolean; config: AutoRoles }) =>
      api.saveAutoRoles(serverId, change),
    onSuccess: refresh,
  });
}
/** Members in Storage; nothing is listed until something is searched. */
export const useARMembers = (serverId: string, query: string) =>
  useQuery({
    queryKey: keys.arMembers(serverId, query.trim()),
    queryFn: () => api.searchARMembers(serverId, query.trim()),
    enabled: query.trim().length > 0,
  });
export function useARMemberActions(serverId: string) {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: keys.ar(serverId) });
  return {
    edit: useMutation({
      mutationFn: ({
        userId,
        ...edit
      }: {
        userId: string;
        servedMs?: number;
        boosts?: number;
      }) => api.editARMember(serverId, userId, edit),
      onSuccess: refresh,
    }),
    wipe: useMutation({
      mutationFn: (userId: string) => api.wipeARMember(serverId, userId),
      onSuccess: refresh,
    }),
  };
}
export const useReactionRoles = (serverId: string) =>
  useQuery({
    queryKey: keys.rr(serverId),
    queryFn: () => api.getReactionRoles(serverId),
  });
export function useRRActions(serverId: string) {
  const refresh = useRefresh(serverId);
  const options = { onSuccess: refresh };
  return {
    add: useMutation({
      mutationFn: (name: string) => api.addReactionRole(serverId, name),
      ...options,
    }),
    save: useMutation({
      mutationFn: ({
        id,
        ...change
      }: {
        id: string;
        name?: string;
        config?: ReactionRole;
      }) => api.saveReactionRole(serverId, id, change),
      ...options,
    }),
    clone: useMutation({
      mutationFn: (id: string) => api.cloneReactionRole(serverId, id),
      ...options,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.deleteReactionRole(serverId, id),
      ...options,
    }),
  };
}
export const useSuggestions = (serverId: string) =>
  useQuery({
    queryKey: keys.sg(serverId),
    queryFn: () => api.getSuggestions(serverId),
  });
/** Suggestions in Storage, filtered by what staff typed and picked. */
export const useSuggestionList = (
  serverId: string,
  query: string,
  status: string,
) =>
  useQuery({
    queryKey: keys.sgList(serverId, query.trim(), status),
    queryFn: () =>
      api.listSuggestions(serverId, { query: query.trim(), status }),
  });
export function useSuggestionActions(serverId: string) {
  const refresh = useRefresh(serverId);
  return {
    save: useMutation({
      mutationFn: (change: { on: boolean; config: Suggestions }) =>
        api.saveSuggestions(serverId, change),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (number: number) => api.deleteSuggestion(serverId, number),
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: (channel: string) => api.testSuggestion(serverId, channel),
    }),
  };
}
export const useBirthdays = (serverId: string) =>
  useQuery({
    queryKey: keys.bd(serverId),
    queryFn: () => api.getBirthdays(serverId),
  });
/** Saved birthdays and the next ones, matching what staff typed. */
export const useBirthdayList = (serverId: string, query: string) =>
  useQuery({
    queryKey: keys.bdList(serverId, query.trim()),
    queryFn: () => api.listBirthdays(serverId, query.trim()),
  });
/** Server members to add a birthday for; nothing until something is typed. */
export const useBirthdayMembers = (serverId: string, query: string) =>
  useQuery({
    queryKey: keys.bdMembers(serverId, query.trim()),
    queryFn: () => api.findBirthdayMembers(serverId, query.trim()),
    enabled: query.trim().length > 0,
  });
export function useBirthdayActions(serverId: string) {
  const refresh = useRefresh(serverId);
  return {
    save: useMutation({
      mutationFn: (change: { on: boolean; config: Birthdays }) =>
        api.saveBirthdays(serverId, change),
      onSuccess: refresh,
    }),
    set: useMutation({
      mutationFn: ({ userId, ...date }: BDDate & { userId: string }) =>
        api.setBirthday(serverId, userId, date),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (userId: string) => api.removeBirthday(serverId, userId),
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: ({ channel, kind }: { channel: string; kind: BdKind }) =>
        api.testBirthday(serverId, channel, kind),
    }),
  };
}
export const useQuestions = (serverId: string) =>
  useQuery({
    queryKey: keys.qa(serverId),
    queryFn: () => api.getQuestions(serverId),
  });
/** Questions in Storage, filtered by what staff typed and picked. */
export const useQuestionList = (
  serverId: string,
  query: string,
  status: string,
) =>
  useQuery({
    queryKey: keys.qaList(serverId, query.trim(), status),
    queryFn: () => api.listQuestions(serverId, { query: query.trim(), status }),
  });
export function useQuestionActions(serverId: string) {
  const refresh = useRefresh(serverId);
  return {
    save: useMutation({
      mutationFn: (change: { on: boolean; config: Questions }) =>
        api.saveQuestions(serverId, change),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (number: number) => api.deleteQuestion(serverId, number),
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: ({
        channel,
        which,
      }: {
        channel: string;
        which: 'question' | 'answer';
      }) => api.testQuestion(serverId, channel, which),
    }),
  };
}
export const useStarboard = (serverId: string) =>
  useQuery({
    queryKey: keys.sb(serverId),
    queryFn: () => api.getStarboard(serverId),
  });
/** Starred messages in Storage, for one board or all, sorted as picked. */
export const useStarredList = (
  serverId: string,
  filter: { board: string; sort: 'stars' | 'newest'; query: string },
) =>
  useQuery({
    queryKey: keys.sbList(
      serverId,
      filter.board,
      filter.sort,
      filter.query.trim(),
    ),
    queryFn: () =>
      api.listStarred(serverId, { ...filter, query: filter.query.trim() }),
  });
export function useStarboardActions(serverId: string) {
  const refresh = useRefresh(serverId);
  const options = { onSuccess: refresh };
  return {
    save: useMutation({
      mutationFn: (change: { on: boolean; config: Starboard }) =>
        api.saveStarboard(serverId, change),
      ...options,
    }),
    remove: useMutation({
      mutationFn: (e: { boardId: string; messageId: string }) =>
        api.removeStarred(serverId, e),
      ...options,
    }),
    freeze: useMutation({
      mutationFn: ({
        frozen,
        ...e
      }: {
        boardId: string;
        messageId: string;
        frozen: boolean;
      }) => api.freezeStarred(serverId, e, frozen),
      ...options,
    }),
    block: useMutation({
      mutationFn: (target: Parameters<typeof api.blockStarboard>[1]) =>
        api.blockStarboard(serverId, target),
      ...options,
    }),
    unblock: useMutation({
      mutationFn: ({ kind, id }: { kind: 'message' | 'member'; id: string }) =>
        api.unblockStarboard(serverId, kind, id),
      ...options,
    }),
    test: useMutation({
      mutationFn: ({ board, channel }: { board: string; channel: string }) =>
        api.testStarboard(serverId, board, channel),
    }),
  };
}
export const usePolls = (serverId: string) =>
  useQuery({
    queryKey: keys.polls(serverId),
    queryFn: () => api.getPolls(serverId),
  });
/** Every poll, running ones first; re-read often so the bars stay current. */
export const usePollList = (serverId: string) =>
  useQuery({
    queryKey: keys.pollList(serverId),
    queryFn: () => api.listPolls(serverId),
    refetchInterval: 15_000,
  });
export const usePollVoters = (serverId: string, poll: number | null) =>
  useQuery({
    queryKey: keys.pollVoters(serverId, poll ?? 0),
    queryFn: () => api.pollVoters(serverId, poll ?? 0),
    enabled: poll !== null,
  });
export function usePollActions(serverId: string) {
  const refresh = useRefresh(serverId);
  return {
    save: useMutation({
      mutationFn: (change: { on: boolean; config: Polls }) =>
        api.savePolls(serverId, change),
      onSuccess: refresh,
    }),
    create: useMutation({
      mutationFn: (draft: PollDraft) => api.createPoll(serverId, draft),
      onSuccess: refresh,
    }),
    end: useMutation({
      mutationFn: (id: number) => api.endPoll(serverId, id),
      onSuccess: refresh,
    }),
    reroll: useMutation({
      mutationFn: (id: number) => api.rerollPoll(serverId, id),
      onSuccess: refresh,
    }),
    postNow: useMutation({
      mutationFn: (id: number) => api.postPollNow(serverId, id),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api.deletePoll(serverId, id),
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: ({
        channel,
        kind,
      }: {
        channel: string;
        kind: 'poll' | 'results';
      }) => api.testPoll(serverId, channel, kind),
    }),
  };
}
export const useInvites = (serverId: string) =>
  useQuery({
    queryKey: keys.inv(serverId),
    queryFn: () => api.getInvites(serverId),
  });
/** A page of the leaderboard, or members matching what staff typed. */
export const useInviteBoard = (serverId: string, query: string, page: number) =>
  useQuery({
    queryKey: keys.invBoard(serverId, query.trim(), page),
    queryFn: () => api.inviteLeaderboard(serverId, query.trim(), page),
    placeholderData: (previous) => previous,
  });
/** A member's counts, who invited them and who they invited. */
export const useInviteMember = (serverId: string, userId: string | null) =>
  useQuery({
    queryKey: keys.invMember(serverId, userId ?? ''),
    queryFn: () => api.inviteMember(serverId, userId!),
    enabled: !!userId,
  });
export const useInviteCodes = (serverId: string) =>
  useQuery({
    queryKey: keys.invCodes(serverId),
    queryFn: () => api.inviteCodes(serverId),
  });
/** Server members to give a bonus to; nothing until something is typed. */
export const useInviteFind = (serverId: string, query: string) =>
  useQuery({
    queryKey: keys.invFind(serverId, query.trim()),
    queryFn: () => api.findInviteMembers(serverId, query.trim()),
    enabled: query.trim().length > 0,
  });
export function useInviteActions(serverId: string) {
  const refresh = useRefresh(serverId);
  return {
    save: useMutation({
      mutationFn: (change: { on: boolean; config: Invites }) =>
        api.saveInvites(serverId, change),
      onSuccess: refresh,
    }),
    bonus: useMutation({
      mutationFn: ({ userId, amount }: { userId: string; amount: number }) =>
        api.giveInviteBonus(serverId, userId, amount),
      onSuccess: refresh,
    }),
    reset: useMutation({
      mutationFn: (userId: string | null) => api.resetInvites(serverId, userId),
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: ({ channel, kind }: { channel: string; kind: InvKind }) =>
        api.testInvite(serverId, channel, kind),
    }),
  };
}
export const useEvents = (serverId: string) =>
  useQuery({
    queryKey: keys.ev(serverId),
    queryFn: () => api.getEvents(serverId),
  });
/** Upcoming or past events, with their counts. */
export const useEventList = (serverId: string, when: 'upcoming' | 'past') =>
  useQuery({
    queryKey: keys.evList(serverId, when),
    queryFn: () => api.listEvents(serverId, when),
  });
/** Everyone who answered one event; nothing while none is open. */
export const useEventRsvps = (serverId: string, number: number | null) =>
  useQuery({
    queryKey: keys.evRsvps(serverId, number ?? 0),
    queryFn: () => api.listRsvps(serverId, number!),
    enabled: number !== null,
  });
export function useEventActions(serverId: string) {
  const refresh = useRefresh(serverId);
  return {
    save: useMutation({
      mutationFn: (change: { on: boolean; config: Events }) =>
        api.saveEvents(serverId, change),
      onSuccess: refresh,
    }),
    create: useMutation({
      mutationFn: (details: EvDetails) => api.createEvent(serverId, details),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({
        number,
        details,
      }: {
        number: number;
        details: EvDetails;
      }) => api.updateEvent(serverId, number, details),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (number: number) => api.cancelEvent(serverId, number),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (number: number) => api.deleteEvent(serverId, number),
      onSuccess: refresh,
    }),
    noShow: useMutation({
      mutationFn: (v: { number: number; userId: string; noShow: boolean }) =>
        api.setNoShow(serverId, v.number, v.userId, v.noShow),
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: ({ channel, kind }: { channel: string; kind: EvKind }) =>
        api.testEvent(serverId, channel, kind),
    }),
  };
}
export const useTempVoice = (serverId: string) =>
  useQuery({
    queryKey: keys.tv(serverId),
    queryFn: () => api.getTempVoice(serverId),
  });
/** Open voice rooms, for Storage. */
export const useVoiceRooms = (serverId: string) =>
  useQuery({
    queryKey: keys.tvRooms(serverId),
    queryFn: () => api.listVoiceRooms(serverId),
  });
/** Members' saved room settings, matching what staff typed. */
export const useVoicePrefs = (serverId: string, query: string) =>
  useQuery({
    queryKey: keys.tvPrefs(serverId, query.trim()),
    queryFn: () => api.listVoicePrefs(serverId, query.trim()),
  });
export function useTempVoiceActions(serverId: string) {
  const refresh = useRefresh(serverId);
  return {
    save: useMutation({
      mutationFn: (change: { on: boolean; config: TempVoice }) =>
        api.saveTempVoice(serverId, change),
      onSuccess: refresh,
    }),
    post: useMutation({
      mutationFn: () => api.postVoicePanel(serverId),
      onSuccess: refresh,
    }),
    close: useMutation({
      mutationFn: (channelId: string) =>
        api.closeVoiceRoom(serverId, channelId),
      onSuccess: refresh,
    }),
    reset: useMutation({
      mutationFn: (userId: string) => api.resetVoicePrefs(serverId, userId),
      onSuccess: refresh,
    }),
  };
}
export * from './studio-format';
