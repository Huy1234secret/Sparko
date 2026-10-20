import { describe, expect, it } from 'vitest';
import {
  cleanStarboard,
  sbBoardDefault,
  sbCommandBodies,
  sbCommandFor,
  sbDefault,
  sbFindBoard,
  sbIsStar,
  sbIssue,
  sbLimits,
  sbLogLine,
  sbMessageIssue,
  sbMilestonesPassed,
  sbParseMessage,
  sbPayload,
  sbPresets,
  sbSample,
  sbSkipReason,
  sbStarCounts,
  sbUpgrade,
  type SbLogEntry,
  type SbMessageFacts,
  type Starboard,
} from './starboard.ts';
import { pictureVariables, studioProblem } from './studio-format.ts';

const D = 86_400_000;
const valid = (patch: Partial<Starboard> = {}): Starboard => ({
  ...sbDefault('100'),
  ...patch,
});
const board = (patch: Parameters<typeof sbBoardDefault>[1] = {}) =>
  sbBoardDefault('100', patch);

describe('starboard settings', () => {
  it('accepts the defaults once a channel is picked', () => {
    expect(sbIssue(sbDefault())).toMatchObject({
      at: 'board:main/channel',
      problem: expect.stringMatching(/Pick the channel “Starboard” posts in/),
    });
    expect(sbIssue(valid())).toBeNull();
  });

  it('has 1 board on Free and up to 5 on Plus', () => {
    expect(sbLimits('free').boards).toBe(1);
    expect(sbLimits('plus').boards).toBe(5);
    const two = valid({
      boards: [
        board(),
        board({
          id: 'hof',
          name: 'Hall of fame',
          channel: '101',
          threshold: 15,
        }),
      ],
    });
    expect(sbIssue(two, { plan: 'free' })?.problem).toMatch(/1 board/);
    expect(sbIssue(two, { plan: 'plus' })).toBeNull();
    expect(sbIssue(valid({ boards: [] }))?.problem).toBe('Add a board.');
  });

  it('wants different names and channels for each board', () => {
    const same = (patch: Parameters<typeof board>[0]) =>
      sbIssue(valid({ boards: [board(), board({ id: 'b2', ...patch })] }), {
        plan: 'plus',
      });
    expect(same({ name: 'starboard', channel: '101' })).toMatchObject({
      at: 'board:b2/name',
    });
    expect(same({ name: 'Hall of fame' })).toMatchObject({
      at: 'board:b2/channel',
      problem: expect.stringMatching(/its own channel/),
    });
  });

  it('checks emojis, numbers and channel rules', () => {
    const one = (patch: Parameters<typeof board>[0]) =>
      sbIssue(valid({ boards: [board(patch)] }));
    expect(one({ emojis: [] })?.at).toBe('board:main/emojis');
    expect(one({ emojis: ['⭐', '⭐️'] })?.problem).toMatch(/same emoji twice/);
    expect(one({ emojis: ['1', '2', '3', '4', '5', '6'] })?.problem).toMatch(
      /up to 5 emojis/,
    );
    expect(one({ threshold: 0 })?.at).toBe('board:main/threshold');
    expect(one({ threshold: 1001 })?.at).toBe('board:main/threshold');
    expect(one({ maxAgeDays: 400 })?.at).toBe('board:main/maxAgeDays');
    expect(one({ minLength: 2.5 })?.at).toBe('board:main/minLength');
    expect(one({ watch: 'only' })?.problem).toMatch(/Pick the channels/);
    expect(one({ channels: ['100'] })?.problem).toMatch(/never watched/);
    expect(one({ watch: 'only', channels: ['200'] })).toBeNull();
  });

  it('checks roles and templates still exist', () => {
    const roles = new Map([['7', true]]);
    expect(sbIssue(valid({ staff: ['8'] }), { roles })?.problem).toMatch(
      /staff role was deleted/,
    );
    expect(
      sbIssue(valid({ boards: [board({ blockedRoles: ['8'] })] }), { roles })
        ?.at,
    ).toBe('board:main/blockedRoles');
    expect(
      sbIssue(valid({ boards: [board({ message: '12' })] }), {
        templates: new Set(['3']),
      })?.at,
    ).toBe('board:main/message');
  });

  it('checks command names, which only clash under /starboard', () => {
    const c = valid();
    c.commands.top.name = 'Top!';
    expect(sbIssue(c)?.at).toBe('command:top');
    const d = valid();
    d.commands.random.name = 'top';
    expect(sbIssue(d)?.problem).toBe('Two commands are called /starboard top.');
    const e = valid();
    e.commands.starboard.name = 'top';
    expect(sbIssue(e)).toBeNull();
  });

  it('keeps only known fields and fills in new ones', () => {
    const dirty = valid();
    (dirty.boards[0] as unknown as Record<string, unknown>).extra = 1;
    dirty.boards[0]!.name = '  Stars  ';
    dirty.staff = ['1', '1'];
    const clean = cleanStarboard(dirty);
    expect(clean.boards[0]).not.toHaveProperty('extra');
    expect(clean.boards[0]!.name).toBe('Stars');
    expect(clean.staff).toEqual(['1']);
    const old = sbUpgrade({
      boards: [{ id: 'main', name: 'Old', channel: '5' } as never],
    });
    expect(old.boards[0]).toMatchObject({
      name: 'Old',
      channel: '5',
      threshold: 3,
      emojis: ['⭐'],
    });
    expect(old.commands.stats.name).toBe('stats');
  });
});

