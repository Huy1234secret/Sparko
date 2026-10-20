import { PermissionFlagsBits as P } from 'discord.js';
import {
  BD_MODULE,
  bdDefault,
  listTvLog,
  openDb,
  TV_MODULE,
  tvDefault,
  tvNewHub,
  tvRoom,
  tvRooms,
  upsertGuild,
  writeModule,
  type Rest,
  type TempVoice,
  type TvRoom,
} from '@sparko/core';
import { describe, expect, it, vi } from 'vitest';
import { pickMessage, roomForm, tempVoiceBot } from './temp-voice.ts';
import { guildCommandBodies } from './guild-commands.ts';

const G = '1000';
const BOT = '9';
const HUB = '700';

const member = (
  id: string,
  voice: string | null = null,
  roles: string[] = [],
) => ({
  id,
  displayName: `member${id}`,
  user: { id, bot: false, username: `user${id}` },
  roles: { cache: new Map(roles.map((r) => [r, {}])) },
  voice: { channelId: voice },
});

function setup(patch: Partial<TempVoice> = {}, on = true) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    { id: G, name: 'G', icon: null, memberCount: 1, installed: true },
    0,
  );
  const config = { ...tvDefault(), hubs: [tvNewHub('h1', HUB)], ...patch };
  writeModule(db, G, TV_MODULE, { on, config }, 0);
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let next = 900;
  const run = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    return { id: String(next++) };
  };
  const rest = {
    post: vi.fn((p: string, b: unknown) => run('POST', p, b)),
    patch: vi.fn((p: string, b: unknown) => run('PATCH', p, b)),
    put: vi.fn((p: string, b: unknown) => run('PUT', p, b)),
    delete: vi.fn((p: string) => run('DELETE', p)),
    get: vi.fn((p: string) => run('GET', p)),
  } as unknown as Rest;
  const perms = new Set<bigint>([
    P.ManageChannels,
    P.ManageRoles,
    P.MoveMembers,
  ]);
  const channels = new Map<string, unknown>();
  const voiceChannel = (id: string, people: string[], parentId = '600') => {
    const ch = {
      id,
      type: 2,
      parentId,
      isVoiceBased: () => true,
      members: new Map(people.map((p) => [p, member(p, id)])),
    };
    channels.set(id, ch);
    return ch;
  };
  channels.set('600', {
    id: '600',
    type: 4,
    isVoiceBased: () => false,
    permissionOverwrites: {
      cache: new Map([
        [
          '400',
          {
            id: '400',
            type: 0,
            allow: { bitfield: 1024n },
            deny: { bitfield: 0n },
          },
        ],
      ]),
    },
  });
  voiceChannel(HUB, []);
  const guild = {
    id: G,
    premiumTier: 0,
    channels: { cache: channels },
    members: {
      me: { id: BOT, permissions: { has: (p: bigint) => perms.has(p) } },
      cache: new Map<string, unknown>(),
      fetch: async () => null,
    },
    client: { user: { id: BOT } },
  };
  const bot = tempVoiceBot(db, rest, { appId: () => 'app' });
  const state = (channelId: string | null, who = member('50', channelId)) =>
    ({ channelId, guild, member: who }) as never;
  /** A click, pick, form or command from a member. */
  const ask = (
    who: ReturnType<typeof member>,
    more: Record<string, unknown> = {},
  ) => {
    const i = {
      guildId: G,
      guild,
      client: guild.client,
      channelId: '100',
      channel: { parentId: '600' },
      user: who.user,
      member: who,
      deferred: false,
      replied: false,
      isButton: () => false,
      isUserSelectMenu: () => false,
      reply: vi.fn(async () => {
        i.replied = true;
      }),
      deferReply: vi.fn(async () => {
        i.deferred = true;
      }),
      deferUpdate: vi.fn(async () => {
        i.deferred = true;
      }),
      editReply: vi.fn(async () => {}),
      showModal: vi.fn(async () => {}),
      ...more,
    };
    return i;
  };
  /** What the member was told. */
  const told = (i: ReturnType<typeof ask>) => {
    const last =
      (
        i.editReply.mock.calls.at(-1) as unknown as [{ content: string }]
      )?.[0] ??
      (i.reply.mock.calls.at(-1) as unknown as [{ content: string }])?.[0];
    return last?.content;
  };
  return {
    db,
    rest,
    calls,
    perms,
    guild,
    channels,
    voiceChannel,
    bot,
    state,
    ask,
    told,
  };
}

const makeRoom = async (t: ReturnType<typeof setup>, owner = '50') => {
  await t.bot.voice(
    t.state(null, member(owner)),
    t.state(HUB, member(owner, HUB)),
  );
  const room = tvRooms(t.db, G).find((r) => r.ownerId === owner)!;
  t.voiceChannel(room.channelId, [owner]);
  await t.bot.voice(
    t.state(HUB, member(owner, HUB)),
    t.state(room.channelId, member(owner, room.channelId)),
  );
  return tvRoom(t.db, room.channelId)!;
};

