import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  HeartHandshake,
  Layers3,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Ticket,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { AnimatedIcon, type AssetId } from '@sparko/assets';
import {
  BRAND_YELLOW,
  MessageDocumentSchema,
  compileMessage,
  type MessageDocument,
} from '@sparko/messages';
import { Badge, EmptyState, ErrorState, LoadingState } from '@sparko/ui';
import { MessagePreview } from '../components/MessagePreview';
import {
  documentationGuides,
  publicFaqs,
  publicFeatureGuides,
  setupSteps,
  type PublicFeatureGuide,
} from '../content/public';
import {
  getPublicCommands,
  getPublicFeatures,
  getPublicStatus,
  type PublicFeature,
} from '../services/public';
import { loginUrl } from '../services/session';
import { useUi } from '../state/ui';

const canonicalOrigin = 'https://panel.coin-sprite.com';

function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} · Sparko`;
    const setMeta = (name: string, content: string, property = false) => {
      let element = document.querySelector<HTMLMetaElement>(
        `meta[${property ? 'property' : 'name'}="${name}"]`,
      );
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(property ? 'property' : 'name', name);
        document.head.appendChild(element);
      }
      element.content = content;
    };
    setMeta('description', description);
    setMeta('og:title', `${title} · Sparko`, true);
    setMeta('og:description', description, true);
    setMeta('og:type', 'website', true);
    setMeta('og:image', `${canonicalOrigin}/og-image.png`, true);
    setMeta('og:image:width', '1200', true);
    setMeta('og:image:height', '630', true);
    setMeta('og:image:alt', 'Sparko — a little spark for your community', true);
    setMeta('og:url', `${canonicalOrigin}${window.location.pathname}`, true);
    setMeta('twitter:card', 'summary_large_image');
  }, [title, description]);
}

function useFeatureCatalogue() {
  return useQuery({
    queryKey: ['public', 'features'],
    queryFn: ({ signal }) => getPublicFeatures(signal),
    staleTime: 60_000,
    retry: 1,
  });
}

function humanize(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : `${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)} ICT`;
}
function statusTone(
  value?: string,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (
    value &&
    [
      'operational',
      'available',
      'enabled',
      'released',
      'provider verified',
    ].includes(value)
  )
    return 'success';
  if (value && ['unavailable', 'failed', 'offline', 'disabled'].includes(value))
    return 'danger';
  if (
    value &&
    [
      'degraded',
      'pending',
      'blocked',
      'in progress',
      'implemented locally',
    ].includes(value)
  )
    return 'warning';
  return 'neutral';
}

function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="public-page-intro container">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="intro-description">{description}</p>
      {children}
    </header>
  );
}

function PublicAction({
  children = 'Add to Discord',
  secondary = false,
}: {
  children?: ReactNode;
  secondary?: boolean;
}) {
  return (
    <a
      className={`button ${secondary ? 'button-secondary' : 'button-primary'}`}
      href={loginUrl('/dashboard')}
    >
      {children}
      <ArrowUpRight size={17} aria-hidden="true" />
    </a>
  );
}

function FeatureAvailability({
  feature,
  loading = false,
}: {
  feature?: PublicFeature | undefined;
  loading?: boolean;
}) {
  return (
    <Badge tone={statusTone(feature?.status)}>
      {feature
        ? humanize(feature.status)
        : loading
          ? 'Checking availability'
          : 'Availability not loaded'}
    </Badge>
  );
}

function FeatureIcon({ id, size = 26 }: { id: string; size?: number }) {
  const names: Record<string, AssetId> = {
    tickets: 'ticket',
    messages: 'spark',
    levels: 'trophy',
    roles: 'welcome',
    giveaways: 'giveaway',
    welcome: 'welcome',
    moderation: 'shield',
    schedules: 'automation',
    analytics: 'chart',
    economy: 'coin',
  };
  const motion = useUi((state) => state.motion);
  const theme = useUi((state) => state.theme);
  return (
    <AnimatedIcon
      name={names[id] ?? 'settings'}
      size={size}
      motion={
        motion === 'reduced' ? 'off' : motion === 'full' ? 'on' : 'system'
      }
      theme={theme}
    />
  );
}

function FeatureCard({
  guide,
  feature,
  loading = false,
}: {
  guide: PublicFeatureGuide;
  feature?: PublicFeature | undefined;
  loading?: boolean;
}) {
  return (
    <article className="card feature-card">
      <div className="row feature-card-top">
        <span className="icon-tile">
          <FeatureIcon id={guide.id} />
        </span>
        <span className="eyebrow">{guide.group}</span>
      </div>
      <h3>
        <Link to={`/features/${guide.slug}`}>{guide.title}</Link>
      </h3>
      <p>{guide.summary}</p>
      {feature && <p className="field-hint">Access: {humanize(feature.availability)}</p>}
      <div className="feature-card-bottom">
        <FeatureAvailability feature={feature} loading={loading} />
        <Link
          to={`/features/${guide.slug}`}
          aria-label={`Explore ${guide.title}`}
          className="icon-button"
        >
          <ArrowUpRight size={18} />
        </Link>
      </div>
    </article>
  );
}

function makeDemoDocument(
  mode: MessageDocument['mode'],
  community: string,
  topic: 'support' | 'welcome' | 'giveaway',
): MessageDocument {
  const name = community.trim() || 'your community';
  const copy = {
    support: {
      title: 'A little help, right here.',
      description: `Welcome to ${name}. Choose a topic, share the details, and give your support team a clear place to start.`,
      label: 'Read the support guide',
      path: '/docs?guide=tickets',
    },
    welcome: {
      title: 'A good place to begin.',
      description: `Welcome to ${name}. Find your people, pick your interests, and make yourself at home.`,
      label: 'Explore community tools',
      path: '/features/roles',
    },
    giveaway: {
      title: 'Make the rules clear.',
      description: `A giveaway for ${name}. Explain eligibility, the deadline, and what a winner needs to do next.`,
      label: 'Read the giveaway guide',
      path: '/docs?guide=engagement',
    },
  }[topic];
  const controls = [
    {
      type: 'button',
      key: 'guide-link',
      style: 'link',
      label: copy.label,
      url: `${canonicalOrigin}${copy.path}`,
    },
  ];
  const common = {
    schemaVersion: 1,
    name: 'Public website demonstration',
    visibility: 'public',
    tokenContext: 'generic',
    allowedTokens: [],
  };
  return MessageDocumentSchema.parse(
    mode === 'v2'
      ? {
          ...common,
          mode,
          blocks: [
            {
              type: 'container',
              accentColor: BRAND_YELLOW,
              children: [
                { type: 'text', text: `## ${copy.title}` },
                { type: 'text', text: copy.description },
                { type: 'separator', divider: true, spacing: 1 },
                { type: 'controls', controls },
              ],
            },
          ],
        }
      : {
          ...common,
          mode,
          embeds: [
            {
              title: copy.title,
              description: copy.description,
              color: BRAND_YELLOW,
              footer: { text: 'Sparko · Demonstration' },
            },
          ],
          blocks: [{ type: 'controls', controls }],
        },
  );
}

