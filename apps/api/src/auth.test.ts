import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, digest } from './auth.js';
import {
  isAdministrator,
  requireCapability,
  requireGlobal,
} from '@sparko/policy';
import type { Actor } from '@sparko/contracts';
const actor: Actor = {
  userId: 'u',
  guildId: 'a',
  roles: [],
  isAdmin: false,
  isOwner: false,
  capabilities: ['tickets.read'],
  globalCapabilities: [],
};
describe('identity and policy', () => {
  it('encrypts credentials with authenticated independent IVs', () => {
    const key = 'ab'.repeat(32),
      a = encrypt('private access', key),
      b = encrypt('private access', key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('private access');
    expect(decrypt(a, key)).toBe('private access');
    expect(() => decrypt(a, 'cd'.repeat(32))).toThrow();
  });
  it('never grants default access from Manage Server', () => {
    expect(isAdministrator(false, '32')).toBe(false);
    expect(isAdministrator(false, '8')).toBe(true);
    expect(isAdministrator(true, '0')).toBe(true);
  });
  it('keeps tenant and global capabilities separate', () => {
    expect(() => requireCapability(actor, 'a', 'tickets.read')).not.toThrow();
    expect(() => requireCapability(actor, 'b', 'tickets.read')).toThrow();
    expect(() => requireCapability(actor, 'a', 'config.manage')).toThrow();
    expect(() =>
      requireGlobal({ ...actor, isAdmin: true }, 'fleet.read'),
    ).toThrow();
  });
  it('session identifiers are hashes rather than raw tokens', () =>
    expect(digest('private session')).toMatch(/^[a-f0-9]{64}$/));
});
