import { describe, expect, it } from 'vitest';
import {
  cleanDraft,
  cleanPolls,
  parseOptionLines,
  pollBar,
  pollCanCreate,
  pollCanVote,
  pollCommandBodies,
  pollCommandFor,
  pollComponents,
  pollCsv,
  pollDefault,
  pollDraftIssue,
  pollLimits,
  pollLogLine,
  pollOptionsText,
  pollPayload,
  pollPresets,
  pollResults,
  pollRowsIssue,
  pollRulesFrom,
  pollUpgrade,
  pollVariables,
  pollVoteReply,
  pollWinnerText,
  pollsIssue,
  type Poll,
  type PollDraft,
} from './polls.ts';
import { studioDefault } from './studio-format.ts';

const now = 1_000_000_000_000;
const draft = (patch: Partial<PollDraft> = {}): PollDraft => ({
  question: 'Pizza or tacos?',
  options: [
    { id: 'a', label: 'Pizza', emoji: '🍕' },
    { id: 'b', label: 'Tacos', emoji: '' },
  ],
  channel: '100',
  rules: pollRulesFrom(pollDefault('100')),
  end: { kind: 'after', duration: '1d' },
  postAt: null,
  ...patch,
});
const poll = (patch: Partial<Poll> = {}): Poll => ({
  id: 4,
  question: 'Pizza or tacos?',
  options: [
    { id: 'a', label: 'Pizza', emoji: '🍕' },
    { id: 'b', label: 'Tacos', emoji: '' },
    { id: 'c', label: 'Soup', emoji: '' },
  ],
  rules: { ...pollRulesFrom(pollDefault('100')), maxPicks: 1 },
  channelId: '100',
  messageId: 'm1',
  status: 'active',
  postAt: now,
  endsAt: now + 3_600_000,
  endedAt: null,
  endedWhy: null,
  endedBy: '',
  picked: null,
  authorId: '5',
  authorName: 'rhea',
  createdAt: now,
  counts: { a: 6, b: 3, c: 1 },
  voters: 10,
  ...patch,
});

describe('poll settings', () => {
  it('needs a channel, real roles and templates, and good command names', () => {
    expect(pollsIssue(pollDefault())).toMatchObject({ at: 'channel' });
    const ok = pollDefault('100');
    expect(pollsIssue(ok)).toBeNull();
    expect(
      pollsIssue({ ...ok, creators: ['9'] }, { roles: new Set(['1']) }),
    ).toMatchObject({ at: 'creators' });
    expect(
      pollsIssue({ ...ok, message: '12' }, { templates: new Set(['13']) }),
    ).toMatchObject({ at: 'message' });
    expect(
      pollsIssue({ ...ok, defaults: { ...ok.defaults, duration: '2y' } }),
    ).toMatchObject({ at: 'duration' });
    const commands = structuredClone(ok.commands);
    commands.subs.end.name = 'create';
    expect(pollsIssue({ ...ok, commands })).toMatchObject({
      at: 'command:end',
      problem: expect.stringMatching(/Two commands/),
    });
    expect(
      pollsIssue({ ...ok, commands: { ...ok.commands, name: 'Poll!' } }),
    ).toMatchObject({ at: 'command:group' });
  });

  it('cleans and upgrades what was saved', () => {
    const c = pollDefault('100');
    expect(cleanPolls({ ...c, creators: ['1', '1'] }).creators).toEqual(['1']);
    const old = { channel: '5', commands: { name: 'vote' } } as never;
    const up = pollUpgrade(old);
    expect(up.channel).toBe('5');
    expect(up.commands.name).toBe('vote');
    expect(up.commands.subs.voters.name).toBe('voters');
    expect(up.defaults.duration).toBe('1d');
  });
});

