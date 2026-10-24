import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import { writeModule } from './store.ts';
import {
  arDefault,
  arIssue,
  arWithoutDeletedRoles,
  formatDuration,
  parseDuration,
  ruleMet,
  timedRoles,
  type ARRule,
  type AutoRoles,
} from './auto-roles.ts';
import {
  AR_MODULE,
  arEditMember,
  arJoined,
  arLeft,
  arSweep,
  arUpdated,
  arWipeMember,
  getARMember,
  listARLog,
  searchARMembers,
} from './ar-store.ts';

const H = 3_600_000;
const D = 24 * H;
const config = (patch: Partial<AutoRoles> = {}): AutoRoles => ({
  ...arDefault(),
  join: { before: ['10'], after: ['11'] },
  timed: [
    { id: 't1', after: '1h', role: '21' },
    { id: 't2', after: '7d', role: '22' },
  ],
  ...patch,
});
const rule = (patch: Partial<ARRule> = {}): ARRule => ({
  id: 'r1',
  name: 'Veteran',
  conditions: [
    { id: 'c1', kind: 'age', min: '30d' },
    { id: 'c2', kind: 'badge', badges: ['early'] },
    { id: 'c3', kind: 'booster', for: '1d' },
  ],
  links: ['and', 'or'],
  role: '31',
  resetOnLeave: false,
  removeOnLoss: true,
  ...patch,
});

describe('deleted automatic roles', () => {
  it('removes old IDs while retaining existing and unfinished triggers', () => {
    const original = config({
      join: { before: ['10'], after: ['11', '12'] },
      timed: [...config().timed, { id: 'new', after: '', role: '' }],
      rules: [
        rule(),
        rule({ id: 'deleted', role: '99' }),
        rule({ id: 'new', role: '' }),
      ],
    });
    const cleaned = arWithoutDeletedRoles(
      original,
      new Set(['10', '12', '21', '31']),
    );
    expect(cleaned.join).toEqual({ before: ['10'], after: ['12'] });
    expect(cleaned.timed.map((t) => t.id)).toEqual(['t1', 'new']);
    expect(cleaned.rules.map((r) => r.id)).toEqual(['r1', 'new']);
    expect(original.join.after).toEqual(['11', '12']);
    expect(original.timed).toHaveLength(3);
  });
});

function fakeRest(fail?: string) {
  const calls: string[] = [];
  const rest = {
    put: vi.fn(async (path: string) => {
      if (fail && path.endsWith(`/${fail}`))
        throw new DiscordError(403, 50013, 'Missing Permissions');
      calls.push(`+${path.split('/').pop()}`);
    }),
    delete: vi.fn(async (path: string) => {
      calls.push(`-${path.split('/').pop()}`);
    }),
  } as unknown as Rest;
  return { rest, calls };
}

