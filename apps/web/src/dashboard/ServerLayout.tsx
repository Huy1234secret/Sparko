import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { EmptyState, Icon } from '../ui';
import { moduleById } from '../content/modules';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useActiveModuleId, useCurrentServer } from './shared';

/** Full-height frame for every dashboard page, with the sample-data notice. */
export function DashboardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="sp-dash">
      <p className="sp-preview-bar" role="note">
        <Icon name="info" size="sm" />
        Preview with sample data. Nothing here is sent to Discord yet.
      </p>
      {children}
    </div>
  );
}

export function ServerLayout() {
  const { ticketNumber } = useParams();
  const moduleId = useActiveModuleId();
  const { serverId, server, servers } = useCurrentServer();
  const [navPath, setNavPath] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  // The mobile menu belongs to the page it was opened on.
  const navOpen = navPath === pathname;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === 'Escape') setNavPath(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    document.querySelector('.sp-main')?.scrollTo?.(0, 0);
  }, [pathname]);

  if (servers.isPending)
    return (
      <DashboardFrame>
        <div className="sp-app" aria-busy="true" aria-label="Loading">
          <div className="sp-main">
            <div className="sp-content">
              <span className="sp-skel sp-skel--title" />
            </div>
          </div>
        </div>
      </DashboardFrame>
    );
  if (!server)
    return (
      <DashboardFrame>
        <div className="sp-app">
          <main className="sp-main">
            <div className="sp-content" style={{ maxWidth: 720 }}>
              <div className="sp-card">
                <EmptyState
                  icon="lock"
                  title="You can’t manage this server"
                  actions={
                    <Link className="sp-btn sp-btn--secondary" to="/dashboard">
                      <Icon name="arrow-left" />
                      Back to your servers
                    </Link>
                  }
                >
                  Sparko isn’t in it, or you need the Manage Server permission
                  there.
                </EmptyState>
              </div>
            </div>
          </main>
        </div>
      </DashboardFrame>
    );

  const module = moduleId ? moduleById(moduleId) : undefined;
  const crumbs = (
    <nav aria-label="Breadcrumb">
      <ol className="sp-crumbs">
        <li className="sp-topbar__desktop-only">
          <Link className="sp-crumb" to={`/dashboard/${server.id}`}>
            {server.name}
          </Link>
          <Icon name="chevron-right" />
        </li>
        {module && (
          <li className="sp-topbar__desktop-only sp-crumbs__mid">
            <span className="sp-crumb">{module.group}</span>
            <Icon name="chevron-right" />
          </li>
        )}
        {ticketNumber && (
          <li className="sp-topbar__desktop-only">
            <Link className="sp-crumb" to={`/dashboard/${server.id}/tickets`}>
              Tickets
            </Link>
            <Icon name="chevron-right" />
          </li>
        )}
        <li>
          <span className="sp-crumb" aria-current="page">
            {ticketNumber
              ? `Ticket #${ticketNumber}`
              : (module?.label ?? (moduleId ? 'Not found' : 'Overview'))}
          </span>
        </li>
      </ol>
    </nav>
  );

  return (
    <DashboardFrame>
      <div className="sp-app">
        <Sidebar
          server={server}
          open={navOpen}
          onClose={() => setNavPath(null)}
        />
        <main className="sp-main" id="main">
          <Topbar
            crumbs={crumbs}
            onMenu={() => setNavPath(pathname)}
            onSearch={() => setSearchOpen(true)}
          />
          <div className="sp-content">
            <Outlet
              key={`${serverId}/${moduleId ?? ''}/${ticketNumber ?? ''}`}
            />
          </div>
        </main>
      </div>
      <CommandPalette
        serverId={server.id}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </DashboardFrame>
  );
}
