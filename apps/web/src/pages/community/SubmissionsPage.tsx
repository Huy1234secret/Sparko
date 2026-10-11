import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SubmissionConfigSchema } from '@sparko/messages/community-contracts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { ConfigForm } from '../../features/config/ConfigForm';
import { Tabs } from '../../features/config/Tabs';
import {
  ChannelField,
  RoleChecklist,
  SwitchField,
} from '../../features/config/fields';
import {
  getSubmissions,
  submissionAction,
  type Submission,
  type SubmissionKind,
} from '../../services/community';
import { ApiError, errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

const copy = {
  suggestions: {
    feature: 'R34',
    eyebrow: 'Community',
    title: 'Good ideas deserve an answer.',
    description:
      'Review member suggestions, record a decision with a reason, and keep the history.',
    noun: 'suggestion',
  },
  questions: {
    feature: 'R35',
    eyebrow: 'Community',
    title: 'Every question, answered.',
    description:
      'Answer member questions privately or publicly. The author marks the answer that helped.',
    noun: 'question',
  },
} as const;

function Review({
  guildId,
  kind,
  item,
}: {
  guildId: string;
  kind: SubmissionKind;
  item: Submission;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'accepted' | 'planned' | 'rejected'>(
    'accepted',
  );
  const [text, setText] = useState('');
  const [discussionUrl, setDiscussionUrl] = useState('');
  const urlValid =
    !discussionUrl || discussionUrl.startsWith('https://discord.com/channels/');
  const act = useMutation({
    mutationFn: () => {
      const body =
        kind === 'suggestions'
          ? {
              expectedRevision: item.revision,
              status,
              reason: text.trim(),
              ...(discussionUrl ? { discussionUrl } : {}),
            }
          : { expectedRevision: item.revision, answer: text.trim() };
      return submissionAction(
        guildId,
        kind,
        item.id,
        kind === 'suggestions' ? 'decision' : 'answer',
        body,
        identity('review', { id: item.id, body }),
      );
    },
    onSuccess: () => {
      setText('');
      setDiscussionUrl('');
      void queryClient.invalidateQueries({ queryKey: [kind, guildId] });
    },
  });
  const conflict =
    act.error instanceof ApiError && act.error.code === 'REVISION_CONFLICT';
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <p>{item.data.content}</p>
          <small className="muted">
            From {item.ownerId} · {item.data.visibility} ·{' '}
            {new Date(item.createdAt).toLocaleString()}
          </small>
        </div>
        <Badge tone="neutral">{item.state}</Badge>
      </div>
      {item.votes && (
        <p className="field-hint">
          {item.votes.positive} for · {item.votes.negative} against · score{' '}
          {item.votes.score}
        </p>
      )}
      {item.data.decisions.map((decision) => (
        <div className="activity-row" key={decision.at}>
          <span>
            <strong>{decision.status}</strong>
            <small>{decision.reason}</small>
          </span>
          <small className="muted">
            {decision.actorId} · {new Date(decision.at).toLocaleString()}
          </small>
        </div>
      ))}
      {item.data.answers.map((answer) => (
        <div className="activity-row" key={answer.at}>
          <span>
            <strong>Answer</strong>
            <small>{answer.content}</small>
          </span>
          <small className="muted">
            {answer.authorId} · {new Date(answer.at).toLocaleString()}
          </small>
        </div>
      ))}
      {item.state === 'resolved' ? (
        <p role="status">The author accepted an answer.</p>
      ) : (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim() && urlValid) act.mutate();
          }}
        >
          {kind === 'suggestions' && (
            <Field label="Decision" htmlFor="decision-status">
              <select
                id="decision-status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as typeof status)
                }
              >
                <option value="accepted">Accept</option>
                <option value="planned">Plan</option>
                <option value="rejected">Decline</option>
              </select>
            </Field>
          )}
          <Field
            label={kind === 'suggestions' ? 'Reason' : 'Answer'}
            htmlFor="review-text"
            hint={
              kind === 'suggestions'
                ? 'Members see this reason with the decision.'
                : undefined
            }
          >
            <textarea
              id="review-text"
              value={text}
              maxLength={kind === 'suggestions' ? 2000 : 4000}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          {kind === 'suggestions' && (
            <Field
              label="Discussion link (optional)"
              htmlFor="decision-url"
              error={
                urlValid
                  ? undefined
                  : 'Use a link to a Discord message or channel.'
              }
            >
              <Input
                id="decision-url"
                type="url"
                value={discussionUrl}
                onChange={(event) =>
                  setDiscussionUrl(event.target.value.trim())
                }
              />
            </Field>
          )}
          {conflict ? (
            <div className="alert alert-warning" role="alert">
              <div>
                <strong>
                  Someone else updated this{' '}
                  {kind === 'suggestions' ? 'suggestion' : 'question'}.
                </strong>
                <p>
                  Your text is kept. Reload to see the latest state, then submit
                  again.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    act.reset();
                    void queryClient.invalidateQueries({
                      queryKey: [kind, guildId],
                    });
                  }}
                >
                  Reload
                </Button>
              </div>
            </div>
          ) : (
            act.error && <ErrorState message={errorMessage(act.error)} />
          )}
          <Button
            type="submit"
            disabled={!text.trim() || !urlValid}
            busy={act.isPending}
          >
            {kind === 'suggestions' ? 'Record decision' : 'Send answer'}
          </Button>
        </form>
      )}
    </div>
  );
}

