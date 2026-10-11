import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { CrateConfigSchema } from '@sparko/messages/community-contracts';
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
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { ConfigForm } from '../../features/config/ConfigForm';
import { Tabs } from '../../features/config/Tabs';
import { DeliveryState } from '../../features/config/DeliveryState';
import {
  ChannelChecklist,
  ChannelField,
  NumberField,
  RoleChecklist,
  SelectField,
  fieldError,
  useChannels,
} from '../../features/config/fields';
import {
  cancelCrateSchedule,
  createCrateSchedule,
  dropCrate,
  getCrateHistory,
  getCrateSchedules,
} from '../../services/community';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

function CrateSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R10', CrateConfigSchema);
  const { form } = controller;
  const types = useFieldArray({ control: form.control, name: 'types' });
  const weights = form.watch('types') ?? [];
  const total = weights.reduce(
    (sum, type) => sum + (Number(type?.weight) > 0 ? Number(type.weight) : 0),
    0,
  );
  return (
    <ConfigForm
      controller={controller.shell}
      title="XP crates"
      description="Crates drop into a channel; the first members to claim them earn XP. Claims and rewards are recorded together, so a crate can never pay twice."
      enableLabel="Drop XP crates"
    >
      <Card>
        <h2>Where crates appear</h2>
        <ChannelField
          form={form}
          name="channelId"
          label="Drop channel"
          guildId={guildId}
        />
        <ChannelChecklist
          form={form}
          name="fallbackChannelIds"
          label="Fallback channels"
          hint="Used in order when Sparko cannot post in the drop channel."
          guildId={guildId}
        />
        <SelectField
          form={form}
          name="failurePolicy"
          label="If no channel is usable"
          options={[
            { value: 'retry', label: 'Retry the drop later' },
            { value: 'skip', label: 'Skip this drop and record why' },
          ]}
        />
      </Card>
      <Card>
        <h2>Timing and limits</h2>
        <div className="form-grid">
          <NumberField
            form={form}
            name="durationSeconds"
            label="Open for"
            unit="seconds"
            min={30}
          />
          <NumberField
            form={form}
            name="capacity"
            label="Claims per crate"
            min={1}
            max={1000}
          />
          <NumberField
            form={form}
            name="intervalSeconds"
            label="Default schedule interval"
            unit="seconds"
            min={60}
          />
          <NumberField
            form={form}
            name="repeatCooldownSeconds"
            label="Member cooldown between claims"
            unit="seconds"
            min={0}
          />
        </div>
        <RoleChecklist
          form={form}
          name="excludedRoleIds"
          label="Roles that cannot claim"
          guildId={guildId}
        />
      </Card>
      <Card>
        <h2>Crate types</h2>
        <p className="muted">
          Each drop picks a type at random by weight. The chance shown is exact
          for the saved weights.
        </p>
        {types.fields.map((item, index) => {
          const weight = Number(weights[index]?.weight) || 0;
          return (
            <fieldset className="stack" key={item.id}>
              <legend>
                {weights[index]?.name || `Type ${index + 1}`} ·{' '}
                {total ? ((weight / total) * 100).toFixed(1) : '0'}% chance
              </legend>
              <div className="form-grid">
                <Field
                  label="Name"
                  htmlFor={`crate-name-${index}`}
                  error={fieldError(form as never, `types.${index}.name`)}
                >
                  <Input
                    id={`crate-name-${index}`}
                    {...form.register(`types.${index}.name`)}
                  />
                </Field>
                <Field
                  label="Identifier"
                  htmlFor={`crate-id-${index}`}
                  hint="Lowercase letters, digits and hyphens."
                  error={fieldError(form as never, `types.${index}.id`)}
                >
                  <Input
                    id={`crate-id-${index}`}
                    {...form.register(`types.${index}.id`)}
                  />
                </Field>
                <NumberField
                  form={form}
                  name={`types.${index}.weight`}
                  label="Weight"
                  min={1}
                />
                <NumberField
                  form={form}
                  name={`types.${index}.minXp`}
                  label="Minimum XP"
                  min={0}
                />
                <NumberField
                  form={form}
                  name={`types.${index}.maxXp`}
                  label="Maximum XP"
                  min={0}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={types.fields.length <= 1}
                onClick={() => types.remove(index)}
              >
                <Trash2 size={16} /> Remove type
              </Button>
            </fieldset>
          );
        })}
        {fieldError(form as never, 'types') && (
          <p className="field-error" role="alert">
            {fieldError(form as never, 'types')}
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={types.fields.length >= 30}
          onClick={() =>
            types.append({
              id: `crate-${types.fields.length + 1}`,
              name: 'New crate',
              weight: 1,
              minXp: 10,
              maxXp: 30,
            })
          }
        >
          <Plus size={16} /> Add crate type
        </Button>
      </Card>
    </ConfigForm>
  );
}

function Drops({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const channels = useChannels(guildId);
  const [channelId, setChannelId] = useState('');
  // A retry of the same attempt reuses its key; a successful drop starts a new one.
  const [round, setRound] = useState(0);
  const history = useQuery({
    queryKey: ['crates', guildId, 'history'],
    queryFn: ({ signal }) => getCrateHistory(guildId, signal),
    refetchInterval: 5000,
  });
  const drop = useMutation({
    mutationFn: (preview: boolean) => {
      const body = { channelId: channelId || undefined, preview };
      return dropCrate(
        guildId,
        body,
        identity('crate-drop', { ...body, round }),
      );
    },
    onSuccess: () => {
      setRound((value) => value + 1);
      void queryClient.invalidateQueries({ queryKey: ['crates', guildId] });
    },
  });
  const channelName = (id: string) =>
    channels.data?.find((channel) => channel.id === id)?.name ?? id;
  return (
    <div className="stack">
      <Card>
        <h2>Drop a crate now</h2>
        <p className="muted">
          A preview posts the real message but grants no XP and cannot be
          claimed.
        </p>
        <Field
          label="Channel"
          htmlFor="drop-channel"
          hint="Leave empty to use the configured drop channel."
        >
          <select
            id="drop-channel"
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
          >
            <option value="">Configured drop channel</option>
            {channels.data
              ?.filter((channel) => [0, 5].includes(channel.type))
              .map((channel) => (
                <option key={channel.id} value={channel.id}>
                  # {channel.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="row">
          <Button
            type="button"
            variant="secondary"
            busy={drop.isPending && drop.variables === true}
            onClick={() => drop.mutate(true)}
          >
            Send zero-reward preview
          </Button>
          <Button
            type="button"
            busy={drop.isPending && drop.variables === false}
            onClick={() => drop.mutate(false)}
          >
            Drop crate
          </Button>
        </div>
        {drop.error && <ErrorState message={errorMessage(drop.error)} />}
        {drop.isSuccess && (
          <p role="status">Crate saved. Waiting for Discord to post it.</p>
        )}
      </Card>
      <Card>
        <h2>Recent drops</h2>
        {history.isPending ? (
          <LoadingState />
        ) : history.error ? (
          <ErrorState
            message={errorMessage(history.error)}
            retry={() => void history.refetch()}
          />
        ) : history.data.drops.length ? (
          history.data.drops.map((row) => (
            <div className="activity-row" key={row.id}>
              <span>
                <strong>
                  {row.data.preview ? 'Preview · ' : ''}
                  {row.data.type.name} in #{channelName(row.data.channelId)}
                </strong>
                <small>
                  {row.data.claims}/{row.data.capacity} claimed ·{' '}
                  {new Date(row.createdAt).toLocaleString()}
                </small>
              </span>
              <DeliveryState state={row.state} error={row.data.deliveryError} />
            </div>
          ))
        ) : (
          <EmptyState
            title="No crates yet"
            description="Drops appear here with their delivery state."
          />
        )}
      </Card>
      {history.data && history.data.claims.length > 0 && (
        <Card>
          <h2>Recent claims</h2>
          {history.data.claims.map((claim) => (
            <div className="activity-row" key={claim.id}>
              <span>
                <strong>{claim.data.userId}</strong>
                <small>{new Date(claim.data.claimedAt).toLocaleString()}</small>
              </span>
              <span>+{claim.data.xp} XP</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/** `datetime-local` value in the browser's zone, as a UTC instant. */
function localToIso(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function Schedules({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const channels = useChannels(guildId);
  const [channelId, setChannelId] = useState('');
  const [firstRun, setFirstRun] = useState('');
  const [interval, setIntervalValue] = useState('3600');
  const [missed, setMissed] = useState<'skip' | 'run-once'>('skip');
  const schedules = useQuery({
    queryKey: ['crates', guildId, 'schedules'],
    queryFn: ({ signal }) => getCrateSchedules(guildId, signal),
  });
  const firstRunAt = localToIso(firstRun);
  const seconds = Number(interval);
  const valid =
    !!channelId &&
    !!firstRunAt &&
    Date.parse(firstRunAt) > Date.now() &&
    Number.isInteger(seconds) &&
    seconds >= 60 &&
    seconds <= 2_592_000;
  const create = useMutation({
    mutationFn: () => {
      const body = {
        channelId,
        firstRunAt: firstRunAt ?? '',
        intervalSeconds: seconds,
        missedRunPolicy: missed,
      };
      return createCrateSchedule(
        guildId,
        body,
        identity('crate-schedule', body),
      );
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['crates', guildId, 'schedules'],
      }),
  });
  const cancel = useMutation({
    mutationFn: (row: { id: string; revision: number }) =>
      cancelCrateSchedule(
        guildId,
        row.id,
        row.revision,
        identity('crate-cancel', row),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['crates', guildId, 'schedules'],
      }),
  });
  return (
    <div className="overview-grid">
      <Card>
        <h2>New schedule</h2>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <Field label="Channel" htmlFor="schedule-channel">
            <select
              id="schedule-channel"
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
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
          <Field
            label="First drop"
            htmlFor="schedule-first"
            hint={`Your local time (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Stored in UTC.`}
            error={
              firstRun && firstRunAt && Date.parse(firstRunAt) <= Date.now()
                ? 'Choose a time in the future.'
                : undefined
            }
          >
            <Input
              id="schedule-first"
              type="datetime-local"
              value={firstRun}
              onChange={(event) => setFirstRun(event.target.value)}
            />
          </Field>
          <Field
            label="Repeat every (seconds)"
            htmlFor="schedule-interval"
            hint="Between 60 seconds and 30 days."
          >
            <Input
              id="schedule-interval"
              type="number"
              min={60}
              value={interval}
              onChange={(event) => setIntervalValue(event.target.value)}
            />
          </Field>
          <Field
            label="If Sparko was offline at a drop time"
            htmlFor="schedule-missed"
          >
            <select
              id="schedule-missed"
              value={missed}
              onChange={(event) =>
                setMissed(event.target.value as 'skip' | 'run-once')
              }
            >
              <option value="skip">Skip missed drops</option>
              <option value="run-once">Run one catch-up drop</option>
            </select>
          </Field>
          <Button type="submit" disabled={!valid} busy={create.isPending}>
            Create schedule
          </Button>
          {create.error && <ErrorState message={errorMessage(create.error)} />}
        </form>
      </Card>
      <Card>
        <h2>Schedules</h2>
        {schedules.isPending ? (
          <LoadingState />
        ) : schedules.error ? (
          <ErrorState message={errorMessage(schedules.error)} />
        ) : schedules.data.length ? (
          schedules.data.map((row) => (
            <div className="activity-row" key={row.id}>
              <span>
                <strong>
                  Every {Math.round(row.data.intervalSeconds / 60)} min
                </strong>
                <small>
                  From {new Date(row.data.firstRunAt).toLocaleString()} ·{' '}
                  {row.data.missedRunPolicy === 'skip'
                    ? 'skips missed drops'
                    : 'one catch-up drop'}
                </small>
              </span>
              {row.state === 'cancelled' ? (
                <DeliveryState state="cancelled" />
              ) : (
                <Button
                  variant="secondary"
                  busy={cancel.isPending && cancel.variables?.id === row.id}
                  onClick={() =>
                    cancel.mutate({ id: row.id, revision: row.revision })
                  }
                >
                  Cancel
                </Button>
              )}
            </div>
          ))
        ) : (
          <EmptyState
            title="No schedules"
            description="Create one to drop crates automatically."
          />
        )}
        {cancel.error && <ErrorState message={errorMessage(cancel.error)} />}
      </Card>
    </div>
  );
}

export function CratesPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="XP crates"
        description="Configure crate rewards, drop them by hand or on a schedule, and see exactly what was claimed."
      />
      <Tabs
        tabs={[
          {
            id: 'settings',
            label: 'Settings',
            content: <CrateSettings guildId={guildId} />,
          },
          { id: 'drops', label: 'Drops', content: <Drops guildId={guildId} /> },
          {
            id: 'schedules',
            label: 'Schedules',
            content: <Schedules guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
