import { useEffect, useState, useId, useRef } from 'react';
import {
  ActionSchema,
  ControlRowSchema,
  EmojiSchema,
  type MessageAction,
  type MessageBlock,
  type MessageControl,
} from '@sparko/messages';
import { Button, Field, Input } from '@sparko/ui';

type Row = Extract<MessageBlock, { type: 'controls' }>;
export type ControlEditorResources = {
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  emojis?: {
    id: string;
    name: string;
    animated: boolean;
    available?: boolean;
  }[];
};
type Emoji = Extract<MessageControl, { type: 'button' }>['emoji'];
type EmojiDraft = {
  mode: 'none' | 'unicode' | 'custom';
  unicode: string;
  id: string;
  name: string;
  animated: boolean;
  fallback: string;
};
function emojiDraft(emoji: Emoji): EmojiDraft {
  return {
    mode: !emoji ? 'none' : 'id' in emoji ? 'custom' : 'unicode',
    unicode: emoji && !('id' in emoji) ? emoji.name : '',
    id: emoji && 'id' in emoji ? emoji.id : '',
    name: emoji && 'id' in emoji ? emoji.name : '',
    animated: emoji && 'id' in emoji ? (emoji.animated ?? false) : false,
    fallback: emoji && 'id' in emoji ? (emoji.fallback ?? '') : '',
  };
}
function EmojiEditor({
  emoji,
  onChange,
  resources,
  id,
  label,
}: {
  emoji: Emoji;
  onChange: (next: Emoji) => void;
  resources: ControlEditorResources;
  id: string;
  label: string;
}) {
  const [draft, setDraft] = useState(() => emojiDraft(emoji));
  const [issues, setIssues] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const previous = useRef(JSON.stringify(emoji));
  useEffect(() => {
    const signature = JSON.stringify(emoji);
    if (signature !== previous.current) {
      previous.current = signature;
      setDraft(emojiDraft(emoji));
      setIssues([]);
    }
  }, [emoji]);
  const edit = (next: Partial<EmojiDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setSaved(false);
  };
  function apply() {
    if (draft.mode === 'none') {
      onChange(undefined);
      setIssues([]);
      setSaved(true);
      return;
    }
    if (draft.mode === 'custom') {
      if (!draft.fallback.trim()) {
        setIssues(['Choose a Unicode fallback for this custom emoji.']);
        return;
      }
      const fallback = EmojiSchema.options[0].safeParse({
        name: draft.fallback.trim(),
      });
      if (!fallback.success) {
        setIssues(['The fallback must be a Unicode emoji, such as 🎫.']);
        return;
      }
    }
    const parsed =
      draft.mode === 'unicode'
        ? EmojiSchema.options[0].safeParse({ name: draft.unicode.trim() })
        : EmojiSchema.options[1].safeParse({
            id: draft.id.trim(),
            name: draft.name.trim(),
            animated: draft.animated,
            fallback: draft.fallback.trim(),
          });
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map(
          (issue) =>
            `${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
        ),
      );
      return;
    }
    onChange(parsed.data);
    setIssues([]);
    setSaved(true);
  }
  return (
    <fieldset className="stack">
      <legend>{label} emoji</legend>
      <Field label={`${label} emoji type`} htmlFor={`${id}-type`}>
        <select
          id={`${id}-type`}
          value={draft.mode}
          onChange={(e) => {
            const mode = e.target.value;
            if (mode === 'none' || mode === 'unicode' || mode === 'custom') {
              edit({ mode });
              setIssues([]);
            }
          }}
        >
          <option value="none">No emoji</option>
          <option value="unicode">Unicode emoji</option>
          <option value="custom">Custom Discord emoji</option>
        </select>
      </Field>
      {draft.mode === 'unicode' && (
        <Field
          label={`${label} Unicode emoji`}
          htmlFor={`${id}-unicode`}
          hint="Paste an emoji character rather than an icon name."
        >
          <Input
            id={`${id}-unicode`}
            maxLength={16}
            value={draft.unicode}
            onChange={(e) => edit({ unicode: e.target.value })}
          />
        </Field>
      )}
      {draft.mode === 'custom' && (
        <>
          {resources.emojis && (
            <Field
              label={`${label} server emoji`}
              htmlFor={`${id}-server`}
              hint="Choose a real emoji from this server or enter its Discord ID below."
            >
              <select
                id={`${id}-server`}
                value={
                  resources.emojis.some((item) => item.id === draft.id)
                    ? draft.id
                    : ''
                }
                onChange={(e) => {
                  const selected = resources.emojis?.find(
                    (item) => item.id === e.target.value,
                  );
                  if (selected)
                    edit({
                      id: selected.id,
                      name: selected.name,
                      animated: selected.animated,
                    });
                }}
              >
                <option value="">Choose a server emoji</option>
                {resources.emojis.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.animated ? ' (animated)' : ''}
                    {item.available === false ? ' (unavailable)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label={`${label} custom emoji ID`}
            htmlFor={`${id}-custom-id`}
            hint="Copy the emoji ID from Discord. Availability is checked when publishing."
          >
            <Input
              id={`${id}-custom-id`}
              inputMode="numeric"
              maxLength={20}
              value={draft.id}
              onChange={(e) => edit({ id: e.target.value })}
            />
          </Field>
          <Field
            label={`${label} custom emoji name`}
            htmlFor={`${id}-custom-name`}
          >
            <Input
              id={`${id}-custom-name`}
              maxLength={32}
              value={draft.name}
              onChange={(e) => edit({ name: e.target.value })}
            />
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.animated}
              onChange={(e) => edit({ animated: e.target.checked })}
            />
            {label} custom emoji is animated
          </label>
          <Field
            label={`${label} Unicode fallback`}
            htmlFor={`${id}-fallback`}
            hint="Required. This Unicode emoji is used if the custom emoji becomes unavailable."
          >
            <Input
              id={`${id}-fallback`}
              required
              maxLength={16}
              value={draft.fallback}
              onChange={(e) => edit({ fallback: e.target.value })}
            />
          </Field>
        </>
      )}
      {issues.length > 0 && <p role="alert">{issues.join(' ')}</p>}
      {saved && <p role="status">Emoji applied to this design.</p>}
      <Button variant="secondary" onClick={apply}>
        Apply {label.toLowerCase()} emoji
      </Button>
    </fieldset>
  );
}
const actionLabels: Record<MessageAction['type'], string> = {
  'response.private': 'Reply privately',
  'response.channel': 'Reply in a channel',
  'ticket.create': 'Open a support ticket',
  'role.add': 'Add a role',
  'role.remove': 'Remove a role',
  'role.toggle': 'Toggle a role',
  'role.menu': 'Select from a saved role menu',
  'form.open': 'Open an application form',
  'vote.cast': 'Vote in a poll',
  'crate.claim': 'Claim an XP crate',
  'giveaway.enter': 'Enter a giveaway',
  'workflow.run': 'Run a saved workflow',
};
const referenceFields: Record<string, string> = {
  'ticket.create': 'categoryId',
  'role.menu': 'menuId',
  'form.open': 'formVersionId',
  'vote.cast': 'pollId',
  'crate.claim': 'crateId',
  'giveaway.enter': 'giveawayId',
  'workflow.run': 'workflowVersionId',
};
function ActionEditor({
  action,
  onChange,
  resources,
  id,
}: {
  action: MessageAction;
  onChange: (next: MessageAction) => void;
  resources: ControlEditorResources;
  id: string;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...action });
  const [issues, setIssues] = useState<string[]>([]);
  useEffect(() => setDraft({ ...action }), [action]);
  const type = String(draft['type']);
  const field = (
    name: string,
    label: string,
    kind: 'text' | 'role' | 'channel' = 'text',
  ) => (
    <Field label={label} htmlFor={`${id}-${name}`} key={name}>
      {kind === 'text' ? (
        <Input
          id={`${id}-${name}`}
          value={String(draft[name] ?? '')}
          onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
        />
      ) : (
        <select
          id={`${id}-${name}`}
          value={String(draft[name] ?? '')}
          onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
        >
          <option value="">Choose a {kind}</option>
          {(kind === 'role' ? resources.roles : resources.channels).map(
            (item) => (
              <option key={item.id} value={item.id}>
                {kind === 'channel' ? '# ' : ''}
                {item.name}
              </option>
            ),
          )}
        </select>
      )}
    </Field>
  );
  return (
    <div className="stack">
      <Field label="When a member uses this control" htmlFor={`${id}-action`}>
        <select
          id={`${id}-action`}
          value={type}
          onChange={(e) => {
            setDraft({ type: e.target.value });
            setIssues([]);
          }}
        >
          {Object.entries(actionLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {type.startsWith('response.') && (
        <Field label="Response text" htmlFor={`${id}-text`}>
          <textarea
            id={`${id}-text`}
            value={String(draft['text'] ?? '')}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
        </Field>
      )}
      {type === 'response.channel' &&
        field('channelId', 'Response channel', 'channel')}
      {['role.add', 'role.remove', 'role.toggle'].includes(type) &&
        field('roleId', 'Member role', 'role')}
      {referenceFields[type] &&
        field(
          referenceFields[type],
          type === 'ticket.create'
            ? 'Saved ticket topic identifier'
            : 'Saved ' +
                (actionLabels[type as MessageAction['type']] ?? 'resource') +
                ' identifier',
        )}
      <p className="field-hint">
        The destination and member’s current access are checked again when this
        published control is used. Saved resource identifiers must belong to
        this server.
      </p>
      {issues.length > 0 && <p role="alert">{issues.join(' ')}</p>}
      <Button
        variant="secondary"
        onClick={() => {
          const parsed = ActionSchema.safeParse(draft);
          if (parsed.success) {
            onChange(parsed.data);
            setIssues([]);
          } else setIssues(parsed.error.issues.map((issue) => issue.message));
        }}
      >
        Apply control action
      </Button>
    </div>
  );
}
export function ControlEditor({
  row,
  onChange,
  resources,
  singleButton = false,
}: {
  row: Row;
  onChange: (next: Row) => void;
  resources: ControlEditorResources;
  singleButton?: boolean;
}) {
  const prefix = useId();
  const changeControls = (controls: Row['controls'][number][]) => {
    const parsed = ControlRowSchema.safeParse({ ...row, controls });
    if (parsed.success) onChange(parsed.data);
  };
  const update = (index: number, control: Row['controls'][number]) =>
    changeControls(
      row.controls.map((current, position) =>
        position === index ? control : current,
      ),
    );
  return (
    <div className="stack">
      {row.controls.map((control, index) => (
        <fieldset className="stack" key={control.key}>
          <legend>
            {control.type === 'button' ? 'Button' : 'Select menu'} {index + 1}
          </legend>
          <Field
            label="Control identifier"
            htmlFor={`${prefix}-control-key-${index}`}
            hint="Unique within this design; saved controls use an opaque server-issued identity."
          >
            <Input
              id={`${prefix}-control-key-${index}`}
              value={control.key}
              onChange={(e) =>
                update(index, { ...control, key: e.target.value })
              }
            />
          </Field>
          {control.type === 'button' ? (
            <>
              <Field
                label="Button label"
                htmlFor={`${prefix}-control-label-${index}`}
              >
                <Input
                  id={`${prefix}-control-label-${index}`}
                  maxLength={80}
                  value={control.label}
                  onChange={(e) =>
                    update(index, { ...control, label: e.target.value })
                  }
                />
              </Field>
              <EmojiEditor
                id={`${prefix}-button-emoji-${index}`}
                label={`Button ${index + 1}`}
                emoji={control.emoji}
                resources={resources}
                onChange={(emoji) => {
                  const next = { ...control };
                  if (emoji) next.emoji = emoji;
                  else delete next.emoji;
                  update(index, next);
                }}
              />
              <Field
                label="Button style"
                htmlFor={`${prefix}-control-style-${index}`}
              >
                <select
                  id={`${prefix}-control-style-${index}`}
                  value={control.style}
                  onChange={(e) => {
                    const style = e.target.value;
                    if (style === 'link')
                      update(index, {
                        type: 'button',
                        key: control.key,
                        label: control.label,
                        ...(control.emoji ? { emoji: control.emoji } : {}),
                        ...(control.disabled === undefined
                          ? {}
                          : { disabled: control.disabled }),
                        style: 'link',
                        url: 'https://panel.coin-sprite.com/dashboard',
                      });
                    else if (
                      style === 'primary' ||
                      style === 'secondary' ||
                      style === 'success' ||
                      style === 'danger'
                    )
                      update(index, {
                        type: 'button',
                        key: control.key,
                        label: control.label,
                        ...(control.emoji ? { emoji: control.emoji } : {}),
                        ...(control.disabled === undefined
                          ? {}
                          : { disabled: control.disabled }),
                        style,
                        action:
                          control.style === 'link'
                            ? {
                                type: 'response.private',
                                text: 'Your action is saved.',
                              }
                            : control.action,
                      });
                  }}
                >
                  {['primary', 'secondary', 'success', 'danger', 'link'].map(
                    (style) => (
                      <option key={style}>{style}</option>
                    ),
                  )}
                </select>
              </Field>
              {control.style === 'link' ? (
                <Field
                  label="Destination URL"
                  htmlFor={`${prefix}-control-url-${index}`}
                >
                  <Input
                    id={`${prefix}-control-url-${index}`}
                    value={control.url}
                    onChange={(e) =>
                      update(index, { ...control, url: e.target.value })
                    }
                  />
                </Field>
              ) : (
                <ActionEditor
                  id={`${prefix}-control-${index}`}
                  action={control.action}
                  resources={resources}
                  onChange={(action) => update(index, { ...control, action })}
                />
              )}
            </>
          ) : (
            <>
              <Field
                label="Select placeholder"
                htmlFor={`${prefix}-select-placeholder-${index}`}
              >
                <Input
                  id={`${prefix}-select-placeholder-${index}`}
                  value={control.placeholder ?? ''}
                  onChange={(e) =>
                    update(index, { ...control, placeholder: e.target.value })
                  }
                />
              </Field>
              <div className="form-grid">
                {(['minValues', 'maxValues'] as const).map((name) => (
                  <Field
                    label={
                      name === 'minValues'
                        ? 'Minimum selections'
                        : 'Maximum selections'
                    }
                    htmlFor={`${prefix}-select-${name}-${index}`}
                    key={name}
                  >
                    <Input
                      id={`${prefix}-select-${name}-${index}`}
                      type="number"
                      min={0}
                      max={25}
                      value={control[name]}
                      onChange={(e) =>
                        update(index, {
                          ...control,
                          [name]: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              {control.options.map((option, position) => (
                <div className="card stack" key={position}>
                  <Field
                    label="Option label"
                    htmlFor={`${prefix}-option-label-${index}-${position}`}
                  >
                    <Input
                      id={`${prefix}-option-label-${index}-${position}`}
                      value={option.label}
                      onChange={(e) =>
                        update(index, {
                          ...control,
                          options: control.options.map((item, i) =>
                            i === position
                              ? { ...item, label: e.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Option value"
                    htmlFor={`${prefix}-option-value-${index}-${position}`}
                    hint="Use a role ID for a role menu or the zero-based choice number for a poll."
                  >
                    <Input
                      id={`${prefix}-option-value-${index}-${position}`}
                      value={option.value}
                      onChange={(e) =>
                        update(index, {
                          ...control,
                          options: control.options.map((item, i) =>
                            i === position
                              ? { ...item, value: e.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </Field>
                  <EmojiEditor
                    id={`${prefix}-option-emoji-${index}-${position}`}
                    label={`Option ${position + 1}`}
                    emoji={option.emoji}
                    resources={resources}
                    onChange={(emoji) => {
                      const next = { ...option };
                      if (emoji) next.emoji = emoji;
                      else delete next.emoji;
                      update(index, {
                        ...control,
                        options: control.options.map((item, i) =>
                          i === position ? next : item,
                        ),
                      });
                    }}
                  />
                  <Button
                    variant="secondary"
                    disabled={control.options.length <= 1}
                    onClick={() =>
                      update(index, {
                        ...control,
                        options: control.options.filter(
                          (_, i) => i !== position,
                        ),
                      })
                    }
                  >
                    Remove option
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                disabled={control.options.length >= 25}
                onClick={() =>
                  update(index, {
                    ...control,
                    options: [
                      ...control.options,
                      {
                        label: 'New choice',
                        value: String(control.options.length),
                      },
                    ],
                  })
                }
              >
                Add select option
              </Button>
              <ActionEditor
                id={`${prefix}-control-${index}`}
                action={control.action}
                resources={resources}
                onChange={(action) => update(index, { ...control, action })}
              />
            </>
          )}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={control.disabled ?? false}
              onChange={(e) =>
                update(index, { ...control, disabled: e.target.checked })
              }
            />
            Disable this control
          </label>
          {!singleButton && (
            <Button
              variant="secondary"
              disabled={row.controls.length <= 1}
              onClick={() =>
                changeControls(
                  row.controls.filter((_, position) => position !== index),
                )
              }
            >
              Remove control
            </Button>
          )}
        </fieldset>
      ))}
      {!singleButton && (
        <div className="row">
          <Button
            variant="secondary"
            disabled={
              row.controls.length >= 5 ||
              row.controls.some((control) => control.type === 'select')
            }
            onClick={() =>
              changeControls([
                ...row.controls,
                {
                  type: 'button',
                  key: 'button-' + crypto.randomUUID().slice(0, 8),
                  label: 'New button',
                  style: 'secondary',
                  action: {
                    type: 'response.private',
                    text: 'Your action is saved.',
                  },
                },
              ])
            }
          >
            Add button
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              changeControls([
                {
                  type: 'select',
                  key: 'select-' + crypto.randomUUID().slice(0, 8),
                  placeholder: 'Choose an option',
                  minValues: 1,
                  maxValues: 1,
                  action: {
                    type: 'response.private',
                    text: 'Your choice is saved.',
                  },
                  options: [{ label: 'First choice', value: '0' }],
                },
              ])
            }
          >
            {row.controls.length
              ? 'Use a select menu instead'
              : 'Add select menu'}
          </Button>
        </div>
      )}
    </div>
  );
}
