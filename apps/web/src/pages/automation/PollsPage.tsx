import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Vote } from 'lucide-react';
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
import { Tabs } from '../../features/config/Tabs';
import {
  ChannelField,
  NumberField,
  RoleChecklist,
  SelectField,
  SwitchField,
  fieldError,
} from '../../features/config/fields';
import {
  AutomationSettings,
  OffNotice,
  StateBadge,
} from '../../features/automation/shared';
import {
  closePoll,
  createPoll,
  getPolls,
  type PollRecord,
} from '../../services/automation';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

const visibilityLabels: Record<string, string> = {
  public: 'Everyone sees live results',
  after_close: 'Results appear when voting closes',
  manager: 'Only managers see results',
};
const PollForm = z
  .object({
    question: z.string().trim().min(1, 'Ask a question.').max(500),
    choices: z
      .array(
        z.object({
          label: z.string().trim().min(1, 'Name this choice.').max(100),
        }),
      )
      .min(2, 'Add at least two choices.')
      .max(25),
    maxSelections: z.number().int().min(1).max(25),
    allowChange: z.boolean(),
    resultsVisibility: z.enum(['public', 'after_close', 'manager']),
    endsAtLocal: z
      .string()
      .min(1, 'Choose when voting closes.')
      .refine(
        (value) => new Date(value).getTime() > Date.now(),
        'Choose a time in the future.',
      ),
    channelId: z.string().optional(),
    requiredRoleIds: z.array(z.string()),
  })
  .refine(
    (v) =>
      new Set(v.choices.map((c) => c.label.trim().toLowerCase())).size ===
      v.choices.length,
    { path: ['choices'], message: 'Each choice must be different.' },
  )
  .refine((v) => v.maxSelections <= v.choices.length, {
    path: ['maxSelections'],
    message: 'Members cannot pick more choices than exist.',
  });
type PollInput = z.input<typeof PollForm>;

