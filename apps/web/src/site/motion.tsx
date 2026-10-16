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

/**
 * Little diamond sparks, the one in Sparko's logo, burst from primary
 * buttons and the logo when they're clicked. Uses the Web Animations API on
 * a fixed layer, transform and opacity only, and cleans up after itself.
 */
export function useSparkBursts() {
  useEffect(() => {
    if (reducedMotion() || typeof document.body.animate !== 'function') return;
    let layer: HTMLDivElement | null = null;
    const burst = (x: number, y: number) => {
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'sw-sparks-layer';
        layer.setAttribute('aria-hidden', 'true');
        document.body.append(layer);
      }
      const count = 12;
      for (let i = 0; i < count; i++) {
        const spark = document.createElement('i');
        spark.className =
          'sw-spark' + ['', ' sw-spark--edge', ' sw-spark--ink'][i % 3];
        const size = 7 + Math.random() * 6;
        spark.style.width = spark.style.height = `${size}px`;
        layer.append(spark);
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 44 + Math.random() * 72;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 12;
        const from = `translate(${x - size / 2}px, ${y - size / 2}px)`;
        spark
          .animate(
            [
              {
                transform: `${from} rotate(45deg) scale(0.5)`,
                opacity: 1,
                easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
              },
              {
                transform: `${from} translate(${dx * 0.75}px, ${
                  dy * 0.75
                }px) rotate(160deg) scale(1.15)`,
                opacity: 1,
                offset: 0.4,
                easing: 'cubic-bezier(0.4, 0, 1, 1)',
              },
              {
                transform: `${from} translate(${dx}px, ${dy + 18}px) rotate(${
                  250 + Math.random() * 120
                }deg) scale(0.3)`,
                opacity: 0,
              },
            ],
            { duration: 700 + Math.random() * 300 },
          )
          .finished.then(
            () => spark.remove(),
            () => spark.remove(),
          );
      }
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(
        '.sw .sp-btn--primary, .sw .sw-btn-ink, .sw-logo',
      );
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Keyboard clicks have no pointer position: burst from the middle.
      const x = e.clientX || r.left + r.width / 2;
      const y = e.clientY || r.top + r.height / 2;
      burst(x, y);
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      layer?.remove();
    };
  }, []);
}

/**
 * A soft light that trails the pointer across an area. It eases toward the
 * pointer each frame (transform only) and stops its loop once it has caught up.
 */
export function usePointerGlow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const glow = ref.current;
    const area = glow?.parentElement;
    if (!glow || !area || !finePointer() || reducedMotion()) return;
    let frame = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    const step = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      glow.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      frame =
        Math.abs(tx - x) + Math.abs(ty - y) > 0.5
          ? requestAnimationFrame(step)
          : 0;
    };
    const move = (e: PointerEvent) => {
      const r = area.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!glow.classList.contains('is-on')) {
        x = tx;
        y = ty;
        glow.classList.add('is-on');
      }
      if (!frame) frame = requestAnimationFrame(step);
    };
    const leave = () => glow.classList.remove('is-on');
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerleave', leave);
    };
  }, []);
  return ref;
}

/** A soft yellow light that trails the pointer across its parent. */
export function PointerGlow() {
  const glow = usePointerGlow<HTMLDivElement>();
  return <div className="sw-hero__glow" ref={glow} aria-hidden="true" />;
}

/**
 * Lets people grab the module orbit and fling it, and nudges it along as the
 * page scrolls. It moves the orbit's own CSS animations forward or back, so
 * the cards keep travelling on the compositor-friendly path they already use.
 */
