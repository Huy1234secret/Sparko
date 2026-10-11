import { json, type PrismaClient } from '@sparko/db';
import { DomainError } from '@sparko/contracts';
import { EffectExecutor, type OutboxWork } from './effects.js';
import { DiscordRest } from './discord.js';
import { classifyDeliveryFailure, isResourceCreation } from './failure.js';

export async function processOutbox(db: PrismaClient, discord: DiscordRest, outboxId: string): Promise<void> {
  const now = new Date(); const previous = await db.outbox.findUnique({ where: { id: outboxId } }); if (!previous) return;
  const claimed = await db.outbox.updateMany({ where: { id: previous.id, fence: previous.fence, OR: [{ state: { in: ['pending', 'retry'] }, dueAt: { lte: now } }, { state: 'running', leaseUntil: { lt: now } }] }, data: { state: 'running', fence: { increment: 1 }, attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + 60_000) } });
  if (!claimed.count) return;
  const work: OutboxWork = { id: previous.id, guildId: previous.guildId, type: previous.type, payload: previous.payload, attempts: previous.attempts + 1, fence: previous.fence + 1 };
  const fenceWhere = { id: work.id, fence: work.fence, state: 'running' };
  let leaseLost = false;
  const leaseHeartbeat = setInterval(() => { void db.outbox.updateMany({ where: fenceWhere, data: { leaseUntil: new Date(Date.now() + 60_000) } }).then((result) => { if (!result.count) leaseLost = true; }).catch(() => { leaseLost = true; }); }, 15_000); leaseHeartbeat.unref();
  try {
    await new EffectExecutor(db, discord).execute(work);
    if (leaseLost) throw new DomainError('SERVICE_UNAVAILABLE', 'The delivery lease changed; reconcile its result.', 503);
    await db.outbox.updateMany({ where: fenceWhere, data: { state: 'applied', leaseUntil: null, lastError: null } });
  } catch (error) {
    const decision = classifyDeliveryFailure(error, work.attempts, isResourceCreation(work.type));
    await db.outbox.updateMany({ where: fenceWhere, data: { state: decision.state, leaseUntil: null, lastError: decision.message, ...(decision.retryAt ? { dueAt: decision.retryAt } : {}) } });
    if (work.type === 'ticket.create') await db.ticket.updateMany({ where: { id: typeof previous.payload === 'object' && previous.payload && !Array.isArray(previous.payload) && typeof previous.payload['ticketId'] === 'string' ? previous.payload['ticketId'] : '', guildId: work.guildId, channelId: null }, data: { state: decision.state === 'unknown' ? 'reconciliation_required' : decision.state === 'blocked' ? 'failed' : 'creating' } });
  } finally { clearInterval(leaseHeartbeat); }
  if (previous.operationId) {
    const states = await db.outbox.findMany({ where: { operationId: previous.operationId }, select: { state: true } });
    const deliveryStatus = states.every((effect) => effect.state === 'applied') ? 'applied' : states.some((effect) => ['unknown', 'dead', 'blocked'].includes(effect.state)) ? states.some((effect) => effect.state === 'unknown') ? 'unknown' : 'failed' : 'pending';
    await db.operation.updateMany({ where: { id: previous.operationId }, data: { deliveryStatus } });
    if (deliveryStatus === 'failed' || deliveryStatus === 'unknown') await db.auditLog.create({ data: { guildId: work.guildId, actorId: discord.botUserId, action: 'delivery.state', operationId: previous.operationId, summary: json({ effectId: work.id, type: work.type, state: deliveryStatus }) } });
  }
}
