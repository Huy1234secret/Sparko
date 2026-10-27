/**
 * Image studio: pictures made in the dashboard. An image is saved as its
 * design (the canvas, a background and layers on top), so it can be opened
 * and changed again; the browser draws the design into a PNG for Discord.
 */

export const IMAGE_MIN_SIDE = 16;
export const IMAGE_MAX_SIDE = 2048;
export const IMAGE_MAX_LAYERS = 100;
export const IMAGE_MAX_TEXT = 2000;

/** How many images each plan can keep. */
export const imageLimits = (plan: 'free' | 'plus' | undefined) =>
  plan === 'plus' ? 200 : 25;

/** The ready-made sizes a new image can start from. */
export const imageSizes = [
  { id: 'embed', label: 'Embed image', width: 1200, height: 630 },
  { id: 'welcome', label: 'Welcome card', width: 1024, height: 500 },
  { id: 'banner', label: 'Server banner', width: 960, height: 540 },
  { id: 'icon', label: 'Server icon or emoji', width: 512, height: 512 },
  { id: 'square', label: 'Square post', width: 1080, height: 1080 },
] as const;

/** Fonts the editor offers; the site serves each one itself. */
export const imageFonts = ['Inter'] as const;

export type ImageFill =
  | { kind: 'colour'; colour: string }
  | { kind: 'gradient'; from: string; to: string; angle: number };
export type ImageBackground =
  | ImageFill
  | { kind: 'picture'; url: string; colour: string };

type Box = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** 0 to 1. */
  opacity: number;
  hidden: boolean;
  locked: boolean;
};
export type TextLayer = Box & {
  kind: 'text';
  text: string;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  colour: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  /** An outline around the letters; width 0 means none. */
  outline: string;
  outlineWidth: number;
};
export type ShapeLayer = Box & {
  kind: 'shape';
  shape: 'rect' | 'ellipse';
  fill: ImageFill;
  border: string;
  borderWidth: number;
  /** Rounded corners, for rectangles. */
  radius: number;
};
export type PictureLayer = Box & {
  kind: 'picture';
  url: string;
  radius: number;
  flipX: boolean;
  flipY: boolean;
};
export type ImageLayer = TextLayer | ShapeLayer | PictureLayer;
export type ImageDesign = {
  width: number;
  height: number;
  background: ImageBackground;
  /** Bottom first: later layers are drawn on top. */
  layers: ImageLayer[];
};

export const blankDesign = (width: number, height: number): ImageDesign => ({
  width,
  height,
  background: { kind: 'colour', colour: '#ffffff' },
  layers: [],
});

/** A design that starts as an uploaded picture, at the picture's own size. */
export function pictureDesign(url: string, width: number, height: number) {
  // A big photo is scaled down to fit, keeping its shape.
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(width, height));
  const w = Math.max(IMAGE_MIN_SIDE, Math.round(width * scale));
  const h = Math.max(IMAGE_MIN_SIDE, Math.round(height * scale));
  const design = blankDesign(w, h);
  design.layers.push({
    ...box('l1', 'Picture', 0, 0, w, h),
    kind: 'picture',
    url,
    radius: 0,
    flipX: false,
    flipY: false,
  });
  return design;
}

