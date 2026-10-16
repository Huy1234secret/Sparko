import { useEffect, useRef, useState, type ComponentProps } from 'react';
import type { AnimationItem } from 'lottie-web';
import { Button, Icon, cx } from './core';
import { animIcons } from './anim-icons';

/**
 * Animated icons drawn from Lottie files in design-system/assets/icons.
 * The files are drawn as a dark outline over a white fill; both are
 * recoloured here so an icon picks up the colours of whatever it sits in:
 * the outline takes the text colour and the fill takes --sp-anim-fill.
 * Icons drawn as a plain white shape use `solid`, which swaps the two, and
 * `original` keeps the file's own colours.
 */
type Lottie = typeof import('lottie-web/build/player/lottie_light').default;

let player: Promise<Lottie> | undefined;
const loadPlayer = () =>
  (player ??= import('lottie-web/build/player/lottie_light').then(
    (m) => m.default,
  ));

const files = new Map<string, Promise<unknown>>();

type Colour = number[];
const OUTLINE = [0, 0, 0, 1];
const FILL = [1, 1, 1, 1];
const ACCENT = [1, 0, 0, 1];
/** Light greys become the fill, dark ones the outline, anything else the accent. */
function recolour([r = 0, g = 0, b = 0, a = 1]: Colour): Colour {
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const base =
    spread > 0.25
      ? ACCENT
      : 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
        ? FILL
        : OUTLINE;
  return [...base.slice(0, 3), a];
}
function recolourAll(node: unknown) {
  if (Array.isArray(node)) node.forEach(recolourAll);
  else if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    if ((n.ty === 'fl' || n.ty === 'st') && n.c && typeof n.c === 'object') {
      const c = n.c as { a?: number; k?: unknown };
      if (Array.isArray(c.k) && typeof c.k[0] === 'number')
        c.k = recolour(c.k as Colour);
      else if (Array.isArray(c.k))
        for (const key of c.k as { s?: Colour; e?: Colour }[]) {
          if (key.s) key.s = recolour(key.s);
          if (key.e) key.e = recolour(key.e);
        }
    }
    Object.values(n).forEach(recolourAll);
  }
}
/** How thin an outline may be on screen, in pixels. */
const MIN_STROKE = 1.5;
/**
 * Many files are drawn on a large canvas with fine lines that nearly vanish
 * at icon size; this widens any outline thinner than MIN_STROKE once drawn
 * at `size`. Files that keep their own look are left alone.
 */
function thicken(data: unknown, size: number, keepLook: boolean) {
  const canvas = (data as { w?: number }).w;
  if (keepLook || !canvas) return data;
  const least = (MIN_STROKE * canvas) / size;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const n = node as Record<string, unknown>;
      const w = n.ty === 'st' ? (n.w as { k?: unknown } | undefined) : null;
      if (w && typeof w.k === 'number') {
        // Hairlines (under a quarter pixel) are part of a shape's look.
        if (w.k >= least / 6 && w.k < least) w.k = least;
      }
      // Animated widths are effects (a ring growing, say) and stay as drawn.
      Object.values(n).forEach(walk);
    }
  };
  walk(data);
  return data;
}

function loadFile(src: string, keepColours: boolean) {
  const key = `${keepColours ? 'own' : 'themed'}:${src}`;
  let file = files.get(key);
  if (!file) {
    file = fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`Couldn’t load ${src}`);
        return res.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!keepColours) recolourAll(data);
        return data;
      });
    // A failed load can be tried again next time.
    file.catch(() => files.delete(key));
    files.set(key, file);
  }
  return file;
}

export const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Starts loading the player and some animation files ahead of time, so
 * icons play at once the first time they're needed.
 */
export function preloadAnimations(srcs: string[], keepColours = false) {
  const go = () => {
    void loadPlayer().catch(() => undefined);
    for (const src of srcs)
      void loadFile(src, keepColours).catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === 'function')
    window.requestIdleCallback(go, { timeout: 1500 });
  else setTimeout(go, 200);
}

export type LottieIconProps = {
  src: string;
  size?: number;
  className?: string | undefined;
  /** Held animations: plays to the end while true and back while false. */
  open?: boolean | undefined;
  /** Each change plays the animation once, from `from` to `to` (or the end). */
  playKey?: number | undefined;
  from?: number | undefined;
  to?: number | undefined;
  /** Shows this frame once the animation has loaded. */
  startAt?: number | undefined;
  onDone?: (() => void) | undefined;
  /** For icons drawn as a white shape: that shape takes the text colour. */
  solid?: boolean | undefined;
  /** Keeps the file's own colours instead of the dashboard's. */
  original?: boolean | undefined;
};

