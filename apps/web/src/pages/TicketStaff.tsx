import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Users } from 'lucide-react';
import { Badge, Button, Card, ErrorState, Field, Input } from '@sparko/ui';
import {
  getTicketMetrics,
  getTicketStaff,
  setMyAvailability,
  updateTicket,
  type StaffMember,
  type Ticket,
  type TicketPriority,
} from '../services/tickets';
import { ApiError, errorMessage } from '../services/http';
import { useActionIdentity } from '../hooks/useActionIdentity';
import { Metric, useSession } from '../components/AppShell';

export const priorities: Record<
  TicketPriority,
  {
    label: string;
    tone: 'neutral' | 'info' | 'warning' | 'danger';
    rank: number;
  }
> = {
  urgent: { label: 'Urgent', tone: 'danger', rank: 0 },
  high: { label: 'High', tone: 'warning', rank: 1 },
  normal: { label: 'Normal', tone: 'neutral', rank: 2 },
  low: { label: 'Low', tone: 'info', rank: 3 },
};
const statusLabels: Record<StaffMember['status'], string> = {
  available: 'Available',
  away: 'Away',
  off: 'Off duty',
};
export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const value = priorities[priority];
  return <Badge tone={value.tone}>{value.label} priority</Badge>;
}
const duration = (minutes: number | null) =>
  minutes === null
    ? 'No data yet'
    : minutes < 60
      ? `${Math.round(minutes)} min`
      : minutes < 2880
        ? `${(minutes / 60).toFixed(1)} h`
        : `${(minutes / 1440).toFixed(1)} days`;
/** Staff-only queries; members receive 403 and the panels stay hidden. */
export function useTicketStaff(guildId: string, enabled = true) {
  return useQuery({
    queryKey: ['ticket-staff', guildId],
    queryFn: ({ signal }) => getTicketStaff(guildId, signal),
    enabled,
    retry: false,
  });
}

/** Availability, workload and response times for the support team. */
export function TeamPanel({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const session = useSession();
  const staff = useTicketStaff(guildId);
  const metrics = useQuery({
    queryKey: ['ticket-metrics', guildId],
    queryFn: ({ signal }) => getTicketMetrics(guildId, signal),
    retry: false,
    refetchInterval: 60000,
  });
  const me = staff.data?.find(
    (person) => person.userId === session.data?.user?.id,
  );
  const [note, setNote] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (status: StaffMember['status']) => {
      const body = { status, note: (note ?? me?.note ?? '').trim() };
      return setMyAvailability(guildId, body, identity('availability', body));
    },
    onSuccess: () => {
      setNote(null);
      void queryClient.invalidateQueries({
        queryKey: ['ticket-staff', guildId],
      });
    },
  });
  if (
    staff.error instanceof ApiError &&
    ['FORBIDDEN', 'FEATURE_DISABLED'].includes(staff.error.code)
  )
    return null;
  return (
    <Card className="team-panel">
      <div className="section-heading">
        <h2>
          <Users size={18} aria-hidden="true" /> Support team
        </h2>
        {metrics.data && (
          <small className="muted">Last {metrics.data.windowDays} days</small>
        )}
      </div>
      {metrics.data && (
        <div className="metric-grid">
          <Metric
            label="Waiting for staff"
            value={metrics.data.unclaimed}
            detail={`${metrics.data.open} open · ${metrics.data.urgent} high or urgent`}
          />
          <Metric
            label="Time to first claim"
            value={duration(metrics.data.medianFirstClaimMinutes)}
            detail={metrics.data.definitions.firstClaim}
          />
          <Metric
            label="Time to resolve"
            value={duration(metrics.data.medianResolutionMinutes)}
            detail={metrics.data.definitions.resolution}
          />
          <Metric
            label="Escalated"
            value={metrics.data.escalated}
            detail={`of ${metrics.data.opened} opened`}
          />
        </div>
      )}
      <div className="team-grid">
        <section aria-labelledby="my-availability">
          <h3 id="my-availability">Your availability</h3>
          <p className="field-hint">
            Only available staff can be assigned tickets. Reminders and
            escalation still mention your support roles.
          </p>
          <Field
            label="Note for the team (optional)"
            htmlFor="availability-note"
          >
            <Input
              id="availability-note"
              maxLength={200}
              value={note ?? me?.note ?? ''}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div className="tabs" role="group" aria-label="Your availability">
            {(['available', 'away', 'off'] as const).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={me?.status === status}
                className={me?.status === status ? 'active' : ''}
                disabled={update.isPending}
                onClick={() => update.mutate(status)}
              >
                {statusLabels[status]}
              </button>
            ))}
          </div>
          {update.error && <ErrorState message={errorMessage(update.error)} />}
        </section>
        <section aria-labelledby="team-list">
          <h3 id="team-list">Team</h3>
          {staff.data?.length ? (
            staff.data.map((person) => (
              <div className="activity-row" key={person.userId}>
                <span>
                  <strong className="mono">{person.userId}</strong>
                  <small>
                    {person.claimed} claimed
                    {person.note ? ` · ${person.note}` : ''}
                  </small>
                </span>
                <Badge
                  tone={
                    person.status === 'available'
                      ? 'success'
                      : person.status === 'away'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {statusLabels[person.status]}
                </Badge>
              </div>
            ))
          ) : (
            <p className="muted">
              Nobody has set their availability yet. Staff appear here once they
              do.
            </p>
          )}
        </section>
      </div>
    </Card>
  );
}

