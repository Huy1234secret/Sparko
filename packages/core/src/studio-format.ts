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
  /** A random colour each time it's sent, instead of `color`. */
  shuffle?: boolean;
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
  | { id: string; type: 'role'; mode: 'give' | 'take'; roles: string[] }
  /**
   * Only on suggestion messages: votes on the suggestion, or (for staff who
   * can approve) approves or denies it. Anywhere else it does nothing.
   */
  | { id: string; type: 'suggestion'; act: SuggestionAct };

export const SUGGESTION_ACTS = [
  'upvote',
  'downvote',
  'approve',
  'deny',
] as const;
export type SuggestionAct = (typeof SUGGESTION_ACTS)[number];

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
  /**
   * A suggestion's upvote or downvote button, placed among the others. It
   * looks and acts as the suggestion settings say, and is left out of any
   * message that isn't a suggestion.
   */
  vote?: 'up' | 'down';
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
/**
 * Where a button, a menu or the gallery sits in a Components V2 message:
 * above or below the container, inside it after a line of the text (line
 * -1 is the top of the container), or, for a button, beside a line.
 */
export type V2Slot =
  | { at: 'above' }
  | { at: 'below' }
  | { at: 'line'; line: number }
  | { at: 'beside'; line: number };
/** A placed item: a button or menu by its id, or "gallery". */
export type V2Place = { id: string; slot: V2Slot };
/**
 * A Components V2 message: one container with a colour bar, its text
 * ({separator} draws a divider), a thumbnail beside the first stretch of
 * text, and an image gallery. The message's buttons and menus, and the
 * gallery, can sit between lines of the text, a button beside a line, or
 * above or below the container. Items in the same place keep the order of
 * `place`.
 */
export type StudioV2 = {
  accent: string;
  /** A random accent each time it's sent. */
  shuffle?: boolean;
  text: string;
  thumbnail: string;
  gallery: GalleryImage[];
  place: V2Place[];
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
  // Everything sits at the end of the container until it's moved.
  place: [],
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

/** A new template starts empty in both layouts. */
export const blankStudioMessage = (
  channel: string,
  name = 'Untitled',
): StudioMessage => ({
  name,
  channel,
  layout: 'embed',
  content: '',
  embeds: [embedDefault()],
  components: [],
  v2: { ...v2Default(), text: '' },
});

/** Carry the visible message into the other layout without truncating content. */
export function switchStudioLayout(
  message: StudioMessage,
  layout: StudioMessage['layout'],
): StudioMessage {
  if (message.layout === layout) return message;
  if (layout === 'v2') {
    const first = message.embeds[0];
    const thumbnail = message.embeds.find((e) => e.thumbnail)?.thumbnail ?? '';
    const gallery = message.embeds.flatMap((e, i) =>
      [
        { id: `image-${i}`, url: e.image, description: '' },
        {
          id: `thumb-${i}`,
          url: e.thumbnail === thumbnail ? '' : e.thumbnail,
          description: '',
        },
        { id: `author-${i}`, url: e.authorIcon, description: '' },
        { id: `footer-${i}`, url: e.footerIcon, description: '' },
      ].filter((image) => image.url),
    );
    return {
      ...message,
      layout,
      v2: {
        accent: first?.color ?? '#FACC15',
        shuffle: first?.shuffle ?? false,
        text: [
          message.content,
          ...message.embeds.map((e) =>
            [
              e.author && e.authorUrl
                ? `[${e.author}](${e.authorUrl})`
                : e.author,
              e.title,
              e.description,
              ...e.fields.flatMap((f) => [f.name, f.value]),
              e.footer,
              e.timestamp ? '{date} {time}' : '',
            ]
              .filter((text) => text.length > 0)
              .join('\n\n'),
          ),
        ]
          .filter((text) => text.length > 0)
          .join('\n\n'),
        thumbnail,
        gallery,
        place: message.components.map((c) => ({
          id: c.id,
          slot: { at: 'below' },
        })),
      },
    };
  }

  const { v2 } = message;
  // Flatten moved controls in their visible order into the embed's normal rows.
  const rank = (slot: V2Slot) =>
    slot.at === 'above'
      ? -Infinity
      : slot.at === 'below'
        ? Infinity
        : slot.line * 2 + (slot.at === 'beside' ? 0 : 1);
  const order = placeOf(v2, message.components)
    .filter((p) => p.id !== 'gallery')
    .sort((a, b) => rank(a.slot) - rank(b.slot));
  const byId = new Map(message.components.map((c) => [c.id, c]));
  return {
    ...message,
    layout,
    content: '',
    embeds: Array.from({ length: Math.max(1, v2.gallery.length) }, (_, i) => ({
      ...embedDefault(`e${i + 1}`),
      description: i === 0 ? v2.text : '',
      color: v2.accent,
      shuffle: v2.shuffle ?? false,
      thumbnail: i === 0 ? v2.thumbnail : '',
      image: v2.gallery[i]?.url ?? '',
    })),
    components: order.map((p) => byId.get(p.id)!),
  };
}

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
): StudioEmbed => {
  const base = embedDefault(typeof e.id === 'string' ? e.id : `e${i + 1}`);
  const { shuffle, ...rest } = e;
  return {
    ...base,
    ...rest,
    id: base.id,
    // Older messages kept a yes/no for "use the server icon" here.
    thumbnail: typeof e.thumbnail === 'string' ? e.thumbnail : '',
    fields: Array.isArray(e.fields) ? e.fields : [],
    ...(shuffle === true ? { shuffle: true } : {}),
  };
};

