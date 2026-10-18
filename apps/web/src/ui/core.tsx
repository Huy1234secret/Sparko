import { SearchIcon } from './search-icon';
import { AnimatedCheck, RevealIcon } from './animated';
import { InfoTip } from './tip';
import type { RevealHover } from './anim-icons';
import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/** Joins class names, skipping empty ones. */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'sp-icon': {
        class?: string;
        name: string;
        'aria-hidden'?: boolean | 'true';
      };
    }
  }
}

export type IconSize = 'xs' | 'sm' | 'lg' | 'xl';
/** A Lucide icon by name, drawn by the design system's <sp-icon> element. */
export function Icon({
  name,
  size,
  className,
}: {
  name: string;
  size?: IconSize | undefined;
  className?: string | undefined;
}) {
  return (
    <sp-icon
      class={cx('sp-i', size && `sp-i--${size}`, className)}
      name={name}
      aria-hidden="true"
    />
  );
}

export function Spinner() {
  return <span className="sp-spinner" aria-hidden="true" />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'lg';
  icon?: string;
  iconOnly?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  error?: boolean;
  block?: boolean;
};
export function Button({
  variant = 'secondary',
  size,
  icon,
  iconOnly,
  loading,
  loadingLabel,
  error,
  block,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'sp-btn',
        `sp-btn--${variant}`,
        size && `sp-btn--${size}`,
        iconOnly && 'sp-btn--icon',
        block && 'sp-btn--block',
        loading && 'is-loading',
        error && 'is-error',
        className,
      )}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <Icon name="rotate-ccw" />
      ) : (
        icon && <Icon name={icon} />
      )}
      {iconOnly
        ? null
        : loading
          ? (loadingLabel ?? children)
          : error
            ? 'Try again'
            : children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="sp-field">
      {label &&
        (hint ? (
          // Help sits in an (i) beside the label, not under the field, and
          // stays out of the field's name.
          <span className="sp-label">
            <label htmlFor={htmlFor}>
              {label}
              {optional && <span className="sp-label__opt"> (optional)</span>}
            </label>{' '}
            <InfoTip text={hint} />
          </span>
        ) : (
          <label className="sp-label" htmlFor={htmlFor}>
            {label}
            {optional && <span className="sp-label__opt"> (optional)</span>}
          </label>
        ))}
      {children}
      {error ? (
        <p className="sp-field-error">
          <Icon name="circle-alert" />
          {error}
        </p>
      ) : hint && !label ? (
        <p className="sp-hint">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: string;
  suffix?: ReactNode;
  end?: ReactNode;
  loading?: boolean;
};
export function Input({
  label,
  hint,
  error,
  icon,
  suffix,
  end,
  loading,
  id,
  ...rest
}: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div
        className={cx(
          'sp-input',
          !!error && 'is-error',
          rest.disabled && 'is-disabled',
        )}
      >
        {icon === 'search' ? (
          <SearchIcon size={18} />
        ) : (
          icon && <Icon name={icon} />
        )}
        {suffix && <span className="sp-input__suffix">{suffix}</span>}
        <input id={inputId} aria-invalid={error ? true : undefined} {...rest} />
        {(end || loading) && (
          <span className="sp-input__end">{loading ? <Spinner /> : end}</span>
        )}
      </div>
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};
export function Textarea({
  label,
  hint,
  error,
  maxLength,
  id,
  ...rest
}: TextareaProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const length = String(rest.value ?? '').length;
  return (
    <Field
      label={label}
      error={error}
      htmlFor={inputId}
      // With a label, the hint moves into the label's (i).
      {...(label && hint ? { hint } : {})}
    >
      <div
        className={cx(
          'sp-input sp-input--multiline',
          !!error && 'is-error',
          rest.disabled && 'is-disabled',
        )}
      >
        <textarea
          id={inputId}
          aria-invalid={error ? true : undefined}
          maxLength={maxLength}
          {...rest}
        />
      </div>
      {!error && ((hint && !label) || maxLength) && (
        <div className="sp-field__row">
          <p className="sp-hint">{label ? null : hint}</p>
          {maxLength && (
            <p className="sp-hint sp-tnum">
              {length} / {maxLength}
            </p>
          )}
        </div>
      )}
    </Field>
  );
}

type Option = string | { value: string; label: string };
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: Option[];
};
export function Select({
  label,
  hint,
  error,
  options,
  id,
  ...rest
}: SelectProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div
        className={cx(
          'sp-input sp-input--select',
          !!error && 'is-error',
          rest.disabled && 'is-disabled',
        )}
      >
        <select id={inputId} {...rest}>
          {options.map((o) =>
            typeof o === 'string' ? (
              <option key={o}>{o}</option>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ),
          )}
        </select>
      </div>
    </Field>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  loading,
  disabled,
}: {
  checked: boolean;
  onChange?: (value: boolean) => void;
  label?: ReactNode;
  description?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        'sp-switch',
        loading && 'is-loading',
        disabled && 'is-disabled',
      )}
    >
      <input
        className="sp-choice-input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled || loading}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-label={label ? undefined : description}
      />
      <span className="sp-switch__track">
        <span className="sp-switch__thumb" />
      </span>
      {label && (
        <span className="sp-switch__text">
          <span>{label}</span>
          {description && (
            <span className="sp-switch__desc">{description}</span>
          )}
        </span>
      )}
    </label>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  description,
  error,
  disabled,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  error?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        'sp-check',
        indeterminate && 'is-indeterminate',
        error && 'is-error',
      )}
    >
      <input
        className="sp-choice-input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      {indeterminate ? (
        <span className="sp-check__box">
          <Icon name="minus" />
        </span>
      ) : (
        <span className="sp-check__box sp-check__box--anim">
          <AnimatedCheck checked={checked} />
        </span>
      )}
      <span className="sp-check__text">
        <span>{label}</span>
        {description && <span className="sp-check__desc">{description}</span>}
      </span>
    </label>
  );
}

