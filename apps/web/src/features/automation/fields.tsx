import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Controller,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { Field, Input } from '@sparko/ui';
import { getTemplates } from '../../services/messages';
import { MessagePreview } from '../../components/MessagePreview';
import { fieldError } from '../config/fields';
import { timeZones } from './time';

type Props<T extends FieldValues> = {
  form: UseFormReturn<T, unknown, FieldValues>;
  name: Path<T>;
  label: string;
  hint?: string;
};
const id = (name: string) => 'auto-' + name.replace(/\W+/g, '-');

export function TimeZoneField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
}: Props<T>) {
  const zones = useMemo(timeZones, []);
  return (
    <Field
      label={label}
      htmlFor={id(name)}
      hint={hint}
      error={fieldError(form as never, name)}
    >
      <select id={id(name)} {...form.register(name)}>
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function WhenField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
}: Props<T>) {
  return (
    <Field
      label={label}
      htmlFor={id(name)}
      hint={hint}
      required
      error={fieldError(form as never, name)}
    >
      <Input id={id(name)} type="datetime-local" {...form.register(name)} />
    </Field>
  );
}

export function RepeatField<T extends FieldValues>({
  form,
  name,
  label = 'Repeat',
}: Omit<Props<T>, 'label'> & { label?: string }) {
  return (
    <Field
      label={label}
      htmlFor={id(name)}
      hint="Repeats keep the same local weekday and time, including across daylight-saving changes."
      error={fieldError(form as never, name)}
    >
      <select id={id(name)} {...form.register(name)}>
        <option value="once">Don’t repeat</option>
        <option value="daily">Every day</option>
        <option value="weekly">Every week</option>
      </select>
    </Field>
  );
}

export function MisfireField<T extends FieldValues>({
  form,
  name,
}: Omit<Props<T>, 'label'>) {
  return (
    <Field
      label="If Sparko was offline at the time"
      htmlFor={id(name)}
      hint="Applies when the send is more than 5 minutes late."
      error={fieldError(form as never, name)}
    >
      <select id={id(name)} {...form.register(name)}>
        <option value="send_once">Send it once when back</option>
        <option value="skip">Skip that occurrence</option>
      </select>
    </Field>
  );
}

/**
 * Picks the latest version of a public Message Studio design. The server
 * copies that version, so later edits to the design do not change it.
 */
export function TemplateVersionField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  guildId,
}: Props<T> & { guildId: string }) {
  const templates = useQuery({
    queryKey: ['templates', guildId],
    queryFn: ({ signal }) => getTemplates(guildId, signal),
  });
  const usable = (templates.data ?? []).filter(
    (template) =>
      template.latestVersionId && template.document?.visibility !== 'private',
  );
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => {
        const chosen = usable.find(
          (template) => template.latestVersionId === field.value,
        );
        return (
          <div className="stack">
            <Field
              label={label}
              htmlFor={id(name)}
              hint={
                hint ??
                'Public designs from Message Studio. The current version is copied; later edits need a new schedule.'
              }
              required
              error={fieldError(form as never, name)}
            >
              <select
                id={id(name)}
                value={(field.value as string | undefined) ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                disabled={templates.isPending}
              >
                <option value="">
                  {templates.isPending
                    ? 'Loading designs…'
                    : usable.length
                      ? 'Choose a design'
                      : 'No public designs yet'}
                </option>
                {usable.map((template) => (
                  <option key={template.id} value={template.latestVersionId}>
                    {template.name}
                  </option>
                ))}
              </select>
            </Field>
            {chosen?.document && (
              <MessagePreview document={chosen.document} compact />
            )}
          </div>
        );
      }}
    />
  );
}
