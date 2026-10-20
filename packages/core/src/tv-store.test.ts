import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { guildViews } from './guild-view.ts';
import { DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import { addTemplate } from './templates.ts';
import { getPosted } from './tickets.ts';
import { studioDefault } from './studio-format.ts';
import { Plain } from './ticket-actions.ts';
import {
  TV_MODULE,
  TV_OWNER_ONLY,
  getTvPrefs,
  listTvLog,
  listTvPrefs,
  resetTvPrefs,
  tvAction,
  tvApplyPanel,
  tvClose,
  tvDefault,
  tvGone,
  tvGuilds,
  tvJoinHub,
  tvMakeRoom,
  tvNewHub,
  tvPerm,
  tvPrefsCount,
  tvPresence,
  tvReconcile,
  tvRoom,
  tvRoomCount,
  tvRooms,
  tvRoomsOwned,
  tvSweep,
  type TempVoice,
  type TvRoom,
} from './tv-store.ts';

const G = '1000';
const BOT = '9';
const rhea = { id: '50', name: 'rhea' };
const ayo = { id: '51', name: 'ayo' };
const kit = { id: '52', name: 'kit' };

function setup(patch: Partial<TempVoice> = {}, on = true) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    {
      id: G,
      name: 'Pixel Plaza',
      icon: null,
      memberCount: 10,
      installed: true,
    },
    0,
  );
  writeModule(
    db,
    G,
    TV_MODULE,
    {
      on,
      config: { ...tvDefault(), hubs: [tvNewHub('h1', '700')], ...patch },
    },
    0,
  );
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let id = 900;
  let fail: ((method: string, path: string) => Error | null) | null = null;
  const run = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const e = fail?.(method, path);
    if (e) throw e;
    return { id: String(id++) };
  };
  const rest = {
    post: vi.fn((p: string, b: unknown) => run('POST', p, b)),
    patch: vi.fn((p: string, b: unknown) => run('PATCH', p, b)),
    put: vi.fn((p: string, b: unknown) => run('PUT', p, b)),
    delete: vi.fn((p: string) => run('DELETE', p)),
    get: vi.fn((p: string) => run('GET', p)),
  } as unknown as Rest;
  const join = (user = rhea, now = 0, bypass = false) =>
    tvJoinHub(
      rest,
      db,
      {
        guildId: G,
        hubChannel: '700',
        user,
        parentId: '600',
        base: [],
        botId: BOT,
        boostLevel: 0,
        bypass,
      },
      now,
    );
  const act = (
    room: TvRoom,
    a: Parameters<typeof tvAction>[2]['act'],
    more: Partial<Parameters<typeof tvAction>[2]> = {},
    now = 0,
  ) =>
    tvAction(
      rest,
      db,
      {
        room: tvRoom(db, room.channelId) ?? room,
        act: a,
        by: rhea,
        present: [rhea.id],
        botId: BOT,
        boostLevel: 0,
        ...more,
      },
      now,
    );
  return {
    db,
    rest,
    calls,
    join,
    act,
    failWith: (f: typeof fail) => {
      fail = f;
    },
  };
}

