import { json, type PrismaClient } from '@sparko/db';

/** Remove retained export payloads as well as denying expired downloads. */
export async function purgeExpiredExports(
  db: PrismaClient,
  now = new Date(),
): Promise<number> {
  const expired = await db.accountRequest.updateMany({
    where: {
      kind: 'export',
      state: 'ready',
      createdAt: { lte: new Date(now.getTime() - 30 * 86_400_000) },
    },
    data: { state: 'expired', data: json({}) },
  });
  return expired.count;
}

export async function purgeExpiredPrivatePayloads(
  db: PrismaClient,
  now = new Date(),
): Promise<void> {
  await db.record.deleteMany({
    where: {
      kind: { in: ['ai.request', 'ticket.form', 'application.form'] },
      data: { path: ['expiresAt'], lte: now.toISOString() },
    },
  });
  await db.transcript.deleteMany({ where: { expiresAt: { lte: now } } });
}
