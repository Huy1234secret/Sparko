import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import { SG_MODULE, sgDefault } from './sg-store.ts';
import {
  guildCommandBodies,
  suggestionCommandNames,
} from './guild-commands.ts';
import {
  QA_MODULE,
  getQuestion,
  listQaLog,
  listQuestions,
  qaAnswer,
  qaClose,
  qaDefault,
  qaDelete,
  qaForget,
  qaMarkAnswered,
  qaMeToo,
  qaMessageDeleted,
  qaReopen,
  qaSearch,
  qaStorage,
  qaSubmit,
  qaSweep,
  qaTestPost,
  type Questions,
} from './qa-store.ts';

const G = '1000';
const H = 3_600_000;
const D = 24 * H;
const asker = {
  id: '500',
  name: 'ayo',
  avatar: 'https://cdn.discordapp.com/a.png',
  roles: [] as string[],
};
const staff = { id: '42', name: 'rhea', avatar: '' };

function setup(patch: Partial<Questions> = {}) {
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
    QA_MODULE,
    { on: true, config: { ...qaDefault('100'), ...patch } },
    0,
  );
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let id = 900;
  const rest = {
    post: vi.fn(async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body });
      return { id: String(id++) };
    }),
    patch: vi.fn(async (path: string, body: unknown) => {
      calls.push({ method: 'PATCH', path, body });
      return {};
    }),
    put: vi.fn(async (path: string) => {
      calls.push({ method: 'PUT', path });
    }),
    delete: vi.fn(async (path: string) => {
      calls.push({ method: 'DELETE', path });
    }),
  } as unknown as Rest;
  return { db, rest, calls };
}
type T = ReturnType<typeof setup>;

const ask = (
  t: T,
  patch: Partial<Parameters<typeof qaSubmit>[2]> = {},
  now = 100 * D,
) =>
  qaSubmit(
    t.rest,
    t.db,
    {
      guildId: G,
      asker,
      title: 'How do I get the Artist role?',
      body: 'I posted some drawings already.',
      category: '',
      files: [],
      ...patch,
    },
    now,
  );

/** PATCH calls that lock or open a thread. */
const threadPatches = (t: T) =>
  t.calls.filter(
    (c) => c.method === 'PATCH' && /^\/channels\/\d+$/.test(c.path),
  );

