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
  renderDiscordText,
  useToast,
  type RevealHover,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  commandName,
  planIssue,
  pollCommandAbout,
  pollCommandKeys,
  pollDefaultMessage,
  pollDefaultResults,
  pollLogLine,
  pollPresets,
  pollResultPresets,
  pollsIssue,
  studioIssue,
  usePollActions,
  usePolls,
  useStudio,
  useStudioActions,
  type Channel,
  type PollCommandKey,
  type PollLogEntry,
  type PollPreset,
  type Polls,
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
import { PollSettings } from './PollSettings';
import { PollsTab } from './PollsTab';

const MODULE = 'polls';

type Tab = 'settings' | 'polls' | 'edit' | 'logs' | 'commands';
const tabs: Tab[] = ['settings', 'polls', 'edit', 'logs', 'commands'];
const tabLabels: Record<Tab, string> = {
  settings: 'Settings',
  polls: 'Polls',
  edit: 'Edit',
  logs: 'Logs',
  commands: 'Commands',
};
const tabIcons: Record<Tab, { icon: string; anim: RevealHover | undefined }> = {
  settings: { icon: 'settings', anim: animIcons.settingOutline },
  polls: { icon: 'list-checks', anim: animIcons.storage },
  edit: { icon: 'square-pen', anim: animIcons.template },
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
  at === 'message' ||
  at === 'results' ||
  at.startsWith('embed') ||
  at === 'text'
    ? 'edit'
    : at.startsWith('command:')
      ? 'commands'
      : 'settings';

type Kind = 'poll' | 'results';
const kindKey = { poll: 'message', results: 'results' } as const;
const kindName = { poll: 'Poll message', results: 'Results message' };

/** A template's problems as a poll message, ignoring its channel. */
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

export function PollsModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const polls = usePolls(server.id);
  const studio = useStudio(server.id);
  const actions = usePollActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useTab();
  const [draft, setDraft] = useState<Polls | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  // Unsaved changes to the Studio templates that are the messages.
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

  const saved = polls.data?.config;
  const current = draft ?? saved;
  const savedOn = polls.data?.on ?? false;
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

  if (polls.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module} tabs={5}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (
    polls.isError ||
    studio.isError ||
    !polls.data ||
    !studio.data ||
    !current
  )
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Polls"
          actions={
            <Button
              onClick={() => {
                void polls.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = polls.data;
  const paused = !!server.paused;
  const channel = data.channels.find((c) => c.id === current.channel);
  const edit = (patch: Partial<Polls>) => {
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
  /** The saved message a poll is posted with, or that it ends as. */
  const savedTemplate = (kind: Kind) => {
    const id = (saved ?? current)[kindKey[kind]];
    return id ? (savedMessage(id) ?? null) : null;
  };

  const doSave = async () => {
    for (const [id, m] of changedMessages) {
      const found = messageProblem(m, server);
      if (found)
        return point(
          id === current.message
            ? 'message'
            : id === current.results
              ? 'results'
              : found.at,
          `Can’t save “${m.name}” yet`,
          found.problem,
        );
    }
    const found = pollsIssue(current, {
      templates: new Set(studioTemplates.map((t) => t.id)),
      roles: new Set(data.roles.map((r) => r.id)),
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

  /** Adds a Studio template for a message and uses it. */
  const startFrom = async (kind: Kind, m: StudioMessage, name: string) => {
    try {
      const { id } = await studioActions.saveTemplate.mutateAsync({
        name,
        message: { ...m, name, channel: current.channel },
        folderId: null,
      });
      edit({ [kindKey[kind]]: id });
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
              ? 'Polls can be made and voted on'
              : 'No new polls or votes',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel={channel ? `Live in #${channel.name}` : 'Polls are live'}
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>Polls are off. Turn them on above to edit them.</span>
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
            ...(value === 'polls' ? { count: data.open } : {}),
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
                  <PollSettings
                    config={current}
                    channels={data.channels}
                    roles={data.roles}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'polls' && (
                <PollsTab
                  server={server}
                  config={saved ?? current}
                  data={data}
                  pollMessage={savedTemplate('poll') ?? pollDefaultMessage()}
                  resultsMessage={
                    savedTemplate('results') ?? pollDefaultResults()
                  }
                />
              )}
              {tab === 'edit' && (
                <PollEdit
                  server={server}
                  config={current}
                  studio={studio.data}
                  channels={data.channels}
                  tried={tried}
                  dirty={dirty}
                  busy={studioActions.saveTemplate.isPending}
                  testing={actions.test.isPending}
                  messageOf={messageOf}
                  onChange={edit}
                  onMessage={editMessage}
                  onStart={(kind, m, name) => void startFrom(kind, m, name)}
                  onTest={(channelId, kind) =>
                    actions.test.mutate(
                      { channel: channelId, kind },
                      {
                        onSuccess: () =>
                          toast({
                            title: 'Test message sent',
                            body: `A made-up ${kind === 'poll' ? 'poll' : 'poll’s results'} was posted in #${data.channels.find((c) => c.id === channelId)?.name ?? 'the channel'}.`,
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
              {tab === 'logs' && (
                <PollLog entries={data.log} channels={data.channels} />
              )}
              {tab === 'commands' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Commands</legend>
                  <PollCommands config={current} onChange={edit} />
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

/** Sample options under the preview, as the poll's buttons. */
function OptionsPreview({ kind }: { kind: Kind }) {
  const ended = kind === 'results';
  const sample = [
    ['⛏️', 'Minecraft'],
    ['🚀', 'Among Us'],
    ['📦', 'Jackbox'],
  ];
  return (
    <div className="sp-rr-preview sp-pl-sample" aria-label="Poll options" inert>
      <div className="dc-components">
        <div className="dc-row">
          {sample.map(([emoji, label], i) => (
            <span
              key={label}
              className={cx(
                'dc-btn',
                ended && i === 0 && 'dc-btn--success',
                ended && 'is-disabled',
              )}
            >
              <span className="dc-emoji">{renderDiscordText(emoji!)}</span>
              {label}
            </span>
          ))}
        </div>
      </div>
      <p className="sp-hint">
        {ended
          ? 'Each poll’s options go here, greyed out, with the winner in green.'
          : 'Each poll’s options go here as buttons, or as a menu.'}
      </p>
    </div>
  );
}

/** Ready-made poll or results messages, shown as they look. */
function PresetPicker({
  open,
  kind,
  serverId,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  kind: Kind;
  serverId: string;
  busy: boolean;
  onClose: () => void;
  onPick: (p: PollPreset) => void;
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
      description={`Picking one adds it to your Message Studio templates and uses it for ${kind === 'poll' ? 'polls' : 'poll results'}.`}
    >
      <div className="sp-presets">
        {(kind === 'poll' ? pollPresets : pollResultPresets).map((p) => (
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

function PollEdit({
  server,
  config,
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
  config: Polls;
  studio: StudioState;
  channels: Channel[];
  tried: boolean;
  dirty: boolean;
  busy: boolean;
  testing: boolean;
  messageOf: (id: string) => StudioMessage | undefined;
  onChange: (patch: Partial<Polls>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onStart: (kind: Kind, m: StudioMessage, name: string) => void;
  onTest: (channel: string, kind: Kind) => void;
}) {
  const [kind, setKind] = useState<Kind>('poll');
  const [presets, setPresets] = useState(false);
  const [testChannel, setTestChannel] = useState(config.channel);
  const id = config[kindKey[kind]];
  const message = id ? messageOf(id) : undefined;
  const paused = !!server.paused;
  const picker = (
    <PresetPicker
      open={presets}
      kind={kind}
      serverId={server.id}
      busy={busy}
      onClose={() => setPresets(false)}
      onPick={(p) => {
        setPresets(false);
        onStart(kind, p.message, p.name);
      }}
    />
  );
  const switcher = (
    <Segmented<Kind>
      label="Which message"
      className="sp-pl-kind"
      value={kind}
      onChange={setKind}
      options={[
        { value: 'poll', label: 'Poll' },
        { value: 'results', label: 'Results' },
      ]}
    />
  );

  // Nothing picked yet: start from scratch or from a ready-made one.
  if (!message)
    return (
      <div className="sp-stack">
        {switcher}
        <section
          className="sp-card sp-greet-empty"
          aria-label="Live preview"
          data-issue={kindKey[kind]}
        >
          <EmptyState
            icon={<EditingIcon />}
            title={
              id
                ? `The ${kind === 'poll' ? 'poll' : 'results'} message template was deleted`
                : kind === 'poll'
                  ? 'How should polls look?'
                  : 'How should results look?'
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
                      kind,
                      kind === 'poll'
                        ? pollDefaultMessage()
                        : pollDefaultResults(),
                      kindName[kind],
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
            {kind === 'poll'
              ? 'Until you pick one, Sparko posts polls with its Poll card. Your message is a Message Studio template, edited right in the preview.'
              : 'When a poll ends, its message turns into this one, with the final bars and the winner. Until you pick one, Sparko uses its Results card.'}
          </EmptyState>
        </section>
        {picker}
      </div>
    );

  return (
    <div className="sp-stack">
      {switcher}
      <div className="sp-studio__grid">
        <fieldset className="sp-fieldset" disabled={paused}>
          <legend className="sp-sr-only">{kindName[kind]}</legend>
          <MessageCanvas
            key={id}
            server={server}
            message={message}
            tried={tried}
            headingId="pl-preview"
            pollVariables
            maxRows={4}
            rowsNote="A poll’s options take at least one row, so this holds 4 rows of buttons and menus."
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(id, patch)}
            above={
              <p className="sp-edit-banner" role="status">
                <Icon name="info" size="sm" />
                <span>
                  Editing <b>{message.name}</b> from Message Studio.{' '}
                  {kind === 'poll' ? (
                    <>
                      Write <code>{'{poll.options}'}</code> where the options
                      and their bars go; the buttons or menu are added under it.
                    </>
                  ) : (
                    <>
                      A poll turns into this when it ends.{' '}
                      <code>{'{poll.winner}'}</code> says who won, or that it’s
                      a tie.
                    </>
                  )}
                </span>
              </p>
            }
            below={<OptionsPreview kind={kind} />}
          />
        </fieldset>

        <section
          className="sp-card sp-studio__side"
          aria-labelledby="pl-message"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="pl-message">
                {kindName[kind]}
              </h2>
              <p className="sp-card__sub">
                Pick the template, send a test, or edit its JSON.
              </p>
            </div>
          </div>
          <div className="sp-card__body">
            <div data-issue={kindKey[kind]}>
              <Combobox
                label={
                  <>
                    Message template{' '}
                    <InfoTip
                      text={
                        kind === 'poll'
                          ? 'The Message Studio template every poll is posted with.'
                          : 'The Message Studio template a poll turns into when it ends.'
                      }
                    />
                  </>
                }
                searchPlaceholder="Search templates"
                value={id}
                onChange={(v) => onChange({ [kindKey[kind]]: v })}
                items={templateItems(studio)}
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
                onClick={() => onTest(testChannel, kind)}
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

const logIcon: Record<PollLogEntry['action'], string> = {
  created: 'list-checks',
  posted: 'send',
  ended: 'circle-pause',
  rerolled: 'refresh-cw',
  deleted: 'trash-2',
  failed: 'circle-x',
};

function PollLog({
  entries,
  channels,
}: {
  entries: PollLogEntry[];
  channels: Channel[];
}) {
  const [filter, setFilter] = useState<
    'all' | 'made' | 'ended' | 'deleted' | 'problems'
  >('all');
  const shown = entries.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'made'
        ? e.action === 'created' || e.action === 'posted'
        : filter === 'ended'
          ? e.action === 'ended' || e.action === 'rerolled'
          : filter === 'deleted'
            ? e.action === 'deleted'
            : e.action === 'failed',
  );
  return (
    <section className="sp-card" aria-labelledby="pl-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="pl-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every poll made, posted, ended (and why), rerolled or deleted, and
            any Sparko couldn’t post.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'made', label: 'Made' },
            { value: 'ended', label: 'Ended' },
            { value: 'deleted', label: 'Deleted' },
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
              <span className="sp-greet-log__text">
                {pollLogLine(e).replace(
                  /<#(\d+)>/g,
                  (_, id: string) =>
                    `#${channels.find((c) => c.id === id)?.name ?? 'deleted-channel'}`,
                )}
              </span>
              <span className="sp-greet-log__meta">
                {e.userId} · {when(e.at)}
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
          When polls are made, posted and ended, it shows here.
        </EmptyState>
      )}
    </section>
  );
}

// Commands --------------------------------------------------------------------

const commandTitles: Record<PollCommandKey, string> = {
  create: 'Make a poll',
  end: 'End a poll',
  results: 'See results',
  voters: 'See voters',
};
const commandOptions: Record<PollCommandKey, string> = {
  create: '[anonymous] [multiple] [channel]',
  end: '[id]',
  results: '[id]',
  voters: '[id]',
};
const nameOf = (text: string) => text.toLowerCase().replace(/\s+/g, '-');

function PollCommands({
  config,
  onChange,
}: {
  config: Polls;
  onChange: (patch: Partial<Polls>) => void;
}) {
  const c = config.commands;
  const group = (patch: Partial<Polls['commands']>) =>
    onChange({ commands: { ...c, ...patch } });
  const edit = (
    key: PollCommandKey,
    patch: Partial<Polls['commands']['subs'][PollCommandKey]>,
  ) => group({ subs: { ...c.subs, [key]: { ...c.subs[key], ...patch } } });
  const badGroup = !commandName.test(c.name);
  return (
    <section className="sp-card" aria-labelledby="pl-commands">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="pl-commands">
            Commands
          </h2>
          <p className="sp-card__sub">
            One slash command with a part for each job. Rename them, change what
            Discord shows under them, or turn parts off.
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        <div className="sp-sg-command" data-issue="command:group">
          <div className="sp-sg-command__head">
            <span className="sp-sg-command__title">
              <Icon name="terminal" size="sm" />
              The command
              <InfoTip text="The name members type first, like /poll. Every part below comes after it." />
            </span>
          </div>
          <div className="sp-ar__pair">
            <Input
              label="Name"
              suffix="/"
              maxLength={32}
              value={c.name}
              onChange={(e) => group({ name: nameOf(e.target.value) })}
              {...(badGroup
                ? { error: '1 to 32 lowercase letters, numbers, - or _.' }
                : { hint: `/${c.name} create, /${c.name} end and so on.` })}
            />
            <Input
              label="Description"
              maxLength={100}
              value={c.description}
              onChange={(e) => group({ description: e.target.value })}
              hint="Shown under the command in Discord."
            />
          </div>
        </div>
        <ul className="sp-sg-commands">
          {pollCommandKeys.map((key) => {
            const s = c.subs[key];
            const bad = !commandName.test(s.name);
            return (
              <li
                key={key}
                className={cx('sp-sg-command', !s.on && 'is-off')}
                data-issue={`command:${key}`}
              >
                <div className="sp-sg-command__head">
                  <span className="sp-sg-command__title">
                    <Icon name="terminal" size="sm" />
                    {commandTitles[key]}
                    <InfoTip text={pollCommandAbout[key]} />
                  </span>
                  <Switch
                    checked={s.on}
                    onChange={(on) => edit(key, { on })}
                    description={`/${c.name} ${s.name} on or off`}
                  />
                </div>
                <div className="sp-ar__pair">
                  <Input
                    label="Name"
                    suffix={`/${c.name}`}
                    maxLength={32}
                    value={s.name}
                    disabled={!s.on}
                    onChange={(e) =>
                      edit(key, { name: nameOf(e.target.value) })
                    }
                    {...(bad
                      ? {
                          error: '1 to 32 lowercase letters, numbers, - or _.',
                        }
                      : {
                          hint: `/${c.name} ${s.name} ${commandOptions[key]}`,
                        })}
                  />
                  <Input
                    label="Description"
                    maxLength={100}
                    value={s.description}
                    disabled={!s.on}
                    onChange={(e) => edit(key, { description: e.target.value })}
                    hint="Shown under the command in Discord."
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="sp-hint">
          Commands change in Discord a few seconds after you save. Who can make
          polls is set in Settings; staff and a poll’s maker can end it, and
          anyone can see results and voters (except on anonymous polls).
        </p>
      </div>
    </section>
  );
}
