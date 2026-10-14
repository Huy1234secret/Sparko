import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Button,
  Icon,
  Input,
  LottieIcon,
  cx,
  renderDiscordText,
  useKeepOnScreen,
} from '../../ui';
import { useStudioActions } from '../../data';
import closeAnim from '../../../../../design-system/assets/icons/close-button-hover.json?url';
import uploadReveal from '../../../../../design-system/assets/icons/animated-icons/upload-button-reveal.json?url';
import uploadHover from '../../../../../design-system/assets/icons/animated-icons/upload-button-hover.json?url';
import uploadSelect from '../../../../../design-system/assets/icons/animated-icons/upload-button-select.json?url';

/**
 * Pieces shared by Message Studio's editor: text edited where it's shown,
 * the picture and link popover, the colour popover and the close button.
 */

/** A picture drawn from a white icon file, in the current text colour. */
export function MaskIcon({
  src,
  size = 16,
  label,
  className,
}: {
  src: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cx('sp-mask-icon', className)}
      style={
        {
          '--sp-mask': `url("${src}")`,
          width: size,
          height: size,
        } as CSSProperties
      }
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    />
  );
}

// Where a picked emoji goes ------------------------------------------------

type Insert = (text: string) => void;
type InsertTarget = {
  set: (insert: Insert | null) => void;
  get: () => Insert | null;
};
const InsertContext = createContext<InsertTarget>({
  set: () => undefined,
  get: () => null,
});
/** Remembers the last text box written in, so the emoji picker can add to it. */
export function InsertProvider({ children }: { children: ReactNode }) {
  const target = useRef<Insert | null>(null);
  const [value] = useState<InsertTarget>(() => ({
    set: (insert) => {
      target.current = insert;
    },
    get: () => target.current,
  }));
  return (
    <InsertContext.Provider value={value}>{children}</InsertContext.Provider>
  );
}
export const useInsertTarget = () => useContext(InsertContext);

/**
 * Text edited where it's shown: rendered like Discord until clicked, then a
 * box in the same place. Placeholders read like the part they stand for.
 */
export function EditText({
  value,
  onChange,
  label,
  placeholder,
  multiline,
  maxLength,
  className,
  render = (v) => renderDiscordText(v),
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  multiline?: boolean;
  maxLength?: number;
  className?: string;
  render?: (value: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const target = useInsertTarget();
  // The newest value and where the caret was, for adding an emoji later.
  const latest = useRef({ value, onChange, at: value.length });
  useEffect(() => {
    latest.current.value = value;
    latest.current.onChange = onChange;
  });
  const remember = (el: HTMLInputElement | HTMLTextAreaElement) => {
    latest.current.at = el.selectionStart ?? el.value.length;
    target.set((text) => {
      const { value: v, onChange: set, at } = latest.current;
      const next = (v.slice(0, at) + text + v.slice(at)).slice(
        0,
        maxLength ?? Infinity,
      );
      latest.current.at = at + text.length;
      set(next);
    });
  };
  const common = {
    autoFocus: true,
    className: cx('sp-edit-box', className),
    'aria-label': label,
    placeholder,
    value,
    maxLength,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      remember(e.currentTarget);
      setEditing(false);
    },
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      remember(e.currentTarget),
  };
  if (editing)
    return multiline ? (
      <textarea
        {...common}
        rows={Math.max(1, value.split('\n').length)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
      />
    ) : (
      <input
        {...common}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) =>
          (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()
        }
      />
    );
  return (
    <span
      role="button"
      tabIndex={0}
      className={cx('sp-edit-text', className, !value.trim() && 'is-empty')}
      aria-label={`Edit ${label}`}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value.trim() ? render(value) : placeholder}
    </span>
  );
}

/** The small square close button: white, turning red on hover. */
export function CloseButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  const [play, setPlay] = useState(0);
  return (
    <button
      type="button"
      className={cx('sp-close-x', className)}
      aria-label={label}
      onPointerEnter={() => setPlay((n) => n + 1)}
      onClick={onClick}
    >
      <LottieIcon src={closeAnim} size={16} playKey={play} solid />
    </button>
  );
}

