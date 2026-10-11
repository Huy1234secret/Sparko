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
      const config = await tx.featureConfig.findUnique({
        where: { guildId_featureId: { guildId: actor.guildId, featureId } },
      });
      if (!config || !jsonObject(config.config)['enabled'])
        throw new DomainError(
          'FEATURE_DISABLED',
          'Enable this module before using it.',
          409,
        );
    },
  };
  return ctx;
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
  // Prisma's PostgreSQL adapter can surface commit conflicts as DriverAdapterError.
  const cause = value['cause'];
  return (
    !!cause &&
    typeof cause === 'object' &&
    ['40001', '40P01'].includes(
      String((cause as Record<string, unknown>)['originalCode']),
    )
  );
}
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
    for (let attempt = 0; attempt < 8; attempt++)
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
            const operation = await tx.operation.create({
              data: {
                guildId: actor.guildId,
                actorId: actor.userId,
                scope,
                key,
                requestHash,
              },
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
        if (!isTransactionConflict(error)) throw error;
        if (attempt >= 7)
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'The request is busy; retry with the same key.',
            503,
          );
        // Retry only rolled-back transactions, outside locks, with bounded jitter.
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(250, 10 * 2 ** attempt) + Math.floor(Math.random() * 10),
          ),
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
