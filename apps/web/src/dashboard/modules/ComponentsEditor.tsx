import { createPortal } from 'react-dom';
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  Checkbox,
  Combobox,
  Icon,
  Input,
  LottieIcon,
  Segmented,
  cx,
  renderDiscordText,
  type ComboItem,
} from '../../ui';
import {
  componentRows,
  folderPath,
  type ButtonColour,
  type MenuOption,
  type StudioAction,
  type StudioButton,
  type StudioComponent,
  type StudioFolder,
  type StudioMenu,
  type StudioState,
  type StudioTemplate,
} from '../../data';
import {
  CloseButton,
  InfoTip,
  MaskIcon,
  moveItem,
  useDismiss,
  useIssue,
  useReorder,
} from './EditorBits';
import { EmojiField } from './EmojiPicker';
import { PlusMenu } from './PlusMenu';
import { newId } from './parts';
import dragIcon from '../../../../../design-system/assets/icons/drag.png';
import linkIcon from '../../../../../design-system/assets/icons/external-link.png';
import removeAnim from '../../../../../design-system/assets/icons/animated-icons/remove-button-hover.json?url';
import gearAnim from '../../../../../design-system/assets/icons/animated-icons/setting-icon-hover.json?url';
import plusAnim from '../../../../../design-system/assets/icons/animated-icons/plus-button-select.json?url';

/**
 * Buttons and menus under a Studio message: shown like Discord shows them,
 * dragged by their handles to rearrange, and set up in a panel that opens
 * when one is clicked.
 */

/** What the settings panels need from the page: templates, roles, limits. */
type StudioData = {
  serverId: string;
  templates: StudioTemplate[];
  folders: StudioFolder[];
  roles: StudioState['roles'];
  sendLimit: number;
};
const StudioDataContext = createContext<StudioData | null>(null);
export function StudioDataProvider({
  value,
  children,
}: {
  value: StudioData;
  children: ReactNode;
}) {
  return (
    <StudioDataContext.Provider value={value}>
      {children}
    </StudioDataContext.Provider>
  );
}
const useStudioData = () => {
  const data = useContext(StudioDataContext);
  if (!data) throw new Error('StudioDataProvider is missing');
  return data;
};

export const MAX_ROWS = 5;
export const newButton = (): StudioButton => ({
  id: newId(),
  type: 'button',
  label: 'Button',
  emoji: '',
  colour: 'blurple',
  link: false,
  url: '',
  actions: [],
});
export const newMenu = (): StudioMenu => ({
  id: newId(),
  type: 'menu',
  placeholder: 'Make a selection',
  multiple: false,
  options: [
    { id: newId(), label: 'Option 1', emoji: '', description: '', actions: [] },
  ],
});
/** Whether one more button, or one more menu, still fits in five rows. */
export function roomFor(list: StudioComponent[], kind: 'button' | 'menu') {
  return (
    componentRows([...list, kind === 'button' ? newButton() : newMenu()])
      .length <= MAX_ROWS
  );
}

/** The red trash button; hovering it fades what it would remove. */
export function TrashButton({
  label,
  onClick,
  onHover,
  className,
}: {
  label: string;
  onClick: () => void;
  onHover?: (on: boolean) => void;
  className?: string;
}) {
  const [play, setPlay] = useState(0);
  return (
    <button
      type="button"
      className={cx('sp-trash', className)}
      aria-label={label}
      onPointerEnter={() => {
        setPlay((n) => n + 1);
        onHover?.(true);
      }}
      onPointerLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      onClick={onClick}
    >
      <LottieIcon src={removeAnim} size={14} playKey={play} solid />
    </button>
  );
}

function DragHandle({
  label,
  onPointerDown,
  onKeyDown,
  disabled,
}: {
  label: string;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="sp-handle"
      aria-label={label}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      <MaskIcon src={dragIcon} size={14} />
    </button>
  );
}

// Actions --------------------------------------------------------------------

const folderLabel = (folders: StudioFolder[], id: string | null) =>
  folderPath({ templates: [], folders }, id)
    .map((f) => f.name)
    .join(' › ') || 'Not in a folder';

