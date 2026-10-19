/**
 * Birthdays: members save their birthday with a slash command and Sparko
 * celebrates on the day, at the server's hour in the right time zone, with a
 * post, a role for the day and a DM. A "this month" post can go out on the
 * 1st. Nothing here touches the database or the network, so the dashboard
 * imports this file too.
 */
import { parseDuration } from './auto-roles.ts';
import { commandName } from './suggestions.ts';
import {
  embedDefault,
  studioPayload,
  v2Default,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';

export const BD_MODULE = 'birthdays';

/** The four messages: one birthday, several at once, the month, the DM. */
export type BdKind = 'single' | 'multiple' | 'monthly' | 'dm';
export const bdKinds: BdKind[] = ['single', 'multiple', 'monthly', 'dm'];

export type BdCommandKey = 'set' | 'remove' | 'view' | 'upcoming' | 'list';
export type BdCommand = { on: boolean; name: string; description: string };

export type Birthdays = {
  /** Where birthdays are announced. */
  channel: string;
  /** The hour of the day (0 to 23) Sparko celebrates at. */
  hour: number;
  /** The server's time zone, like "Europe/London". */
  timeZone: string;
  /** At the hour in the server's time zone, or in each member's own. */
  zoneMode: 'server' | 'member';
  /** Given for the day and taken back 24 hours later; '' for none. */
  role: string;
  /** Mentions in the post ping the members it's for. */
  ping: boolean;
  requireYear: boolean;
  /** Shows the age in {birthday.age} when the year is known. */
  showAge: boolean;
  /** Members who left stay out of lists and the monthly post. */
  hideLeft: boolean;
  /** Deletes a member's birthday when they leave. */
  forgetLeavers: boolean;
  /** How old an account has to be to save a birthday, like "7d"; '' for any. */
  minAccountAge: string;
  /** How long someone has to have been in the server; '' for any time. */
  minMemberAge: string;
  /** How long after changing their date a member can change it again. */
  changeCooldown: string;
  /** Roles that can set and remove other members' birthdays; [] for Manage Server. */
  staff: string[];
  /** One post listing everyone, or one post for each member. */
  style: 'together' | 'each';
  /** DMs each member on their birthday. */
  dm: boolean;
  /** Posts the month's birthdays on the 1st. */
  monthly: boolean;
  /** Studio template ids for each message; '' for Sparko's own. */
  messages: Record<BdKind, string>;
  /** The /birthday command and its subcommands, as the server names them. */
  commands: {
    group: { name: string; description: string };
  } & Record<BdCommandKey, BdCommand>;
};

export const bdCommandKeys: BdCommandKey[] = [
  'set',
  'remove',
  'view',
  'upcoming',
  'list',
];
export const bdCommandAbout: Record<BdCommandKey, string> = {
  set: 'Members save their birthday: the day, the month, and the year and time zone if they like. Staff can set someone else’s.',
  remove: 'Members forget their birthday. Staff can remove someone else’s too.',
  view: 'Shows a member’s birthday, and their age if they saved the year and ages are shown.',
  upcoming: 'Lists the next 10 birthdays in the server.',
  list: 'Lists every birthday in a month the member picks.',
};

export const bdDefaultCommands = (): Birthdays['commands'] => ({
  group: { name: 'birthday', description: 'Birthdays in this server' },
  set: { on: true, name: 'set', description: 'Save your birthday' },
  remove: { on: true, name: 'remove', description: 'Forget your birthday' },
  view: { on: true, name: 'view', description: 'See someone’s birthday' },
  upcoming: {
    on: true,
    name: 'upcoming',
    description: 'The next birthdays in the server',
  },
  list: { on: true, name: 'list', description: 'Birthdays in a month' },
});

export const bdDefault = (channel = ''): Birthdays => ({
  channel,
  hour: 9,
  timeZone: 'UTC',
  zoneMode: 'server',
  role: '',
  ping: true,
  requireYear: false,
  showAge: true,
  hideLeft: true,
  forgetLeavers: false,
  minAccountAge: '',
  minMemberAge: '',
  changeCooldown: '30d',
  staff: [],
  style: 'together',
  dm: false,
  monthly: false,
  messages: { single: '', multiple: '', monthly: '', dm: '' },
  commands: bdDefaultCommands(),
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The shortest and longest each time can be. */
export const bdRanges = {
  minAccountAge: { min: DAY, max: 365 * DAY, label: '1d and 1y' },
  minMemberAge: { min: HOUR, max: 365 * DAY, label: '1h and 1y' },
  changeCooldown: { min: DAY, max: 365 * DAY, label: '1d and 1y' },
} as const;
/** The birthday role is taken back this long after it was given. */
export const BD_ROLE_MS = DAY;
/** Ages a saved year can give, so a typo doesn't make someone 3 or 300. */
export const bdAges = { min: 13, max: 120 } as const;

// Dates and time zones --------------------------------------------------------

export const bdMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const isLeap = (y: number) =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Days in a month; February has 29 when the year isn't known. */
export const daysIn = (month: number, year?: number | null) =>
  month === 2
    ? year == null || isLeap(year)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

/** "14 March". */
export const bdDateText = (day: number, month: number) =>
  `${day} ${bdMonths[month - 1] ?? ''}`.trim();

/** The day a birthday is celebrated in a year: 29 February is the 28th in other years. */
export const celebratedOn = (month: number, day: number, year: number) =>
  month === 2 && day === 29 && !isLeap(year)
    ? { month: 2, day: 28 }
    : { month, day };

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
      hourCycle: 'h23',
    });
    formats.set(zone, f);
  }
  return f;
};

