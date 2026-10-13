import { openDb, writeModule, type WelcomeConfig } from '@sparko/core';
import type { Guild, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { checkWelcome, welcomeMember } from './welcome.ts';

const config: WelcomeConfig = {
  delivery: 'both',
  channel: '501',
  message: 'Hi {user}, welcome to {server}! You’re #{member_count}.',
  embed: true,
  title: 'Welcome to {server}',
  color: '#FACC15',
  ping: true,
  rejoin: false,
};

function setup(canPost = true) {
  const db = openDb(':memory:');
  writeModule(db, 'g', 'welcome', { on: true, config }, 1);
  const channel = {
    name: 'welcome',
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => canPost }),
    send: vi.fn().mockResolvedValue(undefined),
  };
  const guild = {
    id: 'g',
    name: 'Pixel Plaza',
    memberCount: 1204,
    channels: {
      cache: { get: (id: string) => (id === '501' ? channel : undefined) },
    },
    members: { me: { id: 'bot' } },
  };
  const member = (id: string) =>
    ({
      id,
      user: { bot: false },
      guild,
      send: vi.fn().mockRejectedValue(new Error('DMs closed')),
    }) as unknown as GuildMember & { send: ReturnType<typeof vi.fn> };
  return { db, channel, guild: guild as unknown as Guild, member };
}

describe('Welcome', () => {
  it('greets a new member in the channel and by DM, pinging only them', async () => {
    const { db, channel, member } = setup();
    const tomoko = member('77');
    expect(await welcomeMember(db, tomoko)).toBe('sent');
    expect(channel.send).toHaveBeenCalledWith({
      content: '<@77>',
      embeds: [
        {
          title: 'Welcome to Pixel Plaza',
          description: 'Hi <@77>, welcome to Pixel Plaza! You’re #1,204.',
          color: 0xfacc15,
        },
      ],
      allowedMentions: { parse: [], users: ['77'] },
    });
    // A closed DM doesn't stop anything.
    expect(tomoko.send).toHaveBeenCalled();
  });

  it('doesn’t greet people twice unless rejoins are welcomed', async () => {
    const { db, channel, member } = setup();
    await welcomeMember(db, member('77'));
    expect(await welcomeMember(db, member('77'))).toBe('rejoin');
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('explains what to fix when it can’t post or lacks the members intent', () => {
    const blocked = setup(false);
    expect(() => checkWelcome(blocked.db, blocked.guild, true)).toThrow(
      /can’t post in #welcome/,
    );
    const ok = setup();
    expect(() => checkWelcome(ok.db, ok.guild, false)).toThrow(
      /Server Members Intent/,
    );
    expect(() => checkWelcome(ok.db, ok.guild, true)).not.toThrow();
  });
});
