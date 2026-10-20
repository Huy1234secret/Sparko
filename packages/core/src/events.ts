/**
 * Events & RSVP: staff schedule events (in the dashboard or with
 * /event create), members answer Going, Maybe or Can’t go with buttons,
 * and Sparko reminds them, pings at the start, ends the event and posts the
 * next one when it repeats. The message is a Message Studio template with
 * fixed RSVP buttons under it. Nothing here touches the database or the
 * network, so the dashboard imports this file too.
 */
import { parseDuration } from './auto-roles.ts';
import { zoneOk } from './birthdays.ts';
import { commandName } from './suggestions.ts';
import {
  componentRows,
  embedDefault,
  emojiPayload,
  IS_COMPONENTS_V2,
  studioPayload,
  v2Default,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';

export const EV_MODULE = 'events';

/** The four messages: the event itself and three DMs. */
export type EvKind = 'event' | 'reminder' | 'cancelled' | 'waitlist';
export const evKinds: EvKind[] = ['event', 'reminder', 'cancelled', 'waitlist'];

/** What members can answer. Going is always offered. */
export type EvChoice = 'going' | 'maybe' | 'no';
export const evChoices: EvChoice[] = ['going', 'maybe', 'no'];
/** An answer as it's saved: Going members past the capacity wait in line. */
export type EvAnswer = EvChoice | 'waitlist';

export type EvOption = { on: boolean; label: string; emoji: string };
export type EvOptions = Record<EvChoice, EvOption>;

export type EvRepeat = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export const evRepeats: EvRepeat[] = [
  'none',
  'daily',
  'weekly',
  'biweekly',
  'monthly',
];
export const evRepeatNames: Record<EvRepeat, string> = {
  none: 'Doesn’t repeat',
  daily: 'Every day',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
};

export type EvStatus = 'scheduled' | 'started' | 'ended' | 'cancelled';

export type EvCommandKey =
  | 'create'
  | 'list'
  | 'info'
  | 'rsvp'
  | 'cancel'
  | 'remind';
export type EvCommand = { on: boolean; name: string; description: string };

export type Events = {
  /** Where events are announced. */
  channel: string;
  /** New events' time zone, like "Europe/London". */
  timeZone: string;
  /** Roles that can create, edit, cancel and remind; [] for Manage Server. */
  managers: string[];
  /** New events' reminders, as times before the start like "1h". */
  reminders: string[];
  /** New events also remind members who answered Maybe. */
  remindMaybe: boolean;
  /** New events ping their channel when they start. */
  startPing: boolean;
  /** New events' answers. */
  options: EvOptions;
  /** How many names {going.list} shows before "and 5 more". */
  listSize: number;
  /** Going members get a role until the event ends. */
  attending: boolean;
  attendingRole: string;
  /** Each event is also one of Discord's own scheduled events. */
  sync: boolean;
  /** Which DMs Sparko sends. */
  dms: { reminder: boolean; cancelled: boolean; waitlist: boolean };
  /** Studio template ids for each message; '' for Sparko's own. */
  messages: Record<EvKind, string>;
  /** The /event command and its subcommands, as the server names them. */
  commands: {
    group: { name: string; description: string };
  } & Record<EvCommandKey, EvCommand>;
};

export const evCommandKeys: EvCommandKey[] = [
  'create',
  'list',
  'info',
  'rsvp',
  'cancel',
  'remind',
];
export const evCommandAbout: Record<EvCommandKey, string> = {
  create:
    'Staff schedule an event. A form asks for the title, the description, when it starts, how long it lasts and where.',
  list: 'Lists the server’s upcoming events with their numbers.',
  info: 'Shows an event’s details and who’s going.',
  rsvp: 'Members answer an event by its number, like the buttons on its message.',
  cancel:
    'Staff cancel an event. Its message shows Cancelled and Going members get a DM.',
  remind: 'Staff send the reminder DM to everyone going, right away.',
};

export const evDefaultCommands = (): Events['commands'] => ({
  group: { name: 'event', description: 'Events in this server' },
  create: { on: true, name: 'create', description: 'Schedule an event' },
  list: { on: true, name: 'list', description: 'Upcoming events' },
  info: { on: true, name: 'info', description: 'See an event and who’s going' },
  rsvp: { on: true, name: 'rsvp', description: 'Answer an event' },
  cancel: { on: true, name: 'cancel', description: 'Cancel an event' },
  remind: {
    on: true,
    name: 'remind',
    description: 'Remind everyone going now',
  },
});

export const evDefaultOptions = (): EvOptions => ({
  going: { on: true, label: 'Going', emoji: '✅' },
  maybe: { on: true, label: 'Maybe', emoji: '🤔' },
  no: { on: true, label: 'Can’t go', emoji: '❌' },
});

export const evDefault = (channel = ''): Events => ({
  channel,
  timeZone: 'UTC',
  managers: [],
  reminders: ['1h'],
  remindMaybe: false,
  startPing: true,
  options: evDefaultOptions(),
  listSize: 10,
  attending: false,
  attendingRole: '',
  sync: false,
  dms: { reminder: true, cancelled: true, waitlist: true },
  messages: { event: '', reminder: '', cancelled: '', waitlist: '' },
  commands: evDefaultCommands(),
});

/** What each plan allows. */
export const evLimits = (plan?: string | null) =>
  plan === 'plus'
    ? { upcoming: 100, reminders: 5 }
    : { upcoming: 5, reminders: 2 };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The shortest and longest each time can be. */
export const evRanges = {
  reminder: { min: MINUTE, max: 30 * DAY, label: '1m and 30d' },
  length: { min: 5 * MINUTE, max: 14 * DAY, label: '5 minutes and 14 days' },
  /** How far ahead an event can be. */
  ahead: 2 * 365 * DAY,
} as const;
export const evTextLimits = {
  title: 100,
  description: 1000,
  location: 100,
  label: 30,
  capacity: 10_000,
  listSize: 50,
} as const;
/** Ended and cancelled events kept for the dashboard. */
export const EV_KEEP_PAST = 100;

// Time ------------------------------------------------------------------------

type Local = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const formats = new Map<string, Intl.DateTimeFormat>();
const formatFor = (zone: string) => {
  let f = formats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hourCycle: 'h23',
    });
    formats.set(zone, f);
  }
  return f;
};
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The date and time it is at `at` in a time zone. */
export function zoneParts(at: number, zone: string) {
  const parts = formatFor(zoneOk(zone) ? zone : 'UTC').formatToParts(
    new Date(at),
  );
  const v = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(v('year')),
    month: Number(v('month')),
    day: Number(v('day')),
    // Some systems write midnight as 24.
    hour: Number(v('hour')) % 24,
    minute: Number(v('minute')),
    weekday: weekdays.indexOf(v('weekday').toLowerCase().slice(0, 3)),
  };
}

