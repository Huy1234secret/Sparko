import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import {
  ModerationCaseSchema,
  ModerationConfigSchema,
} from '@sparko/contracts';
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
  SwitchField,
  fieldError,
  useChannels,
} from '../../features/config/fields';
import {
  addCaseNote,
  createCase,
  getCases,
  type ModerationCase,
} from '../../services/safety';
import { applyServerFieldErrors } from '../../services/formErrors';
import { ApiError, errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

type CaseInput = z.input<typeof ModerationCaseSchema>;
type Action = CaseInput['action'];
const actionLabels: Record<Action, string> = {
  warn: 'Warn',
  note: 'Private note',
  timeout: 'Timeout',
  kick: 'Kick',
  ban: 'Ban',
  unban: 'Unban',
  purge: 'Delete recent messages',
  slowmode: 'Slowmode',
  lock: 'Lock channel',
  unlock: 'Unlock channel',
};
const needsTarget: Action[] = [
  'warn',
  'timeout',
  'kick',
  'ban',
  'unban',
  'note',
];
const needsChannel: Action[] = ['purge', 'slowmode', 'lock', 'unlock'];
const needsConfirm: Action[] = ['kick', 'ban', 'lock', 'purge'];
const units = { minutes: 60, hours: 3600, days: 86400 } as const;

function NewAction({
  guildId,
  onCreated,
}: {
  guildId: string;
  onCreated: () => void;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const channels = useChannels(guildId);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<keyof typeof units>('hours');
  const form = useForm<
    CaseInput,
    unknown,
    z.output<typeof ModerationCaseSchema>
  >({
    resolver: zodResolver(ModerationCaseSchema),
    defaultValues: { action: 'warn', reason: '', confirm: false },
  });
  const action = form.watch('action');
  const setDuration = (value: string, nextUnit: keyof typeof units) => {
    const number = Number(value);
    form.setValue(
      'durationSeconds',
      value === '' || !Number.isFinite(number)
        ? undefined
        : Math.round(number * units[nextUnit]),
      { shouldDirty: true },
    );
  };
  const create = useMutation({
    mutationFn: (values: z.output<typeof ModerationCaseSchema>) => {
      const body = {
        action: values.action,
        reason: values.reason,
        confirm: values.confirm,
        ...(needsTarget.includes(values.action) && values.targetId
          ? { targetId: values.targetId }
          : {}),
        ...(needsChannel.includes(values.action) && values.channelId
          ? { channelId: values.channelId }
          : {}),
        ...(['timeout', 'ban', 'lock'].includes(values.action) &&
        values.durationSeconds
          ? { durationSeconds: values.durationSeconds }
          : {}),
        ...(values.action === 'purge' && values.count
          ? { count: values.count }
          : {}),
        ...(values.action === 'slowmode'
          ? { slowmodeSeconds: values.slowmodeSeconds }
          : {}),
      };
      return createCase(guildId, body, identity('case', body));
    },
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: () => {
      form.reset({ action: 'warn', reason: '', confirm: false });
      setAmount('');
      void queryClient.invalidateQueries({ queryKey: ['cases', guildId] });
      onCreated();
    },
  });
  const errors = form.formState.errors;
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <Card>
        <Field label="Action" htmlFor="case-action">
          <select id="case-action" {...form.register('action')}>
            {(Object.keys(actionLabels) as Action[]).map((value) => (
              <option key={value} value={value}>
                {actionLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        {needsTarget.includes(action) && (
          <Field
            label="Member ID"
            htmlFor="case-target"
            hint="Right-click the member in Discord and choose Copy User ID."
            error={errors.targetId?.message}
          >
            <Input
              id="case-target"
              inputMode="numeric"
              {...form.register('targetId', {
                setValueAs: (value: string) => value.trim() || undefined,
              })}
            />
          </Field>
        )}
        {needsChannel.includes(action) && (
          <Field
            label="Channel"
            htmlFor="case-channel"
            error={errors.channelId?.message}
          >
            <select
              id="case-channel"
              {...form.register('channelId', {
                setValueAs: (value: string) => value || undefined,
              })}
            >
              <option value="">Choose a channel</option>
              {channels.data
                ?.filter((channel) => [0, 5].includes(channel.type))
                .map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    # {channel.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {['timeout', 'ban', 'lock'].includes(action) && (
          <div className="form-grid">
            <Field
              label={action === 'timeout' ? 'Duration' : 'Duration (optional)'}
              htmlFor="case-duration"
              hint={
                action === 'timeout'
                  ? 'Discord allows timeouts of up to 28 days.'
                  : 'Leave empty to keep it in place until a moderator reverses it.'
              }
              error={errors.durationSeconds?.message}
            >
              <Input
                id="case-duration"
                type="number"
                min={1}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setDuration(event.target.value, unit);
                }}
              />
            </Field>
            <Field label="Unit" htmlFor="case-unit">
              <select
                id="case-unit"
                value={unit}
                onChange={(event) => {
                  const next = event.target.value as keyof typeof units;
                  setUnit(next);
                  setDuration(amount, next);
                }}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </Field>
          </div>
        )}
        {action === 'purge' && (
          <Field
            label="Messages to delete"
            htmlFor="case-count"
            hint="Up to 100 of the most recent messages; Discord only bulk-deletes messages under 14 days old."
            error={errors.count?.message}
          >
            <Input
              id="case-count"
              type="number"
              min={1}
              max={100}
              {...form.register('count', {
                setValueAs: (value: string) =>
                  value === '' ? undefined : Number(value),
              })}
            />
          </Field>
        )}
        {action === 'slowmode' && (
          <Field
            label="Seconds between messages"
            htmlFor="case-slowmode"
            hint="0 turns slowmode off."
            error={errors.slowmodeSeconds?.message}
          >
            <Input
              id="case-slowmode"
              type="number"
              min={0}
              max={21600}
              {...form.register('slowmodeSeconds', {
                setValueAs: (value: string) =>
                  value === '' ? undefined : Number(value),
              })}
            />
          </Field>
        )}
        <Field
          label="Reason"
          htmlFor="case-reason"
          hint="Recorded on the case and in Discord’s audit log."
          error={errors.reason?.message}
        >
          <textarea
            id="case-reason"
            maxLength={1000}
            {...form.register('reason')}
          />
        </Field>
        {needsConfirm.includes(action) && (
          <label className="checkbox-row">
            <input type="checkbox" {...form.register('confirm')} />
            <span>
              I understand this {actionLabels[action].toLowerCase()} takes
              effect in Discord immediately.
            </span>
          </label>
        )}
        {errors.confirm?.message && (
          <p className="field-error" role="alert">
            {errors.confirm.message}
          </p>
        )}
      </Card>
      {create.error && <ErrorState message={errorMessage(create.error)} />}
      <div className="save-bar">
        <span>
          Sparko rechecks your current permissions and role position when it
          carries this out.
        </span>
        <Button type="submit" busy={create.isPending}>
          {action === 'note'
            ? 'Add note'
            : `Record ${actionLabels[action].toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}

function deliveryTone(item: ModerationCase) {
  return item.deliveryStatus === 'applied'
    ? 'success'
    : ['blocked', 'failed', 'dead'].includes(item.deliveryStatus)
      ? 'danger'
      : 'warning';
}
const deliveryText: Record<string, string> = {
  applied: 'Done in Discord',
  pending: 'Waiting for Discord',
  retry: 'Retrying',
  running: 'In progress',
  blocked: 'Blocked',
  failed: 'Failed',
  unknown: 'Outcome unknown',
};

function CaseDetail({
  guildId,
  item,
}: {
  guildId: string;
  item: ModerationCase;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const note = useMutation({
    mutationFn: () => {
      const body = { text: text.trim(), expectedRevision: item.revision };
      return addCaseNote(
        guildId,
        item.id,
        body,
        identity('case-note', { id: item.id, body }),
      );
    },
    onSuccess: () => {
      setText('');
      void queryClient.invalidateQueries({ queryKey: ['cases', guildId] });
    },
  });
  const data = item.data;
  return (
    <div className="stack">
      <div className="section-heading">
        <h2>
          Case #{data.number} ·{' '}
          {actionLabels[data.action as Action] ?? data.action}
        </h2>
        <Badge tone={deliveryTone(item)}>
          {deliveryText[item.deliveryStatus] ?? item.deliveryStatus}
        </Badge>
      </div>
      {item.deliveryError && (
        <div className="alert alert-danger" role="alert">
          <p>{item.deliveryError}</p>
        </div>
      )}
      <dl className="detail-list">
        {data.targetId && (
          <>
            <dt>Member</dt>
            <dd>{data.targetId}</dd>
          </>
        )}
        {data.channelId && (
          <>
            <dt>Channel</dt>
            <dd>{data.channelId}</dd>
          </>
        )}
        <dt>Reason</dt>
        <dd>{data.reason}</dd>
        <dt>Moderator</dt>
        <dd>{data.actorId}</dd>
        <dt>Requested</dt>
        <dd>{new Date(data.requestedAt).toLocaleString()}</dd>
        {data.durationSeconds && (
          <>
            <dt>Ends</dt>
            <dd>
              {new Date(
                Date.parse(data.requestedAt) + data.durationSeconds * 1000,
              ).toLocaleString()}
              {item.state === 'expired'
                ? ' (ended)'
                : item.state === 'superseded'
                  ? ' (replaced by a later action)'
                  : ''}
            </dd>
          </>
        )}
      </dl>
      <h3>Notes</h3>
      {data.notes.length ? (
        data.notes.map((entry) => (
          <div className="activity-row" key={entry.at}>
            <span>
              <strong>{entry.text}</strong>
              <small>{entry.actorId}</small>
            </span>
            <small className="muted">
              {new Date(entry.at).toLocaleString()}
            </small>
          </div>
        ))
      ) : (
        <p className="muted">No notes yet.</p>
      )}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim().length >= 3) note.mutate();
        }}
      >
        <Field label="Add a note" htmlFor="case-note">
          <textarea
            id="case-note"
            value={text}
            maxLength={1000}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        {note.error && (
          <ErrorState
            message={
              note.error instanceof ApiError &&
              note.error.code === 'REVISION_CONFLICT'
                ? 'This case changed. Your note is kept; reload the case and add it again.'
                : errorMessage(note.error)
            }
          />
        )}
        <Button
          type="submit"
          variant="secondary"
          disabled={text.trim().length < 3}
          busy={note.isPending}
        >
          Add note
        </Button>
      </form>
    </div>
  );
}

function CaseList({ guildId }: { guildId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const cases = useQuery({
    queryKey: ['cases', guildId],
    queryFn: ({ signal }) => getCases(guildId, signal),
    refetchInterval: 5000,
  });
  if (cases.isPending) return <LoadingState />;
  if (cases.error)
    return (
      <ErrorState
        message={errorMessage(cases.error)}
        retry={() => void cases.refetch()}
      />
    );
  const term = search.trim();
  const rows = cases.data.filter(
    (row) =>
      !term ||
      String(row.data.number) === term.replace('#', '') ||
      row.data.targetId === term ||
      row.data.reason.toLowerCase().includes(term.toLowerCase()),
  );
  const current = cases.data.find((row) => row.id === selected);
  return (
    <div className="overview-grid">
      <Card>
        <Field
          label="Find a case"
          htmlFor="case-search"
          hint="Case number, member ID or words from the reason."
        >
          <Input
            id="case-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
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
                <strong>
                  #{row.data.number}{' '}
                  {actionLabels[row.data.action as Action] ?? row.data.action}
                </strong>
                <small>
                  {row.data.targetId ?? row.data.channelId ?? ''} ·{' '}
                  {row.data.reason.slice(0, 60)}
                </small>
              </span>
              <Badge tone={deliveryTone(row)}>
                {deliveryText[row.deliveryStatus] ?? row.deliveryStatus}
              </Badge>
            </button>
          ))
        ) : (
          <EmptyState
            title="No cases"
            description="Recorded actions appear here."
          />
        )}
      </Card>
      <Card>
        {current ? (
          <CaseDetail
            key={current.id + current.revision}
            guildId={guildId}
            item={current}
          />
        ) : (
          <EmptyState
            title="Choose a case"
            description="See what happened in Discord and add notes."
          />
        )}
      </Card>
    </div>
  );
}

function ModerationSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R26', ModerationConfigSchema);
  return (
    <ConfigForm
      controller={controller.shell}
      title="Moderation"
      enableLabel="Allow moderation cases"
    >
      <Card>
        <SwitchField
          form={controller.form}
          name="notificationDm"
          label="Message members about actions taken against them"
          hint="A refused DM is recorded; it never undoes the action."
        />
      </Card>
    </ConfigForm>
  );
}

export function ModerationPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Safety"
        title="Every action, on the record."
        description="Numbered cases with reasons. Sparko rechecks permissions and role position before it acts, and reports what Discord actually did."
      />
      <Tabs
        tabs={[
          {
            id: 'cases',
            label: 'Cases',
            content: <CaseList guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New action',
            content: (
              <NewAction
                guildId={guildId}
                onCreated={() => setParams({ tab: 'cases' }, { replace: true })}
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: <ModerationSettings guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
