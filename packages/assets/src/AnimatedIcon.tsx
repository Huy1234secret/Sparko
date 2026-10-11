import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  getAsset,
  getAssetExport,
  loadAnimation,
  type AssetId,
  type AssetTheme,
  type IconState,
} from './registry';
import { shouldAnimate } from './validation';

const Player = lazy(() => import('./AnimationPlayer'));
export type MotionPreference = 'system' | 'on' | 'off';
export interface AnimatedIconProps {
  name: AssetId;
  /** Omit the label for a decorative icon next to existing text. */
  label?: string;
  size?: number;
  state?: IconState;
  motion?: MotionPreference;
  theme?: AssetTheme | 'system';
  /** Total plays, clamped to 1–3. Infinite loops are intentionally unavailable. */
  iterations?: number;
  className?: string;
  style?: CSSProperties;
}

class AnimationBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFailure();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useMediaQuery(query: string, initial: boolean): boolean {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const change = () => setMatches(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [query]);
  return matches;
}

export function AnimatedIcon({
  name,
  label,
  size = 32,
  state = 'idle',
  motion = 'system',
  theme = 'system',
  iterations = 1,
  className,
  style,
}: AnimatedIconProps) {
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [data, setData] = useState<object | null>(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  // A conservative first render avoids loading motion before browser preferences are read.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', true);
  const darkTheme = useMediaQuery('(prefers-color-scheme: dark)', false);
  const selectedTheme =
    theme === 'system' ? (darkTheme ? 'dark' : 'light') : theme;
  const motionEnabled = shouldAnimate(motion, reducedMotion);
  const activeState =
    state === 'idle'
      ? pressed
        ? 'active'
        : focus
          ? 'focus'
          : hover
            ? 'hover'
            : 'idle'
      : state;
  const playing =
    motionEnabled &&
    visible &&
    tabVisible &&
    activeState !== 'idle' &&
    activeState !== 'disabled';
  const asset = getAsset(name);
  const fallback = getAssetExport(name, 'svg', selectedTheme);
  const segment = asset.states[activeState];

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { rootMargin: '40px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () =>
      setTabVisible(document.visibilityState !== 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    setData(null);
    setRendered(false);
    setFailed(false);
  }, [name, selectedTheme]);

  useEffect(() => {
    if (!playing || data || failed) return;
    let cancelled = false;
    void loadAnimation(name, selectedTheme)
      .then((animation) => {
        if (!cancelled) setData(animation);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [name, selectedTheme, playing, data, failed]);

  const showAnimation =
    !!data && motionEnabled && !failed && activeState !== 'disabled';
  return (
    <span
      ref={root}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-icon={name}
      data-state={activeState}
      data-motion={motionEnabled ? 'on' : 'off'}
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        position: 'relative',
        flexShrink: 0,
        verticalAlign: 'middle',
        ...style,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={() => {
        setFocus(false);
        setPressed(false);
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    >
      <img
        src={fallback?.url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          opacity: rendered && showAnimation ? 0 : 1,
        }}
      />
      {showAnimation && (
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          <AnimationBoundary
            key={`${name}:${selectedTheme}`}
            onFailure={() => {
              setFailed(true);
              setRendered(false);
            }}
          >
            <Suspense fallback={null}>
              <Player
                data={data}
                state={activeState}
                playing={playing}
                iterations={iterations}
                segment={segment}
                onReady={() => setRendered(true)}
                onFailure={() => {
                  setFailed(true);
                  setRendered(false);
                }}
              />
            </Suspense>
          </AnimationBoundary>
        </span>
      )}
    </span>
  );
}
