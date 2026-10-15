import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { getModule, writeModule } from './store.ts';
import { getTemplate } from './templates.ts';
import { studioIssue, studioPayload } from './studio-format.ts';
import { welcomeOf } from './greet.ts';
import {
  cleanWelcome,
  greetPresets,
  greetTemplates,
  welcomeDefault,
  welcomeProblem,
  type WelcomeConfig,
} from './welcome.ts';

describe('welcome messages', () => {
  it('ships ready-made messages Studio accepts, for every kind', () => {
    for (const kind of ['join', 'leave', 'boost'])
      expect(greetPresets.filter((p) => p.kind === kind).length).toBe(
        kind === 'join' ? 4 : 3,
      );
    for (const p of greetPresets)
      expect(studioIssue({ ...p.message, channel: '1' })).toBeNull();
  });

  it('fills picture variables, and leaves a picture out when it can’t', () => {
    const card = greetPresets.find((p) => p.id === 'join-card')!.message;
    const filled = studioPayload(card, {
      now: 0,
      user: { id: '7', name: 'tomoko', avatar: 'https://cdn/a.png' },
      server: { name: 'Pixel Plaza', members: 12 },
    });
    expect(filled.embeds![0]).toMatchObject({
      title: 'Welcome, tomoko!',
      thumbnail: { url: 'https://cdn/a.png' },
      author: { name: 'Pixel Plaza' },
    });
    // No server icon: the author has no picture.
    expect(filled.embeds![0]!.author).not.toHaveProperty('icon_url');
    // The JSON shows them as written.
    const raw = studioPayload(card, { now: 0, raw: true });
    expect(raw.embeds![0]!.thumbnail).toEqual({ url: '{user.avatar}' });
  });

  it('checks settings and which templates each kind sends', () => {
    const c = welcomeDefault('5');
    expect(welcomeProblem(c)).toBe('Pick a template for the join message.');
    c.join.template = '3';
    c.leave.channel = '';
    c.boost.channel = '';
    expect(welcomeProblem(c, new Set(['3']))).toBeNull();
    expect(welcomeProblem(c, new Set())).toContain('was deleted');
    c.join.dm = '9';
    expect(greetTemplates(c.join)).toEqual({ channel: '3', dm: '9' });
    expect(welcomeProblem({ ...c, join: { ...c.join, deleteAfter: 7 } })).toBe(
      'Pick when to delete the message.',
    );
    expect(
      cleanWelcome({ ...c, extra: 1 } as unknown as WelcomeConfig),
    ).not.toHaveProperty('extra');
  });

  it('turns an old welcome into a template it sends', () => {
    const db = openDb(':memory:');
    writeModule(
      db,
      'g',
      'welcome',
      {
        on: true,
        config: {
          delivery: 'both',
          channel: '501',
          message: 'Hi {user}! You’re #{member_count}.',
          embed: true,
          title: 'Welcome',
          color: '#5865F2',
          ping: true,
          rejoin: true,
        },
      },
      1,
    );
    const { on, config } = welcomeOf(db, 'g', 2);
    expect(on).toBe(true);
    expect(config!.join).toMatchObject({
      channel: '501',
      dm: 'same',
      ping: true,
      rejoin: true,
    });
    const t = getTemplate<{
      content: string;
      embeds: { description: string }[];
    }>(db, 'g', 'studio', config!.join.template)!;
    expect(t.message.content).toBe('{user}');
    expect(t.message.embeds[0]!.description).toBe(
      'Hi {user}! You’re #{server.members}.',
    );
    // It's moved once.
    expect(welcomeOf(db, 'g', 3).config).toEqual(config);
    expect(getModule(db, 'g', 'welcome').config).toEqual(config);
  });
});
