// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CratesPage } from './CratesPage';
import { CountingPage } from './CountingPage';
import { GiveawaysPage } from './GiveawaysPage';
import { getChannels, getConfig, getRoles } from '../../services/guilds';
import { getTemplates } from '../../services/messages';
import {
  createGiveaway,
  dropCrate,
  getCounting,
  getCountingResets,
  getCrateHistory,
  getGiveaway,
  getGiveaways,
  giveawayAction,
  resetCounting,
} from '../../services/community';
import { ApiError } from '../../services/http';

vi.mock('../../services/guilds', () => ({
  getChannels: vi.fn(),
  getConfig: vi.fn(),
  getRoles: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../../services/messages', () => ({ getTemplates: vi.fn() }));
vi.mock('../../services/community', () => ({
  cancelCrateSchedule: vi.fn(),
  createCrateSchedule: vi.fn(),
  createGiveaway: vi.fn(),
  dropCrate: vi.fn(),
  getCounting: vi.fn(),
  getCountingResets: vi.fn(),
  getCrateHistory: vi.fn(),
  getCrateSchedules: vi.fn(),
  getGiveaway: vi.fn(),
  getGiveaways: vi.fn(),
  giveawayAction: vi.fn(),
  resetCounting: vi.fn(),
}));
const guildId = '123456789012345678';
const channel = '123456789012345671';
const base = {
  key: 'k',
  ownerId: '1',
  revision: 1,
  createdAt: '2026-10-11T10:00:00Z',
};
function renderAt(path: string, element: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: '/dashboard/:guildId/engagement/:module', element }],
    { initialEntries: [`/dashboard/${guildId}/engagement/${path}`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getChannels).mockResolvedValue([
    { id: channel, name: 'general', type: 0 },
  ]);
  vi.mocked(getRoles).mockResolvedValue([]);
  vi.mocked(getTemplates).mockResolvedValue([]);
  vi.mocked(getConfig).mockImplementation(async (_g, featureId) => ({
    featureId,
    revision: 1,
    appliedRevision: 1,
    missingPrerequisites: [],
    config: {
      enabled: true,
      types: [
        { id: 'small', name: 'Small', weight: 1, minXp: 1, maxXp: 5 },
        { id: 'big', name: 'Big', weight: 3, minXp: 5, maxXp: 10 },
      ],
    },
  }));
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('crates', () => {
  it('shows exact weighted odds for crate types', async () => {
    renderAt('crates', <CratesPage />);
    expect(await screen.findByText('Small · 25.0% chance')).toBeVisible();
    expect(screen.getByText('Big · 75.0% chance')).toBeVisible();
  });
  it('reuses one request key when retrying a drop and shows delivery failures', async () => {
    const user = userEvent.setup();
    vi.mocked(getCrateHistory).mockResolvedValue({
      drops: [
        {
          ...base,
          id: 'd1',
          state: 'failed',
          data: {
            type: { id: 'small', name: 'Small', minXp: 1, maxXp: 5 },
            channelId: channel,
            expiresAt: '2026-10-11T11:00:00Z',
            capacity: 1,
            claims: 0,
            preview: false,
            publicationState: 'failed',
            deliveryError: 'No crate channel is usable.',
          },
        },
      ],
      claims: [],
    });
    vi.mocked(dropCrate)
      .mockRejectedValueOnce(
        new ApiError('Unable to reach Sparko.', 'ECONNABORTED', 0),
      )
      .mockResolvedValueOnce({ data: {} as never })
      .mockResolvedValueOnce({ data: {} as never });
    renderAt('crates?tab=drops', <CratesPage />);
    expect(await screen.findByText('Delivery failed')).toBeVisible();
    expect(screen.getByText('No crate channel is usable.')).toBeVisible();
    const button = screen.getByRole('button', { name: 'Drop crate' });
    await user.click(button);
    await screen.findByText('Unable to reach Sparko.');
    await user.click(button);
    await screen.findByText('Crate saved. Waiting for Discord to post it.');
    await user.click(button);
    await waitFor(() => expect(dropCrate).toHaveBeenCalledTimes(3));
    const keys = vi.mocked(dropCrate).mock.calls.map((call) => call[2]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
describe('counting', () => {
  it('requires a reason and the observed revision to reset', async () => {
    const user = userEvent.setup();
    vi.mocked(getCounting).mockResolvedValue({
      config: {},
      channels: [
        {
          ...base,
          id: 'c1',
          key: channel,
          revision: 7,
          state: 'active',
          data: { value: 41, streak: 41, best: 90, run: 2 },
        },
      ],
    });
    vi.mocked(getCountingResets).mockResolvedValue([]);
    vi.mocked(resetCounting).mockResolvedValue({ data: {} as never });
    renderAt('counting', <CountingPage />);
    expect(await screen.findByText('#general')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reset count' }));
    const confirm = within(await screen.findByRole('dialog')).getByRole(
      'button',
      {
        name: 'Reset count',
      },
    );
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Reason'), 'Raid spam');
    await user.click(confirm);
    await waitFor(() =>
      expect(resetCounting).toHaveBeenCalledWith(
        guildId,
        { channelId: channel, expectedRevision: 7, reason: 'Raid spam' },
        expect.any(String),
      ),
    );
  });
});
describe('giveaways', () => {
  it('sends the deadline as UTC and omits an empty entry limit', async () => {
    const user = userEvent.setup();
    vi.mocked(getGiveaways).mockResolvedValue({
      giveaways: [],
      myEntries: [],
      myWins: [],
    });
    vi.mocked(createGiveaway).mockResolvedValue({
      data: { id: 'g1' } as never,
    });
    renderAt('giveaways?tab=new', <GiveawaysPage />);
    await user.type(await screen.findByLabelText('Prize'), 'Sticker pack');
    await user.selectOptions(screen.getByLabelText('Channel'), channel);
    const local = new Date(Date.now() + 86_400_000);
    local.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const value = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    await user.type(screen.getByLabelText('Ends at'), value);
    await user.click(screen.getByRole('button', { name: 'Start giveaway' }));
    await waitFor(() => expect(createGiveaway).toHaveBeenCalledOnce());
    const body = vi.mocked(createGiveaway).mock.calls[0]![1];
    expect(body.endsAt).toBe(local.toISOString());
    expect(body).not.toHaveProperty('entryLimit');
    expect(body).toMatchObject({
      prize: 'Sticker pack',
      channelId: channel,
      winnerCount: 1,
    });
  });
  it('shows draw history and requires a reason to reroll', async () => {
    const user = userEvent.setup();
    const giveaway = {
      ...base,
      id: 'g1',
      state: 'ended',
      data: {
        prize: 'Nitro',
        channelId: channel,
        endsAt: '2026-10-11T09:00:00Z',
        winnerCount: 1,
        claimSeconds: 3600,
        replaceUnclaimed: false,
        eligibility: {
          requiredRoleIds: [],
          blockedRoleIds: [],
          minLevel: 0,
          minAccountDays: 0,
          minMemberDays: 0,
        },
      },
    };
    vi.mocked(getGiveaways).mockResolvedValue({
      giveaways: [giveaway],
      myEntries: [],
      myWins: [],
    });
    vi.mocked(getGiveaway).mockResolvedValue({
      giveaway,
      entries: [],
      winners: [],
      draws: [
        {
          ...base,
          id: 'draw1',
          state: 'drawn',
          data: {
            giveawayId: 'g1',
            round: 1,
            winnerIds: ['123456789012345699'],
            requestedSlots: 1,
            eligibleEntryIds: ['e1', 'e2'],
            claimUntil: '2026-10-11T10:00:00Z',
            drawnAt: '2026-10-11T09:00:00Z',
            algorithm: 'crypto.randomInt partial Fisher-Yates',
            reason: 'End giveaway',
          },
        },
      ],
    });
    vi.mocked(giveawayAction).mockResolvedValue({ data: {} });
    renderAt('giveaways', <GiveawaysPage />);
    await user.click(await screen.findByRole('button', { name: /Nitro/ }));
    expect(
      await screen.findByText('Round 1: 123456789012345699'),
    ).toBeVisible();
    const reroll = screen.getByRole('button', {
      name: 'Reroll unclaimed slots',
    });
    expect(reroll).toBeDisabled();
    await user.type(screen.getByLabelText('Reroll reason'), 'Winner left');
    await user.click(reroll);
    await waitFor(() =>
      expect(giveawayAction).toHaveBeenCalledWith(
        guildId,
        'g1',
        'reroll',
        { reason: 'Winner left' },
        expect.any(String),
      ),
    );
  });
});
