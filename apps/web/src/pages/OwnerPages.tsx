import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  PageHeading,
} from '@sparko/ui';
import { getOwnerHealth, retryOwnerJob } from '../services/account';
import {
  getFleet,
  getGrants,
  getJobs,
  getOwnerGuild,
  grantableCapabilities,
  grantPlan,
  ownerSections,
  revokeGrant,
  revokePlan,
  saveGrant,
  setFeaturePolicy,
  visibleSections,
  type FeatureGate,
  type OwnerGuild,
  type OwnerSection,
} from '../services/owner';
import { getSupportTickets, type SupportState } from '../services/support';
import { errorMessage } from '../services/http';
import { Metric, useSession } from '../components/AppShell';
import {
  SupportStateBadge,
  SupportThread,
  categoryLabels,
} from '../components/SupportThread';
import { modules } from '../content/modules';
import { useActionIdentity } from '../hooks/useActionIdentity';

const sectionLabels: Record<OwnerSection, string> = {
  health: 'Health',
  fleet: 'Servers',
  jobs: 'Jobs',
  support: 'Support queue',
  grants: 'Operator access',
};
// Modules without their own dashboard page in the catalog.
const extraNames: Record<string, string> = {
  tickets: 'Tickets',
  R41: 'Invite rewards',
  R48: 'Server analytics',
  R52: 'Daily and work rewards',
};
const featureName = (id: string) =>
  extraNames[id] ?? modules.find((module) => module.id === id)?.name ?? id;
const dateInput = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
/** End of the chosen day in UTC, so a grant lasts through that date. */
const endOfDay = (value: string) => new Date(`${value}T23:59:59.000Z`);

function Health() {
  const health = useQuery({
    queryKey: ['owner-health'],
    queryFn: ({ signal }) => getOwnerHealth(signal),
    refetchInterval: 15000,
  });
  if (health.isPending)
    return <LoadingState label="Fetching operator observations…" />;
  if (health.error)
    return (
      <ErrorState
        message={errorMessage(health.error)}
        retry={() => void health.refetch()}
      />
    );
  return (
    <>
      <div className="row status-line">
        <Badge>Build {health.data.build}</Badge>
        <span className="muted">
          Checked {new Date(health.data.checkedAt).toLocaleString()}
        </span>
      </div>
      <div className="metric-grid">
        {health.data.metrics.map((metric) => (
          <Metric
            key={metric.label}
            label={metric.label}
            value={
              metric.value === null ? '—' : `${metric.value} ${metric.unit}`
            }
            detail={metric.window}
          />
        ))}
      </div>
      <Card>
        <div className="section-heading">
          <h2>Service health</h2>
          <Activity size={18} aria-hidden="true" />
        </div>
        {health.data.services.map((service) => (
          <div className="status-row" key={service.name}>
            <div>
              <strong>{service.name}</strong>
              {service.detail && <p>{service.detail}</p>}
              <small className="muted">
                {service.lastSeenAt
                  ? `Last observed ${new Date(service.lastSeenAt).toLocaleString()}`
                  : 'No heartbeat observed'}
              </small>
            </div>
            <Badge
              tone={
                ['online', 'healthy', 'connected'].includes(service.status)
                  ? 'success'
                  : 'warning'
              }
            >
              {service.status}
            </Badge>
          </div>
        ))}
      </Card>
      <Notice tone="info" title="What these numbers mean">
        Metrics reflect observed state at the time shown. Provider connectivity
        and successful delivery need their own verification.
      </Notice>
    </>
  );
}

