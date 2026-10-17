import { Fragment, useState, type CSSProperties } from 'react';
import { cx, renderDiscordText } from '../../ui';
import {
  componentRows,
  placeOf,
  placedIn,
  splitSeparatorLines,
  v2Lines,
  type GalleryImage,
  type StudioComponent,
  type StudioMessage,
  type StudioV2,
  type V2Place,
  type V2Slot,
} from '../../data';
import { ColourPicker } from './ColourPicker';
import { ComponentItem, TrashButton, type ItemDrag } from './ComponentsEditor';
import {
  EditText,
  MaskIcon,
  UrlPopover,
  follower,
  measure,
  moveItem,
  slideFrom,
  useReorder,
  previewPicture,
  useCanvasLocked,
} from './EditorBits';
import { newId } from './parts';
import addImage from '../../../../../design-system/assets/icons/add-image-button.png';
import colourWheel from '../../../../../design-system/assets/icons/color-picker.png';
import dragIcon from '../../../../../design-system/assets/icons/drag.png';

/**
 * A Components V2 message, edited in place: one container with a colour
 * bar, its text ({separator} draws a divider), a thumbnail and an image
 * gallery. Each button and menu, and the gallery, can be dragged anywhere:
 * between lines of the text, a button beside a line, or above or below the
 * container. Everything starts at the end of the container.
 */

export const MAX_GALLERY = 10;
export const newImage = (): GalleryImage => ({
  id: newId(),
  url: '',
  description: '',
});