/** A date and time in a time zone, as a moment. */
export function zonedTime(p: Local, zone: string) {
  const wanted = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  let at = wanted;
  // Twice, so a guess that lands across a summer time change settles.
  for (let i = 0; i < 2; i++) {
    const q = zoneParts(at, zone);
    const shown = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute);
    at += wanted - shown;
  }
  return at;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-20T19:00", for a date and time box, in a time zone. */
export function toLocalInput(at: number, zone: string) {
  const p = zoneParts(at, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** What a date and time box says, as a moment in a time zone. */
export function fromLocalInput(text: string, zone: string) {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return zonedTime(
    {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
    },
    zone,
  );
}

const monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
/** 10 for "oct", "october" or "sept"; 0 when it isn't a month. */
const monthOf = (word: string) => {
  const w = word === 'sept' ? 'sep' : word;
  return w.length < 3 ? 0 : monthNames.findIndex((m) => m.startsWith(w)) + 1;
};
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Moves a local date by whole days, across months and years. */
const addDays = (
  d: { year: number; month: number; day: number },
  n: number,
) => {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
  };
};

/**
 * When someone means, written the way people write it, in a time zone:
 * "2026-10-20 19:00", "20 Oct 7pm", "Oct 20 2026 19:30", "tomorrow 18:00",
 * "friday 8pm", "19:00" (the next one), "in 2h" or "in 3 days". A day
 * written as 20/10 or 10/20 only counts when it can't be the other way
 * round. Null when it can't be read or has no time of day.
 */
export function parseWhen(text: string, zone: string, now: number) {
  let s = text
    .trim()
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/(\d)t(\d)/, '$1 $2')
    .replace(/\s+/g, ' ');
  if (!s) return null;
  const rel = s.match(
    /^in (\d{1,4}) ?(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)$/,
  );
  if (rel) {
    const unit = rel[2]!.startsWith('m')
      ? MINUTE
      : rel[2]!.startsWith('h')
        ? HOUR
        : rel[2]!.startsWith('d')
          ? DAY
          : 7 * DAY;
    return Math.ceil((now + Number(rel[1]) * unit) / MINUTE) * MINUTE;
  }
  // The time of day comes last: 19:00, 7pm, 7:30 pm, noon or midnight.
  let hour: number;
  let minute = 0;
  const named = s.match(/(?:^| )(noon|midnight)$/);
  const time = s.match(/(?:^| )(\d{1,2})(?:[:.h](\d{2}))? ?(am|pm)?$/);
  if (named) {
    hour = named[1] === 'noon' ? 12 : 0;
    s = s.slice(0, s.length - named[0].length).trim();
  } else if (time && (time[2] !== undefined || time[3])) {
    hour = Number(time[1]);
    minute = Number(time[2] ?? 0);
    if (time[3]) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (time[3] === 'pm' ? 12 : 0);
    }
    if (hour > 23 || minute > 59) return null;
    s = s.slice(0, s.length - time[0].length).trim();
  } else return null;
  s = s
    .replace(/ (at|@)$/, '')
    .replace(/^(on|next) /, '')
    .trim();

  const today = zoneParts(now, zone);
  const at = (d: { year: number; month: number; day: number }) =>
    zonedTime({ ...d, hour, minute }, zone);
  const dated = (year: number | null, month: number, day: number) => {
    if (month < 1 || month > 12) return null;
    let y = year ?? today.year;
    if (y < 100) y += 2000;
    if (day < 1 || day > daysInMonth(y, month)) return null;
    const t = at({ year: y, month, day });
    // Without a year, a date that's gone means next year's.
    if (year === null && t < now - DAY) {
      if (day > daysInMonth(y + 1, month)) return null;
      return at({ year: y + 1, month, day });
    }
    return t;
  };

  if (!s || s === 'today' || s === 'tonight') {
    const t = at(today);
    // A time on its own that's gone today means tomorrow's.
    return !s && t <= now ? at(addDays(today, 1)) : t;
  }
  if (s === 'tomorrow') return at(addDays(today, 1));
  const wd = weekdays.indexOf(s.slice(0, 3));
  if (
    wd >= 0 &&
    /^[a-z]+$/.test(s) &&
    /^(sun|mon|tue|wed|thu|fri|sat)/.test(s)
  ) {
    let ahead = (wd - today.weekday + 7) % 7;
    if (ahead === 0 && at(today) <= now) ahead = 7;
    return at(addDays(today, ahead));
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return dated(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = m[3] ? Number(m[3]) : null;
    // 20/10 is the 20th of October and 10/20 too; 5/6 could be either.
    if (a > 12 && b <= 12) return dated(year, b, a);
    if (b > 12 && a <= 12) return dated(year, a, b);
    return null;
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)(?: (\d{4}))?$/);
  if (m && monthOf(m[2]!))
    return dated(m[3] ? Number(m[3]) : null, monthOf(m[2]!), Number(m[1]));
  m = s.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  if (m && monthOf(m[1]!))
    return dated(m[3] ? Number(m[3]) : null, monthOf(m[1]!), Number(m[2]));
  return null;
}

/**
 * When an event ends, from how long it lasts ("2h", "90 minutes",
 * "1h 30m") or when it ends ("21:00", "tomorrow 2am"). An hour when empty.
 */
export function parseEnd(text: string, start: number, zone: string) {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/(\d)\s*(hours?|hrs?)\b/g, '$1h')
    .replace(/(\d)\s*(minutes?|mins?)\b/g, '$1m')
    .replace(/(\d)\s*(days?)\b/g, '$1d');
  if (!s) return start + HOUR;
  const decimal = s.match(/^(\d{1,3})\.(\d{1,2})h$/);
  if (decimal)
    return (
      start + Math.round(Number(`${decimal[1]}.${decimal[2]}`) * 60) * MINUTE
    );
  const length = parseDuration(s);
  if (length !== null) return start + length;
  return parseWhen(text, zone, start);
}

