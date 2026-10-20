import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError, type Rest } from './discord.ts';
import { upsertGuild, writeModule } from './store.ts';
import {
  POLL_MODULE,
  findPolls,
  getPoll,
  listPollLog,
  listPolls,
  pollClose,
  pollCreate,
  pollDefault,
  pollEnd,
  pollForget,
  pollPost,
  pollRefresh,
  pollRemoveMessage,
  pollReroll,
  pollRulesFrom,
  pollSweep,
  pollTestPost,
  pollVote,
  pollVoters,
  pollsOpen,
  type PollDraft,
  type Polls,
} from './poll-store.ts';

const G = '1000';
const H = 3_600_000;
const T = 100 * 24 * H;
const author = { id: '42', name: 'rhea', avatar: '' };
const member = (id: string, roles: string[] = []) => ({
  id,
  name: `m${id}`,
  roles,
});

function setup(patch: Partial<Polls> = {}, plan: 'free' | 'plus' = 'free') {
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
  db.prepare('UPDATE guilds SET plan = ? WHERE id = ?').run(plan, G);
  writeModule(
    db,
    G,
    POLL_MODULE,
    { on: true, config: { ...pollDefault('100'), ...patch } },
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

const draft = (patch: Partial<PollDraft> = {}): PollDraft => ({
  question: 'Pizza or tacos?',
  options: [
    { id: 'a', label: 'Pizza', emoji: '🍕' },
    { id: 'b', label: 'Tacos', emoji: '' },
    { id: 'c', label: 'Soup', emoji: '' },
  ],
  channel: '100',
  rules: pollRulesFrom(pollDefault('100')),
  end: { kind: 'after', duration: '1d' },
  postAt: null,
  ...patch,
});

const create = (
  t: ReturnType<typeof setup>,
  patch: Partial<PollDraft> = {},
  now = T,
) => pollCreate(t.db, { guildId: G, draft: draft(patch), author }, now);

/** Makes a poll and posts it. */
async function posted(
  t: ReturnType<typeof setup>,
  patch: Partial<PollDraft> = {},
  now = T,
) {
  const made = create(t, patch, now);
  if (!made.ok) throw new Error(made.problem);
  await pollPost(t.rest, t.db, G, made.poll.id, now);
  return getPoll(t.db, G, made.poll.id)!;
}

describe('making and posting', () => {
  it('saves a poll waiting to post, then posts it with its buttons', async () => {
    const t = setup();
    const made = create(t);
    expect(made).toMatchObject({
      ok: true,
      poll: { id: 1, status: 'scheduled' },
    });
    const p = await posted(t, {}, T);
    expect(p.id).toBe(2);
    const post = t.calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/channels/100/messages');
    const body = JSON.stringify(post.body);
    expect(body).toContain('pl:v:a');
    expect(body).toContain('📊 Pizza or tacos?');
    expect(p).toMatchObject({
      status: 'active',
      messageId: '900',
      endsAt: T + 24 * H,
    });
    expect(listPollLog(t.db, G).map((e) => e.action)).toEqual([
      'posted',
      'created',
      'created',
    ]);
    // It only posts once.
    expect(await pollPost(t.rest, t.db, G, 2, T)).toBeNull();
  });

  it('keeps to the plan’s options and polls at once', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) expect(create(t).ok).toBe(true);
    expect(create(t)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/up to 3 polls at once/),
    });
    expect(pollsOpen(t.db, G)).toBe(3);
    const plus = setup({}, 'plus');
    expect(
      create(plus, {
        options: Array.from({ length: 25 }, (_, i) => ({
          id: `o${i}`,
          label: `Option ${i}`,
          emoji: '',
        })),
      }).ok,
    ).toBe(true);
  });

  it('refuses when Polls is off', () => {
    const t = setup();
    writeModule(t.db, G, POLL_MODULE, { on: false }, 1);
    expect(create(t)).toMatchObject({ ok: false, problem: /turned off/ });
  });

  it('removes a poll Discord refuses, and says why', async () => {
    const t = setup();
    (t.rest.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DiscordError(403, 50013, 'Missing Permissions'),
    );
    const made = create(t);
    await expect(
      pollPost(t.rest, t.db, G, made.ok ? made.poll.id : 0, T),
    ).rejects.toThrow(/can’t post in that channel/);
    expect(getPoll(t.db, G, 1)).toBeNull();
    expect(listPollLog(t.db, G)[0]).toMatchObject({
      action: 'failed',
      detail: expect.stringMatching(/wasn’t posted/),
    });
  });

  it('pings the role when it’s posted', async () => {
    const t = setup();
    await posted(t, { rules: { ...draft().rules, ping: '77' } });
    expect(t.calls[0]!.body).toMatchObject({
      content: '<@&77>',
      allowed_mentions: { parse: [], roles: ['77'] },
    });
  });
});

