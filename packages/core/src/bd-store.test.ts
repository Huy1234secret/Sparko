import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import { addTemplate } from './templates.ts';
import {
  BD_MODULE,
  bdDefault,
  bdGuilds,
  bdJoined,
  bdLeft,
  bdRemove,
  bdSave,
  bdSet,
  bdSweep,
  bdTestPost,
  getBirthday,
  listBdLog,
  listBirthdays,
  type Birthdays,
} from './bd-store.ts';

const G = '1000';
const D = 86_400_000;
const H = 3_600_000;
const at = (iso: string) => Date.parse(iso);
const ayo = {
  id: '500',
  name: 'ayo',
  avatar: 'https://cdn.discordapp.com/a.png',
};
const rhea = { id: '501', name: 'rhea', avatar: '' };

function setup(patch: Partial<Birthdays> = {}) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    {
      id: G,
      name: 'Pixel Plaza',
      icon: null,
      memberCount: 10,
      installed: true,
    },
    0,
  );
  writeModule(
    db,
    G,
    BD_MODULE,
    { on: true, config: { ...bdDefault('100'), hour: 9, ...patch } },
    0,
  );
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let id = 900;
  let fail: ((path: string) => Error | null) | null = null;
  const run = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const e = fail?.(path);
    if (e) throw e;
    return { id: String(id++) };
  };
  const rest = {
    post: vi.fn((p: string, b: unknown) => run('POST', p, b)),
    patch: vi.fn((p: string, b: unknown) => run('PATCH', p, b)),
    put: vi.fn((p: string) => run('PUT', p)),
    delete: vi.fn((p: string) => run('DELETE', p)),
    get: vi.fn((p: string) => run('GET', p)),
  } as unknown as Rest;
  const set = (
    user: typeof ayo,
    d: {
      day: number;
      month: number;
      year?: number | null;
      timeZone?: string | null;
    },
    now = 0,
  ) =>
    bdSave(
      db,
      G,
      {
        user,
        day: d.day,
        month: d.month,
        year: d.year ?? null,
        timeZone: d.timeZone ?? null,
        by: user,
      },
      now,
    );
  const posts = () =>
    calls.filter(
      (c) => c.method === 'POST' && c.path === '/channels/100/messages',
    );
  return {
    db,
    rest,
    calls,
    set,
    posts,
    failWith: (f: typeof fail) => (fail = f),
  };
}

