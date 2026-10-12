import { z } from 'zod';
import { mutate, read } from './http';

export const ownerSections = {
  health: 'diagnostics.read',
  fleet: 'fleet.read',
  jobs: 'diagnostics.read',
  support: 'support.read',
  grants: 'grants.manage',
} as const;
export type OwnerSection = keyof typeof ownerSections;
/** Sections this operator may open, in navigation order. */
export const visibleSections = (capabilities: string[]) =>
  (Object.keys(ownerSections) as OwnerSection[]).filter((section) =>
    capabilities.includes(ownerSections[section]),
  );

export const FleetGuildSchema = z.object({
  id: z.string(),
  name: z.string(),
  installed: z.boolean(),
  createdAt: z.string(),
  memberCount: z.number().nullable().optional(),
});
export const getFleet = (signal?: AbortSignal) =>
  read('/owner/fleet', z.array(FleetGuildSchema), signal);

const GateSchema = z.object({
  featureId: z.string(),
  enabled: z.boolean(),
  ownerAllowed: z.boolean(),
  ownerReason: z.string().nullable(),
  planEntitled: z.boolean(),
  requiredPlan: z.string().nullable(),
});
export type FeatureGate = z.infer<typeof GateSchema>;
export const OwnerGuildSchema = z.object({
  guild: FleetGuildSchema,
  plan: z.object({ id: z.string() }).loose(),
  policies: z.array(
    z.object({
      featureId: z.string(),
      allowed: z.boolean(),
      reason: z.string(),
      revision: z.number(),
      actorId: z.string(),
      updatedAt: z.string(),
    }),
  ),
  entitlements: z.array(
    z.object({
      id: z.string(),
      state: z.string(),
      revision: z.number(),
      source: z.enum(['staff', 'provider']),
      status: z.string().nullable(),
      expiresAt: z.string().nullable(),
      reason: z.string().nullable(),
      revoked: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  features: z.array(GateSchema),
});
export type OwnerGuild = z.infer<typeof OwnerGuildSchema>;
export const getOwnerGuild = (guild: string, signal?: AbortSignal) =>
  read(`/owner/guilds/${guild}`, OwnerGuildSchema, signal);
export const setFeaturePolicy = (
  guild: string,
  featureId: string,
  body: { allowed: boolean; reason: string; expectedRevision: number },
  key: string,
) =>
  mutate(
    'put',
    `/owner/guilds/${guild}/features/${featureId}/policy`,
    body,
    z.unknown(),
    key,
  );
export const grantPlan = (
  guild: string,
  body: { plan: 'plus'; expiresAt: string; reason: string },
  key: string,
) =>
  mutate('post', `/owner/guilds/${guild}/entitlements`, body, z.unknown(), key);
export const revokePlan = (
  guild: string,
  id: string,
  body: { reason: string; expectedRevision: number },
  key: string,
) =>
  mutate(
    'post',
    `/owner/guilds/${guild}/entitlements/${id}/revoke`,
    body,
    z.unknown(),
    key,
  );

export const JobSchema = z.object({
  id: z.string(),
  guildId: z.string(),
  type: z.string(),
  state: z.string(),
  attempts: z.number(),
  dueAt: z.string(),
  lastError: z.string().nullable(),
});
export const getJobs = (signal?: AbortSignal) =>
  read('/owner/jobs', z.array(JobSchema), signal);

export const grantableCapabilities = [
  { id: 'fleet.read', label: 'See servers and their plans' },
  { id: 'support.read', label: 'Read product support' },
  { id: 'support.reply', label: 'Reply to product support' },
  { id: 'diagnostics.read', label: 'Read health and jobs' },
  { id: 'maintenance.manage', label: 'Retry failed jobs' },
  { id: 'entitlements.manage', label: 'Pause features and grant plans' },
] as const;
export const GrantSchema = z.object({
  userId: z.string(),
  capabilities: z.array(z.string()),
  expiresAt: z.string().nullable(),
});
export const getGrants = (signal?: AbortSignal) =>
  read('/owner/grants', z.array(GrantSchema), signal);
export const saveGrant = (
  userId: string,
  body: { capabilities: string[]; expiresAt: string; reason: string },
  key: string,
) => mutate('put', `/owner/grants/${userId}`, body, z.unknown(), key);
export const revokeGrant = (userId: string, reason: string, key: string) =>
  mutate('delete', `/owner/grants/${userId}`, { reason }, z.unknown(), key);
