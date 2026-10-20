import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import {
  EV_MODULE,
  evAnswer,
  evBlank,
  evCancel,
  evCreate,
  evDefault,
  evDelete,
  evForget,
  evGuilds,
  evMarkCancelled,
  evPost,
  evRemind,
  evRespond,
  evSetNoShow,
  evSweep,
  evTestPost,
  evUpcomingCount,
  evUpdate,
  getEvent,
  listEvents,
  listEvLog,
  listRsvps,
  type EvDetails,
  type Events,
} from './ev-store.ts';

const G = '1000';
const H = 3_600_000;
const at = (iso: string) => Date.parse(iso);
const now = at('2026-10-19T12:00:00Z');
const quinn = { id: '42', name: 'quinn' };
const person = (id: string) => ({ id, name: `m${id}`, avatar: '' });

function setup(patch: Partial<Events> = {}, plan: 'free' | 'plus' = 'free') {
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
  if (plan === 'plus')
    db.prepare("UPDATE guilds SET plan = 'plus' WHERE id = ?").run(G);
  const config = { ...evDefault('100'), timeZone: 'Europe/London', ...patch };
  writeModule(db, G, EV_MODULE, { on: true, config }, 0);
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let id = 900;
  let fail: ((method: string, path: string) => Error | null) | null = null;
  const run = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const e = fail?.(method, path);
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
  const details = (d: Partial<EvDetails> = {}): EvDetails => ({
    ...evBlank(config, now),
    title: 'Movie night',
    start: at('2026-10-20T18:00:00Z'),
    end: at('2026-10-20T20:00:00Z'),
    ...d,
  });
  const create = (d: Partial<EvDetails> = {}) => {
    const r = evCreate(db, G, details(d), quinn, now);
    if (!r.ok) throw new Error(r.problem);
    return r.event;
  };
  const answer = (
    number: number,
    user: string,
    choice: 'going' | 'maybe' | 'no',
    when = now,
  ) =>
    evRespond(
      rest,
      db,
      { guildId: G, number, user: person(user), choice, roles: new Set() },
      when,
    );
  const dms = () =>
    calls
      .filter((c) => c.path === '/users/@me/channels')
      .map((c) => (c.body as { recipient_id: string }).recipient_id);
  return {
    db,
    rest,
    calls,
    details,
    create,
    answer,
    dms,
    failWith: (f: typeof fail) => {
      fail = f;
    },
  };
}

describe('creating events', () => {
  it('saves an event and logs it, within the plan’s limit', () => {
    const t = setup();
    const e = t.create();
    expect(e).toMatchObject({
      number: 1,
      status: 'scheduled',
      title: 'Movie night',
      hostName: 'quinn',
      messageId: null,
      counts: { going: 0, maybe: 0, no: 0, waitlist: 0 },
    });
    for (let i = 0; i < 4; i++) t.create();
    expect(evUpcomingCount(t.db, G)).toBe(5);
    const r = evCreate(t.db, G, t.details(), quinn, now);
    expect(r).toMatchObject({
      ok: false,
      problem:
        'Your plan has up to 5 upcoming events. Cancel or delete one, or wait for one to end.',
    });
    expect(listEvLog(t.db, G)[0]).toMatchObject({
      action: 'created',
      number: 5,
      userName: 'quinn',
    });
  });

  it('takes 100 on Plus, and refuses when off or wrong', () => {
    const plus = setup({}, 'plus');
    for (let i = 0; i < 6; i++) plus.create();
    expect(evUpcomingCount(plus.db, G)).toBe(6);
    expect(
      evCreate(plus.db, G, plus.details({ title: '' }), quinn, now),
    ).toMatchObject({ ok: false, at: 'title' });
    writeModule(plus.db, G, EV_MODULE, { on: false }, 0);
    expect(evCreate(plus.db, G, plus.details(), quinn, now)).toMatchObject({
      ok: false,
      problem: 'Events are off in this server.',
    });
  });

  it('numbers never repeat, even after a delete', () => {
    const t = setup();
    t.create();
    const two = t.create();
    evForget(t.db, G, two.number, quinn, now);
    expect(t.create().number).toBe(3);
  });

  it('counts reminders whose time has passed as sent', () => {
    const t = setup({}, 'plus');
    const e = t.create({
      reminders: ['1d', '1h'],
      start: at('2026-10-20T08:00:00Z'),
      end: at('2026-10-20T10:00:00Z'),
    });
    // 1 day before 09:00 tomorrow has already gone.
    expect(e.reminded).toEqual(['1d']);
  });
});