/** The lines of a V2 message's text, which items are placed against. */
export const v2Lines = (text: string) => text.split('\n');

const sameSlot = (a: V2Slot, b: V2Slot) =>
  a.at === b.at &&
  (a.at === 'above' ||
    a.at === 'below' ||
    a.line === (b as { line: number }).line);

/**
 * Tidies where things sit: every button and menu and the gallery gets one
 * place (new ones go at the end of the container), lines are kept within
 * the text, menus can't sit beside a line, and a line has at most one
 * button beside it. Messages saved with the older part order are read too.
 */
export function placeOf(
  v: Partial<StudioV2> & {
    order?: string[];
    above?: string[];
    below?: string[];
  },
  components: StudioComponent[],
): V2Place[] {
  const last = v2Lines(typeof v.text === 'string' ? v.text : '').length - 1;
  const ids = [...components.map((c) => c.id), 'gallery'];
  let saved: V2Place[] = Array.isArray(v.place) ? v.place : [];
  if (!Array.isArray(v.place) && Array.isArray(v.order)) {
    // Older messages placed "the buttons" and "the gallery" as two parts,
    // inside the container (before or after the text) or outside it.
    const slotFor = (part: string): V2Slot => {
      if (v.above?.includes(part)) return { at: 'above' };
      if (v.below?.includes(part)) return { at: 'below' };
      const order = v.order ?? [];
      return order.indexOf(part) < order.indexOf('text')
        ? { at: 'line', line: -1 }
        : { at: 'line', line: last };
    };
    const parts = [...(v.above ?? []), ...v.order, ...(v.below ?? [])];
    saved = parts.flatMap((part) =>
      part === 'components'
        ? components.map((c) => ({ id: c.id, slot: slotFor(part) }))
        : part === 'gallery'
          ? [{ id: 'gallery', slot: slotFor(part) }]
          : [],
    );
  }
  const kind = new Map(components.map((c) => [c.id, c.type]));
  const seen = new Set<string>();
  const besides = new Set<number>();
  const out: V2Place[] = [];
  for (const p of saved) {
    if (!p || !ids.includes(p.id) || seen.has(p.id)) continue;
    const s = p.slot as V2Slot | undefined;
    let slot: V2Slot =
      s?.at === 'above' || s?.at === 'below'
        ? { at: s.at }
        : (s?.at === 'line' || s?.at === 'beside') && Number.isInteger(s.line)
          ? {
              at: s.at,
              line: Math.max(
                s.at === 'beside' ? 0 : -1,
                Math.min(last, s.line),
              ),
            }
          : { at: 'line', line: last };
    if (slot.at === 'beside') {
      if (kind.get(p.id) !== 'button' || besides.has(slot.line))
        slot = { at: 'line', line: slot.line };
      else besides.add(slot.line);
    }
    seen.add(p.id);
    out.push({ id: p.id, slot });
  }
  for (const id of ids)
    if (!seen.has(id)) out.push({ id, slot: { at: 'line', line: last } });
  return out;
}

const v2Of = (v: unknown, components: StudioComponent[]): StudioV2 => {
  const x = (v ?? {}) as Partial<StudioV2> & { blocks?: LegacyV2Block[] };
  const base = Array.isArray(x.blocks) ? fromBlocks(x).v2 : v2Default();
  const merged = Array.isArray(x.blocks)
    ? base
    : { ...base, ...x, place: x.place as V2Place[] };
  const text = typeof merged.text === 'string' ? merged.text : base.text;
  const lines = splitSeparatorLines(
    text,
    placeOf({ ...merged, text }, components),
  );
  return {
    accent: typeof merged.accent === 'string' ? merged.accent : base.accent,
    ...(merged.shuffle === true ? { shuffle: true } : {}),
    text: lines.text,
    thumbnail: typeof merged.thumbnail === 'string' ? merged.thumbnail : '',
    gallery: Array.isArray(merged.gallery) ? merged.gallery : [],
    place: lines.place,
  };
};

/**
 * Puts every {separator} on a line of its own, moving what's placed on the
 * lines along with them, so each line is either text or a divider. A line
 * that was split keeps its places on its last part, as Discord shows them.
 */
export function splitSeparatorLines(text: string, place: V2Place[]) {
  if (!/.\{separator\}|\{separator\}./.test(text)) return { text, place };
  const out: string[] = [];
  const to: number[] = [];
  for (const line of v2Lines(text)) {
    if (line === '') out.push('');
    else
      line.split('{separator}').forEach((piece, j) => {
        if (j > 0) out.push('{separator}');
        if (piece !== '') out.push(piece);
      });
    to.push(out.length - 1);
  }
  return {
    text: out.join('\n'),
    place: place.map((p) =>
      p.slot.at === 'line' || p.slot.at === 'beside'
        ? {
            ...p,
            slot: {
              ...p.slot,
              line:
                p.slot.line < 0
                  ? p.slot.line
                  : (to[p.slot.line] ?? p.slot.line),
            },
          }
        : p,
    ),
  };
}

