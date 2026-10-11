import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { CountingConfigSchema } from '@sparko/messages/community-contracts';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { Metric } from '../../components/AppShell';
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { ConfigForm } from '../../features/config/ConfigForm';
import { Tabs } from '../../features/config/Tabs';
import {
  ChannelField,
  DocumentField,
  NumberField,
  SelectField,
  SwitchField,
  useChannels,
} from '../../features/config/fields';
import {
  getCounting,
  getCountingResets,
  resetCounting,
} from '../../services/community';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

function CountingSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R15', CountingConfigSchema);
  const { form } = controller;
  const milestones = useFieldArray({
    control: form.control,
    name: 'milestones',
  });
  return (
    <ConfigForm
      controller={controller.shell}
      title="Counting"
      description="Members count up one number at a time. Only whole numbers count; Sparko never evaluates expressions."
      enableLabel="Run the counting channel"
    >
      <Card>
        <ChannelField
          form={form}
          name="channelId"
          label="Counting channel"
          guildId={guildId}
        />
        <div className="form-grid">
          <NumberField
            form={form}
            name="startingValue"
            label="Start from"
            min={0}
          />
          <NumberField
            form={form}
            name="cooldownSeconds"
            label="Member cooldown"
            unit="seconds"
            min={0}
          />
        </div>
        <SwitchField
          form={form}
          name="allowConsecutive"
          label="Allow the same member twice in a row"
        />
        <SelectField
          form={form}
          name="failurePolicy"
          label="When someone sends the wrong number"
          options={[
            { value: 'reset', label: 'Reset the count' },
            { value: 'ignore', label: 'Ignore the message' },
          ]}
        />
        <DocumentField
          form={form}
          name="resetDocument"
          label="Message after a reset"
          guildId={guildId}
        />
      </Card>
      <Card>
        <h2>Milestone rewards</h2>
        <p className="muted">
          The member who reaches a milestone earns XP once per run.
        </p>
        {milestones.fields.map((item, index) => (
          <div className="repeat-row" key={item.id}>
            <NumberField
              form={form}
              name={`milestones.${index}.value`}
              label="At number"
              min={1}
            />
            <NumberField
              form={form}
              name={`milestones.${index}.xp`}
              label="XP reward"
              min={0}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label="Remove milestone"
              onClick={() => milestones.remove(index)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={milestones.fields.length >= 100}
          onClick={() => milestones.append({ value: 100, xp: 50 })}
        >
          <Plus size={16} /> Add milestone
        </Button>
      </Card>
    </ConfigForm>
  );
}

function CountingStatus({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const channels = useChannels(guildId);
  const [target, setTarget] = useState<{
    channelId: string;
    revision: number;
  } | null>(null);
  const [reason, setReason] = useState('');
  const status = useQuery({
    queryKey: ['counting', guildId],
    queryFn: ({ signal }) => getCounting(guildId, signal),
    refetchInterval: 10000,
  });
  const resets = useQuery({
    queryKey: ['counting', guildId, 'resets'],
    queryFn: ({ signal }) => getCountingResets(guildId, signal),
  });
  const reset = useMutation({
    mutationFn: () => {
      const body = {
        channelId: target?.channelId ?? '',
        expectedRevision: target?.revision ?? 0,
        reason: reason.trim(),
      };
      return resetCounting(guildId, body, identity('counting-reset', body));
    },
    onSuccess: () => {
      setTarget(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['counting', guildId] });
    },
  });
  const name = (id: string) =>
    channels.data?.find((channel) => channel.id === id)?.name ?? id;
  if (status.isPending) return <LoadingState />;
  if (status.error)
    return (
      <ErrorState
        message={errorMessage(status.error)}
        retry={() => void status.refetch()}
      />
    );
  return (
    <div className="stack">
      {status.data.channels.length ? (
        status.data.channels.map((row) => (
          <Card key={row.id}>
            <div className="section-heading">
              <h2>#{name(row.key)}</h2>
              <Button
                variant="danger"
                onClick={() => {
                  reset.reset();
                  setTarget({ channelId: row.key, revision: row.revision });
                }}
              >
                Reset count
              </Button>
            </div>
            <div className="metric-grid">
              <Metric
                label="Current number"
                value={row.data.value.toLocaleString()}
                detail="Last accepted count"
              />
              <Metric
                label="Streak"
                value={row.data.streak.toLocaleString()}
                detail="Correct counts this run"
              />
              <Metric
                label="Best"
                value={row.data.best.toLocaleString()}
                detail="Longest run so far"
              />
            </div>
            <p className="field-hint">
              Run {row.data.run}
              {row.data.lastAcceptedAt
                ? ` · last count ${new Date(row.data.lastAcceptedAt).toLocaleString()}`
                : ''}
            </p>
          </Card>
        ))
      ) : (
        <EmptyState
          title="No counts yet"
          description="State appears after the first number is counted in the configured channel."
        />
      )}
      <Card>
        <h2>Reset history</h2>
        {resets.data?.length ? (
          resets.data.map((row) => (
            <div className="activity-row" key={row.id}>
              <span>
                <strong>#{name(row.data.channelId)}</strong>
                <small>{row.data.reason}</small>
              </span>
              <small className="muted">
                {new Date(row.createdAt).toLocaleString()} by {row.data.actorId}
              </small>
            </div>
          ))
        ) : (
          <p className="muted">No manual resets.</p>
        )}
      </Card>
      <Dialog.Root
        open={!!target}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Reset this count?</Dialog.Title>
            <Dialog.Description>
              The count returns to the configured starting number and a new run
              begins. The previous state and your reason are kept in history.
            </Dialog.Description>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim()) reset.mutate();
              }}
            >
              <Field label="Reason" htmlFor="counting-reason">
                <textarea
                  id="counting-reason"
                  value={reason}
                  maxLength={1000}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              {reset.error && (
                <ErrorState message={errorMessage(reset.error)} />
              )}
              <div className="row">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">
                    Keep counting
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={!reason.trim()}
                  busy={reset.isPending}
                >
                  Reset count
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export function CountingPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Counting"
        description="Set the rules for your counting channel and watch its progress."
      />
      <Tabs
        tabs={[
          {
            id: 'status',
            label: 'Status',
            content: <CountingStatus guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: <CountingSettings guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