describe('making rooms', () => {
  it('makes a room from a hub and moves the member in', async () => {
    const t = setup();
    const made = await t.join(rhea, 5);
    expect(made?.made).toBe(true);
    const room = made!.room;
    const create = t.calls[0]!;
    expect(create).toMatchObject({
      method: 'POST',
      path: `/guilds/${G}/channels`,
      body: {
        name: 'rhea’s room',
        type: 2,
        parent_id: '600',
        user_limit: 0,
        bitrate: 64_000,
      },
    });
    expect(t.calls[1]).toMatchObject({
      method: 'PATCH',
      path: `/guilds/${G}/members/50`,
      body: { channel_id: room.channelId },
    });
    expect(tvRoom(t.db, room.channelId)).toMatchObject({
      ownerId: '50',
      hubId: 'h1',
      state: 'waiting',
      emptySince: 5,
    });
    expect(listTvLog(t.db, G)[0]).toMatchObject({
      action: 'created',
      userName: 'rhea',
      detail: 'joined the hub',
    });
    // Moving in opens it.
    expect(tvPresence(t.db, room.channelId, 1, 9)).toMatchObject({
      state: 'open',
      members: 1,
      emptySince: null,
    });
  });

  it('moves a member who owns enough rooms into theirs', async () => {
    const t = setup();
    const first = (await t.join())!.room;
    t.calls.length = 0;
    const again = await t.join();
    expect(again).toEqual({
      room: expect.objectContaining({ channelId: first.channelId }),
      made: false,
    });
    expect(t.calls).toEqual([
      {
        method: 'PATCH',
        path: `/guilds/${G}/members/50`,
        body: { channel_id: first.channelId },
      },
    ]);
    // The bypass role allows more.
    expect((await t.join(rhea, 0, true))?.made).toBe(true);
    expect(tvRoomsOwned(t.db, G, '50')).toHaveLength(2);
  });

  it('does nothing for hubs while it’s off, or for other channels', async () => {
    const t = setup({}, false);
    expect(await t.join()).toBeNull();
    expect(t.calls).toHaveLength(0);
  });

  it('starts from saved preferences and the hub’s settings', async () => {
    const t = setup({
      hubs: [
        {
          ...tvNewHub('h1', '700'),
          name: 'Room {count}',
          limit: 4,
          hidden: true,
        },
      ],
      bypassRole: '300',
    });
    const a = (await t.join(ayo))!.room;
    expect(a.name).toBe('Room 1');
    t.db
      .prepare(
        `INSERT INTO tv_prefs (guild_id, user_id, user_name, name, user_limit, locked, trusted, blocked, updated_at)
         VALUES (?, '50', 'rhea', 'Den', 2, 1, '["52"]', '["51"]', 0)`,
      )
      .run(G);
    const r = (await t.join(rhea))!.room;
    expect(r).toMatchObject({
      name: 'Den',
      limit: 2,
      locked: true,
      hidden: true,
      trusted: ['52'],
      blocked: ['51'],
    });
    const body = t.calls.filter((c) => c.path.endsWith('/channels')).at(-1)!
      .body as {
      permission_overwrites: { id: string; allow: string; deny: string }[];
    };
    const o = Object.fromEntries(
      body.permission_overwrites.map((x) => [x.id, x]),
    );
    expect(BigInt(o[G]!.deny)).toBe(tvPerm.connect | tvPerm.viewChannel);
    expect(BigInt(o['52']!.allow)).toBe(tvPerm.viewChannel | tvPerm.connect);
    expect(BigInt(o['51']!.deny)).toBe(tvPerm.connect);
    expect(BigInt(o['300']!.allow)).toBe(tvPerm.viewChannel | tvPerm.connect);
    expect(o[BOT]).toBeDefined();
  });

  it('keeps the bitrate within the server’s boosts, and posts the panel in rooms', async () => {
    const t = setup({
      create: { ...tvDefault().create, bitrate: 256 },
      panel: { ...tvDefault().panel, inRooms: true },
    });
    const r = await tvMakeRoom(
      t.rest,
      t.db,
      {
        guildId: G,
        owner: rhea,
        style: { ...tvDefault().create, bitrate: 256 },
        hubId: '',
        parentId: null,
        base: [],
        botId: BOT,
        boostLevel: 1,
        name: 'Movie night',
        limit: 5,
        via: 'with /voice create',
      },
      0,
    );
    expect(t.calls[0]!.body).toMatchObject({
      name: 'Movie night',
      user_limit: 5,
      bitrate: 128_000,
    });
    expect(t.calls[1]).toMatchObject({
      method: 'POST',
      path: `/channels/${r.channelId}/messages`,
    });
  });

  it('explains when Sparko can’t make channels', async () => {
    const t = setup();
    t.failWith(() => new DiscordError(403, 50013, 'Missing Permissions'));
    await expect(t.join()).rejects.toThrow(
      /Manage Channels, Manage Roles and Move Members/,
    );
    expect(listTvLog(t.db, G)[0]).toMatchObject({ action: 'failed' });
    expect(tvRoomCount(t.db, G)).toBe(0);
  });
});

