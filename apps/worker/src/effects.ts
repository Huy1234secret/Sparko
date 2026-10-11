import { createHash } from 'node:crypto';
import { PermissionFlagsBits, Routes } from 'discord.js';
import { z } from 'zod';
import { json, type PrismaClient } from '@sparko/db';
import { DomainError, TicketConfigSchema, type Actor } from '@sparko/contracts';
import { Platform, completeAutomationEffect, guardAutomationEffect, jsonObject, openTicket, processAutomationDue, publishDocument, runCommunityJob } from '@sparko/domain';
import { BRAND_YELLOW, MessageDocumentSchema, compileMessage, type MessageDocument } from '@sparko/messages';
import { allowed } from '@sparko/policy';
import { DiscordRest, assertPermissions, assertRoleAssignable, effectivePermissions } from './discord.js';

export type OutboxWork = { id: string; guildId: string; type: string; payload: unknown; attempts: number; fence: number };
const ID = z.string().min(1); const Snowflake = z.string().regex(/^[1-9][0-9]{16,19}$/);
const textPayload = (content: string) => ({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } });
const nonce = (id: string) => createHash('sha256').update(id).digest('hex').slice(0, 25);
function systemActor(guildId: string, userId: string): Actor { return { guildId, userId, roles: [], isAdmin: false, isOwner: false, capabilities: [], globalCapabilities: [] }; }
const sendPermissions = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory;
function controlIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(controlIds);
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  return [...(typeof object['custom_id'] === 'string' ? [object['custom_id']] : []), ...Object.values(object).flatMap(controlIds)];
}

export class EffectExecutor {
  readonly platform: Platform;
  constructor(readonly db: PrismaClient, readonly discord: DiscordRest) { this.platform = new Platform(db); }
  private async record(guildId: string, id: unknown, kind?: string) {
    const record = await this.db.record.findFirst({ where: { id: ID.parse(id), guildId, ...(kind ? { kind } : {}) } });
    if (!record) throw new DomainError('NOT_FOUND', 'The source record is unavailable.', 404); return record;
  }
  private async transaction(work: OutboxWork, task: Parameters<Platform['mutate']>[4]) {
    return this.platform.mutate(systemActor(work.guildId, this.discord.botUserId), `worker:${work.type}`, work.id, work.payload, task);
  }
  async execute(work: OutboxWork): Promise<void> {
    const p = jsonObject(work.payload);
    if (work.type === 'config.apply') {
      const heartbeat = await this.db.heartbeat.findUnique({ where: { service: 'bot' } });
      if (!heartbeat || heartbeat.status !== 'connected' || Date.now() - heartbeat.updatedAt.getTime() > 45_000) throw new DomainError('SERVICE_UNAVAILABLE', 'Settings are saved. Waiting for the bot to connect.', 503);
      await this.discord.member(work.guildId, this.discord.botUserId);
      await this.db.featureConfig.updateMany({ where: { guildId: work.guildId, featureId: ID.parse(p['featureId']), revision: z.number().int().parse(p['revision']) }, data: { appliedRevision: z.number().int().parse(p['revision']) } }); return;
    }
    if (work.type.startsWith('publication.')) { await this.publication(work, p); return; }
    if (work.type === 'ticket.create') { await this.createTicket(work, ID.parse(p['ticketId'])); return; }
    if (work.type === 'ticket.capture') { await this.captureTicket(work, ID.parse(p['ticketId'])); return; }
    if (work.type === 'ticket.participants') {
      const ticket = await this.db.ticket.findFirst({ where: { id: ID.parse(p['ticketId']), guildId: work.guildId } });
      if (!ticket?.channelId || !['open', 'claimed', 'awaiting_member', 'awaiting_staff'].includes(ticket.state)) throw new DomainError('NOT_FOUND', 'The ticket is unavailable.', 404);
      const userId = Snowflake.parse(p['userId']); const desired = ticket.participants.includes(userId);
      if (desired !== p['desired']) return;
      await this.discord.channelPermissions(work.guildId, ticket.channelId, PermissionFlagsBits.ManageChannels);
      if (desired) await this.discord.rest.put(Routes.channelPermission(ticket.channelId, userId), { body: { type: 1, allow: sendPermissions.toString(), deny: '0' } });
      else await this.discord.rest.delete(Routes.channelPermission(ticket.channelId, userId)); return;
    }
    if (['community.giveaway.draw', 'community.giveaway.claim-expire', 'community.crate.drop', 'community.crate.expire', 'community.crate.schedule', 'community.roles.expire'].includes(work.type)) { await this.transaction(work, (ctx) => runCommunityJob(ctx, work.type, p)); return; }
    if (work.type === 'community.level.changed') { await this.transaction(work, async (ctx) => ctx.tx.auditLog.create({ data: { guildId: work.guildId, actorId: this.discord.botUserId, action: work.type, summary: json(p) } })); return; }
    if (work.type === 'community.roles.reconcile' || work.type === 'control.role') { await this.roles(work, p); return; }
    if (work.type === 'community.message') { await this.message(work, p); return; }
    if (work.type.startsWith('community.')) { await this.community(work, p); return; }
    if (work.type === 'control.channel.response') {
      const actor = await this.discord.actor(this.db, work.guildId, Snowflake.parse(p['actorId']));
      if (!allowed(actor, 'messages.respond') && !allowed(actor, 'messages.publish')) throw new DomainError('FORBIDDEN', 'Channel responses require current message publishing access.', 403);
      const channel = Snowflake.parse(p['channelId']); await this.discord.channelPermissions(work.guildId, channel, sendPermissions);
      await this.discord.send(channel, textPayload(z.string().parse(p['text'])), nonce(work.id)); return;
    }
    if (work.type === 'automation.due') { await this.transaction(work, (ctx) => processAutomationDue(ctx, work.type, p)); return; }
    if (work.type.startsWith('automation.')) { await this.automation(work, p); return; }
    if (work.type.startsWith('safety.')) { await this.safety(work, p); return; }
    throw new DomainError('INVALID_INPUT', `No delivery handler is installed for ${work.type}.`, 400);
  }