function ProductDemo() {
  const [mode, setMode] = useState<MessageDocument['mode']>('v2');
  const [topic, setTopic] = useState<'support' | 'welcome' | 'giveaway'>(
    'support',
  );
  const [community, setCommunity] = useState('your community');
  const [showPayload, setShowPayload] = useState(false);
  const message = useMemo(
    () => makeDemoDocument(mode, community, topic),
    [mode, community, topic],
  );
  const payload = useMemo(() => compileMessage(message), [message]);
  return (
    <section className="demo-shell" aria-labelledby="demo-title">
      <div className="demo-toolbar">
        <div>
          <span className="eyebrow">A real design, an example message</span>
          <h3 id="demo-title">Give your message a little spark.</h3>
        </div>
        <Badge>Interactive demo</Badge>
      </div>
      <div className="demo-controls">
        <div
          className="segmented-control"
          role="group"
          aria-label="Message output mode"
        >
          <button
            type="button"
            aria-pressed={mode === 'v2'}
            onClick={() => setMode('v2')}
          >
            Components V2
          </button>
          <button
            type="button"
            aria-pressed={mode === 'embed'}
            onClick={() => setMode('embed')}
          >
            Traditional embed
          </button>
        </div>
        <div className="row">
          <label className="sr-only" htmlFor="demo-topic">
            Message purpose
          </label>
          <select
            id="demo-topic"
            className="input"
            value={topic}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === 'support' ||
                value === 'welcome' ||
                value === 'giveaway'
              )
                setTopic(value);
            }}
          >
            <option value="support">Support panel</option>
            <option value="welcome">Welcome message</option>
            <option value="giveaway">Giveaway announcement</option>
          </select>
          <label className="sr-only" htmlFor="demo-community">
            Community name
          </label>
          <input
            className="input"
            id="demo-community"
            value={community}
            maxLength={60}
            onChange={(event) => setCommunity(event.target.value)}
            placeholder="Your community name"
          />
        </div>
      </div>
      <MessagePreview document={message} demo />
      <div className="demo-footer">
        <span>
          <Check size={15} aria-hidden="true" /> Validated by the shared message
          compiler
        </span>
        <button
          className="text-button"
          type="button"
          aria-expanded={showPayload}
          aria-controls="demo-payload"
          onClick={() => setShowPayload((open) => !open)}
        >
          <Code2 size={16} />
          {showPayload ? 'Hide payload' : 'View payload'}
        </button>
      </div>
      {showPayload && (
        <pre
          id="demo-payload"
          className="code-block"
          tabIndex={0}
          aria-label="Compiled demonstration payload"
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
      <p className="demo-disclaimer">
        Example content. This preview does not post to Discord or create a
        ticket. Discord layouts can vary by client.
      </p>
    </section>
  );
}

