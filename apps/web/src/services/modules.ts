import { z } from 'zod';
import { mutate, read } from './http';

export const RecordSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    createdAt: z.string().optional(),
  })
  .catchall(z.unknown());
const RecordListSchema = z
  .union([
    z.array(RecordSchema),
    z.object({
      profiles: z.array(RecordSchema).optional(),
      drops: z.array(RecordSchema).optional(),
      channels: z.array(RecordSchema).optional(),
      giveaways: z.array(RecordSchema).optional(),
      items: z.array(RecordSchema).optional(),
    }),
  ])
  .transform((data) =>
    Array.isArray(data)
      ? data
      : (data.profiles ??
        data.drops ??
        data.channels ??
        data.giveaways ??
        data.items ??
        []),
  );
export const getRecords = (
  guild: string,
  resource: string,
  signal?: AbortSignal,
) => read(`/guilds/${guild}/${resource}`, RecordListSchema, signal);
export const createRecord = (
  guild: string,
  resource: string,
  input: Record<string, unknown>,
  key: string,
) => mutate('post', `/guilds/${guild}/${resource}`, input, RecordSchema, key);
export const recordAction = (
  guild: string,
  resource: string,
  id: string,
  action: string,
  input: Record<string, unknown>,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/${resource}/${id}/${action}`,
    input,
    RecordSchema,
    key,
  );
export const AnalyticsSchema = z.object({
  range: z.object({
    from: z.string(),
    to: z.string(),
    timezone: z.string(),
    precision: z.string(),
  }),
  enabled: z.boolean(),
  status: z.string(),
  observedAt: z.string().nullable(),
  rows: z.array(
    z.object({
      hour: z.string(),
      metric: z.string(),
      count: z.number(),
      observedAt: z.string(),
    }),
  ),
  gaps: z.array(
    z.object({
      metric: z.string(),
      from: z.string(),
      to: z.string(),
      reason: z.string(),
    }),
  ),
  members: z.object({
    count: z.number().nullable(),
    observedAt: z.string().nullable(),
  }),
  moduleActions: z.array(z.object({ action: z.string(), count: z.number() })),
});
export const getAnalytics = (
  guild: string,
  days: string,
  signal?: AbortSignal,
) => {
  const to = new Date();
  const from = new Date(to.getTime() - Number(days) * 86400000);
  return read(
    `/guilds/${guild}/analytics?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`,
    AnalyticsSchema,
    signal,
  );
};
