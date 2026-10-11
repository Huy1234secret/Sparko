import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlarmClock, CakeSlice, CalendarDays, Vote } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
} from '@sparko/ui';
import {
  BirthdayRecordSchema,
  deleteBirthday,
  getEvents,
  getMyBirthday,
  getPolls,
  rsvpEvent,
  saveBirthday,
  votePoll,
  type EventRecord,
  type PollRecord,
} from '../../services/automation';
import { ApiError, errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';
import { SelectField } from '../../features/config/fields';
import { TimeZoneField } from '../../features/automation/fields';
import { StateBadge } from '../../features/automation/shared';
import { browserTimeZone, formatInZone } from '../../features/automation/time';
import { PollResults } from './PollsPage';
import { NewReminder, ReminderList } from './RemindersPage';

const unavailable = (error: unknown) =>
  error instanceof ApiError &&
  ['FEATURE_DISABLED', 'NOT_FOUND'].includes(error.code);

function Ballot({ guildId, poll }: { guildId: string; poll: PollRecord }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<number[]>(poll.myVote);
  const voted = poll.myVote.length > 0;
  const locked = voted && !poll.data.allowChange;
  const single = poll.data.maxSelections === 1;
  const vote = useMutation({
    mutationFn: () =>
      votePoll(
        guildId,
        poll.id,
        picked,
        identity('vote', { id: poll.id, picked }),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['polls', guildId] }),
  });
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (picked.length) vote.mutate();
      }}
    >
      <fieldset className="stack" disabled={locked}>
        <legend className="wrap-anywhere">{poll.data.question}</legend>
        <p className="field-hint">
          {single ? 'Pick one.' : `Pick up to ${poll.data.maxSelections}.`}{' '}
          Closes {new Date(poll.data.endsAt).toLocaleString()}.
          {locked && ' Your vote is final for this poll.'}
        </p>
        {poll.data.choices.map((choice, index) => (
          <label className="checkbox-row" key={index}>
            <input
              type={single ? 'radio' : 'checkbox'}
              name={`poll-${poll.id}`}
              checked={picked.includes(index)}
              disabled={
                !single &&
                !picked.includes(index) &&
                picked.length >= poll.data.maxSelections
              }
              onChange={(event) =>
                setPicked(
                  single
                    ? [index]
                    : event.target.checked
                      ? [...picked, index]
                      : picked.filter((item) => item !== index),
                )
              }
            />
            <span>{choice}</span>
          </label>
        ))}
      </fieldset>
      {!locked && (
        <div className="row">
          <Button type="submit" disabled={!picked.length} busy={vote.isPending}>
            {voted ? 'Change vote' : 'Vote'}
          </Button>
          {vote.isSuccess && (
            <span className="save-feedback" role="status">
              Vote recorded.
            </span>
          )}
        </div>
      )}
      {vote.error && <ErrorState message={errorMessage(vote.error)} />}
      {poll.results && <PollResults poll={poll} />}
    </form>
  );
}

export function PollsCard({ guildId }: { guildId: string }) {
  const polls = useQuery({
    queryKey: ['polls', guildId],
    queryFn: ({ signal }) => getPolls(guildId, signal),
  });
  const open = polls.data?.filter((poll) => poll.state === 'open') ?? [];
  return (
    <Card>
      <h2>
        <Vote size={18} aria-hidden="true" /> Polls
      </h2>
      {polls.isPending ? (
        <LoadingState />
      ) : polls.error ? (
        <ErrorState message={errorMessage(polls.error)} />
      ) : open.length ? (
        open.map((poll) => (
          <Ballot key={poll.id} guildId={guildId} poll={poll} />
        ))
      ) : (
        <EmptyState
          compact
          icon={Vote}
          title="No open polls"
          description="Polls in this server appear here while voting is open."
        />
      )}
    </Card>
  );
}

function Rsvp({ guildId, event }: { guildId: string; event: EventRecord }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const rsvp = useMutation({
    mutationFn: (choice: 'attending' | 'declined') =>
      rsvpEvent(
        guildId,
        event.id,
        choice,
        identity('rsvp', { id: event.id, choice }),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['events', guildId] }),
  });
  const going = event.myRsvp === 'attending' || event.myRsvp === 'waitlist';
  return (
    <div className="stack event-rsvp">
      <div className="section-heading">
        <div>
          <h3 className="wrap-anywhere">{event.data.title}</h3>
          <p className="muted">
            {formatInZone(event.data.startsAt, browserTimeZone())} ·{' '}
            {Math.max(0, event.data.capacity - event.attending)} of{' '}
            {event.data.capacity} places left
          </p>
        </div>
        {event.myRsvp && <StateBadge state={event.myRsvp} />}
      </div>
      {event.data.description && (
        <p className="wrap-anywhere">{event.data.description}</p>
      )}
      <div className="row">
        {going ? (
          <Button
            variant="secondary"
            busy={rsvp.isPending}
            onClick={() => rsvp.mutate('declined')}
          >
            {event.myRsvp === 'waitlist' ? 'Leave the waitlist' : 'I can’t go'}
          </Button>
        ) : (
          <Button
            busy={rsvp.isPending}
            onClick={() => rsvp.mutate('attending')}
          >
            {event.attending >= event.data.capacity
              ? 'Join the waitlist'
              : 'I’m going'}
          </Button>
        )}
      </div>
      {rsvp.error && <ErrorState message={errorMessage(rsvp.error)} />}
    </div>
  );
}

