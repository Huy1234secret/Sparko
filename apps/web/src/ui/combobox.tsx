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

export type ComboItem = {
  value: string;
  label: string;
  icon?: string;
  /** A role colour; shows a coloured dot instead of an icon. */
  color?: string;
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
  const trigger = useRef<HTMLElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
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
    if (props.multiple)
      props.onChange(
        isSelected(item.value)
          ? props.value.filter((v) => v !== item.value)
          : [...props.value, item.value],
      );
    else {
      props.onChange(item.value);
      close();
    }
  };
  const openList = () => {
    setQuery('');
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
  const glyph = (item: ComboItem) =>
    item.color ? (
      <span
        className="sp-role-dot"
        style={{ '--role': item.color } as CSSProperties}
      />
    ) : item.icon ? (
      <Icon name={item.icon} className="sp-channel-glyph" />
    ) : null;
  const chosen = items.filter((i) => isSelected(i.value));
  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <div className="sp-combo" ref={root}>
      <span className="sp-label" id={`${id}-label`}>
        {label}
      </span>
      {props.multiple ? (
        <div
          ref={trigger as React.RefObject<HTMLDivElement>}
          className={cx('sp-input sp-input--chips', !!error && 'is-error')}
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
              <span key={i.value} className="sp-chip">
                {glyph(i)}
                {i.label}
                <button
                  type="button"
                  className="sp-chip__remove"
                  aria-label={`Remove ${i.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(i);
                  }}
                >
                  <Icon name="x" />
                </button>
              </span>
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
          className={cx('sp-input', !!error && 'is-error')}
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
            {chosen[0] ? (
              <>
                {glyph(chosen[0])}
                {chosen[0].label}
              </>
            ) : (
              placeholder
            )}
          </span>
          <Icon name="chevron-down" className="sp-input__chev" />
        </button>
      )}
      {open && (
        <div className="sp-popover">
          <div className="sp-popover__search">
            <Icon name="search" size="sm" />
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
              }}
              onKeyDown={onKey}
            />
          </div>
          <div
            className="sp-popover__list"
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
                    className="sp-option"
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
                    {isSelected(item.value) && (
                      <span className="sp-option__check">
                        <Icon name="check" />
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
