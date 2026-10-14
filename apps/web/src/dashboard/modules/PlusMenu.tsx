import { useRef, useState, type CSSProperties } from 'react';
import { LottieIcon, cx } from '../../ui';
import { useDismiss } from './EditorBits';
import plusAnim from '../../../../../design-system/assets/icons/animated-icons/plus-menu-button-select.json?url';

/** The plus icon turns into a cross over the first half, and back over the rest. */
const HALF = 60;
const END = 120;

export type PlusItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Why it can't be used right now. */
  note?: string;
};

/**
 * The "+" beside the live preview: a list of things to add, which drops down
 * along a line from the button.
 */
export function PlusMenu({
  items,
  label = 'Add to the message',
}: {
  items: PlusItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // Each change plays one half of the icon.
  const [turn, setTurn] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = (next: boolean) => {
    setOpen(next);
    setTurn((t) => t + 1);
  };
  useDismiss(open, () => toggle(false), wrap);
  return (
    <div ref={wrap} className="sp-pop-anchor">
      <button
        type="button"
        className={cx('sp-plus-btn', open && 'is-open')}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => toggle(!open)}
      >
        <LottieIcon
          src={plusAnim}
          size={20}
          solid
          startAt={0}
          playKey={turn}
          from={open ? 0 : HALF}
          to={open ? HALF : END}
        />
      </button>
      {open && (
        <div className="sp-plus-menu" role="menu" aria-label={label}>
          <span className="sp-plus-menu__line" aria-hidden="true" />
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="sp-plus-menu__item"
              style={{ '--i': i } as CSSProperties}
              disabled={item.disabled}
              title={item.disabled ? item.note : undefined}
              autoFocus={i === 0}
              onClick={() => {
                toggle(false);
                item.onSelect();
              }}
              onKeyDown={(e) => {
                const all = Array.from(
                  e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role=menuitem]:not(:disabled)',
                  ) ?? [],
                );
                const at = all.indexOf(e.currentTarget);
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  all[(at + 1) % all.length]?.focus();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  all[(at - 1 + all.length) % all.length]?.focus();
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
