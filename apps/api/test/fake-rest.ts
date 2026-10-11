import {
  DiscordRest,
  type DiscordGuild,
  type DiscordRole,
  type DiscordMember,
  type DiscordChannel,
  type DiscordMessage,
  type DiscordFile,
} from '../../worker/src/discord.js';
import { ADMIN, GUILD_A, CHANNEL, STAFF } from './fixtures.js';
import { DiscordAPIError } from 'discord.js';
export const TEST_BOT = '823456789012345678',
  TEST_BOT_ROLE = '923456789012345678';
/** Discord test double. It is never loaded by production entrypoints. */
export class FakeRest extends DiscordRest {
  channelsStore: DiscordChannel[] = [
    {
      id: CHANNEL,
      guild_id: GUILD_A,
      name: 'support',
      type: 0,
      permission_overwrites: [],
    },
  ];
  messageStore: DiscordMessage[] = [];
  uploadedFiles: { name: string; bytes: number; contentType: string }[] = [];
  counter = 700000000000000000n;
  failWrites = false;
  private rejectWrite() {
    if (this.failWrites)
      throw new DiscordAPIError(
        { code: 50013, message: 'Missing Permissions' },
        50013,
        403,
        'POST',
        'https://discord-boundary.test/channels/message',
        {},
      );
  }
  override async emojis() {
    return [];
  }
  constructor() {
    super('test-only-token', TEST_BOT);
    // Guard every raw SDK call: an unimplemented boundary must fail locally.
    this.rest.delete = async (route) => {
      const match = /^\/channels\/(\d+)$/.exec(route);
      if (match?.[1]) {
        this.channelsStore = this.channelsStore.filter(
          (channel) => channel.id !== match[1],
        );
        return undefined;
      }
      throw new Error('Unhandled test REST delete: ' + route);
    };
    this.rest.put = async (route) => {
      if (/^\/channels\/\d+\/permissions\/\d+$/.test(route)) return undefined;
      throw new Error('Unhandled test REST put: ' + route);
    };
    this.rest.get = async () => {
      throw new Error('Unhandled test REST get');
    };
    this.rest.post = async () => {
      throw new Error('Unhandled test REST post');
    };
    this.rest.patch = async () => {
      throw new Error('Unhandled test REST patch');
    };
  }
  override async guild(id: string): Promise<DiscordGuild> {
    return { id, name: 'Test community', owner_id: ADMIN };
  }
  override async roles(id: string): Promise<DiscordRole[]> {
    return [
      { id, name: 'everyone', position: 0, permissions: '0', managed: false },
      {
        id: STAFF,
        name: 'Support',
        position: 1,
        permissions: '0',
        managed: false,
      },
      {
        id: TEST_BOT_ROLE,
        name: 'Sparko test bot',
        position: 10,
        permissions: '8',
        managed: false,
      },
    ];
  }
  override async member(_guildId: string, id: string): Promise<DiscordMember> {
    return {
      user: {
        id,
        username: id === TEST_BOT ? 'Sparko' : 'Test member',
        bot: id === TEST_BOT,
      },
      roles: id === TEST_BOT ? [TEST_BOT_ROLE] : [],
    };
  }
  override async channel(id: string): Promise<DiscordChannel> {
    const found = this.channelsStore.find((c) => c.id === id);
    if (!found)
      throw new DiscordAPIError(
        { code: 10003, message: 'Unknown Channel' },
        10003,
        404,
        'GET',
        'https://discord-boundary.test/channels/channel',
        {},
      );
    return found;
  }
  override async channels(guildId: string): Promise<DiscordChannel[]> {
    return this.channelsStore.filter((c) => c.guild_id === guildId);
  }
  override async createChannel(
    guildId: string,
    body: unknown,
  ): Promise<DiscordChannel> {
    const input = body as Record<string, unknown>;
    const channel: DiscordChannel = {
      id: String(++this.counter),
      guild_id: guildId,
      name: String(input['name']),
      type: Number(input['type']),
      topic: String(input['topic'] ?? ''),
      permission_overwrites:
        (input[
          'permission_overwrites'
        ] as DiscordChannel['permission_overwrites']) ?? [],
    };
    this.channelsStore.push(channel);
    return channel;
  }
  override async send(
    channelId: string,
    payload: unknown,
    nonce: string,
    files: DiscordFile[] = [],
  ): Promise<DiscordMessage> {
    this.rejectWrite();
    const old = this.messageStore.find((m) => m.nonce === nonce);
    if (old) return old;
    for (const file of files)
      this.uploadedFiles.push({
        name: file.name,
        bytes: file.data.length,
        contentType: file.contentType,
      });
    const data = payload as Record<string, unknown>;
    const message: DiscordMessage = {
      id: String(++this.counter),
      channel_id: channelId,
      author: { id: TEST_BOT, username: 'Sparko', bot: true },
      timestamp: new Date().toISOString(),
      content: typeof data['content'] === 'string' ? data['content'] : '',
      components: Array.isArray(data['components']) ? data['components'] : [],
      embeds: Array.isArray(data['embeds']) ? data['embeds'] : [],
      ...(typeof data['flags'] === 'number' ? { flags: data['flags'] } : {}),
      attachments: files.map((file, index) => ({
        id: String(index),
        filename: file.name,
        size: file.data.length,
        url: `https://discord-boundary.test/${file.name}`,
      })),
      nonce,
    };
    this.messageStore.push(message);
    return message;
  }
  override async messages(
    channelId: string,
    before?: string,
  ): Promise<DiscordMessage[]> {
    return this.messageStore
      .filter(
        (m) =>
          m.channel_id === channelId &&
          (!before || BigInt(m.id) < BigInt(before)),
      )
      .slice(-100)
      .reverse();
  }
  override async message(
    channelId: string,
    id: string,
  ): Promise<DiscordMessage> {
    const found = this.messageStore.find(
      (m) => m.id === id && m.channel_id === channelId,
    );
    if (!found)
      throw new DiscordAPIError(
        { code: 10008, message: 'Unknown Message' },
        10008,
        404,
        'GET',
        'https://discord-boundary.test/channels/message',
        {},
      );
    return found;
  }
  override async edit(
    channelId: string,
    id: string,
    payload: unknown,
    files: DiscordFile[] = [],
  ): Promise<DiscordMessage> {
    this.rejectWrite();
    for (const file of files)
      this.uploadedFiles.push({
        name: file.name,
        bytes: file.data.length,
        contentType: file.contentType,
      });
    const message = await this.message(channelId, id),
      data = payload as Record<string, unknown>;
    if (Array.isArray(data['components']))
      message.components = data['components'];
    if (typeof data['content'] === 'string') message.content = data['content'];
    if (Array.isArray(data['embeds'])) message.embeds = data['embeds'];
    if (typeof data['flags'] === 'number') message.flags = data['flags'];
    if (files.length || Array.isArray(data['attachments']))
      message.attachments = files.map((file, index) => ({
        id: String(index),
        filename: file.name,
        size: file.data.length,
        url: `https://discord-boundary.test/${file.name}`,
      }));
    return message;
  }
  override async deleteMessage(channelId: string, id: string) {
    this.messageStore = this.messageStore.filter(
      (m) => m.id !== id || m.channel_id !== channelId,
    );
  }
}
