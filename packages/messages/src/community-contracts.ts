import { z } from 'zod';
import { Snowflake } from '@sparko/contracts';
import { MessageDocumentSchema } from './index.js';

const Enabled = { enabled: z.boolean().default(false) };
const RoleIds = z.array(Snowflake).max(100).default([]);
const Instant = z.iso.datetime();
const Document = MessageDocumentSchema.optional();
const XpAmount = z.number().int().min(0).max(1_000_000);
const RuleRoles = { requiredRoleIds: RoleIds, blockedRoleIds: RoleIds };

export const LevelConfigSchema = z
  .object({
    ...Enabled,
    minXp: XpAmount.default(15),
    maxXp: XpAmount.default(25),
    cooldownSeconds: z.number().int().min(1).max(86_400).default(60),
    baseXp: z.number().int().min(1).max(100_000).default(100),
    growthXp: z.number().int().min(0).max(100_000).default(50),
    maxLevel: z.number().int().min(1).max(1000).default(100),
    excludedChannelIds: RoleIds,
    excludedRoleIds: RoleIds,
    roleMultipliers: z
      .array(
        z.object({ roleId: Snowflake, multiplier: z.number().min(0).max(10) }),
      )
      .max(30)
      .default([]),
    channelMultipliers: z
      .array(
        z.object({
          channelId: Snowflake,
          multiplier: z.number().min(0).max(10),
        }),
      )
      .max(30)
      .default([]),
    maxMultiplier: z.number().min(0).max(10).default(3),
    announcementChannelId: Snowflake.optional(),
    announcement: Document,
  })
  .refine((v) => v.maxXp >= v.minXp, 'Maximum XP must be at least minimum XP');
const RewardRoleSchema = z.object({
  level: z.number().int().min(1).max(1000),
  roleId: Snowflake,
});
export const CommunityRewardConfigSchema = z.object({
  ...Enabled,
  policy: z.enum(['stack', 'highest']).default('highest'),
  rewards: z.array(RewardRoleSchema).max(100).default([]),
});
export const CrateConfigSchema = z
  .object({
    ...Enabled,
    channelId: Snowflake.optional(),
    fallbackChannelIds: RoleIds,
    durationSeconds: z.number().int().min(30).max(604_800).default(300),
    capacity: z.number().int().min(1).max(1000).default(1),
    intervalSeconds: z.number().int().min(60).max(2_592_000).default(3600),
    repeatCooldownSeconds: z.number().int().min(0).max(2_592_000).default(0),
    types: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{1,32}$/),
            name: z.string().min(1).max(80),
            weight: z.number().int().min(1).max(1_000_000),
            minXp: XpAmount,
            maxXp: XpAmount,
            document: Document,
          })
          .refine((v) => v.maxXp >= v.minXp, 'Invalid crate XP range'),
      )
      .min(1)
      .max(30)
      .default([
        { id: 'spark', name: 'Spark crate', weight: 1, minXp: 20, maxXp: 50 },
      ]),
    excludedRoleIds: RoleIds,
    failurePolicy: z.enum(['skip', 'retry']).default('retry'),
  })
  .refine(
    (v) => new Set(v.types.map((t) => t.id)).size === v.types.length,
    'Crate type IDs must be unique',
  );
export const CountingConfigSchema = z.object({
  ...Enabled,
  channelId: Snowflake.optional(),
  startingValue: z.number().int().min(0).max(1_000_000_000).default(0),
  allowConsecutive: z.boolean().default(false),
  failurePolicy: z.enum(['reset', 'ignore']).default('reset'),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(0),
  milestones: z
    .array(
      z.object({
        value: z.number().int().min(1).max(1_000_000_000),
        xp: XpAmount,
      }),
    )
    .max(100)
    .default([]),
  resetDocument: Document,
});
export const RoleMenuConfigSchema = z.object({ ...Enabled });
export const AutoRoleConfigSchema = z.object({
  ...Enabled,
  joinRoleIds: RoleIds,
  delaySeconds: z.number().int().min(0).max(2_592_000).default(0),
  boostRoleIds: RoleIds,
});
export const WelcomeConfigSchema = z.object({
  ...Enabled,
  channelId: Snowflake.optional(),
  document: Document,
  dmDocument: Document,
  excludedRoleIds: RoleIds,
});
export const DepartureConfigSchema = z.object({
  ...Enabled,
  leaveChannelId: Snowflake.optional(),
  leaveDocument: Document,
  boostChannelId: Snowflake.optional(),
  boostDocument: Document,
  excludedRoleIds: RoleIds,
});
export const GiveawayConfigSchema = z.object({
  ...Enabled,
  defaultClaimSeconds: z.number().int().min(60).max(2_592_000).default(86_400),
});
export const SubmissionConfigSchema = z.object({
  ...Enabled,
  channelId: Snowflake.optional(),
  decisionDm: z.boolean().default(false),
  public: z.boolean().default(false),
  requiredRoleIds: RoleIds,
});
export const StarboardConfigSchema = z.object({
  ...Enabled,
  channelId: Snowflake.optional(),
  emoji: z.string().min(1).max(100).default('⭐'),
  threshold: z.number().int().min(1).max(1000).default(3),
  allowSelf: z.boolean().default(false),
  excludedChannelIds: RoleIds,
  excludedRoleIds: RoleIds,
  removedVotes: z.enum(['update', 'keep']).default('update'),
  deletePolicy: z.enum(['delete', 'tombstone']).default('delete'),
});
export const AnalyticsConfigSchema = z.object({
  ...Enabled,
  retentionDays: z.number().int().min(1).max(365).default(30),
});