describe('cleaning up', () => {
  it('deletes empty rooms after the delay, and unjoined ones after a minute', async () => {
    const t = setup({ deleteAfter: 30 });
    const used = (await t.join(rhea, 0))!.room;
    const unused = (await t.join(ayo, 0))!.room;
    tvPresence(t.db, used.channelId, 2, 1000);
    tvPresence(t.db, used.channelId, 0, 10_000);
    expect(await tvSweep(t.rest, t.db, 30_000)).toBe(0);
    expect(await tvSweep(t.rest, t.db, 60_000)).toBe(2);
    expect(
      t.calls.filter((c) => c.method === 'DELETE').map((c) => c.path),
    ).toEqual([`/channels/${used.channelId}`, `/channels/${unused.channelId}`]);
    expect(tvRooms(t.db, G)).toEqual([]);
    expect(listTvLog(t.db, G)[0]).toMatchObject({
      action: 'deleted',
      detail: 'it was empty',
    });
  });

  it('cleans up even after the module is switched off, but only in servers Sparko is in', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    writeModule(t.db, G, TV_MODULE, { on: false }, 0);
    expect(tvGuilds(t.db)).toEqual([G]);
    expect(await tvSweep(t.rest, t.db, 70_000, () => false)).toBe(0);
    expect(await tvSweep(t.rest, t.db, 70_000)).toBe(1);
    expect(tvRoom(t.db, r.channelId)).toBeNull();
    expect(tvGuilds(t.db)).toEqual([]);
  });

  it('forgets rooms already deleted, and backs off when it can’t delete', async () => {
    const t = setup();
    const a = (await t.join(rhea))!.room;
    const b = (await t.join(ayo))!.room;
    t.failWith((m, p) =>
      p === `/channels/${a.channelId}`
        ? new DiscordError(404, 10003, 'Unknown Channel')
        : m === 'DELETE'
          ? new DiscordError(403, 50013, 'Missing Permissions')
          : null,
    );
    expect(await tvSweep(t.rest, t.db, 70_000)).toBe(1);
    expect(tvRoom(t.db, a.channelId)).toBeNull();
    expect(tvRoom(t.db, b.channelId)?.emptySince).toBe(70_000 + 600_000);
    expect(listTvLog(t.db, G)[0]).toMatchObject({
      action: 'failed',
      detail: expect.stringMatching(/Manage Channels/),
    });
    expect(await tvSweep(t.rest, t.db, 80_000)).toBe(0);
  });

  it('catches up after a restart', async () => {
    const t = setup({ deleteAfter: 10 });
    const kept = (await t.join(rhea))!.room;
    const left = (await t.join(ayo))!.room;
    const deleted = (await t.join(kit))!.room;
    tvPresence(t.db, kept.channelId, 1, 0);
    tvPresence(t.db, left.channelId, 2, 0);
    // While Sparko was offline: everyone left one, and one was deleted.
    const live: Record<string, number> = {
      [kept.channelId]: 3,
      [left.channelId]: 0,
    };
    expect(tvReconcile(t.db, G, (id) => live[id] ?? null, 100_000)).toBe(1);
    expect(tvRoom(t.db, deleted.channelId)).toBeNull();
    expect(tvRoom(t.db, kept.channelId)?.members).toBe(3);
    expect(tvRoom(t.db, left.channelId)?.emptySince).toBe(100_000);
    expect(await tvSweep(t.rest, t.db, 110_000)).toBe(1);
    expect(tvRooms(t.db, G).map((r) => r.channelId)).toEqual([kept.channelId]);
  });

  it('logs rooms deleted in Discord, and closes rooms for staff', async () => {
    const t = setup();
    const a = (await t.join(rhea))!.room;
    const b = (await t.join(ayo))!.room;
    expect(tvGone(t.db, a.channelId)?.channelId).toBe(a.channelId);
    expect(tvGone(t.db, a.channelId)).toBeNull();
    expect(await tvClose(t.rest, t.db, G, b.channelId, kit)).toBe(true);
    expect(await tvClose(t.rest, t.db, '1', b.channelId, kit)).toBe(false);
    expect(
      listTvLog(t.db, G)
        .slice(0, 2)
        .map((e) => e.detail),
    ).toEqual(['from the dashboard by @kit', 'someone deleted it in Discord']);
  });
});

