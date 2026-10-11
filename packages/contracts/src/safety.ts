import { z } from 'zod';
import { Snowflake, Revision } from './primitives.js';
const reason = z.string().trim().min(3).max(1000);
const actions = z.enum([
  'warn',
  'timeout',
  'kick',
  'ban',
  'unban',
  'note',
  'purge',
  'slowmode',
  'lock',
  'unlock',
]);
const ids = z.array(Snowflake).max(50).default([]);
const punishment = z.enum(['observe', 'warn', 'timeout', 'quarantine']);
export const FormSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2000).default(''),
    requiredRoleIds: ids,
    blockedRoleIds: ids,
    maxSubmissions: z.number().int().min(1).max(20).default(1),
    fields: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
          label: z.string().min(1).max(100),
          required: z.boolean().default(true),
          maxLength: z.number().int().min(1).max(4000).default(1000),
          choices: z.array(z.string().min(1).max(200)).max(25).default([]),
        }),
      )
      .min(1)
      .max(20),
    stages: z
      .array(z.string().trim().min(1).max(50))
      .min(1)
      .max(10)
      .default(['Review']),
    decisionRoleId: Snowflake.optional(),
  })
  .refine(
    (v) => new Set(v.fields.map((f) => f.id)).size === v.fields.length,
    'Field identifiers must be unique',
  )
  .refine(
    (v) => new Set(v.stages).size === v.stages.length,
    'Review stages must be unique',
  );
export const SafetyRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
    name: z.string().min(1).max(100),
    enabled: z.boolean().default(true),
    kind: z.enum([
      'keywords',
      'mentions',
      'links',
      'invites',
      'attachments',
      'caps',
      'burst',
      'duplicate',
    ]),
    keywords: z.array(z.string().min(1).max(100)).max(100).default([]),
    threshold: z.number().int().min(1).max(100).default(5),
    windowSeconds: z.number().int().min(1).max(300).default(10),
    action: punishment.default('observe'),
    timeoutSeconds: z.number().int().min(1).max(2419200).default(60),
    cooldownSeconds: z.number().int().min(1).max(86400).default(60),
    exemptRoleIds: ids,
    exemptChannelIds: ids,
    exemptMemberIds: ids,
  })
  .refine(
    (v) => v.kind !== 'keywords' || v.keywords.length > 0,
    'Keyword rules need at least one literal keyword',
  );
export const safetyConfigSchemas: Record<string, z.ZodType> = {
  R18: z.object({
    enabled: z.boolean().default(false),
    roleId: Snowflake,
    rulesVersion: z.number().int().min(1),
    rulesText: z.string().min(1).max(4000),
    minimumAccountAgeDays: z.number().int().min(0).max(3650).default(0),
    minimumMemberAgeMinutes: z.number().int().min(0).max(43200).default(0),
    challenge: z.enum(['acknowledge', 'arithmetic']).default('acknowledge'),
  }),
  R25: z.object({ enabled: z.boolean().default(false) }),
  R26: z.object({
    enabled: z.boolean().default(false),
    notificationDm: z.boolean().default(true),
  }),
  R27: z
    .object({
      enabled: z.boolean().default(false),
      mode: z.enum(['observe', 'enforce']).default('observe'),
      alertChannelId: Snowflake.optional(),
      quarantineRoleId: Snowflake.optional(),
      rules: z.array(SafetyRuleSchema).max(30).default([]),
      maximumActionsPerMinute: z.number().int().min(1).max(30).default(5),
    })
    .refine(
      (v) => new Set(v.rules.map((r) => r.id)).size === v.rules.length,
      'Rule IDs must be unique',
    )
    .refine(
      (v) =>
        v.mode !== 'enforce' ||
        !v.rules.some((r) => r.action === 'quarantine') ||
        Boolean(v.quarantineRoleId),
      'Enforced quarantine rules need a restricted role',
    ),
  R28: z
    .object({
      enabled: z.boolean().default(false),
      mode: z.enum(['observe', 'quarantine']).default('observe'),
      alertChannelId: Snowflake.optional(),
      joinThreshold: z.number().int().min(2).max(100).default(10),
      windowSeconds: z.number().int().min(5).max(300).default(30),
      quarantineRoleId: Snowflake.optional(),
      trustedRoleIds: ids,
      maximumActionsPerMinute: z.number().int().min(1).max(30).default(5),
    })
    .refine(
      (v) => v.mode !== 'quarantine' || Boolean(v.quarantineRoleId),
      'Quarantine mode requires a restricted quarantine role',
    ),
  R29: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(['observe', 'alert']).default('observe'),
    alertChannelId: Snowflake.optional(),
    threshold: z.number().int().min(1).max(50).default(3),
    windowSeconds: z.number().int().min(5).max(300).default(30),
    trustedMemberIds: ids,
  }),
  R30: z.object({
    enabled: z.boolean().default(false),
    maxOpenPerMember: z.number().int().min(1).max(10).default(3),
  }),
};
export const FormCreateSchema = z.object({ form: FormSchema });
export const FormUpdateSchema = z.object({
  form: FormSchema,
  expectedRevision: Revision,
});
export const ApplicationSubmitSchema = z.object({
  answers: z.record(z.string(), z.string().max(4000)),
});
export const ApplicationReviewSchema = z.object({
  expectedRevision: Revision,
  decision: z.enum(['advance', 'accept', 'reject', 'request_changes']),
  reason,
});
export const ModerationCaseSchema = z
  .object({
    action: actions,
    targetId: Snowflake.optional(),
    channelId: Snowflake.optional(),
    reason,
    durationSeconds: z.number().int().min(1).max(2419200).optional(),
    count: z.number().int().min(1).max(100).optional(),
    slowmodeSeconds: z.number().int().min(0).max(21600).optional(),
    confirm: z.boolean().default(false),
  })
  .superRefine((v, c) => {
    if (
      ['warn', 'timeout', 'kick', 'ban', 'unban', 'note'].includes(v.action) &&
      !v.targetId
    )
      c.addIssue({
        code: 'custom',
        message: 'This action needs a member target',
      });
    if (
      ['purge', 'slowmode', 'lock', 'unlock'].includes(v.action) &&
      !v.channelId
    )
      c.addIssue({ code: 'custom', message: 'This action needs a channel' });
    if (v.action === 'timeout' && !v.durationSeconds)
      c.addIssue({ code: 'custom', message: 'Timeout requires a duration' });
    if (v.action === 'purge' && (!v.count || !v.confirm))
      c.addIssue({
        code: 'custom',
        message: 'Purge needs an affected count and explicit confirmation',
      });
    if (['kick', 'ban', 'lock'].includes(v.action) && !v.confirm)
      c.addIssue({
        code: 'custom',
        message: 'Confirm this consequential action',
      });
    if (v.action === 'slowmode' && v.slowmodeSeconds === undefined)
      c.addIssue({ code: 'custom', message: 'Slowmode requires seconds' });
  });
export const ReportSchema = z.object({
  subject: z.string().min(3).max(200),
  targetId: Snowflake.optional(),
  description: z.string().min(10).max(6000),
  evidence: z
    .array(
      z
        .string()
        .url()
        .refine((u) => u.startsWith('https://'), 'HTTPS evidence only'),
    )
    .max(10)
    .default([]),
});
export const AppealSchema = z.object({
  caseId: z.string().uuid(),
  description: z.string().min(10).max(6000),
});
export const IntakeDecisionSchema = z.object({
  expectedRevision: Revision,
  decision: z.enum(['investigating', 'accepted', 'rejected', 'closed']),
  reason,
});
