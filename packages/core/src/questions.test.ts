import { describe, expect, it } from 'vitest';
import {
  cleanQuestions,
  qaButtons,
  qaCanAsk,
  qaCategoryName,
  qaCloseAt,
  qaCommandBodies,
  qaCommandFor,
  qaDefault,
  qaDefaultMessage,
  qaDmPayload,
  qaFindCategory,
  qaIssue,
  qaLengthProblem,
  qaLimits,
  qaLogLine,
  qaMessageIssue,
  qaPayload,
  qaPresets,
  qaPresetsFor,
  qaShorten,
  qaUpgrade,
  qaVariables,
  type QaQuestion,
  type Questions,
} from './questions.ts';
import {
  embedDefault,
  studioIssue,
  type StudioMessage,
} from './studio-format.ts';

const config = (patch: Partial<Questions> = {}): Questions => ({
  ...qaDefault('100'),
  ...patch,
});

const question = (patch: Partial<QaQuestion> = {}): QaQuestion => ({
  number: 7,
  askerId: '500',
  askerName: 'ayo',
  askerAvatar: 'https://cdn.discordapp.com/a.png',
  title: 'How do I get the Artist role?',
  body: 'I posted some drawings.',
  category: '',
  files: [],
  status: 'open',
  meToo: 0,
  channelId: '100',
  messageId: '900',
  threadId: '901',
  answerId: null,
  answer: null,
  closedBy: null,
  createdAt: 0,
  answeredAt: null,
  closeAt: null,
  threadClosed: false,
  ...patch,
});

const answer = (text = 'Post three pieces in #art-share.') => ({
  text,
  byId: '42',
  byName: 'rhea',
  byAvatar: '',
  at: 1000,
});

const ctx = { now: 0 };

describe('question settings', () => {
  it('accepts the defaults once a channel is picked', () => {
    expect(qaIssue(qaDefault())).toMatchObject({ at: 'channel' });
    expect(qaIssue(config())).toBeNull();
  });

  it('checks roles, deleted ones and the blacklist', () => {
    const roles = new Map([
      ['1', true],
      ['2', false],
    ]);
    expect(
      qaIssue(config({ askers: ['1'], answerers: ['2'] }), { roles }),
    ).toBeNull();
    expect(qaIssue(config({ answerers: ['3'] }), { roles })).toMatchObject({
      at: 'answerers',
    });
    expect(qaIssue(config({ ping: '9' }), { roles })).toMatchObject({
      at: 'ping',
    });
    expect(
      qaIssue(config({ askers: ['1'], blacklist: '1' }), { roles }),
    ).toMatchObject({ at: 'blacklist' });
  });

  it('keeps lengths, times and open questions in range', () => {
    expect(qaIssue(config({ maxLength: 50 }))).toMatchObject({ at: 'length' });
    expect(qaIssue(config({ maxLength: 3000 }))).toMatchObject({
      at: 'length',
    });
    expect(qaIssue(config({ minLength: 2000, maxLength: 1000 }))).toMatchObject(
      { at: 'length' },
    );
    expect(qaIssue(config({ cooldown: '10x' }))).toMatchObject({
      at: 'cooldown',
      problem: expect.stringMatching(/like 1d/),
    });
    expect(qaIssue(config({ closeAfter: '2mt' }))).toMatchObject({
      at: 'closeAfter',
    });
    expect(qaIssue(config({ after: 'later', closeAfter: '' }))).toMatchObject({
      at: 'closeAfter',
    });
    expect(qaIssue(config({ after: 'now', closeAfter: '' }))).toBeNull();
    expect(qaIssue(config({ expire: '30mi' }))).toMatchObject({ at: 'expire' });
    expect(qaIssue(config({ expire: '2w' }))).toBeNull();
    expect(qaIssue(config({ archive: 99 as never }))).toMatchObject({ at: '' });
  });

  it('caps open questions and categories by plan', () => {
    expect(qaLimits('free')).toMatchObject({ categories: 5, maxOpen: 3 });
    expect(qaLimits('plus')).toMatchObject({ categories: 25, maxOpen: 20 });
    expect(qaIssue(config({ maxOpen: 0 }))).toMatchObject({ at: 'maxOpen' });
    expect(qaIssue(config({ maxOpen: 5 }), { plan: 'free' })).toMatchObject({
      at: 'maxOpen',
      problem: expect.stringMatching(/1 to 3/),
    });
    expect(qaIssue(config({ maxOpen: 20 }), { plan: 'plus' })).toBeNull();
    const cats = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      name: `Topic ${i}`,
      emoji: '',
    }));
    expect(
      qaIssue(config({ categories: cats }), { plan: 'free' }),
    ).toMatchObject({ at: 'categories' });
    expect(qaIssue(config({ categories: cats }), { plan: 'plus' })).toBeNull();
  });

  it('needs category names, once each, with emojis Discord can show', () => {
    const cat = (name: string, emoji = '') => ({
      id: name || 'x',
      name,
      emoji,
    });
    expect(qaIssue(config({ categories: [cat('')] }))).toMatchObject({
      at: 'category:x',
    });
    expect(
      qaIssue(
        config({
          categories: [cat('Roles'), { id: 'b', name: 'roles', emoji: '' }],
        }),
      ),
    ).toMatchObject({ problem: expect.stringMatching(/Two categories/) });
    expect(
      qaIssue(config({ categories: [cat('Roles', 'not an emoji')] })),
    ).toMatchObject({ at: 'category:Roles' });
    expect(
      qaIssue(config({ categories: [cat('Roles', '<:art:123>')] })),
    ).toBeNull();
  });

  it('checks the templates are still there', () => {
    const templates = new Set(['5']);
    expect(qaIssue(config({ message: '5' }), { templates })).toBeNull();
    expect(
      qaIssue(config({ answerMessage: '6' }), { templates }),
    ).toMatchObject({ at: 'answerMessage' });
    expect(qaIssue(config({ dmMessage: '7' }), { templates })).toMatchObject({
      at: 'dmMessage',
    });
  });

  it('checks command names, and names other modules use', () => {
    const c = config();
    expect(
      qaIssue({ ...c, command: { ...c.command, name: 'Bad Name' } }),
    ).toMatchObject({ at: 'command' });
    expect(qaIssue(c, { taken: new Set(['question']) })).toMatchObject({
      at: 'command',
      problem: expect.stringMatching(/already a command/),
    });
    expect(
      qaIssue({
        ...c,
        commands: {
          ...c.commands,
          close: { ...c.commands.close, name: 'ask' },
        },
      }),
    ).toMatchObject({
      at: 'command:close',
      problem: expect.stringMatching(/Two/),
    });
    expect(
      qaIssue({
        ...c,
        commands: {
          ...c.commands,
          reopen: { ...c.commands.reopen, description: ' ' },
        },
      }),
    ).toMatchObject({ at: 'command:reopen' });
  });

  it('keeps only known fields, and fills in new ones', () => {
    const dirty = {
      ...config({ cooldown: ' 1h ', askers: ['1', '1'] }),
      extra: true,
    } as Questions;
    const clean = cleanQuestions(dirty);
    expect(clean).not.toHaveProperty('extra');
    expect(clean.cooldown).toBe('1h');
    expect(clean.askers).toEqual(['1']);
    const old = { channel: '1', commands: { ask: { on: false } } } as never;
    const up = qaUpgrade(old);
    expect(up.meToo).toBe(true);
    expect(up.commands.ask.on).toBe(false);
    expect(up.commands.answer.name).toBe('answer');
  });
});

