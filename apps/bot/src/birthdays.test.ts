import {
  BD_MODULE,
  bdDefault,
  bdSave,
  getBirthday,
  openDb,
  SG_MODULE,
  sgDefault,
  upsertGuild,
  writeModule,
  type BdEntry,
  type Birthdays,
  type Rest,
} from '@sparko/core';
import { describe, expect, it, vi } from 'vitest';
import {
  birthdaysBot,
  monthText,
  upcomingText,
  viewText,
  whenText,
  zoneFrom,
} from './birthdays.ts';
import { guildCommandBodies, registerGuildCommands } from './guild-commands.ts';

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

describe('what /birthday says', () => {
  const c = bdDefault('100');
  const now = at('2026-03-10T12:00:00Z');

  it('reads time zones as typed, or a city on its own', () => {
    expect(zoneFrom(null)).toBeNull();
    expect(zoneFrom('  ')).toBeNull();
    expect(zoneFrom('Europe/London')).toBe('Europe/London');
    expect(zoneFrom('europe/london')).toBe('Europe/London');
    expect(zoneFrom('london')).toBe('Europe/London');
    expect(zoneFrom('New York')).toBe('America/New_York');
    expect(zoneFrom('Atlantis')).toBeUndefined();
  });

  it('says when a birthday is', () => {
    expect(whenText(0)).toBe('today');
    expect(whenText(1)).toBe('tomorrow');
    expect(whenText(5)).toBe('in 5 days');
    expect(viewText(c, null, '<@1>', true, now)).toBe(
      'You haven’t saved your birthday. Save it with /birthday set.',
    );
    expect(viewText(c, entry({ year: 2000 }), '<@500>', false, now)).toBe(
      '🎂 <@500>’s birthday is **14 March**. It’s in 4 days, turning 26.',
    );
    expect(
      viewText(
        { ...c, showAge: false },
        entry({ year: 2000, day: 10 }),
        '<@500>',
        true,
        now,
      ),
    ).toBe('🎂 Your birthday is **10 March**. That’s today! 🎉');
  });

  it('lists upcoming birthdays and a month’s', () => {
    const list = [
      entry({ userId: '1', day: 12, month: 3, year: 2000 }),
      entry({ userId: '2', day: 1, month: 4 }),
    ];
    expect(upcomingText(c, list, now)).toBe(
      [
        '🎈 **Upcoming birthdays**',
        '**12 March** · <@1> turns 26 · in 2 days',
        '**1 April** · <@2> · in 22 days',
      ].join('\n'),
    );
    expect(upcomingText(c, [], now)).toMatch(/Nobody has saved a birthday/);
    expect(monthText(c, list.slice(0, 1), 3)).toBe(
      '📅 **Birthdays in March**\n**12** · <@1>',
    );
    expect(monthText(c, [], 7)).toBe('Nobody has a birthday in July yet.');
    // A long month stays within one message.
    const many = Array.from({ length: 200 }, (_, i) =>
      entry({ userId: String(10_000_000 + i), day: 1 }),
    );
    const text = monthText(c, many, 3);
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toMatch(/…and \d+ more\.$/);
  });
});

function setup(patch: Partial<Birthdays> = {}) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    { id: 'g', name: 'G', icon: null, memberCount: 1, installed: true },
    0,
  );
  writeModule(
    db,
    'g',
    BD_MODULE,
    { on: true, config: { ...bdDefault('100'), ...patch } },
    0,
  );
  const rest = {
    put: vi.fn(async () => {}),
    post: vi.fn(async () => ({ id: 'x' })),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => {}),
  } as unknown as Rest;
  const bot = birthdaysBot(db, rest, { appId: () => 'app' });
  const member = (id: string, manager = false) => ({
    id,
    displayName: `member${id}`,
    displayAvatarURL: () => '',
    joinedTimestamp: 0,
    user: { createdTimestamp: 0, bot: false },
    roles: { cache: new Map() },
    permissions: { has: () => manager },
  });
  /** A /birthday command, with its options. */
  const use = (
    sub: string,
    options: Record<string, unknown> = {},
    { manager = false, name = 'birthday' } = {},
  ) => ({
    guildId: 'g',
    commandName: name,
    user: { id: '7' },
    member: member('7', manager),
    guild: {
      members: {
        fetch: async (id: string) => (id === '8' ? member('8') : null),
      },
    },
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => sub,
      getUser: () => options.member ?? null,
      getInteger: (n: string) => options[n] ?? null,
      getString: (n: string) => options[n] ?? null,
      getFocused: () => options.focused ?? '',
    },
    reply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    respond: vi.fn(async () => {}),
  });
  type Command = Parameters<typeof bot.command>[0];
  const run = async (i: ReturnType<typeof use>) => {
    expect(bot.command(i as unknown as Command)).toBe(true);
    await vi.waitFor(() => expect(i.reply).toHaveBeenCalled());
    return (i.reply.mock.calls[0] as unknown as [{ content: string }])[0]
      .content;
  };
  return { db, rest, bot, use, run };
}

