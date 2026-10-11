import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { DomainError, Snowflake } from '@sparko/contracts';
import { json } from '@sparko/db';
import {
  createRecord,
  getRecord,
  jsonObject,
  updateRecord,
  type DomainContext,
  type DomainRoute,
} from './core.js';
import { grantXp, weightedChoice } from './community.js';

import {
  EconomyId as Id,
  EconomyReason as Reason,
  MAX_MINOR,
  MinorUnits,
  PositiveUnits,
  Quantity,
  EconomySlug as Slug,
  EconomyInstant as Instant,
  EconomyRevision as Revision,
  EconomyConfigSchema,
  EconomyRewardConfigSchema,
  TradeConfigSchema,
  CollectionConfigSchema,
  GameConfigSchema,
  LotteryConfigSchema,
  ReputationConfigSchema,
  WidgetConfigSchema,
  TransferSchema,
  ShopItemSchema,
  AssetsSchema as Assets,
  TradeSchema,
  AuctionSchema,
  RecipeSchema,
  TriviaQuestionSchema,
  LotterySchema,
  SeasonSchema,
  AchievementSchema,
} from '@sparko/contracts/economy';
export { MAX_MINOR, economyConfigSchemas } from '@sparko/contracts/economy';

async function cfg<T>(
  ctx: DomainContext,
  featureId: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const row = await ctx.tx.featureConfig.findUnique({
    where: { guildId_featureId: { guildId: ctx.guildId, featureId } },
  });
  return schema.parse(row?.config ?? {});
}
async function keyed(ctx: DomainContext, kind: string, key: string) {
  return ctx.tx.record.findUnique({
    where: { guildId_kind_key: { guildId: ctx.guildId, kind, key } },
  });
}
async function save(
  ctx: DomainContext,
  kind: string,
  key: string,
  data: unknown,
  ownerId = ctx.actor.userId,
  state = 'active',
) {
  return ctx.tx.record.upsert({
    where: { guildId_kind_key: { guildId: ctx.guildId, kind, key } },
    create: {
      guildId: ctx.guildId,
      kind,
      key,
      data: json(data),
      ownerId,
      state,
    },
    update: { data: json(data), state, revision: { increment: 1 } },
  });
}
function day(ctx: DomainContext) {
  return ctx.now.toISOString().slice(0, 10);
}
function conflict(message: string): never {
  throw new DomainError('INVALID_INPUT', message, 409);
}
export function feeFor(amount: bigint, basisPoints: number) {
  if (
    amount < 0n ||
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10000
  )
    throw new DomainError('INVALID_INPUT', 'Invalid fee.');
  return (amount * BigInt(basisPoints)) / 10000n;
}
export function sumEntries(entries: readonly { amount: bigint }[]) {
  return entries.reduce((sum, e) => sum + e.amount, 0n);
}
export function validateAccountBalance(
  ownerId: string,
  system: boolean,
  balance: bigint,
) {
  if (balance > MAX_MINOR || balance < -MAX_MINOR)
    conflict('Balance exceeds the supported integer limit.');
  if (balance < 0n && !(system && ownerId === '@issuer'))
    conflict('Insufficient virtual balance.');
}
async function account(ctx: DomainContext, ownerId: string) {
  const system = ownerId.startsWith('@');
  if (!system) Snowflake.parse(ownerId);
  if (
    system &&
    !/^@(issuer|sink|escrow:[a-z]+:[a-zA-Z0-9-]{1,128})$/.test(ownerId)
  )
    throw new DomainError('INVALID_INPUT', 'Unknown system account.');
  return ctx.tx.ledgerAccount.upsert({
    where: {
      guildId_ownerId_currency: {
        guildId: ctx.guildId,
        ownerId,
        currency: 'spark',
      },
    },
    create: { guildId: ctx.guildId, ownerId, currency: 'spark', system },
    update: {},
  });
}
export async function balance(ctx: DomainContext, userId: string) {
  const a = await account(ctx, userId);
  return {
    userId,
    guildId: ctx.guildId,
    currency: a.currency,
    balance: a.balance.toString(),
    virtualOnly: true,
    cashRedemption: false,
  };
}
export type Posting = { ownerId: string; amount: bigint };
/** Must run inside Platform.mutate's serializable transaction and guild advisory lock. */
export async function postLedger(
  ctx: DomainContext,
  key: string,
  kind: string,
  postings: readonly Posting[],
) {
  if (
    !key ||
    key.length > 256 ||
    !postings.length ||
    sumEntries(postings) !== 0n
  )
    throw new DomainError(
      'INVALID_INPUT',
      'Ledger postings must balance to zero.',
    );
  const combined = new Map<string, bigint>();
  for (const posting of postings)
    combined.set(
      posting.ownerId,
      (combined.get(posting.ownerId) ?? 0n) + posting.amount,
    );
  const nonzero = [...combined]
    .filter(([, amount]) => amount !== 0n)
    .sort(([a], [b]) => a.localeCompare(b));
  if (!nonzero.length)
    throw new DomainError(
      'INVALID_INPUT',
      'A ledger operation must move funds.',
    );
  const existing = await ctx.tx.ledgerTransaction.findUnique({
    where: { guildId_key: { guildId: ctx.guildId, key } },
    include: { entries: { include: { account: true } } },
  });
  if (existing) {
    const previous = existing.entries
      .map((e) => [e.account.ownerId, e.amount.toString()])
      .sort(([a], [b]) => a!.localeCompare(b!));
    if (
      existing.kind !== kind ||
      JSON.stringify(previous) !==
        JSON.stringify(
          nonzero.map(([owner, amount]) => [owner, amount.toString()]),
        )
    )
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'The ledger source was already used with different postings.',
        409,
      );
    return { id: existing.id, key, kind, replayed: true };
  }
  const accounts = await Promise.all(
    nonzero.map(async ([ownerId, amount]) => {
      const row = await account(ctx, ownerId);
      validateAccountBalance(ownerId, row.system, row.balance + amount);
      return { row, amount };
    }),
  );
  const transaction = await ctx.tx.ledgerTransaction.create({
    data: {
      guildId: ctx.guildId,
      key,
      kind,
      entries: {
        create: accounts.map(({ row, amount }) => ({
          accountId: row.id,
          amount,
        })),
      },
    },
  });
  for (const { row, amount } of accounts)
    await ctx.tx.ledgerAccount.update({
      where: { id: row.id },
      data: { balance: { increment: amount } },
    });
  return { id: transaction.id, key, kind, replayed: false };
}
export async function reconcileLedger(ctx: DomainContext) {
  const accounts = await ctx.tx.ledgerAccount.findMany({
    where: { guildId: ctx.guildId },
  });
  const sums = await ctx.tx.ledgerEntry.groupBy({
    by: ['accountId'],
    where: { account: { guildId: ctx.guildId } },
    _sum: { amount: true },
  });
  const lookup = new Map(sums.map((s) => [s.accountId, s._sum.amount ?? 0n]));
  const mismatches = accounts
    .filter((a) => a.balance !== (lookup.get(a.id) ?? 0n))
    .map((a) => ({
      accountId: a.id,
      ownerId: a.ownerId,
      cached: a.balance.toString(),
      ledger: (lookup.get(a.id) ?? 0n).toString(),
    }));
  const total = accounts.reduce((sum, a) => sum + a.balance, 0n);
  return {
    guildId: ctx.guildId,
    accounts: accounts.length,
    total: total.toString(),
    balanced: total === 0n && mismatches.length === 0,
    mismatches,
    checkedAt: ctx.now.toISOString(),
  };
}
export async function grantVirtual(
  ctx: DomainContext,
  userId: string,
  amount: bigint,
  source: string,
  reason: string,
) {
  Snowflake.parse(userId);
  Reason.parse(reason);
  if (amount < 0n || amount > 1000000000n)
    conflict('Reward amount is outside the supported bounds.');
  if (!amount) return { awarded: '0', balance: await balance(ctx, userId) };
  const economy = await cfg(ctx, 'R51', EconomyConfigSchema),
    current = await account(ctx, userId);
  const previous = await ctx.tx.ledgerTransaction.findUnique({
    where: { guildId_key: { guildId: ctx.guildId, key: source } },
  });
  if (!previous && current.balance + amount > BigInt(economy.maxBalance))
    conflict('The configured maximum virtual balance would be exceeded.');
  const transaction = await postLedger(ctx, source, 'reward', [
    { ownerId: '@issuer', amount: -amount },
    { ownerId: userId, amount },
  ]);
  if (!transaction.replayed)
    await createRecord(
      ctx,
      'economy.reward',
      {
        userId,
        amount: amount.toString(),
        reason,
        source,
        transactionId: transaction.id,
      },
      { key: source, ownerId: userId },
    );
  return {
    awarded: amount.toString(),
    transaction,
    balance: await balance(ctx, userId),
  };
}
export async function claimReward(ctx: DomainContext, kind: 'daily' | 'work') {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R52');
  const rules = await cfg(ctx, 'R52', EconomyRewardConfigSchema),
    userId = ctx.actor.userId;
  if (rules.excludedRoleIds.some((r) => ctx.actor.roles.includes(r)))
    throw new DomainError(
      'FORBIDDEN',
      'Your current roles are excluded from rewards.',
      403,
    );
  const state = await keyed(ctx, 'economy.cooldown', `${userId}:${kind}`),
    old = jsonObject(state?.data),
    cooldown =
      kind === 'daily' ? rules.dailyCooldownSeconds : rules.workCooldownSeconds;
  if (
    typeof old['lastAt'] === 'string' &&
    Date.parse(old['lastAt']) + cooldown * 1000 > ctx.now.getTime()
  )
    throw new DomainError('RATE_LIMITED', 'This reward is cooling down.', 429, {
      nextEligibleAt: new Date(
        Date.parse(old['lastAt']) + cooldown * 1000,
      ).toISOString(),
    });
  const daily = await keyed(
      ctx,
      'economy.reward-budget',
      `${userId}:${day(ctx)}`,
    ),
    spent = BigInt(String(jsonObject(daily?.data)['amount'] ?? '0'));
  const multiplier = Math.min(
    rules.maxMultiplierBps,
    Math.max(
      10000,
      ...rules.roleMultipliers
        .filter((r) => ctx.actor.roles.includes(r.roleId))
        .map((r) => r.multiplierBps),
    ),
  );
  const base =
      kind === 'daily'
        ? rules.dailyAmount
        : randomInt(rules.workMin, rules.workMax + 1),
    amount = (BigInt(base) * BigInt(multiplier)) / 10000n;
  if (spent + amount > BigInt(rules.dailyCap))
    conflict('The daily reward budget is exhausted.');
  const result = await grantVirtual(
    ctx,
    userId,
    amount,
    `claim:${ctx.operationId}`,
    `${kind} reward`,
  );
  await save(ctx, 'economy.cooldown', `${userId}:${kind}`, {
    lastAt: ctx.now.toISOString(),
  });
  await save(ctx, 'economy.reward-budget', `${userId}:${day(ctx)}`, {
    amount: (spent + amount).toString(),
  });
  return {
    ...result,
    nextEligibleAt: new Date(ctx.now.getTime() + cooldown * 1000).toISOString(),
  };
}

