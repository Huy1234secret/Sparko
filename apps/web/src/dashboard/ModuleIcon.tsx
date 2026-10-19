import { useState } from 'react';
import { RevealIcon, animIcons, type RevealHover } from '../ui';

/** Modules with an animated icon: it draws in, then plays again on hover. */
const animated: Record<string, RevealHover | undefined> = {
  studio: animIcons.studio,
  welcome: animIcons.hand,
  'role-menus': animIcons.reactionRole,
  autoroles: animIcons.autoRole,
  suggestions: animIcons.lightBulb,
  starboard: animIcons.sparkle,
  birthdays: animIcons.sparkle,
  questions: animIcons.infoBook,
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
  return (
    <RevealIcon
      anim={animated[id]}
      fallback={icon}
      size={size}
      hoverKey={hoverKey}
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
