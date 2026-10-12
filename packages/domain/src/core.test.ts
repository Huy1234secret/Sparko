import { describe, expect, it } from 'vitest';
import { hash, isTransactionConflict } from './core.js';

describe('operation input identities', () => {
  it('reuses the same identity when clients reorder JSON object keys', () => {
    expect(
      hash({ config: { enabled: true, staffRoles: ['a', 'b'] }, revision: 1 }),
    ).toBe(
      hash({ revision: 1, config: { staffRoles: ['a', 'b'], enabled: true } }),
    );
    expect(hash({ choices: ['a', 'b'] })).not.toBe(
      hash({ choices: ['b', 'a'] }),
    );
  });
  it('distinguishes changed nested inputs', () => {
    expect(hash({ configuration: { enabled: true } })).not.toBe(
      hash({ configuration: { enabled: false } }),
    );
  });
});

describe('transaction retry classification', () => {
  it('recognizes query and adapter commit conflicts', () => {
    expect(isTransactionConflict({ code: 'P2034' })).toBe(true);
    expect(
      isTransactionConflict({
        name: 'DriverAdapterError',
        cause: { originalCode: '40001' },
      }),
    ).toBe(true);
    expect(isTransactionConflict({ originalCode: '40P01' })).toBe(true);
    // A raw query (such as the session check) failing on a serialization conflict.
    expect(
      isTransactionConflict({
        code: 'P2010',
        meta: {
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: { originalCode: '40001', kind: 'TransactionWriteConflict' },
          },
        },
      }),
    ).toBe(true);
  });
  it('does not retry constraints, connection uncertainty or application errors', () => {
    expect(isTransactionConflict({ code: 'P2002' })).toBe(false);
    expect(isTransactionConflict({ cause: { originalCode: '23505' } })).toBe(
      false,
    );
    expect(isTransactionConflict({ code: 'ECONNRESET' })).toBe(false);
    expect(isTransactionConflict(new Error('request rejected'))).toBe(false);
  });
});