/** Discord's markdown on one line of V2 text: # headings, **bold**, mentions. */
function renderMarkdown(line: string) {
  const h = line.match(/^(#{1,3}) (.*)$/);
  if (h)
    return (
      <div className={`dc-h${h[1]!.length}`}>{renderDiscordText(h[2]!)}</div>
    );
  return <div className="dc-line">{line ? renderDiscordText(line) : ' '}</div>;
}
/**
 * Lines of the text as Discord shows them, each marked with its number so
 * things dragged over the text know which line they're at.
 */
function renderLines(text: string, first: number) {
  const lines = text.split('\n');
  // Discord drops empty lines at the start and end of each stretch of text
  // (at a divider, or where something sits between lines); so does this.
  const edge = (k: number, step: number) => {
    for (let i = k + step; i >= 0 && i < lines.length; i += step) {
      if (lines[i]!.includes('{separator}')) return true;
      if (lines[i] !== '') return false;
    }
    return true;
  };
  const dropped = (k: number) => lines[k] === '' && (edge(k, -1) || edge(k, 1));
  // A stretch of nothing but empty lines still shows, so it can be clicked.
  const all = lines.every((_, k) => dropped(k));
  return lines.map((line, k) => (
    <div
      key={k}
      className={cx('sp-v2-line', !all && dropped(k) && 'is-dropped')}
      data-line={first + k}
    >
      {line === ''
        ? renderMarkdown('')
        : line.split('{separator}').map((piece, j) => (
            <Fragment key={j}>
              {j > 0 && <hr className="dc-separator" />}
              {piece && renderMarkdown(piece)}
            </Fragment>
          ))}
    </div>
  ));
}

/**
 * How Discord lays out a gallery: rows of one, two or three, with three
 * pictures shown as one large and two small.
 */
const rowsFor: Record<number, number[]> = {
  1: [1],
  2: [2],
  4: [2, 2],
  5: [2, 3],
  6: [3, 3],
  7: [1, 3, 3],
  8: [2, 3, 3],
  9: [3, 3, 3],
  10: [1, 3, 3, 3],
};
export function galleryCells(count: number) {
  if (count === 3)
    return [
      { col: 4, row: 6 },
      { col: 2, row: 3 },
      { col: 2, row: 3 },
    ];
  return (rowsFor[count] ?? []).flatMap((n) =>
    Array.from({ length: n }, () => ({
      col: 6 / n,
      row: n === 1 ? 6 : n === 2 ? 4 : 3,
    })),
  );
}

function Gallery({
  images,
  serverId,
  openId,
  onChange,
}: {
  images: GalleryImage[];
  serverId: string;
  /** A picture that was just added opens its link box. */
  openId: string | null;
  onChange: (images: GalleryImage[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(openId);
  const [fading, setFading] = useState<string | null>(null);
  const { list, ...reorder } = useReorder({
    mode: 'grid',
    fit: true,
    onMove: (from, to) => onChange(moveItem(images, from, to)),
  });
  const cells = galleryCells(images.length);
  return (
    <div
      ref={list}
      className={cx(
        'sp-gallery',
        // Discord shows one picture whole; several are cropped to the grid.
        images.length === 1 && images[0]!.url && 'sp-gallery--one',
      )}
      aria-label="Image gallery"
    >
      {images.map((img, i) => (
        <div
          key={img.id}
          {...reorder.item(i, img.id)}
          data-issue={`image:${img.id}`}
          className={cx(
            'sp-gallery__cell',
            reorder.dropClass(i, images.length),
            fading === img.id && 'is-fading',
          )}
          style={{
            gridColumn: `span ${cells[i]?.col ?? 6}`,
            gridRow: `span ${cells[i]?.row ?? 6}`,
          }}
        >
          <button
            type="button"
            className={cx('sp-gallery__face', !img.url && 'is-empty')}
            aria-label={
              img.url
                ? `Change image ${i + 1}`
                : `Add a link for image ${i + 1}`
            }
            onClick={() => setOpen(img.id)}
          >
            {img.url ? (
              <img src={previewPicture(img.url)} alt={img.description} />
            ) : (
              <MaskIcon src={addImage} size={44} />
            )}
          </button>
          <button
            type="button"
            className="sp-handle sp-gallery__handle"
            aria-label={`Move image ${i + 1}. Drag it, or use the arrow keys.`}
            disabled={images.length < 2}
            onPointerDown={reorder.start(i)}
            onKeyDown={reorder.keys(i, images.length)}
          >
            <MaskIcon src={dragIcon} size={14} />
          </button>
          <TrashButton
            label={`Remove image ${i + 1}`}
            className="sp-gallery__trash"
            onHover={(on) => setFading(on ? img.id : null)}
            onClick={() => onChange(images.filter((x) => x.id !== img.id))}
          />
          {open === img.id && (
            <UrlPopover
              serverId={serverId}
              title={`Image ${i + 1} URL`}
              value={img.url}
              onChange={(url) =>
                onChange(
                  images.map((x) => (x.id === img.id ? { ...x, url } : x)),
                )
              }
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const same = (a: V2Slot, b: V2Slot) =>
  a.at === b.at &&
  (a.at === 'above' ||
    a.at === 'below' ||
    a.line === (b as { line: number }).line);

/** Where a dragged item would land: a place, and the item it goes before. */
type Target = { slot: V2Slot; before: string | null };

/**
 * Moving buttons, menus and the gallery around a V2 message: drag one by
 * its dots and a line (or a box beside a line of text) shows where it will
 * land; let go and everything slides to its new place. With the keyboard,
 * ↑ ↓ move it a place up or down and ← → swap it with its neighbours.
 */
function usePlaceDrag({
  place,
  kindOf,
  lineCount,
  onPlace,
}: {
  place: V2Place[];
  kindOf: (id: string) => 'button' | 'menu' | 'gallery';
  lineCount: number;
  onPlace: (place: V2Place[]) => void;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    mark: CSSProperties | null;
  } | null>(null);
  const els = () =>
    Array.from(
      root?.querySelectorAll<HTMLElement>('[data-key], [data-line]') ?? [],
    );
  const keyOf = (el: HTMLElement) =>
    el.dataset.key ?? `line:${el.dataset.line}`;
  const itemEl = (id: string) =>
    root?.querySelector<HTMLElement>(
      `[data-key="${id.replace(/["\\]/g, '\\$&')}"]`,
    ) ?? null;

  /** Puts an item in a place (before another, or at the end of it). */
  const commit = (id: string, t: Target) => {
    let rest = place.filter((p) => p.id !== id);
    // A line has one button beside it; one already there moves under it.
    const slot = t.slot;
    if (slot.at === 'beside') {
      const line = slot.line;
      rest = rest.map((p) =>
        same(p.slot, slot) ? { ...p, slot: { at: 'line', line } } : p,
      );
    }
    let at = t.before ? rest.findIndex((p) => p.id === t.before) : -1;
    if (at < 0) {
      const last = rest.findLastIndex((p) => same(p.slot, t.slot));
      at = last >= 0 ? last + 1 : rest.length;
    }
    rest.splice(at, 0, { id, slot: t.slot });
    const before = measure(els(), keyOf);
    onPlace(rest);
    slideFrom(els, before, { keyOf });
  };

  const targetAt = (x: number, y: number, id: string): Target | null => {
    const box = root
      ?.querySelector<HTMLElement>('.sp-v2')
      ?.getBoundingClientRect();
    if (!root || !box) return null;
    const kind = kindOf(id);
    // Over another item: go before it, or after it.
    const under = document
      .elementsFromPoint(x, y)
      .map((el) => el.closest<HTMLElement>('[data-key]'))
      .find((el) => el && root.contains(el) && el.dataset.key !== id);
    const over = under && place.find((p) => p.id === under.dataset.key);
    if (under && over) {
      let slot = over.slot;
      if (slot.at === 'beside' && kind !== 'button')
        slot = { at: 'line', line: slot.line };
      const r = under.getBoundingClientRect();
      const first =
        kindOf(over.id) === 'button'
          ? x < r.left + r.width / 2
          : y < r.top + r.height / 2;
      if (first) return { slot, before: over.id };
      const inSlot = place.filter(
        (p) => p.id !== id && same(p.slot, over.slot),
      );
      const next = inSlot[inSlot.findIndex((p) => p.id === over.id) + 1];
      return { slot, before: next?.id ?? null };
    }
    if (y < box.top) return { slot: { at: 'above' }, before: null };
    if (y > box.bottom) return { slot: { at: 'below' }, before: null };
    // Over the text: between lines, or beside one (buttons only).
    let line = -1;
    for (const el of Array.from(
      root.querySelectorAll<HTMLElement>('[data-line]'),
    )) {
      const r = el.getBoundingClientRect();
      const n = Number(el.dataset.line);
      if (y >= r.top && y <= r.bottom) {
        const right = (el.closest('.sp-v2__body') ?? el).getBoundingClientRect()
          .right;
        if (kind === 'button' && x > right - 140)
          return { slot: { at: 'beside', line: n }, before: null };
        return {
          slot: { at: 'line', line: y < r.top + r.height / 2 ? n - 1 : n },
          before: null,
        };
      }
      if (r.bottom <= y) line = n;
    }
    return { slot: { at: 'line', line }, before: null };
  };

  /** The line or box that shows where a drop would land. */
  const markFor = (t: Target, id: string): CSSProperties | null => {
    if (!root) return null;
    const base = root.getBoundingClientRect();
    const at = (r: DOMRect, s: Partial<Record<string, number>>) => ({
      left: (s.left ?? r.left) - base.left,
      top: (s.top ?? r.top) - base.top,
      width: s.width ?? r.width,
      height: s.height ?? 3,
    });
    const kind = kindOf(id);
    if (t.slot.at === 'beside') {
      const lineEl = root.querySelector(`[data-line="${t.slot.line}"]`);
      const body = lineEl?.closest('.sp-v2__body') ?? lineEl;
      if (!lineEl || !body) return null;
      const r = lineEl.getBoundingClientRect();
      const right = body.getBoundingClientRect().right;
      return {
        ...at(r, { left: right - 120, width: 120, height: r.height }),
        borderRadius: 6,
        background: 'transparent',
        outline: '2px dashed var(--sp-dc-link)',
      };
    }
    if (t.before) {
      const el = itemEl(t.before);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return kindOf(t.before) === 'button' && kind === 'button'
        ? at(r, { left: r.left - 6, width: 3, height: r.height })
        : at(r, { top: r.top - 6 });
    }
    const inSlot = place.filter((p) => p.id !== id && same(p.slot, t.slot));
    const last = inSlot.at(-1);
    const lastEl = last && itemEl(last.id);
    if (lastEl) {
      const r = lastEl.getBoundingClientRect();
      return kindOf(last.id) === 'button' && kind === 'button'
        ? at(r, { left: r.right + 3, width: 3, height: r.height })
        : at(r, { top: r.bottom + 4 });
    }
    const box = root.querySelector('.sp-v2')?.getBoundingClientRect();
    const body = root.querySelector('.sp-v2__body')?.getBoundingClientRect();
    if (!box || !body) return null;
    if (t.slot.at === 'above') return at(box, { top: box.top - 6 });
    if (t.slot.at === 'below') return at(box, { top: box.bottom + 3 });
    const lineEl =
      t.slot.line >= 0
        ? root.querySelector(`[data-line="${t.slot.line}"]`)
        : null;
    const r = lineEl?.getBoundingClientRect();
    return at(body, { top: r ? r.bottom + 1 : body.top - 2 });
  };

  const start = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    const id = place[i]?.id;
    const el = id && itemEl(id);
    if (e.button !== 0 || !id || !el) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let target: Target | null = null;
    setDrag({ id, mark: null });
    Object.assign(el.style, { zIndex: '6', pointerEvents: 'none' });
    // Follows the pointer, and keeps up when the page scrolls mid-drag.
    const follow = follower(el, x0, y0);
    const update = (x?: number, y?: number) => {
      follow.to(x, y);
      const p = follow.pointer();
      target = targetAt(p.x, p.y, id);
      setDrag({ id, mark: target && markFor(target, id) });
    };
    const move = (ev: PointerEvent) => update(ev.clientX, ev.clientY);
    const scroll = () => update();
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('scroll', scroll, true);
      setDrag(null);
      const before = measure(els(), keyOf);
      Object.assign(el.style, { zIndex: '', pointerEvents: '', transform: '' });
      if (target) commit(id, target);
      else slideFrom(els, before, { keyOf });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('scroll', scroll, true);
  };

  // Every place an item can go, top to bottom, for the arrow keys.
  const stops = (id: string): V2Slot[] => [
    { at: 'above' },
    { at: 'line', line: -1 },
    ...Array.from({ length: lineCount }, (_, n): V2Slot[] =>
      kindOf(id) === 'button'
        ? [
            { at: 'beside', line: n },
            { at: 'line', line: n },
          ]
        : [{ at: 'line', line: n }],
    ).flat(),
    { at: 'below' },
  ];
  const keys = (i: number) => (e: React.KeyboardEvent<HTMLElement>) => {
    const p = place[i];
    if (!p) return;
    const inSlot = place.filter((q) => same(q.slot, p.slot));
    const k = inSlot.findIndex((q) => q.id === p.id);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const other = inSlot[k + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (!other) return;
      e.preventDefault();
      commit(
        p.id,
        e.key === 'ArrowLeft'
          ? { slot: p.slot, before: other.id }
          : { slot: p.slot, before: inSlot[k + 2]?.id ?? null },
      );
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const all = stops(p.id);
      const at = all.findIndex((s) => same(s, p.slot));
      const next = all[at + (e.key === 'ArrowUp' ? -1 : 1)];
      if (!next) return;
      e.preventDefault();
      commit(p.id, { slot: next, before: null });
    }
  };

  const drags: ItemDrag = {
    item: (i: number, key?: string) => ({
      'data-index': i,
      ...(key ? { 'data-key': key } : {}),
    }),
    start,
    keys: (i: number) => keys(i),
    dropClass: (i: number) =>
      drag && place[i]?.id === drag.id ? 'is-dragged' : null,
  };
  return { root: setRoot, drags, mark: drag?.mark ?? null };
}

export function ContainerCanvas({
  message,
  serverId,
  onChange,
  focusId,
}: {
  message: StudioMessage;
  serverId: string;
  onChange: (patch: Partial<StudioMessage>) => void;
  /** Something just added: a button, a menu or a picture. */
  focusId: string | null;
}) {
  const v = message.v2;
  const [pop, setPop] = useState<'colour' | 'thumbnail' | null>(null);
  const locked = useCanvasLocked();
  const edit = (patch: Partial<StudioV2>) =>
    onChange({ v2: { ...v, ...patch } });
  const components = message.components;
  const byId = new Map(components.map((c) => [c.id, c]));
  const place = placeOf(v, components);
  const lines = v2Lines(v.text);
  const kindOf = (id: string) => byId.get(id)?.type ?? 'gallery';
  const { root, drags, mark } = usePlaceDrag({
    place,
    kindOf,
    lineCount: lines.length,
    onPlace: (next) => edit({ place: next }),
  });
  const addPicture = () => {
    if (v.gallery.length >= MAX_GALLERY) return;
    edit({ gallery: [...v.gallery, newImage()] });
  };
  const count = place.length + 2;
  const indexOf = (id: string) => place.findIndex((p) => p.id === id);

  const button = (c: StudioComponent) => (
    <ComponentItem
      key={c.id}
      component={c}
      index={indexOf(c.id)}
      count={count}
      reorder={drags}
      startOpen={c.id === focusId}
      onChange={(next) =>
        onChange({
          components: components.map((x) => (x.id === c.id ? next : x)),
        })
      }
      onRemove={() =>
        onChange({ components: components.filter((x) => x.id !== c.id) })
      }
    />
  );

  /** What sits in one place: rows of buttons and menus, and the gallery. */
  const slotView = (slot: V2Slot) => {
    const here = placedIn(place, slot);
    if (!here.length) return null;
    const blocks: React.ReactNode[] = [];
    let run: StudioComponent[] = [];
    const flush = () => {
      for (const row of componentRows(run))
        blocks.push(
          <div
            key={row[0]!.id}
            className={cx(
              'dc-row',
              row[0]!.type === 'menu' && 'sp-comps__menu-row',
            )}
          >
            {row.map(button)}
          </div>,
        );
      run = [];
    };
    for (const p of here) {
      const c = byId.get(p.id);
      if (c) run.push(c);
      else if (p.id === 'gallery' && v.gallery.length) {
        flush();
        const i = indexOf('gallery');
        blocks.push(
          <div
            key="gallery"
            {...drags.item(i, 'gallery')}
            data-issue="gallery"
            className={cx('sp-v2-gallery', drags.dropClass(i))}
          >
            <button
              type="button"
              className="sp-handle sp-v2-gallery__handle"
              aria-label="Move the gallery. Drag it, or use the arrow keys."
              onPointerDown={drags.start(i)}
              onKeyDown={drags.keys(i, count)}
            >
              <MaskIcon src={dragIcon} size={14} />
            </button>
            <Gallery
              images={v.gallery}
              serverId={serverId}
              openId={focusId}
              onChange={(gallery) => edit({ gallery })}
            />
          </div>,
        );
      }
    }
    flush();
    return blocks.length ? (
      <div className="dc-components sp-comps sp-v2-slot">{blocks}</div>
    ) : null;
  };

  // The text is edited in stretches between the things placed in it; a
  // line with a button beside it is a stretch of its own.
  const besideAt = (n: number) =>
    placedIn(place, { at: 'beside', line: n })
      .map((p) => byId.get(p.id))
      .find((c) => c?.type === 'button');
  // A divider ends a stretch too, as it ends a section in Discord: the
  // thumbnail or a button sits beside the text before it, not after.
  const divides = (n: number) => !!lines[n]?.includes('{separator}');
  const stretches: { from: number; to: number }[] = [];
  lines.forEach((_, n) => {
    const prev = stretches.at(-1);
    const joins =
      prev &&
      prev.to === n - 1 &&
      !besideAt(n) &&
      !besideAt(n - 1) &&
      !divides(n) &&
      !divides(n - 1) &&
      !placedIn(place, { at: 'line', line: n - 1 }).length;
    if (joins) prev.to = n;
    else stretches.push({ from: n, to: n });
    // A divider with nothing written after it, before the end or the next
    // divider, still gets a Description box to type into.
    if (divides(n) && (n === lines.length - 1 || divides(n + 1)))
      stretches.push({ from: n + 1, to: n });
  });
  /** Rewrites lines `from`–`to`, keeping everything placed after them in step. */
  const editLines = (from: number, to: number, text: string) => {
    const added = text.split('\n').length - (to - from + 1);
    const next = [...lines.slice(0, from), text, ...lines.slice(to + 1)].join(
      '\n',
    );
    edit({
      text: next,
      place: place.map((p) =>
        (p.slot.at === 'line' && p.slot.line >= to) ||
        (p.slot.at === 'beside' && p.slot.line > to)
          ? { ...p, slot: { ...p.slot, line: p.slot.line + added } }
          : p,
      ),
    });
  };
  const thumbAt =
    stretches.find(
      (s) =>
        !besideAt(s.from) &&
        lines
          .slice(s.from, s.to + 1)
          .some((l) => l.replace('{separator}', '').trim()),
    )?.from ?? -2;
  const thumb = (
    <div className="sp-embed__thumb sp-v2-text__thumb" data-issue="thumbnail">
      <button
        type="button"
        className={cx(
          'sp-embed-pic sp-embed-pic--thumb',
          !v.thumbnail && 'is-empty',
        )}
        aria-label={v.thumbnail ? 'Change the thumbnail' : 'Add a thumbnail'}
        onClick={() => setPop('thumbnail')}
      >
        {v.thumbnail ? (
          <img src={previewPicture(v.thumbnail)} alt="" />
        ) : (
          <MaskIcon src={addImage} size={40} />
        )}
      </button>
      {pop === 'thumbnail' && (
        <UrlPopover
          serverId={serverId}
          title="Thumbnail URL"
          value={v.thumbnail}
          onChange={(thumbnail) => edit({ thumbnail })}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );

  return (
    <div className="dc-chat sp-canvas">
      <div className="dc-msg">
        <span className="dc-avatar" aria-hidden="true">
          S
        </span>
        <div className="dc-head">
          <span className="dc-name">Sparko</span>
          <span className="dc-tag">App</span>
          <span className="dc-time">Today at 18:42</span>
        </div>
        <div ref={root} className="sp-v2-message">
          {slotView({ at: 'above' })}
          <div
            className={cx(
              'sp-embed-wrap sp-v2-wrap',
              v.shuffle && 'is-shuffle',
            )}
            style={{ '--dc-color': v.accent } as CSSProperties}
          >
            <div className="sp-embed-gutter sp-v2-gutter">
              {!locked && (
                <button
                  type="button"
                  className="sp-embed-tool sp-v2-add"
                  aria-label="Add an image to the gallery"
                  disabled={v.gallery.length >= MAX_GALLERY}
                  title={
                    v.gallery.length >= MAX_GALLERY
                      ? 'A gallery holds up to 10 images'
                      : undefined
                  }
                  onClick={addPicture}
                >
                  <MaskIcon src={addImage} size={18} />
                </button>
              )}
              <button
                type="button"
                className="sp-embed-wheel"
                aria-label="Colour of the container"
                aria-expanded={pop === 'colour'}
                onClick={() => setPop(pop === 'colour' ? null : 'colour')}
              >
                <img src={colourWheel} alt="" />
              </button>
            </div>
            <div className="dc-embed sp-embed sp-v2" data-issue="accent">
              <button
                type="button"
                className="sp-embed-bar"
                aria-label="Change the colour of the container"
                tabIndex={-1}
                onClick={() => setPop('colour')}
              />
              <div className="sp-v2__body" data-issue="text">
                {slotView({ at: 'line', line: -1 })}
                {stretches.map(({ from, to }) => {
                  const side = to < from ? undefined : besideAt(from);
                  return (
                    <Fragment
                      // Typing in an empty box after a divider keeps its key.
                      key={
                        to >= from &&
                        lines
                          .slice(from, to + 1)
                          .every((l) => l.trim() === '{separator}')
                          ? `s${from}`
                          : `t${from}`
                      }
                    >
                      <div
                        className={cx(
                          'sp-v2-text',
                          (side || from === thumbAt) && 'has-side',
                        )}
                      >
                        <div className="sp-v2-text__body">
                          <EditText
                            value={lines.slice(from, to + 1).join('\n')}
                            label={
                              to < from
                                ? `text after line ${from}`
                                : stretches.length > 1
                                  ? `text, lines ${from + 1}–${to + 1}`
                                  : 'text'
                            }
                            placeholder="Description"
                            multiline
                            maxLength={4000}
                            render={(text) => renderLines(text, from)}
                            onChange={(text) => editLines(from, to, text)}
                            // A divider written mid-line gets a line of its
                            // own, as Discord starts a new section there.
                            onDone={() => {
                              const tidy = splitSeparatorLines(v.text, place);
                              if (tidy.text !== v.text) edit(tidy);
                            }}
                          />
                        </div>
                        {side ? (
                          <div className="sp-v2-text__side">{button(side)}</div>
                        ) : (
                          from === thumbAt && thumb
                        )}
                      </div>
                      {to >= from && slotView({ at: 'line', line: to })}
                    </Fragment>
                  );
                })}
              </div>
            </div>
            {pop === 'colour' && (
              <ColourPicker
                value={v.accent}
                title="Container colour"
                onChange={(accent) => edit({ accent })}
                shuffle={!!v.shuffle}
                onShuffle={(shuffle) => edit({ shuffle })}
                onClose={() => setPop(null)}
              />
            )}
          </div>
          {slotView({ at: 'below' })}
          {mark && (
            <div className="sp-v2-drop" style={mark} aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}
