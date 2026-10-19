/**
 * Every animated icon by a short name, so pages can reuse them without
 * long file paths: `animIcons.plus.hover`, `animIcons.studio.reveal`.
 * The files live in design-system/assets/icons/animated-icons.
 */
const files = import.meta.glob<string>(
  '../../../../design-system/assets/icons/animated-icons/*.json',
  { query: '?url', import: 'default', eager: true },
);
const file = (name: string) => {
  const url =
    files[`../../../../design-system/assets/icons/animated-icons/${name}.json`];
  if (!url) throw new Error(`No animated icon called ${name}`);
  return url;
};
/**
 * An icon that draws in and plays on hover, or undefined until its files
 * are added, so pages fall back to a still icon.
 */
const pair = (name: string, solid = false): Two | undefined => {
  const at = (s: string) =>
    files[
      `../../../../design-system/assets/icons/animated-icons/${name}-${s}.json`
    ];
  const reveal = at('reveal');
  const hover = at('hover');
  return reveal && hover
    ? { reveal, hover, ...(solid ? { solid } : {}) }
    : undefined;
};
/** A single animation file, or undefined until it's added. */
const maybe = (name: string) =>
  files[`../../../../design-system/assets/icons/animated-icons/${name}.json`];
/** A reveal and hover pair named any of the ways the files are named. */
const pairOf = (...names: [string, string][]): Two | undefined => {
  for (const [r, h] of names) {
    const reveal = maybe(r);
    const hover = maybe(h);
    if (reveal && hover) return { reveal, hover };
  }
  return undefined;
};
/** A button-style icon: it draws in, plays on hover, and plays when pressed. */
const set = <K extends string>(name: string, states: K[]) =>
  Object.fromEntries(states.map((s) => [s, file(`${name}-${s}`)])) as Record<
    K,
    string
  >;

export const animIcons = {
  authorLinkAdd: { hover: file('author-link-add-button-hover') },
  checkbox: { select: file('checkbox-button-select') },
  /** Sparko's S as a turning golden crystal, for the loading screen. */
  crystal: { loop: file('crystal-logo-loop') },
  clone: set('clone-button', ['reveal', 'hover']),
  close: set('close-button', ['reveal', 'hover']),
  download: set('download-button', ['reveal', 'hover', 'select']),
  edit: set('edit-button', ['reveal', 'hover']),
  /** The pencil on a message, for "pick something to edit". */
  editing: { idle: file('message-studio-edit-idle') },
  folder: { hover: file('folder-icon-hover') },
  image: set('image-button', ['reveal', 'hover']),
  info: { reveal: file('info-icon-reveal'), idle: file('info-icon-idle') },
  infoBook: {
    reveal: file('info-book-icon-reveal'),
    hover: file('info-book-icon-hover'),
    open: file('info-book-icon-open'),
  },
  live: { idle: file('live-icon-idle') },
  plus: set('plus-button', ['reveal', 'hover', 'select']),
  plusMenu: { select: file('plus-menu-button-select') },
  remove: set('remove-button', ['reveal', 'hover']),
  restore: set('restore-arrow', ['reveal', 'hover', 'select']),
  search: {
    reveal: file('search-icon-reveal'),
    idle: file('search-icon-idle'),
    hover: file('search-icon-hover'),
    complete: file('search-icon-complete'),
  },
  setting: { hover: file('setting-icon-hover') },
  /** Message Studio's sidebar and header icon. */
  studio: {
    reveal: file('sidebar-message-studio-reveal'),
    hover: file('sidebar-message-studio-hover'),
  },
  theme: {
    darkHover: file('dark-mode-hover'),
    lightHover: file('light-mode-hover'),
    /** Dark at frame 0, light at 30, dark again at 60. */
    switch: file('dark-light-mode-select'),
  },
  tick: { reveal: file('tick-reveal') },
  /** Welcome messages: the module, its tabs, and its sparkle buttons. */
  hand: pair('hand-wave-icon'),
  joinMessage: pair('join-message-icon'),
  // Drawn as a plain white shape, unlike the other three.
  leaveMessage: pair('leave-message-icon', true),
  boostMessage: pair('boost-message-icon'),
  log: pair('log-icon'),
  sparkle: pair('sparkle-icon'),
  /** Reaction roles: the module, and the Editor and Templates tabs. */
  reactionRole: pair('reaction-role-icon'),
  settingOutline: pair('setting-icon-outline', true),
  template: pair('template-icon'),
  shuffle: pair('shuffle-icon'),
  /** Automatic roles. */
  autoRole: pair('automatic-role-icon'),
  /** Suggestions: the module, and its Commands tab. */
  lightBulb: pairOf(
    ['light-bulb-icon-reveal', 'light-bulb-icon-hover'],
    ['light-bulb-reveal-icon', 'light-bulb-hover-icon'],
    ['light-bulb-reveal-icon', 'light-bulb-icon-hover'],
  ),
  // Drawn as a plain white shape.
  command: pair('command-icon', true),
  /** Storage tabs. */
  storage: pair('storage-icon'),
  /** The gear that plays beside a rule count. */
  gear: maybe('setting-icon-hover'),
  upload: set('upload-button', ['reveal', 'hover', 'select']),
};
export type RevealHover = {
  reveal: string;
  hover: string;
  /** Drawn as a plain white shape (see LottieIcon's `solid`). */
  solid?: boolean;
};
type Two = RevealHover;

const svgs = import.meta.glob<string>(
  '../../../../design-system/assets/icons/animated-icons/*.svg',
  { query: '?url', import: 'default', eager: true },
);
const svg = (name: string) =>
  svgs[`../../../../design-system/assets/icons/animated-icons/${name}.svg`] ??
  '';
/** Still icons that sit beside the animated ones. */
export const svgIcons = {
  reactionRole: svg('reaction-role-icon'),
  welcomeTag: svg('tag-welcome-message'),
  sandClock: svg('sand-clock-icon'),
  status: svg('status-icon'),
};
