import { z } from 'zod';
import {
  CrateScheduleSchema,
  GiveawaySchema,
  RankCardPreferencesSchema,
  RoleMenuSchema,
} from '@sparko/messages/community-contracts';
import { http, mutate, read } from './http';

/** Every community record shares this envelope; `data` is typed per kind. */
function record<T extends z.ZodType>(data: T) {
  return z.object({
    id: z.string(),
    key: z.string(),
    ownerId: z.string().nullable(),
    state: z.string(),
    revision: z.number(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
    data,
  });
}
const Delivery = {
  publicationState: z.enum(['pending', 'applied', 'failed']).optional(),
  deliveryError: z.string().optional(),
  channelId: z.string().optional(),
  messageId: z.string().optional(),
};

// Levels
export const LevelProfileSchema = z.object({
  userId: z.string(),
  xp: z.number(),
  level: z.number(),
  previousLevelXp: z.number(),
  nextLevelXp: z.number().nullable(),
  progress: z.number(),
  publicProfile: z.boolean(),
  card: RankCardPreferencesSchema,
  rank: z.number().optional(),
  revision: z.number(),
  textSummary: z.string(),
});
export const LevelHistorySchema = record(
  z.object({
    delta: z.number(),
    before: z.number(),
    after: z.number(),
    source: z.string(),
    reason: z.string(),
    observedAt: z.string(),
  }),
);
export type LevelHistory = z.infer<typeof LevelHistorySchema>;
const MyLevelSchema = z.object({
  profile: LevelProfileSchema,
  history: z.array(LevelHistorySchema),
});
export const getMyLevel = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/levels/me`, MyLevelSchema, signal);
export const getMemberLevel = (
  guild: string,
  userId: string,
  signal?: AbortSignal,
) =>
  read(
    `/guilds/${guild}/levels/members/${userId}`,
    z.object({
      profile: LevelProfileSchema.omit({ card: true, rank: true }).extend({
        card: z.unknown(),
      }),
      history: z.array(LevelHistorySchema),
    }),
    signal,
  );
export const getLevelProfiles = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/levels`,
    z.object({
      profiles: z.array(
        z.object({
          userId: z.string(),
          xp: z.number(),
          level: z.number(),
          publicProfile: z.boolean(),
          lastMessageAt: z.string().nullable(),
          updatedAt: z.string(),
        }),
      ),
    }),
    signal,
  ).then((data) => data.profiles);
export const getLeaderboard = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/levels/leaderboard`,
    z.array(z.object({ userId: z.string(), xp: z.number() })),
    signal,
  );
export const saveLevelPreferences = (
  guild: string,
  body: {
    publicProfile: boolean;
    card: z.input<typeof RankCardPreferencesSchema>;
  },
  key: string,
) =>
  mutate('put', `/guilds/${guild}/levels/preferences`, body, z.unknown(), key);
export const grantXp = (
  guild: string,
  body: { userId: string; amount: number; reason: string },
  key: string,
) => mutate('post', `/guilds/${guild}/levels/grants`, body, z.unknown(), key);
export const previewRewardRoles = (
  guild: string,
  userId: string,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/levels/roles/preview`,
    { userId },
    z.object({
      userId: z.string(),
      level: z.number(),
      desiredRoleIds: z.array(z.string()),
      managedRoleIds: z.array(z.string()),
      applied: z.boolean(),
    }),
    key,
  );