  private async publication(work: OutboxWork, p: Record<string, unknown>) {
    const publication = await this.db.publication.findFirst({ where: { id: ID.parse(p['publicationId']), guildId: work.guildId }, include: { controls: true } });
    if (!publication) throw new DomainError('NOT_FOUND', 'Publication unavailable.', 404);
    if (work.type === 'publication.archive') {
      if (publication.messageId) { await this.discord.channelPermissions(work.guildId, publication.channelId, sendPermissions); await this.discord.edit(publication.channelId, publication.messageId, { components: [] }); }
      return;
    }
    if (publication.state === 'archived' || publication.state === 'replaced') return;
    const controls = Object.fromEntries(publication.controls.filter((control) => !control.revoked).map((control) => [control.key, control.id]));
    const document = MessageDocumentSchema.parse(publication.document); const payload = compileMessage(document, {}, controls);
    await this.discord.channelPermissions(work.guildId, publication.channelId, sendPermissions | (document.mode === 'embed' && document.embeds.length ? PermissionFlagsBits.EmbedLinks : 0n));
    let messageId = publication.messageId;
    if (!messageId && work.attempts > 1) {
      const expected = Object.values(controls);
      if (expected.length) {
        const messages = await this.discord.messages(publication.channelId);
        const matches = messages.filter((message) => message.author.id === this.discord.botUserId && expected.every((id) => controlIds(message.components).includes(id)));
        if (matches.length === 1) messageId = matches[0]?.id ?? null;
        if (matches.length > 1) throw new DomainError('SERVICE_UNAVAILABLE', 'Multiple matching publications need owner reconciliation.', 503);
      }
      if (!messageId) throw new DomainError('SERVICE_UNAVAILABLE', 'A previous send may have succeeded. Inspect the channel before retrying publication.', 503);
    }
    if (messageId) { if (work.type === 'publication.update') await this.discord.edit(publication.channelId, messageId, payload); }
    else messageId = (await this.discord.send(publication.channelId, payload, nonce(work.id))).id;
    await this.db.publication.update({ where: { id: publication.id }, data: { messageId, state: 'applied', appliedRevision: publication.revision } });
  }

