/**
 * Message Studio: messages built in the dashboard, either as classic
 * embeds or with Discord's Components V2 layout, their checks, and the body
 * Discord's API expects. Nothing here touches the database or the network,
 * so the dashboard imports this file too.
 */
export type StudioField = {
  id: string;
  name: string;
  value: string;
  inline: boolean;
};
export type StudioEmbed = {
  id: string;
  author: string;
  /** The small picture beside the author's name, and where the name links. */
  authorIcon: string;
  authorUrl: string;
  title: string;
  description: string;
  color: string;
  image: string;
  thumbnail: string;
  footer: string;
  footerIcon: string;
  timestamp: boolean;
  fields: StudioField[];
};
export type LinkButton = { id: string; label: string; url: string };

/** What a button or a menu option does when someone uses it, in order. */
export type StudioAction =
  | {
      id: string;
      type: 'send';
      /** Template ids, sent one after another. */
      templates: string[];
      /** Sends to the person who clicked, in their DMs. */
      dm: boolean;
      /** Sends a reply only the person who clicked can see. */
      ephemeral: boolean;
    }
  | { id: string; type: 'role'; mode: 'give' | 'take'; roles: string[] };

export type ButtonColour = 'blurple' | 'grey' | 'green' | 'red';
export type StudioButton = {
  id: string;
  type: 'button';
  label: string;
  /** A Unicode emoji, or a server emoji written as <:name:id>. */
  emoji: string;
  colour: ButtonColour;
  /** A link button opens `url`; any other button runs its actions. */
  link: boolean;
  url: string;
  actions: StudioAction[];
};
export type MenuOption = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  actions: StudioAction[];
};
export type StudioMenu = {
  id: string;
  type: 'menu';
  placeholder: string;
  multiple: boolean;
  options: MenuOption[];
};
export type StudioComponent = StudioButton | StudioMenu;

/** How Components V2 messages were built before the container editor. */
type LegacyV2Block =
  | { id: string; type: 'text'; content: string }
  | {
      id: string;
      type: 'section';
      content: string;
      accessory:
        | { type: 'thumbnail'; url: string }
        | { type: 'button'; label: string; url: string };
    }
  | {
      id: string;
      type: 'gallery';
      images: { id: string; url: string; description: string }[];
    }
  | {
      id: string;
      type: 'separator';
      divider: boolean;
      spacing: 'small' | 'large';
    }
  | { id: string; type: 'buttons'; buttons: LinkButton[] };

/** A picture in a Components V2 image gallery. */
export type GalleryImage = { id: string; url: string; description: string };
/** The parts inside a Components V2 container, in the order they're shown. */
export type V2Part = 'text' | 'gallery' | 'components';
/**
 * A Components V2 message: one container with a colour bar, its text
 * (split by {separator} into sections), a thumbnail beside the first
 * section, an image gallery, and the message's buttons and menus.
 */
export type StudioV2 = {
  accent: string;
  text: string;
  thumbnail: string;
  gallery: GalleryImage[];
  order: V2Part[];
};
export type StudioMessage = {
  name: string;
  channel: string;
  /** "embed" is the classic message; "v2" uses Components V2 blocks. */
  layout: 'embed' | 'v2';
  content: string;
  /** Up to 10 embeds, shown in this order. */
  embeds: StudioEmbed[];
  /** Buttons and menus under the message, in order. */
  components: StudioComponent[];
  v2: StudioV2;
};

export const v2Default = (): StudioV2 => ({
  accent: '#FACC15',
  text: '## Big news\nWrite your announcement here.',
  thumbnail: '',
  gallery: [],
  // The gallery sits at the bottom until it's moved.
  order: ['text', 'components', 'gallery'],
});