function FeaturePolicyRow({
  guildId,
  gate,
  policyRevision,
  canManage,
}: {
  guildId: string;
  gate: FeatureGate;
  policyRevision: number;
  canManage: boolean;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const change = useMutation({
    mutationFn: () => {
      const body = {
        allowed: !gate.ownerAllowed,
        reason: reason.trim(),
        expectedRevision: policyRevision,
      };
      return setFeaturePolicy(
        guildId,
        gate.featureId,
        body,
        identity('policy', { guildId, featureId: gate.featureId, body }),
      );
    },
    onSuccess: () => {
      setReason('');
      setOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ['owner-guild', guildId],
      });
    },
  });
  const state = !gate.ownerAllowed
    ? { label: 'Paused by staff', tone: 'danger' as const }
    : !gate.planEntitled
      ? { label: 'Needs Plus', tone: 'warning' as const }
      : gate.enabled
        ? { label: 'On', tone: 'success' as const }
        : { label: 'Off', tone: 'neutral' as const };
  return (
    <li className="policy-row">
      <div className="activity-row">
        <span>
          <strong>{featureName(gate.featureId)}</strong>
          <small>
            {gate.featureId}
            {gate.ownerReason ? ` · ${gate.ownerReason}` : ''}
          </small>
        </span>
        <span className="row">
          <Badge tone={state.tone}>{state.label}</Badge>
          {canManage && (
            <Button
              variant={gate.ownerAllowed ? 'ghost' : 'secondary'}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {gate.ownerAllowed ? 'Pause…' : 'Resume…'}
            </Button>
          )}
        </span>
      </div>
      {open && (
        <form
          className="stack policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim().length >= 3) change.mutate();
          }}
        >
          <p className="field-hint">
            {gate.ownerAllowed
              ? 'Pausing stops new work for this module in this server. Settings and records stay; cleanup and refunds keep running. The server sees your reason.'
              : 'Resuming lets the server’s own settings apply again.'}
          </p>
          <Field
            label="Reason (recorded and shown to the server)"
            htmlFor={`policy-${gate.featureId}`}
          >
            <Input
              id={`policy-${gate.featureId}`}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="row">
            <Button
              type="submit"
              variant={gate.ownerAllowed ? 'danger' : 'primary'}
              disabled={reason.trim().length < 3}
              busy={change.isPending}
            >
              {gate.ownerAllowed ? 'Pause module' : 'Resume module'}
            </Button>
          </div>
          {change.error && <ErrorState message={errorMessage(change.error)} />}
        </form>
      )}
    </li>
  );
}

function PlanGrants({
  guildId,
  data,
  canManage,
}: {
  guildId: string;
  data: OwnerGuild;
  canManage: boolean;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [until, setUntil] = useState(dateInput(30));
  const [reason, setReason] = useState('');
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['owner-guild', guildId] });
  const grant = useMutation({
    mutationFn: () => {
      const body = {
        plan: 'plus' as const,
        expiresAt: endOfDay(until).toISOString(),
        reason: reason.trim(),
      };
      return grantPlan(guildId, body, identity('grant-plan', body));
    },
    onSuccess: () => {
      setReason('');
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (input: { id: string; revision: number; reason: string }) =>
      revokePlan(
        guildId,
        input.id,
        { reason: input.reason, expectedRevision: input.revision },
        identity('revoke-plan', input),
      ),
    onSuccess: refresh,
  });
  return (
    <Card>
      <div className="section-heading">
        <h3>Plan</h3>
        <Badge tone={data.plan.id === 'plus' ? 'success' : 'neutral'}>
          {data.plan.id === 'plus' ? 'Plus' : 'Free'}
        </Badge>
      </div>
      {data.entitlements.length ? (
        data.entitlements.map((row) => (
          <div className="activity-row" key={row.id}>
            <span>
              <strong>
                {row.source === 'staff'
                  ? 'Staff grant'
                  : 'Provider subscription'}
              </strong>
              <small>
                {row.expiresAt
                  ? `Until ${new Date(row.expiresAt).toLocaleDateString()}`
                  : 'No end date'}
                {row.status ? ` · ${row.status}` : ''}
                {row.reason ? ` · ${row.reason}` : ''}
              </small>
            </span>
            <span className="row">
              <Badge tone={row.revoked ? 'danger' : 'neutral'}>
                {row.revoked ? 'Revoked' : row.state}
              </Badge>
              {canManage &&
                row.source === 'staff' &&
                row.state === 'active' && (
                  <Button
                    variant="ghost"
                    busy={revoke.isPending && revoke.variables?.id === row.id}
                    onClick={() =>
                      revoke.mutate({
                        id: row.id,
                        revision: row.revision,
                        reason: 'Revoked from the owner console',
                      })
                    }
                  >
                    Revoke
                  </Button>
                )}
            </span>
          </div>
        ))
      ) : (
        <p className="muted">No subscription or staff grant.</p>
      )}
      {canManage && (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim().length >= 3) grant.mutate();
          }}
        >
          <h4>Grant Plus</h4>
          <p className="field-hint">
            For partners or support cases. Provider subscriptions are never
            edited here; they change only through the payment provider.
          </p>
          <div className="form-grid">
            <Field label="Until (UTC)" htmlFor="grant-until">
              <Input
                id="grant-until"
                type="date"
                min={dateInput(1)}
                max={dateInput(365)}
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </Field>
            <Field label="Reason" htmlFor="grant-reason">
              <Input
                id="grant-reason"
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </div>
          <div className="row">
            <Button
              type="submit"
              variant="secondary"
              disabled={reason.trim().length < 3}
              busy={grant.isPending}
            >
              Grant Plus
            </Button>
          </div>
        </form>
      )}
      {grant.error && <ErrorState message={errorMessage(grant.error)} />}
      {revoke.error && <ErrorState message={errorMessage(revoke.error)} />}
    </Card>
  );
}