describe('asking', () => {
  it('posts the question with its buttons, opens a thread and logs it', async () => {
    const t = setup();
    const r = await ask(t);
    expect(r).toMatchObject({ ok: true, number: 1, threadId: '901' });
    const post = t.calls.find((c) => c.path === '/channels/100/messages')!;
    expect(JSON.stringify(post.body)).toContain('qa:answer');
    const thread = t.calls.find(
      (c) => c.path === '/channels/100/messages/900/threads',
    )!;
    expect(thread.body).toEqual({
      name: '#1 How do I get the Artist role?',
      auto_archive_duration: 1440,
    });
    // The asker follows the thread.
    expect(
      t.calls.some((c) => c.path === '/channels/901/thread-members/500'),
    ).toBe(true);
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      status: 'open',
      messageId: '900',
      threadId: '901',
    });
    expect(listQaLog(t.db, G)[0]).toMatchObject({ action: 'asked', number: 1 });
    expect(qaStorage(t.db, G)).toMatchObject({ count: 1, usedKb: 4 });
  });

  it('keeps anonymous askers out of the post and the thread', async () => {
    const t = setup({ anonymous: true });
    await ask(t);
    const post = t.calls.find((c) => c.path === '/channels/100/messages')!;
    expect(JSON.stringify(post.body)).toContain('Anonymous');
    expect(JSON.stringify(post.body)).not.toContain('ayo');
    expect(t.calls.some((c) => c.path.includes('thread-members'))).toBe(false);
    // Staff still see who it was.
    expect(getQuestion(t.db, G, 1)!.askerName).toBe('ayo');
  });

  it('pings the role and keeps the category and files', async () => {
    const t = setup({
      ping: '77',
      categories: [{ id: 'roles', name: 'Roles', emoji: '🎭' }],
    });
    await ask(t, {
      category: 'roles',
      files: [{ name: 'a.png', url: 'https://x/a.png', kind: 'image' }],
    });
    const body = t.calls.find((c) => c.path === '/channels/100/messages')!
      .body as { content: string; allowed_mentions: unknown };
    expect(body.content).toContain('<@&77>');
    expect(body.allowed_mentions).toEqual({ parse: [], roles: ['77'] });
    expect(JSON.stringify(body)).toContain('🎭 Roles');
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      category: 'roles',
      files: [{ name: 'a.png' }],
    });
    // A category that doesn't exist is left out.
    await ask(t, { category: 'nope', title: 'Another question' }, 101 * D);
    expect(getQuestion(t.db, G, 2)!.category).toBe('');
  });

  it('refuses the blacklist, too many open, the cooldown and short details', async () => {
    const t = setup({
      blacklist: '9',
      maxOpen: 1,
      cooldown: '1h',
      minLength: 10,
    });
    expect(await ask(t, { asker: { ...asker, roles: ['9'] } })).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/can’t ask/),
    });
    expect(await ask(t, { body: 'short' })).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/at least 10/),
    });
    await ask(t);
    expect(await ask(t, {}, 100 * D + 60_000)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/ask again/),
    });
    expect(await ask(t, {}, 100 * D + 2 * H)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/1 open question/),
    });
    expect(listQaLog(t.db, G)[0]).toMatchObject({
      action: 'refused',
      detail: expect.not.stringContaining('<t:'),
    });
  });

  it('keeps nothing when Discord refuses the post', async () => {
    const t = setup();
    vi.mocked(t.rest.post).mockRejectedValueOnce(
      new DiscordError(403, 50013, 'Missing Permissions'),
    );
    expect(await ask(t)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/Create Public Threads/),
    });
    expect(getQuestion(t.db, G, 1)).toBeNull();
    expect(listQaLog(t.db, G)[0]!.action).toBe('failed');
  });

  it('is off when the module is off', async () => {
    const t = setup();
    writeModule(t.db, G, QA_MODULE, { on: false, config: qaDefault('100') }, 0);
    expect(await ask(t)).toMatchObject({ ok: false });
    expect(t.calls).toEqual([]);
  });
});

