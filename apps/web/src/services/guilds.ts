import { z } from 'zod';
import { mutate, read } from './http';

export const GuildSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconUrl: z.string().nullable().optional(),
  installed: z.boolean(),
  manageable: z.boolean(),
  capabilities: z.array(z.string()).default([]),
  installUrl: z.string().nullable().optional(),
});
export const GuildsSchema = z.array(GuildSchema);
export type Guild = z.infer<typeof GuildSchema>;
export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.number(),
  canSend: z.boolean().optional(),
});
export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.number().optional(),
  managed: z.boolean().optional(),
  /** Below Sparko's highest role, unmanaged and not privileged. */
  assignable: z.boolean().optional(),
  privileged: z.boolean().optional(),
});
export type Channel = z.infer<typeof ChannelSchema>;
export const OverviewSchema = z.object({
  guild: GuildSchema,
  bot: z.object({
    online: z.boolean(),
    lastSeenAt: z.string().nullable(),
    permissions: z.array(z.string()).default([]),
    issues: z.array(z.string()).default([]),
  }),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      enabled: z.boolean(),
      revision: z.number(),
      appliedRevision: z.number(),
      status: z.string(),
    }),
  ),
  metrics: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        value: z.number().nullable(),
        coverage: z.string(),
        period: z.string(),
      }),
    )
    .default([]),
  activity: z
    .array(
      z.object({
        id: z.string(),
        action: z.string(),
        actor: z.string().optional(),
        createdAt: z.string(),
      }),
    )
    .default([]),
  operations: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        deliveryStatus: z.string(),
        createdAt: z.string(),
      }),
    )
    .default([]),
});
export const ConfigSchema = z.object({
  featureId: z.string(),
  revision: z.number(),
  appliedRevision: z.number(),
  config: z.record(z.string(), z.unknown()),
  setupState: z.enum(['configured', 'unconfigured']).optional(),
  /** Staff policy and plan, separate from the server's own switch. */
  gate: z
    .object({
      ownerAllowed: z.boolean(),
      ownerReason: z.string().nullable(),
      planEntitled: z.boolean(),
      requiredPlan: z.string().nullable(),
      plan: z.string(),
      limits: z
        .object({
          templates: z.number(),
          storageBytes: z.number(),
          automationSteps: z.number(),
          transcriptRetentionDays: z.number(),
        })
        .optional(),
    })
    .optional(),
  // The API reports each unmet requirement with the setting it belongs to.
  missingPrerequisites: z
    .array(
      z.union([
        z.string(),
        z
          .object({ path: z.string(), message: z.string() })
          .transform((item) =>
            item.path ? `${item.path}: ${item.message}` : item.message,
          ),
      ]),
    )
    .default([]),
});
export type FeatureConfig = z.infer<typeof ConfigSchema>;
export const getGuilds = (signal?: AbortSignal) =>
  read('/guilds', GuildsSchema, signal);
export const getOverview = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/overview`, OverviewSchema, signal);
export const getChannels = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/resources/channels`, z.array(ChannelSchema), signal);
export const getRoles = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/resources/roles`, z.array(RoleSchema), signal);
export const getEmojis = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/resources/emojis`,
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        animated: z.boolean(),
        available: z.boolean(),
        roles: z.array(z.string()),
      }),
    ),
    signal,
  );
export const getConfig = (
  guild: string,
  feature: string,
  signal?: AbortSignal,
) => read(`/guilds/${guild}/features/${feature}/config`, ConfigSchema, signal);
export const saveConfig = (
  guild: string,
  feature: string,
  body: { expectedRevision: number; config: Record<string, unknown> },
  key: string,
) =>
  mutate(
    'put',
    `/guilds/${guild}/features/${feature}/config`,
    body,
    ConfigSchema,
    key,
  );
export const SetupPreviewSchema = z.object({
  preset: z.string(),
  changes: z.array(
    z.object({
      featureId: z.string(),
      before: z.unknown(),
      after: z.unknown(),
    }),
  ),
  issues: z.array(z.string()).default([]),
  blockingIssues: z.array(z.string()).default([]),
});
export const previewSetup = (guild: string, preset: string, key: string) =>
  mutate(
    'post',
    `/guilds/${guild}/setup/preview`,
    { preset },
    SetupPreviewSchema,
    key,
  );
export const applySetup = (guild: string, preset: string, key: string) =>
  mutate('post', `/guilds/${guild}/setup/apply`, { preset }, z.unknown(), key);
