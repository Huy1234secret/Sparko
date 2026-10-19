import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { getGuild, getModule, serverVars } from './store.ts';
import { normaliseStudio, type StudioMessage } from './studio-format.ts';
import { getTemplate } from './templates.ts';
import { Plain } from './ticket-actions.ts';
import { rememberPost } from './studio-actions.ts';
import {
  BD_MODULE,
  BD_ROLE_MS,
  ageIn,
  bdCanSet,
  bdDateProblem,
  bdDateText,
  bdDefaultMessage,
  bdDue,
  bdMonthlyDue,
  bdMonthlyPayload,
  bdMonths,
  bdPayload,
  bdUpgrade,
  localNow,
  zoneOk,
  type BdCelebrant,
  type BdEntry,
  type BdKind,
  type BdLogEntry,
  type Birthdays,
} from './birthdays.ts';

export * from './birthdays.ts';

type Row = Record<string, unknown>;
const KEEP = 500;
const DAY = 86_400_000;

export function bdConfigOf(db: Db, guildId: string) {
  const m = getModule<Birthdays>(db, guildId, BD_MODULE);
  return { on: m.on, config: bdUpgrade(m.config) };
}

// Saved birthdays -------------------------------------------------------------

const entryOf = (r: Row): BdEntry => ({
  userId: r.user_id as string,
  name: r.name as string,
  avatar: r.avatar as string,
  day: r.day as number,
  month: r.month as number,
  year: (r.year as number | null) ?? null,
  timeZone: r.time_zone as string,
  setById: r.set_by_id as string,
  setByName: r.set_by_name as string,
  inServer: r.in_server === 1,
  celebratedYear: (r.celebrated_year as number | null) ?? null,
  roleUntil: (r.role_until as number | null) ?? null,
  changedAt: r.changed_at as number,
  updatedAt: r.updated_at as number,
});

