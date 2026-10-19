import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Icon,
  Input,
  Modal,
  Segmented,
  cx,
  useToast,
  type ComboItem,
} from '../../ui';
import {
  bdDateProblem,
  bdDateText,
  bdMonths,
  bdRanges,
  bdTimeZones,
  daysIn,
  useBirthdayActions,
  useBirthdayList,
  useBirthdayMembers,
  zoneOffset,
  type BDMemberFound,
  type BDUpcoming,
  type BdEntry,
  type Birthdays,
  type Channel,
  type RoleOption,
  type Server,
} from '../../data';
import { InfoTip } from './EditorBits';
import { DurationInput } from './ARTriggers';
import { ChannelPicker, roleItems } from './parts';

const NONE = 'none';

/** A label with an (i) beside it that says more on hover. */
const tipped = (text: string, tip: string): ReactNode => (
  <>
    {text} <InfoTip text={tip} />
  </>
);

/** "09:00" for each hour of the day. */
const hourItems: ComboItem[] = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
  icon: 'clock',
}));

/** Every time zone, grouped by region, with its offset right now. */
export function useZoneItems(withNone?: string): ComboItem[] {
  // Offsets as of when the page opened; they only move with summer time.
  const [now] = useState(() => Date.now());
  return useMemo(() => {
    const zones = bdTimeZones().map((z) => ({
      value: z,
      label: z.replace(/_/g, ' '),
      icon: 'globe',
      group: z === 'UTC' ? 'Universal' : (z.split('/')[0] ?? 'Other'),
      note: zoneOffset(z, now),
    }));
    return withNone
      ? [
          {
            value: NONE,
            label: withNone,
            icon: 'ban',
            group: 'Default',
          },
          ...zones,
        ]
      : zones;
  }, [withNone, now]);
}

/** Roles for "who can" pickers; Sparko doesn't give them, so any can be picked. */
const anyRoles = (roles: RoleOption[]): ComboItem[] =>
  roleItems(roles.map((r) => ({ ...r, assignable: true })));

