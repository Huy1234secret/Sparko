import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Icon } from '../ui';
import { liveSession, liveSignOut } from '../data/live';
import type { Session } from '../data/types';

const siteSession = ['site-session'] as const;

/**
 * Who is signed in, for the public site. Only the real backend counts: with
 * no backend (local development) everyone looks signed out.
 */
export function useSiteSession() {
  return useQuery({
    queryKey: siteSession,
    queryFn: liveSession,
    staleTime: 0,
    retry: false,
  }).data;
}

/** Open dashboard, for someone signed in. */
export function DashboardButton({ block }: { block?: boolean }) {
  return (
    <Link
      className={
        'sp-btn sp-btn--primary sw-open-dash' +
        (block ? ' sp-btn--block' : ' sw-desk')
      }
      to="/dashboard"
    >
      <Icon name="layout-dashboard" />
      Open dashboard
    </Link>
  );
}

/** The signed-in person's picture, with a menu for the dashboard and signing out. */
export function AccountMenu({
  session,
  onAddBot,
}: {
  session: Session;
  onAddBot: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const { name, avatarColor, avatarUrl } = session.user;
  const signOut = async () => {
    setLeaving(true);
    await liveSignOut().catch(() => undefined);
    client.setQueryData(siteSession, null);
    client.removeQueries({ queryKey: ['session'] });
    setLeaving(false);
    setOpen(false);
  };
  return (
    <div className="sp-menu-anchor sw-account" ref={root}>
      <button
        type="button"
        className="sp-avatar-button sw-account__button"
        aria-label={`Account: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Avatar
          name={name}
          color={avatarColor}
          size="sm"
          {...(avatarUrl ? { src: avatarUrl } : {})}
        />
      </button>
      {open && (
        <div
          className="sp-popover sp-menu sw-account__menu"
          role="menu"
          aria-label="Account"
        >
          <div className="sw-account__who">
            <Avatar
              name={name}
              color={avatarColor}
              {...(avatarUrl ? { src: avatarUrl } : {})}
            />
            <span>
              <b>{name}</b>
              <span>Signed in with Discord</span>
            </span>
          </div>
          <Link
            className="sp-option"
            role="menuitem"
            to="/dashboard"
            onClick={() => setOpen(false)}
          >
            <Icon name="layout-dashboard" />
            Your servers
          </Link>
          <button
            type="button"
            className="sp-option"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAddBot();
            }}
          >
            <Icon name="plus" />
            Add Sparko to a server
          </button>
          <button
            type="button"
            className="sp-option"
            role="menuitem"
            disabled={leaving}
            onClick={signOut}
          >
            <Icon name="log-out" />
            {leaving ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