/** Reads a Components V2 message saved as separate blocks. */
function fromBlocks(v: { accent?: string; blocks?: LegacyV2Block[] }): {
  v2: StudioV2;
  buttons: LinkButton[];
} {
  const parts: string[] = [];
  const buttons: LinkButton[] = [];
  let thumbnail = '';
  let gallery: GalleryImage[] = [];
  for (const b of v.blocks ?? []) {
    if (b.type === 'text') parts.push(b.content);
    else if (b.type === 'section') {
      parts.push(b.content);
      if (b.accessory.type === 'thumbnail') thumbnail ||= b.accessory.url;
      else
        buttons.push({
          id: b.id,
          label: b.accessory.label,
          url: b.accessory.url,
        });
    } else if (b.type === 'separator') parts.push('{separator}');
    else if (b.type === 'gallery' && !gallery.length) gallery = b.images;
    else if (b.type === 'buttons') buttons.push(...b.buttons);
  }
  return {
    v2: {
      ...v2Default(),
      accent: v.accent ?? '#FACC15',
      text: parts.join('\n'),
      thumbnail,
      gallery: gallery.slice(0, 10),
    },
    buttons,
  };
}

export const embedDefault = (id = 'e1'): StudioEmbed => ({
  id,
  author: '',
  authorIcon: '',
  authorUrl: '',
  title: '',
  description: '',
  color: '#FACC15',
  image: '',
  thumbnail: '',
  footer: '',
  footerIcon: '',
  timestamp: false,
  fields: [],
});

export const studioDefault = (channel: string): StudioMessage => ({
  name: 'Announcement',
  channel,
  layout: 'embed',
  content: '',
  embeds: [
    {
      ...embedDefault(),
      title: 'Big news',
      description: 'Write your announcement here.',
    },
  ],
  components: [],
  v2: v2Default(),
});

/** An embed with nothing in it, which Discord won't show. */
export const embedIsEmpty = (e: StudioEmbed) =>
  !e.author.trim() &&
  !e.title.trim() &&
  !e.description.trim() &&
  !e.footer.trim() &&
  !e.image &&
  !e.thumbnail &&
  !e.fields.some((f) => f.name.trim() || f.value.trim());

type Legacy = Partial<StudioMessage> & {
  /** Before buttons could run actions, a message only had link buttons. */
  buttons?: LinkButton[];
  useEmbed?: boolean;
  embed?: Partial<StudioEmbed> & { thumbnail?: unknown };
};
const asEmbed = (
  e: Partial<StudioEmbed> & { thumbnail?: unknown },
  i: number,
) => {
  const base = embedDefault(typeof e.id === 'string' ? e.id : `e${i + 1}`);
  return {
    ...base,
    ...e,
    id: base.id,
    // Older messages kept a yes/no for "use the server icon" here.
    thumbnail: typeof e.thumbnail === 'string' ? e.thumbnail : '',
    fields: Array.isArray(e.fields) ? e.fields : [],
  };
};

const v2Of = (v: unknown): StudioV2 => {
  const x = (v ?? {}) as Partial<StudioV2> & { blocks?: LegacyV2Block[] };
  if (Array.isArray(x.blocks)) return fromBlocks(x).v2;
  const base = v2Default();
  const order = Array.isArray(x.order)
    ? x.order.filter((p): p is V2Part =>
        ['text', 'gallery', 'components'].includes(p),
      )
    : base.order;
  return {
    accent: typeof x.accent === 'string' ? x.accent : base.accent,
    text: typeof x.text === 'string' ? x.text : base.text,
    thumbnail: typeof x.thumbnail === 'string' ? x.thumbnail : '',
    gallery: Array.isArray(x.gallery) ? x.gallery : [],
    order: order.length === 3 ? order : base.order,
  };
};

