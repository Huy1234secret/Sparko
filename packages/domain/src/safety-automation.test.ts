import { describe, it, expect, vi } from 'vitest';
import {
  SafetyRuleSchema,
  evaluateSafetyRule,
  safetyRoutes,
  createModerationCase,
  FormSchema,
} from './safety.js';
import {
  attributeInvite,
  localInstant,
  nextRecurringInstant,
  nextBirthdayInstant,
  BirthdaySchema,
  WorkflowSchema,
  automationRoutes,
  processAutomationDue,
  guardAutomationEffect,
  completeAutomationEffect,
} from './automation.js';
import type { DomainContext } from './core.js';
import type { Transaction } from '@sparko/db';

const guild = '100000000000000001',
  user = '100000000000000002',
  other = '100000000000000003',
  role = '100000000000000004';
type Entry = {
  id: string;
  guildId: string;
  kind: string;
  key: string;
  ownerId: string | null;
  state: string;
  revision: number;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
};
function fixture() {
  let next = 0;
  const records: Entry[] = [],
    effects: { type: string; payload: unknown; dueAt?: Date }[] = [];
  const configurations: Record<string, unknown> = {};
  const matches = (r: Entry, w: Record<string, unknown>): boolean =>
    Object.entries(w).every(([key, value]) => {
      if (key === 'guildId_kind_key')
        return matches(r, value as Record<string, unknown>);
      if (key === 'data') {
        const q = value as { path: string[]; equals: unknown };
        let d: unknown = r.data;
        for (const part of q.path) d = (d as Record<string, unknown>)[part];
        return d === q.equals;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const q = value as Record<string, unknown>,
          rv = r[key as keyof Entry];
        if ('in' in q) return (q['in'] as unknown[]).includes(rv);
        if ('startsWith' in q)
          return String(rv).startsWith(String(q['startsWith']));
        if ('not' in q) return rv !== q['not'];
        if ('gte' in q) return Number(rv) >= Number(q['gte']);
      }
      return r[key as keyof Entry] === value;
    });
  const record = {
    findUnique: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        records.find((r) => matches(r, where)) ?? null,
    ),
    findFirst: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        records.find((r) => matches(r, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      records.filter((r) => matches(r, where)),
    ),
    count: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        records.filter((r) => matches(r, where)).length,
    ),
    create: vi.fn(async ({ data }: { data: Partial<Entry> }) => {
      const r = {
        id: `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
        guildId: guild,
        kind: '',
        key: '',
        ownerId: null,
        state: 'active',
        revision: 1,
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as Entry;
      if (
        records.some(
          (old) =>
            old.guildId === r.guildId &&
            old.kind === r.kind &&
            old.key === r.key,
        )
      )
        throw Error('Unique record key');
      records.push(r);
      return r;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          data?: unknown;
          state?: string;
          revision?: { increment: number };
        };
      }) => {
        const i = records.findIndex((r) => r.id === where.id),
          old = records[i]!;
        const r = {
          ...old,
          ...('data' in data ? { data: data.data } : {}),
          ...(data.state ? { state: data.state } : {}),
          revision: old.revision + (data.revision?.increment ?? 0),
        };
        records[i] = r;
        return r;
      },
    ),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const i = records.findIndex((r) => r.id === where.id);
      return records.splice(i, 1)[0];
    }),
  };
  const ctx: DomainContext = {
    tx: {
      record,
      featureConfig: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: { guildId_featureId: { featureId: string } };
          }) =>
            configurations[where.guildId_featureId.featureId]
              ? {
                  config: configurations[where.guildId_featureId.featureId],
                  revision: 1,
                }
              : null,
        ),
      },
    } as unknown as Transaction,
    actor: {
      userId: user,
      guildId: guild,
      roles: [],
      isAdmin: false,
      isOwner: false,
      capabilities: [],
      globalCapabilities: [],
    },
    guildId: guild,
    now: new Date('2026-10-11T00:00:00Z'),
    operationId: 'operation-test',
    effect: async (type, payload, dueAt) => {
      effects.push({ type, payload, ...(dueAt ? { dueAt } : {}) });
      return String(effects.length);
    },
    requireFeature: async (feature) => {
      if (!(configurations[feature] as { enabled?: boolean })?.enabled)
        throw Error('Module disabled');
    },
  };
  async function call(
    routes: typeof automationRoutes,
    method: string,
    path: string,
    input: unknown = {},
    params: Record<string, string> = {},
  ) {
    const found = routes.find(
      (r) => r.method === method && r.path === `/guilds/:guildId${path}`,
    )!;
    return found.handler(ctx, found.schema?.parse(input) ?? input, params);
  }
  return { ctx, records, effects, configurations, call };
}

describe('deterministic safety filters and validation', () => {
  it('tests multilingual literal matches without executing actions or interpreting regex', () => {
    const rule = SafetyRuleSchema.parse({
      id: 'keyword',
      name: 'Keywords',
      kind: 'keywords',
      keywords: ['ＣẤＭ', '(a+)+$'],
      action: 'timeout',
    });
    expect(
      evaluateSafetyRule(rule, {
        content: 'Nội dung cấm',
        mentionCount: 0,
        attachmentCount: 0,
        recentCount: 0,
        duplicateCount: 0,
      }),
    ).toMatchObject({ matched: true, plannedAction: 'timeout' });
    expect(
      evaluateSafetyRule(rule, {
        content: 'aaaaaaaaaaaaaaaaa',
        mentionCount: 0,
        attachmentCount: 0,
        recentCount: 0,
        duplicateCount: 0,
      }).matched,
    ).toBe(false);
  });
  it('does not classify uncased Vietnamese/Japanese characters as capitals', () => {
    const rule = SafetyRuleSchema.parse({
      id: 'caps',
      name: 'Caps',
      kind: 'caps',
      threshold: 80,
    });
    expect(
      evaluateSafetyRule(rule, {
        content: '日本語の通常の文章です',
        mentionCount: 0,
        attachmentCount: 0,
        recentCount: 0,
        duplicateCount: 0,
      }).matched,
    ).toBe(false);
    expect(
      evaluateSafetyRule(rule, {
        content: 'PLEASE STOP THIS NOW',
        mentionCount: 0,
        attachmentCount: 0,
        recentCount: 0,
        duplicateCount: 0,
      }).matched,
    ).toBe(true);
  });
  it('rejects duplicate field IDs and workflow branches that can loop', () => {
    expect(
      FormSchema.safeParse({
        name: 'Form',
        fields: [
          { id: 'same', label: 'One' },
          { id: 'same', label: 'Two' },
        ],
      }).success,
    ).toBe(false);
    expect(
      WorkflowSchema.safeParse({
        name: 'Loop',
        trigger: 'manual',
        steps: [
          { type: 'branch', requiredRoleId: role, onMatch: 0, onMiss: 0 },
        ],
      }).success,
    ).toBe(false);
  });
  it('records a case pending until the worker confirms Discord delivery', async () => {
    const f = fixture();
    f.configurations['R26'] = { enabled: true };
    const result = await createModerationCase(f.ctx, {
      action: 'timeout',
      targetId: other,
      durationSeconds: 60,
      reason: 'Repeated rule violation',
      confirm: false,
    });
    expect(result.state).toBe('pending');
    expect(f.effects[0]).toMatchObject({
      type: 'safety.moderate',
      payload: { caseId: result.id, actorId: user },
    });
    expect(f.records.filter((r) => r.kind === 'moderation_case')).toHaveLength(
      1,
    );
  });
  it('keeps case numbering monotonic after retained cases are removed', async () => {
    const f = fixture();
    f.configurations['R26'] = { enabled: true };
    const first = await createModerationCase(f.ctx, {
      action: 'warn',
      targetId: other,
      reason: 'First warning',
      confirm: false,
    });
    f.records.splice(
      f.records.findIndex((r) => r.id === first.id),
      1,
    );
    const second = await createModerationCase(f.ctx, {
      action: 'warn',
      targetId: other,
      reason: 'Second warning',
      confirm: false,
    });
    expect(second.data).toMatchObject({ number: 2 });
  });
  it('persists five failed verification attempts and never emits a role grant', async () => {
    const f = fixture();
    f.configurations['R18'] = {
      enabled: true,
      roleId: role,
      rulesVersion: 1,
      rulesText: 'Be kind',
      challenge: 'arithmetic',
      minimumAccountAgeDays: 0,
      minimumMemberAgeMinutes: 0,
    };
    const challenge = (await f.call(
      safetyRoutes,
      'POST',
      '/verification/challenge',
    )) as { id: string };
    for (let attempt = 1; attempt <= 5; attempt++)
      expect(
        await f.call(safetyRoutes, 'POST', '/verification/verify', {
          rulesVersion: 1,
          acknowledge: true,
          challengeId: challenge.id,
          answer: '0',
        }),
      ).toMatchObject({ verified: false, remainingAttempts: 5 - attempt });
    await expect(
      f.call(safetyRoutes, 'POST', '/verification/verify', {
        rulesVersion: 1,
        acknowledge: true,
        challengeId: challenge.id,
        answer: '0',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(f.effects).toHaveLength(0);
    expect(f.records.find((r) => r.id === challenge.id)?.state).toBe('failed');
  });
  it('never allows a submitter to decide their own application', async () => {
    const f = fixture();
    f.records.push({
      id: '00000000-0000-4000-8000-000000000001',
      guildId: guild,
      kind: 'application',
      key: 'application',
      ownerId: user,
      state: 'submitted',
      revision: 1,
      data: {
        snapshot: {
          name: 'Application',
          fields: [{ id: 'why', label: 'Why' }],
        },
        stage: 0,
      },
      createdAt: f.ctx.now,
      updatedAt: f.ctx.now,
    });
    await expect(
      f.call(
        safetyRoutes,
        'POST',
        '/applications/:id/review',
        { expectedRevision: 1, decision: 'accept', reason: 'Approved' },
        { id: f.records[0]!.id },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.effects).toHaveLength(0);
  });
});

describe('time and authentic invite observations', () => {
  it('resolves daylight-saving gaps and repeated times explicitly', () => {
    expect(
      localInstant(
        { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-03-08T07:00:00.000Z');
    expect(
      localInstant(
        { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z');
  });
  it('runs a daily recurrence once during a repeated hour', () => {
    expect(
      nextRecurringInstant(
        new Date('2026-11-01T05:31:00Z'),
        'America/New_York',
        { type: 'daily', hour: 1, minute: 30 },
      )?.toISOString(),
    ).toBe('2026-11-02T06:30:00.000Z');
  });
  it('validates dates and supports explicit leap-day policy without collecting birth years', () => {
    expect(
      BirthdaySchema.safeParse({ month: 2, day: 30, timezone: 'UTC' }).success,
    ).toBe(false);
    const leap = BirthdaySchema.parse({
      month: 2,
      day: 29,
      timezone: 'Asia/Ho_Chi_Minh',
      leapDayPolicy: 'leap_only',
    });
    expect(
      nextBirthdayInstant(new Date('2026-10-11T00:00:00Z'), leap).toISOString(),
    ).toBe('2028-02-29T02:00:00.000Z');
  });
  const invite = {
    type: 'invite_join' as const,
    id: 'join-1',
    userId: user,
    joinedAt: '2026-10-11T00:00:00Z',
    accountCreatedAt: '2025-01-01T00:00:00Z',
    before: [{ code: 'abc', uses: 1, inviterId: other }],
    after: [{ code: 'abc', uses: 2, inviterId: other }],
    canReadInvites: true,
    simultaneousJoins: 1,
    vanityChanged: false,
    snapshotComplete: true,
  };
  it('rewards only unique observed invite changes and labels missing or ambiguous evidence', () => {
    expect(attributeInvite(invite)).toMatchObject({
      status: 'confirmed',
      inviterId: other,
    });
    expect(attributeInvite({ ...invite, simultaneousJoins: 2 }).status).toBe(
      'ambiguous',
    );
    expect(attributeInvite({ ...invite, canReadInvites: false }).status).toBe(
      'unknown',
    );
    expect(attributeInvite({ ...invite, after: [] }).status).toBe('ambiguous');
    expect(
      attributeInvite({
        ...invite,
        after: [{ code: 'abc', uses: 4, inviterId: other }],
      }).status,
    ).toBe('ambiguous');
  });
});

describe('persisted automation and cancellation', () => {
  it('rejects role-ineligible poll votes and out-of-range ballots', async () => {
    const f = fixture();
    f.configurations['R33'] = { enabled: true };
    const poll = (await f.call(automationRoutes, 'POST', '/polls', {
      question: 'Choose',
      choices: ['One', 'Two'],
      requiredRoleIds: [role],
      endsAt: '2026-10-12T00:00:00Z',
    })) as Entry;
    await expect(
      f.call(
        automationRoutes,
        'POST',
        '/polls/:id/votes',
        { choices: [0] },
        { id: poll.id },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    f.ctx.actor.roles = [role];
    await expect(
      f.call(
        automationRoutes,
        'POST',
        '/polls/:id/votes',
        { choices: [2] },
        { id: poll.id },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await f.call(
      automationRoutes,
      'POST',
      '/polls/:id/votes',
      { choices: [1] },
      { id: poll.id },
    );
    expect(f.records.filter((r) => r.kind === 'poll_vote')).toHaveLength(1);
  });
  it('prevents a cancelled queued reminder from delivering and rejects a stranger cancellation', async () => {
    const f = fixture();
    f.configurations['R66'] = { enabled: true };
    const reminder = (await f.call(automationRoutes, 'POST', '/reminders', {
      text: 'Remember',
      destination: { type: 'dm' },
      timezone: 'UTC',
      dueAt: '2026-10-12T00:00:00Z',
    })) as Entry;
    f.ctx.actor.userId = other;
    await expect(
      f.call(
        automationRoutes,
        'POST',
        '/reminders/:id/cancel',
        { expectedRevision: 1 },
        { id: reminder.id },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    f.ctx.actor.userId = user;
    await f.call(
      automationRoutes,
      'POST',
      '/reminders/:id/cancel',
      { expectedRevision: 1 },
      { id: reminder.id },
    );
    expect(
      await processAutomationDue(f.ctx, 'automation.due', {
        kind: 'reminder',
        id: reminder.id,
        revision: 1,
      }),
    ).toMatchObject({ ignored: true });
    expect(
      await guardAutomationEffect(f.ctx, {
        recordId: reminder.id,
        featureId: 'R66',
      }),
    ).toMatchObject({ deliver: false });
    expect(f.effects.filter((e) => e.type === 'automation.send')).toHaveLength(
      0,
    );
  });
  it('skips overdue recurring messages under skip policy and schedules the next durable occurrence', async () => {
    const f = fixture();
    f.configurations['R66'] = { enabled: true };
    const reminder = (await f.call(automationRoutes, 'POST', '/reminders', {
      text: 'Remember',
      destination: { type: 'dm' },
      timezone: 'UTC',
      dueAt: '2026-10-12T00:00:00Z',
      recurrence: { type: 'daily', hour: 0, minute: 0 },
      misfire: 'skip',
    })) as Entry;
    f.ctx.now = new Date('2026-10-12T01:00:00Z');
    await processAutomationDue(f.ctx, 'automation.due', {
      kind: 'reminder',
      id: reminder.id,
      revision: 1,
    });
    expect(f.effects.filter((e) => e.type === 'automation.send')).toHaveLength(
      0,
    );
    expect(f.effects.at(-1)?.dueAt?.toISOString()).toBe(
      '2026-10-13T00:00:00.000Z',
    );
    expect(f.records.find((r) => r.id === reminder.id)?.data).toMatchObject({
      lastMisfire: 'skipped',
    });
  });
  it('advances one workflow step only after delivery and ignores repeated completion', async () => {
    const f = fixture();
    f.configurations['R45'] = { enabled: true };
    const workflow = (await f.call(automationRoutes, 'POST', '/workflows', {
      name: 'Workflow',
      trigger: 'manual',
      steps: [
        { type: 'send', channelId: guild, text: 'First' },
        { type: 'send', channelId: guild, text: 'Second' },
      ],
    })) as Entry;
    await f.call(
      automationRoutes,
      'POST',
      '/workflows/:id/execute',
      {},
      { id: workflow.id },
    );
    expect(f.effects.filter((e) => e.type === 'automation.send')).toHaveLength(
      1,
    );
    const first = f.effects[0]!.payload;
    await completeAutomationEffect(f.ctx, first, {
      success: true,
      messageId: guild,
    });
    expect(f.effects.filter((e) => e.type === 'automation.send')).toHaveLength(
      2,
    );
    await completeAutomationEffect(f.ctx, first, {
      success: true,
      messageId: guild,
    });
    expect(f.effects.filter((e) => e.type === 'automation.send')).toHaveLength(
      2,
    );
  });
  it('stops a workflow at its declared action budget without replaying the first delivery', async () => {
    const f = fixture();
    f.configurations['R45'] = { enabled: true };
    const workflow = (await f.call(automationRoutes, 'POST', '/workflows', {
      name: 'Budgeted',
      trigger: 'manual',
      maxActions: 1,
      steps: [
        { type: 'send', channelId: guild, text: 'First' },
        { type: 'send', channelId: guild, text: 'Second' },
      ],
    })) as Entry;
    await f.call(
      automationRoutes,
      'POST',
      '/workflows/:id/execute',
      {},
      { id: workflow.id },
    );
    await completeAutomationEffect(f.ctx, f.effects[0]!.payload, {
      success: true,
    });
    expect(f.effects.filter((e) => e.type === 'automation.send')).toHaveLength(
      1,
    );
    expect(f.records.find((r) => r.kind === 'workflow_run')?.state).toBe(
      'failed',
    );
  });
  it('checks channel ownership even when a voice action names a valid room', async () => {
    const f = fixture();
    f.configurations['R39'] = { enabled: true };
    f.records.push({
      id: '00000000-0000-4000-8000-000000000001',
      guildId: guild,
      kind: 'voice_room',
      key: 'room',
      ownerId: user,
      state: 'active',
      revision: 1,
      data: { channelId: guild },
      createdAt: f.ctx.now,
      updatedAt: f.ctx.now,
    });
    await expect(
      guardAutomationEffect(f.ctx, {
        recordId: f.records[0]!.id,
        featureId: 'R39',
        channelId: other,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
