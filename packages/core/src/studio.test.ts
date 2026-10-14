import { describe, expect, it } from 'vitest';
import {
  addTemplate,
  componentRows,
  DiscordError,
  handleStudioInteraction,
  planProblem,
  rememberPost,
  type StudioButton,
  type StudioComponent,
  type StudioMenu,
  embedDefault,
  getPosted,
  normaliseStudio,
  IS_COMPONENTS_V2,
  openDb,
  publishStudio,
  studioDefault,
  studioPayload,
  studioProblem,
  upsertGuild,
  writeModule,
  type Rest,
  type StudioMessage,
} from './index.ts';

const base = studioDefault('100');
const v2: StudioMessage = {
  ...base,
  layout: 'v2',
  v2: {
    container: true,
    accent: '#5865F2',
    blocks: [
      { id: 'a', type: 'text', content: '## Hello' },
      { id: 'b', type: 'separator', divider: true, spacing: 'large' },
      {
        id: 'c',
        type: 'section',
        content: 'Prize',
        accessory: { type: 'thumbnail', url: 'https://img.example/p.png' },
      },
      {
        id: 'd',
        type: 'gallery',
        images: [
          { id: 'i', url: 'https://img.example/1.png', description: 'One' },
        ],
      },
      {
        id: 'e',
        type: 'buttons',
        buttons: [{ id: 'x', label: 'Rules', url: 'https://example.com' }],
      },
    ],
  },
};

describe('Message Studio messages', () => {
  it('builds a classic message with embeds and link buttons', () => {
    const m: StudioMessage = {
      ...base,
      content: 'Hi @everyone',
      embeds: [
        {
          ...base.embeds[0]!,
          author: 'Sparko',
          authorIcon: 'https://cdn/a.png',
          authorUrl: 'https://example.com',
          footer: 'Team',
          thumbnail: 'https://cdn/icon.png',
          timestamp: true,
          fields: [
            { id: 'f1', name: 'When', value: '', inline: true },
            { id: 'f2', name: '', value: '', inline: false },
          ],
        },
        // Empty embeds are left out.
        { ...embedDefault('e2') },
        { ...embedDefault('e3'), image: 'https://cdn/big.png' },
      ],
      components: [
        {
          id: 'x',
          type: 'button',
          label: 'Go',
          emoji: '',
          colour: 'grey',
          link: true,
          url: 'https://example.com',
          actions: [],
        },
      ],
    };
    expect(studioProblem(m)).toBeNull();
    const body = studioPayload(m, { now: 0 });
    expect(body.embeds).toHaveLength(2);
    expect(body).toMatchObject({
      content: 'Hi @everyone',
      embeds: [
        {
          title: 'Big news',
          color: 0xfacc15,
          author: {
            name: 'Sparko',
            icon_url: 'https://cdn/a.png',
            url: 'https://example.com',
          },
          footer: { text: 'Team' },
          thumbnail: { url: 'https://cdn/icon.png' },
          timestamp: '1970-01-01T00:00:00.000Z',
          // A blank value stands in as a zero-width space.
          fields: [{ name: 'When', value: '\u200b', inline: true }],
        },
        { image: { url: 'https://cdn/big.png' } },
      ],
      components: [
        {
          type: 1,
          components: [{ type: 2, style: 5, url: 'https://example.com' }],
        },
      ],
      // Nobody is pinged by surprise, not even @everyone.
      allowed_mentions: { parse: [] },
    });
  });

  it('builds a Components V2 message inside a container', () => {
    expect(studioProblem(v2)).toBeNull();
    const body = studioPayload(v2, { now: 0 }) as unknown as {
      flags: number;
      components: {
        type: number;
        accent_color: number;
        components: { type: number }[];
      }[];
    };
    expect(body.flags).toBe(IS_COMPONENTS_V2);
    expect(body.components[0]!.type).toBe(17);
    expect(body.components[0]!.accent_color).toBe(0x5865f2);
    expect(body.components[0]!.components.map((c) => c.type)).toEqual([
      10, 14, 9, 12, 1,
    ]);
    expect('content' in body).toBe(false);
  });

  it('refuses messages Discord would reject', () => {
    expect(studioProblem({ ...base, content: '', embeds: [] })).toMatch(
      /empty/,
    );
    expect(
      studioProblem({
        ...base,
        embeds: [{ ...base.embeds[0]!, image: 'http://x' }],
      }),
    ).toMatch(/https/);
    expect(
      studioProblem({
        ...base,
        embeds: Array.from({ length: 11 }, (_, i) => embedDefault(`e${i}`)),
      }),
    ).toMatch(/10 embeds/);
  });

  it('reads messages saved before there could be several embeds', () => {
    const old = {
      ...base,
      embeds: undefined,
      useEmbed: true,
      embed: { title: 'Old', thumbnail: true, fields: [] },
    } as unknown as StudioMessage;
    const m = normaliseStudio(old);
    expect(m.embeds).toHaveLength(1);
    expect(m.embeds[0]).toMatchObject({
      title: 'Old',
      thumbnail: '',
      id: 'e1',
    });
    expect('embed' in m).toBe(false);
    expect(studioProblem({ ...v2, v2: { ...v2.v2, blocks: [] } })).toMatch(
      /at least one/,
    );
    expect(
      studioProblem({
        ...v2,
        v2: {
          ...v2.v2,
          blocks: [{ id: 'g', type: 'gallery', images: [] }],
        },
      }),
    ).toMatch(/1 to 10/);
  });

  it('posts once, edits after, and posts a new message when the layout changes', async () => {
    const db = openDb(':memory:');
    upsertGuild(
      db,
      { id: 'g', name: 'G', icon: null, memberCount: 1, installed: true },
      1,
    );
    const calls: string[] = [];
    const rest = {
      post: async (p: string) => (
        calls.push(`POST ${p}`),
        { id: `m${calls.length}` }
      ),
      patch: async (p: string) => (calls.push(`PATCH ${p}`), {}),
    } as unknown as Rest;
    writeModule(db, 'g', 'studio', { on: true, config: base }, 1);
    await publishStudio(rest, db, 'g');
    const first = getPosted(db, 'g', 'studio:embed')!;
    await publishStudio(rest, db, 'g');
    writeModule(db, 'g', 'studio', { on: true, config: v2 }, 2);
    await publishStudio(rest, db, 'g');
    expect(calls).toEqual([
      'POST /channels/100/messages',
      `PATCH /channels/100/messages/${first.messageId}`,
      'POST /channels/100/messages',
    ]);
  });
});