describe('answering', () => {
  it('posts the answer in the thread, shows it on the question and DMs the asker', async () => {
    const t = setup({ after: 'later', closeAfter: '1h' });
    await ask(t);
    t.calls.length = 0;
    const r = await qaAnswer(
      t.rest,
      t.db,
      { guildId: G, number: 1, text: 'Share three pieces first.', staff },
      100 * D,
    );
    expect(r).toMatchObject({ again: false, problems: [] });
    const inThread = t.calls.find((c) => c.path === '/channels/901/messages')!;
    expect(JSON.stringify(inThread.body)).toContain(
      'Share three pieces first.',
    );
    const edit = t.calls.find(
      (c) => c.method === 'PATCH' && c.path === '/channels/100/messages/900',
    )!;
    expect(JSON.stringify(edit.body)).toContain('Answered by rhea');
    expect(JSON.stringify(edit.body)).toContain('Change answer');
    expect(t.calls.some((c) => c.path === '/users/@me/channels')).toBe(true);
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      status: 'answered',
      answer: { text: 'Share three pieces first.', byName: 'rhea' },
      closeAt: 100 * D + H,
      threadClosed: false,
    });
    expect(listQaLog(t.db, G)[0]).toMatchObject({ action: 'answered' });
  });

  it('replaces the answer when staff answer again, and the log keeps both', async () => {
    const t = setup({ dm: false, after: 'never' });
    await ask(t);
    await qaAnswer(t.rest, t.db, {
      guildId: G,
      number: 1,
      text: 'First',
      staff,
    });
    t.calls.length = 0;
    const r = await qaAnswer(t.rest, t.db, {
      guildId: G,
      number: 1,
      text: 'Second',
      staff,
    });
    expect(r.again).toBe(true);
    // The answer message in the thread is edited, not posted again.
    const answerId = getQuestion(t.db, G, 1)!.answerId!;
    expect(
      t.calls.some(
        (c) =>
          c.method === 'PATCH' &&
          c.path === `/channels/901/messages/${answerId}`,
      ),
    ).toBe(true);
    expect(t.calls.some((c) => c.path === '/channels/901/messages')).toBe(
      false,
    );
    expect(getQuestion(t.db, G, 1)!.answer!.text).toBe('Second');
    expect(listQaLog(t.db, G).map((e) => [e.action, e.detail])).toEqual([
      ['reanswered', 'Second'],
      ['answered', 'First'],
      ['asked', 'How do I get the Artist role?'],
    ]);
  });

  it('closes the thread straight away when set to', async () => {
    const t = setup({ after: 'now', dm: false });
    await ask(t);
    await qaAnswer(
      t.rest,
      t.db,
      { guildId: G, number: 1, text: 'Yes', staff },
      5,
    );
    expect(threadPatches(t).at(-1)).toMatchObject({
      path: '/channels/901',
      body: { archived: true, locked: true },
    });
    expect(getQuestion(t.db, G, 1)!.threadClosed).toBe(true);
    // Answering again opens the thread for the new answer, then closes it.
    t.calls.length = 0;
    await qaAnswer(
      t.rest,
      t.db,
      { guildId: G, number: 1, text: 'No', staff },
      6,
    );
    expect(threadPatches(t).map((c) => c.body)).toEqual([
      { archived: false, locked: false },
      { archived: true, locked: true },
    ]);
  });

  it('says when the asker doesn’t take DMs', async () => {
    const t = setup();
    await ask(t);
    vi.mocked(t.rest.post).mockImplementation(async (path: string) => {
      if (path === '/users/@me/channels') throw new Error('Cannot send');
      return { id: '999' };
    });
    const r = await qaAnswer(t.rest, t.db, {
      guildId: G,
      number: 1,
      text: 'Hello',
      staff,
    });
    expect(r.problems).toEqual(['the asker doesn’t accept DMs']);
    expect(listQaLog(t.db, G)[0]!.detail).toContain('doesn’t accept DMs');
  });

  it('refuses empty answers and missing questions', async () => {
    const t = setup();
    await expect(
      qaAnswer(t.rest, t.db, { guildId: G, number: 4, text: 'Hi', staff }),
    ).rejects.toThrow(/no question #4/);
    await ask(t);
    await expect(
      qaAnswer(t.rest, t.db, { guildId: G, number: 1, text: ' ', staff }),
    ).rejects.toThrow(/Write an answer/);
  });
});

describe('closing and reopening', () => {
  it('marks a question answered, closing the thread later', async () => {
    const t = setup({ after: 'later', closeAfter: '1d' });
    await ask(t);
    await qaMarkAnswered(t.rest, t.db, G, 1, asker, 100 * D);
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      status: 'closed',
      closedBy: { id: '500' },
      closeAt: 101 * D,
      threadClosed: false,
    });
    await expect(
      qaMarkAnswered(t.rest, t.db, G, 1, asker, 100 * D),
    ).rejects.toThrow(/isn’t open/);
    expect(listQaLog(t.db, G)[0]!.action).toBe('marked');
  });

  it('closes now with /close and reopens with /reopen', async () => {
    const t = setup();
    await ask(t);
    await qaClose(t.rest, t.db, G, 1, staff);
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      status: 'closed',
      threadClosed: true,
    });
    expect(threadPatches(t).at(-1)!.body).toEqual({
      archived: true,
      locked: true,
    });
    await expect(qaClose(t.rest, t.db, G, 1, staff)).rejects.toThrow(
      /already closed/,
    );
    await qaReopen(t.rest, t.db, G, 1, staff);
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      status: 'open',
      threadClosed: false,
      answer: null,
    });
    expect(threadPatches(t).at(-1)!.body).toEqual({
      archived: false,
      locked: false,
    });
    await expect(qaReopen(t.rest, t.db, G, 1, staff)).rejects.toThrow(
      /is open/,
    );
    expect(
      listQaLog(t.db, G)
        .map((e) => e.action)
        .slice(0, 2),
    ).toEqual(['reopened', 'closed']);
  });

  it('closes an answered question’s thread without changing its status', async () => {
    const t = setup({ after: 'never', dm: false });
    await ask(t);
    await qaAnswer(t.rest, t.db, { guildId: G, number: 1, text: 'Yes', staff });
    await qaClose(t.rest, t.db, G, 1, staff);
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      status: 'answered',
      threadClosed: true,
    });
  });
});

