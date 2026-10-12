import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@sparko/db';
import { planFor, type ProviderTransport } from '@sparko/domain';
import { createApp } from './app.js';
import { fakeDiscord, testConfig } from '../test/fixtures.js';
import { testDatabaseUrl } from '../../../tools/test-targets.js';

const GUILD = '951111111111111111',
  OTHER = '951111111111111112',
  OWNER = '951111111111111113',
  SUB = 'I-PAYPALSUB0001';
const db = createDatabase(testDatabaseUrl()),
  config = testConfig(testDatabaseUrl());
const providerEnv = {
  PAYPAL_CLIENT_ID: 'client',
  PAYPAL_CLIENT_SECRET: 'secret',
  PAYPAL_PLAN_ID: 'P-PLUS',
  PAYPAL_PLAN_ID_ANNUAL: 'P-YEAR',
  PAYPAL_WEBHOOK_ID: 'WEBHOOK',
};
/** A stand-in for PayPal: it verifies what we tell it to and reports the current subscription. */
const paypal = {
  verified: true,
  subscription: {} as Record<string, unknown>,
  verifications: 0,
};
const transport: ProviderTransport = async (call) => {
  const reply = (body: unknown) => ({
    status: 200,
    body: JSON.stringify(body),
  });
  if (call.url.endsWith('/v1/oauth2/token'))
    return reply({ access_token: 'tok' });
  if (call.url.endsWith('/v1/notifications/verify-webhook-signature')) {
    paypal.verifications++;
    return reply({
      verification_status: paypal.verified ? 'SUCCESS' : 'FAILURE',
    });
  }
  if (call.url.endsWith(`/v1/billing/subscriptions/${SUB}`))
    return reply(paypal.subscription);
  if (call.url.endsWith('/v1/payments/sale/SALE00000001'))
    return reply({ id: 'SALE00000001', billing_agreement_id: SUB });
  return { status: 404, body: '{}' };
};
let app: Awaited<ReturnType<typeof createApp>>;
let intentId = '';
const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000)
    .toISOString()
    .replace(/\.\d+Z$/, 'Z');
function subscription(status: string, next: string | null = inDays(30)) {
  return {
    id: SUB,
    status,
    plan_id: 'P-PLUS',
    custom_id: intentId,
    billing_info: {
      ...(next ? { next_billing_time: next } : {}),
      last_payment: { amount: { currency_code: 'USD', value: '4.99' } },
    },
  };
}
let sequence = 0;
async function deliver(eventType: string, resource: Record<string, unknown>) {
  sequence++;
  const event = {
    id: `WH-TEST${String(sequence).padStart(6, '0')}-ABC`,
    event_type: eventType,
    create_time: new Date(Date.now() + sequence * 1000).toISOString(),
    resource,
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/paypal',
    headers: {
      'content-type': 'application/json',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT',
      'paypal-transmission-id': `tx-${sequence}`,
      'paypal-transmission-sig': 'sig',
      'paypal-transmission-time': new Date().toISOString(),
    },
    payload: JSON.stringify(event),
  });
  return { status: response.statusCode, event };
}
const plan = () => db.$transaction((tx) => planFor(tx, GUILD));
const entitlement = () =>
  db.record.findFirstOrThrow({
    where: { guildId: GUILD, kind: 'billing.entitlement', key: SUB },
  });

beforeAll(async () => {
  app = await createApp({
    db,
    config,
    discord: fakeDiscord(),
    providerEnv,
    providerTransport: transport,
  });
});
beforeEach(async () => {
  await db.guild.deleteMany({ where: { id: { in: [GUILD, OTHER] } } });
  await db.guild.createMany({
    data: [
      { id: GUILD, name: 'Paying', installed: true },
      { id: OTHER, name: 'Other', installed: true },
    ],
  });
  intentId = (
    await db.record.create({
      data: {
        guildId: GUILD,
        kind: 'billing.intent',
        key: 'checkout',
        ownerId: OWNER,
        state: 'checkout-ready',
        data: { plan: 'plus', userId: OWNER, guildId: GUILD },
      },
    })
  ).id;
  paypal.verified = true;
});
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
});

