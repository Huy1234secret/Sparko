import { useEffect, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Icon,
  Input,
  Modal,
  cx,
  useToast,
  type ComboItem,
} from '../../ui';
import {
  tvActAbout,
  tvActEmoji,
  tvActNames,
  tvActs,
  tvBitrates,
  tvMaxBitrate,
  tvNewHub,
  tvPanelRows,
  useTempVoiceActions,
  useVoicePrefs,
  useVoiceRooms,
  type CategoryOption,
  type Channel,
  type RoleOption,
  type Server,
  type TempVoice,
  type TvAct,
  type TvHub,
  type TvPrefs,
  type TvRoom,
  type TvRoomStyle,
  type VoiceChannel,
} from '../../data';
import { AnimatedIconButton, InfoTip } from './EditorBits';
import { Used } from './ARTriggers';
import { newId, roleItems } from './parts';
import { plusAnimations } from './StudioLibrary';

const NONE = 'none';

/** A label with an (i) beside it that says more on hover. */
const tipped = (text: string, tip: string): ReactNode => (
  <>
    {text} <InfoTip text={tip} />
  </>
);

const delays = [0, 5, 10, 15, 30, 60];
const delayItems: ComboItem[] = delays.map((s) => ({
  value: String(s),
  label: s ? `After ${s} seconds` : 'Straight away',
  icon: 'timer',
}));
const roomItems: ComboItem[] = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: n === 1 ? '1 room' : `${n} rooms`,
  icon: 'volume-2',
}));

/** Bitrates, with the ones the server's boosts don't allow locked. */
const bitrateItems = (boostLevel: number, picked: number): ComboItem[] =>
  tvBitrates.map((b) => {
    const allowed = b <= tvMaxBitrate(boostLevel);
    return {
      value: String(b),
      label: `${b} kbps`,
      icon: 'sliders-horizontal',
      ...(allowed
        ? {}
        : { disabled: b !== picked, note: 'Needs more server boosts' }),
    };
  });

/** The hub (or create) category picker's choices. */
const categoryItems = (
  categories: CategoryOption[],
  own: string,
): ComboItem[] => [
  { value: NONE, label: own, icon: 'layers', group: 'Default' },
  ...categories.map((c) => ({
    value: c.id,
    label: c.name,
    icon: 'layers',
    group: 'Categories',
  })),
];

/** How rooms start out: shared by every hub and Create room. */
function StyleFields({
  style,
  categories,
  boostLevel,
  ownCategory,
  onChange,
}: {
  style: TvRoomStyle;
  categories: CategoryOption[];
  boostLevel: number;
  /** What "no category picked" means here. */
  ownCategory: { label: string; tip: string };
  onChange: (patch: Partial<TvRoomStyle>) => void;
}) {
  const limitBad =
    !/^\d{1,2}$/.test(String(style.limit)) ||
    style.limit < 0 ||
    style.limit > 99;
  return (
    <>
      <div className="sp-ar__pair">
        <Combobox
          label={tipped('Rooms go in', ownCategory.tip)}
          searchPlaceholder="Search categories"
          value={style.category || NONE}
          onChange={(v) => onChange({ category: v === NONE ? '' : v })}
          items={categoryItems(categories, ownCategory.label)}
        />
        <Input
          label="Room name"
          hint="Write {user.name} for the owner’s name and {count} for a number, like {user.name}’s room or Squad #{count}. Members can rename their own room."
          maxLength={100}
          value={style.name}
          placeholder="{user.name}’s room"
          onChange={(e) => onChange({ name: e.target.value })}
          {...(!style.name.trim() ? { error: 'Give rooms a name.' } : {})}
        />
      </div>
      <div className="sp-ar__pair">
        <Input
          label="User limit"
          hint="How many people can join a room, from 1 to 99. 0 means no limit. Owners can change it."
          type="number"
          min={0}
          max={99}
          value={String(style.limit)}
          onChange={(e) =>
            onChange({
              limit:
                e.target.value === '' ? 0 : Math.floor(Number(e.target.value)),
            })
          }
          {...(limitBad ? { error: 'From 0 (no limit) to 99.' } : {})}
        />
        <Combobox
          label={tipped(
            'Bitrate',
            `The sound quality. Discord allows up to ${tvMaxBitrate(boostLevel)} kbps at this server’s boost level; more boosts unlock up to 384 kbps.`,
          )}
          searchable={false}
          value={String(style.bitrate)}
          onChange={(v) => onChange({ bitrate: Number(v) })}
          items={bitrateItems(boostLevel, style.bitrate)}
        />
      </div>
      <div className="sp-tv-flags">
        <Checkbox
          checked={style.locked}
          onChange={(locked) => onChange({ locked })}
          label="Start locked"
          description="Only members the owner trusts can join."
        />
        <Checkbox
          checked={style.hidden}
          onChange={(hidden) => onChange({ hidden })}
          label="Start hidden"
          description="Only trusted members can see the room."
        />
        <Checkbox
          checked={style.chat}
          onChange={(chat) => onChange({ chat })}
          label="Text chat in rooms"
          description="Members can write in the room’s built-in chat."
        />
      </div>
    </>
  );
}

