import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  GlobalFonts,
  createCanvas,
  loadImage,
  type Image,
} from '@napi-rs/canvas';
import {
  RANK_CARD,
  RANK_CARD_BANNER,
  drawRankCard,
  lvConfigOf,
  lvFactsOf,
  lvProgress,
  type Db,
} from '@sparko/core';

// Inter, so the card matches the dashboard's preview.
GlobalFonts.registerFromPath(
  createRequire(import.meta.url).resolve(
    '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  ),
  'Inter',
);

let banner: Promise<Image | null> | undefined;
const bannerImage = () =>
  (banner ??= loadImage(
    fileURLToPath(new URL(`../../../${RANK_CARD_BANNER}`, import.meta.url)),
  ).catch(() => null));

/** A member's /rank picture as a PNG. Without their avatar it still draws. */
export async function rankCardPng(
  db: Db,
  guildId: string,
  member: { id: string; name: string; avatar: string },
) {
  const { config: c } = lvConfigOf(db, guildId);
  const facts = lvFactsOf(db, guildId, member.id);
  const p = lvProgress(c.formula, facts.xp, c.maxLevel);
  const [art, avatar] = await Promise.all([
    bannerImage(),
    loadImage(member.avatar).catch(() => null),
  ]);
  const canvas = createCanvas(RANK_CARD.width, RANK_CARD.height);
  drawRankCard(
    canvas.getContext('2d') as never,
    { banner: art, avatar },
    {
      name: member.name,
      level: p.level,
      rank: facts.rank,
      into: p.max ? 0 : p.into,
      need: p.max ? 0 : p.need,
      xp: facts.xp,
    },
  );
  return canvas.encode('png');
}
