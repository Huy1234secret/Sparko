import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import {
  SG_MODULE,
  getSuggestion,
  listSgLog,
  listSuggestions,
  sgAccept,
  sgDefault,
  sgDelete,
  sgMessageDeleted,
  sgSetStatus,
  sgStorage,
  sgSubmit,
  sgSweep,
  sgVote,
  type Suggestions,
} from './sg-store.ts';

const G = '1000';
const D = 86_400_000;
const author = {
  id: '500',
  name: 'ayo',
  avatar: 'https://cdn.discordapp.com/a.png',
  roles: [] as string[],
};
const staff = { id: '42', name: 'rhea', avatar: '' };

function setup(patch: Partial<Suggestions> = {}) {
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
    SG_MODULE,
    { on: true, config: { ...sgDefault('100'), ...patch } },
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

const submit = (
  t: ReturnType<typeof setup>,
  patch: Partial<Parameters<typeof sgSubmit>[2]> = {},
  now = 100 * D,
) =>
  sgSubmit(
    t.rest,
    t.db,
    {
      guildId: G,
      author,
      created: 0,
      title: 'Movie nights',
      body: 'Every Friday in voice, please.',
      files: [],
      ...patch,
    },
    now,
  );

describe('suggesting', () => {
  it('posts the suggestion with its vote buttons and logs it', async () => {
    const t = setup();
    const r = await submit(t);
    expect(r).toMatchObject({ ok: true, number: 1, review: false });
    const post = t.calls.find((c) => c.path === '/channels/100/messages')!;
    expect(JSON.stringify(post.body)).toContain('sg:up');
    expect(getSuggestion(t.db, G, 1)).toMatchObject({
      status: 'open',
      messageId: '900',
      channelId: '100',
    });
    expect(listSgLog(t.db, G)[0]).toMatchObject({
      action: 'posted',
      number: 1,
    });
    expect(sgStorage(t.db, G)).toMatchObject({ count: 1, usedKb: 4 });
  });

  it('refuses duplicates, short ones, and the cooldown', async () => {
    const t = setup({ cooldown: '1h' });
    await submit(t);
    expect(await submit(t, {}, 100 * D + 2 * 3_600_000)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/same as suggestion #1/),
    });
    expect(
      await submit(t, { title: 'x', body: 'Something else' }, 100 * D + 60_000),
    ).toMatchObject({ ok: false, problem: expect.stringMatching(/again/) });
    expect(
      await submit(t, { title: 'x', body: 'short' }, 101 * D),
    ).toMatchObject({ ok: false, problem: expect.stringMatching(/at least/) });
    expect(listSgLog(t.db, G)[0]!.action).toBe('refused');
  });

  it('adds reactions and a thread when set', async () => {
    const t = setup({
      threads: true,
      vote: { ...sgDefault().vote, kind: 'reaction' },
    });
    await submit(t);
    expect(t.calls.filter((c) => c.method === 'PUT').length).toBe(2);
    expect(
      t.calls.some((c) => c.path === '/channels/100/messages/900/threads'),
    ).toBe(true);
    expect(getSuggestion(t.db, G, 1)!.threadId).toBe('901');
  });

  it('keeps nothing when Discord refuses the post', async () => {
    const t = setup();
    (t.rest.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DiscordError(403, 50013, 'Missing Permissions'),
    );
    const r = await submit(t);
    expect(r).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/can’t post/),
    });
    expect(getSuggestion(t.db, G, 1)).toBeNull();
  });
});

describe('review', () => {
  it('sends it to staff first, then posts it when accepted', async () => {
    const t = setup({ review: '200' });
    const r = await submit(t);
    expect(r).toMatchObject({ ok: true, review: true });
    const review = t.calls[0]!;
    expect(review.path).toBe('/channels/200/messages');
    expect(JSON.stringify(review.body)).toContain('sg:accept:1');
    expect(JSON.stringify(review.body)).not.toContain('sg:up');
    expect(sgVote(t.db, G, 1, { id: '7' }, 1)).toMatchObject({ ok: false });
    await sgAccept(t.rest, t.db, G, 1, staff);
    expect(getSuggestion(t.db, G, 1)).toMatchObject({
      status: 'open',
      channelId: '100',
    });
    expect(listSgLog(t.db, G)[0]!.action).toBe('accepted');
  });

  it('denying from review never posts it', async () => {
    const t = setup({ review: '200' });
    await submit(t);
    await sgSetStatus(t.rest, t.db, {
      guildId: G,
      number: 1,
      status: 'denied',
      reason: 'Not this season',
      staff,
    });
    expect(t.calls.some((c) => c.path === '/channels/100/messages')).toBe(
      false,
    );
    expect(getSuggestion(t.db, G, 1)).toMatchObject({
      status: 'denied',
      messageId: null,
    });
  });
});

