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
describe('ticket staff workflow', () => {
  const staffA = '825678901234567895',
    staffB = '825678901234567896',
    staff = (userId: string): Actor => ({ ...actor([newRole]), userId }),
    member: Actor = { ...actor([]), userId: '825678901234567897' };
  let ticketId: string;
  beforeAll(async () => {
    await db.featureConfig.update({
      where: { guildId_featureId: { guildId, featureId: 'tickets' } },
      data: {
        config: json(
          TicketConfigSchema.parse({
            enabled: true,
            staffRoleIds: [newRole],
            workflow: { reminderMinutes: 15, escalationMinutes: 60 },
          }),
        ),
      },
    });
  });
  it('schedules reminder and escalation timers from the creation snapshot', async () => {
    const opened = await platform.route(
      member,
      route('/guilds/:guildId/tickets', 'POST'),
      { categoryId: 'general', answers: {} },
      {},
      'workflow-open',
    );
    ticketId = (opened.data as { id: string }).id;
    const timers = await db.outbox.findMany({
      where: { guildId, type: 'ticket.sla' },
      orderBy: { dueAt: 'asc' },
    });
    expect(timers.map((timer) => timer.payload)).toEqual([
      { ticketId, stage: 'reminder' },
      { ticketId, stage: 'escalation' },
    ]);
    const created = await db.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    const minutesAfter = (date: Date) =>
      Math.round((date.getTime() - created.createdAt.getTime()) / 60000);
    expect(timers.map((timer) => minutesAfter(timer.dueAt))).toEqual([15, 60]);
  });
  it('lets only staff set priority and availability', async () => {
    await expect(
      platform.route(
        member,
        route('/guilds/:guildId/tickets/:id/priority', 'POST'),
        { expectedRevision: 1, priority: 'urgent' },
        { id: ticketId },
        'member-priority',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      platform.route(
        member,
        route('/guilds/:guildId/tickets/staff/me', 'PUT'),
        { status: 'available' },
        {},
        'member-availability',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.ticket.update({
      where: { id: ticketId },
      data: { state: 'open' },
    });
    const raised = await platform.route(
      staff(staffA),
      route('/guilds/:guildId/tickets/:id/priority', 'POST'),
      { expectedRevision: 1, priority: 'urgent' },
      { id: ticketId },
      'staff-priority',
    );
    expect(raised.data).toMatchObject({ priority: 'urgent', revision: 2 });
  });
  it('assigns only to available staff and records the first claim time', async () => {
    await platform.route(
      staff(staffB),
      route('/guilds/:guildId/tickets/staff/me', 'PUT'),
      { status: 'away', note: 'Lunch' },
      {},
      'staff-b-away',
    );
    await expect(
      platform.route(
        staff(staffA),
        route('/guilds/:guildId/tickets/:id/assign', 'POST'),
        { expectedRevision: 2, assigneeId: staffB },
        { id: ticketId },
        'assign-away',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await platform.route(
      staff(staffB),
      route('/guilds/:guildId/tickets/staff/me', 'PUT'),
      { status: 'available' },
      {},
      'staff-b-available',
    );
    const assigned = await platform.route(
      staff(staffA),
      route('/guilds/:guildId/tickets/:id/assign', 'POST'),
      { expectedRevision: 2, assigneeId: staffB },
      { id: ticketId },
      'assign-available',
    );
    expect(assigned.data).toMatchObject({
      claimantId: staffB,
      state: 'claimed',
    });
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } }))
        .claimedAt,
    ).not.toBeNull();
    const people = await platform.route(
      staff(staffA),
      route('/guilds/:guildId/tickets/staff'),
      {},
      {},
      '',
    );
    expect(people.data).toEqual([
      expect.objectContaining({
        userId: staffB,
        status: 'available',
        claimed: 1,
      }),
    ]);
  });
  it('marks a claimed ticket as waiting for the member and back', async () => {
    const current = await db.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    const waiting = await platform.route(
      staff(staffB),
      route('/guilds/:guildId/tickets/:id/waiting', 'POST'),
      { expectedRevision: current.revision, state: 'awaiting_member' },
      { id: ticketId },
      'ask-member',
    );
    expect(waiting.data).toMatchObject({ state: 'awaiting_member' });
    await expect(
      platform.route(
        staff(staffB),
        route('/guilds/:guildId/tickets/:id/waiting', 'POST'),
        { expectedRevision: current.revision + 1, state: 'awaiting_member' },
        { id: ticketId },
        'ask-member-again',
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const resumed = await platform.route(
      staff(staffB),
      route('/guilds/:guildId/tickets/:id/waiting', 'POST'),
      { expectedRevision: current.revision + 1, state: 'claimed' },
      { id: ticketId },
      'member-replied',
    );
    expect(resumed.data).toMatchObject({ state: 'claimed' });
  });
  it('reports staff metrics with stated definitions and hides them from members', async () => {
    const metrics = await platform.route(
      staff(staffA),
      route('/guilds/:guildId/tickets/metrics'),
      {},
      {},
      '',
    );
    expect(metrics.data).toMatchObject({
      windowDays: 30,
      urgent: 1,
      staff: [{ userId: staffB, claimed: 1, closed: 0 }],
    });
    expect(
      (metrics.data as { medianFirstClaimMinutes: number })
        .medianFirstClaimMinutes,
    ).toBeGreaterThanOrEqual(0);
    await expect(
      platform.route(
        member,
        route('/guilds/:guildId/tickets/metrics'),
        {},
        {},
        '',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
