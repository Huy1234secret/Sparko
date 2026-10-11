import { describe, expect, it } from 'vitest';
import { hourlySeries, summarize } from './series';

const from = '2026-10-11T00:15:00.000Z';
const to = '2026-10-11T05:30:00.000Z';
describe('hourly analytics series', () => {
  it('breaks the line for uncollected hours and keeps covered quiet hours at zero', () => {
    const points = hourlySeries(
      [
        { hour: '2026-10-11T00:00:00.000Z', metric: 'messages', count: 4 },
        { hour: '2026-10-11T04:00:00.000Z', metric: 'messages', count: 2 },
        { hour: '2026-10-11T04:00:00.000Z', metric: 'joins', count: 9 },
      ],
      [
        // The bot was offline from 01:00 to 03:00 and for half of 03:00.
        {
          metric: 'messages',
          from: '2026-10-11T01:00:00.000Z',
          to: '2026-10-11T03:30:00.000Z',
        },
        { metric: 'members', from, to },
      ],
      'messages',
      from,
      to,
    );
    expect(points.map((point) => point.value)).toEqual([
      4,
      null,
      null,
      0,
      2,
      0,
    ]);
    // 00 and 05 are only partly inside the requested range; 03 is half offline.
    expect(points.map((point) => point.partial)).toEqual([
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
    expect(summarize(points)).toEqual({
      total: 6,
      coveredHours: 4,
      hours: 6,
      partialHours: 3,
    });
  });
  it('keeps an observed count even inside a reported gap and converts voice to minutes', () => {
    const points = hourlySeries(
      [
        {
          hour: '2026-10-11T02:00:00.000Z',
          metric: 'voiceSeconds',
          count: 600,
        },
      ],
      [{ metric: 'voice', from, to }],
      'voiceSeconds',
      from,
      to,
    );
    expect(points[2]).toEqual({
      hour: '2026-10-11T02:00:00.000Z',
      value: 10,
      partial: false,
    });
    // Every hour is uncovered except the one with an actual observation.
    expect(points.map((point) => point.value)).toEqual([
      null,
      null,
      10,
      null,
      null,
      null,
    ]);
  });
  it('never counts boundary hours as observed when nothing was collected', () => {
    const points = hourlySeries(
      [],
      [{ metric: 'messages', from, to }],
      'messages',
      from,
      to,
    );
    expect(summarize(points).coveredHours).toBe(0);
  });
});