describe('voting', () => {
  it('counts a vote, swaps it, and takes it back', async () => {
    const t = setup();
    const p = await posted(t);
    expect(
      pollVote(t.db, G, p.id, member('7'), { option: 'a' }, T),
    ).toMatchObject({ ok: true, picks: ['a'], was: [] });
    pollVote(t.db, G, p.id, member('8'), { option: 'b' }, T);
    expect(
      pollVote(t.db, G, p.id, member('7'), { option: 'b' }, T),
    ).toMatchObject({ picks: ['b'], was: ['a'] });
    expect(getPoll(t.db, G, p.id)).toMatchObject({
      counts: { b: 2 },
      voters: 2,
    });
    expect(
      pollVote(t.db, G, p.id, member('7'), { option: 'b' }, T),
    ).toMatchObject({ picks: [] });
    expect(getPoll(t.db, G, p.id)).toMatchObject({
      counts: { b: 1 },
      voters: 1,
    });
  });

  it('lets members pick several, up to the most allowed', async () => {
    const t = setup();
    const p = await posted(t, {
      rules: { ...draft().rules, multiple: true, maxPicks: 2 },
    });
    pollVote(t.db, G, p.id, member('7'), { option: 'c' }, T);
    expect(
      pollVote(t.db, G, p.id, member('7'), { option: 'a' }, T),
    ).toMatchObject({ picks: ['a', 'c'] });
    expect(
      pollVote(t.db, G, p.id, member('7'), { option: 'b' }, T),
    ).toMatchObject({ ok: false, problem: expect.stringMatching(/up to 2/) });
    // A menu replaces the picks.
    expect(
      pollVote(t.db, G, p.id, member('7'), { options: ['b', 'zz'] }, T),
    ).toMatchObject({ picks: ['b'] });
    expect(getPoll(t.db, G, p.id)).toMatchObject({
      counts: { b: 1 },
      voters: 1,
    });
  });

  it('follows the poll’s rules', async () => {
    const t = setup();
    const p = await posted(t, {
      rules: { ...draft().rules, changeVotes: false, roles: ['3'] },
    });
    expect(
      pollVote(t.db, G, p.id, member('7'), { option: 'a' }, T),
    ).toMatchObject({ ok: false, problem: expect.stringMatching(/<@&3>/) });
    pollVote(t.db, G, p.id, member('7', ['3']), { option: 'a' }, T);
    for (const option of ['a', 'b'])
      expect(
        pollVote(t.db, G, p.id, member('7', ['3']), { option }, T),
      ).toMatchObject({
        ok: false,
        problem: expect.stringMatching(/can’t be changed/),
      });
  });

  it('ends once it reaches its votes', async () => {
    const t = setup();
    const p = await posted(t, { rules: { ...draft().rules, voteTarget: 2 } });
    expect(
      pollVote(t.db, G, p.id, member('7'), { option: 'a' }, T),
    ).toMatchObject({ ended: false });
    expect(
      pollVote(t.db, G, p.id, member('8'), { option: 'a' }, T),
    ).toMatchObject({ ended: true });
    expect(getPoll(t.db, G, p.id)).toMatchObject({
      status: 'ended',
      endedWhy: 'votes',
    });
    expect(
      pollVote(t.db, G, p.id, member('9'), { option: 'a' }, T),
    ).toMatchObject({ ok: false, problem: expect.stringMatching(/ended/) });
  });

  it('lists who voted for what', async () => {
    const t = setup();
    const p = await posted(t, {
      rules: { ...draft().rules, multiple: true, maxPicks: 0 },
    });
    pollVote(t.db, G, p.id, member('7'), { options: ['c', 'a'] }, T);
    pollVote(t.db, G, p.id, member('8'), { option: 'b' }, T + 1);
    expect(pollVoters(t.db, G, p.id)).toEqual([
      { userId: '7', userName: 'm7', picks: ['a', 'c'], at: T },
      { userId: '8', userName: 'm8', picks: ['b'], at: T + 1 },
    ]);
  });
});

