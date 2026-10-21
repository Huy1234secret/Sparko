import { describe, expect, it } from 'vitest';
import { parseDuration } from './auto-roles.ts';
import {
  sgCanSuggest,
  sgChunks,
  sgCommandBodies,
  sgCommandFor,
  sgDefault,
  sgDuplicateKey,
  sgIssue,
  sgLengthProblem,
  sgMessageIssue,
  sgPayloads,
  sgPresets,
  sgRatioColour,
  sgVoteButton,
  voteRatio,
  type SgSuggestion,
  type Suggestions,
} from './suggestions.ts';

const D = 86_400_000;
const config = (patch: Partial<Suggestions> = {}): Suggestions => ({
  ...sgDefault('100'),
  ...patch,
});
const suggestion = (patch: Partial<SgSuggestion> = {}): SgSuggestion => ({
  number: 7,
  authorId: '500',
  authorName: 'ayo',
  authorAvatar: 'https://cdn.discordapp.com/a.png',
  title: 'Movie nights',
  body: 'Every Friday, in voice.',
  files: [],
  status: 'open',
  closed: false,
  up: 3,
  down: 1,
  channelId: '100',
  messageId: '900',
  threadId: null,
  reason: null,
  createdAt: 0,
  lastAt: 0,
  ...patch,
});

describe('durations', () => {
  it('reads mi as minutes and mt as months', () => {
    expect(parseDuration('5mi')).toBe(5 * 60_000);
    expect(parseDuration('1mt')).toBe(30 * D);
    expect(parseDuration('2w')).toBe(14 * D);
    expect(parseDuration('30m')).toBe(30 * 60_000);
  });
});

describe('vote ratio', () => {
  it('shows the amounts and the difference', () => {
    expect(voteRatio(100, 120).amount).toBe('`100 | 120 - -20`');
    expect(voteRatio(12, 4).amount).toBe('`12 | 4 - +8`');
    expect(voteRatio(0, 0).amount).toBe('`0 | 0 - ±0`');
  });
  it('shows percentages adding up to 100, and how far from even', () => {
    expect(voteRatio(35, 65).percent).toBe('`35% | 65% - -15%`');
    expect(voteRatio(2, 1).percent).toBe('`67% | 33% - +17%`');
    expect(voteRatio(0, 0).percent).toBe('`50% | 50% - ±0%`');
  });
  it('goes from red through yellow to green', () => {
    expect(sgRatioColour(0, 5)).toBe('hsl(0 70% 45%)');
    expect(sgRatioColour(3, 3)).toBe('hsl(60 70% 45%)');
    expect(sgRatioColour(5, 0)).toBe('hsl(120 70% 45%)');
  });
});

