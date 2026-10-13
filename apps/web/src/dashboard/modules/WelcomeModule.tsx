import { useRef, useState, type ReactNode } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Combobox,
  DiscordMessage,
  DiscordPreview,
  EmptyState,
  Icon,
  Input,
  Modal,
  Notice,
  RadioCards,
  Segmented,
  Switch,
  useToast,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  useCheckChannel,
  useSaveWelcome,
  useWelcome,
  type Delivery,
  type Server,
  type WelcomeConfig,
} from '../../data';
import { FixPermissionModal, fixes } from '../FixPermissionModal';
import { formatCount } from '../shared';
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

const colours = [
  ['Sparko yellow', '#FACC15'],
  ['Blurple', '#5865F2'],
  ['Mint', '#57F287'],
  ['Coral', '#ED4245'],
] as const;
const tokens = ['{user}', '{server}', '{member_count}', '#rules'];
const maxLength = 2000;

/** Turns a welcome message into what Discord shows: mentions, bold, filled-in names. */
export function renderMessage(message: string, server: Server): ReactNode[] {
  return message
    .split(/(\{user\}|\{server\}|\{member_count\}|\*\*[^*]+\*\*|#[a-z0-9-]+)/gi)
    .filter(Boolean)
    .map((part, i) => {
      if (part === '{user}')
        return (
          <span key={i} className="dc-mention">
            @tomoko
          </span>
        );
      if (part === '{server}') return server.name;
      if (part === '{member_count}') return formatCount(server.members + 1);
      if (part.startsWith('**') && part.endsWith('**'))
        return (
          <b key={i}>{part.slice(2, -2).replace(/\{server\}/g, server.name)}</b>
        );
      if (part.startsWith('#'))
        return (
          <span key={i} className="dc-mention">
            {part}
          </span>
        );
      return part;
    });
}

export function WelcomeModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const welcome = useWelcome(server.id);
  const save = useSaveWelcome(server.id);
  const checkChannel = useCheckChannel(server.id);
  const flow = useSaveFlow(server.id, 'welcome');
  const [tab, setTab] = useModuleTab();
  const [draft, setDraft] = useState<{
    on: boolean;
    config: WelcomeConfig;
  } | null>(null);
  const [tried, setTried] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const message = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  if (welcome.isPending)
    return (
      <div className="sp-stack" aria-busy="true" aria-label="Loading">
        <span className="sp-skel sp-skel--title" />
        <div className="sp-split">
          <div className="sp-skel sp-skel--block" style={{ height: 320 }} />
          <div className="sp-skel sp-skel--block" style={{ height: 320 }} />
        </div>
      </div>
    );
  if (welcome.isError)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Welcome"
          actions={
            <Button icon="refresh-cw" onClick={() => void welcome.refetch()}>
              Try again
            </Button>
          }
        >
          Sparko couldn’t read your server’s channels. Nothing was changed.
        </EmptyState>
      </div>
    );

  const saved = { on: welcome.data.on, config: welcome.data.config };
  const current = draft ?? saved;
  const { config } = current;
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);
  const paused = !!server.paused;
  const channels = welcome.data.channels;
  const channel = channels.find((c) => c.id === config.channel);
  const postsInChannel = config.delivery !== 'dm';
  const channelBlocked = postsInChannel && channel && !channel.canPost;
  const messageMissing = current.on && !config.message.trim();

  const edit = (patch: Partial<WelcomeConfig> & { on?: boolean }) => {
    const { on, ...rest } = patch;
    setDraft({ on: on ?? current.on, config: { ...config, ...rest } });
    flow.clear();
  };
  const insert = (token: string) => {
    const box = message.current;
    const at = box ? box.selectionStart : config.message.length;
    const end = box ? box.selectionEnd : at;
    const before = config.message.slice(0, at);
    const spaced = before && !before.endsWith(' ') ? ` ${token}` : token;
    const next = (before + spaced + config.message.slice(end)).slice(
      0,
      maxLength,
    );
    edit({ message: next });
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(at + spaced.length, at + spaced.length);
    });
  };
  const doSave = async () => {
    setTried(true);
    if (messageMissing) {
      message.current?.focus();
      return;
    }
    const ok = await flow.run(() => save.mutateAsync(current));
    if (ok) {
      setDraft(null);
      setTried(false);
    }
  };
  const where =
    config.delivery === 'dm'
      ? 'Direct message'
      : config.delivery === 'both'
        ? `#${channel?.name ?? '…'} and DM`
        : `#${channel?.name ?? '…'}`;
  const restoring = welcome.data.versions.find((v) => v.id === restoreId);
  const fix = fixes.channel(channel?.name ?? 'the channel');

  return (
    <>
      <ModuleHeader
        module={module}
        sync={syncState({ paused, dirty, phase: flow.phase, on: saved.on })}
        power={{
          on: current.on,
          onChange: (on) => edit({ on }),
          disabled: paused || flow.busy,
          hint: paused
            ? 'Locked by Sparko staff'
            : current.on
              ? 'Greets people after you save'
              : 'Not greeting anyone',
        }}
      />
      <PausedNotice server={server} />
      {channelBlocked && (
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
                disabled={checkChannel.isPending}
                onClick={() =>
                  checkChannel.mutate(channel.id, {
                    onSuccess: () => void flow.retryApply(),
                  })
                }
              >
                {checkChannel.isPending ? 'Checking…' : 'Check again'}
              </button>
            </>
          }
        >
          It’s missing Send Messages and Embed Links in that channel, so new
          members won’t be greeted. This takes about a minute to fix in Discord.
        </Notice>
      )}
      <SavePipeline
        phase={flow.phase}
        liveLabel={
          config.delivery === 'dm'
            ? 'Live in DMs'
            : `Live in #${channel?.name ?? ''}`
        }
        error={flow.error}
      />
      <ModuleTabs
        module={module}
        tab={tab}
        onChange={setTab}
        labels={['Settings', 'Templates', 'History']}
        counts={[
          undefined,
          welcome.data.templates.length,
          welcome.data.versions.length,
        ]}
      />

      {tab === 'settings' && (
        <div className="sp-split sp-split--lead">
          {/* While Sparko staff pause the server, settings can be read but not changed. */}
          <fieldset className="sp-stack sp-fieldset" disabled={paused}>
            <legend className="sp-sr-only">Welcome settings</legend>
            <section className="sp-card" aria-labelledby="w1">
              <div className="sp-card__head">
                <div className="sp-card__titles">
                  <h2 className="sp-card__title" id="w1">
                    Where to greet people
                  </h2>
                  <p className="sp-card__sub">
                    Sparko sends this the moment someone joins.
                  </p>
                </div>
              </div>
              <div className="sp-card__body">
                <RadioCards
                  name="delivery"
                  legend="Send it to"
                  value={config.delivery}
                  onChange={(delivery) =>
                    edit({ delivery: delivery as Delivery })
                  }
                  options={[
                    {
                      value: 'channel',
                      title: 'Channel',
                      description: 'Everyone sees it',
                    },
                    {
                      value: 'dm',
                      title: 'Direct message',
                      description: 'Only they see it',
                    },
                    {
                      value: 'both',
                      title: 'Both',
                      description: 'Channel and DM',
                    },
                  ]}
                />
                <Combobox
                  label="Channel"
                  searchPlaceholder="Search channels"
                  placeholder="Pick a channel"
                  disabled={!postsInChannel}
                  value={config.channel}
                  onChange={(id) => edit({ channel: id })}
                  error={
                    channelBlocked ? 'Sparko can’t post here yet.' : undefined
                  }
                  hint={
                    postsInChannel
                      ? undefined
                      : 'Not needed when sending only a direct message.'
                  }
                  footer="Locked channels are ones Sparko can’t post in yet."
                  items={channels.map((c) => ({
                    value: c.id,
                    label: c.name,
                    icon: 'hash',
                    group: c.category,
                    disabled: !c.canPost && c.id !== config.channel,
                    ...(c.canPost ? {} : { note: 'Sparko can’t post' }),
                  }))}
                />
              </div>
            </section>

            <section className="sp-card" aria-labelledby="w2">
              <div className="sp-card__head">
                <div className="sp-card__titles">
                  <h2 className="sp-card__title" id="w2">
                    What it says
                  </h2>
                  <p className="sp-card__sub">
                    The preview updates as you type.
                  </p>
                </div>
              </div>
              <div className="sp-card__body">
                <div className="sp-field">
                  <label className="sp-label" htmlFor="w-msg">
                    Message
                  </label>
                  <div
                    className={
                      'sp-input sp-input--multiline' +
                      (tried && messageMissing ? ' is-error' : '')
                    }
                  >
                    <textarea
                      ref={message}
                      id="w-msg"
                      rows={4}
                      maxLength={maxLength}
                      aria-invalid={tried && messageMissing ? true : undefined}
                      aria-describedby="w-msg-h"
                      value={config.message}
                      onChange={(e) => edit({ message: e.target.value })}
                    />
                  </div>
                  {tried && messageMissing ? (
                    <p className="sp-field-error" id="w-msg-h">
                      <Icon name="circle-alert" />
                      Write a message, or turn Welcome off.
                    </p>
                  ) : (
                    <div className="sp-field__row" id="w-msg-h">
                      <p className="sp-hint">
                        Bold with **text**. Mention channels with #name.
                      </p>
                      <p className="sp-hint sp-tnum">
                        {config.message.length} / {maxLength}
                      </p>
                    </div>
                  )}
                </div>
                <div className="sp-field">
                  <span className="sp-label" id="w-insert">
                    Insert
                  </span>
                  <div
                    className="sp-insert-row"
                    role="group"
                    aria-labelledby="w-insert"
                  >
                    {tokens.map((token) => (
                      <button
                        key={token}
                        type="button"
                        className="sp-chip sp-chip--toggle"
                        aria-label={`Insert ${token}`}
                        onClick={() => insert(token)}
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                  <p className="sp-hint">
                    {'{user}'} becomes a mention of the new member.{' '}
                    {'{member_count}'} is their join number.
                  </p>
                </div>
                <Switch
                  checked={config.embed}
                  onChange={(embed) => edit({ embed })}
                  label="Send as an embed"
                  description="A card with a colour bar. Turn off for a plain message."
                />
                {config.embed && (
                  <>
                    <Input
                      label={
                        <>
                          Embed title{' '}
                          <span className="sp-label__opt">(optional)</span>
                        </>
                      }
                      value={config.title}
                      maxLength={256}
                      placeholder={`Welcome to ${server.name}`}
                      onChange={(e) => edit({ title: e.target.value })}
                    />
                    <div className="sp-field">
                      <span className="sp-label" id="w-colour">
                        Colour bar
                      </span>
                      <Segmented
                        label="Colour bar"
                        className="sp-colour-seg"
                        value={config.color}
                        onChange={(color) => edit({ color })}
                        options={colours.map(([name, hex]) => ({
                          value: hex,
                          label: (
                            <>
                              <span className="sp-dot" style={{ color: hex }} />
                              {name}
                            </>
                          ),
                        }))}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="sp-card" aria-labelledby="w3">
              <div className="sp-card__head">
                <div className="sp-card__titles">
                  <h2 className="sp-card__title" id="w3">
                    Extras
                  </h2>
                </div>
              </div>
              <div className="sp-card__body sp-switch-list">
                <Switch
                  checked={config.ping}
                  onChange={(ping) => edit({ ping })}
                  label="Ping the new member"
                  description="They get a notification, so they actually see it."
                />
                <Switch
                  checked={config.rejoin}
                  onChange={(rejoin) => edit({ rejoin })}
                  label="Welcome people who rejoin"
                  description="Off means someone who leaves and comes back isn’t greeted twice."
                />
              </div>
            </section>
          </fieldset>

          <section className="sp-stack sp-sticky-lg" aria-labelledby="pv-h">
            <div className="sp-preview-head">
              <h2 id="pv-h" className="sp-section-title">
                Live preview
              </h2>
              <span className="sp-hint">{where}</span>
            </div>
            <DiscordPreview>
              <DiscordMessage
                content={
                  config.ping || !config.embed ? (
                    <>
                      {config.ping && (
                        <span className="dc-mention">@tomoko</span>
                      )}{' '}
                      {!config.embed && renderMessage(config.message, server)}
                    </>
                  ) : undefined
                }
                {...(config.embed
                  ? {
                      embed: {
                        color: config.color,
                        author: server.name,
                        ...(config.title
                          ? {
                              title: config.title.replace(
                                /\{server\}/g,
                                server.name,
                              ),
                            }
                          : {}),
                        description: renderMessage(config.message, server),
                        footer: `${server.name} · Today at 18:42`,
                      },
                    }
                  : {})}
              />
            </DiscordPreview>
            <p className="sp-hint">
              Previewing as tomoko, a new member. Nothing is sent until you save
              and Welcome is on.
            </p>
          </section>
        </div>
      )}

      {tab === 'items' && (
        <section className="sp-card" aria-labelledby="tp-h">
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="tp-h">
                Message templates
              </h2>
              <p className="sp-card__sub">
                {welcome.data.templates.length} of {welcome.data.templateLimit}{' '}
                used on {server.plan === 'plus' ? 'Plus' : 'Free'}. Templates
                are shared with Message Studio.
              </p>
            </div>
          </div>
          <div className="sp-rows">
            {welcome.data.templates.map((t) => {
              const inUse = config.message === t.message;
              return (
                <div key={t.id} className="sp-row">
                  <span className="sp-row__icon">
                    <Icon name="file-text" />
                  </span>
                  <span className="sp-row__title">
                    {t.name}{' '}
                    {inUse && (
                      <Badge tone="success" size="sm">
                        In use
                      </Badge>
                    )}
                  </span>
                  <span className="sp-row__desc">{t.message}</span>
                  <span className="sp-row__end">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={inUse}
                      aria-label={`Use ${t.name}`}
                      onClick={() => {
                        edit({ message: t.message });
                        setTab('settings');
                        toast({
                          title: `“${t.name}” is in the editor`,
                          body: 'Save to start using it.',
                        });
                      }}
                    >
                      Use
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'history' && (
        <section className="sp-card" aria-labelledby="hs-h">
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="hs-h">
                Saved versions
              </h2>
              <p className="sp-card__sub">
                Every save is kept. Restoring loads it into the editor; nothing
                changes in Discord until you save.
              </p>
            </div>
          </div>
          <div className="sp-rows">
            {welcome.data.versions.map((v, i) => (
              <div key={v.id} className="sp-row">
                <span style={{ gridRow: 'span 2' }}>
                  <Avatar name={v.who} color={v.whoColor} size="sm" />
                </span>
                <span className="sp-row__title">
                  {v.title} {i === 0 && <Badge size="sm">Current</Badge>}
                </span>
                <span className="sp-row__desc">
                  {v.who} · {v.when}
                </span>
                <span className="sp-row__end">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="rotate-ccw"
                    disabled={i === 0}
                    aria-label={`Restore “${v.title}”`}
                    onClick={() => setRestoreId(v.id)}
                  >
                    Restore
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={!!restoring}
        onClose={() => setRestoreId(null)}
        icon="rotate-ccw"
        title="Load this version into the editor?"
        description={
          restoring
            ? `${restoring.title} · ${restoring.who}, ${restoring.when}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestoreId(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (restoring) {
                  setDraft({ on: current.on, config: restoring.config });
                  flow.clear();
                }
                setRestoreId(null);
                setTab('settings');
                toast({
                  title: 'Version loaded',
                  body: 'Check the preview, then save to use it.',
                });
              }}
            >
              Load into editor
            </Button>
          </>
        }
      >
        <p className="sp-hint">
          Your current unsaved edits are replaced. Nothing changes in Discord
          until you save.
        </p>
      </Modal>
      <FixPermissionModal
        open={fixOpen}
        {...fix}
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
        error={
          tried && messageMissing
            ? 'Write a message, or turn Welcome off.'
            : flow.saveError
        }
        onReset={() => {
          setDraft(null);
          setTried(false);
        }}
        onSave={() => void doSave()}
      />
    </>
  );
}
