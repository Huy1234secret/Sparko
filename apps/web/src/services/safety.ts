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
