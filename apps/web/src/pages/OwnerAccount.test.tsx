// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
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
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerPage } from './OwnerPages';
import { BillingPage } from './BillingPages';
import { ProductSupportPage } from './AccountPages';
import { getSession } from '../services/session';
import { getOwnerHealth } from '../services/account';
import { getConfig } from '../services/guilds';
import { getFleet, getOwnerGuild, setFeaturePolicy } from '../services/owner';
import { getBilling, type Billing } from '../services/billing';
import {
  getSupportTickets,
  replySupport,
  type SupportTicket,
} from '../services/support';
import { ConfigForm } from '../features/config/ConfigForm';
import { useFeatureConfig } from '../features/config/useFeatureConfig';
import { z } from 'zod';

vi.mock('../services/session', async (original) => ({
  ...(await original<typeof import('../services/session')>()),
  getSession: vi.fn(),
}));
vi.mock('../services/account', async (original) => ({
  ...(await original<typeof import('../services/account')>()),
  getOwnerHealth: vi.fn(),
}));
vi.mock('../services/guilds', async (original) => ({
  ...(await original<typeof import('../services/guilds')>()),
  getConfig: vi.fn(),
  getGuilds: vi.fn(async () => []),
}));
vi.mock('../services/owner', async (original) => ({
  ...(await original<typeof import('../services/owner')>()),
  getFleet: vi.fn(),
  getOwnerGuild: vi.fn(),
  setFeaturePolicy: vi.fn(),
  getJobs: vi.fn(async () => []),
  getGrants: vi.fn(async () => []),
}));
vi.mock('../services/billing', async (original) => ({
  ...(await original<typeof import('../services/billing')>()),
  getBilling: vi.fn(),
  startCheckout: vi.fn(),
}));
vi.mock('../services/support', async (original) => ({
  ...(await original<typeof import('../services/support')>()),
  getSupportTickets: vi.fn(),
  replySupport: vi.fn(),
  setSupportState: vi.fn(),
  createSupportTicket: vi.fn(),
}));

