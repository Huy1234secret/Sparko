import { describe, expect, it } from 'vitest';
import {
  getPosted,
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
  it('builds a classic message with an embed and link buttons', () => {
    const m: StudioMessage = {
      ...base,
      content: 'Hi @everyone',
      embed: {
        ...base.embed,
        footer: 'Team',
        thumbnail: true,
        timestamp: true,
      },
      buttons: [{ id: 'x', label: 'Go', url: 'https://example.com' }],
    };
    expect(studioProblem(m)).toBeNull();
    const body = studioPayload(m, {
      serverIcon: 'https://cdn/icon.png',
      now: 0,
    });
    expect(body).toMatchObject({
      content: 'Hi @everyone',
      embeds: [
        {
          title: 'Big news',
          color: 0xfacc15,
          footer: { text: 'Team' },
          thumbnail: { url: 'https://cdn/icon.png' },
          timestamp: '1970-01-01T00:00:00.000Z',
        },
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
    const body = studioPayload(v2, { serverIcon: null, now: 0 }) as {
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
    expect(studioProblem({ ...base, content: '', useEmbed: false })).toMatch(
      /empty/,
    );
    expect(
      studioProblem({ ...base, embed: { ...base.embed, image: 'http://x' } }),
    ).toMatch(/https/);
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
