import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError, Snowflake } from '@sparko/contracts';
import { guildCapabilities, requireCapability } from '@sparko/policy';
import { Platform } from '@sparko/domain';
import { json, type PrismaClient } from '@sparko/db';
import type { Config } from '@sparko/config';
import { requireActiveSession, type Auth } from './auth.js';
import type { DiscordAdapter } from './discord.js';
import { accountMutation } from './account.js';

const globalCapabilities = [
  'fleet.read',
  'support.read',
  'support.reply',
  'entitlements.manage',
  'maintenance.manage',
  'diagnostics.read',
] as const;
const guildGrantable = [
  ...guildCapabilities,
  'forms.manage',
  'forms.review',
  'moderation.read',
  'reports.review',
  'appeals.review',
];
const expiresAt = z.iso
  .datetime()
  .refine(
    (value) =>
      Date.parse(value) > Date.now() &&
      Date.parse(value) <= Date.now() + 90 * 86400000,
    'Choose a future expiry within 90 days.',
  );
function key(req: FastifyRequest) {
  const value = req.headers['idempotency-key'];
  return typeof value === 'string' ? value : '';
}

export function registerGrantRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  platform: Platform,
  auth: Auth,
  config: Config,
  discord: DiscordAdapter,
) {
  async function bootstrap(req: FastifyRequest) {
    const session = await auth.session(req);
    if (
      !config.OWNER_USER_IDS.split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .includes(session.userId)
    )
      throw new DomainError(
        'FORBIDDEN',
        'Only a configured bootstrap owner can manage operator grants.',
        403,
      );
    return session;
  }
  app.get('/api/v1/owner/grants', async (req) => {
    await bootstrap(req);
    return {
      data: await db.globalGrant.findMany({
        take: 100,
        orderBy: { userId: 'asc' },
      }),
    };
  });
  app.put('/api/v1/owner/grants/:userId', async (req) => {
    await auth.csrf(req);
    const actor = await bootstrap(req),
      p = z.object({ userId: Snowflake }).parse(req.params);
    const body = z
      .object({
        capabilities: z
          .array(z.enum(globalCapabilities))
          .max(globalCapabilities.length),
        expiresAt,
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(req.body);
    if (
      config.OWNER_USER_IDS.split(',')
        .map((id) => id.trim())
        .includes(p.userId)
    )
      throw new DomainError(
        'INVALID_INPUT',
        'Bootstrap owner access is managed through operator configuration.',
      );
    return accountMutation(
      db,
      actor.userId,
      `owner.grants:${p.userId}`,
      key(req),
      body,
      async (tx) => {
        const saved = await tx.globalGrant.upsert({
          where: { userId: p.userId },
          create: {
            userId: p.userId,
            capabilities: [...new Set(body.capabilities)],
            expiresAt: new Date(body.expiresAt),
          },
          update: {
            capabilities: [...new Set(body.capabilities)],
            expiresAt: new Date(body.expiresAt),
          },
        });
        await tx.accountRequest.create({
          data: {
            userId: actor.userId,
            kind: 'owner.audit',
            state: 'committed',
            data: json({
              action: 'global.grant',
              subjectId: p.userId,
              capabilities: saved.capabilities,
              expiresAt: saved.expiresAt,
              reason: body.reason,
            }),
          },
        });
        return saved;
      },
      actor.id,
    );
  });
  app.delete('/api/v1/owner/grants/:userId', async (req) => {
    await auth.csrf(req);
    const actor = await bootstrap(req),
      p = z.object({ userId: Snowflake }).parse(req.params),
      body = z
        .object({ reason: z.string().trim().min(3).max(1000) })
        .parse(req.body);
    return accountMutation(
      db,
      actor.userId,
      `owner.grants.revoke:${p.userId}`,
      key(req),
      body,
      async (tx) => {
        await tx.globalGrant.deleteMany({ where: { userId: p.userId } });
        await tx.accountRequest.create({
          data: {
            userId: actor.userId,
            kind: 'owner.audit',
            state: 'committed',
            data: json({
              action: 'global.grant.revoke',
              subjectId: p.userId,
              reason: body.reason,
            }),
          },
        });
        return { userId: p.userId, revoked: true };
      },
      actor.id,
    );
  });
  app.get('/api/v1/guilds/:guildId/access', async (req) => {
    const p = z.object({ guildId: Snowflake }).parse(req.params);
    await auth.actor(req, p.guildId, 'access.manage');
    return {
      data: await db.accessGrant.findMany({
        where: { guildId: p.guildId },
        orderBy: { id: 'asc' },
        take: 100,
      }),
    };
  });
  app.put('/api/v1/guilds/:guildId/access', async (req) => {
    const s = await auth.csrf(req);
    const p = z.object({ guildId: Snowflake }).parse(req.params),
      actor = await auth.actor(req, p.guildId, 'access.manage');
    const body = z
      .object({
        subjectType: z.enum(['user', 'role']),
        subjectId: Snowflake,
        capabilities: z
          .array(
            z
              .string()
              .refine(
                (value) => guildGrantable.includes(value),
                'Choose a guild capability.',
              ),
          )
          .max(30),
        expiresAt,
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(req.body);
    // Delegation cannot add authority the manager does not currently hold.
    for (const capability of body.capabilities)
      requireCapability(actor, p.guildId, capability);
    if (body.subjectType === 'user')
      await discord.member(p.guildId, body.subjectId);
    else if (
      !(await discord.roles(p.guildId)).some(
        (role) => role.id === body.subjectId,
      )
    )
      throw new DomainError('INVALID_INPUT', 'Choose a role in this server.');
    return platform.mutate(
      actor,
      'access.grant',
      key(req),
      body,
      async (ctx) => {
        await requireActiveSession(ctx.tx, s.id, actor.userId);
        return ctx.tx.accessGrant.upsert({
          where: {
            guildId_subjectType_subjectId: {
              guildId: p.guildId,
              subjectType: body.subjectType,
              subjectId: body.subjectId,
            },
          },
          create: {
            guildId: p.guildId,
            subjectType: body.subjectType,
            subjectId: body.subjectId,
            capabilities: [...new Set(body.capabilities)],
            expiresAt: new Date(body.expiresAt),
          },
          update: {
            capabilities: [...new Set(body.capabilities)],
            expiresAt: new Date(body.expiresAt),
          },
        });
      },
    );
  });
  app.delete('/api/v1/guilds/:guildId/access/:id', async (req) => {
    const s = await auth.csrf(req),
      p = z.object({ guildId: Snowflake, id: z.string() }).parse(req.params),
      actor = await auth.actor(req, p.guildId, 'access.manage'),
      body = z
        .object({ reason: z.string().trim().min(3).max(1000) })
        .parse(req.body);
    return platform.mutate(
      actor,
      'access.revoke',
      key(req),
      { ...p, ...body },
      async (ctx) => {
        await requireActiveSession(ctx.tx, s.id, actor.userId);
        const result = await ctx.tx.accessGrant.deleteMany({
          where: { id: p.id, guildId: p.guildId },
        });
        if (result.count !== 1)
          throw new DomainError('NOT_FOUND', 'Access grant unavailable.', 404);
        return { id: p.id, revoked: true };
      },
    );
  });
}
