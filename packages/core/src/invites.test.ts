import { describe, expect, it } from 'vitest';
import { studioDefault } from './studio-format.ts';
import {
  cleanInvites,
  invCommandBodies,
  invCommandFor,
  invDefault,
  invDefaultMessage,
  invDiff,
  invIsFake,
  invIssue,
  invIsStaff,
  invLimits,
  invLogLine,
  invPayload,
  invPresets,
  invRewardPlan,
  invTotal,
  invUpgrade,
  invVariables,
  type InvCode,
  type Invites,
} from './invites.ts';

const code = (c: string, uses: number, patch: Partial<InvCode> = {}) => ({
  code: c,
  inviterId: '1',
  inviterName: 'rhea',
  channelId: '100',
  channelName: 'general',
  uses,
  maxUses: 0,
  expiresAt: null,
  createdAt: 0,
  ...patch,
});
const D = 86_400_000;

describe('which invite someone used', () => {
  it('finds the one invite whose uses went up', () => {
    expect(
      invDiff([code('a', 1), code('b', 4)], [code('a', 1), code('b', 5)])?.code,
    ).toBe('b');
  });
  it('counts an invite made after Sparko last looked', () => {
    expect(invDiff([code('a', 1)], [code('a', 1), code('new', 1)])?.code).toBe(
      'new',
    );
  });
  it('can’t tell when nothing or several changed', () => {
    expect(invDiff([code('a', 1)], [code('a', 1)])).toBeNull();
    expect(
      invDiff([code('a', 1), code('b', 1)], [code('a', 2), code('b', 2)]),
    ).toBeNull();
  });
  it('spots a one-use invite Discord deleted once it was used up', () => {
    const used = invDiff(
      [code('a', 1), code('once', 0, { maxUses: 1 })],
      [code('a', 1)],
    );
    expect(used).toMatchObject({ code: 'once', uses: 1 });
    // An invite deleted by hand isn't a join.
    expect(invDiff([code('a', 1), code('gone', 3)], [code('a', 1)])).toBeNull();
  });
});

describe('counting', () => {
  const n = { regular: 10, left: 3, fake: 2, bonus: 4 };
  it('takes leaves and fakes off only when the settings say', () => {
    const c = invDefault();
    expect(invTotal(c, n)).toBe(9);
    expect(invTotal({ ...c, subtractLeaves: false }, n)).toBe(12);
    expect(invTotal({ ...c, subtractFakes: false }, n)).toBe(11);
  });
  it('counts accounts younger than the age as fake', () => {
    const c = invDefault();
    expect(invIsFake(c, 10 * D - 6 * D, 10 * D)).toBe(true);
    expect(invIsFake(c, 0, 10 * D)).toBe(false);
    expect(invIsFake({ ...c, fakeAge: '' }, 10 * D, 10 * D)).toBe(false);
  });
});

describe('reward roles', () => {
  const tiers: Invites['rewards'] = [
    { id: 'a', invites: 5, role: '505' },
    { id: 'b', invites: 1, role: '501' },
    { id: 'c', invites: 10, role: '510' },
  ];
  const c = { ...invDefault(), rewards: tiers };
  it('stacks every tier earned', () => {
    expect(invRewardPlan(c, 6, new Set())).toEqual({
      give: ['501', '505'],
      take: [],
    });
    expect(invRewardPlan(c, 6, new Set(['501']))).toEqual({
      give: ['505'],
      take: [],
    });
  });
  it('keeps only the highest when asked, swapping lower ones', () => {
    const top = { ...c, stackRewards: false, removeRewards: false };
    expect(invRewardPlan(top, 12, new Set(['501', '505']))).toEqual({
      give: ['510'],
      take: ['501', '505'],
    });
  });
  it('takes rewards back below a tier only when that’s on', () => {
    expect(invRewardPlan(c, 2, new Set(['501', '505']))).toEqual({
      give: [],
      take: ['505'],
    });
    expect(
      invRewardPlan({ ...c, removeRewards: false }, 2, new Set(['501', '505'])),
    ).toEqual({ give: [], take: [] });
    expect(invRewardPlan(c, -3, new Set(['501']))).toEqual({
      give: [],
      take: ['501'],
    });
  });
});

