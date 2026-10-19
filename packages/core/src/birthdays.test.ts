import { describe, expect, it } from 'vitest';
import {
  bdCanSet,
  bdCommandBodies,
  bdCommandFor,
  bdDateProblem,
  bdDefault,
  bdDue,
  bdIssue,
  bdLogLine,
  bdMonthlyDue,
  bdMonthlyPayload,
  bdNext,
  bdPayload,
  bdPresets,
  bdUpcoming,
  bdUpgrade,
  celebratedOn,
  cleanBirthdays,
  daysIn,
  localNow,
  mentionList,
  searchZones,
  zoneOffset,
  zoneOk,
  type BdEntry,
  type Birthdays,
} from './birthdays.ts';
import { studioVariables } from './studio-format.ts';

const D = 86_400_000;
const at = (iso: string) => Date.parse(iso);
const entry = (patch: Partial<BdEntry> = {}): BdEntry => ({
  userId: '500',
  name: 'ayo',
  avatar: '',
  day: 14,
  month: 3,
  year: null,
  timeZone: '',
  setById: '500',
  setByName: 'ayo',
  inServer: true,
  celebratedYear: null,
  roleUntil: null,
  changedAt: 0,
  updatedAt: 0,
  ...patch,
});
const config = (patch: Partial<Birthdays> = {}): Birthdays => ({
  ...bdDefault('100'),
  ...patch,
});

describe('dates', () => {
  it('knows month lengths and leap years', () => {
    expect(daysIn(2, 2024)).toBe(29);
    expect(daysIn(2, 2023)).toBe(28);
    expect(daysIn(2, 1900)).toBe(28);
    expect(daysIn(2, 2000)).toBe(29);
    // Without a year, 29 February can be saved.
    expect(daysIn(2, null)).toBe(29);
    expect(daysIn(4)).toBe(30);
    expect(daysIn(12)).toBe(31);
  });

  it('celebrates 29 February on the 28th in other years', () => {
    expect(celebratedOn(2, 29, 2025)).toEqual({ month: 2, day: 28 });
    expect(celebratedOn(2, 29, 2028)).toEqual({ month: 2, day: 29 });
    expect(celebratedOn(3, 1, 2025)).toEqual({ month: 3, day: 1 });
  });

  it('checks dates people type', () => {
    const now = at('2026-06-01T00:00:00Z');
    const c = config();
    expect(bdDateProblem(c, { day: 14, month: 3, year: null }, now)).toBeNull();
    expect(bdDateProblem(c, { day: 31, month: 4, year: null }, now)).toMatch(
      /April has 30 days/,
    );
    expect(bdDateProblem(c, { day: 29, month: 2, year: null }, now)).toBeNull();
    expect(bdDateProblem(c, { day: 29, month: 2, year: 2001 }, now)).toMatch(
      /2001 wasn’t a leap year/,
    );
    expect(bdDateProblem(c, { day: 29, month: 2, year: 2000 }, now)).toBeNull();
    expect(bdDateProblem(c, { day: 1, month: 13, year: null }, now)).toMatch(
      /month/,
    );
    // Too young for Discord, or a typo.
    expect(bdDateProblem(c, { day: 1, month: 1, year: 2020 }, now)).toMatch(
      /from 1906 to 2013/,
    );
    expect(bdDateProblem(c, { day: 1, month: 1, year: 1850 }, now)).toMatch(
      /year/,
    );
    expect(
      bdDateProblem(
        config({ requireYear: true }),
        { day: 1, month: 1, year: null },
        now,
      ),
    ).toMatch(/year you were born too/);
  });
});

describe('time zones', () => {
  it('tells real zones from made-up ones', () => {
    expect(zoneOk('Europe/London')).toBe(true);
    expect(zoneOk('UTC')).toBe(true);
    expect(zoneOk('Mars/Olympus')).toBe(false);
    expect(zoneOk('')).toBe(false);
    expect(zoneOk(5)).toBe(false);
  });

  it('reads the local date and hour, across the date line', () => {
    const now = at('2026-03-13T23:30:00Z');
    expect(localNow(now, 'UTC')).toEqual({
      year: 2026,
      month: 3,
      day: 13,
      hour: 23,
    });
    // Already the 14th in Tokyo, still the 13th in Los Angeles.
    expect(localNow(now, 'Asia/Tokyo')).toMatchObject({ day: 14, hour: 8 });
    expect(localNow(now, 'America/Los_Angeles')).toMatchObject({
      day: 13,
      hour: 16,
    });
    // New Year's Eve in UTC is New Year's Day in Kiritimati.
    expect(
      localNow(at('2026-12-31T12:00:00Z'), 'Pacific/Kiritimati'),
    ).toMatchObject({ year: 2027, month: 1, day: 1, hour: 2 });
  });

  it('writes offsets and finds zones by city', () => {
    expect(zoneOffset('UTC')).toBe('UTC+00:00');
    expect(zoneOffset('Asia/Kolkata')).toBe('UTC+05:30');
    expect(searchZones('london')).toContain('Europe/London');
    expect(searchZones('new york')[0]).toBe('America/New_York');
    expect(searchZones('')[0]).toBe('UTC');
    expect(searchZones('a', 5)).toHaveLength(5);
  });
});

