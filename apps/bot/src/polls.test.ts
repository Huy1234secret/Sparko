import {
  POLL_MODULE,
  SG_MODULE,
  getPoll,
  openDb,
  pollCreate,
  pollDefault,
  pollPost,
  pollRulesFrom,
  sgDefault,
  upsertGuild,
  writeModule,
  type Rest,
} from '@sparko/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guildCommandBodies } from './guild-commands.ts';
import {
  REFRESH_MS,
  createForm,
  endFrom,
  parsePollId,
  pollsBot,
  resultsText,
  votersText,
} from './polls.ts';

const G = 'g';

function setup() {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    { id: G, name: 'G', icon: null, memberCount: 1, installed: true },
    0,
  );
  writeModule(db, G, POLL_MODULE, { on: true, config: pollDefault('100') }, 0);
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let n = 900;
  const rest = {
    post: vi.fn(async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body });
      return { id: String(n++) };
    }),
    patch: vi.fn(async (path: string, body: unknown) => {
      calls.push({ method: 'PATCH', path, body });
      return {};
    }),
    put: vi.fn(async (path: string, body: unknown) => {
      calls.push({ method: 'PUT', path, body });
    }),
    delete: vi.fn(async (path: string) => {
      calls.push({ method: 'DELETE', path });
    }),
  } as unknown as Rest;
  const bot = pollsBot(db, rest, { appId: () => 'app' });
  return { db, rest, calls, bot };
}

/** Makes a poll and posts it as message 900. */
async function posted(t: ReturnType<typeof setup>, patch = {}) {
  const made = pollCreate(t.db, {
    guildId: G,
    author: { id: '42', name: 'rhea', avatar: '' },
    draft: {
      question: 'Pizza or tacos?',
      options: [
        { id: 'a', label: 'Pizza', emoji: '🍕' },
        { id: 'b', label: 'Tacos', emoji: '' },
      ],
      channel: '100',
      rules: { ...pollRulesFrom(pollDefault('100')), ...patch },
      end: { kind: 'none' },
      postAt: null,
    },
  });
  if (!made.ok) throw new Error(made.problem);
  await pollPost(t.rest, t.db, G, made.poll.id);
  t.calls.length = 0;
  return getPoll(t.db, G, made.poll.id)!;
}

/** A pretend member, with the roles and permissions given. */
const member = (id: string, roles: string[] = [], manager = false) => ({
  id,
  displayName: `m${id}`,
  roles: { cache: new Map(roles.map((r) => [r, {}])) },
  permissions: { has: () => manager },
  displayAvatarURL: () => '',
});

/** A pretend button or menu press on a message. */
function press(customId: string, user: string, values: string[] = []) {
  const replies: string[] = [];
  return {
    replies,
    i: {
      customId,
      guildId: G,
      message: { id: '900' },
      user: { id: user },
      member: member(user),
      deferred: false,
      replied: false,
      isStringSelectMenu: () => customId === 'pl:m',
      values,
      reply: vi.fn(async ({ content }: { content: string }) =>
        replies.push(content),
      ),
      editReply: vi.fn(async ({ content }: { content: string }) =>
        replies.push(content),
      ),
    } as never,
  };
}

afterEach(() => vi.useRealTimers());

