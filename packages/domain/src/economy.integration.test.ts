import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, json } from '@sparko/db';
import type { Actor } from '@sparko/contracts';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import {
  Platform,
  jsonObject,
  type DomainContext,
  type DomainRoute,
} from './core.js';
import {
  balance,
  beginRoleOrderDelivery,
  completeRoleOrder,
  economyRoutes,
  grantVirtual,
  postLedger,
  publicWidget,
  reconcileLedger,
  runEconomyJob,
} from './economy.js';

const db = createDatabase(testDatabaseUrl()),
  platform = new Platform(db);
const guildId = '423456789012345671',
  otherGuildId = '423456789012345672';
const memberId = '423456789012345673',
  secondId = '423456789012345674',
  thirdId = '423456789012345675',
  roleId = '423456789012345676';
const actor = (userId = memberId, target = guildId): Actor => ({
  userId,
  guildId: target,
  roles: [],
  isAdmin: false,
  isOwner: false,
  capabilities: [],
  globalCapabilities: [],
});
const manager = (): Actor => ({ ...actor(), isAdmin: true });
const future = () => new Date(Date.now() + 600_000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();
const mutate = (
  who: Actor,
  key: string,
  handler: (ctx: DomainContext) => Promise<unknown>,
) => platform.mutate(who, 'economy-integration', key, { key }, handler);
function route(method: DomainRoute['method'], path: string) {
  const selected = economyRoutes.find(
    (r) => r.method === method && r.path === `/guilds/:guildId${path}`,
  );
  if (!selected) throw Error(`Missing route ${path}`);
  return selected;
}
const call = (
  who: Actor,
  method: DomainRoute['method'],
  path: string,
  input: unknown,
  key: string,
  params: Record<string, string> = {},
) => platform.route(who, route(method, path), input, params, key);
async function record(
  kind: string,
  key: string,
  data: unknown,
  state = 'active',
  ownerId = memberId,
) {
  return db.record.create({
    data: { guildId, kind, key, data: json(data), state, ownerId },
  });
}
async function units(id = memberId) {
  return (await platform.read(actor(id), (ctx) => balance(ctx, id))).balance;
}
async function grant(id = memberId, amount = 1000, key = `seed:${id}`) {
  return mutate(manager(), key, (ctx) =>
    grantVirtual(ctx, id, BigInt(amount), key, 'Disposable integration reward'),
  );
}
async function quantity(id: string, itemId: string) {
  const row = await db.record.findUnique({
    where: {
      guildId_kind_key: { guildId, kind: 'inventory', key: `${id}:${itemId}` },
    },
  });
  return Number(jsonObject(row?.data)['quantity'] ?? 0);
}
async function shop(itemId: string, overrides: Record<string, unknown> = {}) {
  return call(
    manager(),
    'POST',
    '/shop/items',
    { itemId, name: itemId, type: 'collectible', price: '10', ...overrides },
    `item:${itemId}`,
  );
}
async function purchase(
  id: string,
  itemId: string,
  count = 1,
  key = `buy:${id}:${itemId}`,
) {
  return call(
    actor(id),
    'POST',
    '/shop/purchase',
    { itemId, quantity: count },
    key,
  );
}
async function assertBalanced() {
  expect(await platform.read(manager(), reconcileLedger)).toMatchObject({
    balanced: true,
    total: '0',
    mismatches: [],
  });
}
async function cleanup() {
  await db.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({
      where: { transaction: { guildId: { in: [guildId, otherGuildId] } } },
    });
    await tx.ledgerTransaction.deleteMany({
      where: { guildId: { in: [guildId, otherGuildId] } },
    });
    await tx.ledgerAccount.deleteMany({
      where: { guildId: { in: [guildId, otherGuildId] } },
    });
    await tx.outbox.deleteMany({
      where: { guildId: { in: [guildId, otherGuildId] } },
    });
    await tx.auditLog.deleteMany({
      where: { guildId: { in: [guildId, otherGuildId] } },
    });
    await tx.operation.deleteMany({
      where: { guildId: { in: [guildId, otherGuildId] } },
    });
    await tx.record.deleteMany({
      where: { guildId: { in: [guildId, otherGuildId] } },
    });
    await tx.featureConfig.deleteMany({
      where: { guildId: { in: [guildId, otherGuildId] } },
    });
  });
}
beforeAll(async () => {
  for (const id of [guildId, otherGuildId])
    await db.guild.upsert({
      where: { id },
      create: { id, name: 'Disposable economy test', installed: true },
      update: {},
    });
});
beforeEach(async () => {
  await cleanup();
  for (const id of [guildId, otherGuildId])
    for (const [featureId, config] of Object.entries({
      R51: { enabled: true },
      R52: { enabled: true },
      R53: { enabled: true },
      R54: { enabled: true },
      R55: { enabled: true },
      R56: { enabled: true },
      R67: { enabled: true, virtualOnlyAcknowledged: true },
      R68: { enabled: true, minimumMemberDays: 0 },
      R13: { enabled: true },
      R14: { enabled: true },
      R70: { enabled: true, publicLeaderboard: true },
    }))
      await db.featureConfig.create({
        data: { guildId: id, featureId, config: json(config) },
      });
  for (const userId of [memberId, secondId, thirdId])
    await record(
      'community.member',
      userId,
      {
        present: true,
        bot: false,
        joinedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        observedAt: new Date().toISOString(),
      },
      'active',
      userId,
    );
});
afterAll(async () => {
  await cleanup();
  await db.guild.deleteMany({ where: { id: { in: [guildId, otherGuildId] } } });
  await db.$disconnect();
});

