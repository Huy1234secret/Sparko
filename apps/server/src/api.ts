import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  ago,
  enabledModules,
  enqueueJob,
  getGuild,
  getModule,
  getStatus,
  has,
  latestJob,
  cleanWelcome,
  listAudit,
  welcomeDefault,
  welcomeProblem,
  welcomeOf,
  listGreetLog,
  listLibrary,
  type WelcomeConfig,
  Perm,
  permName,
  setStepSkipped,
  skippedSteps,
  writeModule,
  type Db,
  Plain,
  type GuildView,
  type Rest,
} from '@sparko/core';
import type { createAuth, DiscordGuild } from './auth.ts';
import { BadRequest, json, readJson } from './http.ts';
import type { Media } from './media.ts';
import { arRoutes } from './ar-api.ts';
import { rrRoutes } from './rr-api.ts';
import { qaRoutes } from './qa-api.ts';
import { sgRoutes } from './sg-api.ts';
import { bdRoutes } from './bd-api.ts';
import { studioRoutes } from './studio-api.ts';
import { ticketRoutes } from './tickets-api.ts';

type Auth = ReturnType<typeof createAuth>;
type Views = {
  get: (guildId: string) => Promise<GuildView>;
  refresh: (guildId: string) => Promise<GuildView>;
};

/** Module ids the dashboard may switch on and off (kept in sync with the site). */
const moduleId = /^[a-z][a-z0-9-]{1,40}$/;

/** Server-wide permissions Sparko's modules rely on, most important first. */
const needed: { perm: keyof typeof Perm; affects: string }[] = [
  { perm: 'viewChannel', affects: 'Sparko can’t see your channels.' },
  { perm: 'sendMessages', affects: 'Sparko can’t post anywhere.' },
  { perm: 'embedLinks', affects: 'Messages with embeds can’t be sent.' },
  {
    perm: 'manageRoles',
    affects:
      'Automatic roles and Reward roles can’t give roles until Sparko has it.',
  },
  {
    perm: 'createPrivateThreads',
    affects: 'Tickets can’t open private threads until Sparko has it.',
  },
];

