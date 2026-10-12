import { createHash } from 'node:crypto';
import { DiscordAPIError, PermissionFlagsBits, Routes } from 'discord.js';
import { z } from 'zod';
import { json, type PrismaClient } from '@sparko/db';
import { DomainError, TicketConfigSchema, type Actor } from '@sparko/contracts';
import {
  Platform,
  completeAutomationEffect,
  featureActive,
  guardAutomationEffect,
  jsonObject,
  openTicket,
  processAutomationDue,
  processSafetyDue,
  PunishmentExpirySchema,
  publishDocument,
  runCommunityJob,
  canExpireTimeout,
  WorkflowSchema,
  runEconomyJob,
  beginRoleOrderDelivery,
  completeRoleOrder,
  reserveSourcePoll,
  pollSource,
  applySourceEvents,
  providerAvailability,
  prepareAiRequest,
  loadPreparedAiRequest,
  runAiProvider,
  completeAiRequest,
  createStripeCheckout,
  completeCheckout,
  runProviderJob,
} from '@sparko/domain';
import {
  BRAND_YELLOW,
  MessageDocumentSchema,
  compileMessage,
  getMessageActions,
  resolveCustomEmojis,
  type MessageDocument,
} from '@sparko/messages';
import { allowed } from '@sparko/policy';
import {
  DiscordRest,
  assertPermissions,
  assertRoleAssignable,
  effectivePermissions,
  type DiscordFile,
  type DiscordMessage,
} from './discord.js';
import { publicationFiles } from './attachments.js';
import { DeliveryUncertainError } from './failure.js';
import {
  archivedMessageComponents,
  publicationMatches,
} from './reconciliation.js';

/**
 * Use a configured design and append the module's required action row. An
 * invalid or over-limit combination falls back to the default design.
 */
function withActionRow(
  configured: unknown,
  row: Record<string, unknown>,
): MessageDocument | null {
  const parsed = MessageDocumentSchema.safeParse(configured);
  if (!parsed.success) return null;
  const combined = MessageDocumentSchema.safeParse({
    ...parsed.data,
    visibility: 'public',
    blocks: [...parsed.data.blocks, row],
  });
  return combined.success ? combined.data : null;
}

export type OutboxWork = {
  id: string;
  guildId: string;
  type: string;
  payload: unknown;
  attempts: number;
  fence: number;
  operationId?: string | null;
};
const ID = z.string().min(1);
const Snowflake = z.string().regex(/^[1-9][0-9]{16,19}$/);
const textPayload = (content: string) => ({
  content: content.slice(0, 2000),
  allowed_mentions: { parse: [] },
});
const nonce = (id: string) =>
  createHash('sha256').update(id).digest('hex').slice(0, 25);
function systemActor(guildId: string, userId: string): Actor {
  return {
    guildId,
    userId,
    roles: [],
    isAdmin: false,
    isOwner: false,
    capabilities: [],
    globalCapabilities: [],
  };
}
const sendPermissions =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.ReadMessageHistory;
function controlIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(controlIds);
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  return [
    ...(typeof object['custom_id'] === 'string' ? [object['custom_id']] : []),
    ...Object.values(object).flatMap(controlIds),
  ];
}