/** The items placed in a slot, in order. */
export const placedIn = (place: V2Place[], slot: V2Slot) =>
  place.filter((p) => sameSlot(p.slot, slot));

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
  const components: StudioComponent[] = Array.isArray(m.components)
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
      );
  return {
    ...(m as StudioMessage),
    content: typeof m.content === 'string' ? m.content : '',
    components,
    embeds: embeds.map(asEmbed),
    layout: m.layout === 'v2' ? 'v2' : 'embed',
    v2: v2Of(m.v2, components),
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
/** Picture links can also be a picture Sparko fills in when it sends. */
export const pictureVariables = [
  '{user.avatar}',
  '{server.icon}',
  '{author.avatar}',
  '{message.image}',
] as const;
export const isPictureVariable = (url: unknown) =>
  (pictureVariables as readonly unknown[]).includes(url);
const picture = (url: unknown) => https(url) || isPictureVariable(url);
const hex = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.length <= max;
const id = (v: unknown) => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);

/** A problem with a message, and where in the editor it is. */
export type StudioIssue = {
  problem: string;
  /**
   * Where to look: "name", "channel", "text", "accent", "thumbnail",
   * "gallery", "image:<id>", "embed:<id>", "message", or a button or menu
   * as "component:<id>", with "/label", "/url", "/actions", "/action:<id>",
   * "/options" or "/option:<id>" (and its "/action:<id>") after it.
   */
  at: string;
};
const issue = (problem: string, at = 'message'): StudioIssue => ({
  problem,
  at,
});

/** Checks a message from the dashboard. Returns a problem, or null. */
export function studioProblem(input: unknown): string | null {
  return studioIssue(input)?.problem ?? null;
}

