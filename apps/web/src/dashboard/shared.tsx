import { useEffect, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import {
  useOverview,
  useServers,
  type ModuleHealth,
  type Overview,
  type Server,
} from '../data';
import { moduleById } from '../content/modules';

export const formatCount = (n: number) => n.toLocaleString('en-US');
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
export const planName = (server: Server) =>
  server.plan === 'plus' ? 'Plus' : 'Free';

/** A server's initials on its tint, the way the design shows servers. */
export function ServerMark({
  server,
  size,
  className,
}: {
  server: Pick<Server, 'name' | 'hue'>;
  size?: number;
  className?: string;
}) {
  const style = {
    '--h': server.hue,
    ...(size
      ? {
          '--size': `${size}px`,
          borderRadius: Math.round(size * 0.29),
          fontSize: Math.round(size * 0.4),
        }
      : {}),
  } as CSSProperties;
  return (
    <span
      className={
        'sp-server sp-server--tint' + (className ? ` ${className}` : '')
      }
      style={style}
      aria-hidden="true"
    >
      {initials(server.name)}
    </span>
  );
}

export function useServerId() {
  const { serverId = '' } = useParams();
  return serverId;
}
/** The server in the address, once the server list has loaded. */
export function useCurrentServer() {
  const serverId = useServerId();
  const servers = useServers();
  return {
    serverId,
    server: servers.data?.find((s) => s.id === serverId && s.installed),
    servers,
  };
}

/** Whether a module is live, off or needs a fix, as the overview reports it. */
export function moduleHealth(
  overview: Overview | undefined,
  moduleId: string,
): ModuleHealth {
  const highlight = overview?.highlights.find((h) => h.moduleId === moduleId);
  if (highlight) return highlight.status;
  return overview?.on[moduleId] ? 'live' : 'off';
}
export function useModuleHealth(serverId: string, moduleId: string) {
  return moduleHealth(useOverview(serverId).data, moduleId);
}

export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/** Sets the tab title for a dashboard page. */
export function useDashboardTitle(...parts: (string | undefined)[]) {
  const title = parts.filter(Boolean).join(' · ');
  useEffect(() => {
    document.title = title ? `${title} · Sparko` : 'Sparko';
  }, [title]);
}

export const moduleLabel = (id: string) => moduleById(id)?.label ?? id;