/** "Tue 20 Oct, 19:00 – 21:00" in a time zone, for lists. */
export function evWhenText(start: number, end: number, zone: string) {
  const a = zoneParts(start, zone);
  const b = zoneParts(end, zone);
  const day = (p: typeof a) =>
    `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][p.weekday] ?? ''} ${p.day} ${
      [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ][p.month - 1] ?? ''
    }`;
  const time = (p: typeof a) => `${pad(p.hour)}:${pad(p.minute)}`;
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  return sameDay
    ? `${day(a)}, ${time(a)} – ${time(b)}`
    : `${day(a)}, ${time(a)} – ${day(b)}, ${time(b)}`;
}

/** When a repeating event happens next, in its own time zone. */
export function evNextStart(start: number, repeat: EvRepeat, zone: string) {
  if (repeat === 'none') return null;
  const p = zoneParts(start, zone);
  if (repeat === 'monthly') {
    const year = p.month === 12 ? p.year + 1 : p.year;
    const month = p.month === 12 ? 1 : p.month + 1;
    // The 31st becomes the month's last day.
    const day = Math.min(p.day, daysInMonth(year, month));
    return zonedTime(
      { year, month, day, hour: p.hour, minute: p.minute },
      zone,
    );
  }
  const days = repeat === 'daily' ? 1 : repeat === 'weekly' ? 7 : 14;
  return zonedTime(
    { ...addDays(p, days), hour: p.hour, minute: p.minute },
    zone,
  );
}

// Events ----------------------------------------------------------------------

/** A voice or stage channel an event happens in. */
export type EvPlace = { id: string; name: string; stage: boolean };

/** What staff fill in for an event. */
export type EvDetails = {
  title: string;
  description: string;
  /** A picture shown in the message; '' for none. */
  image: string;
  start: number;
  end: number;
  timeZone: string;
  /** A voice or stage channel, or null for none. */
  place: EvPlace | null;
  /** Where it is in words, like "Minecraft server" or a link. */
  location: string;
  /** How many can go; 0 for no limit. The rest wait in line. */
  capacity: number;
  options: EvOptions;
  /** Roles that may answer; [] for everyone. */
  roles: string[];
  /** Pinged when the event is announced; '' for nobody. */
  pingRole: string;
  repeat: EvRepeat;
  /** DMs to Going members this long before the start, like "1h". */
  reminders: string[];
  remindMaybe: boolean;
  /** Pings the channel when it starts. */
  startPing: boolean;
  /** When the message is posted; 0 for straight away. */
  postAt: number;
};

export type EvCounts = {
  going: number;
  maybe: number;
  no: number;
  waitlist: number;
};

/** An event, as the bot, the server and the dashboard pass it around. */
export type EvEvent = EvDetails & {
  number: number;
  status: EvStatus;
  hostId: string;
  hostName: string;
  channelId: string | null;
  messageId: string | null;
  /** Discord's own scheduled event, when synced. */
  discordEventId: string | null;
  /** Reminders already sent, so none goes twice. */
  reminded: string[];
  startPinged: boolean;
  /** The first event of a repeating series, or null. */
  series: number | null;
  counts: EvCounts;
  createdAt: number;
  updatedAt: number;
};

/** A member's answer. */
export type EvRsvp = {
  userId: string;
  name: string;
  avatar: string;
  answer: EvAnswer;
  /** When they answered, which is their place in the waiting line. */
  at: number;
  /** Staff marked them as not coming after all. */
  noShow: boolean;
};

export const evStatusNames: Record<EvStatus, string> = {
  scheduled: 'Upcoming',
  started: 'Happening now',
  ended: 'Ended',
  cancelled: 'Cancelled',
};
export const evAnswerNames: Record<EvAnswer, string> = {
  going: 'Going',
  maybe: 'Maybe',
  no: 'Can’t go',
  waitlist: 'Waitlist',
};

/** Whether an event is still to come or happening. */
export const evOpen = (e: { status: EvStatus }) =>
  e.status === 'scheduled' || e.status === 'started';

/** A new event's details, from the server's settings. */
export const evBlank = (c: Events, now: number): EvDetails => {
  // Tomorrow evening in the server's time zone.
  const day = zoneParts(now + DAY, c.timeZone);
  const start = zonedTime({ ...day, hour: 19, minute: 0 }, c.timeZone);
  return {
    title: '',
    description: '',
    image: '',
    start,
    end: start + 2 * HOUR,
    timeZone: c.timeZone,
    place: null,
    location: '',
    capacity: 0,
    options: structuredClone(c.options),
    roles: [],
    pingRole: '',
    repeat: 'none',
    reminders: [...c.reminders],
    remindMaybe: c.remindMaybe,
    startPing: c.startPing,
    postAt: 0,
  };
};

// Checks ----------------------------------------------------------------------

export type EvIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const https = (url: string) => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};
const kindWords: Record<EvKind, string> = {
  event: 'event message',
  reminder: 'reminder DM',
  cancelled: 'cancelled DM',
  waitlist: 'waitlist DM',
};

function optionsIssue(o: unknown, where: string): EvIssue | null {
  const missing = { at: '', problem: 'Some settings are missing.' };
  const x = o as Partial<EvOptions> | null;
  if (!x || typeof x !== 'object') return missing;
  for (const k of evChoices) {
    const v = x[k];
    if (!v || typeof v.on !== 'boolean') return missing;
    if (typeof v.label !== 'string' || typeof v.emoji !== 'string')
      return missing;
    if (k === 'going' && !v.on)
      return { at: `${where}:going`, problem: 'Going is always offered.' };
    if (v.on && !v.label.trim())
      return {
        at: `${where}:${k}`,
        problem: `Give the ${evAnswerNames[k]} button a name.`,
      };
    if (v.label.length > evTextLimits.label)
      return {
        at: `${where}:${k}`,
        problem: `Button names are up to ${evTextLimits.label} characters.`,
      };
    if (v.emoji.length > 64) return missing;
  }
  return null;
}

