import { describe, expect, it } from 'vitest';
import {
  calendarUrl,
  cleanDetails,
  evAnswerFor,
  evBlank,
  evButtons,
  evCommandBodies,
  evCommandFor,
  evDefault,
  evDefaultMessage,
  evDiscordEvent,
  evEventIssue,
  evIssue,
  evLimits,
  evLogLine,
  evMessageIssue,
  evNextStart,
  evPayload,
  evStartPayload,
  evUpgrade,
  evVariables,
  evWhenText,
  evWhere,
  fromLocalInput,
  goingList,
  parseEnd,
  parseEvId,
  parseWhen,
  toLocalInput,
  zonedTime,
  type EvDetails,
  type EvEvent,
  type Events,
} from './events.ts';
import { studioDefault } from './studio-format.ts';

const at = (iso: string) => Date.parse(iso);
const LONDON = 'Europe/London';
// Monday 19 October 2026, 13:00 in London (summer time).
const now = at('2026-10-19T12:00:00Z');

describe('reading when an event is', () => {
  const when = (text: string, zone = LONDON) => {
    const t = parseWhen(text, zone, now);
    return t === null ? null : new Date(t).toISOString();
  };

  it('reads dates and times the way people write them', () => {
    expect(when('2026-10-20 19:00')).toBe('2026-10-20T18:00:00.000Z');
    expect(when('2026-10-20T19:00')).toBe('2026-10-20T18:00:00.000Z');
    expect(when('20 Oct 7pm')).toBe('2026-10-20T18:00:00.000Z');
    expect(when('20th October 2026 at 7:30 pm')).toBe(
      '2026-10-20T18:30:00.000Z',
    );
    expect(when('Oct 20, 2026 19:30')).toBe('2026-10-20T18:30:00.000Z');
    expect(when('tomorrow 18:00')).toBe('2026-10-20T17:00:00.000Z');
    expect(when('friday 8pm')).toBe('2026-10-23T19:00:00.000Z');
    expect(when('in 2h')).toBe('2026-10-19T14:00:00.000Z');
    expect(when('in 3 days')).toBe('2026-10-22T12:00:00.000Z');
    expect(when('2026-10-20 19:00', 'America/New_York')).toBe(
      '2026-10-20T23:00:00.000Z',
    );
  });

  it('picks the next one when only a time or a weekday is given', () => {
    expect(when('19:00')).toBe('2026-10-19T18:00:00.000Z');
    // 11:00 has gone today, so it's tomorrow's.
    expect(when('11:00')).toBe('2026-10-20T10:00:00.000Z');
    expect(when('midnight')).toBe('2026-10-19T23:00:00.000Z');
    // Monday 9am has gone, so next Monday, after the clocks change.
    expect(when('monday 9am')).toBe('2026-10-26T09:00:00.000Z');
    // 1 January has gone this year.
    expect(when('1 jan 12:00')).toBe('2027-01-01T12:00:00.000Z');
    expect(when('Nov 1 10:00')).toBe('2026-11-01T10:00:00.000Z');
  });

  it('reads day/month only when it can’t be the other way round', () => {
    expect(when('20/10 19:00')).toBe('2026-10-20T18:00:00.000Z');
    expect(when('10/20 7pm')).toBe('2026-10-20T18:00:00.000Z');
    expect(when('5/6 19:00')).toBeNull();
  });

  it('refuses what it can’t read, or a day without a time', () => {
    for (const text of [
      '',
      '2026-10-20',
      'next week',
      '25:00',
      '13pm',
      '31 feb 10:00',
      'soon',
      '20 19',
    ])
      expect(when(text)).toBeNull();
  });

  it('reads how long an event lasts, or when it ends', () => {
    const start = at('2026-10-20T18:00:00Z');
    const end = (text: string) => {
      const t = parseEnd(text, start, LONDON);
      return t === null ? null : (t - start) / 60_000;
    };
    expect(end('')).toBe(60);
    expect(end('2h')).toBe(120);
    expect(end('90 minutes')).toBe(90);
    expect(end('1h 30m')).toBe(90);
    expect(end('1.5h')).toBe(90);
    expect(end('2 hours')).toBe(120);
    expect(end('21:00')).toBe(120);
    // Earlier than the start means the next day.
    expect(end('02:00')).toBe(7 * 60);
    expect(end('whenever')).toBeNull();
  });

  it('turns local times into moments across summer time', () => {
    const p = { year: 2026, month: 10, day: 25, hour: 12, minute: 0 };
    expect(new Date(zonedTime(p, LONDON)).toISOString()).toBe(
      '2026-10-25T12:00:00.000Z',
    );
    expect(new Date(zonedTime({ ...p, day: 24 }, LONDON)).toISOString()).toBe(
      '2026-10-24T11:00:00.000Z',
    );
    const t = at('2026-10-20T18:00:00Z');
    expect(toLocalInput(t, LONDON)).toBe('2026-10-20T19:00');
    expect(fromLocalInput('2026-10-20T19:00', LONDON)).toBe(t);
    expect(fromLocalInput('nope', LONDON)).toBeNull();
    expect(evWhenText(t, t + 2 * 3_600_000, LONDON)).toBe(
      'Tue 20 Oct, 19:00 – 21:00',
    );
    expect(evWhenText(t, t + 26 * 3_600_000, LONDON)).toBe(
      'Tue 20 Oct, 19:00 – Wed 21 Oct, 21:00',
    );
  });

  it('repeats at the same local time, and keeps month ends', () => {
    const t = at('2026-10-20T18:00:00Z');
    expect(evNextStart(t, 'none', LONDON)).toBeNull();
    expect(new Date(evNextStart(t, 'daily', LONDON)!).toISOString()).toBe(
      '2026-10-21T18:00:00.000Z',
    );
    // 19:00 in summer time, then 19:00 in winter time.
    expect(new Date(evNextStart(t, 'weekly', LONDON)!).toISOString()).toBe(
      '2026-10-27T19:00:00.000Z',
    );
    expect(new Date(evNextStart(t, 'biweekly', LONDON)!).toISOString()).toBe(
      '2026-11-03T19:00:00.000Z',
    );
    expect(
      new Date(
        evNextStart(at('2026-01-31T10:00:00Z'), 'monthly', 'UTC')!,
      ).toISOString(),
    ).toBe('2026-02-28T10:00:00.000Z');
    expect(
      new Date(
        evNextStart(at('2026-12-15T10:00:00Z'), 'monthly', 'UTC')!,
      ).toISOString(),
    ).toBe('2027-01-15T10:00:00.000Z');
  });
});

