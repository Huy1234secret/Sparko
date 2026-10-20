import {
  BD_MODULE,
  bdDefault,
  DiscordError,
  INV_MODULE,
  invBonus,
  invCountsOf,
  invDefault,
  invState,
  listInvLog,
  openDb,
  storedCodes,
  upsertGuild,
  writeModule,
  type InvJoin,
  type Invites,
  type Rest,
} from '@sparko/core';
import { describe, expect, it, vi } from 'vitest';
import {
  codeFromInvite,
  invitesBot,
  leaderboardText,
  listText,
  viewText,
  whoText,
} from './invites.ts';
import { guildCommandBodies, registerGuildCommands } from './guild-commands.ts';

const D = 86_400_000;
const join = (patch: Partial<InvJoin> = {}): InvJoin => ({
  id: 1,
  userId: '50',
  userName: 'kit',
  avatar: '',
  inviterId: '1',
  inviterName: 'rhea',
  code: 'abc',
  type: 'normal',
  fake: false,
  counted: true,
  joinedAt: 1_700_000_000_000,
  leftAt: null,
  ...patch,
});

describe('what /invites says', () => {
  const c = invDefault('100');
  it('breaks down someone’s invites', () => {
    const n = { regular: 10, left: 2, fake: 1, bonus: 3, total: 10 };
    expect(viewText(c, n, '<@1>', false)).toBe(
      '📨 <@1> has **10** invites: 10 regular, 2 left, 1 fake and 3 bonus.',
    );
    expect(
      viewText(
        { ...c, subtractFakes: false },
        { regular: 1, left: 0, fake: 1, bonus: 0, total: 1 },
        '<@1>',
        true,
      ),
    ).toBe(
      '📨 You have **1** invite: 1 regular, 0 left, 1 fake (not taken off) and 0 bonus.',
    );
  });
  it('shows a page of the leaderboard', () => {
    const row = (rank: number, total: number, extra = {}) => ({
      rank,
      userId: String(rank),
      name: '',
      avatar: '',
      regular: total,
      left: 0,
      fake: 0,
      bonus: 0,
      total,
      ...extra,
    });
    expect(
      leaderboardText(c, {
        rows: [row(1, 12, { left: 2, bonus: 2 }), row(2, 1)],
        page: 1,
        pages: 2,
      }),
    ).toBe(
      [
        '🏆 **Top inviters** · page 1 of 2',
        '**1.** <@1> · **12** (12 regular, 2 left, +2 bonus)',
        '**2.** <@2> · **1** (1 regular)',
        '-# More with /invites leaderboard page:2',
      ].join('\n'),
    );
    expect(leaderboardText(c, { rows: [], page: 1, pages: 1 })).toMatch(
      /Nobody has invited anyone yet/,
    );
  });
  it('says who invited someone', () => {
    expect(whoText(join(), '<@50>')).toBe(
      '<@50> was invited by <@1> with `abc` <t:1700000000:R>.',
    );
    expect(whoText(join({ type: 'vanity', inviterId: null }), '<@50>')).toMatch(
      /with the server’s vanity link/,
    );
    expect(
      whoText(join({ type: 'unknown', inviterId: null }), '<@50>'),
    ).toMatch(/couldn’t tell which invite/);
    expect(whoText(join({ leftAt: 1 }), '<@50>')).toMatch(/They’ve left since/);
    expect(whoText(null, '<@50>')).toMatch(/hasn’t seen <@50> join/);
  });
  it('lists the members someone invited, within one message', () => {
    expect(listText([join({ leftAt: 1, fake: true })], '<@1>', false)).toBe(
      '📋 **Members <@1> invited** (1)\n<@50> · <t:1700000000:R> · left, fake',
    );
    expect(listText([], '<@1>', true)).toBe('You haven’t invited anyone yet.');
    const many = Array.from({ length: 50 }, (_, i) =>
      join({ userId: String(10_000_000_000_000 + i) }),
    );
    const text = listText(many, '<@1>', false);
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toMatch(/\(50\+\)/);
  });
  it('reads a gateway invite', () => {
    expect(
      codeFromInvite({
        code: 'x',
        inviterId: '5',
        inviter: { globalName: null, username: 'kit' },
        channelId: '100',
        channel: { id: '100', name: 'general' },
        uses: 2,
        maxUses: 0,
        expiresTimestamp: null,
        createdTimestamp: 7,
      } as never),
    ).toEqual({
      code: 'x',
      inviterId: '5',
      inviterName: 'kit',
      channelId: '100',
      channelName: 'general',
      uses: 2,
      maxUses: 0,
      expiresAt: null,
      createdAt: 7,
    });
  });
});

