import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs,
  PausedBanner,
  Icon,
  LoopIcon,
  SaveBar,
  Switch,
  type RevealHover,
} from '../../ui';
import { ModuleIcon, useIconHover } from '../ModuleIcon';
import type { SparkoModule } from '../../content/modules';
import { api, type Server } from '../../data';
import { animIcons } from '../../ui';
const liveIdle = animIcons.live.idle;

/** Modules that are pages rather than features you switch on. */
const alwaysOn = new Set([
  'analytics',
  'audit',
  'access',
  'backups',
  'multi-server',
  'billing',
  'studio',
]);
export const hasPowerSwitch = (m: SparkoModule) => !alwaysOn.has(m.id);

export type Phase = 'idle' | 'saving' | 'applying' | 'live' | 'error';

/**
 * Saves a module, then waits for the change to reach Discord, so the page
 * can show each stage honestly: saving, applying, then live or what failed.
 */
export function useSaveFlow(serverId: string, moduleId: string) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const phaseRef = useRef<Phase>('idle');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const run = useCallback(
    async (save: () => Promise<unknown>) => {
      setError(null);
      setPhase('saving');
      try {
        await save();
      } catch (e) {
        if (!alive.current) return false;
        setPhase('idle');
        setError(
          e instanceof Error ? e.message : 'Sparko couldn’t save. Try again.',
        );
        return false;
      }
      if (!alive.current) return true;
      setPhase('applying');
      const result = await api.waitForApply(serverId, moduleId);
      if (!alive.current) return true;
      if (result.status === 'live') setPhase('live');
      else {
        setPhase('error');
        setError(result.message);
      }
      return true;
    },
    [serverId, moduleId],
  );
  /** After a fix, tries the saved change again; it goes live on its own. */
  const retryApply = useCallback(async () => {
    if (phaseRef.current !== 'error') return;
    setPhase('applying');
    const result = await api.waitForApply(serverId, moduleId, {
      retry: true,
    });
    if (!alive.current) return;
    if (result.status === 'live') {
      setError(null);
      setPhase('live');
    } else {
      setError(result.message);
      setPhase('error');
    }
  }, [serverId, moduleId]);
  /** Editing again hides the last save's progress. */
  const clear = useCallback(() => {
    setPhase((p) => (p === 'saving' || p === 'applying' ? p : 'idle'));
  }, []);
  return {
    phase,
    error,
    /** A save that failed outright (the change is still unsaved). */
    saveError: phase === 'idle' ? error : null,
    run,
    retryApply,
    clear,
    busy: phase === 'saving' || phase === 'applying',
  };
}

type Sync =
  | 'off'
  | 'live'
  | 'unsaved'
  | 'saving'
  | 'applying'
  | 'error'
  | 'paused';
const syncLabel: Record<Sync, string> = {
  off: 'Off',
  live: 'Live',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  applying: 'Applying…',
  error: 'Couldn’t apply',
  paused: 'Paused',
};
export function syncState({
  paused,
  dirty,
  phase,
  on,
}: {
  paused: boolean;
  dirty: boolean;
  phase: Phase;
  on: boolean;
}): Sync {
  if (paused) return 'paused';
  if (phase === 'saving' || phase === 'applying') return phase;
  if (dirty) return 'unsaved';
  if (phase === 'error') return 'error';
  return on ? 'live' : 'off';
}

export function ModuleHeader({
  module,
  sync,
  power,
}: {
  module: SparkoModule;
  sync: Sync | null;
  power?:
    | {
        on: boolean;
        onChange: (on: boolean) => void;
        disabled: boolean;
        hint: string;
      }
    | undefined;
}) {
  const icon = useIconHover();
  return (
    <header className="sp-module-head">
      <div className="sp-module-head__main">
        <span
          className="sp-module-head__icon"
          onPointerEnter={icon.onPointerEnter}
        >
          <ModuleIcon
            id={module.id}
            icon={module.icon}
            size={30}
            hoverKey={icon.hoverKey}
          />
        </span>
        <div className="sp-module-head__text">
          <div className="sp-page-head__eyebrow">{module.group}</div>
          <h1 className="sp-page-head__title">
            {module.label}
            {sync && (
              <span className={`sp-sync sp-sync--${sync}`} role="status">
                {sync === 'saving' || sync === 'applying' ? (
                  <span className="sp-spinner" />
                ) : sync === 'live' ? (
                  <LoopIcon src={liveIdle} delay={1000} size={14} solid />
                ) : (
                  <span className="sp-dot" />
                )}
                {syncLabel[sync]}
              </span>
            )}
          </h1>
          <p className="sp-page-head__desc">{module.description}</p>
        </div>
      </div>
      {power && (
        <div className="sp-module-head__power">
          <span style={{ display: 'grid' }}>
            <b className="sp-power-label">{power.on ? 'On' : 'Off'}</b>
            <span className="sp-hint">{power.hint}</span>
          </span>
          <Switch
            checked={power.on}
            onChange={power.onChange}
            disabled={power.disabled}
            description={`${module.label} on or off`}
          />
        </div>
      )}
    </header>
  );
}

