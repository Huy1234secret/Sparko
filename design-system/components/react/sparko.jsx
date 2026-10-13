/* Sparko React components — thin wrappers over the sp-* CSS classes (link styles.css + assets/icons/sp-icon.js).
   Plain JSX, no build step. Exposes window.Sparko and module.exports. */
const { useState, useRef, useEffect, useId } = React;
const cx = (...a) => a.filter(Boolean).join(' ');

function Icon({ name, size, className }) {
  return <sp-icon class={cx('sp-i', size && `sp-i--${size}`, className)} name={name}></sp-icon>;
}
function Spinner() { return <span className="sp-spinner" aria-hidden="true"></span>; }

function Button({ variant = 'secondary', size, icon, iconOnly, loading, loadingLabel, error, block, children, className, ...rest }) {
  const cls = cx('sp-btn', `sp-btn--${variant}`, size && `sp-btn--${size}`, iconOnly && 'sp-btn--icon', block && 'sp-btn--block', loading && 'is-loading', error && 'is-error', className);
  return (
    <button type="button" className={cls} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : error ? <Icon name="rotate-ccw" /> : icon && <Icon name={icon} />}
      {iconOnly ? null : loading ? (loadingLabel || children) : error ? 'Try again' : children}
    </button>
  );
}

function Field({ label, hint, error, optional, htmlFor, children }) {
  return (
    <div className="sp-field">
      {label && <label className="sp-label" htmlFor={htmlFor}>{label}{optional && <span className="sp-label__opt"> (optional)</span>}</label>}
      {children}
      {error ? <p className="sp-field-error"><Icon name="circle-alert" />{error}</p> : hint ? <p className="sp-hint">{hint}</p> : null}
    </div>
  );
}
function Input({ label, hint, error, icon, suffix, end, loading, id, ...rest }) {
  const auto = useId(); const iid = id || auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={iid}>
      <div className={cx('sp-input', error && 'is-error', rest.disabled && 'is-disabled')}>
        {icon && <Icon name={icon} />}{suffix && <span className="sp-input__suffix">{suffix}</span>}
        <input id={iid} aria-invalid={error ? true : undefined} {...rest} />
        {(end || loading) && <span className="sp-input__end">{loading ? <Spinner /> : end}</span>}
      </div>
    </Field>
  );
}
function Textarea({ label, hint, error, maxLength, id, ...rest }) {
  const auto = useId(); const iid = id || auto; const len = String(rest.value ?? '').length;
  return (
    <Field label={label} error={error} htmlFor={iid}>
      <div className={cx('sp-input sp-input--multiline', error && 'is-error', rest.disabled && 'is-disabled')}><textarea id={iid} aria-invalid={error ? true : undefined} maxLength={maxLength} {...rest} /></div>
      {!error && (hint || maxLength) && <div className="sp-field__row"><p className="sp-hint">{hint}</p>{maxLength && <p className="sp-hint sp-tnum">{len} / {maxLength}</p>}</div>}
    </Field>
  );
}
function Select({ label, hint, error, options = [], id, ...rest }) {
  const auto = useId(); const iid = id || auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={iid}>
      <div className={cx('sp-input sp-input--select', error && 'is-error', rest.disabled && 'is-disabled')}><select id={iid} {...rest}>{options.map(o => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
    </Field>
  );
}

function Switch({ checked, onChange, label, description, loading, disabled }) {
  return (
    <label className={cx('sp-switch', loading && 'is-loading', disabled && 'is-disabled')}>
      <input className="sp-choice-input" type="checkbox" role="switch" checked={!!checked} disabled={disabled || loading} onChange={e => onChange && onChange(e.target.checked)} aria-label={!label ? description : undefined} />
      <span className="sp-switch__track"><span className="sp-switch__thumb"></span></span>
      {label && <span className="sp-switch__text"><span>{label}</span>{description && <span className="sp-switch__desc">{description}</span>}</span>}
    </label>
  );
}
function Checkbox({ checked, indeterminate, onChange, label, description, error, disabled }) {
  return (
    <label className={cx('sp-check', indeterminate && 'is-indeterminate', error && 'is-error')}>
      <input className="sp-choice-input" type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange && onChange(e.target.checked)} />
      <span className="sp-check__box"><Icon name={indeterminate ? 'minus' : 'check'} /></span>
      <span className="sp-check__text"><span>{label}</span>{description && <span className="sp-check__desc">{description}</span>}</span>
    </label>
  );
}
function RadioCards({ name, value, onChange, options, legend }) {
  return (
    <fieldset className="sp-radio-cards">
      {legend && <legend className="sp-label" style={{ marginBottom: 8 }}>{legend}</legend>}
      {options.map(o => (
        <label key={o.value} className="sp-radio-card">
          <input className="sp-choice-input" type="radio" name={name} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
          <span className="sp-check__box"></span><span className="sp-radio-card__title">{o.title}</span><span className="sp-radio-card__desc">{o.description}</span>
        </label>
      ))}
    </fieldset>
  );
}
function Segmented({ value, onChange, options, label }) {
  return (
    <div className="sp-seg" role="radiogroup" aria-label={label}>
      {options.map(o => { const v = o.value ?? o; return <button key={v} type="button" className="sp-seg__item" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{o.label ?? o}</button>; })}
    </div>
  );
}
function Tabs({ value, onChange, tabs }) {
  return (
    <div className="sp-tabs" role="tablist">
      {tabs.map(t => <button key={t.value} type="button" role="tab" className="sp-tab" aria-selected={value === t.value} disabled={t.disabled} onClick={() => onChange(t.value)}>{t.icon && <Icon name={t.icon} size="sm" />}{t.label}{t.count != null && <span className="sp-count">{t.count}</span>}</button>)}
    </div>
  );
}