/** Whether a time zone is one the system knows, like "Europe/London". */
export function zoneOk(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone || zone.length > 64) return false;
  try {
    formatFor(zone);
    return true;
  } catch {
    return false;
  }
}

/** The date and hour it is at `now` in a time zone. */
export function localNow(now: number, zone: string) {
  const parts = formatFor(zoneOk(zone) ? zone : 'UTC').formatToParts(
    new Date(now),
  );
  const n = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    // Some systems write midnight as 24.
    hour: n('hour') % 24,
  };
}

/** "UTC+05:30" for a time zone at `now`. */
export function zoneOffset(zone: string, now = Date.now()) {
  try {
    const name =
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        timeZoneName: 'longOffset',
      })
        .formatToParts(new Date(now))
        .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    return name === 'GMT' ? 'UTC+00:00' : name.replace('GMT', 'UTC');
  } catch {
    return 'UTC+00:00';
  }
}

/** Older names some systems still list, and what people call them now. */
const renamed: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Godthab': 'America/Nuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
};
let zoneList: string[] | null = null;

/** Every time zone the system knows, UTC first, by their current names. */
export function bdTimeZones(): string[] {
  if (zoneList) return zoneList;
  const list =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [];
  const named = list.map((z) =>
    renamed[z] && zoneOk(renamed[z]) ? renamed[z] : z,
  );
  zoneList = ['UTC', ...new Set(named.filter((z) => z !== 'UTC'))].sort(
    (a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)),
  );
  return zoneList;
}

/** Time zones matching what someone typed, by name or city, for menus. */
export function searchZones(typed: string, limit = 25) {
  const t = typed.trim().toLowerCase().replace(/\s+/g, '_');
  const all = bdTimeZones();
  if (!t) return all.slice(0, limit);
  const starts = all.filter(
    (z) =>
      z.toLowerCase().startsWith(t) ||
      z.toLowerCase().split('/').at(-1)!.startsWith(t),
  );
  const has = all.filter(
    (z) => !starts.includes(z) && z.toLowerCase().includes(t),
  );
  return [...starts, ...has].slice(0, limit);
}

/** Calendar days from one date to another. */
const daysBetween = (
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number },
) =>
  Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) -
      Date.UTC(a.year, a.month - 1, a.day)) /
      DAY,
  );

/** A saved birthday, as the bot, the server and the dashboard pass it around. */
export type BdEntry = {
  userId: string;
  name: string;
  avatar: string;
  day: number;
  month: number;
  year: number | null;
  /** Their own time zone, or '' for the server's. */
  timeZone: string;
  setById: string;
  setByName: string;
  inServer: boolean;
  /** The last year Sparko celebrated it, so it never posts twice. */
  celebratedYear: number | null;
  /** When the birthday role comes off again, while they have it. */
  roleUntil: number | null;
  /** When the date last changed, for the change limit. */
  changedAt: number;
  updatedAt: number;
};

