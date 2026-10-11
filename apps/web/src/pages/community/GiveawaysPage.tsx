import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  EligibilitySchema,
  GiveawayConfigSchema,
} from '@sparko/messages/community-contracts';
import { MessageDocumentSchema } from '@sparko/messages';
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
import { DeliveryState } from '../../features/config/DeliveryState';
import {
  ChannelField,
  DocumentField,
  NumberField,
  RoleChecklist,
  SwitchField,
  fieldError,
} from '../../features/config/fields';
import {
  createGiveaway,
  getGiveaway,
  getGiveaways,
  giveawayAction,
} from '../../services/community';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

/** The create form edits the deadline in local time; the API receives UTC. */
const CreateGiveawayForm = z.object({
  prize: z.string().trim().min(1, 'Describe the prize.').max(1000),
  channelId: z.string().regex(/^\d{17,20}$/, 'Choose a channel.'),
  endsAtLocal: z
    .string()
    .min(1, 'Choose when the giveaway ends.')
    .refine((value) => {
      const time = new Date(value).getTime();
      return time > Date.now() && time < Date.now() + 365 * 86_400_000;
    }, 'Choose a time within the next year.'),
  winnerCount: z.number().int().min(1).max(100),
  // An empty number input yields NaN; treat it as "no limit".
  entryLimit: z.preprocess(
    (value) =>
      typeof value === 'number' && Number.isNaN(value) ? undefined : value,
    z.number().int().min(1).max(100_000).optional(),
  ),
  eligibility: EligibilitySchema,
  claimSeconds: z.number().int().min(60).max(2_592_000),
  replaceUnclaimed: z.boolean(),
  document: MessageDocumentSchema.optional(),
});
type CreateValues = z.input<typeof CreateGiveawayForm>;