/** Fills in parts older saved messages don't have. */
export const normaliseStudio = (input: StudioMessage): StudioMessage => {
  const { useEmbed, embed, buttons: oldButtons, ...m } = input as Legacy;
  // Link buttons that lived in old V2 blocks join the message's buttons.
  const blockButtons =
    m.v2 && Array.isArray((m.v2 as { blocks?: unknown }).blocks)
      ? fromBlocks(m.v2 as unknown as { blocks: LegacyV2Block[] }).buttons
      : [];
  const buttons = [...(oldButtons ?? []), ...blockButtons];
  const embeds = Array.isArray(m.embeds)
    ? m.embeds
    : embed && useEmbed !== false
      ? [embed]
      : [];
  return {
    ...(m as StudioMessage),
    content: typeof m.content === 'string' ? m.content : '',
    components: Array.isArray(m.components)
      ? m.components
      : buttons.map(
          (b): StudioButton => ({
            id: b.id,
            type: 'button',
            label: b.label,
            emoji: '',
            colour: 'grey',
            link: true,
            url: b.url,
            actions: [],
          }),
        ),
    embeds: embeds.map(asEmbed),
    layout: m.layout === 'v2' ? 'v2' : 'embed',
    v2: v2Of(m.v2),
  };
};

const https = (url: unknown) => {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};
const hex = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.length <= max;
const id = (v: unknown) => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);

/** Checks a message from the dashboard. Returns a problem, or null. */
export function studioProblem(input: unknown): string | null {
  const m = input as Partial<StudioMessage> | null;
  if (!m || typeof m !== 'object') return 'The message is missing.';
  if (!str(m.name, 80)) return 'The name must be 80 characters or fewer.';
  if (!/^\d{1,25}$/.test(m.channel ?? '')) return 'Pick a channel to post in.';
  if (m.layout === 'v2') {
    const v = m.v2;
    if (!v || typeof v !== 'object' || typeof v.text !== 'string')
      return 'The layout is missing.';
    if (!hex(v.accent)) return 'Use a colour like #FACC15.';
    if (v.text.length > 4000)
      return 'Discord allows 4,000 characters of text in a message like this.';
    if (v.thumbnail && !https(v.thumbnail))
      return 'The thumbnail link must start with https://.';
    if (!Array.isArray(v.gallery) || v.gallery.length > 10)
      return 'A gallery holds up to 10 images.';
    for (const img of v.gallery)
      if (!id(img?.id) || !https(img.url) || !str(img.description, 1024))
        return 'Gallery images need a link that starts with https://.';
    if (
      !v2Sections(v.text).some((t) => t.trim()) &&
      !v.gallery.length &&
      !(m.components ?? []).length
    )
      return 'Add some text, an image or a button. Discord won’t send an empty message.';
    return componentsProblem(m.components);
  }
  if (!str(m.content, 2000))
    return 'The text must be 2,000 characters or fewer.';
  if (!Array.isArray(m.embeds) || m.embeds.length > 10)
    return 'Use up to 10 embeds.';
  let size = 0;
  for (const e of m.embeds as StudioEmbed[]) {
    if (!e || typeof e !== 'object' || !id(e.id))
      return 'An embed is damaged. Remove it and add it again.';
    if (!str(e.author, 256) || !str(e.title, 256) || !str(e.footer, 2048))
      return 'The author, title or footer is too long.';
    if (!str(e.description, 4096))
      return 'The description must be 4,096 characters or fewer.';
    if (!hex(e.color)) return 'Use a colour like #FACC15.';
    for (const url of [
      e.image,
      e.thumbnail,
      e.authorIcon,
      e.authorUrl,
      e.footerIcon,
    ])
      if (typeof url !== 'string' || (url && !https(url)))
        return 'Links and pictures must start with https://.';
    if (!Array.isArray(e.fields) || e.fields.length > 25)
      return 'Use up to 25 fields in an embed.';
    for (const f of e.fields)
      if (
        !id(f?.id) ||
        !str(f.name, 256) ||
        !str(f.value, 1024) ||
        typeof f.inline !== 'boolean'
      )
        return 'A field is too long. Names hold 256 characters and values 1,024.';
    size +=
      e.author.length +
      e.title.length +
      e.description.length +
      e.footer.length +
      e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  }
  if (size > 6000)
    return 'Discord rejects embeds with more than 6,000 characters between them.';
  if (
    !m.content?.trim() &&
    !(m.embeds as StudioEmbed[]).some((e) => !embedIsEmpty(e))
  )
    return 'Add some text or an embed. Discord won’t send an empty message.';
  return componentsProblem(m.components);
}

