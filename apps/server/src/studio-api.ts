import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addFolder,
  addTemplate,
  addVersion,
  ago,
  cloneTemplate,
  countLibrary,
  deleteFolder,
  deleteTemplate,
  enqueueJob,
  getGuild,
  getModule,
  libraryLimits,
  listLibrary,
  listVersions,
  moveLibraryItem,
  renameFolder,
  planProblem,
  savedLine,
  sendLimit,
  setPosted,
  updateTemplate,
  normaliseStudio,
  parseMessageLink,
  studioDefault,
  studioProblem,
  writeModule,
  type Db,
  type GuildView,
  type Rest,
  type StoredUser,
  type StudioMessage,
  greetKinds,
  greetNames,
  greetTemplates,
  isLegacyWelcome,
  QA_MODULE,
  RR_MODULE,
  SB_MODULE,
  SG_MODULE,
  BD_MODULE,
  bdKinds,
  bdKindNames,
  type Birthdays,
  type Questions,
  type ReactionRole,
  type Starboard,
  type Suggestions,
  type WelcomeConfig,
} from '@sparko/core';
import { rrUsing, syncRR } from './rr-api.ts';
import { BadRequest, json, readJson } from './http.ts';
import type { Media } from './media.ts';

type Call = {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  guildId: string;
  user: StoredUser;
};
/** A Discord colour number as #rrggbb; 0 means the role has no colour. */
const hex = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : null);
const colourOf = (id: string | null) =>
  (((id ? Number(id.slice(-4)) : 0) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;

/** /api/v1/servers/:id/studio… */
export function studioRoutes({
  db,
  view,
  now,
  rest,
  media,
}: {
  db: Db;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
  /** Discord with the bot token, for the server's own emojis. */
  rest?: Rest | undefined;
  /** Where uploaded pictures go; uploads are off without it. */
  media?: Media | undefined;
}) {
  const limitsOf = (guildId: string) =>
    libraryLimits(getGuild(db, guildId)?.plan);
  const nameOf = (value: unknown, what: string) => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name.length > 80)
      throw new BadRequest(`Give the ${what} a name of up to 80 characters.`);
    return name;
  };
  const folderOf = (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && /^\d{1,12}$/.test(value)) return value;
    throw new BadRequest('That folder isn’t valid.');
  };
  const messageOf = (value: unknown, guildId: string) => {
    if (
      !value ||
      typeof value !== 'object' ||
      studioProblem({ ...value, name: 'x' }) === 'The message is missing.'
    )
      throw new BadRequest('The message is missing.');
    const m = normaliseStudio(value as StudioMessage);
    const tooMany = planProblem(m, getGuild(db, guildId)?.plan);
    if (tooMany) throw new BadRequest(tooMany);
    return m;
  };

  /** Where each template is used outside Message Studio, for its tags. */
  const templateUses = (guildId: string) => {
    const uses = new Map<
      string,
      {
        kind:
          | 'welcome'
          | 'reaction-role'
          | 'suggestion'
          | 'birthday'
          | 'question'
          | 'starboard';
        where: string;
      }[]
    >();
    const add = (
      id: string,
      kind:
        | 'welcome'
        | 'reaction-role'
        | 'suggestion'
        | 'birthday'
        | 'question'
        | 'starboard',
      where: string,
    ) => {
      if (!id) return;
      const list = uses.get(id) ?? [];
      if (!list.some((u) => u.where === where)) list.push({ kind, where });
      uses.set(id, list);
    };
    const welcome = getModule<WelcomeConfig>(db, guildId, 'welcome').config;
    if (welcome && !isLegacyWelcome(welcome))
      for (const k of greetKinds) {
        const t = greetTemplates(welcome[k]);
        const where = `Welcome messages (${greetNames[k]})`;
        add(
          t.channel ||
            (welcome[k].template && welcome[k].channel
              ? welcome[k].template
              : ''),
          'welcome',
          where,
        );
        add(t.dm, 'welcome', where);
      }
    for (const r of listLibrary<ReactionRole>(db, guildId, RR_MODULE)
      .templates) {
      const where = `Reaction roles (${r.name})`;
      add(r.message.message, 'reaction-role', where);
      add(r.message.response?.claim ?? '', 'reaction-role', where);
      add(r.message.response?.remove ?? '', 'reaction-role', where);
    }
    const sg = getModule<Suggestions>(db, guildId, SG_MODULE).config;
    if (sg) {
      add(sg.message, 'suggestion', 'Suggestions (the suggestion message)');
      for (const st of sg.statuses ?? [])
        for (const a of st.actions)
          if (a.type === 'dm')
            add(a.template, 'suggestion', `Suggestions (${st.name} DM)`);
    }
    const bd = getModule<Birthdays>(db, guildId, BD_MODULE).config;
    if (bd)
      for (const k of bdKinds)
        add(
          bd.messages?.[k] ?? '',
          'birthday',
          `Birthdays (${bdKindNames[k]})`,
        );
    const qa = getModule<Questions>(db, guildId, QA_MODULE).config;
    if (qa) {
      add(qa.message, 'question', 'Questions & answers (the question message)');
      add(
        qa.answerMessage,
        'question',
        'Questions & answers (the answer message)',
      );
      add(qa.dmMessage, 'question', 'Questions & answers (the answered DM)');
    }
    const sb = getModule<Starboard>(db, guildId, SB_MODULE).config;
    for (const b of sb?.boards ?? [])
      add(b.message, 'starboard', `Starboard (${b.name} posts)`);
    return uses;
  };

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
        // Roles "Give or take role" can pick; Discord manages bot roles itself.
        roles: (v?.roles ?? [])
          .filter((r) => !r.managed)
          .map(({ id, name, color, color2, assignable }) => ({
            id,
            name,
            color: hex(color),
            color2: color && color2 ? hex(color2) : null,
            assignable,
          })),
        sendLimit: sendLimit(getGuild(db, guildId)?.plan),
        ...(() => {
          const { templates, folders } = listLibrary<StudioMessage>(
            db,
            guildId,
            'studio',
          );
          const limits = limitsOf(guildId);
          const uses = templateUses(guildId);
          return {
            templates: templates.map((t) => ({
              id: t.id,
              name: t.name,
              folderId: t.folderId,
              position: t.position,
              meta: savedLine(t.at, now(), t.who === user.name ? 'you' : t.who),
              message: normaliseStudio(t.message),
              usedIn: uses.get(t.id) ?? [],
            })),
            folders,
            templateLimit: limits.templates,
            folderLimit: limits.folders,
          };
        })(),
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
      enqueueJob(
        db,
        {
          guildId,
          moduleId: 'studio',
          kind: 'studio',
          payload: { userId: user.id, userName: user.name },
        },
        at,
      );
      res.writeHead(204).end();
      return true;
    }
    if (path === '/studio/test' && method === 'POST') {
      // Posts the message as a new one, even if an earlier test is there.
      const message = await readJson<unknown>(req);
      const problem = studioProblem(message);
      if (problem) throw new BadRequest(problem);
      const m = normaliseStudio(message as StudioMessage);
      const tooMany = planProblem(m, getGuild(db, guildId)?.plan);
      if (tooMany) throw new BadRequest(tooMany);
      const at = now();
      writeModule(db, guildId, 'studio', { on: true, config: m }, at);
      setPosted(db, guildId, `studio:${m.layout}`, null);
      addVersion(
        db,
        {
          guildId,
          moduleId: 'studio',
          title: `Posted “${m.name}”`,
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
          what: 'posted a message',
          detail: m.name,
          icon: 'message-square-text',
        },
        at,
      );
      enqueueJob(
        db,
        {
          guildId,
          moduleId: 'studio',
          kind: 'studio',
          payload: { userId: user.id, userName: user.name },
        },
        at,
      );
      res.writeHead(204).end();
      return true;
    }
    if (path === '/studio/edit' && method === 'POST') {
      // Turns a message Sparko already sent into this template.
      const body = await readJson<{ message?: unknown; link?: unknown }>(req);
      const problem = studioProblem(body.message);
      if (problem) throw new BadRequest(problem);
      const target = parseMessageLink(
        typeof body.link === 'string' ? body.link : '',
      );
      if (!target)
        throw new BadRequest(
          'Paste a message link, like https://discord.com/channels/…/…/…',
        );
      if (target.guildId !== guildId)
        throw new BadRequest('That message is in another server.');
      const m = normaliseStudio(body.message as StudioMessage);
      const tooMany = planProblem(m, getGuild(db, guildId)?.plan);
      if (tooMany) throw new BadRequest(tooMany);
      const at = now();
      addVersion(
        db,
        {
          guildId,
          moduleId: 'studio',
          title: `Edited a message with “${m.name}”`,
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
          what: 'edited a message',
          detail: m.name,
          icon: 'message-square-text',
        },
        at,
      );
      enqueueJob(
        db,
        {
          guildId,
          moduleId: 'studio',
          kind: 'studio-edit',
          payload: {
            userId: user.id,
            userName: user.name,
            channelId: target.channelId,
            messageId: target.messageId,
            message: m,
          },
        },
        at,
      );
      res.writeHead(204).end();
      return true;
    }
    if (path === '/studio/uploads' && method === 'POST') {
      if (!media)
        throw new BadRequest('Uploads aren’t set up on this server yet.');
      json(res, 200, await media.save(req, guildId));
      return true;
    }
    if (path === '/studio/emojis' && method === 'GET') {
      const list = rest
        ? await rest
            .get<
              { id: string; name: string; animated?: boolean }[]
            >(`/guilds/${guildId}/emojis`)
            .catch(() => [])
        : [];
      json(
        res,
        200,
        list.map((e) => ({
          id: e.id,
          name: e.name,
          animated: !!e.animated,
          url: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'webp'}?size=48`,
        })),
      );
      return true;
    }
    if (path === '/studio/templates' && method === 'POST') {
      const body = await readJson<{
        name?: unknown;
        message?: unknown;
        folderId?: unknown;
      }>(req);
      const name = nameOf(body?.name, 'template');
      const message = messageOf(body?.message, guildId);
      const folderId = folderOf(body?.folderId);
      if (
        countLibrary(db, guildId, 'studio').templates >=
        limitsOf(guildId).templates
      )
        throw new BadRequest('You’ve used every template on this plan.');
      const id = addTemplate(
        db,
        {
          guildId,
          moduleId: 'studio',
          name,
          who: user.name,
          message,
          folderId,
        },
        now(),
      );
      json(res, 200, { id });
      return true;
    }
    if (path === '/studio/folders' && method === 'POST') {
      const body = await readJson<{ name?: unknown; parentId?: unknown }>(req);
      const name = nameOf(body?.name, 'folder');
      const parentId = folderOf(body?.parentId);
      if (
        countLibrary(db, guildId, 'studio').folders >= limitsOf(guildId).folders
      )
        throw new BadRequest('You’ve used every folder on this plan.');
      addFolder(db, { guildId, moduleId: 'studio', name, parentId }, now());
      res.writeHead(204).end();
      return true;
    }
    if (path === '/studio/library/move' && method === 'POST') {
      const body = await readJson<{
        kind?: unknown;
        id?: unknown;
        folderId?: unknown;
        index?: unknown;
      }>(req);
      if (
        (body?.kind !== 'template' && body?.kind !== 'folder') ||
        typeof body.id !== 'string' ||
        !/^\d{1,12}$/.test(body.id) ||
        typeof body.index !== 'number' ||
        !Number.isInteger(body.index) ||
        body.index < 0
      )
        throw new BadRequest('That move isn’t valid.');
      moveLibraryItem(db, guildId, 'studio', {
        kind: body.kind,
        id: body.id,
        folderId: folderOf(body.folderId),
        index: body.index,
      });
      res.writeHead(204).end();
      return true;
    }
    const clone = path.match(/^\/studio\/templates\/(\d{1,12})\/clone$/);
    if (clone && method === 'POST') {
      if (
        countLibrary(db, guildId, 'studio').templates >=
        limitsOf(guildId).templates
      )
        throw new BadRequest('You’ve used every template on this plan.');
      cloneTemplate(db, guildId, 'studio', clone[1]!, user.name, now());
      res.writeHead(204).end();
      return true;
    }
    const template = path.match(/^\/studio\/templates\/(\d{1,12})$/);
    if (template && method === 'PATCH') {
      const body = await readJson<{ name?: unknown; message?: unknown }>(req);
      updateTemplate(
        db,
        guildId,
        'studio',
        template[1]!,
        {
          ...(body?.name === undefined
            ? {}
            : { name: nameOf(body.name, 'template') }),
          ...(body?.message === undefined
            ? {}
            : { message: messageOf(body.message, guildId) }),
          who: user.name,
        },
        now(),
      );
      // Reaction roles posting this template follow the change.
      if (body?.message !== undefined)
        for (const r of rrUsing(db, guildId, template[1]!))
          syncRR(db, guildId, r.id, now());
      res.writeHead(204).end();
      return true;
    }
    if (template && method === 'DELETE') {
      deleteTemplate(db, guildId, 'studio', template[1]!);
      res.writeHead(204).end();
      return true;
    }
    const folder = path.match(/^\/studio\/folders\/(\d{1,12})$/);
    if (folder && method === 'PATCH') {
      const body = await readJson<{ name?: unknown }>(req);
      renameFolder(
        db,
        guildId,
        'studio',
        folder[1]!,
        nameOf(body?.name, 'folder'),
      );
      res.writeHead(204).end();
      return true;
    }
    if (folder && method === 'DELETE') {
      json(res, 200, deleteFolder(db, guildId, 'studio', folder[1]!));
      return true;
    }
    return false;
  };
}