function ActionCard({
  action,
  index,
  count,
  issueAt,
  onChange,
  onRemove,
  reorder,
}: {
  action: StudioAction;
  index: number;
  count: number;
  /** Where its problems point: "<button or option>/action:<id>". */
  issueAt: string;
  onChange: (a: StudioAction) => void;
  onRemove: () => void;
  reorder: Omit<ReturnType<typeof useReorder>, 'list'>;
}) {
  const data = useStudioData();
  const [fading, setFading] = useState(false);
  const title =
    action.type === 'send' ? 'Send message template' : 'Give or take role';
  // Templates are listed folder by folder, loose ones first.
  const folderOf = (t: { folderId: string | null }) =>
    t.folderId ? folderLabel(data.folders, t.folderId) : '';
  const templates = [...data.templates].sort((a, b) =>
    folderOf(a).localeCompare(folderOf(b)),
  );
  const templateItems: ComboItem[] = templates.map((t) => ({
    value: t.id,
    label: t.name,
    group: folderLabel(data.folders, t.folderId),
    disabled:
      action.type === 'send' &&
      action.templates.length >= data.sendLimit &&
      !action.templates.includes(t.id),
    ...(action.type === 'send' && action.templates.length >= data.sendLimit
      ? {
          note:
            data.sendLimit === 1
              ? 'Free sends 1 template per action'
              : `Up to ${data.sendLimit} per action`,
        }
      : {}),
  }));
  const roleItems: ComboItem[] = data.roles.map((r) => ({
    value: r.id,
    label: r.name,
    icon: 'at-sign',
    // Roles without a colour show in Discord's grey.
    color: r.color ?? '#99AAB5',
    ...(r.color && r.color2 ? { color2: r.color2 } : {}),
  }));
  return (
    <li
      {...reorder.item(index, action.id)}
      data-issue={issueAt}
      className={cx(
        'sp-action',
        reorder.dropClass(index, count),
        fading && 'is-fading',
      )}
    >
      <DragHandle
        label={`Move action ${index + 1}. Drag it, or use the arrow keys.`}
        disabled={count < 2}
        onPointerDown={reorder.start(index)}
        onKeyDown={reorder.keys(index, count)}
      />
      <div className="sp-action__body">
        <span className="sp-action__title">
          {title}{' '}
          <InfoTip
            text={
              action.type === 'send'
                ? `Sends these templates, one after another. ${data.sendLimit === 1 ? 'Free servers send 1 template per action; Plus sends up to 10.' : `Up to ${data.sendLimit} templates per action.`}`
                : 'Gives the person who clicked these roles, or takes them away. Sparko’s own role must sit above them in Server Settings → Roles.'
            }
          />
        </span>
        {action.type === 'send' ? (
          <>
            <Combobox
              multiple
              label={<span className="sp-sr-only">{title}</span>}
              placeholder="Pick templates"
              searchPlaceholder="Search templates"
              items={templateItems}
              value={action.templates}
              onChange={(templates) =>
                onChange({
                  ...action,
                  templates: templates.slice(0, data.sendLimit),
                })
              }
            />
            <div className="sp-action__checks">
              <Checkbox
                label={
                  <>
                    DM user{' '}
                    <InfoTip text="Sends the templates to the person who clicked, in their DMs, instead of in this channel. If their DMs are closed, Sparko tells them privately." />
                  </>
                }
                checked={action.dm}
                onChange={(dm) =>
                  onChange({
                    ...action,
                    dm,
                    ephemeral: dm ? false : action.ephemeral,
                  })
                }
              />
              <Checkbox
                label={
                  <>
                    Send as ephemeral{' '}
                    <InfoTip text="Sends a reply only the person who clicked can see. It disappears when they reload Discord." />
                  </>
                }
                disabled={action.dm}
                checked={action.ephemeral && !action.dm}
                onChange={(ephemeral) => onChange({ ...action, ephemeral })}
              />
            </div>
          </>
        ) : (
          <>
            <Segmented
              label="Give or take"
              className="sp-action__mode"
              value={action.mode}
              onChange={(mode) => onChange({ ...action, mode })}
              options={[
                { value: 'give', label: 'Give role' },
                { value: 'take', label: 'Take role' },
              ]}
            />
            <Combobox
              multiple
              label={<span className="sp-sr-only">Roles</span>}
              placeholder="Pick roles"
              searchPlaceholder="Search roles"
              items={roleItems}
              value={action.roles}
              onChange={(roles) => onChange({ ...action, roles })}
            />
          </>
        )}
      </div>
      <TrashButton
        label={`Remove action ${index + 1}`}
        className="sp-action__trash"
        onHover={setFading}
        onClick={onRemove}
      />
    </li>
  );
}

