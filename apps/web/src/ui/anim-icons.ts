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
/** A button-style icon: it draws in, plays on hover, and plays when pressed. */
const set = (name: string, states: string[]) =>
  Object.fromEntries(states.map((s) => [s, file(`${name}-${s}`)]));

export const animIcons = {
  authorLinkAdd: { hover: file('author-link-add-button-hover') },
  checkbox: { select: file('checkbox-button-select') },
  clone: set('clone-button', ['reveal', 'hover']) as Two,
  close: set('close-button', ['reveal', 'hover']) as Two,
  download: set('download-button', ['reveal', 'hover', 'select']) as Three,
  edit: set('edit-button', ['reveal', 'hover']) as Two,
  /** The pencil on a message, for "pick something to edit". */
  editing: { idle: file('message-studio-edit-idle') },
  folder: { hover: file('folder-icon-hover') },
  image: set('image-button', ['reveal', 'hover']) as Two,
  info: { reveal: file('info-icon-reveal'), idle: file('info-icon-idle') },
  infoBook: {
    reveal: file('info-book-icon-reveal'),
    hover: file('info-book-icon-hover'),
    open: file('info-book-icon-open'),
  },
  live: { idle: file('live-icon-idle') },
  plus: set('plus-button', ['reveal', 'hover', 'select']) as Three,
  plusMenu: { select: file('plus-menu-button-select') },
  remove: set('remove-button', ['reveal', 'hover']) as Two,
  restore: set('restore-arrow', ['reveal', 'hover', 'select']) as Three,
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
  upload: set('upload-button', ['reveal', 'hover', 'select']) as Three,
};
type Two = { reveal: string; hover: string };
type Three = Two & { select: string };
