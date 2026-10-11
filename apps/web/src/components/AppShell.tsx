import { useEffect, useRef, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useParams,
  useRouteError,
} from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Ticket,
  Users,
  X,
  Zap,
  Bell,
  BarChart3,
  MessageSquare,
  Globe,
  Search,
  Crown,
} from 'lucide-react';
import { ErrorState, LoadingState, Badge } from '@sparko/ui';
import { getSession, loginUrl, logout } from '../services/session';
import { getGuilds } from '../services/guilds';
import { errorMessage } from '../services/http';
import { useUi } from '../state/ui';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => getSession(signal),
    staleTime: 60000,
    retry: false,
  });
}
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="logo" aria-label="Sparko home">
      <span className="logo-mark">
        <Zap fill="currentColor" size={23} strokeWidth={2.4} />
      </span>
      {!compact && (
        <span>
          Sparko<span className="logo-dot">.</span>
        </span>
      )}
    </Link>
  );
}
export function ThemePicker() {
  const { theme, setTheme } = useUi();
  return (
    <button
      className="icon-button"
      aria-label={`Theme: ${theme}. Change theme`}
      title={`Theme: ${theme}`}
      onClick={() =>
        setTheme(
          theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark',
        )
      }
    >
      {theme === 'light' ? (
        <Sun size={19} />
      ) : theme === 'dark' ? (
        <Moon size={19} />
      ) : (
        <Settings size={19} />
      )}
    </button>
  );
}
export function AppRoot() {
  const { theme, motion } = useUi();
  const { pathname } = useLocation();
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.motion = motion;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, motion]);
  useEffect(() => {
    const privateRoute = /^\/(dashboard|account|owner|servers)/.test(pathname);
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = privateRoute ? 'noindex,nofollow' : 'index,follow';
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `https://panel.coin-sprite.com${pathname}`;
  }, [pathname]);
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Outlet />
    </>
  );
}
export function PublicShell() {
  const session = useSession();
  const [mobileOpen, setMobileOpen] = [
    useUi((s) => s.sidebarOpen),
    useUi((s) => s.setSidebarOpen),
  ];
  const links = (
    <>
      <NavLink to="/features">Features</NavLink>
      <NavLink to="/commands">Commands</NavLink>
      <NavLink to="/docs">Docs</NavLink>
      <NavLink to="/support">Support</NavLink>
    </>
  );
  return (
    <div className="public-shell">
      <header className="public-header container">
        <Logo />
        <nav aria-label="Main navigation" className="public-nav">
          {links}
        </nav>
        <div className="row header-actions">
          <ThemePicker />
          <Link
            className="button button-secondary desktop-only"
            to={session.data?.user ? '/dashboard' : loginUrl()}
          >
            Open dashboard <ArrowUpRight size={15} />
          </Link>
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <button
                className="icon-button mobile-only"
                aria-label="Open navigation"
              >
                <Menu size={22} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="mobile-navigation">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Close
                  className="icon-button mobile-close"
                  aria-label="Close navigation"
                >
                  <X />
                </Dialog.Close>
                <Logo />
                <nav onClick={() => setMobileOpen(false)}>
                  {links}
                  <Link to="/dashboard">Open dashboard</Link>
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <footer className="public-footer container">
        <div>
          <Logo />
          <p>
            A little spark.
            <br />A better place to belong.
          </p>
        </div>
        <div className="footer-links">
          <Link to="/docs">Documentation</Link>
          <Link to="/status">Service status</Link>
          <Link to="/changelog">Changelog</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
        <p className="footer-note">
          Made for communities, with care.
          <br />
          <span>© {new Date().getFullYear()} Sparko</span>
        </p>
      </footer>
    </div>
  );
}
export function RequireSession() {
  const session = useSession();
  const { pathname } = useLocation();
  if (session.isPending) return <LoadingState label="Checking your session…" />;
  if (session.error)
    return (
      <div className="container auth-gate">
        <ErrorState
          message={errorMessage(session.error)}
          retry={() => void session.refetch()}
        />
      </div>
    );
  if (!session.data?.user)
    return (
      <div className="auth-gate">
        <Logo />
        <span className="empty-icon">
          <Shield size={30} />
        </span>
        <p className="eyebrow">Your community starts here</p>
        <h1>Welcome to your workspace.</h1>
        <p>
          Sign in with Discord to choose a server, shape its tools, and keep
          everything in sync.
        </p>
        <a className="button button-primary" href={loginUrl(pathname)}>
          Continue with Discord <ArrowUpRight size={17} />
        </a>
        <p className="field-hint">
          Sparko requests your profile and server list. Your Discord password
          stays with Discord.
        </p>
        <Link to="/privacy">How we use your data</Link>
      </div>
    );
  return <Outlet />;
}

