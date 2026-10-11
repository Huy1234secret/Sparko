import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnimatedIcon } from './AnimatedIcon';
import {
  assetRegistry,
  getAsset,
  getDiscordMedia,
  loadAnimation,
} from './registry';
import {
  ANIMATION_MAX_BYTES,
  boundedIterations,
  shouldAnimate,
  validateAnimation,
} from './validation';

const requiredIcons = [
  'spark',
  'setup-success',
  'coin',
  'trophy',
  'ticket',
  'shield',
  'welcome',
  'giveaway',
  'calendar',
  'chart',
  'automation',
  'settings',
  'empty-inbox',
  'loading',
  'error-retry',
];
const assetFile = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));
const valid = JSON.parse(
  readFileSync(assetFile('media/lottie/spark.light.json'), 'utf8'),
) as Record<string, unknown>;

function withLayerProperty(key: string, value: unknown): unknown {
  const clone = structuredClone(valid) as { layers: Record<string, unknown>[] };
  clone.layers[0]![key] = value;
  return clone;
}

describe('owned asset catalogue', () => {
  it('ships every roadmap icon, with unique versioned ownership and complete output metadata', () => {
    expect(assetRegistry.map((asset) => asset.id)).toEqual(requiredIcons);
    expect(new Set(assetRegistry.map((asset) => asset.id)).size).toBe(15);
    for (const asset of assetRegistry) {
      expect(asset.version).toBe('1.0.0');
      expect(asset.license).toBe('CC0-1.0');
      expect(asset.author.length).toBeGreaterThan(0);
      expect(asset.source).toContain('tools/generate.py');
      expect(asset.dimensions).toEqual({ width: 96, height: 96 });
      expect(asset.states).toHaveProperty('disabled');
      expect(asset.unicodeFallback.length).toBeGreaterThan(0);
      for (const variant of asset.exportVariants) {
        expect(variant.byteSize).toBe(statSync(assetFile(variant.path)).size);
        expect(variant.url).toBeTruthy();
        expect(variant.byteSize).toBeLessThan(100_000);
      }
    }
  });

  it('validates both theme animations against actual bytes, geometry and animation budgets', async () => {
    for (const asset of assetRegistry) {
      for (const theme of ['light', 'dark'] as const) {
        const variant = asset.exportVariants.find(
          (entry) => entry.kind === 'lottie' && entry.theme === theme,
        )!;
        const json: unknown = JSON.parse(
          readFileSync(assetFile(variant.path), 'utf8'),
        );
        expect(
          validateAnimation(json, variant.byteSize),
          `${asset.id}/${theme}`,
        ).toEqual({ valid: true, errors: [] });
        expect(variant.byteSize).toBeLessThanOrEqual(ANIMATION_MAX_BYTES);
        expect(await loadAnimation(asset.id, theme)).toEqual(json);
      }
    }
  });

  it('contains safe standalone SVG and real PNG Discord equivalents', () => {
    for (const asset of assetRegistry) {
      for (const variant of asset.exportVariants.filter(
        (entry) => entry.kind === 'svg',
      )) {
        const svg = readFileSync(assetFile(variant.path), 'utf8');
        expect(svg).toContain('<svg');
        expect(svg).toContain('viewBox="0 0 96 96"');
        expect(svg).not.toMatch(
          /<script|<foreignObject|on\w+=|href=|<image|<iframe/i,
        );
      }
      const variant = getDiscordMedia(asset.id);
      expect(variant.mimeType).toBe('image/png');
      const png = readFileSync(assetFile(variant.path));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(variant.width);
      expect(png.readUInt32BE(20)).toBe(variant.height);
      expect(png.includes(Buffer.from('IEND'))).toBe(true);
    }
  });

  it('ships valid animated GIF headers, dimensions and looping extensions, and falls back to PNG', () => {
    for (const id of ['spark', 'setup-success'] as const) {
      const media = getDiscordMedia(id, true);
      expect(media.mimeType).toBe('image/gif');
      const gif = readFileSync(assetFile(media.path));
      expect(gif.subarray(0, 6).toString()).toBe('GIF89a');
      expect(gif.readUInt16LE(6)).toBe(128);
      expect(gif.readUInt16LE(8)).toBe(128);
      expect(gif.includes(Buffer.from('NETSCAPE2.0'))).toBe(true);
      expect(gif.at(-1)).toBe(0x3b);
    }
    expect(getDiscordMedia('ticket', true).mimeType).toBe('image/png');
    expect(() => getAsset('nonexistent' as 'spark')).toThrow(
      'Unknown Sparko asset',
    );
  });
});

describe('animation import safety', () => {
  it.each([
    [
      'external image',
      { ...valid, assets: [{ p: 'https://attacker.invalid/image.png' }] },
    ],
    [
      'data HTML URL',
      withLayerProperty('nm', 'data:text/html,<script>alert(1)</script>'),
    ],
    ['javascript URL', withLayerProperty('nm', 'javascript:alert(1)')],
    [
      'expression code',
      withLayerProperty('ks', { r: { x: 'fetch(secret)', a: 0, k: 0 } }),
    ],
    [
      'font download',
      {
        ...valid,
        fonts: { list: [{ fPath: 'https://attacker.invalid/font' }] },
      },
    ],
    [
      'prototype key',
      JSON.parse(
        JSON.stringify(valid).replace('"nm":', '"__proto__":{},"nm":'),
      ),
    ],
    ['invalid size', { ...valid, w: 0 }],
    ['invalid frame rate', { ...valid, fr: 1000 }],
    ['unbounded duration', { ...valid, op: 1000 }],
    ['media layer', { ...valid, layers: [{ ty: 2, shapes: [] }] }],
  ])('rejects %s', (_name, data) => {
    expect(validateAnimation(data).valid).toBe(false);
  });

  it('rejects oversized, malformed and cyclic documents', () => {
    expect(
      validateAnimation({ ...valid, nm: 'a'.repeat(ANIMATION_MAX_BYTES) })
        .valid,
    ).toBe(false);
    expect(validateAnimation(null).valid).toBe(false);
    expect(validateAnimation([]).valid).toBe(false);
    const cyclic = { ...valid };
    cyclic.self = cyclic;
    expect(validateAnimation(cyclic).valid).toBe(false);
  });
});

describe('motion and static delivery', () => {
  it('honours reduced motion even when a user requests motion, and bounds all loops', () => {
    expect(shouldAnimate('on', true)).toBe(false);
    expect(shouldAnimate('system', false)).toBe(true);
    expect(shouldAnimate('off', false)).toBe(false);
    expect(boundedIterations(0)).toBe(1);
    expect(boundedIterations(10)).toBe(3);
    expect(boundedIterations(Number.POSITIVE_INFINITY)).toBe(1);
    expect(boundedIterations(Number.NaN)).toBe(1);
  });

  it('renders an accessible static image before browser motion or player code loads', () => {
    const named = renderToStaticMarkup(
      createElement(AnimatedIcon, { name: 'spark', label: 'Sparko', size: 48 }),
    );
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Sparko"');
    expect(named).toContain('spark.light.svg');
    expect(named).toContain('data-motion="off"');
    expect(named).not.toContain('<svg');
    const decorative = renderToStaticMarkup(
      createElement(AnimatedIcon, { name: 'ticket', motion: 'off' }),
    );
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('role="img"');
  });
});