describe('posting', () => {
  it('posts with the RSVP row, pings the role once, then edits', async () => {
    const t = setup();
    const e = t.create({ pingRole: '77' });
    const posted = await evPost(t.rest, t.db, G, e.number, now);
    expect(posted).toMatchObject({ channelId: '100', messageId: '900' });
    const first = t.calls[0]!;
    expect(first).toMatchObject({
      method: 'POST',
      path: '/channels/100/messages',
    });
    expect(first.body).toMatchObject({
      content: '<@&77>',
      allowed_mentions: { parse: [], roles: ['77'] },
    });
    await evPost(t.rest, t.db, G, e.number, now);
    expect(t.calls[1]).toMatchObject({
      method: 'PATCH',
      path: '/channels/100/messages/900',
      body: { allowed_mentions: { parse: [] } },
    });
  });

  it('posts again when the message was deleted', async () => {
    const t = setup();
    const e = t.create();
    await evPost(t.rest, t.db, G, e.number, now);
    t.failWith((m) =>
      m === 'PATCH'
        ? new DiscordError(404, DiscordCodes.unknownMessage, 'Unknown Message')
        : null,
    );
    const again = await evPost(t.rest, t.db, G, e.number, now);
    expect(again?.messageId).not.toBe('900');
  });

  it('explains when it can’t post', async () => {
    const t = setup();
    const e = t.create();
    t.failWith(
      () => new DiscordError(403, DiscordCodes.missingPermissions, 'Missing'),
    );
    await expect(evPost(t.rest, t.db, G, e.number, now)).rejects.toThrow(
      /Sparko can’t post in the events channel/,
    );
  });

  it('adds it to Discord’s own events, and keeps them in step', async () => {
    const t = setup({ sync: true });
    const e = t.create({ location: 'Minecraft' });
    await evPost(t.rest, t.db, G, e.number, now);
    const made = t.calls.find(
      (c) => c.path === `/guilds/${G}/scheduled-events`,
    );
    expect(made?.body).toMatchObject({
      name: 'Movie night',
      entity_type: 3,
      entity_metadata: { location: 'Minecraft' },
    });
    const synced = getEvent(t.db, G, e.number)!;
    expect(synced.discordEventId).toBe('901');
    await evCancel(t.rest, t.db, G, e.number, quinn, now);
    expect(
      t.calls.find(
        (c) =>
          c.path === `/guilds/${G}/scheduled-events/901` &&
          c.method === 'PATCH',
      )?.body,
    ).toEqual({ status: 4 });
  });

  it('logs when Discord’s events can’t be used', async () => {
    const t = setup({ sync: true });
    const e = t.create();
    t.failWith((_, p) =>
      p.includes('scheduled-events')
        ? new DiscordError(403, DiscordCodes.missingPermissions, 'Missing')
        : null,
    );
    await evPost(t.rest, t.db, G, e.number, now);
    expect(listEvLog(t.db, G)[0]).toMatchObject({
      action: 'failed',
      detail:
        'Sparko couldn’t add it to Discord’s events. It needs the Manage Events permission.',
    });
  });
});

