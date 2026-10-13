import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  Button,
  Icon,
  Input,
  Segmented,
  Switch,
  renderDiscordText,
} from '../../ui';
import type { LinkButton, StudioMessage, V2Block } from '../../data';
import { isHttpsUrl, newId } from './parts';

type V2 = StudioMessage['v2'];

/**
 * Text you edit where it's shown: click it in the preview and it turns into
 * a box in the same place; click away and it's rendered again.
 */
export function InlineEdit({
  value,
  onChange,
  label,
  multiline,
  placeholder = 'Click to write',
  maxLength,
  render = (v) => renderDiscordText(v),
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  render?: (value: string) => ReactNode;
  disabled?: boolean | undefined;
}) {
  const [editing, setEditing] = useState(false);
  if (editing && !disabled)
    return multiline ? (
      <textarea
        autoFocus
        className="sp-inline-edit"
        aria-label={label}
        value={value}
        maxLength={maxLength}
        rows={Math.max(2, value.split('\n').length)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
      />
    ) : (
      <input
        autoFocus
        className="sp-inline-edit"
        aria-label={label}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) =>
          (e.key === 'Enter' || e.key === 'Escape') && setEditing(false)
        }
      />
    );
  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      className="sp-inline-target"
      aria-label={`Edit ${label}`}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && setEditing(true)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value.trim() ? (
        render(value)
      ) : (
        <span className="sp-inline-placeholder">{placeholder}</span>
      )}
    </span>
  );
}

/** Discord's markdown in V2 text: # headings, **bold**, mentions, lines. */
export function renderMarkdown(text: string) {
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
        {line ? renderDiscordText(line) : ' '}
      </div>
    );
  });
}

const kinds: { type: V2Block['type']; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: 'file-text' },
  { type: 'section', label: 'Text with image or button', icon: 'layers' },
  { type: 'gallery', label: 'Images', icon: 'image' },
  { type: 'separator', label: 'Separator', icon: 'minus' },
  { type: 'buttons', label: 'Link buttons', icon: 'link' },
];

export function newBlock(type: V2Block['type']): V2Block {
  const id = newId();
  switch (type) {
    case 'text':
      return { id, type, content: 'New text' };
    case 'section':
      return {
        id,
        type,
        content: 'Text beside a button',
        accessory: { type: 'button', label: 'Open', url: 'https://' },
      };
    case 'gallery':
      return {
        id,
        type,
        images: [{ id: newId(), url: 'https://', description: '' }],
      };
    case 'separator':
      return { id, type, divider: true, spacing: 'small' };
    case 'buttons':
      return {
        id,
        type,
        buttons: [{ id: newId(), label: 'Open', url: 'https://' }],
      };
  }
}

/** The first thing wrong with a V2 layout, in plain words, or null. */
export function v2Issue(v2: V2): string | null {
  if (!v2.blocks.length) return 'Add at least one block.';
  let text = 0;
  for (const b of v2.blocks) {
    if (b.type === 'text' || b.type === 'section') {
      if (!b.content.trim()) return 'Text blocks need some text.';
      text += b.content.length;
    }
    if (b.type === 'section') {
      const a = b.accessory;
      if (!isHttpsUrl(a.url) || (a.type === 'button' && !a.label.trim()))
        return 'Sections need an image or button link that starts with https://.';
    }
    if (b.type === 'gallery' && b.images.some((i) => !isHttpsUrl(i.url)))
      return 'Image links must start with https://.';
    if (
      b.type === 'buttons' &&
      b.buttons.some((x) => !x.label.trim() || !isHttpsUrl(x.url))
    )
      return 'Link buttons need a label and a link that starts with https://.';
  }
  if (text > 4000)
    return 'Discord allows 4,000 characters of text in a message like this.';
  return null;
}

