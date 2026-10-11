import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, json } from '@sparko/db';
import type { Actor } from '@sparko/contracts';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import {
  Platform,
  jsonObject,
  type DomainRoute,
  type DomainContext,
} from './core.js';
import {
  safetyRoutes,
  ingestSafetyEvent,
  processSafetyDue,
  canExpireTimeout,
} from './safety.js';
import {
  automationRoutes,
  guardAutomationEffect,
  processAutomationDue,
  completeAutomationEffect,
  nextRecurringInstant,
} from './automation.js';
const db = createDatabase(testDatabaseUrl()),
  platform = new Platform(db);
const guildId = '623456789012345671',
  otherGuildId = '623456789012345672';
const userId = '623456789012345673',
  otherId = '623456789012345674',
  thirdId = '623456789012345675',
  roleId = '623456789012345676',
  channelId = '623456789012345677';
const actor = (id = userId, target = guildId): Actor => ({
  userId: id,
  guildId: target,
  roles: [],
  isAdmin: false,
  isOwner: false,
  capabilities: [],
  globalCapabilities: [],
});
const admin = (id = userId): Actor => ({ ...actor(id), isAdmin: true });
const future = (hours = 1) =>
  new Date(Date.now() + hours * 3600000).toISOString();
function route(method: DomainRoute['method'], path: string) {
  const selected = [...safetyRoutes, ...automationRoutes].find(
    (r) => r.method === method && r.path === `/guilds/:guildId${path}`,
  );
  if (!selected) throw Error(`No domain route ${method} ${path}`);
  return selected;
}
const call = (
  who: Actor,
  method: DomainRoute['method'],
  path: string,
  input: unknown,
  key: string,
  params: Record<string, string> = {},
) => platform.route(who, route(method, path), input, params, key);
const mutate = (
  who: Actor,
  key: string,
  handler: (ctx: DomainContext) => Promise<unknown>,
) => platform.mutate(who, 'safety-time-integration', key, { key }, handler);
async function configs(overrides: Record<string, unknown> = {}) {
  for (const [featureId, config] of Object.entries({
    R18: {
      enabled: true,
      roleId,
      rulesVersion: 1,
      rulesText: 'Respect community rules',
      challenge: 'acknowledge',
    },
    R25: { enabled: true },
    R26: { enabled: true },
    R27: {
      enabled: true,
      mode: 'observe',
      rules: [
        {
          id: 'keyword',
          name: 'Keyword',
          kind: 'keywords',
          keywords: ['blocked literal'],
          action: 'timeout',
        },
      ],
    },
    R30: { enabled: true, maxOpenPerMember: 3 },
    R33: { enabled: true },
    R37: { enabled: true },
    R38: { enabled: true },
    R39: { enabled: true, lobbyChannelId: channelId },
    R42: { enabled: true },
    R43: { enabled: true },
    R44: { enabled: true },
    R45: { enabled: true },
    R46: { enabled: true },
    R66: { enabled: true, maximumActive: 10 },
    ...overrides,
  }))
    await db.featureConfig.create({
      data: { guildId, featureId, config: json(config) },
    });
}
beforeAll(async () => {
  for (const id of [guildId, otherGuildId])
    await db.guild.upsert({
      where: { id },
      create: { id, name: 'Disposable safety/time test', installed: true },
      update: {},
    });
});
beforeEach(async () => {
  for (const id of [guildId, otherGuildId]) {
    await db.outbox.deleteMany({ where: { guildId: id } });
    await db.auditLog.deleteMany({ where: { guildId: id } });
    await db.operation.deleteMany({ where: { guildId: id } });
    await db.record.deleteMany({ where: { guildId: id } });
    await db.featureConfig.deleteMany({ where: { guildId: id } });
  }
  await configs();
});
afterAll(async () => {
  await db.guild.deleteMany({ where: { id: { in: [guildId, otherGuildId] } } });
  await db.$disconnect();
});

