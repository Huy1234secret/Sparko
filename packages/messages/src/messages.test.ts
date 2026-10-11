import { describe, expect, it } from 'vitest';
import {
  ACTION_REGISTRY,
  BRAND_YELLOW,
  MessageDocumentSchema,
  compileMessage,
  convertMessageMode,
  defaultTicketDocument,
  initialMessage,
  isSafeMediaUrl,
  modeChangeLossReport,
  validateControlSubmission,
} from './index.js';

const issued = { 'ticket:create': 'spk:ctl:persisted_test_control' };
const base = {
  schemaVersion: 1,
  name: 'Test',
  mode: 'v2',
  visibility: 'public',
  tokenContext: 'generic',
  allowedTokens: [],
};

describe('canonical message compilation', () => {
  it('compiles the ticket panel into V2 with persisted IDs and no incompatible fields', () => {
    const payload = compileMessage(defaultTicketDocument, {}, issued);
    expect(payload.flags).toBe(32768);
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('embeds');
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.components).toEqual([
      {
        type: 17,
        accent_color: BRAND_YELLOW,
        components: [
          { type: 10, content: '## Sparko support' },
          {
            type: 10,
            content:
              'Open a private ticket. Your request will be visible only to permitted support participants.',
          },
          { type: 14, divider: true, spacing: 1 },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: 'Open a ticket',
                emoji: { name: '🎫' },
                custom_id: issued['ticket:create'],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('compiles traditional embeds as a separate mode and translates icon URL fields', () => {
    const doc = MessageDocumentSchema.parse({
      ...base,
      mode: 'embed',
      embeds: [
        {
          title: 'Entry saved',
          description: 'Your confirmed entry',
          footer: {
            text: 'Sparko',
            iconUrl: 'https://cdn.example.com/footer.png',
          },
        },
      ],
      blocks: [],
    });
    const payload = compileMessage(doc);
    expect(payload).not.toHaveProperty('flags');
    expect(payload.embeds).toEqual([
      {
        title: 'Entry saved',
        description: 'Your confirmed entry',
        color: BRAND_YELLOW,
        footer: {
          text: 'Sparko',
          icon_url: 'https://cdn.example.com/footer.png',
        },
      },
    ]);
  });

  it('rejects arbitrary fields, mixed output modes, and nested containers', () => {
    expect(() =>
      compileMessage(
        { ...defaultTicketDocument, content: 'Forbidden' },
        {},
        issued,
      ),
    ).toThrow();
    expect(() =>
      compileMessage({ ...initialMessage('embed'), flags: 32768 }),
    ).toThrow();
    expect(() =>
      compileMessage({
        ...base,
        blocks: [
          {
            type: 'container',
            children: [
              {
                type: 'container',
                children: [{ type: 'text', text: 'Nested' }],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('counts nested rows/buttons/accessories toward the 40 component aggregate', () => {
    const block = {
      type: 'section',
      texts: ['First', 'Second', 'Third'],
      accessory: {
        type: 'thumbnail',
        url: 'https://cdn.example.com/avatar.png',
      },
    };
    expect(() =>
      compileMessage({
        ...base,
        blocks: Array.from({ length: 8 }, () => block),
      }),
    ).not.toThrow();
    expect(() =>
      compileMessage({
        ...base,
        blocks: Array.from({ length: 9 }, () => block),
      }),
    ).toThrow(/45 components/);
  });

  it('enforces total V2 text and total embed characters after substitution', () => {
    expect(() =>
      compileMessage({
        ...base,
        blocks: [
          { type: 'text', text: 'A'.repeat(2001) },
          { type: 'text', text: 'B'.repeat(2000) },
        ],
      }),
    ).toThrow(/4001 characters/);
    expect(() =>
      compileMessage({
        ...base,
        mode: 'embed',
        embeds: [
          { description: 'a'.repeat(4000) },
          { description: 'b'.repeat(2001) },
        ],
        blocks: [],
      }),
    ).toThrow(/6001 characters/);
    expect(() =>
      compileMessage(
        {
          ...base,
          tokenContext: 'member',
          allowedTokens: ['member.name'],
          blocks: [{ type: 'text', text: '{{member.name}}' }],
        },
        { 'member.name': 'X'.repeat(4001) },
      ),
    ).toThrow(/Resolved text/);
  });

  it('escapes member data and disables mention parsing', () => {
    const payload = compileMessage(
      {
        ...base,
        tokenContext: 'member',
        allowedTokens: ['member.name'],
        blocks: [{ type: 'text', text: 'Hello {{member.name}}' }],
      },
      { 'member.name': '**admin** @everyone <@123456789012345678>' },
    );
    expect(payload.components[0]?.['content']).toBe(
      'Hello \\*\\*admin\\*\\* @\u200beveryone \\<@\u200b123456789012345678\\>',
    );
    expect(payload.allowed_mentions.parse).toEqual([]);
  });

  it('uses declared optional fallbacks and rejects missing required or forbidden tokens', () => {
    expect(
      compileMessage({
        ...base,
        tokenContext: 'member',
        allowedTokens: ['member.name'],
        blocks: [{ type: 'text', text: '{{member.name}}' }],
      }).components[0]?.['content'],
    ).toBe('Member');
    expect(() =>
      compileMessage({
        ...base,
        tokenContext: 'level',
        allowedTokens: ['level.number'],
        blocks: [{ type: 'text', text: '{{level.number}}' }],
      }),
    ).toThrow(/Provide a value/);
    expect(() =>
      compileMessage({
        ...base,
        allowedTokens: ['level.number'],
        blocks: [{ type: 'text', text: '{{level.number}}' }],
      }),
    ).toThrow(/unavailable/);
    expect(() =>
      compileMessage({
        ...base,
        blocks: [{ type: 'text', text: '{{secret.token}}' }],
      }),
    ).toThrow(/unknown/);
    expect(() =>
      compileMessage({
        ...base,
        blocks: [{ type: 'text', text: '{{server.name' }],
      }),
    ).toThrow(/syntax/);
  });

  it('requires issued identities, rejects duplicate keys/IDs, and never compiles action definitions', () => {
    expect(() => compileMessage(defaultTicketDocument)).toThrow(
      /persisted control/,
    );
    expect(() =>
      compileMessage(
        defaultTicketDocument,
        {},
        { 'ticket:create': 'spk:ctl:' + 'x'.repeat(100) },
      ),
    ).toThrow();
    const button = {
      type: 'button',
      key: 'one',
      style: 'primary',
      label: 'Open',
      action: { type: 'ticket.create', categoryId: 'general' },
    };
    expect(() =>
      compileMessage(
        { ...base, blocks: [{ type: 'controls', controls: [button, button] }] },
        {},
        { one: 'spk:ctl:one' },
      ),
    ).toThrow(/keys/);
    expect(() =>
      compileMessage(
        {
          ...base,
          blocks: [
            { type: 'controls', controls: [button, { ...button, key: 'two' }] },
          ],
        },
        {},
        { one: 'spk:ctl:same', two: 'spk:ctl:same' },
      ),
    ).toThrow(/custom IDs/);
    expect(
      JSON.stringify(compileMessage(defaultTicketDocument, {}, issued)),
    ).not.toContain('categoryId');
  });

  it('validates links, gallery/file exposure and genuine Discord emoji shapes', () => {
    for (const url of [
      'http://example.com/a.png',
      'https://localhost/a.png',
      'https://127.0.0.1/a.png',
      'https://user:pass@example.com/a.png',
      'file:///etc/passwd',
      'https://10.0.0.1/a.png',
      'https://[::1]/a.png',
    ])
      expect(isSafeMediaUrl(url)).toBe(false);
    expect(isSafeMediaUrl('attachment://rank.png')).toBe(true);
    expect(() =>
      compileMessage({
        ...base,
        blocks: [{ type: 'file', url: 'https://example.com/a.pdf' }],
      }),
    ).toThrow();
    expect(() =>
      compileMessage({
        ...base,
        blocks: [
          {
            type: 'controls',
            controls: [
              {
                type: 'button',
                key: 'link',
                style: 'link',
                label: 'Site',
                url: 'https://example.com',
                emoji: { name: 'ticket' },
              },
            ],
          },
        ],
      }),
    ).toThrow(/Unicode emoji/);
    const payload = compileMessage({
      ...base,
      blocks: [
        {
          type: 'gallery',
          items: [{ url: 'attachment://rank.png', alt: 'Rank summary' }],
        },
      ],
    });
    expect(payload.components[0]).toEqual({
      type: 12,
      items: [
        {
          media: { url: 'attachment://rank.png' },
          description: 'Rank summary',
        },
      ],
    });
  });

  it('validates select choice values against the immutable published snapshot', () => {
    const doc = {
      ...base,
      blocks: [
        {
          type: 'controls',
          controls: [
            {
              type: 'select',
              key: 'topics',
              options: [
                { label: 'Support', value: 'support' },
                { label: 'Billing', value: 'billing' },
              ],
              action: { type: 'ticket.create', categoryId: 'general' },
            },
          ],
        },
      ],
    };
    expect(validateControlSubmission(doc, 'topics', ['support'])).toEqual({
      action: { type: 'ticket.create', categoryId: 'general' },
      values: ['support'],
    });
    expect(() =>
      validateControlSubmission(doc, 'topics', ['invented']),
    ).toThrow(/published control/);
    expect(() =>
      validateControlSubmission(doc, 'topics', ['support', 'support']),
    ).toThrow(/distinct options/);
    expect(() => validateControlSubmission(doc, 'other', [])).toThrow(
      /unavailable/,
    );
    expect(ACTION_REGISTRY['role.toggle'].retry).toBe(
      'persist-before-delivery',
    );
  });

  it('reports nested media loss and requires a replacement when changing modes', () => {
    const doc = MessageDocumentSchema.parse({
      ...base,
      blocks: [
        {
          type: 'container',
          children: [
            { type: 'text', text: 'Welcome' },
            {
              type: 'gallery',
              items: [{ url: 'https://cdn.example.com/spark.gif' }],
            },
          ],
        },
      ],
    });
    const report = modeChangeLossReport(doc, 'embed');
    expect(report.replacementRequired).toBe(true);
    expect(report.losses.map((loss) => loss.path)).toContainEqual([
      'blocks',
      0,
      'children',
      1,
    ]);
    const converted = convertMessageMode(doc, 'embed');
    expect(
      compileMessage(converted.document).embeds?.[0]?.['description'],
    ).toBe('Welcome');
    expect(modeChangeLossReport(doc, 'v2')).toEqual({
      replacementRequired: false,
      losses: [],
    });
  });
});