export class EffectExecutor {
  readonly platform: Platform;
  constructor(
    readonly db: PrismaClient,
    readonly discord: DiscordRest,
    readonly assertCurrent: () => Promise<void> = async () => undefined,
  ) {
    this.platform = new Platform(db);
  }
  private async record(guildId: string, id: unknown, kind?: string) {
    const record = await this.db.record.findFirst({
      where: { id: ID.parse(id), guildId, ...(kind ? { kind } : {}) },
    });
    if (!record)
      throw new DomainError(
        'NOT_FOUND',
        'The source record is unavailable.',
        404,
      );
    return record;
  }
  private async transaction(
    work: OutboxWork,
    task: Parameters<Platform['mutate']>[4],
  ) {
    await this.assertCurrent();
    return this.platform.mutate(
      systemActor(work.guildId, this.discord.botUserId),
      `worker:${work.type}`,
      work.id,
      work.payload,
      task,
    );
  }
  async execute(work: OutboxWork): Promise<void> {
    const p = jsonObject(work.payload);
    if (work.type === 'config.apply') {
      const heartbeat = await this.db.heartbeat.findUnique({
        where: { service: 'bot' },
      });
      if (
        !heartbeat ||
        heartbeat.status !== 'connected' ||
        Date.now() - heartbeat.updatedAt.getTime() > 45_000
      )
        throw new DomainError(
          'SERVICE_UNAVAILABLE',
          'Settings are saved. Waiting for the bot to connect.',
          503,
        );
      await this.discord.member(work.guildId, this.discord.botUserId);
      await this.db.featureConfig.updateMany({
        where: {
          guildId: work.guildId,
          featureId: ID.parse(p['featureId']),
          revision: z.number().int().parse(p['revision']),
        },
        data: { appliedRevision: z.number().int().parse(p['revision']) },
      });
      return;
    }
    if (work.type.startsWith('publication.')) {
      await this.publication(work, p);
      return;
    }
    if (work.type === 'ticket.create') {
      await this.createTicket(work, ID.parse(p['ticketId']));
      return;
    }
    if (work.type === 'ticket.capture') {
      await this.captureTicket(work, ID.parse(p['ticketId']));
      return;
    }
    if (work.type === 'ticket.welcome') {
      const ticket = await this.db.ticket.findFirst({
        where: { id: ID.parse(p['ticketId']), guildId: work.guildId },
      });
      if (!ticket?.channelId || ['closed', 'closing'].includes(ticket.state))
        return;
      await this.discord.channelPermissions(
        work.guildId,
        ticket.channelId,
        sendPermissions,
      );
      await this.sendTracked(
        work,
        ticket.channelId,
        textPayload(
          `Ticket #${ticket.number} is open. Your request is visible only to permitted support participants.\nStaff: use /ticket claim. Use /ticket close with a reason to request capture and closure.`,
        ),
      );
      return;
    }
    if (work.type === 'ticket.sla') {
      const stage = z.enum(['reminder', 'escalation']).parse(p['stage']);
      const ticket = await this.db.ticket.findFirst({
        where: { id: ID.parse(p['ticketId']), guildId: work.guildId },
      });
      // Claimed, closed or not-yet-created tickets need no nudge.
      if (
        !ticket?.channelId ||
        ticket.claimantId ||
        !['open', 'awaiting_staff'].includes(ticket.state) ||
        (stage === 'reminder' ? ticket.remindedAt : ticket.escalatedAt)
      )
        return;
      const { workflow, staffRoleIds } = TicketConfigSchema.parse(
        ticket.snapshot,
      );
      const roles =
        stage === 'escalation' && workflow.escalationRoleId
          ? [workflow.escalationRoleId]
          : staffRoleIds;
      const waited =
        stage === 'reminder'
          ? workflow.reminderMinutes
          : workflow.escalationMinutes;
      await this.discord.channelPermissions(
        work.guildId,
        ticket.channelId,
        sendPermissions,
      );
      // The tracked send is idempotent per job, so a retry never posts twice.
      await this.sendTracked(work, ticket.channelId, {
        content:
          `${roles.map((id) => `<@&${id}>`).join(' ')} Ticket #${ticket.number} has waited ${waited ?? '?'} minutes without a staff member.${stage === 'escalation' ? ' It is now high priority.' : ''}`.slice(
            0,
            2000,
          ),
        allowed_mentions: { parse: [], roles },
      });
      await this.db.ticket.updateMany({
        where: {
          id: ticket.id,
          claimantId: null,
          ...(stage === 'reminder'
            ? { remindedAt: null }
            : { escalatedAt: null }),
        },
        data:
          stage === 'reminder'
            ? { remindedAt: new Date() }
            : {
                escalatedAt: new Date(),
                ...(['low', 'normal'].includes(ticket.priority)
                  ? { priority: 'high' }
                  : {}),
                revision: { increment: 1 },
              },
      });
      return;
    }
    if (work.type === 'ticket.cleanup') {
      const ticket = await this.db.ticket.findFirst({
        where: { id: ID.parse(p['ticketId']), guildId: work.guildId },
      });
      if (!ticket?.channelId || ticket.state === 'closed') return;
      if (!['closing', 'capture_failed'].includes(ticket.state))
        throw new DomainError(
          'INVALID_INPUT',
          'This ticket is not awaiting cleanup.',
        );
      const config = TicketConfigSchema.parse(ticket.snapshot);
      const transcript = await this.db.transcript.findFirst({
        where: {
          ticketId: ticket.id,
          guildId: work.guildId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (
        !transcript ||
        (config.requireTranscriptBeforeCleanup &&
          transcript.status !== 'complete')
      )
        throw new DomainError(
          'INVALID_INPUT',
          'Some history was unavailable. The ticket channel has been retained.',
        );
      try {
        const resource = await this.discord.channelPermissions(
          work.guildId,
          ticket.channelId,
          PermissionFlagsBits.ManageChannels,
        );
        if (!resource.channel.topic?.includes(`sparko:ticket:${ticket.id}`))
          throw new DomainError(
            'FORBIDDEN',
            'This channel no longer carries its ticket identity.',
            403,
          );
        await this.discord.deleteChannel(ticket.channelId);
      } catch (error) {
        if (!(error instanceof DiscordAPIError && Number(error.code) === 10003))
          throw error;
      }
      await this.db.ticket.update({
        where: { id: ticket.id },
        data: { state: 'closed', closedAt: new Date() },
      });
      return;
    }
    if (work.type === 'ticket.participants') {
      const ticket = await this.db.ticket.findFirst({
        where: { id: ID.parse(p['ticketId']), guildId: work.guildId },
      });
      if (
        !ticket?.channelId ||
        !['open', 'claimed', 'awaiting_member', 'awaiting_staff'].includes(
          ticket.state,
        )
      )
        throw new DomainError('NOT_FOUND', 'The ticket is unavailable.', 404);
      const userId = Snowflake.parse(p['userId']);
      const desired = ticket.participants.includes(userId);
      if (desired !== p['desired']) return;
      await this.discord.channelPermissions(
        work.guildId,
        ticket.channelId,
        PermissionFlagsBits.ManageChannels,
      );
      if (desired)
        await this.discord.overwrite(ticket.channelId, userId, {
          type: 1,
          allow: sendPermissions.toString(),
          deny: '0',
        });
      else await this.discord.deleteOverwrite(ticket.channelId, userId);
      return;
    }
    if (
      [
        'community.giveaway.draw',
        'community.giveaway.claim-expire',
        'community.crate.drop',
        'community.crate.expire',
        'community.crate.schedule',
        'community.roles.expire',
        'community.analytics.retention',
      ].includes(work.type)
    ) {
      await this.transaction(work, (ctx) => runCommunityJob(ctx, work.type, p));
      return;
    }
    if (work.type === 'community.level.changed') {
      await this.transaction(work, async (ctx) =>
        ctx.tx.auditLog.create({
          data: {
            guildId: work.guildId,
            actorId: this.discord.botUserId,
            action: work.type,
            summary: json(p),
          },
        }),
      );
      return;
    }
    if (
      work.type === 'community.roles.reconcile' ||
      work.type === 'control.role'
    ) {
      await this.roles(work, p);
      return;
    }
    if (work.type === 'community.message') {
      await this.message(work, p);
      return;
    }
    if (work.type.startsWith('community.')) {
      await this.community(work, p);
      return;
    }
    if (work.type === 'control.channel.response') {
      const actor = await this.discord.actor(
        this.db,
        work.guildId,
        Snowflake.parse(p['actorId']),
      );
      if (
        !allowed(actor, 'messages.respond') &&
        !allowed(actor, 'messages.publish')
      )
        throw new DomainError(
          'FORBIDDEN',
          'Channel responses require current message publishing access.',
          403,
        );
      const channel = Snowflake.parse(p['channelId']);
      await this.discord.channelPermissions(
        work.guildId,
        channel,
        sendPermissions,
      );
      await this.sendTracked(
        work,
        channel,
        textPayload(z.string().parse(p['text'])),
      );
      return;
    }
    if (work.type === 'automation.due') {
      await this.transaction(work, (ctx) =>
        processAutomationDue(ctx, work.type, p),
      );
      return;
    }
    if (work.type.startsWith('automation.')) {
      await this.automation(work, p);
      return;
    }
    if (work.type.startsWith('safety.')) {
      await this.safety(work, p);
      return;
    }
    if (work.type.startsWith('economy.')) {
      await this.economy(work, p);
      return;
    }
    if (work.type.startsWith('provider.') || work.type.startsWith('billing.')) {
      await this.provider(work, p);
      return;
    }
    throw new DomainError(
      'INVALID_INPUT',
      `No delivery handler is installed for ${work.type}.`,
      400,
    );
  }

  private async publication(work: OutboxWork, p: Record<string, unknown>) {
    const publication = await this.db.publication.findFirst({
      where: { id: ID.parse(p['publicationId']), guildId: work.guildId },
      include: { controls: true },
    });
    if (!publication)
      throw new DomainError('NOT_FOUND', 'Publication unavailable.', 404);
    if (
      typeof p['revision'] === 'number' &&
      publication.revision !== p['revision']
    )
      return;
    if (work.operationId && work.type !== 'publication.archive') {
      const source = await this.db.operation.findFirst({
        where: { id: work.operationId, guildId: work.guildId },
      });
      if (!source)
        throw new DomainError(
          'FORBIDDEN',
          'This publication has no authorized source.',
          403,
        );
      if (source.actorId !== this.discord.botUserId) {
        const author = await this.discord.actor(
          this.db,
          work.guildId,
          source.actorId,
        );
        if (!allowed(author, 'messages.publish'))
          throw new DomainError(
            'FORBIDDEN',
            'The author no longer has message publishing access.',
            403,
          );
        if (work.type !== 'publication.archive')
          for (const control of getMessageActions(
            MessageDocumentSchema.parse(publication.document),
          )) {
            const capability =
              control.action.type === 'ticket.create'
                ? 'tickets.manage'
                : control.action.type.startsWith('role.')
                  ? 'community.manage'
                  : control.action.type === 'form.open'
                    ? 'forms.manage'
                    : control.action.type === 'workflow.run'
                      ? 'automation.manage'
                      : ['crate.claim', 'giveaway.enter', 'vote.cast'].includes(
                            control.action.type,
                          )
                        ? 'community.manage'
                        : 'messages.publish';
            if (!allowed(author, capability))
              throw new DomainError(
                'FORBIDDEN',
                'The author no longer has access to publish this control.',
                403,
              );
          }
      }
    }
    if (work.type === 'publication.archive') {
      try {
        await this.discord.channelPermissions(
          work.guildId,
          publication.channelId,
          sendPermissions,
        );
        const issuedIds = new Set(
          publication.controls.map((control) => control.id),
        );
        const message = await this.publicationMessage(
          work,
          publication,
          issuedIds,
          true,
        );
        if (!message) return;
        if (
          message.author.id !== this.discord.botUserId ||
          message.channel_id !== publication.channelId
        )
          throw new DomainError(
            'FORBIDDEN',
            'The tracked message is not owned by Sparko in this channel.',
            403,
          );
        await this.assertCurrent();
        await this.db.publication.updateMany({
          where: { id: publication.id, guildId: work.guildId, messageId: null },
          data: { messageId: message.id },
        });
        await this.discord.edit(publication.channelId, message.id, {
          components: archivedMessageComponents(
            message,
            issuedIds,
            (message.flags ?? 0) & 32768
              ? true
              : jsonObject(publication.document)['mode'] === 'v2',
          ),
        });
      } catch (error) {
        if (
          !(
            error instanceof DiscordAPIError &&
            [10003, 10008].includes(Number(error.code))
          )
        )
          throw error;
      }
      return;
    }
    if (publication.state === 'archived' || publication.state === 'replaced')
      return;
    if (
      work.type === 'publication.reconcile' &&
      publication.revision !== p['revision']
    )
      return;
    if (
      work.type !== 'publication.reconcile' &&
      ['missing', 'conflict'].includes(publication.state)
    )
      throw new DomainError(
        'INVALID_INPUT',
        'This message was removed or changed in Discord. Review it and explicitly replace the publication.',
      );
    const controls = Object.fromEntries(
      publication.controls
        .filter((control) => !control.revoked)
        .map((control) => [control.key, control.id]),
    );
    let document = MessageDocumentSchema.parse(publication.document);
    const hasCustomEmoji = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(hasCustomEmoji);
      if (!value || typeof value !== 'object') return false;
      const object = value as Record<string, unknown>;
      return (
        (Boolean(object['emoji']) &&
          typeof jsonObject(object['emoji'])['id'] === 'string') ||
        Object.values(object).some(hasCustomEmoji)
      );
    };
    if (hasCustomEmoji(document)) {
      const [emojis, bot] = await Promise.all([
        this.discord.emojis(work.guildId),
        this.discord.member(work.guildId, this.discord.botUserId),
      ]);
      document = resolveCustomEmojis(
        document,
        emojis
          .filter(
            (emoji) =>
              emoji.available &&
              (!emoji.roles.length ||
                emoji.roles.some(
                  (role) => role === work.guildId || bot.roles.includes(role),
                )),
          )
          .map((emoji) => emoji.id),
      );
    }
    const compiled = compileMessage(document, {}, controls);
    const files = await publicationFiles(this.db, work.guildId, document);
    const payload = {
      ...compiled,
      attachments: files.map((file, index) => ({
        id: index,
        filename: file.name,
      })),
    };
    if (work.type === 'publication.reconcile') {
      await this.reconcilePublication(work, publication, payload, files);
      return;
    }
    await this.discord.channelPermissions(
      work.guildId,
      publication.channelId,
      sendPermissions |
        (document.mode === 'embed' && document.embeds.length
          ? PermissionFlagsBits.EmbedLinks
          : 0n) |
        (files.length ? PermissionFlagsBits.AttachFiles : 0n),
    );
    let messageId = publication.messageId;
    if (!messageId && work.attempts > 1) {
      const expected = Object.values(controls);
      if (expected.length) {
        const messages = await this.discord.messages(publication.channelId);
        const matches = messages.filter(
          (message) =>
            message.author.id === this.discord.botUserId &&
            expected.every((id) => controlIds(message.components).includes(id)),
        );
        if (matches.length === 1) messageId = matches[0]?.id ?? null;
        if (matches.length > 1)
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'Multiple matching publications need owner reconciliation.',
            503,
          );
      }
    }
    if (messageId) {
      if (work.type === 'publication.update')
        await this.discord.edit(
          publication.channelId,
          messageId,
          document.mode === 'embed'
            ? { ...payload, content: compiled.content ?? '' }
            : payload,
          files,
        );
    } else
      messageId = (
        await this.sendTracked(work, publication.channelId, payload, files)
      ).id;
    // Persist the external identity even if an archive/replace was committed while
    // Discord was answering. The later cleanup effect can then find the message.
    await this.db.publication.updateMany({
      where: { id: publication.id, guildId: work.guildId, messageId: null },
      data: { messageId },
    });
    const applied = await this.db.publication.updateMany({
      where: {
        id: publication.id,
        guildId: work.guildId,
        revision: publication.revision,
        state: publication.state,
      },
      data: { state: 'applied', appliedRevision: publication.revision },
    });
    // A module record waiting on this delivery should open now, not after
    // its 30-second retry for a still-pending publication.
    if (applied.count)
      await this.db.outbox.updateMany({
        where: {
          guildId: work.guildId,
          type: 'community.publication.applied',
          state: 'retry',
          payload: { path: ['publicationId'], equals: publication.id },
        },
        data: { dueAt: new Date() },
      });
    if (!applied.count) {
      const current = await this.db.publication.findFirst({
        where: { id: publication.id, guildId: work.guildId },
      });
      if (current && ['archived', 'replaced'].includes(current.state))
        await this.transaction(work, async (ctx) => {
          const cleanup = await ctx.tx.outbox.findFirst({
            where: {
              guildId: work.guildId,
              type: 'publication.archive',
              state: { in: ['pending', 'retry', 'running'] },
              payload: { path: ['publicationId'], equals: publication.id },
            },
          });
          if (!cleanup)
            await ctx.effect('publication.archive', {
              publicationId: publication.id,
            });
          return { retainedState: current.state };
        });
    }
  }

  /** Archived controls remain useful evidence even though their actions are revoked. */
  private async publicationMessage(
    work: OutboxWork,
    publication: { id: string; channelId: string; messageId: string | null },
    issuedIds: ReadonlySet<string>,
    allowUnsent = false,
  ): Promise<DiscordMessage | null> {
    if (publication.messageId)
      return this.discord.message(publication.channelId, publication.messageId);
    const sources = await this.db.outbox.findMany({
      where: {
        guildId: work.guildId,
        type: 'publication.send',
        payload: { path: ['publicationId'], equals: publication.id },
      },
      select: { id: true, state: true },
    });
    const attempts = await this.db.record.findMany({
      where: {
        guildId: work.guildId,
        kind: 'delivery.attempt',
        key: { in: sources.map((source) => `${source.id}:send`) },
      },
    });
    const knownIds = [
      ...new Set(
        attempts
          .filter((attempt) => attempt.state === 'applied')
          .map((attempt) => jsonObject(attempt.data)['messageId'])
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    if (knownIds.length > 1)
      throw new DeliveryUncertainError(
        'Multiple original message identities require manual review before archive.',
      );
    if (knownIds[0])
      return this.discord.message(publication.channelId, knownIds[0]);
    const allRejected =
      sources.length > 0 &&
      attempts.length === sources.length &&
      attempts.every((attempt) => attempt.state === 'rejected');
    const neverAttempted =
      sources.length > 0 &&
      !attempts.length &&
      sources.every((source) =>
        ['pending', 'retry', 'blocked', 'dead'].includes(source.state),
      );
    if (allowUnsent && (allRejected || neverAttempted)) return null;
    const nonces = new Set(sources.map((source) => nonce(source.id)));
    const ids = [...issuedIds];
    const messages = await this.discord.messages(publication.channelId);
    const matches = messages.filter(
      (message) =>
        message.author.id === this.discord.botUserId &&
        (nonces.has(String(message.nonce)) ||
          (ids.length > 0 &&
            ids.every((id) => controlIds(message.components).includes(id)))),
    );
    if (matches.length !== 1 || !matches[0])
      throw new DeliveryUncertainError(
        'The original message could not be identified uniquely. Review Discord before retrying archive or republishing. No replacement was sent.',
      );
    return matches[0];
  }

  private async reconcilePublication(
    work: OutboxWork,
    publication: {
      id: string;
      channelId: string;
      messageId: string | null;
      revision: number;
      state: string;
    },
    payload: Record<string, unknown>,
    files: DiscordFile[],
  ) {
    const markMissing = async () => {
      await this.assertCurrent();
      await this.db.publication.updateMany({
        where: {
          id: publication.id,
          guildId: work.guildId,
          revision: publication.revision,
          state: publication.state,
        },
        data: { state: 'missing' },
      });
    };
    try {
      await this.discord.channelPermissions(
        work.guildId,
        publication.channelId,
        PermissionFlagsBits.ViewChannel |
          PermissionFlagsBits.ReadMessageHistory,
      );
    } catch (error) {
      if (!(error instanceof DiscordAPIError && Number(error.code) === 10003))
        throw error;
      await markMissing();
      return;
    }
    let messageId = publication.messageId;
    let message;
    if (!messageId) {
      const source = await this.db.outbox.findFirst({
        where: {
          guildId: work.guildId,
          type: 'publication.send',
          payload: { path: ['publicationId'], equals: publication.id },
        },
        orderBy: { createdAt: 'desc' },
      });
      const expected = controlIds(payload);
      const messages = await this.discord.messages(publication.channelId);
      const matches = messages.filter(
        (item) =>
          item.author.id === this.discord.botUserId &&
          ((source && String(item.nonce) === nonce(source.id)) ||
            (expected.length > 0 &&
              expected.every((id) =>
                controlIds(item.components).includes(id),
              ))),
      );
      if (matches.length !== 1 || !matches[0])
        throw new DeliveryUncertainError(
          'The original message could not be identified uniquely. Review Discord before republishing. No replacement was sent.',
        );
      message = matches[0];
      messageId = message.id;
    } else {
      try {
        message = await this.discord.message(publication.channelId, messageId);
      } catch (error) {
        if (
          !(
            error instanceof DiscordAPIError &&
            [10003, 10008].includes(Number(error.code))
          )
        )
          throw error;
        await markMissing();
        return;
      }
    }
    const state =
      message.author.id === this.discord.botUserId &&
      publicationMatches(
        message,
        payload,
        files.map((file) => file.name),
      )
        ? 'applied'
        : 'conflict';
    await this.assertCurrent();
    await this.db.publication.updateMany({
      where: {
        id: publication.id,
        guildId: work.guildId,
        revision: publication.revision,
        state: publication.state,
      },
      data: {
        messageId,
        state,
        ...(state === 'applied'
          ? { appliedRevision: publication.revision }
          : {}),
      },
    });
  }

  private async createTicket(work: OutboxWork, id: string) {
    const ticket = await this.db.ticket.findFirst({
      where: { id, guildId: work.guildId },
    });
    if (!ticket) throw new DomainError('NOT_FOUND', 'Ticket unavailable.', 404);
    if (['closed', 'closing'].includes(ticket.state)) return;
    const settings = TicketConfigSchema.parse(ticket.snapshot);
    const [guild, roles, bot, channels] = await Promise.all([
      this.discord.guild(work.guildId),
      this.discord.roles(work.guildId),
      this.discord.member(work.guildId, this.discord.botUserId),
      this.discord.channels(work.guildId),
    ]);
    assertPermissions(
      effectivePermissions(guild, roles, bot),
      PermissionFlagsBits.ManageChannels | sendPermissions,
      'Sparko needs Manage Channels, View Channel, Send Messages and Read Message History.',
    );
    await this.discord.member(work.guildId, ticket.ownerId);
    if (
      settings.staffRoleIds.some((id) => !roles.some((role) => role.id === id))
    )
      throw new DomainError(
        'MISSING_PERMISSION',
        'A configured support role was removed. Review ticket setup.',
        403,
      );
    if (
      settings.categoryChannelId &&
      !channels.some(
        (channel) =>
          channel.id === settings.categoryChannelId && channel.type === 4,
      )
    )
      throw new DomainError(
        'MISSING_PERMISSION',
        'The ticket category was removed. Review ticket setup.',
        403,
      );
    const marker = `sparko:ticket:${ticket.id}`;
    const existing = channels.filter((channel) =>
      channel.topic?.includes(marker),
    );
    if (existing.length > 1)
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'Multiple matching ticket channels need owner reconciliation.',
        503,
      );
    let channelId = ticket.channelId ?? existing[0]?.id;
    if (!channelId) {
      const attemptKey = `${ticket.id}:create`;
      const priorAttempt = await this.db.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: work.guildId,
            kind: 'delivery.attempt',
            key: attemptKey,
          },
        },
      });
      if (priorAttempt?.state === 'sending')
        throw new DeliveryUncertainError(
          'A previous channel creation may have succeeded. Reconcile the ticket marker before retrying.',
        );
      const attempt = await this.db.record.upsert({
        where: {
          guildId_kind_key: {
            guildId: work.guildId,
            kind: 'delivery.attempt',
            key: attemptKey,
          },
        },
        create: {
          guildId: work.guildId,
          kind: 'delivery.attempt',
          key: attemptKey,
          state: 'sending',
          data: json({ marker }),
        },
        update: { state: 'sending' },
      });
      let channel;
      try {
        channel = await this.discord.createChannel(work.guildId, {
          name: `ticket-${String(ticket.number).padStart(4, '0')}`,
          type: 0,
          topic: marker,
          ...(settings.categoryChannelId
            ? { parent_id: settings.categoryChannelId }
            : {}),
          permission_overwrites: [
            {
              id: work.guildId,
              type: 0,
              allow: '0',
              deny: PermissionFlagsBits.ViewChannel.toString(),
            },
            {
              id: this.discord.botUserId,
              type: 1,
              allow: (
                sendPermissions | PermissionFlagsBits.ManageChannels
              ).toString(),
              deny: '0',
            },
            ...[...new Set(ticket.participants)].map((userId) => ({
              id: userId,
              type: 1,
              allow: sendPermissions.toString(),
              deny: '0',
            })),
            ...settings.staffRoleIds.map((roleId) => ({
              id: roleId,
              type: 0,
              allow: sendPermissions.toString(),
              deny: '0',
            })),
          ],
        });
      } catch (error) {
        if (
          error instanceof DiscordAPIError &&
          error.status < 500 &&
          error.status !== 429
        )
          await this.db.record.update({
            where: { id: attempt.id },
            data: { state: 'rejected' },
          });
        throw error;
      }
      channelId = channel.id;
      await this.db.record.update({
        where: { id: attempt.id },
        data: { state: 'applied', data: json({ marker, channelId }) },
      });
    }
    await this.db.ticket.updateMany({
      where: {
        id: ticket.id,
        guildId: work.guildId,
        revision: ticket.revision,
        state: { in: ['creating', 'failed', 'reconciliation_required'] },
      },
      data: { channelId, state: 'open' },
    });
    const botHeartbeat = await this.db.heartbeat.findUnique({
      where: { service: 'bot' },
    });
    await this.db.record.upsert({
      where: {
        guildId_kind_key: {
          guildId: work.guildId,
          kind: 'ticket.coverage',
          key: ticket.id,
        },
      },
      create: {
        guildId: work.guildId,
        kind: 'ticket.coverage',
        key: ticket.id,
        state: 'active',
        data: json({
          startedAt: new Date().toISOString(),
          observationId:
            jsonObject(botHeartbeat?.details)['observationId'] ?? null,
          connectedAtCreation: botHeartbeat?.status === 'connected',
        }),
      },
      update: {},
    });
    // Welcome delivery has its own tracked effect so a notification timeout cannot recreate a channel.
    await this.transaction(work, async (ctx) => {
      await ctx.effect('ticket.welcome', { ticketId: ticket.id });
      return { channelId };
    });
  }

  private async captureTicket(work: OutboxWork, id: string) {
    const ticket = await this.db.ticket.findFirst({
      where: { id, guildId: work.guildId },
    });
    if (!ticket?.channelId)
      throw new DomainError('NOT_FOUND', 'Ticket channel unavailable.', 404);
    if (ticket.state === 'closed') return;
    await this.discord.channelPermissions(
      work.guildId,
      ticket.channelId,
      PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.ManageChannels,
    );
    const settings = TicketConfigSchema.parse(ticket.snapshot);
    const messages: unknown[] = [];
    let before: string | undefined;
    let fetchedAll = false;
    for (let page = 0; page < 100; page++) {
      const batch = await this.discord.messages(ticket.channelId, before);
      messages.push(...batch);
      if (batch.length < 100) {
        fetchedAll = true;
        break;
      }
      before = batch.at(-1)?.id;
      if (!before) break;
    }
    const [observations, coverage, botHeartbeat] = await Promise.all([
      this.db.record.findMany({
        where: {
          guildId: work.guildId,
          kind: 'ticket.message',
          data: { path: ['ticketId'], equals: ticket.id },
        },
        orderBy: { key: 'asc' },
        take: 10000,
      }),
      this.db.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: work.guildId,
            kind: 'ticket.coverage',
            key: ticket.id,
          },
        },
      }),
      this.db.heartbeat.findUnique({ where: { service: 'bot' } }),
    ]);
    const c = jsonObject(coverage?.data);
    const heartbeatData = jsonObject(botHeartbeat?.details);
    const complete =
      fetchedAll &&
      coverage?.state === 'active' &&
      c['connectedAtCreation'] === true &&
      botHeartbeat?.status === 'connected' &&
      Date.now() - botHeartbeat.updatedAt.getTime() < 45_000 &&
      c['observationId'] === heartbeatData['observationId'] &&
      Array.isArray(heartbeatData['intents']) &&
      heartbeatData['intents'].includes('content');
    const captured = {
      accessibleHistory: messages,
      observedHistory: observations.map((observation) => ({
        ...jsonObject(observation.data),
        state: observation.state,
      })),
      coverage: complete
        ? 'Observed throughout; accessible history fetched.'
        : 'Some history or content observations were unavailable. Unobserved deletions cannot be reconstructed.',
      fetchedAll,
    };
    await this.transaction(work, async (ctx) => {
      await ctx.tx.transcript.create({
        data: {
          guildId: work.guildId,
          ticketId: ticket.id,
          messages: json(captured),
          status: complete ? 'complete' : 'partial',
          checksum: createHash('sha256')
            .update(JSON.stringify(captured))
            .digest('hex'),
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      if (!complete && settings.requireTranscriptBeforeCleanup) {
        await ctx.tx.ticket.update({
          where: { id: ticket.id },
          data: { state: 'capture_failed' },
        });
        return { retained: true };
      }
      await ctx.effect('ticket.cleanup', {
        ticketId: ticket.id,
        channelId: ticket.channelId,
      });
      return { retained: false };
    });
  }

  private async roles(work: OutboxWork, p: Record<string, unknown>) {
    const record = await this.record(work.guildId, p['recordId']);
    if (typeof p['revision'] === 'number' && record.revision !== p['revision'])
      return;
    const data = jsonObject(record.data);
    const userId = Snowflake.parse(p['userId']);
    const featureId =
      typeof p['featureId'] === 'string'
        ? p['featureId']
        : p['menuId']
          ? 'R16'
          : data['cause'] === 'level'
            ? 'R11'
            : undefined;
    if (featureId && p['cleanup'] !== true)
      await this.platform.read(
        systemActor(work.guildId, this.discord.botUserId),
        (ctx) => ctx.requireFeature(featureId),
      );
    const add =
      work.type === 'control.role'
        ? p['desired']
          ? [Snowflake.parse(p['roleId'])]
          : []
        : z.array(Snowflake).parse(p['addRoleIds']);
    const remove =
      work.type === 'control.role'
        ? p['desired']
          ? []
          : [Snowflake.parse(p['roleId'])]
        : z.array(Snowflake).parse(p['removeRoleIds']);
    const [guild, roles, bot, member] = await Promise.all([
      this.discord.guild(work.guildId),
      this.discord.roles(work.guildId),
      this.discord.member(work.guildId, this.discord.botUserId),
      this.discord.member(work.guildId, userId),
    ]);
    for (const roleId of [...add, ...remove])
      assertRoleAssignable(guild, roles, bot, roleId);
    if (p['menuId']) {
      const menu = await this.record(work.guildId, p['menuId'], 'role.menu');
      if (menu.revision !== p['menuRevision'] || menu.state !== 'published')
        throw new DomainError(
          'FORBIDDEN',
          'This role menu changed or was removed.',
          403,
        );
      const options = z
        .array(
          z.object({
            roleId: Snowflake,
            requiredRoleIds: z.array(Snowflake).default([]),
            blockedRoleIds: z.array(Snowflake).default([]),
          }),
        )
        .parse(jsonObject(menu.data)['options']);
      for (const roleId of add) {
        const option = options.find((candidate) => candidate.roleId === roleId);
        if (
          !option ||
          option.requiredRoleIds.some((id) => !member.roles.includes(id)) ||
          option.blockedRoleIds.some((id) => member.roles.includes(id))
        )
          throw new DomainError(
            'FORBIDDEN',
            'Your current roles no longer meet this menu’s prerequisites.',
            403,
          );
      }
    }
    const current = await this.record(work.guildId, record.id);
    if (current.revision !== record.revision) return;
    for (const roleId of remove)
      if (member.roles.includes(roleId))
        await this.discord.removeRole(work.guildId, userId, roleId);
    for (const roleId of add)
      if (!member.roles.includes(roleId))
        await this.discord.addRole(work.guildId, userId, roleId);
    await this.db.record.updateMany({
      where: {
        id: record.id,
        guildId: work.guildId,
        revision: record.revision,
      },
      data: {
        state: 'applied',
        data: json({ ...data, appliedAt: new Date().toISOString() }),
      },
    });
  }
  private async message(work: OutboxWork, p: Record<string, unknown>) {
    if (typeof p['featureId'] === 'string')
      await this.platform.read(
        systemActor(work.guildId, this.discord.botUserId),
        (ctx) => ctx.requireFeature(String(p['featureId'])),
      );
    const document = MessageDocumentSchema.parse(p['document']);
    const tokens = z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .parse(p['tokens'] ?? {});
    let channelId: string;
    if (p['userId'])
      channelId = await this.discord.dm(Snowflake.parse(p['userId']));
    else {
      channelId = Snowflake.parse(p['channelId']);
      await this.discord.channelPermissions(
        work.guildId,
        channelId,
        sendPermissions,
      );
    }
    const payload = compileMessage(document, tokens);
    await this.sendTracked(work, channelId, payload);
  }

  private async sendTracked(
    work: OutboxWork,
    channelId: string,
    payload: unknown,
    files?: DiscordFile[],
  ) {
    const key = `${work.id}:send`;
    const prior = await this.db.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: work.guildId,
          kind: 'delivery.attempt',
          key,
        },
      },
    });
    const priorData = jsonObject(prior?.data);
    if (
      prior?.state === 'applied' &&
      typeof priorData['messageId'] === 'string'
    )
      return this.discord.message(channelId, priorData['messageId']);
    if (prior?.state === 'sending') {
      const ids = controlIds(payload);
      const messages = await this.discord.messages(channelId);
      const matches = messages.filter(
        (message) =>
          message.author.id === this.discord.botUserId &&
          (String(message.nonce) === nonce(work.id) ||
            (ids.length > 0 &&
              ids.every((id) => controlIds(message.components).includes(id)))),
      );
      if (matches.length !== 1 || !matches[0])
        throw new DeliveryUncertainError(
          'This send may have succeeded. Reconcile its saved attempt before sending again.',
        );
      await this.db.record.update({
        where: { id: prior.id },
        data: {
          state: 'applied',
          data: json({ ...priorData, messageId: matches[0].id }),
        },
      });
      return matches[0];
    }
    const attempt = await this.db.record.upsert({
      where: {
        guildId_kind_key: {
          guildId: work.guildId,
          kind: 'delivery.attempt',
          key,
        },
      },
      create: {
        guildId: work.guildId,
        kind: 'delivery.attempt',
        key,
        state: 'sending',
        data: json({ channelId, nonce: nonce(work.id) }),
      },
      update: { state: 'sending' },
    });
    try {
      const message = await this.discord.send(
        channelId,
        payload,
        nonce(work.id),
        files,
      );
      await this.db.record.update({
        where: { id: attempt.id },
        data: {
          state: 'applied',
          data: json({
            channelId,
            nonce: nonce(work.id),
            messageId: message.id,
          }),
        },
      });
      return message;
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        error.status < 500 &&
        error.status !== 429
      )
        await this.db.record.update({
          where: { id: attempt.id },
          data: { state: 'rejected' },
        });
      throw error;
    }
  }

  private async economy(work: OutboxWork, p: Record<string, unknown>) {
    if (work.type !== 'economy.role.deliver') {
      await this.transaction(work, (ctx) => runEconomyJob(ctx, work.type, p));
      return;
    }
    const actor = systemActor(work.guildId, this.discord.botUserId);
    const { data: order } = await this.platform.mutate(
      actor,
      'worker.economy.reserve',
      `${work.id}:${work.fence}`,
      p,
      (ctx) => beginRoleOrderDelivery(ctx, ID.parse(p['orderId'])),
    );
    if (['delivered', 'refunded'].includes(order.state)) return;
    if (order.state !== 'delivery-in-progress')
      throw new DomainError('INVALID_INPUT', 'This order cannot be delivered.');
    const data = jsonObject(order.data);
    const item = jsonObject(data['itemSnapshot']);
    const userId = Snowflake.parse(data['userId']),
      roleId = Snowflake.parse(item['roleId']);
    if (userId !== p['userId'] || roleId !== p['roleId'])
      throw new DomainError(
        'FORBIDDEN',
        'This delivery does not match the purchased role.',
        403,
      );
    try {
      const [guild, roles, bot, member] = await Promise.all([
        this.discord.guild(work.guildId),
        this.discord.roles(work.guildId),
        this.discord.member(work.guildId, this.discord.botUserId),
        this.discord.member(work.guildId, userId),
      ]);
      assertRoleAssignable(guild, roles, bot, roleId);
      if (!member.roles.includes(roleId))
        await this.discord.addRole(work.guildId, userId, roleId);
      await this.assertCurrent();
      await this.platform.mutate(
        actor,
        'worker.economy.complete',
        `${work.id}:${work.fence}`,
        { orderId: order.id, outcome: 'delivered' },
        (ctx) => completeRoleOrder(ctx, order.id, 'delivered'),
      );
    } catch (error) {
      // A definitive rejection permits an explicit manager refund. Network uncertainty
      // keeps the reservation: a retry reconciles the idempotent role PUT without charging again.
      if (
        (error instanceof DomainError &&
          [
            'FORBIDDEN',
            'MISSING_PERMISSION',
            'NOT_FOUND',
            'INVALID_INPUT',
          ].includes(error.code)) ||
        (error instanceof DiscordAPIError &&
          error.status < 500 &&
          error.status !== 429)
      ) {
        await this.platform.mutate(
          actor,
          'worker.economy.failed',
          `${work.id}:${work.fence}`,
          { orderId: order.id },
          (ctx) =>
            completeRoleOrder(
              ctx,
              order.id,
              'failed',
              'Discord rejected the role. Repair its permissions or request a manager refund.',
            ),
        );
      }
      throw error;
    }
  }

  private async provider(work: OutboxWork, p: Record<string, unknown>) {
    const actor = systemActor(work.guildId, this.discord.botUserId);
    if (
      [
        'provider.social.schedule',
        'provider.retention',
        'billing.entitlement.expire',
      ].includes(work.type)
    ) {
      await this.transaction(work, (ctx) => runProviderJob(ctx, work.type, p));
      return;
    }
    if (work.type === 'provider.social.poll') {
      const reservation = await this.platform.mutate(
        actor,
        'worker.provider.poll.reserve',
        work.id,
        p,
        (ctx) => reserveSourcePoll(ctx, ID.parse(p['sourceId'])),
      );
      const events = await pollSource(reservation.data.source);
      await this.assertCurrent();
      await this.platform.mutate(
        actor,
        'worker.provider.poll.complete',
        work.id,
        {
          sourceId: reservation.data.sourceId,
          revision: reservation.data.revision,
        },
        (ctx) =>
          applySourceEvents(
            ctx,
            reservation.data.sourceId,
            reservation.data.revision,
            events,
          ),
      );
      return;
    }
    if (work.type === 'provider.announcement') {
      const event = await this.record(work.guildId, p['eventId']);
      const data = jsonObject(event.data);
      if (data['sourceId']) {
        const source = await this.record(
          work.guildId,
          data['sourceId'],
          'social.source',
        );
        if (
          source.state !== 'active' ||
          jsonObject(source.data)['enabled'] !== true
        )
          return;
      } else if (data['integrationId']) {
        const integration = await this.record(
          work.guildId,
          data['integrationId'],
          'webhook.integration',
        );
        if (integration.state !== 'active') return;
      }
      const channelId = Snowflake.parse(p['channelId']);
      await this.discord.channelPermissions(
        work.guildId,
        channelId,
        sendPermissions,
      );
      const message = await this.sendTracked(
        work,
        channelId,
        textPayload(
          `${z.string().parse(p['title'])}\n${z.string().parse(p['text'])}${p['url'] ? `\n${z.string().parse(p['url'])}` : ''}`,
        ),
      );
      await this.db.record.update({
        where: { id: event.id },
        data: {
          state: 'applied',
          data: json({ ...data, delivery: 'applied', messageId: message.id }),
        },
      });
      return;
    }
    if (work.type === 'provider.ai.generate') {
      const request = await this.record(
        work.guildId,
        p['requestId'],
        'ai.request',
      );
      if (request.state === 'completed' || request.state === 'expired') return;
      if (request.state === 'generating')
        throw new DeliveryUncertainError(
          'The AI provider may have accepted this request. Reconcile it before another charged generation.',
        );
      if (!providerAvailability().ai.available)
        throw new DomainError(
          'SERVICE_UNAVAILABLE',
          'AI requires OPENAI_API_KEY and OPENAI_MODEL.',
          503,
        );
      const requester = await this.discord.actor(
        this.db,
        work.guildId,
        Snowflake.parse(request.ownerId),
      );
      const { data: prepared } = await this.platform.mutate(
        requester,
        'worker.provider.ai.reserve',
        `${work.id}:${work.fence}`,
        p,
        (ctx) => prepareAiRequest(ctx, request.id),
      );
      if (!prepared)
        throw new DeliveryUncertainError(
          'AI generation was already reserved. Reconcile its provider outcome.',
        );
      await this.assertCurrent();
      try {
        const input = await this.platform.read(requester, (ctx) =>
          loadPreparedAiRequest(ctx, request.id),
        );
        const result = await runAiProvider(input);
        await this.assertCurrent();
        await this.platform.mutate(
          actor,
          'worker.provider.ai.complete',
          work.id,
          { requestId: request.id, responseId: result.responseId },
          async (ctx) => {
            const completed = await completeAiRequest(ctx, request.id, result);
            return {
              requestId: request.id,
              state: completed.state,
              responseId: result.responseId,
            };
          },
        );
      } catch {
        throw new DeliveryUncertainError(
          'The AI provider result is uncertain. Reconcile its reserved request before generating again.',
        );
      }
      return;
    }
    if (work.type === 'provider.billing.checkout') {
      const intent = await this.record(
        work.guildId,
        p['intentId'],
        'billing.intent',
      );
      if (intent.state === 'checkout-ready') return;
      const data = jsonObject(intent.data);
      const userId = Snowflake.parse(data['userId']);
      const author = await this.discord.actor(this.db, work.guildId, userId);
      if (!allowed(author, 'config.manage'))
        throw new DomainError(
          'FORBIDDEN',
          'The checkout requester no longer manages this server.',
          403,
        );
      await this.assertCurrent();
      const result = await createStripeCheckout(
        { id: intent.id, guildId: work.guildId, userId },
        process.env['PUBLIC_APP_URL'] ?? '',
      );
      await this.assertCurrent();
      await this.platform.mutate(
        actor,
        'worker.provider.checkout.complete',
        work.id,
        { intentId: intent.id },
        (ctx) => completeCheckout(ctx, intent.id, result),
      );
      return;
    }
    if (work.type.startsWith('provider.music.'))
      throw new DomainError(
        'SERVICE_UNAVAILABLE',
        'Music delivery requires a connected, permitted-source Discord voice runtime.',
        503,
      );
    throw new DomainError(
      'INVALID_INPUT',
      `No provider delivery handler is installed for ${work.type}.`,
    );
  }

  private async publishRecord(
    work: OutboxWork,
    recordId: string,
    channelId: string,
    document: MessageDocument,
    data: Record<string, unknown>,
    desiredState: string,
  ) {
    const result = await this.transaction(work, async (ctx) => {
      const published = await publishDocument(
        ctx,
        channelId,
        document,
        data['preview'] === true,
      );
      await ctx.tx.record.update({
        where: { id: recordId },
        data: {
          data: json({
            ...data,
            channelId,
            publicationId: published.id,
            publicationState: 'pending',
          }),
          state: 'publishing',
        },
      });
      await ctx.effect('community.publication.applied', {
        recordId,
        publicationId: published.id,
        desiredState,
      });
      return { publicationId: published.id };
    });
    return result;
  }
  /**
   * The configured drop channel, else the first fallback the bot can post in.
   * With no usable channel the `skip` policy records a failed drop and the
   * `retry` policy retries the delivery later.
   */
  private async crateChannel(
    work: OutboxWork,
    dropId: string,
    data: Record<string, unknown>,
  ): Promise<string | null> {
    const configuration = await this.db.featureConfig.findUnique({
      where: { guildId_featureId: { guildId: work.guildId, featureId: 'R10' } },
    });
    const fallbacks = z
      .array(Snowflake)
      .catch([])
      .parse(jsonObject(configuration?.config)['fallbackChannelIds']);
    const candidates = [
      ...new Set([Snowflake.parse(data['channelId']), ...fallbacks]),
    ];
    const problems: string[] = [];
    for (const candidate of candidates)
      try {
        await this.discord.channelPermissions(
          work.guildId,
          candidate,
          sendPermissions,
        );
        return candidate;
      } catch (error) {
        if (
          !(
            error instanceof DomainError &&
            ['FORBIDDEN', 'MISSING_PERMISSION'].includes(error.code)
          ) &&
          !(
            error instanceof DiscordAPIError &&
            [10003, 50001, 50013].includes(Number(error.code))
          )
        )
          throw error;
        problems.push(
          `${candidate}: ${error instanceof Error ? error.message : 'unavailable'}`,
        );
      }
    const reason = `No crate channel is usable. ${problems.join(' ')}`.slice(
      0,
      1000,
    );
    if (data['failurePolicy'] !== 'skip')
      throw new DomainError('SERVICE_UNAVAILABLE', reason, 503);
    await this.db.record.update({
      where: { id: dropId },
      data: {
        state: 'failed',
        data: json({
          ...data,
          publicationState: 'failed',
          deliveryError: reason,
        }),
      },
    });
    return null;
  }
  private async community(work: OutboxWork, p: Record<string, unknown>) {
    if (work.type === 'community.publication.applied') {
      const publication = await this.db.publication.findFirst({
        where: { id: ID.parse(p['publicationId']), guildId: work.guildId },
      });
      const record = await this.record(work.guildId, p['recordId']);
      if (publication?.state !== 'applied') {
        const send = await this.db.outbox.findFirst({
          where: {
            guildId: work.guildId,
            type: 'publication.send',
            payload: {
              path: ['publicationId'],
              equals: ID.parse(p['publicationId']),
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        // A delivery that can no longer succeed is reported, not retried forever.
        if (publication && send && ['blocked', 'dead'].includes(send.state)) {
          await this.db.record.update({
            where: { id: record.id },
            data: {
              state: 'failed',
              data: json({
                ...jsonObject(record.data),
                publicationState: 'failed',
                deliveryError:
                  send.lastError ?? 'Discord delivery did not complete.',
              }),
            },
          });
          return;
        }
        throw new DomainError(
          'SERVICE_UNAVAILABLE',
          'The Discord publication is still pending.',
          503,
        );
      }
      await this.db.record.update({
        where: { id: record.id },
        data: {
          state: ID.parse(p['desiredState']),
          data: json({
            ...jsonObject(record.data),
            publicationState: 'applied',
            channelId: publication.channelId,
            messageId: publication.messageId,
          }),
        },
      });
      return;
    }
    if (
      [
        'community.crate.publish',
        'community.giveaway.publish',
        'community.role-menu.publish',
      ].includes(work.type)
    ) {
      const kind =
        work.type === 'community.crate.publish'
          ? 'crate.drop'
          : work.type === 'community.giveaway.publish'
            ? 'giveaway'
            : 'role.menu';
      const id = p['dropId'] ?? p['giveawayId'] ?? p['menuId'];
      const record = await this.record(work.guildId, id, kind);
      const data = jsonObject(record.data);
      if (data['publicationId']) return;
      let channelId = Snowflake.parse(data['channelId']);
      if (kind === 'crate.drop') {
        const chosen = await this.crateChannel(work, record.id, data);
        if (!chosen) return;
        channelId = chosen;
      }
      let document: MessageDocument;
      if (kind === 'role.menu') {
        const options = z
          .array(z.object({ label: z.string(), roleId: Snowflake }))
          .parse(data['options']);
        const [guild, roles, bot] = await Promise.all([
          this.discord.guild(work.guildId),
          this.discord.roles(work.guildId),
          this.discord.member(work.guildId, this.discord.botUserId),
        ]);
        options.forEach((option) =>
          assertRoleAssignable(guild, roles, bot, option.roleId),
        );
        const row = {
          type: 'controls',
          controls: [
            {
              type: 'select',
              key: 'role-menu',
              minValues: data['minSelections'],
              maxValues: data['maxSelections'],
              options: options.map((option) => ({
                label: option.label,
                value: option.roleId,
              })),
              action: { type: 'role.menu', menuId: record.id },
            },
          ],
        };
        document =
          withActionRow(data['document'], row) ??
          MessageDocumentSchema.parse({
            schemaVersion: 1,
            mode: 'v2',
            name: 'Role menu',
            blocks: [{ type: 'text', text: String(data['name']) }, row],
          });
      } else {
        const preview = data['preview'] === true;
        const title =
          kind === 'crate.drop'
            ? `${preview ? 'Zero-reward preview: ' : ''}${String(jsonObject(data['type'])['name'])}`
            : String(data['prize']);
        const action =
          kind === 'crate.drop'
            ? { type: 'crate.claim', crateId: record.id }
            : { type: 'giveaway.enter', giveawayId: record.id };
        const configured =
          kind === 'crate.drop'
            ? jsonObject(data['type'])['document']
            : data['document'];
        const row = {
          type: 'controls',
          controls: [
            {
              type: 'button',
              key: 'entry',
              label: kind === 'crate.drop' ? 'Claim crate' : 'Enter giveaway',
              style: 'primary',
              action,
            },
          ],
        };
        document =
          withActionRow(configured, row) ??
          MessageDocumentSchema.parse({
            schemaVersion: 1,
            mode: 'v2',
            name: kind,
            blocks: [
              {
                type: 'container',
                accentColor: BRAND_YELLOW,
                children: [
                  { type: 'text', text: `## ${title}` },
                  {
                    type: 'text',
                    text:
                      kind === 'crate.drop'
                        ? `Expires ${String(data['expiresAt'])}. ${preview ? 'This preview grants no XP.' : 'Claims and rewards are recorded atomically.'}`
                        : `Ends ${String(data['endsAt'])}. Winner count: ${String(data['winnerCount'])}. Eligibility is checked when entering and drawing.`,
                  },
                  {
                    type: 'controls',
                    controls: [
                      {
                        type: 'button',
                        key: 'entry',
                        label:
                          kind === 'crate.drop'
                            ? 'Claim crate'
                            : 'Enter giveaway',
                        style: 'primary',
                        action,
                      },
                    ],
                  },
                ],
              },
            ],
          });
      }
      await this.publishRecord(
        work,
        record.id,
        channelId,
        document,
        data,
        kind === 'role.menu' ? 'published' : 'open',
      );
      return;
    }
    if (work.type === 'community.crate.update') {
      const record = await this.record(work.guildId, p['dropId'], 'crate.drop');
      const data = jsonObject(record.data);
      if (!data['messageId'] || !data['publicationId']) return;
      const publication = await this.db.publication.findFirst({
        where: { id: String(data['publicationId']), guildId: work.guildId },
        include: { controls: true },
      });
      if (!publication) return;
      const document = MessageDocumentSchema.parse(publication.document);
      function disabled(block: MessageDocument['blocks'][number]): void {
        if (block.type === 'controls')
          block.controls.forEach((control) => {
            control.disabled = ['expired', 'exhausted'].includes(record.state);
          });
        if (block.type === 'container') block.children.forEach(disabled);
      }
      document.blocks.forEach(disabled);
      await this.discord.edit(
        Snowflake.parse(data['channelId']),
        Snowflake.parse(data['messageId']),
        compileMessage(
          document,
          {},
          Object.fromEntries(
            publication.controls.map((control) => [control.key, control.id]),
          ),
        ),
      );
      return;
    }
    if (work.type === 'community.starboard.sync') {
      await this.starboard(work, p);
      return;
    }
    if (work.type === 'community.giveaway.announce') {
      const draw = await this.record(
        work.guildId,
        p['drawId'],
        'giveaway.draw',
      );
      const data = jsonObject(draw.data);
      const giveaway = await this.record(
        work.guildId,
        p['giveawayId'],
        'giveaway',
      );
      const rules = jsonObject(giveaway.data);
      const winners = await this.db.record.findMany({
        where: {
          guildId: work.guildId,
          kind: 'giveaway.winner',
          data: { path: ['drawId'], equals: draw.id },
        },
        take: 100,
      });
      const channelId = Snowflake.parse(rules['channelId']);
      await this.discord.channelPermissions(
        work.guildId,
        channelId,
        sendPermissions,
      );
      await this.sendTracked(
        work,
        channelId,
        textPayload(
          `Giveaway draw for ${String(rules['prize'])}: ${winners.length ? winners.map((winner) => winner.ownerId).join(', ') : 'No eligible entrants.'}\nClaim deadline: ${String(data['claimUntil'])}. Claim from your member portal.`,
        ),
      );
      return;
    }
    if (
      [
        'community.giveaway.claim-notify',
        'community.submission.decision',
      ].includes(work.type)
    ) {
      const id = p['recordId'] ?? p['winnerId'];
      const record = await this.record(work.guildId, id);
      const userId = Snowflake.parse(p['userId'] ?? record.ownerId);
      const channel = await this.discord.dm(userId);
      await this.sendTracked(
        work,
        channel,
        textPayload(
          work.type === 'community.giveaway.claim-notify'
            ? 'Your giveaway prize claim is recorded. Contact the giveaway host for fulfillment.'
            : `Your submission decision is recorded: ${JSON.stringify(p['decision']).slice(0, 1500)}`,
        ),
      );
      return;
    }
    if (work.type === 'community.submission.publish') {
      const record = await this.record(work.guildId, p['recordId']);
      const data = jsonObject(record.data);
      const channelId = Snowflake.parse(p['channelId']);
      await this.discord.channelPermissions(
        work.guildId,
        channelId,
        sendPermissions,
      );
      const posted = await this.sendTracked(
        work,
        channelId,
        textPayload(
          `${record.kind}: ${String(data['title'] ?? '')}\n${String(data['body'] ?? data['content'] ?? '')}\nVote and review in the member portal.`,
        ),
      );
      await this.db.record.update({
        where: { id: record.id },
        data: { data: json({ ...data, messageId: posted.id, channelId }) },
      });
      return;
    }
    throw new DomainError(
      'INVALID_INPUT',
      `No community delivery handler is installed for ${work.type}.`,
    );
  }
  private async starboard(work: OutboxWork, p: Record<string, unknown>) {
    const record = await this.record(
      work.guildId,
      p['recordId'],
      'starboard.source',
    );
    if (record.revision !== p['revision']) return;
    const data = jsonObject(record.data);
    const channelId = Snowflake.parse(p['channelId']);
    await this.discord.channelPermissions(
      work.guildId,
      channelId,
      sendPermissions | PermissionFlagsBits.EmbedLinks,
    );
    if (p['delete'] === true) {
      if (data['mirrorMessageId'])
        await this.discord.deleteMessage(
          channelId,
          Snowflake.parse(data['mirrorMessageId']),
        );
      await this.db.record.update({
        where: { id: record.id },
        data: {
          data: json({
            ...data,
            mirrorMessageId: null,
            mirrorState: 'removed',
          }),
        },
      });
      return;
    }
    const payload = {
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `⭐ ${String(data['votes'] ?? data['count'] ?? 0)} votes`,
          description: p['tombstone']
            ? 'The source message was removed.'
            : data['contentAvailable'] === false
              ? 'Source content was not available to Sparko.'
              : String(data['content'] ?? '').slice(0, 4096),
          color: BRAND_YELLOW,
          url: `https://discord.com/channels/${work.guildId}/${String(data['sourceChannelId'])}/${String(p['sourceMessageId'])}`,
          footer: { text: 'Sparko starboard • original source' },
        },
      ],
    };
    const message = data['mirrorMessageId']
      ? await this.discord.edit(
          channelId,
          Snowflake.parse(data['mirrorMessageId']),
          payload,
        )
      : await this.sendTracked(work, channelId, payload);
    await this.db.record.update({
      where: { id: record.id },
      data: {
        data: json({
          ...data,
          mirrorMessageId: message.id,
          mirrorChannelId: channelId,
          mirrorState: 'applied',
        }),
      },
    });
  }

  private async automation(work: OutboxWork, p: Record<string, unknown>) {
    const actor = systemActor(work.guildId, this.discord.botUserId);
    const guard = await this.platform.read(actor, (ctx) =>
      guardAutomationEffect(ctx, p),
    );
    if (!guard.deliver || !guard.record) return;
    const record = guard.record;
    const data = jsonObject(record.data);
    if (record.kind === 'workflow_run') {
      const workflow = await this.record(
        work.guildId,
        data['workflowId'],
        'workflow',
      );
      if (
        workflow.state !== 'active' ||
        workflow.revision !== data['workflowRevision']
      )
        throw new DomainError(
          'FORBIDDEN',
          'The workflow was disabled or changed.',
          403,
        );
      const definition = WorkflowSchema.parse(data['definition']);
      const member = await this.discord.actor(
        this.db,
        work.guildId,
        Snowflake.parse(p['userId']),
      );
      if (
        definition.requiredRoleIds.some(
          (roleId) => !member.roles.includes(roleId),
        )
      )
        throw new DomainError(
          'FORBIDDEN',
          'Your current roles no longer meet workflow eligibility.',
          403,
        );
      const author = await this.discord.actor(
        this.db,
        work.guildId,
        Snowflake.parse(workflow.ownerId),
      );
      if (!allowed(author, 'automation.manage'))
        throw new DomainError(
          'FORBIDDEN',
          'The workflow author no longer has automation access.',
          403,
        );
    }
    let result: { success: boolean; messageId?: string; channelId?: string } = {
      success: true,
    };
    if (work.type === 'automation.send') {
      const destination = z
        .discriminatedUnion('type', [
          z.object({ type: z.literal('channel'), channelId: Snowflake }),
          z.object({ type: z.literal('dm') }),
        ])
        .parse(p['destination']);
      let channelId: string;
      if (destination.type === 'dm')
        channelId = await this.discord.dm(
          Snowflake.parse(p['userId'] ?? record.ownerId),
        );
      else {
        if (!['birthday', 'workflow_run'].includes(record.kind)) {
          const author = await this.discord.actor(
            this.db,
            work.guildId,
            Snowflake.parse(record.ownerId),
          );
          if (
            !allowed(author, 'automation.manage') &&
            !allowed(author, 'community.manage')
          )
            throw new DomainError(
              'FORBIDDEN',
              'The source author no longer has access to channel automation.',
              403,
            );
        }
        channelId = destination.channelId;
        await this.discord.channelPermissions(
          work.guildId,
          channelId,
          sendPermissions,
        );
      }
      if (p['replaceMessageId']) {
        try {
          const owned = await this.discord.message(
            channelId,
            Snowflake.parse(p['replaceMessageId']),
          );
          if (owned.author.id !== this.discord.botUserId)
            throw new DomainError(
              'FORBIDDEN',
              'Sparko cannot replace another author’s message.',
              403,
            );
          await this.discord.deleteMessage(channelId, owned.id);
        } catch (error) {
          if (
            !(error instanceof DiscordAPIError && Number(error.code) === 10008)
          )
            throw error;
        }
      }
      const payload = p['document']
        ? compileMessage(MessageDocumentSchema.parse(p['document']))
        : textPayload(z.string().parse(p['text']));
      const message = await this.sendTracked(work, channelId, payload);
      result = { success: true, messageId: message.id, channelId };
    } else if (work.type === 'automation.role') {
      const userId = Snowflake.parse(p['userId']);
      const roleId = Snowflake.parse(p['roleId']);
      const desired = p['action'] === 'add';
      let roleAddedBySparko = data['roleAddedBySparko'] === true;
      const [guild, roles, bot, member] = await Promise.all([
        this.discord.guild(work.guildId),
        this.discord.roles(work.guildId),
        this.discord.member(work.guildId, this.discord.botUserId),
        this.discord.member(work.guildId, userId),
      ]);
      assertRoleAssignable(guild, roles, bot, roleId);
      if (record.kind === 'application') {
        const reviewer = await this.discord.actor(
          this.db,
          work.guildId,
          Snowflake.parse(p['actorId']),
        );
        if (!allowed(reviewer, 'forms.review'))
          throw new DomainError(
            'FORBIDDEN',
            'The reviewer no longer has application decision access.',
            403,
          );
      }
      if (record.kind === 'birthday_role') {
        const active = await this.db.record.findMany({
          where: {
            guildId: work.guildId,
            kind: 'birthday_role',
            ownerId: userId,
            state: { in: ['pending', 'active', 'applied'] },
            data: { path: ['roleId'], equals: roleId },
          },
        });
        if (
          !desired &&
          active.some(
            (other) =>
              other.id !== record.id &&
              Date.parse(String(jsonObject(other.data)['expiresAt'])) >
                Date.now(),
          )
        )
          return;
      }
      if (record.kind === 'invite_reward' && !desired) {
        const others = await this.db.record.findMany({
          where: {
            guildId: work.guildId,
            kind: 'invite_reward',
            state: { in: ['pending', 'active', 'applied'] },
            data: { path: ['inviterId'], equals: userId },
          },
        });
        if (
          others.some(
            (other) =>
              other.id !== record.id &&
              jsonObject(other.data)['roleId'] === roleId,
          )
        )
          return;
      }
      if (['birthday_role', 'invite_reward'].includes(record.kind)) {
        if (desired) {
          const overlapping = await this.db.record.findMany({
            where: {
              guildId: work.guildId,
              kind: { in: ['birthday_role', 'invite_reward'] },
              id: { not: record.id },
              state: { in: ['active', 'applied', 'pending'] },
              data: { path: ['roleId'], equals: roleId },
            },
          });
          roleAddedBySparko =
            roleAddedBySparko ||
            !member.roles.includes(roleId) ||
            overlapping.some((other) => {
              const source = jsonObject(other.data);
              return (
                (source['userId'] === userId ||
                  source['inviterId'] === userId ||
                  other.ownerId === userId) &&
                source['roleAddedBySparko'] === true
              );
            });
          // Save ownership intent before PUT; its idempotent retry preserves the original fact.
          await this.db.record.updateMany({
            where: { id: record.id, revision: record.revision },
            data: { data: json({ ...data, roleAddedBySparko }) },
          });
        } else if (!roleAddedBySparko) {
          await this.db.record.updateMany({
            where: { id: record.id, revision: record.revision },
            data: {
              state: 'expired',
              data: json({ ...data, cleanup: 'retained-preexisting-role' }),
            },
          });
          return;
        }
      }
      const currentGuard = await this.platform.read(actor, (ctx) =>
        guardAutomationEffect(ctx, p),
      );
      if (
        !currentGuard.deliver ||
        currentGuard.record?.revision !== record.revision
      )
        return;
      if (desired && !member.roles.includes(roleId))
        await this.discord.addRole(work.guildId, userId, roleId);
      if (!desired && member.roles.includes(roleId))
        await this.discord.removeRole(work.guildId, userId, roleId);
      if (record.kind !== 'workflow_run')
        await this.db.record.updateMany({
          where: { id: record.id, revision: record.revision },
          data: {
            state: desired ? 'applied' : 'expired',
            data: json({
              ...data,
              appliedAt: new Date().toISOString(),
              desiredRoleId: roleId,
              ...(['birthday_role', 'invite_reward'].includes(record.kind)
                ? { roleAddedBySparko }
                : {}),
            }),
          },
        });
    } else if (work.type === 'automation.ticket') {
      const member = await this.discord.actor(
        this.db,
        work.guildId,
        Snowflake.parse(p['userId']),
      );
      await this.platform.mutate(
        member,
        'worker.workflow.ticket',
        work.id,
        p,
        (ctx) => openTicket(ctx, { categoryId: p['categoryId'], answers: {} }),
      );
    } else if (work.type === 'automation.voice') {
      await this.voice(work, record.id, p);
    } else if (work.type === 'automation.custom.register') {
      const author = await this.discord.actor(
        this.db,
        work.guildId,
        Snowflake.parse(record.ownerId),
      );
      if (!allowed(author, 'automation.manage'))
        throw new DomainError(
          'FORBIDDEN',
          'The command author no longer has automation access.',
          403,
        );
      const desired = await this.db.record.findMany({
        where: {
          guildId: work.guildId,
          kind: 'custom_command',
          state: 'active',
        },
        take: 20,
      });
      const existing = z
        .array(z.object({ id: z.string(), name: z.string() }))
        .parse(
          await this.discord.rest.get(
            Routes.applicationGuildCommands(
              this.discord.botUserId,
              work.guildId,
            ),
          ),
        );
      for (const current of existing.filter(
        (command) =>
          command.name.startsWith('spark-') &&
          !desired.some(
            (target) => jsonObject(target.data)['name'] === command.name,
          ),
      ))
        await this.discord.rest.delete(
          Routes.applicationGuildCommand(
            this.discord.botUserId,
            work.guildId,
            current.id,
          ),
        );
      for (const target of desired) {
        const config = z
          .object({
            name: z.string().regex(/^spark-[a-z0-9-]{1,25}$/),
            description: z.string().min(1).max(100),
          })
          .parse(target.data);
        const current = existing.find(
          (command) => command.name === config.name,
        );
        if (current)
          await this.discord.rest.patch(
            Routes.applicationGuildCommand(
              this.discord.botUserId,
              work.guildId,
              current.id,
            ),
            { body: config },
          );
        else
          await this.discord.rest.post(
            Routes.applicationGuildCommands(
              this.discord.botUserId,
              work.guildId,
            ),
            { body: { ...config, type: 1 } },
          );
        await this.db.record.update({
          where: { id: target.id },
          data: {
            data: json({
              ...jsonObject(target.data),
              registrationState: 'applied',
            }),
          },
        });
      }
    } else
      throw new DomainError(
        'INVALID_INPUT',
        `No automation handler is installed for ${work.type}.`,
      );
    await this.platform.mutate(
      actor,
      'worker.automation.complete',
      work.id,
      { payload: p, result },
      (ctx) => completeAutomationEffect(ctx, p, result),
    );
  }

  private async voice(
    work: OutboxWork,
    id: string,
    p: Record<string, unknown>,
  ) {
    const room = await this.record(work.guildId, id, 'voice_room');
    const data = jsonObject(room.data);
    const control = jsonObject(p['control']);
    const action = z
      .enum([
        'create',
        'rename',
        'limit',
        'lock',
        'unlock',
        'transfer',
        'permit',
        'revoke',
        'delete',
        'cleanup',
      ])
      .parse(control['action']);
    const [guild, roles, bot, member] = await Promise.all([
      this.discord.guild(work.guildId),
      this.discord.roles(work.guildId),
      this.discord.member(work.guildId, this.discord.botUserId),
      this.discord.member(
        work.guildId,
        Snowflake.parse(p['userId'] ?? room.ownerId),
      ),
    ]);
    assertPermissions(
      effectivePermissions(guild, roles, bot),
      PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers,
      'Sparko needs Manage Channels and Move Members for temporary voice rooms.',
    );
    if (action === 'create') {
      const existing = await this.discord.channels(work.guildId);
      const name = z.string().min(1).max(80).parse(data['name']);
      let channelId =
        typeof data['channelId'] === 'string' ? data['channelId'] : undefined;
      if (!channelId && work.attempts > 1)
        throw new DeliveryUncertainError(
          'Voice room creation may have succeeded. Reconcile the room before retrying.',
        );
      if (!channelId) {
        const category =
          typeof data['categoryId'] === 'string'
            ? data['categoryId']
            : undefined;
        if (
          category &&
          !existing.some(
            (channel) => channel.id === category && channel.type === 4,
          )
        )
          throw new DomainError(
            'NOT_FOUND',
            'The voice category is unavailable.',
            404,
          );
        const channel = await this.discord.createChannel(work.guildId, {
          name,
          type: 2,
          ...(category ? { parent_id: category } : {}),
          user_limit: z.number().int().min(0).max(99).parse(data['userLimit']),
          permission_overwrites: [
            {
              id: member.user.id,
              type: 1,
              allow: (
                PermissionFlagsBits.ViewChannel |
                PermissionFlagsBits.Connect |
                PermissionFlagsBits.Speak
              ).toString(),
              deny: '0',
            },
          ],
        });
        channelId = channel.id;
      }
      await this.db.record.update({
        where: { id },
        data: {
          state: 'active',
          data: json({
            ...data,
            channelId,
            occupants: [member.user.id],
            occupantsObservedAt: new Date().toISOString(),
          }),
        },
      });
      await this.discord.rest.patch(
        Routes.guildMember(work.guildId, member.user.id),
        { body: { channel_id: channelId } },
      );
      return;
    }
    const channelId = Snowflake.parse(data['channelId']);
    if (p['channelId'] && p['channelId'] !== channelId)
      throw new DomainError(
        'FORBIDDEN',
        'The voice control belongs to another room.',
        403,
      );
    await this.discord.channelPermissions(
      work.guildId,
      channelId,
      PermissionFlagsBits.ManageChannels,
    );
    if (action !== 'cleanup' && member.user.id !== room.ownerId)
      throw new DomainError(
        'FORBIDDEN',
        'Only the current room owner can use this control.',
        403,
      );
    if (['delete', 'cleanup'].includes(action)) {
      // A bot-produced snapshot request is durable; the worker never treats old occupancy as current.
      const requestKey = `voice:${work.id}`;
      const observation = await this.db.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: work.guildId,
            kind: 'gateway.request',
            key: requestKey,
          },
        },
      });
      if (!observation) {
        await this.db.record.create({
          data: {
            guildId: work.guildId,
            kind: 'gateway.request',
            key: requestKey,
            state: 'pending',
            data: json({
              channelId,
              type: 'voice-occupants',
              requestedAt: new Date().toISOString(),
            }),
          },
        });
        throw new DomainError(
          'SERVICE_UNAVAILABLE',
          'Waiting for a current Gateway occupancy check before cleanup.',
          503,
        );
      }
      const snapshot = jsonObject(observation.data);
      const heartbeat = await this.db.heartbeat.findUnique({
        where: { service: 'bot' },
      });
      if (
        observation.state !== 'observed' ||
        !Number.isFinite(Date.parse(String(snapshot['observedAt']))) ||
        Date.now() - Date.parse(String(snapshot['observedAt'])) > 10_000 ||
        !heartbeat ||
        heartbeat.status !== 'connected' ||
        Date.now() - heartbeat.updatedAt.getTime() > 45_000 ||
        snapshot['observationId'] !==
          jsonObject(heartbeat.details)['observationId']
      ) {
        await this.db.record.update({
          where: { id: observation.id },
          data: { state: 'pending' },
        });
        throw new DomainError(
          'SERVICE_UNAVAILABLE',
          'Waiting for a current Gateway occupancy check before cleanup.',
          503,
        );
      }
      if (
        Array.isArray(snapshot['occupants']) &&
        snapshot['occupants'].length > 0
      )
        throw new DomainError(
          'INVALID_INPUT',
          'The room is occupied and has been retained.',
        );
      await this.discord.deleteChannel(channelId);
      await this.db.record.update({
        where: { id },
        data: { state: 'deleted' },
      });
      return;
    }
    if (action === 'rename')
      await this.discord.rest.patch(Routes.channel(channelId), {
        body: { name: z.string().min(1).max(80).parse(control['name']) },
      });
    if (action === 'limit')
      await this.discord.rest.patch(Routes.channel(channelId), {
        body: {
          user_limit: z.number().int().min(0).max(99).parse(control['limit']),
        },
      });
    if (action === 'lock' || action === 'unlock')
      await this.discord.rest.put(
        Routes.channelPermission(channelId, work.guildId),
        {
          body: {
            type: 0,
            allow: '0',
            deny:
              action === 'lock' ? PermissionFlagsBits.Connect.toString() : '0',
          },
        },
      );
    if (action === 'transfer') {
      const newOwner = Snowflake.parse(control['userId']);
      await this.discord.member(work.guildId, newOwner);
      await this.db.record.update({
        where: { id },
        data: { ownerId: newOwner },
      });
    }
    if (action === 'permit' || action === 'revoke') {
      const userId = Snowflake.parse(control['userId']);
      await this.discord.member(work.guildId, userId);
      await this.discord.rest.put(Routes.channelPermission(channelId, userId), {
        body: {
          type: 1,
          allow:
            action === 'permit' ? PermissionFlagsBits.Connect.toString() : '0',
          deny:
            action === 'revoke' ? PermissionFlagsBits.Connect.toString() : '0',
        },
      });
    }
    await this.db.record.update({
      where: { id },
      data: {
        data: json({
          ...data,
          pendingControl: null,
          lastAppliedAt: new Date().toISOString(),
        }),
      },
    });
  }

  /**
   * End a timed ban or lock after rechecking that the same instance is still
   * current and that Discord still shows it. A manual unban/unlock found in
   * Discord is recorded as superseded instead of being repeated.
   */
  private async clearPunishment(work: OutboxWork, p: Record<string, unknown>) {
    const input = PunishmentExpirySchema.parse(p);
    const punishment = await this.record(
      work.guildId,
      p['punishmentId'],
      'safety.punishment',
    );
    const data = jsonObject(punishment.data);
    if (
      data['activeCaseId'] !== input.caseId ||
      data['instanceId'] !== input.instanceId ||
      !['active', 'expiring'].includes(punishment.state)
    )
      return;
    const supersede = () =>
      this.db.record.update({
        where: { id: punishment.id },
        data: { state: 'superseded' },
      });
    const [guild, roles, bot] = await Promise.all([
      this.discord.guild(work.guildId),
      this.discord.roles(work.guildId),
      this.discord.member(work.guildId, this.discord.botUserId),
    ]);
    const reason = 'Temporary action ended (Sparko case schedule).';
    if (input.kind === 'ban') {
      assertPermissions(
        effectivePermissions(guild, roles, bot),
        PermissionFlagsBits.BanMembers,
        'Sparko needs Ban Members to end this ban.',
      );
      try {
        await this.discord.rest.get(
          Routes.guildBan(work.guildId, input.subjectId),
        );
      } catch (error) {
        if (error instanceof DiscordAPIError && Number(error.code) === 10026) {
          await supersede();
          return;
        }
        throw error;
      }
      await this.discord.rest.delete(
        Routes.guildBan(work.guildId, input.subjectId),
        { reason },
      );
    } else {
      const scope = await this.discord.channelPermissions(
        work.guildId,
        input.subjectId,
        PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles,
      );
      const everyone = scope.channel.permission_overwrites.find(
        (overwrite) => overwrite.type === 0 && overwrite.id === work.guildId,
      );
      if (
        !everyone ||
        (BigInt(everyone.deny) & PermissionFlagsBits.SendMessages) === 0n
      ) {
        await supersede();
        return;
      }
      await this.discord.rest.put(
        Routes.channelPermission(input.subjectId, work.guildId),
        {
          body: {
            type: 0,
            allow: everyone.allow,
            deny: (
              BigInt(everyone.deny) & ~PermissionFlagsBits.SendMessages
            ).toString(),
          },
          reason,
        },
      );
    }
    await this.db.record.update({
      where: { id: punishment.id },
      data: { state: 'expired' },
    });
    await this.db.record.updateMany({
      where: { id: input.caseId, guildId: work.guildId },
      data: { state: 'expired' },
    });
  }
  private async safety(work: OutboxWork, p: Record<string, unknown>) {
    if (work.type === 'safety.punishment.expire') {
      await this.transaction(work, (ctx) =>
        processSafetyDue(ctx, work.type, p),
      );
      return;
    }
    if (work.type === 'safety.punishment.clear') {
      await this.clearPunishment(work, p);
      return;
    }
    if (work.type === 'safety.timeout.expire') {
      await this.transaction(work, (ctx) =>
        processSafetyDue(ctx, work.type, p),
      );
      return;
    }
    if (work.type === 'safety.timeout.clear') {
      const punishment = await this.record(
        work.guildId,
        p['punishmentId'],
        'safety.punishment',
      );
      const data = jsonObject(punishment.data);
      if (
        data['activeCaseId'] !== p['caseId'] ||
        data['instanceId'] !== p['instanceId'] ||
        !['active', 'expiring'].includes(punishment.state)
      )
        return;
      const member = await this.discord.member(
        work.guildId,
        Snowflake.parse(p['userId']),
      );
      if (
        !canExpireTimeout(
          String(p['caseId']),
          String(data['activeCaseId']),
          String(data['appliedTimeoutUntil']),
          member.communication_disabled_until ?? null,
        )
      ) {
        await this.db.record.update({
          where: { id: punishment.id },
          data: { state: 'superseded' },
        });
        return;
      }
      const [guild, roles, bot] = await Promise.all([
        this.discord.guild(work.guildId),
        this.discord.roles(work.guildId),
        this.discord.member(work.guildId, this.discord.botUserId),
      ]);
      assertPermissions(
        effectivePermissions(guild, roles, bot),
        PermissionFlagsBits.ModerateMembers,
        'Sparko needs Timeout Members.',
      );
      await this.discord.rest.patch(
        Routes.guildMember(work.guildId, member.user.id),
        { body: { communication_disabled_until: null } },
      );
      await this.db.record.update({
        where: { id: punishment.id },
        data: { state: 'expired' },
      });
      await this.db.record.updateMany({
        where: { id: String(p['caseId']), guildId: work.guildId },
        data: { state: 'expired' },
      });
      return;
    }
    if (
      work.type === 'safety.verification.role' ||
      work.type === 'safety.protection'
    ) {
      const record = await this.record(
        work.guildId,
        p['recordId'] ?? p['incidentId'],
      );
      if (
        typeof p['expectedRevision'] === 'number' &&
        record.revision !== p['expectedRevision']
      )
        return;
      const featureId = ID.parse(p['featureId']);
      const configuration = await this.db.featureConfig.findUnique({
        where: { guildId_featureId: { guildId: work.guildId, featureId } },
      });
      const config = jsonObject(configuration?.config);
      // Same gate as every new action: on, not paused by staff, within plan.
      await this.platform.read(
        systemActor(work.guildId, this.discord.botUserId),
        (ctx) => ctx.requireFeature(featureId),
      );
      const roleId = Snowflake.parse(
        p['roleId'] ?? config['quarantineRoleId'] ?? config['roleId'],
      );
      const userId = Snowflake.parse(p['userId']);
      if (
        work.type === 'safety.verification.role' &&
        (config['rulesVersion'] !== p['rulesVersion'] ||
          config['roleId'] !== roleId)
      )
        throw new DomainError(
          'FORBIDDEN',
          'Verification rules changed. Review them again.',
          403,
        );
      if (
        work.type === 'safety.protection' &&
        config['mode'] !== 'quarantine' &&
        config['mode'] !== 'enforce'
      )
        throw new DomainError(
          'FORBIDDEN',
          'Protection is in observe mode.',
          403,
        );
      const [guild, roles, bot] = await Promise.all([
        this.discord.guild(work.guildId),
        this.discord.roles(work.guildId),
        this.discord.member(work.guildId, this.discord.botUserId),
      ]);
      assertRoleAssignable(guild, roles, bot, roleId);
      await this.discord.member(work.guildId, userId);
      await this.discord.addRole(work.guildId, userId, roleId);
      await this.db.record.update({
        where: { id: record.id },
        data: {
          state: 'applied',
          data: json({
            ...jsonObject(record.data),
            appliedAt: new Date().toISOString(),
            roleId,
          }),
        },
      });
      return;
    }
    if (work.type === 'safety.notify') {
      const record = await this.record(work.guildId, p['recordId']);
      const data = jsonObject(record.data);
      if (p['afterDelivery'] === true && data['delivery'] !== 'applied')
        throw new DomainError(
          'SERVICE_UNAVAILABLE',
          'Waiting for the moderation action before notifying.',
          503,
        );
      let channelId: string;
      if (p['staffOnly'] === true) {
        const featureId =
          typeof data['feature'] === 'string' ? data['feature'] : 'R29';
        const config = await this.db.featureConfig.findUnique({
          where: { guildId_featureId: { guildId: work.guildId, featureId } },
        });
        channelId = Snowflake.parse(
          jsonObject(config?.config)['alertChannelId'],
        );
        await this.discord.channelPermissions(
          work.guildId,
          channelId,
          sendPermissions,
        );
      } else channelId = await this.discord.dm(Snowflake.parse(p['userId']));
      const history = Array.isArray(data['history']) ? data['history'] : [];
      const last = jsonObject(history.at(-1));
      await this.sendTracked(
        work,
        channelId,
        textPayload(
          p['kind'] === 'case'
            ? `Sparko moderation case #${String(data['number'])} (${String(data['action'])}): ${String(data['reason'] ?? '')}\nIf you think this was a mistake, you can appeal it from your member profile on the Sparko dashboard.`
            : `Sparko ${String(p['kind'])}: ${record.state}. ${String(data['reason'] ?? last['reason'] ?? 'Open your permitted dashboard record for details.')}`,
        ),
      );
      return;
    }
    if (work.type !== 'safety.moderate')
      throw new DomainError(
        'INVALID_INPUT',
        `No safety delivery handler is installed for ${work.type}.`,
      );
    const record = await this.record(
      work.guildId,
      p['caseId'],
      'moderation_case',
    );
    if (
      record.revision !== p['caseRevision'] ||
      !['pending', 'active'].includes(record.state) ||
      jsonObject(record.data)['delivery'] === 'applied'
    )
      return;
    const input = z
      .object({
        action: z.enum([
          'warn',
          'timeout',
          'kick',
          'ban',
          'unban',
          'purge',
          'slowmode',
          'lock',
          'unlock',
        ]),
        targetId: Snowflake.optional(),
        channelId: Snowflake.optional(),
        reason: z.string().min(3).max(1000),
        durationSeconds: z.number().int().min(1).max(2419200).optional(),
        count: z.number().int().min(1).max(100).optional(),
        slowmodeSeconds: z.number().int().min(0).max(21600).optional(),
        confirm: z.boolean(),
      })
      .parse(p['input']);
    const source = jsonObject(p['source']);
    const [guild, roles, bot] = await Promise.all([
      this.discord.guild(work.guildId),
      this.discord.roles(work.guildId),
      this.discord.member(work.guildId, this.discord.botUserId),
    ]);
    const permissions = {
      warn: PermissionFlagsBits.ModerateMembers,
      timeout: PermissionFlagsBits.ModerateMembers,
      kick: PermissionFlagsBits.KickMembers,
      ban: PermissionFlagsBits.BanMembers,
      unban: PermissionFlagsBits.BanMembers,
      purge: PermissionFlagsBits.ManageMessages,
      slowmode: PermissionFlagsBits.ManageChannels,
      lock: PermissionFlagsBits.ManageChannels,
      unlock: PermissionFlagsBits.ManageChannels,
    }[input.action];
    assertPermissions(
      effectivePermissions(guild, roles, bot),
      permissions,
      'Sparko lacks the permission for this moderation action.',
    );
    let moderatorId = Snowflake.parse(p['actorId']);
    if (source['automation'] === true) {
      const config = await this.db.featureConfig.findUnique({
        where: {
          guildId_featureId: {
            guildId: work.guildId,
            featureId: ID.parse(source['featureId']),
          },
        },
      });
      const cfg = jsonObject(config?.config);
      if (
        cfg['mode'] !== 'enforce' ||
        !(await this.platform.read(
          systemActor(work.guildId, this.discord.botUserId),
          (ctx) =>
            featureActive(ctx.tx, ctx.guildId, ID.parse(source['featureId'])),
        ))
      )
        throw new DomainError(
          'FORBIDDEN',
          'Automatic enforcement was disabled.',
          403,
        );
      moderatorId = this.discord.botUserId;
    } else {
      const actor = await this.discord.actor(
        this.db,
        work.guildId,
        moderatorId,
      );
      if (!allowed(actor, 'moderation.execute'))
        throw new DomainError(
          'FORBIDDEN',
          'Your current access no longer permits moderation.',
          403,
        );
      const moderator = await this.discord.member(work.guildId, moderatorId);
      assertPermissions(
        effectivePermissions(guild, roles, moderator),
        permissions,
        'The moderator lacks the Discord permission for this action.',
      );
    }
    if (input.targetId && input.action !== 'unban') {
      if (
        input.targetId === guild.owner_id ||
        input.targetId === moderatorId ||
        input.targetId === this.discord.botUserId
      )
        throw new DomainError(
          'FORBIDDEN',
          'This member cannot be moderated by Sparko.',
          403,
        );
      const target = await this.discord.member(work.guildId, input.targetId);
      const moderator = await this.discord.member(work.guildId, moderatorId);
      const highest = (ids: string[]) =>
        Math.max(
          0,
          ...roles
            .filter((role) => ids.includes(role.id))
            .map((role) => role.position),
        );
      if (
        highest(target.roles) >= highest(bot.roles) ||
        (moderatorId !== guild.owner_id &&
          highest(target.roles) >= highest(moderator.roles))
      )
        throw new DomainError(
          'MISSING_PERMISSION',
          'Move the bot and moderator roles above the target’s roles.',
          403,
        );
      if (
        input.action === 'timeout' &&
        (effectivePermissions(guild, roles, target) &
          PermissionFlagsBits.Administrator) !==
          0n
      )
        throw new DomainError(
          'FORBIDDEN',
          'Server administrators cannot be timed out.',
          403,
        );
    }
    const data = jsonObject(record.data);
    let appliedTimeoutUntil: string | undefined;
    if (input.action === 'timeout') {
      const active = await this.db.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: work.guildId,
            kind: 'safety.punishment',
            key: `timeout:${String(input.targetId)}`,
          },
        },
      });
      const activeCaseId = jsonObject(active?.data)['activeCaseId'];
      if (typeof activeCaseId === 'string' && activeCaseId !== record.id) {
        const newer = await this.db.record.findFirst({
          where: {
            id: activeCaseId,
            guildId: work.guildId,
            kind: 'moderation_case',
          },
        });
        if (newer && newer.createdAt >= record.createdAt) {
          await this.db.record.updateMany({
            where: { id: record.id, revision: record.revision },
            data: { state: 'superseded' },
          });
          return;
        }
      }
      appliedTimeoutUntil = new Date(
        Date.parse(String(data['requestedAt'])) +
          z.number().parse(input.durationSeconds) * 1000,
      ).toISOString();
      if (Date.parse(appliedTimeoutUntil) <= Date.now())
        throw new DomainError(
          'INVALID_INPUT',
          'The requested timeout duration has already elapsed.',
        );
      await this.discord.rest.patch(
        Routes.guildMember(work.guildId, Snowflake.parse(input.targetId)),
        {
          body: { communication_disabled_until: appliedTimeoutUntil },
          reason: input.reason,
        },
      );
    } else if (input.action === 'kick')
      await this.discord.rest.delete(
        Routes.guildMember(work.guildId, Snowflake.parse(input.targetId)),
        { reason: input.reason },
      );
    else if (input.action === 'ban')
      await this.discord.rest.put(
        Routes.guildBan(work.guildId, Snowflake.parse(input.targetId)),
        { body: { delete_message_seconds: 0 }, reason: input.reason },
      );
    else if (input.action === 'unban')
      await this.discord.rest.delete(
        Routes.guildBan(work.guildId, Snowflake.parse(input.targetId)),
        { reason: input.reason },
      );
    else if (input.action !== 'warn') {
      const channelId = Snowflake.parse(input.channelId);
      const scope = await this.discord.channelPermissions(
        work.guildId,
        channelId,
        permissions,
      );
      if (input.action === 'slowmode')
        await this.discord.rest.patch(Routes.channel(channelId), {
          body: { rate_limit_per_user: input.slowmodeSeconds },
          reason: input.reason,
        });
      if (input.action === 'lock' || input.action === 'unlock') {
        const previous = scope.channel.permission_overwrites.find(
          (overwrite) => overwrite.type === 0 && overwrite.id === work.guildId,
        );
        await this.discord.rest.put(
          Routes.channelPermission(channelId, work.guildId),
          {
            body: {
              type: 0,
              allow: (
                BigInt(previous?.allow ?? '0') &
                ~PermissionFlagsBits.SendMessages
              ).toString(),
              deny:
                input.action === 'lock'
                  ? (
                      BigInt(previous?.deny ?? '0') |
                      PermissionFlagsBits.SendMessages
                    ).toString()
                  : (
                      BigInt(previous?.deny ?? '0') &
                      ~PermissionFlagsBits.SendMessages
                    ).toString(),
            },
            reason: input.reason,
          },
        );
      }
      if (input.action === 'purge') {
        let messageIds = z.array(Snowflake).safeParse(data['purgeMessageIds']);
        if (!messageIds.success) {
          const selected = (await this.discord.messages(channelId))
            .slice(0, z.number().parse(input.count))
            .filter(
              (message) =>
                Date.now() - Date.parse(message.timestamp) < 14 * 86_400_000,
            )
            .map((message) => message.id);
          await this.db.record.update({
            where: { id: record.id },
            data: { data: json({ ...data, purgeMessageIds: selected }) },
          });
          messageIds = z.array(Snowflake).safeParse(selected);
        }
        if (!messageIds.success || !messageIds.data.length)
          throw new DomainError(
            'INVALID_INPUT',
            'No recent eligible messages were found for this purge.',
          );
        if (messageIds.data.length === 1 && messageIds.data[0])
          await this.discord.deleteMessage(channelId, messageIds.data[0]);
        else
          await this.discord.rest.post(Routes.channelBulkDelete(channelId), {
            body: { messages: messageIds.data },
            reason: input.reason,
          });
      }
    }
    await this.transaction(work, async (ctx) => {
      const current = await ctx.tx.record.findFirstOrThrow({
        where: { id: record.id, guildId: work.guildId },
      });
      await ctx.tx.record.update({
        where: { id: record.id },
        data: {
          state: 'active',
          data: json({
            ...jsonObject(current.data),
            delivery: 'applied',
            appliedAt: new Date().toISOString(),
            ...(appliedTimeoutUntil
              ? { appliedTimeoutUntil, instanceId: work.id }
              : {}),
          }),
        },
      });
      // Timed bans and locks get an instance and an expiry timer; any other
      // ban/unban or lock/unlock replaces the previous instance.
      const subjectId = ['ban', 'unban'].includes(input.action)
        ? input.targetId
        : ['lock', 'unlock'].includes(input.action)
          ? input.channelId
          : undefined;
      if (subjectId) {
        const kind = ['ban', 'unban'].includes(input.action) ? 'ban' : 'lock';
        const expiresAt =
          ['ban', 'lock'].includes(input.action) && input.durationSeconds
            ? new Date(
                Date.parse(String(data['requestedAt'])) +
                  input.durationSeconds * 1000,
              ).toISOString()
            : null;
        const state = expiresAt
          ? 'active'
          : ['unban', 'unlock'].includes(input.action)
            ? 'cleared'
            : 'permanent';
        const punishmentData = json({
          activeCaseId: record.id,
          instanceId: work.id,
          expiresAt,
        });
        await ctx.tx.record.upsert({
          where: {
            guildId_kind_key: {
              guildId: work.guildId,
              kind: 'safety.punishment',
              key: `${kind}:${subjectId}`,
            },
          },
          create: {
            guildId: work.guildId,
            kind: 'safety.punishment',
            key: `${kind}:${subjectId}`,
            ownerId: input.targetId ?? null,
            state,
            data: punishmentData,
          },
          update: {
            state,
            data: punishmentData,
            revision: { increment: 1 },
          },
        });
        if (expiresAt)
          await ctx.effect(
            'safety.punishment.expire',
            {
              kind,
              subjectId,
              caseId: record.id,
              instanceId: work.id,
              expiresAt,
            },
            new Date(expiresAt),
          );
      }
      if (appliedTimeoutUntil && input.targetId) {
        await ctx.tx.record.upsert({
          where: {
            guildId_kind_key: {
              guildId: work.guildId,
              kind: 'safety.punishment',
              key: `timeout:${input.targetId}`,
            },
          },
          create: {
            guildId: work.guildId,
            kind: 'safety.punishment',
            key: `timeout:${input.targetId}`,
            ownerId: input.targetId,
            state: 'active',
            data: json({
              activeCaseId: record.id,
              instanceId: work.id,
              appliedTimeoutUntil,
            }),
          },
          update: {
            state: 'active',
            data: json({
              activeCaseId: record.id,
              instanceId: work.id,
              appliedTimeoutUntil,
            }),
            revision: { increment: 1 },
          },
        });
        await ctx.effect(
          'safety.timeout.expire',
          {
            caseId: record.id,
            instanceId: work.id,
            userId: input.targetId,
            appliedTimeoutUntil,
          },
          new Date(appliedTimeoutUntil),
        );
      }
      return { applied: true };
    });
  }
}
