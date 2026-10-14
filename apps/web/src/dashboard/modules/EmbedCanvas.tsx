import { useRef, useState, type CSSProperties } from 'react';
import { Button, Input, cx } from '../../ui';
import type { StudioEmbed, StudioMessage } from '../../data';
import {
  CloseButton,
  EditText,
  MaskIcon,
  UrlPopover,
  useDismiss,
} from './EditorBits';
import { newId } from './parts';
import { ColourPicker } from './ColourPicker';
import addImage from '../../../../../design-system/assets/icons/add-image-button.png';
import colourWheel from '../../../../../design-system/assets/icons/color-picker.png';
import dragIcon from '../../../../../design-system/assets/icons/drag.png';
import linkIcon from '../../../../../design-system/assets/icons/external-link.png';
import upIcon from '../../../../../design-system/assets/icons/arrow-up-icon.svg';
import downIcon from '../../../../../design-system/assets/icons/arrow-down-icon.svg';

type Field = StudioEmbed['fields'][number];
type LinkButton = StudioMessage['buttons'][number];
type Pop =
  | 'colour'
  | 'image'
  | 'thumbnail'
  | 'authorIcon'
  | 'authorUrl'
  | 'footerIcon';

export const MAX_EMBEDS = 10;
export const MAX_FIELDS = 25;
export const MAX_BUTTONS = 25;

export const newEmbed = (): StudioEmbed => ({
  id: newId(),
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

/** A small square button beside a line of the embed. */
function Tool({
  label,
  icon,
  on,
  onClick,
}: {
  label: string;
  icon: string;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx('sp-embed-tool', on && 'is-on')}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
    >
      <MaskIcon src={icon} size={14} />
    </button>
  );
}

/** Where a picture goes: the picture once there is one, an add button until then. */
function Picture({
  url,
  label,
  className,
  onOpen,
}: {
  url: string;
  label: string;
  className: string;
  onOpen: () => void;
}) {
  // The link that failed to load, if the current one did.
  const [broken, setBroken] = useState('');
  const failed = !!url && broken === url;
  return (
    <button
      type="button"
      className={cx(
        'sp-embed-pic',
        className,
        !url && 'is-empty',
        failed && 'is-broken',
      )}
      aria-label={url ? `Change ${label}` : `Add ${label}`}
      title={failed ? `This picture didn’t load: ${url}` : undefined}
      onClick={onOpen}
    >
      {url && !failed ? (
        <img src={url} alt="" onError={() => setBroken(url)} />
      ) : (
        <MaskIcon src={addImage} size={40} />
      )}
    </button>
  );
}

function FieldRow({
  field,
  number,
  ghost,
  first,
  last,
  onChange,
  onMove,
  onDone,
}: {
  field: Field;
  number: number;
  ghost: boolean;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<Field>) => void;
  onMove: (by: number) => void;
  onDone: () => void;
}) {
  return (
    <div
      className={cx(
        'dc-field sp-efield',
        field.inline && !ghost && 'dc-field--inline',
        ghost && 'is-ghost',
      )}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDone();
      }}
    >
      <div className="dc-field__name sp-efield__name">
        {!ghost && (
          <span className="sp-efield__tools">
            <span className="sp-efield__move">
              <button
                type="button"
                aria-label={`Move field ${number} up`}
                disabled={first}
                onClick={() => onMove(-1)}
              >
                <MaskIcon src={upIcon} size={10} />
              </button>
              <button
                type="button"
                aria-label={`Move field ${number} down`}
                disabled={last}
                onClick={() => onMove(1)}
              >
                <MaskIcon src={downIcon} size={10} />
              </button>
            </span>
            <input
              type="checkbox"
              className="sp-efield__inline"
              aria-label={`Field ${number} inline`}
              title="Inline: sits beside other inline fields"
              checked={field.inline}
              onChange={(e) => onChange({ inline: e.target.checked })}
            />
          </span>
        )}
        <EditText
          value={field.name}
          label={`field ${number} name`}
          placeholder={`Field ${number} name`}
          maxLength={256}
          onChange={(name) => onChange({ name })}
        />
      </div>
      <div className="dc-field__value">
        <EditText
          value={field.value}
          label={`field ${number} value`}
          placeholder={`Field ${number} value`}
          multiline
          maxLength={1024}
          onChange={(value) => onChange({ value })}
        />
      </div>
    </div>
  );
}