function ServerDetail({
  guildId,
  canManage,
}: {
  guildId: string;
  canManage: boolean;
}) {
  const detail = useQuery({
    queryKey: ['owner-guild', guildId],
    queryFn: ({ signal }) => getOwnerGuild(guildId, signal),
  });
  if (detail.isPending) return <LoadingState />;
  if (detail.error)
    return (
      <ErrorState
        message={errorMessage(detail.error)}
        retry={() => void detail.refetch()}
      />
    );
  const data = detail.data;
  const revision = (featureId: string) =>
    data.policies.find((policy) => policy.featureId === featureId)?.revision ??
    0;
  return (
    <div className="stack">
      <h2 className="wrap-anywhere">{data.guild.name}</h2>
      <PlanGrants guildId={guildId} data={data} canManage={canManage} />
      <Card>
        <h3>Modules</h3>
        <p className="muted">
          A server’s own on/off switch is theirs. Staff can only pause a module,
          with a reason the server can see.
        </p>
        <ul className="policy-list">
          {data.features.map((gate) => (
            <FeaturePolicyRow
              key={gate.featureId}
              guildId={guildId}
              gate={gate}
              policyRevision={revision(gate.featureId)}
              canManage={canManage}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Fleet({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const fleet = useQuery({
    queryKey: ['owner', 'fleet'],
    queryFn: ({ signal }) => getFleet(signal),
  });
  if (fleet.isPending) return <LoadingState />;
  if (fleet.error)
    return (
      <ErrorState
        message={errorMessage(fleet.error)}
        retry={() => void fleet.refetch()}
      />
    );
  const needle = search.trim().toLowerCase();
  const shown = fleet.data.filter(
    (guild) =>
      !needle ||
      guild.name.toLowerCase().includes(needle) ||
      guild.id.includes(needle),
  );
  return (
    <div className="overview-grid">
      <Card>
        <Input
          aria-label="Search servers by name or ID"
          placeholder="Search servers…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {shown.length ? (
          shown.map((guild) => (
            <button
              type="button"
              key={guild.id}
              className="activity-row button-reset"
              aria-pressed={selected === guild.id}
              onClick={() => setSelected(guild.id)}
            >
              <span>
                <strong className="wrap-anywhere">{guild.name}</strong>
                <small>
                  {guild.id}
                  {guild.memberCount ? ` · ${guild.memberCount} members` : ''}
                </small>
              </span>
              <span>
                <Badge tone={guild.installed ? 'success' : 'neutral'}>
                  {guild.installed ? 'Installed' : 'Not installed'}
                </Badge>
              </span>
            </button>
          ))
        ) : (
          <EmptyState
            compact
            title="No servers match"
            description="Try another name or ID."
          />
        )}
      </Card>
      {selected ? (
        <ServerDetail guildId={selected} canManage={canManage} />
      ) : (
        <Card>
          <EmptyState
            compact
            title="Choose a server"
            description="See its plan and modules."
          />
        </Card>
      )}
    </div>
  );
}

function Jobs({ canRetry }: { canRetry: boolean }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const jobs = useQuery({
    queryKey: ['owner', 'jobs'],
    queryFn: ({ signal }) => getJobs(signal),
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      retryOwnerJob(id, reason.trim(), identity('job-retry', { id, reason })),
    onSuccess: () => {
      setRetrying(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['owner', 'jobs'] });
    },
  });
  if (jobs.isPending) return <LoadingState />;
  if (jobs.error)
    return (
      <ErrorState
        message={errorMessage(jobs.error)}
        retry={() => void jobs.refetch()}
      />
    );
  if (!jobs.data.length)
    return (
      <EmptyState
        title="No waiting or failed jobs"
        description="Pending, retrying and failed effects appear here."
      />
    );
  return (
    <Card>
      {jobs.data.map((job) => (
        <div className="stack job-row" key={job.id}>
          <div className="activity-row">
            <span>
              <strong>{job.type}</strong>
              <small>
                Server {job.guildId} · {job.attempts} attempt
                {job.attempts === 1 ? '' : 's'} · due{' '}
                {new Date(job.dueAt).toLocaleString()}
                {job.lastError ? ` · ${job.lastError}` : ''}
              </small>
            </span>
            <span className="row">
              <Badge
                tone={
                  ['dead', 'blocked'].includes(job.state)
                    ? 'danger'
                    : job.state === 'unknown'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {job.state === 'unknown' ? 'Outcome unknown' : job.state}
              </Badge>
              {canRetry && ['dead', 'blocked'].includes(job.state) && (
                <Button variant="secondary" onClick={() => setRetrying(job.id)}>
                  Retry…
                </Button>
              )}
            </span>
          </div>
          {retrying === job.id && (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim().length >= 3) retry.mutate(job.id);
              }}
            >
              <Field
                label="Why retry? (recorded)"
                htmlFor={`retry-${job.id}`}
                hint="Only jobs that failed for a known reason can be retried. Unknown outcomes need reconciliation instead, so nothing is done twice."
              >
                <Input
                  id={`retry-${job.id}`}
                  value={reason}
                  maxLength={1000}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <div className="row">
                <Button
                  type="submit"
                  disabled={reason.trim().length < 3}
                  busy={retry.isPending}
                >
                  Retry job
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRetrying(null)}
                >
                  Cancel
                </Button>
              </div>
              {retry.error && (
                <ErrorState message={errorMessage(retry.error)} />
              )}
            </form>
          )}
        </div>
      ))}
    </Card>
  );
}

