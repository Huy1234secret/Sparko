import { SkelList } from './modules/frame';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  PausedBanner,
  RevealIcon,
  animIcons,
} from '../ui';
import { moduleById, modules } from '../content/modules';
import {
  api,
  keys,
  useCheckPermissions,
  useOverview,
  useSkipStep,
  type ModuleHealth,
  type Overview,
} from '../data';
import { useQueryClient } from '@tanstack/react-query';
import { FixPermissionModal, fixes } from './FixPermissionModal';
import {
  formatCount,
  planName,
  ServerMark,
  useDashboardTitle,
  useServerId,
} from './shared';

const statusLabel: Record<ModuleHealth, string> = {
  live: 'Live',
  off: 'Off',
  'needs-fix': 'Needs a fix',
};

function Checklist({ overview }: { overview: Overview }) {
  const serverId = useServerId();
  const navigate = useNavigate();
  const skip = useSkipStep(serverId);
  const [showAll, setShowAll] = useState(false);
  const { steps, server } = overview;
  const done = steps.filter((s) => s.status === 'done').length;
  const finished = steps.every((s) => s.status !== 'todo');
  const current = steps.find((s) => s.status === 'todo');
  const minutes = steps
    .filter((s) => s.status === 'todo')
    .reduce((sum, s) => sum + (parseInt(s.meta, 10) || 0), 0);

  if (finished && !showAll)
    return (
      <section className="sp-card" aria-labelledby="cl-h">
        <div className="sp-card__body sp-checklist-done">
          <span className="sp-row__icon sp-row__icon--success">
            <Icon name="circle-check" />
          </span>
          <div>
            <h2 className="sp-card__title" id="cl-h">
              {server.name} is set up
            </h2>
            <p className="sp-card__sub">
              Every starter step is done or skipped. Browse modules any time
              from the sidebar.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show steps
          </Button>
        </div>
      </section>
    );
  return (
    <section className="sp-card" aria-labelledby="cl-h">
      <div className="sp-card__body" style={{ gap: 12 }}>
        <div className="sp-checklist-head">
          <h2 className="sp-card__title" id="cl-h">
            Get {server.name} set up
          </h2>
          <span className="sp-hint sp-tnum">
            {done} of {steps.length} done
            {minutes ? ` · about ${minutes} min left` : ''}
          </span>
        </div>
        <div
          className="sp-progress"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuenow={Math.round((done / steps.length) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="sp-progress__bar"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="sp-steps">
        {steps.map((step, i) => {
          const isCurrent = step === current;
          return (
            <li
              key={step.id}
              className={
                'sp-step' +
                (step.status === 'done' ? ' is-done' : '') +
                (step.status === 'skipped' ? ' is-skipped' : '') +
                (isCurrent ? ' is-current' : '')
              }
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="sp-step__mark">
                {step.status === 'done' ? <Icon name="check" /> : i + 1}
              </span>
              <span className="sp-step__title">
                {step.title}
                {step.needsPermission && (
                  <Badge tone="warning" size="sm" icon="triangle-alert">
                    Needs a permission
                  </Badge>
                )}
                {step.status === 'skipped' && (
                  <span className="sp-sr-only"> (skipped)</span>
                )}
              </span>
              <span className="sp-step__meta">{step.meta}</span>
              {isCurrent && step.description && (
                <span className="sp-step__desc">{step.description}</span>
              )}
              {isCurrent && (
                <div className="sp-step__actions">
                  {step.moduleId && step.action && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        navigate(`/dashboard/${serverId}/${step.moduleId}`)
                      }
                    >
                      {step.action}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={skip.isPending}
                    onClick={() =>
                      skip.mutate({ stepId: step.id, skipped: true })
                    }
                  >
                    Skip for now
                  </Button>
                </div>
              )}
              {step.status === 'skipped' && (
                <div className="sp-step__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      skip.mutate({ stepId: step.id, skipped: false })
                    }
                  >
                    Undo skip
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Health({ overview }: { overview: Overview }) {
  const serverId = useServerId();
  const client = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const checkPermissions = useCheckPermissions(serverId);
  const { health } = overview;
  const recheck = async () => {
    setChecking(true);
    try {
      await api.checkHealth(serverId);
      await client.invalidateQueries({ queryKey: keys.overview(serverId) });
    } finally {
      setChecking(false);
    }
  };
  const checked = new Date(health.checkedAt);
  return (
    <section className="sp-card" aria-labelledby="hl-h">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="hl-h">
            Health
          </h2>
          <p className="sp-card__sub">
            Checked at{' '}
            {checked.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="refresh-cw"
          loading={checking}
          loadingLabel="Checking…"
          onClick={recheck}
        >
          Check again
        </Button>
      </div>
      <div className="sp-rows">
        {health.latencyMs >= 0 ? (
          <div className="sp-row sp-row--success">
            <span className="sp-row__icon">
              <Icon name="activity" />
            </span>
            <span className="sp-row__title">Sparko is online</span>
            <span className="sp-row__desc">
              Replying in {health.latencyMs} ms
            </span>
          </div>
        ) : (
          <div className="sp-row sp-row--danger">
            <span className="sp-row__icon">
              <Icon name="circle-x" />
            </span>
            <span className="sp-row__title">Sparko’s bot is offline</span>
            <span className="sp-row__desc">
              Saved changes apply as soon as it’s back.
            </span>
          </div>
        )}
        {health.missingPermission ? (
          <div className="sp-row sp-row--warning">
            <span className="sp-row__icon">
              <Icon name="triangle-alert" />
            </span>
            <span className="sp-row__title">
              Missing {health.missingPermission.name}
            </span>
            <span className="sp-row__desc">
              {health.missingPermission.affects}
            </span>
            <span className="sp-row__end">
              <Button size="sm" onClick={() => setFixOpen(true)}>
                Fix it
              </Button>
            </span>
          </div>
        ) : (
          <div className="sp-row sp-row--success">
            <span className="sp-row__icon">
              <Icon name="shield-check" />
            </span>
            <span className="sp-row__title">All permissions OK</span>
            <span className="sp-row__desc">
              Sparko can do everything your modules need.
            </span>
          </div>
        )}
        <div className="sp-row sp-row--success">
          <span className="sp-row__icon">
            <Icon name="terminal" />
          </span>
          <span className="sp-row__title">Commands are up to date</span>
          <span className="sp-row__desc">
            {health.commandsSynced} slash commands synced to Discord
          </span>
        </div>
        <div className="sp-row sp-row--info">
          <span className="sp-row__icon">
            <Icon name="layers" />
          </span>
          <span className="sp-row__title">
            {planName(overview.server)} plan limits
          </span>
          <span className="sp-row__desc">
            {health.templates.used} of {health.templates.limit} templates ·{' '}
            {health.storageMb.used} of {health.storageMb.limit} MB storage
          </span>
          <span className="sp-row__end">
            <Link
              className="sp-btn sp-btn--ghost sp-btn--sm"
              to={`/dashboard/${serverId}/billing`}
            >
              Details
            </Link>
          </span>
        </div>
      </div>
      <FixPermissionModal
        open={fixOpen}
        {...fixes.manageRoles}
        checking={checkPermissions.isPending}
        onCheck={() =>
          checkPermissions.mutate(undefined, {
            onSuccess: () => setFixOpen(false),
          })
        }
        onClose={() => setFixOpen(false)}
      />
    </section>
  );
}

export function OverviewPage() {
  const serverId = useServerId();
  const overview = useOverview(serverId);
  useDashboardTitle(overview.data?.server.name, 'Overview');
  if (overview.isPending)
    return (
      <div className="sp-stack" aria-busy="true" aria-label="Loading">
        <header className="sp-page-head">
          <div className="sp-page-head__text sp-skel-stack">
            <span className="sp-skel" style={{ width: 90 }} />
            <span className="sp-skel sp-skel--title" style={{ width: 280 }} />
            <span
              className="sp-skel"
              style={{ width: 420, maxWidth: '100%' }}
            />
          </div>
        </header>
        <div className="sp-split sp-split--wide">
          <SkelList rows={4} />
          <SkelList rows={3} />
        </div>
        <div className="sp-split">
          <SkelList rows={5} />
          <SkelList rows={5} />
        </div>
      </div>
    );
  if (overview.isError)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load the overview"
          actions={
            <Button icon="refresh-cw" onClick={() => void overview.refetch()}>
              Try again
            </Button>
          }
        >
          Sparko couldn’t reach Discord to read your server. Nothing was
          changed.
        </EmptyState>
      </div>
    );
  const data = overview.data;
  const { server } = data;
  const onCount = Object.values(data.on).filter(Boolean).length;
  return (
    <>
      <header className="sp-page-head">
        <div className="sp-page-head__text">
          <div className="sp-page-head__eyebrow">
            <ServerMark server={server} size={20} />
            Server overview
          </div>
          <h1 className="sp-page-head__title">
            {server.name}{' '}
            {server.paused ? (
              <Badge tone="danger" pill dot>
                Paused by Sparko staff
              </Badge>
            ) : (
              <Badge tone="success" pill dot>
                Sparko is online
              </Badge>
            )}
          </h1>
          <p className="sp-page-head__desc">
            {formatCount(server.members)} members · {planName(server)} plan ·{' '}
            {onCount} modules on
          </p>
        </div>
        <div className="sp-page-head__actions">
          <AuditLogLink to={`/dashboard/${serverId}/audit`} />
        </div>
      </header>
      {server.paused && (
        <PausedBanner server={server.name} reference={server.paused.reference}>
          {server.paused.reason}
        </PausedBanner>
      )}
      <div className="sp-split sp-split--wide">
        <Checklist overview={data} />
        <div className="sp-stack">
          <Health overview={data} />
        </div>
      </div>
      <div className="sp-split">
        <section className="sp-card" aria-labelledby="ms-h">
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="ms-h">
                Modules
              </h2>
              <p className="sp-card__sub">
                {onCount} on · {modules.filter((m) => !m.plus).length} available
                on Free
              </p>
            </div>
          </div>
          <div className="sp-rows">
            {data.highlights.map((h) => {
              const m = moduleById(h.moduleId);
              if (!m) return null;
              const tone =
                h.status === 'live'
                  ? 'success'
                  : h.status === 'off'
                    ? ''
                    : 'warning';
              return (
                <Link
                  key={h.moduleId}
                  className={
                    'sp-row sp-row--link' + (tone ? ` sp-row--${tone}` : '')
                  }
                  to={`/dashboard/${serverId}/${h.moduleId}`}
                >
                  <span className="sp-row__icon">
                    <Icon name={m.icon} />
                  </span>
                  <span className="sp-row__title">{m.label}</span>
                  <span className="sp-row__desc">{h.note}</span>
                  <span className="sp-row__end">
                    <span
                      className={
                        'sp-badge sp-pill ' +
                        (tone ? `sp-badge--${tone}` : 'sp-pill--muted')
                      }
                    >
                      <span className="sp-dot" />
                      {statusLabel[h.status]}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
        <section className="sp-card" aria-labelledby="ac-h">
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="ac-h">
                Recent activity
              </h2>
              <p className="sp-card__sub">
                Dashboard changes and what Sparko did
              </p>
            </div>
            <Link
              className="sp-btn sp-btn--ghost sp-btn--sm"
              to={`/dashboard/${serverId}/audit`}
            >
              Audit log
              <Icon name="chevron-right" size="sm" />
            </Link>
          </div>
          <ul className="sp-feed">
            {data.activity.map((a) => (
              <li key={`${a.who}-${a.what}`} className="sp-feed__item">
                <span className="sp-feed__glyph">
                  <Icon name={a.icon} />
                </span>
                <span className="sp-feed__text">
                  <b>{a.who}</b> {a.what}
                  <span className="sp-feed__sub">{a.detail}</span>
                </span>
                <span className="sp-feed__time">{a.when} ago</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/** "Audit log", with the log icon that plays on hover. */
function AuditLogLink({ to }: { to: string }) {
  const [hoverKey, setHoverKey] = useState(0);
  return (
    <Link
      className="sp-btn sp-btn--secondary"
      to={to}
      onPointerEnter={() => setHoverKey((k) => k + 1)}
    >
      <RevealIcon
        anim={animIcons.log}
        fallback="scroll-text"
        hoverKey={hoverKey}
      />
      Audit log
    </Link>
  );
}
