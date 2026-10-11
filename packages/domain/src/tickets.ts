import { z } from 'zod';
import {
  TicketConfigSchema,
  TicketPrioritySchema,
  StaffAvailabilitySchema,
  DomainError,
  type TicketConfig,
} from '@sparko/contracts';
import { json } from '@sparko/db';
import { allowed } from '@sparko/policy';
import { type DomainContext, type DomainRoute, jsonObject } from './core.js';
export const ticketOpenSchema = z.object({
  categoryId: z.string().min(1),
  answers: z.record(z.string(), z.string().max(4000)).default({}),
});
const isStaffFor = (ctx: DomainContext, config: TicketConfig) =>
  allowed(ctx.actor, 'tickets.manage') ||
  config.staffRoleIds.some((id) => ctx.actor.roles.includes(id));
/** Staff of the server's current ticket configuration, for workflow pages. */
async function requireCurrentStaff(ctx: DomainContext) {
  const saved = await ctx.tx.featureConfig.findUnique({
    where: {
      guildId_featureId: { guildId: ctx.guildId, featureId: 'tickets' },
    },
  });
  const config = TicketConfigSchema.parse(saved?.config ?? {});
  if (!isStaffFor(ctx, config) && !allowed(ctx.actor, 'tickets.read'))
    throw new DomainError('FORBIDDEN', 'Only ticket staff can do this.', 403);
  return config;
}
const openStates = ['open', 'awaiting_staff', 'awaiting_member', 'claimed'];
const minutes = (from: Date, to: Date) =>
  (to.getTime() - from.getTime()) / 60000;
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
async function ticket(ctx: DomainContext, id: string, staff = false) {
  const t = await ctx.tx.ticket.findFirst({
    where: { id, guildId: ctx.guildId },
  });
  if (!t)
    throw new DomainError('NOT_FOUND', 'This ticket is unavailable.', 404);
  const config = TicketConfigSchema.parse(t.snapshot),
    isStaff = isStaffFor(ctx, config);
  if (
    staff
      ? !isStaff
      : !(
          isStaff ||
          allowed(ctx.actor, 'tickets.read') ||
          t.ownerId === ctx.actor.userId ||
          t.participants.includes(ctx.actor.userId)
        )
  )
    throw new DomainError('FORBIDDEN', 'This ticket is unavailable.', 403);
  return t;
}
export async function openTicket(ctx: DomainContext, input: unknown) {
  await ctx.requireFeature('tickets');
  const body = ticketOpenSchema.parse(input),
    saved = await ctx.tx.featureConfig.findUniqueOrThrow({
      where: {
        guildId_featureId: { guildId: ctx.guildId, featureId: 'tickets' },
      },
    }),
    config = TicketConfigSchema.parse(saved.config),
    category = config.categories.find((c) => c.id === body.categoryId);
  if (!category)
    throw new DomainError(
      'INVALID_INPUT',
      'Choose a published ticket category.',
    );
  for (const field of category.fields) {
    const value = body.answers[field.id] ?? '';
    if ((field.required && !value.trim()) || value.length > field.maxLength)
      throw new DomainError(
        'INVALID_INPUT',
        'Check your ticket answers.',
        400,
        { field: field.id },
      );
  }
  if (
    Object.keys(body.answers).some(
      (id) => !category.fields.some((f) => f.id === id),
    )
  )
    throw new DomainError(
      'INVALID_INPUT',
      'An answer does not belong to this form.',
    );
  const count = await ctx.tx.ticket.count({
    where: {
      guildId: ctx.guildId,
      ownerId: ctx.actor.userId,
      state: { notIn: ['closed', 'failed'] },
    },
  });
  if (count >= config.maxOpenPerMember)
    throw new DomainError(
      'INVALID_INPUT',
      'You have reached your open ticket limit.',
      409,
    );
  const last = await ctx.tx.ticket.aggregate({
    where: { guildId: ctx.guildId },
    _max: { number: true },
  });
  const t = await ctx.tx.ticket.create({
    data: {
      guildId: ctx.guildId,
      number: (last._max.number ?? 0) + 1,
      ownerId: ctx.actor.userId,
      snapshot: json(config),
      answers: json(body.answers),
      participants: [ctx.actor.userId],
    },
  });
  await ctx.effect('ticket.create', { ticketId: t.id });
  // Timers come from the creation snapshot; claiming the ticket makes them no-ops.
  for (const [stage, after] of [
    ['reminder', config.workflow.reminderMinutes],
    ['escalation', config.workflow.escalationMinutes],
  ] as const)
    if (after)
      await ctx.effect(
        'ticket.sla',
        { ticketId: t.id, stage },
        new Date(ctx.now.getTime() + after * 60000),
      );
  return t;
}
export async function claimTicket(
  ctx: DomainContext,
  id: string,
  expectedRevision: number,
) {
  const t = await ticket(ctx, id, true);
  if (
    t.revision !== expectedRevision ||
    t.claimantId ||
    !['open', 'awaiting_staff'].includes(t.state)
  )
    throw new DomainError(
      'REVISION_CONFLICT',
      'This ticket was already changed or claimed.',
      409,
      { currentRevision: t.revision },
    );
  return ctx.tx.ticket.update({
    where: { id: t.id },
    data: {
      claimantId: ctx.actor.userId,
      claimedAt: t.claimedAt ?? ctx.now,
      state: 'claimed',
      revision: { increment: 1 },
    },
  });
}
export const ticketRoutes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/guilds/:guildId/tickets',
    capability: 'member',
    handler: async (ctx) => {
      const staff =
        allowed(ctx.actor, 'tickets.read') ||
        allowed(ctx.actor, 'tickets.manage');
      return ctx.tx.ticket.findMany({
        where: {
          guildId: ctx.guildId,
          ...(!staff
            ? {
                OR: [
                  { ownerId: ctx.actor.userId },
                  { participants: { has: ctx.actor.userId } },
                  ...ctx.actor.roles.map((roleId) => ({
                    snapshot: {
                      path: ['staffRoleIds'],
                      array_contains: [roleId],
                    },
                  })),
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/tickets',
    capability: 'member',
    schema: ticketOpenSchema,
    handler: async (ctx, input) => openTicket(ctx, input),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/tickets/:id/claim',
    capability: 'member',
    schema: z.object({ expectedRevision: z.number().int().min(1) }),
    handler: async (ctx, input, params) =>
      claimTicket(
        ctx,
        params['id'] ?? '',
        z.object({ expectedRevision: z.number() }).parse(input)
          .expectedRevision,
      ),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/tickets/:id/close',
    capability: 'member',
    schema: z.object({
      expectedRevision: z.number().int().min(1),
      reason: z.string().min(1).max(1000),
    }),
    handler: async (ctx, input, params) => {
      const body = z
          .object({ expectedRevision: z.number(), reason: z.string() })
          .parse(input),
        t = await ticket(ctx, params['id'] ?? '');
      if (
        t.revision !== body.expectedRevision ||
        ['closed', 'closing', 'creating'].includes(t.state)
      )
        throw new DomainError(
          'REVISION_CONFLICT',
          'This ticket changed. Refresh before closing.',
          409,
        );
      const changed = await ctx.tx.ticket.update({
        where: { id: t.id },
        data: {
          state: 'closing',
          closeReason: body.reason,
          revision: { increment: 1 },
        },
      });
      await ctx.effect('ticket.capture', { ticketId: t.id });
      return changed;
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/tickets/:id/participants',
    capability: 'member',
    schema: z.object({
      expectedRevision: z.number().int().min(1),
      userId: z.string().regex(/^\d{17,20}$/),
      action: z.enum(['add', 'remove']),
    }),
    handler: async (ctx, input, params) => {
      const body = z
          .object({
            expectedRevision: z.number(),
            userId: z.string(),
            action: z.enum(['add', 'remove']),
          })
          .parse(input),
        t = await ticket(ctx, params['id'] ?? '', true);
      if (t.revision !== body.expectedRevision || body.userId === t.ownerId)
        throw new DomainError(
          'REVISION_CONFLICT',
          'This participant action is unavailable.',
          409,
        );
      const participants =
        body.action === 'add'
          ? [...new Set([...t.participants, body.userId])]
          : t.participants.filter((id) => id !== body.userId);
      const changed = await ctx.tx.ticket.update({
        where: { id: t.id },
        data: { participants, revision: { increment: 1 } },
      });
      await ctx.effect('ticket.participants', {
        ticketId: t.id,
        userId: body.userId,
        desired: body.action === 'add',
      });
      return changed;
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/tickets/:id/transcripts',
    capability: 'member',
    handler: async (ctx, _input, params) => {
      const t = await ticket(ctx, params['id'] ?? '');
      return ctx.tx.transcript.findMany({
        where: {
          guildId: ctx.guildId,
          ticketId: t.id,
          expiresAt: { gt: ctx.now },
        },
        select: {
          id: true,
          status: true,
          checksum: true,
          createdAt: true,
          expiresAt: true,
        },
      });
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/tickets/:id/transcripts/:assetId',
    capability: 'member',
    handler: async (ctx, _input, params) => {
      const t = await ticket(ctx, params['id'] ?? ''),
        transcript = await ctx.tx.transcript.findFirst({
          where: {
            id: params['assetId'] ?? '',
            guildId: ctx.guildId,
            ticketId: t.id,
            expiresAt: { gt: ctx.now },
          },
        });
      if (!transcript)
        throw new DomainError(
          'NOT_FOUND',
          'This transcript is unavailable.',
          404,
        );
      return { ...transcript, messages: jsonObject(transcript.messages) };
    },
  },
];
ticketRoutes.push(
  {
    method: 'GET',
    path: '/guilds/:guildId/tickets/categories',
    capability: 'member',
    handler: async (ctx) => {
      const c = await ctx.tx.featureConfig.findUnique({
        where: {
          guildId_featureId: { guildId: ctx.guildId, featureId: 'tickets' },
        },
      });
      return c ? TicketConfigSchema.parse(c.config).categories : [];
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/tickets/:id',
    capability: 'member',
    handler: async (ctx, _input, p) => ticket(ctx, p['id'] ?? ''),
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/tickets/:id/release',
    capability: 'member',
    schema: z.object({ expectedRevision: z.number().int().min(1) }),
    handler: async (ctx, input, p) => {
      const b = z.object({ expectedRevision: z.number() }).parse(input),
        t = await ticket(ctx, p['id'] ?? '', true);
      if (
        t.revision !== b.expectedRevision ||
        !t.claimantId ||
        t.state !== 'claimed'
      )
        throw new DomainError('REVISION_CONFLICT', 'This ticket changed.', 409);
      return ctx.tx.ticket.update({
        where: { id: t.id },
        data: { claimantId: null, state: 'open', revision: { increment: 1 } },
      });
    },
  },
);

const revisionOnly = z.object({ expectedRevision: z.number().int().min(1) });
function assertRevision(
  t: { revision: number; state: string },
  expected: number,
  states = openStates,
) {
  if (t.revision !== expected || !states.includes(t.state))
    throw new DomainError(
      'REVISION_CONFLICT',
      'This ticket changed. Refresh and try again.',
      409,
      { currentRevision: t.revision },
    );
}
ticketRoutes.push(
  {
    method: 'POST',
    path: '/guilds/:guildId/tickets/:id/priority',
    capability: 'member',
    schema: revisionOnly.extend({ priority: TicketPrioritySchema }),
    handler: async (ctx, input, p) => {
      const body = revisionOnly
          .extend({ priority: TicketPrioritySchema })
          .parse(input),
        t = await ticket(ctx, p['id'] ?? '', true);
      assertRevision(t, body.expectedRevision, [...openStates, 'creating']);
      return ctx.tx.ticket.update({
        where: { id: t.id },
        data: { priority: body.priority, revision: { increment: 1 } },
      });
    },
  },
  {
    method: 'POST',
    path: '/guilds/:guildId/tickets/:id/assign',
    capability: 'member',
    schema: revisionOnly.extend({
      assigneeId: z.string().regex(/^\d{17,20}$/),
    }),
    handler: async (ctx, input, p) => {
      const body = revisionOnly
          .extend({ assigneeId: z.string().regex(/^\d{17,20}$/) })
          .parse(input),
        t = await ticket(ctx, p['id'] ?? '', true);
      assertRevision(t, body.expectedRevision);
      // Only staff who marked themselves available can receive tickets.
      const availability = await ctx.tx.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: ctx.guildId,
            kind: 'staff_availability',
            key: body.assigneeId,
          },
        },
      });
      if (availability?.state !== 'available')
        throw new DomainError(
          'INVALID_INPUT',
          'Assign tickets only to staff who are marked available.',
          400,
          { field: 'assigneeId' },
        );
      if (body.assigneeId === t.ownerId)
        throw new DomainError(
          'INVALID_INPUT',
          'A ticket cannot be assigned to the member who opened it.',
          400,
          { field: 'assigneeId' },
        );
      return ctx.tx.ticket.update({
        where: { id: t.id },
        data: {
          claimantId: body.assigneeId,
          claimedAt: t.claimedAt ?? ctx.now,
          state: 'claimed',
          revision: { increment: 1 },
        },
      });
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/tickets/staff',
    capability: 'member',
    handler: async (ctx) => {
      await requireCurrentStaff(ctx);
      const [people, workload] = await Promise.all([
        ctx.tx.record.findMany({
          where: { guildId: ctx.guildId, kind: 'staff_availability' },
          orderBy: { updatedAt: 'desc' },
          take: 100,
        }),
        ctx.tx.ticket.groupBy({
          by: ['claimantId'],
          where: { guildId: ctx.guildId, state: 'claimed' },
          _count: { _all: true },
        }),
      ]);
      return people.map((person) => ({
        userId: person.key,
        status: person.state,
        note: String(jsonObject(person.data)['note'] ?? ''),
        updatedAt: person.updatedAt,
        claimed:
          workload.find((row) => row.claimantId === person.key)?._count._all ??
          0,
      }));
    },
  },
  {
    method: 'PUT',
    path: '/guilds/:guildId/tickets/staff/me',
    capability: 'member',
    schema: StaffAvailabilitySchema,
    handler: async (ctx, input) => {
      const config = await requireCurrentStaff(ctx);
      if (!isStaffFor(ctx, config))
        throw new DomainError(
          'FORBIDDEN',
          'Only ticket staff can set availability.',
          403,
        );
      const body = StaffAvailabilitySchema.parse(input);
      const saved = await ctx.tx.record.upsert({
        where: {
          guildId_kind_key: {
            guildId: ctx.guildId,
            kind: 'staff_availability',
            key: ctx.actor.userId,
          },
        },
        create: {
          guildId: ctx.guildId,
          kind: 'staff_availability',
          key: ctx.actor.userId,
          ownerId: ctx.actor.userId,
          state: body.status,
          data: json({ note: body.note }),
        },
        update: {
          state: body.status,
          data: json({ note: body.note }),
          revision: { increment: 1 },
        },
      });
      return { userId: saved.key, status: saved.state, note: body.note };
    },
  },
  {
    method: 'GET',
    path: '/guilds/:guildId/tickets/metrics',
    capability: 'member',
    handler: async (ctx) => {
      await requireCurrentStaff(ctx);
      const days = 30,
        since = new Date(ctx.now.getTime() - days * 86400000);
      const [current, recent] = await Promise.all([
        ctx.tx.ticket.groupBy({
          by: ['state', 'priority'],
          where: { guildId: ctx.guildId, state: { in: openStates } },
          _count: { _all: true },
        }),
        ctx.tx.ticket.findMany({
          where: { guildId: ctx.guildId, createdAt: { gte: since } },
          select: {
            createdAt: true,
            claimedAt: true,
            closedAt: true,
            claimantId: true,
            state: true,
            escalatedAt: true,
          },
          take: 5000,
        }),
      ]);
      const count = (match: (row: (typeof current)[number]) => boolean) =>
        current.filter(match).reduce((sum, row) => sum + row._count._all, 0);
      const perStaff = new Map<string, { claimed: number; closed: number }>();
      for (const row of recent) {
        if (!row.claimantId) continue;
        const entry = perStaff.get(row.claimantId) ?? { claimed: 0, closed: 0 };
        entry.claimed += 1;
        if (row.state === 'closed') entry.closed += 1;
        perStaff.set(row.claimantId, entry);
      }
      return {
        windowDays: days,
        definitions: {
          firstClaim:
            'Minutes from opening to the first staff claim or assignment, for tickets opened in the window.',
          resolution:
            'Minutes from opening to closing, for tickets opened and closed in the window.',
        },
        open: count(() => true),
        unclaimed: count((row) => row.state !== 'claimed'),
        urgent: count((row) => ['high', 'urgent'].includes(row.priority)),
        opened: recent.length,
        closed: recent.filter((row) => row.state === 'closed').length,
        escalated: recent.filter((row) => row.escalatedAt).length,
        medianFirstClaimMinutes: median(
          recent
            .filter((row) => row.claimedAt)
            .map((row) => minutes(row.createdAt, row.claimedAt!)),
        ),
        medianResolutionMinutes: median(
          recent
            .filter((row) => row.closedAt)
            .map((row) => minutes(row.createdAt, row.closedAt!)),
        ),
        staff: [...perStaff.entries()].map(([userId, value]) => ({
          userId,
          ...value,
        })),
      };
    },
  },
);
