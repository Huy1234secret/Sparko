import {
  openDb,
  sgDefault,
  SG_MODULE,
  getSuggestion,
  rememberPost,
  sgDefaultMessage,
  upsertGuild,
  writeModule,
  type Rest,
} from '@sparko/core';
import { describe, expect, it, vi } from 'vitest';
import {
  filesOf,
  parseSgId,
  reasonForm,
  suggestForm,
  suggestionsBot,
} from './suggestions.ts';

describe('suggestion forms', () => {
  it('asks for a title, then enough boxes for the longest suggestion', () => {
    const boxes = (maxLength: number) =>
      suggestForm({ ...sgDefault('1'), maxLength }).components.length - 1;
    expect(boxes(3000)).toBe(1);
    expect(boxes(5000)).toBe(2);
    expect(boxes(12000)).toBe(3);
    const form = suggestForm({ ...sgDefault('1'), maxLength: 5000 });
    const second = form.components[2]!.components[0]!;
    expect(second).toMatchObject({ max_length: 1000, required: false });
  });

  it('needs a reason before a status is set', () => {
    const form = reasonForm('sg:status:4:approved', 4, 'Approved');
    expect(form.title).toBe('#4: Approved');
    expect(form.components[0]!.components[0]).toMatchObject({
      custom_id: 'reason',
      required: true,
    });
  });

  it('reads its ids', () => {
    expect(parseSgId('sg:up')).toEqual({ kind: 'vote', vote: 1 });
    expect(parseSgId('sg:status:12:planned')).toEqual({
      kind: 'status',
      number: 12,
      status: 'planned',
    });
    expect(parseSgId('sg:accept:3')).toMatchObject({
      kind: 'accept',
      number: 3,
    });
    expect(parseSgId('sp:b:1')).toBeNull();
  });

  it('sorts attachments into pictures, videos and files', () => {
    expect(
      filesOf([
        { name: 'a.png', url: 'https://x/a.png', contentType: 'image/png' },
        { name: 'b.mp4', url: 'https://x/b.mp4', contentType: 'video/mp4' },
        { name: 'c.txt', url: 'https://x/c.txt', contentType: null },
      ]).map((f) => f.kind),
    ).toEqual(['image', 'video', 'file']);
  });
});

describe('votes by reaction', () => {
  it('counts a reaction, swaps it, and takes refused ones off', async () => {
    const db = openDb(':memory:');
    upsertGuild(
      db,
      { id: 'g', name: 'G', icon: null, memberCount: 1, installed: true },
      0,
    );
    const config = sgDefault('100');
    config.vote.kind = 'reaction';
    writeModule(db, 'g', SG_MODULE, { on: true, config }, 0);
    db.prepare(
      `INSERT INTO suggestions (guild_id, number, author_id, author_name, title, body,
         dup_key, channel_id, message_id, created_at, last_at)
       VALUES ('g', 1, '5', 'ayo', 'T', 'B', 'k', '100', 'm1', 0, 0)`,
    ).run();
    const deletes: string[] = [];
    const rest = {
      delete: vi.fn(async (path: string) => deletes.push(path)),
      patch: vi.fn(async () => ({})),
      post: vi.fn(async () => ({ id: 'x' })),
      put: vi.fn(async () => {}),
    } as unknown as Rest;
    const bot = suggestionsBot(db, rest, { appId: () => 'app' });
    const at = { messageId: 'm1', channelId: '100' };
    await bot.reaction({ ...at, emoji: '👍' }, '7', true);
    expect(getSuggestion(db, 'g', 1)).toMatchObject({ up: 1, down: 0 });
    await bot.reaction({ ...at, emoji: '👎' }, '7', true);
    expect(getSuggestion(db, 'g', 1)).toMatchObject({ up: 0, down: 1 });
    // Sparko took their 👍 off; that isn't another vote.
    expect(deletes.at(-1)).toContain(`${encodeURIComponent('👍')}/7`);
    await bot.reaction({ ...at, emoji: '👍' }, '7', false);
    expect(getSuggestion(db, 'g', 1)).toMatchObject({ down: 1 });
    // The author can't vote on their own suggestion.
    await bot.reaction({ ...at, emoji: '👍' }, '5', true);
    expect(getSuggestion(db, 'g', 1)).toMatchObject({ up: 0 });
    expect(deletes.at(-1)).toContain('/5');
  });
});

describe('suggestion actions on the template’s own buttons', () => {
  const setup = () => {
    const db = openDb(':memory:');
    upsertGuild(
      db,
      { id: 'g', name: 'G', icon: null, memberCount: 1, installed: true },
      0,
    );
    writeModule(db, 'g', SG_MODULE, { on: true, config: sgDefault('100') }, 0);
    db.prepare(
      `INSERT INTO suggestions (guild_id, number, author_id, author_name, title, body,
         dup_key, channel_id, message_id, created_at, last_at)
       VALUES ('g', 1, '5', 'ayo', 'T', 'B', 'k', '100', 'm1', 0, 0)`,
    ).run();
    const button = (id: string, act: 'upvote' | 'approve') => ({
      id,
      type: 'button' as const,
      label: id,
      emoji: '',
      colour: 'grey' as const,
      link: false,
      url: '',
      actions: [{ id: `${id}-a`, type: 'suggestion' as const, act }],
    });
    rememberPost(
      db,
      'g',
      'm1',
      {
        ...sgDefaultMessage(),
        components: [
          button('up', 'upvote'),
          button('ok', 'approve'),
          { ...button('plain', 'upvote'), actions: [] },
        ],
      },
      0,
    );
    const rest = {
      patch: vi.fn(async () => ({})),
      post: vi.fn(async () => ({ id: 'x' })),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    } as unknown as Rest;
    const bot = suggestionsBot(db, rest, { appId: () => 'app' });
    const click = (customId: string, manager = false) => ({
      customId,
      guildId: 'g',
      message: { id: 'm1' },
      user: { id: '7' },
      member: {
        roles: { cache: new Map() },
        permissions: { has: () => manager },
      },
      deferred: false,
      replied: false,
      isStringSelectMenu: () => false,
      reply: vi.fn(async () => {}),
      showModal: vi.fn(async () => {}),
    });
    return { db, bot, click };
  };
  type Click = Parameters<ReturnType<typeof suggestionsBot>['studioAction']>[0];

  it('votes with an Upvote button', async () => {
    const { db, bot, click } = setup();
    expect(await bot.studioAction(click('sp:b:up') as unknown as Click)).toBe(
      true,
    );
    expect(getSuggestion(db, 'g', 1)).toMatchObject({ up: 1 });
  });

  it('asks staff for a reason before approving, and turns others away', async () => {
    const { bot, click } = setup();
    const member = click('sp:b:ok');
    await bot.studioAction(member as unknown as Click);
    expect(member.showModal).not.toHaveBeenCalled();
    expect(member.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringMatching(/staff/) }),
    );
    const staff = click('sp:b:ok', true);
    await bot.studioAction(staff as unknown as Click);
    expect(staff.showModal).toHaveBeenCalled();
  });

  it('leaves other buttons to Message Studio', async () => {
    const { bot, click } = setup();
    expect(
      await bot.studioAction(click('sp:b:plain') as unknown as Click),
    ).toBe(false);
  });
});
