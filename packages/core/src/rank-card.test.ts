import { describe, expect, it } from 'vitest';
import { drawRankCard, fitText, rankCardFill } from './rank-card.ts';

const facts = { name: 'Mina', level: 4, rank: 2, into: 30, need: 120, xp: 500 };

/** A canvas that writes down the text it was asked to draw. */
function fakeCanvas() {
  const texts: string[] = [];
  const noop = () => {};
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    arc: noop,
    moveTo: noop,
    lineTo: noop,
    arcTo: noop,
    rect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    fillText: (t: string) => void texts.push(t),
    measureText: (t: string) => ({ width: t.length * 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    drawImage: noop,
  };
  return { ctx, texts };
}

describe('rank card', () => {
  it('shows the name, level, rank and XP', () => {
    const { ctx, texts } = fakeCanvas();
    drawRankCard(ctx, { banner: null, avatar: null }, facts);
    expect(texts).toEqual(
      expect.arrayContaining([
        'M',
        '4',
        'LEVEL',
        '#2',
        'RANK',
        '30',
        ' / 120 XP',
        'Mina',
      ]),
    );
  });

  it('says unranked members have no place, and shows max level', () => {
    const { ctx, texts } = fakeCanvas();
    drawRankCard(
      ctx,
      { banner: null, avatar: null },
      { ...facts, rank: 0, need: 0, into: 0, xp: 9000 },
    );
    expect(texts).toEqual(
      expect.arrayContaining(['—', '9,000 XP', '  ·  Max level']),
    );
  });

  it('fills the bar by progress and cuts long names', () => {
    expect(rankCardFill(facts)).toBe(0.25);
    expect(rankCardFill({ ...facts, need: 0 })).toBe(1);
    const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) };
    expect(fitText(ctx, 'Short', 100)).toBe('Short');
    expect(fitText(ctx, 'A very long member name', 100)).toBe('A very lo…');
  });
});