/** A list of actions with "Add actions"; they run from top to bottom. */
function ActionsEditor({
  actions,
  onChange,
  issueAt,
  title = 'Add actions',
}: {
  actions: StudioAction[];
  onChange: (actions: StudioAction[]) => void;
  /** The button or option they belong to, for pointing at problems. */
  issueAt: string;
  title?: ReactNode;
}) {
  const { list: listRef, ...reorder } = useReorder({
    onMove: (from, to) => onChange(moveItem(actions, from, to)),
  });
  const add = (a: StudioAction) => onChange([...actions, a]);
  return (
    <div className="sp-actions" data-issue={`${issueAt}/actions`}>
      <div className="sp-actions__head">
        <span className="sp-label">
          {title}{' '}
          <InfoTip text="What happens when someone clicks. Actions run from top to bottom; drag the dots to change the order." />
        </span>
        <PlusMenu
          label="Add an action"
          items={[
            {
              label: 'Send message',
              disabled: actions.length >= 10,
              onSelect: () =>
                add({
                  id: newId(),
                  type: 'send',
                  templates: [],
                  dm: false,
                  ephemeral: false,
                }),
            },
            {
              label: 'Give or take role',
              disabled: actions.length >= 10,
              onSelect: () =>
                add({ id: newId(), type: 'role', mode: 'give', roles: [] }),
            },
          ]}
        />
      </div>
      {actions.length ? (
        <ol ref={listRef} className="sp-actions__list">
          {actions.map((a, i) => (
            <ActionCard
              key={a.id}
              action={a}
              index={i}
              count={actions.length}
              issueAt={`${issueAt}/action:${a.id}`}
              reorder={reorder}
              onChange={(next) =>
                onChange(actions.map((x) => (x.id === a.id ? next : x)))
              }
              onRemove={() => onChange(actions.filter((x) => x.id !== a.id))}
            />
          ))}
        </ol>
      ) : (
        <p className="sp-hint">
          Nothing happens yet. Use + to send templates or give and take roles.
        </p>
      )}
    </div>
  );
}

// Settings panels ------------------------------------------------------------

const colours: { value: ButtonColour; label: string }[] = [
  { value: 'green', label: 'Green' },
  { value: 'blurple', label: 'Blurple' },
  { value: 'red', label: 'Red' },
  { value: 'grey', label: 'Grey' },
];