export function RadioCards({
  name,
  value,
  onChange,
  options,
  legend,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  legend?: ReactNode;
  options: {
    value: string;
    title: ReactNode;
    description?: ReactNode;
    disabled?: boolean;
  }[];
}) {
  return (
    <fieldset className="sp-radio-cards">
      {legend && (
        <legend className="sp-label" style={{ marginBottom: 8 }}>
          {legend}
        </legend>
      )}
      {options.map((o) => (
        <label key={o.value} className="sp-radio-card">
          <input
            className="sp-choice-input"
            type="radio"
            name={name}
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
          />
          <span className="sp-check__box" />
          <span className="sp-radio-card__title">{o.title}</span>
          <span className="sp-radio-card__desc">{o.description}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  className?: string;
}) {
  return (
    <div
      className={cx('sp-seg', className)}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="sp-seg__item"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.ariaLabel}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  tabs: {
    value: T;
    label: ReactNode;
    icon?: string;
    /** An icon that draws in and plays on hover; `icon` stands in without it. */
    anim?: RevealHover | undefined;
    count?: number;
    disabled?: boolean;
  }[];
}) {
  // How many times each tab was hovered, to replay its icon.
  const [hovers, setHovers] = useState<Record<string, number>>({});
  return (
    <div className="sp-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          className="sp-tab"
          aria-selected={value === t.value}
          disabled={t.disabled}
          onClick={() => onChange(t.value)}
          onPointerEnter={() =>
            setHovers((h) => ({ ...h, [t.value]: (h[t.value] ?? 0) + 1 }))
          }
        >
          {t.anim ? (
            <RevealIcon
              anim={t.anim}
              fallback={t.icon ?? ''}
              size={20}
              hoverKey={hovers[t.value] ?? 0}
            />
          ) : (
            t.icon && <Icon name={t.icon} size="sm" />
          )}
          {t.label}
          {t.count != null && <span className="sp-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export type Tone = 'info' | 'success' | 'warning' | 'danger';
export function Badge({
  tone,
  pill,
  dot,
  icon,
  size,
  className,
  style,
  children,
}: {
  tone?: Tone | 'brand' | 'plus';
  pill?: boolean;
  dot?: boolean;
  icon?: string;
  size?: 'sm';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'sp-badge',
        tone && `sp-badge--${tone}`,
        size && `sp-badge--${size}`,
        pill && 'sp-pill',
        className,
      )}
      style={style}
    >
      {dot && <span className="sp-dot" />}
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}