describe('question messages', () => {
  it('holds one embed or container without pictures', () => {
    const m = qaDefaultMessage();
    expect(qaMessageIssue(m)).toBeNull();
    expect(
      qaMessageIssue({ ...m, embeds: [...m.embeds, embedDefault('e2')] }),
    ).toMatchObject({ problem: expect.stringMatching(/one embed/) });
    expect(
      qaMessageIssue({
        ...m,
        embeds: [{ ...m.embeds[0]!, image: 'https://x/y.png' }],
      }),
    ).toMatchObject({ at: 'message' });
    const v2 = qaPresets.find((p) => p.message.layout === 'v2')!.message;
    expect(
      qaMessageIssue(
        {
          ...v2,
          v2: {
            ...v2.v2,
            gallery: [{ id: 'g', url: 'https://x', description: '' }],
          },
        },
        'answer',
      ),
    ).toMatchObject({ at: 'answerMessage' });
  });

  it('leaves a row for the fixed buttons', () => {
    const button = (id: string) => ({
      id,
      type: 'menu' as const,
      placeholder: '',
      multiple: false,
      options: [
        { id: `${id}o`, label: 'A', emoji: '', description: '', actions: [] },
      ],
    });
    const m: StudioMessage = {
      ...qaDefaultMessage(),
      components: ['a', 'b', 'c', 'd', 'e'].map(button),
    };
    expect(qaMessageIssue(m)).toMatchObject({
      problem: expect.stringMatching(/up to 4 rows/),
    });
    expect(qaMessageIssue(m, 'answer')).toBeNull();
  });

  it('has embed and V2 presets for both messages, all valid', () => {
    const q = qaPresetsFor('question');
    expect(
      q.filter((p) => p.message.layout === 'embed').length,
    ).toBeGreaterThanOrEqual(2);
    expect(q.some((p) => p.message.layout === 'v2')).toBe(true);
    expect(qaPresetsFor('answer').length).toBeGreaterThanOrEqual(2);
    for (const p of qaPresets) {
      expect(qaMessageIssue(p.message, p.kind)).toBeNull();
      expect(studioIssue({ ...p.message, channel: '1' })).toBeNull();
    }
  });

  it('fills the variables, hiding anonymous askers', () => {
    const c = config({
      categories: [{ id: 'roles', name: 'Roles', emoji: '🎭' }],
    });
    const q = question({
      category: 'roles',
      meToo: 3,
      answer: answer(),
      files: [{ name: 'a.png', url: 'https://x/a.png', kind: 'image' }],
    });
    expect(qaVariables(c, q)).toMatchObject({
      'question.title': q.title,
      'question.id': '#7',
      'question.category': '🎭 Roles',
      status: 'Open',
      answer: 'Post three pieces in #art-share.',
      'answered.by': '<@42>',
      asker: '<@500>',
      'metoo.count': '3',
      thread: '<#901>',
      files: '[a.png](https://x/a.png)',
    });
    expect(qaVariables({ ...c, anonymous: true }, q)).toMatchObject({
      asker: 'Anonymous',
      user: 'Anonymous',
      'user.avatar': '',
    });
    expect(qaCategoryName(c, '')).toBe('General');
    expect(qaFindCategory(c, 'ROLES')?.id).toBe('roles');
  });

  it('shows the start of a long answer on the question', () => {
    const long = 'word '.repeat(400).trim();
    const q = question({ answer: answer(long), status: 'answered' });
    expect(qaVariables(config(), q).answer!.length).toBeLessThanOrEqual(1000);
    expect(qaVariables(config(), q, { full: true }).answer).toBe(long);
    expect(qaShorten('short', 10)).toBe('short');
    expect(qaShorten('one two three', 8)).toBe('one two…');
  });

  it('adds Answer, Mark answered and Me too while open', () => {
    const ids = (c: Questions, q: QaQuestion) =>
      (
        qaButtons(c, q)[0]!.components as {
          custom_id: string;
          disabled?: boolean;
        }[]
      ).map((b) => `${b.custom_id}${b.disabled ? '(off)' : ''}`);
    expect(ids(config(), question())).toEqual([
      'qa:answer',
      'qa:done',
      'qa:metoo',
    ]);
    expect(ids(config({ meToo: false }), question())).toEqual([
      'qa:answer',
      'qa:done',
    ]);
    expect(
      ids(config(), question({ status: 'answered', answer: answer() })),
    ).toEqual(['qa:answer', 'qa:metoo(off)']);
    const label = (
      qaButtons(config(), question({ meToo: 2 }))[0]!.components[2] as {
        label: string;
      }
    ).label;
    expect(label).toBe('Me too · 2');
  });

  it('builds the post with the answer, the status colour and the ping', () => {
    const c = config({ ping: '77' });
    const open = qaPayload(c, qaDefaultMessage(), question(), ctx);
    expect(open.content).toBe('<@&77>');
    expect(open.allowed_mentions).toEqual({ parse: [], roles: ['77'] });
    expect(open.embeds).toHaveLength(1);
    // Open keeps the template's colour.
    expect(open.embeds![0]!.color).toBe(0x5865f2);
    const done = qaPayload(
      c,
      qaDefaultMessage(),
      question({ status: 'answered', answer: answer() }),
      ctx,
    );
    expect(done.embeds).toHaveLength(2);
    expect(done.embeds![0]!.color).toBe(0x57f287);
    expect(JSON.stringify(done.embeds![1])).toContain('Answered by rhea');
    // A template showing {answer} itself gets no box.
    const own = {
      ...qaDefaultMessage(),
      embeds: [{ ...embedDefault(), description: '{answer}' }],
    };
    expect(
      qaPayload(c, own, question({ status: 'answered', answer: answer() }), ctx)
        .embeds,
    ).toHaveLength(1);
    expect(
      JSON.stringify(
        qaPayload(c, qaDefaultMessage(), question(), ctx, { buttons: false }),
      ),
    ).not.toContain('qa:answer');
  });

  it('builds V2 posts with pictures, the answer box and the buttons', () => {
    const v2 = qaPresets.find((p) => p.id === 'qa-v2')!.message;
    const q = question({
      status: 'answered',
      answer: answer(),
      files: [{ name: 'a.png', url: 'https://x/a.png', kind: 'image' }],
    });
    const body = qaPayload(config({ ping: '77' }), v2, q, ctx);
    const parts = body.components as { type: number; accent_color?: number }[];
    expect(parts[0]).toEqual({ type: 10, content: '<@&77>' });
    expect(parts.filter((p) => p.type === 17)).toHaveLength(2);
    expect(parts[1]!.accent_color).toBe(0x57f287);
    expect(JSON.stringify(parts[1])).toContain('https://x/a.png');
    expect(parts.at(-1)!.type).toBe(1);
  });

  it('DMs the asker by name, even when anonymous', () => {
    const body = qaDmPayload(
      config({ anonymous: true }),
      null,
      question({ status: 'answered', answer: answer() }),
      ctx,
    );
    const text = JSON.stringify(body);
    expect(text).toContain('#7 was answered');
    expect(text).toContain('rhea');
    expect(text).not.toContain('Anonymous');
  });
});

