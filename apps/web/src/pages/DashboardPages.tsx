import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
  Plus,
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
  PageHeading,
} from '@sparko/ui';
import {
  getGuilds,
  getOverview,
  previewSetup,
  applySetup,
} from '../services/guilds';
import { errorMessage } from '../services/http';
import { getTickets } from '../services/tickets';
import { useActionIdentity } from '../hooks/useActionIdentity';
import { Metric, RuntimeState } from '../components/AppShell';

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
        title="Make yourself at home."
        description="Choose a server to give your community its next little spark."
      />
      <div className="workspace-welcome">
        <div>
          <span className="eyebrow">A clearer way to run your community</span>
          <h2>Good tools. Great connections.</h2>
          <p>
            Configure with confidence, make your messages your own, and keep an
            eye on what matters.
          </p>
          <Link className="text-link" to="/docs">
            A quick tour of Sparko <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <Zap fill="currentColor" size={88} />
          <span className="art-spark spark-one">✦</span>
          <span className="art-spark spark-two">✦</span>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>Your servers</h2>
          <p className="muted">
            Current Discord access determines which workspaces you can manage.
          </p>
        </div>
        <label className="search-field">
          <Filter size={17} />
          <input
            aria-label="Search your servers"
            placeholder="Find a server…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {query.isPending ? (
        <LoadingState label="Fetching your Discord servers…" />
      ) : query.error ? (
        <ErrorState
          message={errorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : guilds?.length ? (
        <div className="server-grid">
          {guilds.map((guild) => (
            <Card className="server-card" key={guild.id}>
              <div className="row space-between">
                <span className="server-avatar large">
                  {guild.iconUrl ? (
                    <img src={guild.iconUrl} alt="" />
                  ) : (
                    guild.name.slice(0, 1)
                  )}
                </span>
                <Badge tone={guild.installed ? 'success' : 'neutral'}>
                  {guild.installed ? 'Sparko installed' : 'Invite required'}
                </Badge>
              </div>
              <h3>{guild.name}</h3>
              <p>
                {guild.manageable
                  ? 'You can manage this server.'
                  : 'Member access only.'}
              </p>
              {guild.manageable && guild.installed ? (
                <Link
                  to={`/dashboard/${guild.id}`}
                  className="button button-secondary"
                >
                  Open workspace <ArrowRight size={16} />
                </Link>
              ) : guild.manageable && guild.installUrl ? (
                <a href={guild.installUrl} className="button button-primary">
                  Add Sparko <Plus size={16} />
                </a>
              ) : (
                <Link
                  to={`/servers/${guild.id}/me`}
                  className="button button-secondary"
                >
                  Your member profile <ArrowRight size={16} />
                </Link>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title={search ? 'No matching servers' : 'No servers to show yet'}
          description={
            search
              ? 'Try a different server name.'
              : 'Join a Discord server, then refresh this page. Owners, administrators, and delegated staff can manage their workspaces.'
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
  return (
    <>
      <PageHeading
        eyebrow="Server overview"
        title={`A little spark for ${data.guild.name}.`}
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
                metric.value === null ? '—' : metric.value.toLocaleString()
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
        <section className="card next-step">
          <span className="icon-tile">
            <Ticket size={22} />
          </span>
          <p className="eyebrow">A helpful next step</p>
          <h2>
            {data.modules.some((m) => m.id === 'tickets' && m.enabled)
              ? 'Make support feel personal.'
              : 'Give every question a home.'}
          </h2>
          <p>
            Set up a private ticket panel, choose your support team, and publish
            a clear way for members to reach you.
          </p>
          <Link
            className="button button-primary"
            to={`/dashboard/${guildId}/support/tickets/config`}
          >
            Configure tickets <ArrowRight size={16} />
          </Link>
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
              title="Start with what you need"
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
                <Badge>{ticket.status.replaceAll('_', ' ')}</Badge>
              </Link>
            ))
          ) : (
            <EmptyState
              title="A quiet inbox"
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
            Audit log <ExternalLink size={14} />
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
    icon: '☀',
  },
  {
    id: 'gaming',
    title: 'Gaming',
    detail: 'Community progression, counting, and engagement tools.',
    icon: '⌘',
  },
  {
    id: 'support',
    title: 'Support',
    detail: 'Private tickets and organized staff workflows.',
    icon: '↗',
  },
  {
    id: 'creator',
    title: 'Creator',
    detail: 'Welcome new fans and collect their ideas.',
    icon: '✦',
  },
  {
    id: 'study',
    title: 'Study group',
    detail: 'Focused community spaces and helpful reminders.',
    icon: '⌁',
  },
  {
    id: 'custom',
    title: 'Build your own',
    detail: 'Start quietly and configure each tool yourself.',
    icon: '+',
  },
];
export function SetupPage() {
  const { guildId = '' } = useParams();
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
        eyebrow="Guided setup"
        title="Start with a purpose."
        description="Choose your community’s goal. Review every configuration change before applying it."
      />
      <div className="setup-progress">
        <span className="active">
          <span>1</span>Choose a goal
        </span>
        <span className={preview.isSuccess ? 'active' : ''}>
          <span>2</span>Review changes
        </span>
        <span className={apply.isSuccess ? 'active' : ''}>
          <span>3</span>Configure & publish
        </span>
      </div>
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
            <span className="preset-icon">{item.icon}</span>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            {preset === item.id && <Check className="preset-check" size={19} />}
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
            <Badge>{preset}</Badge>
          </div>
          {preview.data.data.issues.map((issue) => (
            <div className="alert alert-warning" key={issue}>
              {issue}
            </div>
          ))}
          {preview.data.data.blockingIssues.map((issue) => (
            <div className="alert alert-danger" key={issue}>
              {issue}
            </div>
          ))}
          {preview.data.data.changes.length ? (
            preview.data.data.changes.map((change) => (
              <details className="diff-row" key={change.featureId}>
                <summary>
                  {change.featureId}
                  <Badge>Configuration change</Badge>
                </summary>
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
              </details>
            ))
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
        <div className="alert alert-success" role="status">
          <CheckCircle2 size={21} />
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
            <Link
              className="text-link"
              to={`/dashboard/${guildId}/support/tickets/config`}
            >
              Continue to tickets <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
