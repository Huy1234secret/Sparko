// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api, createQueryClient, useAutoRoles } from './index';
import { arDefault } from './studio-format';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('refreshes automatic roles while the dashboard stays open', async () => {
  vi.useFakeTimers();
  const state = {
    on: true,
    config: arDefault(),
    limits: { timed: 3, rules: 10, conditions: 10, joinRoles: 5 },
    roles: [{ id: '1', name: 'Original', color: null }],
    log: [],
  };
  const read = vi.spyOn(api, 'getAutoRoles').mockResolvedValue(state);
  const client = createQueryClient();
  const { result, unmount } = renderHook(() => useAutoRoles('123'), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await act(() => vi.advanceTimersByTimeAsync(10));
  expect(result.current.data).toEqual(state);
  read.mockResolvedValue({ ...state, roles: [] });
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(result.current.data?.roles).toEqual([]);
  expect(read).toHaveBeenCalledTimes(2);
  unmount();
  client.clear();
});