export function getBirthday(db: Db, guildId: string, userId: string) {
  const r = db
    .prepare('SELECT * FROM birthdays WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as Row | undefined;
  return r ? entryOf(r) : null;
}

/** Birthdays for Storage, in calendar order, matching what staff typed. */
export function listBirthdays(
  db: Db,
  guildId: string,
  { query = '', month = 0, limit = 2000 } = {},
) {
  const q = query.trim();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return (
    db
      .prepare(
        `SELECT * FROM birthdays WHERE guild_id = ?
           AND (? = '' OR user_id = ? OR name LIKE ? ESCAPE '\\')
           AND (? = 0 OR month = ?)
         ORDER BY month, day, name COLLATE NOCASE LIMIT ?`,
      )
      .all(guildId, q, q, like, month, month, limit) as Row[]
  ).map(entryOf);
}

export function bdCount(db: Db, guildId: string) {
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM birthdays WHERE guild_id = ?')
    .get(guildId) as { n: number };
  return n;
}

// The log ---------------------------------------------------------------------

export function addBdLog(db: Db, guildId: string, e: Omit<BdLogEntry, 'id'>) {
  db.prepare(
    `INSERT INTO bd_log (guild_id, action, user_id, user_name, detail, at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(guildId, e.action, e.userId, e.userName, e.detail.slice(0, 300), e.at);
  db.prepare(
    `DELETE FROM bd_log WHERE guild_id = ? AND id <= (
       SELECT id FROM bd_log WHERE guild_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`,
  ).run(guildId, guildId, KEEP);
}

export function listBdLog(db: Db, guildId: string, limit = 200) {
  return (
    db
      .prepare(
        'SELECT * FROM bd_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(guildId, limit) as Row[]
  ).map(
    (r): BdLogEntry => ({
      id: String(r.id),
      action: r.action as BdLogEntry['action'],
      userId: r.user_id as string,
      userName: r.user_name as string,
      detail: r.detail as string,
      at: r.at as number,
    }),
  );
}

// Saving ----------------------------------------------------------------------

export type BdPerson = { id: string; name: string; avatar: string };

/** How a saved date reads in the log, like "14 March 2001 (Europe/London)". */
const dateLine = (d: {
  day: number;
  month: number;
  year: number | null;
  timeZone: string;
}) =>
  `${bdDateText(d.day, d.month)}${d.year ? ` ${d.year}` : ''}${d.timeZone ? ` (${d.timeZone})` : ''}`;

/**
 * Saves a birthday without checking who's asking: the member's own, or one
 * staff set. Logs whether it's new or changed.
 */
export function bdSave(
  db: Db,
  guildId: string,
  input: {
    user: BdPerson;
    day: number;
    month: number;
    year: number | null;
    /** null keeps the time zone they had. */
    timeZone: string | null;
    by: { id: string; name: string };
  },
  now = Date.now(),
) {
  const old = getBirthday(db, guildId, input.user.id);
  const timeZone = input.timeZone ?? old?.timeZone ?? '';
  const moved =
    !old ||
    old.day !== input.day ||
    old.month !== input.month ||
    old.year !== input.year;
  db.prepare(
    `INSERT INTO birthdays (guild_id, user_id, name, avatar, day, month, year,
       time_zone, set_by_id, set_by_name, in_server, changed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       name = excluded.name, avatar = excluded.avatar, day = excluded.day,
       month = excluded.month, year = excluded.year,
       time_zone = excluded.time_zone, set_by_id = excluded.set_by_id,
       set_by_name = excluded.set_by_name, in_server = 1,
       changed_at = CASE WHEN ? THEN excluded.changed_at ELSE birthdays.changed_at END,
       updated_at = excluded.updated_at`,
  ).run(
    guildId,
    input.user.id,
    input.user.name,
    input.user.avatar,
    input.day,
    input.month,
    input.year,
    timeZone,
    input.by.id,
    input.by.name,
    now,
    now,
    moved ? 1 : 0,
  );
  const entry = getBirthday(db, guildId, input.user.id)!;
  const byOther = input.by.id !== input.user.id ? ` by @${input.by.name}` : '';
  addBdLog(db, guildId, {
    action: old ? 'changed' : 'set',
    userId: input.user.id,
    userName: input.user.name,
    detail: old
      ? `${dateLine(old)} → ${dateLine(entry)}${byOther}`
      : `${dateLine(entry)}${byOther}`,
    at: now,
  });
  return entry;
}

/**
 * Someone used /birthday set: checks the date, the time zone and (for
 * their own birthday) the account age, time in the server and how often
 * they've changed it. Staff setting someone else's skip those limits.
 */
export function bdSet(
  db: Db,
  input: {
    guildId: string;
    user: BdPerson;
    /** When their account was made, and when they joined. */
    created: number;
    joined: number | null;
    day: number;
    month: number;
    year: number | null;
    timeZone: string | null;
    /** Staff setting someone else's. */
    by?: { id: string; name: string } | undefined;
  },
  now = Date.now(),
): { ok: true; entry: BdEntry } | { ok: false; problem: string } {
  const { on, config: c } = bdConfigOf(db, input.guildId);
  if (!on) return { ok: false, problem: 'Birthdays are off in this server.' };
  const date = bdDateProblem(c, input, now);
  if (date) return { ok: false, problem: date };
  if (input.timeZone !== null && !zoneOk(input.timeZone))
    return {
      ok: false,
      problem:
        'That time zone isn’t one Sparko knows. Pick one from the list, like Europe/London.',
    };
  const old = getBirthday(db, input.guildId, input.user.id);
  const sameDate =
    old &&
    old.day === input.day &&
    old.month === input.month &&
    old.year === input.year;
  if (!input.by) {
    const why = bdCanSet(
      c,
      {
        created: input.created,
        joined: input.joined,
        // Only changing the date counts; a new time zone doesn't.
        changedAt: old && !sameDate ? old.changedAt : null,
      },
      now,
    );
    if (why) return { ok: false, problem: why };
  }
  const entry = bdSave(
    db,
    input.guildId,
    {
      user: input.user,
      day: input.day,
      month: input.month,
      year: input.year,
      timeZone: input.timeZone,
      by: input.by ?? { id: input.user.id, name: input.user.name },
    },
    now,
  );
  return { ok: true, entry };
}

/**
 * Forgets a birthday. Returns the role to take back when they still have
 * it for the day, or null when there was nothing saved.
 */
export function bdRemove(
  db: Db,
  guildId: string,
  userId: string,
  by: { id: string; name: string },
  now = Date.now(),
  why = '',
) {
  const r = db
    .prepare('SELECT * FROM birthdays WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as Row | undefined;
  if (!r) return null;
  const old = entryOf(r);
  db.prepare('DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?').run(
    guildId,
    userId,
  );
  addBdLog(db, guildId, {
    action: 'removed',
    userId,
    userName: old.name,
    detail:
      why ||
      (by.id === userId ? dateLine(old) : `${dateLine(old)} by @${by.name}`),
    at: now,
  });
  return { entry: old, roleId: old.roleUntil ? (r.role_id as string) : null };
}

/** Someone left: their birthday is forgotten, or hidden until they're back. */
export function bdLeft(
  db: Db,
  guildId: string,
  userId: string,
  now = Date.now(),
) {
  const { config: c } = bdConfigOf(db, guildId);
  if (!getBirthday(db, guildId, userId)) return null;
  if (c.forgetLeavers)
    return bdRemove(
      db,
      guildId,
      userId,
      { id: '0', name: 'Sparko' },
      now,
      'they left the server',
    );
  // Discord takes their roles when they leave, so the birthday role is gone.
  db.prepare(
    `UPDATE birthdays SET in_server = 0, role_id = NULL, role_until = NULL, updated_at = ?
     WHERE guild_id = ? AND user_id = ?`,
  ).run(now, guildId, userId);
  return getBirthday(db, guildId, userId);
}

/** Someone came back (or Sparko saw them again): their birthday counts again. */
export function bdJoined(
  db: Db,
  guildId: string,
  user: BdPerson,
  now = Date.now(),
) {
  db.prepare(
    `UPDATE birthdays SET in_server = 1, name = ?, avatar = ?, updated_at = ?
     WHERE guild_id = ? AND user_id = ? AND in_server = 0`,
  ).run(user.name, user.avatar, now, guildId, user.id);
}

// Posting ---------------------------------------------------------------------

/** A birthday message: the server's template, or Sparko's own. */
export function bdMessage(db: Db, guildId: string, c: Birthdays, kind: BdKind) {
  const id = c.messages[kind];
  const t = id
    ? getTemplate<StudioMessage>(db, guildId, 'studio', id)
    : undefined;
  return normaliseStudio(t?.message ?? bdDefaultMessage(kind));
}

/** Discord turned it down for good: no permission, or the channel's gone. */
const refused = (e: unknown) =>
  e instanceof DiscordError && e.status >= 400 && e.status < 500;

function plain(e: unknown): never {
  if (
    e instanceof DiscordError &&
    (e.code === DiscordCodes.missingPermissions ||
      e.code === DiscordCodes.missingAccess)
  )
    throw new Plain(
      'Sparko can’t post in the birthday channel. Give it View Channel, Send Messages and Embed Links there.',
    );
  if (e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
    throw new Plain('The birthday channel no longer exists. Pick another one.');
  if (e instanceof DiscordError && e.status === 400)
    throw new Plain(`Discord didn’t accept the message: ${e.message}`);
  throw e;
}

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

const serverOf = (db: Db, guildId: string) => serverVars(getGuild(db, guildId));
const celebrant = (c: Birthdays, b: BdEntry, year: number): BdCelebrant => ({
  id: b.userId,
  name: b.name,
  avatar: b.avatar,
  day: b.day,
  month: b.month,
  age: c.showAge ? ageIn(b, year) : null,
});

/** Takes the birthday role back from a member. */
export async function bdTakeRole(
  rest: Rest,
  guildId: string,
  userId: string,
  roleId: string,
) {
  await rest.delete(
    `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    'Their birthday is over',
  );
}

/** Birthday roles whose day is over come off, or are dropped if they can't. */
async function rolesOff(rest: Rest, db: Db, guildId: string, now: number) {
  const due = db
    .prepare(
      `SELECT * FROM birthdays WHERE guild_id = ? AND role_until IS NOT NULL
         AND role_until <= ?`,
    )
    .all(guildId, now) as Row[];
  const clear = db.prepare(
    `UPDATE birthdays SET role_id = NULL, role_until = NULL WHERE guild_id = ? AND user_id = ?`,
  );
  let n = 0;
  for (const r of due) {
    const b = entryOf(r);
    try {
      await bdTakeRole(rest, guildId, b.userId, r.role_id as string);
      clear.run(guildId, b.userId);
      addBdLog(db, guildId, {
        action: 'role-removed',
        userId: b.userId,
        userName: b.name,
        detail: '',
        at: now,
      });
      n++;
    } catch (e) {
      // The member or the role is gone, so there's nothing to take back.
      if (e instanceof DiscordError && e.status === 404)
        clear.run(guildId, b.userId);
      // Sparko keeps trying for a day, then says it couldn't.
      else if (now - b.roleUntil! > DAY) {
        clear.run(guildId, b.userId);
        addBdLog(db, guildId, {
          action: 'failed',
          userId: b.userId,
          userName: b.name,
          detail:
            'Sparko couldn’t take the birthday role back. Check its Manage Roles permission.',
          at: now,
        });
      }
    }
  }
  return n;
}

/** Birthdays that could be today somewhere: yesterday to tomorrow in UTC. */
function candidates(db: Db, guildId: string, now: number) {
  const dates = new Set<number>();
  for (const shift of [-DAY, 0, DAY]) {
    const d = new Date(now + shift);
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    dates.add(month * 100 + day);
    // 29 February is celebrated on the 28th in other years.
    if (month === 2 && day === 28) dates.add(229);
  }
  return (
    db
      .prepare(
        `SELECT * FROM birthdays WHERE guild_id = ? AND in_server = 1
           AND (month * 100 + day) IN (${[...dates].join(',')})`,
      )
      .all(guildId) as Row[]
  ).map(entryOf);
}

/**
 * Celebrates one group of members in the channel: the post, then each
 * one's role and DM. Their year is already marked, so nothing posts twice;
 * if Discord fails for a moment, the mark comes off to try again.
 */
async function celebrate(
  rest: Rest,
  db: Db,
  guildId: string,
  c: Birthdays,
  group: { entry: BdEntry; year: number; was: number | null }[],
  now: number,
) {
  const people = group.map((g) => celebrant(c, g.entry, g.year));
  const kind: BdKind = people.length === 1 ? 'single' : 'multiple';
  const message = bdMessage(db, guildId, c, kind);
  const server = serverOf(db, guildId);
  const today = localNow(now, c.timeZone);
  const body = bdPayload(message, people, {
    now,
    ping: c.ping,
    date: { day: today.day, month: today.month },
    server,
    channel: c.channel,
  });
  try {
    const sent = await rest.post<{ id: string }>(
      `/channels/${c.channel}/messages`,
      body,
    );
    rememberPost(db, guildId, sent.id, message, now);
  } catch (e) {
    const unmark = db.prepare(
      'UPDATE birthdays SET celebrated_year = ? WHERE guild_id = ? AND user_id = ?',
    );
    if (!refused(e))
      for (const g of group) unmark.run(g.was, guildId, g.entry.userId);
    let why = 'Sparko couldn’t post the birthday message.';
    try {
      plain(e);
    } catch (p) {
      if (p instanceof Plain) why = p.message;
    }
    for (const g of group)
      addBdLog(db, guildId, {
        action: 'failed',
        userId: g.entry.userId,
        userName: g.entry.name,
        detail: refused(e) ? why : `${why} It’ll try again in a minute.`,
        at: now,
      });
    return 0;
  }
  for (const [i, g] of group.entries()) {
    const b = g.entry;
    const p = people[i]!;
    const notes: string[] = [];
    if (c.dm) {
      const sent = await dm(
        rest,
        b.userId,
        bdPayload(bdMessage(db, guildId, c, 'dm'), [p], {
          now,
          ping: false,
          date: { day: b.day, month: b.month },
          server,
        }),
      );
      notes.push(sent ? 'sent a DM' : 'they don’t accept DMs');
    }
    addBdLog(db, guildId, {
      action: 'celebrated',
      userId: b.userId,
      userName: b.name,
      detail: [
        `${bdDateText(b.day, b.month)}${p.age !== null ? `, turning ${p.age}` : ''}`,
        ...notes,
      ].join(', '),
      at: now,
    });
    if (!c.role) continue;
    try {
      await rest.put(
        `/guilds/${guildId}/members/${b.userId}/roles/${c.role}`,
        {},
        'Happy birthday!',
      );
      db.prepare(
        'UPDATE birthdays SET role_id = ?, role_until = ? WHERE guild_id = ? AND user_id = ?',
      ).run(c.role, now + BD_ROLE_MS, guildId, b.userId);
      addBdLog(db, guildId, {
        action: 'role-given',
        userId: b.userId,
        userName: b.name,
        detail: '',
        at: now,
      });
    } catch (e) {
      addBdLog(db, guildId, {
        action: 'failed',
        userId: b.userId,
        userName: b.name,
        detail:
          e instanceof DiscordError &&
          e.code === DiscordCodes.missingPermissions
            ? 'Sparko couldn’t give the birthday role. It needs Manage Roles, and its role has to be above it.'
            : 'Sparko couldn’t give the birthday role.',
        at: now,
      });
    }
  }
  return group.length;
}

/** Posts this month's birthdays on the 1st, once. */
async function monthly(
  rest: Rest,
  db: Db,
  guildId: string,
  c: Birthdays,
  now: number,
) {
  const row = db
    .prepare('SELECT monthly FROM bd_state WHERE guild_id = ?')
    .get(guildId) as { monthly: string } | undefined;
  const due = bdMonthlyDue(c, row?.monthly ?? '', now);
  if (!due) return false;
  db.prepare(
    `INSERT INTO bd_state (guild_id, monthly) VALUES (?, ?)
     ON CONFLICT (guild_id) DO UPDATE SET monthly = excluded.monthly`,
  ).run(guildId, due.key);
  const people = listBirthdays(db, guildId, { month: due.month }).filter(
    (b) => b.inServer || !c.hideLeft,
  );
  const name = bdMonths[due.month - 1]!;
  const log = (action: 'monthly' | 'failed', detail: string) =>
    addBdLog(db, guildId, {
      action,
      userId: '0',
      userName: 'Sparko',
      detail,
      at: now,
    });
  if (!people.length) {
    log('monthly', `nobody has a birthday in ${name}, so nothing was posted`);
    return false;
  }
  const message = bdMessage(db, guildId, c, 'monthly');
  try {
    const sent = await rest.post<{ id: string }>(
      `/channels/${c.channel}/messages`,
      bdMonthlyPayload(
        message,
        people.map((b) => ({ id: b.userId, day: b.day, month: b.month })),
        {
          now,
          month: due.month,
          server: serverOf(db, guildId),
          channel: c.channel,
        },
      ),
    );
    rememberPost(db, guildId, sent.id, message, now);
    log(
      'monthly',
      `${people.length} ${people.length === 1 ? 'birthday' : 'birthdays'} in ${name}`,
    );
    return true;
  } catch (e) {
    // A moment's trouble tries again; a refusal waits for next month.
    if (!refused(e))
      db.prepare('UPDATE bd_state SET monthly = ? WHERE guild_id = ?').run(
        row?.monthly ?? '',
        guildId,
      );
    log('failed', `Sparko couldn’t post ${name}’s birthdays.`);
    return false;
  }
}

/**
 * The bot runs this every minute: takes back birthday roles whose day is
 * over, celebrates birthdays that are due (each once a year), and posts
 * the monthly list on the 1st.
 */
export async function bdSweep(
  rest: Rest,
  db: Db,
  guildId: string,
  now = Date.now(),
) {
  const { on, config: c } = bdConfigOf(db, guildId);
  const out = { celebrated: 0, rolesOff: 0, monthly: false };
  // Roles come off even after the module is switched off.
  out.rolesOff = await rolesOff(rest, db, guildId, now);
  if (!on || !c.channel) return out;
  const mark = db.prepare(
    `UPDATE birthdays SET celebrated_year = ?
     WHERE guild_id = ? AND user_id = ?
       AND (celebrated_year IS NULL OR celebrated_year != ?)`,
  );
  const due: { entry: BdEntry; year: number; was: number | null }[] = [];
  for (const b of candidates(db, guildId, now)) {
    const d = bdDue(c, b, now);
    // Marked first, so a second sweep can't post it again.
    if (d && mark.run(d.year, guildId, b.userId, d.year).changes === 1)
      due.push({ entry: b, year: d.year, was: b.celebratedYear });
  }
  const groups =
    c.style === 'each' ? due.map((d) => [d]) : due.length ? [due] : [];
  for (const g of groups)
    out.celebrated += await celebrate(rest, db, guildId, c, g, now);
  out.monthly = await monthly(rest, db, guildId, c, now);
  return out;
}

/** Guilds with birthdays on, or with birthday roles still to take back. */
export function bdGuilds(db: Db) {
  return (
    db
      .prepare(
        `SELECT guild_id FROM modules WHERE module_id = ? AND enabled = 1
         UNION SELECT DISTINCT guild_id FROM birthdays WHERE role_until IS NOT NULL`,
      )
      .all(BD_MODULE) as Row[]
  ).map((r) => r.guild_id as string);
}

// Testing the messages --------------------------------------------------------

/** Posts a made-up birthday message in a channel, so staff can see it. */
export async function bdTestPost(
  rest: Rest,
  db: Db,
  guildId: string,
  channel: string,
  kind: BdKind,
  by: BdPerson,
  now = Date.now(),
) {
  const { config: c } = bdConfigOf(db, guildId);
  const message = bdMessage(db, guildId, c, kind);
  const server = serverOf(db, guildId);
  const today = localNow(now, c.timeZone);
  const you: BdCelebrant = {
    ...by,
    day: today.day,
    month: today.month,
    age: c.showAge ? 21 : null,
  };
  const body =
    kind === 'monthly'
      ? bdMonthlyPayload(
          message,
          [
            { id: by.id, day: 3, month: today.month },
            { id: by.id, day: 17, month: today.month },
          ],
          { now, month: today.month, server, channel },
        )
      : bdPayload(message, kind === 'multiple' ? [you, you] : [you], {
          now,
          ping: false,
          date: today,
          server,
          channel,
        });
  const note = 'This is a test. Nobody’s birthday was celebrated.';
  const flagged = body as {
    flags?: number;
    components?: object[];
    content?: string;
  };
  try {
    await rest.post(
      `/channels/${channel}/messages`,
      flagged.flags
        ? {
            ...body,
            components: [
              { type: 10, content: `-# ${note}` },
              ...(flagged.components ?? []),
            ],
          }
        : { ...body, content: `-# ${note}\n${flagged.content ?? ''}`.trim() },
    );
  } catch (e) {
    plain(e);
  }
}
