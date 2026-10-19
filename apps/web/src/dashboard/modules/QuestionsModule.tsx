import { useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
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
  qaCategoryName,
  qaCommandAbout,
  qaCommandKeys,
  qaIssue,
  qaLogLine,
  qaMessageIssue,
  qaPresetsFor,
  qaShorten,
  qaStatuses,
  qaStatusOf,
  studioIssue,
  useQuestionActions,
  useQuestionList,
  useQuestions,
  useStudio,
  useStudioActions,
  type Channel,
  type QAState,
  type QaCommandKey,
  type QaLogEntry,
  type QaPreset,
  type QaQuestion,
  type Questions,
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
import { QASettings } from './QASettings';

const MODULE = 'questions';
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

type Which = 'question' | 'answer';

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
  ['message', 'answerMessage', 'dmMessage'].includes(at) ||
  at.startsWith('embed') ||
  at === 'text'
    ? 'edit'
    : at.startsWith('command')
      ? 'commands'
      : 'settings';

/** A message to write from scratch: the question or answer and little else. */
const ownMessage = (which: Which): StudioMessage => ({
  ...qaPresetsFor(which)[which === 'question' ? 1 : 0]!.message,
  name: which === 'question' ? 'Question message' : 'Answer message',
});

/** A template's problems as a question or answer message, ignoring its channel. */
const messageProblem = (m: StudioMessage, which: Which, server: Server) =>
  qaMessageIssue(m, which) ??
  studioIssue({ ...forChecks(m), channel: '1' }) ??
  planIssue(m, server.plan === 'plus' ? 'plus' : 'free');

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function QuestionsModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const qa = useQuestions(server.id);
  const studio = useStudio(server.id);
  const actions = useQuestionActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useTab();
  const [draft, setDraft] = useState<Questions | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  // Unsaved changes to the Studio templates that are the messages.
  const [messages, setMessages] = useState<Record<string, StudioMessage>>({});
  const [tried, setTried] = useState(false);
  const [issue, setIssue] = useState<ShownIssue | null>(null);
  const [which, setWhich] = useState<Which>('question');

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

  const saved = qa.data?.config;
  const current = draft ?? saved;
  const savedOn = qa.data?.on ?? false;
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

  if (qa.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module} tabs={5}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (qa.isError || studio.isError || !qa.data || !studio.data || !current)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Questions & answers"
          actions={
            <Button
              onClick={() => {
                void qa.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = qa.data;
  const paused = !!server.paused;
  const channel = data.channels.find((c) => c.id === current.channel);
  const edit = (patch: Partial<Questions>) => {
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
    if (at === 'message') setWhich('question');
    if (at === 'answerMessage') setWhich('answer');
    setIssue((i) => ({ at, n: (i?.n ?? 0) + 1 }));
    toast({ tone: 'danger', title, body: problem });
  };

  const doSave = async () => {
    for (const [id, m] of changedMessages) {
      const kind: Which = id === current.answerMessage ? 'answer' : 'question';
      const found = messageProblem(m, kind, server);
      if (found)
        return point(
          id === current.message
            ? 'message'
            : id === current.answerMessage
              ? 'answerMessage'
              : found.at,
          `Can’t save “${m.name}” yet`,
          found.problem,
        );
    }
    const found = qaIssue(current, {
      plan: server.plan,
      templates: new Set(studioTemplates.map((t) => t.id)),
      roles: new Map(data.roles.map((r) => [r.id, r.assignable !== false])),
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
  const startFrom = async (m: StudioMessage, name: string, kind: Which) => {
    try {
      const { id } = await studioActions.saveTemplate.mutateAsync({
        name,
        message: { ...m, name, channel: current.channel },
        folderId: null,
      });
      edit(kind === 'question' ? { message: id } : { answerMessage: id });
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
              ? 'Members can ask questions'
              : 'Nobody can ask',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel={channel ? `Live in #${channel.name}` : 'Questions are live'}
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>Questions & answers is off. Turn it on above to edit it.</span>
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
            ...(value === 'storage' ? { count: data.storage.count } : {}),
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
                  <QASettings
                    config={current}
                    serverId={server.id}
                    channels={data.channels}
                    roles={data.roles}
                    limits={data.limits}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'edit' && (
                <QAEdit
                  server={server}
                  config={current}
                  studio={studio.data}
                  channels={data.channels}
                  which={which}
                  onWhich={setWhich}
                  tried={tried}
                  dirty={dirty}
                  busy={studioActions.saveTemplate.isPending}
                  testing={actions.test.isPending}
                  messageOf={messageOf}
                  onChange={edit}
                  onMessage={editMessage}
                  onStart={(m, name, kind) => void startFrom(m, name, kind)}
                  onTest={(channelId, kind) =>
                    actions.test.mutate(
                      { channel: channelId, which: kind },
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
                <QAStorage
                  server={server}
                  config={current}
                  storage={data.storage}
                  paused={paused}
                />
              )}
              {tab === 'logs' && <QALog entries={data.log} />}
              {tab === 'commands' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Commands</legend>
                  <QACommands config={current} onChange={edit} />
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

/** The buttons Sparko adds under every question, as members see them. */
function FixedButtons({ config }: { config: Questions }) {
  return (
    <div className="sp-rr-preview" aria-label="Question buttons">
      <div className="sp-qa-fixed">
        <span className="dc-btn dc-btn--success">
          <span className="dc-emoji">✍️</span>Answer
        </span>
        <span className="dc-btn">
          <span className="dc-emoji">✅</span>Mark answered
        </span>
        {config.meToo && (
          <span className="dc-btn dc-btn--primary">
            <span className="dc-emoji">🙋</span>Me too · 4
          </span>
        )}
        <InfoTip text="Sparko adds these under every question. Answer is for staff; Mark answered is for the asker and staff. Once answered, Answer becomes Change answer and the rest go grey. Turn Me too on or off in Settings." />
      </div>
    </div>
  );
}

/** Ready-made question or answer messages, shown as they look. */
function PresetPicker({
  open,
  kind,
  serverId,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  kind: Which;
  serverId: string;
  busy: boolean;
  onClose: () => void;
  onPick: (p: QaPreset) => void;
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
      description={`Picking one adds it to your Message Studio templates and uses it for the ${kind} message.`}
    >
      <div className="sp-presets">
        {qaPresetsFor(kind).map((p) => (
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

function QAEdit({
  server,
  config,
  studio,
  channels,
  which,
  onWhich,
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
  config: Questions;
  studio: StudioState;
  channels: Channel[];
  which: Which;
  onWhich: (w: Which) => void;
  tried: boolean;
  dirty: boolean;
  busy: boolean;
  testing: boolean;
  messageOf: (id: string) => StudioMessage | undefined;
  onChange: (patch: Partial<Questions>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onStart: (m: StudioMessage, name: string, kind: Which) => void;
  onTest: (channel: string, kind: Which) => void;
}) {
  const [presets, setPresets] = useState(false);
  const [testChannel, setTestChannel] = useState(config.channel);
  const id = which === 'question' ? config.message : config.answerMessage;
  const message = id ? messageOf(id) : undefined;
  const paused = !!server.paused;
  const what = which === 'question' ? 'question' : 'answer';
  const templates = templateItems(studio);
  const picker = (
    <PresetPicker
      open={presets}
      kind={which}
      serverId={server.id}
      busy={busy}
      onClose={() => setPresets(false)}
      onPick={(p) => {
        setPresets(false);
        onStart(p.message, p.name, which);
      }}
    />
  );
  const switcher = (
    <Segmented<Which>
      label="Message to edit"
      value={which}
      onChange={onWhich}
      options={[
        { value: 'question', label: 'Question message' },
        { value: 'answer', label: 'Answer message' },
      ]}
    />
  );

  // Nothing picked yet: start from scratch or from a ready-made one.
  if (!message)
    return (
      <div className="sp-stack">
        <div className="sp-qa-switch">{switcher}</div>
        <section className="sp-card sp-greet-empty" aria-label="Live preview">
          <EmptyState
            icon={<EditingIcon />}
            title={
              id
                ? `The ${what} message template was deleted`
                : which === 'question'
                  ? 'How should questions look?'
                  : 'How should answers look?'
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
                      ownMessage(which),
                      which === 'question'
                        ? 'Question message'
                        : 'Answer message',
                      which,
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
            {which === 'question'
              ? 'Until you pick one, Sparko uses its Question card. Your message is a Message Studio template, edited right in the preview.'
              : 'Until you pick one, Sparko posts its Answer card in the thread. Your message is a Message Studio template, edited right in the preview.'}
          </EmptyState>
          {picker}
        </section>
      </div>
    );

  return (
    <div className="sp-stack">
      <div className="sp-qa-switch">{switcher}</div>
      <div className="sp-studio__grid">
        <fieldset className="sp-fieldset" disabled={paused}>
          <legend className="sp-sr-only">
            {which === 'question' ? 'Question message' : 'Answer message'}
          </legend>
          <MessageCanvas
            key={id}
            server={server}
            message={message}
            tried={tried}
            headingId="qa-preview"
            questionVariables
            locked
            maxRows={which === 'question' ? 4 : 5}
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(id, patch)}
            above={
              <p className="sp-edit-banner" role="status">
                <Icon name="info" size="sm" />
                <span>
                  Editing <b>{message.name}</b> from Message Studio. It holds
                  one embed or container without pictures; members’ files show
                  with <code>{'{files}'}</code>.{' '}
                  {which === 'question'
                    ? 'Once a question is answered, its colour changes to the status’s and the answer shows under it, unless you place {answer} yourself.'
                    : 'It’s posted in the question’s thread when staff answer.'}
                </span>
              </p>
            }
            below={
              which === 'question' ? (
                <FixedButtons config={config} />
              ) : undefined
            }
          />
        </fieldset>

        <section
          className="sp-card sp-studio__side"
          aria-labelledby="qa-message"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="qa-message">
                {which === 'question' ? 'Question message' : 'Answer message'}
              </h2>
              <p className="sp-card__sub">
                Pick the templates, send a test, or edit the JSON.
              </p>
            </div>
          </div>
          <div className="sp-card__body">
            <div
              data-issue={which === 'question' ? 'message' : 'answerMessage'}
            >
              <Combobox
                label={
                  <>
                    Message template{' '}
                    <InfoTip
                      text={
                        which === 'question'
                          ? 'The Message Studio template every question is posted with.'
                          : 'The Message Studio template answers are posted with, in the question’s thread.'
                      }
                    />
                  </>
                }
                searchPlaceholder="Search templates"
                value={id}
                onChange={(v) =>
                  onChange(
                    which === 'question'
                      ? { message: v }
                      : { answerMessage: v },
                  )
                }
                items={templates}
              />
            </div>
            <div data-issue="dmMessage">
              <Combobox
                label={
                  <>
                    DM when answered{' '}
                    <InfoTip
                      text={
                        config.dm
                          ? 'The direct message the asker gets once their question is answered. It can use the same variables, like {answer} and {thread}.'
                          : 'DMs are off. Turn on “DM the asker when it’s answered” in Settings to send it.'
                      }
                    />
                  </>
                }
                searchPlaceholder="Search templates"
                value={config.dmMessage || NONE}
                onChange={(v) => onChange({ dmMessage: v === NONE ? '' : v })}
                footer="Sparko’s template doesn’t use one of your templates."
                items={[
                  {
                    value: NONE,
                    label: 'Sparko’s template',
                    icon: 'sparkles',
                    group: 'Default',
                    note: 'Says the answer, who wrote it and links the thread',
                  },
                  ...templates,
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
                onClick={() => onTest(testChannel, which)}
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

// Storage ---------------------------------------------------------------------

const link = (guildId: string, q: QaQuestion) =>
  q.channelId && q.messageId
    ? `https://discord.com/channels/${guildId}/${q.channelId}/${q.messageId}`
    : q.threadId
      ? `https://discord.com/channels/${guildId}/${q.threadId}`
      : null;

function QAStorage({
  server,
  config,
  storage,
  paused,
}: {
  server: Server;
  config: Questions;
  storage: QAState['storage'];
  paused: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const list = useQuestionList(server.id, query, status);
  const actions = useQuestionActions(server.id);
  const toast = useToast();
  const [deleting, setDeleting] = useState<QaQuestion | null>(null);

  // Searches a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const shown = list.data?.storage ?? storage;
  const usedMb = shown.usedKb / 1024;
  const items = list.data?.questions ?? [];
  return (
    <section className="sp-card" aria-labelledby="qa-storage">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="qa-storage">
            Storage
          </h2>
          <p className="sp-card__sub">
            Every question asked, with its answer. Click one to open it in
            Discord.
          </p>
        </div>
      </div>
      <div className="sp-card__body sp-stack">
        <div className="sp-sg-usage">
          <div className="sp-field__row">
            <span className="sp-hint">
              {shown.count.toLocaleString('en-US')}{' '}
              {shown.count === 1 ? 'question' : 'questions'} ·{' '}
              {usedMb < 1
                ? `${shown.usedKb.toLocaleString('en-US')} KB`
                : `${usedMb.toFixed(1)} MB`}{' '}
              of {shown.limitMb} MB{' '}
              <InfoTip
                text={`Each question uses ${shown.perKb} KB of the server’s storage, so ${shown.limit.toLocaleString('en-US')} fit on this plan. Deleting one frees its space.`}
              />
            </span>
            <span className="sp-hint sp-tnum">{shown.perKb} KB each</span>
          </div>
          <div
            className="sp-progress sp-progress--sm"
            role="progressbar"
            aria-label="Question storage used"
            aria-valuenow={shown.count}
            aria-valuemin={0}
            aria-valuemax={shown.limit}
          >
            <span
              className={cx(
                'sp-progress__bar',
                shown.count >= shown.limit && 'is-over',
              )}
              style={{
                width: `${Math.min(100, (shown.count / Math.max(1, shown.limit)) * 100)}%`,
              }}
            />
          </div>
        </div>
        <div className="sp-sg-filters">
          <Input
            aria-label="Search questions"
            icon="search"
            placeholder="Search by #number, title, username or user ID"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <Combobox
            label={<span className="sp-sr-only">Status</span>}
            searchable={false}
            value={status || 'all'}
            onChange={(v) => setStatus(v === 'all' ? '' : v)}
            items={[
              { value: 'all', label: 'Every status' },
              ...qaStatuses.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        {list.isPending ? (
          <div className="sp-skel sp-skel--block" style={{ height: 160 }} />
        ) : items.length ? (
          <ul className="sp-sg-list">
            {items.map((q) => {
              const url = link(server.id, q);
              const st = qaStatusOf(q.status);
              const body = (
                <>
                  <span className="sp-sg-card__who">
                    <img
                      className="sp-sg-card__avatar"
                      src={q.askerAvatar || undefined}
                      alt=""
                    />
                    <span className="sp-sg-card__name">{q.askerName}</span>
                    <span className="sp-hint">{q.askerId}</span>
                    {config.anonymous && (
                      <Badge size="sm">Anonymous in Discord</Badge>
                    )}
                  </span>
                  <span className="sp-sg-card__title">
                    <span className="sp-hint sp-tnum">#{q.number}</span>{' '}
                    {q.title}
                  </span>
                  {q.body && (
                    <span className="sp-qa-card__body">
                      {qaShorten(q.body, 200)}
                    </span>
                  )}
                  <span className="sp-sg-card__meta">
                    <Badge
                      size="sm"
                      className="sp-sg-badge"
                      style={{ '--sg-status': st.color } as CSSProperties}
                    >
                      {st.name}
                    </Badge>
                    <span className="sp-hint">
                      {qaCategoryName(config, q.category)}
                    </span>
                    {q.meToo > 0 && (
                      <span className="sp-hint">🙋 {q.meToo}</span>
                    )}
                    <span className="sp-hint">Asked {when(q.createdAt)}</span>
                    {q.answeredAt !== null && (
                      <span className="sp-hint">
                        {q.answer ? 'Answered' : 'Closed'} {when(q.answeredAt)}
                      </span>
                    )}
                    {q.threadClosed && q.threadId && (
                      <span className="sp-hint">
                        <Icon name="lock" size="sm" /> Thread closed
                      </span>
                    )}
                  </span>
                  {q.answer ? (
                    <span className="sp-sg-card__reason">
                      <span>{qaShorten(q.answer.text, 240)}</span>
                      <span className="sp-hint">
                        — {q.answer.byName} ({q.answer.byId})
                      </span>
                    </span>
                  ) : q.closedBy ? (
                    <span className="sp-sg-card__reason">
                      <span className="sp-hint">
                        Marked answered by {q.closedBy.name} without an answer
                      </span>
                    </span>
                  ) : null}
                </>
              );
              return (
                <li
                  key={q.number}
                  className="sp-card sp-sg-card"
                  style={{ '--sg-ratio': st.color } as CSSProperties}
                >
                  {url ? (
                    <a
                      className="sp-sg-card__open"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open question #${q.number} in Discord`}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="sp-sg-card__open">{body}</div>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="trash-2"
                    disabled={paused}
                    aria-label={`Delete question #${q.number}`}
                    onClick={() => setDeleting(q)}
                  >
                    Delete
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="circle-help" title="No questions here">
            {query.trim() || status
              ? 'Nothing matches. Try another search or status.'
              : `Members ask with /${config.command.name} ${config.commands.ask.name}. Their questions show here.`}
          </EmptyState>
        )}
      </div>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        icon="trash-2"
        title={`Delete question #${deleting?.number ?? ''}?`}
        description="Its message and thread are taken out of Discord, and its data is removed. This can’t be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actions.remove.isPending}
              onClick={() =>
                deleting &&
                actions.remove.mutate(deleting.number, {
                  onSuccess: () => {
                    toast({ title: `Deleted question #${deleting.number}` });
                    setDeleting(null);
                    void list.refetch();
                  },
                  onError: (e) =>
                    toast({
                      tone: 'danger',
                      title: 'Couldn’t delete it',
                      body: e.message,
                    }),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </section>
  );
}

// Logs ------------------------------------------------------------------------

const logIcon: Record<QaLogEntry['action'], string> = {
  asked: 'circle-help',
  answered: 'circle-check',
  reanswered: 'refresh-cw',
  marked: 'check',
  closed: 'lock',
  reopened: 'rotate-ccw',
  expired: 'clock',
  deleted: 'trash-2',
  refused: 'ban',
  failed: 'circle-x',
};

type LogFilter =
  | 'all'
  | 'asked'
  | 'answers'
  | 'closing'
  | 'deleted'
  | 'problems';
const logGroups: Record<Exclude<LogFilter, 'all'>, QaLogEntry['action'][]> = {
  asked: ['asked'],
  answers: ['answered', 'reanswered', 'marked'],
  closing: ['closed', 'reopened', 'expired'],
  deleted: ['deleted'],
  problems: ['refused', 'failed'],
};

function QALog({ entries }: { entries: QaLogEntry[] }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const shown = entries.filter(
    (e) => filter === 'all' || logGroups[filter].includes(e.action),
  );
  return (
    <section className="sp-card sp-qa-log" aria-labelledby="qa-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="qa-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every question asked, answered, closed, reopened, expired or
            deleted, and every one Sparko turned away.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'asked', label: 'Asked' },
            { value: 'answers', label: 'Answers' },
            { value: 'closing', label: 'Closing' },
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
                (e.action === 'failed' || e.action === 'refused') &&
                  'is-failed',
              )}
            >
              <Icon
                name={logIcon[e.action]}
                size="sm"
                className="sp-greet-log__icon"
              />
              <span className="sp-greet-log__text">{qaLogLine(e)}</span>
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
          When members ask and staff answer, it shows here.
        </EmptyState>
      )}
    </section>
  );
}

// Commands --------------------------------------------------------------------

const commandTitles: Record<QaCommandKey, string> = {
  ask: 'Ask',
  answer: 'Answer',
  close: 'Close',
  reopen: 'Reopen',
  delete: 'Delete',
};
const commandOptions: Record<QaCommandKey, string> = {
  ask: '[category] [file] [file2] [file3]',
  answer: '[id] [text]',
  close: '[id]',
  reopen: '[id]',
  delete: '[id]',
};

function QACommands({
  config,
  onChange,
}: {
  config: Questions;
  onChange: (patch: Partial<Questions>) => void;
}) {
  const edit = (
    key: QaCommandKey,
    patch: Partial<Questions['commands'][QaCommandKey]>,
  ) =>
    onChange({
      commands: {
        ...config.commands,
        [key]: { ...config.commands[key], ...patch },
      },
    });
  const group = config.command;
  const badGroup = !commandName.test(group.name);
  const typed = (v: string) => v.toLowerCase().replace(/\s+/g, '-');
  return (
    <section className="sp-card" aria-labelledby="qa-commands">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="qa-commands">
            Commands
          </h2>
          <p className="sp-card__sub">
            One slash command with a part for each job. Rename them, change what
            Discord shows under them, or turn parts off.
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        <div className="sp-sg-command sp-qa-group" data-issue="command">
          <div className="sp-sg-command__head">
            <span className="sp-sg-command__title">
              <Icon name="terminal" size="sm" />
              The command
              <InfoTip text="Members and staff type this first, then the part, like /question ask. Turning every part off removes the command." />
            </span>
          </div>
          <div className="sp-ar__pair">
            <Input
              label="Name"
              suffix="/"
              maxLength={32}
              value={group.name}
              onChange={(e) =>
                onChange({ command: { ...group, name: typed(e.target.value) } })
              }
              {...(badGroup
                ? { error: '1 to 32 lowercase letters, numbers, - or _.' }
                : { hint: `/${group.name} followed by a part below` })}
            />
            <Input
              label="Description"
              maxLength={100}
              value={group.description}
              onChange={(e) =>
                onChange({
                  command: { ...group, description: e.target.value },
                })
              }
              hint="Shown under the command in Discord."
            />
          </div>
        </div>
        <ul className="sp-sg-commands">
          {qaCommandKeys.map((key) => {
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
                    <InfoTip text={qaCommandAbout[key]} />
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
                    onChange={(e) => edit(key, { name: typed(e.target.value) })}
                    {...(bad
                      ? {
                          error: '1 to 32 lowercase letters, numbers, - or _.',
                        }
                      : {
                          hint: `/${group.name} ${c.name} ${commandOptions[key]}`,
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
          Commands change in Discord a few seconds after you save. Who can use
          each one is set in Settings: Who can ask, and Who can answer for the
          rest.
        </p>
      </div>
    </section>
  );
}
