import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  cleanLevels,
  DiscordError,
  enqueueJob,
  getGuild,
  listLibrary,
  listLvLog,
  LV_MAX_CHANGE,
  LV_MODULE,
  lvChangeXp,
  lvConfigOf,
  lvCrateStats,
  lvCrates,
  lvDetail,
  lvIssue,
  lvKinds,
  lvLeaderboard,
  lvLimits,
  lvMember,
  lvReset,
  otherCommandNames,
  writeModule,
  type Db,
  type GuildView,
  type Levels,
  type LvChange,
  type LvKind,
  type Rest,
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
const snowflake = /^\d{1,25}$/;
const changes: LvChange[] = ['give', 'take', 'set'];

/** A server member as Discord sends them. */
type DiscordMember = {
  nick?: string | null;
  user?: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
};
const avatarOf = (id: string, hash: string | null | undefined) =>
  hash
    ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) % 6n)}.png`;
const personOf = (m: DiscordMember) =>
  m.user && {
    userId: m.user.id,
    name: m.nick || m.user.global_name || m.user.username,
    avatar: avatarOf(m.user.id, m.user.avatar),
  };

/** /api/v1/servers/:id/levels… */
export function lvRoutes({
  db,
  rest,
  view,
  now,
}: {
  db: Db;
  /** Discord, for finding members; not there in some tests. */
  rest: Rest | undefined;
  view: (guildId: string) => Promise<GuildView | undefined>;
  now: () => number;
}) {
  /** The bot gives and takes reward roles after XP changes. */
  const rewardsJob = (guildId: string, userIds: string[]) =>
    enqueueJob(
      db,
      {
        guildId,
        moduleId: LV_MODULE,
        kind: 'levels-rewards',
        payload: { userIds },
      },
      now(),
    );

  /** Someone Sparko knows, or a server member it can look up. */
  async function person(guildId: string, userId: string) {
    const known = lvMember(db, guildId, userId);
    if (known?.name)
      return { id: userId, name: known.name, avatar: known.avatar };
    try {
      if (!rest) throw new Error('No Discord connection.');
      const p = personOf(
        await rest.get<DiscordMember>(`/guilds/${guildId}/members/${userId}`),
      );
      if (p) return { id: p.userId, name: p.name, avatar: p.avatar };
    } catch (e) {
      if (e instanceof DiscordError && e.status === 404)
        throw new BadRequest('That member isn’t in the server.');
    }
    throw new BadRequest('Sparko couldn’t find that member.');
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
    const plan = getGuild(db, guildId)?.plan;
    if (path === '/levels' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = lvConfigOf(db, guildId);
      json(res, 200, {
        on,
        config,
        limits: lvLimits(plan),
        count: lvLeaderboard(db, guildId, { size: 1 }).count,
        crates: lvCrateStats(db, guildId),
        channels: (v?.channels ?? []).map(
          ({ id, name, category, canPost }) => ({
            id,
            name,
            category,
            canPost,
          }),
        ),
        roles: (v?.roles ?? [])
          .filter((r) => !r.managed)
          .map(({ id, name, color, color2, assignable }) => ({
            id,
            name,
            color: hex(color),
            color2: color && color2 ? hex(color2) : null,
            assignable,
          })),
        log: listLvLog(db, guildId),
      });
      return true;
    }
    if (path === '/levels' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Levels & XP is on or off.');
      const v = await view(guildId);
      const issue = lvIssue(body.config, {
        plan,
        templates: new Set(
          listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
        ),
        ...(v
          ? {
              roles: new Map(v.roles.map((r) => [r.id, r.assignable])),
              channels: new Set(v.channels.map((c) => c.id)),
            }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanLevels(body.config as Levels);
      // Every module's commands live in the same list in Discord.
      const taken = otherCommandNames(db, guildId, LV_MODULE);
      const clash = Object.values(config.commands).find(
        (c) => c.on && taken.has(c.name),
      );
      if (body.on && clash)
        throw new BadRequest(
          `/${clash.name} is already another module’s command. Pick another name in Commands.`,
        );
      const before = lvConfigOf(db, guildId).config;
      const at = now();
      writeModule(db, guildId, LV_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: LV_MODULE,
          title: body.on ? 'Updated Levels & XP' : 'Turned Levels & XP off',
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
          what: body.on ? 'updated Levels & XP' : 'turned off Levels & XP',
          icon: 'trending-up',
        },
        at,
      );
      // The bot registers the commands, checks channels and roles, and
      // brings reward roles in line when the rewards or the XP equation changed.
      const rewardsChanged =
        JSON.stringify([before.rewards, before.formula, before.maxLevel]) !==
        JSON.stringify([config.rewards, config.formula, config.maxLevel]);
      enqueueJob(
        db,
        {
          guildId,
          moduleId: LV_MODULE,
          kind: 'levels',
          payload: { rewards: rewardsChanged },
        },
        at,
      );
      res.writeHead(204).end();
      return true;
    }
    if (path === '/levels/leaderboard' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').slice(0, 100);
      const page = Number(url.searchParams.get('page') ?? 1) || 1;
      json(res, 200, lvLeaderboard(db, guildId, { query: q, page }));
      return true;
    }
    if (path === '/levels/crates' && method === 'GET') {
      json(res, 200, {
        crates: lvCrates(db, guildId),
        stats: lvCrateStats(db, guildId),
      });
      return true;
    }
    // Finding any server member, to change their XP.
    if (path === '/levels/find' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
      if (!q || !rest) return (json(res, 200, { members: [] }), true);
      const found = snowflake.test(q)
        ? [
            await rest
              .get<DiscordMember>(`/guilds/${guildId}/members/${q}`)
              .catch(() => null),
          ]
        : await rest
            .get<
              DiscordMember[]
            >(`/guilds/${guildId}/members/search?query=${encodeURIComponent(q)}&limit=10`)
            .catch(() => []);
      json(res, 200, {
        members: found
          .map((m) => (m ? personOf(m) : undefined))
          .filter((m) => !!m)
          .map((m) => {
            const d = lvDetail(db, guildId, m.userId);
            return { ...m, xp: d.xp, level: d.level };
          }),
      });
      return true;
    }
    const one = path.match(/^\/levels\/members\/(\d{1,25})(\/xp|\/reset)?$/);
    if (one && method === 'GET' && !one[2]) {
      json(res, 200, lvDetail(db, guildId, one[1]!));
      return true;
    }
    if (one && method === 'POST' && one[2] === '/xp') {
      const userId = one[1]!;
      const body = await readJson<{ mode?: unknown; amount?: unknown }>(req);
      const mode = body?.mode as LvChange;
      if (!changes.includes(mode))
        throw new BadRequest('Say whether to give, take or set XP.');
      const amount = body?.amount;
      const least = mode === 'set' ? 0 : 1;
      if (
        typeof amount !== 'number' ||
        !Number.isInteger(amount) ||
        amount < least ||
        amount > LV_MAX_CHANGE
      )
        throw new BadRequest(
          `Write a whole number of XP from ${least} to ${LV_MAX_CHANGE.toLocaleString('en-US')}.`,
        );
      const who = await person(guildId, userId);
      const done = lvChangeXp(db, guildId, who, mode, amount, user, now());
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what:
            mode === 'give'
              ? 'gave XP'
              : mode === 'take'
                ? 'took XP'
                : 'set a member’s XP',
          detail: `${who.name}: ${done.before.toLocaleString('en-US')} → ${done.after.toLocaleString('en-US')} XP`,
          icon: 'trending-up',
        },
        now(),
      );
      if (done.from !== done.to) rewardsJob(guildId, [userId]);
      json(res, 200, lvDetail(db, guildId, userId));
      return true;
    }
    if (one && method === 'POST' && one[2] === '/reset') {
      const userId = one[1]!;
      const touched = lvReset(db, guildId, userId, user, now());
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'reset a member’s XP',
          detail: lvMember(db, guildId, userId)?.name || userId,
          icon: 'rotate-ccw',
        },
        now(),
      );
      if (touched.length) rewardsJob(guildId, touched);
      json(res, 200, lvDetail(db, guildId, userId));
      return true;
    }
    if (path === '/levels/reset' && method === 'POST') {
      const touched = lvReset(db, guildId, null, user, now());
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'reset everyone’s XP',
          icon: 'rotate-ccw',
        },
        now(),
      );
      if (touched.length) rewardsJob(guildId, touched);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/levels/test' && method === 'POST') {
      const body = await readJson<{ channel?: unknown; kind?: unknown }>(req);
      const channel = typeof body?.channel === 'string' ? body.channel : '';
      if (!snowflake.test(channel))
        throw new BadRequest('Pick a channel to send the test message to.');
      const kind = body?.kind as LvKind;
      if (!lvKinds.includes(kind))
        throw new BadRequest(
          'Pick the level-up message, the rank card or the XP crate to test.',
        );
      enqueueJob(
        db,
        {
          guildId,
          moduleId: LV_MODULE,
          kind: 'levels-test',
          payload: {
            channel,
            kind,
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
    return false;
  };
}
