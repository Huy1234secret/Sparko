import { describe, expect, it } from 'vitest';
import {
  cleanLevels,
  lvBar,
  lvCommandBodies,
  lvCommandFor,
  lvCrateCanDrop,
  lvCrateRow,
  lvDefault,
  lvEarns,
  lvIssue,
  lvLevelOf,
  lvLogLine,
  lvMessageIssue,
  lvMessageXp,
  lvMultiplier,
  lvNeed,
  lvPayload,
  lvProgress,
  lvRewardPlan,
  lvShouldAnnounce,
  lvTotalFor,
  lvUpgrade,
  lvVariables,
  lvDefaultMessage,
  type Levels,
} from './levels.ts';

const base = (patch: Partial<Levels> = {}): Levels => ({
  ...lvDefault('100'),
  ...patch,
});

describe('the curve', () => {
  it('needs more XP for each level, steeper on steeper curves', () => {
    expect(lvNeed('standard', 0)).toBe(100);
    expect(lvNeed('standard', 1)).toBe(155);
    expect(lvTotalFor('standard', 2)).toBe(255);
    expect(lvNeed('gentle', 5)).toBeLessThan(lvNeed('standard', 5));
    expect(lvNeed('steep', 5)).toBeGreaterThan(lvNeed('standard', 5));
  });

  it('says where someone is inside a level', () => {
    expect(lvProgress('standard', 0)).toMatchObject({
      level: 0,
      into: 0,
      need: 100,
      next: 100,
      percent: 0,
    });
    expect(lvProgress('standard', 100)).toMatchObject({ level: 1, into: 0 });
    expect(lvProgress('standard', 177)).toMatchObject({
      level: 1,
      into: 77,
      need: 155,
      next: 255,
      percent: 49,
    });
  });

  it('stops at the highest level, while XP still counts', () => {
    const p = lvProgress('standard', 1_000_000, 3);
    expect(p).toMatchObject({ level: 3, max: true, percent: 100, need: 0 });
    expect(lvLevelOf(base({ maxLevel: 3 }), 1_000_000)).toBe(3);
  });

  it('draws a bar that only fills whole steps', () => {
    expect(lvBar(0)).toBe('▱▱▱▱▱▱▱▱▱▱');
    expect(lvBar(49)).toBe('▰▰▰▰▱▱▱▱▱▱');
    expect(lvBar(100)).toBe('▰▰▰▰▰▰▰▰▰▰');
  });
});

describe('earning', () => {
  const c = base({
    noXpChannels: ['200'],
    noXpRoles: ['9'],
    boosts: [
      { id: 'a', kind: 'role', target: '1', multiplier: 1.5 },
      { id: 'b', kind: 'role', target: '2', multiplier: 2 },
      { id: 'c', kind: 'channel', target: '300', multiplier: 0.5 },
    ],
  });

  it('skips no-XP channels, their threads and no-XP roles', () => {
    expect(lvEarns(c, { channelId: '100' }, new Set())).toBe(true);
    expect(lvEarns(c, { channelId: '200' }, new Set())).toBe(false);
    expect(lvEarns(c, { channelId: '201', parentId: '200' }, new Set())).toBe(
      false,
    );
    expect(lvEarns(c, { channelId: '100' }, new Set(['9']))).toBe(false);
  });

  it('uses the best role boost times the channel’s', () => {
    expect(lvMultiplier(c, { channelId: '100' }, new Set())).toBe(1);
    expect(lvMultiplier(c, { channelId: '100' }, new Set(['1', '2']))).toBe(2);
    expect(lvMultiplier(c, { channelId: '300' }, new Set(['2']))).toBe(1);
    expect(
      lvMultiplier(c, { channelId: '301', parentId: '300' }, new Set(['1'])),
    ).toBe(0.75);
  });

  it('rolls XP between the smallest and largest, with the boost', () => {
    expect(lvMessageXp(c, 1, () => 0)).toBe(15);
    expect(lvMessageXp(c, 1, () => 0.9999)).toBe(25);
    expect(lvMessageXp(c, 2, () => 0)).toBe(30);
    expect(
      lvMessageXp(base({ message: { ...c.message, min: 1, max: 1 } }), 0.1),
    ).toBe(1);
  });

  it('announces every level, or every Nth, unless it’s off', () => {
    expect(lvShouldAnnounce(c, 3)).toBe(true);
    const every5 = base({ levelUp: { ...c.levelUp, every: 5 } });
    expect(lvShouldAnnounce(every5, 3)).toBe(false);
    expect(lvShouldAnnounce(every5, 10)).toBe(true);
    expect(
      lvShouldAnnounce(base({ levelUp: { ...c.levelUp, where: 'off' } }), 5),
    ).toBe(false);
  });
});