export function createApi({
  db,
  auth,
  views,
  discord,
  publicUrl,
  media,
  now = Date.now,
  applyWaitMs = 15_000,
}: {
  db: Db;
  auth: Auth;
  views: Views | undefined;
  /** Discord's REST API with the bot token, when it's set. */
  discord?: Rest | undefined;
  publicUrl: string;
  /** Uploaded pictures; uploads are off without it. */
  media?: Media | undefined;
  now?: () => number;
  applyWaitMs?: number;
}) {
  const origin = new URL(publicUrl).origin;
  const hueOf = (id: string) => Number(BigInt(id) % 360n);

  const serverOf = (g: DiscordGuild) => {
    const saved = getGuild(db, g.id);
    return {
      id: g.id,
      name: g.name,
      hue: hueOf(g.id),
      members: g.approximate_member_count ?? saved?.memberCount ?? 0,
      plan: saved?.plan ?? 'free',
      installed: !!saved?.installed,
      ...(saved?.paused ? { paused: saved.paused } : {}),
      ...(g.icon
        ? {
            icon: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`,
          }
        : {}),
    };
  };

  async function view(guildId: string, fresh = false) {
    if (!views) return undefined;
    try {
      return await (fresh ? views.refresh(guildId) : views.get(guildId));
    } catch (e) {
      console.error(`Reading server ${guildId} from Discord failed`, e);
      return undefined;
    }
  }

  function missingPermission(v: GuildView | undefined) {
    if (!v) return null;
    const gap = needed.find((n) => !has(v.perms, Perm[n.perm]));
    return gap ? { name: permName[gap.perm], affects: gap.affects } : null;
  }

  async function health(guildId: string, fresh = false) {
    const v = await view(guildId, fresh);
    const beat = getStatus<{ ping: number }>(db, 'heartbeat');
    const commands = getStatus<{ count: number }>(db, 'commands');
    const plus = getGuild(db, guildId)?.plan === 'plus';
    return {
      latencyMs:
        beat && now() - beat.at < 120_000 ? Math.max(0, beat.value.ping) : -1,
      checkedAt: new Date(now()).toISOString(),
      missingPermission: missingPermission(v),
      commandsSynced: commands?.value.count ?? 0,
      templates: { used: 0, limit: plus ? 100 : 10 },
      storageMb: { used: 0, limit: plus ? 100 : 10 },
    };
  }

  async function overview(g: DiscordGuild) {
    const server = serverOf(g);
    const on = enabledModules(db, g.id);
    const skipped = skippedSteps(db, g.id);
    const h = await health(g.id);
    const noRoles = h.missingPermission?.name === permName.manageRoles;
    const joined = getGuild(db, g.id)?.joinedAt;
    const steps = [
      {
        id: 'add',
        title: `Add Sparko to ${server.name}`,
        meta: joined ? ago(joined, now()) : 'Done',
        description: '',
        status: 'done',
      },
      {
        id: 'automod',
        title: 'Turn on Auto moderation',
        meta: '1 min',
        description:
          'Sparko removes spam and invite links. You can test rules before they’re live.',
        moduleId: 'automod',
        action: 'Set up Auto moderation',
      },
      {
        id: 'welcome',
        title: 'Greet new members',
        meta: '1 min',
        description:
          'Sparko welcomes people in a channel you pick. You’ll see a preview before anything is sent.',
        moduleId: 'welcome',
        action: 'Set up Welcome',
      },
      {
        id: 'starter-role',
        title: 'Give members a starter role',
        meta: '1 min',
        description: noRoles
          ? 'Sparko needs the Manage Roles permission before it can give roles.'
          : 'Everyone who joins gets a role you pick, so they can see your channels.',
        moduleId: 'autoroles',
        action: 'Set up Automatic roles',
        needsPermission: noRoles,
      },
      {
        id: 'tickets',
        title: 'Post a ticket panel',
        meta: '2 min',
        description:
          'Members open a private ticket with one click. Your staff answer in a thread.',
        moduleId: 'tickets',
        action: 'Set up Tickets',
      },
    ].map((s) => ({
      ...s,
      status:
        s.status === 'done' || (s.moduleId && on[s.moduleId])
          ? 'done'
          : skipped.has(s.id)
            ? 'skipped'
            : 'todo',
    }));
    const highlight = (id: string, note: string) => ({
      moduleId: id,
      status: !on[id]
        ? 'off'
        : id === 'autoroles' && noRoles
          ? 'needs-fix'
          : 'live',
      note: on[id] ? note : 'Not set up yet',
    });
    return {
      server,
      on,
      steps,
      health: h,
      highlights: [
        highlight('automod', 'On'),
        highlight('tickets', 'On'),
        highlight('levels', 'On'),
        highlight('autoroles', 'On'),
        highlight('giveaways', 'On'),
        highlight('welcome', 'On'),
      ],
      activity: listAudit(db, g.id).map((a) => ({
        who: a.who,
        what: a.what,
        detail: a.detail,
        when: ago(a.at, now()),
        icon: a.icon,
      })),
    };
  }

  const studio = studioRoutes({
    db,
    view: (id) => view(id),
    now,
    rest: discord,
    media,
  });
  const reactionRoles = rrRoutes({ db, view: (id) => view(id), now });
  const autoRoles = arRoutes({ db, view: (id) => view(id), now });
  const questions = qaRoutes({ db, view: (id) => view(id), now });
  const suggestions = sgRoutes({ db, view: (id) => view(id), now });
  const birthdays = bdRoutes({
    db,
    rest: discord,
    view: (id) => view(id),
    now,
  });
  const tickets = ticketRoutes({
    db,
    rest: discord,
    view: (id) => view(id),
    now,
  });

  /** Waits for the bot to apply the latest change, up to applyWaitMs. */
  async function applied(guildId: string, mod: string) {
    const until = now() + applyWaitMs;
    for (;;) {
      const job = latestJob(db, guildId, mod);
      if (!job || job.status === 'done') return { status: 'live' };
      if (job.status === 'error')
        return { status: 'error', message: job.error ?? 'It didn’t apply.' };
      if (now() >= until)
        return {
          status: 'error',
          message:
            'Saved, but Sparko’s bot hasn’t picked it up yet. It applies as soon as the bot is back online.',
        };
      await new Promise((done) => setTimeout(done, 250));
    }
  }

  async function route(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const m = url.pathname.match(/^\/api\/v1\/servers\/(\d{1,25})(\/.*)?$/);
    if (!m) return false;
    const guildId = m[1]!;
    const rest = m[2] ?? '';
    const method = req.method ?? 'GET';
    const writing = method !== 'GET' && method !== 'HEAD';
    // Changes only from this site (cookies alone don't prove it).
    if (writing && req.headers.origin !== origin) {
      json(res, 403, { error: 'forbidden' });
      return true;
    }
    const access = await auth.access(req, guildId);
    if (access.status !== 200) {
      json(res, access.status, {
        error: access.status === 401 ? 'signed_out' : 'not_allowed',
      });
      return true;
    }
    const { user, guild } = access;
    const installed = !!getGuild(db, guildId)?.installed;
    if (!installed) {
      json(res, 404, { error: 'not_installed' });
      return true;
    }
    const paused = getGuild(db, guildId)?.paused;
    if (writing && paused) {
      json(res, 423, {
        error: 'paused',
        message: 'This server is paused by Sparko staff.',
      });
      return true;
    }

    if (method === 'GET' && rest === '/overview')
      json(res, 200, await overview(guild));
    else if (method === 'GET' && rest === '/health')
      json(res, 200, await health(guildId, true));
    else if (method === 'PUT' && rest.startsWith('/steps/')) {
      const { skipped } = (await readJson<{ skipped?: unknown }>(req)) ?? {};
      setStepSkipped(db, guildId, rest.slice(7), skipped === true);
      res.writeHead(204).end();
    } else if (method === 'GET' && rest === '/channels') {
      const v = await view(guildId);
      json(
        res,
        200,
        (v?.channels ?? []).map(({ id, name, category, canPost }) => ({
          id,
          name,
          category,
          canPost,
        })),
      );
    } else if (method === 'POST' && rest === '/permissions/check')
      json(res, 200, {
        ok: missingPermission(await view(guildId, true)) === null,
      });
    else if (method === 'POST' && rest.startsWith('/channels/')) {
      const channelId = rest.match(/^\/channels\/(\d{1,25})\/check$/)?.[1];
      const v = await view(guildId, true);
      json(res, 200, {
        ok: !!v?.channels.find((c) => c.id === channelId)?.canPost,
      });
    } else if (rest.startsWith('/studio')) {
      const handled = await studio({
        req,
        res,
        method,
        path: rest,
        guildId,
        user,
      });
      if (!handled) json(res, 404, { error: 'not_found' });
    } else if (rest.startsWith('/reaction-roles')) {
      const handled = await reactionRoles({
        req,
        res,
        method,
        path: rest,
        guildId,
        user,
      });
      if (!handled) json(res, 404, { error: 'not_found' });
    } else if (rest.startsWith('/autoroles')) {
      const handled = await autoRoles({
        req,
        res,
        url,
        method,
        path: rest,
        guildId,
        user,
      });
      if (!handled) json(res, 404, { error: 'not_found' });
    } else if (rest.startsWith('/suggestions')) {
      const handled = await suggestions({
        req,
        res,
        url,
        method,
        path: rest,
        guildId,
        user,
      });
      if (!handled) json(res, 404, { error: 'not_found' });
    } else if (rest.startsWith('/birthdays')) {
      const handled = await birthdays({
        req,
        res,
        url,
        method,
        path: rest,
        guildId,
        user,
      });
      if (!handled) json(res, 404, { error: 'not_found' });
    } else if (rest.startsWith('/questions')) {
      const handled = await questions({
        req,
        res,
        url,
        method,
        path: rest,
        guildId,
        user,
      });
      if (!handled) json(res, 404, { error: 'not_found' });
    } else if (rest.startsWith('/tickets')) {
      const handled = await tickets({
        req,
        res,
        method,
        path: rest,
        guildId,
        user,
      });
      if (!handled) json(res, 404, { error: 'not_found' });
    } else if (method === 'GET' && rest === '/welcome') {
      const v = await view(guildId);
      const channels = (v?.channels ?? []).map(
        ({ id, name, category, canPost }) => ({ id, name, category, canPost }),
      );
      const saved = welcomeOf(db, guildId, now());
      json(res, 200, {
        on: saved.on,
        config:
          saved.config ??
          welcomeDefault(
            channels.find((c) => c.canPost)?.id ?? channels[0]?.id ?? '',
          ),
        channels,
        log: listGreetLog(db, guildId),
      });
    } else if (method === 'PUT' && rest === '/welcome') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Welcome is on or off.');
      const problem = welcomeProblem(
        body.config,
        new Set(listLibrary(db, guildId, 'studio').templates.map((t) => t.id)),
      );
      if (problem) throw new BadRequest(problem);
      const config = cleanWelcome(body.config as WelcomeConfig);
      const at = now();
      writeModule(db, guildId, 'welcome', { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: 'welcome',
          title: body.on
            ? 'Updated the welcome messages'
            : 'Turned Welcome messages off',
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
            ? 'updated Welcome messages'
            : 'turned off Welcome messages',
          icon: 'hand',
        },
        at,
      );
      enqueueJob(db, { guildId, moduleId: 'welcome', kind: 'welcome' }, at);
      res.writeHead(204).end();
    } else {
      const mod = rest.match(/^\/modules\/([^/]+)(\/apply)?$/);
      if (!mod || !moduleId.test(mod[1]!)) {
        json(res, 404, { error: 'not_found' });
        return true;
      }
      const id = mod[1]!;
      if (method === 'GET' && mod[2])
        json(res, 200, await applied(guildId, id));
      else if (method === 'POST' && mod[2]) {
        // After an owner fixes a problem, try the saved change again.
        const last = latestJob(db, guildId, id);
        if (last?.status === 'error')
          enqueueJob(
            db,
            { guildId, moduleId: id, kind: last.kind, payload: last.payload },
            now(),
          );
        json(res, 200, await applied(guildId, id));
      } else if (method === 'GET')
        json(res, 200, { on: getModule(db, guildId, id).on });
      else if (method === 'PUT') {
        const body = await readJson<{ on?: unknown }>(req);
        if (typeof body?.on !== 'boolean')
          throw new BadRequest('Say whether the module is on or off.');
        const at = now();
        writeModule(db, guildId, id, { on: body.on }, at);
        addVersion(
          db,
          {
            guildId,
            moduleId: id,
            title: body.on ? 'Turned on' : 'Turned off',
            who: user,
            config: { on: body.on },
          },
          at,
        );
        addAudit(
          db,
          {
            guildId,
            who: user.name,
            what: `turned ${body.on ? 'on' : 'off'} ${id}`,
            icon: 'refresh-cw',
          },
          at,
        );
        enqueueJob(db, { guildId, moduleId: id, kind: 'module' }, at);
        res.writeHead(204).end();
      } else json(res, 405, { error: 'method_not_allowed' });
    }
    return true;
  }

  /**
   * Whether Sparko is up, for the public Status page: no sign-in needed and
   * nothing private. The bot counts as online if it checked in within two
   * minutes (it does every 30 seconds).
   */
  function publicStatus() {
    const beat = getStatus<{ ping: number; guilds?: number }>(db, 'heartbeat');
    const commands = getStatus<{ count: number }>(db, 'commands');
    const online = !!beat && now() - beat.at < 120_000;
    return {
      status: online ? 'operational' : 'degraded',
      checkedAt: new Date(now()).toISOString(),
      website: { online: true },
      bot: {
        online,
        latencyMs: online ? Math.max(0, beat.value.ping) : null,
        servers: beat?.value.guilds ?? null,
        lastSeen: beat ? new Date(beat.at).toISOString() : null,
      },
      commands: commands?.value.count ?? 0,
    };
  }

  /** Handles /api/v1/servers/… and the public status. False for the rest. */
  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', origin);
    if (url.pathname === '/api/v1/public/status') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(res, 405, { error: 'method_not_allowed' });
        return true;
      }
      json(res, 200, publicStatus());
      return true;
    }
    try {
      return await route(req, res, url);
    } catch (e) {
      if (e instanceof Plain)
        json(res, 409, { error: 'discord', message: e.message });
      else if (e instanceof BadRequest)
        json(res, 400, { error: 'bad_request', message: e.message });
      else throw e;
      return true;
    }
  };
}
