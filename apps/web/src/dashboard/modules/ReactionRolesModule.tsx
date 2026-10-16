import { useEffect, useState, type CSSProperties } from 'react';
import {
  AnimatedButton,
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
  animIcons,
  cx,
  preloadCombobox,
  svgIcons,
  useToast,
  type ComboItem,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  nameTaken,
  planIssue,
  rrIssue,
  studioIssue,
  useModuleState,
  useReactionRoles,
  useRRActions,
  useSaveModule,
  useStudio,
  useStudioActions,
  type Channel,
  type ReactionRole,
  type RRDelivery,
  type RRKind,
  type RRLogEntry,
  type RRMode,
  type RRTemplate,
  type Server,
  type StudioMessage,
  type StudioState,
} from '../../data';
import {
  ModuleHeader,
  ModuleSaveBar,
  ModuleTabs,
  PausedNotice,
  SavePipeline,
  editorTabIcons,
  syncState,
  useModuleTab,
  useSaveFlow,
  ModuleSkeleton,
  SkelEditor,
} from './frame';
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
import { ChannelPicker } from './parts';
import { plusAnimations } from './StudioLibrary';
import { RRItems, RRPreview } from './RRItems';

const MODULE = 'role-menus';

const modes: { value: RRMode; label: string; note: string }[] = [
  {
    value: 'normal',
    label: 'Normal',
    note: 'Pick to get the role, pick again to remove it.',
  },
  {
    value: 'unique',
    label: 'One at a time',
    note: 'Only one role from this message at a time. Picking another swaps it.',
  },
  {
    value: 'add',
    label: 'Add only',
    note: 'Roles can’t be removed here. Good for verification.',
  },
  {
    value: 'remove',
    label: 'Remove only',
    note: 'Picking takes the role away, like leaving a ping role.',
  },
];

const deliveries: { value: RRDelivery; label: string }[] = [
  { value: 'channel', label: 'Send in channel' },
  { value: 'dm', label: 'DM the member' },
  { value: 'both', label: 'Send in channel and DM' },
];

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

/** A template's problems, ignoring its channel: reaction roles pick their own. */
const messageIssue = (m: StudioMessage, server: Server) =>
  studioIssue({ ...forChecks(m), channel: '1' }) ??
  planIssue(m, server.plan === 'plus' ? 'plus' : 'free');