function remindersIssue(
  list: unknown,
  where: string,
  max: number,
): EvIssue | null {
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!Array.isArray(list)) return missing;
  if (list.length > max)
    return {
      at: where,
      problem: `Your plan has up to ${max} reminders for each event.`,
    };
  const seen = new Set<number>();
  for (const r of list) {
    if (typeof r !== 'string') return missing;
    const ms = parseDuration(r);
    if (ms === null)
      return {
        at: where,
        problem: `Write each reminder with m, h, d or w, like 1h or 10m. “${r}” isn’t one.`,
      };
    if (ms < evRanges.reminder.min || ms > evRanges.reminder.max)
      return {
        at: where,
        problem: `Reminders are between ${evRanges.reminder.label} before the start.`,
      };
    if (seen.has(ms))
      return { at: where, problem: `Two reminders are the same time (${r}).` };
    seen.add(ms);
  }
  return null;
}

/**
 * Checks settings sent by the dashboard. `roles` maps a role's id to
 * whether Sparko can give it; `templates` are the server's Studio
 * templates. Returns the first problem, and where it is.
 */
export function evIssue(
  input: unknown,
  {
    roles,
    templates,
    plan,
  }: {
    roles?: Map<string, boolean>;
    templates?: Set<string>;
    plan?: string | null | undefined;
  } = {},
): EvIssue | null {
  const x = input as Partial<Events> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const at = (where: string, problem: string) => ({ at: where, problem });
  const limits = evLimits(plan);

  if (typeof x.channel !== 'string' || !snowflake.test(x.channel))
    return at('channel', 'Pick the channel events are announced in.');
  if (!zoneOk(x.timeZone))
    return at('timeZone', 'Pick the server’s time zone from the list.');
  if (!Array.isArray(x.managers)) return missing;
  if (x.managers.length > 25)
    return at('managers', 'Pick up to 25 roles for Who can manage events.');
  for (const id of x.managers) {
    if (typeof id !== 'string' || !snowflake.test(id)) return missing;
    if (roles && !roles.has(id))
      return at(
        'managers',
        'A role in Who can manage events was deleted. Pick another one.',
      );
  }
  const reminders = remindersIssue(x.reminders, 'reminders', limits.reminders);
  if (reminders) return reminders;
  for (const k of ['remindMaybe', 'startPing', 'attending', 'sync'] as const)
    if (typeof x[k] !== 'boolean') return missing;
  const options = optionsIssue(x.options, 'options');
  if (options) return options;
  if (
    !Number.isInteger(x.listSize) ||
    x.listSize! < 1 ||
    x.listSize! > evTextLimits.listSize
  )
    return at(
      'listSize',
      `Show from 1 to ${evTextLimits.listSize} names in the attendee list.`,
    );
  if (typeof x.attendingRole !== 'string') return missing;
  if (x.attendingRole && !snowflake.test(x.attendingRole)) return missing;
  if (x.attending && !x.attendingRole)
    return at(
      'attendingRole',
      'Pick the role Going members get, or turn the attending role off.',
    );
  if (x.attendingRole && roles && !roles.has(x.attendingRole))
    return at(
      'attendingRole',
      'The attending role was deleted. Pick another one.',
    );
  if (x.attending && roles?.get(x.attendingRole) === false)
    return at(
      'attendingRole',
      'Sparko can’t give the attending role. Move Sparko’s role above it, or pick another one.',
    );
  const d = x.dms;
  if (
    !d ||
    typeof d !== 'object' ||
    typeof d.reminder !== 'boolean' ||
    typeof d.cancelled !== 'boolean' ||
    typeof d.waitlist !== 'boolean'
  )
    return missing;

  const m = x.messages;
  if (!m || typeof m !== 'object') return missing;
  for (const k of evKinds) {
    const id = m[k];
    if (typeof id !== 'string') return missing;
    if (id && !templateId.test(id)) return missing;
    if (id && templates && !templates.has(id))
      return at(
        `message:${k}`,
        `The ${kindWords[k]} template was deleted. Pick or make another one.`,
      );
  }

  const c = x.commands;
  if (!c || typeof c !== 'object' || !c.group) return missing;
  if (typeof c.group.name !== 'string' || !commandName.test(c.group.name))
    return at(
      'command:group',
      'Command names are 1 to 32 lowercase letters, numbers, - or _.',
    );
  if (
    typeof c.group.description !== 'string' ||
    !c.group.description.trim() ||
    c.group.description.length > 100
  )
    return at(
      'command:group',
      `Give /${c.group.name} a description of up to 100.`,
    );
  const used = new Set<string>();
  for (const key of evCommandKeys) {
    const cmd = c[key];
    const where = `command:${key}`;
    if (!cmd || typeof cmd.on !== 'boolean') return missing;
    if (typeof cmd.name !== 'string' || !commandName.test(cmd.name))
      return at(
        where,
        'Command names are 1 to 32 lowercase letters, numbers, - or _.',
      );
    if (used.has(cmd.name))
      return at(where, `Two commands are called /${c.group.name} ${cmd.name}.`);
    used.add(cmd.name);
    if (
      typeof cmd.description !== 'string' ||
      !cmd.description.trim() ||
      cmd.description.length > 100
    )
      return at(
        where,
        `Give /${c.group.name} ${cmd.name} a description of up to 100.`,
      );
  }
  return null;
}

/**
 * Checks an event sent by the dashboard or the /event form. `roles` are
 * the server's roles, `places` its voice and stage channels; `editing` is
 * the event as it was, which may already have started.
 */