describe('voting', () => {
  it('counts votes, takes them back, and switches them', async () => {
    const t = setup();
    await submit(t);
    expect(sgVote(t.db, G, 1, { id: '7' }, 1)).toMatchObject({
      ok: true,
      vote: 1,
    });
    expect(sgVote(t.db, G, 1, { id: '8' }, -1)).toMatchObject({ vote: -1 });
    expect(sgVote(t.db, G, 1, { id: '7' }, -1)).toMatchObject({
      vote: -1,
      was: 1,
    });
    expect(sgVote(t.db, G, 1, { id: '8' }, -1)).toMatchObject({ vote: 0 });
    expect(getSuggestion(t.db, G, 1)).toMatchObject({ up: 0, down: 1 });
  });

  it('follows the vote rules', async () => {
    const t = setup({ changeVotes: false });
    await submit(t);
    expect(sgVote(t.db, G, 1, { id: author.id }, 1)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/own/),
    });
    sgVote(t.db, G, 1, { id: '7' }, 1);
    expect(sgVote(t.db, G, 1, { id: '7' }, -1)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/can’t be changed/),
    });
  });

  it('says when the votes reach auto-approve', async () => {
    const t = setup({ autoApprove: 2 });
    await submit(t);
    sgVote(t.db, G, 1, { id: '7' }, 1);
    expect(sgVote(t.db, G, 1, { id: '8' }, 1)).toMatchObject({
      auto: 'approved',
    });
  });
});

describe('statuses', () => {
  it('sets the status with its reason, DMs the author, and edits the post', async () => {
    const t = setup();
    await submit(t);
    const { problems } = await sgSetStatus(t.rest, t.db, {
      guildId: G,
      number: 1,
      status: 'approved',
      reason: 'Starting next week',
      staff,
    });
    expect(problems).toEqual([]);
    expect(getSuggestion(t.db, G, 1)!.reason).toMatchObject({
      text: 'Starting next week',
      byName: 'rhea',
    });
    expect(t.calls.some((c) => c.path === '/users/@me/channels')).toBe(true);
    const edit = t.calls.find(
      (c) => c.method === 'PATCH' && c.path === '/channels/100/messages/900',
    )!;
    expect(JSON.stringify(edit.body)).toContain('Status: Approved');
    expect(listSgLog(t.db, G)[0]).toMatchObject({
      action: 'status',
      detail: 'Approved',
    });
  });

  it('closes and blacklists when the status says so', async () => {
    const t = setup({
      blacklist: '66',
      threads: true,
      statuses: [
        ...sgDefault().statuses,
        {
          id: 'spam',
          name: 'Spam',
          color: '#4E5058',
          actions: [
            { id: 'a', type: 'close' },
            { id: 'b', type: 'blacklist' },
          ],
        },
      ],
    });
    await submit(t);
    await sgSetStatus(t.rest, t.db, {
      guildId: G,
      number: 1,
      status: 'spam',
      reason: 'Spam',
      staff,
    });
    expect(getSuggestion(t.db, G, 1)!.closed).toBe(true);
    expect(
      t.calls.some((c) => c.path === `/guilds/${G}/members/500/roles/66`),
    ).toBe(true);
    expect(sgVote(t.db, G, 1, { id: '7' }, 1)).toMatchObject({ ok: false });
  });
});

describe('deleting and closing', () => {
  it('posts it again when someone without the role deletes it', async () => {
    const t = setup();
    await submit(t);
    sgVote(t.db, G, 1, { id: '7' }, 1);
    expect(
      await sgMessageDeleted(t.rest, t.db, '900', {
        id: '9',
        name: 'kit',
        allowed: false,
      }),
    ).toBe('resent');
    expect(getSuggestion(t.db, G, 1)).toMatchObject({
      messageId: '901',
      up: 1,
    });
    expect(listSgLog(t.db, G)[0]!.action).toBe('resent');
  });

  it('forgets it when someone with the role deletes it', async () => {
    const t = setup();
    await submit(t);
    expect(
      await sgMessageDeleted(t.rest, t.db, '900', {
        id: '42',
        name: 'rhea',
        allowed: true,
      }),
    ).toBe('deleted');
    expect(getSuggestion(t.db, G, 1)).toBeNull();
  });

  it('deletes from the dashboard and lists by search', async () => {
    const t = setup();
    await submit(t);
    await submit(
      t,
      { title: 'Art contest', body: 'A monthly art contest!' },
      101 * D,
    );
    expect(
      listSuggestions(t.db, G, { query: 'art' }).map((s) => s.number),
    ).toEqual([2]);
    expect(
      listSuggestions(t.db, G, { query: '#1' }).map((s) => s.number),
    ).toEqual([1]);
    expect(await sgDelete(t.rest, t.db, G, 1, staff)).toBe(true);
    expect(listSuggestions(t.db, G).map((s) => s.number)).toEqual([2]);
  });

  it('closes voting once the auto-close time passes', async () => {
    const t = setup({ autoClose: '7d' });
    await submit(t);
    expect(await sgSweep(t.rest, t.db, G, 106 * D)).toBe(0);
    expect(await sgSweep(t.rest, t.db, G, 107 * D)).toBe(1);
    expect(getSuggestion(t.db, G, 1)!.closed).toBe(true);
    expect(listSgLog(t.db, G)[0]!.action).toBe('closed');
  });
});