async function transfer(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('R51');
  const data = TransferSchema.parse(input),
    rules = await cfg(ctx, 'R51', EconomyConfigSchema),
    amount = BigInt(data.amount);
  if (data.recipientId === ctx.actor.userId) conflict('Choose another member.');
  await requireObservedMember(ctx, data.recipientId);
  if (amount > BigInt(rules.maxTransfer))
    conflict('Transfer exceeds the configured limit.');
  const usage = await keyed(
      ctx,
      'economy.transfer-budget',
      `${ctx.actor.userId}:${day(ctx)}`,
    ),
    used = BigInt(String(jsonObject(usage?.data)['amount'] ?? '0'));
  if (used + amount > BigInt(rules.transferDailyCap))
    conflict('The daily transfer limit would be exceeded.');
  const receiver = await account(ctx, data.recipientId);
  if (receiver.balance + amount > BigInt(rules.maxBalance))
    conflict('The recipient maximum balance would be exceeded.');
  const fee = feeFor(amount, rules.transferFeeBps),
    result = await postLedger(ctx, `transfer:${ctx.operationId}`, 'transfer', [
      { ownerId: ctx.actor.userId, amount: -(amount + fee) },
      { ownerId: data.recipientId, amount },
      { ownerId: '@sink', amount: fee },
    ]);
  await save(
    ctx,
    'economy.transfer-budget',
    `${ctx.actor.userId}:${day(ctx)}`,
    { amount: (used + amount).toString() },
  );
  return {
    transaction: result,
    amount: data.amount,
    fee: fee.toString(),
    balance: await balance(ctx, ctx.actor.userId),
  };
}
async function requireObservedMember(ctx: DomainContext, userId: string) {
  const row = await keyed(ctx, 'community.member', userId),
    member = jsonObject(row?.data);
  if (
    member['present'] !== true ||
    member['bot'] !== false ||
    typeof member['observedAt'] !== 'string' ||
    ctx.now.getTime() - Date.parse(member['observedAt']) > 300000
  )
    throw new DomainError(
      'SERVICE_UNAVAILABLE',
      'Current non-bot membership must be observed before this action.',
      503,
    );
  return member;
}

