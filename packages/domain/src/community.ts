import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { DomainError, Snowflake } from '@sparko/contracts';
import { json } from '@sparko/db';
import {
  LevelConfigSchema,
  CommunityRewardConfigSchema,
  CrateConfigSchema,
  CountingConfigSchema,
  AutoRoleConfigSchema,
  WelcomeConfigSchema,
  DepartureConfigSchema,
  SubmissionConfigSchema,
  StarboardConfigSchema,
  AnalyticsConfigSchema,
  CreateCrateSchema,
  CrateScheduleSchema,
  RoleMenuSchema,
  EligibilitySchema,
  GiveawaySchema,
  TextSubmission,
  AnalyticsQuery,
} from '@sparko/messages/community-contracts';
export {
  LevelConfigSchema,
  CommunityRewardConfigSchema,
  CrateConfigSchema,
  CountingConfigSchema,
  RoleMenuConfigSchema,
  AutoRoleConfigSchema,
  WelcomeConfigSchema,
  DepartureConfigSchema,
  GiveawayConfigSchema,
  SubmissionConfigSchema,
  StarboardConfigSchema,
  AnalyticsConfigSchema,
  communityConfigSchemas,
  CreateCrateSchema,
  CrateScheduleSchema,
  RoleMenuSchema,
  EligibilitySchema,
  GiveawaySchema,
  TextSubmission,
  AnalyticsQuery,
} from '@sparko/messages/community-contracts';
import {
  createRecord,
  getRecord,
  jsonObject,
  updateRecord,
  type DomainContext,
  type DomainRoute,
} from './core.js';

const Id = z.string().min(1).max(128);
const Revision = z.number().int().min(1);
const RoleIds = z.array(Snowflake).max(100).default([]);
const Instant = z.iso.datetime();
const XpAmount = z.number().int().min(0).max(1_000_000);

async function config<T>(
  ctx: DomainContext,
  id: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const row = await ctx.tx.featureConfig.findUnique({
    where: { guildId_featureId: { guildId: ctx.guildId, featureId: id } },
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
  ownerId?: string,
  state = 'active',
) {
  return ctx.tx.record.upsert({
    where: { guildId_kind_key: { guildId: ctx.guildId, kind, key } },
    create: {
      guildId: ctx.guildId,
      kind,
      key,
      data: json(data),
      ownerId: ownerId ?? ctx.actor.userId,
      state,
    },
    update: { data: json(data), state, revision: { increment: 1 } },
  });
}
const ProfileSchema = z.object({
  xp: z.number().int().nonnegative().default(0),
  lastMessageAt: Instant.optional(),
  publicProfile: z.boolean().default(false),
  card: z.record(z.string(), z.unknown()).default({}),
});
export function levelThreshold(
  level: number,
  baseXp: number,
  growthXp: number,
): number {
  if (
    ![level, baseXp, growthXp].every(Number.isSafeInteger) ||
    level < 0 ||
    level > 1000 ||
    baseXp < 1 ||
    baseXp > 100_000 ||
    growthXp < 0 ||
    growthXp > 100_000
  )
    throw new DomainError('INVALID_INPUT', 'Invalid bounded XP curve.');
  return baseXp * level + (growthXp * level * (level - 1)) / 2;
}
export function levelFromXp(
  xp: number,
  baseXp: number,
  growthXp: number,
  maxLevel: number,
): number {
  if (
    !Number.isSafeInteger(xp) ||
    xp < 0 ||
    !Number.isSafeInteger(maxLevel) ||
    maxLevel < 1 ||
    maxLevel > 1000
  )
    throw new DomainError('INVALID_INPUT', 'Invalid XP or maximum level.');
  let low = 0,
    high = maxLevel;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (levelThreshold(mid, baseXp, growthXp) <= xp) low = mid;
    else high = mid - 1;
  }
  return low;
}
export function weightedChoice<T extends { weight: number }>(
  items: readonly T[],
  rng: (max: number) => number = randomInt,
): T {
  if (
    !items.length ||
    items.some((v) => !Number.isSafeInteger(v.weight) || v.weight < 1)
  )
    throw new DomainError(
      'INVALID_INPUT',
      'Weights must form a positive finite integer distribution.',
    );
  const total = items.reduce((n, item) => n + item.weight, 0);
  if (!Number.isSafeInteger(total) || total >= 2 ** 48)
    throw new DomainError(
      'INVALID_INPUT',
      'Weighted distribution is too large.',
    );
  let offset = rng(total);
  if (!Number.isInteger(offset) || offset < 0 || offset >= total)
    throw new DomainError(
      'INVALID_INPUT',
      'Random source returned an invalid selection.',
    );
  for (const item of items) {
    if (offset < item.weight) return item;
    offset -= item.weight;
  }
  throw new DomainError('INVALID_INPUT', 'Invalid weighted distribution.');
}
export function secureSample<T>(
  items: readonly T[],
  count: number,
  rng: (max: number) => number = randomInt,
): T[] {
  if (!Number.isInteger(count) || count < 0)
    throw new DomainError('INVALID_INPUT', 'Invalid winner count.');
  const pool = [...items];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const offset = rng(pool.length - i);
    if (!Number.isInteger(offset) || offset < 0 || offset >= pool.length - i)
      throw new DomainError(
        'INVALID_INPUT',
        'Random source returned an invalid selection.',
      );
    const j = i + offset;
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}
export async function getLevelProfile(ctx: DomainContext, userId: string) {
  const row = await keyed(ctx, 'level.profile', userId),
    profile = ProfileSchema.parse(row?.data ?? {}),
    cfg = await config(ctx, 'R09', LevelConfigSchema);
  const level = levelFromXp(profile.xp, cfg.baseXp, cfg.growthXp, cfg.maxLevel),
    previousLevelXp = levelThreshold(level, cfg.baseXp, cfg.growthXp);
  const nextLevelXp =
    level === cfg.maxLevel
      ? null
      : levelThreshold(level + 1, cfg.baseXp, cfg.growthXp);
  return {
    userId,
    ...profile,
    level,
    previousLevelXp,
    nextLevelXp,
    progress:
      nextLevelXp === null
        ? 1
        : (profile.xp - previousLevelXp) / (nextLevelXp - previousLevelXp),
    revision: row?.revision ?? 0,
    textSummary: `Level ${level}. ${profile.xp} XP.${nextLevelXp === null ? ' Maximum level reached.' : ` ${nextLevelXp - profile.xp} XP to the next level.`}`,
  };
}
export async function reconcileRewardRoles(
  ctx: DomainContext,
  userId: string,
  level: number,
) {
  const cfg = await config(ctx, 'R11', CommunityRewardConfigSchema);
  if (!cfg.enabled) return;
  const eligible = cfg.rewards
    .filter((r) => r.level <= level)
    .sort((a, b) => b.level - a.level);
  const desired =
    cfg.policy === 'highest'
      ? eligible.slice(0, 1).map((v) => v.roleId)
      : eligible.map((v) => v.roleId);
  const roles = await save(
    ctx,
    'role.desired',
    `level:${userId}`,
    {
      userId,
      managedRoleIds: cfg.rewards.map((v) => v.roleId),
      desiredRoleIds: desired,
      cause: 'level',
      level,
    },
    userId,
    'pending',
  );
  await ctx.effect('community.roles.reconcile', {
    featureId: 'R11',
    recordId: roles.id,
    revision: roles.revision,
    userId,
    addRoleIds: desired,
    removeRoleIds: cfg.rewards
      .map((v) => v.roleId)
      .filter((r) => !desired.includes(r)),
  });
}
export async function grantXp(
  ctx: DomainContext,
  userId: string,
  amount: number,
  source: string,
  reason: string,
) {
  if (
    !Number.isSafeInteger(amount) ||
    Math.abs(amount) > 1_000_000 ||
    !reason.trim() ||
    source.length > 256
  )
    throw new DomainError(
      'INVALID_INPUT',
      'A bounded XP adjustment, source, and reason are required.',
    );
  const previous = await keyed(ctx, 'level.history', source);
  if (previous) {
    const data = jsonObject(previous.data);
    if (previous.ownerId !== userId || data['delta'] !== amount)
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'This XP source was already applied to a different reward.',
        409,
      );
    return {
      applied: false,
      profile: await getLevelProfile(ctx, userId),
      history: previous,
    };
  }
  const old = await getLevelProfile(ctx, userId),
    next = old.xp + amount;
  if (next < 0 || !Number.isSafeInteger(next))
    throw new DomainError(
      'INVALID_INPUT',
      'XP cannot be negative or exceed the safe integer limit.',
    );
  const profile = await save(
    ctx,
    'level.profile',
    userId,
    {
      xp: next,
      publicProfile: old.publicProfile,
      card: old.card,
      ...(old.lastMessageAt ? { lastMessageAt: old.lastMessageAt } : {}),
    },
    userId,
  );
  const history = await createRecord(
    ctx,
    'level.history',
    {
      userId,
      delta: amount,
      before: old.xp,
      after: next,
      source,
      reason,
      observedAt: ctx.now.toISOString(),
    },
    { key: source, ownerId: userId },
  );
  const updated = await getLevelProfile(ctx, userId);
  if (old.level !== updated.level) {
    await reconcileRewardRoles(ctx, userId, updated.level);
    const cfg = await config(ctx, 'R09', LevelConfigSchema);
    if (
      updated.level > old.level &&
      cfg.announcementChannelId &&
      cfg.announcement
    )
      await ctx.effect('community.message', {
        featureId: 'R09',
        channelId: cfg.announcementChannelId,
        document: cfg.announcement,
        tokens: {
          'member.id': userId,
          'level.number': String(updated.level),
          'level.xp': String(updated.xp),
        },
      });
    await ctx.effect('community.level.changed', {
      userId,
      from: old.level,
      to: updated.level,
      xp: updated.xp,
      source,
    });
  }
  return {
    applied: true,
    profile: { ...updated, revision: profile.revision },
    history,
  };
}