const facts = (patch: Partial<SbMessageFacts> = {}): SbMessageFacts => ({
  channelId: '200',
  parentId: null,
  nsfw: false,
  authorId: '5',
  authorBot: false,
  authorRoles: [],
  length: 40,
  createdAt: 100 * D,
  ...patch,
});
const ctx = { now: 100 * D, boardNsfw: false, blocked: false };

describe('which messages and stars count', () => {
  it('skips the board’s channel, unwatched channels and NSFW', () => {
    const b = board();
    expect(sbSkipReason(b, facts(), ctx)).toBeNull();
    expect(sbSkipReason(b, facts({ channelId: '100' }), ctx)).toMatch(/own/);
    expect(sbSkipReason(board({ channels: ['200'] }), facts(), ctx)).toMatch(
      /not watched/,
    );
    // Watching only a channel covers its threads.
    expect(
      sbSkipReason(
        board({ watch: 'only', channels: ['300'] }),
        facts({ channelId: '301', parentId: '300' }),
        ctx,
      ),
    ).toBeNull();
    expect(sbSkipReason(b, facts({ nsfw: true }), ctx)).toMatch(/NSFW/);
    expect(
      sbSkipReason(b, facts({ nsfw: true }), { ...ctx, boardNsfw: true }),
    ).toBeNull();
    expect(
      sbSkipReason(board({ skipNsfw: false }), facts({ nsfw: true }), ctx),
    ).toBeNull();
  });

  it('skips old, short, bot and blocked messages', () => {
    expect(
      sbSkipReason(board({ maxAgeDays: 7 }), facts({ createdAt: 90 * D }), ctx),
    ).toMatch(/old/);
    expect(
      sbSkipReason(board({ maxAgeDays: 0 }), facts({ createdAt: 0 }), ctx),
    ).toBeNull();
    expect(
      sbSkipReason(board({ minLength: 50 }), facts({ length: 10 }), ctx),
    ).toMatch(/short/);
    expect(sbSkipReason(board(), facts({ authorBot: true }), ctx)).toMatch(
      /bot/,
    );
    expect(
      sbSkipReason(board({ allowBots: true }), facts({ authorBot: true }), ctx),
    ).toBeNull();
    expect(
      sbSkipReason(
        board({ blockedRoles: ['9'] }),
        facts({ authorRoles: ['9'] }),
        ctx,
      ),
    ).toMatch(/blocked role/);
    expect(sbSkipReason(board(), facts(), { ...ctx, blocked: true })).toBe(
      'blocked',
    );
  });

  it('counts stars by the rules', () => {
    const b = board();
    const r = { id: '7', bot: false, roles: [] };
    expect(sbStarCounts(b, r, '5', false)).toBe(true);
    expect(sbStarCounts(b, { ...r, id: '5' }, '5', false)).toBe(false);
    expect(
      sbStarCounts(board({ selfStar: true }), { ...r, id: '5' }, '5', false),
    ).toBe(true);
    expect(sbStarCounts(b, { ...r, bot: true }, '5', false)).toBe(false);
    expect(
      sbStarCounts(
        board({ ignoreBots: false }),
        { ...r, bot: true },
        '5',
        false,
      ),
    ).toBe(true);
    expect(
      sbStarCounts(
        board({ blockedRoles: ['9'] }),
        { ...r, roles: ['9'] },
        '5',
        false,
      ),
    ).toBe(false);
    expect(sbStarCounts(b, r, '5', true)).toBe(false);
  });

  it('knows its emojis, custom ones by id', () => {
    const b = board({ emojis: ['⭐', '<:gold:123>'] });
    expect(sbIsStar(b, '⭐️')).toBe(true);
    expect(sbIsStar(b, '<a:gold:123>')).toBe(true);
    expect(sbIsStar(b, '🌟')).toBe(false);
  });

  it('finds milestones passed on the way up', () => {
    expect(sbMilestonesPassed(9, 10)).toEqual([10]);
    expect(sbMilestonesPassed(8, 30)).toEqual([10, 25]);
    expect(sbMilestonesPassed(30, 20)).toEqual([]);
  });
});