describe('the poll form', () => {
  it('asks for the question, options and length', () => {
    const form = createForm(pollDefault('1'));
    expect(form.custom_id).toBe('pl:new');
    const ids = form.components.map((r) => r.components[0]!.custom_id);
    expect(ids).toEqual(['question', 'options', 'duration']);
    for (const r of form.components) {
      const box = r.components[0]!;
      expect(box.label.length).toBeLessThanOrEqual(45);
      expect(box.placeholder.length).toBeLessThanOrEqual(100);
    }
  });

  it('reads how long, falling back to the server’s default', () => {
    const c = pollDefault('1');
    expect(endFrom('', c)).toEqual({ kind: 'after', duration: '1d' });
    expect(endFrom(' 12H ', c)).toEqual({ kind: 'after', duration: '12h' });
    expect(endFrom('never', c)).toEqual({ kind: 'none' });
    expect(
      endFrom('', { ...c, defaults: { ...c.defaults, duration: '' } }),
    ).toEqual({ kind: 'none' });
  });

  it('reads its ids', () => {
    expect(parsePollId('pl:v:o3')).toEqual({ kind: 'vote', option: 'o3' });
    expect(parsePollId('pl:m')).toEqual({ kind: 'menu' });
    expect(parsePollId('pl:new')).toEqual({ kind: 'new' });
    expect(parsePollId('sg:up')).toBeNull();
  });

  it('makes and posts a poll from the form, with the command’s options', async () => {
    const t = setup();
    const replies: string[] = [];
    const m = member('42', [], true);
    const command = {
      guildId: G,
      commandName: 'poll',
      user: { id: '42' },
      member: m,
      guild: { channels: { cache: new Map() } },
      options: {
        getSubcommand: () => 'create',
        getChannel: () => ({ id: '200' }),
        getBoolean: (n: string) => (n === 'multiple' ? true : null),
      },
      showModal: vi.fn(async () => {}),
      reply: vi.fn(async ({ content }: { content: string }) =>
        replies.push(content),
      ),
    };
    expect(t.bot.command(command as never)).toBe(true);
    await vi.waitFor(() => expect(command.showModal).toHaveBeenCalled());
    const fields: Record<string, string> = {
      question: 'Best snack?',
      options: '🍿 Popcorn\nCrisps\n🍫 Chocolate',
      duration: '2h',
    };
    const form = {
      customId: 'pl:new',
      guildId: G,
      user: { id: '42' },
      member: m,
      deferred: true,
      replied: false,
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async ({ content }: { content: string }) =>
        replies.push(content),
      ),
      fields: { getTextInputValue: (id: string) => fields[id] ?? '' },
    };
    expect(await t.bot.modal(form as never)).toBe(true);
    expect(replies.at(-1)).toMatch(
      /^Posted poll #1: https:\/\/discord.com\/channels\/g\/200\/900$/,
    );
    const p = getPoll(t.db, G, 1)!;
    expect(p).toMatchObject({
      question: 'Best snack?',
      channelId: '200',
      status: 'active',
      rules: { multiple: true },
    });
    expect(p.options.map((o) => o.emoji)).toEqual(['🍿', '', '🍫']);
    expect(p.endsAt! - p.postAt).toBe(2 * 3_600_000);
  });

  it('turns away members when only staff make polls, and bad forms', async () => {
    const t = setup();
    const replies: string[] = [];
    const command = {
      guildId: G,
      commandName: 'poll',
      user: { id: '7' },
      member: member('7'),
      options: { getSubcommand: () => 'create' },
      showModal: vi.fn(),
      reply: vi.fn(async ({ content }: { content: string }) =>
        replies.push(content),
      ),
    };
    t.bot.command(command as never);
    await vi.waitFor(() => expect(replies[0]).toMatch(/Manage Server/));
    expect(command.showModal).not.toHaveBeenCalled();

    const form = {
      customId: 'pl:new',
      guildId: G,
      user: { id: '42' },
      member: member('42', [], true),
      deferred: true,
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async ({ content }: { content: string }) =>
        replies.push(content),
      ),
      fields: {
        getTextInputValue: (id: string) =>
          id === 'options' ? 'Only one' : 'Q?',
      },
    };
    await t.bot.modal(form as never);
    expect(replies.at(-1)).toBe('Add at least 2 options.');
    expect(t.calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('voting', () => {
  it('answers privately, and edits the message once for a burst of votes', async () => {
    vi.useFakeTimers();
    const t = setup();
    await posted(t);
    const one = press('pl:v:a', '7');
    await t.bot.component(one.i);
    expect(one.replies).toEqual([
      'You voted **🍕 Pizza**. Press again to take it back.',
    ]);
    await t.bot.component(press('pl:v:b', '8').i);
    const again = press('pl:v:a', '7');
    await t.bot.component(again.i);
    expect(again.replies).toEqual(['Took your vote back.']);
    expect(t.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(REFRESH_MS + 10);
    const edits = t.calls.filter((c) => c.method === 'PATCH');
    expect(edits).toHaveLength(1);
    expect(edits[0]!.path).toBe('/channels/100/messages/900');
    expect(JSON.stringify(edits[0]!.body)).toContain('100% (1)');
  });

  it('votes with the menu, and refuses what the poll doesn’t allow', async () => {
    const t = setup();
    await posted(t, {
      style: 'menu',
      multiple: true,
      maxPicks: 0,
      roles: ['3'],
    });
    const outsider = press('pl:m', '7', ['a']);
    await t.bot.component(outsider.i);
    expect(outsider.replies[0]).toMatch(/Only <@&3> can vote/);
    const ok = press('pl:m', '8', ['a', 'b']);
    (ok.i as { member: unknown }).member = member('8', ['3']);
    await t.bot.component(ok.i);
    expect(ok.replies[0]).toBe(
      'You voted **🍕 Pizza** and **Tacos**. Pick again to change it.',
    );
    expect(getPoll(t.db, G, 1)!.counts).toEqual({ a: 1, b: 1 });
  });

  it('ends at once on the vote that reaches its target', async () => {
    const t = setup();
    await posted(t, { voteTarget: 1 });
    const last = press('pl:v:b', '7');
    await t.bot.component(last.i);
    expect(last.replies[0]).toBe(
      'You voted **Tacos**. That was the last vote it needed, so the poll has ended.',
    );
    const edit = t.calls.find((c) => c.method === 'PATCH')!;
    expect(JSON.stringify(edit.body)).toContain('🏁 Pizza or tacos?');
    expect(getPoll(t.db, G, 1)).toMatchObject({
      status: 'ended',
      endedWhy: 'votes',
    });
  });

  it('says when a poll is gone', async () => {
    const t = setup();
    const p = press('pl:v:a', '7');
    await t.bot.component(p.i);
    expect(p.replies).toEqual(['This poll is gone.']);
  });
});

describe('commands and results', () => {
  it('ends a poll for staff or its maker only', async () => {
    const t = setup();
    await posted(t);
    const replies: string[] = [];
    const end = (user: string, manager: boolean) => ({
      guildId: G,
      commandName: 'poll',
      user: { id: user },
      member: member(user, [], manager),
      options: { getSubcommand: () => 'end', getInteger: () => 1 },
      get deferred() {
        return this.deferReply.mock.calls.length > 0;
      },
      replied: false,
      deferReply: vi.fn(async () => {}),
      reply: vi.fn(async ({ content }: { content: string }) =>
        replies.push(content),
      ),
      editReply: vi.fn(async ({ content }: { content: string }) =>
        replies.push(content),
      ),
    });
    t.bot.command(end('7', false) as never);
    await vi.waitFor(() => expect(replies[0]).toMatch(/Only staff/));
    t.bot.command(end('42', false) as never);
    await vi.waitFor(() => expect(replies[1]).toMatch(/^Ended poll #1/));
    expect(getPoll(t.db, G, 1)!.status).toBe('ended');
  });

  it('keeps hidden results from members until it ends', async () => {
    const t = setup();
    const p = await posted(t, { hideResults: true });
    expect(resultsText(p, false)).toMatch(/Results show when the poll ends/);
    expect(resultsText(p, true)).toMatch(/Members can’t see these/);
    expect(resultsText({ ...p, status: 'ended' }, false)).toMatch(/Winner/);
  });

  it('lists voters, but never for anonymous polls', async () => {
    const t = setup();
    const p = await posted(t);
    const voters = [{ userId: '7', userName: 'm7', picks: ['a'], at: 0 }];
    expect(votersText(p, voters)).toBe(
      '**Poll #1: Pizza or tacos?**\n**🍕 Pizza** (1): <@7>\n**Tacos** (0): nobody',
    );
    expect(
      votersText({ ...p, rules: { ...p.rules, anonymous: true } }, voters),
    ).toMatch(/anonymous/);
  });

  it('registers the poll command with the server’s other commands', async () => {
    const t = setup();
    writeModule(t.db, G, SG_MODULE, { on: true, config: sgDefault('100') }, 0);
    const names = guildCommandBodies(t.db, G).map((c) => c.name);
    expect(names).toContain('suggest');
    expect(names).toContain('poll');
    // A name another module already uses is left out, so Discord accepts the rest.
    const clash = pollDefault('100');
    clash.commands.name = 'suggest';
    writeModule(t.db, G, POLL_MODULE, { on: true, config: clash }, 0);
    expect(
      guildCommandBodies(t.db, G).filter((c) => c.name === 'suggest'),
    ).toHaveLength(1);
    const channel = {
      name: 'polls',
      permissionsFor: () => ({ has: () => true }),
    };
    const guild = {
      id: G,
      members: { me: {} },
      channels: { cache: new Map([['100', channel]]) },
    };
    await t.bot.handlers(() => guild as never).polls({ guildId: G } as never);
    expect(t.calls[0]).toMatchObject({
      method: 'PUT',
      path: '/applications/app/guilds/g/commands',
    });
  });

  it('posts scheduled polls on the minute sweep', async () => {
    const t = setup();
    const made = pollCreate(t.db, {
      guildId: G,
      author: { id: '42', name: 'rhea', avatar: '' },
      draft: {
        question: 'Later?',
        options: [
          { id: 'a', label: 'Yes', emoji: '' },
          { id: 'b', label: 'No', emoji: '' },
        ],
        channel: '100',
        rules: pollRulesFrom(pollDefault('100')),
        end: { kind: 'none' },
        postAt: Date.now() + 60_000,
      },
    });
    expect(made.ok).toBe(true);
    await t.bot.sweep(() => true, Date.now());
    expect(t.calls).toHaveLength(0);
    await t.bot.sweep(() => true, Date.now() + 61_000);
    expect(t.calls[0]).toMatchObject({
      method: 'POST',
      path: '/channels/100/messages',
    });
  });
});
