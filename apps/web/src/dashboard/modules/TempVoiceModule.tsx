import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Combobox,
  EmptyState,
  Icon,
  Input,
  Modal,
  RevealIcon,
  Segmented,
  Switch,
  Tabs,
  animIcons,
  cx,
  preloadCombobox,
  useToast,
  type RevealHover,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  commandName,
  planIssue,
  studioIssue,
  tvActAbout,
  tvActEmoji,
  tvActNames,
  tvActs,
  tvIssue,
  tvLogLine,
  tvMessageIssue,
  tvPanelRows,
  tvPresets,
  useStudio,
  useStudioActions,
  useTempVoice,
  useTempVoiceActions,
  type Server,
  type StudioMessage,
  type StudioState,
  type TempVoice,
  type TvAct,
  type TvLogEntry,
  type TvPreset,
} from '../../data';
import {
  ModuleHeader,
  ModuleSaveBar,
  PausedNotice,
  SavePipeline,
  syncState,
  useSaveFlow,
  ModuleSkeleton,
  SkelCards,
} from './frame';
import { ContainerCanvas } from './ContainerCanvas';
import { EmbedCanvas } from './EmbedCanvas';
import { StudioDataProvider } from './ComponentsEditor';
import {
  AnimatedIconButton,
  EditingIcon,
  InfoTip,
  InsertProvider,
  IssueProvider,
  flashIssue,
  type ShownIssue,
} from './EditorBits';
import { JsonPanel } from './JsonPanel';
import { MessageCanvas, forChecks } from './MessageCanvas';
import { plusAnimations } from './StudioLibrary';
import { templateItems } from './SGSettings';
import { TVSettings, TVStorage } from './TVSettings';

const MODULE = 'temp-voice';
const NONE = 'none';

type Tab = 'settings' | 'edit' | 'storage' | 'logs' | 'commands';
const tabs: Tab[] = ['settings', 'edit', 'storage', 'logs', 'commands'];
const tabLabels: Record<Tab, string> = {
  settings: 'Settings',
  edit: 'Edit',
  storage: 'Storage',
  logs: 'Logs',
  commands: 'Commands',
};
const tabIcons: Record<Tab, { icon: string; anim: RevealHover | undefined }> = {
  settings: { icon: 'settings', anim: animIcons.settingOutline },
  edit: { icon: 'square-pen', anim: animIcons.template },
  storage: { icon: 'layers', anim: animIcons.storage },
  logs: { icon: 'scroll-text', anim: animIcons.log },
  commands: { icon: 'terminal', anim: animIcons.command },
};

/** The open tab, kept in the address so links and Back work. */
function useTab() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && tabs.includes(raw) ? raw : 'settings';
  const setTab = (next: Tab) => {
    const out = new URLSearchParams(params);
    if (next === 'settings') out.delete('tab');
    else out.set('tab', next);
    setParams(out, { replace: true });
  };
  return [tab, setTab] as const;
}

/** Which tab a problem is on. */
const tabOf = (at: string): Tab =>
  at.startsWith('message') || at.startsWith('embed') || at === 'text'
    ? 'edit'
    : at.startsWith('command:')
      ? 'commands'
      : 'settings';