describe('PayPal Premium', () => {
  it('turns Premium on only for a PayPal-verified activation, once', async () => {
    paypal.subscription = subscription('ACTIVE');
    paypal.verified = false;
    expect(
      (await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB })).status,
    ).toBe(403);
    expect((await plan()).id).toBe('free');

    paypal.verified = true;
    const first = await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB });
    expect(first.status).toBe(200);
    expect((await plan()).id).toBe('plus');
    expect((await entitlement()).data).toMatchObject({
      provider: 'paypal',
      status: 'active',
      billingCurrency: 'usd',
      billingMinorAmount: '499',
      virtualCurrency: false,
    });
    // PayPal retries the same event: nothing is recorded twice.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/paypal',
      headers: {
        'content-type': 'application/json',
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT',
        'paypal-transmission-id': 'tx-replay',
        'paypal-transmission-sig': 'sig',
        'paypal-transmission-time': new Date().toISOString(),
      },
      payload: JSON.stringify(first.event),
    });
    expect(replay.statusCode).toBe(200);
    expect(
      await db.record.count({
        where: { guildId: GUILD, kind: 'billing.event' },
      }),
    ).toBe(1);
  });

  it('keeps Premium until the paid period ends after cancelling, and ends it on a refund', async () => {
    paypal.subscription = subscription('ACTIVE', inDays(20));
    await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB });
    paypal.subscription = subscription('CANCELLED', null);
    await deliver('BILLING.SUBSCRIPTION.CANCELLED', { id: SUB });
    expect((await plan()).id).toBe('plus');
    const cancelled = (await entitlement()).data as Record<string, unknown>;
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelAtPeriodEnd: true,
    });
    expect(Date.parse(String(cancelled['expiresAt']))).toBeGreaterThan(
      Date.now() + 19 * 86_400_000,
    );
    await deliver('PAYMENT.SALE.REFUNDED', {
      id: 'REFUND1',
      sale_id: 'SALE00000001',
    });
    expect((await plan()).id).toBe('free');
    expect((await entitlement()).data).toMatchObject({ revoked: true });
  });

  it('ignores subscriptions it did not start and refuses other plans', async () => {
    paypal.subscription = {
      ...subscription('ACTIVE'),
      custom_id: 'not-an-intent',
    };
    expect(
      (await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB })).status,
    ).toBe(200);
    expect((await plan()).id).toBe('free');
    paypal.subscription = { ...subscription('ACTIVE'), plan_id: 'P-OTHER' };
    expect(
      (await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB })).status,
    ).toBe(400);
    expect((await plan()).id).toBe('free');
    expect((await deliver('CHECKOUT.ORDER.APPROVED', { id: 'X' })).status).toBe(
      200,
    );
  });

  it('ends Premium on a refund reported as a completed refund linked to its capture', async () => {
    paypal.subscription = subscription('ACTIVE');
    await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB });
    expect((await plan()).id).toBe('plus');
    expect(
      (
        await deliver('PAYMENT.REFUND.COMPLETED', {
          id: 'REFUND2',
          links: [
            {
              rel: 'up',
              href: 'https://api.paypal.com/v2/payments/captures/SALE00000001',
            },
          ],
        })
      ).status,
    ).toBe(200);
    expect((await plan()).id).toBe('free');
    expect((await entitlement()).data).toMatchObject({ revoked: true });
  });

  it('ends Premium on a reversed capture', async () => {
    paypal.subscription = subscription('ACTIVE');
    await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB });
    await deliver('PAYMENT.CAPTURE.REVERSED', { id: 'SALE00000001' });
    expect((await plan()).id).toBe('free');
  });

  it('accepts the yearly plan as Plus', async () => {
    paypal.subscription = {
      ...subscription('ACTIVE', inDays(365)),
      plan_id: 'P-YEAR',
    };
    expect(
      (await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB })).status,
    ).toBe(200);
    expect((await plan()).id).toBe('plus');
  });

  it('suspends Premium when PayPal suspends the subscription', async () => {
    paypal.subscription = subscription('ACTIVE');
    await deliver('BILLING.SUBSCRIPTION.ACTIVATED', { id: SUB });
    paypal.subscription = subscription('SUSPENDED');
    await deliver('BILLING.SUBSCRIPTION.SUSPENDED', { id: SUB });
    expect((await plan()).id).toBe('free');
  });
});
