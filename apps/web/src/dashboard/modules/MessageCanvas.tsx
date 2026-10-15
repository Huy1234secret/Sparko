import { useState, type ReactNode } from 'react';
import { Icon, Segmented } from '../../ui';
import {
  planProblem,
  studioProblem,
  type Server,
  type StudioMessage,
} from '../../data';
import { ContainerCanvas, MAX_GALLERY, newImage } from './ContainerCanvas';
import { EmbedCanvas, MAX_EMBEDS, newEmbed } from './EmbedCanvas';
import { newButton, newMenu, roomFor } from './ComponentsEditor';
import { useInsertTarget } from './EditorBits';
import { EmojiButton } from './EmojiPicker';
import { PlusMenu, type PlusItem } from './PlusMenu';
import { VariablesButton } from './VariablesButton';

/** Characters Discord counts toward the 6,000 shared by a message's embeds. */
export const embedSize = (m: StudioMessage) =>
  m.embeds.reduce(
    (n, e) =>
      n +
      e.author.length +
      e.title.length +
      e.description.length +
      e.footer.length +
      e.fields.reduce((k, f) => k + f.name.length + f.value.length, 0),
    0,
  );

/** Pictures uploaded in the sample data live in this browser, as blob: links. */
export const forChecks = (m: StudioMessage): StudioMessage =>
  JSON.parse(
    JSON.stringify(m).replace(/"blob:[^"]*"/g, '"https://upload.invalid"'),
  ) as StudioMessage;

/** The variables and emoji buttons and the plus menu above the preview. */
function PreviewTools({
  serverId,
  items,
  onEmoji,
  v2,
  memberVariables,
}: {
  serverId: string;
  items: PlusItem[];
  onEmoji: (text: string) => void;
  v2: boolean;
  memberVariables: boolean;
}) {
  const target = useInsertTarget();
  // Goes where the person was last writing, or at the end of the text.
  const put = (text: string) => {
    const insert = target.get();
    if (insert) insert(text);
    else onEmoji(text);
  };
  return (
    <div className="sp-preview-tools">
      <VariablesButton v2={v2} member={memberVariables} onPick={put} />
      <EmojiButton serverId={serverId} onPick={put} />
      <PlusMenu items={items} />
    </div>
  );
}

/**
 * The live preview people edit a message in: the message type, the
 * variables, emoji and plus buttons, and the message itself. Message
 * Studio and Welcome messages both use it.
 */