describe('checking settings', () => {
  const ok = () => invDefault('100');
  it('accepts the defaults', () => {
    expect(invIssue(ok())).toBeNull();
  });
  it('needs a channel for a message that’s on', () => {
    expect(
      invIssue({ ...ok(), join: { on: true, channel: '', template: '' } }),
    ).toEqual({
      at: 'join:channel',
      problem: 'Pick the channel the join message is posted in.',
    });
    expect(
      invIssue({ ...ok(), leave: { on: false, channel: '', template: '' } }),
    ).toBeNull();
  });
  it('checks the fake account age', () => {
    expect(invIssue({ ...ok(), fakeAge: 'soon' })?.at).toBe('fakeAge');
    expect(invIssue({ ...ok(), fakeAge: '2y' })?.problem).toMatch(
      /between 1h and 1y/,
    );
    expect(invIssue({ ...ok(), fakeAge: '' })).toBeNull();
  });
  it('checks reward tiers against the plan and the roles', () => {
    const tier = (id: string, invites: number, role: string) => ({
      id,
      invites,
      role,
    });
    const four = [
      tier('a', 1, '1'),
      tier('b', 2, '2'),
      tier('c', 3, '3'),
      tier('d', 4, '4'),
    ];
    expect(invIssue({ ...ok(), rewards: four })?.problem).toBe(
      'This plan has up to 3 reward roles.',
    );
    expect(invIssue({ ...ok(), rewards: four }, { plan: 'plus' })).toBeNull();
    expect(invLimits('plus').rewards).toBe(25);
    expect(
      invIssue({ ...ok(), rewards: [tier('a', 0, '1')] })?.problem,
    ).toMatch(/from 1 to 100,000/);
    expect(
      invIssue({ ...ok(), rewards: [tier('a', 2, '1'), tier('b', 2, '2')] })
        ?.problem,
    ).toBe('Two rewards are at 2 invites. Change one.');
    expect(
      invIssue({ ...ok(), rewards: [tier('a', 2, '1'), tier('b', 3, '1')] })
        ?.at,
    ).toBe('reward:b');
    expect(invIssue({ ...ok(), rewards: [tier('a', 2, '')] })?.problem).toBe(
      'Pick a role for reward 1.',
    );
    const roles = new Map([
      ['1', true],
      ['2', false],
    ]);
    expect(
      invIssue({ ...ok(), rewards: [tier('a', 2, '2')] }, { roles })?.problem,
    ).toMatch(/Sparko can’t give the role for reward 1/);
    expect(
      invIssue({ ...ok(), rewards: [tier('a', 2, '9')] }, { roles })?.problem,
    ).toMatch(/was deleted/);
  });
  it('checks templates, staff roles and command names', () => {
    expect(
      invIssue(
        { ...ok(), leave: { on: true, channel: '100', template: '77' } },
        { templates: new Set(['1']) },
      ),
    ).toEqual({
      at: 'message:leave',
      problem:
        'The leave message template was deleted. Pick or make another one.',
    });
    expect(invIssue({ ...ok(), staff: ['9'] }, { roles: new Map() })?.at).toBe(
      'staff',
    );
    const c = ok();
    c.commands.who.name = 'view';
    expect(invIssue(c)?.problem).toBe('Two commands are called /invites view.');
    c.commands.who.name = 'Who!';
    expect(invIssue(c)?.at).toBe('command:who');
    expect(invIssue(null)?.problem).toBe('Some settings are missing.');
    expect(invIssue({ ...ok(), countRejoins: 'yes' })?.problem).toBe(
      'Some settings are missing.',
    );
  });
  it('keeps only known fields and fills in new ones', () => {
    const c = { ...ok(), extra: 1, fakeAge: ' 3d ' } as Invites;
    const clean = cleanInvites(c);
    expect(clean).not.toHaveProperty('extra');
    expect(clean.fakeAge).toBe('3d');
    const old = invUpgrade({
      fakeAge: '1d',
      commands: { group: { name: 'inv' } },
    } as never);
    expect(old.commands.group).toEqual({
      name: 'inv',
      description: 'Invites in this server',
    });
    expect(old.commands.bonus.on).toBe(true);
    expect(old.join.on).toBe(true);
  });
  it('lets staff roles or Manage Server manage invites', () => {
    const c = { ...ok(), staff: ['7'] };
    expect(invIsStaff(c, new Set(['7']), false)).toBe(true);
    expect(invIsStaff(c, new Set(), true)).toBe(true);
    expect(invIsStaff(c, new Set(['8']), false)).toBe(false);
  });
});

