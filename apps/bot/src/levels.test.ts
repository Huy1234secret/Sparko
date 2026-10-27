import {
  LV_MODULE,
  lvChangeXp,
  lvCrates,
  lvDefault,
  lvDropCrate,
  lvMember,
  openDb,
  upsertGuild,
  writeModule,
  type Levels,
  type Rest,
} from '@sparko/core';
import { ChannelType, MessageType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { changeText, leaderboardText, levelsBot } from './levels.ts';

describe('what the commands say', () => {
  it('lists a page of the leaderboard', () => {
    const c = lvDefault();
    expect(leaderboardText(c, { rows: [], page: 1, pages: 1 })).toMatch(
      /Nobody has any XP yet/,
    );
    const text = leaderboardText(c, {
      rows: [
        {
          rank: 1,
          userId: '1',
          name: 'rhea',
          avatar: '',
          xp: 1234,
          messages: 50,
          voiceMinutes: 0,
          level: 5,
          percent: 10,
        },
      ],
      page: 1,
      pages: 2,
    });
    expect(text).toContain('**1.** <@1> · level **5** · 1,234 XP');
    expect(text).toContain('/leaderboard page:2');
  });

  it('says what an XP change did', () => {
    expect(changeText('give', 50, '<@1>', { xp: 150, level: 1 })).toBe(
      'Gave <@1> 50 XP. They’re level **1** with **150** XP now.',
    );
    expect(changeText('set', 0, '<@1>', { xp: 0, level: 0 })).toMatch(
      /^Set <@1>’s XP to 0/,
    );
  });
});

function setup(patch: Partial<Levels> = {}) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    { id: 'g', name: 'Plaza', icon: null, memberCount: 5, installed: true },
    0,
  );
  writeModule(
    db,
    'g',
    LV_MODULE,
    { on: true, config: { ...lvDefault('100'), ...patch } },
    0,
  );
  const rest = {
    get: vi.fn(async () => ({ components: [] })),
    post: vi.fn(async () => ({ id: '900' })),
    put: vi.fn(async () => undefined),
    patch: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  } as unknown as Rest;
  const bot = levelsBot(db, rest, { appId: () => 'app' });
  const role = { name: 'Regular', position: 1 };
  const member = (id: string, voice: object = {}) => ({
    id,
    displayName: `m${id}`,
    roles: { cache: new Map() },
    permissions: { has: () => false },
    user: { bot: false, displayAvatarURL: () => '', createdTimestamp: 0 },
    voice: {
      selfMute: false,
      selfDeaf: false,
      serverMute: false,
      serverDeaf: false,
      ...voice,
    },
  });
  const voiceChannel = {
    id: '300',
    type: ChannelType.GuildVoice,
    parentId: null,
    members: new Map([
      ['1', member('1')],
      ['2', member('2', { selfMute: true })],
    ]),
  };
  const guild = {
    id: 'g',
    afkChannelId: null,
    members: {
      me: {
        permissions: { has: () => true },
        roles: { highest: { position: 5 } },
      },
      cache: new Map(),
    },
    channels: {
      cache: new Map<string, object>([
        [
          '100',
          {
            id: '100',
            name: 'general',
            permissionsFor: () => ({ has: () => true }),
          },
        ],
        ['300', voiceChannel],
      ]),
    },
    roles: {
      cache: { get: (id: string) => (id === '701' ? role : undefined) },
    },
  };
  const handlers = bot.handlers((id) =>
    id === 'g' ? (guild as never) : undefined,
  );
  return { db, rest, bot, guild, handlers, member };
}