/**
 * The upload button: its icon plays in when it appears, again on hover,
 * and its "select" animation when pressed.
 */
/**
 * A button with an animated icon: it draws in when it appears, plays its
 * hover when the pointer comes over it, and its press when pressed.
 */
export function AnimatedIconButton({
  reveal,
  hover,
  select,
  children,
  loading,
  onPointerEnter,
  onPointerDown,
  ...rest
}: React.ComponentProps<typeof Button> & {
  reveal: string;
  hover: string;
  select: string;
}) {
  const [play, setPlay] = useState({ src: reveal, key: 1 });
  return (
    <Button
      {...rest}
      loading={!!loading}
      onPointerEnter={(e) => {
        setPlay((p) => ({ src: hover, key: p.key + 1 }));
        onPointerEnter?.(e);
      }}
      onPointerDown={(e) => {
        setPlay((p) => ({ src: select, key: p.key + 1 }));
        onPointerDown?.(e);
      }}
    >
      {!loading && (
        <LottieIcon src={play.src} size={20} playKey={play.key} solid />
      )}
      {children}
    </Button>
  );
}

function UploadButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <AnimatedIconButton
      size="sm"
      reveal={uploadReveal}
      hover={uploadHover}
      select={uploadSelect}
      loading={busy}
      loadingLabel="Uploading…"
      onClick={onClick}
    >
      Upload
    </AnimatedIconButton>
  );
}

/** The upload button's animations, for others that upload. */
export const uploadAnimations = {
  reveal: uploadReveal,
  hover: uploadHover,
  select: uploadSelect,
};

/** Open popovers, newest last; Escape closes only the newest. */
const openPopovers: object[] = [];

/** Closes a popover on Escape or a press outside it. */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const me = {};
    openPopovers.push(me);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openPopovers.at(-1) !== me) return;
      // An open list inside the popover closes first.
      if (
        (e.target as Element | null)?.closest?.(
          '[role="combobox"][aria-expanded="true"], [aria-haspopup="listbox"][aria-expanded="true"]',
        )
      )
        return;
      e.stopPropagation();
      close.current();
    };
    const press = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        close.current();
    };
    // Captured first, since popovers keep their keys from reaching the page.
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', press);
    return () => {
      openPopovers.splice(openPopovers.indexOf(me), 1);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', press);
    };
  }, [open, ref]);
}

const okLink = (url: string) => /^(https:\/\/\S+|blob:\S+)$/.test(url);

/**
 * Adds a picture or a link: a URL box, an upload button for pictures
 * (up to 5 MB) and a remove button when something is set already.
 */
export function UrlPopover({
  serverId,
  title,
  value,
  onChange,
  onClose,
  picture = true,
}: {
  serverId: string;
  title: string;
  value: string;
  onChange: (url: string) => void;
  onClose: () => void;
  /** Links can't be uploaded, only typed in. */
  picture?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const [error, setError] = useState('');
  const { upload } = useStudioActions(serverId);
  useDismiss(true, onClose, box);
  useKeepOnScreen(box);
  const apply = () => {
    const url = text.trim();
    if (url && !okLink(url)) {
      setError('Use a link that starts with https://.');
      return;
    }
    onChange(url);
    onClose();
  };
  return (
    <div
      ref={box}
      className="sp-url-pop"
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <CloseButton label="Close" onClick={onClose} className="sp-url-pop__x" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Input
          label={title}
          value={text}
          autoFocus
          placeholder="https://"
          error={error || undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
        />
      </form>
      <div className="sp-url-pop__actions">
        {picture && (
          <>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sp-sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) {
                  setError('Pictures can be up to 5 MB.');
                  return;
                }
                upload.mutate(f, {
                  onSuccess: (url) => {
                    onChange(url);
                    onClose();
                  },
                  onError: (err) =>
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'The picture didn’t upload.',
                    ),
                });
              }}
            />
            <UploadButton
              busy={upload.isPending}
              onClick={() => file.current?.click()}
            />
            <span className="sp-hint">Max 5 MB</span>
          </>
        )}
        <span className="sp-url-pop__end">
          {value && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange('');
                onClose();
              }}
            >
              Remove
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={apply}>
            Done
          </Button>
        </span>
      </div>
    </div>
  );
}

