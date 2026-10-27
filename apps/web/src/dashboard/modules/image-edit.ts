import type { ImageDesign, ImageLayer } from '../../data';

/**
 * The Image studio editor's state: the design, what's selected, and the
 * steps Undo and Redo walk through. Kept apart from the canvas so it can be
 * tested without one.
 */
export type EditorState = {
  design: ImageDesign;
  selected: string | null;
  past: ImageDesign[];
  future: ImageDesign[];
  /** Edits with the same key in a row (typing, say) undo as one step. */
  mergeKey: string | null;
};
export type EditorAction =
  | { type: 'change'; design: ImageDesign; merge?: string }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; design: ImageDesign };

/** How many steps Undo can go back. */
const HISTORY = 100;

export const startEditor = (design: ImageDesign): EditorState => ({
  design,
  selected: null,
  past: [],
  future: [],
  mergeKey: null,
});

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case 'change': {
      const merging = !!action.merge && action.merge === state.mergeKey;
      const selected =
        state.selected &&
        action.design.layers.some((l) => l.id === state.selected)
          ? state.selected
          : null;
      return {
        design: action.design,
        selected,
        past: merging
          ? state.past
          : [...state.past, state.design].slice(-HISTORY),
        future: [],
        mergeKey: action.merge ?? null,
      };
    }
    case 'select':
      return { ...state, selected: action.id, mergeKey: null };
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        design: previous,
        past: state.past.slice(0, -1),
        future: [state.design, ...state.future],
        mergeKey: null,
        selected: keep(previous, state.selected),
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        design: next,
        past: [...state.past, state.design],
        future: state.future.slice(1),
        mergeKey: null,
        selected: keep(next, state.selected),
      };
    }
    case 'reset':
      return startEditor(action.design);
  }
}
const keep = (d: ImageDesign, id: string | null) =>
  id && d.layers.some((l) => l.id === id) ? id : null;

/** An id no layer in the design has yet. */
export function nextLayerId(design: ImageDesign) {
  const used = new Set(design.layers.map((l) => l.id));
  for (let n = design.layers.length + 1; ; n++)
    if (!used.has(`l${n}`)) return `l${n}`;
}

export const addLayer = (
  design: ImageDesign,
  layer: ImageLayer,
): ImageDesign => ({ ...design, layers: [...design.layers, layer] });

export const updateLayer = (
  design: ImageDesign,
  id: string,
  patch: Partial<ImageLayer>,
): ImageDesign => ({
  ...design,
  layers: design.layers.map((l) =>
    l.id === id ? ({ ...l, ...patch } as ImageLayer) : l,
  ),
});

export const removeLayer = (design: ImageDesign, id: string): ImageDesign => ({
  ...design,
  layers: design.layers.filter((l) => l.id !== id),
});

/** A copy just above the original, nudged so both can be seen. */
export function duplicateLayer(design: ImageDesign, id: string) {
  const i = design.layers.findIndex((l) => l.id === id);
  const layer = design.layers[i];
  if (!layer) return { design, id: null };
  const copy: ImageLayer = {
    ...structuredClone(layer),
    id: nextLayerId(design),
    name: `${layer.name} copy`.slice(0, 80),
    x: layer.x + 20,
    y: layer.y + 20,
  };
  const layers = [...design.layers];
  layers.splice(i + 1, 0, copy);
  return { design: { ...design, layers }, id: copy.id };
}

/** Moves a layer up (towards the front) or down by one, or to an end. */
export function moveLayer(
  design: ImageDesign,
  id: string,
  to: 'up' | 'down' | 'front' | 'back',
): ImageDesign {
  const layers = [...design.layers];
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return design;
  const [layer] = layers.splice(i, 1);
  const at =
    to === 'front'
      ? layers.length
      : to === 'back'
        ? 0
        : Math.max(0, Math.min(layers.length, i + (to === 'up' ? 1 : -1)));
  layers.splice(at, 0, layer!);
  return { ...design, layers };
}

/** Where a gradient at this angle starts and ends across a box. */
export function gradientPoints(angle: number, width: number, height: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  // Long enough to reach the corners, like CSS linear-gradient.
  const half =
    (Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad))) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return {
    start: { x: cx - dx, y: cy - dy },
    end: { x: cx + dx, y: cy + dy },
  };
}

/** The CSS font for a font name the editor offers. */
export const fontCss = (font: string) =>
  font === 'Inter'
    ? "'Inter Variable', Inter, sans-serif"
    : `'${font}', sans-serif`;

/** How much to scale the canvas down so it fits the space it has. */
export const fitScale = (
  design: { width: number; height: number },
  space: { width: number; height: number },
) =>
  Math.min(
    1,
    Math.max(0.05, space.width / design.width),
    Math.max(0.05, space.height / design.height),
  );