describe('sgIssue', () => {
  it('accepts the defaults once a channel is picked', () => {
    expect(sgIssue(config())).toBeNull();
    expect(sgIssue(sgDefault())?.at).toBe('channel');
  });
  it('checks times against their ranges', () => {
    expect(sgIssue(config({ minAge: '12h' }))?.at).toBe('minAge');
    expect(sgIssue(config({ minAge: '2y' }))?.at).toBe('minAge');
    expect(sgIssue(config({ minAge: '1w' }))).toBeNull();
    expect(sgIssue(config({ autoClose: '2mt' }))?.at).toBe('autoClose');
    expect(sgIssue(config({ autoClose: '30mi' }))).toBeNull();
    expect(sgIssue(config({ cooldown: '30mi' }))?.at).toBe('cooldown');
    expect(sgIssue(config({ cooldown: 'soon' }))?.problem).toMatch(/mi, h/);
  });
  it('keeps the review channel apart and roles real', () => {
    expect(sgIssue(config({ review: '100' }))?.at).toBe('review');
    const roles = new Map([['1', true]]);
    expect(sgIssue(config({ approvers: ['2'] }), { roles })?.at).toBe(
      'approvers',
    );
    expect(
      sgIssue(config({ suggesters: ['1'], blacklist: '1' }), { roles })?.at,
    ).toBe('blacklist');
  });
  it('checks statuses: names, colours and actions', () => {
    const custom = (patch: object) =>
      config({
        statuses: [
          ...sgDefault().statuses,
          {
            id: 'planned',
            name: 'Planned',
            color: '#5865F2',
            actions: [],
            ...patch,
          },
        ],
      });
    expect(sgIssue(custom({}))).toBeNull();
    expect(sgIssue(custom({ name: 'approved' }))?.problem).toMatch(/Two/);
    expect(sgIssue(custom({ name: 'x'.repeat(26) }))?.at).toBe(
      'status:planned',
    );
    expect(sgIssue(custom({ color: 'blue' }))?.problem).toMatch(/colour/);
    expect(
      sgIssue(
        custom({
          actions: [
            { id: 'a', type: 'approve' },
            { id: 'b', type: 'deny' },
          ],
        }),
      )?.problem,
    ).toMatch(/both/);
    expect(
      sgIssue(custom({ actions: [{ id: 'a', type: 'blacklist' }] }))?.problem,
    ).toMatch(/blacklisted role/);
    expect(
      sgIssue(custom({ actions: [{ id: 'a', type: 'dm', template: 't9' }] }), {
        templates: new Set(['t1']),
      })?.problem,
    ).toMatch(/deleted/);
  });
  it('limits statuses by plan', () => {
    const many = config({
      statuses: [
        ...sgDefault().statuses,
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `s${i}`,
          name: `Status ${i}`,
          color: '#FFFFFF',
          actions: [],
        })),
      ],
    });
    expect(sgIssue(many)?.at).toBe('statuses');
    expect(sgIssue(many, { plan: 'plus' })).toBeNull();
  });
  it('checks votes, lengths and commands', () => {
    const vote = sgDefault().vote;
    expect(
      sgIssue(
        config({
          vote: { ...vote, kind: 'reaction', down: { ...vote.up } },
        }),
      )?.problem,
    ).toMatch(/different/);
    expect(sgIssue(config({ autoApprove: 10001 }))?.at).toBe('autoApprove');
    expect(sgIssue(config({ maxLength: 50 }))?.at).toBe('length');
    expect(sgIssue(config({ minLength: 6000, maxLength: 5000 }))?.at).toBe(
      'length',
    );
    expect(sgIssue(config({ maxPending: 11 }))?.at).toBe('maxPending');
    const commands = sgDefault().commands;
    expect(
      sgIssue(
        config({
          commands: {
            ...commands,
            deny: { ...commands.deny, name: 'Suggest Now' },
          },
        }),
      )?.at,
    ).toBe('command:deny');
    expect(
      sgIssue(
        config({
          commands: {
            ...commands,
            deny: { ...commands.deny, name: 'suggest' },
          },
        }),
      )?.problem,
    ).toMatch(/Two commands/);
  });
});

describe('who can suggest', () => {
  const now = 400 * D;
  const facts = (patch: object = {}) => ({
    roles: new Set<string>(),
    created: now - 30 * D,
    pending: 0,
    lastAt: null,
    ...patch,
  });
  it('turns away the blacklisted and members without a role', () => {
    expect(sgCanSuggest(config(), facts(), now)).toBeNull();
    expect(
      sgCanSuggest(
        config({ blacklist: '9' }),
        facts({ roles: new Set(['9']) }),
        now,
      ),
    ).toMatch(/can’t/);
    expect(sgCanSuggest(config({ suggesters: ['5'] }), facts(), now)).toMatch(
      /Only <@&5>/,
    );
  });
  it('needs an old enough account unless the role bypasses it', () => {
    const c = config({ suggesters: ['5'], minAge: '60d', bypassAge: true });
    const member = facts({ roles: new Set(['5']) });
    expect(sgCanSuggest(c, member, now)).toBeNull();
    expect(sgCanSuggest({ ...c, bypassAge: false }, member, now)).toMatch(
      /60d/,
    );
    // With no roles picked there's nothing to bypass with.
    expect(
      sgCanSuggest(config({ minAge: '60d', bypassAge: true }), facts(), now),
    ).toMatch(/60d/);
  });
  it('waits out the cooldown and the pending limit', () => {
    expect(
      sgCanSuggest(
        config({ cooldown: '1h' }),
        facts({ lastAt: now - 60_000 }),
        now,
      ),
    ).toMatch(/again <t:/);
    expect(
      sgCanSuggest(config({ maxPending: 2 }), facts({ pending: 2 }), now),
    ).toMatch(/2 suggestions waiting/);
  });
  it('checks the length', () => {
    const c = config({ minLength: 10, maxLength: 100 });
    expect(sgLengthProblem(c, 'too short')).toMatch(/at least 10/);
    expect(sgLengthProblem(c, 'x'.repeat(101))).toMatch(/up to 100/);
    expect(sgLengthProblem(c, 'just right here')).toBeNull();
  });
  it('treats the same idea written differently as a duplicate', () => {
    expect(sgDuplicateKey('Movie  nights!', 'every Friday')).toBe(
      sgDuplicateKey('movie nights', 'Every friday.'),
    );
  });
});

