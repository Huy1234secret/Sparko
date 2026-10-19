import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  BD_MODULE,
  bdConfigOf,
  bdCount,
  bdDateProblem,
  bdDateText,
  bdIssue,
  bdKinds,
  bdRemove,
  bdSave,
  bdUpcoming,
  cleanBirthdays,
  DiscordError,
  enqueueJob,
  getBirthday,
  listBdLog,
  listBirthdays,
  listLibrary,
  sgConfigOf,
  writeModule,
  zoneOk,
  type BdKind,
  type Birthdays,
  type Db,
  type GuildView,
  type Rest,
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

/** A server member as Discord sends them. */
type DiscordMember = {
  nick?: string | null;
  avatar?: string | null;
  user?: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
};
const avatarOf = (id: string, hash: string | null | undefined) =>
  hash
    ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) % 6n)}.png`;
const personOf = (m: DiscordMember) =>
  m.user && {
    userId: m.user.id,
    name: m.nick || m.user.global_name || m.user.username,
    avatar: avatarOf(m.user.id, m.user.avatar),
  };

/** /api/v1/servers/:id/birthdays… */
export function bdRoutes({
  db,
  rest,
  view,
  now,
}: {
  db: Db;
  /** Discord, for finding members; not there in some tests. */
  rest: Rest | undefined;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
}) {
  return async function handle({
    req,
    res,
    url,
    method,
    path,
    guildId,
    user,
  }: Call) {
    if (path === '/birthdays' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = bdConfigOf(db, guildId);
      json(res, 200, {
        on,
        config,
        count: bdCount(db, guildId),
        channels: (v?.channels ?? []).map(
          ({ id, name, category, canPost }) => ({
            id,
            name,
            category,
            canPost,
          }),
        ),
        roles: (v?.roles ?? [])
          .filter((r) => !r.managed)
          .map(({ id, name, color, color2, assignable }) => ({
            id,
            name,
            color: hex(color),
            color2: color && color2 ? hex(color2) : null,
            assignable,
          })),
        log: listBdLog(db, guildId),
      });
      return true;
    }
    if (path === '/birthdays' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Birthdays is on or off.');
      const v = await view(guildId);
      const templates = new Set(
        listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
      );
      const issue = bdIssue(body.config, {
        templates,
        ...(v
          ? { roles: new Map(v.roles.map((r) => [r.id, r.assignable])) }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanBirthdays(body.config as Birthdays);
      // Both modules' commands live in the same list in Discord.
      const sg = sgConfigOf(db, guildId);
      const taken = sg.on
        ? Object.values(sg.config.commands).some(
            (c) => c.on && c.name === config.commands.group.name,
          )
        : false;
      if (taken)
        throw new BadRequest(
          `/${config.commands.group.name} is already a suggestion command. Pick another name in Commands.`,
        );
      const at = now();
      writeModule(db, guildId, BD_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: BD_MODULE,
          title: body.on ? 'Updated Birthdays' : 'Turned Birthdays off',
          who: user,
          config,
        },
        at,
      );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: body.on ? 'updated Birthdays' : 'turned off Birthdays',
          icon: 'gift',
        },
        at,
      );
      // The bot checks the channel and the role, and registers the commands.
      enqueueJob(db, { guildId, moduleId: BD_MODULE, kind: 'birthdays' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/birthdays/list' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').slice(0, 100);
      const { config } = bdConfigOf(db, guildId);
      json(res, 200, {
        birthdays: listBirthdays(db, guildId, { query: q }),
        upcoming: bdUpcoming(config, listBirthdays(db, guildId), now()),
        count: bdCount(db, guildId),
      });
      return true;
    }
    // Finding a member to add a birthday for.
    if (path === '/birthdays/members' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
      if (!q || !rest) return (json(res, 200, { members: [] }), true);
      const found = snowflake.test(q)
        ? [
            await rest
              .get<DiscordMember>(`/guilds/${guildId}/members/${q}`)
              .catch(() => null),
          ]
        : await rest
            .get<
              DiscordMember[]
            >(`/guilds/${guildId}/members/search?query=${encodeURIComponent(q)}&limit=10`)
            .catch(() => []);
      json(res, 200, {
        members: found
          .map((m) => (m ? personOf(m) : undefined))
          .filter((m) => !!m)
          .map((m) => ({ ...m, saved: !!getBirthday(db, guildId, m.userId) })),
      });
      return true;
    }
    const one = path.match(/^\/birthdays\/members\/(\d{1,25})$/);
    if (one && method === 'PUT') {
      const userId = one[1]!;
      const body = await readJson<{
        day?: unknown;
        month?: unknown;
        year?: unknown;
        timeZone?: unknown;
      }>(req);
      const { config } = bdConfigOf(db, guildId);
      const year = body?.year === null || body?.year === '' ? null : body?.year;
      const date = { day: body?.day, month: body?.month, year };
      const problem = bdDateProblem(config, date, now());
      if (problem) throw new BadRequest(problem);
      const timeZone = body?.timeZone ?? '';
      if (timeZone !== '' && !zoneOk(timeZone))
        throw new BadRequest('Pick a time zone from the list, or none.');
      const old = getBirthday(db, guildId, userId);
      let person = old && {
        userId,
        name: old.name,
        avatar: old.avatar,
      };
      // Someone new has to be in the server; Discord says who they are.
      try {
        if (!rest) throw new Error('No Discord connection.');
        const m = await rest.get<DiscordMember>(
          `/guilds/${guildId}/members/${userId}`,
        );
        person = personOf(m) ?? person ?? { userId, name: userId, avatar: '' };
      } catch (e) {
        if (!old && e instanceof DiscordError && e.status === 404)
          throw new BadRequest('That member isn’t in the server.');
        if (!person) throw new BadRequest('Sparko couldn’t find that member.');
      }
      const entry = bdSave(
        db,
        guildId,
        {
          user: { id: userId, name: person!.name, avatar: person!.avatar },
          day: date.day as number,
          month: date.month as number,
          year: (year as number | null | undefined) ?? null,
          timeZone: timeZone as string,
          by: user,
        },
        now(),
      );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: old ? 'changed a birthday' : 'added a birthday',
          detail: `${entry.name}: ${bdDateText(entry.day, entry.month)}`,
          icon: 'gift',
        },
        now(),
      );
      json(res, 200, { birthday: entry });
      return true;
    }
    if (one && method === 'DELETE') {
      const userId = one[1]!;
      const gone = bdRemove(db, guildId, userId, user, now());
      if (!gone) return (json(res, 404, { error: 'not_found' }), true);
      // The bot takes the birthday role back if they still have it.
      if (gone.roleId)
        enqueueJob(
          db,
          {
            guildId,
            moduleId: BD_MODULE,
            kind: 'birthdays-role-off',
            payload: { userId, roleId: gone.roleId },
          },
          now(),
        );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'removed a birthday',
          detail: gone.entry.name,
          icon: 'trash-2',
        },
        now(),
      );
      res.writeHead(204).end();
      return true;
    }
    if (path === '/birthdays/test' && method === 'POST') {
      const body = await readJson<{ channel?: unknown; kind?: unknown }>(req);
      const channel = typeof body?.channel === 'string' ? body.channel : '';
      if (!snowflake.test(channel))
        throw new BadRequest('Pick a channel to send the test message to.');
      const kind = body?.kind as BdKind;
      if (!bdKinds.includes(kind))
        throw new BadRequest('Pick which birthday message to test.');
      enqueueJob(
        db,
        {
          guildId,
          moduleId: BD_MODULE,
          kind: 'birthdays-test',
          payload: {
            channel,
            kind,
            userId: user.id,
            userName: user.name,
            avatar: user.avatarUrl,
          },
        },
        now(),
      );
      res.writeHead(204).end();
      return true;
    }
    return false;
  };
}