async function item(ctx: DomainContext, itemId: string) {
  const row = await keyed(ctx, 'shop.item', itemId);
  if (!row || row.state !== 'active')
    throw new DomainError('NOT_FOUND', 'The item is unavailable.', 404);
  return { row, definition: ShopItemSchema.parse(row.data) };
}
async function inventory(ctx: DomainContext, ownerId: string, itemId: string) {
  const row = await keyed(ctx, 'inventory', `${ownerId}:${itemId}`);
  return { row, quantity: Number(jsonObject(row?.data)['quantity'] ?? 0) };
}
async function uniqueHeld(ctx: DomainContext, ownerId: string, itemId: string) {
  return ctx.tx.record.findFirst({
    where: {
      guildId: ctx.guildId,
      kind: 'inventory.unique-hold',
      ownerId,
      data: { path: ['itemId'], equals: itemId },
    },
  });
}
async function holdUnique(
  ctx: DomainContext,
  escrow: string,
  ownerId: string,
  itemId: string,
) {
  return save(
    ctx,
    'inventory.unique-hold',
    `${escrow}:${ownerId}:${itemId}`,
    { itemId, escrow, heldAt: ctx.now.toISOString() },
    ownerId,
  );
}
async function releaseUniqueHolds(ctx: DomainContext, escrow: string) {
  await ctx.tx.record.deleteMany({
    where: {
      guildId: ctx.guildId,
      kind: 'inventory.unique-hold',
      data: { path: ['escrow'], equals: escrow },
    },
  });
}
export function nextInventory(quantity: number, delta: number, unique = false) {
  const next = quantity + delta;
  if (
    ![quantity, delta, next].every(Number.isSafeInteger) ||
    next < 0 ||
    next > 1000000 ||
    (unique && next > 1)
  )
    conflict('Inventory quantity or unique ownership would be violated.');
  return next;
}
async function adjustInventory(
  ctx: DomainContext,
  ownerId: string,
  itemId: string,
  delta: number,
  unique = false,
) {
  if (unique && delta > 0 && (await uniqueHeld(ctx, ownerId, itemId)))
    conflict('Unique ownership is reserved by an open trade or auction.');
  const current = await inventory(ctx, ownerId, itemId),
    quantity = nextInventory(current.quantity, delta, unique);
  return save(
    ctx,
    'inventory',
    `${ownerId}:${itemId}`,
    { itemId, quantity },
    ownerId,
  );
}
async function purchase(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R53');
  const data = z.object({ itemId: Slug, quantity: Quantity }).parse(input),
    { row, definition } = await item(ctx, data.itemId);
  if (
    definition.requiredRoleIds.length &&
    !definition.requiredRoleIds.some((r) => ctx.actor.roles.includes(r))
  )
    throw new DomainError(
      'FORBIDDEN',
      'You do not meet this item role requirement.',
      403,
    );
  if (definition.stock !== null && definition.stock < data.quantity)
    conflict('Insufficient shop stock.');
  const prior = await keyed(
      ctx,
      'shop.purchase-limit',
      `${ctx.actor.userId}:${data.itemId}`,
    ),
    used = Number(jsonObject(prior?.data)['quantity'] ?? 0);
  if (used + data.quantity > definition.perMemberLimit)
    conflict('The per-member purchase limit would be exceeded.');
  const price = BigInt(definition.price) * BigInt(data.quantity);
  await postLedger(ctx, `purchase:${ctx.operationId}`, 'purchase', [
    { ownerId: ctx.actor.userId, amount: -price },
    { ownerId: '@sink', amount: price },
  ]);
  await adjustInventory(
    ctx,
    ctx.actor.userId,
    data.itemId,
    data.quantity,
    definition.unique,
  );
  await updateRecord(
    ctx,
    'shop.item',
    row.id,
    {
      ...definition,
      stock:
        definition.stock === null ? null : definition.stock - data.quantity,
    },
    row.revision,
  );
  await save(ctx, 'shop.purchase-limit', `${ctx.actor.userId}:${data.itemId}`, {
    quantity: used + data.quantity,
  });
  const order = await createRecord(
    ctx,
    'shop.order',
    {
      itemId: data.itemId,
      quantity: data.quantity,
      price: price.toString(),
      itemSnapshot: definition,
      userId: ctx.actor.userId,
      deliveryPolicy: 'retry-or-manager-refund',
    },
    { state: definition.type === 'role' ? 'pending-delivery' : 'delivered' },
  );
  if (definition.type === 'role')
    await ctx.effect('economy.role.deliver', {
      orderId: order.id,
      userId: ctx.actor.userId,
      roleId: definition.roleId,
    });
  return { order, balance: await balance(ctx, ctx.actor.userId) };
}
/** Persist intent before REST delivery so a manager refund cannot race an in-flight grant. */
export async function beginRoleOrderDelivery(
  ctx: DomainContext,
  orderId: string,
) {
  const order = await getRecord(ctx, 'shop.order', orderId);
  if (!['pending-delivery', 'delivery-failed'].includes(order.state))
    return order;
  return updateRecord(
    ctx,
    'shop.order',
    order.id,
    { ...jsonObject(order.data), deliveryStartedAt: ctx.now.toISOString() },
    order.revision,
    'delivery-in-progress',
  );
}
export async function completeRoleOrder(
  ctx: DomainContext,
  orderId: string,
  outcome: 'delivered' | 'failed',
  detail?: string,
) {
  const order = await getRecord(ctx, 'shop.order', orderId);
  if (
    !['pending-delivery', 'delivery-failed', 'delivery-in-progress'].includes(
      order.state,
    )
  )
    return order;
  return updateRecord(
    ctx,
    'shop.order',
    order.id,
    {
      ...jsonObject(order.data),
      ...(detail ? { deliveryError: detail.slice(0, 500) } : {}),
      deliveryObservedAt: ctx.now.toISOString(),
    },
    order.revision,
    outcome === 'delivered' ? 'delivered' : 'delivery-failed',
  );
}
async function refundOrder(ctx: DomainContext, id: string, reason: string) {
  const order = await getRecord(ctx, 'shop.order', id);
  if (order.state === 'refunded') return order;
  if (!['pending-delivery', 'delivery-failed'].includes(order.state))
    conflict('Only an undelivered role order can be refunded.');
  const data = jsonObject(order.data),
    definition = ShopItemSchema.parse(data['itemSnapshot']),
    quantity = Quantity.parse(data['quantity']),
    userId = Snowflake.parse(data['userId']),
    price = BigInt(PositiveUnits.parse(data['price']));
  await postLedger(ctx, `refund:${id}`, 'refund', [
    { ownerId: '@sink', amount: -price },
    { ownerId: userId, amount: price },
  ]);
  await adjustInventory(ctx, userId, definition.itemId, -quantity);
  const current = await item(ctx, definition.itemId);
  if (current.definition.stock !== null)
    await updateRecord(
      ctx,
      'shop.item',
      current.row.id,
      {
        ...current.definition,
        stock: nextInventory(current.definition.stock, quantity),
      },
      current.row.revision,
    );
  const limit = await keyed(
    ctx,
    'shop.purchase-limit',
    `${userId}:${definition.itemId}`,
  );
  if (limit)
    await save(
      ctx,
      'shop.purchase-limit',
      limit.key,
      {
        quantity: nextInventory(
          Number(jsonObject(limit.data)['quantity']),
          -quantity,
        ),
      },
      userId,
    );
  return updateRecord(
    ctx,
    'shop.order',
    id,
    {
      ...data,
      refundReason: Reason.parse(reason),
      refundedAt: ctx.now.toISOString(),
    },
    order.revision,
    'refunded',
  );
}
async function consume(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R53');
  const data = z.object({ itemId: Slug, quantity: Quantity }).parse(input),
    { definition } = await item(ctx, data.itemId);
  if (definition.type !== 'consumable')
    conflict('This item is not consumable.');
  await adjustInventory(ctx, ctx.actor.userId, data.itemId, -data.quantity);
  const result = await grantVirtual(
    ctx,
    ctx.actor.userId,
    BigInt(definition.consumeReward) * BigInt(data.quantity),
    `consume:${ctx.operationId}`,
    `Consumed ${data.quantity} ${definition.name}`,
  );
  await createRecord(ctx, 'inventory.consumption', data);
  return result;
}

