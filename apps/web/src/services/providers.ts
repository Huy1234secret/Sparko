import { z } from 'zod';
import { SocialSourceSchema } from '@sparko/contracts/providers';
import { mutate, read } from './http';

/**
 * Typed client for provider-backed modules: social alerts (R47), external
 * events (R69), music (R64) and AI (R65). Secrets never cross this boundary;
 * availability only says whether the operator configured a provider.
 */
const g = (guildId: string) => `/guilds/${guildId}`;
const record = <T extends z.ZodType>(data: T) =>
  z.object({
    id: z.string(),
    key: z.string(),
    state: z.string(),
    revision: z.number(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
    data,
  });

const Availability = z.object({
  available: z.boolean(),
  missingConfiguration: z.array(z.string()).default([]),
  liveVerified: z.boolean(),
});
export const ProviderStatusSchema = z.object({
  billing: Availability,
  youtube: Availability,
  twitch: Availability,
  rss: Availability,
  github: z.object({
    available: z.boolean(),
    authenticated: z.boolean(),
    liveVerified: z.boolean(),
  }),
  ai: Availability,
  music: Availability,
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
export const getProviderStatus = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/providers/status`, ProviderStatusSchema, signal);

export type SocialSourceInput = z.input<typeof SocialSourceSchema>;
const StoredSource = z
  .object({
    provider: z.enum(['rss', 'youtube', 'github', 'twitch']),
    channelId: z.string(),
    enabled: z.boolean().default(true),
    announceExisting: z.boolean().default(false),
    feedUrl: z.string().optional(),
    youtubeChannelId: z.string().optional(),
    owner: z.string().optional(),
    repository: z.string().optional(),
    username: z.string().optional(),
  })
  .loose();
export const SourceSchema = record(StoredSource).extend({
  lastPolledAt: z.string().nullable(),
  lastReceived: z.number().nullable(),
});
export type Source = z.infer<typeof SourceSchema>;
export const ProviderEventSchema = record(
  z
    .object({
      sourceId: z.string().optional(),
      provider: z.string().optional(),
      title: z.string(),
      url: z.string().nullable().optional(),
      publishedAt: z.string().nullable().optional(),
      observedAt: z.string().optional(),
      delivery: z.string().optional(),
    })
    .loose(),
);
export type ProviderEvent = z.infer<typeof ProviderEventSchema>;
export const SocialSchema = z.object({
  sources: z.array(SourceSchema),
  events: z.array(ProviderEventSchema),
  usage: z.object({
    pollsToday: z.number(),
    pollsPerDay: z.number(),
    announcedToday: z.number(),
    eventsPerDay: z.number(),
  }),
});
export type Social = z.infer<typeof SocialSchema>;
export const getSocial = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/social/sources`, SocialSchema, signal);
export const createSource = (
  guildId: string,
  body: SocialSourceInput,
  key: string,
) => mutate('post', `${g(guildId)}/social/sources`, body, z.unknown(), key);
export const pollSource = (guildId: string, id: string, key: string) =>
  mutate(
    'post',
    `${g(guildId)}/social/sources/${id}/poll`,
    {},
    z.unknown(),
    key,
  );
export const disableSource = (
  guildId: string,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'post',
    `${g(guildId)}/social/sources/${id}/disable`,
    { expectedRevision },
    z.unknown(),
    key,
  );

export const webhookEvents = ['announcement', 'release', 'deployment'] as const;
export const WebhookSchema = record(
  z.object({
    name: z.string(),
    channelId: z.string(),
    allowedEvents: z.array(z.string()),
  }),
);
export type Webhook = z.infer<typeof WebhookSchema>;
export const getWebhooks = (guildId: string, signal?: AbortSignal) =>
  read(`${g(guildId)}/webhooks`, z.array(WebhookSchema), signal);
export const ProvisionedSchema = z.object({
  integration: WebhookSchema,
  endpoint: z.string(),
  protocol: z.string(),
});
export const createWebhook = (
  guildId: string,
  body: {
    name: string;
    channelId: string;
    allowedEvents: (typeof webhookEvents)[number][];
    signingSecret: string;
  },
  key: string,
) => mutate('post', `${g(guildId)}/webhooks`, body, ProvisionedSchema, key);
export const revokeWebhook = (guildId: string, id: string, key: string) =>
  mutate('post', `${g(guildId)}/webhooks/${id}/revoke`, {}, z.unknown(), key);

/** A 64-character signing secret made in the browser and shown only once. */
export function newSigningSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const sourceLabel = (source: Source['data']) => {
  switch (source.provider) {
    case 'rss':
      return source.feedUrl ?? 'RSS feed';
    case 'youtube':
      return `YouTube channel ${source.youtubeChannelId ?? ''}`.trim();
    case 'github':
      return `${source.owner ?? ''}/${source.repository ?? ''} releases`;
    case 'twitch':
      return `twitch.tv/${source.username ?? ''}`;
  }
};
export const providerNames: Record<string, string> = {
  rss: 'RSS or Atom feed',
  youtube: 'YouTube uploads',
  github: 'GitHub releases',
  twitch: 'Twitch live streams',
};
