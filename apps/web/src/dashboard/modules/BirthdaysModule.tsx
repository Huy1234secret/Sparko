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
  bdCommandAbout,
  bdCommandKeys,
  bdIssue,
  bdKindAbout,
  bdKindNames,
  bdKinds,
  bdLogLine,
  bdPresets,
  commandName,
  planIssue,
  studioIssue,
  useBirthdayActions,
  useBirthdays,
  useStudio,
  useStudioActions,
  type BdCommandKey,
  type BdKind,
  type BdLogEntry,
  type BdPreset,
  type Birthdays,
  type Channel,
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
import { BDSettings, BDStorage } from './BDSettings';

const MODULE = 'birthdays';
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

/** A template's problems as a birthday message, ignoring its channel. */
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

export function BirthdaysModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const bd = useBirthdays(server.id);
  const studio = useStudio(server.id);
  const actions = useBirthdayActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useTab();
  const [kind, setKind] = useState<BdKind>('single');
  const [draft, setDraft] = useState<Birthdays | null>(null);
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

  const saved = bd.data?.config;
  const current = draft ?? saved;
  const savedOn = bd.data?.on ?? false;
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

  if (bd.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module} tabs={5}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (bd.isError || studio.isError || !bd.data || !studio.data || !current)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Birthdays"
          actions={
            <Button
              onClick={() => {
                void bd.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = bd.data;
  const paused = !!server.paused;
  const channel = data.channels.find((c) => c.id === current.channel);
  const edit = (patch: Partial<Birthdays>) => {
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
        const k = bdKinds.find((x) => current.messages[x] === id);
        if (k) setKind(k);
        return point(
          k ? 'message' : found.at,
          `Can’t save “${m.name}” yet`,
          found.problem,
        );
      }
    }
    const found = bdIssue(current, {
      templates: new Set(studioTemplates.map((t) => t.id)),
      roles: new Map(data.roles.map((r) => [r.id, r.assignable !== false])),
    });
    if (found) {
      const k = found.at.startsWith('message:')
        ? (found.at.slice(8) as BdKind)
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
  const startFrom = async (k: BdKind, m: StudioMessage, name: string) => {
    try {
      const { id } = await studioActions.saveTemplate.mutateAsync({
        name,
        message: { ...m, name, channel: current.channel },
        folderId: null,
      });
      edit({ messages: { ...current.messages, [k]: id } });
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
              ? 'Sparko celebrates members’ birthdays'
              : 'No birthdays are celebrated',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel={channel ? `Live in #${channel.name}` : 'Birthdays are live'}
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>Birthdays are off. Turn them on above to edit them.</span>
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
                  <BDSettings
                    config={current}
                    channels={data.channels}
                    roles={data.roles}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'edit' && (
                <BDEdit
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
                            body: `A made-up birthday was posted in #${data.channels.find((c) => c.id === channelId)?.name ?? 'the channel'}.`,
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
                <BDStorage
                  server={server}
                  config={current}
                  count={data.count}
                  paused={paused}
                />
              )}
              {tab === 'logs' && <BDLog entries={data.log} />}
              {tab === 'commands' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Commands</legend>
                  <BDCommands config={current} onChange={edit} />
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
  kind: BdKind;
  serverId: string;
  busy: boolean;
  onClose: () => void;
  onPick: (p: BdPreset) => void;
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
      description={`Picking one adds it to your Message Studio templates and uses it for the ${bdKindNames[kind].toLowerCase()} message.`}
    >
      <div className="sp-presets">
        {bdPresets
          .filter((p) => p.kind === kind)
          .map((p) => (
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

/** Why a message won't be sent with the settings as they are. */
const unusedNote = (c: Birthdays, kind: BdKind) =>
  kind === 'dm' && !c.dm
    ? 'Birthday DMs are off, so this isn’t sent. Turn on “Send a birthday DM” in Settings.'
    : kind === 'monthly' && !c.monthly
      ? 'The monthly post is off, so this isn’t sent. Turn on “Birthdays this month” in Settings.'
      : kind === 'multiple' && c.style === 'each'
        ? 'Settings post one message each, so this isn’t sent. Pick “One post for everyone” to use it.'
        : null;

function BDEdit({
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
  config: Birthdays;
  kind: BdKind;
  onKind: (k: BdKind) => void;
  studio: StudioState;
  channels: Channel[];
  tried: boolean;
  dirty: boolean;
  busy: boolean;
  testing: boolean;
  messageOf: (id: string) => StudioMessage | undefined;
  onChange: (patch: Partial<Birthdays>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onStart: (m: StudioMessage, name: string) => void;
  onTest: (channel: string) => void;
}) {
  const [presets, setPresets] = useState(false);
  const [testChannel, setTestChannel] = useState(config.channel);
  const id = config.messages[kind];
  const message = id ? messageOf(id) : undefined;
  const paused = !!server.paused;
  const note = unusedNote(config, kind);
  const sparko = bdPresets.find((p) => p.kind === kind)!;
  const pick = (v: string) =>
    onChange({
      messages: { ...config.messages, [kind]: v === NONE ? '' : v },
    });
  const own = (): StudioMessage => ({
    ...sparko.message,
    name: `${bdKindNames[kind]} message`,
  });

  const kinds = (
    <Segmented<BdKind>
      label="Message"
      className="sp-bd-kinds"
      value={kind}
      onChange={onKind}
      options={bdKinds.map((k) => ({ value: k, label: bdKindNames[k] }))}
    />
  );
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
        onStart(p.message, p.name);
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
                ? `The ${bdKindNames[kind].toLowerCase()} template was deleted`
                : `How should the ${bdKindNames[kind].toLowerCase()} message look?`
            }
            actions={
              <div className="sp-greet-start">
                <AnimatedIconButton
                  reveal={plusAnimations.reveal}
                  hover={plusAnimations.hover}
                  select={plusAnimations.select}
                  disabled={paused}
                  loading={busy}
                  onClick={() => onStart(own(), `${bdKindNames[kind]} message`)}
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
            {bdKindAbout[kind]} Until you pick one, Sparko uses its{' '}
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
          <legend className="sp-sr-only">{bdKindNames[kind]} message</legend>
          <MessageCanvas
            key={id}
            server={server}
            message={message}
            tried={tried}
            headingId="bd-preview"
            birthdayVariables
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(id, patch)}
            above={
              <p className="sp-edit-banner" role="status">
                <Icon name="info" size="sm" />
                <span>
                  Editing <b>{message.name}</b> from Message Studio.{' '}
                  {bdKindAbout[kind]} Use{' '}
                  {kind === 'monthly' ? (
                    <>
                      <code>{'{month}'}</code> and{' '}
                      <code>{'{birthday.list}'}</code>
                    </>
                  ) : (
                    <>
                      <code>{'{birthday.users}'}</code> to mention who it’s for
                    </>
                  )}
                  .
                </span>
              </p>
            }
          />
        </fieldset>

        <section
          className="sp-card sp-studio__side"
          aria-labelledby="bd-message"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="bd-message">
                {bdKindNames[kind]} message
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
                    Message template <InfoTip text={bdKindAbout[kind]} />
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

const logIcon: Record<BdLogEntry['action'], string> = {
  set: 'gift',
  changed: 'pencil',
  removed: 'trash-2',
  celebrated: 'party-popper',
  'role-given': 'at-sign',
  'role-removed': 'rotate-ccw',
  monthly: 'calendar',
  failed: 'circle-x',
};

function BDLog({ entries }: { entries: BdLogEntry[] }) {
  const [filter, setFilter] = useState<
    'all' | 'saved' | 'celebrated' | 'problems'
  >('all');
  const shown = entries.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'saved'
        ? ['set', 'changed', 'removed'].includes(e.action)
        : filter === 'celebrated'
          ? ['celebrated', 'role-given', 'role-removed', 'monthly'].includes(
              e.action,
            )
          : e.action === 'failed',
  );
  return (
    <section className="sp-card" aria-labelledby="bd-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="bd-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every birthday saved, changed or removed, every celebration and
            birthday role, and the monthly posts.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'saved', label: 'Saved' },
            { value: 'celebrated', label: 'Celebrated' },
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
              <span className="sp-greet-log__text">{bdLogLine(e)}</span>
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
          When members save birthdays and Sparko celebrates them, it shows here.
        </EmptyState>
      )}
    </section>
  );
}

// Commands --------------------------------------------------------------------

const commandTitles: Record<BdCommandKey, string> = {
  set: 'Save a birthday',
  remove: 'Remove a birthday',
  view: 'See a birthday',
  upcoming: 'Upcoming birthdays',
  list: 'Birthdays in a month',
};
const commandOptions: Record<BdCommandKey, string> = {
  set: '[day] [month] [year] [timezone] [member]',
  remove: '[member]',
  view: '[member]',
  upcoming: '',
  list: '[month]',
};
const cleanName = (v: string) => v.toLowerCase().replace(/\s+/g, '-');

function BDCommands({
  config,
  onChange,
}: {
  config: Birthdays;
  onChange: (patch: Partial<Birthdays>) => void;
}) {
  const group = config.commands.group;
  const edit = (
    key: BdCommandKey,
    patch: Partial<Birthdays['commands']['set']>,
  ) =>
    onChange({
      commands: {
        ...config.commands,
        [key]: { ...config.commands[key], ...patch },
      },
    });
  const badGroup = !commandName.test(group.name);
  return (
    <section className="sp-card" aria-labelledby="bd-commands">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="bd-commands">
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
              <InfoTip text="Members type this, then one of the commands below, like /birthday set. Turning every one off removes it." />
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
                : { hint: `/${group.name} set, /${group.name} view and more` })}
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
          {bdCommandKeys.map((key) => {
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
                    <InfoTip text={bdCommandAbout[key]} />
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
          Commands change in Discord a few seconds after you save. Members can
          only set or remove their own birthday; staff from Who can manage
          birthdays in Settings can pick a member.
        </p>
      </div>
    </section>
  );
}