const nav = [
  { label: 'Overview', path: '', icon: LayoutDashboard },
  { label: 'Guided setup', path: '/setup', icon: Sparkles },
  { label: 'Engagement', path: '/engagement', icon: Zap },
  { label: 'Community', path: '/community', icon: Users },
  { label: 'Tickets & support', path: '/support/tickets', icon: Ticket },
  { label: 'Safety', path: '/safety', icon: Shield },
  {
    label: 'Message Studio',
    path: '/messages/studio',
    icon: MessageSquare,
    group: '/messages/',
  },
  { label: 'Automation', path: '/automations', icon: Bell },
  { label: 'Insights', path: '/insights/analytics', icon: BarChart3 },
  { label: 'Server settings', path: '/settings', icon: Settings },
];
export function DashboardShell() {
  const { guildId } = useParams();
  const { pathname } = useLocation();
  const session = useSession();
  const guilds = useQuery({
    queryKey: ['guilds'],
    queryFn: ({ signal }) => getGuilds(signal),
    staleTime: 60000,
  });
  const guild = guilds.data?.find((g) => g.id === guildId);
  const ui = useUi();
  const mobileNavigationTrigger = useRef<HTMLButtonElement>(null);
  const query = useQueryClient();
  const exit = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      query.clear();
      window.location.assign('/');
    },
  });
  const isOwner = pathname.startsWith('/owner');
  const isAccount = pathname.startsWith('/account');
  const menu = (
    <>
      <div className="sidebar-top">
        <Logo />
        <Link to="/dashboard" className="server-switch">
          <span className="server-avatar">
            {guild?.name.slice(0, 1) ?? 'S'}
          </span>
          <span>
            {guild?.name ??
              (isOwner
                ? 'Owner workspace'
                : isAccount
                  ? 'Your account'
                  : 'Choose a server')}
            <small>{guild ? 'Server workspace' : 'Sparko workspace'}</small>
          </span>
          <ChevronDown size={16} />
        </Link>
      </div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        <p className="nav-label">WORKSPACE</p>
        {guildId ? (
          nav.map(({ label, path, icon: Icon, group }) => (
            <NavLink
              key={path}
              to={`/dashboard/${guildId}${path}`}
              end={path === ''}
              className={({ isActive }) =>
                isActive ||
                (group && pathname.startsWith(`/dashboard/${guildId}${group}`))
                  ? 'active'
                  : ''
              }
              onClick={() => ui.setSidebarOpen(false)}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))
        ) : (
          <>
            <NavLink to="/dashboard">
              <LayoutDashboard size={18} />
              Your servers
            </NavLink>
            <NavLink to="/account/preferences">
              <Settings size={18} />
              Preferences
            </NavLink>
            <NavLink to="/account/privacy">
              <Shield size={18} />
              Privacy & data
            </NavLink>
            <NavLink to="/account/support">
              <Ticket size={18} />
              Product support
            </NavLink>
          </>
        )}
        {session.data?.capabilities.some(
          (c) => c.startsWith('fleet.') || c.startsWith('diagnostics.'),
        ) && (
          <NavLink to="/owner">
            <Crown size={18} />
            Owner console
          </NavLink>
        )}
      </nav>
      <div className="sidebar-bottom">
        <Link to="/docs">
          <BookOpen size={17} />
          Help & documentation <ExternalLink size={13} />
        </Link>
        <div className="user-row">
          <span className="user-avatar">
            {session.data?.user?.username.slice(0, 1)}
          </span>
          <Link to="/account">
            {session.data?.user?.username}
            <small>Your account</small>
          </Link>
          <button
            aria-label="Sign out"
            className="icon-button"
            disabled={exit.isPending}
            onClick={() => exit.mutate()}
          >
            <LogOut size={17} />
          </button>
        </div>
        {exit.error && (
          <p className="field-error">{errorMessage(exit.error)}</p>
        )}
      </div>
    </>
  );
  return (
    <div className="dashboard-shell">
      <aside className="sidebar desktop-only">{menu}</aside>
      <Dialog.Root open={ui.sidebarOpen} onOpenChange={ui.setSidebarOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="sidebar mobile-sidebar"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              mobileNavigationTrigger.current?.focus();
            }}
          >
            <Dialog.Title className="sr-only">
              Workspace navigation
            </Dialog.Title>
            <Dialog.Close
              className="icon-button mobile-close"
              aria-label="Close navigation"
            >
              <X />
            </Dialog.Close>
            {menu}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="dashboard-body">
        <header className="workspace-header">
          <div className="row">
            <button
              ref={mobileNavigationTrigger}
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => ui.setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span className="workspace-breadcrumb">
              <Link to="/dashboard">Workspace</Link>
              <span>/</span>
              <strong>
                {guild?.name ??
                  (isOwner
                    ? 'Owner console'
                    : isAccount
                      ? 'Account'
                      : 'Your servers')}
              </strong>
            </span>
          </div>
          <div className="row">
            <Link
              to="/features"
              className="header-search"
              aria-label="Find a module"
            >
              <Search size={16} />
              Explore modules
            </Link>
            <ThemePicker />
            <Link
              className="icon-button"
              to="/account/support"
              aria-label="Get support"
            >
              <CircleHelp size={19} />
            </Link>
          </div>
        </header>
        <main id="main-content" className="workspace-content">
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Small details. Better communities.</span>
          <Link to="/status">
            Service status <Globe size={13} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
export function RouteError() {
  const error = useRouteError();
  return (
    <div className="auth-gate">
      <Logo />
      <h1>We couldn’t open this page.</h1>
      <p>{errorMessage(error)}</p>
      <Link className="button button-primary" to="/dashboard">
        <ArrowLeft size={16} />
        Back to workspace
      </Link>
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="card metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
export function RuntimeState({
  revision,
  appliedRevision,
}: {
  revision: number;
  appliedRevision: number;
}) {
  return (
    <div className="runtime-state">
      <Badge tone={revision === appliedRevision ? 'success' : 'warning'}>
        {revision === appliedRevision ? 'Applied' : 'Pending runtime'}
      </Badge>
      <span>
        Saved r{revision} · Applied r{appliedRevision}
      </span>
    </div>
  );
}