const EventBase = { eventId: Id, occurredAt: Instant };
const MemberFields = {
  memberId: Snowflake,
  roleIds: RoleIds,
  bot: z.boolean().default(false),
  joinedAt: Instant.optional(),
  accountCreatedAt: Instant.optional(),
};
export const CommunityEventSchema = z.discriminatedUnion('kind', [
  z.object({
    ...EventBase,
    ...MemberFields,
    kind: z.literal('message'),
    messageId: Snowflake,
    channelId: Snowflake,
    content: z.string().max(4000).nullable(),
    webhook: z.boolean().default(false),
  }),
  z.object({
    ...EventBase,
    ...MemberFields,
    kind: z.enum(['memberJoin', 'memberLeave', 'memberBoost', 'memberUpdate']),
  }),
  z.object({
    ...EventBase,
    ...MemberFields,
    kind: z.literal('reaction'),
    sourceMessageId: Snowflake,
    sourceChannelId: Snowflake,
    sourceAuthorId: Snowflake,
    emoji: z.string().min(1).max(100),
    added: z.boolean(),
    sourceContent: z.string().max(4000).nullable(),
  }),
  z.object({
    ...EventBase,
    kind: z.literal('messageEdit'),
    sourceMessageId: Snowflake,
    sourceChannelId: Snowflake,
    content: z.string().max(4000).nullable(),
  }),
  z.object({
    ...EventBase,
    kind: z.literal('messageDelete'),
    sourceMessageId: Snowflake,
    sourceChannelId: Snowflake,
  }),
  z.object({
    ...EventBase,
    ...MemberFields,
    kind: z.literal('voice'),
    channelId: Snowflake.nullable(),
    previousChannelId: Snowflake.nullable(),
    afk: z.boolean().default(false),
  }),
  z.object({
    ...EventBase,
    kind: z.literal('coverage'),
    metric: z.enum(['messages', 'members', 'voice']),
    status: z.enum(['collecting', 'gap']),
    reason: z.string().max(500).optional(),
  }),
]);
export type CommunityEvent = z.infer<typeof CommunityEventSchema>;
export const MemberObservationSchema = z.object({
  memberId: Snowflake,
  roleIds: RoleIds,
  present: z.boolean(),
  bot: z.boolean(),
  joinedAt: Instant.optional(),
  accountCreatedAt: Instant.optional(),
  observedAt: Instant,
});

async function observeMember(
  ctx: DomainContext,
  event: Extract<CommunityEvent, { memberId: string }>,
) {
  const old = await keyed(ctx, 'community.member', event.memberId),
    data = jsonObject(old?.data);
  if (
    typeof data['observedAt'] === 'string' &&
    Date.parse(data['observedAt']) > Date.parse(event.occurredAt)
  )
    return false;
  await save(
    ctx,
    'community.member',
    event.memberId,
    {
      ...data,
      memberId: event.memberId,
      roleIds: event.roleIds,
      present: event.kind !== 'memberLeave',
      bot: event.bot,
      observedAt: event.occurredAt,
      ...(event.joinedAt
        ? { joinedAt: event.joinedAt }
        : event.kind === 'memberJoin'
          ? { joinedAt: event.occurredAt }
          : {}),
      ...(event.accountCreatedAt
        ? { accountCreatedAt: event.accountCreatedAt }
        : {}),
    },
    event.memberId,
  );
  return true;
}
export function eligibleMessageXp(
  event: Extract<CommunityEvent, { kind: 'message' }>,
  cfg: z.infer<typeof LevelConfigSchema>,
  lastMessageAt?: string,
): { eligible: boolean; multiplier: number; reason?: string } {
  if (event.bot || event.webhook)
    return { eligible: false, multiplier: 0, reason: 'bot-or-webhook' };
  if (
    cfg.excludedChannelIds.includes(event.channelId) ||
    event.roleIds.some((r) => cfg.excludedRoleIds.includes(r))
  )
    return { eligible: false, multiplier: 0, reason: 'excluded' };
  if (
    lastMessageAt &&
    Date.parse(event.occurredAt) - Date.parse(lastMessageAt) <
      cfg.cooldownSeconds * 1000
  )
    return { eligible: false, multiplier: 0, reason: 'cooldown-or-late-event' };
  const roleMultipliers = cfg.roleMultipliers
    .filter((v) => event.roleIds.includes(v.roleId))
    .map((v) => v.multiplier);
  const role = roleMultipliers.length ? Math.max(...roleMultipliers) : 1;
  const channel =
    cfg.channelMultipliers.find((v) => v.channelId === event.channelId)
      ?.multiplier ?? 1;
  return {
    eligible: true,
    multiplier: Math.min(cfg.maxMultiplier, role * channel),
  };
}

export interface CountingState {
  value: number;
  previousMemberId: string | null;
  lastMessageId: string | null;
  lastAcceptedAt: string | null;
  streak: number;
  best: number;
  run: number;
}
export function countingTransition(
  current: CountingState,
  event: Extract<CommunityEvent, { kind: 'message' }>,
  cfg: z.infer<typeof CountingConfigSchema>,
): { state: CountingState; outcome: string; milestone?: number } {
  if (event.bot || event.webhook || !event.content?.trim())
    return { state: current, outcome: 'ignored' };
  if (
    current.lastMessageId &&
    BigInt(event.messageId) <= BigInt(current.lastMessageId)
  )
    return { state: current, outcome: 'late-or-duplicate' };
  const ordered = { ...current, lastMessageId: event.messageId };
  if (!/^-?\d+$/.test(event.content.trim()))
    return { state: ordered, outcome: 'invalid-syntax' };
  const value = Number(event.content.trim());
  const correct = Number.isSafeInteger(value) && value === current.value + 1;
  const turn =
    cfg.allowConsecutive || event.memberId !== current.previousMemberId;
  const cooled =
    !current.lastAcceptedAt ||
    Date.parse(event.occurredAt) - Date.parse(current.lastAcceptedAt) >=
      cfg.cooldownSeconds * 1000;
  if (!correct || !turn || !cooled) {
    if (cfg.failurePolicy === 'ignore')
      return {
        state: ordered,
        outcome: !correct
          ? 'wrong-number'
          : !turn
            ? 'consecutive-turn'
            : 'cooldown',
      };
    return {
      state: {
        ...ordered,
        value: cfg.startingValue,
        previousMemberId: null,
        lastAcceptedAt: null,
        streak: 0,
        run: current.run + 1,
      },
      outcome: 'reset',
    };
  }
  if (value > 1_000_000_000)
    return { state: ordered, outcome: 'maximum-reached' };
  const next = {
    ...ordered,
    value,
    previousMemberId: event.memberId,
    lastAcceptedAt: event.occurredAt,
    streak: current.streak + 1,
    best: Math.max(current.best, current.streak + 1),
  };
  return {
    state: next,
    outcome: 'accepted',
    ...(cfg.milestones.some((m) => m.value === value)
      ? { milestone: value }
      : {}),
  };
}

async function consumeCounting(
  ctx: DomainContext,
  event: Extract<CommunityEvent, { kind: 'message' }>,
) {
  const cfg = await config(ctx, 'R15', CountingConfigSchema);
  if (!cfg.enabled || event.channelId !== cfg.channelId) return;
  const row = await keyed(ctx, 'counting.channel', event.channelId),
    initial: CountingState = {
      value: cfg.startingValue,
      previousMemberId: null,
      lastMessageId: null,
      lastAcceptedAt: null,
      streak: 0,
      best: 0,
      run: 0,
    };
  const current = (row
      ? jsonObject(row.data)
      : initial) as unknown as CountingState,
    transition = countingTransition(current, event, cfg);
  if (
    transition.outcome === 'late-or-duplicate' ||
    transition.outcome === 'ignored'
  )
    return transition;
  await save(ctx, 'counting.channel', event.channelId, transition.state);
  await createRecord(
    ctx,
    'counting.turn',
    {
      channelId: event.channelId,
      memberId: event.memberId,
      value: transition.state.value,
      outcome: transition.outcome,
      observedAt: event.occurredAt,
    },
    { key: event.messageId, ownerId: event.memberId },
  );
  if (transition.milestone) {
    const reward = cfg.milestones.find(
      (m) => m.value === transition.milestone,
    )!;
    await grantXp(
      ctx,
      event.memberId,
      reward.xp,
      `counting:${event.channelId}:${current.run}:${transition.milestone}`,
      'Counting milestone',
    );
  }
  if (transition.outcome === 'reset' && cfg.resetDocument)
    await ctx.effect('community.message', {
      featureId: 'R15',
      channelId: event.channelId,
      document: cfg.resetDocument,
      tokens: {
        'member.id': event.memberId,
        'counting.value': String(cfg.startingValue),
      },
    });
  return transition;
}