/** A template's problems as the panel, ignoring its channel. */
const messageProblem = (m: StudioMessage, c: TempVoice, server: Server) =>
  studioIssue({ ...forChecks(m), channel: '1' }) ??
  planIssue(m, server.plan === 'plus' ? 'plus' : 'free') ??
  tvMessageIssue(m, c);

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function TempVoiceModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const tv = useTempVoice(server.id);
  const studio = useStudio(server.id);
  const actions = useTempVoiceActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useTab();
  const [draft, setDraft] = useState<TempVoice | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  // Unsaved changes to the Studio template the panel uses.
  const [messages, setMessages] = useState<Record<string, StudioMessage>>({});
  const [tried, setTried] = useState(false);
  const [issue, setIssue] = useState<ShownIssue | null>(null);

  useEffect(() => {
    preloadCombobox();
  }, []);
  useEffect(() => {
    if (!issue) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => flashIssue(issue.at));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [issue]);

  const saved = tv.data?.config;
  const current = draft ?? saved;
  const savedOn = tv.data?.on ?? false;
  const isOn = on ?? savedOn;
  const studioTemplates = studio.data?.templates ?? [];
  const savedMessage = (id: string): StudioMessage | undefined => {
    const t = studioTemplates.find((x) => x.id === id);
    return t && { ...t.message, name: t.name };
  };
  const messageOf = (id: string) => messages[id] ?? savedMessage(id);
  const changedMessages = Object.entries(messages).filter(
    ([id, m]) => JSON.stringify(m) !== JSON.stringify(savedMessage(id)),
  );
  const dirty =
    (on !== null && on !== savedOn) ||
    (!!draft && JSON.stringify(draft) !== JSON.stringify(saved)) ||
    changedMessages.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (tv.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module} tabs={5}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (tv.isError || studio.isError || !tv.data || !studio.data || !current)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Temporary voice"
          actions={
            <Button
              onClick={() => {
                void tv.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = tv.data;
  const paused = !!server.paused;
  const edit = (patch: Partial<TempVoice>) => {
    setDraft({ ...current, ...patch });
    flow.clear();
  };
  const editMessage = (id: string, patch: Partial<StudioMessage>) => {
    const m = messageOf(id);
    if (!m) return;
    setMessages((all) => ({ ...all, [id]: { ...m, ...patch } }));
    flow.clear();
  };
  const point = (at: string, title: string, problem: string) => {
    setTried(true);
    setTab(tabOf(at));
    setIssue((i) => ({ at, n: (i?.n ?? 0) + 1 }));
    toast({ tone: 'danger', title, body: problem });
  };

  const doSave = async () => {
    for (const [id, m] of changedMessages) {
      const found = messageProblem(m, current, server);
      if (found)
        return point(
          id === current.panel.message ? 'message' : found.at,
          `Can’t save “${m.name}” yet`,
          found.problem,
        );
    }
    const used = current.panel.message
      ? messageOf(current.panel.message)
      : undefined;
    const rows = used && tvMessageIssue(used, current);
    if (rows) return point('message', 'Can’t save yet', rows.problem);
    const found = tvIssue(current, {
      plan: server.plan,
      templates: new Set(studioTemplates.map((t) => t.id)),
      voice: new Set(data.voice.map((v) => v.id)),
      categories: new Set(data.categories.map((c) => c.id)),
      channels: new Set(data.channels.map((c) => c.id)),
      roles: new Set(data.roles.map((r) => r.id)),
      boostLevel: data.boostLevel,
    });
    if (found) return point(found.at, 'Can’t save yet', found.problem);
    setTried(true);
    const ok = await flow.run(async () => {
      for (const [id, message] of changedMessages)
        await studioActions.updateTemplate.mutateAsync({ id, message });
      await actions.save.mutateAsync({ on: isOn, config: current });
    });
    if (ok) {
      setDraft(null);
      setMessages({});
      setOn(null);
      setTried(false);
    }
  };

  /** Adds a Studio template for the panel and uses it. */
  const startFrom = async (m: StudioMessage, name: string) => {
    try {
      const { id } = await studioActions.saveTemplate.mutateAsync({
        name,
        message: { ...m, name, channel: current.panel.channel },
        folderId: null,
      });
      edit({ panel: { ...current.panel, message: id } });
      toast({
        title: `Added “${name}” to your templates`,
        body: 'Edit it in the preview. It’s in Message Studio too. Save to use it.',
      });
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Couldn’t add the template',
        body: e instanceof Error ? e.message : 'Try again in a moment.',
      });
    }
  };

  const post = () =>
    actions.post.mutate(undefined, {
      onSuccess: (r) =>
        r.status === 'live'
          ? toast({
              title: 'Panel posted',
              body: `It’s in #${data.channels.find((c) => c.id === current.panel.channel)?.name ?? 'the channel'}.`,
            })
          : toast({
              tone: 'danger',
              title: 'Couldn’t post the panel',
              body: r.message,
            }),
      onError: (e) =>
        toast({
          tone: 'danger',
          title: 'Couldn’t post the panel',
          body: e.message,
        }),
    });

  const hubs = current.hubs.length;
  return (
    <>
      <ModuleHeader
        module={module}
        sync={syncState({ paused, dirty, phase: flow.phase, on: savedOn })}
        power={{
          on: isOn,
          onChange: (next) => {
            setOn(next);
            flow.clear();
          },
          disabled: paused || flow.busy,
          hint: paused
            ? 'Locked by Sparko staff'
            : isOn
              ? 'Members can make their own voice rooms'
              : 'No new rooms are made',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel={
          hubs
            ? `Live with ${hubs === 1 ? '1 hub' : `${hubs} hubs`}`
            : 'Temporary voice is live'
        }
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>
            Temporary voice is off. Turn it on above to edit it. Rooms already
            open are still cleaned up when they’re empty.
          </span>
        </p>
      )}
      <div className={cx('sp-greet-body', !isOn && 'is-off')} inert={!isOn}>
        <Tabs
          label={module.label}
          value={tab}
          onChange={setTab}
          tabs={tabs.map((value) => ({
            value,
            label: tabLabels[value],
            icon: tabIcons[value].icon,
            anim: tabIcons[value].anim,
            ...(value === 'storage' ? { count: data.rooms } : {}),
            ...(value === 'logs' ? { count: data.log.length } : {}),
          }))}
        />
        <InsertProvider>
          <IssueProvider value={issue}>
            <StudioDataProvider
              value={{
                serverId: server.id,
                templates: studio.data.templates,
                folders: studio.data.folders,
                roles: studio.data.roles,
                sendLimit: studio.data.sendLimit,
              }}
            >
              {tab === 'settings' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Settings</legend>
                  <TVSettings
                    server={server}
                    config={current}
                    limits={data.limits}
                    boostLevel={data.boostLevel}
                    channels={data.channels}
                    voice={data.voice}
                    categories={data.categories}
                    roles={data.roles}
                    panelAt={data.panel?.channelId ?? null}
                    dirty={dirty}
                    posting={actions.post.isPending}
                    onPost={post}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'edit' && (
                <TVEdit
                  server={server}
                  config={current}
                  studio={studio.data}
                  tried={tried}
                  busy={studioActions.saveTemplate.isPending}
                  messageOf={messageOf}
                  onChange={edit}
                  onMessage={editMessage}
                  onStart={(m, name) => void startFrom(m, name)}
                />
              )}
              {tab === 'storage' && (
                <TVStorage
                  server={server}
                  config={current}
                  voice={data.voice}
                  paused={paused}
                />
              )}
              {tab === 'logs' && <TVLog entries={data.log} />}
              {tab === 'commands' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Commands</legend>
                  <TVCommands config={current} onChange={edit} />
                </fieldset>
              )}
            </StudioDataProvider>
          </IssueProvider>
        </InsertProvider>
      </div>
      <ModuleSaveBar
        visible={dirty && !paused}
        saving={flow.phase === 'saving'}
        error={flow.saveError}
        onReset={() => {
          setDraft(null);
          setMessages({});
          setOn(null);
          setTried(false);
        }}
        onSave={() => void doSave()}
      />
    </>
  );
}