describe('who is due', () => {
  it('celebrates at the hour, in the server’s time zone', () => {
    const c = config({ hour: 9, timeZone: 'Europe/London' });
    const b = entry({ day: 14, month: 7 });
    // 8:00 in London (BST) is too early; 9:00 is the time.
    expect(bdDue(c, b, at('2026-07-14T07:00:00Z'))).toBeNull();
    expect(bdDue(c, b, at('2026-07-14T08:00:00Z'))).toEqual({ year: 2026 });
    // Later the same day still counts, if Sparko was offline at nine.
    expect(bdDue(c, b, at('2026-07-14T22:30:00Z'))).toEqual({ year: 2026 });
    // Past midnight in London, the day is over.
    expect(bdDue(c, b, at('2026-07-14T23:30:00Z'))).toBeNull();
  });

  it('never celebrates twice in a year, or someone who left', () => {
    const c = config({ hour: 0 });
    const now = at('2026-03-14T12:00:00Z');
    expect(bdDue(c, entry({ celebratedYear: 2026 }), now)).toBeNull();
    expect(bdDue(c, entry({ celebratedYear: 2025 }), now)).toEqual({
      year: 2026,
    });
    expect(bdDue(c, entry({ inServer: false }), now)).toBeNull();
  });

  it('uses each member’s own time zone when set to', () => {
    const now = at('2026-03-13T23:30:00Z');
    const tokyo = entry({ timeZone: 'Asia/Tokyo' });
    // It's 8:30 on the 14th in Tokyo.
    expect(bdDue(config({ hour: 8 }), tokyo, now)).toBeNull();
    expect(bdDue(config({ hour: 8, zoneMode: 'member' }), tokyo, now)).toEqual({
      year: 2026,
    });
    // Members without a time zone use the server's.
    expect(
      bdDue(config({ hour: 8, zoneMode: 'member' }), entry(), now),
    ).toBeNull();
  });

  it('celebrates 29 February on the 28th in a common year, and only then', () => {
    const c = config({ hour: 0 });
    const leapling = entry({ day: 29, month: 2 });
    expect(bdDue(c, leapling, at('2026-02-28T10:00:00Z'))).toEqual({
      year: 2026,
    });
    expect(bdDue(c, leapling, at('2026-03-01T10:00:00Z'))).toBeNull();
    expect(bdDue(c, leapling, at('2028-02-28T10:00:00Z'))).toBeNull();
    expect(bdDue(c, leapling, at('2028-02-29T10:00:00Z'))).toEqual({
      year: 2028,
    });
  });

  it('posts the monthly list on the 1st at the hour, once a month', () => {
    const c = config({ monthly: true, hour: 9, timeZone: 'Asia/Tokyo' });
    // 9:00 on 1 April in Tokyo is 00:00 UTC.
    expect(bdMonthlyDue(c, '', at('2026-03-31T23:00:00Z'))).toBeNull();
    expect(bdMonthlyDue(c, '', at('2026-04-01T00:00:00Z'))).toEqual({
      key: '2026-04',
      month: 4,
      year: 2026,
    });
    expect(bdMonthlyDue(c, '2026-04', at('2026-04-01T01:00:00Z'))).toBeNull();
    expect(bdMonthlyDue(c, '', at('2026-04-02T01:00:00Z'))).toBeNull();
    expect(
      bdMonthlyDue({ ...c, monthly: false }, '', at('2026-04-01T01:00:00Z')),
    ).toBeNull();
  });
});

describe('upcoming birthdays', () => {
  it('counts the days to the next one, today first', () => {
    const now = at('2026-03-14T12:00:00Z');
    expect(bdNext({ day: 14, month: 3 }, now, 'UTC')).toMatchObject({
      days: 0,
      year: 2026,
    });
    expect(bdNext({ day: 13, month: 3 }, now, 'UTC')).toMatchObject({
      days: 364,
      year: 2027,
    });
    // The next 29 February from 2026 is the 28th of 2027.
    expect(bdNext({ day: 29, month: 2 }, now, 'UTC')).toMatchObject({
      year: 2027,
      month: 2,
      day: 28,
    });
  });

  it('lists the soonest, with ages only when shown, without leavers', () => {
    const now = at('2026-03-10T12:00:00Z');
    const list = [
      entry({ userId: '1', name: 'late', day: 1, month: 12 }),
      entry({ userId: '2', name: 'soon', day: 12, month: 3, year: 2000 }),
      entry({ userId: '3', name: 'gone', day: 11, month: 3, inServer: false }),
    ];
    const shown = bdUpcoming(config(), list, now);
    expect(shown.map((b) => b.name)).toEqual(['soon', 'late']);
    expect(shown[0]).toMatchObject({ age: 26, next: { days: 2 } });
    expect(bdUpcoming(config({ showAge: false }), list, now)[0]!.age).toBe(
      null,
    );
    expect(
      bdUpcoming(config({ hideLeft: false }), list, now).map((b) => b.name),
    ).toEqual(['gone', 'soon', 'late']);
  });
});

