import { z } from 'zod';
import { read } from './http';

export const PublicFeatureSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  group: z.string(),
  status: z.string(),
  availability: z.string(),
  permissions: z.array(z.string()).optional(),
  intents: z.array(z.string()).optional(),
  commands: z.array(z.string()).optional(),
});
export const PublicFeaturesSchema = z.object({
  features: z.array(PublicFeatureSchema),
  updatedAt: z.string().optional(),
});
export type PublicFeature = z.infer<typeof PublicFeatureSchema>;
export const PublicCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  usage: z.string().optional(),
  category: z.string().optional(),
  permission: z.string().optional(),
  enabled: z.boolean().optional(),
});
export const PublicCommandsSchema = z.object({
  commands: z.array(PublicCommandSchema),
  updatedAt: z.string().optional(),
});
export const PublicStatusSchema = z.object({
  status: z.enum(['operational', 'degraded', 'unavailable', 'unknown']),
  checkedAt: z.string(),
  services: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      detail: z.string().optional(),
      lastSeenAt: z.string().nullable().optional(),
    }),
  ),
  incidents: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        startedAt: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});
export type PublicStatus = z.infer<typeof PublicStatusSchema>;
export const getPublicFeatures = (signal?: AbortSignal) =>
  read('/public/features', PublicFeaturesSchema, signal);
export const getPublicCommands = (signal?: AbortSignal) =>
  read('/public/commands', PublicCommandsSchema, signal);
export const getPublicStatus = (signal?: AbortSignal) =>
  read('/public/status', PublicStatusSchema, signal);
