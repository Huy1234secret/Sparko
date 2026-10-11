import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, json } from '@sparko/db';
import { TicketConfigSchema, type Actor } from '@sparko/contracts';
import { Platform } from './core.js';
import { ticketRoutes } from './tickets.js';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
const db = createDatabase(testDatabaseUrl()),
  platform = new Platform(db),
  guildId = '825678901234567890';
const oldRole = '825678901234567891',
  newRole = '825678901234567892',
  ownerId = '825678901234567893';
const actor = (roles: string[], capabilities: string[] = []): Actor => ({
  guildId,
  userId: '825678901234567894',
  roles,
  capabilities,
  globalCapabilities: [],
  isAdmin: false,
  isOwner: false,
});
let id: string;
const route = (path: string, method = 'GET') => {
  const r = ticketRoutes.find((r) => r.path === path && r.method === method);
  if (!r) throw new Error('Missing route');
  return r;
};
beforeAll(async () => {
  await db.guild.deleteMany({ where: { id: guildId } });
  await db.guild.create({
    data: { id: guildId, name: 'Ticket snapshot authorization' },
  });
  await db.featureConfig.create({
    data: {
      guildId,
      featureId: 'tickets',
      config: json(
        TicketConfigSchema.parse({ enabled: true, staffRoleIds: [newRole] }),
      ),
    },
  });
  const ticket = await db.ticket.create({
    data: {
      guildId,
      number: 1,
      ownerId,
      state: 'open',
      participants: [ownerId],
      answers: { sensitive: 'Private answer' },
      snapshot: json(
        TicketConfigSchema.parse({ enabled: true, staffRoleIds: [oldRole] }),
      ),
    },
  });
  id = ticket.id;
  await db.transcript.create({
    data: {
      guildId,
      ticketId: id,
      messages: { accessibleHistory: [] },
      status: 'complete',
      checksum: 'test',
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
});
afterAll(async () => {
  await db.$disconnect();
});
describe('ticket snapshot privacy and delegated read access', () => {
  it('does not widen existing ticket visibility when a new panel staff role is configured', async () => {
    const list = await platform.route(
      actor([newRole]),
      route('/guilds/:guildId/tickets'),
      {},
      {},
      '',
    );
    expect(list.data).toEqual([]);
    await expect(
      platform.route(
        actor([newRole]),
        route('/guilds/:guildId/tickets/:id'),
        {},
        { id },
        '',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const oldStaff = await platform.route(
      actor([oldRole]),
      route('/guilds/:guildId/tickets'),
      {},
      {},
      '',
    );
    expect(oldStaff.data).toMatchObject([
      { id, answers: { sensitive: 'Private answer' } },
    ]);
  });
  it('allows delegated ticket readers to read details/transcripts without managing the ticket', async () => {
    const reader = actor([], ['tickets.read']);
    expect(
      (
        await platform.route(
          reader,
          route('/guilds/:guildId/tickets/:id'),
          {},
          { id },
          '',
        )
      ).data,
    ).toMatchObject({ id });
    expect(
      (
        await platform.route(
          reader,
          route('/guilds/:guildId/tickets/:id/transcripts'),
          {},
          { id },
          '',
        )
      ).data,
    ).toHaveLength(1);
    await expect(
      platform.route(
        reader,
        route('/guilds/:guildId/tickets/:id/claim', 'POST'),
        { expectedRevision: 1 },
        { id },
        'reader-claim',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