export function PollResults({ poll }: { poll: PollRecord }) {
  if (!poll.results)
    return (
      <p className="muted">
        {poll.data.resultsVisibility === 'after_close'
          ? 'Results appear when voting closes.'
          : 'Only managers can see results.'}
      </p>
    );
  const total = Math.max(
    1,
    poll.results.reduce((sum, row) => sum + row.votes, 0),
  );
  return (
    <ul className="poll-results" aria-label="Results">
      {poll.results.map((row, index) => (
        <li key={index}>
          <span className="poll-result-label">
            <span>
              {row.choice}
              {poll.myVote.includes(index) && (
                <small className="muted"> · your vote</small>
              )}
            </span>
            <strong>
              {row.votes} vote{row.votes === 1 ? '' : 's'}
            </strong>
          </span>
          <span className="progress" aria-hidden="true">
            <span style={{ width: `${(row.votes / total) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function NewPoll({
  guildId,
  onCreated,
}: {
  guildId: string;
  onCreated: () => void;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const form = useForm<PollInput, unknown, z.output<typeof PollForm>>({
    resolver: zodResolver(PollForm),
    defaultValues: {
      question: '',
      choices: [{ label: '' }, { label: '' }],
      maxSelections: 1,
      allowChange: true,
      resultsVisibility: 'public',
      endsAtLocal: '',
      requiredRoleIds: [],
    },
  });
  const choices = useFieldArray({ control: form.control, name: 'choices' });
  const create = useMutation({
    mutationFn: (values: z.output<typeof PollForm>) => {
      const { endsAtLocal, choices: list, channelId, ...rest } = values;
      const body = {
        ...rest,
        choices: list.map((choice) => choice.label.trim()),
        endsAt: new Date(endsAtLocal).toISOString(),
        ...(channelId ? { channelId } : {}),
      };
      return createPoll(guildId, body, identity('poll', body));
    },
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: () => {
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['polls', guildId] });
      onCreated();
    },
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <Card>
        <h2>Question</h2>
        <Field
          label="Question"
          htmlFor="poll-question"
          required
          error={form.formState.errors.question?.message}
        >
          <Input id="poll-question" {...form.register('question')} />
        </Field>
        <fieldset className="stack">
          <legend>Choices</legend>
          {choices.fields.map((item, index) => (
            <div className="row choice-row" key={item.id}>
              <Field
                label={`Choice ${index + 1}`}
                htmlFor={`poll-choice-${index}`}
                error={fieldError(form as never, `choices.${index}.label`)}
              >
                <Input
                  id={`poll-choice-${index}`}
                  maxLength={100}
                  {...form.register(`choices.${index}.label`)}
                />
              </Field>
              {choices.fields.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove choice ${index + 1}`}
                  onClick={() => choices.remove(index)}
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          ))}
          {fieldError(form as never, 'choices') && (
            <p className="field-error" role="alert">
              {fieldError(form as never, 'choices')}
            </p>
          )}
          {choices.fields.length < 25 && (
            <div className="row">
              <Button
                type="button"
                variant="secondary"
                onClick={() => choices.append({ label: '' })}
              >
                <Plus size={16} /> Add choice
              </Button>
            </div>
          )}
        </fieldset>
      </Card>
      <Card>
        <h2>Voting rules</h2>
        <div className="form-grid">
          <Field
            label="Voting closes"
            htmlFor="poll-ends"
            required
            hint={`Your local time (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}
            error={form.formState.errors.endsAtLocal?.message}
          >
            <Input
              id="poll-ends"
              type="datetime-local"
              {...form.register('endsAtLocal')}
            />
          </Field>
          <NumberField
            form={form}
            name="maxSelections"
            label="Choices each member can pick"
            min={1}
            max={25}
          />
          <SelectField
            form={form}
            name="resultsVisibility"
            label="Who sees results"
            options={Object.entries(visibilityLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>
        <SwitchField
          form={form}
          name="allowChange"
          label="Let members change their vote"
          hint="Votes are stored with member IDs, so polls are not anonymous to managers."
        />
        <RoleChecklist
          form={form}
          name="requiredRoleIds"
          label="Only members with all of these roles can vote"
          hint="Leave empty to let everyone vote."
          guildId={guildId}
        />
        <ChannelField
          form={form}
          name="channelId"
          label="Post the poll in"
          hint="Optional. Members can always vote from their member profile."
          placeholder="Don’t post in Discord"
          guildId={guildId}
        />
      </Card>
      {create.error && <ErrorState message={errorMessage(create.error)} />}
      <div className="save-bar">
        <span>Voting opens immediately and closes on its own.</span>
        <Button type="submit" busy={create.isPending}>
          Start poll
        </Button>
      </div>
    </form>
  );
}

function PollList({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const polls = useQuery({
    queryKey: ['polls', guildId],
    queryFn: ({ signal }) => getPolls(guildId, signal),
    refetchInterval: 10000,
  });
  const close = useMutation({
    mutationFn: (poll: PollRecord) =>
      closePoll(
        guildId,
        poll.id,
        poll.revision,
        identity('poll-close', poll.id),
      ),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ['polls', guildId] }),
  });
  if (polls.isPending) return <LoadingState />;
  if (polls.error)
    return (
      <ErrorState
        message={errorMessage(polls.error)}
        retry={() => void polls.refetch()}
      />
    );
  if (!polls.data.length)
    return (
      <EmptyState
        icon={Vote}
        title="No polls yet"
        description="Start one from the New poll tab."
      />
    );
  return (
    <div className="stack">
      {polls.data.map((poll) => (
        <Card key={poll.id}>
          <div className="section-heading">
            <div>
              <h2 className="wrap-anywhere">{poll.data.question}</h2>
              <p className="muted">
                {poll.state === 'open' ? 'Closes' : 'Closed'}{' '}
                {new Date(
                  poll.data.closedAt ?? poll.data.endsAt,
                ).toLocaleString()}
                {poll.voterCount !== null &&
                  ` · ${poll.voterCount} voter${poll.voterCount === 1 ? '' : 's'}`}
                {' · '}
                {visibilityLabels[poll.data.resultsVisibility] ?? ''}
              </p>
            </div>
            <StateBadge state={poll.state} />
          </div>
          <PollResults poll={poll} />
          {poll.state === 'open' && (
            <div className="row">
              <Button
                variant="secondary"
                busy={close.isPending && close.variables?.id === poll.id}
                onClick={() => close.mutate(poll)}
              >
                Close voting now
              </Button>
            </div>
          )}
        </Card>
      ))}
      {close.error && <ErrorState message={errorMessage(close.error)} />}
    </div>
  );
}

export function PollsPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Polls"
        description="Ask a question, set who can vote and when it closes, and watch results arrive."
      />
      <OffNotice guildId={guildId} featureId="R33" noun="Polls" />
      <Tabs
        tabs={[
          {
            id: 'polls',
            label: 'Polls',
            content: <PollList guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New poll',
            content: (
              <NewPoll
                guildId={guildId}
                onCreated={() => setParams({ tab: 'polls' }, { replace: true })}
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R33"
                title="Polls"
                description="Members vote from the poll message or their member profile. One ballot per member."
                enableLabel="Allow polls"
              />
            ),
          },
        ]}
      />
    </>
  );
}
