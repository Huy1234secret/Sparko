import { createHash, randomUUID } from 'node:crypto';
import { Prisma, json, type PrismaClient, type Transaction } from '@sparko/db';
import { DomainError, type Actor } from '@sparko/contracts';
import { requireCapability } from '@sparko/policy';
import type { z } from 'zod';
export interface DomainContext {
  tx: Transaction;
  actor: Actor;
  guildId: string;
  now: Date;
  operationId: string | null;
  effect: (type: string, payload: unknown, dueAt?: Date) => Promise<string>;
  requireFeature: (featureId: string) => Promise<void>;
}
export interface DomainRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  capability: string;
  schema?: z.ZodType;
  handler: (
    ctx: DomainContext,
    input: unknown,
    params: Record<string, string>,
  ) => Promise<unknown>;
}
export function hash(value: unknown) {
  const canonical = JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const object = item as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(object)
          .sort()
          .map((key) => [key, object[key]]),
      );
    }
    return item;
  });
  return createHash('sha256').update(canonical).digest('hex');
}
export function context(
  tx: Transaction,
  actor: Actor,
  operationId: string | null,
): DomainContext {
  const ctx: DomainContext = {
    tx,
    actor,
    guildId: actor.guildId,
    now: new Date(),
    operationId,
    effect: async (type, payload, dueAt) => {
      const e = await tx.outbox.create({
        data: {
          guildId: actor.guildId,
          operationId,
          type,
          payload: json(payload),
          ...(dueAt ? { dueAt } : {}),
        },
      });
      return e.id;
    },
    requireFeature: async (featureId) => {
      const error = gateError(
        await featureGate(tx, actor.guildId, featureId, ctx.now),
      );
      if (error) throw error;
    },
  };
  return ctx;
}
/** Real capability limits per plan; paid tiers never bypass privacy or permission checks. */
export const plans = {
  free: {
    id: 'free',
    templates: 10,
    storageBytes: 10000000,
    automationSteps: 10,
    transcriptRetentionDays: 7,
    multiServer: false,
  },
  plus: {
    id: 'plus',
    templates: 100,
    storageBytes: 100000000,
    automationSteps: 25,
    transcriptRetentionDays: 30,
    multiServer: true,
  },
} as const;
export type Plan = (typeof plans)[keyof typeof plans];
/** Features that need a paid plan; every other feature is available on Free. */
export const planFeatures: Record<string, keyof typeof plans> = {
  R61: 'plus',
};
/**
 * The server's plan: Plus while any provider-verified or staff-granted
 * entitlement is active, unrevoked and unexpired. Records are never deleted on
 * downgrade; limits apply to new work only.
 */
export async function planFor(
  tx: Transaction,
  guildId: string,
  now = new Date(),
): Promise<Plan> {
  const rows = await tx.record.findMany({
    where: { guildId, kind: 'billing.entitlement', state: 'active' },
    take: 100,
  });
  return rows.some((row) => {
    const data = jsonObject(row.data);
    return (
      data['active'] === true &&
      data['revoked'] !== true &&
      typeof data['expiresAt'] === 'string' &&
      Date.parse(data['expiresAt']) > now.getTime()
    );
  })
    ? plans.plus
    : plans.free;
}
export interface FeatureGate {
  featureId: string;
  /** The server's own configuration turns the module on. */
  enabled: boolean;
  /** Sparko staff have not paused the module for this server. */
  ownerAllowed: boolean;
  ownerReason: string | null;
  /** The server's plan includes the module. */
  planEntitled: boolean;
  requiredPlan: keyof typeof plans | null;
  plan: keyof typeof plans;
}
/**
 * The shared gate for every path that starts new feature work: HTTP routes,
 * Gateway ingestion, workflows, timers and worker effects. Cleanup, refunds,
 * expiry and privacy maintenance deliberately do not call it.
 */