/** The time zone a birthday is celebrated in. */
export const zoneOf = (c: Birthdays, b: { timeZone: string }) =>
  c.zoneMode === 'member' && zoneOk(b.timeZone) ? b.timeZone : c.timeZone;

/** When a birthday is next: today counts, with days 0. */
export function bdNext(
  b: { day: number; month: number },
  now: number,
  zone: string,
) {
  const today = localNow(now, zone);
  let year = today.year;
  let on = celebratedOn(b.month, b.day, year);
  if (
    on.month < today.month ||
    (on.month === today.month && on.day < today.day)
  ) {
    year += 1;
    on = celebratedOn(b.month, b.day, year);
  }
  return { year, ...on, days: daysBetween(today, { year, ...on }) };
}

/** How old someone turns on their birthday in a year, if their year is known. */
export const ageIn = (b: { year: number | null }, year: number) =>
  b.year === null ? null : year - b.year;

/**
 * Whether a birthday is due at `now`: it's the day (in the right time
 * zone), the hour has come, and it wasn't celebrated this year yet.
 */
export function bdDue(c: Birthdays, b: BdEntry, now: number) {
  if (!b.inServer) return null;
  const local = localNow(now, zoneOf(c, b));
  const on = celebratedOn(b.month, b.day, local.year);
  if (on.month !== local.month || on.day !== local.day) return null;
  if (local.hour < c.hour || b.celebratedYear === local.year) return null;
  return { year: local.year };
}

/** Whether the monthly post is due: the 1st, at the hour, in the server's time zone. */
export function bdMonthlyDue(c: Birthdays, last: string, now: number) {
  if (!c.monthly) return null;
  const local = localNow(now, c.timeZone);
  const key = `${local.year}-${String(local.month).padStart(2, '0')}`;
  if (local.day !== 1 || local.hour < c.hour || last === key) return null;
  return { key, month: local.month, year: local.year };
}

/** The next birthdays, soonest first, with how many days away each is. */
export function bdUpcoming(
  c: Birthdays,
  list: BdEntry[],
  now: number,
  limit = 10,
) {
  return list
    .filter((b) => b.inServer || !c.hideLeft)
    .map((b) => {
      const next = bdNext(b, now, zoneOf(c, b));
      return {
        ...b,
        next,
        age: c.showAge ? ageIn(b, next.year) : null,
      };
    })
    .sort(
      (a, b) => a.next.days - b.next.days || a.name.localeCompare(b.name, 'en'),
    )
    .slice(0, limit);
}

// Checks ----------------------------------------------------------------------

export type BdIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const kindWords: Record<BdKind, string> = {
  single: 'birthday message',
  multiple: 'several birthdays message',
  monthly: 'monthly post',
  dm: 'birthday DM',
};

/** Why a date can't be saved, or null when it can. */
export function bdDateProblem(
  c: Birthdays,
  d: { day: unknown; month: unknown; year: unknown },
  now: number,
) {
  const month = d.month;
  const day = d.day;
  const year = d.year;
  if (
    !Number.isInteger(month) ||
    (month as number) < 1 ||
    (month as number) > 12
  )
    return 'Pick a month from January to December.';
  if (year !== null && year !== undefined) {
    const thisYear = new Date(now).getUTCFullYear();
    if (
      !Number.isInteger(year) ||
      (year as number) > thisYear - bdAges.min ||
      (year as number) < thisYear - bdAges.max
    )
      return `Write the year you were born, from ${thisYear - bdAges.max} to ${thisYear - bdAges.min}.`;
  } else if (c.requireYear)
    return 'This server asks for the year you were born too.';
  const max = daysIn(month as number, (year as number | null) ?? null);
  if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > max)
    return month === 2 && day === 29
      ? `${year as number} wasn’t a leap year, so February had 28 days.`
      : `${bdMonths[(month as number) - 1]} has ${max} days. Pick a day from 1 to ${max}.`;
  return null;
}

/**
 * Checks settings sent by the dashboard. `roles` maps a role's id to
 * whether Sparko can give it; `templates` are the server's Studio
 * templates. Returns the first problem, and where it is.
 */
