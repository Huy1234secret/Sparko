import { z } from 'zod';
import { Snowflake, Timezone } from './primitives.js';
const roleIds = z.array(Snowflake).max(50).default([]);
const text = z.string().trim().min(1).max(2000);
const future = z.iso.datetime();
export const DestinationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dm') }),
  z.object({ type: z.literal('channel'), channelId: Snowflake }),
]);
export const RecurrenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('once') }),
  z.object({
    type: z.literal('daily'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    type: z.literal('weekly'),
    weekday: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
]);
export const PollSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    choices: z.array(z.string().trim().min(1).max(100)).min(2).max(25),
    requiredRoleIds: roleIds,
    maxSelections: z.number().int().min(1).max(25).default(1),
    allowChange: z.boolean().default(true),
    resultsVisibility: z
      .enum(['public', 'after_close', 'manager'])
      .default('public'),
    endsAt: future,
    channelId: Snowflake.optional(),
  })
  .refine(
    (v) => new Set(v.choices).size === v.choices.length,
    'Choices must be distinct',
  )
  .refine(
    (v) => v.maxSelections <= v.choices.length,
    'Selection count exceeds available choices',
  );
export const EventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000).default(''),
    startsAt: future,
    endsAt: future,
    timezone: Timezone,
    capacity: z.number().int().min(1).max(10000),
    requiredRoleIds: roleIds,
    channelId: Snowflake.optional(),
    remindBeforeMinutes: z.number().int().min(0).max(10080).default(30),
  })
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    'End must follow start',
  );
export const ReminderSchema = z.object({
  text,
  destination: DestinationSchema,
  timezone: Timezone,
  dueAt: future,
  recurrence: RecurrenceSchema.default({ type: 'once' }),
  misfire: z.enum(['skip', 'send_once']).default('send_once'),
});
export const BirthdaySchema = z
  .object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    timezone: Timezone,
    visibility: z.enum(['private', 'public']).default('private'),
    leapDayPolicy: z.enum(['feb28', 'march1', 'leap_only']).default('feb28'),
  })
  .refine(
    (v) =>
      new Date(Date.UTC(2000, v.month - 1, v.day)).getUTCMonth() ===
      v.month - 1,
    'Use a valid month and day',
  );
export const ScheduleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  channelId: Snowflake,
  templateVersionId: z.string().uuid(),
  timezone: Timezone,
  dueAt: future,
  recurrence: RecurrenceSchema.default({ type: 'once' }),
  misfire: z.enum(['skip', 'send_once']).default('skip'),
});
export const ReplySchema = z.object({
  name: z.string().min(1).max(100),
  match: z.enum(['exact', 'contains', 'starts_with']),
  pattern: z.string().trim().min(1).max(200),
  text,
  channelIds: z.array(Snowflake).max(30).default([]),
  excludedRoleIds: roleIds,
  cooldownSeconds: z.number().int().min(5).max(86400).default(60),
});
export const StickySchema = z.object({
  channelId: Snowflake,
  templateVersionId: z.string().uuid(),
  debounceSeconds: z.number().int().min(5).max(300).default(15),
});
export const WorkflowStepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send'), channelId: Snowflake, text }),
  z.object({
    type: z.literal('role'),
    roleId: Snowflake,
    action: z.enum(['add', 'remove']),
  }),
  z.object({
    type: z.literal('ticket'),
    categoryId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  }),
  z.object({
    type: z.literal('wait'),
    seconds: z.number().int().min(1).max(86400),
  }),
  z.object({
    type: z.literal('branch'),
    requiredRoleId: Snowflake,
    onMatch: z.number().int().min(0).max(24),
    onMiss: z.number().int().min(0).max(24),
  }),
]);
export const WorkflowSchema = z
  .object({
    name: z.string().min(1).max(100),
    trigger: z.enum(['manual', 'message', 'join', 'custom']),
    channelIds: z.array(Snowflake).max(30).default([]),
    requiredRoleIds: roleIds,
    steps: z.array(WorkflowStepSchema).min(1).max(25),
    maxActions: z.number().int().min(1).max(10).default(5),
  })
  .superRefine((v, c) => {
    for (let i = 0; i < v.steps.length; i++) {
      const s = v.steps[i]!;
      if (
        s.type === 'branch' &&
        (s.onMatch <= i ||
          s.onMiss <= i ||
          s.onMatch >= v.steps.length ||
          s.onMiss >= v.steps.length)
      )
        c.addIssue({
          code: 'custom',
          path: ['steps', i],
          message:
            'Branches must move forward to an existing step; loops are unsupported.',
        });
    }
  });
export const CustomCommandSchema = z.object({
  name: z.string().regex(/^spark-[a-z0-9-]{1,25}$/),
  description: z.string().min(1).max(100),
  requiredRoleIds: roleIds,
  workflowId: z.string().uuid(),
});
export const automationConfigSchemas: Record<string, z.ZodType> = {
  R33: z.object({ enabled: z.boolean().default(false) }),
  R37: z.object({ enabled: z.boolean().default(false) }),
  R66: z.object({
    enabled: z.boolean().default(false),
    maximumActive: z.number().int().min(1).max(50).default(10),
  }),
  R38: z.object({
    enabled: z.boolean().default(false),
    channelId: Snowflake.optional(),
    roleId: Snowflake.optional(),
    roleDurationHours: z.number().int().min(1).max(72).default(24),
    hour: z.number().int().min(0).max(23).default(9),
  }),
  R39: z.object({
    enabled: z.boolean().default(false),
    lobbyChannelId: Snowflake,
    categoryId: Snowflake.optional(),
    nameTemplate: z.string().min(1).max(80).default('Room {member}'),
    userLimit: z.number().int().min(0).max(99).default(0),
    cleanupDelaySeconds: z.number().int().min(5).max(300).default(30),
  }),
  R40: z.object({ enabled: z.boolean().default(false) }),
  R41: z.object({
    enabled: z.boolean().default(false),
    minimumTenureHours: z.number().int().min(1).max(8760).default(168),
    minimumAccountAgeDays: z.number().int().min(1).max(3650).default(7),
    rewardRoleId: Snowflake,
    reverseOnLeave: z.boolean().default(true),
  }),
  ...Object.fromEntries(
    ['R42', 'R43', 'R44', 'R45', 'R46'].map((id) => [
      id,
      z.object({ enabled: z.boolean().default(false) }),
    ]),
  ),
};
