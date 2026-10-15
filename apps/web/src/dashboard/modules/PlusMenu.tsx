import { useRef, useState } from 'react';
import { LottieIcon, cx, menuPlacement, usePlacement } from '../../ui';
import { useDismiss } from './EditorBits';
import { animIcons } from '../../ui';
const plusAnim = animIcons.plusMenu.select;

/** The plus turns into a cross over frames 0–35, and back over 85–120. */
const OPEN = [0, 35] as const;
const CLOSE = [85, 120] as const;

export type PlusItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Why it can't be used right now. */
  note?: string;
};

/**
 * The "+" beside the live preview: a menu of things to add.
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
  const pop = useRef<HTMLDivElement>(null);
  usePlacement(open, wrap, pop, menuPlacement);
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
          from={open ? OPEN[0] : CLOSE[0]}
          to={open ? OPEN[1] : CLOSE[1]}
        />
      </button>
      {open && (
        <div
          ref={pop}
          className="sp-popover sp-plus-menu"
          role="menu"
          aria-label={label}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="sp-option sp-plus-menu__item"
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
              <span className="sp-option__label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
