import { z } from 'zod';
export * from './forms.js';

/** Protocol limits verified against Discord's component and message references. */
export const DISCORD_LIMITS = Object.freeze({
  components: 40,
  v2Text: 4000,
  legacyRows: 5,
  buttonsPerRow: 5,
  customId: 100,
  embeds: 10,
  embedCharacters: 6000,
  content: 2000,
  galleryItems: 10,
});
export const BRAND_YELLOW = 0xfacc15;
export const COMPONENTS_V2_FLAG = 1 << 15;

const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9:_-]+$/);
const snowflake = z.string().regex(/^[1-9][0-9]{16,19}$/);
const color = z.number().int().min(0).max(0xffffff);

export function isSafeMediaUrl(value: string): boolean {
  if (/^attachment:\/\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value))
    return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !['localhost', '::1', '::', '0.0.0.0'].includes(host) &&
      !host.includes(':') &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
      !host.endsWith('.localhost') &&
      !host.endsWith('.local') &&
      !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(
        host,
      ) &&
      !/^(fc|fd|fe80):/i.test(host) &&
      !value.includes('{{')
    );
  } catch {
    return false;
  }
}

const mediaUrl = z
  .string()
  .max(2048)
  .refine(
    isSafeMediaUrl,
    'Use a public HTTPS URL or a validated attachment reference.',
  );
const linkUrl = z
  .string()
  .max(512)
  .refine(
    (value) => value.startsWith('https://') && isSafeMediaUrl(value),
    'Use a public HTTPS link.',
  );
const unicodeEmoji = z
  .string()
  .min(1)
  .max(16)
  .refine(
    (value) =>
      /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(
        value,
      ),
    'Use a Unicode emoji rather than an icon name.',
  );
export const EmojiSchema = z.union([
  z.object({ name: unicodeEmoji }).strict(),
  z
    .object({
      id: snowflake,
      name: z
        .string()
        .min(1)
        .max(32)
        .regex(/^[a-zA-Z0-9_]+$/),
      animated: z.boolean().optional(),
      fallback: unicodeEmoji.optional(),
    })
    .strict(),
]);

export const ActionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('response.private'),
      text: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('response.channel'),
      text: z.string().min(1).max(2000),
      channelId: snowflake,
    })
    .strict(),
  z
    .object({ type: z.literal('form.open'), formVersionId: identifier })
    .strict(),
  z.object({ type: z.literal('role.add'), roleId: snowflake }).strict(),
  z.object({ type: z.literal('role.remove'), roleId: snowflake }).strict(),
  z.object({ type: z.literal('role.toggle'), roleId: snowflake }).strict(),
  z.object({ type: z.literal('role.menu'), menuId: identifier }).strict(),
  z
    .object({ type: z.literal('ticket.create'), categoryId: identifier })
    .strict(),
  z.object({ type: z.literal('vote.cast'), pollId: identifier }).strict(),
  z.object({ type: z.literal('crate.claim'), crateId: identifier }).strict(),
  z
    .object({ type: z.literal('giveaway.enter'), giveawayId: identifier })
    .strict(),
  z
    .object({ type: z.literal('workflow.run'), workflowVersionId: identifier })
    .strict(),
]);
export type MessageAction = z.infer<typeof ActionSchema>;

/** Authorization/effect metadata; an issued control never conveys this capability itself. */
export const ACTION_REGISTRY = Object.freeze({
  'response.private': {
    capability: 'member.read',
    effect: 'private-message',
    retry: 'safe',
  },
  'response.channel': {
    capability: 'messages.respond',
    effect: 'channel-message',
    retry: 'reconcile',
  },
  'form.open': {
    capability: 'forms.submit',
    effect: 'actor-bound-form',
    retry: 'deduplicate',
  },
  'role.add': {
    capability: 'roles.self',
    effect: 'role-desired-state',
    retry: 'desired-state',
  },
  'role.remove': {
    capability: 'roles.self',
    effect: 'role-desired-state',
    retry: 'desired-state',
  },
  'role.toggle': {
    capability: 'roles.self',
    effect: 'persisted-role-desired-state',
    retry: 'persist-before-delivery',
  },
  'role.menu': { capability: 'roles.self', effect: 'validated-role-selection', retry: 'desired-state' },
  'ticket.create': {
    capability: 'tickets.create',
    effect: 'private-ticket',
    retry: 'reconcile',
  },
  'vote.cast': {
    capability: 'polls.vote',
    effect: 'persisted-vote',
    retry: 'deduplicate',
  },
  'crate.claim': {
    capability: 'crates.claim',
    effect: 'atomic-reward',
    retry: 'deduplicate',
  },
  'giveaway.enter': {
    capability: 'giveaways.enter',
    effect: 'persisted-entry',
    retry: 'deduplicate',
  },
  'workflow.run': {
    capability: 'workflows.run',
    effect: 'budgeted-workflow',
    retry: 'durable-steps',
  },
} satisfies Record<
  MessageAction['type'],
  { capability: string; effect: string; retry: string }
>);