export function ReactionRolesModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const rr = useReactionRoles(server.id);
  const studio = useStudio(server.id);
  const moduleState = useModuleState(server.id, MODULE);
  const saveModule = useSaveModule(server.id, MODULE);
  const actions = useRRActions(server.id);
  const studioActions = useStudioActions(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useModuleTab();
  const [editingId, setEditingId] = useState<string | null>(null);
  // Unsaved changes: the reaction role, and the Studio templates it uses.
  const [draft, setDraft] = useState<(ReactionRole & { name: string }) | null>(
    null,
  );
  const [messages, setMessages] = useState<Record<string, StudioMessage>>({});
  const [on, setOn] = useState<boolean | null>(null);
  const [tried, setTried] = useState(false);
  const [issue, setIssue] = useState<ShownIssue | null>(null);
  const [side, setSide] = useState<'claim' | 'remove'>('claim');
  const [deleting, setDeleting] = useState<RRTemplate | null>(null);

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

  const templates = rr.data?.templates ?? [];
  const template = templates.find((t) => t.id === editingId);
  const saved = template && { ...template.config, name: template.name };
  const current = template ? (draft ?? saved!) : null;
  const studioTemplates = studio.data?.templates ?? [];
  const savedMessage = (id: string): StudioMessage | undefined => {
    const t = studioTemplates.find((x) => x.id === id);
    return t && { ...t.message, name: t.name };
  };
  const messageOf = (id: string) => messages[id] ?? savedMessage(id);
  const changedMessages = Object.entries(messages).filter(
    ([id, m]) => JSON.stringify(m) !== JSON.stringify(savedMessage(id)),
  );
  const savedOn = moduleState.data?.on ?? false;
  const isOn = on ?? savedOn;
  const dirty =
    (on !== null && on !== savedOn) ||
    (!!current && JSON.stringify(current) !== JSON.stringify(saved)) ||
    changedMessages.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (rr.isPending || studio.isPending)
    return (
      <ModuleSkeleton module={module}>
        <SkelEditor fields={5} />
      </ModuleSkeleton>
    );
  if (rr.isError || studio.isError || !rr.data || !studio.data)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Reaction roles"
          actions={
            <Button
              onClick={() => {
                void rr.refetch();
                void studio.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );

  const data = rr.data;
  const paused = !!server.paused;
  const channel = data.channels.find((c) => c.id === current?.channel);

  const open = (t: RRTemplate) => {
    setEditingId(t.id);
    setDraft(null);
    setMessages({});
    setTried(false);
    flow.clear();
    setTab('settings');
  };
  const edit = (patch: Partial<ReactionRole & { name: string }>) => {
    if (!current) return;
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
    setIssue((i) => ({ at, n: (i?.n ?? 0) + 1 }));
    toast({ tone: 'danger', title, body: problem });
  };

  const doSave = async () => {
    if (current) {
      for (const [, m] of changedMessages) {
        const found = messageIssue(m, server);
        if (found)
          return point(found.at, `Can’t save “${m.name}” yet`, found.problem);
      }
      const found = rrIssue(current, {
        templates: new Set(studioTemplates.map((t) => t.id)),
        roles: new Map(data.roles.map((r) => [r.id, r.assignable !== false])),
      });
      if (found) return point(found.at, 'Can’t save yet', found.problem);
      const name = current.name.trim();
      if (!name) return point('name', 'Can’t save yet', 'Give it a name.');
      if (nameTaken(templates, name, template!.id))
        return point(
          'name',
          'Can’t save yet',
          `A reaction role named “${name}” already exists. Pick another name.`,
        );
    }
    setTried(true);
    const ok = await flow.run(async () => {
      for (const [id, message] of changedMessages)
        await studioActions.updateTemplate.mutateAsync({ id, message });
      if (on !== null && on !== savedOn) await saveModule.mutateAsync({ on });
      if (current && template) {
        const { name, ...config } = current;
        await actions.save.mutateAsync({
          id: template.id,
          name: name.trim(),
          config,
        });
      }
    });
    if (ok) {
      setDraft(null);
      setMessages({});
      setOn(null);
      setTried(false);
    }
  };

  const add = () =>
    actions.add.mutate('Reaction role', {
      onSuccess: ({ id }) => {
        setEditingId(id);
        setDraft(null);
        setMessages({});
        setTab('settings');
        toast({
          title: 'Added a reaction role',
          body: 'Its message is in Message Studio too. Save to post it.',
        });
      },
      onError: (e) =>
        toast({ tone: 'danger', title: 'Couldn’t add it', body: e.message }),
    });

  const tabs = (
    <ModuleTabs
      module={module}
      tab={tab}
      onChange={setTab}
      labels={['Editor', 'Templates', 'Logs']}
      icons={editorTabIcons}
      counts={[undefined, templates.length, data.log.length]}
    />
  );

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
          disabled: paused || flow.busy || moduleState.isPending,
          hint: paused
            ? 'Locked by Sparko staff'
            : isOn
              ? 'Members can pick roles'
              : 'Roles aren’t given out',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel={
          channel ? `Live in #${channel.name}` : 'Reaction roles are live'
        }
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>Reaction roles are off. Turn them on above to edit them.</span>
        </p>
      )}
      <div className={cx('sp-greet-body', !isOn && 'is-off')} inert={!isOn}>
        {tabs}

        {tab === 'items' && (
          <RRLibrary
            templates={templates}
            limit={data.limit}
            channels={data.channels}
            editingId={editingId}
            adding={actions.add.isPending}
            onAdd={add}
            onEdit={open}
            onClone={(t) =>
              actions.clone.mutate(t.id, {
                onSuccess: () => toast({ title: `Copied “${t.name}”` }),
                onError: (e) =>
                  toast({
                    tone: 'danger',
                    title: 'Couldn’t copy it',
                    body: e.message,
                  }),
              })
            }
            onDelete={setDeleting}
          />
        )}

        {tab === 'history' && <RRLog entries={data.log} />}

        {tab === 'settings' &&
          (current && template ? (
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
                  <RREditor
                    server={server}
                    rr={current}
                    studio={studio.data}
                    channels={data.channels}
                    roles={data.roles}
                    tried={tried}
                    side={side}
                    onSide={setSide}
                    messageOf={messageOf}
                    onChange={edit}
                    onMessage={editMessage}
                    onNewResponse={(which) =>
                      studioActions.saveTemplate.mutate(
                        {
                          name: `${current.name} ${which === 'claim' ? 'claimed' : 'removed'}`,
                          message: {
                            ...savedMessage(current.message)!,
                            name: 'Response',
                            layout: 'embed',
                            content: '',
                            components: [],
                            embeds: [
                              {
                                ...savedMessage(current.message)!.embeds[0]!,
                                id: 'e1',
                                title: '',
                                description:
                                  which === 'claim'
                                    ? 'You now have {role}.'
                                    : 'Removed {role}.',
                                fields: [],
                                image: '',
                                thumbnail: '',
                                author: '',
                                footer: '',
                              },
                            ],
                          },
                          folderId: null,
                        },
                        {
                          onSuccess: ({ id }) =>
                            edit({
                              response: { ...current.response, [which]: id },
                            }),
                        },
                      )
                    }
                  />
                </StudioDataProvider>
              </IssueProvider>
            </InsertProvider>
          ) : (
            <div className="sp-card">
              <EmptyState
                icon={<EditingIcon />}
                title="Select a reaction role to start editing!"
                actions={
                  <Button variant="primary" onClick={() => setTab('items')}>
                    Open templates
                  </Button>
                }
              >
                Pick one in Templates, or add a new one there.
              </EmptyState>
            </div>
          ))}
      </div>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        icon="trash-2"
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="Its message is taken out of Discord and nobody can pick its roles. Its message template stays in Message Studio."
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
                actions.remove.mutate(deleting.id, {
                  onSuccess: () => {
                    if (deleting.id === editingId) setEditingId(null);
                    setDeleting(null);
                  },
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

function RREditor({
  server,
  rr,
  studio,
  channels,
  roles,
  tried,
  side,
  onSide,
  messageOf,
  onChange,
  onMessage,
  onNewResponse,
}: {
  server: Server;
  rr: ReactionRole & { name: string };
  studio: StudioState;
  channels: Channel[];
  roles: NonNullable<ReturnType<typeof useReactionRoles>['data']>['roles'];
  tried: boolean;
  side: 'claim' | 'remove';
  onSide: (s: 'claim' | 'remove') => void;
  messageOf: (id: string) => StudioMessage | undefined;
  onChange: (patch: Partial<ReactionRole & { name: string }>) => void;
  onMessage: (id: string, patch: Partial<StudioMessage>) => void;
  onNewResponse: (which: 'claim' | 'remove') => void;
}) {
  const message = messageOf(rr.message);
  const responseId = rr.response[side];
  const response = responseId ? messageOf(responseId) : undefined;
  const items = templateItems(studio);
  const channel = channels.find((c) => c.id === rr.channel);
  const mode = modes.find((m) => m.value === rr.mode)!;

  return (
    <div className="sp-stack">
      <p className="sp-edit-banner" role="status">
        <Icon name="info" size="sm" />
        <span>
          You’re editing <b>{rr.name}</b>. Saving posts it, or edits the message
          already posted.
        </span>
      </p>
      <div className="sp-studio__grid">
        {message ? (
          <MessageCanvas
            key={rr.message}
            server={server}
            message={message}
            tried={tried}
            headingId="rr-preview"
            roleVariables
            check={(m) => ({ ...m, channel: '1' })}
            onChange={(patch) => onMessage(rr.message, patch)}
            below={<RRPreview rr={rr} />}
          />
        ) : (
          <div className="sp-card">
            <EmptyState icon="file-x" title="Its message template was deleted">
              Pick another message template on the right.
            </EmptyState>
          </div>
        )}

        <fieldset
          className="sp-stack sp-studio__side sp-fieldset"
          disabled={!!server.paused}
        >
          <legend className="sp-sr-only">Reaction role settings</legend>
          <section className="sp-card" aria-labelledby="rr-settings">
            <div className="sp-card__head">
              <div className="sp-card__titles">
                <h2 className="sp-card__title" id="rr-settings">
                  Reaction role settings
                </h2>
                <p className="sp-card__sub">
                  What members pick, and the roles they get.
                </p>
              </div>
            </div>
            <div className="sp-card__body">
              <Input
                data-issue="name"
                label="Template name"
                maxLength={80}
                value={rr.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
              <div data-issue="channel">
                <ChannelPicker
                  label="Destination channel"
                  channels={channels}
                  value={rr.channel}
                  onChange={(id) => onChange({ channel: id })}
                  error={
                    channel && !channel.canPost
                      ? 'Sparko can’t post here yet.'
                      : undefined
                  }
                  hint="Saving posts the message here, or edits it. Deleting the reaction role deletes the message."
                />
              </div>
              <div data-issue="message">
                <Combobox
                  label={
                    <>
                      Message template{' '}
                      <InfoTip text="The message members see. It’s a Message Studio template: edit it in the preview, or in Message Studio." />
                    </>
                  }
                  searchPlaceholder="Search templates"
                  value={rr.message}
                  onChange={(id) => onChange({ message: id })}
                  items={items}
                />
              </div>
              <div className="sp-field">
                <span className="sp-label">Members pick with</span>
                <Segmented<RRKind>
                  label="Members pick with"
                  value={rr.kind}
                  onChange={(kind) =>
                    onChange({
                      kind,
                      max: Math.min(rr.max, rr.items.length),
                      min: 0,
                    })
                  }
                  options={[
                    { value: 'reaction', label: 'Reactions' },
                    { value: 'button', label: 'Buttons' },
                    { value: 'menu', label: 'Menu' },
                  ]}
                />
              </div>
              <div data-issue="items">
                <RRItems
                  rr={rr}
                  roles={roles}
                  serverId={server.id}
                  onChange={(next) => onChange({ items: next })}
                />
              </div>
              {rr.kind === 'menu' && (
                <Input
                  label="Menu text"
                  placeholder="Make a selection"
                  maxLength={150}
                  value={rr.placeholder}
                  onChange={(e) => onChange({ placeholder: e.target.value })}
                />
              )}
              <Combobox
                label="How roles are given"
                searchable={false}
                value={rr.mode}
                hint={mode.note}
                onChange={(v) => onChange({ mode: v as RRMode })}
                items={modes.map((m) => ({ value: m.value, label: m.label }))}
              />
              <div className="sp-greet-row">
                <div data-issue="max">
                  <Input
                    label="Max picks per member"
                    type="number"
                    min={0}
                    max={rr.items.length}
                    placeholder="0"
                    hint="0 means no limit."
                    value={String(rr.max)}
                    onChange={(e) =>
                      onChange({
                        max: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
                {rr.kind === 'menu' && (
                  <div data-issue="min">
                    <Input
                      label="Min picks per member"
                      type="number"
                      min={0}
                      placeholder="0"
                      hint="0 means none needed."
                      value={String(rr.min)}
                      onChange={(e) =>
                        onChange({
                          min: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </section>
        </fieldset>
      </div>

      {/* The message a member gets when a role is given or taken. */}
      <div className="sp-studio__grid sp-rr-response" data-issue="response">
        <div
          className={cx('sp-stack', !rr.response.on && 'sp-rr-off')}
          inert={!rr.response.on}
        >
          <Segmented
            label="Response for"
            className="sp-studio__type"
            value={side}
            onChange={onSide}
            options={[
              { value: 'claim', label: 'Claim message' },
              { value: 'remove', label: 'Remove message' },
            ]}
          />
          {response && responseId ? (
            <MessageCanvas
              key={responseId}
              server={server}
              message={response}
              tried={tried}
              headingId="rr-response-preview"
              roleVariables
              check={(m) => ({ ...m, channel: '1' })}
              onChange={(patch) => onMessage(responseId, patch)}
            />
          ) : (
            <EmptyState
              icon={<EditingIcon />}
              title={`No ${side === 'claim' ? 'claim' : 'remove'} message yet`}
              actions={
                <AnimatedIconButton
                  reveal={plusAnimations.reveal}
                  hover={plusAnimations.hover}
                  select={plusAnimations.select}
                  onClick={() => onNewResponse(side)}
                >
                  Create new template
                </AnimatedIconButton>
              }
            >
              Use an existing template on the right, or make a new one.
            </EmptyState>
          )}
        </div>
        <section
          className="sp-card sp-studio__side"
          aria-labelledby="rr-response"
        >
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="rr-response">
                Response message
              </h2>
              <p className="sp-card__sub">
                Sent to the member when they get or lose a role.
              </p>
            </div>
            <Switch
              checked={rr.response.on}
              onChange={(next) =>
                onChange({ response: { ...rr.response, on: next } })
              }
              description="Send a response"
            />
          </div>
          <div
            className={cx('sp-card__body', !rr.response.on && 'sp-rr-off')}
            inert={!rr.response.on}
          >
            <Combobox
              label="Claim message"
              searchPlaceholder="Search templates"
              placeholder="Pick a template"
              value={rr.response.claim}
              onChange={(claim) =>
                onChange({ response: { ...rr.response, claim } })
              }
              items={items}
            />
            <Combobox
              label="Remove message"
              searchPlaceholder="Search templates"
              placeholder="Pick a template"
              value={rr.response.remove}
              onChange={(remove) =>
                onChange({ response: { ...rr.response, remove } })
              }
              items={items}
            />
            <Combobox
              label="Send to"
              searchable={false}
              value={rr.response.delivery}
              hint={
                rr.kind === 'reaction'
                  ? 'Reactions can’t answer privately, so in the channel the reply mentions the member and is deleted after 10 seconds.'
                  : 'In the channel, only the member sees it.'
              }
              onChange={(v) =>
                onChange({
                  response: { ...rr.response, delivery: v as RRDelivery },
                })
              }
              items={deliveries}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const kindLabel: Record<RRKind, string> = {
  reaction: 'Reactions',
  button: 'Buttons',
  menu: 'Menu',
};

function RRLibrary({
  templates,
  limit,
  channels,
  editingId,
  adding,
  onAdd,
  onEdit,
  onClone,
  onDelete,
}: {
  templates: RRTemplate[];
  limit: number;
  channels: Channel[];
  editingId: string | null;
  adding: boolean;
  onAdd: () => void;
  onEdit: (t: RRTemplate) => void;
  onClone: (t: RRTemplate) => void;
  onDelete: (t: RRTemplate) => void;
}) {
  const full = templates.length >= limit;
  return (
    <section className="sp-card" aria-labelledby="rr-lib">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="rr-lib">
            Reaction role templates
          </h2>
          <p className="sp-card__sub sp-rr-count">
            You have {templates.length}/{limit}
            <span
              className="sp-mask-icon"
              role="img"
              aria-label="reaction roles"
              style={
                {
                  '--sp-mask': `url("${svgIcons.reactionRole}")`,
                } as CSSProperties
              }
            />
          </p>
        </div>
        <AnimatedIconButton
          size="sm"
          reveal={plusAnimations.reveal}
          hover={plusAnimations.hover}
          select={plusAnimations.select}
          disabled={full}
          loading={adding}
          title={
            full ? 'You’ve used every reaction role on this plan.' : undefined
          }
          onClick={onAdd}
        >
          RR Template
        </AnimatedIconButton>
      </div>
      {templates.length ? (
        <ul className="sp-rr-lib">
          {templates.map((t) => {
            const channel = channels.find((c) => c.id === t.config.channel);
            return (
              <li key={t.id} className="sp-card sp-rr-card">
                <button
                  type="button"
                  className="sp-rr-card__open"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => onEdit(t)}
                >
                  <span className="sp-rr-card__name">
                    {t.name}
                    {t.id === editingId && (
                      <Badge size="sm" tone="success">
                        Editing
                      </Badge>
                    )}
                  </span>
                  <span className="sp-hint">
                    {kindLabel[t.config.kind]} · {t.config.items.length}{' '}
                    {t.config.items.length === 1 ? 'role' : 'roles'}
                    {channel ? ` · #${channel.name}` : ''}
                  </span>
                  <span className="sp-hint">{t.meta}</span>
                </button>
                <span className="sp-rr-card__actions">
                  <AnimatedButton
                    anim={animIcons.edit.hover}
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit ${t.name} settings`}
                    onClick={() => onEdit(t)}
                  >
                    Edit
                  </AnimatedButton>
                  <AnimatedButton
                    anim={animIcons.clone.hover}
                    solid
                    size="sm"
                    variant="ghost"
                    disabled={full}
                    aria-label={`Clone ${t.name}`}
                    onClick={() => onClone(t)}
                  >
                    Clone
                  </AnimatedButton>
                  <AnimatedButton
                    anim={animIcons.remove.hover}
                    solid
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => onDelete(t)}
                  >
                    Delete
                  </AnimatedButton>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={
            <RevealIcon
              anim={animIcons.template}
              fallback="file-text"
              size={36}
            />
          }
          title="No reaction roles yet"
        >
          Members react, click a button or pick from a menu to get roles.
        </EmptyState>
      )}
    </section>
  );
}

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** One log line, like "[ADDED] Given 123 role 456". */
export function rrLogLine(e: RRLogEntry) {
  switch (e.action) {
    case 'added':
      return `[ADDED] Given ${e.userId} role ${e.roleId}`;
    case 'removed':
      return `[REMOVED] Removed role ${e.roleId} from ${e.userId}`;
    case 'refused':
      return `[REFUSED] ${e.userId} can’t get role ${e.roleId}, reason: ${e.reason}`;
    default:
      return `[FAILED] Couldn’t change role ${e.roleId} for ${e.userId}, reason: ${e.reason}`;
  }
}

function RRLog({ entries }: { entries: RRLogEntry[] }) {
  const [filter, setFilter] = useState<
    'all' | 'added' | 'removed' | 'problems'
  >('all');
  const shown = entries.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'problems'
        ? e.action === 'failed' || e.action === 'refused'
        : e.action === filter,
  );
  return (
    <section className="sp-card" aria-labelledby="rr-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="rr-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every role Sparko gave or took through reaction roles, and every one
            it couldn’t.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'added', label: 'Added' },
            { value: 'removed', label: 'Removed' },
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
                name={
                  e.action === 'added'
                    ? 'circle-check'
                    : e.action === 'removed'
                      ? 'minus'
                      : 'circle-x'
                }
                size="sm"
                className="sp-greet-log__icon"
              />
              <span className="sp-greet-log__text">{rrLogLine(e)}</span>
              <span className="sp-greet-log__meta">
                {e.userName} · {e.template} · {when(e.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon="scroll-text" title="Nothing yet">
          When members pick roles, each change shows here.
        </EmptyState>
      )}
    </section>
  );
}