describe('the board post', () => {
  const by = {
    id: '5',
    name: 'ayo',
    avatar: 'https://cdn.discordapp.com/a.png',
  };
  const entry = {
    ...sbSample(by, 100 * D, 12),
    channelId: '200',
    messageId: '300',
    image: 'https://cdn.discordapp.com/p.png',
  };

  it('fills the starboard variables and adds the jump button', () => {
    const body = sbPayload(board(), sbPresets[0]!.message, entry, {
      now: 100 * D,
      guildId: '1',
    }) as {
      content: string;
      embeds: {
        author: { name: string; icon_url: string };
        image: { url: string };
        description: string;
        fields: { value: string }[];
      }[];
      components: {
        components: { url: string; label: string; style: number }[];
      }[];
    };
    expect(body.content).toBe('⭐ **12** · <#200>');
    expect(body.embeds[0]!.author).toEqual({
      name: 'ayo',
      icon_url: 'https://cdn.discordapp.com/a.png',
    });
    expect(body.embeds[0]!.image.url).toBe('https://cdn.discordapp.com/p.png');
    expect(body.embeds[0]!.description).toContain('pixel-art');
    expect(body.embeds[0]!.fields[0]!.value).toMatch(/^<t:\d+:f>$/);
    expect(body.components.at(-1)!.components[0]).toEqual({
      type: 2,
      style: 5,
      label: 'Jump to message',
      url: 'https://discord.com/channels/1/200/300',
    });
  });

  it('leaves the picture out when there is none, and says when text is hidden', () => {
    const body = sbPayload(
      board(),
      sbPresets[2]!.message,
      { ...entry, image: '', content: null },
      { now: 100 * D, guildId: '1' },
    ) as {
      components: {
        type: number;
        components?: { type: number; content?: string }[];
      }[];
    };
    const container = body.components.find((c) => c.type === 17)!;
    expect(container.components!.some((c) => c.type === 12)).toBe(false);
    expect(JSON.stringify(container)).toContain(
      'Discord didn’t share the text',
    );
    expect(body.components.at(-1)!.type).toBe(1);
  });

  it('shows the picture in the V2 card under the text', () => {
    const body = sbPayload(board(), sbPresets[2]!.message, entry, {
      now: 100 * D,
      guildId: '1',
    }) as { components: { type: number; components?: { type: number }[] }[] };
    const inside = body.components.find((c) => c.type === 17)!.components!;
    expect(inside.map((c) => c.type)).toEqual([9, 12, 14, 10]);
  });

  it('presets are valid messages that use picture variables', () => {
    expect(pictureVariables).toContain('{message.image}');
    for (const p of sbPresets)
      expect(studioProblem({ ...p.message, channel: '1' })).toBeNull();
  });

  it('keeps one row free for the jump button', () => {
    const m = structuredClone(sbPresets[0]!.message);
    m.components = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      type: 'menu' as const,
      placeholder: '',
      options: [],
      actions: [],
    })) as never;
    expect(sbMessageIssue(m)?.problem).toMatch(/up to 4 rows/);
    expect(sbMessageIssue(sbPresets[0]!.message)).toBeNull();
  });
});

