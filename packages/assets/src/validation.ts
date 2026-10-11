export const ANIMATION_MAX_BYTES = 16_384;
export const ANIMATION_MAX_LAYERS = 24;
export const ANIMATION_MAX_SECONDS = 3;

export interface AnimationValidation {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The owned library is deliberately limited to geometry: no expressions, fonts or linked media. */
export function validateAnimation(
  value: unknown,
  byteSize?: number,
): AnimationValidation {
  const errors: string[] = [];
  if (!isRecord(value))
    return { valid: false, errors: ['Animation must be a JSON object'] };
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { valid: false, errors: ['Animation must be serializable JSON'] };
  }
  const bytes = Math.max(
    byteSize ?? 0,
    new TextEncoder().encode(serialized).byteLength,
  );
  if (bytes > ANIMATION_MAX_BYTES || bytes < 1)
    return { valid: false, errors: ['Animation exceeds the 16 KiB budget'] };
  if (typeof value.v !== 'string' || !/^5\.\d+\.\d+$/.test(value.v))
    errors.push('Unsupported Lottie schema version');
  for (const key of ['w', 'h'] as const) {
    if (
      typeof value[key] !== 'number' ||
      !Number.isInteger(value[key]) ||
      value[key] < 1 ||
      value[key] > 512
    ) {
      errors.push(`${key} must be an integer between 1 and 512`);
    }
  }
  const fr = value.fr;
  const ip = value.ip;
  const op = value.op;
  if (typeof fr !== 'number' || fr < 1 || fr > 60 || !Number.isFinite(fr))
    errors.push('Frame rate must be 1–60');
  if (
    typeof ip !== 'number' ||
    typeof op !== 'number' ||
    !Number.isFinite(ip) ||
    !Number.isFinite(op) ||
    op <= ip
  ) {
    errors.push('Invalid animation frame range');
  } else if (typeof fr === 'number' && (op - ip) / fr > ANIMATION_MAX_SECONDS) {
    errors.push('Animation exceeds the 3 second duration budget');
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 0)
    errors.push('External and embedded media assets are not allowed');
  if (value.fonts !== undefined || value.chars !== undefined)
    errors.push('Fonts and text glyphs are not allowed');
  if (
    !Array.isArray(value.layers) ||
    value.layers.length < 1 ||
    value.layers.length > ANIMATION_MAX_LAYERS
  ) {
    errors.push('Animation requires 1–24 shape layers');
  } else {
    for (const layer of value.layers) {
      if (!isRecord(layer) || layer.ty !== 4 || !Array.isArray(layer.shapes))
        errors.push('Only shape layers are allowed');
    }
  }
  function inspect(item: unknown, depth: number): void {
    if (depth > 24) {
      errors.push('Animation nesting exceeds the supported budget');
      return;
    }
    if (typeof item === 'number' && !Number.isFinite(item))
      errors.push('Non-finite animation values are not allowed');
    if (
      typeof item === 'string' &&
      /(?:https?:|\/\/|javascript:|data:|<script|<iframe|<foreignobject)/i.test(
        item,
      )
    ) {
      errors.push('Unsafe or externally referenced content');
    }
    if (Array.isArray(item)) {
      for (const entry of item) inspect(entry, depth + 1);
      return;
    }
    if (!isRecord(item)) return;
    for (const [key, child] of Object.entries(item)) {
      if (
        (key === 'x' && typeof child === 'string') ||
        [
          'expression',
          'expressions',
          '__proto__',
          'prototype',
          'constructor',
        ].includes(key)
      ) {
        errors.push('Expressions and executable content are not allowed');
      } else inspect(child, depth + 1);
    }
  }
  inspect(value, 0);
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function boundedIterations(value: number): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.min(3, Math.floor(value)))
    : 1;
}

export function shouldAnimate(
  motion: 'system' | 'on' | 'off',
  reducedMotion: boolean,
): boolean {
  return motion !== 'off' && !reducedMotion;
}
