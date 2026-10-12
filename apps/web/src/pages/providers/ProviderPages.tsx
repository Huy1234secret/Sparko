import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Copy,
  Music,
  Plug,
  Radio,
  RefreshCw,
  Rss,
  Sparkles,
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
  Notice,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import {
  ChannelField,
  NumberField,
  RoleChecklist,
  SwitchField,
  fieldError,
} from '../../features/config/fields';
import {
  AutomationSettings,
  ChannelName,
  OffNotice,
  StateBadge,
} from '../../features/automation/shared';
import { DurationField } from '../../features/economy/fields';
import { useRetryKey } from '../../features/economy/shared';
import {
  createSource,
  createWebhook,
  disableSource,
  getProviderStatus,
  getSocial,
  getWebhooks,
  newSigningSecret,
  pollSource,
  providerNames,
  revokeWebhook,
  sourceLabel,
  webhookEvents,
  type ProviderStatus,
  type Source,
} from '../../services/providers';
import { ApiError, errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

type ProviderKey = keyof ProviderStatus;
const providerTitles: Record<ProviderKey, string> = {
  rss: 'RSS and Atom feeds',
  youtube: 'YouTube',
  github: 'GitHub releases',
  twitch: 'Twitch',
  ai: 'AI text provider',
  music: 'Voice playback',
  billing: 'Payments',
};
function useProviderStatus(guildId: string) {
  return useQuery({
    queryKey: ['providers', guildId],
    queryFn: ({ signal }) => getProviderStatus(guildId, signal),
    retry: false,
  });
}
/**
 * What the Sparko operator has set up for each provider. "Ready" means the
 * configuration exists; it never claims the provider accepted a request.
 */
export function ProviderPanel({
  guildId,
  providers,
}: {
  guildId: string;
  providers: ProviderKey[];
}) {
  const status = useProviderStatus(guildId);
  return (
    <Card>
      <h2>Provider status</h2>
      {status.isPending ? (
        <LoadingState label="Checking providers…" />
      ) : status.error ? (
        status.error instanceof ApiError && status.error.status === 403 ? (
          <p className="muted">
            Server managers with settings access can see which providers the
            operator has set up.
          </p>
        ) : (
          <ErrorState message={errorMessage(status.error)} />
        )
      ) : (
        <>
          <ul className="row-list">
            {providers.map((key) => {
              const item = status.data[key];
              const note =
                key === 'github'
                  ? status.data.github.authenticated
                    ? 'Uses the operator’s token for higher limits.'
                    : 'Works without a token, at GitHub’s public rate limit.'
                  : item.available
                    ? 'Configured by the Sparko operator.'
                    : 'The Sparko operator hasn’t set this up yet.';
              return (
                <li className="activity-row" key={key}>
                  <span>
                    <strong>{providerTitles[key]}</strong>
                    <small>{note}</small>
                  </span>
                  <Badge tone={item.available ? 'success' : 'warning'}>
                    {item.available ? 'Ready' : 'Needs operator setup'}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <p className="field-hint">
            “Ready” means the settings exist. Sparko has not yet confirmed any
            provider live from this server.
          </p>
        </>
      )}
    </Card>
  );
}

// Social alerts (R47)
const deliveryLabels: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'info' }
> = {
  pending: { label: 'Posting', tone: 'info' },
  applied: { label: 'Posted', tone: 'success' },
  baseline: { label: 'Existing item, not posted', tone: 'neutral' },
  'budget-skipped': { label: 'Skipped: daily limit', tone: 'warning' },
};
function SourceRow({ guildId, source }: { guildId: string; source: Source }) {
  const identity = useActionIdentity();
  const retry = useRetryKey();
  const queryClient = useQueryClient();
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['social', guildId] });
  const [checked, setChecked] = useState(false);
  const poll = useMutation({
    mutationFn: () => pollSource(guildId, source.id, retry.key('poll')),
    onSuccess: () => {
      retry.done('poll');
      setChecked(true);
      refresh();
    },
  });
  const off = useMutation({
    mutationFn: () =>
      disableSource(
        guildId,
        source.id,
        source.revision,
        identity('off', source.id),
      ),
    onSuccess: refresh,
  });
  const active = source.state === 'active';
  return (
    <li className="activity-row">
      <span>
        <strong className="wrap-anywhere">{sourceLabel(source.data)}</strong>
        <small>
          {providerNames[source.data.provider]} → posts in{' '}
          <ChannelName guildId={guildId} id={source.data.channelId} /> ·{' '}
          {source.lastPolledAt
            ? `last checked ${new Date(source.lastPolledAt).toLocaleString()}`
            : 'not checked yet'}
          {source.lastReceived !== null &&
            ` · ${source.lastReceived} item(s) seen`}
          {checked && ' · check requested'}
        </small>
      </span>
      <span className="row">
        <StateBadge state={source.state} />
        {active && (
          <>
            <Button
              variant="secondary"
              busy={poll.isPending}
              onClick={() => poll.mutate()}
            >
              <RefreshCw size={16} /> Check now
            </Button>
            <Button
              variant="ghost"
              busy={off.isPending}
              onClick={() => off.mutate()}
            >
              Turn off
            </Button>
          </>
        )}
      </span>
      {poll.error && <ErrorState message={errorMessage(poll.error)} />}
      {off.error && <ErrorState message={errorMessage(off.error)} />}
    </li>
  );
}

const SourceForm = z
  .object({
    provider: z.enum(['rss', 'youtube', 'github', 'twitch']),
    channelId: z.string().min(1, 'Choose where alerts are posted.'),
    announceExisting: z.boolean(),
    feedUrl: z.string().trim(),
    youtubeChannelId: z.string().trim(),
    owner: z.string().trim(),
    repository: z.string().trim(),
    username: z.string().trim(),
  })
  .superRefine((v, c) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) c.addIssue({ code: 'custom', path: [path], message });
    };
    if (v.provider === 'rss')
      need(
        /^https:\/\/[^\s/@]+\/?\S*$/.test(v.feedUrl),
        'feedUrl',
        'Use the feed’s https:// address.',
      );
    if (v.provider === 'youtube')
      need(
        /^UC[A-Za-z0-9_-]{22}$/.test(v.youtubeChannelId),
        'youtubeChannelId',
        'Use the channel ID that starts with UC (24 characters).',
      );
    if (v.provider === 'github') {
      need(
        /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(v.owner),
        'owner',
        'Use the GitHub user or organisation name.',
      );
      need(
        /^[A-Za-z0-9._-]{1,100}$/.test(v.repository),
        'repository',
        'Use the repository name.',
      );
    }
    if (v.provider === 'twitch')
      need(
        /^[a-z0-9_]{1,25}$/.test(v.username),
        'username',
        'Use the lowercase Twitch username.',
      );
  });