function Badge({ tone, pill, dot, icon, children }) {
  return <span className={cx('sp-badge', tone && `sp-badge--${tone}`, pill && 'sp-pill')}>{dot && <span className="sp-dot"></span>}{icon && <Icon name={icon} />}{children}</span>;
}
function Notice({ tone = 'info', title, children, actions, onDismiss }) {
  const icon = { info: 'info', success: 'circle-check', warning: 'triangle-alert', danger: 'circle-x' }[tone];
  return (
    <div className={`sp-notice sp-notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} className="sp-notice__icon" /><div className="sp-notice__title">{title}</div>
      {onDismiss && <Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Dismiss" className="sp-notice__close" onClick={onDismiss} />}
      {children && <div className="sp-notice__body">{children}</div>}
      {actions && <div className="sp-notice__actions">{actions}</div>}
    </div>
  );
}
function PlusBanner({ title = 'Get more from Sparko with Plus', children, onUpgrade, onDismiss }) {
  return (
    <div className="sp-plus sp-sparks"><span className="sp-plus__mark"><Icon name="crown" size="lg" /></span>
      <div className="sp-plus__text"><div className="sp-plus__title">{title}</div><div className="sp-plus__desc">{children}</div></div>
      <div className="sp-plus__actions"><Button variant="primary" size="sm" onClick={onUpgrade}>Upgrade to Plus</Button>{onDismiss && <Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Dismiss" onClick={onDismiss} />}</div>
    </div>
  );
}
function PausedBanner({ server, reference, children, bar, actions }) {
  return (
    <div className={cx('sp-paused', bar && 'sp-paused--bar')} role="alert"><Icon name="circle-pause" size="lg" className="sp-paused__icon" />
      <div className="sp-paused__title">Sparko is paused on {server}{reference && <span className="sp-paused__ref">Ref {reference}</span>}</div>
      <div className="sp-paused__body">{children}</div>{actions && <div className="sp-paused__actions">{actions}</div>}
    </div>
  );
}

function Card({ title, subtitle, action, footer, children, className }) {
  return (
    <section className={cx('sp-card', className)}>
      {title && <div className="sp-card__head"><div className="sp-card__titles"><h3 className="sp-card__title">{title}</h3>{subtitle && <p className="sp-card__sub">{subtitle}</p>}</div>{action}</div>}
      <div className="sp-card__body">{children}</div>
      {footer && <div className="sp-card__foot">{footer}</div>}
    </section>
  );
}
function Stat({ label, icon, value, delta, trend = 'flat', meta, loading }) {
  if (loading) return <div className="sp-stat" aria-busy="true"><span className="sp-skel" style={{ width: '40%' }}></span><span className="sp-skel sp-skel--stat"></span><span className="sp-skel" style={{ width: '60%' }}></span></div>;
  return (
    <div className="sp-stat"><div className="sp-stat__label">{icon && <Icon name={icon} size="sm" />}{label}</div><div className="sp-stat__value">{value}</div>
      <div className="sp-stat__meta">{delta != null && <span className={`sp-delta sp-delta--${trend}`}><Icon name={trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'minus'} />{delta}</span>}{meta}</div></div>
  );
}
function EmptyState({ icon = 'inbox', title, children, actions, error, code }) {
  return (
    <div className={cx('sp-empty', error ? 'sp-empty--error' : 'sp-sparks')} role={error ? 'alert' : undefined}>
      <div className="sp-empty__art"><Icon name={error ? 'cloud-off' : icon} /></div><div className="sp-empty__title">{title}</div>
      {children && <p className="sp-empty__desc">{children}</p>}{code && <span className="sp-empty__code">{code}</span>}
      {actions && <div className="sp-empty__actions">{actions}</div>}
    </div>
  );
}

function Avatar({ name = '?', src, color = 1, size, status }) {
  return <span className={cx('sp-avatar', `sp-avatar--${color}`, size && `sp-avatar--${size}`)}>{src ? <img src={src} alt="" /> : name[0].toUpperCase()}{status && <span className={`sp-avatar__status sp-avatar__status--${status}`}></span>}</span>;
}
function ServerIcon({ name = '', src, hue = 85, size, plus, selected }) {
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return <span className={cx('sp-server', !src && 'sp-server--tint', size && `sp-server--${size}`, selected && 'is-selected')} style={{ '--h': hue }}>{src ? <img src={src} alt="" /> : initials}{plus && <span className="sp-server__badge"><Icon name="crown" /></span>}</span>;
}

/* Searchable combobox. items: [{value,label,icon?,color?,group?,disabled?,note?}]; multiple → value is an array. */
function Combobox({ label, items, value, onChange, multiple, placeholder = 'Select…', searchPlaceholder = 'Search', error, hint, footer }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [active, setActive] = useState(-1); const ref = useRef(null); const lid = useId();
  useEffect(() => { if (!open) return; const h = e => { if (!ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const sel = multiple ? (value || []) : value;
  const isSel = v => multiple ? sel.includes(v) : sel === v;
  const list = items.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase()));
  const pick = i => { if (i.disabled) return; if (multiple) onChange(isSel(i.value) ? sel.filter(x => x !== i.value) : [...sel, i.value]); else { onChange(i.value); setOpen(false); } };
  const glyph = i => i.color ? <span className="sp-role-dot" style={{ '--role': i.color }}></span> : i.icon ? <Icon name={i.icon} className="sp-channel-glyph" /> : null;
  const key = e => {
    const en = list.map((x, k) => [x, k]).filter(([x]) => !x.disabled);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!en.length) return; const c = en.findIndex(([, k]) => k === active); const n = e.key === 'ArrowDown' ? (c + 1) % en.length : (c - 1 + en.length) % en.length; setActive(en[n][1]); }
    else if (e.key === 'Enter' && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const selected = items.filter(i => isSel(i.value));
  let lastGroup;
  return (
    <div className="sp-combo" ref={ref}>
      {label && <span className="sp-label" id={lid}>{label}</span>}
      {multiple ? (
        <div className={cx('sp-input sp-input--chips', error && 'is-error')} role="combobox" tabIndex={0} aria-labelledby={lid} aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={e => { if (e.target === e.currentTarget && ['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setOpen(true); } }} style={{ cursor: 'pointer' }}>
          {selected.length ? selected.map(i => <span key={i.value} className="sp-chip">{glyph(i)}{i.label}<button type="button" className="sp-chip__remove" aria-label={`Remove ${i.label}`} onClick={e => { e.stopPropagation(); pick(i); }}><Icon name="x" /></button></span>) : <span className="sp-input__placeholder" style={{ paddingLeft: 6 }}>{placeholder}</span>}
          <Icon name="chevron-down" className="sp-input__chev" />
        </div>
      ) : (
        <button type="button" className={cx('sp-input', error && 'is-error')} aria-labelledby={lid} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className={cx('sp-input__value', !selected[0] && 'sp-input__placeholder')}>{selected[0] ? <>{glyph(selected[0])}{selected[0].label}</> : placeholder}</span><Icon name="chevron-down" className="sp-input__chev" />
        </button>
      )}
      {open && (
        <div className="sp-popover" role="listbox" aria-labelledby={lid} aria-multiselectable={multiple || undefined}>
          <div className="sp-popover__search"><Icon name="search" size="sm" /><input autoFocus value={q} onChange={e => { setQ(e.target.value); setActive(-1); }} onKeyDown={key} placeholder={searchPlaceholder} aria-label={searchPlaceholder} /></div>
          <div className="sp-popover__list">
            {list.map((i, k) => { const g = i.group && i.group !== lastGroup ? (lastGroup = i.group) : null; return (
              <React.Fragment key={i.value}>{g && <div className="sp-option-group">{g}</div>}
                <button type="button" tabIndex={-1} className="sp-option" role="option" aria-selected={isSel(i.value)} aria-disabled={i.disabled || undefined} data-active={k === active} onMouseEnter={() => setActive(k)} onClick={() => pick(i)}>
                  {glyph(i)}<span className="sp-option__label">{i.label}</span>{i.note && <span className="sp-option__meta">{i.note}</span>}{isSel(i.value) && <span className="sp-option__check"><Icon name="check" /></span>}
                </button></React.Fragment>); })}
            {!list.length && <div className="sp-popover__empty">No results for “{q}”.</div>}
          </div>
          {footer && <div className="sp-popover__foot">{footer}</div>}
        </div>
      )}
      {error ? <p className="sp-field-error"><Icon name="circle-alert" />{error}</p> : hint ? <p className="sp-hint">{hint}</p> : null}
    </div>
  );
}
const ChannelPicker = ({ channels, ...p }) => <Combobox searchPlaceholder="Search channels" placeholder="Select a channel" items={channels.map(c => ({ value: c.id ?? c.name, label: c.name, icon: c.type === 'voice' ? 'volume-2' : c.type === 'announcement' ? 'megaphone' : 'hash', group: c.category, disabled: c.disabled, note: c.disabled ? 'No access' : undefined }))} {...p} />;
const RolePicker = ({ roles, ...p }) => <Combobox multiple searchPlaceholder="Search roles" placeholder="Add roles" items={roles.map(r => ({ value: r.id ?? r.name, label: r.name, color: r.color, disabled: r.disabled, note: r.note }))} {...p} />;

function Modal({ open, onClose, title, description, icon, children, footer }) {
  const tid = useId();
  useEffect(() => { if (!open) return; const h = e => e.key === 'Escape' && onClose && onClose(); document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sp-scrim" onMouseDown={e => e.target === e.currentTarget && onClose && onClose()}>
      <div className="sp-modal" role="dialog" aria-modal="true" aria-labelledby={tid}>
        <span className="sp-sheet-grip"></span>
        <div className="sp-modal__head">{icon && <span className="sp-modal__icon"><Icon name={icon} /></span>}<div className="sp-modal__titles"><h2 className="sp-modal__title" id={tid}>{title}</h2>{description && <p className="sp-modal__desc">{description}</p>}</div><Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Close" onClick={onClose} /></div>
        <div className="sp-modal__body">{children}</div>{footer && <div className="sp-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
function Toast({ tone = 'success', title, children, onDismiss, actions }) {
  const icon = { success: 'circle-check', danger: 'circle-x', info: 'info', warning: 'triangle-alert' }[tone];
  return (
    <div className={`sp-toast sp-toast--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} className="sp-toast__icon" /><div className="sp-toast__title">{title}</div>
      <Button variant="ghost" size="sm" iconOnly icon="x" aria-label="Dismiss" className="sp-toast__close" onClick={onDismiss} />
      {children && <div className="sp-toast__body">{children}</div>}{actions && <div className="sp-toast__actions">{actions}</div>}
    </div>
  );
}
function SaveBar({ state = 'dirty', onSave, onReset, message }) {
  const m = { dirty: ['triangle-alert', 'You have unsaved changes'], saving: ['triangle-alert', 'Saving your changes…'], error: ['circle-alert', 'Couldn’t save'], saved: ['circle-check', 'Changes saved'] }[state];
  return (
    <div className={cx('sp-savebar', state === 'error' && 'is-error', state === 'saved' && 'is-saved')} role="region" aria-label="Unsaved changes">
      <div className="sp-savebar__msg"><Icon name={m[0]} /><span>{m[1]}{message && <small>{message}</small>}</span></div>
      <div className="sp-savebar__actions"><Button variant="ghost" disabled={state === 'saving'} onClick={onReset}>Reset</Button><Button variant="primary" loading={state === 'saving'} loadingLabel="Saving…" onClick={onSave}>{state === 'error' ? 'Try again' : 'Save changes'}</Button></div>
    </div>
  );
}

