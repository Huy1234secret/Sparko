import { z } from 'zod';
import { jsonObject, type DomainContext } from './core.js';

/**
 * Server data is kept while Sparko is installed and deleted after it is
 * removed (see the privacy policy). A short grace period lets a server that
 * removed the bot by mistake add it back without losing its setup.
 */
export const REMOVAL_GRACE_DAYS = 7;
const REMOVAL = { kind: 'guild.removal', key: 'current' } as const;

/** The bot left the server: mark it uninstalled and schedule the purge. */
export async function guildRemoved(ctx: DomainContext) {
  const removedAt = ctx.now.toISOString();
  await ctx.tx.guild.update({
    where: { id: ctx.guildId },
    data: { installed: false },
  });
  await ctx.tx.record.upsert({
    where: { guildId_kind_key: { guildId: ctx.guildId, ...REMOVAL } },
    create: {
      guildId: ctx.guildId,
      ...REMOVAL,
      state: 'scheduled',
      data: { removedAt },
    },
    update: { state: 'scheduled', data: { removedAt } },
  });
  await ctx.effect(
    'guild.purge',
    { removedAt },
    new Date(ctx.now.getTime() + REMOVAL_GRACE_DAYS * 86_400_000),
  );
  return { removedAt };
}

/** The bot is back: cancel any pending purge. */
export async function guildReinstalled(ctx: DomainContext) {
  const cancelled = await ctx.tx.record.deleteMany({
    where: { guildId: ctx.guildId, ...REMOVAL },
  });
  return { cancelled: cancelled.count > 0 };
}

/**
 * Deletes everything Sparko holds for a server that removed it, unless the
 * bot came back or a later removal superseded this one. Billing records are
 * kept for accounting, and staff module policy is kept so a re-added server
 * cannot shed a block. Returns the stored file hashes the server referenced,
 * so the worker can remove files no other server still uses.
 */
export async function purgeGuild(
  ctx: DomainContext,
  raw: unknown,
  keepOutboxId: string,
) {
  const removedAt = z.iso.datetime().parse(jsonObject(raw)['removedAt']);
  const [guild, removal] = await Promise.all([
    ctx.tx.guild.findUnique({ where: { id: ctx.guildId } }),
    ctx.tx.record.findUnique({
      where: { guildId_kind_key: { guildId: ctx.guildId, ...REMOVAL } },
    }),
  ]);
  if (
    !guild ||
    guild.installed ||
    !removal ||
    jsonObject(removal.data)['removedAt'] !== removedAt
  )
    return { purged: false, assetHashes: [] as string[] };
  const where = { guildId: ctx.guildId };
  const assets = await ctx.tx.record.findMany({
    where: { ...where, kind: 'asset' },
    select: { data: true },
  });
  const assetHashes = assets
    .map((a) => jsonObject(a.data)['hash'])
    .filter((h): h is string => typeof h === 'string');
  const transactions = await ctx.tx.ledgerTransaction.findMany({
    where,
    select: { id: true },
  });
  // Ledger entries restrict deletion of their transactions and accounts.
  await ctx.tx.ledgerEntry.deleteMany({
    where: { transactionId: { in: transactions.map((t) => t.id) } },
  });
  await ctx.tx.ledgerTransaction.deleteMany({ where });
  await ctx.tx.ledgerAccount.deleteMany({ where });
  await ctx.tx.transcript.deleteMany({ where });
  await ctx.tx.ticket.deleteMany({ where });
  await ctx.tx.issuedControl.deleteMany({ where });
  await ctx.tx.publication.deleteMany({ where });
  await ctx.tx.template.deleteMany({ where });
  await ctx.tx.record.deleteMany({
    where: { ...where, NOT: { kind: { startsWith: 'billing.' } } },
  });
  await ctx.tx.featureConfig.deleteMany({ where });
  await ctx.tx.accessGrant.deleteMany({ where });
  await ctx.tx.auditLog.deleteMany({ where });
  await ctx.tx.outbox.deleteMany({
    where: { ...where, NOT: { id: keepOutboxId } },
  });
  await ctx.tx.operation.deleteMany({
    where: {
      ...where,
      ...(ctx.operationId ? { NOT: { id: ctx.operationId } } : {}),
    },
  });
  await ctx.tx.guild.update({
    where: { id: ctx.guildId },
    data: { memberCount: null, observedAt: null },
  });
  return { purged: true, assetHashes };
}
