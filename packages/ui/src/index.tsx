import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { cloneElement, isValidElement } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Inbox,
  Info,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';

export function Button({
  variant = 'primary',
  busy = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  busy?: boolean;
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy}
      {...props}
    >
      {busy && <LoaderCircle aria-hidden="true" size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Card({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />;
}
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required = false,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  children: ReactNode;
  htmlFor: string;
  required?: boolean;
}) {
  const hintId = hint ? htmlFor + '-hint' : undefined;
  const errorId = error ? htmlFor + '-error' : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement<{
    'aria-invalid'?: boolean | undefined;
    'aria-describedby'?: string | undefined;
  }>(children)
    ? cloneElement(children, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children;
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="field-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          <AlertCircle aria-hidden="true" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}
export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  compact = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
  /** Smaller variant for empty panels inside a card. */
  compact?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}`}>
      <span className="empty-icon">
        <Icon aria-hidden="true" size={compact ? 20 : 25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  message,
  retry,
  code,
}: {
  message: string;
  retry?: (() => void) | undefined;
  code?: string | undefined;
}) {
  return (
    <div className="alert alert-danger" role="alert">
      <AlertCircle aria-hidden="true" size={20} />
      <div>
        <strong>{message}</strong>
        {code && <p className="muted mono">Reference: {code}</p>}
        {retry && (
          <Button type="button" variant="secondary" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle aria-hidden="true" className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

const noticeIcons = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  danger: AlertCircle,
};
/** A non-blocking explanation: a limitation, a permission reason or a next step. */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = noticeIcons[tone];
  return (
    <div className={`alert alert-${tone}`}>
      <Icon aria-hidden="true" size={20} />
      <div>
        <strong>{title}</strong>
        {children && <div className="alert-body">{children}</div>}
        {action}
      </div>
    </div>
  );
}
/** Progressive disclosure for options most administrators can leave alone. */
export function Advanced({
  summary = 'Advanced options',
  description,
  children,
  defaultOpen = false,
}: {
  summary?: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="advanced" open={defaultOpen}>
      <summary>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className="advanced-chevron"
        />
        <span>
          {summary}
          {description && <small>{description}</small>}
        </span>
      </summary>
      <div className="advanced-body stack">{children}</div>
    </details>
  );
}
export type Crumb = { label: string; to?: string | undefined };
/** Breadcrumb trail; the last item is the current page. */
export function Breadcrumbs({
  items,
  renderLink,
}: {
  items: Crumb[];
  renderLink: (crumb: Crumb & { to: string }) => ReactNode;
}) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index}>
              {!last && item.to ? (
                renderLink({ ...item, to: item.to })
              ) : (
                <span aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!last && (
                <ChevronRight
                  aria-hidden="true"
                  size={14}
                  className="crumb-sep"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
/** Sticky save actions with the current saved/unsaved state announced politely. */
export function SaveBar({
  dirty,
  saving,
  savedLabel,
  onDiscard,
  saveLabel = 'Save changes',
}: {
  dirty: boolean;
  saving: boolean;
  /** Shown when nothing is unsaved, e.g. "All changes saved". */
  savedLabel: string;
  onDiscard: () => void;
  saveLabel?: string;
}) {
  return (
    <div className={`save-bar${dirty ? ' dirty' : ''}`}>
      <span className="save-state" aria-live="polite">
        {dirty && <span className="dirty-dot" aria-hidden="true" />}
        {saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedLabel}
      </span>
      <div className="row">
        <Button
          variant="ghost"
          type="button"
          disabled={!dirty || saving}
          onClick={onDiscard}
        >
          Discard changes
        </Button>
        <Button type="submit" busy={saving} disabled={!dirty}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
/** Recovery choices when someone else saved first; the local draft is kept. */
export function ConflictNotice({
  currentRevision,
  onKeepMine,
  onLoadLatest,
}: {
  currentRevision?: number | undefined;
  onKeepMine: () => void;
  onLoadLatest: () => void;
}) {
  return (
    <div className="alert alert-warning" role="alert">
      <AlertTriangle aria-hidden="true" size={20} />
      <div>
        <strong>Someone saved these settings while you were editing.</strong>
        <div className="alert-body">
          Your changes are still here and nothing was overwritten
          {currentRevision
            ? ` (the saved version is now ${currentRevision})`
            : ''}
          . Keep your changes to save them over the newer version, or load the
          newer version and discard yours.
        </div>
        <div className="row wrap">
          <Button type="button" variant="secondary" onClick={onKeepMine}>
            Keep my changes
          </Button>
          <Button type="button" variant="ghost" onClick={onLoadLatest}>
            Load the newer version
          </Button>
        </div>
      </div>
    </div>
  );
}
/** Plain-language status for a saved configuration and the bot's applied copy. */
export function configStatus(revision: number, appliedRevision: number) {
  if (revision === 0)
    return {
      tone: 'neutral' as const,
      label: 'Not set up yet',
      saved: 'Nothing saved yet',
    };
  if (revision === appliedRevision)
    return {
      tone: 'success' as const,
      label: 'Live',
      saved: 'All changes saved and live',
    };
  return {
    tone: 'warning' as const,
    label: 'Waiting for the bot',
    saved: 'Saved · waiting for the bot to apply it',
  };
}