const buttonBase = {
  key: identifier,
  label: z.string().min(1).max(80),
  emoji: EmojiSchema.optional(),
  disabled: z.boolean().optional(),
};
export const ButtonSchema = z.union([
  z
    .object({
      type: z.literal('button'),
      ...buttonBase,
      style: z.enum(['primary', 'secondary', 'success', 'danger']),
      action: ActionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('button'),
      ...buttonBase,
      style: z.literal('link'),
      url: linkUrl,
    })
    .strict(),
]);
export const SelectSchema = z
  .object({
    type: z.literal('select'),
    key: identifier,
    placeholder: z.string().min(1).max(150).optional(),
    minValues: z.number().int().min(0).max(25).default(1),
    maxValues: z.number().int().min(1).max(25).default(1),
    disabled: z.boolean().optional(),
    action: ActionSchema,
    options: z
      .array(
        z
          .object({
            label: z.string().min(1).max(100),
            value: z.string().min(1).max(100),
            description: z.string().max(100).optional(),
            emoji: EmojiSchema.optional(),
            default: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(25),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.minValues > value.maxValues ||
      value.maxValues > value.options.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['maxValues'],
        message: 'Selection limits must fit the available options.',
      });
    if (
      new Set(value.options.map((option) => option.value)).size !==
      value.options.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Select values must be unique.',
      });
    const defaults = value.options.filter((option) => option.default).length;
    if (defaults > value.maxValues)
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Default selections exceed the maximum.',
      });
  });
export const ControlRowSchema = z
  .object({
    type: z.literal('controls'),
    controls: z.union([
      z.array(ButtonSchema).min(1).max(5),
      z.tuple([SelectSchema]),
    ]),
  })
  .strict();
const TextSchema = z
  .object({
    type: z.literal('text'),
    text: z.string().min(1).max(DISCORD_LIMITS.v2Text),
  })
  .strict();
const ThumbnailSchema = z
  .object({
    type: z.literal('thumbnail'),
    url: mediaUrl,
    alt: z.string().max(1024).optional(),
    spoiler: z.boolean().optional(),
  })
  .strict();
const SectionSchema = z
  .object({
    type: z.literal('section'),
    texts: z.array(z.string().min(1).max(4000)).min(1).max(3),
    accessory: z.union([ThumbnailSchema, ButtonSchema]),
  })
  .strict();