describe('room actions', () => {
  it('lets only the owner change the room', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    await expect(t.act(r, 'lock', { by: ayo })).rejects.toThrow(TV_OWNER_ONLY);
    await expect(t.act(r, 'lock', { by: ayo })).rejects.toBeInstanceOf(Plain);
  });

  it('renames and limits, and remembers them', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    expect(await t.act(r, 'rename', { value: '  Movie   night ' })).toBe(
      'Renamed your room to **Movie night**.',
    );
    expect(t.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      path: `/channels/${r.channelId}`,
      body: { name: 'Movie night' },
    });
    await expect(t.act(r, 'limit', { value: 100 })).rejects.toThrow(
      /0 \(no limit\) to 99/,
    );
    expect(await t.act(r, 'limit', { value: 4 })).toMatch(/Up to \*\*4\*\*/);
    expect(getTvPrefs(t.db, G, '50')).toMatchObject({
      name: 'Movie night',
      limit: 4,
    });
    expect(
      listTvLog(t.db, G)
        .slice(0, 2)
        .map((e) => e.action),
    ).toEqual(['limit', 'renamed']);
    t.failWith(() => new DiscordError(429, 0, 'Too many'));
    await expect(t.act(r, 'rename', { value: 'Again' })).rejects.toThrow(
      /twice every 10 minutes/,
    );
  });

  it('doesn’t remember anything when the server says not to', async () => {
    const t = setup({ remember: false });
    const r = (await t.join())!.room;
    await t.act(r, 'lock');
    expect(getTvPrefs(t.db, G, '50')).toBeNull();
  });

  it('locks, hides and shows with @everyone’s overwrite', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    expect(await t.act(r, 'lock')).toMatch(/Locked/);
    expect(t.calls.at(-1)).toEqual({
      method: 'PUT',
      path: `/channels/${r.channelId}/permissions/${G}`,
      body: { type: 0, allow: '0', deny: String(tvPerm.connect) },
    });
    expect(await t.act(r, 'lock')).toBe('Your room is already locked.');
    await t.act(r, 'hide');
    expect(BigInt((t.calls.at(-1)!.body as { deny: string }).deny)).toBe(
      tvPerm.connect | tvPerm.viewChannel,
    );
    await t.act(r, 'unlock');
    await t.act(r, 'show');
    // Nothing left to deny, so @everyone's overwrite goes.
    expect(t.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `/channels/${r.channelId}/permissions/${G}`,
    });
    expect(
      listTvLog(t.db, G)
        .slice(0, 4)
        .map((e) => e.action),
    ).toEqual(['shown', 'unlocked', 'hidden', 'locked']);
    expect(tvRoom(t.db, r.channelId)).toMatchObject({
      locked: false,
      hidden: false,
    });
  });

  it('trusts, blocks and kicks members', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    await expect(t.act(r, 'trust', { targets: [rhea] })).rejects.toThrow(
      'Pick someone other than yourself or a bot.',
    );
    expect(await t.act(r, 'trust', { targets: [ayo] })).toMatch(
      /Trusted <@51>/,
    );
    expect(t.calls.at(-1)).toMatchObject({
      method: 'PUT',
      path: `/channels/${r.channelId}/permissions/51`,
    });
    // Blocking someone in the room takes them off the trusted list and out.
    expect(
      await t.act(r, 'block', { targets: [ayo], present: ['50', '51'] }),
    ).toMatch(/Blocked <@51>/);
    expect(t.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      path: `/guilds/${G}/members/51`,
      body: { channel_id: null },
    });
    expect(tvRoom(t.db, r.channelId)).toMatchObject({
      trusted: [],
      blocked: ['51'],
    });
    expect(getTvPrefs(t.db, G, '50')).toMatchObject({ blocked: ['51'] });
    expect(await t.act(r, 'unblock', { targets: [ayo] })).toMatch(/Unblocked/);
    // Nothing left for them, so the overwrite goes.
    expect(t.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `/channels/${r.channelId}/permissions/51`,
    });
    await expect(t.act(r, 'kick', { targets: [kit] })).rejects.toThrow(
      'They aren’t in your room.',
    );
    expect(
      await t.act(r, 'kick', { targets: [kit], present: ['50', '52'] }),
    ).toBe('👢 Disconnected <@52>.');
  });

  it('invites by DM, and gives the link to people who don’t take DMs', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    t.failWith((m, p) =>
      m === 'POST' &&
      p === '/users/@me/channels' &&
      t.calls.at(-1)?.body &&
      (t.calls.at(-1)!.body as { recipient_id: string }).recipient_id === '52'
        ? new DiscordError(403, 50007, 'Cannot send messages to this user')
        : null,
    );
    const said = await t.act(r, 'invite', { targets: [ayo, kit] });
    expect(said).toMatch(/^📨 Invited <@51>\./);
    expect(said).toMatch(
      new RegExp(
        `<@52> doesn’t take DMs, but can join now: https://discord.com/channels/${G}/${r.channelId}`,
      ),
    );
    expect(tvRoom(t.db, r.channelId)?.trusted).toEqual(['51', '52']);
  });

  it('lets someone claim a room its owner left, or the owner hand it over', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    await expect(
      t.act(r, 'claim', { by: ayo, present: ['50', '51'] }),
    ).rejects.toThrow(/owner is still in the room/);
    await expect(t.act(r, 'claim', { by: ayo, present: [] })).rejects.toThrow(
      /Join the room first/,
    );
    expect(await t.act(r, 'claim', { by: ayo, present: ['51'] })).toBe(
      '👑 The room is yours now.',
    );
    expect(tvRoom(t.db, r.channelId)?.ownerId).toBe('51');
    await expect(
      t.act(r, 'transfer', { by: ayo, targets: [kit], present: ['51'] }),
    ).rejects.toThrow(/have to be in your room/);
    expect(
      await t.act(r, 'transfer', {
        by: ayo,
        targets: [kit],
        present: ['51', '52'],
      }),
    ).toBe('🔁 <@52> owns the room now.');
    expect(tvRoom(t.db, r.channelId)).toMatchObject({
      ownerId: '52',
      ownerName: 'kit',
    });
    expect(listTvLog(t.db, G)[0]).toMatchObject({
      action: 'owner',
      userName: 'kit',
      detail: 'given to them by @ayo',
    });
  });

  it('sets the region and bitrate, within the server’s boosts', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    expect(await t.act(r, 'region', { value: 'japan' })).toBe(
      '🌍 Voice region: **Japan**.',
    );
    expect(t.calls.at(-1)!.body).toEqual({ rtc_region: 'japan' });
    await t.act(r, 'region', { value: 'automatic' });
    expect(t.calls.at(-1)!.body).toEqual({ rtc_region: null });
    await expect(t.act(r, 'region', { value: 'moon' })).rejects.toThrow(
      /from the list/,
    );
    await expect(t.act(r, 'bitrate', { value: 256 })).rejects.toThrow(
      /allows up to 96 kbps/,
    );
    expect(await t.act(r, 'bitrate', { value: 256, boostLevel: 2 })).toBe(
      '🎚️ Bitrate: **256 kbps**.',
    );
  });

  it('deletes the room, and forgets rooms deleted under it', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    expect(await t.act(r, 'delete')).toBe('🗑️ Deleted your room.');
    expect(tvRoom(t.db, r.channelId)).toBeNull();
    expect(listTvLog(t.db, G)[0]).toMatchObject({
      action: 'deleted',
      detail: 'by its owner',
    });
    const s = (await t.join())!.room;
    t.failWith(() => new DiscordError(404, 10003, 'Unknown Channel'));
    await expect(t.act(s, 'lock')).rejects.toThrow(
      'That room no longer exists.',
    );
    expect(tvRoom(t.db, s.channelId)).toBeNull();
  });
});

