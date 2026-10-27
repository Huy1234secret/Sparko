import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Icon,
  Input,
  Modal,
  RevealIcon,
  Segmented,
  Textarea,
  animIcons,
  cx,
  useToast,
  type ComboItem,
} from '../../ui';
import {
  evAnswerNames,
  evBlank,
  evEventIssue,
  evOpen,
  evRepeatNames,
  evRepeats,
  evStatusNames,
  evTextLimits,
  evWhenText,
  fromLocalInput,
  toLocalInput,
  useEventActions,
  useEventList,
  useEventRsvps,
  zoneParts,
  type EvAnswer,
  type EvDetails,
  type EvEvent,
  type EvRepeat,
  type EvRsvp,
  type Events,
  type RoleOption,
  type Server,
  type VoiceChannel,
} from '../../data';
import { InfoTip, flashIssue } from './EditorBits';
import { Used } from './ARTriggers';
import { useZoneItems } from './BDSettings';
import { OptionsEditor, ReminderList, anyRoles, tipped } from './EVSettings';

const NONE = 'none';
const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;
const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** What the builder holds: the details, with times as the boxes show them. */
type Form = Omit<EvDetails, 'start' | 'end' | 'postAt'> & {
  startText: string;
  endText: string;
  later: boolean;
  postText: string;
};

const formOf = (d: EvDetails): Form => {
  const { start, end, postAt, ...rest } = d;
  return {
    ...structuredClone(rest),
    startText: toLocalInput(start, d.timeZone),
    endText: toLocalInput(end, d.timeZone),
    later: !!postAt,
    postText: toLocalInput(postAt || start - 24 * HOUR, d.timeZone),
  };
};
const detailsOf = (f: Form): EvDetails => {
  const { startText, endText, later, postText, ...rest } = f;
  return {
    ...rest,
    start: fromLocalInput(startText, f.timeZone) ?? Number.NaN,
    end: fromLocalInput(endText, f.timeZone) ?? Number.NaN,
    postAt: later ? (fromLocalInput(postText, f.timeZone) ?? Number.NaN) : 0,
  };
};

/** The same details for a new event, moved on by weeks if it's gone. */
const duplicateOf = (e: EvEvent, now: number): EvDetails => {
  let { start, end } = e;
  while (start < now + HOUR) {
    start += WEEK;
    end += WEEK;
  }
  return {
    title: e.title,
    description: e.description,
    image: e.image,
    start,
    end,
    timeZone: e.timeZone,
    place: e.place,
    location: e.location,
    capacity: e.capacity,
    options: structuredClone(e.options),
    roles: [...e.roles],
    pingRole: e.pingRole,
    repeat: e.repeat,
    reminders: [...e.reminders],
    remindMaybe: e.remindMaybe,
    startPing: e.startPing,
    postAt: 0,
  };
};

const repeatItems: ComboItem[] = evRepeats.map((r) => ({
  value: r,
  label: evRepeatNames[r],
  icon: r === 'none' ? 'ban' : 'refresh-cw',
}));

