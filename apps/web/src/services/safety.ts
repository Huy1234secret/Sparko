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
