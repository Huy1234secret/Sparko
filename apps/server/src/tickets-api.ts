import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addTicketMessage,
  addVersion,
  ago,
  cleanPanel,
  enqueueJob,
  getModule,
  getTicket,
  listTickets,
  listVersions,
  panelProblem,
  Plain,
  ticketActions,
  ticketMessages,
  ticketPanelDefault,
  ticketStaff,
  updateTicket,
  writeModule,
  type Db,
  type GuildView,
  type Rest,
  type StoredUser,
  type TicketPanel,
  type TicketPriority,
  type TicketRow,
} from '@sparko/core';
import { BadRequest, json, readJson } from './http.ts';

type Ctx = {
  db: Db;
  rest: Rest | undefined;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
};
type Call = {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  guildId: string;
  user: StoredUser;
};

const colourOf = (id: string | null) =>
  (((id ? Number(id.slice(-4)) : 0) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
const priorities: TicketPriority[] = ['urgent', 'high', 'normal', 'low'];

/** "Today at 18:31", "Yesterday at 09:02" or "11 Oct at 10:30", in the viewer's time zone. */
export function stamp(at: number, now: number, timeZone?: string) {
  const zone = (() => {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone }).resolvedOptions()
        .timeZone;
    } catch {
      return 'UTC';
    }
  })();
  const day = (t: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(t);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  if (day(at) === day(now)) return `Today at ${time}`;
  if (day(at) === day(now - 86_400_000)) return `Yesterday at ${time}`;
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
  }).format(at);
  return `${date} at ${time}`;
}

