import { REST, Routes, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { z } from 'zod';
import { DomainError, type Actor } from '@sparko/contracts';
import type { PrismaClient } from '@sparko/db';

export const DiscordGuildSchema = z.object({ id: z.string(), name: z.string(), owner_id: z.string() });
export const DiscordRoleSchema = z.object({ id: z.string(), name: z.string(), permissions: z.string(), position: z.number(), managed: z.boolean().default(false) });
export const DiscordMemberSchema = z.object({ user: z.object({ id: z.string(), username: z.string(), bot: z.boolean().optional() }), roles: z.array(z.string()), nick: z.string().nullable().optional(), communication_disabled_until: z.string().nullable().optional() });
export const DiscordChannelSchema = z.object({ id: z.string(), guild_id: z.string().optional(), name: z.string().optional(), type: z.number(), topic: z.string().nullable().optional(), parent_id: z.string().nullable().optional(), permission_overwrites: z.array(z.object({ id: z.string(), type: z.number(), allow: z.string(), deny: z.string() })).default([]) });
export const DiscordMessageSchema = z.object({ id: z.string(), channel_id: z.string(), author: z.object({ id: z.string(), username: z.string(), bot: z.boolean().optional() }), content: z.string().default(''), timestamp: z.string(), edited_timestamp: z.string().nullable().optional(), components: z.array(z.unknown()).default([]), attachments: z.array(z.object({ id: z.string(), filename: z.string(), size: z.number(), url: z.string() })).default([]), embeds: z.array(z.unknown()).default([]), nonce: z.union([z.string(), z.number()]).nullable().optional() });
export type DiscordGuild = z.infer<typeof DiscordGuildSchema>;
export type DiscordRole = z.infer<typeof DiscordRoleSchema>;
export type DiscordMember = z.infer<typeof DiscordMemberSchema>;
export type DiscordChannel = z.infer<typeof DiscordChannelSchema>;
export type DiscordMessage = z.infer<typeof DiscordMessageSchema>;

export function effectivePermissions(guild: DiscordGuild, roles: DiscordRole[], member: DiscordMember, channel?: DiscordChannel): bigint {
  if (member.user.id === guild.owner_id) return PermissionsBitField.All;
  let permissions = roles.filter((role) => role.id === guild.id || member.roles.includes(role.id)).reduce((value, role) => value | BigInt(role.permissions), 0n);
  if ((permissions & PermissionFlagsBits.Administrator) !== 0n) return PermissionsBitField.All;
  if (channel) {
    const everyone = channel.permission_overwrites.find((overwrite) => overwrite.id === guild.id && overwrite.type === 0);
    if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
    const overwrites = channel.permission_overwrites.filter((overwrite) => overwrite.type === 0 && member.roles.includes(overwrite.id));
    const deny = overwrites.reduce((value, overwrite) => value | BigInt(overwrite.deny), 0n); const allow = overwrites.reduce((value, overwrite) => value | BigInt(overwrite.allow), 0n);
    permissions = (permissions & ~deny) | allow;
    const own = channel.permission_overwrites.find((overwrite) => overwrite.id === member.user.id && overwrite.type === 1);
    if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow);
  }
  return permissions;
}
export function assertPermissions(permissions: bigint, required: bigint, description: string): void {
  if ((permissions & required) !== required) throw new DomainError('MISSING_PERMISSION', description, 403);
}
export function assertRoleAssignable(guild: DiscordGuild, roles: DiscordRole[], bot: DiscordMember, roleId: string): DiscordRole {
  const role = roles.find((value) => value.id === roleId); const highest = Math.max(0, ...roles.filter((value) => bot.roles.includes(value.id)).map((value) => value.position));
  if (!role || role.id === guild.id || role.managed || role.position >= highest) throw new DomainError('MISSING_PERMISSION', 'Move Sparko’s role above the configured role, then try again.', 403);
  const privileged = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.ManageWebhooks | PermissionFlagsBits.ModerateMembers;
  if ((BigInt(role.permissions) & privileged) !== 0n) throw new DomainError('FORBIDDEN', 'Privileged roles cannot be assigned through public automation.', 403);
  assertPermissions(effectivePermissions(guild, roles, bot), PermissionFlagsBits.ManageRoles, 'Sparko needs Manage Roles.'); return role;
}