/** "Saved → Applying to Discord → Live" after a save. */
export function SavePipeline({
  phase,
  liveLabel,
  error,
}: {
  phase: Phase;
  liveLabel: string;
  error: string | null;
}) {
  if (phase === 'idle') return null;
  const steps: [string, 'done' | 'spin' | 'wait' | 'err'][] = [
    ['Saved', phase === 'saving' ? 'spin' : 'done'],
    [
      phase === 'error' ? 'Couldn’t apply' : 'Applying to Discord',
      phase === 'saving'
        ? 'wait'
        : phase === 'applying'
          ? 'spin'
          : phase === 'error'
            ? 'err'
            : 'done',
    ],
    [liveLabel, phase === 'live' ? 'done' : 'wait'],
  ];
  const note =
    phase === 'saving'
      ? 'Saving your settings to Sparko.'
      : phase === 'applying'
        ? 'Sparko is checking permissions and updating Discord. This usually takes a few seconds.'
        : phase === 'error'
          ? `Saved, but not live yet. ${error ?? ''} Fix it below and it goes live on its own.`
          : 'Done. Members see the new version from now on.';
  return (
    <div className="sp-pipeline" role="status" aria-live="polite">
      {steps.map(([label, state], i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="sp-pipeline__sep" aria-hidden="true" />}
          <span
            className={
              'sp-pipeline__step' +
              (state === 'done'
                ? ' is-done'
                : state === 'spin'
                  ? ' is-current'
                  : state === 'err'
                    ? ' is-error'
                    : '')
            }
          >
            {state === 'done' && <Icon name="circle-check" size="sm" />}
            {state === 'spin' && <span className="sp-spinner" />}
            {state === 'err' && <Icon name="circle-x" size="sm" />}
            {state === 'wait' && <Icon name="clock" size="sm" />}
            {label}
          </span>
        </span>
      ))}
      <span className="sp-pipeline__note">{note}</span>
    </div>
  );
}

export type ModuleTab = 'settings' | 'items' | 'history';
/** The module's tab, kept in the address so links and Back work. */
export function useModuleTab(defaultTab: ModuleTab = 'settings') {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: ModuleTab =
    raw === 'settings' || raw === 'items' || raw === 'history'
      ? raw
      : defaultTab;
  const setTab = (next: ModuleTab) => {
    const out = new URLSearchParams(params);
    if (next === defaultTab) out.delete('tab');
    else out.set('tab', next);
    setParams(out, { replace: true });
  };
  return [tab, setTab] as const;
}
export function ModuleTabs({
  module,
  tab,
  onChange,
  labels = ['Settings', 'Items', 'History'],
  counts = [],
  icons = [],
}: {
  module: SparkoModule;
  tab: ModuleTab;
  onChange: (tab: ModuleTab) => void;
  labels?: [string, string, string];
  counts?: (number | undefined)[];
  /** Animated icons for the tabs, with still ones to stand in. */
  icons?: { icon: string; anim: RevealHover | undefined }[];
}) {
  const values: ModuleTab[] = ['settings', 'items', 'history'];
  return (
    <Tabs
      label={module.label}
      value={tab}
      onChange={onChange}
      tabs={values.map((value, i) => ({
        value,
        label: labels[i]!,
        ...(icons[i] ? { icon: icons[i].icon, anim: icons[i].anim } : {}),
        ...(counts[i] != null ? { count: counts[i] } : {}),
      }))}
    />
  );
}

/** The Editor, Templates and Logs (or Versions) tabs' icons. */
export const editorTabIcons = [
  { icon: 'square-pen', anim: animIcons.settingOutline },
  { icon: 'file-text', anim: animIcons.template },
  { icon: 'scroll-text', anim: animIcons.log },
];

export function PausedNotice({ server }: { server: Server }) {
  if (!server.paused) return null;
  return (
    <PausedBanner server={server.name} reference={server.paused.reference}>
      {server.paused.reason}
    </PausedBanner>
  );
}

/** The sticky bar that appears while there are unsaved changes. */
export function ModuleSaveBar({
  visible,
  saving,
  error,
  onSave,
  onReset,
  saveLabel,
}: {
  visible: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
  saveLabel?: string;
}): ReactNode {
  if (!visible) return null;
  return (
    <SaveBar
      state={saving ? 'saving' : error ? 'error' : 'dirty'}
      message={error ?? undefined}
      {...(saveLabel ? { saveLabel } : {})}
      onSave={onSave}
      onReset={onReset}
    />
  );
}