/* Discord message preview. embed: {color,author,title,description,fields:[{name,value,inline}],footer,thumbnail}; components: [[{label,style,emoji,url,disabled}] | {select:'placeholder'}] */
function DiscordMessage({ author = 'Sparko', avatar, bot = true, time = 'Today at 4:20 PM', content, embed, components = [] }) {
  return (
    <div className="dc-msg">
      <div className="dc-avatar">{avatar ? <img src={avatar} alt="" /> : author[0]}</div>
      <div className="dc-head"><span className="dc-name">{author}</span>{bot && <span className="dc-tag"><Icon name="check" />App</span>}<span className="dc-time">{time}</span></div>
      {content && <div className="dc-content">{content}</div>}
      {embed && (
        <div className="dc-embed" style={{ '--dc-color': embed.color || '#1E1F22' }}>
          <div className="dc-embed__main">
            {embed.author && <div className="dc-embed__author"><span className="dc-embed__author-icon">{embed.author[0]}</span>{embed.author}</div>}
            {embed.title && <div className="dc-embed__title">{embed.title}</div>}
            {embed.description && <div className="dc-embed__desc">{embed.description}</div>}
            {embed.fields && <div className="dc-fields">{embed.fields.map((f, i) => <div key={i} className={cx('dc-field', f.inline && 'dc-field--inline')}><div className="dc-field__name">{f.name}</div><div className="dc-field__value">{f.value}</div></div>)}</div>}
          </div>
          {embed.thumbnail && <div className="dc-embed__thumb"><img src={embed.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
          {embed.footer && <div className="dc-embed__footer">{embed.footer}</div>}
        </div>
      )}
      {components.length > 0 && <div className="dc-components">{components.map((row, i) => row.select ? <button key={i} type="button" className="dc-select"><span>{row.select}</span><Icon name="chevron-down" size="lg" /></button> : <div key={i} className="dc-row">{row.map((b, j) => <button key={j} type="button" disabled={b.disabled} className={cx('dc-btn', b.style && b.style !== 'secondary' && b.style !== 'link' && `dc-btn--${b.style}`)}>{b.emoji && <span className="dc-emoji">{b.emoji}</span>}{b.label}{b.style === 'link' && <Icon name="external-link" />}</button>)}</div>)}</div>}
    </div>
  );
}
const DiscordPreview = ({ children }) => <div className="dc-preview-frame"><div className="dc-chat">{children}</div></div>;

const Sparko = { Icon, Spinner, Button, Field, Input, Textarea, Select, Switch, Checkbox, RadioCards, Segmented, Tabs, Badge, Notice, PlusBanner, PausedBanner, Card, Stat, EmptyState, Avatar, ServerIcon, Combobox, ChannelPicker, RolePicker, Modal, Toast, SaveBar, DiscordMessage, DiscordPreview };
if (typeof window !== 'undefined') window.Sparko = Sparko;
if (typeof module !== 'undefined') module.exports = Sparko;
