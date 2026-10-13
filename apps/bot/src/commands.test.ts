import { describe, expect, it, vi } from 'vitest';
import { commands, handleCommand } from './commands.ts';

const interaction = (commandName: string, ping = 42.4) => ({
  commandName,
  client: { ws: { ping } },
  reply: vi.fn().mockResolvedValue(undefined),
});

describe('bot commands', () => {
  it('registers /ping', () => {
    expect(commands.map((c) => c.name)).toEqual(['ping']);
  });

  it('answers /ping privately with the latency and the dashboard link', async () => {
    const i = interaction('ping');
    await handleCommand(i, { dashboardUrl: 'https://panel.example' });
    expect(i.reply).toHaveBeenCalledWith({
      content:
        'Pong! Sparko is online (42 ms). Dashboard: https://panel.example',
      flags: 64,
    });
  });

  it('says other commands are being rebuilt', async () => {
    const i = interaction('level', -1);
    await handleCommand(i, {});
    expect(i.reply.mock.calls[0]?.[0].content).toBe(
      'This command is being rebuilt and will be back soon.',
    );
  });
});
