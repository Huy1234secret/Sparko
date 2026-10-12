import { describe, expect, it } from 'vitest';
import type { DomainContext } from './core.js';
import {
  CommunityEventSchema,
  CountingConfigSchema,
  CrateConfigSchema,
  GiveawaySchema,
  LevelConfigSchema,
  claimCrate,
  claimGiveaway,
  countingTransition,
  coverageIntervals,
  drawGiveaway,
  enterGiveaway,
  eligibleMessageXp,
  getLevelProfile,
  grantXp,
  ingestCommunityEvent,
  levelFromXp,
  levelThreshold,
  secureSample,
  weightedChoice,
} from './community.js';

const user = '123456789012345678',
  other = '223456789012345678',
  channel = '323456789012345678',
  role = '423456789012345678';
const at = '2026-10-11T00:00:00.000Z';
function message(changes: Record<string, unknown> = {}) {
  return CommunityEventSchema.parse({
    kind: 'message',
    eventId: 'message-one',
    messageId: '523456789012345678',
    occurredAt: at,
    memberId: user,
    roleIds: [],
    channelId: channel,
    content: '1',
    ...changes,
  }) as Extract<
    ReturnType<typeof CommunityEventSchema.parse>,
    { kind: 'message' }
  >;
}
const initial = {
  value: 0,
  previousMemberId: null,
  lastMessageId: null,
  lastAcceptedAt: null,
  streak: 0,
  best: 0,
  run: 0,
};

describe('bounded progression and randomness', () => {
  it('keeps threshold growth monotonic and computes exact boundary levels', () => {
    for (let level = 1; level <= 100; level++) {
      const threshold = levelThreshold(level, 100, 50);
      expect(threshold).toBeGreaterThan(levelThreshold(level - 1, 100, 50));
      expect(levelFromXp(threshold, 100, 50, 100)).toBe(level);
      expect(levelFromXp(threshold - 1, 100, 50, 100)).toBe(level - 1);
    }
    expect(levelFromXp(10_000_000, 100, 50, 100)).toBe(100);
    expect(() => levelThreshold(1001, 100, 50)).toThrow();
    expect(() => levelFromXp(-1, 100, 50, 100)).toThrow();
  });
  it('covers each weighted integer outcome without floating point bias', () => {
    const distribution = [
      { weight: 1, name: 'small' },
      { weight: 3, name: 'large' },
    ];
    expect(
      [0, 1, 2, 3].map(
        (offset) => weightedChoice(distribution, () => offset).name,
      ),
    ).toEqual(['small', 'large', 'large', 'large']);
    expect(() => weightedChoice([])).toThrow();
    expect(() => weightedChoice([{ weight: -1 }])).toThrow();
    expect(() => weightedChoice(distribution, () => 4)).toThrow();
    expect(
      CrateConfigSchema.safeParse({
        types: [{ id: 'a', name: 'a', weight: 0, minXp: 0, maxXp: 1 }],
      }).success,
    ).toBe(false);
  });
  it('samples unique winners and leaves source entries immutable', () => {
    const entries = ['one', 'two', 'three', 'four'];
    expect(secureSample(entries, 3, (max) => max - 1)).toEqual([
      'four',
      'one',
      'two',
    ]);
    expect(entries).toEqual(['one', 'two', 'three', 'four']);
    expect(new Set(secureSample(entries, 9)).size).toBe(4);
    expect(() => secureSample(entries, -1)).toThrow();
  });
  it('rejects ineligible events and bounds configured boosts', () => {
    const cfg = LevelConfigSchema.parse({
      roleMultipliers: [{ roleId: role, multiplier: 10 }],
      channelMultipliers: [{ channelId: channel, multiplier: 10 }],
      maxMultiplier: 3,
    });
    expect(
      eligibleMessageXp(message({ roleIds: [role] }), cfg).multiplier,
    ).toBe(3);
    expect(eligibleMessageXp(message({ bot: true }), cfg).eligible).toBe(false);
    expect(eligibleMessageXp(message({ webhook: true }), cfg).eligible).toBe(
      false,
    );
    expect(eligibleMessageXp(message(), cfg, at).reason).toBe(
      'cooldown-or-late-event',
    );
    expect(
      eligibleMessageXp(message(), cfg, '2026-10-11T00:01:00.000Z').eligible,
    ).toBe(false);
    expect(
      eligibleMessageXp(
        message(),
        LevelConfigSchema.parse({ excludedChannelIds: [channel] }),
      ).eligible,
    ).toBe(false);
    expect(
      eligibleMessageXp(
        message({ roleIds: [role] }),
        LevelConfigSchema.parse({
          roleMultipliers: [{ roleId: role, multiplier: 0 }],
        }),
      ).multiplier,
    ).toBe(0);
  });
});

