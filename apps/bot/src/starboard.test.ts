import {
  getSbEntry,
  listSbLog,
  openDb,
  SB_MODULE,
  sbBoardDefault,
  sbDefault,
  sbIsBlocked,
  SG_MODULE,
  sgDefault,
  upsertGuild,
  writeModule,
  type Rest,
  type SbMessage,
  type Starboard,
} from '@sparko/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guildCommandBodies, guildsWithCommands } from './guild-commands.ts';
import {
  debouncer,
  starboardBot,
  topEmbed,
  type SbDiscord,
  type SbReaction,
} from './starboard.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100 * 86_400_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('debouncing post edits', () => {
  it('runs the first change at once, then one run for a burst', async () => {
    const runs: string[] = [];
    const q = debouncer<number>(2000, async (key, extra) => {
      runs.push(`${key}:${extra.join(',')}`);
    });
    q.schedule('a', 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(['a:1']);
    q.schedule('a', 2);
    q.schedule('a', 3);
    q.schedule('b', 9);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(['a:1', 'b:9']);
    await vi.advanceTimersByTimeAsync(1999);
    expect(runs).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual(['a:1', 'b:9', 'a:2,3']);
    // Quiet keys are forgotten.
    await vi.advanceTimersByTimeAsync(5000);
    expect(q.size()).toBe(0);
  });
});

const G = 'g';
function setup(config: Partial<Starboard> = {}) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    { id: G, name: 'G', icon: null, memberCount: 1, installed: true },
    0,
  );
  writeModule(
    db,
    G,
    SB_MODULE,
    {
      on: true,
      config: {
        ...sbDefault(),
        boards: [sbBoardDefault('100', { threshold: 2 })],
        ...config,
      },
    },
    0,
  );
  let id = 900;
  const rest = {
    get: vi.fn(async (path: string): Promise<unknown[]> => (path ? [] : [])),
    post: vi.fn(async (path: string, body: unknown) => ({
      id: String(id++),
      path,
      body,
    })),
    patch: vi.fn(async (path: string, body: unknown) => ({ path, body })),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
  const message = (messageId: string): SbMessage => ({
    id: messageId,
    channelId: '200',
    parentId: null,
    nsfw: false,
    authorId: '5',
    authorName: 'ayo',
    authorAvatar: '',
    authorBot: false,
    authorRoles: [],
    content: 'A cat in a box',
    image: '',
    length: 14,
    createdAt: Date.now(),
  });
  const discord: SbDiscord & { message: ReturnType<typeof vi.fn> } = {
    message: vi.fn(async (_g: string, _c: string, m: string) =>
      m === 'gone' ? null : message(m),
    ),
    roles: vi.fn(async () => []),
    nsfw: () => false,
  };
  const bot = starboardBot(db, rest as unknown as Rest, {
    appId: () => 'app',
    discord,
  });
  const star = (user: string, patch: Partial<SbReaction> = {}, added = true) =>
    bot.reaction(
      {
        guildId: G,
        channelId: '200',
        messageId: '300',
        emoji: '⭐',
        count: 1,
        user: { id: user, bot: false },
        ...patch,
      },
      added,
    );
  return { db, rest, discord, bot, star };
}

describe('stars from reactions', () => {
  it('posts when the threshold is reached, editing at most once in 2 seconds', async () => {
    const t = setup();
    await t.star('7');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.rest.post).not.toHaveBeenCalled();
    await t.star('8');
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.rest.post).toHaveBeenCalledTimes(1);
    expect(t.rest.post.mock.calls[0]![0]).toBe('/channels/100/messages');
    // A burst of stars becomes one edit.
    for (const u of ['9', '10', '11']) await t.star(u);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.rest.patch).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.rest.patch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(t.rest.patch.mock.calls[0]![1])).toContain('**5**');
  });

  it('counts stars on the board post for the message, once per member', async () => {
    const t = setup();
    await t.star('7');
    await t.star('8');
    await vi.advanceTimersByTimeAsync(2000);
    await t.star('7', { channelId: '100', messageId: '900' });
    expect(getSbEntry(t.db, G, 'main', '300')?.stars).toBe(2);
    await t.star('9', { channelId: '100', messageId: '900' });
    expect(getSbEntry(t.db, G, 'main', '300')?.stars).toBe(3);
    expect(t.discord.message).toHaveBeenLastCalledWith(G, '200', '300');
  });

  it('counts stars from before Sparko saw the message', async () => {
    const t = setup();
    t.rest.get.mockImplementation(async (path: string) =>
      path.includes('/messages/300/')
        ? [{ id: '7' }, { id: '8' }, { id: '9' }]
        : [],
    );
    await t.star('7', { count: 3 });
    await vi.advanceTimersByTimeAsync(0);
    expect(getSbEntry(t.db, G, 'main', '300')?.stars).toBe(3);
    expect(t.rest.post).toHaveBeenCalledTimes(1);
  });

  it('ignores other emojis, gone messages and stars off uncounted ones', async () => {
    const t = setup();
    await t.star('7', { emoji: '👍' });
    await t.star('7', {}, false);
    expect(t.discord.message).not.toHaveBeenCalled();
    await t.star('7', { messageId: 'gone' });
    expect(listSbLog(t.db, G)).toEqual([]);
  });

  it('takes posts down when reactions are cleared or the message is deleted', async () => {
    const t = setup();
    await t.star('7');
    await t.star('8');
    await vi.advanceTimersByTimeAsync(2000);
    t.bot.cleared(G, '300');
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.rest.delete).toHaveBeenCalledWith('/channels/100/messages/900');
    await t.star('7');
    await t.star('8');
    await vi.advanceTimersByTimeAsync(2000);
    await t.bot.deleted(G, '300');
    expect(t.rest.delete).toHaveBeenLastCalledWith(
      '/channels/100/messages/901',
    );
    expect(getSbEntry(t.db, G, 'main', '300')).toBeNull();
  });
});