describe('/birthday in a server', () => {
  it('saves a member’s own birthday, with a time zone typed as a city', async () => {
    const t = setup({ zoneMode: 'member' });
    const said = await t.run(
      t.use('set', { day: 14, month: 3, year: 2001, timezone: 'tokyo' }),
    );
    expect(said).toBe(
      '🎂 Saved your birthday: **14 March 2001** (the year is never shown). Sparko celebrates it in <#100> at 09:00, Asia/Tokyo time.',
    );
    expect(getBirthday(t.db, 'g', '7')).toMatchObject({
      day: 14,
      timeZone: 'Asia/Tokyo',
    });
    expect(
      await t.run(t.use('set', { day: 1, month: 1, timezone: 'Atlantis' })),
    ).toMatch(/isn’t one Sparko knows/);
    expect(await t.run(t.use('set', { day: 31, month: 2 }))).toMatch(
      /February has 29 days/,
    );
  });

  it('lets only staff set or remove someone else’s', async () => {
    const t = setup();
    const other = { id: '8', bot: false };
    expect(await t.run(t.use('set', { day: 1, month: 5, member: other }))).toBe(
      'Only staff can set someone else’s birthday.',
    );
    expect(
      await t.run(
        t.use('set', { day: 1, month: 5, member: other }, { manager: true }),
      ),
    ).toMatch(/Saved member8’s birthday: \*\*1 May\*\*/);
    expect(getBirthday(t.db, 'g', '8')).toMatchObject({ setById: '7' });
    expect(
      await t.run(t.use('remove', { member: other }, { manager: true })),
    ).toBe('Removed member8’s birthday.');
    expect(
      await t.run(
        t.use(
          'set',
          { day: 1, month: 5, member: { id: '9', bot: false } },
          { manager: true },
        ),
      ),
    ).toBe('That member isn’t in the server.');
    expect(
      await t.run(
        t.use(
          'set',
          { day: 1, month: 5, member: { id: '9', bot: true } },
          { manager: true },
        ),
      ),
    ).toBe('Bots don’t have birthdays.');
  });

  it('takes the birthday role back when someone removes theirs on the day', async () => {
    const t = setup({ role: '777' });
    bdSave(
      t.db,
      'g',
      {
        user: { id: '7', name: 'q', avatar: '' },
        day: 1,
        month: 1,
        year: null,
        timeZone: null,
        by: { id: '7', name: 'q' },
      },
      0,
    );
    t.db
      .prepare(
        "UPDATE birthdays SET role_id = '777', role_until = ? WHERE user_id = '7'",
      )
      .run(Date.now() + 60_000);
    expect(await t.run(t.use('remove'))).toBe('Sparko forgot your birthday.');
    expect(t.rest.delete).toHaveBeenCalledWith(
      '/guilds/g/members/7/roles/777',
      expect.any(String),
    );
    expect(await t.run(t.use('remove'))).toBe('You haven’t saved a birthday.');
  });

  it('answers view, upcoming and list', async () => {
    const t = setup();
    expect(await t.run(t.use('view'))).toMatch(/You haven’t saved/);
    expect(await t.run(t.use('upcoming'))).toMatch(/Nobody has saved/);
    expect(await t.run(t.use('list', { month: 6 }))).toBe(
      'Nobody has a birthday in June yet.',
    );
  });

  it('only answers its own, renamed commands, and nothing while off', () => {
    const t = setup();
    type Command = Parameters<typeof t.bot.command>[0];
    expect(
      t.bot.command(
        t.use('set', {}, { name: 'suggest' }) as unknown as Command,
      ),
    ).toBe(false);
    const c = bdDefault('100');
    c.commands.group.name = 'bday';
    c.commands.set.on = false;
    writeModule(t.db, 'g', BD_MODULE, { on: true, config: c }, 0);
    expect(
      t.bot.command(t.use('set', {}, { name: 'bday' }) as unknown as Command),
    ).toBe(false);
    writeModule(t.db, 'g', BD_MODULE, { on: false }, 0);
    expect(t.bot.command(t.use('view') as unknown as Command)).toBe(false);
  });

  it('suggests time zones with their offset', async () => {
    const t = setup();
    const i = t.use('set', { focused: 'kolk' });
    type Auto = Parameters<typeof t.bot.autocomplete>[0];
    expect(t.bot.autocomplete(i as unknown as Auto)).toBe(true);
    expect(i.respond).toHaveBeenCalledWith([
      { name: 'Asia/Kolkata (UTC+05:30)', value: 'Asia/Kolkata' },
    ]);
    expect(
      t.bot.autocomplete(t.use('view', { focused: 'x' }) as unknown as Auto),
    ).toBe(false);
  });

  it('remembers members coming back, and forgets leavers when set to', () => {
    const t = setup({ forgetLeavers: true });
    bdSave(
      t.db,
      'g',
      {
        user: { id: '7', name: 'q', avatar: '' },
        day: 1,
        month: 1,
        year: null,
        timeZone: null,
        by: { id: '7', name: 'q' },
      },
      0,
    );
    t.bot.left('g', '7');
    expect(getBirthday(t.db, 'g', '7')).toBeNull();
  });

  it('can’t apply settings for a server Sparko left', async () => {
    const t = setup();
    await expect(
      t.bot.handlers(() => undefined).birthdays({ guildId: 'g' } as never),
    ).rejects.toThrow(/isn’t in this server/);
  });
});

describe('per-server commands', () => {
  it('registers suggestions and birthdays together, each name once', async () => {
    const t = setup();
    expect(guildCommandBodies(t.db, 'g').map((c) => c.name)).toEqual([
      'birthday',
    ]);
    const sg = sgDefault('100');
    sg.commands.suggest.name = 'birthday';
    writeModule(t.db, 'g', SG_MODULE, { on: true, config: sg }, 0);
    expect(guildCommandBodies(t.db, 'g').map((c) => c.name)).toEqual([
      'birthday',
      'suggestion-status',
      'suggestion-approve',
      'suggestion-deny',
      'suggestion-delete',
    ]);
    writeModule(t.db, 'g', BD_MODULE, { on: false }, 0);
    await registerGuildCommands(t.rest, t.db, 'app', 'g');
    expect(t.rest.put).toHaveBeenCalledWith(
      '/applications/app/guilds/g/commands',
      expect.arrayContaining([expect.objectContaining({ name: 'birthday' })]),
    );
    expect(guildCommandBodies(t.db, 'g')).toHaveLength(5);
  });
});
