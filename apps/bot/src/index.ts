import { createHash, randomUUID } from 'node:crypto';
import { Client, Events, GatewayIntentBits, Partials, type GuildMember, type Message, type MessageReaction, type PartialMessageReaction, type User, type PartialUser } from 'discord.js';
import { loadConfig } from '@sparko/config';
import { createDatabase, json } from '@sparko/db';
import { Platform, ingestCommunityEvent, ingestSafetyEvent, ingestAutomationEvent, type DomainContext } from '@sparko/domain';
import type { Actor } from '@sparko/contracts';
import { logger } from '@sparko/observability';
import { BotRuntime } from './runtime.js';

const config = loadConfig();
if (!config.DISCORD_BOT_TOKEN) throw new Error('Discord Gateway startup requires DISCORD_BOT_TOKEN. Configure it in the environment, never in chat.');
const enabled = new Set((process.env['DISCORD_GATEWAY_INTENTS'] ?? 'guilds,messages,reactions,voice').split(',').map((value) => value.trim()));
const intentMap = { guilds: GatewayIntentBits.Guilds, members: GatewayIntentBits.GuildMembers, messages: GatewayIntentBits.GuildMessages, content: GatewayIntentBits.MessageContent, reactions: GatewayIntentBits.GuildMessageReactions, voice: GatewayIntentBits.GuildVoiceStates, moderation: GatewayIntentBits.GuildModeration };
if ([...enabled].some((key) => !(key in intentMap))) throw new Error('DISCORD_GATEWAY_INTENTS contains an unsupported intent.');
const client = new Client({ intents: Object.entries(intentMap).filter(([key]) => enabled.has(key)).map(([, intent]) => intent), partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User] });
const db = createDatabase(config.DATABASE_URL); const platform = new Platform(db); const runtime = new BotRuntime(client, db, config);
function actor(guildId: string): Actor { return { userId: client.user?.id ?? config.DISCORD_CLIENT_ID, guildId, roles: [], isAdmin: false, isOwner: false, capabilities: [], globalCapabilities: [] }; }
const observed = (guildId: string, key: string, payload: unknown, task: (ctx: DomainContext) => Promise<unknown>) => platform.mutate(actor(guildId), 'gateway.observe', key, payload, task).catch((error: unknown) => { logger.error({ error: error instanceof Error ? error.message : 'unknown', guildId, sourceId: key }, 'Gateway observation failed'); });
function memberFields(member: GuildMember) { return { memberId: member.id, roleIds: [...member.roles.cache.keys()], bot: member.user.bot, ...(member.joinedAt ? { joinedAt: member.joinedAt.toISOString() } : {}), accountCreatedAt: member.user.createdAt.toISOString() }; }

async function recordTicketMessage(message: Message, edit = false): Promise<void> {
  if (!message.guildId) return;
  const ticket = await db.ticket.findFirst({ where: { guildId: message.guildId, channelId: message.channelId } }); if (!ticket) return;
  const data = { ticketId: ticket.id, messageId: message.id, authorId: message.author.id, content: enabled.has('content') ? message.content : null, contentAvailable: enabled.has('content'), createdAt: message.createdAt.toISOString(), editedAt: message.editedAt?.toISOString() ?? null, observedAt: new Date().toISOString(), attachments: [...message.attachments.values()].map((attachment) => ({ id: attachment.id, filename: attachment.name, size: attachment.size, url: attachment.url })), observation: edit ? 'edit' : 'create' };
  await db.record.upsert({ where: { guildId_kind_key: { guildId: message.guildId, kind: 'ticket.message', key: message.id } }, create: { guildId: message.guildId, kind: 'ticket.message', key: message.id, ownerId: message.author.id, data: json(data) }, update: { data: json(data), revision: { increment: 1 } } });
}