export function evEventIssue(
  input: unknown,
  {
    now,
    plan,
    roles,
    places,
    editing,
  }: {
    now: number;
    plan?: string | null | undefined;
    roles?: Set<string> | undefined;
    places?: Set<string> | undefined;
    editing?: EvEvent | undefined;
  },
): EvIssue | null {
  const x = input as Partial<EvDetails> | null;
  const missing = { at: '', problem: 'Some details are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const at = (where: string, problem: string) => ({ at: where, problem });

  if (typeof x.title !== 'string' || !x.title.trim())
    return at('title', 'Give the event a title.');
  if (x.title.length > evTextLimits.title)
    return at('title', `Titles are up to ${evTextLimits.title} characters.`);
  if (typeof x.description !== 'string') return missing;
  if (x.description.length > evTextLimits.description)
    return at(
      'description',
      `Descriptions are up to ${evTextLimits.description.toLocaleString('en-US')} characters.`,
    );
  if (typeof x.image !== 'string') return missing;
  if (x.image && (!https(x.image) || x.image.length > 500))
    return at('image', 'The picture has to be a link starting with https://.');
  if (!zoneOk(x.timeZone))
    return at('timeZone', 'Pick the event’s time zone from the list.');
  if (!Number.isInteger(x.start) || !Number.isInteger(x.end))
    return at('start', 'Pick when the event starts.');
  const started = editing && editing.status !== 'scheduled';
  if (started && x.start !== editing.start)
    return at('start', 'The event has started, so its start can’t change.');
  if (!started && x.start! < now - MINUTE)
    return at('start', 'The start has to be in the future.');
  if (x.start! > now + evRanges.ahead)
    return at('start', 'Events can be up to 2 years ahead.');
  const length = x.end! - x.start!;
  if (length < evRanges.length.min || length > evRanges.length.max)
    return at(
      'end',
      `An event lasts between ${evRanges.length.label}. Check the end.`,
    );
  if (started && x.end! <= now)
    return at('end', 'The end has to be in the future.');

  if (x.place !== null) {
    const p = x.place;
    if (
      !p ||
      typeof p !== 'object' ||
      typeof p.id !== 'string' ||
      !snowflake.test(p.id) ||
      typeof p.name !== 'string' ||
      typeof p.stage !== 'boolean'
    )
      return missing;
    if (places && !places.has(p.id))
      return at(
        'place',
        'That voice channel was deleted. Pick another one, or none.',
      );
  }
  if (typeof x.location !== 'string') return missing;
  if (x.location.length > evTextLimits.location)
    return at(
      'location',
      `Write the place in up to ${evTextLimits.location} characters.`,
    );
  if (
    !Number.isInteger(x.capacity) ||
    x.capacity! < 0 ||
    x.capacity! > evTextLimits.capacity
  )
    return at(
      'capacity',
      `The capacity is a number from 0 (no limit) to ${evTextLimits.capacity.toLocaleString('en-US')}.`,
    );
  const options = optionsIssue(x.options, 'option');
  if (options) return options;
  if (!Array.isArray(x.roles)) return missing;
  if (x.roles.length > 25)
    return at('roles', 'Pick up to 25 roles for Who can answer.');
  for (const id of x.roles) {
    if (typeof id !== 'string' || !snowflake.test(id)) return missing;
    if (roles && !roles.has(id))
      return at('roles', 'A role in Who can answer was deleted.');
  }
  if (typeof x.pingRole !== 'string') return missing;
  if (x.pingRole) {
    if (!snowflake.test(x.pingRole)) return missing;
    if (roles && !roles.has(x.pingRole))
      return at('pingRole', 'The role to ping was deleted. Pick another one.');
  }
  if (!evRepeats.includes(x.repeat as EvRepeat)) return missing;
  const reminders = remindersIssue(
    x.reminders,
    'eventReminders',
    evLimits(plan).reminders,
  );
  if (reminders) return reminders;
  if (typeof x.remindMaybe !== 'boolean' || typeof x.startPing !== 'boolean')
    return missing;
  if (!Number.isInteger(x.postAt) || x.postAt! < 0) return missing;
  if (x.postAt && !editing?.messageId) {
    if (x.postAt >= x.start!)
      return at('postAt', 'Post the event before it starts.');
    if (x.postAt < now - MINUTE)
      return at('postAt', 'The time to post it has passed. Pick a later one.');
  }
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export function cleanEvents(c: Events): Events {
  const cmd = (k: EvCommandKey) => ({
    on: c.commands[k].on,
    name: c.commands[k].name,
    description: c.commands[k].description.trim(),
  });
  return {
    channel: c.channel,
    timeZone: c.timeZone,
    managers: [...new Set(c.managers)],
    reminders: c.reminders.map((r) => r.trim()),
    remindMaybe: c.remindMaybe,
    startPing: c.startPing,
    options: cleanOptions(c.options),
    listSize: c.listSize,
    attending: c.attending,
    attendingRole: c.attendingRole,
    sync: c.sync,
    dms: {
      reminder: c.dms.reminder,
      cancelled: c.dms.cancelled,
      waitlist: c.dms.waitlist,
    },
    messages: {
      event: c.messages.event,
      reminder: c.messages.reminder,
      cancelled: c.messages.cancelled,
      waitlist: c.messages.waitlist,
    },
    commands: {
      group: {
        name: c.commands.group.name,
        description: c.commands.group.description.trim(),
      },
      create: cmd('create'),
      list: cmd('list'),
      info: cmd('info'),
      rsvp: cmd('rsvp'),
      cancel: cmd('cancel'),
      remind: cmd('remind'),
    },
  };
}

const cleanOptions = (o: EvOptions): EvOptions => {
  const one = (k: EvChoice) => ({
    on: k === 'going' ? true : o[k].on,
    label: o[k].label.trim(),
    emoji: o[k].emoji.trim(),
  });
  return { going: one('going'), maybe: one('maybe'), no: one('no') };
};

/** An event's details with only the known fields. */
export function cleanDetails(d: EvDetails): EvDetails {
  return {
    title: d.title.trim(),
    description: d.description.trim(),
    image: d.image.trim(),
    start: d.start,
    end: d.end,
    timeZone: d.timeZone,
    place: d.place
      ? { id: d.place.id, name: d.place.name, stage: d.place.stage }
      : null,
    location: d.location.trim(),
    capacity: d.capacity,
    options: cleanOptions(d.options),
    roles: [...new Set(d.roles)],
    pingRole: d.pingRole,
    repeat: d.repeat,
    reminders: [...new Set(d.reminders.map((r) => r.trim()))],
    remindMaybe: d.remindMaybe,
    startPing: d.startPing,
    postAt: d.postAt,
  };
}

/**
 * Settings saved by an older version, with anything added since filled in
 * from the defaults.
 */
export function evUpgrade(saved: Partial<Events> | null | undefined) {
  const base = evDefault();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    options: {
      going: { ...base.options.going, ...saved.options?.going },
      maybe: { ...base.options.maybe, ...saved.options?.maybe },
      no: { ...base.options.no, ...saved.options?.no },
    },
    dms: { ...base.dms, ...saved.dms },
    messages: { ...base.messages, ...saved.messages },
    commands: {
      ...base.commands,
      ...saved.commands,
      group: { ...base.commands.group, ...saved.commands?.group },
    },
  } as Events;
}

/** Problems with an event message template: its own rows plus the RSVP row. */
export function evMessageIssue(m: StudioMessage): EvIssue | null {
  if (m.layout !== 'v2' && componentRows(m.components).length > 4)
    return {
      at: 'message',
      problem:
        'The RSVP buttons take one of Discord’s five rows, so an event message has up to 4 rows of its own.',
    };
  return null;
}

// Who can do what -------------------------------------------------------------

/** Whether someone can create, edit, cancel and remind. */
export const evIsManager = (c: Events, member: Set<string>, manager: boolean) =>
  manager || c.managers.some((r) => member.has(r));

/** Why a member can't answer an event, or null when they can. */
export function evCanAnswer(
  e: Pick<EvEvent, 'status' | 'roles' | 'options' | 'end'>,
  choice: EvChoice,
  member: Set<string>,
  now: number,
) {
  if (e.status === 'cancelled') return 'This event was cancelled.';
  if (e.status === 'ended' || now >= e.end) return 'This event has ended.';
  if (!e.options[choice].on)
    return `This event doesn’t take ${evAnswerNames[choice]} answers.`;
  if (e.roles.length && !e.roles.some((r) => member.has(r)))
    return `Only ${e.roles.map((r) => `<@&${r}>`).join(', ')} can answer this event.`;
  return null;
}

/**
 * Where a member's answer lands, given the answers so far: Going past the
 * capacity waits in line, and answering the same again takes it back.
 */
export function evAnswerFor(
  e: Pick<EvEvent, 'capacity'>,
  choice: EvChoice,
  was: EvAnswer | null,
  goingNow: number,
): EvAnswer | null {
  const current = was === 'waitlist' ? 'going' : was;
  if (current === choice) return null;
  if (choice !== 'going') return choice;
  const others = was === 'going' ? goingNow - 1 : goingNow;
  return e.capacity && others >= e.capacity ? 'waitlist' : 'going';
}

// Messages --------------------------------------------------------------------

export const evKindNames: Record<EvKind, string> = {
  event: 'Event',
  reminder: 'Reminder DM',
  cancelled: 'Cancelled DM',
  waitlist: 'Waitlist DM',
};
export const evKindAbout: Record<EvKind, string> = {
  event:
    'Posted in the events channel, and kept up to date with who’s going. The RSVP and calendar buttons are added under it.',
  reminder:
    'Sent to Going members (and Maybe, if the event says so) before the event starts.',
  cancelled: 'Sent to Going members when an event is cancelled.',
  waitlist:
    'Sent when a spot opens and someone moves from the waitlist to Going.',
};

const embedMessage = (
  name: string,
  content: string,
  embed: Partial<ReturnType<typeof embedDefault>>,
): StudioMessage => ({
  name,
  channel: '',
  layout: 'embed',
  content,
  embeds: [{ ...embedDefault(), ...embed }],
  components: [],
  v2: v2Default(),
});
const v2Message = (
  name: string,
  accent: string,
  text: string,
  thumbnail = '',
): StudioMessage => ({
  name,
  channel: '',
  layout: 'v2',
  content: '',
  embeds: [],
  components: [],
  v2: { ...v2Default(), accent, text, thumbnail },
});

export type EvPreset = {
  id: string;
  kind: EvKind;
  name: string;
  about: string;
  message: StudioMessage;
};

/** Ready-made messages to start from; the first of each kind is Sparko's own. */
export const evPresets: EvPreset[] = [
  {
    id: 'ev-card',
    kind: 'event',
    name: 'Event card',
    about: 'An embed with when, where, the host and who’s going.',
    message: embedMessage('Event card', '', {
      title: '📅 {event.title}',
      description: '{event.description}',
      color: '#5865F2',
      fields: [
        {
          id: 'f1',
          name: 'When',
          value: '{event.start}\n{event.start.relative}',
          inline: true,
        },
        { id: 'f2', name: 'Where', value: '{event.location}', inline: true },
        { id: 'f3', name: 'Host', value: '{event.host}', inline: true },
        {
          id: 'f4',
          name: 'Going ({going.count})',
          value: '{going.list}',
          inline: false,
        },
      ],
      footer: 'Event {event.id} · {event.status} · {spots.left} spots left',
    }),
  },
  {
    id: 'ev-compact',
    kind: 'event',
    name: 'Compact',
    about: 'Just the essentials, with the counts in the footer.',
    message: embedMessage('Compact event', '', {
      title: '{event.title}',
      description:
        '🕒 {event.start} ({event.start.relative})\n📍 {event.location}\n\n{event.description}',
      color: '#57F287',
      footer:
        '{event.id} · {going.count} going · {maybe.count} maybe · {event.status}',
    }),
  },
  {
    id: 'ev-v2',
    kind: 'event',
    name: 'Modern event',
    about: 'A Components V2 card with the attendees under a divider.',
    message: v2Message(
      'Modern event',
      '#5865F2',
      '## 📅 {event.title}\n{event.description}\n{separator}\n**When:** {event.start} ({event.start.relative})\n**Where:** {event.location}\n**Host:** {event.host}\n{separator}\n**Going ({going.count}):** {going.list}\n-# {event.id} · {event.status} · {spots.left} spots left',
    ),
  },
  {
    id: 'ev-reminder',
    kind: 'reminder',
    name: 'Reminder',
    about: 'A friendly heads-up with a link to the event.',
    message: embedMessage('Event reminder', '', {
      title: '⏰ {event.title} starts {event.start.relative}',
      description:
        'You said you’re going. See you there!\n\n**When:** {event.start}\n**Where:** {event.location}\n\n[Open the event]({event.link})',
      color: '#FACC15',
      footer: '{server}',
    }),
  },
  {
    id: 'ev-reminder-v2',
    kind: 'reminder',
    name: 'Modern reminder',
    about: 'A Components V2 card.',
    message: v2Message(
      'Modern reminder',
      '#FACC15',
      '## ⏰ Starting {event.start.relative}\n**{event.title}** in **{server}**\n{separator}\n📍 {event.location}\n-# [Open the event]({event.link})',
    ),
  },
  {
    id: 'ev-cancelled',
    kind: 'cancelled',
    name: 'Cancelled notice',
    about: 'Lets Going members know it’s off.',
    message: embedMessage('Event cancelled', '', {
      title: '❌ {event.title} was cancelled',
      description:
        'Sorry, the event on {event.start} in **{server}** won’t happen. You don’t need to do anything.',
      color: '#ED4245',
    }),
  },
  {
    id: 'ev-waitlist',
    kind: 'waitlist',
    name: 'You’re in!',
    about: 'Tells someone a spot opened up for them.',
    message: embedMessage('Off the waitlist', '', {
      title: '🎉 You’re going to {event.title}!',
      description:
        'A spot opened up, so you moved from the waitlist to Going.\n\n**When:** {event.start}\n**Where:** {event.location}\n\nCan’t make it any more? [Change your answer]({event.link}).',
      color: '#57F287',
      footer: '{server}',
    }),
  },
];

/** Sparko's own message for a kind, used until the server picks one. */
export const evDefaultMessage = (kind: EvKind) =>
  evPresets.find((p) => p.kind === kind)!.message;

/** "https://discord.com/channels/…" for an event's message, or ''. */
export const evLink = (
  guildId: string,
  e: Pick<EvEvent, 'channelId' | 'messageId'>,
) =>
  e.channelId && e.messageId
    ? `https://discord.com/channels/${guildId}/${e.channelId}/${e.messageId}`
    : '';

/** "<@1>, <@2> and 3 more", or "Nobody yet". */
export function goingList(ids: string[], size: number) {
  if (!ids.length) return 'Nobody yet';
  const shown = ids.slice(0, size).map((id) => `<@${id}>`);
  const more = ids.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length < 2
    ? shown.join('')
    : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)!}`;
}

/** Where an event is, as messages show it. */
export const evWhere = (e: Pick<EvDetails, 'place' | 'location'>) =>
  [e.place ? `<#${e.place.id}>` : '', e.location].filter(Boolean).join(' · ') ||
  'To be announced';

