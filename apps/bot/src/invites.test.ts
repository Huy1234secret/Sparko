import { afterEach, describe, expect, it, vi } from 'vitest';
import { attributeInvite } from '@sparko/domain';
import { InviteCollector, type InviteSnapshot } from './invites.js';

const snapshot = (
  uses: number,
  overrides: Partial<InviteSnapshot> = {},
): InviteSnapshot => ({
  invites: [{ code: 'sparko', uses, inviterId: '923456789012345673' }],
  observedAt: '2026-10-11T00:00:00.000Z',
  canReadInvites: true,
  complete: true,
  vanityUses: null,
  ...overrides,
});
const join = (id = 'join-one') => ({
  id,
  userId: '923456789012345674',
  joinedAt: '2026-10-11T00:00:01.000Z',
  accountCreatedAt: '2025-01-01T00:00:00.000Z',
});
afterEach(() => {
  vi.useRealTimers();
});
describe('serialized invite evidence', () => {
  it('attributes only one observed use change after a complete continuous baseline', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(snapshot(0))
      .mockResolvedValueOnce(snapshot(1));
    const collector = new InviteCollector(fetch);
    await collector.prime('guild');
    const evidence = collector.join('guild', join());
    await vi.advanceTimersByTimeAsync(151);
    expect(attributeInvite(await evidence)).toMatchObject({
      status: 'confirmed',
      inviterId: '923456789012345673',
      code: 'sparko',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('batch joins share one snapshot and never guess identities from two invite uses', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(snapshot(0))
      .mockResolvedValueOnce(snapshot(2));
    const collector = new InviteCollector(fetch);
    await collector.prime('guild');
    const one = collector.join('guild', join('one')),
      two = collector.join('guild', join('two'));
    await vi.advanceTimersByTimeAsync(151);
    for (const evidence of await Promise.all([one, two])) {
      expect(evidence.simultaneousJoins).toBe(2);
      expect(attributeInvite(evidence).status).toBe('ambiguous');
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('a reconnect or missing permission discards confidence, including a snapshot already in flight', async () => {
    vi.useFakeTimers();
    let finish: (value: InviteSnapshot) => void = () => undefined;
    const pending = new Promise<InviteSnapshot>((resolve) => {
      finish = resolve;
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(snapshot(0))
      .mockReturnValueOnce(pending)
      .mockRejectedValueOnce(new Error('Missing permission'));
    const collector = new InviteCollector(fetch);
    await collector.prime('guild');
    const first = collector.join('guild', join());
    await vi.advanceTimersByTimeAsync(151);
    collector.invalidate('guild');
    finish(snapshot(1));
    expect(attributeInvite(await first).status).toBe('unknown');
    const second = collector.join('guild', join('next'));
    await vi.advanceTimersByTimeAsync(151);
    expect(attributeInvite(await second).status).toBe('unknown');
  });
});
