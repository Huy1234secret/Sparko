import { describe, expect, it } from 'vitest';
import { isPrivilegedRole, PRIVILEGED_ROLE_PERMISSIONS } from './index.js';

describe('privileged role policy', () => {
  it.each([
    ['Administrator', 0x8n],
    ['Manage Messages', 0x2000n],
    ['Mention Everyone', 0x20000n],
    ['Manage Roles', 0x10000000n],
    ['Moderate Members', 0x10000000000n],
  ])('treats %s as privileged', (_name, bit) => {
    expect(isPrivilegedRole(bit.toString())).toBe(true);
  });
  it('allows ordinary chat permissions and fails closed on malformed input', () => {
    const ordinary = 0x400n | 0x800n | 0x10000n; // View, Send, Read history
    expect(ordinary & PRIVILEGED_ROLE_PERMISSIONS).toBe(0n);
    expect(isPrivilegedRole(ordinary)).toBe(false);
    expect(isPrivilegedRole('not-a-number')).toBe(true);
  });
});
