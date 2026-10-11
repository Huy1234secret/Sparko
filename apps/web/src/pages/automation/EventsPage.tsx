import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarDays } from 'lucide-react';
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
import {
  ChannelField,
  NumberField,
  RoleChecklist,
} from '../../features/config/fields';
import { TimeZoneField, WhenField } from '../../features/automation/fields';
import {
  AutomationSettings,
  OffNotice,
  StateBadge,
} from '../../features/automation/shared';
import {
  browserTimeZone,
  formatInZone,
  utcToZonedInput,
  zonedToUtc,
} from '../../features/automation/time';
import {
  cancelEvent,
  createEvent,
  getEvents,
  updateEvent,
  type EventRecord,
} from '../../services/automation';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

const EventForm = z
  .object({
    title: z.string().trim().min(1, 'Name the event.').max(200),
    description: z.string().max(4000),
    timezone: z.string().min(1),
    startsLocal: z.string().min(1, 'Choose when it starts.'),
    endsLocal: z.string().min(1, 'Choose when it ends.'),
    capacity: z.number().int().min(1, 'At least one place.').max(10000),
    remindBeforeMinutes: z.number().int().min(0).max(10080),
    channelId: z.string().optional(),
    requiredRoleIds: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const starts = zonedToUtc(v.startsLocal, v.timezone);
    const ends = zonedToUtc(v.endsLocal, v.timezone);
    if (starts && starts.getTime() <= Date.now())
      ctx.addIssue({
        code: 'custom',
        path: ['startsLocal'],
        message: 'Choose a start in the future.',
      });
    if (starts && ends && ends <= starts)
      ctx.addIssue({
        code: 'custom',
        path: ['endsLocal'],
        message: 'The end must be after the start.',
      });
  });
type EventInput = z.input<typeof EventForm>;
type EventOutput = z.output<typeof EventForm>;

function toBody(values: EventOutput) {
  const { startsLocal, endsLocal, channelId, ...rest } = values;
  return {
    ...rest,
    startsAt: zonedToUtc(startsLocal, values.timezone)!.toISOString(),
    endsAt: zonedToUtc(endsLocal, values.timezone)!.toISOString(),
    ...(channelId ? { channelId } : {}),
  };
}
function toForm(event?: EventRecord): EventInput {
  const timezone = event?.data.timezone ?? browserTimeZone();
  return {
    title: event?.data.title ?? '',
    description: event?.data.description ?? '',
    timezone,
    startsLocal: event ? utcToZonedInput(event.data.startsAt, timezone) : '',
    endsLocal: event ? utcToZonedInput(event.data.endsAt, timezone) : '',
    capacity: event?.data.capacity ?? 20,
    remindBeforeMinutes: event?.data.remindBeforeMinutes ?? 30,
    ...(event?.data.channelId ? { channelId: event.data.channelId } : {}),
    requiredRoleIds: event?.data.requiredRoleIds ?? [],
  };
}

function EventEditor({
  guildId,
  event,
  onDone,
}: {
  guildId: string;
  event?: EventRecord;
  onDone: () => void;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const form = useForm<EventInput, unknown, EventOutput>({
    resolver: zodResolver(EventForm),
    defaultValues: toForm(event),
  });
  const save = useMutation({
    mutationFn: (values: EventOutput) => {
      const body = toBody(values);
      return event
        ? updateEvent(
            guildId,
            event.id,
            { event: body, expectedRevision: event.revision },
            identity('event-edit', { id: event.id, body }),
          )
        : createEvent(guildId, body, identity('event', body));
    },
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', guildId] });
      onDone();
    },
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Card>
        <h2>{event ? `Edit ${event.data.title}` : 'Event details'}</h2>
        <Field
          label="Title"
          htmlFor="event-title"
          required
          error={form.formState.errors.title?.message}
        >
          <Input id="event-title" {...form.register('title')} />
        </Field>
        <Field label="Description" htmlFor="event-description">
          <textarea
            id="event-description"
            maxLength={4000}
            {...form.register('description')}
          />
        </Field>
      </Card>
      <Card>
        <h2>When</h2>
        <div className="form-grid">
          <TimeZoneField
            form={form}
            name="timezone"
            label="Time zone"
            hint="Start and end are in this zone. Members see times in their own."
          />
          <WhenField form={form} name="startsLocal" label="Starts" />
          <WhenField form={form} name="endsLocal" label="Ends" />
          <NumberField
            form={form}
            name="remindBeforeMinutes"
            label="Remind people going"
            unit="minutes before"
            hint="Sent by direct message. 0 sends no reminder."
            min={0}
            max={10080}
          />
        </div>
      </Card>
      <Card>
        <h2>Places and who can join</h2>
        <NumberField
          form={form}
          name="capacity"
          label="Places"
          hint="When full, new RSVPs join a waitlist. If someone drops out, the earliest waiting member gets the place and a direct message."
          min={1}
          max={10000}
        />
        <RoleChecklist
          form={form}
          name="requiredRoleIds"
          label="Only members with all of these roles can RSVP"
          hint="Checked when they RSVP. Leave empty for everyone."
          guildId={guildId}
        />
        {!event && (
          <ChannelField
            form={form}
            name="channelId"
            label="Announce in"
            hint="Optional. Members RSVP from their member profile."
            placeholder="Don’t announce in Discord"
            guildId={guildId}
          />
        )}
      </Card>
      {save.error && <ErrorState message={errorMessage(save.error)} />}
      <div className="save-bar">
        {event ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel editing
          </Button>
        ) : (
          <span>Reminders, start and end run on their own.</span>
        )}
        <Button type="submit" busy={save.isPending}>
          {event ? 'Save changes' : 'Create event'}
        </Button>
      </div>
    </form>
  );
}