function EmbedBlock({
  embed,
  index,
  count,
  serverId,
  dropClass,
  openPop,
  onChange,
  onRemove,
  onMove,
  onDragStart,
}: {
  embed: StudioEmbed;
  index: number;
  count: number;
  serverId: string;
  dropClass: string | null;
  /** A popover to show when the embed first appears. */
  openPop: Pop | null;
  onChange: (patch: Partial<StudioEmbed>) => void;
  onRemove: () => void;
  onMove: (by: number) => void;
  onDragStart: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const [pop, setPop] = useState<Pop | null>(openPop);
  const fields = embed.fields;
  // The empty field's id becomes the real field's, so typing carries on.
  let n = fields.length;
  while (fields.some((f) => f.id === `g${n}`)) n++;
  const ghostId = `g${n}`;
  const ghost: Field | null =
    fields.length < MAX_FIELDS
      ? { id: ghostId, name: '', value: '', inline: false }
      : null;
  const editField = (id: string, patch: Partial<Field>) =>
    onChange({
      fields: fields.some((f) => f.id === id)
        ? fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
        : // Writing in the empty field at the end makes it a real one.
          [...fields, { id, name: '', value: '', inline: false, ...patch }],
    });
  const moveField = (i: number, by: number) => {
    const next = [...fields];
    const [f] = next.splice(i, 1);
    next.splice(i + by, 0, f!);
    onChange({ fields: next });
  };
  const close = () => setPop(null);
  const url = (key: Pop & keyof StudioEmbed, title: string, picture = true) =>
    pop === key && (
      <UrlPopover
        serverId={serverId}
        title={title}
        value={embed[key] as string}
        picture={picture}
        onChange={(v) => onChange({ [key]: v })}
        onClose={close}
      />
    );
  const label = `embed ${index + 1}`;

  return (
    <div
      className={cx('sp-embed-wrap', dropClass)}
      data-embed-index={index}
      style={{ '--dc-color': embed.color } as CSSProperties}
    >
      <div className="sp-embed-gutter">
        <button
          type="button"
          className="sp-embed-wheel"
          aria-label={`Colour of ${label}`}
          aria-expanded={pop === 'colour'}
          onClick={() => setPop(pop === 'colour' ? null : 'colour')}
        >
          <img src={colourWheel} alt="" />
        </button>
        <button
          type="button"
          className="sp-embed-drag"
          aria-label={`Move ${label}. Drag it, or use the arrow keys.`}
          disabled={count < 2}
          onPointerDown={onDragStart}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && index > 0) {
              e.preventDefault();
              onMove(-1);
            } else if (e.key === 'ArrowDown' && index < count - 1) {
              e.preventDefault();
              onMove(1);
            }
          }}
        >
          <MaskIcon src={dragIcon} size={16} />
        </button>
      </div>

      <div className="dc-embed sp-embed">
        <button
          type="button"
          className="sp-embed-bar"
          aria-label={`Change the colour of ${label}`}
          tabIndex={-1}
          onClick={() => setPop('colour')}
        />
        <div className="dc-embed__main">
          <div className="dc-embed__author sp-embed__line">
            {embed.author.trim() && (
              <span className="sp-embed-tools">
                {embed.authorIcon ? (
                  <button
                    type="button"
                    className="sp-embed-tool sp-embed-tool--pic"
                    aria-label="Change the author picture"
                    onClick={() => setPop('authorIcon')}
                  >
                    <img src={embed.authorIcon} alt="" />
                  </button>
                ) : (
                  <Tool
                    label="Add an author picture"
                    icon={addImage}
                    onClick={() => setPop('authorIcon')}
                  />
                )}
                <Tool
                  label={
                    embed.authorUrl
                      ? 'Change the author link'
                      : 'Add an author link'
                  }
                  icon={linkIcon}
                  on={!!embed.authorUrl}
                  onClick={() => setPop('authorUrl')}
                />
              </span>
            )}
            <EditText
              value={embed.author}
              label="author"
              placeholder="Author"
              maxLength={256}
              onChange={(author) => onChange({ author })}
            />
            {url('authorIcon', 'Author picture URL')}
            {url('authorUrl', 'Author link', false)}
          </div>
          <div className="dc-embed__title">
            <EditText
              value={embed.title}
              label="title"
              placeholder="Title"
              maxLength={256}
              onChange={(title) => onChange({ title })}
            />
          </div>
          <div className="dc-embed__desc">
            <EditText
              value={embed.description}
              label="description"
              placeholder="Description"
              multiline
              maxLength={4096}
              onChange={(description) => onChange({ description })}
            />
          </div>
          <div className="dc-fields">
            {[...fields, ...(ghost ? [ghost] : [])].map((f, i) => (
              <FieldRow
                key={f.id}
                field={f}
                number={i + 1}
                ghost={f === ghost}
                first={i === 0}
                last={i === fields.length - 1}
                onChange={(patch) => editField(f.id, patch)}
                onMove={(by) => moveField(i, by)}
                onDone={() => {
                  // A field emptied of both name and value goes away.
                  if (f !== ghost && !f.name.trim() && !f.value.trim())
                    onChange({ fields: fields.filter((x) => x.id !== f.id) });
                }}
              />
            ))}
          </div>
          <div className="sp-embed__image">
            <Picture
              url={embed.image}
              label="an image"
              className="sp-embed-pic--image"
              onOpen={() => setPop('image')}
            />
            {url('image', 'Image URL')}
          </div>
          <div className="dc-embed__footer sp-embed__line">
            {embed.footer.trim() &&
              (embed.footerIcon ? (
                <button
                  type="button"
                  className="sp-embed-tool sp-embed-tool--pic"
                  aria-label="Change the footer picture"
                  onClick={() => setPop('footerIcon')}
                >
                  <img src={embed.footerIcon} alt="" />
                </button>
              ) : (
                <Tool
                  label="Add a footer picture"
                  icon={addImage}
                  onClick={() => setPop('footerIcon')}
                />
              ))}
            <EditText
              value={embed.footer}
              label="footer"
              placeholder="Footer"
              maxLength={2048}
              onChange={(footer) => onChange({ footer })}
            />
            <button
              type="button"
              className={cx('sp-embed-stamp', embed.timestamp && 'is-on')}
              aria-pressed={embed.timestamp}
              title="Show when it was posted"
              onClick={() => onChange({ timestamp: !embed.timestamp })}
            >
              {embed.timestamp ? '• Today at 18:42' : '+ time'}
            </button>
            {url('footerIcon', 'Footer picture URL')}
          </div>
        </div>
        <div className="sp-embed__thumb">
          <Picture
            url={embed.thumbnail}
            label="a thumbnail"
            className="sp-embed-pic--thumb"
            onOpen={() => setPop('thumbnail')}
          />
          {url('thumbnail', 'Thumbnail URL')}
        </div>
      </div>

      {pop === 'colour' && (
        <ColourPicker
          value={embed.color}
          onChange={(color) => onChange({ color })}
          onClose={close}
        />
      )}
      <CloseButton
        label={`Remove ${label}`}
        className="sp-embed-remove"
        onClick={onRemove}
      />
    </div>
  );
}