const details = (patch: Partial<EvDetails> = {}): EvDetails => ({
  ...evBlank(evDefault('100'), now),
  title: 'Movie night',
  start: at('2026-10-20T18:00:00Z'),
  end: at('2026-10-20T20:00:00Z'),
  timeZone: LONDON,
  ...patch,
});
const event = (patch: Partial<EvEvent> = {}): EvEvent => ({
  ...details(),
  number: 3,
  status: 'scheduled',
  hostId: '42',
  hostName: 'quinn',
  channelId: '100',
  messageId: '700',
  discordEventId: null,
  reminded: [],
  startPinged: false,
  series: null,
  counts: { going: 2, maybe: 1, no: 0, waitlist: 0 },
  createdAt: now,
  updatedAt: now,
  ...patch,
});

describe('checking settings', () => {
  const ok = { ...evDefault('100'), timeZone: LONDON };
  const issue = (patch: Partial<Events>, extra = {}) =>
    evIssue({ ...ok, ...patch }, extra)?.problem ?? null;

  it('takes the defaults with a channel', () => {
    expect(evIssue(ok)).toBeNull();
    expect(evIssue(null)?.problem).toBe('Some settings are missing.');
    expect(issue({ channel: '' })).toBe(
      'Pick the channel events are announced in.',
    );
    expect(issue({ timeZone: 'Mars/Base' })).toMatch(/time zone/);
  });

  it('keeps reminders within the plan', () => {
    expect(issue({ reminders: ['1d', '1h', '10m'] })).toBe(
      'Your plan has up to 2 reminders for each event.',
    );
    expect(issue({ reminders: ['1d', '1h', '10m'] }, { plan: 'plus' })).toBe(
      null,
    );
    expect(issue({ reminders: ['soon'] })).toMatch(/“soon” isn’t one/);
    expect(issue({ reminders: ['60d'] })).toMatch(/between 1m and 30d/);
    expect(issue({ reminders: ['1h', '60m'] })).toMatch(/same time/);
    expect(evLimits('plus')).toEqual({ upcoming: 100, reminders: 5 });
    expect(evLimits(null)).toEqual({ upcoming: 5, reminders: 2 });
  });

  it('checks the attending role and the answers', () => {
    expect(issue({ attending: true })).toMatch(/Pick the role Going/);
    const roles = new Map([
      ['301', true],
      ['302', false],
    ]);
    expect(issue({ attending: true, attendingRole: '302' }, { roles })).toMatch(
      /Sparko can’t give the attending role/,
    );
    expect(issue({ attending: true, attendingRole: '303' }, { roles })).toMatch(
      /was deleted/,
    );
    expect(issue({ attending: true, attendingRole: '301' }, { roles })).toBe(
      null,
    );
    const options = evDefault().options;
    expect(
      issue({
        options: { ...options, going: { ...options.going, on: false } },
      }),
    ).toBe('Going is always offered.');
    expect(
      issue({
        options: { ...options, maybe: { ...options.maybe, label: ' ' } },
      }),
    ).toBe('Give the Maybe button a name.');
    expect(issue({ listSize: 0 })).toMatch(/from 1 to 50 names/);
  });

  it('checks templates and command names', () => {
    expect(
      issue(
        { messages: { ...ok.messages, reminder: 't9' } },
        { templates: new Set(['t1']) },
      ),
    ).toBe('The reminder DM template was deleted. Pick or make another one.');
    const commands = evDefault().commands;
    expect(
      issue({
        commands: { ...commands, list: { ...commands.list, name: 'create' } },
      }),
    ).toBe('Two commands are called /event create.');
    expect(
      issue({
        commands: { ...commands, group: { ...commands.group, name: 'Event!' } },
      }),
    ).toMatch(/Command names are 1 to 32/);
  });

  it('fills in settings added since they were saved', () => {
    const old = { channel: '5', dms: { reminder: false } } as never;
    const c = evUpgrade(old);
    expect(c.channel).toBe('5');
    expect(c.dms).toEqual({ reminder: false, cancelled: true, waitlist: true });
    expect(c.commands.remind.name).toBe('remind');
    expect(evUpgrade(null)).toEqual(evDefault());
  });
});