client.on(Events.InteractionCreate, (interaction) => { void runtime.interaction(interaction).catch((error: unknown) => logger.error({ error: error instanceof Error ? error.name : 'unknown' }, 'Interaction response failed')); });
client.on(Events.MessageCreate, (message) => {
  if (!message.guild || !message.member) return;
  const event = { kind: 'message', eventId: `message:${message.id}`, occurredAt: message.createdAt.toISOString(), ...memberFields(message.member), messageId: message.id, channelId: message.channelId, content: enabled.has('content') ? message.content : null, webhook: Boolean(message.webhookId) };
  void observed(message.guild.id, event.eventId, event, async (ctx) => {
    await ingestCommunityEvent(ctx, event);
    if (enabled.has('content')) { const input = { type: 'message', id: message.id, userId: message.author.id, channelId: message.channelId, roleIds: event.roleIds, bot: event.bot, webhook: event.webhook, content: message.content.slice(0, 4000), mentionCount: message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0), attachmentCount: message.attachments.size, at: event.occurredAt }; await ingestSafetyEvent(ctx, input); await ingestAutomationEvent(ctx, { ...input, generatedBySparko: message.author.id === client.user?.id }); }
  });
  void recordTicketMessage(message).catch((error: unknown) => logger.error({ error: error instanceof Error ? error.name : 'unknown', messageId: message.id }, 'Ticket message observation failed'));
});
client.on(Events.MessageUpdate, (_before, after) => {
  if (after.partial || !after.guildId) return;
  const event = { kind: 'messageEdit', eventId: `edit:${after.id}:${after.editedTimestamp ?? randomUUID()}`, occurredAt: new Date().toISOString(), sourceMessageId: after.id, sourceChannelId: after.channelId, content: enabled.has('content') ? after.content : null };
  void observed(after.guildId, event.eventId, event, (ctx) => ingestCommunityEvent(ctx, event)); void recordTicketMessage(after, true).catch(() => undefined);
});
client.on(Events.MessageDelete, (message) => {
  if (!message.guildId) return;
  const event = { kind: 'messageDelete', eventId: `delete:${message.id}`, occurredAt: new Date().toISOString(), sourceMessageId: message.id, sourceChannelId: message.channelId };
  void observed(message.guildId, event.eventId, event, (ctx) => ingestCommunityEvent(ctx, event));
  void db.record.updateMany({ where: { guildId: message.guildId, kind: 'ticket.message', key: message.id }, data: { state: 'deleted', revision: { increment: 1 } } }).catch(() => undefined);
});

client.on(Events.GuildMemberAdd, (member) => {
  const now = new Date().toISOString(); const event = { kind: 'memberJoin', eventId: `join:${member.id}:${member.joinedTimestamp ?? now}`, occurredAt: now, ...memberFields(member) };
  void observed(member.guild.id, event.eventId, event, async (ctx) => { await ingestCommunityEvent(ctx, event); await ingestSafetyEvent(ctx, { type: 'join', id: event.eventId, userId: member.id, roleIds: event.roleIds, joinedAt: member.joinedAt?.toISOString() ?? now, accountCreatedAt: member.user.createdAt.toISOString() }); await ingestAutomationEvent(ctx, { type: 'join', id: event.eventId, userId: member.id, roleIds: event.roleIds, bot: member.user.bot, joinedAt: member.joinedAt?.toISOString() ?? now, accountCreatedAt: member.user.createdAt.toISOString() });
    // Without complete serialized invite snapshots, attribution stays explicitly unknown.
    await ingestAutomationEvent(ctx, { type: 'invite_join', id: event.eventId, userId: member.id, joinedAt: member.joinedAt?.toISOString() ?? now, accountCreatedAt: member.user.createdAt.toISOString(), before: [], after: [], canReadInvites: false, simultaneousJoins: 1, vanityChanged: false, snapshotComplete: false });
  });
});
client.on(Events.GuildMemberRemove, (member) => {
  const event = { kind: 'memberLeave', eventId: `leave:${member.id}:${member.joinedTimestamp ?? randomUUID()}`, occurredAt: new Date().toISOString(), memberId: member.id, roleIds: [...member.roles.cache.keys()], bot: member.user.bot };
  void observed(member.guild.id, event.eventId, event, async (ctx) => { await ingestCommunityEvent(ctx, event); await ingestAutomationEvent(ctx, { type: 'leave', id: event.eventId, userId: member.id }); });
});
client.on(Events.GuildMemberUpdate, (before, after) => {
  const boosted = !before.premiumSince && Boolean(after.premiumSince); const event = { kind: boosted ? 'memberBoost' : 'memberUpdate', eventId: `member:${after.id}:${randomUUID()}`, occurredAt: new Date().toISOString(), ...memberFields(after) };
  void observed(after.guild.id, event.eventId, event, (ctx) => ingestCommunityEvent(ctx, event));
});
async function observeReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, added: boolean) {
  try {
    if (reaction.partial) await reaction.fetch(); const source = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (!source.guild) return; const member = await source.guild.members.fetch(user.id);
    const event = { kind: 'reaction', eventId: `reaction:${source.id}:${user.id}:${added}:${randomUUID()}`, occurredAt: new Date().toISOString(), ...memberFields(member), sourceMessageId: source.id, sourceChannelId: source.channelId, sourceAuthorId: source.author.id, emoji: reaction.emoji.id ?? reaction.emoji.name ?? 'unknown', added, sourceContent: enabled.has('content') ? source.content : null };
    await observed(source.guild.id, event.eventId, event, (ctx) => ingestCommunityEvent(ctx, event));
  } catch (error) { logger.warn({ error: error instanceof Error ? error.name : 'unknown' }, 'Reaction observation is unavailable'); }
}
client.on(Events.MessageReactionAdd, (reaction, user) => { void observeReaction(reaction, user, true); });
client.on(Events.MessageReactionRemove, (reaction, user) => { void observeReaction(reaction, user, false); });
client.on(Events.VoiceStateUpdate, (before, after) => {
  const member = after.member ?? before.member; if (!member || before.channelId === after.channelId) return;
  const event = { kind: 'voice', eventId: `voice:${member.id}:${randomUUID()}`, occurredAt: new Date().toISOString(), ...memberFields(member), channelId: after.channelId, previousChannelId: before.channelId, afk: after.channelId === member.guild.afkChannelId };
  void observed(member.guild.id, event.eventId, event, async (ctx) => { await ingestCommunityEvent(ctx, event); await ingestAutomationEvent(ctx, { type: 'voice', id: event.eventId, userId: member.id, channelId: after.channelId, previousChannelId: before.channelId, occupants: before.channel ? [...before.channel.members.keys()].filter((id) => id !== member.id) : [], memberName: member.displayName }); });
});
client.on(Events.ChannelDelete, (channel) => { if (!('guild' in channel)) return; const event = { type: 'destructive', id: `channel_delete:${channel.id}`, action: 'channel_delete', resourceId: channel.id, confidence: 'unknown', at: new Date().toISOString() }; void observed(channel.guild.id, event.id, event, (ctx) => ingestSafetyEvent(ctx, event)); });
client.on(Events.GuildRoleDelete, (role) => { const event = { type: 'destructive', id: `role_delete:${role.id}`, action: 'role_delete', resourceId: role.id, confidence: 'unknown', at: new Date().toISOString() }; void observed(role.guild.id, event.id, event, (ctx) => ingestSafetyEvent(ctx, event)); });

