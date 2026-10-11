import { describe, expect, it } from 'vitest';
import { DomainError } from '@sparko/contracts';
import {
  DeliveryUncertainError,
  classifyDeliveryFailure,
  isResourceCreation,
} from './failure.js';

describe('durable delivery recovery decisions', () => {
  it('never retries an ambiguous accepted resource as an ordinary transient error', () => {
    for (const type of [
      'ticket.create',
      'ticket.welcome',
      'ticket.sla',
      'control.channel.response',
      'community.starboard.sync',
      'provider.announcement',
      'provider.ai.generate',
    ]) {
      expect(isResourceCreation(type)).toBe(true);
      expect(
        classifyDeliveryFailure(
          new Error('Socket closed after request body'),
          1,
          isResourceCreation(type),
        ).state,
      ).toBe('unknown');
    }
    expect(
      classifyDeliveryFailure(
        new DeliveryUncertainError('Prior request may have succeeded'),
        99,
        false,
      ).state,
    ).toBe('unknown');
  });
  it('blocks current permission failures and keeps idempotent role writes eligible for bounded retries', () => {
    expect(
      classifyDeliveryFailure(
        new DomainError('MISSING_PERMISSION', 'Move the bot role.'),
        1,
        false,
      ).state,
    ).toBe('blocked');
    expect(
      classifyDeliveryFailure(
        new Error('Connection unavailable'),
        1,
        isResourceCreation('economy.role.deliver'),
      ).state,
    ).toBe('retry');
    expect(
      classifyDeliveryFailure(new Error('Connection unavailable'), 8, false)
        .state,
    ).toBe('dead');
  });
});
