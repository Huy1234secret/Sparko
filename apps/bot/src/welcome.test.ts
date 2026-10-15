import {
  addTemplate,
  DiscordError,
  listGreetLog,
  openDb,
  studioDefault,
  welcomeDefault,
  writeModule,
  type Rest,
  type WelcomeConfig,
} from '@sparko/core';
import type { Guild, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  checkWelcome,
  memberJoined,
  memberLeft,
  memberUpdated,
} from './welcome.ts';

function setup(change?: (c: WelcomeConfig, template: string) => void) {
  const db = openDb(':memory:');
  const template = addTemplate(
    db,
    {
      guildId: 'g',
      moduleId: 'studio',
      name: 'Hello',
      who: 'Rhea',
      message: {
        ...studioDefault('501'),
        layout: 'embed',
        content: 'Hi {user}, welcome to {server}! Member #{server.members}.',
        embeds: [],
      },
    },
    1,
  );
  const config = welcomeDefault('501');
  config.join.template = template;
  config.leave.channel = '';
  config.boost.template = template;
  change?.(config, template);
  writeModule(db, 'g', 'welcome', { on: true, config }, 1);
  const post = vi.fn(async (path: string) =>
    path === '/users/@me/channels' ? { id: 'dm1' } : { id: 'm1' },
  );
  const rest = { post, delete: vi.fn() } as unknown as Rest;
  const channel = {
    name: 'welcome',
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
  };
  const guild = {
    id: 'g',
    name: 'Pixel Plaza',
    memberCount: 1204,
    premiumSubscriptionCount: 7,
    premiumTier: 1,
    iconURL: () => null,
    channels: {
      cache: { get: (id: string) => (id === '501' ? channel : undefined) },
    },
    members: { me: { id: 'bot' } },
  };
  const member = (id: string, extra: object = {}) =>
    ({
      id,
      displayName: 'tomoko',
      joinedTimestamp: 0,
      pending: false,
      premiumSince: null,
      partial: false,
      user: {
        bot: false,
        username: 'tomoko',
        createdTimestamp: 0,
        displayAvatarURL: () => 'https://cdn.discordapp.com/a.png',
      },
      guild,
      ...extra,
    }) as unknown as GuildMember;
  return { db, rest, post, guild: guild as unknown as Guild, member };
}

describe('Welcome messages', () => {
  it('sends the join template in the channel, pinging only the member', async () => {
    const { db, rest, post, member } = setup();
    expect(await memberJoined(db, rest, member('77'))).toBe('sent');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/channels/501/messages', {
      content: 'Hi <@77>, welcome to Pixel Plaza! Member #1,204.',
      embeds: [],
      components: [],
      allowed_mentions: { parse: [], users: ['77'] },
    });
    expect(listGreetLog(db, 'g')[0]).toMatchObject({
      kind: 'join',
      ok: true,
      template: 'Hello',
      channelId: '501',
    });
  });

  it('doesn’t greet people twice unless rejoins are welcomed', async () => {
    const { db, rest, post, member } = setup();
    await memberJoined(db, rest, member('77'));
    expect(await memberJoined(db, rest, member('77'))).toBe('rejoin');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('waits for the rules when asked, then greets', async () => {
    const { db, rest, post, member } = setup((c) => {
      c.join.waitForRules = true;
    });
    const pending = member('78', { pending: true });
    expect(await memberJoined(db, rest, pending)).toBe('waiting');
    expect(post).not.toHaveBeenCalled();
    expect(await memberUpdated(db, rest, pending, member('78'))).toBe('sent');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('thanks boosters and logs a DM that couldn’t be sent', async () => {
    const { db, rest, post, member } = setup((c) => {
      c.boost.dm = 'same';
    });
    post.mockImplementation(async (path: string) => {
      if (path === '/channels/dm1/messages')
        throw new DiscordError(403, 50007, 'Cannot send messages to this user');
      return path === '/users/@me/channels' ? { id: 'dm1' } : { id: 'm1' };
    });
    const booster = member('79', { premiumSince: new Date() });
    expect(await memberUpdated(db, rest, member('79'), booster)).toBe(
      'boosted',
    );
    const [dm, channel] = listGreetLog(db, 'g');
    expect(channel).toMatchObject({ kind: 'boost', ok: true });
    expect(dm).toMatchObject({
      kind: 'boost',
      ok: false,
      channelId: null,
      reason: 'they don’t accept direct messages from this server.',
    });
  });

  it('sends nothing for a kind with no channel or DM', async () => {
    const { db, rest, post, member } = setup();
    expect(await memberLeft(db, rest, member('80'))).toBe('sent');
    expect(post).not.toHaveBeenCalled();
    expect(listGreetLog(db, 'g')).toEqual([]);
  });

  it('logs why a channel post failed', async () => {
    const { db, rest, post, member } = setup();
    post.mockRejectedValue(new DiscordError(403, 50013, 'Missing Permissions'));
    await memberJoined(db, rest, member('81'));
    expect(listGreetLog(db, 'g')[0]).toMatchObject({
      ok: false,
      reason: 'Sparko doesn’t have permission to send messages there.',
    });
  });

  it('explains what to fix when it lacks the members intent', () => {
    const ok = setup();
    expect(() => checkWelcome(ok.db, ok.guild, false)).toThrow(
      /Server Members Intent/,
    );
    expect(() => checkWelcome(ok.db, ok.guild, true)).not.toThrow();
  });
});