/** The hub's voice channel picker. */
const voiceItems = (voice: VoiceChannel[], taken: string[], mine: string) =>
  voice.map((v) => ({
    value: v.id,
    label: v.name,
    icon: 'volume-2',
    group: v.category,
    ...(taken.includes(v.id) && v.id !== mine
      ? { disabled: true, note: 'Another hub' }
      : {}),
  }));

/** The Settings tab: hubs, Create room, rooms, and the control panel. */
export function TVSettings({
  server,
  config,
  limits,
  boostLevel,
  channels,
  voice,
  categories,
  roles,
  panelAt,
  dirty,
  posting,
  onPost,
  onChange,
}: {
  server: Server;
  config: TempVoice;
  limits: { hubs: number };
  boostLevel: number;
  channels: Channel[];
  voice: VoiceChannel[];
  categories: CategoryOption[];
  roles: RoleOption[];
  /** Where the panel is posted now. */
  panelAt: string | null;
  dirty: boolean;
  posting: boolean;
  onPost: () => void;
  onChange: (patch: Partial<TempVoice>) => void;
}) {
  const editHub = (id: string, patch: Partial<TvHub>) =>
    onChange({
      hubs: config.hubs.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    });
  const full = config.hubs.length >= limits.hubs;
  const panelChannel = channels.find((c) => c.id === config.panel.channel);
  const posted = channels.find((c) => c.id === panelAt);
  const toggle = (a: TvAct, on: boolean) =>
    onChange({
      panel: {
        ...config.panel,
        buttons: tvActs.filter((x) =>
          x === a ? on : config.panel.buttons.includes(x),
        ),
      },
    });
  const rows = tvPanelRows(config);
  return (
    <div className="sp-stack sp-ar sp-tv">
      <section className="sp-card" aria-labelledby="tv-hubs" data-issue="hubs">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="tv-hubs">
              Hubs
            </h2>
            <p className="sp-card__sub">
              Voice channels members join to get a room of their own. Sparko
              makes the room and moves them in.
            </p>
          </div>
          <div className="sp-ar__head-actions">
            <Used
              n={config.hubs.length}
              max={limits.hubs}
              what="hubs"
              icon="voice"
            />
            <AnimatedIconButton
              size="sm"
              {...plusAnimations}
              disabled={full}
              title={
                full
                  ? limits.hubs === 1
                    ? 'The Free plan has 1 hub. Plus has up to 10.'
                    : `This plan has up to ${limits.hubs} hubs.`
                  : undefined
              }
              onClick={() =>
                onChange({ hubs: [...config.hubs, tvNewHub(newId())] })
              }
            >
              Hub
            </AnimatedIconButton>
          </div>
        </div>
        <div className="sp-card__body">
          {config.hubs.length ? (
            <ul className="sp-ar__list">
              {config.hubs.map((h, i) => (
                <li
                  key={h.id}
                  className="sp-ar__item sp-tv-hub"
                  aria-label={`Hub ${i + 1}`}
                  data-issue={`hub:${h.id}`}
                >
                  <div className="sp-tv-hub__head">
                    <h3 className="sp-ar__item-title">Hub {i + 1}</h3>
                    <button
                      type="button"
                      className="sp-icon-btn sp-icon-btn--danger"
                      aria-label={`Remove hub ${i + 1}`}
                      onClick={() =>
                        onChange({
                          hubs: config.hubs.filter((x) => x.id !== h.id),
                        })
                      }
                    >
                      <Icon name="trash-2" size="sm" />
                    </button>
                  </div>
                  <Combobox
                    label={tipped(
                      'Hub channel',
                      'The voice channel members join. Sparko makes their room straight away and moves them into it.',
                    )}
                    placeholder="Pick a voice channel"
                    searchPlaceholder="Search voice channels"
                    value={h.channel}
                    onChange={(channel) => editHub(h.id, { channel })}
                    items={voiceItems(
                      voice,
                      config.hubs.map((x) => x.channel),
                      h.channel,
                    )}
                  />
                  <StyleFields
                    style={h}
                    categories={categories}
                    boostLevel={boostLevel}
                    ownCategory={{
                      label: 'The hub’s category',
                      tip: 'The category rooms from this hub are made in. Rooms in a private category stay private.',
                    }}
                    onChange={(patch) => editHub(h.id, patch)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="sp-hint">
              No hubs yet. Add one, then pick the voice channel members join to
              get a room.
            </p>
          )}
          {full && server.plan !== 'plus' && (
            <p className="sp-hint sp-tv-upsell">
              <Icon name="crown" size="sm" /> Plus has up to 10 hubs, each with
              its own name, limit and category.
            </p>
          )}
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="tv-create"
        data-issue="create"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="tv-create">
              Create room button and command
            </h2>
            <p className="sp-card__sub">
              Rooms made with the panel’s Create room button or /
              {config.commands.group.name} {config.commands.create.name}. If
              nobody joins within a minute, they’re deleted.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <StyleFields
            style={config.create}
            categories={categories}
            boostLevel={boostLevel}
            ownCategory={{
              label: 'Where it was asked',
              tip: 'The category rooms are made in. By default, the category of the channel the button or command was used in.',
            }}
            onChange={(patch) =>
              onChange({ create: { ...config.create, ...patch } })
            }
          />
        </div>
      </section>

      <section className="sp-card" aria-labelledby="tv-rooms">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="tv-rooms">
              Rooms
            </h2>
            <p className="sp-card__sub">
              When empty rooms go, how many a member can own, and what Sparko
              remembers.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="deleteAfter">
              <Combobox
                label={tipped(
                  'Delete empty rooms',
                  'How long a room waits once the last person leaves. If someone joins in that time, it stays. Rooms emptied while Sparko was offline are cleaned up when it’s back.',
                )}
                searchable={false}
                value={String(config.deleteAfter)}
                onChange={(v) => onChange({ deleteAfter: Number(v) })}
                items={delayItems}
              />
            </div>
            <div data-issue="maxRooms">
              <Combobox
                label={tipped(
                  'Rooms per member',
                  'How many rooms one member can own at once. Joining a hub with no rooms left moves them into their newest room instead.',
                )}
                searchable={false}
                value={String(config.maxRooms)}
                onChange={(v) => onChange({ maxRooms: Number(v) })}
                items={roomItems}
              />
            </div>
            <div data-issue="bypassRole">
              <Combobox
                label={tipped(
                  'Bypass role',
                  'Members with this role can own any number of rooms, and join rooms that are locked or hidden.',
                )}
                searchPlaceholder="Search roles"
                value={config.bypassRole || NONE}
                onChange={(v) => onChange({ bypassRole: v === NONE ? '' : v })}
                items={[
                  { value: NONE, label: 'None', icon: 'ban', group: 'Default' },
                  ...roleItems(roles.map((r) => ({ ...r, assignable: true }))),
                ]}
              />
            </div>
          </div>
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.remember}
              onChange={(remember) => onChange({ remember })}
              label="Remember each member’s settings"
              description="A member’s room name, limit, lock, and trusted and blocked members are used again for their next room. Staff can reset them in Storage."
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="tv-panel">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="tv-panel">
              Control panel
            </h2>
            <p className="sp-card__sub">
              A message with buttons members use to manage their room. Change
              its text in Edit.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-post-row" data-issue="panel:channel">
            <Combobox
              label={tipped(
                'Panel channel',
                'Where Sparko posts the panel. Saving updates it in place.',
              )}
              searchPlaceholder="Search channels"
              placeholder="Pick a channel"
              value={config.panel.channel || NONE}
              onChange={(v) =>
                onChange({
                  panel: { ...config.panel, channel: v === NONE ? '' : v },
                })
              }
              footer="Locked channels are ones Sparko can’t post in yet."
              error={
                panelChannel && !panelChannel.canPost
                  ? 'Sparko can’t post here yet.'
                  : undefined
              }
              items={[
                {
                  value: NONE,
                  label: 'Don’t post a panel',
                  icon: 'ban',
                  group: 'Default',
                },
                ...channels.map((c) => ({
                  value: c.id,
                  label: c.name,
                  icon: 'hash',
                  group: c.category,
                  disabled: !c.canPost && c.id !== config.panel.channel,
                  ...(c.canPost ? {} : { note: 'Sparko can’t post' }),
                })),
              ]}
            />
            <Button
              variant="primary"
              icon="send"
              loading={posting}
              disabled={dirty || !config.panel.channel || !!server.paused}
              title={dirty ? 'Save your changes first.' : undefined}
              onClick={onPost}
            >
              {posted ? 'Post again' : 'Post panel'}
            </Button>
          </div>
          <p className="sp-hint sp-tv-posted">
            {dirty
              ? 'Save first. Saving posts or updates the panel too.'
              : posted
                ? `Posted in #${posted.name}. Post again if someone deleted it.`
                : config.panel.channel
                  ? 'Not posted yet.'
                  : 'Members can still use the commands without a panel.'}
          </p>
          <div className="sp-field" data-issue="panel:buttons">
            <span className="sp-label">
              Buttons{' '}
              <InfoTip text="The buttons under the panel. Each one acts on the room the member owns or is in; only the owner can change it." />
              <span className="sp-hint sp-tv-rows">
                {config.panel.buttons.length} buttons ·{' '}
                {rows === 1 ? '1 row' : `${rows} rows`} of 5
              </span>
            </span>
            <div className="sp-tv-buttons">
              {tvActs.map((a) => (
                <Checkbox
                  key={a}
                  checked={config.panel.buttons.includes(a)}
                  onChange={(on) => toggle(a, on)}
                  label={
                    <span className="sp-tv-button-label">
                      <span aria-hidden="true">{tvActEmoji[a]}</span>
                      {tvActNames[a]}
                      <InfoTip text={tvActAbout[a]} />
                    </span>
                  }
                />
              ))}
            </div>
          </div>
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.panel.labels}
              onChange={(labels) =>
                onChange({ panel: { ...config.panel, labels } })
              }
              label="Show button names"
              description="Off shows only the emoji, for a smaller panel."
            />
            <Checkbox
              checked={config.panel.inRooms}
              onChange={(inRooms) =>
                onChange({ panel: { ...config.panel, inRooms } })
              }
              label="Post the panel in every new room"
              description="It goes in the room’s own text chat, with {room} variables filled in."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// Storage ---------------------------------------------------------------------

const ago = (at: number, now: number) => {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};
const initial = (name: string) => [...name][0]?.toUpperCase() ?? '?';

/** The Storage tab: open rooms, and what members saved. */
export function TVStorage({
  server,
  config,
  voice,
  paused,
}: {
  server: Server;
  config: TempVoice;
  voice: VoiceChannel[];
  paused: boolean;
}) {
  const rooms = useVoiceRooms(server.id);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const prefs = useVoicePrefs(server.id, query);
  const actions = useTempVoiceActions(server.id);
  const toast = useToast();
  const [closing, setClosing] = useState<TvRoom | null>(null);
  const [resetting, setResetting] = useState<TvPrefs | null>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);
  const hubName = (id: string) => {
    if (!id) return 'Create room';
    const i = config.hubs.findIndex((h) => h.id === id);
    const ch = voice.find((v) => v.id === config.hubs[i]?.channel);
    return ch ? ch.name : 'A removed hub';
  };
  const list = rooms.data ?? [];
  const saved = prefs.data?.prefs ?? [];
  const count = prefs.data?.count ?? 0;

  return (
    <div className="sp-stack sp-tv-storage">
      <section className="sp-card" aria-labelledby="tv-open">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="tv-open">
              Open rooms
            </h2>
            <p className="sp-card__sub">
              {list.length === 1 ? '1 room' : `${list.length} rooms`} right now.
              Close one to delete it in Discord.
            </p>
          </div>
        </div>
        {rooms.isPending ? (
          <div className="sp-card__body">
            <div className="sp-skel sp-skel--block" style={{ height: 160 }} />
          </div>
        ) : list.length ? (
          <ul className="sp-tv-rooms" aria-label="Open rooms">
            {list.map((r) => (
              <li key={r.channelId} className="sp-tv-room">
                <span className="sp-tv-room__icon" aria-hidden="true">
                  <Icon name="volume-2" size="sm" />
                </span>
                <span className="sp-tv-room__main">
                  <span className="sp-tv-room__line">
                    <span className="sp-tv-room__name">{r.name}</span>
                    {r.locked && (
                      <Badge size="sm" icon="lock">
                        Locked
                      </Badge>
                    )}
                    {r.hidden && (
                      <Badge size="sm" icon="eye">
                        Hidden
                      </Badge>
                    )}
                    {r.state === 'waiting' && (
                      <Badge size="sm" tone="warning">
                        Waiting for someone
                      </Badge>
                    )}
                  </span>
                  <span className="sp-hint sp-tv-room__meta">
                    <span className="sp-tv-owner">
                      <span className="sp-tv-owner__dot">
                        {initial(r.ownerName)}
                      </span>
                      {r.ownerName}
                    </span>
                    {' · '}
                    {hubName(r.hubId)}
                    {' · made '}
                    {ago(r.createdAt, now)}
                  </span>
                </span>
                <span
                  className={cx('sp-tv-room__count', !r.members && 'is-empty')}
                  title="People in the room"
                >
                  <Icon name="users" size="sm" />
                  <span className="sp-tnum">
                    {r.members}
                    {r.limit ? `/${r.limit}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="sp-icon-btn sp-icon-btn--danger"
                  disabled={paused}
                  aria-label={`Close ${r.name}`}
                  onClick={() => setClosing(r)}
                >
                  <Icon name="trash-2" size="sm" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="volume-2" title="No rooms open">
            Rooms show here while they’re open, with who owns them and who’s in
            them.
          </EmptyState>
        )}
      </section>

      <section className="sp-card" aria-labelledby="tv-saved">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="tv-saved">
              Saved member settings
            </h2>
            <p className="sp-card__sub">
              {count === 1
                ? '1 member'
                : `${count.toLocaleString('en-US')} members`}{' '}
              {config.remember
                ? 'saved how they like their room.'
                : 'saved settings. Remembering is off in Settings, so they aren’t used.'}
            </p>
          </div>
        </div>
        <div className="sp-card__body sp-stack">
          <Input
            aria-label="Search saved settings"
            icon="search"
            placeholder="Search by member, room name or user ID"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          {prefs.isPending ? (
            <div className="sp-skel sp-skel--block" style={{ height: 160 }} />
          ) : saved.length ? (
            <ul className="sp-tv-prefs" aria-label="Saved settings">
              {saved.map((p) => (
                <li key={p.userId} className="sp-tv-pref">
                  <span className="sp-tv-owner__dot sp-tv-pref__dot">
                    {initial(p.userName)}
                  </span>
                  <span className="sp-tv-room__main">
                    <span className="sp-tv-room__line">
                      <span className="sp-tv-room__name">{p.userName}</span>
                      {p.name && (
                        <span className="sp-tv-pref__room">“{p.name}”</span>
                      )}
                    </span>
                    <span className="sp-hint sp-tv-room__meta">
                      {[
                        p.limit === null
                          ? 'Hub’s limit'
                          : p.limit
                            ? `Limit ${p.limit}`
                            : 'No limit',
                        p.locked ? 'Locked' : 'Unlocked',
                        `${p.trusted.length} trusted`,
                        `${p.blocked.length} blocked`,
                        `saved ${ago(p.updatedAt, now)}`,
                      ].join(' · ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="sp-icon-btn"
                    disabled={paused}
                    aria-label={`Reset ${p.userName}’s settings`}
                    onClick={() => setResetting(p)}
                  >
                    <Icon name="rotate-ccw" size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="save" title="Nothing saved">
              {query.trim()
                ? 'Nothing matches. Try another name or ID.'
                : 'When members rename, limit or lock their room, Sparko remembers it for next time.'}
            </EmptyState>
          )}
        </div>
      </section>

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        icon="trash-2"
        title={`Close “${closing?.name ?? ''}”?`}
        description="Sparko deletes the room in Discord and disconnects everyone in it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actions.close.isPending}
              onClick={() =>
                closing &&
                actions.close.mutate(closing.channelId, {
                  onSuccess: () => {
                    toast({ title: `Closed “${closing.name}”` });
                    setClosing(null);
                  },
                  onError: (e) =>
                    toast({
                      tone: 'danger',
                      title: 'Couldn’t close it',
                      body: e.message,
                    }),
                })
              }
            >
              Close room
            </Button>
          </>
        }
      >
        {null}
      </Modal>
      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        icon="rotate-ccw"
        title={`Reset ${resetting?.userName ?? ''}’s settings?`}
        description="Their next room starts from the hub’s settings again. Rooms open now don’t change."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actions.reset.isPending}
              onClick={() =>
                resetting &&
                actions.reset.mutate(resetting.userId, {
                  onSuccess: () => {
                    toast({ title: `Reset ${resetting.userName}’s settings` });
                    setResetting(null);
                  },
                  onError: (e) =>
                    toast({
                      tone: 'danger',
                      title: 'Couldn’t reset them',
                      body: e.message,
                    }),
                })
              }
            >
              Reset
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}
