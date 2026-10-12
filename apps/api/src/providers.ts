import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError, Snowflake, type Actor } from '@sparko/contracts';
import {
  Platform,
  jsonObject,
  decryptProviderSecret,
  verifyExternalEvent,
  acceptExternalEvent,
  verifyStripeCallback,
  resolveStripeEvent,
  applyBillingObservation,
  verifyPaypalWebhook,
  resolvePaypalEvent,
  applyPaypalObservation,
  paypalIntentGuild,
  type ProviderTransport,
} from '@sparko/domain';
import type { PrismaClient } from '@sparko/db';

const providerActor = (guildId: string, source: string): Actor => ({
  userId: `provider:${source}`,
  guildId,
  roles: [],
  isAdmin: false,
  isOwner: false,
  capabilities: [],
  globalCapabilities: [],
});

export async function registerProviderCallbacks(
  app: FastifyInstance,
  db: PrismaClient,
  platform: Platform,
  env: Record<string, string | undefined> = process.env,
  transport?: ProviderTransport,
) {
  // Encapsulation preserves the regular JSON parser for authenticated endpoints.
  // Signature validation sees precisely the bytes received, before any write.
  await app.register(async (callback) => {
    callback.removeContentTypeParser('application/json');
    callback.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 65536 },
      (_req, body, done) => done(null, body),
    );
    callback.post(
      '/api/v1/provider-events/:guildId/:integrationId',
      { bodyLimit: 65536 },
      async (req) => {
        const p = z
          .object({
            guildId: Snowflake,
            integrationId: z.string().min(1).max(128),
          })
          .parse(req.params);
        const integration = await db.record.findFirst({
          where: {
            id: p.integrationId,
            guildId: p.guildId,
            kind: 'webhook.integration',
            state: 'active',
          },
        });
        const secretRecord = await db.record.findUnique({
          where: {
            guildId_kind_key: {
              guildId: p.guildId,
              kind: 'provider.secret',
              key: p.integrationId,
            },
          },
        });
        if (!integration || !secretRecord)
          throw new DomainError(
            'FORBIDDEN',
            'This integration is unavailable.',
            403,
          );
        const secret = decryptProviderSecret(
          z.string().parse(jsonObject(secretRecord.data)['encryptedSecret']),
          env['INTEGRATION_ENCRYPTION_KEY'] ?? '',
        );
        const headers = z
          .object({ timestamp: z.string(), signature: z.string() })
          .parse({
            timestamp: req.headers['x-sparko-timestamp'],
            signature: req.headers['x-sparko-signature'],
          });
        if (!Buffer.isBuffer(req.body))
          throw new DomainError(
            'INVALID_INPUT',
            'The event must use application/json.',
          );
        const event = verifyExternalEvent(req.body, headers, secret);
        const result = await platform.mutate(
          providerActor(p.guildId, p.integrationId),
          `provider-event:${p.integrationId}`,
          event.eventId,
          event,
          (ctx) => acceptExternalEvent(ctx, p.integrationId, event),
        );
        return {
          data: {
            received: true,
            eventId: result.data.id,
            operationId: result.operation.id,
          },
        };
      },
    );
    callback.post(
      '/api/v1/webhooks/stripe',
      { bodyLimit: 65536 },
      async (req) => {
        if (!env['STRIPE_WEBHOOK_SECRET'])
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'Configure the billing callback signing key.',
            503,
            { missingConfiguration: ['STRIPE_WEBHOOK_SECRET'] },
          );
        const signature = req.headers['stripe-signature'];
        if (!Buffer.isBuffer(req.body) || typeof signature !== 'string')
          throw new DomainError(
            'FORBIDDEN',
            'The billing callback signature is required.',
            403,
          );
        const event = verifyStripeCallback(
          req.body,
          signature,
          env['STRIPE_WEBHOOK_SECRET'],
        );
        // Provider retrieval is outside the business transaction and never trusts
        // a browser redirect or callback-supplied entitlement as current truth.
        const observation = await resolveStripeEvent(event, env, transport);
        if (!observation) return { data: { received: true, ignored: true } };
        const guildId = observation.subscription.metadata.guildId;
        const result = await platform.mutate(
          providerActor(guildId, 'stripe'),
          'stripe.callback',
          event.id,
          event,
          async (ctx) => {
            await applyBillingObservation(ctx, observation, env);
            return { received: true, eventId: event.id };
          },
        );
        return { data: { ...result.data, operationId: result.operation.id } };
      },
    );
    callback.post(
      '/api/v1/webhooks/paypal',
      { bodyLimit: 65536 },
      async (req) => {
        if (!env['PAYPAL_WEBHOOK_ID'])
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'Configure the PayPal webhook ID.',
            503,
            { missingConfiguration: ['PAYPAL_WEBHOOK_ID'] },
          );
        if (!Buffer.isBuffer(req.body))
          throw new DomainError(
            'INVALID_INPUT',
            'The event must use application/json.',
          );
        // PayPal verifies the exact bytes before anything is read or written.
        const event = await verifyPaypalWebhook(
          req.body,
          req.headers,
          env,
          transport,
        );
        const observation = await resolvePaypalEvent(event, env, transport);
        if (!observation) return { data: { received: true, ignored: true } };
        const guildId = await paypalIntentGuild(db, observation.subscription);
        if (!guildId) return { data: { received: true, ignored: true } };
        const result = await platform.mutate(
          providerActor(guildId, 'paypal'),
          'paypal.callback',
          event.id,
          event,
          async (ctx) => {
            await applyPaypalObservation(ctx, observation, env);
            return { received: true, eventId: event.id };
          },
        );
        return { data: { ...result.data, operationId: result.operation.id } };
      },
    );
  });
}
