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
});
