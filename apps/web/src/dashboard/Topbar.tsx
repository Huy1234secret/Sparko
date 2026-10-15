import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, LottieIcon, SearchIcon } from '../ui';
import darkHover from '../../../../design-system/assets/icons/animated-icons/dark-mode-hover.json?url';
import lightHover from '../../../../design-system/assets/icons/animated-icons/light-mode-hover.json?url';
import modeSwitch from '../../../../design-system/assets/icons/animated-icons/dark-light-mode-select.json?url';

/**
 * The switch animation turns the moon (dark) into the sun (light) over its
 * first half, and the sun back into the moon over its second.
 */
const SUN = 30;
const MOON_AGAIN = 60;
import { useSession, useSignOut } from '../data';
import { useTheme } from '../state/theme';
import { isMac } from './shared';

export function ThemeButton() {
  const { theme, toggle } = useTheme();
  const label =
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  // At rest the switch shows the theme in use: the moon for dark, the sun
  // for light. Hovering plays that theme's own hover; switching plays one
  // turning into the other.
  const [anim, setAnim] = useState<'switch' | 'hover'>('switch');
  const [hoverKey, setHoverKey] = useState(0);
  const [turn, setTurn] = useState(0);
  const light = theme === 'light';
  return (
    <span className="sp-tip sp-tip--end sp-tip--below">
      <Button
        variant="ghost"
        // Square like an icon-only button, but holding the animated icon.
        className="sp-btn--icon"
        aria-label={label}
        onPointerEnter={() => {
          setAnim('hover');
          setHoverKey((k) => k + 1);
        }}
        onClick={() => {
          setAnim('switch');
          setTurn((t) => t + 1);
          toggle();
        }}
      >
        {anim === 'hover' ? (
          <LottieIcon
            src={light ? lightHover : darkHover}
            size={20}
            solid
            startAt={0}
            playKey={hoverKey}
          />
        ) : (
          <LottieIcon
            src={modeSwitch}
            size={20}
            solid
            startAt={light ? SUN : 0}
            playKey={turn}
            from={light ? 0 : SUN}
            to={light ? SUN : MOON_AGAIN}
          />
        )}
      </Button>
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
