import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './core';

/**
 * Shows `text` in the dark tip bubble while what it wraps is hovered or
 * focused, straight away.
 */
export function HoverTip({
  text,
  className,
  label,
  focusable = true,
  children,
}: {
  text: ReactNode;
  className?: string;
  /** Off inside something that's already focusable, like a button. */
  focusable?: boolean;
  /** Set when what it wraps has no words of its own, like an icon. */
  label?: boolean;
  children: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  // Drawn over everything, against the window, so no panel or scrolling
  // list can hide it; it sits above, or below when there's no room.
  useLayoutEffect(() => {
    const i = anchor.current;
    const b = bubble.current;
    if (!shown || !i || !b) return;
    const r = i.getBoundingClientRect();
    const w = b.offsetWidth;
    const h = b.offsetHeight;
    const top = r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8;
    const left = Math.min(
      Math.max(r.left + r.width / 2 - w / 2, 8),
      window.innerWidth - w - 8,
    );
    b.style.top = `${top}px`;
    b.style.left = `${left}px`;
  }, [shown]);
  const named = label && typeof text === 'string';
  return (
    <span
      ref={anchor}
      className={className}
      {...(focusable ? { tabIndex: 0 } : {})}
      {...(named ? { role: 'img', 'aria-label': text } : {})}
      onPointerEnter={() => setShown(true)}
      onPointerLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {children}
      {/* Words that aren't plain text are still read out. */}
      {label && !named && <span className="sp-sr-only">{text}</span>}
      {shown &&
        createPortal(
          <span
            ref={bubble}
            className="sp-tip__bubble"
            aria-hidden={label ? true : undefined}
            role={label ? undefined : 'tooltip'}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

/**
 * The little (i) beside a setting: hovering or focusing it shows what the
 * setting does, straight away.
 */
export function InfoTip({ text }: { text: ReactNode }) {
  return (
    <HoverTip text={text} className="sp-tip" label>
      <Icon name="info" size="sm" />
    </HoverTip>
  );
}
