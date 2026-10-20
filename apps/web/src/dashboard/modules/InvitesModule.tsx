import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Combobox,
  EmptyState,
  Icon,
  Input,
  Modal,
  Notice,
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
  invCommandAbout,
  invCommandKeys,
  invIssue,
  invKindAbout,
  invKindNames,
  invKinds,
  invLogLine,
  invPresets,
  invStaffCommands,
  planIssue,
  studioIssue,
  useInviteActions,
  useInvites,
  useStudio,
  useStudioActions,
  type Channel,
  type InvCommandKey,
  type InvKind,
  type InvLogEntry,
  type InvPreset,
  type Invites,
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
import { INVSettings, INVStorage } from './INVSettings';

const MODULE = 'invites';
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

/** A template's problems as a join or leave message, ignoring its channel. */
const messageProblem = (m: StudioMessage, server: Server) =>
  studioIssue({ ...forChecks(m), channel: '1' }) ??
  planIssue(m, server.plan === 'plus' ? 'plus' : 'free');

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function InvitesModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const inv = useInvites(server.id);
  const studio = useStudio(server.id);
  const actions = useInviteActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useTab();
  const [kind, setKind] = useState<InvKind>('join');
  const [draft, setDraft] = useState<Invites | null>(null);
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

  const saved = inv.data?.config;
  const current = draft ?? saved;
  const savedOn = inv.data?.on ?? false;
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

  if (inv.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module} tabs={5}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (inv.isError || studio.isError || !inv.data || !studio.data || !current)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Invite tracking"
          actions={
            <Button
              onClick={() => {
                void inv.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = inv.data;
  const paused = !!server.paused;
  const edit = (patch: Partial<Invites>) => {
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
      const found = messageProblem(m, server);
      if (found) {
        const k = invKinds.find((x) => current[x].template === id);
        if (k) setKind(k);
        return point(
          k ? 'message' : found.at,
          `Can’t save “${m.name}” yet`,
          found.problem,
        );
      }
    }
    const found = invIssue(current, {
      plan: server.plan,
      templates: new Set(studioTemplates.map((t) => t.id)),
      roles: new Map(data.roles.map((r) => [r.id, r.assignable !== false])),
    });
    if (found) {
      const k = found.at.startsWith('message:')
        ? (found.at.slice(8) as InvKind)
        : null;
      if (k) setKind(k);
      return point(found.at, 'Can’t save yet', found.problem);
    }
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
  const startFrom = async (k: InvKind, m: StudioMessage, name: string) => {
    try {
      const { id } = await studioActions.saveTemplate.mutateAsync({
        name,
        message: { ...m, name, channel: current[k].channel },
        folderId: null,
      });
      edit({ [k]: { ...current[k], template: id } });
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
              ? 'Sparko counts who invited whom'
              : 'No invites are tracked',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel="Invite tracking is live"
        error={flow.error}
      />
      {isOn && !data.canSeeInvites && (
        <Notice tone="warning" title="Sparko can’t see your invites">
          Give Sparko’s role the Manage Server permission in Server Settings →
          Roles. Without it, Sparko can’t tell which invite each member used, so
          joins show as unknown.
        </Notice>
      )}
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>Invite tracking is off. Turn it on above to edit it.</span>
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
            ...(value === 'storage' ? { count: data.count } : {}),
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
                  <INVSettings
                    config={current}
                    channels={data.channels}
                    roles={data.roles}
                    limits={data.limits}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'edit' && (
                <INVEdit
                  server={server}
                  config={current}
                  kind={kind}
                  onKind={setKind}
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
                            body: `A made-up ${kind} was posted in #${data.channels.find((c) => c.id === channelId)?.name ?? 'the channel'}.`,
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
              )}
              {tab === 'storage' && (
                <INVStorage
                  server={server}
                  channels={data.channels}
                  count={data.count}
                  paused={paused}
                />
              )}
              {tab === 'logs' && <INVLog entries={data.log} />}
              {tab === 'commands' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Commands</legend>
                  <INVCommands config={current} onChange={edit} />
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
  kind: InvKind;
  serverId: string;
  busy: boolean;
  onClose: () => void;
  onPick: (p: InvPreset) => void;
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
      description={`Picking one adds it to your Message Studio templates and uses it for the ${invKindNames[kind].toLowerCase()} message.`}
    >
      <div className="sp-presets">
        {invPresets
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

function INVEdit({
  server,
  config,
  kind,
  onKind,
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
  config: Invites;
  kind: InvKind;
  onKind: (k: InvKind) => void;
  studio: StudioState;
  channels: Channel[];
  tried: boolean;
  dirty: boolean;
  busy: boolean;
  testing: boolean;
  messageOf: (id: string) => StudioMessage | undefined;
  onChange: (patch: Partial<Invites>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onStart: (m: StudioMessage, name: string) => void;
  onTest: (channel: string) => void;
}) {
  const [presets, setPresets] = useState(false);
  const [testChannel, setTestChannel] = useState(config[kind].channel);
  const id = config[kind].template;
  const message = id ? messageOf(id) : undefined;
  const paused = !!server.paused;
  const name = invKindNames[kind].toLowerCase();
  const sparko = invPresets.find((p) => p.kind === kind)!;
  const pick = (v: string) =>
    onChange({ [kind]: { ...config[kind], template: v === NONE ? '' : v } });
  const own = (): StudioMessage => ({
    ...sparko.message,
    name: `Invite ${name} message`,
  });

  const kinds = (
    <Segmented<InvKind>
      label="Message"
      value={kind}
      onChange={onKind}
      options={invKinds.map((k) => ({ value: k, label: invKindNames[k] }))}
    />
  );
  const banner = !config[kind].on && (
    <p className="sp-edit-banner" role="note">
      <Icon name="info" size="sm" />
      <span>
        The {name} message is off, so this isn’t sent. Turn it on in Settings.
      </span>
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
        onStart(
          p.message,
          p.name === 'One line' ? `Invite ${name} line` : p.name,
        );
      }}
    />
  );

  // Nothing picked yet: Sparko's own until they start one.
  if (!message)
    return (
      <div className="sp-stack">
        {kinds}
        {banner}
        <section className="sp-card sp-greet-empty" aria-label="Live preview">
          <EmptyState
            icon={<EditingIcon />}
            title={
              id
                ? `The ${name} message template was deleted`
                : `How should the ${name} message look?`
            }
            actions={
              <div className="sp-greet-start">
                <AnimatedIconButton
                  reveal={plusAnimations.reveal}
                  hover={plusAnimations.hover}
                  select={plusAnimations.select}
                  disabled={paused}
                  loading={busy}
                  onClick={() => onStart(own(), `Invite ${name} message`)}
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
            {invKindAbout[kind]} Until you pick one, Sparko uses its{' '}
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
      </div>
    );

  return (
    <div className="sp-stack">
      {kinds}
      {banner}
      <div className="sp-studio__grid">
        <fieldset className="sp-fieldset" disabled={paused}>
          <legend className="sp-sr-only">{invKindNames[kind]} message</legend>
          <MessageCanvas
            key={id}
            server={server}
            message={message}
            tried={tried}
            headingId="inv-preview"
            inviteVariables
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(id, patch)}
            above={
              <p className="sp-edit-banner" role="status">
                <Icon name="info" size="sm" />
                <span>
                  Editing <b>{message.name}</b> from Message Studio.{' '}
                  {invKindAbout[kind]} Use <code>{'{inviter}'}</code> and{' '}
                  <code>{'{inviter.invites}'}</code> to say who invited them.
                </span>
              </p>
            }
          />
        </fieldset>

        <section
          className="sp-card sp-studio__side"
          aria-labelledby="inv-message"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="inv-message">
                {invKindNames[kind]} message
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
                    Message template <InfoTip text={invKindAbout[kind]} />
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
      {picker}
    </div>
  );
}

// Logs ------------------------------------------------------------------------

const logIcon: Record<InvLogEntry['action'], string> = {
  joined: 'user-plus',
  left: 'user-x',
  'reward-given': 'award',
  'reward-removed': 'rotate-ccw',
  bonus: 'plus',
  reset: 'refresh-cw',
  failed: 'circle-x',
};
type LogFilter = 'all' | 'members' | 'rewards' | 'staff' | 'problems';
const logGroups: Record<Exclude<LogFilter, 'all'>, InvLogEntry['action'][]> = {
  members: ['joined', 'left'],
  rewards: ['reward-given', 'reward-removed'],
  staff: ['bonus', 'reset'],
  problems: ['failed'],
};

function INVLog({ entries }: { entries: InvLogEntry[] }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const shown = entries.filter(
    (e) => filter === 'all' || logGroups[filter].includes(e.action),
  );
  return (
    <section className="sp-card" aria-labelledby="inv-log">
      <div className="sp-card__head sp-inv-log-head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="inv-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every join with its invite, every leave, reward roles given and
            taken, and staff bonuses and resets.
          </p>
        </div>
        <Segmented
          label="Show"
          className="sp-wrap-seg"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'members', label: 'Joins' },
            { value: 'rewards', label: 'Rewards' },
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
              <span className="sp-greet-log__text">{invLogLine(e)}</span>
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
          When members join and leave, and rewards and bonuses change, it shows
          here.
        </EmptyState>
      )}
    </section>
  );
}

// Commands --------------------------------------------------------------------

const commandTitles: Record<InvCommandKey, string> = {
  view: 'See invites',
  leaderboard: 'Leaderboard',
  who: 'Who invited them',
  list: 'Members they invited',
  bonus: 'Bonus invites',
  reset: 'Reset invites',
};
const commandOptions: Record<InvCommandKey, string> = {
  view: '[member]',
  leaderboard: '[page]',
  who: '[member]',
  list: '[member]',
  bonus: '[member] [amount]',
  reset: '[member] [everyone]',
};
const cleanName = (v: string) => v.toLowerCase().replace(/\s+/g, '-');

function INVCommands({
  config,
  onChange,
}: {
  config: Invites;
  onChange: (patch: Partial<Invites>) => void;
}) {
  const group = config.commands.group;
  const edit = (
    key: InvCommandKey,
    patch: Partial<Invites['commands']['view']>,
  ) =>
    onChange({
      commands: {
        ...config.commands,
        [key]: { ...config.commands[key], ...patch },
      },
    });
  const badGroup = !commandName.test(group.name);
  return (
    <section className="sp-card" aria-labelledby="inv-commands">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="inv-commands">
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
              <InfoTip text="Members type this, then one of the commands below, like /invites leaderboard. Turning every one off removes it." />
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
                    hint: `/${group.name} view, /${group.name} leaderboard and more`,
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
          {invCommandKeys.map((key) => {
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
                    <InfoTip text={invCommandAbout[key]} />
                  </span>
                  <Switch
                    checked={c.on}
                    onChange={(next) => edit(key, { on: next })}
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
                          hint: `/${group.name} ${c.name} ${commandOptions[key]}${invStaffCommands.includes(key) ? '. Staff only.' : ''}`,
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
          Commands change in Discord a few seconds after you save. Bonus and
          reset are for staff: Who can manage invites in Settings, or Manage
          Server.
        </p>
      </div>
    </section>
  );
}