describe('saving birthdays', () => {
  it('saves, changes and removes a birthday, logging each', () => {
    const t = setup();
    const T = at('2026-01-01T00:00:00Z');
    const r1 = bdSet(
      t.db,
      {
        guildId: G,
        user: ayo,
        created: 0,
        joined: 0,
        day: 14,
        month: 3,
        year: 2001,
        timeZone: 'Europe/London',
      },
      T + 0 * D,
    );
    expect(r1).toMatchObject({ ok: true, entry: { day: 14, year: 2001 } });
    // Changing the time zone alone doesn't count as a change.
    const zone = bdSet(
      t.db,
      {
        guildId: G,
        user: ayo,
        created: 0,
        joined: 0,
        day: 14,
        month: 3,
        year: 2001,
        timeZone: 'Asia/Tokyo',
      },
      T + 1 * D,
    );
    expect(zone.ok).toBe(true);
    // A new date within 30 days is refused.
    const again = bdSet(
      t.db,
      {
        guildId: G,
        user: ayo,
        created: 0,
        joined: 0,
        day: 15,
        month: 3,
        year: 2001,
        timeZone: null,
      },
      T + 10 * D,
    );
    expect(again).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/change your birthday again/),
    });
    // Staff can fix it any time, and the zone is kept.
    const fixed = bdSet(
      t.db,
      {
        guildId: G,
        user: ayo,
        created: 0,
        joined: 0,
        day: 15,
        month: 3,
        year: 2001,
        timeZone: null,
        by: rhea,
      },
      T + 10 * D,
    );
    expect(fixed).toMatchObject({
      ok: true,
      entry: { day: 15, timeZone: 'Asia/Tokyo', setByName: 'rhea' },
    });
    expect(bdRemove(t.db, G, ayo.id, ayo, T + 11 * D)).toMatchObject({
      roleId: null,
    });
    expect(getBirthday(t.db, G, ayo.id)).toBeNull();
    expect(listBdLog(t.db, G).map((e) => [e.action, e.detail])).toEqual([
      ['removed', '15 March 2001 (Asia/Tokyo)'],
      [
        'changed',
        '14 March 2001 (Asia/Tokyo) → 15 March 2001 (Asia/Tokyo) by @rhea',
      ],
      ['changed', '14 March 2001 (Europe/London) → 14 March 2001 (Asia/Tokyo)'],
      ['set', '14 March 2001 (Europe/London)'],
    ]);
  });

  it('refuses bad dates, unknown zones and new accounts', () => {
    const t = setup({ minAccountAge: '7d' });
    const base = {
      guildId: G,
      user: ayo,
      created: 0,
      joined: 0,
      day: 30,
      month: 2,
      year: null,
      timeZone: null,
    };
    expect(bdSet(t.db, base, 100 * D)).toMatchObject({
      problem: expect.stringMatching(/February has 29 days/),
    });
    expect(
      bdSet(t.db, { ...base, day: 1, timeZone: 'Mars/Base' }, 100 * D),
    ).toMatchObject({ problem: expect.stringMatching(/time zone/) });
    expect(
      bdSet(t.db, { ...base, day: 1, created: 99 * D }, 100 * D),
    ).toMatchObject({ problem: expect.stringMatching(/at least 7d old/) });
    writeModule(t.db, G, BD_MODULE, { on: false }, 0);
    expect(bdSet(t.db, { ...base, day: 1 }, 100 * D)).toMatchObject({
      problem: 'Birthdays are off in this server.',
    });
  });

  it('lists birthdays in calendar order and searches them', () => {
    const t = setup();
    t.set(ayo, { day: 1, month: 12 });
    t.set(rhea, { day: 5, month: 2 });
    t.set({ id: '502', name: 'Mossy', avatar: '' }, { day: 2, month: 12 });
    expect(listBirthdays(t.db, G).map((b) => b.name)).toEqual([
      'rhea',
      'ayo',
      'Mossy',
    ]);
    expect(listBirthdays(t.db, G, { query: 'mos' }).map((b) => b.name)).toEqual(
      ['Mossy'],
    );
    expect(listBirthdays(t.db, G, { query: '501' })).toHaveLength(1);
    expect(listBirthdays(t.db, G, { month: 12 })).toHaveLength(2);
  });

  it('hides or forgets members who leave, and brings them back', () => {
    const t = setup();
    t.set(ayo, { day: 1, month: 1 });
    expect(bdLeft(t.db, G, ayo.id)).toMatchObject({ inServer: false });
    bdJoined(t.db, G, { ...ayo, name: 'ayo2' });
    expect(getBirthday(t.db, G, ayo.id)).toMatchObject({
      inServer: true,
      name: 'ayo2',
    });
    writeModule(
      t.db,
      G,
      BD_MODULE,
      { on: true, config: { ...bdDefault('100'), forgetLeavers: true } },
      0,
    );
    bdLeft(t.db, G, ayo.id, 5);
    expect(getBirthday(t.db, G, ayo.id)).toBeNull();
    expect(listBdLog(t.db, G)[0]).toMatchObject({
      action: 'removed',
      detail: 'they left the server',
    });
  });
});

