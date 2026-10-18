import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx, Icon } from './core';
import { InfoTip } from './tip';
import { LottieIcon, preloadAnimations } from './animated';
import { SearchIcon, searchAnimations } from './search-icon';
import { usePlacement, usePresence } from './placement';
import { animIcons } from './anim-icons';
const tickReveal = animIcons.tick.reveal;

// Loaded the first time someone points at or tabs to a dropdown, or
// earlier by a page that's about to show some.
let preloaded = false;
export const preloadCombobox = () => {
  if (preloaded) return;
  preloaded = true;
  preloadAnimations([...searchAnimations, tickReveal]);
};

export type ComboItem = {
  value: string;
  label: string;
  icon?: string;
  /**
   * A role colour: the option and its chip are filled with it (faint until
   * hovered or picked). With `color2` it's a gradient.
   */
  color?: string;
  color2?: string;
  group?: string;
  disabled?: boolean;
  /** Why it can't be picked, or other short detail. */
  note?: string;
};

type Props = {
  label: ReactNode;
  items: ComboItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  error?: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
  /** Short lists can leave the search box out. */
  searchable?: boolean;
} & (
  | { multiple?: false; value: string; onChange: (value: string) => void }
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
);

/** The fill for a role: its colour, or a gradient between its two. */
/** How bright a #rrggbb colour looks, from 0 (black) to 1 (white). */
function brightness(hex: string) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return 0;
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** A role's fill, and text that stays readable on it: dark on light roles. */
const roleFill = (item: ComboItem) => {
  if (!item.color) return undefined;
  const stops = item.color2 ? [item.color, item.color2] : [item.color];
  const light =
    stops.reduce((sum, c) => sum + brightness(c), 0) / stops.length > 0.45;
  return {
    '--role-fill': item.color2
      ? `linear-gradient(90deg, ${item.color}, ${item.color2})`
      : item.color,
    ...(light ? { '--role-ink': '#16160f', '--role-glow': 'none' } : {}),
  } as CSSProperties;
};

const glyph = (item: ComboItem) =>
  item.icon ? <Icon name={item.icon} className="sp-channel-glyph" /> : null;

