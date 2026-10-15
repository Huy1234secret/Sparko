import { useState } from 'react';
import { Icon, LottieIcon } from '../ui';
import { animIcons } from '../ui';
const studioReveal = animIcons.studio.reveal;
const studioHover = animIcons.studio.hover;

/** Modules with an animated icon: it draws in, then plays again on hover. */
const animated: Record<string, { reveal: string; hover: string }> = {
  studio: { reveal: studioReveal, hover: studioHover },
};

/**
 * A module's icon. Animated ones play their hover each time `hoverKey`
 * changes, so whatever holds the icon decides what counts as hovering.
 */
export function ModuleIcon({
  id,
  icon,
  size = 24,
  hoverKey = 0,
}: {
  id: string;
  icon: string;
  size?: number;
  hoverKey?: number;
}) {
  const files = animated[id];
  if (!files) return <Icon name={icon} />;
  return (
    <LottieIcon
      className="sp-i sp-module-icon"
      src={hoverKey ? files.hover : files.reveal}
      size={size}
      playKey={hoverKey + 1}
    />
  );
}

/** For whatever holds a module icon: hovering it plays the icon's hover. */
export function useIconHover() {
  const [hoverKey, setHoverKey] = useState(0);
  return {
    hoverKey,
    onPointerEnter: () => setHoverKey((k) => k + 1),
  };
}
