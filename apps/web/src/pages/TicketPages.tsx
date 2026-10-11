import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { defaultTicketDocument, MessageDocumentSchema } from '@sparko/messages';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Ticket as TicketIcon,
} from 'lucide-react';
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
import {
  getConfig,
  saveConfig,
  getChannels,
  getRoles,
} from '../services/guilds';
import {
  createTicket,
  getTicketCategories,
  getTickets,
  getTicket,
  getTicketTranscripts,
  getTicketTranscript,
  claimTicket,
  closeTicket,
  updateTicket,
  type Ticket,
} from '../services/tickets';
import { publishMessage, getPublications } from '../services/messages';
import { ApiError, errorMessage } from '../services/http';
import { RuntimeState } from '../components/AppShell';
import { MessagePreview } from '../components/MessagePreview';
import { DraftGuard } from '../hooks/useDraftGuard';
import { useActionIdentity } from '../hooks/useActionIdentity';

const TicketConfigFormSchema = z.object({
  enabled: z.boolean(),
  timezone: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Enter a valid IANA timezone.'),
  categoryChannelId: z.string(),
  panelChannelId: z.string(),
  staffRoleIds: z.array(z.string()),
  maxOpenPerMember: z.number().int().min(1).max(10),
  requireTranscriptBeforeCleanup: z.boolean(),
  categories: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,32}$/),
        name: z.string().min(1).max(80),
        description: z.string().max(500),
        fields: z
          .array(
            z.object({
              id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
              label: z.string().min(1).max(45),
              required: z.boolean(),
              maxLength: z.number().int().min(1).max(4000),
            }),
          )
          .max(20),
      }),
    )
    .min(1)
    .max(10),
});
type TicketConfigForm = z.infer<typeof TicketConfigFormSchema>;
const defaults: TicketConfigForm = {
  enabled: false,
  timezone: 'Asia/Ho_Chi_Minh',
  categoryChannelId: '',
  panelChannelId: '',
  staffRoleIds: [],
  maxOpenPerMember: 1,
  requireTranscriptBeforeCleanup: true,
  categories: [
    { id: 'general', name: 'General support', description: '', fields: [] },
  ],
};
export function TicketConfigPage() {
  const { guildId = '' } = useParams();
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [publishChannel, setPublishChannel] = useState('');
  const query = useQuery({
    queryKey: ['config', guildId, 'tickets'],
    queryFn: ({ signal }) => getConfig(guildId, 'tickets', signal),
    refetchInterval: 10000,
  });
  const channels = useQuery({
    queryKey: ['channels', guildId],
    queryFn: ({ signal }) => getChannels(guildId, signal),
  });
  const roles = useQuery({
    queryKey: ['roles', guildId],
    queryFn: ({ signal }) => getRoles(guildId, signal),
  });
  const publications = useQuery({
    queryKey: ['publications', guildId],
    queryFn: ({ signal }) => getPublications(guildId, signal),
    refetchInterval: 2000,
  });
  const form = useForm<TicketConfigForm>({
    resolver: zodResolver(TicketConfigFormSchema),
    defaultValues: defaults,
  });
  const dirty = form.formState.isDirty;
  const categories = form.watch('categories');
  const panelDraft = MessageDocumentSchema.safeParse({
    ...defaultTicketDocument,
    blocks: [
      {
        type: 'container',
        accentColor: 16436245,
        children: [
          { type: 'text', text: '## Sparko support' },
          {
            type: 'text',
            text: 'Choose a topic to open a private conversation with the support team.',
          },
          ...Array.from(
            { length: Math.ceil(categories.length / 5) },
            (_, row) => ({
              type: 'controls',
              controls: categories
                .slice(row * 5, row * 5 + 5)
                .map((category) => ({
                  type: 'button',
                  key: 'ticket:' + category.id,
                  label: category.name.slice(0, 80),
                  style: 'primary',
                  action: { type: 'ticket.create', categoryId: category.id },
                })),
            }),
          ),
        ],
      },
    ],
  });
  const panelDocument = panelDraft.success
    ? panelDraft.data
    : defaultTicketDocument;
  useEffect(() => {
    if (query.data && !dirty) {
      const values = TicketConfigFormSchema.parse({
        ...defaults,
        ...query.data.config,
      });
      form.reset(values);
      setPublishChannel((current) => current || values.panelChannelId);
    }
  }, [query.data, dirty, form]);
  const save = useMutation({
    mutationFn: (config: TicketConfigForm) => {
      const body = {
        expectedRevision: query.data?.revision ?? 0,
        config: {
          ...query.data?.config,
          ...config,
          categoryChannelId: config.categoryChannelId || undefined,
        },
      };
      return saveConfig(
        guildId,
        'tickets',
        body,
        identity('ticket-settings', body),
      );
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['config', guildId, 'tickets'], result.data);
      form.reset(
        TicketConfigFormSchema.parse({ ...defaults, ...result.data.config }),
      );
      void queryClient.invalidateQueries({ queryKey: ['overview', guildId] });
    },
  });
  const publish = useMutation({
    mutationFn: () => {
      const body = {
        channelId: publishChannel,
        document: panelDocument,
        purpose: 'ticket-panel',
      };
      return publishMessage(guildId, body, identity('ticket-panel', body));
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['publications', guildId],
      }),
  });
  if (query.isPending) return <LoadingState label="Loading ticket settings…" />;
  if (query.error)
    return (
      <ErrorState
        message={errorMessage(query.error)}
        retry={() => void query.refetch()}
      />
    );
  const conflict =
    save.error instanceof ApiError && save.error.code === 'REVISION_CONFLICT';
  return (
    <>
      <DraftGuard dirty={dirty} />
      <PageHeading
        eyebrow="Tickets & support"
        title="A good conversation starts here."
        description="Give members a private, organized path to your support team."
        actions={
          <Link
            className="button button-secondary"
            to={`/dashboard/${guildId}/support/tickets`}
          >
            <TicketIcon size={16} />
            Ticket inbox
          </Link>
        }
      />
      <div className="editor-layout">
        <form
          className="stack"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <Card>
            <div className="section-heading">
              <div>
                <h2>General settings</h2>
                <p className="muted">
                  Changes apply to new tickets. Existing ticket permissions and
                  answers keep their creation snapshot.
                </p>
              </div>
              {query.data && (
                <RuntimeState
                  revision={query.data.revision}
                  appliedRevision={query.data.appliedRevision}
                />
              )}
            </div>
            <label className="switch-row">
              <span>
                <strong>Enable tickets</strong>
                <small>
                  Allow members to create tickets from published controls.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                {...form.register('enabled')}
              />
            </label>
            <div className="form-grid">
              <Field
                label="Ticket category"
                htmlFor="parent-channel"
                hint="New private ticket channels are placed under this Discord category."
              >
                <select
                  id="parent-channel"
                  {...form.register('categoryChannelId')}
                >
                  <option value="">Choose a category</option>
                  {channels.data
                    ?.filter((channel) => channel.type === 4)
                    .map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Panel channel"
                htmlFor="panel-channel"
                hint="Default destination for your member-facing support panel."
              >
                <select id="panel-channel" {...form.register('panelChannelId')}>
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
                label="Open tickets per member"
                htmlFor="open-limit"
                error={form.formState.errors.maxOpenPerMember?.message}
                hint="Limits new open tickets from the same member."
              >
                <Input
                  id="open-limit"
                  type="number"
                  min={1}
                  max={10}
                  {...form.register('maxOpenPerMember', {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Field
                label="Server timezone"
                htmlFor="ticket-timezone"
                error={form.formState.errors.timezone?.message}
              >
                <Input id="ticket-timezone" {...form.register('timezone')} />
              </Field>
            </div>
            {channels.error && (
              <ErrorState
                message={errorMessage(channels.error)}
                retry={() => void channels.refetch()}
              />
            )}
          </Card>
          <Card>
            <h2>Your support team</h2>
            <p className="muted">
              Selected staff roles can access support tickets. Each action still
              checks current permissions.
            </p>
            <div className="role-list">
              {roles.data
                ?.filter((role) => !role.managed && role.id !== guildId)
                .map((role) => (
                  <label className="checkbox-row" key={role.id}>
                    <input
                      type="checkbox"
                      value={role.id}
                      {...form.register('staffRoleIds')}
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
            </div>
            {roles.isPending && <LoadingState label="Fetching server roles…" />}
            {roles.error && (
              <ErrorState
                message={errorMessage(roles.error)}
                retry={() => void roles.refetch()}
              />
            )}
          </Card>
          <Card>
            <h2>Ticket topics and questions</h2>
            <p className="muted">
              Each topic becomes a persistent panel button. Questions open in
              Discord before a ticket is created. Changes apply to new requests.
            </p>
            {categories.map((category, index) => (
              <fieldset className="stack" key={index}>
                <legend>Topic {index + 1}</legend>
                <Field label="Topic name" htmlFor={'category-name-' + index}>
                  <Input
                    id={'category-name-' + index}
                    {...form.register(`categories.${index}.name`)}
                  />
                </Field>
                <Field
                  label="Topic identifier"
                  htmlFor={'category-id-' + index}
                  hint="Lowercase letters, digits and hyphens. Keep an existing identifier to preserve its panel action."
                >
                  <Input
                    id={'category-id-' + index}
                    {...form.register(`categories.${index}.id`)}
                  />
                </Field>
                <Field
                  label="Topic description"
                  htmlFor={'category-description-' + index}
                >
                  <textarea
                    id={'category-description-' + index}
                    {...form.register(`categories.${index}.description`)}
                  />
                </Field>
                {category.fields.map((field, fieldIndex) => (
                  <div className="card stack" key={fieldIndex}>
                    <Field
                      label="Question"
                      htmlFor={`question-${index}-${fieldIndex}`}
                    >
                      <Input
                        id={`question-${index}-${fieldIndex}`}
                        {...form.register(
                          `categories.${index}.fields.${fieldIndex}.label`,
                        )}
                      />
                    </Field>
                    <Field
                      label="Answer identifier"
                      htmlFor={`answer-id-${index}-${fieldIndex}`}
                    >
                      <Input
                        id={`answer-id-${index}-${fieldIndex}`}
                        {...form.register(
                          `categories.${index}.fields.${fieldIndex}.id`,
                        )}
                      />
                    </Field>
                    <Field
                      label="Answer length limit"
                      htmlFor={`answer-limit-${index}-${fieldIndex}`}
                    >
                      <Input
                        type="number"
                        min={1}
                        max={4000}
                        id={`answer-limit-${index}-${fieldIndex}`}
                        {...form.register(
                          `categories.${index}.fields.${fieldIndex}.maxLength`,
                          { valueAsNumber: true },
                        )}
                      />
                    </Field>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        {...form.register(
                          `categories.${index}.fields.${fieldIndex}.required`,
                        )}
                      />
                      Answer required
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        form.setValue(
                          `categories.${index}.fields`,
                          category.fields.filter(
                            (_, position) => position !== fieldIndex,
                          ),
                          { shouldDirty: true },
                        )
                      }
                    >
                      Remove question
                    </Button>
                  </div>
                ))}
                <div className="row">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={category.fields.length >= 20}
                    onClick={() =>
                      form.setValue(
                        `categories.${index}.fields`,
                        [
                          ...category.fields,
                          {
                            id: 'question-' + (category.fields.length + 1),
                            label: 'How can we help?',
                            required: true,
                            maxLength: 1000,
                          },
                        ],
                        { shouldDirty: true },
                      )
                    }
                  >
                    Add form question
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={categories.length <= 1}
                    onClick={() =>
                      form.setValue(
                        'categories',
                        categories.filter((_, position) => position !== index),
                        { shouldDirty: true },
                      )
                    }
                  >
                    Remove topic
                  </Button>
                </div>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={categories.length >= 10}
              onClick={() =>
                form.setValue(
                  'categories',
                  [
                    ...categories,
                    {
                      id: 'topic-' + (categories.length + 1),
                      name: 'New topic',
                      description: '',
                      fields: [],
                    },
                  ],
                  { shouldDirty: true },
                )
              }
            >
              Add ticket topic
            </Button>
            {form.formState.errors.categories && (
              <p role="alert">
                Check topic identifiers, names and question lengths before
                saving.
              </p>
            )}
          </Card>
          <Card>
            <div className="row">
              <ShieldCheck className="brand-text" size={22} />
              <h2>Protect the conversation</h2>
            </div>
            <label className="switch-row">
              <span>
                <strong>Capture a transcript before cleanup</strong>
                <small>
                  If capture fails or history is incomplete, keep the Discord
                  channel for staff review.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                {...form.register('requireTranscriptBeforeCleanup')}
              />
            </label>
          </Card>
          {conflict ? (
            <div className="alert alert-warning" role="alert">
              <div>
                <strong>These settings changed while you were editing.</strong>
                <p>
                  Your draft is still here. Current revision:{' '}
                  {save.error instanceof ApiError
                    ? save.error.currentRevision
                    : 'unknown'}
                  .
                </p>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    form.reset();
                    void query.refetch();
                    save.reset();
                  }}
                >
                  Discard draft and reload
                </Button>
              </div>
            </div>
          ) : save.error ? (
            <ErrorState message={errorMessage(save.error)} />
          ) : null}
          {save.data && !dirty && (
            <p className="save-feedback" role="status">
              <CheckCircle2 size={17} />
              {save.data.data.revision === save.data.data.appliedRevision
                ? 'Settings saved and applied.'
                : 'Settings saved. Waiting for the bot to apply them.'}
            </p>
          )}
          <div className="save-bar">
            <span>
              {dirty
                ? 'You have unsaved changes'
                : `Saved revision ${query.data?.revision ?? 0}`}
            </span>
            <div className="row">
              <Button
                type="button"
                variant="secondary"
                disabled={!dirty || save.isPending}
                onClick={() =>
                  query.data &&
                  form.reset(
                    TicketConfigFormSchema.parse({
                      ...defaults,
                      ...query.data.config,
                    }),
                  )
                }
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!dirty} busy={save.isPending}>
                Save changes
              </Button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <Card className="preview-card">
            <div className="section-heading">
              <h2>Your ticket panel</h2>
              <Badge>Components V2</Badge>
            </div>
            <MessagePreview document={panelDocument} />
            <p className="field-hint">
              Publishing creates a persistent Discord message. Saving settings
              does not publish a panel.
            </p>
            <Field label="Publish destination" htmlFor="publish-channel">
              <select
                id="publish-channel"
                value={publishChannel}
                onChange={(e) => {
                  setPublishChannel(e.target.value);
                  publish.reset();
                }}
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
            <Button
              busy={publish.isPending}
              disabled={!publishChannel || dirty || !query.data?.config.enabled}
              onClick={() => publish.mutate()}
            >
              <Send size={16} />
              Publish ticket panel
            </Button>
            {dirty ? (
              <p className="field-hint">
                Save your settings before publishing.
              </p>
            ) : !query.data?.config.enabled ? (
              <p className="field-hint">
                Enable tickets and save your settings before publishing.
              </p>
            ) : !publishChannel ? (
              <p className="field-hint">
                Choose a channel to publish your panel.
              </p>
            ) : null}
            {publish.error && (
              <ErrorState message={errorMessage(publish.error)} />
            )}
            {publish.data && (
              <div className="alert alert-success" role="status">
                <p>
                  {publications.data?.find(
                    (item) => item.id === publish.data?.data.id,
                  )?.state === 'applied' ||
                  publications.data?.find(
                    (item) => item.id === publish.data?.data.id,
                  )?.state === 'published'
                    ? 'Your panel is published.'
                    : 'Publication saved. Waiting for Discord delivery.'}
                </p>
              </div>
            )}
            <Link
              className="text-link"
              to={`/dashboard/${guildId}/messages/studio`}
            >
              Customize in Message Studio <ArrowRight size={15} />
            </Link>
          </Card>
          <Card>
            <h3>Published panels</h3>
            {publications.isPending ? (
              <LoadingState />
            ) : publications.error ? (
              <p className="muted">Publication inventory is unavailable.</p>
            ) : publications.data?.length ? (
              publications.data.map((publication) => (
                <div className="activity-row" key={publication.id}>
                  <span>
                    <strong>
                      #
                      {channels.data?.find(
                        (c) => c.id === publication.channelId,
                      )?.name ?? publication.channelId}
                    </strong>
                    <small>
                      {new Date(publication.createdAt).toLocaleString()}
                    </small>
                  </span>
                  <Badge
                    tone={
                      publication.deliveryStatus === 'delivered'
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {publication.deliveryStatus}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="muted">
                Your first panel will appear here after publication is saved.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
export function TicketInboxPage({ member = false }: { member?: boolean }) {
  const { guildId = '' } = useParams();
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('general');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ['ticket-categories', guildId],
    queryFn: ({ signal }) => getTicketCategories(guildId, signal),
  });
  const query = useQuery({
    queryKey: ['tickets', guildId],
    queryFn: ({ signal }) => getTickets(guildId, signal),
    refetchInterval: 10000,
  });
  const create = useMutation({
    mutationFn: () => {
      const body = { categoryId, answers };
      return createTicket(guildId, body, identity('ticket-create', body));
    },
    onSuccess: () => {
      setOpen(false);
      setAnswers({});
      void queryClient.invalidateQueries({ queryKey: ['tickets', guildId] });
    },
  });
  const records = query.data?.filter(
    (ticket) =>
      (filter === 'all' || filter === 'closed'
        ? filter === 'all' || ticket.status === 'closed'
        : ticket.status !== 'closed') &&
      ticket.subject.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow={member ? 'Member portal' : 'Tickets & support'}
        title={member ? 'Your conversations.' : 'The support inbox.'}
        description={
          member
            ? 'Your private tickets and their current status.'
            : 'Stay close to the conversations that need your team.'
        }
        actions={
          <>
            {!member && (
              <Link
                className="button button-secondary"
                to={`/dashboard/${guildId}/support/tickets/config`}
              >
                <Settings2 size={16} />
                Configure tickets
              </Link>
            )}
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} />
              Open a ticket
            </Button>
          </>
        }
      />
      <div className="table-toolbar">
        <div className="tabs" aria-label="Ticket status">
          {['active', 'closed', 'all'].map((tab) => (
            <button
              key={tab}
              aria-pressed={filter === tab}
              className={filter === tab ? 'active' : ''}
              onClick={() => setFilter(tab)}
            >
              {tab[0]?.toUpperCase()}
              {tab.slice(1)}
            </button>
          ))}
        </div>
        <Input
          aria-label="Search tickets"
          placeholder="Search subjects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {query.isPending ? (
        <LoadingState label="Loading your ticket inbox…" />
      ) : query.error ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : records?.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Conversation</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Created</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <Link
                      to={`/dashboard/${guildId}/support/tickets/${ticket.id}`}
                      className="table-title"
                    >
                      <TicketIcon size={17} />
                      <span>
                        {ticket.subject}
                        <small>Ticket #{ticket.number}</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <Badge
                      tone={ticket.status === 'closed' ? 'neutral' : 'success'}
                    >
                      {ticket.status.replaceAll('_', ' ')}
                    </Badge>
                  </td>
                  <td>{ticket.creatorId}</td>
                  <td>{new Date(ticket.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Link
                      aria-label={`Open ticket ${ticket.number}`}
                      to={`/dashboard/${guildId}/support/tickets/${ticket.id}`}
                    >
                      <ArrowRight size={17} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            search
              ? 'No matching conversations'
              : 'A quiet inbox, a fresh start.'
          }
          description="Tickets created in Discord and on the website appear here with their real delivery and lifecycle state."
          action={
            !member && (
              <Link
                className="button button-secondary"
                to={`/dashboard/${guildId}/support/tickets/config`}
              >
                Set up your support panel <ArrowRight size={15} />
              </Link>
            )
          }
        />
      )}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Start a private conversation</Dialog.Title>
            <Dialog.Description>
              Tell the support team what you need. A private Discord ticket will
              be created when delivery succeeds.
            </Dialog.Description>
            <Field label="Support category" htmlFor="ticket-category">
              <select
                id="ticket-category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setAnswers({});
                }}
              >
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            {categories.data
              ?.find((category) => category.id === categoryId)
              ?.fields.map((field) => (
                <Field
                  label={field.label}
                  htmlFor={`answer-${field.id}`}
                  key={field.id}
                >
                  <textarea
                    id={`answer-${field.id}`}
                    required={field.required}
                    maxLength={field.maxLength}
                    value={answers[field.id] ?? ''}
                    onChange={(e) =>
                      setAnswers((current) => ({
                        ...current,
                        [field.id]: e.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            {categories.error && (
              <ErrorState message={errorMessage(categories.error)} />
            )}
            {create.error && (
              <ErrorState message={errorMessage(create.error)} />
            )}
            <div className="row">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !categories.data?.some(
                    (category) => category.id === categoryId,
                  ) ||
                  categories.data
                    ?.find((category) => category.id === categoryId)
                    ?.fields.some(
                      (field) =>
                        field.required && !(answers[field.id] ?? '').trim(),
                    )
                }
                busy={create.isPending}
                onClick={() => create.mutate()}
              >
                Create ticket
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
export function TicketDetailPage() {
  const { guildId = '', ticketId = '' } = useParams();
  const queryClient = useQueryClient();
  const identity = useActionIdentity();
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['ticket', guildId, ticketId],
    queryFn: ({ signal }) => getTicket(guildId, ticketId, signal),
    refetchInterval: 10000,
  });
  const transcripts = useQuery({
    queryKey: ['ticket-transcripts', guildId, ticketId],
    queryFn: ({ signal }) => getTicketTranscripts(guildId, ticketId, signal),
    refetchInterval: 5000,
  });
  const download = useMutation({
    mutationFn: (assetId: string) =>
      getTicketTranscript(guildId, ticketId, assetId),
    onSuccess: (transcript) => {
      const blob = new Blob([JSON.stringify(transcript, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sparko-ticket-${query.data?.number ?? ticketId}-transcript.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const action = useMutation({
    mutationFn: ({
      ticket,
      actionType,
    }: {
      ticket: Ticket;
      actionType: 'claim' | 'close' | 'release';
    }) =>
      actionType === 'claim'
        ? claimTicket(
            guildId,
            ticket,
            identity('claim', { id: ticket.id, revision: ticket.revision }),
          )
        : actionType === 'close'
          ? closeTicket(
              guildId,
              ticket,
              reason,
              identity('close', {
                id: ticket.id,
                revision: ticket.revision,
                reason,
              }),
            )
          : updateTicket(
              guildId,
              ticket,
              'release',
              {},
              identity('release', { id: ticket.id, revision: ticket.revision }),
            ),
    onSuccess: (result) => {
      queryClient.setQueryData(['ticket', guildId, ticketId], result.data);
      void queryClient.invalidateQueries({ queryKey: ['tickets', guildId] });
      setCloseOpen(false);
    },
  });
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        message={errorMessage(query.error)}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data) return null;
  const ticket = query.data;
  return (
    <>
      <Link className="text-link" to={`/dashboard/${guildId}/support/tickets`}>
        <ArrowLeft size={15} />
        Back to inbox
      </Link>
      <PageHeading
        eyebrow={`Ticket #${ticket.number}`}
        title={ticket.subject}
        description={`Created ${new Date(ticket.createdAt).toLocaleString()} · Saved revision ${ticket.revision}`}
        actions={
          <>
            {ticket.status === 'open' && (
              <Button
                busy={action.isPending}
                onClick={() => action.mutate({ ticket, actionType: 'claim' })}
              >
                Claim ticket
              </Button>
            )}
            {ticket.status === 'claimed' && (
              <Button
                variant="secondary"
                busy={action.isPending}
                onClick={() => action.mutate({ ticket, actionType: 'release' })}
              >
                Release ticket
              </Button>
            )}
            {!['closed', 'closing'].includes(ticket.status) && (
              <Button variant="danger" onClick={() => setCloseOpen(true)}>
                Close ticket
              </Button>
            )}
          </>
        }
      />
      {action.error && <ErrorState message={errorMessage(action.error)} />}
      <div className="metric-grid">
        <Card className="metric">
          <p>Status</p>
          <Badge>{ticket.status.replaceAll('_', ' ')}</Badge>
          <small>Current persisted lifecycle</small>
        </Card>
        <Card className="metric">
          <p>Assigned staff</p>
          <strong className="small-value">
            {ticket.claimantId ?? 'Unassigned'}
          </strong>
          <small>Exclusive claim is checked by the server</small>
        </Card>
        <Card className="metric">
          <p>Transcript</p>
          <Badge>
            {transcripts.isPending
              ? 'Checking capture'
              : transcripts.error
                ? 'Capture status unavailable'
                : (transcripts.data?.at(-1)?.status ?? 'Not captured')}
          </Badge>
          <small>Capture is required before destructive cleanup</small>
        </Card>
      </div>
      {ticket.channelId && (
        <a
          className="button button-secondary"
          href={`https://discord.com/channels/${guildId}/${ticket.channelId}`}
          target="_blank"
          rel="noreferrer"
        >
          Continue in Discord <ExternalLink size={16} />
        </a>
      )}
      <Card>
        <h2>Private transcripts</h2>
        <p className="muted">
          Only the ticket owner, its participants and authorized staff can
          access these retained files.
        </p>
        {transcripts.error && (
          <ErrorState
            message={errorMessage(transcripts.error)}
            retry={() => void transcripts.refetch()}
          />
        )}
        {download.error && (
          <ErrorState message={errorMessage(download.error)} />
        )}
        {transcripts.isPending ? (
          <LoadingState label="Checking retained captures…" />
        ) : transcripts.data?.length ? (
          transcripts.data.map((transcript) => (
            <div className="activity-row" key={transcript.id}>
              <span>
                <strong>
                  {transcript.status === 'complete'
                    ? 'Complete capture'
                    : transcript.status === 'partial'
                      ? 'Partial capture'
                      : transcript.status.replaceAll('_', ' ')}
                </strong>
                <small>
                  Captured {new Date(transcript.createdAt).toLocaleString()} ·
                  Expires {new Date(transcript.expiresAt).toLocaleDateString()}
                </small>
                {transcript.status === 'partial' && (
                  <p>
                    Some history or content was unavailable. Unobserved
                    deletions cannot be reconstructed.
                  </p>
                )}
              </span>
              <Button
                variant="secondary"
                busy={
                  download.isPending && download.variables === transcript.id
                }
                onClick={() => download.mutate(transcript.id)}
              >
                Download transcript
              </Button>
            </div>
          ))
        ) : (
          !transcripts.error && (
            <p className="muted">
              No retained transcript is available yet. Closing a ticket requests
              a capture before cleanup.
            </p>
          )
        )}
      </Card>
      {ticket.answers && Object.keys(ticket.answers).length > 0 && (
        <Card>
          <h2>Request details</h2>
          <dl>
            {Object.entries(ticket.answers).map(([question, answer]) => (
              <div key={question}>
                <dt>{question.replaceAll('-', ' ')}</dt>
                <dd>{answer}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      <Card>
        <h2>Conversation activity</h2>
        {ticket.events?.length ? (
          ticket.events.map((event) => (
            <div className="activity-row" key={event.id}>
              <span>
                <strong>{event.type.replaceAll('_', ' ')}</strong>
                <small>{new Date(event.createdAt).toLocaleString()}</small>
                {event.detail && <p>{event.detail}</p>}
              </span>
            </div>
          ))
        ) : (
          <p className="muted">No observed activity records available yet.</p>
        )}
      </Card>
      <Dialog.Root open={closeOpen} onOpenChange={setCloseOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Close ticket #{ticket.number}?</Dialog.Title>
            <Dialog.Description>
              Close this conversation with a clear reason. If required
              transcript capture fails, the Discord resource will be retained.
            </Dialog.Description>
            <Field label="Closure reason" htmlFor="closure-reason">
              <textarea
                id="closure-reason"
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {action.error && (
              <ErrorState message={errorMessage(action.error)} />
            )}
            <div className="row">
              <Button variant="secondary" onClick={() => setCloseOpen(false)}>
                Keep open
              </Button>
              <Button
                variant="danger"
                disabled={reason.trim().length < 3}
                busy={action.isPending}
                onClick={() => action.mutate({ ticket, actionType: 'close' })}
              >
                Close this ticket
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
