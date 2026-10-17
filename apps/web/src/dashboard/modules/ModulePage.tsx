import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Segmented,
  Spinner,
  useToast,
} from '../../ui';
import { moduleById, type SparkoModule } from '../../content/modules';
import { periods, type Period } from '../../content/site';
import { useModuleState, useSaveModule, type Server } from '../../data';
import { useCurrentServer, useDashboardTitle } from '../shared';
import {
  hasPowerSwitch,
  ModuleHeader,
  ModuleSaveBar,
  ModuleTabs,
  PausedNotice,
  SavePipeline,
  syncState,
  useModuleTab,
  useSaveFlow,
} from './frame';
import { AutoRolesModule } from './AutoRolesModule';
import { ReactionRolesModule } from './ReactionRolesModule';
import { StudioModule } from './StudioModule';
import { SuggestionsModule } from './SuggestionsModule';
import { TicketsModule } from './TicketsModule';
import { WelcomeModule } from './WelcomeModule';

/** Plus-only modules on a Free server: what Plus adds and how to get it. */
function NeedsPlus({ server }: { server: Server }) {
  const [period, setPeriod] = useState<Period>('monthly');
  const [paying, setPaying] = useState(false);
  const toast = useToast();
  const plan = periods[period];
  return (
    <section
      className="sp-card sp-sparks sp-plus-card"
      aria-labelledby="plus-h"
    >
      <div className="sp-card__body">
        <Badge tone="plus" icon="crown" style={{ justifySelf: 'start' }}>
          Plus
        </Badge>
        <div style={{ display: 'grid', gap: 6 }}>
          <h2 id="plus-h" className="sp-plus-card__title">
            Multi-server tools are part of Plus
          </h2>
          <p className="sp-page-head__desc">
            Copy welcome messages, AutoMod rules or a whole setup from{' '}
            {server.name} to your other servers. You’ll see a preview of every
            change before anything is copied.
          </p>
        </div>
        <ul className="sp-price__features" style={{ border: 0, padding: 0 }}>
          {[
            'Copy settings to your other servers, with a preview first',
            '100 message templates and 100 MB storage',
            '25 steps per workflow, transcripts kept 30 days',
          ].map((f) => (
            <li key={f}>
              <Icon name="check" size="sm" />
              {f}
            </li>
          ))}
        </ul>
        <Segmented
          label="Billing period"
          value={period}
          onChange={setPeriod}
          className="sp-plus-card__periods"
          options={(Object.keys(periods) as Period[]).map((k) => ({
            value: k,
            label: periods[k].label,
          }))}
        />
        <div className="sp-plus-card__price" aria-live="polite">
          <span className="sp-price__value">{plan.price}</span>
          <span className="sp-price__unit">{plan.unit}</span>
          {plan.save && <Badge tone="success">{plan.save}</Badge>}
        </div>
        <p className="sp-hint">{plan.note}</p>
        <div className="sp-plus-card__cta">
          <Button
            variant="primary"
            aria-busy={paying}
            disabled={paying}
            onClick={() => {
              setPaying(true);
              setTimeout(() => {
                setPaying(false);
                toast({
                  title: 'PayPal would open here',
                  body: `You’d pay ${plan.price} for ${server.name} through PayPal.`,
                });
              }, 700);
            }}
          >
            {paying && <Spinner />}
            {paying ? 'Opening PayPal…' : `Get Plus for ${server.name}`}
          </Button>
          <span className="sp-hint">
            Paid through PayPal. Cancel any time from Plan &amp; billing.
          </span>
        </div>
      </div>
    </section>
  );
}

/** The shared layout for modules whose own settings arrive in a later stage. */
function GenericModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const state = useModuleState(server.id, module.id);
  const save = useSaveModule(server.id, module.id);
  const flow = useSaveFlow(server.id, module.id);
  const [tab, setTab] = useModuleTab();
  const [draft, setDraft] = useState<boolean | null>(null);
  const toast = useToast();
  const savedOn = state.data?.on ?? false;
  const on = draft ?? savedOn;
  const dirty = draft !== null && draft !== savedOn;
  const paused = !!server.paused;
  const power = hasPowerSwitch(module);

  const body =
    tab === 'history' ? (
      <EmptyState icon="rotate-ccw" title="No changes yet">
        Every time someone saves this module, the version is kept here so you
        can restore it.
      </EmptyState>
    ) : tab === 'items' ? (
      <EmptyState
        icon={module.icon}
        title={`No ${module.label.toLowerCase()} items yet`}
      >
        {module.description}
      </EmptyState>
    ) : (
      <EmptyState
        icon={module.icon}
        title={`Set up ${module.label}`}
        actions={
          <>
            <Button
              variant="primary"
              onClick={() =>
                toast({
                  title: `${module.label} settings are coming`,
                  body: 'This module’s settings page is built in a later stage of the redesign.',
                })
              }
            >
              {module.firstStep}
            </Button>
            <Link
              className="sp-btn sp-btn--ghost"
              to={`/features/${module.id}`}
            >
              How it works
            </Link>
          </>
        }
      >
        {module.description}
      </EmptyState>
    );

  return (
    <>
      <ModuleHeader
        module={module}
        sync={
          power
            ? syncState({ paused, dirty, phase: flow.phase, on: savedOn })
            : null
        }
        power={
          power
            ? {
                on,
                onChange: (next) => {
                  setDraft(next);
                  flow.clear();
                },
                disabled: paused || flow.busy || state.isPending,
                hint: paused
                  ? 'Locked by Sparko staff'
                  : on
                    ? 'Running after you save'
                    : 'Not running',
              }
            : undefined
        }
      />
      <PausedNotice server={server} />
      <SavePipeline phase={flow.phase} liveLabel="Live" error={flow.error} />
      <ModuleTabs module={module} tab={tab} onChange={setTab} />
      <div className="sp-card">{body}</div>
      <ModuleSaveBar
        visible={dirty && !paused}
        saving={flow.phase === 'saving'}
        error={flow.saveError}
        onReset={() => setDraft(null)}
        onSave={() =>
          void flow
            .run(() => save.mutateAsync({ on }))
            .then((ok) => {
              if (ok) setDraft(null);
            })
        }
      />
    </>
  );
}

export function ModulePage() {
  const { moduleId = '' } = useParams();
  const { server } = useCurrentServer();
  const module = moduleById(moduleId);
  useDashboardTitle(module?.label ?? 'Not found', server?.name);
  if (!server) return null;
  if (!module)
    return (
      <div className="sp-card">
        <EmptyState
          icon="circle-help"
          title="This module doesn’t exist"
          actions={
            <Link
              className="sp-btn sp-btn--secondary"
              to={`/dashboard/${server.id}`}
            >
              Back to the overview
            </Link>
          }
        >
          The link may be old. Find modules in the sidebar or with search.
        </EmptyState>
      </div>
    );
  if (module.plus && server.plan !== 'plus')
    return (
      <>
        <ModuleHeader module={module} sync={null} />
        <NeedsPlus server={server} />
      </>
    );
  if (module.id === 'welcome')
    return <WelcomeModule module={module} server={server} />;
  if (module.id === 'studio')
    return <StudioModule module={module} server={server} />;
  if (module.id === 'role-menus')
    return <ReactionRolesModule module={module} server={server} />;
  if (module.id === 'tickets')
    return <TicketsModule module={module} server={server} />;
  if (module.id === 'autoroles')
    return <AutoRolesModule module={module} server={server} />;
  if (module.id === 'suggestions')
    return <SuggestionsModule module={module} server={server} />;
  return <GenericModule module={module} server={server} />;
}
