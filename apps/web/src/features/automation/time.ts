/**
 * Wall-clock helpers. Forms edit "2026-10-12T09:30" in a chosen IANA time
 * zone; the API stores UTC instants and recurrence in that zone's local time.
 */
export const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function timeZones(): string[] {
  const supported = (
    Intl as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.('timeZone');
  const zones = supported?.length ? [...supported] : ['UTC'];
  for (const zone of ['UTC', browserTimeZone()])
    if (!zones.includes(zone)) zones.unshift(zone);
  return zones;
}

function parts(instant: number, timeZone: string) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const n = (type: string) =>
    Number(values.find((part) => part.type === type)?.value);
  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    hour: n('hour'),
    minute: n('minute'),
  };
}

const pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
/** Splits a `datetime-local` value; null when incomplete. */
export function parseLocal(value: string) {
  const match = pattern.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/**
 * The UTC instant of a wall-clock time in `timeZone`. A time skipped by a DST
 * jump resolves to the first minute after the gap, matching the server's rule.
 */
export function zonedToUtc(value: string, timeZone: string): Date | null {
  const local = parseLocal(value);
  if (!local) return null;
  const nominal = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  const offset = (instant: number) => {
    const seen = parts(instant, timeZone);
    return (
      Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) -
      instant
    );
  };
  // The zone's offsets either side of this day; a DST change is within it.
  const before = offset(nominal - 86_400_000);
  const after = offset(nominal + 86_400_000);
  // Repeated times take the first instant; skipped times move forward to the
  // first minute that exists, like the server's recurrence rule.
  for (let shift = 0; shift <= 180; shift++) {
    const wall = nominal + shift * 60_000;
    const match = [wall - before, wall - after]
      .filter((instant) => offset(instant) === wall - instant)
      .sort((a, b) => a - b)[0];
    if (match !== undefined) return new Date(match);
  }
  return new Date(nominal - before);
}

/** Formats an instant as a `datetime-local` value in `timeZone`. */
export function utcToZonedInput(iso: string, timeZone: string) {
  const p = parts(Date.parse(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Mon 12 Oct, 09:30 (Asia/Bangkok)" — always names the zone it is in. */
export function formatInZone(iso: string | null | undefined, timeZone: string) {
  if (!iso) return '—';
  try {
    return `${new Date(iso).toLocaleString(undefined, {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })} (${timeZone})`;
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export type Repeat = 'once' | 'daily' | 'weekly';
/** Recurrence follows the first occurrence's local weekday and time. */
export function recurrenceFrom(repeat: Repeat, value: string) {
  const local = parseLocal(value);
  if (repeat === 'once' || !local) return { type: 'once' as const };
  return repeat === 'daily'
    ? { type: 'daily' as const, hour: local.hour, minute: local.minute }
    : {
        type: 'weekly' as const,
        weekday: local.weekday,
        hour: local.hour,
        minute: local.minute,
      };
}
export function recurrenceLabel(recurrence: {
  type: string;
  hour?: number | undefined;
  minute?: number | undefined;
  weekday?: number | undefined;
}) {
  const time = `${String(recurrence.hour ?? 0).padStart(2, '0')}:${String(recurrence.minute ?? 0).padStart(2, '0')}`;
  if (recurrence.type === 'daily') return `Every day at ${time}`;
  if (recurrence.type === 'weekly')
    return `Every ${weekdays[recurrence.weekday ?? 0]} at ${time}`;
  return 'Once';
}