describe('answering', () => {
  it('fills the spots, then the waitlist, and moves people up', async () => {
    const t = setup({ attending: true, attendingRole: '555' });
    const e = t.create({ capacity: 1 });
    await evPost(t.rest, t.db, G, e.number, now);
    expect(await t.answer(1, '7', 'going')).toMatchObject({
      ok: true,
      answer: 'going',
      was: null,
    });
    expect(t.rest.put).toHaveBeenCalledWith(
      `/guilds/${G}/members/7/roles/555`,
      {},
      'Going to an event',
    );
    expect(await t.answer(1, '8', 'going')).toMatchObject({
      answer: 'waitlist',
      position: 1,
    });
    expect(await t.answer(1, '9', 'going')).toMatchObject({
      answer: 'waitlist',
      position: 2,
    });
    // 7 gives up their spot: 8 is next in line, gets the role and a DM.
    const r = await t.answer(1, '7', 'maybe');
    expect(r).toMatchObject({ answer: 'maybe', was: 'going' });
    expect(r.ok && r.promoted.map((p) => p.userId)).toEqual(['8']);
    expect(t.rest.delete).toHaveBeenCalledWith(
      `/guilds/${G}/members/7/roles/555`,
      expect.any(String),
    );
    expect(t.rest.put).toHaveBeenCalledWith(
      `/guilds/${G}/members/8/roles/555`,
      {},
      'Going to an event',
    );
    expect(t.dms()).toEqual(['8']);
    expect(getEvent(t.db, G, 1)!.counts).toEqual({
      going: 1,
      maybe: 1,
      no: 0,
      waitlist: 1,
    });
    expect(
      listEvLog(t.db, G)
        .map((l) => l.action)
        .slice(0, 2),
    ).toEqual(['promoted', 'rsvp']);
  });

  it('takes an answer back when it’s pressed again', async () => {
    const t = setup();
    t.create();
    await t.answer(1, '7', 'maybe');
    expect(await t.answer(1, '7', 'maybe')).toMatchObject({
      answer: null,
      was: 'maybe',
    });
    expect(listRsvps(t.db, G, 1)).toEqual([]);
    expect(listEvLog(t.db, G)[0]!.detail).toBe(
      'took back their Maybe answer to',
    );
  });

  it('refuses answers it doesn’t take', async () => {
    const t = setup();
    const c = evDefault();
    t.create({
      roles: ['300'],
      options: { ...c.options, no: { ...c.options.no, on: false } },
    });
    const ask = (choice: 'going' | 'no', roles: string[], when = now) =>
      evAnswer(t.db, G, 1, person('7'), choice, new Set(roles), when);
    expect(ask('going', [])).toEqual({
      ok: false,
      problem: 'Only <@&300> can answer this event.',
    });
    expect(ask('no', ['300'])).toEqual({
      ok: false,
      problem: 'This event doesn’t take Can’t go answers.',
    });
    expect(ask('going', ['300'], at('2026-10-21T00:00:00Z'))).toEqual({
      ok: false,
      problem: 'This event has ended.',
    });
    expect(evAnswer(t.db, G, 99, person('7'), 'going', new Set(), now)).toEqual(
      { ok: false, problem: 'This event is gone.' },
    );
  });

  it('marks no-shows', async () => {
    const t = setup();
    t.create();
    await t.answer(1, '7', 'going');
    expect(evSetNoShow(t.db, G, 1, '7', true)).toBe(true);
    expect(listRsvps(t.db, G, 1)[0]!.noShow).toBe(true);
    expect(evSetNoShow(t.db, G, 1, '8', true)).toBe(false);
  });
});