describe('Me too', () => {
  it('counts members, takes them off again, and shows it on the button', async () => {
    const t = setup();
    await ask(t);
    expect(qaMeToo(t.db, G, 1, '7')).toEqual({ ok: true, on: true, count: 1 });
    expect(qaMeToo(t.db, G, 1, '8')).toEqual({ ok: true, on: true, count: 2 });
    expect(qaMeToo(t.db, G, 1, '7')).toEqual({ ok: true, on: false, count: 1 });
    expect(qaMeToo(t.db, G, 1, '500')).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/your own/),
    });
    expect(getQuestion(t.db, G, 1)!.meToo).toBe(1);
    await qaMarkAnswered(t.rest, t.db, G, 1, asker);
    expect(qaMeToo(t.db, G, 1, '9')).toMatchObject({ ok: false });
  });

  it('is refused when it’s off', async () => {
    const t = setup({ meToo: false });
    await ask(t);
    expect(qaMeToo(t.db, G, 1, '7')).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/turned off/),
    });
  });
});

describe('the minute sweep', () => {
  it('closes threads once their time is up', async () => {
    const t = setup({ after: 'later', closeAfter: '1h', dm: false });
    await ask(t);
    await qaAnswer(
      t.rest,
      t.db,
      { guildId: G, number: 1, text: 'Yes', staff },
      0,
    );
    expect(await qaSweep(t.rest, t.db, G, 30 * 60_000)).toBe(0);
    expect(await qaSweep(t.rest, t.db, G, H)).toBe(1);
    expect(getQuestion(t.db, G, 1)!.threadClosed).toBe(true);
    expect(threadPatches(t).at(-1)!.body).toEqual({
      archived: true,
      locked: true,
    });
    // Only once.
    expect(await qaSweep(t.rest, t.db, G, 2 * H)).toBe(0);
  });

  it('expires questions left unanswered too long', async () => {
    const t = setup({ expire: '7d' });
    await ask(t, {}, 0);
    expect(await qaSweep(t.rest, t.db, G, 6 * D)).toBe(0);
    t.calls.length = 0;
    expect(await qaSweep(t.rest, t.db, G, 7 * D)).toBe(1);
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      status: 'expired',
      threadClosed: true,
    });
    const edit = t.calls.find((c) => c.path === '/channels/100/messages/900')!;
    expect(JSON.stringify(edit.body)).toContain('Expired');
    expect(listQaLog(t.db, G)[0]).toMatchObject({
      action: 'expired',
      detail: '7d passed',
    });
  });

  it('does nothing while the module is off', async () => {
    const t = setup({ expire: '1h' });
    await ask(t, {}, 0);
    writeModule(t.db, G, QA_MODULE, { on: false, config: qaDefault('100') }, 0);
    expect(await qaSweep(t.rest, t.db, G, 5 * D)).toBe(0);
  });
});

describe('deleting', () => {
  it('takes the message, thread and data away', async () => {
    const t = setup();
    await ask(t);
    qaMeToo(t.db, G, 1, '7');
    expect(await qaDelete(t.rest, t.db, G, 1, staff)).toBe(true);
    expect(getQuestion(t.db, G, 1)).toBeNull();
    expect(
      t.calls.filter((c) => c.method === 'DELETE').map((c) => c.path),
    ).toEqual(['/channels/100/messages/900', '/channels/901']);
    expect(qaForget(t.db, G, 1, staff)).toBeNull();
    expect(listQaLog(t.db, G)[0]).toMatchObject({ action: 'deleted' });
  });

  it('marks a question deleted when its message goes in Discord', async () => {
    const t = setup();
    await ask(t);
    await qaMessageDeleted(t.rest, t.db, '900');
    expect(getQuestion(t.db, G, 1)).toMatchObject({
      status: 'deleted',
      messageId: null,
      threadClosed: true,
    });
    expect(threadPatches(t).at(-1)!.body).toEqual({
      archived: true,
      locked: true,
    });
    await expect(
      qaAnswer(t.rest, t.db, { guildId: G, number: 1, text: 'Hi', staff }),
    ).rejects.toThrow(/deleted in Discord/);
    // Other messages aren't questions.
    expect(await qaMessageDeleted(t.rest, t.db, '12345')).toBeNull();
  });
});

