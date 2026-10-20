import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  bdConfigOf,
  cleanTempVoice,
  enqueueJob,
  getGuild,
  getTemplate,
  latestJob,
  listLibrary,
  listTvLog,
  listTvPrefs,
  normaliseStudio,
  resetTvPrefs,
  sgConfigOf,
  TV_MODULE,
  tvConfigOf,
  tvIssue,
  tvLimits,
  tvMessageIssue,
  tvPanelPost,
  tvPrefsCount,
  tvRoom,
  tvRooms,
  writeModule,
  type Db,
  type GuildView,
  type StoredUser,
  type StudioMessage,
  type TempVoice,
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

/** /api/v1/servers/:id/temp-voice… */
export function tvRoutes({
  db,
  view,
  now,
  waitMs = 15_000,
}: {
  db: Db;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
  /** How long to wait for the bot to post the panel or close a room. */
  waitMs?: number;
}) {
  /** Waits for the bot to finish the module's latest job. */
  async function done(guildId: string) {
    const until = now() + waitMs;
    for (;;) {
      const job = latestJob(db, guildId, TV_MODULE);
      if (!job || job.status === 'done') return { status: 'live' as const };
      if (job.status === 'error')
        return {
          status: 'error' as const,
          message: job.error ?? 'It didn’t apply.',
        };
      if (now() >= until)
        return {
          status: 'error' as const,
          message:
            'Sparko’s bot hasn’t picked it up yet. It happens as soon as the bot is back online.',
        };
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return async function handle({
    req,
    res,
    url,
    method,
    path,
    guildId,
    user,
  }: Call) {
    if (path === '/temp-voice' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = tvConfigOf(db, guildId);
      const guild = getGuild(db, guildId);
      const posted = tvPanelPost(db, guildId);
      json(res, 200, {
        on,
        config,
        limits: tvLimits(guild?.plan),
        boostLevel: guild?.boostLevel ?? 0,
        rooms: tvRooms(db, guildId).length,
        prefs: tvPrefsCount(db, guildId),
        panel: posted ? { channelId: posted.channelId } : null,
        channels: (v?.channels ?? []).map(
          ({ id, name, category, canPost }) => ({
            id,
            name,
            category,
            canPost,
          }),
        ),
        // Stage channels can't be hubs.
        voice: (v?.voice ?? []).filter((c) => !c.stage),
        categories: v?.categories ?? [],
        roles: (v?.roles ?? [])
          .filter((r) => !r.managed)
          .map(({ id, name, color, color2 }) => ({
            id,
            name,
            color: hex(color),
            color2: color && color2 ? hex(color2) : null,
          })),
        log: listTvLog(db, guildId),
      });
      return true;
    }
    if (path === '/temp-voice' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Temporary voice is on or off.');
      const v = await view(guildId);
      const guild = getGuild(db, guildId);
      const templates = new Set(
        listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
      );
      const issue = tvIssue(body.config, {
        plan: guild?.plan,
        templates,
        boostLevel: guild?.boostLevel ?? 0,
        ...(v
          ? {
              channels: new Set(v.channels.map((c) => c.id)),
              roles: new Set(v.roles.map((r) => r.id)),
              ...(v.voice
                ? {
                    voice: new Set(
                      v.voice.filter((c) => !c.stage).map((c) => c.id),
                    ),
                  }
                : {}),
              ...(v.categories
                ? { categories: new Set(v.categories.map((c) => c.id)) }
                : {}),
            }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanTempVoice(body.config as TempVoice);
      // The panel's own rows have to fit beside its buttons.
      if (config.panel.message) {
        const t = getTemplate<StudioMessage>(
          db,
          guildId,
          'studio',
          config.panel.message,
        );
        const rows = t && tvMessageIssue(normaliseStudio(t.message), config);
        if (rows) throw new BadRequest(rows.problem);
      }
      // Every module's commands live in the same list in Discord.
      const group = config.commands.group.name;
      const sg = sgConfigOf(db, guildId);
      const bd = bdConfigOf(db, guildId);
      if (
        sg.on &&
        Object.values(sg.config.commands).some((c) => c.on && c.name === group)
      )
        throw new BadRequest(
          `/${group} is already a suggestion command. Pick another name in Commands.`,
        );
      if (bd.on && bd.config.commands.group.name === group)
        throw new BadRequest(
          `/${group} is already the birthday command. Pick another name in Commands.`,
        );
      const at = now();
      writeModule(db, guildId, TV_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: TV_MODULE,
          title: body.on
            ? 'Updated Temporary voice'
            : 'Turned Temporary voice off',
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
            ? 'updated Temporary voice'
            : 'turned off Temporary voice',
          icon: 'volume-2',
        },
        at,
      );
      // The bot checks its permissions and the hubs, registers /voice and
      // posts or updates the panel.
      enqueueJob(db, { guildId, moduleId: TV_MODULE, kind: 'temp-voice' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/temp-voice/panel' && method === 'POST') {
      const { on, config } = tvConfigOf(db, guildId);
      if (!on) throw new BadRequest('Turn Temporary voice on and save first.');
      if (!config.panel.channel)
        throw new BadRequest('Pick the panel’s channel and save first.');
      enqueueJob(
        db,
        { guildId, moduleId: TV_MODULE, kind: 'temp-voice-panel' },
        now(),
      );
      json(res, 200, await done(guildId));
      return true;
    }
    if (path === '/temp-voice/rooms' && method === 'GET') {
      json(res, 200, { rooms: tvRooms(db, guildId) });
      return true;
    }
    const room = path.match(/^\/temp-voice\/rooms\/(\d{1,25})$/);
    if (room && method === 'DELETE') {
      const found = tvRoom(db, room[1]!);
      if (!found || found.guildId !== guildId)
        return (json(res, 404, { error: 'not_found' }), true);
      enqueueJob(
        db,
        {
          guildId,
          moduleId: TV_MODULE,
          kind: 'temp-voice-close',
          payload: {
            channelId: found.channelId,
            userId: user.id,
            userName: user.name,
          },
        },
        now(),
      );
      const result = await done(guildId);
      if (result.status === 'error') throw new BadRequest(result.message);
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'closed a voice room',
          detail: found.name,
          icon: 'trash-2',
        },
        now(),
      );
      res.writeHead(204).end();
      return true;
    }
    if (path === '/temp-voice/prefs' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').slice(0, 100);
      json(res, 200, {
        prefs: listTvPrefs(db, guildId, { query: q }),
        count: tvPrefsCount(db, guildId),
      });
      return true;
    }
    const prefs = path.match(/^\/temp-voice\/prefs\/(\d{1,25})$/);
    if (prefs && method === 'DELETE') {
      if (!resetTvPrefs(db, guildId, prefs[1]!))
        return (json(res, 404, { error: 'not_found' }), true);
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'reset a member’s voice room settings',
          detail: prefs[1]!,
          icon: 'rotate-ccw',
        },
        now(),
      );
      res.writeHead(204).end();
      return true;
    }
    return false;
  };
}
