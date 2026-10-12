import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  Play,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import { WorkflowSchema } from '@sparko/contracts';
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
  ChannelChecklist,
  ChannelField,
  NumberField,
  RoleChecklist,
  RoleField,
  SelectField,
  fieldError,
  useChannels,
  useRoles,
} from '../../features/config/fields';
import {
  AutomationSettings,
  OffNotice,
  StateBadge,
  useFeature,
} from '../../features/automation/shared';
import {
  RecordList,
  useRecord,
  useRefreshAutomation,
} from '../../features/automation/RecordList';
import {
  blankStep,
  moveStep,
  removeStep,
  stepTypes,
  traceWorkflow,
  type StepType,
  type WorkflowStep,
} from '../../features/automation/workflow';
import {
  cancelWorkflowRun,
  getWorkflowRuns,
  runWorkflow,
  saveAutomation,
  type WorkflowRecord,
  type WorkflowRun,
} from '../../services/automation';
import { getConfig } from '../../services/guilds';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

type WorkflowInput = z.input<typeof WorkflowSchema>;
type WorkflowForm = UseFormReturn<
  WorkflowInput,
  unknown,
  z.output<typeof WorkflowSchema>
>;
const triggerLabels: Record<string, string> = {
  manual: 'Only when staff run it',
  custom: 'From a custom slash command',
  message: 'When a member sends a message',
  join: 'When a member joins',
};

/** Human names for IDs in step descriptions. */
function useNames(guildId: string) {
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);
  const tickets = useQuery({
    queryKey: ['config', guildId, 'tickets'],
    queryFn: ({ signal }) => getConfig(guildId, 'tickets', signal),
  });
  const categories = (
    (tickets.data?.config['categories'] as { id: string; name: string }[]) ?? []
  ).filter((category) => category && typeof category.id === 'string');
  return {
    categories,
    names: {
      channel: (id: string) => {
        const channel = channels.data?.find((item) => item.id === id);
        return channel ? `#${channel.name}` : 'a channel';
      },
      role: (id: string) =>
        roles.data?.find((item) => item.id === id)?.name ?? 'a role',
      category: (id: string) =>
        categories.find((item) => item.id === id)?.name ?? id ?? 'support',
    },
  };
}