const GallerySchema = z
  .object({
    type: z.literal('gallery'),
    items: z
      .array(
        z
          .object({
            url: mediaUrl,
            alt: z.string().max(1024).optional(),
            spoiler: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(DISCORD_LIMITS.galleryItems),
  })
  .strict();
const SeparatorSchema = z
  .object({
    type: z.literal('separator'),
    divider: z.boolean().default(true),
    spacing: z.union([z.literal(1), z.literal(2)]).default(1),
  })
  .strict();
const FileSchema = z
  .object({
    type: z.literal('file'),
    url: z.string().regex(/^attachment:\/\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
    spoiler: z.boolean().optional(),
  })
  .strict();
const ChildBlockSchema = z.discriminatedUnion('type', [
  TextSchema,
  SectionSchema,
  GallerySchema,
  SeparatorSchema,
  FileSchema,
  ControlRowSchema,
]);
const ContainerSchema = z
  .object({
    type: z.literal('container'),
    accentColor: color.default(BRAND_YELLOW),
    spoiler: z.boolean().optional(),
    children: z.array(ChildBlockSchema).min(1).max(39),
  })
  .strict();
export const MessageBlockSchema = z.union([ChildBlockSchema, ContainerSchema]);
export type MessageBlock = z.infer<typeof MessageBlockSchema>;
export type MessageControl =
  | z.infer<typeof ButtonSchema>
  | z.infer<typeof SelectSchema>;

export const EmbedSchema = z
  .object({
    title: z.string().max(256).optional(),
    description: z.string().max(4096).optional(),
    url: linkUrl.optional(),
    color: color.default(BRAND_YELLOW),
    fields: z
      .array(
        z
          .object({
            name: z.string().min(1).max(256),
            value: z.string().min(1).max(1024),
            inline: z.boolean().optional(),
          })
          .strict(),
      )
      .max(25)
      .optional(),
    footer: z
      .object({
        text: z.string().min(1).max(2048),
        iconUrl: mediaUrl.optional(),
      })
      .strict()
      .optional(),
    author: z
      .object({
        name: z.string().min(1).max(256),
        url: linkUrl.optional(),
        iconUrl: mediaUrl.optional(),
      })
      .strict()
      .optional(),
    thumbnail: mediaUrl.optional(),
    image: mediaUrl.optional(),
    timestamp: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.title ||
        value.description ||
        value.fields?.length ||
        value.image ||
        value.thumbnail ||
        value.author ||
        value.footer,
      ),
    'An embed needs visible content.',
  );

export const TOKEN_REGISTRY = Object.freeze({
  'server.name': {
    description: 'Server display name',
    contexts: ['generic', 'member', 'ticket', 'level', 'giveaway'],
    fallback: 'this server',
  },
  'channel.name': {
    description: 'Channel display name',
    contexts: ['generic', 'member', 'ticket', 'level', 'giveaway'],
    fallback: 'this channel',
  },
  'member.name': {
    description: 'Member display name',
    contexts: ['member', 'ticket', 'level', 'giveaway'],
    fallback: 'Member',
  },
  'member.id': {
    description: 'Member ID',
    contexts: ['member', 'ticket', 'level', 'giveaway'],
    fallback: null,
  },
  'level.number': {
    description: 'Current level',
    contexts: ['level'],
    fallback: null,
  },
  'level.xp': {
    description: 'Current XP',
    contexts: ['level'],
    fallback: null,
  },
  'ticket.number': {
    description: 'Ticket number',
    contexts: ['ticket'],
    fallback: null,
  },
  'ticket.topic': {
    description: 'Ticket topic',
    contexts: ['ticket'],
    fallback: 'Support',
  },
  'giveaway.deadline': {
    description: 'Giveaway deadline in the selected timezone',
    contexts: ['giveaway'],
    fallback: null,
  },
  'giveaway.result': {
    description: 'Confirmed giveaway result',
    contexts: ['giveaway'],
    fallback: null,
  },
} as const);
export type TokenName = keyof typeof TOKEN_REGISTRY;
export type TokenContext =
  | 'generic'
  | 'member'
  | 'ticket'
  | 'level'
  | 'giveaway';
export type MessageContext = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;
const tokenNames = Object.keys(TOKEN_REGISTRY) as [TokenName, ...TokenName[]];
const common = {
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(100),
  visibility: z.enum(['public', 'private']).default('public'),
  tokenContext: z
    .enum(['generic', 'member', 'ticket', 'level', 'giveaway'])
    .default('generic'),
  allowedTokens: z.array(z.enum(tokenNames)).max(tokenNames.length).default([]),
};
export const MessageDocumentSchema = z
  .discriminatedUnion('mode', [
    z
      .object({
        ...common,
        mode: z.literal('v2'),
        blocks: z
          .array(MessageBlockSchema)
          .min(1)
          .max(DISCORD_LIMITS.components),
      })
      .strict(),
    z
      .object({
        ...common,
        mode: z.literal('embed'),
        content: z.string().max(DISCORD_LIMITS.content).optional(),
        embeds: z.array(EmbedSchema).max(DISCORD_LIMITS.embeds).default([]),
        blocks: z
          .array(ControlRowSchema)
          .max(DISCORD_LIMITS.legacyRows)
          .default([]),
      })
      .strict(),
  ])
  .superRefine((document, ctx) => {
    if (
      document.mode === 'embed' &&
      !document.content &&
      !document.embeds.length &&
      !document.blocks.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'A message needs visible content.',
      });
    const keys = new Set<string>();
    forEachControl(document, (control, path) => {
      if (keys.has(control.key))
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'key'],
          message: 'Control keys must be unique within the message.',
        });
      keys.add(control.key);
    });
    for (const token of document.allowedTokens) {
      const contexts: readonly string[] = TOKEN_REGISTRY[token].contexts;
      if (!contexts.includes(document.tokenContext))
        ctx.addIssue({
          code: 'custom',
          path: ['allowedTokens'],
          message: `${token} is unavailable for ${document.tokenContext} messages.`,
        });
    }
    forEachText(document, (value, path) =>
      validateTokens(value, document, path, ctx),
    );
  });