describe('who can ask', () => {
  const facts = (patch = {}) => ({
    roles: new Set<string>(),
    open: 0,
    lastAt: null,
    ...patch,
  });

  it('turns away the blacklist, other roles, the cooldown and too many open', () => {
    expect(
      qaCanAsk(config({ blacklist: '1' }), facts({ roles: new Set(['1']) }), 0),
    ).toMatch(/can’t ask/);
    expect(qaCanAsk(config({ askers: ['2'] }), facts(), 0)).toMatch(/<@&2>/);
    expect(
      qaCanAsk(config({ askers: ['2'] }), facts({ roles: new Set(['2']) }), 0),
    ).toBeNull();
    expect(
      qaCanAsk(config({ cooldown: '10mi' }), facts({ lastAt: 0 }), 60_000),
    ).toMatch(/ask again <t:600:R>/);
    expect(
      qaCanAsk(config({ cooldown: '10mi' }), facts({ lastAt: 0 }), 700_000),
    ).toBeNull();
    expect(qaCanAsk(config({ maxOpen: 1 }), facts({ open: 1 }), 0)).toMatch(
      /1 open question\./,
    );
  });

  it('checks the details only as far as the settings need', () => {
    expect(qaLengthProblem(config(), '')).toBeNull();
    expect(qaLengthProblem(config({ requireDetails: true }), '')).toMatch(
      /at least 1 character/,
    );
    expect(qaLengthProblem(config({ minLength: 20 }), 'too short')).toMatch(
      /20 characters/,
    );
    expect(
      qaLengthProblem(config({ maxLength: 100 }), 'x'.repeat(101)),
    ).toMatch(/up to 100/);
  });

  it('works out when the thread closes', () => {
    expect(qaCloseAt(config({ after: 'now' }), 5)).toBe(5);
    expect(qaCloseAt(config({ after: 'never' }), 5)).toBeNull();
    expect(qaCloseAt(config({ after: 'later', closeAfter: '1h' }), 5)).toBe(
      5 + 3_600_000,
    );
  });
});

