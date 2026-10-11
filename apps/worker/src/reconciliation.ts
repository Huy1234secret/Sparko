import { isDeepStrictEqual } from 'node:util';
import type { DiscordMessage } from './discord.js';

type Context =
  | 'component'
  | 'embed'
  | 'media'
  | 'gallery-item'
  | 'option'
  | 'emoji'
  | 'embed-field'
  | 'embed-image'
  | 'embed-author'
  | 'embed-footer'
  | 'other';

/** Discord adds generated IDs/defaults and rewrites attachment URLs on reads. */
function canonicalizer(message: DiscordMessage, defaults = true) {
  const urls = new Map(
    message.attachments.map((attachment) => [
      attachment.url,
      `attachment://${attachment.filename}`,
    ]),
  );
  function normalize(value: unknown, context: Context): unknown {
    if (Array.isArray(value))
      return value.map((item) => normalize(item, context));
    if (!value || typeof value !== 'object') return value;
    const result: Record<string, unknown> = { ...value };
    const type = result['type'];
    // Only these context-specific API response fields are noneditable metadata.
    const ignored =
      context === 'component'
        ? ['id', ...(type === 13 ? ['name', 'size'] : [])]
        : context === 'media'
          ? [
              'proxy_url',
              'width',
              'height',
              'placeholder',
              'placeholder_version',
              'content_type',
              'loading_state',
              'flags',
              'attachment_id',
            ]
          : context === 'embed-image'
            ? [
                'proxy_url',
                'width',
                'height',
                'content_type',
                'placeholder',
                'placeholder_version',
                'flags',
              ]
            : context === 'embed-author' || context === 'embed-footer'
              ? ['proxy_icon_url']
              : [];
    ignored.forEach((key) => delete result[key]);
    if (defaults) {
      if (context === 'component') {
        if (
          type === 2 ||
          (typeof type === 'number' && type >= 3 && type <= 8 && type !== 4)
        )
          result['disabled'] ??= false;
        if (typeof type === 'number' && [3, 5, 6, 7, 8].includes(type)) {
          result['min_values'] ??= 1;
          result['max_values'] ??= 1;
          result['required'] ??= true;
        }
        if ([11, 13, 17].includes(Number(type))) result['spoiler'] ??= false;
        if (type === 11) result['description'] ??= '';
        if (type === 14) {
          result['divider'] ??= true;
          result['spacing'] ??= 1;
        }
        if (type === 17) result['accent_color'] ??= null;
      }
      if (context === 'gallery-item') {
        result['description'] ??= '';
        result['spoiler'] ??= false;
      }
      if (context === 'option') {
        result['description'] ??= '';
        result['default'] ??= false;
      }
      if (context === 'emoji') {
        if (result['id'] === null) delete result['id'];
        result['animated'] ??= false;
      }
      if (context === 'embed-field') result['inline'] ??= false;
      if (context === 'embed') {
        result['type'] ??= 'rich';
        result['fields'] ??= [];
        result['flags'] ??= 0;
        if (
          typeof result['timestamp'] === 'string' &&
          !Number.isNaN(Date.parse(result['timestamp']))
        )
          result['timestamp'] = new Date(result['timestamp']).toISOString();
      }
    }
    for (const [key, item] of Object.entries(result)) {
      let childContext: Context = 'other';
      if (context === 'component') {
        if (key === 'components' || key === 'accessory')
          childContext = 'component';
        if (key === 'media' || key === 'file') childContext = 'media';
        if (key === 'items' && type === 12) childContext = 'gallery-item';
        if (key === 'options' && type === 3) childContext = 'option';
      }
      if (context === 'gallery-item' && key === 'media') childContext = 'media';
      if ((context === 'component' || context === 'option') && key === 'emoji')
        childContext = 'emoji';
      if (context === 'embed') {
        if (key === 'fields') childContext = 'embed-field';
        if (key === 'image' || key === 'thumbnail')
          childContext = 'embed-image';
        if (key === 'author') childContext = 'embed-author';
        if (key === 'footer') childContext = 'embed-footer';
      }
      result[key] =
        (key === 'url' || key === 'icon_url') && typeof item === 'string'
          ? (urls.get(item) ?? item)
          : normalize(item, childContext);
    }
    return result;
  }
  return normalize;
}

export function publicationMatches(
  message: DiscordMessage,
  payload: Record<string, unknown>,
  filenames: readonly string[],
): boolean {
  const normalize = canonicalizer(message);
  return (
    message.content === (payload['content'] ?? '') &&
    ((message.flags ?? 0) & 32768) ===
      ((Number(payload['flags']) || 0) & 32768) &&
    isDeepStrictEqual(
      normalize(message.components, 'component'),
      normalize(payload['components'] ?? [], 'component'),
    ) &&
    isDeepStrictEqual(
      normalize(message.embeds, 'embed'),
      normalize(payload['embeds'] ?? [], 'embed'),
    ) &&
    isDeepStrictEqual(
      message.attachments.map((item) => item.filename).sort(),
      [...filenames].sort(),
    )
  );
}

/** Preserve the visible message while removing issued actions. Sections require an accessory. */
export function archivedMessageComponents(
  message: DiscordMessage,
  issuedIds: ReadonlySet<string>,
  v2: boolean,
): unknown[] {
  function visit(value: unknown, required = false): unknown | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return value;
    const component = { ...value } as Record<string, unknown>;
    if (
      typeof component['custom_id'] === 'string' &&
      issuedIds.has(component['custom_id'])
    )
      return required ? { ...component, disabled: true } : null;
    if (Array.isArray(component['components'])) {
      component['components'] = component['components']
        .map((child) => visit(child))
        .filter((child) => child !== null);
      if (
        (component['type'] === 1 || component['type'] === 17) &&
        !(component['components'] as unknown[]).length
      )
        return null;
    }
    if (component['type'] === 9 && component['accessory'])
      component['accessory'] = visit(component['accessory'], true);
    return component;
  }
  const normalized = canonicalizer(message, false)(
    message.components,
    'component',
  ) as unknown[];
  const components = normalized
    .map((component) => visit(component))
    .filter((component) => component !== null);
  return components.length || !v2
    ? components
    : [{ type: 10, content: 'This publication is archived.' }];
}
