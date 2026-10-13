import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  DiscordMessage,
  EmptyState,
  Icon,
  Input,
  Notice,
  Segmented,
  Switch,
  Textarea,
  renderDiscordText,
  useToast,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  useCheckChannel,
  useStudio,
  useStudioActions,
  type Server,
  type StudioMessage,
  type StudioTemplate,
} from '../../data';
import { FixPermissionModal, fixes } from '../FixPermissionModal';
import { planName } from '../shared';
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
import {
  ChannelPicker,
  ColourChoice,
  isHttpsUrl,
  newId,
  VersionHistory,
} from './parts';

type Embed = StudioMessage['embed'];
type Field = Embed['fields'][number];
type LinkButton = StudioMessage['buttons'][number];

const maxFields = 25;
const maxButtons = 5;
const maxEmbed = 6000;
const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

/** Characters Discord counts toward an embed's 6,000 limit. */
const embedSize = (e: Embed) =>
  e.author.length +
  e.title.length +
  e.description.length +
  e.footer.length +
  e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);

function problems(m: StudioMessage, hexText: string | null) {
  const e = m.embed;
  const embedEmpty =
    !e.title.trim() &&
    !e.description.trim() &&
    !e.author.trim() &&
    !e.image.trim() &&
    e.fields.length === 0;
  return {
    empty: !m.content.trim() && (!m.useEmbed || embedEmpty),
    hex: m.useEmbed && hexText !== null && !isHex(hexText),
    image: m.useEmbed && !!e.image.trim() && !isHttpsUrl(e.image.trim()),
    fields: m.useEmbed
      ? e.fields
          .filter((f) => !f.name.trim() || !f.value.trim())
          .map((f) => f.id)
      : [],
    buttons: m.buttons
      .filter((b) => !b.label.trim() || !isHttpsUrl(b.url.trim()))
      .map((b) => b.id),
    size: m.useEmbed && embedSize(e) > maxEmbed,
  };
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** The message as Discord would show it. */
export function StudioPreview({
  message,
  server,
}: {
  message: StudioMessage;
  server: Server;
}) {
  const e = message.embed;
  const image = e.image.trim();
  const footer = [e.footer.trim(), e.timestamp ? 'Today at 18:42' : '']
    .filter(Boolean)
    .join(' • ');
  return (
    <DiscordMessage
      content={
        message.content.trim() ? renderDiscordText(message.content) : undefined
      }
      {...(message.useEmbed
        ? {
            embed: {
              color: e.color,
              ...(e.author.trim() ? { author: e.author } : {}),
              ...(e.title.trim() ? { title: e.title } : {}),
              ...(e.description.trim()
                ? { description: renderDiscordText(e.description) }
                : {}),
              ...(e.fields.length
                ? {
                    fields: e.fields.map((f) => ({
                      name: f.name || 'Name',
                      value: f.value || 'Value',
                      inline: f.inline,
                    })),
                  }
                : {}),
              ...(footer ? { footer } : {}),
              ...(e.thumbnail
                ? {
                    thumbnail: (
                      <span className="sp-dc-thumb">
                        {initialsOf(server.name)}
                      </span>
                    ),
                  }
                : {}),
              ...(isHttpsUrl(image)
                ? {
                    image: (
                      <span className="sp-dc-image">
                        <Icon name="image" />
                        {image.split('/').pop()}
                      </span>
                    ),
                  }
                : {}),
            },
          }
        : {})}
      components={
        message.buttons.length
          ? [
              message.buttons.map((b) => ({
                label: b.label || 'Untitled',
                style: 'link' as const,
              })),
            ]
          : []
      }
    />
  );
}

function Templates({
  server,
  templates,
  limit,
  current,
  onUse,
}: {
  server: Server;
  templates: StudioTemplate[];
  limit: number;
  current: StudioMessage;
  onUse: (t: StudioTemplate) => void;
}) {
  const { saveTemplate, deleteTemplate } = useStudioActions(server.id);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const toast = useToast();
  const full = templates.length >= limit;
  const save = (name: string, message: StudioMessage) =>
    saveTemplate.mutate(
      { name, message },
      {
        onSuccess: () =>
          toast({
            tone: 'success',
            title: `Saved “${name}”`,
            body: 'Welcome and Tickets can use it too.',
          }),
        onError: (e) =>
          toast({
            tone: 'danger',
            title: 'Couldn’t save the template',
            body: e instanceof Error ? e.message : 'Try again in a moment.',
          }),
      },
    );
  const inEditor = (t: StudioTemplate) =>
    JSON.stringify(t.message) === JSON.stringify(current);
  return (
    <div className="sp-stack">
      <div className="sp-inbox-bar">
        <p className="sp-hint" style={{ margin: 0 }}>
          {templates.length} of {limit} templates on {planName(server)}. Welcome
          and Tickets can use these too.
        </p>
        <Button
          size="sm"
          icon="plus"
          disabled={full || saveTemplate.isPending}
          onClick={() => save(current.name.trim() || 'Untitled', current)}
        >
          Save current as a template
        </Button>
      </div>
      {templates.length ? (
        <div className="sp-template-grid">
          {templates.map((t) => (
            <article key={t.id} className="sp-card sp-template">
              <div className="sp-template__preview" aria-hidden="true">
                <div
                  className="dc-embed sp-template__embed"
                  style={
                    {
                      '--dc-color': t.message.embed.color,
                    } as React.CSSProperties
                  }
                >
                  <div className="dc-embed__main">
                    <div className="dc-embed__title">
                      {t.message.embed.title || t.name}
                    </div>
                    <div className="dc-embed__desc sp-clamp-2">
                      {renderDiscordText(
                        t.message.embed.description || t.message.content,
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="sp-template__body">
                <div className="sp-template__titles">
                  <h3 className="sp-template__name">
                    {t.name}{' '}
                    {inEditor(t) && (
                      <Badge size="sm" tone="success">
                        In the editor
                      </Badge>
                    )}
                  </h3>
                  <span className="sp-hint">{t.meta}</span>
                </div>
                {confirmId === t.id ? (
                  <div role="alert" className="sp-template__confirm">
                    <span>
                      Delete “{t.name}”? Messages already posted stay in
                      Discord.
                    </span>
                    <div className="sp-item-box__row">
                      <Button
                        variant="danger"
                        size="sm"
                        loading={deleteTemplate.isPending}
                        onClick={() =>
                          deleteTemplate.mutate(t.id, {
                            onSuccess: () => setConfirmId(null),
                          })
                        }
                      >
                        Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        autoFocus
                        onClick={() => setConfirmId(null)}
                      >
                        Keep it
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="sp-item-box__row">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={inEditor(t)}
                      aria-label={`Use ${t.name}`}
                      onClick={() => onUse(t)}
                    >
                      Use
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={full || saveTemplate.isPending}
                      aria-label={`Duplicate ${t.name}`}
                      onClick={() => save(`${t.name} (copy)`, t.message)}
                    >
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon="trash-2"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => setConfirmId(t.id)}
                    />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="sp-card">
          <EmptyState icon="copy" title="No templates yet">
            Save a message you post often, like rules or a weekly recap, and
            start from it next time.
          </EmptyState>
        </div>
      )}
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
  const { publish } = useStudioActions(server.id);
  const checkChannel = useCheckChannel(server.id);
  const flow = useSaveFlow(server.id, 'studio');
  const [tab, setTab] = useModuleTab();
  const [draft, setDraft] = useState<StudioMessage | null>(null);
  // What's typed in the custom hex box, while it isn't the saved colour.
  const [hexText, setHexText] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [view, setView] = useState<'desktop' | 'phone'>('desktop');
  const [fixOpen, setFixOpen] = useState(false);
  const toast = useToast();

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

  const saved = studio.data.message;
  const message = draft ?? saved;
  const embed = message.embed;
  const dirty = JSON.stringify(message) !== JSON.stringify(saved);
  const paused = !!server.paused;
  const channels = studio.data.channels;
  const channel = channels.find((c) => c.id === message.channel);
  const locked = !!channel && !channel.canPost;
  const bad = problems(message, hexText);
  const invalid =
    bad.empty ||
    bad.hex ||
    bad.image ||
    bad.size ||
    bad.fields.length > 0 ||
    bad.buttons.length > 0;
  const size = embedSize(embed);

  const edit = (patch: Partial<StudioMessage>) => {
    setDraft({ ...message, ...patch });
    flow.clear();
  };
  const editEmbed = (patch: Partial<Embed>) =>
    edit({ embed: { ...embed, ...patch } });
  const editField = (id: string, patch: Partial<Field>) =>
    editEmbed({
      fields: embed.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  const moveField = (index: number, by: number) => {
    const fields = [...embed.fields];
    const [item] = fields.splice(index, 1);
    fields.splice(index + by, 0, item!);
    editEmbed({ fields });
  };
  const editButton = (id: string, patch: Partial<LinkButton>) =>
    edit({
      buttons: message.buttons.map((b) =>
        b.id === id ? { ...b, ...patch } : b,
      ),
    });
  const load = (next: StudioMessage, title: string) => {
    setDraft(next);
    setHexText(null);
    setTried(false);
    flow.clear();
    setTab('settings');
    toast({ title, body: 'Publish to update the message in Discord.' });
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
        liveLabel={`Updated in #${channel?.name ?? ''}`}
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

      {tab === 'settings' && (
        <>
          {locked && (
            <Notice
              tone="danger"
              title={`Sparko can’t post in #${channel.name}`}
              actions={
                <>
                  <button
                    type="button"
                    className="sp-link-btn"
                    onClick={() => setFixOpen(true)}
                  >
                    Show me how
                  </button>
                  <button
                    type="button"
                    className="sp-link-btn"
                    onClick={() => recheck()}
                  >
                    {checkChannel.isPending ? 'Checking…' : 'Check again'}
                  </button>
                </>
              }
            >
              It’s missing Send Messages and Embed Links there. Fix it in
              Discord, or pick another channel.
            </Notice>
          )}
          <div className="sp-split sp-split--lead">
            <fieldset className="sp-stack sp-fieldset" disabled={paused}>
              <legend className="sp-sr-only">Message editor</legend>
              <section className="sp-card" aria-labelledby="ms1">
                <div className="sp-card__head">
                  <div className="sp-card__titles">
                    <h2 className="sp-card__title" id="ms1">
                      Message
                    </h2>
                    <p className="sp-card__sub">
                      Plain text above the embed. Mentions here notify people.
                    </p>
                  </div>
                </div>
                <div className="sp-card__body">
                  <div className="sp-field-grid">
                    <Input
                      label={
                        <>
                          Name{' '}
                          <span className="sp-label__opt">
                            (only staff see this)
                          </span>
                        </>
                      }
                      maxLength={80}
                      value={message.name}
                      onChange={(e) => edit({ name: e.target.value })}
                    />
                    <ChannelPicker
                      label="Post in"
                      channels={channels}
                      value={message.channel}
                      onChange={(id) => edit({ channel: id })}
                      error={locked ? 'Sparko can’t post here yet.' : undefined}
                    />
                  </div>
                  <Textarea
                    label="Text"
                    rows={2}
                    maxLength={2000}
                    hint="**bold**, #channel and @role work like in Discord."
                    value={message.content}
                    error={
                      tried && bad.empty
                        ? 'Add some text or an embed. Discord won’t send an empty message.'
                        : undefined
                    }
                    onChange={(e) => edit({ content: e.target.value })}
                  />
                </div>
              </section>

              <section className="sp-card" aria-labelledby="ms2">
                <div className="sp-card__head">
                  <div className="sp-card__titles">
                    <h2 className="sp-card__title" id="ms2">
                      Embed
                    </h2>
                    <p className="sp-card__sub">
                      A card with a colour bar, fields and an image.
                    </p>
                  </div>
                  <Switch
                    checked={message.useEmbed}
                    onChange={(useEmbed) => edit({ useEmbed })}
                    description="Include an embed"
                  />
                </div>
                {message.useEmbed && (
                  <div className="sp-card__body">
                    <Input
                      label={
                        <>
                          Author line{' '}
                          <span className="sp-label__opt">(optional)</span>
                        </>
                      }
                      maxLength={256}
                      value={embed.author}
                      onChange={(e) => editEmbed({ author: e.target.value })}
                    />
                    <Input
                      label="Title"
                      maxLength={256}
                      value={embed.title}
                      suffix={
                        <span className="sp-tnum">
                          {256 - embed.title.length}
                        </span>
                      }
                      onChange={(e) => editEmbed({ title: e.target.value })}
                    />
                    <Textarea
                      label="Description"
                      rows={4}
                      maxLength={4096}
                      hint="Up to 4,096 characters."
                      value={embed.description}
                      onChange={(e) =>
                        editEmbed({ description: e.target.value })
                      }
                    />
                    <div className="sp-field">
                      <span className="sp-label">Colour bar</span>
                      <div className="sp-item-box__row sp-wrap-row">
                        <ColourChoice
                          value={embed.color}
                          onChange={(color) => {
                            setHexText(null);
                            editEmbed({ color });
                          }}
                        />
                        <div
                          className={
                            'sp-input sp-hex-input' +
                            (bad.hex ? ' is-error' : '')
                          }
                        >
                          <input
                            aria-label="Custom colour, hex"
                            maxLength={7}
                            value={hexText ?? embed.color}
                            aria-invalid={bad.hex || undefined}
                            onChange={(e) => {
                              const value = e.target.value.trim();
                              if (isHex(value)) {
                                setHexText(null);
                                editEmbed({ color: value.toUpperCase() });
                              } else {
                                setHexText(value);
                                flow.clear();
                              }
                            }}
                          />
                        </div>
                      </div>
                      {bad.hex && (
                        <p className="sp-field-error">
                          <Icon name="circle-alert" />
                          Use a hex colour like #FACC15.
                        </p>
                      )}
                    </div>
                    <Input
                      label={
                        <>
                          Image link{' '}
                          <span className="sp-label__opt">(optional)</span>
                        </>
                      }
                      icon="image"
                      placeholder="https://"
                      value={embed.image}
                      error={
                        bad.image
                          ? 'The link must start with https:// so Discord can load it.'
                          : undefined
                      }
                      onChange={(e) => editEmbed({ image: e.target.value })}
                    />
                    <Input
                      label={
                        <>
                          Footer{' '}
                          <span className="sp-label__opt">(optional)</span>
                        </>
                      }
                      maxLength={2048}
                      value={embed.footer}
                      onChange={(e) => editEmbed({ footer: e.target.value })}
                    />
                    <div className="sp-switch-list">
                      <Switch
                        checked={embed.thumbnail}
                        onChange={(thumbnail) => editEmbed({ thumbnail })}
                        label="Server icon in the corner"
                        description={`Shows ${server.name}’s icon as a thumbnail.`}
                      />
                      <Switch
                        checked={embed.timestamp}
                        onChange={(timestamp) => editEmbed({ timestamp })}
                        label="Show the time it was posted"
                        description="Each member sees it in their own time zone."
                      />
                    </div>
                  </div>
                )}
              </section>

              {message.useEmbed && (
                <section className="sp-card" aria-labelledby="ms3">
                  <div className="sp-card__head">
                    <div className="sp-card__titles">
                      <h2 className="sp-card__title" id="ms3">
                        Fields
                      </h2>
                      <p className="sp-card__sub">
                        Short name-and-value pairs. Side by side ones sit up to
                        three in a row.
                      </p>
                    </div>
                    <span className="sp-hint sp-tnum">
                      {embed.fields.length} of {maxFields}
                    </span>
                  </div>
                  <div className="sp-card__body" style={{ gap: 12 }}>
                    {embed.fields.map((f, i) => {
                      const wrong = tried && bad.fields.includes(f.id);
                      return (
                        <div key={f.id} className="sp-item-box">
                          <div className="sp-pair">
                            <div
                              className={
                                'sp-input' +
                                (wrong && !f.name.trim() ? ' is-error' : '')
                              }
                            >
                              <input
                                aria-label={`Field ${i + 1} name`}
                                placeholder="Name"
                                maxLength={256}
                                value={f.name}
                                onChange={(e) =>
                                  editField(f.id, { name: e.target.value })
                                }
                              />
                            </div>
                            <div
                              className={
                                'sp-input' +
                                (wrong && !f.value.trim() ? ' is-error' : '')
                              }
                            >
                              <input
                                aria-label={`Field ${i + 1} value`}
                                placeholder="Value"
                                maxLength={1024}
                                value={f.value}
                                onChange={(e) =>
                                  editField(f.id, { value: e.target.value })
                                }
                              />
                            </div>
                          </div>
                          {wrong && (
                            <p className="sp-field-error">
                              <Icon name="circle-alert" />
                              Fields need both a name and a value.
                            </p>
                          )}
                          <div className="sp-item-box__row">
                            <span style={{ marginRight: 'auto' }}>
                              <Checkbox
                                checked={f.inline}
                                onChange={(inline) =>
                                  editField(f.id, { inline })
                                }
                                label="Side by side"
                              />
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              icon="arrow-up"
                              aria-label={`Move field ${i + 1} up`}
                              disabled={i === 0}
                              onClick={() => moveField(i, -1)}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              icon="arrow-down"
                              aria-label={`Move field ${i + 1} down`}
                              disabled={i === embed.fields.length - 1}
                              onClick={() => moveField(i, 1)}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              icon="trash-2"
                              aria-label={`Remove field ${i + 1}`}
                              onClick={() =>
                                editEmbed({
                                  fields: embed.fields.filter(
                                    (x) => x.id !== f.id,
                                  ),
                                })
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                    <Button
                      size="sm"
                      icon="plus"
                      style={{ justifySelf: 'start' }}
                      disabled={embed.fields.length >= maxFields}
                      onClick={() =>
                        editEmbed({
                          fields: [
                            ...embed.fields,
                            { id: newId(), name: '', value: '', inline: true },
                          ],
                        })
                      }
                    >
                      Add a field
                    </Button>
                  </div>
                </section>
              )}

              <section className="sp-card" aria-labelledby="ms4">
                <div className="sp-card__head">
                  <div className="sp-card__titles">
                    <h2 className="sp-card__title" id="ms4">
                      Link buttons
                    </h2>
                    <p className="sp-card__sub">Open a website when pressed.</p>
                  </div>
                  <span className="sp-hint sp-tnum">
                    {message.buttons.length} of {maxButtons}
                  </span>
                </div>
                <div className="sp-card__body" style={{ gap: 12 }}>
                  {message.buttons.map((b, i) => {
                    const wrong = tried && bad.buttons.includes(b.id);
                    return (
                      <div key={b.id} className="sp-stack" style={{ gap: 6 }}>
                        <div className="sp-link-row">
                          <div className="sp-input">
                            <input
                              aria-label={`Button ${i + 1} label`}
                              placeholder="Label"
                              maxLength={80}
                              value={b.label}
                              onChange={(e) =>
                                editButton(b.id, { label: e.target.value })
                              }
                            />
                          </div>
                          <div
                            className={'sp-input' + (wrong ? ' is-error' : '')}
                          >
                            <input
                              aria-label={`Button ${i + 1} link`}
                              placeholder="https://"
                              value={b.url}
                              aria-invalid={wrong || undefined}
                              onChange={(e) =>
                                editButton(b.id, { url: e.target.value })
                              }
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            icon="trash-2"
                            aria-label={`Remove button ${i + 1}`}
                            onClick={() =>
                              edit({
                                buttons: message.buttons.filter(
                                  (x) => x.id !== b.id,
                                ),
                              })
                            }
                          />
                        </div>
                        {wrong && (
                          <p className="sp-field-error">
                            <Icon name="circle-alert" />
                            Give it a label and a link that starts with
                            https://.
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <Button
                    size="sm"
                    icon="plus"
                    style={{ justifySelf: 'start' }}
                    disabled={message.buttons.length >= maxButtons}
                    onClick={() =>
                      edit({
                        buttons: [
                          ...message.buttons,
                          { id: newId(), label: '', url: '' },
                        ],
                      })
                    }
                  >
                    Add a link button
                  </Button>
                </div>
              </section>
            </fieldset>

            <section className="sp-stack sp-sticky-lg" aria-labelledby="msv">
              <div className="sp-preview-head">
                <h2 id="msv" className="sp-section-title">
                  Live preview
                </h2>
                <Segmented
                  label="Preview size"
                  value={view}
                  onChange={setView}
                  options={[
                    {
                      value: 'desktop',
                      label: (
                        <>
                          <Icon name="monitor" size="sm" />
                          Desktop
                        </>
                      ),
                    },
                    {
                      value: 'phone',
                      label: (
                        <>
                          <Icon name="smartphone" size="sm" />
                          Phone
                        </>
                      ),
                    },
                  ]}
                />
              </div>
              <div
                className={
                  'dc-preview-frame' + (view === 'phone' ? ' sp-phone' : '')
                }
              >
                <div className="dc-chat">
                  <StudioPreview message={message} server={server} />
                </div>
              </div>
              {message.useEmbed && (
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
                    aria-valuemax={maxEmbed}
                  >
                    <div
                      className={
                        'sp-progress__bar' + (bad.size ? ' is-over' : '')
                      }
                      style={{
                        width: `${Math.min(100, (size / maxEmbed) * 100)}%`,
                      }}
                    />
                  </div>
                  {bad.size && (
                    <p className="sp-field-error">
                      <Icon name="circle-alert" />
                      Discord rejects embeds over 6,000 characters. Shorten the
                      description or fields.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {tab === 'items' && (
        <Templates
          server={server}
          templates={studio.data.templates}
          limit={studio.data.templateLimit}
          current={message}
          onUse={(t) =>
            load(
              { ...t.message, channel: message.channel },
              `“${t.name}” loaded into the editor`,
            )
          }
        />
      )}

      {tab === 'history' && (
        <VersionHistory
          title="Versions"
          description="Every publish is kept. Restoring loads it into the editor; Discord only changes when you publish again."
          versions={studio.data.versions}
          currentLabel={`Live in #${channels.find((c) => c.id === saved.channel)?.name ?? ''}`}
          onRestore={(restored) =>
            load(restored, 'Version loaded into the editor')
          }
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
        visible={(dirty || hexText !== null) && !paused}
        saving={flow.phase === 'saving'}
        saveLabel="Publish changes"
        error={
          tried && invalid
            ? 'Fix the highlighted fields first.'
            : flow.saveError
        }
        onReset={() => {
          setDraft(null);
          setHexText(null);
          setTried(false);
        }}
        onSave={async () => {
          setTried(true);
          if (invalid) {
            setTab('settings');
            return;
          }
          if (await flow.run(() => publish.mutateAsync(message))) {
            setDraft(null);
            setTried(false);
          }
        }}
      />
    </>
  );
}