function Panel({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(true, onClose, box);
  // Shown in the middle of the screen over a blurred page.
  return createPortal(
    <div className="sp-settings-scrim">
      <div
        ref={box}
        className="sp-settings-pop"
        role="dialog"
        aria-label={title}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <CloseButton
          label="Close"
          className="sp-url-pop__x"
          onClick={onClose}
        />
        <div className="sp-settings-pop__head">
          <h3 className="sp-settings-pop__title">{title}</h3>
          <p className="sp-hint">{description}</p>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ButtonSettings({
  button,
  onChange,
  onClose,
}: {
  button: StudioButton;
  onChange: (b: StudioButton) => void;
  onClose: () => void;
}) {
  const data = useStudioData();
  return (
    <Panel
      title="Button settings"
      description="How it looks, and what it does when someone clicks it."
      onClose={onClose}
    >
      <div className="sp-bs__top">
        <div className="sp-field">
          <span className="sp-label">Emoji</span>
          <EmojiField
            serverId={data.serverId}
            label="Button"
            value={button.emoji}
            onChange={(emoji) => onChange({ ...button, emoji })}
          />
        </div>
        <div data-issue={`component:${button.id}/label`}>
          <Input
            label={
              <>
                Button text{' '}
                <InfoTip text="Up to 80 characters. A button needs text, an emoji, or both." />
              </>
            }
            maxLength={80}
            value={button.label}
            autoFocus
            onChange={(e) => onChange({ ...button, label: e.target.value })}
          />
        </div>
        <div
          className="sp-colour-squares"
          role="radiogroup"
          aria-label="Button colour"
        >
          {colours.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={button.colour === c.value}
              aria-label={c.label}
              title={button.link ? 'Link buttons are always grey' : c.label}
              disabled={button.link}
              className={cx(
                'sp-colour-square',
                `sp-colour-square--${c.value}`,
                (button.link
                  ? c.value === 'grey'
                  : button.colour === c.value) && 'is-on',
              )}
              onClick={() => onChange({ ...button, colour: c.value })}
            />
          ))}
        </div>
      </div>
      <hr className="sp-settings-pop__sep" />
      <Segmented
        label="Button type"
        className="sp-settings-pop__type"
        value={button.link ? 'link' : 'action'}
        onChange={(t) => onChange({ ...button, link: t === 'link' })}
        options={[
          { value: 'link', label: 'Link button' },
          { value: 'action', label: 'Action button' },
        ]}
      />
      {button.link ? (
        <Input
          data-issue={`component:${button.id}/url`}
          label="URL"
          placeholder="https://"
          value={button.url}
          hint="Link buttons are always grey in Discord."
          error={
            button.url && !/^https:\/\/\S+$/.test(button.url)
              ? 'Use a link that starts with https://.'
              : undefined
          }
          onChange={(e) => onChange({ ...button, url: e.target.value.trim() })}
        />
      ) : (
        <ActionsEditor
          actions={button.actions}
          issueAt={`component:${button.id}`}
          onChange={(actions) => onChange({ ...button, actions })}
        />
      )}
    </Panel>
  );
}

function GearButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const [play, setPlay] = useState(0);
  return (
    <button
      type="button"
      className="sp-gear"
      aria-label={label}
      onPointerEnter={() => setPlay((n) => n + 1)}
      onClick={onClick}
    >
      <LottieIcon src={gearAnim} size={28} playKey={play} solid />
    </button>
  );
}