describe('menus and forms', () => {
  const room: TvRoom = {
    channelId: '900',
    guildId: G,
    ownerId: '50',
    ownerName: 'rhea',
    hubId: 'h1',
    name: 'Den',
    limit: 3,
    locked: false,
    hidden: false,
    chat: true,
    trusted: ['51'],
    blocked: [],
    members: 2,
    state: 'open',
    emptySince: null,
    createdAt: 0,
  };
  const ctx = {
    names: (id: string) => `member${id}`,
    present: ['50', '52'],
    boostLevel: 1,
  };

  it('fills the rename and limit forms with what the room has', () => {
    expect(roomForm('rename', room).components[0]!.components[0]).toMatchObject(
      {
        custom_id: 'value',
        value: 'Den',
        max_length: 100,
      },
    );
    expect(roomForm('limit', room)).toMatchObject({
      custom_id: 'tv:modal:limit',
      components: [{ components: [{ value: '3', max_length: 2 }] }],
    });
  });

  it('asks who, or which region or bitrate', () => {
    expect(pickMessage('trust', room, ctx)).toMatchObject({
      components: [
        {
          components: [{ type: 5, custom_id: 'tv:pick:trust', max_values: 10 }],
        },
      ],
    });
    expect(pickMessage('transfer', room, ctx)).toMatchObject({
      components: [{ components: [{ max_values: 1 }] }],
    });
    expect(pickMessage('untrust', room, ctx)).toMatchObject({
      components: [
        {
          components: [
            { type: 3, options: [{ label: 'member51', value: '51' }] },
          ],
        },
      ],
    });
    expect(pickMessage('unblock', room, ctx)).toBe(
      'You haven’t blocked anyone.',
    );
    expect(pickMessage('kick', room, ctx)).toMatchObject({
      components: [{ components: [{ options: [{ value: '52' }] }] }],
    });
    expect(pickMessage('kick', room, { ...ctx, present: ['50'] })).toBe(
      'Nobody else is in your room.',
    );
    const bitrate = pickMessage('bitrate', room, ctx) as {
      content: string;
      components: { components: { options: { value: string }[] }[] }[];
    };
    expect(bitrate.content).toMatch(/up to 128 kbps/);
    expect(bitrate.components[0]!.components[0]!.options.at(-1)!.value).toBe(
      '128',
    );
    const region = pickMessage('region', room, ctx) as typeof bitrate;
    expect(region.components[0]!.components[0]!.options[0]!.value).toBe(
      'automatic',
    );
  });
});

describe('hubs and cleaning up', () => {
  it('makes a room when someone joins a hub, inside the hub’s category', async () => {
    const t = setup();
    const room = await makeRoom(t);
    const create = t.calls.find((c) => c.path === `/guilds/${G}/channels`)!;
    expect(create.body).toMatchObject({ parent_id: '600', type: 2 });
    // The category's overwrites come along, so private categories stay private.
    expect(
      (
        create.body as { permission_overwrites: { id: string }[] }
      ).permission_overwrites.map((o) => o.id),
    ).toContain('400');
    expect(t.calls).toContainEqual({
      method: 'PATCH',
      path: `/guilds/${G}/members/50`,
      body: { channel_id: room.channelId },
    });
    expect(room).toMatchObject({ state: 'open', members: 1 });
  });

  it('deletes a room as soon as it’s empty, or waits for the delay', async () => {
    const t = setup();
    const room = await makeRoom(t);
    (
      t.channels.get(room.channelId) as { members: Map<string, unknown> }
    ).members.clear();
    await t.bot.voice(t.state(room.channelId), t.state(null));
    expect(tvRoom(t.db, room.channelId)).toBeNull();
    expect(t.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `/channels/${room.channelId}`,
    });

    const slow = setup({ deleteAfter: 30 });
    const other = await makeRoom(slow);
    (
      slow.channels.get(other.channelId) as { members: Map<string, unknown> }
    ).members.clear();
    await slow.bot.voice(slow.state(other.channelId), slow.state(null));
    expect(tvRoom(slow.db, other.channelId)?.emptySince).not.toBeNull();
  });

  it('ignores hubs while it’s off, and bots', async () => {
    const t = setup({}, false);
    await t.bot.voice(t.state(null), t.state(HUB, member('50', HUB)));
    const b = setup();
    const robot = {
      ...member('51', HUB),
      user: { id: '51', bot: true, username: 'x' },
    };
    await b.bot.voice(b.state(null, robot), b.state(HUB, robot));
    expect(t.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(0);
  });

  it('catches up after a restart', async () => {
    const t = setup();
    const kept = await makeRoom(t, '50');
    const emptied = await makeRoom(t, '51');
    const deleted = await makeRoom(t, '52');
    (
      t.channels.get(emptied.channelId) as { members: Map<string, unknown> }
    ).members.clear();
    t.channels.delete(deleted.channelId);
    // Someone waiting in the hub gets a room too.
    t.voiceChannel(HUB, ['53']);
    await t.bot.startup([t.guild as never]);
    expect(tvRoom(t.db, kept.channelId)).not.toBeNull();
    expect(tvRoom(t.db, emptied.channelId)).toBeNull();
    expect(tvRoom(t.db, deleted.channelId)).toBeNull();
    expect(
      tvRooms(t.db, G)
        .map((r) => r.ownerId)
        .sort(),
    ).toEqual(['50', '53']);
    expect(listTvLog(t.db, G).map((e) => e.detail)).toEqual(
      expect.arrayContaining(['someone deleted it in Discord', 'it was empty']),
    );
  });

  it('forgets rooms deleted in Discord', async () => {
    const t = setup();
    const room = await makeRoom(t);
    t.bot.channelDeleted(room.channelId);
    expect(tvRoom(t.db, room.channelId)).toBeNull();
  });
});