export type MessageDocument = z.infer<typeof MessageDocumentSchema>;
type PortableDocument = z.infer<typeof MessageDocumentSchema>;
type Path = (string | number)[];
type JsonObject = Record<string, unknown>;
export type DiscordMessagePayload = {
  allowed_mentions: { parse: [] };
  components: JsonObject[];
  flags?: number;
  embeds?: JsonObject[];
  content?: string;
};

function forEachControl(
  document: PortableDocument,
  visit: (control: MessageControl, path: Path) => void,
): void {
  function walk(block: MessageBlock, path: Path): void {
    if (block.type === 'controls')
      block.controls.forEach((control, i) =>
        visit(control, [...path, 'controls', i]),
      );
    if (block.type === 'section' && block.accessory.type === 'button')
      visit(block.accessory, [...path, 'accessory']);
    if (block.type === 'container')
      block.children.forEach((child, i) =>
        walk(child, [...path, 'children', i]),
      );
  }
  document.blocks.forEach((block, i) => walk(block, ['blocks', i]));
}

function forEachText(
  document: PortableDocument,
  visit: (value: string, path: Path) => void,
): void {
  function control(value: MessageControl, path: Path): void {
    if (value.type === 'button') visit(value.label, [...path, 'label']);
    else {
      if (value.placeholder) visit(value.placeholder, [...path, 'placeholder']);
      value.options.forEach((item, i) => {
        visit(item.label, [...path, 'options', i, 'label']);
        if (item.description)
          visit(item.description, [...path, 'options', i, 'description']);
      });
    }
    if ('action' in value && 'text' in value.action)
      visit(value.action.text, [...path, 'action', 'text']);
  }
  function walk(block: MessageBlock, path: Path): void {
    if (block.type === 'text') visit(block.text, [...path, 'text']);
    if (block.type === 'section') {
      block.texts.forEach((value, i) => visit(value, [...path, 'texts', i]));
      if (block.accessory.type === 'thumbnail' && block.accessory.alt)
        visit(block.accessory.alt, [...path, 'accessory', 'alt']);
    }
    if (block.type === 'gallery')
      block.items.forEach((item, i) => {
        if (item.alt) visit(item.alt, [...path, 'items', i, 'alt']);
      });
    if (block.type === 'container')
      block.children.forEach((child, i) =>
        walk(child, [...path, 'children', i]),
      );
  }
  document.blocks.forEach((block, i) => walk(block, ['blocks', i]));
  forEachControl(document, control);
  if (document.mode === 'embed') {
    if (document.content) visit(document.content, ['content']);
    document.embeds.forEach((embed, i) => {
      const path = ['embeds', i];
      if (embed.title) visit(embed.title, [...path, 'title']);
      if (embed.description) visit(embed.description, [...path, 'description']);
      if (embed.author) visit(embed.author.name, [...path, 'author', 'name']);
      if (embed.footer) visit(embed.footer.text, [...path, 'footer', 'text']);
      embed.fields?.forEach((field, j) => {
        visit(field.name, [...path, 'fields', j, 'name']);
        visit(field.value, [...path, 'fields', j, 'value']);
      });
    });
  }
}

