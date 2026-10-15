import { useEffect, useState, type ComponentProps } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Icon,
  Modal,
  Notice,
  Segmented,
  RevealIcon,
  Tabs,
  animIcons,
  cx,
  type RevealHover,
  preloadAnimations,
  preloadCombobox,
  useToast,
  type ComboItem,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  deleteAfterChoices,
  greetCodes,
  greetKinds,
  greetNames,
  greetPresets,
  planIssue,
  studioIssue,
  useCheckChannel,
  useSaveWelcome,
  useStudio,
  useStudioActions,
  useWelcome,
  welcomeProblem,
  type Channel,
  type GreetKind,
  type GreetLogEntry,
  type GreetPreset,
  type GreetSettings,
  type Server,
  type StudioMessage,
  type StudioState,
  type WelcomeConfig,
} from '../../data';
import { FixPermissionModal, fixes } from '../FixPermissionModal';
import {
  ModuleHeader,
  ModuleSaveBar,
  PausedNotice,
  SavePipeline,
  syncState,
  useSaveFlow,
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
import { MessageCanvas, forChecks } from './MessageCanvas';
import { variablesAnimations } from './VariablesButton';
import { plusAnimations } from './StudioLibrary';

type Tab = GreetKind | 'logs';
const tabLabels: Record<Tab, string> = {
  join: 'Join message',
  leave: 'Leave message',
  boost: 'Boost message',
  logs: 'Logs',
};

const tabIcons: Record<Tab, { icon: string; anim: RevealHover | undefined }> = {
  join: { icon: 'user-plus', anim: animIcons.joinMessage },
  leave: { icon: 'log-out', anim: animIcons.leaveMessage },
  boost: { icon: 'zap', anim: animIcons.boostMessage },
  logs: { icon: 'scroll-text', anim: animIcons.log },
};

/** A button with the sparkle icon, which draws in and plays on hover. */
function SparkleButton(props: ComponentProps<typeof Button>) {
  const [hoverKey, setHoverKey] = useState(0);
  return (
    <Button
      {...props}
      onPointerEnter={(e) => {
        setHoverKey((k) => k + 1);
        props.onPointerEnter?.(e);
      }}
    >
      <RevealIcon
        anim={animIcons.sparkle}
        fallback="sparkles"
        hoverKey={hoverKey}
      />
      {props.children}
    </Button>
  );
}

/** The open tab, kept in the address so links and Back work. */
function useTab() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab =
    raw === 'leave' || raw === 'boost' || raw === 'logs' ? raw : 'join';
  const setTab = (next: Tab) => {
    const out = new URLSearchParams(params);
    if (next === 'join') out.delete('tab');
    else out.set('tab', next);
    setParams(out, { replace: true });
  };
  return [tab, setTab] as const;
}

/** Where a new template starts: one line to write over. */
const blankMessage = (kind: GreetKind): StudioMessage => ({
  ...greetPresets.find((p) => p.kind === kind && p.id.endsWith('-short'))!
    .message,
  name: tabLabels[kind],
});

const deleteLabels: Record<number, string> = {
  0: 'Never',
  30: 'After 30 seconds',
  60: 'After 1 minute',
  300: 'After 5 minutes',
  3600: 'After 1 hour',
};

/** A template's problems, ignoring its channel: welcome messages pick their own. */
function templateIssue(m: StudioMessage, server: Server) {
  return (
    studioIssue({ ...forChecks(m), channel: '1' }) ??
    planIssue(m, server.plan === 'plus' ? 'plus' : 'free')
  );
}

/** Studio templates as menu items, grouped by their folder. */
function templateItems(studio: StudioState): ComboItem[] {
  const folder = new Map(studio.folders.map((f) => [f.id, f.name]));
  return studio.templates.map((t) => ({
    value: t.id,
    label: t.name,
    icon: 'file-text',
    group: (t.folderId && folder.get(t.folderId)) || 'Templates',
  }));
}

