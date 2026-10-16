import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

export const reducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const finePointer = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Tilts an element toward the pointer in 3D and moves a soft light with it.
 * Writes only to the element's own custom properties, once per frame, so the
 * browser recomposites without relayout. Off for touch and reduced motion.
 */
export function useTilt<T extends HTMLElement>(max = 5): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !finePointer() || reducedMotion()) return;
    let rect = el.getBoundingClientRect();
    let frame = 0;
    const enter = () => {
      rect = el.getBoundingClientRect();
      el.classList.add('is-tilting');
    };
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        el.style.setProperty('--tilt-x', `${((0.5 - y) * max).toFixed(2)}deg`);
        el.style.setProperty('--tilt-y', `${((x - 0.5) * max).toFixed(2)}deg`);
        el.style.setProperty('--glow-x', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--glow-y', `${(y * 100).toFixed(1)}%`);
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.classList.remove('is-tilting');
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [max]);
  return ref;
}

/** A card that leans toward the pointer. */
export function Tilt({
  as: Tag = 'div',
  className,
  max,
  style,
  children,
}: {
  as?: 'div' | 'article';
  className?: string;
  max?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useTilt<HTMLDivElement>(max);
  return (
    <Tag ref={ref} className={'sw-tilt ' + (className ?? '')} style={style}>
      {children}
    </Tag>
  );
}

/** Adds a class while the element is on screen, so off-screen motion stops. */
export function useOnScreenClass<T extends HTMLElement>(name: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver !== 'function') {
      el.classList.add(name);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      el.classList.toggle(name, !!entry?.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [name]);
  return ref;
}