const tokenPattern = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
function validateTokens(
  value: string,
  document: PortableDocument,
  path: Path,
  ctx: z.RefinementCtx,
): void {
  for (const match of value.matchAll(tokenPattern)) {
    const name = match[1];
    if (
      !name ||
      !(name in TOKEN_REGISTRY) ||
      !document.allowedTokens.includes(name as TokenName)
    )
      ctx.addIssue({
        code: 'custom',
        path,
        message: `Token ${name ?? ''} is unknown or is not allowed by this document.`,
      });
  }
  const remainder = value.replace(tokenPattern, '');
  if (remainder.includes('{{') || remainder.includes('}}'))
    ctx.addIssue({
      code: 'custom',
      path,
      message: 'Token placeholders must use {{token.name}} syntax.',
    });
}

export function escapeTokenValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([*_`~|>\[\]()#])/g, '\\$1')
    .replace(/@/g, '@\u200b')
    .replace(/</g, '\\<')
    .replace(/\r\n?/g, '\n');
}

function fail(path: Path, message: string): never {
  throw new z.ZodError([{ code: 'custom', path, message }]);
}
function substitute(
  value: string,
  document: MessageDocument,
  context: MessageContext,
  path: Path,
): string {
  return value.replace(tokenPattern, (_match, token: string) => {
    const definition = TOKEN_REGISTRY[token as TokenName];
    if (!definition || !document.allowedTokens.includes(token as TokenName))
      return fail(path, `Unsupported token ${token}.`);
    const supplied = context[token];
    const resolved =
      supplied === null || supplied === undefined
        ? definition.fallback
        : supplied;
    if (resolved === null) return fail(path, `Provide a value for ${token}.`);
    if (typeof resolved === 'number' && !Number.isFinite(resolved))
      return fail(path, `Token ${token} must be finite.`);
    return escapeTokenValue(String(resolved));
  });
}

function compileEmoji(emoji: z.infer<typeof EmojiSchema>): JsonObject {
  return 'id' in emoji
    ? {
        id: emoji.id,
        name: emoji.name,
        ...(emoji.animated === undefined ? {} : { animated: emoji.animated }),
      }
    : { name: emoji.name };
}

export function getMessageActions(
  document: MessageDocument,
): { key: string; action: MessageAction; choices?: string[] }[] {
  const result: { key: string; action: MessageAction; choices?: string[] }[] =
    [];
  forEachControl(MessageDocumentSchema.parse(document), (control) => {
    if ('action' in control)
      result.push({
        key: control.key,
        action: control.action,
        ...(control.type === 'select'
          ? { choices: control.options.map((option) => option.value) }
          : {}),
      });
  });
  return result;
}

export function validateControlSubmission(
  input: unknown,
  key: string,
  values: unknown = [],
): { action: MessageAction; values: string[] } {
  const document = MessageDocumentSchema.parse(input);
  let found: MessageControl | undefined;
  forEachControl(document, (control) => {
    if (control.key === key) found = control;
  });
  if (!found || !('action' in found) || found.disabled)
    return fail(['controls', key], 'This control is unavailable.');
  const choices = z.array(z.string()).parse(values);
  if (found.type === 'button') {
    if (choices.length)
      return fail(['controls', key], 'Buttons do not accept choice values.');
  } else {
    if (
      choices.length < found.minValues ||
      choices.length > found.maxValues ||
      new Set(choices).size !== choices.length
    )
      return fail(
        ['controls', key],
        'Choose the permitted number of distinct options.',
      );
    if (
      choices.some(
        (choice) =>
          !found ||
          found.type !== 'select' ||
          !found.options.some((option) => option.value === choice),
      )
    )
      return fail(
        ['controls', key],
        'A choice is not part of the published control.',
      );
  }
  return { action: found.action, values: choices };
}

/** The issued control map comes from persistence, never from untrusted imported designs. */
export function compileMessage(
  input: unknown,
  context: MessageContext = {},
  controls: Readonly<Record<string, string>> = {},
): DiscordMessagePayload {
  const document = MessageDocumentSchema.parse(input);
  const usedIds = new Set<string>();
  const text = (value: string, path: Path, limit: number) => {
    const result = substitute(value, document, context, path);
    if (result.length > limit)
      fail(path, `Resolved text exceeds ${limit} characters.`);
    return result;
  };
  function control(value: MessageControl, path: Path): JsonObject {
    const optional = {
      ...(value.disabled === undefined ? {} : { disabled: value.disabled }),
    };
    let customId: string | undefined;
    if ('action' in value) {
      customId = controls[value.key];
      if (
        !customId ||
        !/^spk:ctl:[a-zA-Z0-9_-]+$/.test(customId) ||
        customId.length > DISCORD_LIMITS.customId
      )
        fail(
          [...path, 'key'],
          `Issue a persisted control identity for ${value.key}.`,
        );
      if (usedIds.has(customId))
        fail(
          [...path, 'key'],
          'Issued custom IDs must be unique in this message.',
        );
      usedIds.add(customId);
    }
    if (value.type === 'button') {
      const style = {
        primary: 1,
        secondary: 2,
        success: 3,
        danger: 4,
        link: 5,
      }[value.style];
      return {
        type: 2,
        style,
        label: text(value.label, [...path, 'label'], 80),
        ...optional,
        ...(value.emoji ? { emoji: compileEmoji(value.emoji) } : {}),
        ...(value.style === 'link'
          ? { url: value.url }
          : { custom_id: customId }),
      };
    }
    return {
      type: 3,
      custom_id: customId,
      min_values: value.minValues,
      max_values: value.maxValues,
      ...optional,
      ...(value.placeholder
        ? {
            placeholder: text(value.placeholder, [...path, 'placeholder'], 150),
          }
        : {}),
      options: value.options.map((option, i) => ({
        label: text(option.label, [...path, 'options', i, 'label'], 100),
        value: option.value,
        ...(option.description
          ? {
              description: text(
                option.description,
                [...path, 'options', i, 'description'],
                100,
              ),
            }
          : {}),
        ...(option.default === undefined ? {} : { default: option.default }),
        ...(option.emoji ? { emoji: compileEmoji(option.emoji) } : {}),
      })),
    };
  }
  const thumbnail = (value: z.infer<typeof ThumbnailSchema>, path: Path) => ({
    type: 11,
    media: { url: value.url },
    ...(value.alt
      ? { description: text(value.alt, [...path, 'alt'], 1024) }
      : {}),
    ...(value.spoiler === undefined ? {} : { spoiler: value.spoiler }),
  });
  function block(value: MessageBlock, path: Path): JsonObject {
    switch (value.type) {
      case 'text':
        return { type: 10, content: text(value.text, [...path, 'text'], 4000) };
      case 'controls':
        return {
          type: 1,
          components: value.controls.map((item, i) =>
            control(item, [...path, 'controls', i]),
          ),
        };
      case 'container':
        return {
          type: 17,
          accent_color: value.accentColor,
          components: value.children.map((item, i) =>
            block(item, [...path, 'children', i]),
          ),
          ...(value.spoiler === undefined ? {} : { spoiler: value.spoiler }),
        };
      case 'section':
        return {
          type: 9,
          components: value.texts.map((item, i) => ({
            type: 10,
            content: text(item, [...path, 'texts', i], 4000),
          })),
          accessory:
            value.accessory.type === 'thumbnail'
              ? thumbnail(value.accessory, [...path, 'accessory'])
              : control(value.accessory, [...path, 'accessory']),
        };
      case 'separator':
        return { type: 14, divider: value.divider, spacing: value.spacing };
      case 'gallery':
        return {
          type: 12,
          items: value.items.map((item, i) => ({
            media: { url: item.url },
            ...(item.alt
              ? {
                  description: text(
                    item.alt,
                    [...path, 'items', i, 'alt'],
                    1024,
                  ),
                }
              : {}),
            ...(item.spoiler === undefined ? {} : { spoiler: item.spoiler }),
          })),
        };
      case 'file':
        return {
          type: 13,
          file: { url: value.url },
          ...(value.spoiler === undefined ? {} : { spoiler: value.spoiler }),
        };
    }
  }
  const components = document.blocks.map((value, i) =>
    block(value, ['blocks', i]),
  );
  const result: DiscordMessagePayload = {
    allowed_mentions: { parse: [] },
    components,
  };
  if (document.mode === 'v2') result.flags = COMPONENTS_V2_FLAG;
  else {
    if (document.content)
      result.content = text(document.content, ['content'], 2000);
    result.embeds = document.embeds.map((embed, i) => ({
      color: embed.color,
      ...(embed.title
        ? { title: text(embed.title, ['embeds', i, 'title'], 256) }
        : {}),
      ...(embed.description
        ? {
            description: text(
              embed.description,
              ['embeds', i, 'description'],
              4096,
            ),
          }
        : {}),
      ...(embed.url ? { url: embed.url } : {}),
      ...(embed.fields
        ? {
            fields: embed.fields.map((field, j) => ({
              name: text(field.name, ['embeds', i, 'fields', j, 'name'], 256),
              value: text(
                field.value,
                ['embeds', i, 'fields', j, 'value'],
                1024,
              ),
              ...(field.inline === undefined ? {} : { inline: field.inline }),
            })),
          }
        : {}),
      ...(embed.footer
        ? {
            footer: {
              text: text(
                embed.footer.text,
                ['embeds', i, 'footer', 'text'],
                2048,
              ),
              ...(embed.footer.iconUrl
                ? { icon_url: embed.footer.iconUrl }
                : {}),
            },
          }
        : {}),
      ...(embed.author
        ? {
            author: {
              name: text(
                embed.author.name,
                ['embeds', i, 'author', 'name'],
                256,
              ),
              ...(embed.author.url ? { url: embed.author.url } : {}),
              ...(embed.author.iconUrl
                ? { icon_url: embed.author.iconUrl }
                : {}),
            },
          }
        : {}),
      ...(embed.thumbnail ? { thumbnail: { url: embed.thumbnail } } : {}),
      ...(embed.image ? { image: { url: embed.image } } : {}),
      ...(embed.timestamp ? { timestamp: embed.timestamp } : {}),
    }));
  }
  validateCompiledPayload(result);
  return result;
}

function validateCompiledPayload(payload: DiscordMessagePayload): void {
  let count = 0;
  let characters = 0;
  function visit(component: JsonObject): void {
    count++;
    if (component['type'] === 10 && typeof component['content'] === 'string')
      characters += component['content'].length;
    const children = component['components'];
    if (Array.isArray(children))
      children.forEach((child: JsonObject) => visit(child));
    const accessory = component['accessory'];
    if (accessory && typeof accessory === 'object')
      visit(accessory as JsonObject);
  }
  payload.components.forEach(visit);
  if (count > DISCORD_LIMITS.components)
    fail(
      ['blocks'],
      `The message uses ${count} components; the limit is ${DISCORD_LIMITS.components}.`,
    );
  if (
    payload.flags === COMPONENTS_V2_FLAG &&
    characters > DISCORD_LIMITS.v2Text
  )
    fail(
      ['blocks'],
      `Text displays use ${characters} characters; the message limit is ${DISCORD_LIMITS.v2Text}.`,
    );
  if (payload.embeds) {
    let total = 0;
    for (const embed of payload.embeds) {
      for (const key of ['title', 'description'])
        if (typeof embed[key] === 'string')
          total += (embed[key] as string).length;
      const footer = embed['footer'] as { text: string } | undefined;
      const author = embed['author'] as { name: string } | undefined;
      total += (footer?.text.length ?? 0) + (author?.name.length ?? 0);
      for (const field of (embed['fields'] ?? []) as {
        name: string;
        value: string;
      }[])
        total += field.name.length + field.value.length;
    }
    if (total > DISCORD_LIMITS.embedCharacters)
      fail(
        ['embeds'],
        `Embeds use ${total} characters; the aggregate limit is ${DISCORD_LIMITS.embedCharacters}.`,
      );
  }
}

export type ModeLoss = { path: Path; reason: string };
export function modeChangeLossReport(
  input: unknown,
  nextMode: MessageDocument['mode'],
): { replacementRequired: boolean; losses: ModeLoss[] } {
  const document = MessageDocumentSchema.parse(input);
  const losses: ModeLoss[] = [];
  if (document.mode === nextMode) return { replacementRequired: false, losses };
  if (document.mode === 'v2') {
    function inspect(value: MessageBlock, path: Path): void {
      if (value.type === 'container')
        losses.push({
          path,
          reason:
            'Container accent, spoiler, and layout become a traditional embed.',
        });
      else if (value.type !== 'text' && value.type !== 'controls')
        losses.push({
          path,
          reason: `${value.type} has no lossless traditional embed equivalent.`,
        });
      if (value.type === 'container')
        value.children.forEach((child, i) =>
          inspect(child, [...path, 'children', i]),
        );
    }
    document.blocks.forEach((value, i) => inspect(value, ['blocks', i]));
  } else
    document.embeds.forEach((embed, i) => {
      for (const key of [
        'author',
        'footer',
        'timestamp',
        'url',
        'thumbnail',
        'fields',
      ] as const)
        if (embed[key])
          losses.push({
            path: ['embeds', i, key],
            reason: `${key} is converted to plain text or omitted in Components V2.`,
          });
    });
  return { replacementRequired: true, losses };
}

/** Conversion makes a new design; posting its replacement is a separate explicit operation. */
export function convertMessageMode(
  input: unknown,
  nextMode: MessageDocument['mode'],
): {
  document: MessageDocument;
  report: ReturnType<typeof modeChangeLossReport>;
} {
  const source = MessageDocumentSchema.parse(input);
  const report = modeChangeLossReport(source, nextMode);
  if (source.mode === nextMode) return { document: source, report };
  const base = {
    schemaVersion: 1 as const,
    name: source.name,
    visibility: source.visibility,
    tokenContext: source.tokenContext,
    allowedTokens: source.allowedTokens,
  };
  if (source.mode === 'embed') {
    const blocks: MessageBlock[] = [];
    if (source.content) blocks.push({ type: 'text', text: source.content });
    source.embeds.forEach((embed) => {
      const strings = [
        embed.title ? `## ${embed.title}` : '',
        embed.description ?? '',
        ...(embed.fields?.map((field) => `**${field.name}**\n${field.value}`) ??
          []),
        embed.author?.name ?? '',
        embed.footer?.text ?? '',
      ].filter(Boolean);
      if (strings.length)
        blocks.push({
          type: 'container',
          accentColor: embed.color,
          children: [{ type: 'text', text: strings.join('\n\n') }],
        });
      if (embed.image)
        blocks.push({ type: 'gallery', items: [{ url: embed.image }] });
    });
    blocks.push(...source.blocks);
    return {
      document: MessageDocumentSchema.parse({ ...base, mode: 'v2', blocks }),
      report,
    };
  }
  const texts: string[] = [];
  const rows: z.infer<typeof ControlRowSchema>[] = [];
  function collect(block: MessageBlock): void {
    if (block.type === 'text') texts.push(block.text);
    if (block.type === 'controls') rows.push(block);
    if (block.type === 'container') block.children.forEach(collect);
    if (block.type === 'section') {
      texts.push(...block.texts);
      if (block.accessory.type === 'button')
        rows.push({ type: 'controls', controls: [block.accessory] });
    }
  }
  source.blocks.forEach(collect);
  return {
    document: MessageDocumentSchema.parse({
      ...base,
      mode: 'embed',
      embeds: texts.length
        ? [{ description: texts.join('\n\n'), color: BRAND_YELLOW }]
        : [],
      blocks: rows,
    }),
    report,
  };
}

