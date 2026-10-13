import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  DiscordMessage,
  DiscordPreview,
  EmptyState,
  Icon,
  Input,
  Notice,
  Segmented,
  Select,
  Switch,
  Textarea,
  useToast,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  useCheckChannel,
  useSaveTickets,
  useTicketList,
  useTicketsConfig,
  type ButtonStyle,
  type Server,
  type Ticket,
  type TicketPanel,
  type TicketPriority,
  type TicketStatus,
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
import { ChannelPicker, ColourChoice, newId, VersionHistory } from './parts';

export const statusInfo: Record<
  TicketStatus,
  { label: string; tone?: 'info' | 'brand' }
> = {
  new: { label: 'Needs a first reply', tone: 'info' },
  claimed: { label: 'In progress', tone: 'brand' },
  waiting: { label: 'Waiting on member' },
  closed: { label: 'Closed' },
};
export const priorityInfo: Record<
  TicketPriority,
  { label: string; tone?: 'danger' | 'warning'; order: number }
> = {
  urgent: { label: 'Urgent', tone: 'danger', order: 0 },
  high: { label: 'High', tone: 'warning', order: 1 },
  normal: { label: 'Normal', order: 2 },
  low: { label: 'Low', order: 3 },
};
export function StatusBadge({ status }: { status: TicketStatus }) {
  const info = statusInfo[status];
  return info.tone ? (
    <Badge tone={info.tone}>{info.label}</Badge>
  ) : (
    <span className="sp-badge sp-pill sp-pill--muted">{info.label}</span>
  );
}
export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const info = priorityInfo[priority];
  return info.tone ? (
    <Badge tone={info.tone}>{info.label}</Badge>
  ) : (
    <span className="sp-badge sp-pill sp-pill--muted">{info.label}</span>
  );
}

type Filter = 'needs' | 'mine' | 'open' | 'closed';
const filters: Record<Filter, { label: string; test: (t: Ticket) => boolean }> =
  {
    needs: {
      label: 'Needs a reply',
      test: (t) => t.status !== 'closed' && t.lastBy === 'member',
    },
    mine: {
      label: 'Assigned to me',
      test: (t) => t.status !== 'closed' && t.assignee === 'You',
    },
    open: { label: 'All open', test: (t) => t.status !== 'closed' },
    closed: { label: 'Closed', test: (t) => t.status === 'closed' },
  };
const late = (t: Ticket) =>
  t.status !== 'closed' && t.lastBy === 'member' && t.waitingMinutes >= 60;
const emptyCopy: Record<Filter, [string, string, string]> = {
  needs: [
    'circle-check',
    'Nothing needs a reply',
    'Every open ticket has a staff reply. New messages from members show up here right away.',
  ],
  mine: [
    'inbox',
    'Nothing assigned to you',
    'Claim a ticket and it shows up here.',
  ],
  open: [
    'circle-check',
    'No open tickets',
    'All caught up. Closed tickets keep their transcripts.',
  ],
  closed: [
    'archive',
    'No closed tickets yet',
    'Closed tickets and their transcripts appear here.',
  ],
};

