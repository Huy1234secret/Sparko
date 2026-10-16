import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Crystal } from '../ui';
import { useBackend, useSession, useSignOut } from '../data';

/** 31 October 2026, 10:00 pm in UTC+7, unless the server says otherwise. */
const fallbackOpensAt = '2026-10-31T15:00:00Z';

/**
 * Until the dashboard opens to everyone, only the people the server allows
 * get past this. Signed-out visitors go on to sign in as usual; someone
 * signed in who isn't allowed yet sees the coming-soon screen. Without a
 * real backend (local development) everyone gets in.
 */
export function DashboardGate() {
  const backend = useBackend().data;
  const session = useSession();
  if (!backend) return null;
  if (!backend.live || backend.dashboardOpen) return <Outlet />;
  if (session.isPending) return null;
  // Signed out: the pages inside send them to sign in.
  if (!session.data || session.data.allowed) return <Outlet />;
  return (
    <ComingSoon
      opensAt={backend.dashboardOpensAt ?? fallbackOpensAt}
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

function ComingSoon({
  opensAt,
  name,
}: {
  opensAt: string;
  name?: string | undefined;
}) {
  const at = Date.parse(opensAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document.title = 'Coming soon · Sparko';
  }, []);
  const left = at - now;
  const local = new Date(at).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const signOut = useSignOut();
  const client = useQueryClient();
  return (
    <main className="sp-soon" id="main">
      <div className="sp-soon__inner">
        <div className="sp-soon__crystal">
          <Crystal size={160} />
        </div>
        <p className="sp-soon__tag">Coming soon</p>
        <h1 className="sp-soon__title">The Sparko dashboard is almost here.</h1>
        <p className="sp-soon__lede">
          It opens on 31 October 2026 at 10:00 pm (UTC+7). That’s {local} where
          you are.
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
            It’s open. Load the dashboard
          </button>
        )}
        <p className="sp-soon__links">
          <Link to="/">Back to the website</Link>
          {name ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Signed in as {name}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                disabled={signOut.isPending}
                onClick={() =>
                  signOut.mutate(undefined, {
                    onSettled: () => {
                      client.removeQueries({ queryKey: ['site-session'] });
                    },
                  })
                }
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <span aria-hidden="true">·</span>
              <Link to="/signin">Team sign in</Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
