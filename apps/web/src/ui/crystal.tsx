import { useState } from 'react';
import { animIcons } from './anim-icons';
import { LottieIcon, preloadAnimations, reducedMotion } from './animated';

const crystal = animIcons.crystal.loop;

/** Fetches the player and the crystal early, so it shows straight away. */
export const preloadCrystal = () => preloadAnimations([crystal], true);

/** Sparko's S as a turning golden crystal, looping. */
export function Crystal({ size = 112 }: { size?: number }) {
  const [loop, setLoop] = useState(1);
  return (
    <LottieIcon
      src={crystal}
      size={size}
      playKey={reducedMotion() ? undefined : loop}
      onDone={() => setLoop((n) => n + 1)}
      original
    />
  );
}
