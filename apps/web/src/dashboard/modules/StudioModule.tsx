import { useEffect, useState } from 'react';
import { Button, EmptyState, Icon, Input, Notice, useToast } from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  nameTaken,
  parseMessageLink,
  planIssue,
  studioIssue,
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
  editorTabIcons,
  useModuleTab,
  useSaveFlow,
  ModuleSkeleton,
  SkelEditor,
} from './frame';
import { variablesAnimations } from './VariablesButton';
import { JsonPanel, jsonAnimations } from './JsonPanel';
import { StudioLibrary } from './StudioLibrary';
import { ChannelPicker, VersionHistory } from './parts';
import { MessageCanvas, forChecks } from './MessageCanvas';
import { StudioDataProvider } from './ComponentsEditor';
import {
  InfoTip,
  EditingIcon,
  InsertProvider,
  IssueProvider,
  flashIssue,
  type ShownIssue,
} from './EditorBits';
import { preloadAnimations, preloadCombobox } from '../../ui';

// Every animated icon on this page, fetched ahead so none waits on first use.
const icons = import.meta.glob<string>(
  [
    '../../../../../design-system/assets/icons/animated-icons/{edit,clone,remove,upload,plus,plus-menu,setting,close,folder,image}-*.json',
    '../../../../../design-system/assets/icons/{close-button-hover,folder-icon-add}.json',
  ],
  { query: '?url', import: 'default', eager: true },
);

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
  onEdit,
  onFix,
  onCheck,
  checking,
  uses = [],
}: {
  server: Server;
  message: StudioMessage;
  /** Where else the template is used, so its variables work here too. */
  uses?: string[];
  channels: { id: string; name: string; category: string; canPost: boolean }[];
  saving: boolean;
  dirty: boolean;
  tried: boolean;
  phase: string;
  onChange: (patch: Partial<StudioMessage>) => void;
  onSave: () => void;
  onPost: () => void;
  /** Turns the message at this link into the template. */
  onEdit: (link: string) => void;
  onFix: () => void;
  onCheck: () => void;
  checking: boolean;
}) {
  const paused = !!server.paused;
  // A link to a message Sparko sent, to turn into this template.
  const [link, setLink] = useState('');
  const target = parseMessageLink(link);
  const linkError = !link.trim()
    ? undefined
    : !target
      ? 'Paste a message link: right-click a message in Discord and pick Copy Message Link.'
      : target.guildId !== server.id
        ? 'That message is in another server.'
        : undefined;
  const channel = channels.find((c) => c.id === message.channel);
  const locked = !!channel && !channel.canPost;

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
        <MessageCanvas
          server={server}
          message={message}
          tried={tried}
          onChange={onChange}
          roleVariables={uses.includes('reaction-role')}
          suggestionVariables={uses.includes('suggestion')}
          birthdayVariables={uses.includes('birthday')}
          questionVariables={uses.includes('question')}
          inviteVariables={uses.includes('invite')}
        />

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
              <div className="sp-post-row" data-issue="link">
                <Input
                  label={
                    <>
                      Edit message{' '}
                      <InfoTip text="Turns a message Sparko already sent into this template. It keeps its place and its link. In Discord, right-click the message, pick Copy Message Link, and paste it here." />
                    </>
                  }
                  placeholder="https://discord.com/channels/…"
                  inputMode="url"
                  value={link}
                  error={linkError}
                  onChange={(e) => setLink(e.target.value)}
                />
                <Button
                  icon="square-pen"
                  loading={phase === 'saving' || phase === 'applying'}
                  loadingLabel="Editing…"
                  disabled={paused || !target || !!linkError}
                  onClick={() => onEdit(link.trim())}
                >
                  Edit message
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
  // What the last send did, for the progress line.
  const [done, setDone] = useState<'post' | 'edit'>('post');
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
      <ModuleSkeleton module={module}>
        <SkelEditor />
      </ModuleSkeleton>
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
    if (nameTaken(studio.data?.templates ?? [], name, template.id)) {
      setIssue((i) => ({ at: 'name', n: (i?.n ?? 0) + 1 }));
      toast({
        tone: 'danger',
        title: 'Can’t save yet',
        body: `A template named “${name}” already exists. Pick another name.`,
      });
      return;
    }
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
    setDone('post');
    await flow.run(() => actions.postTest.mutateAsync(message));
  };
  const editPosted = async (link: string) => {
    if (!message) return;
    setTried(true);
    if (blocked(message, 'edit the message')) return;
    setDone('edit');
    await flow.run(() => actions.editMessage.mutateAsync({ message, link }));
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
        liveLabel={
          done === 'edit'
            ? 'Message edited in Discord'
            : `Posted in #${channel?.name ?? ''}`
        }
        error={flow.error}
      />
      <ModuleTabs
        module={module}
        tab={tab}
        onChange={setTab}
        labels={['Editor', 'Templates', 'Versions']}
        icons={editorTabIcons.slice(0, 2)}
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
                  suggestion: !!template.usedIn?.some(
                    (u) => u.kind === 'suggestion',
                  ),
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
                  uses={template?.usedIn?.map((u) => u.kind) ?? []}
                  channels={channels}
                  saving={actions.updateTemplate.isPending}
                  dirty={dirty}
                  tried={tried}
                  phase={flow.phase}
                  onChange={edit}
                  onSave={save}
                  onPost={() => void post()}
                  onEdit={(link) => void editPosted(link)}
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
              icon={<EditingIcon />}
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