async function coverage(status: 'collecting' | 'gap', reason: string): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await db.guild.upsert({ where: { id: guild.id }, create: { id: guild.id, name: guild.name, installed: true, observedAt: new Date(), memberCount: guild.memberCount }, update: { name: guild.name, installed: true, observedAt: new Date(), memberCount: guild.memberCount } });
    for (const metric of ['messages', 'members', 'voice'] as const) {
      const configured = enabled.has(metric === 'messages' ? 'messages' : metric === 'members' ? 'members' : 'voice');
      const event = { kind: 'coverage', metric, eventId: `${metric}:${randomUUID()}`, occurredAt: new Date().toISOString(), status: configured ? status : 'gap', reason: configured ? reason : 'The required Gateway intent is disabled.' };
      await observed(guild.id, event.eventId, event, (ctx) => ingestCommunityEvent(ctx, event));
    }
  }
}
async function heartbeat() { const details = json({ intents: [...enabled], guilds: client.guilds.cache.size, pingMs: client.ws.ping, observationId: createHash('sha256').update(String(client.readyTimestamp)).digest('hex').slice(0, 16) }); await db.heartbeat.upsert({ where: { service: 'bot' }, create: { service: 'bot', version: config.APP_VERSION, status: client.isReady() ? 'connected' : 'disconnected', details }, update: { version: config.APP_VERSION, status: client.isReady() ? 'connected' : 'disconnected', details } }); }
client.once(Events.ClientReady, () => { void coverage('collecting', 'Gateway connected; collection starts at this observation.'); void heartbeat(); logger.info({ userId: client.user?.id }, 'Discord Gateway connected'); });
client.on(Events.ShardDisconnect, () => { void coverage('gap', 'Gateway disconnected; missing observations cannot be reconstructed.'); void heartbeat(); });
client.on(Events.ShardResume, () => { void coverage('collecting', 'Gateway resumed; collection continues from this observation.'); });
client.on(Events.Error, (error) => logger.error({ error: error.name }, 'Discord Gateway error'));
const interval = setInterval(() => { void heartbeat().catch((error: unknown) => logger.error({ error: error instanceof Error ? error.name : 'unknown' }, 'Bot heartbeat failed')); }, 15_000); interval.unref();
let stopping = false;
async function stop() { if (stopping) return; stopping = true; clearInterval(interval); await coverage('gap', 'Bot is shutting down.'); await client.destroy(); await heartbeat(); await db.$disconnect(); }
process.once('SIGTERM', () => { void stop(); }); process.once('SIGINT', () => { void stop(); });
await client.login(config.DISCORD_BOT_TOKEN);