export const reconcileRewardRoles = (
  guild: string,
  userId: string,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/levels/roles/reconcile`,
    { userId },
    z.object({ userId: z.string(), desired: z.string() }),
    key,
  );
/** Rendered by the same server renderer as Discord `/level`. */
export async function getMyRankCard(guild: string, signal?: AbortSignal) {
  const response = await http.get<Blob>(`/guilds/${guild}/levels/me/card.png`, {
    responseType: 'blob',
    ...(signal ? { signal } : {}),
  });
  const summary = response.headers['x-rank-summary'];
  return {
    blob: response.data,
    summary: typeof summary === 'string' ? decodeURIComponent(summary) : '',
  };
}

// Crates
const CrateTypeData = z.object({
  id: z.string(),
  name: z.string(),
  minXp: z.number(),
  maxXp: z.number(),
});
export const CrateDropSchema = record(
  z
    .object({
      ...Delivery,
      type: CrateTypeData,
      channelId: z.string(),
      expiresAt: z.string(),
      capacity: z.number(),
      claims: z.number().default(0),
      preview: z.boolean().default(false),
    })
    .loose(),
);
export type CrateDrop = z.infer<typeof CrateDropSchema>;
export const CrateClaimSchema = record(
  z.object({
    dropId: z.string(),
    userId: z.string(),
    xp: z.number(),
    claimedAt: z.string(),
  }),
);
export const CrateScheduleRecordSchema = record(CrateScheduleSchema);
export const getCrates = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/crates`,
    z.object({
      drops: z.array(CrateDropSchema),
      claims: z.array(CrateClaimSchema),
    }),
    signal,
  );
export const getCrateHistory = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/crates/history`,
    z.object({
      drops: z.array(CrateDropSchema),
      claims: z.array(CrateClaimSchema),
    }),
    signal,
  );
export const getCrateSchedules = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/crates/schedules`,
    z.array(CrateScheduleRecordSchema),
    signal,
  );
export const dropCrate = (
  guild: string,
  body: { channelId?: string | undefined; preview: boolean },
  key: string,
) => mutate('post', `/guilds/${guild}/crates`, body, CrateDropSchema, key);
export const createCrateSchedule = (
  guild: string,
  body: z.input<typeof CrateScheduleSchema>,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/crates/schedules`,
    body,
    CrateScheduleRecordSchema,
    key,
  );
export const cancelCrateSchedule = (
  guild: string,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/crates/schedules/${id}/cancel`,
    { expectedRevision },
    z.unknown(),
    key,
  );
export const claimCrate = (guild: string, id: string, key: string) =>
  mutate(
    'post',
    `/guilds/${guild}/crates/${id}/claim`,
    {},
    CrateClaimSchema,
    key,
  );

// Counting
export const CountingChannelSchema = record(
  z
    .object({
      value: z.number(),
      previousMemberId: z.string().nullable().optional(),
      lastAcceptedAt: z.string().nullable().optional(),
      streak: z.number().default(0),
      best: z.number().default(0),
      run: z.number().default(0),
    })
    .loose(),
);
export const getCounting = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/counting`,
    z.object({
      config: z.record(z.string(), z.unknown()),
      channels: z.array(CountingChannelSchema),
    }),
    signal,
  );
export const getCountingResets = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/counting/resets`,
    z.array(
      record(
        z.object({
          channelId: z.string(),
          reason: z.string(),
          actorId: z.string(),
          before: z.record(z.string(), z.unknown()),
        }),
      ),
    ),
    signal,
  );
export const resetCounting = (
  guild: string,
  body: { channelId: string; expectedRevision: number; reason: string },
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/counting/reset`,
    { ...body, confirmed: true },
    CountingChannelSchema,
    key,
  );

// Giveaways
export const GiveawayRecordSchema = record(
  z
    .object({ hostId: z.string().optional(), ...Delivery })
    .and(GiveawaySchema.omit({ document: true }).loose()),
);
export type GiveawayRecord = z.infer<typeof GiveawayRecordSchema>;
const EntrySchema = record(z.object({ giveawayId: z.string() }).loose());
const WinnerSchema = record(
  z.object({
    giveawayId: z.string(),
    drawId: z.string(),
    round: z.number(),
    userId: z.string(),
    claimUntil: z.string(),
  }),
);
const DrawSchema = record(
  z
    .object({
      giveawayId: z.string(),
      round: z.number(),
      winnerIds: z.array(z.string()),
      requestedSlots: z.number(),
      eligibleEntryIds: z.array(z.string()),
      claimUntil: z.string(),
      drawnAt: z.string(),
      algorithm: z.string(),
      reason: z.string(),
    })
    .loose(),
);
export const getGiveaways = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/giveaways`,
    z.object({
      giveaways: z.array(GiveawayRecordSchema),
      myEntries: z.array(EntrySchema),
      myWins: z.array(WinnerSchema),
    }),
    signal,
  );
