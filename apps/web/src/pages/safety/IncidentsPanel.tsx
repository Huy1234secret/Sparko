import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Notice,
} from '@sparko/ui';
import {
  getIncidents,
  recoverIncident,
  type IncidentRecord,
} from '../../services/safety';
import { ApiError, errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

const states: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  observed: { label: 'Observed only', tone: 'info' },
  pending: { label: 'Action queued', tone: 'warning' },
  applied: { label: 'Protection applied', tone: 'success' },
  failed: { label: 'Action failed', tone: 'danger' },
  reviewed: { label: 'Reviewed by staff', tone: 'neutral' },
};
const attribution: Record<string, string> = {
  confirmed: 'Confirmed by the audit log',
  ambiguous: 'Ambiguous: several people could have done this',
  unknown: 'Unknown: Discord did not say who did this',
  'source member': 'The joining member',
};
const describe = (incident: IncidentRecord) => {
  const data = incident.data;
  if (data.event?.type === 'destructive')
    return `${(data.event.action ?? 'change').replaceAll('_', ' ')}${data.burstCount ? ` · ${data.burstCount} in the window` : ''}`;
  if (data.event?.type === 'join')
    return `${data.burstCount ?? 1} joins in the window`;
  return data.detail ?? 'Rule matched';
};

function IncidentDetail({
  guildId,
  incident,
}: {
  guildId: string;
  incident: IncidentRecord;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const recover = useMutation({
    mutationFn: () => {
      const body = {
        expectedRevision: incident.revision,
        reason: reason.trim(),
      };
      return recoverIncident(
        guildId,
        incident.id,
        body,
        identity('incident-recover', { id: incident.id, body }),
      );
    },
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['incidents', guildId] });
    },
  });
  const data = incident.data;
  const state = states[incident.state];
  return (
    <div className="stack">
      <div className="section-heading">
        <h2>{describe(incident)}</h2>
        <Badge tone={state?.tone ?? 'neutral'}>
          {state?.label ?? incident.state}
        </Badge>
      </div>
      <dl className="detail-list">
        <dt>When</dt>
        <dd>{new Date(incident.createdAt).toLocaleString()}</dd>
        {data.mode && (
          <>
            <dt>Mode</dt>
            <dd>
              {data.mode === 'enforce'
                ? 'Enforced'
                : 'Observe only — nothing was done to the member'}
            </dd>
          </>
        )}
        {data.plannedAction && (
          <>
            <dt>Configured action</dt>
            <dd>{data.plannedAction}</dd>
          </>
        )}
        {(data.userId ?? data.event?.userId) && (
          <>
            <dt>Member</dt>
            <dd className="mono">{data.userId ?? data.event?.userId}</dd>
          </>
        )}
        {data.event?.resourceId && (
          <>
            <dt>Affected resource</dt>
            <dd className="mono">{data.event.resourceId}</dd>
          </>
        )}
        {data.attribution && (
          <>
            <dt>Who did it</dt>
            <dd>
              {attribution[data.attribution] ?? data.attribution}
              {data.event?.executorId && (
                <span className="mono"> ({data.event.executorId})</span>
              )}
            </dd>
          </>
        )}
      </dl>
      {data.recoveryLimits && (
        <Notice tone="info" title="What Sparko cannot restore">
          {data.recoveryLimits}
        </Notice>
      )}
      {data.recovery ? (
        <Notice tone="success" title="Manual recovery recorded">
          {data.recovery.reason} — by{' '}
          <span className="mono">{data.recovery.actorId}</span>,{' '}
          {new Date(data.recovery.at).toLocaleString()}. {data.recovery.policy}
        </Notice>
      ) : (
        <>
          <Field
            label="What did staff check or restore?"
            htmlFor={`recover-${incident.id}`}
            required
            hint="At least 3 characters. Sparko records this; it does not recreate deleted content."
          >
            <textarea
              id={`recover-${incident.id}`}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="row">
            <Button
              disabled={reason.trim().length < 3}
              busy={recover.isPending}
              onClick={() => recover.mutate()}
            >
              Record manual recovery
            </Button>
          </div>
          {recover.error && (
            <ErrorState
              message={
                recover.error instanceof ApiError &&
                recover.error.code === 'REVISION_CONFLICT'
                  ? 'This incident changed. Your note is kept; it will refresh in a moment.'
                  : errorMessage(recover.error)
              }
            />
          )}
        </>
      )}
    </div>
  );
}

/** Incidents recorded by one safety feature, with staff recovery notes. */
export function IncidentsPanel({
  guildId,
  feature,
  emptyText,
}: {
  guildId: string;
  feature: 'R27' | 'R28' | 'R29';
  emptyText: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const incidents = useQuery({
    queryKey: ['incidents', guildId],
    queryFn: ({ signal }) => getIncidents(guildId, signal),
    refetchInterval: 15000,
  });
  if (incidents.isPending) return <LoadingState label="Loading incidents…" />;
  if (incidents.error)
    return (
      <ErrorState
        message={errorMessage(incidents.error)}
        retry={() => void incidents.refetch()}
      />
    );
  const rows = incidents.data.filter((row) => row.data.feature === feature);
  const current = rows.find((row) => row.id === selected);
  return (
    <div className="overview-grid">
      <Card>
        <h2>Incidents</h2>
        {rows.length ? (
          rows.map((row) => (
            <button
              type="button"
              key={row.id}
              className="activity-row button-reset"
              aria-pressed={selected === row.id}
              onClick={() => setSelected(row.id)}
            >
              <span>
                <strong>{describe(row)}</strong>
                <small>{new Date(row.createdAt).toLocaleString()}</small>
              </span>
              <Badge tone={states[row.state]?.tone ?? 'neutral'}>
                {states[row.state]?.label ?? row.state}
              </Badge>
            </button>
          ))
        ) : (
          <EmptyState
            compact
            icon={ShieldAlert}
            title="No incidents"
            description={emptyText}
          />
        )}
      </Card>
      <Card>
        {current ? (
          <IncidentDetail
            key={current.id + current.revision}
            guildId={guildId}
            incident={current}
          />
        ) : (
          <EmptyState
            compact
            title="Choose an incident"
            description="See what was detected, who it is attributed to and what staff did."
          />
        )}
      </Card>
    </div>
  );
}