describe('counting ordering and turns', () => {
  const cfg = CountingConfigSchema.parse({
    milestones: [{ value: 1, xp: 25 }],
  });
  it('accepts the next value once and marks a milestone', () => {
    const next = countingTransition(initial, message(), cfg);
    expect(next.outcome).toBe('accepted');
    expect(next.milestone).toBe(1);
    expect(next.state).toMatchObject({
      value: 1,
      previousMemberId: user,
      streak: 1,
      best: 1,
    });
    expect(countingTransition(next.state, message(), cfg)).toEqual({
      state: next.state,
      outcome: 'late-or-duplicate',
    });
  });
  it('cannot reset a newer state through a delayed event', () => {
    const current = {
      ...initial,
      value: 10,
      lastMessageId: '623456789012345678',
      streak: 10,
      best: 10,
    };
    expect(
      countingTransition(current, message({ content: '999' }), cfg).state,
    ).toEqual(current);
  });
  it('resets invalid turns, preserves best, and advances reward run identity', () => {
    const current = {
      ...initial,
      value: 1,
      previousMemberId: user,
      lastMessageId: '523456789012345678',
      streak: 1,
      best: 5,
    };
    const transition = countingTransition(
      current,
      message({ messageId: '623456789012345678', content: '2' }),
      cfg,
    );
    expect(transition.outcome).toBe('reset');
    expect(transition.state).toMatchObject({
      value: 0,
      best: 5,
      run: 1,
      previousMemberId: null,
    });
  });
  it('keeps invalid syntax from invoking an expression evaluator', () => {
    expect(
      countingTransition(initial, message({ content: '1+0' }), cfg).outcome,
    ).toBe('invalid-syntax');
    expect(
      countingTransition(initial, message({ content: '1e0' }), cfg).outcome,
    ).toBe('invalid-syntax');
    expect(
      countingTransition(initial, message({ content: '1;process.exit()' }), cfg)
        .outcome,
    ).toBe('invalid-syntax');
  });
});

describe('honest analytics coverage', () => {
  it('compares actual instants when equivalent UTC timestamps use different fractional precision', () => {
    expect(
      coverageIntervals(
        [{ from: '2026-10-11T00:00:00Z', status: 'collecting' }],
        at,
        '2026-10-11T01:00:00.000Z',
      ),
    ).toEqual({ collected: true, gaps: [] });
  });
  it('reports no observations as uncollected rather than zero activity', () => {
    expect(coverageIntervals([], at, '2026-10-11T01:00:00.000Z')).toEqual({
      collected: false,
      gaps: [
        {
          from: at,
          to: '2026-10-11T01:00:00.000Z',
          reason: 'No collection coverage observed',
        },
      ],
    });
  });
  it('keeps an earlier gap open until collection actually resumes', () => {
    const result = coverageIntervals(
      [
        {
          from: '2026-10-10T23:00:00.000Z',
          status: 'gap',
          reason: 'Disconnected',
        },
        { from: '2026-10-11T00:30:00.000Z', status: 'collecting' },
      ],
      at,
      '2026-10-11T01:00:00.000Z',
    );
    expect(result.collected).toBe(true);
    expect(result.gaps).toEqual([
      { from: at, to: '2026-10-11T00:30:00.000Z', reason: 'Disconnected' },
    ]);
  });
});