describe('/starboard', () => {
  type Cmd = Parameters<ReturnType<typeof starboardBot>['command']>[0];
  const ask = (
    sub: string,
    options: Record<string, unknown> = {},
    { staff = false, roles = [] as string[] } = {},
  ) => {
    const i = {
      commandName: 'starboard',
      guildId: G,
      channelId: '200',
      applicationId: 'app',
      token: 'tok',
      user: { id: '42' },
      member: {
        displayName: 'rhea',
        roles: { cache: new Map(roles.map((r) => [r, {}])) },
        permissions: { has: () => staff },
      },
      deferred: false,
      replied: false,
      options: {
        getSubcommand: () => sub,
        getString: (n: string) => (options[n] as string | undefined) ?? null,
        getUser: (n: string) => options[n] ?? null,
      },
      reply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
      deferReply: vi.fn(async function (this: { deferred: boolean }) {
        this.deferred = true;
      }),
    };
    return i;
  };
  const answer = (i: ReturnType<typeof ask>) =>
    (
      i.reply.mock.calls[0] as unknown as [{ content?: string }] | undefined
    )?.[0]?.content ??
    (i.editReply.mock.calls.at(-1) as unknown as [{ content: string }])[0]
      .content;

  it('only answers its own, renamed command', async () => {
    const t = setup();
    expect(t.bot.command(ask('top') as unknown as Cmd)).toBe(true);
    const other = { ...ask('top'), commandName: 'suggest' };
    expect(t.bot.command(other as unknown as Cmd)).toBe(false);
  });

  it('shows the top messages and someone’s stats', async () => {
    const t = setup();
    await t.star('7');
    await t.star('8');
    await vi.advanceTimersByTimeAsync(2000);
    const top = ask('top');
    t.bot.command(top as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    const embed = (
      top.reply.mock.calls[0] as unknown as [
        { embeds: { description: string }[] },
      ]
    )[0].embeds[0]!;
    expect(embed.description).toContain('**1.** ⭐ **2** · <@5> in <#200>');
    expect(embed.description).toContain('> A cat in a box');
    const stats = ask('stats', { member: { id: '5' } });
    t.bot.command(stats as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(answer(stats)).toMatch(
      /received \*\*2\*\* stars and given \*\*0\*\*/,
    );
    const none = ask('top', { board: 'nope' });
    t.bot.command(none as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(answer(none)).toBe('There’s no board called “nope”.');
  });

  it('sends a random post as the board shows it', async () => {
    const t = setup();
    await t.star('7');
    await t.star('8');
    await vi.advanceTimersByTimeAsync(2000);
    const r = ask('random');
    t.bot.command(r as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.rest.patch).toHaveBeenLastCalledWith(
      '/webhooks/app/tok/messages/@original',
      expect.objectContaining({ content: expect.stringContaining('**2**') }),
    );
  });

  it('lets staff freeze and block, and nobody else', async () => {
    const t = setup({ staff: ['66'] });
    await t.star('7');
    await t.star('8');
    await vi.advanceTimersByTimeAsync(2000);
    const member = ask('freeze', { message: '300' });
    t.bot.command(member as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(answer(member)).toMatch(/Only staff/);
    const freeze = ask(
      'freeze',
      { message: 'https://discord.com/channels/1/200/300' },
      { roles: ['66'] },
    );
    t.bot.command(freeze as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(answer(freeze)).toMatch(/^Frozen/);
    expect(getSbEntry(t.db, G, 'main', '300')?.frozen).toBe(true);
    const both = ask(
      'block',
      { message: '300', member: { id: '5' } },
      { staff: true },
    );
    t.bot.command(both as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(answer(both)).toMatch(/not both/);
    const block = ask('block', { message: '300' }, { staff: true });
    t.bot.command(block as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(answer(block)).toMatch(/^Blocked/);
    expect(t.rest.delete).toHaveBeenCalledWith('/channels/100/messages/900');
    expect(sbIsBlocked(t.db, G, { messageId: '300' })).toBe(true);
    const unblock = ask('block', { message: '300' }, { staff: true });
    t.bot.command(unblock as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(answer(unblock)).toMatch(/can reach the board again/);
    const blockMember = ask(
      'block',
      { member: { id: '5', displayName: 'ayo' } },
      { staff: true },
    );
    t.bot.command(blockMember as unknown as Cmd);
    await vi.advanceTimersByTimeAsync(0);
    expect(sbIsBlocked(t.db, G, { userId: '5' })).toBe(true);
  });

  it('writes an empty top list kindly', () => {
    const c = sbDefault('1');
    expect(topEmbed(c, 'main', G, [], null).description).toBe(
      'Nothing has reached Starboard yet.',
    );
  });
});

describe('server commands', () => {
  it('registers suggestions and starboard commands together', () => {
    const t = setup();
    writeModule(t.db, G, SG_MODULE, { on: true, config: sgDefault('1') }, 0);
    const names = guildCommandBodies(t.db, G).map(
      (c) => (c as { name: string }).name,
    );
    expect(names).toContain('suggest');
    expect(names.at(-1)).toBe('starboard');
    expect(guildsWithCommands(t.db)).toEqual([G]);
    writeModule(t.db, G, SB_MODULE, { on: false }, 0);
    expect(
      guildCommandBodies(t.db, G).map((c) => (c as { name: string }).name),
    ).not.toContain('starboard');
  });
});