const SETTLE = { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
const still = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type KeyOf = (el: HTMLElement) => unknown;
const keyOfItem: KeyOf = (el) => el.dataset.key ?? el;

/** Where each item is on screen, by its key (or itself when it has none). */
export function measure(els: HTMLElement[], keyOf = keyOfItem) {
  return new Map<unknown, DOMRect>(
    els.map((el) => [keyOf(el), el.getBoundingClientRect()]),
  );
}

/**
 * After a list changes order, slides each item from where it was to where
 * it now is. `before` is from {@link measure}, taken just before the change.
 * Call it straight after the change has been drawn (`now`), or let it wait
 * for the next frame.
 */
export function slideFrom(
  els: () => HTMLElement[],
  before: Map<unknown, DOMRect>,
  { keyOf = keyOfItem, now = false }: { keyOf?: KeyOf; now?: boolean } = {},
) {
  if (still()) return;
  const run = () => {
    for (const el of els()) {
      const was = before.get(keyOf(el));
      if (!was) continue;
      const at = el.getBoundingClientRect();
      const dx = was.left - at.left;
      const dy = was.top - at.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate?.(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0, 0)' },
        ],
        SETTLE,
      );
    }
  };
  if (now) run();
  else requestAnimationFrame(run);
}

/**
 * Drag to reorder, for any list: drag an item's handle, or focus it and
 * use the arrow keys. While dragging, the item follows the pointer and the
 * others slide aside to show where it will land; let go and it settles
 * into its place. `grid` is for items that wrap across rows.
 */
export function useReorder({
  onMove,
  mode = 'list',
  fit = false,
}: {
  onMove: (from: number, to: number) => void;
  mode?: 'list' | 'grid';
  /** Grid items take the size of the place they slide into (a gallery's). */
  fit?: boolean;
}) {
  // The list element, kept in state so nothing reads a ref while rendering.
  const [listEl, list] = useState<HTMLElement | null>(null);
  const [group] = useState(() => Math.random().toString(36).slice(2, 8));
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const items = () =>
    Array.from(
      listEl?.querySelectorAll<HTMLElement>(`[data-reorder="${group}"]`) ?? [],
    );

  /** Moves an item, sliding everything to its new place. */
  const commit = (els: HTMLElement[], from: number, to: number) => {
    const before = measure(els);
    for (const el of els) {
      el.style.transition = 'none';
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.zIndex = '';
    }
    setDrag(null);
    if (to !== from) onMove(from, to);
    slideFrom(items, before);
    requestAnimationFrame(() => {
      for (const el of els) el.style.transition = '';
    });
  };

  const start = (from: number) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const els = items();
    const dragged = els[from];
    if (!dragged) return;
    // Where everything starts; the places to drop are worked out from these.
    const slots = els.map((el) => el.getBoundingClientRect());
    const fixed = els.map((el) => el.dataset.fixed === 'true');
    const gap =
      slots.length > 1 ? Math.max(0, slots[1]!.top - slots[0]!.bottom) : 0;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let over = from;
    setDrag({ from, over });
    dragged.style.zIndex = '5';
    dragged.style.transition = 'none';
    for (const [i, el] of els.entries())
      if (i !== from)
        el.style.transition = `transform ${SETTLE.duration}ms ${SETTLE.easing}`;

    const overAt = (x: number, y: number) => {
      const at = slots.findIndex((r) =>
        mode === 'list'
          ? y < r.top + r.height / 2
          : y < r.top || (y <= r.bottom && x < r.left + r.width / 2),
      );
      return at < 0 ? slots.length : at;
    };
    // Slides the other items to where they'd be with the dragged one moved.
    const preview = (to: number) => {
      const order = moveItem(
        els.map((_, i) => i),
        from,
        to,
      );
      let top = slots[0]!.top;
      order.forEach((k, j) => {
        const own = slots[k]!;
        const target =
          mode === 'list'
            ? { left: own.left, top }
            : { left: slots[j]!.left, top: slots[j]!.top };
        top += own.height + gap;
        if (k === from || fixed[k]) return;
        const dx = target.left - own.left;
        const dy = target.top - own.top;
        const size =
          fit && mode === 'grid'
            ? ` scale(${slots[j]!.width / own.width}, ${slots[j]!.height / own.height})`
            : '';
        els[k]!.style.transformOrigin = size ? '0 0' : '';
        els[k]!.style.transform =
          Math.abs(dx) < 1 && Math.abs(dy) < 1 && !size
            ? ''
            : `translate(${dx}px, ${dy}px)${size}`;
      });
    };

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      dragged.style.transform = `translate(${mode === 'list' ? 0 : dx}px, ${dy}px)`;
      const next = overAt(ev.clientX, ev.clientY);
      if (next === over) return;
      over = next;
      setDrag({ from, over });
      preview(over > from ? over - 1 : over);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      commit(els, from, over > from ? over - 1 : over);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const keys =
    (from: number, count: number) => (e: React.KeyboardEvent<HTMLElement>) => {
      const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      const ahead = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      if (!back && !ahead) return;
      e.preventDefault();
      const to = from + (back ? -1 : 1);
      if (to >= 0 && to < count) commit(items(), from, to);
    };
  const dropClass = (i: number, _count?: number) =>
    drag?.from === i ? 'is-dragged' : null;
  /**
   * Props for each item. A key lets an item that moves to another row still
   * slide into place; `fixed` items mark places to drop but never move.
   */
  const item = (i: number, key?: string, fixed?: boolean) => ({
    'data-reorder': group,
    'data-index': i,
    ...(key ? { 'data-key': key } : {}),
    ...(fixed ? { 'data-fixed': 'true' } : {}),
  });
  return { list, start, keys, dropClass, item, dragging: drag !== null };
}