const guildId = '123456789012345678';
function renderAt(
  path: string,
  routes: { path: string; element: ReactElement }[],
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
const owner = (capabilities: string[]) =>
  vi.mocked(getSession).mockResolvedValue({
    user: { id: '323456789012345678', username: 'op' },
    capabilities,
  } as never);
const ownerRoutes = [
  { path: '/owner', element: <OwnerPage /> },
  ...(['health', 'fleet', 'jobs', 'support', 'grants'] as const).map(
    (section) => ({
      path: `/owner/${section}`,
      element: <OwnerPage section={section} />,
    }),
  ),
];
const ticket: SupportTicket = {
  id: 'support-1',
  ownerId: '223456789012345678',
  subject: 'Panel broken',
  category: 'bug',
  state: 'open',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  messages: [
    {
      id: 'm1',
      authorId: '223456789012345678',
      content: 'It errors.',
      createdAt: '2026-10-01T00:00:00.000Z',
      attachments: [
        { id: 'a1', name: 'shot.png', bytes: 2048, width: 10, height: 10 },
      ],
    },
  ],
};
beforeEach(() => {
  vi.mocked(getSupportTickets).mockResolvedValue([ticket]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('owner console scope', () => {
  it('shows a support-only operator just the support queue, read-only', async () => {
    owner(['support.read']);
    renderAt('/owner', ownerRoutes);
    const nav = await screen.findByRole('navigation', {
      name: 'Owner sections',
    });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Support queue']);
    expect(getOwnerHealth).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /Panel broken/ }));
    expect(screen.getByText('Read-only access')).toBeVisible();
    expect(screen.queryByLabelText('Reply')).toBeNull();
    expect(
      screen.getByRole('img', { name: 'Screenshot: shot.png' }),
    ).toHaveAttribute('src', '/api/v1/owner/support/support-1/attachments/a1');
  });
  it('lets support staff reply, which waits on the member', async () => {
    owner(['support.read', 'support.reply']);
    vi.mocked(replySupport).mockResolvedValue({ data: {} } as never);
    const user = userEvent.setup();
    renderAt('/owner/support', ownerRoutes);
    await user.click(
      await screen.findByRole('button', { name: /Panel broken/ }),
    );
    await user.type(screen.getByLabelText('Reply'), 'Fixed now');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(replySupport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(replySupport).mock.calls[0]!.slice(0, 3)).toEqual([
      'owner',
      'support-1',
      { message: 'Fixed now', attachments: [] },
    ]);
  });
  it('pauses a module only with a recorded reason', async () => {
    owner(['fleet.read', 'entitlements.manage']);
    vi.mocked(getFleet).mockResolvedValue([
      {
        id: guildId,
        name: 'Test community',
        installed: true,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    vi.mocked(getOwnerGuild).mockResolvedValue({
      guild: {
        id: guildId,
        name: 'Test community',
        installed: true,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
      plan: { id: 'free' },
      policies: [],
      entitlements: [],
      features: [
        {
          featureId: 'R43',
          enabled: true,
          ownerAllowed: true,
          ownerReason: null,
          planEntitled: true,
          requiredPlan: null,
        },
        {
          featureId: 'R61',
          enabled: true,
          ownerAllowed: true,
          ownerReason: null,
          planEntitled: false,
          requiredPlan: 'plus',
        },
      ],
    });
    vi.mocked(setFeaturePolicy).mockResolvedValue({ data: {} } as never);
    const user = userEvent.setup();
    renderAt('/owner/fleet', ownerRoutes);
    await user.click(
      await screen.findByRole('button', { name: /Test community/ }),
    );
    expect(await screen.findByText('Needs Plus')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Pause…' })[0]!);
    const pause = screen.getByRole('button', { name: 'Pause module' });
    expect(pause).toBeDisabled();
    await user.type(screen.getByLabelText(/Reason \(recorded/), 'Spam reports');
    await user.click(pause);
    await waitFor(() => expect(setFeaturePolicy).toHaveBeenCalledTimes(1));
    expect(vi.mocked(setFeaturePolicy).mock.calls[0]!.slice(0, 3)).toEqual([
      guildId,
      'R43',
      { allowed: false, reason: 'Spam reports', expectedRevision: 0 },
    ]);
  });
});

const plan = (id: 'free' | 'plus') => ({
  id,
  templates: id === 'plus' ? 100 : 10,
  storageBytes: id === 'plus' ? 100_000_000 : 10_000_000,
  automationSteps: id === 'plus' ? 25 : 10,
  transcriptRetentionDays: id === 'plus' ? 30 : 7,
  multiServer: id === 'plus',
});
describe('plans and billing', () => {
  it('shows real limits, honest checkout state and staff grants', async () => {
    const billing: Billing = {
      plan: plan('free'),
      plans: { free: plan('free'), plus: plan('plus') },
      availability: { available: false },
      entitlements: [
        {
          id: 'e1',
          state: 'revoked',
          revision: 2,
          createdAt: '2026-09-01T00:00:00.000Z',
          data: {
            provider: 'staff',
            revoked: true,
            expiresAt: '2099-01-01T00:00:00.000Z',
            reason: 'Partner',
          },
        },
      ],
      events: [],
      intents: [],
    };
    vi.mocked(getBilling).mockResolvedValue(billing);
    renderAt(`/dashboard/${guildId}/settings/billing`, [
      {
        path: '/dashboard/:guildId/settings/billing',
        element: <BillingPage />,
      },
    ]);
    expect(
      await screen.findByText('Checkout isn’t available yet'),
    ).toBeVisible();
    expect(
      screen.getByRole('row', { name: /Image library 10 MB 100 MB/ }),
    ).toBeVisible();
    expect(screen.getByText('Granted by Sparko staff')).toBeVisible();
    expect(screen.getByText('Revoked')).toBeVisible();
    expect(screen.queryByRole('button', { name: /checkout/i })).toBeNull();
  });
});

describe('settings explain staff pauses and plan needs', () => {
  function Settings() {
    const controller = useFeatureConfig(
      guildId,
      'R43',
      z.object({ enabled: z.boolean() }),
    );
    return (
      <ConfigForm controller={controller.shell} title="Auto replies">
        <p>fields</p>
      </ConfigForm>
    );
  }
  it('names the staff reason without touching the server switch', async () => {
    vi.mocked(getConfig).mockResolvedValue({
      featureId: 'R43',
      revision: 2,
      appliedRevision: 2,
      config: { enabled: true },
      missingPrerequisites: [],
      gate: {
        ownerAllowed: false,
        ownerReason: 'Abuse review',
        planEntitled: true,
        requiredPlan: null,
        plan: 'free',
      },
    });
    renderAt('/x', [{ path: '/x', element: <Settings /> }]);
    expect(await screen.findByText('Paused by Sparko staff')).toBeVisible();
    expect(screen.getByText(/Abuse review/)).toBeVisible();
    expect(screen.getByRole('switch')).toBeChecked();
  });
});

describe('member support inbox', () => {
  it('opens a conversation with its screenshot and status', async () => {
    renderAt('/account/support', [
      { path: '/account/support', element: <ProductSupportPage /> },
    ]);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /Panel broken/ }));
    expect(screen.getAllByText('Waiting for support')[0]).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Download shot.png' }),
    ).toHaveAttribute(
      'href',
      '/api/v1/account/support/support-1/attachments/a1',
    );
    expect(screen.getByRole('button', { name: 'Close request' })).toBeVisible();
  });
});