type AssetsValue = z.infer<typeof Assets>;
function deadline(ctx: DomainContext, value: string, maxSeconds: number) {
  const time = Date.parse(value);
  if (time <= ctx.now.getTime() || time > ctx.now.getTime() + maxSeconds * 1000)
    conflict('Deadline must be within the configured future window.');
}
async function moveItems(
  ctx: DomainContext,
  from: string,
  to: string,
  assets: AssetsValue,
) {
  for (const asset of assets.items) {
    const { definition } = await item(ctx, asset.itemId);
    if (!definition.tradeable || definition.type === 'role')
      conflict('This item cannot be traded.');
    await adjustInventory(ctx, from, asset.itemId, -asset.quantity);
    await adjustInventory(
      ctx,
      to,
      asset.itemId,
      asset.quantity,
      !to.startsWith('@') && definition.unique,
    );
    if (definition.unique && !from.startsWith('@') && to.startsWith('@'))
      await holdUnique(ctx, to, from, asset.itemId);
  }
}
async function moveFunds(
  ctx: DomainContext,
  key: string,
  from: string,
  to: string,
  amount: string,
  kind: string,
) {
  const value = BigInt(amount);
  if (value)
    return postLedger(ctx, key, kind, [
      { ownerId: from, amount: -value },
      { ownerId: to, amount: value },
    ]);
  return null;
}
async function createTrade(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R54');
  const data = TradeSchema.parse(input),
    rules = await cfg(ctx, 'R54', TradeConfigSchema);
  if (data.recipientId === ctx.actor.userId) conflict('Choose another member.');
  await requireObservedMember(ctx, data.recipientId);
  deadline(ctx, data.expiresAt, rules.maxDurationSeconds);
  const trade = await createRecord(
      ctx,
      'trade',
      { ...data, senderId: ctx.actor.userId },
      { state: 'open' },
    ),
    escrow = `@escrow:trade:${trade.id}`;
  await moveFunds(
    ctx,
    `trade-lock:${trade.id}`,
    ctx.actor.userId,
    escrow,
    data.offered.amount,
    'escrow-lock',
  );
  await moveItems(ctx, ctx.actor.userId, escrow, data.offered);
  await ctx.effect(
    'economy.trade.expire',
    { tradeId: trade.id },
    new Date(data.expiresAt),
  );
  return trade;
}
async function acceptTrade(ctx: DomainContext, id: string) {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R54');
  const trade = await getRecord(ctx, 'trade', id),
    data = TradeSchema.extend({ senderId: Snowflake }).parse(trade.data);
  if (ctx.actor.userId !== data.recipientId)
    throw new DomainError(
      'FORBIDDEN',
      'Only the named recipient can accept.',
      403,
    );
  if (trade.state === 'settled') return trade;
  if (trade.state !== 'open' || Date.parse(data.expiresAt) <= ctx.now.getTime())
    conflict('This trade is no longer open.');
  const escrow = `@escrow:trade:${id}`;
  await moveFunds(
    ctx,
    `trade-request-lock:${id}`,
    data.recipientId,
    escrow,
    data.requested.amount,
    'escrow-lock',
  );
  await moveItems(ctx, data.recipientId, escrow, data.requested);
  await releaseUniqueHolds(ctx, escrow);
  await moveFunds(
    ctx,
    `trade-pay-sender:${id}`,
    escrow,
    data.senderId,
    data.requested.amount,
    'trade-settlement',
  );
  await moveFunds(
    ctx,
    `trade-pay-recipient:${id}`,
    escrow,
    data.recipientId,
    data.offered.amount,
    'trade-settlement',
  );
  await moveItems(ctx, escrow, data.senderId, data.requested);
  await moveItems(ctx, escrow, data.recipientId, data.offered);
  return updateRecord(
    ctx,
    'trade',
    id,
    { ...data, settledAt: ctx.now.toISOString() },
    trade.revision,
    'settled',
  );
}
async function cancelTrade(ctx: DomainContext, id: string, expired = false) {
  const trade = await getRecord(ctx, 'trade', id),
    data = TradeSchema.extend({ senderId: Snowflake }).parse(trade.data);
  if (!expired && ![data.senderId, data.recipientId].includes(ctx.actor.userId))
    throw new DomainError(
      'FORBIDDEN',
      'Only trade participants can cancel.',
      403,
    );
  if (trade.state !== 'open') return trade;
  if (expired && Date.parse(data.expiresAt) > ctx.now.getTime())
    conflict('The trade deadline has not arrived.');
  const escrow = `@escrow:trade:${id}`;
  await releaseUniqueHolds(ctx, escrow);
  await moveFunds(
    ctx,
    `trade-return:${id}`,
    escrow,
    data.senderId,
    data.offered.amount,
    'escrow-return',
  );
  await moveItems(ctx, escrow, data.senderId, data.offered);
  return updateRecord(
    ctx,
    'trade',
    id,
    { ...data, endedAt: ctx.now.toISOString() },
    trade.revision,
    expired ? 'expired' : 'cancelled',
  );
}
async function createAuction(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R54');
  const data = AuctionSchema.parse(input),
    rules = await cfg(ctx, 'R54', TradeConfigSchema);
  deadline(ctx, data.endsAt, rules.maxDurationSeconds);
  if (BigInt(data.minimumBid) > BigInt(rules.maxBid))
    conflict('Minimum bid exceeds the maximum bid.');
  const auction = await createRecord(
    ctx,
    'auction',
    { ...data, sellerId: ctx.actor.userId, bidderId: null, bid: '0' },
    { state: 'open' },
  );
  await moveItems(ctx, ctx.actor.userId, `@escrow:auction:${auction.id}`, {
    amount: '0',
    items: [{ itemId: data.itemId, quantity: data.quantity }],
  });
  await ctx.effect(
    'economy.auction.settle',
    { auctionId: auction.id },
    new Date(data.endsAt),
  );
  return auction;
}
const AuctionData = AuctionSchema.extend({
  sellerId: Snowflake,
  bidderId: Snowflake.nullable(),
  bid: MinorUnits,
});
async function bidAuction(
  ctx: DomainContext,
  id: string,
  amountString: string,
) {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R54');
  const auction = await getRecord(ctx, 'auction', id),
    data = AuctionData.parse(auction.data),
    amount = BigInt(PositiveUnits.parse(amountString)),
    rules = await cfg(ctx, 'R54', TradeConfigSchema);
  if (auction.state !== 'open' || Date.parse(data.endsAt) <= ctx.now.getTime())
    conflict('This auction is closed.');
  if (data.sellerId === ctx.actor.userId)
    conflict('A seller cannot bid on their own auction.');
  const minimum = data.bidderId
    ? BigInt(data.bid) + BigInt(data.minimumIncrement)
    : BigInt(data.minimumBid);
  if (amount < minimum || amount > BigInt(rules.maxBid))
    conflict('Bid must meet the minimum and configured maximum.');
  const escrow = `@escrow:auction:${id}`;
  const { definition } = await item(ctx, data.itemId);
  if (definition.unique && data.bidderId !== ctx.actor.userId) {
    if (
      (await inventory(ctx, ctx.actor.userId, data.itemId)).quantity > 0 ||
      (await uniqueHeld(ctx, ctx.actor.userId, data.itemId))
    )
      conflict('A unique item is already owned or reserved by this bidder.');
    if (data.bidderId)
      await ctx.tx.record.deleteMany({
        where: {
          guildId: ctx.guildId,
          kind: 'inventory.unique-hold',
          key: `${escrow}:${data.bidderId}:${data.itemId}`,
        },
      });
    await holdUnique(ctx, escrow, ctx.actor.userId, data.itemId);
  }
  if (data.bidderId === ctx.actor.userId)
    await moveFunds(
      ctx,
      `bid-increase:${ctx.operationId}`,
      ctx.actor.userId,
      escrow,
      (amount - BigInt(data.bid)).toString(),
      'auction-bid',
    );
  else {
    await moveFunds(
      ctx,
      `bid:${ctx.operationId}`,
      ctx.actor.userId,
      escrow,
      amount.toString(),
      'auction-bid',
    );
    if (data.bidderId)
      await moveFunds(
        ctx,
        `outbid:${ctx.operationId}`,
        escrow,
        data.bidderId,
        data.bid,
        'escrow-return',
      );
  }
  await createRecord(ctx, 'auction.bid', {
    auctionId: id,
    userId: ctx.actor.userId,
    amount: amount.toString(),
  });
  return updateRecord(
    ctx,
    'auction',
    id,
    { ...data, bidderId: ctx.actor.userId, bid: amount.toString() },
    auction.revision,
  );
}
async function settleAuction(ctx: DomainContext, id: string, cancel = false) {
  const auction = await getRecord(ctx, 'auction', id),
    data = AuctionData.parse(auction.data);
  if (auction.state !== 'open') return auction;
  if (cancel && (ctx.actor.userId !== data.sellerId || data.bidderId))
    throw new DomainError(
      'FORBIDDEN',
      'Only the seller can cancel an auction before its first bid.',
      403,
    );
  if (!cancel && Date.parse(data.endsAt) > ctx.now.getTime())
    conflict('The auction deadline has not arrived.');
  const escrow = `@escrow:auction:${id}`,
    recipient = data.bidderId ?? data.sellerId;
  await releaseUniqueHolds(ctx, escrow);
  await moveItems(ctx, escrow, recipient, {
    amount: '0',
    items: [{ itemId: data.itemId, quantity: data.quantity }],
  });
  if (data.bidderId)
    await moveFunds(
      ctx,
      `auction-settle:${id}`,
      escrow,
      data.sellerId,
      data.bid,
      'auction-settlement',
    );
  return updateRecord(
    ctx,
    'auction',
    id,
    { ...data, settledAt: ctx.now.toISOString() },
    auction.revision,
    cancel ? 'cancelled' : data.bidderId ? 'settled' : 'unsold',
  );
}

