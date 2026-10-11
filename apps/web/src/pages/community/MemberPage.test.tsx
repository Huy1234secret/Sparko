// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberPage } from './MemberPage';
import {
  claimCrate,
  getCrates,
  getGiveaways,
  getLeaderboard,
  getMyLevel,
  getMyRankCard,
  giveawayAction,
  saveLevelPreferences,
} from '../../services/community';

vi.mock('../../services/community', () => ({
  claimCrate: vi.fn(),
  getCrates: vi.fn(),
  getGiveaways: vi.fn(),
  getLeaderboard: vi.fn(),
  getMyLevel: vi.fn(),
  getMyRankCard: vi.fn(),
  giveawayAction: vi.fn(),
  saveLevelPreferences: vi.fn(),
}));
vi.mock('../../components/AppShell', () => ({
  useSession: () => ({ data: { user: { id: '123456789012345601' } } }),
  Metric: ({ label, value }: { label: string; value: unknown }) => (
    <div>
      {label}: {String(value)}
    </div>
  ),
}));
const guildId = '123456789012345678';
const record = {
  key: 'k',
  ownerId: '123456789012345601',
  revision: 1,
  createdAt: '2026-10-11T10:00:00Z',
};
const card = {
  accent: '#FACC15',
  avatarShape: 'circle' as const,
  layout: 'wide' as const,
  theme: 'dark' as const,
  showXp: true,
  showRank: true,
};
function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: '/servers/:guildId/me', element: <MemberPage /> }],
    { initialEntries: [`/servers/${guildId}/me`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:card');
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.mocked(getMyLevel).mockResolvedValue({
    profile: {
      userId: '123456789012345601',
      xp: 400,
      level: 3,
      previousLevelXp: 300,
      nextLevelXp: 550,
      progress: 0.4,
      publicProfile: false,
      card,
      rank: 2,
      revision: 1,
      textSummary: 'Level 3. 400 XP. 150 XP to the next level.',
    },
    history: [],
  });
  vi.mocked(getMyRankCard).mockResolvedValue({
    blob: new Blob(['png']),
    summary: 'Member · Level 3 · Rank 2 · 400 XP',
  });
  vi.mocked(getLeaderboard).mockResolvedValue([]);
  vi.mocked(getCrates).mockResolvedValue({
    drops: [
      {
        ...record,
        id: 'drop-1',
        state: 'open',
        data: {
          type: { id: 'spark', name: 'Spark crate', minXp: 1, maxXp: 5 },
          channelId: '1',
          expiresAt: '2026-10-11T11:00:00Z',
          capacity: 3,
          claims: 1,
          preview: false,
        },
      },
    ],
    claims: [],
  });
  vi.mocked(getGiveaways).mockResolvedValue({
    giveaways: [
      {
        ...record,
        id: 'give-1',
        state: 'open',
        data: {
          prize: 'Sticker pack',
          channelId: '1',
          endsAt: '2026-10-12T10:00:00Z',
          winnerCount: 1,
          claimSeconds: 86400,
          replaceUnclaimed: false,
          eligibility: {
            requiredRoleIds: [],
            blockedRoleIds: [],
            minLevel: 0,
            minAccountDays: 0,
            minMemberDays: 0,
          },
        },
      },
    ],
    myEntries: [],
    myWins: [
      {
        ...record,
        id: 'win-1',
        state: 'unclaimed',
        data: {
          giveawayId: 'give-0',
          drawId: 'd',
          round: 1,
          userId: '123456789012345601',
          claimUntil: '2026-10-13T10:00:00Z',
        },
      },
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('member portal', () => {
  it('shows authoritative progress and the server-rendered card with its text alternative', async () => {
    renderPage();
    const bar = await screen.findByRole('progressbar', {
      name: 'Progress to the next level',
    });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemax', '250');
    expect(
      await screen.findByRole('img', {
        name: 'Member · Level 3 · Rank 2 · 400 XP',
      }),
    ).toHaveAttribute('src', 'blob:card');
  });
  it('saves card privacy and re-renders the card from the server', async () => {
    const user = userEvent.setup();
    vi.mocked(saveLevelPreferences).mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByRole('img');
    await user.click(
      screen.getByRole('switch', { name: /Show XP and progress/ }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Save card preferences' }),
    );
    await waitFor(() =>
      expect(saveLevelPreferences).toHaveBeenCalledWith(
        guildId,
        { publicProfile: false, card: { ...card, showXp: false } },
        expect.any(String),
      ),
    );
    await waitFor(() => expect(getMyRankCard).toHaveBeenCalledTimes(2));
  });
  it('claims a crate and enters or claims giveaways as the signed-in member', async () => {
    const user = userEvent.setup();
    vi.mocked(claimCrate).mockResolvedValue({ data: {} as never });
    vi.mocked(giveawayAction).mockResolvedValue({ data: {} });
    renderPage();
    expect(
      await screen.findByText('1/3 claimed', { exact: false }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Claim' }));
    await waitFor(() =>
      expect(claimCrate).toHaveBeenCalledWith(
        guildId,
        'drop-1',
        expect.any(String),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    await user.click(screen.getByRole('button', { name: 'Claim prize' }));
    await waitFor(() => expect(giveawayAction).toHaveBeenCalledTimes(2));
    expect(
      vi.mocked(giveawayAction).mock.calls.map((call) => [call[1], call[2]]),
    ).toEqual([
      ['give-1', 'entry'],
      ['give-0', 'claim'],
    ]);
  });
});