/** What fills an event's {variables}. */
export function evVariables(
  c: Events,
  e: EvEvent,
  going: string[],
  guildId: string,
): Record<string, string> {
  const unix = (ms: number) => Math.floor(ms / 1000);
  const ended = e.status === 'ended';
  return {
    'event.title': e.title,
    'event.description': e.description,
    'event.id': `#${e.number}`,
    'event.start': `<t:${unix(e.start)}:F>`,
    'event.start.relative': `<t:${unix(e.start)}:R>`,
    'event.end': `<t:${unix(e.end)}:F>`,
    'event.location': evWhere(e),
    'event.host': e.hostId && e.hostId !== '0' ? `<@${e.hostId}>` : e.hostName,
    'event.link': evLink(guildId, e),
    'event.status': ended
      ? `Ended · ${e.counts.going} went`
      : evStatusNames[e.status],
    'going.count': String(e.counts.going),
    'maybe.count': String(e.counts.maybe),
    'spots.left': e.capacity
      ? String(Math.max(0, e.capacity - e.counts.going))
      : 'Unlimited',
    'going.list': goingList(going, c.listSize),
  };
}

/**
 * A Google Calendar link for an event, within the 512 characters Discord
 * allows on a link button.
 */
export function calendarUrl(
  e: Pick<
    EvDetails,
    'title' | 'description' | 'start' | 'end' | 'place' | 'location'
  >,
) {
  const stamp = (ms: number) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const build = (details: string) =>
    `https://calendar.google.com/calendar/render?${new URLSearchParams({
      action: 'TEMPLATE',
      text: e.title.slice(0, 100),
      dates: `${stamp(e.start)}/${stamp(e.end)}`,
      ...(details ? { details } : {}),
      ...(e.location || e.place
        ? { location: (e.location || e.place?.name || '').slice(0, 100) }
        : {}),
    }).toString()}`;
  let details = e.description;
  let url = build(details);
  while (url.length > 512 && details) {
    details = details.slice(0, Math.max(0, details.length - 40));
    url = build(details ? `${details}…` : '');
  }
  return url.length > 512 ? build('').slice(0, 512) : url;
}

