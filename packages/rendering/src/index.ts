import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp, { type OverlayOptions } from 'sharp';
import { z } from 'zod';

export const RANK_RENDERER_VERSION = 'sparko-rank-1.1.0';
export const RANK_FONT_SHA256 =
  '57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e';
const fontPath = fileURLToPath(
  new URL('../assets/DejaVuSans.ttf', import.meta.url),
);
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toUpperCase());
export const RankCardInputSchema = z
  .object({
    memberName: z.string().min(1).max(64),
    level: z.number().int().min(0).max(10000),
    totalXp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    xpIntoLevel: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    xpForNextLevel: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    rank: z.number().int().min(1).max(1000000000).nullable().default(null),
    theme: z.enum(['light', 'dark']).default('dark'),
    layout: z.enum(['wide', 'compact']).default('wide'),
    avatarShape: z.enum(['circle', 'rounded']).default('circle'),
    accent: hexColor.default('#FACC15'),
    background: hexColor.optional(),
    badges: z.array(z.string().min(1).max(24)).max(3).default([]),
    showXp: z.boolean().default(true),
    showRank: z.boolean().default(true),
    /** The member has reached the configured maximum level; no next threshold exists. */
    maxLevel: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.xpIntoLevel > value.xpForNextLevel)
      ctx.addIssue({
        code: 'custom',
        path: ['xpIntoLevel'],
        message: 'Level progress cannot exceed the next level threshold.',
      });
    if (value.xpIntoLevel > value.totalXp)
      ctx.addIssue({
        code: 'custom',
        path: ['totalXp'],
        message: 'Total XP cannot be below level progress.',
      });
  });
export type RankCardInput = z.infer<typeof RankCardInputSchema>;
export type RankCardMedia = { avatar?: Uint8Array; background?: Uint8Array };
export type RankCardResult = {
  buffer: Buffer;
  width: number;
  height: number;
  hash: string;
  rendererVersion: string;
  fontHash: string;
  summary: string;
};

function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function canonicalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function rgbaColor(value: string): string {
  return value;
}