type SourceInput = z.input<typeof SourceForm>;
function NewSource({
  guildId,
  onDone,
}: {
  guildId: string;
  onDone: () => void;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const status = useProviderStatus(guildId);
  const form = useForm<SourceInput, unknown, z.output<typeof SourceForm>>({
    resolver: zodResolver(SourceForm),
    defaultValues: {
      provider: 'github',
      channelId: '',
      announceExisting: false,
      feedUrl: '',
      youtubeChannelId: '',
      owner: '',
      repository: '',
      username: '',
    },
  });
  const provider = form.watch('provider');
  const create = useMutation({
    mutationFn: (v: z.output<typeof SourceForm>) => {
      const base = {
        channelId: v.channelId,
        enabled: true,
        announceExisting: v.announceExisting,
      };
      const body =
        v.provider === 'rss'
          ? { ...base, provider: v.provider, feedUrl: v.feedUrl }
          : v.provider === 'youtube'
            ? {
                ...base,
                provider: v.provider,
                youtubeChannelId: v.youtubeChannelId,
              }
            : v.provider === 'github'
              ? {
                  ...base,
                  provider: v.provider,
                  owner: v.owner,
                  repository: v.repository,
                }
              : { ...base, provider: v.provider, username: v.username };
      return createSource(guildId, body, identity('source', body));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social', guildId] });
      onDone();
    },
  });
  const ready = status.data
    ? provider === 'github' || status.data[provider].available
    : true;
  const errors = form.formState.errors;
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <h2>New alert source</h2>
        <Field label="Source" htmlFor="source-provider">
          <select id="source-provider" {...form.register('provider')}>
            {Object.entries(providerNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {!ready && (
          <Notice tone="warning" title="Not set up by the operator">
            You can save this source, but Sparko can’t check it until the
            operator configures {providerNames[provider]}.
          </Notice>
        )}
        {provider === 'rss' && (
          <Field
            label="Feed address"
            htmlFor="source-feed"
            hint="Only hosts approved by the Sparko operator can be read."
            error={errors.feedUrl?.message}
          >
            <Input
              id="source-feed"
              type="url"
              inputMode="url"
              {...form.register('feedUrl')}
            />
          </Field>
        )}
        {provider === 'youtube' && (
          <Field
            label="YouTube channel ID"
            htmlFor="source-yt"
            hint="Starts with UC; find it under the channel’s About → Share."
            error={errors.youtubeChannelId?.message}
          >
            <Input id="source-yt" {...form.register('youtubeChannelId')} />
          </Field>
        )}
        {provider === 'github' && (
          <div className="overview-grid">
            <Field
              label="Owner"
              htmlFor="source-owner"
              error={errors.owner?.message}
            >
              <Input id="source-owner" {...form.register('owner')} />
            </Field>
            <Field
              label="Repository"
              htmlFor="source-repo"
              error={errors.repository?.message}
            >
              <Input id="source-repo" {...form.register('repository')} />
            </Field>
          </div>
        )}
        {provider === 'twitch' && (
          <Field
            label="Twitch username"
            htmlFor="source-twitch"
            error={errors.username?.message}
          >
            <Input id="source-twitch" {...form.register('username')} />
          </Field>
        )}
        <ChannelField
          form={form as never}
          name="channelId"
          label="Post alerts in"
          guildId={guildId}
        />
        <SwitchField
          form={form as never}
          name="announceExisting"
          label="Also post items that already exist"
          hint="Off: the first check only records what’s there, and only new items are posted."
        />
        <div className="row">
          <Button type="submit" busy={create.isPending}>
            <Rss size={16} /> Add source
          </Button>
        </div>
        {create.error && <ErrorState message={errorMessage(create.error)} />}
      </form>
    </Card>
  );
}

function Sources({ guildId }: { guildId: string }) {
  const [, setParams] = useSearchParams();
  const social = useQuery({
    queryKey: ['social', guildId],
    queryFn: ({ signal }) => getSocial(guildId, signal),
  });
  if (social.isPending) return <LoadingState />;
  if (social.error)
    return (
      <ErrorState
        message={errorMessage(social.error)}
        retry={() => void social.refetch()}
      />
    );
  const { sources, usage } = social.data;
  return (
    <div className="stack">
      <p className="muted">
        Today: {usage.pollsToday} of {usage.pollsPerDay} checks and{' '}
        {usage.announcedToday} of {usage.eventsPerDay} posts used.
      </p>
      {sources.length ? (
        <Card>
          <ul className="row-list">
            {sources.map((source) => (
              <SourceRow key={source.id} guildId={guildId} source={source} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={Rss}
          title="No alert sources yet"
          description="Post new releases, uploads, streams or feed items to a channel."
          action={
            <Button
              onClick={() => setParams({ tab: 'new' }, { replace: true })}
            >
              Add a source
            </Button>
          }
        />
      )}
      <ProviderPanel
        guildId={guildId}
        providers={['github', 'rss', 'youtube', 'twitch']}
      />
    </div>
  );
}

function Alerts({ guildId }: { guildId: string }) {
  const social = useQuery({
    queryKey: ['social', guildId],
    queryFn: ({ signal }) => getSocial(guildId, signal),
  });
  if (social.isPending) return <LoadingState />;
  if (social.error) return <ErrorState message={errorMessage(social.error)} />;
  if (!social.data.events.length)
    return (
      <EmptyState
        icon={Radio}
        title="Nothing seen yet"
        description="Items each source finds appear here, posted or not."
      />
    );
  return (
    <Card>
      <ul className="row-list">
        {social.data.events.map((event) => {
          const delivery = deliveryLabels[event.data.delivery ?? ''] ?? {
            label: event.data.delivery ?? event.state,
            tone: 'neutral' as const,
          };
          return (
            <li className="activity-row" key={event.id}>
              <span>
                <strong className="wrap-anywhere">
                  {event.data.url ? (
                    <a
                      className="text-link"
                      href={event.data.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {event.data.title}
                    </a>
                  ) : (
                    event.data.title
                  )}
                </strong>
                <small>
                  {providerNames[event.data.provider ?? ''] ??
                    event.data.provider}
                  {event.data.observedAt &&
                    ` · seen ${new Date(event.data.observedAt).toLocaleString()}`}
                </small>
              </span>
              <Badge tone={delivery.tone}>{delivery.label}</Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function SocialPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Automation"
        title="Social & RSS alerts"
        description="Post new GitHub releases, YouTube uploads, Twitch streams and feed items to your channels. Each item is posted once."
      />
      <OffNotice guildId={guildId} featureId="R47" noun="Social alerts" />
      <Tabs
        tabs={[
          {
            id: 'sources',
            label: 'Sources',
            content: <Sources guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New source',
            content: (
              <NewSource
                guildId={guildId}
                onDone={() => setParams({ tab: 'sources' }, { replace: true })}
              />
            ),
          },
          {
            id: 'alerts',
            label: 'Recent items',
            content: <Alerts guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R47"
                title="Social alerts"
                description="Daily limits protect provider quotas. Items over the posting limit are recorded as skipped, never posted late."
                enableLabel="Turn on social alerts"
              >
                {(form) => (
                  <div className="overview-grid">
                    <DurationField
                      form={form}
                      name="intervalSeconds"
                      label="Check each source every"
                      unit="minutes"
                    />
                    <NumberField
                      form={form}
                      name="pollsPerDay"
                      label="Checks per day (all sources)"
                      min={1}
                      max={1000}
                    />
                    <NumberField
                      form={form}
                      name="eventsPerDay"
                      label="Posts per day"
                      min={1}
                      max={1000}
                    />
                  </div>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}

// External events (R69)
const WebhookForm = z.object({
  name: z.string().trim().min(1, 'Name the integration.').max(80),
  channelId: z.string().min(1, 'Choose where events are posted.'),
  allowedEvents: z
    .array(z.enum(webhookEvents))
    .min(1, 'Allow at least one event type.'),
});
const eventLabels: Record<string, string> = {
  announcement: 'Announcements',
  release: 'Releases',
  deployment: 'Deployments',
};
function NewWebhook({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<{
    endpoint: string;
    secret: string;
    protocol: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const form = useForm<z.input<typeof WebhookForm>>({
    resolver: zodResolver(WebhookForm),
    defaultValues: { name: '', channelId: '', allowedEvents: ['announcement'] },
  });
  const create = useMutation({
    mutationFn: (values: z.output<typeof WebhookForm>) => {
      const signingSecret = newSigningSecret();
      return createWebhook(
        guildId,
        { ...values, signingSecret },
        identity('webhook', values),
      ).then((result) => ({ result, signingSecret }));
    },
    onSuccess: ({ result, signingSecret }) => {
      setCreated({
        endpoint: `${window.location.origin}${result.data.endpoint}`,
        secret: signingSecret,
        protocol: result.data.protocol,
      });
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['webhooks', guildId] });
    },
  });
  if (created)
    return (
      <Card>
        <h2>Integration ready</h2>
        <Notice tone="warning" title="Copy the signing secret now">
          Sparko stores it encrypted and can’t show it again. Anyone with it can
          post events to this server.
        </Notice>
        <dl className="detail-list">
          <dt>Endpoint</dt>
          <dd className="mono wrap-anywhere">{created.endpoint}</dd>
          <dt>Signing secret</dt>
          <dd className="mono wrap-anywhere">{created.secret}</dd>
          <dt>Signature</dt>
          <dd>{created.protocol}</dd>
        </dl>
        <div className="row">
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(created.secret)
                .then(() => setCopied(true))
            }
          >
            <Copy size={16} /> {copied ? 'Copied' : 'Copy secret'}
          </Button>
          <Button variant="ghost" onClick={() => setCreated(null)}>
            Done
          </Button>
        </div>
      </Card>
    );
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <h2>New integration</h2>
        <Field
          label="Name"
          htmlFor="hook-name"
          error={form.formState.errors.name?.message}
        >
          <Input id="hook-name" {...form.register('name')} />
        </Field>
        <ChannelField
          form={form as never}
          name="channelId"
          label="Post events in"
          guildId={guildId}
        />
        <Controller
          control={form.control}
          name="allowedEvents"
          render={({ field }) => (
            <fieldset className="stack">
              <legend>Accepted event types</legend>
              {webhookEvents.map((type) => (
                <label className="checkbox-row" key={type}>
                  <input
                    type="checkbox"
                    checked={field.value.includes(type)}
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked
                          ? [...field.value, type]
                          : field.value.filter((v) => v !== type),
                      )
                    }
                  />
                  <span>{eventLabels[type]}</span>
                </label>
              ))}
              {fieldError(form as never, 'allowedEvents') && (
                <p className="field-error" role="alert">
                  {fieldError(form as never, 'allowedEvents')}
                </p>
              )}
            </fieldset>
          )}
        />
        <p className="field-hint">
          Sparko creates a random signing secret and shows it once. Requests
          must be signed and recent; repeats are ignored.
        </p>
        <div className="row">
          <Button type="submit" busy={create.isPending}>
            <Plug size={16} /> Create integration
          </Button>
        </div>
        {create.error && <ErrorState message={errorMessage(create.error)} />}
      </form>
    </Card>
  );
}
function Integrations({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const hooks = useQuery({
    queryKey: ['webhooks', guildId],
    queryFn: ({ signal }) => getWebhooks(guildId, signal),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      revokeWebhook(guildId, id, identity('revoke', id)),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['webhooks', guildId] }),
  });
  if (hooks.isPending) return <LoadingState />;
  if (hooks.error) return <ErrorState message={errorMessage(hooks.error)} />;
  if (!hooks.data.length)
    return (
      <EmptyState
        icon={Plug}
        title="No integrations yet"
        description="Let your own services post signed announcements, releases or deployments."
      />
    );
  return (
    <Card>
      <ul className="row-list">
        {hooks.data.map((hook) => (
          <li className="activity-row" key={hook.id}>
            <span>
              <strong className="wrap-anywhere">{hook.data.name}</strong>
              <small>
                {hook.data.allowedEvents
                  .map((e) => eventLabels[e] ?? e)
                  .join(', ')}{' '}
                → <ChannelName guildId={guildId} id={hook.data.channelId} />
              </small>
            </span>
            <span className="row">
              <StateBadge state={hook.state} />
              {hook.state === 'active' && (
                <Button
                  variant="ghost"
                  busy={revoke.isPending && revoke.variables === hook.id}
                  onClick={() => revoke.mutate(hook.id)}
                >
                  Revoke
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {revoke.error && <ErrorState message={errorMessage(revoke.error)} />}
    </Card>
  );
}
export function WebhooksPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Automation"
        title="External events"
        description="Your own services post signed events, and Sparko announces them in a channel."
      />
      <OffNotice guildId={guildId} featureId="R69" noun="External events" />
      <Tabs
        tabs={[
          {
            id: 'integrations',
            label: 'Integrations',
            content: (
              <div className="stack">
                <Integrations guildId={guildId} />
                <NewWebhook guildId={guildId} />
              </div>
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R69"
                title="External events"
                description="Revoking an integration deletes its secret immediately."
                enableLabel="Accept external events"
              >
                {(form) => (
                  <div className="overview-grid">
                    <NumberField
                      form={form}
                      name="eventsPerDay"
                      label="Events per day"
                      min={1}
                      max={10000}
                    />
                    <NumberField
                      form={form}
                      name="maxAgeSeconds"
                      label="Reject events older than"
                      unit="seconds"
                      min={30}
                      max={300}
                    />
                  </div>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}

// Music (R64)
export function MusicPage() {
  const { guildId = '' } = useParams();
  const status = useProviderStatus(guildId);
  return (
    <>
      <PageHeading
        eyebrow="Server settings"
        title="Music"
        description="Play uploads you have the rights to in voice channels, with DJ roles and queue limits."
      />
      {status.data && !status.data.music.available && (
        <Notice tone="warning" title="Playback isn’t available yet">
          This Sparko installation has no voice playback runtime, so nothing
          will play even with music on. Settings are kept for when it is.
        </Notice>
      )}
      <Tabs
        tabs={[
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R64"
                title="Music"
                description="Only files uploaded to this server’s library, with rights confirmed, can be queued."
                enableLabel="Turn on music"
              >
                {(form) => (
                  <>
                    <RoleChecklist
                      form={form}
                      name="djRoleIds"
                      label="DJ roles (can skip and change volume)"
                      guildId={guildId}
                    />
                    <div className="overview-grid">
                      <NumberField
                        form={form}
                        name="maxQueue"
                        label="Queue length"
                        min={1}
                        max={100}
                      />
                      <DurationField
                        form={form}
                        name="maxDurationSeconds"
                        label="Longest track"
                        unit="minutes"
                      />
                      <NumberField
                        form={form}
                        name="maxVolume"
                        label="Maximum volume"
                        unit="%"
                        min={1}
                        max={100}
                      />
                      <NumberField
                        form={form}
                        name="idleSeconds"
                        label="Leave voice after idle"
                        unit="seconds"
                        min={30}
                        max={600}
                      />
                    </div>
                  </>
                )}
              </AutomationSettings>
            ),
          },
          {
            id: 'providers',
            label: 'Availability',
            content: <ProviderPanel guildId={guildId} providers={['music']} />,
          },
        ]}
      />
      <p className="field-hint economy-footnote">
        <Music size={14} aria-hidden="true" /> Sparko never streams from
        third-party services.
      </p>
    </>
  );
}

// AI assistance (R65)
const purposes = [
  {
    value: 'settings-explain',
    label: 'Explain settings',
    hint: 'Plain-language help on dashboard pages.',
  },
  {
    value: 'message-draft',
    label: 'Draft messages',
    hint: 'Suggested text staff review before sending.',
  },
  {
    value: 'ticket-summary',
    label: 'Summarise tickets',
    hint: 'Sends a closed ticket’s transcript to the provider.',
  },
] as const;
export function AiPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Server settings"
        title="AI assistance"
        description="Optional drafting help. Text is sent to an external AI provider only for purposes you allow, and only when a person asks."
      />
      <Notice tone="info" title="What is shared">
        Each request sends only the text needed for that purpose. The provider
        is asked not to store it, Sparko deletes requests after the retention
        period, and AI output is always a suggestion — it never takes actions.
      </Notice>
      <Tabs
        tabs={[
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R65"
                title="AI assistance"
                description="Members must also agree each time they use it."
                enableLabel="Allow AI assistance"
              >
                {(form) => (
                  <>
                    <SwitchField
                      form={form}
                      name="dataSharingAcknowledged"
                      label="I understand text is sent to an external provider"
                      hint="Required before any purpose works."
                    />
                    <Controller
                      control={form.control}
                      name="purposes"
                      render={({ field }) => {
                        const value =
                          (field.value as string[] | undefined) ?? [];
                        return (
                          <fieldset className="stack">
                            <legend>Allowed purposes</legend>
                            {purposes.map((p) => (
                              <label className="checkbox-row" key={p.value}>
                                <input
                                  type="checkbox"
                                  checked={value.includes(p.value)}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.checked
                                        ? [...value, p.value]
                                        : value.filter((v) => v !== p.value),
                                    )
                                  }
                                />
                                <span>
                                  {p.label}
                                  <small className="muted"> — {p.hint}</small>
                                </span>
                              </label>
                            ))}
                          </fieldset>
                        );
                      }}
                    />
                    <div className="overview-grid">
                      <NumberField
                        form={form}
                        name="callsPerDay"
                        label="Requests per day"
                        min={1}
                        max={500}
                      />
                      <NumberField
                        form={form}
                        name="reservedTokensPerDay"
                        label="Token budget per day"
                        min={100}
                      />
                      <NumberField
                        form={form}
                        name="maxInputCharacters"
                        label="Longest input"
                        unit="characters"
                        min={100}
                        max={12000}
                      />
                      <NumberField
                        form={form}
                        name="maxOutputTokens"
                        label="Longest answer"
                        unit="tokens"
                        min={100}
                        max={4000}
                      />
                      <NumberField
                        form={form}
                        name="retentionDays"
                        label="Keep requests for"
                        unit="days"
                        min={1}
                        max={30}
                      />
                    </div>
                  </>
                )}
              </AutomationSettings>
            ),
          },
          {
            id: 'providers',
            label: 'Availability',
            content: <ProviderPanel guildId={guildId} providers={['ai']} />,
          },
        ]}
      />
      <p className="field-hint economy-footnote">
        <Sparkles size={14} aria-hidden="true" /> Usage counts against the daily
        limits above, reserved before each request.
      </p>
    </>
  );
}
