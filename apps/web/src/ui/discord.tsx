import type { CSSProperties, ReactNode } from 'react';
import { cx, Icon } from './core';

export type DiscordEmbed = {
  color?: string;
  author?: string;
  title?: ReactNode;
  description?: ReactNode;
  fields?: { name: ReactNode; value: ReactNode; inline?: boolean }[];
  footer?: ReactNode;
  /** An image link, or something to show in the thumbnail box instead. */
  thumbnail?: ReactNode;
  /** The large image under the embed, as a placeholder or an <img>. */
  image?: ReactNode;
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
  avatarColor,
  bot = true,
  time = 'Today at 18:42',
  content,
  embed,
  components = [],
  className,
  children,
}: {
  author?: string;
  avatar?: string;
  /** A person's avatar colour, 1–6, instead of Sparko's. */
  avatarColor?: number;
  bot?: boolean;
  time?: string;
  content?: ReactNode;
  embed?: DiscordEmbed;
  components?: DiscordRow[];
  className?: string;
  /** Extra content under the message, like an attachment. */
  children?: ReactNode;
}) {
  return (
    <div className={cx('dc-msg', className)}>
      <div
        className={cx(
          'dc-avatar',
          !!avatarColor && `dc-avatar--person sp-avatar--${avatarColor}`,
        )}
      >
        {avatar ? <img src={avatar} alt="" /> : author[0]?.toUpperCase()}
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
              {typeof embed.thumbnail === 'string' ? (
                <img
                  src={embed.thumbnail}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                embed.thumbnail
              )}
            </div>
          )}
          {embed.image && <div className="dc-embed__image">{embed.image}</div>}
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
      {children}
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

/** Discord-style text: @mentions and #channels highlighted, **bold** made bold. */
/** Pictures for server emojis the dashboard has loaded, by emoji id. */
const emojiPictures = new Map<string, string>();
export function rememberEmojis(list: { id: string; url: string }[]) {
  for (const e of list) emojiPictures.set(e.id, e.url);
}

export function renderDiscordText(text: string): ReactNode[] {
  return text
    .split(
      /(<a?:\w{1,32}:\d{1,25}>|@everyone|@here|@[A-Za-z][\w.-]*|#[a-z0-9-]+|\*\*[^*]+\*\*)/g,
    )
    .filter(Boolean)
    .map((part, i) => {
      const emoji = part.match(/^<(a?):(\w{1,32}):(\d{1,25})>$/);
      if (emoji)
        return (
          <img
            key={i}
            className="dc-custom-emoji"
            src={
              emojiPictures.get(emoji[3]!) ??
              `https://cdn.discordapp.com/emojis/${emoji[3]}.${emoji[1] ? 'gif' : 'webp'}?size=48`
            }
            alt={`:${emoji[2]}:`}
            title={`:${emoji[2]}:`}
          />
        );
      return part.startsWith('@') || part.startsWith('#') ? (
        <span key={i} className="dc-mention">
          {part}
        </span>
      ) : part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <b key={i}>{part.slice(2, -2)}</b>
      ) : (
        part
      );
    });
}
