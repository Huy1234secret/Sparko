import { z } from 'zod';
import {
  BirthdaySchema,
  CustomCommandSchema,
  EventSchema,
  PollSchema,
  ReminderSchema,
  ReplySchema,
  ScheduleSchema,
  StickySchema,
  WorkflowSchema,
} from '@sparko/contracts';
import { mutate, read } from './http';

/** Every automation record shares this envelope; `data` is typed per kind. */
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
const loose = <T extends z.ZodRawShape>(shape: T) => z.object(shape).loose();
const ok = z.unknown();

// Polls
export const PollRecordSchema = record(
  loose({
    question: z.string(),
    choices: z.array(z.string()),
    maxSelections: z.number().default(1),
    allowChange: z.boolean().default(true),
    resultsVisibility: z.string().default('public'),
    requiredRoleIds: z.array(z.string()).default([]),
    endsAt: z.string(),
    channelId: z.string().optional(),
    closedAt: z.string().optional(),
  }),
).extend({
  myVote: z.array(z.number()).default([]),
  results: z
    .array(z.object({ choice: z.string(), votes: z.number() }))
    .nullable()
    .default(null),
  voterCount: z.number().nullable().default(null),
});
export type PollRecord = z.infer<typeof PollRecordSchema>;
export const getPolls = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/polls`, z.array(PollRecordSchema), signal);
export const createPoll = (
  guild: string,
  body: z.input<typeof PollSchema>,
  key: string,
) => mutate('post', `/guilds/${guild}/polls`, body, ok, key);
export const votePoll = (
  guild: string,
  id: string,
  choices: number[],
  key: string,
) => mutate('post', `/guilds/${guild}/polls/${id}/votes`, { choices }, ok, key);
export const closePoll = (
  guild: string,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/polls/${id}/close`,
    { expectedRevision },
    ok,
    key,
  );

// Events and RSVP
export const EventRecordSchema = record(
  loose({
    title: z.string(),
    description: z.string().default(''),
    startsAt: z.string(),
    endsAt: z.string(),
    timezone: z.string(),
    capacity: z.number(),
    requiredRoleIds: z.array(z.string()).default([]),
    channelId: z.string().optional(),
    remindBeforeMinutes: z.number().default(30),
    cancelReason: z.string().optional(),
  }),
).extend({
  attending: z.number().default(0),
  waiting: z.number().default(0),
  myRsvp: z.string().nullable().default(null),
});
export type EventRecord = z.infer<typeof EventRecordSchema>;
export const getEvents = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/events`, z.array(EventRecordSchema), signal);
export const createEvent = (
  guild: string,
  body: z.input<typeof EventSchema>,
  key: string,
) => mutate('post', `/guilds/${guild}/events`, body, ok, key);
export const updateEvent = (
  guild: string,
  id: string,
  body: { event: z.input<typeof EventSchema>; expectedRevision: number },
  key: string,
) => mutate('put', `/guilds/${guild}/events/${id}`, body, ok, key);
export const rsvpEvent = (
  guild: string,
  id: string,
  choice: 'attending' | 'declined',
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/events/${id}/rsvp`,
    { choice },
    record(z.unknown()),
    key,
  );
export const cancelEvent = (
  guild: string,
  id: string,
  body: { expectedRevision: number; reason: string },
  key: string,
) => mutate('post', `/guilds/${guild}/events/${id}/cancel`, body, ok, key);

// Reminders
const RecurrenceRecord = loose({
  type: z.string(),
  hour: z.number().optional(),
  minute: z.number().optional(),
  weekday: z.number().optional(),
});
export const ReminderRecordSchema = record(
  loose({
    text: z.string(),
    destination: loose({ type: z.string(), channelId: z.string().optional() }),
    timezone: z.string(),
    dueAt: z.string(),
    nextAt: z.string().nullable().optional(),
    lastRunAt: z.string().optional(),
    lastMisfire: z.string().nullable().optional(),
    recurrence: RecurrenceRecord.default({ type: 'once' }),
    misfire: z.string().default('send_once'),
  }),
);
export type ReminderRecord = z.infer<typeof ReminderRecordSchema>;
export const getReminders = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/reminders`, z.array(ReminderRecordSchema), signal);
export const createReminder = (
  guild: string,
  body: z.input<typeof ReminderSchema>,
  key: string,
) => mutate('post', `/guilds/${guild}/reminders`, body, ok, key);
export const cancelReminder = (
  guild: string,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/reminders/${id}/cancel`,
    { expectedRevision },
    ok,
    key,
  );

