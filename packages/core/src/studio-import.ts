import {
  IS_COMPONENTS_V2,
  normaliseStudio,
  type GalleryImage,
  type MenuOption,
  type StudioComponent,
  type StudioEmbed,
  type StudioMessage,
  type V2Place,
  type V2Slot,
} from './studio-format.ts';

/**
 * Reads a Discord message body (the JSON Message Studio shows, or one made
 * in another tool) back into a Studio message. Buttons and menus Sparko
 * made keep what they do; anything else Studio can't show is refused with
 * a reason rather than dropped.
 */

type Json = Record<string, unknown>;
type Result = { message: StudioMessage } | { problem: string };

const obj = (v: unknown): v is Json =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);
const hexOf = (n: unknown) =>
  typeof n === 'number' && n >= 0 && n <= 0xffffff
    ? `#${n.toString(16).padStart(6, '0').toUpperCase()}`
    : '#FACC15';
const url = (v: unknown) => (obj(v) ? text(v.url) : '');
const emojiOf = (v: unknown) => {
  if (!obj(v)) return '';
  if (v.id) return `<${v.animated ? 'a' : ''}:${text(v.name)}:${String(v.id)}>`;
  return text(v.name);
};

let seq = 0;
const freshId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

class Refused extends Error {}
const refuse = (why: string): never => {
  throw new Refused(why);
};

const colours = { 1: 'blurple', 2: 'grey', 3: 'green', 4: 'red' } as const;

/** A button or menu, keeping what Sparko's own ones do. */
function componentOf(c: Json, current: StudioMessage): StudioComponent {
  const custom = text(c.custom_id).match(/^sp:(b|m):([\w-]{1,40})$/);
  const old = custom
    ? current.components.find((x) => x.id === custom[2])
    : undefined;
  if (c.type === 2) {
    const style = Number(c.style);
    if (style !== 5 && !(style in colours))
      refuse('Studio makes buttons in blurple, grey, green, red, or links.');
    return {
      id: old?.id ?? (custom?.[2] || freshId('b')),
      type: 'button',
      label: text(c.label),
      emoji: emojiOf(c.emoji),
      colour: style === 5 ? 'grey' : colours[style as keyof typeof colours],
      link: style === 5,
      url: style === 5 ? text(c.url) : '',
      actions: old?.type === 'button' && style !== 5 ? old.actions : [],
    };
  }
  if (c.type === 3) {
    const before = old?.type === 'menu' ? old.options : [];
    return {
      id: old?.id ?? (custom?.[2] || freshId('m')),
      type: 'menu',
      placeholder: text(c.placeholder),
      multiple: Number(c.max_values ?? 1) > 1,
      options: list(c.options)
        .filter(obj)
        .map(
          (o): MenuOption => ({
            id: /^[\w-]{1,40}$/.test(text(o.value))
              ? text(o.value)
              : freshId('o'),
            label: text(o.label),
            description: text(o.description),
            emoji: emojiOf(o.emoji),
            actions: before.find((b) => b.id === o.value)?.actions ?? [],
          }),
        ),
    };
  }
  return refuse(
    'Studio makes buttons and text menus; other kinds of menus aren’t supported.',
  );
}

const rowOf = (row: unknown, current: StudioMessage) => {
  if (!obj(row) || row.type !== 1)
    refuse('Buttons and menus go in action rows (type 1).');
  return list((row as Json).components)
    .filter(obj)
    .map((c) => componentOf(c, current));
};

function embedOf(e: Json, i: number): StudioEmbed {
  const author = obj(e.author) ? e.author : {};
  const footer = obj(e.footer) ? e.footer : {};
  return {
    id: `e${i + 1}`,
    author: text(author.name),
    authorIcon: text(author.icon_url),
    authorUrl: text(author.url),
    title: text(e.title),
    description: text(e.description),
    color: hexOf(e.color),
    image: url(e.image),
    thumbnail: url(e.thumbnail),
    footer: text(footer.text),
    footerIcon: text(footer.icon_url),
    timestamp: !!e.timestamp,
    fields: list(e.fields)
      .filter(obj)
      .map((f, k) => ({
        id: `f${k + 1}`,
        name: text(f.name) === '​' ? '' : text(f.name),
        value: text(f.value) === '​' ? '' : text(f.value),
        inline: !!f.inline,
      })),
  };
}