describe('the panel’s buttons', () => {
  const button = (id: string) => ({
    customId: `tv:${id}`,
    isButton: () => true,
  });

  it('only lets the owner change their room', async () => {
    const t = setup();
    const room = await makeRoom(t);
    const i = t.ask(member('51', room.channelId), button('lock'));
    await t.bot.component(i as never);
    expect(t.told(i)).toBe('Only the room’s owner can do this.');
    const lone = t.ask(member('52'), button('lock'));
    await t.bot.component(lone as never);
    expect(t.told(lone)).toMatch(/You don’t have a voice room/);
  });

  it('locks the room the owner is in', async () => {
    const t = setup();
    const room = await makeRoom(t);
    const i = t.ask(member('50', room.channelId), button('lock'));
    await t.bot.component(i as never);
    expect(t.told(i)).toMatch(/Locked/);
    expect(tvRoom(t.db, room.channelId)?.locked).toBe(true);
  });

  it('opens the rename form, and the limit form saves', async () => {
    const t = setup();
    const room = await makeRoom(t);
    const i = t.ask(member('50', room.channelId), button('rename'));
    await t.bot.component(i as never);
    expect(i.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ custom_id: 'tv:modal:rename' }),
    );
    const form = t.ask(member('50', room.channelId), {
      customId: 'tv:modal:limit',
      fields: { getTextInputValue: () => '5' },
    });
    await t.bot.modal(form as never);
    expect(t.told(form)).toBe('Up to **5** can be in your room now.');
    const bad = t.ask(member('50', room.channelId), {
      customId: 'tv:modal:limit',
      fields: { getTextInputValue: () => 'lots' },
    });
    await t.bot.modal(bad as never);
    expect(t.told(bad)).toMatch(/0 \(no limit\) to 99/);
  });

  it('asks who to trust, then trusts them', async () => {
    const t = setup();
    const room = await makeRoom(t);
    const i = t.ask(member('50', room.channelId), button('trust'));
    await t.bot.component(i as never);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: [
          expect.objectContaining({
            components: [expect.objectContaining({ type: 5 })],
          }),
        ],
      }),
    );
    const pick = t.ask(member('50', room.channelId), {
      customId: 'tv:pick:trust',
      isUserSelectMenu: () => true,
      users: new Map([['51', { id: '51', username: 'ayo', bot: false }]]),
      members: new Map([['51', { displayName: 'Ayo' }]]),
      values: ['51'],
    });
    await t.bot.component(pick as never);
    expect(pick.deferUpdate).toHaveBeenCalled();
    expect(pick.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/Trusted <@51>/),
        components: [],
      }),
    );
    expect(tvRoom(t.db, room.channelId)?.trusted).toEqual(['51']);
  });

  it('tells the owner when there’s nobody to untrust', async () => {
    const t = setup();
    const room = await makeRoom(t);
    const i = t.ask(member('50', room.channelId), button('untrust'));
    await t.bot.component(i as never);
    expect(t.told(i)).toBe('Nobody is on your trusted list.');
  });

  it('makes a room with Create room, and moves members already in voice', async () => {
    const t = setup();
    const i = t.ask(member('50', '555'), button('create'));
    await t.bot.component(i as never);
    const room = tvRooms(t.db, G)[0]!;
    expect(t.told(i)).toBe(
      `🎧 Your room is ready: <#${room.channelId}>. You’re in it now.`,
    );
    expect(room.state).toBe('waiting');
    const again = t.ask(member('50'), button('create'));
    await t.bot.component(again as never);
    expect(t.told(again)).toMatch(/You already have a room/);
    // The bypass role allows more, and they get a minute to join.
    const roles = setup({ bypassRole: '77' });
    const first = roles.ask(member('50', null, ['77']), button('create'));
    await roles.bot.component(first as never);
    const second = roles.ask(member('50', null, ['77']), button('create'));
    await roles.bot.component(second as never);
    expect(roles.told(second)).toMatch(/Join it within a minute/);
    expect(tvRooms(roles.db, G)).toHaveLength(2);
  });
});