export function MessageCanvas({
  server,
  message,
  tried,
  onChange,
  headingId = 'studio-preview',
  above,
  memberVariables,
  check = (m) => m,
}: {
  server: Server;
  message: StudioMessage;
  /** After a save or post was tried, problems show under the message. */
  tried: boolean;
  onChange: (patch: Partial<StudioMessage>) => void;
  headingId?: string;
  /** Shown above the preview's heading. */
  above?: ReactNode;
  /** Lists the variables only welcome, leave and boost messages fill in. */
  memberVariables?: boolean;
  /** Adjusts the message before it's checked. */
  check?: (m: StudioMessage) => StudioMessage;
}) {
  const [focus, setFocus] = useState<{
    id: string;
    pop?: 'image';
  } | null>(null);
  const paused = !!server.paused;
  const v2 = message.layout === 'v2';
  const problem =
    studioProblem(forChecks(check(message))) ??
    planProblem(message, server.plan === 'plus' ? 'plus' : 'free');
  const size = embedSize(message);

  const addButton = () => {
    const button = newButton();
    onChange({ components: [...message.components, button] });
    setFocus({ id: button.id });
  };
  const addMenu = () => {
    const menu = newMenu();
    onChange({ components: [...message.components, menu] });
    setFocus({ id: menu.id });
  };
  const rows = 'Discord shows up to 5 rows of buttons and menus.';
  const items: PlusItem[] = v2
    ? [
        {
          label: 'Add image',
          disabled: message.v2.gallery.length >= MAX_GALLERY,
          note: 'A gallery holds up to 10 images.',
          onSelect: () => {
            const image = newImage();
            onChange({
              v2: { ...message.v2, gallery: [...message.v2.gallery, image] },
            });
            setFocus({ id: image.id });
          },
        },
        {
          label: 'Add button',
          disabled: !roomFor(message.components, 'button'),
          note: rows,
          onSelect: addButton,
        },
        {
          label: 'Add menu',
          disabled: !roomFor(message.components, 'menu'),
          note: rows,
          onSelect: addMenu,
        },
        {
          label: 'Add separator',
          onSelect: () =>
            onChange({
              v2: {
                ...message.v2,
                text: `${message.v2.text}\n{separator}\n`.slice(0, 4000),
              },
            }),
        },
      ]
    : [
        {
          label: 'Add embed',
          disabled: message.embeds.length >= MAX_EMBEDS,
          note: 'A message holds up to 10 embeds.',
          onSelect: () => onChange({ embeds: [...message.embeds, newEmbed()] }),
        },
        {
          label: 'Add button',
          disabled: !roomFor(message.components, 'button'),
          note: rows,
          onSelect: addButton,
        },
        {
          label: 'Add menu',
          disabled: !roomFor(message.components, 'menu'),
          note: rows,
          onSelect: addMenu,
        },
        {
          label: 'Add image',
          disabled: message.embeds.length >= MAX_EMBEDS,
          note: 'A message holds up to 10 embeds.',
          // An image on its own is an embed with only a picture in it.
          onSelect: () => {
            const embed = newEmbed();
            onChange({ embeds: [...message.embeds, embed] });
            setFocus({ id: embed.id, pop: 'image' });
          },
        },
      ];

  return (
    <section className="sp-studio__canvas" aria-labelledby={headingId}>
      <Segmented
        label="Message type"
        className="sp-studio__type"
        value={message.layout}
        onChange={(layout) => {
          onChange({ layout });
        }}
        options={[
          { value: 'embed', label: 'Embed message' },
          { value: 'v2', label: 'V2 components' },
        ]}
      />
      {above}
      <div className="sp-preview-head">
        <h2 id={headingId} className="sp-section-title">
          Live preview
        </h2>
        <PreviewTools
          serverId={server.id}
          memberVariables={!!memberVariables}
          items={items}
          v2={v2}
          onEmoji={(text) =>
            v2
              ? onChange({
                  v2: {
                    ...message.v2,
                    text: (message.v2.text + text).slice(0, 4000),
                  },
                })
              : onChange({
                  content: (message.content + text).slice(0, 2000),
                })
          }
        />
      </div>
      <fieldset className="sp-fieldset" disabled={paused} data-issue="message">
        <legend className="sp-sr-only">Message</legend>
        {v2 ? (
          <ContainerCanvas
            message={message}
            serverId={server.id}
            onChange={onChange}
            focusId={focus?.id ?? null}
          />
        ) : (
          <EmbedCanvas
            message={message}
            serverId={server.id}
            onChange={onChange}
            focus={focus}
          />
        )}
      </fieldset>
      {tried && problem && (
        <p className="sp-field-error">
          <Icon name="circle-alert" />
          {problem}
        </p>
      )}
      {!v2 && message.embeds.length > 0 && (
        <div className="sp-embed-size">
          <div className="sp-field__row">
            <span className="sp-hint">Embed size</span>
            <span className="sp-hint sp-tnum">
              {size.toLocaleString('en-US')} / 6,000
            </span>
          </div>
          <div
            className="sp-progress sp-progress--sm"
            role="progressbar"
            aria-label="Embed characters used"
            aria-valuenow={size}
            aria-valuemin={0}
            aria-valuemax={6000}
          >
            <span
              className={'sp-progress__bar' + (size > 6000 ? ' is-over' : '')}
              style={{ width: `${Math.min(100, (size / 6000) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
