import { z } from 'zod';
import { DomainError } from '@sparko/contracts';
import { hash, type DomainContext } from './core.js';
import {
  callJson,
  configured,
  paypalPlanSettings,
  paypalSettings,
  providerHttp,
  recordEntitlement,
  type BillingPeriod,
  type EntitlementObservation,
  type HttpRequest,
  type ProviderTransport,
} from './providers.js';

/**
 * Premium through PayPal Subscriptions. As with Stripe, a browser returning
 * from PayPal never grants anything: only a webhook that PayPal itself
 * verifies, followed by a fresh read of the subscription from PayPal, changes
 * a server's plan.
 */
type Environment = Record<string, string | undefined>;
const sandbox = (env: Environment) => env['PAYPAL_ENV'] === 'sandbox';
const apiHost = (env: Environment) =>
  sandbox(env) ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';
const approvalHost = (env: Environment) =>
  sandbox(env) ? 'www.sandbox.paypal.com' : 'www.paypal.com';
const SubscriptionId = z.string().regex(/^I-[A-Z0-9]{6,40}$/);
const SaleId = z.string().regex(/^[A-Z0-9]{8,40}$/);

function request(
  env: Environment,
  path: string,
  init: {
    method?: 'GET' | 'POST';
    body?: string;
    headers?: Record<string, string>;
  },
): HttpRequest {
  return {
    url: `https://${apiHost(env)}${path}`,
    hosts: [apiHost(env)],
    method: init.method ?? 'GET',
    headers: { accept: 'application/json', ...init.headers },
    ...(init.body ? { body: init.body } : {}),
  };
}
async function accessToken(env: Environment, transport: ProviderTransport) {
  configured(env, ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']);
  const basic = Buffer.from(
    `${env['PAYPAL_CLIENT_ID']}:${env['PAYPAL_CLIENT_SECRET']}`,
  ).toString('base64');
  const result = z.object({ access_token: z.string().min(1) }).parse(
    await callJson(
      transport,
      request(env, '/v1/oauth2/token', {
        method: 'POST',
        body: 'grant_type=client_credentials',
        headers: {
          authorization: `Basic ${basic}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
      }),
    ),
  );
  return result.access_token;
}
async function api(
  env: Environment,
  transport: ProviderTransport,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: string; requestId?: string } = {},
) {
  const token = await accessToken(env, transport);
  return callJson(
    transport,
    request(env, path, {
      ...(init.method ? { method: init.method } : {}),
      ...(init.body ? { body: init.body } : {}),
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.requestId ? { 'paypal-request-id': init.requestId } : {}),
      },
    }),
  );
}

/** Starts a subscription for a checkout intent; the member approves it on PayPal. */
export async function createPaypalSubscription(
  intent: {
    id: string;
    guildId: string;
    userId: string;
    period?: BillingPeriod;
  },
  origin: string,
  env: Environment = process.env,
  transport: ProviderTransport = providerHttp,
) {
  configured(env, paypalSettings);
  const planSetting = paypalPlanSettings[intent.period ?? 'monthly'];
  configured(env, [planSetting]);
  const publicOrigin = new URL(origin);
  if (
    publicOrigin.protocol !== 'https:' ||
    publicOrigin.pathname !== '/' ||
    publicOrigin.search ||
    publicOrigin.hash
  )
    throw new DomainError(
      'INVALID_INPUT',
      'Billing requires the configured HTTPS public origin.',
    );
  const back = `${publicOrigin.origin}/account/billing`;
  const result = z
    .object({
      id: SubscriptionId,
      links: z.array(z.object({ rel: z.string(), href: z.string() })),
    })
    .parse(
      await api(env, transport, '/v1/billing/subscriptions', {
        method: 'POST',
        // The same intent always maps to the same PayPal request.
        requestId: `sparko-checkout-${intent.id}`,
        body: JSON.stringify({
          plan_id: env[planSetting],
          custom_id: intent.id,
          application_context: {
            brand_name: 'Sparko',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'SUBSCRIBE_NOW',
            return_url: `${back}?checkout=returned`,
            cancel_url: `${back}?checkout=cancelled`,
          },
        }),
      }),
    );
  const approve = result.links.find((l) => l.rel === 'approve');
  const url = approve ? new URL(approve.href) : null;
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.hostname !== approvalHost(env) ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new DomainError(
      'DELIVERY_FAILED',
      'PayPal did not return an approval link.',
      502,
    );
  return {
    checkoutId: result.id,
    checkoutUrl: url.toString(),
    // PayPal approval links stop working after about three hours.
    expiresAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
  };
}

export const PaypalEventSchema = z.object({
  id: z.string().regex(/^WH-[A-Z0-9-]{6,80}$/),
  event_type: z.string().max(100),
  create_time: z.iso.datetime({ offset: true }),
  resource: z.record(z.string(), z.unknown()),
});
export type PaypalEvent = z.infer<typeof PaypalEventSchema>;
const PaypalHeaders = z.object({
  'paypal-auth-algo': z.string().min(1).max(64),
  'paypal-cert-url': z.url().max(500),
  'paypal-transmission-id': z.string().min(1).max(128),
  'paypal-transmission-sig': z.string().min(1).max(2048),
  'paypal-transmission-time': z.iso.datetime({ offset: true }),
});
/**
 * Asks PayPal to verify a webhook against the configured webhook ID. The
 * exact received bytes are embedded unchanged so re-serialisation cannot
 * alter what PayPal checks. Stale transmissions are refused.
 */
export async function verifyPaypalWebhook(
  raw: Buffer,
  headers: Record<string, unknown>,
  env: Environment = process.env,
  transport: ProviderTransport = providerHttp,
  now = new Date(),
): Promise<PaypalEvent> {
  configured(env, ['PAYPAL_WEBHOOK_ID']);
  const parsed = PaypalHeaders.safeParse(headers);
  if (!parsed.success)
    throw new DomainError(
      'FORBIDDEN',
      'The PayPal signature headers are required.',
      403,
    );
  const h = parsed.data;
  if (
    Math.abs(now.getTime() - Date.parse(h['paypal-transmission-time'])) >
    30 * 60_000
  )
    throw new DomainError('FORBIDDEN', 'The PayPal callback expired.', 403);
  let event: PaypalEvent;
  try {
    event = PaypalEventSchema.parse(JSON.parse(raw.toString('utf8')));
  } catch {
    throw new DomainError('INVALID_INPUT', 'PayPal event payload is invalid.');
  }
  const envelope = JSON.stringify({
    auth_algo: h['paypal-auth-algo'],
    cert_url: h['paypal-cert-url'],
    transmission_id: h['paypal-transmission-id'],
    transmission_sig: h['paypal-transmission-sig'],
    transmission_time: h['paypal-transmission-time'],
    webhook_id: env['PAYPAL_WEBHOOK_ID'],
    webhook_event: '__EVENT__',
  }).replace('"__EVENT__"', raw.toString('utf8'));
  const result = z.object({ verification_status: z.string() }).parse(
    await api(env, transport, '/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: envelope,
    }),
  );
  if (result.verification_status !== 'SUCCESS')
    throw new DomainError(
      'FORBIDDEN',
      'PayPal could not verify this callback.',
      403,
    );
  return event;
}

export const PaypalSubscriptionSchema = z.object({
  id: SubscriptionId,
  status: z.enum([
    'APPROVAL_PENDING',
    'APPROVED',
    'ACTIVE',
    'SUSPENDED',
    'CANCELLED',
    'EXPIRED',
  ]),
  plan_id: z.string(),
  custom_id: z.string().min(1).max(128),
  status_update_time: z.iso.datetime({ offset: true }).optional(),
  billing_info: z
    .object({
      next_billing_time: z.iso.datetime({ offset: true }).optional(),
      last_payment: z
        .object({
          amount: z.object({ currency_code: z.string(), value: z.string() }),
        })
        .optional(),
    })
    .optional(),
});
export type PaypalSubscription = z.infer<typeof PaypalSubscriptionSchema>;
const subscriptionEvents = new Set([
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.RE-ACTIVATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
]);
const saleEvents = new Set([
  'PAYMENT.SALE.COMPLETED',
  'PAYMENT.SALE.REFUNDED',
  'PAYMENT.SALE.REVERSED',
]);
const disputeEvents = new Set([
  'CUSTOMER.DISPUTE.CREATED',
  'CUSTOMER.DISPUTE.RESOLVED',
]);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Finds the subscription an event concerns and reads it from PayPal now.
 * Returns null for events that do not affect Premium.
 */
export async function resolvePaypalEvent(
  event: PaypalEvent,
  env: Environment = process.env,
  transport: ProviderTransport = providerHttp,
) {
  const r = event.resource;
  const saleAgreement = async (saleId: string) =>
    text(
      (
        (await api(
          env,
          transport,
          `/v1/payments/sale/${SaleId.parse(saleId)}`,
        )) as Record<string, unknown>
      )['billing_agreement_id'],
    );
  let subscriptionId = '';
  if (subscriptionEvents.has(event.event_type)) subscriptionId = text(r['id']);
  else if (saleEvents.has(event.event_type))
    subscriptionId =
      text(r['billing_agreement_id']) ||
      (text(r['sale_id']) ? await saleAgreement(text(r['sale_id'])) : '');
  else if (disputeEvents.has(event.event_type)) {
    const disputed = Array.isArray(r['disputed_transactions'])
      ? (r['disputed_transactions'] as Record<string, unknown>[])
      : [];
    const saleId = text(disputed[0]?.['seller_transaction_id']);
    subscriptionId = saleId ? await saleAgreement(saleId) : '';
  } else return null;
  if (!SubscriptionId.safeParse(subscriptionId).success) return null;
  const subscription = PaypalSubscriptionSchema.parse(
    await api(env, transport, `/v1/billing/subscriptions/${subscriptionId}`),
  );
  const outcome = text(
    (r['dispute_outcome'] as Record<string, unknown> | undefined)?.[
      'outcome_code'
    ],
  );
  const revocation: EntitlementObservation['revocation'] =
    event.event_type === 'PAYMENT.SALE.REFUNDED'
      ? 'refund'
      : event.event_type === 'PAYMENT.SALE.REVERSED' ||
          event.event_type === 'CUSTOMER.DISPUTE.CREATED'
        ? 'chargeback'
        : event.event_type === 'CUSTOMER.DISPUTE.RESOLVED' &&
            outcome === 'RESOLVED_SELLER_FAVOUR'
          ? 'dispute-won'
          : null;
  return {
    event,
    subscription,
    observedAt: new Date().toISOString(),
    revocation,
  };
}
export type PaypalObservation = NonNullable<
  Awaited<ReturnType<typeof resolvePaypalEvent>>
>;

/** "4.99" becomes "499"; zero-decimal amounts such as "500" stay as they are. */
export function minorUnits(value: string) {
  const [whole = '0', fraction] = value.split('.');
  return fraction === undefined
    ? whole
    : String(BigInt(whole + fraction.padEnd(2, '0').slice(0, 2)));
}

/** Applies a verified PayPal observation to the server's Premium entitlement. */
export async function applyPaypalObservation(
  ctx: DomainContext,
  observation: PaypalObservation,
  env: Environment = process.env,
) {
  configured(env, ['PAYPAL_PLAN_ID']);
  const { event, subscription, observedAt, revocation } = observation;
  // Every configured period is the same Plus plan; anything else is foreign.
  const plusPlans = Object.values(paypalPlanSettings)
    .map((name) => env[name])
    .filter(Boolean);
  if (!plusPlans.includes(subscription.plan_id))
    throw new DomainError(
      'INVALID_INPUT',
      'The subscription uses an unrecognized PayPal plan.',
    );
  const intent = await ctx.tx.record.findFirst({
    where: { id: subscription.custom_id, kind: 'billing.intent' },
  });
  if (!intent || intent.guildId !== ctx.guildId)
    throw new DomainError(
      'FORBIDDEN',
      'Billing observation belongs to another server.',
      403,
    );
  const next = subscription.billing_info?.next_billing_time;
  const payment = subscription.billing_info?.last_payment?.amount;
  // A day of grace covers the gap between a renewal charge and its webhook.
  const paidUntil = next
    ? new Date(Date.parse(next) + 86_400_000).toISOString()
    : null;
  return recordEntitlement(ctx, {
    provider: 'paypal',
    eventId: event.id,
    eventType: event.event_type,
    eventCreated: Math.floor(Date.parse(event.create_time) / 1000),
    payloadHash: hash(event),
    livemode: !sandbox(env),
    subscriptionId: subscription.id,
    intentId: intent.id,
    status: subscription.status.toLowerCase(),
    // Cancelling keeps Premium until the end of the period already paid for.
    entitled: ['ACTIVE', 'CANCELLED'].includes(subscription.status),
    cancelAtPeriodEnd: subscription.status === 'CANCELLED',
    expiresAt: subscription.status === 'ACTIVE' ? paidUntil : null,
    priceId: subscription.plan_id,
    currency: payment?.currency_code.toLowerCase() ?? 'unknown',
    minorAmount: payment ? minorUnits(payment.value) : null,
    observedAt,
    revocation,
  });
}

/** Finds the server a PayPal subscription belongs to, from its checkout intent. */
export async function paypalIntentGuild(
  tx: DomainContext['tx'],
  subscription: PaypalSubscription,
) {
  const intent = await tx.record.findFirst({
    where: { id: subscription.custom_id, kind: 'billing.intent' },
    select: { guildId: true },
  });
  return intent?.guildId ?? null;
}