describe('/voice', () => {
  const command = (sub: string, options: Record<string, unknown> = {}) => ({
    commandName: 'voice',
    options: {
      getSubcommand: () => sub,
      getString: (n: string) => options[n] ?? null,
      getInteger: (n: string) => options[n] ?? null,
      getUser: (n: string) => options[n] ?? null,
    },
  });

  it('runs subcommands on the member’s room', async () => {
    const t = setup();
    const room = await makeRoom(t);
    const i = t.ask(
      member('50', room.channelId),
      command('rename', { name: 'Den' }),
    );
    expect(t.bot.command(i as never)).toBe(true);
    await vi.waitFor(() =>
      expect(t.told(i)).toBe('Renamed your room to **Den**.'),
    );
    const block = t.ask(
      member('50', room.channelId),
      command('block', { member: { id: '51', username: 'ayo', bot: false } }),
    );
    t.bot.command(block as never);
    await vi.waitFor(() => expect(t.told(block)).toMatch(/Blocked <@51>/));
    const create = t.ask(
      member('51'),
      command('create', { name: 'Study', limit: 4 }),
    );
    t.bot.command(create as never);
    await vi.waitFor(() =>
      expect(t.told(create)).toMatch(/Join it within a minute/),
    );
    expect(tvRoomsOwnedName(t, '51')).toBe('Study');
  });

  it('only answers its own, renamed commands, and nothing while off', async () => {
    const t = setup({
      commands: {
        ...tvDefault().commands,
        group: { name: 'room', description: 'Rooms' },
      },
    });
    expect(t.bot.command(t.ask(member('50'), command('lock')) as never)).toBe(
      false,
    );
    const own = { ...command('lock'), commandName: 'room' };
    expect(t.bot.command(t.ask(member('50'), own) as never)).toBe(true);
    writeModule(t.db, G, TV_MODULE, { on: false }, 0);
    expect(t.bot.command(t.ask(member('50'), own) as never)).toBe(false);
  });
});

const tvRoomsOwnedName = (t: ReturnType<typeof setup>, owner: string) =>
  tvRooms(t.db, G).find((r) => r.ownerId === owner)?.name;

describe('applying settings', () => {
  it('explains missing permissions and hubs, then posts the panel', async () => {
    const t = setup({ panel: { ...tvDefault().panel, channel: '100' } });
    const apply = t.bot.handlers(() => t.guild as never)['temp-voice'];
    t.perms.delete(P.MoveMembers);
    t.perms.delete(P.ManageRoles);
    await expect(apply({ guildId: G } as never)).rejects.toThrow(
      'Sparko needs Manage Roles and Move Members to make voice rooms, lock them and move members in. Give its role those permissions in Server Settings → Roles.',
    );
    t.perms.add(P.MoveMembers);
    t.perms.add(P.ManageRoles);
    t.channels.delete(HUB);
    await expect(apply({ guildId: G } as never)).rejects.toThrow(
      /hub channel no longer exists/,
    );
    t.voiceChannel(HUB, []);
    await apply({ guildId: G } as never);
    expect(t.calls).toContainEqual(
      expect.objectContaining({
        method: 'PUT',
        path: `/applications/app/guilds/${G}/commands`,
      }),
    );
    expect(t.calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/channels/100/messages',
    });
    await expect(
      t.bot.handlers(() => undefined)['temp-voice']({ guildId: G } as never),
    ).rejects.toThrow(/isn’t in this server/);
  });

  it('closes a room for staff', async () => {
    const t = setup();
    const room = await makeRoom(t);
    await t.bot
      .handlers(() => t.guild as never)
      ['temp-voice-close']({
        guildId: G,
        payload: { channelId: room.channelId, userId: '1', userName: 'quinn' },
      } as never);
    expect(tvRoom(t.db, room.channelId)).toBeNull();
    expect(listTvLog(t.db, G)[0]).toMatchObject({
      action: 'deleted',
      detail: 'from the dashboard by @quinn',
    });
  });

  it('registers /voice with the other modules’ commands', () => {
    const t = setup();
    writeModule(t.db, G, BD_MODULE, { on: true, config: bdDefault('100') }, 0);
    expect(guildCommandBodies(t.db, G).map((c) => c.name)).toEqual([
      'birthday',
      'voice',
    ]);
  });
});
