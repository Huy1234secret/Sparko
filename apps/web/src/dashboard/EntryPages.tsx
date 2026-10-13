import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, Icon, Notice, useToast } from '../ui';
import { useServers, useSession, type Server } from '../data';
import { useTheme } from '../state/theme';
import { DashboardFrame } from './ServerLayout';
import { AccountMenu, ThemeButton } from './Topbar';
import { formatCount, ServerMark, useDashboardTitle } from './shared';

export function SignInPage() {
  useDashboardTitle('Sign in');
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const signedOut = params.has('signedOut');
  const cancelled = params.get('error') === 'access_denied';
  const signIn = () => {
    setBusy(true);
    // Until the backend is reconnected, sign-in goes straight to the sample servers.
    setTimeout(() => navigate('/dashboard'), 600);
  };
  return (
    <main className="sp-signin sp-sparks" id="main">
      <div className="sp-signin__inner">
        <div className="sp-signin__top">
          <Link to="/" className="sp-brand-link sp-signin__brand">
            Sparko
          </Link>
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
        </div>
        <div className="sp-card sp-signin__card">
          <div style={{ display: 'grid', gap: 8 }}>
            <h1 className="sp-signin__title">Sign in to set up your server</h1>
            <p className="sp-page-head__desc">
              Use your Discord account. There’s no separate Sparko password.
            </p>
          </div>
          {cancelled && (
            <Notice tone="warning" title="You cancelled on Discord">
              Nothing was shared. Sign in again whenever you’re ready.
            </Notice>
          )}
          {signedOut && (
            <Notice tone="info" title="You’re signed out">
              Your settings are safe. Sign in again to keep going.
            </Notice>
          )}
          <Button
            variant="primary"
            size="lg"
            block
            icon="log-in"
            loading={busy}
            loadingLabel="Opening Discord…"
            onClick={signIn}
          >
            Continue with Discord
          </Button>
          <div className="sp-signin__sees">
            <b>Sparko will see</b>
            <span>
              <Icon name="circle-check" />
              Your username and avatar
            </span>
            <span>
              <Icon name="circle-check" />
              The servers you’re in, to show where you can manage Sparko
            </span>
            <span className="is-never">
              <Icon name="circle-x" />
              Never your messages, email or password
            </span>
          </div>
        </div>
        <p className="sp-hint" style={{ textAlign: 'center' }}>
          By signing in you agree to the <Link to="/terms">Terms</Link> and{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}

function ServerCard({ server, onAdd }: { server: Server; onAdd: () => void }) {
  const meta = `${formatCount(server.members)} members`;
  if (!server.installed)
    return (
      <div className="sp-card sp-server-card">
        <ServerMark server={server} />
        <span className="sp-server-card__name">{server.name}</span>
        <span className="sp-server-card__meta">{meta}</span>
        <span className="sp-server-card__end">
          <Button
            size="sm"
            icon="plus"
            onClick={onAdd}
            aria-label={`Add Sparko to ${server.name}`}
          >
            Add Sparko
          </Button>
        </span>
      </div>
    );
  return (
    <Link
      className="sp-card sp-card--interactive sp-server-card"
      to={`/dashboard/${server.id}`}
    >
      <ServerMark server={server} />
      <span className="sp-server-card__name">
        {server.name}
        {server.plan === 'plus' && (
          <Badge tone="plus" size="sm">
            Plus
          </Badge>
        )}
      </span>
      <span className="sp-server-card__meta">{meta}</span>
      <span className="sp-server-card__end">
        {server.paused && (
          <Badge tone="danger" pill dot>
            Paused
          </Badge>
        )}
        <Icon name="chevron-right" />
      </span>
    </Link>
  );
}

export function ServerPickerPage() {
  useDashboardTitle('Your servers');
  const session = useSession().data;
  const servers = useServers();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const list = (servers.data ?? []).filter((s) =>
    s.name.toLowerCase().includes(needle),
  );
  const withSparko = list.filter((s) => s.installed);
  const without = list.filter((s) => !s.installed);
  const addBot = () =>
    toast({
      title: 'Discord would open here',
      body: 'You’d pick a server and approve only the permissions Sparko needs.',
    });
  return (
    <DashboardFrame>
      <div className="sp-app">
        <main className="sp-main" id="main">
          <header className="sp-topbar" style={{ paddingLeft: 24 }}>
            <div className="sp-topbar__start">
              <Link to="/" className="sp-brand-link">
                Sparko
              </Link>
            </div>
            <div className="sp-topbar__end">
              <ThemeButton />
              <AccountMenu />
            </div>
          </header>
          <div className="sp-content" style={{ maxWidth: 1000 }}>
            <header className="sp-page-head">
              <div className="sp-page-head__text">
                {session && (
                  <div className="sp-page-head__eyebrow">
                    Signed in as {session.user.name}
                  </div>
                )}
                <h1 className="sp-page-head__title">Choose a server</h1>
                <p className="sp-page-head__desc">
                  These are the servers where you have the Manage Server
                  permission. Pick one to set up, or add Sparko to a new one.
                </p>
              </div>
            </header>
            <div className="sp-input" style={{ maxWidth: 420 }}>
              <Icon name="search" />
              <input
                type="search"
                aria-label="Search your servers"
                placeholder="Search your servers"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {servers.isPending && (
              <div
                className="sp-server-grid"
                aria-busy="true"
                aria-label="Loading your servers"
              >
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} className="sp-card sp-server-card">
                    <span
                      className="sp-skel"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        gridRow: 'span 2',
                      }}
                    />
                    <span className="sp-skel" style={{ width: '60%' }} />
                    <span
                      className="sp-skel"
                      style={{ width: '40%', height: 10, gridColumn: 2 }}
                    />
                  </div>
                ))}
              </div>
            )}
            {servers.isError && (
              <div className="sp-card">
                <EmptyState
                  error
                  title="Couldn’t load your servers"
                  actions={
                    <Button
                      icon="refresh-cw"
                      onClick={() => void servers.refetch()}
                    >
                      Try again
                    </Button>
                  }
                >
                  Discord didn’t send your server list in time. This usually
                  clears up in a few seconds.
                </EmptyState>
              </div>
            )}
            {servers.data && (
              <>
                {withSparko.length > 0 && (
                  <section className="sp-stack" aria-labelledby="srv-with">
                    <h2 id="srv-with" className="sp-section-title">
                      Sparko is here{' '}
                      <span className="sp-count">{withSparko.length}</span>
                    </h2>
                    <div className="sp-server-grid">
                      {withSparko.map((s) => (
                        <ServerCard key={s.id} server={s} onAdd={addBot} />
                      ))}
                    </div>
                  </section>
                )}
                {without.length > 0 && (
                  <section className="sp-stack" aria-labelledby="srv-without">
                    <h2 id="srv-without" className="sp-section-title">
                      Add Sparko{' '}
                      <span className="sp-count">{without.length}</span>
                    </h2>
                    <div className="sp-server-grid">
                      {without.map((s) => (
                        <ServerCard key={s.id} server={s} onAdd={addBot} />
                      ))}
                    </div>
                  </section>
                )}
                {!list.length && (
                  <div className="sp-card">
                    <EmptyState
                      icon="search"
                      title={`No servers match “${query}”`}
                      actions={
                        <Button size="sm" onClick={() => setQuery('')}>
                          Clear search
                        </Button>
                      }
                    />
                  </div>
                )}
                <p className="sp-hint">
                  Missing a server? You need the Manage Server permission in it.{' '}
                  <button
                    type="button"
                    className="sp-link-btn"
                    onClick={() => void servers.refetch()}
                  >
                    Refresh the list
                  </button>
                </p>
              </>
            )}
          </div>
        </main>
      </div>
    </DashboardFrame>
  );
}