describe('question commands', () => {
  it('registers one command with the subcommands that are on', () => {
    const c = config();
    const [body] = qaCommandBodies(c) as {
      name: string;
      options: {
        name: string;
        options: { name: string; autocomplete?: boolean }[];
      }[];
    }[];
    expect(body!.name).toBe('question');
    expect(body!.options.map((o) => o.name)).toEqual([
      'ask',
      'answer',
      'close',
      'reopen',
      'delete',
    ]);
    // No category option until there are categories.
    expect(body!.options[0]!.options.map((o) => o.name)).toEqual([
      'file',
      'file2',
      'file3',
    ]);
    expect(body!.options[1]!.options[0]).toMatchObject({
      name: 'id',
      autocomplete: true,
    });
    const withCats = qaCommandBodies(
      config({ categories: [{ id: 'a', name: 'A', emoji: '' }] }),
    ) as (typeof body)[];
    expect(withCats[0]!.options[0]!.options[0]).toMatchObject({
      name: 'category',
      autocomplete: true,
    });
    const off = config();
    for (const k of Object.keys(off.commands) as (keyof typeof off.commands)[])
      off.commands[k].on = false;
    expect(qaCommandBodies(off)).toEqual([]);
  });

  it('finds the subcommand by the names the server picked', () => {
    const c = config();
    c.command.name = 'help-desk';
    c.commands.ask.name = 'new';
    expect(qaCommandFor(c, 'help-desk', 'new')).toBe('ask');
    expect(qaCommandFor(c, 'question', 'ask')).toBeUndefined();
    c.commands.close.on = false;
    expect(qaCommandFor(c, 'help-desk', 'close')).toBeUndefined();
  });

  it('writes log lines', () => {
    const e = {
      id: '1',
      number: 4,
      userId: '42',
      userName: 'rhea',
      detail: 'Use #support',
      at: 0,
    };
    expect(qaLogLine({ ...e, action: 'answered' })).toBe(
      '[ANSWERED] #4 answered by @rhea: Use #support',
    );
    expect(qaLogLine({ ...e, action: 'marked' })).toBe(
      '[MARKED ANSWERED] #4 marked answered by @rhea',
    );
    expect(qaLogLine({ ...e, action: 'refused', number: null })).toBe(
      '[REFUSED] @rhea couldn’t ask: Use #support',
    );
  });
});
