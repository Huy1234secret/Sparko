import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  DiscordMessage,
  EmptyState,
  Icon,
  Segmented,
} from '../ui';
import {
  freeModuleCount,
  groups,
  moduleById,
  modules,
  type ModuleGroup,
} from '../content/modules';
import { ModuleCard } from './parts';
import { NotFoundPage } from './InfoPages';
import { useAccountActions, usePageTitle } from './SiteLayout';

export function FeaturesPage() {
  usePageTitle('Features');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const groupParam = params.get('group');
  const group = groups.includes(groupParam as ModuleGroup)
    ? (groupParam as ModuleGroup)
    : null;
  const update = (next: { q?: string; group?: string | null }) => {
    const out = new URLSearchParams(params);
    if (next.q !== undefined) {
      if (next.q) out.set('q', next.q);
      else out.delete('q');
    }
    if (next.group !== undefined) {
      if (next.group) out.set('group', next.group);
      else out.delete('group');
    }
    setParams(out, { replace: true });
  };
  const needle = query.trim().toLowerCase();
  const catalogue = groups
    .filter((g) => !group || g === group)
    .map((g) => ({
      group: g,
      items: modules.filter(
        (m) =>
          m.group === g &&
          (!needle ||
            `${m.label} ${m.description}`.toLowerCase().includes(needle)),
      ),
    }))
    .filter((g) => g.items.length);

  return (
    <div className="sw-wrap">
      <header className="sw-page-hero">
        <span className="sw-eyebrow">Features</span>
        <h1 className="sw-h1">
          {modules.length} modules. {freeModuleCount} of them free.
        </h1>
        <p className="sw-lede">
          Turn on only what you need. Each module has plain-language settings, a
          live preview and full history.
        </p>
      </header>
      <div className="sw-toolbar">
        <div className="sp-input" style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <Icon name="search" />
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
              <Button onClick={() => update({ q: '', group: null })}>
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

const extras: Record<string, { headline: string; points: string[] }> = {
  studio: {
    headline: 'Build Discord messages you can see before you send.',
    points: [
      'Drag-free visual editor for text, embeds, buttons and menus',
      'Exactly the preview Discord shows, in dark and light',
      'Templates, saved versions and edit-after-publish',
    ],
  },
};

export function FeaturePage() {
  const { id = '' } = useParams();
  const feature = moduleById(id);
  usePageTitle(feature?.label ?? 'Not found');
  const { addBot } = useAccountActions();
  if (!feature) return <NotFoundPage />;
  const extra = extras[feature.id];
  const studio = feature.id === 'studio';
  const related = [
    ...modules.filter((m) => m.group === feature.group && m.id !== feature.id),
    ...(studio
      ? modules.filter((m) =>
          ['welcome', 'schedules', 'tickets'].includes(m.id),
        )
      : []),
  ].slice(0, 3);
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
            {extra?.headline ?? `${feature.label}, without the guesswork.`}
          </h1>
          <p className="sw-lede">{feature.description}</p>
          <ul className="sw-checks">
            {(
              extra?.points ?? [
                'Plain-language settings with a short explanation',
                'Live preview of anything Sparko posts',
                'Every change saved as a version you can restore',
              ]
            ).map((point) => (
              <li key={point}>
                <Icon name="check" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="sw-hero__ctas">
            <Button variant="primary" size="lg" onClick={addBot}>
              Add Sparko to Discord
            </Button>
            <Badge
              tone={feature.plus ? 'plus' : 'success'}
              style={{ alignSelf: 'center' }}
            >
              {feature.plus ? 'Included in Plus' : 'Free on every server'}
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
              First step: {feature.firstStep.toLowerCase()}.
            </p>
          </div>
        )}
      </section>
      {studio && (
        <>
          <section
            className="sw-split sw-split--flip"
            style={{ padding: '0 0 72px' }}
          >
            <div style={{ display: 'grid', gap: 14 }}>
              <span className="sw-eyebrow">Templates</span>
              <h2 className="sw-h2">Save it once, reuse it everywhere.</h2>
              <p className="sw-body">
                Templates work in Welcome, Scheduled messages, Tickets and more.
                Free includes 10; Plus includes 100.
              </p>
            </div>
            <div className="sp-card">
              <div className="sp-rows">
                {[
                  ['Weekend art jam', 'Used in Scheduled messages · Sat 19:00'],
                  ['Default welcome', 'Used in Welcome'],
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
              <span className="sw-eyebrow">Versions &amp; publishing</span>
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
            More in {feature.group}
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
