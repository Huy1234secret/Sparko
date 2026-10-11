import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { FormSchema, FormsConfigSchema } from '@sparko/contracts';
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
  NumberField,
  RoleChecklist,
  fieldError,
  useRoles,
} from '../../features/config/fields';
import {
  getApplications,
  getForms,
  publishForm,
  reviewApplication,
  saveForm,
  type ApplicationRecord,
  type FormRecord,
} from '../../services/safety';
import { applyServerFieldErrors } from '../../services/formErrors';
import { ApiError, errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';
import { DraftGuard } from '../../hooks/useDraftGuard';

type FormInput = z.input<typeof FormSchema>;
const blankForm: FormInput = {
  name: 'Staff application',
  description: '',
  requiredRoleIds: [],
  blockedRoleIds: [],
  maxSubmissions: 1,
  fields: [
    {
      id: 'why',
      label: 'Why do you want to join the team?',
      required: true,
      maxLength: 1000,
      choices: [],
    },
  ],
  stages: ['Review'],
};
/** Choices are edited one per line; an empty box means free text. */
const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function FormEditor({
  guildId,
  form: record,
  onSaved,
}: {
  guildId: string;
  form: FormRecord | null;
  onSaved: (id: string) => void;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const roles = useRoles(guildId);
  const initial: FormInput = record
    ? {
        name: record.data.name,
        description: record.data.description,
        requiredRoleIds: record.data.requiredRoleIds,
        blockedRoleIds: record.data.blockedRoleIds,
        maxSubmissions: record.data.maxSubmissions,
        fields: record.data.fields,
        stages: record.data.stages,
        ...(record.data.decisionRoleId
          ? { decisionRoleId: record.data.decisionRoleId }
          : {}),
      }
    : blankForm;
  const form = useForm<FormInput, unknown, z.output<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: initial,
  });
  const fields = useFieldArray({ control: form.control, name: 'fields' });
  const [stagesText, setStagesText] = useState(
    initial.stages?.join('\n') ?? 'Review',
  );
  useEffect(() => {
    form.setValue('stages', lines(stagesText), { shouldDirty: true });
  }, [stagesText, form]);
  const dirty = form.formState.isDirty;
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['forms', guildId] });
  const save = useMutation({
    mutationFn: (values: z.output<typeof FormSchema>) => {
      const body = record
        ? { form: values, expectedRevision: record.revision }
        : { form: values };
      return saveForm(
        guildId,
        record?.id ?? null,
        body,
        identity('form-save', body),
      );
    },
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: (result, values) => {
      form.reset(values);
      refresh();
      onSaved(result.data.id);
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      publishForm(
        guildId,
        record?.id ?? '',
        record?.revision ?? 0,
        identity('form-publish', record?.revision),
      ),
    onSuccess: refresh,
  });
  const conflict = [save.error, publish.error].some(
    (error) => error instanceof ApiError && error.code === 'REVISION_CONFLICT',
  );
  const errors = form.formState.errors;
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <DraftGuard dirty={dirty} />
      <Card>
        <div className="section-heading">
          <h2>{record ? record.data.name : 'New form'}</h2>
          {record && (
            <Badge tone={record.state === 'published' ? 'success' : 'neutral'}>
              {record.state === 'published'
                ? `Published v${record.data.publishedVersion}`
                : record.data.publishedVersion
                  ? `Draft · v${record.data.publishedVersion} live`
                  : 'Draft'}
            </Badge>
          )}
        </div>
        <Field
          label="Form name"
          htmlFor="form-name"
          error={errors.name?.message}
        >
          <Input id="form-name" {...form.register('name')} />
        </Field>
        <Field label="Description" htmlFor="form-description">
          <textarea
            id="form-description"
            maxLength={2000}
            {...form.register('description')}
          />
        </Field>
        <NumberField
          form={form}
          name="maxSubmissions"
          label="Applications per member"
          min={1}
          max={20}
        />
      </Card>
      <Card>
        <h2>Questions</h2>
        <p className="muted">
          Discord shows up to five questions per step; longer forms continue in
          further steps. Choices turn a question into a picker.
        </p>
        {fields.fields.map((item, index) => (
          <fieldset className="stack" key={item.id}>
            <legend>Question {index + 1}</legend>
            <div className="form-grid">
              <Field
                label="Question"
                htmlFor={`field-label-${index}`}
                error={fieldError(form as never, `fields.${index}.label`)}
              >
                <Input
                  id={`field-label-${index}`}
                  {...form.register(`fields.${index}.label`)}
                />
              </Field>
              <Field
                label="Answer identifier"
                htmlFor={`field-id-${index}`}
                hint="Lowercase letters, digits, - and _."
                error={fieldError(form as never, `fields.${index}.id`)}
              >
                <Input
                  id={`field-id-${index}`}
                  {...form.register(`fields.${index}.id`)}
                />
              </Field>
              <NumberField
                form={form}
                name={`fields.${index}.maxLength`}
                label="Answer length limit"
                min={1}
                max={4000}
              />
              <Field
                label="Choices (one per line, optional)"
                htmlFor={`field-choices-${index}`}
                error={fieldError(form as never, `fields.${index}.choices`)}
              >
                <textarea
                  id={`field-choices-${index}`}
                  defaultValue={(item.choices ?? []).join('\n')}
                  onChange={(event) =>
                    form.setValue(
                      `fields.${index}.choices`,
                      lines(event.target.value),
                      {
                        shouldDirty: true,
                      },
                    )
                  }
                />
              </Field>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                {...form.register(`fields.${index}.required`)}
              />
              Answer required
            </label>
            <Button
              type="button"
              variant="ghost"
              disabled={fields.fields.length <= 1}
              onClick={() => fields.remove(index)}
            >
              <Trash2 size={16} /> Remove question
            </Button>
          </fieldset>
        ))}
        {errors.fields?.message && (
          <p className="field-error" role="alert">
            {errors.fields.message}
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={fields.fields.length >= 20}
          onClick={() =>
            fields.append({
              id: `question-${fields.fields.length + 1}`,
              label: 'New question',
              required: true,
              maxLength: 1000,
              choices: [],
            })
          }
        >
          <Plus size={16} /> Add question
        </Button>
      </Card>
      <Card>
        <h2>Who can apply and how it is reviewed</h2>
        <div className="form-grid">
          <RoleChecklist
            form={form}
            name="requiredRoleIds"
            label="Members need one of these roles"
            guildId={guildId}
          />
          <RoleChecklist
            form={form}
            name="blockedRoleIds"
            label="Members with these roles cannot apply"
            guildId={guildId}
          />
        </div>
        <Field
          label="Review stages (one per line)"
          htmlFor="form-stages"
          hint="Applications move through every stage before they can be accepted."
          error={
            errors.stages?.message ?? fieldError(form as never, 'stages.0')
          }
        >
          <textarea
            id="form-stages"
            value={stagesText}
            onChange={(event) => setStagesText(event.target.value)}
          />
        </Field>
        <Field
          label="Role to give accepted applicants (optional)"
          htmlFor="form-decision-role"
        >
          <select
            id="form-decision-role"
            {...form.register('decisionRoleId', {
              setValueAs: (value: string) => value || undefined,
            })}
          >
            <option value="">No role</option>
            {roles.data
              ?.filter((role) => !role.managed && role.id !== guildId)
              .map((role) => (
                <option
                  key={role.id}
                  value={role.id}
                  disabled={role.assignable === false}
                >
                  {role.name}
                  {role.privileged
                    ? ' — moderator permissions'
                    : role.assignable === false
                      ? ' — above Sparko'
                      : ''}
                </option>
              ))}
          </select>
        </Field>
      </Card>
      {conflict ? (
        <div className="alert alert-warning" role="alert">
          <p>
            Someone else changed this form. Your edits are kept; reload to see
            their version.
          </p>
        </div>
      ) : (
        (save.error || publish.error) && (
          <ErrorState message={errorMessage(save.error ?? publish.error)} />
        )
      )}
      {record && record.data.versions.length > 0 && (
        <Card>
          <h2>Published versions</h2>
          <p className="muted">
            Each application keeps the exact version it was submitted against.
          </p>
          {[...record.data.versions].reverse().map((version) => (
            <div className="activity-row" key={version.number}>
              <span>
                <strong>Version {version.number}</strong>
                <small>{version.form.fields.length} questions</small>
              </span>
              <small className="muted">
                {new Date(version.publishedAt).toLocaleString()}
              </small>
            </div>
          ))}
        </Card>
      )}
      <div className="save-bar">
        <span>
          {dirty ? 'Unsaved changes' : record ? 'Saved' : 'Not saved yet'}
          {record?.state === 'draft' && !dirty
            ? ' · publish to make this version live'
            : ''}
        </span>
        <Button
          type="submit"
          variant="secondary"
          busy={save.isPending}
          disabled={!dirty && !!record}
        >
          Save draft
        </Button>
        {record && (
          <Button
            type="button"
            busy={publish.isPending}
            disabled={dirty || record.state === 'published'}
            onClick={() => publish.mutate()}
          >
            Publish
          </Button>
        )}
      </div>
    </form>
  );
}

function FormsList({ guildId }: { guildId: string }) {
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const forms = useQuery({
    queryKey: ['forms', guildId],
    queryFn: ({ signal }) => getForms(guildId, signal),
  });
  if (forms.isPending) return <LoadingState />;
  if (forms.error)
    return (
      <ErrorState
        message={errorMessage(forms.error)}
        retry={() => void forms.refetch()}
      />
    );
  const current = forms.data.find((item) => item.id === selected) ?? null;
  return (
    <div className="stack">
      <Card>
        <div className="section-heading">
          <h2>Your forms</h2>
          <Button variant="secondary" onClick={() => setSelected('new')}>
            <Plus size={16} /> New form
          </Button>
        </div>
        {forms.data.length ? (
          forms.data.map((item) => (
            <button
              type="button"
              key={item.id}
              className="activity-row button-reset"
              aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
            >
              <span>
                <strong>{item.data.name}</strong>
                <small>
                  {item.data.fields.length} questions ·{' '}
                  {item.data.stages.length} review stage(s)
                </small>
              </span>
              <Badge tone={item.state === 'published' ? 'success' : 'neutral'}>
                {item.state}
              </Badge>
            </button>
          ))
        ) : (
          <EmptyState
            title="No forms yet"
            description="Create one for staff applications, event sign-ups or feedback."
          />
        )}
        <p className="field-hint">
          To let members open a published form from Discord, add a button with
          the “Open form” action in{' '}
          <Link to={`/dashboard/${guildId}/messages/studio`}>
            Message Studio
          </Link>
          .
        </p>
      </Card>
      {selected && (
        <FormEditor
          key={selected === 'new' ? 'new' : `${selected}:${current?.revision}`}
          guildId={guildId}
          form={selected === 'new' ? null : current}
          onSaved={(id) => setSelected(id)}
        />
      )}
    </div>
  );
}

const stateLabels: Record<string, string> = {
  submitted: 'New',
  reviewing: 'In review',
  changes_requested: 'Changes requested',
  accepted: 'Accepted',
  rejected: 'Declined',
};
function ApplicationReview({
  guildId,
  item,
}: {
  guildId: string;
  item: ApplicationRecord;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const stages = item.data.snapshot.stages;
  const final = item.data.stage >= stages.length - 1;
  const decide = useMutation({
    mutationFn: (
      decision: 'advance' | 'accept' | 'reject' | 'request_changes',
    ) => {
      const body = {
        expectedRevision: item.revision,
        decision,
        reason: reason.trim(),
      };
      return reviewApplication(
        guildId,
        item.id,
        body,
        identity('application-review', { id: item.id, body }),
      );
    },
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({
        queryKey: ['applications', guildId],
      });
    },
  });
  const closed = ['accepted', 'rejected'].includes(item.state);
  const ready = reason.trim().length >= 3;
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h2>{item.data.snapshot.name}</h2>
          <small className="muted">
            From {item.ownerId} · version {item.data.version ?? 1} · stage{' '}
            {item.data.stage + 1} of {stages.length}: {stages[item.data.stage]}
          </small>
        </div>
        <Badge
          tone={
            item.state === 'accepted'
              ? 'success'
              : item.state === 'rejected'
                ? 'danger'
                : 'warning'
          }
        >
          {stateLabels[item.state] ?? item.state}
        </Badge>
      </div>
      <dl className="detail-list">
        {item.data.snapshot.fields.map((field) => (
          <div key={field.id} style={{ display: 'contents' }}>
            <dt>{field.label}</dt>
            <dd>
              {item.data.answers[field.id] || (
                <span className="muted">No answer</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {item.data.history.length > 0 && (
        <>
          <h3>History</h3>
          {item.data.history.map((entry) => (
            <div className="activity-row" key={entry.at}>
              <span>
                <strong>{entry.decision ?? entry.event}</strong>
                {entry.reason && <small>{entry.reason}</small>}
              </span>
              <small className="muted">
                {entry.actorId} · {new Date(entry.at).toLocaleString()}
              </small>
            </div>
          ))}
        </>
      )}
      {!closed && (
        <>
          <Field
            label="Reason"
            htmlFor="review-reason"
            hint="Recorded with the decision; the applicant is notified."
          >
            <textarea
              id="review-reason"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="row">
            {final ? (
              <Button
                disabled={!ready}
                busy={decide.isPending && decide.variables === 'accept'}
                onClick={() => decide.mutate('accept')}
              >
                Accept
              </Button>
            ) : (
              <Button
                disabled={!ready}
                busy={decide.isPending && decide.variables === 'advance'}
                onClick={() => decide.mutate('advance')}
              >
                Move to {stages[item.data.stage + 1]}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={!ready}
              onClick={() => decide.mutate('request_changes')}
            >
              Request changes
            </Button>
            <Button
              variant="danger"
              disabled={!ready}
              onClick={() => decide.mutate('reject')}
            >
              Decline
            </Button>
          </div>
          {decide.error && (
            <ErrorState
              message={
                decide.error instanceof ApiError &&
                decide.error.code === 'REVISION_CONFLICT'
                  ? 'Another reviewer acted first. Your reason is kept; reload to see their decision.'
                  : errorMessage(decide.error)
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function Applications({ guildId }: { guildId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('open');
  const list = useQuery({
    queryKey: ['applications', guildId],
    queryFn: ({ signal }) => getApplications(guildId, signal),
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
        ? ['submitted', 'reviewing'].includes(row.state)
        : row.state === filter,
  );
  const current = list.data.find((row) => row.id === selected);
  return (
    <div className="overview-grid">
      <Card>
        <Field label="Show" htmlFor="application-filter">
          <select
            id="application-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="open">Waiting for review</option>
            <option value="changes_requested">Changes requested</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Declined</option>
            <option value="all">Everything</option>
          </select>
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
                <strong>{row.data.snapshot.name}</strong>
                <small>
                  {row.ownerId} · {new Date(row.createdAt).toLocaleDateString()}
                </small>
              </span>
              <Badge tone="neutral">
                {stateLabels[row.state] ?? row.state}
              </Badge>
            </button>
          ))
        ) : (
          <EmptyState
            title="Nothing to review"
            description="New applications appear here."
          />
        )}
      </Card>
      <Card>
        {current ? (
          <ApplicationReview
            key={current.id + current.revision}
            guildId={guildId}
            item={current}
          />
        ) : (
          <EmptyState
            title="Choose an application"
            description="Read the answers and record a decision."
          />
        )}
      </Card>
    </div>
  );
}

function FormsSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R25', FormsConfigSchema);
  return (
    <ConfigForm
      controller={controller.shell}
      title="Forms & applications"
      description="Reviewers need the forms review permission; it does not grant other server settings."
      enableLabel="Accept form submissions"
    >
      <span />
    </ConfigForm>
  );
}

export function FormsPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Support"
        title="Applications, reviewed fairly."
        description="Build versioned forms, review answers stage by stage, and keep every decision on record."
      />
      <Tabs
        tabs={[
          {
            id: 'applications',
            label: 'Applications',
            content: <Applications guildId={guildId} />,
          },
          {
            id: 'forms',
            label: 'Forms',
            content: <FormsList guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: <FormsSettings guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
