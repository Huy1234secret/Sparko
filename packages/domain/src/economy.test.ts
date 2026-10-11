import { describe, expect, it } from 'vitest';
import {
  MAX_MINOR,
  PositiveUnits,
  ShopItemSchema,
  AssetsSchema,
} from '@sparko/contracts/economy';
import {
  chooseTicket,
  feeFor,
  nextInventory,
  seasonalXp,
  sumEntries,
  validateAccountBalance,
} from './economy.js';

describe('virtual economy arithmetic and immutable input rules', () => {
  it('retains decimal precision above the JavaScript integer range', () => {
    const amount = 9_000_000_000_000_000_000n;
    expect(PositiveUnits.parse(amount.toString())).toBe(amount.toString());
    expect(feeFor(amount, 125)).toBe(112_500_000_000_000_000n);
    expect(sumEntries([{ amount }, { amount: -amount }])).toBe(0n);
    expect(PositiveUnits.safeParse('9000000000000000001').success).toBe(false);
    expect(PositiveUnits.safeParse('1.01').success).toBe(false);
  });

  it('permits issuer debt while keeping escrow and sink balances nonnegative', () => {
    expect(() =>
      validateAccountBalance('@issuer', true, -MAX_MINOR),
    ).not.toThrow();
    for (const [owner, system] of [
      ['123456789012345678', false],
      ['@sink', true],
      ['@escrow:trade:example', true],
    ] as const) {
      expect(() => validateAccountBalance(owner, system, -1n)).toThrow(
        'Insufficient',
      );
    }
    expect(() =>
      validateAccountBalance('@issuer', true, -MAX_MINOR - 1n),
    ).toThrow('limit');
  });

  it('rejects negative inventory, unsafe arithmetic, and duplicate unique ownership', () => {
    expect(nextInventory(2, -2)).toBe(0);
    for (const values of [
      [0, -1],
      [1_000_000, 1],
      [0, Number.MAX_SAFE_INTEGER],
    ] as const) {
      expect(() => nextInventory(values[0], values[1])).toThrow();
    }
    expect(() => nextInventory(1, 1, true)).toThrow('unique');
  });

  it('maps each ticket index once without giving a boundary to the wrong member', () => {
    const entries = [
      { userId: 'a', tickets: 2 },
      { userId: 'b', tickets: 1 },
      { userId: 'c', tickets: 3 },
    ];
    expect(
      Array.from({ length: 6 }, (_, index) => chooseTicket(entries, index)),
    ).toEqual(['a', 'a', 'b', 'c', 'c', 'c']);
    for (const index of [-1, 6, 0.5])
      expect(() => chooseTicket(entries, index)).toThrow();
    expect(() => chooseTicket([{ userId: 'a', tickets: 0 }], 0)).toThrow();
  });

  it('requires nontradeable unique role items and unique escrow item identifiers', () => {
    const role = {
      itemId: 'subscriber',
      name: 'Subscriber',
      type: 'role',
      price: '50',
      roleId: '123456789012345678',
      unique: true,
      tradeable: false,
    };
    expect(ShopItemSchema.safeParse(role).success).toBe(true);
    expect(ShopItemSchema.safeParse({ ...role, tradeable: true }).success).toBe(
      false,
    );
    expect(
      AssetsSchema.safeParse({
        amount: '0',
        items: [
          { itemId: 'gem', quantity: 1 },
          { itemId: 'gem', quantity: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('preserves lifetime XP when a season starts or totals are reduced', () => {
    expect(seasonalXp(1250, 1000)).toBe(250);
    expect(seasonalXp(900, 1000)).toBe(0);
    expect(() => seasonalXp(-1, 0)).toThrow();
  });
});