describe('earning in the bot', () => {
  it('gives XP for members’ messages, not bots’ or Discord’s notices', async () => {
    const t = setup({ message: { on: true, min: 10, max: 10, cooldown: 0 } });
    const message = (patch: object = {}) =>
      ({
        guildId: 'g',
        channelId: '100',
        channel: { isThread: () => false },
        type: MessageType.Default,
        webhookId: null,
        author: { bot: false },
        member: t.member('1'),
        ...patch,
      }) as never;
    await t.bot.message(message());
    expect(lvMember(t.db, 'g', '1')?.xp).toBe(10);
    await t.bot.message(message({ author: { bot: true } }));
    await t.bot.message(message({ type: MessageType.GuildBoost }));
    expect(lvMember(t.db, 'g', '1')?.xp).toBe(10);
  });

  it('gives voice XP each minute to unmuted members with company', async () => {
    vi.useFakeTimers();
    try {
      const t = setup({
        voice: { on: true, perMinute: 7, needOthers: true, skipMuted: true },
      });
      t.bot.startSweep(() => true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(lvMember(t.db, 'g', '1')?.xp).toBe(7);
      expect(lvMember(t.db, 'g', '2')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('crates and commands', () => {
  it('opens a crate for the first to press, and greys the button out', async () => {
    const t = setup({
      crates: { ...lvDefault().crates, on: true, min: 30, max: 30 },
    });
    await lvDropCrate(t.rest, t.db, 'g', '100');
    const messageId = lvCrates(t.db, 'g')[0]!.messageId!;
    const press = (id: string) => ({
      guildId: 'g',
      customId: 'lv:crate',
      member: t.member(id),
      message: {
        id: messageId,
        components: [
          {
            toJSON: () => ({
              type: 1,
              components: [{ type: 2, custom_id: 'lv:crate' }],
            }),
          },
        ],
      },
      update: vi.fn(async () => {}),
      followUp: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    });
    const first = press('1');
    await t.bot.crate(first as never);
    expect(JSON.stringify(first.update.mock.calls[0])).toContain(
      'm1 got 30 XP',
    );
    expect(lvMember(t.db, 'g', '1')?.xp).toBe(30);
    const second = press('2');
    await t.bot.crate(second as never);
    expect(JSON.stringify(second.reply.mock.calls[0])).toContain('Too slow');
  });

  it('lets only staff change XP', async () => {
    const t = setup();
    lvChangeXp(t.db, 'g', { id: '5', name: 'rhea', avatar: '' }, 'give', 10, {
      id: '0',
      name: 'x',
    });
    const use = (sub: string, manager: boolean) => ({
      guildId: 'g',
      commandName: 'xp',
      user: { id: '7' },
      member: {
        displayName: 'quinn',
        roles: { cache: new Map() },
        permissions: { has: () => manager },
      },
      deferred: false,
      replied: false,
      options: {
        getSubcommand: () => sub,
        getMember: () => t.member('5'),
        getInteger: () => 90,
        getBoolean: () => null,
      },
      reply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
    });
    const no = use('give', false);
    expect(t.bot.command(no as never)).toBe(true);
    await vi.waitFor(() => expect(no.reply).toHaveBeenCalled());
    expect(JSON.stringify(no.reply.mock.calls[0])).toContain('Only staff');
    const yes = use('give', true);
    t.bot.command(yes as never);
    await vi.waitFor(() => expect(yes.reply).toHaveBeenCalled());
    expect(JSON.stringify(yes.reply.mock.calls[0])).toContain(
      'Gave <@5> 90 XP',
    );
    expect(lvMember(t.db, 'g', '5')?.xp).toBe(100);
    expect(t.bot.command({ ...yes, commandName: 'other' } as never)).toBe(
      false,
    );
  });

  it('checks reward roles when saving', async () => {
    const t = setup({ rewards: [{ id: 'a', level: 2, role: '701' }] });
    await t.handlers.levels({ guildId: 'g', payload: {} } as never);
    t.guild.members.me.roles.highest.position = 1;
    await expect(
      t.handlers.levels({ guildId: 'g', payload: {} } as never),
    ).rejects.toThrow(/Sparko can’t give @Regular/);
    await expect(
      t.bot.handlers(() => undefined).levels({ guildId: 'g' } as never),
    ).rejects.toThrow(/isn’t in this server/);
  });
});
