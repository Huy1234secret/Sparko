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
  renderDiscordText,
  useToast,
  type RevealHover,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  commandName,
  planIssue,
  sgCommandAbout,
  sgCommandKeys,
  sgIssue,
  sgLogLine,
  sgMessageIssue,
  sgPresets,
  sgRatioColour,
  sgStatusName,
  studioIssue,
  useStudio,
  useStudioActions,
  useSuggestionActions,
  useSuggestionList,
  useSuggestions,
  voteRatio,
  type Channel,
  type SGState,
  type Server,
  type SgCommandKey,
  type SgLogEntry,
  type SgPreset,
  type SgSuggestion,
  type StudioMessage,
  type StudioState,
  type Suggestions,
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
import { SGSettings, VoteCard, templateItems } from './SGSettings';

const MODULE = 'suggestions';

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
  storage: { icon: 'layers', anim: undefined },
  logs: { icon: 'scroll-text', anim: animIcons.log },
  commands: { icon: 'terminal', anim: undefined },
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
  at === 'message' || at.startsWith('embed') || at === 'text'
    ? 'edit'
    : at.startsWith('command:')
      ? 'commands'
      : 'settings';

/** A message to write from scratch: the suggestion and little else. */
const ownMessage = (): StudioMessage => ({
  ...sgPresets[1]!.message,
  name: 'Suggestion message',
});