export function useOrbitControl(stageRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reducedMotion() || typeof stage.getAnimations !== 'function')
      return;
    const orbiting = () =>
      stage
        .getAnimations({ subtree: true })
        .filter(
          (a) => (a as CSSAnimation).animationName === 'sw-orbit',
        ) as CSSAnimation[];
    const time = (a: Animation) => Number(a.currentTime) || 0;
    const nudge = (ms: number) => {
      for (const a of orbiting()) a.currentTime = time(a) + ms;
    };
    // Start every card many laps in, so dragging backwards never runs past
    // the start of an animation. Positions don't change: a lap is a lap.
    const lap = (orbiting()[0]?.effect?.getTiming().duration as number) || 0;
    if (lap) nudge(lap * 20);

    // Hovering anywhere on the orbit, or moving keyboard focus into it, eases
    // both arcs to a stop together; leaving eases them back up to speed.
    let rate = 1;
    let target = 1;
    let rateFrame = 0;
    const stepRate = () => {
      rate += (target - rate) * 0.14;
      if (Math.abs(target - rate) < 0.01) rate = target;
      for (const a of orbiting()) a.playbackRate = rate;
      rateFrame = rate === target ? 0 : requestAnimationFrame(stepRate);
    };
    const ease = (to: number) => {
      target = to;
      if (!rateFrame) rateFrame = requestAnimationFrame(stepRate);
    };
    // Whether the pointer is over the orbit is worked out from its box, not
    // from hover events, so the gaps between cards and the heading count in
    // every browser, whatever it decides is under the pointer.
    let px = -1;
    let py = -1;
    let over = false;
    let checkFrame = 0;
    const focusedInside = () => !!stage.querySelector(':focus-visible');
    const settle = () => ease(over || focusedInside() ? 0 : 1);
    const check = () => {
      checkFrame = 0;
      const r = stage.getBoundingClientRect();
      const now =
        px >= Math.max(r.left, 0) &&
        px <= Math.min(r.right, window.innerWidth) &&
        py >= r.top &&
        py <= r.bottom;
      if (now !== over) {
        over = now;
        settle();
      }
    };
    const recheck = () => {
      if (!checkFrame) checkFrame = requestAnimationFrame(check);
    };
    const track = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      px = e.clientX;
      py = e.clientY;
      recheck();
    };
    const away = () => {
      px = py = -1;
      recheck();
    };
    const hold = () => ease(0);
    const release = (e: Event) => {
      // Keyboard focus moving to another card keeps it stopped.
      const next = (e as FocusEvent).relatedTarget as Element | null;
      if (next && stage.contains(next) && next.matches(':focus-visible'))
        return;
      requestAnimationFrame(settle);
    };

    let drag: {
      id: number;
      x: number;
      msPerPx: number;
      moved: boolean;
      v: number;
      t: number;
    } | null = null;
    let fling = 0;
    let swallowClick = false;

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      cancelAnimationFrame(fling);
      // Measure how far the card nearest the pointer moves per millisecond,
      // so the orbit follows the pointer exactly on whichever arc it's on.
      let nearest: HTMLElement | null = null;
      let best = Infinity;
      for (const item of Array.from(
        stage.querySelectorAll<HTMLElement>('.sw-orbit__item'),
      )) {
        const r = item.getBoundingClientRect();
        const d = Math.hypot(
          r.left + r.width / 2 - e.clientX,
          r.top + r.height / 2 - e.clientY,
        );
        if (d < best) [best, nearest] = [d, item];
      }
      const anim = nearest?.getAnimations()[0];
      if (!nearest || !anim) return;
      const before = nearest.getBoundingClientRect().left;
      anim.currentTime = time(anim) + 200;
      const after = nearest.getBoundingClientRect().left;
      anim.currentTime = time(anim) - 200;
      const pxPerMs = (after - before) / 200;
      if (Math.abs(pxPerMs) < 0.001) return;
      drag = {
        id: e.pointerId,
        x: e.clientX,
        msPerPx: 1 / pxPerMs,
        moved: false,
        v: 0,
        t: e.timeStamp,
      };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 6) return;
        drag.moved = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('is-dragging');
      }
      const dt = Math.max(1, e.timeStamp - drag.t);
      drag.v = drag.v * 0.6 + (dx / dt) * 0.4;
      drag.x = e.clientX;
      drag.t = e.timeStamp;
      nudge(dx * drag.msPerPx);
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { moved, msPerPx } = drag;
      let v = drag.v;
      drag = null;
      stage.classList.remove('is-dragging');
      if (!moved) return;
      swallowClick = true;
      let last = performance.now();
      const glide = (now: number) => {
        const dt = now - last;
        last = now;
        nudge(v * dt * msPerPx);
        v *= Math.pow(0.94, dt / 16);
        fling = Math.abs(v) > 0.02 ? requestAnimationFrame(glide) : 0;
      };
      fling = requestAnimationFrame(glide);
    };
    // A drag that ends on a card shouldn't also open it.
    const click = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    let lastY = window.scrollY;
    let pending = 0;
    let scrollFrame = 0;
    const scroll = () => {
      pending += Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
      if (scrollFrame || !stage.classList.contains('is-moving')) return;
      scrollFrame = requestAnimationFrame(() => {
        nudge(Math.min(pending, 400) * 6);
        pending = 0;
        scrollFrame = 0;
      });
    };

    document.addEventListener('pointermove', track, { passive: true });
    document.documentElement.addEventListener('pointerleave', away);
    window.addEventListener('scroll', recheck, { passive: true });
    stage.addEventListener('focusin', hold);
    stage.addEventListener('focusout', release);
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('click', click, true);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      cancelAnimationFrame(fling);
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(rateFrame);
      cancelAnimationFrame(checkFrame);
      document.removeEventListener('pointermove', track);
      document.documentElement.removeEventListener('pointerleave', away);
      window.removeEventListener('scroll', recheck);
      stage.removeEventListener('focusin', hold);
      stage.removeEventListener('focusout', release);
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
      stage.removeEventListener('click', click, true);
      window.removeEventListener('scroll', scroll);
    };
  }, [stageRef]);
}
