import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, json } from '@sparko/db';
import type { Actor } from '@sparko/contracts';
import { testDatabaseUrl } from '../../../tools/test-targets.js';
import { Platform, type DomainContext } from './core.js';
import { GiveawaySchema, claimCrate, communityRoutes, drawGiveaway, getLevelProfile, ingestCommunityEvent, runCommunityJob, selectRoleMenu } from './community.js';

const db = createDatabase(testDatabaseUrl()), platform = new Platform(db);
const guildId = '723456789012345671', otherGuildId = '823456789012345672';
const memberId = '923456789012345673', anotherId = '923456789012345674', channelId = '923456789012345675';
const roleOne = '923456789012345676', roleTwo = '923456789012345677';
const actor = (userId = memberId, target = guildId): Actor => ({ userId, guildId: target, roles: [], isAdmin: false, isOwner: false, capabilities: [], globalCapabilities: [] });
const manager = (): Actor => ({ ...actor(), isAdmin: true });
const now = () => new Date().toISOString();
const future = () => new Date(Date.now() + 600_000).toISOString();
const mutate = (who: Actor, key: string, handler: (ctx: DomainContext) => Promise<unknown>) => platform.mutate(who, 'community-integration', key, { key }, handler);
async function record(kind: string, key: string, data: unknown, state = 'active', ownerId = memberId) {
  return db.record.create({ data: { guildId, kind, key, ownerId, state, data: json(data) } });
}
function message(messageId: string, userId: string, content: string, occurredAt = now(), eventId = messageId) {
  return { kind: 'message', eventId, occurredAt, messageId, memberId: userId, roleIds: [], channelId, content, bot: false, webhook: false };
}

beforeAll(async () => {
  for (const id of [guildId, otherGuildId]) await db.guild.upsert({ where: { id }, create: { id, name: 'Disposable community integration', installed: true }, update: {} });
});
beforeEach(async () => {
  for (const id of [guildId, otherGuildId]) {
    await db.outbox.deleteMany({ where: { guildId: id } }); await db.auditLog.deleteMany({ where: { guildId: id } });
    await db.operation.deleteMany({ where: { guildId: id } }); await db.record.deleteMany({ where: { guildId: id } });
    await db.featureConfig.deleteMany({ where: { guildId: id } });
    for (const [featureId, config] of Object.entries({ R09: { enabled: true, minXp: 40, maxXp: 40, cooldownSeconds: 60 }, R10: { enabled: true }, R15: { enabled: true, channelId, milestones: [{ value: 1, xp: 50 }] }, R16: { enabled: true }, R31: { enabled: true }, R34: { enabled: true, public: true } })) {
      await db.featureConfig.create({ data: { guildId: id, featureId, config: json(config) } });
    }
  }
});
afterAll(async () => { await db.guild.deleteMany({ where: { id: { in: [guildId, otherGuildId] } } }); await db.$disconnect(); });

