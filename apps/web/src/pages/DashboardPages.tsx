import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Gamepad2,
  GraduationCap,
  LifeBuoy,
  Palette,
  SlidersHorizontal,
  Sun,
  Clock3,
  Filter,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageHeading,
  Advanced,
} from '@sparko/ui';
import { featureLabel, settingChanges } from '../features/setup/diff';
import {
  getGuilds,
  getOverview,
  type Guild,
  previewSetup,
  applySetup,
} from '../services/guilds';
import { errorMessage } from '../services/http';
import { getTickets } from '../services/tickets';
import { getPublications, type Publication } from '../services/messages';
import { AnimatedIcon } from '@sparko/assets';
import { motionPreference, useUi } from '../state/ui';
import { TicketStatusBadge } from '../components/TicketStatus';
import { useActionIdentity } from '../hooks/useActionIdentity';
import { Metric, RuntimeState } from '../components/AppShell';

type GuildState = 'ready' | 'install' | 'member';
const guildState = (guild: Guild): GuildState =>
  guild.manageable ? (guild.installed ? 'ready' : 'install') : 'member';
const guildSections: { state: GuildState; title: string; hint: string }[] = [
  {
    state: 'ready',
    title: 'Ready to manage',
    hint: 'Sparko is installed and your Discord permissions let you manage it.',
  },
  {
    state: 'install',
    title: 'Add Sparko to start',
    hint: 'You can manage these servers, but Sparko is not in them yet. Adding it opens Discord so you can review the permissions it asks for.',
  },
  {
    state: 'member',
    title: 'Member access',
    hint: 'Managing a server needs the Manage Server permission or a staff role delegated in Sparko. You can still open your member profile.',
  },
];
export function ServerPickerPage() {
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['guilds'],
    queryFn: ({ signal }) => getGuilds(signal),
    staleTime: 60000,
  });
  const guilds = query.data?.filter((guild) =>
    guild.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="Your workspace"
        title="Your servers"
        description="Choose a server to manage. The list follows your current Discord access."
        actions={
          <Button
            variant="secondary"
            busy={query.isFetching && !query.isPending}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh list
          </Button>
        }
      />
      <ol className="how-it-works" aria-label="How Sparko setup works">
        <li>
          <span className="step-index">1</span>
          <span>
            <strong>Add Sparko</strong>
            <small>Invite the bot to a server you manage.</small>
          </span>
        </li>
        <li>
          <span className="step-index">2</span>
          <span>
            <strong>Open its workspace</strong>
            <small>Everything here is saved per server.</small>
          </span>
        </li>
        <li>
          <span className="step-index">3</span>
          <span>
            <strong>Follow guided setup</strong>
            <small>Preview every change before it is applied.</small>
          </span>
        </li>
      </ol>
      {(query.data?.length ?? 0) > 6 && (
        <label className="search-field server-search">
          <Filter size={17} aria-hidden="true" />
          <input
            aria-label="Search your servers"
            placeholder="Find a server…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      {query.isPending ? (
        <LoadingState label="Fetching your Discord servers…" />
      ) : query.error ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : guilds?.length ? (
        guildSections.map((section) => {
          const list = guilds.filter(
            (guild) => guildState(guild) === section.state,
          );
          if (!list.length) return null;
          return (
            <section
              key={section.state}
              className="server-section"
              aria-labelledby={`servers-${section.state}`}
            >
              <div className="section-heading">
                <div>
                  <h2 id={`servers-${section.state}`}>
                    {section.title} <span className="count">{list.length}</span>
                  </h2>
                  <p className="muted">{section.hint}</p>
                </div>
              </div>
              <div className="server-grid">
                {list.map((guild) => (
                  <Card className="server-card" key={guild.id}>
                    <div className="row space-between">
                      <span className="server-avatar large" aria-hidden="true">
                        {guild.iconUrl ? (
                          <img src={guild.iconUrl} alt="" />
                        ) : (
                          guild.name.slice(0, 1)
                        )}
                      </span>
                      <Badge
                        tone={
                          section.state === 'ready'
                            ? 'success'
                            : section.state === 'install'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {section.state === 'ready'
                          ? 'Installed'
                          : section.state === 'install'
                            ? 'Not installed'
                            : guild.installed
                              ? 'Member'
                              : 'Member · not installed'}
                      </Badge>
                    </div>
                    <h3 className="wrap-anywhere">{guild.name}</h3>
                    {section.state === 'ready' ? (
                      <Link
                        to={`/dashboard/${guild.id}`}
                        className="button button-primary"
                      >
                        Open workspace <ArrowRight size={16} />
                      </Link>
                    ) : section.state === 'install' ? (
                      guild.installUrl ? (
                        <a
                          href={guild.installUrl}
                          className="button button-primary"
                        >
                          Add Sparko <Plus size={16} />
                        </a>
                      ) : (
                        <p className="field-hint">
                          Installation is unavailable right now. Try again later
                          or contact Sparko support.
                        </p>
                      )
                    ) : guild.installed ? (
                      <Link
                        to={`/servers/${guild.id}/me`}
                        className="button button-secondary"
                      >
                        Your member profile <ArrowRight size={16} />
                      </Link>
                    ) : (
                      <p className="field-hint">
                        Ask a server manager to add Sparko.
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <EmptyState
          title={search ? 'No matching servers' : 'No servers to show yet'}
          description={
            search
              ? 'Try a different server name.'
              : 'Join or create a Discord server, then refresh this list. Owners, administrators and delegated staff can manage their servers here.'
          }
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Refresh server list
            </Button>
          }
        />
      )}
    </>
  );
}
/** A delivered, non-test message carrying a ticket-create control. */
export function isLiveTicketPanel(publication: Publication) {
  return (
    !publication.test &&
    ['applied', 'published'].includes(publication.state) &&
    JSON.stringify(publication.document ?? {}).includes('"ticket.create"')
  );
}
export function OverviewPage() {
  const { guildId = '' } = useParams();
  const query = useQuery({
    queryKey: ['overview', guildId],
    queryFn: ({ signal }) => getOverview(guildId, signal),
    refetchInterval: 15000,
  });
  const tickets = useQuery({
    queryKey: ['tickets', guildId],
    queryFn: ({ signal }) => getTickets(guildId, signal),
    retry: false,
  });
  const publications = useQuery({
    queryKey: ['publications', guildId],
    queryFn: ({ signal }) => getPublications(guildId, signal),
    retry: false,
  });
  const iconMotion = useUi((state) => motionPreference(state.motion));
  if (query.isPending)
    return <LoadingState label="Opening your server workspace…" />;
  if (query.error)
    return (
      <ErrorState
        message={errorMessage(query.error)}
        retry={() => void query.refetch()}
      />
    );
  if (!query.data) return null;
  const data = query.data;
  const enabled = data.modules.filter((m) => m.enabled);
  const base = `/dashboard/${guildId}`;
  const ticketsOn = enabled.some((m) => m.id === 'tickets');
  const steps = [
    {
      title: 'Sparko is connected',
      done: data.bot.online,
      doneText: 'The bot is online and applying saved settings.',
      todoText:
        'The bot is offline. You can still save settings; Discord changes wait until it reconnects.',
      to: undefined,
      action: '',
    },
    {
      title: 'Choose a setup goal',
      done: enabled.length > 0,
      doneText: `${enabled.length} tool${enabled.length === 1 ? '' : 's'} turned on.`,
      todoText: 'Pick a goal and preview every change before it is saved.',
      to: `${base}/setup`,
      action: 'Start guided setup',
    },
    {
      title: 'Set up tickets',
      done: ticketsOn,
      doneText: 'Members can open private support tickets.',
      todoText: 'Choose your support team and the questions members answer.',
      to: `${base}/support/tickets/config`,
      action: 'Configure tickets',
    },
    {
      title: 'Publish the ticket panel',
      done: !!publications.data?.some(isLiveTicketPanel),
      doneText: 'Your panel is live in Discord.',
      todoText:
        'Post the panel to a channel so members can find it. Saving settings alone does not post anything.',
      to: `${base}/support/tickets/config`,
      action: 'Publish the panel',
    },
  ];
  const nextStep = steps.find((step) => !step.done && step.to);
  const allDone = steps.every((step) => step.done);
  return (
    <>
      <PageHeading
        eyebrow="Server overview"
        title={data.guild.name}
        description="Your tools, activity, and next steps — all in one place."
        actions={
          <Link
            className="button button-secondary"
            to={`/dashboard/${guildId}/setup`}
          >
            <Sparkles size={16} />
            Guided setup
          </Link>
        }
      />
      <div className="row status-line">
        <Badge tone={data.bot.online ? 'success' : 'warning'}>
          {data.bot.online ? 'Bot connected' : 'Bot offline'}
        </Badge>
        <span className="muted">
          {data.bot.lastSeenAt
            ? `Last heartbeat ${new Date(data.bot.lastSeenAt).toLocaleString()}`
            : 'No heartbeat observed yet'}
        </span>
      </div>
      {!data.bot.online && (
        <div className="alert alert-warning">
          <WifiOff size={20} />
          <div>
            <strong>Settings can be saved. Discord delivery is waiting.</strong>
            <p>
              Reconnect Sparko to apply changes and complete queued
              publications.
            </p>
          </div>
        </div>
      )}
      {data.bot.issues.map((issue) => (
        <div className="alert alert-warning" key={issue}>
          <ShieldCheck size={20} />
          <p>{issue}</p>
        </div>
      ))}
      <div className="metric-grid">
        {data.metrics.length ? (
          data.metrics.map((metric) => (
            <Metric
              key={metric.id}
              label={metric.label}
              value={
                metric.value === null ? (
                  <span className="small-value">Not collected yet</span>
                ) : (
                  metric.value.toLocaleString()
                )
              }
              detail={`${metric.period} · ${metric.coverage}`}
            />
          ))
        ) : (
          <Metric
            label="Active modules"
            value={enabled.length}
            detail="From saved server configuration"
          />
        )}
      </div>
      <div className="overview-grid">
        <section className="card" aria-labelledby="getting-started">
          <div className="section-heading">
            <div>
              <h2 id="getting-started">Getting started</h2>
              <p className="muted">
                {steps.filter((step) => step.done).length} of {steps.length}{' '}
                done
              </p>
            </div>
            {allDone && (
              <AnimatedIcon
                name="setup-success"
                state="active"
                motion={iconMotion}
                size={40}
                label="Setup complete"
              />
            )}
          </div>
          <ol className="checklist">
            {steps.map((step) => (
              <li key={step.title} className={step.done ? 'done' : 'todo'}>
                {step.done ? (
                  <CheckCircle2 size={20} aria-hidden="true" />
                ) : (
                  <Circle size={20} aria-hidden="true" />
                )}
                <div>
                  <strong>
                    {step.title}
                    <span className="sr-only">
                      {step.done ? ' (done)' : ' (to do)'}
                    </span>
                  </strong>
                  <small>{step.done ? step.doneText : step.todoText}</small>
                  {!step.done && step.to && step === nextStep && (
                    <Link className="button button-primary" to={step.to}>
                      {step.action} <ArrowRight size={16} />
                    </Link>
                  )}
                  {!step.done && step.to && step !== nextStep && (
                    <Link className="text-link" to={step.to}>
                      {step.action} <ArrowRight size={15} />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Your active tools</h2>
            <Link to={`/dashboard/${guildId}/community`} className="text-link">
              Explore <ChevronRight size={14} />
            </Link>
          </div>
          {enabled.length ? (
            <div className="module-status-list">
              {enabled.map((module) => (
                <div key={module.id}>
                  <span>
                    <Zap size={16} />
                    {module.name}
                  </span>
                  <RuntimeState
                    revision={module.revision}
                    appliedRevision={module.appliedRevision}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              title="No tools turned on yet"
              description="Modules stay off until you configure them. Guided setup explains the changes before saving."
              action={
                <Link className="text-link" to={`/dashboard/${guildId}/setup`}>
                  Choose a setup goal <ArrowRight size={15} />
                </Link>
              }
            />
          )}
        </section>
      </div>
      <div className="overview-grid">
        <section className="card">
          <div className="section-heading">
            <h2>Recent tickets</h2>
            <Link
              className="text-link"
              to={`/dashboard/${guildId}/support/tickets`}
            >
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {tickets.isPending ? (
            <LoadingState />
          ) : tickets.error ? (
            <p className="muted">
              Ticket activity is unavailable for your current access.
            </p>
          ) : tickets.data?.length ? (
            tickets.data.slice(0, 5).map((ticket) => (
              <Link
                className="activity-row"
                key={ticket.id}
                to={`/dashboard/${guildId}/support/tickets/${ticket.id}`}
              >
                <span className="activity-icon">
                  <Ticket size={17} />
                </span>
                <span>
                  <strong>{ticket.subject}</strong>
                  <small>
                    #{ticket.number} ·{' '}
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </small>
                </span>
                <TicketStatusBadge status={ticket.status} />
              </Link>
            ))
          ) : (
            <EmptyState
              compact
              icon={Ticket}
              title="No tickets yet"
              description="New Discord tickets will appear here after your panel is published."
            />
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Delivery queue</h2>
            <Clock3 size={17} />
          </div>
          {data.operations.length ? (
            data.operations.map((operation) => (
              <div className="activity-row" key={operation.id}>
                <span>
                  <strong>{operation.kind.replaceAll('_', ' ')}</strong>
                  <small>
                    {new Date(operation.createdAt).toLocaleString()}
                  </small>
                </span>
                <Badge
                  tone={
                    operation.deliveryStatus === 'delivered'
                      ? 'success'
                      : 'warning'
                  }
                >
                  {operation.deliveryStatus}
                </Badge>
              </div>
            ))
          ) : (
            <EmptyState
              compact
              icon={Clock3}
              title="Nothing waiting"
              description="Pending bot deliveries and scheduled operations appear here."
            />
          )}
        </section>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>Recent changes</h2>
          <Link
            className="text-link"
            to={`/dashboard/${guildId}/insights/audit`}
          >
            Audit log <ArrowRight size={14} />
          </Link>
        </div>
        {data.activity.length ? (
          data.activity.map((event) => (
            <div key={event.id} className="activity-row">
              <CheckCircle2 size={18} />
              <span>
                <strong>{event.action.replaceAll('_', ' ')}</strong>
                <small>
                  {event.actor ?? 'System'} ·{' '}
                  {new Date(event.createdAt).toLocaleString()}
                </small>
              </span>
            </div>
          ))
        ) : (
          <p className="muted">No recorded configuration changes yet.</p>
        )}
      </section>
    </>
  );
}
const presets = [
  {
    id: 'small-community',
    title: 'Small community',
    detail: 'A warm welcome, suggestions, and a clear support path.',
    icon: Sun,
  },
  {
    id: 'gaming',
    title: 'Gaming',
    detail: 'Community progression, counting, and engagement tools.',
    icon: Gamepad2,
  },
  {
    id: 'support',
    title: 'Support',
    detail: 'Private tickets and organized staff workflows.',
    icon: LifeBuoy,
  },
  {
    id: 'creator',
    title: 'Creator',
    detail: 'Welcome new fans and collect their ideas.',
    icon: Palette,
  },
  {
    id: 'study',
    title: 'Study group',
    detail: 'Focused community spaces and helpful reminders.',
    icon: GraduationCap,
  },
  {
    id: 'custom',
    title: 'Build your own',
    detail: 'Start quietly and configure each tool yourself.',
    icon: SlidersHorizontal,
  },
];
export function SetupPage() {
  const { guildId = '' } = useParams();
  const iconMotion = useUi((state) => motionPreference(state.motion));
  const [preset, setPreset] = useState('support');
  const identity = useActionIdentity();
  const query = useQueryClient();
  const preview = useMutation({
    mutationFn: () =>
      previewSetup(guildId, preset, identity('preview', preset)),
  });
  const apply = useMutation({
    mutationFn: () => applySetup(guildId, preset, identity('apply', preset)),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ['overview', guildId] });
      void query.invalidateQueries({ queryKey: ['config', guildId] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="Three steps"
        title="Guided setup"
        description="Choose your community’s goal, review exactly what changes, then apply it. Nothing is saved until you apply."
      />
      <ol className="setup-progress" aria-label="Setup progress">
        {[
          { label: 'Choose a goal', done: preview.isSuccess },
          { label: 'Review changes', done: apply.isSuccess },
          { label: 'Configure & publish', done: false },
        ].map((step, index, all) => {
          const current = all.findIndex((item) => !item.done) === index;
          return (
            <li
              key={step.label}
              className={step.done || current ? 'active' : ''}
              aria-current={current ? 'step' : undefined}
            >
              <span aria-hidden="true">
                {step.done ? <Check size={14} /> : index + 1}
              </span>
              {step.label}
              {step.done && <span className="sr-only"> (done)</span>}
            </li>
          );
        })}
      </ol>
      <div className="preset-grid">
        {presets.map((item) => (
          <button
            key={item.id}
            className={`card preset-card ${preset === item.id ? 'selected' : ''}`}
            aria-pressed={preset === item.id}
            onClick={() => {
              setPreset(item.id);
              preview.reset();
              apply.reset();
            }}
          >
            <span className="preset-icon" aria-hidden="true">
              <item.icon size={22} />
            </span>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            {preset === item.id && (
              <Check className="preset-check" size={19} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      <div className="row">
        <Button busy={preview.isPending} onClick={() => preview.mutate()}>
          Review setup <ArrowRight size={16} />
        </Button>
        <p className="muted">
          This step previews settings and makes no changes.
        </p>
      </div>
      {preview.error && <ErrorState message={errorMessage(preview.error)} />}
      {preview.data && (
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Your configuration preview</h2>
              <p className="muted">
                Applying these settings does not create channels, assign roles,
                or publish messages.
              </p>
            </div>
            <Badge>{presets.find((item) => item.id === preset)?.title}</Badge>
          </div>
          {preview.data.data.issues.map((issue) => (
            <Notice tone="warning" key={issue} title="Check before applying">
              {issue}
            </Notice>
          ))}
          {preview.data.data.blockingIssues.map((issue) => (
            <Notice tone="danger" key={issue} title="Needs fixing first">
              {issue}
            </Notice>
          ))}
          {preview.data.data.changes.length ? (
            preview.data.data.changes.map((change) => {
              const rows = settingChanges(change.before, change.after);
              return (
                <section className="diff-row" key={change.featureId}>
                  <h3>{featureLabel(change.featureId)}</h3>
                  {rows.length ? (
                    <div className="table-wrap">
                      <table className="diff-table">
                        <thead>
                          <tr>
                            <th scope="col">Setting</th>
                            <th scope="col">Now</th>
                            <th scope="col">After applying</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.setting}>
                              <th scope="row">{row.setting}</th>
                              <td>{row.before}</td>
                              <td>
                                <strong>{row.after}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted">No visible setting changes.</p>
                  )}
                  <Advanced summary="Technical details">
                    <div className="diff-grid">
                      <div>
                        <h4>Current</h4>
                        <pre>{JSON.stringify(change.before, null, 2)}</pre>
                      </div>
                      <div>
                        <h4>Proposed</h4>
                        <pre>{JSON.stringify(change.after, null, 2)}</pre>
                      </div>
                    </div>
                  </Advanced>
                </section>
              );
            })
          ) : (
            <p className="muted">This preset has no configuration changes.</p>
          )}
          <Button
            busy={apply.isPending}
            disabled={
              preview.data.data.blockingIssues.length > 0 || apply.isSuccess
            }
            onClick={() => apply.mutate()}
          >
            {apply.isSuccess ? 'Settings saved' : 'Apply these settings'}
          </Button>
          {preview.data.data.blockingIssues.length > 0 && (
            <p className="field-hint">
              Resolve these prerequisites before applying this preset.
            </p>
          )}
        </section>
      )}
      {apply.error && <ErrorState message={errorMessage(apply.error)} />}
      {apply.data && (
        <div className="alert alert-success setup-done" role="status">
          <AnimatedIcon
            name="setup-success"
            state="active"
            motion={iconMotion}
            size={44}
          />
          <div>
            <strong>
              Settings saved
              {apply.data.operation?.deliveryStatus === 'delivered'
                ? ' and applied.'
                : '. Waiting for the bot to apply them.'}
            </strong>
            <p>
              Finish ticket configuration with your actual channels and staff
              roles, then publish your panel.
            </p>
            <div className="row wrap">
              <Link
                className="button button-primary"
                to={`/dashboard/${guildId}/support/tickets/config`}
              >
                Continue to tickets <ArrowRight size={15} />
              </Link>
              <Link
                className="button button-ghost"
                to={`/dashboard/${guildId}`}
              >
                Back to overview
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
