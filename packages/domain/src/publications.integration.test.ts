import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@sparko/db';
import { type Actor } from '@sparko/contracts';
import {
  defaultTicketDocument,
  initialMessage,
  type MessageDocument,
} from '@sparko/messages';
import { Platform } from './core.js';
import { publicationRoutes, publishDocument } from './publications.js';
import { testDatabaseUrl } from '../../../tools/test-targets.js';

const db = createDatabase(testDatabaseUrl()),
  platform = new Platform(db);
const guildId = '715678901234567890',
  otherGuildId = '715678901234567891';
const actor: Actor = {
  guildId,
  userId: '715678901234567892',
  isAdmin: true,
  isOwner: true,
  roles: [],
  capabilities: [],
  globalCapabilities: [],
};
const channel = '715678901234567893';
const route = (suffix: string) => {
  const r = publicationRoutes.find(
    (r) => r.method === 'POST' && r.path.endsWith(suffix),
  );
  if (!r) throw new Error(`Missing route ${suffix}`);
  return r;
};
const update = (
  id: string,
  expectedRevision: number,
  document: MessageDocument,
  replace = false,
) =>
  platform.route(
    actor,
    route('/publications/:id/update'),
    { expectedRevision, document, replace },
    { id },
    randomUUID(),
  );
beforeAll(async () => {
  await db.guild.createMany({
    data: [
      { id: guildId, name: 'Publication test' },
      { id: otherGuildId, name: 'Other publication test' },
    ],
    skipDuplicates: true,
  });
});
afterAll(async () => {
  await db.$disconnect();
});