/** The custom id of an RSVP button. */
export const evButtonId = (number: number, choice: EvChoice) =>
  `ev:rsvp:${number}:${choice}`;
/** What an event button's custom id says, or null. */
export function parseEvId(id: string) {
  const m = id.match(/^ev:rsvp:(\d{1,9}):(going|maybe|no)$/);
  return m ? { number: Number(m[1]), choice: m[2] as EvChoice } : null;
}

/** The row of RSVP buttons, the calendar link and, once over, the status. */
export function evButtons(e: EvEvent) {
  const closed = !evOpen(e);
  const label = (k: EvChoice, o: EvOption) => {
    const n = e.counts[k];
    const count =
      k === 'going' && e.capacity
        ? `${n}/${e.capacity}${e.counts.waitlist ? ` · ${e.counts.waitlist} waiting` : ''}`
        : String(n);
    return `${o.label} (${count})`.slice(0, 80);
  };
  const style: Record<EvChoice, number> = { going: 3, maybe: 2, no: 2 };
  const buttons: object[] = evChoices
    .filter((k) => e.options[k].on)
    .map((k) => ({
      type: 2,
      style: style[k],
      custom_id: evButtonId(e.number, k),
      label: label(k, e.options[k]),
      ...(e.options[k].emoji
        ? { emoji: emojiPayload(e.options[k].emoji) }
        : {}),
      ...(closed ? { disabled: true } : {}),
    }));
  if (closed)
    buttons.push({
      type: 2,
      style: e.status === 'cancelled' ? 4 : 2,
      custom_id: `ev:status:${e.number}`,
      label:
        e.status === 'cancelled'
          ? 'Cancelled'
          : `Ended · ${e.counts.going} went`,
      disabled: true,
    });
  else
    buttons.push({
      type: 2,
      style: 5,
      label: 'Add to calendar',
      emoji: { name: '📆' },
      url: calendarUrl(e),
    });
  return { type: 1, components: buttons };
}

type Payload = Record<string, unknown> & {
  embeds?: Record<string, unknown>[];
  components?: object[];
};

/**
 * The event message: the template with the event filled in, its picture,
 * and the RSVP row under it. The ping role is pinged only when asked to.
 */