/** /api/v1/servers/:id/tickets… */
export function ticketRoutes({ db, rest, view, now }: Ctx) {
  const actions = rest ? ticketActions(rest, db, now) : undefined;
  const needBot = () => {
    if (!actions)
      throw new Plain(
        'Sparko’s bot token isn’t set on the server, so it can’t reach Discord.',
      );
    return actions;
  };

  const summary = (t: TicketRow, user: StoredUser, tz?: string) => ({
    number: t.number,
    topic: t.topic,
    member: t.memberName,
    category: t.category,
    status: t.status,
    priority: t.priority,
    assignee: t.assigneeId === user.id ? 'You' : t.assigneeName,
    lastAt: ago(t.lastAt, now()),
    lastBy: t.lastBy,
    waitingMinutes:
      t.status !== 'closed' && t.lastBy === 'member'
        ? Math.floor((now() - t.lastAt) / 60_000)
        : 0,
    openedAt: stamp(t.openedAt, now(), tz),
    ...(t.closedBy
      ? { closedBy: t.closedBy === user.name ? 'You' : t.closedBy }
      : {}),
    ...(t.closeReason ? { closeReason: t.closeReason } : {}),
  });

  /** "Today", "3 h ago", "2 days ago", "Yesterday", or a date. */
  const since = (at: number) => {
    const label = ago(at, now());
    return label === 'Just now'
      ? 'Today'
      : /^\d/.test(label)
        ? `${label} ago`
        : label;
  };

  async function person(guildId: string, memberId: string, name: string) {
    const base = {
      name,
      color: colourOf(memberId),
      joined: 'Unknown',
      account: 'Unknown',
      roles: 'None',
    };
    if (!rest) return base;
    const created = Number((BigInt(memberId) >> 22n) + 1420070400000n);
    const ageDays = Math.floor((now() - created) / 86_400_000);
    const account =
      ageDays < 1
        ? 'Made today'
        : ageDays < 60
          ? `${ageDays} days old`
          : ageDays < 730
            ? `${Math.floor(ageDays / 30)} months old`
            : `${Math.floor(ageDays / 365)} years old`;
    try {
      const [m, v] = await Promise.all([
        rest.get<{ joined_at: string; roles: string[] }>(
          `/guilds/${guildId}/members/${memberId}`,
        ),
        view(guildId),
      ]);
      const roleNames = m.roles
        .map((id) => v?.roles.find((r) => r.id === id)?.name)
        .filter(Boolean);
      return {
        ...base,
        joined: since(Date.parse(m.joined_at)),
        account,
        roles: roleNames.length ? roleNames.join(', ') : 'None yet',
        ...(ageDays < 30 ? { newAccount: true } : {}),
      };
    } catch {
      // They left the server; show what we know.
      return { ...base, account, joined: 'Left the server' };
    }
  }

  function staffList(guildId: string, user: StoredUser) {
    const people = new Map<string, string>([[user.id, 'You']]);
    for (const s of ticketStaff(db, guildId))
      if (!people.has(s.id)) people.set(s.id, s.name);
    for (const t of listTickets(db, guildId))
      if (t.assigneeId && !people.has(t.assigneeId))
        people.set(t.assigneeId, t.assigneeName ?? 'Staff');
    return [...people].map(([id, name]) => ({ id, name, color: colourOf(id) }));
  }

  return async function handle(c: Call): Promise<boolean> {
    const { req, res, method, path, guildId, user } = c;
    const tz = (req.headers['x-timezone'] as string | undefined) ?? undefined;

    if (path === '/tickets' && method === 'GET') {
      const v = await view(guildId);
      const channels = (v?.channels ?? []).map(
        ({ id, name, category, canPost }) => ({
          id,
          name,
          category,
          canPost,
        }),
      );
      const saved = getModule<TicketPanel>(db, guildId, 'tickets');
      json(res, 200, {
        on: saved.on,
        panel:
          saved.config ??
          ticketPanelDefault(
            channels.find((x) => x.canPost)?.id ?? channels[0]?.id ?? '',
          ),
        channels,
        roles: (v?.roles ?? [])
          .filter((r) => !r.managed)
          .map(({ id, name }) => ({ id, name })),
        staff: staffList(guildId, user).map(({ name, color }) => ({
          name,
          color,
        })),
        versions: listVersions<TicketPanel>(db, guildId, 'tickets').map(
          (x) => ({
            id: x.id,
            title: x.title,
            who: x.who,
            whoColor: colourOf(x.whoId),
            when: ago(x.at, now()),
            config: x.config,
          }),
        ),
      });
      return true;
    }
    if (path === '/tickets' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; panel?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Tickets is on or off.');
      const problem = panelProblem(body.panel);
      if (problem) throw new BadRequest(problem);
      const panel = cleanPanel(body.panel as TicketPanel);
      const at = now();
      writeModule(db, guildId, 'tickets', { on: body.on, config: panel }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: 'tickets',
          title: body.on ? 'Updated the ticket panel' : 'Turned Tickets off',
          who: user,
          config: panel,
        },
        at,
      );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: body.on ? 'updated the ticket panel' : 'turned off Tickets',
          icon: 'ticket',
        },
        at,
      );
      enqueueJob(db, { guildId, moduleId: 'tickets', kind: 'tickets' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/tickets/list' && method === 'GET') {
      json(
        res,
        200,
        listTickets(db, guildId).map((t) => summary(t, user, tz)),
      );
      return true;
    }

    const m = path.match(/^\/tickets\/(\d{1,9})(\/[a-z]+)?$/);
    if (!m) return false;
    const t = getTicket(db, guildId, Number(m[1]));
    if (!t) {
      json(res, 404, { error: 'not_found', message: 'Ticket not found' });
      return true;
    }
    const action = m[2] ?? '';

    if (action === '' && method === 'GET') {
      json(res, 200, {
        ...summary(t, user, tz),
        messages: ticketMessages(db, guildId, t.number).map((x) => ({
          id: String(x.id),
          kind: x.kind,
          author: x.authorName,
          authorColor: x.authorId ? colourOf(x.authorId) : 1,
          staff: x.staff,
          text: x.text,
          at: stamp(x.at, now(), tz),
          ...(x.file ? { file: x.file } : {}),
        })),
        people: [
          {
            heading: 'Opened by',
            person: await person(guildId, t.memberId, t.memberName),
          },
        ],
      });
    } else if (action === '/messages' && method === 'POST') {
      const body = await readJson<{ text?: unknown; note?: unknown }>(req);
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!text || text.length > 2000)
        throw new BadRequest('Write a message of up to 2,000 characters.');
      if (body?.note === true) {
        addTicketMessage(
          db,
          {
            guildId,
            number: t.number,
            kind: 'note',
            authorId: user.id,
            authorName: user.name,
            staff: true,
            text,
          },
          now(),
        );
      } else await needBot().reply(t, user, text);
      res.writeHead(204).end();
    } else if (action === '' && method === 'PATCH') {
      const body = await readJson<{ priority?: unknown; assignee?: unknown }>(
        req,
      );
      if (body?.priority !== undefined) {
        if (!priorities.includes(body.priority as TicketPriority))
          throw new BadRequest('Pick a priority from the list.');
        updateTicket(db, guildId, t.number, {
          priority: body.priority as TicketPriority,
        });
      }
      if (body?.assignee !== undefined) {
        const who =
          body.assignee === null
            ? null
            : body.assignee === 'You'
              ? { id: user.id, name: user.name }
              : staffList(guildId, user).find((s) => s.name === body.assignee);
        if (who === undefined)
          throw new BadRequest('Pick someone from the list.');
        updateTicket(db, guildId, t.number, {
          assigneeId: who?.id ?? null,
          assigneeName: who?.name ?? null,
          ...(t.status === 'new' && who ? { status: 'claimed' as const } : {}),
          ...(t.status === 'claimed' && !who ? { status: 'new' as const } : {}),
        });
      }
      res.writeHead(204).end();
    } else if (action === '/close' && method === 'POST') {
      const body = await readJson<{
        reason?: unknown;
        detail?: unknown;
        dm?: unknown;
      }>(req);
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
      const detail = typeof body?.detail === 'string' ? body.detail.trim() : '';
      if (!reason || reason.length > 200 || detail.length > 500)
        throw new BadRequest('Give a short reason for closing.');
      await needBot().close(
        t,
        user,
        detail ? `${reason}: ${detail}` : reason,
        body?.dm === true,
      );
      res.writeHead(204).end();
    } else if (action === '/reopen' && method === 'POST') {
      await needBot().reopen(t, user);
      res.writeHead(204).end();
    } else if (action === '/transcript' && method === 'GET') {
      const esc = (s: string) =>
        s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
      const rows = ticketMessages(db, guildId, t.number)
        .map(
          (x) =>
            `<p class="${x.kind}"><b>${esc(x.authorName)}</b> <small>${esc(stamp(x.at, now(), tz))}${x.kind === 'note' ? ' · staff note' : ''}</small><br>${esc(x.text)}${x.file ? `<br><i>Attachment: ${esc(x.file)}</i>` : ''}</p>`,
        )
        .join('\n');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="ticket-${t.number}.html"`,
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'",
      });
      res.end(`<!doctype html><meta charset="utf-8"><title>Ticket #${t.number}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px}small{color:#666}.note{background:#fff7d6;padding:8px;border-radius:6px}</style>
<h1>Ticket #${t.number}: ${esc(t.topic)}</h1>
<p>Opened by ${esc(t.memberName)} · ${esc(t.category)} · ${esc(stamp(t.openedAt, now(), tz))}${t.closeReason ? ` · Closed by ${esc(t.closedBy ?? '')}: ${esc(t.closeReason)}` : ''}</p>
${rows}`);
    } else json(res, 405, { error: 'method_not_allowed' });
    return true;
  };
}
