import type { ReactNode } from 'react';
import {
  compileMessage,
  getMessageActions,
  type MessageDocument,
} from '@sparko/messages';
import { ExternalLink, FileText, Zap } from 'lucide-react';
import { ErrorState } from '@sparko/ui';
import { z } from 'zod';

const ComponentSchema: z.ZodType<{
  type: number;
  content?: string | undefined;
  components?: unknown[] | undefined;
  label?: string | undefined;
  url?: string | undefined;
  divider?: boolean | undefined;
  media?: { url: string } | undefined;
  items?:
    | { media: { url: string }; description?: string | undefined }[]
    | undefined;
  accent_color?: number | undefined;
  placeholder?: string | undefined;
  accessory?: unknown;
}> = z.object({
  type: z.number(),
  content: z.string().optional(),
  components: z.array(z.unknown()).optional(),
  label: z.string().optional(),
  url: z.string().optional(),
  divider: z.boolean().optional(),
  media: z.object({ url: z.string() }).optional(),
  items: z
    .array(
      z.object({
        media: z.object({ url: z.string() }),
        description: z.string().optional(),
      }),
    )
    .optional(),
  accent_color: z.number().optional(),
  placeholder: z.string().optional(),
  accessory: z.unknown().optional(),
});
function text(value: string): ReactNode {
  return value
    .split('\n')
    .map((line, i) =>
      line.startsWith('## ') ? (
        <h3 key={i}>{line.slice(3)}</h3>
      ) : line.startsWith('# ') ? (
        <h2 key={i}>{line.slice(2)}</h2>
      ) : (
        <p key={i}>{line || <br />}</p>
      ),
    );
}
/** Owned asset references remain attachment:// in the compiled Discord payload. */
function previewMediaUrl(value: string): string {
  const asset = /^attachment:\/\/sparko-([a-zA-Z0-9-]+)\.png$/.exec(value);
  return asset?.[1]
    ? `/api/v1/public/assets/${encodeURIComponent(asset[1])}`
    : value;
}
function renderComponent(input: unknown, key: string): ReactNode {
  const parsed = ComponentSchema.safeParse(input);
  if (!parsed.success) return null;
  const item = parsed.data;
  switch (item.type) {
    case 17:
      return (
        <div
          key={key}
          className="discord-container"
          style={{
            borderLeftColor: `#${(item.accent_color ?? 16436245).toString(16).padStart(6, '0')}`,
          }}
        >
          {item.components?.map((child, i) =>
            renderComponent(child, `${key}-${i}`),
          )}
        </div>
      );
    case 10:
      return (
        <div key={key} className="discord-text">
          {text(item.content ?? '')}
        </div>
      );
    case 14:
      return item.divider ? (
        <hr key={key} />
      ) : (
        <div key={key} className="discord-space" />
      );
    case 1:
      return (
        <div key={key} className="discord-controls">
          {item.components?.map((child, i) =>
            renderComponent(child, `${key}-${i}`),
          )}
        </div>
      );
    case 2:
      return (
        <button key={key} type="button" className="discord-button" disabled>
          {item.label}
          {item.url && <ExternalLink size={12} />}
        </button>
      );
    case 3:
      return (
        <select
          key={key}
          aria-label={item.placeholder ?? 'Message select preview'}
          disabled
        >
          <option>{item.placeholder ?? 'Choose an option'}</option>
        </select>
      );
    case 9:
      return (
        <div key={key} className="discord-section">
          <div>
            {item.components?.map((child, i) =>
              renderComponent(child, `${key}-${i}`),
            )}
          </div>
          {item.accessory
            ? renderComponent(item.accessory, `${key}-accessory`)
            : null}
        </div>
      );
    case 11:
      return item.media ? (
        <img
          key={key}
          className="discord-thumbnail"
          src={previewMediaUrl(item.media.url)}
          alt="Message thumbnail preview"
        />
      ) : null;
    case 12:
      return (
        <div key={key} className="discord-gallery">
          {item.items?.map((image, i) => (
            <img
              key={i}
              src={previewMediaUrl(image.media.url)}
              alt={image.description ?? 'Message media preview'}
            />
          ))}
        </div>
      );
    case 13:
      return (
        <div key={key} className="row">
          <FileText size={17} />
          Attachment
        </div>
      );
    default:
      return null;
  }
}
export const PREVIEW_CONTEXT = {
  'server.name': 'Your community',
  'channel.name': 'welcome',
  'member.name': 'Member',
  'member.id': '123456789012345678',
  'ticket.number': 1,
  'ticket.topic': 'Support',
  'level.number': 5,
  'level.xp': 250,
  'giveaway.deadline': 'Tomorrow at 18:00 UTC',
  'giveaway.result': 'Not drawn — preview',
};
export function MessagePreview({
  document,
  demo = false,
  compact = false,
}: {
  document: MessageDocument;
  demo?: boolean;
  compact?: boolean;
}) {
  try {
    const controls = Object.fromEntries(
      getMessageActions(document).map((action, i) => [
        action.key,
        `spk:ctl:preview_${i}`,
      ]),
    );
    const payload = compileMessage(document, PREVIEW_CONTEXT, controls);
    return (
      <div className={`discord-preview ${compact ? 'compact' : ''}`}>
        <div className="discord-author">
          <span className="discord-avatar">
            <Zap fill="currentColor" size={22} />
          </span>
          <strong>Sparko</strong>
          <span className="discord-app-badge">APP</span>
          <small>{demo ? 'Demonstration' : 'Design preview'}</small>
        </div>
        <div className="discord-message-content">
          {payload.content && text(payload.content)}
          {document.mode === 'embed' &&
            document.embeds.map((embed, i) => (
              <div
                className="discord-embed"
                key={i}
                style={{
                  borderLeftColor: `#${embed.color.toString(16).padStart(6, '0')}`,
                }}
              >
                {embed.author && <small>{embed.author.name}</small>}
                {embed.title && <h3>{embed.title}</h3>}
                {embed.description && text(embed.description)}
                {embed.thumbnail && (
                  <img
                    className="discord-thumbnail"
                    src={previewMediaUrl(embed.thumbnail)}
                    alt="Embed thumbnail"
                  />
                )}
                {embed.fields?.map((field, j) => (
                  <div className="discord-field" key={j}>
                    <strong>{field.name}</strong>
                    {text(field.value)}
                  </div>
                ))}
                {embed.image && (
                  <img
                    className="discord-image"
                    src={previewMediaUrl(embed.image)}
                    alt="Embed illustration"
                  />
                )}
                {embed.footer && <small>{embed.footer.text}</small>}
              </div>
            ))}
          {payload.components.map((item, i) =>
            renderComponent(item, String(i)),
          )}
        </div>
        <p className="preview-disclaimer">
          Layout preview. Discord clients can display spacing and typography
          differently.
        </p>
      </div>
    );
  } catch (error) {
    return (
      <ErrorState
        message={
          error instanceof z.ZodError
            ? error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join(' · ')
            : 'This design could not be compiled.'
        }
      />
    );
  }
}
