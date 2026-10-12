import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@sparko/db';
import { DomainError, type Actor } from '@sparko/contracts';
import {
  BackupCreateSchema,
  BackupFileSchema,
  BackupPreviewSchema,
  BackupRestoreSchema,
  RolloutApplySchema,
  type BackupFile,
  type ResourceRemap,
} from '@sparko/contracts/providers';
import {
  compareConfigs,
  configReferences,
  createRecord,
  getRecord,
  hash,
  isProtectedFeature,
  jsonObject,
  multiServerPlan,
  remapConfig,
  writeConfigs,
  type ConfigRow,
  type Platform,
} from '@sparko/domain';
import type { createAuth } from './auth.js';
import type { DiscordAdapter } from './discord.js';

/** Stored backups per server; older ones must be deleted to make room. */
export const BACKUP_LIMIT = 25;
type FieldError = { path: string; message: string };
const Params = z.object({ guildId: z.string() }),
  BackupParams = Params.extend({ id: z.string().uuid() });

/**
 * Configuration backups (R50) and opt-in multi-server rollout (R61). Both
 * only ever write module settings through `writeConfigs`, under the revisions
 * the person previewed, after the same schema and Discord reference checks as
 * the settings editor. Protected modules are never copied or restored.
 */
export function registerConfigToolRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  platform: Platform,
  auth: ReturnType<typeof createAuth>,
  discord: DiscordAdapter,
  schemas: Record<string, z.ZodType>,
) {
  const key = (req: FastifyRequest) => {
    const value = req.headers['idempotency-key'];
    return typeof value === 'string' ? value : '';
  };
  const resources = async (guildId: string) => {
    const [channels, roles] = await Promise.all([
      discord.channels(guildId),
      discord.roles(guildId),
    ]);
    return {
      channels: new Set(channels.map((c) => c.id)),
      categories: new Set(
        channels.filter((c) => c.type === 4).map((c) => c.id),
      ),
      roles: new Set(roles.map((r) => r.id)),
    };
  };
  const configs = async (guildId: string): Promise<ConfigRow[]> =>
    (await db.featureConfig.findMany({ where: { guildId } })).map((r) => ({
      featureId: r.featureId,
      revision: r.revision,
      config: r.config,
    }));
  /** Schema-checks one module's settings, naming each problem by module. */
  function validate(featureId: string, config: unknown, errors: FieldError[]) {
    const schema = schemas[featureId];
    if (!schema || isProtectedFeature(featureId)) {
      errors.push({
        path: featureId,
        message: 'This module cannot be restored from a backup.',
      });
      return null;
    }
    const parsed = schema.safeParse(config);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues)
      errors.push({
        path: [featureId, ...issue.path.map(String)].join('.'),
        message: issue.message,
      });
    return null;
  }
  function missingErrors(
    featureId: string,
    missing: { channels: { path: string }[]; roles: { path: string }[] },
  ): FieldError[] {
    return [
      ...missing.channels.map((r) => ({
        path: `${featureId}.${r.path}`,
        message: 'Choose a channel in this server for this setting.',
      })),
      ...missing.roles.map((r) => ({
        path: `${featureId}.${r.path}`,
        message: 'Choose a role in this server for this setting.',
      })),
    ];
  }
  const invalid = (fieldErrors: FieldError[]) =>
    new DomainError(
      'INVALID_INPUT',
      'Some settings cannot be applied to this server.',
      400,
      { fieldErrors },
    );
  /**
   * Turns proposed settings into rows to write: validates every module,
   * requires every channel and role to exist in the server now, and pairs
   * each with the revision the person previewed.
   */
  async function prepare(
    guildId: string,
    proposals: { featureId: string; config: unknown }[],
    expectedRevisions: Record<string, number>,
  ) {
    const errors: FieldError[] = [],
      known = await resources(guildId);
    const rows = proposals.map(({ featureId, config }) => {
      const parsed = validate(featureId, config, errors);
      const refs = configReferences(parsed);
      errors.push(
        ...missingErrors(featureId, {
          channels: refs.channels.filter((r) => !known.channels.has(r.id)),
          roles: refs.roles.filter((r) => !known.roles.has(r.id)),
        }),
      );
      // The same rule as the ticket settings editor: the parent must be a category.
      const category = jsonObject(parsed)['categoryChannelId'];
      if (
        featureId === 'tickets' &&
        typeof category === 'string' &&
        known.channels.has(category) &&
        !known.categories.has(category)
      )
        errors.push({
          path: 'tickets.categoryChannelId',
          message: 'Choose a Discord category the bot can see.',
        });
      const expectedRevision = expectedRevisions[featureId];
      if (expectedRevision === undefined)
        errors.push({
          path: featureId,
          message: 'Preview again before applying this module.',
        });
      return {
        featureId,
        expectedRevision: expectedRevision ?? 0,
        config: parsed,
      };
    });
    if (errors.length) throw invalid(errors);
    return rows;
  }
  const summary = (row: {
    id: string;
    ownerId: string | null;
    createdAt: Date;
    data: unknown;
  }) => {
    const data = jsonObject(row.data),
      features = Array.isArray(data['features'])
        ? (data['features'] as { featureId: string }[])
        : [];
    return {
      id: row.id,
      label: String(data['label'] ?? ''),
      origin: data['origin'] === 'import' ? 'import' : 'snapshot',
      sourceGuildId: String(data['sourceGuildId'] ?? ''),
      createdBy: row.ownerId,
      createdAt: row.createdAt.toISOString(),
      featureIds: features.map((f) => f.featureId),
    };
  };
  const backupFeatures = (data: unknown) =>
    BackupFileSchema.shape.features.parse(jsonObject(data)['features']);

  app.get('/api/v1/guilds/:guildId/backups', async (req) => {
    const p = Params.parse(req.params);
    await auth.actor(req, p.guildId, 'config.manage');
    const rows = await db.record.findMany({
      where: { guildId: p.guildId, kind: 'config.backup' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: { backups: rows.map(summary), limit: BACKUP_LIMIT },
    };
  });
  async function store(
    req: FastifyRequest,
    guildId: string,
    scope: string,
    body: unknown,
    build: (features: ConfigRow[]) => Omit<
      BackupFile,
      'createdAt' | 'format' | 'version'
    > & {
      origin: 'snapshot' | 'import';
    },
  ) {
    await auth.csrf(req);
    const actor = await auth.actor(req, guildId, 'config.manage');
    return platform.mutate(actor, scope, key(req), body, async (ctx) => {
      const count = await ctx.tx.record.count({
        where: { guildId, kind: 'config.backup' },
      });
      if (count >= BACKUP_LIMIT)
        throw new DomainError(
          'PLAN_LIMIT',
          `This server keeps ${BACKUP_LIMIT} backups. Delete an older one first.`,
          409,
        );
      const rows = (
        await ctx.tx.featureConfig.findMany({ where: { guildId } })
      ).map((r) => ({
        featureId: r.featureId,
        revision: r.revision,
        config: r.config,
      }));
      const record = await createRecord(ctx, 'config.backup', build(rows));
      return summary(record);
    });
  }
  app.post('/api/v1/guilds/:guildId/backups', async (req) => {
    const p = Params.parse(req.params),
      body = BackupCreateSchema.parse(req.body);
    return store(req, p.guildId, 'backup.create', body, (rows) => ({
      label: body.label,
      origin: 'snapshot',
      guildId: p.guildId,
      sourceGuildId: p.guildId,
      features: rows.filter(
        (r) => schemas[r.featureId] && !isProtectedFeature(r.featureId),
      ),
    }));
  });
  app.post('/api/v1/guilds/:guildId/backups/import', async (req) => {
    const p = Params.parse(req.params),
      file = BackupFileSchema.parse(req.body),
      errors: FieldError[] = [];
    // A file may come from any server; nothing in it is trusted until it
    // passes the same schemas as the settings editor.
    const features = file.features
      .filter((f) => !isProtectedFeature(f.featureId))
      .map((f) => ({
        featureId: f.featureId,
        revision: f.revision,
        config: validate(f.featureId, f.config, errors),
      }));
    if (new Set(features.map((f) => f.featureId)).size !== features.length)
      errors.push({ path: 'features', message: 'A module appears twice.' });
    if (errors.length) throw invalid(errors);
    return store(req, p.guildId, 'backup.import', file, () => ({
      label: file.label,
      origin: 'import',
      guildId: p.guildId,
      sourceGuildId: file.guildId,
      features,
    }));
  });
  app.get('/api/v1/guilds/:guildId/backups/:id', async (req) => {
    const p = BackupParams.parse(req.params),
      actor = await auth.actor(req, p.guildId, 'config.manage');
    const row = await platform.read(actor, (ctx) =>
      getRecord(ctx, 'config.backup', p.id),
    );
    const data = jsonObject(row.data);
    const file: BackupFile = {
      format: 'sparko.config-backup',
      version: 1,
      guildId: String(data['sourceGuildId']),
      label: String(data['label']),
      createdAt: row.createdAt.toISOString(),
      features: backupFeatures(row.data),
    };
    return { data: file };
  });
  app.post('/api/v1/guilds/:guildId/backups/:id/preview', async (req) => {
    await auth.csrf(req);
    const p = BackupParams.parse(req.params),
      body = BackupPreviewSchema.parse(req.body ?? {}),
      actor = await auth.actor(req, p.guildId, 'config.manage');
    const row = await platform.read(actor, (ctx) =>
      getRecord(ctx, 'config.backup', p.id),
    );
    const features = backupFeatures(row.data).filter(
      (f) => schemas[f.featureId] && !isProtectedFeature(f.featureId),
    );
    const changes = compareConfigs(
      await configs(p.guildId),
      features,
      features.map((f) => f.featureId),
      body.remap,
      await resources(p.guildId),
    );
    return {
      data: {
        backupId: row.id,
        changes: changes.map((change) => {
          const errors: FieldError[] = [];
          validate(change.featureId, change.proposed, errors);
          return { ...change, issues: errors };
        }),
      },
    };
  });
  app.post('/api/v1/guilds/:guildId/backups/:id/restore', async (req) => {
    await auth.csrf(req);
    const p = BackupParams.parse(req.params),
      body = BackupRestoreSchema.parse(req.body),
      actor = await auth.actor(req, p.guildId, 'config.manage');
    const row = await platform.read(actor, (ctx) =>
      getRecord(ctx, 'config.backup', p.id),
    );
    const features = backupFeatures(row.data);
    const missing = body.featureIds.filter(
      (id) => !features.some((f) => f.featureId === id),
    );
    if (missing.length)
      throw invalid(
        missing.map((id) => ({
          path: id,
          message: 'This backup has no settings for this module.',
        })),
      );
    const rows = await prepare(
      p.guildId,
      body.featureIds.map((featureId) => ({
        featureId,
        config: remapConfig(
          features.find((f) => f.featureId === featureId)!.config,
          body.remap,
        ),
      })),
      body.expectedRevisions,
    );
    return platform.mutate(
      actor,
      'backup.restore',
      key(req),
      { backupId: p.id, ...body },
      async (ctx) => {
        await getRecord(ctx, 'config.backup', p.id);
        return { backupId: p.id, restored: await writeConfigs(ctx, rows) };
      },
    );
  });
  app.post('/api/v1/guilds/:guildId/backups/:id/delete', async (req) => {
    await auth.csrf(req);
    const p = BackupParams.parse(req.params),
      actor = await auth.actor(req, p.guildId, 'config.manage');
    return platform.mutate(
      actor,
      'backup.delete',
      key(req),
      { id: p.id },
      async (ctx) => {
        const row = await getRecord(ctx, 'config.backup', p.id);
        await ctx.tx.record.delete({ where: { id: row.id } });
        return { id: row.id, deleted: true };
      },
    );
  });

  /**
   * Each server is authorized afresh, must be entitled to multi-server tools
   * and must opt in; the source's settings are never read before that.
   */
  async function plan(req: FastifyRequest, input: unknown) {
    const actors = new Map<string, Actor>();
    const result = await multiServerPlan(
      input,
      async (guildId) => {
        const actor = await auth.actor(req, guildId, 'config.manage');
        await platform
          .read(actor, (ctx) => ctx.requireFeature('R61'))
          .catch((error: unknown) => {
            // Name the server so the person knows which one to fix.
            if (error instanceof DomainError)
              error.details = { ...error.details, guildId };
            throw error;
          });
        actors.set(guildId, actor);
        return actor;
      },
      (actor) => configs(actor.guildId),
      resources,
    );
    return { result, actors };
  }
  app.post('/api/v1/multi-server/preview', async (req) => {
    await auth.csrf(req);
    return { data: (await plan(req, req.body)).result };
  });
  app.post('/api/v1/multi-server/rollout', async (req) => {
    await auth.csrf(req);
    const body = RolloutApplySchema.parse(req.body),
      remaps: Record<string, ResourceRemap> = Object.fromEntries(
        body.targets.map((t) => [t.guildId, t.remap]),
      );
    const { result, actors } = await plan(req, {
      sourceGuildId: body.sourceGuildId,
      targetGuildIds: body.targets.map((t) => t.guildId),
      featureIds: body.featureIds,
      remaps,
    });
    const results = [];
    // Servers are written one at a time, each atomically on its own; one
    // server failing never stops or undoes another.
    for (const target of result.targets) {
      const request = body.targets.find((t) => t.guildId === target.guildId)!;
      if (!target.rolloutAllowed) {
        results.push({
          guildId: target.guildId,
          status: 'not-allowed' as const,
          message: 'This server allows comparison but not rollout.',
        });
        continue;
      }
      const changed = target.changes.filter((c) => c.changed);
      if (!changed.length) {
        results.push({ guildId: target.guildId, status: 'unchanged' as const });
        continue;
      }
      try {
        const rows = await prepare(
          target.guildId,
          changed.map((c) => ({ featureId: c.featureId, config: c.proposed })),
          request.expectedRevisions,
        );
        const outcome = await platform.mutate(
          actors.get(target.guildId)!,
          'multi-server.rollout',
          `${key(req)}:${target.guildId}`,
          {
            sourceGuildId: body.sourceGuildId,
            rows: rows.map((r) => ({
              featureId: r.featureId,
              expectedRevision: r.expectedRevision,
              config: hash(r.config),
            })),
          },
          (ctx) => writeConfigs(ctx, rows),
        );
        results.push({
          guildId: target.guildId,
          status: 'applied' as const,
          saved: outcome.data,
        });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        results.push({
          guildId: target.guildId,
          status:
            error.code === 'REVISION_CONFLICT'
              ? ('conflict' as const)
              : error.code === 'INVALID_INPUT'
                ? ('needs-changes' as const)
                : ('failed' as const),
          message: error.message,
          details: error.details,
        });
      }
    }
    return {
      data: {
        sourceGuildId: body.sourceGuildId,
        excludedFeatures: result.excludedFeatures,
        results,
      },
    };
  });
}