async function hunt(ctx: DomainContext) {
  await ctx.requireFeature('R55');
  const rules = await cfg(ctx, 'R55', CollectionConfigSchema);
  if (!rules.drops.length)
    conflict('No collectible hunt drops have been configured.');
  const current = await keyed(ctx, 'collection.hunt-state', ctx.actor.userId),
    data = jsonObject(current?.data),
    count = data['day'] === day(ctx) ? Number(data['count'] ?? 0) : 0;
  if (count >= rules.huntsPerDay)
    conflict('The daily hunt limit is exhausted.');
  if (
    typeof data['lastAt'] === 'string' &&
    Date.parse(data['lastAt']) + rules.huntCooldownSeconds * 1000 >
      ctx.now.getTime()
  )
    throw new DomainError('RATE_LIMITED', 'Hunting is cooling down.', 429);
  // Validate the whole distribution before drawing, so misconfiguration never changes odds silently.
  for (const drop of rules.drops) {
    const { definition } = await item(ctx, drop.itemId);
    if (definition.type !== 'collectible')
      conflict('Hunt drops must reference active collectible items.');
  }
  const selected = weightedChoice(rules.drops),
    { definition } = await item(ctx, selected.itemId);
  await adjustInventory(
    ctx,
    ctx.actor.userId,
    selected.itemId,
    selected.quantity,
    definition.unique,
  );
  await save(ctx, 'collection.hunt-state', ctx.actor.userId, {
    day: day(ctx),
    count: count + 1,
    lastAt: ctx.now.toISOString(),
  });
  return createRecord(ctx, 'collection.hunt', {
    ...selected,
    rarity: definition.rarity,
    source: ctx.operationId,
    occurredAt: ctx.now.toISOString(),
  });
}
async function craft(ctx: DomainContext, recipeId: string) {
  await ctx.requireFeature('R55');
  const row = await keyed(ctx, 'collection.recipe', recipeId);
  if (!row || row.state !== 'active')
    throw new DomainError('NOT_FOUND', 'Recipe is unavailable.', 404);
  const recipe = RecipeSchema.parse(row.data),
    result = await item(ctx, recipe.resultItemId);
  if (result.definition.type === 'role')
    conflict('Crafting cannot grant Discord roles.');
  for (const ingredient of recipe.ingredients) {
    const current = await item(ctx, ingredient.itemId);
    if (current.definition.type === 'role')
      conflict('Discord role items cannot be ingredients.');
    await adjustInventory(
      ctx,
      ctx.actor.userId,
      ingredient.itemId,
      -ingredient.quantity,
    );
  }
  await moveFunds(
    ctx,
    `craft:${ctx.operationId}`,
    ctx.actor.userId,
    '@sink',
    recipe.cost,
    'craft',
  );
  await adjustInventory(
    ctx,
    ctx.actor.userId,
    recipe.resultItemId,
    recipe.resultQuantity,
    result.definition.unique,
  );
  return createRecord(ctx, 'collection.craft', {
    recipeSnapshot: recipe,
    source: ctx.operationId,
  });
}

async function startGame(ctx: DomainContext) {
  await ctx.requireFeature('R56');
  const rules = await cfg(ctx, 'R56', GameConfigSchema),
    state = await keyed(ctx, 'game.cooldown', ctx.actor.userId),
    previous = jsonObject(state?.data),
    count = previous['day'] === day(ctx) ? Number(previous['count'] ?? 0) : 0;
  if (count >= rules.playsPerDay)
    conflict('The daily game limit is exhausted.');
  if (
    typeof previous['lastAt'] === 'string' &&
    Date.parse(previous['lastAt']) + rules.cooldownSeconds * 1000 >
      ctx.now.getTime()
  )
    throw new DomainError('RATE_LIMITED', 'Games are cooling down.', 429);
  const questions = await ctx.tx.record.findMany({
    where: { guildId: ctx.guildId, kind: 'game.question', state: 'active' },
    take: 1000,
  });
  if (!questions.length) conflict('No questions have been configured.');
  const question = TriviaQuestionSchema.parse(
      questions[randomInt(questions.length)]!.data,
    ),
    expiresAt = new Date(
      ctx.now.getTime() + rules.answerSeconds * 1000,
    ).toISOString();
  const game = await createRecord(
    ctx,
    'game.session',
    {
      questionSnapshot: question,
      reward: rules.reward,
      xp: rules.xp,
      expiresAt,
    },
    { state: 'awaiting-answer' },
  );
  await save(ctx, 'game.cooldown', ctx.actor.userId, {
    day: day(ctx),
    count: count + 1,
    lastAt: ctx.now.toISOString(),
  });
  return {
    id: game.id,
    question: question.question,
    choices: question.choices,
    expiresAt,
    reward: rules.reward,
  };
}
async function answerGame(ctx: DomainContext, id: string, choice: number) {
  await ctx.requireFeature('R56');
  const game = await getRecord(ctx, 'game.session', id);
  if (game.ownerId !== ctx.actor.userId)
    throw new DomainError('FORBIDDEN', 'This is another member game.', 403);
  const data = jsonObject(game.data),
    question = TriviaQuestionSchema.parse(data['questionSnapshot']);
  if (game.state !== 'awaiting-answer')
    conflict('The game already has a final answer.');
  if (Date.parse(Instant.parse(data['expiresAt'])) <= ctx.now.getTime()) {
    await updateRecord(ctx, 'game.session', id, data, game.revision, 'expired');
    return { outcome: 'expired', rewarded: '0' };
  }
  if (
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice >= question.choices.length
  )
    conflict('Choose a valid answer.');
  const correct = choice === question.correctIndex,
    reward = correct ? MinorUnits.parse(data['reward']) : '0';
  if (correct) {
    await ctx.requireFeature('R51');
    await grantVirtual(
      ctx,
      ctx.actor.userId,
      BigInt(reward),
      `game:${id}`,
      'Trivia reward',
    );
    const xp = z.number().int().min(0).max(10000).parse(data['xp']);
    if (xp)
      await grantXp(ctx, ctx.actor.userId, xp, `game:${id}`, 'Trivia reward');
  }
  await updateRecord(
    ctx,
    'game.session',
    id,
    { ...data, selectedIndex: choice, answeredAt: ctx.now.toISOString() },
    game.revision,
    correct ? 'won' : 'lost',
  );
  return {
    outcome: correct ? 'won' : 'lost',
    correctIndex: question.correctIndex,
    rewarded: reward,
  };
}

