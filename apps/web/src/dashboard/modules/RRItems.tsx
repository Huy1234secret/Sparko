import { useState, type DragEvent } from 'react';
import {
  Button,
  Combobox,
  Icon,
  Input,
  Modal,
  cx,
  renderDiscordText,
  type ComboItem,
} from '../../ui';
import {
  rrItem,
  rrLimits,
  type ReactionRole,
  type RRItem,
  type RoleOption,
} from '../../data';
import { MaskIcon } from './EditorBits';
import { EmojiField } from './EmojiPicker';
import { roleItems } from './parts';
import dragIcon from '../../../../../design-system/assets/icons/drag.png';

const colours = [
  { value: 'blurple', label: 'Blurple' },
  { value: 'grey', label: 'Grey' },
  { value: 'green', label: 'Green' },
  { value: 'red', label: 'Red' },
] as const;
const dcStyle = {
  blurple: 'dc-btn--primary',
  grey: '',
  green: 'dc-btn--success',
  red: 'dc-btn--danger',
} as const;

const NONE = 'none';
const titleOf = (r: ReactionRole, i: RRItem) =>
  r.kind === 'reaction'
    ? `Editing reaction ${i.emoji || ''}`.trim()
    : r.kind === 'button'
      ? `Editing ${i.label.trim() || i.emoji || 'button'}`
      : `Editing option ${i.label.trim() || ''}`.trim();

/** The gear's settings: the role it gives, and who can use it. */
function ItemSettings({
  rr,
  item,
  roles,
  onChange,
  onClose,
}: {
  rr: ReactionRole;
  item: RRItem;
  roles: RoleOption[];
  onChange: (patch: Partial<RRItem>) => void;
  onClose: () => void;
}) {
  const choices = roleItems(roles, [item.role]);
  const optional = (taken: string): ComboItem[] => [
    { value: NONE, label: 'None', icon: 'ban', group: 'Options' },
    ...roleItems(roles).map((r) =>
      r.value === taken
        ? { ...r, disabled: true, note: 'Picked above' }
        : { ...r, disabled: false, note: undefined as never },
    ),
  ];
  return (
    <Modal
      open
      onClose={onClose}
      icon="settings"
      title={titleOf(rr, item)}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="sp-stack">
        {rr.kind !== 'reaction' && (
          <Combobox
            label={rr.mode === 'remove' ? 'Takes away role' : 'Gives role'}
            searchPlaceholder="Search roles"
            placeholder="Pick a role"
            value={item.role}
            onChange={(role) => onChange({ role })}
            items={choices}
            footer="Roles above Sparko’s own can’t be given."
          />
        )}
        <Combobox
          label="Required role"
          hint="Only members with this role can use it."
          searchPlaceholder="Search roles"
          value={item.required || NONE}
          onChange={(v) => onChange({ required: v === NONE ? '' : v })}
          items={optional(item.blacklist)}
        />
        <Combobox
          label="Blacklisted role"
          hint="Members with this role can’t use it."
          searchPlaceholder="Search roles"
          value={item.blacklist || NONE}
          onChange={(v) => onChange({ blacklist: v === NONE ? '' : v })}
          items={optional(item.required)}
        />
      </div>
    </Modal>
  );
}