/** A picked value in the box: outlined, or filled with a role's colour. */
function Chip({ item, onRemove }: { item: ComboItem; onRemove?: () => void }) {
  return (
    <span
      className={cx('sp-combo-chip', item.color && 'sp-combo-chip--role')}
      style={roleFill(item)}
    >
      {glyph(item)}
      <span className="sp-combo-chip__label">{item.label}</span>
      {onRemove && (
        <button
          type="button"
          className="sp-chip__remove"
          aria-label={`Remove ${item.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="x" />
        </button>
      )}
    </span>
  );
}

/**
 * A searchable list: type to filter, ↑ ↓ to move, Enter to pick, Esc to
 * close. With `multiple`, picks toggle and show as removable chips.
 */
export function Combobox(props: Props) {
  const {
    label,
    items,
    placeholder = 'Select…',
    searchPlaceholder = 'Search',
    error,
    hint,
    footer,
    disabled,
    searchable = true,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const id = useId();
  // Options picked while the list is open draw their tick in; ones just
  // unpicked keep it a moment longer to draw it back out.
  const [picked, setPicked] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<string[]>([]);

  // Without a search box, the list itself takes the keys.
  useEffect(() => {
    if (open && !searchable)
      pop.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus();
  }, [open, searchable]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const presence = usePresence(open);
  usePlacement(presence.mounted, trigger, pop, { fixed: true });

  const selected = props.multiple ? props.value : [props.value];
  const isSelected = (value: string) => selected.includes(value);
  const needle = query.trim().toLowerCase();
  // Each group shows once, in the order its first item came, so items of
  // one folder listed apart still sit under one heading.
  const groups = new Map<string, ComboItem[]>();
  for (const i of items)
    if (!needle || i.label.toLowerCase().includes(needle))
      groups.set(i.group ?? '', [...(groups.get(i.group ?? '') ?? []), i]);
  const list = [...groups.values()].flat();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  // Picking keeps the list open (it closes on a click elsewhere or Esc), so
  // the tick can be seen drawing in, and the old one drawing out.
  const pick = (item: ComboItem) => {
    if (item.disabled) return;
    const v = item.value;
    const was = isSelected(v);
    if (!props.multiple && was) return;
    const gone = props.multiple ? (was ? [v] : []) : selected.filter(Boolean);
    if (props.multiple)
      props.onChange(
        was ? props.value.filter((x) => x !== v) : [...props.value, v],
      );
    else props.onChange(v);
    if (!was) setPicked((p) => [...p, v]);
    setLeaving((l) => [...l.filter((x) => x !== v), ...gone]);
    if (gone.length)
      setTimeout(
        () => setLeaving((l) => l.filter((x) => !gone.includes(x))),
        900,
      );
  };
  const openList = () => {
    setQuery('');
    setPicked([]);
    setActive(list.findIndex((i) => isSelected(i.value)));
    setOpen(true);
  };
  const onKey = (e: KeyboardEvent) => {
    const enabled = list
      .map((item, index) => ({ item, index }))
      .filter((x) => !x.item.disabled);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!enabled.length) return;
      const at = enabled.findIndex((x) => x.index === active);
      const next =
        e.key === 'ArrowDown'
          ? (at + 1) % enabled.length
          : (at - 1 + enabled.length) % enabled.length;
      setActive(enabled[next]!.index);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = list[active];
      if (item) pick(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  const chosen = items.filter((i) => isSelected(i.value));
  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <div
      className="sp-combo"
      ref={root}
      onPointerEnter={preloadCombobox}
      onFocus={preloadCombobox}
    >
      <span className="sp-label">
        <span id={`${id}-label`}>{label}</span>
        {/* Help sits in an (i) beside the label, not under the list. */}
        {hint && label && (
          <>
            {' '}
            <InfoTip text={hint} />
          </>
        )}
      </span>
      {props.multiple ? (
        <div
          ref={trigger as React.RefObject<HTMLDivElement>}
          className={cx(
            'sp-input sp-input--chips sp-combo__trigger',
            !!error && 'is-error',
          )}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={`${id}-label`}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-disabled={disabled || undefined}
          onClick={() => !disabled && (open ? setOpen(false) : openList())}
          onKeyDown={(e) => {
            if (
              e.target === e.currentTarget &&
              ['Enter', ' ', 'ArrowDown'].includes(e.key)
            ) {
              e.preventDefault();
              openList();
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          {chosen.length ? (
            chosen.map((i) => (
              <Chip key={i.value} item={i} onRemove={() => pick(i)} />
            ))
          ) : (
            <span className="sp-input__placeholder" style={{ paddingLeft: 6 }}>
              {placeholder}
            </span>
          )}
          <Icon name="chevron-down" className="sp-input__chev" />
        </div>
      ) : (
        <button
          ref={trigger as React.RefObject<HTMLButtonElement>}
          type="button"
          className={cx('sp-input sp-combo__trigger', !!error && 'is-error')}
          aria-labelledby={`${id}-label ${id}-value`}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
        >
          <span
            id={`${id}-value`}
            className={cx(
              'sp-input__value',
              !chosen[0] && 'sp-input__placeholder',
            )}
          >
            {chosen[0] ? <Chip item={chosen[0]} /> : placeholder}
          </span>
          <Icon name="chevron-down" className="sp-input__chev" />
        </button>
      )}
      {presence.mounted && (
        <div
          ref={pop}
          className={cx(
            'sp-popover sp-combo__pop',
            presence.closing && 'is-closing',
          )}
        >
          {searchable && (
            <div className="sp-popover__search">
              <SearchIcon className="sp-combo__search-icon" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-activedescendant={
                  active >= 0 ? optionId(active) : undefined
                }
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(-1);
                }}
                onKeyDown={onKey}
              />
            </div>
          )}
          <div
            className="sp-popover__list sp-combo__list"
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            {...(searchable
              ? {}
              : {
                  tabIndex: -1,
                  onKeyDown: onKey,
                  'aria-activedescendant':
                    active >= 0 ? optionId(active) : undefined,
                })}
            aria-multiselectable={props.multiple || undefined}
          >
            {list.map((item, index) => {
              const heading =
                item.group && item.group !== list[index - 1]?.group
                  ? item.group
                  : null;
              return (
                <Fragment key={item.value}>
                  {heading && (
                    <div className="sp-option-group" role="presentation">
                      {heading}
                    </div>
                  )}
                  <div
                    id={optionId(index)}
                    className={cx(
                      'sp-option sp-combo-option',
                      item.color && 'sp-combo-option--role',
                    )}
                    style={roleFill(item)}
                    role="option"
                    aria-selected={isSelected(item.value)}
                    aria-disabled={item.disabled || undefined}
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(item)}
                  >
                    {glyph(item)}
                    <span className="sp-option__label">{item.label}</span>
                    {item.note && (
                      <span className="sp-option__meta">{item.note}</span>
                    )}
                    {(isSelected(item.value) ||
                      leaving.includes(item.value)) && (
                      <span
                        className={cx(
                          'sp-combo-option__tick',
                          !isSelected(item.value) && 'is-leaving',
                        )}
                      >
                        <LottieIcon
                          src={tickReveal}
                          size={20}
                          solid
                          open={isSelected(item.value)}
                          startAt={picked.includes(item.value) ? 0 : undefined}
                        />
                      </span>
                    )}
                  </div>
                </Fragment>
              );
            })}
            {!list.length && (
              <div className="sp-popover__empty">
                Nothing matches “{query}”.
              </div>
            )}
          </div>
          {footer && <div className="sp-popover__foot">{footer}</div>}
        </div>
      )}
      {error ? (
        <p className="sp-field-error">
          <Icon name="circle-alert" />
          {error}
        </p>
      ) : hint && !label ? (
        <p className="sp-hint">{hint}</p>
      ) : null}
    </div>
  );
}