function setup(patch: Partial<Invites> = {}) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    { id: 'g', name: 'G', icon: null, memberCount: 1, installed: true },
    0,
  );
  writeModule(
    db,
    'g',
    INV_MODULE,
    { on: true, config: { ...invDefault('100'), ...patch } },
    0,
  );
  const discord = { uses: 0, noAccess: false };
  const rest = {
    get: vi.fn(async (path: string) => {
      if (path.endsWith('/invites')) {
        if (discord.noAccess)
          throw new DiscordError(403, 50013, 'Missing Permissions');
        return [
          {
            code: 'abc',
            uses: discord.uses,
            inviter: { id: '1', username: 'rhea' },
            channel: { id: '100', name: 'general' },
          },
        ];
      }
      if (path.endsWith('/vanity-url')) return { code: null, uses: 0 };
      return { roles: [] };
    }),
    put: vi.fn(async () => {}),
    post: vi.fn(async () => ({ id: 'x' })),
    delete: vi.fn(async () => {}),
  } as unknown as Rest;
  const bot = invitesBot(db, rest, { appId: () => 'app' });
  const role = { name: 'Recruiter', position: 1 };
  const guild = {
    id: 'g',
    members: {
      me: {
        permissions: { has: () => true },
        roles: { highest: { position: 5 } },
      },
      cache: new Map(),
    },
    channels: {
      cache: {
        get: (id: string) =>
          id === '100'
            ? { name: 'general', permissionsFor: () => ({ has: () => true }) }
            : undefined,
      },
    },
    roles: {
      cache: { get: (id: string) => (id === '701' ? role : undefined) },
    },
  };
  const handlers = bot.handlers((id) =>
    id === 'g' ? (guild as never) : undefined,
  );
  const member = (id: string, ageDays = 400) =>
    ({
      id,
      displayName: `m${id}`,
      joinedTimestamp: Date.now(),
      guild,
      user: {
        bot: false,
        username: `m${id}`,
        createdTimestamp: Date.now() - ageDays * D,
        displayAvatarURL: () => '',
      },
    }) as never;
  /** An /invites command, with its options. */
  const use = (
    sub: string,
    options: Record<string, unknown> = {},
    { manager = false, name = 'invites' } = {},
  ) => ({
    guildId: 'g',
    commandName: name,
    user: { id: '7' },
    member: {
      displayName: 'quinn',
      roles: { cache: new Map() },
      permissions: { has: () => manager },
    },
    guild,
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => sub,
      getUser: () => options.member ?? null,
      getInteger: (n: string) => options[n] ?? null,
      getBoolean: (n: string) => options[n] ?? null,
    },
    reply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  });
  type Command = Parameters<typeof bot.command>[0];
  const run = async (i: ReturnType<typeof use>) => {
    expect(bot.command(i as unknown as Command)).toBe(true);
    await vi.waitFor(() => expect(i.reply).toHaveBeenCalled());
    return (i.reply.mock.calls[0] as unknown as [{ content: string }])[0]
      .content;
  };
  return { db, rest, bot, discord, guild, handlers, member, use, run };
}

describe('joins and leaves in the bot', () => {
  it('reads invites on start, then credits joins in order', async () => {
    const t = setup();
    await t.bot.syncAll((id) => id === 'g');
    expect(storedCodes(t.db, 'g').map((c) => c.code)).toEqual(['abc']);
    // Its commands are registered with every module's.
    await registerGuildCommands(t.rest as never, t.db, 'app', 'g');
    expect(t.rest.put).toHaveBeenCalledWith(
      '/applications/app/guilds/g/commands',
      expect.arrayContaining([expect.objectContaining({ name: 'invites' })]),
    );
    // Two joins at once: each read of the invites follows the last.
    t.discord.uses = 1;
    const first = t.bot.joined(t.member('50'));
    const second = t.bot.joined(t.member('51'));
    expect((await first)?.type).toBe('normal');
    expect((await second)?.type).toBe('unknown');
    expect(invCountsOf(t.db, 'g', '1').total).toBe(1);
    await t.bot.left(t.member('50'));
    expect(invCountsOf(t.db, 'g', '1').total).toBe(0);
  });

  it('ignores bots and servers with tracking off', async () => {
    const t = setup();
    const bot = { ...(t.member('9') as object), user: { bot: true } };
    expect(await t.bot.joined(bot as never)).toBeNull();
    writeModule(t.db, 'g', INV_MODULE, { on: false }, 0);
    expect(await t.bot.joined(t.member('50'))).toBeNull();
    expect(await t.bot.refresh('g')).toBe(false);
  });

  it('follows invites made and deleted', async () => {
    const t = setup();
    const invite = {
      code: 'new',
      guild: { id: 'g' },
      inviterId: '2',
      inviter: { globalName: 'Ayo', username: 'ayo' },
      channelId: '100',
      channel: { id: '100', name: 'general' },
      uses: 0,
      maxUses: 0,
      expiresTimestamp: null,
      createdTimestamp: 1,
    } as never;
    t.bot.created(invite);
    await vi.waitFor(() =>
      expect(storedCodes(t.db, 'g').map((c) => c.code)).toEqual(['new']),
    );
    t.bot.deleted(invite);
    await vi.waitFor(() => expect(storedCodes(t.db, 'g')).toEqual([]));
  });
});