async function observeAnalytics(ctx: DomainContext, event: CommunityEvent) {
  const cfg = await config(ctx, 'R48', AnalyticsConfigSchema);
  if (!cfg.enabled) return;
  if (!(await keyed(ctx, 'analytics.retention', 'daily'))) {
    await createRecord(
      ctx,
      'analytics.retention',
      { startedAt: ctx.now.toISOString() },
      { key: 'daily' },
    );
    await ctx.effect('community.analytics.retention', {
      day: ctx.now.toISOString().slice(0, 10),
    });
  }
  const hour = event.occurredAt.slice(0, 13) + ':00:00.000Z';
  const metric =
    event.kind === 'message'
      ? 'messages'
      : event.kind === 'memberJoin'
        ? 'joins'
        : event.kind === 'memberLeave'
          ? 'leaves'
          : event.kind === 'voice'
            ? 'voiceTransitions'
            : null;
  if (metric) {
    const key = `${hour}:${metric}`,
      old = await keyed(ctx, 'analytics.bucket', key),
      data = jsonObject(old?.data);
    await save(ctx, 'analytics.bucket', key, {
      hour,
      metric,
      count: Number(data['count'] ?? 0) + 1,
      observedAt: ctx.now.toISOString(),
    });
  }
  if (event.kind === 'coverage') {
    await createRecord(
      ctx,
      'analytics.coverage',
      {
        metric: event.metric,
        status: event.status,
        from: event.occurredAt,
        reason: event.reason ?? null,
      },
      { key: event.eventId },
    );
  }
  if (event.kind === 'voice') {
    const session = await keyed(ctx, 'analytics.voice', event.memberId),
      data = jsonObject(session?.data);
    if (
      typeof data['since'] === 'string' &&
      Date.parse(event.occurredAt) < Date.parse(data['since'])
    )
      return;
    if (
      typeof data['since'] === 'string' &&
      data['channelId'] &&
      !data['afk']
    ) {
      const start = Date.parse(data['since']),
        end = Date.parse(event.occurredAt);
      // Missing/disconnected coverage is never extrapolated into participation.
      const observations = await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'analytics.coverage',
          AND: [
            { data: { path: ['metric'], equals: 'voice' } },
            { data: { path: ['from'], lte: event.occurredAt } },
          ],
        },
        orderBy: { key: 'asc' },
        take: 10_000,
      });
      const coverage = coverageIntervals(
        observations.map((o) => jsonObject(o.data)),
        new Date(start).toISOString(),
        event.occurredAt,
      );
      if (
        end > start &&
        end - start <= 86_400_000 &&
        coverage.collected &&
        coverage.gaps.length === 0
      ) {
        for (let at = start; at < end; ) {
          const endHour = Math.min(
              end,
              Math.floor(at / 3_600_000) * 3_600_000 + 3_600_000,
            ),
            bucket = new Date(at).toISOString().slice(0, 13) + ':00:00.000Z',
            key = `${bucket}:voiceSeconds`;
          const old = await keyed(ctx, 'analytics.bucket', key),
            values = jsonObject(old?.data);
          await save(ctx, 'analytics.bucket', key, {
            hour: bucket,
            metric: 'voiceSeconds',
            count:
              Number(values['count'] ?? 0) + Math.floor((endHour - at) / 1000),
            observedAt: ctx.now.toISOString(),
          });
          at = endHour;
        }
      }
    }
    await save(
      ctx,
      'analytics.voice',
      event.memberId,
      { since: event.occurredAt, channelId: event.channelId, afk: event.afk },
      event.memberId,
    );
  }
}

async function consumeStarboard(
  ctx: DomainContext,
  event: Extract<
    CommunityEvent,
    { kind: 'reaction' | 'messageEdit' | 'messageDelete' }
  >,
) {
  const cfg = await config(ctx, 'R36', StarboardConfigSchema);
  if (
    !cfg.enabled ||
    !cfg.channelId ||
    cfg.excludedChannelIds.includes(event.sourceChannelId) ||
    event.sourceChannelId === cfg.channelId
  )
    return;
  const old = await keyed(ctx, 'starboard.source', event.sourceMessageId);
  if (event.kind === 'messageDelete' && !old) {
    await save(
      ctx,
      'starboard.source',
      event.sourceMessageId,
      {
        sourceMessageId: event.sourceMessageId,
        sourceChannelId: event.sourceChannelId,
        channelId: cfg.channelId,
        content: null,
        contentAvailable: false,
        deleted: true,
        count: 0,
        observedAt: event.occurredAt,
      },
      undefined,
      'source-deleted',
    );
    return;
  }
  // A deleted source cannot be recreated by a late reaction or edit.
  if (old && jsonObject(old.data)['deleted'] === true) return;
  if (event.kind === 'reaction') {
    if (
      event.bot ||
      event.emoji !== cfg.emoji ||
      (!cfg.allowSelf && event.memberId === event.sourceAuthorId) ||
      event.roleIds.some((r) => cfg.excludedRoleIds.includes(r))
    )
      return;
    const voteKey = `${event.sourceMessageId}:${event.memberId}`,
      vote = await keyed(ctx, 'starboard.vote', voteKey);
    const previousVoteAt = jsonObject(vote?.data)['observedAt'];
    if (
      typeof previousVoteAt === 'string' &&
      Date.parse(previousVoteAt) > Date.parse(event.occurredAt)
    )
      return;
    if (!event.added && cfg.removedVotes === 'keep') return;
    if (vote?.state === (event.added ? 'active' : 'removed')) return;
    await save(
      ctx,
      'starboard.vote',
      voteKey,
      {
        sourceMessageId: event.sourceMessageId,
        memberId: event.memberId,
        emoji: event.emoji,
        observedAt: event.occurredAt,
      },
      event.memberId,
      event.added ? 'active' : 'removed',
    );
    const count = await ctx.tx.record.count({
      where: {
        guildId: ctx.guildId,
        kind: 'starboard.vote',
        state: 'active',
        data: { path: ['sourceMessageId'], equals: event.sourceMessageId },
      },
    });
    const previous = jsonObject(old?.data),
      later =
        typeof previous['observedAt'] === 'string' &&
        Date.parse(previous['observedAt']) > Date.parse(event.occurredAt);
    const source = await save(
      ctx,
      'starboard.source',
      event.sourceMessageId,
      {
        ...previous,
        sourceMessageId: event.sourceMessageId,
        sourceChannelId: event.sourceChannelId,
        authorId: event.sourceAuthorId,
        ...(later
          ? {}
          : {
              content: event.sourceContent,
              contentAvailable: event.sourceContent !== null,
            }),
        count,
        channelId: cfg.channelId,
        observedAt: later ? previous['observedAt'] : event.occurredAt,
      },
      event.sourceAuthorId,
      count >= cfg.threshold ? 'pending' : 'below-threshold',
    );
    if (count >= cfg.threshold || old)
      await ctx.effect('community.starboard.sync', {
        recordId: source.id,
        revision: source.revision,
        sourceMessageId: event.sourceMessageId,
        channelId: cfg.channelId,
        delete: count < cfg.threshold,
      });
  } else if (old) {
    const data = jsonObject(old.data),
      removed = event.kind === 'messageDelete';
    if (
      !removed &&
      typeof data['observedAt'] === 'string' &&
      Date.parse(data['observedAt']) > Date.parse(event.occurredAt)
    )
      return;
    const source = await save(
      ctx,
      'starboard.source',
      event.sourceMessageId,
      {
        ...data,
        ...(event.kind === 'messageEdit'
          ? { content: event.content, contentAvailable: event.content !== null }
          : { content: null, contentAvailable: false, deleted: true }),
        observedAt: event.occurredAt,
      },
      old.ownerId ?? undefined,
      removed ? 'source-deleted' : 'pending',
    );
    await ctx.effect('community.starboard.sync', {
      recordId: source.id,
      revision: source.revision,
      sourceMessageId: event.sourceMessageId,
      channelId: cfg.channelId,
      delete: removed && cfg.deletePolicy === 'delete',
      tombstone: removed && cfg.deletePolicy === 'tombstone',
    });
  }
}

