import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  bdConfigOf,
  cleanEvents,
  enqueueJob,
  EV_MODULE,
  evConfigOf,
  evCreate,
  evForget,
  evIssue,
  evKinds,
  evLimits,
  evMarkCancelled,
  evPastCount,
  evSetNoShow,
  evUpcomingCount,
  evUpdate,
  getEvent,
  getGuild,
  has,
  listEvents,
  listEvLog,
  listLibrary,
  listRsvps,
  Perm,
  sgConfigOf,
  writeModule,
  type Db,
  type EvKind,
  type Events,
  type GuildView,
  type StoredUser,
} from '@sparko/core';
import { BadRequest, json, readJson } from './http.ts';

type Call = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  path: string;
  guildId: string;
  user: StoredUser;
};
const hex = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : null);
const snowflake = /^\d{1,25}$/;

/** /api/v1/servers/:id/events… */
export function evRoutes({
  db,
  view,
  now,
}: {
  db: Db;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
}) {
  /** The roles and voice channels events can name, when Discord answered. */
  const known = (v: GuildView | undefined) =>
    v
      ? {
          roles: new Set(v.roles.map((r) => r.id)),
          ...(v.voice ? { places: new Set(v.voice.map((c) => c.id)) } : {}),
        }
      : {};
  const queue = (guildId: string, kind: string, payload?: unknown) =>
    enqueueJob(
      db,
      {
        guildId,
        moduleId: EV_MODULE,
        kind,
        ...(payload === undefined ? {} : { payload }),
      },
      now(),
    );
  const audit = (
    guildId: string,
    user: StoredUser,
    what: string,
    detail: string,
    icon = 'calendar',
  ) => addAudit(db, { guildId, who: user.name, what, detail, icon }, now());
  const by = (user: StoredUser) => ({
    id: user.id,
    name: user.name,
    avatar: user.avatarUrl,
  });

  return async function handle({
    req,
    res,
    url,
    method,
    path,
    guildId,
    user,
  }: Call) {
    if (path === '/events' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = evConfigOf(db, guildId);
      const plan = getGuild(db, guildId)?.plan ?? 'free';
      json(res, 200, {
        on,
        config,
        upcoming: evUpcomingCount(db, guildId),
        past: evPastCount(db, guildId),
        limits: evLimits(plan),
        // Unknown until Discord answers, so the dashboard doesn't warn early.
        canSync: v ? has(v.perms, Perm.manageEvents) : true,
        channels: (v?.channels ?? []).map(
          ({ id, name, category, canPost }) => ({
            id,
            name,
            category,
            canPost,
          }),
        ),
        voice: v?.voice ?? [],
        roles: (v?.roles ?? [])
          .filter((r) => !r.managed)
          .map(({ id, name, color, color2, assignable }) => ({
            id,
            name,
            color: hex(color),
            color2: color && color2 ? hex(color2) : null,
            assignable,
          })),
        log: listEvLog(db, guildId),
      });
      return true;
    }
    if (path === '/events' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Events is on or off.');
      const v = await view(guildId);
      const templates = new Set(
        listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
      );
      const issue = evIssue(body.config, {
        templates,
        plan: getGuild(db, guildId)?.plan,
        ...(v
          ? { roles: new Map(v.roles.map((r) => [r.id, r.assignable])) }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanEvents(body.config as Events);
      // Every module's commands live in the same list in Discord.
      const name = config.commands.group.name;
      const sg = sgConfigOf(db, guildId);
      const bd = bdConfigOf(db, guildId);
      if (
        sg.on &&
        Object.values(sg.config.commands).some((c) => c.on && c.name === name)
      )
        throw new BadRequest(
          `/${name} is already a suggestion command. Pick another name in Commands.`,
        );
      if (bd.on && bd.config.commands.group.name === name)
        throw new BadRequest(
          `/${name} is already the birthday command. Pick another name in Commands.`,
        );
      const at = now();
      writeModule(db, guildId, EV_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: EV_MODULE,
          title: body.on ? 'Updated Events' : 'Turned Events off',
          who: user,
          config,
        },
        at,
      );
      audit(
        guildId,
        user,
        body.on ? 'updated Events' : 'turned off Events',
        '',
      );
      // The bot checks the channel and the role, and registers the commands.
      queue(guildId, 'events');
      res.writeHead(204).end();
      return true;
    }
    if (path === '/events/items' && method === 'GET') {
      const when =
        url.searchParams.get('when') === 'past' ? 'past' : 'upcoming';
      json(res, 200, { events: listEvents(db, guildId, { when }) });
      return true;
    }
    if (path === '/events/items' && method === 'POST') {
      const body = await readJson<unknown>(req);
      const r = evCreate(
        db,
        guildId,
        body,
        by(user),
        now(),
        known(await view(guildId)),
      );
      if (!r.ok) throw new BadRequest(r.problem);
      // The bot posts it, unless it's set to post later.
      if (!r.event.postAt)
        queue(guildId, 'events-post', { number: r.event.number });
      audit(guildId, user, 'scheduled an event', r.event.title);
      json(res, 201, { event: r.event });
      return true;
    }
    const one = path.match(/^\/events\/items\/(\d{1,9})$/);
    if (one && method === 'PUT') {
      const number = Number(one[1]);
      const body = await readJson<unknown>(req);
      const r = evUpdate(
        db,
        guildId,
        number,
        body,
        by(user),
        now(),
        known(await view(guildId)),
      );
      if (!r.ok) throw new BadRequest(r.problem);
      // The bot edits the message and tells anyone moved off the waitlist.
      queue(guildId, 'events-edit', {
        number,
        promoted: r.promoted.map((p) => p.userId),
      });
      audit(guildId, user, 'changed an event', `#${number} ${r.event.title}`);
      json(res, 200, { event: r.event });
      return true;
    }
    if (one && method === 'DELETE') {
      const number = Number(one[1]);
      const title = getEvent(db, guildId, number)?.title ?? '';
      const left = evForget(db, guildId, number, by(user), now());
      if (!left) return (json(res, 404, { error: 'not_found' }), true);
      // The bot takes the message, Discord's event and roles down.
      queue(guildId, 'events-delete', left);
      audit(
        guildId,
        user,
        'deleted an event',
        `#${number} ${title}`,
        'trash-2',
      );
      res.writeHead(204).end();
      return true;
    }
    const cancel = path.match(/^\/events\/items\/(\d{1,9})\/cancel$/);
    if (cancel && method === 'POST') {
      const number = Number(cancel[1]);
      const r = evMarkCancelled(db, guildId, number, by(user), now());
      if (!r.ok) throw new BadRequest(r.problem);
      // The bot edits the message, DMs Going members and cancels in Discord.
      queue(guildId, 'events-cancel', {
        number,
        going: r.going.map((g) => g.userId),
      });
      audit(guildId, user, 'cancelled an event', `#${number} ${r.event.title}`);
      json(res, 200, { event: r.event });
      return true;
    }
    const rsvps = path.match(/^\/events\/items\/(\d{1,9})\/rsvps$/);
    if (rsvps && method === 'GET') {
      const number = Number(rsvps[1]);
      if (!getEvent(db, guildId, number))
        return (json(res, 404, { error: 'not_found' }), true);
      json(res, 200, { rsvps: listRsvps(db, guildId, number) });
      return true;
    }
    const member = path.match(
      /^\/events\/items\/(\d{1,9})\/rsvps\/(\d{1,25})$/,
    );
    if (member && method === 'PUT') {
      const body = await readJson<{ noShow?: unknown }>(req);
      if (typeof body?.noShow !== 'boolean')
        throw new BadRequest('Say whether they came or not.');
      const ok = evSetNoShow(
        db,
        guildId,
        Number(member[1]),
        member[2]!,
        body.noShow,
      );
      if (!ok) return (json(res, 404, { error: 'not_found' }), true);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/events/test' && method === 'POST') {
      const body = await readJson<{ channel?: unknown; kind?: unknown }>(req);
      const channel = typeof body?.channel === 'string' ? body.channel : '';
      if (!snowflake.test(channel))
        throw new BadRequest('Pick a channel to send the test message to.');
      const kind = body?.kind as EvKind;
      if (!evKinds.includes(kind))
        throw new BadRequest('Pick which event message to test.');
      queue(guildId, 'events-test', {
        channel,
        kind,
        userId: user.id,
        userName: user.name,
        avatar: user.avatarUrl,
      });
      res.writeHead(204).end();
      return true;
    }
    return false;
  };
}
