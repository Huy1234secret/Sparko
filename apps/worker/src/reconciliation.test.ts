import { describe, expect, it } from 'vitest';
import { archivedMessageComponents, publicationMatches } from './reconciliation.js';
import type { DiscordMessage } from './discord.js';

describe('Discord publication comparison', () => {
  const payload = {
    flags: 32768,
    components: [
      {
        type: 12,
        items: [
          {
            media: { url: 'attachment://sparko-image.png' },
            description: 'A spark',
          },
        ],
      },
    ],
  };
  const message: DiscordMessage = {
    id: '123',
    channel_id: '456',
    author: { id: '789', username: 'Sparko' },
    content: '',
    timestamp: new Date().toISOString(),
    flags: 32768,
    components: [
      {
        type: 12,
        id: 1,
        items: [
          {
            media: {
              url: 'https://cdn.discordapp.com/spark.png',
              proxy_url: 'https://media.discordapp.net/spark.png',
            },
            description: 'A spark',
            spoiler: false,
          },
        ],
      },
    ],
    embeds: [],
    attachments: [
      {
        id: '321',
        filename: 'sparko-image.png',
        size: 100,
        url: 'https://cdn.discordapp.com/spark.png',
      },
    ],
  };
  it('compares generated attachment URLs and component IDs against the saved design', () => {
    expect(publicationMatches(message, payload, ['sparko-image.png'])).toBe(
      true,
    );
  });
  it('detects content, V2 mode, attachment and component drift', () => {
    expect(
      publicationMatches({ ...message, content: 'Unexpected text' }, payload, [
        'sparko-image.png',
      ]),
    ).toBe(false);
    expect(
      publicationMatches({ ...message, flags: 0 }, payload, [
        'sparko-image.png',
      ]),
    ).toBe(false);
    expect(
      publicationMatches({ ...message, attachments: [] }, payload, [
        'sparko-image.png',
      ]),
    ).toBe(false);
    expect(
      publicationMatches({ ...message, components: [] }, payload, [
        'sparko-image.png',
      ]),
    ).toBe(false);
  });
  it.each([
    { description: 'Unexpected visible description' },
    { footer: { text: 'Unexpected footer' } },
    { timestamp: '2026-10-11T10:00:00.000Z' },
    { author: { name: 'Unexpected author' } },
    { fields: [{ name: 'Unexpected field', value: 'Added content' }] },
  ])('detects unexpected editable embed fields: %j', (extra) => {
    const saved = { embeds: [{ title: 'Saved title' }], components: [] };
    const actual = { ...message, flags: 0, components: [], attachments: [], embeds: [{ type: 'rich', title: 'Saved title', ...extra }] };
    expect(publicationMatches(actual, saved, [])).toBe(false);
  });
  it('detects disabled controls, changed selection limits and new option defaults', () => {
    const components = [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'spk:ctl:saved', label: 'Continue' }, { type: 3, custom_id: 'spk:ctl:choice', options: [{ label: 'One', value: '1' }] }] }];
    const actual = { ...message, components, attachments: [] };
    const saved = { flags: 32768, components };
    expect(publicationMatches(actual, saved, [])).toBe(true);
    expect(publicationMatches({ ...actual, components: [{ type: 1, components: [{ ...components[0]!.components[0], disabled: true }, components[0]!.components[1]] }] }, saved, [])).toBe(false);
    expect(publicationMatches({ ...actual, components: [{ type: 1, components: [components[0]!.components[0], { ...components[0]!.components[1], max_values: 2 }] }] }, saved, [])).toBe(false);
    expect(publicationMatches({ ...actual, components: [{ type: 1, components: [components[0]!.components[0], { ...components[0]!.components[1], options: [{ label: 'One', value: '1', default: true }] }] }] }, saved, [])).toBe(false);
  });
  it('normalizes protocol defaults and only context-specific generated metadata', () => {
    const components = [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'spk:ctl:saved', label: 'Continue', emoji: { name: '✨' } }, { type: 3, custom_id: 'spk:ctl:choice', options: [{ label: 'One', value: '1' }] }] }];
    const actual = { ...message, flags: 0, attachments: [], components: [{ type: 1, id: 1, components: [{ ...components[0]!.components[0], id: 2, disabled: false, emoji: { name: '✨', id: null, animated: false } }, { ...components[0]!.components[1], id: 3, min_values: 1, max_values: 1, disabled: false, required: true, options: [{ label: 'One', value: '1', default: false, description: '' }] }] }], embeds: [{ type: 'rich', title: 'Title', timestamp: '2026-10-11T10:00:00+00:00', fields: [{ name: 'Field', value: 'Value', inline: false }], footer: { text: 'Footer', icon_url: 'https://example.com/icon.png', proxy_icon_url: 'https://cdn.discordapp.com/proxy.png' }, image: { url: 'https://example.com/image.png', proxy_url: 'https://cdn.discordapp.com/image.png', width: 400, height: 200 } }] };
    const saved = { components, embeds: [{ title: 'Title', timestamp: '2026-10-11T10:00:00.000Z', fields: [{ name: 'Field', value: 'Value' }], footer: { text: 'Footer', icon_url: 'https://example.com/icon.png' }, image: { url: 'https://example.com/image.png' } }] };
    expect(publicationMatches(actual, saved, [])).toBe(true);
    expect(publicationMatches({ ...actual, embeds: [{ ...actual.embeds[0], footer: { text: 'Footer', icon_url: 'https://example.com/changed.png' } }] }, saved, [])).toBe(false);
  });
  it('does not rewrite visible text merely because it resembles an attachment URL', () => {
    const actual = { ...message, components: [{ type: 10, content: 'https://cdn.discordapp.com/spark.png' }] };
    expect(publicationMatches(actual, { flags: 32768, components: [{ type: 10, content: 'attachment://sparko-image.png' }] }, ['sparko-image.png'])).toBe(false);
  });
  it('archives V2 display while removing issued rows and disabling required section accessories', () => {
    const actual = { ...message, components: [{ type: 17, id: 1, accent_color: 123, components: [{ type: 10, id: 2, content: 'Welcome' }, { type: 1, components: [{ type: 2, style: 1, label: 'Open', custom_id: 'spk:ctl:row' }] }] }, { type: 9, components: [{ type: 10, content: 'Support' }], accessory: { type: 2, style: 1, label: 'Ticket', custom_id: 'spk:ctl:section' } }, ...message.components] };
    const result = archivedMessageComponents(actual, new Set(['spk:ctl:row', 'spk:ctl:section']), true);
    expect(result[0]).toEqual({ type: 17, accent_color: 123, components: [{ type: 10, content: 'Welcome' }] });
    expect(result[1]).toMatchObject({ accessory: { custom_id: 'spk:ctl:section', disabled: true } });
    expect(JSON.stringify(result)).toContain('attachment://sparko-image.png');
    expect(JSON.stringify(result)).not.toContain('proxy_url');
  });
});
