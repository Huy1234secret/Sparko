import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError, PreferenceSchema, type Actor } from '@sparko/contracts';
import { hash, jsonObject } from '@sparko/domain';
import { json, type PrismaClient, type Transaction } from '@sparko/db';
import { requireActiveSession, type Auth } from './auth.js';

export const ACCOUNT_EXPORT_RETENTION_DAYS = 30;
const cutoff = () =>
  new Date(Date.now() - ACCOUNT_EXPORT_RETENTION_DAYS * 86400000);
const supportMessage = z.object({
  message: z.string().trim().min(1).max(4000),
});

function requestKey(req: FastifyRequest) {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !key || key.length > 128)
    throw new DomainError(
      'INVALID_INPUT',
      'A stable idempotency key is required.',
    );
  return key;
}

/** Global account operations have no guild FK. The DB lock covers all API processes. */
export async function accountMutation<T>(
  db: PrismaClient,
  userId: string,
  scope: string,
  key: string,
  input: unknown,
  handler: (tx: Transaction) => Promise<T>,
  sessionId?: string,
) {
  if (!key || key.length > 128)
    throw new DomainError(
      'INVALID_INPUT',
      'A stable idempotency key is required.',
    );
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`account:${userId}`},0))`;
      if (sessionId) await requireActiveSession(tx, sessionId, userId);
      const previous = await tx.accountRequest.findFirst({
        where: {
          userId,
          kind: `operation:${scope}`,
          data: { path: ['key'], equals: key },
        },
      });
      const requestHash = hash(input);
      if (previous) {
        const saved = jsonObject(previous.data);
        if (saved['requestHash'] !== requestHash)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'This request key was already used with different input.',
            409,
          );
        return { data: saved['result'] as T };
      }
      const data = await handler(tx);
      await tx.accountRequest.create({
        data: {
          userId,
          kind: `operation:${scope}`,
          state: 'committed',
          data: json({ key, requestHash, result: data }),
        },
      });
      return { data };
    },
    { maxWait: 10000, timeout: 10000 },
  );
}

export async function accountExport(tx: Transaction, userId: string) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, username: true, preferences: true },
  });
  const [support, tickets, records] = await Promise.all([
    tx.supportTicket.findMany({
      where: { ownerId: userId },
      take: 1000,
      orderBy: { id: 'asc' },
    }),
    tx.ticket.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        guildId: true,
        state: true,
        answers: true,
        createdAt: true,
      },
      take: 1000,
      orderBy: { id: 'asc' },
    }),
    tx.record.findMany({
      where: {
        ownerId: userId,
        kind: {
          in: [
            'level.profile',
            'level.history',
            'crate.claim',
            'inventory',
            'achievement.award',
            'birthday',
            'reminder',
            'form.submission',
            'ai.request',
          ],
        },
      },
      take: 5000,
      orderBy: { id: 'asc' },
    }),
  ]);
  // Explicitly exclude provider credentials, billing details and raw AI input.
  const safeRecords = records.map((row) => {
    if (row.kind !== 'ai.request') return row;
    const { prompt: _prompt, ...data } = jsonObject(row.data);
    return { ...row, data };
  });
  return {
    user,
    support,
    tickets,
    records: safeRecords,
    limits: { support: 1000, tickets: 1000, records: 5000 },
    exportedAt: new Date().toISOString(),
  };
}

async function appendSupport(
  tx: Transaction,
  ticketId: string,
  authorId: string,
  message: string,
  ownerId?: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${ticketId} FOR UPDATE`;
  const ticket = await tx.supportTicket.findFirst({
    where: { id: ticketId, ...(ownerId ? { ownerId } : {}) },
  });
  if (!ticket)
    throw new DomainError('NOT_FOUND', 'Support request unavailable.', 404);
  if (ticket.state !== 'open')
    throw new DomainError('INVALID_INPUT', 'This support request is closed.');
  return tx.supportTicket.update({
    where: { id: ticket.id },
    data: {
      messages: json([
        ...(Array.isArray(ticket.messages) ? ticket.messages : []),
        {
          id: randomUUID(),
          authorId,
          content: message,
          createdAt: new Date().toISOString(),
        },
      ]),
    },
  });
}

