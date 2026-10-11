import { json, type PrismaClient } from '@sparko/db';
import { DomainError } from '@sparko/contracts';
import { EffectExecutor, type OutboxWork } from './effects.js';
import { DiscordRest } from './discord.js';
import {
  DeliveryUncertainError,
  classifyDeliveryFailure,
  isResourceCreation,
} from './failure.js';

export async function processOutbox(
  db: PrismaClient,
  discord: DiscordRest,
  outboxId: string,
): Promise<void> {
  const now = new Date();
  const previous = await db.outbox.findUnique({ where: { id: outboxId } });
  if (!previous) return;
  const claimed = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outbox-claim:${previous.guildId}`},0))`;
    // One durable execution lease per guild serializes REST effects across replicas.
    // Only this short claim transaction holds a lock; network calls run after commit.
    const active = await tx.outbox.findFirst({
      where: {
        guildId: previous.guildId,
        id: { not: previous.id },
        state: 'running',
        leaseUntil: { gt: now },
      },
      select: { id: true },
    });
    if (active) return { count: 0 };
    return tx.outbox.updateMany({
      where: {
        id: previous.id,
        fence: previous.fence,
        OR: [
          { state: { in: ['pending', 'retry'] }, dueAt: { lte: now } },
          { state: 'running', leaseUntil: { lt: now } },
        ],
      },
      data: {
        state: 'running',
        fence: { increment: 1 },
        attempts: { increment: 1 },
        leaseUntil: new Date(now.getTime() + 60_000),
      },
    });
  });
  if (!claimed.count) return;
  const work: OutboxWork = {
    id: previous.id,
    guildId: previous.guildId,
    type: previous.type,
    payload: previous.payload,
    attempts: previous.attempts + 1,
    fence: previous.fence + 1,
    operationId: previous.operationId,
  };
  const fenceWhere = { id: work.id, fence: work.fence, state: 'running' };
  let leaseLost = false;
  const assertCurrent = async () => {
    const current =
      !leaseLost &&
      (await db.outbox.findFirst({
        where: { ...fenceWhere, leaseUntil: { gt: new Date() } },
        select: { id: true },
      }));
    if (!current)
      throw new DeliveryUncertainError(
        'This delivery lost its lease. Reconcile the last request before retrying.',
      );
  };
  const leaseHeartbeat = setInterval(() => {
    void db.outbox
      .updateMany({
        where: fenceWhere,
        data: { leaseUntil: new Date(Date.now() + 60_000) },
      })
      .then((result) => {
        if (!result.count) leaseLost = true;
      })
      .catch(() => {
        leaseLost = true;
      });
  }, 15_000);
  leaseHeartbeat.unref();
  try {
    await assertCurrent();
    await new EffectExecutor(
      db,
      discord.scoped(assertCurrent),
      assertCurrent,
    ).execute(work);
    await assertCurrent();
    if (leaseLost)
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'The delivery lease changed; reconcile its result.',
        503,
      );
    await db.outbox.updateMany({
      where: fenceWhere,
      data: { state: 'applied', leaseUntil: null, lastError: null },
    });
  } catch (error) {
    const decision = classifyDeliveryFailure(
      error,
      work.attempts,
      isResourceCreation(work.type),
    );
    const finalized = await db.outbox.updateMany({
      where: fenceWhere,
      data: {
        state: decision.state,
        leaseUntil: null,
        lastError: decision.message,
        ...(decision.retryAt ? { dueAt: decision.retryAt } : {}),
      },
    });
    if (finalized.count && work.type === 'ticket.create')
      await db.ticket.updateMany({
        where: {
          id:
            typeof previous.payload === 'object' &&
            previous.payload &&
            !Array.isArray(previous.payload) &&
            typeof previous.payload['ticketId'] === 'string'
              ? previous.payload['ticketId']
              : '',
          guildId: work.guildId,
          channelId: null,
        },
        data: {
          state:
            decision.state === 'unknown'
              ? 'reconciliation_required'
              : decision.state === 'blocked'
                ? 'failed'
                : 'creating',
        },
      });
    if (
      finalized.count &&
      work.type === 'ticket.capture' &&
      ['unknown', 'blocked', 'dead'].includes(decision.state)
    )
      await db.ticket.updateMany({
        where: {
          id:
            typeof previous.payload === 'object' &&
            previous.payload &&
            !Array.isArray(previous.payload) &&
            typeof previous.payload['ticketId'] === 'string'
              ? previous.payload['ticketId']
              : '',
          guildId: work.guildId,
          state: 'closing',
        },
        data: { state: 'capture_failed' },
      });
  } finally {
    clearInterval(leaseHeartbeat);
  }
  if (previous.operationId) {
    const states = await db.outbox.findMany({
      where: { operationId: previous.operationId },
      select: { state: true },
    });
    const deliveryStatus = states.every((effect) => effect.state === 'applied')
      ? 'applied'
      : states.some((effect) =>
            ['unknown', 'dead', 'blocked'].includes(effect.state),
          )
        ? states.some((effect) => effect.state === 'unknown')
          ? 'unknown'
          : 'failed'
        : 'pending';
    await db.operation.updateMany({
      where: { id: previous.operationId },
      data: { deliveryStatus },
    });
    if (deliveryStatus === 'failed' || deliveryStatus === 'unknown')
      await db.auditLog.create({
        data: {
          guildId: work.guildId,
          actorId: discord.botUserId,
          action: 'delivery.state',
          operationId: previous.operationId,
          summary: json({
            effectId: work.id,
            type: work.type,
            state: deliveryStatus,
          }),
        },
      });
  }
}