describe('a new poll', () => {
  it('checks the question, options, plan limits and times', () => {
    expect(pollDraftIssue(draft(), { now })).toBeNull();
    expect(pollDraftIssue(draft({ question: ' ' }), { now })).toMatchObject({
      at: 'question',
    });
    expect(
      pollDraftIssue(draft({ options: [draft().options[0]!] }), { now }),
    ).toMatchObject({ at: 'options' });
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: `o${i}`,
      label: `Option ${i}`,
      emoji: '',
    }));
    expect(pollDraftIssue(draft({ options: six }), { now })).toMatchObject({
      problem: expect.stringMatching(/up to 5 options/),
    });
    expect(
      pollDraftIssue(draft({ options: six }), { now, plan: 'plus' }),
    ).toBeNull();
    expect(pollDraftIssue(draft(), { now, active: 3 })).toMatchObject({
      problem: expect.stringMatching(/up to 3 polls at once/),
    });
    expect(
      pollDraftIssue(
        draft({
          options: [
            { id: 'a', label: 'Pizza', emoji: '' },
            { id: 'b', label: 'pizza ', emoji: '' },
          ],
        }),
        { now },
      ),
    ).toMatchObject({ at: 'option:b' });
    expect(
      pollDraftIssue(draft({ end: { kind: 'after', duration: '40d' } }), {
        now,
      }),
    ).toMatchObject({ at: 'end' });
    expect(
      pollDraftIssue(draft({ end: { kind: 'at', at: now + 1000 } }), { now }),
    ).toMatchObject({ at: 'end' });
    expect(
      pollDraftIssue(draft({ postAt: now - 3_600_000 }), { now }),
    ).toMatchObject({ at: 'postAt' });
    expect(
      pollDraftIssue(
        draft({ rules: { ...draft().rules, multiple: true, maxPicks: 1 } }),
        { now },
      ),
    ).toMatchObject({ at: 'maxPicks' });
    expect(
      pollDraftIssue(draft({ rules: { ...draft().rules, roles: ['7'] } }), {
        now,
        roles: new Set(['8']),
      }),
    ).toMatchObject({ at: 'roles' });
    expect(
      pollDraftIssue(draft(), { now, channels: new Set(['1']) }),
    ).toMatchObject({ at: 'channel' });
  });

  it('trims a draft and keeps single choice to one pick', () => {
    const d = cleanDraft(
      draft({
        question: '  Pizza?  ',
        rules: { ...draft().rules, maxPicks: 3 },
      }),
    );
    expect(d.question).toBe('Pizza?');
    expect(d.rules.maxPicks).toBe(1);
  });

  it('reads options typed one per line, with their emoji', () => {
    expect(
      parseOptionLines(
        '🍕 Pizza\n- Tacos\n\n<:soup:123> Soup\n🇫🇷 Crêpes\n2) Salad',
      ),
    ).toEqual([
      { id: 'o1', emoji: '🍕', label: 'Pizza' },
      { id: 'o2', emoji: '', label: 'Tacos' },
      { id: 'o3', emoji: '<:soup:123>', label: 'Soup' },
      { id: 'o4', emoji: '🇫🇷', label: 'Crêpes' },
      { id: 'o5', emoji: '', label: 'Salad' },
    ]);
    // An emoji on its own is the option's name.
    expect(parseOptionLines('👍')).toEqual([
      { id: 'o1', emoji: '', label: '👍' },
    ]);
  });

  it('leaves room for the template’s own buttons', () => {
    const m = studioDefault('1');
    const button = (id: string) => ({
      id,
      type: 'button' as const,
      label: id,
      emoji: '',
      colour: 'grey' as const,
      link: true,
      url: 'https://x.y',
      actions: [],
    });
    m.components = [
      button('a'),
      button('b'),
      button('c'),
      button('d'),
      button('e'),
      button('f'),
    ];
    expect(pollRowsIssue(m, 'buttons', 15)).toBeNull();
    expect(pollRowsIssue(m, 'buttons', 16)).toMatchObject({
      problem: expect.stringMatching(/up to 15 options/),
    });
    expect(pollRowsIssue(m, 'menu', 25)).toBeNull();
    expect(pollRowsIssue({ ...m, layout: 'v2' }, 'buttons', 25)).toBeNull();
  });
});

