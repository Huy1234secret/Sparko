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
import { LottieIcon, preloadAnimations, reducedMotion } from './animated';
import searchReveal from '../../../../design-system/assets/icons/animated-icons/search-icon-reveal.json?url';
import searchIdle from '../../../../design-system/assets/icons/animated-icons/search-icon-idle.json?url';
import searchComplete from '../../../../design-system/assets/icons/animated-icons/search-icon-complete.json?url';
import tickReveal from '../../../../design-system/assets/icons/animated-icons/tick-reveal.json?url';

// Loaded the first time someone points at or tabs to a dropdown.
let preloaded = false;
const preload = () => {
  if (preloaded) return;
  preloaded = true;
  preloadAnimations([searchReveal, searchIdle, searchComplete, tickReveal]);
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
} & (
  | { multiple?: false; value: string; onChange: (value: string) => void }
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
);

/**
 * The search box's icon: it draws itself in when the list opens, wiggles
 * while someone types, and settles once they've stopped for a second.
 */
function useSearchIcon() {
  const [phase, setPhase] = useState<'reveal' | 'idle' | 'complete'>('reveal');
  const [playKey, setPlayKey] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onType = () => {
    clearTimeout(timer.current);
    setPhase('idle');
    timer.current = setTimeout(() => setPhase('complete'), 1000);
  };
  const icon = (
    <LottieIcon
      // A new file plays as soon as it has loaded.
      src={
        phase === 'reveal'
          ? searchReveal
          : phase === 'idle'
            ? searchIdle
            : searchComplete
      }
      size={20}
      solid
      playKey={playKey}
      className="sp-combo__search-icon"
      onDone={() => {
        // Keeps wiggling for as long as they type.
        if (phase === 'idle' && !reducedMotion()) setPlayKey((k) => k + 1);
      }}
    />
  );
  const reset = () => {
    clearTimeout(timer.current);
    setPhase('reveal');
    setPlayKey((k) => k + 1);
  };
  return { icon, onType, reset };
}

/** The fill for a role: its colour, or a gradient between its two. */
const roleFill = (item: ComboItem) =>
  item.color
    ? ({
        '--role-fill': item.color2
          ? `linear-gradient(90deg, ${item.color}, ${item.color2})`
          : item.color,
      } as CSSProperties)
    : undefined;

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
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const id = useId();
  const search = useSearchIcon();
  // Options picked while the list is open draw their tick in; ones just
  // unpicked keep it a moment longer to draw it back out.
  const [picked, setPicked] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Inside a scrolling panel, the list scrolls itself into view.
    pop.current?.scrollIntoView?.({ block: 'nearest' });
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selected = props.multiple ? props.value : [props.value];
  const isSelected = (value: string) => selected.includes(value);
  const needle = query.trim().toLowerCase();
  const list = items.filter(
    (i) => !needle || i.label.toLowerCase().includes(needle),
  );
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const pick = (item: ComboItem) => {
    if (item.disabled) return;
    if (props.multiple) {
      const was = isSelected(item.value);
      props.onChange(
        was
          ? props.value.filter((v) => v !== item.value)
          : [...props.value, item.value],
      );
      const v = item.value;
      if (was) {
        setLeaving((l) => [...l, v]);
        setTimeout(() => setLeaving((l) => l.filter((x) => x !== v)), 900);
      } else {
        setPicked((p) => [...p, v]);
        setLeaving((l) => l.filter((x) => x !== v));
      }
    } else {
      props.onChange(item.value);
      close();
    }
  };
  const openList = () => {
    setQuery('');
    setPicked([]);
    search.reset();
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
      onPointerEnter={preload}
      onFocus={preload}
    >
      <span className="sp-label" id={`${id}-label`}>
        {label}
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
      {open && (
        <div ref={pop} className="sp-popover sp-combo__pop">
          <div className="sp-popover__search">
            {search.icon}
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(-1);
                search.onType();
              }}
              onKeyDown={onKey}
            />
          </div>
          <div
            className="sp-popover__list sp-combo__list"
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={`${id}-label`}
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
      ) : hint ? (
        <p className="sp-hint">{hint}</p>
      ) : null}
    </div>
  );
}
