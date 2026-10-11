import { describe, expect, it } from 'vitest';
import { DiscordRest } from './discord.js';
import { DeliveryUncertainError } from './failure.js';

describe('per-execution REST fence', () => {
  it('missing credentials leave REST delivery unavailable without contacting Discord', async () => {
    const discord = new DiscordRest('', '');
    await expect(discord.guild('guild')).rejects.toThrow(
      'Discord delivery is pending',
    );
    await expect(
      discord.scoped(async () => undefined).addRole('guild', 'member', 'role'),
    ).rejects.toThrow('Discord delivery is pending');
  });
  it('prevents a stale lease from making its external mutation', async () => {
    const discord = new DiscordRest('test-only', '923456789012345678');
    let requests = 0;
    discord.rest.put = async () => {
      requests++;
      return {};
    };
    const scoped = discord.scoped(async () => {
      throw new DeliveryUncertainError('Lease lost');
    });
    await expect(scoped.addRole('guild', 'member', 'role')).rejects.toThrow(
      'Lease lost',
    );
    expect(requests).toBe(0);
  });
  it('scoping preserves shared transport and subclass state across executions', async () => {
    class Boundary extends DiscordRest {
      changes = 0;
      override async addRole() {
        this.changes++;
      }
    }
    const discord = new Boundary('test-only', '923456789012345678');
    await discord
      .scoped(async () => undefined)
      .addRole('guild', 'member', 'role');
    await discord
      .scoped(async () => undefined)
      .addRole('guild', 'member', 'role');
    expect(discord.changes).toBe(2);
  });
});
