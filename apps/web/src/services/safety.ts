import { z } from 'zod';
import { ModerationCaseSchema } from '@sparko/contracts';
import { mutate, read } from './http';

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
export const ModerationCaseRecordSchema = record(
  z
    .object({
      number: z.number(),
      action: z.string(),
      targetId: z.string().optional(),
      channelId: z.string().optional(),
      reason: z.string(),
      durationSeconds: z.number().optional(),
      count: z.number().optional(),
      slowmodeSeconds: z.number().optional(),
      actorId: z.string(),
      requestedAt: z.string(),
      appliedAt: z.string().optional(),
      appliedTimeoutUntil: z.string().optional(),
      notes: z
        .array(
          z.object({ text: z.string(), actorId: z.string(), at: z.string() }),
        )
        .default([]),
    })
    .loose(),
).extend({
  deliveryStatus: z.string().default('pending'),
  deliveryError: z.string().nullable().default(null),
});
export type ModerationCase = z.infer<typeof ModerationCaseRecordSchema>;
export const getCases = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/cases`, z.array(ModerationCaseRecordSchema), signal);
export const createCase = (
  guild: string,
  body: z.input<typeof ModerationCaseSchema>,
  key: string,
) => mutate('post', `/guilds/${guild}/cases`, body, z.unknown(), key);
export const addCaseNote = (
  guild: string,
  id: string,
  body: { text: string; expectedRevision: number },
  key: string,
) =>
  mutate('post', `/guilds/${guild}/cases/${id}/notes`, body, z.unknown(), key);

// Forms and applications
const FormFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean(),
  maxLength: z.number(),
  choices: z.array(z.string()).default([]),
});
const FormBodySchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  requiredRoleIds: z.array(z.string()).default([]),
  blockedRoleIds: z.array(z.string()).default([]),
  maxSubmissions: z.number().default(1),
  fields: z.array(FormFieldSchema),
  stages: z.array(z.string()).default(['Review']),
  decisionRoleId: z.string().optional(),
});
export const FormRecordSchema = record(
  FormBodySchema.extend({
    versions: z
      .array(
        z.object({
          number: z.number(),
          publishedAt: z.string(),
          form: FormBodySchema,
        }),
      )
      .default([]),
    publishedVersion: z.number().nullable().default(null),
  }).loose(),
);
export type FormRecord = z.infer<typeof FormRecordSchema>;
export const ApplicationRecordSchema = record(
  z
    .object({
      formId: z.string(),
      version: z.number().optional(),
      snapshot: FormBodySchema,
      answers: z.record(z.string(), z.string()),
      stage: z.number().default(0),
      history: z
        .array(
          z
            .object({
              event: z.string().optional(),
              decision: z.string().optional(),
              reason: z.string().optional(),
              actorId: z.string(),
              at: z.string(),
            })
            .loose(),
        )
        .default([]),
    })
    .loose(),
);
export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>;
export const getForms = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/forms`, z.array(FormRecordSchema), signal);
export const saveForm = (
  guild: string,
  id: string | null,
  body: { form: unknown; expectedRevision?: number },
  key: string,
) =>
  mutate(
    id ? 'put' : 'post',
    `/guilds/${guild}/forms${id ? `/${id}` : ''}`,
    body,
    FormRecordSchema,
    key,
  );
export const publishForm = (
  guild: string,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/forms/${id}/publish`,
    { expectedRevision },
    FormRecordSchema,
    key,
  );
export const getApplications = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/applications`,
    z.array(ApplicationRecordSchema),
    signal,
  );
