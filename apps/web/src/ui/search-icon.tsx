import { useEffect, useRef, useState } from 'react';
import { cx } from './core';
import { LottieIcon, reducedMotion } from './animated';
import { animIcons } from './anim-icons';
const searchReveal = animIcons.search.reveal;
const searchIdle = animIcons.search.idle;
const searchComplete = animIcons.search.complete;

export const searchAnimations = [searchReveal, searchIdle, searchComplete];

/**
 * The search icon used everywhere: it draws itself in when it appears,
 * wiggles while someone types in the search box beside it, and settles once
 * they've stopped for a second. The box is found next to it, so any search
 * field can use it without wiring.
 */
export function SearchIcon({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<'reveal' | 'idle' | 'complete'>('reveal');
  const [playKey, setPlayKey] = useState(1);
  useEffect(() => {
    const field = box.current?.parentElement?.querySelector('input, textarea');
    if (!field) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const typed = () => {
      clearTimeout(timer);
      setPhase('idle');
      timer = setTimeout(() => setPhase('complete'), 1000);
    };
    field.addEventListener('input', typed);
    return () => {
      clearTimeout(timer);
      field.removeEventListener('input', typed);
    };
  }, []);
  return (
    <span ref={box} className={cx('sp-search-icon', className)}>
      <LottieIcon
        // A new file plays as soon as it has loaded.
        src={
          phase === 'reveal'
            ? searchReveal
            : phase === 'idle'
              ? searchIdle
              : searchComplete
        }
        size={size}
        solid
        playKey={playKey}
        onDone={() => {
          // Keeps wiggling for as long as they type.
          if (phase === 'idle' && !reducedMotion()) setPlayKey((k) => k + 1);
        }}
      />
    </span>
  );
}