describe('real PostgreSQL safety/time transactions and authority', () => {
  it('serializes the final RSVP place and promotes exactly one waitlisted member after a departure', async () => {
    const created = await call(
      admin(),
      'POST',
      '/events',
      {
        title: 'One place',
        startsAt: future(1),
        endsAt: future(2),
        timezone: 'Asia/Ho_Chi_Minh',
        capacity: 1,
      },
      'event-create',
    );
    const event = created.data as { id: string };
    await Promise.all(
      [userId, otherId, thirdId].map((id, i) =>
        call(
          actor(id),
          'POST',
          '/events/:id/rsvp',
          { choice: 'attending' },
          `rsvp-${i}`,
          { id: event.id },
        ),
      ),
    );
    const all = await db.record.findMany({ where: { guildId, kind: 'rsvp' } });
    expect(all.filter((r) => r.state === 'attending')).toHaveLength(1);
    expect(all.filter((r) => r.state === 'waitlist')).toHaveLength(2);
    const confirmed = all.find((r) => r.state === 'attending')!;
    await call(
      actor(confirmed.ownerId!),
      'POST',
      '/events/:id/rsvp',
      { choice: 'declined' },
      'rsvp-departure',
      { id: event.id },
    );
    expect(
      await db.record.count({
        where: { guildId, kind: 'rsvp', state: 'attending' },
      }),
    ).toBe(1);
    expect(
      await db.record.count({
        where: { guildId, kind: 'rsvp', state: 'waitlist' },
      }),
    ).toBe(1);
    expect(
      await db.outbox.count({ where: { guildId, type: 'automation.send' } }),
    ).toBe(1);
  });
  it('persists one role-qualified ballot per member, replaces it atomically, and rejects invalid limits', async () => {
    const poll = (
      await call(
        admin(),
        'POST',
        '/polls',
        {
          question: 'Choose two',
          choices: ['A', 'B', 'C'],
          maxSelections: 2,
          requiredRoleIds: [roleId],
          endsAt: future(),
          resultsVisibility: 'manager',
        },
        'poll-create',
      )
    ).data as { id: string };
    await expect(
      call(
        actor(),
        'POST',
        '/polls/:id/votes',
        { choices: [0] },
        'poll-ineligible',
        { id: poll.id },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const eligible = { ...actor(), roles: [roleId] };
    await expect(
      call(
        eligible,
        'POST',
        '/polls/:id/votes',
        { choices: [0, 1, 2] },
        'poll-too-many',
        { id: poll.id },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await Promise.all(
      [[0, 1], [2]].map((choices, i) =>
        call(
          eligible,
          'POST',
          '/polls/:id/votes',
          { choices },
          `poll-vote-${i}`,
          { id: poll.id },
        ),
      ),
    );
    expect(
      await db.record.count({ where: { guildId, kind: 'poll_vote' } }),
    ).toBe(1);
    const memberView = (await call(eligible, 'GET', '/polls', {}, 'unused'))
      .data as { results: unknown; myVote: number[] }[];
    expect(memberView[0]?.results).toBeNull();
    expect(memberView[0]?.myVote.length).toBeGreaterThan(0);
    const staffView = (await call(admin(), 'GET', '/polls', {}, 'unused'))
      .data as { voterCount: number }[];
    expect(staffView[0]?.voterCount).toBe(1);
  });
  it('forbids member channel reminders, keeps DMs actor-owned, and stops queued effects after cancellation', async () => {
    await expect(
      call(
        actor(),
        'POST',
        '/reminders',
        {
          text: 'Restricted',
          destination: { type: 'channel', channelId },
          timezone: 'UTC',
          dueAt: future(),
        },
        'reminder-channel',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const reminder = (
      await call(
        actor(),
        'POST',
        '/reminders',
        {
          text: 'Private',
          destination: { type: 'dm' },
          timezone: 'UTC',
          dueAt: future(),
        },
        'reminder-dm',
      )
    ).data as { id: string; revision: number };
    await expect(
      call(
        actor(otherId),
        'POST',
        '/reminders/:id/cancel',
        { expectedRevision: 1 },
        'wrong-cancel',
        { id: reminder.id },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await call(
      actor(),
      'POST',
      '/reminders/:id/cancel',
      { expectedRevision: 1 },
      'cancel',
      { id: reminder.id },
    );
    const due = await mutate(admin(), 'obsolete-timer', (ctx) =>
      processAutomationDue(ctx, 'automation.due', {
        kind: 'reminder',
        id: reminder.id,
        revision: 1,
      }),
    );
    expect(due.data).toMatchObject({ ignored: true });
    const guard = await platform.read(admin(), (ctx) =>
      guardAutomationEffect(ctx, { recordId: reminder.id, featureId: 'R66' }),
    );
    expect(guard).toMatchObject({ deliver: false });
    expect(
      await db.outbox.count({ where: { guildId, type: 'automation.send' } }),
    ).toBe(0);
  });
  it('cannot turn an independent form-review grant into moderation execution', async () => {
    const reviewer = { ...actor(otherId), capabilities: ['forms.review'] };
    await expect(
      call(
        reviewer,
        'POST',
        '/cases',
        { action: 'warn', targetId: userId, reason: 'Unauthorized escalation' },
        'reviewer-warning',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      await db.record.count({ where: { guildId, kind: 'moderation_case' } }),
    ).toBe(0);
    expect(await db.operation.count({ where: { guildId } })).toBe(0);
  });
  it('keeps reports private to their submitter and authorized reviewers across tenants', async () => {
    const report = (
      await call(
        actor(),
        'POST',
        '/reports',
        {
          subject: 'Member concern',
          description: 'Private evidence that must remain scoped',
          targetId: otherId,
        },
        'report-create',
      )
    ).data as { id: string };
    const own = (await call(actor(), 'GET', '/reports', {}, 'unused'))
      .data as unknown[];
    expect(own).toHaveLength(1);
    expect(
      (await call(actor(otherId), 'GET', '/reports', {}, 'unused')).data,
    ).toEqual([]);
    expect(
      (
        await call(
          { ...actor(otherId), capabilities: ['reports.review'] },
          'GET',
          '/reports',
          {},
          'unused',
        )
      ).data,
    ).toHaveLength(1);
    expect(
      (await call(actor(userId, otherGuildId), 'GET', '/reports', {}, 'unused'))
        .data,
    ).toEqual([]);
    await expect(
      call(
        { ...actor(otherId), capabilities: ['reports.review'] },
        'POST',
        '/appeals/:id/decision',
        { expectedRevision: 1, decision: 'accepted', reason: 'Wrong resource' },
        'wrong-intake',
        { id: report.id },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('freezes form versions in applications and allows exactly one final review under concurrency', async () => {
    const form = (
      await call(
        admin(),
        'POST',
        '/forms',
        {
          form: {
            name: 'Staff application',
            fields: [{ id: 'why', label: 'Why join?', maxLength: 50 }],
            stages: ['Review'],
          },
        },
        'form-create',
      )
    ).data as { id: string; revision: number };
    const published = (
      await call(
        admin(),
        'POST',
        '/forms/:id/publish',
        { expectedRevision: 1 },
        'form-publish',
        { id: form.id },
      )
    ).data as { revision: number };
    const application = (
      await call(
        actor(otherId),
        'POST',
        '/forms/:id/submissions',
        { answers: { why: 'Help the community' } },
        'application-create',
        { id: form.id },
      )
    ).data as { id: string; revision: number };
    await call(
      admin(),
      'PUT',
      '/forms/:id',
      {
        expectedRevision: published.revision,
        form: {
          name: 'New application',
          fields: [{ id: 'different', label: 'Different question' }],
        },
      },
      'form-change',
      { id: form.id },
    );
    const stored = await db.record.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(jsonObject(jsonObject(stored.data)['snapshot'])['name']).toBe(
      'Staff application',
    );
    expect(jsonObject(stored.data)['answers']).toEqual({
      why: 'Help the community',
    });
    const reviewers = [
      { ...actor(userId), capabilities: ['forms.review'] },
      { ...actor(thirdId), capabilities: ['forms.review'] },
    ];
    const decisions = await Promise.allSettled(
      reviewers.map((r, i) =>
        call(
          r,
          'POST',
          '/applications/:id/review',
          {
            expectedRevision: application.revision,
            decision: i === 0 ? 'accept' : 'reject',
            reason: 'Considered evidence',
          },
          `review-${i}`,
          { id: application.id },
        ),
      ),
    );
    expect(decisions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const updated = await db.record.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(['accepted', 'rejected']).toContain(updated.state);
    expect(updated.revision).toBe(2);
    expect(
      await db.outbox.count({ where: { guildId, type: 'safety.notify' } }),
    ).toBe(1);
  });
  it('runs simulations and observed Gateway matches without creating punishments', async () => {
    const result = await call(
      admin(),
      'POST',
      '/safety/test',
      {
        rule: {
          id: 'test',
          name: 'Literal',
          kind: 'keywords',
          keywords: ['blocked literal'],
          action: 'timeout',
        },
        message: { content: 'blocked literal' },
      },
      'simulate',
    );
    expect(result.data).toMatchObject({
      simulation: true,
      matched: true,
      effects: [],
    });
    const event = {
      type: 'message',
      id: '623456789012345680',
      userId: otherId,
      channelId,
      roleIds: [],
      bot: false,
      webhook: false,
      content: 'blocked literal',
      mentionCount: 0,
      attachmentCount: 0,
      at: new Date().toISOString(),
    };
    await Promise.all(
      [0, 1].map((i) =>
        mutate(admin(), `observe-${i}`, (ctx) => ingestSafetyEvent(ctx, event)),
      ),
    );
    expect(
      await db.record.count({
        where: { guildId, kind: 'safety_incident', state: 'observed' },
      }),
    ).toBe(1);
    expect(
      await db.record.count({ where: { guildId, kind: 'moderation_case' } }),
    ).toBe(0);
    expect(
      await db.outbox.count({ where: { guildId, type: 'safety.moderate' } }),
    ).toBe(0);
  });
  it('cancels a workflow before its already queued next delivery and never repeats a settled step', async () => {
    const workflow = (
      await call(
        admin(),
        'POST',
        '/workflows',
        {
          name: 'Two deliveries',
          trigger: 'manual',
          steps: [
            { type: 'send', channelId, text: 'First' },
            { type: 'send', channelId, text: 'Second' },
          ],
        },
        'workflow-create',
      )
    ).data as { id: string };
    const run = (
      await call(
        admin(),
        'POST',
        '/workflows/:id/execute',
        {},
        'workflow-execute',
        { id: workflow.id },
      )
    ).data as { id: string };
    const first = await db.outbox.findFirstOrThrow({
      where: { guildId, type: 'automation.send' },
    });
    await mutate(admin(), 'first-delivered', (ctx) =>
      completeAutomationEffect(ctx, first.payload, {
        success: true,
        messageId: '623456789012345681',
      }),
    );
    await mutate(admin(), 'first-delivered-retry', (ctx) =>
      completeAutomationEffect(ctx, first.payload, {
        success: true,
        messageId: '623456789012345681',
      }),
    );
    expect(
      await db.outbox.count({ where: { guildId, type: 'automation.send' } }),
    ).toBe(2);
    const current = await db.record.findUniqueOrThrow({
      where: { id: run.id },
    });
    await call(
      admin(),
      'POST',
      '/workflow-runs/:id/cancel',
      { expectedRevision: current.revision },
      'workflow-cancel',
      { id: run.id },
    );
    const second = await db.outbox.findFirstOrThrow({
      where: { guildId, type: 'automation.send', id: { not: first.id } },
    });
    expect(
      await platform.read(admin(), (ctx) =>
        guardAutomationEffect(ctx, second.payload),
      ),
    ).toMatchObject({ deliver: false });
    expect(
      await db.record.count({
        where: { guildId, kind: 'workflow_step', state: 'applied' },
      }),
    ).toBe(1);
  });
  it('never lets an old punishment expiry clear a newer timeout instance', async () => {
    const first = (
      await call(
        admin(),
        'POST',
        '/cases',
        {
          action: 'timeout',
          targetId: otherId,
          durationSeconds: 60,
          reason: 'First timeout',
        },
        'timeout-first',
      )
    ).data as { id: string };
    const second = (
      await call(
        admin(),
        'POST',
        '/cases',
        {
          action: 'timeout',
          targetId: otherId,
          durationSeconds: 120,
          reason: 'Replacement timeout',
        },
        'timeout-second',
      )
    ).data as { id: string };
    const firstEffect = await db.outbox.findFirstOrThrow({
      where: {
        guildId,
        type: 'safety.moderate',
        payload: { path: ['caseId'], equals: first.id },
      },
    });
    const secondEffect = await db.outbox.findFirstOrThrow({
      where: {
        guildId,
        type: 'safety.moderate',
        payload: { path: ['caseId'], equals: second.id },
      },
    });
    const firstUntil = new Date(Date.now() - 60000).toISOString(),
      secondUntil = new Date(Date.now() - 1000).toISOString();
    for (const [caseId, instanceId, until] of [
      [first.id, firstEffect.id, firstUntil],
      [second.id, secondEffect.id, secondUntil],
    ] as const) {
      const record = await db.record.findUniqueOrThrow({
        where: { id: caseId },
      });
      await db.record.update({
        where: { id: caseId },
        data: {
          state: 'active',
          data: json({
            ...jsonObject(record.data),
            instanceId,
            appliedTimeoutUntil: until,
            delivery: 'applied',
          }),
        },
      });
    }
    await db.record.create({
      data: {
        guildId,
        kind: 'safety.punishment',
        key: `timeout:${otherId}`,
        ownerId: otherId,
        state: 'active',
        data: {
          activeCaseId: second.id,
          instanceId: secondEffect.id,
          appliedTimeoutUntil: secondUntil,
        },
      },
    });
    const old = await mutate(admin(), 'old-timeout-expiry', (ctx) =>
      processSafetyDue(ctx, 'safety.timeout.expire', {
        caseId: first.id,
        instanceId: firstEffect.id,
        userId: otherId,
        appliedTimeoutUntil: firstUntil,
      }),
    );
    expect(old.data).toMatchObject({ ignored: true });
    expect(
      await db.outbox.count({
        where: { guildId, type: 'safety.timeout.clear' },
      }),
    ).toBe(0);
    expect(canExpireTimeout(first.id, second.id, firstUntil, secondUntil)).toBe(
      false,
    );
    const current = await mutate(admin(), 'current-timeout-expiry', (ctx) =>
      processSafetyDue(ctx, 'safety.timeout.expire', {
        caseId: second.id,
        instanceId: secondEffect.id,
        userId: otherId,
        appliedTimeoutUntil: secondUntil,
      }),
    );
    expect(current.data).toMatchObject({ expiryQueued: true });
    await mutate(admin(), 'current-timeout-expiry-retry', (ctx) =>
      processSafetyDue(ctx, 'safety.timeout.expire', {
        caseId: second.id,
        instanceId: secondEffect.id,
        userId: otherId,
        appliedTimeoutUntil: secondUntil,
      }),
    );
    expect(
      await db.outbox.count({
        where: { guildId, type: 'safety.timeout.clear' },
      }),
    ).toBe(1);
    expect(
      canExpireTimeout(
        second.id,
        second.id,
        secondUntil,
        new Date(Date.parse(secondUntil)).toISOString(),
      ),
    ).toBe(true);
    expect(
      canExpireTimeout(
        second.id,
        second.id,
        secondUntil,
        new Date(Date.parse(secondUntil) + 1000).toISOString(),
      ),
    ).toBe(false);
  });

  it('persists UTC timer instants and moves to the next local day through a DST fold', async () => {
    const reminder = (
      await call(
        actor(),
        'POST',
        '/reminders',
        {
          text: 'Daily time',
          destination: { type: 'dm' },
          timezone: 'America/New_York',
          dueAt: future(),
          recurrence: { type: 'daily', hour: 1, minute: 30 },
        },
        'dst-reminder',
      )
    ).data as { id: string };
    const queued = await db.outbox.findFirstOrThrow({
      where: { guildId, type: 'automation.due' },
    });
    expect(queued.dueAt.toISOString()).toBe(
      String(
        jsonObject(
          (await db.record.findUniqueOrThrow({ where: { id: reminder.id } }))
            .data,
        )['nextAt'],
      ),
    );
    expect(
      nextRecurringInstant(
        new Date('2026-11-01T05:31:00Z'),
        'America/New_York',
        { type: 'daily', hour: 1, minute: 30 },
      )?.toISOString(),
    ).toBe('2026-11-02T06:30:00.000Z');
  });
});
