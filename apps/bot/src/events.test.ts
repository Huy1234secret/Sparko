import {
  BD_MODULE,
  bdDefault,
  EV_MODULE,
  evBlank,
  evCreate,
  evDefault,
  evPost,
  getEvent,
  listRsvps,
  openDb,
  upsertGuild,
  writeModule,
  type EvAnswerResult,
  type Events,
  type Rest,
} from '@sparko/core';
import { describe, expect, it, vi } from 'vitest';
import {
  answerText,
  createForm,
  eventsBot,
  infoText,
  listText,
  placeFrom,
} from './events.ts';
import { guildCommandBodies } from './guild-commands.ts';

const HOUR = 3_600_000;

function setup(patch: Partial<Events> = {}) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    { id: 'g', name: 'G', icon: null, memberCount: 1, installed: true },
    0,
  );
  const config = { ...evDefault('100'), timeZone: 'Europe/London', ...patch };
  writeModule(db, 'g', EV_MODULE, { on: true, config }, 0);
  let id = 900;
  const rest = {
    put: vi.fn(async () => {}),
    post: vi.fn(async () => ({ id: String(id++) })),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => {}),
  } as unknown as Rest;
  const bot = eventsBot(db, rest, { appId: () => 'app' });
  const member = (uid: string, manager = false, roles: string[] = []) => ({
    id: uid,
    displayName: `member${uid}`,
    displayAvatarURL: () => '',
    roles: { cache: new Map(roles.map((r) => [r, {}])) },
    permissions: { has: () => manager },
  });
  const reply = () => {
    const i = {
      deferred: false,
      replied: false,
      reply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
      deferReply: vi.fn(async () => {
        i.deferred = true;
      }),
      showModal: vi.fn(async () => {}),
      respond: vi.fn(async () => {}),
    };
    return i;
  };
  /** An /event command, with its options. */
  const use = (
    sub: string,
    options: Record<string, unknown> = {},
    { manager = false, name = 'event' } = {},
  ) => ({
    ...reply(),
    guildId: 'g',
    commandName: name,
    user: { id: '7' },
    member: member('7', manager),
    options: {
      getSubcommand: () => sub,
      getInteger: (n: string) => options[n] ?? null,
      getString: (n: string) => options[n] ?? null,
      getFocused: () => options.focused ?? '',
    },
  });
  type Command = Parameters<typeof bot.command>[0];
  /** What the bot said back. */
  const said = (i: ReturnType<typeof reply>) => {
    const calls = [
      ...i.reply.mock.calls,
      ...i.editReply.mock.calls,
    ] as unknown as [{ content: string }][];
    return calls.at(-1)?.[0].content;
  };
  const run = async (i: ReturnType<typeof use>) => {
    expect(bot.command(i as unknown as Command)).toBe(true);
    await vi.waitFor(() =>
      expect(
        i.reply.mock.calls.length +
          i.editReply.mock.calls.length +
          i.showModal.mock.calls.length,
      ).toBeGreaterThan(0),
    );
    return said(i);
  };
  const create = (title = 'Movie night', patch = {}) => {
    const start = Math.ceil((Date.now() + 24 * HOUR) / HOUR) * HOUR;
    const r = evCreate(
      db,
      'g',
      {
        ...evBlank(config, Date.now()),
        title,
        start,
        end: start + 2 * HOUR,
        ...patch,
      },
      { id: '42', name: 'quinn' },
    );
    if (!r.ok) throw new Error(r.problem);
    return r.event;
  };
  return { db, rest, bot, use, run, said, reply, member, create, config };
}

describe('the /event form', () => {
  it('asks for the title, description, start, length and place', () => {
    const form = createForm(evDefault('1'));
    expect(form.custom_id).toBe('ev:new');
    expect(form.components).toHaveLength(5);
    const ids = form.components.map(
      (r) => (r.components[0] as { custom_id: string }).custom_id,
    );
    expect(ids).toEqual([
      'title',
      'description',
      'start',
      'length',
      'location',
    ]);
    const start = form.components[2]!.components[0] as { label: string };
    expect(start.label).toBe('Starts (UTC time)');
  });

  it('finds a voice or stage channel by name or mention', () => {
    const channels = [
      { id: '1', name: 'general', type: 0 },
      { id: '2', name: 'Movie Room', type: 2 },
      { id: '3', name: 'stage', type: 13 },
    ];
    expect(placeFrom('movie room', channels)).toEqual({
      place: { id: '2', name: 'Movie Room', stage: false },
      location: '',
    });
    expect(placeFrom('<#3>', channels).place).toEqual({
      id: '3',
      name: 'stage',
      stage: true,
    });
    expect(placeFrom('general', channels)).toEqual({
      place: null,
      location: 'general',
    });
    expect(placeFrom('  ', channels)).toEqual({ place: null, location: '' });
  });
});