export const reviewApplication = (
  guild: string,
  id: string,
  body: {
    expectedRevision: number;
    decision: 'advance' | 'accept' | 'reject' | 'request_changes';
    reason: string;
  },
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/applications/${id}/review`,
    body,
    z.unknown(),
    key,
  );

// Reports and appeals
const IntakeHistorySchema = z
  .array(
    z.object({
      decision: z.string(),
      reason: z.string(),
      reviewerId: z.string(),
      at: z.string(),
    }),
  )
  .default([]);
export const ReportRecordSchema = record(
  z
    .object({
      subject: z.string(),
      targetId: z.string().optional(),
      description: z.string(),
      evidence: z.array(z.string()).default([]),
      history: IntakeHistorySchema,
    })
    .loose(),
);
export const AppealRecordSchema = record(
  z
    .object({
      caseId: z.string(),
      description: z.string(),
      history: IntakeHistorySchema,
    })
    .loose(),
);
export type ReportRecord = z.infer<typeof ReportRecordSchema>;
export type AppealRecord = z.infer<typeof AppealRecordSchema>;
export type IntakeKind = 'report' | 'appeal';
export const getIntake = (
  guild: string,
  kind: IntakeKind,
  signal?: AbortSignal,
) =>
  read(
    `/guilds/${guild}/${kind}s`,
    z.array(kind === 'report' ? ReportRecordSchema : AppealRecordSchema),
    signal,
  ) as Promise<(ReportRecord | AppealRecord)[]>;
export const submitReport = (
  guild: string,
  body: {
    subject: string;
    targetId?: string;
    description: string;
    evidence: string[];
  },
  key: string,
) => mutate('post', `/guilds/${guild}/reports`, body, ReportRecordSchema, key);
export const submitAppeal = (
  guild: string,
  body: { caseId: string; description: string },
  key: string,
) => mutate('post', `/guilds/${guild}/appeals`, body, AppealRecordSchema, key);
export const decideIntake = (
  guild: string,
  kind: IntakeKind,
  id: string,
  body: {
    expectedRevision: number;
    decision: 'investigating' | 'accepted' | 'rejected' | 'closed';
    reason: string;
  },
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/${kind}s/${id}/decision`,
    body,
    z.unknown(),
    key,
  );

// Automod, raid guard and anti-nuke incidents
export const IncidentRecordSchema = record(
  z
    .object({
      feature: z.string(),
      userId: z.string().optional(),
      channelId: z.string().optional(),
      ruleId: z.string().optional(),
      detail: z.string().optional(),
      plannedAction: z.string().optional(),
      mode: z.string().optional(),
      burstCount: z.number().optional(),
      attribution: z.string().optional(),
      recoveryLimits: z.string().optional(),
      event: z
        .object({
          type: z.string(),
          action: z.string().optional(),
          resourceId: z.string().optional(),
          executorId: z.string().optional(),
          userId: z.string().optional(),
        })
        .loose()
        .optional(),
      recovery: z
        .object({
          actorId: z.string(),
          reason: z.string(),
          at: z.string(),
          policy: z.string(),
        })
        .optional(),
    })
    .loose(),
);
export type IncidentRecord = z.infer<typeof IncidentRecordSchema>;
export const getIncidents = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/safety/incidents`,
    z.array(IncidentRecordSchema),
    signal,
  );
export const recoverIncident = (
  guild: string,
  id: string,
  body: { expectedRevision: number; reason: string },
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/safety/incidents/${id}/recover`,
    body,
    IncidentRecordSchema,
    key,
  );
export const RuleTestResultSchema = z.object({
  matched: z.boolean(),
  detail: z.string(),
  plannedAction: z.string().nullable(),
  simulation: z.literal(true),
});
export const testSafetyRule = (
  guild: string,
  body: {
    rule: unknown;
    message: {
      content: string;
      mentionCount: number;
      attachmentCount: number;
      recentCount: number;
      duplicateCount: number;
    };
  },
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/safety/test`,
    body,
    RuleTestResultSchema,
    key,
  );

// Member verification
export const VerificationChallengeSchema = z.object({
  id: z.string().optional(),
  challenge: z.string().optional(),
  question: z.string().optional(),
  rulesVersion: z.number(),
  rulesText: z.string(),
});
export const startVerification = (guild: string, key: string) =>
  mutate(
    'post',
    `/guilds/${guild}/verification/challenge`,
    {},
    VerificationChallengeSchema,
    key,
  );
export const completeVerification = (
  guild: string,
  body: {
    rulesVersion: number;
    acknowledge: true;
    challengeId?: string;
    answer?: string;
  },
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/verification/verify`,
    body,
    z.object({ state: z.string() }).loose(),
    key,
  );
export const MyCaseSchema = z.object({
  id: z.string(),
  number: z.number(),
  action: z.string(),
  reason: z.string(),
  state: z.string(),
  createdAt: z.string(),
  appealed: z.boolean(),
  appealable: z.boolean(),
});
export type MyCase = z.infer<typeof MyCaseSchema>;
export const getMyCases = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/cases/mine`, z.array(MyCaseSchema), signal);