export async function deleteAccount(tx: Transaction, userId: string) {
  await tx.session.deleteMany({ where: { userId } });
  await tx.oAuthCredential.deleteMany({ where: { userId } });
  await tx.globalGrant.deleteMany({ where: { userId } });
  await tx.accessGrant.deleteMany({
    where: { subjectType: 'user', subjectId: userId },
  });
  await tx.accountRequest.deleteMany({
    where: { userId, kind: { not: 'deletion' } },
  });
  await tx.supportTicket.deleteMany({ where: { ownerId: userId } });
  const personal = await tx.record.findMany({
    where: {
      ownerId: userId,
      kind: {
        in: ['level.profile', 'birthday', 'reminder', 'ai.request', 'asset'],
      },
    },
  });
  for (const row of personal) {
    const data = jsonObject(row.data);
    if (row.kind === 'level.profile') {
      await tx.record.update({
        where: { id: row.id },
        data: {
          data: json({ ...data, publicProfile: false }),
          revision: { increment: 1 },
        },
      });
    } else {
      // Keep an inert identity so delayed jobs cannot re-create a removed opt-in.
      await tx.record.update({
        where: { id: row.id },
        data: {
          state: 'cancelled',
          data: json({ removedAt: new Date().toISOString() }),
          revision: { increment: 1 },
        },
      });
    }
  }
  await tx.user.update({
    where: { id: userId },
    data: {
      username: 'Deleted user',
      avatar: null,
      preferences: json(
        PreferenceSchema.parse({
          motion: false,
          notifications: false,
          publicProfile: false,
        }),
      ),
    },
  });
  await tx.accountRequest.updateMany({
    where: { userId, kind: 'deletion' },
    data: { state: 'completed', data: json({ identityRemoved: true }) },
  });
  return {
    state: 'identity_deleted',
    retained:
      'Guild ticket, moderation, audit, reward and ledger records remain under their configured retention. Private exports and product support were removed; public sharing and personal notifications were disabled.',
  };
}

