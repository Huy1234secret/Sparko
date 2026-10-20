import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import {
  IS_COMPONENTS_V2,
  normaliseStudio,
  type StudioMessage,
} from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import { rememberPost } from './studio-actions.ts';
import { parseDuration } from './auto-roles.ts';
import {
  EV_KEEP_PAST,
  EV_MODULE,
  cleanDetails,
  evAnswerFor,
  evAnswerNames,
  evCanAnswer,
  evDefaultMessage,
  evDiscordEvent,
  evDmPayload,
  evEventIssue,
  evLimits,
  evLink,
  evNextStart,
  evOpen,
  evPayload,
  evStartPayload,
  evUpgrade,
  type EvAnswer,
  type EvChoice,
  type EvDetails,
  type EvEvent,
  type EvKind,
  type EvLogEntry,
  type EvRsvp,
  type EvStatus,
  type Events,
} from './events.ts';

export * from './events.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
const MINUTE = 60_000;
const DAY = 86_400_000;
const json = <T>(v: unknown, fallback: T): T => {
  try {
    return (JSON.parse(String(v)) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

export function evConfigOf(db: Db, guildId: string) {
  const m = getModule<Events>(db, guildId, EV_MODULE);
  return { on: m.on, config: evUpgrade(m.config) };
}
const planOf = (db: Db, guildId: string) => getGuild(db, guildId)?.plan;

// Saved events ----------------------------------------------------------------

const SELECT = `SELECT e.*,
  (SELECT COUNT(*) FROM ev_rsvps r WHERE r.guild_id = e.guild_id AND r.number = e.number AND r.answer = 'going') AS n_going,
  (SELECT COUNT(*) FROM ev_rsvps r WHERE r.guild_id = e.guild_id AND r.number = e.number AND r.answer = 'maybe') AS n_maybe,
  (SELECT COUNT(*) FROM ev_rsvps r WHERE r.guild_id = e.guild_id AND r.number = e.number AND r.answer = 'no') AS n_no,
  (SELECT COUNT(*) FROM ev_rsvps r WHERE r.guild_id = e.guild_id AND r.number = e.number AND r.answer = 'waitlist') AS n_waitlist
  FROM events e`;

const eventOf = (r: Row): EvEvent => ({
  ...json<EvDetails>(r.details, {} as EvDetails),
  start: r.start_at as number,
  end: r.end_at as number,
  postAt: r.post_at as number,
  number: r.number as number,
  status: r.status as EvStatus,
  hostId: r.host_id as string,
  hostName: r.host_name as string,
  channelId: (r.channel_id as string | null) ?? null,
  messageId: (r.message_id as string | null) ?? null,
  discordEventId: (r.discord_event_id as string | null) ?? null,
  reminded: json<string[]>(r.reminded, []),
  startPinged: r.start_pinged === 1,
  series: (r.series as number | null) ?? null,
  counts: {
    going: (r.n_going as number | undefined) ?? 0,
    maybe: (r.n_maybe as number | undefined) ?? 0,
    no: (r.n_no as number | undefined) ?? 0,
    waitlist: (r.n_waitlist as number | undefined) ?? 0,
  },
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
});

/** An event, with only what's stored as its details. */
const detailsOf = (e: EvDetails): EvDetails => cleanDetails(e);

export function getEvent(db: Db, guildId: string, number: number) {
  const r = db
    .prepare(`${SELECT} WHERE e.guild_id = ? AND e.number = ?`)
    .get(guildId, number) as Row | undefined;
  return r ? eventOf(r) : null;
}

/** The event a message is for. */
export function eventByMessage(db: Db, messageId: string) {
  const r = db.prepare(`${SELECT} WHERE e.message_id = ?`).get(messageId) as
    | Row
    | undefined;
  return r ? { guildId: r.guild_id as string, event: eventOf(r) } : null;
}

/**
 * Events for the dashboard and /event list: upcoming soonest first, or
 * past (ended and cancelled) newest first.
 */
export function listEvents(
  db: Db,
  guildId: string,
  {
    when = 'upcoming',
    limit = 200,
  }: { when?: 'upcoming' | 'past'; limit?: number } = {},
) {
  return (
    db
      .prepare(
        when === 'upcoming'
          ? `${SELECT} WHERE e.guild_id = ? AND e.status IN ('scheduled', 'started')
             ORDER BY e.start_at, e.number LIMIT ?`
          : `${SELECT} WHERE e.guild_id = ? AND e.status IN ('ended', 'cancelled')
             ORDER BY e.end_at DESC, e.number DESC LIMIT ?`,
      )
      .all(guildId, limit) as Row[]
  ).map(eventOf);
}

/** How many events are still to come or happening. */
export function evUpcomingCount(db: Db, guildId: string) {
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM events WHERE guild_id = ? AND status IN ('scheduled', 'started')`,
    )
    .get(guildId) as { n: number };
  return n;
}
export function evPastCount(db: Db, guildId: string) {
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM events WHERE guild_id = ? AND status IN ('ended', 'cancelled')`,
    )
    .get(guildId) as { n: number };
  return n;
}

const rsvpOf = (r: Row): EvRsvp => ({
  userId: r.user_id as string,
  name: r.name as string,
  avatar: r.avatar as string,
  answer: r.answer as EvAnswer,
  at: r.at as number,
  noShow: r.no_show === 1,
});

/** Everyone who answered an event, in the order they answered. */
export function listRsvps(db: Db, guildId: string, number: number) {
  return (
    db
      .prepare(
        'SELECT * FROM ev_rsvps WHERE guild_id = ? AND number = ? ORDER BY at, rowid',
      )
      .all(guildId, number) as Row[]
  ).map(rsvpOf);
}
export function getRsvp(
  db: Db,
  guildId: string,
  number: number,
  userId: string,
) {
  const r = db
    .prepare(
      'SELECT * FROM ev_rsvps WHERE guild_id = ? AND number = ? AND user_id = ?',
    )
    .get(guildId, number, userId) as Row | undefined;
  return r ? rsvpOf(r) : null;
}
/** Going members' ids, first to answer first. */
export const goingIds = (db: Db, guildId: string, number: number) =>
  listRsvps(db, guildId, number)
    .filter((r) => r.answer === 'going')
    .map((r) => r.userId);

/** Staff mark someone who said Going as not having come. */
export function evSetNoShow(
  db: Db,
  guildId: string,
  number: number,
  userId: string,
  noShow: boolean,
) {
  return (
    db
      .prepare(
        'UPDATE ev_rsvps SET no_show = ? WHERE guild_id = ? AND number = ? AND user_id = ?',
      )
      .run(noShow ? 1 : 0, guildId, number, userId).changes === 1
  );
}

// The log ---------------------------------------------------------------------

export function addEvLog(db: Db, guildId: string, e: Omit<EvLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO ev_log (guild_id, action, number, title, user_id, user_name, detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    e.action,
    e.number,
    e.title.slice(0, 100),
    e.userId,
    e.userName,
    e.detail.slice(0, 300),
    e.at,
  );
  db.prepare(
    `DELETE FROM ev_log WHERE guild_id = ? AND id <= (
       SELECT id FROM ev_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listEvLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM ev_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): EvLogEntry => ({
      id: String(r.id),
      action: r.action as EvLogEntry['action'],
      number: (r.number as number | null) ?? null,
      title: r.title as string,
      userId: r.user_id as string,
      userName: r.user_name as string,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
}

const sparko = { id: '0', name: 'Sparko' };
const log = (
  db: Db,
  guildId: string,
  e: Pick<EvEvent, 'number' | 'title'>,
  action: EvLogEntry['action'],
  who: { id: string; name: string },
  detail: string,
  at: number,
) =>
  addEvLog(db, guildId, {
    action,
    number: e.number,
    title: e.title,
    userId: who.id,
    userName: who.name,
    detail,
    at,
  });

// Creating and changing -------------------------------------------------------

export type EvPerson = { id: string; name: string; avatar?: string };

/** Reminders whose time has already come, so they're never sent late. */
const passedReminders = (d: EvDetails, now: number) =>
  d.reminders.filter((r) => d.start - (parseDuration(r) ?? 0) <= now);

const nextNumber = (db: Db, guildId: string) => {
  const { n } = db
    .prepare(
      `SELECT MAX(n) AS n FROM (
         SELECT MAX(number) AS n FROM events WHERE guild_id = ?
         UNION ALL SELECT MAX(number) FROM ev_log WHERE guild_id = ?)`,
    )
    .get(guildId, guildId) as { n: number | null };
  return (n ?? 0) + 1;
};

function insert(
  db: Db,
  guildId: string,
  d: EvDetails,
  host: EvPerson,
  series: number | null,
  now: number,
) {
  const number = nextNumber(db, guildId);
  db.prepare(
    `INSERT INTO events (guild_id, number, details, start_at, end_at, post_at,
       host_id, host_name, reminded, series, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    number,
    JSON.stringify(detailsOf(d)),
    d.start,
    d.end,
    d.postAt,
    host.id,
    host.name,
    JSON.stringify(passedReminders(d, now)),
    series,
    now,
    now,
  );
  return getEvent(db, guildId, number)!;
}

/**
 * Saves a new event after checking it and the plan's limit. It isn't
 * posted yet: `evPost` does that, now or (with `postAt`) in the sweep.
 */
export function evCreate(
  db: Db,
  guildId: string,
  input: unknown,
  host: EvPerson,
  now = Date.now(),
  known: { roles?: Set<string>; places?: Set<string> } = {},
): { ok: true; event: EvEvent } | { ok: false; problem: string; at: string } {
  const { on, config: c } = evConfigOf(db, guildId);
  if (!on)
    return { ok: false, at: '', problem: 'Events are off in this server.' };
  if (!c.channel)
    return {
      ok: false,
      at: '',
      problem: 'Pick the events channel in Settings first.',
    };
  const plan = planOf(db, guildId);
  const issue = evEventIssue(input, { now, plan, ...known });
  if (issue) return { ok: false, ...issue };
  const max = evLimits(plan).upcoming;
  if (evUpcomingCount(db, guildId) >= max)
    return {
      ok: false,
      at: '',
      problem: `Your plan has up to ${max} upcoming events. Cancel or delete one, or wait for one to end.`,
    };
  const event = insert(db, guildId, input as EvDetails, host, null, now);
  log(db, guildId, event, 'created', host, '', now);
  return { ok: true, event };
}

/** Moves members from the waitlist to Going while there's room. */
function promote(db: Db, guildId: string, e: EvEvent, now: number) {
  const out: EvRsvp[] = [];
  const list = listRsvps(db, guildId, e.number);
  let going = list.filter((r) => r.answer === 'going').length;
  for (const r of list.filter((x) => x.answer === 'waitlist')) {
    if (e.capacity && going >= e.capacity) break;
    db.prepare(
      `UPDATE ev_rsvps SET answer = 'going' WHERE guild_id = ? AND number = ? AND user_id = ?`,
    ).run(guildId, e.number, r.userId);
    going++;
    out.push({ ...r, answer: 'going' });
    log(db, guildId, e, 'promoted', { id: r.userId, name: r.name }, '', now);
  }
  return out;
}

/**
 * Changes an event's details. More room moves people off the waitlist; a
 * new start means reminders count from it.
 */
export function evUpdate(
  db: Db,
  guildId: string,
  number: number,
  input: unknown,
  by: EvPerson,
  now = Date.now(),
  known: { roles?: Set<string>; places?: Set<string> } = {},
):
  | { ok: true; event: EvEvent; promoted: EvRsvp[] }
  | { ok: false; problem: string; at: string } {
  const old = getEvent(db, guildId, number);
  if (!old)
    return { ok: false, at: '', problem: `There’s no event #${number}.` };
  if (!evOpen(old))
    return {
      ok: false,
      at: '',
      problem: `Event #${number} has ${old.status === 'cancelled' ? 'been cancelled' : 'ended'}, so it can’t change.`,
    };
  const issue = evEventIssue(input, {
    now,
    plan: planOf(db, guildId),
    editing: old,
    ...known,
  });
  if (issue) return { ok: false, ...issue };
  const d = input as EvDetails;
  const moved = d.start !== old.start;
  db.prepare(
    `UPDATE events SET details = ?, start_at = ?, end_at = ?, post_at = ?,
       reminded = ?, start_pinged = CASE WHEN ? THEN 0 ELSE start_pinged END, updated_at = ?
     WHERE guild_id = ? AND number = ?`,
  ).run(
    JSON.stringify(detailsOf(d)),
    d.start,
    d.end,
    old.messageId ? 0 : d.postAt,
    JSON.stringify(
      moved
        ? passedReminders(d, now)
        : d.reminders.filter(
            (r) =>
              old.reminded.includes(r) || passedReminders(d, now).includes(r),
          ),
    ),
    moved ? 1 : 0,
    now,
    guildId,
    number,
  );
  const changed = getEvent(db, guildId, number)!;
  const what = [
    old.title !== d.title && 'title',
    moved && 'start',
    old.end !== d.end && 'end',
    old.capacity !== d.capacity &&
      `capacity ${old.capacity || 'none'} → ${d.capacity || 'none'}`,
    (old.location !== d.location || old.place?.id !== d.place?.id) && 'place',
  ].filter(Boolean);
  log(db, guildId, changed, 'edited', by, what.join(', '), now);
  const promoted = promote(db, guildId, changed, now);
  return { ok: true, event: getEvent(db, guildId, number)!, promoted };
}

// Answers ---------------------------------------------------------------------

export type EvAnswerResult =
  | { ok: false; problem: string }
  | {
      ok: true;
      event: EvEvent;
      /** Where they are now: null when they took their answer back. */
      answer: EvAnswer | null;
      was: EvAnswer | null;
      /** Their place in the waiting line, when they're on it. */
      position: number;
      /** Someone moved off the waitlist because a spot opened. */
      promoted: EvRsvp[];
    };

/**
 * A member answered (with a button or /event rsvp). Saves where they land,
 * moves the first in line up when they give up a spot, and logs both.
 */
export function evAnswer(
  db: Db,
  guildId: string,
  number: number,
  user: EvPerson,
  choice: EvChoice,
  roles: Set<string>,
  now = Date.now(),
): EvAnswerResult {
  const e = getEvent(db, guildId, number);
  if (!e) return { ok: false, problem: 'This event is gone.' };
  const why = evCanAnswer(e, choice, roles, now);
  if (why) return { ok: false, problem: why };
  const old = getRsvp(db, guildId, number, user.id);
  const was = old?.answer ?? null;
  const answer = evAnswerFor(e, choice, was, e.counts.going);
  if (answer === null)
    db.prepare(
      'DELETE FROM ev_rsvps WHERE guild_id = ? AND number = ? AND user_id = ?',
    ).run(guildId, number, user.id);
  else
    db.prepare(
      `INSERT INTO ev_rsvps (guild_id, number, user_id, name, avatar, answer, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, number, user_id) DO UPDATE SET
         name = excluded.name, avatar = excluded.avatar, answer = excluded.answer,
         at = CASE WHEN ev_rsvps.answer = excluded.answer THEN ev_rsvps.at ELSE excluded.at END,
         no_show = 0`,
    ).run(guildId, number, user.id, user.name, user.avatar ?? '', answer, now);
  log(
    db,
    guildId,
    e,
    'rsvp',
    user,
    answer === null
      ? `took back their ${evAnswerNames[was!]} answer to`
      : answer === 'waitlist'
        ? 'joined the waitlist for'
        : answer === 'going'
          ? 'is going to'
          : answer === 'maybe'
            ? 'might go to'
            : 'can’t go to',
    now,
  );
  const promoted =
    was === 'going' && answer !== 'going' ? promote(db, guildId, e, now) : [];
  const position =
    answer === 'waitlist'
      ? listRsvps(db, guildId, number)
          .filter((r) => r.answer === 'waitlist')
          .findIndex((r) => r.userId === user.id) + 1
      : 0;
  return {
    ok: true,
    event: getEvent(db, guildId, number)!,
    answer,
    was,
    position,
    promoted,
  };
}

// Discord ---------------------------------------------------------------------

/** Discord turned it down for good: no permission, or the channel's gone. */
const refused = (e: unknown) =>
  e instanceof DiscordError && e.status >= 400 && e.status < 500;
const gone = (e: unknown) =>
  e instanceof DiscordError &&
  (e.code === DiscordCodes.unknownMessage || e.status === 404);

function plain(e: unknown): never {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    throw new Plain(
      'Sparko can’t post in the events channel. Give it View Channel, Send Messages and Embed Links there.',
    );
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    throw new Plain('The events channel no longer exists. Pick another one.');
  if (e instanceof DiscordError && e.status === 400)
    throw new Plain(`Discord didn’t accept the message: ${e.message}`);
  throw e;
}
const plainText = (e: unknown, fallback: string) => {
  try {
    plain(e);
  } catch (p) {
    if (p instanceof Plain) return p.message;
  }
  return fallback;
};

/** Sends a direct message; people who don't take DMs simply don't get it. */
async function dm(rest: Rest, userId: string, body: object) {
  try {
    const channel = await rest.post<{ id: string }>('/users/@me/channels', {
      recipient_id: userId,
    });
    await rest.post(`/channels/${channel.id}/messages`, body);
    return true;
  } catch {
    return false;
  }
}

/** An event message: the server's template, or Sparko's own. */
export function evMessage(db: Db, guildId: string, c: Events, kind: EvKind) {
  const id = c.messages[kind];
  const t = id
    ? getTemplate<StudioMessage>(db, guildId, 'studio', id)
    : undefined;
  return normaliseStudio(t?.message ?? evDefaultMessage(kind));
}

const serverOf = (db: Db, guildId: string) => serverVars(getGuild(db, guildId));

const ctxOf = (db: Db, guildId: string, now: number) => ({
  now,
  guildId,
  server: serverOf(db, guildId),
});

/** Gives or takes the attending role; false when Discord refused. */
async function attendingRole(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  userId: string,
  give: boolean,
) {
  const { config: c } = evConfigOf(db, guildId);
  const row = db
    .prepare(
      'SELECT role_id FROM ev_rsvps WHERE guild_id = ? AND number = ? AND user_id = ?',
    )
    .get(guildId, number, userId) as { role_id: string | null } | undefined;
  if (give) {
    if (!c.attending || !c.attendingRole || row?.role_id) return true;
    try {
      await rest.put(
        `/guilds/${guildId}/members/${userId}/roles/${c.attendingRole}`,
        {},
        'Going to an event',
      );
      db.prepare(
        'UPDATE ev_rsvps SET role_id = ? WHERE guild_id = ? AND number = ? AND user_id = ?',
      ).run(c.attendingRole, guildId, number, userId);
      return true;
    } catch {
      return false;
    }
  }
  if (!row?.role_id) return true;
  try {
    await rest.delete(
      `/guilds/${guildId}/members/${userId}/roles/${row.role_id}`,
      'No longer going to the event',
    );
  } catch (e) {
    if (!(e instanceof DiscordError && e.status === 404)) return false;
  }
  db.prepare(
    'UPDATE ev_rsvps SET role_id = NULL WHERE guild_id = ? AND number = ? AND user_id = ?',
  ).run(guildId, number, userId);
  return true;
}

/** The waitlist DM, to someone who just got a spot. */
async function tellPromoted(
  rest: Rest,
  db: Db,
  guildId: string,
  e: EvEvent,
  people: EvRsvp[],
  now: number,
) {
  const { config: c } = evConfigOf(db, guildId);
  for (const p of people) {
    await attendingRole(rest, db, guildId, e.number, p.userId, true);
    if (!c.dms.waitlist) continue;
    await dm(
      rest,
      p.userId,
      evDmPayload(
        c,
        evMessage(db, guildId, c, 'waitlist'),
        e,
        goingIds(db, guildId, e.number),
        { id: p.userId, name: p.name, avatar: p.avatar },
        ctxOf(db, guildId, now),
      ),
    );
  }
}

/**
 * After a dashboard edit: refreshes the message, and gives the role and
 * the waitlist DM to the members who moved up.
 */
export async function evEdited(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  promoted: string[],
  now = Date.now(),
) {
  const e = await evPost(rest, db, guildId, number, now);
  if (!e || !promoted.length) return;
  const people = listRsvps(db, guildId, number).filter(
    (r) => r.answer === 'going' && promoted.includes(r.userId),
  );
  await tellPromoted(rest, db, guildId, e, people, now);
}

/**
 * A member answered: saves it, then gives or takes the attending role and
 * tells whoever moved off the waitlist. The message is refreshed by the
 * caller, so a burst of answers is one edit.
 */
export async function evRespond(
  rest: Rest,
  db: Db,
  input: {
    guildId: string;
    number: number;
    user: EvPerson;
    choice: EvChoice;
    roles: Set<string>;
  },
  now = Date.now(),
) {
  const r = evAnswer(
    db,
    input.guildId,
    input.number,
    input.user,
    input.choice,
    input.roles,
    now,
  );
  if (!r.ok) return r;
  if (r.answer === 'going')
    await attendingRole(
      rest,
      db,
      input.guildId,
      input.number,
      input.user.id,
      true,
    );
  else if (r.was === 'going')
    await attendingRole(
      rest,
      db,
      input.guildId,
      input.number,
      input.user.id,
      false,
    );
  if (r.promoted.length)
    await tellPromoted(rest, db, input.guildId, r.event, r.promoted, now);
  return r;
}

/** Keeps Discord's own scheduled event in step with the event. */
async function syncDiscord(
  rest: Rest,
  db: Db,
  guildId: string,
  e: EvEvent,
  now: number,
) {
  const { config: c } = evConfigOf(db, guildId);
  const save = (id: string | null) =>
    db
      .prepare(
        'UPDATE events SET discord_event_id = ? WHERE guild_id = ? AND number = ?',
      )
      .run(id, guildId, e.number);
  const path = `/guilds/${guildId}/scheduled-events`;
  try {
    if (e.discordEventId) {
      const at = `${path}/${e.discordEventId}`;
      // Scheduled → active → completed, or scheduled → cancelled.
      if (e.status === 'cancelled')
        await rest
          .patch(at, { status: 4 })
          .catch(() => rest.patch(at, { status: 3 }));
      else if (e.status === 'ended') await rest.patch(at, { status: 3 });
      else if (e.status === 'started') await rest.patch(at, { status: 2 });
      else await rest.patch(at, evDiscordEvent(e));
      return;
    }
    if (!c.sync || !evOpen(e) || e.status === 'started') return;
    const made = await rest.post<{ id: string }>(path, evDiscordEvent(e));
    save(made.id);
  } catch (err) {
    // Deleted in Discord: Sparko stops keeping it in step.
    if (err instanceof DiscordError && err.status === 404)
      return void save(null);
    if (e.discordEventId) return;
    log(
      db,
      guildId,
      e,
      'failed',
      sparko,
      err instanceof DiscordError &&
        err.code === DiscordCodes.missingPermissions
        ? 'Sparko couldn’t add it to Discord’s events. It needs the Manage Events permission.'
        : 'Sparko couldn’t add it to Discord’s events.',
      now,
    );
  }
}

/**
 * Puts an event in its channel: posts it (pinging its role the first time)
 * or edits the message already there, then keeps Discord's own event in
 * step. A message someone deleted is posted again.
 */
export async function evPost(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  now = Date.now(),
) {
  const e = getEvent(db, guildId, number);
  if (!e) return null;
  const { config: c } = evConfigOf(db, guildId);
  const message = evMessage(db, guildId, c, 'event');
  const going = goingIds(db, guildId, number);
  const body = (ev: EvEvent, ping: boolean) =>
    evPayload(c, message, ev, going, {
      ...ctxOf(db, guildId, now),
      channel: ev.channelId ?? c.channel,
      ping,
    });
  try {
    if (e.messageId && e.channelId) {
      try {
        await rest.patch(
          `/channels/${e.channelId}/messages/${e.messageId}`,
          body(e, false),
        );
        rememberPost(db, guildId, e.messageId, message, now);
        await syncDiscord(rest, db, guildId, e, now);
        return e;
      } catch (err) {
        if (!gone(err)) throw err;
      }
    }
    if (!evOpen(e)) return e;
    const channel = c.channel;
    const sent = await rest.post<{ id: string }>(
      `/channels/${channel}/messages`,
      body({ ...e, channelId: channel, messageId: null }, !e.messageId),
    );
    db.prepare(
      `UPDATE events SET channel_id = ?, message_id = ?, post_at = 0 WHERE guild_id = ? AND number = ?`,
    ).run(channel, sent.id, guildId, number);
    rememberPost(db, guildId, sent.id, message, now);
    const posted = getEvent(db, guildId, number)!;
    // {event.link} needs the message's own id, so it's filled in now.
    if (JSON.stringify(message).includes('{event.link}'))
      await rest
        .patch(`/channels/${channel}/messages/${sent.id}`, body(posted, false))
        .catch(() => {});
    await syncDiscord(rest, db, guildId, posted, now);
    return posted;
  } catch (err) {
    plain(err);
  }
}

// Cancelling and deleting -----------------------------------------------------

/**
 * Marks an event cancelled. Returns who was going, for `evCancelled` to
 * DM, or a problem when it can't be.
 */
export function evMarkCancelled(
  db: Db,
  guildId: string,
  number: number,
  by: EvPerson,
  now = Date.now(),
):
  | { ok: true; event: EvEvent; going: EvRsvp[] }
  | { ok: false; problem: string } {
  const e = getEvent(db, guildId, number);
  if (!e) return { ok: false, problem: `There’s no event #${number}.` };
  if (!evOpen(e))
    return {
      ok: false,
      problem: `Event #${number} has already ${e.status === 'cancelled' ? 'been cancelled' : 'ended'}.`,
    };
  db.prepare(
    `UPDATE events SET status = 'cancelled', updated_at = ? WHERE guild_id = ? AND number = ?`,
  ).run(now, guildId, number);
  const going = listRsvps(db, guildId, number).filter(
    (r) => r.answer === 'going',
  );
  log(
    db,
    guildId,
    e,
    'cancelled',
    by,
    going.length ? `${going.length} going were told` : '',
    now,
  );
  return { ok: true, event: getEvent(db, guildId, number)!, going };
}

/**
 * The Discord side of a cancel: the message shows Cancelled with its
 * buttons off, Going members get a DM, Discord's event is cancelled and
 * attending roles come off.
 */
export async function evCancelled(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  going: EvRsvp[],
  now = Date.now(),
) {
  const e = getEvent(db, guildId, number);
  if (!e) return 0;
  await evPost(rest, db, guildId, number, now).catch(() => {});
  const { config: c } = evConfigOf(db, guildId);
  let sent = 0;
  if (c.dms.cancelled) {
    const message = evMessage(db, guildId, c, 'cancelled');
    for (const p of going)
      if (
        await dm(
          rest,
          p.userId,
          evDmPayload(
            c,
            message,
            e,
            [],
            { id: p.userId, name: p.name, avatar: p.avatar },
            ctxOf(db, guildId, now),
          ),
        )
      )
        sent++;
  }
  await rolesOff(rest, db, guildId);
  return sent;
}

/** Cancels an event, in the database and in Discord. */
export async function evCancel(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  by: EvPerson,
  now = Date.now(),
) {
  const r = evMarkCancelled(db, guildId, number, by, now);
  if (!r.ok) return r;
  const told = await evCancelled(rest, db, guildId, number, r.going, now);
  return { ...r, told };
}

/** What's left in Discord after an event is deleted. */
export type EvLeftovers = {
  guildId: string;
  channelId: string | null;
  messageId: string | null;
  discordEventId: string | null;
  roles: { userId: string; roleId: string }[];
};

/** Deletes an event and its answers; Discord's side is `evRemoveLeftovers`. */
export function evForget(
  db: Db,
  guildId: string,
  number: number,
  by: EvPerson,
  now = Date.now(),
): EvLeftovers | null {
  const e = getEvent(db, guildId, number);
  if (!e) return null;
  const roles = (
    db
      .prepare(
        'SELECT user_id, role_id FROM ev_rsvps WHERE guild_id = ? AND number = ? AND role_id IS NOT NULL',
      )
      .all(guildId, number) as Row[]
  ).map((r) => ({ userId: r.user_id as string, roleId: r.role_id as string }));
  db.prepare('DELETE FROM ev_rsvps WHERE guild_id = ? AND number = ?').run(
    guildId,
    number,
  );
  db.prepare('DELETE FROM events WHERE guild_id = ? AND number = ?').run(
    guildId,
    number,
  );
  log(db, guildId, e, 'deleted', by, '', now);
  return {
    guildId,
    channelId: e.channelId,
    messageId: e.messageId,
    discordEventId: evOpen(e) ? e.discordEventId : null,
    roles,
  };
}

export async function evRemoveLeftovers(rest: Rest, left: EvLeftovers) {
  if (left.channelId && left.messageId)
    await rest
      .delete(`/channels/${left.channelId}/messages/${left.messageId}`)
      .catch(() => {});
  if (left.discordEventId)
    await rest
      .delete(`/guilds/${left.guildId}/scheduled-events/${left.discordEventId}`)
      .catch(() => {});
  for (const r of left.roles)
    await rest
      .delete(
        `/guilds/${left.guildId}/members/${r.userId}/roles/${r.roleId}`,
        'The event was deleted',
      )
      .catch(() => {});
}

export async function evDelete(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  by: EvPerson,
  now = Date.now(),
) {
  const left = evForget(db, guildId, number, by, now);
  if (left) await evRemoveLeftovers(rest, left);
  return !!left;
}

// Reminders, starts and ends --------------------------------------------------

/**
 * Sends the reminder DM to Going members (and Maybe, when the event says
 * so). `label` is the reminder's time, like "1h", or "" when staff asked.
 */
export async function evRemind(
  rest: Rest,
  db: Db,
  guildId: string,
  number: number,
  label: string,
  now = Date.now(),
  by: EvPerson = sparko,
) {
  const e = getEvent(db, guildId, number);
  if (!e) return { sent: 0, of: 0 };
  const { config: c } = evConfigOf(db, guildId);
  const people = listRsvps(db, guildId, number).filter(
    (r) => r.answer === 'going' || (e.remindMaybe && r.answer === 'maybe'),
  );
  const message = evMessage(db, guildId, c, 'reminder');
  const going = goingIds(db, guildId, number);
  let sent = 0;
  for (const p of people)
    if (
      await dm(
        rest,
        p.userId,
        evDmPayload(
          c,
          message,
          e,
          going,
          { id: p.userId, name: p.name, avatar: p.avatar },
          ctxOf(db, guildId, now),
        ),
      )
    )
      sent++;
  log(
    db,
    guildId,
    e,
    'reminded',
    by,
    `${label ? `the ${label} reminder` : `a reminder from @${by.name}`} went to ${sent} of ${people.length} ${people.length === 1 ? 'member' : 'members'}`,
    now,
  );
  return { sent, of: people.length };
}

/** Attending roles that should come off: the event is over, or they left Going. */
async function rolesOff(rest: Rest, db: Db, guildId: string) {
  const due = db
    .prepare(
      `SELECT r.user_id, r.number, r.role_id, r.name, r.at FROM ev_rsvps r
       LEFT JOIN events e ON e.guild_id = r.guild_id AND e.number = r.number
       WHERE r.guild_id = ? AND r.role_id IS NOT NULL
         AND (e.status IS NULL OR e.status IN ('ended', 'cancelled') OR r.answer != 'going')`,
    )
    .all(guildId) as Row[];
  const clear = db.prepare(
    'UPDATE ev_rsvps SET role_id = NULL WHERE guild_id = ? AND number = ? AND user_id = ?',
  );
  let n = 0;
  for (const r of due) {
    try {
      await rest.delete(
        `/guilds/${guildId}/members/${r.user_id as string}/roles/${r.role_id as string}`,
        'The event is over',
      );
      n++;
      clear.run(guildId, r.number as number, r.user_id as string);
    } catch (e) {
      // The member or the role is gone, so there's nothing to take back.
      if (e instanceof DiscordError && e.status === 404)
        clear.run(guildId, r.number as number, r.user_id as string);
    }
  }
  return n;
}

/** Ended and cancelled events past the ones kept for the dashboard. */
function prune(db: Db, guildId: string) {
  const old = db
    .prepare(
      `SELECT number FROM events WHERE guild_id = ? AND status IN ('ended', 'cancelled')
       ORDER BY end_at DESC LIMIT -1 OFFSET ?`,
    )
    .all(guildId, EV_KEEP_PAST) as Row[];
  for (const r of old) {
    db.prepare(
      'DELETE FROM ev_rsvps WHERE guild_id = ? AND number = ? AND role_id IS NULL',
    ).run(guildId, r.number as number);
    db.prepare('DELETE FROM events WHERE guild_id = ? AND number = ?').run(
      guildId,
      r.number as number,
    );
  }
}

/** The next event of a repeating one, once it has ended. */
async function repeat(
  rest: Rest,
  db: Db,
  guildId: string,
  e: EvEvent,
  now: number,
) {
  let start = evNextStart(e.start, e.repeat, e.timeZone);
  if (start === null) return null;
  // Sparko was offline for a while: the next one still to come.
  while (start + (e.end - e.start) <= now)
    start = evNextStart(start, e.repeat, e.timeZone)!;
  const d: EvDetails = {
    ...detailsOf(e),
    start,
    end: start + (e.end - e.start),
    postAt: 0,
  };
  const next = insert(
    db,
    guildId,
    d,
    { id: e.hostId, name: e.hostName },
    e.series ?? e.number,
    now,
  );
  log(db, guildId, e, 'repeated', sparko, `as #${next.number}`, now);
  await evPost(rest, db, guildId, next.number, now).catch((err: unknown) =>
    log(
      db,
      guildId,
      next,
      'failed',
      sparko,
      plainText(err, 'Sparko couldn’t post it.'),
      now,
    ),
  );
  return next;
}

const setStatus = (
  db: Db,
  guildId: string,
  number: number,
  status: EvStatus,
  now: number,
) =>
  db
    .prepare(
      'UPDATE events SET status = ?, updated_at = ? WHERE guild_id = ? AND number = ? AND status != ?',
    )
    .run(status, now, guildId, number, status).changes === 1;

/**
 * The bot runs this every minute: posts events whose time to post has
 * come, sends reminders that are due, starts events (with a ping), ends
 * them (posting the next when they repeat) and takes attending roles back.
 */
export async function evSweep(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
) {
  const out = { posted: 0, reminded: 0, started: 0, ended: 0, rolesOff: 0 };
  // Roles come off even after the module is switched off.
  out.rolesOff = await rolesOff(rest, db, guildId);
  const { on, config: c } = evConfigOf(db, guildId);
  if (!on || !c.channel) return out;
  const fail = (e: EvEvent, err: unknown, what: string) => {
    log(db, guildId, e, 'failed', sparko, plainText(err, what), now);
    // A refusal is for good; anything else tries again in a minute.
    return refused(err);
  };

  for (const e of listEvents(db, guildId)) {
    // Posting: at its time, or the ones a dashboard job didn't post.
    if (
      !e.messageId &&
      e.status === 'scheduled' &&
      ((e.postAt && e.postAt <= now) ||
        (!e.postAt && now - e.createdAt > 2 * MINUTE))
    ) {
      try {
        await evPost(rest, db, guildId, e.number, now);
        out.posted++;
      } catch (err) {
        // Not posted again and again: it waits until someone fixes it.
        if (fail(e, err, 'Sparko couldn’t post the event.'))
          db.prepare(
            'UPDATE events SET post_at = ? WHERE guild_id = ? AND number = ?',
          ).run(now + DAY, guildId, e.number);
      }
    }

    // Reminders: the latest one due, once; any it missed are skipped.
    if (e.status === 'scheduled' && now < e.start && c.dms.reminder) {
      const due = e.reminders.filter(
        (r) =>
          !e.reminded.includes(r) && e.start - (parseDuration(r) ?? 0) <= now,
      );
      if (due.length) {
        db.prepare(
          'UPDATE events SET reminded = ? WHERE guild_id = ? AND number = ?',
        ).run(JSON.stringify([...e.reminded, ...due]), guildId, e.number);
        const label = due.sort(
          (a, b) => (parseDuration(a) ?? 0) - (parseDuration(b) ?? 0),
        )[0]!;
        await evRemind(rest, db, guildId, e.number, label, now);
        out.reminded++;
      }
    }

    // Starting.
    if (e.status === 'scheduled' && now >= e.start && now < e.end) {
      if (!setStatus(db, guildId, e.number, 'started', now)) continue;
      out.started++;
      const started = getEvent(db, guildId, e.number)!;
      if (e.startPing && !e.startPinged) {
        db.prepare(
          'UPDATE events SET start_pinged = 1 WHERE guild_id = ? AND number = ?',
        ).run(guildId, e.number);
        await rest
          .post(
            `/channels/${e.channelId ?? c.channel}/messages`,
            evStartPayload(
              started,
              goingIds(db, guildId, e.number),
              evLink(guildId, started),
            ),
          )
          .catch((err: unknown) =>
            fail(e, err, 'Sparko couldn’t ping the channel at the start.'),
          );
      }
      log(db, guildId, e, 'started', sparko, `${e.counts.going} going`, now);
      await evPost(rest, db, guildId, e.number, now).catch(() => {});
    }

    // Ending.
    if (evOpen(e) && now >= e.end) {
      if (!setStatus(db, guildId, e.number, 'ended', now)) continue;
      out.ended++;
      log(
        db,
        guildId,
        e,
        'ended',
        sparko,
        `${e.counts.going} went${e.counts.maybe ? `, ${e.counts.maybe} maybe` : ''}`,
        now,
      );
      await evPost(rest, db, guildId, e.number, now).catch(() => {});
      if (e.repeat !== 'none') await repeat(rest, db, guildId, e, now);
    }
  }
  out.rolesOff += await rolesOff(rest, db, guildId);
  prune(db, guildId);
  return out;
}

/** Guilds with events on, or attending roles still to take back. */
export function evGuilds(db: Db) {
  return (
    db
      .prepare(
        `SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1
         UNION SELECT DISTINCT guild_id FROM ev_rsvps WHERE role_id IS NOT NULL`,
      )
      .all(EV_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// Testing the messages --------------------------------------------------------

/** A made-up event, for test messages and the dashboard. */
export const evSample = (c: Events, by: EvPerson, now: number): EvEvent => {
  const start = Math.ceil((now + 2 * 3_600_000) / 3_600_000) * 3_600_000;
  return {
    title: 'Movie night',
    description: 'Popcorn ready? We’re watching a classic together.',
    image: '',
    start,
    end: start + 2 * 3_600_000,
    timeZone: c.timeZone,
    place: null,
    location: 'Watch party channel',
    capacity: 20,
    options: c.options,
    roles: [],
    pingRole: '',
    repeat: 'none',
    reminders: c.reminders,
    remindMaybe: c.remindMaybe,
    startPing: c.startPing,
    postAt: 0,
    number: 1,
    status: 'scheduled',
    hostId: by.id,
    hostName: by.name,
    channelId: null,
    messageId: null,
    discordEventId: null,
    reminded: [],
    startPinged: false,
    series: null,
    counts: { going: 1, maybe: 0, no: 0, waitlist: 0 },
    createdAt: now,
    updatedAt: now,
  };
};

/** Posts a made-up event message (or DM) in a channel, so staff can see it. */
export async function evTestPost(
  rest: Rest,
  db: Db,
  guildId: string,
  channel: string,
  kind: EvKind,
  by: EvPerson,
  now = Date.now(),
) {
  const { config: c } = evConfigOf(db, guildId);
  const message = evMessage(db, guildId, c, kind);
  const e = evSample(c, by, now);
  const ctx = { ...ctxOf(db, guildId, now), channel };
  const body =
    kind === 'event'
      ? evPayload(c, message, e, [by.id], ctx)
      : evDmPayload(c, message, e, [by.id], by, ctx);
  // The test's buttons do nothing, so they're left off.
  const note = 'This is a test. No event was made.';
  const flagged = body as {
    flags?: number;
    components?: object[];
    content?: string;
  };
  const own = (flagged.components ?? []).filter(
    (x) => !JSON.stringify(x).includes('"ev:'),
  );
  try {
    await rest.post(
      `/channels/${channel}/messages`,
      flagged.flags === IS_COMPONENTS_V2
        ? { ...body, components: [{ type: 10, content: `-# ${note}` }, ...own] }
        : {
            ...body,
            components: own,
            content: `-# ${note}\n${flagged.content ?? ''}`.trim(),
          },
    );
  } catch (e) {
    plain(e);
  }
}