/** Reactions, buttons or menu options, each with its role and settings. */
export function RRItems({
  rr,
  roles,
  serverId,
  onChange,
}: {
  rr: ReactionRole;
  roles: RoleOption[];
  serverId: string;
  onChange: (items: RRItem[]) => void;
}) {
  const [gear, setGear] = useState<string | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  // The blank option keeps its id once typed in, so the cursor stays put.
  const [nextId, setNextId] = useState(() => rrItem().id);
  const items = rr.items;
  const limit = rrLimits[rr.kind];
  const sortable = rr.kind !== 'reaction';
  // A menu always has one blank option to type into, up to its limit.
  const shown =
    rr.kind === 'menu' && items.length < limit
      ? [...items, rrItem({ id: nextId })]
      : items;

  const edit = (id: string, patch: Partial<RRItem>) => {
    if (id === nextId) {
      // Typing in the blank option makes it real.
      onChange([...items, rrItem({ ...patch, id })]);
      setNextId(rrItem().id);
      return;
    }
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));
  const clone = (i: RRItem) => {
    const at = items.indexOf(i) + 1;
    // Two reactions can't share an emoji, so a copy starts without one.
    const copy = rrItem({
      ...i,
      id: undefined as never,
      ...(rr.kind === 'reaction' ? { emoji: '' } : {}),
    });
    onChange([
      ...items.slice(0, at),
      { ...copy, id: rrItem().id },
      ...items.slice(at),
    ]);
  };
  const drop = (to: number) => {
    if (dragged === null || dragged === to) return;
    const next = [...items];
    const [moved] = next.splice(dragged, 1);
    next.splice(to, 0, moved!);
    onChange(next);
    setDragged(null);
  };
  const dragProps = (index: number, real: boolean) =>
    sortable && real
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.effectAllowed = 'move';
            setDragged(index);
          },
          onDragOver: (e: DragEvent) => e.preventDefault(),
          onDrop: () => drop(index),
          onDragEnd: () => setDragged(null),
        }
      : {};
  const roleChoices = (i: RRItem) => roleItems(roles, [i.role]);
  const gearItem = items.find((i) => i.id === gear);

  const list = (
    <ul className="sp-rr-items" aria-label={`${rr.kind} list`}>
      {shown.map((i, index) => {
        const real = i.id !== nextId;
        const emoji = (
          <EmojiField
            serverId={serverId}
            value={i.emoji}
            label={
              rr.kind === 'menu'
                ? `Option ${index + 1} emoji`
                : `Item ${index + 1} emoji`
            }
            onChange={(emoji) => edit(i.id, { emoji })}
          />
        );
        const gearButton = (
          <button
            type="button"
            className={cx(
              'sp-icon-btn',
              rr.kind !== 'reaction' && 'sp-rr-opt__gear',
            )}
            aria-label={`Settings for ${titleOf(rr, i).replace('Editing ', '')}`}
            onClick={() => setGear(i.id)}
          >
            <Icon name="settings" size={rr.kind === 'reaction' ? 'sm' : 'lg'} />
          </button>
        );
        const copyRemove = (
          <>
            <button
              type="button"
              className="sp-icon-btn"
              aria-label={`Copy item ${index + 1}`}
              disabled={items.length >= limit}
              onClick={() => clone(i)}
            >
              <Icon name="copy" size="sm" />
            </button>
            <button
              type="button"
              className="sp-icon-btn sp-icon-btn--danger"
              aria-label={`Remove item ${index + 1}`}
              onClick={() => remove(i.id)}
            >
              <Icon name="trash-2" size="sm" />
            </button>
          </>
        );
        return (
          <li
            key={i.id}
            className={cx(
              'sp-rr-item',
              `sp-rr-item--${rr.kind}`,
              !real && 'is-blank',
              dragged === index && 'is-dragged',
            )}
            data-issue={`item:${i.id}`}
            {...dragProps(index, real)}
          >
            {sortable && (
              <span
                className={cx('sp-rr-item__grip', !real && 'is-hidden')}
                aria-hidden="true"
                title="Drag to move"
              >
                <MaskIcon src={dragIcon} size={14} />
              </span>
            )}
            {rr.kind === 'menu' ? (
              <>
                <div className="sp-rr-opt">
                  <div className="sp-rr-opt__row">
                    {emoji}
                    <Input
                      aria-label={`Option ${index + 1} title`}
                      placeholder={
                        real ? 'Title' : `Option ${index + 1}: type a title`
                      }
                      maxLength={100}
                      value={i.label}
                      onChange={(e) => edit(i.id, { label: e.target.value })}
                    />
                  </div>
                  {real && (
                    <Input
                      aria-label={`Option ${index + 1} description`}
                      placeholder="Description (optional)"
                      maxLength={100}
                      value={i.description}
                      onChange={(e) =>
                        edit(i.id, { description: e.target.value })
                      }
                    />
                  )}
                </div>
                {real && (
                  <span className="sp-rr-opt__tools">
                    {copyRemove}
                    {gearButton}
                  </span>
                )}
              </>
            ) : (
              <>
                {emoji}
                <div className="sp-rr-item__main">
                  {rr.kind === 'reaction' && (
                    <Combobox
                      label={`Reaction ${index + 1} role`}
                      searchPlaceholder="Search roles"
                      placeholder="Pick a role"
                      value={i.role}
                      onChange={(role) => edit(i.id, { role })}
                      items={roleChoices(i)}
                    />
                  )}
                  {rr.kind === 'button' && (
                    <>
                      <Input
                        aria-label={`Button ${index + 1} name`}
                        placeholder="Button name"
                        maxLength={80}
                        value={i.label}
                        onChange={(e) => edit(i.id, { label: e.target.value })}
                      />
                      <div
                        className="sp-colour-squares"
                        role="radiogroup"
                        aria-label={`Button ${index + 1} colour`}
                      >
                        {colours.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            role="radio"
                            aria-checked={i.colour === c.value}
                            aria-label={c.label}
                            className={cx(
                              'sp-colour-square',
                              `sp-colour-square--${c.value}`,
                              i.colour === c.value && 'is-on',
                            )}
                            onClick={() => edit(i.id, { colour: c.value })}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {real && (
                  <span
                    className={
                      rr.kind === 'button'
                        ? 'sp-rr-opt__tools'
                        : 'sp-rr-item__tools'
                    }
                  >
                    {rr.kind === 'button' ? (
                      <>
                        {copyRemove}
                        {gearButton}
                      </>
                    ) : (
                      <>
                        {gearButton}
                        {copyRemove}
                      </>
                    )}
                  </span>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="sp-rr-items-wrap">
      {list}
      {rr.kind !== 'menu' && (
        <Button
          size="sm"
          icon="plus"
          disabled={items.length >= limit}
          onClick={() =>
            onChange([
              ...items,
              rrItem(rr.kind === 'button' ? { label: 'New role' } : {}),
            ])
          }
        >
          {rr.kind === 'reaction' ? 'Add reaction' : 'Add button'}
        </Button>
      )}
      <p className="sp-hint">
        {items.length} of {limit}{' '}
        {rr.kind === 'menu' ? 'options' : `${rr.kind}s`}
        {sortable ? '. Drag to change the order.' : '.'}
      </p>
      {gearItem && (
        <ItemSettings
          rr={rr}
          item={gearItem}
          roles={roles}
          onChange={(patch) => edit(gearItem.id, patch)}
          onClose={() => setGear(null)}
        />
      )}
    </div>
  );
}

/** How the reactions, buttons or menu show under the message. */
export function RRPreview({ rr }: { rr: ReactionRole }) {
  if (rr.kind === 'reaction')
    return (
      <div className="sp-rr-preview dc-reactions" aria-label="Reactions">
        {rr.items
          .filter((i) => i.emoji)
          .map((i) => (
            <span key={i.id} className="dc-reaction">
              {renderDiscordText(i.emoji)}
              <span>1</span>
            </span>
          ))}
      </div>
    );
  if (rr.kind === 'button') {
    const rows: RRItem[][] = [];
    for (let i = 0; i < rr.items.length; i += 5)
      rows.push(rr.items.slice(i, i + 5));
    return (
      <div className="sp-rr-preview" aria-label="Buttons">
        {rows.map((row, r) => (
          <div key={r} className="dc-row">
            {row.map((b) => (
              <span key={b.id} className={cx('dc-btn', dcStyle[b.colour])}>
                {b.emoji && (
                  <span className="dc-emoji">{renderDiscordText(b.emoji)}</span>
                )}
                {b.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="sp-rr-preview" aria-label="Menu">
      <span className="dc-select">
        <span>{rr.placeholder || 'Make a selection'}</span>
        <Icon name="chevron-down" size="sm" />
      </span>
    </div>
  );
}