describe('results', () => {
  it('shows bars, shares and the winner', () => {
    expect(pollBar(60)).toBe('▰▰▰▰▰▰▱▱▱▱');
    expect(pollBar(0)).toBe('▱▱▱▱▱▱▱▱▱▱');
    const p = poll();
    expect(pollResults(p).rows.map((r) => r.percent)).toEqual([60, 30, 10]);
    expect(pollOptionsText(p)).toContain('**🍕 Pizza**\n▰▰▰▰▰▰▱▱▱▱ 60% (6)');
    expect(pollWinnerText(p)).toBe('🍕 Pizza');
    // Hidden results list only the options until it ends.
    const hidden = poll({ rules: { ...p.rules, hideResults: true } });
    expect(pollOptionsText(hidden)).not.toContain('%');
    expect(pollOptionsText({ ...hidden, status: 'ended' })).toContain(
      '🏆 **🍕 Pizza**',
    );
  });

  it('shows ties, and the option picked when one was rerolled', () => {
    const tie = poll({ counts: { a: 4, b: 4 }, status: 'ended' });
    expect(pollResults(tie).tie).toBe(true);
    expect(pollWinnerText(tie)).toBe('Tie between 🍕 Pizza and Tacos');
    expect(pollWinnerText({ ...tie, picked: 'b' })).toBe(
      'Tacos (picked at random from a tie between 🍕 Pizza and Tacos)',
    );
    expect(pollWinnerText(poll({ counts: {} }))).toBe('No votes');
  });

  it('fills the poll variables', () => {
    const v = pollVariables(poll());
    expect(v).toMatchObject({
      'poll.question': 'Pizza or tacos?',
      'poll.id': '#4',
      'votes.total': '10',
      'poll.ends': `<t:${(now + 3_600_000) / 1000}:R>`,
      'poll.author': '<@5>',
      'poll.winner': '',
      'poll.status': 'Open',
    });
    expect(pollVariables(poll({ endsAt: null }))['poll.ends']).toBe(
      'No end time',
    );
  });
});

describe('the message', () => {
  it('puts the options under it as buttons, five a row', () => {
    const p = poll({
      options: Array.from({ length: 7 }, (_, i) => ({
        id: `o${i}`,
        label: `Option ${i}`,
        emoji: i ? '' : '🍕',
      })),
    });
    const rows = pollComponents(p) as { components: object[] }[];
    expect(rows.map((r) => r.components.length)).toEqual([5, 2]);
    expect(rows[0]!.components[0]).toMatchObject({
      custom_id: 'pl:v:o0',
      emoji: { name: '🍕' },
      disabled: false,
    });
  });

  it('greys out the options once it ends, with the winner in green', () => {
    const rows = pollComponents(poll({ status: 'ended' })) as {
      components: { disabled: boolean; style: number }[];
    }[];
    expect(rows[0]!.components.every((b) => b.disabled)).toBe(true);
    expect(rows[0]!.components.map((b) => b.style)).toEqual([3, 2, 2]);
  });

  it('uses a menu that takes as many picks as the poll allows', () => {
    const p = poll({
      rules: { ...poll().rules, style: 'menu', multiple: true, maxPicks: 2 },
    });
    const [row] = pollComponents(p) as {
      components: { max_values: number; placeholder: string }[];
    }[];
    expect(row!.components[0]).toMatchObject({
      max_values: 2,
      placeholder: 'Pick up to 2',
    });
  });

  it('pings the role only when it’s posted', () => {
    const p = poll({ rules: { ...poll().rules, ping: '77' } });
    const message = pollPresets[0]!.message;
    const posted = pollPayload(message, p, { now, post: true });
    expect(posted.content).toBe('<@&77>');
    expect(posted.allowed_mentions).toEqual({ parse: [], roles: ['77'] });
    const edited = pollPayload(message, p, { now });
    expect(edited.allowed_mentions).toEqual({ parse: [] });
    expect(JSON.stringify(posted)).toContain('📊 Pizza or tacos?');
    const v2 = pollPayload(pollPresets[2]!.message, p, { now, post: true });
    expect(v2.components![0]).toEqual({ type: 10, content: '<@&77>' });
  });

  it('answers each vote privately', () => {
    const p = poll();
    expect(pollVoteReply(p, ['a'], [])).toBe(
      'You voted **🍕 Pizza**. Press again to take it back.',
    );
    expect(pollVoteReply(p, [], ['a'])).toBe('Took your vote back.');
    expect(pollVoteReply(p, ['a', 'b'], ['a'])).toBe(
      'You voted **🍕 Pizza** and **Tacos**. Press one again to take it back.',
    );
    expect(
      pollVoteReply(
        poll({ rules: { ...p.rules, changeVotes: false } }),
        ['a'],
        [],
      ),
    ).toBe('You voted **🍕 Pizza**.');
  });
});