describe('durable publication lifecycle with PostgreSQL', () => {
  it('restores named versions immutably and preserves revision conflicts and tenant scope', async () => {
    const original = initialMessage('embed');
    const created = await platform.route(
      actor,
      route('/templates'),
      { name: 'History', document: original, label: 'Original' },
      {},
      randomUUID(),
    );
    const saved = await db.template.findUniqueOrThrow({
      where: { id: (created.data as { id: string }).id },
      include: { versions: true },
    });
    const first = saved.versions[0]!;
    await platform.route(
      actor,
      route('/templates/:id/versions'),
      {
        expectedRevision: 1,
        document: { ...original, name: 'Changed' },
        label: 'Revision two',
      },
      { id: saved.id },
      randomUUID(),
    );
    const outcomes = await Promise.allSettled(
      [0, 1].map(() =>
        platform.route(
          actor,
          route('/templates/:id/restore'),
          { expectedRevision: 2, versionId: first.id },
          { id: saved.id },
          randomUUID(),
        ),
      ),
    );
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'REVISION_CONFLICT' },
    });
    const versions = await db.templateVersion.findMany({
      where: { templateId: saved.id },
      orderBy: { number: 'desc' },
    });
    expect(versions.map((v) => v.number)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({
      label: 'Restored version 1',
      document: original,
    });
    expect(versions[2]).toEqual(first);
    await expect(
      platform.route(
        { ...actor, guildId: otherGuildId },
        route('/templates/:id/restore'),
        { expectedRevision: 3, versionId: first.id },
        { id: saved.id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('duplicates the chosen immutable snapshot and rejects a version from a different template', async () => {
    const make = async (name: string) => {
      const result = await platform.route(
        actor,
        route('/templates'),
        { name, document: initialMessage('embed') },
        {},
        randomUUID(),
      );
      return db.template.findUniqueOrThrow({
        where: { id: (result.data as { id: string }).id },
        include: { versions: true },
      });
    };
    const original = await make('Original'),
      unrelated = await make('Other');
    const copy = await platform.route(
      actor,
      route('/templates/:id/duplicate'),
      {
        expectedRevision: 1,
        name: 'My copy',
        sourceVersionId: original.versions[0]!.id,
      },
      { id: original.id },
      randomUUID(),
    );
    expect(copy.data).toMatchObject({
      name: 'My copy',
      revision: 1,
      versions: [
        {
          number: 1,
          document: { ...initialMessage('embed'), name: 'My copy' },
        },
      ],
    });
    await expect(
      platform.route(
        actor,
        route('/templates/:id/duplicate'),
        {
          expectedRevision: 1,
          name: 'Invalid copy',
          sourceVersionId: unrelated.versions[0]!.id,
        },
        { id: original.id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('reports real delivery errors separately from business state and queues one read-only reconciliation', async () => {
    const sent = await platform.mutate(
      actor,
      'delivery-status-fixture',
      randomUUID(),
      {},
      (ctx) => publishDocument(ctx, channel, initialMessage('embed')),
    );
    await db.outbox.updateMany({
      where: { operationId: sent.operation.id },
      data: { state: 'blocked', lastError: 'Discord denied the action.' },
    });
    const list = publicationRoutes.find(
      (r) => r.method === 'GET' && r.path.endsWith('/publications'),
    )!;
    const rows = (await platform.route(actor, list, {}, {}, randomUUID()))
      .data as {
      id: string;
      state: string;
      deliveryStatus: string;
      error: string | null;
    }[];
    expect(rows.find((r) => r.id === sent.data.id)).toMatchObject({
      state: 'pending',
      deliveryStatus: 'blocked',
      error: 'Discord denied the action.',
    });
    const key = randomUUID(),
      request = { expectedRevision: 1 },
      params = { id: sent.data.id };
    const reconciled = await platform.route(
      actor,
      route('/publications/:id/reconcile'),
      request,
      params,
      key,
    );
    const replay = await platform.route(
      actor,
      route('/publications/:id/reconcile'),
      request,
      params,
      key,
    );
    if (!('operation' in replay) || !('operation' in reconciled)) {
      throw new Error('Mutation response is missing its operation');
    }
    expect(replay.operation.id).toBe(reconciled.operation.id);
    expect(
      await db.outbox.count({
        where: {
          operationId: reconciled.operation.id,
          type: 'publication.reconcile',
        },
      }),
    ).toBe(1);
    expect(
      await db.outbox.count({
        where: {
          operationId: reconciled.operation.id,
          type: 'publication.send',
        },
      }),
    ).toBe(0);
  });
  it('keeps controls when ordinary content changes and rejects a concurrent stale edit', async () => {
    const original = structuredClone(defaultTicketDocument);
    const result = await platform.mutate(
      actor,
      'publication-fixture',
      randomUUID(),
      {},
      (ctx) => publishDocument(ctx, channel, original),
    );
    const saved = await db.publication.update({
      where: { id: result.data.id },
      data: { state: 'applied', messageId: channel },
    });
    const controls = await db.issuedControl.findMany({
      where: { publicationId: saved.id },
    });
    const document = structuredClone(original);
    const container = document.blocks[0];
    if (
      container?.type !== 'container' ||
      container.children[0]?.type !== 'text'
    )
      throw new Error('Fixture invalid');
    container.children[0].text = '## Updated support';
    const results = await Promise.allSettled([
      update(saved.id, 1, document),
      update(saved.id, 1, document),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'REVISION_CONFLICT' },
    });
    expect(
      await db.issuedControl.findMany({ where: { publicationId: saved.id } }),
    ).toEqual(controls);
    expect(
      await db.publication.findUniqueOrThrow({ where: { id: saved.id } }),
    ).toMatchObject({ revision: 2, state: 'pending', appliedRevision: 0 });
  });
  it('requires deliberate replacement for mode changes and revokes the old controls', async () => {
    const result = await platform.mutate(
      actor,
      'replacement-fixture',
      randomUUID(),
      {},
      (ctx) => publishDocument(ctx, channel, defaultTicketDocument),
    );
    await expect(
      update(result.data.id, 1, initialMessage('embed')),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      details: { replacementRequired: true },
    });
    const replaced = await update(
      result.data.id,
      1,
      initialMessage('embed'),
      true,
    );
    expect(replaced.data).toMatchObject({ state: 'pending', revision: 1 });
    expect(
      await db.publication.findUniqueOrThrow({ where: { id: result.data.id } }),
    ).toMatchObject({ state: 'replaced', revision: 2 });
    expect(
      await db.issuedControl.count({
        where: { publicationId: result.data.id, revoked: false },
      }),
    ).toBe(0);
    expect(
      await db.outbox.count({
        where: {
          type: 'publication.archive',
          operationId: 'operation' in replaced ? replaced.operation.id : '',
        },
      }),
    ).toBe(1);
  });
  it('publishes an immutable saved version and rejects another tenant’s version', async () => {
    const created = await platform.route(
      actor,
      route('/templates'),
      { name: 'Saved design', document: initialMessage('embed') },
      {},
      randomUUID(),
    );
    const template = await db.template.findFirstOrThrow({
      where: { id: (created.data as { id: string }).id },
      include: { versions: true },
    });
    const version = template.versions[0];
    if (!version) throw new Error('Missing saved version');
    const request = { channelId: channel, templateVersionId: version.id };
    const published = await platform.route(
      actor,
      route('/messages/publish'),
      request,
      {},
      randomUUID(),
    );
    expect(published.data).toMatchObject({
      templateVersionId: version.id,
      document: initialMessage('embed'),
    });
    await expect(
      platform.route(
        { ...actor, guildId: otherGuildId },
        route('/messages/publish'),
        request,
        {},
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('keeps test controls actor-bound and public publication rejects private designs', async () => {
    const preview = await platform.mutate(
      actor,
      'test-control',
      randomUUID(),
      {},
      (ctx) => publishDocument(ctx, channel, defaultTicketDocument, true),
    );
    expect(
      await db.issuedControl.findFirstOrThrow({
        where: { publicationId: preview.data.id },
      }),
    ).toMatchObject({ actorId: actor.userId });
    await expect(
      platform.mutate(actor, 'private-design', randomUUID(), {}, (ctx) =>
        publishDocument(ctx, channel, {
          ...defaultTicketDocument,
          visibility: 'private',
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('keeps saved designs within the plan and never deletes existing ones on downgrade', async () => {
    const limited = '715678901234567899';
    await db.guild.upsert({
      where: { id: limited },
      create: { id: limited, name: 'Plan limit test' },
      update: {},
    });
    await db.template.deleteMany({ where: { guildId: limited } });
    await db.record.deleteMany({ where: { guildId: limited } });
    const who = { ...actor, guildId: limited };
    const create = (n: number) =>
      platform.route(
        who,
        route('/templates'),
        { name: `Design ${n}`, document: initialMessage('embed') },
        {},
        randomUUID(),
      );
    for (let n = 1; n <= 10; n++) await create(n);
    await expect(create(11)).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      message: expect.stringContaining('up to 10 saved designs'),
    });
    const plus = await db.record.create({
      data: {
        guildId: limited,
        kind: 'billing.entitlement',
        key: 'plan-limit-plus',
        state: 'active',
        data: {
          provider: 'staff',
          active: true,
          revoked: false,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    });
    await create(11);
    await db.record.update({
      where: { id: plus.id },
      data: { state: 'revoked' },
    });
    // Downgrade: all eleven remain; only new ones are refused.
    expect(await db.template.count({ where: { guildId: limited } })).toBe(11);
    await expect(create(12)).rejects.toMatchObject({ code: 'PLAN_LIMIT' });
  });
});
