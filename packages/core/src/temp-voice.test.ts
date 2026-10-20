import { describe, expect, it } from 'vitest';
import { studioDefault } from './studio-format.ts';
import {
  cleanTempVoice,
  tvActs,
  tvButtonRows,
  tvCommandBodies,
  tvCommandFor,
  tvDefault,
  tvDue,
  tvHubFor,
  tvIssue,
  tvLimits,
  tvLogLine,
  tvMaxBitrate,
  tvMessageIssue,
  tvNewHub,
  tvOverwriteFor,
  tvOverwrites,
  tvPanelPayload,
  tvPerm,
  tvPresets,
  tvRoomName,
  tvUpgrade,
  type TempVoice,
  type TvRoom,
} from './temp-voice.ts';

const withHub = (patch: Partial<TempVoice> = {}): TempVoice => ({
  ...tvDefault(),
  hubs: [tvNewHub('h1', '700')],
  ...patch,
});
const room = (patch: Partial<TvRoom> = {}): TvRoom => ({
  channelId: '900',
  guildId: '1',
  ownerId: '50',
  ownerName: 'rhea',
  hubId: 'h1',
  name: 'rhea’s room',
  limit: 0,
  locked: false,
  hidden: false,
  chat: true,
  trusted: [],
  blocked: [],
  members: 0,
  state: 'open',
  emptySince: null,
  createdAt: 0,
  ...patch,
});
const ids = { guildId: '1', botId: '9', bypassRole: '' };
const bits = (o: { allow: string; deny: string } | null) =>
  o && { allow: BigInt(o.allow), deny: BigInt(o.deny) };

describe('settings', () => {
  it('accepts the defaults and a hub', () => {
    expect(tvIssue(tvDefault())).toBeNull();
    expect(tvIssue(withHub(), { voice: new Set(['700']) })).toBeNull();
    expect(tvIssue(null)).toMatchObject({ problem: /missing/ });
  });

  it('holds 1 hub on Free and 10 on Plus', () => {
    const two = withHub({
      hubs: [tvNewHub('a', '701'), tvNewHub('b', '702')],
    });
    expect(tvIssue(two, { plan: 'free' })).toEqual({
      at: 'hubs',
      problem: 'The Free plan has 1 hub. Upgrade to Plus for up to 10.',
    });
    expect(tvIssue(two, { plan: 'plus' })).toBeNull();
    expect(tvLimits('plus').hubs).toBe(10);
    const eleven = withHub({
      hubs: Array.from({ length: 11 }, (_, i) =>
        tvNewHub(`h${i}`, String(800 + i)),
      ),
    });
    expect(tvIssue(eleven, { plan: 'plus' })?.problem).toBe(
      'Use up to 10 hubs.',
    );
  });

  it('points at the hub with a problem', () => {
    const c = withHub({ hubs: [tvNewHub('h1', '')] });
    expect(tvIssue(c)).toEqual({
      at: 'hub:h1',
      problem: 'Pick the voice channel members join to get a room.',
    });
    expect(tvIssue(withHub(), { voice: new Set(['1']) })?.problem).toMatch(
      /hub channel was deleted/,
    );
    const same = withHub({
      hubs: [tvNewHub('a', '700'), tvNewHub('b', '700')],
    });
    expect(tvIssue(same, { plan: 'plus' })).toMatchObject({
      at: 'hub:b',
      problem: 'Two hubs use the same voice channel.',
    });
    const big = withHub({ hubs: [{ ...tvNewHub('h1', '700'), limit: 100 }] });
    expect(tvIssue(big)?.problem).toBe(
      'The user limit for the hub’s rooms is 0 (no limit) to 99.',
    );
    const named = withHub({ hubs: [{ ...tvNewHub('h1', '700'), name: ' ' }] });
    expect(tvIssue(named)?.problem).toMatch(/Give the hub’s rooms a name/);
    const cat = withHub({
      hubs: [{ ...tvNewHub('h1', '700'), category: '55' }],
    });
    expect(tvIssue(cat, { categories: new Set() })?.problem).toMatch(
      /category .* was deleted/,
    );
  });

  it('keeps bitrates within the server’s boosts', () => {
    const c = withHub({
      hubs: [{ ...tvNewHub('h1', '700'), bitrate: 256 }],
    });
    expect(tvIssue(c, { boostLevel: 1 })?.problem).toMatch(
      /allows up to 128 kbps/,
    );
    expect(tvIssue(c, { boostLevel: 2 })).toBeNull();
    expect(
      tvIssue({ ...c, create: { ...c.create, bitrate: 65 } })?.problem,
    ).toBe('Pick a bitrate for rooms made with Create room from the list.');
    expect([0, 1, 2, 3, 9].map(tvMaxBitrate)).toEqual([96, 128, 256, 384, 384]);
  });

  it('checks the delay, room count, bypass role and panel', () => {
    expect(tvIssue({ ...tvDefault(), deleteAfter: 61 })?.at).toBe(
      'deleteAfter',
    );
    expect(tvIssue({ ...tvDefault(), maxRooms: 0 })?.at).toBe('maxRooms');
    expect(
      tvIssue({ ...tvDefault(), bypassRole: '5' }, { roles: new Set() })
        ?.problem,
    ).toBe('The bypass role was deleted. Pick another one.');
    const d = tvDefault();
    expect(
      tvIssue({ ...d, panel: { ...d.panel, channel: '3', buttons: [] } }),
    ).toEqual({
      at: 'panel:buttons',
      problem: 'Pick at least one button for the panel.',
    });
    expect(
      tvIssue(
        { ...d, panel: { ...d.panel, message: 't1' } },
        { templates: new Set() },
      )?.at,
    ).toBe('message');
    expect(
      tvIssue({
        ...d,
        panel: { ...d.panel, buttons: ['lock', 'lock'] },
      }),
    ).toMatchObject({ problem: /missing/ });
  });

  it('checks command names', () => {
    const c = tvDefault();
    c.commands.lock.name = 'unlock';
    expect(tvIssue(c)).toEqual({
      at: 'command:unlock',
      problem: 'Two commands are called /voice unlock.',
    });
    c.commands.group.name = 'Voice!';
    expect(tvIssue(c)?.at).toBe('command:group');
  });

  it('cleans and upgrades what’s saved', () => {
    const c = withHub();
    const messy = {
      ...c,
      extra: 1,
      panel: { ...c.panel, buttons: ['delete', 'create'] as const },
      hubs: [{ ...c.hubs[0]!, name: '  Room  ', junk: true }],
    } as unknown as TempVoice;
    const clean = cleanTempVoice(messy);
    expect(clean).not.toHaveProperty('extra');
    expect(clean.hubs[0]).not.toHaveProperty('junk');
    expect(clean.hubs[0]!.name).toBe('Room');
    expect(clean.panel.buttons).toEqual(['create', 'delete']);
    const old = tvUpgrade({ hubs: [{ id: 'x', channel: '1' }] } as never);
    expect(old.hubs[0]).toMatchObject({ bitrate: 64, chat: true });
    expect(old.commands.kick.name).toBe('kick');
    expect(tvUpgrade(null)).toEqual(tvDefault());
    expect(tvHubFor(c, '700')?.id).toBe('h1');
    expect(tvHubFor(c, null)).toBeUndefined();
  });
});