const button = (
  id: string,
  over: Partial<StudioButton> = {},
): StudioButton => ({
  id,
  type: 'button',
  label: id,
  emoji: '',
  colour: 'blurple',
  link: false,
  url: '',
  actions: [{ id: `a-${id}`, type: 'role', mode: 'give', roles: ['900'] }],
  ...over,
});
const menu: StudioMenu = {
  id: 'pick',
  type: 'menu',
  placeholder: 'Choose your roles',
  multiple: true,
  options: [
    {
      id: 'o1',
      label: 'Artist',
      emoji: '<:brush:77>',
      description: 'Draws things',
      actions: [{ id: 'r1', type: 'role', mode: 'give', roles: ['901'] }],
    },
    {
      id: 'o2',
      label: 'Rules',
      emoji: '📜',
      description: '',
      actions: [
        {
          id: 's1',
          type: 'send',
          templates: ['5'],
          dm: false,
          ephemeral: true,
        },
      ],
    },
  ],
};

describe('buttons and menus', () => {
  it('lays out buttons five to a row with each menu on its own', () => {
    const m: StudioMessage = {
      ...base,
      components: [
        ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => button(id)),
        menu,
        button('g', { link: true, url: 'https://x.example', colour: 'red' }),
      ],
    };
    expect(studioProblem(m)).toBeNull();
    expect(componentRows(m.components).map((r) => r.length)).toEqual([
      5, 1, 1, 1,
    ]);
    const body = studioPayload(m, { now: 0 }) as {
      components: { components: Record<string, unknown>[] }[];
    };
    expect(body.components[0]!.components[0]).toEqual({
      type: 2,
      style: 1,
      label: 'a',
      custom_id: 'sp:b:a',
    });
    // Link buttons are always grey in Discord, whatever colour was picked.
    expect(body.components[3]!.components[0]).toMatchObject({
      style: 5,
      url: 'https://x.example',
    });
    expect(body.components[2]!.components[0]).toMatchObject({
      type: 3,
      custom_id: 'sp:m:pick',
      max_values: 2,
      options: [
        {
          label: 'Artist',
          value: 'o1',
          emoji: { id: '77', name: 'brush', animated: false },
        },
        { label: 'Rules', value: 'o2', emoji: { name: '📜' } },
      ],
    });
  });

  it('refuses buttons and menus Discord or the bot can’t use', () => {
    const with_ = (components: StudioComponent[]) =>
      studioProblem({ ...base, components });
    expect(with_([button('a', { actions: [] })])).toMatch(/something to do/);
    expect(with_([button('a', { label: '', emoji: '' })])).toMatch(
      /text or an emoji/,
    );
    expect(with_([button('a', { link: true, url: 'http://x' })])).toMatch(
      /https/,
    );
    expect(with_([{ ...menu, options: [] }])).toMatch(/1 to 25/);
    expect(with_(Array.from({ length: 6 }, () => menu))).toMatch(/5 rows/);
    expect(
      planProblem(
        {
          ...base,
          components: [
            button('a', {
              actions: [
                {
                  id: 's',
                  type: 'send',
                  templates: ['1', '2'],
                  dm: false,
                  ephemeral: false,
                },
              ],
            }),
          ],
        },
        'free',
      ),
    ).toMatch(/up to 1 template/);
  });

  it('reads old link buttons as link buttons', () => {
    const old = {
      ...base,
      components: undefined,
      buttons: [{ id: 'l', label: 'Rules', url: 'https://x.example' }],
    } as unknown as StudioMessage;
    expect(normaliseStudio(old).components).toEqual([
      button('l', {
        label: 'Rules',
        colour: 'grey',
        link: true,
        url: 'https://x.example',
        actions: [],
      }),
    ]);
  });
});