/** Priority and assignment for one ticket; shown to staff only. */
export function TicketStaffControls({
  guildId,
  ticket,
}: {
  guildId: string;
  ticket: Ticket;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const staff = useTicketStaff(guildId);
  const [assignee, setAssignee] = useState('');
  const [participant, setParticipant] = useState('');
  const change = useMutation({
    mutationFn: ({
      action,
      input,
    }: {
      action: 'priority' | 'assign' | 'waiting' | 'participants';
      input: Record<string, unknown>;
    }) =>
      updateTicket(
        guildId,
        ticket,
        action,
        input,
        identity(action, { id: ticket.id, revision: ticket.revision, input }),
      ),
    onError: () =>
      void queryClient.invalidateQueries({
        queryKey: ['ticket', guildId, ticket.id],
      }),
    onSuccess: (result) => {
      setAssignee('');
      setParticipant('');
      queryClient.setQueryData(['ticket', guildId, ticket.id], result.data);
      void queryClient.invalidateQueries({ queryKey: ['tickets', guildId] });
      void queryClient.invalidateQueries({
        queryKey: ['ticket-staff', guildId],
      });
    },
  });
  if (staff.error || ['closed', 'closing'].includes(ticket.status)) return null;
  const available = (staff.data ?? []).filter(
    (person) =>
      person.status === 'available' && person.userId !== ticket.claimantId,
  );
  return (
    <Card>
      <h2>Staff actions</h2>
      <div className="form-grid">
        <Field label="Priority" htmlFor="ticket-priority">
          <select
            id="ticket-priority"
            value={ticket.priority}
            disabled={change.isPending}
            onChange={(event) =>
              change.mutate({
                action: 'priority',
                input: { priority: event.target.value },
              })
            }
          >
            {(Object.keys(priorities) as TicketPriority[]).map((value) => (
              <option key={value} value={value}>
                {priorities[value].label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={ticket.claimantId ? 'Transfer to' : 'Assign to'}
          htmlFor="ticket-assignee"
          hint="Only staff marked available are listed."
        >
          <select
            id="ticket-assignee"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="">
              {available.length ? 'Choose a staff member' : 'Nobody available'}
            </option>
            {available.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.userId} · {person.claimed} claimed
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row">
        <Button
          variant="secondary"
          disabled={!assignee}
          busy={change.isPending && change.variables?.action === 'assign'}
          onClick={() =>
            change.mutate({ action: 'assign', input: { assigneeId: assignee } })
          }
        >
          {ticket.claimantId ? 'Transfer ticket' : 'Assign ticket'}
        </Button>
      </div>
      {ticket.claimantId && (
        <div className="row wrap">
          {ticket.status === 'claimed' ? (
            <Button
              variant="secondary"
              busy={change.isPending && change.variables?.action === 'waiting'}
              onClick={() =>
                change.mutate({
                  action: 'waiting',
                  input: { state: 'awaiting_member' },
                })
              }
            >
              Mark as waiting for the member
            </Button>
          ) : ticket.status === 'awaiting_member' ? (
            <Button
              variant="secondary"
              busy={change.isPending && change.variables?.action === 'waiting'}
              onClick={() =>
                change.mutate({
                  action: 'waiting',
                  input: { state: 'claimed' },
                })
              }
            >
              The member replied
            </Button>
          ) : null}
        </div>
      )}
      <h3>People in this ticket</h3>
      <p className="field-hint">
        Participants can read and write in the ticket channel. Sparko updates
        the channel permissions after you add or remove someone.
      </p>
      <ul className="plain-list">
        {ticket.participants.map((id) => (
          <li key={id} className="row space-between">
            <span className="mono">
              {id}
              {id === ticket.ownerId && ' (opened the ticket)'}
            </span>
            {id !== ticket.ownerId && (
              <Button
                variant="ghost"
                aria-label={`Remove participant ${id}`}
                disabled={change.isPending}
                onClick={() =>
                  change.mutate({
                    action: 'participants',
                    input: { userId: id, action: 'remove' },
                  })
                }
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Field
        label="Add a participant (Discord user ID)"
        htmlFor="ticket-participant"
        hint="17 to 20 digits."
      >
        <div className="row">
          <Input
            id="ticket-participant"
            inputMode="numeric"
            value={participant}
            onChange={(event) => setParticipant(event.target.value.trim())}
          />
          <Button
            variant="secondary"
            disabled={!/^\d{17,20}$/.test(participant)}
            busy={
              change.isPending && change.variables?.action === 'participants'
            }
            onClick={() =>
              change.mutate({
                action: 'participants',
                input: { userId: participant, action: 'add' },
              })
            }
          >
            Add
          </Button>
        </div>
      </Field>
      {(ticket.remindedAt || ticket.escalatedAt) && (
        <ul className="plain-list sla-list">
          {ticket.remindedAt && (
            <li>
              <Clock3 size={14} aria-hidden="true" /> Staff reminded{' '}
              {new Date(ticket.remindedAt).toLocaleString()}
            </li>
          )}
          {ticket.escalatedAt && (
            <li>
              <Clock3 size={14} aria-hidden="true" /> Escalated{' '}
              {new Date(ticket.escalatedAt).toLocaleString()}
            </li>
          )}
        </ul>
      )}
      {change.error && (
        <ErrorState
          message={
            change.error instanceof ApiError &&
            change.error.code === 'REVISION_CONFLICT'
              ? 'This ticket changed. It will refresh; try again.'
              : errorMessage(change.error)
          }
        />
      )}
    </Card>
  );
}
