import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Flag } from 'lucide-react';
import { ReportsConfigSchema } from '@sparko/contracts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Notice,
  PageHeading,
} from '@sparko/ui';
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { ConfigForm } from '../../features/config/ConfigForm';
import { Tabs } from '../../features/config/Tabs';
import { NumberField } from '../../features/config/fields';
import {
  decideIntake,
  getIntake,
  type AppealRecord,
  type IntakeKind,
  type ReportRecord,
} from '../../services/safety';
import { ApiError, errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

export const intakeStates: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  open: { label: 'New', tone: 'warning' },
  investigating: { label: 'Investigating', tone: 'info' },
  accepted: { label: 'Upheld', tone: 'success' },
  rejected: { label: 'Not upheld', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
};
const decisions = [
  { value: 'investigating', label: 'Mark as investigating' },
  { value: 'accepted', label: 'Uphold' },
  { value: 'rejected', label: 'Do not uphold' },
  { value: 'closed', label: 'Close without a decision' },
] as const;
type Decision = (typeof decisions)[number]['value'];
const final = ['accepted', 'rejected', 'closed'];
const isReport = (row: ReportRecord | AppealRecord): row is ReportRecord =>
  'subject' in row.data;

function IntakeDetail({
  guildId,
  kind,
  item,
}: {
  guildId: string;
  kind: IntakeKind;
  item: ReportRecord | AppealRecord;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision>('investigating');
  const [reason, setReason] = useState('');
  const decide = useMutation({
    mutationFn: () => {
      const body = {
        expectedRevision: item.revision,
        decision,
        reason: reason.trim(),
      };
      return decideIntake(
        guildId,
        kind,
        item.id,
        body,
        identity('intake-decision', { id: item.id, body }),
      );
    },
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({
        queryKey: ['intake', guildId, kind],
      });
    },
  });
  const state = intakeStates[item.state];
  return (
    <div className="stack">
      <div className="section-heading">
        <h2>
          {isReport(item) ? item.data.subject : 'Appeal of a moderation case'}
        </h2>
        <Badge tone={state?.tone ?? 'neutral'}>
          {state?.label ?? item.state}
        </Badge>
      </div>
      <dl className="detail-list">
        <dt>From</dt>
        <dd className="mono">{item.ownerId}</dd>
        <dt>Received</dt>
        <dd>{new Date(item.createdAt).toLocaleString()}</dd>
        {isReport(item) && item.data.targetId && (
          <>
            <dt>About member</dt>
            <dd className="mono">{item.data.targetId}</dd>
          </>
        )}
        {!isReport(item) && (
          <>
            <dt>Case</dt>
            <dd className="mono">{(item as AppealRecord).data.caseId}</dd>
          </>
        )}
      </dl>
      <p className="wrap-anywhere">{item.data.description}</p>
      {isReport(item) && item.data.evidence.length > 0 && (
        <>
          <h3>Evidence links</h3>
          <p className="field-hint">
            Submitted by the member. Open them carefully; Sparko does not check
            what they contain.
          </p>
          <ul className="plain-list">
            {item.data.evidence.map((url) => (
              <li key={url}>
                <a
                  className="text-link wrap-anywhere"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {url} <ExternalLink size={13} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {item.data.history.length > 0 && (
        <>
          <h3>Decisions</h3>
          {item.data.history.map((entry) => (
            <div className="activity-row" key={entry.at}>
              <span>
                <strong>
                  {intakeStates[entry.decision]?.label ?? entry.decision}
                </strong>
                <small>{entry.reason}</small>
              </span>
              <small className="muted">
                <span className="mono">{entry.reviewerId}</span> ·{' '}
                {new Date(entry.at).toLocaleString()}
              </small>
            </div>
          ))}
        </>
      )}
      {final.includes(item.state) ? (
        <Notice tone="info" title="This has a final decision">
          The member was notified. Decisions are kept as a permanent record.
        </Notice>
      ) : (
        <>
          <Field label="Decision" htmlFor={`decision-${item.id}`}>
            <select
              id={`decision-${item.id}`}
              value={decision}
              onChange={(event) => setDecision(event.target.value as Decision)}
            >
              {decisions
                .filter(
                  (option) =>
                    option.value !== 'investigating' ||
                    item.state !== 'investigating',
                )
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </Field>
          <Field
            label="Reason"
            htmlFor={`reason-${item.id}`}
            required
            hint="At least 3 characters. The member receives this reason."
          >
            <textarea
              id={`reason-${item.id}`}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="row">
            <Button
              disabled={reason.trim().length < 3}
              busy={decide.isPending}
              onClick={() => decide.mutate()}
            >
              Record decision
            </Button>
          </div>
          {decide.error && (
            <ErrorState
              message={
                decide.error instanceof ApiError &&
                decide.error.code === 'REVISION_CONFLICT'
                  ? 'Another reviewer acted first. Your reason is kept; the record will refresh.'
                  : errorMessage(decide.error)
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function IntakeQueue({ guildId, kind }: { guildId: string; kind: IntakeKind }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const list = useQuery({
    queryKey: ['intake', guildId, kind],
    queryFn: ({ signal }) => getIntake(guildId, kind, signal),
    refetchInterval: 15000,
  });
  if (list.isPending) return <LoadingState />;
  if (list.error)
    return (
      <ErrorState
        message={errorMessage(list.error)}
        retry={() => void list.refetch()}
      />
    );
  const rows = list.data.filter(
    (row) => filter === 'all' || !final.includes(row.state),
  );
  const current = list.data.find((row) => row.id === selected);
  return (
    <div className="overview-grid">
      <Card>
        <div className="tabs" role="group" aria-label="Show">
          {(['active', 'all'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              className={filter === option ? 'active' : ''}
              onClick={() => setFilter(option)}
            >
              {option === 'active' ? 'Needs a decision' : 'Everything'}
            </button>
          ))}
        </div>
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
                <strong className="wrap-anywhere">
                  {isReport(row) ? row.data.subject : 'Appeal'}
                </strong>
                <small>{new Date(row.createdAt).toLocaleString()}</small>
              </span>
              <Badge tone={intakeStates[row.state]?.tone ?? 'neutral'}>
                {intakeStates[row.state]?.label ?? row.state}
              </Badge>
            </button>
          ))
        ) : (
          <EmptyState
            compact
            icon={Flag}
            title={kind === 'report' ? 'No reports' : 'No appeals'}
            description={
              kind === 'report'
                ? 'Members submit private reports from their member profile.'
                : 'Members appeal their own cases from their member profile.'
            }
          />
        )}
      </Card>
      <Card>
        {current ? (
          <IntakeDetail
            key={current.id + current.revision}
            guildId={guildId}
            kind={kind}
            item={current}
          />
        ) : (
          <EmptyState
            compact
            title="Choose one to review"
            description="Read it privately and record a decision with a reason."
          />
        )}
      </Card>
    </div>
  );
}

function ReportsSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R30', ReportsConfigSchema);
  return (
    <ConfigForm
      controller={controller.shell}
      title="Reports & appeals"
      description="Members send private reports and appeal their own cases. Reviewers need the reports or appeals review permission; it grants nothing else."
      enableLabel="Accept reports and appeals"
    >
      <Card>
        <NumberField
          form={controller.form}
          name="maxOpenPerMember"
          label="Open reports or appeals per member"
          hint="Stops one member flooding the queue."
          min={1}
          max={10}
        />
      </Card>
    </ConfigForm>
  );
}

export function ReportsPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Safety"
        title="Reports & appeals"
        description="Private member reports and case appeals, each with a recorded decision and reason."
      />
      <Tabs
        tabs={[
          {
            id: 'reports',
            label: 'Reports',
            content: <IntakeQueue guildId={guildId} kind="report" />,
          },
          {
            id: 'appeals',
            label: 'Appeals',
            content: <IntakeQueue guildId={guildId} kind="appeal" />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: <ReportsSettings guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
