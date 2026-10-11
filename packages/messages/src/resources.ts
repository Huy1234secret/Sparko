import { z } from 'zod';
import { MessageDocumentSchema, type MessageDocument } from './index.js';

/** Resolve current resources on a clone; saved designs retain their declared fallback. */
export function resolveCustomEmojis(
  input: MessageDocument,
  availableIds: ReadonlySet<string> | readonly string[],
): MessageDocument {
  const document = MessageDocumentSchema.parse(input),
    available = new Set(availableIds),
    issues: z.core.$ZodIssue[] = [];
  function visit(value: unknown, path: (string | number)[]): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(object)) {
      if (key === 'emoji' && item && typeof item === 'object' && 'id' in item) {
        const emoji = item as { id: string; fallback?: string };
        if (available.has(emoji.id)) continue;
        if (emoji.fallback) object[key] = { name: emoji.fallback };
        else
          issues.push({
            code: 'custom',
            path: [...path, key, 'id'],
            message:
              'This custom emoji is unavailable to Sparko. Choose an available server emoji or add a Unicode fallback.',
          });
      } else visit(item, [...path, key]);
    }
  }
  visit(document, []);
  if (issues.length) throw new z.ZodError(issues);
  return document;
}