/** The rows Discord shows: up to five buttons side by side, a menu alone. */
export function componentRows(list: StudioComponent[]) {
  const rows: StudioComponent[][] = [];
  for (const c of list) {
    const last = rows.at(-1);
    if (c.type === 'button' && last?.[0]?.type === 'button' && last.length < 5)
      last.push(c);
    else rows.push([c]);
  }
  return rows;
}

function actionsProblem(list: unknown): string | null {
  if (!Array.isArray(list) || list.length > 10)
    return 'Use up to 10 actions on a button or option.';
  for (const a of list as StudioAction[]) {
    if (!id(a?.id)) return 'An action is damaged. Remove it and add it again.';
    if (a.type === 'send') {
      if (
        !Array.isArray(a.templates) ||
        !a.templates.length ||
        a.templates.length > 10 ||
        !a.templates.every((t) => /^\d{1,12}$/.test(t))
      )
        return 'Pick the templates a “Send message” action sends.';
      if (typeof a.dm !== 'boolean' || typeof a.ephemeral !== 'boolean')
        return 'An action is damaged. Remove it and add it again.';
    } else if (a.type === 'role') {
      if (
        !['give', 'take'].includes(a.mode) ||
        !Array.isArray(a.roles) ||
        !a.roles.length ||
        a.roles.length > 25 ||
        !a.roles.every((r) => /^\d{1,25}$/.test(r))
      )
        return 'Pick the roles a “Give or take role” action changes.';
    } else return 'An action is damaged. Remove it and add it again.';
  }
  return null;
}

const emojiOk = (e: unknown) =>
  typeof e === 'string' &&
  e.length <= 64 &&
  (!e || /^<a?:\w{1,32}:\d{1,25}>$/.test(e) || !/[<>:\s]/.test(e));

function componentsProblem(list: unknown): string | null {
  if (!Array.isArray(list)) return 'The buttons are damaged.';
  if (componentRows(list as StudioComponent[]).length > 5)
    return 'Discord shows up to 5 rows of buttons and menus. A menu takes a row of its own.';
  for (const c of list as StudioComponent[]) {
    if (!id(c?.id)) return 'A button is damaged. Remove it and add it again.';
    if (c.type === 'button') {
      if (!str(c.label, 80) || !emojiOk(c.emoji))
        return 'Button text holds up to 80 characters.';
      if (!c.label.trim() && !c.emoji)
        return 'Every button needs some text or an emoji.';
      if (!['blurple', 'grey', 'green', 'red'].includes(c.colour))
        return 'A button is damaged. Remove it and add it again.';
      if (c.link) {
        if (!https(c.url))
          return 'Link buttons need a link that starts with https://.';
      } else {
        const p = actionsProblem(c.actions);
        if (p) return p;
        if (!c.actions.length)
          return 'Give every action button something to do, or make it a link.';
      }
    } else if (c.type === 'menu') {
      if (!str(c.placeholder, 150))
        return 'Menu placeholders hold up to 150 characters.';
      if (typeof c.multiple !== 'boolean')
        return 'A menu is damaged. Remove it and add it again.';
      if (
        !Array.isArray(c.options) ||
        !c.options.length ||
        c.options.length > 25
      )
        return 'A menu holds 1 to 25 options.';
      for (const o of c.options) {
        if (!id(o?.id) || !emojiOk(o.emoji))
          return 'A menu option is damaged. Remove it and add it again.';
        if (!str(o.label, 100) || !o.label.trim())
          return 'Every menu option needs a title of up to 100 characters.';
        if (!str(o.description, 100))
          return 'Option descriptions hold up to 100 characters.';
        const p = actionsProblem(o.actions);
        if (p) return p;
      }
    } else return 'A button is damaged. Remove it and add it again.';
  }
  return null;
}

