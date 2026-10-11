import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useRouteError,
} from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronsUpDown,
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
  LayoutGrid,
  LifeBuoy,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import {
  Breadcrumbs,
  ErrorState,
  LoadingState,
  Badge,
  Notice,
} from '@sparko/ui';
import { getSession, loginUrl, logout } from '../services/session';
import { getGuilds, type Guild } from '../services/guilds';
import { groupNames, modules } from '../content/modules';
import { routeTitle, routeTrail } from './routeMeta';
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
const signinProblems: Record<string, { title: string; text: string }> = {
  cancelled: {
    title: 'Sign-in was cancelled',
    text: 'Discord did not share your account because the request was declined. Nothing was changed.',
  },
  expired: {
    title: 'That sign-in attempt expired',
    text: 'Sign-in links work once and for a few minutes. Start again below.',
  },
  failed: {
    title: 'Discord did not finish signing you in',
    text: 'This is usually temporary. Try again in a moment.',
  },
};
export function RequireSession() {
  const session = useSession();
  const { pathname, search } = useLocation();
  const problem =
    signinProblems[new URLSearchParams(search).get('signin') ?? ''];
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
        {problem && (
          <div role="alert" className="auth-problem">
            <Notice tone="warning" title={problem.title}>
              {problem.text}
            </Notice>
          </div>
        )}
        <span className="empty-icon" aria-hidden="true">
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

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Other paths that belong to this item (Studio sections, ticket pages). */
  group?: string;
};
const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Start',
    items: [
      { label: 'Overview', path: '', icon: LayoutDashboard },
      { label: 'Guided setup', path: '/setup', icon: Sparkles },
    ],
  },
  {
    label: 'Manage',
    items: [
      {
        label: 'Tickets & support',
        path: '/support/tickets',
        icon: Ticket,
        group: '/support/',
      },
      { label: 'Engagement', path: '/engagement', icon: Zap },
      { label: 'Community', path: '/community', icon: Users },
      { label: 'Safety', path: '/safety', icon: Shield },
      { label: 'Automation', path: '/automations', icon: Bell },
    ],
  },
  {
    label: 'Create & review',
    items: [
      {
        label: 'Message Studio',
        path: '/messages/studio',
        icon: MessageSquare,
        group: '/messages/',
      },
      {
        label: 'Insights',
        path: '/insights/analytics',
        icon: BarChart3,
        group: '/insights',
      },
      { label: 'Server settings', path: '/settings', icon: Settings },
    ],
  },
];
/** Same section on another server; record IDs never carry across servers. */
export function switchPath(
  pathname: string,
  from: string | undefined,
  to: string,
) {
  const prefix = `/dashboard/${from}`;
  if (!from || !pathname.startsWith(prefix)) return `/dashboard/${to}`;
  const rest = pathname.slice(prefix.length);
  const ticketRecord =
    rest.startsWith('/support/tickets/') && rest !== '/support/tickets/config';
  return `/dashboard/${to}${ticketRecord ? '/support/tickets' : rest}`;
}
function ServerSwitcher({
  guilds,
  current,
  label,
}: {
  guilds: Guild[];
  current?: Guild | undefined;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const panel = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        setOpen(false);
        button.current?.focus();
      } else if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const ready = guilds.filter((guild) => guild.installed && guild.manageable);
  return (
    <div className="server-switcher" ref={root}>
      <button
        ref={button}
        type="button"
        className="server-switch"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
      >
        <span className="server-avatar" aria-hidden="true">
          {current?.iconUrl ? (
            <img src={current.iconUrl} alt="" />
          ) : (
            (current?.name ?? label).slice(0, 1)
          )}
        </span>
        <span>
          <span className="truncate" title={current?.name ?? label}>
            {current?.name ?? label}
          </span>
          <small>{current ? 'Switch server' : 'Choose a server'}</small>
        </span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="server-menu" id={panel}>
          <p className="nav-label">Servers you manage</p>
          {ready.length ? (
            <ul>
              {ready.map((guild) => (
                <li key={guild.id}>
                  <Link
                    to={switchPath(pathname, current?.id, guild.id)}
                    aria-current={guild.id === current?.id ? 'true' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <span className="server-avatar" aria-hidden="true">
                      {guild.iconUrl ? (
                        <img src={guild.iconUrl} alt="" />
                      ) : (
                        guild.name.slice(0, 1)
                      )}
                    </span>
                    <span className="truncate" title={guild.name}>
                      {guild.name}
                    </span>
                    {guild.id === current?.id && (
                      <Check size={16} aria-label="Current server" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">
              No server with Sparko installed that you can manage yet.
            </p>
          )}
          <Link
            to="/dashboard"
            className="server-menu-all"
            onClick={() => setOpen(false)}
          >
            <LayoutGrid size={16} aria-hidden="true" />
            All servers and invitations
          </Link>
        </div>
      )}
    </div>
  );
}
/** Jump to any page of the current server by name (Ctrl/⌘ + K). */
function ToolFinder({ guildId }: { guildId: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  const base = `/dashboard/${guildId}`;
  const pages = [
    { name: 'Overview', group: 'Start', to: base },
    { name: 'Guided setup', group: 'Start', to: `${base}/setup` },
    { name: 'Ticket inbox', group: 'Tickets', to: `${base}/support/tickets` },
    {
      name: 'Ticket settings',
      group: 'Tickets',
      to: `${base}/support/tickets/config`,
    },
    {
      name: 'Message Studio',
      group: 'Messages',
      to: `${base}/messages/studio`,
    },
    {
      name: 'Template library',
      group: 'Messages',
      to: `${base}/messages/templates`,
    },
    {
      name: 'Publication inventory',
      group: 'Messages',
      to: `${base}/messages/publications`,
    },
    { name: 'Analytics', group: 'Insights', to: `${base}/insights/analytics` },
    {
      name: 'Your member profile',
      group: 'Member',
      to: `/servers/${guildId}/me`,
    },
    ...modules.map((module) => ({
      name: module.name,
      group: groupNames[module.group] ?? module.group,
      description: module.description,
      to: `${base}/${module.group}/${module.slug}`,
    })),
  ];
  const needle = term.trim().toLowerCase();
  const results = pages
    .filter((page) =>
      `${page.name} ${page.group} ${'description' in page ? page.description : ''}`
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, 12);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTerm('');
      }}
    >
      <Dialog.Trigger asChild>
        <button type="button" className="header-search">
          <Search size={16} aria-hidden="true" />
          <span>Find a page or tool</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content finder">
          <Dialog.Title>Find a page or tool</Dialog.Title>
          <Dialog.Description className="field-hint">
            Type a name such as “levels”, “tickets” or “welcome”, then choose a
            result.
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const first = results[0];
              if (!first) return;
              setOpen(false);
              setTerm('');
              void navigate(first.to);
            }}
          >
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input
                autoFocus
                aria-label="Search pages and tools"
                placeholder="Search pages and tools…"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              />
            </label>
          </form>
          <ul className="finder-results" aria-live="polite">
            {results.map((page) => (
              <li key={page.to}>
                <Link
                  to={page.to}
                  onClick={() => {
                    setOpen(false);
                    setTerm('');
                  }}
                >
                  <span>
                    <strong>{page.name}</strong>
                    {'description' in page && <small>{page.description}</small>}
                  </span>
                  <Badge>{page.group}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          {!results.length && (
            <p className="muted">
              No page matches “{term}”. Try a shorter word.
            </p>
          )}
          <Dialog.Close className="icon-button mobile-close" aria-label="Close">
            <X />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
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
  const main = useRef<HTMLElement>(null);
  const firstRoute = useRef(true);
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
  const trail = routeTrail(pathname, guild?.name);
  const title = routeTitle(trail, guild?.name);
  useEffect(() => {
    document.title = title;
  }, [title]);
  // Move focus to the new page so screen readers announce it; keep it on first load.
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    // A page that already placed focus (a deep-linked section) keeps it.
    const active = document.activeElement;
    if (active && active !== main.current && main.current?.contains(active))
      return;
    const heading = main.current?.querySelector<HTMLElement>('h1');
    const target = heading ?? main.current;
    if (!target) return;
    if (heading) heading.tabIndex = -1;
    target.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);
  const closeMenu = () => ui.setSidebarOpen(false);
  const menu = (
    <>
      <div className="sidebar-top">
        <Logo />
        <ServerSwitcher
          guilds={guilds.data ?? []}
          current={guild}
          label={
            isOwner
              ? 'Owner workspace'
              : isAccount
                ? 'Your account'
                : 'Choose a server'
          }
        />
      </div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        {guildId ? (
          navSections.map((section) => (
            <div key={section.label} className="nav-section">
              <p className="nav-label">{section.label}</p>
              {section.items.map(({ label, path, icon: Icon, group }) => (
                <NavLink
                  key={path}
                  to={`/dashboard/${guildId}${path}`}
                  end={path === ''}
                  className={({ isActive }) =>
                    isActive ||
                    (group &&
                      pathname.startsWith(`/dashboard/${guildId}${group}`))
                      ? 'active'
                      : ''
                  }
                  onClick={closeMenu}
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))
        ) : (
          <div className="nav-section">
            <p className="nav-label">Your workspace</p>
            <NavLink to="/dashboard" end onClick={closeMenu}>
              <LayoutDashboard size={18} aria-hidden="true" />
              Your servers
            </NavLink>
            <NavLink to="/account/preferences" onClick={closeMenu}>
              <Settings size={18} aria-hidden="true" />
              Preferences
            </NavLink>
            <NavLink to="/account/privacy" onClick={closeMenu}>
              <Shield size={18} aria-hidden="true" />
              Privacy & data
            </NavLink>
            <NavLink to="/account/support" onClick={closeMenu}>
              <LifeBuoy size={18} aria-hidden="true" />
              Product support
            </NavLink>
          </div>
        )}
        {guildId && (
          <div className="nav-section">
            <p className="nav-label">As a member</p>
            <NavLink to={`/servers/${guildId}/me`} onClick={closeMenu}>
              <UserRound size={18} aria-hidden="true" />
              Your member profile
            </NavLink>
          </div>
        )}
        {session.data?.capabilities.some(
          (c) => c.startsWith('fleet.') || c.startsWith('diagnostics.'),
        ) && (
          <div className="nav-section nav-section-owner">
            <p className="nav-label">Sparko operators</p>
            <NavLink to="/owner" onClick={closeMenu}>
              <Crown size={18} aria-hidden="true" />
              Owner console
            </NavLink>
          </div>
        )}
      </nav>
      <div className="sidebar-bottom">
        <Link to="/docs">
          <BookOpen size={17} aria-hidden="true" />
          Help & documentation
          <ExternalLink size={13} aria-hidden="true" />
        </Link>
        <div className="user-row">
          <span className="user-avatar" aria-hidden="true">
            {session.data?.user?.username.slice(0, 1)}
          </span>
          <Link to="/account" onClick={closeMenu}>
            <span className="truncate">{session.data?.user?.username}</span>
            <small>Your account</small>
          </Link>
          <button
            aria-label="Sign out"
            title="Sign out"
            className="icon-button"
            disabled={exit.isPending}
            onClick={() => exit.mutate()}
          >
            <LogOut size={17} />
          </button>
        </div>
        {exit.error && (
          <p className="field-error" role="alert">
            {errorMessage(exit.error)}
          </p>
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
          <div className="row header-trail">
            <button
              ref={mobileNavigationTrigger}
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => ui.setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <Breadcrumbs
              items={trail}
              renderLink={(crumb) => <Link to={crumb.to}>{crumb.label}</Link>}
            />
          </div>
          <div className="row">
            {guildId && <ToolFinder guildId={guildId} />}
            <ThemePicker />
            <Link
              className="icon-button"
              to="/account/support"
              aria-label="Get support"
              title="Get support"
            >
              <CircleHelp size={19} />
            </Link>
          </div>
        </header>
        <main
          id="main-content"
          ref={main}
          tabIndex={-1}
          className="workspace-content"
        >
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Small details. Better communities.</span>
          <Link to="/status">
            Service status <Globe size={13} aria-hidden="true" />
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
      <Badge
        tone={
          revision === 0
            ? 'neutral'
            : revision === appliedRevision
              ? 'success'
              : 'warning'
        }
      >
        {revision === 0
          ? 'Not saved yet'
          : revision === appliedRevision
            ? 'Live'
            : 'Waiting for the bot'}
      </Badge>
      {revision > 0 && (
        <span
          title={`Saved revision ${revision}; the bot has applied revision ${appliedRevision}.`}
        >
          Version {revision}
          {revision !== appliedRevision &&
            ` · bot on version ${appliedRevision}`}
        </span>
      )}
    </div>
  );
}
