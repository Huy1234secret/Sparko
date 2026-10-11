import { z } from 'zod';
import { Snowflake, Timezone, Revision, DomainError } from '@sparko/contracts';
import { allowed } from '@sparko/policy';
import { MessageDocumentSchema, type MessageDocument } from '@sparko/messages';
import {
  createRecord,
  getRecord,
  jsonObject,
  updateRecord,
  type DomainRoute,
  type DomainContext,
} from './core.js';

import {
  RecurrenceSchema,
  PollSchema,
  EventSchema,
  ReminderSchema,
  BirthdaySchema,
  ScheduleSchema,
  ReplySchema,
  StickySchema,
  WorkflowStepSchema,
  WorkflowSchema,
  CustomCommandSchema,
  automationConfigSchemas,
  DestinationSchema as destination,
} from '@sparko/contracts';
export {
  RecurrenceSchema,
  PollSchema,
  EventSchema,
  ReminderSchema,
  BirthdaySchema,
  ScheduleSchema,
  ReplySchema,
  StickySchema,
  WorkflowStepSchema,
  WorkflowSchema,
  CustomCommandSchema,
  automationConfigSchemas,
} from '@sparko/contracts';
const roleIds = z.array(Snowflake).max(50).default([]);
const RevisionInput = z.object({ expectedRevision: Revision });
function route(
  method: DomainRoute['method'],
  path: string,
  capability: string,
  schema: z.ZodType | undefined,
  handler: DomainRoute['handler'],
): DomainRoute {
  return {
    method,
    path: `/guilds/:guildId${path}`,
    capability,
    ...(schema ? { schema } : {}),
    handler,
  };
}
function arr(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((i): i is string => typeof i === 'string')
    : [];
}
function eligibility(ctx: DomainContext, roles: unknown) {
  if (arr(roles).some((r) => !ctx.actor.roles.includes(r)))
    throw new DomainError(
      'FORBIDDEN',
      'Your roles do not meet the eligibility rules.',
      403,
    );
}
function assertFuture(ctx: DomainContext, value: string) {
  if (Date.parse(value) <= ctx.now.getTime())
    throw new DomainError('INVALID_INPUT', 'Choose a future instant.');
}
function owned(
  ctx: DomainContext,
  ownerId: string | null,
  capability?: string,
) {
  if (
    ownerId !== ctx.actor.userId &&
    !(capability && allowed(ctx.actor, capability))
  )
    throw new DomainError('FORBIDDEN', 'You cannot access this record.', 403);
}
async function cfg(ctx: DomainContext, id: string) {
  await ctx.requireFeature(id);
  return jsonObject(
    (
      await ctx.tx.featureConfig.findUnique({
        where: { guildId_featureId: { guildId: ctx.guildId, featureId: id } },
      })
    )?.config,
  );
}
async function list(ctx: DomainContext, kind: string, owner = false) {
  return ctx.tx.record.findMany({
    where: {
      guildId: ctx.guildId,
      kind,
      ...(owner ? { ownerId: ctx.actor.userId } : {}),
    },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });
}
async function immutableMessage(ctx: DomainContext, versionId: string) {
  const version = await ctx.tx.templateVersion.findFirst({
    where: {
      id: versionId,
      template: { guildId: ctx.guildId, archived: false },
    },
  });
  if (!version)
    throw new DomainError(
      'NOT_FOUND',
      'Choose an available template version.',
      404,
    );
  const doc = MessageDocumentSchema.parse(version.document);
  if (doc.visibility !== 'public')
    throw new DomainError(
      'FORBIDDEN',
      'Private templates cannot be posted as automation.',
      403,
    );
  return doc;
}
async function due(
  ctx: DomainContext,
  kind: string,
  id: string,
  revision: number,
  at: Date,
) {
  return ctx.effect('automation.due', { kind, id, revision }, at);
}
function pollDocument(
  id: string,
  poll: z.infer<typeof PollSchema>,
): MessageDocument {
  return MessageDocumentSchema.parse({
    schemaVersion: 1,
    mode: 'v2',
    name: 'Poll',
    blocks: [
      {
        type: 'text',
        text: `## ${poll.question}\nCloses <t:${Math.floor(Date.parse(poll.endsAt) / 1000)}:F>. Votes are stored with member IDs; this poll is not anonymous.`,
      },
      {
        type: 'controls',
        controls: [
          {
            type: 'select',
            key: 'poll:vote',
            placeholder: 'Choose your vote',
            minValues: 1,
            maxValues: poll.maxSelections,
            action: { type: 'vote.cast', pollId: id },
            options: poll.choices.map((label, index) => ({
              label,
              value: String(index),
            })),
          },
        ],
      },
    ],
  });
}
async function send(
  ctx: DomainContext,
  recordId: string,
  featureId: string,
  destinationValue: z.infer<typeof destination>,
  content: string,
  extra: Record<string, unknown> = {},
) {
  return ctx.effect('automation.send', {
    recordId,
    featureId,
    destination: destinationValue,
    text: content,
    actorId: ctx.actor.userId,
    ...extra,
  });
}
export const automationRoutes: DomainRoute[] = [
  route('GET', '/polls', 'member', undefined, async (ctx) => {
    const polls = await list(ctx, 'poll');
    return Promise.all(
      polls.map(async (poll) => {
        const data = jsonObject(poll.data),
          votes = await ctx.tx.record.findMany({
            where: {
              guildId: ctx.guildId,
              kind: 'poll_vote',
              key: { startsWith: `${poll.id}:` },
            },
          });
        const visible =
          data['resultsVisibility'] === 'public' ||
          (data['resultsVisibility'] === 'after_close' &&
            poll.state === 'closed') ||
          allowed(ctx.actor, 'community.manage');
        const own = votes.find((v) => v.ownerId === ctx.actor.userId);
        const choices = Array.isArray(data['choices']) ? data['choices'] : [];
        return {
          ...poll,
          myVote: jsonObject(own?.data)['choices'] ?? [],
          results: visible
            ? choices.map((choice, i) => ({
                choice,
                votes: votes.filter(
                  (v) =>
                    Array.isArray(jsonObject(v.data)['choices']) &&
                    (jsonObject(v.data)['choices'] as unknown[]).includes(i),
                ).length,
              }))
            : null,
          voterCount: visible ? votes.length : null,
        };
      }),
    );
  }),
  route(
    'POST',
    '/polls',
    'community.manage',
    PollSchema,
    async (ctx, input) => {
      await ctx.requireFeature('R33');
      const v = PollSchema.parse(input);
      assertFuture(ctx, v.endsAt);
      const poll = await createRecord(ctx, 'poll', v, { state: 'open' });
      await due(ctx, 'poll', poll.id, poll.revision, new Date(v.endsAt));
      if (v.channelId)
        await ctx.effect('automation.send', {
          recordId: poll.id,
          featureId: 'R33',
          destination: { type: 'channel', channelId: v.channelId },
          document: pollDocument(poll.id, v),
          actorId: ctx.actor.userId,
        });
      return poll;
    },
  ),
  route(
    'POST',
    '/polls/:id/votes',
    'member',
    z.object({
      choices: z.array(z.number().int().min(0).max(24)).min(1).max(25),
    }),
    async (ctx, input, p) => {
      await ctx.requireFeature('R33');
      const poll = await getRecord(ctx, 'poll', p['id']!),
        data = PollSchema.parse(poll.data),
        choices = z
          .object({
            choices: z.array(z.number().int().min(0).max(24)).min(1).max(25),
          })
          .parse(input).choices;
      if (poll.state !== 'open' || Date.parse(data.endsAt) <= ctx.now.getTime())
        throw new DomainError('INVALID_INPUT', 'Voting has closed.');
      eligibility(ctx, data.requiredRoleIds);
      if (
        new Set(choices).size !== choices.length ||
        choices.length > data.maxSelections ||
        choices.some((i) => i >= data.choices.length)
      )
        throw new DomainError(
          'INVALID_INPUT',
          'Choose valid options within the selection limit.',
        );
      const key = `${poll.id}:${ctx.actor.userId}`,
        old = await ctx.tx.record.findUnique({
          where: {
            guildId_kind_key: { guildId: ctx.guildId, kind: 'poll_vote', key },
          },
        });
      if (old && !data.allowChange)
        throw new DomainError(
          'INVALID_INPUT',
          'This poll does not allow vote changes.',
        );
      return old
        ? updateRecord(ctx, 'poll_vote', old.id, { choices }, old.revision)
        : createRecord(ctx, 'poll_vote', { choices }, { key });
    },
  ),
  route(
    'POST',
    '/polls/:id/close',
    'community.manage',
    RevisionInput,
    async (ctx, input, p) => {
      const poll = await getRecord(ctx, 'poll', p['id']!);
      if (poll.state !== 'open') return poll;
      return updateRecord(
        ctx,
        'poll',
        poll.id,
        { ...jsonObject(poll.data), closedAt: ctx.now.toISOString() },
        RevisionInput.parse(input).expectedRevision,
        'closed',
      );
    },
  ),
  route('GET', '/events', 'member', undefined, async (ctx) => {
    const events = await list(ctx, 'event');
    return Promise.all(
      events.map(async (event) => {
        const rsvps = await ctx.tx.record.findMany({
          where: {
            guildId: ctx.guildId,
            kind: 'rsvp',
            key: { startsWith: `${event.id}:` },
          },
        });
        return {
          ...event,
          attending: rsvps.filter((r) => r.state === 'attending').length,
          waiting: rsvps.filter((r) => r.state === 'waitlist').length,
          myRsvp:
            rsvps.find((r) => r.ownerId === ctx.actor.userId)?.state ?? null,
        };
      }),
    );
  }),
  route(
    'POST',
    '/events',
    'community.manage',
    EventSchema,
    async (ctx, input) => {
      await ctx.requireFeature('R37');
      const v = EventSchema.parse(input);
      assertFuture(ctx, v.startsAt);
      const event = await createRecord(ctx, 'event', v, { state: 'scheduled' });
      await due(
        ctx,
        'event-reminder',
        event.id,
        event.revision,
        new Date(
          Math.max(
            ctx.now.getTime(),
            Date.parse(v.startsAt) - v.remindBeforeMinutes * 60000,
          ),
        ),
      );
      await due(
        ctx,
        'event-start',
        event.id,
        event.revision,
        new Date(v.startsAt),
      );
      await due(ctx, 'event-end', event.id, event.revision, new Date(v.endsAt));
      if (v.channelId)
        await send(
          ctx,
          event.id,
          'R37',
          { type: 'channel', channelId: v.channelId },
          `${v.title}\n${v.description}\nStarts <t:${Math.floor(Date.parse(v.startsAt) / 1000)}:F> (${v.timezone}). RSVP in the Sparko member portal.`,
        );
      return event;
    },
  ),
  route(
    'PUT',
    '/events/:id',
    'community.manage',
    z.object({ event: EventSchema, expectedRevision: Revision }),
    async (ctx, input, p) => {
      const v = z
          .object({ event: EventSchema, expectedRevision: Revision })
          .parse(input),
        old = await getRecord(ctx, 'event', p['id']!);
      if (old.state !== 'scheduled')
        throw new DomainError(
          'INVALID_INPUT',
          'Only scheduled events can be edited.',
        );
      assertFuture(ctx, v.event.startsAt);
      const attending = await ctx.tx.record.count({
        where: {
          guildId: ctx.guildId,
          kind: 'rsvp',
          key: { startsWith: `${old.id}:` },
          state: 'attending',
        },
      });
      if (v.event.capacity < attending)
        throw new DomainError(
          'INVALID_INPUT',
          'Capacity cannot be lower than confirmed RSVPs.',
        );
      const result = await updateRecord(
        ctx,
        'event',
        old.id,
        v.event,
        v.expectedRevision,
      );
      await due(
        ctx,
        'event-reminder',
        old.id,
        result.revision,
        new Date(
          Math.max(
            ctx.now.getTime(),
            Date.parse(v.event.startsAt) - v.event.remindBeforeMinutes * 60000,
          ),
        ),
      );
      await due(
        ctx,
        'event-start',
        old.id,
        result.revision,
        new Date(v.event.startsAt),
      );
      await due(
        ctx,
        'event-end',
        old.id,
        result.revision,
        new Date(v.event.endsAt),
      );
      return result;
    },
  ),
  route(
    'POST',
    '/events/:id/rsvp',
    'member',
    z.object({ choice: z.enum(['attending', 'declined']) }),
    async (ctx, input, p) => {
      await ctx.requireFeature('R37');
      const event = await getRecord(ctx, 'event', p['id']!),
        data = EventSchema.parse(event.data);
      if (
        event.state !== 'scheduled' ||
        Date.parse(data.startsAt) <= ctx.now.getTime()
      )
        throw new DomainError('INVALID_INPUT', 'RSVP is closed.');
      eligibility(ctx, data.requiredRoleIds);
      const choice = z
          .object({ choice: z.enum(['attending', 'declined']) })
          .parse(input).choice,
        key = `${event.id}:${ctx.actor.userId}`,
        old = await ctx.tx.record.findUnique({
          where: {
            guildId_kind_key: { guildId: ctx.guildId, kind: 'rsvp', key },
          },
        });
      let state = choice as string;
      if (choice === 'attending' && old?.state !== 'attending') {
        const count = await ctx.tx.record.count({
          where: {
            guildId: ctx.guildId,
            kind: 'rsvp',
            key: { startsWith: `${event.id}:` },
            state: 'attending',
          },
        });
        state = count >= data.capacity ? 'waitlist' : 'attending';
      }
      const result = old
        ? await updateRecord(
            ctx,
            'rsvp',
            old.id,
            { eventId: event.id },
            old.revision,
            state,
          )
        : await createRecord(
            ctx,
            'rsvp',
            { eventId: event.id },
            { key, state },
          );
      if (old?.state === 'attending' && state === 'declined') {
        const next = await ctx.tx.record.findFirst({
          where: {
            guildId: ctx.guildId,
            kind: 'rsvp',
            key: { startsWith: `${event.id}:` },
            state: 'waitlist',
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (next) {
          await updateRecord(
            ctx,
            'rsvp',
            next.id,
            next.data,
            next.revision,
            'attending',
          );
          await send(
            ctx,
            event.id,
            'R37',
            { type: 'dm' },
            `A place opened for ${data.title}; your RSVP is now confirmed.`,
            { userId: next.ownerId, expectedRevision: event.revision },
          );
        }
      }
      return result;
    },
  ),
  route(
    'POST',
    '/events/:id/cancel',
    'community.manage',
    z.object({
      expectedRevision: Revision,
      reason: z.string().min(3).max(1000),
    }),
    async (ctx, input, p) => {
      const v = z
          .object({
            expectedRevision: Revision,
            reason: z.string().min(3).max(1000),
          })
          .parse(input),
        old = await getRecord(ctx, 'event', p['id']!);
      if (old.state === 'cancelled') return old;
      const result = await updateRecord(
        ctx,
        'event',
        old.id,
        { ...jsonObject(old.data), cancelReason: v.reason },
        v.expectedRevision,
        'cancelled',
      );
      const rsvps = await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'rsvp',
          key: { startsWith: `${old.id}:` },
          state: { in: ['attending', 'waitlist'] },
        },
        take: 1000,
      });
      for (const rsvp of rsvps)
        await send(
          ctx,
          old.id,
          'R37',
          { type: 'dm' },
          `Event cancelled: ${String(jsonObject(old.data)['title'])}. ${v.reason}`,
          {
            userId: rsvp.ownerId,
            allowCancelled: true,
            expectedRevision: result.revision,
          },
        );
      return result;
    },
  ),
  route('GET', '/reminders', 'member', undefined, (ctx) =>
    list(ctx, 'reminder', true),
  ),
  route('POST', '/reminders', 'member', ReminderSchema, async (ctx, input) => {
    const configuration = await cfg(ctx, 'R66'),
      v = ReminderSchema.parse(input);
    assertFuture(ctx, v.dueAt);
    if (
      v.destination.type === 'channel' &&
      !allowed(ctx.actor, 'automation.manage')
    )
      throw new DomainError(
        'FORBIDDEN',
        'Server reminders require automation management.',
        403,
      );
    const count = await ctx.tx.record.count({
      where: {
        guildId: ctx.guildId,
        kind: 'reminder',
        ownerId: ctx.actor.userId,
        state: 'active',
      },
    });
    if (count >= Number(configuration['maximumActive'] ?? 10))
      throw new DomainError(
        'RATE_LIMITED',
        'Your reminder limit was reached.',
        429,
      );
    const record = await createRecord(ctx, 'reminder', {
      ...v,
      nextAt: v.dueAt,
    });
    await due(ctx, 'reminder', record.id, record.revision, new Date(v.dueAt));
    return record;
  }),
  route(
    'POST',
    '/reminders/:id/cancel',
    'member',
    RevisionInput,
    async (ctx, input, p) => {
      const old = await getRecord(ctx, 'reminder', p['id']!);
      owned(ctx, old.ownerId, 'automation.manage');
      return updateRecord(
        ctx,
        'reminder',
        old.id,
        old.data,
        RevisionInput.parse(input).expectedRevision,
        'cancelled',
      );
    },
  ),
  route('GET', '/birthday', 'member', undefined, async (ctx) =>
    ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: ctx.guildId,
          kind: 'birthday',
          key: ctx.actor.userId,
        },
      },
    }),
  ),
  route('PUT', '/birthday', 'member', BirthdaySchema, async (ctx, input) => {
    const conf = await cfg(ctx, 'R38'),
      v = BirthdaySchema.parse(input),
      next = nextBirthdayInstant(ctx.now, v, Number(conf['hour'] ?? 9)),
      old = await ctx.tx.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: ctx.guildId,
            kind: 'birthday',
            key: ctx.actor.userId,
          },
        },
      });
    const data = { ...v, nextAt: next.toISOString() },
      record = old
        ? await updateRecord(
            ctx,
            'birthday',
            old.id,
            data,
            old.revision,
            'active',
          )
        : await createRecord(ctx, 'birthday', data, { key: ctx.actor.userId });
    await due(ctx, 'birthday', record.id, record.revision, next);
    return record;
  }),
  route('DELETE', '/birthday', 'member', undefined, async (ctx) => {
    const old = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: ctx.guildId,
          kind: 'birthday',
          key: ctx.actor.userId,
        },
      },
    });
    if (old) await ctx.tx.record.delete({ where: { id: old.id } });
    return { deleted: !!old };
  }),
  route('GET', '/voice-rooms', 'member', undefined, (ctx) =>
    list(ctx, 'voice_room', !allowed(ctx.actor, 'community.manage')),
  ),
  route(
    'POST',
    '/voice-rooms/:id/control',
    'member',
    z.object({
      expectedRevision: Revision,
      action: z.enum([
        'rename',
        'limit',
        'lock',
        'unlock',
        'transfer',
        'permit',
        'revoke',
        'delete',
      ]),
      name: z.string().min(1).max(80).optional(),
      limit: z.number().int().min(0).max(99).optional(),
      userId: Snowflake.optional(),
      confirm: z.boolean().default(false),
    }),
    async (ctx, input, p) => {
      await ctx.requireFeature('R39');
      const v = z
          .object({
            expectedRevision: Revision,
            action: z.enum([
              'rename',
              'limit',
              'lock',
              'unlock',
              'transfer',
              'permit',
              'revoke',
              'delete',
            ]),
            name: z.string().min(1).max(80).optional(),
            limit: z.number().int().min(0).max(99).optional(),
            userId: Snowflake.optional(),
            confirm: z.boolean().default(false),
          })
          .parse(input),
        old = await getRecord(ctx, 'voice_room', p['id']!);
      owned(ctx, old.ownerId);
      if (old.state !== 'active')
        throw new DomainError('INVALID_INPUT', 'This room is not available.');
      if (
        (v.action === 'rename' && !v.name) ||
        (v.action === 'limit' && v.limit === undefined) ||
        (['transfer', 'permit', 'revoke'].includes(v.action) && !v.userId) ||
        (v.action === 'delete' && !v.confirm)
      )
        throw new DomainError(
          'INVALID_INPUT',
          'Supply and confirm the requested control.',
        );
      const data = jsonObject(old.data);
      const updated = await updateRecord(
        ctx,
        'voice_room',
        old.id,
        { ...data, pendingControl: v },
        v.expectedRevision,
        v.action === 'delete' ? 'deleting' : 'active',
      );
      await ctx.effect('automation.voice', {
        recordId: old.id,
        expectedRevision: updated.revision,
        channelId: data['channelId'],
        userId: ctx.actor.userId,
        control: v,
        featureId: 'R39',
      });
      return updated;
    },
  ),
  route('GET', '/invites', 'member', undefined, (ctx) =>
    list(ctx, 'invite_attribution', !allowed(ctx.actor, 'analytics.read')),
  ),
  route('GET', '/schedules', 'automation.manage', undefined, (ctx) =>
    list(ctx, 'schedule'),
  ),
  route(
    'POST',
    '/schedules',
    'automation.manage',
    ScheduleSchema,
    async (ctx, input) => {
      await ctx.requireFeature('R42');
      const v = ScheduleSchema.parse(input);
      assertFuture(ctx, v.dueAt);
      const document = await immutableMessage(ctx, v.templateVersionId),
        record = await createRecord(ctx, 'schedule', {
          ...v,
          document,
          nextAt: v.dueAt,
        });
      await due(ctx, 'schedule', record.id, record.revision, new Date(v.dueAt));
      return record;
    },
  ),
  route(
    'POST',
    '/schedules/:id/cancel',
    'automation.manage',
    RevisionInput,
    async (ctx, input, p) => {
      const old = await getRecord(ctx, 'schedule', p['id']!);
      return updateRecord(
        ctx,
        'schedule',
        old.id,
        old.data,
        RevisionInput.parse(input).expectedRevision,
        'cancelled',
      );
    },
  ),
  ...(
    [
      { path: 'replies', kind: 'reply', feature: 'R43', schema: ReplySchema },
      { path: 'sticky', kind: 'sticky', feature: 'R44', schema: StickySchema },
      {
        path: 'workflows',
        kind: 'workflow',
        feature: 'R45',
        schema: WorkflowSchema,
      },
      {
        path: 'custom-commands',
        kind: 'custom_command',
        feature: 'R46',
        schema: CustomCommandSchema,
      },
    ] as const
  ).flatMap((def) => [
    route('GET', `/${def.path}`, 'automation.manage', undefined, (ctx) =>
      list(ctx, def.kind),
    ),
    route(
      'POST',
      `/${def.path}`,
      'automation.manage',
      def.schema,
      async (ctx, input) => {
        await ctx.requireFeature(def.feature);
        const v = def.schema.parse(input),
          data = jsonObject(v);
        if (def.kind === 'sticky') {
          data['document'] = await immutableMessage(
            ctx,
            String(data['templateVersionId']),
          );
          const prior = await ctx.tx.record.findFirst({
            where: {
              guildId: ctx.guildId,
              kind: 'sticky',
              key: String(data['channelId']),
              state: 'active',
            },
          });
          if (prior)
            throw new DomainError(
              'INVALID_INPUT',
              'A sticky message already owns this channel.',
            );
        }
        if (def.kind === 'custom_command') {
          const count = await ctx.tx.record.count({
            where: {
              guildId: ctx.guildId,
              kind: 'custom_command',
              state: 'active',
            },
          });
          if (count >= 20)
            throw new DomainError(
              'INVALID_INPUT',
              'Maximum 20 custom commands per server.',
            );
          const workflow = await getRecord(
            ctx,
            'workflow',
            String(data['workflowId']),
          );
          if (workflow.state !== 'active')
            throw new DomainError(
              'INVALID_INPUT',
              'The workflow is not active.',
            );
          data['registrationState'] = 'pending';
        }
        const record = await createRecord(ctx, def.kind, data, {
          ...(def.kind === 'sticky'
            ? { key: String(data['channelId']) }
            : def.kind === 'custom_command'
              ? { key: String(data['name']) }
              : {}),
        });
        if (def.kind === 'custom_command')
          await ctx.effect('automation.custom.register', {
            recordId: record.id,
            expectedRevision: record.revision,
            featureId: 'R46',
            actorId: ctx.actor.userId,
          });
        return record;
      },
    ),
    route(
      'PUT',
      `/${def.path}/:id`,
      'automation.manage',
      z.object({ config: def.schema, expectedRevision: Revision }),
      async (ctx, input, p) => {
        await ctx.requireFeature(def.feature);
        const v = z
            .object({ config: def.schema, expectedRevision: Revision })
            .parse(input),
          old = await getRecord(ctx, def.kind, p['id']!),
          previous = jsonObject(old.data),
          data = jsonObject(v.config);
        if (old.state !== 'active')
          throw new DomainError(
            'INVALID_INPUT',
            'Only active configurations can be edited.',
          );
        if (def.kind === 'sticky') {
          if (data['channelId'] !== previous['channelId'])
            throw new DomainError(
              'INVALID_INPUT',
              'Create a new sticky configuration to change its channel.',
            );
          data['document'] = await immutableMessage(
            ctx,
            String(data['templateVersionId']),
          );
          data['currentMessageId'] = previous['currentMessageId'] ?? null;
        }
        if (def.kind === 'custom_command') {
          if (data['name'] !== previous['name'])
            throw new DomainError(
              'INVALID_INPUT',
              'Create a new custom command to change its name.',
            );
          const workflow = await getRecord(
            ctx,
            'workflow',
            String(data['workflowId']),
          );
          if (workflow.state !== 'active')
            throw new DomainError('INVALID_INPUT', 'The workflow is disabled.');
          data['registrationState'] = 'pending';
        }
        const result = await updateRecord(
          ctx,
          def.kind,
          old.id,
          data,
          v.expectedRevision,
        );
        if (def.kind === 'custom_command')
          await ctx.effect('automation.custom.register', {
            recordId: result.id,
            expectedRevision: result.revision,
            featureId: def.feature,
            actorId: ctx.actor.userId,
          });
        if (def.kind === 'sticky')
          await due(
            ctx,
            'sticky',
            result.id,
            result.revision,
            new Date(
              ctx.now.getTime() + Number(data['debounceSeconds'] ?? 15) * 1000,
            ),
          );
        return result;
      },
    ),
    route(
      'DELETE',
      `/${def.path}/:id`,
      'automation.manage',
      RevisionInput,
      async (ctx, input, p) => {
        const old = await getRecord(ctx, def.kind, p['id']!),
          record = await updateRecord(
            ctx,
            def.kind,
            old.id,
            old.data,
            RevisionInput.parse(input).expectedRevision,
            'disabled',
          );
        if (def.kind === 'custom_command')
          await ctx.effect('automation.custom.register', {
            recordId: record.id,
            expectedRevision: record.revision,
            featureId: 'R46',
            actorId: ctx.actor.userId,
          });
        return record;
      },
    ),
  ]),
  route(
    'POST',
    '/workflows/preview',
    'automation.manage',
    WorkflowSchema,
    async (_ctx, input) => {
      const workflow = WorkflowSchema.parse(input);
      return {
        valid: true,
        simulation: true,
        steps: workflow.steps,
        effectBudget: workflow.maxActions,
        effects: [],
      };
    },
  ),
  route(
    'POST',
    '/workflows/:id/execute',
    'automation.manage',
    undefined,
    async (ctx, _input, p) =>
      startWorkflow(ctx, p['id']!, {
        source: 'manual',
        id: ctx.operationId ?? 'manual',
        userId: ctx.actor.userId,
        roleIds: ctx.actor.roles,
        depth: 0,
      }),
  ),
  route('GET', '/workflow-runs', 'automation.manage', undefined, (ctx) =>
    list(ctx, 'workflow_run'),
  ),
  route(
    'POST',
    '/workflow-runs/:id/cancel',
    'automation.manage',
    RevisionInput,
    async (ctx, input, p) => {
      const old = await getRecord(ctx, 'workflow_run', p['id']!);
      return updateRecord(
        ctx,
        'workflow_run',
        old.id,
        old.data,
        RevisionInput.parse(input).expectedRevision,
        'cancelled',
      );
    },
  ),
];

