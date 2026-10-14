import { useState, type CSSProperties } from 'react';
import { cx, renderDiscordText } from '../../ui';
import {
  v2Sections,
  type GalleryImage,
  type StudioMessage,
  type StudioV2,
  type V2Part,
} from '../../data';
import { ColourPicker } from './ColourPicker';
import { ComponentsArea, TrashButton } from './ComponentsEditor';
import {
  EditText,
  MaskIcon,
  UrlPopover,
  moveItem,
  useReorder,
} from './EditorBits';
import { newId } from './parts';
import addImage from '../../../../../design-system/assets/icons/add-image-button.png';
import colourWheel from '../../../../../design-system/assets/icons/color-picker.png';
import dragIcon from '../../../../../design-system/assets/icons/drag.png';

/**
 * A Components V2 message, edited in place: one container with a colour
 * bar, its text (cut into sections by {separator}), a thumbnail, an image
 * gallery, and the message's buttons and menus. The parts can be dragged
 * into another order, and the gallery and the buttons can be dragged out
 * of the container, above or below it; the gallery starts at the bottom.
 */

export const MAX_GALLERY = 10;
export const newImage = (): GalleryImage => ({
  id: newId(),
  url: '',
  description: '',
});

/** Discord's markdown in V2 text: # headings, **bold**, mentions, lines. */
function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h)
      return (
        <div key={i} className={`dc-h${h[1]!.length}`}>
          {renderDiscordText(h[2]!)}
        </div>
      );
    return (
      <div key={i} className="dc-line">
        {line ? renderDiscordText(line) : ' '}
      </div>
    );
  });
}
/** The text as Discord shows it, with a line where each {separator} is. */
export function renderV2Text(text: string) {
  return v2Sections(text).map((section, i) => (
    <div key={i} className="sp-v2-section">
      {i > 0 && <hr className="dc-separator" />}
      {renderMarkdown(section.replace(/^\n+|\n+$/g, ''))}
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
    <div ref={list} className="sp-gallery" aria-label="Image gallery">
      {images.map((img, i) => (
        <div
          key={img.id}
          {...reorder.item(i, img.id)}
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
              <img src={img.url} alt={img.description} />
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
  const edit = (patch: Partial<StudioV2>) =>
    onChange({ v2: { ...v, ...patch } });
  const shows = (part: V2Part) =>
    part === 'text' ||
    (part === 'gallery' ? v.gallery.length > 0 : message.components.length > 0);
  // Everything that shows, top to bottom, with the container's top and
  // bottom edges as places to drop: above the top edge is outside it.
  type Token = V2Part | 'open' | 'close';
  const seq: Token[] = [
    ...v.above.filter(shows),
    'open',
    ...v.order.filter(shows),
    'close',
    ...v.below.filter(shows),
  ];
  const { list, ...reorder } = useReorder({
    onMove: (from, to) => {
      const moved = moveItem(seq, from, to);
      const open = moved.indexOf('open');
      const close = moved.indexOf('close');
      const parts = (a: number, b: number) =>
        moved
          .slice(a, b)
          .filter((t): t is V2Part => t !== 'open' && t !== 'close');
      const inside = parts(open + 1, close);
      // The text always stays in the container.
      if (!inside.includes('text')) return;
      // Parts that don't show stay where they were.
      const hidden = (l: V2Part[]) => l.filter((p) => !shows(p));
      edit({
        above: [...parts(0, open), ...hidden(v.above)],
        order: [...inside, ...hidden(v.order)],
        below: [...parts(close + 1, moved.length), ...hidden(v.below)],
      });
    },
  });
  const addPicture = () => {
    if (v.gallery.length >= MAX_GALLERY) return;
    edit({ gallery: [...v.gallery, newImage()] });
  };

  const partBody = (part: V2Part) => {
    if (part === 'text')
      return (
        <div className="sp-v2-text">
          <div className="sp-v2-text__body">
            <EditText
              value={v.text}
              label="text"
              placeholder="Description"
              multiline
              maxLength={4000}
              render={renderV2Text}
              onChange={(text) => edit({ text })}
            />
          </div>
          <div className="sp-embed__thumb sp-v2-text__thumb">
            <button
              type="button"
              className={cx(
                'sp-embed-pic sp-embed-pic--thumb',
                !v.thumbnail && 'is-empty',
              )}
              aria-label={
                v.thumbnail ? 'Change the thumbnail' : 'Add a thumbnail'
              }
              onClick={() => setPop('thumbnail')}
            >
              {v.thumbnail ? (
                <img src={v.thumbnail} alt="" />
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
        </div>
      );
    if (part === 'gallery')
      return (
        <Gallery
          images={v.gallery}
          serverId={serverId}
          openId={focusId}
          onChange={(gallery) => edit({ gallery })}
        />
      );
    return (
      <ComponentsArea
        components={message.components}
        onChange={(components) => onChange({ components })}
        focusId={focusId}
      />
    );
  };

  const name = (part: V2Part) =>
    part === 'components'
      ? 'buttons and menus'
      : part === 'gallery'
        ? 'gallery'
        : 'text';
  const row = (part: V2Part, i: number, outside: boolean) => (
    <div
      key={part}
      {...reorder.item(i, part)}
      className={cx(
        'sp-v2-part',
        `sp-v2-part--${part}`,
        outside && 'is-outside',
        reorder.dropClass(i),
      )}
    >
      <button
        type="button"
        className="sp-v2-part__handle"
        aria-label={`Move the ${name(part)}${part === 'text' ? '' : ', inside or outside the container'}. Drag it, or use the arrow keys.`}
        disabled={seq.length < 4}
        onPointerDown={reorder.start(i)}
        onKeyDown={reorder.keys(i, seq.length)}
      >
        <MaskIcon src={dragIcon} size={12} />
      </button>
      {partBody(part)}
    </div>
  );
  let at = 0;
  const rows = (parts: V2Part[], outside: boolean) =>
    parts.filter(shows).map((part) => row(part, at++, outside));
  const aboveRows = rows(v.above, true);
  const openAt = at++;
  const insideRows = rows(v.order, false);
  const closeAt = at++;
  const belowRows = rows(v.below, true);

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
        <div ref={list} className="sp-v2-message">
          {aboveRows}
          <div
            className="sp-embed-wrap sp-v2-wrap"
            style={{ '--dc-color': v.accent } as CSSProperties}
          >
            <div className="sp-embed-gutter sp-v2-gutter">
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
            <div className="dc-embed sp-embed sp-v2">
              <button
                type="button"
                className="sp-embed-bar"
                aria-label="Change the colour of the container"
                tabIndex={-1}
                onClick={() => setPop('colour')}
              />
              <div
                {...reorder.item(openAt, 'open', true)}
                className="sp-v2__edge sp-v2__edge--top"
              />
              <div className="sp-v2__parts">{insideRows}</div>
              <div
                {...reorder.item(closeAt, 'close', true)}
                className="sp-v2__edge sp-v2__edge--bottom"
              />
            </div>
            {pop === 'colour' && (
              <ColourPicker
                value={v.accent}
                title="Container colour"
                onChange={(accent) => edit({ accent })}
                onClose={() => setPop(null)}
              />
            )}
          </div>
          {belowRows}
        </div>
      </div>
    </div>
  );
}