  private async createTicket(work: OutboxWork, id: string) {
    const ticket = await this.db.ticket.findFirst({ where: { id, guildId: work.guildId } });
    if (!ticket) throw new DomainError('NOT_FOUND', 'Ticket unavailable.', 404);
    if (['closed', 'closing'].includes(ticket.state)) return;
    const settings = TicketConfigSchema.parse(ticket.snapshot);
    const [guild, roles, bot, channels] = await Promise.all([this.discord.guild(work.guildId), this.discord.roles(work.guildId), this.discord.member(work.guildId, this.discord.botUserId), this.discord.channels(work.guildId)]);
    assertPermissions(effectivePermissions(guild, roles, bot), PermissionFlagsBits.ManageChannels | sendPermissions, 'Sparko needs Manage Channels, View Channel, Send Messages and Read Message History.');
    await this.discord.member(work.guildId, ticket.ownerId);
    if (settings.staffRoleIds.some((id) => !roles.some((role) => role.id === id))) throw new DomainError('MISSING_PERMISSION', 'A configured support role was removed. Review ticket setup.', 403);
    if (settings.categoryChannelId && !channels.some((channel) => channel.id === settings.categoryChannelId && channel.type === 4)) throw new DomainError('MISSING_PERMISSION', 'The ticket category was removed. Review ticket setup.', 403);
    const marker = `sparko:ticket:${ticket.id}`;
    const existing = channels.filter((channel) => channel.topic?.includes(marker));
    if (existing.length > 1) throw new DomainError('SERVICE_UNAVAILABLE', 'Multiple matching ticket channels need owner reconciliation.', 503);
    let channelId = ticket.channelId ?? existing[0]?.id;
    if (!channelId) {
      const channel = await this.discord.createChannel(work.guildId, {
        name: `ticket-${String(ticket.number).padStart(4, '0')}`, type: 0, topic: marker,
        ...(settings.categoryChannelId ? { parent_id: settings.categoryChannelId } : {}),
        permission_overwrites: [{ id: work.guildId, type: 0, allow: '0', deny: PermissionFlagsBits.ViewChannel.toString() },
          { id: this.discord.botUserId, type: 1, allow: (sendPermissions | PermissionFlagsBits.ManageChannels).toString(), deny: '0' },
          ...[...new Set(ticket.participants)].map((userId) => ({ id: userId, type: 1, allow: sendPermissions.toString(), deny: '0' })),
          ...settings.staffRoleIds.map((roleId) => ({ id: roleId, type: 0, allow: sendPermissions.toString(), deny: '0' }))],
      }); channelId = channel.id;
    }
    await this.db.ticket.update({ where: { id: ticket.id }, data: { channelId, state: 'open' } });
    const botHeartbeat = await this.db.heartbeat.findUnique({ where: { service: 'bot' } });
    await this.db.record.upsert({ where: { guildId_kind_key: { guildId: work.guildId, kind: 'ticket.coverage', key: ticket.id } }, create: { guildId: work.guildId, kind: 'ticket.coverage', key: ticket.id, state: 'active', data: json({ startedAt: new Date().toISOString(), observationId: jsonObject(botHeartbeat?.details)['observationId'] ?? null, connectedAtCreation: botHeartbeat?.status === 'connected' }) }, update: {} });
    // Welcome delivery has its own tracked effect so a notification timeout cannot recreate a channel.
    await this.transaction(work, async (ctx) => { await ctx.effect('ticket.welcome', { ticketId: ticket.id }); return { channelId }; });
  }