interface CalendarDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}
function localParts(instant: Date, timezone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const year = n('year'),
    month = n('month'),
    day = n('day');
  return {
    year,
    month,
    day,
    hour: n('hour'),
    minute: n('minute'),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}
function matches(p: CalendarDate, target: CalendarDate) {
  return (
    p.year === target.year &&
    p.month === target.month &&
    p.day === target.day &&
    p.hour === target.hour &&
    p.minute === target.minute
  );
}
/** DST: choose the first repeated instant; shift nonexistent local minutes forward to the first valid minute. */
export function localInstant(
  target: Omit<CalendarDate, 'weekday'>,
  timezone: string,
): Date {
  Timezone.parse(timezone);
  const nominal = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
    ),
    offsets = new Set<number>();
  for (const hours of [-24, -12, 0, 12, 24]) {
    const instant = new Date(nominal + hours * 3600000),
      p = localParts(instant, timezone);
    offsets.add(
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) -
        instant.getTime(),
    );
  }
  for (let shift = 0; shift <= 180; shift++) {
    const shifted = new Date(nominal + shift * 60000),
      wanted = {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        weekday: shifted.getUTCDay(),
      };
    const candidates = [...offsets]
      .map((offset) => new Date(shifted.getTime() - offset))
      .filter((candidate) => matches(localParts(candidate, timezone), wanted))
      .sort((a, b) => a.getTime() - b.getTime());
    if (candidates[0]) return candidates[0];
  }
  throw new DomainError(
    'INVALID_INPUT',
    'This local date cannot be resolved in the selected timezone.',
  );
}
export function nextRecurringInstant(
  after: Date,
  timezone: string,
  recurrence: z.infer<typeof RecurrenceSchema>,
): Date | null {
  if (recurrence.type === 'once') return null;
  const today = localParts(after, timezone);
  for (let i = 0; i <= 8; i++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    if (recurrence.type === 'weekly' && date.getUTCDay() !== recurrence.weekday)
      continue;
    const candidate = localInstant(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: recurrence.hour,
        minute: recurrence.minute,
      },
      timezone,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new DomainError(
    'INVALID_INPUT',
    'Could not determine the next recurrence.',
  );
}
export function nextBirthdayInstant(
  after: Date,
  birthday: z.infer<typeof BirthdaySchema>,
  hour = 9,
) {
  const current = localParts(after, birthday.timezone);
  for (let year = current.year; year <= current.year + 8; year++) {
    let month = birthday.month,
      day = birthday.day;
    if (
      month === 2 &&
      day === 29 &&
      new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1
    ) {
      if (birthday.leapDayPolicy === 'leap_only') continue;
      month = birthday.leapDayPolicy === 'march1' ? 3 : 2;
      day = birthday.leapDayPolicy === 'march1' ? 1 : 28;
    }
    const candidate = localInstant(
      { year, month, day, hour, minute: 0 },
      birthday.timezone,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new DomainError(
    'INVALID_INPUT',
    'Could not determine the next birthday.',
  );
}

const DueInput = z.object({
  kind: z.enum([
    'poll',
    'event-reminder',
    'event-start',
    'event-end',
    'reminder',
    'birthday',
    'birthday-role-expire',
    'schedule',
    'sticky',
    'voice-cleanup',
    'invite-reward',
    'workflow',
  ]),
  id: z.string().uuid(),
  revision: z.number().int().min(1),
});
const dueFeature: Record<string, string> = {
  poll: 'R33',
  'event-reminder': 'R37',
  'event-start': 'R37',
  'event-end': 'R37',
  reminder: 'R66',
  birthday: 'R38',
  'birthday-role-expire': 'R38',
  schedule: 'R42',
  sticky: 'R44',
  'voice-cleanup': 'R39',
  'invite-reward': 'R41',
  workflow: 'R45',
};
export async function processAutomationDue(
  ctx: DomainContext,
  type: string,
  payload: unknown,
) {
  if (type !== 'automation.due')
    throw new DomainError('INVALID_INPUT', 'Unsupported automation job.');
  const input = DueInput.parse(payload),
    kind = input.kind.startsWith('event-')
      ? 'event'
      : input.kind === 'voice-cleanup'
        ? 'voice_room'
        : input.kind === 'invite-reward'
          ? 'invite_attribution'
          : input.kind === 'workflow'
            ? 'workflow_run'
            : input.kind === 'birthday-role-expire'
              ? 'birthday_role'
              : input.kind;
  const record = await ctx.tx.record.findFirst({
    where: { guildId: ctx.guildId, kind, id: input.id },
  });
  if (
    !record ||
    (input.kind !== 'birthday-role-expire' &&
      record.revision !== input.revision) ||
    [
      'cancelled',
      'disabled',
      'deleted',
      'closed',
      'completed',
      'failed',
    ].includes(record.state)
  )
    return {
      ignored: true,
      reason: 'Cancelled, removed, completed, or superseded',
    };
  const feature = dueFeature[input.kind]!,
    configuration = await cfg(ctx, feature),
    data = jsonObject(record.data),
    runKey = `${input.kind}:${record.id}:${record.revision}`;
  const previous = await ctx.tx.record.findUnique({
    where: {
      guildId_kind_key: {
        guildId: ctx.guildId,
        kind: 'automation_run',
        key: runKey,
      },
    },
  });
  if (previous) return { duplicate: true, runId: previous.id };
  const run = await createRecord(
    ctx,
    'automation_run',
    {
      sourceKind: input.kind,
      sourceId: record.id,
      scheduledRevision: record.revision,
      startedAt: ctx.now.toISOString(),
    },
    {
      key: runKey,
      ownerId: record.ownerId ?? ctx.actor.userId,
      state: 'running',
    },
  );
  if (input.kind === 'poll') {
    await updateRecord(
      ctx,
      'poll',
      record.id,
      { ...data, closedAt: ctx.now.toISOString() },
      record.revision,
      'closed',
    );
  } else if (input.kind === 'event-start') {
    const event = EventSchema.parse(data);
    const active = await updateRecord(
      ctx,
      'event',
      record.id,
      data,
      record.revision,
      'active',
    );
    await due(
      ctx,
      'event-end',
      record.id,
      active.revision,
      new Date(event.endsAt),
    );
  } else if (input.kind === 'event-end')
    await updateRecord(
      ctx,
      'event',
      record.id,
      { ...data, endedAt: ctx.now.toISOString() },
      record.revision,
      'completed',
    );
  else if (input.kind === 'event-reminder') {
    const event = EventSchema.parse(data);
    if (event.remindBeforeMinutes > 0) {
      const rsvps = await ctx.tx.record.findMany({
        where: {
          guildId: ctx.guildId,
          kind: 'rsvp',
          key: { startsWith: `${record.id}:` },
          state: 'attending',
        },
        take: 1000,
      });
      for (const rsvp of rsvps)
        await send(
          ctx,
          record.id,
          feature,
          { type: 'dm' },
          `${event.title} starts <t:${Math.floor(Date.parse(event.startsAt) / 1000)}:R> (${event.timezone}).`,
          { userId: rsvp.ownerId, runId: run.id },
        );
    }
  } else if (input.kind === 'reminder' || input.kind === 'schedule') {
    const when = Date.parse(String(data['nextAt'])),
      late = ctx.now.getTime() - when,
      skip = data['misfire'] === 'skip' && late > 300000;
    const recurrence = RecurrenceSchema.parse(data['recurrence']),
      next = nextRecurringInstant(
        ctx.now,
        String(data['timezone']),
        recurrence,
      );
    const recordData = {
      ...data,
      lastRunAt: ctx.now.toISOString(),
      nextAt: next?.toISOString() ?? null,
      lastMisfire: skip ? 'skipped' : null,
    };
    const updated = await updateRecord(
      ctx,
      kind,
      record.id,
      recordData,
      record.revision,
      next ? 'active' : 'completed',
    );
    if (next) await due(ctx, input.kind, record.id, updated.revision, next);
    if (!skip) {
      if (input.kind === 'reminder')
        await send(
          ctx,
          record.id,
          feature,
          destination.parse(data['destination']),
          String(data['text']),
          { userId: record.ownerId, runId: run.id },
        );
      else
        await ctx.effect('automation.send', {
          recordId: record.id,
          runId: run.id,
          featureId: feature,
          destination: { type: 'channel', channelId: data['channelId'] },
          document: MessageDocumentSchema.parse(data['document']),
          actorId: record.ownerId,
          templateVersionId: data['templateVersionId'],
        });
    }
  } else if (input.kind === 'birthday') {
    const birthday = BirthdaySchema.parse(data),
      next = nextBirthdayInstant(
        ctx.now,
        birthday,
        Number(configuration['hour'] ?? 9),
      ),
      updated = await updateRecord(
        ctx,
        'birthday',
        record.id,
        { ...data, nextAt: next.toISOString() },
        record.revision,
      );
    await due(ctx, 'birthday', record.id, updated.revision, next);
    if (birthday.visibility === 'public' && configuration['channelId'])
      await send(
        ctx,
        record.id,
        feature,
        {
          type: 'channel',
          channelId: Snowflake.parse(configuration['channelId']),
        },
        `Happy birthday to <@${record.ownerId}>!`,
        { userId: record.ownerId, runId: run.id },
      );
    else
      await send(
        ctx,
        record.id,
        feature,
        { type: 'dm' },
        'Happy birthday! Your birthday is private unless you choose public sharing.',
        { userId: record.ownerId, runId: run.id },
      );
    if (birthday.visibility === 'public' && configuration['roleId']) {
      const instance = await createRecord(
        ctx,
        'birthday_role',
        {
          birthdayId: record.id,
          userId: record.ownerId,
          roleId: configuration['roleId'],
          expiresAt: new Date(
            ctx.now.getTime() +
              Number(configuration['roleDurationHours'] ?? 24) * 3600000,
          ).toISOString(),
          runId: run.id,
        },
        { ownerId: record.ownerId ?? ctx.actor.userId, state: 'pending' },
      );
      await ctx.effect('automation.role', {
        recordId: instance.id,
        userId: record.ownerId,
        roleId: configuration['roleId'],
        action: 'add',
        featureId: feature,
        instanceId: instance.id,
        actorId: record.ownerId,
      });
      await due(
        ctx,
        'birthday-role-expire',
        instance.id,
        instance.revision,
        new Date(String(jsonObject(instance.data)['expiresAt'])),
      );
    }
  } else if (input.kind === 'birthday-role-expire') {
    await ctx.effect('automation.role', {
      recordId: record.id,
      userId: data['userId'],
      roleId: data['roleId'],
      action: 'remove',
      featureId: feature,
      instanceId: record.id,
      onlyIfInstanceActive: true,
      actorId: record.ownerId,
    });
    await updateRecord(
      ctx,
      'birthday_role',
      record.id,
      data,
      record.revision,
      'expiring',
    );
  } else if (input.kind === 'sticky') {
    if (
      data['nextRepostAt'] &&
      Date.parse(String(data['nextRepostAt'])) > ctx.now.getTime()
    )
      return { ignored: true, reason: 'Debounced' };
    await ctx.effect('automation.send', {
      recordId: record.id,
      expectedRevision: record.revision,
      runId: run.id,
      featureId: feature,
      destination: { type: 'channel', channelId: data['channelId'] },
      document: data['document'],
      replaceMessageId: data['currentMessageId'] ?? null,
      sticky: true,
      actorId: record.ownerId,
    });
  } else if (input.kind === 'voice-cleanup') {
    await ctx.effect('automation.voice', {
      recordId: record.id,
      expectedRevision: record.revision,
      featureId: feature,
      channelId: data['channelId'],
      control: { action: 'cleanup' },
      requireFreshEmpty: true,
      observedOccupants: data['occupants'],
      actorId: record.ownerId,
    });
  } else if (input.kind === 'invite-reward') {
    if (record.state !== 'confirmed' || !data['inviterId'])
      return { ignored: true, reason: 'No confirmed attribution' };
    const member = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: ctx.guildId,
          kind: 'community.member',
          key: String(data['memberId']),
        },
      },
    });
    const memberData = jsonObject(member?.data);
    if (memberData['present'] !== true)
      return {
        ignored: true,
        reason: 'Member eligibility is unknown or member left',
      };
    const joinedAt = Date.parse(
        String(memberData['joinedAt'] ?? data['joinedAt']),
      ),
      accountAt = Date.parse(
        String(memberData['accountCreatedAt'] ?? data['accountCreatedAt']),
      );
    if (
      !Number.isFinite(joinedAt) ||
      !Number.isFinite(accountAt) ||
      ctx.now.getTime() - joinedAt <
        Number(configuration['minimumTenureHours']) * 3600000 ||
      ctx.now.getTime() - accountAt <
        Number(configuration['minimumAccountAgeDays']) * 86400000
    )
      return {
        ignored: true,
        reason: 'Tenure or account eligibility is not met',
      };
    const rewardKey = `${data['memberId']}:${data['inviterId']}`,
      prior = await ctx.tx.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: ctx.guildId,
            kind: 'invite_reward',
            key: rewardKey,
          },
        },
      });
    if (!prior) {
      const reward = await createRecord(
        ctx,
        'invite_reward',
        {
          attributionId: record.id,
          memberId: data['memberId'],
          inviterId: data['inviterId'],
          roleId: configuration['rewardRoleId'],
          earnedAt: ctx.now.toISOString(),
        },
        {
          key: rewardKey,
          ownerId: String(data['inviterId']),
          state: 'pending',
        },
      );
      await ctx.effect('automation.role', {
        recordId: reward.id,
        featureId: feature,
        userId: data['inviterId'],
        roleId: configuration['rewardRoleId'],
        action: 'add',
        attributionId: record.id,
        actorId: record.ownerId,
      });
    }
  } else if (input.kind === 'workflow') {
    await advanceWorkflow(ctx, record.id);
  }
  await updateRecord(
    ctx,
    'automation_run',
    run.id,
    { ...jsonObject(run.data), finishedAt: ctx.now.toISOString() },
    run.revision,
    'committed',
  );
  return { runId: run.id };
}