describe('the message', () => {
  it('allows one embed, no pictures and no buttons', () => {
    const card = sgPresets[0]!.message;
    expect(sgMessageIssue(card)).toBeNull();
    expect(
      sgMessageIssue({ ...card, embeds: [...card.embeds, ...card.embeds] })
        ?.problem,
    ).toMatch(/one embed/);
    expect(
      sgMessageIssue({
        ...card,
        embeds: [{ ...card.embeds[0]!, image: 'https://x.png' }],
      })?.problem,
    ).toMatch(/picture/);
    // Its own buttons are fine, as long as the vote row still fits.
    const b = (id: string) => ({
      id,
      type: 'button' as const,
      label: id,
      emoji: '',
      colour: 'grey' as const,
      link: false,
      url: '',
      actions: [],
    });
    const menu = (id: string) => ({
      id,
      type: 'menu' as const,
      placeholder: '',
      multiple: false,
      options: [],
    });
    expect(sgMessageIssue({ ...card, components: [b('a')] })).toBeNull();
    expect(
      sgMessageIssue({
        ...card,
        components: [b('a'), menu('m1'), menu('m2'), menu('m3'), menu('m4')],
      })?.problem,
    ).toMatch(/4 rows/);
  });
  it('puts vote buttons where the message places them', () => {
    const card = sgPresets[0]!.message;
    const vote = (which: 'up' | 'down') => ({
      id: `vote-${which}`,
      type: 'button' as const,
      vote: which,
      label: '',
      emoji: '',
      colour: 'grey' as const,
      link: false,
      url: '',
      actions: [],
    });
    const own = {
      id: 'mine',
      type: 'button' as const,
      label: 'Rules',
      emoji: '',
      colour: 'grey' as const,
      link: true,
      url: 'https://x.example',
      actions: [],
    };
    const message = { ...card, components: [vote('down'), own, vote('up')] };
    const { main } = sgPayloads(config(), message, suggestion(), { now: 0 });
    // One row: downvote, the link, upvote, dressed as the settings say.
    expect(main.components).toMatchObject([
      {
        type: 1,
        components: [
          { custom_id: 'sg:down', label: 'Downvote', style: 4 },
          { url: 'https://x.example' },
          { custom_id: 'sg:up', label: 'Upvote', style: 3 },
        ],
      },
    ]);
    // Closed voting greys them out.
    const closed = sgPayloads(config(), message, suggestion({ closed: true }), {
      now: 0,
    }).main.components as { components: { disabled?: boolean }[] }[];
    expect(closed[0]!.components[0]!.disabled).toBe(true);
    // Voting with a menu leaves them out and adds the menu.
    const menu = sgPayloads(
      config({ vote: { ...sgDefault('1').vote, kind: 'menu' } }),
      message,
      suggestion(),
      { now: 0 },
    ).main.components as { components: { custom_id?: string }[] }[];
    expect(menu.map((r) => r.components.map((c) => c.custom_id))).toEqual([
      [undefined],
      ['sg:vote'],
    ]);
    expect(sgMessageIssue(message)).toBeNull();
  });
  it('fills the suggestion variables and adds the vote buttons', () => {
    const { main } = sgPayloads(config(), sgPresets[0]!.message, suggestion(), {
      now: 0,
    });
    const embed = (main.embeds as { title: string; fields: object[] }[])[0]!;
    expect(embed.title).toBe('💡 Movie nights');
    expect(embed.fields).toContainEqual({
      name: 'Votes',
      value: '`3 | 1 - +2`',
      inline: true,
    });
    const row = (
      main.components as { components: { custom_id: string }[] }[]
    )[0]!;
    expect(row.components.map((b) => b.custom_id)).toEqual([
      'sg:up',
      'sg:down',
    ]);
  });
  it('puts vote buttons a V2 template is missing where the preview shows them', () => {
    // The Modern preset has no vote buttons saved: the dashboard shows them
    // at the end of the container, so the bot posts them there too.
    const { main } = sgPayloads(config(), sgPresets[2]!.message, suggestion(), {
      now: 0,
    });
    const parts = main.components as {
      type: number;
      components: { type: number; components?: { custom_id?: string }[] }[];
    }[];
    expect(parts.map((p) => p.type)).toEqual([17]);
    const row = parts[0]!.components.at(-1)!;
    expect(row.type).toBe(1);
    expect(row.components!.map((b) => b.custom_id)).toEqual([
      'sg:up',
      'sg:down',
    ]);
    // Placed below the container, they're posted below it.
    const message = sgPresets[2]!.message;
    const below = sgPayloads(
      config(),
      {
        ...message,
        components: [sgVoteButton('up'), sgVoteButton('down')],
        v2: {
          ...message.v2,
          place: [
            { id: 'vote-up', slot: { at: 'below' } },
            { id: 'vote-down', slot: { at: 'below' } },
          ],
        },
      },
      suggestion(),
      { now: 0 },
    ).main.components as { type: number }[];
    expect(below.map((p) => p.type)).toEqual([17, 1]);
  });
  it('adds the status box with the reason, and disables votes when closed', () => {
    const { main } = sgPayloads(
      config(),
      sgPresets[0]!.message,
      suggestion({
        status: 'approved',
        closed: true,
        reason: {
          text: 'Starting next week',
          byId: '42',
          byName: 'rhea',
          byAvatar: '',
          at: 0,
        },
      }),
      { now: 0 },
    );
    const embeds = main.embeds as { title?: string; description?: string }[];
    expect(embeds[1]).toMatchObject({
      title: 'Status: Approved',
      description: 'Starting next week',
    });
    const row = (
      main.components as { components: { disabled: boolean }[] }[]
    )[0]!;
    expect(row.components.every((b) => b.disabled)).toBe(true);
  });
  it('carries long suggestions on in more messages', () => {
    const body = 'word '.repeat(2000).trim();
    const { main, more } = sgPayloads(
      config(),
      sgPresets[2]!.message,
      suggestion({ body }),
      { now: 0 },
    );
    expect(main.flags).toBeTruthy();
    expect(more.length).toBe(2);
    expect(JSON.stringify(more[1])).toContain('part 3 of 3');
    expect(sgChunks(body, 2800, 3800).join(' ')).toBe(body);
  });
  it('hides the author when suggestions are anonymous', () => {
    const { main } = sgPayloads(
      config({ anonymous: true }),
      sgPresets[0]!.message,
      suggestion(),
      { now: 0 },
    );
    expect(JSON.stringify(main)).not.toContain('ayo');
    expect(JSON.stringify(main)).toContain('Anonymous');
  });
});

describe('commands', () => {
  it('registers the commands that are on, with their own names', () => {
    const c = config();
    c.commands.suggest.name = 'idea';
    c.commands.delete.on = false;
    const bodies = sgCommandBodies(c) as { name: string }[];
    expect(bodies.map((b) => b.name)).toEqual([
      'idea',
      'suggestion-status',
      'suggestion-approve',
      'suggestion-deny',
    ]);
    expect(sgCommandFor(c, 'idea')).toBe('suggest');
    expect(sgCommandFor(c, 'suggestion-delete')).toBeUndefined();
  });
});