const supportFilters: { id: SupportState | 'all'; label: string }[] = [
  { id: 'open', label: 'Needs a reply' },
  { id: 'waiting_on_user', label: 'Waiting on member' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];
function SupportQueue({ canReply }: { canReply: boolean }) {
  const [filter, setFilter] = useState<SupportState | 'all'>('open');
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useQuery({
    queryKey: ['support', 'owner'],
    queryFn: ({ signal }) => getSupportTickets('owner', signal),
    refetchInterval: 15000,
  });
  if (queue.isPending) return <LoadingState />;
  if (queue.error)
    return (
      <ErrorState
        message={errorMessage(queue.error)}
        retry={() => void queue.refetch()}
      />
    );
  const shown = queue.data.filter(
    (ticket) => filter === 'all' || ticket.state === filter,
  );
  const current = queue.data.find((ticket) => ticket.id === selected);
  return (
    <div className="stack">
      <div className="tabs" role="group" aria-label="Filter by status">
        {supportFilters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            className={filter === item.id ? 'active' : ''}
            onClick={() => setFilter(item.id)}
          >
            {item.label} (
            {item.id === 'all'
              ? queue.data.length
              : queue.data.filter((ticket) => ticket.state === item.id).length}
            )
          </button>
        ))}
      </div>
      {!canReply && (
        <Notice tone="info" title="Read-only access">
          Replying and changing status need the support reply permission.
        </Notice>
      )}
      <div className="overview-grid">
        <Card>
          {shown.length ? (
            shown.map((ticket) => (
              <button
                type="button"
                key={ticket.id}
                className="activity-row button-reset"
                aria-pressed={selected === ticket.id}
                onClick={() => setSelected(ticket.id)}
              >
                <span>
                  <strong className="wrap-anywhere">{ticket.subject}</strong>
                  <small>
                    {categoryLabels[ticket.category] ?? ticket.category} ·
                    updated {new Date(ticket.updatedAt).toLocaleString()}
                  </small>
                </span>
                <span>
                  <SupportStateBadge scope="owner" state={ticket.state} />
                </span>
              </button>
            ))
          ) : (
            <EmptyState
              compact
              title="Nothing here"
              description="No support requests have this status."
            />
          )}
        </Card>
        <Card>
          {current ? (
            <SupportThread scope="owner" ticket={current} canReply={canReply} />
          ) : (
            <EmptyState
              compact
              title="Choose a request"
              description="Read the conversation and reply."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function Grants() {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [until, setUntil] = useState(dateInput(30));
  const [reason, setReason] = useState('');
  const grants = useQuery({
    queryKey: ['owner', 'grants'],
    queryFn: ({ signal }) => getGrants(signal),
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['owner', 'grants'] });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        capabilities,
        expiresAt: endOfDay(until).toISOString(),
        reason: reason.trim(),
      };
      return saveGrant(
        userId.trim(),
        body,
        identity('grant', { userId, body }),
      );
    },
    onSuccess: () => {
      setUserId('');
      setCapabilities([]);
      setReason('');
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      revokeGrant(id, 'Removed from the owner console', identity('revoke', id)),
    onSuccess: refresh,
  });
  const validUser = /^\d{17,20}$/.test(userId.trim());
  return (
    <div className="stack">
      <Notice tone="info" title="Narrow, expiring access">
        Each permission is separate, and every grant expires within 90 days. No
        permission here shows provider secrets or private member records.
      </Notice>
      <Card>
        <h2>Current operators</h2>
        {grants.isPending ? (
          <LoadingState />
        ) : grants.error ? (
          <ErrorState message={errorMessage(grants.error)} />
        ) : grants.data.length ? (
          grants.data.map((grant) => (
            <div className="activity-row" key={grant.userId}>
              <span>
                <strong>{grant.userId}</strong>
                <small>
                  {grant.capabilities
                    .map(
                      (id) =>
                        grantableCapabilities.find((c) => c.id === id)?.label ??
                        id,
                    )
                    .join(' · ')}
                  {grant.expiresAt
                    ? ` · until ${new Date(grant.expiresAt).toLocaleDateString()}`
                    : ''}
                </small>
              </span>
              <Button
                variant="ghost"
                busy={revoke.isPending && revoke.variables === grant.userId}
                onClick={() => revoke.mutate(grant.userId)}
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className="muted">Only the configured owners have access.</p>
        )}
        {revoke.error && <ErrorState message={errorMessage(revoke.error)} />}
      </Card>
      <Card>
        <h2>Give or change access</h2>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (validUser && reason.trim().length >= 3) save.mutate();
          }}
        >
          <div className="form-grid">
            <Field
              label="Discord user ID"
              htmlFor="grant-user"
              error={
                userId && !validUser ? 'Enter a numeric Discord ID.' : undefined
              }
            >
              <Input
                id="grant-user"
                inputMode="numeric"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              />
            </Field>
            <Field label="Until (UTC, at most 90 days)" htmlFor="grant-days">
              <Input
                id="grant-days"
                type="date"
                min={dateInput(1)}
                max={dateInput(89)}
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </Field>
          </div>
          <fieldset className="stack">
            <legend>Permissions</legend>
            {grantableCapabilities.map((capability) => (
              <label className="checkbox-row" key={capability.id}>
                <input
                  type="checkbox"
                  checked={capabilities.includes(capability.id)}
                  onChange={(event) =>
                    setCapabilities(
                      event.target.checked
                        ? [...capabilities, capability.id]
                        : capabilities.filter((id) => id !== capability.id),
                    )
                  }
                />
                <span>{capability.label}</span>
              </label>
            ))}
          </fieldset>
          <Field label="Reason (recorded)" htmlFor="grant-why">
            <Input
              id="grant-why"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="row">
            <Button
              type="submit"
              disabled={!validUser || reason.trim().length < 3}
              busy={save.isPending}
            >
              Save access
            </Button>
          </div>
          {save.error && <ErrorState message={errorMessage(save.error)} />}
        </form>
      </Card>
    </div>
  );
}