describe('the sweep', () => {
  it('posts at the hour, once, with the role for a day and a DM', async () => {
    const t = setup({ role: '777', dm: true, timeZone: 'Europe/London' });
    t.set(ayo, { day: 14, month: 7, year: 2000 });
    // 8:59 in London is too early.
    expect(
      await bdSweep(t.rest, t.db, G, at('2026-07-14T07:59:00Z')),
    ).toMatchObject({
      celebrated: 0,
    });
    const nine = at('2026-07-14T08:00:00Z');
    expect(await bdSweep(t.rest, t.db, G, nine)).toMatchObject({
      celebrated: 1,
    });
    expect(t.posts()).toHaveLength(1);
    const body = t.posts()[0]!.body as {
      content: string;
      embeds: { title: string }[];
      allowed_mentions: unknown;
    };
    expect(body.content).toBe('<@500>');
    expect(body.embeds[0]!.title).toBe('🎂 Happy birthday, ayo!');
    expect(body.allowed_mentions).toEqual({ parse: [], users: ['500'] });
    expect(t.calls).toContainEqual({
      method: 'PUT',
      path: `/guilds/${G}/members/500/roles/777`,
    });
    expect(t.calls.some((c) => c.path === '/users/@me/channels')).toBe(true);
    // Running again the same day, or later that day, posts nothing more.
    await bdSweep(t.rest, t.db, G, nine + 60_000);
    await bdSweep(t.rest, t.db, G, nine + 10 * H);
    expect(t.posts()).toHaveLength(1);
    expect(getBirthday(t.db, G, ayo.id)).toMatchObject({
      celebratedYear: 2026,
      roleUntil: nine + D,
    });
    // The role comes off 24 hours later.
    await bdSweep(t.rest, t.db, G, nine + D);
    expect(t.calls.at(-1)).toEqual({
      method: 'DELETE',
      path: `/guilds/${G}/members/500/roles/777`,
    });
    expect(getBirthday(t.db, G, ayo.id)?.roleUntil).toBeNull();
    expect(listBdLog(t.db, G).map((e) => e.action)).toEqual([
      'role-removed',
      'role-given',
      'celebrated',
      'set',
    ]);
    expect(listBdLog(t.db, G)[2]!.detail).toBe(
      '14 July, turning 26, sent a DM',
    );
    // Next year it's celebrated again.
    await bdSweep(t.rest, t.db, G, at('2027-07-14T09:00:00Z'));
    expect(t.posts()).toHaveLength(2);
  });

  it('two sweeps at once still post once', async () => {
    const t = setup({ hour: 0 });
    t.set(ayo, { day: 14, month: 3 });
    const now = at('2026-03-14T12:00:00Z');
    await Promise.all([
      bdSweep(t.rest, t.db, G, now),
      bdSweep(t.rest, t.db, G, now),
    ]);
    expect(t.posts()).toHaveLength(1);
  });

  it('lists everyone in one post, or posts one each', async () => {
    const now = at('2026-03-14T12:00:00Z');
    const together = setup({ hour: 0 });
    together.set(ayo, { day: 14, month: 3 });
    together.set(rhea, { day: 14, month: 3 });
    await bdSweep(together.rest, together.db, G, now);
    expect(together.posts()).toHaveLength(1);
    expect(
      (together.posts()[0]!.body as { embeds: { title: string }[] }).embeds[0]!
        .title,
    ).toBe('🎉 2 birthdays today!');
    const each = setup({ hour: 0, style: 'each' });
    each.set(ayo, { day: 14, month: 3 });
    each.set(rhea, { day: 14, month: 3 });
    await bdSweep(each.rest, each.db, G, now);
    expect(each.posts()).toHaveLength(2);
  });

  it('uses each member’s own time zone', async () => {
    const t = setup({ hour: 9, zoneMode: 'member' });
    t.set(ayo, { day: 14, month: 3, timeZone: 'Asia/Tokyo' });
    t.set(rhea, { day: 14, month: 3, timeZone: 'America/New_York' });
    // 9:00 on the 14th in Tokyo; still the 13th in New York.
    await bdSweep(t.rest, t.db, G, at('2026-03-14T00:00:00Z'));
    expect(t.posts()).toHaveLength(1);
    expect((t.posts()[0]!.body as { content: string }).content).toBe('<@500>');
    // 9:00 in New York (EDT) is 13:00 UTC.
    await bdSweep(t.rest, t.db, G, at('2026-03-14T13:00:00Z'));
    expect(t.posts()).toHaveLength(2);
    expect((t.posts()[1]!.body as { content: string }).content).toBe('<@501>');
  });

  it('celebrates 29 February on the 28th in a common year', async () => {
    const t = setup({ hour: 0 });
    t.set(ayo, { day: 29, month: 2, year: 2000 });
    await bdSweep(t.rest, t.db, G, at('2026-02-27T12:00:00Z'));
    expect(t.posts()).toHaveLength(0);
    await bdSweep(t.rest, t.db, G, at('2026-02-28T12:00:00Z'));
    expect(t.posts()).toHaveLength(1);
    await bdSweep(t.rest, t.db, G, at('2026-03-01T12:00:00Z'));
    expect(t.posts()).toHaveLength(1);
    expect(listBdLog(t.db, G)[0]!.detail).toBe('29 February, turning 26');
    // In a leap year it waits for the 29th.
    await bdSweep(t.rest, t.db, G, at('2028-02-28T12:00:00Z'));
    expect(t.posts()).toHaveLength(1);
    await bdSweep(t.rest, t.db, G, at('2028-02-29T12:00:00Z'));
    expect(t.posts()).toHaveLength(2);
  });

  it('skips members who left, and does nothing while off', async () => {
    const t = setup({ hour: 0 });
    t.set(ayo, { day: 14, month: 3 });
    bdLeft(t.db, G, ayo.id);
    const now = at('2026-03-14T12:00:00Z');
    await bdSweep(t.rest, t.db, G, now);
    expect(t.posts()).toHaveLength(0);
    bdJoined(t.db, G, ayo);
    writeModule(t.db, G, BD_MODULE, { on: false }, 0);
    await bdSweep(t.rest, t.db, G, now);
    expect(t.posts()).toHaveLength(0);
  });

  it('tries again after a moment’s trouble, but not after a refusal', async () => {
    const t = setup({ hour: 0 });
    t.set(ayo, { day: 14, month: 3 });
    const now = at('2026-03-14T12:00:00Z');
    t.failWith(() => new Error('network'));
    await bdSweep(t.rest, t.db, G, now);
    expect(getBirthday(t.db, G, ayo.id)?.celebratedYear).toBeNull();
    t.failWith(() => null);
    await bdSweep(t.rest, t.db, G, now + 60_000);
    expect(getBirthday(t.db, G, ayo.id)?.celebratedYear).toBe(2026);

    const refused = setup({ hour: 0 });
    refused.set(ayo, { day: 14, month: 3 });
    refused.failWith(() => new DiscordError(403, 50013, 'Missing Permissions'));
    await bdSweep(refused.rest, refused.db, G, now);
    await bdSweep(refused.rest, refused.db, G, now + 60_000);
    expect(refused.posts()).toHaveLength(1);
    expect(listBdLog(refused.db, G)[0]).toMatchObject({
      action: 'failed',
      detail: expect.stringMatching(/can’t post in the birthday channel/),
    });
  });

  it('logs a role it can’t give, and gives up taking one back after a day', async () => {
    const t = setup({ hour: 0, role: '777' });
    t.set(ayo, { day: 14, month: 3 });
    const now = at('2026-03-14T12:00:00Z');
    t.failWith((p) =>
      p.includes('/roles/') ? new DiscordError(403, 50013, 'Missing') : null,
    );
    await bdSweep(t.rest, t.db, G, now);
    expect(listBdLog(t.db, G)[0]).toMatchObject({
      action: 'failed',
      detail: expect.stringMatching(/couldn’t give the birthday role/),
    });
    // A role that was given but can't be taken back.
    t.db
      .prepare(
        "UPDATE birthdays SET role_id = '777', role_until = ? WHERE user_id = ?",
      )
      .run(now, ayo.id);
    await bdSweep(t.rest, t.db, G, now + H);
    expect(getBirthday(t.db, G, ayo.id)?.roleUntil).toBe(now);
    await bdSweep(t.rest, t.db, G, now + D + H);
    expect(getBirthday(t.db, G, ayo.id)?.roleUntil).toBeNull();
    expect(listBdLog(t.db, G)[0]!.detail).toMatch(
      /couldn’t take the birthday role back/,
    );
  });

  it('takes roles back even after the module is turned off', async () => {
    const t = setup({ hour: 0, role: '777' });
    t.set(ayo, { day: 14, month: 3 });
    const now = at('2026-03-14T12:00:00Z');
    await bdSweep(t.rest, t.db, G, now);
    writeModule(t.db, G, BD_MODULE, { on: false }, 0);
    expect(bdGuilds(t.db)).toEqual([G]);
    await bdSweep(t.rest, t.db, G, now + D);
    expect(t.calls.at(-1)?.method).toBe('DELETE');
    expect(bdGuilds(t.db)).toEqual([]);
  });

  it('posts the month’s birthdays on the 1st, once', async () => {
    const t = setup({ hour: 9, monthly: true });
    t.set(ayo, { day: 20, month: 4 });
    t.set(rhea, { day: 3, month: 4 });
    t.set({ id: '503', name: 'may', avatar: '' }, { day: 3, month: 5 });
    await bdSweep(t.rest, t.db, G, at('2026-04-01T08:00:00Z'));
    expect(t.posts()).toHaveLength(0);
    await bdSweep(t.rest, t.db, G, at('2026-04-01T09:00:00Z'));
    await bdSweep(t.rest, t.db, G, at('2026-04-01T10:00:00Z'));
    expect(t.posts()).toHaveLength(1);
    expect(
      (t.posts()[0]!.body as { embeds: { description: string }[] }).embeds[0]!
        .description,
    ).toBe('<@501> — 3 April\n<@500> — 20 April');
    expect(listBdLog(t.db, G)[0]).toMatchObject({
      action: 'monthly',
      detail: '2 birthdays in April',
    });
    // A month with nobody posts nothing, and says so.
    const empty = setup({ hour: 0, monthly: true });
    await bdSweep(empty.rest, empty.db, G, at('2026-06-01T12:00:00Z'));
    expect(empty.posts()).toHaveLength(0);
    expect(listBdLog(empty.db, G)[0]!.detail).toMatch(
      /nobody has a birthday in June/,
    );
  });

  it('uses the server’s own template', async () => {
    const t = setup({ hour: 0 });
    const id = addTemplate(
      t.db,
      {
        guildId: G,
        moduleId: 'studio',
        name: 'Mine',
        who: 'rhea',
        message: {
          name: 'Mine',
          channel: '',
          layout: 'embed',
          content: 'Party for {birthday.users} ({birthday.count})',
          embeds: [],
          components: [],
          v2: {
            accent: '#FACC15',
            text: '',
            thumbnail: '',
            gallery: [],
            place: [],
          },
        },
      },
      0,
    );
    const c = { ...bdDefault('100'), hour: 0 };
    c.messages.single = String(id);
    writeModule(t.db, G, BD_MODULE, { on: true, config: c }, 0);
    t.set(ayo, { day: 14, month: 3 });
    await bdSweep(t.rest, t.db, G, at('2026-03-14T12:00:00Z'));
    expect((t.posts()[0]!.body as { content: string }).content).toBe(
      'Party for <@500> (1)',
    );
  });
});

describe('test messages', () => {
  it('posts a made-up birthday that says it’s a test', async () => {
    const t = setup();
    await bdTestPost(
      t.rest,
      t.db,
      G,
      '200',
      'multiple',
      rhea,
      at('2026-03-14T12:00:00Z'),
    );
    const body = t.calls[0]!.body as {
      content: string;
      allowed_mentions: unknown;
    };
    expect(t.calls[0]!.path).toBe('/channels/200/messages');
    expect(body.content).toMatch(/^-# This is a test/);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    t.failWith(() => new DiscordError(403, 50013, 'Missing'));
    await expect(
      bdTestPost(t.rest, t.db, G, '200', 'monthly', rhea),
    ).rejects.toThrow(/can’t post in the birthday channel/);
  });
});
