import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Icon, useToast, SearchIcon } from '../ui';
import { groups, modules } from '../content/modules';
import { useOverview, useServers, type Server } from '../data';
import {
  formatCount,
  isMac,
  moduleHealth,
  planName,
  ServerMark,
  useActiveModuleId,
} from './shared';

/** Picks another server; also links to all servers and to adding Sparko. */
function ServerSwitcher({ current }: { current: Server }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const servers = (useServers().data ?? []).filter((s) => s.installed);
  const list = servers.filter((s) =>
    s.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const go = (server: Server) => {
    setOpen(false);
    navigate(`/dashboard/${server.id}`);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!list.length) return;
      setActive((a) =>
        e.key === 'ArrowDown'
          ? (a + 1) % list.length
          : (a - 1 + list.length) % list.length,
      );
    } else if (e.key === 'Enter' && list[active]) {
      e.preventDefault();
      go(list[active]!);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  return (
    <div ref={root} className="sp-switcher">
      <button
        ref={button}
        type="button"
        className="sp-server-switch"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Switch server, current: ${current.name}`}
        onClick={() => {
          setQuery('');
          setActive(list.findIndex((s) => s.id === current.id));
          setOpen(!open);
        }}
      >
        <ServerMark server={current} className="sp-server--md" />
        <span>
          {current.name}
          <small>
            {formatCount(current.members)} members · {planName(current)}
          </small>
        </span>
        <Icon name="chevrons-up-down" size="sm" />
      </button>
      {open && (
        <div className="sp-popover sp-switcher__pop">
          <label className="sp-popover__search">
            <SearchIcon size={16} />
            <input
              autoFocus
              aria-label="Find a server"
              placeholder="Find a server"
              role="combobox"
              aria-expanded="true"
              aria-controls="server-list"
              aria-activedescendant={
                active >= 0 ? `server-option-${active}` : undefined
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(-1);
              }}
              onKeyDown={onKey}
            />
          </label>
          <div
            className="sp-popover__list"
            id="server-list"
            role="listbox"
            aria-label="Your servers"
          >
            {list.map((s, i) => (
              <div
                key={s.id}
                id={`server-option-${i}`}
                className="sp-option"
                role="option"
                aria-selected={s.id === current.id}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s)}
              >
                <ServerMark server={s} size={28} />
                <span className="sp-option__label">{s.name}</span>
                {s.paused && (
                  <Badge tone="danger" size="sm">
                    Paused
                  </Badge>
                )}
                {s.id === current.id && (
                  <Icon name="check" size="sm" className="sp-option__check" />
                )}
              </div>
            ))}
            {!list.length && (
              <p className="sp-popover__empty">No servers match “{query}”.</p>
            )}
          </div>
          <div className="sp-popover__foot" style={{ display: 'grid', gap: 2 }}>
            <Link
              className="sp-option"
              to="/dashboard"
              onClick={() => setOpen(false)}
            >
              <Icon name="server" />
              All servers
            </Link>
            <button
              type="button"
              className="sp-option"
              onClick={() => {
                setOpen(false);
                toast({
                  title: 'Discord would open here',
                  body: 'You’d pick a server and approve only the permissions Sparko needs.',
                });
              }}
            >
              <Icon name="plus" />
              Add Sparko to a server
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  server,
  open,
  onClose,
}: {
  server: Server;
  open: boolean;
  onClose: () => void;
}) {
  const moduleId = useActiveModuleId();
  const overview = useOverview(server.id).data;
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const navigate = useNavigate();
  const needle = query.trim().toLowerCase();
  const current = modules.find((m) => m.id === moduleId);

  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };
  const shown = groups
    .map((group) => {
      const items = modules.filter(
        (m) =>
          m.group === group &&
          (!needle || m.label.toLowerCase().includes(needle)),
      );
      const on = modules.filter(
        (m) => m.group === group && overview?.on[m.id],
      ).length;
      return { group, items, on };
    })
    .filter((g) => g.items.length);

  return (
    <>
      <nav
        className={'sp-sidebar sp-sidebar--grouped' + (open ? ' is-open' : '')}
        aria-label={`${server.name} dashboard`}
      >
        <div
          className="sp-sidebar__brand"
          style={{ justifyContent: 'space-between' }}
        >
          <Link to="/" className="sp-brand-link">
            Sparko
          </Link>
          {open && (
            <Button
              variant="ghost"
              iconOnly
              icon="x"
              aria-label="Close menu"
              onClick={onClose}
            />
          )}
        </div>
        <ServerSwitcher current={server} />
        <label className="sp-nav-search">
          <SearchIcon size={16} />
          <input
            aria-label="Find a module"
            placeholder="Find a module"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="sp-kbd" aria-hidden="true">
            {isMac() ? '⌘' : 'Ctrl'} K
          </span>
        </label>
        <button
          type="button"
          className="sp-nav-item"
          aria-current={!moduleId ? 'page' : undefined}
          onClick={() => goTo(`/dashboard/${server.id}`)}
        >
          <Icon name="layout-dashboard" />
          <span>Overview</span>
        </button>
        {shown.map(({ group, items, on }) => {
          const isOpen =
            !!needle || current?.group === group || !closed.has(group);
          return (
            <div key={group} className="sp-nav-group">
              <button
                type="button"
                className="sp-nav-group__head"
                aria-expanded={isOpen}
                onClick={() =>
                  setClosed((c) => {
                    const next = new Set(c);
                    if (isOpen) next.add(group);
                    else next.delete(group);
                    return next;
                  })
                }
              >
                <span>{group}</span>
                <span className="sp-nav-group__meta">
                  {on ? `${on} on` : ''}
                </span>
                <Icon name="chevron-down" />
              </button>
              {isOpen &&
                items.map((m) => {
                  const health = moduleHealth(overview, m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="sp-nav-item"
                      aria-current={m.id === moduleId ? 'page' : undefined}
                      onClick={() => goTo(`/dashboard/${server.id}/${m.id}`)}
                    >
                      <Icon name={m.icon} />
                      <span>{m.label}</span>
                      <span className="sp-nav-item__end">
                        {m.plus && (
                          <Badge tone="brand" size="sm">
                            Plus
                          </Badge>
                        )}
                        {!m.plus && health !== 'off' && (
                          <span
                            className={
                              'sp-nav-dot' +
                              (health === 'needs-fix'
                                ? ' sp-nav-dot--warn'
                                : '')
                            }
                            role="img"
                            aria-label={
                              health === 'needs-fix' ? 'Needs a fix' : 'On'
                            }
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
            </div>
          );
        })}
        {!shown.length && (
          <p className="sp-nav-empty">No modules match “{query}”.</p>
        )}
        <div className="sp-sidebar__foot">
          <div className="sp-card sp-plan-card">
            <div className="sp-plan-card__row">
              <b>{planName(server)} plan</b>
              {overview && (
                <span className="sp-hint sp-tnum">
                  {overview.health.storageMb.used} /{' '}
                  {overview.health.storageMb.limit} MB
                </span>
              )}
            </div>
            {overview && (
              <div
                className="sp-progress sp-progress--sm"
                role="progressbar"
                aria-label="Storage used"
                aria-valuenow={Math.round(
                  (overview.health.storageMb.used /
                    overview.health.storageMb.limit) *
                    100,
                )}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="sp-progress__bar"
                  style={{
                    width: `${(overview.health.storageMb.used / overview.health.storageMb.limit) * 100}%`,
                  }}
                />
              </div>
            )}
            {server.plan === 'free' && (
              <Button
                size="sm"
                icon="crown"
                onClick={() => goTo(`/dashboard/${server.id}/billing`)}
              >
                See what Plus adds
              </Button>
            )}
          </div>
        </div>
      </nav>
      {open && (
        <div className="sp-nav-scrim" onClick={onClose} aria-hidden="true" />
      )}
    </>
  );
}
