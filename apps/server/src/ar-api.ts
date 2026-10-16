import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  AR_MODULE,
  arConfigOf,
  arEditMember,
  arIssue,
  arLimits,
  arWipeMember,
  cleanAR,
  enqueueJob,
  getARMember,
  getGuild,
  listARLog,
  searchARMembers,
  servedOf,
  writeModule,
  type ARMember,
  type AutoRoles,
  type Db,
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

/** /api/v1/servers/:id/autoroles… */
export function arRoutes({
  db,
  view,
  now,
}: {
  db: Db;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
}) {
  const shown = (m: ARMember) => ({
    userId: m.userId,
    name: m.name,
    inServer: m.joinedAt !== null,
    servedMs: servedOf(m, now()),
    boosts: m.boosts,
    boostingSince: m.boostingSince,
    given: m.given,
    updatedAt: m.updatedAt,
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
    const plan = getGuild(db, guildId)?.plan;
    if (path === '/autoroles' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = arConfigOf(db, guildId);
      json(res, 200, {
        on,
        config,
        limits: arLimits(plan),
        roles: (v?.roles ?? []).map(
          ({ id, name, color, color2, assignable }) => ({
            id,
            name,
            color: hex(color),
            color2: color && color2 ? hex(color2) : null,
            assignable,
          }),
        ),
        log: listARLog(db, guildId),
      });
      return true;
    }
    if (path === '/autoroles' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Automatic roles is on or off.');
      const v = await view(guildId);
      const issue = arIssue(body.config, {
        plan,
        ...(v
          ? { roles: new Map(v.roles.map((r) => [r.id, r.assignable])) }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanAR(body.config as AutoRoles);
      const at = now();
      writeModule(db, guildId, AR_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: AR_MODULE,
          title: body.on
            ? 'Updated the automatic roles'
            : 'Turned Automatic roles off',
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
          what: body.on
            ? 'updated Automatic roles'
            : 'turned off Automatic roles',
          icon: 'users',
        },
        at,
      );
      enqueueJob(db, { guildId, moduleId: AR_MODULE, kind: 'autoroles' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/autoroles/members' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').slice(0, 100);
      json(res, 200, {
        members: searchARMembers(db, guildId, q).map(shown),
      });
      return true;
    }
    const one = path.match(/^\/autoroles\/members\/(\d{1,25})$/);
    if (one && method === 'PATCH') {
      const userId = one[1]!;
      const body = await readJson<{ servedMs?: unknown; boosts?: unknown }>(
        req,
      );
      const edit: { servedMs?: number; boosts?: number } = {};
      if (body?.servedMs !== undefined) {
        const ms = Number(body.servedMs);
        if (!Number.isFinite(ms) || ms < 0 || ms > 20 * 365 * 86_400_000)
          throw new BadRequest('Write a time in the server, like 7d or 12h.');
        edit.servedMs = Math.round(ms);
      }
      if (body?.boosts !== undefined) {
        const n = Number(body.boosts);
        if (!Number.isInteger(n) || n < 0 || n > 1000)
          throw new BadRequest('Boosts have to be a whole number from 0.');
        edit.boosts = n;
      }
      if (!getARMember(db, guildId, userId))
        return (json(res, 404, { error: 'not_found' }), true);
      const m = arEditMember(db, guildId, userId, edit, now())!;
      // The bot checks their roles again straight away.
      enqueueJob(
        db,
        {
          guildId,
          moduleId: AR_MODULE,
          kind: 'autoroles-check',
          payload: { userId },
        },
        now(),
      );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'edited a member’s automatic role data',
          detail: m.name,
          icon: 'users',
        },
        now(),
      );
      json(res, 200, { member: shown(m) });
      return true;
    }
    if (one && method === 'DELETE') {
      const userId = one[1]!;
      const old = getARMember(db, guildId, userId);
      if (!old) return (json(res, 404, { error: 'not_found' }), true);
      const m = arWipeMember(db, guildId, userId, now());
      if (m)
        enqueueJob(
          db,
          {
            guildId,
            moduleId: AR_MODULE,
            kind: 'autoroles-check',
            payload: { userId },
          },
          now(),
        );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'wiped a member’s automatic role data',
          detail: old.name,
          icon: 'users',
        },
        now(),
      );
      json(res, 200, { member: m ? shown(m) : null });
      return true;
    }
    return false;
  };
}