function Inbox({ server, onSetup }: { server: Server; onSetup: () => void }) {
  const list = useTicketList(server.id);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('needs');
  const [query, setQuery] = useState('');
  if (list.isPending)
    return (
      <div
        className="sp-skel sp-skel--block"
        style={{ height: 320 }}
        aria-busy="true"
      />
    );
  if (list.isError)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load tickets"
          actions={
            <Button onClick={() => void list.refetch()}>Try again</Button>
          }
        />
      </div>
    );
  const tickets = list.data;
  if (!tickets.length)
    return (
      <div className="sp-card">
        <EmptyState
          icon="ticket"
          title="No tickets yet"
          actions={
            <Button variant="primary" onClick={onSetup}>
              Create a ticket panel
            </Button>
          }
        >
          Post a ticket panel in #support. Members press one button to open a
          private thread with your staff, and every ticket lands here.
        </EmptyState>
      </div>
    );
  const needle = query.trim().toLowerCase().replace(/^#/, '');
  const rows = tickets
    .filter(filters[filter].test)
    .filter(
      (t) =>
        !needle ||
        `${t.number} ${t.topic} ${t.member} ${t.category}`
          .toLowerCase()
          .includes(needle),
    )
    .sort(
      (a, b) =>
        Number(late(b)) - Number(late(a)) ||
        priorityInfo[a.priority].order - priorityInfo[b.priority].order ||
        b.number - a.number,
    );
  const [icon, title, description] = needle
    ? [
        'search',
        `No tickets match “${query.trim()}”`,
        'Try a member name, a word from the topic, or a number like 213.',
      ]
    : emptyCopy[filter];
  const lateCount = tickets.filter(late).length;
  const open = (t: Ticket) =>
    navigate(`/dashboard/${server.id}/tickets/${t.number}`);
  return (
    <div className="sp-stack">
      <div className="sp-inbox-bar">
        <Segmented
          label="Show tickets"
          className="sp-wrap-seg"
          value={filter}
          onChange={setFilter}
          options={(Object.keys(filters) as Filter[]).map((f) => ({
            value: f,
            label: (
              <>
                {filters[f].label}
                <span className="sp-count">
                  {tickets.filter(filters[f].test).length}
                </span>
              </>
            ),
          }))}
        />
        <div className="sp-input sp-inbox-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search tickets"
            placeholder="Member, topic or #number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {rows.length ? (
        <>
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Status</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Handled by</th>
                  <th scope="col">Last message</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr
                    key={t.number}
                    className="sp-table__row-link"
                    onClick={() => open(t)}
                  >
                    <td data-label="Ticket" data-primary="true">
                      <div className="sp-ticket-cell">
                        <Avatar
                          name={t.member}
                          color={((t.number % 6) + 1) as 1}
                          size="sm"
                        />
                        <span className="sp-ticket-cell__text">
                          <button
                            type="button"
                            className="sp-link-btn sp-ticket-cell__topic"
                            onClick={(e) => {
                              e.stopPropagation();
                              open(t);
                            }}
                          >
                            <span className="sp-tnum sp-ticket-cell__n">
                              #{t.number}
                            </span>{' '}
                            {t.topic}
                          </button>
                          <span className="sp-hint">
                            {t.member} · {t.category}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={t.status} />
                    </td>
                    <td data-label="Priority">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td data-label="Handled by">
                      {t.assignee ?? (
                        <span className="sp-table__muted">Nobody yet</span>
                      )}
                    </td>
                    <td data-label="Last message">
                      <span className="sp-ticket-last">
                        <span className="sp-tnum">{t.lastAt}</span>
                        {late(t) && (
                          <span className="sp-ticket-late">
                            <Icon name="clock" size="sm" />
                            Waiting over an hour
                          </span>
                        )}
                        <span className="sp-hint">
                          from {t.lastBy === 'staff' ? 'staff' : t.member}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sp-hint">
            {lateCount
              ? `${lateCount} ${lateCount === 1 ? 'member has' : 'members have'} waited over an hour; they’re listed first.`
              : 'Tickets waiting longest and with the highest priority are listed first.'}
          </p>
        </>
      ) : (
        <div className="sp-card">
          <EmptyState
            icon={icon}
            title={title}
            actions={
              needle ? (
                <Button size="sm" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              ) : undefined
            }
          >
            {description}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

const buttonStyles: [ButtonStyle, string][] = [
  ['primary', 'Blurple'],
  ['secondary', 'Grey'],
  ['success', 'Green'],
  ['danger', 'Red'],
];
const maxTopics = 5;

function panelProblems(panel: TicketPanel) {
  return {
    title: !panel.title.trim(),
    topics: panel.topics.length === 0,
    labels: panel.topics.filter((t) => !t.label.trim()).map((t) => t.id),
    roles: panel.roles.length === 0,
  };
}

export function TicketsModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const config = useTicketsConfig(server.id);
  const save = useSaveTickets(server.id);
  const checkChannel = useCheckChannel(server.id);
  const flow = useSaveFlow(server.id, 'tickets');
  const [tab, setTab] = useModuleTab('items');
  const [draft, setDraft] = useState<{
    on: boolean;
    panel: TicketPanel;
  } | null>(null);
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const toast = useToast();

  if (config.isPending)
    return (
      <div className="sp-stack" aria-busy="true" aria-label="Loading">
        <span className="sp-skel sp-skel--title" />
        <div className="sp-skel sp-skel--block" style={{ height: 320 }} />
      </div>
    );
  if (config.isError)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Tickets"
          actions={
            <Button onClick={() => void config.refetch()}>Try again</Button>
          }
        />
      </div>
    );

  const saved = { on: config.data.on, panel: config.data.panel };
  const current = draft ?? saved;
  const { panel } = current;
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);
  const paused = !!server.paused;
  const channel = config.data.channels.find((c) => c.id === panel.channel);
  const blocked = current.on && channel && !channel.canPost;
  const problems = panelProblems(panel);
  const invalid =
    problems.title ||
    problems.topics ||
    problems.labels.length > 0 ||
    problems.roles;
  const edit = (patch: Partial<TicketPanel> & { on?: boolean }) => {
    const { on, ...rest } = patch;
    setDraft({ on: on ?? current.on, panel: { ...panel, ...rest } });
    flow.clear();
  };
  const editTopic = (
    id: string,
    patch: Partial<TicketPanel['topics'][number]>,
  ) =>
    edit({
      topics: panel.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  const move = (index: number, by: number) => {
    const topics = [...panel.topics];
    const [item] = topics.splice(index, 1);
    topics.splice(index + by, 0, item!);
    edit({ topics });
  };
  const picked = panel.topics.find((t) => t.id === preview) ?? panel.topics[0];

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
              ? 'Members can open tickets'
              : 'New tickets are off',
        }}
      />
      <PausedNotice server={server} />
      {blocked && (
        <Notice
          tone="danger"
          title={`New tickets can’t open: Sparko can’t post in #${channel.name}`}
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
          Tickets already open still work. Members can’t press the panel’s
          buttons until Sparko can post there.
        </Notice>
      )}
      <SavePipeline
        phase={flow.phase}
        liveLabel={`Live in #${channel?.name ?? ''}`}
        error={flow.error}
      />
      <ModuleTabs
        module={module}
        tab={tab}
        onChange={setTab}
        labels={['Settings', 'Inbox', 'History']}
        counts={[undefined, undefined, config.data.versions.length]}
      />

      {tab === 'items' && (
        <Inbox server={server} onSetup={() => setTab('settings')} />
      )}

      {tab === 'settings' && (
        <div className="sp-split sp-split--lead">
          <fieldset className="sp-stack sp-fieldset" disabled={paused}>
            <legend className="sp-sr-only">Ticket panel settings</legend>
            <section className="sp-card" aria-labelledby="tp1">
              <div className="sp-card__head">
                <div className="sp-card__titles">
                  <h2 className="sp-card__title" id="tp1">
                    Where the panel goes
                  </h2>
                  <p className="sp-card__sub">
                    Sparko posts the panel here. Each ticket opens as a private
                    thread under it.
                  </p>
                </div>
              </div>
              <div className="sp-card__body">
                <ChannelPicker
                  channels={config.data.channels}
                  value={panel.channel}
                  onChange={(id) => edit({ channel: id })}
                  error={blocked ? 'Sparko can’t post here yet.' : undefined}
                />
              </div>
            </section>
            <section className="sp-card" aria-labelledby="tp2">
              <div className="sp-card__head">
                <div className="sp-card__titles">
                  <h2 className="sp-card__title" id="tp2">
                    Panel message
                  </h2>
                  <p className="sp-card__sub">
                    What members read before they press a button.
                  </p>
                </div>
              </div>
              <div className="sp-card__body">
                <Input
                  label="Title"
                  maxLength={256}
                  value={panel.title}
                  error={
                    tried && problems.title
                      ? 'Give the panel a title.'
                      : undefined
                  }
                  onChange={(e) => edit({ title: e.target.value })}
                />
                <Textarea
                  label="Description"
                  rows={3}
                  maxLength={1000}
                  value={panel.description}
                  onChange={(e) => edit({ description: e.target.value })}
                />
                <div className="sp-field">
                  <span className="sp-label">Colour bar</span>
                  <ColourChoice
                    value={panel.color}
                    onChange={(color) => edit({ color })}
                  />
                </div>
              </div>
            </section>
            <section className="sp-card" aria-labelledby="tp3">
              <div className="sp-card__head">
                <div className="sp-card__titles">
                  <h2 className="sp-card__title" id="tp3">
                    Buttons
                  </h2>
                  <p className="sp-card__sub">
                    Each button is a ticket topic. Members pick one, and Sparko
                    asks its question first.
                  </p>
                </div>
                <span className="sp-hint sp-tnum">
                  {panel.topics.length} of {maxTopics}
                </span>
              </div>
              <div className="sp-card__body" style={{ gap: 12 }}>
                {panel.topics.map((t, i) => {
                  const bad = tried && problems.labels.includes(t.id);
                  return (
                    <div key={t.id} className="sp-item-box">
                      <div className="sp-item-box__row">
                        <div
                          className={'sp-input' + (bad ? ' is-error' : '')}
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          <input
                            aria-label={`Button ${i + 1} label`}
                            maxLength={80}
                            placeholder="Button label"
                            value={t.label}
                            aria-invalid={bad || undefined}
                            onChange={(e) =>
                              editTopic(t.id, { label: e.target.value })
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          icon="arrow-up"
                          aria-label={`Move button ${i + 1} up`}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          icon="arrow-down"
                          aria-label={`Move button ${i + 1} down`}
                          disabled={i === panel.topics.length - 1}
                          onClick={() => move(i, 1)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          icon="trash-2"
                          aria-label={`Remove button ${i + 1}`}
                          onClick={() =>
                            edit({
                              topics: panel.topics.filter((x) => x.id !== t.id),
                            })
                          }
                        />
                      </div>
                      {bad && (
                        <p className="sp-field-error">
                          <Icon name="circle-alert" />
                          Write a label, or remove this button.
                        </p>
                      )}
                      <Segmented
                        label={`Button ${i + 1} colour`}
                        className="sp-colour-seg"
                        value={t.style}
                        onChange={(style) => editTopic(t.id, { style })}
                        options={buttonStyles.map(([value, label]) => ({
                          value,
                          label,
                        }))}
                      />
                      <Input
                        label="Question Sparko asks first"
                        maxLength={200}
                        value={t.question}
                        onChange={(e) =>
                          editTopic(t.id, { question: e.target.value })
                        }
                      />
                    </div>
                  );
                })}
                {tried && problems.topics && (
                  <p className="sp-field-error">
                    <Icon name="circle-alert" />
                    Add at least one button so members can open a ticket.
                  </p>
                )}
                <Button
                  size="sm"
                  icon="plus"
                  style={{ justifySelf: 'start' }}
                  disabled={panel.topics.length >= maxTopics}
                  onClick={() =>
                    edit({
                      topics: [
                        ...panel.topics,
                        {
                          id: newId(),
                          label: '',
                          style: 'secondary',
                          question: 'What can we help with?',
                        },
                      ],
                    })
                  }
                >
                  Add a button
                </Button>
              </div>
            </section>
            <section className="sp-card" aria-labelledby="tp4">
              <div className="sp-card__head">
                <div className="sp-card__titles">
                  <h2 className="sp-card__title" id="tp4">
                    Who handles tickets
                  </h2>
                  <p className="sp-card__sub">
                    These roles can see every ticket thread and reply.
                  </p>
                </div>
              </div>
              <div className="sp-card__body">
                <div
                  className="sp-chip-row"
                  role="group"
                  aria-label="Staff roles"
                >
                  {config.data.roles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="sp-chip sp-chip--toggle"
                      aria-pressed={panel.roles.includes(r)}
                      onClick={() =>
                        edit({
                          roles: panel.roles.includes(r)
                            ? panel.roles.filter((x) => x !== r)
                            : [...panel.roles, r],
                        })
                      }
                    >
                      @{r}
                    </button>
                  ))}
                </div>
                {tried && problems.roles && (
                  <p className="sp-field-error">
                    <Icon name="circle-alert" />
                    Pick at least one role, or nobody will see new tickets.
                  </p>
                )}
                <div className="sp-switch-list">
                  <Switch
                    checked={panel.ping}
                    onChange={(ping) => edit({ ping })}
                    label="Ping these roles on new tickets"
                    description="Off means staff check the inbox instead."
                  />
                  <Switch
                    checked={panel.onePerMember}
                    onChange={(onePerMember) => edit({ onePerMember })}
                    label="One open ticket per member"
                    description="Stops duplicate tickets about the same thing."
                  />
                </div>
                <Select
                  label="Close automatically when the member stops replying"
                  hint="Sparko warns them 2 hours before closing."
                  value={panel.autoClose}
                  onChange={(e) =>
                    edit({
                      autoClose: e.target.value as TicketPanel['autoClose'],
                    })
                  }
                  options={[
                    { value: 'never', label: 'Never' },
                    { value: '24h', label: 'After 24 hours' },
                    { value: '48h', label: 'After 48 hours' },
                    { value: '7d', label: 'After 7 days' },
                  ]}
                />
              </div>
            </section>
          </fieldset>
          <section className="sp-stack sp-sticky-lg" aria-labelledby="tpv">
            <div className="sp-preview-head">
              <h2 id="tpv" className="sp-section-title">
                Live preview
              </h2>
              <span className="sp-hint">#{channel?.name}</span>
            </div>
            <DiscordPreview>
              <DiscordMessage
                embed={{
                  color: panel.color,
                  title: panel.title || 'Untitled panel',
                  description: panel.description,
                }}
              />
              {panel.topics.length > 0 && (
                <div
                  className="dc-components sp-preview-buttons"
                  role="group"
                  aria-label="Preview a button"
                >
                  <div className="dc-row">
                    {panel.topics.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={
                          'dc-btn' +
                          (t.style !== 'secondary' ? ` dc-btn--${t.style}` : '')
                        }
                        aria-pressed={picked?.id === t.id}
                        onClick={() => setPreview(t.id)}
                      >
                        {t.label || 'Untitled'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </DiscordPreview>
            {picked && (
              <>
                <p className="sp-hint">
                  When someone presses “{picked.label || 'Untitled'}”, a private
                  thread opens with:
                </p>
                <DiscordPreview>
                  <DiscordMessage
                    time="Today at 18:43"
                    content={
                      <>
                        <span className="dc-mention">@tomoko</span> thanks for
                        opening a ticket. {picked.question}
                        {panel.ping && panel.roles.length > 0 && (
                          <>
                            <br />
                            {panel.roles.map((r) => (
                              <span key={r} className="dc-mention">
                                @{r}{' '}
                              </span>
                            ))}
                          </>
                        )}
                      </>
                    }
                  />
                </DiscordPreview>
                <p className="sp-hint">
                  Press the buttons in the preview to see each opener.
                </p>
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'history' && (
        <VersionHistory
          versions={config.data.versions}
          onRestore={(restored) => {
            setDraft({ on: current.on, panel: restored });
            flow.clear();
            setTab('settings');
            toast({
              title: 'Version loaded',
              body: 'Check the preview, then save to use it.',
            });
          }}
        />
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
        error={
          tried && invalid
            ? 'Fix the highlighted fields first.'
            : flow.saveError
        }
        onReset={() => {
          setDraft(null);
          setTried(false);
        }}
        onSave={async () => {
          setTried(true);
          if (invalid) {
            setTab('settings');
            return;
          }
          if (await flow.run(() => save.mutateAsync(current))) {
            setDraft(null);
            setTried(false);
          }
        }}
      />
    </>
  );
}