describe('reward roles', () => {
  const c = base({
    rewards: [
      { id: 'a', level: 5, role: '1' },
      { id: 'b', level: 10, role: '2' },
    ],
  });
  it('gives every reward earned, and takes back ones dropped below', () => {
    expect(lvRewardPlan(c, 12, new Set())).toEqual({
      give: ['1', '2'],
      take: [],
    });
    expect(lvRewardPlan(c, 6, new Set(['1', '2']))).toEqual({
      give: [],
      take: ['2'],
    });
    expect(
      lvRewardPlan({ ...c, removeRewards: false }, 6, new Set(['1', '2'])),
    ).toEqual({ give: [], take: [] });
  });
  it('keeps only the highest when rewards don’t stack', () => {
    expect(
      lvRewardPlan({ ...c, stackRewards: false }, 12, new Set(['1'])),
    ).toEqual({ give: ['2'], take: ['1'] });
  });
});

describe('crates', () => {
  const c = base({ crates: { ...lvDefault().crates, on: true } });
  it('drop only where allowed and not too soon after the last', () => {
    expect(lvCrateCanDrop(c, { channelId: '1' }, null, 0)).toBe(true);
    expect(lvCrateCanDrop(c, { channelId: '1' }, 0, 5 * 60_000)).toBe(false);
    expect(lvCrateCanDrop(c, { channelId: '1' }, 0, 10 * 60_000)).toBe(true);
    const only = { ...c, crates: { ...c.crates, channels: ['7'] } };
    expect(lvCrateCanDrop(only, { channelId: '1' }, null, 0)).toBe(false);
    expect(
      lvCrateCanDrop(only, { channelId: '8', parentId: '7' }, null, 0),
    ).toBe(true);
    expect(lvCrateCanDrop(base(), { channelId: '1' }, null, 0)).toBe(false);
  });
  it('has an Open button that becomes who won, or that it vanished', () => {
    expect(lvCrateRow({ open: true }).components[0]).toMatchObject({
      label: 'Open',
      custom_id: 'lv:crate',
    });
    expect(
      lvCrateRow({ claimedBy: 'kit', xp: 120 }).components[0],
    ).toMatchObject({
      label: 'kit got 120 XP',
      disabled: true,
    });
    expect(lvCrateRow({ gone: true }).components[0]).toMatchObject({
      disabled: true,
    });
  });
  it('leaves a row for the button in embed messages', () => {
    const m = lvDefaultMessage('crate');
    const five = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      type: 'menu',
      placeholder: '',
      multiple: false,
      options: [],
    }));
    expect(
      lvMessageIssue({ ...m, components: five as never }, 'crate'),
    ).toMatchObject({ at: 'message' });
    expect(
      lvMessageIssue({ ...m, components: five.slice(1) as never }, 'crate'),
    ).toBeNull();
    expect(lvMessageIssue(m, 'crate')).toBeNull();
  });
});

describe('messages', () => {
  it('fills in the level variables', () => {
    const v = lvVariables(base(), {
      xp: 177,
      rank: 3,
      messages: 12,
      voiceMinutes: 90,
      previous: 0,
      rewards: ['55'],
    });
    expect(v).toMatchObject({
      level: '1',
      'level.previous': '0',
      xp: '177',
      'xp.next': '255',
      'xp.left': '78',
      rank: '#3',
      'progress.percent': '49%',
      'progress.bar': '▰▰▰▰▱▱▱▱▱▱',
      'voice.time': '1h 30m',
      'reward.role': '<@&55>',
      'crate.range': '50–150 XP',
    });
  });

  it('pings only the member on a level-up, and adds the crate button', () => {
    const c = base();
    const facts = { xp: 120, rank: 1, messages: 1, voiceMinutes: 0 };
    const up = lvPayload(lvDefaultMessage('levelup'), c, facts, {
      now: 0,
      user: { id: '42', name: 'kit' },
      ping: '42',
    });
    expect(up.allowed_mentions).toEqual({ parse: [], users: ['42'] });
    const crate = lvPayload(
      lvDefaultMessage('crate'),
      c,
      { ...facts, crate: { min: 5, max: 5, endsAt: 60_000 } },
      { now: 0 },
      { open: true },
    );
    expect(crate.allowed_mentions).toEqual({ parse: [] });
    expect(JSON.stringify(crate)).toContain('5 XP');
    expect(JSON.stringify(crate)).toContain('<t:60:R>');
    expect(crate.components?.at(-1)).toMatchObject({ type: 1 });
  });

  it('writes log lines', () => {
    expect(
      lvLogLine({
        id: '1',
        action: 'level-up',
        userId: '1',
        userName: 'kit',
        detail: 'reached level 5',
        at: 0,
      }),
    ).toBe('[LEVEL UP] @kit reached level 5');
    expect(
      lvLogLine({
        id: '1',
        action: 'reset',
        userId: '0',
        userName: 'everyone',
        detail: 'by @quinn',
        at: 0,
      }),
    ).toBe('[RESET] Everyone’s XP was reset: by @quinn');
  });
});