/** The most templates one "Send message" action can send on a plan. */
export const sendLimit = (plan: 'free' | 'plus' | undefined) =>
  plan === 'plus' ? 10 : 1;
/** Checks the parts of a message that depend on the server's plan. */
export function planProblem(
  m: StudioMessage,
  plan: 'free' | 'plus' | undefined,
) {
  const max = sendLimit(plan);
  const actions = m.components.flatMap((c) =>
    c.type === 'button' ? c.actions : c.options.flatMap((o) => o.actions),
  );
  return actions.some((a) => a.type === 'send' && a.templates.length > max)
    ? `A “Send message” action sends up to ${max} template${max === 1 ? '' : 's'} on this plan.`
    : null;
}

/** Discord's form of an emoji written as text. */
export function emojiPayload(e: string) {
  if (!e) return undefined;
  const custom = e.match(/^<(a?):(\w{1,32}):(\d{1,25})>$/);
  return custom
    ? { id: custom[3]!, name: custom[2]!, animated: !!custom[1] }
    : { name: e };
}

const buttonStyles = { blurple: 1, grey: 2, green: 3, red: 4 } as const;
/** The custom ids Sparko gives Studio buttons and menus. */
export const studioCustomId = (c: StudioComponent) =>
  `sp:${c.type === 'button' ? 'b' : 'm'}:${c.id}`;

/** Discord's action rows for a message's buttons and menus. */
export function componentsPayload(
  list: StudioComponent[],
  fill: (text: string) => string = (t) => t,
) {
  return componentRows(list).map((row) => ({
    type: 1,
    components: row.map((c) => {
      if (c.type === 'menu')
        return {
          type: 3,
          custom_id: studioCustomId(c),
          ...(c.placeholder.trim()
            ? { placeholder: fill(c.placeholder).slice(0, 150) }
            : {}),
          min_values: 1,
          max_values: c.multiple ? c.options.length : 1,
          options: c.options.map((o) => ({
            label: o.label,
            value: o.id,
            ...(o.description.trim() ? { description: o.description } : {}),
            ...(o.emoji ? { emoji: emojiPayload(o.emoji) } : {}),
          })),
        };
      return {
        type: 2,
        style: c.link ? 5 : buttonStyles[c.colour],
        ...(c.label.trim() ? { label: fill(c.label).slice(0, 80) } : {}),
        ...(c.emoji ? { emoji: emojiPayload(c.emoji) } : {}),
        ...(c.link ? { url: c.url } : { custom_id: studioCustomId(c) }),
      };
    }),
  }));
}

const colour = (h: string) => Number.parseInt(h.slice(1), 16);

/** The text of a Components V2 message, cut where {separator} appears. */
export const v2Sections = (text: string) => text.split(/\{separator\}/);

/** Who and where a message is for, to fill its {variables}. */
export type StudioVars = {
  user?: { id: string; name: string } | undefined;
  server?: { name: string; members: number } | undefined;
  /** The channel the message goes to. */
  channel?: string | undefined;
};

/** Variables people can write in Studio messages, in braces. */
export const studioVariables = [
  {
    name: 'user',
    about: 'Mentions the member it’s for, without pinging them.',
  },
  { name: 'user.name', about: 'The member’s name.' },
  { name: 'user.id', about: 'The member’s Discord ID.' },
  { name: 'server', about: 'The server’s name.' },
  { name: 'server.members', about: 'How many members the server has.' },
  { name: 'channel', about: 'Links the channel the message is in.' },
  { name: 'date', about: 'Today’s date, in each reader’s own format.' },
  {
    name: 'time',
    about: 'The time it was sent, in each reader’s own time zone.',
  },
] as const;

/**
 * Fills {variables} in. A variable with nothing to fill it (no member when
 * staff post from the dashboard, say) is left as written. {separator} only
 * means something in Components V2 and is dropped elsewhere.
 */