async function createLottery(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R67');
  const rules = await cfg(ctx, 'R67', LotteryConfigSchema),
    data = LotterySchema.parse(input);
  if (!rules.virtualOnlyAcknowledged)
    conflict(
      'A manager must acknowledge virtual-only rules before enabling a lottery.',
    );
  if (
    data.maxTicketsPerMember > rules.maxTicketsPerMember ||
    data.maxTotalTickets > rules.maxTotalTickets ||
    BigInt(data.ticketPrice) * BigInt(data.maxTicketsPerMember) >
      BigInt(rules.maxSpendPerDraw)
  )
    conflict('Lottery rules exceed the configured limits.');
  deadline(ctx, data.endsAt, 604800);
  const row = await createRecord(
    ctx,
    'lottery',
    {
      ...data,
      totalTickets: 0,
      virtualOnly: true,
      cashRedemption: false,
      rulesPublishedAt: ctx.now.toISOString(),
    },
    { state: 'open' },
  );
  await ctx.effect(
    'economy.lottery.draw',
    { lotteryId: row.id },
    new Date(data.endsAt),
  );
  return row;
}
const LotteryData = LotterySchema.extend({
  totalTickets: z.number().int().min(0).max(1000000),
  virtualOnly: z.literal(true),
  cashRedemption: z.literal(false),
  rulesPublishedAt: Instant,
});
async function enterLottery(ctx: DomainContext, id: string, input: unknown) {
  await ctx.requireFeature('R51');
  await ctx.requireFeature('R67');
  const { tickets } = z
      .object({
        tickets: z.number().int().min(1).max(1000),
        optIn: z.literal(true),
      })
      .parse(input),
    row = await getRecord(ctx, 'lottery', id),
    data = LotteryData.parse(row.data);
  if (row.state !== 'open' || Date.parse(data.endsAt) <= ctx.now.getTime())
    conflict('This lottery is closed.');
  const entry = await keyed(ctx, 'lottery.entry', `${id}:${ctx.actor.userId}`),
    previous = Number(jsonObject(entry?.data)['tickets'] ?? 0);
  if (
    previous + tickets > data.maxTicketsPerMember ||
    data.totalTickets + tickets > data.maxTotalTickets
  )
    conflict('Lottery ticket limit would be exceeded.');
  await moveFunds(
    ctx,
    `lottery-entry:${ctx.operationId}`,
    ctx.actor.userId,
    `@escrow:lottery:${id}`,
    (BigInt(data.ticketPrice) * BigInt(tickets)).toString(),
    'lottery-entry',
  );
  const saved = await save(ctx, 'lottery.entry', `${id}:${ctx.actor.userId}`, {
    lotteryId: id,
    userId: ctx.actor.userId,
    tickets: previous + tickets,
    optIn: true,
    ticketPrice: data.ticketPrice,
  });
  await updateRecord(
    ctx,
    'lottery',
    id,
    { ...data, totalTickets: data.totalTickets + tickets },
    row.revision,
  );
  return saved;
}
export function chooseTicket(
  entries: readonly { userId: string; tickets: number }[],
  index: number,
) {
  const total = entries.reduce((n, e) => n + e.tickets, 0);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= total ||
    entries.some((e) => !Number.isInteger(e.tickets) || e.tickets < 1) ||
    total > 1000000
  )
    throw new DomainError('INVALID_INPUT', 'Invalid lottery ticket draw.');
  let offset = index;
  for (const entry of entries) {
    if (offset < entry.tickets) return entry.userId;
    offset -= entry.tickets;
  }
  throw new DomainError('INVALID_INPUT', 'Invalid lottery distribution.');
}
async function drawLottery(ctx: DomainContext, id: string, cancel = false) {
  const row = await getRecord(ctx, 'lottery', id),
    data = LotteryData.parse(row.data);
  if (row.state !== 'open') return row;
  if (!cancel && Date.parse(data.endsAt) > ctx.now.getTime())
    conflict('The lottery deadline has not arrived.');
  const records = await ctx.tx.record.findMany({
    where: {
      guildId: ctx.guildId,
      kind: 'lottery.entry',
      data: { path: ['lotteryId'], equals: id },
    },
    orderBy: { key: 'asc' },
    take: 1000000,
  });
  const entries = records.map((e) =>
      z.object({ userId: Snowflake, tickets: Quantity }).parse(e.data),
    ),
    total = entries.reduce((n, e) => n + e.tickets, 0),
    escrow = `@escrow:lottery:${id}`;
  if (total !== data.totalTickets)
    conflict('The lottery entries require reconciliation before settlement.');
  let winnerId: string | null = null;
  if (cancel) {
    for (const entry of entries)
      await moveFunds(
        ctx,
        `lottery-refund:${id}:${entry.userId}`,
        escrow,
        entry.userId,
        (BigInt(data.ticketPrice) * BigInt(entry.tickets)).toString(),
        'lottery-refund',
      );
  } else if (total) {
    winnerId = chooseTicket(entries, randomInt(total));
    await moveFunds(
      ctx,
      `lottery-prize:${id}`,
      escrow,
      winnerId,
      (BigInt(data.ticketPrice) * BigInt(total)).toString(),
      'lottery-prize',
    );
  }
  const draw = await createRecord(
    ctx,
    'lottery.draw',
    {
      lotteryId: id,
      rulesSnapshot: data,
      entries,
      winnerId,
      totalTickets: total,
      pot: (BigInt(data.ticketPrice) * BigInt(total)).toString(),
      drawnAt: ctx.now.toISOString(),
      method: 'crypto.randomInt weighted ticket index',
    },
    { key: id, state: cancel ? 'cancelled' : 'drawn' },
  );
  await updateRecord(
    ctx,
    'lottery',
    id,
    { ...data, drawId: draw.id, winnerId },
    row.revision,
    cancel ? 'cancelled' : 'drawn',
  );
  return draw;
}

async function commend(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('R68');
  const data = z
      .object({ recipientId: Snowflake, reason: Reason })
      .parse(input),
    rules = await cfg(ctx, 'R68', ReputationConfigSchema);
  if (ctx.actor.userId === data.recipientId)
    conflict('Self-commendations are not allowed.');
  const sender = await requireObservedMember(ctx, ctx.actor.userId);
  await requireObservedMember(ctx, data.recipientId);
  if (
    rules.minimumMemberDays &&
    (typeof sender['joinedAt'] !== 'string' ||
      Date.parse(sender['joinedAt']) + rules.minimumMemberDays * 86400000 >
        ctx.now.getTime())
  )
    conflict('Established membership is required to commend.');
  const pair = await keyed(
      ctx,
      'reputation.pair',
      `${ctx.actor.userId}:${data.recipientId}`,
    ),
    pairData = jsonObject(pair?.data);
  if (
    typeof pairData['lastAt'] === 'string' &&
    Date.parse(pairData['lastAt']) + rules.pairCooldownDays * 86400000 >
      ctx.now.getTime()
  )
    conflict('Repeated commendations for this member are cooling down.');
  const budget = await keyed(
      ctx,
      'reputation.budget',
      `${ctx.actor.userId}:${day(ctx)}`,
    ),
    used = Number(jsonObject(budget?.data)['count'] ?? 0);
  if (used >= rules.dailyLimit)
    conflict('The daily commendation limit is exhausted.');
  await save(
    ctx,
    'reputation.pair',
    `${ctx.actor.userId}:${data.recipientId}`,
    { lastAt: ctx.now.toISOString() },
  );
  await save(ctx, 'reputation.budget', `${ctx.actor.userId}:${day(ctx)}`, {
    count: used + 1,
  });
  const profile = await keyed(ctx, 'reputation.profile', data.recipientId),
    total = Number(jsonObject(profile?.data)['total'] ?? 0) + 1;
  await save(
    ctx,
    'reputation.profile',
    data.recipientId,
    { total },
    data.recipientId,
  );
  return createRecord(
    ctx,
    'reputation.event',
    {
      senderId: ctx.actor.userId,
      recipientId: data.recipientId,
      reason: data.reason,
      at: ctx.now.toISOString(),
    },
    { ownerId: data.recipientId },
  );
}

async function startSeason(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('R13');
  const data = SeasonSchema.parse(input);
  deadline(ctx, data.endsAt, 366 * 86400);
  if (
    await ctx.tx.record.findFirst({
      where: { guildId: ctx.guildId, kind: 'season', state: 'active' },
    })
  )
    conflict('Archive the active season before starting another.');
  const profiles = await ctx.tx.record.findMany({
    where: { guildId: ctx.guildId, kind: 'level.profile' },
    take: 100000,
  });
  const baseline = Object.fromEntries(
    profiles.map((p) => [
      p.ownerId!,
      z
        .number()
        .int()
        .nonnegative()
        .parse(jsonObject(p.data)['xp'] ?? 0),
    ]),
  );
  const season = await createRecord(ctx, 'season', {
    ...data,
    startedAt: ctx.now.toISOString(),
    baseline,
    policy: 'positive lifetime XP difference; lifetime history is preserved',
  });
  await ctx.effect(
    'economy.season.archive',
    { seasonId: season.id },
    new Date(data.endsAt),
  );
  return {
    ...season,
    data: {
      ...data,
      startedAt: ctx.now.toISOString(),
      participants: profiles.length,
    },
  };
}
export function seasonalXp(lifetime: number, baseline: number) {
  if (
    ![lifetime, baseline].every(Number.isSafeInteger) ||
    lifetime < 0 ||
    baseline < 0
  )
    throw new DomainError('INVALID_INPUT', 'Invalid seasonal XP.');
  return Math.max(0, lifetime - baseline);
}
async function seasonResults(
  ctx: DomainContext,
  id: string,
  publicOnly = false,
) {
  const season = await getRecord(ctx, 'season', id),
    snapshot = jsonObject(season.data),
    baseline = jsonObject(snapshot['baseline']);
  if (season.state === 'archived') {
    const archive = await keyed(ctx, 'season.archive', id);
    const rows = z
      .array(
        z.object({
          userId: Snowflake,
          xp: z.number().int().nonnegative(),
          publicProfile: z.boolean(),
        }),
      )
      .parse(jsonObject(archive?.data)['results'] ?? []);
    const currentPublicIds = publicOnly
      ? new Set(
          (
            await ctx.tx.record.findMany({
              where: {
                guildId: ctx.guildId,
                kind: 'level.profile',
                data: { path: ['publicProfile'], equals: true },
              },
              select: { ownerId: true },
              take: 100000,
            })
          ).map((profile) => profile.ownerId),
        )
      : null;
    return rows
      .filter(
        (r) =>
          !publicOnly || (r.publicProfile && currentPublicIds?.has(r.userId)),
      )
      .map(({ userId, xp }) => ({ userId, xp }))
      .slice(0, 100);
  }
  const profiles = await ctx.tx.record.findMany({
    where: { guildId: ctx.guildId, kind: 'level.profile' },
    take: 100000,
  });
  return profiles
    .map((p) => ({
      userId: p.ownerId!,
      xp: seasonalXp(
        Number(jsonObject(p.data)['xp'] ?? 0),
        Number(baseline[p.ownerId!] ?? 0),
      ),
      publicProfile: jsonObject(p.data)['publicProfile'] === true,
    }))
    .filter((p) => !publicOnly || p.publicProfile)
    .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId));
}
async function archiveSeason(ctx: DomainContext, id: string, early = false) {
  const season = await getRecord(ctx, 'season', id);
  if (season.state === 'archived') return keyed(ctx, 'season.archive', id);
  if (
    !early &&
    Date.parse(String(jsonObject(season.data)['endsAt'])) > ctx.now.getTime()
  )
    conflict('The season deadline has not arrived.');
  const results = await seasonResults(ctx, id),
    archive = await createRecord(
      ctx,
      'season.archive',
      {
        seasonId: id,
        name: jsonObject(season.data)['name'],
        results,
        archivedAt: ctx.now.toISOString(),
        lifetimePreserved: true,
      },
      { key: id, state: 'immutable' },
    );
  await updateRecord(
    ctx,
    'season',
    id,
    {
      ...jsonObject(season.data),
      archiveId: archive.id,
      archivedAt: ctx.now.toISOString(),
    },
    season.revision,
    'archived',
  );
  return archive;
}