describe('changing, cancelling and deleting', () => {
  it('moves people off the waitlist when there’s more room', async () => {
    const t = setup();
    const e = t.create({ capacity: 1 });
    await t.answer(1, '7', 'going');
    await t.answer(1, '8', 'going');
    const r = evUpdate(
      t.db,
      G,
      1,
      { ...t.details(), capacity: 2, start: e.start + H, end: e.end + H },
      quinn,
      now,
    );
    expect(r.ok && r.promoted.map((p) => p.userId)).toEqual(['8']);
    expect(r.ok && r.event.start).toBe(e.start + H);
    expect(listEvLog(t.db, G).find((l) => l.action === 'edited')?.detail).toBe(
      'start, end, capacity 1 → 2',
    );
    expect(evUpdate(t.db, G, 9, t.details(), quinn, now)).toMatchObject({
      ok: false,
      problem: 'There’s no event #9.',
    });
  });

  it('cancels: Cancelled message, DMs to Going, roles off', async () => {
    const t = setup({ attending: true, attendingRole: '555' });
    t.create();
    await evPost(t.rest, t.db, G, 1, now);
    await t.answer(1, '7', 'going');
    await t.answer(1, '8', 'maybe');
    t.calls.length = 0;
    const r = await evCancel(t.rest, t.db, G, 1, quinn, now);
    expect(r).toMatchObject({ ok: true, told: 1 });
    expect(getEvent(t.db, G, 1)!.status).toBe('cancelled');
    const edit = t.calls.find((c) => c.method === 'PATCH')!.body as {
      components: { components: { label: string; disabled?: boolean }[] }[];
    };
    const row = edit.components.at(-1)!.components;
    expect(row.at(-1)).toMatchObject({ label: 'Cancelled', disabled: true });
    expect(t.dms()).toEqual(['7']);
    expect(t.rest.delete).toHaveBeenCalledWith(
      `/guilds/${G}/members/7/roles/555`,
      'The event is over',
    );
    expect(evMarkCancelled(t.db, G, 1, quinn, now)).toEqual({
      ok: false,
      problem: 'Event #1 has already been cancelled.',
    });
  });

  it('doesn’t DM when cancelled DMs are off', async () => {
    const t = setup({
      dms: { reminder: true, cancelled: false, waitlist: true },
    });
    t.create();
    await t.answer(1, '7', 'going');
    await evCancel(t.rest, t.db, G, 1, quinn, now);
    expect(t.dms()).toEqual([]);
  });

  it('deletes the event, its message, Discord’s event and roles', async () => {
    const t = setup({ sync: true, attending: true, attendingRole: '555' });
    t.create();
    await evPost(t.rest, t.db, G, 1, now);
    await t.answer(1, '7', 'going');
    expect(await evDelete(t.rest, t.db, G, 1, quinn, now)).toBe(true);
    expect(getEvent(t.db, G, 1)).toBeNull();
    expect(listRsvps(t.db, G, 1)).toEqual([]);
    const deleted = t.calls
      .filter((c) => c.method === 'DELETE')
      .map((c) => c.path);
    expect(deleted).toEqual([
      '/channels/100/messages/900',
      `/guilds/${G}/scheduled-events/901`,
      `/guilds/${G}/members/7/roles/555`,
    ]);
    expect(await evDelete(t.rest, t.db, G, 1, quinn, now)).toBe(false);
  });
});