function ServiceStatusLink() {
  const status = useQuery({
    queryKey: ['public', 'status'],
    queryFn: ({ signal }) => getPublicStatus(signal),
    staleTime: 30_000,
    retry: false,
  });
  return (
    <Link to="/status" className="public-status-link">
      <span
        className={`status-dot ${status.data?.status ?? 'unknown'}`}
        aria-hidden="true"
      />
      <span>
        {status.data
          ? humanize(status.data.status)
          : status.isPending
            ? 'Checking service status'
            : 'Service status unavailable'}
      </span>
      <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  );
}

export function HomePage() {
  usePageMeta(
    'A little spark for your community',
    'Create useful Discord workflows with clear setup, thoughtful message design, private support, and honest operation status.',
  );
  const features = useFeatureCatalogue();
  const motion = useUi((state) => state.motion);
  const theme = useUi((state) => state.theme);
  const highlights = publicFeatureGuides.filter((guide) =>
    ['tickets', 'messages', 'levels', 'roles'].includes(guide.id),
  );
  return (
    <div className="public-page">
      <section className="hero public-hero container">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" />
            Small spark. Big community energy.
          </p>
          <h1>
            Your community.
            <br />A little more <span className="brand-text">spark.</span>
          </h1>
          <p className="hero-description">
            Make room for the good stuff. Shape your Discord messages, simplify
            support, and bring useful community tools together in one clear
            workspace.
          </p>
          <div className="row hero-actions">
            <PublicAction />
            <Link to="/dashboard" className="button button-secondary">
              Open dashboard <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="hero-subline">
            <span>
              <ShieldCheck size={15} aria-hidden="true" /> You choose what to
              enable.
            </span>
            <ServiceStatusLink />
          </div>
        </div>
        <div className="hero-art">
          <span className="hero-art-orbit orbit-one" aria-hidden="true" />
          <span className="hero-art-orbit orbit-two" aria-hidden="true" />
          <div className="mascot-stage">
            <AnimatedIcon
              name="spark"
              size={208}
              state="active"
              label="Sparko's yellow spark mascot"
              iterations={2}
              motion={
                motion === 'reduced'
                  ? 'off'
                  : motion === 'full'
                    ? 'on'
                    : 'system'
              }
              theme={theme}
            />
          </div>
          <div className="hero-note hero-note-one">
            <Ticket size={18} aria-hidden="true" />
            <div>
              Support, with a plan.
              <small>A clear next step for your team.</small>
            </div>
          </div>
          <div className="hero-note hero-note-two">
            <WandSparkles size={18} aria-hidden="true" />
            <div>
              Your messages. Your style.
              <small>Design once. Make it yours.</small>
            </div>
          </div>
          <span className="hero-art-label">
            Made to make communities feel at home.
          </span>
        </div>
      </section>
      <div className="hero-scroll container">
        <a href="#see-it-in-action">
          Take a look around <ArrowDown size={15} aria-hidden="true" />
        </a>
        <span>Thoughtful tools. Clear choices.</span>
      </div>
      <section
        id="see-it-in-action"
        className="public-section container demo-section"
      >
        <div className="section-heading">
          <p className="eyebrow">Say it your way</p>
          <h2>
            Make the first message
            <br />
            feel like your community.
          </h2>
          <p>
            Try the two Discord output modes. Change the example and inspect the
            actual compiled payload.
          </p>
        </div>
        <ProductDemo />
      </section>
      <section className="public-section container">
        <div className="section-heading row section-heading-split">
          <div>
            <p className="eyebrow">A toolkit with purpose</p>
            <h2>
              A few less chores.
              <br />A lot more connection.
            </h2>
          </div>
          <Link to="/features" className="button button-secondary">
            Explore the toolkit <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="feature-grid">
          {highlights.map((guide) => (
            <FeatureCard
              key={guide.id}
              guide={guide}
              feature={features.data?.features.find(
                (feature) => feature.id === guide.id,
              )}
              loading={features.isPending}
            />
          ))}
        </div>
        <p className="field-hint">
          Availability is read from the running service. Open a feature to check
          its setup, restrictions, and plan access.
        </p>
      </section>
      <section className="setup-section public-section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">A clear way in</p>
            <h2>Start with one useful thing.</h2>
            <p>
              Follow the checks, try a harmless test, and know when your
              settings are applied.
            </p>
          </div>
          <ol className="setup-steps">
            {setupSteps.map((step, index) => (
              <li key={step.title}>
                <span className="step-index">0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
          <Link to="/docs?guide=quick-start" className="text-link">
            Follow the quick-start guide <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="public-section container">
        <div className="section-heading">
          <p className="eyebrow">Good questions, clear answers</p>
          <h2>A little clarity before you start.</h2>
        </div>
        <div className="faq-grid">
          {publicFaqs.map((faq) => (
            <details key={faq.question} className="faq-item">
              <summary>
                {faq.question}
                <ChevronRight size={17} aria-hidden="true" />
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="public-cta container">
        <span className="icon-tile">
          <Sparkles size={29} />
        </span>
        <h2>
          Bring a little spark
          <br />
          to your corner of Discord.
        </h2>
        <p>Start small. Make it yours. See what actually happens.</p>
        <div className="row">
          <PublicAction />
          <Link to="/docs" className="button button-secondary">
            Read the docs <BookOpen size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}

export function FeaturesPage() {
  usePageMeta(
    'Explore the toolkit',
    'Explore Sparko modules, current service availability, setup requirements, permissions, and restrictions.',
  );
  const features = useFeatureCatalogue();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');
  const groups = [
    'All',
    ...new Set(publicFeatureGuides.map((guide) => guide.group)),
  ];
  const guides = publicFeatureGuides.filter(
    (guide) =>
      (group === 'All' || guide.group === group) &&
      `${guide.title} ${guide.summary} ${guide.id} ${guide.group}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const otherFeatures =
    features.data?.features.filter(
      (feature) =>
        !publicFeatureGuides.some(
          (guide) => guide.id === feature.id || guide.slug === feature.slug,
        ) &&
        (group === 'All' || feature.group === group) &&
        `${feature.name} ${feature.description} ${feature.group}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="public-page">
      <PageIntro
        eyebrow="The Sparko toolkit"
        title="Tools for the way you gather."
        description="Explore the purpose, prerequisites, and current availability of each module. Start with what your community needs."
      />
      <section className="container public-section">
        <div className="catalogue-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search features</span>
            <input
              type="search"
              placeholder="Find a feature, task, or module…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="filter-tabs" role="group" aria-label="Feature groups">
            {groups.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={group === value}
                onClick={() => setGroup(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        {features.error && (
          <div className="alert" role="status">
            <CircleHelp size={18} />
            <div>
              Live availability could not be loaded. The guides below describe
              each module; check its status before using it.
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => void features.refetch()}
            >
              Retry
            </button>
          </div>
        )}
        <div className="feature-grid">
          {guides.map((guide) => (
            <FeatureCard
              key={guide.id}
              guide={guide}
              feature={features.data?.features.find(
                (feature) =>
                  feature.id === guide.id || feature.slug === guide.slug,
              )}
              loading={features.isPending}
            />
          ))}
          {otherFeatures.map((feature) => (
            <article key={feature.id} className="card feature-card">
              <div className="row feature-card-top">
                <span className="icon-tile">
                  <Layers3 size={25} />
                </span>
                <span className="eyebrow">{feature.group}</span>
              </div>
              <h3>
                <Link to={`/features/${feature.slug}`}>{feature.name}</Link>
              </h3>
              <p>{feature.description}</p>
              <div className="feature-card-bottom">
                <FeatureAvailability feature={feature} />
                <Link
                  to={`/features/${feature.slug}`}
                  className="icon-button"
                  aria-label={`Explore ${feature.name}`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            </article>
          ))}
        </div>
        {guides.length === 0 && otherFeatures.length === 0 && (
          <EmptyState
            title="No matching modules"
            description="Try a different task name or choose another group."
          />
        )}
        <div className="card availability-note">
          <ShieldCheck size={21} />
          <div>
            <h3>A feature name is only the beginning.</h3>
            <p>
              Enabled settings, current plan access, bot permissions, provider
              configuration, and runtime application are checked separately in
              your server.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function FeatureDetailPage() {
  const { slug } = useParams();
  const features = useFeatureCatalogue();
  const guide = publicFeatureGuides.find((item) => item.slug === slug);
  const feature = features.data?.features.find(
    (item) => item.slug === slug || item.id === guide?.id,
  );
  usePageMeta(
    guide?.title ?? feature?.name ?? 'Feature guide',
    guide?.summary ??
      feature?.description ??
      'Sparko feature requirements and availability.',
  );
  if (!guide && !feature)
    return (
      <div className="public-page container public-section">
        {features.isPending ? (
          <LoadingState label="Loading the feature guide…" />
        ) : features.error ? (
          <ErrorState
            message="We couldn’t load this feature’s current information."
            retry={() => void features.refetch()}
          />
        ) : (
          <EmptyState
            title="This feature guide is not available"
            description="Explore the current catalogue for supported modules."
            action={
              <Link className="button button-primary" to="/features">
                Explore features
              </Link>
            }
          />
        )}
      </div>
    );
  const title = guide?.title ?? feature?.name ?? 'Feature';
  const permissions = feature?.permissions ?? guide?.permissions ?? [];
  const intents = feature?.intents ?? guide?.intents ?? [];
  return (
    <div className="public-page">
      <PageIntro
        eyebrow={guide?.group ?? feature?.group ?? 'Feature guide'}
        title={title}
        description={guide?.description ?? feature?.description ?? ''}
      >
        <div className="row">
          <FeatureAvailability feature={feature} loading={features.isPending} />
          {feature && <Badge>{humanize(feature.availability)}</Badge>}
        </div>
      </PageIntro>
      <div className="container feature-detail-layout">
        <article className="stack">
          {guide && (
            <>
              <section className="card">
                <h2>What this module is for</h2>
                <ul className="check-list">
                  {guide.outcomes.map((outcome) => (
                    <li key={outcome}>
                      <Check size={17} aria-hidden="true" />
                      {outcome}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card">
                <h2>Set it up</h2>
                <ol className="guide-steps">
                  {guide.setup.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <Link to={`/docs?guide=${guide.guideId}`} className="text-link">
                  Read the complete guide <ArrowRight size={16} />
                </Link>
              </section>
              <section className="card">
                <h2>Keep these limits in view</h2>
                <ul className="plain-list">
                  {guide.restrictions.map((restriction) => (
                    <li key={restriction}>{restriction}</li>
                  ))}
                </ul>
              </section>
            </>
          )}
          {!guide && (
            <section className="card">
              <h2>Before enabling this module</h2>
              <p>
                Open your server’s setup to review the module’s live capability
                and prerequisites. Availability depends on the running service,
                your server’s configuration, and any required provider
                connection.
              </p>
              <Link to="/docs?guide=quick-start" className="text-link">
                Follow server setup <ArrowRight size={16} />
              </Link>
            </section>
          )}
        </article>
        <aside className="stack feature-sidebar">
          <section className="card">
            <span className="icon-tile">
              <FeatureIcon
                id={guide?.id ?? feature?.id ?? 'settings'}
                size={30}
              />
            </span>
            <h2>Ready for your server?</h2>
            <p>
              Choose a server to review current access and the exact
              configuration.
            </p>
            <Link className="button button-primary" to="/dashboard">
              Open dashboard <ArrowUpRight size={16} />
            </Link>
          </section>
          <section className="card">
            <h3>Required permissions</h3>
            {permissions.length ? (
              <ul className="plain-list">
                {permissions.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Check the selected action’s prerequisites in server setup.
              </p>
            )}
            <h3>Event prerequisites</h3>
            {intents.length ? (
              <ul className="plain-list">
                {intents.map((intent) => (
                  <li key={intent}>{intent}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                No event prerequisites are listed by the service.
              </p>
            )}
            <Link
              to={`/commands?search=${encodeURIComponent(guide?.commandSearch ?? feature?.id ?? '')}`}
              className="text-link"
            >
              Find related commands <Terminal size={16} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function DocsPage() {
  usePageMeta(
    'Documentation',
    'Find Sparko setup, message design, permissions, commands, privacy, and troubleshooting guides.',
  );
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const selected =
    documentationGuides.find((guide) => guide.id === params.get('guide')) ??
    documentationGuides[0];
  const matching = documentationGuides.filter((guide) =>
    `${guide.title} ${guide.description} ${guide.keywords.join(' ')} ${guide.sections.map((section) => `${section.title} ${section.body.join(' ')} ${section.steps?.join(' ') ?? ''}`).join(' ')}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  if (!selected) return null;
  return (
    <div className="public-page">
      <PageIntro
        eyebrow="A clear next step"
        title="A little guidance goes a long way."
        description="Find the setting, understand the effect, and know what to check next."
      />
      <div className="container docs-layout">
        <aside className="docs-nav">
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search documentation content</span>
            <input
              type="search"
              placeholder="Search settings and commands…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <nav aria-label="Documentation guides">
            {matching.map((guide) => (
              <button
                key={guide.id}
                type="button"
                className={selected.id === guide.id ? 'active' : ''}
                aria-current={selected.id === guide.id ? 'page' : undefined}
                onClick={() => setParams({ guide: guide.id })}
              >
                <span>{guide.category}</span>
                {guide.title}
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </nav>
          {matching.length === 0 && (
            <p className="muted" role="status">
              No matching guides. Try a command, permission, or setting name.
            </p>
          )}
          <Link to="/commands" className="text-link">
            <Terminal size={16} />
            Command reference
          </Link>
        </aside>
        <article className="docs-article">
          <p className="eyebrow">{selected.category}</p>
          <h2>{selected.title}</h2>
          <p className="intro-description">{selected.description}</p>
          {selected.sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.steps && (
                <ol className="guide-steps">
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
            </section>
          ))}
          <div className="docs-next">
            <CircleHelp size={23} />
            <div>
              <h3>Still need a hand?</h3>
              <p>
                Check the service status or open a private product-support
                request.
              </p>
              <div className="row">
                <Link className="text-link" to="/status">
                  Service status <ArrowUpRight size={15} />
                </Link>
                <Link className="text-link" to="/support">
                  Get support <ArrowUpRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

export function CommandsPage() {
  usePageMeta(
    'Command reference',
    'Search the actual Sparko command registry, command options, availability, and permission boundaries.',
  );
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [category, setCategory] = useState('All');
  const registry = useQuery({
    queryKey: ['public', 'commands'],
    queryFn: ({ signal }) => getPublicCommands(signal),
    staleTime: 60_000,
    retry: 1,
  });
  const categories = [
    'All',
    ...new Set(
      registry.data?.commands.map((command) => command.category ?? 'General') ??
        [],
    ),
  ];
  const commands =
    registry.data?.commands.filter(
      (command) =>
        (category === 'All' || (command.category ?? 'General') === category) &&
        `${command.name} ${command.description} ${command.usage ?? ''} ${command.permission ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="public-page">
      <PageIntro
        eyebrow="A shortcut to useful things"
        title="Find the right command."
        description="This reference comes from the running command registry. Server configuration and current authority determine which actions you can use."
      />
      <section className="container public-section">
        <div className="catalogue-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search commands</span>
            <input
              type="search"
              value={search}
              placeholder="Search a command, option, or permission…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div
            className="filter-tabs"
            role="group"
            aria-label="Command categories"
          >
            {categories.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        {registry.isPending ? (
          <LoadingState label="Loading the command registry…" />
        ) : registry.error ? (
          <ErrorState
            message="The running command registry could not be loaded. No sample commands are shown as available."
            retry={() => void registry.refetch()}
          />
        ) : commands.length === 0 ? (
          <EmptyState
            title="No matching commands"
            description={
              search
                ? 'Try another command name, option, or permission.'
                : 'The service has not published any commands in this reference.'
            }
          />
        ) : (
          <div className="command-list">
            {commands.map((command) => (
              <article key={command.name} className="card command-row">
                <div className="command-name">
                  <Terminal size={19} />
                  <code>
                    {command.name.startsWith('/')
                      ? command.name
                      : `/${command.name}`}
                  </code>
                  <Badge>{command.category ?? 'General'}</Badge>
                  {command.enabled === false && (
                    <Badge tone="warning">Unavailable</Badge>
                  )}
                </div>
                <p>{command.description}</p>
                {command.usage && (
                  <pre className="command-usage" tabIndex={0}>
                    {command.usage}
                  </pre>
                )}
                <p className="field-hint">
                  <LockKeyhole size={13} aria-hidden="true" />
                  {command.permission ??
                    'Current actor, module, and action policy apply.'}
                </p>
              </article>
            ))}
          </div>
        )}
        {registry.data?.updatedAt && (
          <p className="field-hint">
            Registry updated {formatTime(registry.data.updatedAt)}.
          </p>
        )}
      </section>
    </div>
  );
}

export function StatusPage() {
  usePageMeta(
    'Service status',
    'Read observed Sparko service status, heartbeat freshness, and incident information without unsupported uptime claims.',
  );
  const status = useQuery({
    queryKey: ['public', 'status'],
    queryFn: ({ signal }) => getPublicStatus(signal),
    refetchInterval: 30_000,
    retry: false,
  });
  return (
    <div className="public-page">
      <PageIntro
        eyebrow="An honest view of the service"
        title="Know where things stand."
        description="Current observations and their freshness. No invented uptime, usage counters, or private server data."
      />
      <section className="container public-section status-content">
        <div className="card status-summary" aria-live="polite">
          <div>
            <p className="eyebrow">Current service status</p>
            <h2>
              {status.data
                ? humanize(status.data.status)
                : status.isPending
                  ? 'Checking observations…'
                  : 'Status unavailable'}
            </h2>
            <p>
              {status.data
                ? `Checked ${formatTime(status.data.checkedAt)}`
                : 'The service has not provided a current observation.'}
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={status.isFetching}
            onClick={() => void status.refetch()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {status.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {status.error && (
          <ErrorState
            message="We couldn’t retrieve current service health. A missing observation is not evidence that Discord is connected."
            retry={() => void status.refetch()}
          />
        )}
        {status.data && (
          <div className="status-services">
            {status.data.services.length ? (
              status.data.services.map((service) => (
                <article className="card status-row" key={service.name}>
                  <div>
                    <h3>{service.name}</h3>
                    <p>
                      {service.detail ??
                        'No additional diagnostic summary is provided.'}
                    </p>
                    <small>
                      {service.lastSeenAt
                        ? `Last observed ${formatTime(service.lastSeenAt)}`
                        : 'No heartbeat timestamp provided'}
                    </small>
                  </div>
                  <Badge tone={statusTone(service.status)}>
                    {humanize(service.status)}
                  </Badge>
                </article>
              ))
            ) : (
              <EmptyState
                title="No service observations"
                description="The health endpoint returned no individual service records."
              />
            )}
          </div>
        )}
        <section className="public-section">
          <div className="section-heading">
            <p className="eyebrow">Incident history</p>
            <h2>What the service has reported</h2>
          </div>
          {status.data?.incidents?.length ? (
            <div className="stack">
              {status.data.incidents.map((incident) => (
                <article key={incident.id} className="card">
                  <div className="row">
                    <h3>{incident.title}</h3>
                    <Badge>{humanize(incident.status)}</Badge>
                  </div>
                  <p>
                    {incident.description ??
                      'No additional incident details are provided.'}
                  </p>
                  <small>Started {formatTime(incident.startedAt)}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">
              {status.data
                ? 'No incidents are included in the current status response. This is not a historical uptime claim.'
                : 'Incident information is unavailable until the service responds.'}
            </p>
          )}
        </section>
        <div className="alert">
          <Clock3 size={19} />
          <p>
            A process heartbeat and Discord connectivity are different
            observations. Saved settings and pending deliveries can remain
            visible while a runtime is offline.
          </p>
        </div>
      </section>
    </div>
  );
}

export function SupportLandingPage() {
  usePageMeta(
    'Support',
    'Find Sparko setup help, service status, troubleshooting, and private account support.',
  );
  return (
    <div className="public-page">
      <PageIntro
        eyebrow="We all need a hand sometimes"
        title="Let’s find your next step."
        description="Start with a guide or tell us what happened. Product support stays separate from tickets in your Discord server."
      />
      <section className="container public-section">
        <div className="feature-grid support-options">
          <article className="card feature-card">
            <span className="icon-tile">
              <BookOpen size={26} />
            </span>
            <h2>Find a clear answer</h2>
            <p>Search setup, permissions, settings, and command guides.</p>
            <Link to="/docs" className="text-link">
              Open the documentation <ArrowRight size={16} />
            </Link>
          </article>
          <article className="card feature-card">
            <span className="icon-tile">
              <Zap size={26} />
            </span>
            <h2>Check the service</h2>
            <p>
              Read actual service observations before retrying a pending action.
            </p>
            <Link to="/status" className="text-link">
              View service status <ArrowRight size={16} />
            </Link>
          </article>
          <article className="card feature-card">
            <span className="icon-tile">
              <HeartHandshake size={26} />
            </span>
            <h2>Talk through the issue</h2>
            <p>
              Sign in to open an account support request and follow its replies
              privately.
            </p>
            <Link to="/account/support" className="text-link">
              Open product support <ArrowRight size={16} />
            </Link>
          </article>
        </div>
        <div className="card support-checklist">
          <div>
            <p className="eyebrow">A useful request starts here</p>
            <h2>
              Tell us what you expected
              <br />
              and what you saw.
            </h2>
            <p>
              Include the module, approximate time with timezone, safe request
              ID, and any displayed permission or operation status.
            </p>
          </div>
          <ul className="check-list">
            <li>
              <Check size={17} />
              Describe the steps that led to the issue.
            </li>
            <li>
              <Check size={17} />
              Include the safe error shown in the interface.
            </li>
            <li>
              <Check size={17} />
              Use a screenshot with private information removed.
            </li>
            <li>
              <LockKeyhole size={17} />
              Keep tokens, passwords, and provider secrets out of the request.
            </li>
          </ul>
        </div>
        <Link className="text-link" to="/docs?guide=troubleshooting">
          Follow “Why didn’t this work?” <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}

export function ChangelogPage() {
  usePageMeta(
    'Changelog',
    'Read Sparko development and release notes with release status kept explicit.',
  );
  return (
    <div className="public-page">
      <PageIntro
        eyebrow="Small changes, clearly recorded"
        title="The spark keeps growing."
        description="Development notes are separate from deployed release announcements."
      />
      <section className="container public-section changelog-content">
        <article className="card changelog-entry">
          <div className="row">
            <Badge tone="warning">Unreleased</Badge>
            <span className="eyebrow">Fresh Sparko build</span>
          </div>
          <h2>A new place for your community tools.</h2>
          <p>
            The public website brings the yellow Sparko identity, two-mode
            message demonstration, searchable guides, command reference, and
            service observations together.
          </p>
          <ul className="plain-list">
            <li>
              Interactive demonstrations use the shared validated message
              compiler.
            </li>
            <li>
              Feature availability and commands come from the running API.
            </li>
            <li>
              Documentation covers setup, permissions, delivery states, privacy,
              and troubleshooting.
            </li>
            <li>
              Light, dark, keyboard, mobile, and reduced-motion preferences are
              part of the interface.
            </li>
          </ul>
          <p className="field-hint">
            These are source development notes. A production deployment date and
            live provider evidence have not been published here.
          </p>
        </article>
        <div className="card">
          <h3>Looking for current availability?</h3>
          <p>
            Check the feature catalogue and service observations for the running
            environment.
          </p>
          <div className="row">
            <Link className="text-link" to="/features">
              Explore modules <ArrowRight size={16} />
            </Link>
            <Link className="text-link" to="/status">
              Service status <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function LegalPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  usePageMeta(title, description);
  return (
    <div className="public-page legal-page">
      <PageIntro
        eyebrow="Clear boundaries"
        title={title}
        description={description}
      />
      <article className="container legal-content">
        <div className="alert">
          <ShieldCheck size={19} />
          <p>
            Deployment policy draft · Operator review required. The service
            operator must confirm its identity, contact route, retention
            settings, and applicable legal details before a public production
            release.
          </p>
        </div>
        {children}
        <section>
          <h2>Questions or requests</h2>
          <p>
            Use <Link to="/account/support">private account support</Link> for
            service questions and{' '}
            <Link to="/account/privacy">account privacy</Link> for export or
            deletion workflows. Server administrators can review their
            configured modules and retention in the server workspace.
          </p>
        </section>
      </article>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy, with the details in view."
      description="How Sparko’s account, server, support, and provider boundaries are designed to work."
    >
      <section>
        <h2>Account information and sessions</h2>
        <p>
          Discord sign-in requests the profile and server-list scopes needed to
          identify you and determine eligible servers. OAuth credentials remain
          on the server; they are not exposed in the browser. Account
          preferences include theme, locale, timezone, motion, and notification
          choices.
        </p>
        <p>
          Sessions use an opaque cookie and server-side expiry and revocation.
          Logging out revokes the current session. The connected-session
          interface is the place to review or revoke available sessions.
        </p>
      </section>
      <section>
        <h2>Server features and observed activity</h2>
        <p>
          Enabled modules may observe Discord member, message, reaction,
          interaction, voice, or moderation events when permissions and intents
          allow them. They retain the records necessary for configured behavior,
          such as progression, claims, tickets, moderation cases, and aggregate
          analytics.
        </p>
        <p>
          Message content can be retained for enabled transcripts or other
          disclosed features. Sparko does not describe this architecture as
          zero-content storage. Missing event access is displayed as a
          collection limitation rather than fabricated history.
        </p>
      </section>
      <section>
        <h2>Private support and transcripts</h2>
        <p>
          Product-support conversations belong to the account and authorized
          product-support staff. Guild administrator access does not
          automatically grant access to product support. Server tickets and
          their transcripts have separate participant and staff authorization.
        </p>
        <p>
          Private files are delivered through authorized routes, separate from
          public assets. Download access is rechecked. Transcript capture
          reports available history and gaps.
        </p>
      </section>
      <section>
        <h2>Optional external providers</h2>
        <p>
          Billing, social, AI, and music features require configured adapters.
          An unavailable provider is shown as unavailable. When optional AI or
          another provider receives content, the enabled workflow must disclose
          the provider and the information sent.
        </p>
        <p>
          Verified provider events control paid entitlements. Browser redirects
          do not establish payment. Virtual-economy balances are separate from
          billing.
        </p>
      </section>
      <section>
        <h2>Retention, exports, and deletion</h2>
        <p>
          Retention depends on the deployed policy and enabled module. The
          operator must publish exact retention periods before production
          release. Permission-filtered account and server exports include only
          records the requester may access.
        </p>
        <p>
          Deletion requests follow the service’s operational policy and preserve
          required consistency for pending operations, references, and retained
          audit records. The interface should show the actual request state
          rather than imply that all data was instantly removed.
        </p>
      </section>
      <section>
        <h2>Public information</h2>
        <p>
          Public status exposes safe service observations. Public widgets and
          leaderboards require configured privacy controls and opt-in where
          applicable. Private server names, support records, credentials, and
          transcript content do not belong in public aggregate endpoints.
        </p>
      </section>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms, plainly stated."
      description="The service’s intended use, authorization rules, provider limits, and operational responsibilities."
    >
      <section>
        <h2>Using the service</h2>
        <p>
          Sparko provides configurable Discord community tools and their related
          website. Use the service only for servers and records you are
          authorized to manage or access. Your Discord account remains subject
          to Discord’s own terms and rules.
        </p>
        <p>
          Visible controls do not grant permission. Actions require current
          actor authority, the correct tenant, module access, and necessary
          Discord permissions. Staff capabilities are scoped, and a server owner
          is not automatically a global product operator.
        </p>
      </section>
      <section>
        <h2>Configuration and consequential actions</h2>
        <p>
          Review destinations, roles, eligibility, message mentions, schedules,
          and affected scope before enabling or publishing a workflow. Saving a
          draft, applying a setting, and delivering a Discord message are
          distinct outcomes.
        </p>
        <p>
          Keep access deliberate and use the displayed confirmation for
          destructive or bulk actions. Do not upload unsafe files, attempt to
          bypass authorization, forge events, or use integrations to execute
          unreviewed code.
        </p>
      </section>
      <section>
        <h2>Availability and provider limits</h2>
        <p>
          Discord and optional providers impose permissions, rate limits,
          connectivity requirements, and product restrictions. Some events or
          historical data may be unavailable. The service records uncertainty
          and recovery states where it cannot establish an external outcome.
        </p>
        <p>
          Service observations are current evidence, not an uptime guarantee. A
          local preview or test suite does not establish live provider delivery.
          Optional integrations remain gated until configured and verified for
          the intended use.
        </p>
      </section>
      <section>
        <h2>Plans and virtual items</h2>
        <p>
          Plans and capability limits come from the deployed service
          configuration. Checkout requires a configured provider, and verified
          provider events determine entitlement state. The operator must publish
          applicable prices, cancellation, refund, and account policies before
          accepting production payments.
        </p>
        <p>
          Virtual economy currency and items are scoped game records, separate
          from payments. Virtual lottery, when available and explicitly enabled,
          uses virtual-only entries without cash redemption.
        </p>
      </section>
      <section>
        <h2>Content, privacy, and support</h2>
        <p>
          Use content and media you have permission to publish. The service may
          reject unsafe or unsupported files. Server administrators should
          explain their enabled collection and moderation policies to members.
        </p>
        <p>
          Read the <Link to="/privacy">privacy policy</Link> for account,
          server, support, and provider boundaries. Use the authorized export,
          deletion, session, and support workflows for requests.
        </p>
      </section>
      <section>
        <h2>Release policy</h2>
        <p>
          The deployed operator must complete this policy with its identity,
          contact information, applicable legal terms, and production release
          details. This draft does not invent a legal entity, jurisdiction,
          certification, or production availability promise.
        </p>
      </section>
    </LegalPage>
  );
}