/** A link button under the message; clicking it opens its label and link. */
function LinkButtonChip({
  button,
  onChange,
  onRemove,
  startOpen,
}: {
  button: LinkButton;
  onChange: (patch: Partial<LinkButton>) => void;
  onRemove: () => void;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), wrap);
  const bad = !/^https:\/\/\S+$/.test(button.url);
  return (
    <div ref={wrap} className="sp-pop-anchor">
      <button
        type="button"
        className={cx('dc-btn sp-link-chip', bad && 'is-bad')}
        aria-label={`Edit button ${button.label || 'without a label'}`}
        onClick={() => setOpen((o) => !o)}
      >
        {button.label || 'Button'}
        <MaskIcon src={linkIcon} size={14} />
      </button>
      {open && (
        <div className="sp-url-pop" role="dialog" aria-label="Link button">
          <CloseButton
            label="Close"
            className="sp-url-pop__x"
            onClick={() => setOpen(false)}
          />
          <Input
            label="Label"
            value={button.label}
            maxLength={80}
            autoFocus
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <Input
            label="Link"
            value={button.url}
            placeholder="https://"
            error={bad ? 'Use a link that starts with https://.' : undefined}
            onChange={(e) => onChange({ url: e.target.value.trim() })}
          />
          <div className="sp-url-pop__actions">
            <span className="sp-url-pop__end">
              <Button size="sm" variant="ghost" onClick={onRemove}>
                Remove
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The classic message, edited in place: the text, each embed with its
 * pictures, fields and colour, and link buttons underneath.
 */
export function EmbedCanvas({
  message,
  serverId,
  onChange,
  focus,
}: {
  message: StudioMessage;
  serverId: string;
  onChange: (patch: Partial<StudioMessage>) => void;
  /** Opens a popover on an embed or a button that was just added. */
  focus: { id: string; pop?: Pop } | null;
}) {
  const embeds = message.embeds;
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const editEmbed = (id: string, patch: Partial<StudioEmbed>) =>
    onChange({
      embeds: embeds.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  const moveEmbed = (from: number, to: number) => {
    if (from === to) return;
    const next = [...embeds];
    const [e] = next.splice(from, 1);
    next.splice(to, 0, e!);
    onChange({ embeds: next });
  };
  const startDrag =
    (from: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      let over = from;
      setDrag({ from, over });
      const move = (ev: PointerEvent) => {
        const blocks = Array.from(
          list.current?.querySelectorAll<HTMLElement>('[data-embed-index]') ??
            [],
        );
        // The place is the first embed whose middle is below the pointer.
        const at = blocks.findIndex((b) => {
          const r = b.getBoundingClientRect();
          return ev.clientY < r.top + r.height / 2;
        });
        over = at < 0 ? blocks.length : at;
        setDrag({ from, over });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        setDrag(null);
        moveEmbed(from, over > from ? over - 1 : over);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
  const dropClass = (i: number) => {
    if (!drag || drag.over === drag.from || drag.over === drag.from + 1)
      return drag?.from === i ? 'is-dragged' : null;
    if (drag.from === i) return 'is-dragged';
    if (drag.over === i) return 'is-drop-before';
    if (drag.over === embeds.length && i === embeds.length - 1)
      return 'is-drop-after';
    return null;
  };

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
        <div className="dc-content">
          <EditText
            value={message.content}
            label="message content"
            placeholder="Message content"
            multiline
            maxLength={2000}
            onChange={(content) => onChange({ content })}
          />
        </div>
        <div ref={list} className="sp-embed-list">
          {embeds.map((e, i) => (
            <EmbedBlock
              key={e.id}
              embed={e}
              index={i}
              count={embeds.length}
              serverId={serverId}
              dropClass={dropClass(i)}
              openPop={focus?.id === e.id ? (focus.pop ?? null) : null}
              onChange={(patch) => editEmbed(e.id, patch)}
              onRemove={() =>
                onChange({ embeds: embeds.filter((x) => x.id !== e.id) })
              }
              onMove={(by) => moveEmbed(i, i + by)}
              onDragStart={startDrag(i)}
            />
          ))}
        </div>
        {message.buttons.length > 0 && (
          <div className="dc-components">
            <div className="dc-row">
              {message.buttons.map((b) => (
                <LinkButtonChip
                  key={b.id}
                  button={b}
                  startOpen={focus?.id === b.id}
                  onChange={(patch) =>
                    onChange({
                      buttons: message.buttons.map((x) =>
                        x.id === b.id ? { ...x, ...patch } : x,
                      ),
                    })
                  }
                  onRemove={() =>
                    onChange({
                      buttons: message.buttons.filter((x) => x.id !== b.id),
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