  private async captureTicket(work: OutboxWork, id: string) {
    const ticket = await this.db.ticket.findFirst({ where: { id, guildId: work.guildId } });
    if (!ticket?.channelId) throw new DomainError('NOT_FOUND', 'Ticket channel unavailable.', 404);
    if (ticket.state === 'closed') return;
    await this.discord.channelPermissions(work.guildId, ticket.channelId, PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.ManageChannels);
    const settings = TicketConfigSchema.parse(ticket.snapshot); const messages: unknown[] = []; let before: string | undefined; let fetchedAll = false;
    for (let page = 0; page < 100; page++) {
      const batch = await this.discord.messages(ticket.channelId, before); messages.push(...batch);
      if (batch.length < 100) { fetchedAll = true; break; } before = batch.at(-1)?.id; if (!before) break;
    }
    const [observations, coverage, botHeartbeat] = await Promise.all([
      this.db.record.findMany({ where: { guildId: work.guildId, kind: 'ticket.message', data: { path: ['ticketId'], equals: ticket.id } }, orderBy: { key: 'asc' }, take: 10000 }),
      this.db.record.findUnique({ where: { guildId_kind_key: { guildId: work.guildId, kind: 'ticket.coverage', key: ticket.id } } }),
      this.db.heartbeat.findUnique({ where: { service: 'bot' } }),
    ]);
    const c = jsonObject(coverage?.data); const heartbeatData = jsonObject(botHeartbeat?.details);
    const complete = fetchedAll && coverage?.state === 'active' && c['connectedAtCreation'] === true && botHeartbeat?.status === 'connected' && Date.now() - botHeartbeat.updatedAt.getTime() < 45_000 && c['observationId'] === heartbeatData['observationId'] && Array.isArray(heartbeatData['intents']) && heartbeatData['intents'].includes('content');
    const captured = { accessibleHistory: messages, observedHistory: observations.map((observation) => ({ ...jsonObject(observation.data), state: observation.state })), coverage: complete ? 'Observed throughout; accessible history fetched.' : 'Some history or content observations were unavailable. Unobserved deletions cannot be reconstructed.', fetchedAll };
    await this.transaction(work, async (ctx) => {
      await ctx.tx.transcript.create({ data: { guildId: work.guildId, ticketId: ticket.id, messages: json(captured), status: complete ? 'complete' : 'partial', checksum: createHash('sha256').update(JSON.stringify(captured)).digest('hex'), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
      if (!complete && settings.requireTranscriptBeforeCleanup) { await ctx.tx.ticket.update({ where: { id: ticket.id }, data: { state: 'capture_failed' } }); return { retained: true }; }
      await ctx.effect('ticket.cleanup', { ticketId: ticket.id, channelId: ticket.channelId }); return { retained: false };
    });
  }

  private async roles(work: OutboxWork, p: Record<string, unknown>) {
    const record = await this.record(work.guildId, p['recordId']);
    if (typeof p['revision'] === 'number' && record.revision !== p['revision']) return;
    const data = jsonObject(record.data); const userId = Snowflake.parse(p['userId']);
    const add = work.type === 'control.role' ? (p['desired'] ? [Snowflake.parse(p['roleId'])] : []) : z.array(Snowflake).parse(p['addRoleIds']);
    const remove = work.type === 'control.role' ? (p['desired'] ? [] : [Snowflake.parse(p['roleId'])]) : z.array(Snowflake).parse(p['removeRoleIds']);
    const [guild, roles, bot, member] = await Promise.all([this.discord.guild(work.guildId), this.discord.roles(work.guildId), this.discord.member(work.guildId, this.discord.botUserId), this.discord.member(work.guildId, userId)]);
    for (const roleId of [...add, ...remove]) assertRoleAssignable(guild, roles, bot, roleId);
    if (p['menuId']) { const menu = await this.record(work.guildId, p['menuId'], 'role.menu'); if (menu.revision !== p['menuRevision'] || menu.state !== 'published') throw new DomainError('FORBIDDEN', 'This role menu changed or was removed.', 403); }
    for (const roleId of remove) if (member.roles.includes(roleId)) await this.discord.removeRole(work.guildId, userId, roleId);
    for (const roleId of add) if (!member.roles.includes(roleId)) await this.discord.addRole(work.guildId, userId, roleId);
    await this.db.record.updateMany({ where: { id: record.id, guildId: work.guildId, revision: record.revision }, data: { state: 'applied', data: json({ ...data, appliedAt: new Date().toISOString() }) } });
  }
  private async message(work: OutboxWork, p: Record<string, unknown>) {
    const document = MessageDocumentSchema.parse(p['document']); const tokens = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).parse(p['tokens'] ?? {});
    let channelId: string;
    if (p['userId']) channelId = await this.discord.dm(Snowflake.parse(p['userId']));
    else { channelId = Snowflake.parse(p['channelId']); await this.discord.channelPermissions(work.guildId, channelId, sendPermissions); }
    const payload = compileMessage(document, tokens); await this.discord.send(channelId, payload, nonce(work.id));
  }

  private async publishRecord(work: OutboxWork, recordId: string, channelId: string, document: MessageDocument, data: Record<string, unknown>, state: string) {
    const result = await this.transaction(work, async (ctx) => {
      const published = await publishDocument(ctx, channelId, document, data['preview'] === true);
      await ctx.tx.record.update({ where: { id: recordId }, data: { data: json({ ...data, publicationId: published.id, publicationState: 'pending' }), state } });
      await ctx.effect('community.publication.applied', { recordId, publicationId: published.id, desiredState: state === 'publishing' ? 'open' : state }); return { publicationId: published.id };
    }); return result;
  }
  private async community(work: OutboxWork, p: Record<string, unknown>) {
    if (work.type === 'community.publication.applied') {
      const publication = await this.db.publication.findFirst({ where: { id: ID.parse(p['publicationId']), guildId: work.guildId } });
      if (publication?.state !== 'applied') throw new DomainError('SERVICE_UNAVAILABLE', 'The Discord publication is still pending.', 503);
      const record = await this.record(work.guildId, p['recordId']);
      await this.db.record.update({ where: { id: record.id }, data: { state: ID.parse(p['desiredState']), data: json({ ...jsonObject(record.data), publicationState: 'applied', channelId: publication.channelId, messageId: publication.messageId }) } }); return;
    }
    if (['community.crate.publish', 'community.giveaway.publish', 'community.role-menu.publish'].includes(work.type)) {
      const kind = work.type === 'community.crate.publish' ? 'crate.drop' : work.type === 'community.giveaway.publish' ? 'giveaway' : 'role.menu';
      const id = p['dropId'] ?? p['giveawayId'] ?? p['menuId']; const record = await this.record(work.guildId, id, kind); const data = jsonObject(record.data); if (data['publicationId']) return;
      let document: MessageDocument;
      if (kind === 'role.menu') {
        const options = z.array(z.object({ label: z.string(), roleId: Snowflake })).parse(data['options']);
        const [guild, roles, bot] = await Promise.all([this.discord.guild(work.guildId), this.discord.roles(work.guildId), this.discord.member(work.guildId, this.discord.botUserId)]);
        options.forEach((option) => assertRoleAssignable(guild, roles, bot, option.roleId));
        document = MessageDocumentSchema.parse({ schemaVersion: 1, mode: 'v2', name: 'Role menu', blocks: [{ type: 'text', text: String(data['name']) }, { type: 'controls', controls: [{ type: 'select', key: 'role-menu', minValues: data['minSelections'], maxValues: data['maxSelections'], options: options.map((option) => ({ label: option.label, value: option.roleId })), action: { type: 'role.menu', menuId: record.id } }] }] });
      } else {
        const preview = data['preview'] === true; const title = kind === 'crate.drop' ? `${preview ? 'Zero-reward preview: ' : ''}${String(jsonObject(data['type'])['name'])}` : String(data['prize']);
        const action = kind === 'crate.drop' ? { type: 'crate.claim', crateId: record.id } : { type: 'giveaway.enter', giveawayId: record.id };
        document = MessageDocumentSchema.parse({ schemaVersion: 1, mode: 'v2', name: kind, blocks: [{ type: 'container', accentColor: BRAND_YELLOW, children: [{ type: 'text', text: `## ${title}` }, { type: 'text', text: kind === 'crate.drop' ? `Expires ${String(data['expiresAt'])}. ${preview ? 'This preview grants no XP.' : 'Claims and rewards are recorded atomically.'}` : `Ends ${String(data['endsAt'])}. Winner count: ${String(data['winnerCount'])}. Eligibility is checked when entering and drawing.` }, { type: 'controls', controls: [{ type: 'button', key: 'entry', label: kind === 'crate.drop' ? 'Claim crate' : 'Enter giveaway', style: 'primary', action }] }] }] });
      }
      await this.publishRecord(work, record.id, Snowflake.parse(data['channelId']), document, data, kind === 'role.menu' ? 'published' : 'publishing'); return;
    }
    if (work.type === 'community.crate.update') {
      const record = await this.record(work.guildId, p['dropId'], 'crate.drop'); const data = jsonObject(record.data); if (!data['messageId'] || !data['publicationId']) return;
      const publication = await this.db.publication.findFirst({ where: { id: String(data['publicationId']), guildId: work.guildId }, include: { controls: true } }); if (!publication) return;
      const document = MessageDocumentSchema.parse(publication.document);
      function disabled(block: MessageDocument['blocks'][number]): void { if (block.type === 'controls') block.controls.forEach((control) => { control.disabled = ['expired', 'exhausted'].includes(record.state); }); if (block.type === 'container') block.children.forEach(disabled); }
      document.blocks.forEach(disabled); await this.discord.edit(Snowflake.parse(data['channelId']), Snowflake.parse(data['messageId']), compileMessage(document, {}, Object.fromEntries(publication.controls.map((control) => [control.key, control.id])))); return;
    }
    if (work.type === 'community.starboard.sync') { await this.starboard(work, p); return; }
    if (work.type === 'community.giveaway.announce') {
      const draw = await this.record(work.guildId, p['drawId'], 'giveaway.draw'); const data = jsonObject(draw.data); const giveaway = await this.record(work.guildId, p['giveawayId'], 'giveaway'); const rules = jsonObject(giveaway.data);
      const winners = await this.db.record.findMany({ where: { guildId: work.guildId, kind: 'giveaway.winner', data: { path: ['drawId'], equals: draw.id } }, take: 100 });
      const channelId = Snowflake.parse(rules['channelId']); await this.discord.channelPermissions(work.guildId, channelId, sendPermissions);
      await this.discord.send(channelId, textPayload(`Giveaway draw for ${String(rules['prize'])}: ${winners.length ? winners.map((winner) => winner.ownerId).join(', ') : 'No eligible entrants.'}\nClaim deadline: ${String(data['claimUntil'])}. Claim from your member portal.`), nonce(work.id)); return;
    }
    if (['community.giveaway.claim-notify', 'community.submission.decision'].includes(work.type)) {
      const id = p['recordId'] ?? p['winnerId']; const record = await this.record(work.guildId, id); const userId = Snowflake.parse(p['userId'] ?? record.ownerId); const channel = await this.discord.dm(userId);
      await this.discord.send(channel, textPayload(work.type === 'community.giveaway.claim-notify' ? 'Your giveaway prize claim is recorded. Contact the giveaway host for fulfillment.' : `Your submission decision is recorded: ${JSON.stringify(p['decision']).slice(0, 1500)}`), nonce(work.id)); return;
    }
    if (work.type === 'community.submission.publish') {
      const record = await this.record(work.guildId, p['recordId']); const data = jsonObject(record.data); const channelId = Snowflake.parse(p['channelId']);
      await this.discord.channelPermissions(work.guildId, channelId, sendPermissions); const posted = await this.discord.send(channelId, textPayload(`${record.kind}: ${String(data['title'] ?? '')}\n${String(data['body'] ?? data['content'] ?? '')}\nVote and review in the member portal.`), nonce(work.id));
      await this.db.record.update({ where: { id: record.id }, data: { data: json({ ...data, messageId: posted.id, channelId }) } }); return;
    }
    throw new DomainError('INVALID_INPUT', `No community delivery handler is installed for ${work.type}.`);
  }
  private async starboard(work: OutboxWork, p: Record<string, unknown>) {
    const record = await this.record(work.guildId, p['recordId'], 'starboard.source'); if (record.revision !== p['revision']) return; const data = jsonObject(record.data); const channelId = Snowflake.parse(p['channelId']);
    await this.discord.channelPermissions(work.guildId, channelId, sendPermissions | PermissionFlagsBits.EmbedLinks);
    if (p['delete'] === true) { if (data['mirrorMessageId']) await this.discord.deleteMessage(channelId, Snowflake.parse(data['mirrorMessageId'])); await this.db.record.update({ where: { id: record.id }, data: { data: json({ ...data, mirrorMessageId: null, mirrorState: 'removed' }) } }); return; }
    const payload = { allowed_mentions: { parse: [] }, embeds: [{ title: `⭐ ${String(data['votes'] ?? data['count'] ?? 0)} votes`, description: p['tombstone'] ? 'The source message was removed.' : data['contentAvailable'] === false ? 'Source content was not available to Sparko.' : String(data['content'] ?? '').slice(0, 4096), color: BRAND_YELLOW, url: `https://discord.com/channels/${work.guildId}/${String(data['sourceChannelId'])}/${String(p['sourceMessageId'])}`, footer: { text: 'Sparko starboard • original source' } }] };
    const message = data['mirrorMessageId'] ? await this.discord.edit(channelId, Snowflake.parse(data['mirrorMessageId']), payload) : await this.discord.send(channelId, payload, nonce(work.id));
    await this.db.record.update({ where: { id: record.id }, data: { data: json({ ...data, mirrorMessageId: message.id, mirrorChannelId: channelId, mirrorState: 'applied' }) } });
  }

  private async automation(work: OutboxWork, p: Record<string, unknown>) { throw new DomainError('INVALID_INPUT', `Automation handler is not yet available for ${work.type}.`); }
  private async safety(work: OutboxWork, p: Record<string, unknown>) { throw new DomainError('INVALID_INPUT', `Safety handler is not yet available for ${work.type}.`); }
}
