import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** Popovers stay below the dashboard's top bar, which stays on screen. */
const topLimit = () =>
  Math.max(
    0,
    document.querySelector('.sp-topbar')?.getBoundingClientRect().bottom ?? 0,
  );

/** The part of the screen a popover can use: the window, less any scrolling box around it. */
function visibleArea(from: HTMLElement) {
  let top = topLimit();
  let bottom = window.innerHeight;
  for (let el: HTMLElement | null = from; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY + style.overflowX)) {
      const r = el.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return { top, bottom };
}

type Options = {
  gap: number;
  margin: number;
  fixed: boolean;
  /** Fixed popovers are as wide as what opened them unless this is false. */
  matchWidth: boolean;
  /** Which edge lines up with what opened it. */
  align: 'start' | 'end';
};

function place(
  a: HTMLElement,
  p: HTMLElement,
  { gap, margin, fixed, matchWidth, align }: Options,
) {
  p.style.maxHeight = '';
  if (fixed) {
    Object.assign(p.style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      right: 'auto',
      bottom: 'auto',
    });
  } else {
    p.style.top = '';
    p.style.bottom = '';
  }
  const box = a.getBoundingClientRect();
  if (fixed && matchWidth) p.style.width = `${box.width}px`;
  const natural = p.offsetHeight;
  const parent = (p.offsetParent as HTMLElement | null) ?? document.body;
  const area = fixed
    ? { top: topLimit(), bottom: window.innerHeight }
    : visibleArea(parent);
  const below = area.bottom - box.bottom - gap - margin;
  const above = box.top - area.top - gap - margin;
  const up = natural > below && above > below;
  const room = Math.max(up ? above : below, 120);
  const height = Math.min(natural, room);
  if (natural > room) p.style.maxHeight = `${room}px`;
  p.dataset.side = up ? 'top' : 'bottom';
  if (fixed) {
    // Whatever the popover is placed against may not start at the
    // window's corner (a transformed panel, say); this measures it.
    const origin = p.getBoundingClientRect();
    const width = p.offsetWidth;
    const left = Math.min(
      Math.max(align === 'end' ? box.right - width : box.left, margin),
      window.innerWidth - width - margin,
    );
    const top = up ? box.top - gap - height : box.bottom + gap;
    p.style.left = `${left - origin.left}px`;
    p.style.top = `${top - origin.top}px`;
    return;
  }
  const inParent =
    box.top - parent.getBoundingClientRect().top - parent.clientTop;
  if (up) {
    p.style.top = 'auto';
    p.style.bottom = `${parent.clientHeight - inParent + gap}px`;
  } else {
    p.style.top = `${inParent + box.height + gap}px`;
    p.style.bottom = 'auto';
  }
}

/**
 * Opens a popover below what it belongs to, or above when there's more room
 * there, and keeps it on screen: when neither side has room for all of it,
 * it gets shorter and scrolls inside. `data-side` says which way it opened,
 * for its wipe-in animation.
 *
 * By default the popover is positioned inside its parent, so a scrolling box
 * around it can cut it off and the room is measured inside that box. With
 * `fixed` it's placed against the window instead, so it can hang out of a
 * scrolling list, and it follows what opened it when the page scrolls.
 */
export function usePlacement(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  pop: RefObject<HTMLElement | null>,
  {
    gap = 6,
    margin = 8,
    fixed = false,
    matchWidth = true,
    align = 'start' as 'start' | 'end',
  } = {},
) {
  useLayoutEffect(() => {
    const a = anchor.current;
    const p = pop.current;
    if (!open || !a || !p) return;
    const opts = { gap, margin, fixed, matchWidth, align };
    const again = () => place(a, p, opts);
    // Scrolling inside the popover itself doesn't move it.
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && p.contains(e.target))) again();
    };
    again();
    window.addEventListener('resize', again);
    if (fixed) window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', again);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchor, pop, gap, margin, fixed, matchWidth, align]);
}

/**
 * Nudges a popover that's already placed (below or beside what opened it)
 * up, down or sideways just enough to stay on screen and below the top bar.
 */
export function useKeepOnScreen(
  pop: RefObject<HTMLElement | null>,
  margin = 8,
) {
  useLayoutEffect(() => {
    const p = pop.current;
    if (!p) return;
    const fit = () => nudge(p, margin);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [pop, margin]);
}

function nudge(p: HTMLElement, margin: number) {
  p.style.translate = '';
  const r = p.getBoundingClientRect();
  const top = topLimit() + margin;
  const bottom = window.innerHeight - margin;
  let dy = 0;
  if (r.bottom > bottom) dy = bottom - r.bottom;
  if (r.top + dy < top) dy = top - r.top;
  let dx = 0;
  if (r.right > window.innerWidth - margin)
    dx = window.innerWidth - margin - r.right;
  if (r.left + dx < margin) dx = margin - r.left;
  if (dx || dy) p.style.translate = `${dx}px ${dy}px`;
}

/**
 * For menus opened from a small button: placed against the window like a
 * dropdown, as wide as their own content, lined up with the button's right.
 */
export const menuPlacement = {
  gap: 8,
  fixed: true,
  matchWidth: false,
  align: 'end' as const,
};

/** How long a menu takes to close: its opening animation, played back. */
export const CLOSE_MS = 160;

/**
 * Keeps a menu on screen a moment after it's closed, so it can play its
 * opening animation in reverse. `closing` is true during that moment.
 */
export function usePresence(open: boolean, ms = CLOSE_MS) {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  useEffect(() => {
    if (open || !shown) return;
    const quick = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const t = setTimeout(() => setShown(false), quick ? 0 : ms);
    return () => clearTimeout(t);
  }, [open, shown, ms]);
  return { mounted: open || shown, closing: !open && shown };
}