/** Moves one entry of a list to another place. */
export function moveItem<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

/**
 * The little (i) beside a setting: hovering or focusing it shows what the
 * setting does, straight away.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="sp-tip" tabIndex={0} role="img" aria-label={text}>
      <Icon name="info" size="sm" />
      <span className="sp-tip__bubble" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

/**
 * A problem found when saving or posting, and how many times one has been
 * shown, so the same problem shown again still moves the page there.
 */
export type ShownIssue = { at: string; n: number };
const IssueContext = createContext<ShownIssue | null>(null);
export const IssueProvider = IssueContext.Provider;
/** The problem being shown, if any; settings panels open for theirs. */
export const useIssue = () => useContext(IssueContext);

/**
 * Takes the person to a problem: scrolls the part of the editor it's in
 * (marked with `data-issue`) into view, flashes a red outline round it and
 * puts the caret there. Without that exact part, the nearest one holding
 * it is used: "component:b1/action:a1" falls back to "component:b1".
 */
export function flashIssue(at: string) {
  let key = at;
  let el: HTMLElement | null = null;
  for (;;) {
    el = document.querySelector<HTMLElement>(
      `[data-issue="${key.replace(/["\\]/g, '\\$&')}"]`,
    );
    const cut = key.lastIndexOf('/');
    if (el || cut < 0) break;
    key = key.slice(0, cut);
  }
  el ??= document.querySelector<HTMLElement>('[data-issue="message"]');
  if (!el) return;
  el.scrollIntoView?.({
    block: 'center',
    behavior: still() ? 'auto' : 'smooth',
  });
  el.classList.remove('is-flagged');
  // Reading the size restarts the animation when it's shown again.
  void el.offsetWidth;
  el.classList.add('is-flagged');
  const target = el;
  target.addEventListener(
    'animationend',
    () => target.classList.remove('is-flagged'),
    { once: true },
  );
  const field = el.matches('input, textarea, [role="combobox"]')
    ? el
    : el.querySelector<HTMLElement>(
        'input:not([type="file"]), textarea, [role="combobox"], button.sp-input',
      );
  field?.focus({ preventScroll: true });
}
