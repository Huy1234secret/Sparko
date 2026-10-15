import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, SearchIcon } from '../ui';
import { useSession, useSignOut } from '../data';
import { useTheme } from '../state/theme';
import { isMac } from './shared';

export function ThemeButton() {
  const { theme, toggle } = useTheme();
  const label =
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <span className="sp-tip sp-tip--end sp-tip--below">
      <Button
        variant="ghost"
        iconOnly
        icon={theme === 'dark' ? 'sun' : 'moon'}
        aria-label={label}
        onClick={toggle}
      />
      <span className="sp-tooltip" role="tooltip" data-side="bottom">
        {label}
      </span>
    </span>
  );
}

export function AccountMenu() {
  const session = useSession().data;
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!session) return null;
  const name = session.user.name;
  return (
    <div className="sp-menu-anchor" ref={root}>
      <button
        type="button"
        className="sp-avatar-button"
        aria-label={`Account: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Avatar
          name={name}
          color={session.user.avatarColor}
          size="sm"
          {...(session.user.avatarUrl ? { src: session.user.avatarUrl } : {})}
        />
      </button>
      {open && (
        <div className="sp-popover sp-menu" role="menu" aria-label="Account">
          <div className="sp-option-group sp-menu__name">{name}</div>
          <Link
            className="sp-option"
            role="menuitem"
            to="/dashboard"
            onClick={() => setOpen(false)}
          >
            <Icon name="server" />
            Your servers
          </Link>
          <button
            type="button"
            className="sp-option"
            role="menuitem"
            disabled={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, {
                onSettled: () => {
                  setOpen(false);
                  navigate('/signin?signedOut=1');
                },
              })
            }
          >
            <Icon name="log-out" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({
  crumbs,
  onMenu,
  onSearch,
}: {
  crumbs: ReactNode;
  onMenu?: () => void;
  onSearch?: () => void;
}) {
  return (
    <header className="sp-topbar">
      {onMenu && (
        <Button
          variant="ghost"
          iconOnly
          icon="menu"
          className="sp-topbar__menu"
          aria-label="Open menu"
          onClick={onMenu}
        />
      )}
      <div className="sp-topbar__start">{crumbs}</div>
      <div className="sp-topbar__end">
        {onSearch && (
          <>
            <button
              type="button"
              className="sp-cmdk-trigger sp-topbar__desktop-only"
              onClick={onSearch}
            >
              <SearchIcon size={16} />
              <span>Search or jump to…</span>
              <span className="sp-kbd-group" aria-hidden="true">
                <span className="sp-kbd">{isMac() ? '⌘' : 'Ctrl'}</span>
                <span className="sp-kbd">K</span>
              </span>
            </button>
            <Button
              variant="ghost"
              iconOnly
              icon="search"
              className="sp-topbar__mobile-only"
              aria-label="Search"
              onClick={onSearch}
            />
          </>
        )}
        <ThemeButton />
        <AccountMenu />
      </div>
    </header>
  );
}
