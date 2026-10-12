// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicPage, ProviderPanel, WebhooksPage } from './ProviderPages';
import {
  createWebhook,
  getProviderStatus,
  type ProviderStatus,
} from '../../services/providers';
import { ApiError } from '../../services/http';

vi.mock('../../services/providers', async (original) => ({
  ...(await original<typeof import('../../services/providers')>()),
  getProviderStatus: vi.fn(),
  getWebhooks: vi.fn(async () => []),
  createWebhook: vi.fn(),
}));
vi.mock('../../services/guilds', async (original) => ({
  ...(await original<typeof import('../../services/guilds')>()),
  getConfig: vi.fn(async () => ({
    featureId: 'R69',
    revision: 1,
    appliedRevision: 1,
    config: { enabled: true },
    missingPrerequisites: [],
  })),
  getChannels: vi.fn(async () => [
    { id: '623456789012345678', name: 'releases', type: 0 },
  ]),
  getRoles: vi.fn(async () => []),
}));

const guildId = '123456789012345678';
function renderPage(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [{ path: '/dashboard/:guildId/x', element }],
    { initialEntries: [`/dashboard/${guildId}/x`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
const off = {
  available: false,
  missingConfiguration: ['X'],
  liveVerified: false,
};
const status: ProviderStatus = {
  billing: off,
  youtube: off,
  twitch: off,
  rss: { available: true, missingConfiguration: [], liveVerified: false },
  github: { available: true, authenticated: false, liveVerified: false },
  ai: off,
  music: off,
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('provider panels', () => {
  it('says what the operator set up without naming secrets or claiming live checks', async () => {
    vi.mocked(getProviderStatus).mockResolvedValue(status);
    renderPage(
      <ProviderPanel
        guildId={guildId}
        providers={['rss', 'youtube', 'github']}
      />,
    );
    expect(await screen.findAllByText('Ready')).toHaveLength(2);
    expect(screen.getByText('Needs operator setup')).toBeVisible();
    expect(screen.getByText(/public rate limit/)).toBeVisible();
    expect(screen.getByText(/has not yet confirmed any/)).toBeVisible();
    expect(screen.queryByText('X')).toBeNull();
  });

  it('explains instead of failing when a delegated manager cannot read status', async () => {
    vi.mocked(getProviderStatus).mockRejectedValue(
      new ApiError('Forbidden', 'FORBIDDEN', 403),
    );
    renderPage(<ProviderPanel guildId={guildId} providers={['rss']} />);
    expect(
      await screen.findByText(/Server managers with settings access/),
    ).toBeVisible();
  });

  it('warns that music will not play without a voice runtime', async () => {
    vi.mocked(getProviderStatus).mockResolvedValue(status);
    renderPage(<MusicPage />);
    expect(
      await screen.findByText('Playback isn’t available yet'),
    ).toBeVisible();
  });

  it('creates a webhook with a browser-made secret and shows it once', async () => {
    vi.mocked(getProviderStatus).mockResolvedValue(status);
    vi.mocked(createWebhook).mockImplementation(async (_g, body) => ({
      data: {
        integration: {
          id: 'w1',
          key: 'w1',
          state: 'active',
          revision: 1,
          createdAt: '2026-10-01T00:00:00.000Z',
          data: {
            name: body.name,
            channelId: body.channelId,
            allowedEvents: body.allowedEvents,
          },
        },
        endpoint: `/api/v1/provider-events/${guildId}/w1`,
        protocol: 'HMAC-SHA256',
      },
    }));
    const user = userEvent.setup();
    renderPage(<WebhooksPage />);
    await user.type(await screen.findByLabelText('Name'), 'Deploy bot');
    await user.selectOptions(
      await screen.findByLabelText('Post events in'),
      '623456789012345678',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Releases' }));
    await user.click(
      screen.getByRole('button', { name: 'Create integration' }),
    );
    await waitFor(() => expect(createWebhook).toHaveBeenCalledTimes(1));
    const body = vi.mocked(createWebhook).mock.calls[0]![1];
    expect(body.signingSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(body.allowedEvents).toEqual(['announcement', 'release']);
    expect(await screen.findByText(body.signingSecret)).toBeVisible();
    expect(screen.getByText('Copy the signing secret now')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText(body.signingSecret)).toBeNull();
  });
});