describe('saving in the dashboard', () => {
  it('checks permissions, channels and reward roles', async () => {
    const t = setup({ rewards: [{ id: 'a', invites: 2, role: '701' }] });
    await t.handlers.invites({ guildId: 'g' } as never);
    expect(invState(t.db, 'g').syncedAt).not.toBeNull();
    t.guild.members.me.roles.highest.position = 1;
    await expect(t.handlers.invites({ guildId: 'g' } as never)).rejects.toThrow(
      'Sparko can’t give @Recruiter. Move Sparko’s role above it in Server Settings → Roles.',
    );
    t.guild.members.me.permissions.has = () => false;
    await expect(t.handlers.invites({ guildId: 'g' } as never)).rejects.toThrow(
      /needs the Manage Server permission/,
    );
    await expect(
      t.bot.handlers(() => undefined).invites({ guildId: 'g' } as never),
    ).rejects.toThrow(/isn’t in this server/);
  });

  it('applies reward roles after a bonus from the dashboard', async () => {
    const t = setup({ rewards: [{ id: 'a', invites: 2, role: '701' }] });
    invBonus(
      t.db,
      'g',
      { id: '1', name: 'r', avatar: '' },
      3,
      { id: '9', name: 'q' },
      0,
    );
    await t.handlers['invites-rewards']({
      guildId: 'g',
      payload: { userIds: ['1'] },
    } as never);
    expect(t.rest.put).toHaveBeenCalledWith(
      '/guilds/g/members/1/roles/701',
      {},
      expect.any(String),
    );
    expect(listInvLog(t.db, 'g')[0]).toMatchObject({
      action: 'reward-given',
      detail: '@Recruiter for 2 invites (now 3)',
    });
  });
});

describe('/invites in a server', () => {
  it('answers view, leaderboard, who and list', async () => {
    const t = setup();
    await t.bot.syncAll(() => true);
    t.discord.uses = 1;
    await t.bot.joined(t.member('50'));
    expect(await t.run(t.use('view', { member: { id: '1' } }))).toBe(
      '📨 <@1> has **1** invite: 1 regular, 0 left, 0 fake and 0 bonus.',
    );
    expect(await t.run(t.use('leaderboard'))).toMatch(
      /\*\*1\.\*\* <@1> · \*\*1\*\*/,
    );
    expect(await t.run(t.use('who', { member: { id: '50' } }))).toMatch(
      /<@50> was invited by <@1> with `abc`/,
    );
    expect(await t.run(t.use('list', { member: { id: '1' } }))).toMatch(
      /Members <@1> invited/,
    );
  });

  it('lets only staff give bonuses and reset', async () => {
    const t = setup();
    const kit = {
      id: '50',
      bot: false,
      username: 'kit',
      globalName: null,
      displayAvatarURL: () => '',
    };
    expect(await t.run(t.use('bonus', { member: kit, amount: 3 }))).toBe(
      'Only staff can change invite counts.',
    );
    expect(
      await t.run(
        t.use('bonus', { member: kit, amount: 3 }, { manager: true }),
      ),
    ).toBe('Gave <@50> 3 bonus invites. They have **3** now.');
    expect(
      await t.run(
        t.use('bonus', { member: kit, amount: -1 }, { manager: true }),
      ),
    ).toBe('Took <@50> away 1 bonus invite. They have **2** now.');
    expect(
      await t.run(
        t.use('bonus', { member: kit, amount: 0 }, { manager: true }),
      ),
    ).toMatch(/but not 0/);
    expect(await t.run(t.use('reset', {}, { manager: true }))).toMatch(
      /Pick a member, or set everyone/,
    );
    expect(
      await t.run(t.use('reset', { member: kit }, { manager: true })),
    ).toBe('Reset <@50>’s invites. Who they invited is kept.');
    expect(invCountsOf(t.db, 'g', '50').total).toBe(0);
    expect(
      await t.run(t.use('reset', { everyone: true }, { manager: true })),
    ).toBe('Reset everyone’s invites. Who invited whom is kept.');
  });

  it('only answers its own, renamed commands, and nothing while off', () => {
    const t = setup();
    type Command = Parameters<typeof t.bot.command>[0];
    expect(
      t.bot.command(
        t.use('view', {}, { name: 'birthday' }) as unknown as Command,
      ),
    ).toBe(false);
    const c = invDefault('100');
    c.commands.group.name = 'inv';
    c.commands.view.on = false;
    writeModule(t.db, 'g', INV_MODULE, { on: true, config: c }, 0);
    expect(
      t.bot.command(t.use('view', {}, { name: 'inv' }) as unknown as Command),
    ).toBe(false);
    writeModule(t.db, 'g', INV_MODULE, { on: false }, 0);
    expect(t.bot.command(t.use('leaderboard') as unknown as Command)).toBe(
      false,
    );
  });
});

describe('per-server commands', () => {
  it('registers invites with the other modules’ commands', () => {
    const t = setup();
    writeModule(
      t.db,
      'g',
      BD_MODULE,
      { on: true, config: bdDefault('100') },
      0,
    );
    expect(guildCommandBodies(t.db, 'g').map((c) => c.name)).toEqual([
      'birthday',
      'invites',
    ]);
  });
});