describe('using buttons and menus in Discord', () => {
  const setup = () => {
    const db = openDb(':memory:');
    const calls: { method: string; path: string; body?: unknown }[] = [];
    let next = 0;
    const fail = new Map<string, DiscordError>();
    const run = async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      const err = fail.get(`${method} ${path}`);
      if (err) throw err;
      return { id: `m${++next}` } as never;
    };
    const rest = {
      get: (p: string) => run('GET', p),
      post: (p: string, b: unknown) => run('POST', p, b),
      patch: (p: string, b: unknown) => run('PATCH', p, b),
      put: (p: string, b: unknown) => run('PUT', p, b),
      delete: (p: string) => run('DELETE', p),
    } as unknown as Rest;
    const rules = addTemplate(
      db,
      {
        guildId: 'g',
        moduleId: 'studio',
        name: 'Rules',
        who: 'Quinn',
        message: { ...base, content: 'Be kind.' },
      },
      1,
    );
    const msg: StudioMessage = {
      ...base,
      components: [
        button('roles', {
          actions: [
            { id: 'r', type: 'role', mode: 'give', roles: ['900', '901'] },
            {
              id: 's',
              type: 'send',
              templates: [rules],
              dm: true,
              ephemeral: false,
            },
          ],
        }),
        {
          ...menu,
          options: menu.options.map((o) =>
            o.id === 'o2'
              ? {
                  ...o,
                  actions: [
                    {
                      id: 's1',
                      type: 'send' as const,
                      templates: [rules],
                      dm: false,
                      ephemeral: true,
                    },
                  ],
                }
              : o,
          ),
        },
      ],
    };
    rememberPost(db, 'g', 'posted', msg, 1);
    const i = {
      id: 'i1',
      token: 'tok',
      applicationId: 'app',
      guildId: 'g',
      channelId: 'c',
      userId: 'u',
      messageId: 'posted',
      customId: 'sp:b:roles',
      values: [],
    };
    return { db, rest, calls, fail, i };
  };

  it('runs a button’s actions from top to bottom', async () => {
    const { db, rest, calls, i } = setup();
    await handleStudioInteraction(rest, db, i, 1);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /interactions/i1/tok/callback',
      'PUT /guilds/g/members/u/roles/900',
      'PUT /guilds/g/members/u/roles/901',
      'POST /users/@me/channels',
      // The DM channel is the fourth id the pretend API handed out.
      'POST /channels/m4/messages',
    ]);
    // Nothing is shown, so the click is just acknowledged.
    expect(calls[0]!.body).toEqual({ type: 6 });
    expect(calls[4]!.body).toMatchObject({ content: 'Be kind.' });
  });

  it('answers a menu pick privately and says what didn’t work', async () => {
    const { db, rest, calls, fail, i } = setup();
    fail.set(
      'PUT /guilds/g/members/u/roles/901',
      new DiscordError(403, 50013, 'Missing Permissions'),
    );
    await handleStudioInteraction(
      rest,
      db,
      { ...i, customId: 'sp:m:pick', values: ['o2', 'o1'] },
      1,
    );
    expect(calls[0]!.body).toEqual({ type: 5, data: { flags: 64 } });
    // The template fills the private reply, then the problem follows it.
    expect(calls[1]).toMatchObject({
      method: 'PATCH',
      path: '/webhooks/app/tok/messages/@original',
      body: { content: 'Be kind.' },
    });
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/webhooks/app/tok',
      body: { flags: 64, content: expect.stringMatching(/Manage Roles/) },
    });
  });

  it('says so when the message isn’t one it knows', async () => {
    const { db, rest, calls, i } = setup();
    await handleStudioInteraction(rest, db, { ...i, messageId: 'gone' }, 1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ type: 4, data: { flags: 64 } });
  });
});