/** The Settings tab: when and where, celebrating, and who can save. */
export function BDSettings({
  config,
  channels,
  roles,
  onChange,
}: {
  config: Birthdays;
  channels: Channel[];
  roles: RoleOption[];
  onChange: (patch: Partial<Birthdays>) => void;
}) {
  const channel = channels.find((c) => c.id === config.channel);
  const zones = useZoneItems();
  const offset = zoneOffset(config.timeZone);
  return (
    <div className="sp-stack sp-ar sp-bd">
      <section className="sp-card" aria-labelledby="bd-when">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="bd-when">
              When and where
            </h2>
            <p className="sp-card__sub">
              Where Sparko celebrates, and at what time of day.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="channel">
              <ChannelPicker
                label="Birthday channel"
                channels={channels}
                value={config.channel}
                onChange={(id) => onChange({ channel: id })}
                error={
                  channel && !channel.canPost
                    ? 'Sparko can’t post here yet.'
                    : undefined
                }
                hint="Where birthdays and the monthly list are posted."
              />
            </div>
            <div data-issue="hour">
              <Combobox
                label={tipped(
                  'Celebrate at',
                  'The hour Sparko posts on the day. If Sparko was offline then, it posts as soon as it’s back, the same day.',
                )}
                searchable={false}
                value={String(config.hour)}
                onChange={(v) => onChange({ hour: Number(v) })}
                items={hourItems}
              />
            </div>
          </div>
          <div className="sp-ar__pair">
            <div data-issue="timeZone">
              <Combobox
                label={tipped(
                  'Server time zone',
                  `The time zone the hour is in, and the server’s day for the monthly post. It’s ${offset.replace('UTC', 'UTC ')} there now.`,
                )}
                searchPlaceholder="Search time zones, like London"
                value={config.timeZone}
                onChange={(timeZone) => onChange({ timeZone })}
                items={zones}
              />
            </div>
            <div className="sp-field">
              <span className="sp-label">
                Whose time{' '}
                <InfoTip text="With each member’s own, Sparko celebrates at the hour where they live, if they saved a time zone. Members without one use the server’s." />
              </span>
              <Segmented<Birthdays['zoneMode']>
                label="Whose time"
                value={config.zoneMode}
                onChange={(zoneMode) => onChange({ zoneMode })}
                options={[
                  { value: 'server', label: 'The server’s' },
                  { value: 'member', label: 'Each member’s own' },
                ]}
              />
            </div>
          </div>
          <div className="sp-field">
            <span className="sp-label">
              Posts{' '}
              <InfoTip text="One post names everyone whose birthday it is at the same time, with the Several birthdays message. One each posts the Birthday message for every member." />
            </span>
            <Segmented<Birthdays['style']>
              label="Posts"
              value={config.style}
              onChange={(style) => onChange({ style })}
              options={[
                { value: 'together', label: 'One post for everyone' },
                { value: 'each', label: 'One post each' },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="bd-celebrate">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="bd-celebrate">
              Celebrating
            </h2>
            <p className="sp-card__sub">
              What Sparko does on someone’s birthday.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div data-issue="role" className="sp-bd-role">
            <Combobox
              label={tipped(
                'Birthday role',
                'Given on their birthday and taken back 24 hours later. Sparko’s role has to be above it.',
              )}
              searchPlaceholder="Search roles"
              value={config.role || NONE}
              onChange={(v) => onChange({ role: v === NONE ? '' : v })}
              items={[
                { value: NONE, label: 'None', icon: 'ban', group: 'Default' },
                ...roleItems(roles, [config.role]),
              ]}
            />
          </div>
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.ping}
              onChange={(ping) => onChange({ ping })}
              label="Ping the birthday members"
              description="Their mentions in the post notify them. Nobody else is pinged."
            />
            <Checkbox
              checked={config.showAge}
              onChange={(showAge) => onChange({ showAge })}
              label="Show their age"
              description="Fills {birthday.age} when they saved the year they were born. The year itself is never shown."
            />
            <Checkbox
              checked={config.dm}
              onChange={(dm) => onChange({ dm })}
              label="Send a birthday DM"
              description="Each member also gets the DM message. People who don’t take DMs from the server won’t get it."
            />
            <Checkbox
              checked={config.monthly}
              onChange={(monthly) => onChange({ monthly })}
              label="Post “Birthdays this month” on the 1st"
              description="At the same hour, in the server’s time zone, with every birthday that month."
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="bd-who">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="bd-who">
              Members and limits
            </h2>
            <p className="sp-card__sub">
              Who can save a birthday, how often, and what happens when they
              leave.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="staff">
              <Combobox
                label={tipped(
                  'Who can manage birthdays',
                  'These roles can set and remove anyone’s birthday with the command, without the limits below. Leave it empty for members with Manage Server.',
                )}
                multiple
                placeholder="Manage Server only"
                searchPlaceholder="Search roles"
                value={config.staff}
                onChange={(staff) => onChange({ staff })}
                items={anyRoles(roles)}
              />
            </div>
            <div data-issue="changeCooldown">
              <DurationInput
                label="Time between changes"
                tip="How long after changing their date a member can change it again, so nobody gets celebrated every week. Use d, w, mt and y, like 30d or 1mt. Leave it empty to allow changes any time."
                value={config.changeCooldown}
                placeholder="Any time"
                range={bdRanges.changeCooldown}
                format="Use d, w, mt and y, like 30d or 1mt."
                onChange={(changeCooldown) => onChange({ changeCooldown })}
              />
            </div>
          </div>
          <div className="sp-ar__pair">
            <div data-issue="minAccountAge">
              <DurationInput
                label="Minimum account age"
                tip="How old a member’s Discord account has to be before they can save a birthday. Use d, w, mt and y, like 7d. Leave it empty for any age."
                value={config.minAccountAge}
                placeholder="Any age"
                range={bdRanges.minAccountAge}
                format="Use d, w, mt and y, like 7d or 1mt."
                onChange={(minAccountAge) => onChange({ minAccountAge })}
              />
            </div>
            <div data-issue="minMemberAge">
              <DurationInput
                label="Minimum time in the server"
                tip="How long someone has to have been in the server before they can save a birthday. Use h, d, w and mt, like 12h or 3d. Leave it empty for no wait."
                value={config.minMemberAge}
                placeholder="No wait"
                range={bdRanges.minMemberAge}
                format="Use h, d, w and mt, like 12h or 3d."
                onChange={(minMemberAge) => onChange({ minMemberAge })}
              />
            </div>
          </div>
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.requireYear}
              onChange={(requireYear) => onChange({ requireYear })}
              label="Ask for the year"
              description="Members have to give the year they were born. It’s only used for their age."
            />
            <Checkbox
              checked={config.hideLeft}
              onChange={(hideLeft) => onChange({ hideLeft })}
              label="Hide birthdays of members who left"
              description="They’re left out of the lists and the monthly post until they’re back. Sparko never celebrates someone who isn’t here."
            />
            <Checkbox
              checked={config.forgetLeavers}
              onChange={(forgetLeavers) => onChange({ forgetLeavers })}
              label="Forget members who leave"
              description="Their birthday is deleted when they leave, so they’d have to save it again."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// Storage ---------------------------------------------------------------------

const monthItems: ComboItem[] = bdMonths.map((m, i) => ({
  value: String(i + 1),
  label: m,
}));
const thisYear = new Date().getFullYear();

/** "today", "tomorrow" or "in 12 days". */
const whenText = (days: number) =>
  days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;

const ageNow = (b: BdEntry) => {
  if (b.year === null) return null;
  const d = new Date();
  const had =
    d.getMonth() + 1 > b.month ||
    (d.getMonth() + 1 === b.month && d.getDate() >= b.day);
  return d.getFullYear() - b.year - (had ? 0 : 1);
};

type Editing = { mode: 'add' } | { mode: 'edit'; entry: BdEntry } | null;

/** Add or change a member's birthday. */
function BirthdayForm({
  server,
  config,
  editing,
  onClose,
}: {
  server: Server;
  config: Birthdays;
  editing: Exclude<Editing, null>;
  onClose: () => void;
}) {
  const old = editing.mode === 'edit' ? editing.entry : null;
  const [who, setWho] = useState<BDMemberFound | null>(
    old
      ? { userId: old.userId, name: old.name, avatar: old.avatar, saved: true }
      : null,
  );
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [day, setDay] = useState(old ? String(old.day) : '');
  const [month, setMonth] = useState(old ? String(old.month) : '');
  const [year, setYear] = useState(old?.year ? String(old.year) : '');
  const [zone, setZone] = useState(old?.timeZone || NONE);
  const [tried, setTried] = useState(false);
  const [now] = useState(() => Date.now());
  const found = useBirthdayMembers(server.id, query);
  const actions = useBirthdayActions(server.id);
  const toast = useToast();
  const zones = useZoneItems('The server’s time zone');
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const date = {
    day: Number(day),
    month: Number(month),
    year: year.trim() ? Number(year) : null,
  };
  const problem = !who
    ? 'Pick the member first.'
    : !month
      ? 'Pick a month.'
      : bdDateProblem(config, date, now);
  const save = () => {
    setTried(true);
    if (problem || !who) return;
    actions.set.mutate(
      {
        userId: who.userId,
        ...date,
        timeZone: zone === NONE ? '' : zone,
      },
      {
        onSuccess: () => {
          toast({
            title: `Saved ${who.name}’s birthday`,
            body: bdDateText(date.day, date.month),
          });
          onClose();
        },
        onError: (e) =>
          toast({
            tone: 'danger',
            title: 'Couldn’t save it',
            body: e.message,
          }),
      },
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      icon="gift"
      title={old ? `${old.name}’s birthday` : 'Add a birthday'}
      description={
        old
          ? 'Staff changes skip the time between changes.'
          : 'Find a member of the server, then their birthday.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={actions.set.isPending}
            onClick={save}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="sp-stack sp-bd-form">
        {!old &&
          (who ? (
            <div className="sp-bd-picked">
              <img className="sp-bd-avatar" src={who.avatar} alt="" />
              <span className="sp-bd-row__name">{who.name}</span>
              <span className="sp-hint sp-tnum">{who.userId}</span>
              <Button size="sm" variant="ghost" onClick={() => setWho(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="sp-stack sp-bd-find">
              <Input
                label={tipped(
                  'Member',
                  'Search by their name or paste their user ID.',
                )}
                icon="search"
                aria-label="Find a member"
                placeholder="Name or user ID"
                value={typed}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
              />
              {query.trim() && (
                <ul className="sp-bd-found" aria-label="Members found">
                  {(found.data ?? []).map((m) => (
                    <li key={m.userId}>
                      <button
                        type="button"
                        className="sp-bd-found__item"
                        onClick={() => setWho(m)}
                      >
                        <img className="sp-bd-avatar" src={m.avatar} alt="" />
                        <span className="sp-bd-row__name">{m.name}</span>
                        <span className="sp-hint sp-tnum">{m.userId}</span>
                        {m.saved && (
                          <Badge size="sm" className="sp-bd-found__saved">
                            Saved already
                          </Badge>
                        )}
                      </button>
                    </li>
                  ))}
                  {found.isSuccess && !found.data.length && (
                    <li className="sp-hint sp-bd-found__none">
                      Nobody in the server matches “{query.trim()}”.
                    </li>
                  )}
                </ul>
              )}
            </div>
          ))}
        <div className="sp-bd-date">
          <Input
            label="Day"
            type="number"
            min={1}
            max={month ? daysIn(Number(month), date.year) : 31}
            value={day}
            placeholder="14"
            onChange={(e) => setDay(e.target.value.slice(0, 2))}
          />
          <Combobox
            label="Month"
            searchable={false}
            placeholder="Pick a month"
            value={month}
            onChange={setMonth}
            items={monthItems}
          />
          <Input
            label={tipped(
              config.requireYear ? 'Year' : 'Year (optional)',
              'Only used for their age. It’s never shown.',
            )}
            aria-label="Year"
            type="number"
            min={thisYear - 120}
            max={thisYear - 13}
            value={year}
            placeholder={config.requireYear ? '2001' : 'Not saved'}
            onChange={(e) => setYear(e.target.value.slice(0, 4))}
          />
        </div>
        <Combobox
          label={tipped(
            'Time zone',
            'Used when Settings celebrate in each member’s own time zone.',
          )}
          searchPlaceholder="Search time zones, like London"
          value={zone}
          onChange={setZone}
          items={zones}
        />
        {tried && problem && (
          <p className="sp-field-error">
            <Icon name="circle-alert" />
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** The next birthdays, beside the list. */
function Upcoming({ list }: { list: BDUpcoming[] }) {
  return (
    <section className="sp-card sp-bd-upcoming" aria-labelledby="bd-upcoming">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="bd-upcoming">
            Upcoming
          </h2>
          <p className="sp-card__sub">The next 10 birthdays.</p>
        </div>
      </div>
      {list.length ? (
        <ol className="sp-bd-next">
          {list.map((b) => (
            <li
              key={b.userId}
              className={cx('sp-bd-next__row', b.next.days === 0 && 'is-today')}
            >
              <span className="sp-bd-next__date">
                <span className="sp-bd-next__day sp-tnum">{b.next.day}</span>
                <span className="sp-bd-next__month">
                  {bdMonths[b.next.month - 1]!.slice(0, 3)}
                </span>
              </span>
              <span className="sp-bd-next__who">
                <span className="sp-bd-row__name">{b.name}</span>
                <span className="sp-hint">
                  {whenText(b.next.days)}
                  {b.age !== null && ` · turns ${b.age}`}
                </span>
              </span>
              {b.next.days === 0 && (
                <span className="sp-bd-next__cake" aria-label="Birthday today">
                  🎂
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon="calendar" title="Nothing coming up">
          Birthdays show here once members save them.
        </EmptyState>
      )}
    </section>
  );
}

/** The Storage tab: every birthday by month, and the next ones. */
export function BDStorage({
  server,
  config,
  count,
  paused,
}: {
  server: Server;
  config: Birthdays;
  count: number;
  paused: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const list = useBirthdayList(server.id, query);
  const actions = useBirthdayActions(server.id);
  const toast = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<BdEntry | null>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const items = list.data?.birthdays ?? [];
  const months = bdMonths
    .map((name, i) => ({
      name,
      list: items.filter((b) => b.month === i + 1),
    }))
    .filter((m) => m.list.length);
  const shownCount = list.data?.count ?? count;
  const cmd = `/${config.commands.group.name} ${config.commands.set.name}`;

  return (
    <div className="sp-bd-storage">
      <section className="sp-card" aria-labelledby="bd-storage">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="bd-storage">
              Storage
            </h2>
            <p className="sp-card__sub">
              {shownCount.toLocaleString('en-US')}{' '}
              {shownCount === 1 ? 'birthday' : 'birthdays'} saved, by month.
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            icon="plus"
            disabled={paused}
            onClick={() => setEditing({ mode: 'add' })}
          >
            Add a birthday
          </Button>
        </div>
        <div className="sp-card__body sp-stack">
          <Input
            aria-label="Search birthdays"
            icon="search"
            placeholder="Search by name or user ID"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          {list.isPending ? (
            <div className="sp-skel sp-skel--block" style={{ height: 220 }} />
          ) : months.length ? (
            <div className="sp-bd-months">
              {months.map((m) => (
                <section
                  key={m.name}
                  className="sp-bd-month"
                  aria-label={m.name}
                >
                  <h3 className="sp-bd-month__title">
                    {m.name}
                    <span className="sp-hint sp-tnum">{m.list.length}</span>
                  </h3>
                  <ul className="sp-bd-rows">
                    {m.list.map((b) => {
                      const age = config.showAge ? ageNow(b) : null;
                      return (
                        <li
                          key={b.userId}
                          className={cx('sp-bd-row', !b.inServer && 'is-left')}
                        >
                          <span className="sp-bd-row__day sp-tnum">
                            {b.day}
                          </span>
                          <img
                            className="sp-bd-avatar"
                            src={b.avatar || undefined}
                            alt=""
                          />
                          <span className="sp-bd-row__main">
                            <span className="sp-bd-row__line">
                              <span className="sp-bd-row__name">{b.name}</span>
                              {!b.inServer && (
                                <Badge size="sm">Left the server</Badge>
                              )}
                              {b.roleUntil && b.roleUntil > now && (
                                <Badge size="sm" tone="brand">
                                  🎂 Today
                                </Badge>
                              )}
                            </span>
                            <span className="sp-hint sp-bd-row__meta">
                              {bdDateText(b.day, b.month)}
                              {age !== null && ` · ${age} years old`}
                              {' · '}
                              {b.timeZone
                                ? b.timeZone.replace(/_/g, ' ')
                                : 'Server time'}
                              {b.setById !== b.userId &&
                                ` · set by ${b.setByName}`}
                            </span>
                          </span>
                          <span className="sp-bd-row__actions">
                            <button
                              type="button"
                              className="sp-icon-btn"
                              disabled={paused}
                              aria-label={`Edit ${b.name}’s birthday`}
                              onClick={() =>
                                setEditing({ mode: 'edit', entry: b })
                              }
                            >
                              <Icon name="pencil" size="sm" />
                            </button>
                            <button
                              type="button"
                              className="sp-icon-btn sp-icon-btn--danger"
                              disabled={paused}
                              aria-label={`Remove ${b.name}’s birthday`}
                              onClick={() => setRemoving(b)}
                            >
                              <Icon name="trash-2" size="sm" />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState icon="gift" title="No birthdays here">
              {query.trim()
                ? 'Nothing matches. Try another name or ID.'
                : `Members save theirs with ${cmd}. They show here by month.`}
            </EmptyState>
          )}
        </div>
      </section>
      <Upcoming list={list.data?.upcoming ?? []} />
      {editing && (
        <BirthdayForm
          server={server}
          config={config}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        icon="trash-2"
        title={`Remove ${removing?.name ?? ''}’s birthday?`}
        description="Sparko forgets it, and takes the birthday role back if they have it today. They can save it again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actions.remove.isPending}
              onClick={() =>
                removing &&
                actions.remove.mutate(removing.userId, {
                  onSuccess: () => {
                    toast({ title: `Removed ${removing.name}’s birthday` });
                    setRemoving(null);
                  },
                  onError: (e) =>
                    toast({
                      tone: 'danger',
                      title: 'Couldn’t remove it',
                      body: e.message,
                    }),
                })
              }
            >
              Remove
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}
