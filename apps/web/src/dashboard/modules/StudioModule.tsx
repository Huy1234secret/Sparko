import { useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  Icon,
  Input,
  Notice,
  Segmented,
  useToast,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  planIssue,
  planProblem,
  studioIssue,
  studioProblem,
  type StudioIssue,
  useCheckChannel,
  useStudio,
  useStudioActions,
  type Server,
  type StudioMessage,
} from '../../data';
import { FixPermissionModal, fixes } from '../FixPermissionModal';
import {
  ModuleHeader,
  ModuleSaveBar,
  ModuleTabs,
  PausedNotice,
  SavePipeline,
  syncState,
  useModuleTab,
  useSaveFlow,
} from './frame';
import { ContainerCanvas, MAX_GALLERY, newImage } from './ContainerCanvas';
import { VariablesButton, variablesAnimations } from './VariablesButton';
import { JsonPanel, jsonAnimations } from './JsonPanel';
import { StudioLibrary } from './StudioLibrary';
import { ChannelPicker, VersionHistory } from './parts';
import { EmbedCanvas, MAX_EMBEDS, newEmbed } from './EmbedCanvas';
import {
  StudioDataProvider,
  newButton,
  newMenu,
  roomFor,
} from './ComponentsEditor';
import {
  InfoTip,
  InsertProvider,
  IssueProvider,
  flashIssue,
  useInsertTarget,
  type ShownIssue,
} from './EditorBits';
import { EmojiButton } from './EmojiPicker';
import { PlusMenu, type PlusItem } from './PlusMenu';
import { preloadAnimations, preloadCombobox } from '../../ui';

// Every animated icon on this page, fetched ahead so none waits on first use.
const icons = import.meta.glob<string>(
  [
    '../../../../../design-system/assets/icons/animated-icons/{edit,clone,remove,upload,plus,plus-menu,setting,close,folder,image}-*.json',
    '../../../../../design-system/assets/icons/{close-button-hover,folder-icon-add}.json',
  ],
  { query: '?url', import: 'default', eager: true },
);

/** Characters Discord counts toward the 6,000 shared by a message's embeds. */
const embedSize = (m: StudioMessage) =>
  m.embeds.reduce(
    (n, e) =>
      n +
      e.author.length +
      e.title.length +
      e.description.length +
      e.footer.length +
      e.fields.reduce((k, f) => k + f.name.length + f.value.length, 0),
    0,
  );

/** Pictures uploaded in the sample data live in this browser, as blob: links. */
const forChecks = (m: StudioMessage): StudioMessage =>
  JSON.parse(
    JSON.stringify(m).replace(/"blob:[^"]*"/g, '"https://upload.invalid"'),
  ) as StudioMessage;

/** The variables and emoji buttons and the plus menu above the preview. */
function PreviewTools({
  serverId,
  items,
  onEmoji,
  v2,
}: {
  serverId: string;
  items: PlusItem[];
  onEmoji: (text: string) => void;
  v2: boolean;
}) {
  const target = useInsertTarget();
  // Goes where the person was last writing, or at the end of the text.
  const put = (text: string) => {
    const insert = target.get();
    if (insert) insert(text);
    else onEmoji(text);
  };
  return (
    <div className="sp-preview-tools">
      <VariablesButton v2={v2} onPick={put} />
      <EmojiButton serverId={serverId} onPick={put} />
      <PlusMenu items={items} />
    </div>
  );
}