describe('settings', () => {
  const roles = new Map([
    ['301', true],
    ['302', false],
  ]);

  it('accepts the defaults with a channel, and needs one', () => {
    expect(bdIssue(bdDefault('100'))).toBeNull();
    expect(bdIssue(bdDefault())?.at).toBe('channel');
    expect(bdIssue(null)?.problem).toBe('Some settings are missing.');
  });

  it('checks the hour, the zone, the role and the times', () => {
    expect(bdIssue(config({ hour: 24 }))?.at).toBe('hour');
    expect(bdIssue(config({ timeZone: 'Nowhere/Land' }))?.at).toBe('timeZone');
    expect(bdIssue(config({ role: '999' }), { roles })?.problem).toMatch(
      /was deleted/,
    );
    expect(bdIssue(config({ role: '302' }), { roles })?.problem).toMatch(
      /can’t give/,
    );
    expect(bdIssue(config({ role: '301' }), { roles })).toBeNull();
    expect(bdIssue(config({ staff: ['999'] }), { roles })?.at).toBe('staff');
    expect(bdIssue(config({ changeCooldown: '2y' }))?.problem).toBe(
      'The time between changes has to be between 1d and 1y.',
    );
    expect(bdIssue(config({ minAccountAge: 'soon' }))?.at).toBe(
      'minAccountAge',
    );
    expect(bdIssue(config({ minMemberAge: '30mi' }))?.at).toBe('minMemberAge');
    expect(bdIssue(config({ minMemberAge: '2h' }))).toBeNull();
  });

  it('checks templates and command names', () => {
    const c = config();
    c.messages.dm = '7';
    expect(bdIssue(c, { templates: new Set(['1']) })?.at).toBe('message:dm');
    expect(bdIssue(c, { templates: new Set(['7']) })).toBeNull();
    const named = config();
    named.commands.view.name = 'set';
    expect(bdIssue(named)?.problem).toBe(
      'Two commands are called /birthday set.',
    );
    named.commands.view.name = 'Look!';
    expect(bdIssue(named)?.at).toBe('command:view');
    const group = config();
    group.commands.group.name = 'bday';
    group.commands.group.description = ' ';
    expect(bdIssue(group)?.at).toBe('command:group');
  });

  it('keeps only known fields, and fills in new ones', () => {
    const dirty = {
      ...config({ staff: ['1', '1'], minAccountAge: ' 7d ' }),
      extra: true,
    } as Birthdays;
    const clean = cleanBirthdays(dirty);
    expect(clean).not.toHaveProperty('extra');
    expect(clean.staff).toEqual(['1']);
    expect(clean.minAccountAge).toBe('7d');
    const old = bdUpgrade({
      channel: '5',
      commands: { group: { name: 'bday' } },
    } as unknown as Partial<Birthdays>);
    expect(old.channel).toBe('5');
    expect(old.commands.group).toEqual({
      name: 'bday',
      description: 'Birthdays in this server',
    });
    expect(old.commands.set.name).toBe('set');
    expect(old.messages.monthly).toBe('');
  });
});

describe('who can set', () => {
  const now = 400 * D;
  it('checks the account age, time in the server and changes', () => {
    const c = config({
      minAccountAge: '30d',
      minMemberAge: '1d',
      changeCooldown: '30d',
    });
    const ok = { created: 0, joined: 0, changedAt: null };
    expect(bdCanSet(c, ok, now)).toBeNull();
    expect(bdCanSet(c, { ...ok, created: now - D }, now)).toMatch(
      /at least 30d old/,
    );
    expect(bdCanSet(c, { ...ok, joined: now - 3_600_000 }, now)).toMatch(
      /in the server for 1d/,
    );
    expect(bdCanSet(c, { ...ok, changedAt: now - 10 * D }, now)).toMatch(
      /change your birthday again <t:\d+:R>/,
    );
    expect(bdCanSet(c, { ...ok, changedAt: now - 31 * D }, now)).toBeNull();
  });
});