// Repository double exercises the actual domain services. Production serializes through PostgreSQL Platform;
// separate integration checks cover transaction/advisory-lock behavior against PostgreSQL.
function fixture() {
  type Row = {
    id: string;
    guildId: string;
    kind: string;
    key: string;
    ownerId: string | null;
    state: string;
    revision: number;
    data: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
  const rows: Row[] = [],
    effects: { type: string; payload: unknown; dueAt?: Date }[] = [],
    configs: Record<string, unknown> = {
      R09: { enabled: true, minXp: 25, maxXp: 25 },
      R10: { enabled: true },
      R31: { enabled: true },
    };
  const matches = (row: Row, where: Record<string, unknown>): boolean => {
    for (const [field, value] of Object.entries(where)) {
      if (
        field === 'AND' &&
        !(value as Record<string, unknown>[]).every((v) => matches(row, v))
      )
        return false;
      else if (
        field === 'OR' &&
        !(value as Record<string, unknown>[]).some((v) => matches(row, v))
      )
        return false;
      else if (field === 'data') {
        const query = value as { path: string[]; equals?: unknown };
        let found: unknown = row.data;
        for (const p of query.path)
          found = (found as Record<string, unknown>)[p];
        if ('equals' in query && found !== query.equals) return false;
      } else if (field !== 'AND' && field !== 'OR') {
        const got = (row as unknown as Record<string, unknown>)[field];
        if (value && typeof value === 'object' && 'in' in value) {
          if (!(value as { in: unknown[] }).in.includes(got)) return false;
        } else if (got !== value) return false;
      }
    }
    return true;
  };
  const create = async ({
    data,
  }: {
    data: Partial<Row> & Pick<Row, 'kind' | 'key' | 'data'>;
  }) => {
    if (rows.some((row) => row.kind === data.kind && row.key === data.key))
      throw new Error('Unique record constraint');
    const row: Row = {
      id: `record-${rows.length + 1}`,
      guildId: 'guild',
      ownerId: user,
      state: 'active',
      revision: 1,
      createdAt: new Date(at),
      updatedAt: new Date(at),
      ...data,
    };
    rows.push(row);
    return { ...row };
  };
  const update = async ({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => {
    const row = rows.find((r) => r.id === where.id)!;
    Object.assign(row, {
      ...data,
      revision:
        typeof data['revision'] === 'object'
          ? row.revision +
            Number((data['revision'] as { increment: number }).increment)
          : row.revision,
    });
    return { ...row };
  };
  const tx = {
    record: {
      findUnique: async ({
        where,
      }: {
        where: { guildId_kind_key: { kind: string; key: string } };
      }) =>
        rows.find(
          (r) =>
            r.kind === where.guildId_kind_key.kind &&
            r.key === where.guildId_kind_key.key,
        ) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((r) => matches(r, where)),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((r) => matches(r, where)).length,
      create,
      update,
      upsert: async (args: {
        where: { guildId_kind_key: { kind: string; key: string } };
        create: Partial<Row> & Pick<Row, 'kind' | 'key' | 'data'>;
        update: Record<string, unknown>;
      }) => {
        const row = rows.find(
          (r) =>
            r.kind === args.where.guildId_kind_key.kind &&
            r.key === args.where.guildId_kind_key.key,
        );
        return row
          ? update({ where: { id: row.id }, data: args.update })
          : create({ data: args.create });
      },
    },
    featurePolicy: { findUnique: async () => null },
    featureConfig: {
      findUnique: async ({
        where,
      }: {
        where: { guildId_featureId: { featureId: string } };
      }) =>
        configs[where.guildId_featureId.featureId]
          ? { config: configs[where.guildId_featureId.featureId] }
          : null,
    },
  };
  const ctx: DomainContext = {
    tx: tx as unknown as DomainContext['tx'],
    guildId: 'guild',
    actor: {
      userId: user,
      guildId: 'guild',
      roles: [],
      isAdmin: false,
      isOwner: false,
      capabilities: [],
      globalCapabilities: [],
    },
    now: new Date(at),
    operationId: 'operation-one',
    requireFeature: async (id) => {
      if (!(configs[id] as { enabled?: boolean })?.enabled)
        throw new Error('Disabled feature');
    },
    effect: async (type, payload, dueAt) => {
      effects.push({ type, payload, ...(dueAt ? { dueAt } : {}) });
      return `effect-${effects.length}`;
    },
  };
  return { ctx, rows, effects, configs, create };
}

describe('persisted community business services', () => {
  it('does not revive deleted starboard content or a removed vote through late observations', async () => {
    const { ctx, rows, configs, effects } = fixture();
    configs['R36'] = {
      enabled: true,
      channelId: role,
      threshold: 1,
      emoji: '⭐',
    };
    const reaction = {
      kind: 'reaction',
      eventId: 'star-added',
      occurredAt: at,
      memberId: other,
      roleIds: [],
      bot: false,
      sourceMessageId: '523456789012345678',
      sourceChannelId: channel,
      sourceAuthorId: user,
      emoji: '⭐',
      added: true,
      sourceContent: 'Visible source',
    };
    await ingestCommunityEvent(ctx, reaction);
    ctx.now = new Date('2026-10-11T00:01:00Z');
    await ingestCommunityEvent(ctx, {
      ...reaction,
      eventId: 'star-removed',
      occurredAt: '2026-10-11T00:01:00Z',
      added: false,
    });
    await ingestCommunityEvent(ctx, {
      ...reaction,
      eventId: 'late-star-added',
    });
    expect(rows.find((r) => r.kind === 'starboard.vote')?.state).toBe(
      'removed',
    );
    await ingestCommunityEvent(ctx, {
      kind: 'messageDelete',
      eventId: 'source-deleted',
      occurredAt: ctx.now.toISOString(),
      sourceMessageId: reaction.sourceMessageId,
      sourceChannelId: channel,
    });
    const before = effects.length;
    await ingestCommunityEvent(ctx, {
      ...reaction,
      eventId: 'deleted-star-replay',
    });
    expect(rows.find((r) => r.kind === 'starboard.source')?.data).toMatchObject(
      { deleted: true, content: null, contentAvailable: false },
    );
    expect(effects).toHaveLength(before);
  });
  it('retains a deletion tombstone observed before any starboard reaction', async () => {
    const { ctx, rows, configs, effects } = fixture();
    configs['R36'] = {
      enabled: true,
      channelId: role,
      threshold: 1,
      emoji: '⭐',
    };
    await ingestCommunityEvent(ctx, {
      kind: 'messageDelete',
      eventId: 'unmirrored-delete',
      occurredAt: at,
      sourceMessageId: '523456789012345678',
      sourceChannelId: channel,
    });
    await ingestCommunityEvent(ctx, {
      kind: 'reaction',
      eventId: 'late-reaction',
      occurredAt: at,
      memberId: other,
      roleIds: [],
      bot: false,
      sourceMessageId: '523456789012345678',
      sourceChannelId: channel,
      sourceAuthorId: user,
      emoji: '⭐',
      added: true,
      sourceContent: 'Deleted content',
    });
    expect(rows.find((r) => r.kind === 'starboard.source')?.data).toMatchObject(
      { deleted: true, content: null },
    );
    expect(effects).toHaveLength(0);
  });
  it('uses the observed rejoin time instead of retaining tenure from a prior membership', async () => {
    const { ctx, rows, create } = fixture();
    await create({
      data: {
        kind: 'community.member',
        key: user,
        data: {
          joinedAt: '2025-01-01T00:00:00Z',
          observedAt: '2026-10-10T23:00:00.000Z',
          present: false,
        },
      },
    });
    await ingestCommunityEvent(ctx, {
      kind: 'memberJoin',
      eventId: 'member-rejoin',
      occurredAt: at,
      memberId: user,
      roleIds: [],
      bot: false,
    });
    expect(rows.find((r) => r.kind === 'community.member')?.data).toMatchObject(
      { joinedAt: at, present: true },
    );
  });
  it('deduplicates message rewards independently of gateway delivery identity and respects cooldown', async () => {
    const { ctx, rows } = fixture();
    await ingestCommunityEvent(ctx, message());
    await ingestCommunityEvent(ctx, message());
    await ingestCommunityEvent(
      ctx,
      message({ eventId: 'retry-different-receipt' }),
    );
    await ingestCommunityEvent(
      ctx,
      message({
        eventId: 'second',
        messageId: '623456789012345678',
        occurredAt: '2026-10-11T00:00:30.000Z',
      }),
    );
    expect((await getLevelProfile(ctx, user)).xp).toBe(25);
    expect(rows.filter((r) => r.kind === 'level.history')).toHaveLength(1);
  });
  it('checks XP removal bounds and applies idempotent explicit grants', async () => {
    const { ctx } = fixture();
    await grantXp(ctx, user, 100, 'admin-grant', 'Approved adjustment');
    await grantXp(ctx, user, 100, 'admin-grant', 'Approved adjustment');
    expect((await getLevelProfile(ctx, user)).xp).toBe(100);
    await expect(
      grantXp(ctx, user, -101, 'admin-remove', 'Approved adjustment'),
    ).rejects.toThrow('negative');
  });
  it('commits one crate XP reward and closes capacity without replay rewards', async () => {
    const { ctx, create, rows } = fixture();
    const drop = await create({
      data: {
        kind: 'crate.drop',
        key: 'drop-one',
        state: 'open',
        data: {
          type: { minXp: 40, maxXp: 40 },
          expiresAt: '2026-10-11T00:10:00.000Z',
          capacity: 1,
          claims: 0,
          preview: false,
          publicationState: 'applied',
        },
      },
    });
    await claimCrate(ctx, drop.id);
    await claimCrate(ctx, drop.id);
    expect((await getLevelProfile(ctx, user)).xp).toBe(40);
    expect(rows.filter((r) => r.kind === 'crate.claim')).toHaveLength(1);
    ctx.actor = { ...ctx.actor, userId: other };
    await expect(claimCrate(ctx, drop.id)).rejects.toThrow('expired or closed');
    expect((await getLevelProfile(ctx, other)).xp).toBe(0);
  });
  it('rejects unpublished and preview crates before creating a reward', async () => {
    const { ctx, create, rows } = fixture();
    const unpublished = await create({
      data: {
        kind: 'crate.drop',
        key: 'unpublished',
        state: 'publishing',
        data: {
          expiresAt: '2026-10-11T00:10:00.000Z',
          preview: false,
          publicationState: 'pending',
        },
      },
    });
    await expect(claimCrate(ctx, unpublished.id)).rejects.toThrow(
      'not been published',
    );
    const preview = await create({
      data: {
        kind: 'crate.drop',
        key: 'preview',
        state: 'open',
        data: { preview: true },
      },
    });
    await expect(claimCrate(ctx, preview.id)).rejects.toThrow('zero-reward');
    expect(rows.filter((r) => r.kind === 'level.history')).toHaveLength(0);
  });
  it('draws once, persists immutable winners, and actor binds claims', async () => {
    const { ctx, create, rows } = fixture();
    const rules = GiveawaySchema.parse({
      prize: 'Community badge',
      channelId: channel,
      endsAt: '2026-10-11T00:10:00.000Z',
    });
    const giveaway = await create({
      data: { kind: 'giveaway', key: 'giveaway', state: 'open', data: rules },
    });
    await enterGiveaway(ctx, giveaway.id);
    await enterGiveaway(ctx, giveaway.id);
    const first = await drawGiveaway(ctx, giveaway.id),
      again = await drawGiveaway(ctx, giveaway.id);
    expect(first?.id).toBe(again?.id);
    expect(rows.filter((r) => r.kind === 'giveaway.entry')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'giveaway.draw')).toHaveLength(1);
    ctx.actor = { ...ctx.actor, userId: other };
    await expect(claimGiveaway(ctx, giveaway.id)).rejects.toThrow(
      'not an unclaimed winner',
    );
    ctx.actor = { ...ctx.actor, userId: user };
    await claimGiveaway(ctx, giveaway.id);
    await claimGiveaway(ctx, giveaway.id);
    expect(
      rows.filter((r) => r.kind === 'giveaway.winner' && r.state === 'claimed'),
    ).toHaveLength(1);
  });
  it('rejects eligibility requiring unavailable membership facts', async () => {
    const { ctx, create } = fixture();
    const giveaway = await create({
      data: {
        kind: 'giveaway',
        key: 'giveaway',
        state: 'open',
        data: GiveawaySchema.parse({
          prize: 'Badge',
          channelId: channel,
          endsAt: '2026-10-11T00:10:00.000Z',
          eligibility: { minMemberDays: 7 },
        }),
      },
    });
    await expect(enterGiveaway(ctx, giveaway.id)).rejects.toThrow(
      'not observed',
    );
  });
});
