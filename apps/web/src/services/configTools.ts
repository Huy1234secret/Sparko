import { z } from 'zod';
import {
  BackupFileSchema,
  protectedFeatureIds,
  type ResourceRemap,
} from '@sparko/contracts/providers';
import { modules } from '../content/modules';
import { mutate, read } from './http';

/**
 * Typed client for configuration backups (R50) and multi-server rollout
 * (R61). Settings only change through restore or rollout, each under the
 * revisions the person previewed.
 */
export type { ResourceRemap };
export const emptyRemap = (): ResourceRemap => ({ channels: {}, roles: {} });
export const isProtected = (featureId: string) =>
  (protectedFeatureIds as readonly string[]).includes(featureId);
export const featureName = (featureId: string) =>
  featureId === 'tickets'
    ? 'Tickets'
    : (modules.find((m) => m.id === featureId)?.name ?? featureId);

export const BackupSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  origin: z.enum(['snapshot', 'import']),
  sourceGuildId: z.string(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  featureIds: z.array(z.string()),
});
export type BackupSummary = z.infer<typeof BackupSummarySchema>;
export const BackupListSchema = z.object({
  backups: z.array(BackupSummarySchema),
  limit: z.number(),
});
const g = (guildId: string) => `/guilds/${guildId}/backups`;
export const getBackups = (guildId: string, signal?: AbortSignal) =>
  read(g(guildId), BackupListSchema, signal);
export const createBackup = (guildId: string, label: string, key: string) =>
  mutate('post', g(guildId), { label }, BackupSummarySchema, key);
export const importBackup = (guildId: string, file: unknown, key: string) =>
  mutate('post', `${g(guildId)}/import`, file, BackupSummarySchema, key);
export const getBackupFile = (guildId: string, id: string) =>
  read(`${g(guildId)}/${id}`, BackupFileSchema);
export const deleteBackup = (guildId: string, id: string, key: string) =>
  mutate('post', `${g(guildId)}/${id}/delete`, {}, z.unknown(), key);

const Ref = z.object({ path: z.string(), id: z.string() });
export const ChangeSchema = z.object({
  featureId: z.string(),
  expectedRevision: z.number(),
  before: z.unknown(),
  proposed: z.unknown(),
  changed: z.boolean(),
  missing: z.object({ channels: z.array(Ref), roles: z.array(Ref) }),
});
export type Change = z.infer<typeof ChangeSchema>;
export const BackupPreviewSchema = z.object({
  backupId: z.string(),
  changes: z.array(
    ChangeSchema.extend({
      issues: z.array(z.object({ path: z.string(), message: z.string() })),
    }),
  ),
});
export type BackupPreview = z.infer<typeof BackupPreviewSchema>;
export const previewRestore = (
  guildId: string,
  id: string,
  remap: ResourceRemap,
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/${id}/preview`,
    { remap },
    BackupPreviewSchema,
    key,
  );
export const restoreBackup = (
  guildId: string,
  id: string,
  body: {
    featureIds: string[];
    expectedRevisions: Record<string, number>;
    remap: ResourceRemap;
  },
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/${id}/restore`,
    body,
    z.object({
      restored: z.array(
        z.object({ featureId: z.string(), revision: z.number() }),
      ),
    }),
    key,
  );

export const RolloutPreviewSchema = z.object({
  sourceGuildId: z.string(),
  targets: z.array(
    z.object({
      guildId: z.string(),
      rolloutAllowed: z.boolean(),
      changes: z.array(ChangeSchema),
    }),
  ),
  excludedFeatures: z.array(z.string()),
  notConfiguredInSource: z.array(z.string()).default([]),
});
export type RolloutPreview = z.infer<typeof RolloutPreviewSchema>;
export const previewRollout = (
  body: {
    sourceGuildId: string;
    targetGuildIds: string[];
    featureIds: string[];
    remaps: Record<string, ResourceRemap>;
  },
  key: string,
) => mutate('post', '/multi-server/preview', body, RolloutPreviewSchema, key);
export const RolloutResultSchema = z.object({
  sourceGuildId: z.string(),
  excludedFeatures: z.array(z.string()),
  results: z.array(
    z.object({
      guildId: z.string(),
      status: z.enum([
        'applied',
        'unchanged',
        'not-allowed',
        'conflict',
        'needs-changes',
        'failed',
      ]),
      message: z.string().optional(),
    }),
  ),
});
export type RolloutResult = z.infer<typeof RolloutResultSchema>;
export const applyRollout = (
  body: {
    sourceGuildId: string;
    featureIds: string[];
    targets: {
      guildId: string;
      expectedRevisions: Record<string, number>;
      remap: ResourceRemap;
    }[];
  },
  key: string,
) => mutate('post', '/multi-server/rollout', body, RolloutResultSchema, key);

/** Reads a downloaded backup file; anything else is refused before upload. */
export async function readBackupFile(file: File) {
  if (file.size > 1_000_000) throw new Error('This file is too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('This is not a Sparko backup file.');
  }
  const result = BackupFileSchema.safeParse(parsed);
  if (!result.success) throw new Error('This is not a Sparko backup file.');
  return result.data;
}
