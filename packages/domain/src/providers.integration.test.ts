import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createDatabase, json } from '@sparko/db';
import type { Actor } from '@sparko/contracts';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import { Platform, type DomainContext, type DomainRoute } from './core.js';
import {
  acceptExternalEvent,
  applyBillingObservation,
  applySourceEvents,
  completeAiRequest,
  effectivePlan,
  prepareAiRequest,
  loadPreparedAiRequest,
  providerRoutes,
  reserveSourcePoll,
  runProviderJob,
  type StripeEvent,
} from './providers.js';

const db = createDatabase(testDatabaseUrl()),
  platform = new Platform(db);
const guildId = '323456789012345671',
  otherGuildId = '323456789012345672',
  memberId = '323456789012345673',
  otherId = '323456789012345674',
  channelId = '323456789012345675';
const actor = (userId = memberId, target = guildId): Actor => ({
  userId,
  guildId: target,
  roles: [],
  isAdmin: false,
  isOwner: false,
  capabilities: [],
  globalCapabilities: [],
});
const manager = (): Actor => ({ ...actor(), isAdmin: true });
const mutate = (
  key: string,
  handler: (ctx: DomainContext) => Promise<unknown>,
  who = manager(),
) => platform.mutate(who, 'provider-integration', key, { key }, handler);
function route(method: DomainRoute['method'], path: string) {
  const selected = providerRoutes.find(
    (r) => r.method === method && r.path === `/guilds/:guildId${path}`,
  );
  if (!selected) throw Error(`Missing route ${path}`);
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
async function record(
  kind: string,
  key: string,
  data: unknown,
  state = 'active',
  ownerId = memberId,
) {
  return db.record.create({
    data: { guildId, kind, key, data: json(data), state, ownerId },
  });
}
async function config(featureId: string, data: unknown) {
  await db.featureConfig.upsert({
    where: { guildId_featureId: { guildId, featureId } },
    create: { guildId, featureId, config: json(data) },
    update: { config: json(data) },
  });
}
async function cleanup() {
  for (const id of [guildId, otherGuildId]) {
    await db.outbox.deleteMany({ where: { guildId: id } });
    await db.auditLog.deleteMany({ where: { guildId: id } });
    await db.operation.deleteMany({ where: { guildId: id } });
    await db.record.deleteMany({ where: { guildId: id } });
    await db.featureConfig.deleteMany({ where: { guildId: id } });
  }
}
beforeAll(async () => {
  for (const id of [guildId, otherGuildId])
    await db.guild.upsert({
      where: { id },
      create: { id, name: 'Disposable provider test', installed: true },
      update: {},
    });
});
beforeEach(async () => {
  await cleanup();
  vi.stubEnv('OPENAI_API_KEY', 'fixture-only');
  vi.stubEnv('OPENAI_MODEL', 'fixture-model');
  vi.stubEnv('MUSIC_RUNTIME_ENABLED', 'false');
  for (const [featureId, settings] of Object.entries({
    R47: { enabled: true },
    R65: {
      enabled: true,
      dataSharingAcknowledged: true,
      purposes: ['message-draft', 'ticket-summary'],
    },
    R69: { enabled: true },
    R64: { enabled: true },
  }))
    await config(featureId, settings);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanup();
  await db.guild.deleteMany({ where: { id: { in: [guildId, otherGuildId] } } });
  await db.$disconnect();
});

describe('PostgreSQL verified provider events and quota state', () => {
  it('deduplicates concurrent webhook receipts and rejects reused IDs with changed content', async () => {
    const integration = await record('webhook.integration', 'releases', {
      name: 'Releases',
      channelId,
      allowedEvents: ['release'],
    });
    const event = {
      eventId: 'release:1',
      eventType: 'release',
      timestamp: new Date().toISOString(),
      title: 'Release 1',
      text: 'Changes',
      url: 'https://example.com/1',
    };
    await Promise.all(
      [0, 1, 2].map((i) =>
        mutate(`webhook:${i}`, (ctx) =>
          acceptExternalEvent(ctx, integration.id, event),
        ),
      ),
    );
    expect(
      await db.record.count({ where: { guildId, kind: 'webhook.event' } }),
    ).toBe(1);
    expect(
      await db.outbox.count({
        where: { guildId, type: 'provider.announcement' },
      }),
    ).toBe(1);
    await expect(
      mutate('webhook-changed', (ctx) =>
        acceptExternalEvent(ctx, integration.id, {
          ...event,
          text: 'Different content',
        }),
      ),
    ).rejects.toThrow('different content');
  });

  it('rejects expired, revoked, unsupported, and cross-tenant integrations without effects', async () => {
    const integration = await record(
      'webhook.integration',
      'private-releases',
      { name: 'Releases', channelId, allowedEvents: ['release'] },
    );
    const event = {
      eventId: 'release:1',
      eventType: 'release',
      timestamp: new Date().toISOString(),
      title: 'Release 1',
      text: 'Changes',
    };
    await expect(
      mutate('wrong-type', (ctx) =>
        acceptExternalEvent(ctx, integration.id, {
          ...event,
          eventType: 'deployment',
        }),
      ),
    ).rejects.toThrow('does not accept');
    await expect(
      mutate('old-event', (ctx) =>
        acceptExternalEvent(ctx, integration.id, {
          ...event,
          timestamp: new Date(Date.now() - 301_000).toISOString(),
        }),
      ),
    ).rejects.toThrow('expired');
    await db.featureConfig.create({
      data: {
        guildId: otherGuildId,
        featureId: 'R69',
        config: { enabled: true },
      },
    });
    await expect(
      mutate(
        'wrong-tenant',
        (ctx) => acceptExternalEvent(ctx, integration.id, event),
        actor(memberId, otherGuildId),
      ),
    ).rejects.toThrow('unavailable');
    await db.record.update({
      where: { id: integration.id },
      data: { state: 'revoked' },
    });
    await expect(
      mutate('revoked', (ctx) =>
        acceptExternalEvent(ctx, integration.id, event),
      ),
    ).rejects.toThrow('does not accept');
    expect(await db.outbox.count({ where: { guildId } })).toBe(0);
  });

  it('baseline polls suppress old alerts and repeats cannot consume another event budget', async () => {
    await config('R47', { enabled: true, eventsPerDay: 1 });
    const source = await record('social.source', 'github', {
      provider: 'github',
      channelId,
      owner: 'sparko',
      repository: 'community',
      enabled: true,
      announceExisting: false,
    });
    const event = (id: string) => ({
      eventId: id,
      title: id,
      text: 'Release copy',
      url: `https://example.com/${id}`,
      publishedAt: null,
    });
    expect(
      await mutate('baseline', (ctx) =>
        applySourceEvents(ctx, source.id, source.revision, [event('old')]),
      ),
    ).toMatchObject({ data: { queued: 0, baseline: true } });
    await Promise.all(
      [0, 1].map((i) =>
        mutate(`new-poll:${i}`, (ctx) =>
          applySourceEvents(ctx, source.id, source.revision, [
            event('old'),
            event('new'),
            event('beyond-budget'),
          ]),
        ),
      ),
    );
    expect(
      await db.outbox.count({
        where: { guildId, type: 'provider.announcement' },
      }),
    ).toBe(1);
    expect(
      await db.record.count({ where: { guildId, kind: 'provider.event' } }),
    ).toBe(3);
    const skipped = await db.record.findFirstOrThrow({
      where: {
        guildId,
        kind: 'provider.event',
        data: { path: ['eventId'], equals: 'beyond-budget' },
      },
    });
    expect(skipped.data).toMatchObject({ delivery: 'budget-skipped' });
    await db.record.update({
      where: { id: source.id },
      data: { revision: { increment: 1 }, state: 'disabled' },
    });
    expect(
      await mutate('stale-source', (ctx) =>
        applySourceEvents(ctx, source.id, source.revision, [event('late')]),
      ),
    ).toMatchObject({ data: { superseded: true } });
  });

  it('reserves a configured source poll budget atomically under concurrency', async () => {
    await config('R47', { enabled: true, pollsPerDay: 2 });
    const source = await record('social.source', 'rss', {
      provider: 'rss',
      channelId,
      feedUrl: 'https://example.com/feed',
      enabled: true,
    });
    const polls = await Promise.allSettled(
      [0, 1, 2].map((i) =>
        mutate(`poll-reservation:${i}`, (ctx) =>
          reserveSourcePoll(ctx, source.id),
        ),
      ),
    );
    expect(polls.filter((p) => p.status === 'fulfilled')).toHaveLength(2);
    const budget = await db.record.findFirstOrThrow({
      where: { guildId, kind: 'social.poll-budget' },
    });
    expect(budget.data).toMatchObject({ count: 2 });
  });

  it('reserves AI quota once, withholds private prompts, and dispatches only one charged attempt', async () => {
    await config('R65', {
      enabled: true,
      dataSharingAcknowledged: true,
      purposes: ['message-draft'],
      callsPerDay: 1,
    });
    const attempts = await Promise.allSettled(
      [0, 1].map((i) =>
        call(
          actor(),
          'POST',
          '/ai/requests',
          {
            purpose: 'message-draft',
            prompt: 'Private draft material',
            dataSharingConsent: true,
          },
          `ai:${i}`,
        ),
      ),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const row = await db.record.findFirstOrThrow({
      where: { guildId, kind: 'ai.request' },
    });
    const preparations = await Promise.all(
      [0, 1].map((i) =>
        mutate(`ai-dispatch:${i}`, (ctx) => prepareAiRequest(ctx, row.id)),
      ),
    );
    expect(preparations.filter((p) => p.data !== null)).toHaveLength(1);
    const receipts = await db.operation.findMany({ where: { guildId } });
    expect(JSON.stringify(receipts)).not.toContain('Private draft material');
    expect(
      await mutate('ai-dispatch-after-timeout', (ctx) =>
        prepareAiRequest(ctx, row.id),
      ),
    ).toMatchObject({ data: null });
    const before = await call(actor(), 'GET', '/ai/requests/me', {}, '');
    expect(JSON.stringify(before.data)).not.toContain('Private draft material');
    await mutate('ai-complete', (ctx) =>
      completeAiRequest(ctx, row.id, {
        provider: 'OpenAI',
        model: 'fixture-model',
        responseId: 'resp_fixture',
        text: 'Human-reviewed draft',
        usage: null,
        actionsPerformed: false,
        requiresHumanReview: true,
      }),
    );
    expect(
      (await db.record.findUniqueOrThrow({ where: { id: row.id } })).data,
    ).toMatchObject({
      prompt: null,
      actionsPerformed: false,
      requiresHumanReview: true,
    });
    const other = await call(actor(otherId), 'GET', '/ai/requests/me', {}, '');
    expect(other.data).toEqual([]);
  });

  it('denies unconsented AI purposes and missing private ticket material before reserving quota', async () => {
    await config('R65', {
      enabled: true,
      dataSharingAcknowledged: false,
      purposes: ['message-draft'],
    });
    await expect(
      call(
        actor(),
        'POST',
        '/ai/requests',
        { purpose: 'message-draft', prompt: 'Draft', dataSharingConsent: true },
        'unconsented',
      ),
    ).rejects.toThrow('opt into');
    await config('R65', {
      enabled: true,
      dataSharingAcknowledged: true,
      purposes: ['ticket-summary'],
    });
    await expect(
      call(
        actor(),
        'POST',
        '/ai/requests',
        {
          purpose: 'ticket-summary',
          ticketId: 'another-ticket',
          prompt: 'Summary',
          dataSharingConsent: true,
        },
        'private-ticket',
      ),
    ).rejects.toThrow('cannot share');
    expect(
      await db.record.count({ where: { guildId, kind: 'ai.budget' } }),
    ).toBe(0);
  });

  it('rechecks request-owner authority and sharing consent before dispatch', async () => {
    const requested = await call(
      actor(),
      'POST',
      '/ai/requests',
      {
        purpose: 'message-draft',
        prompt: 'Private text',
        dataSharingConsent: true,
      },
      'pending-ai',
    );
    const id = (requested.data as { id: string }).id;
    await expect(
      mutate(
        'wrong-ai-owner',
        (ctx) => prepareAiRequest(ctx, id),
        actor(otherId),
      ),
    ).rejects.toThrow('request owner');
    await config('R65', {
      enabled: true,
      dataSharingAcknowledged: false,
      purposes: ['message-draft'],
    });
    await expect(
      mutate('disabled-sharing', (ctx) => prepareAiRequest(ctx, id), actor()),
    ).rejects.toThrow('disabled');
    expect(await db.record.findUniqueOrThrow({ where: { id } })).toMatchObject({
      state: 'pending',
    });
  });

  it('rechecks sharing opt-out between reservation and the outbound provider call', async () => {
    const requested = await call(
      actor(),
      'POST',
      '/ai/requests',
      {
        purpose: 'message-draft',
        prompt: 'Must remain private after opt-out',
        dataSharingConsent: true,
      },
      'reserved-optout',
    );
    const id = (requested.data as { id: string }).id;
    await mutate(
      'reserve-before-optout',
      (ctx) => prepareAiRequest(ctx, id),
      actor(),
    );
    await config('R65', {
      enabled: true,
      dataSharingAcknowledged: false,
      purposes: ['message-draft'],
    });
    await expect(
      platform.read(actor(), (ctx) => loadPreparedAiRequest(ctx, id)),
    ).rejects.toThrow('disabled');
    expect(await db.record.findUniqueOrThrow({ where: { id } })).toMatchObject({
      state: 'generating',
    });
  });

  it('deletes expired AI data without dispatching it and refuses fake music availability', async () => {
    await record(
      'ai.request',
      'expired',
      {
        purpose: 'message-draft',
        prompt: 'Expired private content',
        maxOutputTokens: 100,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
      'pending',
    );
    expect(
      await mutate('retention', (ctx) =>
        runProviderJob(ctx, 'provider.retention', {}),
      ),
    ).toMatchObject({ data: { deleted: 1 } });
    await expect(
      call(
        actor(),
        'POST',
        '/music/queue',
        {
          assetId: 'audio',
          voiceChannelId: channelId,
          rightsAcknowledged: true,
        },
        'unavailable-music',
      ),
    ).rejects.toThrow('unavailable');
    expect(
      await db.outbox.count({
        where: { guildId, type: 'provider.music.advance' },
      }),
    ).toBe(0);
  });
});

describe('PostgreSQL provider-verified commercial state', () => {
  const billingEnv = { STRIPE_PRICE_PLUS: 'price_plus' };
  async function checkout() {
    return record(
      'billing.intent',
      'authorized-checkout',
      { plan: 'plus', userId: memberId, guildId },
      'checkout-ready',
    );
  }
  function subscription(
    intentId: string,
    status: 'active' | 'past_due' | 'canceled' = 'active',
  ) {
    return {
      id: 'sub_test',
      status,
      metadata: { intentId, guildId, userId: memberId },
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 3600,
      items: {
        data: [
          { price: { id: 'price_plus', currency: 'usd', unit_amount: 500 } },
        ],
      },
    };
  }
  function event(
    id: string,
    created: number,
    type = 'customer.subscription.updated',
  ): StripeEvent {
    return {
      id: `evt_${id}`,
      type,
      created,
      livemode: false,
      data: { object: { id: 'sub_test' } },
    };
  }
  const plan = () => platform.read(manager(), effectivePlan);

  it('grants one scoped entitlement, handles duplicate callbacks, and revokes payment failures', async () => {
    const intent = await checkout(),
      observedAt = new Date().toISOString(),
      observation = {
        event: event('active', 100),
        subscription: subscription(intent.id),
        observedAt,
        revocation: null,
      };
    await Promise.all(
      [0, 1].map((i) =>
        mutate(`billing-active:${i}`, (ctx) =>
          applyBillingObservation(ctx, observation, billingEnv),
        ),
      ),
    );
    expect((await plan()).id).toBe('plus');
    expect(
      await db.record.count({ where: { guildId, kind: 'billing.event' } }),
    ).toBe(1);
    await expect(
      mutate('billing-payload-reuse', (ctx) =>
        applyBillingObservation(
          ctx,
          {
            ...observation,
            event: {
              ...observation.event,
              type: 'customer.subscription.deleted',
            },
          },
          billingEnv,
        ),
      ),
    ).rejects.toThrow('different content');
    await mutate('billing-failure', (ctx) =>
      applyBillingObservation(
        ctx,
        {
          event: event('failure', 200, 'invoice.payment_failed'),
          subscription: subscription(intent.id, 'past_due'),
          observedAt: new Date(Date.now() + 10).toISOString(),
          revocation: null,
        },
        billingEnv,
      ),
    );
    expect((await plan()).id).toBe('free');
    expect(
      (
        await db.record.findFirstOrThrow({
          where: { guildId, kind: 'billing.entitlement' },
        })
      ).data,
    ).toMatchObject({
      virtualCurrency: false,
      billingCurrency: 'usd',
      billingMinorAmount: '500',
      status: 'past_due',
    });
  });

  it('keeps newer chargeback holds when an older dispute closure arrives later', async () => {
    const intent = await checkout(),
      latest = new Date(Date.now() + 100).toISOString(),
      older = new Date(Date.now() - 100).toISOString();
    await mutate('hold-active', (ctx) =>
      applyBillingObservation(
        ctx,
        {
          event: event('chargeback', 200, 'charge.dispute.created'),
          subscription: subscription(intent.id),
          observedAt: latest,
          revocation: 'chargeback',
        },
        billingEnv,
      ),
    );
    await mutate('hold-old-close', (ctx) =>
      applyBillingObservation(
        ctx,
        {
          event: event('oldclosure', 150, 'charge.dispute.closed'),
          subscription: subscription(intent.id),
          observedAt: new Date(Date.now() + 200).toISOString(),
          revocation: 'dispute-won',
        },
        billingEnv,
      ),
    );
    expect((await plan()).id).toBe('free');
    expect(
      await db.record.findFirstOrThrow({
        where: { guildId, kind: 'billing.hold' },
      }),
    ).toMatchObject({ state: 'active', data: { eventCreatedAt: 200 } });
    await mutate('hold-new-close', (ctx) =>
      applyBillingObservation(
        ctx,
        {
          event: event('newclosure', 250, 'charge.dispute.closed'),
          subscription: subscription(intent.id),
          observedAt: older,
          revocation: 'dispute-won',
        },
        billingEnv,
      ),
    );
    expect((await plan()).id).toBe('plus');
    await mutate('delayed-refund', (ctx) =>
      applyBillingObservation(
        ctx,
        {
          event: event('refund', 300, 'charge.refunded'),
          subscription: subscription(intent.id, 'canceled'),
          observedAt: older,
          revocation: 'refund',
        },
        billingEnv,
      ),
    );
    expect((await plan()).id).toBe('free');
    expect(
      (
        await db.record.findFirstOrThrow({
          where: { guildId, kind: 'billing.entitlement' },
        })
      ).data,
    ).toMatchObject({ status: 'active', revoked: true });
  });

  it('rejects cross-guild subscriptions and unauthorized checkout owners', async () => {
    const intent = await checkout(),
      base = {
        event: event('scope', 100),
        subscription: subscription(intent.id),
        observedAt: new Date().toISOString(),
        revocation: null,
      };
    await expect(
      mutate('wrong-guild', (ctx) =>
        applyBillingObservation(
          ctx,
          {
            ...base,
            subscription: {
              ...base.subscription,
              metadata: {
                ...base.subscription.metadata,
                guildId: otherGuildId,
              },
            },
          },
          billingEnv,
        ),
      ),
    ).rejects.toThrow('another server');
    await expect(
      mutate('wrong-owner', (ctx) =>
        applyBillingObservation(
          ctx,
          {
            ...base,
            subscription: {
              ...base.subscription,
              metadata: { ...base.subscription.metadata, userId: otherId },
            },
          },
          billingEnv,
        ),
      ),
    ).rejects.toThrow('authorized checkout');
    expect((await plan()).id).toBe('free');
    expect(
      await db.record.count({ where: { guildId, kind: 'billing.event' } }),
    ).toBe(0);
  });

  it('ignores superseded entitlement expiry and expires only the current observation', async () => {
    const observation = new Date().toISOString();
    await record(
      'billing.entitlement',
      'sub_test',
      {
        plan: 'plus',
        active: true,
        revoked: false,
        observedAt: observation,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
      'active',
    );
    expect(
      await mutate('old-expiry', (ctx) =>
        runProviderJob(ctx, 'billing.entitlement.expire', {
          subscriptionId: 'sub_test',
          observedAt: 'older',
        }),
      ),
    ).toMatchObject({ data: { superseded: true } });
    expect(
      await mutate('current-expiry', (ctx) =>
        runProviderJob(ctx, 'billing.entitlement.expire', {
          subscriptionId: 'sub_test',
          observedAt: observation,
        }),
      ),
    ).toMatchObject({ data: { state: 'expired' } });
    expect((await plan()).id).toBe('free');
  });
});