/** Add or change an event. */
function Builder({
  server,
  voice,
  roles,
  limits,
  editing,
  start,
  onClose,
}: {
  server: Server;
  voice: VoiceChannel[];
  roles: RoleOption[];
  limits: { reminders: number };
  editing: EvEvent | null;
  start: EvDetails;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Form>(() => formOf(start));
  const [problem, setProblem] = useState<string | null>(null);
  const actions = useEventActions(server.id);
  const toast = useToast();
  const zones = useZoneItems();
  const edit = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };
  const started = !!editing && editing.status !== 'scheduled';
  const posted = !!editing?.messageId;
  const busy = actions.create.isPending || actions.update.isPending;
  const voiceItems: ComboItem[] = [
    { value: NONE, label: 'None', icon: 'ban', group: 'Default' },
    ...voice.map((v) => ({
      value: v.id,
      label: v.name,
      icon: v.stage ? 'users' : 'volume-2',
      group: v.category,
      ...(v.stage ? { note: 'Stage' } : {}),
    })),
  ];

  const submit = () => {
    const details = detailsOf(form);
    const issue =
      !form.startText || !Number.isFinite(details.start)
        ? { at: 'start', problem: 'Pick when the event starts.' }
        : !form.endText || !Number.isFinite(details.end)
          ? { at: 'end', problem: 'Pick when the event ends.' }
          : evEventIssue(details, {
              now: Date.now(),
              plan: server.plan,
              roles: new Set(roles.map((r) => r.id)),
              places: new Set(voice.map((v) => v.id)),
              editing: editing ?? undefined,
            });
    if (issue) {
      setProblem(issue.problem);
      requestAnimationFrame(() => flashIssue(issue.at));
      return;
    }
    const done = (e: EvEvent) => {
      toast({
        title: editing
          ? `Saved #${e.number} ${e.title}`
          : `Scheduled #${e.number} ${e.title}`,
        body: editing
          ? 'Sparko updates its message in a few seconds.'
          : details.postAt
            ? 'Sparko posts it at the time you picked.'
            : 'Sparko posts it in a few seconds.',
      });
      onClose();
    };
    const failed = (e: Error) => setProblem(e.message);
    if (editing)
      actions.update.mutate(
        { number: editing.number, details },
        { onSuccess: done, onError: failed },
      );
    else actions.create.mutate(details, { onSuccess: done, onError: failed });
  };

  return (
    <section className="sp-card sp-ev-builder" aria-labelledby="ev-builder">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="ev-builder">
            {editing
              ? `Edit #${editing.number} ${editing.title}`
              : 'Schedule an event'}
          </h2>
          <p className="sp-card__sub">
            {editing
              ? 'Changes show in its message and Discord’s event straight away.'
              : 'Sparko posts it in the events channel with RSVP buttons.'}
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        <div data-issue="title">
          <Input
            label="Title"
            value={form.title}
            maxLength={evTextLimits.title}
            placeholder="Movie night"
            onChange={(e) => edit({ title: e.target.value })}
          />
        </div>
        <div data-issue="description">
          <Textarea
            label="Description"
            hint="What’s happening, and anything to bring. Shown with {event.description}."
            value={form.description}
            maxLength={evTextLimits.description}
            rows={3}
            onChange={(e) => edit({ description: e.target.value })}
          />
        </div>
        <div className="sp-ar__pair">
          <div data-issue="start">
            <Input
              label="Starts"
              type="datetime-local"
              value={form.startText}
              disabled={started}
              onChange={(e) => {
                // The end moves with the start, keeping the length.
                const was = fromLocalInput(form.startText, form.timeZone);
                const now = fromLocalInput(e.target.value, form.timeZone);
                const end = fromLocalInput(form.endText, form.timeZone);
                edit({
                  startText: e.target.value,
                  ...(was !== null && now !== null && end !== null
                    ? { endText: toLocalInput(end + now - was, form.timeZone) }
                    : {}),
                });
              }}
              {...(started
                ? { hint: 'It has started, so this is fixed.' }
                : {})}
            />
          </div>
          <div data-issue="end">
            <Input
              label="Ends"
              type="datetime-local"
              value={form.endText}
              onChange={(e) => edit({ endText: e.target.value })}
            />
          </div>
        </div>
        <div className="sp-ar__pair">
          <div data-issue="timeZone">
            <Combobox
              label={tipped(
                'Time zone',
                'The start and end are in this time zone. Members see them in their own.',
              )}
              searchPlaceholder="Search time zones, like London"
              value={form.timeZone}
              disabled={started}
              onChange={(timeZone) => edit({ timeZone })}
              items={zones}
            />
          </div>
          <div data-issue="repeat">
            <Combobox
              label={tipped(
                'Repeats',
                'When it ends, Sparko schedules the next one at the same time and posts it, with the same details.',
              )}
              searchable={false}
              value={form.repeat}
              onChange={(v) => edit({ repeat: v as EvRepeat })}
              items={repeatItems}
            />
          </div>
        </div>
        <div className="sp-ar__pair">
          <div data-issue="place">
            <Combobox
              label={tipped(
                'Voice or stage channel',
                'Where it happens on Discord, if it does. The start ping says where to join.',
              )}
              searchPlaceholder="Search voice channels"
              value={form.place?.id ?? NONE}
              onChange={(v) => {
                const c = voice.find((x) => x.id === v);
                edit({
                  place: c ? { id: c.id, name: c.name, stage: c.stage } : null,
                });
              }}
              items={voiceItems}
            />
          </div>
          <div data-issue="location">
            <Input
              label="Place"
              hint="Somewhere else it happens, like “Minecraft server” or a link."
              value={form.location}
              maxLength={evTextLimits.location}
              placeholder="Optional"
              onChange={(e) => edit({ location: e.target.value })}
            />
          </div>
        </div>
        <div className="sp-ar__pair">
          <div data-issue="capacity">
            <Input
              label="Capacity"
              hint="How many can go. Anyone after that joins a waitlist and moves up when a spot opens. 0 for no limit."
              type="number"
              min={0}
              max={evTextLimits.capacity}
              value={String(form.capacity)}
              onChange={(e) =>
                edit({
                  capacity: Math.max(0, Math.round(Number(e.target.value))),
                })
              }
            />
          </div>
          <div data-issue="image">
            <Input
              label="Picture"
              hint="A link to a picture shown in the event message, starting with https://."
              value={form.image}
              placeholder="Optional"
              onChange={(e) => edit({ image: e.target.value.trim() })}
            />
          </div>
        </div>
        <div className="sp-ar__pair">
          <div data-issue="roles">
            <Combobox
              label={tipped(
                'Who can answer',
                'Only members with one of these roles can press the buttons. Leave it empty for everyone.',
              )}
              multiple
              placeholder="Everyone"
              searchPlaceholder="Search roles"
              value={form.roles}
              onChange={(r) => edit({ roles: r })}
              items={anyRoles(roles)}
            />
          </div>
          <div data-issue="pingRole">
            <Combobox
              label={tipped(
                'Ping when it’s posted',
                'This role is mentioned once, when the event is first posted.',
              )}
              searchPlaceholder="Search roles"
              value={form.pingRole || NONE}
              onChange={(v) => edit({ pingRole: v === NONE ? '' : v })}
              items={[
                { value: NONE, label: 'Nobody', icon: 'ban', group: 'Default' },
                ...anyRoles(roles),
              ]}
            />
          </div>
        </div>
        <div className="sp-field">
          <span className="sp-label">Answers</span>
          <OptionsEditor
            value={form.options}
            where="option"
            onChange={(options) => edit({ options })}
          />
        </div>
        <div data-issue="eventReminders">
          <ReminderList
            label="Reminders"
            tip="Sparko DMs Going members this long before it starts."
            value={form.reminders}
            max={limits.reminders}
            onChange={(reminders) => edit({ reminders })}
          />
        </div>
        <div className="sp-ar__checks">
          <Checkbox
            checked={form.remindMaybe}
            onChange={(remindMaybe) => edit({ remindMaybe })}
            label="Remind Maybe answers too"
          />
          <Checkbox
            checked={form.startPing}
            onChange={(startPing) => edit({ startPing })}
            label="Ping when it starts"
            description="Mentions everyone going in the events channel."
          />
        </div>
        {!posted && (
          <div className="sp-ar__pair sp-ev-post">
            <div className="sp-field">
              <span className="sp-label">
                Post it{' '}
                <InfoTip text="Post the announcement straight away, or at a time before the event, like a week ahead." />
              </span>
              <Segmented<'now' | 'later'>
                label="Post it"
                value={form.later ? 'later' : 'now'}
                onChange={(v) => edit({ later: v === 'later' })}
                options={[
                  { value: 'now', label: 'Straight away' },
                  { value: 'later', label: 'Later' },
                ]}
              />
            </div>
            {form.later && (
              <div data-issue="postAt">
                <Input
                  label="Post at"
                  type="datetime-local"
                  value={form.postText}
                  onChange={(e) => edit({ postText: e.target.value })}
                />
              </div>
            )}
          </div>
        )}
        {problem && (
          <p className="sp-field-error" role="alert">
            <Icon name="circle-alert" />
            {problem}
          </p>
        )}
        <div className="sp-ev-builder__foot">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={editing ? 'save' : 'calendar'}
            loading={busy}
            onClick={submit}
          >
            {editing ? 'Save event' : 'Schedule it'}
          </Button>
        </div>
      </div>
    </section>
  );
}

