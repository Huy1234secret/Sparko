// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberEconomyPage } from './MemberEconomy';
import { ShopPage } from './StaffEconomy';
import {
  claimReward,
  createItem,
  getGames,
  getOrders,
  getOverview,
  getShop,
  refundOrder,
  type Games,
  type Order,
  type Overview,
} from '../../services/economy';
import { getRoles } from '../../services/guilds';

vi.mock('../../services/economy', async (original) => ({
  ...(await original<typeof import('../../services/economy')>()),
  getOverview: vi.fn(),
  getHistory: vi.fn(async () => []),
  getShop: vi.fn(async () => []),
  getGames: vi.fn(),
  getOrders: vi.fn(),
  claimReward: vi.fn(),
  refundOrder: vi.fn(),
  createItem: vi.fn(),
  answerTrivia: vi.fn(),
}));
vi.mock('../../services/guilds', async (original) => ({
  ...(await original<typeof import('../../services/guilds')>()),
  getConfig: vi.fn(async () => ({
    featureId: 'R53',
    revision: 1,
    appliedRevision: 1,
    config: { enabled: true },
    missingPrerequisites: [],
  })),
  getRoles: vi.fn(async () => []),
  getChannels: vi.fn(async () => []),
}));
vi.mock('../../components/AppShell', async (original) => ({
  ...(await original<typeof import('../../components/AppShell')>()),
  useSession: () => ({ data: { user: { id: '323456789012345678' } } }),
}));

const guildId = '123456789012345678';
function renderAt(path: string, route: string, element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter([{ path: route, element }], {
    initialEntries: [path],
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
const overview = (patch: Partial<Overview> = {}): Overview => ({
  balance: { balance: '1250', virtualOnly: true },
  currencyName: 'Sparks',
  modules: { R51: true, R52: true, R53: false, R56: true },
  limits: {
    maxBalance: '1000000000',
    maxTransfer: '100000',
    transferDailyCap: '500000',
    transferFeeBps: 0,
  },
  rewards: {
    dailyAmount: 100,
    workMin: 10,
    workMax: 30,
    dailyCap: '1000',
    earnedToday: '0',
    excluded: false,
    nextDailyAt: null,
    nextWorkAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  },
  recent: [],
  ...patch,
});
const memberPath = `/servers/${guildId}/economy`;
const memberRoute = '/servers/:guildId/economy';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('member economy', () => {
  beforeEach(() => vi.mocked(getOverview).mockResolvedValue(overview()));

  it('shows only the modules the server has on, with exact balances', async () => {
    renderAt(memberPath, memberRoute, <MemberEconomyPage />);
    expect(await screen.findByText('1,250 Sparks')).toBeVisible();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Wallet', 'Trivia']);
  });

  it('claims a ready reward and keeps a cooling one disabled with its time', async () => {
    vi.mocked(claimReward).mockResolvedValue({
      data: { awarded: '100', nextEligibleAt: new Date().toISOString() },
    });
    renderAt(memberPath, memberRoute, <MemberEconomyPage />);
    const work = await screen.findByRole('button', { name: 'Work' });
    expect(work).toBeDisabled();
    expect(screen.getByText(/10–30 Sparks · ready in 30 min/)).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Claim' }));
    await waitFor(() => expect(claimReward).toHaveBeenCalledTimes(1));
    expect(vi.mocked(claimReward).mock.calls[0]!.slice(0, 2)).toEqual([
      guildId,
      'daily',
    ]);
    expect(await screen.findByText('+100 Sparks added')).toBeVisible();
  });

  it('resumes an open trivia question after a reload without knowing the answer', async () => {
    const games: Games = {
      current: {
        id: 'game-1',
        question: 'Brand colour?',
        choices: ['Yellow', 'Purple'],
        expiresAt: new Date(Date.now() + 40_000).toISOString(),
        reward: '10',
      },
      recent: [],
      playsPerDay: 10,
      playsLeft: 9,
      nextPlayAt: null,
      answerSeconds: 60,
      reward: '10',
    };
    vi.mocked(getGames).mockResolvedValue(games);
    renderAt(`${memberPath}?tab=games`, memberRoute, <MemberEconomyPage />);
    expect(await screen.findByText('Brand colour?')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Yellow' })).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Submit answer' }),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });
});

const order = (patch: Partial<Order>): Order => ({
  id: 'order-1',
  state: 'delivery-failed',
  revision: 2,
  userId: '423456789012345673',
  itemId: 'vip',
  name: 'VIP role',
  type: 'role',
  roleId: '523456789012345678',
  quantity: 1,
  price: '500',
  deliveryError: 'Role is above the bot',
  refundReason: null,
  refundedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...patch,
});
describe('staff shop', () => {
  const shopPath = `/dashboard/${guildId}/engagement/shop`;
  const shopRoute = '/dashboard/:guildId/engagement/shop';

  it('refunds a failed role order only with a reason, and never one mid-delivery', async () => {
    vi.mocked(getOrders).mockResolvedValue([
      order({}),
      order({
        id: 'order-2',
        state: 'delivery-in-progress',
        deliveryError: null,
      }),
    ]);
    vi.mocked(refundOrder).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAt(`${shopPath}?tab=orders`, shopRoute, <ShopPage />);
    expect(
      await screen.findByText(/2 order\(s\) need attention/),
    ).toBeVisible();
    expect(screen.getByText(/Role is above the bot/)).toBeVisible();
    expect(screen.getByText(/waiting for Discord to answer/)).toBeVisible();
    const refunds = screen.getAllByRole('button', { name: 'Refund…' });
    expect(refunds).toHaveLength(1);
    await user.click(refunds[0]!);
    const confirm = screen.getByRole('button', { name: 'Refund order' });
    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByLabelText(/Refund reason/),
      'Role misconfigured',
    );
    await user.click(confirm);
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(1));
    expect(vi.mocked(refundOrder).mock.calls[0]!.slice(0, 3)).toEqual([
      guildId,
      'order-1',
      'Role misconfigured',
    ]);
  });

  it('makes role items one per member and untradeable', async () => {
    vi.mocked(getOrders).mockResolvedValue([]);
    vi.mocked(getShop).mockResolvedValue([]);
    vi.mocked(getRoles).mockResolvedValue([
      { id: '523456789012345678', name: 'VIP', assignable: true },
      { id: '523456789012345679', name: 'Mods', privileged: true },
    ]);
    vi.mocked(createItem).mockResolvedValue({ data: {} } as never);
    const user = userEvent.setup();
    renderAt(`${shopPath}?tab=new`, shopRoute, <ShopPage />);
    await user.type(await screen.findByLabelText('Name'), 'VIP pass');
    await user.type(screen.getByLabelText(/^Item ID/), 'vip-pass');
    await user.type(screen.getByLabelText('Price'), '500');
    await user.selectOptions(screen.getByLabelText('Kind'), 'role');
    expect(
      screen.getByRole('option', { name: /Mods — has moderator permissions/ }),
    ).toBeDisabled();
    expect(screen.queryByRole('switch', { name: 'One per member' })).toBeNull();
    await user.selectOptions(
      screen.getByLabelText(/Role to give/),
      '523456789012345678',
    );
    await user.click(screen.getByRole('button', { name: 'Add to shop' }));
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createItem).mock.calls[0]![1]).toMatchObject({
      type: 'role',
      roleId: '523456789012345678',
      unique: true,
      tradeable: false,
      stock: null,
      consumeReward: '0',
    });
  });
});