describe('rooms', () => {
  it('names rooms from the pattern', () => {
    const user = { name: 'rhea' };
    expect(tvRoomName('{user.name}’s room', { user, count: 3 })).toBe(
      'rhea’s room',
    );
    expect(tvRoomName('Room #{count}', { user, count: 3 })).toBe('Room #3');
    expect(tvRoomName('   ', { user, count: 1 })).toBe('rhea’s room');
    expect(tvRoomName('x'.repeat(150), { user, count: 1 })).toHaveLength(100);
  });

  it('builds overwrites on top of the category’s', () => {
    const r = room({
      locked: true,
      hidden: true,
      chat: false,
      trusted: ['60'],
      blocked: ['61'],
    });
    const everyone = bits(tvOverwriteFor(r, { id: '1', type: 0 }, ids))!;
    expect(everyone.deny).toBe(
      tvPerm.connect | tvPerm.viewChannel | tvPerm.sendMessages,
    );
    expect(bits(tvOverwriteFor(r, { id: '60', type: 1 }, ids))!.allow).toBe(
      tvPerm.viewChannel | tvPerm.connect,
    );
    expect(bits(tvOverwriteFor(r, { id: '61', type: 1 }, ids))!.deny).toBe(
      tvPerm.connect,
    );
    // The owner and Sparko can always get in.
    expect(
      bits(tvOverwriteFor(r, { id: '50', type: 1 }, ids))!.allow &
        tvPerm.connect,
    ).toBe(tvPerm.connect);
    expect(
      bits(tvOverwriteFor(r, { id: '9', type: 1 }, ids))!.allow &
        tvPerm.moveMembers,
    ).toBe(tvPerm.moveMembers);
    // Nothing to set for someone the room doesn't know.
    expect(tvOverwriteFor(r, { id: '77', type: 1 }, ids)).toBeNull();
    // A private category stays private; unlocking keeps its deny.
    const base = [
      {
        id: '1',
        type: 0 as const,
        allow: '0',
        deny: String(tvPerm.viewChannel),
      },
      {
        id: '400',
        type: 0 as const,
        allow: String(tvPerm.viewChannel),
        deny: '0',
      },
    ];
    const open = room();
    expect(
      bits(tvOverwriteFor(open, { id: '1', type: 0 }, ids, base))!.deny,
    ).toBe(tvPerm.viewChannel);
    const all = tvOverwrites(open, { ...ids, bypassRole: '300' }, base);
    expect(all.map((o) => o.id).sort()).toEqual(['1', '300', '400', '50', '9']);
  });

  it('knows when an empty room is due', () => {
    const c = { ...tvDefault(), deleteAfter: 30 };
    expect(tvDue(c, room({ members: 1 }), 1e9)).toBe(false);
    expect(tvDue(c, room({ emptySince: 1000 }), 20_000)).toBe(false);
    expect(tvDue(c, room({ emptySince: 1000 }), 31_000)).toBe(true);
    // A new room nobody joined waits a minute.
    const waiting = room({ state: 'waiting', createdAt: 0, emptySince: 0 });
    expect(tvDue(c, waiting, 59_000)).toBe(false);
    expect(tvDue(c, waiting, 60_000)).toBe(true);
  });
});

