import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalBuilder, type RepliableInteraction } from 'discord.js';
import { InteractionResponse } from './response.js';

function interaction() {
  const state = {
    replied: false,
    deferred: false,
    reply: vi.fn(async () => {
      state.replied = true;
    }),
    deferReply: vi.fn(async () => {
      state.deferred = true;
    }),
    editReply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
    showModal: vi.fn(async () => {
      state.replied = true;
    }),
  };
  return {
    state,
    response: new InteractionResponse(state as unknown as RepliableInteraction),
  };
}
afterEach(() => {
  vi.useRealTimers();
});
describe('Discord acknowledgement deadline', () => {
  it('acknowledges stalled prerequisites once and prevents a late mutation reservation', async () => {
    vi.useFakeTimers();
    const { state, response } = interaction();
    await vi.advanceTimersByTimeAsync(2300);
    expect(state.reply).toHaveBeenCalledOnce();
    expect(await response.defer()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.deferReply).not.toHaveBeenCalled();
    expect(state.reply).toHaveBeenCalledOnce();
    response.dispose();
  });
  it('uses one deferred response for success and errors, with no second initial acknowledgement', async () => {
    vi.useFakeTimers();
    const { state, response } = interaction();
    expect(await response.defer()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    await response.send('Saved. Waiting for delivery.');
    await response.send('Discord delivery is unavailable.');
    expect(state.deferReply).toHaveBeenCalledOnce();
    expect(state.editReply).toHaveBeenCalledTimes(2);
    expect(state.reply).not.toHaveBeenCalled();
    expect(state.followUp).not.toHaveBeenCalled();
    response.dispose();
  });
  it('a modal reserves the initial acknowledgement before the watchdog can reply', async () => {
    vi.useFakeTimers();
    const { state, response } = interaction();
    expect(
      await response.modal(
        new ModalBuilder().setCustomId('form').setTitle('Ticket'),
      ),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await response.defer()).toBe(false);
    expect(state.showModal).toHaveBeenCalledOnce();
    expect(state.reply).not.toHaveBeenCalled();
    response.dispose();
  });
});