export function WelcomeModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const welcome = useWelcome(server.id);
  const studio = useStudio(server.id);
  const save = useSaveWelcome(server.id);
  const actions = useStudioActions(server.id);
  const checkChannel = useCheckChannel(server.id);
  const flow = useSaveFlow(server.id, 'welcome');
  const toast = useToast();
  const [tab, setTab] = useTab();
  const [draft, setDraft] = useState<{
    on: boolean;
    config: WelcomeConfig;
  } | null>(null);
  // Unsaved changes to the templates, by template id.
  const [edits, setEdits] = useState<Record<string, StudioMessage>>({});
  const [tried, setTried] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  // Which message the preview shows when the DM sends another template.
  const [side, setSide] = useState<'channel' | 'dm'>('channel');
  const [issue, setIssue] = useState<ShownIssue | null>(null);

  useEffect(() => {
    preloadAnimations(variablesAnimations, true);
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

  const saved = welcome.data && {
    on: welcome.data.on,
    config: welcome.data.config,
  };
  const current = draft ?? saved;
  const templates = studio.data?.templates ?? [];
  const savedMessage = (id: string): StudioMessage | undefined => {
    const t = templates.find((x) => x.id === id);
    return t && { ...t.message, name: t.name };
  };
  const changedEdits = Object.entries(edits).filter(
    ([id, m]) => JSON.stringify(m) !== JSON.stringify(savedMessage(id)),
  );
  const dirty =
    !!current &&
    (JSON.stringify(current) !== JSON.stringify(saved) ||
      changedEdits.length > 0);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (welcome.isPending || studio.isPending)
    return (
      <div className="sp-stack" aria-busy="true" aria-label="Loading">
        <span className="sp-skel sp-skel--title" />
        <div className="sp-split">
          <div className="sp-skel sp-skel--block" style={{ height: 320 }} />
          <div className="sp-skel sp-skel--block" style={{ height: 320 }} />
        </div>
      </div>
    );
  if (welcome.isError || studio.isError || !current || !studio.data)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Welcome messages"
          actions={
            <Button
              icon="refresh-cw"
              onClick={() => {
                void welcome.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        >
          Sparko couldn’t read your server’s channels. Nothing was changed.
        </EmptyState>
      </div>
    );

  const data = studio.data;
  const { config } = current;
  const paused = !!server.paused;
  const channels = welcome.data.channels;
  const kind: GreetKind = tab === 'logs' ? 'join' : tab;
  const settings = config[kind];
  const channel = channels.find((c) => c.id === settings.channel);
  const channelBlocked = !!channel && !channel.canPost;

  const messageOf = (id: string) => edits[id] ?? savedMessage(id);
  const dmTemplate =
    settings.dm === 'same'
      ? settings.template
      : settings.dm === 'none'
        ? ''
        : settings.dm;
  const twoMessages = !!dmTemplate && dmTemplate !== settings.template;
  const previewId =
    twoMessages && (side === 'dm' || !settings.template)
      ? dmTemplate
      : settings.template || dmTemplate;
  const previewing = previewId ? messageOf(previewId) : undefined;

  const editSettings = (patch: Partial<WelcomeConfig['join']>) => {
    setDraft({
      on: current.on,
      config: { ...config, [kind]: { ...settings, ...patch } },
    });
    flow.clear();
  };
  const editTemplate = (id: string, patch: Partial<StudioMessage>) => {
    const m = messageOf(id);
    if (!m) return;
    setEdits((e) => ({ ...e, [id]: { ...m, ...patch } }));
    flow.clear();
  };

  const doSave = async () => {
    setTried(true);
    for (const [id, m] of changedEdits) {
      const found = templateIssue(m, server);
      if (!found) continue;
      // Shows the template with the problem, then points at it.
      const where = greetKinds.find(
        (k) => config[k].template === id || config[k].dm === id,
      );
      if (where && where !== tab) setTab(where);
      setSide(config[where ?? kind].template === id ? 'channel' : 'dm');
      setIssue((i) => ({ at: found.at, n: (i?.n ?? 0) + 1 }));
      toast({
        tone: 'danger',
        title: `Can’t save “${m.name}” yet`,
        body: found.problem,
      });
      return;
    }
    const problem = welcomeProblem(config, new Set(templates.map((t) => t.id)));
    if (problem) {
      const where = greetKinds.find((k) => problem.includes(greetNames[k]));
      if (where && where !== tab) setTab(where);
      setIssue((i) => ({ at: 'greet-template', n: (i?.n ?? 0) + 1 }));
      toast({ tone: 'danger', title: 'Can’t save yet', body: problem });
      return;
    }
    const ok = await flow.run(async () => {
      for (const [id, message] of changedEdits)
        await actions.updateTemplate.mutateAsync({ id, message });
      await save.mutateAsync(current);
    });
    if (ok) {
      setDraft(null);
      setEdits({});
      setTried(false);
    }
  };

  /** A new template for this tab, to write from scratch in the preview. */
  const createTemplate = async () => {
    try {
      const { id } = await actions.saveTemplate.mutateAsync({
        name: tabLabels[kind],
        message: {
          ...blankMessage(kind),
          channel:
            settings.channel ||
            channels.find((c) => c.canPost)?.id ||
            channels[0]?.id ||
            '',
        },
        folderId: null,
      });
      editSettings({ template: id });
      toast({
        title: 'Added a new template',
        body: 'Write it in the preview. It’s in Message Studio too.',
      });
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Couldn’t add the template',
        body: e instanceof Error ? e.message : 'Try again in a moment.',
      });
    }
  };

  /** Puts a ready-made message into the template this tab sends. */
  const applyPreset = async (preset: GreetPreset) => {
    setPresetsOpen(false);
    const into = previewId;
    const target = into && messageOf(into);
    if (into && target) {
      setEdits((e) => ({
        ...e,
        [into]: {
          ...preset.message,
          name: target.name,
          channel: target.channel,
        },
      }));
      flow.clear();
      toast({
        title: `“${target.name}” now looks like ${preset.name}`,
        body: 'Change anything in the preview, then save to keep it.',
      });
      return;
    }
    try {
      const { id } = await actions.saveTemplate.mutateAsync({
        name: preset.name,
        message: {
          ...preset.message,
          channel:
            settings.channel ||
            channels.find((c) => c.canPost)?.id ||
            channels[0]?.id ||
            '',
        },
        folderId: null,
      });
      editSettings({ template: id });
      toast({
        title: `Added “${preset.name}” to your templates`,
        body: 'It’s in Message Studio too. Save to start sending it.',
      });
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Couldn’t add the template',
        body: e instanceof Error ? e.message : 'Try again in a moment.',
      });
    }
  };

  const items = templateItems(data);
  const missingTemplate =
    tried &&
    (!!settings.channel || settings.dm === 'same') &&
    !settings.template;

  return (
    <>
      <ModuleHeader
        module={module}
        sync={syncState({ paused, dirty, phase: flow.phase, on: !!saved?.on })}
        power={{
          on: current.on,
          onChange: (on) => {
            setDraft({ on, config });
            flow.clear();
          },
          disabled: paused || flow.busy,
          hint: paused
            ? 'Locked by Sparko staff'
            : current.on
              ? 'Sends messages after you save'
              : 'Not sending anything',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel="Welcome messages are live"
        error={flow.error}
      />
      <Tabs
        label={module.label}
        value={tab}
        onChange={setTab}
        tabs={(['join', 'leave', 'boost', 'logs'] as Tab[]).map((value) => ({
          value,
          label: tabLabels[value],
          icon: tabIcons[value].icon,
          anim: tabIcons[value].anim,
          ...(value === 'logs' ? { count: welcome.data.log.length } : {}),
        }))}
      />

      {tab === 'logs' ? (
        <GreetLog entries={welcome.data.log} channels={channels} />
      ) : (
        <InsertProvider>
          <IssueProvider value={issue}>
            <StudioDataProvider
              value={{
                serverId: server.id,
                templates: data.templates,
                folders: data.folders,
                roles: data.roles,
                sendLimit: data.sendLimit,
              }}
            >
              {channelBlocked && (
                <Notice
                  tone="danger"
                  title={`Sparko can’t post in #${channel.name}`}
                  actions={
                    <>
                      <Button size="sm" onClick={() => setFixOpen(true)}>
                        Show me how
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={checkChannel.isPending}
                        onClick={() =>
                          checkChannel.mutate(channel.id, {
                            onSuccess: () => void flow.retryApply(),
                          })
                        }
                      >
                        Check again
                      </Button>
                    </>
                  }
                >
                  It’s missing Send Messages and Embed Links there, so the{' '}
                  {greetNames[kind]} can’t be sent. Fix it in Discord, or pick
                  another channel.
                </Notice>
              )}
              <div className="sp-studio__grid">
                {previewing && previewId ? (
                  <fieldset className="sp-fieldset" disabled={paused}>
                    <legend className="sp-sr-only">Message</legend>
                    <MessageCanvas
                      key={previewId}
                      server={server}
                      message={previewing}
                      tried={tried}
                      headingId="greet-preview"
                      memberVariables
                      check={(m) => ({ ...m, channel: '1' })}
                      onChange={(patch) => editTemplate(previewId, patch)}
                      above={
                        <p className="sp-edit-banner" role="status">
                          <Icon name="info" size="sm" />
                          <span>
                            Editing <b>{previewing.name}</b> from Message
                            Studio. Changes are saved to the template.
                          </span>
                          {twoMessages && settings.template && (
                            <Segmented
                              label="Message to preview"
                              className="sp-greet-side"
                              value={side}
                              onChange={setSide}
                              options={[
                                { value: 'channel', label: 'Channel' },
                                { value: 'dm', label: 'DM' },
                              ]}
                            />
                          )}
                        </p>
                      }
                    />
                  </fieldset>
                ) : (
                  <section
                    className="sp-card sp-greet-empty"
                    aria-label="Live preview"
                  >
                    <EmptyState
                      icon={<EditingIcon />}
                      title={`Pick a template for the ${greetNames[kind]}`}
                      actions={
                        <div className="sp-greet-start">
                          <AnimatedIconButton
                            reveal={plusAnimations.reveal}
                            hover={plusAnimations.hover}
                            select={plusAnimations.select}
                            disabled={paused}
                            loading={actions.saveTemplate.isPending}
                            onClick={() => void createTemplate()}
                          >
                            Create new template
                          </AnimatedIconButton>
                          <SparkleButton
                            variant="primary"
                            size="sm"
                            disabled={paused}
                            onClick={() => setPresetsOpen(true)}
                          >
                            Use a default template
                          </SparkleButton>
                        </div>
                      }
                    >
                      Its live preview shows here, and you can edit it right in
                      the preview. Templates are made in Message Studio.
                    </EmptyState>
                  </section>
                )}

                <fieldset
                  className="sp-stack sp-studio__side sp-fieldset"
                  disabled={paused}
                >
                  <legend className="sp-sr-only">
                    {tabLabels[kind]} settings
                  </legend>
                  <GreetSettingsCard
                    kind={kind}
                    settings={config[kind]}
                    join={config.join}
                    items={items}
                    channels={channels}
                    missingTemplate={missingTemplate}
                    channelBlocked={channelBlocked}
                    onChange={editSettings}
                    onPresets={() => setPresetsOpen(true)}
                  />
                </fieldset>
              </div>
              <PresetPicker
                open={presetsOpen}
                kind={kind}
                serverId={server.id}
                replacing={previewing?.name}
                busy={actions.saveTemplate.isPending}
                onClose={() => setPresetsOpen(false)}
                onPick={(p) => void applyPreset(p)}
              />
            </StudioDataProvider>
          </IssueProvider>
        </InsertProvider>
      )}

      <FixPermissionModal
        open={fixOpen}
        {...fixes.channel(channel?.name ?? 'the channel')}
        checking={checkChannel.isPending}
        onCheck={() =>
          channel &&
          checkChannel.mutate(channel.id, {
            onSuccess: () => {
              setFixOpen(false);
              void flow.retryApply();
            },
          })
        }
        onClose={() => setFixOpen(false)}
      />
      <ModuleSaveBar
        visible={dirty && !paused}
        saving={flow.phase === 'saving'}
        error={flow.saveError}
        onReset={() => {
          setDraft(null);
          setEdits({});
          setTried(false);
        }}
        onSave={() => void doSave()}
      />
    </>
  );
}

const NONE = 'none';

function GreetSettingsCard({
  kind,
  settings,
  join,
  items,
  channels,
  missingTemplate,
  channelBlocked,
  onChange,
  onPresets,
}: {
  kind: GreetKind;
  settings: GreetSettings;
  join: WelcomeConfig['join'];
  items: ComboItem[];
  channels: Channel[];
  missingTemplate: boolean;
  channelBlocked: boolean;
  onChange: (patch: Partial<WelcomeConfig['join']>) => void;
  onPresets: () => void;
}) {
  const title = tabLabels[kind];
  const sends = !!settings.channel || settings.dm !== 'none';
  return (
    <section className="sp-card" aria-labelledby={`greet-${kind}`}>
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id={`greet-${kind}`}>
            {title}
          </h2>
          <p className="sp-card__sub">
            {kind === 'join'
              ? 'Sent the moment someone joins.'
              : kind === 'leave'
                ? 'Sent when someone leaves the server.'
                : 'Sent when someone boosts the server.'}
          </p>
        </div>
        {sends ? (
          <Badge tone="success" size="sm">
            On
          </Badge>
        ) : (
          <Badge size="sm">Off</Badge>
        )}
      </div>
      <div className="sp-card__body">
        <div data-issue="greet-template">
          <Combobox
            label={
              <>
                Message template{' '}
                <InfoTip text="The Message Studio template Sparko sends. Edit it in the preview, or in Message Studio." />
              </>
            }
            searchPlaceholder="Search templates"
            placeholder="Pick a template"
            value={settings.template}
            onChange={(template) => onChange({ template })}
            error={missingTemplate ? 'Pick a template to send.' : undefined}
            footer="Make more templates in Message Studio."
            items={items}
          />
        </div>
        <div className="sp-greet-row">
          <Combobox
            label="Channel"
            searchPlaceholder="Search channels"
            value={settings.channel || NONE}
            onChange={(id) => onChange({ channel: id === NONE ? '' : id })}
            error={channelBlocked ? 'Sparko can’t post here yet.' : undefined}
            footer="Locked channels are ones Sparko can’t post in yet."
            items={[
              {
                value: NONE,
                label: 'No sending in a channel',
                icon: 'ban',
                group: 'Options',
              },
              ...channels.map((c) => ({
                value: c.id,
                label: c.name,
                icon: 'hash',
                group: c.category,
                disabled: !c.canPost && c.id !== settings.channel,
                ...(c.canPost ? {} : { note: 'Sparko can’t post' }),
              })),
            ]}
          />
          <Combobox
            label={
              <>
                DM the member{' '}
                <InfoTip text="Sends a direct message too. People who don’t accept DMs from the server won’t get it; the log says so." />
              </>
            }
            searchPlaceholder="Search templates"
            value={settings.dm}
            onChange={(dm) => onChange({ dm })}
            items={[
              {
                value: 'none',
                label: 'No DM user',
                icon: 'ban',
                group: 'Options',
              },
              {
                value: 'same',
                label: 'Same template sent in channel',
                icon: 'copy',
                group: 'Options',
              },
              ...items,
            ]}
          />
        </div>
        <div className="sp-greet-checks">
          {kind === 'join' && (
            <>
              <Checkbox
                checked={join.rejoin}
                onChange={(rejoin) => onChange({ rejoin })}
                label="Welcome again if they rejoin"
                description="Off means someone who leaves and comes back isn’t greeted twice."
              />
              <Checkbox
                checked={join.waitForRules}
                onChange={(waitForRules) => onChange({ waitForRules })}
                label="Wait until they accept the rules"
                description="For servers with Rules Screening: they’re welcomed once they agree."
              />
            </>
          )}
          {kind !== 'leave' && (
            <Checkbox
              checked={settings.ping}
              onChange={(ping) => onChange({ ping })}
              label="Mention user"
              description="On: mentioning {user} notifies them. Off: mentions show, but nobody is notified."
            />
          )}
        </div>
        <Combobox
          label="Delete the channel message"
          searchable={false}
          value={String(settings.deleteAfter)}
          disabled={!settings.channel}
          hint={
            settings.channel
              ? undefined
              : 'Pick a channel first: DMs are never deleted.'
          }
          onChange={(v) => onChange({ deleteAfter: Number(v) })}
          items={deleteAfterChoices.map((s) => ({
            value: String(s),
            label: deleteLabels[s] ?? `${s} seconds`,
          }))}
        />
        <SparkleButton onClick={onPresets}>Use default templates</SparkleButton>
      </div>
    </section>
  );
}

/** What kind of message a ready-made one is; plain text works as either. */
const presetKind = (p: GreetPreset) =>
  p.message.layout === 'v2'
    ? 'V2 components'
    : p.message.embeds.length
      ? 'Embed message'
      : 'Any kind';

/** Ready-made messages, shown as they look, to start from. */
function PresetPicker({
  open,
  kind,
  serverId,
  replacing,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  kind: GreetKind;
  serverId: string;
  /** The template a pick goes into, if there is one. */
  replacing: string | undefined;
  busy: boolean;
  onClose: () => void;
  onPick: (preset: GreetPreset) => void;
}) {
  const [shown, setShown] = useState<GreetKind>(kind);
  // Opening again starts on the tab's own kind.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setShown(kind);
  }
  const noop = () => {};
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={
        <RevealIcon anim={animIcons.sparkle} fallback="sparkles" size={22} />
      }
      title="Default templates"
      description={
        replacing
          ? `Picking one puts it into “${replacing}”. Nothing is saved until you save.`
          : 'Picking one adds it to your Message Studio templates and uses it here.'
      }
    >
      <Segmented
        label="Kind of message"
        value={shown}
        onChange={setShown}
        options={greetKinds.map((k) => ({
          value: k,
          label: tabLabels[k].replace(' message', ''),
        }))}
      />
      <div className="sp-presets">
        {greetPresets
          .filter((p) => p.kind === shown)
          .map((p) => (
            <div key={p.id} className="sp-preset">
              <span className="sp-preset__kind">{presetKind(p)}</span>
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

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** One log line, like "[WM] Sent “Welcome card” to #welcome (8000…)". */
export function logLine(e: GreetLogEntry, channels: Channel[]) {
  const name = channels.find((c) => c.id === e.channelId)?.name;
  const to = e.channelId
    ? `${name ? `#${name}` : 'a channel'} (${e.channelId})`
    : `@${e.memberName} by DM`;
  return e.ok
    ? `[${greetCodes[e.kind]}] Sent “${e.template}” to ${to}`
    : `[${greetCodes[e.kind]}] Failed to send “${e.template}” to ${to}, reason: ${e.reason}`;
}

function GreetLog({
  entries,
  channels,
}: {
  entries: GreetLogEntry[];
  channels: Channel[];
}) {
  const [filter, setFilter] = useState<GreetKind | 'all'>('all');
  const shown = entries.filter((e) => filter === 'all' || e.kind === filter);
  return (
    <section className="sp-card" aria-labelledby="greet-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="greet-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every join, leave and boost message Sparko sent or couldn’t send. WM
            is a welcome, LM a leave and BM a boost message.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            ...greetKinds.map((k) => ({ value: k, label: greetCodes[k] })),
          ]}
        />
      </div>
      {shown.length ? (
        <ol className="sp-greet-log">
          {shown.map((e) => (
            <li
              key={e.id}
              className={cx('sp-greet-log__row', !e.ok && 'is-failed')}
            >
              <Icon
                name={e.ok ? 'circle-check' : 'circle-x'}
                size="sm"
                className="sp-greet-log__icon"
              />
              <span className="sp-greet-log__text">{logLine(e, channels)}</span>
              <span className="sp-greet-log__meta">
                for {e.memberName} · {when(e.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon="scroll-text" title="Nothing yet">
          When Sparko sends a join, leave or boost message, it shows here.
        </EmptyState>
      )}
    </section>
  );
}