// Edit ------------------------------------------------------------------------

/** Ready-made panels, shown as they look. */
function PresetPicker({
  open,
  serverId,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  serverId: string;
  busy: boolean;
  onClose: () => void;
  onPick: (p: TvPreset) => void;
}) {
  const noop = () => {};
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={
        <RevealIcon anim={animIcons.sparkle} fallback="sparkles" size={22} />
      }
      title="Default templates"
      description="Picking one adds it to your Message Studio templates and uses it for the control panel."
    >
      <div className="sp-presets">
        {tvPresets.map((p) => (
          <div key={p.id} className="sp-preset">
            <span className="sp-preset__kind">
              {p.message.layout === 'v2' ? 'V2 components' : 'Embed message'}
            </span>
            <span className="sp-preset__look" inert>
              {p.message.layout === 'v2' ? (
                <ContainerCanvas
                  message={p.message}
                  serverId={serverId}
                  onChange={noop}
                  focusId={null}
                />
              ) : (
                <EmbedCanvas
                  message={p.message}
                  serverId={serverId}
                  onChange={noop}
                  focus={null}
                />
              )}
            </span>
            <button
              type="button"
              className="sp-preset__pick"
              disabled={busy}
              onClick={() => onPick(p)}
            >
              <span className="sp-preset__name">{p.name}</span>
              <span className="sp-preset__about">{p.about}</span>
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** The panel's fixed buttons, as Discord shows them under the message. */
function PanelButtons({ config }: { config: TempVoice }) {
  const shown = tvActs.filter((a) => config.panel.buttons.includes(a));
  if (!shown.length)
    return (
      <div className="sp-rr-preview">
        <p className="sp-hint sp-tv-preview-none">
          No buttons are picked. Pick them in Settings.
        </p>
      </div>
    );
  const rows: TvAct[][] = [];
  for (let i = 0; i < shown.length; i += 5) rows.push(shown.slice(i, i + 5));
  return (
    <div className="sp-rr-preview">
      <div className="dc-components sp-tv-preview" aria-label="Panel buttons">
        {rows.map((row, i) => (
          <div key={i} className="dc-row">
            {row.map((a) => (
              <span
                key={a}
                className={cx(
                  'dc-btn',
                  a === 'create' && 'dc-btn--success',
                  a === 'delete' && 'dc-btn--danger',
                )}
                title={tvActAbout[a]}
              >
                <span className="dc-emoji">{tvActEmoji[a]}</span>
                {config.panel.labels && tvActNames[a]}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TVEdit({
  server,
  config,
  studio,
  tried,
  busy,
  messageOf,
  onChange,
  onMessage,
  onStart,
}: {
  server: Server;
  config: TempVoice;
  studio: StudioState;
  tried: boolean;
  busy: boolean;
  messageOf: (id: string) => StudioMessage | undefined;
  onChange: (patch: Partial<TempVoice>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onStart: (m: StudioMessage, name: string) => void;
}) {
  const [presets, setPresets] = useState(false);
  const id = config.panel.message;
  const message = id ? messageOf(id) : undefined;
  const paused = !!server.paused;
  const sparko = tvPresets[0]!;
  const rows = tvPanelRows(config);
  const pick = (v: string) =>
    onChange({ panel: { ...config.panel, message: v === NONE ? '' : v } });
  const banner = !config.panel.channel && !config.panel.inRooms && (
    <p className="sp-edit-banner" role="note">
      <Icon name="info" size="sm" />
      <span>
        The panel isn’t posted anywhere yet. Pick its channel in Settings.
      </span>
    </p>
  );
  const picker = (
    <PresetPicker
      open={presets}
      serverId={server.id}
      busy={busy}
      onClose={() => setPresets(false)}
      onPick={(p) => {
        setPresets(false);
        onStart(p.message, p.name);
      }}
    />
  );

  // Nothing picked yet: Sparko's own until they start one.
  if (!message)
    return (
      <div className="sp-stack">
        {banner}
        <section className="sp-card sp-greet-empty" aria-label="Live preview">
          <EmptyState
            icon={<EditingIcon />}
            title={
              id
                ? 'The panel’s template was deleted'
                : 'How should the control panel look?'
            }
            actions={
              <div className="sp-greet-start">
                <AnimatedIconButton
                  reveal={plusAnimations.reveal}
                  hover={plusAnimations.hover}
                  select={plusAnimations.select}
                  disabled={paused}
                  loading={busy}
                  onClick={() =>
                    onStart(
                      { ...sparko.message, name: 'Voice panel' },
                      'Voice panel',
                    )
                  }
                >
                  Create your own
                </AnimatedIconButton>
                <Button
                  variant="primary"
                  size="sm"
                  icon="sparkles"
                  disabled={paused}
                  onClick={() => setPresets(true)}
                >
                  Use a default template
                </Button>
              </div>
            }
          >
            The text above the panel’s buttons. Until you pick one, Sparko uses
            its {sparko.name}. Your message is a Message Studio template, edited
            right in the preview.
          </EmptyState>
          {id && (
            <Button
              size="sm"
              variant="ghost"
              disabled={paused}
              onClick={() => pick(NONE)}
            >
              Use Sparko’s template
            </Button>
          )}
          {picker}
        </section>
      </div>
    );

  return (
    <div className="sp-stack">
      {banner}
      <div className="sp-studio__grid">
        <fieldset className="sp-fieldset" disabled={paused}>
          <legend className="sp-sr-only">Control panel</legend>
          <MessageCanvas
            key={id}
            server={server}
            message={message}
            tried={tried}
            headingId="tv-preview"
            voiceVariables
            maxRows={5 - rows}
            rowsNote={`The panel’s buttons take ${rows} ${rows === 1 ? 'row' : 'rows'}, so this holds ${5 - rows} ${5 - rows === 1 ? 'row' : 'rows'} of buttons and menus.`}
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(id, patch)}
            above={
              <p className="sp-edit-banner" role="status">
                <Icon name="info" size="sm" />
                <span>
                  Editing <b>{message.name}</b> from Message Studio. The panel’s
                  buttons sit under it
                  {message.layout === 'v2'
                    ? ''
                    : `, taking ${rows} of Discord’s five rows`}
                  . Posted in a room’s chat, <code>{'{room}'}</code>,{' '}
                  <code>{'{room.owner}'}</code> and more are filled in.
                </span>
              </p>
            }
            below={<PanelButtons config={config} />}
          />
        </fieldset>

        <section
          className="sp-card sp-studio__side"
          aria-labelledby="tv-message"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="tv-message">
                Control panel
              </h2>
              <p className="sp-card__sub">
                Pick the template, or edit its JSON. Saving updates the posted
                panel.
              </p>
            </div>
          </div>
          <div className="sp-card__body">
            <div data-issue="message">
              <Combobox
                label={
                  <>
                    Message template{' '}
                    <InfoTip text="The Message Studio template for the panel’s text. Sparko adds the buttons you picked in Settings." />
                  </>
                }
                searchPlaceholder="Search templates"
                value={id}
                onChange={pick}
                items={[
                  {
                    value: NONE,
                    label: 'Sparko’s template',
                    icon: 'sparkles',
                    group: 'Default',
                    note: sparko.name,
                  },
                  ...templateItems(studio),
                ]}
              />
            </div>
            <Button
              size="sm"
              icon="sparkles"
              disabled={paused}
              onClick={() => setPresets(true)}
            >
              Use a default template
            </Button>
            <JsonPanel
              message={message}
              onChange={(next) => onMessage(id, next)}
            />
          </div>
        </section>
      </div>
      {picker}
    </div>
  );
}

// Logs ------------------------------------------------------------------------

const logIcon: Record<TvLogEntry['action'], string> = {
  created: 'plus',
  renamed: 'pencil',
  limit: 'users',
  locked: 'lock',
  unlocked: 'key-round',
  hidden: 'shield',
  shown: 'eye',
  owner: 'crown',
  deleted: 'trash-2',
  failed: 'circle-x',
};
const changes: TvLogEntry['action'][] = [
  'renamed',
  'limit',
  'locked',
  'unlocked',
  'hidden',
  'shown',
  'owner',
];

function TVLog({ entries }: { entries: TvLogEntry[] }) {
  const [filter, setFilter] = useState<
    'all' | 'rooms' | 'changes' | 'problems'
  >('all');
  const shown = entries.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'rooms'
        ? e.action === 'created' || e.action === 'deleted'
        : filter === 'changes'
          ? changes.includes(e.action)
          : e.action === 'failed',
  );
  return (
    <section className="sp-card" aria-labelledby="tv-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="tv-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every room made and deleted, renamed, locked or hidden, and every
            new owner.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'rooms', label: 'Rooms' },
            { value: 'changes', label: 'Changes' },
            { value: 'problems', label: 'Problems' },
          ]}
        />
      </div>
      {shown.length ? (
        <ol className="sp-greet-log">
          {shown.map((e) => (
            <li
              key={e.id}
              className={cx(
                'sp-greet-log__row',
                e.action === 'failed' && 'is-failed',
              )}
            >
              <Icon
                name={logIcon[e.action]}
                size="sm"
                className="sp-greet-log__icon"
              />
              <span className="sp-greet-log__text">{tvLogLine(e)}</span>
              <span className="sp-greet-log__meta">
                {e.userId === '0' ? 'Sparko' : e.userId} · {when(e.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={
            <RevealIcon anim={animIcons.log} fallback="scroll-text" size={28} />
          }
          title="Nothing yet"
        >
          When members make and change rooms, it shows here.
        </EmptyState>
      )}
    </section>
  );
}

// Commands --------------------------------------------------------------------

const commandOptions: Record<TvAct, string> = {
  create: '[name] [limit]',
  rename: '[name]',
  limit: '[limit]',
  lock: '',
  unlock: '',
  hide: '',
  show: '',
  trust: '[member]',
  untrust: '[member]',
  invite: '[member]',
  kick: '[member]',
  block: '[member]',
  unblock: '[member]',
  claim: '',
  transfer: '[member]',
  region: '[region]',
  bitrate: '[kbps]',
  delete: '',
};
const cleanName = (v: string) => v.toLowerCase().replace(/\s+/g, '-');

function TVCommands({
  config,
  onChange,
}: {
  config: TempVoice;
  onChange: (patch: Partial<TempVoice>) => void;
}) {
  const group = config.commands.group;
  const edit = (key: TvAct, patch: Partial<TempVoice['commands']['lock']>) =>
    onChange({
      commands: {
        ...config.commands,
        [key]: { ...config.commands[key], ...patch },
      },
    });
  const badGroup = !commandName.test(group.name);
  return (
    <section className="sp-card" aria-labelledby="tv-commands">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="tv-commands">
            Commands
          </h2>
          <p className="sp-card__sub">
            The /{group.name} command and what it can do in this server. Rename
            them, change what Discord shows under them, or turn them off.
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        <div className="sp-sg-command" data-issue="command:group">
          <div className="sp-sg-command__head">
            <span className="sp-sg-command__title">
              <Icon name="terminal" size="sm" />
              The command
              <InfoTip text="Members type this, then one of the commands below, like /voice lock. Turning every one off removes it." />
            </span>
          </div>
          <div className="sp-ar__pair">
            <Input
              label="Name"
              suffix="/"
              maxLength={32}
              value={group.name}
              onChange={(e) =>
                onChange({
                  commands: {
                    ...config.commands,
                    group: { ...group, name: cleanName(e.target.value) },
                  },
                })
              }
              {...(badGroup
                ? { error: '1 to 32 lowercase letters, numbers, - or _.' }
                : {
                    hint: `/${group.name} lock, /${group.name} trust and more`,
                  })}
            />
            <Input
              label="Description"
              maxLength={100}
              value={group.description}
              onChange={(e) =>
                onChange({
                  commands: {
                    ...config.commands,
                    group: { ...group, description: e.target.value },
                  },
                })
              }
              hint="Shown under the command in Discord."
            />
          </div>
        </div>
        <ul className="sp-sg-commands">
          {tvActs.map((key) => {
            const c = config.commands[key];
            const bad = !commandName.test(c.name);
            return (
              <li
                key={key}
                className={cx('sp-sg-command', !c.on && 'is-off')}
                data-issue={`command:${key}`}
              >
                <div className="sp-sg-command__head">
                  <span className="sp-sg-command__title">
                    <Icon name="terminal" size="sm" />
                    {tvActNames[key]}
                    <InfoTip text={tvActAbout[key]} />
                  </span>
                  <Switch
                    checked={c.on}
                    onChange={(on) => edit(key, { on })}
                    description={`/${group.name} ${c.name} on or off`}
                  />
                </div>
                <div className="sp-ar__pair">
                  <Input
                    label="Name"
                    suffix={`/${group.name}`}
                    maxLength={32}
                    value={c.name}
                    disabled={!c.on}
                    onChange={(e) =>
                      edit(key, { name: cleanName(e.target.value) })
                    }
                    {...(bad
                      ? {
                          error: '1 to 32 lowercase letters, numbers, - or _.',
                        }
                      : {
                          hint: `/${group.name} ${c.name} ${commandOptions[key]}`.trim(),
                        })}
                  />
                  <Input
                    label="Description"
                    maxLength={100}
                    value={c.description}
                    disabled={!c.on}
                    onChange={(e) => edit(key, { description: e.target.value })}
                    hint="Shown under the command in Discord."
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="sp-hint">
          Commands change in Discord a few seconds after you save. They act on
          the room the member is in or owns, and only its owner can change it.
        </p>
      </div>
    </section>
  );
}
