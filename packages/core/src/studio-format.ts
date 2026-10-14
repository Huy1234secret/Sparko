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

/** One piece of a Components V2 message. */
export type V2Block =
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

export type StudioMessage = {
  name: string;
  channel: string;
  /** "embed" is the classic message; "v2" uses Components V2 blocks. */
  layout: 'embed' | 'v2';
  content: string;
  /** Up to 10 embeds, shown in this order. */
  embeds: StudioEmbed[];
  buttons: LinkButton[];
  v2: { container: boolean; accent: string; blocks: V2Block[] };
};

export const v2Default = (): StudioMessage['v2'] => ({
  container: true,
  accent: '#FACC15',
  blocks: [
    {
      id: 'b1',
      type: 'text',
      content: '## Big news\nWrite your announcement here.',
    },
    { id: 'b2', type: 'separator', divider: true, spacing: 'small' },
    {
      id: 'b3',
      type: 'section',
      content: '**When:** Saturday 18:00\n**Where:** #events',
      accessory: {
        type: 'button',
        label: 'Details',
        url: 'https://discord.com',
      },
    },
  ],
});

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
  buttons: [],
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

/** Fills in parts older saved messages don't have. */
export const normaliseStudio = (input: StudioMessage): StudioMessage => {
  const { useEmbed, embed, ...m } = input as Legacy;
  const embeds = Array.isArray(m.embeds)
    ? m.embeds
    : embed && useEmbed !== false
      ? [embed]
      : [];
  return {
    ...(m as StudioMessage),
    content: typeof m.content === 'string' ? m.content : '',
    buttons: Array.isArray(m.buttons) ? m.buttons : [],
    embeds: embeds.map(asEmbed),
    layout: m.layout === 'v2' ? 'v2' : 'embed',
    v2: m.v2 ?? v2Default(),
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

function buttonsProblem(list: unknown, max: number) {
  if (!Array.isArray(list) || list.length > max)
    return `Use up to ${max} link buttons.`;
  for (const b of list as LinkButton[])
    if (!id(b?.id) || !str(b.label, 80) || !b.label.trim() || !https(b.url))
      return 'Every link button needs a label and a link that starts with https://.';
  return null;
}

/** Checks a message from the dashboard. Returns a problem, or null. */
export function studioProblem(input: unknown): string | null {
  const m = input as Partial<StudioMessage> | null;
  if (!m || typeof m !== 'object') return 'The message is missing.';
  if (!str(m.name, 80)) return 'The name must be 80 characters or fewer.';
  if (!/^\d{1,25}$/.test(m.channel ?? '')) return 'Pick a channel to post in.';
  if (m.layout === 'v2') {
    const v = m.v2;
    if (!v || typeof v !== 'object' || !Array.isArray(v.blocks))
      return 'The layout is missing.';
    if (!v.blocks.length) return 'Add at least one block.';
    if (v.blocks.length > 30) return 'Use up to 30 blocks.';
    if (!hex(v.accent)) return 'Use a colour like #FACC15.';
    let text = 0;
    for (const b of v.blocks as V2Block[]) {
      if (!id(b?.id)) return 'A block is damaged. Remove it and add it again.';
      if (b.type === 'text' || b.type === 'section') {
        if (!str(b.content, 4000) || !b.content.trim())
          return 'Text blocks need some text.';
        text += b.content.length;
      }
      if (b.type === 'section') {
        const a = b.accessory;
        if (
          a?.type === 'thumbnail'
            ? !https(a.url)
            : a?.type === 'button'
              ? !str(a.label, 80) || !a.label.trim() || !https(a.url)
              : true
        )
          return 'A section needs an image or a button with a link that starts with https://.';
      } else if (b.type === 'gallery') {
        if (
          !Array.isArray(b.images) ||
          b.images.length < 1 ||
          b.images.length > 10
        )
          return 'A gallery holds 1 to 10 images.';
        for (const img of b.images)
          if (!id(img?.id) || !https(img.url) || !str(img.description, 1024))
            return 'Gallery images need a link that starts with https://.';
      } else if (b.type === 'buttons') {
        const p = buttonsProblem(b.buttons, 5);
        if (p) return p;
        if (!b.buttons.length) return 'A button row needs at least one button.';
      } else if (b.type === 'separator') {
        if (
          typeof b.divider !== 'boolean' ||
          !['small', 'large'].includes(b.spacing)
        )
          return 'A separator is damaged. Remove it and add it again.';
      } else if (b.type !== 'text')
        return 'A block is damaged. Remove it and add it again.';
    }
    if (text > 4000)
      return 'Discord allows 4,000 characters of text in a message like this.';
    return null;
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
  return buttonsProblem(m.buttons, 25);
}

const colour = (h: string) => Number.parseInt(h.slice(1), 16);
export const IS_COMPONENTS_V2 = 1 << 15;

/** The message body for Discord's create/edit message endpoints. */
export function studioPayload(input: StudioMessage, ctx: { now: number }) {
  const m = normaliseStudio(input);
  const linkRow = (buttons: LinkButton[]) => ({
    type: 1,
    components: buttons.map((b) => ({
      type: 2,
      style: 5,
      label: b.label,
      url: b.url,
    })),
  });
  // Mentions in Studio messages are shown but never ping anyone by surprise.
  const allowed_mentions = { parse: [] as string[] };
  if (m.layout === 'v2') {
    const blocks = m.v2.blocks.map((b) => {
      switch (b.type) {
        case 'text':
          return { type: 10, content: b.content };
        case 'section':
          return {
            type: 9,
            components: [{ type: 10, content: b.content }],
            accessory:
              b.accessory.type === 'thumbnail'
                ? { type: 11, media: { url: b.accessory.url } }
                : {
                    type: 2,
                    style: 5,
                    label: b.accessory.label,
                    url: b.accessory.url,
                  },
          };
        case 'gallery':
          return {
            type: 12,
            items: b.images.map((i) => ({
              media: { url: i.url },
              ...(i.description ? { description: i.description } : {}),
            })),
          };
        case 'separator':
          return {
            type: 14,
            divider: b.divider,
            spacing: b.spacing === 'large' ? 2 : 1,
          };
        case 'buttons':
          return linkRow(b.buttons);
      }
    });
    return {
      flags: IS_COMPONENTS_V2,
      components: m.v2.container
        ? [{ type: 17, accent_color: colour(m.v2.accent), components: blocks }]
        : blocks,
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
              name: e.author,
              ...(e.authorIcon ? { icon_url: e.authorIcon } : {}),
              ...(e.authorUrl ? { url: e.authorUrl } : {}),
            },
          }
        : {}),
      ...(e.title.trim() ? { title: e.title } : {}),
      ...(e.description.trim() ? { description: e.description } : {}),
      color: colour(e.color),
      ...(e.image ? { image: { url: e.image } } : {}),
      ...(e.thumbnail ? { thumbnail: { url: e.thumbnail } } : {}),
      ...(e.footer.trim()
        ? {
            footer: {
              text: e.footer,
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
                name: blank(f.name),
                value: blank(f.value),
                inline: f.inline,
              })),
          }
        : {}),
    }));
  // Up to five link buttons fit on a row.
  const rows: LinkButton[][] = [];
  for (let i = 0; i < m.buttons.length; i += 5)
    rows.push(m.buttons.slice(i, i + 5));
  return {
    content: m.content,
    embeds,
    components: rows.map(linkRow),
    allowed_mentions,
  };
}
