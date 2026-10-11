import { z } from 'zod';
import { Snowflake } from './index.js';

const enabled = { enabled: z.boolean().default(false) };
export const SocialConfigSchema = z.object({ ...enabled, pollsPerDay: z.number().int().min(1).max(1000).default(144), eventsPerDay: z.number().int().min(1).max(1000).default(100), intervalSeconds: z.number().int().min(60).max(86400).default(600) });
export const AiConfigSchema = z.object({ ...enabled, dataSharingAcknowledged: z.boolean().default(false), purposes: z.array(z.enum(['settings-explain', 'message-draft', 'ticket-summary'])).max(3).default([]), callsPerDay: z.number().int().min(1).max(500).default(20), reservedTokensPerDay: z.number().int().min(100).max(1000000).default(20000), maxInputCharacters: z.number().int().min(100).max(12000).default(6000), maxOutputTokens: z.number().int().min(100).max(4000).default(500), retentionDays: z.number().int().min(1).max(30).default(7) });
export const MusicConfigSchema = z.object({ ...enabled, source: z.literal('permitted-uploads').default('permitted-uploads'), djRoleIds: z.array(Snowflake).max(20).default([]), maxQueue: z.number().int().min(1).max(100).default(20), maxDurationSeconds: z.number().int().min(10).max(1800).default(300), maxVolume: z.number().int().min(1).max(100).default(80), idleSeconds: z.number().int().min(30).max(600).default(60) });
export const WebhookConfigSchema = z.object({ ...enabled, eventsPerDay: z.number().int().min(1).max(10000).default(100), maxAgeSeconds: z.number().int().min(30).max(300).default(300) });
export const BillingConfigSchema = z.object({ ...enabled });
export const providerConfigSchemas: Record<string, z.ZodType> = { R47: SocialConfigSchema, R60: BillingConfigSchema, R64: MusicConfigSchema, R65: AiConfigSchema, R69: WebhookConfigSchema };

const sourceBase = { channelId: Snowflake, enabled: z.boolean().default(true), announceExisting: z.boolean().default(false) };
export const SocialSourceSchema = z.discriminatedUnion('provider', [
  z.object({ ...sourceBase, provider: z.literal('rss'), feedUrl: z.url().max(2000) }),
  z.object({ ...sourceBase, provider: z.literal('youtube'), channelId: Snowflake, youtubeChannelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/) }),
  z.object({ ...sourceBase, provider: z.literal('github'), owner: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/), repository: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/) }),
  z.object({ ...sourceBase, provider: z.literal('twitch'), username: z.string().regex(/^[a-z0-9_]{1,25}$/) }),
]);
export const AiRequestSchema = z.object({ purpose: z.enum(['settings-explain', 'message-draft', 'ticket-summary']), prompt: z.string().trim().min(1).max(12000), ticketId: z.string().min(1).max(128).optional(), dataSharingConsent: z.literal(true) });
export const MusicQueueSchema = z.object({ assetId: z.string().min(1).max(128), voiceChannelId: Snowflake, rightsAcknowledged: z.literal(true) });
export const ExternalEventSchema = z.object({ eventId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), eventType: z.enum(['announcement', 'release', 'deployment']), timestamp: z.iso.datetime(), title: z.string().min(1).max(200), text: z.string().max(2000), url: z.url().max(2000).optional() }).strict();
export const WebhookCreateSchema = z.object({ name: z.string().min(1).max(80), channelId: Snowflake, allowedEvents: z.array(z.enum(['announcement', 'release', 'deployment'])).min(1).max(3) });
export const MultiServerPlanSchema = z.object({ sourceGuildId: Snowflake, targetGuildIds: z.array(Snowflake).min(1).max(20), featureIds: z.array(z.string().regex(/^R[0-9]{2}$/)).min(1).max(70) }).refine(v => new Set(v.targetGuildIds).size === v.targetGuildIds.length, 'Target servers must be unique');

export const WebhookProvisionSchema = WebhookCreateSchema.extend({ signingSecret: z.string().min(32).max(128) });