describe('PostgreSQL virtual economy settlement and concurrency', () => {
  it('enforces tenant, balanced posting, owner, and integer bounds through direct database writes', async () => {
    const account = await db.ledgerAccount.create({
      data: { guildId, ownerId: memberId },
    });
    const foreignAccount = await db.ledgerAccount.create({
      data: { guildId: otherGuildId, ownerId: secondId },
    });
    await expect(
      db.$transaction(async (tx) => {
        await tx.ledgerTransaction.create({
          data: {
            guildId,
            key: 'unbalanced-raw',
            kind: 'test',
            entries: { create: [{ accountId: account.id, amount: 1n }] },
          },
        });
      }),
    ).rejects.toThrow();
    await expect(
      db.$transaction(async (tx) => {
        await tx.ledgerTransaction.create({
          data: {
            guildId,
            key: 'cross-tenant-raw',
            kind: 'test',
            entries: {
              create: [
                { accountId: account.id, amount: -1n },
                { accountId: foreignAccount.id, amount: 1n },
              ],
            },
          },
        });
      }),
    ).rejects.toThrow();
    await expect(
      db.ledgerAccount.create({
        data: { guildId, ownerId: '@sink', system: true, balance: -1n },
      }),
    ).rejects.toThrow();
    await expect(
      db.ledgerAccount.create({
        data: { guildId, ownerId: '@unknown', system: true },
      }),
    ).rejects.toThrow();
    await expect(
      db.ledgerAccount.update({
        where: { id: account.id },
        data: { balance: 9_000_000_000_000_000_001n },
      }),
    ).rejects.toThrow();
    expect(await db.ledgerTransaction.count({ where: { guildId } })).toBe(0);
    await assertBalanced();
  });

  it('keeps precise large decimal amounts intact through PostgreSQL and JSON results', async () => {
    const amount = 9_000_000_000_000_000_000n;
    await mutate(manager(), 'large-ledger-post', (ctx) =>
      postLedger(ctx, 'large-post', 'test', [
        { ownerId: '@issuer', amount: -amount },
        { ownerId: memberId, amount },
      ]),
    );
    expect(await units()).toBe('9000000000000000000');
    const response = await call(actor(), 'GET', '/economy/history', {}, '');
    expect(response.data).toMatchObject([{ amount: '9000000000000000000' }]);
    await assertBalanced();
  });

  it('serializes concurrent spends and keeps all ledger accounts balanced', async () => {
    await grant(memberId, 100);
    const attempts = await Promise.allSettled(
      [0, 1, 2, 3].map((i) =>
        call(
          actor(),
          'POST',
          '/economy/transfer',
          { recipientId: secondId, amount: '80', reason: 'Concurrent spend' },
          `transfer:${i}`,
        ),
      ),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(await units()).toBe('20');
    expect(await units(secondId)).toBe('80');
    expect(
      await db.ledgerTransaction.count({
        where: { guildId, kind: 'transfer' },
      }),
    ).toBe(1);
    await assertBalanced();
  });

  it('replays the same source reward while rejecting changed postings', async () => {
    await Promise.all(
      [0, 1].map((i) =>
        mutate(manager(), `reward:${i}`, (ctx) =>
          grantVirtual(ctx, memberId, 100n, 'one-source', 'Source identity'),
        ),
      ),
    );
    expect(await units()).toBe('100');
    await expect(
      mutate(manager(), 'changed-source', (ctx) =>
        postLedger(ctx, 'one-source', 'reward', [
          { ownerId: '@issuer', amount: -200n },
          { ownerId: memberId, amount: 200n },
        ]),
      ),
    ).rejects.toThrow('different postings');
    await assertBalanced();
  });

  it('pays a daily claim once across concurrent receipts and preserves an original retry result', async () => {
    const results = await Promise.allSettled(
      [0, 1, 2].map((i) =>
        call(actor(), 'POST', '/economy/daily', {}, `daily:${i}`),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const winner = results.findIndex((r) => r.status === 'fulfilled');
    expect(
      (await call(actor(), 'POST', '/economy/daily', {}, `daily:${winner}`))
        .data,
    ).toMatchObject({ awarded: '100' });
    expect(await units()).toBe('100');
    await assertBalanced();
  });

  it('sells the last stock once and rolls back rejected charges and inventory', async () => {
    await shop('last-gem', { stock: 1 });
    await grant();
    await grant(secondId);
    const attempts = await Promise.allSettled(
      [memberId, secondId].map((id) => purchase(id, 'last-gem')),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await quantity(memberId, 'last-gem')) +
        (await quantity(secondId, 'last-gem')),
    ).toBe(1);
    expect(BigInt(await units()) + BigInt(await units(secondId))).toBe(1990n);
    expect(
      await db.record.count({ where: { guildId, kind: 'shop.order' } }),
    ).toBe(1);
    await assertBalanced();
  });

  it('prevents refund during role delivery and refunds a definitive failure only once', async () => {
    await shop('supporter', {
      type: 'role',
      roleId,
      unique: true,
      tradeable: false,
      stock: 1,
    });
    await grant();
    const bought = await purchase(memberId, 'supporter');
    const order = (bought.data as { order: { id: string } }).order;
    await mutate(manager(), 'role-start', (ctx) =>
      beginRoleOrderDelivery(ctx, order.id),
    );
    await expect(
      call(
        manager(),
        'POST',
        '/shop/orders/:id/refund',
        { reason: 'While REST is active' },
        'role-refund-active',
        { id: order.id },
      ),
    ).rejects.toThrow('undelivered');
    await mutate(manager(), 'role-failure', (ctx) =>
      completeRoleOrder(ctx, order.id, 'failed', 'Missing role hierarchy'),
    );
    await Promise.all(
      [0, 1].map((i) =>
        call(
          manager(),
          'POST',
          '/shop/orders/:id/refund',
          { reason: 'Delivery failed' },
          `role-refund:${i}`,
          { id: order.id },
        ),
      ),
    );
    expect(await units()).toBe('1000');
    expect(await quantity(memberId, 'supporter')).toBe(0);
    expect(
      await db.ledgerTransaction.count({ where: { guildId, kind: 'refund' } }),
    ).toBe(1);
    expect(
      await mutate(manager(), 'late-result', (ctx) =>
        completeRoleOrder(ctx, order.id, 'delivered'),
      ),
    ).toMatchObject({ data: { state: 'refunded' } });
    expect(
      await mutate(manager(), 'late-start', (ctx) =>
        beginRoleOrderDelivery(ctx, order.id),
      ),
    ).toMatchObject({ data: { state: 'refunded' } });
    await assertBalanced();
  });

  it('settles offered funds and items once, then cancellation cannot reclaim transferred assets', async () => {
    await shop('ruby');
    await shop('opal');
    await grant();
    await grant(secondId);
    await purchase(memberId, 'ruby');
    await purchase(secondId, 'opal');
    const opened = await call(
      actor(),
      'POST',
      '/trades',
      {
        recipientId: secondId,
        offered: { amount: '50', items: [{ itemId: 'ruby', quantity: 1 }] },
        requested: { amount: '20', items: [{ itemId: 'opal', quantity: 1 }] },
        expiresAt: future(),
      },
      'trade-open',
    );
    const id = (opened.data as { id: string }).id;
    await Promise.all(
      [0, 1].map((i) =>
        call(
          actor(secondId),
          'POST',
          '/trades/:id/accept',
          {},
          `trade-accept:${i}`,
          { id },
        ),
      ),
    );
    await call(actor(), 'POST', '/trades/:id/cancel', {}, 'trade-cancel-late', {
      id,
    });
    expect(await quantity(memberId, 'ruby')).toBe(0);
    expect(await quantity(secondId, 'ruby')).toBe(1);
    expect(await quantity(memberId, 'opal')).toBe(1);
    expect(await quantity(secondId, 'opal')).toBe(0);
    expect(await units()).toBe('960');
    expect(await units(secondId)).toBe('1020');
    expect(await units(`@escrow:trade:${id}`)).toBe('0');
    await assertBalanced();
  });

  it('keeps escrow intact after failed acceptance and returns it on expiry', async () => {
    await shop('ruby');
    await grant();
    await purchase(memberId, 'ruby');
    const opened = await call(
      actor(),
      'POST',
      '/trades',
      {
        recipientId: secondId,
        offered: { amount: '50', items: [{ itemId: 'ruby', quantity: 1 }] },
        requested: { amount: '100', items: [] },
        expiresAt: future(),
      },
      'unfunded-open',
    );
    const id = (opened.data as { id: string }).id;
    await expect(
      call(
        actor(secondId),
        'POST',
        '/trades/:id/accept',
        {},
        'unfunded-accept',
        { id },
      ),
    ).rejects.toThrow('Insufficient');
    expect(await units(`@escrow:trade:${id}`)).toBe('50');
    expect(await quantity(`@escrow:trade:${id}`, 'ruby')).toBe(1);
    const row = await db.record.findUniqueOrThrow({ where: { id } });
    await db.record.update({
      where: { id },
      data: { data: json({ ...jsonObject(row.data), expiresAt: past() }) },
    });
    await Promise.all(
      [0, 1].map((i) =>
        mutate(manager(), `expire:${i}`, (ctx) =>
          runEconomyJob(ctx, 'economy.trade.expire', { tradeId: id }),
        ),
      ),
    );
    expect(await units()).toBe('990');
    expect(await quantity(memberId, 'ruby')).toBe(1);
    expect(await units(`@escrow:trade:${id}`)).toBe('0');
    await assertBalanced();
  });

  it('reserves unique ownership while escrowed and while a winning auction bid is open', async () => {
    await shop('one-crown', { unique: true });
    await grant();
    await grant(secondId);
    await purchase(memberId, 'one-crown');
    const trade = await call(
      actor(),
      'POST',
      '/trades',
      {
        recipientId: secondId,
        offered: { amount: '0', items: [{ itemId: 'one-crown', quantity: 1 }] },
        requested: { amount: '10', items: [] },
        expiresAt: future(),
      },
      'unique-trade',
    );
    const tradeId = (trade.data as { id: string }).id;
    await expect(
      purchase(memberId, 'one-crown', 1, 'duplicate-while-trading'),
    ).rejects.toThrow('reserved');
    await call(actor(), 'POST', '/trades/:id/cancel', {}, 'unique-cancel', {
      id: tradeId,
    });
    expect(await quantity(memberId, 'one-crown')).toBe(1);
    const auction = await call(
      actor(),
      'POST',
      '/auctions',
      { itemId: 'one-crown', quantity: 1, minimumBid: '10', endsAt: future() },
      'unique-auction',
    );
    const id = (auction.data as { id: string }).id;
    await call(
      actor(secondId),
      'POST',
      '/auctions/:id/bid',
      { amount: '10' },
      'unique-bid',
      { id },
    );
    await expect(
      purchase(secondId, 'one-crown', 1, 'duplicate-while-winning'),
    ).rejects.toThrow('reserved');
    const row = await db.record.findUniqueOrThrow({ where: { id } });
    await db.record.update({
      where: { id },
      data: { data: json({ ...jsonObject(row.data), endsAt: past() }) },
    });
    await mutate(manager(), 'unique-settlement', (ctx) =>
      runEconomyJob(ctx, 'economy.auction.settle', { auctionId: id }),
    );
    expect(await quantity(secondId, 'one-crown')).toBe(1);
    expect(
      await db.record.count({
        where: { guildId, kind: 'inventory.unique-hold' },
      }),
    ).toBe(0);
    await purchase(memberId, 'one-crown', 1, 'seller-can-own-again');
    expect(await quantity(memberId, 'one-crown')).toBe(1);
    await assertBalanced();
  });

  it('refunds an outbid member and converges concurrent auction timers on one settlement', async () => {
    await shop('auction-gem');
    await grant();
    await grant(secondId);
    await grant(thirdId);
    await purchase(memberId, 'auction-gem');
    const opened = await call(
      actor(),
      'POST',
      '/auctions',
      {
        itemId: 'auction-gem',
        quantity: 1,
        minimumBid: '50',
        endsAt: future(),
      },
      'auction-open',
    );
    const id = (opened.data as { id: string }).id;
    await call(
      actor(secondId),
      'POST',
      '/auctions/:id/bid',
      { amount: '50' },
      'first-bid',
      { id },
    );
    await call(
      actor(thirdId),
      'POST',
      '/auctions/:id/bid',
      { amount: '70' },
      'second-bid',
      { id },
    );
    expect(await units(secondId)).toBe('1000');
    expect(await units(thirdId)).toBe('930');
    const row = await db.record.findUniqueOrThrow({ where: { id } });
    await db.record.update({
      where: { id },
      data: { data: json({ ...jsonObject(row.data), endsAt: past() }) },
    });
    await Promise.all(
      [0, 1].map((i) =>
        mutate(manager(), `auction-timer:${i}`, (ctx) =>
          runEconomyJob(ctx, 'economy.auction.settle', { auctionId: id }),
        ),
      ),
    );
    expect(await quantity(thirdId, 'auction-gem')).toBe(1);
    expect(await units()).toBe('1060');
    expect(await units(`@escrow:auction:${id}`)).toBe('0');
    expect(
      await db.ledgerTransaction.count({
        where: { guildId, kind: 'auction-settlement' },
      }),
    ).toBe(1);
    await assertBalanced();
  });

  it('rolls back earlier ingredients when a later crafting requirement fails', async () => {
    await shop('ore');
    await shop('coal');
    await shop('sword');
    await grant();
    await purchase(memberId, 'ore');
    await call(
      manager(),
      'POST',
      '/collections/recipes',
      {
        recipeId: 'forge',
        name: 'Forge',
        ingredients: [
          { itemId: 'ore', quantity: 1 },
          { itemId: 'coal', quantity: 1 },
        ],
        resultItemId: 'sword',
        cost: '50',
      },
      'forge-recipe',
    );
    await expect(
      call(
        actor(),
        'POST',
        '/collections/craft',
        { recipeId: 'forge' },
        'failed-forge',
      ),
    ).rejects.toThrow('Inventory');
    expect(await quantity(memberId, 'ore')).toBe(1);
    expect(await quantity(memberId, 'sword')).toBe(0);
    expect(await units()).toBe('990');
    await assertBalanced();
  });

  it('keeps trivia answers private until final submission and rewards one concurrent answer', async () => {
    await call(
      manager(),
      'POST',
      '/games/questions',
      {
        questionId: 'sum',
        question: 'Two plus two?',
        choices: ['Four', 'Five'],
        correctIndex: 0,
      },
      'question',
    );
    const game = await call(actor(), 'POST', '/games/trivia', {}, 'game');
    const data = game.data as { id: string };
    expect(game.data).not.toHaveProperty('correctIndex');
    expect(game.data).not.toHaveProperty('questionSnapshot');
    const answers = await Promise.allSettled(
      [0, 1].map((i) =>
        call(
          actor(),
          'POST',
          '/games/:id/answer',
          { choice: 0 },
          `answer:${i}`,
          { id: data.id },
        ),
      ),
    );
    expect(answers.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(await units()).toBe('10');
    await assertBalanced();
  });

  it('sells the last lottery ticket once and securely settles one immutable draw', async () => {
    await grant();
    await grant(secondId);
    const lottery = await call(
      manager(),
      'POST',
      '/lotteries',
      {
        name: 'Virtual test draw',
        ticketPrice: '10',
        endsAt: future(),
        maxTicketsPerMember: 1,
        maxTotalTickets: 1,
      },
      'lottery',
    );
    const id = (lottery.data as { id: string }).id;
    const entries = await Promise.allSettled(
      [memberId, secondId].map((who, i) =>
        call(
          actor(who),
          'POST',
          '/lotteries/:id/enter',
          { tickets: 1, optIn: true },
          `entry:${i}`,
          { id },
        ),
      ),
    );
    expect(entries.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    const row = await db.record.findUniqueOrThrow({ where: { id } });
    await db.record.update({
      where: { id },
      data: { data: json({ ...jsonObject(row.data), endsAt: past() }) },
    });
    await Promise.all(
      [0, 1].map((i) =>
        mutate(manager(), `lottery-timer:${i}`, (ctx) =>
          runEconomyJob(ctx, 'economy.lottery.draw', { lotteryId: id }),
        ),
      ),
    );
    expect(
      await db.record.count({ where: { guildId, kind: 'lottery.draw' } }),
    ).toBe(1);
    expect(await units()).toBe('1000');
    expect(await units(secondId)).toBe('1000');
    expect(await units(`@escrow:lottery:${id}`)).toBe('0');
    await assertBalanced();
  });

  it('preserves lifetime progression and filters archived/public leaderboard privacy', async () => {
    await record('level.profile', memberId, { xp: 100, publicProfile: true });
    await record(
      'level.profile',
      secondId,
      { xp: 500, publicProfile: false },
      'active',
      secondId,
    );
    const season = await call(
      manager(),
      'POST',
      '/seasons',
      { name: 'Integration season', endsAt: future() },
      'season',
    );
    const id = (season.data as { id: string }).id;
    for (const who of [memberId, secondId]) {
      const row = await db.record.findUniqueOrThrow({
        where: {
          guildId_kind_key: { guildId, kind: 'level.profile', key: who },
        },
      });
      await db.record.update({
        where: { id: row.id },
        data: {
          data: json({
            ...jsonObject(row.data),
            xp: Number(jsonObject(row.data)['xp']) + 25,
          }),
        },
      });
    }
    await call(
      manager(),
      'POST',
      '/seasons/:id/archive',
      { reason: 'Close test', confirmed: true },
      'archive',
      { id },
    );
    expect(
      (await call(actor(), 'GET', '/seasons/:id/leaderboard', {}, '', { id }))
        .data,
    ).toEqual([{ userId: memberId, xp: 25 }]);
    expect(
      await platform.read(actor(), (ctx) => publicWidget(ctx, 'leaderboard')),
    ).toMatchObject({ entries: [{ userId: memberId, xp: 125 }] });
    expect(
      jsonObject(
        (
          await db.record.findUniqueOrThrow({
            where: {
              guildId_kind_key: {
                guildId,
                kind: 'level.profile',
                key: secondId,
              },
            },
          })
        ).data,
      )['xp'],
    ).toBe(525);
  });

  it('removes archived public leaderboard entries after opt-out or profile removal while preserving the private archive', async () => {
    for (const who of [memberId, secondId])
      await record(
        'level.profile',
        who,
        { xp: 100, publicProfile: true },
        'active',
        who,
      );
    const season = await call(
      manager(),
      'POST',
      '/seasons',
      { name: 'Privacy season', endsAt: future() },
      'privacy-season',
    );
    const id = (season.data as { id: string }).id;
    await call(
      manager(),
      'POST',
      '/seasons/:id/archive',
      { reason: 'Close privacy season', confirmed: true },
      'privacy-archive',
      { id },
    );
    const publicRows = () =>
      call(actor(), 'GET', '/seasons/:id/leaderboard', {}, '', { id });
    expect((await publicRows()).data).toHaveLength(2);
    await db.record.update({
      where: {
        guildId_kind_key: { guildId, kind: 'level.profile', key: memberId },
      },
      data: { data: { xp: 100, publicProfile: false } },
    });
    expect((await publicRows()).data).toEqual([{ userId: secondId, xp: 0 }]);
    await db.record.delete({
      where: {
        guildId_kind_key: { guildId, kind: 'level.profile', key: secondId },
      },
    });
    expect((await publicRows()).data).toEqual([]);
    const archive = await db.record.findUniqueOrThrow({
      where: { guildId_kind_key: { guildId, kind: 'season.archive', key: id } },
    });
    expect(archive).toMatchObject({
      state: 'immutable',
      data: {
        results: [
          { userId: memberId, xp: 0, publicProfile: true },
          { userId: secondId, xp: 0, publicProfile: true },
        ],
      },
    });
  });

  it('awards an achievement once and rejects repeated reputation farming under concurrency', async () => {
    await record('level.profile', memberId, { xp: 100, publicProfile: true });
    await call(
      manager(),
      'POST',
      '/achievements',
      {
        achievementId: 'first-step',
        name: 'First step',
        metric: 'lifetimeXp',
        threshold: 100,
        reward: '20',
        badge: 'first-step',
      },
      'achievement',
    );
    await Promise.all(
      [0, 1].map((i) =>
        call(
          actor(),
          'POST',
          '/achievements/:id/claim',
          {},
          `achievement:${i}`,
          { id: 'first-step' },
        ),
      ),
    );
    expect(await units()).toBe('20');
    expect(
      await db.record.count({ where: { guildId, kind: 'achievement.award' } }),
    ).toBe(1);
    const commends = await Promise.allSettled(
      [0, 1].map((i) =>
        call(
          actor(),
          'POST',
          '/reputation/commend',
          { recipientId: secondId, reason: 'Helpful answer' },
          `commend:${i}`,
        ),
      ),
    );
    expect(commends.filter((c) => c.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.record.count({ where: { guildId, kind: 'reputation.event' } }),
    ).toBe(1);
    await assertBalanced();
  });

  it('denies cross-tenant escrow records and economy management from a member', async () => {
    await grant();
    const trade = await call(
      actor(),
      'POST',
      '/trades',
      {
        recipientId: secondId,
        offered: { amount: '5', items: [] },
        requested: { amount: '1', items: [] },
        expiresAt: future(),
      },
      'tenant-trade',
    );
    await expect(
      call(
        actor(secondId, otherGuildId),
        'POST',
        '/trades/:id/accept',
        {},
        'cross-tenant',
        { id: (trade.data as { id: string }).id },
      ),
    ).rejects.toThrow('unavailable');
    await expect(
      call(
        actor(),
        'POST',
        '/economy/grants',
        { userId: memberId, amount: '100', reason: 'Forged grant' },
        'member-grant',
      ),
    ).rejects.toThrow();
    await assertBalanced();
  });
});