function CancelEvent({
  guildId,
  event,
}: {
  guildId: string;
  event: EventRecord;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => {
      const body = { expectedRevision: event.revision, reason: reason.trim() };
      return cancelEvent(
        guildId,
        event.id,
        body,
        identity('event-cancel', body),
      );
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['events', guildId] }),
  });
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length >= 3) cancel.mutate();
      }}
    >
      <Field
        label="Reason for cancelling"
        htmlFor={`cancel-${event.id}`}
        hint="Everyone going or waiting gets this by direct message."
      >
        <Input
          id={`cancel-${event.id}`}
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="row">
        <Button
          type="submit"
          variant="danger"
          disabled={reason.trim().length < 3}
          busy={cancel.isPending}
        >
          Cancel event
        </Button>
      </div>
      {cancel.error && <ErrorState message={errorMessage(cancel.error)} />}
    </form>
  );
}

function EventList({ guildId }: { guildId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const events = useQuery({
    queryKey: ['events', guildId],
    queryFn: ({ signal }) => getEvents(guildId, signal),
    refetchInterval: 15000,
  });
  if (events.isPending) return <LoadingState />;
  if (events.error)
    return (
      <ErrorState
        message={errorMessage(events.error)}
        retry={() => void events.refetch()}
      />
    );
  if (!events.data.length)
    return (
      <EmptyState
        icon={CalendarDays}
        title="No events yet"
        description="Plan one from the New event tab."
      />
    );
  return (
    <div className="stack">
      {events.data.map((event) =>
        editing === event.id ? (
          <EventEditor
            key={event.id}
            guildId={guildId}
            event={event}
            onDone={() => setEditing(null)}
          />
        ) : (
          <Card key={event.id}>
            <div className="section-heading">
              <div>
                <h2 className="wrap-anywhere">{event.data.title}</h2>
                <p className="muted">
                  {formatInZone(event.data.startsAt, event.data.timezone)}
                </p>
              </div>
              <StateBadge state={event.state} />
            </div>
            <div className="metric-row">
              <span>
                <strong>
                  {event.attending} / {event.data.capacity}
                </strong>{' '}
                going
              </span>
              <span>
                <strong>{event.waiting}</strong> waiting
              </span>
            </div>
            {event.data.cancelReason && (
              <p className="muted">Cancelled: {event.data.cancelReason}</p>
            )}
            {event.state === 'scheduled' && (
              <>
                <div className="row">
                  <Button
                    variant="secondary"
                    onClick={() => setEditing(event.id)}
                  >
                    Edit event
                  </Button>
                </div>
                <CancelEvent guildId={guildId} event={event} />
              </>
            )}
          </Card>
        ),
      )}
    </div>
  );
}

export function EventsPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Events"
        description="Plan events in any time zone, cap places with a fair waitlist, and remind people going."
      />
      <OffNotice guildId={guildId} featureId="R37" noun="Events" />
      <Tabs
        tabs={[
          {
            id: 'events',
            label: 'Events',
            content: <EventList guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New event',
            content: (
              <EventEditor
                guildId={guildId}
                onDone={() => setParams({ tab: 'events' }, { replace: true })}
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R37"
                title="Events"
                description="Members RSVP from their member profile; places are given in the order people ask."
                enableLabel="Allow events"
              />
            ),
          },
        ]}
      />
    </>
  );
}
