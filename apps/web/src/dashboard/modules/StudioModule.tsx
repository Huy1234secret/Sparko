import { useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  Icon,
  Input,
  Notice,
  Segmented,
  Switch,
  useToast,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  planProblem,
  studioPayload,
  studioProblem,
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
import { BlockSettings, V2Canvas, newBlock, v2Issue } from './StudioCanvas';
import { StudioLibrary } from './StudioLibrary';
import { ChannelPicker, ColourChoice, VersionHistory } from './parts';
import { EmbedCanvas, MAX_EMBEDS, newEmbed } from './EmbedCanvas';
import {
  StudioDataProvider,
  newButton,
  newMenu,
  roomFor,
} from './ComponentsEditor';
import { InsertProvider, useInsertTarget } from './EditorBits';
import { EmojiButton } from './EmojiPicker';
import { PlusMenu, type PlusItem } from './PlusMenu';

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

function Info({ text }: { text: string }) {
  return (
    <span className="sp-info-tip" title={text} aria-label={text} role="img">
      <Icon name="info" size="sm" />
    </span>
  );
}

/** The emoji button and the plus menu above the preview. */
function PreviewTools({
  serverId,
  items,
  onEmoji,
}: {
  serverId: string;
  items: PlusItem[];
  onEmoji: (text: string) => void;
}) {
  const target = useInsertTarget();
  return (
    <div className="sp-preview-tools">
      <EmojiButton
        serverId={serverId}
        onPick={(text) => {
          const insert = target.get();
          if (insert) insert(text);
          else onEmoji(text);
        }}
      />
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
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const paused = !!server.paused;
  const v2 = message.layout === 'v2';
  const channel = channels.find((c) => c.id === message.channel);
  const locked = !!channel && !channel.canPost;
  const problem = v2
    ? v2Issue(message.v2)
    : (studioProblem(forChecks(message)) ??
      planProblem(message, server.plan === 'plus' ? 'plus' : 'free'));
  const size = embedSize(message);
  const json = JSON.stringify(studioPayload(message, { now: 0 }), null, 2);

  const addBlock = (type: Parameters<typeof newBlock>[0]) => {
    const block = newBlock(type);
    onChange({ v2: { ...message.v2, blocks: [...message.v2.blocks, block] } });
    setSelected(block.id);
  };
  const items: PlusItem[] = v2
    ? [
        ...(message.v2.container
          ? []
          : [
              {
                label: 'Add container',
                onSelect: () =>
                  onChange({ v2: { ...message.v2, container: true } }),
              },
            ]),
        { label: 'Add text', onSelect: () => addBlock('text') },
        { label: 'Add button', onSelect: () => addBlock('buttons') },
        { label: 'Add image', onSelect: () => addBlock('gallery') },
        { label: 'Add separator', onSelect: () => addBlock('separator') },
      ].map((item) => ({
        ...item,
        disabled: message.v2.blocks.length >= 30,
        note: 'A message holds up to 30 blocks.',
      }))
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
          note: 'Discord shows up to 5 rows of buttons and menus.',
          onSelect: () => {
            const button = newButton();
            onChange({ components: [...message.components, button] });
            setFocus({ id: button.id });
          },
        },
        {
          label: 'Add menu',
          disabled: !roomFor(message.components, 'menu'),
          note: 'Discord shows up to 5 rows of buttons and menus.',
          onSelect: () => {
            const menu = newMenu();
            onChange({ components: [...message.components, menu] });
            setFocus({ id: menu.id });
          },
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
              setSelected(null);
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
              onEmoji={(text) =>
                onChange({ content: (message.content + text).slice(0, 2000) })
              }
            />
          </div>
          <fieldset className="sp-fieldset" disabled={paused}>
            <legend className="sp-sr-only">Message</legend>
            {v2 ? (
              <div className="dc-chat">
                <V2Canvas
                  v2={message.v2}
                  onChange={(next) => onChange({ v2: next })}
                  selected={selected}
                  onSelect={setSelected}
                  disabled={paused}
                />
              </div>
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
                label="Template name"
                maxLength={80}
                value={message.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
              <div className="sp-post-row">
                <ChannelPicker
                  label="Post in"
                  channels={channels}
                  value={message.channel}
                  onChange={(id) => onChange({ channel: id })}
                  error={locked ? 'Sparko can’t post here yet.' : undefined}
                />
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
              <div className="sp-field">
                <div className="sp-field__row">
                  <span className="sp-label" id="studio-json">
                    Discord JSON{' '}
                    <Info text="What Sparko sends to Discord for this message. Useful with other tools." />
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={copied ? 'check' : 'copy'}
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(json)
                        .then(() => setCopied(true));
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <pre
                  className="sp-json"
                  aria-labelledby="studio-json"
                  tabIndex={0}
                >
                  {json}
                </pre>
              </div>
            </div>
          </section>

          {v2 && (
            <section className="sp-card" aria-labelledby="studio-block">
              <div className="sp-card__head">
                <div className="sp-card__titles">
                  <h2 className="sp-card__title" id="studio-block">
                    Box and selected block
                  </h2>
                  <p className="sp-card__sub">
                    {message.v2.blocks.length} of 30 blocks
                  </p>
                </div>
                <Switch
                  checked={message.v2.container}
                  onChange={(container) =>
                    onChange({ v2: { ...message.v2, container } })
                  }
                  description="Wrap in a box"
                />
              </div>
              <div className="sp-card__body">
                {message.v2.container && (
                  <div className="sp-field">
                    <span className="sp-label">Colour bar</span>
                    <ColourChoice
                      value={message.v2.accent}
                      onChange={(accent) =>
                        onChange({ v2: { ...message.v2, accent } })
                      }
                    />
                  </div>
                )}
                <BlockSettings
                  block={message.v2.blocks.find((b) => b.id === selected)}
                  onChange={(block) =>
                    onChange({
                      v2: {
                        ...message.v2,
                        blocks: message.v2.blocks.map((b) =>
                          b.id === block.id ? block : b,
                        ),
                      },
                    })
                  }
                />
              </div>
            </section>
          )}
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

  const template = studio.data?.templates.find((t) => t.id === editingId);
  // The template as saved; its name is the template's own.
  const saved = template && { ...template.message, name: template.name };
  const message = saved ? (draft ?? saved) : null;
  const dirty = !!saved && JSON.stringify(message) !== JSON.stringify(saved);

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
  const save = () => {
    if (!template || !message) return;
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
    const problem =
      message.layout === 'v2'
        ? v2Issue(message.v2)
        : (studioProblem(forChecks(message)) ??
          planProblem(message, server.plan === 'plus' ? 'plus' : 'free'));
    if (problem) return;
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