interface WorkflowSource {
  source: string;
  id: string;
  userId: string;
  roleIds: string[];
  depth: number;
}
export async function startWorkflow(
  ctx: DomainContext,
  workflowId: string,
  source: WorkflowSource,
) {
  await ctx.requireFeature('R45');
  if (source.depth > 0)
    throw new DomainError(
      'INVALID_INPUT',
      'Workflow recursion is unsupported.',
    );
  const workflow = await getRecord(ctx, 'workflow', workflowId);
  if (workflow.state !== 'active')
    throw new DomainError('INVALID_INPUT', 'This workflow is disabled.');
  const definition = WorkflowSchema.parse(workflow.data);
  if (definition.requiredRoleIds.some((r) => !source.roleIds.includes(r)))
    throw new DomainError(
      'FORBIDDEN',
      'Workflow role eligibility failed.',
      403,
    );
  const key = `${workflow.id}:${source.source}:${source.id}:${source.userId}`,
    old = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: { guildId: ctx.guildId, kind: 'workflow_run', key },
      },
    });
  if (old) return old;
  const run = await createRecord(
    ctx,
    'workflow_run',
    {
      workflowId: workflow.id,
      workflowRevision: workflow.revision,
      definition,
      source,
      cursor: 0,
      actions: 0,
      history: [],
      startedAt: ctx.now.toISOString(),
      deadline: new Date(ctx.now.getTime() + 7 * 86400000).toISOString(),
    },
    { key, ownerId: source.userId, state: 'running' },
  );
  await advanceWorkflow(ctx, run.id);
  return getRecord(ctx, 'workflow_run', run.id);
}
async function advanceWorkflow(ctx: DomainContext, id: string) {
  const record = await getRecord(ctx, 'workflow_run', id);
  if (record.state !== 'running') return;
  const data = jsonObject(record.data),
    definition = WorkflowSchema.parse(data['definition']),
    source = jsonObject(data['source']),
    userId = String(source['userId']),
    roles = arr(source['roleIds']),
    cursor = Number(data['cursor']),
    actions = Number(data['actions']);
  if (Date.parse(String(data['deadline'])) < ctx.now.getTime())
    return updateRecord(
      ctx,
      'workflow_run',
      id,
      { ...data, error: 'Workflow deadline exceeded' },
      record.revision,
      'failed',
    );
  const feature = await ctx.tx.featureConfig.findUnique({
    where: { guildId_featureId: { guildId: ctx.guildId, featureId: 'R45' } },
  });
  if (!jsonObject(feature?.config)['enabled'])
    return updateRecord(
      ctx,
      'workflow_run',
      id,
      { ...data, error: 'Feature disabled' },
      record.revision,
      'cancelled',
    );
  if (cursor >= definition.steps.length)
    return updateRecord(
      ctx,
      'workflow_run',
      id,
      { ...data, finishedAt: ctx.now.toISOString() },
      record.revision,
      'completed',
    );
  const step = definition.steps[cursor]!;
  if (step.type === 'branch') {
    const next = roles.includes(step.requiredRoleId)
      ? step.onMatch
      : step.onMiss;
    await updateRecord(
      ctx,
      'workflow_run',
      id,
      { ...data, cursor: next },
      record.revision,
    );
    return advanceWorkflow(ctx, id);
  }
  if (step.type === 'wait') {
    const next = await updateRecord(
      ctx,
      'workflow_run',
      id,
      {
        ...data,
        cursor: cursor + 1,
        waitingUntil: new Date(
          ctx.now.getTime() + step.seconds * 1000,
        ).toISOString(),
      },
      record.revision,
    );
    await due(
      ctx,
      'workflow',
      id,
      next.revision,
      new Date(String(jsonObject(next.data)['waitingUntil'])),
    );
    return next;
  }
  if (actions >= definition.maxActions)
    return updateRecord(
      ctx,
      'workflow_run',
      id,
      { ...data, error: 'Action budget exceeded' },
      record.revision,
      'failed',
    );
  const stepKey = `${id}:${cursor}`,
    previous = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: ctx.guildId,
          kind: 'workflow_step',
          key: stepKey,
        },
      },
    });
  if (previous) return;
  const execution = await createRecord(
    ctx,
    'workflow_step',
    { runId: id, index: cursor, step, userId },
    { key: stepKey, ownerId: userId, state: 'pending' },
  );
  const effectPayload = {
    runId: id,
    stepId: execution.id,
    stepIndex: cursor,
    recordId: id,
    featureId: 'R45',
    actorId: userId,
    userId,
    source,
    depth: 1,
  };
  if (step.type === 'send')
    await ctx.effect('automation.send', {
      ...effectPayload,
      destination: { type: 'channel', channelId: step.channelId },
      text: step.text,
    });
  else if (step.type === 'role')
    await ctx.effect('automation.role', {
      ...effectPayload,
      roleId: step.roleId,
      action: step.action,
    });
  else
    await ctx.effect('automation.ticket', {
      ...effectPayload,
      categoryId: step.categoryId,
    });
  return updateRecord(
    ctx,
    'workflow_run',
    id,
    { ...data, actions: actions + 1, pendingStepId: execution.id },
    record.revision,
  );
}
/** Call in the post-delivery transaction; a retry cannot rerun successful earlier steps. */
export async function completeAutomationEffect(
  ctx: DomainContext,
  payload: unknown,
  result: {
    success: boolean;
    error?: string;
    messageId?: string;
    channelId?: string;
  },
) {
  const p = jsonObject(payload);
  if (typeof p['stepId'] === 'string') {
    const step = await getRecord(ctx, 'workflow_step', p['stepId']);
    if (step.state === 'applied' || step.state === 'failed')
      return { duplicate: true };
    await updateRecord(
      ctx,
      'workflow_step',
      step.id,
      { ...jsonObject(step.data), result, finishedAt: ctx.now.toISOString() },
      step.revision,
      result.success ? 'applied' : 'failed',
    );
    const run = await getRecord(ctx, 'workflow_run', String(p['runId']));
    if (run.state !== 'running') return { cancelled: true };
    const data = jsonObject(run.data);
    if (data['pendingStepId'] !== step.id)
      throw new DomainError(
        'REVISION_CONFLICT',
        'Workflow step was superseded.',
        409,
      );
    await updateRecord(
      ctx,
      'workflow_run',
      run.id,
      {
        ...data,
        pendingStepId: null,
        cursor: Number(p['stepIndex']) + 1,
        ...(!result.success
          ? { error: result.error ?? 'Delivery failed' }
          : {}),
      },
      run.revision,
      result.success ? 'running' : 'failed',
    );
    if (result.success) await advanceWorkflow(ctx, run.id);
    return { advanced: result.success };
  }
  if (p['sticky'] && typeof p['recordId'] === 'string') {
    const sticky = await getRecord(ctx, 'sticky', p['recordId']);
    if (sticky.state !== 'active') return { cancelled: true };
    const d = jsonObject(sticky.data);
    return updateRecord(
      ctx,
      'sticky',
      sticky.id,
      {
        ...d,
        ...(result.success && result.messageId
          ? { currentMessageId: result.messageId, nextRepostAt: null }
          : { deliveryError: result.error ?? 'Delivery failed' }),
      },
      sticky.revision,
    );
  }
  return { recorded: false };
}
/** Worker must call immediately before a delivery, then freshly validate Discord permissions/resources. */
export async function guardAutomationEffect(
  ctx: DomainContext,
  payload: unknown,
) {
  const p = jsonObject(payload);
  if (typeof p['featureId'] === 'string')
    await ctx.requireFeature(p['featureId']);
  if (typeof p['recordId'] !== 'string')
    throw new DomainError(
      'INVALID_INPUT',
      'Automation delivery needs its source record.',
    );
  const record = await ctx.tx.record.findFirst({
    where: { guildId: ctx.guildId, id: p['recordId'] },
  });
  if (!record) return { deliver: false, reason: 'Source was removed' };
  if (
    ['cancelled', 'disabled', 'failed', 'deleted'].includes(record.state) &&
    p['allowCancelled'] !== true
  )
    return { deliver: false, reason: 'Source is inactive' };
  if (
    typeof p['expectedRevision'] === 'number' &&
    record.revision !== p['expectedRevision']
  )
    return { deliver: false, reason: 'Superseded revision' };
  if (
    p['allowCancelled'] === true &&
    (record.kind !== 'event' || record.state !== 'cancelled')
  )
    return {
      deliver: false,
      reason: 'Cancellation notice is no longer current',
    };
  if (typeof p['stepId'] === 'string') {
    const run = await getRecord(ctx, 'workflow_run', String(p['runId'])),
      step = await getRecord(ctx, 'workflow_step', p['stepId']);
    if (
      run.state !== 'running' ||
      step.state !== 'pending' ||
      jsonObject(run.data)['pendingStepId'] !== step.id
    )
      return { deliver: false, reason: 'Workflow stopped or step superseded' };
  }
  if (
    record.kind === 'birthday_role' &&
    p['action'] === 'add' &&
    Date.parse(String(jsonObject(record.data)['expiresAt'])) <=
      ctx.now.getTime()
  )
    return { deliver: false, reason: 'Role assignment already expired' };
  if (
    record.kind === 'voice_room' &&
    p['channelId'] !== jsonObject(record.data)['channelId']
  )
    throw new DomainError(
      'FORBIDDEN',
      'The action does not belong to this voice room.',
      403,
    );
  return { deliver: true, record };
}

