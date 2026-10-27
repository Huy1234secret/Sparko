import { useEffect, useState, type ReactNode } from 'react';
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
  lvCommandAbout,
  lvCommandKeys,
  lvIssue,
  lvKindAbout,
  lvKindNames,
  lvKinds,
  lvLogLine,
  lvMessageIssue,
  lvPresets,
  lvStaffCommands,
  planIssue,
  studioIssue,
  useLevelActions,
  useLevels,
  useStudio,
  useStudioActions,
  type Channel,
  type Levels,
  type LvCommandKey,
  type LvKind,
  type LvLogEntry,
  type LvPreset,
  type Server,
  type StudioMessage,
  type StudioState,
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
import { ChannelPicker } from './parts';
import { plusAnimations } from './StudioLibrary';
import { templateItems } from './SGSettings';
import {
  LVCrateSettings,
  LVCrateStats,
  LVLeaderboard,
  LVLevelUpSettings,
  LVRankSettings,
  LVRewards,
  LVRules,
} from './LVSettings';

const MODULE = 'levels';
const NONE = 'none';

type Tab =
  | 'settings'
  | 'levelup'
  | 'rewards'
  | 'crates'
  | 'rank'
  | 'leaderboard'
  | 'logs'
  | 'commands';
const tabs: Tab[] = [
  'settings',
  'levelup',
  'rewards',
  'crates',
  'rank',
  'leaderboard',
  'logs',
  'commands',
];
const tabLabels: Record<Tab, string> = {
  settings: 'Settings',
  levelup: 'Level-up',
  rewards: 'Reward roles',
  crates: 'XP crates',
  rank: 'Rank cards',
  leaderboard: 'Leaderboard',
  logs: 'Logs',
  commands: 'Commands',
};
const tabIcons: Record<Tab, { icon: string; anim: RevealHover | undefined }> = {
  settings: { icon: 'settings', anim: animIcons.settingOutline },
  levelup: { icon: 'sparkles', anim: animIcons.sparkle },
  rewards: { icon: 'award', anim: animIcons.autoRole },
  crates: { icon: 'gift', anim: undefined },
  rank: { icon: 'image', anim: undefined },
  leaderboard: { icon: 'crown', anim: undefined },
  logs: { icon: 'scroll-text', anim: animIcons.log },
  commands: { icon: 'terminal', anim: animIcons.command },
};
/** The tab each message is edited on. */
const kindTab: Record<LvKind, Tab> = {
  levelup: 'levelup',
  rank: 'rank',
  crate: 'crates',
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

/** Which tab a settings problem is on. */
const tabOf = (at: string): Tab => {
  const kind = lvKinds.find((k) => at === `message:${k}`);
  if (kind) return kindTab[kind];
  if (at.startsWith('levelUp:')) return 'levelup';
  if (at.startsWith('reward')) return 'rewards';
  if (at.startsWith('crates:')) return 'crates';
  if (at.startsWith('command:')) return 'commands';
  return 'settings';
};

/** The template a message uses, and the change that picks another. */
const templateOf = (c: Levels, k: LvKind) =>
  k === 'levelup'
    ? c.levelUp.template
    : k === 'rank'
      ? c.rank.template
      : c.crates.template;
const withTemplate = (c: Levels, k: LvKind, template: string) =>
  k === 'levelup'
    ? { levelUp: { ...c.levelUp, template } }
    : k === 'rank'
      ? { rank: { ...c.rank, template } }
      : { crates: { ...c.crates, template } };

/** A template's problems as one of these messages, ignoring its channel. */
const messageProblem = (m: StudioMessage, kind: LvKind, server: Server) =>
  studioIssue({ ...forChecks(m), channel: '1' }) ??
  planIssue(m, server.plan === 'plus' ? 'plus' : 'free') ??
  lvMessageIssue(m, kind);

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function LevelsModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const lv = useLevels(server.id);
  const studio = useStudio(server.id);
  const actions = useLevelActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useTab();
  const [draft, setDraft] = useState<Levels | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  // Unsaved changes to the Studio templates the messages use.
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

  const saved = lv.data?.config;
  const current = draft ?? saved;
  const savedOn = lv.data?.on ?? false;
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

  if (lv.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module} tabs={8}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (lv.isError || studio.isError || !lv.data || !studio.data || !current)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Levels & XP"
          actions={
            <Button
              onClick={() => {
                void lv.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = lv.data;
  const paused = !!server.paused;
  const edit = (patch: Partial<Levels>) => {
    setDraft({ ...current, ...patch });
    flow.clear();
  };
  const editMessage = (id: string, patch: Partial<StudioMessage>) => {
    const m = messageOf(id);
    if (!m) return;
    setMessages((all) => ({ ...all, [id]: { ...m, ...patch } }));
    flow.clear();
  };
  const point = (at: string, to: Tab, title: string, problem: string) => {
    setTried(true);
    setTab(to);
    setIssue((i) => ({ at, n: (i?.n ?? 0) + 1 }));
    toast({ tone: 'danger', title, body: problem });
  };

  const doSave = async () => {
    for (const [id, m] of changedMessages) {
      const k = lvKinds.find((x) => templateOf(current, x) === id);
      const found = messageProblem(m, k ?? 'levelup', server);
      if (found)
        return point(
          k ? `message:${k}` : found.at,
          k ? kindTab[k] : tab,
          `Can’t save “${m.name}” yet`,
          found.problem,
        );
    }
    const found = lvIssue(current, {
      plan: server.plan,
      templates: new Set(studioTemplates.map((t) => t.id)),
      roles: new Map(data.roles.map((r) => [r.id, r.assignable !== false])),
      channels: new Set(data.channels.map((c) => c.id)),
    });
    if (found)
      return point(found.at, tabOf(found.at), 'Can’t save yet', found.problem);
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

  /** Adds a Studio template for a message and uses it. */
  const startFrom = async (k: LvKind, m: StudioMessage, name: string) => {
    try {
      const { id } = await studioActions.saveTemplate.mutateAsync({
        name,
        message: { ...m, name, channel: current.levelUp.channel },
        folderId: null,
      });
      edit(withTemplate(current, k, id));
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

  const editor = (kind: LvKind, above: ReactNode, below?: ReactNode) => (
    <LVMessage
      server={server}
      config={current}
      kind={kind}
      above={above}
      below={below}
      studio={studio.data}
      channels={data.channels}
      tried={tried}
      dirty={dirty}
      busy={studioActions.saveTemplate.isPending}
      testing={actions.test.isPending}
      messageOf={messageOf}
      onChange={edit}
      onMessage={editMessage}
      onStart={(m, name) => void startFrom(kind, m, name)}
      onTest={(channelId) =>
        actions.test.mutate(
          { channel: channelId, kind },
          {
            onSuccess: () =>
              toast({
                title: 'Test message sent',
                body: `A made-up ${lvKindNames[kind].toLowerCase()} was posted in #${data.channels.find((c) => c.id === channelId)?.name ?? 'the channel'}.`,
              }),
            onError: (e) =>
              toast({
                tone: 'danger',
                title: 'Couldn’t send the test',
                body: e.message,
              }),
          },
        )
      }
    />
  );

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
              ? 'Members earn XP and level up'
              : 'Nobody earns XP',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel="Levels & XP is live"
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>Levels & XP is off. Turn it on above to edit it.</span>
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
            ...(value === 'rewards' ? { count: current.rewards.length } : {}),
            ...(value === 'leaderboard' ? { count: data.count } : {}),
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
                  <LVRules
                    config={current}
                    channels={data.channels}
                    roles={data.roles}
                    limits={data.limits}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'levelup' &&
                editor(
                  'levelup',
                  <fieldset className="sp-fieldset" disabled={paused}>
                    <legend className="sp-sr-only">Level-up settings</legend>
                    <LVLevelUpSettings
                      config={current}
                      channels={data.channels}
                      onChange={edit}
                    />
                  </fieldset>,
                )}
              {tab === 'rewards' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Reward roles</legend>
                  <LVRewards
                    config={current}
                    roles={data.roles}
                    limits={data.limits}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'crates' &&
                editor(
                  'crate',
                  <fieldset className="sp-fieldset" disabled={paused}>
                    <legend className="sp-sr-only">XP crate settings</legend>
                    <LVCrateSettings
                      config={current}
                      channels={data.channels}
                      onChange={edit}
                    />
                  </fieldset>,
                  <LVCrateStats server={server} channels={data.channels} />,
                )}
              {tab === 'rank' &&
                editor(
                  'rank',
                  <fieldset className="sp-fieldset" disabled={paused}>
                    <legend className="sp-sr-only">Rank card settings</legend>
                    <LVRankSettings config={current} onChange={edit} />
                  </fieldset>,
                )}
              {tab === 'leaderboard' && (
                <LVLeaderboard
                  server={server}
                  roles={data.roles}
                  count={data.count}
                  paused={paused}
                />
              )}
              {tab === 'logs' && <LVLog entries={data.log} />}
              {tab === 'commands' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Commands</legend>
                  <LVCommands config={current} onChange={edit} />
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

// Messages --------------------------------------------------------------------

/** Ready-made messages of one kind, shown as they look. */
function PresetPicker({
  open,
  kind,
  serverId,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  kind: LvKind;
  serverId: string;
  busy: boolean;
  onClose: () => void;
  onPick: (p: LvPreset) => void;
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
      description={`Picking one adds it to your Message Studio templates and uses it for the ${lvKindNames[kind].toLowerCase()}.`}
    >
      <div className="sp-presets">
        {lvPresets
          .filter((p) => p.kind === kind)
          .map((p) => (
            <div key={p.id} className="sp-preset">
              <span className="sp-preset__kind">
                {p.message.layout === 'v2'
                  ? 'V2 components'
                  : p.message.embeds.length
                    ? 'Embed message'
                    : 'Text message'}
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

/** The Open button Sparko adds under every crate. */
function CrateButton() {
  return (
    <div className="sp-rr-preview" aria-label="Crate button">
      <div className="sp-qa-fixed">
        <span className="dc-btn dc-btn--success">
          <span className="dc-emoji">🎁</span>Open
        </span>
        <InfoTip text="Sparko adds this under every crate. The first member to press it wins the XP, and the button changes to say who." />
      </div>
    </div>
  );
}

/** A short name for a template started from a preset. */
const short: Record<LvKind, string> = {
  levelup: 'Level-up',
  rank: 'Rank',
  crate: 'Crate',
};
const presetName = (k: LvKind, p: LvPreset) =>
  p.name.toLowerCase().includes(short[k].toLowerCase())
    ? p.name
    : `${short[k]}: ${p.name.toLowerCase()}`;

/** Why a message isn't sent, when its settings say so. */
const offNote = (c: Levels, k: LvKind) =>
  k === 'levelup' && c.levelUp.where === 'off'
    ? 'Level-ups aren’t announced, so this isn’t sent. Pick where above.'
    : k === 'crate' && !c.crates.on
      ? 'Crates are off, so none drop. Turn them on above.'
      : k === 'rank' && !c.commands.rank.on
        ? `/${c.commands.rank.name} is off, so nobody sees this. Turn it on in Commands.`
        : null;

function LVMessage({
  server,
  config,
  kind,
  above,
  below,
  studio,
  channels,
  tried,
  dirty,
  busy,
  testing,
  messageOf,
  onChange,
  onMessage,
  onStart,
  onTest,
}: {
  server: Server;
  config: Levels;
  kind: LvKind;
  /** The message's own settings, shown above it. */
  above: ReactNode;
  /** More about it, shown under the editor. */
  below?: ReactNode;
  studio: StudioState;
  channels: Channel[];
  tried: boolean;
  dirty: boolean;
  busy: boolean;
  testing: boolean;
  messageOf: (id: string) => StudioMessage | undefined;
  onChange: (patch: Partial<Levels>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onStart: (m: StudioMessage, name: string) => void;
  onTest: (channel: string) => void;
}) {
  const [presets, setPresets] = useState(false);
  const [testChannel, setTestChannel] = useState(
    config.levelUp.channel ||
      channels.find((c) => c.canPost)?.id ||
      channels[0]?.id ||
      '',
  );
  const id = templateOf(config, kind);
  const message = id ? messageOf(id) : undefined;
  const paused = !!server.paused;
  // "XP" keeps its capitals mid-sentence.
  const name = lvKindNames[kind].toLowerCase().replace('xp', 'XP');
  const sparko = lvPresets.find((p) => p.kind === kind)!;
  const pick = (v: string) =>
    onChange(withTemplate(config, kind, v === NONE ? '' : v));
  const own = (): StudioMessage => ({
    ...sparko.message,
    name: lvKindNames[kind],
  });
  const note = offNote(config, kind);
  const banner = note && (
    <p className="sp-edit-banner" role="note">
      <Icon name="info" size="sm" />
      <span>{note}</span>
    </p>
  );
  const picker = (
    <PresetPicker
      open={presets}
      kind={kind}
      serverId={server.id}
      busy={busy}
      onClose={() => setPresets(false)}
      onPick={(p) => {
        setPresets(false);
        onStart(p.message, presetName(kind, p));
      }}
    />
  );

  // Nothing picked yet: Sparko's own until they start one.
  if (!message)
    return (
      <div className="sp-stack">
        {above}
        {banner}
        <section className="sp-card sp-greet-empty" aria-label="Live preview">
          <EmptyState
            icon={<EditingIcon />}
            title={
              id
                ? `The ${name} template was deleted`
                : `How should the ${name} look?`
            }
            actions={
              <div className="sp-greet-start">
                <AnimatedIconButton
                  reveal={plusAnimations.reveal}
                  hover={plusAnimations.hover}
                  select={plusAnimations.select}
                  disabled={paused}
                  loading={busy}
                  onClick={() => onStart(own(), lvKindNames[kind])}
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
            {lvKindAbout[kind]} Until you pick one, Sparko uses its{' '}
            {sparko.name}. Your message is a Message Studio template, edited
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
        {below}
      </div>
    );

  return (
    <div className="sp-stack">
      {above}
      {banner}
      <div className="sp-studio__grid">
        <fieldset className="sp-fieldset" disabled={paused}>
          <legend className="sp-sr-only">{lvKindNames[kind]}</legend>
          <MessageCanvas
            key={id}
            server={server}
            message={message}
            tried={tried}
            headingId="lv-preview"
            levelVariables
            {...(kind === 'crate'
              ? { maxRows: 4, rowTaker: 'The Open button' }
              : {})}
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(id, patch)}
            below={kind === 'crate' ? <CrateButton /> : undefined}
            above={
              <p className="sp-edit-banner" role="status">
                <Icon name="info" size="sm" />
                <span>
                  Editing <b>{message.name}</b> from Message Studio.{' '}
                  {lvKindAbout[kind]}{' '}
                  {kind === 'crate' ? (
                    <>
                      Use <code>{'{crate.range}'}</code> for the XP inside and{' '}
                      <code>{'{crate.ends}'}</code> for when it vanishes.
                    </>
                  ) : (
                    <>
                      Use <code>{'{level}'}</code>, <code>{'{xp}'}</code> and{' '}
                      <code>{'{progress.bar}'}</code> to show their progress.
                    </>
                  )}
                </span>
              </p>
            }
          />
        </fieldset>

        <section
          className="sp-card sp-studio__side"
          aria-labelledby="lv-message"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="lv-message">
                {lvKindNames[kind]}
              </h2>
              <p className="sp-card__sub">
                Pick the template, send a test, or edit its JSON.
              </p>
            </div>
          </div>
          <div className="sp-card__body">
            <div data-issue={`message:${kind}`}>
              <Combobox
                label={
                  <>
                    Message template <InfoTip text={lvKindAbout[kind]} />
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
            <div className="sp-post-row">
              <ChannelPicker
                label="Send a test message to"
                channels={channels}
                value={testChannel}
                onChange={setTestChannel}
              />
              <Button
                variant="primary"
                icon="send"
                loading={testing}
                disabled={paused || !testChannel}
                onClick={() => onTest(testChannel)}
              >
                Send test
              </Button>
            </div>
            {dirty && (
              <p className="sp-hint">
                The test uses what’s saved. Save first to test your latest
                changes.
              </p>
            )}
            <JsonPanel
              message={message}
              onChange={(next) => onMessage(id, next)}
            />
          </div>
        </section>
      </div>
      {below}
      {picker}
    </div>
  );
}

// Logs ------------------------------------------------------------------------

const logIcon: Record<LvLogEntry['action'], string> = {
  'level-up': 'trending-up',
  'reward-given': 'award',
  'reward-removed': 'rotate-ccw',
  'xp-changed': 'zap',
  reset: 'refresh-cw',
  'crate-dropped': 'gift',
  'crate-opened': 'gift',
  'crate-expired': 'timer',
  failed: 'circle-x',
};
type LogFilter = 'all' | 'levels' | 'rewards' | 'crates' | 'staff' | 'problems';
const logGroups: Record<Exclude<LogFilter, 'all'>, LvLogEntry['action'][]> = {
  levels: ['level-up'],
  rewards: ['reward-given', 'reward-removed'],
  crates: ['crate-dropped', 'crate-opened', 'crate-expired'],
  staff: ['xp-changed', 'reset'],
  problems: ['failed'],
};

function LVLog({ entries }: { entries: LvLogEntry[] }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const shown = entries.filter(
    (e) => filter === 'all' || logGroups[filter].includes(e.action),
  );
  return (
    <section className="sp-card" aria-labelledby="lv-log">
      <div className="sp-card__head sp-inv-log-head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="lv-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Level-ups, reward roles given and taken, crates, and staff changes
            to XP.
          </p>
        </div>
        <Segmented
          label="Show"
          className="sp-wrap-seg"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'levels', label: 'Levels' },
            { value: 'rewards', label: 'Rewards' },
            { value: 'crates', label: 'Crates' },
            { value: 'staff', label: 'Staff' },
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
              <span className="sp-greet-log__text">{lvLogLine(e)}</span>
              <span className="sp-greet-log__meta">
                {e.userId === '0' ? 'Everyone' : e.userId} · {when(e.at)}
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
          When members level up, crates drop and staff change XP, it shows here.
        </EmptyState>
      )}
    </section>
  );
}

// Commands --------------------------------------------------------------------

const commandTitles: Record<LvCommandKey, string> = {
  rank: 'Rank card',
  leaderboard: 'Leaderboard',
  xp: 'Change XP',
};
const commandOptions: Record<LvCommandKey, string> = {
  rank: '[member]',
  leaderboard: '[page]',
  xp: 'give, take, set or reset [member] [amount]',
};
const cleanName = (v: string) => v.toLowerCase().replace(/\s+/g, '-');

function LVCommands({
  config,
  onChange,
}: {
  config: Levels;
  onChange: (patch: Partial<Levels>) => void;
}) {
  const edit = (
    key: LvCommandKey,
    patch: Partial<Levels['commands']['rank']>,
  ) =>
    onChange({
      commands: {
        ...config.commands,
        [key]: { ...config.commands[key], ...patch },
      },
    });
  return (
    <section className="sp-card" aria-labelledby="lv-commands">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="lv-commands">
            Commands
          </h2>
          <p className="sp-card__sub">
            Rename them, change what Discord shows under them, or turn them off.
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        <ul className="sp-sg-commands">
          {lvCommandKeys.map((key) => {
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
                    {commandTitles[key]}
                    <InfoTip text={lvCommandAbout[key]} />
                  </span>
                  <Switch
                    checked={c.on}
                    onChange={(next) => edit(key, { on: next })}
                    description={`/${c.name} on or off`}
                  />
                </div>
                <div className="sp-ar__pair">
                  <Input
                    label="Name"
                    suffix="/"
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
                          hint: `/${c.name} ${commandOptions[key]}${lvStaffCommands.includes(key) ? '. Staff only.' : ''}`,
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
          Commands change in Discord a few seconds after you save. /
          {config.commands.xp.name} is for staff: Who can change XP in Settings,
          or Manage Server.
        </p>
      </div>
    </section>
  );
}