describe('checks', () => {
  it('accepts the defaults', () => {
    expect(lvIssue(lvDefault('100'))).toBeNull();
  });

  it('says what’s wrong, and where', () => {
    const c = base();
    expect(lvIssue({ ...c, message: { ...c.message, min: 30 } })).toMatchObject(
      { at: 'message:xp' },
    );
    expect(
      lvIssue({
        ...c,
        levelUp: { ...c.levelUp, where: 'channel', channel: '' },
      }),
    ).toMatchObject({ at: 'levelUp:channel' });
    expect(
      lvIssue({
        ...c,
        rewards: [
          { id: 'a', level: 5, role: '1' },
          { id: 'b', level: 5, role: '2' },
        ],
      }),
    ).toMatchObject({ at: 'reward:b', problem: /Two rewards are at level 5/ });
    expect(
      lvIssue(
        { ...c, rewards: [{ id: 'a', level: 5, role: '1' }] },
        { roles: new Map([['1', false]]) },
      ),
    ).toMatchObject({ problem: /Sparko can’t give the role/ });
    expect(
      lvIssue({ ...c, rewards: [{ id: 'a', level: 200, role: '1' }] }),
    ).toMatchObject({ problem: /from 1 to 100/ });
    expect(
      lvIssue({
        ...c,
        boosts: [{ id: 'a', kind: 'role', target: '1', multiplier: 1.25 }],
      }),
    ).toMatchObject({ at: 'boost:a', problem: /steps of 0.1/ });
    expect(
      lvIssue({ ...c, crates: { ...c.crates, cooldown: '5s' } }),
    ).toMatchObject({ at: 'crates:cooldown' });
    expect(
      lvIssue({ ...c, crates: { ...c.crates, min: 10, max: 5 } }),
    ).toMatchObject({ at: 'crates:xp' });
    expect(lvIssue(c, { templates: new Set() })).toBeNull();
    expect(
      lvIssue(
        { ...c, rank: { ...c.rank, template: 't1' } },
        { templates: new Set() },
      ),
    ).toMatchObject({ at: 'message:rank' });
    expect(
      lvIssue({
        ...c,
        commands: {
          ...c.commands,
          leaderboard: { ...c.commands.leaderboard, name: 'rank' },
        },
      }),
    ).toMatchObject({ at: 'command:leaderboard' });
  });

  it('holds each plan to its limits', () => {
    const c = base({
      boosts: [1, 2, 3, 4].map((i) => ({
        id: `b${i}`,
        kind: 'role' as const,
        target: String(i),
        multiplier: 2,
      })),
    });
    expect(lvIssue(c)).toMatchObject({ at: 'boosts' });
    expect(lvIssue(c, { plan: 'plus' })).toBeNull();
  });

  it('keeps only known fields, and fills in older settings', () => {
    const c = { ...base(), extra: 1 } as Levels;
    expect(cleanLevels(c)).not.toHaveProperty('extra');
    expect(lvUpgrade({ curve: 'steep' } as Partial<Levels>)).toMatchObject({
      curve: 'steep',
      crates: { on: false },
    });
  });
});

describe('commands', () => {
  it('registers /rank, /leaderboard and /xp, as named', () => {
    const c = base();
    c.commands.rank.name = 'level';
    const bodies = lvCommandBodies(c) as { name: string; options?: object[] }[];
    expect(bodies.map((b) => b.name)).toEqual(['level', 'leaderboard', 'xp']);
    expect(lvCommandFor(c, 'level')).toBe('rank');
    expect(lvCommandFor(c, 'rank')).toBeUndefined();
    c.commands.xp.on = false;
    expect(lvCommandBodies(c)).toHaveLength(2);
  });
});
