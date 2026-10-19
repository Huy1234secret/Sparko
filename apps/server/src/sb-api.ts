import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  cleanStarboard,
  enqueueJob,
  getGuild,
  getSbEntry,
  getTemplate,
  listLibrary,
  listSbEntries,
  listSbLog,
  normaliseStudio,
  SB_MODULE,
  sbBlockedList,
  sbBlockMember,
  sbBlockMessage,
  sbConfigOf,
  sbFreeze,
  sbIssue,
  sbLimits,
  sbMessageIssue,
  sbPruneBoards,
  sbRemove,
  sbStorage,
  sbUnblock,
  writeModule,
  type Db,
  type GuildView,
  type SbLeftovers,
  type Starboard,
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
const boardId = /^[\w-]{1,40}$/;

/** /api/v1/servers/:id/starboard… */
export function sbRoutes({
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
    const staff = { id: user.id, name: user.name };
    // The bot takes posts down; nothing to do when there were none.
    const takeDown = (left: SbLeftovers | null) => {
      if (left?.posts.length)
        enqueueJob(
          db,
          {
            guildId,
            moduleId: SB_MODULE,
            kind: 'starboard-delete',
            payload: left,
          },
          now(),
        );
    };

    if (path === '/starboard' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = sbConfigOf(db, guildId);
      json(res, 200, {
        on,
        config,
        limits: sbLimits(plan),
        storage: sbStorage(db, guildId),
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
        log: listSbLog(db, guildId),
        blocked: sbBlockedList(db, guildId),
      });
      return true;
    }
    if (path === '/starboard' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether the starboard is on or off.');
      const v = await view(guildId);
      const templates = new Set(
        listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
      );
      const issue = sbIssue(body.config, {
        plan,
        templates,
        ...(v
          ? { roles: new Map(v.roles.map((r) => [r.id, r.assignable])) }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanStarboard(body.config as Starboard);
      for (const b of config.boards) {
        if (!b.message) continue;
        const t = getTemplate<StudioMessage>(db, guildId, 'studio', b.message);
        const problem = t && sbMessageIssue(normaliseStudio(t.message));
        if (problem) throw new BadRequest(`${b.name}: ${problem.problem}`);
      }
      const at = now();
      writeModule(db, guildId, SB_MODULE, { on: body.on, config }, at);
      // A board that was removed takes its starred messages with it.
      sbPruneBoards(
        db,
        guildId,
        config.boards.map((b) => b.id),
      );
      addVersion(
        db,
        {
          guildId,
          moduleId: SB_MODULE,
          title: body.on ? 'Updated Starboard' : 'Turned Starboard off',
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
          what: body.on ? 'updated Starboard' : 'turned off Starboard',
          icon: 'star',
        },
        at,
      );
      // The bot checks the channels and registers the server's commands.
      enqueueJob(db, { guildId, moduleId: SB_MODULE, kind: 'starboard' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/starboard/list' && method === 'GET') {
      const board = (url.searchParams.get('board') ?? '').slice(0, 40);
      const sort =
        url.searchParams.get('sort') === 'newest' ? 'newest' : 'stars';
      const q = (url.searchParams.get('q') ?? '').slice(0, 100);
      json(res, 200, {
        entries: listSbEntries(db, guildId, { board, sort, query: q }),
        storage: sbStorage(db, guildId),
        blocked: sbBlockedList(db, guildId),
      });
      return true;
    }
    if (path === '/starboard/test' && method === 'POST') {
      const body = await readJson<{ board?: unknown; channel?: unknown }>(req);
      const channel = typeof body?.channel === 'string' ? body.channel : '';
      const board = typeof body?.board === 'string' ? body.board : '';
      if (!snowflake.test(channel))
        throw new BadRequest('Pick a channel to send the test message to.');
      if (!boardId.test(board)) throw new BadRequest('Pick a board.');
      enqueueJob(
        db,
        {
          guildId,
          moduleId: SB_MODULE,
          kind: 'starboard-test',
          payload: {
            board,
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

    const entry = path.match(
      /^\/starboard\/entries\/([\w-]{1,40})\/(\d{1,25})(\/freeze)?$/,
    );
    if (entry) {
      const [, board, message, freeze] = entry as unknown as [
        string,
        string,
        string,
        string | undefined,
      ];
      const found = getSbEntry(db, guildId, board, message);
      if (!found) return (json(res, 404, { error: 'not_found' }), true);
      if (freeze && method === 'POST') {
        const body = await readJson<{ frozen?: unknown }>(req);
        if (typeof body?.frozen !== 'boolean')
          throw new BadRequest('Say whether to freeze it or not.');
        const next = sbFreeze(
          db,
          guildId,
          board,
          message,
          body.frozen,
          staff,
          now(),
        );
        // Unfrozen, the post catches up with the stars it got meanwhile.
        if (!body.frozen)
          enqueueJob(
            db,
            {
              guildId,
              moduleId: SB_MODULE,
              kind: 'starboard-sync',
              payload: { board, message },
            },
            now(),
          );
        json(res, 200, { entry: next });
        return true;
      }
      if (!freeze && method === 'DELETE') {
        takeDown(sbRemove(db, guildId, board, message, staff, now()));
        addAudit(
          db,
          {
            guildId,
            who: user.name,
            what: 'took a message off the starboard',
            detail: found.authorName,
            icon: 'trash-2',
          },
          now(),
        );
        res.writeHead(204).end();
        return true;
      }
      return false;
    }

    if (path === '/starboard/blocked' && method === 'POST') {
      const body = await readJson<{
        kind?: unknown;
        id?: unknown;
        channelId?: unknown;
        name?: unknown;
      }>(req);
      const id = typeof body?.id === 'string' ? body.id : '';
      if (!snowflake.test(id)) throw new BadRequest('Say what to block.');
      if (body?.kind === 'message') {
        const channelId =
          typeof body.channelId === 'string' && snowflake.test(body.channelId)
            ? body.channelId
            : '';
        takeDown(
          sbBlockMessage(
            db,
            guildId,
            { messageId: id, channelId },
            staff,
            now(),
          ),
        );
      } else if (body?.kind === 'member') {
        const name =
          typeof body.name === 'string' && body.name.trim()
            ? body.name.trim().slice(0, 100)
            : id;
        sbBlockMember(db, guildId, { id, name }, staff, now());
      } else throw new BadRequest('Block a message or a member.');
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: `blocked a ${body.kind} from the starboard`,
          icon: 'ban',
        },
        now(),
      );
      json(res, 200, { blocked: sbBlockedList(db, guildId) });
      return true;
    }
    const unblock = path.match(
      /^\/starboard\/blocked\/(message|member)\/(\d{1,25})$/,
    );
    if (unblock && method === 'DELETE') {
      const kind = unblock[1] as 'message' | 'member';
      if (!sbUnblock(db, guildId, kind, unblock[2]!, staff, now()))
        return (json(res, 404, { error: 'not_found' }), true);
      json(res, 200, { blocked: sbBlockedList(db, guildId) });
      return true;
    }
    return false;
  };
}
