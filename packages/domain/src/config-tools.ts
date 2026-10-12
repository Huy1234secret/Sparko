import { DomainError } from '@sparko/contracts';
import {
  protectedFeatureIds,
  type ResourceRemap,
} from '@sparko/contracts/providers';
import { json } from '@sparko/db';
import { hash, type DomainContext } from './core.js';

/**
 * Shared pieces for configuration backups (R50), multi-server rollout (R61)
 * and the settings editor: finding the Discord channels and roles a setting
 * names, remapping them for another server, and comparing or writing a set of
 * module settings under their expected revisions.
 */
export type ConfigRow = {
  featureId: string;
  revision: number;
  config: unknown;
};
export type ResourceRef = { path: string; id: string };

const channelKey = /channelIds?$/i,
  roleKey = /roleIds?$/i;
/** Message documents keep their own references, checked when published. */
const skipKey = (key: string) => key === 'document' || key.endsWith('Document');

/** Every channel and role a setting names, at its exact path. */
export function configReferences(config: unknown) {
  const channels: ResourceRef[] = [],
    roles: ResourceRef[] = [];
  function visit(value: unknown, path: string[]): void {
    if (Array.isArray(value))
      return value.forEach((item, index) =>
        visit(item, [...path, String(index)]),
      );
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const target = channelKey.test(key)
        ? channels
        : roleKey.test(key)
          ? roles
          : null;
      if (target && typeof item === 'string')
        target.push({ path: [...path, key].join('.'), id: item });
      else if (target && Array.isArray(item))
        item.forEach((id, index) => {
          if (typeof id === 'string')
            target.push({ path: [...path, key, String(index)].join('.'), id });
        });
      else if (!skipKey(key)) visit(item, [...path, key]);
    }
  }
  visit(config, []);
  return { channels, roles };
}

/** A copy of the settings with channels and roles swapped for their mapped IDs. */
export function remapConfig(config: unknown, remap: ResourceRemap): unknown {
  const swap = (map: Record<string, string>, item: unknown) =>
    typeof item === 'string'
      ? (map[item] ?? item)
      : Array.isArray(item)
        ? item.map((id) => (typeof id === 'string' ? (map[id] ?? id) : id))
        : remapConfig(item, remap);
  if (Array.isArray(config)) return config.map((v) => remapConfig(v, remap));
  if (!config || typeof config !== 'object') return config;
  return Object.fromEntries(
    Object.entries(config).map(([key, item]) => [
      key,
      channelKey.test(key)
        ? swap(remap.channels, item)
        : roleKey.test(key)
          ? swap(remap.roles, item)
          : skipKey(key)
            ? item
            : remapConfig(item, remap),
    ]),
  );
}

export const isProtectedFeature = (featureId: string) =>
  (protectedFeatureIds as readonly string[]).includes(featureId);

export type ConfigChange = {
  featureId: string;
  expectedRevision: number;
  before: unknown;
  proposed: unknown;
  changed: boolean;
  /** References the target server does not have, after remapping. */
  missing: { channels: ResourceRef[]; roles: ResourceRef[] };
};
/**
 * What writing `desired` over `current` would change, after remapping. Never
 * writes. Protected and unknown modules are left out by the caller.
 */
export function compareConfigs(
  current: ConfigRow[],
  desired: ConfigRow[],
  featureIds: string[],
  remap: ResourceRemap,
  known: { channels: Set<string>; roles: Set<string> },
): ConfigChange[] {
  return featureIds.map((featureId) => {
    const before = current.find((r) => r.featureId === featureId),
      wanted = desired.find((r) => r.featureId === featureId),
      proposed =
        wanted === undefined ? null : remapConfig(wanted.config, remap),
      refs = configReferences(proposed);
    return {
      featureId,
      expectedRevision: before?.revision ?? 0,
      before: before?.config ?? null,
      proposed,
      changed: hash(before?.config ?? null) !== hash(proposed),
      missing: {
        channels: refs.channels.filter((r) => !known.channels.has(r.id)),
        roles: refs.roles.filter((r) => !known.roles.has(r.id)),
      },
    };
  });
}

/**
 * Writes several module settings in the caller's transaction. Every revision
 * is checked before anything is written, so a conflict changes nothing.
 */
export async function writeConfigs(
  ctx: DomainContext,
  rows: { featureId: string; expectedRevision: number; config: unknown }[],
) {
  const existing = await ctx.tx.featureConfig.findMany({
    where: {
      guildId: ctx.guildId,
      featureId: { in: rows.map((r) => r.featureId) },
    },
  });
  const conflicts = rows
    .map((r) => ({
      featureId: r.featureId,
      expectedRevision: r.expectedRevision,
      currentRevision:
        existing.find((e) => e.featureId === r.featureId)?.revision ?? 0,
    }))
    .filter((c) => c.currentRevision !== c.expectedRevision);
  if (conflicts.length)
    throw new DomainError(
      'REVISION_CONFLICT',
      'Some settings changed since the preview. Preview again.',
      409,
      { conflicts },
    );
  const saved = [];
  for (const row of rows) {
    const where = {
      guildId_featureId: { guildId: ctx.guildId, featureId: row.featureId },
    };
    const config = json(row.config);
    const result = await ctx.tx.featureConfig.upsert({
      where,
      create: {
        guildId: ctx.guildId,
        featureId: row.featureId,
        revision: 1,
        config,
      },
      update: { revision: { increment: 1 }, config },
    });
    await ctx.effect('config.apply', {
      featureId: row.featureId,
      revision: result.revision,
    });
    saved.push({ featureId: row.featureId, revision: result.revision });
  }
  return saved;
}
