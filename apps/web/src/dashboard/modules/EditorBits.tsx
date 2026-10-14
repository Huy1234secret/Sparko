import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Button, Input, LottieIcon, cx, renderDiscordText } from '../../ui';
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
function UploadButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  const [play, setPlay] = useState({ src: uploadReveal, key: 1 });
  return (
    <Button
      size="sm"
      loading={busy}
      loadingLabel="Uploading…"
      onPointerEnter={() =>
        setPlay((p) => ({ src: uploadHover, key: p.key + 1 }))
      }
      onPointerDown={() =>
        setPlay((p) => ({ src: uploadSelect, key: p.key + 1 }))
      }
      onClick={onClick}
    >
      {!busy && (
        <LottieIcon src={play.src} size={20} playKey={play.key} solid />
      )}
      Upload
    </Button>
  );
}

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

/**
 * Drag to reorder, for any list: drag an item's handle, or focus it and
 * use the arrow keys. `grid` is for items that wrap across rows.
 */
export function useReorder({
  onMove,
  mode = 'list',
}: {
  onMove: (from: number, to: number) => void;
  mode?: 'list' | 'grid';
}) {
  // The list element, kept in state so nothing reads a ref while rendering.
  const [listEl, list] = useState<HTMLElement | null>(null);
  const [group] = useState(() => Math.random().toString(36).slice(2, 8));
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const items = () =>
    Array.from(
      listEl?.querySelectorAll<HTMLElement>(`[data-reorder="${group}"]`) ?? [],
    );
  const overAt = (x: number, y: number) => {
    const all = items();
    const at = all.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return mode === 'list'
        ? y < r.top + r.height / 2
        : y < r.top || (y <= r.bottom && x < r.left + r.width / 2);
    });
    return at < 0 ? all.length : at;
  };
  const start = (from: number) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let over = from;
    setDrag({ from, over });
    const move = (ev: PointerEvent) => {
      over = overAt(ev.clientX, ev.clientY);
      setDrag({ from, over });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      const to = over > from ? over - 1 : over;
      if (to !== from) onMove(from, to);
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
      if (to >= 0 && to < count) onMove(from, to);
    };
  const dropClass = (i: number, count: number) => {
    if (!drag) return null;
    if (drag.from === i) return 'is-dragged';
    if (drag.over === drag.from || drag.over === drag.from + 1) return null;
    if (drag.over === i) return 'is-drop-before';
    if (drag.over === count && i === count - 1) return 'is-drop-after';
    return null;
  };
  /** Props for each item and its handle. */
  const item = (i: number) => ({ 'data-reorder': group, 'data-index': i });
  return { list, start, keys, dropClass, item, dragging: drag !== null };
}

/** Moves one entry of a list to another place. */
export function moveItem<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}