describe('checking an event', () => {
  const issue = (patch: Partial<EvDetails>, extra = {}) =>
    evEventIssue(details(patch), { now, ...extra })?.problem ?? null;

  it('needs a title, a future start and a sensible length', () => {
    expect(issue({})).toBeNull();
    expect(issue({ title: ' ' })).toBe('Give the event a title.');
    expect(issue({ title: 'x'.repeat(101) })).toMatch(/up to 100/);
    expect(issue({ start: now - 3_600_000 })).toBe(
      'The start has to be in the future.',
    );
    expect(issue({ end: at('2026-10-20T17:00:00Z') })).toMatch(
      /between 5 minutes and 14 days/,
    );
    expect(issue({ start: now + 3 * 365 * 86_400_000 })).toMatch(/2 years/);
    expect(issue({ image: 'http://x.png' })).toMatch(/https/);
  });

  it('checks capacity, roles, reminders and posting time', () => {
    expect(issue({ capacity: -1 })).toMatch(/capacity/);
    expect(issue({ capacity: 2.5 })).toMatch(/capacity/);
    expect(issue({ roles: ['9'] }, { roles: new Set(['1']) })).toMatch(
      /Who can answer was deleted/,
    );
    expect(issue({ pingRole: '9' }, { roles: new Set(['1']) })).toMatch(
      /role to ping was deleted/,
    );
    expect(issue({ reminders: ['1d', '1h', '10m'] })).toMatch(/up to 2/);
    expect(issue({ reminders: ['1d', '1h', '10m'] }, { plan: 'plus' })).toBe(
      null,
    );
    expect(issue({ postAt: at('2026-10-21T00:00:00Z') })).toBe(
      'Post the event before it starts.',
    );
    expect(issue({ postAt: now + 60_000 })).toBeNull();
    expect(
      issue(
        { place: { id: '55', name: 'Stage', stage: true } },
        {
          places: new Set(['56']),
        },
      ),
    ).toMatch(/voice channel was deleted/);
  });

  it('keeps a started event’s start', () => {
    const editing = event({ status: 'started', start: now - 60_000 });
    expect(
      evEventIssue(details({ start: now - 60_000, end: now + 3_600_000 }), {
        now,
        editing,
      }),
    ).toBeNull();
    expect(
      evEventIssue(details({ start: now + 60_000 }), { now, editing })?.problem,
    ).toBe('The event has started, so its start can’t change.');
  });

  it('cleans what’s stored', () => {
    const d = cleanDetails({
      ...details({ title: '  Movie  ', roles: ['1', '1'] }),
      extra: 'x',
    } as EvDetails);
    expect(d.title).toBe('Movie');
    expect(d.roles).toEqual(['1']);
    expect('extra' in d).toBe(false);
  });
});