describe('live results and ending', () => {
  it('edits the message with the latest bars', async () => {
    const t = setup();
    const p = await posted(t);
    pollVote(t.db, G, p.id, member('7'), { option: 'a' }, T);
    await pollRefresh(t.rest, t.db, G, p.id, T);
    const edit = t.calls.find((c) => c.method === 'PATCH')!;
    expect(edit.path).toBe('/channels/100/messages/900');
    expect(JSON.stringify(edit.body)).toContain('100% (1)');
  });

  it('ends by staff, showing the results with greyed-out buttons', async () => {
    const t = setup();
    const p = await posted(t);
    pollVote(t.db, G, p.id, member('7'), { option: 'b' }, T);
    await pollEnd(t.rest, t.db, G, p.id, 'staff', author, T + H);
    const edit = t.calls.find((c) => c.method === 'PATCH')!;
    const body = JSON.stringify(edit.body);
    expect(body).toContain('🏁 Pizza or tacos?');
    expect(body).toContain('"disabled":true');
    expect(body).toContain('Tacos');
    expect(getPoll(t.db, G, p.id)).toMatchObject({
      status: 'ended',
      endedWhy: 'staff',
      endedBy: 'rhea',
      endedAt: T + H,
    });
    expect(listPollLog(t.db, G)[0]).toMatchObject({
      action: 'ended',
      detail: 'staff',
    });
    await expect(
      pollEnd(t.rest, t.db, G, p.id, 'staff', author, T + H),
    ).rejects.toThrow(/already ended/);
    expect(pollClose(t.db, G, p.id, 'staff', author)).toBeNull();
  });

  it('rerolls a tie to one of the tied options', async () => {
    const t = setup();
    const p = await posted(t);
    pollVote(t.db, G, p.id, member('7'), { option: 'a' }, T);
    pollVote(t.db, G, p.id, member('8'), { option: 'b' }, T);
    expect(() => pollReroll(t.db, G, p.id, author)).toThrow(/has ended/);
    pollClose(t.db, G, p.id, 'staff', author, T);
    const first = pollReroll(t.db, G, p.id, author, T, () => 0);
    expect(first.id).toBe('a');
    // Again picks the other one.
    expect(pollReroll(t.db, G, p.id, author, T, () => 0).id).toBe('b');
    expect(getPoll(t.db, G, p.id)!.picked).toBe('b');
    expect(listPollLog(t.db, G)[0]).toMatchObject({
      action: 'rerolled',
      detail: 'Tacos',
    });
    pollVote(t.db, G, p.id, member('9'), { option: 'a' }, T);
    const clear = await posted(t);
    pollVote(t.db, G, clear.id, member('9'), { option: 'a' }, T);
    pollClose(t.db, G, clear.id, 'staff', author, T);
    expect(() => pollReroll(t.db, G, clear.id, author)).toThrow(/clear winner/);
  });

  it('posts scheduled polls and ends ones whose time is up', async () => {
    const t = setup();
    const later = create(t, {
      postAt: T + H,
      end: { kind: 'after', duration: '2h' },
    });
    const now = await posted(t, { end: { kind: 'at', at: T + 30 * 60_000 } });
    expect(await pollSweep(t.rest, t.db, G, T + 10 * 60_000)).toEqual({
      posted: 0,
      ended: 0,
    });
    expect(await pollSweep(t.rest, t.db, G, T + H)).toEqual({
      posted: 1,
      ended: 1,
    });
    expect(getPoll(t.db, G, now.id)).toMatchObject({
      status: 'ended',
      endedWhy: 'time',
    });
    const sched = getPoll(t.db, G, later.ok ? later.poll.id : 0)!;
    // Its two hours start when it's posted.
    expect(sched).toMatchObject({ status: 'active', endsAt: T + 3 * H });
    expect(await pollSweep(t.rest, t.db, G, T + 3 * H)).toEqual({
      posted: 0,
      ended: 1,
    });
  });
});

describe('deleting, listing and testing', () => {
  it('forgets a poll and its votes, then takes its message down', async () => {
    const t = setup();
    const p = await posted(t);
    pollVote(t.db, G, p.id, member('7'), { option: 'a' }, T);
    const left = pollForget(t.db, G, p.id, author, T);
    expect(left).toEqual({ channelId: '100', messageId: '900' });
    expect(getPoll(t.db, G, p.id)).toBeNull();
    expect(pollVoters(t.db, G, p.id)).toEqual([]);
    await pollRemoveMessage(t.rest, left!);
    expect(t.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/channels/100/messages/900',
    });
    expect(pollForget(t.db, G, p.id, author, T)).toBeNull();
    expect(listPollLog(t.db, G)[0]!.action).toBe('deleted');
    // Its number isn't given to the next poll, so the log stays clear.
    expect(create(t)).toMatchObject({ ok: true, poll: { id: p.id + 1 } });
  });

  it('lists running polls first, and finds them by number or question', async () => {
    const t = setup({}, 'plus');
    const a = await posted(t, { question: 'Best season?' });
    pollClose(t.db, G, a.id, 'staff', author, T);
    create(t, { postAt: T + H });
    await posted(t, { question: 'Best snack?' });
    expect(listPolls(t.db, G).map((p) => [p.id, p.status])).toEqual([
      [3, 'active'],
      [2, 'scheduled'],
      [1, 'ended'],
    ]);
    expect(findPolls(t.db, G, 'snack').map((p) => p.id)).toEqual([3]);
    expect(findPolls(t.db, G, '1').map((p) => p.id)).toEqual([1]);
    expect(findPolls(t.db, G, '').map((p) => p.id)).toEqual([3, 1]);
  });

  it('posts a test poll or test results', async () => {
    const t = setup();
    await pollTestPost(t.rest, t.db, G, '555', 'results', author, T);
    const body = JSON.stringify(t.calls[0]!.body);
    expect(t.calls[0]!.path).toBe('/channels/555/messages');
    expect(body).toContain('This is a test');
    expect(body).toContain('Minecraft');
    expect(body).toContain('"disabled":true');
  });
});
