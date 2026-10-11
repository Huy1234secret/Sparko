export type AnalyticsMetric =
  | 'messages'
  | 'joins'
  | 'leaves'
  | 'voiceTransitions'
  | 'voiceSeconds';
/** Coverage is observed per collector, not per derived metric. */
export const coverageGroup: Record<AnalyticsMetric, string> = {
  messages: 'messages',
  joins: 'members',
  leaves: 'members',
  voiceTransitions: 'voice',
  voiceSeconds: 'voice',
};
export const metricLabels: Record<
  AnalyticsMetric,
  { label: string; unit: string }
> = {
  messages: { label: 'Messages', unit: 'messages' },
  joins: { label: 'Joins', unit: 'members' },
  leaves: { label: 'Leaves', unit: 'members' },
  voiceTransitions: { label: 'Voice joins and moves', unit: 'events' },
  voiceSeconds: { label: 'Voice time', unit: 'participant-minutes' },
};
type Row = { hour: string; metric: string; count: number };
type Gap = { metric: string; from: string; to: string };
export type Point = {
  hour: string;
  /** null when collection did not cover the hour at all. */
  value: number | null;
  /** Collection covered only part of the hour; the value is a lower bound. */
  partial: boolean;
};
const HOUR = 3_600_000;

/**
 * One point per UTC hour in the range. Hours with no coverage are null so a
 * chart shows a break instead of a line or a zero; covered hours without
 * activity are real zeros.
 */
export function hourlySeries(
  rows: Row[],
  gaps: Gap[],
  metric: AnalyticsMetric,
  from: string,
  to: string,
): Point[] {
  const start = Math.floor(Date.parse(from) / HOUR) * HOUR;
  const end = Math.floor(Date.parse(to) / HOUR) * HOUR;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return [];
  const counts = new Map<number, number>();
  for (const row of rows)
    if (row.metric === metric) {
      const hour = Math.floor(Date.parse(row.hour) / HOUR) * HOUR;
      counts.set(hour, (counts.get(hour) ?? 0) + row.count);
    }
  const relevant = gaps
    .filter((gap) => gap.metric === coverageGroup[metric])
    .map((gap) => [Date.parse(gap.from), Date.parse(gap.to)] as const);
  const points: Point[] = [];
  for (let hour = start; hour <= end; hour += HOUR) {
    const hourEnd = hour + HOUR;
    let uncovered = 0;
    for (const [gapFrom, gapTo] of relevant)
      uncovered += Math.max(
        0,
        Math.min(hourEnd, gapTo) - Math.max(hour, gapFrom),
      );
    const count = counts.get(hour);
    const value =
      metric === 'voiceSeconds' && count !== undefined ? count / 60 : count;
    points.push({
      hour: new Date(hour).toISOString(),
      value: uncovered >= HOUR && count === undefined ? null : (value ?? 0),
      partial: uncovered > 0 && uncovered < HOUR,
    });
  }
  return points;
}

export function summarize(points: Point[]) {
  const covered = points.filter((point) => point.value !== null);
  return {
    total: covered.reduce((sum, point) => sum + (point.value ?? 0), 0),
    coveredHours: covered.length,
    hours: points.length,
    partialHours: points.filter((point) => point.partial).length,
  };
}
