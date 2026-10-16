import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  AnimatedButton,
  Badge,
  Button,
  EmptyState,
  Icon,
  Input,
  LottieIcon,
  Modal,
  cx,
  useToast,
} from '../../ui';
import {
  folderContents,
  folderPath,
  itemsIn,
  movesIntoItself,
  uniqueTemplateName,
  useStudioActions,
  type LibraryItem,
  type LibraryMove,
  type Server,
  type StudioFolder,
  type StudioMessage,
  type StudioState,
  type StudioTemplate,
} from '../../data';
import { AnimatedIconButton, HoverTip, measure, slideFrom } from './EditorBits';
import { svgIcons } from '../../ui';

import folderAddAnim from '../../../../../design-system/assets/icons/folder-icon-add.json?url';
import folderSvg from '../../../../../design-system/assets/icons/folder-icon.svg?url';
import messageSvg from '../../../../../design-system/assets/icons/message-icon.svg?url';
import { animIcons } from '../../ui';
export const plusAnimations = animIcons.plus;
const editAnim = animIcons.edit.hover;
const cloneAnim = animIcons.clone.hover;
const removeAnim = animIcons.remove.hover;
const folderAnim = animIcons.folder.hover;

/** Where a dragged card would land. */
type Target =
  | { type: 'before' | 'after' | 'into'; key: string }
  | { type: 'end' }
  | { type: 'crumb'; folderId: string | null };

const keyOf = (x: { kind: string; id: string }) => `${x.kind}:${x.id}`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
/** How long a finger has to rest on a card before it can be dragged. */
const HOLD_MS = 2000;

function MaskIcon({ src, label }: { src: string; label: string }) {
  return (
    <span
      className="sp-mask-icon"
      role="img"
      aria-label={label}
      style={{ '--sp-mask': `url("${src}")` } as CSSProperties}
    />
  );
}

const tagLook = {
  welcome: { label: 'Welcome Message', icon: svgIcons.welcomeTag },
  'reaction-role': { label: 'Reaction Role', icon: svgIcons.reactionRole },
} as const;

/** Tags for where else a template is used; hovering says exactly where. */
function UsedTags({ uses }: { uses: NonNullable<StudioTemplate['usedIn']> }) {
  const kinds = [...new Set(uses.map((u) => u.kind))];
  return (
    <span className="sp-lib-tags">
      {kinds.map((kind) => {
        const where = uses.filter((u) => u.kind === kind).map((u) => u.where);
        return (
          <HoverTip
            key={kind}
            className={`sp-lib-tag sp-lib-tag--${kind}`}
            text={`This message template is currently being used in ${where.join(', ')}.`}
          >
            <MaskIcon src={tagLook[kind].icon} label="" />
            {tagLook[kind].label}
          </HoverTip>
        );
      })}
    </span>
  );
}

/** The folder picture: opens while hovered, and fills up when something lands in it. */
function FolderPicture({ open, added }: { open: boolean; added: number }) {
  const [adding, setAdding] = useState(0);
  // Drops counted before this card appeared (say, before opening the
  // folder and coming back) don't play again.
  const [shown, setShown] = useState(added);
  if (added !== shown) {
    setShown(added);
    if (added) setAdding(added);
  }
  return (
    <span className="sp-lib-card__icon">
      <LottieIcon
        src={folderAnim}
        size={40}
        open={open}
        className={cx(adding > 0 && 'is-hidden')}
      />
      {adding > 0 && (
        <LottieIcon
          src={folderAddAnim}
          size={40}
          playKey={adding}
          from={25}
          className="sp-lib-card__adding"
          onDone={() => setAdding(0)}
        />
      )}
    </span>
  );
}

type Confirm =
  | { kind: 'template'; item: StudioTemplate }
  | { kind: 'folder'; item: StudioFolder; step: 1 | 2 };

