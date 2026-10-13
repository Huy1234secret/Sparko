import { describe, expect, it } from 'vitest';
import {
  DiscordError,
  getPosted,
  getTicket,
  listAudit,
  openDb,
  panelProblem,
  Plain,
  ticketActions,
  ticketMessages,
  ticketPanelDefault,
  writeModule,
  type Rest,
  type TicketPanel,
} from './index.ts';

const panel: TicketPanel = {
  ...ticketPanelDefault('100'),
  roles: ['300'],
  autoClose: '24h',
};

/** A pretend Discord that records what Sparko asked it to do. */
function fakeDiscord(
  fail?: (method: string, path: string) => DiscordError | undefined,
) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let next = 1000;
  const run = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const error = fail?.(method, path);
    if (error) throw error;
    return { id: String(next++) } as never;
  };
  const rest = {
    get: (path: string) => run('GET', path),
    post: (path: string, body: unknown) => run('POST', path, body),
    patch: (path: string, body: unknown) => run('PATCH', path, body),
    put: (path: string, body: unknown) => run('PUT', path, body),
    delete: (path: string) => run('DELETE', path),
  } as unknown as Rest;
  return { rest, calls };
}

function setup(fail?: Parameters<typeof fakeDiscord>[0]) {
  const db = openDb(':memory:');
  writeModule(db, 'g', 'tickets', { on: true, config: panel }, 1);
  let clock = 1_000_000;
  const discord = fakeDiscord(fail);
  const actions = ticketActions(discord.rest, db, () => clock);
  return {
    db,
    ...discord,
    actions,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

describe('ticket panel', () => {
  it('checks settings and posts the panel once, then edits it in place', async () => {
    expect(panelProblem({ ...panel, roles: [] })).toMatch(/staff role/);
    expect(panelProblem({ ...panel, topics: [] })).toMatch(/one and five/);
    expect(panelProblem(panel)).toBeNull();
    const { db, calls, actions } = setup();
    await actions.applyPanel('g');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/channels/100/messages',
    });
    const posted = getPosted(db, 'g', 'tickets-panel')!;
    await actions.applyPanel('g');
    expect(calls[1]).toMatchObject({
      method: 'PATCH',
      path: `/channels/100/messages/${posted.messageId}`,
    });
    // Turned off: the panel is removed.
    writeModule(db, 'g', 'tickets', { on: false }, 2);
    await actions.applyPanel('g');
    expect(calls[2]?.method).toBe('DELETE');
    expect(getPosted(db, 'g', 'tickets-panel')).toBeUndefined();
  });

  it('explains a missing permission instead of crashing', async () => {
    const { actions } = setup(
      () => new DiscordError(403, 50013, 'Missing Permissions'),
    );
    await expect(actions.applyPanel('g')).rejects.toBeInstanceOf(Plain);
  });
});

describe('a ticket’s life', () => {
  it('opens a private thread, keeps the conversation, and closes when the member goes quiet', async () => {
    const { db, calls, actions, tick } = setup();
    const opened = await actions.openTicket({
      guildId: 'g',
      channelId: '100',
      topicId: 'help',
      member: { id: '77', name: 'tomoko' },
    });
    expect(opened).toMatchObject({ number: 1, existing: false });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /channels/100/threads',
      `PUT /channels/${opened.threadId}/thread-members/77`,
      `POST /channels/${opened.threadId}/messages`,
    ]);
    // Staff roles are pinged; nobody else can be.
    expect(calls[2]?.body).toMatchObject({
      allowed_mentions: { users: ['77'], roles: ['300'] },
    });
    // One open ticket per member.
    expect(
      await actions.openTicket({
        guildId: 'g',
        channelId: '100',
        topicId: 'help',
        member: { id: '77', name: 'tomoko' },
      }),
    ).toMatchObject({ number: 1, existing: true });

    actions.recordMessage({
      threadId: opened.threadId,
      author: { id: '77', name: 'tomoko' },
      text: 'I can’t see #events after verifying',
    });
    let t = getTicket(db, 'g', 1)!;
    expect(t).toMatchObject({
      topic: 'I can’t see #events after verifying',
      lastBy: 'member',
      status: 'new',
    });

    await actions.reply(t, { id: '5', name: 'Rhea' }, 'Try again now.');
    t = getTicket(db, 'g', 1)!;
    expect(t).toMatchObject({
      status: 'waiting',
      assigneeName: 'Rhea',
      lastBy: 'staff',
    });
    expect(ticketMessages(db, 'g', 1).map((m) => m.kind)).toEqual([
      'opener',
      'message',
      'message',
    ]);

    // 22 hours later the member is warned; at 24 hours it closes.
    tick(22 * 3_600_000 + 1);
    await actions.sweep();
    expect(getTicket(db, 'g', 1)?.warnedAt).not.toBeNull();
    tick(2 * 3_600_000);
    await actions.sweep();
    expect(getTicket(db, 'g', 1)).toMatchObject({
      status: 'closed',
      closedBy: 'Sparko',
      closeReason: 'No reply from the member',
    });
    expect(calls.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { archived: true, locked: true },
    });
    expect(listAudit(db, 'g')[0]?.what).toBe('closed ticket #1');

    await actions.reopen(getTicket(db, 'g', 1)!, { id: '5', name: 'Rhea' });
    expect(getTicket(db, 'g', 1)?.status).toBe('claimed');
  });

  it('refuses buttons when Tickets is off or out of date', async () => {
    const { db, actions } = setup();
    await expect(
      actions.openTicket({
        guildId: 'g',
        channelId: '100',
        topicId: 'gone',
        member: { id: '1', name: 'a' },
      }),
    ).rejects.toThrow(/out of date/);
    writeModule(db, 'g', 'tickets', { on: false }, 2);
    await expect(
      actions.openTicket({
        guildId: 'g',
        channelId: '100',
        topicId: 'help',
        member: { id: '1', name: 'a' },
      }),
    ).rejects.toThrow(/closed right now/);
  });
});
