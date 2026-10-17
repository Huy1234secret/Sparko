import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  cleanSuggestions,
  enqueueJob,
  getGuild,
  getSuggestion,
  getTemplate,
  listLibrary,
  listSgLog,
  listSuggestions,
  normaliseStudio,
  SG_MODULE,
  sgConfigOf,
  sgForget,
  sgIssue,
  sgLimits,
  sgMessageIssue,
  sgStorage,
  writeModule,
  type Db,
  type GuildView,
  type StoredUser,
  type StudioMessage,
  type Suggestions,
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

/** /api/v1/servers/:id/suggestions… */
export function sgRoutes({
  db,
  view,
  now,
}: {
  db: Db;
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
    const plan = getGuild(db, guildId)?.plan;
    if (path === '/suggestions' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = sgConfigOf(db, guildId);
      json(res, 200, {
        on,
        config,
        limits: sgLimits(plan),
        storage: sgStorage(db, guildId),
        channels: (v?.channels ?? []).map(
          ({ id, name, category, canPost }) => ({
            id,
            name,
            category,
            canPost,
          }),
        ),
        roles: (v?.roles ?? []).map(
          ({ id, name, color, color2, assignable }) => ({
            id,
            name,
            color: hex(color),
            color2: color && color2 ? hex(color2) : null,
            assignable,
          }),
        ),
        log: listSgLog(db, guildId),
      });
      return true;
    }
    if (path === '/suggestions' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Suggestions is on or off.');
      const v = await view(guildId);
      const templates = new Set(
        listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
      );
      const issue = sgIssue(body.config, {
        plan,
        templates,
        ...(v
          ? { roles: new Map(v.roles.map((r) => [r.id, r.assignable])) }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanSuggestions(body.config as Suggestions);
      if (config.message) {
        const t = getTemplate<StudioMessage>(
          db,
          guildId,
          'studio',
          config.message,
        );
        const problem = t && sgMessageIssue(normaliseStudio(t.message));
        if (problem) throw new BadRequest(problem.problem);
      }
      const at = now();
      writeModule(db, guildId, SG_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: SG_MODULE,
          title: body.on ? 'Updated Suggestions' : 'Turned Suggestions off',
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
          what: body.on ? 'updated Suggestions' : 'turned off Suggestions',
          icon: 'message-square',
        },
        at,
      );
      // The bot checks the channels and registers the server's commands.
      enqueueJob(db, { guildId, moduleId: SG_MODULE, kind: 'suggestions' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/suggestions/list' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').slice(0, 100);
      const status = (url.searchParams.get('status') ?? '').slice(0, 40);
      json(res, 200, {
        suggestions: listSuggestions(db, guildId, { query: q, status }),
        storage: sgStorage(db, guildId),
      });
      return true;
    }
    if (path === '/suggestions/test' && method === 'POST') {
      const body = await readJson<{ channel?: unknown }>(req);
      const channel = typeof body?.channel === 'string' ? body.channel : '';
      if (!snowflake.test(channel))
        throw new BadRequest('Pick a channel to send the test message to.');
      enqueueJob(
        db,
        {
          guildId,
          moduleId: SG_MODULE,
          kind: 'suggestions-test',
          payload: {
            channel,
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
    const one = path.match(/^\/suggestions\/(\d{1,9})$/);
    if (one && method === 'DELETE') {
      const number = Number(one[1]);
      const title = getSuggestion(db, guildId, number)?.title;
      const left = sgForget(db, guildId, number, user, now());
      if (!left) return (json(res, 404, { error: 'not_found' }), true);
      // The bot takes its messages down.
      enqueueJob(
        db,
        {
          guildId,
          moduleId: SG_MODULE,
          kind: 'suggestions-delete',
          payload: left,
        },
        now(),
      );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'deleted a suggestion',
          detail: `#${number} ${title ?? ''}`.trim(),
          icon: 'trash-2',
        },
        now(),
      );
      res.writeHead(204).end();
      return true;
    }
    return false;
  };
}