export const communityConfigSchemas: Record<string, z.ZodType> = {
  R09: LevelConfigSchema,
  R10: CrateConfigSchema,
  R11: CommunityRewardConfigSchema,
  R15: CountingConfigSchema,
  R16: RoleMenuConfigSchema,
  R17: AutoRoleConfigSchema,
  R19: WelcomeConfigSchema,
  R20: DepartureConfigSchema,
  R31: GiveawayConfigSchema,
  R34: SubmissionConfigSchema,
  R35: SubmissionConfigSchema,
  R36: StarboardConfigSchema,
  R48: AnalyticsConfigSchema,
};

export const CreateCrateSchema = z.object({
  channelId: Snowflake.optional(),
  preview: z.boolean().default(false),
  scheduleKey: z.string().min(1).max(128).optional(),
});
export const CrateScheduleSchema = z.object({
  channelId: Snowflake,
  firstRunAt: Instant,
  intervalSeconds: z.number().int().min(60).max(2_592_000),
  missedRunPolicy: z.enum(['skip', 'run-once']).default('skip'),
});

export const RoleMenuSchema = z
  .object({
    name: z.string().min(1).max(80),
    channelId: Snowflake,
    document: Document,
    options: z
      .array(
        z.object({
          roleId: Snowflake,
          label: z.string().min(1).max(80),
          group: z.string().max(32).optional(),
          ...RuleRoles,
          expiresSeconds: z.number().int().min(60).max(2_592_000).optional(),
        }),
      )
      .min(1)
      .max(25),
    minSelections: z.number().int().min(0).max(25).default(0),
    maxSelections: z.number().int().min(1).max(25).default(1),
  })
  .refine(
    (v) =>
      v.minSelections <= v.maxSelections &&
      v.maxSelections <= v.options.length &&
      new Set(v.options.map((o) => o.roleId)).size === v.options.length,
    'Invalid role menu selection limits or duplicate roles',
  );

export const EligibilitySchema = z.object({
  ...RuleRoles,
  minLevel: z.number().int().min(0).max(1000).default(0),
  minAccountDays: z.number().int().min(0).max(3650).default(0),
  minMemberDays: z.number().int().min(0).max(3650).default(0),
});
export const GiveawaySchema = z.object({
  prize: z.string().min(1).max(1000),
  channelId: Snowflake,
  endsAt: Instant,
  winnerCount: z.number().int().min(1).max(100).default(1),
  entryLimit: z.number().int().min(1).max(100_000).optional(),
  eligibility: EligibilitySchema.default({
    requiredRoleIds: [],
    blockedRoleIds: [],
    minLevel: 0,
    minAccountDays: 0,
    minMemberDays: 0,
  }),
  claimSeconds: z.number().int().min(60).max(2_592_000).default(86_400),
  replaceUnclaimed: z.boolean().default(false),
  document: Document,
});

export const TextSubmission = z.object({
  content: z.string().trim().min(1).max(4000),
  visibility: z.enum(['private', 'public']).default('private'),
});

export const AnalyticsQuery = z
  .object({
    from: Instant,
    to: Instant,
    format: z.enum(['json', 'csv']).default('json'),
  })
  .refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= 93 * 86_400_000,
    'Use a positive range of at most 93 days',
  );
