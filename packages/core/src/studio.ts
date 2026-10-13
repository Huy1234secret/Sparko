import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule } from './store.ts';
import { getPosted, setPosted } from './tickets.ts';
import { Plain } from './ticket-actions.ts';

/**
 * Message Studio: messages built in the dashboard, either as a classic
 * embed or with Discord's Components V2 layout, and turned into what
 * Discord's API expects.
 */
export type StudioEmbed = {
  author: string;
  title: string;
  description: string;
  color: string;
  image: string;
  footer: string;
  thumbnail: boolean;
  timestamp: boolean;
  fields: { id: string; name: string; value: string; inline: boolean }[];
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
  useEmbed: boolean;
  embed: StudioEmbed;
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

export const studioDefault = (channel: string): StudioMessage => ({
  name: 'Announcement',
  channel,
  layout: 'embed',
  content: '',
  useEmbed: true,
  embed: {
    author: '',
    title: 'Big news',
    description: 'Write your announcement here.',
    color: '#FACC15',
    image: '',
    footer: '',
    thumbnail: false,
    timestamp: false,
    fields: [],
  },
  buttons: [],
  v2: v2Default(),
});

/** Fills in parts older saved messages don't have. */
export const normaliseStudio = (m: StudioMessage): StudioMessage => ({
  ...m,
  layout: m.layout === 'v2' ? 'v2' : 'embed',
  v2: m.v2 ?? v2Default(),
});

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
  const e = m.embed;
  if (!e || typeof e !== 'object') return 'The embed is missing.';
  if (!str(e.author, 256) || !str(e.title, 256) || !str(e.footer, 2048))
    return 'The author, title or footer is too long.';
  if (!str(e.description, 4096))
    return 'The description must be 4,096 characters or fewer.';
  if (!hex(e.color)) return 'Use a colour like #FACC15.';
  if (e.image && !https(e.image))
    return 'The image link must start with https://.';
  if (!Array.isArray(e.fields) || e.fields.length > 25)
    return 'Use up to 25 fields.';
  for (const f of e.fields)
    if (
      !id(f?.id) ||
      !str(f.name, 256) ||
      !str(f.value, 1024) ||
      !f.name.trim() ||
      !f.value.trim()
    )
      return 'Fields need both a name and a value.';
  const size =
    e.author.length +
    e.title.length +
    e.description.length +
    e.footer.length +
    e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  if (m.useEmbed && size > 6000)
    return 'Discord rejects embeds over 6,000 characters.';
  const hasEmbed =
    m.useEmbed &&
    !!(
      e.title.trim() ||
      e.description.trim() ||
      e.author.trim() ||
      e.image ||
      e.fields.length
    );
  if (!m.content?.trim() && !hasEmbed)
    return 'Add some text or an embed. Discord won’t send an empty message.';
  return buttonsProblem(m.buttons, 5);
}

const colour = (h: string) => Number.parseInt(h.slice(1), 16);
export const IS_COMPONENTS_V2 = 1 << 15;

/** The message body for Discord's create/edit message endpoints. */
export function studioPayload(
  input: StudioMessage,
  ctx: { serverIcon: string | null; now: number },
) {
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
  const e = m.embed;
  const footer = e.footer.trim();
  const embed = {
    ...(e.author.trim() ? { author: { name: e.author } } : {}),
    ...(e.title.trim() ? { title: e.title } : {}),
    ...(e.description.trim() ? { description: e.description } : {}),
    color: colour(e.color),
    ...(e.image ? { image: { url: e.image } } : {}),
    ...(e.thumbnail && ctx.serverIcon
      ? { thumbnail: { url: ctx.serverIcon } }
      : {}),
    ...(footer ? { footer: { text: footer } } : {}),
    ...(e.timestamp ? { timestamp: new Date(ctx.now).toISOString() } : {}),
    ...(e.fields.length
      ? {
          fields: e.fields.map((f) => ({
            name: f.name,
            value: f.value,
            inline: f.inline,
          })),
        }
      : {}),
  };
  return {
    content: m.content,
    embeds: m.useEmbed ? [embed] : [],
    components: m.buttons.length ? [linkRow(m.buttons)] : [],
    allowed_mentions,
  };
}

// Templates and publishing ----------------------------------------------------

type Row = Record<string, unknown>;

export function listTemplates<T>(db: Db, guildId: string, moduleId: string) {
  return (
    db
      .prepare(
        'SELECT * FROM templates WHERE guild_id = ? AND module_id = ? ORDER BY id DESC',
      )
      .all(guildId, moduleId) as Row[]
  ).map((r) => ({
    id: String(r.id),
    name: r.name as string,
    who: r.who_name as string,
    at: r.created_at as number,
    message: JSON.parse(r.json as string) as T,
  }));
}

export function addTemplate(
  db: Db,
  t: {
    guildId: string;
    moduleId: string;
    name: string;
    who: string;
    message: unknown;
  },
  now: number,
) {
  db.prepare(
    `INSERT INTO templates (guild_id, module_id, name, json, who_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(t.guildId, t.moduleId, t.name, JSON.stringify(t.message), t.who, now);
}

export function deleteTemplate(db: Db, guildId: string, id: string) {
  db.prepare('DELETE FROM templates WHERE guild_id = ? AND id = ?').run(
    guildId,
    Number(id),
  );
}

/**
 * Posts the Studio message, or edits the one already posted with the same
 * layout in the same channel. Discord can't switch a posted message between
 * the classic and Components V2 layouts, so a new layout is a new message.
 */
export async function publishStudio(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
) {
  const { config } = getModule<StudioMessage>(db, guildId, 'studio');
  if (!config) return;
  const m = normaliseStudio(config);
  const icon = getGuild(db, guildId)?.icon;
  const body = studioPayload(m, {
    serverIcon: icon
      ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=256`
      : null,
    now,
  });
  const key = `studio:${m.layout}`;
  const posted = getPosted(db, guildId, key);
  try {
    if (posted?.channelId === m.channel) {
      try {
        await rest.patch(
          `/channels/${posted.channelId}/messages/${posted.messageId}`,
          body,
        );
        return;
      } catch (e) {
        if (
          !(e instanceof DiscordError && e.code === DiscordCodes.unknownMessage)
        )
          throw e;
      }
    }
    const message = await rest.post<{ id: string }>(
      `/channels/${m.channel}/messages`,
      body,
    );
    setPosted(db, guildId, key, {
      channelId: m.channel,
      messageId: message.id,
    });
  } catch (e) {
    if (
      e instanceof DiscordError &&
      (e.code === DiscordCodes.missingPermissions ||
        e.code === DiscordCodes.missingAccess)
    )
      throw new Plain(
        'Sparko can’t post in that channel yet. Give it View Channel, Send Messages and Embed Links there.',
      );
    if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
      throw new Plain('That channel no longer exists. Pick another one.');
    if (e instanceof DiscordError && e.status === 400)
      throw new Plain(`Discord didn’t accept the message: ${e.message}`);
    throw e;
  }
}
