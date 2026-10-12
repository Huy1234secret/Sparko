import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError, Snowflake, type Actor } from '@sparko/contracts';
import {
  createRecord,
  featureGate,
  getRecord,
  jsonObject,
  planFor,
  plans,
  updateRecord,
  type Platform,
} from '@sparko/domain';
import type { PrismaClient } from '@sparko/db';

const Reason = z.string().trim().min(3).max(1000);
const FeatureId = z.string().regex(/^(R\d{2}|tickets)$/);
function key(req: FastifyRequest) {
  const value = req.headers['idempotency-key'];
  return typeof value === 'string' ? value : '';
}

/**
 * Per-server owner controls: plan, staff-granted entitlements and feature
 * policy. Every change is a guild-audited operation with a reason; nothing
 * here edits a server's own configuration.
 */
export function registerOwnerRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  platform: Platform,
  globalActor: (req: FastifyRequest, capability: string) => Promise<Actor>,
  featureIds: string[],
) {
  async function guild(guildId: string) {
    const row = await db.guild.findUnique({ where: { id: guildId } });
    if (!row) throw new DomainError('NOT_FOUND', 'Server unavailable.', 404);
    return row;
  }
  app.get('/api/v1/owner/guilds/:guildId', async (req) => {
    await globalActor(req, 'fleet.read');
    const p = z.object({ guildId: Snowflake }).parse(req.params);
    const row = await guild(p.guildId);
    return {
      data: await db.$transaction(async (tx) => {
        const now = new Date();
        const [plan, policies, entitlements] = await Promise.all([
          planFor(tx, p.guildId, now),
          tx.featurePolicy.findMany({ where: { guildId: p.guildId } }),
          tx.record.findMany({
            where: { guildId: p.guildId, kind: 'billing.entitlement' },
            orderBy: { createdAt: 'desc' },
            take: 50,
          }),
        ]);
        return {
          guild: row,
          plan,
          plans,
          policies,
          // Provider entitlements carry no payment details beyond status.
          entitlements: entitlements.map((entry) => {
            const data = jsonObject(entry.data);
            return {
              id: entry.id,
              state: entry.state,
              revision: entry.revision,
              source: data['provider'] === 'staff' ? 'staff' : 'provider',
              status: data['status'] ?? null,
              expiresAt: data['expiresAt'] ?? null,
              reason: data['provider'] === 'staff' ? data['reason'] : null,
              revoked: data['revoked'] === true,
              createdAt: entry.createdAt,
            };
          }),
          features: await Promise.all(
            featureIds.map((id) => featureGate(tx, p.guildId, id, now)),
          ),
        };
      }),
    };
  });
  app.put(
    '/api/v1/owner/guilds/:guildId/features/:featureId/policy',
    async (req) => {
      const a = await globalActor(req, 'entitlements.manage'),
        p = z
          .object({ guildId: Snowflake, featureId: FeatureId })
          .parse(req.params),
        body = z
          .object({
            allowed: z.boolean(),
            reason: Reason,
            expectedRevision: z.number().int().min(0),
          })
          .strict()
          .parse(req.body);
      if (!featureIds.includes(p.featureId))
        throw new DomainError(
          'NOT_FOUND',
          'This feature is not available.',
          404,
        );
      await guild(p.guildId);
      return platform.mutate(
        { ...a, guildId: p.guildId },
        'owner.feature.policy',
        key(req),
        { ...p, ...body },
        async (ctx) => {
          const current = await ctx.tx.featurePolicy.findUnique({
            where: { guildId_featureId: p },
          });
          if ((current?.revision ?? 0) !== body.expectedRevision)
            throw new DomainError(
              'REVISION_CONFLICT',
              'Another operator changed this policy. Review the latest version.',
              409,
              { currentRevision: current?.revision ?? 0 },
            );
          // A block stops new work only; existing records and cleanup are untouched.
          return ctx.tx.featurePolicy.upsert({
            where: { guildId_featureId: p },
            create: {
              ...p,
              allowed: body.allowed,
              reason: body.reason,
              actorId: a.userId,
            },
            update: {
              allowed: body.allowed,
              reason: body.reason,
              actorId: a.userId,
              revision: { increment: 1 },
            },
          });
        },
      );
    },
  );
  app.post('/api/v1/owner/guilds/:guildId/entitlements', async (req) => {
    const a = await globalActor(req, 'entitlements.manage'),
      p = z.object({ guildId: Snowflake }).parse(req.params),
      body = z
        .object({
          plan: z.literal('plus'),
          expiresAt: z.iso
            .datetime()
            .refine(
              (value) =>
                Date.parse(value) > Date.now() &&
                Date.parse(value) <= Date.now() + 366 * 86400000,
              'Choose a future expiry within a year.',
            ),
          reason: Reason,
        })
        .strict()
        .parse(req.body);
    await guild(p.guildId);
    return platform.mutate(
      { ...a, guildId: p.guildId },
      'owner.entitlement.grant',
      key(req),
      { ...p, ...body },
      async (ctx) => {
        const row = await createRecord(
          ctx,
          'billing.entitlement',
          {
            provider: 'staff',
            plan: body.plan,
            status: 'active',
            active: true,
            revoked: false,
            expiresAt: body.expiresAt,
            reason: body.reason,
            grantedBy: a.userId,
            guildId: p.guildId,
            virtualCurrency: false,
          },
          { state: 'active' },
        );
        await ctx.effect(
          'billing.entitlement.expire',
          { entitlementId: row.id },
          new Date(body.expiresAt),
        );
        return row;
      },
    );
  });
  app.post(
    '/api/v1/owner/guilds/:guildId/entitlements/:id/revoke',
    async (req) => {
      const a = await globalActor(req, 'entitlements.manage'),
        p = z
          .object({ guildId: Snowflake, id: z.string().uuid() })
          .parse(req.params),
        body = z
          .object({ reason: Reason, expectedRevision: z.number().int().min(1) })
          .strict()
          .parse(req.body);
      return platform.mutate(
        { ...a, guildId: p.guildId },
        'owner.entitlement.revoke',
        key(req),
        { ...p, ...body },
        async (ctx) => {
          const row = await getRecord(ctx, 'billing.entitlement', p.id),
            data = jsonObject(row.data);
          // Provider entitlements follow verified provider events only.
          if (data['provider'] !== 'staff')
            throw new DomainError(
              'INVALID_INPUT',
              'Only staff-granted access can be revoked here. Provider subscriptions change through the provider.',
            );
          return updateRecord(
            ctx,
            'billing.entitlement',
            row.id,
            {
              ...data,
              active: false,
              revoked: true,
              revokedBy: a.userId,
              revokeReason: body.reason,
            },
            body.expectedRevision,
            'revoked',
          );
        },
      );
    },
  );
}