/** Gateway-only entry point. It is intentionally absent from HTTP routes. The bot calls it inside Platform.mutate. */
export async function ingestCommunityEvent(
  ctx: DomainContext,
  rawEvent: unknown,
) {
  const event = CommunityEventSchema.parse(rawEvent),
    receiptKey = `${event.kind}:${event.eventId}`;
  if (await keyed(ctx, 'community.event', receiptKey))
    return { duplicate: true };
  if (Date.parse(event.occurredAt) > ctx.now.getTime() + 60_000)
    throw new DomainError(
      'INVALID_INPUT',
      'Gateway event timestamp is in the future.',
    );
  await createRecord(
    ctx,
    'community.event',
    {
      kind: event.kind,
      observedAt: event.occurredAt,
      receivedAt: ctx.now.toISOString(),
    },
    { key: receiptKey },
  );
  if (event.kind === 'message') {
    if (await keyed(ctx, 'community.message-source', event.messageId))
      return { duplicate: true };
    await createRecord(
      ctx,
      'community.message-source',
      { observedAt: event.occurredAt },
      { key: event.messageId, ownerId: event.memberId },
    );
  }
  const currentMemberObservation =
    'memberId' in event ? await observeMember(ctx, event) : false;
  if (event.kind === 'memberUpdate' && currentMemberObservation) {
    const selections = await ctx.tx.record.findMany({
      where: {
        guildId: ctx.guildId,
        kind: 'role.selection',
        ownerId: event.memberId,
        state: 'applied',
      },
    });
    for (const selection of selections) {
      const data = jsonObject(selection.data),
        selected = z.array(z.string()).parse(data['selectedRoleIds'] ?? []);
      if (selected.some((r) => !event.roleIds.includes(r)))
        await updateRecord(
          ctx,
          'role.selection',
          selection.id,
          {
            ...data,
            selectedRoleIds: selected.filter((r) => event.roleIds.includes(r)),
            ownershipInterruptedAt: event.occurredAt,
          },
          selection.revision,
          'externally-changed',
        );
    }
    const instances = await ctx.tx.record.findMany({
      where: {
        guildId: ctx.guildId,
        kind: { in: ['birthday_role', 'invite_reward'] },
        ownerId: event.memberId,
        state: { in: ['active', 'applied', 'expiring'] },
      },
    });
    for (const instance of instances) {
      const data = jsonObject(instance.data);
      if (
        data['roleAddedBySparko'] === true &&
        typeof data['roleId'] === 'string' &&
        !event.roleIds.includes(data['roleId'])
      )
        await updateRecord(
          ctx,
          instance.kind,
          instance.id,
          {
            ...data,
            roleAddedBySparko: false,
            ownershipInterruptedAt: event.occurredAt,
          },
          instance.revision,
        );
    }
  }
  await observeAnalytics(ctx, event);
  let xp: unknown, counting: unknown;
  if (event.kind === 'message') {
    const cfg = await config(ctx, 'R09', LevelConfigSchema),
      profile = await getLevelProfile(ctx, event.memberId);
    const eligible = eligibleMessageXp(event, cfg, profile.lastMessageAt);
    if (cfg.enabled && eligible.eligible) {
      const amount = Math.floor(
        randomInt(cfg.minXp, cfg.maxXp + 1) * eligible.multiplier,
      );
      xp = await grantXp(
        ctx,
        event.memberId,
        amount,
        `message:${event.messageId}`,
        'Eligible Discord message',
      );
      const updated = await getLevelProfile(ctx, event.memberId);
      await save(
        ctx,
        'level.profile',
        event.memberId,
        {
          xp: updated.xp,
          publicProfile: updated.publicProfile,
          card: updated.card,
          lastMessageAt: event.occurredAt,
        },
        event.memberId,
      );
    }
    counting = await consumeCounting(ctx, event);
  }
  if (
    event.kind === 'reaction' ||
    event.kind === 'messageEdit' ||
    event.kind === 'messageDelete'
  )
    await consumeStarboard(ctx, event);
  if (event.kind === 'memberJoin' && !event.bot) {
    const cfg = await config(ctx, 'R19', WelcomeConfigSchema);
    if (
      cfg.enabled &&
      !event.roleIds.some((r) => cfg.excludedRoleIds.includes(r))
    ) {
      if (cfg.channelId && cfg.document)
        await ctx.effect('community.message', {
          featureId: 'R19',
          channelId: cfg.channelId,
          document: cfg.document,
          tokens: { 'member.id': event.memberId, 'server.id': ctx.guildId },
        });
      if (cfg.dmDocument)
        await ctx.effect('community.message', {
          featureId: 'R19',
          userId: event.memberId,
          document: cfg.dmDocument,
          tokens: { 'member.id': event.memberId, 'server.id': ctx.guildId },
        });
    }
    const roles = await config(ctx, 'R17', AutoRoleConfigSchema);
    if (roles.enabled && roles.joinRoleIds.length) {
      const desired = await save(
        ctx,
        'role.desired',
        `join:${event.memberId}`,
        {
          userId: event.memberId,
          desiredRoleIds: roles.joinRoleIds,
          managedRoleIds: roles.joinRoleIds,
          joinedAt: event.joinedAt ?? event.occurredAt,
        },
        event.memberId,
        'pending',
      );
      await ctx.effect(
        'community.roles.reconcile',
        {
          featureId: 'R17',
          recordId: desired.id,
          revision: desired.revision,
          userId: event.memberId,
          addRoleIds: roles.joinRoleIds,
          removeRoleIds: [],
          requirePresent: true,
        },
        new Date(ctx.now.getTime() + roles.delaySeconds * 1000),
      );
    }
  }
  if (
    (event.kind === 'memberLeave' || event.kind === 'memberBoost') &&
    !event.bot
  ) {
    const cfg = await config(ctx, 'R20', DepartureConfigSchema);
    if (
      cfg.enabled &&
      !event.roleIds.some((r) => cfg.excludedRoleIds.includes(r))
    ) {
      const channelId =
          event.kind === 'memberLeave'
            ? cfg.leaveChannelId
            : cfg.boostChannelId,
        document =
          event.kind === 'memberLeave' ? cfg.leaveDocument : cfg.boostDocument;
      if (channelId && document)
        await ctx.effect('community.message', {
          featureId: 'R20',
          channelId,
          document,
          tokens: { 'member.id': event.memberId, 'server.id': ctx.guildId },
        });
    }
    const roles = await config(ctx, 'R17', AutoRoleConfigSchema);
    if (
      event.kind === 'memberBoost' &&
      roles.enabled &&
      roles.boostRoleIds.length
    ) {
      const desired = await save(
        ctx,
        'role.desired',
        `boost:${event.memberId}`,
        {
          userId: event.memberId,
          desiredRoleIds: roles.boostRoleIds,
          managedRoleIds: roles.boostRoleIds,
        },
        event.memberId,
        'pending',
      );
      await ctx.effect('community.roles.reconcile', {
        featureId: 'R17',
        recordId: desired.id,
        revision: desired.revision,
        userId: event.memberId,
        addRoleIds: roles.boostRoleIds,
        removeRoleIds: [],
      });
    }
  }
  return { duplicate: false, xp: xp ?? null, counting: counting ?? null };
}