describe('saved preferences', () => {
  it('lists, searches and resets them', async () => {
    const t = setup();
    const r = (await t.join())!.room;
    await t.act(r, 'rename', { value: 'Den' });
    const a = (await t.join(ayo))!.room;
    await t.act(a, 'lock', { by: ayo });
    expect(tvPrefsCount(t.db, G)).toBe(2);
    expect(listTvPrefs(t.db, G, { query: 'den' }).map((p) => p.userId)).toEqual(
      ['50'],
    );
    expect(listTvPrefs(t.db, G, { query: '51' })[0]).toMatchObject({
      userName: 'ayo',
      locked: true,
      name: '',
    });
    expect(resetTvPrefs(t.db, G, '50')).toBe(true);
    expect(resetTvPrefs(t.db, G, '50')).toBe(false);
    expect(tvPrefsCount(t.db, G)).toBe(1);
  });
});

describe('the panel', () => {
  it('posts, edits in place, moves and takes down the panel', async () => {
    const t = setup({ panel: { ...tvDefault().panel, channel: '100' } });
    await tvApplyPanel(t.rest, t.db, G, 0);
    const first = t.calls.at(-1)!;
    expect(first).toMatchObject({
      method: 'POST',
      path: '/channels/100/messages',
    });
    const body = first.body as {
      embeds: { title: string }[];
      components: object[];
    };
    expect(body.embeds[0]!.title).toBe('🎧 Your voice room');
    expect(body.components).toHaveLength(4);
    const posted = getPosted(t.db, G, 'temp-voice-panel')!;
    await tvApplyPanel(t.rest, t.db, G, 0);
    expect(t.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      path: `/channels/100/messages/${posted.messageId}`,
    });
    // A template of the server's own.
    const id = addTemplate(
      t.db,
      {
        guildId: G,
        moduleId: 'studio',
        name: 'Mine',
        who: 'q',
        message: { ...studioDefault(''), content: 'Hello {server}' },
      },
      0,
    );
    const c = {
      ...tvDefault(),
      panel: { ...tvDefault().panel, channel: '101', message: id },
    };
    writeModule(t.db, G, TV_MODULE, { on: true, config: c }, 0);
    await tvApplyPanel(t.rest, t.db, G, 0);
    expect(t.calls.at(-2)).toMatchObject({
      method: 'DELETE',
      path: `/channels/100/messages/${posted.messageId}`,
    });
    expect(t.calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/channels/101/messages',
      body: { content: 'Hello Pixel Plaza' },
    });
    writeModule(t.db, G, TV_MODULE, { on: false }, 0);
    await tvApplyPanel(t.rest, t.db, G, 0);
    expect(t.calls.at(-1)!.method).toBe('DELETE');
    expect(getPosted(t.db, G, 'temp-voice-panel')).toBeUndefined();
  });

  it('posts again when the panel was deleted, and explains refusals', async () => {
    const t = setup({ panel: { ...tvDefault().panel, channel: '100' } });
    await tvApplyPanel(t.rest, t.db, G, 0);
    t.failWith((m) =>
      m === 'PATCH' ? new DiscordError(404, 10008, 'Unknown Message') : null,
    );
    await tvApplyPanel(t.rest, t.db, G, 0);
    expect(t.calls.at(-1)).toMatchObject({ method: 'POST' });
    t.failWith(() => new DiscordError(403, 50013, 'Missing Permissions'));
    await expect(tvApplyPanel(t.rest, t.db, G, 0)).rejects.toThrow(
      /can’t post the voice panel/,
    );
  });
});

describe('the server view', () => {
  it('lists voice channels and categories for hubs', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/users/@me') return { id: BOT };
      if (path.endsWith('/channels'))
        return [
          { id: '600', type: 4, name: 'Voice', position: 1, parent_id: null },
          { id: '601', type: 4, name: 'Games', position: 0, parent_id: null },
          {
            id: '700',
            type: 2,
            name: 'Join to create',
            position: 0,
            parent_id: '600',
          },
          { id: '701', type: 2, name: 'Lobby', position: 0, parent_id: null },
          { id: '100', type: 0, name: 'general', position: 0, parent_id: null },
        ];
      if (path.includes('/members/')) return { roles: [] };
      return { id: G, owner_id: '1', roles: [] };
    });
    const v = await guildViews({ get } as unknown as Rest).get(G);
    expect(v.voice).toEqual([
      { id: '701', name: 'Lobby', category: 'No category', stage: false },
      { id: '700', name: 'Join to create', category: 'Voice', stage: false },
    ]);
    expect(v.categories).toEqual([
      { id: '601', name: 'Games' },
      { id: '600', name: 'Voice' },
    ]);
    expect(v.channels.map((c) => c.id)).toEqual(['100']);
  });
});
