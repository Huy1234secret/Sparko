import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addAudit,
  addVersion,
  bdConfigOf,
  cleanInvites,
  DiscordError,
  enqueueJob,
  getGuild,
  has,
  INV_MODULE,
  invBonus,
  invConfigOf,
  invCountsOf,
  invIssue,
  invKinds,
  invLeaderboard,
  invLimits,
  invMax,
  invReset,
  invState,
  invitedBy,
  invitedList,
  listCodes,
  listInvLog,
  listLibrary,
  Perm,
  sgConfigOf,
  writeModule,
  type Db,
  type GuildView,
  type InvKind,
  type Invites,
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

/** /api/v1/servers/:id/invites… */
export function invRoutes({
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
  /** The bot gives and takes reward roles after counts change. */
  const rewardsJob = (
    guildId: string,
    payload: { userIds: string[] } | { all: true },
  ) =>
    enqueueJob(
      db,
      { guildId, moduleId: INV_MODULE, kind: 'invites-rewards', payload },
      now(),
    );
  /** Whether Sparko can see the server's invites (it needs Manage Server). */
  const canSee = (guildId: string, v: GuildView | undefined) =>
    v ? has(v.perms, Perm.manageGuild) : invState(db, guildId).canList;
  const detail = (guildId: string, userId: string) => {
    const counts = invCountsOf(db, guildId, userId);
    const by = invitedBy(db, guildId, userId);
    return {
      member: {
        userId,
        name: counts.name || by?.userName || userId,
        avatar: counts.avatar || by?.avatar || '',
        regular: counts.regular,
        left: counts.left,
        fake: counts.fake,
        bonus: counts.bonus,
        total: counts.total,
      },
      invitedBy: by,
      invited: invitedList(db, guildId, userId),
    };
  };

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
    if (path === '/invites' && method === 'GET') {
      const v = await view(guildId);
      const { on, config } = invConfigOf(db, guildId);
      json(res, 200, {
        on,
        config,
        limits: invLimits(plan),
        count: invLeaderboard(db, guildId, { size: 1 }).count,
        canSeeInvites: canSee(guildId, v),
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
        log: listInvLog(db, guildId),
      });
      return true;
    }
    if (path === '/invites' && method === 'PUT') {
      const body = await readJson<{ on?: unknown; config?: unknown }>(req);
      if (typeof body?.on !== 'boolean')
        throw new BadRequest('Say whether Invite tracking is on or off.');
      const v = await view(guildId);
      const issue = invIssue(body.config, {
        plan,
        templates: new Set(
          listLibrary(db, guildId, 'studio').templates.map((t) => t.id),
        ),
        ...(v
          ? { roles: new Map(v.roles.map((r) => [r.id, r.assignable])) }
          : {}),
      });
      if (issue) throw new BadRequest(issue.problem);
      const config = cleanInvites(body.config as Invites);
      // Every module's commands live in the same list in Discord.
      const name = config.commands.group.name;
      const sg = sgConfigOf(db, guildId);
      if (
        sg.on &&
        Object.values(sg.config.commands).some((c) => c.on && c.name === name)
      )
        throw new BadRequest(
          `/${name} is already a suggestion command. Pick another name in Commands.`,
        );
      const bd = bdConfigOf(db, guildId);
      if (bd.on && bd.config.commands.group.name === name)
        throw new BadRequest(
          `/${name} is already the birthday command. Pick another name in Commands.`,
        );
      const at = now();
      writeModule(db, guildId, INV_MODULE, { on: body.on, config }, at);
      addVersion(
        db,
        {
          guildId,
          moduleId: INV_MODULE,
          title: body.on
            ? 'Updated Invite tracking'
            : 'Turned Invite tracking off',
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
            ? 'updated Invite tracking'
            : 'turned off Invite tracking',
          icon: 'link',
        },
        at,
      );
      // The bot reads the invites, checks channels and roles, and registers
      // the commands.
      enqueueJob(db, { guildId, moduleId: INV_MODULE, kind: 'invites' }, at);
      res.writeHead(204).end();
      return true;
    }
    if (path === '/invites/leaderboard' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').slice(0, 100);
      const page = Number(url.searchParams.get('page') ?? 1) || 1;
      json(res, 200, invLeaderboard(db, guildId, { query: q, page }));
      return true;
    }
    if (path === '/invites/codes' && method === 'GET') {
      const v = await view(guildId);
      const s = invState(db, guildId);
      json(res, 200, {
        codes: listCodes(db, guildId, now()),
        vanity: s.vanityCode
          ? { code: s.vanityCode, uses: s.vanityUses }
          : null,
        syncedAt: s.syncedAt,
        canSeeInvites: canSee(guildId, v),
      });
      return true;
    }
    // Finding any server member, to give them a bonus.
    if (path === '/invites/find' && method === 'GET') {
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
          .map((m) => ({
            ...m,
            total: invCountsOf(db, guildId, m.userId).total,
          })),
      });
      return true;
    }
    const one = path.match(
      /^\/invites\/members\/(\d{1,25})(\/bonus|\/reset)?$/,
    );
    if (one && method === 'GET' && !one[2]) {
      json(res, 200, detail(guildId, one[1]!));
      return true;
    }
    if (one && method === 'POST' && one[2] === '/bonus') {
      const userId = one[1]!;
      const body = await readJson<{ amount?: unknown }>(req);
      const amount = body?.amount;
      if (
        typeof amount !== 'number' ||
        !Number.isInteger(amount) ||
        amount === 0 ||
        Math.abs(amount) > invMax.bonus
      )
        throw new BadRequest(
          `Write a whole number of invites, from -${invMax.bonus.toLocaleString('en-US')} to ${invMax.bonus.toLocaleString('en-US')}, but not 0.`,
        );
      const known = invCountsOf(db, guildId, userId);
      const by = invitedBy(db, guildId, userId);
      let person =
        known.name || by
          ? {
              id: userId,
              name: known.name || by!.userName,
              avatar: known.avatar || by?.avatar || '',
            }
          : null;
      // Someone Sparko hasn't seen yet has to be in the server.
      if (!person) {
        try {
          if (!rest) throw new Error('No Discord connection.');
          const p = personOf(
            await rest.get<DiscordMember>(
              `/guilds/${guildId}/members/${userId}`,
            ),
          );
          if (p) person = { id: p.userId, name: p.name, avatar: p.avatar };
        } catch (e) {
          if (e instanceof DiscordError && e.status === 404)
            throw new BadRequest('That member isn’t in the server.');
        }
        if (!person) throw new BadRequest('Sparko couldn’t find that member.');
      }
      invBonus(db, guildId, person, amount, user, now());
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'changed bonus invites',
          detail: `${person.name}: ${amount > 0 ? '+' : ''}${amount}`,
          icon: 'link',
        },
        now(),
      );
      rewardsJob(guildId, { userIds: [userId] });
      json(res, 200, detail(guildId, userId));
      return true;
    }
    if (one && method === 'POST' && one[2] === '/reset') {
      const userId = one[1]!;
      const touched = invReset(db, guildId, userId, user, now());
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'reset a member’s invites',
          detail: invCountsOf(db, guildId, userId).name || userId,
          icon: 'rotate-ccw',
        },
        now(),
      );
      if (touched.length) rewardsJob(guildId, { userIds: touched });
      json(res, 200, detail(guildId, userId));
      return true;
    }
    if (path === '/invites/reset' && method === 'POST') {
      const touched = invReset(db, guildId, null, user, now());
      addAudit(
        db,
        {
          guildId,
          who: user.name,
          what: 'reset everyone’s invites',
          icon: 'rotate-ccw',
        },
        now(),
      );
      if (touched.length) rewardsJob(guildId, { userIds: touched });
      res.writeHead(204).end();
      return true;
    }
    if (path === '/invites/test' && method === 'POST') {
      const body = await readJson<{ channel?: unknown; kind?: unknown }>(req);
      const channel = typeof body?.channel === 'string' ? body.channel : '';
      if (!snowflake.test(channel))
        throw new BadRequest('Pick a channel to send the test message to.');
      const kind = body?.kind as InvKind;
      if (!invKinds.includes(kind))
        throw new BadRequest('Pick the join or the leave message to test.');
      enqueueJob(
        db,
        {
          guildId,
          moduleId: INV_MODULE,
          kind: 'invites-test',
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