describe('answers', () => {
  it('puts Going past the capacity on the waitlist, and toggles', () => {
    const e = { capacity: 2 };
    expect(evAnswerFor(e, 'going', null, 1)).toBe('going');
    expect(evAnswerFor(e, 'going', null, 2)).toBe('waitlist');
    expect(evAnswerFor(e, 'going', 'maybe', 2)).toBe('waitlist');
    // Answering the same again takes it back, from the waitlist too.
    expect(evAnswerFor(e, 'going', 'going', 2)).toBeNull();
    expect(evAnswerFor(e, 'going', 'waitlist', 2)).toBeNull();
    expect(evAnswerFor(e, 'maybe', 'going', 2)).toBe('maybe');
    expect(evAnswerFor({ capacity: 0 }, 'going', null, 900)).toBe('going');
  });

  it('reads button ids', () => {
    expect(parseEvId('ev:rsvp:12:maybe')).toEqual({
      number: 12,
      choice: 'maybe',
    });
    expect(parseEvId('ev:rsvp:12:later')).toBeNull();
    expect(parseEvId('sg:up')).toBeNull();
  });
});

describe('the message', () => {
  const c = { ...evDefault('100'), listSize: 2 };

  it('fills the variables', () => {
    const v = evVariables(c, event({ capacity: 5 }), ['1', '2', '3'], '9');
    expect(v).toMatchObject({
      'event.title': 'Movie night',
      'event.id': '#3',
      'event.start': `<t:${at('2026-10-20T18:00:00Z') / 1000}:F>`,
      'event.start.relative': `<t:${at('2026-10-20T18:00:00Z') / 1000}:R>`,
      'event.host': '<@42>',
      'event.link': 'https://discord.com/channels/9/100/700',
      'event.status': 'Upcoming',
      'event.location': 'To be announced',
      'going.count': '2',
      'maybe.count': '1',
      'spots.left': '3',
      'going.list': '<@1>, <@2> and 1 more',
    });
    expect(
      evVariables(c, event({ status: 'ended' }), [], '9')['event.status'],
    ).toBe('Ended · 2 went');
    expect(evVariables(c, event(), [], '9')['spots.left']).toBe('Unlimited');
    expect(goingList([], 5)).toBe('Nobody yet');
    expect(goingList(['1', '2'], 5)).toBe('<@1> and <@2>');
    expect(
      evWhere({
        place: { id: '5', name: 'Stage', stage: true },
        location: 'x',
      }),
    ).toBe('<#5> · x');
  });

  it('adds the RSVP row with counts and a calendar link', () => {
    const row = evButtons(
      event({
        capacity: 2,
        counts: { going: 2, maybe: 0, no: 1, waitlist: 3 },
      }),
    ) as { components: Record<string, unknown>[] };
    expect(row.components.map((b) => b.label)).toEqual([
      'Going (2/2 · 3 waiting)',
      'Maybe (0)',
      'Can’t go (1)',
      'Add to calendar',
    ]);
    expect(row.components[0]).toMatchObject({
      custom_id: 'ev:rsvp:3:going',
      style: 3,
      emoji: { name: '✅' },
    });
    expect(row.components[3]).toMatchObject({ style: 5 });
    const closed = evButtons(event({ status: 'cancelled' })) as {
      components: Record<string, unknown>[];
    };
    expect(closed.components.every((b) => b.disabled)).toBe(true);
    expect(closed.components.at(-1)).toMatchObject({
      label: 'Cancelled',
      style: 4,
    });
    const off = evButtons(
      event({
        options: { ...c.options, maybe: { ...c.options.maybe, on: false } },
      }),
    ) as { components: { label: string }[] };
    expect(off.components.map((b) => b.label)).not.toContain('Maybe (1)');
  });

  it('keeps the calendar link within Discord’s 512 characters', () => {
    const url = calendarUrl(
      details({ description: 'long words '.repeat(200) }),
    );
    expect(url.length).toBeLessThanOrEqual(512);
    expect(url).toMatch(
      /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Movie\+night&dates=20261020T180000Z%2F20261020T200000Z/,
    );
  });

  it('builds the message with its picture, row and ping', () => {
    const body = evPayload(
      c,
      evDefaultMessage('event'),
      event({ image: 'https://x.test/p.png', pingRole: '77' }),
      ['1'],
      { now, guildId: '9', ping: true },
    ) as {
      content: string;
      embeds: { title: string; image?: { url: string } }[];
      components: { components: unknown[] }[];
      allowed_mentions: unknown;
    };
    expect(body.embeds[0]!.title).toBe('📅 Movie night');
    expect(body.embeds[0]!.image).toEqual({ url: 'https://x.test/p.png' });
    expect(body.components).toHaveLength(1);
    expect(body.content).toBe('<@&77>');
    expect(body.allowed_mentions).toEqual({ parse: [], roles: ['77'] });
    const quiet = evPayload(c, evDefaultMessage('event'), event(), [], {
      now,
      guildId: '9',
    });
    expect(quiet.allowed_mentions).toEqual({ parse: [] });
    const v2 = evPayload(
      c,
      { ...studioDefault('1'), layout: 'v2' },
      event({ image: 'https://x.test/p.png' }),
      [],
      { now, guildId: '9' },
    ) as { components: { type: number }[] };
    expect(v2.components.at(-1)!.type).toBe(1);
  });

  it('leaves a row for the RSVP buttons', () => {
    const m = studioDefault('1');
    const button = (id: string) => ({
      id,
      type: 'button' as const,
      label: 'x',
      emoji: '',
      colour: 'grey' as const,
      link: false,
      url: '',
      actions: [],
    });
    expect(evMessageIssue(m)).toBeNull();
    expect(
      evMessageIssue({
        ...m,
        components: [
          {
            id: 'm1',
            type: 'menu',
            placeholder: '',
            multiple: false,
            options: [],
          },
          {
            id: 'm2',
            type: 'menu',
            placeholder: '',
            multiple: false,
            options: [],
          },
          {
            id: 'm3',
            type: 'menu',
            placeholder: '',
            multiple: false,
            options: [],
          },
          {
            id: 'm4',
            type: 'menu',
            placeholder: '',
            multiple: false,
            options: [],
          },
          button('b1'),
        ] as never,
      })?.problem,
    ).toMatch(/up to 4 rows/);
  });

  it('pings Going members at the start', () => {
    const body = evStartPayload(
      event({ place: { id: '5', name: 'Stage', stage: true } }),
      ['1', '2'],
      'https://discord.com/channels/9/100/700',
    );
    expect(body.content).toBe(
      '🔔 **Movie night** is starting now! Join in <#5>.\n<@1> <@2>\n-# https://discord.com/channels/9/100/700',
    );
    expect(body.allowed_mentions).toEqual({ parse: [], users: ['1', '2'] });
  });

  it('describes Discord’s own scheduled event', () => {
    expect(evDiscordEvent(details({ location: 'Minecraft' }))).toMatchObject({
      name: 'Movie night',
      entity_type: 3,
      channel_id: null,
      entity_metadata: { location: 'Minecraft' },
      scheduled_start_time: '2026-10-20T18:00:00.000Z',
      scheduled_end_time: '2026-10-20T20:00:00.000Z',
      privacy_level: 2,
    });
    expect(
      evDiscordEvent(details({ place: { id: '5', name: 'S', stage: true } })),
    ).toMatchObject({ entity_type: 1, channel_id: '5' });
    expect(
      evDiscordEvent(details({ place: { id: '6', name: 'V', stage: false } })),
    ).toMatchObject({ entity_type: 2, channel_id: '6' });
  });
});

