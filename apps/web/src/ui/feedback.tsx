import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Button, cx, Icon, type Tone } from './core';

const toneIcon: Record<Tone, string> = {
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-x',
};

export function Notice({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      className={`sp-notice sp-notice--${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon name={toneIcon[tone]} className="sp-notice__icon" />
      <div className="sp-notice__title">{title}</div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon="x"
          aria-label="Dismiss"
          className="sp-notice__close"
          onClick={onDismiss}
        />
      )}
      {children && <div className="sp-notice__body">{children}</div>}
      {actions && <div className="sp-notice__actions">{actions}</div>}
    </div>
  );
}

export function PlusBanner({
  title = 'Get more from Sparko with Plus',
  children,
  onUpgrade,
  onDismiss,
}: {
  title?: ReactNode;
  children: ReactNode;
  onUpgrade?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="sp-plus sp-sparks">
      <span className="sp-plus__mark">
        <Icon name="crown" size="lg" />
      </span>
      <div className="sp-plus__text">
        <div className="sp-plus__title">{title}</div>
        <div className="sp-plus__desc">{children}</div>
      </div>
      <div className="sp-plus__actions">
        <Button variant="primary" size="sm" onClick={onUpgrade}>
          Upgrade to Plus
        </Button>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="x"
            aria-label="Dismiss"
            onClick={onDismiss}
          />
        )}
      </div>
    </div>
  );
}

export function PausedBanner({
  server,
  reference,
  children,
  bar,
  actions,
}: {
  server: string;
  reference?: string;
  children: ReactNode;
  bar?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className={cx('sp-paused', bar && 'sp-paused--bar')} role="alert">
      <Icon name="circle-pause" size="lg" className="sp-paused__icon" />
      <div className="sp-paused__title">
        Sparko is paused on {server}
        {reference && <span className="sp-paused__ref">Ref {reference}</span>}
      </div>
      <div className="sp-paused__body">{children}</div>
      {actions && <div className="sp-paused__actions">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  action,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx('sp-card', className)}>
      {title && (
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h3 className="sp-card__title">{title}</h3>
            {subtitle && <p className="sp-card__sub">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="sp-card__body">{children}</div>
      {footer && <div className="sp-card__foot">{footer}</div>}
    </section>
  );
}

export function Stat({
  label,
  icon,
  value,
  delta,
  trend = 'flat',
  meta,
  loading,
}: {
  label: ReactNode;
  icon?: string;
  value: ReactNode;
  delta?: ReactNode;
  trend?: 'up' | 'down' | 'flat';
  meta?: ReactNode;
  loading?: boolean;
}) {
  if (loading)
    return (
      <div className="sp-stat" aria-busy="true">
        <span className="sp-skel" style={{ width: '40%' }} />
        <span className="sp-skel sp-skel--stat" />
        <span className="sp-skel" style={{ width: '60%' }} />
      </div>
    );
  return (
    <div className="sp-stat">
      <div className="sp-stat__label">
        {icon && <Icon name={icon} size="sm" />}
        {label}
      </div>
      <div className="sp-stat__value">{value}</div>
      <div className="sp-stat__meta">
        {delta != null && (
          <span className={`sp-delta sp-delta--${trend}`}>
            <Icon
              name={
                trend === 'up'
                  ? 'trending-up'
                  : trend === 'down'
                    ? 'trending-down'
                    : 'minus'
              }
            />
            {delta}
          </span>
        )}
        {meta}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  children,
  actions,
  error,
  code,
}: {
  icon?: string;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  error?: boolean;
  code?: string;
}) {
  return (
    <div
      className={cx('sp-empty', error ? 'sp-empty--error' : 'sp-sparks')}
      role={error ? 'alert' : undefined}
    >
      <div className="sp-empty__art">
        <Icon name={error ? 'cloud-off' : icon} />
      </div>
      <div className="sp-empty__title">{title}</div>
      {children && <p className="sp-empty__desc">{children}</p>}
      {code && <span className="sp-empty__code">{code}</span>}
      {actions && <div className="sp-empty__actions">{actions}</div>}
    </div>
  );
}

export function Avatar({
  name = '?',
  src,
  color = 1,
  size,
  status,
}: {
  name?: string;
  src?: string;
  color?: 1 | 2 | 3 | 4 | 5 | 6 | 'bot';
  size?: 'xs' | 'sm' | 'lg' | 'xl';
  status?: 'online' | 'idle' | 'dnd' | 'offline';
}) {
  return (
    <span
      className={cx(
        'sp-avatar',
        `sp-avatar--${color}`,
        size && `sp-avatar--${size}`,
      )}
    >
      {src ? <img src={src} alt="" /> : (name[0] ?? '?').toUpperCase()}
      {status && (
        <span className={`sp-avatar__status sp-avatar__status--${status}`} />
      )}
    </span>
  );
}

export function ServerIcon({
  name = '',
  src,
  hue = 85,
  size,
  plus,
  selected,
}: {
  name?: string;
  src?: string;
  hue?: number;
  size?: 'sm' | 'md' | 'lg';
  plus?: boolean;
  selected?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cx(
        'sp-server',
        !src && 'sp-server--tint',
        size && `sp-server--${size}`,
        selected && 'is-selected',
      )}
      style={{ '--h': hue } as CSSProperties}
    >
      {src ? <img src={src} alt="" /> : initials}
      {plus && (
        <span className="sp-server__badge">
          <Icon name="crown" />
        </span>
      )}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  // Kept in a ref so an inline onClose doesn't re-run the focus effect.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="sp-scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        className="sp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <span className="sp-sheet-grip" />
        <div className="sp-modal__head">
          {icon && (
            <span className="sp-modal__icon">
              <Icon name={icon} />
            </span>
          )}
          <div className="sp-modal__titles">
            <h2 className="sp-modal__title" id={titleId}>
              {title}
            </h2>
            {description && <p className="sp-modal__desc">{description}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="x"
            aria-label="Close"
            onClick={onClose}
          />
        </div>
        <div className="sp-modal__body">{children}</div>
        {footer && <div className="sp-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({
  tone = 'success',
  title,
  children,
  onDismiss,
  actions,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      className={`sp-toast sp-toast--${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon name={toneIcon[tone]} className="sp-toast__icon" />
      <div className="sp-toast__title">{title}</div>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="x"
        aria-label="Dismiss"
        className="sp-toast__close"
        onClick={onDismiss}
      />
      {children && <div className="sp-toast__body">{children}</div>}
      {actions && <div className="sp-toast__actions">{actions}</div>}
    </div>
  );
}

type ToastItem = { id: number; tone: Tone; title: ReactNode; body?: ReactNode };
const ToastContext = createContext<
  (toast: Omit<ToastItem, 'id' | 'tone'> & { tone?: Tone }) => void
>(() => {});
/** Shows short confirmations in the corner; each disappears after 4.5 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const show = useCallback(
    (toast: Omit<ToastItem, 'id' | 'tone'> & { tone?: Tone }) => {
      const id = ++next.current;
      setToasts((all) => [
        ...all.slice(-1),
        { tone: 'info', ...toast, id } as ToastItem,
      ]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="sp-toast-region" aria-live="polite">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            tone={t.tone}
            title={t.title}
            onDismiss={() => dismiss(t.id)}
          >
            {t.body}
          </Toast>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

export function SaveBar({
  state = 'dirty',
  onSave,
  onReset,
  message,
}: {
  state?: 'dirty' | 'saving' | 'error' | 'saved';
  onSave?: () => void;
  onReset?: () => void;
  message?: ReactNode;
}) {
  const [icon, text] = {
    dirty: ['triangle-alert', 'You have unsaved changes'],
    saving: ['triangle-alert', 'Saving your changes…'],
    error: ['circle-alert', 'Couldn’t save'],
    saved: ['circle-check', 'Changes saved'],
  }[state];
  return (
    <div
      className={cx(
        'sp-savebar',
        state === 'error' && 'is-error',
        state === 'saved' && 'is-saved',
      )}
      role="region"
      aria-label="Unsaved changes"
    >
      <div className="sp-savebar__msg">
        <Icon name={icon ?? 'info'} />
        <span>
          {text}
          {message && <small>{message}</small>}
        </span>
      </div>
      <div className="sp-savebar__actions">
        <Button variant="ghost" disabled={state === 'saving'} onClick={onReset}>
          Discard
        </Button>
        <Button
          variant="primary"
          loading={state === 'saving'}
          loadingLabel="Saving…"
          onClick={onSave}
        >
          {state === 'error' ? 'Try again' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