// Birthdays
export const BirthdayRecordSchema = record(
  loose({
    month: z.number(),
    day: z.number(),
    timezone: z.string(),
    visibility: z.enum(['private', 'public']).default('private'),
    leapDayPolicy: z.enum(['feb28', 'march1', 'leap_only']).default('feb28'),
    nextAt: z.string().optional(),
  }),
);
export const getMyBirthday = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/birthday`, BirthdayRecordSchema.nullable(), signal);
export const saveBirthday = (
  guild: string,
  body: z.input<typeof BirthdaySchema>,
  key: string,
) =>
  mutate('put', `/guilds/${guild}/birthday`, body, BirthdayRecordSchema, key);
export const deleteBirthday = (guild: string, key: string) =>
  mutate('delete', `/guilds/${guild}/birthday`, undefined, ok, key);

// Temporary voice
export const VoiceRoomRecordSchema = record(
  loose({
    creatorId: z.string().optional(),
    name: z.string().default('Voice room'),
    userLimit: z.number().default(0),
    channelId: z.string().nullable().default(null),
    occupants: z.array(z.string()).default([]),
    allowedUsers: z.array(z.string()).default([]),
    locked: z.boolean().optional(),
    deliveryError: z.string().optional(),
  }),
);
export type VoiceRoomRecord = z.infer<typeof VoiceRoomRecordSchema>;
export const getVoiceRooms = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/voice-rooms`, z.array(VoiceRoomRecordSchema), signal);
export type VoiceControl = {
  expectedRevision: number;
  action:
    | 'rename'
    | 'limit'
    | 'lock'
    | 'unlock'
    | 'transfer'
    | 'permit'
    | 'revoke'
    | 'delete';
  name?: string;
  limit?: number;
  userId?: string;
  confirm?: boolean;
};
export const controlVoiceRoom = (
  guild: string,
  id: string,
  body: VoiceControl,
  key: string,
) =>
  mutate('post', `/guilds/${guild}/voice-rooms/${id}/control`, body, ok, key);

// Invite tracking and rewards
export const InviteAttributionSchema = record(
  loose({
    status: z.string().optional(),
    reason: z.string().default(''),
    inviterId: z.string().optional(),
    memberId: z.string(),
    joinedAt: z.string().optional(),
  }),
);
export type InviteAttribution = z.infer<typeof InviteAttributionSchema>;
export const getInvites = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/invites`, z.array(InviteAttributionSchema), signal);
export const InviteRewardSchema = record(
  loose({
    memberId: z.string(),
    inviterId: z.string(),
    roleId: z.string().optional(),
    earnedAt: z.string().optional(),
    leftAt: z.string().optional(),
  }),
);
export const getInviteRewards = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/invite-rewards`, z.array(InviteRewardSchema), signal);

// Scheduled messages
export const ScheduleRecordSchema = record(
  loose({
    name: z.string(),
    channelId: z.string(),
    templateVersionId: z.string(),
    timezone: z.string(),
    dueAt: z.string(),
    nextAt: z.string().nullable().optional(),
    lastRunAt: z.string().optional(),
    lastMisfire: z.string().nullable().optional(),
    recurrence: RecurrenceRecord.default({ type: 'once' }),
    misfire: z.string().default('skip'),
    document: loose({ name: z.string().default('Message') }).optional(),
  }),
);
export type ScheduleRecord = z.infer<typeof ScheduleRecordSchema>;
export const getSchedules = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/schedules`, z.array(ScheduleRecordSchema), signal);
export const createSchedule = (
  guild: string,
  body: z.input<typeof ScheduleSchema>,
  key: string,
) => mutate('post', `/guilds/${guild}/schedules`, body, ok, key);
export const cancelSchedule = (
  guild: string,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/schedules/${id}/cancel`,
    { expectedRevision },
    ok,
    key,
  );

