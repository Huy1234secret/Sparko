import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Crystal } from './ui';
import { backend, liveSession, liveSignOut, signInUrl } from './data/live';

/** 31 October 2026, 10:00 pm in UTC+7, unless the server says otherwise. */
const fallbackOpensAt = '2026-10-31T15:00:00Z';

/** Pages anyone can read before launch: Discord needs these to be public. */
const alwaysOpen = new Set(['/privacy', '/terms']);

/**
 * Until Sparko opens to everyone, the whole site sits behind a black
 * coming-soon screen. Signing in with Discord unlocks it for the people the
 * server allows. Without a real backend (local development) it's open.
 */
export function SiteGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const status = useQuery({
    queryKey: ['backend'],
    queryFn: backend,
    staleTime: Infinity,
  });
  const closed = !!status.data?.live && !status.data.dashboardOpen;
  const session = useQuery({
    queryKey: ['site-session'],
    queryFn: liveSession,
    staleTime: 0,
    retry: false,
    enabled: closed,
  });
  if (alwaysOpen.has(pathname)) return children;
  if (!status.data) return <ComingSoon loading />;
  if (!closed || session.data?.allowed) return children;
  if (session.isPending) return <ComingSoon loading />;
  return (
    <ComingSoon
      opensAt={status.data.dashboardOpensAt ?? fallbackOpensAt}
      name={session.data?.user.name}
    />
  );
}

const parts = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    ['days', Math.floor(s / 86_400)],
    ['hours', Math.floor((s % 86_400) / 3600)],
    ['minutes', Math.floor((s % 3600) / 60)],
    ['seconds', s % 60],
  ] as const;
};

/** The black screen: the turning crystal, a countdown and sign-in. */
function ComingSoon({
  opensAt = fallbackOpensAt,
  name,
  loading,
}: {
  opensAt?: string;
  name?: string | undefined;
  loading?: boolean;
}) {
  const at = Date.parse(opensAt);
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!loading) document.title = 'Coming soon · Sparko';
  }, [loading]);
  const left = at - now;
  const local = new Date(at).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const signOut = async () => {
    setLeaving(true);
    await liveSignOut().catch(() => undefined);
    client.setQueryData(['site-session'], null);
    client.removeQueries({ queryKey: ['session'] });
    setLeaving(false);
  };
  return (
    <main
      className="sp-soon"
      id="main"
      data-theme="dark"
      aria-busy={loading || undefined}
    >
      <div className="sp-soon__inner">
        <div className="sp-soon__crystal">
          <Crystal size={160} />
        </div>
        {!loading && (
          <div className="sp-soon__body">
            <p className="sp-soon__tag">Coming soon</p>
            <h1 className="sp-soon__title">Sparko is almost here.</h1>
            <p className="sp-soon__lede">
              It opens on 31 October 2026 at 10:00 pm (UTC+7). That’s {local}{' '}
              where you are.
            </p>
            {left > 0 ? (
              <div className="sp-soon__count" role="timer" aria-live="off">
                {parts(left).map(([unit, value]) => (
                  <div key={unit} className="sp-soon__unit">
                    <b>{String(value).padStart(2, '0')}</b>
                    <span>{unit}</span>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="sp-btn sp-btn--primary sp-btn--lg"
                onClick={() => window.location.reload()}
              >
                It’s open. Come on in
              </button>
            )}
            {name ? (
              <p className="sp-soon__links">
                <span>
                  Signed in as {name}. Your account isn’t on the early list.
                </span>
                <button type="button" disabled={leaving} onClick={signOut}>
                  {leaving ? 'Signing out…' : 'Sign out'}
                </button>
              </p>
            ) : (
              <a
                className="sp-btn sp-btn--secondary sp-soon__signin"
                href={signInUrl}
              >
                On the team? Sign in with Discord
              </a>
            )}
            <p className="sp-soon__links sp-soon__legal">
              <Link to="/privacy">Privacy Policy</Link>
              <span aria-hidden="true">·</span>
              <Link to="/terms">Terms of Service</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
