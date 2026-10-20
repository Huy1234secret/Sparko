import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  cleanPolls,
  enqueueJob,
  getGuild,
  getPoll,
  listLibrary,
  listPollLog,
  listPolls,
  POLL_MODULE,
  pollClose,
  pollConfigOf,
  pollCreate,
  pollForget,
  pollLimits,
  pollPostSoon,
  pollReroll,
  pollsIssue,
  pollsOpen,
  pollVoters,
  sgCommandKeys,
  sgConfigOf,
  writeModule,
  type Db,
  type GuildView,
  type Polls,
  type StoredUser,
} from '@sparko/core';
import { BadRequest, json, readJson } from './http.ts';

type Call = {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  guildId: string;
  user: StoredUser;
};
const hex = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : null);
const snowflake = /^\d{1,25}$/;

/** /api/v1/servers/:id/polls… */
export function pollRoutes({
  db,
  view,
  now,
}: {
  db: Db;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
}) {
  /** Changes in Discord are made by the bot, from these jobs. */
  const job = (guildId: string, kind: string, payload?: unknown) =>
    enqueueJob(db, { guildId, moduleId: POLL_MODULE, kind, payload }, now());

  return async function handle({
    req,
    res,
    method,
    path,
    guildId,
    user,
  }: Call) {
    const plan = getGuild(db, guildId)?.plan;
    if (path === '/polls' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = pollConfigOf(db, guildId);
      json(res, 200, {
        on,
        config,
        limits: pollLimits(plan),
        open: pollsOpen(db, guildId),
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
        log: listPollLog(db, guildId),
      });
      return true;
    }
    if (path === '/polls' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Polls is on or off.');
      const v = await view(guildId);
      const issue = pollsIssue(body.config, {
        templates: new Set(
          listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
        ),
        ...(v ? { roles: new Set(v.roles.map((r) => r.id)) } : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanPolls(body.config as Polls);
      // Discord refuses two of a server's commands with the same name.
      const sg = sgConfigOf(db, guildId);
      const taken =
        sg.on &&
        sgCommandKeys.some(
          (k) =>
            sg.config.commands[k].on &&
            sg.config.commands[k].name === config.commands.name,
        );
      if (taken)
        throw new BadRequest(
          `Suggestions already has a /${config.commands.name} command. Pick another name for the poll command.`,
        );
      const at = now();
      writeModule(db, guildId, POLL_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: POLL_MODULE,
          title: body.on ? 'Updated Polls' : 'Turned Polls off',
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
          what: body.on ? 'updated Polls' : 'turned off Polls',
          icon: 'list-checks',
        },
        at,
      );
      // The bot checks the channel and registers the server's commands.
      job(guildId, 'polls');
      res.writeHead(204).end();
      return true;
    }
    if (path === '/polls/list' && method === 'GET') {
      json(res, 200, {
        polls: listPolls(db, guildId),
        open: pollsOpen(db, guildId),
      });
      return true;
    }
    if (path === '/polls' && method === 'POST') {
      const body = await readJson<{ draft?: unknown }>(req);
      const v = await view(guildId);
      const made = pollCreate(
        db,
        {
          guildId,
          draft: body?.draft,
          author: { id: user.id, name: user.name, avatar: user.avatarUrl },
          ...(v
            ? {
                roles: new Set(v.roles.map((r) => r.id)),
                channels: new Set(
                  v.channels.filter((c) => c.canPost).map((c) => c.id),
                ),
              }
            : {}),
        },
        now(),
      );
      if (!made.ok) throw new BadRequest(made.problem);
      // Polls for now are posted by the bot straight away; later ones by
      // its minute sweep.
      if (made.poll.postAt <= now())
        job(guildId, 'polls-post', { id: made.poll.id });
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: made.poll.postAt > now() ? 'scheduled a poll' : 'made a poll',
          detail: `#${made.poll.id} ${made.poll.question}`,
          icon: 'list-checks',
        },
        now(),
      );
      json(res, 201, { poll: made.poll });
      return true;
    }
    if (path === '/polls/test' && method === 'POST') {
      const body = await readJson<{ channel?: unknown; kind?: unknown }>(req);
      const channel = typeof body?.channel === 'string' ? body.channel : '';
      if (!snowflake.test(channel))
        throw new BadRequest('Pick a channel to send the test message to.');
      job(guildId, 'polls-test', {
        channel,
        kind: body?.kind === 'results' ? 'results' : 'poll',
        userId: user.id,
        userName: user.name,
        avatar: user.avatarUrl,
      });
      res.writeHead(204).end();
      return true;
    }
    const one = path.match(
      /^\/polls\/(\d{1,9})(?:\/(end|reroll|post|voters))?$/,
    );
    if (!one) return false;
    const id = Number(one[1]);
    const action = one[2] ?? '';
    const p = getPoll(db, guildId, id);
    if (!p) return (json(res, 404, { error: 'not_found' }), true);
    if (action === 'voters' && method === 'GET') {
      // Anonymous polls never say who voted.
      json(res, 200, {
        anonymous: p.rules.anonymous,
        voters: p.rules.anonymous ? [] : pollVoters(db, guildId, id),
      });
      return true;
    }
    if (action === 'end' && method === 'POST') {
      if (p.status !== 'active')
        throw new BadRequest(
          p.status === 'ended'
            ? 'This poll has already ended.'
            : 'This poll hasn’t been posted yet. Delete it instead.',
        );
      pollClose(db, guildId, id, 'staff', user, now());
      job(guildId, 'polls-refresh', { id });
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'ended a poll',
          detail: `#${id} ${p.question}`,
          icon: 'list-checks',
        },
        now(),
      );
      res.writeHead(204).end();
      return true;
    }
    if (action === 'reroll' && method === 'POST') {
      let picked;
      try {
        picked = pollReroll(db, guildId, id, user, now());
      } catch (e) {
        throw new BadRequest(e instanceof Error ? e.message : 'Try again.');
      }
      job(guildId, 'polls-refresh', { id });
      json(res, 200, { picked });
      return true;
    }
    if (action === 'post' && method === 'POST') {
      if (!pollPostSoon(db, guildId, id, now()))
        throw new BadRequest('This poll has already been posted.');
      job(guildId, 'polls-post', { id });
      res.writeHead(204).end();
      return true;
    }
    if (!action && method === 'DELETE') {
      const left = pollForget(db, guildId, id, user, now());
      // The bot takes its message down.
      if (left) job(guildId, 'polls-delete', left);
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'deleted a poll',
          detail: `#${id} ${p.question}`,
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