function MenuSettings({
  menu,
  onChange,
  onClose,
}: {
  menu: StudioMenu;
  onChange: (m: StudioMenu) => void;
  onClose: () => void;
}) {
  const data = useStudioData();
  const issue = useIssue();
  // The option whose actions are shown, or null for the list of options;
  // opened for a problem in one option's actions, it starts on those.
  const [optionId, setOptionId] = useState<string | null>(
    () =>
      issue?.at.match(
        new RegExp(`^component:${menu.id}/option:([\\w-]+)/action:`),
      )?.[1] ?? null,
  );
  const [addPlay, setAddPlay] = useState(0);
  const { list: listRef, ...reorder } = useReorder({
    onMove: (from, to) =>
      onChange({ ...menu, options: moveItem(menu.options, from, to) }),
  });
  const editOption = (id: string, patch: Partial<MenuOption>) =>
    onChange({
      ...menu,
      options: menu.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  const opened = menu.options.find((o) => o.id === optionId);
  const number = opened ? menu.options.indexOf(opened) + 1 : 0;
  return (
    <Panel
      title="Menu settings"
      description="What people can pick, and what each pick does."
      onClose={onClose}
    >
      <Input
        label={
          <>
            Placeholder text{' '}
            <InfoTip text="The grey text shown in the menu before anyone picks an option." />
          </>
        }
        maxLength={150}
        value={menu.placeholder}
        autoFocus
        onChange={(e) => onChange({ ...menu, placeholder: e.target.value })}
      />
      <Checkbox
        label={
          <>
            Multiple choice{' '}
            <InfoTip text="Lets people pick more than one option at once. Each picked option runs its own actions." />
          </>
        }
        checked={menu.multiple}
        onChange={(multiple) => onChange({ ...menu, multiple })}
      />
      <hr className="sp-settings-pop__sep" />
      {opened ? (
        <div className="sp-option-actions">
          <div className="sp-option-actions__head">
            <Button
              size="sm"
              icon="arrow-left"
              onClick={() => setOptionId(null)}
            >
              Return
            </Button>
            <span className="sp-hint">Option {number} actions</span>
          </div>
          <ActionsEditor
            actions={opened.actions}
            issueAt={`component:${menu.id}/option:${opened.id}`}
            onChange={(actions) => editOption(opened.id, { actions })}
          />
        </div>
      ) : (
        <div className="sp-options" data-issue={`component:${menu.id}/options`}>
          <div className="sp-actions__head">
            <span className="sp-label">
              Options{' '}
              <InfoTip text="Up to 25 options. Drag the dots to reorder them, and use the gear to set what each one does." />
            </span>
            <Button
              size="sm"
              disabled={menu.options.length >= 25}
              onPointerDown={() => setAddPlay((n) => n + 1)}
              onClick={() =>
                onChange({
                  ...menu,
                  options: [
                    ...menu.options,
                    {
                      id: newId(),
                      label: `Option ${menu.options.length + 1}`,
                      emoji: '',
                      description: '',
                      actions: [],
                    },
                  ],
                })
              }
            >
              <LottieIcon src={plusAnim} size={18} playKey={addPlay} solid />
              Add option
            </Button>
          </div>
          <ol ref={listRef} className="sp-actions__list">
            {menu.options.map((o, i) => (
              <li
                key={o.id}
                {...reorder.item(i, o.id)}
                data-issue={`component:${menu.id}/option:${o.id}`}
                className={cx(
                  'sp-action sp-option',
                  reorder.dropClass(i, menu.options.length),
                )}
              >
                <DragHandle
                  label={`Move option ${i + 1}. Drag it, or use the arrow keys.`}
                  disabled={menu.options.length < 2}
                  onPointerDown={reorder.start(i)}
                  onKeyDown={reorder.keys(i, menu.options.length)}
                />
                <div className="sp-option__body">
                  <div className="sp-field">
                    <span className="sp-label sp-label--small">Emoji</span>
                    <EmojiField
                      serverId={data.serverId}
                      label={`Option ${i + 1}`}
                      value={o.emoji}
                      onChange={(emoji) => editOption(o.id, { emoji })}
                    />
                  </div>
                  <Input
                    label={`Option ${i + 1} title`}
                    maxLength={100}
                    value={o.label}
                    onChange={(e) =>
                      editOption(o.id, { label: e.target.value })
                    }
                  />
                  <div className="sp-field sp-option__gear">
                    <span className="sp-label sp-label--small">
                      Actions{o.actions.length ? ` (${o.actions.length})` : ''}
                    </span>
                    <GearButton
                      label={`Actions for option ${i + 1}`}
                      onClick={() => setOptionId(o.id)}
                    />
                  </div>
                  <Input
                    label="Description"
                    maxLength={100}
                    value={o.description}
                    onChange={(e) =>
                      editOption(o.id, { description: e.target.value })
                    }
                  />
                </div>
                {menu.options.length > 1 && (
                  <TrashButton
                    label={`Remove option ${i + 1}`}
                    className="sp-action__trash"
                    onClick={() =>
                      onChange({
                        ...menu,
                        options: menu.options.filter((x) => x.id !== o.id),
                      })
                    }
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}

// In the preview -------------------------------------------------------------

const dcStyle: Record<ButtonColour, string> = {
  blurple: 'dc-btn--primary',
  grey: '',
  green: 'dc-btn--success',
  red: 'dc-btn--danger',
};

/** What an item needs from whatever lets it be dragged. */
export type ItemDrag = {
  item: (
    i: number,
    key?: string,
  ) => { [attr: `data-${string}`]: string | number | undefined };
  start: (i: number) => (e: React.PointerEvent<HTMLElement>) => void;
  keys: (
    i: number,
    count: number,
  ) => (e: React.KeyboardEvent<HTMLElement>) => void;
  dropClass: (i: number, count?: number) => string | null;
};

/** A button or menu in the preview: click to edit it, drag its dots to move it. */
export function ComponentItem({
  component,
  index,
  count,
  reorder,
  startOpen,
  onChange,
  onRemove,
}: {
  component: StudioComponent;
  index: number;
  count: number;
  reorder: ItemDrag;
  startOpen: boolean;
  onChange: (c: StudioComponent) => void;
  onRemove: () => void;
}) {
  const [opened, setOpen] = useState(startOpen);
  const [fading, setFading] = useState(false);
  const c = component;
  // A problem in its settings opens them, until they're closed again.
  const issue = useIssue();
  const [closedFor, setClosedFor] = useState(0);
  const forced =
    !!issue &&
    issue.n !== closedFor &&
    (issue.at === `component:${c.id}` ||
      issue.at.startsWith(`component:${c.id}/`));
  const open = opened || forced;
  const close = () => {
    setOpen(false);
    setClosedFor(issue?.n ?? 0);
  };
  const name = c.type === 'button' ? `button ${c.label || index + 1}` : 'menu';
  const handle = (
    <DragHandle
      label={`Move ${name}. Drag it, or use the arrow keys.`}
      disabled={count < 2}
      onPointerDown={reorder.start(index)}
      onKeyDown={reorder.keys(index, count)}
    />
  );
  return (
    <div
      {...reorder.item(index, component.id)}
      data-issue={`component:${c.id}`}
      className={cx(
        'sp-comp',
        c.type === 'menu' ? 'sp-comp--menu' : 'sp-comp--button',
        reorder.dropClass(index, count),
        fading && 'is-fading',
      )}
    >
      {c.type === 'button' ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Edit ${name}`}
          aria-expanded={open}
          className={cx('dc-btn sp-comp__face', !c.link && dcStyle[c.colour])}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (
              e.target === e.currentTarget &&
              (e.key === 'Enter' || e.key === ' ')
            ) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {handle}
          {c.emoji && (
            <span className="dc-emoji">{renderDiscordText(c.emoji)}</span>
          )}
          {c.label && <span>{c.label}</span>}
          {c.link && <MaskIcon src={linkIcon} size={14} />}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Edit menu"
          aria-expanded={open}
          className="dc-select sp-comp__face"
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (
              e.target === e.currentTarget &&
              (e.key === 'Enter' || e.key === ' ')
            ) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {handle}
          <span>{c.placeholder || 'Make a selection'}</span>
          <Icon name="chevron-down" />
        </div>
      )}
      <TrashButton
        label={`Remove ${name}`}
        className="sp-comp__trash"
        onHover={setFading}
        onClick={onRemove}
      />
      {open &&
        (c.type === 'button' ? (
          <ButtonSettings button={c} onChange={onChange} onClose={close} />
        ) : (
          <MenuSettings menu={c} onChange={onChange} onClose={close} />
        ))}
    </div>
  );
}

/**
 * The buttons and menus under the message, laid out in Discord's rows.
 * Embeds sit above them; nothing can be dragged into an embed.
 */
export function ComponentsArea({
  components,
  onChange,
  focusId,
}: {
  components: StudioComponent[];
  onChange: (list: StudioComponent[]) => void;
  /** A button or menu that was just added opens its settings. */
  focusId: string | null;
}) {
  const { list: listRef, ...reorder } = useReorder({
    mode: 'grid',
    onMove: (from, to) => onChange(moveItem(components, from, to)),
  });
  if (!components.length) return null;
  let index = 0;
  return (
    <div
      ref={listRef}
      className={cx(
        'dc-components sp-comps',
        reorder.dragging && 'is-dragging',
      )}
    >
      {componentRows(components).map((row) => (
        <div
          key={row[0]!.id}
          className={cx(
            'dc-row',
            row[0]!.type === 'menu' && 'sp-comps__menu-row',
          )}
        >
          {row.map((c) => {
            const i = index++;
            return (
              <ComponentItem
                key={c.id}
                component={c}
                index={i}
                count={components.length}
                reorder={reorder}
                startOpen={c.id === focusId}
                onChange={(next) =>
                  onChange(components.map((x) => (x.id === c.id ? next : x)))
                }
                onRemove={() =>
                  onChange(components.filter((x) => x.id !== c.id))
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
