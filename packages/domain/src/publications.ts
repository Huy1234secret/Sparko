import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { json } from '@sparko/db';
import { DomainError, Snowflake } from '@sparko/contracts';
import {
  MessageDocumentSchema,
  compileMessage,
  getMessageActions,
  modeChangeLossReport,
  type MessageDocument,
} from '@sparko/messages';
import { type DomainContext, type DomainRoute } from './core.js';

const PublishSchema = z
  .object({
    channelId: Snowflake,
    document: MessageDocumentSchema.optional(),
    templateVersionId: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.document) !== Boolean(b.templateVersionId), {
    message: 'Choose a message design or one saved version.',
  });
const UpdateSchema = z.object({
  expectedRevision: z.number().int().min(1),
  document: MessageDocumentSchema,
  replace: z.boolean().default(false),
});

/** Only action meaning and valid choice values define an issued control's identity. */
export function publicationControlSignature(document: MessageDocument) {
  return JSON.stringify(
    getMessageActions(document)
      .map((control) => ({
        key: control.key,
        action: control.action,
        choices: control.choices ?? [],
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  );
}
export function publicationChangeReport(
  previous: MessageDocument,
  next: MessageDocument,
) {
  const report = modeChangeLossReport(previous, next.mode);
  const controlsChanged =
    publicationControlSignature(previous) !== publicationControlSignature(next);
  return {
    ...report,
    controlsChanged,
    replacementRequired: report.replacementRequired || controlsChanged,
  };
}

export async function publishDocument(
  ctx: DomainContext,
  channelId: string,
  input: MessageDocument,
  test = false,
  templateVersionId?: string,
) {
  const document = MessageDocumentSchema.parse(input);
  if (document.visibility !== 'public')
    throw new DomainError(
      'INVALID_INPUT',
      'Private designs require an actor-bound private response destination.',
    );
  if (templateVersionId) {
    const version = await ctx.tx.templateVersion.findFirst({
      where: {
        id: templateVersionId,
        template: { guildId: ctx.guildId, archived: false },
      },
    });
    if (
      !version ||
      JSON.stringify(MessageDocumentSchema.parse(version.document)) !==
        JSON.stringify(document)
    )
      throw new DomainError(
        'INVALID_INPUT',
        'The saved version does not match this message.',
      );
  }
  const publication = await ctx.tx.publication.create({
    data: {
      guildId: ctx.guildId,
      channelId,
      document: json(document),
      test,
      ...(templateVersionId ? { templateVersionId } : {}),
    },
  });
  const controls: Record<string, string> = {};
  for (const control of getMessageActions(document)) {
    const id = 'spk:ctl:' + randomBytes(18).toString('base64url');
    controls[control.key] = id;
    await ctx.tx.issuedControl.create({
      data: {
        id,
        guildId: ctx.guildId,
        publicationId: publication.id,
        key: control.key,
        action: json(control.action),
        ...(test ? { actorId: ctx.actor.userId } : {}),
      },
    });
  }
  compileMessage(document, {}, controls);
  await ctx.effect('publication.send', { publicationId: publication.id });
  return publication;
}

async function publication(ctx: DomainContext, id: string) {
  const value = await ctx.tx.publication.findFirst({
    where: { id, guildId: ctx.guildId },
  });
  if (!value)
    throw new DomainError('NOT_FOUND', 'Publication unavailable.', 404);
  return value;
}

export const publicationRoutes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/guilds/:guildId/templates',
    capability: 'templates.edit',
    handler: async (ctx) =>
      ctx.tx.template.findMany({
        where: { guildId: ctx.guildId, archived: false },
        include: { versions: { orderBy: { number: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/templates/:id/versions',
    capability: 'templates.edit',
    handler: async (ctx, _input, p) =>
      ctx.tx.templateVersion.findMany({
        where: {
          templateId: p['id'] ?? '',
          template: { guildId: ctx.guildId },
        },
        orderBy: { number: 'desc' },
        take: 100,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/templates',
    capability: 'templates.edit',
    schema: z.object({
      name: z.string().min(1).max(100),
      document: MessageDocumentSchema,
    }),
    handler: async (ctx, input) => {
      const b = z
        .object({ name: z.string(), document: MessageDocumentSchema })
        .parse(input);
      return ctx.tx.template.create({
        data: {
          guildId: ctx.guildId,
          name: b.name,
          versions: { create: { number: 1, document: json(b.document) } },
        },
        include: { versions: true },
      });
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/templates/:id/versions',
    capability: 'templates.edit',
    schema: z.object({
      expectedRevision: z.number().int().min(1),
      document: MessageDocumentSchema,
    }),
    handler: async (ctx, input, p) => {
      const b = z
        .object({
          expectedRevision: z.number(),
          document: MessageDocumentSchema,
        })
        .parse(input);
      const t = await ctx.tx.template.findFirst({
        where: { id: p['id'] ?? '', guildId: ctx.guildId, archived: false },
      });
      if (!t) throw new DomainError('NOT_FOUND', 'Template unavailable.', 404);
      if (t.revision !== b.expectedRevision)
        throw new DomainError('REVISION_CONFLICT', 'Template changed.', 409, {
          currentRevision: t.revision,
        });
      await ctx.tx.template.update({
        where: { id: t.id },
        data: { revision: { increment: 1 } },
      });
      return ctx.tx.templateVersion.create({
        data: {
          templateId: t.id,
          number: t.revision + 1,
          document: json(b.document),
        },
      });
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/messages/preview',
    capability: 'templates.edit',
    schema: z.object({
      document: MessageDocumentSchema,
      context: z.record(z.string(), z.string()).default({}),
    }),
    handler: async (_ctx, input) => {
      const b = z
        .object({
          document: MessageDocumentSchema,
          context: z.record(z.string(), z.string()),
        })
        .parse(input);
      const controls = Object.fromEntries(
        getMessageActions(b.document).map((c, i) => [
          c.key,
          `spk:ctl:demo${i}`,
        ]),
      );
      return {
        payload: compileMessage(b.document, b.context, controls),
        demo: true,
      };
    },
  },
  ...(['publish', 'test'] as const).map((mode) => ({
    method: 'POST' as const,
    path: '/guilds/:guildId/messages/' + mode,
    capability: 'messages.publish',
    schema: PublishSchema,
    handler: async (ctx: DomainContext, input: unknown) => {
      const b = PublishSchema.parse(input);
      let document = b.document;
      if (b.templateVersionId) {
        const version = await ctx.tx.templateVersion.findFirst({
          where: {
            id: b.templateVersionId,
            template: { guildId: ctx.guildId, archived: false },
          },
        });
        if (!version)
          throw new DomainError(
            'NOT_FOUND',
            'Saved message version unavailable.',
            404,
          );
        document = MessageDocumentSchema.parse(version.document);
      }
      if (!document)
        throw new DomainError('INVALID_INPUT', 'Choose a saved design.');
      return publishDocument(
        ctx,
        b.channelId,
        document,
        mode === 'test',
        b.templateVersionId,
      );
    },
  })),
  {
    method: 'GET',
    path: '/guilds/:guildId/publications',
    capability: 'messages.publish',
    handler: async (ctx) =>
      ctx.tx.publication.findMany({
        where: { guildId: ctx.guildId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/publications/:id/archive',
    capability: 'messages.publish',
    schema: z.object({ expectedRevision: z.number().int().min(1) }),
    handler: async (ctx, input, p) => {
      const b = z.object({ expectedRevision: z.number() }).parse(input),
        current = await publication(ctx, p['id'] ?? '');
      if (current.revision !== b.expectedRevision)
        throw new DomainError(
          'REVISION_CONFLICT',
          'Publication changed.',
          409,
          { currentRevision: current.revision },
        );
      await ctx.tx.issuedControl.updateMany({
        where: { publicationId: current.id, guildId: ctx.guildId },
        data: { revoked: true },
      });
      const changed = await ctx.tx.publication.update({
        where: { id: current.id },
        data: { state: 'archived', revision: { increment: 1 } },
      });
      await ctx.effect('publication.archive', { publicationId: current.id });
      return changed;
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/publications/:id/update',
    capability: 'messages.publish',
    schema: UpdateSchema,
    handler: async (ctx, input, p) => {
      const b = UpdateSchema.parse(input),
        current = await publication(ctx, p['id'] ?? '');
      if (b.document.visibility !== 'public')
        throw new DomainError(
          'INVALID_INPUT',
          'Private designs require a private response destination.',
        );
      if (
        current.revision !== b.expectedRevision ||
        ['archived', 'replaced'].includes(current.state)
      )
        throw new DomainError(
          'REVISION_CONFLICT',
          'Publication changed.',
          409,
          { currentRevision: current.revision },
        );
      const report = publicationChangeReport(
        MessageDocumentSchema.parse(current.document),
        b.document,
      );
      if (report.replacementRequired && !b.replace)
        throw new DomainError(
          'INVALID_INPUT',
          'Changing control meaning or output mode requires explicit replacement.',
          409,
          report,
        );
      if (b.replace) {
        await ctx.tx.issuedControl.updateMany({
          where: { publicationId: current.id, guildId: ctx.guildId },
          data: { revoked: true },
        });
        await ctx.tx.publication.update({
          where: { id: current.id },
          data: { state: 'replaced', revision: { increment: 1 } },
        });
        await ctx.effect('publication.archive', { publicationId: current.id });
        return publishDocument(
          ctx,
          current.channelId,
          b.document,
          current.test,
        );
      }
      if (!current.messageId || current.state !== 'applied')
        throw new DomainError(
          'REVISION_CONFLICT',
          'Wait for the current delivery before editing this publication.',
          409,
        );
      const issued = await ctx.tx.issuedControl.findMany({
        where: { publicationId: current.id, revoked: false },
      });
      compileMessage(
        b.document,
        {},
        Object.fromEntries(issued.map((c) => [c.key, c.id])),
      );
      const changed = await ctx.tx.publication.update({
        where: { id: current.id },
        data: {
          document: json(b.document),
          templateVersionId: null,
          revision: { increment: 1 },
          state: 'pending',
        },
      });
      await ctx.effect('publication.update', { publicationId: current.id });
      return changed;
    },
  },
];
