import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  FormSchema,
  PollSchema,
  EventSchema,
  ReminderSchema,
  ScheduleSchema,
  ReplySchema,
  StickySchema,
  WorkflowSchema,
  CustomCommandSchema,
  ModerationCaseSchema,
  ReportSchema,
  AppealSchema,
} from '@sparko/contracts';
import { ArrowRight, CheckCircle2, Plus, Search, Sparkles } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConflictNotice,
  configStatus,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
  SaveBar,
} from '@sparko/ui';
import {
  getConfig,
  getChannels,
  getRoles,
  getOverview,
  saveConfig,
} from '../services/guilds';
import { getTemplates } from '../services/messages';
import {
  getRecords,
  createRecord,
  recordAction,
  type RecordSchema,
} from '../services/modules';
import { ApiError, errorMessage } from '../services/http';
import { RuntimeState } from '../components/AppShell';
import { modules, groupNames, type ModuleDefinition } from '../content/modules';
import { moduleIcon } from '../content/moduleIcons';
import { DraftGuard } from '../hooks/useDraftGuard';
import { useActionIdentity } from '../hooks/useActionIdentity';

const objectSchema = z.record(z.string(), z.unknown());
function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
function linesValue(value: unknown) {
  const parsed = z.array(z.string()).safeParse(value);
  return parsed.success ? parsed.data.join('\n') : '';
}
function dateValue(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : '';
}
function humanize(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/^./, (first) => first.toUpperCase())
    .replace(/Ids$/, 'IDs')
    .replace(/Id$/, 'ID');
}
const hints: Record<string, string> = {
  enabled:
    'Off until configured. Enabling allows this module’s real runtime actions.',
  timezone: 'IANA timezone used for local schedule interpretation.',
  cooldownSeconds:
    'Minimum seconds between eligible actions for the same scope.',
  minimumAccountAgeDays: 'Discord account age required before participation.',
  excludedRoleIds: 'Members with these roles are excluded.',
  channelId: 'Actual Discord destination for this feature.',
  mode: 'Observe records matches without punishment; enforce allows configured actions.',
  maxActions: 'Maximum consequential actions in one workflow.',
  requireTranscriptBeforeCleanup:
    'Retain the Discord resource when required capture fails.',
};
function ConfigValue({
  name,
  value,
  onChange,
  channels,
  roles,
  path = '',
}: {
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  path?: string;
}) {
  const id = `setting-${path}-${name}`;
  if (typeof value === 'boolean')
    return (
      <label className="switch-row">
        <span>
          <strong>{humanize(name)}</strong>
          <small>
            {hints[name] ?? 'Applied to this feature’s configured scope.'}
          </small>
        </span>
        <input
          aria-label={humanize(name)}
          type="checkbox"
          role="switch"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  if (typeof value === 'number')
    return (
      <Field label={humanize(name)} htmlFor={id} hint={hints[name]}>
        <Input
          id={id}
          type="number"
          value={value}
          onChange={(e) =>
            onChange(e.target.value === '' ? 0 : Number(e.target.value))
          }
        />
      </Field>
    );
  if (typeof value === 'string')
    return (
      <Field label={humanize(name)} htmlFor={id} hint={hints[name]}>
        {/channelId|categoryId|lobbyChannelId/i.test(name) ? (
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Choose a channel</option>
            {channels.map((channel) => (
              <option value={channel.id} key={channel.id}>
                # {channel.name}
              </option>
            ))}
          </select>
        ) : /roleId/i.test(name) ? (
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Choose a role</option>
            {roles.map((role) => (
              <option value={role.id} key={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        ) : value.length > 150 || /text|description|message/i.test(name) ? (
          <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
    );
  if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    return (
      <Field
        label={humanize(name)}
        htmlFor={id}
        hint={hints[name] ?? 'One value per line. Empty lines are ignored.'}
      >
        <textarea
          id={id}
          value={value.join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n').filter(Boolean))}
        />
      </Field>
    );
  return (
    <details className="advanced-setting">
      <summary>
        {humanize(name)} <Badge>Structured settings</Badge>
      </summary>
      <JsonSetting value={value} id={id} onChange={onChange} />
    </details>
  );
}
function JsonSetting({
  value,
  id,
  onChange,
}: {
  value: unknown;
  id: string;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState('');
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <Field
      label="Structured configuration"
      htmlFor={id}
      error={error}
      hint="The server validates this configuration before it can be saved."
    >
      <textarea
        id={id}
        rows={8}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed: unknown = JSON.parse(e.target.value);
            onChange(parsed);
            setError('');
          } catch {
            setError('Complete the JSON structure before saving.');
          }
        }}
      />
    </Field>
  );
}
export function ModuleIndexPage({ group }: { group?: string }) {
  const { guildId = '', group: routeGroup } = useParams();
  const selected = group ?? routeGroup ?? 'community';
  const [search, setSearch] = useState('');
  const overview = useQuery({
    queryKey: ['overview', guildId],
    queryFn: ({ signal }) => getOverview(guildId, signal),
  });
  const list = modules.filter(
    (module) =>
      module.group === selected &&
      `${module.name} ${module.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="Your server’s tools"
        title={groupNames[selected] ?? humanize(selected)}
        description="Choose a tool to set it up. Each tool stays off until you turn it on and save, and its page shows saved settings, whether the bot has applied them, and real activity."
      />
      <label className="search-field module-search">
        <Search size={17} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a module…"
          aria-label="Search modules"
        />
      </label>
      <div className="feature-grid">
        {list.map((module) => {
          const state = overview.data?.modules.find(
            (item) => item.id === module.id,
          );
          const Icon = moduleIcon(module.slug);
          const status = state?.enabled
            ? configStatus(state.revision, state.appliedRevision)
            : null;
          return (
            <Card key={module.id} className="feature-card module-card">
              <div className="row space-between">
                <span className="icon-tile" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <Badge tone={status?.tone ?? 'neutral'}>
                  {status ? status.label : 'Off'}
                </Badge>
              </div>
              <h3>
                <Link
                  className="card-link"
                  to={`/dashboard/${guildId}/${module.group}/${module.slug}`}
                >
                  {module.name}
                </Link>
              </h3>
              <p>{module.description}</p>
              <div className="feature-card-bottom">
                <span className="text-link" aria-hidden="true">
                  {state?.enabled ? 'Manage' : 'Set up'}{' '}
                  <ArrowRight size={15} />
                </span>
              </div>
            </Card>
          );
        })}
      </div>
      {!list.length && (
        <EmptyState
          title="No matching modules"
          description="Try another name or choose a different navigation group."
        />
      )}
    </>
  );
}

type CreateField = {
  name: string;
  label: string;
  kind?:
    | 'text'
    | 'long'
    | 'number'
    | 'date'
    | 'channel'
    | 'template'
    | 'json'
    | 'lines'
    | 'select';
  options?: string[];
};
type CreateDefinition = {
  schema: z.ZodType;
  fields: CreateField[];
  initial: Record<string, unknown>;
  wrap?: string;
  warning?: string;
};
const createDefinitions: Record<string, CreateDefinition> = {
  polls: {
    schema: PollSchema,
    fields: [
      { name: 'question', label: 'Question' },
      { name: 'choices', label: 'Choices — one per line', kind: 'lines' },
      { name: 'endsAt', label: 'Poll deadline', kind: 'date' },
      { name: 'channelId', label: 'Channel', kind: 'channel' },
      { name: 'maxSelections', label: 'Maximum selections', kind: 'number' },
    ],
    initial: { question: '', choices: [], endsAt: '', maxSelections: 1 },
  },
  events: {
    schema: EventSchema,
    fields: [
      { name: 'title', label: 'Event title' },
      { name: 'description', label: 'Description', kind: 'long' },
      { name: 'startsAt', label: 'Starts at', kind: 'date' },
      { name: 'endsAt', label: 'Ends at', kind: 'date' },
      { name: 'timezone', label: 'Timezone' },
      { name: 'capacity', label: 'Capacity', kind: 'number' },
      { name: 'channelId', label: 'Announcement channel', kind: 'channel' },
    ],
    initial: {
      title: '',
      description: '',
      startsAt: '',
      endsAt: '',
      timezone: 'Asia/Ho_Chi_Minh',
      capacity: 10,
    },
  },
  reminders: {
    schema: ReminderSchema,
    fields: [
      { name: 'text', label: 'Reminder text', kind: 'long' },
      { name: 'dueAt', label: 'Due at', kind: 'date' },
      { name: 'timezone', label: 'Timezone' },
    ],
    initial: {
      text: '',
      dueAt: '',
      timezone: 'Asia/Ho_Chi_Minh',
      destination: { type: 'dm' },
    },
  },
  schedules: {
    schema: ScheduleSchema,
    fields: [
      { name: 'name', label: 'Schedule name' },
      { name: 'channelId', label: 'Destination channel', kind: 'channel' },
      {
        name: 'templateVersionId',
        label: 'Saved template version',
        kind: 'template',
      },
      { name: 'dueAt', label: 'First run', kind: 'date' },
      { name: 'timezone', label: 'Timezone' },
    ],
    initial: {
      name: '',
      channelId: '',
      templateVersionId: '',
      dueAt: '',
      timezone: 'Asia/Ho_Chi_Minh',
    },
  },
  replies: {
    schema: ReplySchema,
    fields: [
      { name: 'name', label: 'Rule name' },
      {
        name: 'match',
        label: 'Match condition',
        kind: 'select',
        options: ['exact', 'contains', 'starts_with'],
      },
      { name: 'pattern', label: 'Pattern' },
      { name: 'text', label: 'Reply text', kind: 'long' },
      { name: 'cooldownSeconds', label: 'Cooldown seconds', kind: 'number' },
    ],
    initial: {
      name: '',
      match: 'exact',
      pattern: '',
      text: '',
      cooldownSeconds: 60,
    },
  },
  sticky: {
    schema: StickySchema,
    fields: [
      { name: 'channelId', label: 'Channel', kind: 'channel' },
      {
        name: 'templateVersionId',
        label: 'Saved template version',
        kind: 'template',
      },
      { name: 'debounceSeconds', label: 'Debounce seconds', kind: 'number' },
    ],
    initial: { channelId: '', templateVersionId: '', debounceSeconds: 15 },
  },
  workflows: {
    schema: WorkflowSchema,
    fields: [
      { name: 'name', label: 'Workflow name' },
      {
        name: 'trigger',
        label: 'Trigger',
        kind: 'select',
        options: ['manual', 'message', 'join', 'custom'],
      },
      { name: 'steps', label: 'Typed workflow steps', kind: 'json' },
      { name: 'maxActions', label: 'Maximum actions', kind: 'number' },
    ],
    initial: { name: '', trigger: 'manual', steps: [], maxActions: 5 },
  },
  'custom-commands': {
    schema: CustomCommandSchema,
    fields: [
      { name: 'name', label: 'Command name (spark-name)' },
      { name: 'description', label: 'Description' },
      { name: 'workflowId', label: 'Saved workflow ID' },
    ],
    initial: { name: 'spark-', description: '', workflowId: '' },
  },
  forms: {
    schema: FormSchema,
    wrap: 'form',
    fields: [
      { name: 'name', label: 'Form name' },
      { name: 'description', label: 'Description', kind: 'long' },
      { name: 'fields', label: 'Form fields', kind: 'json' },
      { name: 'stages', label: 'Review stages', kind: 'lines' },
      {
        name: 'maxSubmissions',
        label: 'Submissions per member',
        kind: 'number',
      },
    ],
    initial: {
      name: '',
      description: '',
      fields: [],
      stages: ['Review'],
      maxSubmissions: 1,
    },
  },
  cases: {
    schema: ModerationCaseSchema,
    fields: [
      {
        name: 'action',
        label: 'Action',
        kind: 'select',
        options: [
          'warn',
          'timeout',
          'kick',
          'ban',
          'unban',
          'note',
          'purge',
          'slowmode',
          'lock',
          'unlock',
        ],
      },
      { name: 'targetId', label: 'Target member ID' },
      { name: 'channelId', label: 'Target channel', kind: 'channel' },
      { name: 'reason', label: 'Reason', kind: 'long' },
      { name: 'durationSeconds', label: 'Duration seconds', kind: 'number' },
      { name: 'count', label: 'Purge message count', kind: 'number' },
      { name: 'slowmodeSeconds', label: 'Slowmode seconds', kind: 'number' },
    ],
    initial: { action: 'warn', reason: '', confirm: false },
    warning:
      'Check the target, affected scope, and reason before sending a consequential moderation action.',
  },
  reports: {
    schema: ReportSchema,
    fields: [
      { name: 'subject', label: 'Report subject' },
      { name: 'targetId', label: 'Target member ID' },
      { name: 'description', label: 'What happened?', kind: 'long' },
      {
        name: 'evidence',
        label: 'HTTPS evidence URLs — one per line',
        kind: 'lines',
      },
    ],
    initial: { subject: '', description: '', evidence: [] },
  },
  appeals: {
    schema: AppealSchema,
    fields: [
      { name: 'caseId', label: 'Original case ID' },
      { name: 'description', label: 'Appeal details', kind: 'long' },
    ],
    initial: { caseId: '', description: '' },
  },
  suggestions: {
    schema: z.object({
      content: z.string().min(1).max(4000),
      visibility: z.enum(['public', 'private']).default('public'),
    }),
    fields: [
      { name: 'content', label: 'Your suggestion', kind: 'long' },
      {
        name: 'visibility',
        label: 'Visibility',
        kind: 'select',
        options: ['public', 'private'],
      },
    ],
    initial: { content: '', visibility: 'public' },
  },
  questions: {
    schema: z.object({
      content: z.string().min(1).max(4000),
      visibility: z.enum(['public', 'private']).default('public'),
    }),
    fields: [
      { name: 'content', label: 'Your question', kind: 'long' },
      {
        name: 'visibility',
        label: 'Visibility',
        kind: 'select',
        options: ['public', 'private'],
      },
    ],
    initial: { content: '', visibility: 'public' },
  },
};
export function ModulePage() {
  const { guildId = '', module: slug = '', group = '' } = useParams();
  const definition = modules.find(
    (item) => item.slug === slug && (!group || item.group === group),
  );
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState('');
  const [tab, setTab] = useState('settings');
  const query = useQuery({
    queryKey: ['config', guildId, definition?.id],
    queryFn: ({ signal }) => getConfig(guildId, definition?.id ?? '', signal),
    enabled: !!definition,
  });
  const channels = useQuery({
    queryKey: ['channels', guildId],
    queryFn: ({ signal }) => getChannels(guildId, signal),
  });
  const roles = useQuery({
    queryKey: ['roles', guildId],
    queryFn: ({ signal }) => getRoles(guildId, signal),
  });
  const dirty = draft !== null && JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (query.data && !dirty) {
      setDraft(query.data.config);
      setSaved(JSON.stringify(query.data.config));
    }
  }, [query.data, dirty]);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        expectedRevision: query.data?.revision ?? 0,
        config: draft ?? {},
      };
      return saveConfig(
        guildId,
        definition?.id ?? '',
        body,
        identity('module-config', body),
      );
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        ['config', guildId, definition?.id],
        result.data,
      );
      setDraft(result.data.config);
      setSaved(JSON.stringify(result.data.config));
      void queryClient.invalidateQueries({ queryKey: ['overview', guildId] });
    },
  });
  if (!definition)
    return <ErrorState message="This module route is unavailable." />;
  return (
    <>
      <DraftGuard dirty={dirty} />
      <PageHeading
        eyebrow={groupNames[definition.group] ?? definition.group}
        title={definition.name}
        description={definition.description}
      />
      <div className="tabs module-tabs">
        <button
          aria-pressed={tab === 'settings'}
          onClick={() => setTab('settings')}
        >
          General settings
        </button>
        {definition.resource && (
          <button
            aria-pressed={tab === 'activity'}
            onClick={() => setTab('activity')}
          >
            Activity & actions
          </button>
        )}
        <button
          aria-pressed={tab === 'design'}
          onClick={() => setTab('design')}
        >
          Messages & design
        </button>
      </div>
      {tab === 'design' ? (
        <Card>
          <span className="icon-tile">
            <Sparkles size={23} />
          </span>
          <h2 style={{ marginTop: 20 }}>
            One design system, every conversation.
          </h2>
          <p className="muted">
            Use versioned message designs with explicit V2 or embed output.
            Publishing and tests use their own authorized delivery operations.
          </p>
          <Link
            className="button button-primary"
            to={`/dashboard/${guildId}/messages/studio`}
          >
            Open Message Studio <ArrowRight size={15} />
          </Link>
        </Card>
      ) : tab === 'activity' && definition.resource ? (
        <RecordWorkspace guildId={guildId} definition={definition} />
      ) : query.isPending ? (
        <LoadingState
          label={`Loading ${definition.name.toLowerCase()} settings…`}
        />
      ) : query.error ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : (
        draft && (
          <form
            className="stack module-form"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Card>
              <div className="section-heading">
                <div>
                  <h2>General settings</h2>
                  <p className="muted">
                    Saved settings and runtime application are tracked
                    independently.
                  </p>
                </div>
                {query.data && (
                  <RuntimeState
                    revision={query.data.revision}
                    appliedRevision={query.data.appliedRevision}
                  />
                )}
              </div>
              {Object.entries(draft).map(([name, value]) => (
                <ConfigValue
                  key={name}
                  name={name}
                  value={value}
                  onChange={(next) =>
                    setDraft((current) => ({ ...current, [name]: next }))
                  }
                  channels={channels.data ?? []}
                  roles={roles.data ?? []}
                />
              ))}
              <details className="advanced-setting">
                <summary>Advanced configuration</summary>
                <JsonSetting
                  value={draft}
                  id="full-config"
                  onChange={(value) => {
                    const parsed = objectSchema.safeParse(value);
                    if (parsed.success) setDraft(parsed.data);
                  }}
                />
              </details>
            </Card>
            {save.error instanceof ApiError &&
            save.error.code === 'REVISION_CONFLICT' ? (
              <ConflictNotice
                currentRevision={save.error.currentRevision}
                onKeepMine={() => {
                  save.reset();
                  void query.refetch();
                }}
                onLoadLatest={() => {
                  setDraft(null);
                  setSaved('');
                  void query.refetch();
                  save.reset();
                }}
              />
            ) : (
              save.error && <ErrorState message={errorMessage(save.error)} />
            )}
            {save.data && !dirty && (
              <p className="save-feedback" role="status">
                <CheckCircle2 size={16} aria-hidden="true" />
                {save.data.data.revision === save.data.data.appliedRevision
                  ? 'Saved and applied.'
                  : 'Settings saved. Waiting for the bot to apply them.'}
              </p>
            )}
            <SaveBar
              dirty={dirty}
              saving={save.isPending}
              savedLabel={
                configStatus(
                  query.data?.revision ?? 0,
                  query.data?.appliedRevision ?? 0,
                ).saved
              }
              onDiscard={() => {
                setDraft(query.data?.config ?? {});
                setSaved(JSON.stringify(query.data?.config ?? {}));
              }}
            />
          </form>
        )
      )}
    </>
  );
}
function recordData(record: z.infer<typeof RecordSchema>) {
  const parsed = objectSchema.safeParse(record['data']);
  return parsed.success ? parsed.data : {};
}
function RecordWorkspace({
  guildId,
  definition,
}: {
  guildId: string;
  definition: ModuleDefinition;
}) {
  const resource = definition.resource ?? '';
  const createDef = createDefinitions[resource];
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    structuredClone(createDef?.initial ?? {}),
  );
  const [issues, setIssues] = useState<string[]>([]);
  const [actionInput, setActionInput] = useState<Record<string, unknown>>({});
  const [selectedRecord, setSelectedRecord] = useState<z.infer<
    typeof RecordSchema
  > | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const query = useQuery({
    queryKey: ['records', guildId, resource],
    queryFn: ({ signal }) => getRecords(guildId, resource, signal),
    refetchInterval: 15000,
  });
  const channels = useQuery({
    queryKey: ['channels', guildId],
    queryFn: ({ signal }) => getChannels(guildId, signal),
  });
  const templates = useQuery({
    queryKey: ['templates', guildId],
    queryFn: ({ signal }) => getTemplates(guildId, signal),
    enabled: !!createDef?.fields.some((field) => field.kind === 'template'),
  });
  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: ['records', guildId, resource],
    });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      createRecord(
        guildId,
        resource,
        body,
        identity('create-' + resource, body),
      ),
    onSuccess: () => {
      setValues(structuredClone(createDef?.initial ?? {}));
      refresh();
    },
  });
  const action = useMutation({
    mutationFn: () => {
      const input = {
        ...actionInput,
        expectedRevision:
          typeof selectedRecord?.['revision'] === 'number'
            ? selectedRecord['revision']
            : 0,
      };
      return recordAction(
        guildId,
        resource,
        selectedRecord?.id ?? '',
        selectedAction,
        input,
        identity('record-action', {
          id: selectedRecord?.id,
          action: selectedAction,
          input,
        }),
      );
    },
    onSuccess: () => {
      refresh();
      setSelectedRecord(null);
      setSelectedAction('');
    },
  });
  const submit = () => {
    if (!createDef) return;
    const parsed = createDef.schema.safeParse(values);
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map(
          (issue) => `${humanize(issue.path.join('.'))}: ${issue.message}`,
        ),
      );
      return;
    }
    setIssues([]);
    const body = objectSchema.parse(parsed.data);
    create.mutate(createDef.wrap ? { [createDef.wrap]: body } : body);
  };
  const actionNames: Record<string, string[]> = {
    forms: ['publish'],
    polls: ['votes', 'close'],
    events: ['rsvp', 'cancel'],
    reminders: ['cancel'],
    schedules: ['cancel'],
    workflows: ['test', 'run'],
    giveaways: ['entry', 'draw', 'reroll', 'claim'],
    crates: ['claim'],
    suggestions: ['vote', 'decision'],
    questions: ['answer', 'resolve'],
    reports: ['decision'],
    cases: [],
    trades: ['accept', 'cancel'],
    auctions: ['bid', 'cancel'],
  };
  return (
    <div className={createDef ? 'editor-layout' : 'stack'}>
      {createDef && (
        <Card>
          <h2>
            {resource === 'cases'
              ? 'Create a moderation case'
              : `Create ${definition.name.toLowerCase()}`}
          </h2>
          <p className="muted">
            This action uses the same validated domain rules as Discord.
            Delivery status is separate from the committed record.
          </p>
          {createDef.warning && (
            <div className="alert alert-warning">{createDef.warning}</div>
          )}
          {createDef.fields.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              htmlFor={`create-${field.name}`}
            >
              {field.kind === 'channel' ? (
                <select
                  id={`create-${field.name}`}
                  value={stringValue(values[field.name])}
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">Choose a channel</option>
                  {channels.data
                    ?.filter((channel) => [0, 5, 2, 4].includes(channel.type))
                    .map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        # {channel.name}
                      </option>
                    ))}
                </select>
              ) : field.kind === 'template' ? (
                <select
                  id={`create-${field.name}`}
                  value={stringValue(values[field.name])}
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: e.target.value,
                    }))
                  }
                >
                  <option value="">Choose a saved version</option>
                  {templates.data?.map((item) => (
                    <option
                      key={item.id}
                      value={item.latestVersionId}
                      disabled={!item.latestVersionId}
                    >
                      {item.name} · r{item.revision}
                    </option>
                  ))}
                </select>
              ) : field.kind === 'select' ? (
                <select
                  id={`create-${field.name}`}
                  value={String(values[field.name] ?? '')}
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: e.target.value,
                    }))
                  }
                >
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {humanize(option)}
                    </option>
                  ))}
                </select>
              ) : field.kind === 'json' ? (
                <JsonSetting
                  id={`create-${field.name}`}
                  value={values[field.name]}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: value,
                    }))
                  }
                />
              ) : field.kind === 'lines' ? (
                <textarea
                  id={`create-${field.name}`}
                  value={linesValue(values[field.name])}
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: e.target.value.split('\n').filter(Boolean),
                    }))
                  }
                />
              ) : field.kind === 'long' ? (
                <textarea
                  id={`create-${field.name}`}
                  value={String(values[field.name] ?? '')}
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: e.target.value,
                    }))
                  }
                />
              ) : (
                <Input
                  id={`create-${field.name}`}
                  type={
                    field.kind === 'date'
                      ? 'datetime-local'
                      : field.kind === 'number'
                        ? 'number'
                        : 'text'
                  }
                  value={
                    field.kind === 'date'
                      ? dateValue(values[field.name])
                      : String(values[field.name] ?? '')
                  }
                  onChange={(e) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]:
                        field.kind === 'date'
                          ? e.target.value
                            ? new Date(e.target.value).toISOString()
                            : ''
                          : field.kind === 'number'
                            ? e.target.value
                              ? Number(e.target.value)
                              : undefined
                            : e.target.value || undefined,
                    }))
                  }
                />
              )}
            </Field>
          ))}
          {resource === 'cases' && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={values['confirm'] === true}
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    confirm: e.target.checked,
                  }))
                }
              />
              I confirm the target, affected scope, and action.
            </label>
          )}
          {issues.length > 0 && (
            <div className="alert alert-danger" role="alert">
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {create.error && <ErrorState message={errorMessage(create.error)} />}
          <Button busy={create.isPending} onClick={submit}>
            <Plus size={16} />
            Submit {resource === 'cases' ? 'case' : 'record'}
          </Button>
          {create.data && (
            <p className="save-feedback" role="status">
              Record committed. Delivery:{' '}
              {create.data.operation?.deliveryStatus ??
                'No external delivery requested'}
              .
            </p>
          )}
        </Card>
      )}
      <Card>
        <div className="section-heading">
          <h2>Recorded activity</h2>
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState
            message={errorMessage(query.error)}
            retry={() => void query.refetch()}
          />
        ) : query.data?.length ? (
          query.data.map((record) => {
            const data = recordData(record);
            const title = [
              record.name,
              record.title,
              data['name'],
              data['title'],
              data['question'],
              data['content'],
              data['subject'],
            ].find((value) => typeof value === 'string');
            return (
              <details key={record.id} className="record-details">
                <summary>
                  <span>
                    {typeof title === 'string'
                      ? title
                      : humanize(String(record['kind'] ?? definition.name))}
                  </span>
                  <Badge>
                    {typeof record['state'] === 'string'
                      ? record['state']
                      : (record.status ?? 'Recorded')}
                  </Badge>
                </summary>
                <div className="record-body">
                  <dl>
                    {Object.entries(data)
                      .filter(
                        ([, value]) =>
                          typeof value === 'string' ||
                          typeof value === 'number' ||
                          typeof value === 'boolean',
                      )
                      .map(([name, value]) => (
                        <div key={name}>
                          <dt>{humanize(name)}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                  <details>
                    <summary>Full record details</summary>
                    <pre>{JSON.stringify(record, null, 2)}</pre>
                  </details>
                  <div className="row record-actions">
                    {actionNames[resource]?.map((name) => (
                      <Button
                        key={name}
                        variant="secondary"
                        onClick={() => {
                          setSelectedRecord(record);
                          setSelectedAction(name);
                          setActionInput(
                            name === 'vote'
                              ? { value: 1 }
                              : name === 'rsvp'
                                ? { status: 'going' }
                                : {},
                          );
                        }}
                      >
                        {humanize(name)}
                      </Button>
                    ))}
                  </div>
                </div>
              </details>
            );
          })
        ) : (
          <EmptyState
            title="No recorded activity yet"
            description="Real records and their state will appear here after authorized actions or observed Discord events."
          />
        )}
        {selectedRecord && (
          <div className="action-form">
            <h3>{humanize(selectedAction)}</h3>
            {['decision', 'reroll', 'cancel', 'answer', 'bid'].includes(
              selectedAction,
            ) && (
              <Field
                label={
                  selectedAction === 'answer'
                    ? 'Answer'
                    : selectedAction === 'bid'
                      ? 'Bid amount'
                      : 'Reason'
                }
                htmlFor="action-reason"
              >
                <textarea
                  id="action-reason"
                  value={String(
                    actionInput[
                      selectedAction === 'answer'
                        ? 'answer'
                        : selectedAction === 'bid'
                          ? 'amount'
                          : 'reason'
                    ] ?? '',
                  )}
                  onChange={(e) =>
                    setActionInput((current) => ({
                      ...current,
                      [selectedAction === 'answer'
                        ? 'answer'
                        : selectedAction === 'bid'
                          ? 'amount'
                          : 'reason']: e.target.value,
                    }))
                  }
                />
              </Field>
            )}
            {selectedAction === 'decision' && (
              <Field label="Decision" htmlFor="action-decision">
                <select
                  id="action-decision"
                  value={String(
                    actionInput[
                      resource === 'suggestions' ? 'status' : 'decision'
                    ] ?? '',
                  )}
                  onChange={(e) =>
                    setActionInput((current) => ({
                      ...current,
                      [resource === 'suggestions' ? 'status' : 'decision']:
                        e.target.value,
                    }))
                  }
                >
                  <option value="">Choose a decision</option>
                  {(resource === 'suggestions'
                    ? ['accepted', 'rejected', 'planned']
                    : ['investigating', 'accepted', 'rejected', 'closed']
                  ).map((value) => (
                    <option key={value} value={value}>
                      {humanize(value)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {selectedAction === 'votes' && (
              <Field label="Choice indexes (zero based)" htmlFor="vote-choices">
                <Input
                  id="vote-choices"
                  placeholder="0, 1"
                  onChange={(e) =>
                    setActionInput({
                      choices: e.target.value
                        .split(',')
                        .filter(Boolean)
                        .map((value) => Number(value.trim())),
                    })
                  }
                />
              </Field>
            )}
            {selectedAction === 'rsvp' && (
              <Field label="RSVP" htmlFor="rsvp-status">
                <select
                  id="rsvp-status"
                  value={String(actionInput['status'] ?? 'going')}
                  onChange={(e) => setActionInput({ status: e.target.value })}
                >
                  <option value="going">Going</option>
                  <option value="not_going">Not going</option>
                </select>
              </Field>
            )}
            {action.error && (
              <ErrorState message={errorMessage(action.error)} />
            )}
            <div className="row">
              <Button
                variant="secondary"
                onClick={() => setSelectedRecord(null)}
              >
                Cancel
              </Button>
              <Button busy={action.isPending} onClick={() => action.mutate()}>
                Confirm {humanize(selectedAction).toLowerCase()}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
