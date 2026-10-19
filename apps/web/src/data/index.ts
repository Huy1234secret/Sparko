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
  Questions,
  AutoRoles,
  BdKind,
  Birthdays,
  ReactionRole,
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
  ar: (id: string) => ['ar', id] as const,
  arMembers: (id: string, q: string) => ['ar', id, 'members', q] as const,
  qa: (id: string) => ['qa', id] as const,
  qaList: (id: string, q: string, status: string) =>
    ['qa', id, 'list', q, status] as const,
  sg: (id: string) => ['sg', id] as const,
  sgList: (id: string, q: string, status: string) =>
    ['sg', id, 'list', q, status] as const,
  bd: (id: string) => ['bd', id] as const,
  bdList: (id: string, q: string) => ['bd', id, 'list', q] as const,
  bdMembers: (id: string, q: string) => ['bd', id, 'members', q] as const,
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
      client.invalidateQueries({ queryKey: keys.qa(serverId) }),
      client.invalidateQueries({ queryKey: keys.welcome(serverId) }),
      client.invalidateQueries({ queryKey: ['tickets', serverId] }),
      client.invalidateQueries({ queryKey: keys.studio(serverId) }),
      client.invalidateQueries({ queryKey: keys.rr(serverId) }),
      client.invalidateQueries({ queryKey: keys.ar(serverId) }),
      client.invalidateQueries({ queryKey: keys.sg(serverId) }),
      client.invalidateQueries({ queryKey: keys.bd(serverId) }),
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
export * from './studio-format';