describe('messages', () => {
  const now = at('2026-03-14T09:00:00Z');
  const people = [
    { id: '1', name: 'rhea', avatar: '', day: 14, month: 3, age: 26 },
    { id: '2', name: 'ayo', avatar: '', day: 14, month: 3, age: null },
  ];
  const single = bdPresets.find((p) => p.id === 'bd-single-age')!.message;
  const several = bdPresets.find((p) => p.kind === 'multiple')!.message;

  it('lists mentions like people write them', () => {
    expect(mentionList(['1'])).toBe('<@1>');
    expect(mentionList(['1', '2'])).toBe('<@1> and <@2>');
    expect(mentionList(['1', '2', '3'])).toBe('<@1>, <@2> and <@3>');
  });

  it('fills the birthday variables, and pings only who it’s for', () => {
    const one = bdPayload(single, [people[0]!], {
      now,
      ping: true,
      date: { day: 14, month: 3 },
    }) as { embeds: { title: string }[]; allowed_mentions: unknown };
    expect(one.embeds[0]!.title).toBe('🎈 rhea is 26 today!');
    expect(one.allowed_mentions).toEqual({ parse: [], users: ['1'] });
    const quiet = bdPayload(single, [people[0]!], {
      now,
      ping: false,
      date: { day: 14, month: 3 },
    });
    expect(quiet.allowed_mentions).toEqual({ parse: [] });
    const many = bdPayload(several, people, {
      now,
      ping: true,
      date: { day: 14, month: 3 },
    }) as {
      content: string;
      embeds: { title: string; footer: { text: string } }[];
    };
    expect(many.content).toBe('<@1> and <@2>');
    expect(many.embeds[0]!.title).toBe('🎉 2 birthdays today!');
    expect(many.embeds[0]!.footer.text).toBe('14 March');
  });

  it('lists the month in order, without pinging', () => {
    const m = bdPresets.find((p) => p.kind === 'monthly')!.message;
    const body = bdMonthlyPayload(
      m,
      [
        { id: '2', day: 20, month: 4 },
        { id: '1', day: 3, month: 4 },
      ],
      { now, month: 4 },
    ) as {
      embeds: { title: string; description: string }[];
      allowed_mentions: unknown;
    };
    expect(body.embeds[0]!.title).toBe('📅 Birthdays in April');
    expect(body.embeds[0]!.description).toBe('<@1> — 3 April\n<@2> — 20 April');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('has a preset of every kind, and its variables in the list', () => {
    for (const kind of ['single', 'multiple', 'monthly', 'dm'])
      expect(bdPresets.some((p) => p.kind === kind)).toBe(true);
    const names = studioVariables.filter((v) => v.birthday).map((v) => v.name);
    expect(names).toEqual([
      'birthday.users',
      'birthday.count',
      'birthday.age',
      'birthday.date',
      'month',
      'birthday.list',
    ]);
  });
});

describe('commands', () => {
  it('registers /birthday with the subcommands that are on', () => {
    const c = config();
    c.commands.list.on = false;
    c.commands.set.name = 'save';
    const [cmd] = bdCommandBodies(c) as {
      name: string;
      options: {
        name: string;
        options: { name: string; required: boolean }[];
      }[];
    }[];
    expect(cmd!.name).toBe('birthday');
    expect(cmd!.options.map((o) => o.name)).toEqual([
      'save',
      'remove',
      'view',
      'upcoming',
    ]);
    // Required options come first, as Discord wants.
    expect(cmd!.options[0]!.options.map((o) => o.required)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(bdCommandFor(c, 'birthday', 'save')).toBe('set');
    expect(bdCommandFor(c, 'birthday', 'list')).toBeUndefined();
    expect(bdCommandFor(c, 'suggest', 'save')).toBeUndefined();
    for (const k of ['set', 'remove', 'view', 'upcoming'] as const)
      c.commands[k].on = false;
    expect(bdCommandBodies(c)).toEqual([]);
  });

  it('asks for the year when the server needs it', () => {
    const [cmd] = bdCommandBodies(config({ requireYear: true })) as {
      options: { options: { name: string; required: boolean }[] }[];
    }[];
    expect(
      cmd!.options[0]!.options.find((o) => o.name === 'year')!.required,
    ).toBe(true);
  });
});

describe('logs', () => {
  it('writes each action as a line', () => {
    const e = {
      id: '1',
      userId: '1',
      userName: 'rhea',
      detail: '14 March',
      at: 0,
    };
    expect(bdLogLine({ ...e, action: 'set' })).toBe(
      '[SET] @rhea saved a birthday: 14 March',
    );
    expect(bdLogLine({ ...e, action: 'role-given', detail: '' })).toBe(
      '[ROLE GIVEN] @rhea got the birthday role for the day',
    );
    expect(bdLogLine({ ...e, action: 'monthly', detail: '3 in March' })).toBe(
      '[MONTHLY] Sparko posted this month’s birthdays: 3 in March',
    );
  });
});