describe('messages', () => {
  it('fills the invite variables', () => {
    expect(
      invVariables({
        type: 'normal',
        inviter: { id: '1', name: 'rhea', total: 4 },
        code: 'abc',
        uses: 9,
      }),
    ).toEqual({
      inviter: '<@1>',
      'inviter.name': 'rhea',
      'inviter.invites': '4',
      'invite.code': 'abc',
      'invite.uses': '9',
      'join.type': 'normal',
    });
    expect(
      invVariables({ type: 'vanity', inviter: null, code: 'pp', uses: 3 }),
    ).toMatchObject({
      inviter: 'the vanity link',
      'inviter.name': 'Vanity link',
      'inviter.invites': '0',
      'join.type': 'vanity',
    });
    expect(
      invVariables({ type: 'unknown', inviter: null, code: '', uses: 0 }),
    ).toMatchObject({ inviter: 'an unknown invite', 'invite.code': 'unknown' });
  });
  it('builds a message that never pings', () => {
    const m = {
      ...studioDefault('1'),
      layout: 'embed' as const,
      embeds: [],
      content: '{user} joined via {inviter} ({inviter.invites}) {join.type}',
    };
    const body = invPayload(
      m,
      {
        type: 'normal',
        inviter: { id: '1', name: 'rhea', total: 2 },
        code: 'a',
        uses: 1,
      },
      { now: 0, user: { id: '9', name: 'kit' } },
    );
    expect(body).toMatchObject({
      content: '<@9> joined via <@1> (2) normal',
      allowed_mentions: { parse: [] },
    });
  });
  it('has presets for both messages, Sparko’s own first', () => {
    expect(invDefaultMessage('join').name).toBe('Invite join card');
    expect(invDefaultMessage('leave').name).toBe('Invite leave card');
    expect(new Set(invPresets.map((p) => p.id)).size).toBe(invPresets.length);
  });
});

describe('commands', () => {
  it('registers /invites with the server’s names, leaving out ones off', () => {
    const c = invDefault('1');
    c.commands.group.name = 'inv';
    c.commands.reset.on = false;
    const [cmd] = invCommandBodies(c) as {
      name: string;
      options: {
        name: string;
        options: { name: string; required: boolean }[];
      }[];
    }[];
    expect(cmd!.name).toBe('inv');
    expect(cmd!.options.map((o) => o.name)).toEqual([
      'view',
      'leaderboard',
      'who',
      'list',
      'bonus',
    ]);
    // Discord wants required options first.
    const bonus = cmd!.options.find((o) => o.name === 'bonus')!;
    expect(bonus.options.map((o) => o.required)).toEqual([true, true]);
    expect(invCommandFor(c, 'inv', 'bonus')).toBe('bonus');
    expect(invCommandFor(c, 'inv', 'reset')).toBeUndefined();
    expect(invCommandFor(c, 'invites', 'view')).toBeUndefined();
    for (const k of Object.keys(c.commands))
      if (k !== 'group')
        (c.commands as never as Record<string, { on: boolean }>)[k]!.on = false;
    expect(invCommandBodies(c)).toEqual([]);
  });
});

describe('log lines', () => {
  const e = (action: never, detail = '', userId = '5') => ({
    id: '1',
    action,
    userId,
    userName: 'kit',
    detail,
    at: 0,
  });
  it('reads each action', () => {
    expect(invLogLine(e('joined' as never, 'invited by @rhea'))).toBe(
      '[JOINED] @kit joined: invited by @rhea',
    );
    expect(invLogLine(e('left' as never))).toBe('[LEFT] @kit left');
    expect(invLogLine(e('reward-given' as never, '@Vip'))).toBe(
      '[REWARD GIVEN] @kit got a reward role: @Vip',
    );
    expect(invLogLine(e('reward-removed' as never))).toMatch(/REWARD REMOVED/);
    expect(invLogLine(e('bonus' as never, '+3'))).toBe(
      '[BONUS] @kit’s bonus invites changed: +3',
    );
    expect(invLogLine(e('reset' as never, 'by @q', '0'))).toBe(
      '[RESET] Everyone’s invites were reset: by @q',
    );
    expect(invLogLine(e('failed' as never, 'oops'))).toBe(
      '[FAILED] @kit: oops',
    );
  });
});