// Pictures keep the ids they had, so editing the JSON doesn't redraw them.
const galleryOf = (g: Json, before: GalleryImage[]): GalleryImage[] =>
  list(g.items)
    .filter(obj)
    .map((item, i) => ({
      id: before[i]?.id ?? freshId('i'),
      url: url(item.media),
      description: text(item.description),
    }));

/** Reads a Discord message body into the message being edited. */
export function fromDiscord(input: unknown, current: StudioMessage): Result {
  try {
    if (!obj(input)) refuse('The JSON must be one message object, in { }.');
    const body = input as Json;
    const top = list(body.components);
    const v2 =
      (Number(body.flags ?? 0) & IS_COMPONENTS_V2) !== 0 ||
      top.some((c) => obj(c) && c.type !== 1);
    if (!v2) {
      const embeds = list(body.embeds).filter(obj);
      if (embeds.length > 10) refuse('A message holds up to 10 embeds.');
      return {
        message: normaliseStudio({
          ...current,
          layout: 'embed',
          content: text(body.content),
          embeds: embeds.map(embedOf),
          components: top.flatMap((r) => rowOf(r, current)),
        }),
      };
    }

    const components: StudioComponent[] = [];
    const place: V2Place[] = [];
    let gallery: GalleryImage[] | null = null;
    const putGallery = (g: Json, slot: V2Slot) => {
      if (gallery) refuse('Studio holds one image gallery per message.');
      gallery = galleryOf(g, current.v2.gallery);
      place.push({ id: 'gallery', slot });
    };
    const putRow = (row: unknown, slot: V2Slot) => {
      for (const c of rowOf(row, current)) {
        components.push(c);
        place.push({ id: c.id, slot });
      }
    };

    const containers = top.filter((c) => obj(c) && c.type === 17);
    if (containers.length > 1)
      refuse('Studio holds one container per message.');
    const box = containers[0] as Json | undefined;
    const lines: string[] = [];
    let thumbnail = '';
    const at = (): V2Slot => ({ at: 'line', line: lines.length - 1 });
    for (const c of list(box?.components)) {
      if (!obj(c)) continue;
      if (c.type === 10) lines.push(...text(c.content).split('\n'));
      else if (c.type === 14) lines.push('{separator}');
      else if (c.type === 1) putRow(c, at());
      else if (c.type === 12) putGallery(c, at());
      else if (c.type === 9) {
        lines.push(
          ...list(c.components)
            .filter(obj)
            .map((t) => text(t.content))
            .join('\n')
            .split('\n'),
        );
        const side = obj(c.accessory) ? c.accessory : null;
        if (side?.type === 11 && !thumbnail) thumbnail = url(side.media);
        else if (side?.type === 2) {
          const b = componentOf(side, current);
          components.push(b);
          place.push({
            id: b.id,
            slot: { at: 'beside', line: lines.length - 1 },
          });
        } else if (side) refuse('Studio shows one thumbnail per message.');
      } else
        refuse(
          'Inside a container, Studio reads text, separators, sections, galleries and rows of buttons.',
        );
    }
    // Rows and galleries outside the container sit above or below it.
    const where = box ? top.indexOf(box) : top.length;
    top.forEach((c, i) => {
      if (!obj(c) || c === box) return;
      const slot: V2Slot = { at: i < where ? 'above' : 'below' };
      if (c.type === 1) putRow(c, slot);
      else if (c.type === 12) putGallery(c, slot);
      else
        refuse(
          'Outside the container, Studio reads rows of buttons and image galleries; put text inside it.',
        );
    });
    return {
      message: normaliseStudio({
        ...current,
        layout: 'v2',
        components,
        v2: {
          accent: box ? hexOf(box.accent_color) : current.v2.accent,
          text: lines.join('\n'),
          thumbnail,
          gallery: gallery ?? [],
          place,
        },
      }),
    };
  } catch (e) {
    if (e instanceof Refused) return { problem: e.message };
    throw e;
  }
}

/** The line a JSON.parse error points at, if the browser says. */
export function jsonErrorLine(source: string, error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const line = message.match(/line (\d+)/);
  if (line) return Number(line[1]);
  const position = message.match(/position (\d+)/);
  if (position) return source.slice(0, Number(position[1])).split('\n').length;
  return null;
}