describe('commands', () => {
  it('registers one /starboard command with the subcommands that are on', () => {
    const c = valid();
    c.commands.random.on = false;
    c.commands.top.name = 'best';
    const [cmd] = sbCommandBodies(c) as {
      name: string;
      options: { name: string }[];
    }[];
    expect(cmd!.name).toBe('starboard');
    expect(cmd!.options.map((o) => o.name)).toEqual([
      'best',
      'stats',
      'freeze',
      'block',
    ]);
    expect(sbCommandFor(c, 'starboard', 'best')).toBe('top');
    expect(sbCommandFor(c, 'starboard', 'random')).toBeUndefined();
    c.commands.starboard.on = false;
    expect(sbCommandBodies(c)).toEqual([]);
    expect(sbCommandFor(c, 'starboard', 'best')).toBeUndefined();
  });

  it('finds boards and messages as people type them', () => {
    const c = valid({
      boards: [
        board(),
        board({ id: 'hof', name: 'Hall of fame', channel: '2' }),
      ],
    });
    expect(sbFindBoard(c, '')?.id).toBe('main');
    expect(sbFindBoard(c, 'hall of FAME')?.id).toBe('hof');
    expect(sbFindBoard(c, 'nope')).toBeUndefined();
    expect(
      sbParseMessage('https://discord.com/channels/1/22/333', '9'),
    ).toEqual({ channelId: '22', messageId: '333' });
    expect(sbParseMessage('333', '9')).toEqual({
      channelId: '9',
      messageId: '333',
    });
    expect(sbParseMessage('hello', '9')).toBeNull();
  });
});

describe('log lines', () => {
  const e = (patch: Partial<SbLogEntry>): SbLogEntry => ({
    id: '1',
    action: 'posted',
    boardId: 'main',
    boardName: 'Starboard',
    messageId: '3',
    channelId: '2',
    authorId: '5',
    authorName: 'ayo',
    userId: '0',
    userName: 'Sparko',
    stars: 5,
    detail: '',
    at: 0,
    ...patch,
  });
  it('says what happened in plain words', () => {
    expect(sbLogLine(e({}))).toBe(
      '[POSTED] @ayo’s message reached 5 stars on Starboard',
    );
    expect(sbLogLine(e({ action: 'milestone', stars: 25 }))).toBe(
      '[MILESTONE] @ayo’s message passed 25 stars on Starboard',
    );
    expect(sbLogLine(e({ action: 'removed', detail: 'below', stars: 1 }))).toBe(
      '[REMOVED] @ayo’s message dropped to 1 star and left Starboard',
    );
    expect(
      sbLogLine(e({ action: 'removed', detail: 'staff', userName: 'rhea' })),
    ).toMatch(/taken off Starboard by @rhea/);
    expect(
      sbLogLine(e({ action: 'blocked', messageId: '', userName: 'rhea' })),
    ).toBe('[BLOCKED] @ayo was blocked from the board by @rhea');
    expect(sbLogLine(e({ action: 'failed', detail: 'No access.' }))).toBe(
      '[FAILED] Starboard: No access.',
    );
  });
});
