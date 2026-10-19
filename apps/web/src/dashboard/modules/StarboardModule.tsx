import { useEffect, useState } from 'react';
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
  SB_NO_TEXT,
  commandName,
  planIssue,
  sbCommandAbout,
  sbCommandKeys,
  sbIssue,
  sbJumpLink,
  sbLogLine,
  sbMessageIssue,
  sbPresets,
  studioIssue,
  useStarboard,
  useStarboardActions,
  useStarredList,
  useStudio,
  useStudioActions,
  type Channel,
  type SBState,
  type SbBlocked,
  type SbBoard,
  type SbCommandKey,
  type SbEntry,
  type SbLogEntry,
  type SbPreset,
  type Server,
  type Starboard,
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
import { SBSettings } from './SBSettings';
import { templateItems } from './SGSettings';

const MODULE = 'starboard';

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

/** The open tab and board, kept in the address so links and Back work. */
function useTab() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && tabs.includes(raw) ? raw : 'settings';
  const set = (next: { tab?: Tab; board?: string }) => {
    const out = new URLSearchParams(params);
    if (next.tab) {
      if (next.tab === 'settings') out.delete('tab');
      else out.set('tab', next.tab);
    }
    if (next.board !== undefined) out.set('board', next.board);
    setParams(out, { replace: true });
  };
  return [tab, params.get('board') ?? '', set] as const;
}

/** Which tab a problem is on, and which board it's about. */
const placeOf = (at: string): { tab: Tab; board?: string } => {
  const board = at.match(/^board:([\w-]+)/)?.[1];
  if (at.endsWith('/message') || at === 'message')
    return { tab: 'edit', ...(board ? { board } : {}) };
  if (at.startsWith('command:')) return { tab: 'commands' };
  return { tab: 'settings', ...(board ? { board } : {}) };
};

/** A post to write from scratch: the count, the author and the text. */
const ownMessage = (): StudioMessage => ({
  ...sbPresets[1]!.message,
  name: 'Starboard post',
});