async function achievementProgress(
  ctx: DomainContext,
  input: z.infer<typeof AchievementSchema>,
) {
  if (input.metric === 'lifetimeXp') {
    const row = await keyed(ctx, 'level.profile', ctx.actor.userId);
    return Number(jsonObject(row?.data)['xp'] ?? 0);
  }
  if (input.metric === 'seasonXp') {
    const rows = await seasonResults(ctx, input.seasonId!);
    return rows.find((r) => r.userId === ctx.actor.userId)?.xp ?? 0;
  }
  if (input.metric === 'collection')
    return (await inventory(ctx, ctx.actor.userId, input.itemId!)).quantity;
  if (input.metric === 'reputation') {
    const row = await keyed(ctx, 'reputation.profile', ctx.actor.userId);
    return Number(jsonObject(row?.data)['total'] ?? 0);
  }
  return ctx.tx.record.count({
    where: {
      guildId: ctx.guildId,
      ownerId: ctx.actor.userId,
      kind: input.metric === 'purchases' ? 'shop.order' : 'collection.hunt',
      ...(input.metric === 'purchases' ? { state: 'delivered' } : {}),
    },
  });
}
async function claimAchievement(ctx: DomainContext, id: string) {
  await ctx.requireFeature('R14');
  const row = await keyed(ctx, 'achievement', id);
  if (!row || row.state !== 'active')
    throw new DomainError('NOT_FOUND', 'Achievement unavailable.', 404);
  const rules = AchievementSchema.parse(row.data),
    key = `${ctx.actor.userId}:${id}:${rules.seasonId ?? 'lifetime'}`,
    previous = await keyed(ctx, 'achievement.award', key);
  if (previous) return previous;
  const progress = await achievementProgress(ctx, rules);
  if (progress < rules.threshold)
    conflict('Achievement conditions have not been reached.');
  if (rules.reward !== '0') {
    await ctx.requireFeature('R51');
    await grantVirtual(
      ctx,
      ctx.actor.userId,
      BigInt(rules.reward),
      `achievement:${key}`,
      `Achievement: ${rules.name}`,
    );
  }
  if (rules.xp)
    await grantXp(
      ctx,
      ctx.actor.userId,
      rules.xp,
      `achievement:${key}`,
      `Achievement: ${rules.name}`,
    );
  return createRecord(
    ctx,
    'achievement.award',
    {
      achievementId: id,
      rulesSnapshot: rules,
      progress,
      badge: rules.badge,
      awardedAt: ctx.now.toISOString(),
    },
    { key },
  );
}

/** Public mount calls this using a server-selected guild context; it reveals only explicit opt-ins. */
export async function publicWidget(
  ctx: DomainContext,
  type: 'leaderboard' | 'status',
) {
  const rules = await cfg(ctx, 'R70', WidgetConfigSchema);
  if (
    !rules.enabled ||
    !(type === 'leaderboard' ? rules.publicLeaderboard : rules.publicStatus)
  )
    throw new DomainError(
      'NOT_FOUND',
      'This public widget is unavailable.',
      404,
    );
  if (type === 'status') {
    const guild = await ctx.tx.guild.findUnique({ where: { id: ctx.guildId } });
    return {
      guildId: ctx.guildId,
      installed: guild?.installed ?? false,
      observedAt: guild?.observedAt?.toISOString() ?? null,
    };
  }
  const rows = await ctx.tx.record.findMany({
    where: {
      guildId: ctx.guildId,
      kind: 'level.profile',
      data: { path: ['publicProfile'], equals: true },
    },
    take: 100000,
  });
  return {
    guildId: ctx.guildId,
    entries: rows
      .map((p) => ({
        userId: p.ownerId!,
        xp: Number(jsonObject(p.data)['xp'] ?? 0),
      }))
      .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId))
      .slice(0, 100),
    observedAt: ctx.now.toISOString(),
  };
}

export async function runEconomyJob(
  ctx: DomainContext,
  type: string,
  raw: unknown,
) {
  const data = jsonObject(raw);
  if (type === 'economy.trade.expire')
    return cancelTrade(ctx, Id.parse(data['tradeId']), true);
  if (type === 'economy.auction.settle')
    return settleAuction(ctx, Id.parse(data['auctionId']));
  if (type === 'economy.lottery.draw')
    return drawLottery(ctx, Id.parse(data['lotteryId']));
  if (type === 'economy.season.archive')
    return archiveSeason(ctx, Id.parse(data['seasonId']));
  throw new DomainError('INVALID_INPUT', 'Unknown economy job.');
}

