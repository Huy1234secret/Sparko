import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  cleanQuestions,
  enqueueJob,
  getGuild,
  getQuestion,
  getTemplate,
  listLibrary,
  listQaLog,
  listQuestions,
  normaliseStudio,
  QA_MODULE,
  qaConfigOf,
  qaForget,
  qaIssue,
  qaLimits,
  qaMessageIssue,
  qaStorage,
  suggestionCommandNames,
  writeModule,
  type Db,
  type GuildView,
  type Questions,
  type StoredUser,
  type StudioMessage,
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

/** /api/v1/servers/:id/questions… */
export function qaRoutes({
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
    if (path === '/questions' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = qaConfigOf(db, guildId);
      json(res, 200, {
        on,
        config,
        limits: qaLimits(plan),
        storage: qaStorage(db, guildId),
        channels: (v?.channels ?? []).map(
          ({ id, name, category, canPost, canThread }) => ({
            id,
            name,
            category,
            canPost,
            canThread,
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
        log: listQaLog(db, guildId),
      });
      return true;
    }
    if (path === '/questions' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Questions & answers is on or off.');
      const v = await view(guildId);
      const templates = new Set(
        listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
      );
      const issue = qaIssue(body.config, {
        plan,
        templates,
        taken: suggestionCommandNames(db, guildId),
        ...(v
          ? { roles: new Map(v.roles.map((r) => [r.id, r.assignable])) }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanQuestions(body.config as Questions);
      for (const [id, kind] of [
        [config.message, 'question'],
        [config.answerMessage, 'answer'],
      ] as const) {
        if (!id) continue;
        const t = getTemplate<StudioMessage>(db, guildId, 'studio', id);
        const problem = t && qaMessageIssue(normaliseStudio(t.message), kind);
        if (problem) throw new BadRequest(problem.problem);
      }
      const at = now();
      writeModule(db, guildId, QA_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: QA_MODULE,
          title: body.on
            ? 'Updated Questions & answers'
            : 'Turned Questions & answers off',
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
            ? 'updated Questions & answers'
            : 'turned off Questions & answers',
          icon: 'circle-help',
        },
        at,
      );
      // The bot checks the channel and registers the server's commands.
      enqueueJob(db, { guildId, moduleId: QA_MODULE, kind: 'questions' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/questions/list' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').slice(0, 100);
      const status = (url.searchParams.get('status') ?? '').slice(0, 40);
      json(res, 200, {
        questions: listQuestions(db, guildId, { query: q, status }),
        storage: qaStorage(db, guildId),
      });
      return true;
    }
    if (path === '/questions/test' && method === 'POST') {
      const body = await readJson<{ channel?: unknown; which?: unknown }>(req);
      const channel = typeof body?.channel === 'string' ? body.channel : '';
      if (!snowflake.test(channel))
        throw new BadRequest('Pick a channel to send the test message to.');
      const which = body?.which === 'answer' ? 'answer' : 'question';
      enqueueJob(
        db,
        {
          guildId,
          moduleId: QA_MODULE,
          kind: 'questions-test',
          payload: {
            channel,
            which,
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
    const one = path.match(/^\/questions\/(\d{1,9})$/);
    if (one && method === 'DELETE') {
      const number = Number(one[1]);
      const title = getQuestion(db, guildId, number)?.title;
      const left = qaForget(db, guildId, number, user, now());
      if (!left) return (json(res, 404, { error: 'not_found' }), true);
      // The bot takes its message and thread down.
      enqueueJob(
        db,
        {
          guildId,
          moduleId: QA_MODULE,
          kind: 'questions-delete',
          payload: left,
        },
        now(),
      );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'deleted a question',
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