// Attendees -------------------------------------------------------------------

const answerOrder: EvAnswer[] = ['going', 'maybe', 'no', 'waitlist'];
const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/** Everyone who answered, as a CSV file. */
export function attendeesCsv(list: EvRsvp[]) {
  const rows = [
    ['Name', 'User ID', 'Answer', 'Answered at', 'No-show'],
    ...list.map((r) => [
      r.name,
      r.userId,
      evAnswerNames[r.answer],
      new Date(r.at).toISOString(),
      r.noShow ? 'yes' : '',
    ]),
  ];
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

function download(name: string, text: string) {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Attendees({
  server,
  event,
  paused,
  onClose,
}: {
  server: Server;
  event: EvEvent;
  paused: boolean;
  onClose: () => void;
}) {
  const rsvps = useEventRsvps(server.id, event.number);
  const actions = useEventActions(server.id);
  const toast = useToast();
  const [shown, setShown] = useState<EvAnswer>('going');
  const list = rsvps.data ?? [];
  const of = (a: EvAnswer) => list.filter((r) => r.answer === a);
  const visible = of(shown);
  const when = (at: number) =>
    new Date(at).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <Modal
      open
      onClose={onClose}
      icon="users"
      title={`Who’s coming to #${event.number} ${event.title}`}
      description={`${event.counts.going} going${event.capacity ? ` of ${event.capacity}` : ''}, ${event.counts.maybe} maybe, ${event.counts.no} can’t go${event.counts.waitlist ? `, ${event.counts.waitlist} on the waitlist` : ''}.`}
      footer={
        <>
          <Button
            icon="file-text"
            disabled={!list.length}
            onClick={() =>
              download(
                `event-${event.number}-attendees.csv`,
                attendeesCsv(list),
              )
            }
          >
            Export CSV
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="sp-stack sp-ev-people">
        <Segmented<EvAnswer>
          label="Answer"
          className="sp-ev-people__tabs"
          value={shown}
          onChange={setShown}
          options={answerOrder.map((a) => ({
            value: a,
            label: `${evAnswerNames[a]} (${of(a).length})`,
          }))}
        />
        {rsvps.isPending ? (
          <div className="sp-skel sp-skel--block" style={{ height: 160 }} />
        ) : visible.length ? (
          <ul className="sp-bd-rows" aria-label={evAnswerNames[shown]}>
            {visible.map((r, i) => (
              <li
                key={r.userId}
                className={cx('sp-bd-row', r.noShow && 'is-left')}
              >
                {shown === 'waitlist' && (
                  <span className="sp-bd-row__day sp-tnum">{i + 1}</span>
                )}
                <img
                  className="sp-bd-avatar"
                  src={r.avatar || undefined}
                  alt=""
                />
                <span className="sp-bd-row__main">
                  <span className="sp-bd-row__line">
                    <span className="sp-bd-row__name">{r.name}</span>
                    {r.noShow && <Badge size="sm">No-show</Badge>}
                  </span>
                  <span className="sp-hint sp-bd-row__meta">
                    {r.userId} · answered {when(r.at)}
                  </span>
                </span>
                {shown === 'going' && (
                  <span className="sp-ev-noshow">
                    <Checkbox
                      checked={r.noShow}
                      disabled={paused}
                      label="No-show"
                      onChange={(noShow) =>
                        actions.noShow.mutate(
                          { number: event.number, userId: r.userId, noShow },
                          {
                            onSuccess: () => void rsvps.refetch(),
                            onError: (e) =>
                              toast({
                                tone: 'danger',
                                title: 'Couldn’t change it',
                                body: e.message,
                              }),
                          },
                        )
                      }
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="users" title="Nobody here yet">
            {shown === 'waitlist'
              ? event.capacity
                ? 'The waitlist fills once the event is full.'
                : 'This event has no capacity, so there’s no waitlist.'
              : `Nobody answered ${evAnswerNames[shown]} yet.`}
          </EmptyState>
        )}
      </div>
    </Modal>
  );
}

// The list --------------------------------------------------------------------

const statusTone = (e: EvEvent) =>
  e.status === 'started'
    ? ('success' as const)
    : e.status === 'cancelled'
      ? ('danger' as const)
      : e.status === 'scheduled'
        ? ('info' as const)
        : undefined;

function EventRow({
  e,
  paused,
  onPeople,
  onEdit,
  onDuplicate,
  onCancel,
  onDelete,
}: {
  e: EvEvent;
  paused: boolean;
  onPeople: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const p = zoneParts(e.start, e.timeZone);
  const open = evOpen(e);
  const where = [e.place?.name, e.location].filter(Boolean).join(' · ');
  return (
    <li className={cx('sp-ev-row', !open && 'is-past')}>
      <span className="sp-bd-next__date sp-ev-row__date">
        <span className="sp-bd-next__day sp-tnum">{p.day}</span>
        <span className="sp-bd-next__month">{months[p.month - 1]}</span>
      </span>
      <span className="sp-ev-row__main">
        <span className="sp-bd-row__line">
          <span className="sp-hint sp-tnum">#{e.number}</span>
          <span className="sp-bd-row__name">{e.title}</span>
          <Badge size="sm" {...(statusTone(e) ? { tone: statusTone(e)! } : {})}>
            {evStatusNames[e.status]}
          </Badge>
          {e.status === 'scheduled' && !e.messageId && (
            <Badge size="sm" tone="warning">
              {e.postAt ? 'Posts later' : 'Posting…'}
            </Badge>
          )}
          {e.repeat !== 'none' && (
            <Badge size="sm" icon="refresh-cw">
              {evRepeatNames[e.repeat]}
            </Badge>
          )}
        </span>
        <span className="sp-hint sp-bd-row__meta">
          {evWhenText(e.start, e.end, e.timeZone)} (
          {e.timeZone.replace(/_/g, ' ')}){where && ` · ${where}`} · by{' '}
          {e.hostName}
        </span>
      </span>
      <span className="sp-ev-row__counts" aria-label="Answers">
        <span className="sp-ev-count sp-ev-count--going" title="Going">
          <Icon name="check" size="sm" />
          <span className="sp-tnum">
            {e.counts.going}
            {e.capacity ? `/${e.capacity}` : ''}
          </span>
        </span>
        {e.options.maybe.on && (
          <span className="sp-ev-count" title="Maybe">
            <Icon name="circle-help" size="sm" />
            <span className="sp-tnum">{e.counts.maybe}</span>
          </span>
        )}
        {!!e.counts.waitlist && (
          <span className="sp-ev-count" title="Waitlist">
            <Icon name="timer" size="sm" />
            <span className="sp-tnum">{e.counts.waitlist}</span>
          </span>
        )}
      </span>
      <span className="sp-bd-row__actions">
        <button
          type="button"
          className="sp-icon-btn"
          aria-label={`Who’s coming to ${e.title}`}
          onClick={onPeople}
        >
          <Icon name="users" size="sm" />
        </button>
        {open && (
          <button
            type="button"
            className="sp-icon-btn"
            disabled={paused}
            aria-label={`Edit ${e.title}`}
            onClick={onEdit}
          >
            <Icon name="pencil" size="sm" />
          </button>
        )}
        <button
          type="button"
          className="sp-icon-btn"
          disabled={paused}
          aria-label={`Duplicate ${e.title}`}
          onClick={onDuplicate}
        >
          <Icon name="copy" size="sm" />
        </button>
        {open && (
          <button
            type="button"
            className="sp-icon-btn sp-icon-btn--danger"
            disabled={paused}
            aria-label={`Cancel ${e.title}`}
            onClick={onCancel}
          >
            <Icon name="ban" size="sm" />
          </button>
        )}
        <button
          type="button"
          className="sp-icon-btn sp-icon-btn--danger"
          disabled={paused}
          aria-label={`Delete ${e.title}`}
          onClick={onDelete}
        >
          <Icon name="trash-2" size="sm" />
        </button>
      </span>
    </li>
  );
}

type Building = { editing: EvEvent | null; start: EvDetails } | null;

/** The Events tab: the builder, upcoming and past events, and who's coming. */
export function EVEvents({
  server,
  config,
  voice,
  roles,
  limits,
  counts,
  paused,
}: {
  server: Server;
  config: Events;
  voice: VoiceChannel[];
  roles: RoleOption[];
  limits: { upcoming: number; reminders: number };
  counts: { upcoming: number; past: number };
  paused: boolean;
}) {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const list = useEventList(server.id, when);
  const actions = useEventActions(server.id);
  const toast = useToast();
  const [building, setBuilding] = useState<Building>(null);
  const [people, setPeople] = useState<EvEvent | null>(null);
  const [cancelling, setCancelling] = useState<EvEvent | null>(null);
  const [deleting, setDeleting] = useState<EvEvent | null>(null);
  const full = counts.upcoming >= limits.upcoming;
  const build = (b: Building) => {
    setBuilding(b);
    requestAnimationFrame(() =>
      document
        .getElementById('ev-builder')
        ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }),
    );
  };
  const items = list.data ?? [];

  return (
    <div className="sp-stack sp-ev">
      {building && (
        <Builder
          key={building.editing?.number ?? 'new'}
          server={server}
          voice={voice}
          roles={roles}
          limits={limits}
          editing={building.editing}
          start={building.start}
          onClose={() => setBuilding(null)}
        />
      )}
      <section className="sp-card sp-ev-list" aria-labelledby="ev-list">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="ev-list">
              Events
            </h2>
            <p className="sp-card__sub">
              Everything scheduled, happening now and past, with who’s coming.
            </p>
          </div>
          <div className="sp-ar__head-actions">
            <Used
              n={counts.upcoming}
              max={limits.upcoming}
              what="upcoming events"
              icon="party"
            />
            <Button
              size="sm"
              variant="primary"
              icon="plus"
              disabled={paused || full || (!!building && !building.editing)}
              onClick={() =>
                build({ editing: null, start: evBlank(config, Date.now()) })
              }
            >
              Schedule an event
            </Button>
          </div>
        </div>
        <div className="sp-card__body sp-stack">
          {full && (
            <p className="sp-edit-banner" role="note">
              <Icon name="info" size="sm" />
              <span>
                Your plan has up to {limits.upcoming} upcoming events. Cancel or
                delete one, or wait for one to end.
              </span>
            </p>
          )}
          <Segmented<'upcoming' | 'past'>
            label="Show"
            value={when}
            onChange={setWhen}
            options={[
              { value: 'upcoming', label: `Upcoming (${counts.upcoming})` },
              { value: 'past', label: `Past (${counts.past})` },
            ]}
          />
          {list.isPending ? (
            <div className="sp-skel sp-skel--block" style={{ height: 220 }} />
          ) : items.length ? (
            <ul
              className="sp-ev-rows"
              aria-label={
                when === 'upcoming' ? 'Upcoming events' : 'Past events'
              }
            >
              {items.map((e) => (
                <EventRow
                  key={e.number}
                  e={e}
                  paused={paused}
                  onPeople={() => setPeople(e)}
                  onEdit={() => build({ editing: e, start: e })}
                  onDuplicate={() =>
                    build({ editing: null, start: duplicateOf(e, Date.now()) })
                  }
                  onCancel={() => setCancelling(e)}
                  onDelete={() => setDeleting(e)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={
                <RevealIcon
                  anim={animIcons.storage}
                  fallback="calendar"
                  size={28}
                />
              }
              title={
                when === 'upcoming' ? 'Nothing scheduled' : 'No past events'
              }
            >
              {when === 'upcoming'
                ? `Schedule one here, or staff can use /${config.commands.group.name} ${config.commands.create.name} in Discord.`
                : 'Events show here once they end or are cancelled.'}
            </EmptyState>
          )}
        </div>
      </section>
      {people && (
        <Attendees
          server={server}
          event={people}
          paused={paused}
          onClose={() => setPeople(null)}
        />
      )}
      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        icon="ban"
        title={`Cancel ${cancelling?.title ?? ''}?`}
        description={`Its message shows Cancelled with the buttons off${config.dms.cancelled ? ', and everyone going gets a DM' : ''}${cancelling?.discordEventId ? '. Discord’s event is cancelled too' : ''}. This can’t be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={actions.cancel.isPending}
              onClick={() =>
                cancelling &&
                actions.cancel.mutate(cancelling.number, {
                  onSuccess: () => {
                    toast({ title: `Cancelled ${cancelling.title}` });
                    setCancelling(null);
                  },
                  onError: (e) =>
                    toast({
                      tone: 'danger',
                      title: 'Couldn’t cancel it',
                      body: e.message,
                    }),
                })
              }
            >
              Cancel event
            </Button>
          </>
        }
      >
        {null}
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        icon="trash-2"
        title={`Delete ${deleting?.title ?? ''}?`}
        description="Sparko deletes its message, its answers and Discord’s event, and takes the attending role back. Nobody gets a DM. To tell people, cancel it instead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={actions.remove.isPending}
              onClick={() =>
                deleting &&
                actions.remove.mutate(deleting.number, {
                  onSuccess: () => {
                    toast({ title: `Deleted ${deleting.title}` });
                    setDeleting(null);
                    if (building?.editing?.number === deleting.number)
                      setBuilding(null);
                  },
                  onError: (e) =>
                    toast({
                      tone: 'danger',
                      title: 'Couldn’t delete it',
                      body: e.message,
                    }),
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
    </div>
  );
}
