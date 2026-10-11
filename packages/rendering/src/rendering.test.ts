import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  RankCardInputSchema,
  rankCardHash,
  rankCardTextSummary,
  renderRankCard,
} from './index.js';

const input = {
  memberName: 'Sparko member',
  level: 3,
  totalXp: 750,
  xpIntoLevel: 150,
  xpForNextLevel: 400,
  rank: 2,
};

describe('authoritative rank renderer', () => {
  it('renders a real PNG with deterministic output, font identity and accessible summary', async () => {
    const first = await renderRankCard(input);
    const second = await renderRankCard(input);
    expect(first.buffer.equals(second.buffer)).toBe(true);
    expect(first.hash).toBe(second.hash);
    expect(first.fontHash).toHaveLength(64);
    const metadata = await sharp(first.buffer).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 900, height: 260 });
    expect(first.summary).toContain('750 XP');
    expect(first.summary).toContain('Rank 2');
  });
  it('renders validated local avatar/background bytes and changes the cache identity', async () => {
    const avatar = await sharp({
      create: { width: 40, height: 40, channels: 4, background: '#FACC15' },
    })
      .png()
      .toBuffer();
    const card = await renderRankCard(
      { ...input, layout: 'compact', avatarShape: 'rounded' },
      { avatar, background: avatar },
    );
    expect(card.width).toBe(640);
    expect(card.hash).not.toBe(rankCardHash(input));
    expect((await sharp(card.buffer).metadata()).format).toBe('png');
  });
  it('never includes private XP/rank in the text summary when disabled', () => {
    const privateInput = { ...input, showXp: false, showRank: false };
    expect(rankCardTextSummary(privateInput)).toBe('Sparko member · Level 3');
    expect(rankCardHash(privateInput)).not.toBe(rankCardHash(input));
  });
  it('rejects malformed progression, remote URLs and unsafe SVG before decoding', async () => {
    expect(() =>
      RankCardInputSchema.parse({ ...input, xpIntoLevel: 401 }),
    ).toThrow();
    expect(() =>
      RankCardInputSchema.parse({
        ...input,
        avatarUrl: 'https://example.com/user.svg',
      }),
    ).toThrow();
    await expect(
      renderRankCard(input, {
        avatar: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/private"/></svg>',
        ),
      }),
    ).rejects.toThrow(/static PNG/);
    await expect(
      renderRankCard(input, {
        background: new Uint8Array(4 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow(/4 MiB/);
  });
  it('safely escapes name and badge markup', async () => {
    const result = await renderRankCard({
      ...input,
      memberName: '<span size="99999">',
      badges: ['A & B'],
    });
    expect((await sharp(result.buffer).metadata()).height).toBe(260);
    expect(result.summary).toContain('<span');
  });
});