describe('who can', () => {
  it('lets staff make polls, and members when allowed', () => {
    const c = pollDefault('1');
    expect(pollCanCreate(c, new Set(), true)).toBeNull();
    expect(pollCanCreate(c, new Set(), false)).toMatch(/Manage Server/);
    expect(
      pollCanCreate({ ...c, creators: ['9'] }, new Set(['9']), false),
    ).toBeNull();
    const members = { ...c, members: true, memberRole: '8' };
    expect(pollCanCreate(members, new Set(), false)).toMatch(/<@&8>/);
    expect(pollCanCreate(members, new Set(['8']), false)).toBeNull();
  });

  it('keeps voting to the poll’s roles, while it runs', () => {
    const p = poll({ rules: { ...poll().rules, roles: ['3'] } });
    expect(pollCanVote(p, new Set())).toMatch(/<@&3>/);
    expect(pollCanVote(p, new Set(['3']))).toBeNull();
    expect(pollCanVote({ ...p, status: 'ended' }, new Set(['3']))).toMatch(
      /ended/,
    );
    expect(pollCanVote({ ...p, status: 'scheduled' }, new Set(['3']))).toMatch(
      /hasn’t started/,
    );
  });
});

describe('commands', () => {
  it('registers one command with a subcommand for each job that’s on', () => {
    const c = pollDefault('1');
    c.commands.subs.voters.on = false;
    c.commands.subs.end.name = 'stop';
    const [body] = pollCommandBodies(c) as {
      name: string;
      options: { name: string }[];
    }[];
    expect(body!.name).toBe('poll');
    expect(body!.options.map((o) => o.name)).toEqual([
      'create',
      'stop',
      'results',
    ]);
    expect(pollCommandFor(c, 'poll', 'stop')).toBe('end');
    expect(pollCommandFor(c, 'poll', 'voters')).toBeUndefined();
    expect(pollCommandFor(c, 'suggest', 'create')).toBeUndefined();
    for (const k of ['create', 'end', 'results', 'voters'] as const)
      c.commands.subs[k].on = false;
    expect(pollCommandBodies(c)).toEqual([]);
  });
});

describe('export and logs', () => {
  it('exports votes as CSV, or only totals when anonymous', () => {
    const p = poll();
    const csv = pollCsv(p, [
      { userId: '7', userName: 'ayo, the "best"', picks: ['a'], at: now },
    ]);
    expect(csv).toBe(
      `User ID,Name,Option,Voted at\r\n7,"ayo, the ""best""",Pizza,${new Date(now).toISOString()}\r\n`,
    );
    const anon = pollCsv(poll({ rules: { ...p.rules, anonymous: true } }), []);
    expect(anon).toBe('Option,Votes\r\nPizza,6\r\nTacos,3\r\nSoup,1\r\n');
  });

  it('writes log lines', () => {
    const e = {
      id: '1',
      poll: 4,
      userId: '5',
      userName: 'rhea',
      detail: 'staff',
      at: now,
    };
    expect(pollLogLine({ ...e, action: 'ended' })).toBe(
      '[ENDED] #4 ended early by @rhea',
    );
    expect(pollLogLine({ ...e, action: 'ended', detail: 'votes' })).toBe(
      '[ENDED] #4 it reached its votes',
    );
    expect(pollLogLine({ ...e, action: 'rerolled', detail: 'Tacos' })).toBe(
      '[REROLLED] #4 tie rerolled by @rhea: Tacos',
    );
  });

  it('has plan limits', () => {
    expect(pollLimits('free')).toEqual({ options: 5, active: 3 });
    expect(pollLimits('plus')).toEqual({ options: 25, active: 50 });
  });
});
