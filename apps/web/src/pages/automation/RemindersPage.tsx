import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlarmClock } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import { ChannelField, NumberField } from '../../features/config/fields';
import {
  MisfireField,
  RepeatField,
  TimeZoneField,
  WhenField,
} from '../../features/automation/fields';
import {
  AutomationSettings,
  ChannelName,
  OffNotice,
  StateBadge,
} from '../../features/automation/shared';
import {
  browserTimeZone,
  formatInZone,
  recurrenceFrom,
  recurrenceLabel,
  zonedToUtc,
} from '../../features/automation/time';
import {
  cancelReminder,
  createReminder,
  getReminders,
  type ReminderRecord,
} from '../../services/automation';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

const ReminderForm = z
  .object({
    text: z.string().trim().min(1, 'Write what to remind about.').max(2000),
    destination: z.enum(['dm', 'channel']),
    channelId: z.string().optional(),
    timezone: z.string().min(1),
    whenLocal: z.string().min(1, 'Choose when.'),
    repeat: z.enum(['once', 'daily', 'weekly']),
    misfire: z.enum(['skip', 'send_once']),
  })
  .superRefine((v, ctx) => {
    const when = zonedToUtc(v.whenLocal, v.timezone);
    if (when && when.getTime() <= Date.now())
      ctx.addIssue({
        code: 'custom',
        path: ['whenLocal'],
        message: 'Choose a time in the future.',
      });
    if (v.destination === 'channel' && !v.channelId)
      ctx.addIssue({
        code: 'custom',
        path: ['channelId'],
        message: 'Choose a channel.',
      });
  });
type ReminderInput = z.input<typeof ReminderForm>;

/** Members can only remind themselves; managers may also post to a channel. */
export function NewReminder({
  guildId,
  allowChannel,
  onCreated,
}: {
  guildId: string;
  allowChannel: boolean;
  onCreated?: () => void;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const form = useForm<ReminderInput, unknown, z.output<typeof ReminderForm>>({
    resolver: zodResolver(ReminderForm),
    defaultValues: {
      text: '',
      destination: 'dm',
      timezone: browserTimeZone(),
      whenLocal: '',
      repeat: 'once',
      misfire: 'send_once',
    },
  });
  const destination = useWatch({ control: form.control, name: 'destination' });
  const create = useMutation({
    mutationFn: (values: z.output<typeof ReminderForm>) => {
      const body = {
        text: values.text.trim(),
        destination:
          values.destination === 'channel'
            ? { type: 'channel' as const, channelId: values.channelId! }
            : { type: 'dm' as const },
        timezone: values.timezone,
        dueAt: zonedToUtc(values.whenLocal, values.timezone)!.toISOString(),
        recurrence: recurrenceFrom(values.repeat, values.whenLocal),
        misfire: values.misfire,
      };
      return createReminder(guildId, body, identity('reminder', body));
    },
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: () => {
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['reminders', guildId] });
      onCreated?.();
    },
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <Field
        label="Remind about"
        htmlFor="reminder-text"
        required
        error={form.formState.errors.text?.message}
      >
        <textarea
          id="reminder-text"
          maxLength={2000}
          {...form.register('text')}
        />
      </Field>
      {allowChannel && (
        <fieldset className="stack">
          <legend>Send to</legend>
          <label className="checkbox-row">
            <input type="radio" value="dm" {...form.register('destination')} />
            <span>Me, by direct message</span>
          </label>
          <label className="checkbox-row">
            <input
              type="radio"
              value="channel"
              {...form.register('destination')}
            />
            <span>A server channel</span>
          </label>
          {destination === 'channel' && (
            <ChannelField
              form={form}
              name="channelId"
              label="Channel"
              guildId={guildId}
            />
          )}
        </fieldset>
      )}
      <div className="form-grid">
        <TimeZoneField form={form} name="timezone" label="Time zone" />
        <WhenField form={form} name="whenLocal" label="When" />
        <RepeatField form={form} name="repeat" />
        <MisfireField form={form} name="misfire" />
      </div>
      {create.error && <ErrorState message={errorMessage(create.error)} />}
      <div className="row">
        <Button type="submit" busy={create.isPending}>
          Set reminder
        </Button>
      </div>
    </form>
  );
}

export function ReminderList({
  guildId,
  compact = false,
}: {
  guildId: string;
  compact?: boolean;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const reminders = useQuery({
    queryKey: ['reminders', guildId],
    queryFn: ({ signal }) => getReminders(guildId, signal),
  });
  const cancel = useMutation({
    mutationFn: (reminder: ReminderRecord) =>
      cancelReminder(
        guildId,
        reminder.id,
        reminder.revision,
        identity('reminder-cancel', reminder.id),
      ),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ['reminders', guildId] }),
  });
  if (reminders.isPending) return <LoadingState />;
  if (reminders.error)
    return <ErrorState message={errorMessage(reminders.error)} />;
  if (!reminders.data.length)
    return (
      <EmptyState
        compact={compact}
        icon={AlarmClock}
        title="No reminders"
        description="Reminders you set appear here until they finish."
      />
    );
  return (
    <div className="stack">
      {reminders.data.map((reminder) => (
        <div className="activity-row" key={reminder.id}>
          <span>
            <strong className="wrap-anywhere">{reminder.data.text}</strong>
            <small>
              {reminder.data.destination.channelId ? (
                <>
                  In{' '}
                  <ChannelName
                    guildId={guildId}
                    id={reminder.data.destination.channelId}
                  />
                </>
              ) : (
                'Direct message'
              )}{' '}
              · {recurrenceLabel(reminder.data.recurrence)} · next{' '}
              {formatInZone(
                reminder.data.nextAt ?? reminder.data.dueAt,
                reminder.data.timezone,
              )}
              {reminder.data.lastMisfire === 'skipped' &&
                ' · last one skipped (Sparko was offline)'}
            </small>
          </span>
          <span className="row">
            <StateBadge state={reminder.state} />
            {reminder.state === 'active' && (
              <Button
                variant="ghost"
                busy={cancel.isPending && cancel.variables?.id === reminder.id}
                onClick={() => cancel.mutate(reminder)}
              >
                Cancel
              </Button>
            )}
          </span>
        </div>
      ))}
      {cancel.error && <ErrorState message={errorMessage(cancel.error)} />}
    </div>
  );
}

export function RemindersPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Automations"
        title="Reminders"
        description="Send yourself or a channel a reminder once, every day or every week."
      />
      <OffNotice guildId={guildId} featureId="R66" noun="Reminders" />
      <Tabs
        tabs={[
          {
            id: 'reminders',
            label: 'Your reminders',
            content: (
              <Card>
                <ReminderList guildId={guildId} />
              </Card>
            ),
          },
          {
            id: 'new',
            label: 'New reminder',
            content: (
              <Card>
                <NewReminder
                  guildId={guildId}
                  allowChannel
                  onCreated={() =>
                    setParams({ tab: 'reminders' }, { replace: true })
                  }
                />
              </Card>
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R66"
                title="Reminders"
                description="Members set personal reminders from their member profile. Channel reminders need automation access."
                enableLabel="Allow reminders"
              >
                {(form) => (
                  <Card>
                    <NumberField
                      form={form}
                      name="maximumActive"
                      label="Active reminders per member"
                      min={1}
                      max={50}
                    />
                  </Card>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}