/** A template's problems as a board post, ignoring its channel. */
const messageProblem = (m: StudioMessage, server: Server) =>
  sbMessageIssue(m) ??
  studioIssue({ ...forChecks(m), channel: '1' }) ??
  planIssue(m, server.plan === 'plus' ? 'plus' : 'free');

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function StarboardModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const sb = useStarboard(server.id);
  const studio = useStudio(server.id);
  const actions = useStarboardActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, boardParam, setPlace] = useTab();
  const [draft, setDraft] = useState<Starboard | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  // Unsaved changes to the Studio templates boards post with.
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

  const saved = sb.data?.config;
  const current = draft ?? saved;
  const savedOn = sb.data?.on ?? false;
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

  if (sb.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module} tabs={5}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (sb.isError || studio.isError || !sb.data || !studio.data || !current)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load the starboard"
          actions={
            <Button
              onClick={() => {
                void sb.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = sb.data;
  const paused = !!server.paused;
  const board =
    current.boards.find((b) => b.id === boardParam) ?? current.boards[0]!;
  const channel = data.channels.find(
    (c) => c.id === current.boards[0]?.channel,
  );
  const edit = (patch: Partial<Starboard>) => {
    setDraft({ ...current, ...patch });
    flow.clear();
  };
  const editBoard = (id: string, patch: Partial<SbBoard>) =>
    edit({
      boards: current.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  const editMessage = (id: string, patch: Partial<StudioMessage>) => {
    const m = messageOf(id);
    if (!m) return;
    setMessages((all) => ({ ...all, [id]: { ...m, ...patch } }));
    flow.clear();
  };
  const point = (at: string, title: string, problem: string) => {
    setTried(true);
    setPlace(placeOf(at));
    setIssue((i) => ({ at, n: (i?.n ?? 0) + 1 }));
    toast({ tone: 'danger', title, body: problem });
  };

  const doSave = async () => {
    for (const [id, m] of changedMessages) {
      const found = messageProblem(m, server);
      const user = current.boards.find((b) => b.message === id);
      if (found)
        return point(
          user ? `board:${user.id}/message` : found.at,
          `Can’t save “${m.name}” yet`,
          found.problem,
        );
    }
    const found = sbIssue(current, {
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

  /** Adds a Studio template for a board's posts and uses it. */
  const startFrom = async (b: SbBoard, m: StudioMessage, name: string) => {
    try {
      const { id } = await studioActions.saveTemplate.mutateAsync({
        name,
        message: { ...m, name, channel: b.channel },
        folderId: null,
      });
      editBoard(b.id, { message: id });
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
              ? 'Starred messages are reposted'
              : 'Stars aren’t counted',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel={
          channel ? `Live in #${channel.name}` : 'The starboard is live'
        }
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>The starboard is off. Turn it on above to edit it.</span>
        </p>
      )}
      <div className={cx('sp-greet-body', !isOn && 'is-off')} inert={!isOn}>
        <Tabs
          label={module.label}
          value={tab}
          onChange={(next) => setPlace({ tab: next })}
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
                  <SBSettings
                    config={current}
                    serverId={server.id}
                    channels={data.channels}
                    roles={data.roles}
                    limits={data.limits}
                    selected={board.id}
                    onSelect={(id) => setPlace({ board: id })}
                    onChange={edit}
                  />
                </fieldset>
              )}
              {tab === 'edit' && (
                <SBEdit
                  server={server}
                  config={current}
                  board={board}
                  studio={studio.data}
                  channels={data.channels}
                  tried={tried}
                  dirty={dirty}
                  busy={studioActions.saveTemplate.isPending}
                  testing={actions.test.isPending}
                  messageOf={messageOf}
                  onBoard={(id) => setPlace({ board: id })}
                  onChange={(patch) => editBoard(board.id, patch)}
                  onMessage={editMessage}
                  onStart={(m, name) => void startFrom(board, m, name)}
                  onTest={(channelId) =>
                    actions.test.mutate(
                      { board: board.id, channel: channelId },
                      {
                        onSuccess: () =>
                          toast({
                            title: 'Test message sent',
                            body: `A made-up starred message was posted in #${data.channels.find((c) => c.id === channelId)?.name ?? 'the channel'}.`,
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
                <SBStorage
                  server={server}
                  config={saved ?? current}
                  channels={data.channels}
                  storage={data.storage}
                  paused={paused}
                />
              )}
              {tab === 'logs' && <SBLog entries={data.log} />}
              {tab === 'commands' && (
                <fieldset className="sp-fieldset" disabled={paused}>
                  <legend className="sp-sr-only">Commands</legend>
                  <SBCommands config={current} onChange={edit} />
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

/** Ready-made board posts, shown as they look. */
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
  onPick: (p: SbPreset) => void;
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
      description="Picking one adds it to your Message Studio templates and uses it for this board’s posts."
    >
      <div className="sp-presets">
        {sbPresets.map((p) => (
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

/** The fixed button under every post, as members see it. */
function JumpPreview() {
  return (
    <div className="sp-rr-preview sp-sb-jump" aria-label="Fixed button">
      <div className="dc-row">
        <span className="dc-btn">
          Jump to message
          <Icon name="external-link" />
        </span>
      </div>
      <InfoTip text="Sparko adds this button under every post. It opens the starred message, so it can’t be changed or removed." />
    </div>
  );
}

/** Picks the board being edited, when there are several. */
function BoardPicker({
  config,
  board,
  onBoard,
}: {
  config: Starboard;
  board: SbBoard;
  onBoard: (id: string) => void;
}) {
  if (config.boards.length < 2) return null;
  return (
    <div className="sp-sb-pick">
      <span className="sp-label">Board</span>
      <Segmented
        label="Board"
        value={board.id}
        onChange={onBoard}
        options={config.boards.map((b) => ({
          value: b.id,
          label: b.name.trim() || 'Unnamed board',
        }))}
      />
    </div>
  );
}

function SBEdit({
  server,
  config,
  board,
  studio,
  channels,
  tried,
  dirty,
  busy,
  testing,
  messageOf,
  onBoard,
  onChange,
  onMessage,
  onStart,
  onTest,
}: {
  server: Server;
  config: Starboard;
  board: SbBoard;
  studio: StudioState;
  channels: Channel[];
  tried: boolean;
  dirty: boolean;
  busy: boolean;
  testing: boolean;
  messageOf: (id: string) => StudioMessage | undefined;
  onBoard: (id: string) => void;
  onChange: (patch: Partial<SbBoard>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onStart: (m: StudioMessage, name: string) => void;
  onTest: (channel: string) => void;
}) {
  const [presets, setPresets] = useState(false);
  const [testChannel, setTestChannel] = useState(board.channel);
  const id = board.message;
  const message = id ? messageOf(id) : undefined;
  const paused = !!server.paused;
  const label = board.name.trim() || 'this board';
  const picker = (
    <PresetPicker
      open={presets}
      serverId={server.id}
      busy={busy}
      onClose={() => setPresets(false)}
      onPick={(p) => {
        setPresets(false);
        onStart(p.message, `${p.name} (${board.name.trim() || 'Starboard'})`);
      }}
    />
  );
  const boards = (
    <BoardPicker config={config} board={board} onBoard={onBoard} />
  );

  // Nothing picked yet: start from scratch or from a ready-made one.
  if (!message)
    return (
      <div className="sp-stack">
        {boards}
        <section
          className="sp-card sp-greet-empty"
          aria-label="Live preview"
          data-issue={`board:${board.id}/message`}
        >
          <EmptyState
            icon={<EditingIcon />}
            title={
              id
                ? `The template ${label} posts with was deleted`
                : `How should ${label} posts look?`
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
                      ownMessage(),
                      `${board.name.trim() || 'Starboard'} post`,
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
            Until you pick one, Sparko posts with its Classic starboard. Your
            post is a Message Studio template, edited right in the preview.
          </EmptyState>
          {picker}
        </section>
      </div>
    );

  return (
    <div className="sp-stack">
      {boards}
      <div className="sp-studio__grid">
        <fieldset className="sp-fieldset" disabled={paused}>
          <legend className="sp-sr-only">Board post</legend>
          <MessageCanvas
            key={`${board.id}-${id}`}
            server={server}
            message={message}
            tried={tried}
            headingId="sb-preview"
            starboardVariables
            maxRows={4}
            rowTaker="The Jump to message button"
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(id, patch)}
            above={
              <p className="sp-edit-banner" role="status">
                <Icon name="info" size="sm" />
                <span>
                  Editing <b>{message.name}</b> from Message Studio. Use{' '}
                  <code>{'{message.content}'}</code> for the text,{' '}
                  <code>{'{message.image}'}</code> for its picture and{' '}
                  <code>{'{stars}'}</code> for the count; find them all under
                  Variables.
                </span>
              </p>
            }
            below={<JumpPreview />}
          />
        </fieldset>

        <section
          className="sp-card sp-studio__side"
          aria-labelledby="sb-message"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="sb-message">
                {board.name.trim() || 'Board'} post
              </h2>
              <p className="sp-card__sub">
                Pick the template, send a test, or edit its JSON.
              </p>
            </div>
          </div>
          <div className="sp-card__body">
            <div data-issue={`board:${board.id}/message`}>
              <Combobox
                label={
                  <>
                    Message template{' '}
                    <InfoTip text="The Message Studio template this board’s posts use. Each board can have its own." />
                  </>
                }
                searchPlaceholder="Search templates"
                value={id}
                onChange={(next) => onChange({ message: next })}
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
    </div>
  );
}

// Storage ---------------------------------------------------------------------

type Confirm =
  | { kind: 'remove'; entry: SbEntry }
  | { kind: 'block'; entry: SbEntry }
  | { kind: 'author'; entry: SbEntry };

function SBStorage({
  server,
  config,
  channels,
  storage,
  paused,
}: {
  server: Server;
  config: Starboard;
  channels: Channel[];
  storage: SBState['storage'];
  paused: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState('');
  const [sort, setSort] = useState<'stars' | 'newest'>('stars');
  const list = useStarredList(server.id, { board, sort, query });
  const actions = useStarboardActions(server.id);
  const toast = useToast();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Searches a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const shown = list.data?.storage ?? storage;
  const usedMb = shown.usedKb / 1024;
  const items = list.data?.entries ?? [];
  const blocked = list.data?.blocked ?? [];
  const boardName = (id: string) =>
    config.boards.find((b) => b.id === id)?.name ?? 'Removed board';
  const starOf = (id: string) =>
    config.boards.find((b) => b.id === id)?.emojis[0] ?? '⭐';
  const channelName = (id: string) =>
    channels.find((c) => c.id === id)?.name ?? 'unknown-channel';
  const failed = (title: string) => (e: Error) =>
    toast({ tone: 'danger', title, body: e.message });
  const done = (title: string) => () => {
    toast({ title });
    setConfirm(null);
    void list.refetch();
  };
  const run = (c: Confirm) => {
    const e = c.entry;
    if (c.kind === 'remove')
      actions.remove.mutate(
        { boardId: e.boardId, messageId: e.messageId },
        {
          onSuccess: done(
            `Took ${e.authorName}’s message off ${boardName(e.boardId)}`,
          ),
          onError: failed('Couldn’t remove it'),
        },
      );
    else
      actions.block.mutate(
        c.kind === 'block'
          ? { kind: 'message', id: e.messageId, channelId: e.channelId }
          : { kind: 'member', id: e.authorId, name: e.authorName },
        {
          onSuccess: done(
            c.kind === 'block'
              ? 'Blocked the message from the starboard'
              : `Blocked ${e.authorName} from the starboard`,
          ),
          onError: failed('Couldn’t block it'),
        },
      );
  };
  const busy =
    actions.remove.isPending ||
    actions.block.isPending ||
    actions.freeze.isPending ||
    actions.unblock.isPending;

  return (
    <div className="sp-stack">
      <section className="sp-card" aria-labelledby="sb-storage">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sb-storage">
              Storage
            </h2>
            <p className="sp-card__sub">
              Every message on a board, with its stars. Open one to jump to it
              in Discord.
            </p>
          </div>
        </div>
        <div className="sp-card__body sp-stack">
          <div className="sp-sg-usage">
            <div className="sp-field__row">
              <span className="sp-hint">
                {shown.count.toLocaleString('en-US')}{' '}
                {shown.count === 1 ? 'starred message' : 'starred messages'} ·{' '}
                {usedMb < 1
                  ? `${shown.usedKb.toLocaleString('en-US')} KB`
                  : `${usedMb.toFixed(1)} MB`}{' '}
                of {shown.limitMb} MB{' '}
                <InfoTip
                  text={`Each starred message uses ${shown.perKb} KB of the server’s storage, so ${shown.limit.toLocaleString('en-US')} fit on this plan. When it’s full, new messages aren’t posted; removing old ones frees space.`}
                />
              </span>
              <span className="sp-hint sp-tnum">{shown.perKb} KB each</span>
            </div>
            <div
              className="sp-progress sp-progress--sm"
              role="progressbar"
              aria-label="Starboard storage used"
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
          <div className="sp-sb-filters">
            <Input
              aria-label="Search starred messages"
              icon="search"
              placeholder="Search by text, username or ID"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {config.boards.length > 1 && (
              <Combobox
                label={<span className="sp-sr-only">Board</span>}
                searchable={false}
                value={board || 'all'}
                onChange={(v) => setBoard(v === 'all' ? '' : v)}
                items={[
                  { value: 'all', label: 'Every board' },
                  ...config.boards.map((b) => ({
                    value: b.id,
                    label: b.name || 'Unnamed board',
                  })),
                ]}
              />
            )}
            <Segmented<'stars' | 'newest'>
              label="Sort by"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'stars', label: 'Most stars' },
                { value: 'newest', label: 'Newest' },
              ]}
            />
          </div>
          {list.isPending ? (
            <div className="sp-skel sp-skel--block" style={{ height: 160 }} />
          ) : items.length ? (
            <ul className="sp-sg-list">
              {items.map((e) => (
                <li
                  key={`${e.boardId}:${e.messageId}`}
                  className={cx('sp-card sp-sb-card', e.frozen && 'is-frozen')}
                >
                  <a
                    className="sp-sb-card__open"
                    href={sbJumpLink(server.id, e)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${e.authorName}’s message in Discord`}
                  >
                    <span className="sp-sg-card__who">
                      <img
                        className="sp-sg-card__avatar"
                        src={e.authorAvatar || undefined}
                        alt=""
                      />
                      <span className="sp-sg-card__name">{e.authorName}</span>
                      <span className="sp-hint">{e.authorId}</span>
                    </span>
                    <span className="sp-sb-card__body">
                      {e.content === null ? (
                        <span className="sp-sb-card__hidden">
                          {SB_NO_TEXT.replace(/\*/g, '')}{' '}
                          <InfoTip text="Turn on the Message Content Intent for Sparko in the Discord Developer Portal so it can see message text." />
                        </span>
                      ) : e.content ? (
                        <span className="sp-sb-card__text">
                          {renderDiscordText(e.content)}
                        </span>
                      ) : null}
                      {e.image && (
                        <img
                          className="sp-sb-card__image"
                          src={e.image}
                          alt=""
                        />
                      )}
                    </span>
                    <span className="sp-sg-card__meta">
                      <Badge size="sm" className="sp-sb-stars-badge">
                        {renderDiscordText(starOf(e.boardId))} {e.stars}
                      </Badge>
                      {config.boards.length > 1 && (
                        <Badge size="sm">{boardName(e.boardId)}</Badge>
                      )}
                      {e.frozen && (
                        <Badge size="sm" icon="lock" tone="info">
                          Frozen
                        </Badge>
                      )}
                      {e.deleted && (
                        <Badge size="sm" tone="warning">
                          Original deleted
                        </Badge>
                      )}
                      <span className="sp-hint">
                        #{channelName(e.channelId)} · {when(e.messageAt)}
                      </span>
                    </span>
                  </a>
                  <span className="sp-sb-card__actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="lock"
                      disabled={paused || busy || e.deleted}
                      aria-label={`${e.frozen ? 'Unfreeze' : 'Freeze'} ${e.authorName}’s message`}
                      onClick={() =>
                        actions.freeze.mutate(
                          {
                            boardId: e.boardId,
                            messageId: e.messageId,
                            frozen: !e.frozen,
                          },
                          {
                            onSuccess: () => {
                              toast({
                                title: e.frozen
                                  ? 'Unfrozen: its count updates again'
                                  : 'Frozen: its count won’t change',
                              });
                              void list.refetch();
                            },
                            onError: failed('Couldn’t change it'),
                          },
                        )
                      }
                    >
                      {e.frozen ? 'Unfreeze' : 'Freeze'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="ban"
                      disabled={paused || busy}
                      aria-label={`Block ${e.authorName}’s message`}
                      onClick={() => setConfirm({ kind: 'block', entry: e })}
                    >
                      Block
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="user-x"
                      disabled={paused || busy}
                      aria-label={`Block ${e.authorName}`}
                      onClick={() => setConfirm({ kind: 'author', entry: e })}
                    >
                      Block author
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash-2"
                      disabled={paused || busy}
                      aria-label={`Remove ${e.authorName}’s message from the board`}
                      onClick={() => setConfirm({ kind: 'remove', entry: e })}
                    >
                      Remove
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="star" title="No starred messages here">
              {query.trim() || board
                ? 'Nothing matches. Try another search or board.'
                : `Messages show here once they get ${config.boards[0]?.threshold ?? 3} stars.`}
            </EmptyState>
          )}
        </div>
      </section>

      <SBBlocked
        blocked={blocked}
        channels={channels}
        serverId={server.id}
        paused={paused || busy}
        onUnblock={(b) =>
          actions.unblock.mutate(
            { kind: b.kind, id: b.id },
            {
              onSuccess: () => {
                toast({
                  title:
                    b.kind === 'member'
                      ? `${b.name || b.id} can reach the board again`
                      : 'The message can reach the board again',
                });
                void list.refetch();
              },
              onError: failed('Couldn’t unblock it'),
            },
          )
        }
      />

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        icon={confirm?.kind === 'remove' ? 'trash-2' : 'ban'}
        title={
          confirm?.kind === 'remove'
            ? `Take this off ${boardName(confirm.entry.boardId)}?`
            : confirm?.kind === 'block'
              ? 'Block this message?'
              : `Block ${confirm?.entry.authorName ?? 'this member'}?`
        }
        description={
          confirm?.kind === 'remove'
            ? 'Its post is deleted and its stars are forgotten. It comes back only if members star it enough again.'
            : confirm?.kind === 'block'
              ? 'Its posts come down from every board, and it can’t reach one again until you unblock it.'
              : 'Their messages can’t reach any board, and their stars stop counting. Posts already up stay.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => confirm && run(confirm)}
            >
              {confirm?.kind === 'remove' ? 'Remove' : 'Block'}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}

/** Messages and members staff keep off every board. */
function SBBlocked({
  blocked,
  channels,
  serverId,
  paused,
  onUnblock,
}: {
  blocked: SbBlocked[];
  channels: Channel[];
  serverId: string;
  paused: boolean;
  onUnblock: (b: SbBlocked) => void;
}) {
  return (
    <section className="sp-card" aria-labelledby="sb-blocked">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="sb-blocked">
            Blocked
          </h2>
          <p className="sp-card__sub">
            Members and messages kept off every board. Staff block them here or
            with /starboard block.
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        {blocked.length ? (
          <ul className="sp-sb-blocked">
            {blocked.map((b) => (
              <li key={`${b.kind}:${b.id}`} className="sp-sb-blocked__row">
                <Icon
                  name={b.kind === 'member' ? 'user-x' : 'message-square'}
                  size="sm"
                  className="sp-sb-blocked__icon"
                />
                <span className="sp-sb-blocked__main">
                  <span className="sp-sb-blocked__name">
                    {b.kind === 'member'
                      ? b.name || b.id
                      : `A message${b.name ? ` by ${b.name}` : ''}`}
                    {b.kind === 'message' && b.channelId && (
                      <>
                        {' '}
                        <a
                          className="sp-hint"
                          href={sbJumpLink(serverId, {
                            channelId: b.channelId,
                            messageId: b.id,
                          })}
                          target="_blank"
                          rel="noreferrer"
                        >
                          in #
                          {channels.find((c) => c.id === b.channelId)?.name ??
                            'unknown-channel'}
                        </a>
                      </>
                    )}
                  </span>
                  {b.preview && (
                    <span className="sp-sb-blocked__preview">
                      “{b.preview}”
                    </span>
                  )}
                  <span className="sp-hint">
                    {b.kind === 'member' ? `${b.id} · ` : ''}Blocked by{' '}
                    {b.byName} · {when(b.at)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={paused}
                  aria-label={`Unblock ${b.kind === 'member' ? b.name || b.id : 'the message'}`}
                  onClick={() => onUnblock(b)}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sp-hint">
            Nobody is blocked. Block a message or its author from a starred
            message above.
          </p>
        )}
      </div>
    </section>
  );
}

// Logs ------------------------------------------------------------------------

const logIcon: Record<SbLogEntry['action'], string> = {
  posted: 'star',
  milestone: 'trending-up',
  removed: 'trash-2',
  frozen: 'lock',
  unfrozen: 'refresh-cw',
  blocked: 'ban',
  unblocked: 'circle-check',
  failed: 'circle-x',
};

type LogFilter = 'all' | 'posted' | 'removed' | 'staff' | 'problems';

function SBLog({ entries }: { entries: SbLogEntry[] }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const groups: Record<Exclude<LogFilter, 'all'>, SbLogEntry['action'][]> = {
    posted: ['posted', 'milestone'],
    removed: ['removed'],
    staff: ['frozen', 'unfrozen', 'blocked', 'unblocked'],
    problems: ['failed'],
  };
  const shown = entries.filter(
    (e) => filter === 'all' || groups[filter].includes(e.action),
  );
  return (
    <section className="sp-card" aria-labelledby="sb-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="sb-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every message posted, every milestone passed (10, 25, 50 and 100
            stars), and every post removed, frozen or blocked.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'posted', label: 'Posted' },
            { value: 'removed', label: 'Removed' },
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
              <span className="sp-greet-log__text">{sbLogLine(e)}</span>
              <span className="sp-greet-log__meta">
                {[e.authorId || (e.userId !== '0' ? e.userId : ''), when(e.at)]
                  .filter(Boolean)
                  .join(' · ')}
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
          When messages reach a board, it shows here.
        </EmptyState>
      )}
    </section>
  );
}

// Commands --------------------------------------------------------------------

const commandTitles: Record<SbCommandKey, string> = {
  starboard: 'The /starboard command',
  top: 'Top messages',
  random: 'Random message',
  stats: 'Stats',
  freeze: 'Freeze (staff)',
  block: 'Block (staff)',
};
const commandOptions: Record<SbCommandKey, string> = {
  starboard: '…',
  top: '[board] [member]',
  random: '[board]',
  stats: '[member]',
  freeze: '[message]',
  block: '[message] [member]',
};

function SBCommands({
  config,
  onChange,
}: {
  config: Starboard;
  onChange: (patch: Partial<Starboard>) => void;
}) {
  const edit = (
    key: SbCommandKey,
    patch: Partial<Starboard['commands'][SbCommandKey]>,
  ) =>
    onChange({
      commands: {
        ...config.commands,
        [key]: { ...config.commands[key], ...patch },
      },
    });
  const root = config.commands.starboard;
  return (
    <section className="sp-card" aria-labelledby="sb-commands">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="sb-commands">
            Commands
          </h2>
          <p className="sp-card__sub">
            One slash command with a few parts, like /{root.name} top. Rename
            them, change what Discord shows under them, or turn them off.
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        <ul className="sp-sg-commands">
          {sbCommandKeys.map((key) => {
            const c = config.commands[key];
            const bad = !commandName.test(c.name);
            const sub = key !== 'starboard';
            const off = !c.on || (sub && !root.on);
            return (
              <li
                key={key}
                className={cx(
                  'sp-sg-command',
                  off && 'is-off',
                  sub && 'sp-sb-sub',
                )}
                data-issue={`command:${key}`}
              >
                <div className="sp-sg-command__head">
                  <span className="sp-sg-command__title">
                    <Icon name="terminal" size="sm" />
                    {commandTitles[key]}
                    <InfoTip text={sbCommandAbout[key]} />
                  </span>
                  <Switch
                    checked={c.on}
                    disabled={sub && !root.on}
                    onChange={(on) => edit(key, { on })}
                    description={`/${sub ? `${root.name} ` : ''}${c.name} on or off`}
                  />
                </div>
                <div className="sp-ar__pair">
                  <Input
                    label="Name"
                    suffix={sub ? `/${root.name}` : '/'}
                    maxLength={32}
                    value={c.name}
                    disabled={off}
                    onChange={(e) =>
                      edit(key, {
                        name: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                      })
                    }
                    {...(bad
                      ? { error: '1 to 32 lowercase letters, numbers, - or _.' }
                      : {
                          hint: sub
                            ? `/${root.name} ${c.name} ${commandOptions[key]}`
                            : `/${c.name} top, /${c.name} stats and the rest`,
                        })}
                  />
                  <Input
                    label="Description"
                    maxLength={100}
                    value={c.description}
                    disabled={off}
                    onChange={(e) => edit(key, { description: e.target.value })}
                    hint="Shown under the command in Discord."
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="sp-hint">
          Commands change in Discord a few seconds after you save. Top, random
          and stats are for everyone; freeze and block are for the staff roles
          in Settings.
        </p>
      </div>
    </section>
  );
}