export async function featureGate(
  tx: Transaction,
  guildId: string,
  featureId: string,
  now = new Date(),
): Promise<FeatureGate> {
  const [config, policy, plan] = await Promise.all([
    tx.featureConfig.findUnique({
      where: { guildId_featureId: { guildId, featureId } },
    }),
    tx.featurePolicy.findUnique({
      where: { guildId_featureId: { guildId, featureId } },
    }),
    planFor(tx, guildId, now),
  ]);
  const requiredPlan = planFeatures[featureId] ?? null;
  return {
    featureId,
    enabled: jsonObject(config?.config)['enabled'] === true,
    ownerAllowed: policy?.allowed !== false,
    ownerReason: policy && !policy.allowed ? policy.reason : null,
    planEntitled: !requiredPlan || plan.id === requiredPlan,
    requiredPlan,
    plan: plan.id,
  };
}
export function gateError(gate: FeatureGate): DomainError | null {
  if (!gate.ownerAllowed)
    return new DomainError(
      'FEATURE_BLOCKED',
      `Sparko staff paused this module for this server: ${gate.ownerReason}`,
      403,
    );
  if (!gate.planEntitled)
    return new DomainError(
      'PLAN_REQUIRED',
      `This module needs the ${gate.requiredPlan === 'plus' ? 'Plus' : String(gate.requiredPlan)} plan.`,
      403,
    );
  if (!gate.enabled)
    return new DomainError(
      'FEATURE_DISABLED',
      'Enable this module before using it.',
      409,
    );
  return null;
}
/**
 * Refuses new work beyond the plan's limit. Existing work over the limit (for
 * example after a downgrade) is kept and still usable.
 */
export function requirePlanRoom(
  plan: Plan,
  limit: 'templates' | 'automationSteps',
  wanted: number,
) {
  if (wanted <= plan[limit]) return;
  const what =
    limit === 'templates' ? 'saved designs' : 'steps in one workflow';
  throw new DomainError(
    'PLAN_LIMIT',
    `The ${plan.id === 'plus' ? 'Plus' : 'Free'} plan allows up to ${plan[limit]} ${what}.${plan.id === 'free' ? ' Plus raises this limit.' : ''}`,
    403,
    { limit, allowed: plan[limit], plan: plan.id },
  );
}
/** True when new work for the feature may start (all gates pass). */
export async function featureActive(
  tx: Transaction,
  guildId: string,
  featureId: string,
  now = new Date(),
) {
  return !gateError(await featureGate(tx, guildId, featureId, now));
}
export function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}
export function isTransactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as Record<string, unknown>;
  if (['P2034', '40001', '40P01'].includes(String(value['code']))) return true;
  if (['40001', '40P01'].includes(String(value['originalCode']))) return true;
  // Prisma's PostgreSQL adapter can surface commit conflicts as DriverAdapterError,
  // and a failed raw query as P2010 with that adapter error in its metadata.
  const adapterError = jsonObject(
    jsonObject(value['meta'])['driverAdapterError'],
  );
  return [jsonObject(value['cause']), jsonObject(adapterError['cause'])].some(
    (cause) => ['40001', '40P01'].includes(String(cause['originalCode'])),
  );
}
/**
 * Serializable snapshots start before the guild advisory lock is granted, so a waiter can miss a
 * concurrently committed operation with the same key. Its insert then fails; replay after retry.
 */