/** Checks a message, saying where the first problem is. */
export function studioIssue(input: unknown): StudioIssue | null {
  const m = input as Partial<StudioMessage> | null;
  if (!m || typeof m !== 'object') return issue('The message is missing.');
  if (!str(m.name, 80))
    return issue('The name must be 80 characters or fewer.', 'name');
  if (!/^\d{1,25}$/.test(m.channel ?? ''))
    return issue('Pick a channel to post in.', 'channel');
  if (m.layout === 'v2') {
    const v = m.v2;
    if (!v || typeof v !== 'object' || typeof v.text !== 'string')
      return issue('The layout is missing.');
    if (!hex(v.accent)) return issue('Use a colour like #FACC15.', 'accent');
    if (v.text.length > 4000)
      return issue(
        'Discord allows 4,000 characters of text in a message like this.',
        'text',
      );
    if (v.thumbnail && !picture(v.thumbnail))
      return issue('The thumbnail link must start with https://.', 'thumbnail');
    if (!Array.isArray(v.gallery) || v.gallery.length > 10)
      return issue('A gallery holds up to 10 images.', 'gallery');
    for (const img of v.gallery)
      if (!id(img?.id) || !picture(img.url) || !str(img.description, 1024))
        return issue(
          'Gallery images need a link that starts with https://.',
          `image:${img?.id}`,
        );
    if (
      !v2Sections(v.text).some((t) => t.trim()) &&
      !v.gallery.length &&
      !(m.components ?? []).length
    )
      return issue(
        'Add some text, an image or a button. Discord won’t send an empty message.',
        'text',
      );
    return componentsProblem(m.components);
  }
  if (!str(m.content, 2000))
    return issue('The text must be 2,000 characters or fewer.', 'text');
  if (!Array.isArray(m.embeds) || m.embeds.length > 10)
    return issue('Use up to 10 embeds.', 'message');
  let size = 0;
  for (const e of m.embeds as StudioEmbed[]) {
    if (!e || typeof e !== 'object' || !id(e.id))
      return issue(
        'An embed is damaged. Remove it and add it again.',
        'message',
      );
    if (!str(e.author, 256) || !str(e.title, 256) || !str(e.footer, 2048))
      return issue('The author, title or footer is too long.', `embed:${e.id}`);
    if (!str(e.description, 4096))
      return issue(
        'The description must be 4,096 characters or fewer.',
        `embed:${e.id}`,
      );
    if (!hex(e.color))
      return issue('Use a colour like #FACC15.', `embed:${e.id}`);
    if (typeof e.authorUrl !== 'string' || (e.authorUrl && !https(e.authorUrl)))
      return issue(
        'Links and pictures must start with https://.',
        `embed:${e.id}`,
      );
    for (const url of [e.image, e.thumbnail, e.authorIcon, e.footerIcon])
      if (typeof url !== 'string' || (url && !picture(url)))
        return issue(
          'Links and pictures must start with https://.',
          `embed:${e.id}`,
        );
    if (!Array.isArray(e.fields) || e.fields.length > 25)
      return issue('Use up to 25 fields in an embed.', `embed:${e.id}`);
    for (const f of e.fields)
      if (
        !id(f?.id) ||
        !str(f.name, 256) ||
        !str(f.value, 1024) ||
        typeof f.inline !== 'boolean'
      )
        return issue(
          'A field is too long. Names hold 256 characters and values 1,024.',
          `embed:${e.id}`,
        );
    size +=
      e.author.length +
      e.title.length +
      e.description.length +
      e.footer.length +
      e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  }
  if (size > 6000)
    return issue(
      'Discord rejects embeds with more than 6,000 characters between them.',
      'message',
    );
  if (
    !m.content?.trim() &&
    !(m.embeds as StudioEmbed[]).some((e) => !embedIsEmpty(e))
  )
    return issue(
      'Add some text or an embed. Discord won’t send an empty message.',
      'text',
    );
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

export function actionsProblem(list: unknown, at: string): StudioIssue | null {
  if (!Array.isArray(list) || list.length > 10)
    return issue(
      'Use up to 10 actions on a button or option.',
      `${at}/actions`,
    );
  for (const a of list as StudioAction[]) {
    const here = `${at}/action:${a?.id}`;
    if (!id(a?.id))
      return issue('An action is damaged. Remove it and add it again.', at);
    if (a.type === 'send') {
      if (
        !Array.isArray(a.templates) ||
        !a.templates.length ||
        a.templates.length > 10 ||
        !a.templates.every((t) => /^\d{1,12}$/.test(t))
      )
        return issue('Pick the templates a “Send message” action sends.', here);
      if (typeof a.dm !== 'boolean' || typeof a.ephemeral !== 'boolean')
        return issue('An action is damaged. Remove it and add it again.', here);
    } else if (a.type === 'role') {
      if (
        !['give', 'take'].includes(a.mode) ||
        !Array.isArray(a.roles) ||
        !a.roles.length ||
        a.roles.length > 25 ||
        !a.roles.every((r) => /^\d{1,25}$/.test(r))
      )
        return issue(
          'Pick the roles a “Give or take role” action changes.',
          here,
        );
    } else if (a.type === 'suggestion') {
      if (!SUGGESTION_ACTS.includes(a.act))
        return issue('An action is damaged. Remove it and add it again.', here);
      // Approve and Deny answer the click with a form, so they stand alone.
      // A vote answers it too, so it goes first and the rest follow.
      if ((a.act === 'approve' || a.act === 'deny') && list.length > 1)
        return issue(
          'Approve and Deny have to be the only action on their button or option.',
          here,
        );
      if (a !== list[0])
        return issue(
          'A vote has to be the first action on its button or option.',
          here,
        );
    } else
      return issue('An action is damaged. Remove it and add it again.', here);
  }
  return null;
}

const emojiOk = (e: unknown) =>
  typeof e === 'string' &&
  e.length <= 64 &&
  (!e || /^<a?:\w{1,32}:\d{1,25}>$/.test(e) || !/[<>:\s]/.test(e));

function componentsProblem(list: unknown): StudioIssue | null {
  if (!Array.isArray(list)) return issue('The buttons are damaged.');
  if (componentRows(list as StudioComponent[]).length > 5)
    return issue(
      'Discord shows up to 5 rows of buttons and menus. A menu takes a row of its own.',
    );
  for (const c of list as StudioComponent[]) {
    const at = `component:${c?.id}`;
    if (!id(c?.id))
      return issue('A button is damaged. Remove it and add it again.');
    if (c.type === 'button' && c.vote !== undefined) {
      if (c.vote !== 'up' && c.vote !== 'down')
        return issue('A button is damaged. Remove it and add it again.', at);
    } else if (c.type === 'button') {
      if (!str(c.label, 80) || !emojiOk(c.emoji))
        return issue('Button text holds up to 80 characters.', `${at}/label`);
      if (!c.label.trim() && !c.emoji)
        return issue(
          'Every button needs some text or an emoji.',
          `${at}/label`,
        );
      if (!['blurple', 'grey', 'green', 'red'].includes(c.colour))
        return issue('A button is damaged. Remove it and add it again.', at);
      if (c.link) {
        if (!https(c.url))
          return issue(
            'Link buttons need a link that starts with https://.',
            `${at}/url`,
          );
      } else {
        const p = actionsProblem(c.actions, at);
        if (p) return p;
        if (!c.actions.length)
          return issue(
            'Give every action button something to do, or make it a link.',
            `${at}/actions`,
          );
      }
    } else if (c.type === 'menu') {
      if (!str(c.placeholder, 150))
        return issue('Menu placeholders hold up to 150 characters.', at);
      if (typeof c.multiple !== 'boolean')
        return issue('A menu is damaged. Remove it and add it again.', at);
      if (
        !Array.isArray(c.options) ||
        !c.options.length ||
        c.options.length > 25
      )
        return issue('A menu holds 1 to 25 options.', `${at}/options`);
      for (const o of c.options) {
        const here = `${at}/option:${o?.id}`;
        if (!id(o?.id) || !emojiOk(o.emoji))
          return issue(
            'A menu option is damaged. Remove it and add it again.',
            here,
          );
        if (!str(o.label, 100) || !o.label.trim())
          return issue(
            'Every menu option needs a title of up to 100 characters.',
            here,
          );
        if (!str(o.description, 100))
          return issue('Option descriptions hold up to 100 characters.', here);
        const p = actionsProblem(o.actions, here);
        if (p) return p;
      }
    } else return issue('A button is damaged. Remove it and add it again.');
  }
  return null;
}

/** The most templates one "Send message" action can send on a plan. */
export const sendLimit = (plan: 'free' | 'plus' | undefined) =>
  plan === 'plus' ? 10 : 1;
/** Checks the parts of a message that depend on the server's plan, saying where. */
export function planIssue(
  m: StudioMessage,
  plan: 'free' | 'plus' | undefined,
): StudioIssue | null {
  const max = sendLimit(plan);
  for (const c of m.components) {
    const owners =
      c.type === 'button'
        ? [{ at: `component:${c.id}`, actions: c.actions }]
        : c.options.map((o) => ({
            at: `component:${c.id}/option:${o.id}`,
            actions: o.actions,
          }));
    for (const { at, actions } of owners)
      for (const a of actions)
        if (a.type === 'send' && a.templates.length > max)
          return issue(
            `A “Send message” action sends up to ${max} template${max === 1 ? '' : 's'} on this plan.`,
            `${at}/action:${a.id}`,
          );
  }
  return null;
}

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
  /** Voting has closed, so vote buttons are greyed out. */
  closed = false,
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
        ...(c.link
          ? { url: c.url }
          : { custom_id: c.vote ? `sg:${c.vote}` : studioCustomId(c) }),
        ...(c.vote && closed ? { disabled: true } : {}),
      };
    }),
  }));
}