/** A template's problems as a suggestion message, ignoring its channel. */
const messageProblem = (m: StudioMessage, server: Server) =>
  sgMessageIssue(m) ??
  studioIssue({ ...forChecks(m), channel: '1' }) ??
  planIssue(m, server.plan === 'plus' ? 'plus' : 'free');

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function SuggestionsModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const sg = useSuggestions(server.id);
  const studio = useStudio(server.id);
  const actions = useSuggestionActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useTab();
  const [draft, setDraft] = useState<Suggestions | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  // Unsaved changes to the Studio template that is the message.
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

  const saved = sg.data?.config;
  const current = draft ?? saved;
  const savedOn = sg.data?.on ?? false;
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

  if (sg.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module} tabs={5}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (sg.isError || studio.isError || !sg.data || !studio.data || !current)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Suggestions"
          actions={
            <Button
              onClick={() => {
                void sg.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = sg.data;
  const paused = !!server.paused;
  const channel = data.channels.find((c) => c.id === current.channel);
  const edit = (patch: Partial<Suggestions>) => {
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
      if (found)
        return point(
          id === current.message ? 'message' : found.at,
          `Can’t save “${m.name}” yet`,
          found.problem,
        );
    }
    const found = sgIssue(current, {
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

  /** Adds a Studio template for the message and uses it. */
  const startFrom = async (m: StudioMessage, name: string) => {
    try {
      const { id } = await studioActions.saveTemplate.mutateAsync({
        name,
        message: { ...m, name, channel: current.channel },
        folderId: null,
      });
      edit({ message: id });
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
              ? 'Members can suggest and vote'
              : 'Nobody can suggest',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel={
          channel ? `Live in #${channel.name}` : 'Suggestions are live'
        }
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>Suggestions are off. Turn them on above to edit them.</span>
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
                  <SGSettings
                    config={current}
                    serverId={server.id}
                    channels={data.channels}
                    roles={data.roles}
                    studio={studio.data}
                    limits={data.limits}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'edit' && (
                <SGEdit
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
                  onStart={(m, name) => void startFrom(m, name)}
                  onTest={(channelId) =>
                    actions.test.mutate(channelId, {
                      onSuccess: () =>
                        toast({
                          title: 'Test message sent',
                          body: `A made-up suggestion was posted in #${data.channels.find((c) => c.id === channelId)?.name ?? 'the channel'}.`,
                        }),
                      onError: (e) =>
                        toast({
                          tone: 'danger',
                          title: 'Couldn’t send the test',
                          body: e.message,
                        }),
                    })
                  }
                />
              )}
              {tab === 'storage' && (
                <SGStorage
                  server={server}
                  config={current}
                  storage={data.storage}
                  paused={paused}
                />
              )}
              {tab === 'logs' && <SGLog entries={data.log} />}
              {tab === 'commands' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Commands</legend>
                  <SGCommands config={current} onChange={edit} />
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

/** The vote buttons, menu or reactions under the preview; click to edit. */
function VotePreview({
  config,
  onEdit,
}: {
  config: Suggestions;
  onEdit: (which: 'up' | 'down') => void;
}) {
  const v = config.vote;
  const ratio = { up: 12, down: 3 };
  if (v.kind === 'reaction')
    return (
      <div className="sp-rr-preview dc-reactions" aria-label="Vote reactions">
        {(['up', 'down'] as const).map((which) => (
          <button
            key={which}
            type="button"
            className="dc-reaction sp-sg-edit-vote"
            aria-label={`Edit the ${which}vote`}
            onClick={() => onEdit(which)}
          >
            {renderDiscordText(v[which].emoji || '❔')}
            <span>{ratio[which]}</span>
          </button>
        ))}
      </div>
    );
  if (v.kind === 'button')
    return (
      <div className="sp-rr-preview" aria-label="Vote buttons">
        <div className="dc-row">
          {(['up', 'down'] as const).map((which) => {
            const o = v[which];
            return (
              <button
                key={which}
                type="button"
                aria-label={`Edit the ${which}vote button`}
                onClick={() => onEdit(which)}
                className={cx(
                  'dc-btn sp-sg-edit-vote',
                  o.colour === 'blurple' && 'dc-btn--primary',
                  o.colour === 'green' && 'dc-btn--success',
                  o.colour === 'red' && 'dc-btn--danger',
                )}
              >
                {o.emoji && (
                  <span className="dc-emoji">{renderDiscordText(o.emoji)}</span>
                )}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  return (
    <div className="sp-rr-preview" aria-label="Vote menu">
      <button
        type="button"
        className="dc-select sp-sg-edit-vote"
        aria-label="Edit the vote menu"
        onClick={() => onEdit('up')}
      >
        <span>{v.placeholder || 'Vote on this suggestion'}</span>
        <Icon name="chevron-down" size="sm" />
      </button>
    </div>
  );
}

/** Ready-made suggestion messages, shown as they look. */
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
  onPick: (p: SgPreset) => void;
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
      description="Picking one adds it to your Message Studio templates and uses it for suggestions."
    >
      <div className="sp-presets">
        {sgPresets.map((p) => (
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

function SGEdit({
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
  config: Suggestions;
  studio: StudioState;
  channels: Channel[];
  tried: boolean;
  dirty: boolean;
  busy: boolean;
  testing: boolean;
  messageOf: (id: string) => StudioMessage | undefined;
  onChange: (patch: Partial<Suggestions>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onStart: (m: StudioMessage, name: string) => void;
  onTest: (channel: string) => void;
}) {
  const [presets, setPresets] = useState(false);
  const [voteEdit, setVoteEdit] = useState<'up' | 'down' | null>(null);
  const [testChannel, setTestChannel] = useState(config.channel);
  const id = config.message;
  const message = id ? messageOf(id) : undefined;
  const paused = !!server.paused;
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

  // Nothing picked yet: start from scratch or from a ready-made one.
  if (!message)
    return (
      <section className="sp-card sp-greet-empty" aria-label="Live preview">
        <EmptyState
          icon={<EditingIcon />}
          title={
            id
              ? 'The suggestion message template was deleted'
              : 'How should suggestions look?'
          }
          actions={
            <div className="sp-greet-start">
              <AnimatedIconButton
                reveal={plusAnimations.reveal}
                hover={plusAnimations.hover}
                select={plusAnimations.select}
                disabled={paused}
                loading={busy}
                onClick={() => onStart(ownMessage(), 'Suggestion message')}
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
          Until you pick one, Sparko uses its Suggestion card. Your message is a
          Message Studio template, edited right in the preview.
        </EmptyState>
        {picker}
      </section>
    );

  return (
    <div className="sp-stack">
      <div className="sp-studio__grid">
        <fieldset className="sp-fieldset" disabled={paused}>
          <legend className="sp-sr-only">Suggestion message</legend>
          <MessageCanvas
            key={id}
            server={server}
            message={message}
            tried={tried}
            headingId="sg-preview"
            suggestionVariables
            locked
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(id, patch)}
            above={
              <p className="sp-edit-banner" role="status">
                <Icon name="info" size="sm" />
                <span>
                  Editing <b>{message.name}</b> from Message Studio. It holds
                  one embed or container without pictures; members’ files show
                  with <code>{'{files}'}</code>. Click a vote button to change
                  it.
                </span>
              </p>
            }
            below={
              <VotePreview config={config} onEdit={(w) => setVoteEdit(w)} />
            }
          />
        </fieldset>

        <section
          className="sp-card sp-studio__side"
          aria-labelledby="sg-message"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="sg-message">
                Suggestion message
              </h2>
              <p className="sp-card__sub">
                Pick the template, send a test, or edit its JSON.
              </p>
            </div>
          </div>
          <div className="sp-card__body">
            <div data-issue="message">
              <Combobox
                label={
                  <>
                    Message template{' '}
                    <InfoTip text="The Message Studio template every suggestion is posted with." />
                  </>
                }
                searchPlaceholder="Search templates"
                value={id}
                onChange={(message) => onChange({ message })}
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
      <Modal
        open={!!voteEdit}
        onClose={() => setVoteEdit(null)}
        icon="settings"
        title={
          config.vote.kind === 'menu'
            ? 'Editing the vote menu'
            : voteEdit === 'up'
              ? 'Editing the upvote'
              : 'Editing the downvote'
        }
        description="The two votes are fixed: they can be changed, not removed or added to."
        footer={
          <Button variant="primary" onClick={() => setVoteEdit(null)}>
            Done
          </Button>
        }
      >
        <ul className="sp-rr-items sp-sg-votes">
          {(config.vote.kind === 'menu'
            ? (['up', 'down'] as const)
            : voteEdit
              ? [voteEdit]
              : []
          ).map((which) => (
            <VoteCard
              key={which}
              kind={config.vote.kind}
              which={which}
              option={config.vote[which]}
              serverId={server.id}
              onChange={(patch) =>
                onChange({
                  vote: {
                    ...config.vote,
                    [which]: { ...config.vote[which], ...patch },
                  },
                })
              }
            />
          ))}
        </ul>
      </Modal>
    </div>
  );
}

// Storage ---------------------------------------------------------------------

const link = (guildId: string, s: SgSuggestion) =>
  s.channelId && s.messageId
    ? `https://discord.com/channels/${guildId}/${s.channelId}/${s.messageId}`
    : null;

function SGStorage({
  server,
  config,
  storage,
  paused,
}: {
  server: Server;
  config: Suggestions;
  storage: SGState['storage'];
  paused: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const list = useSuggestionList(server.id, query, status);
  const actions = useSuggestionActions(server.id);
  const toast = useToast();
  const [deleting, setDeleting] = useState<SgSuggestion | null>(null);

  // Searches a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const shown = list.data?.storage ?? storage;
  const usedMb = shown.usedKb / 1024;
  const items = list.data?.suggestions ?? [];
  return (
    <section className="sp-card" aria-labelledby="sg-storage">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="sg-storage">
            Storage
          </h2>
          <p className="sp-card__sub">
            Every suggestion posted. Click one to open it in Discord.
          </p>
        </div>
      </div>
      <div className="sp-card__body sp-stack">
        <div className="sp-sg-usage">
          <div className="sp-field__row">
            <span className="sp-hint">
              {shown.count.toLocaleString('en-US')}{' '}
              {shown.count === 1 ? 'suggestion' : 'suggestions'} ·{' '}
              {usedMb < 1
                ? `${shown.usedKb.toLocaleString('en-US')} KB`
                : `${usedMb.toFixed(1)} MB`}{' '}
              of {shown.limitMb} MB{' '}
              <InfoTip
                text={`Each suggestion uses ${shown.perKb} KB of the server’s storage, so ${shown.limit.toLocaleString('en-US')} fit on this plan. Deleting one frees its space.`}
              />
            </span>
            <span className="sp-hint sp-tnum">{shown.perKb} KB each</span>
          </div>
          <div
            className="sp-progress sp-progress--sm"
            role="progressbar"
            aria-label="Suggestion storage used"
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
            aria-label="Search suggestions"
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
              { value: 'review', label: 'Waiting for review' },
              { value: 'open', label: 'Pending' },
              ...config.statuses.map((s) => ({
                value: s.id,
                label: s.name || 'Unnamed status',
              })),
            ]}
          />
        </div>
        {list.isPending ? (
          <div className="sp-skel sp-skel--block" style={{ height: 160 }} />
        ) : items.length ? (
          <ul className="sp-sg-list">
            {items.map((s) => {
              const ratio = voteRatio(s.up, s.down);
              const url = link(server.id, s);
              const st = config.statuses.find((x) => x.id === s.status);
              const body = (
                <>
                  <span className="sp-sg-card__who">
                    <img
                      className="sp-sg-card__avatar"
                      src={s.authorAvatar || undefined}
                      alt=""
                    />
                    <span className="sp-sg-card__name">{s.authorName}</span>
                    <span className="sp-hint">{s.authorId}</span>
                  </span>
                  <span className="sp-sg-card__title">
                    <span className="sp-hint sp-tnum">#{s.number}</span>{' '}
                    {s.title}
                  </span>
                  <span className="sp-sg-card__meta">
                    <Badge
                      size="sm"
                      className="sp-sg-badge"
                      style={
                        {
                          '--sg-status': st?.color ?? 'var(--sp-muted)',
                        } as CSSProperties
                      }
                    >
                      {sgStatusName(config, s)}
                      {s.closed ? ' · closed' : ''}
                    </Badge>
                    <code className="sp-sg-card__ratio">
                      {ratio.amount.replace(/`/g, '')}
                    </code>
                    <span className="sp-hint">{when(s.createdAt)}</span>
                  </span>
                  {s.reason && (
                    <span className="sp-sg-card__reason">
                      <span>{s.reason.text}</span>
                      <span className="sp-hint">
                        — {s.reason.byName} ({s.reason.byId})
                      </span>
                    </span>
                  )}
                </>
              );
              return (
                <li
                  key={s.number}
                  className="sp-card sp-sg-card"
                  style={
                    {
                      '--sg-ratio': sgRatioColour(s.up, s.down),
                    } as CSSProperties
                  }
                >
                  {url ? (
                    <a
                      className="sp-sg-card__open"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open suggestion #${s.number} in Discord`}
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
                    aria-label={`Delete suggestion #${s.number}`}
                    onClick={() => setDeleting(s)}
                  >
                    Delete
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="message-square" title="No suggestions here">
            {query.trim() || status
              ? 'Nothing matches. Try another search or status.'
              : `Members suggest with /${config.commands.suggest.name}. Their suggestions show here.`}
          </EmptyState>
        )}
      </div>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        icon="trash-2"
        title={`Delete suggestion #${deleting?.number ?? ''}?`}
        description="Its message, thread and votes are taken out of Discord, and its data is removed. This can’t be undone."
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
                    toast({ title: `Deleted suggestion #${deleting.number}` });
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

const logIcon: Record<SgLogEntry['action'], string> = {
  posted: 'message-square',
  review: 'eye',
  accepted: 'circle-check',
  status: 'flag',
  closed: 'lock',
  deleted: 'trash-2',
  resent: 'refresh-cw',
  refused: 'ban',
  failed: 'circle-x',
};

function SGLog({ entries }: { entries: SgLogEntry[] }) {
  const [filter, setFilter] = useState<
    'all' | 'posted' | 'status' | 'deleted' | 'problems'
  >('all');
  const shown = entries.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'posted'
        ? ['posted', 'review', 'accepted'].includes(e.action)
        : filter === 'status'
          ? e.action === 'status' || e.action === 'closed'
          : filter === 'deleted'
            ? e.action === 'deleted' || e.action === 'resent'
            : e.action === 'refused' || e.action === 'failed',
  );
  return (
    <section className="sp-card" aria-labelledby="sg-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="sg-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every suggestion posted, checked, given a status, closed or deleted,
            and every one Sparko turned away.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'posted', label: 'Posted' },
            { value: 'status', label: 'Statuses' },
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
              <span className="sp-greet-log__text">{sgLogLine(e)}</span>
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
          When members suggest and staff answer, it shows here.
        </EmptyState>
      )}
    </section>
  );
}

// Commands --------------------------------------------------------------------

const commandTitles: Record<SgCommandKey, string> = {
  suggest: 'Suggest',
  status: 'Set a status',
  approve: 'Approve',
  deny: 'Deny',
  delete: 'Delete',
};
const commandOptions: Record<SgCommandKey, string> = {
  suggest: '[file] [file2] [file3]',
  status: '[id] [status]',
  approve: '[id]',
  deny: '[id]',
  delete: '[id]',
};

function SGCommands({
  config,
  onChange,
}: {
  config: Suggestions;
  onChange: (patch: Partial<Suggestions>) => void;
}) {
  const edit = (
    key: SgCommandKey,
    patch: Partial<Suggestions['commands'][SgCommandKey]>,
  ) =>
    onChange({
      commands: {
        ...config.commands,
        [key]: { ...config.commands[key], ...patch },
      },
    });
  return (
    <section className="sp-card" aria-labelledby="sg-commands">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="sg-commands">
            Commands
          </h2>
          <p className="sp-card__sub">
            The slash commands for suggestions in this server. Rename them,
            change what Discord shows under them, or turn them off.
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        <ul className="sp-sg-commands">
          {sgCommandKeys.map((key) => {
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
                    <InfoTip text={sgCommandAbout[key]} />
                  </span>
                  <Switch
                    checked={c.on}
                    onChange={(on) => edit(key, { on })}
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
                      edit(key, {
                        name: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                      })
                    }
                    {...(bad
                      ? {
                          error: '1 to 32 lowercase letters, numbers, - or _.',
                        }
                      : { hint: `/${c.name} ${commandOptions[key]}` })}
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
          each one is set in Settings: Who can suggest, Who can approve or deny,
          and Who can delete.
        </p>
      </div>
    </section>
  );
}