const box = (
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Box => ({
  id,
  name,
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  hidden: false,
  locked: false,
});

/** A new layer of each kind, placed in the middle of the canvas. */
export function newLayer(
  kind: 'text' | 'rect' | 'ellipse' | 'picture',
  design: ImageDesign,
  id: string,
  extra: { url?: string; width?: number; height?: number } = {},
): ImageLayer {
  const { width: W, height: H } = design;
  const centred = (w: number, h: number, name: string) =>
    box(id, name, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
  if (kind === 'text') {
    const size = Math.max(16, Math.round(Math.min(W, H) / 10));
    const w = Math.min(W, size * 8);
    return {
      ...centred(w, Math.round(size * 1.2), 'Text'),
      kind: 'text',
      text: 'Your text',
      font: 'Inter',
      size,
      bold: true,
      italic: false,
      colour: '#111827',
      align: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      outline: '#000000',
      outlineWidth: 0,
    };
  }
  if (kind === 'picture') {
    // Fits inside two thirds of the canvas, keeping the picture's shape.
    const pw = extra.width || W;
    const ph = extra.height || H;
    const scale = Math.min((W * 2) / 3 / pw, (H * 2) / 3 / ph, 1);
    return {
      ...centred(
        Math.max(1, Math.round(pw * scale)),
        Math.max(1, Math.round(ph * scale)),
        'Picture',
      ),
      kind: 'picture',
      url: extra.url ?? '',
      radius: 0,
      flipX: false,
      flipY: false,
    };
  }
  const side = Math.round(Math.min(W, H) / 3);
  return {
    ...centred(side, side, kind === 'rect' ? 'Rectangle' : 'Circle'),
    kind: 'shape',
    shape: kind,
    fill: { kind: 'colour', colour: '#5865f2' },
    border: '#000000',
    borderWidth: 0,
    radius: 0,
  };
}

const COLOUR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Whether a picture link can be used. The sample data keeps uploads in the
 * browser as blob: links, so the dashboard allows those too.
 */
const pictureUrl = (v: unknown, blob: boolean) =>
  typeof v === 'string' &&
  v.length <= 2048 &&
  (/^https?:\/\/\S+$/.test(v) || (blob && /^blob:\S+$/.test(v)));

function fillProblem(f: unknown, what: string): string | null {
  if (!isObj(f)) return `The ${what} is missing.`;
  if (f.kind === 'colour')
    return COLOUR.test(String(f.colour))
      ? null
      : `The ${what} colour isn’t valid.`;
  if (f.kind === 'gradient')
    return COLOUR.test(String(f.from)) &&
      COLOUR.test(String(f.to)) &&
      finite(f.angle)
      ? null
      : `The ${what} gradient isn’t valid.`;
  return `The ${what} isn’t valid.`;
}

/** What's wrong with a design, in words, or null when it can be saved. */
export function imageProblem(
  input: unknown,
  { blob = false }: { blob?: boolean } = {},
): string | null {
  if (!isObj(input)) return 'The image is missing.';
  const { width, height, background, layers } = input;
  const side = (v: unknown) =>
    Number.isInteger(v) &&
    (v as number) >= IMAGE_MIN_SIDE &&
    (v as number) <= IMAGE_MAX_SIDE;
  if (!side(width) || !side(height))
    return `Images can be ${IMAGE_MIN_SIDE} to ${IMAGE_MAX_SIDE} pixels on each side.`;
  if (!isObj(background)) return 'The background is missing.';
  if (background.kind === 'picture') {
    if (!pictureUrl(background.url, blob))
      return 'The background picture’s link isn’t valid.';
    if (!COLOUR.test(String(background.colour)))
      return 'The background colour isn’t valid.';
  } else {
    const p = fillProblem(background, 'background');
    if (p) return p;
  }
  if (!Array.isArray(layers)) return 'The layers are missing.';
  if (layers.length > IMAGE_MAX_LAYERS)
    return `An image can have up to ${IMAGE_MAX_LAYERS} layers.`;
  const ids = new Set<string>();
  for (const l of layers as unknown[]) {
    if (!isObj(l)) return 'A layer isn’t valid.';
    const name = typeof l.name === 'string' ? l.name : 'A layer';
    if (typeof l.id !== 'string' || !l.id || l.id.length > 40 || ids.has(l.id))
      return 'A layer isn’t valid.';
    ids.add(l.id);
    if (typeof l.name !== 'string' || l.name.length > 80)
      return 'Layer names can be up to 80 characters.';
    if (
      ![l.x, l.y, l.width, l.height, l.rotation, l.opacity].every(finite) ||
      (l.width as number) <= 0 ||
      (l.height as number) <= 0 ||
      (l.opacity as number) < 0 ||
      (l.opacity as number) > 1 ||
      Math.abs(l.x as number) > IMAGE_MAX_SIDE * 4 ||
      Math.abs(l.y as number) > IMAGE_MAX_SIDE * 4 ||
      (l.width as number) > IMAGE_MAX_SIDE * 8 ||
      (l.height as number) > IMAGE_MAX_SIDE * 8
    )
      return `${name}’s size or place isn’t valid.`;
    if (typeof l.hidden !== 'boolean' || typeof l.locked !== 'boolean')
      return `${name} isn’t valid.`;
    if (l.kind === 'text') {
      if (typeof l.text !== 'string' || l.text.length > IMAGE_MAX_TEXT)
        return `Text can be up to ${IMAGE_MAX_TEXT} characters.`;
      if (typeof l.font !== 'string' || !l.font || l.font.length > 60)
        return `${name}’s font isn’t valid.`;
      if (!finite(l.size) || l.size < 1 || l.size > 1000)
        return `${name}’s text size can be 1 to 1000.`;
      if (!COLOUR.test(String(l.colour)) || !COLOUR.test(String(l.outline)))
        return `${name}’s colour isn’t valid.`;
      if (
        !['left', 'center', 'right'].includes(String(l.align)) ||
        typeof l.bold !== 'boolean' ||
        typeof l.italic !== 'boolean' ||
        !finite(l.lineHeight) ||
        !finite(l.letterSpacing) ||
        !finite(l.outlineWidth) ||
        l.outlineWidth < 0
      )
        return `${name} isn’t valid.`;
    } else if (l.kind === 'shape') {
      if (l.shape !== 'rect' && l.shape !== 'ellipse')
        return `${name} isn’t valid.`;
      const p = fillProblem(l.fill, `${name}’s fill`);
      if (p) return p;
      if (
        !COLOUR.test(String(l.border)) ||
        !finite(l.borderWidth) ||
        l.borderWidth < 0 ||
        !finite(l.radius) ||
        l.radius < 0
      )
        return `${name}’s border isn’t valid.`;
    } else if (l.kind === 'picture') {
      if (!pictureUrl(l.url, blob)) return `${name}’s link isn’t valid.`;
      if (
        !finite(l.radius) ||
        l.radius < 0 ||
        typeof l.flipX !== 'boolean' ||
        typeof l.flipY !== 'boolean'
      )
        return `${name} isn’t valid.`;
    } else return 'A layer isn’t valid.';
  }
  return null;
}

/** Keeps only the fields a design has, so nothing else gets stored. */
export function cleanDesign(d: ImageDesign): ImageDesign {
  const fill = (f: ImageFill): ImageFill =>
    f.kind === 'colour'
      ? { kind: 'colour', colour: f.colour }
      : { kind: 'gradient', from: f.from, to: f.to, angle: f.angle };
  const bg = d.background;
  return {
    width: d.width,
    height: d.height,
    background:
      bg.kind === 'picture'
        ? { kind: 'picture', url: bg.url, colour: bg.colour }
        : fill(bg),
    layers: d.layers.map((l): ImageLayer => {
      const b: Box = {
        id: l.id,
        name: l.name,
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.height,
        rotation: l.rotation,
        opacity: l.opacity,
        hidden: l.hidden,
        locked: l.locked,
      };
      if (l.kind === 'text')
        return {
          ...b,
          kind: 'text',
          text: l.text,
          font: l.font,
          size: l.size,
          bold: l.bold,
          italic: l.italic,
          colour: l.colour,
          align: l.align,
          lineHeight: l.lineHeight,
          letterSpacing: l.letterSpacing,
          outline: l.outline,
          outlineWidth: l.outlineWidth,
        };
      if (l.kind === 'shape')
        return {
          ...b,
          kind: 'shape',
          shape: l.shape,
          fill: fill(l.fill),
          border: l.border,
          borderWidth: l.borderWidth,
          radius: l.radius,
        };
      return {
        ...b,
        kind: 'picture',
        url: l.url,
        radius: l.radius,
        flipX: l.flipX,
        flipY: l.flipY,
      };
    }),
  };
}