function Insert({
  onPick,
  label,
}: {
  onPick: (type: V2Block['type']) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sp-v2-insert" data-open={open || undefined}>
      <button
        type="button"
        className="sp-v2-insert__btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="plus" size="sm" />
      </button>
      {open && (
        <div
          className="sp-popover sp-v2-insert__menu"
          role="menu"
          aria-label={label}
        >
          {kinds.map((k) => (
            <button
              key={k.type}
              type="button"
              className="sp-option"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(k.type);
              }}
            >
              <Icon name={k.icon} />
              {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const linkButton = (
  b: LinkButton,
  onLabel: (label: string) => void,
  disabled?: boolean,
) => (
  <span key={b.id} className="dc-btn sp-v2-link">
    <InlineEdit
      value={b.label}
      onChange={onLabel}
      label="button label"
      placeholder="Label"
      maxLength={80}
      render={(v) => v}
      disabled={disabled}
    />
    <Icon name="external-link" />
  </span>
);

/**
 * A Components V2 message you edit in place: click text to change it, hover
 * a block to move or remove it, and use + to add blocks between them.
 */
export function V2Canvas({
  v2,
  onChange,
  selected,
  onSelect,
  disabled,
}: {
  v2: V2;
  onChange: (v2: V2) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean | undefined;
}) {
  const set = (blocks: V2Block[]) => onChange({ ...v2, blocks });
  const patch = (id: string, change: Partial<V2Block>) =>
    set(
      v2.blocks.map((b) =>
        b.id === id ? ({ ...b, ...change } as V2Block) : b,
      ),
    );
  const insert = (at: number, type: V2Block['type']) => {
    const block = newBlock(type);
    const blocks = [...v2.blocks];
    blocks.splice(at, 0, block);
    set(blocks);
    onSelect(block.id);
  };
  const move = (i: number, by: number) => {
    const blocks = [...v2.blocks];
    const [b] = blocks.splice(i, 1);
    blocks.splice(i + by, 0, b!);
    set(blocks);
  };

  const body = (b: V2Block) => {
    switch (b.type) {
      case 'text':
        return (
          <InlineEdit
            multiline
            value={b.content}
            label="text"
            maxLength={4000}
            render={renderMarkdown}
            onChange={(content) => patch(b.id, { content })}
            disabled={disabled}
          />
        );
      case 'section':
        return (
          <div className="sp-v2-section">
            <div>
              <InlineEdit
                multiline
                value={b.content}
                label="section text"
                maxLength={4000}
                render={renderMarkdown}
                onChange={(content) => patch(b.id, { content })}
                disabled={disabled}
              />
            </div>
            {b.accessory.type === 'thumbnail' ? (
              <span className="sp-v2-thumb">
                {isHttpsUrl(b.accessory.url) ? (
                  <img src={b.accessory.url} alt="" />
                ) : (
                  <Icon name="image" />
                )}
              </span>
            ) : (
              linkButton(
                { id: 'a', label: b.accessory.label, url: b.accessory.url },
                (label) =>
                  patch(b.id, {
                    accessory: {
                      ...b.accessory,
                      type: 'button',
                      label,
                    } as never,
                  }),
                disabled,
              )
            )}
          </div>
        );
      case 'gallery':
        return (
          <div
            className="sp-v2-gallery"
            data-count={Math.min(b.images.length, 4)}
          >
            {b.images.map((img) => (
              <span key={img.id} className="sp-v2-gallery__item">
                {isHttpsUrl(img.url) ? (
                  <img src={img.url} alt={img.description} />
                ) : (
                  <Icon name="image" />
                )}
              </span>
            ))}
          </div>
        );
      case 'separator':
        return (
          <div
            className="sp-v2-sep"
            data-divider={b.divider || undefined}
            data-spacing={b.spacing}
          />
        );
      case 'buttons':
        return (
          <div className="dc-row">
            {b.buttons.map((x) =>
              linkButton(
                x,
                (label) =>
                  patch(b.id, {
                    buttons: b.buttons.map((y) =>
                      y.id === x.id ? { ...y, label } : y,
                    ),
                  }),
                disabled,
              ),
            )}
          </div>
        );
    }
  };

  const blocks = (
    <>
      {!disabled && (
        <Insert label="Add a block at the top" onPick={(t) => insert(0, t)} />
      )}
      {v2.blocks.map((b, i) => (
        <div key={b.id}>
          <div
            className="sp-v2-block"
            data-selected={selected === b.id || undefined}
            onFocusCapture={() => onSelect(b.id)}
            onMouseDown={() => onSelect(b.id)}
          >
            {body(b)}
            {!disabled && (
              <span
                className="sp-v2-tools"
                role="group"
                aria-label={`Block ${i + 1}`}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon="arrow-up"
                  aria-label={`Move block ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon="arrow-down"
                  aria-label={`Move block ${i + 1} down`}
                  disabled={i === v2.blocks.length - 1}
                  onClick={() => move(i, 1)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon="trash-2"
                  aria-label={`Remove block ${i + 1}`}
                  onClick={() => {
                    set(v2.blocks.filter((x) => x.id !== b.id));
                    onSelect(null);
                  }}
                />
              </span>
            )}
          </div>
          {!disabled && (
            <Insert
              label={`Add a block after block ${i + 1}`}
              onPick={(t) => insert(i + 1, t)}
            />
          )}
        </div>
      ))}
      {!v2.blocks.length && (
        <p className="sp-hint">
          Use + to add text, images, a separator or buttons.
        </p>
      )}
    </>
  );

  return (
    <div className="dc-msg sp-v2-msg">
      <div className="dc-avatar">S</div>
      <div className="dc-head">
        <span className="dc-name">Sparko</span>
        <span className="dc-tag">
          <Icon name="check" />
          App
        </span>
        <span className="dc-time">Today at 18:42</span>
      </div>
      {v2.container ? (
        <div
          className="sp-v2-container"
          style={{ '--accent': v2.accent } as CSSProperties}
        >
          {blocks}
        </div>
      ) : (
        <div className="sp-v2-loose">{blocks}</div>
      )}
    </div>
  );
}

/** Details of the selected block that aren't edited in the preview (links). */
export function BlockSettings({
  block,
  onChange,
}: {
  block: V2Block | undefined;
  onChange: (block: V2Block) => void;
}) {
  if (!block)
    return (
      <p className="sp-hint">
        Click a block in the preview to edit its text there. Its links and
        options show up here.
      </p>
    );
  const link = (value: string, set: (url: string) => void, label: string) => (
    <Input
      label={label}
      placeholder="https://"
      value={value}
      error={
        value && !isHttpsUrl(value)
          ? 'The link must start with https://.'
          : undefined
      }
      onChange={(e) => set(e.target.value)}
    />
  );
  switch (block.type) {
    case 'text':
      return (
        <p className="sp-hint">
          Edit the text in the preview. Start a line with #, ## or ### for a
          heading; **bold**, @mentions and #channels work like in Discord.
        </p>
      );
    case 'section': {
      const a = block.accessory;
      return (
        <div className="sp-stack" style={{ gap: 12 }}>
          <Segmented
            label="Beside the text"
            value={a.type}
            onChange={(type) =>
              onChange({
                ...block,
                accessory:
                  type === 'thumbnail'
                    ? { type, url: a.url }
                    : { type, url: a.url, label: 'Open' },
              })
            }
            options={[
              { value: 'button', label: 'A button' },
              { value: 'thumbnail', label: 'An image' },
            ]}
          />
          {link(
            a.url,
            (url) => onChange({ ...block, accessory: { ...a, url } }),
            a.type === 'thumbnail' ? 'Image link' : 'Button link',
          )}
        </div>
      );
    }
    case 'gallery':
      return (
        <div className="sp-stack" style={{ gap: 12 }}>
          {block.images.map((img, i) => (
            <div key={img.id} className="sp-item-box">
              {link(
                img.url,
                (url) =>
                  onChange({
                    ...block,
                    images: block.images.map((x) =>
                      x.id === img.id ? { ...x, url } : x,
                    ),
                  }),
                `Image ${i + 1} link`,
              )}
              <Input
                label={`Image ${i + 1} description`}
                maxLength={1024}
                value={img.description}
                onChange={(e) =>
                  onChange({
                    ...block,
                    images: block.images.map((x) =>
                      x.id === img.id
                        ? { ...x, description: e.target.value }
                        : x,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                icon="trash-2"
                disabled={block.images.length === 1}
                onClick={() =>
                  onChange({
                    ...block,
                    images: block.images.filter((x) => x.id !== img.id),
                  })
                }
              >
                Remove image
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            icon="plus"
            style={{ justifySelf: 'start' }}
            disabled={block.images.length >= 10}
            onClick={() =>
              onChange({
                ...block,
                images: [
                  ...block.images,
                  { id: newId(), url: 'https://', description: '' },
                ],
              })
            }
          >
            Add an image
          </Button>
        </div>
      );
    case 'separator':
      return (
        <div className="sp-stack" style={{ gap: 12 }}>
          <Switch
            checked={block.divider}
            onChange={(divider) => onChange({ ...block, divider })}
            label="Show a line"
            description="Off leaves just a gap."
          />
          <Segmented
            label="Space"
            value={block.spacing}
            onChange={(spacing) => onChange({ ...block, spacing })}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </div>
      );
    case 'buttons':
      return (
        <div className="sp-stack" style={{ gap: 12 }}>
          {block.buttons.map((b, i) => (
            <div key={b.id} className="sp-item-box">
              {link(
                b.url,
                (url) =>
                  onChange({
                    ...block,
                    buttons: block.buttons.map((x) =>
                      x.id === b.id ? { ...x, url } : x,
                    ),
                  }),
                `Button ${i + 1} link (“${b.label || 'Untitled'}”)`,
              )}
              <Button
                variant="ghost"
                size="sm"
                icon="trash-2"
                disabled={block.buttons.length === 1}
                onClick={() =>
                  onChange({
                    ...block,
                    buttons: block.buttons.filter((x) => x.id !== b.id),
                  })
                }
              >
                Remove button
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            icon="plus"
            style={{ justifySelf: 'start' }}
            disabled={block.buttons.length >= 5}
            onClick={() =>
              onChange({
                ...block,
                buttons: [
                  ...block.buttons,
                  { id: newId(), label: 'Open', url: 'https://' },
                ],
              })
            }
          >
            Add a button
          </Button>
        </div>
      );
  }
}
