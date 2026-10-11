import { useEffect, useState } from 'react';
import { EmbedSchema, type MessageDocument } from '@sparko/messages';
import { Button, Field, Input } from '@sparko/ui';
import { ControlEditor, type ControlEditorResources } from './ControlEditor';

type Document = Extract<MessageDocument, { mode: 'embed' }>;
type Embed = Document['embeds'][number];
function TimestampEditor({
  value,
  onChange,
  id,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  id: string;
}) {
  const [draft, setDraft] = useState(value?.replace(/Z$/, '') ?? '');
  const [issue, setIssue] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDraft(value?.replace(/Z$/, '') ?? '');
    setIssue(undefined);
  }, [value]);
  function apply() {
    if (!draft) {
      onChange(undefined);
      setIssue(undefined);
      setSaved(true);
      return;
    }
    const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft)
      ? `${draft}:00Z`
      : `${draft}Z`;
    const parsed = EmbedSchema.shape.timestamp.safeParse(timestamp);
    if (!parsed.success || !parsed.data) {
      setIssue('Enter a valid date and time in UTC.');
      return;
    }
    onChange(new Date(parsed.data).toISOString());
    setIssue(undefined);
    setSaved(true);
  }
  return (
    <div className="stack">
      <Field
        label="Timestamp (UTC)"
        htmlFor={id}
        hint="Optional. Enter the time in UTC, then apply it. Discord displays it in each member’s local timezone. Clear this field and apply to remove it."
        error={issue}
      >
        <Input
          id={id}
          type="datetime-local"
          step="any"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
        />
      </Field>
      {saved && <p role="status">Timestamp applied to this design.</p>}
      <Button variant="secondary" onClick={apply}>
        Apply timestamp
      </Button>
    </div>
  );
}
export function EmbedEditor({
  document,
  onChange,
  resources,
}: {
  document: Document;
  onChange: (next: Document) => void;
  resources: ControlEditorResources;
}) {
  function update(index: number, edit: (embed: Embed) => void) {
    const next = structuredClone(document);
    const embed = next.embeds[index];
    if (embed) {
      edit(embed);
      onChange(next);
    }
  }
  return (
    <div className="stack">
      <Field
        label="Content"
        htmlFor="embed-content"
        hint="Traditional messages can contain ordinary content. V2 messages use blocks."
      >
        <textarea
          id="embed-content"
          maxLength={2000}
          value={document.content ?? ''}
          onChange={(e) => onChange({ ...document, content: e.target.value })}
        />
      </Field>
      {document.embeds.map((embed, index) => (
        <fieldset className="stack embed-editor" key={index}>
          <legend>Embed {index + 1}</legend>
          <Field label="Embed title" htmlFor={`embed-title-${index}`}>
            <Input
              id={`embed-title-${index}`}
              maxLength={256}
              value={embed.title ?? ''}
              onChange={(e) =>
                update(index, (current) => {
                  if (e.target.value) current.title = e.target.value;
                  else delete current.title;
                })
              }
            />
          </Field>
          <Field
            label="Title link URL"
            htmlFor={`embed-url-${index}`}
            hint="Optional public HTTPS link opened when a member selects the embed title."
          >
            <Input
              id={`embed-url-${index}`}
              type="url"
              maxLength={512}
              value={embed.url ?? ''}
              onChange={(e) =>
                update(index, (current) => {
                  if (e.target.value) current.url = e.target.value;
                  else delete current.url;
                })
              }
            />
          </Field>
          <Field label="Description" htmlFor={`embed-description-${index}`}>
            <textarea
              id={`embed-description-${index}`}
              maxLength={4096}
              value={embed.description ?? ''}
              onChange={(e) =>
                update(index, (current) => {
                  if (e.target.value) current.description = e.target.value;
                  else delete current.description;
                })
              }
            />
          </Field>
          <Field label="Accent color" htmlFor={`embed-color-${index}`}>
            <Input
              type="color"
              id={`embed-color-${index}`}
              value={`#${embed.color.toString(16).padStart(6, '0')}`}
              onChange={(e) =>
                update(index, (current) => {
                  current.color = Number.parseInt(e.target.value.slice(1), 16);
                })
              }
            />
          </Field>
          <TimestampEditor
            id={`embed-timestamp-${index}`}
            value={embed.timestamp}
            onChange={(timestamp) =>
              update(index, (current) => {
                if (timestamp) current.timestamp = timestamp;
                else delete current.timestamp;
              })
            }
          />
          <div className="form-grid">
            {(['image', 'thumbnail'] as const).map((name) => (
              <Field
                key={name}
                label={name === 'image' ? 'Image URL' : 'Thumbnail URL'}
                htmlFor={`embed-${name}-${index}`}
              >
                <Input
                  id={`embed-${name}-${index}`}
                  value={embed[name] ?? ''}
                  onChange={(e) =>
                    update(index, (current) => {
                      if (e.target.value) current[name] = e.target.value;
                      else delete current[name];
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <details>
            <summary>Author and footer</summary>
            <div className="stack">
              <Field label="Author name" htmlFor={`embed-author-${index}`}>
                <Input
                  id={`embed-author-${index}`}
                  maxLength={256}
                  value={embed.author?.name ?? ''}
                  onChange={(e) =>
                    update(index, (current) => {
                      if (e.target.value)
                        current.author = {
                          ...current.author,
                          name: e.target.value,
                        };
                      else delete current.author;
                    })
                  }
                />
              </Field>
              {embed.author && (
                <>
                  <Field
                    label="Author link"
                    htmlFor={`embed-author-url-${index}`}
                  >
                    <Input
                      id={`embed-author-url-${index}`}
                      value={embed.author.url ?? ''}
                      onChange={(e) =>
                        update(index, (current) => {
                          if (!current.author) return;
                          if (e.target.value)
                            current.author.url = e.target.value;
                          else delete current.author.url;
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Author icon URL"
                    htmlFor={`embed-author-icon-${index}`}
                  >
                    <Input
                      id={`embed-author-icon-${index}`}
                      value={embed.author.iconUrl ?? ''}
                      onChange={(e) =>
                        update(index, (current) => {
                          if (!current.author) return;
                          if (e.target.value)
                            current.author.iconUrl = e.target.value;
                          else delete current.author.iconUrl;
                        })
                      }
                    />
                  </Field>
                </>
              )}
              <Field label="Footer" htmlFor={`embed-footer-${index}`}>
                <Input
                  id={`embed-footer-${index}`}
                  maxLength={2048}
                  value={embed.footer?.text ?? ''}
                  onChange={(e) =>
                    update(index, (current) => {
                      if (e.target.value)
                        current.footer = {
                          ...current.footer,
                          text: e.target.value,
                        };
                      else delete current.footer;
                    })
                  }
                />
              </Field>
              {embed.footer && (
                <Field
                  label="Footer icon URL"
                  htmlFor={`embed-footer-icon-${index}`}
                >
                  <Input
                    id={`embed-footer-icon-${index}`}
                    value={embed.footer.iconUrl ?? ''}
                    onChange={(e) =>
                      update(index, (current) => {
                        if (!current.footer) return;
                        if (e.target.value)
                          current.footer.iconUrl = e.target.value;
                        else delete current.footer.iconUrl;
                      })
                    }
                  />
                </Field>
              )}
            </div>
          </details>
          {embed.fields?.map((field, position) => (
            <div className="card stack" key={position}>
              <Field
                label={`Field ${position + 1} name`}
                htmlFor={`embed-field-name-${index}-${position}`}
              >
                <Input
                  id={`embed-field-name-${index}-${position}`}
                  value={field.name}
                  maxLength={256}
                  onChange={(e) =>
                    update(index, (current) => {
                      const next = current.fields?.[position];
                      if (next) next.name = e.target.value;
                    })
                  }
                />
              </Field>
              <Field
                label={`Field ${position + 1} value`}
                htmlFor={`embed-field-value-${index}-${position}`}
              >
                <textarea
                  id={`embed-field-value-${index}-${position}`}
                  maxLength={1024}
                  value={field.value}
                  onChange={(e) =>
                    update(index, (current) => {
                      const next = current.fields?.[position];
                      if (next) next.value = e.target.value;
                    })
                  }
                />
              </Field>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={field.inline}
                  onChange={(e) =>
                    update(index, (current) => {
                      const next = current.fields?.[position];
                      if (next) next.inline = e.target.checked;
                    })
                  }
                />
                Display this field inline
              </label>
              <Button
                variant="secondary"
                onClick={() =>
                  update(index, (current) => {
                    current.fields =
                      current.fields?.filter((_, i) => i !== position) ?? [];
                  })
                }
              >
                Remove embed field
              </Button>
            </div>
          ))}
          <div className="row">
            <Button
              variant="secondary"
              disabled={(embed.fields?.length ?? 0) >= 25}
              onClick={() =>
                update(index, (current) => {
                  current.fields = [
                    ...(current.fields ?? []),
                    { name: 'Field name', value: 'Field value', inline: false },
                  ];
                })
              }
            >
              Add embed field
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                onChange({
                  ...document,
                  embeds: document.embeds.filter((_, i) => i !== index),
                })
              }
            >
              Remove embed
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        disabled={document.embeds.length >= 10}
        onClick={() =>
          onChange({
            ...document,
            embeds: [
              ...document.embeds,
              {
                title: 'New embed',
                description: 'Your message goes here.',
                color: 16436245,
              },
            ],
          })
        }
      >
        Add embed
      </Button>
      {document.blocks.map((row, index) => (
        <fieldset className="stack" key={index}>
          <legend>Control row {index + 1}</legend>
          <ControlEditor
            row={row}
            resources={resources}
            onChange={(next) =>
              onChange({
                ...document,
                blocks: document.blocks.map((current, i) =>
                  i === index ? next : current,
                ),
              })
            }
          />
          <Button
            variant="secondary"
            onClick={() =>
              onChange({
                ...document,
                blocks: document.blocks.filter((_, i) => i !== index),
              })
            }
          >
            Remove control row
          </Button>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        disabled={document.blocks.length >= 5}
        onClick={() =>
          onChange({
            ...document,
            blocks: [
              ...document.blocks,
              {
                type: 'controls',
                controls: [
                  {
                    type: 'button',
                    key: 'button-' + crypto.randomUUID().slice(0, 8),
                    label: 'Learn more',
                    style: 'secondary',
                    action: {
                      type: 'response.private',
                      text: 'Your action is saved.',
                    },
                  },
                ],
              },
            ],
          })
        }
      >
        Add control row
      </Button>
    </div>
  );
}
