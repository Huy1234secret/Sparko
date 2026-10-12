import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Actor } from '@sparko/contracts';
import { ExternalEventSchema } from '@sparko/contracts/providers';
import {
  createStripeCheckout,
  decryptProviderSecret,
  encryptProviderSecret,
  isPublicAddress,
  multiServerPlan,
  parseFeed,
  pollSource,
  providerAvailability,
  resolveStripeEvent,
  runAiProvider,
  validateProviderUrl,
  verifyExternalEvent,
  verifyStripeCallback,
  type ProviderTransport,
} from './providers.js';

const channelId = '123456789012345678',
  guildId = '123456789012345679',
  userId = '123456789012345680';
const now = new Date('2026-10-11T00:00:00.000Z'),
  timestamp = String(Math.floor(now.getTime() / 1000)),
  secret = 'A separate tenant signing secret of at least 32 characters';
const signature = (body: Buffer, time = timestamp) =>
  createHmac('sha256', secret).update(`${time}.`).update(body).digest('hex');
const event = {
  eventId: 'release:123',
  eventType: 'release',
  timestamp: now.toISOString(),
  title: 'Release',
  text: 'New version',
  url: 'https://example.com/releases',
};
const env = {
  STRIPE_SECRET_KEY: 'test-only',
  STRIPE_WEBHOOK_SECRET: secret,
  STRIPE_PRICE_PLUS: 'price_plus',
  STRIPE_API_VERSION: '2026-09-30.clover',
  OPENAI_API_KEY: 'test-only',
  OPENAI_MODEL: 'fixture-model',
};
const subscription = {
  id: 'sub_test',
  status: 'active',
  metadata: { guildId, userId, intentId: 'intent' },
  cancel_at_period_end: false,
  current_period_end: Math.floor(now.getTime() / 1000) + 3600,
  items: {
    data: [{ price: { id: 'price_plus', currency: 'usd', unit_amount: 500 } }],
  },
};

