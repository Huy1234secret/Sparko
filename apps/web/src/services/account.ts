import { z } from 'zod';
import { mutate, read } from './http';
import { RecordSchema } from './modules';

export const getPrivacy = (signal?: AbortSignal) =>
  read(
    '/account/privacy',
    z.object({
      retentionDays: z.number(),
      exports: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          createdAt: z.string(),
          downloadUrl: z.string().optional(),
        }),
      ),
      deletionRequests: z.array(
        z.object({ id: z.string(), status: z.string(), createdAt: z.string() }),
      ),
    }),
    signal,
  );
export const requestExport = (key: string) =>
  mutate('post', '/account/privacy/export', {}, z.unknown(), key);
export const requestDeletion = (reason: string, key: string) =>
  mutate('post', '/account/privacy/deletion', { reason }, z.unknown(), key);
export const getSupport = (signal?: AbortSignal) =>
  read('/account/support', z.array(RecordSchema), signal);
export const createSupport = (subject: string, body: string, key: string) =>
  mutate(
    'post',
    '/account/support',
    { subject, message: body, category: 'other' },
    RecordSchema,
    key,
  );
export const getSessions = (signal?: AbortSignal) =>
  read(
    '/account/sessions',
    z.array(
      z.object({
        id: z.string(),
        current: z.boolean(),
        createdAt: z.string(),
        lastSeenAt: z.string(),
        userAgent: z.string().optional(),
      }),
    ),
    signal,
  );
export const revokeSession = (id: string, key: string) =>
  mutate('post', `/account/sessions/${id}/revoke`, {}, z.unknown(), key);
export const getOwnerHealth = (signal?: AbortSignal) =>
  read(
    '/owner/health',
    z.object({
      build: z.string(),
      checkedAt: z.string(),
      services: z.array(
        z.object({
          name: z.string(),
          status: z.string(),
          detail: z.string().optional(),
          lastSeenAt: z.string().nullable().optional(),
        }),
      ),
      metrics: z
        .array(
          z.object({
            label: z.string(),
            value: z.number().nullable(),
            unit: z.string(),
            window: z.string(),
          }),
        )
        .default([]),
    }),
    signal,
  );
export const getOwnerFleet = (signal?: AbortSignal) =>
  read('/owner/fleet', z.array(RecordSchema), signal);
export const getOwnerJobs = (signal?: AbortSignal) =>
  read('/owner/jobs', z.array(RecordSchema), signal);
export const retryOwnerJob = (id: string, reason: string, key: string) =>
  mutate('post', `/owner/jobs/${id}/retry`, { reason }, z.unknown(), key);
export const getOwnerSupport = (signal?: AbortSignal) =>
  read('/owner/support', z.array(RecordSchema), signal);
