import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { cloneElement, isValidElement } from 'react';
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';

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
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
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
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
  htmlFor: string;
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
      <label htmlFor={htmlFor}>{label}</label>
      {control}
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId} role="alert">
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
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox aria-hidden="true" size={25} />
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
        {code && <p className="muted">Reference: {code}</p>}
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