describe('provider authentication and bounded adapters', () => {
  it('verifies exact raw bytes and rejects forgery, expiry, and timestamp disagreement', () => {
    const raw = Buffer.from(JSON.stringify(event));
    expect(
      verifyExternalEvent(
        raw,
        { timestamp, signature: signature(raw) },
        secret,
        now,
      ),
    ).toEqual(event);
    expect(() =>
      verifyExternalEvent(
        Buffer.from(`${raw.toString()} `),
        { timestamp, signature: signature(raw) },
        secret,
        now,
      ),
    ).toThrow('signature');
    expect(() =>
      verifyExternalEvent(
        raw,
        { timestamp, signature: '0'.repeat(64) },
        secret,
        now,
      ),
    ).toThrow('signature');
    expect(() =>
      verifyExternalEvent(
        raw,
        { timestamp, signature: signature(raw) },
        secret,
        new Date(now.getTime() + 301_000),
      ),
    ).toThrow('timestamp');
    const wrongTimestamp = Buffer.from(
      JSON.stringify({ ...event, timestamp: '2026-10-11T00:00:10.000Z' }),
    );
    expect(() =>
      verifyExternalEvent(
        wrongTimestamp,
        { timestamp, signature: signature(wrongTimestamp) },
        secret,
        now,
      ),
    ).toThrow('match');
  });

  it('accepts overlapping Stripe signatures but rejects altered signed payloads', () => {
    const raw = Buffer.from(
      JSON.stringify({
        id: 'evt_test',
        type: 'customer.subscription.updated',
        created: Number(timestamp),
        livemode: false,
        data: { object: { id: 'sub_test' } },
      }),
    );
    expect(
      verifyStripeCallback(
        raw,
        `t=${timestamp},v1=${'0'.repeat(64)},v1=${signature(raw)}`,
        secret,
        now,
      ).id,
    ).toBe('evt_test');
    expect(() =>
      verifyStripeCallback(
        raw,
        `t=${timestamp},t=${timestamp},v1=${signature(raw)}`,
        secret,
        now,
      ),
    ).toThrow('timestamp');
    expect(() =>
      verifyStripeCallback(
        Buffer.from(raw.toString().replace('updated', 'deleted')),
        `t=${timestamp},v1=${signature(raw)}`,
        secret,
        now,
      ),
    ).toThrow('signature');
  });

  it('protects stored signing keys and turns corrupted ciphertext into a safe error', () => {
    const key = 'ab'.repeat(32),
      ciphertext = encryptProviderSecret(secret, key);
    expect(ciphertext).not.toContain(secret);
    expect(decryptProviderSecret(ciphertext, key)).toBe(secret);
    expect(() => decryptProviderSecret(ciphertext, 'cd'.repeat(32))).toThrow(
      'requires rotation',
    );
    expect(() => decryptProviderSecret('broken', key)).toThrow(
      'requires rotation',
    );
  });

  it('blocks internal/special addresses and unsafe provider URLs before transport', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '100.64.0.1',
      '169.254.169.254',
      '192.0.2.1',
      '198.18.1.2',
      '203.0.113.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '2001:0000:1::1',
      '2001:db8::1',
      '2002:0808:0808::1',
      '3fff::1',
    ])
      expect(isPublicAddress(address)).toBe(false);
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2001:4860:4860::8888')).toBe(true);
    for (const url of [
      'http://feeds.example.com/news',
      'https://feeds.example.com:444/news',
      'https://user:secret@feeds.example.com/news',
      'https://127.0.0.1/news',
      'https://feeds.example.com/news#fragment',
      'https://other.example.com/news',
    ])
      expect(() => validateProviderUrl(url, ['feeds.example.com'])).toThrow();
    expect(
      validateProviderUrl('https://feeds.example.com/news', [
        'feeds.example.com',
      ]).hostname,
    ).toBe('feeds.example.com');
    expect(
      ExternalEventSchema.safeParse({ ...event, url: 'javascript:alert(1)' })
        .success,
    ).toBe(false);
  });

  it('parses bounded RSS/Atom as text and rejects entity expansion or unsafe links', () => {
    const rss =
      '<rss><channel><item><guid>post-1</guid><title>News &amp; updates</title><description><![CDATA[<b>Hello</b>]]></description><link>https://example.com/1</link><pubDate>Sun, 11 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>';
    expect(parseFeed(rss)).toEqual([
      {
        eventId: 'post-1',
        title: 'News & updates',
        text: 'Hello',
        url: 'https://example.com/1',
        publishedAt: now.toISOString(),
      },
    ]);
    expect(
      parseFeed(
        '<feed><entry><id>atom-1</id><title>Atom</title><link href="https://example.com/2"/><summary>Summary</summary></entry></feed>',
      )[0],
    ).toMatchObject({
      eventId: 'atom-1',
      url: 'https://example.com/2',
      publishedAt: null,
    });
    expect(() =>
      parseFeed(`<!DOCTYPE rss [<!ENTITY x "expanded">]>${rss}`),
    ).toThrow('entities');
    expect(() =>
      parseFeed(rss.replace('https://example.com/1', 'http://example.com/1')),
    ).toThrow('HTTPS');
  });

  it('gates unconfigured providers before making an external request', async () => {
    let calls = 0;
    const transport: ProviderTransport = async () => {
      calls++;
      return { status: 200, body: '{}' };
    };
    await expect(
      pollSource(
        {
          provider: 'youtube',
          channelId,
          youtubeChannelId: `UC${'a'.repeat(22)}`,
        },
        {},
        transport,
      ),
    ).rejects.toThrow('unavailable');
    await expect(
      pollSource(
        { provider: 'twitch', channelId, username: 'sparko' },
        {},
        transport,
      ),
    ).rejects.toThrow('unavailable');
    await expect(
      runAiProvider(
        { prompt: 'Draft', purpose: 'message-draft', maxOutputTokens: 100 },
        {},
        transport,
      ),
    ).rejects.toThrow('unavailable');
    expect(calls).toBe(0);
    expect(providerAvailability({}).billing).toMatchObject({
      available: false,
      liveVerified: false,
    });
  });

  it('normalizes GitHub releases and excludes drafts using the official endpoint', async () => {
    const transport: ProviderTransport = async (request) => {
      expect(request.url).toBe(
        'https://api.github.com/repos/sparko/community/releases?per_page=30',
      );
      expect(request.headers?.['x-github-api-version']).toBe('2022-11-28');
      return {
        status: 200,
        body: JSON.stringify([
          {
            id: 1,
            name: 'Release',
            tag_name: 'v1',
            body: '<b>New</b>',
            html_url: 'https://github.com/sparko/community/releases/v1',
            published_at: now.toISOString(),
            draft: false,
          },
          {
            id: 2,
            name: 'Draft',
            tag_name: 'v2',
            body: null,
            html_url: 'https://github.com/sparko/community/releases/v2',
            published_at: null,
            draft: true,
          },
        ]),
      };
    };
    expect(
      await pollSource(
        {
          provider: 'github',
          channelId,
          owner: 'sparko',
          repository: 'community',
        },
        {},
        transport,
      ),
    ).toEqual([
      {
        eventId: 'github:1',
        title: 'Release',
        text: 'New',
        url: 'https://github.com/sparko/community/releases/v1',
        publishedAt: now.toISOString(),
      },
    ]);
  });

  it('uses a verified YouTube upload playlist and authenticated Twitch stream source', async () => {
    const urls: string[] = [];
    const youtube: ProviderTransport = async (request) => {
      urls.push(request.url);
      return {
        status: 200,
        body: JSON.stringify(
          urls.length === 1
            ? {
                items: [
                  {
                    contentDetails: {
                      relatedPlaylists: { uploads: 'UUuploads' },
                    },
                  },
                ],
              }
            : {
                items: [
                  {
                    snippet: {
                      title: 'Video',
                      description: 'New episode',
                      publishedAt: now.toISOString(),
                      resourceId: { videoId: 'abcdefghijk' },
                    },
                  },
                ],
              },
        ),
      };
    };
    expect(
      await pollSource(
        {
          provider: 'youtube',
          channelId,
          youtubeChannelId: `UC${'a'.repeat(22)}`,
        },
        { YOUTUBE_API_KEY: 'fixture' },
        youtube,
      ),
    ).toMatchObject([{ eventId: 'youtube:abcdefghijk' }]);
    expect(urls[1]).toContain('playlistId=UUuploads');
    const twitch: ProviderTransport = async (request) => {
      expect(request.headers).toMatchObject({
        'client-id': 'fixture',
        authorization: 'Bearer fixture',
      });
      return {
        status: 200,
        body: JSON.stringify({
          data: [
            {
              id: 'stream-1',
              user_login: 'sparko',
              title: 'Live',
              started_at: now.toISOString(),
            },
          ],
        }),
      };
    };
    expect(
      await pollSource(
        { provider: 'twitch', channelId, username: 'sparko' },
        { TWITCH_CLIENT_ID: 'fixture', TWITCH_ACCESS_TOKEN: 'fixture' },
        twitch,
      ),
    ).toMatchObject([
      { eventId: 'twitch:stream-1', url: 'https://www.twitch.tv/sparko' },
    ]);
  });

  it('creates scoped Stripe checkout with provider idempotency and refuses non-HTTPS checkout URLs', async () => {
    const transport: ProviderTransport = async (request) => {
      expect(request.headers?.['idempotency-key']).toBe(
        'sparko-checkout:intent',
      );
      const body = new URLSearchParams(request.body);
      expect(body.get('subscription_data[metadata][guildId]')).toBe(guildId);
      expect(body.get('subscription_data[metadata][userId]')).toBe(userId);
      return {
        status: 200,
        body: JSON.stringify({
          id: 'cs_test',
          url: 'https://checkout.stripe.com/c/pay/cs_test',
          expires_at: Number(timestamp) + 3600,
        }),
      };
    };
    expect(
      await createStripeCheckout(
        { id: 'intent', guildId, userId },
        'https://panel.coin-sprite.com/',
        env,
        transport,
      ),
    ).toMatchObject({ checkoutId: 'cs_test' });
    await expect(
      createStripeCheckout(
        { id: 'intent', guildId, userId },
        'https://panel.coin-sprite.com/',
        env,
        async () => ({
          status: 200,
          body: JSON.stringify({
            id: 'cs_test',
            url: 'http://checkout.stripe.com/c/pay/cs_test',
            expires_at: Number(timestamp) + 3600,
          }),
        }),
      ),
    ).rejects.toThrow('unavailable');
  });

  it('retrieves current subscription state instead of trusting callback entitlement fields', async () => {
    const observed = await resolveStripeEvent(
      {
        id: 'evt_test',
        type: 'customer.subscription.updated',
        created: Number(timestamp),
        livemode: false,
        data: {
          object: {
            id: 'sub_test',
            status: 'canceled',
            metadata: { guildId: 'forged' },
          },
        },
      },
      env,
      async (request) => {
        expect(request.url).toBe(
          'https://api.stripe.com/v1/subscriptions/sub_test',
        );
        return { status: 200, body: JSON.stringify(subscription) };
      },
    );
    expect(observed?.subscription).toMatchObject({
      status: 'active',
      metadata: { guildId },
    });
  });

  it('requests text-only human review with storage disabled and rejects incomplete AI responses', async () => {
    const input = {
      prompt: 'Draft an announcement',
      purpose: 'message-draft',
      maxOutputTokens: 100,
    };
    const transport: ProviderTransport = async (request) => {
      expect(JSON.parse(request.body!)).toMatchObject({
        input: input.prompt,
        store: false,
        max_output_tokens: 100,
      });
      expect(JSON.parse(request.body!)).not.toHaveProperty('tools');
      return {
        status: 200,
        body: JSON.stringify({
          id: 'resp_fixture',
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Draft copy' }],
            },
          ],
          usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
        }),
      };
    };
    expect(await runAiProvider(input, env, transport)).toMatchObject({
      text: 'Draft copy',
      actionsPerformed: false,
      requiresHumanReview: true,
    });
    await expect(
      runAiProvider(input, env, async () => ({
        status: 200,
        body: JSON.stringify({
          id: 'resp_fixture',
          status: 'incomplete',
          output: [],
        }),
      })),
    ).rejects.toThrow('did not complete');
  });

  it('authorizes every multi-server target before reading any configuration', async () => {
    let reads = 0;
    const authority = async (target: string): Promise<Actor> => {
      if (target !== guildId) throw Error('Denied target');
      return {
        userId,
        guildId: target,
        isOwner: true,
        isAdmin: true,
        roles: [],
        capabilities: [],
        globalCapabilities: [],
      };
    };
    await expect(
      multiServerPlan(
        {
          sourceGuildId: guildId,
          targetGuildIds: ['123456789012345681'],
          featureIds: ['R51'],
        },
        authority,
        async () => {
          reads++;
          return [];
        },
        async () => {
          reads++;
          return { channels: new Set(), roles: new Set() };
        },
      ),
    ).rejects.toThrow('Denied target');
    expect(reads).toBe(0);
  });
});