const units = [
  { value: 86400, label: 'days' },
  { value: 3600, label: 'hours' },
  { value: 60, label: 'minutes' },
  { value: 1, label: 'seconds' },
];
function WaitField({ form, index }: { form: WorkflowForm; index: number }) {
  return (
    <Controller
      control={form.control}
      name={`steps.${index}.seconds` as never}
      render={({ field }) => {
        const seconds = Number(field.value) || 0;
        const unit =
          units.find((item) => seconds > 0 && seconds % item.value === 0) ??
          units[3]!;
        return (
          <div className="form-grid">
            <Field
              label="Wait for"
              htmlFor={`step-${index}-amount`}
              hint="Up to 1 day."
              error={fieldError(form as never, `steps.${index}.seconds`)}
            >
              <Input
                id={`step-${index}-amount`}
                type="number"
                min={1}
                value={seconds / unit.value}
                onChange={(event) =>
                  field.onChange(
                    Math.round(Number(event.target.value) * unit.value),
                  )
                }
              />
            </Field>
            <Field label="Unit" htmlFor={`step-${index}-unit`}>
              <select
                id={`step-${index}-unit`}
                value={unit.value}
                onChange={(event) =>
                  field.onChange(
                    Math.max(1, seconds / unit.value) *
                      Number(event.target.value),
                  )
                }
              >
                {units.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        );
      }}
    />
  );
}

function StepFields({
  form,
  index,
  step,
  count,
  guildId,
  categories,
}: {
  form: WorkflowForm;
  index: number;
  step: WorkflowStep;
  count: number;
  guildId: string;
  categories: { id: string; name: string }[];
}) {
  const name = (key: string) => `steps.${index}.${key}` as never;
  const later = Array.from({ length: count }, (_, i) => i).filter(
    (i) => i > index,
  );
  switch (step.type) {
    case 'send':
      return (
        <>
          <ChannelField
            form={form}
            name={name('channelId')}
            label="Channel"
            guildId={guildId}
          />
          <Field
            label="Message"
            htmlFor={`step-${index}-text`}
            hint="Plain text. Mentions are not pinged."
            error={fieldError(form as never, `steps.${index}.text`)}
          >
            <textarea
              id={`step-${index}-text`}
              maxLength={2000}
              {...form.register(name('text'))}
            />
          </Field>
        </>
      );
    case 'role':
      return (
        <div className="form-grid">
          <SelectField
            form={form}
            name={name('action')}
            label="Action"
            options={[
              { value: 'add', label: 'Give the role' },
              { value: 'remove', label: 'Remove the role' },
            ]}
          />
          <RoleField
            form={form}
            name={name('roleId')}
            label="Role"
            guildId={guildId}
            assigns
          />
        </div>
      );
    case 'ticket':
      return categories.length ? (
        <SelectField
          form={form}
          name={name('categoryId')}
          label="Ticket type"
          options={[
            { value: '', label: 'Choose a ticket type' },
            ...categories.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          ]}
        />
      ) : (
        <p className="field-error" role="alert">
          Add a ticket type in Tickets settings first.
        </p>
      );
    case 'wait':
      return <WaitField form={form} index={index} />;
    case 'branch':
      return later.length ? (
        <>
          <RoleField
            form={form}
            name={name('requiredRoleId')}
            label="If the member has the role"
            guildId={guildId}
          />
          <div className="form-grid">
            {(['onMatch', 'onMiss'] as const).map((key) => (
              <Field
                key={key}
                label={key === 'onMatch' ? 'Then go to' : 'Otherwise go to'}
                htmlFor={`step-${index}-${key}`}
                error={fieldError(form as never, `steps.${index}.${key}`)}
              >
                <select
                  id={`step-${index}-${key}`}
                  {...form.register(name(key), { valueAsNumber: true })}
                >
                  {later.map((i) => (
                    <option key={i} value={i}>
                      Step {i + 1}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </>
      ) : (
        <p className="field-error" role="alert">
          A role check needs at least one step after it.
        </p>
      );
  }
}

function DryRun({ form, guildId }: { form: WorkflowForm; guildId: string }) {
  const { names } = useNames(guildId);
  const [steps, maxActions] = useWatch({
    control: form.control,
    name: ['steps', 'maxActions'],
  }) as [WorkflowStep[], number];
  const branchRoles = [
    ...new Set(
      steps
        .filter((step) => step.type === 'branch')
        .map((step) => (step as { requiredRoleId: string }).requiredRoleId)
        .filter(Boolean),
    ),
  ];
  const [held, setHeld] = useState<string[]>([]);
  const trace = traceWorkflow(steps, Number(maxActions) || 5, held, names);
  return (
    <Card>
      <h2>
        <GitBranch size={18} aria-hidden="true" /> What would happen
      </h2>
      <p className="muted">
        A dry run of this draft. Nothing is sent and no role changes.
      </p>
      {branchRoles.length > 0 && (
        <fieldset className="stack">
          <legend>The member has</legend>
          {branchRoles.map((role) => (
            <label className="checkbox-row" key={role}>
              <input
                type="checkbox"
                checked={held.includes(role)}
                onChange={(event) =>
                  setHeld(
                    event.target.checked
                      ? [...held, role]
                      : held.filter((item) => item !== role),
                  )
                }
              />
              <span>{names.role(role)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <ol className="trace-list" aria-label="Dry run">
        {trace.lines.map((line, i) => (
          <li key={i} className={line.overBudget ? 'field-error' : ''}>
            <strong>Step {line.index + 1}.</strong> {line.text}
            {line.overBudget && ' — stops: action limit reached'}
          </li>
        ))}
      </ol>
      <p className="field-hint">
        {trace.actions} of {maxActions} actions used. Waits and role checks are
        free.
      </p>
    </Card>
  );
}

function toInput(workflow?: WorkflowRecord): WorkflowInput {
  return workflow
    ? {
        name: workflow.data.name,
        trigger: workflow.data.trigger,
        channelIds: workflow.data.channelIds,
        requiredRoleIds: workflow.data.requiredRoleIds,
        steps: workflow.data.steps,
        maxActions: workflow.data.maxActions,
      }
    : {
        name: '',
        trigger: 'manual',
        channelIds: [],
        requiredRoleIds: [],
        steps: [blankStep('send', 0)],
        maxActions: 5,
      };
}

function WorkflowEditor({
  guildId,
  workflow,
  onDone,
}: {
  guildId: string;
  workflow?: WorkflowRecord;
  onDone: () => void;
}) {
  const identity = useActionIdentity();
  const refresh = useRefreshAutomation(guildId, 'workflows');
  const { categories } = useNames(guildId);
  const form: WorkflowForm = useForm({
    resolver: zodResolver(WorkflowSchema),
    defaultValues: toInput(workflow),
  });
  const steps = useFieldArray({ control: form.control, name: 'steps' });
  const values = useWatch({ control: form.control, name: 'steps' }) as
    | WorkflowStep[]
    | undefined;
  const trigger = useWatch({ control: form.control, name: 'trigger' });
  // The plan's step limit; the server enforces it on save as well.
  const maxSteps =
    useFeature(guildId, 'R45').data?.gate?.limits?.automationSteps ?? 25;
  const current = () => form.getValues('steps') as WorkflowStep[];
  const save = useMutation({
    mutationFn: (config: z.output<typeof WorkflowSchema>) =>
      saveAutomation(
        guildId,
        'workflows',
        workflow?.id ?? null,
        config,
        workflow?.revision,
        identity('workflow', { id: workflow?.id, config }),
      ),
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((config) => save.mutate(config))}
    >
      <Card>
        <h2>{workflow ? `Edit ${workflow.data.name}` : 'Start'}</h2>
        <Field
          label="Name"
          htmlFor="workflow-name"
          required
          error={form.formState.errors.name?.message}
        >
          <Input
            id="workflow-name"
            maxLength={100}
            {...form.register('name')}
          />
        </Field>
        <SelectField
          form={form}
          name="trigger"
          label="Runs"
          options={Object.entries(triggerLabels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        {trigger === 'message' && (
          <ChannelChecklist
            form={form}
            name="channelIds"
            label="Only for messages in"
            hint="Leave empty for every channel. Each message starts at most one run of this workflow."
            guildId={guildId}
          />
        )}
        <RoleChecklist
          form={form}
          name="requiredRoleIds"
          label="Only for members with all of these roles"
          guildId={guildId}
        />
        <NumberField
          form={form}
          name="maxActions"
          label="Action limit per run"
          hint="Messages, role changes and tickets each count as one. A run that would go over stops there."
          min={1}
          max={10}
        />
      </Card>
      <Card>
        <h2>Steps</h2>
        <p className="muted">
          Steps run in order. Role checks can only skip forward, so a workflow
          always ends.
        </p>
        <ol className="step-list">
          {steps.fields.map((item, index) => {
            const step = values?.[index] ?? (item as unknown as WorkflowStep);
            return (
              <li key={item.id} className="step-card">
                <div className="section-heading">
                  <Field
                    label={`Step ${index + 1}`}
                    htmlFor={`step-${index}-type`}
                  >
                    <select
                      id={`step-${index}-type`}
                      value={step.type}
                      onChange={(event) =>
                        steps.update(
                          index,
                          blankStep(
                            event.target.value as StepType,
                            index,
                          ) as never,
                        )
                      }
                    >
                      {stepTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <span className="row">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Move step ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() =>
                        steps.replace(
                          moveStep(current(), index, index - 1) as never,
                        )
                      }
                    >
                      <ArrowUp size={16} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Move step ${index + 1} down`}
                      disabled={index === steps.fields.length - 1}
                      onClick={() =>
                        steps.replace(
                          moveStep(current(), index, index + 1) as never,
                        )
                      }
                    >
                      <ArrowDown size={16} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove step ${index + 1}`}
                      disabled={steps.fields.length === 1}
                      onClick={() =>
                        steps.replace(removeStep(current(), index) as never)
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </span>
                </div>
                <StepFields
                  form={form}
                  index={index}
                  step={step}
                  count={steps.fields.length}
                  guildId={guildId}
                  categories={categories}
                />
                {fieldError(form as never, `steps.${index}`) && (
                  <p className="field-error" role="alert">
                    {fieldError(form as never, `steps.${index}`)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {steps.fields.length >= maxSteps && (
          <p className="field-hint">
            This plan allows up to {maxSteps} steps in one workflow.
          </p>
        )}
        {steps.fields.length < maxSteps && (
          <div className="row">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                steps.append(blankStep('send', steps.fields.length) as never)
              }
            >
              <Plus size={16} /> Add step
            </Button>
          </div>
        )}
      </Card>
      <DryRun form={form} guildId={guildId} />
      {save.error && <ErrorState message={errorMessage(save.error)} />}
      <div className="save-bar">
        {workflow ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel editing
          </Button>
        ) : (
          <span>
            Runs already in progress keep the version they started with.
          </span>
        )}
        <Button type="submit" busy={save.isPending}>
          {workflow ? 'Save workflow' : 'Create workflow'}
        </Button>
      </div>
    </form>
  );
}

function Workflows({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [, setParams] = useSearchParams();
  const workflow = useRecord(guildId, 'workflows', editing);
  const run = useMutation({
    mutationFn: (id: string) =>
      runWorkflow(
        guildId,
        id,
        identity('workflow-run', { id, at: Date.now() }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workflow-runs', guildId],
      });
      setParams({ tab: 'runs' }, { replace: true });
    },
  });
  if (editing && workflow)
    return (
      <WorkflowEditor
        key={workflow.id}
        guildId={guildId}
        workflow={workflow}
        onDone={() => setEditing(null)}
      />
    );
  return (
    <div className="stack">
      <RecordList
        guildId={guildId}
        path="workflows"
        icon={WorkflowIcon}
        empty={{
          title: 'No workflows yet',
          description: 'Build one from the New workflow tab.',
        }}
        summary={(row) => ({
          title: row.data.name,
          detail: `${triggerLabels[row.data.trigger]} · ${row.data.steps.length} step${row.data.steps.length === 1 ? '' : 's'}`,
        })}
        onEdit={setEditing}
        actions={(row) => (
          <Button
            variant="secondary"
            busy={run.isPending && run.variables === row.id}
            onClick={() => run.mutate(row.id)}
          >
            <Play size={16} /> Run for me
          </Button>
        )}
      />
      {run.error && <ErrorState message={errorMessage(run.error)} />}
    </div>
  );
}

function runSummary(run: WorkflowRun, steps: number | undefined) {
  if (run.state === 'completed') return 'Finished every step';
  if (run.data.error) return run.data.error;
  if (run.data.waitingUntil && run.state === 'running')
    return `Waiting until ${new Date(run.data.waitingUntil).toLocaleString()}`;
  return `At step ${run.data.cursor + 1}${steps ? ` of ${steps}` : ''}`;
}

function Runs({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const runs = useQuery({
    queryKey: ['workflow-runs', guildId],
    queryFn: ({ signal }) => getWorkflowRuns(guildId, signal),
    refetchInterval: 5000,
  });
  const cancel = useMutation({
    mutationFn: (run: WorkflowRun) =>
      cancelWorkflowRun(
        guildId,
        run.id,
        run.revision,
        identity('run-cancel', run.id),
      ),
    onSettled: () =>
      void queryClient.invalidateQueries({
        queryKey: ['workflow-runs', guildId],
      }),
  });
  if (runs.isPending) return <LoadingState />;
  if (runs.error) return <ErrorState message={errorMessage(runs.error)} />;
  if (!runs.data.length)
    return (
      <EmptyState
        icon={Play}
        title="No runs yet"
        description="Runs appear here with each step’s progress."
      />
    );
  return (
    <Card>
      {runs.data.map((run) => {
        const definition = run.data.definition as
          | { name?: string; steps?: unknown[] }
          | undefined;
        return (
          <div className="activity-row" key={run.id}>
            <span>
              <strong>{definition?.name ?? 'Workflow'}</strong>
              <small>
                {run.data.source
                  ? `${triggerLabels[run.data.source.source] ?? run.data.source.source} · member ${run.data.source.userId}`
                  : ''}
                {' · '}
                {runSummary(run, definition?.steps?.length)} ·{' '}
                {run.data.actions} action{run.data.actions === 1 ? '' : 's'} ·{' '}
                {new Date(run.createdAt).toLocaleString()}
              </small>
            </span>
            <span className="row">
              <StateBadge state={run.state} />
              {run.state === 'running' && (
                <Button
                  variant="ghost"
                  busy={cancel.isPending && cancel.variables?.id === run.id}
                  onClick={() => cancel.mutate(run)}
                >
                  Stop
                </Button>
              )}
            </span>
          </div>
        );
      })}
      {cancel.error && <ErrorState message={errorMessage(cancel.error)} />}
    </Card>
  );
}

export function WorkflowsPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  const tabs = useMemo(
    () => [
      {
        id: 'workflows',
        label: 'Workflows',
        content: <Workflows guildId={guildId} />,
      },
      {
        id: 'new',
        label: 'New workflow',
        content: (
          <WorkflowEditor
            guildId={guildId}
            onDone={() => setParams({ tab: 'workflows' }, { replace: true })}
          />
        ),
      },
      { id: 'runs', label: 'Runs', content: <Runs guildId={guildId} /> },
      {
        id: 'settings',
        label: 'Settings',
        content: (
          <AutomationSettings
            guildId={guildId}
            featureId="R45"
            title="Workflows"
            description="Turning workflows off stops runs in progress at their next step."
            enableLabel="Run workflows"
          />
        ),
      },
    ],
    [guildId, setParams],
  );
  return (
    <>
      <PageHeading
        eyebrow="Automations"
        title="Workflows"
        description="Chain messages, roles, tickets, waits and role checks into a repeatable routine. Every run is recorded step by step."
      />
      <OffNotice guildId={guildId} featureId="R45" noun="Workflows" />
      <Tabs tabs={tabs} />
    </>
  );
}
