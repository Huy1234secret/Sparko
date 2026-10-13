import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { mockApi } from './mock';
import type { ModuleState, PanelApi, WelcomeConfig } from './types';

export * from './types';

/** Sample data until the backend is reconnected; swap this for the HTTP client. */
export const api: PanelApi = mockApi;
export const usingSampleData = true;

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
};

export const useSession = () =>
  useQuery({ queryKey: keys.session, queryFn: () => api.getSession() });
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