function StudioEditor({
  server,
  message,
  channels,
  saving,
  dirty,
  tried,
  phase,
  onChange,
  onSave,
  onPost,
  onFix,
  onCheck,
  checking,
}: {
  server: Server;
  message: StudioMessage;
  channels: { id: string; name: string; category: string; canPost: boolean }[];
  saving: boolean;
  dirty: boolean;
  tried: boolean;
  phase: string;
  onChange: (patch: Partial<StudioMessage>) => void;
  onSave: () => void;
  onPost: () => void;
  onFix: () => void;
  onCheck: () => void;
  checking: boolean;
}) {
  const [focus, setFocus] = useState<{
    id: string;
    pop?: 'image';
  } | null>(null);
  const paused = !!server.paused;
  const v2 = message.layout === 'v2';
  const channel = channels.find((c) => c.id === message.channel);
  const locked = !!channel && !channel.canPost;
  const problem =
    studioProblem(forChecks(message)) ??
    planProblem(message, server.plan === 'plus' ? 'plus' : 'free');
  const size = embedSize(message);

  const addButton = () => {
    const button = newButton();
    onChange({ components: [...message.components, button] });
    setFocus({ id: button.id });
  };
  const addMenu = () => {
    const menu = newMenu();
    onChange({ components: [...message.components, menu] });
    setFocus({ id: menu.id });
  };
  const rows = 'Discord shows up to 5 rows of buttons and menus.';
  const items: PlusItem[] = v2
    ? [
        {
          label: 'Add image',
          disabled: message.v2.gallery.length >= MAX_GALLERY,
          note: 'A gallery holds up to 10 images.',
          onSelect: () => {
            const image = newImage();
            onChange({
              v2: { ...message.v2, gallery: [...message.v2.gallery, image] },
            });
            setFocus({ id: image.id });
          },
        },
        {
          label: 'Add button',
          disabled: !roomFor(message.components, 'button'),
          note: rows,
          onSelect: addButton,
        },
        {
          label: 'Add menu',
          disabled: !roomFor(message.components, 'menu'),
          note: rows,
          onSelect: addMenu,
        },
        {
          label: 'Add separator',
          onSelect: () =>
            onChange({
              v2: {
                ...message.v2,
                text: `${message.v2.text}\n{separator}\n`.slice(0, 4000),
              },
            }),
        },
      ]
    : [
        {
          label: 'Add embed',
          disabled: message.embeds.length >= MAX_EMBEDS,
          note: 'A message holds up to 10 embeds.',
          onSelect: () => onChange({ embeds: [...message.embeds, newEmbed()] }),
        },
        {
          label: 'Add button',
          disabled: !roomFor(message.components, 'button'),
          note: rows,
          onSelect: addButton,
        },
        {
          label: 'Add menu',
          disabled: !roomFor(message.components, 'menu'),
          note: rows,
          onSelect: addMenu,
        },
        {
          label: 'Add image',
          disabled: message.embeds.length >= MAX_EMBEDS,
          note: 'A message holds up to 10 embeds.',
          // An image on its own is an embed with only a picture in it.
          onSelect: () => {
            const embed = newEmbed();
            onChange({ embeds: [...message.embeds, embed] });
            setFocus({ id: embed.id, pop: 'image' });
          },
        },
      ];

  return (
    <div className="sp-studio">
      {locked && (
        <Notice
          tone="danger"
          title={`Sparko can’t post in #${channel.name}`}
          actions={
            <>
              <Button size="sm" onClick={onFix}>
                Show me how
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={checking}
                onClick={onCheck}
              >
                Check again
              </Button>
            </>
          }
        >
          It’s missing Send Messages and Embed Links there. Fix it in Discord,
          or pick another channel.
        </Notice>
      )}
      <div className="sp-studio__grid">
        <section className="sp-studio__canvas" aria-labelledby="studio-preview">
          <Segmented
            label="Message type"
            className="sp-studio__type"
            value={message.layout}
            onChange={(layout) => {
              onChange({ layout });
            }}
            options={[
              { value: 'embed', label: 'Embed message' },
              { value: 'v2', label: 'V2 components' },
            ]}
          />
          <div className="sp-preview-head">
            <h2 id="studio-preview" className="sp-section-title">
              Live preview
            </h2>
            <PreviewTools
              serverId={server.id}
              items={items}
              v2={v2}
              onEmoji={(text) =>
                v2
                  ? onChange({
                      v2: {
                        ...message.v2,
                        text: (message.v2.text + text).slice(0, 4000),
                      },
                    })
                  : onChange({
                      content: (message.content + text).slice(0, 2000),
                    })
              }
            />
          </div>
          <fieldset
            className="sp-fieldset"
            disabled={paused}
            data-issue="message"
          >
            <legend className="sp-sr-only">Message</legend>
            {v2 ? (
              <ContainerCanvas
                message={message}
                serverId={server.id}
                onChange={onChange}
                focusId={focus?.id ?? null}
              />
            ) : (
              <EmbedCanvas
                message={message}
                serverId={server.id}
                onChange={onChange}
                focus={focus}
              />
            )}
          </fieldset>
          {tried && problem && (
            <p className="sp-field-error">
              <Icon name="circle-alert" />
              {problem}
            </p>
          )}
          {!v2 && message.embeds.length > 0 && (
            <div className="sp-embed-size">
              <div className="sp-field__row">
                <span className="sp-hint">Embed size</span>
                <span className="sp-hint sp-tnum">
                  {size.toLocaleString('en-US')} / 6,000
                </span>
              </div>
              <div
                className="sp-progress sp-progress--sm"
                role="progressbar"
                aria-label="Embed characters used"
                aria-valuenow={size}
                aria-valuemin={0}
                aria-valuemax={6000}
              >
                <span
                  className={
                    'sp-progress__bar' + (size > 6000 ? ' is-over' : '')
                  }
                  style={{ width: `${Math.min(100, (size / 6000) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </section>

        <div className="sp-stack sp-studio__side">
          <section className="sp-card" aria-labelledby="studio-settings">
            <div className="sp-card__head">
              <div className="sp-card__titles">
                <h2 className="sp-card__title" id="studio-settings">
                  Message settings
                </h2>
                <p className="sp-card__sub">
                  Name it, pick where it goes, and post a test.
                </p>
              </div>
              <Button
                size="sm"
                variant={dirty ? 'primary' : 'secondary'}
                loading={saving}
                disabled={!dirty || paused}
                onClick={onSave}
              >
                Save template
              </Button>
            </div>
            <div className="sp-card__body">
              <Input
                data-issue="name"
                label={
                  <>
                    Template name{' '}
                    <InfoTip text="Only staff see this name. It’s how the template shows in Templates and when a button sends it." />
                  </>
                }
                maxLength={80}
                value={message.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
              <div className="sp-post-row">
                <div data-issue="channel">
                  <ChannelPicker
                    label="Post in"
                    channels={channels}
                    value={message.channel}
                    onChange={(id) => onChange({ channel: id })}
                    error={locked ? 'Sparko can’t post here yet.' : undefined}
                  />
                </div>
                <Button
                  variant="primary"
                  icon="send"
                  loading={phase === 'saving' || phase === 'applying'}
                  loadingLabel="Posting…"
                  disabled={paused || !message.channel}
                  onClick={onPost}
                >
                  Post test
                </Button>
              </div>
              <JsonPanel
                message={message}
                onChange={(next) => onChange(next)}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function StudioModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const studio = useStudio(server.id);
  const actions = useStudioActions(server.id);
  const checkChannel = useCheckChannel(server.id);
  const flow = useSaveFlow(server.id, 'studio');
  const [tab, setTab] = useModuleTab();
  // The template open in the editor, and its unsaved changes.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudioMessage | null>(null);
  const [tried, setTried] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const toast = useToast();
  // A problem found on saving or posting: the page goes to it and flashes
  // it red, and a button or menu with the problem opens its settings.
  const [issue, setIssue] = useState<ShownIssue | null>(null);
  useEffect(() => {
    if (!issue) return;
    // Two frames: one for settings panels to open, one for them to draw.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => flashIssue(issue.at));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [issue]);

  const template = studio.data?.templates.find((t) => t.id === editingId);
  // The template as saved; its name is the template's own.
  const saved = template && { ...template.message, name: template.name };
  const message = saved ? (draft ?? saved) : null;
  const dirty = !!saved && JSON.stringify(message) !== JSON.stringify(saved);

  useEffect(() => {
    preloadAnimations(Object.values(icons));
    preloadAnimations(variablesAnimations, true);
    preloadAnimations(jsonAnimations);
    preloadCombobox();
  }, []);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (studio.isPending)
    return (
      <div className="sp-stack" aria-busy="true" aria-label="Loading">
        <span className="sp-skel sp-skel--title" />
        <div className="sp-skel sp-skel--block" style={{ height: 320 }} />
      </div>
    );
  if (studio.isError)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Message Studio"
          actions={
            <Button onClick={() => void studio.refetch()}>Try again</Button>
          }
        />
      </div>
    );

  const paused = !!server.paused;
  const channels = studio.data.channels;
  const channel = channels.find((c) => c.id === message?.channel);

  const open = (id: string, next: StudioMessage) => {
    setEditingId(id);
    setDraft(next);
    setTried(false);
    flow.clear();
    setTab('settings');
  };
  const edit = (patch: Partial<StudioMessage>) => {
    if (!message) return;
    setDraft({ ...message, ...patch });
    flow.clear();
  };
  const blocked = (m: StudioMessage, doing: string) => {
    const found: StudioIssue | null =
      studioIssue(forChecks(m)) ??
      planIssue(m, server.plan === 'plus' ? 'plus' : 'free');
    if (!found) return false;
    setTried(true);
    setIssue((i) => ({ at: found.at, n: (i?.n ?? 0) + 1 }));
    toast({ tone: 'danger', title: `Can’t ${doing} yet`, body: found.problem });
    return true;
  };

  const save = () => {
    if (!template || !message) return;
    if (blocked(message, 'save')) return;
    const name = message.name.trim() || template.name;
    actions.updateTemplate.mutate(
      { id: template.id, name, message: { ...message, name } },
      {
        onSuccess: () => {
          setDraft(null);
          toast({ tone: 'success', title: `Saved “${name}”` });
        },
        onError: (e) =>
          toast({
            tone: 'danger',
            title: 'Couldn’t save the template',
            body: e instanceof Error ? e.message : 'Try again in a moment.',
          }),
      },
    );
  };
  const post = async () => {
    if (!message) return;
    setTried(true);
    if (blocked(message, 'post')) return;
    await flow.run(() => actions.postTest.mutateAsync(message));
  };
  const recheck = (after?: () => void) =>
    channel &&
    checkChannel.mutate(channel.id, {
      onSuccess: () => {
        after?.();
        void flow.retryApply();
      },
    });

  return (
    <>
      <ModuleHeader
        module={module}
        sync={syncState({ paused, dirty, phase: flow.phase, on: true })}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel={`Posted in #${channel?.name ?? ''}`}
        error={flow.error}
      />
      <ModuleTabs
        module={module}
        tab={tab}
        onChange={setTab}
        labels={['Editor', 'Templates', 'Versions']}
        counts={[
          undefined,
          studio.data.templates.length,
          studio.data.versions.length,
        ]}
      />

      {tab === 'settings' &&
        (template && message ? (
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
                <p className="sp-edit-banner" role="status">
                  <Icon name="info" size="sm" />
                  <span>
                    You’re editing <b>{template.name}</b>. Save your changes
                    before you leave.
                  </span>
                </p>
                <StudioEditor
                  server={server}
                  message={message}
                  channels={channels}
                  saving={actions.updateTemplate.isPending}
                  dirty={dirty}
                  tried={tried}
                  phase={flow.phase}
                  onChange={edit}
                  onSave={save}
                  onPost={() => void post()}
                  onFix={() => setFixOpen(true)}
                  onCheck={() => recheck()}
                  checking={checkChannel.isPending}
                />
              </StudioDataProvider>
            </IssueProvider>
          </InsertProvider>
        ) : (
          <div className="sp-card">
            <EmptyState
              icon="square-pen"
              title="Select a template to start editing!"
              actions={
                <Button variant="primary" onClick={() => setTab('items')}>
                  Open templates
                </Button>
              }
            >
              Pick one with Edit in Templates, or add a new one there.
            </EmptyState>
          </div>
        ))}

      {tab === 'items' && (
        <StudioLibrary
          server={server}
          studio={studio.data}
          current={message ?? studio.data.message}
          editingId={template?.id ?? null}
          onEdit={(t) => {
            open(t.id, { ...t.message, name: t.name });
            toast({
              title: `Editing “${t.name}”`,
              body: 'Save template keeps your changes; Post test sends it.',
            });
          }}
        />
      )}

      {tab === 'history' && (
        <VersionHistory
          title="Versions"
          description="Every post is kept. Restoring loads it into the template that’s open in the editor; nothing changes until you save."
          versions={studio.data.versions}
          currentLabel="Last posted"
          onRestore={(restored) => {
            if (!template) {
              toast({
                tone: 'danger',
                title: 'Open a template first',
                body: 'Restoring loads a version into the template you’re editing.',
              });
              return;
            }
            open(template.id, {
              ...restored,
              name: message?.name ?? template.name,
            });
          }}
        />
      )}

      <FixPermissionModal
        open={fixOpen}
        {...fixes.channel(channel?.name ?? 'the channel')}
        checking={checkChannel.isPending}
        onCheck={() => recheck(() => setFixOpen(false))}
        onClose={() => setFixOpen(false)}
      />
      <ModuleSaveBar
        visible={dirty && !paused}
        saving={actions.updateTemplate.isPending}
        saveLabel="Save template"
        error={null}
        onReset={() => setDraft(null)}
        onSave={save}
      />
    </>
  );
}