export function LottieIcon({
  src,
  size = 20,
  className,
  open,
  playKey,
  from = 0,
  to,
  startAt,
  onDone,
  solid,
  original,
}: LottieIconProps) {
  const box = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState<{
    item: AnimationItem;
    src: string;
  } | null>(null);
  // While a new file loads, the old one isn't played in its place: hovering
  // an icon swaps to its hover animation, and the reveal shouldn't replay.
  const anim = loaded?.src === src ? loaded.item : null;
  // Read when the animation loads or finishes, without reloading it.
  const latest = useRef({ open, onDone, startAt });
  useEffect(() => {
    latest.current = { open, onDone, startAt };
  });

  // The animation on screen; a new file replaces it only once it's ready,
  // so switching animations never leaves the icon blank.
  const shown = useRef<{ item: AnimationItem; el: HTMLElement } | null>(null);
  useEffect(() => {
    let gone = false;
    Promise.all([loadPlayer(), loadFile(src, !!original)])
      .then(([lottie, data]) => {
        if (gone || !box.current) return;
        const el = document.createElement('span');
        el.className = 'sp-lottie__frame';
        box.current.append(el);
        const item = lottie.loadAnimation({
          container: el,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          animationData: thicken(structuredClone(data), size, !!original),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
        });
        item.goToAndStop(
          latest.current.startAt ??
            (latest.current.open ? item.totalFrames - 1 : 0),
          true,
        );
        item.addEventListener('complete', () => latest.current.onDone?.());
        shown.current?.item.destroy();
        shown.current?.el.remove();
        shown.current = { item, el };
        setLoaded({ item, src });
      })
      // Without the animation the space stays empty; nothing else breaks.
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [src, original, size]);
  useEffect(
    () => () => {
      shown.current?.item.destroy();
      shown.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!anim || open === undefined) return;
    if (reducedMotion()) {
      anim.goToAndStop(open ? anim.totalFrames - 1 : 0, true);
      return;
    }
    anim.setDirection(open ? 1 : -1);
    anim.play();
  }, [anim, open]);

  useEffect(() => {
    if (!anim || !playKey) return;
    if (reducedMotion()) {
      // Jump to where the animation would have ended.
      if (to !== undefined) anim.goToAndStop(Math.max(0, to - 1), true);
      latest.current.onDone?.();
      return;
    }
    anim.setDirection(1);
    if (from > 0 || to !== undefined)
      anim.playSegments([from, to ?? anim.totalFrames], true);
    else {
      anim.resetSegments(true);
      anim.goToAndPlay(0, true);
    }
  }, [anim, playKey, from, to]);

  return (
    <span
      ref={box}
      className={cx(
        'sp-lottie',
        solid && 'sp-lottie--solid',
        original && 'sp-lottie--original',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

/** An icon that plays, waits `delay` milliseconds, and plays again, for as long as it's shown. */
export function LoopIcon({
  delay,
  ...props
}: Omit<LottieIconProps, 'playKey' | 'onDone' | 'open'> & { delay: number }) {
  const [playKey, setPlayKey] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <LottieIcon
      {...props}
      playKey={playKey}
      onDone={() => {
        if (reducedMotion()) return;
        timer.current = setTimeout(() => setPlayKey((k) => k + 1), delay);
      }}
    />
  );
}

/** A button whose icon plays through once each time the pointer comes over it. */
export function AnimatedButton({
  anim,
  solid,
  children,
  onPointerEnter,
  ...rest
}: ComponentProps<typeof Button> & { anim: string; solid?: boolean }) {
  const [playKey, setPlayKey] = useState(0);
  return (
    <Button
      {...rest}
      onPointerEnter={(e) => {
        setPlayKey((k) => k + 1);
        onPointerEnter?.(e);
      }}
    >
      <LottieIcon src={anim} size={20} playKey={playKey} solid={solid} />
      {children}
    </Button>
  );
}

/**
 * An icon that draws in, then plays its hover each time `hoverKey`
 * changes. Without its animation files it shows the still `fallback`.
 */
export function RevealIcon({
  anim,
  fallback,
  size = 20,
  hoverKey = 0,
  className,
}: {
  anim: { reveal: string; hover: string; solid?: boolean } | undefined;
  fallback: string;
  size?: number;
  hoverKey?: number;
  className?: string;
}) {
  if (!anim) return <Icon name={fallback} className={className} />;
  return (
    <LottieIcon
      className={cx('sp-i sp-module-icon', className)}
      src={hoverKey ? anim.hover : anim.reveal}
      size={size}
      playKey={hoverKey + 1}
      solid={!!anim.solid}
    />
  );
}

/** The checkbox's box: it fills in when ticked (frames 0–30) and empties when unticked (90–120). */
export function AnimatedCheck({
  checked,
  size = 20,
}: {
  checked: boolean;
  size?: number;
}) {
  // Each change of `checked` plays its half once.
  const [shown, setShown] = useState({ checked, key: 0 });
  if (shown.checked !== checked) setShown({ checked, key: shown.key + 1 });
  return (
    <LottieIcon
      className="sp-anim-check"
      src={animIcons.checkbox.select}
      size={size}
      solid
      startAt={checked ? 30 : 0}
      playKey={shown.key}
      from={checked ? 0 : 90}
      to={checked ? 30 : 120}
    />
  );
}
