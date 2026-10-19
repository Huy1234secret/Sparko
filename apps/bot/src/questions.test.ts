import {
  getQuestion,
  openDb,
  QA_MODULE,
  qaDefault,
  SG_MODULE,
  sgDefault,
  upsertGuild,
  writeModule,
  type Questions,
  type Rest,
} from '@sparko/core';
import { describe, expect, it, vi } from 'vitest';
import {
  answerForm,
  askForm,
  filesOf,
  parseQaId,
  questionsBot,
} from './questions.ts';

describe('question forms', () => {
  it('asks for a title and details, required as set', () => {
    const form = askForm(qaDefault('1'));
    expect(form.custom_id).toBe('qa:new');
    expect(form.components[1]!.components[0]).toMatchObject({
      custom_id: 'details',
      label: 'Details (optional)',
      required: false,
      max_length: 1000,
    });
    const strict = askForm({
      ...qaDefault('1'),
      requireDetails: true,
      minLength: 20,
      maxLength: 500,
    });
    expect(strict.components[1]!.components[0]).toMatchObject({
      label: 'Details',
      required: true,
      min_length: 20,
      max_length: 500,
    });
  });

  it('starts an answer from the earlier one', () => {
    const form = answerForm(4, 'A very long question title that goes on', 'Hi');
    expect(form.custom_id).toBe('qa:answer:4');
    expect(form.title.length).toBeLessThanOrEqual(45);
    expect(form.components[0]!.components[0]).toMatchObject({
      value: 'Hi',
      max_length: 2000,
    });
    expect(answerForm(4, 'T').components[0]!.components[0]).not.toHaveProperty(
      'value',
    );
  });

  it('reads its ids', () => {
    expect(parseQaId('qa:answer')).toEqual({ kind: 'answer' });
    expect(parseQaId('qa:metoo')).toEqual({ kind: 'metoo' });
    expect(parseQaId('qa:answer:12')).toEqual({ kind: 'answered', number: 12 });
    expect(parseQaId('sg:up')).toBeNull();
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

function setup(patch: Partial<Questions> = {}) {
  const db = openDb(':memory:');
  upsertGuild(
    db,
    { id: 'g', name: 'G', icon: null, memberCount: 1, installed: true },
    0,
  );
  writeModule(
    db,
    'g',
    QA_MODULE,
    { on: true, config: { ...qaDefault('100'), dm: false, ...patch } },
    0,
  );
  let n = 900;
  const rest = {
    patch: vi.fn(async () => ({})),
    post: vi.fn(async () => ({ id: String(n++) })),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  } as unknown as Rest;
  const bot = questionsBot(db, rest, { appId: () => 'app' });
  const member = (id: string, manager = false, roles: string[] = []) => ({
    id,
    displayName: `user${id}`,
    displayAvatarURL: () => '',
    roles: { cache: new Map(roles.map((r) => [r, {}])) },
    permissions: { has: () => manager },
  });
  /** A fake interaction with what the handlers use. */
  const base = (userId: string, manager = false, roles: string[] = []) => ({
    guildId: 'g',
    user: { id: userId },
    member: member(userId, manager, roles),
    deferred: false,
    replied: false,
    reply: vi.fn(async function (this: { replied: boolean }) {
      this.replied = true;
    }),
    deferReply: vi.fn(async function (this: { deferred: boolean }) {
      this.deferred = true;
    }),
    editReply: vi.fn(async () => {}),
    showModal: vi.fn(async () => {}),
  });
  const slash = (
    sub: string,
    options: Record<string, unknown> = {},
    userId = '500',
    manager = false,
  ) => ({
    ...base(userId, manager),
    commandName: 'question',
    options: {
      getSubcommand: () => sub,
      getString: (k: string) => (options[k] as string) ?? null,
      getInteger: (k: string) => options[k] as number,
      getAttachment: () => null,
    },
  });
  const form = (
    customId: string,
    fields: Record<string, string>,
    userId = '500',
    manager = false,
  ) => ({
    ...base(userId, manager),
    customId,
    fields: {
      getTextInputValue: (k: string) => {
        if (!(k in fields)) throw new Error('missing');
        return fields[k]!;
      },
    },
  });
  const click = (customId: string, userId: string, manager = false) => ({
    ...base(userId, manager),
    customId,
    message: { id: '900' },
  });
  return { db, rest, bot, slash, form, click };
}
type Bot = ReturnType<typeof questionsBot>;
type Slash = Parameters<Bot['command']>[0];
type Form = Parameters<Bot['modal']>[0];
type Click = Parameters<Bot['component']>[0];
const flush = () => new Promise((r) => setTimeout(r, 0));
const replied = (i: { reply: unknown; editReply: unknown }) =>
  JSON.stringify([
    vi.mocked(i.reply as () => void).mock.calls,
    vi.mocked(i.editReply as () => void).mock.calls,
  ]);

/** Asks question #1 as member 500. */
async function askOne(t: ReturnType<typeof setup>) {
  const cmd = t.slash('ask');
  expect(t.bot.command(cmd as unknown as Slash)).toBe(true);
  await flush();
  expect(cmd.showModal).toHaveBeenCalledWith(
    expect.objectContaining({ custom_id: 'qa:new' }),
  );
  const sent = t.form('qa:new', {
    title: 'Where are the rules?',
    details: 'I can’t find them.',
  });
  await t.bot.modal(sent as unknown as Form);
  expect(replied(sent)).toContain('Posted your question #1');
}

describe('asking and answering in Discord', () => {
  it('asks with /question ask and the form', async () => {
    const t = setup();
    await askOne(t);
    expect(getQuestion(t.db, 'g', 1)).toMatchObject({
      title: 'Where are the rules?',
      body: 'I can’t find them.',
      askerId: '500',
      messageId: '900',
    });
  });

  it('keeps the category picked in the command', async () => {
    const t = setup({ categories: [{ id: 'c1', name: 'Rules', emoji: '📜' }] });
    const cmd = t.slash('ask', { category: 'rules' });
    t.bot.command(cmd as unknown as Slash);
    await flush();
    await t.bot.modal(
      t.form('qa:new', { title: 'Where are they?' }) as unknown as Form,
    );
    expect(getQuestion(t.db, 'g', 1)!.category).toBe('c1');
    const wrong = t.slash('ask', { category: 'nope' });
    t.bot.command(wrong as unknown as Slash);
    await flush();
    expect(wrong.showModal).not.toHaveBeenCalled();
    expect(replied(wrong)).toContain('no “nope” category');
  });

  it('turns members away before the form when they can’t ask', async () => {
    const t = setup({ maxOpen: 1 });
    await askOne(t);
    const again = t.slash('ask');
    t.bot.command(again as unknown as Slash);
    await flush();
    expect(again.showModal).not.toHaveBeenCalled();
    expect(replied(again)).toContain('1 open question');
  });

  it('lets staff answer with the button and the form, and nobody else', async () => {
    const t = setup();
    await askOne(t);
    const member = t.click('qa:answer', '700');
    await t.bot.component(member as unknown as Click);
    expect(member.showModal).not.toHaveBeenCalled();
    expect(replied(member)).toContain('Only staff');
    const staff = t.click('qa:answer', '42', true);
    await t.bot.component(staff as unknown as Click);
    expect(staff.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ custom_id: 'qa:answer:1' }),
    );
    const answer = t.form(
      'qa:answer:1',
      { answer: 'They’re in #rules.' },
      '42',
      true,
    );
    await t.bot.modal(answer as unknown as Form);
    expect(replied(answer)).toContain('Answered question #1');
    expect(getQuestion(t.db, 'g', 1)).toMatchObject({
      status: 'answered',
      answer: { text: 'They’re in #rules.', byName: 'user42' },
    });
  });

  it('counts answerer roles as staff', async () => {
    const t = setup({ answerers: ['88'] });
    await askOne(t);
    const i = t.click('qa:answer', '43');
    i.member.roles.cache.set('88', {});
    await t.bot.component(i as unknown as Click);
    expect(i.showModal).toHaveBeenCalled();
  });

  it('lets the asker mark it answered, but not other members', async () => {
    const t = setup();
    await askOne(t);
    const other = t.click('qa:done', '700');
    await t.bot.component(other as unknown as Click);
    expect(replied(other)).toContain('Only the member who asked');
    const asker = t.click('qa:done', '500');
    await t.bot.component(asker as unknown as Click);
    expect(getQuestion(t.db, 'g', 1)!.status).toBe('closed');
  });

  it('toggles Me too', async () => {
    const t = setup();
    await askOne(t);
    const first = t.click('qa:metoo', '700');
    await t.bot.component(first as unknown as Click);
    expect(replied(first)).toContain('1 member has this question too');
    expect(getQuestion(t.db, 'g', 1)!.meToo).toBe(1);
    await t.bot.component(t.click('qa:metoo', '700') as unknown as Click);
    expect(getQuestion(t.db, 'g', 1)!.meToo).toBe(0);
    const own = t.click('qa:metoo', '500');
    await t.bot.component(own as unknown as Click);
    expect(replied(own)).toContain('your own question');
  });

  it('runs the staff commands, and refuses members', async () => {
    const t = setup();
    await askOne(t);
    const member = t.slash('close', { id: 1 }, '700');
    t.bot.command(member as unknown as Slash);
    await flush();
    expect(replied(member)).toContain('Only staff');
    const answer = t.slash('answer', { id: 1, text: 'In #rules' }, '42', true);
    t.bot.command(answer as unknown as Slash);
    await vi.waitFor(() =>
      expect(getQuestion(t.db, 'g', 1)!.status).toBe('answered'),
    );
    const reopen = t.slash('reopen', { id: 1 }, '42', true);
    t.bot.command(reopen as unknown as Slash);
    await vi.waitFor(() =>
      expect(getQuestion(t.db, 'g', 1)!.status).toBe('open'),
    );
    const close = t.slash('close', { id: 1 }, '42', true);
    t.bot.command(close as unknown as Slash);
    await vi.waitFor(() =>
      expect(getQuestion(t.db, 'g', 1)!.status).toBe('closed'),
    );
    const missing = t.slash('delete', { id: 9 }, '42', true);
    t.bot.command(missing as unknown as Slash);
    await flush();
    expect(replied(missing)).toContain('no question #9');
    const del = t.slash('delete', { id: 1 }, '42', true);
    t.bot.command(del as unknown as Slash);
    await vi.waitFor(() => expect(getQuestion(t.db, 'g', 1)).toBeNull());
  });

  it('ignores commands from other modules and renamed ones', () => {
    const t = setup();
    expect(
      t.bot.command({
        ...t.slash('ask'),
        commandName: 'suggest',
      } as unknown as Slash),
    ).toBe(false);
  });

  it('autocompletes categories and question numbers', async () => {
    const t = setup({ categories: [{ id: 'c1', name: 'Rules', emoji: '📜' }] });
    await askOne(t);
    const respond = vi.fn(async () => {});
    const auto = (sub: string, name: string, value: string) =>
      ({
        guildId: 'g',
        commandName: 'question',
        options: {
          getSubcommand: () => sub,
          getFocused: () => ({ name, value }),
        },
        respond,
      }) as unknown as Parameters<Bot['autocomplete']>[0];
    expect(t.bot.autocomplete(auto('ask', 'category', 'ru'))).toBe(true);
    expect(respond).toHaveBeenLastCalledWith([
      { name: '📜 Rules', value: 'Rules' },
    ]);
    t.bot.autocomplete(auto('answer', 'id', 'rules'));
    expect(respond).toHaveBeenLastCalledWith([
      { name: '#1 Where are the rules?', value: 1 },
    ]);
    // Only closed questions can be reopened.
    t.bot.autocomplete(auto('reopen', 'id', ''));
    expect(respond).toHaveBeenLastCalledWith([]);
  });

  it('marks a question deleted when its message goes', async () => {
    const t = setup();
    await askOne(t);
    await t.bot.deleted('900');
    expect(getQuestion(t.db, 'g', 1)!.status).toBe('deleted');
    const click = t.click('qa:answer', '42', true);
    await t.bot.component(click as unknown as Click);
    expect(replied(click)).toContain('This question is gone');
  });
});

describe('registering commands', () => {
  it('registers questions and suggestions together', async () => {
    const t = setup();
    writeModule(
      t.db,
      'g',
      SG_MODULE,
      { on: true, config: sgDefault('100') },
      0,
    );
    await t.bot.registerAll(() => true);
    const [path, bodies] = vi.mocked(t.rest.put).mock.calls[0]! as unknown as [
      string,
      { name: string }[],
    ];
    expect(path).toBe('/applications/app/guilds/g/commands');
    expect(bodies.map((b) => b.name)).toEqual(
      expect.arrayContaining(['question', 'suggest']),
    );
  });
});
