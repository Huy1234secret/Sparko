import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addTemplate,
  cleanRR,
  cloneTemplate,
  countLibrary,
  deleteTemplate,
  enqueueJob,
  getGuild,
  getTemplate,
  listLibrary,
  listRRLog,
  rrDefault,
  rrIssue,
  rrTemplateLimit,
  RR_MODULE,
  savedLine,
  studioDefault,
  uniqueName,
  updateTemplate,
  type Db,
  type GuildView,
  type ReactionRole,
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

/** Queues the bot to bring a reaction role's message in line with its settings. */
export function syncRR(db: Db, guildId: string, id: string, at: number) {
  enqueueJob(
    db,
    { guildId, moduleId: RR_MODULE, kind: 'rr-sync', payload: { id } },
    at,
  );
}

/** Reaction roles whose message or responses use this Studio template. */
export function rrUsing(db: Db, guildId: string, studioId: string) {
  return listLibrary<ReactionRole>(db, guildId, RR_MODULE).templates.filter(
    (t) =>
      [t.message.message, t.message.response?.claim, t.message.response?.remove]
        .filter(Boolean)
        .includes(studioId),
  );
}

/** /api/v1/servers/:id/reaction-roles… */
export function rrRoutes({
  db,
  view,
  now,
}: {
  db: Db;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
}) {
  const nameOf = (value: unknown) => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name.length > 80)
      throw new BadRequest('Give it a name of up to 80 characters.');
    return name;
  };
  const audit = (
    guildId: string,
    user: StoredUser,
    what: string,
    detail = '',
  ) =>
    addAudit(
      db,
      { guildId, who: user.name, what, detail, icon: 'smile' },
      now(),
    );

  return async function handle({
    req,
    res,
    method,
    path,
    guildId,
    user,
  }: Call) {
    if (path === '/reaction-roles' && method === 'GET') {
      const v = await view(guildId);
      const { templates } = listLibrary<ReactionRole>(db, guildId, RR_MODULE);
      json(res, 200, {
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          meta: savedLine(t.at, now(), t.who === user.name ? 'you' : t.who),
          config: t.message,
        })),
        limit: rrTemplateLimit(getGuild(db, guildId)?.plan),
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
        log: listRRLog(db, guildId),
      });
      return true;
    }
    if (path === '/reaction-roles' && method === 'POST') {
      const body = await readJson<{ name?: unknown }>(req);
      const name = nameOf(body?.name);
      if (
        countLibrary(db, guildId, RR_MODULE).templates >=
        rrTemplateLimit(getGuild(db, guildId)?.plan)
      )
        throw new BadRequest('You’ve used every reaction role on this plan.');
      const v = await view(guildId);
      const channel =
        v?.channels.find((c) => c.canPost)?.id ?? v?.channels[0]?.id ?? '';
      // Its message is a Message Studio template of the same name.
      const at = now();
      const message = addTemplate(
        db,
        {
          guildId,
          moduleId: 'studio',
          name: uniqueName(db, guildId, 'studio', name),
          who: user.name,
          message: {
            ...studioDefault(channel),
            name,
            embeds: [
              {
                ...studioDefault(channel).embeds[0]!,
                title: 'Pick your roles',
                description:
                  'React below to get a role. React again to drop it.',
              },
            ],
          },
        },
        at,
      );
      const id = addTemplate(
        db,
        {
          guildId,
          moduleId: RR_MODULE,
          name,
          who: user.name,
          message: rrDefault(channel, message),
        },
        at,
      );
      audit(guildId, user, 'added a reaction role', name);
      json(res, 200, { id });
      return true;
    }
    const clone = path.match(/^\/reaction-roles\/(\d{1,12})\/clone$/);
    if (clone && method === 'POST') {
      if (
        countLibrary(db, guildId, RR_MODULE).templates >=
        rrTemplateLimit(getGuild(db, guildId)?.plan)
      )
        throw new BadRequest('You’ve used every reaction role on this plan.');
      const id = cloneTemplate(
        db,
        guildId,
        RR_MODULE,
        clone[1]!,
        user.name,
        now(),
      );
      json(res, 200, { id });
      return true;
    }
    const one = path.match(/^\/reaction-roles\/(\d{1,12})$/);
    if (one && method === 'PATCH') {
      const id = one[1]!;
      const body = await readJson<{ name?: unknown; config?: unknown }>(req);
      const name = body?.name === undefined ? undefined : nameOf(body.name);
      let config: ReactionRole | undefined;
      if (body?.config !== undefined) {
        const v = await view(guildId);
        const issue = rrIssue(body.config, {
          templates: new Set(
            listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
          ),
          ...(v
            ? { roles: new Map(v.roles.map((r) => [r.id, r.assignable])) }
            : {}),
        });
        if (issue) throw new BadRequest(issue.problem);
        config = cleanRR(body.config as ReactionRole);
      }
      updateTemplate(
        db,
        guildId,
        RR_MODULE,
        id,
        {
          ...(name === undefined ? {} : { name }),
          ...(config === undefined ? {} : { message: config }),
          who: user.name,
        },
        now(),
      );
      if (config) syncRR(db, guildId, id, now());
      audit(
        guildId,
        user,
        'saved a reaction role',
        getTemplate(db, guildId, RR_MODULE, id)?.name ?? '',
      );
      res.writeHead(204).end();
      return true;
    }
    if (one && method === 'DELETE') {
      const id = one[1]!;
      const name = getTemplate(db, guildId, RR_MODULE, id)?.name ?? '';
      deleteTemplate(db, guildId, RR_MODULE, id);
      // The bot takes its message out of Discord.
      syncRR(db, guildId, id, now());
      audit(guildId, user, 'deleted a reaction role', name);
      res.writeHead(204).end();
      return true;
    }
    return false;
  };
}