describe('the panel', () => {
  it('appends the buttons, five to a row, after the template’s own', () => {
    const c = tvDefault();
    const rows = tvButtonRows(c) as { components: { custom_id: string }[] }[];
    expect(rows).toHaveLength(Math.ceil(c.panel.buttons.length / 5));
    expect(rows[0]!.components.map((b) => b.custom_id)).toEqual([
      'tv:create',
      'tv:rename',
      'tv:limit',
      'tv:lock',
      'tv:unlock',
    ]);
    const plain = tvButtonRows({
      ...c,
      panel: { ...c.panel, buttons: ['delete'], labels: false },
    }) as { components: object[] }[];
    expect(plain[0]!.components[0]).toEqual({
      type: 2,
      style: 4,
      custom_id: 'tv:delete',
      emoji: { name: '🗑️' },
    });
    const body = tvPanelPayload(tvPresets[0]!.message, c, {
      now: 0,
      room: { channelId: '900', name: 'Den', ownerId: '50', limit: 0 },
    }) as { components: object[]; embeds: { description: string }[] };
    expect(body.components).toHaveLength(rows.length);
    const v2 = tvPanelPayload(
      {
        ...tvPresets[2]!.message,
        v2: { ...tvPresets[2]!.message.v2, text: '{room.owner} {room.limit}' },
      },
      c,
      {
        now: 0,
        room: { channelId: '900', name: 'Den', ownerId: '50', limit: 0 },
      },
    ) as {
      components: { type: number; components?: { content?: string }[] }[];
    };
    expect(v2.components[0]!.type).toBe(17);
    expect(v2.components[0]!.components![0]!.content).toBe('<@50> No limit');
    expect(v2.components.at(-1)!.type).toBe(1);
  });

  it('leaves the template rows the buttons don’t need', () => {
    const c = tvDefault(); // 16 buttons, 4 rows
    const m = studioDefault('1');
    const button = {
      id: 'b',
      type: 'button' as const,
      label: 'Rules',
      emoji: '',
      colour: 'grey' as const,
      link: true,
      url: 'https://example.com',
      actions: [],
    };
    expect(tvMessageIssue({ ...m, components: [button] }, c)).toBeNull();
    const menu = {
      id: 'm',
      type: 'menu' as const,
      placeholder: '',
      multiple: false,
      options: [],
    };
    expect(
      tvMessageIssue({ ...m, components: [button, menu] }, c)?.problem,
    ).toBe(
      'The panel’s buttons take 4 of Discord’s five rows, so the message can have up to 1 row of its own.',
    );
    expect(
      tvMessageIssue({ ...m, layout: 'v2', components: [button, menu] }, c),
    ).toBeNull();
  });
});

describe('commands and logs', () => {
  it('registers /voice with the subcommands that are on', () => {
    const c = tvDefault();
    c.commands.group.name = 'room';
    c.commands.kick.on = false;
    c.commands.lock.name = 'close';
    const [cmd] = tvCommandBodies(c) as {
      name: string;
      options: { name: string; options: { required: boolean }[] }[];
    }[];
    expect(cmd!.name).toBe('room');
    expect(cmd!.options).toHaveLength(tvActs.length - 1);
    expect(cmd!.options.map((o) => o.name)).toContain('close');
    expect(tvCommandFor(c, 'room', 'close')).toBe('lock');
    expect(tvCommandFor(c, 'room', 'kick')).toBeUndefined();
    expect(tvCommandFor(c, 'voice', 'close')).toBeUndefined();
    for (const k of tvActs) c.commands[k].on = false;
    expect(tvCommandBodies(c)).toEqual([]);
  });

  it('writes log lines', () => {
    const e = {
      id: '1',
      roomId: '9',
      roomName: 'Den',
      userId: '5',
      userName: 'rhea',
      detail: '',
      at: 0,
    };
    expect(
      tvLogLine({ ...e, action: 'created', detail: 'joined the hub' }),
    ).toBe('[CREATED] @rhea got “Den”: joined the hub');
    expect(tvLogLine({ ...e, action: 'locked' })).toBe(
      '[LOCKED] @rhea locked “Den”',
    );
    expect(tvLogLine({ ...e, action: 'owner', detail: 'claimed' })).toBe(
      '[OWNER] “Den” now belongs to @rhea: claimed',
    );
    expect(tvLogLine({ ...e, action: 'deleted', detail: 'it was empty' })).toBe(
      '[DELETED] “Den” was deleted: it was empty',
    );
    expect(
      tvLogLine({ ...e, action: 'failed', roomName: '', detail: 'Oops.' }),
    ).toBe('[FAILED] a room: Oops.');
  });
});
