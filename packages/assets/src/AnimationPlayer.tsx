import { useEffect, useRef, useState } from 'react';
import { LottieLight, type LottieHandle } from 'lottie-react';
import type { IconState } from './registry';
import { boundedIterations } from './validation';

interface AnimationPlayerProps {
  data: object;
  state: IconState;
  playing: boolean;
  iterations: number;
  segment: readonly [number, number];
  onReady: () => void;
  onFailure: () => void;
}

/** Loaded as a separate chunk so a static icon never downloads the player. */
export default function AnimationPlayer({
  data,
  state,
  playing,
  iterations,
  segment,
  onReady,
  onFailure,
}: AnimationPlayerProps) {
  const handle = useRef<LottieHandle>(null);
  const [ready, setReady] = useState(false);
  const cycle = useRef({
    state: 'idle' as IconState,
    completed: 0,
    exhausted: false,
  });
  const allowedIterations = boundedIterations(iterations);

  useEffect(() => {
    if (!ready) return;
    const player = handle.current;
    if (!player) return;
    if (state === 'idle' || state === 'disabled') {
      player.stop();
      cycle.current = { state, completed: 0, exhausted: false };
    } else if (!playing) {
      player.pause();
    } else if (cycle.current.state !== state) {
      cycle.current = { state, completed: 0, exhausted: false };
      player.playSegments(segment);
    } else if (!cycle.current.exhausted) {
      player.play();
    }
  }, [ready, playing, state, segment]);

  return (
    <LottieLight
      src={data}
      as="span"
      lottieRef={handle}
      autoplay={false}
      loop={false}
      rendererSettings={{
        runExpressions: false,
        preserveAspectRatio: 'xMidYMid meet',
      }}
      style={{ display: 'block', height: '100%', width: '100%' }}
      aria-hidden="true"
      subscriptions={{
        ready: () => {
          setReady(true);
          onReady();
        },
        error: onFailure,
        complete: () => {
          cycle.current.completed += 1;
          if (playing && cycle.current.completed < allowedIterations)
            handle.current?.playSegments(segment);
          else cycle.current.exhausted = true;
        },
      }}
    />
  );
}