describe('the sweep', () => {
  it('reminds once, starts with a ping, ends and takes roles back', async () => {
    const t = setup({ attending: true, attendingRole: '555' }, 'plus');
    const e = t.create({ reminders: ['1h', '10m'], remindMaybe: true });
    await evPost(t.rest, t.db, G, 1, now);
    await t.answer(1, '7', 'going');
    await t.answer(1, '8', 'maybe');
    await t.answer(1, '9', 'no');

    // Two hours before: nothing yet.
    await evSweep(t.rest, t.db, G, e.start - 2 * H);
    expect(t.dms()).toEqual([]);
    // The 1h reminder goes to Going and Maybe, once.
    expect((await evSweep(t.rest, t.db, G, e.start - H)).reminded).toBe(1);
    expect(t.dms()).toEqual(['7', '8']);
    await evSweep(t.rest, t.db, G, e.start - H + 60_000);
    expect(t.dms()).toEqual(['7', '8']);
    expect(listEvLog(t.db, G)[0]!.detail).toBe(
      'the 1h reminder went to 2 of 2 members',
    );

    t.calls.length = 0;
    expect((await evSweep(t.rest, t.db, G, e.start)).started).toBe(1);
    expect(getEvent(t.db, G, 1)!.status).toBe('started');
    // The 10m reminder was missed while it started, so it's not sent late.
    expect(t.dms()).toEqual([]);
    const ping = t.calls.find(
      (c) => c.method === 'POST' && c.path === '/channels/100/messages',
    );
    expect(ping?.body).toMatchObject({
      content: expect.stringContaining('**Movie night** is starting now!'),
      allowed_mentions: { parse: [], users: ['7'] },
    });

    expect((await evSweep(t.rest, t.db, G, e.end)).ended).toBe(1);
    expect(getEvent(t.db, G, 1)!.status).toBe('ended');
    expect(t.rest.delete).toHaveBeenCalledWith(
      `/guilds/${G}/members/7/roles/555`,
      'The event is over',
    );
    expect(
      listEvLog(t.db, G)
        .map((l) => l.action)
        .slice(0, 3),
    ).toEqual(['ended', 'started', 'reminded']);
    // Nothing happens twice.
    const before = t.calls.length;
    await evSweep(t.rest, t.db, G, e.end + 60_000);
    expect(t.calls.length).toBe(before);
  });

  it('posts at the time it was scheduled for', async () => {
    const t = setup();
    t.create({ postAt: now + 30 * 60_000 });
    await evSweep(t.rest, t.db, G, now + 10 * 60_000);
    expect(getEvent(t.db, G, 1)!.messageId).toBeNull();
    expect((await evSweep(t.rest, t.db, G, now + 30 * 60_000)).posted).toBe(1);
    expect(getEvent(t.db, G, 1)!.messageId).toBe('900');
  });

  it('posts the next one of a repeating event after it ends', async () => {
    const t = setup();
    const e = t.create({ repeat: 'weekly' });
    await evPost(t.rest, t.db, G, 1, now);
    await evSweep(t.rest, t.db, G, e.end);
    const next = listEvents(t.db, G);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      number: 2,
      series: 1,
      // 19:00 London time both weeks, after the clocks went back.
      start: at('2026-10-27T19:00:00Z'),
      end: at('2026-10-27T21:00:00Z'),
      status: 'scheduled',
    });
    expect(next[0]!.messageId).not.toBeNull();
    expect(
      listEvLog(t.db, G).find((l) => l.action === 'repeated')?.detail,
    ).toBe('as #2');
  });

  it('only takes roles back while off', async () => {
    const t = setup({ attending: true, attendingRole: '555' });
    const e = t.create();
    await t.answer(1, '7', 'going');
    writeModule(t.db, G, EV_MODULE, { on: false }, 0);
    expect(evGuilds(t.db)).toEqual([G]);
    t.db.prepare("UPDATE events SET status = 'ended'").run();
    expect(await evSweep(t.rest, t.db, G, e.end)).toMatchObject({
      rolesOff: 1,
      ended: 0,
    });
    expect(evGuilds(t.db)).toEqual([]);
  });

  it('sends reminders when staff ask', async () => {
    const t = setup();
    t.create();
    await t.answer(1, '7', 'going');
    await t.answer(1, '8', 'maybe');
    expect(await evRemind(t.rest, t.db, G, 1, '', now, quinn)).toEqual({
      sent: 1,
      of: 1,
    });
    expect(listEvLog(t.db, G)[0]!.detail).toBe(
      'a reminder from @quinn went to 1 of 1 member',
    );
  });
});

describe('test messages', () => {
  it('posts a made-up event without working buttons', async () => {
    const t = setup();
    await evTestPost(t.rest, t.db, G, '100', 'event', person('7'), now);
    const body = t.calls[0]!.body as {
      content: string;
      components: unknown[];
      embeds: { title: string }[];
    };
    expect(body.content).toMatch(/This is a test/);
    expect(body.components).toEqual([]);
    expect(body.embeds[0]!.title).toBe('📅 Movie night');
    await evTestPost(t.rest, t.db, G, '100', 'reminder', person('7'), now);
    expect(
      (t.calls[1]!.body as { embeds: { title: string }[] }).embeds[0]!.title,
    ).toMatch(/^⏰ Movie night starts <t:/);
  });
});