describe('commands and logs', () => {
  it('registers /event with the server’s names', () => {
    const c = evDefault('1');
    c.commands.group.name = 'events';
    c.commands.remind.on = false;
    c.options.no.on = false;
    const [body] = evCommandBodies(c) as {
      name: string;
      options: {
        name: string;
        options: { name: string; choices?: unknown }[];
      }[];
    }[];
    expect(body!.name).toBe('events');
    expect(body!.options.map((o) => o.name)).toEqual([
      'create',
      'list',
      'info',
      'rsvp',
      'cancel',
    ]);
    expect(body!.options[3]!.options[1]!.choices).toEqual([
      { name: 'Going', value: 'going' },
      { name: 'Maybe', value: 'maybe' },
    ]);
    expect(evCommandFor(c, 'events', 'rsvp')).toBe('rsvp');
    expect(evCommandFor(c, 'events', 'remind')).toBeUndefined();
    expect(evCommandFor(c, 'event', 'rsvp')).toBeUndefined();
    for (const k of [
      'create',
      'list',
      'info',
      'rsvp',
      'cancel',
      'remind',
    ] as const)
      c.commands[k].on = false;
    expect(evCommandBodies(c)).toEqual([]);
  });

  it('writes log lines', () => {
    const e = {
      id: '1',
      number: 3,
      title: 'Movie night',
      userId: '5',
      userName: 'ayo',
      detail: '',
      at: 0,
    };
    expect(evLogLine({ ...e, action: 'rsvp', detail: 'is going to' })).toBe(
      '[RSVP] @ayo is going to #3 Movie night',
    );
    expect(evLogLine({ ...e, action: 'promoted' })).toBe(
      '[PROMOTED] @ayo moved from the waitlist to Going for #3 Movie night',
    );
    expect(evLogLine({ ...e, action: 'ended', detail: '4 went' })).toBe(
      '[ENDED] #3 Movie night ended: 4 went',
    );
    expect(evLogLine({ ...e, action: 'cancelled' })).toBe(
      '[CANCELLED] #3 Movie night cancelled by @ayo',
    );
    expect(evLogLine({ ...e, action: 'failed', detail: 'oops' })).toBe(
      '[FAILED] #3 Movie night: oops',
    );
  });
});