export const getGiveaway = (guild: string, id: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/giveaways/${id}`,
    z.object({
      giveaway: GiveawayRecordSchema,
      entries: z.array(EntrySchema),
      draws: z.array(DrawSchema),
      winners: z.array(WinnerSchema),
    }),
    signal,
  );
export const createGiveaway = (
  guild: string,
  body: z.input<typeof GiveawaySchema>,
  key: string,
) =>
  mutate('post', `/guilds/${guild}/giveaways`, body, GiveawayRecordSchema, key);
export const giveawayAction = (
  guild: string,
  id: string,
  action: 'entry' | 'draw' | 'reroll' | 'claim',
  body: Record<string, unknown>,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/giveaways/${id}/${action}`,
    body,
    z.unknown(),
    key,
  );

// Role menus
export const RoleMenuRecordSchema = record(
  z
    .object({
      ...Delivery,
      name: z.string(),
      channelId: z.string(),
      options: z.array(
        z.object({
          roleId: z.string(),
          label: z.string(),
          group: z.string().optional(),
          expiresSeconds: z.number().optional(),
        }),
      ),
      minSelections: z.number(),
      maxSelections: z.number(),
    })
    .loose(),
);
export const getManagedRoleMenus = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/role-menus/manage`,
    z.array(RoleMenuRecordSchema),
    signal,
  );
export const createRoleMenu = (
  guild: string,
  body: z.input<typeof RoleMenuSchema>,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/role-menus`,
    body,
    RoleMenuRecordSchema,
    key,
  );

// Suggestions and questions
export const SubmissionSchema = record(
  z
    .object({
      content: z.string(),
      visibility: z.enum(['private', 'public']),
      decisions: z
        .array(
          z.object({
            status: z.string(),
            reason: z.string(),
            actorId: z.string(),
            at: z.string(),
          }),
        )
        .default([]),
      answers: z
        .array(
          z.object({
            content: z.string(),
            authorId: z.string(),
            at: z.string(),
          }),
        )
        .default([]),
      discussionUrl: z.string().optional(),
      resolvedAt: z.string().optional(),
    })
    .loose(),
).extend({
  votes: z
    .object({
      positive: z.number(),
      negative: z.number(),
      score: z.number(),
      myVote: z.number(),
    })
    .optional(),
});
export type Submission = z.infer<typeof SubmissionSchema>;
export type SubmissionKind = 'suggestions' | 'questions';
export const getSubmissions = (
  guild: string,
  kind: SubmissionKind,
  manage: boolean,
  signal?: AbortSignal,
) =>
  read(
    `/guilds/${guild}/${kind}${manage ? '/manage' : ''}`,
    z.array(SubmissionSchema),
    signal,
  );
export const submit = (
  guild: string,
  kind: SubmissionKind,
  body: { content: string; visibility: 'private' | 'public' },
  key: string,
) => mutate('post', `/guilds/${guild}/${kind}`, body, SubmissionSchema, key);
export const submissionAction = (
  guild: string,
  kind: SubmissionKind,
  id: string,
  action: 'vote' | 'decision' | 'answer' | 'resolve',
  body: Record<string, unknown>,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/${kind}/${id}/${action}`,
    body,
    z.unknown(),
    key,
  );

// Starboard
export const StarboardSourceSchema = record(z.record(z.string(), z.unknown()));
export const getStarboard = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/starboard`, z.array(StarboardSourceSchema), signal);