// Replies, sticky messages, workflows and custom commands share one CRUD shape.
export const ReplyRecordSchema = record(
  ReplySchema.and(z.record(z.string(), z.unknown())),
);
export const StickyRecordSchema = record(
  loose({
    channelId: z.string(),
    templateVersionId: z.string(),
    debounceSeconds: z.number().default(15),
    currentMessageId: z.string().nullable().optional(),
    document: loose({ name: z.string().default('Message') }).optional(),
    deliveryError: z.string().optional(),
  }),
);
export const WorkflowRecordSchema = record(
  WorkflowSchema.and(z.record(z.string(), z.unknown())),
);
export const CustomCommandRecordSchema = record(
  loose({
    name: z.string(),
    description: z.string(),
    requiredRoleIds: z.array(z.string()).default([]),
    workflowId: z.string(),
    registrationState: z.string().default('pending'),
  }),
);
export type ReplyRecord = z.infer<typeof ReplyRecordSchema>;
export type StickyRecord = z.infer<typeof StickyRecordSchema>;
export type WorkflowRecord = z.infer<typeof WorkflowRecordSchema>;
export type CustomCommandRecord = z.infer<typeof CustomCommandRecordSchema>;
const crud = {
  replies: { schema: ReplyRecordSchema, input: ReplySchema },
  sticky: { schema: StickyRecordSchema, input: StickySchema },
  workflows: { schema: WorkflowRecordSchema, input: WorkflowSchema },
  'custom-commands': {
    schema: CustomCommandRecordSchema,
    input: CustomCommandSchema,
  },
} as const;
export type CrudPath = keyof typeof crud;
type CrudRecord<P extends CrudPath> = z.infer<(typeof crud)[P]['schema']>;
type CrudInput<P extends CrudPath> = z.input<(typeof crud)[P]['input']>;
export const listAutomation = <P extends CrudPath>(
  guild: string,
  path: P,
  signal?: AbortSignal,
) =>
  read(
    `/guilds/${guild}/${path}`,
    z.array(crud[path].schema),
    signal,
  ) as Promise<CrudRecord<P>[]>;
export const saveAutomation = <P extends CrudPath>(
  guild: string,
  path: P,
  id: string | null,
  config: CrudInput<P>,
  expectedRevision: number | undefined,
  key: string,
) =>
  id
    ? mutate(
        'put',
        `/guilds/${guild}/${path}/${id}`,
        { config, expectedRevision },
        ok,
        key,
      )
    : mutate('post', `/guilds/${guild}/${path}`, config, ok, key);
export const disableAutomation = (
  guild: string,
  path: CrudPath,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'delete',
    `/guilds/${guild}/${path}/${id}`,
    { expectedRevision },
    ok,
    key,
  );

// Workflow runs
export const WorkflowRunSchema = record(
  loose({
    workflowId: z.string(),
    cursor: z.number().default(0),
    actions: z.number().default(0),
    source: loose({ source: z.string(), userId: z.string() }).optional(),
    definition: loose({ name: z.string().default('Workflow') }).optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    waitingUntil: z.string().optional(),
    error: z.string().optional(),
  }),
);
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export const getWorkflowRuns = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/workflow-runs`, z.array(WorkflowRunSchema), signal);
export const runWorkflow = (guild: string, id: string, key: string) =>
  mutate(
    'post',
    `/guilds/${guild}/workflows/${id}/execute`,
    {},
    WorkflowRunSchema,
    key,
  );
export const cancelWorkflowRun = (
  guild: string,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/workflow-runs/${id}/cancel`,
    { expectedRevision },
    ok,
    key,
  );
