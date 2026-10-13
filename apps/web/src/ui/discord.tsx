import type { CSSProperties, ReactNode } from 'react';
import { cx, Icon } from './core';

export type DiscordEmbed = {
  color?: string;
  author?: string;
  title?: ReactNode;
  description?: ReactNode;
  fields?: { name: ReactNode; value: ReactNode; inline?: boolean }[];
  footer?: ReactNode;
  thumbnail?: string;
};
export type DiscordButton = {
  label: string;
  style?: 'primary' | 'secondary' | 'success' | 'danger' | 'link';
  emoji?: string;
  disabled?: boolean;
};
export type DiscordRow = DiscordButton[] | { select: string };

/** A message exactly as Discord shows it. Buttons are inert previews. */
export function DiscordMessage({
  author = 'Sparko',
  avatar,
  bot = true,
  time = 'Today at 18:42',
  content,
  embed,
  components = [],
  className,
}: {
  author?: string;
  avatar?: string;
  bot?: boolean;
  time?: string;
  content?: ReactNode;
  embed?: DiscordEmbed;
  components?: DiscordRow[];
  className?: string;
}) {
  return (
    <div className={cx('dc-msg', className)}>
      <div className="dc-avatar">
        {avatar ? <img src={avatar} alt="" /> : author[0]}
      </div>
      <div className="dc-head">
        <span className="dc-name">{author}</span>
        {bot && (
          <span className="dc-tag">
            <Icon name="check" />
            App
          </span>
        )}
        <span className="dc-time">{time}</span>
      </div>
      {content && <div className="dc-content">{content}</div>}
      {embed && (
        <div
          className="dc-embed"
          style={{ '--dc-color': embed.color ?? '#1E1F22' } as CSSProperties}
        >
          <div className="dc-embed__main">
            {embed.author && (
              <div className="dc-embed__author">
                <span className="dc-embed__author-icon">
                  {embed.author
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                {embed.author}
              </div>
            )}
            {embed.title && (
              <div className="dc-embed__title">{embed.title}</div>
            )}
            {embed.description && (
              <div className="dc-embed__desc">{embed.description}</div>
            )}
            {embed.fields && (
              <div className="dc-fields">
                {embed.fields.map((f, i) => (
                  <div
                    key={i}
                    className={cx('dc-field', f.inline && 'dc-field--inline')}
                  >
                    <div className="dc-field__name">{f.name}</div>
                    <div className="dc-field__value">{f.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {embed.thumbnail && (
            <div className="dc-embed__thumb">
              <img
                src={embed.thumbnail}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
          {embed.footer && (
            <div className="dc-embed__footer">
              <span className="dc-embed__footer-icon" />
              {embed.footer}
            </div>
          )}
        </div>
      )}
      {components.length > 0 && (
        <div className="dc-components">
          {components.map((row, i) =>
            'select' in row ? (
              <span key={i} className="dc-select">
                <span>{row.select}</span>
                <Icon name="chevron-down" size="lg" />
              </span>
            ) : (
              <div key={i} className="dc-row">
                {row.map((b, j) => (
                  <span
                    key={j}
                    className={cx(
                      'dc-btn',
                      b.style &&
                        b.style !== 'secondary' &&
                        b.style !== 'link' &&
                        `dc-btn--${b.style}`,
                      b.disabled && 'is-disabled',
                    )}
                  >
                    {b.emoji && <span className="dc-emoji">{b.emoji}</span>}
                    {b.label}
                    {b.style === 'link' && <Icon name="external-link" />}
                  </span>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function DiscordPreview({ children }: { children: ReactNode }) {
  return (
    <div className="dc-preview-frame">
      <div className="dc-chat">{children}</div>
    </div>
  );
}