export function registerAccountRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  auth: Auth,
  globalActor: (req: FastifyRequest, capability: string) => Promise<Actor>,
) {
  app.get('/api/v1/account/preferences', async (req) => ({
    data: PreferenceSchema.parse((await auth.session(req)).user.preferences),
  }));
  app.put('/api/v1/account/preferences', async (req) => {
    const s = await auth.csrf(req),
      preferences = PreferenceSchema.parse(req.body);
    return accountMutation(
      db,
      s.userId,
      'preferences',
      requestKey(req),
      preferences,
      async (tx) => {
        await tx.user.update({
          where: { id: s.userId },
          data: { preferences: json(preferences) },
        });
        return preferences;
      },
      s.id,
    );
  });
  app.get('/api/v1/account/support', async (req) => ({
    data: await db.supportTicket.findMany({
      where: { ownerId: (await auth.session(req)).userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  }));
  app.post('/api/v1/account/support', async (req) => {
    const s = await auth.csrf(req),
      body = supportMessage
        .extend({
          subject: z.string().trim().min(1).max(200),
          category: z
            .enum(['account', 'billing', 'bug', 'other'])
            .default('other'),
        })
        .parse(req.body);
    return accountMutation(
      db,
      s.userId,
      'support.create',
      requestKey(req),
      body,
      (tx) =>
        tx.supportTicket.create({
          data: {
            ownerId: s.userId,
            subject: body.subject,
            category: body.category,
            messages: json([
              {
                id: randomUUID(),
                authorId: s.userId,
                content: body.message,
                createdAt: new Date().toISOString(),
              },
            ]),
          },
        }),
      s.id,
    );
  });
  app.post('/api/v1/account/support/:id/reply', async (req) => {
    const s = await auth.csrf(req),
      { id } = z.object({ id: z.string() }).parse(req.params),
      body = supportMessage.parse(req.body);
    return accountMutation(
      db,
      s.userId,
      `support.reply:${id}`,
      requestKey(req),
      body,
      (tx) => appendSupport(tx, id, s.userId, body.message, s.userId),
      s.id,
    );
  });
  app.post('/api/v1/owner/support/:id/reply', async (req) => {
    const s = await auth.csrf(req);
    const a = await globalActor(req, 'support.reply'),
      { id } = z.object({ id: z.string() }).parse(req.params),
      body = supportMessage.parse(req.body);
    // Store only a message identity in the operator receipt, never a second copy
    // of the private conversation that could survive the account's deletion.
    return accountMutation(
      db,
      a.userId,
      `support.reply:${id}`,
      requestKey(req),
      body,
      async (tx) => {
        const row = await appendSupport(tx, id, a.userId, body.message);
        const messages = z
          .array(z.object({ id: z.string() }).passthrough())
          .parse(row.messages);
        return { id: row.id, messageId: messages.at(-1)!.id, state: row.state };
      },
      s.id,
    );
  });
  app.get('/api/v1/account/sessions', async (req) => {
    const current = await auth.session(req);
    return {
      data: (
        await db.session.findMany({
          where: { userId: current.userId, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      ).map((row) => ({
        id: row.id,
        current: row.id === current.id,
        createdAt: row.createdAt,
        lastSeenAt: row.createdAt,
      })),
    };
  });
  app.post('/api/v1/account/sessions/:id/revoke', async (req) => {
    const s = await auth.csrf(req),
      { id } = z.object({ id: z.string() }).parse(req.params);
    return accountMutation(
      db,
      s.userId,
      `session.revoke:${id}`,
      requestKey(req),
      {},
      async (tx) => {
        await tx.session.deleteMany({ where: { id, userId: s.userId } });
        return { revoked: true };
      },
      s.id,
    );
  });
  app.get('/api/v1/account/privacy', async (req) => {
    const s = await auth.session(req),
      rows = await db.accountRequest.findMany({
        where: { userId: s.userId, kind: { in: ['export', 'deletion'] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    return {
      data: {
        retentionDays: ACCOUNT_EXPORT_RETENTION_DAYS,
        exports: rows
          .filter((r) => r.kind === 'export')
          .map((r) => ({
            id: r.id,
            status: r.createdAt <= cutoff() ? 'expired' : r.state,
            createdAt: r.createdAt,
            ...(r.state === 'ready' && r.createdAt > cutoff()
              ? { downloadUrl: '/api/v1/account/privacy/exports/' + r.id }
              : {}),
          })),
        deletionRequests: rows
          .filter((r) => r.kind === 'deletion')
          .map((r) => ({ id: r.id, status: r.state, createdAt: r.createdAt })),
      },
    };
  });
  app.get('/api/v1/account/privacy/export', async (req) => {
    const s = await auth.session(req);
    return { data: await db.$transaction((tx) => accountExport(tx, s.userId)) };
  });
  app.post('/api/v1/account/privacy/export', async (req) => {
    const s = await auth.csrf(req);
    // The receipt stores the export ID, not its private contents.
    return accountMutation(
      db,
      s.userId,
      'privacy.export',
      requestKey(req),
      {},
      async (tx) => {
        const row = await tx.accountRequest.create({
          data: {
            userId: s.userId,
            kind: 'export',
            state: 'ready',
            data: json(await accountExport(tx, s.userId)),
          },
        });
        return { id: row.id, state: row.state, createdAt: row.createdAt };
      },
      s.id,
    );
  });
  app.get('/api/v1/account/privacy/exports/:id', async (req) => {
    const s = await auth.session(req),
      { id } = z.object({ id: z.string() }).parse(req.params),
      row = await db.accountRequest.findFirst({
        where: {
          id,
          userId: s.userId,
          kind: 'export',
          state: 'ready',
          createdAt: { gt: cutoff() },
        },
      });
    if (!row)
      throw new DomainError('NOT_FOUND', 'Export unavailable or expired.', 404);
    return { data: row.data };
  });
  for (const path of [
    '/api/v1/account/privacy/deletion',
    '/api/v1/account/privacy/delete',
  ])
    app.post(path, async (req, reply) => {
      const s = await auth.csrf(req),
        body = z
          .object({ reason: z.string().max(1000).default('') })
          .parse(req.body ?? {});
      const result = await accountMutation(
        db,
        s.userId,
        'privacy.delete',
        requestKey(req),
        body,
        async (tx) => {
          await tx.accountRequest.create({
            data: {
              userId: s.userId,
              kind: 'deletion',
              state: 'processing',
              data: json({}),
            },
          });
          return deleteAccount(tx, s.userId);
        },
        s.id,
      );
      reply.clearCookie(auth.cookie, { path: '/' });
      reply.clearCookie('sparko_csrf', { path: '/' });
      return result;
    });
}