const colour = (h: string) => Number.parseInt(h.slice(1), 16);
/** A bright random colour, for messages set to shuffle theirs. */
export const shuffledColour = () => {
  const h = Math.random() * 360;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (1 - 0.85 * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
};

/** The text of a Components V2 message, cut where {separator} appears. */
export const v2Sections = (text: string) => text.split(/\{separator\}/);

/** Who and where a message is for, to fill its {variables}. */
export type StudioVars = {
  user?:
    | {
        id: string;
        name: string;
        /** Their profile picture's link. */
        avatar?: string | undefined;
        /** When their account was made, and when they joined the server. */
        createdAt?: number | undefined;
        joinedAt?: number | undefined;
      }
    | undefined;
  server?:
    | {
        name: string;
        members: number;
        icon?: string | undefined;
        boosts?: number | undefined;
        level?: number | undefined;
      }
    | undefined;
  /** The channel the message goes to. */
  channel?: string | undefined;
  /** The role a reaction role just gave or took. */
  role?: { id: string; name: string } | undefined;
  /** A reaction role's roles, one line each, for {role-list}. */
  roleList?: string | undefined;
  /** More variables a module fills in, like a suggestion's {status}. */
  extra?: Record<string, string> | undefined;
  /** A suggestion's vote buttons: how they look, and whether voting closed. */
  votes?:
    | {
        up: { label: string; emoji: string; colour: ButtonColour };
        down: { label: string; emoji: string; colour: ButtonColour };
        closed: boolean;
      }
    | undefined;
};

export type StudioVariable = {
  name: string;
  /** Filled in only by poll messages. */
  poll?: true;
  about: string;
  /** Filled in only by reaction role responses. */
  role?: true;
  /** Filled in only by suggestion messages. */
  suggestion?: true;
  /** Filled in only by starboard posts. */
  starboard?: true;
  /** Filled in only by birthday messages. */
  birthday?: true;
  /** Filled in only by question, answer and answered-DM messages. */
  question?: true;
  /** Filled in only by invite join and leave messages. */
  invite?: true;
  /** Filled in only by event messages and their DMs. */
  event?: true;
  /** Filled in only by the temporary voice panel, inside a room. */
  voice?: true;
  /** Filled in only by level-up messages, rank cards and XP crates. */
  level?: true;
};

/** Variables people can write in Studio messages, in braces. */
export const studioVariables: StudioVariable[] = [
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
  {
    name: 'user.avatar',
    about: 'The member’s profile picture. Paste it as a picture link.',
  },
  {
    name: 'user.created',
    about: 'How long ago their Discord account was made.',
  },
  {
    name: 'user.joined',
    about: 'How long ago they joined the server.',
  },
  {
    name: 'server.icon',
    about: 'The server’s picture. Paste it as a picture link.',
  },
  {
    name: 'server.boosts',
    about: 'How many boosts the server has.',
  },
  {
    name: 'server.level',
    about: 'The server’s boost level, 0 to 3.',
  },
  {
    name: 'role',
    about: 'Mentions the role that was given or taken, without pinging it.',
    role: true,
  },
  { name: 'role.name', about: 'The role’s name.', role: true },
  { name: 'role.id', about: 'The role’s Discord ID.', role: true },
  {
    name: 'role-list',
    about: 'Lists every role on the message, with its emoji, one per line.',
    role: true,
  },
  {
    name: 'role.selected.list',
    about: 'Mentions every role the member just got, without pinging them.',
    role: true,
  },
  {
    name: 'role.removed.list',
    about: 'Mentions every role just taken from the member.',
    role: true,
  },
  {
    name: 'user.suggestion',
    about:
      'What the member suggested. Long suggestions carry on in another embed or container.',
    suggestion: true,
  },
  {
    name: 'suggestion.title',
    about: 'The suggestion’s title.',
    suggestion: true,
  },
  {
    name: 'suggestion.id',
    about: 'The suggestion’s number, like #12.',
    suggestion: true,
  },
  {
    name: 'status',
    about:
      'Its status: Pending, Approved or Denied for a suggestion, or Open, Answered, Closed or Expired for a question.',
    suggestion: true,
    question: true,
  },
  {
    name: 'vote.ratio.amount',
    about: 'Upvotes | downvotes and the difference, like `100 | 120 - -20`.',
    suggestion: true,
  },
  {
    name: 'vote.ratio.percent',
    about: 'The same as percentages adding up to 100, like `35% | 65% - -15%`.',
    suggestion: true,
  },
  { name: 'upvotes', about: 'How many upvotes it has.', suggestion: true },
  { name: 'downvotes', about: 'How many downvotes it has.', suggestion: true },
  {
    name: 'files',
    about:
      'The files the member added. Pictures and videos are shown in the message.',
    suggestion: true,
    question: true,
  },
  {
    name: 'question.title',
    about: 'The question’s title.',
    question: true,
  },
  {
    name: 'question.body',
    about: 'The details the member wrote under the title.',
    question: true,
  },
  {
    name: 'question.id',
    about: 'The question’s number, like #12.',
    question: true,
  },
  {
    name: 'question.category',
    about: 'The category picked, with its emoji, or General.',
    question: true,
  },
  {
    name: 'answer',
    about:
      'The answer staff wrote. The question message shows its first 1,000 characters.',
    question: true,
  },
  {
    name: 'answered.by',
    about: 'Mentions who answered, without pinging them.',
    question: true,
  },
  {
    name: 'answered.by.name',
    about: 'The name of who answered.',
    question: true,
  },
  {
    name: 'asker',
    about: 'Mentions who asked, or says Anonymous when questions are.',
    question: true,
  },
  {
    name: 'metoo.count',
    about: 'How many members pressed Me too.',
    question: true,
  },
  {
    name: 'thread',
    about: 'Links the question’s thread.',
    question: true,
  },
  {
    name: 'birthday.users',
    about: 'Mentions everyone the birthday message is for.',
    birthday: true,
  },
  {
    name: 'birthday.count',
    about: 'How many members have their birthday in the message.',
    birthday: true,
  },
  {
    name: 'birthday.age',
    about:
      'How old they turn, for one birthday. Empty when they didn’t save the year or ages are hidden.',
    birthday: true,
  },
  {
    name: 'birthday.date',
    about: 'The birthday’s date, like 14 March.',
    birthday: true,
  },
  {
    name: 'month',
    about: 'The month, like March, in the monthly birthday post.',
    birthday: true,
  },
  {
    name: 'birthday.list',
    about:
      'Every birthday this month, one per line, like “@rhea — 14 March”, in the monthly post.',
    birthday: true,
  },
  { name: 'stars', about: 'How many stars the message has.', starboard: true },
  {
    name: 'star.emoji',
    about: 'The board’s star emoji, like ⭐.',
    starboard: true,
  },
  { name: 'board', about: 'The board’s name.', starboard: true },
  {
    name: 'author',
    about: 'Mentions who wrote the starred message, without pinging them.',
    starboard: true,
  },
  {
    name: 'author.name',
    about: 'The name of who wrote the starred message.',
    starboard: true,
  },
  {
    name: 'author.avatar',
    about: 'Their profile picture. Paste it as a picture link.',
    starboard: true,
  },
  {
    name: 'jump.link',
    about: 'A link to the starred message.',
    starboard: true,
  },
  {
    name: 'message.content',
    about: 'The starred message’s text.',
    starboard: true,
  },
  {
    name: 'message.image',
    about:
      'The first picture in the starred message. Paste it as a picture link; left out when there’s none.',
    starboard: true,
  },
  {
    name: 'message.date',
    about: 'When the starred message was sent, in each reader’s own format.',
    starboard: true,
  },
  { name: 'poll.question', about: 'The poll’s question.', poll: true },
  {
    name: 'poll.options',
    about:
      'Every option with its bar, share and votes, like ▰▰▰▱▱ 60% (12). Hidden results list only the options.',
    poll: true,
  },
  { name: 'poll.id', about: 'The poll’s number, like #4.', poll: true },
  {
    name: 'votes.total',
    about: 'How many members have voted.',
    poll: true,
  },
  {
    name: 'poll.ends',
    about:
      'When it ends, like “in 2 hours”, or when it ended. “No end time” if it runs until staff end it.',
    poll: true,
  },
  {
    name: 'poll.author',
    about: 'Mentions who made the poll, without pinging them.',
    poll: true,
  },
  {
    name: 'poll.winner',
    about:
      'The option with the most votes, or the tie. Filled in once the poll ends.',
    poll: true,
  },
  {
    name: 'poll.status',
    about: 'Open, Scheduled or Ended.',
    poll: true,
  },
  {
    name: 'inviter',
    about:
      'Mentions who invited the member, without pinging them. “the vanity link” or “an unknown invite” when there’s nobody.',
    invite: true,
  },
  {
    name: 'inviter.name',
    about: 'The inviter’s name, or “Vanity link” or “Unknown”.',
    invite: true,
  },
  {
    name: 'inviter.invites',
    about: 'The inviter’s total invites, after this join or leave.',
    invite: true,
  },
  { name: 'invite.code', about: 'The invite code they used.', invite: true },
  {
    name: 'invite.uses',
    about: 'How many times that invite has been used.',
    invite: true,
  },
  {
    name: 'join.type',
    about: 'How they joined: normal, vanity or unknown.',
    invite: true,
  },
  { name: 'event.title', about: 'The event’s title.', event: true },
  {
    name: 'event.description',
    about: 'The event’s description.',
    event: true,
  },
  { name: 'event.id', about: 'The event’s number, like #12.', event: true },
  {
    name: 'event.start',
    about: 'When it starts, in each reader’s own time zone.',
    event: true,
  },
  {
    name: 'event.start.relative',
    about: 'How soon it starts, like “in 2 hours”.',
    event: true,
  },
  {
    name: 'event.end',
    about: 'When it ends, in each reader’s own time zone.',
    event: true,
  },
  {
    name: 'event.location',
    about: 'Where it is: its voice channel and the place you wrote.',
    event: true,
  },
  { name: 'event.host', about: 'Mentions who made the event.', event: true },
  {
    name: 'event.link',
    about: 'A link to the event’s message, for DMs.',
    event: true,
  },
  {
    name: 'event.status',
    about: 'Upcoming, Happening now, Ended or Cancelled.',
    event: true,
  },
  { name: 'going.count', about: 'How many members are going.', event: true },
  { name: 'maybe.count', about: 'How many answered Maybe.', event: true },
  {
    name: 'spots.left',
    about: 'Spots left before the waitlist, or Unlimited.',
    event: true,
  },
  {
    name: 'going.list',
    about:
      'Mentions the first members going, like “@rhea, @ayo and 5 more”, without pinging them.',
    event: true,
  },
  {
    name: 'room',
    about:
      'Links the voice room, when the panel is posted in a room’s own chat.',
    voice: true,
  },
  { name: 'room.name', about: 'The voice room’s name.', voice: true },
  {
    name: 'room.owner',
    about: 'Mentions the room’s owner, without pinging them.',
    voice: true,
  },
  {
    name: 'room.limit',
    about: 'How many can join the room, or “No limit”.',
    voice: true,
  },
  { name: 'level', about: 'The member’s level.', level: true },
  {
    name: 'level.previous',
    about: 'The level they were before this level-up.',
    level: true,
  },
  { name: 'xp', about: 'The member’s total XP.', level: true },
  {
    name: 'xp.next',
    about: 'The total XP the next level needs.',
    level: true,
  },
  {
    name: 'xp.left',
    about: 'How much more XP they need for the next level.',
    level: true,
  },
  {
    name: 'rank',
    about: 'Their place on the leaderboard, like #3.',
    level: true,
  },
  {
    name: 'progress.bar',
    about: 'A bar of how far they are into this level, like ▰▰▰▰▱▱▱▱▱▱.',
    level: true,
  },
  {
    name: 'progress.percent',
    about: 'How far they are into this level, like 40%.',
    level: true,
  },
  {
    name: 'messages',
    about: 'How many messages have earned them XP.',
    level: true,
  },
  {
    name: 'voice.time',
    about: 'How long they’ve earned XP in voice, like 3h 20m.',
    level: true,
  },
  {
    name: 'reward.role',
    about:
      'Mentions the reward role this level gave, without pinging, or nothing.',
    level: true,
  },
  {
    name: 'crate.range',
    about: 'How much XP an XP crate can hold, like 50–150 XP.',
    level: true,
  },
  {
    name: 'crate.ends',
    about: 'When an XP crate vanishes if nobody opens it, as a relative time.',
    level: true,
  },
];

/**
 * Fills {variables} in. A variable with nothing to fill it (no member when
 * staff post from the dashboard, say) is sent empty; text in braces that
 * isn't a variable is left as written. {separator} only
 * means something in Components V2 and is dropped elsewhere.
 */
export function fillVariables(text: string, ctx: { now: number } & StudioVars) {
  const unix = Math.floor(ctx.now / 1000);
  const ago = (at: number | undefined) =>
    at === undefined ? undefined : `<t:${Math.floor(at / 1000)}:R>`;
  const values: Record<string, string | undefined> = {
    user: ctx.user && `<@${ctx.user.id}>`,
    'user.name': ctx.user?.name,
    'user.id': ctx.user?.id,
    'user.avatar': ctx.user?.avatar,
    'user.created': ago(ctx.user?.createdAt),
    'user.joined': ago(ctx.user?.joinedAt),
    server: ctx.server?.name,
    'server.members': ctx.server?.members.toLocaleString('en-US'),
    'server.icon': ctx.server?.icon,
    'server.boosts': ctx.server?.boosts?.toLocaleString('en-US'),
    'server.level': ctx.server?.level?.toString(),
    channel: ctx.channel && `<#${ctx.channel}>`,
    role: ctx.role && `<@&${ctx.role.id}>`,
    'role.name': ctx.role?.name,
    'role.id': ctx.role?.id,
    'role-list': ctx.roleList,
    date: `<t:${unix}:D>`,
    time: `<t:${unix}:t>`,
    separator: '',
    ...ctx.extra,
  };
  // A variable this message can't fill (like {role} outside a reaction
  // role) is sent empty; braces that aren't a variable stay as written.
  return text.replace(
    /\{([a-z.-]+)\}/g,
    (whole, name: string) =>
      values[name] ?? (known.has(name) || name in values ? '' : whole),
  );
}
const known = new Set(studioVariables.map((v) => v.name));
export const IS_COMPONENTS_V2 = 1 << 15;

/** Whether a message places a suggestion's vote buttons itself. */
export const hasVoteButtons = (m: StudioMessage) =>
  m.components.some((c) => c.type === 'button' && !!c.vote);

/** Vote buttons dressed as the suggestion says, or left out off one. */
function withVotes(m: StudioMessage, votes: StudioVars['votes']) {
  if (!hasVoteButtons(m)) return m;
  const components = m.components.flatMap((c): StudioComponent[] =>
    c.type !== 'button' || !c.vote
      ? [c]
      : votes
        ? [{ ...c, ...votes[c.vote], link: false, actions: [] }]
        : [],
  );
  const kept = new Set(components.map((c) => c.id));
  return {
    ...m,
    components,
    v2: {
      ...m.v2,
      place: m.v2.place.filter((p) => kept.has(p.id) || p.id === 'gallery'),
    },
  };
}

/** The message body for Discord's create/edit message endpoints. */
export function studioPayload(
  input: StudioMessage,
  /** `raw` leaves {variables} as written, for showing and editing the JSON. */
  ctx: { now: number; raw?: boolean } & StudioVars,
) {
  const m = withVotes(normaliseStudio(input), ctx.votes);
  const closed = !!ctx.votes?.closed;
  // Mentions in Studio messages are shown but never ping anyone by surprise.
  const allowed_mentions = { parse: [] as string[] };
  const fill = (text: string) => (ctx.raw ? text : fillVariables(text, ctx));
  // A picture variable with nothing to fill it leaves the picture out.
  const pic = (url: string) => {
    if (!url || ctx.raw) return url;
    const out = fillVariables(url, ctx);
    return https(out) ? out : '';
  };
  if (m.layout === 'v2') {
    const v = m.v2;
    const byId = new Map(m.components.map((c) => [c.id, c]));
    const pictures = v.gallery
      .map((i) => ({ ...i, url: pic(i.url) }))
      .filter((i) => i.url);
    const gallery = {
      type: 12,
      items: pictures.map((i) => ({
        media: { url: i.url },
        ...(i.description ? { description: i.description } : {}),
      })),
    };
    // Items in one place, in order: rows of buttons and menus, and the gallery.
    const items = (slot: V2Slot) => {
      const out: object[] = [];
      let run: StudioComponent[] = [];
      const flushRun = () => {
        out.push(...componentsPayload(run, fill, closed));
        run = [];
      };
      for (const p of placedIn(v.place, slot)) {
        const c = byId.get(p.id);
        if (c) run.push(c);
        else if (p.id === 'gallery' && pictures.length) {
          flushRun();
          out.push(gallery);
        }
      }
      flushRun();
      return out;
    };
    // The container: the text line by line, cut where {separator} is or
    // where something is placed, with buttons beside the lines they're on.
    const inside: object[] = [...items({ at: 'line', line: -1 })];
    let chunk: string[] = [];
    const thumbUrl = pic(v.thumbnail);
    let thumbnail = !!thumbUrl;
    const flush = () => {
      const text = chunk.join('\n').replace(/^\n+|\n+$/g, '');
      chunk = [];
      if (!text.trim()) return;
      const display = { type: 10, content: fill(text) };
      // The thumbnail sits beside the first stretch of text.
      inside.push(
        thumbnail
          ? {
              type: 9,
              components: [display],
              accessory: { type: 11, media: { url: thumbUrl } },
            }
          : display,
      );
      thumbnail = false;
    };
    v2Lines(v.text).forEach((line, i) => {
      const beside = placedIn(v.place, { at: 'beside', line: i })
        .map((p) => byId.get(p.id))
        .find((c) => c?.type === 'button');
      const pieces = line.split('{separator}');
      pieces.forEach((piece, j) => {
        if (j > 0) {
          flush();
          inside.push({ type: 14, divider: true, spacing: 1 });
        }
        if (!beside || j < pieces.length - 1) chunk.push(piece);
      });
      if (beside) {
        // The line (its last part, after any divider) gets the button.
        flush();
        inside.push({
          type: 9,
          components: [
            { type: 10, content: fill(pieces.at(-1)!.trim()) || '\u200b' },
          ],
          accessory: componentsPayload([beside], fill, closed)[0]!
            .components[0],
        });
      }
      const after = items({ at: 'line', line: i });
      if (after.length) {
        flush();
        inside.push(...after);
      }
    });
    flush();
    return {
      flags: IS_COMPONENTS_V2,
      // Rows of buttons and galleries can also sit outside the container.
      components: [
        ...items({ at: 'above' }),
        ...(inside.length
          ? [
              {
                type: 17,
                accent_color: v.shuffle ? shuffledColour() : colour(v.accent),
                components: inside,
              },
            ]
          : []),
        ...items({ at: 'below' }),
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
              ...(pic(e.authorIcon) ? { icon_url: pic(e.authorIcon) } : {}),
              ...(e.authorUrl ? { url: e.authorUrl } : {}),
            },
          }
        : {}),
      ...(e.title.trim() ? { title: fill(e.title) } : {}),
      ...(e.description.trim() ? { description: fill(e.description) } : {}),
      color: e.shuffle ? shuffledColour() : colour(e.color),
      ...(pic(e.image) ? { image: { url: pic(e.image) } } : {}),
      ...(pic(e.thumbnail) ? { thumbnail: { url: pic(e.thumbnail) } } : {}),
      ...(e.footer.trim()
        ? {
            footer: {
              text: fill(e.footer),
              ...(pic(e.footerIcon) ? { icon_url: pic(e.footerIcon) } : {}),
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
    components: componentsPayload(m.components, fill, closed),
    allowed_mentions,
  };
}

/** A Discord message link: https://discord.com/channels/<server>/<channel>/<message>. */
export function parseMessageLink(link: string) {
  const m = link
    .trim()
    .match(
      /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{1,25})\/(\d{1,25})\/(\d{1,25})\/?$/,
    );
  return m ? { guildId: m[1]!, channelId: m[2]!, messageId: m[3]! } : null;
}