function CreateGiveaway({
  guildId,
  onCreated,
}: {
  guildId: string;
  onCreated: (id: string) => void;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const form = useForm<
    CreateValues,
    unknown,
    z.output<typeof CreateGiveawayForm>
  >({
    resolver: zodResolver(CreateGiveawayForm),
    defaultValues: {
      prize: '',
      channelId: '',
      endsAtLocal: '',
      winnerCount: 1,
      claimSeconds: 86_400,
      replaceUnclaimed: false,
      eligibility: EligibilitySchema.parse({}),
    },
  });
  const create = useMutation({
    mutationFn: (values: z.output<typeof CreateGiveawayForm>) => {
      const { endsAtLocal, entryLimit, ...rest } = values;
      const body = {
        ...rest,
        ...(entryLimit && Number.isFinite(entryLimit) ? { entryLimit } : {}),
        endsAt: new Date(endsAtLocal).toISOString(),
      };
      return createGiveaway(guildId, body, identity('giveaway-create', body));
    },
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: (result) => {
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['giveaways', guildId] });
      onCreated(result.data.id);
    },
  });
  return (
    <form
      className="stack"
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
      noValidate
    >
      <Card>
        <h2>Prize and timing</h2>
        <Field
          label="Prize"
          htmlFor="giveaway-prize"
          error={form.formState.errors.prize?.message}
        >
          <Input id="giveaway-prize" {...form.register('prize')} />
        </Field>
        <ChannelField
          form={form}
          name="channelId"
          label="Channel"
          guildId={guildId}
        />
        <div className="form-grid">
          <Field
            label="Ends at"
            htmlFor="giveaway-ends"
            hint={`Your local time (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}
            error={form.formState.errors.endsAtLocal?.message}
          >
            <Input
              id="giveaway-ends"
              type="datetime-local"
              {...form.register('endsAtLocal')}
            />
          </Field>
          <NumberField
            form={form}
            name="winnerCount"
            label="Winners"
            min={1}
            max={100}
          />
          <NumberField
            form={form}
            name="entryLimit"
            label="Entry limit"
            hint="Leave empty for no limit."
            min={1}
          />
          <NumberField
            form={form}
            name="claimSeconds"
            label="Time to claim"
            unit="seconds"
            min={60}
          />
        </div>
        <SwitchField
          form={form}
          name="replaceUnclaimed"
          label="Draw replacements for unclaimed prizes"
          hint="When a winner’s claim window ends, Sparko draws a replacement for that slot only."
        />
      </Card>
      <Card>
        <h2>Who can enter</h2>
        <p className="muted">
          Checked when a member enters and again when they claim. Missing facts
          (such as an unknown join date) refuse entry rather than guessing.
        </p>
        <div className="form-grid">
          <NumberField
            form={form}
            name="eligibility.minLevel"
            label="Minimum level"
            min={0}
          />
          <NumberField
            form={form}
            name="eligibility.minAccountDays"
            label="Discord account age"
            unit="days"
            min={0}
          />
          <NumberField
            form={form}
            name="eligibility.minMemberDays"
            label="Time in this server"
            unit="days"
            min={0}
          />
        </div>
        <RoleChecklist
          form={form}
          name="eligibility.requiredRoleIds"
          label="Required roles"
          guildId={guildId}
        />
        <RoleChecklist
          form={form}
          name="eligibility.blockedRoleIds"
          label="Blocked roles"
          guildId={guildId}
        />
      </Card>
      <Card>
        <DocumentField
          form={form}
          name="document"
          label="Giveaway message design"
          guildId={guildId}
        />
        {fieldError(form as never, 'document') && (
          <p className="field-error">{fieldError(form as never, 'document')}</p>
        )}
      </Card>
      {create.error && <ErrorState message={errorMessage(create.error)} />}
      <div className="save-bar">
        <span>The giveaway opens once Discord shows its message.</span>
        <Button type="submit" busy={create.isPending}>
          Start giveaway
        </Button>
      </div>
    </form>
  );
}

function GiveawayDetail({ guildId, id }: { guildId: string; id: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const detail = useQuery({
    queryKey: ['giveaways', guildId, id],
    queryFn: ({ signal }) => getGiveaway(guildId, id, signal),
    refetchInterval: 5000,
  });
  const act = useMutation({
    mutationFn: (action: 'draw' | 'reroll') => {
      const body = action === 'reroll' ? { reason: reason.trim() } : {};
      return giveawayAction(
        guildId,
        id,
        action,
        body,
        identity('giveaway-' + action, { id, body }),
      );
    },
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['giveaways', guildId] });
    },
  });
  if (detail.isPending) return <LoadingState />;
  if (detail.error) return <ErrorState message={errorMessage(detail.error)} />;
  const { giveaway, entries, draws, winners } = detail.data;
  const open = giveaway.state === 'open';
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h2>{giveaway.data.prize}</h2>
          <p className="muted">
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} ·{' '}
            {giveaway.data.winnerCount} winner
            {giveaway.data.winnerCount === 1 ? '' : 's'} · ends{' '}
            {new Date(giveaway.data.endsAt).toLocaleString()}
          </p>
        </div>
        <DeliveryState
          state={giveaway.state}
          error={giveaway.data.deliveryError}
        />
      </div>
      {open && (
        <Button
          busy={act.isPending && act.variables === 'draw'}
          onClick={() => act.mutate('draw')}
        >
          End now and draw
        </Button>
      )}
      <h3>Draw history</h3>
      {draws.length ? (
        draws.map((draw) => (
          <div className="activity-row" key={draw.id}>
            <span>
              <strong>
                Round {draw.data.round}:{' '}
                {draw.data.winnerIds.length
                  ? draw.data.winnerIds.join(', ')
                  : 'no eligible entrants'}
              </strong>
              <small>
                {draw.data.reason} · {draw.data.eligibleEntryIds.length}{' '}
                eligible · {new Date(draw.data.drawnAt).toLocaleString()} ·{' '}
                {draw.data.algorithm}
              </small>
            </span>
            <small className="muted">
              Claim by {new Date(draw.data.claimUntil).toLocaleString()}
            </small>
          </div>
        ))
      ) : (
        <p className="muted">Not drawn yet.</p>
      )}
      {winners.length > 0 && (
        <>
          <h3>Winners</h3>
          {winners.map((winner) => (
            <div className="activity-row" key={winner.id}>
              <span>
                <strong>{winner.data.userId}</strong>
                <small>Round {winner.data.round}</small>
              </span>
              <Badge
                tone={
                  winner.state === 'claimed'
                    ? 'success'
                    : winner.state === 'unclaimed'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {winner.state}
              </Badge>
            </div>
          ))}
        </>
      )}
      {draws.length > 0 && (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim()) act.mutate('reroll');
          }}
        >
          <Field
            label="Reroll reason"
            htmlFor="reroll-reason"
            hint="Previous winners are excluded and claimed prizes are kept."
          >
            <Input
              id="reroll-reason"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            disabled={!reason.trim()}
            busy={act.isPending && act.variables === 'reroll'}
          >
            Reroll unclaimed slots
          </Button>
        </form>
      )}
      {act.error && <ErrorState message={errorMessage(act.error)} />}
    </div>
  );
}

function GiveawayList({ guildId }: { guildId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['giveaways', guildId],
    queryFn: ({ signal }) => getGiveaways(guildId, signal),
    refetchInterval: 10000,
  });
  if (list.isPending) return <LoadingState />;
  if (list.error)
    return (
      <ErrorState
        message={errorMessage(list.error)}
        retry={() => void list.refetch()}
      />
    );
  if (!list.data.giveaways.length)
    return (
      <EmptyState
        title="No giveaways yet"
        description="Create one from the New giveaway tab."
      />
    );
  return (
    <div className="overview-grid">
      <Card>
        {list.data.giveaways.map((row) => (
          <button
            type="button"
            key={row.id}
            className="activity-row button-reset"
            aria-pressed={selected === row.id}
            onClick={() => setSelected(row.id)}
          >
            <span>
              <strong>{row.data.prize}</strong>
              <small>Ends {new Date(row.data.endsAt).toLocaleString()}</small>
            </span>
            <DeliveryState state={row.state} />
          </button>
        ))}
      </Card>
      <Card>
        {selected ? (
          <GiveawayDetail guildId={guildId} id={selected} />
        ) : (
          <EmptyState
            title="Choose a giveaway"
            description="See entries, draws and winners."
          />
        )}
      </Card>
    </div>
  );
}

function GiveawaySettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R31', GiveawayConfigSchema);
  return (
    <ConfigForm
      controller={controller.shell}
      title="Giveaways"
      description="Fair draws use a cryptographic random source. Each member can enter once."
      enableLabel="Allow giveaways"
    >
      <Card>
        <NumberField
          form={controller.form}
          name="defaultClaimSeconds"
          label="Default time to claim"
          unit="seconds"
          min={60}
        />
      </Card>
    </ConfigForm>
  );
}

export function GiveawaysPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Fair giveaways, start to finish."
        description="Create giveaways with clear rules, watch entries, and keep every draw on record."
      />
      <Tabs
        tabs={[
          {
            id: 'giveaways',
            label: 'Giveaways',
            content: <GiveawayList guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New giveaway',
            content: (
              <CreateGiveaway
                guildId={guildId}
                onCreated={() =>
                  setParams({ tab: 'giveaways' }, { replace: true })
                }
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: <GiveawaySettings guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