class OperationKeyRace extends Error {}
export async function getRecord(ctx: DomainContext, kind: string, id: string) {
  const record = await ctx.tx.record.findFirst({
    where: { id, guildId: ctx.guildId, kind },
  });
  if (!record)
    throw new DomainError('NOT_FOUND', 'This record is unavailable.', 404);
  return record;
}
export async function createRecord(
  ctx: DomainContext,
  kind: string,
  data: unknown,
  options: { key?: string; ownerId?: string; state?: string } = {},
) {
  return ctx.tx.record.create({
    data: {
      guildId: ctx.guildId,
      kind,
      key: options.key ?? randomUUID(),
      ownerId: options.ownerId ?? ctx.actor.userId,
      state: options.state ?? 'active',
      data: json(data),
    },
  });
}
export async function updateRecord(
  ctx: DomainContext,
  kind: string,
  id: string,
  data: unknown,
  expectedRevision: number,
  state?: string,
) {
  const current = await getRecord(ctx, kind, id);
  if (current.revision !== expectedRevision)
    throw new DomainError(
      'REVISION_CONFLICT',
      'This record changed. Review the latest version.',
      409,
      { currentRevision: current.revision },
    );
  return ctx.tx.record.update({
    where: { id: current.id },
    data: {
      data: json(data),
      revision: { increment: 1 },
      ...(state ? { state } : {}),
    },
  });
}
export class Platform {
  constructor(public readonly db: PrismaClient) {}
  async read<T>(actor: Actor, handler: (ctx: DomainContext) => Promise<T>) {
    return this.db.$transaction((tx) => handler(context(tx, actor, null)));
  }
  async mutate<T>(
    actor: Actor,
    scope: string,
    key: string,
    input: unknown,
    handler: (ctx: DomainContext) => Promise<T>,
  ) {
    if (!key || key.length > 128)
      throw new DomainError(
        'INVALID_INPUT',
        'A stable idempotency key is required.',
      );
    const attempts = 10;
    for (let attempt = 0; attempt < attempts; attempt++)
      try {
        return await this.db.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.guildId},0))`;
            if (actor.sessionId) {
              const current = await tx.$queryRaw<
                { id: string }[]
              >`SELECT "id" FROM "Session" WHERE "id" = ${actor.sessionId} AND "userId" = ${actor.userId} AND "expiresAt" > now() FOR SHARE`;
              if (!current.length)
                throw new DomainError(
                  'UNAUTHENTICATED',
                  'Your session was revoked. Sign in again.',
                  401,
                );
            }
            const requestHash = hash(input),
              where = {
                guildId_actorId_scope_key: {
                  guildId: actor.guildId,
                  actorId: actor.userId,
                  scope,
                  key,
                },
              };
            const previous = await tx.operation.findUnique({ where });
            if (previous) {
              if (previous.requestHash !== requestHash)
                throw new DomainError(
                  'IDEMPOTENCY_CONFLICT',
                  'This request key was already used with different input.',
                  409,
                );
              return { data: previous.result as T, operation: previous };
            }
            const operation = await tx.operation
              .create({
                data: {
                  guildId: actor.guildId,
                  actorId: actor.userId,
                  scope,
                  key,
                  requestHash,
                },
              })
              .catch((error: unknown) => {
                throw (error as { code?: unknown }).code === 'P2002'
                  ? new OperationKeyRace()
                  : error;
              });
            const ctx = context(tx, actor, operation.id),
              data = await handler(ctx);
            const effects = await tx.outbox.count({
              where: { operationId: operation.id },
            });
            const saved = await tx.operation.update({
              where: { id: operation.id },
              data: {
                result: json(data),
                deliveryStatus: effects ? 'pending' : 'applied',
              },
            });
            await tx.auditLog.create({
              data: {
                guildId: actor.guildId,
                actorId: actor.userId,
                action: scope,
                operationId: operation.id,
                summary: { outcome: 'committed' },
              },
            });
            return { data, operation: saved };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (
          !isTransactionConflict(error) &&
          !(error instanceof OperationKeyRace)
        )
          throw error;
        if (attempt >= attempts - 1)
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'The request is busy; retry with the same key.',
            503,
          );
        // Retry only rolled-back transactions, outside locks. Proportional jitter keeps
        // contending serializable transactions from retrying in lockstep.
        const ceiling = Math.min(400, 15 * 2 ** attempt);
        await new Promise((resolve) =>
          setTimeout(resolve, ceiling / 2 + Math.random() * (ceiling / 2)),
        );
      }
    throw new DomainError(
      'SERVICE_UNAVAILABLE',
      'The request is busy; retry with the same key.',
      503,
    );
  }
  async route(
    actor: Actor,
    route: DomainRoute,
    input: unknown,
    params: Record<string, string>,
    key: string,
  ) {
    requireCapability(actor, actor.guildId, route.capability);
    const parsed = route.schema ? route.schema.parse(input) : input;
    if (route.method === 'GET')
      return {
        data: await this.read(actor, (ctx) =>
          route.handler(ctx, parsed, params),
        ),
      };
    return this.mutate(
      actor,
      route.path,
      key,
      { params, input: parsed },
      (ctx) => route.handler(ctx, parsed, params),
    );
  }
}