/** No network access is performed. Untrusted SVG/animated input is intentionally rejected. */
async function rasterizeMedia(
  bytes: Uint8Array,
  width: number,
  height: number,
  shape?: RankCardInput['avatarShape'],
): Promise<Buffer> {
  if (bytes.byteLength > 4 * 1024 * 1024 || bytes.byteLength < 12)
    throw new Error('Rank images must be between 12 bytes and 4 MiB.');
  const input = Buffer.from(bytes);
  const png = input
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const webp =
    input.subarray(0, 4).toString('ascii') === 'RIFF' &&
    input.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!png && !jpeg && !webp)
    throw new Error('Rank images must be static PNG, JPEG, or WebP.');
  const source = sharp(input, {
    limitInputPixels: 10_000_000,
    failOn: 'warning',
    animated: false,
  });
  const metadata = await source.metadata();
  if (
    (metadata.pages ?? 1) > 1 ||
    (metadata.width ?? 0) < 1 ||
    (metadata.height ?? 0) < 1
  )
    throw new Error('Animated or invalid rank images are unsupported.');
  let result = await source
    .rotate()
    .resize(width, height, { fit: 'cover' })
    .ensureAlpha()
    .png()
    .toBuffer();
  if (shape) {
    const mask =
      shape === 'circle'
        ? `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="white"/>`
        : `<rect width="${width}" height="${height}" rx="24" fill="white"/>`;
    result = await sharp(result)
      .composite([
        {
          input: Buffer.from(
            `<svg width="${width}" height="${height}">${mask}</svg>`,
          ),
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();
  }
  return result;
}

export function rankCardTextSummary(input: unknown): string {
  const value = RankCardInputSchema.parse(input);
  return [
    value.memberName,
    `Level ${value.level}`,
    ...(value.showRank && value.rank ? [`Rank ${value.rank}`] : []),
    ...(value.maxLevel ? ['Maximum level reached'] : []),
    ...(value.showXp
      ? [
          `${value.totalXp.toLocaleString('en-US')} XP`,
          ...(value.maxLevel
            ? []
            : [
                `${value.xpIntoLevel.toLocaleString('en-US')} of ${value.xpForNextLevel.toLocaleString('en-US')} XP toward the next level`,
              ]),
        ]
      : []),
    ...value.badges,
  ].join(' · ');
}

/** Hash includes privacy flags, validated media digests, pinned font and renderer identity. */
export function rankCardHash(
  input: unknown,
  media: RankCardMedia = {},
): string {
  const value = RankCardInputSchema.parse(input);
  return canonicalHash({
    renderer: RANK_RENDERER_VERSION,
    font: RANK_FONT_SHA256,
    input: value,
    avatar: media.avatar
      ? createHash('sha256').update(media.avatar).digest('hex')
      : null,
    background: media.background
      ? createHash('sha256').update(media.background).digest('hex')
      : null,
  });
}

let fontVerified: Promise<void> | undefined;
function verifyFont(): Promise<void> {
  fontVerified ??= readFile(fontPath).then((bytes) => {
    if (createHash('sha256').update(bytes).digest('hex') !== RANK_FONT_SHA256)
      throw new Error('Pinned rank font failed its integrity check.');
  });
  return fontVerified;
}

export async function renderRankCard(
  input: unknown,
  media: RankCardMedia = {},
): Promise<RankCardResult> {
  const value = RankCardInputSchema.parse(input);
  await verifyFont();
  const width = value.layout === 'wide' ? 900 : 640;
  const height = 260;
  const dark = value.theme === 'dark';
  const background = value.background ?? (dark ? '#1C1C19' : '#FFFCF3');
  // A translucent contrast panel preserves legibility over uploaded backgrounds.
  const ink = dark ? '#FAFAF5' : '#1C1917';
  const secondary = dark ? '#D6D3D1' : '#57534E';
  const progressWidth = width - 250;
  // Hidden XP must not leak through the bar length either.
  const progress = value.maxLevel
    ? progressWidth
    : Math.round((progressWidth * value.xpIntoLevel) / value.xpForNextLevel);
  const bar = value.showXp || value.maxLevel;
  const base = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="24" fill="${rgbaColor(background)}"/></svg>`,
  );
  const layers: OverlayOptions[] = [];
  if (media.background)
    layers.push({
      input: await rasterizeMedia(media.background, width, height),
      top: 0,
      left: 0,
    });
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="198" y="20" width="${width - 216}" height="224" rx="16" fill="${dark ? '#1C1C19' : '#FFFCF3'}"/><rect x="0" y="0" width="8" height="${height}" fill="${value.accent}"/>${bar ? `<rect x="214" y="188" width="${progressWidth}" height="16" rx="8" fill="${dark ? '#44443C' : '#E7E5E4'}"/><rect x="214" y="188" width="${progress}" height="16" rx="8" fill="${value.accent}"/>` : ''}</svg>`;
  layers.push({ input: Buffer.from(svg), top: 0, left: 0 });
  if (media.avatar)
    layers.push({
      input: await rasterizeMedia(media.avatar, 144, 144, value.avatarShape),
      top: 54,
      left: 36,
    });
  else {
    const shape =
      value.avatarShape === 'circle'
        ? '<circle cx="72" cy="72" r="72" fill="#FACC15"/>'
        : '<rect width="144" height="144" rx="24" fill="#FACC15"/>';
    layers.push({
      input: Buffer.from(
        `<svg width="144" height="144" xmlns="http://www.w3.org/2000/svg">${shape}<path d="M80 22 40 79h27l-4 43 41-58H78z" fill="#1C1917"/></svg>`,
      ),
      top: 54,
      left: 36,
    });
  }
  function label(
    text: string,
    size: number,
    x: number,
    y: number,
    color: string,
    maxWidth: number,
    bold = false,
  ): void {
    layers.push({
      input: {
        text: {
          text: `<span foreground="${color}"${bold ? ' weight="bold"' : ''}>${escapeMarkup(text)}</span>`,
          font: `DejaVu Sans ${size}`,
          fontfile: fontPath,
          width: maxWidth,
          height: size + 8,
          rgba: true,
          wrap: 'none',
        },
      },
      top: y,
      left: x,
    });
  }
  label(value.memberName, 30, 214, 42, ink, width - 250, true);
  label(
    `LEVEL ${value.level}${value.showRank && value.rank ? `   •   RANK ${value.rank}` : ''}`,
    18,
    214,
    92,
    secondary,
    width - 250,
  );
  const badges = value.badges.join('  •  ');
  if (badges) label(badges, 15, 214, 128, secondary, width - 250);
  const progressLabel = value.maxLevel
    ? value.showXp
      ? `Maximum level · ${value.totalXp.toLocaleString('en-US')} XP`
      : 'Maximum level reached'
    : value.showXp
      ? `${value.xpIntoLevel.toLocaleString('en-US')} / ${value.xpForNextLevel.toLocaleString('en-US')} XP`
      : null;
  if (progressLabel) label(progressLabel, 15, 214, 214, secondary, width - 250);
  const buffer = await sharp(base)
    .composite(layers)
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  return {
    buffer,
    width,
    height,
    hash: rankCardHash(value, media),
    rendererVersion: RANK_RENDERER_VERSION,
    fontHash: RANK_FONT_SHA256,
    summary: rankCardTextSummary(value),
  };
}

export { normalizeUploadedImage, IMAGE_UPLOAD_LIMIT } from './uploads.js';