export const economyRoutes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/guilds/:guildId/economy/me',
    capability: 'member',
    handler: async (ctx) => ({
      balance: await balance(ctx, ctx.actor.userId),
      cooldowns: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'economy.cooldown',
          ownerId: ctx.actor.userId,
        },
      }),
      rewards: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'economy.reward',
          ownerId: ctx.actor.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    }),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/economy/history',
    capability: 'member',
    handler: async (ctx) => {
      const entries = await ctx.tx.ledgerEntry.findMany({
        where: { account: { guildId: ctx.guildId, ownerId: ctx.actor.userId } },
        include: { transaction: true },
        orderBy: { transaction: { createdAt: 'desc' } },
        take: 100,
      });
      return entries.map((e) => ({
        id: e.id,
        amount: e.amount.toString(),
        transactionId: e.transactionId,
        kind: e.transaction.kind,
        createdAt: e.transaction.createdAt.toISOString(),
      }));
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/economy/daily',
    capability: 'member',
    handler: (ctx) => claimReward(ctx, 'daily'),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/economy/work',
    capability: 'member',
    handler: (ctx) => claimReward(ctx, 'work'),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/economy/transfer',
    capability: 'member',
    schema: TransferSchema,
    handler: transfer,
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/economy/reconcile',
    capability: 'economy.manage',
    handler: reconcileLedger,
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/economy/grants',
    capability: 'economy.manage',
    schema: z.object({
      userId: Snowflake,
      amount: PositiveUnits,
      reason: Reason,
    }),
    handler: async (ctx, input) => {
      await ctx.requireFeature('R51');
      const data = z
        .object({ userId: Snowflake, amount: PositiveUnits, reason: Reason })
        .parse(input);
      return grantVirtual(
        ctx,
        data.userId,
        BigInt(data.amount),
        `admin:${ctx.operationId}`,
        data.reason,
      );
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/shop',
    capability: 'member',
    handler: async (ctx) =>
      ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'shop.item', state: 'active' },
        take: 1000,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/shop/items',
    capability: 'economy.manage',
    schema: ShopItemSchema,
    handler: async (ctx, input) => {
      await ctx.requireFeature('R53');
      const data = ShopItemSchema.parse(input);
      if (await keyed(ctx, 'shop.item', data.itemId))
        conflict(
          'Item IDs are permanent. Archive an existing item rather than redefining its ownership or delivery rules.',
        );
      return createRecord(ctx, 'shop.item', data, { key: data.itemId });
    },
  },
  {
    method: 'PUT',
    path: '/guilds/:guildId/shop/items/:id/stock',
    capability: 'economy.manage',
    schema: z.object({
      stock: z.number().int().min(0).max(1000000).nullable(),
      expectedRevision: Revision,
      reason: Reason,
    }),
    handler: async (ctx, input, params) => {
      const data = z
          .object({
            stock: z.number().int().min(0).max(1000000).nullable(),
            expectedRevision: Revision,
            reason: Reason,
          })
          .parse(input),
        current = await item(ctx, Slug.parse(params['id']));
      return updateRecord(
        ctx,
        'shop.item',
        current.row.id,
        { ...current.definition, stock: data.stock },
        data.expectedRevision,
      );
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/shop/purchase',
    capability: 'member',
    schema: z.object({ itemId: Slug, quantity: Quantity }),
    handler: purchase,
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/inventory/me',
    capability: 'member',
    handler: async (ctx) => ({
      items: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'inventory',
          ownerId: ctx.actor.userId,
        },
        take: 1000,
      }),
      orders: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'shop.order',
          ownerId: ctx.actor.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/inventory/consume',
    capability: 'member',
    schema: z.object({ itemId: Slug, quantity: Quantity }),
    handler: consume,
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/shop/orders/:id/refund',
    capability: 'economy.manage',
    schema: z.object({ reason: Reason }),
    handler: (ctx, input, params) =>
      refundOrder(
        ctx,
        Id.parse(params['id']),
        Reason.parse(jsonObject(input)['reason']),
      ),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/trades/me',
    capability: 'member',
    handler: async (ctx) =>
      ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'trade',
          OR: [
            { ownerId: ctx.actor.userId },
            { data: { path: ['recipientId'], equals: ctx.actor.userId } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/trades',
    capability: 'member',
    schema: TradeSchema,
    handler: createTrade,
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/trades/:id/accept',
    capability: 'member',
    handler: (ctx, _input, params) => acceptTrade(ctx, Id.parse(params['id'])),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/trades/:id/cancel',
    capability: 'member',
    handler: (ctx, _input, params) => cancelTrade(ctx, Id.parse(params['id'])),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/auctions',
    capability: 'member',
    handler: async (ctx) =>
      ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'auction' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/auctions',
    capability: 'member',
    schema: AuctionSchema,
    handler: createAuction,
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/auctions/:id/bid',
    capability: 'member',
    schema: z.object({ amount: PositiveUnits }),
    handler: (ctx, input, params) =>
      bidAuction(
        ctx,
        Id.parse(params['id']),
        PositiveUnits.parse(jsonObject(input)['amount']),
      ),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/auctions/:id/cancel',
    capability: 'member',
    handler: (ctx, _input, params) =>
      settleAuction(ctx, Id.parse(params['id']), true),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/collections',
    capability: 'member',
    handler: async (ctx) => ({
      recipes: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'collection.recipe',
          state: 'active',
        },
        take: 1000,
      }),
      collected: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'inventory',
          ownerId: ctx.actor.userId,
        },
        take: 1000,
      }),
      huntState: await keyed(ctx, 'collection.hunt-state', ctx.actor.userId),
    }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/collections/hunt',
    capability: 'member',
    handler: hunt,
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/collections/recipes',
    capability: 'economy.manage',
    schema: RecipeSchema,
    handler: async (ctx, input) => {
      const data = RecipeSchema.parse(input);
      if (await keyed(ctx, 'collection.recipe', data.recipeId))
        conflict('Recipe ID already exists.');
      await item(ctx, data.resultItemId);
      for (const ingredient of data.ingredients)
        await item(ctx, ingredient.itemId);
      return createRecord(ctx, 'collection.recipe', data, {
        key: data.recipeId,
      });
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/collections/craft',
    capability: 'member',
    schema: z.object({ recipeId: Slug }),
    handler: (ctx, input) =>
      craft(ctx, Slug.parse(jsonObject(input)['recipeId'])),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/games/questions',
    capability: 'economy.manage',
    schema: TriviaQuestionSchema,
    handler: async (ctx, input) => {
      const data = TriviaQuestionSchema.parse(input);
      return save(ctx, 'game.question', data.questionId, data);
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/games/questions',
    capability: 'economy.manage',
    handler: async (ctx) =>
      ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'game.question' },
        take: 1000,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/games/trivia',
    capability: 'member',
    handler: startGame,
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/games/:id/answer',
    capability: 'member',
    schema: z.object({ choice: z.number().int().min(0).max(5) }),
    handler: (ctx, input, params) =>
      answerGame(
        ctx,
        Id.parse(params['id']),
        z.number().int().parse(jsonObject(input)['choice']),
      ),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/lotteries',
    capability: 'member',
    handler: async (ctx) => ({
      lotteries: await ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'lottery' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      myEntries: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'lottery.entry',
          ownerId: ctx.actor.userId,
        },
        take: 100,
      }),
    }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/lotteries',
    capability: 'economy.manage',
    schema: LotterySchema,
    handler: createLottery,
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/lotteries/:id/enter',
    capability: 'member',
    schema: z.object({
      tickets: z.number().int().min(1).max(1000),
      optIn: z.literal(true),
    }),
    handler: (ctx, input, params) =>
      enterLottery(ctx, Id.parse(params['id']), input),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/lotteries/:id/cancel',
    capability: 'economy.manage',
    schema: z.object({ reason: Reason }),
    handler: (ctx, _input, params) =>
      drawLottery(ctx, Id.parse(params['id']), true),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/reputation/me',
    capability: 'member',
    handler: async (ctx) => ({
      profile: await keyed(ctx, 'reputation.profile', ctx.actor.userId),
      events: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'reputation.event',
          ownerId: ctx.actor.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/reputation/commend',
    capability: 'member',
    schema: z.object({ recipientId: Snowflake, reason: Reason }),
    handler: commend,
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/seasons',
    capability: 'member',
    handler: async (ctx) => {
      const rows = await ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'season' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return rows.map((r) => {
        const data = jsonObject(r.data);
        return {
          id: r.id,
          state: r.state,
          name: data['name'],
          startedAt: data['startedAt'],
          endsAt: data['endsAt'],
          archivedAt: data['archivedAt'] ?? null,
        };
      });
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/seasons',
    capability: 'community.manage',
    schema: SeasonSchema,
    handler: startSeason,
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/seasons/:id/leaderboard',
    capability: 'member',
    handler: async (ctx, _input, params) =>
      (await seasonResults(ctx, Id.parse(params['id']), true)).slice(0, 100),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/seasons/:id/archive',
    capability: 'community.manage',
    schema: z.object({ reason: Reason, confirmed: z.literal(true) }),
    handler: (ctx, _input, params) =>
      archiveSeason(ctx, Id.parse(params['id']), true),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/achievements',
    capability: 'community.manage',
    schema: AchievementSchema,
    handler: async (ctx, input) => {
      const data = AchievementSchema.parse(input);
      if (await keyed(ctx, 'achievement', data.achievementId))
        conflict('Achievement IDs are immutable.');
      return createRecord(ctx, 'achievement', data, {
        key: data.achievementId,
      });
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/achievements',
    capability: 'member',
    handler: async (ctx) => {
      const rows = await ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'achievement', state: 'active' },
        take: 1000,
      });
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          progress: await achievementProgress(
            ctx,
            AchievementSchema.parse(row.data),
          ),
        })),
      );
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/achievements/me',
    capability: 'member',
    handler: async (ctx) =>
      ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'achievement.award',
          ownerId: ctx.actor.userId,
        },
        take: 1000,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/achievements/:id/claim',
    capability: 'member',
    handler: (ctx, _input, params) =>
      claimAchievement(ctx, Slug.parse(params['id'])),
  },
];