describe('what /event says', () => {
  it('lists and describes events', () => {
    const t = setup();
    const e = t.create();
    expect(listText(t.config, [])).toBe(
      'There are no upcoming events. Staff can make one with /event create.',
    );
    expect(listText(t.config, [e])).toBe(
      `📅 **Upcoming events**\n**#1 Movie night** · <t:${e.start / 1000}:F> · 0 going`,
    );
    const text = infoText(t.config, { ...e, capacity: 5 }, ['7', '8'], 'g');
    expect(text).toContain('📅 **#1 Movie night**');
    expect(text).toContain('**Going:** 0 of 5');
    expect(text).toContain('<@7> and <@8>');
    expect(text).toContain('**Where:** To be announced');
  });

  it('tells members where their answer landed', () => {
    const t = setup();
    const event = t.create();
    const r = (patch: Partial<Extract<EvAnswerResult, { ok: true }>>) =>
      answerText({
        ok: true,
        event,
        answer: 'going',
        was: null,
        position: 0,
        promoted: [],
        ...patch,
      });
    expect(r({})).toMatch(/^You’re going to \*\*Movie night\*\*!/);
    expect(r({ answer: 'waitlist', position: 3 })).toMatch(
      /full, so you’re #3 on the waitlist/,
    );
    expect(r({ answer: 'no' })).toBe(
      'Marked you as can’t go for **Movie night**.',
    );
    expect(r({ answer: null, was: 'maybe' })).toBe(
      'Took back your Maybe answer to **Movie night**.',
    );
  });
});