/** Only the worker owns external REST side effects. Gateway event collection belongs to the bot. */
export class DiscordRest {
  public readonly rest: REST;
  constructor(token: string, public readonly botUserId: string) { this.rest = new REST({ version: '10', timeout: 15_000, retries: 0 }).setToken(token); }
  async guild(id: string) { return DiscordGuildSchema.parse(await this.rest.get(Routes.guild(id))); }
  async roles(id: string) { return z.array(DiscordRoleSchema).parse(await this.rest.get(Routes.guildRoles(id))); }
  async member(guildId: string, id: string) { return DiscordMemberSchema.parse(await this.rest.get(Routes.guildMember(guildId, id))); }
  async channel(id: string) { return DiscordChannelSchema.parse(await this.rest.get(Routes.channel(id))); }
  async channels(guildId: string) { return z.array(DiscordChannelSchema).parse(await this.rest.get(Routes.guildChannels(guildId))); }
  async messages(channelId: string, before?: string) { return z.array(DiscordMessageSchema).parse(await this.rest.get(Routes.channelMessages(channelId), { query: new URLSearchParams({ limit: '100', ...(before ? { before } : {}) }) })); }
  async message(channelId: string, id: string) { return DiscordMessageSchema.parse(await this.rest.get(Routes.channelMessage(channelId, id))); }
  async send(channelId: string, payload: unknown, nonce: string) { return DiscordMessageSchema.parse(await this.rest.post(Routes.channelMessages(channelId), { body: { ...(payload as Record<string, unknown>), nonce, enforce_nonce: true } })); }
  async edit(channelId: string, id: string, payload: unknown) { return DiscordMessageSchema.parse(await this.rest.patch(Routes.channelMessage(channelId, id), { body: payload })); }
  async deleteMessage(channelId: string, id: string) { await this.rest.delete(Routes.channelMessage(channelId, id)); }
  async createChannel(guildId: string, body: unknown) { return DiscordChannelSchema.parse(await this.rest.post(Routes.guildChannels(guildId), { body })); }
  async dm(userId: string) { return z.object({ id: z.string() }).parse(await this.rest.post(Routes.userChannels(), { body: { recipient_id: userId } })).id; }
  async addRole(guildId: string, userId: string, roleId: string) { await this.rest.put(Routes.guildMemberRole(guildId, userId, roleId)); }
  async removeRole(guildId: string, userId: string, roleId: string) { await this.rest.delete(Routes.guildMemberRole(guildId, userId, roleId)); }
  async channelPermissions(guildId: string, channelId: string, required: bigint) {
    const [guild, roles, member, channel] = await Promise.all([this.guild(guildId), this.roles(guildId), this.member(guildId, this.botUserId), this.channel(channelId)]);
    if (channel.guild_id !== guildId) throw new DomainError('FORBIDDEN', 'This channel belongs to another server.', 403);
    assertPermissions(effectivePermissions(guild, roles, member, channel), required, 'Check Sparko’s permissions in this channel.'); return { guild, roles, member, channel };
  }
  async actor(db: PrismaClient, guildId: string, userId: string): Promise<Actor> {
    const [guild, roles, member, grants] = await Promise.all([this.guild(guildId), this.roles(guildId), this.member(guildId, userId), db.accessGrant.findMany({ where: { guildId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })]);
    const capabilities = grants.filter((grant) => grant.subjectType === 'user' ? grant.subjectId === userId : grant.subjectType === 'role' && member.roles.includes(grant.subjectId)).flatMap((grant) => grant.capabilities);
    return { userId, guildId, roles: member.roles, isAdmin: member.user.id === guild.owner_id || (effectivePermissions(guild, roles, member) & PermissionFlagsBits.Administrator) !== 0n, isOwner: false, capabilities: [...new Set(capabilities)], globalCapabilities: [] };
  }
}
