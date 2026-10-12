import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { normalizeUploadedImage } from '@sparko/rendering';
import { z } from 'zod';
import { DomainError, PreferenceSchema, type Actor } from '@sparko/contracts';
import { hash, jsonObject } from '@sparko/domain';
import { json, type PrismaClient, type Transaction } from '@sparko/db';
import { requireActiveSession, type Auth } from './auth.js';

export const ACCOUNT_EXPORT_RETENTION_DAYS = 30;
const cutoff = () =>
  new Date(Date.now() - ACCOUNT_EXPORT_RETENTION_DAYS * 86400000);
const SupportAttachmentInput = z.object({
  name: z.string().trim().min(1).max(100),
  base64: z
    .string()
    .min(16)
    .max(5_592_408)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
const supportMessage = z.object({
  message: z.string().trim().min(1).max(4000),
  attachments: z.array(SupportAttachmentInput).max(3).default([]),
});
export const SUPPORT_ATTACHMENTS_PER_REQUEST = 10;
const supportBodyLimit = 3 * 5_600_000 + 64 * 1024;
type PreparedImage = Awaited<ReturnType<typeof normalizeUploadedImage>> & {
  name: string;
};
/** Screenshots only, re-encoded as metadata-free PNG before anything is stored. */
async function prepareImages(
  list: z.infer<typeof SupportAttachmentInput>[],
): Promise<PreparedImage[]> {
  const prepared: PreparedImage[] = [];
  for (const item of list) {
    const bytes = Buffer.from(item.base64, 'base64');
    if (bytes.toString('base64') !== item.base64)
      throw new DomainError('INVALID_INPUT', 'Attach a valid image.');
    try {
      prepared.push({
        ...(await normalizeUploadedImage(bytes)),
        name: item.name,
      });
    } catch (error) {
      throw new DomainError(
        'INVALID_INPUT',
        error instanceof Error ? error.message : 'This image is unsupported.',
      );
    }
  }
  return prepared;
}
/** The operation receipt hashes image content, never stores it. */
function receiptInput(
  body: z.infer<typeof supportMessage>,
  images: PreparedImage[],
) {
  return {
    ...body,
    attachments: images.map((image) => ({
      name: image.name,
      hash: image.hash,
    })),
  };
}
const supportStates = [
  'open',
  'waiting_on_user',
  'resolved',
  'closed',
] as const;
export const exportKinds = ['full', 'support', 'servers'] as const;
export type ExportKind = (typeof exportKinds)[number];

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

/**
 * A personal data export. `support` covers product support conversations
 * (attachment details, not image bytes); `servers` covers tickets and personal
 * records kept by the servers you use; `full` covers both.
 */
export async function accountExport(
  tx: Transaction,
  userId: string,
  kind: ExportKind = 'full',
) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, username: true, preferences: true },
  });
  const withSupport = kind !== 'servers',
    withServers = kind !== 'support';
  const [support, tickets, records] = await Promise.all([
    !withSupport
      ? []
      : tx.supportTicket.findMany({
          where: { ownerId: userId },
          include: {
            attachments: {
              select: {
                id: true,
                messageId: true,
                name: true,
                bytes: true,
                width: true,
                height: true,
                sha256: true,
                createdAt: true,
              },
            },
          },
          take: 1000,
          orderBy: { id: 'asc' },
        }),
    !withServers
      ? []
      : tx.ticket.findMany({
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
    !withServers
      ? []
      : tx.record.findMany({
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
    kind,
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
  images: PreparedImage[],
  ownerId?: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${ticketId} FOR UPDATE`;
  const ticket = await tx.supportTicket.findFirst({
    where: { id: ticketId, ...(ownerId ? { ownerId } : {}) },
  });
  if (!ticket)
    throw new DomainError('NOT_FOUND', 'Support request unavailable.', 404);
  if (ticket.state === 'closed')
    throw new DomainError(
      'INVALID_INPUT',
      'This support request is closed. Reopen it to add a message.',
    );
  const id = randomUUID();
  const attachments = await storeAttachments(
    tx,
    ticket.id,
    id,
    authorId,
    images,
  );
  return tx.supportTicket.update({
    where: { id: ticket.id },
    data: {
      // A member's reply puts it back with support; a staff reply waits on them.
      state: ownerId ? 'open' : 'waiting_on_user',
      messages: json([
        ...(Array.isArray(ticket.messages) ? ticket.messages : []),
        {
          id,
          authorId,
          content: message,
          createdAt: new Date().toISOString(),
          ...(ownerId ? {} : { staff: true }),
          attachments,
        },
      ]),
    },
  });
}
async function storeAttachments(
  tx: Transaction,
  ticketId: string,
  messageId: string,
  uploaderId: string,
  images: PreparedImage[],
) {
  if (!images.length) return [];
  const existing = await tx.supportAttachment.count({ where: { ticketId } });
  if (existing + images.length > SUPPORT_ATTACHMENTS_PER_REQUEST)
    throw new DomainError(
      'INVALID_INPUT',
      `A support request can hold up to ${SUPPORT_ATTACHMENTS_PER_REQUEST} images.`,
    );
  const saved = [];
  for (const image of images) {
    const row = await tx.supportAttachment.create({
      data: {
        ticketId,
        messageId,
        uploaderId,
        name: image.name,
        bytes: image.bytes,
        width: image.width,
        height: image.height,
        sha256: image.hash,
        data: image.buffer,
      },
      select: { id: true, name: true, bytes: true, width: true, height: true },
    });
    saved.push(row);
  }
  return saved;
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
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
  }));
  app.post(
    '/api/v1/account/support',
    { bodyLimit: supportBodyLimit },
    async (req) => {
      const s = await auth.csrf(req),
        body = supportMessage
          .extend({
            subject: z.string().trim().min(1).max(200),
            category: z
              .enum(['account', 'billing', 'bug', 'other'])
              .default('other'),
          })
          .parse(req.body),
        images = await prepareImages(body.attachments);
      return accountMutation(
        db,
        s.userId,
        'support.create',
        requestKey(req),
        receiptInput(body, images),
        async (tx) => {
          const messageId = randomUUID();
          const created = await tx.supportTicket.create({
            data: {
              ownerId: s.userId,
              subject: body.subject,
              category: body.category,
              messages: json([]),
            },
          });
          const attachments = await storeAttachments(
            tx,
            created.id,
            messageId,
            s.userId,
            images,
          );
          return tx.supportTicket.update({
            where: { id: created.id },
            data: {
              messages: json([
                {
                  id: messageId,
                  authorId: s.userId,
                  content: body.message,
                  createdAt: new Date().toISOString(),
                  attachments,
                },
              ]),
            },
          });
        },
        s.id,
      );
    },
  );
  app.post(
    '/api/v1/account/support/:id/reply',
    { bodyLimit: supportBodyLimit },
    async (req) => {
      const s = await auth.csrf(req),
        { id } = z.object({ id: z.string() }).parse(req.params),
        body = supportMessage.parse(req.body),
        images = await prepareImages(body.attachments);
      return accountMutation(
        db,
        s.userId,
        `support.reply:${id}`,
        requestKey(req),
        receiptInput(body, images),
        (tx) => appendSupport(tx, id, s.userId, body.message, images, s.userId),
        s.id,
      );
    },
  );
  app.post(
    '/api/v1/owner/support/:id/reply',
    { bodyLimit: supportBodyLimit },
    async (req) => {
      const s = await auth.csrf(req);
      const a = await globalActor(req, 'support.reply'),
        { id } = z.object({ id: z.string() }).parse(req.params),
        body = supportMessage.parse(req.body),
        images = await prepareImages(body.attachments);
      // Store only a message identity in the operator receipt, never a second copy
      // of the private conversation that could survive the account's deletion.
      return accountMutation(
        db,
        a.userId,
        `support.reply:${id}`,
        requestKey(req),
        receiptInput(body, images),
        async (tx) => {
          const row = await appendSupport(
            tx,
            id,
            a.userId,
            body.message,
            images,
          );
          const messages = z
            .array(z.object({ id: z.string() }).passthrough())
            .parse(row.messages);
          return {
            id: row.id,
            messageId: messages.at(-1)!.id,
            state: row.state,
          };
        },
        s.id,
      );
    },
  );
  /** Members close or reopen their own request; staff set any support state. */
  async function setSupportState(
    tx: Transaction,
    id: string,
    state: (typeof supportStates)[number],
    ownerId?: string,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${id} FOR UPDATE`;
    const ticket = await tx.supportTicket.findFirst({
      where: { id, ...(ownerId ? { ownerId } : {}) },
    });
    if (!ticket)
      throw new DomainError('NOT_FOUND', 'Support request unavailable.', 404);
    const row = await tx.supportTicket.update({
      where: { id },
      data: { state },
    });
    return { id: row.id, state: row.state };
  }
  app.post('/api/v1/account/support/:id/status', async (req) => {
    const s = await auth.csrf(req),
      { id } = z.object({ id: z.string() }).parse(req.params),
      body = z
        .object({ state: z.enum(['open', 'closed']) })
        .strict()
        .parse(req.body);
    return accountMutation(
      db,
      s.userId,
      `support.status:${id}`,
      requestKey(req),
      body,
      (tx) => setSupportState(tx, id, body.state, s.userId),
      s.id,
    );
  });
  app.post('/api/v1/owner/support/:id/status', async (req) => {
    const s = await auth.csrf(req),
      a = await globalActor(req, 'support.reply'),
      { id } = z.object({ id: z.string() }).parse(req.params),
      body = z
        .object({ state: z.enum(supportStates) })
        .strict()
        .parse(req.body);
    return accountMutation(
      db,
      a.userId,
      `support.status:${id}`,
      requestKey(req),
      body,
      (tx) => setSupportState(tx, id, body.state),
      s.id,
    );
  });
  /** Private image download for the requester or support readers only. */
  async function sendAttachment(
    reply: FastifyReply,
    ticketId: string,
    attachmentId: string,
    ownerId?: string,
  ) {
    const row = await db.supportAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
        ...(ownerId ? { ticket: { ownerId } } : {}),
      },
    });
    if (!row)
      throw new DomainError('NOT_FOUND', 'Attachment unavailable.', 404);
    return reply
      .header('content-type', 'image/png')
      .header('x-content-type-options', 'nosniff')
      .header(
        'content-disposition',
        `attachment; filename="support-${row.id}.png"`,
      )
      .send(Buffer.from(row.data));
  }
  app.get(
    '/api/v1/account/support/:id/attachments/:attachmentId',
    async (req, reply) => {
      const s = await auth.session(req),
        p = z
          .object({ id: z.string(), attachmentId: z.string() })
          .parse(req.params);
      return sendAttachment(reply, p.id, p.attachmentId, s.userId);
    },
  );
  app.get(
    '/api/v1/owner/support/:id/attachments/:attachmentId',
    async (req, reply) => {
      await globalActor(req, 'support.read');
      const p = z
        .object({ id: z.string(), attachmentId: z.string() })
        .parse(req.params);
      return sendAttachment(reply, p.id, p.attachmentId);
    },
  );
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
            kind: jsonObject(r.data)['kind'] ?? 'full',
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
  const ExportRequest = z
    .object({ kind: z.enum(exportKinds).default('full') })
    .strict();
  app.get('/api/v1/account/privacy/export', async (req) => {
    const s = await auth.session(req),
      { kind } = ExportRequest.parse(req.query ?? {});
    return {
      data: await db.$transaction((tx) => accountExport(tx, s.userId, kind)),
    };
  });
  app.post('/api/v1/account/privacy/export', async (req) => {
    const s = await auth.csrf(req),
      body = ExportRequest.parse(req.body ?? {});
    // The receipt stores the export ID, not its private contents.
    return accountMutation(
      db,
      s.userId,
      'privacy.export',
      requestKey(req),
      body,
      async (tx) => {
        const row = await tx.accountRequest.create({
          data: {
            userId: s.userId,
            kind: 'export',
            state: 'ready',
            data: json(await accountExport(tx, s.userId, body.kind)),
          },
        });
        return {
          id: row.id,
          kind: body.kind,
          state: row.state,
          createdAt: row.createdAt,
        };
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
