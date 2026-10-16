import { useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { Button, useToast } from '../ui';
import { useTheme } from '../state/theme';
import { panelHost, supportServer } from './links';
import { useSparkBursts } from './motion';
import { AccountMenu, DashboardButton, useSiteSession } from './Account';

const navLinks = [
  ['/features', 'Features'],
  ['/pricing', 'Pricing'],
  ['/commands', 'Commands'],
  ['/docs', 'Docs'],
  ['/status', 'Status'],
] as const;

/** "Sign in" opens the dashboard sign-in; "Add to Discord" explains for now. */
export function useAccountActions() {
  const toast = useToast();
  const navigate = useNavigate();
  return {
    addBot: () =>
      toast({
        title: 'Discord would open here',
        body: 'You’d pick a server and approve only the permissions Sparko needs.',
      }),
    signIn: () => navigate('/signin'),
  };
}

export function Logo() {
  return (
    <Link to="/" className="sw-logo" aria-label="Sparko home">
      <img
        className="sw-logo__img"
        src="/brand/sparko-icon-64.png"
        width={32}
        height={32}
        alt=""
      />
      Sparko
    </Link>
  );
}

export function SiteLayout() {
  const { theme, toggle } = useTheme();
  const { addBot, signIn } = useAccountActions();
  const { pathname } = useLocation();
  useSparkBursts();
  const session = useSiteSession();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menu = menuPath === pathname;
  const setMenu = (open: boolean) => setMenuPath(open ? pathname : null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuPath(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  const links = navLinks.map(([to, label]) => (
    <NavLink key={to} to={to} className="sw-link">
      {label}
    </NavLink>
  ));
  return (
    <div className="sw">
      <a className="sp-btn sp-btn--primary sw-skip" href="#main">
        Skip to content
      </a>
      <header className="sw-nav">
        <div className="sw-wrap">
          <div className="sw-nav__row">
            <Logo />
            <nav className="sw-links" aria-label="Main">
              {links}
            </nav>
            <div className="sw-nav__end">
              <Button
                variant="ghost"
                iconOnly
                icon={theme === 'dark' ? 'sun' : 'moon'}
                aria-label={
                  theme === 'dark'
                    ? 'Switch to light theme'
                    : 'Switch to dark theme'
                }
                onClick={toggle}
              />
              {session ? (
                <>
                  <DashboardButton />
                  <AccountMenu session={session} onAddBot={addBot} />
                </>
              ) : (
                <>
                  <Button variant="ghost" className="sw-desk" onClick={signIn}>
                    Sign in with Discord
                  </Button>
                  <Button
                    variant="primary"
                    className="sw-desk"
                    onClick={addBot}
                  >
                    Add to Discord
                  </Button>
                </>
              )}
              <Button
                className="sw-menu-btn"
                iconOnly
                icon={menu ? 'x' : 'menu'}
                aria-label="Menu"
                aria-expanded={menu}
                aria-controls="mobile-menu"
                onClick={() => setMenu(!menu)}
              />
            </div>
          </div>
          <nav
            id="mobile-menu"
            className={'sw-sheet' + (menu ? ' is-open' : '')}
            aria-label="Mobile"
            hidden={!menu}
          >
            {links}
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {session ? (
                <>
                  <DashboardButton block />
                  <Button block icon="plus" onClick={addBot}>
                    Add Sparko to a server
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="primary" block onClick={addBot}>
                    Add to Discord
                  </Button>
                  <Button block onClick={signIn}>
                    Sign in with Discord
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <Outlet />
        <div className="sw-wrap" style={{ paddingBottom: 96 }}>
          <div className="sw-cta sw-reveal">
            <h2 className="sw-h2">Be live before your coffee cools.</h2>
            <p>
              Add Sparko, follow the checklist, and see every message before
              your members do.
            </p>
            <div className="sw-hero__ctas" style={{ justifyContent: 'center' }}>
              <Button
                size="lg"
                className="sw-btn-ink"
                icon="plus"
                onClick={addBot}
              >
                Add Sparko to Discord
              </Button>
              <a
                className="sp-btn sp-btn--lg sp-btn--ghost"
                style={{ color: 'var(--sp-on-brand)', textDecoration: 'none' }}
                href={supportServer}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ask in the support server
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="sw-footer">
        <div className="sw-wrap">
          <div className="sw-footer__grid">
            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <Logo />
              <p className="sw-body" style={{ maxWidth: '34ch', fontSize: 14 }}>
                The all-in-one Discord bot that explains itself.
              </p>
            </div>
            <div>
              <h3>Product</h3>
              <ul>
                <li>
                  <Link className="sw-link" to="/features">
                    Features
                  </Link>
                </li>
                <li>
                  <Link className="sw-link" to="/pricing">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link className="sw-link" to="/commands">
                    Commands
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3>Help</h3>
              <ul>
                <li>
                  <Link className="sw-link" to="/docs">
                    Docs
                  </Link>
                </li>
                <li>
                  <Link className="sw-link" to="/status">
                    Status
                  </Link>
                </li>
                <li>
                  <Link className="sw-link" to="/support">
                    Support
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3>Legal</h3>
              <ul>
                <li>
                  <Link className="sw-link" to="/privacy">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link className="sw-link" to="/terms">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="sw-footer__base">
            <span>© 2026 Sparko. Not affiliated with Discord Inc.</span>
            <span>{panelHost}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Sets the browser tab title for a page. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title
      ? `${title} · Sparko`
      : 'Sparko · The Discord bot that explains itself';
  }, [title]);
}
