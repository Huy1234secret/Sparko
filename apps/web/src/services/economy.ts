import { z } from 'zod';
import {
  AchievementSchema,
  AuctionSchema,
  LotterySchema,
  RecipeSchema,
  SeasonSchema,
  ShopItemSchema,
  TradeSchema,
  TriviaQuestionSchema,
} from '@sparko/contracts/economy';
import { mutate, read } from './http';

/**
 * Typed client for the virtual economy (R13, R14, R51–R56, R67, R68). Amounts
 * are decimal strings end to end, so large balances never lose precision.
 */
const g = (guildId: string) => `/guilds/${guildId}`;
const record = <T extends z.ZodType>(data: T) =>
  z.object({
    id: z.string(),
    key: z.string(),
    ownerId: z.string().nullable(),
    state: z.string(),
    revision: z.number(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
    data,
  });

export const BalanceSchema = z.object({
  balance: z.string(),
  virtualOnly: z.literal(true),
});
export const OverviewSchema = z.object({
  balance: BalanceSchema,
  currencyName: z.string(),
  modules: z.record(z.string(), z.boolean()),
  limits: z.object({
    maxBalance: z.string(),
    maxTransfer: z.string(),
    transferDailyCap: z.string(),
    transferFeeBps: z.number(),
  }),
  rewards: z.object({
    dailyAmount: z.number(),
    workMin: z.number(),
    workMax: z.number(),
    dailyCap: z.string(),
    earnedToday: z.string(),
    excluded: z.boolean(),
    nextDailyAt: z.string().nullable(),
    nextWorkAt: z.string().nullable(),
  }),
  recent: z.array(
    z.object({
      id: z.string(),
      amount: z.string(),
      reason: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type Overview = z.infer<typeof OverviewSchema>;
export const getOverview = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/economy/me`, OverviewSchema, signal);

export const HistorySchema = z.array(
  z.object({
    id: z.string(),
    amount: z.string(),
    kind: z.string(),
    createdAt: z.string(),
  }),
);
export const getHistory = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/economy/history`, HistorySchema, signal);

const ClaimSchema = z.object({
  awarded: z.string().optional(),
  balance: BalanceSchema.optional(),
  nextEligibleAt: z.string().optional(),
});
export const claimReward = (
  guildId: string,
  kind: 'daily' | 'work',
  key: string,
) => mutate('post', `${g(guildId)}/economy/${kind}`, {}, ClaimSchema, key);
export const transfer = (
  guildId: string,
  body: { recipientId: string; amount: string; reason: string },
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/economy/transfer`,
    body,
    z.object({ amount: z.string(), fee: z.string() }).loose(),
    key,
  );

// Shop and inventory
export type ShopItem = z.output<typeof ShopItemSchema>;
export type ShopItemInput = z.input<typeof ShopItemSchema>;
const StoredItemSchema = z
  .object({
    itemId: z.string(),
    name: z.string(),
    description: z.string().default(''),
    type: z.enum(['collectible', 'consumable', 'role']),
    price: z.string(),
    stock: z.number().nullable().default(null),
    perMemberLimit: z.number().default(1000),
    unique: z.boolean().default(false),
    tradeable: z.boolean().default(true),
    requiredRoleIds: z.array(z.string()).default([]),
    roleId: z.string().optional(),
    consumeReward: z.string().default('0'),
    rarity: z
      .enum(['common', 'uncommon', 'rare', 'epic', 'legendary'])
      .default('common'),
  })
  .loose();
export const ShopRecordSchema = record(StoredItemSchema);
export type ShopRecord = z.infer<typeof ShopRecordSchema>;
export const getShop = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/shop`, z.array(ShopRecordSchema), signal);
export const createItem = (guildId: string, body: ShopItemInput, key: string) =>
  mutate('post', `${g(guildId)}/shop/items`, body, ShopRecordSchema, key);
export const setStock = (
  guildId: string,
  itemId: string,
  body: { stock: number | null; expectedRevision: number; reason: string },
  key: string,
) =>
  mutate(
    'put',
    `${g(guildId)}/shop/items/${itemId}/stock`,
    body,
    ShopRecordSchema,
    key,
  );
export const purchase = (
  guildId: string,
  body: { itemId: string; quantity: number },
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/shop/purchase`,
    body,
    z.object({ order: record(z.unknown()) }).loose(),
    key,
  );

export const ItemViewSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  rarity: z.string(),
  unique: z.boolean(),
  tradeable: z.boolean(),
  consumeReward: z.string(),
  price: z.string(),
  available: z.boolean(),
});
export type ItemView = z.infer<typeof ItemViewSchema>;
export const OrderSchema = z.object({
  id: z.string(),
  state: z.string(),
  revision: z.number(),
  userId: z.string(),
  itemId: z.string(),
  name: z.string(),
  type: z.string(),
  roleId: z.string().nullable(),
  quantity: z.number(),
  price: z.string(),
  deliveryError: z.string().nullable(),
  refundReason: z.string().nullable(),
  refundedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;
export const InventorySchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      quantity: z.number(),
      item: ItemViewSchema.nullable(),
    }),
  ),
  orders: z.array(OrderSchema),
});
export type Inventory = z.infer<typeof InventorySchema>;
export const getInventory = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/inventory/me`, InventorySchema, signal);
export const consume = (
  guildId: string,
  body: { itemId: string; quantity: number },
  key: string,
) => mutate('post', `${g(guildId)}/inventory/consume`, body, z.unknown(), key);

export const orderFilters = [
  'attention',
  'delivered',
  'refunded',
  'all',
] as const;
export type OrderFilter = (typeof orderFilters)[number];
export const getOrders = (
  guildId: string,
  state: OrderFilter,
  signal?: AbortSignal,
) =>
  read(
    `${g(guildId)}/shop/orders?state=${state}`,
    z.array(OrderSchema),
    signal,
  );
export const refundOrder = (
  guildId: string,
  id: string,
  reason: string,
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/shop/orders/${id}/refund`,
    { reason },
    z.unknown(),
    key,
  );
export const ReconcileSchema = z.object({
  accounts: z.number(),
  total: z.string(),
  balanced: z.boolean(),
  mismatches: z.array(
    z.object({ ownerId: z.string(), cached: z.string(), ledger: z.string() }),
  ),
  checkedAt: z.string(),
});
export const getReconcile = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/economy/reconcile`, ReconcileSchema, signal);
export const grantFunds = (
  guildId: string,
  body: { userId: string; amount: string; reason: string },
  key: string,
) => mutate('post', `${g(guildId)}/economy/grants`, body, z.unknown(), key);

// Trades and auctions
const AssetsViewSchema = z.object({
  amount: z.string(),
  items: z.array(
    z.object({ itemId: z.string(), name: z.string(), quantity: z.number() }),
  ),
});
export const TradeViewSchema = z.object({
  id: z.string(),
  state: z.string(),
  direction: z.enum(['sent', 'received']),
  senderId: z.string(),
  recipientId: z.string(),
  offered: AssetsViewSchema,
  requested: AssetsViewSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type TradeView = z.infer<typeof TradeViewSchema>;
export const getTrades = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/trades/me`, z.array(TradeViewSchema), signal);
export const createTrade = (
  guildId: string,
  body: z.input<typeof TradeSchema>,
  key: string,
) => mutate('post', `${g(guildId)}/trades`, body, z.unknown(), key);
export const tradeAction = (
  guildId: string,
  id: string,
  action: 'accept' | 'cancel',
  key: string,
) =>
  mutate('post', `${g(guildId)}/trades/${id}/${action}`, {}, z.unknown(), key);

export const AuctionViewSchema = z.object({
  id: z.string(),
  state: z.string(),
  itemId: z.string(),
  name: z.string(),
  rarity: z.string(),
  quantity: z.number(),
  minimumBid: z.string(),
  minimumIncrement: z.string(),
  bid: z.string(),
  endsAt: z.string(),
  sellerId: z.string(),
  mine: z.boolean(),
  leading: z.boolean(),
  hasBids: z.boolean(),
});
export type AuctionView = z.infer<typeof AuctionViewSchema>;
export const getAuctions = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/auctions`, z.array(AuctionViewSchema), signal);
export const createAuction = (
  guildId: string,
  body: z.input<typeof AuctionSchema>,
  key: string,
) => mutate('post', `${g(guildId)}/auctions`, body, z.unknown(), key);
export const bid = (guildId: string, id: string, amount: string, key: string) =>
  mutate(
    'post',
    `${g(guildId)}/auctions/${id}/bid`,
    { amount },
    z.unknown(),
    key,
  );
export const cancelAuction = (guildId: string, id: string, key: string) =>
  mutate('post', `${g(guildId)}/auctions/${id}/cancel`, {}, z.unknown(), key);

// Collections
export const CollectionsSchema = z.object({
  catalog: z.array(z.object({ item: ItemViewSchema, quantity: z.number() })),
  recipes: z.array(
    z.object({
      id: z.string(),
      recipeId: z.string(),
      name: z.string(),
      cost: z.string(),
      result: z.object({
        itemId: z.string(),
        name: z.string(),
        quantity: z.number(),
      }),
      ingredients: z.array(
        z.object({
          itemId: z.string(),
          name: z.string(),
          quantity: z.number(),
          have: z.number(),
        }),
      ),
    }),
  ),
  hunt: z.object({
    configured: z.boolean(),
    huntsPerDay: z.number(),
    huntsToday: z.number(),
    nextHuntAt: z.string().nullable(),
    drops: z.array(
      z.object({
        itemId: z.string(),
        name: z.string(),
        rarity: z.string(),
        quantity: z.number(),
        chance: z.number(),
      }),
    ),
  }),
});
export type Collections = z.infer<typeof CollectionsSchema>;
export const getCollections = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/collections`, CollectionsSchema, signal);
export const hunt = (guildId: string, key: string) =>
  mutate(
    'post',
    `${g(guildId)}/collections/hunt`,
    {},
    record(
      z.object({
        itemId: z.string(),
        quantity: z.number(),
        rarity: z.string(),
      }),
    ),
    key,
  );
export const craft = (guildId: string, recipeId: string, key: string) =>
  mutate(
    'post',
    `${g(guildId)}/collections/craft`,
    { recipeId },
    z.unknown(),
    key,
  );
export const createRecipe = (
  guildId: string,
  body: z.input<typeof RecipeSchema>,
  key: string,
) =>
  mutate('post', `${g(guildId)}/collections/recipes`, body, z.unknown(), key);

// Trivia
export const GamesSchema = z.object({
  current: z
    .object({
      id: z.string(),
      question: z.string(),
      choices: z.array(z.string()),
      expiresAt: z.string(),
      reward: z.string(),
    })
    .nullable(),
  recent: z.array(
    z.object({
      id: z.string(),
      state: z.string(),
      question: z.string(),
      choices: z.array(z.string()),
      selectedIndex: z.number().nullable(),
      correctIndex: z.number(),
      reward: z.string(),
      createdAt: z.string(),
    }),
  ),
  playsPerDay: z.number(),
  playsLeft: z.number(),
  nextPlayAt: z.string().nullable(),
  answerSeconds: z.number(),
  reward: z.string(),
});
export type Games = z.infer<typeof GamesSchema>;
export const getGames = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/games/me`, GamesSchema, signal);
export const startTrivia = (guildId: string, key: string) =>
  mutate('post', `${g(guildId)}/games/trivia`, {}, z.unknown(), key);
export const answerTrivia = (
  guildId: string,
  id: string,
  choice: number,
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/games/${id}/answer`,
    { choice },
    z.object({
      outcome: z.enum(['won', 'lost', 'expired']),
      correctIndex: z.number().optional(),
      rewarded: z.string(),
    }),
    key,
  );
export const QuestionRecordSchema = record(
  z.object({
    questionId: z.string(),
    question: z.string(),
    choices: z.array(z.string()),
    correctIndex: z.number(),
  }),
);
export const getQuestions = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/games/questions`, z.array(QuestionRecordSchema), signal);
export const saveQuestion = (
  guildId: string,
  body: z.input<typeof TriviaQuestionSchema>,
  key: string,
) => mutate('post', `${g(guildId)}/games/questions`, body, z.unknown(), key);

// Lotteries
export const LotteryViewSchema = z.object({
  id: z.string(),
  state: z.string(),
  name: z.string(),
  ticketPrice: z.string(),
  endsAt: z.string(),
  maxTicketsPerMember: z.number(),
  maxTotalTickets: z.number(),
  totalTickets: z.number(),
  pot: z.string(),
  myTickets: z.number(),
  winnerId: z.string().nullable(),
  createdAt: z.string(),
});
export type LotteryView = z.infer<typeof LotteryViewSchema>;
export const getLotteries = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/lotteries`, z.array(LotteryViewSchema), signal);
export const createLottery = (
  guildId: string,
  body: z.input<typeof LotterySchema>,
  key: string,
) => mutate('post', `${g(guildId)}/lotteries`, body, z.unknown(), key);
export const enterLottery = (
  guildId: string,
  id: string,
  tickets: number,
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/lotteries/${id}/enter`,
    { tickets, optIn: true },
    z.unknown(),
    key,
  );
export const cancelLottery = (
  guildId: string,
  id: string,
  reason: string,
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/lotteries/${id}/cancel`,
    { reason },
    z.unknown(),
    key,
  );

// Reputation, achievements and seasons
export const ReputationSchema = z.object({
  profile: record(z.object({ total: z.number() })).nullable(),
  events: z.array(
    record(
      z.object({
        senderId: z.string(),
        reason: z.string(),
        at: z.string(),
      }),
    ),
  ),
});
export const getReputation = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/reputation/me`, ReputationSchema, signal);
export const commend = (
  guildId: string,
  body: { recipientId: string; reason: string },
  key: string,
) => mutate('post', `${g(guildId)}/reputation/commend`, body, z.unknown(), key);

const StoredAchievementSchema = z
  .object({
    achievementId: z.string(),
    name: z.string(),
    description: z.string().default(''),
    metric: z.string(),
    threshold: z.number(),
    reward: z.string().default('0'),
    xp: z.number().default(0),
    badge: z.string(),
    itemId: z.string().optional(),
    seasonId: z.string().optional(),
  })
  .loose();
export const AchievementRecordSchema = record(StoredAchievementSchema).extend({
  progress: z.number(),
});
export type AchievementRecord = z.infer<typeof AchievementRecordSchema>;
export const getAchievements = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/achievements`, z.array(AchievementRecordSchema), signal);
export const getMyAwards = (guildId: string, signal?: AbortSignal) =>
  read(
    `${g(guildId)}/achievements/me`,
    z.array(record(z.object({ achievementId: z.string() }).loose())),
    signal,
  );
export const claimAchievement = (guildId: string, id: string, key: string) =>
  mutate(
    'post',
    `${g(guildId)}/achievements/${id}/claim`,
    {},
    z.unknown(),
    key,
  );
export const createAchievement = (
  guildId: string,
  body: z.input<typeof AchievementSchema>,
  key: string,
) => mutate('post', `${g(guildId)}/achievements`, body, z.unknown(), key);

export const SeasonViewSchema = z.object({
  id: z.string(),
  state: z.string(),
  name: z.string(),
  startedAt: z.string(),
  endsAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type SeasonView = z.infer<typeof SeasonViewSchema>;
export const getSeasons = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/seasons`, z.array(SeasonViewSchema), signal);
export const getSeasonBoard = (
  guildId: string,
  id: string,
  signal?: AbortSignal,
) =>
  read(
    `${g(guildId)}/seasons/${id}/leaderboard`,
    z.array(z.object({ userId: z.string(), xp: z.number() })),
    signal,
  );
export const startSeason = (
  guildId: string,
  body: z.input<typeof SeasonSchema>,
  key: string,
) => mutate('post', `${g(guildId)}/seasons`, body, z.unknown(), key);
export const archiveSeason = (
  guildId: string,
  id: string,
  reason: string,
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/seasons/${id}/archive`,
    { reason, confirmed: true },
    z.unknown(),
    key,
  );

/** "1,234 Sparks" — grouping is done on the string so huge values stay exact. */
export function formatUnits(value: string, name = 'Sparks') {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}${grouped} ${name}`;
}
/** Plain whole numbers only; the server is the source of truth for limits. */
export const unitsPattern = /^(0|[1-9][0-9]{0,18})$/;
export const rarityTone: Record<
  string,
  'neutral' | 'info' | 'success' | 'warning' | 'danger'
> = {
  common: 'neutral',
  uncommon: 'success',
  rare: 'info',
  epic: 'info',
  legendary: 'warning',
};