describe('automatic roles: settings', () => {
  it('reads and writes durations', () => {
    expect(parseDuration('30m')).toBe(30 * 60_000);
    expect(parseDuration('1d 12h')).toBe(D + 12 * H);
    expect(parseDuration('2 days')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(formatDuration(D + 12 * H + 5 * 60_000)).toBe('1d 12h');
  });

  it('checks limits, times, rules and roles', () => {
    const roles = new Map([
      ['10', true],
      ['11', true],
      ['21', true],
      ['22', true],
      ['31', true],
      ['40', false],
    ]);
    expect(arIssue(config(), { roles })).toBeNull();
    expect(arIssue(config({ rules: [rule()] }), { roles })).toBeNull();
    expect(
      arIssue(config({ timed: [{ id: 'x', after: '30s', role: '21' }] }), {
        roles,
      })?.problem,
    ).toMatch(/like 30m/);
    expect(
      arIssue(config({ timed: [{ id: 'x', after: '3y', role: '21' }] }), {
        roles,
      })?.problem,
    ).toMatch(/between 1m and 2y/);
    expect(
      arIssue(
        config({
          timed: ['1h', '2h', '3h', '4h'].map((after, i) => ({
            id: `t${i}`,
            after,
            role: '21',
          })),
        }),
        { roles },
      )?.problem,
    ).toMatch(/up to 3 timed roles/);
    expect(
      arIssue(config({ join: { before: ['40'], after: [] } }), { roles })
        ?.problem,
    ).toMatch(/can’t give/);
    expect(
      arIssue(
        config({
          rules: [
            rule({
              conditions: [{ id: 'c', kind: 'age', min: '12h' }],
              links: [],
            }),
          ],
        }),
        { roles },
      ),
    ).toMatchObject({
      at: 'cond:c',
      problem: expect.stringMatching(/1d and 2y/),
    });
    expect(
      arIssue(config({ rules: [rule({ conditions: [], links: [] })] }), {
        roles,
      })?.problem,
    ).toMatch(/at least one requirement/);
  });

  it('joins requirements with AND before OR', () => {
    const now = Date.UTC(2026, 0, 1);
    const old = {
      created: now - 60 * D,
      flags: 0,
      boosts: 0,
      boostingSince: null,
    };
    const r = rule();
    // age AND badge OR booster: old account without the badge fails …
    expect(ruleMet(r, old, now)).toBe(false);
    // … with the badge passes, and so does boosting for over a day.
    expect(ruleMet(r, { ...old, flags: 1 << 9 }, now)).toBe(true);
    expect(ruleMet(r, { ...old, boostingSince: now - 2 * D }, now)).toBe(true);
    expect(ruleMet(r, { ...old, boostingSince: now - D / 2 }, now)).toBe(false);
  });

  it('stacks timed roles, or keeps only the latest', () => {
    expect(timedRoles(config(), 8 * D)).toEqual(['21', '22']);
    expect(timedRoles(config({ stack: false }), 8 * D)).toEqual(['22']);
    expect(timedRoles(config(), 30 * 60_000)).toEqual([]);
  });
});

describe('automatic roles: members', () => {
  const setup = (c: AutoRoles) => {
    const db = openDb(':memory:');
    writeModule(db, '1', AR_MODULE, { on: true, config: c }, 0);
    return db;
  };
  // An account made long ago.
  const user = {
    userId: '100000000000000000',
    name: 'Mia',
    flags: 0,
    pending: true,
    boostingSince: null,
  };

  it('gives join roles, swaps them once the rules are accepted, and times roles', async () => {
    const db = setup(config());
    const { rest, calls } = fakeRest();
    await arJoined(db, rest, '1', user, 0);
    expect(calls).toEqual(['+10']);
    await arUpdated(
      db,
      rest,
      '1',
      { pending: true },
      { ...user, pending: false },
      1000,
    );
    expect(calls).toEqual(['+10', '-10', '+11']);
    await arSweep(db, rest, '1', 2 * H);
    expect(calls.at(-1)).toBe('+21');
    await arSweep(db, rest, '1', 8 * D);
    expect(calls.at(-1)).toBe('+22');
    expect(getARMember(db, '1', user.userId)?.given).toEqual(['21', '22']);
    expect(listARLog(db, '1').map((e) => e.action)).toEqual([
      'met',
      'met',
      'added',
      'added',
    ]);
  });

  it('swaps timed roles without stacking, and takes rule roles back', async () => {
    const db = setup(
      config({
        stack: false,
        rules: [
          rule({
            conditions: [{ id: 'c2', kind: 'badge', badges: ['early'] }],
            links: [],
          }),
        ],
      }),
    );
    const { rest, calls } = fakeRest();
    await arJoined(
      db,
      rest,
      '1',
      { ...user, pending: false, flags: 1 << 9 },
      0,
    );
    expect(calls).toContain('+31');
    await arSweep(db, rest, '1', 2 * H);
    await arSweep(db, rest, '1', 8 * D);
    expect(calls.slice(-2)).toEqual(['+22', '-21']);
    // The badge is gone: the rule's role goes too.
    await arUpdated(db, rest, '1', null, { ...user, pending: false }, 8 * D);
    expect(calls.at(-1)).toBe('-31');
    expect(listARLog(db, '1')[0]).toMatchObject({
      action: 'lost',
      roleId: '31',
      trigger: 'Veteran',
    });
  });

  it('keeps time across stays unless it restarts, and wipes on request', async () => {
    const db = setup(config({ restartOnLeave: false }));
    const { rest } = fakeRest();
    await arJoined(db, rest, '1', { ...user, pending: false }, 0);
    arLeft(db, '1', user.userId, 3 * H);
    expect(getARMember(db, '1', user.userId)).toMatchObject({
      joinedAt: null,
      servedMs: 3 * H,
    });
    expect(listARLog(db, '1')[0]?.action).toBe('saved');
    await arJoined(db, rest, '1', { ...user, pending: false }, 10 * H);
    expect(getARMember(db, '1', user.userId)?.servedMs).toBe(3 * H);
    expect(searchARMembers(db, '1', 'mi')).toHaveLength(1);
    expect(searchARMembers(db, '1', user.userId)).toHaveLength(1);
    arEditMember(db, '1', user.userId, { servedMs: 9 * D, boosts: 3 }, 11 * H);
    expect(getARMember(db, '1', user.userId)).toMatchObject({
      servedMs: 9 * D,
      boosts: 3,
      joinedAt: 11 * H,
    });
    arWipeMember(db, '1', user.userId, 12 * H);
    expect(getARMember(db, '1', user.userId)).toMatchObject({
      servedMs: 0,
      boosts: 0,
    });
    expect(listARLog(db, '1')[0]?.action).toBe('removed');
  });

  it('forgets restarted members on leaving, and logs roles it can’t give once', async () => {
    const db = setup(config());
    const { rest } = fakeRest('21');
    await arJoined(db, rest, '1', { ...user, pending: false }, 0);
    await arSweep(db, rest, '1', 2 * H);
    await arSweep(db, rest, '1', 3 * H);
    const failed = listARLog(db, '1').filter((e) => e.action === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.reason).toMatch(/Manage Roles/);
    arLeft(db, '1', user.userId, 4 * H);
    expect(getARMember(db, '1', user.userId)).toBeNull();
    expect(listARLog(db, '1')[0]?.action).toBe('removed');
  });
});