export function EventsCard({ guildId }: { guildId: string }) {
  const events = useQuery({
    queryKey: ['events', guildId],
    queryFn: ({ signal }) => getEvents(guildId, signal),
  });
  const upcoming =
    events.data?.filter((event) => event.state === 'scheduled') ?? [];
  return (
    <Card>
      <h2>
        <CalendarDays size={18} aria-hidden="true" /> Events
      </h2>
      {events.isPending ? (
        <LoadingState />
      ) : events.error ? (
        <ErrorState message={errorMessage(events.error)} />
      ) : upcoming.length ? (
        upcoming.map((event) => (
          <Rsvp key={event.id} guildId={guildId} event={event} />
        ))
      ) : (
        <EmptyState
          compact
          icon={CalendarDays}
          title="No upcoming events"
          description="Events you can RSVP to appear here."
        />
      )}
    </Card>
  );
}

export function RemindersCard({ guildId }: { guildId: string }) {
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <div className="section-heading">
        <h2>
          <AlarmClock size={18} aria-hidden="true" /> Reminders
        </h2>
        {!adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            New reminder
          </Button>
        )}
      </div>
      {adding && (
        <NewReminder
          guildId={guildId}
          allowChannel={false}
          onCreated={() => setAdding(false)}
        />
      )}
      <ReminderList guildId={guildId} compact />
    </Card>
  );
}

const BirthdayForm = z
  .object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    timezone: z.string().min(1),
    visibility: z.enum(['private', 'public']),
    leapDayPolicy: z.enum(['feb28', 'march1', 'leap_only']),
  })
  .refine(
    (v) =>
      new Date(Date.UTC(2000, v.month - 1, v.day)).getUTCMonth() ===
      v.month - 1,
    { path: ['day'], message: 'That month does not have this day.' },
  );
type BirthdayInput = z.input<typeof BirthdayForm>;
const months = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2000, i, 1)).toLocaleString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  }),
);

function BirthdayEditor({
  guildId,
  saved,
}: {
  guildId: string;
  saved: z.infer<typeof BirthdayRecordSchema> | null;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const form = useForm<BirthdayInput, unknown, z.output<typeof BirthdayForm>>({
    resolver: zodResolver(BirthdayForm),
    defaultValues: {
      month: saved?.data.month ?? 1,
      day: saved?.data.day ?? 1,
      timezone: saved?.data.timezone ?? browserTimeZone(),
      visibility: saved?.data.visibility ?? 'private',
      leapDayPolicy: saved?.data.leapDayPolicy ?? 'feb28',
    },
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['birthday', guildId] });
  const save = useMutation({
    mutationFn: (body: z.output<typeof BirthdayForm>) =>
      saveBirthday(guildId, body, identity('birthday', body)),
    onSuccess: (result) => {
      form.reset(result.data.data as BirthdayInput);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      deleteBirthday(guildId, identity('birthday-delete', saved?.revision)),
    onSuccess: refresh,
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <div className="form-grid">
        <Field label="Month" htmlFor="birthday-month">
          <select
            id="birthday-month"
            {...form.register('month', { valueAsNumber: true })}
          >
            {months.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Day"
          htmlFor="birthday-day"
          error={form.formState.errors.day?.message}
        >
          <Input
            id="birthday-day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            {...form.register('day', { valueAsNumber: true })}
          />
        </Field>
        <TimeZoneField form={form} name="timezone" label="Your time zone" />
        <SelectField
          form={form}
          name="visibility"
          label="Who knows"
          options={[
            { value: 'private', label: 'Only me — a direct message' },
            {
              value: 'public',
              label: 'The server — an announcement and any birthday role',
            },
          ]}
        />
        <SelectField
          form={form}
          name="leapDayPolicy"
          label="If born on 29 February"
          options={[
            { value: 'feb28', label: 'Celebrate on 28 February' },
            { value: 'march1', label: 'Celebrate on 1 March' },
            { value: 'leap_only', label: 'Only in leap years' },
          ]}
        />
      </div>
      <p className="field-hint">The year is never asked for or stored.</p>
      {save.error && <ErrorState message={errorMessage(save.error)} />}
      {remove.error && <ErrorState message={errorMessage(remove.error)} />}
      <div className="row">
        <Button type="submit" busy={save.isPending}>
          {saved ? 'Save birthday' : 'Add birthday'}
        </Button>
        {saved && (
          <Button
            type="button"
            variant="ghost"
            busy={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove my birthday
          </Button>
        )}
      </div>
      {saved?.data.nextAt && !form.formState.isDirty && (
        <p className="save-feedback" role="status">
          Next celebration{' '}
          {formatInZone(saved.data.nextAt, saved.data.timezone)}.
        </p>
      )}
    </form>
  );
}

export function BirthdayCard({ guildId }: { guildId: string }) {
  const birthday = useQuery({
    queryKey: ['birthday', guildId],
    queryFn: ({ signal }) => getMyBirthday(guildId, signal),
  });
  return (
    <Card>
      <h2>
        <CakeSlice size={18} aria-hidden="true" /> Your birthday
      </h2>
      {birthday.isPending ? (
        <LoadingState />
      ) : unavailable(birthday.error) ? (
        <p className="muted">This server does not celebrate birthdays.</p>
      ) : birthday.error ? (
        <ErrorState message={errorMessage(birthday.error)} />
      ) : (
        <BirthdayEditor
          key={birthday.data?.revision ?? 0}
          guildId={guildId}
          saved={birthday.data}
        />
      )}
    </Card>
  );
}
