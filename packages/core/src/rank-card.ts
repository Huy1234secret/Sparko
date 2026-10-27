/**
 * Sparko's own rank card: a picture of a member's level drawn on the
 * Rank_card_default banner. The dashboard draws it on a browser canvas to
 * preview it and the bot draws the same thing for /rank, so both share
 * this one layout and only hand in their own canvas.
 */

export const RANK_CARD = { width: 1200, height: 424 } as const;
/** The banner's file, from the repository root. */
export const RANK_CARD_BANNER =
  'design-system/assets/images/Rank_card_default.png';
/** Inter first; the bot registers its copy under this name. */
export const RANK_CARD_FONT = '"Inter Variable", Inter, sans-serif';

const GOLD = '#facc15';
const GOLD_DEEP = '#eab308';
const MUTED = '#a1a1aa';

/** What the card shows about the member. */
export type RankCardFacts = {
  name: string;
  level: number;
  /** Their place on the leaderboard; 0 when they aren't on it. */
  rank: number;
  /** XP into this level, and what the level takes; need 0 at the top. */
  into: number;
  need: number;
  /** Every XP they have, shown once they reach the highest level. */
  xp: number;
};

/** The bits of a 2D canvas the card uses, so either canvas fits. */
export type RankCardCanvas<I> = {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  arc(x: number, y: number, r: number, a: number, b: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { addColorStop(offset: number, colour: string): void };
  drawImage(image: I, dx: number, dy: number, dw: number, dh: number): void;
};

type Sized = { width: number; height: number };

const n = (v: number) => Math.round(v).toLocaleString('en-US');

/** Cuts text to fit a width, ending in an ellipsis. */
export function fitText(
  ctx: { measureText(text: string): { width: number } },
  text: string,
  width: number,
) {
  if (ctx.measureText(text).width <= width) return text;
  const chars = [...text];
  while (chars.length && ctx.measureText(`${chars.join('')}…`).width > width)
    chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

/** How full the bar is, from 0 to 1. */
export const rankCardFill = (f: RankCardFacts) =>
  f.need <= 0 ? 1 : Math.max(0, Math.min(1, f.into / f.need));

function roundRect<I>(
  ctx: RankCardCanvas<I>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draws the card at RANK_CARD's size. The banner is cropped to cover the
 * card; without an avatar the member's first letter sits in the circle.
 */
export function drawRankCard<I extends Sized>(
  ctx: RankCardCanvas<I>,
  art: { banner: I | null; avatar: I | null },
  f: RankCardFacts,
) {
  const { width: W, height: H } = RANK_CARD;
  ctx.save();
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);
  if (art.banner) {
    const b = art.banner;
    const scale = Math.max(W / b.width, H / b.height);
    const w = b.width * scale;
    const h = b.height * scale;
    ctx.drawImage(b, (W - w) / 2, (H - h) / 2, w, h);
  }
  // A soft shade on the left so the avatar and name read on any banner.
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.4)');
  shade.addColorStop(0.6, 'rgba(0,0,0,0.12)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // Avatar in a gold ring.
  const cx = 200;
  const cy = H / 2;
  const r = 128;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (art.avatar) ctx.drawImage(art.avatar, cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.fillStyle = '#27272a';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 110px ${RANK_CARD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(([...f.name.trim()][0] ?? '?').toUpperCase(), cx, cy + 4);
  }
  ctx.restore();

  const left = 380;
  const right = W - 60;
  ctx.textBaseline = 'alphabetic';

  // Rank and level, top right: a small label before each number.
  const pairs: [string, string, string][] = [
    ['LEVEL', n(f.level), GOLD],
    ['RANK', f.rank ? `#${n(f.rank)}` : '—', '#ffffff'],
  ];
  let x = right;
  ctx.textAlign = 'right';
  for (const [label, value, colour] of pairs) {
    ctx.font = `700 64px ${RANK_CARD_FONT}`;
    ctx.fillStyle = colour;
    ctx.fillText(value, x, 128);
    x -= ctx.measureText(value).width + 12;
    ctx.font = `600 26px ${RANK_CARD_FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(label, x, 128);
    x -= ctx.measureText(label).width + 40;
  }

  // XP, right above the bar.
  const top = f.need <= 0;
  const have = top ? `${n(f.xp)} XP` : n(f.into);
  const rest = top ? '  ·  Max level' : ` / ${n(f.need)} XP`;
  ctx.font = `500 30px ${RANK_CARD_FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(rest, right, 266);
  const restWidth = ctx.measureText(rest).width;
  ctx.font = `700 30px ${RANK_CARD_FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(have, right - restWidth, 266);
  const xpWidth = restWidth + ctx.measureText(have).width;

  // The name, as much as fits beside the XP.
  ctx.textAlign = 'left';
  ctx.font = `700 54px ${RANK_CARD_FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fitText(ctx, f.name, right - left - xpWidth - 32), left, 266);

  // The bar.
  const barY = 292;
  const barH = 46;
  const barW = right - left;
  roundRect(ctx, left, barY, barW, barH, barH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();
  const share = rankCardFill(f);
  if (share > 0) {
    const fill = ctx.createLinearGradient(left, 0, left + barW, 0);
    fill.addColorStop(0, '#fde047');
    fill.addColorStop(1, GOLD_DEEP);
    roundRect(
      ctx,
      left + 4,
      barY + 4,
      Math.max(barH - 8, (barW - 8) * share),
      barH - 8,
      (barH - 8) / 2,
    );
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.restore();
}
