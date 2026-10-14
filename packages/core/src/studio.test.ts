import { describe, expect, it } from 'vitest';
import {
  embedDefault,
  getPosted,
  normaliseStudio,
  IS_COMPONENTS_V2,
  openDb,
  publishStudio,
  studioDefault,
  studioPayload,
  studioProblem,
  upsertGuild,
  writeModule,
  type Rest,
  type StudioMessage,
} from './index.ts';

const base = studioDefault('100');
const v2: StudioMessage = {
  ...base,
  layout: 'v2',
  v2: {
    container: true,
    accent: '#5865F2',
    blocks: [
      { id: 'a', type: 'text', content: '## Hello' },
      { id: 'b', type: 'separator', divider: true, spacing: 'large' },
      {
        id: 'c',
        type: 'section',
        content: 'Prize',
        accessory: { type: 'thumbnail', url: 'https://img.example/p.png' },
      },
      {
        id: 'd',
        type: 'gallery',
        images: [
          { id: 'i', url: 'https://img.example/1.png', description: 'One' },
        ],
      },
      {
        id: 'e',
        type: 'buttons',
        buttons: [{ id: 'x', label: 'Rules', url: 'https://example.com' }],
      },
    ],
  },
};

describe('Message Studio messages', () => {
  it('builds a classic message with embeds and link buttons', () => {
    const m: StudioMessage = {
      ...base,
      content: 'Hi @everyone',
      embeds: [
        {
          ...base.embeds[0]!,
          author: 'Sparko',
          authorIcon: 'https://cdn/a.png',
          authorUrl: 'https://example.com',
          footer: 'Team',
          thumbnail: 'https://cdn/icon.png',
          timestamp: true,
          fields: [
            { id: 'f1', name: 'When', value: '', inline: true },
            { id: 'f2', name: '', value: '', inline: false },
          ],
        },
        // Empty embeds are left out.
        { ...embedDefault('e2') },
        { ...embedDefault('e3'), image: 'https://cdn/big.png' },
      ],
      buttons: [{ id: 'x', label: 'Go', url: 'https://example.com' }],
    };
    expect(studioProblem(m)).toBeNull();
    const body = studioPayload(m, { now: 0 });
    expect(body.embeds).toHaveLength(2);
    expect(body).toMatchObject({
      content: 'Hi @everyone',
      embeds: [
        {
          title: 'Big news',
          color: 0xfacc15,
          author: {
            name: 'Sparko',
            icon_url: 'https://cdn/a.png',
            url: 'https://example.com',
          },
          footer: { text: 'Team' },
          thumbnail: { url: 'https://cdn/icon.png' },
          timestamp: '1970-01-01T00:00:00.000Z',
          // A blank value stands in as a zero-width space.
          fields: [{ name: 'When', value: '\u200b', inline: true }],
        },
        { image: { url: 'https://cdn/big.png' } },
      ],
      components: [
        {
          type: 1,
          components: [{ type: 2, style: 5, url: 'https://example.com' }],
        },
      ],
      // Nobody is pinged by surprise, not even @everyone.
      allowed_mentions: { parse: [] },
    });
  });

  it('builds a Components V2 message inside a container', () => {
    expect(studioProblem(v2)).toBeNull();
    const body = studioPayload(v2, { now: 0 }) as unknown as {
      flags: number;
      components: {
        type: number;
        accent_color: number;
        components: { type: number }[];
      }[];
    };
    expect(body.flags).toBe(IS_COMPONENTS_V2);
    expect(body.components[0]!.type).toBe(17);
    expect(body.components[0]!.accent_color).toBe(0x5865f2);
    expect(body.components[0]!.components.map((c) => c.type)).toEqual([
      10, 14, 9, 12, 1,
    ]);
    expect('content' in body).toBe(false);
  });

  it('refuses messages Discord would reject', () => {
    expect(studioProblem({ ...base, content: '', embeds: [] })).toMatch(
      /empty/,
    );
    expect(
      studioProblem({
        ...base,
        embeds: [{ ...base.embeds[0]!, image: 'http://x' }],
      }),
    ).toMatch(/https/);
    expect(
      studioProblem({
        ...base,
        embeds: Array.from({ length: 11 }, (_, i) => embedDefault(`e${i}`)),
      }),
    ).toMatch(/10 embeds/);
  });

  it('reads messages saved before there could be several embeds', () => {
    const old = {
      ...base,
      embeds: undefined,
      useEmbed: true,
      embed: { title: 'Old', thumbnail: true, fields: [] },
    } as unknown as StudioMessage;
    const m = normaliseStudio(old);
    expect(m.embeds).toHaveLength(1);
    expect(m.embeds[0]).toMatchObject({
      title: 'Old',
      thumbnail: '',
      id: 'e1',
    });
    expect('embed' in m).toBe(false);
    expect(studioProblem({ ...v2, v2: { ...v2.v2, blocks: [] } })).toMatch(
      /at least one/,
    );
    expect(
      studioProblem({
        ...v2,
        v2: {
          ...v2.v2,
          blocks: [{ id: 'g', type: 'gallery', images: [] }],
        },
      }),
    ).toMatch(/1 to 10/);
  });

  it('posts once, edits after, and posts a new message when the layout changes', async () => {
    const db = openDb(':memory:');
    upsertGuild(
      db,
      { id: 'g', name: 'G', icon: null, memberCount: 1, installed: true },
      1,
    );
    const calls: string[] = [];
    const rest = {
      post: async (p: string) => (
        calls.push(`POST ${p}`),
        { id: `m${calls.length}` }
      ),
      patch: async (p: string) => (calls.push(`PATCH ${p}`), {}),
    } as unknown as Rest;
    writeModule(db, 'g', 'studio', { on: true, config: base }, 1);
    await publishStudio(rest, db, 'g');
    const first = getPosted(db, 'g', 'studio:embed')!;
    await publishStudio(rest, db, 'g');
    writeModule(db, 'g', 'studio', { on: true, config: v2 }, 2);
    await publishStudio(rest, db, 'g');
    expect(calls).toEqual([
      'POST /channels/100/messages',
      `PATCH /channels/100/messages/${first.messageId}`,
      'POST /channels/100/messages',
    ]);
  });
});