export function fillVariables(text: string, ctx: { now: number } & StudioVars) {
  const unix = Math.floor(ctx.now / 1000);
  const values: Record<string, string | undefined> = {
    user: ctx.user && `<@${ctx.user.id}>`,
    'user.name': ctx.user?.name,
    'user.id': ctx.user?.id,
    server: ctx.server?.name,
    'server.members': ctx.server?.members.toLocaleString('en-US'),
    channel: ctx.channel && `<#${ctx.channel}>`,
    date: `<t:${unix}:D>`,
    time: `<t:${unix}:t>`,
    separator: '',
  };
  return text.replace(
    /\{([a-z.]+)\}/g,
    (whole, name: string) => values[name] ?? whole,
  );
}
export const IS_COMPONENTS_V2 = 1 << 15;

/** The message body for Discord's create/edit message endpoints. */
export function studioPayload(
  input: StudioMessage,
  ctx: { now: number } & StudioVars,
) {
  const m = normaliseStudio(input);
  // Mentions in Studio messages are shown but never ping anyone by surprise.
  const allowed_mentions = { parse: [] as string[] };
  const fill = (text: string) => fillVariables(text, ctx);
  if (m.layout === 'v2') {
    const v = m.v2;
    const sections = v2Sections(v.text);
    const text = sections.flatMap((t, i) => {
      const parts: object[] = [];
      if (i > 0) parts.push({ type: 14, divider: true, spacing: 1 });
      if (!t.trim()) return parts;
      const display = { type: 10, content: fill(t) };
      // The thumbnail sits beside the first stretch of text.
      parts.push(
        i === 0 && v.thumbnail
          ? {
              type: 9,
              components: [display],
              accessory: { type: 11, media: { url: v.thumbnail } },
            }
          : display,
      );
      return parts;
    });
    const gallery = v.gallery.length
      ? [
          {
            type: 12,
            items: v.gallery.map((i) => ({
              media: { url: i.url },
              ...(i.description ? { description: i.description } : {}),
            })),
          },
        ]
      : [];
    const inside = v.order.flatMap((part) =>
      part === 'text'
        ? text
        : part === 'gallery'
          ? gallery
          : componentsPayload(m.components, fill),
    );
    return {
      flags: IS_COMPONENTS_V2,
      components: [
        { type: 17, accent_color: colour(v.accent), components: inside },
      ],
      allowed_mentions,
    };
  }
  // Discord needs both a name and a value in a field; this stands in for a blank.
  const blank = (text: string) => (text.trim() ? text : '\u200b');
  const embeds = m.embeds
    .filter((e) => !embedIsEmpty(e))
    .map((e) => ({
      ...(e.author.trim()
        ? {
            author: {
              name: fill(e.author),
              ...(e.authorIcon ? { icon_url: e.authorIcon } : {}),
              ...(e.authorUrl ? { url: e.authorUrl } : {}),
            },
          }
        : {}),
      ...(e.title.trim() ? { title: fill(e.title) } : {}),
      ...(e.description.trim() ? { description: fill(e.description) } : {}),
      color: colour(e.color),
      ...(e.image ? { image: { url: e.image } } : {}),
      ...(e.thumbnail ? { thumbnail: { url: e.thumbnail } } : {}),
      ...(e.footer.trim()
        ? {
            footer: {
              text: fill(e.footer),
              ...(e.footerIcon ? { icon_url: e.footerIcon } : {}),
            },
          }
        : {}),
      ...(e.timestamp ? { timestamp: new Date(ctx.now).toISOString() } : {}),
      ...(e.fields.some((f) => f.name.trim() || f.value.trim())
        ? {
            fields: e.fields
              .filter((f) => f.name.trim() || f.value.trim())
              .map((f) => ({
                name: blank(fill(f.name)),
                value: blank(fill(f.value)),
                inline: f.inline,
              })),
          }
        : {}),
    }));
  return {
    content: fill(m.content),
    embeds,
    components: componentsPayload(m.components, fill),
    allowed_mentions,
  };
}