describe('Storage and autocomplete', () => {
  it('lists, searches and filters questions', async () => {
    const t = setup({ maxOpen: 3, dm: false });
    await ask(t, { title: 'Where are the rules?' }, 1);
    await ask(t, { title: 'How do I get roles?' }, 2);
    await ask(
      t,
      {
        title: 'Can I stream here?',
        asker: { ...asker, id: '600', name: 'kit' },
      },
      3,
    );
    await qaAnswer(t.rest, t.db, { guildId: G, number: 2, text: 'Ask', staff });
    expect(listQuestions(t.db, G).map((q) => q.number)).toEqual([3, 2, 1]);
    expect(
      listQuestions(t.db, G, { query: 'rules' }).map((q) => q.number),
    ).toEqual([1]);
    expect(
      listQuestions(t.db, G, { query: '#2' }).map((q) => q.number),
    ).toEqual([2]);
    expect(
      listQuestions(t.db, G, { query: 'kit' }).map((q) => q.number),
    ).toEqual([3]);
    expect(
      listQuestions(t.db, G, { status: 'answered' }).map((q) => q.number),
    ).toEqual([2]);
    // Open ones come first in autocomplete.
    expect(
      qaSearch(t.db, G, '', ['open', 'answered']).map((q) => q.number),
    ).toEqual([3, 1, 2]);
    expect(qaSearch(t.db, G, 'stream', ['open']).map((q) => q.number)).toEqual([
      3,
    ]);
    expect(qaSearch(t.db, G, '#1', ['open']).map((q) => q.number)).toEqual([1]);
  });

  it('refuses new questions when storage is full', async () => {
    const t = setup();
    const insert = t.db.prepare(
      `INSERT INTO questions (guild_id, number, asker_id, asker_name, title, status, created_at)
       VALUES (?, ?, '1', 'x', 't', 'answered', 0)`,
    );
    for (let n = 1; n <= 2560; n++) insert.run(G, n);
    expect(await ask(t)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/storage is full/),
    });
  });
});

describe('test messages', () => {
  it('posts a sample question without buttons or a ping', async () => {
    const t = setup({ ping: '77' });
    await qaTestPost(t.rest, t.db, G, '555', staff, 'question');
    const body = JSON.stringify(t.calls[0]!.body);
    expect(t.calls[0]!.path).toBe('/channels/555/messages');
    expect(body).toContain('This is a test of the question message');
    expect(body).not.toContain('qa:answer');
    expect(body).not.toContain('<@&77>');
    await qaTestPost(t.rest, t.db, G, '555', staff, 'answer');
    expect(JSON.stringify(t.calls[1]!.body)).toContain('Share three pieces');
  });
});

describe('server commands', () => {
  it('registers every module’s commands together, each name once', () => {
    const t = setup();
    expect(guildCommandBodies(t.db, G).map((c) => c.name)).toEqual([
      'question',
    ]);
    writeModule(t.db, G, SG_MODULE, { on: true, config: sgDefault('100') }, 0);
    const names = guildCommandBodies(t.db, G).map((c) => c.name);
    expect(names).toContain('suggest');
    expect(names).toContain('question');
    expect(suggestionCommandNames(t.db, G).has('suggest')).toBe(true);
    writeModule(t.db, G, QA_MODULE, { on: false, config: qaDefault('100') }, 0);
    expect(guildCommandBodies(t.db, G).map((c) => c.name)).not.toContain(
      'question',
    );
  });
});