function Queue({ guildId, kind }: { guildId: string; kind: SubmissionKind }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('open');
  const list = useQuery({
    queryKey: [kind, guildId, 'manage'],
    queryFn: ({ signal }) => getSubmissions(guildId, kind, true, signal),
  });
  if (list.isPending) return <LoadingState />;
  if (list.error)
    return (
      <ErrorState
        message={errorMessage(list.error)}
        retry={() => void list.refetch()}
      />
    );
  const rows = list.data.filter((row) =>
    filter === 'all'
      ? true
      : filter === 'open'
        ? ['active', 'open', 'pending'].includes(row.state)
        : row.state === filter,
  );
  const current = list.data.find((row) => row.id === selected);
  return (
    <div className="overview-grid">
      <Card>
        <Field label="Show" htmlFor="queue-filter">
          <select
            id="queue-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="open">Waiting for staff</option>
            {kind === 'suggestions' ? (
              <>
                <option value="accepted">Accepted</option>
                <option value="planned">Planned</option>
                <option value="rejected">Declined</option>
              </>
            ) : (
              <>
                <option value="answered">Answered</option>
                <option value="resolved">Resolved</option>
              </>
            )}
            <option value="all">Everything</option>
          </select>
        </Field>
        {rows.length ? (
          rows.map((row) => (
            <button
              type="button"
              className="activity-row button-reset"
              key={row.id}
              aria-pressed={selected === row.id}
              onClick={() => setSelected(row.id)}
            >
              <span>
                <strong>{row.data.content.slice(0, 90)}</strong>
                <small>
                  {row.data.visibility} ·{' '}
                  {new Date(row.createdAt).toLocaleDateString()}
                  {row.votes ? ` · score ${row.votes.score}` : ''}
                </small>
              </span>
              <Badge tone="neutral">{row.state}</Badge>
            </button>
          ))
        ) : (
          <EmptyState
            title="Nothing here"
            description="New submissions appear as members send them."
          />
        )}
      </Card>
      <Card>
        {current ? (
          <Review
            key={current.id + current.revision}
            guildId={guildId}
            kind={kind}
            item={current}
          />
        ) : (
          <EmptyState
            title="Choose an item"
            description="Review it, then record a decision or answer."
          />
        )}
      </Card>
    </div>
  );
}

function SubmissionSettings({
  guildId,
  kind,
}: {
  guildId: string;
  kind: SubmissionKind;
}) {
  const controller = useFeatureConfig(
    guildId,
    copy[kind].feature,
    SubmissionConfigSchema,
  );
  const { form } = controller;
  return (
    <ConfigForm
      controller={controller.shell}
      title="Settings"
      description="Submissions are private by default: only the author and staff can see them."
      enableLabel={
        kind === 'suggestions' ? 'Accept suggestions' : 'Accept questions'
      }
    >
      <Card>
        <ChannelField
          form={form}
          name="channelId"
          label="Post public submissions in"
          guildId={guildId}
          placeholder="Do not post in Discord"
        />
        <SwitchField
          form={form}
          name="public"
          label="Let members submit publicly"
          hint="Public items are visible to every member in the portal."
        />
        {kind === 'suggestions' && (
          <SwitchField
            form={form}
            name="decisionDm"
            label="Message the author when a decision is made"
          />
        )}
        <RoleChecklist
          form={form}
          name="requiredRoleIds"
          label="Only members with one of these roles can submit"
          guildId={guildId}
        />
      </Card>
    </ConfigForm>
  );
}

export function SubmissionsPage({ kind }: { kind: SubmissionKind }) {
  const { guildId = '' } = useParams();
  const text = copy[kind];
  return (
    <>
      <PageHeading
        eyebrow={text.eyebrow}
        title={text.title}
        description={text.description}
      />
      <Tabs
        tabs={[
          {
            id: 'queue',
            label: 'Staff queue',
            content: <Queue guildId={guildId} kind={kind} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: <SubmissionSettings guildId={guildId} kind={kind} />,
          },
        ]}
      />
    </>
  );
}
