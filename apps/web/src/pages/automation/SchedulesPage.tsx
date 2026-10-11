import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarClock } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import { ChannelField } from '../../features/config/fields';
import {
  MisfireField,
  RepeatField,
  TemplateVersionField,
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
  cancelSchedule,
  createSchedule,
  getSchedules,
  type ScheduleRecord,
} from '../../services/automation';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

const ScheduleForm = z
  .object({
    name: z.string().trim().min(1, 'Name this schedule.').max(100),
    channelId: z.string().regex(/^\d{17,20}$/, 'Choose a channel.'),
    templateVersionId: z.string().min(1, 'Choose a design.'),
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
  });
type ScheduleInput = z.input<typeof ScheduleForm>;

function NewSchedule({
  guildId,
  onCreated,
}: {
  guildId: string;
  onCreated: () => void;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const form = useForm<ScheduleInput, unknown, z.output<typeof ScheduleForm>>({
    resolver: zodResolver(ScheduleForm),
    defaultValues: {
      name: '',
      channelId: '',
      templateVersionId: '',
      timezone: browserTimeZone(),
      whenLocal: '',
      repeat: 'once',
      misfire: 'skip',
    },
  });
  const create = useMutation({
    mutationFn: (values: z.output<typeof ScheduleForm>) => {
      const body = {
        name: values.name.trim(),
        channelId: values.channelId,
        templateVersionId: values.templateVersionId,
        timezone: values.timezone,
        dueAt: zonedToUtc(values.whenLocal, values.timezone)!.toISOString(),
        recurrence: recurrenceFrom(values.repeat, values.whenLocal),
        misfire: values.misfire,
      };
      return createSchedule(guildId, body, identity('schedule', body));
    },
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: () => {
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['schedules', guildId] });
      onCreated();
    },
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <Card>
        <h2>Message</h2>
        <Field
          label="Name"
          htmlFor="schedule-name"
          hint="Only staff see this."
          required
          error={form.formState.errors.name?.message}
        >
          <Input id="schedule-name" {...form.register('name')} />
        </Field>
        <ChannelField
          form={form}
          name="channelId"
          label="Post in"
          guildId={guildId}
        />
        <TemplateVersionField
          form={form}
          name="templateVersionId"
          label="Design"
          guildId={guildId}
        />
      </Card>
      <Card>
        <h2>When</h2>
        <div className="form-grid">
          <TimeZoneField form={form} name="timezone" label="Time zone" />
          <WhenField form={form} name="whenLocal" label="First post" />
          <RepeatField form={form} name="repeat" />
          <MisfireField form={form} name="misfire" />
        </div>
      </Card>
      {create.error && <ErrorState message={errorMessage(create.error)} />}
      <div className="save-bar">
        <span>Each post is sent once, even if Sparko restarts.</span>
        <Button type="submit" busy={create.isPending}>
          Schedule message
        </Button>
      </div>
    </form>
  );
}

function ScheduleList({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const schedules = useQuery({
    queryKey: ['schedules', guildId],
    queryFn: ({ signal }) => getSchedules(guildId, signal),
  });
  const cancel = useMutation({
    mutationFn: (row: ScheduleRecord) =>
      cancelSchedule(
        guildId,
        row.id,
        row.revision,
        identity('schedule-cancel', row.id),
      ),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ['schedules', guildId] }),
  });
  if (schedules.isPending) return <LoadingState />;
  if (schedules.error)
    return (
      <ErrorState
        message={errorMessage(schedules.error)}
        retry={() => void schedules.refetch()}
      />
    );
  if (!schedules.data.length)
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing scheduled"
        description="Schedule a Message Studio design from the New schedule tab."
      />
    );
  return (
    <Card>
      {schedules.data.map((row) => (
        <div className="activity-row" key={row.id}>
          <span>
            <strong className="wrap-anywhere">{row.data.name}</strong>
            <small>
              {row.data.document?.name ?? 'Message'} in{' '}
              <ChannelName guildId={guildId} id={row.data.channelId} /> ·{' '}
              {recurrenceLabel(row.data.recurrence)}
              {row.state === 'active' &&
                ` · next ${formatInZone(row.data.nextAt ?? row.data.dueAt, row.data.timezone)}`}
              {row.data.lastMisfire === 'skipped' &&
                ' · last post skipped (Sparko was offline)'}
            </small>
          </span>
          <span className="row">
            <StateBadge state={row.state} />
            {row.state === 'active' && (
              <Button
                variant="ghost"
                busy={cancel.isPending && cancel.variables?.id === row.id}
                onClick={() => cancel.mutate(row)}
              >
                Cancel
              </Button>
            )}
          </span>
        </div>
      ))}
      {cancel.error && <ErrorState message={errorMessage(cancel.error)} />}
    </Card>
  );
}

export function SchedulesPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Automations"
        title="Scheduled messages"
        description="Post a Message Studio design once or on a repeating local-time schedule."
      />
      <OffNotice guildId={guildId} featureId="R42" noun="Scheduled messages" />
      <Tabs
        tabs={[
          {
            id: 'schedules',
            label: 'Schedules',
            content: <ScheduleList guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New schedule',
            content: (
              <NewSchedule
                guildId={guildId}
                onCreated={() =>
                  setParams({ tab: 'schedules' }, { replace: true })
                }
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R42"
                title="Scheduled messages"
                description="Only public designs can be scheduled. Cancelling stops future posts; posts already sent stay."
                enableLabel="Send scheduled messages"
              />
            ),
          },
        ]}
      />
    </>
  );
}
