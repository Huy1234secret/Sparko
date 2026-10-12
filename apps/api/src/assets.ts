import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Config } from '@sparko/config';
import { json, type PrismaClient } from '@sparko/db';
import { DomainError } from '@sparko/contracts';
import { hash, jsonObject, planFor, Platform } from '@sparko/domain';
import { normalizeUploadedImage } from '@sparko/rendering';
import type { createAuth } from './auth.js';
import { requireActiveSession } from './auth.js';

const Metadata = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z
    .number()
    .int()
    .min(12)
    .max(4 * 1024 * 1024),
  width: z.number().int(),
  height: z.number().int(),
  mime: z.literal('image/png'),
  name: z.string(),
  alt: z.string(),
  visibility: z.enum(['public', 'private']),
});
const Upload = z
  .object({
    name: z.string().trim().min(1).max(100),
    alt: z.string().trim().min(1).max(500),
    base64: z
      .string()
      .min(16)
      .max(5_592_408)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    visibility: z.enum(['public', 'private']),
    publicSharingAcknowledged: z.boolean().default(false),
  })
  .refine(
    (b) => b.visibility !== 'public' || b.publicSharingAcknowledged,
    'Acknowledge public sharing before making a public image.',
  );
const storageLeaseMs = 60_000;
function hasFileError(error: unknown, code: string) {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === code
  );
}
function dto(record: { id: string; guildId: string; data: unknown }) {
  const data = Metadata.parse(record.data);
  return {
    id: record.id,
    ...data,
    url: `attachment://sparko-${record.id}.png`,
    previewUrl:
      data.visibility === 'public'
        ? `/api/v1/public/assets/${record.id}`
        : `/api/v1/guilds/${record.guildId}/assets/${record.id}/download`,
  };
}
export function registerAssetRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  config: Config,
  auth: ReturnType<typeof createAuth>,
) {
  const platform = new Platform(db),
    path = (hash: string) =>
      resolve(config.STORAGE_PATH, 'assets', `${hash}.png`);
  app.get('/api/v1/guilds/:guildId/assets', async (req) => {
    const { guildId } = z.object({ guildId: z.string() }).parse(req.params);
    const actor = await auth.actor(req, guildId, 'templates.edit');
    const records = await db.record.findMany({
      where: {
        guildId,
        kind: 'asset',
        state: 'clean',
        OR: [
          { ownerId: actor.userId },
          { data: { path: ['visibility'], equals: 'public' } },
        ],
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return { data: records.map(dto) };
  });
  app.post(
    '/api/v1/guilds/:guildId/assets',
    { bodyLimit: 6 * 1024 * 1024 },
    async (req) => {
      const session = await auth.csrf(req);
      const { guildId } = z.object({ guildId: z.string() }).parse(req.params),
        actor = await auth.actor(req, guildId, 'templates.edit');
      const input = Upload.parse(req.body),
        key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !key || key.length > 128)
        throw new DomainError(
          'INVALID_INPUT',
          'A stable upload identity is required.',
        );
      const bytes = Buffer.from(input.base64, 'base64');
      if (bytes.toString('base64') !== input.base64)
        throw new DomainError('INVALID_INPUT', 'Choose a valid encoded image.');
      let image: Awaited<ReturnType<typeof normalizeUploadedImage>>;
      try {
        image = await normalizeUploadedImage(bytes);
      } catch (error) {
        throw new DomainError(
          'INVALID_INPUT',
          error instanceof Error ? error.message : 'This image is unsupported.',
        );
      }
      const operationInput = { ...input, base64: image.hash },
        requestHash = hash(operationInput),
        leaseId = randomUUID();
      // Reserve metadata and quota before touching storage. Interrupted writes stay
      // charged to their pending asset, and a conflicting replay cannot create files.
      const reservation = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${guildId},0))`;
        await requireActiveSession(tx, session.id, actor.userId);
        const previous = await tx.operation.findUnique({
          where: {
            guildId_actorId_scope_key: {
              guildId,
              actorId: actor.userId,
              scope: 'assets.upload',
              key,
            },
          },
        });
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new DomainError(
              'IDEMPOTENCY_CONFLICT',
              'This upload identity was already used with a different image or description.',
              409,
            );
          return {
            replay: { data: previous.result, operation: previous },
            record: null,
            oldTemp: null,
          };
        }
        const reservationKey = `upload:${actor.userId}:${key}`,
          pending = await tx.record.findUnique({
            where: {
              guildId_kind_key: { guildId, kind: 'asset', key: reservationKey },
            },
          });
        if (
          pending &&
          (pending.ownerId !== actor.userId ||
            jsonObject(pending.data)['requestHash'] !== requestHash)
        )
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'This upload identity was already reserved for a different image or description.',
            409,
          );
        if (
          pending &&
          Date.parse(String(jsonObject(pending.data)['storageLeaseUntil'])) >
            Date.now()
        )
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'This upload is still being stored. Retry with the same request key.',
            503,
          );
        if (!pending) {
          const used = await tx.record.findMany({
            where: { guildId, kind: 'asset' },
            take: 101,
            select: { data: true },
          });
          const plan = await planFor(tx, guildId);
          if (
            used.length >= 100 ||
            used.reduce((n, r) => n + Metadata.parse(r.data).bytes, 0) +
              image.bytes >
              plan.storageBytes
          )
            throw new DomainError(
              'PLAN_LIMIT',
              `This server’s image library is full: up to 100 images and ${plan.storageBytes / 1_000_000} MB on the ${plan.id === 'plus' ? 'Plus' : 'Free'} plan.`,
              429,
            );
        }
        const metadata = {
            name: input.name,
            alt: input.alt,
            visibility: input.visibility,
            hash: image.hash,
            bytes: image.bytes,
            width: image.width,
            height: image.height,
            mime: image.mime,
            requestHash,
            storageLeaseId: leaseId,
            storageLeaseUntil: new Date(
              Date.now() + storageLeaseMs,
            ).toISOString(),
          },
          record = pending
            ? await tx.record.update({
                where: { id: pending.id },
                data: { data: json(metadata), revision: { increment: 1 } },
              })
            : await tx.record.create({
                data: {
                  guildId,
                  kind: 'asset',
                  key: reservationKey,
                  ownerId: actor.userId,
                  state: 'pending',
                  data: json(metadata),
                },
              });
        const oldLeaseId = jsonObject(pending?.data)['storageLeaseId'];
        return {
          replay: null,
          record,
          oldTemp:
            typeof oldLeaseId === 'string' &&
            z.uuid().safeParse(oldLeaseId).success
              ? `${record.id}.${oldLeaseId}.pending`
              : null,
        };
      });
      if (reservation.replay) return reservation.replay;
      const record = reservation.record,
        directory = resolve(config.STORAGE_PATH, 'assets'),
        temporary = resolve(directory, `${record.id}.${leaseId}.pending`);
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        if (reservation.oldTemp)
          await unlink(resolve(directory, reservation.oldTemp)).catch(
            (error: unknown) => {
              if (!hasFileError(error, 'ENOENT')) throw error;
            },
          );
        // A complete temporary file is linked atomically into immutable storage.
        // Its name belongs to the reservation so crash leftovers can be reclaimed.
        await writeFile(temporary, image.buffer, { flag: 'wx', mode: 0o600 });
        const current = await db.record.findFirst({
          where: {
            id: record.id,
            guildId,
            revision: record.revision,
            state: 'pending',
            data: { path: ['storageLeaseId'], equals: leaseId },
          },
        });
        if (
          !current ||
          Date.parse(String(jsonObject(current.data)['storageLeaseUntil'])) <=
            Date.now()
        )
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'The upload storage lease expired. Retry with the same request key.',
            503,
          );
        await link(temporary, path(image.hash)).catch((error: unknown) => {
          if (!hasFileError(error, 'EEXIST')) throw error;
        });
        const stored = await readFile(path(image.hash));
        if (
          stored.length !== image.bytes ||
          createHash('sha256').update(stored).digest('hex') !== image.hash
        )
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'Image integrity could not be verified.',
            503,
          );
        await unlink(temporary);
        return await platform.mutate(
          actor,
          'assets.upload',
          key,
          operationInput,
          async (ctx) => {
            await requireActiveSession(ctx.tx, session.id, actor.userId);
            const saved = await ctx.tx.record.updateMany({
              where: {
                id: record.id,
                guildId,
                ownerId: actor.userId,
                state: 'pending',
                revision: record.revision,
                data: { path: ['storageLeaseId'], equals: leaseId },
              },
              data: {
                state: 'clean',
                data: json(Metadata.parse(record.data)),
                revision: { increment: 1 },
              },
            });
            if (!saved.count)
              throw new DomainError(
                'SERVICE_UNAVAILABLE',
                'This upload changed while it was stored. Retry with the same request key.',
                503,
              );
            return dto(record);
          },
        );
      } finally {
        await unlink(temporary).catch(() => undefined);
        // Failure releases execution ownership, not the durable quota reservation.
        // A later retry verifies/reuses retained bytes instead of allocating again.
        await db.record.updateMany({
          where: {
            id: record.id,
            guildId,
            state: 'pending',
            revision: record.revision,
            data: { path: ['storageLeaseId'], equals: leaseId },
          },
          data: {
            data: json({
              ...jsonObject(record.data),
              storageLeaseUntil: new Date(0).toISOString(),
            }),
          },
        });
      }
    },
  );
  async function bytesFor(id: string, guildId?: string, actorId?: string) {
    const record = await db.record.findFirst({
      where: {
        id,
        kind: 'asset',
        state: 'clean',
        ...(guildId ? { guildId } : {}),
      },
    });
    if (!record) throw new DomainError('NOT_FOUND', 'Image unavailable.', 404);
    const metadata = Metadata.parse(record.data);
    if (metadata.visibility === 'private' && record.ownerId !== actorId)
      throw new DomainError('NOT_FOUND', 'Image unavailable.', 404);
    const bytes = await readFile(path(metadata.hash));
    if (
      bytes.length !== metadata.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== metadata.hash
    )
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'Image integrity could not be verified.',
        503,
      );
    return bytes;
  }
  app.get('/api/v1/guilds/:guildId/assets/:id/download', async (req, reply) => {
    const { guildId, id } = z
        .object({ guildId: z.string(), id: z.string() })
        .parse(req.params),
      actor = await auth.actor(req, guildId, 'templates.edit');
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type('image/png')
      .send(await bytesFor(id, guildId, actor.userId));
  });
  app.get('/api/v1/public/assets/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return reply
      .header('Cache-Control', 'public, max-age=300')
      .header('X-Content-Type-Options', 'nosniff')
      .type('image/png')
      .send(await bytesFor(id));
  });
}