export async function createCrateDrop(ctx: DomainContext, raw: unknown) {
  const input = CreateCrateSchema.parse(raw);
  await ctx.requireFeature('R10');
  const cfg = await config(ctx, 'R10', CrateConfigSchema),
    type = weightedChoice(cfg.types),
    channelId = input.channelId ?? cfg.channelId ?? cfg.fallbackChannelIds[0];
  if (!channelId)
    throw new DomainError(
      'INVALID_INPUT',
      'Choose a crate channel before publishing.',
    );
  if (input.scheduleKey) {
    const old = await keyed(ctx, 'crate.drop', input.scheduleKey);
    if (old) return old;
  }
  const expiresAt = new Date(
    ctx.now.getTime() + cfg.durationSeconds * 1000,
  ).toISOString();
  const drop = await createRecord(
    ctx,
    'crate.drop',
    {
      type,
      channelId,
      expiresAt,
      capacity: cfg.capacity,
      claims: 0,
      preview: input.preview,
      repeatCooldownSeconds: cfg.repeatCooldownSeconds,
      excludedRoleIds: cfg.excludedRoleIds,
      publicationState: 'pending',
      failurePolicy: cfg.failurePolicy,
    },
    {
      ...(input.scheduleKey ? { key: input.scheduleKey } : {}),
      state: 'publishing',
    },
  );
  await ctx.effect('community.crate.publish', {
    dropId: drop.id,
    preview: input.preview,
  });
  await ctx.effect(
    'community.crate.expire',
    { dropId: drop.id },
    new Date(expiresAt),
  );
  return drop;
}
export async function claimCrate(ctx: DomainContext, dropId: string) {
  await ctx.requireFeature('R10');
  const drop = await getRecord(ctx, 'crate.drop', dropId),
    data = jsonObject(drop.data),
    key = `${drop.id}:${ctx.actor.userId}`,
    old = await keyed(ctx, 'crate.claim', key);
  if (old) return { claim: old, alreadyClaimed: true };
  if (data['preview'])
    throw new DomainError(
      'INVALID_INPUT',
      'This is a zero-reward preview. It cannot be claimed.',
    );
  if (
    !['open', 'publishing'].includes(drop.state) ||
    Date.parse(String(data['expiresAt'])) <= ctx.now.getTime()
  )
    throw new DomainError(
      'INVALID_INPUT',
      'This crate has expired or closed.',
      409,
    );
  if (data['publicationState'] !== 'applied')
    throw new DomainError(
      'DELIVERY_FAILED',
      'The crate has not been published successfully.',
      409,
    );
  const capacity = Number(data['capacity']),
    count = Number(data['claims']);
  if (count >= capacity)
    throw new DomainError(
      'INVALID_INPUT',
      'All crate claims have been taken.',
      409,
    );
  if (
    Array.isArray(data['excludedRoleIds']) &&
    ctx.actor.roles.some((r) =>
      (data['excludedRoleIds'] as string[]).includes(r),
    )
  )
    throw new DomainError(
      'FORBIDDEN',
      'Your roles are excluded from this crate.',
      403,
    );
  const cooldown = Number(data['repeatCooldownSeconds'] ?? 0);
  if (cooldown) {
    const latest = await ctx.tx.record.findFirst({
      where: {
        guildId: ctx.guildId,
        kind: 'crate.claim',
        ownerId: ctx.actor.userId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (
      latest &&
      ctx.now.getTime() - latest.createdAt.getTime() < cooldown * 1000
    )
      throw new DomainError(
        'RATE_LIMITED',
        'Your crate repeat cooldown has not elapsed.',
        429,
      );
  }
  const type = z
      .object({ minXp: XpAmount, maxXp: XpAmount })
      .parse(data['type']),
    amount = randomInt(type.minXp, type.maxXp + 1);
  const claim = await createRecord(
    ctx,
    'crate.claim',
    {
      dropId,
      userId: ctx.actor.userId,
      xp: amount,
      claimedAt: ctx.now.toISOString(),
    },
    { key, ownerId: ctx.actor.userId },
  );
  await grantXp(
    ctx,
    ctx.actor.userId,
    amount,
    `crate:${key}`,
    'XP crate claim',
  );
  await updateRecord(
    ctx,
    'crate.drop',
    drop.id,
    { ...data, claims: count + 1 },
    drop.revision,
    count + 1 === capacity ? 'exhausted' : 'open',
  );
  await ctx.effect('community.crate.update', { dropId });
  return { claim, alreadyClaimed: false };
}

export async function selectRoleMenu(
  ctx: DomainContext,
  menuId: string,
  raw: unknown,
) {
  await ctx.requireFeature('R16');
  const input = z.object({ roleIds: RoleIds }).parse(raw),
    row = await getRecord(ctx, 'role.menu', menuId),
    menu = RoleMenuSchema.parse(row.data);
  if (row.state !== 'published')
    throw new DomainError(
      'INVALID_INPUT',
      'This role menu is not published.',
      409,
    );
  const selected = [...new Set(input.roleIds)];
  if (
    selected.length < menu.minSelections ||
    selected.length > menu.maxSelections ||
    selected.some((r) => !menu.options.some((o) => o.roleId === r))
  )
    throw new DomainError(
      'INVALID_INPUT',
      'Choose roles within the menu selection limits.',
    );
  const groups = new Set<string>();
  for (const roleId of selected) {
    const option = menu.options.find((o) => o.roleId === roleId)!;
    if (
      option.requiredRoleIds.some((r) => !ctx.actor.roles.includes(r)) ||
      option.blockedRoleIds.some((r) => ctx.actor.roles.includes(r))
    )
      throw new DomainError(
        'FORBIDDEN',
        'You do not meet this role prerequisite.',
        403,
      );
    if (option.group && groups.has(option.group))
      throw new DomainError(
        'INVALID_INPUT',
        'Choose only one role from each exclusive group.',
      );
    if (option.group) groups.add(option.group);
  }
  const expiresAtByRole = Object.fromEntries(
    menu.options
      .filter((o) => selected.includes(o.roleId) && o.expiresSeconds)
      .map((o) => [
        o.roleId,
        new Date(ctx.now.getTime() + o.expiresSeconds! * 1000).toISOString(),
      ]),
  );
  const key = `${menuId}:${ctx.actor.userId}`,
    record = await save(
      ctx,
      'role.selection',
      key,
      {
        menuId,
        userId: ctx.actor.userId,
        selectedRoleIds: selected,
        managedRoleIds: menu.options.map((o) => o.roleId),
        expiresAtByRole,
      },
      ctx.actor.userId,
      'pending',
    );
  await ctx.effect('community.roles.reconcile', {
    featureId: 'R16',
    recordId: record.id,
    revision: record.revision,
    userId: ctx.actor.userId,
    addRoleIds: selected,
    removeRoleIds: menu.options
      .map((o) => o.roleId)
      .filter((r) => !selected.includes(r)),
    menuId,
    menuRevision: row.revision,
  });
  for (const option of menu.options.filter(
    (o) => selected.includes(o.roleId) && o.expiresSeconds,
  ))
    await ctx.effect(
      'community.roles.expire',
      {
        recordId: record.id,
        revision: record.revision,
        userId: ctx.actor.userId,
        roleId: option.roleId,
      },
      new Date(ctx.now.getTime() + option.expiresSeconds! * 1000),
    );
  return record;
}

async function eligibility(
  ctx: DomainContext,
  userId: string,
  requirements: z.infer<typeof EligibilitySchema>,
  roles: string[],
) {
  if (
    requirements.requiredRoleIds.some((r) => !roles.includes(r)) ||
    requirements.blockedRoleIds.some((r) => roles.includes(r))
  )
    throw new DomainError(
      'FORBIDDEN',
      'You do not meet the role requirements.',
      403,
    );
  const profile = await getLevelProfile(ctx, userId);
  if (profile.level < requirements.minLevel)
    throw new DomainError(
      'FORBIDDEN',
      'You do not meet the level requirement.',
      403,
    );
  const member = await keyed(ctx, 'community.member', userId),
    observed = jsonObject(member?.data);
  const accountTime = Number((BigInt(userId) >> 22n) + 1_420_070_400_000n);
  if (
    ctx.now.getTime() - accountTime <
    requirements.minAccountDays * 86_400_000
  )
    throw new DomainError(
      'FORBIDDEN',
      'Your Discord account is too new for this giveaway.',
      403,
    );
  if (requirements.minMemberDays) {
    if (!observed['present'] || typeof observed['joinedAt'] !== 'string')
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'Member join time is not observed. Refresh member facts before entering.',
        503,
      );
    if (
      ctx.now.getTime() - Date.parse(observed['joinedAt']) <
      requirements.minMemberDays * 86_400_000
    )
      throw new DomainError(
        'FORBIDDEN',
        'You have not been a member long enough.',
        403,
      );
  }
  return {
    roles,
    level: profile.level,
    accountCreatedAt: new Date(accountTime).toISOString(),
    joinedAt: observed['joinedAt'] ?? null,
    checkedAt: ctx.now.toISOString(),
    policy: 'entry-snapshot; membership-and-requirements-rechecked-at-claim',
  };
}
export async function enterGiveaway(ctx: DomainContext, giveawayId: string) {
  await ctx.requireFeature('R31');
  const row = await getRecord(ctx, 'giveaway', giveawayId),
    rules = GiveawaySchema.parse(row.data),
    key = `${giveawayId}:${ctx.actor.userId}`,
    previous = await keyed(ctx, 'giveaway.entry', key);
  if (previous) return previous;
  if (row.state !== 'open' || Date.parse(rules.endsAt) <= ctx.now.getTime())
    throw new DomainError('INVALID_INPUT', 'This giveaway is closed.', 409);
  if (
    rules.entryLimit &&
    (await ctx.tx.record.count({
      where: {
        guildId: ctx.guildId,
        kind: 'giveaway.entry',
        data: { path: ['giveawayId'], equals: giveawayId },
      },
    })) >= rules.entryLimit
  )
    throw new DomainError(
      'INVALID_INPUT',
      'The giveaway entry limit has been reached.',
      409,
    );
  const facts = await eligibility(
    ctx,
    ctx.actor.userId,
    rules.eligibility,
    ctx.actor.roles,
  );
  return createRecord(
    ctx,
    'giveaway.entry',
    { giveawayId, userId: ctx.actor.userId, facts },
    { key, ownerId: ctx.actor.userId },
  );
}
export async function drawGiveaway(
  ctx: DomainContext,
  giveawayId: string,
  reroll = false,
  reason = '',
  replacementSlots?: number,
) {
  await ctx.requireFeature('R31');
  const row = await getRecord(ctx, 'giveaway', giveawayId),
    rules = GiveawaySchema.parse(row.data),
    draws = await ctx.tx.record.findMany({
      where: {
        guildId: ctx.guildId,
        kind: 'giveaway.draw',
        data: { path: ['giveawayId'], equals: giveawayId },
      },
      orderBy: { createdAt: 'asc' },
    });
  if (draws.length && !reroll) return draws[0];
  if (reroll && (!draws.length || !reason.trim()))
    throw new DomainError(
      'INVALID_INPUT',
      'A completed draw and a reroll reason are required.',
    );
  if (!reroll && !['open', 'publishing'].includes(row.state))
    throw new DomainError(
      'INVALID_INPUT',
      'This giveaway cannot be drawn in its current state.',
      409,
    );
  const past = new Set(
    draws.flatMap((d) =>
      z.array(z.string()).parse(jsonObject(d.data)['winnerIds'] ?? []),
    ),
  );
  const entries = await ctx.tx.record.findMany({
    where: {
      guildId: ctx.guildId,
      kind: 'giveaway.entry',
      data: { path: ['giveawayId'], equals: giveawayId },
    },
    orderBy: { id: 'asc' },
  });
  const eligibleEntries = [];
  for (const entry of entries) {
    const userId = entry.ownerId!;
    if (past.has(userId)) continue;
    const observed = await keyed(ctx, 'community.member', userId);
    if (observed && jsonObject(observed.data)['present'] === false) continue;
    eligibleEntries.push(entry);
  }
  const priorWinners = reroll
    ? await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'giveaway.winner',
          data: { path: ['giveawayId'], equals: giveawayId },
        },
      })
    : [];
  const claimedCount = priorWinners.filter((w) => w.state === 'claimed').length;
  const slots = reroll
    ? Math.min(
        replacementSlots ?? rules.winnerCount - claimedCount,
        rules.winnerCount - claimedCount,
      )
    : rules.winnerCount;
  if (slots <= 0)
    throw new DomainError(
      'INVALID_INPUT',
      'All configured giveaway slots have already been claimed.',
      409,
    );
  for (const winner of priorWinners.filter((w) => w.state === 'unclaimed'))
    await updateRecord(
      ctx,
      'giveaway.winner',
      winner.id,
      winner.data,
      winner.revision,
      'replaced',
    );
  const winners = secureSample(eligibleEntries, slots),
    round = draws.length,
    claimUntil = new Date(
      ctx.now.getTime() + rules.claimSeconds * 1000,
    ).toISOString();
  const draw = await createRecord(
    ctx,
    'giveaway.draw',
    {
      giveawayId,
      round,
      winnerIds: winners.map((e) => e.ownerId),
      requestedSlots: slots,
      eligibleEntryIds: eligibleEntries.map((e) => e.id),
      excludedWinnerIds: [...past],
      rulesSnapshot: rules,
      claimUntil,
      drawnAt: ctx.now.toISOString(),
      algorithm: 'crypto.randomInt partial Fisher-Yates',
      reason: reason || 'End giveaway',
      policy:
        'entry eligibility snapshot; observed leavers excluded; claim rechecks current requirements',
    },
    { key: `${giveawayId}:${round}`, state: 'drawn' },
  );
  for (const winner of winners)
    await createRecord(
      ctx,
      'giveaway.winner',
      {
        giveawayId,
        drawId: draw.id,
        round,
        userId: winner.ownerId,
        claimUntil,
      },
      {
        key: `${draw.id}:${winner.ownerId}`,
        ownerId: winner.ownerId!,
        state: 'unclaimed',
      },
    );
  await updateRecord(
    ctx,
    'giveaway',
    row.id,
    { ...jsonObject(row.data), latestDrawId: draw.id },
    row.revision,
    'ended',
  );
  await ctx.effect('community.giveaway.announce', {
    giveawayId,
    drawId: draw.id,
  });
  await ctx.effect(
    'community.giveaway.claim-expire',
    { giveawayId, drawId: draw.id },
    new Date(claimUntil),
  );
  return draw;
}
export async function claimGiveaway(ctx: DomainContext, giveawayId: string) {
  await ctx.requireFeature('R31');
  const giveaway = await getRecord(ctx, 'giveaway', giveawayId),
    rules = GiveawaySchema.parse(giveaway.data),
    winner = await ctx.tx.record.findFirst({
      where: {
        guildId: ctx.guildId,
        kind: 'giveaway.winner',
        ownerId: ctx.actor.userId,
        data: { path: ['giveawayId'], equals: giveawayId },
        state: { in: ['unclaimed', 'claimed'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  if (!winner)
    throw new DomainError(
      'FORBIDDEN',
      'You are not an unclaimed winner of this giveaway.',
      403,
    );
  if (winner.state === 'claimed') return winner;
  const data = jsonObject(winner.data);
  if (Date.parse(String(data['claimUntil'])) <= ctx.now.getTime())
    throw new DomainError(
      'INVALID_INPUT',
      'Your claim window has expired.',
      409,
    );
  await eligibility(ctx, ctx.actor.userId, rules.eligibility, ctx.actor.roles);
  const claimed = await updateRecord(
    ctx,
    'giveaway.winner',
    winner.id,
    { ...data, claimedAt: ctx.now.toISOString() },
    winner.revision,
    'claimed',
  );
  await ctx.effect('community.giveaway.claim-notify', {
    giveawayId,
    winnerId: winner.id,
  });
  return claimed;
}

async function submit(
  ctx: DomainContext,
  kind: 'suggestion' | 'question',
  raw: unknown,
) {
  const id = kind === 'suggestion' ? 'R34' : 'R35';
  await ctx.requireFeature(id);
  const cfg = await config(ctx, id, SubmissionConfigSchema),
    input = TextSubmission.parse(raw);
  if (cfg.requiredRoleIds.some((r) => !ctx.actor.roles.includes(r)))
    throw new DomainError(
      'FORBIDDEN',
      'You do not have a required submission role.',
      403,
    );
  if (input.visibility === 'public' && !cfg.public)
    throw new DomainError('INVALID_INPUT', 'Public submissions are disabled.');
  const row = await createRecord(
    ctx,
    kind,
    {
      ...input,
      authorId: ctx.actor.userId,
      decisions: [],
      answers: [],
      discussionUrl: null,
    },
    { state: 'open' },
  );
  if (cfg.channelId && input.visibility === 'public')
    await ctx.effect('community.submission.publish', {
      kind,
      recordId: row.id,
      channelId: cfg.channelId,
    });
  return row;
}
async function visibleRecord(
  ctx: DomainContext,
  kind: string,
  id: string,
  manager = false,
) {
  const row = await getRecord(ctx, kind, id);
  if (
    !manager &&
    row.ownerId !== ctx.actor.userId &&
    jsonObject(row.data)['visibility'] !== 'public'
  )
    throw new DomainError('FORBIDDEN', 'This submission is private.', 403);
  return row;
}
async function voteSuggestion(ctx: DomainContext, id: string, raw: unknown) {
  await ctx.requireFeature('R34');
  const vote = z.object({ value: z.number().int().min(-1).max(1) }).parse(raw),
    row = await visibleRecord(ctx, 'suggestion', id);
  if (row.state !== 'open')
    throw new DomainError(
      'INVALID_INPUT',
      'Voting is closed for this suggestion.',
      409,
    );
  return save(
    ctx,
    'suggestion.vote',
    `${id}:${ctx.actor.userId}`,
    { suggestionId: id, userId: ctx.actor.userId, value: vote.value },
    ctx.actor.userId,
    vote.value === 0 ? 'removed' : 'active',
  );
}
async function listSubmissions(
  ctx: DomainContext,
  kind: string,
  manager: boolean,
) {
  const rows = await ctx.tx.record.findMany({
    where: {
      guildId: ctx.guildId,
      kind,
      ...(manager
        ? {}
        : {
            OR: [
              { ownerId: ctx.actor.userId },
              { data: { path: ['visibility'], equals: 'public' } },
            ],
          }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
  if (kind !== 'suggestion') return rows;
  return Promise.all(
    rows.map(async (row) => {
      const votes = await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'suggestion.vote',
          state: 'active',
          data: { path: ['suggestionId'], equals: row.id },
        },
      });
      const positive = votes.filter(
        (v) => jsonObject(v.data)['value'] === 1,
      ).length;
      const negative = votes.filter(
        (v) => jsonObject(v.data)['value'] === -1,
      ).length;
      return {
        ...row,
        votes: {
          positive,
          negative,
          score: positive - negative,
          myVote:
            jsonObject(votes.find((v) => v.ownerId === ctx.actor.userId)?.data)[
              'value'
            ] ?? 0,
        },
      };
    }),
  );
}

/** Interpret observation transitions; an open gap remains a gap until a later collecting observation. */
export function coverageIntervals(
  observations: Record<string, unknown>[],
  from: string,
  to: string,
) {
  const fromTime = Date.parse(from),
    toTime = Date.parse(to);
  const sorted = observations
    .filter(
      (o) =>
        typeof o['from'] === 'string' && Number.isFinite(Date.parse(o['from'])),
    )
    .sort(
      (a, b) => Date.parse(String(a['from'])) - Date.parse(String(b['from'])),
    );
  const latest = sorted
    .filter((o) => Date.parse(String(o['from'])) <= fromTime)
    .at(-1);
  const gaps: { from: string; to: string; reason: string }[] = [];
  let state = latest?.['status'] === 'collecting' ? 'collecting' : 'gap';
  let cursor = from,
    reason = String(latest?.['reason'] ?? 'No collection coverage observed');
  for (const observation of sorted.filter(
    (o) =>
      Date.parse(String(o['from'])) > fromTime &&
      Date.parse(String(o['from'])) < toTime,
  )) {
    const at = String(observation['from']);
    if (state === 'gap') gaps.push({ from: cursor, to: at, reason });
    cursor = at;
    state = observation['status'] === 'collecting' ? 'collecting' : 'gap';
    reason = String(observation['reason'] ?? 'Collection interrupted');
  }
  if (state === 'gap') gaps.push({ from: cursor, to, reason });
  return {
    collected:
      latest?.['status'] === 'collecting' ||
      sorted.some(
        (o) =>
          o['status'] === 'collecting' &&
          Date.parse(String(o['from'])) >= fromTime &&
          Date.parse(String(o['from'])) < toTime,
      ),
    gaps,
  };
}
export async function readAnalytics(ctx: DomainContext, raw: unknown) {
  const input = AnalyticsQuery.parse(raw),
    cfg = await config(ctx, 'R48', AnalyticsConfigSchema);
  const fromHour = input.from.slice(0, 13) + ':00:00.000Z',
    toHour = input.to.slice(0, 13) + ':00:00.000Z';
  const buckets = await ctx.tx.record.findMany({
    where: {
      guildId: ctx.guildId,
      kind: 'analytics.bucket',
      AND: [
        { data: { path: ['hour'], gte: fromHour } },
        { data: { path: ['hour'], lte: toHour } },
      ],
    },
    orderBy: { key: 'asc' },
    take: 12_000,
  });
  const coverage = await ctx.tx.record.findMany({
    where: { guildId: ctx.guildId, kind: 'analytics.coverage' },
    orderBy: { createdAt: 'asc' },
    take: 10_000,
  });
  const rows = buckets.map((b) => jsonObject(b.data));
  const relevantCoverage = coverage.filter(
    (c) =>
      Date.parse(String(jsonObject(c.data)['from'])) <= Date.parse(input.to),
  );
  const collection = ['messages', 'members', 'voice'].map((metric) => ({
    metric,
    ...coverageIntervals(
      relevantCoverage
        .map((c) => jsonObject(c.data))
        .filter((c) => c['metric'] === metric),
      input.from,
      input.to,
    ),
  }));
  const started = collection.some((c) => c.collected);
  const gaps = collection.flatMap((c) =>
    c.gaps.map((gap) => ({ metric: c.metric, ...gap })),
  );
  const observedAt = rows.reduce<string | null>(
    (a, r) =>
      typeof r['observedAt'] === 'string' && (!a || r['observedAt'] > a)
        ? r['observedAt']
        : a,
    null,
  );
  const modules = await ctx.tx.auditLog.groupBy({
    by: ['action'],
    where: {
      guildId: ctx.guildId,
      createdAt: { gte: new Date(input.from), lt: new Date(input.to) },
    },
    _count: { id: true },
  });
  const guild = await ctx.tx.guild.findUnique({
    where: { id: ctx.guildId },
    select: { memberCount: true, observedAt: true },
  });
  const data = {
    range: {
      from: input.from,
      to: input.to,
      timezone: 'UTC',
      precision: 'hour; boundary hours are included in full',
    },
    enabled: cfg.enabled,
    status:
      !cfg.enabled || !started
        ? 'not-collected'
        : gaps.length
          ? 'collection-gaps'
          : rows.length
            ? 'observed'
            : 'no-activity',
    observedAt,
    gaps,
    coverage: relevantCoverage.map((c) => c.data),
    rows,
    moduleActions: modules.map((m) => ({
      action: m.action,
      count: m._count.id,
    })),
    members: {
      count: guild?.memberCount ?? null,
      observedAt: guild?.observedAt ?? null,
    },
    units: {
      messages: 'events',
      joins: 'members',
      leaves: 'members',
      voiceTransitions: 'events',
      voiceSeconds: 'observed participant-seconds',
      moduleActions: 'committed business operations',
    },
  };
  if (input.format === 'csv')
    return {
      ...data,
      csv:
        'hour,metric,count,observedAt\n' +
        rows
          .map((r) =>
            [r['hour'], r['metric'], r['count'], r['observedAt']].join(','),
          )
          .join('\n'),
    };
  return data;
}

export async function runCommunityJob(
  ctx: DomainContext,
  type: string,
  rawPayload: unknown,
) {
  const payload = jsonObject(rawPayload);
  if (type === 'community.analytics.retention') {
    const cfg = await config(ctx, 'R48', AnalyticsConfigSchema),
      cutoff = new Date(
        ctx.now.getTime() - cfg.retentionDays * 86_400_000,
      ).toISOString();
    const day = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(payload['day']);
    if (await keyed(ctx, 'analytics.retention-run', day))
      return { duplicate: true };
    const buckets = await ctx.tx.record.deleteMany({
      where: {
        guildId: ctx.guildId,
        kind: 'analytics.bucket',
        data: { path: ['hour'], lt: cutoff },
      },
    });
    let coverageRemoved = 0;
    for (const metric of ['messages', 'members', 'voice']) {
      const coverage = await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'analytics.coverage',
          AND: [
            { data: { path: ['metric'], equals: metric } },
            { data: { path: ['from'], lt: cutoff } },
          ],
        },
      });
      const ordered = coverage.sort((a, b) =>
        String(jsonObject(b.data)['from']).localeCompare(
          String(jsonObject(a.data)['from']),
        ),
      );
      if (ordered.length > 1)
        coverageRemoved += (
          await ctx.tx.record.deleteMany({
            where: {
              id: { in: ordered.slice(1).map((r) => r.id) },
              guildId: ctx.guildId,
            },
          })
        ).count;
    }
    const sessions = await ctx.tx.record.deleteMany({
      where: {
        guildId: ctx.guildId,
        kind: 'analytics.voice',
        data: { path: ['since'], lt: cutoff },
      },
    });
    const result = {
      cutoff,
      bucketsRemoved: buckets.count,
      coverageRemoved,
      staleSessionsRemoved: sessions.count,
    };
    await createRecord(ctx, 'analytics.retention-run', result, { key: day });
    await ctx.tx.record.deleteMany({
      where: {
        guildId: ctx.guildId,
        kind: 'analytics.retention-run',
        key: { lt: cutoff.slice(0, 10) },
      },
    });
    const next = new Date(ctx.now.getTime() + 86_400_000);
    await ctx.effect(
      'community.analytics.retention',
      { day: next.toISOString().slice(0, 10) },
      next,
    );
    return result;
  }
  if (type === 'community.giveaway.draw') {
    const id = Id.parse(payload['giveawayId']),
      row = await getRecord(ctx, 'giveaway', id),
      rules = GiveawaySchema.parse(row.data);
    if (Date.parse(rules.endsAt) > ctx.now.getTime())
      throw new DomainError(
        'INVALID_INPUT',
        'The giveaway deadline has not arrived.',
        409,
      );
    return drawGiveaway(ctx, id);
  }
  if (type === 'community.giveaway.claim-expire') {
    const draw = await getRecord(
        ctx,
        'giveaway.draw',
        Id.parse(payload['drawId']),
      ),
      data = jsonObject(draw.data);
    if (Date.parse(String(data['claimUntil'])) > ctx.now.getTime())
      throw new DomainError(
        'INVALID_INPUT',
        'The claim window has not ended.',
        409,
      );
    if (draw.state === 'claims-expired') return { alreadyExpired: true };
    const unclaimed = await ctx.tx.record.findMany({
      where: {
        guildId: ctx.guildId,
        kind: 'giveaway.winner',
        state: 'unclaimed',
        data: { path: ['drawId'], equals: draw.id },
      },
    });
    for (const row of unclaimed)
      await updateRecord(
        ctx,
        'giveaway.winner',
        row.id,
        row.data,
        row.revision,
        'expired',
      );
    await updateRecord(
      ctx,
      'giveaway.draw',
      draw.id,
      draw.data,
      draw.revision,
      'claims-expired',
    );
    const rules = GiveawaySchema.parse(data['rulesSnapshot']);
    if (unclaimed.length && rules.replaceUnclaimed) {
      return drawGiveaway(
        ctx,
        String(data['giveawayId']),
        true,
        `Replace ${unclaimed.length} expired claims from draw ${draw.id}`,
        unclaimed.length,
      );
    }
    return { expired: unclaimed.length };
  }
  if (type === 'community.crate.drop') return createCrateDrop(ctx, payload);
  if (type === 'community.crate.schedule') {
    const schedule = await getRecord(
      ctx,
      'crate.schedule',
      Id.parse(payload['scheduleId']),
    );
    if (schedule.state !== 'active') return { cancelled: true };
    const cfg = CrateScheduleSchema.parse(schedule.data),
      dueAt = Instant.parse(payload['dueAt']),
      key = `${schedule.id}:${dueAt}`;
    if (Date.parse(dueAt) > ctx.now.getTime())
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'This crate schedule is not due yet.',
        503,
      );
    if (await keyed(ctx, 'crate.schedule-run', key)) return { duplicate: true };
    const late =
      ctx.now.getTime() - Date.parse(dueAt) >= cfg.intervalSeconds * 1000;
    const drop =
      late && cfg.missedRunPolicy === 'skip'
        ? null
        : await createCrateDrop(ctx, {
            channelId: cfg.channelId,
            scheduleKey: key,
          });
    await createRecord(
      ctx,
      'crate.schedule-run',
      {
        scheduleId: schedule.id,
        dueAt,
        dropId: drop?.id ?? null,
        outcome: drop ? 'queued' : 'missed-skipped',
      },
      { key },
    );
    const next = new Date(
      Math.max(
        Date.parse(dueAt) + cfg.intervalSeconds * 1000,
        ctx.now.getTime() + cfg.intervalSeconds * 1000,
      ),
    );
    await ctx.effect(
      'community.crate.schedule',
      { scheduleId: schedule.id, dueAt: next.toISOString() },
      next,
    );
    return { drop, nextRunAt: next.toISOString() };
  }
  if (type === 'community.roles.expire') {
    const record = await getRecord(
        ctx,
        'role.selection',
        Id.parse(payload['recordId']),
      ),
      roleId = Snowflake.parse(payload['roleId']),
      revision = Revision.parse(payload['revision']);
    const data = jsonObject(record.data),
      selected = z.array(z.string()).parse(data['selectedRoleIds'] ?? []);
    if (
      record.revision !== revision ||
      record.state === 'externally-changed' ||
      !selected.includes(roleId)
    )
      return { superseded: true };
    const expiresAt = jsonObject(data['expiresAtByRole'])[roleId];
    if (
      typeof expiresAt !== 'string' ||
      Date.parse(expiresAt) > ctx.now.getTime()
    )
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'This role assignment is not due to expire.',
        503,
      );
    const remaining = selected.filter((r) => r !== roleId),
      next = await updateRecord(
        ctx,
        'role.selection',
        record.id,
        { ...data, selectedRoleIds: remaining },
        record.revision,
        'pending',
      );
    await ctx.effect('community.roles.reconcile', {
      featureId: 'R16',
      cleanup: true,
      recordId: next.id,
      revision: next.revision,
      userId: record.ownerId,
      addRoleIds: [],
      removeRoleIds: [roleId],
    });
    // Carry forward other timers with their original deadlines; the revision remains a ownership fence.
    const expiries = jsonObject(data['expiresAtByRole']);
    for (const id of remaining)
      if (typeof expiries[id] === 'string')
        await ctx.effect(
          'community.roles.expire',
          {
            recordId: next.id,
            revision: next.revision,
            userId: record.ownerId,
            roleId: id,
          },
          new Date(expiries[id] as string),
        );
    return next;
  }
  if (type === 'community.crate.expire') {
    const drop = await getRecord(
      ctx,
      'crate.drop',
      Id.parse(payload['dropId']),
    );
    if (
      Date.parse(String(jsonObject(drop.data)['expiresAt'])) > ctx.now.getTime()
    )
      throw new DomainError('INVALID_INPUT', 'The crate has not expired.', 409);
    if (['expired', 'exhausted'].includes(drop.state)) return drop;
    const expired = await updateRecord(
      ctx,
      'crate.drop',
      drop.id,
      drop.data,
      drop.revision,
      'expired',
    );
    await ctx.effect('community.crate.update', { dropId: drop.id });
    return expired;
  }
  throw new DomainError('INVALID_INPUT', 'Unknown community job type.');
}

export const communityRoutes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/guilds/:guildId/levels/me',
    capability: 'member',
    handler: async (ctx) => ({
      profile: await getLevelProfile(ctx, ctx.actor.userId),
      history: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'level.history',
          ownerId: ctx.actor.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    }),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/levels',
    capability: 'community.manage',
    handler: async (ctx) => ({
      profiles: await ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'level.profile' },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    }),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/levels/leaderboard',
    capability: 'member',
    handler: async (ctx) => {
      const rows = await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'level.profile',
          data: { path: ['publicProfile'], equals: true },
        },
        orderBy: { id: 'asc' },
        take: 10_000,
      });
      return rows
        .map((r) => ({
          userId: r.ownerId!,
          xp: ProfileSchema.parse(r.data).xp,
        }))
        .sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId))
        .slice(0, 100);
    },
  },
  {
    method: 'PUT',
    path: '/guilds/:guildId/levels/preferences',
    capability: 'member',
    schema: z.object({
      publicProfile: z.boolean(),
      card: z.object({
        accent: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#FACC15'),
        avatarShape: z.enum(['circle', 'square']).default('circle'),
        layout: z.enum(['compact', 'wide']).default('wide'),
        background: z.enum(['dark', 'light']).default('dark'),
      }),
    }),
    handler: async (ctx, input) => {
      const prefs = z
          .object({
            publicProfile: z.boolean(),
            card: z.record(z.string(), z.unknown()),
          })
          .parse(input),
        old = await getLevelProfile(ctx, ctx.actor.userId);
      return save(
        ctx,
        'level.profile',
        ctx.actor.userId,
        {
          xp: old.xp,
          ...prefs,
          ...(old.lastMessageAt ? { lastMessageAt: old.lastMessageAt } : {}),
        },
        ctx.actor.userId,
      );
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/levels/grants',
    capability: 'community.manage',
    schema: z.object({
      userId: Snowflake,
      amount: z.number().int().min(-1_000_000).max(1_000_000),
      reason: z.string().trim().min(1).max(1000),
    }),
    handler: async (ctx, input) => {
      const data = z
        .object({ userId: Snowflake, amount: z.number(), reason: z.string() })
        .parse(input);
      return grantXp(
        ctx,
        data.userId,
        data.amount,
        `admin:${ctx.operationId}`,
        data.reason,
      );
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/levels/roles/preview',
    capability: 'community.manage',
    schema: z.object({ userId: Snowflake }),
    handler: async (ctx, input) => {
      const userId = Snowflake.parse(jsonObject(input)['userId']),
        profile = await getLevelProfile(ctx, userId),
        cfg = await config(ctx, 'R11', CommunityRewardConfigSchema),
        eligible = cfg.rewards
          .filter((r) => r.level <= profile.level)
          .sort((a, b) => b.level - a.level);
      return {
        userId,
        level: profile.level,
        desiredRoleIds: (cfg.policy === 'highest'
          ? eligible.slice(0, 1)
          : eligible
        ).map((r) => r.roleId),
        managedRoleIds: cfg.rewards.map((r) => r.roleId),
        applied: false,
      };
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/levels/roles/reconcile',
    capability: 'community.manage',
    schema: z.object({ userId: Snowflake }),
    handler: async (ctx, input) => {
      const userId = Snowflake.parse(jsonObject(input)['userId']),
        profile = await getLevelProfile(ctx, userId);
      await reconcileRewardRoles(ctx, userId, profile.level);
      return { userId, desired: 'queued' };
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/crates',
    capability: 'member',
    handler: async (ctx) => ({
      drops: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'crate.drop',
          state: { in: ['open', 'publishing'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      claims: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'crate.claim',
          ownerId: ctx.actor.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/crates',
    capability: 'community.manage',
    schema: CreateCrateSchema.omit({ scheduleKey: true }),
    handler: async (ctx, input) => createCrateDrop(ctx, input),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/crates/schedules',
    capability: 'community.manage',
    handler: async (ctx) =>
      ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'crate.schedule' },
        take: 100,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/crates/schedules',
    capability: 'community.manage',
    schema: CrateScheduleSchema,
    handler: async (ctx, input) => {
      await ctx.requireFeature('R10');
      const cfg = CrateScheduleSchema.parse(input);
      if (Date.parse(cfg.firstRunAt) < ctx.now.getTime())
        throw new DomainError(
          'INVALID_INPUT',
          'The first crate run must be in the future.',
        );
      const schedule = await createRecord(ctx, 'crate.schedule', cfg);
      await ctx.effect(
        'community.crate.schedule',
        { scheduleId: schedule.id, dueAt: cfg.firstRunAt },
        new Date(cfg.firstRunAt),
      );
      return schedule;
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/crates/schedules/:id/cancel',
    capability: 'community.manage',
    schema: z.object({ expectedRevision: Revision }),
    handler: async (ctx, input, params) => {
      const row = await getRecord(
        ctx,
        'crate.schedule',
        Id.parse(params['id']),
      );
      return updateRecord(
        ctx,
        'crate.schedule',
        row.id,
        row.data,
        Revision.parse(jsonObject(input)['expectedRevision']),
        'cancelled',
      );
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/crates/:id/claim',
    capability: 'member',
    handler: async (ctx, _input, params) =>
      claimCrate(ctx, Id.parse(params['id'])),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/counting',
    capability: 'member',
    handler: async (ctx) => ({
      config: await config(ctx, 'R15', CountingConfigSchema),
      channels: await ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'counting.channel' },
      }),
    }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/counting/reset',
    capability: 'community.manage',
    schema: z.object({
      channelId: Snowflake,
      expectedRevision: Revision,
      reason: z.string().trim().min(1).max(1000),
      confirmed: z.literal(true),
    }),
    handler: async (ctx, input) => {
      const data = z
          .object({
            channelId: Snowflake,
            expectedRevision: Revision,
            reason: z.string(),
            confirmed: z.literal(true),
          })
          .parse(input),
        row = await keyed(ctx, 'counting.channel', data.channelId);
      if (!row)
        throw new DomainError(
          'NOT_FOUND',
          'This counting channel has no state.',
          404,
        );
      const cfg = await config(ctx, 'R15', CountingConfigSchema),
        current = jsonObject(row.data);
      const updated = await updateRecord(
        ctx,
        'counting.channel',
        row.id,
        {
          ...current,
          value: cfg.startingValue,
          previousMemberId: null,
          lastAcceptedAt: null,
          streak: 0,
          run: Number(current['run'] ?? 0) + 1,
        },
        data.expectedRevision,
      );
      await createRecord(ctx, 'counting.reset', {
        channelId: data.channelId,
        before: current,
        reason: data.reason,
        actorId: ctx.actor.userId,
        after: updated.data,
      });
      return updated;
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/role-menus',
    capability: 'member',
    handler: async (ctx) =>
      ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'role.menu', state: 'published' },
        take: 100,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/role-menus',
    capability: 'community.manage',
    schema: RoleMenuSchema,
    handler: async (ctx, input) => {
      await ctx.requireFeature('R16');
      const row = await createRecord(ctx, 'role.menu', input, {
        state: 'publishing',
      });
      await ctx.effect('community.role-menu.publish', { menuId: row.id });
      return row;
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/role-menus/:id/select',
    capability: 'member',
    schema: z.object({ roleIds: RoleIds }),
    handler: async (ctx, input, params) =>
      selectRoleMenu(ctx, Id.parse(params['id']), input),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/giveaways',
    capability: 'member',
    handler: async (ctx) => ({
      giveaways: await ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'giveaway' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      myEntries: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'giveaway.entry',
          ownerId: ctx.actor.userId,
        },
        take: 100,
      }),
      myWins: await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'giveaway.winner',
          ownerId: ctx.actor.userId,
        },
        take: 100,
      }),
    }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/giveaways',
    capability: 'community.manage',
    schema: GiveawaySchema,
    handler: async (ctx, input) => {
      await ctx.requireFeature('R31');
      const rules = GiveawaySchema.parse(input);
      if (
        Date.parse(rules.endsAt) <= ctx.now.getTime() ||
        Date.parse(rules.endsAt) > ctx.now.getTime() + 365 * 86_400_000
      )
        throw new DomainError(
          'INVALID_INPUT',
          'Choose a giveaway deadline within the next year.',
        );
      const row = await createRecord(
        ctx,
        'giveaway',
        { ...rules, hostId: ctx.actor.userId },
        { state: 'publishing' },
      );
      await ctx.effect('community.giveaway.publish', { giveawayId: row.id });
      await ctx.effect(
        'community.giveaway.draw',
        { giveawayId: row.id },
        new Date(rules.endsAt),
      );
      return row;
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/giveaways/:id/entry',
    capability: 'member',
    handler: async (ctx, _input, params) =>
      enterGiveaway(ctx, Id.parse(params['id'])),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/giveaways/:id/draw',
    capability: 'community.manage',
    handler: async (ctx, _input, params) =>
      drawGiveaway(ctx, Id.parse(params['id'])),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/giveaways/:id/reroll',
    capability: 'community.manage',
    schema: z.object({ reason: z.string().trim().min(1).max(1000) }),
    handler: async (ctx, input, params) =>
      drawGiveaway(
        ctx,
        Id.parse(params['id']),
        true,
        String(jsonObject(input)['reason']),
      ),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/giveaways/:id/claim',
    capability: 'member',
    handler: async (ctx, _input, params) =>
      claimGiveaway(ctx, Id.parse(params['id'])),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/suggestions',
    capability: 'member',
    handler: async (ctx) => listSubmissions(ctx, 'suggestion', false),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/suggestions/manage',
    capability: 'community.manage',
    handler: async (ctx) => listSubmissions(ctx, 'suggestion', true),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/suggestions',
    capability: 'member',
    schema: TextSubmission,
    handler: async (ctx, input) => submit(ctx, 'suggestion', input),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/suggestions/:id/vote',
    capability: 'member',
    schema: z.object({ value: z.number().int().min(-1).max(1) }),
    handler: async (ctx, input, params) =>
      voteSuggestion(ctx, Id.parse(params['id']), input),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/suggestions/:id/decision',
    capability: 'community.manage',
    schema: z.object({
      expectedRevision: Revision,
      status: z.enum(['accepted', 'rejected', 'planned']),
      reason: z.string().trim().min(1).max(2000),
      discussionUrl: z
        .url()
        .refine((v) => v.startsWith('https://discord.com/channels/'))
        .optional(),
    }),
    handler: async (ctx, input, params) => {
      await ctx.requireFeature('R34');
      const data = z
          .object({
            expectedRevision: Revision,
            status: z.string(),
            reason: z.string(),
            discussionUrl: z.string().optional(),
          })
          .parse(input),
        row = await getRecord(ctx, 'suggestion', Id.parse(params['id'])),
        old = jsonObject(row.data),
        decision = {
          status: data.status,
          reason: data.reason,
          actorId: ctx.actor.userId,
          at: ctx.now.toISOString(),
        };
      const updated = await updateRecord(
        ctx,
        'suggestion',
        row.id,
        {
          ...old,
          discussionUrl: data.discussionUrl ?? old['discussionUrl'],
          decisions: [
            ...(Array.isArray(old['decisions']) ? old['decisions'] : []),
            decision,
          ],
        },
        data.expectedRevision,
        data.status,
      );
      const cfg = await config(ctx, 'R34', SubmissionConfigSchema);
      if (cfg.decisionDm)
        await ctx.effect('community.submission.decision', {
          recordId: row.id,
          userId: row.ownerId,
          decision,
        });
      return updated;
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/questions',
    capability: 'member',
    handler: async (ctx) => listSubmissions(ctx, 'question', false),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/questions/manage',
    capability: 'community.manage',
    handler: async (ctx) => listSubmissions(ctx, 'question', true),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/questions',
    capability: 'member',
    schema: TextSubmission,
    handler: async (ctx, input) => submit(ctx, 'question', input),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/questions/:id/answer',
    capability: 'community.manage',
    schema: z.object({
      expectedRevision: Revision,
      answer: z.string().trim().min(1).max(4000),
    }),
    handler: async (ctx, input, params) => {
      await ctx.requireFeature('R35');
      const data = z
          .object({ expectedRevision: Revision, answer: z.string() })
          .parse(input),
        row = await getRecord(ctx, 'question', Id.parse(params['id'])),
        old = jsonObject(row.data);
      return updateRecord(
        ctx,
        'question',
        row.id,
        {
          ...old,
          answers: [
            ...(Array.isArray(old['answers']) ? old['answers'] : []),
            {
              content: data.answer,
              authorId: ctx.actor.userId,
              at: ctx.now.toISOString(),
            },
          ],
        },
        data.expectedRevision,
        'answered',
      );
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/questions/:id/resolve',
    capability: 'member',
    schema: z.object({ expectedRevision: Revision }),
    handler: async (ctx, input, params) => {
      const row = await visibleRecord(ctx, 'question', Id.parse(params['id']));
      if (row.ownerId !== ctx.actor.userId)
        throw new DomainError(
          'FORBIDDEN',
          'Only the question author can accept an answer.',
          403,
        );
      if (row.state !== 'answered')
        throw new DomainError(
          'INVALID_INPUT',
          'A staff answer is required before resolving this question.',
          409,
        );
      return updateRecord(
        ctx,
        'question',
        row.id,
        { ...jsonObject(row.data), resolvedAt: ctx.now.toISOString() },
        Revision.parse(jsonObject(input)['expectedRevision']),
        'resolved',
      );
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/starboard',
    capability: 'community.manage',
    handler: async (ctx) =>
      ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'starboard.source' },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/analytics',
    capability: 'analytics.read',
    schema: AnalyticsQuery,
    handler: readAnalytics,
  },
];