export function OwnerPage({ section }: { section?: OwnerSection }) {
  const session = useSession();
  const capabilities = session.data?.capabilities ?? [];
  const sections = visibleSections(capabilities);
  const queryClient = useQueryClient();
  if (session.isPending) return <LoadingState />;
  if (!sections.length)
    return (
      <ErrorState message="The owner console needs a Sparko operator permission." />
    );
  if (!section || !capabilities.includes(ownerSections[section]))
    return <Navigate to={`/owner/${sections[0]}`} replace />;
  return (
    <>
      <PageHeading
        eyebrow="Sparko operators"
        title="Owner console"
        description="Real service observations and narrow, audited tools. Operator access is separate from running a server."
        actions={
          <Button
            variant="secondary"
            onClick={() => void queryClient.invalidateQueries()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      <nav className="tabs owner-tabs" aria-label="Owner sections">
        {sections.map((item) => (
          <Link
            key={item}
            to={`/owner/${item}`}
            className={item === section ? 'active' : ''}
            aria-current={item === section ? 'page' : undefined}
          >
            {sectionLabels[item]}
          </Link>
        ))}
      </nav>
      {section === 'health' && <Health />}
      {section === 'fleet' && (
        <Fleet canManage={capabilities.includes('entitlements.manage')} />
      )}
      {section === 'jobs' && (
        <Jobs canRetry={capabilities.includes('maintenance.manage')} />
      )}
      {section === 'support' && (
        <SupportQueue canReply={capabilities.includes('support.reply')} />
      )}
      {section === 'grants' && <Grants />}
      <p className="field-hint owner-footnote">
        <ShieldCheck size={14} aria-hidden="true" /> Every change here records
        who made it and why.
      </p>
    </>
  );
}