describe('/event in a server', () => {
  it('opens the form for staff only', async () => {
    const t = setup({ managers: ['300'] });
    expect(await t.run(t.use('create'))).toBe(
      'Only staff who manage events can do this.',
    );
    const i = t.use('create', {}, { manager: true });
    await t.run(i);
    expect(i.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ custom_id: 'ev:new' }),
    );
  });

  it('creates and posts an event from the form', async () => {
    const t = setup();
    const form = (fields: Record<string, string>, manager = true) => ({
      ...t.reply(),
      customId: 'ev:new',
      guildId: 'g',
      member: t.member('7', manager),
      guild: {
        channels: {
          cache: new Map([['55', { id: '55', name: 'Cinema', type: 2 }]]),
        },
      },
      fields: {
        getTextInputValue: (id: string) => fields[id] ?? '',
      },
    });
    type Modal = Parameters<typeof t.bot.modal>[0];
    const send = async (i: ReturnType<typeof form>) => {
      await t.bot.modal(i as unknown as Modal);
      return t.said(i);
    };
    expect(await send(form({ title: 'Film', start: 'whenever' }))).toMatch(
      /couldn’t read when it starts: “whenever”/,
    );
    expect(
      await send(
        form({ title: 'Film', start: 'tomorrow 19:00', length: 'ages' }),
      ),
    ).toMatch(/couldn’t read how long it lasts/);
    expect(
      await send(form({ title: 'Film', start: 'tomorrow 19:00' }, false)),
    ).toBe('Only staff who manage events can do this.');
    const ok = await send(
      form({
        title: 'Film',
        description: 'Bring snacks',
        start: 'tomorrow 19:00',
        length: '2h',
        location: 'cinema',
      }),
    );
    expect(ok).toMatch(
      /^Scheduled \*\*#1 Film\*\* for <t:\d+:F>\. https:\/\/discord\.com\/channels\/g\/100\/900/,
    );
    const e = getEvent(t.db, 'g', 1)!;
    expect(e).toMatchObject({
      title: 'Film',
      description: 'Bring snacks',
      place: { id: '55', name: 'Cinema', stage: false },
      hostName: 'member7',
      messageId: '900',
    });
    expect(e.end - e.start).toBe(2 * HOUR);
  });

  it('answers with buttons and /event rsvp', async () => {
    const t = setup();
    t.create('Movie night', { capacity: 1 });
    await evPost(t.rest, t.db, 'g', 1);
    const press = (uid: string, id: string) => ({
      ...t.reply(),
      customId: id,
      guildId: 'g',
      member: t.member(uid),
    });
    type Button = Parameters<typeof t.bot.component>[0];
    const a = press('7', 'ev:rsvp:1:going');
    expect(await t.bot.component(a as unknown as Button)).toBe(true);
    expect(t.said(a)).toMatch(/You’re going/);
    const b = press('8', 'ev:rsvp:1:going');
    await t.bot.component(b as unknown as Button);
    expect(t.said(b)).toMatch(/#1 on the waitlist/);
    expect(
      await t.bot.component(press('8', 'sp:b:x') as unknown as Button),
    ).toBe(false);
    expect(await t.run(t.use('rsvp', { id: 1, choice: 'no' }))).toBe(
      'Marked you as can’t go for **Movie night**.',
    );
    // 7 gave up the spot, so 8 moved up.
    expect(listRsvps(t.db, 'g', 1).map((r) => [r.userId, r.answer])).toEqual([
      ['8', 'going'],
      ['7', 'no'],
    ]);
    expect(await t.run(t.use('rsvp', { id: 9, choice: 'no' }))).toBe(
      'There’s no event #9.',
    );
  });

  it('lists, shows, reminds and cancels', async () => {
    const t = setup();
    t.create();
    expect(await t.run(t.use('list'))).toMatch(/\*\*#1 Movie night\*\*/);
    expect(await t.run(t.use('info', { id: 1 }))).toMatch(
      /\*\*Host:\*\* <@42>/,
    );
    expect(await t.run(t.use('remind', { id: 1 }))).toBe(
      'Only staff who manage events can do this.',
    );
    expect(await t.run(t.use('remind', { id: 1 }, { manager: true }))).toBe(
      'Nobody has said they’re going yet, so nothing was sent.',
    );
    await t.run(t.use('rsvp', { id: 1, choice: 'going' }));
    expect(await t.run(t.use('remind', { id: 1 }, { manager: true }))).toBe(
      'Reminded 1 of 1 member about **Movie night**.',
    );
    expect(await t.run(t.use('cancel', { id: 1 }, { manager: true }))).toBe(
      'Cancelled **#1 Movie night**. 1 of 1 going got a DM.',
    );
    expect(getEvent(t.db, 'g', 1)!.status).toBe('cancelled');
    expect(await t.run(t.use('cancel', { id: 1 }, { manager: true }))).toBe(
      'Event #1 has already been cancelled.',
    );
  });

  it('suggests events by number or title', () => {
    const t = setup();
    t.create('Movie night');
    t.create('Game night');
    type Auto = Parameters<typeof t.bot.autocomplete>[0];
    const i = t.use('info', { focused: 'game' });
    expect(t.bot.autocomplete(i as unknown as Auto)).toBe(true);
    expect(i.respond).toHaveBeenCalledWith([
      { name: expect.stringMatching(/^#2 Game night · /), value: 2 },
    ]);
    expect(
      t.bot.autocomplete(t.use('list', { focused: 'x' }) as unknown as Auto),
    ).toBe(false);
  });

  it('only answers its own, renamed commands, and nothing while off', () => {
    const t = setup();
    type Command = Parameters<typeof t.bot.command>[0];
    const c = evDefault('100');
    c.commands.group.name = 'happenings';
    writeModule(t.db, 'g', EV_MODULE, { on: true, config: c }, 0);
    expect(t.bot.command(t.use('list') as unknown as Command)).toBe(false);
    expect(
      t.bot.command(
        t.use('list', {}, { name: 'happenings' }) as unknown as Command,
      ),
    ).toBe(true);
    writeModule(t.db, 'g', EV_MODULE, { on: false }, 0);
    expect(
      t.bot.command(
        t.use('list', {}, { name: 'happenings' }) as unknown as Command,
      ),
    ).toBe(false);
  });

  it('runs the dashboard’s jobs', async () => {
    const t = setup();
    t.create();
    const jobs = t.bot.handlers(() => undefined);
    await jobs['events-post']({
      guildId: 'g',
      payload: { number: 1 },
    } as never);
    expect(getEvent(t.db, 'g', 1)!.messageId).toBe('900');
    await jobs['events-delete']({
      guildId: 'g',
      payload: {
        guildId: 'g',
        channelId: '100',
        messageId: '900',
        discordEventId: null,
        roles: [],
      },
    } as never);
    expect(t.rest.delete).toHaveBeenCalledWith('/channels/100/messages/900');
    await expect(jobs.events({ guildId: 'g' } as never)).rejects.toThrow(
      /isn’t in this server/,
    );
  });
});

describe('per-server commands', () => {
  it('registers /event with the other modules’ commands', () => {
    const t = setup();
    expect(guildCommandBodies(t.db, 'g').map((c) => c.name)).toEqual(['event']);
    writeModule(t.db, 'g', BD_MODULE, { on: true, config: bdDefault('1') }, 0);
    expect(guildCommandBodies(t.db, 'g').map((c) => c.name)).toEqual([
      'birthday',
      'event',
    ]);
  });
});