export function evPayload(
  c: Events,
  message: StudioMessage,
  e: EvEvent,
  going: string[],
  ctx: { now: number; guildId: string; ping?: boolean } & StudioVars,
) {
  const extra = evVariables(c, e, going, ctx.guildId);
  const body = studioPayload(message, {
    ...ctx,
    user: { id: e.hostId, name: e.hostName },
    extra: { ...ctx.extra, ...extra },
  }) as Payload;
  if (message.layout === 'v2') {
    const container = (body.components ?? []).find(
      (x) => (x as { type: number }).type === 17,
    ) as { components: object[] } | undefined;
    if (container && e.image)
      container.components.push({
        type: 12,
        items: [{ media: { url: e.image } }],
      });
    body.components = [...(body.components ?? []), evButtons(e)];
    if (ctx.ping && e.pingRole)
      body.components.unshift({ type: 10, content: `<@&${e.pingRole}>` });
  } else {
    const embed = body.embeds?.[0];
    if (embed && !embed.image && e.image) embed.image = { url: e.image };
    body.components = [...(body.components ?? []), evButtons(e)];
    if (ctx.ping && e.pingRole)
      body.content = `<@&${e.pingRole}> ${String(body.content ?? '')}`.trim();
  }
  body.allowed_mentions =
    ctx.ping && e.pingRole ? { parse: [], roles: [e.pingRole] } : { parse: [] };
  return body;
}

/** A DM about an event, to one member. */
export function evDmPayload(
  c: Events,
  message: StudioMessage,
  e: EvEvent,
  going: string[],
  to: { id: string; name: string; avatar?: string },
  ctx: { now: number; guildId: string } & StudioVars,
) {
  return studioPayload(message, {
    ...ctx,
    user: { id: to.id, name: to.name, avatar: to.avatar },
    extra: { ...ctx.extra, ...evVariables(c, e, going, ctx.guildId) },
  }) as Payload;
}

/** The short message in the channel when an event starts. */
export function evStartPayload(e: EvEvent, going: string[], link: string) {
  const who = going.slice(0, 50).map((id) => `<@${id}>`);
  const content = [
    `🔔 **${e.title}** is starting now!${e.place ? ` Join in <#${e.place.id}>.` : e.location ? ` 📍 ${e.location}` : ''}`,
    who.length ? who.join(' ') : '',
    link ? `-# ${link}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    content: content.slice(0, 2000),
    allowed_mentions: { parse: [], users: going.slice(0, 50) },
  };
}

/** Flags for a Components V2 test note. */
export const EV_V2 = IS_COMPONENTS_V2;

// Discord's scheduled events -----------------------------------------------------

/** The body of one of Discord's own scheduled events for an event. */
export function evDiscordEvent(e: EvDetails) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const base = {
    name: e.title.slice(0, 100),
    privacy_level: 2,
    scheduled_start_time: iso(e.start),
    scheduled_end_time: iso(e.end),
    ...(e.description ? { description: e.description.slice(0, 1000) } : {}),
  };
  return e.place
    ? {
        ...base,
        channel_id: e.place.id,
        entity_type: e.place.stage ? 1 : 2,
        entity_metadata: null,
      }
    : {
        ...base,
        channel_id: null,
        entity_type: 3,
        entity_metadata: {
          location: (e.location || 'To be announced').slice(0, 100),
        },
      };
}

// Commands --------------------------------------------------------------------

/** The /event command and its subcommands, as Discord registers them. */
export function evCommandBodies(c: Events) {
  const id = (description: string) => ({
    type: 4,
    name: 'id',
    description,
    required: true,
    min_value: 1,
    autocomplete: true,
  });
  const body: Record<EvCommandKey, object[]> = {
    create: [],
    list: [],
    info: [id('The event’s number')],
    rsvp: [
      id('The event’s number'),
      {
        type: 3,
        name: 'choice',
        description: 'Your answer',
        required: true,
        choices: evChoices
          .filter((k) => c.options[k].on)
          .map((k) => ({
            name: c.options[k].label || evAnswerNames[k],
            value: k,
          })),
      },
    ],
    cancel: [id('The event to cancel')],
    remind: [id('The event to remind people about')],
  };
  const subs = evCommandKeys
    .filter((k) => c.commands[k].on)
    .map((k) => ({
      type: 1,
      name: c.commands[k].name,
      description: c.commands[k].description,
      options: body[k],
    }));
  if (!subs.length) return [];
  return [
    {
      type: 1,
      name: c.commands.group.name,
      description: c.commands.group.description,
      options: subs,
      contexts: [0],
    },
  ];
}

/** Which event subcommand a typed command is, in this server. */
export const evCommandFor = (c: Events, name: string, sub: string | null) =>
  name === c.commands.group.name
    ? evCommandKeys.find((k) => c.commands[k].on && c.commands[k].name === sub)
    : undefined;

// Logs ------------------------------------------------------------------------

export type EvLogAction =
  | 'created'
  | 'edited'
  | 'rsvp'
  | 'promoted'
  | 'reminded'
  | 'started'
  | 'ended'
  | 'cancelled'
  | 'deleted'
  | 'repeated'
  | 'failed';
export type EvLogEntry = {
  id: string;
  action: EvLogAction;
  /** The event it's about, if any. */
  number: number | null;
  title: string;
  userId: string;
  userName: string;
  detail: string;
  at: number;
};

/** One log line, like "[RSVP] @ayo is going to #3 Movie night". */
export function evLogLine(e: EvLogEntry) {
  const ev = e.number === null ? e.title : `#${e.number} ${e.title}`;
  const who = `@${e.userName}`;
  const more = e.detail ? `: ${e.detail}` : '';
  switch (e.action) {
    case 'created':
      return `[CREATED] ${ev} by ${who}${more}`;
    case 'edited':
      return `[EDITED] ${ev} by ${who}${more}`;
    case 'rsvp':
      return `[RSVP] ${who} ${e.detail} ${ev}`;
    case 'promoted':
      return `[PROMOTED] ${who} moved from the waitlist to Going for ${ev}`;
    case 'reminded':
      return `[REMINDER] ${ev}${more}`;
    case 'started':
      return `[STARTED] ${ev} started${more}`;
    case 'ended':
      return `[ENDED] ${ev} ended${more}`;
    case 'cancelled':
      return `[CANCELLED] ${ev} cancelled by ${who}${more}`;
    case 'deleted':
      return `[DELETED] ${ev} deleted by ${who}`;
    case 'repeated':
      return `[REPEATED] ${ev} was scheduled again${more}`;
    default:
      return `[FAILED] ${ev}${more}`;
  }
}