describe('PostgreSQL community concurrency and replay', () => {
  it('replayed gateway messages commit one source reward across independent operation receipts', async () => {
    const event = message('923456789012345680', memberId, 'Conversation', new Date(Date.now() - 120_000).toISOString());
    await Promise.all([0, 1, 2, 3].map(i => mutate(actor(), `message-retry-${i}`, ctx => ingestCommunityEvent(ctx, { ...event, eventId: `receipt-${i}` }))));
    const profile = await platform.read(actor(), ctx => getLevelProfile(ctx, memberId));
    expect(profile.xp).toBe(40);
    expect(await db.record.count({ where: { guildId, kind: 'level.history' } })).toBe(1);
    expect(await db.record.count({ where: { guildId, kind: 'community.event' } })).toBe(4);
    const retry = await mutate(actor(), 'message-retry-0', ctx => ingestCommunityEvent(ctx, event));
    expect(retry.operation.businessStatus).toBe('committed');
    expect(await db.record.count({ where: { guildId, kind: 'level.history' } })).toBe(1);
  });

  it('serializes the final crate capacity and retries without awarding again', async () => {
    const drop = await record('crate.drop', 'last-crate', { type: { minXp: 60, maxXp: 60 }, expiresAt: future(), capacity: 1, claims: 0, preview: false, repeatCooldownSeconds: 0, excludedRoleIds: [], publicationState: 'applied' }, 'open');
    const members = [memberId, anotherId, '923456789012345681', '923456789012345682'];
    const results = await Promise.allSettled(members.map((id, i) => mutate(actor(id), `crate-claim-${i}`, ctx => claimCrate(ctx, drop.id))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const winner = results.findIndex(r => r.status === 'fulfilled');
    const retry = await mutate(actor(members[winner]!), `crate-claim-${winner}`, ctx => claimCrate(ctx, drop.id));
    expect(retry.operation.businessStatus).toBe('committed');
    expect(await db.record.count({ where: { guildId, kind: 'crate.claim' } })).toBe(1);
    expect(await db.record.count({ where: { guildId, kind: 'level.history' } })).toBe(1);
    const profile = await platform.read(actor(members[winner]!), ctx => getLevelProfile(ctx, members[winner]!)); expect(profile.xp).toBe(60);
    const tenantAttempt = await Promise.allSettled([mutate(actor(memberId, otherGuildId), 'wrong-tenant', ctx => claimCrate(ctx, drop.id))]);
    expect(tenantAttempt[0]?.status).toBe('rejected');
  });

  it('preview claims cannot persist a reward or consume capacity', async () => {
    const drop = await record('crate.drop', 'preview', { type: { minXp: 999, maxXp: 999 }, expiresAt: future(), capacity: 1, claims: 0, preview: true, publicationState: 'applied' }, 'open');
    await expect(mutate(actor(), 'preview-claim', ctx => claimCrate(ctx, drop.id))).rejects.toThrow('zero-reward');
    expect(await db.record.count({ where: { guildId, kind: 'crate.claim' } })).toBe(0);
    expect(await db.record.count({ where: { guildId, kind: 'level.profile' } })).toBe(0);
    expect(await db.operation.count({ where: { guildId } })).toBe(0);
  });

  it('keeps late counting events from resetting accepted turns or replaying checkpoint XP', async () => {
    await db.featureConfig.update({ where: { guildId_featureId: { guildId, featureId: 'R09' } }, data: { config: { enabled: false } } });
    const one = message('923456789012345690', memberId, '1');
    await mutate(actor(), 'count-one', ctx => ingestCommunityEvent(ctx, one));
    await mutate(actor(anotherId), 'count-two', ctx => ingestCommunityEvent(ctx, message('923456789012345691', anotherId, '2')));
    await Promise.all([0, 1].map(i => mutate(actor(), `count-duplicate-${i}`, ctx => ingestCommunityEvent(ctx, { ...one, eventId: `late-receipt-${i}` }))));
    await mutate(actor(), 'count-late-wrong', ctx => ingestCommunityEvent(ctx, message('923456789012345689', memberId, '999')));
    const state = await db.record.findUniqueOrThrow({ where: { guildId_kind_key: { guildId, kind: 'counting.channel', key: channelId } } });
    expect(state.data).toMatchObject({ value: 2, run: 0, previousMemberId: anotherId, best: 2 });
    expect(await db.record.count({ where: { guildId, kind: 'counting.turn' } })).toBe(2);
    expect(await db.record.count({ where: { guildId, kind: 'level.history' } })).toBe(1);
    expect((await platform.read(actor(), ctx => getLevelProfile(ctx, memberId))).xp).toBe(50);
  });

  it('manual end and timer end converge on one immutable draw under concurrency', async () => {
    const rules = GiveawaySchema.parse({ prize: 'Integration badge', channelId, endsAt: new Date(Date.now() - 1000).toISOString(), winnerCount: 2 });
    const giveaway = await record('giveaway', 'draw-concurrent', rules, 'open');
    for (const id of [memberId, anotherId, '923456789012345692', '923456789012345693']) await record('giveaway.entry', `${giveaway.id}:${id}`, { giveawayId: giveaway.id, userId: id, facts: { checkedAt: new Date(Date.now() - 2000).toISOString(), policy: 'entry-snapshot' } }, 'active', id);
    const [manual, timer] = await Promise.all([
      mutate(manager(), 'end-manual', ctx => drawGiveaway(ctx, giveaway.id)),
      mutate(manager(), 'end-timer', ctx => runCommunityJob(ctx, 'community.giveaway.draw', { giveawayId: giveaway.id })),
    ]);
    expect(manual.data).toMatchObject({ id: (timer.data as { id: string }).id });
    expect(await db.record.count({ where: { guildId, kind: 'giveaway.draw' } })).toBe(1);
    const winners = await db.record.findMany({ where: { guildId, kind: 'giveaway.winner' } });
    expect(winners).toHaveLength(2); expect(new Set(winners.map(w => w.ownerId)).size).toBe(2);
    expect(await db.outbox.count({ where: { guildId, type: 'community.giveaway.announce' } })).toBe(1);
  });

  it('concurrent suggestion vote changes persist one actor vote and deny private votes', async () => {
    const suggestion = await record('suggestion', 'public-suggestion', { content: 'Enable community welcome', visibility: 'public' }, 'open', anotherId);
    const route = communityRoutes.find(r => r.path === '/guilds/:guildId/suggestions/:id/vote')!;
    await Promise.all([1, -1].map((value, i) => platform.route(actor(), route, { value }, { id: suggestion.id }, `vote-change-${i}`)));
    expect(await db.record.count({ where: { guildId, kind: 'suggestion.vote', ownerId: memberId } })).toBe(1);
    const privateSuggestion = await record('suggestion', 'private-suggestion', { content: 'Private staff concern', visibility: 'private' }, 'open', anotherId);
    await expect(platform.route(actor(), route, { value: 1 }, { id: privateSuggestion.id }, 'private-vote')).rejects.toThrow('private');
  });

  it('an expiry from an earlier selection cannot remove the replacement role instance', async () => {
    const menu = await record('role.menu', 'timed-menu', { name: 'Notify me', channelId, options: [{ roleId: roleOne, label: 'News', expiresSeconds: 60 }, { roleId: roleTwo, label: 'Events', expiresSeconds: 60 }], minSelections: 0, maxSelections: 1 }, 'published');
    const first = await mutate(actor(), 'role-first', ctx => selectRoleMenu(ctx, menu.id, { roleIds: [roleOne] }));
    const original = first.data as { id: string; revision: number };
    await mutate(actor(), 'role-second', ctx => selectRoleMenu(ctx, menu.id, { roleIds: [roleTwo] }));
    const expired = await mutate(manager(), 'stale-expiry', ctx => runCommunityJob(ctx, 'community.roles.expire', { recordId: original.id, revision: original.revision, userId: memberId, roleId: roleOne }));
    expect(expired.data).toEqual({ superseded: true });
    const current = await db.record.findUniqueOrThrow({ where: { id: original.id } }); expect(current.data).toMatchObject({ selectedRoleIds: [roleTwo] });
    expect(await db.outbox.count({ where: { guildId, type: 'community.roles.reconcile' } })).toBe(2);
  });
});
