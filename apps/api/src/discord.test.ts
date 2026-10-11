import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordAPIError, REST, Routes } from 'discord.js';
import { discordAdapter } from './discord.js';

const guildId = '955555555555555551',
  emojiId = '955555555555555552',
  adapter = () =>
    discordAdapter(
      'test-client',
      'test-secret',
      'http://localhost/callback',
      'test-token',
    );
afterEach(() => vi.restoreAllMocks());

describe('fresh Discord resources', () => {
  it('reads and normalizes the actual guild emoji endpoint', async () => {
    const get = vi.spyOn(REST.prototype, 'get').mockResolvedValue([
      {
        id: emojiId,
        name: 'spark',
        roles: ['955555555555555553'],
        animated: true,
        available: true,
      },
      { id: '955555555555555554', name: null },
    ]);
    expect(await adapter().emojis(guildId)).toEqual([
      {
        id: emojiId,
        name: 'spark',
        roles: ['955555555555555553'],
        animated: true,
        available: true,
      },
      {
        id: '955555555555555554',
        name: 'emoji',
        roles: [],
        animated: false,
        available: false,
      },
    ]);
    expect(get).toHaveBeenCalledWith(Routes.guildEmojis(guildId));
  });

  it.each([50001, 50013])(
    'reports Discord denial %i as a safe actionable permission error',
    async (code) => {
      vi.spyOn(REST.prototype, 'get').mockRejectedValue(
        new DiscordAPIError(
          { message: 'Internal Discord diagnostics', code },
          code,
          403,
          'GET',
          'https://discord.com/api/v10/guilds/guild/roles',
          {},
        ),
      );
      await expect(adapter().roles(guildId)).rejects.toMatchObject({
        code: 'MISSING_PERMISSION',
        status: 403,
      });
    },
  );

  it('reports a deleted Discord resource as unavailable rather than a retryable outage', async () => {
    vi.spyOn(REST.prototype, 'get').mockRejectedValue(
      new DiscordAPIError(
        { message: 'Unknown Guild', code: 10004 },
        10004,
        404,
        'GET',
        'https://discord.com/api/v10/guilds/guild/channels',
        {},
      ),
    );
    await expect(adapter().channels(guildId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});
