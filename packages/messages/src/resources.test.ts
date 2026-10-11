import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MessageDocumentSchema,
  compileMessage,
  resolveCustomEmojis,
} from './index.js';

const emojiId = '811111111111111111';
function design(mode: 'v2' | 'embed' = 'v2') {
  return MessageDocumentSchema.parse({
    schemaVersion: 1,
    name: 'Resource checks',
    mode,
    ...(mode === 'embed' ? { content: 'Choose your option' } : {}),
    blocks: [
      ...(mode === 'v2'
        ? [
            {
              type: 'section',
              texts: ['Open the site'],
              accessory: {
                type: 'button',
                key: 'site',
                label: 'Site',
                style: 'link',
                url: 'https://example.com',
                emoji: {
                  id: emojiId,
                  name: 'spark',
                  animated: true,
                  fallback: '✨',
                },
              },
            },
          ]
        : []),
      {
        type: 'controls',
        controls: [
          {
            type: 'select',
            key: 'select',
            action: { type: 'response.private', text: 'Thanks' },
            options: [
              {
                label: 'Spark',
                value: 'spark',
                emoji: { id: emojiId, name: 'spark', fallback: '✨' },
              },
              { label: 'Unicode', value: 'unicode', emoji: { name: '🎫' } },
            ],
          },
        ],
      },
    ],
  });
}

describe('current custom emoji resolution', () => {
  it('preserves available custom emoji and leaves the source independent', () => {
    const source = design(),
      resolved = resolveCustomEmojis(source, new Set([emojiId]));
    expect(resolved).toEqual(source);
    expect(resolved).not.toBe(source);
    resolved.name = 'Changed clone';
    expect(source.name).toBe('Resource checks');
  });

  it.each(['v2', 'embed'] as const)(
    'compiles unavailable emoji as the declared fallback in %s',
    (mode) => {
      const source = design(mode),
        original = structuredClone(source),
        resolved = resolveCustomEmojis(source, []),
        payload = JSON.stringify(
          compileMessage(resolved, {}, { select: 'spk:ctl:select' }),
        );
      expect(payload).not.toContain(emojiId);
      expect(payload).toContain('✨');
      expect(payload).toContain('🎫');
      expect(source).toEqual(original);
    },
  );

  it('reports every unavailable resource at its editable emoji ID field', () => {
    const source = design();
    function removeFallback(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      if ('fallback' in value) delete value.fallback;
      Object.values(value).forEach(removeFallback);
    }
    removeFallback(source);
    try {
      resolveCustomEmojis(source, []);
      throw new Error('Unavailable resources should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      expect((error as z.ZodError).issues.map((issue) => issue.path)).toEqual([
        ['blocks', 0, 'accessory', 'emoji', 'id'],
        ['blocks', 1, 'controls', 0, 'options', 0, 'emoji', 'id'],
      ]);
    }
    expect(resolveCustomEmojis(source, [emojiId])).toEqual(source);
  });
});