const InviteSnapshot = z
  .array(
    z.object({
      code: z.string().min(1).max(100),
      uses: z.number().int().min(0),
      inviterId: Snowflake.optional(),
    }),
  )
  .max(1000)
  .refine(
    (v) => new Set(v.map((i) => i.code)).size === v.length,
    'Invite observations must contain unique codes',
  );
export const AutomationEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    id: Snowflake,
    userId: Snowflake,
    channelId: Snowflake,
    content: z.string().max(4000),
    roleIds,
    bot: z.boolean(),
    webhook: z.boolean(),
    generatedBySparko: z.boolean().default(false),
    at: z.iso.datetime(),
  }),
  z.object({
    type: z.literal('join'),
    id: z.string().min(1).max(100),
    userId: Snowflake,
    roleIds,
    bot: z.boolean(),
    joinedAt: z.iso.datetime(),
    accountCreatedAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal('voice'),
    id: z.string().min(1).max(100),
    userId: Snowflake,
    channelId: Snowflake.nullable(),
    previousChannelId: Snowflake.nullable(),
    occupants: z.array(Snowflake).max(100),
    memberName: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal('invite_join'),
    id: z.string().min(1).max(100),
    userId: Snowflake,
    joinedAt: z.iso.datetime(),
    accountCreatedAt: z.iso.datetime(),
    before: InviteSnapshot,
    after: InviteSnapshot,
    canReadInvites: z.boolean(),
    simultaneousJoins: z.number().int().min(1).max(1000),
    vanityChanged: z.boolean(),
    snapshotComplete: z.boolean(),
  }),
  z.object({
    type: z.literal('leave'),
    id: z.string().min(1).max(100),
    userId: Snowflake,
  }),
]);
export function attributeInvite(
  input: z.infer<typeof AutomationEventSchema> & { type: 'invite_join' },
) {
  if (!input.canReadInvites || !input.snapshotComplete)
    return {
      status: 'unknown' as const,
      reason: 'Invite observations or permission are unavailable',
    };
  if (input.simultaneousJoins !== 1 || input.vanityChanged)
    return {
      status: 'ambiguous' as const,
      reason: 'Simultaneous joins or vanity invite changes',
    };
  if (
    input.before.some(
      (previous) =>
        !input.after.some((current) => current.code === previous.code),
    )
  )
    return {
      status: 'ambiguous' as const,
      reason: 'An invite disappeared between observations',
    };
  const changed = input.after.filter((current) => {
    const previous = input.before.find((i) => i.code === current.code);
    return previous && current.uses !== previous.uses;
  });
  if (changed.length !== 1)
    return {
      status: changed.length ? ('ambiguous' as const) : ('unknown' as const),
      reason: 'No unique invite use increase',
    };
  const current = changed[0]!,
    previous = input.before.find((i) => i.code === current.code)!;
  if (
    current.uses - previous.uses !== 1 ||
    !current.inviterId ||
    current.inviterId !== previous.inviterId
  )
    return {
      status: 'ambiguous' as const,
      reason: 'Usage delta or inviter identity is uncertain',
    };
  if (current.inviterId === input.userId)
    return {
      status: 'unknown' as const,
      reason: 'Self invites are ineligible',
    };
  return {
    status: 'confirmed' as const,
    reason: 'One stable invite increased by exactly one',
    inviterId: current.inviterId,
    code: current.code,
  };
}
export async function ingestAutomationEvent(
  ctx: DomainContext,
  input: unknown,
) {
  const e = AutomationEventSchema.parse(input),
    sourceKey = `${e.type}:${e.id}`,
    existing = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: ctx.guildId,
          kind: 'automation_source',
          key: sourceKey,
        },
      },
    });
  if (existing) return { duplicate: true };
  await createRecord(
    ctx,
    'automation_source',
    { type: e.type, userId: e.userId, at: ctx.now.toISOString() },
    { key: sourceKey, ownerId: e.userId },
  );
  if (e.type === 'message') {
    if (e.bot || e.webhook || e.generatedBySparko) return { ignored: true };
    if (Math.abs(Date.parse(e.at) - ctx.now.getTime()) > 300000)
      return { ignored: true, reason: 'stale event' };
    const replyCfg = await ctx.tx.featureConfig.findUnique({
      where: { guildId_featureId: { guildId: ctx.guildId, featureId: 'R43' } },
    });
    if (jsonObject(replyCfg?.config)['enabled']) {
      const replies = await ctx.tx.record.findMany({
        where: { guildId: ctx.guildId, kind: 'reply', state: 'active' },
        take: 100,
      });
      let delivered = 0;
      for (const reply of replies) {
        if (delivered >= 3) break;
        const r = ReplySchema.parse(reply.data);
        if (
          (r.channelIds.length && !r.channelIds.includes(e.channelId)) ||
          r.excludedRoleIds.some((role) => e.roleIds.includes(role))
        )
          continue;
        const content = e.content.normalize('NFKC').toLocaleLowerCase(),
          pattern = r.pattern.normalize('NFKC').toLocaleLowerCase();
        if (
          !(r.match === 'exact'
            ? content === pattern
            : r.match === 'contains'
              ? content.includes(pattern)
              : content.startsWith(pattern))
        )
          continue;
        const key = `${reply.id}:${e.channelId}`,
          prior = await ctx.tx.record.findUnique({
            where: {
              guildId_kind_key: {
                guildId: ctx.guildId,
                kind: 'reply_cooldown',
                key,
              },
            },
          });
        if (
          prior &&
          Date.parse(String(jsonObject(prior.data)['until'])) >
            ctx.now.getTime()
        )
          continue;
        const d = {
          until: new Date(
            ctx.now.getTime() + r.cooldownSeconds * 1000,
          ).toISOString(),
        };
        if (prior)
          await updateRecord(
            ctx,
            'reply_cooldown',
            prior.id,
            d,
            prior.revision,
          );
        else await createRecord(ctx, 'reply_cooldown', d, { key });
        await send(
          ctx,
          reply.id,
          'R43',
          { type: 'channel', channelId: e.channelId },
          r.text,
          { sourceEventId: e.id, depth: 1, expectedRevision: reply.revision },
        );
        delivered++;
      }
    }
    const stickyCfg = await ctx.tx.featureConfig.findUnique({
      where: { guildId_featureId: { guildId: ctx.guildId, featureId: 'R44' } },
    });
    if (jsonObject(stickyCfg?.config)['enabled']) {
      const sticky = await ctx.tx.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: ctx.guildId,
            kind: 'sticky',
            key: e.channelId,
          },
        },
      });
      if (sticky?.state === 'active') {
        const data = jsonObject(sticky.data),
          at = new Date(
            ctx.now.getTime() + Number(data['debounceSeconds'] ?? 15) * 1000,
          );
        const updated = await updateRecord(
          ctx,
          'sticky',
          sticky.id,
          { ...data, nextRepostAt: at.toISOString(), lastSourceId: e.id },
          sticky.revision,
        );
        await due(ctx, 'sticky', sticky.id, updated.revision, at);
      }
    }
    await eventWorkflows(
      ctx,
      'message',
      {
        source: 'message',
        id: e.id,
        userId: e.userId,
        roleIds: e.roleIds,
        depth: 0,
      },
      e.channelId,
    );
    return { observed: true };
  }
  if (e.type === 'join') {
    if (!e.bot)
      await eventWorkflows(ctx, 'join', {
        source: 'join',
        id: e.id,
        userId: e.userId,
        roleIds: e.roleIds,
        depth: 0,
      });
    return { observed: true };
  }
  if (e.type === 'voice') {
    const config = await ctx.tx.featureConfig.findUnique({
        where: {
          guildId_featureId: { guildId: ctx.guildId, featureId: 'R39' },
        },
      }),
      raw = jsonObject(config?.config);
    if (!raw['enabled']) return { ignored: true };
    const configuration = automationConfigSchemas['R39']!.parse(raw) as {
      lobbyChannelId: string;
      categoryId?: string;
      nameTemplate: string;
      userLimit: number;
      cleanupDelaySeconds: number;
    };
    if (e.channelId === configuration.lobbyChannelId) {
      const prior = await ctx.tx.record.findFirst({
        where: {
          guildId: ctx.guildId,
          kind: 'voice_room',
          ownerId: e.userId,
          state: { in: ['creating', 'active'] },
        },
      });
      if (prior) return { roomId: prior.id };
      const room = await createRecord(
        ctx,
        'voice_room',
        {
          creatorId: e.userId,
          name: configuration.nameTemplate.replace('{member}', e.memberName),
          userLimit: configuration.userLimit,
          categoryId: configuration.categoryId ?? null,
          occupants: [],
          allowedUsers: [],
          channelId: null,
        },
        { ownerId: e.userId, state: 'creating' },
      );
      await ctx.effect('automation.voice', {
        recordId: room.id,
        expectedRevision: room.revision,
        userId: e.userId,
        featureId: 'R39',
        control: { action: 'create' },
        configuration,
        actorId: e.userId,
      });
      return { roomId: room.id };
    }
    if (e.previousChannelId) {
      const room = await ctx.tx.record.findFirst({
        where: {
          guildId: ctx.guildId,
          kind: 'voice_room',
          state: 'active',
          data: { path: ['channelId'], equals: e.previousChannelId },
        },
      });
      if (room) {
        const data = jsonObject(room.data),
          updated = await updateRecord(
            ctx,
            'voice_room',
            room.id,
            {
              ...data,
              occupants: e.occupants,
              occupantsObservedAt: ctx.now.toISOString(),
            },
            room.revision,
          );
        if (e.occupants.length === 0)
          await due(
            ctx,
            'voice-cleanup',
            room.id,
            updated.revision,
            new Date(
              ctx.now.getTime() + configuration.cleanupDelaySeconds * 1000,
            ),
          );
      }
    }
    return { observed: true };
  }
  if (e.type === 'invite_join') {
    const config = await ctx.tx.featureConfig.findUnique({
      where: { guildId_featureId: { guildId: ctx.guildId, featureId: 'R40' } },
    });
    if (!jsonObject(config?.config)['enabled']) return { ignored: true };
    const attribution = attributeInvite(e),
      record = await createRecord(
        ctx,
        'invite_attribution',
        {
          ...attribution,
          memberId: e.userId,
          joinedAt: e.joinedAt,
          accountCreatedAt: e.accountCreatedAt,
          evidence: {
            before: e.before,
            after: e.after,
            simultaneousJoins: e.simultaneousJoins,
            vanityChanged: e.vanityChanged,
          },
        },
        {
          key: e.id,
          ownerId:
            'inviterId' in attribution ? attribution.inviterId : e.userId,
          state: attribution.status,
        },
      );
    const reward = await ctx.tx.featureConfig.findUnique({
      where: { guildId_featureId: { guildId: ctx.guildId, featureId: 'R41' } },
    });
    if (
      attribution.status === 'confirmed' &&
      jsonObject(reward?.config)['enabled']
    )
      await due(
        ctx,
        'invite-reward',
        record.id,
        record.revision,
        new Date(
          Date.parse(e.joinedAt) +
            Number(jsonObject(reward?.config)['minimumTenureHours'] ?? 168) *
              3600000,
        ),
      );
    return record;
  }
  const rewards = await ctx.tx.record.findMany({
    where: {
      guildId: ctx.guildId,
      kind: 'invite_reward',
      state: { in: ['active', 'pending'] },
      data: { path: ['memberId'], equals: e.userId },
    },
    take: 100,
  });
  const config = await ctx.tx.featureConfig.findUnique({
    where: { guildId_featureId: { guildId: ctx.guildId, featureId: 'R41' } },
  });
  for (const reward of rewards) {
    const data = jsonObject(reward.data);
    await updateRecord(
      ctx,
      'invite_reward',
      reward.id,
      { ...data, leftAt: ctx.now.toISOString() },
      reward.revision,
      'reversed',
    );
    if (jsonObject(config?.config)['reverseOnLeave']) {
      const others = await ctx.tx.record.count({
        where: {
          guildId: ctx.guildId,
          kind: 'invite_reward',
          id: { not: reward.id },
          ownerId: reward.ownerId,
          state: { in: ['active', 'pending'] },
          data: { path: ['roleId'], equals: String(data['roleId']) },
        },
      });
      if (!others)
        await ctx.effect('automation.role', {
          recordId: reward.id,
          featureId: 'R41',
          userId: data['inviterId'],
          roleId: data['roleId'],
          action: 'remove',
          onlyIfInstanceActive: true,
          instanceId: reward.id,
          actorId: reward.ownerId,
        });
    }
  }
  return { reversed: rewards.length };
}
async function eventWorkflows(
  ctx: DomainContext,
  trigger: 'join' | 'message',
  source: WorkflowSource,
  channelId?: string,
) {
  const feature = await ctx.tx.featureConfig.findUnique({
    where: { guildId_featureId: { guildId: ctx.guildId, featureId: 'R45' } },
  });
  if (!jsonObject(feature?.config)['enabled']) return;
  const workflows = await ctx.tx.record.findMany({
    where: { guildId: ctx.guildId, kind: 'workflow', state: 'active' },
    take: 20,
  });
  let count = 0;
  for (const workflow of workflows) {
    const d = WorkflowSchema.parse(workflow.data);
    if (
      d.trigger !== trigger ||
      d.requiredRoleIds.some((r) => !source.roleIds.includes(r)) ||
      (trigger === 'message' &&
        d.channelIds.length &&
        (!channelId || !d.channelIds.includes(channelId)))
    )
      continue;
    if (count++ >= 3) break;
    await startWorkflow(ctx, workflow.id, source);
  }
}
export async function invokeCustomCommand(
  ctx: DomainContext,
  name: string,
  eventId: string,
) {
  await ctx.requireFeature('R46');
  const command = await ctx.tx.record.findUnique({
    where: {
      guildId_kind_key: {
        guildId: ctx.guildId,
        kind: 'custom_command',
        key: name,
      },
    },
  });
  if (!command || command.state !== 'active')
    throw new DomainError('NOT_FOUND', 'This command is unavailable.', 404);
  const data = CustomCommandSchema.parse(command.data);
  eligibility(ctx, data.requiredRoleIds);
  await createRecord(
    ctx,
    'custom_command_usage',
    { commandId: command.id, name, at: ctx.now.toISOString() },
    { key: `${command.id}:${eventId}`, ownerId: ctx.actor.userId },
  );
  return startWorkflow(ctx, data.workflowId, {
    source: 'custom',
    id: eventId,
    userId: ctx.actor.userId,
    roleIds: ctx.actor.roles,
    depth: 0,
  });
}
