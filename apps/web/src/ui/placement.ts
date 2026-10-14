import { useLayoutEffect, type RefObject } from 'react';

/** The part of the screen a popover can use: the window, less any scrolling box around it. */
function visibleArea(from: HTMLElement) {
  let top = 0;
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

type Options = { gap: number; margin: number; fixed: boolean };

function place(
  a: HTMLElement,
  p: HTMLElement,
  { gap, margin, fixed }: Options,
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
  if (fixed) p.style.width = `${box.width}px`;
  const natural = p.offsetHeight;
  const parent = (p.offsetParent as HTMLElement | null) ?? document.body;
  const area = fixed
    ? { top: 0, bottom: window.innerHeight }
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
      Math.max(box.left, margin),
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
  { gap = 6, margin = 8, fixed = false } = {},
) {
  useLayoutEffect(() => {
    const a = anchor.current;
    const p = pop.current;
    if (!open || !a || !p) return;
    const opts = { gap, margin, fixed };
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
  }, [open, anchor, pop, gap, margin, fixed]);
}
