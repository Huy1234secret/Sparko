import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adoptServers, mockApi } from './mock';
import { backend, withBackend } from './live';
import type {
  ModuleState,
  PanelApi,
  StudioMessage,
  TicketPanel,
  TicketPriority,
  WelcomeConfig,
} from './types';

export * from './types';

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
      client.invalidateQueries({ queryKey: keys.welcome(serverId) }),
      client.invalidateQueries({ queryKey: ['tickets', serverId] }),
      client.invalidateQueries({ queryKey: keys.studio(serverId) }),
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
export function useStudioActions(serverId: string) {
  const refresh = useRefresh(serverId);
  return {
    publish: useMutation({
      mutationFn: (message: StudioMessage) =>
        api.publishStudio(serverId, message),
      onSuccess: refresh,
    }),
    saveTemplate: useMutation({
      mutationFn: (t: { name: string; message: StudioMessage }) =>
        api.saveTemplate(serverId, t),
      onSuccess: refresh,
    }),
    deleteTemplate: useMutation({
      mutationFn: (id: string) => api.deleteTemplate(serverId, id),
      onSuccess: refresh,
    }),
  };
}