export const defaultTicketDocument: MessageDocument =
  MessageDocumentSchema.parse({
    schemaVersion: 1,
    mode: 'v2',
    name: 'Support ticket panel',
    visibility: 'public',
    tokenContext: 'generic',
    allowedTokens: [],
    blocks: [
      {
        type: 'container',
        accentColor: BRAND_YELLOW,
        children: [
          { type: 'text', text: '## Sparko support' },
          {
            type: 'text',
            text: 'Open a private ticket. Your request will be visible only to permitted support participants.',
          },
          { type: 'separator', divider: true, spacing: 1 },
          {
            type: 'controls',
            controls: [
              {
                type: 'button',
                key: 'ticket:create',
                label: 'Open a ticket',
                style: 'primary',
                emoji: { name: '🎫' },
                action: { type: 'ticket.create', categoryId: 'general' },
              },
            ],
          },
        ],
      },
    ],
  });
export function initialMessage(
  mode: MessageDocument['mode'] = 'v2',
): MessageDocument {
  if (mode === 'v2') return structuredClone(defaultTicketDocument);
  return MessageDocumentSchema.parse({
    schemaVersion: 1,
    mode: 'embed',
    name: 'New message',
    visibility: 'public',
    tokenContext: 'generic',
    allowedTokens: [],
    embeds: [
      {
        title: 'Welcome to Sparko',
        description: 'Design a clear message for your community.',
        color: BRAND_YELLOW,
      },
    ],
    blocks: [],
  });
}
