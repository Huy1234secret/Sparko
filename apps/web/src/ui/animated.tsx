import { useEffect, useRef, useState, type ComponentProps } from 'react';
import type { AnimationItem } from 'lottie-web';
import { Button, cx } from './core';

/**
 * Animated icons drawn from Lottie files in design-system/assets/icons.
 * The files are drawn as a dark outline over a white fill; both are
 * recoloured here so an icon picks up the colours of whatever it sits in:
 * the outline takes the text colour and the fill takes --sp-anim-fill.
 * Icons drawn as a plain white shape use `solid`, which swaps the two.
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
function loadFile(src: string) {
  let file = files.get(src);
  if (!file) {
    file = fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`Couldn’t load ${src}`);
        return res.json() as Promise<unknown>;
      })
      .then((data) => {
        recolourAll(data);
        return data;
      });
    // A failed load can be tried again next time.
    file.catch(() => files.delete(src));
    files.set(src, file);
  }
  return file;
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export type LottieIconProps = {
  src: string;
  size?: number;
  className?: string | undefined;
  /** Held animations: plays to the end while true and back while false. */
  open?: boolean | undefined;
  /** Each change plays the animation once, from `from` to the end. */
  playKey?: number | undefined;
  from?: number | undefined;
  onDone?: (() => void) | undefined;
  /** For icons drawn as a white shape: that shape takes the text colour. */
  solid?: boolean | undefined;
};

export function LottieIcon({
  src,
  size = 20,
  className,
  open,
  playKey,
  from = 0,
  onDone,
  solid,
}: LottieIconProps) {
  const box = useRef<HTMLSpanElement>(null);
  const [anim, setAnim] = useState<AnimationItem | null>(null);
  // Read when the animation loads or finishes, without reloading it.
  const latest = useRef({ open, onDone });
  useEffect(() => {
    latest.current = { open, onDone };
  });

  useEffect(() => {
    let item: AnimationItem | undefined;
    let gone = false;
    Promise.all([loadPlayer(), loadFile(src)])
      .then(([lottie, data]) => {
        if (gone || !box.current) return;
        item = lottie.loadAnimation({
          container: box.current,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          animationData: structuredClone(data),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
        });
        item.goToAndStop(latest.current.open ? item.totalFrames - 1 : 0, true);
        item.addEventListener('complete', () => latest.current.onDone?.());
        setAnim(item);
      })
      // Without the animation the space stays empty; nothing else breaks.
      .catch(() => undefined);
    return () => {
      gone = true;
      item?.destroy();
    };
  }, [src]);

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
      latest.current.onDone?.();
      return;
    }
    anim.setDirection(1);
    if (from > 0) anim.playSegments([from, anim.totalFrames], true);
    else {
      anim.resetSegments(true);
      anim.goToAndPlay(0, true);
    }
  }, [anim, playKey, from]);

  return (
    <span
      ref={box}
      className={cx('sp-lottie', solid && 'sp-lottie--solid', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
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