export function StudioLibrary({
  server,
  studio,
  current,
  editingId,
  onEdit,
}: {
  server: Server;
  studio: StudioState;
  /** The message in the editor, for "+ Template". */
  current: StudioMessage;
  /** The template being edited in the editor, if any. */
  editingId: string | null;
  onEdit: (t: StudioTemplate) => void;
}) {
  const actions = useStudioActions(server.id);
  const toast = useToast();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [naming, setNaming] = useState<{
    kind: 'template' | 'folder';
    folder?: StudioFolder;
    name: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [drag, setDrag] = useState<{
    key: string;
    keyboard: boolean;
  } | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    width: number;
    dx: number;
    dy: number;
  } | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, number>>({});
  const [announce, setAnnounce] = useState('');
  const list = useRef<HTMLUListElement>(null);

  // A folder that was deleted elsewhere closes.
  const folderGone =
    folderId !== null && !studio.folders.some((f) => f.id === folderId);
  if (folderGone) setFolderId(null);

  const items = itemsIn(studio, folderId);
  // After a move, the cards slide to their new places; the one dropped
  // glides from where it was let go.
  const cards = () =>
    Array.from(
      list.current?.querySelectorAll<HTMLElement>('[data-lib-key]') ?? [],
    );
  const cardKey = (el: HTMLElement) => el.dataset.libKey;
  const slide = useRef<Map<unknown, DOMRect> | null>(null);
  const order = items.map(keyOf).join();
  useLayoutEffect(() => {
    const before = slide.current;
    if (!before) return;
    slide.current = null;
    slideFrom(cards, before, { keyOf: cardKey, now: true });
  }, [order]);
  const path = folderPath(studio, folderId);
  const fullTemplates = studio.templates.length >= studio.templateLimit;
  const fullFolders = studio.folders.length >= studio.folderLimit;
  const failed = (title: string) => (e: unknown) =>
    toast({
      tone: 'danger',
      title,
      body: e instanceof Error ? e.message : 'Try again in a moment.',
    });

  // The move a target stands for, or null when it changes nothing.
  const moveFor = (key: string, t: Target): LibraryMove | null => {
    const [kind, id] = key.split(':') as ['template' | 'folder', string];
    const others = items.filter((x) => keyOf(x) !== key);
    let move: LibraryMove;
    if (t.type === 'into' || t.type === 'crumb') {
      const into = t.type === 'crumb' ? t.folderId : t.key.split(':')[1]!;
      move = {
        kind,
        id,
        folderId: into,
        index: itemsIn(studio, into).filter((x) => keyOf(x) !== key).length,
      };
    } else {
      const index =
        t.type === 'end'
          ? others.length
          : others.findIndex((x) => keyOf(x) === t.key) +
            (t.type === 'after' ? 1 : 0);
      move = { kind, id, folderId, index };
    }
    if (movesIntoItself(studio, move)) return null;
    const now = items.findIndex((x) => keyOf(x) === key);
    if (move.folderId === folderId && move.index === now) return null;
    return move;
  };
  const describe = (t: Target | null) => {
    if (!t) return 'Not over a place to drop.';
    if (t.type === 'crumb')
      return `Move to ${path.find((f) => f.id === t.folderId)?.name ?? 'all templates'}.`;
    if (t.type === 'end') return 'Move to the end.';
    const other = items.find((x) => keyOf(x) === t.key);
    const name = other?.item.name ?? '';
    return t.type === 'into'
      ? `Move into the folder ${name}.`
      : `Move ${t.type} ${name}.`;
  };
  const finish = (key: string, t: Target | null) => {
    setDrag(null);
    setTarget(null);
    setGhost(null);
    const move = t && moveFor(key, t);
    if (!move) {
      setAnnounce('Nothing moved.');
      return;
    }
    if (t.type === 'into')
      setAdded((a) => ({ ...a, [t.key]: (a[t.key] ?? 0) + 1 }));
    else {
      const before = measure(cards(), cardKey);
      const ghostBox = document
        .querySelector('.sp-lib-ghost')
        ?.getBoundingClientRect();
      if (ghostBox) before.set(key, ghostBox);
      slide.current = before;
    }
    setAnnounce(`Moved. ${describe(t)}`);
    actions.move.mutate(move, { onError: failed('Couldn’t move that') });
  };

  // Pointer dragging --------------------------------------------------------
  const pending = useRef<{
    key: string;
    x: number;
    y: number;
    timer?: number;
    started: boolean;
    touch: boolean;
    card: HTMLElement;
  } | null>(null);
  const live = useRef<{ target: Target | null; dropped: boolean }>({
    target: null,
    dropped: false,
  });

  const targetAt = (x: number, y: number, key: string): Target | null => {
    const el = document.elementFromPoint(x, y);
    const crumb = el?.closest<HTMLElement>('[data-lib-crumb]');
    if (crumb) {
      const id = crumb.dataset.libCrumb!;
      return { type: 'crumb', folderId: id === 'top' ? null : id };
    }
    const card = el?.closest<HTMLElement>('[data-lib-key]');
    if (!card) {
      const box = list.current?.getBoundingClientRect();
      return box &&
        x >= box.left &&
        x <= box.right &&
        y >= box.top &&
        y <= box.bottom
        ? { type: 'end' }
        : null;
    }
    const over = card.dataset.libKey!;
    if (over === key) return null;
    const r = card.getBoundingClientRect();
    if (
      over.startsWith('folder:') &&
      x > r.left + r.width * 0.2 &&
      x < r.right - r.width * 0.2 &&
      y > r.top + r.height * 0.2 &&
      y < r.bottom - r.height * 0.2
    )
      return { type: 'into', key: over };
    return { type: x < r.left + r.width / 2 ? 'before' : 'after', key: over };
  };

  const begin = (
    p: NonNullable<typeof pending.current>,
    x: number,
    y: number,
  ) => {
    p.started = true;
    setPressing(null);
    const r = p.card.getBoundingClientRect();
    setDrag({ key: p.key, keyboard: false });
    setGhost({ x, y, width: r.width, dx: p.x - r.left, dy: p.y - r.top });
    live.current.target = null;
    setTarget(null);
    if (p.touch) navigator.vibrate?.(15);
    const name = items.find((i) => keyOf(i) === p.key)?.item.name;
    setAnnounce(`Picked up ${name}.`);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      const far = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (!p.started) {
        if (p.touch) {
          // Moving before the hold is up means the finger is scrolling.
          if (far > 10) {
            window.clearTimeout(p.timer);
            pending.current = null;
            setPressing(null);
          }
          return;
        }
        if (far < 5) return;
        begin(p, e.clientX, e.clientY);
      }
      setGhost((g) => g && { ...g, x: e.clientX, y: e.clientY });
      const t = targetAt(e.clientX, e.clientY, p.key);
      live.current.target = t;
      setTarget(t);
    };
    const up = () => {
      const p = pending.current;
      if (!p) return;
      window.clearTimeout(p.timer);
      pending.current = null;
      setPressing(null);
      if (p.started) {
        // The click that follows a drop shouldn't open a folder.
        live.current.dropped = true;
        finish(p.key, live.current.target);
      }
    };
    const cancel = () => {
      const p = pending.current;
      if (!p) return;
      window.clearTimeout(p.timer);
      pending.current = null;
      setPressing(null);
      if (p.started) finish(p.key, null);
    };
    // Once a drag has started, a finger moving shouldn't scroll the page.
    const touchMove = (e: TouchEvent) => {
      if (pending.current?.started) e.preventDefault();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('keydown', key);
    };
  });

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, key: string) => {
    if (e.button !== 0 || drag?.keyboard) return;
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    live.current.dropped = false;
    const touch = e.pointerType !== 'mouse';
    const p: NonNullable<typeof pending.current> = {
      key,
      x: e.clientX,
      y: e.clientY,
      started: false,
      touch,
      card: e.currentTarget,
    };
    pending.current = p;
    if (touch) {
      setPressing(key);
      p.timer = window.setTimeout(() => begin(p, p.x, p.y), HOLD_MS);
    }
  };

  // Keyboard dragging -------------------------------------------------------
  const keyboardTargets = (key: string): Target[] => {
    const others = items.filter((x) => keyOf(x) !== key);
    return [
      ...path
        .slice(0, -1)
        .reverse()
        .map((f) => ({ type: 'crumb' as const, folderId: f.id })),
      ...(folderId === null
        ? []
        : [{ type: 'crumb' as const, folderId: null }]),
      ...others.flatMap((x): Target[] =>
        x.kind === 'folder' && moveFor(key, { type: 'into', key: keyOf(x) })
          ? [
              { type: 'before', key: keyOf(x) },
              { type: 'into', key: keyOf(x) },
            ]
          : [{ type: 'before', key: keyOf(x) }],
      ),
      { type: 'end' },
    ];
  };
  const sameTarget = (a: Target | null, b: Target) =>
    !!a && JSON.stringify(a) === JSON.stringify(b);

  const onCardKey = (e: React.KeyboardEvent<HTMLElement>, x: LibraryItem) => {
    if (e.target !== e.currentTarget) return;
    const key = keyOf(x);
    if (drag?.keyboard && drag.key === key) {
      const targets = keyboardTargets(key);
      const at = targets.findIndex((t) => sameTarget(target, t));
      const step = (by: number) => {
        e.preventDefault();
        const next =
          targets[Math.max(0, Math.min(targets.length - 1, at + by))]!;
        setTarget(next);
        setAnnounce(describe(next));
      };
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        finish(key, target);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setDrag(null);
        setTarget(null);
        setAnnounce('Move cancelled.');
      }
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      const next = items[items.findIndex((i) => keyOf(i) === key) + 1];
      setDrag({ key, keyboard: true });
      setTarget(next ? { type: 'before', key: keyOf(next) } : { type: 'end' });
      setAnnounce(
        `Picked up ${x.item.name}. Use the arrow keys to choose a place, Space to drop it there, or Escape to cancel.`,
      );
    } else if (e.key === 'Enter' && x.kind === 'folder') {
      e.preventDefault();
      setFolderId(x.id);
    }
  };

  // Actions -----------------------------------------------------------------
  const saveName = () => {
    if (!naming) return;
    const name = naming.name.trim();
    if (!name) return;
    const done = () => setNaming(null);
    if (naming.folder)
      actions.renameFolder.mutate(
        { id: naming.folder.id, name },
        { onSuccess: done, onError: failed('Couldn’t rename the folder') },
      );
    else if (naming.kind === 'folder')
      actions.addFolder.mutate(
        { name, parentId: folderId },
        { onSuccess: done, onError: failed('Couldn’t add the folder') },
      );
    else {
      // A name that's taken gets a number, as the server does.
      const saved = uniqueTemplateName(studio.templates, name);
      actions.saveTemplate.mutate(
        { name, message: current, folderId },
        {
          onSuccess: () => {
            done();
            toast({ tone: 'success', title: `Saved “${saved}”` });
          },
          onError: failed('Couldn’t save the template'),
        },
      );
    }
  };
  const namingBusy =
    actions.renameFolder.isPending ||
    actions.addFolder.isPending ||
    actions.saveTemplate.isPending;

  const confirmDelete = () => {
    if (!confirm) return;
    if (confirm.kind === 'template') {
      actions.deleteTemplate.mutate(confirm.item.id, {
        onSuccess: () => setConfirm(null),
        onError: failed('Couldn’t delete the template'),
      });
      return;
    }
    const inside = folderContents(studio, confirm.item.id);
    if (confirm.step === 1 && inside.templates + inside.folders > 0) {
      setConfirm({ ...confirm, step: 2 });
      return;
    }
    actions.deleteFolder.mutate(confirm.item.id, {
      onSuccess: () => setConfirm(null),
      onError: failed('Couldn’t delete the folder'),
    });
  };

  const confirmText = (() => {
    if (!confirm) return null;
    if (confirm.kind === 'template')
      return {
        title: `Delete “${confirm.item.name}”?`,
        body: 'This can’t be undone. Messages already posted stay in Discord.',
        button: 'Delete',
      };
    const inside = folderContents(studio, confirm.item.id);
    const what = [
      inside.templates ? plural(inside.templates, 'template') : '',
      inside.folders ? plural(inside.folders, 'folder') : '',
    ]
      .filter(Boolean)
      .join(' and ');
    if (!what)
      return {
        title: `Delete “${confirm.item.name}”?`,
        body: 'This can’t be undone.',
        button: 'Delete',
      };
    return confirm.step === 1
      ? {
          title: `Delete “${confirm.item.name}” and everything in it?`,
          body: `It holds ${what}. They’ll be deleted with it, and this can’t be undone.`,
          button: 'Continue',
        }
      : {
          title: 'Are you sure?',
          body: `${what[0]!.toUpperCase()}${what.slice(1)} will be deleted for good, along with “${confirm.item.name}”.`,
          button: 'Delete everything',
        };
  })();

  const dropClass = (key: string) =>
    target && 'key' in target && target.key === key
      ? `is-drop-${target.type}`
      : null;
  const dragging = drag?.key;
  const dragged = dragging
    ? items.find((x) => keyOf(x) === dragging)
    : undefined;

  return (
    <div className="sp-stack">
      <div className="sp-inbox-bar">
        <p className="sp-hint sp-lib-usage">
          You have {studio.templates.length}/{studio.templateLimit}{' '}
          <MaskIcon src={messageSvg} label="templates" />,{' '}
          {studio.folders.length}/{studio.folderLimit}{' '}
          <MaskIcon src={folderSvg} label="folders" />
        </p>
        <div className="sp-item-box__row">
          <AnimatedIconButton
            size="sm"
            {...plusAnimations}
            disabled={fullTemplates}
            aria-label="New template"
            onClick={() =>
              setNaming({
                kind: 'template',
                name: current.name.trim() || 'Untitled',
              })
            }
          >
            Template
          </AnimatedIconButton>
          <AnimatedIconButton
            size="sm"
            {...plusAnimations}
            disabled={fullFolders}
            aria-label="New folder"
            onClick={() => setNaming({ kind: 'folder', name: '' })}
          >
            Folder
          </AnimatedIconButton>
        </div>
      </div>

      {folderId !== null && (
        <nav aria-label="Folders" className="sp-lib-crumbs">
          {[{ id: null, name: 'All templates' }, ...path].map((f, i, all) => {
            const last = i === all.length - 1;
            const drop = target?.type === 'crumb' && target.folderId === f.id;
            return (
              <span key={f.id ?? 'top'} className="sp-lib-crumbs__item">
                {i > 0 && <Icon name="chevron-right" />}
                {last ? (
                  <span aria-current="page">{f.name}</span>
                ) : (
                  <button
                    type="button"
                    className={cx('sp-lib-crumb', drop && 'is-drop')}
                    data-lib-crumb={f.id ?? 'top'}
                    onClick={() => setFolderId(f.id)}
                  >
                    {f.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {items.length ? (
        <ul
          ref={list}
          className={cx('sp-lib-grid', drag && 'is-dragging')}
          aria-label={path.at(-1)?.name ?? 'Templates'}
          aria-describedby="sp-lib-help"
        >
          {items.map((x) => {
            const key = keyOf(x);
            const isFolder = x.kind === 'folder';
            const inside = isFolder ? folderContents(studio, x.id) : null;
            return (
              <li
                key={key}
                data-lib-key={key}
                tabIndex={0}
                aria-roledescription="Draggable card"
                aria-label={`${isFolder ? 'Folder' : 'Template'} ${x.item.name}`}
                aria-describedby="sp-lib-help"
                className={cx(
                  'sp-card sp-lib-card',
                  isFolder && 'sp-lib-card--folder',
                  dragging === key && 'is-dragged',
                  pressing === key && 'is-pressing',
                  dropClass(key),
                )}
                onPointerDown={(e) => onPointerDown(e, key)}
                onPointerEnter={() => setHovered(key)}
                onPointerLeave={() => setHovered((h) => (h === key ? null : h))}
                onClick={(e) => {
                  if (
                    isFolder &&
                    !drag &&
                    !live.current.dropped &&
                    !(e.target as HTMLElement).closest('button')
                  )
                    setFolderId(x.id);
                }}
                onKeyDown={(e) => onCardKey(e, x)}
                onContextMenu={(e) => pressing === key && e.preventDefault()}
              >
                {isFolder && (
                  <FolderPicture
                    open={
                      (hovered === key && !drag) ||
                      (target?.type === 'into' && target.key === key)
                    }
                    added={added[key] ?? 0}
                  />
                )}
                {x.kind === 'template' && !!x.item.usedIn?.length && (
                  <UsedTags uses={x.item.usedIn} />
                )}
                <div className="sp-lib-card__titles">
                  <h3 className="sp-lib-card__name">
                    <span className="sp-lib-card__text">{x.item.name}</span>
                    {x.kind === 'template' && x.id === editingId && (
                      <Badge size="sm" tone="success">
                        Editing
                      </Badge>
                    )}
                  </h3>
                  <p className="sp-hint sp-lib-card__meta">
                    {x.kind === 'template'
                      ? x.item.meta
                      : inside!.templates + inside!.folders
                        ? `Containing ${plural(inside!.templates, 'template')}${inside!.folders ? ` and ${plural(inside!.folders, 'folder')}` : ''}.`
                        : 'Empty. Drag templates here.'}
                  </p>
                </div>
                <div className="sp-lib-card__actions">
                  <AnimatedButton
                    anim={editAnim}
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${x.item.name}`}
                    onClick={() =>
                      x.kind === 'template'
                        ? onEdit(x.item)
                        : setNaming({
                            kind: 'folder',
                            folder: x.item,
                            name: x.item.name,
                          })
                    }
                  >
                    Edit
                  </AnimatedButton>
                  {x.kind === 'template' && (
                    <AnimatedButton
                      anim={cloneAnim}
                      solid
                      variant="ghost"
                      size="sm"
                      disabled={
                        fullTemplates || actions.cloneTemplate.isPending
                      }
                      aria-label={`Clone ${x.item.name}`}
                      onClick={() =>
                        actions.cloneTemplate.mutate(x.id, {
                          onError: failed('Couldn’t clone the template'),
                        })
                      }
                    >
                      Clone
                    </AnimatedButton>
                  )}
                  <AnimatedButton
                    anim={removeAnim}
                    solid
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${x.item.name}`}
                    onClick={() =>
                      setConfirm(
                        x.kind === 'template'
                          ? { kind: 'template', item: x.item }
                          : { kind: 'folder', item: x.item, step: 1 },
                      )
                    }
                  >
                    Delete
                  </AnimatedButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="sp-card">
          <EmptyState
            icon={folderId ? 'folder-open' : 'copy'}
            title={folderId ? 'This folder is empty' : 'No templates yet'}
          >
            {folderId
              ? 'Drag templates or folders onto it, or add a new one here.'
              : 'Save a message you post often, like rules or a weekly recap, and start from it next time.'}
          </EmptyState>
        </div>
      )}

      <p id="sp-lib-help" className="sp-sr-only">
        Press Space to pick a card up, the arrow keys to choose where it goes,
        and Space again to drop it. Enter opens a folder.
      </p>
      <p className="sp-sr-only" aria-live="polite">
        {announce}
      </p>

      {ghost && dragged && (
        <div
          className="sp-card sp-lib-card sp-lib-ghost"
          aria-hidden="true"
          style={{
            width: ghost.width,
            transform: `translate(${ghost.x - ghost.dx}px, ${ghost.y - ghost.dy}px)`,
          }}
        >
          <div className="sp-lib-card__titles">
            <h3 className="sp-lib-card__name">
              <span className="sp-lib-card__text">{dragged.item.name}</span>
            </h3>
          </div>
        </div>
      )}

      <Modal
        open={!!naming}
        onClose={() => setNaming(null)}
        title={
          naming?.folder
            ? 'Rename folder'
            : naming?.kind === 'folder'
              ? 'New folder'
              : 'Save as a template'
        }
        description={
          naming?.kind === 'template'
            ? 'Saves the message that’s in the editor now.'
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="sp-lib-name"
              loading={namingBusy}
              disabled={!naming?.name.trim()}
            >
              {naming?.folder ? 'Rename' : 'Save'}
            </Button>
          </>
        }
      >
        <form
          id="sp-lib-name"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <Input
            label="Name"
            value={naming?.name ?? ''}
            maxLength={80}
            autoFocus
            onChange={(e) =>
              setNaming((n) => n && { ...n, name: e.target.value })
            }
          />
        </form>
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        icon="trash-2"
        title={confirmText?.title}
        footer={
          <>
            <Button variant="ghost" autoFocus onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={
                actions.deleteTemplate.isPending ||
                actions.deleteFolder.isPending
              }
              onClick={confirmDelete}
            >
              {confirmText?.button}
            </Button>
          </>
        }
      >
        <p className="sp-modal__desc">{confirmText?.body}</p>
      </Modal>
    </div>
  );
}