export function bdIssue(
  input: unknown,
  {
    roles,
    templates,
  }: { roles?: Map<string, boolean>; templates?: Set<string> } = {},
): BdIssue | null {
  const x = input as Partial<Birthdays> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const at = (where: string, problem: string) => ({ at: where, problem });

  if (typeof x.channel !== 'string' || !snowflake.test(x.channel))
    return at('channel', 'Pick the channel birthdays are announced in.');
  if (!Number.isInteger(x.hour) || x.hour! < 0 || x.hour! > 23)
    return at('hour', 'Pick the hour Sparko celebrates at, from 0 to 23.');
  if (!zoneOk(x.timeZone))
    return at('timeZone', 'Pick the server’s time zone from the list.');
  if (x.zoneMode !== 'server' && x.zoneMode !== 'member') return missing;
  if (x.style !== 'together' && x.style !== 'each') return missing;
  for (const k of [
    'ping',
    'requireYear',
    'showAge',
    'hideLeft',
    'forgetLeavers',
    'dm',
    'monthly',
  ] as const)
    if (typeof x[k] !== 'boolean') return missing;

  if (typeof x.role !== 'string') return missing;
  if (x.role) {
    if (!snowflake.test(x.role)) return missing;
    if (roles && !roles.has(x.role))
      return at('role', 'The birthday role was deleted. Pick another one.');
    if (roles?.get(x.role) === false)
      return at(
        'role',
        'Sparko can’t give the birthday role. Move Sparko’s role above it, or pick another one.',
      );
  }
  if (!Array.isArray(x.staff)) return missing;
  if (x.staff.length > 25)
    return at('staff', 'Pick up to 25 roles for Who can manage birthdays.');
  for (const id of x.staff) {
    if (typeof id !== 'string' || !snowflake.test(id)) return missing;
    if (roles && !roles.has(id))
      return at(
        'staff',
        'A role in Who can manage birthdays was deleted. Pick another one.',
      );
  }

  const duration = (
    value: unknown,
    where: string,
    range: { min: number; max: number; label: string },
    what: string,
  ) => {
    if (typeof value !== 'string') return missing;
    if (!value.trim()) return null;
    const ms = parseDuration(value);
    if (ms === null)
      return at(where, `Write ${what} with h, d, w, mt or y, like 7d.`);
    if (ms < range.min || ms > range.max)
      return at(where, `${what} has to be between ${range.label}.`);
    return null;
  };
  const timeIssue =
    duration(
      x.minAccountAge,
      'minAccountAge',
      bdRanges.minAccountAge,
      'The account age',
    ) ??
    duration(
      x.minMemberAge,
      'minMemberAge',
      bdRanges.minMemberAge,
      'The time in the server',
    ) ??
    duration(
      x.changeCooldown,
      'changeCooldown',
      bdRanges.changeCooldown,
      'The time between changes',
    );
  if (timeIssue) return timeIssue;

  const m = x.messages;
  if (!m || typeof m !== 'object') return missing;
  for (const k of bdKinds) {
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
  for (const key of bdCommandKeys) {
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

/** Keeps only the known fields, so nothing else is stored. */
export function cleanBirthdays(c: Birthdays): Birthdays {
  const cmd = (k: BdCommandKey) => ({
    on: c.commands[k].on,
    name: c.commands[k].name,
    description: c.commands[k].description.trim(),
  });
  return {
    channel: c.channel,
    hour: c.hour,
    timeZone: c.timeZone,
    zoneMode: c.zoneMode,
    role: c.role,
    ping: c.ping,
    requireYear: c.requireYear,
    showAge: c.showAge,
    hideLeft: c.hideLeft,
    forgetLeavers: c.forgetLeavers,
    minAccountAge: c.minAccountAge.trim(),
    minMemberAge: c.minMemberAge.trim(),
    changeCooldown: c.changeCooldown.trim(),
    staff: [...new Set(c.staff)],
    style: c.style,
    dm: c.dm,
    monthly: c.monthly,
    messages: {
      single: c.messages.single,
      multiple: c.messages.multiple,
      monthly: c.messages.monthly,
      dm: c.messages.dm,
    },
    commands: {
      group: {
        name: c.commands.group.name,
        description: c.commands.group.description.trim(),
      },
      set: cmd('set'),
      remove: cmd('remove'),
      view: cmd('view'),
      upcoming: cmd('upcoming'),
      list: cmd('list'),
    },
  };
}

/**
 * Settings saved by an older version, with anything added since filled in
 * from the defaults.
 */
export function bdUpgrade(saved: Partial<Birthdays> | null | undefined) {
  const base = bdDefault();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    messages: { ...base.messages, ...saved.messages },
    commands: {
      ...base.commands,
      ...saved.commands,
      group: { ...base.commands.group, ...saved.commands?.group },
    },
  } as Birthdays;
}

// Who can do what -------------------------------------------------------------

/** What Sparko knows about a member saving their own birthday. */
export type BdMemberFacts = {
  /** When their Discord account was made. */
  created: number;
  /** When they joined the server, if known. */
  joined: number | null;
  /** When they last changed their date, if they saved one. */
  changedAt: number | null;
};

/** Why a member can't save their birthday right now, or null when they can. */
export function bdCanSet(c: Birthdays, f: BdMemberFacts, now: number) {
  const account = parseDuration(c.minAccountAge);
  if (account && now - f.created < account)
    return `Your Discord account has to be at least ${c.minAccountAge} old to save a birthday here.`;
  const member = parseDuration(c.minMemberAge);
  if (member && f.joined !== null && now - f.joined < member)
    return `You have to be in the server for ${c.minMemberAge} before you can save a birthday. Try again <t:${Math.ceil((f.joined + member) / 1000)}:R>.`;
  const cooldown = parseDuration(c.changeCooldown);
  if (cooldown && f.changedAt !== null && now - f.changedAt < cooldown)
    return `You can change your birthday again <t:${Math.ceil((f.changedAt + cooldown) / 1000)}:R>. Ask staff if it’s wrong.`;
  return null;
}

/** Whether someone can manage other members' birthdays. */
export const bdIsStaff = (
  c: Birthdays,
  member: Set<string>,
  manager: boolean,
) => manager || c.staff.some((r) => member.has(r));

// Messages --------------------------------------------------------------------

export const bdKindNames: Record<BdKind, string> = {
  single: 'Birthday',
  multiple: 'Several birthdays',
  monthly: 'This month',
  dm: 'DM',
};
export const bdKindAbout: Record<BdKind, string> = {
  single: 'Posted for one member’s birthday.',
  multiple:
    'Posted when several members have their birthday at the same time, listing them all.',
  monthly: 'Posted on the 1st with every birthday that month.',
  dm: 'Sent to each member in their DMs on their birthday.',
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

export type BdPreset = {
  id: string;
  kind: BdKind;
  name: string;
  about: string;
  message: StudioMessage;
};

/** Ready-made messages to start from; the first of each kind is Sparko's own. */
export const bdPresets: BdPreset[] = [
  {
    id: 'bd-single',
    kind: 'single',
    name: 'Birthday card',
    about: 'An embed with their picture and the date.',
    message: embedMessage('Birthday card', '{birthday.users}', {
      title: '🎂 Happy birthday, {user.name}!',
      description:
        'Everyone wish {birthday.users} a wonderful day. 🎉\nHave a great one from all of us at {server}!',
      thumbnail: '{user.avatar}',
      color: '#F472B6',
      footer: '{birthday.date}',
    }),
  },
  {
    id: 'bd-single-age',
    kind: 'single',
    name: 'With their age',
    about: 'Says how old they’re turning. Keep it for servers that show ages.',
    message: embedMessage('Birthday with age', '', {
      title: '🎈 {user.name} is {birthday.age} today!',
      description: 'Happy birthday, {birthday.users}! 🥳',
      thumbnail: '{user.avatar}',
      color: '#FACC15',
    }),
  },
  {
    id: 'bd-single-v2',
    kind: 'single',
    name: 'Modern card',
    about: 'A Components V2 card with their picture.',
    message: v2Message(
      'Modern birthday',
      '#F472B6',
      '## 🎂 Happy birthday!\nIt’s {birthday.users}’s birthday today. Send them some love! 💖\n{separator}\n-# {birthday.date} · {server}',
      '{user.avatar}',
    ),
  },
  {
    id: 'bd-multiple',
    kind: 'multiple',
    name: 'Birthday crowd',
    about: 'Everyone with a birthday today, in one embed.',
    message: embedMessage('Several birthdays', '{birthday.users}', {
      title: '🎉 {birthday.count} birthdays today!',
      description:
        'Happy birthday to {birthday.users}! 🎂\nHave an amazing day, all of you.',
      color: '#F472B6',
      footer: '{birthday.date}',
    }),
  },
  {
    id: 'bd-multiple-v2',
    kind: 'multiple',
    name: 'Modern crowd',
    about: 'A Components V2 card listing everyone.',
    message: v2Message(
      'Modern birthdays',
      '#A78BFA',
      '## 🎉 It’s a party!\n{birthday.count} members have their birthday today: {birthday.users}\n{separator}\n-# {birthday.date}',
    ),
  },
  {
    id: 'bd-monthly',
    kind: 'monthly',
    name: 'This month',
    about: 'Every birthday this month, one per line.',
    message: embedMessage('Birthdays this month', '', {
      title: '📅 Birthdays in {month}',
      description: '{birthday.list}',
      color: '#60A5FA',
      footer: '{birthday.count} this month · {server}',
    }),
  },
  {
    id: 'bd-monthly-v2',
    kind: 'monthly',
    name: 'Modern month',
    about: 'A Components V2 calendar card.',
    message: v2Message(
      'Modern month',
      '#60A5FA',
      '## 📅 {month} birthdays\n{birthday.list}\n{separator}\n-# Save yours with /birthday set',
    ),
  },
  {
    id: 'bd-dm',
    kind: 'dm',
    name: 'Birthday DM',
    about: 'A short, friendly note from the server.',
    message: embedMessage('Birthday DM', '', {
      title: '🎂 Happy birthday, {user.name}!',
      description:
        'Everyone at **{server}** hopes you have a brilliant day. 🎉',
      color: '#F472B6',
    }),
  },
];

/** Sparko's own message for a kind, used until the server picks one. */
export const bdDefaultMessage = (kind: BdKind) =>
  bdPresets.find((p) => p.kind === kind)!.message;

/** Someone being celebrated, as messages need them. */
export type BdCelebrant = {
  id: string;
  name: string;
  avatar: string;
  day: number;
  month: number;
  /** How old they turn, or null when it isn't shown. */
  age: number | null;
};

/** "<@1>, <@2> and <@3>". */
export const mentionList = (ids: string[]) =>
  ids.length < 2
    ? ids.map((id) => `<@${id}>`).join('')
    : `${ids
        .slice(0, -1)
        .map((id) => `<@${id}>`)
        .join(', ')} and <@${ids.at(-1)!}>`;

type Payload = Record<string, unknown>;
const withMentions = (p: Payload, ping: boolean, ids: string[]): Payload => ({
  ...p,
  allowed_mentions: ping
    ? { parse: [], users: ids.slice(0, 100) }
    : { parse: [] },
});

/**
 * The birthday post (or DM) for one or more members, from a template.
 * Mentions ping only the members it's for, and only when pinging is on.
 */
export function bdPayload(
  message: StudioMessage,
  people: BdCelebrant[],
  ctx: {
    now: number;
    ping: boolean;
    date: { day: number; month: number };
  } & StudioVars,
) {
  const one = people.length === 1 ? people[0]! : null;
  const extra: Record<string, string> = {
    'birthday.users': mentionList(people.map((p) => p.id)),
    'birthday.count': String(people.length),
    'birthday.age': one?.age != null ? String(one.age) : '',
    'birthday.date': one
      ? bdDateText(one.day, one.month)
      : bdDateText(ctx.date.day, ctx.date.month),
  };
  const body = studioPayload(message, {
    ...ctx,
    user: one ? { id: one.id, name: one.name, avatar: one.avatar } : ctx.user,
    extra: { ...ctx.extra, ...extra },
  }) as Payload;
  return withMentions(
    body,
    ctx.ping,
    people.map((p) => p.id),
  );
}

/** The "Birthdays this month" post. It never pings. */
export function bdMonthlyPayload(
  message: StudioMessage,
  people: { id: string; day: number; month: number }[],
  ctx: { now: number; month: number } & StudioVars,
) {
  const sorted = [...people].sort((a, b) => a.day - b.day);
  const body = studioPayload(message, {
    ...ctx,
    extra: {
      ...ctx.extra,
      month: bdMonths[ctx.month - 1] ?? '',
      'birthday.list': sorted
        .map((p) => `<@${p.id}> — ${bdDateText(p.day, p.month)}`)
        .join('\n'),
      'birthday.count': String(sorted.length),
    },
  }) as Payload;
  return withMentions(body, false, []);
}

// Commands --------------------------------------------------------------------

/** The /birthday command and its subcommands, as Discord registers them. */
export function bdCommandBodies(c: Birthdays) {
  const member = (description: string) => ({
    type: 6,
    name: 'member',
    description,
    required: false,
  });
  const months = bdMonths.map((name, i) => ({ name, value: i + 1 }));
  const body: Record<BdCommandKey, object[]> = {
    set: [
      {
        type: 4,
        name: 'day',
        description: 'The day of the month, 1 to 31',
        required: true,
        min_value: 1,
        max_value: 31,
      },
      {
        type: 4,
        name: 'month',
        description: 'The month',
        required: true,
        choices: months,
      },
      {
        type: 4,
        name: 'year',
        description: c.requireYear
          ? 'The year you were born (this server asks for it)'
          : 'The year you were born (optional, never shown)',
        required: c.requireYear,
        min_value: 1900,
        max_value: 2100,
      },
      {
        type: 3,
        name: 'timezone',
        description: 'Your time zone, like Europe/London',
        required: false,
        autocomplete: true,
      },
      member('Staff: set someone else’s birthday'),
    ],
    remove: [member('Staff: remove someone else’s birthday')],
    view: [member('Whose birthday to see (you if left empty)')],
    upcoming: [],
    list: [
      {
        type: 4,
        name: 'month',
        description: 'Which month',
        required: true,
        choices: months,
      },
    ],
  };
  // Discord wants required options first.
  const ordered = (options: object[]) =>
    [...options].sort(
      (a, b) =>
        Number(!!(b as { required?: boolean }).required) -
        Number(!!(a as { required?: boolean }).required),
    );
  const subs = bdCommandKeys
    .filter((k) => c.commands[k].on)
    .map((k) => ({
      type: 1,
      name: c.commands[k].name,
      description: c.commands[k].description,
      options: ordered(body[k]),
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

/** Which birthday subcommand a typed command is, in this server. */
export const bdCommandFor = (c: Birthdays, name: string, sub: string | null) =>
  name === c.commands.group.name
    ? bdCommandKeys.find((k) => c.commands[k].on && c.commands[k].name === sub)
    : undefined;

// Logs ------------------------------------------------------------------------

export type BdLogAction =
  | 'set'
  | 'changed'
  | 'removed'
  | 'celebrated'
  | 'role-given'
  | 'role-removed'
  | 'monthly'
  | 'failed';
export type BdLogEntry = {
  id: string;
  action: BdLogAction;
  userId: string;
  userName: string;
  detail: string;
  at: number;
};

/** One log line, like "[SET] @rhea saved 14 March". */
export function bdLogLine(e: BdLogEntry) {
  const who = `@${e.userName}`;
  const more = e.detail ? `: ${e.detail}` : '';
  switch (e.action) {
    case 'set':
      return `[SET] ${who} saved a birthday${more}`;
    case 'changed':
      return `[CHANGED] ${who}’s birthday changed${more}`;
    case 'removed':
      return `[REMOVED] ${who}’s birthday was removed${more}`;
    case 'celebrated':
      return `[CELEBRATED] Sparko celebrated ${who}’s birthday${more}`;
    case 'role-given':
      return `[ROLE GIVEN] ${who} got the birthday role for the day`;
    case 'role-removed':
      return `[ROLE REMOVED] ${who}’s birthday role was taken back`;
    case 'monthly':
      return `[MONTHLY] Sparko posted this month’s birthdays${more}`;
    default:
      return `[FAILED] ${who}${more}`;
  }
}
