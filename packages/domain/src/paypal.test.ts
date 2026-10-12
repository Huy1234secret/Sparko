import { describe, expect, it } from 'vitest';
import {
  createPaypalSubscription,
  minorUnits,
  verifyPaypalWebhook,
} from './paypal.js';
import type { ProviderTransport } from './providers.js';

const env = {
  PAYPAL_CLIENT_ID: 'client',
  PAYPAL_CLIENT_SECRET: 'secret',
  PAYPAL_PLAN_ID: 'P-PLUS',
  PAYPAL_WEBHOOK_ID: 'WEBHOOK',
};
type Call = Parameters<ProviderTransport>[0];
function fake(
  respond: (call: Call) => unknown,
): ProviderTransport & { calls: Call[] } {
  const calls: Call[] = [];
  const transport = async (call: Call) => {
    calls.push(call);
    if (call.url.endsWith('/v1/oauth2/token'))
      return { status: 200, body: JSON.stringify({ access_token: 'tok' }) };
    return { status: 200, body: JSON.stringify(respond(call)) };
  };
  return Object.assign(transport, { calls });
}
const headers = (time = new Date()) => ({
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig',
  'paypal-transmission-time': time.toISOString(),
});
const event = {
  id: 'WH-1AB23456CD789012E-3FG45678HI901234J',
  event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
  create_time: '2026-10-12T09:00:00Z',
  resource: { id: 'I-ABCDEF123456', amount: 4.5 },
};

describe('PayPal subscriptions', () => {
  it('creates one idempotent subscription per checkout and returns only a PayPal approval link', async () => {
    const transport = fake(() => ({
      id: 'I-ABCDEF123456',
      links: [
        {
          rel: 'approve',
          href: 'https://www.paypal.com/webapps/billing/subscriptions?ba_token=BA-1',
        },
      ],
    }));
    const result = await createPaypalSubscription(
      { id: 'intent-1', guildId: '123456789012345678', userId: '1' },
      'https://panel.coin-sprite.com',
      env,
      transport,
    );
    expect(result.checkoutUrl).toMatch(/^https:\/\/www\.paypal\.com\//);
    const create = transport.calls[1]!;
    expect(create.url).toBe(
      'https://api-m.paypal.com/v1/billing/subscriptions',
    );
    expect(create.headers).toMatchObject({
      authorization: 'Bearer tok',
      'paypal-request-id': 'sparko-checkout-intent-1',
    });
    expect(JSON.parse(create.body!)).toMatchObject({
      plan_id: 'P-PLUS',
      custom_id: 'intent-1',
      application_context: {
        return_url:
          'https://panel.coin-sprite.com/account/billing?checkout=returned',
      },
    });
    const evil = fake(() => ({
      id: 'I-ABCDEF123456',
      links: [{ rel: 'approve', href: 'https://paypal.example.com/approve' }],
    }));
    await expect(
      createPaypalSubscription(
        { id: 'intent-2', guildId: '1', userId: '1' },
        'https://panel.coin-sprite.com',
        env,
        evil,
      ),
    ).rejects.toThrow('approval link');
  });

  it('uses the sandbox hosts only when asked to', async () => {
    const transport = fake(() => ({
      id: 'I-ABCDEF123456',
      links: [
        {
          rel: 'approve',
          href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-1',
        },
      ],
    }));
    await createPaypalSubscription(
      { id: 'intent-3', guildId: '1', userId: '1' },
      'https://panel.coin-sprite.com',
      { ...env, PAYPAL_ENV: 'sandbox' },
      transport,
    );
    expect(
      transport.calls.every((c) => c.hosts[0] === 'api-m.sandbox.paypal.com'),
    ).toBe(true);
  });

  it('has PayPal verify the exact received bytes and refuses failures and stale deliveries', async () => {
    const raw = Buffer.from(JSON.stringify(event).replace('4.5', '4.50'));
    const ok = fake(() => ({ verification_status: 'SUCCESS' }));
    await expect(
      verifyPaypalWebhook(raw, headers(), env, ok),
    ).resolves.toMatchObject({
      id: event.id,
    });
    const body = ok.calls[1]!.body!;
    // The event bytes are embedded unchanged ("4.50", not a re-serialised 4.5).
    expect(body).toContain(raw.toString('utf8'));
    expect(JSON.parse(body)).toMatchObject({ webhook_id: 'WEBHOOK' });
    await expect(
      verifyPaypalWebhook(
        raw,
        headers(),
        env,
        fake(() => ({ verification_status: 'FAILURE' })),
      ),
    ).rejects.toThrow('could not verify');
    await expect(
      verifyPaypalWebhook(
        raw,
        headers(new Date(Date.now() - 3_600_000)),
        env,
        ok,
      ),
    ).rejects.toThrow('expired');
    await expect(verifyPaypalWebhook(raw, {}, env, ok)).rejects.toThrow(
      'headers',
    );
  });

  it('converts PayPal amounts to minor units', () => {
    expect(minorUnits('4.99')).toBe('499');
    expect(minorUnits('5.5')).toBe('550');
    expect(minorUnits('500')).toBe('500');
  });
});
