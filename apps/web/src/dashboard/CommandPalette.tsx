import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, SearchIcon } from '../ui';
import { modules } from '../content/modules';
import { useTheme } from '../state/theme';

type Command = { label: string; icon: string; meta: string; run: () => void };

/** Ctrl/⌘ K: jump to any module or run a common action. */
export function CommandPalette({
  serverId,
  open,
  onClose,
}: {
  serverId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const previous = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement | null;
    return () => previous.current?.focus();
  }, [open]);
  if (!open) return null;

  const go = (path: string) => () => {
    onClose();
    navigate(path);
  };
  const sections: [string, Command[]][] = [
    [
      'Pages',
      [
        {
          label: 'Overview',
          icon: 'layout-dashboard',
          meta: 'Page',
          run: go(`/dashboard/${serverId}`),
        },
        ...modules.map((m) => ({
          label: m.label,
          icon: m.icon,
          meta: m.group,
          run: go(`/dashboard/${serverId}/${m.id}`),
        })),
      ],
    ],
    [
      'Actions',
      [
        {
          label: 'Switch server',
          icon: 'server',
          meta: '',
          run: go('/dashboard'),
        },
        {
          label:
            theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
          icon: theme === 'dark' ? 'sun' : 'moon',
          meta: '',
          run: () => {
            toggle();
            onClose();
          },
        },
        {
          label: 'Upgrade to Plus',
          icon: 'crown',
          meta: '',
          run: go(`/dashboard/${serverId}/billing`),
        },
      ],
    ],
  ];
  const needle = query.trim().toLowerCase();
  const filtered = sections
    .map(
      ([group, items]) =>
        [
          group,
          items.filter((c) => c.label.toLowerCase().includes(needle)),
        ] as const,
    )
    .filter(([, items]) => items.length);
  const flat = filtered.flatMap(([, items]) => items);
  let index = -1;

  return (
    <div
      className="sp-cmdk-scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="sp-cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Search Sparko"
      >
        <div className="sp-cmdk__search">
          <SearchIcon size={24} />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={flat[active] ? `cmdk-${active}` : undefined}
            aria-label="Search modules and actions"
            placeholder="Search modules and actions"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!flat.length) return;
                setActive((a) =>
                  e.key === 'ArrowDown'
                    ? (a + 1) % flat.length
                    : (a - 1 + flat.length) % flat.length,
                );
              } else if (e.key === 'Enter') {
                e.preventDefault();
                flat[active]?.run();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <button
            type="button"
            className="sp-kbd sp-cmdk__esc"
            onClick={onClose}
            aria-label="Close"
          >
            esc
          </button>
        </div>
        <div
          className="sp-cmdk__list"
          id="cmdk-list"
          role="listbox"
          aria-label="Results"
        >
          {filtered.map(([group, items]) => (
            <Fragment key={group}>
              <div className="sp-option-group" role="presentation">
                {group}
              </div>
              {items.map((c) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={c.label}
                    id={`cmdk-${i}`}
                    className="sp-option"
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={c.run}
                  >
                    <span className="sp-cmdk__icon">
                      <Icon name={c.icon} size="sm" />
                    </span>
                    <span className="sp-option__label">{c.label}</span>
                    <span className="sp-option__meta">{c.meta}</span>
                  </div>
                );
              })}
            </Fragment>
          ))}
          {!flat.length && (
            <div className="sp-popover__empty" style={{ padding: 28 }}>
              Nothing matches “{query}”. Try a module name like “tickets” or
              “levels”.
            </div>
          )}
        </div>
        <div className="sp-cmdk__foot" aria-hidden="true">
          <span>
            <span className="sp-kbd">↑</span>
            <span className="sp-kbd">↓</span>Move
          </span>
          <span>
            <span className="sp-kbd">↵</span>Open
          </span>
          <span>
            <span className="sp-kbd">esc</span>Close
          </span>
        </div>
      </div>
    </div>
  );
}
