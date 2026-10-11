import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import { z } from 'zod';
import {
  Platform,
  ticketRoutes,
  publicationRoutes,
  jsonObject,
  communityRoutes,
  communityConfigSchemas,
  safetyRoutes,
  safetyConfigSchemas,
  automationRoutes,
  automationConfigSchemas,
  economyRoutes,
  economyConfigSchemas,
  providerRoutes,
  providerConfigSchemas,
  multiServerPlan,
  publicWidget,
  rankCardInput,
  type ProviderTransport,
  type DomainRoute,
} from '@sparko/domain';
import { json, type PrismaClient } from '@sparko/db';
import {
  DomainError,
  TicketConfigSchema,
  commandRegistry,
  type Actor,
} from '@sparko/contracts';
import {
  requireGlobal,
  guildCapabilities,
  allowed,
  isPrivilegedRole,
} from '@sparko/policy';
import type { Config } from '@sparko/config';
import { createAuth, requireActiveSession } from './auth.js';
import { registerAccountRoutes } from './account.js';
import { registerProviderCallbacks } from './providers.js';
import { registerGrantRoutes } from './grants.js';
import {
  validatePublicationResources,
  validateTemplateResources,
} from './publication-resources.js';
import { registerAssetRoutes } from './assets.js';
import { discordAdapter, type DiscordAdapter } from './discord.js';
import { renderRankCard } from '@sparko/rendering';
const presets = [
  'small-community',
  'gaming',
  'support',
  'creator',
  'study',
  'custom',
];
export async function createApp(options: {
  db: PrismaClient;
  config: Config;
  discord?: DiscordAdapter;
  routes?: DomainRoute[];
  configSchemas?: Record<string, z.ZodType>;
  providerEnv?: Record<string, string | undefined>;
  providerTransport?: ProviderTransport;
}) {
  const { db, config } = options,
    discord =
      options.discord ??
      discordAdapter(
        config.DISCORD_CLIENT_ID,
        config.DISCORD_CLIENT_SECRET,
        config.DISCORD_REDIRECT_URI,
        config.DISCORD_BOT_TOKEN,
      ),
    platform = new Platform(db),
    auth = createAuth(db, config, discord);
  const app = Fastify({
    logger: {
      serializers: {
        req: (req: {
          method: string;
          url: string;
          hostname?: string;
          ip?: string;
        }) => ({
          method: req.method,
          url: req.url.split('?')[0] ?? '/',
          host: req.hostname ?? '',
          remoteAddress: req.ip ?? '',
        }),
      },
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers.set-cookie',
      ],
    },
    trustProxy: config.TRUST_PROXY === 'true',
    bodyLimit: 1048576,
    requestTimeout: 15000,
  });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: config.API_RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
  });
  await app.register(websocket, { options: { maxPayload: 8192 } });
  await app.register(swagger, {
    openapi: { info: { title: 'Sparko API', version: '1.0.0' } },
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof DomainError)
      return reply.status(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          ...error.details,
          retryable: error.status === 503,
        },
        requestId: req.id,
      });
    if (error instanceof z.ZodError)
      return reply.status(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: 'Check the highlighted fields.',
          fieldErrors: error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
          retryable: false,
        },
        requestId: req.id,
      });
    const status =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    if (typeof status === 'number' && [400, 413, 415, 429].includes(status))
      return reply.status(status).send({
        error: {
          code: status === 429 ? 'RATE_LIMITED' : 'INVALID_INPUT',
          message:
            status === 429
              ? 'Too many requests. Try again shortly.'
              : status === 413
                ? 'This request exceeds the supported size.'
                : status === 415
                  ? 'Use the supported request content type.'
                  : 'This request could not be read.',
          retryable: status === 429,
        },
        requestId: req.id,
      });
    req.log.error({ err: error }, 'Request failed');
    return reply.status(503).send({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is unavailable. Retry with the same request key.',
        retryable: true,
      },
      requestId: req.id,
    });
  });
  app.addHook('onSend', async (req, reply) => {
    if (!req.url.startsWith('/api/v1/public/'))
      reply.header('cache-control', 'no-store');
    reply.header('x-request-id', req.id);
  });
  await auth.register(app);
  const schemas: Record<string, z.ZodType> = {
    tickets: TicketConfigSchema,
    ...communityConfigSchemas,
    ...safetyConfigSchemas,
    ...automationConfigSchemas,
    ...economyConfigSchemas,
    ...providerConfigSchemas,
    ...options.configSchemas,
  };
  function key(req: { headers: Record<string, unknown> }) {
    const value = req.headers['idempotency-key'];
    return typeof value === 'string' ? value : '';
  }
  async function globalActor(
    req: Parameters<typeof auth.session>[0],
    capability: string,
  ) {
    const s = await auth.session(req),
      a: Actor = {
        userId: s.userId,
        sessionId: s.id,
        guildId: '',
        roles: [],
        isAdmin: false,
        isOwner: false,
        capabilities: [],
        globalCapabilities: await auth.globalCapabilities(s.userId),
      };
    requireGlobal(a, capability);
    return a;
  }
  app.get('/health/live', async () => ({
    status: 'alive',
    version: config.APP_VERSION,
  }));
  app.get('/health/ready', async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/v1/openapi', async () => app.swagger());
  app.get('/api/v1/public/config', async () => ({
    data: {
      installUrl: config.DISCORD_CLIENT_ID
        ? 'https://discord.com/oauth2/authorize?' +
          new URLSearchParams({
            client_id: config.DISCORD_CLIENT_ID,
            scope: 'bot applications.commands',
            permissions: '268438544',
            integration_type: '0',
          }).toString()
        : null,
    },
  }));
  app.get('/api/v1/public/status', async () => {
    const rows = await db.heartbeat.findMany();
    return {
      data: {
        status: ['api', 'bot', 'worker'].every((name) => {
          const r = rows.find((row) => row.service === name);
          return (
            r &&
            r.updatedAt > new Date(Date.now() - 60000) &&
            ['online', 'connected'].includes(r.status)
          );
        })
          ? 'operational'
          : 'degraded',
        checkedAt: new Date().toISOString(),
        services: ['api', 'bot', 'worker'].map((name) => {
          const r = rows.find((r) => r.service === name);
          return {
            name,
            status:
              r && r.updatedAt > new Date(Date.now() - 60000)
                ? r.status
                : 'unavailable',
            lastSeenAt: r?.updatedAt.toISOString() ?? null,
          };
        }),
      },
    };
  });
  app.get('/api/v1/public/commands', async () => ({
    data: { commands: commandRegistry, updatedAt: new Date().toISOString() },
  }));
  app.get('/api/v1/public/features', async () => ({
    data: {
      updatedAt: new Date().toISOString(),
      features: [
        {
          id: 'tickets',
          slug: 'tickets',
          availability: 'free',
          name: 'Private support tickets',
          group: 'Support',
          status: 'implemented locally',
          description:
            'Private channels, forms, staff claims and retained transcripts.',
          permissions: ['Manage Channels'],
          intents: ['Guilds'],
          plan: 'free',
        },
        {
          id: 'messages',
          slug: 'messages',
          availability: 'free',
          name: 'Message Studio',
          group: 'Messages',
          status: 'implemented locally',
          description: 'Validated Components V2 and separate embeds.',
          permissions: ['Send Messages', 'Embed Links'],
          intents: ['Guilds'],
          plan: 'free',
        },
      ],
    },
  }));
  app.get('/api/v1/guilds/:guildId/resources/channels', async (req) => {
    const { guildId } = z.object({ guildId: z.string() }).parse(req.params);
    const actor = await auth.actor(req, guildId);
    if (
      ![
        'config.manage',
        'templates.edit',
        'messages.publish',
        'community.manage',
        'automation.manage',
      ].some((capability) => allowed(actor, capability))
    )
      throw new DomainError(
        'FORBIDDEN',
        'You cannot select resources in this server.',
        403,
      );
    return { data: await discord.channels(guildId) };
  });
  app.get('/api/v1/guilds/:guildId/resources/roles', async (req) => {
    const { guildId } = z.object({ guildId: z.string() }).parse(req.params);
    const actor = await auth.actor(req, guildId);
    if (
      ![
        'config.manage',
        'templates.edit',
        'messages.publish',
        'community.manage',
        'automation.manage',
      ].some((capability) => allowed(actor, capability))
    )
      throw new DomainError(
        'FORBIDDEN',
        'You cannot select resources in this server.',
        403,
      );
    const roles = await discord.roles(guildId);
    // Hierarchy and privilege are computed here so every role picker can
    // explain why a role cannot be granted, using the shared policy.
    const botRoles = await (
      discord.botUser
        ? discord.botUser().then((user) => user.id)
        : Promise.resolve(config.DISCORD_CLIENT_ID)
    )
      .then((id) => (id ? discord.member(guildId, id) : null))
      .then((member) => member?.roles ?? null)
      .catch(() => null);
    const highest =
      botRoles === null
        ? null
        : Math.max(
            0,
            ...roles
              .filter((role) => botRoles.includes(role.id))
              .map((role) => role.position),
          );
    return {
      data: roles.map((role) => {
        const privileged = isPrivilegedRole(role.permissions);
        return {
          ...role,
          privileged,
          ...(highest === null
            ? {}
            : {
                assignable:
                  !role.managed &&
                  role.id !== guildId &&
                  !privileged &&
                  role.position < highest,
              }),
        };
      }),
    };
  });
  app.get('/api/v1/guilds/:guildId/resources/emojis', async (req) => {
    const { guildId } = z.object({ guildId: z.string() }).parse(req.params),
      actor = await auth.actor(req, guildId);
    if (
      ![
        'config.manage',
        'templates.edit',
        'messages.publish',
        'community.manage',
        'automation.manage',
      ].some((capability) => allowed(actor, capability))
    )
      throw new DomainError(
        'FORBIDDEN',
        'You cannot select resources in this server.',
        403,
      );
    const botId = discord.botUser
        ? (await discord.botUser()).id
        : config.DISCORD_CLIENT_ID,
      [emojis, bot] = await Promise.all([
        discord.emojis(guildId),
        discord.member(guildId, botId),
      ]);
    return {
      data: emojis.map((emoji) => ({
        ...emoji,
        available:
          emoji.available &&
          (!emoji.roles.length ||
            emoji.roles.some((id) => id === guildId || bot.roles.includes(id))),
      })),
    };
  });
  app.get('/api/v1/guilds/:guildId/overview', async (req) => {
    const { guildId } = z.object({ guildId: z.string() }).parse(req.params),
      actor = await auth.actor(req, guildId),
      guild = await db.guild.findUnique({ where: { id: guildId } });
    if (!guild)
      throw new DomainError(
        'NOT_FOUND',
        'Install Sparko in this server first.',
        404,
      );
    const [configs, heartbeat, activity, operations] = await Promise.all([
      db.featureConfig.findMany({ where: { guildId } }),
      db.heartbeat.findUnique({ where: { service: 'bot' } }),
      allowed(actor, 'analytics.read')
        ? db.auditLog.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
      db.operation.findMany({
        where: { guildId, actorId: actor.userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      data: {
        guild: {
          id: guild.id,
          name: guild.name,
          installed: guild.installed,
          manageable: actor.isAdmin || actor.capabilities.length > 0,
          capabilities: actor.isAdmin
            ? [...guildCapabilities]
            : actor.capabilities,
        },
        bot: {
          online: Boolean(
            heartbeat &&
            heartbeat.updatedAt > new Date(Date.now() - 60000) &&
            ['online', 'connected'].includes(heartbeat.status),
          ),
          lastSeenAt: heartbeat?.updatedAt.toISOString() ?? null,
          permissions: [],
          issues: guild.installed ? [] : ['Sparko is not installed.'],
        },
        modules: configs.map((c) => ({
          id: c.featureId,
          name: c.featureId,
          enabled: jsonObject(c.config)['enabled'] === true,
          revision: c.revision,
          appliedRevision: c.appliedRevision,
          status: c.appliedRevision === c.revision ? 'applied' : 'pending',
        })),
        metrics: [
          {
            id: 'members',
            label: 'Observed members',
            value: guild.memberCount,
            coverage: guild.observedAt ? 'observed' : 'not collected',
            period: 'latest observation',
          },
        ],
        activity: activity.map((a) => ({
          id: a.id,
          action: a.action,
          actor: a.actorId,
          createdAt: a.createdAt,
        })),
        operations: operations.map((o) => ({
          id: o.id,
          kind: o.scope,
          deliveryStatus: o.deliveryStatus,
          createdAt: o.createdAt,
        })),
      },
    };
  });
  app.get('/api/v1/guilds/:guildId/features/:featureId/config', async (req) => {
    const p = z
      .object({ guildId: z.string(), featureId: z.string() })
      .parse(req.params);
    await auth.actor(req, p.guildId, 'config.manage');
    const schema = schemas[p.featureId];
    if (!schema)
      throw new DomainError('NOT_FOUND', 'This feature is not available.', 404);
    const saved = await db.featureConfig.findUnique({
      where: { guildId_featureId: p },
    });
    const defaults = schema.safeParse({ enabled: false });
    const savedValidation = saved ? schema.safeParse(saved.config) : null;
    return {
      data: saved
        ? {
            ...saved,
            setupState: savedValidation?.success
              ? 'configured'
              : 'unconfigured',
            missingPrerequisites:
              savedValidation && !savedValidation.success
                ? savedValidation.error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                  }))
                : [],
          }
        : {
            featureId: p.featureId,
            revision: 0,
            appliedRevision: 0,
            config: defaults.success ? defaults.data : { enabled: false },
            setupState: 'unconfigured',
            missingPrerequisites: defaults.success
              ? []
              : defaults.error.issues.map((issue) => ({
                  path: issue.path.join('.'),
                  message: issue.message,
                })),
          },
    };
  });
  app.put('/api/v1/guilds/:guildId/features/:featureId/config', async (req) => {
    const mutationSession = await auth.csrf(req);
    const p = z
        .object({ guildId: z.string(), featureId: z.string() })
        .parse(req.params),
      actor = await auth.actor(req, p.guildId, 'config.manage'),
      schema = schemas[p.featureId];
    if (!schema)
      throw new DomainError('NOT_FOUND', 'This feature is not available.', 404);
    const body = z
        .object({
          expectedRevision: z.number().int().min(0),
          config: z.unknown(),
        })
        .parse(req.body),
      cfg = schema.parse(body.config);
    if (p.featureId === 'tickets') {
      const tc = TicketConfigSchema.parse(cfg),
        roles = await discord.roles(p.guildId),
        channels = await discord.channels(p.guildId);
      const fieldErrors: { path: string; message: string }[] = [];
      if (tc.staffRoleIds.some((id) => !roles.some((r) => r.id === id)))
        fieldErrors.push({
          path: 'staffRoleIds',
          message: 'A selected staff role no longer exists. Reselect roles.',
        });
      if (
        tc.categoryChannelId &&
        !channels.some((c) => c.id === tc.categoryChannelId && c.type === 4)
      )
        fieldErrors.push({
          path: 'categoryChannelId',
          message: 'Choose a Discord category the bot can see.',
        });
      if (fieldErrors.length)
        throw new DomainError(
          'INVALID_INPUT',
          'A selected channel or role is unavailable.',
          400,
          { fieldErrors },
        );
    }
    return platform.mutate(
      actor,
      'config:' + p.featureId,
      key(req),
      body,
      async (ctx) => {
        await requireActiveSession(ctx.tx, mutationSession.id, actor.userId);
        const existing = await ctx.tx.featureConfig.findUnique({
          where: { guildId_featureId: p },
        });
        if ((existing?.revision ?? 0) !== body.expectedRevision)
          throw new DomainError(
            'REVISION_CONFLICT',
            'These settings changed since you opened them.',
            409,
            { currentRevision: existing?.revision ?? 0 },
          );
        const saved = await ctx.tx.featureConfig.upsert({
          where: { guildId_featureId: p },
          create: { ...p, revision: 1, config: json(cfg) },
          update: { revision: { increment: 1 }, config: json(cfg) },
        });
        await ctx.effect('config.apply', {
          featureId: p.featureId,
          revision: saved.revision,
        });
        return saved;
      },
    );
  });
  function setupChanges(preset: string) {
    const goals: Record<string, string[]> = {
      'small-community': ['tickets', 'R09', 'R19', 'R34'],
      gaming: ['R09', 'R10', 'R15', 'R31'],
      support: ['tickets', 'R34', 'R35'],
      creator: ['R09', 'R19', 'R31', 'R34'],
      study: ['R09', 'R33', 'R37'],
      custom: [],
    };
    return (goals[preset] ?? []).map((featureId) => {
      const defaults = schemas[featureId]!.safeParse({ enabled: false });
      return {
        featureId,
        after: defaults.success ? defaults.data : { enabled: false },
      };
    });
  }
  for (const action of ['preview', 'apply'])
    app.post('/api/v1/guilds/:guildId/setup/' + action, async (req) => {
      const mutationSession = await auth.csrf(req);
      const p = z.object({ guildId: z.string() }).parse(req.params),
        a = await auth.actor(req, p.guildId, 'config.manage'),
        b = z
          .object({ preset: z.string().refine((v) => presets.includes(v)) })
          .parse(req.body);
      const changes: Array<{
        featureId: string;
        after: unknown;
        before: unknown;
      }> = [];
      for (const c of setupChanges(b.preset)) {
        const before = await db.featureConfig.findUnique({
          where: {
            guildId_featureId: { guildId: p.guildId, featureId: c.featureId },
          },
        });
        changes.push({
          ...c,
          after: before?.config ?? c.after,
          before: before?.config ?? null,
        });
      }
      if (action === 'preview')
        return {
          data: {
            preset: b.preset,
            changes,
            issues: [],
            blockingIssues: [],
            guidance: [
              'New module drafts remain off until their real channels and roles are configured. Existing settings are preserved.',
            ],
          },
        };
      return platform.mutate(a, 'setup', key(req), b, async (ctx) => {
        await requireActiveSession(ctx.tx, mutationSession.id, a.userId);
        for (const c of changes) {
          const existing = await ctx.tx.featureConfig.findUnique({
            where: {
              guildId_featureId: { guildId: p.guildId, featureId: c.featureId },
            },
          });
          if (existing) continue;
          const saved = await ctx.tx.featureConfig.create({
            data: {
              guildId: p.guildId,
              featureId: c.featureId,
              config: json(c.after),
              revision: 1,
            },
          });
          await ctx.effect('config.apply', {
            featureId: c.featureId,
            revision: saved.revision,
          });
        }
        return { preset: b.preset, changes, issues: [] };
      });
    });
  const routes = new Map<string, DomainRoute>();
  for (const route of [
    ...ticketRoutes,
    ...publicationRoutes,
    ...communityRoutes,
    ...safetyRoutes,
    ...automationRoutes,
    ...economyRoutes,
    ...providerRoutes,
    ...(options.routes ?? []),
  ])
    routes.set(route.method + ' ' + route.path, route);
  for (const route of routes.values())
    app.route({
      method: route.method,
      url: '/api/v1' + route.path,
      handler: async (req) => {
        const mutationSession =
          route.method !== 'GET' ? await auth.csrf(req) : null;
        const params = z.record(z.string(), z.string()).parse(req.params),
          actor = await auth.actor(
            req,
            params['guildId'] ?? '',
            route.capability,
          );
        if (
          route.method === 'POST' &&
          (route.path.endsWith('/templates') ||
            route.path.endsWith('/templates/:id/versions'))
        )
          await validateTemplateResources(
            db,
            actor,
            jsonObject(req.body)['document'],
          );
        if (
          route.method === 'POST' &&
          (route.path.endsWith('/templates/:id/duplicate') ||
            route.path.endsWith('/templates/:id/restore'))
        ) {
          const body = jsonObject(route.schema?.parse(req.body) ?? req.body),
            version = await db.templateVersion.findFirst({
              where: {
                id: String(
                  body[
                    route.path.endsWith('/duplicate')
                      ? 'sourceVersionId'
                      : 'versionId'
                  ],
                ),
                templateId: params['id'] ?? '',
                template: { guildId: actor.guildId, archived: false },
              },
            });
          if (!version)
            throw new DomainError('NOT_FOUND', 'Version unavailable.', 404);
          await validateTemplateResources(db, actor, version.document);
        }
        if (
          route.path.endsWith('/messages/publish') ||
          route.path.endsWith('/messages/test') ||
          route.path.endsWith('/publications/:id/update')
        ) {
          await validatePublicationResources(
            db,
            discord,
            config,
            actor,
            req.body,
            route.path.endsWith('/publications/:id/update')
              ? params['id']
              : undefined,
          );
        }
        return platform.route(
          actor,
          mutationSession
            ? {
                ...route,
                handler: async (ctx, input, p) => {
                  await requireActiveSession(
                    ctx.tx,
                    mutationSession.id,
                    actor.userId,
                  );
                  return route.handler(ctx, input, p);
                },
              }
            : route,
          route.method === 'GET' ? req.query : req.body,
          params,
          key(req),
        );
      },
    });
  app.get('/api/v1/guilds/:guildId/operations/:id', async (req) => {
    const p = z
        .object({ guildId: z.string(), id: z.string() })
        .parse(req.params),
      a = await auth.actor(req, p.guildId);
    const op = await db.operation.findFirst({
      where: {
        id: p.id,
        guildId: p.guildId,
        ...(!a.isAdmin ? { actorId: a.userId } : {}),
      },
    });
    if (!op) throw new DomainError('NOT_FOUND', 'Operation unavailable.', 404);
    return { data: op };
  });
  app.get('/api/v1/guilds/:guildId/audit', async (req) => {
    const p = z.object({ guildId: z.string() }).parse(req.params);
    await auth.actor(req, p.guildId, 'analytics.read');
    return {
      data: await db.auditLog.findMany({
        where: { guildId: p.guildId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  });
  registerAccountRoutes(app, db, auth, globalActor);
  registerGrantRoutes(app, db, platform, auth, config, discord);
  registerAssetRoutes(app, db, config, auth);
  await registerProviderCallbacks(
    app,
    db,
    platform,
    options.providerEnv,
    options.providerTransport,
  );
  app.post('/api/v1/multi-server/preview', async (req) => {
    await auth.csrf(req);
    return {
      data: await multiServerPlan(
        req.body,
        (guildId) => auth.actor(req, guildId, 'config.manage'),
        (actor) =>
          db.featureConfig.findMany({ where: { guildId: actor.guildId } }),
      ),
    };
  });
  // The member's own card, built from server state exactly like Discord `/level`.
  app.get('/api/v1/guilds/:guildId/levels/me/card.png', async (req, reply) => {
    const { guildId } = z.object({ guildId: z.string() }).parse(req.params);
    const actor = await auth.actor(req, guildId, 'member');
    const user = await db.user.findUnique({ where: { id: actor.userId } });
    const input = await platform.read(actor, (ctx) =>
      rankCardInput(ctx, actor.userId, user?.username ?? 'Member'),
    );
    const card = await renderRankCard(input);
    return reply
      .header('content-type', 'image/png')
      .header('cache-control', 'private, no-store')
      .header('etag', '"' + card.hash + '"')
      .header('x-rank-summary', encodeURIComponent(card.summary))
      .send(card.buffer);
  });
  app.get('/api/v1/public/widgets/:guildId/:type', async (req) => {
    const p = z
      .object({ guildId: z.string(), type: z.enum(['status', 'leaderboard']) })
      .parse(req.params);
    return {
      data: await platform.read(
        {
          userId: 'public',
          guildId: p.guildId,
          roles: [],
          isAdmin: false,
          isOwner: false,
          capabilities: [],
          globalCapabilities: [],
        },
        (ctx) => publicWidget(ctx, p.type),
      ),
    };
  });
  app.get('/api/v1/owner/health', async (req) => {
    await globalActor(req, 'diagnostics.read');
    return {
      data: {
        build: config.APP_VERSION,
        checkedAt: new Date().toISOString(),
        services: (await db.heartbeat.findMany()).map((h) => ({
          name: h.service,
          status:
            h.updatedAt > new Date(Date.now() - 60000)
              ? h.status
              : 'unavailable',
          lastSeenAt: h.updatedAt.toISOString(),
        })),
        metrics: [
          {
            label: 'Pending jobs',
            value: await db.outbox.count({ where: { state: 'pending' } }),
            unit: 'jobs',
            window: 'current',
          },
          {
            label: 'Failed or ambiguous jobs',
            value: await db.outbox.count({
              where: { state: { in: ['blocked', 'unknown', 'dead'] } },
            }),
            unit: 'jobs',
            window: 'current',
          },
        ],
      },
    };
  });
  app.get('/api/v1/owner/fleet', async (req) => {
    await globalActor(req, 'fleet.read');
    return {
      data: await db.guild.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
      }),
    };
  });
  app.get('/api/v1/owner/jobs', async (req) => {
    await globalActor(req, 'diagnostics.read');
    return {
      data: await db.outbox.findMany({
        where: {
          state: {
            in: ['blocked', 'unknown', 'dead', 'pending', 'retry', 'running'],
          },
        },
        select: {
          id: true,
          guildId: true,
          type: true,
          state: true,
          attempts: true,
          dueAt: true,
          lastError: true,
        },
        take: 100,
        orderBy: { dueAt: 'asc' },
      }),
    };
  });
  app.post('/api/v1/owner/jobs/:id/retry', async (req) => {
    const s = await auth.csrf(req),
      a = await globalActor(req, 'maintenance.manage'),
      p = z.object({ id: z.string() }).parse(req.params),
      body = z
        .object({ reason: z.string().trim().min(3).max(1000) })
        .parse(req.body),
      job = await db.outbox.findUnique({ where: { id: p.id } });
    if (!job) throw new DomainError('NOT_FOUND', 'Job unavailable.', 404);
    return platform.mutate(
      { ...a, guildId: job.guildId },
      'owner.job.retry',
      key(req),
      { ...p, ...body },
      async (ctx) => {
        await requireActiveSession(ctx.tx, s.id, a.userId);
        const result = await ctx.tx.outbox.updateMany({
          where: { id: job.id, state: { in: ['blocked', 'dead'] } },
          data: {
            state: 'pending',
            dueAt: new Date(),
            leaseUntil: null,
            lastError: null,
            fence: { increment: 1 },
          },
        });
        if (result.count !== 1)
          throw new DomainError(
            'INVALID_INPUT',
            'Only known failed jobs can be retried. Ambiguous effects require reconciliation.',
          );
        return { id: job.id, state: 'pending' };
      },
    );
  });
  app.get('/api/v1/owner/support', async (req) => {
    await globalActor(req, 'support.read');
    return {
      data: await db.supportTicket.findMany({
        take: 100,
        orderBy: { updatedAt: 'desc' },
      }),
    };
  });
  app.get('/ws/events', { websocket: true }, async (socket, req) => {
    if (req.headers.origin !== new URL(config.PUBLIC_APP_URL).origin) {
      socket.close(1008, 'Invalid origin');
      return;
    }
    try {
      const initial = await auth.session(req);
      let running = false;
      const timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
          const current = await auth.session(req);
          if (current.id !== initial.id) {
            socket.close(1008);
            return;
          }
          if (socket.bufferedAmount > 65536) {
            socket.close(1013);
            return;
          }
          socket.send(
            JSON.stringify({
              eventId: crypto.randomUUID(),
              type: 'invalidate',
              timestamp: new Date().toISOString(),
            }),
          );
        } catch {
          socket.close(1008, 'Session expired');
        } finally {
          running = false;
        }
      }, 15000);
      socket.on('close', () => clearInterval(timer));
      socket.send(
        JSON.stringify({
          type: 'connected',
          timestamp: new Date().toISOString(),
        }),
      );
    } catch {
      socket.close(1008, 'Sign in required');
    }
  });
  return app;
}
