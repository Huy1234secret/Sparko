import { useQuery } from '@tanstack/react-query';
import {
  Controller,
  get,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { MessageDocumentSchema, type MessageDocument } from '@sparko/messages';
import { Field, Input } from '@sparko/ui';
import { getChannels, getRoles } from '../../services/guilds';
import { getTemplates } from '../../services/messages';
import { MessagePreview } from '../../components/MessagePreview';

type FormProps<T extends FieldValues> = {
  form: UseFormReturn<T, unknown, FieldValues>;
  name: Path<T>;
  label: string;
  hint?: string;
};
export function fieldError(form: UseFormReturn<FieldValues>, name: string) {
  return (get(form.formState.errors, name) as { message?: string } | undefined)
    ?.message;
}
const fieldId = (name: string) => 'cfg-' + name.replace(/\W+/g, '-');

export function useChannels(guildId: string) {
  return useQuery({
    queryKey: ['channels', guildId],
    queryFn: ({ signal }) => getChannels(guildId, signal),
  });
}
export function useRoles(guildId: string) {
  return useQuery({
    queryKey: ['roles', guildId],
    queryFn: ({ signal }) => getRoles(guildId, signal),
  });
}

/** Text/announcement channels by default; pass `types` for categories or voice. */
export function ChannelField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  guildId,
  types = [0, 5],
  placeholder = 'Choose a channel',
}: FormProps<T> & { guildId: string; types?: number[]; placeholder?: string }) {
  const channels = useChannels(guildId);
  const id = fieldId(name);
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={fieldError(form as never, name)}
    >
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <select
            id={id}
            value={(field.value as string | undefined) ?? ''}
            onChange={(event) =>
              field.onChange(event.target.value || undefined)
            }
            onBlur={field.onBlur}
            ref={field.ref}
            disabled={channels.isPending}
          >
            <option value="">
              {channels.isPending ? 'Loading channels…' : placeholder}
            </option>
            {channels.data
              ?.filter((channel) => types.includes(channel.type))
              .map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.type === 4 ? '' : '# '}
                  {channel.name}
                </option>
              ))}
          </select>
        )}
      />
    </Field>
  );
}

function IdChecklist<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  items,
  pending,
  empty,
}: FormProps<T> & {
  items: { id: string; name: string }[];
  pending: boolean;
  empty: string;
}) {
  const error = fieldError(form as never, name);
  return (
    <fieldset
      className="stack"
      aria-describedby={hint ? fieldId(name) + '-hint' : undefined}
    >
      <legend>{label}</legend>
      {hint && (
        <p className="field-hint" id={fieldId(name) + '-hint'}>
          {hint}
        </p>
      )}
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => {
          const value = (field.value as string[] | undefined) ?? [];
          return (
            <div className="role-list">
              {pending ? (
                <p className="muted">Loading…</p>
              ) : items.length ? (
                items.map((item) => (
                  <label className="checkbox-row" key={item.id}>
                    <input
                      type="checkbox"
                      checked={value.includes(item.id)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked
                            ? [...value, item.id]
                            : value.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span>{item.name}</span>
                  </label>
                ))
              ) : (
                <p className="muted">{empty}</p>
              )}
            </div>
          );
        }}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
export function RoleChecklist<T extends FieldValues>({
  assigns = false,
  ...props
}: FormProps<T> & {
  guildId: string;
  /** Sparko will grant these roles, so hierarchy matters. */
  assigns?: boolean;
}) {
  const roles = useRoles(props.guildId);
  return (
    <IdChecklist
      {...props}
      pending={roles.isPending}
      empty="No assignable roles were found."
      items={(roles.data ?? [])
        .filter((role) => !role.managed && role.id !== props.guildId)
        .map((role) => ({
          id: role.id,
          name:
            assigns && role.privileged
              ? `${role.name} — has moderator permissions, cannot be assigned`
              : assigns && role.assignable === false
                ? `${role.name} — above Sparko’s role, cannot be assigned`
                : role.name,
        }))}
    />
  );
}
export function ChannelChecklist<T extends FieldValues>(
  props: FormProps<T> & { guildId: string; types?: number[] },
) {
  const channels = useChannels(props.guildId);
  const types = props.types ?? [0, 5];
  return (
    <IdChecklist
      {...props}
      pending={channels.isPending}
      empty="No matching channels were found."
      items={(channels.data ?? [])
        .filter((channel) => types.includes(channel.type))
        .map((channel) => ({ id: channel.id, name: '# ' + channel.name }))}
    />
  );
}
export function NumberField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  min,
  max,
  step,
  unit,
}: FormProps<T> & {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const id = fieldId(name);
  return (
    <Field
      label={unit ? `${label} (${unit})` : label}
      htmlFor={id}
      hint={hint}
      error={fieldError(form as never, name)}
    >
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        {...form.register(name, { valueAsNumber: true })}
      />
    </Field>
  );
}
export function SwitchField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
}: FormProps<T>) {
  return (
    <label className="switch-row">
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" {...form.register(name)} />
    </label>
  );
}
export function SelectField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  options,
}: FormProps<T> & { options: { value: string; label: string }[] }) {
  const id = fieldId(name);
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={fieldError(form as never, name)}
    >
      <select id={id} {...form.register(name)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Picks a saved design from the server's template library. The chosen
 * version's document is copied into the setting, so later template edits do
 * not silently change a configured message.
 */
export function DocumentField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  guildId,
  context,
}: FormProps<T> & {
  guildId: string;
  /** Only designs whose tokens make sense for this event are offered. */
  context?: 'member' | 'level' | 'giveaway' | undefined;
}) {
  const templates = useQuery({
    queryKey: ['templates', guildId],
    queryFn: ({ signal }) => getTemplates(guildId, signal),
  });
  const id = fieldId(name);
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => {
        const parsed = MessageDocumentSchema.safeParse(field.value);
        const current: MessageDocument | null = parsed.success
          ? parsed.data
          : null;
        return (
          <div className="stack">
            <Field
              label={label}
              htmlFor={id}
              hint={
                hint ??
                'Choose a saved design from Message Studio. Leave empty to use Sparko’s default message.'
              }
              error={fieldError(form as never, name)}
            >
              <select
                id={id}
                value=""
                onChange={(event) => {
                  if (event.target.value === '__clear')
                    return field.onChange(undefined);
                  const template = templates.data?.find(
                    (item) => item.id === event.target.value,
                  );
                  if (template?.document)
                    field.onChange(structuredClone(template.document));
                }}
                disabled={templates.isPending}
              >
                <option value="">
                  {current
                    ? `Current: ${current.name}`
                    : templates.isPending
                      ? 'Loading designs…'
                      : 'Default Sparko message'}
                </option>
                {templates.data
                  ?.filter(
                    (template) =>
                      !context ||
                      !template.document ||
                      ['generic', context].includes(
                        template.document.tokenContext,
                      ),
                  )
                  .map((template) => (
                    <option key={template.id} value={template.id}>
                      Use “{template.name}”
                    </option>
                  ))}
                {current && (
                  <option value="__clear">Use the default message</option>
                )}
              </select>
            </Field>
            {current && <MessagePreview document={current} compact />}
          </div>
        );
      }}
    />
  );
}
