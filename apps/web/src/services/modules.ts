import { z } from 'zod';
import { mutate, read } from './http';

export const RecordSchema = z.object({ id: z.string(), title: z.string().optional(), name: z.string().optional(), status: z.string().optional(), createdAt: z.string().optional() }).catchall(z.unknown());
export const getRecords = (guild: string, resource: string, signal?: AbortSignal) => read(`/guilds/${guild}/${resource}`, z.array(RecordSchema), signal);
export const createRecord = (guild: string, resource: string, input: Record<string, unknown>, key: string) => mutate('post', `/guilds/${guild}/${resource}`, input, RecordSchema, key);
export const recordAction = (guild: string, resource: string, id: string, action: string, input: Record<string, unknown>, key: string) => mutate('post', `/guilds/${guild}/${resource}/${id}/${action}`, input, RecordSchema, key);
export const AnalyticsSchema = z.object({ range: z.string(), collectedAt: z.string().nullable(), coverage: z.string(), points: z.array(z.object({ date: z.string(), members: z.number().nullable(), messages: z.number().nullable(), tickets: z.number().nullable() })), gaps: z.array(z.string()).default([]) });
export const getAnalytics = (guild: string, range: string, signal?: AbortSignal) => read(`/guilds/${guild}/analytics?range=${encodeURIComponent(range)}`, AnalyticsSchema, signal);
