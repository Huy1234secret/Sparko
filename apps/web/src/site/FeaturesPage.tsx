import { useState, type CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  DiscordMessage,
  EmptyState,
  Icon,
  Notice,
  Segmented,
  SearchIcon,
} from '../ui';
import {
  freeModuleCount,
  groups,
  moduleById,
  modules,
  type ModuleGroup,
} from '../content/modules';
import { featureDetails, isReady } from '../content/features';
import { ModuleCard } from './parts';
import { NotFoundPage } from './InfoPages';
import { Tilt } from './motion';
import { commands } from '../content/commands';
import { useAccountActions, usePageTitle } from './SiteLayout';

export function FeaturesPage() {
  usePageTitle('Features');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const groupParam = params.get('group');
  const readyOnly = params.get('ready') === '1';
  const group = groups.includes(groupParam as ModuleGroup)
    ? (groupParam as ModuleGroup)
    : null;
  const update = (next: {
    q?: string;
    group?: string | null;
    ready?: boolean;
  }) => {
    const out = new URLSearchParams(params);
    if (next.q !== undefined) {
      if (next.q) out.set('q', next.q);
      else out.delete('q');
    }
    if (next.group !== undefined) {
      if (next.group) out.set('group', next.group);
      else out.delete('group');
    }
    if (next.ready !== undefined) {
      if (next.ready) out.set('ready', '1');
      else out.delete('ready');
    }
    setParams(out, { replace: true });
  };
  const needle = query.trim().toLowerCase();
  const catalogue = groups
    .filter((g) => !group || g === group)
    .map((g) => ({
      group: g,
      items: modules
        .filter(
          (m) =>
            m.group === g &&
            (!readyOnly || isReady(m.id)) &&
            (!needle ||
              `${m.label} ${m.description}`.toLowerCase().includes(needle)),
        )
        // Finished modules first, then the ones on the way.
        .sort((a, b) => Number(isReady(b.id)) - Number(isReady(a.id))),
    }))
    .filter((g) => g.items.length);

  return (
    <div className="sw-wrap">
      <header className="sw-page-hero">
        <h1 className="sw-h1">
          {modules.length} modules. {freeModuleCount} of them free.
        </h1>
        <p className="sw-lede">
          Turn on only what you need. Each module has plain-language settings, a
          live preview and full history. {readyCount} are ready in the dashboard
          today; the rest are being built and show as coming soon.
        </p>
      </header>
      <div className="sw-toolbar">
        <div className="sp-input" style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <SearchIcon />
          <input
            type="search"
            aria-label="Search features"
            placeholder="Search features, like “tickets”"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>
        <div
          className="sw-chips"
          style={{ gap: 8 }}
          role="group"
          aria-label="Filter by group"
        >
          <button
            type="button"
            className="sp-chip sp-chip--toggle"
            aria-pressed={readyOnly}
            onClick={() => update({ ready: !readyOnly })}
          >
            <Icon name="circle-check" size="sm" />
            Ready now · {readyCount}
          </button>
          {[null, ...groups].map((g) => (
            <button
              key={g ?? 'all'}
              type="button"
              className="sp-chip sp-chip--toggle"
              aria-pressed={group === g}
              onClick={() => update({ group: g })}
            >
              {g ?? 'All'}
            </button>
          ))}
        </div>
      </div>
      {catalogue.map(({ group: g, items }) => (
        <section key={g} aria-labelledby={`group-${g}`}>
          <div className="sw-group-h">
            <h2 className="sw-h3" id={`group-${g}`} style={{ fontSize: 20 }}>
              {g}
            </h2>
            <span className="sp-count">{items.length}</span>
            {items.some((m) => isReady(m.id)) && (
              <Badge tone="success" size="sm">
                {items.filter((m) => isReady(m.id)).length} ready
              </Badge>
            )}
          </div>
          <div className="sw-grid sw-grid--3">
            {items.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        </section>
      ))}
      {!catalogue.length && (
        <div className="sp-card" style={{ margin: '24px 0' }}>
          <EmptyState
            icon="search"
            title={`No features match “${query}”`}
            actions={
              <Button
                onClick={() => update({ q: '', group: null, ready: false })}
              >
                Show all features
              </Button>
            }
          >
            Try a simpler word like “roles” or “levels”, or ask in the support
            server.
          </EmptyState>
        </div>
      )}
      <div style={{ height: 96 }} />
    </div>
  );
}

const readyCount = modules.filter((m) => isReady(m.id)).length;

const colours = [
  ['Yellow', '#FACC15'],
  ['Blurple', '#5865F2'],
  ['Mint', '#57F287'],
  ['Coral', '#ED4245'],
  ['Pink', '#EB459E'],
] as const;

/** A small, working taste of Message Studio. */
function StudioDemo() {
  const [title, setTitle] = useState('Weekend art jam');
  const [description, setDescription] = useState(
    'Bring a sketch, any medium. Theme drops at 19:00 in #art-share.',
  );
  const [colour, setColour] = useState<string>('#FACC15');
  const [button, setButton] = useState('I’m in');
  return (
    <div className="sw-builder" aria-label="Try Message Studio">
      <div className="sw-builder__form">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <b style={{ font: '600 14px/20px var(--sp-font-sans)' }}>Try it</b>
          <span className="sp-sync sp-sync--live">
            <span className="sp-dot" />
            Preview
          </span>
        </div>
        <div className="sp-field">
          <label className="sp-label" htmlFor="st-t">
            Title
          </label>
          <div className="sp-input">
            <input
              id="st-t"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <div className="sp-field">
          <label className="sp-label" htmlFor="st-d">
            Description
          </label>
          <div className="sp-input sp-input--multiline">
            <textarea
              id="st-d"
              rows={3}
              value={description}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="sp-field">
          <span className="sp-label" id="st-c">
            Colour bar
          </span>
          <Segmented
            label="Colour bar"
            className="sw-swatches"
            value={colour}
            onChange={setColour}
            options={colours.map(([name, hex]) => ({
              value: hex,
              ariaLabel: name,
              label: (
                <span
                  className="sp-dot"
                  style={{ color: hex, width: 12, height: 12 }}
                />
              ),
            }))}
          />
        </div>
        <div className="sp-field">
          <label className="sp-label" htmlFor="st-b">
            Button label
          </label>
          <div className="sp-input">
            <input
              id="st-b"
              value={button}
              maxLength={40}
              onChange={(e) => setButton(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="sw-builder__preview dc-preview-frame">
        <div className="dc-chat" style={{ padding: 0, borderRadius: 0 }}>
          <DiscordMessage
            className="dc-msg--first"
            embed={{
              color: colour,
              title,
              description,
              fields: [
                { name: 'When', value: 'Sat, 19:00', inline: true },
                {
                  name: 'Where',
                  value: <span className="dc-mention">#art-share</span>,
                  inline: true,
                },
              ],
              footer: 'Pixel Plaza',
            }}
            components={[
              [
                { label: button || ' ', style: 'primary' },
                { label: 'Remind me' },
              ],
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export function FeaturePage() {
  const { id = '' } = useParams();
  const feature = moduleById(id);
  usePageTitle(feature?.label ?? 'Not found');
  const { addBot } = useAccountActions();
  if (!feature) return <NotFoundPage />;
  const detail = featureDetails[feature.id];
  const studio = feature.id === 'studio';
  const related = (
    detail?.pairs
      ? modules.filter((m) => detail.pairs?.includes(m.id))
      : [...modules.filter((m) => isReady(m.id) && m.id !== feature.id)].slice(
          0,
          3,
        )
  ).slice(0, 3);
  return (
    <div className="sw-wrap">
      <nav aria-label="Breadcrumb" style={{ paddingTop: 24 }}>
        <ol className="sp-crumbs">
          <li>
            <Link className="sp-crumb" to="/features">
              Features
            </Link>
            <Icon name="chevron-right" />
          </li>
          <li>
            <Link
              className="sp-crumb"
              to={`/features?group=${encodeURIComponent(feature.group)}`}
            >
              {feature.group}
            </Link>
            <Icon name="chevron-right" />
          </li>
          <li>
            <span className="sp-crumb" aria-current="page">
              {feature.label}
            </span>
          </li>
        </ol>
      </nav>
      <section className="sw-split" style={{ padding: '40px 0 72px' }}>
        <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          <span className="sw-card__icon" style={{ width: 52, height: 52 }}>
            <Icon name={feature.icon} size="xl" />
          </span>
          <h1 className="sw-h1">
            {detail?.headline ?? `${feature.label} is on the way.`}
          </h1>
          <p className="sw-lede">{feature.description}</p>
          {detail ? (
            <ul className="sw-checks">
              {detail.points.map((point) => (
                <li key={point}>
                  <Icon name="check" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="info" title="Coming soon">
              {feature.label} is still being built, so it isn’t in the dashboard
              yet. It’ll show up there as soon as it’s ready.
            </Notice>
          )}
          <div className="sw-hero__ctas">
            <Button
              variant={detail ? 'primary' : 'secondary'}
              size="lg"
              onClick={addBot}
            >
              Add Sparko to Discord
            </Button>
            <Badge
              {...(detail && { tone: feature.plus ? 'plus' : 'success' })}
              style={{ alignSelf: 'center' }}
            >
              {!detail
                ? 'Coming soon'
                : feature.plus
                  ? 'Ready · included in Plus'
                  : 'Ready · free on every server'}
            </Badge>
          </div>
        </div>
        {studio ? (
          <StudioDemo />
        ) : (
          <div className="sw-card sp-sparks sw-feature-art">
            <span className="sw-card__icon" style={{ width: 64, height: 64 }}>
              <Icon name={feature.icon} size="xl" />
            </span>
            <b className="sw-h3">{feature.label}</b>
            <p className="sw-body" style={{ maxWidth: '36ch' }}>
              {detail
                ? `First step: ${feature.firstStep.toLowerCase()}.`
                : `When it’s ready, you’ll start here: ${feature.firstStep.toLowerCase()}.`}
            </p>
          </div>
        )}
      </section>

      {detail && (
        <>
          <section style={{ padding: '0 0 72px' }} aria-labelledby="how-h">
            <h2 className="sw-h2 sw-reveal" id="how-h">
              How it works
            </h2>
            <div className="sw-grid sw-grid--2 sw-how">
              {detail.how.map((item) => (
                <Tilt
                  as="article"
                  max={3}
                  key={item.title}
                  className="sw-card sw-reveal"
                >
                  <span className="sw-card__icon">
                    <Icon name={item.icon} />
                  </span>
                  <h3 className="sw-h3">{item.title}</h3>
                  <p className="sw-body">{item.body}</p>
                </Tilt>
              ))}
            </div>
          </section>

          <section style={{ padding: '0 0 72px' }} aria-labelledby="setup-h">
            <h2 className="sw-h2 sw-reveal" id="setup-h">
              Set it up in {detail.steps.length} steps
            </h2>
            <ol className="sw-setup">
              {detail.steps.map((step, i) => (
                <li
                  key={step}
                  className="sw-reveal sw-reveal--line"
                  style={{ '--i': i } as CSSProperties}
                >
                  <b>{i + 1}</b>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {detail.commands && (
            <section style={{ padding: '0 0 72px' }} aria-labelledby="cmds-h">
              <h2 className="sw-h2 sw-reveal" id="cmds-h">
                Commands
              </h2>
              <div className="sw-cmds">
                {detail.commands.flatMap((name) =>
                  commands
                    .filter((c) => c.name === name)
                    .map((c) => (
                      <div key={c.name} className="sw-cmd sw-reveal">
                        <div className="sw-cmd__row">
                          <span className="sw-cmd__name">{c.name}</span>
                          <span className="sw-cmd__desc">{c.description}</span>
                          <Badge size="sm">{c.who}</Badge>
                        </div>
                      </div>
                    )),
                )}
              </div>
              <p className="sw-body" style={{ marginTop: 16 }}>
                <Link to="/commands">See every command</Link>
              </p>
            </section>
          )}
        </>
      )}

      {studio && (
        <>
          <section
            className="sw-split sw-split--flip"
            style={{ padding: '0 0 72px' }}
          >
            <div style={{ display: 'grid', gap: 14 }}>
              <h2 className="sw-h2">Save it once, reuse it everywhere.</h2>
              <p className="sw-body">
                Templates work in Welcome, Tickets and Reaction roles. Free
                includes 10; Plus includes 100.
              </p>
            </div>
            <div className="sp-card">
              <div className="sp-rows">
                {[
                  ['Default welcome', 'Used in Welcome'],
                  ['Pick your colour', 'Used in Reaction roles'],
                  ['Ticket closed', 'Used in Tickets'],
                ].map(([name, use]) => (
                  <div key={name} className="sp-row">
                    <span className="sp-row__icon">
                      <Icon name="file-text" />
                    </span>
                    <span className="sp-row__title">{name}</span>
                    <span className="sp-row__desc">{use}</span>
                  </div>
                ))}
              </div>
              <div
                className="sp-card__foot"
                style={{ justifyContent: 'space-between' }}
              >
                <span className="sp-hint">3 of 10 templates on Free</span>
                <div
                  className="sp-progress sp-progress--sm"
                  style={{ width: 120 }}
                >
                  <div className="sp-progress__bar" style={{ width: '30%' }} />
                </div>
              </div>
            </div>
          </section>
          <section className="sw-split" style={{ padding: '0 0 72px' }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <h2 className="sw-h2">
                Edit published messages without reposting.
              </h2>
              <p className="sw-body">
                Sparko keeps every saved version. Change the message, preview
                it, and Sparko updates it in Discord; reactions and replies stay
                put.
              </p>
            </div>
            <div className="sp-card">
              <div className="sp-rows">
                <div className="sp-row sp-row--success">
                  <span className="sp-row__icon">
                    <Icon name="circle-check" />
                  </span>
                  <span className="sp-row__title">Live in #rules</span>
                  <span className="sp-row__desc">
                    Server rules · edited today by Ayo
                  </span>
                </div>
                <div className="sp-row">
                  <span className="sp-row__icon">
                    <Icon name="rotate-ccw" />
                  </span>
                  <span className="sp-row__title">Version from 11 Oct</span>
                  <span className="sp-row__desc">
                    Rhea · added the art-sharing rule
                  </span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      <section style={{ padding: '0 0 96px' }} aria-labelledby="related-h">
        <div className="sw-group-h">
          <h2 className="sw-h3" id="related-h" style={{ fontSize: 20 }}>
            {detail ? 'Works well with' : 'Ready today'}
          </h2>
        </div>
        <div className="sw-grid sw-grid--3">
          {related.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </div>
      </section>
    </div>
  );
}
