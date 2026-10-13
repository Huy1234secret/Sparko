import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addTemplate,
  addVersion,
  ago,
  deleteTemplate,
  enqueueJob,
  getGuild,
  getModule,
  listTemplates,
  listVersions,
  normaliseStudio,
  studioDefault,
  studioProblem,
  writeModule,
  type Db,
  type GuildView,
  type StoredUser,
  type StudioMessage,
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
const colourOf = (id: string | null) =>
  (((id ? Number(id.slice(-4)) : 0) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;

/** /api/v1/servers/:id/studio… */
export function studioRoutes({
  db,
  view,
  now,
}: {
  db: Db;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
}) {
  const limitOf = (guildId: string) =>
    getGuild(db, guildId)?.plan === 'plus' ? 100 : 10;

  return async function handle({
    req,
    res,
    method,
    path,
    guildId,
    user,
  }: Call) {
    if (path === '/studio' && method === 'GET') {
      const v = await view(guildId);
      const channels = (v?.channels ?? []).map(
        ({ id, name, category, canPost }) => ({
          id,
          name,
          category,
          canPost,
        }),
      );
      const saved = getModule<StudioMessage>(db, guildId, 'studio').config;
      json(res, 200, {
        message: normaliseStudio(
          saved ??
            studioDefault(
              channels.find((c) => c.canPost)?.id ?? channels[0]?.id ?? '',
            ),
        ),
        channels,
        templates: listTemplates<StudioMessage>(db, guildId, 'studio').map(
          (t) => ({
            id: t.id,
            name: t.name,
            meta: `Saved ${ago(t.at, now()).toLowerCase()}${/^\d/.test(ago(t.at, now())) ? ' ago' : ''} by ${t.who === user.name ? 'you' : t.who}`,
            message: normaliseStudio(t.message),
          }),
        ),
        templateLimit: limitOf(guildId),
        versions: listVersions<StudioMessage>(db, guildId, 'studio').map(
          (x) => ({
            id: x.id,
            title: x.title,
            who: x.who,
            whoColor: colourOf(x.whoId),
            when: ago(x.at, now()),
            config: normaliseStudio(x.config),
          }),
        ),
      });
      return true;
    }
    if (path === '/studio' && method === 'PUT') {
      const message = await readJson<unknown>(req);
      const problem = studioProblem(message);
      if (problem) throw new BadRequest(problem);
      const m = normaliseStudio(message as StudioMessage);
      const at = now();
      writeModule(db, guildId, 'studio', { on: true, config: m }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: 'studio',
          title: 'Published changes',
          who: user,
          config: m,
        },
        at,
      );
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'published a message',
          detail: m.name,
          icon: 'message-square-text',
        },
        at,
      );
      enqueueJob(db, { guildId, moduleId: 'studio', kind: 'studio' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/studio/templates' && method === 'POST') {
      const body = await readJson<{ name?: unknown; message?: unknown }>(req);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 80)
        throw new BadRequest(
          'Give the template a name of up to 80 characters.',
        );
      if (
        studioProblem({ ...(body?.message as object), name }) ===
        'The message is missing.'
      )
        throw new BadRequest('The message is missing.');
      if (listTemplates(db, guildId, 'studio').length >= limitOf(guildId))
        throw new BadRequest('You’ve used every template on this plan.');
      addTemplate(
        db,
        {
          guildId,
          moduleId: 'studio',
          name,
          who: user.name,
          message: normaliseStudio(body!.message as StudioMessage),
        },
        now(),
      );
      res.writeHead(204).end();
      return true;
    }
    const del = path.match(/^\/studio\/templates\/(\d{1,12})$/);
    if (del && method === 'DELETE') {
      deleteTemplate(db, guildId, del[1]!);
      res.writeHead(204).end();
      return true;
    }
    return false;
  };
}
