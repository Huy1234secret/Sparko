// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandsPage,
  DocsPage,
  FeaturesPage,
  HomePage,
  StatusPage,
} from './PublicPages';
import {
  getPublicCommands,
  getPublicFeatures,
  getPublicStatus,
} from '../services/public';
import { COMPONENTS_V2_FLAG } from '@sparko/messages';

vi.mock('../services/public', () => ({
  getPublicCommands: vi.fn(),
  getPublicFeatures: vi.fn(),
  getPublicStatus: vi.fn(),
}));
vi.mock('@sparko/assets', () => ({
  AnimatedIcon: ({ label }: { label?: string }) => <span aria-label={label} />,
}));

function renderPage(page: React.ReactNode, route = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getPublicFeatures).mockResolvedValue({ features: [] });
  vi.mocked(getPublicCommands).mockResolvedValue({ commands: [] });
  vi.mocked(getPublicStatus).mockResolvedValue({
    status: 'unknown',
    checkedAt: '2026-10-11T00:00:00Z',
    services: [],
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('public product behavior', () => {
  it('compiles edited demonstration text into two separate valid Discord modes', async () => {
    const user = userEvent.setup();
    renderPage(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'View payload' }));
    const v2 =
      screen.getByLabelText('Compiled demonstration payload').textContent ?? '';
    expect(v2).toContain(`"flags": ${COMPONENTS_V2_FLAG}`);
    expect(v2).not.toContain('"embeds"');
    expect(v2).toContain('"type": 17');
    expect(
      screen.getByText(
        /This preview does not post to Discord or create a ticket/,
      ),
    ).toBeVisible();

    const community = screen.getByRole('textbox', { name: 'Community name' });
    await user.clear(community);
    await user.type(community, 'Local test community');
    expect(
      screen.getByLabelText('Compiled demonstration payload').textContent,
    ).toContain('Local test community');

    await user.click(screen.getByRole('button', { name: 'Traditional embed' }));
    const embed =
      screen.getByLabelText('Compiled demonstration payload').textContent ?? '';
    expect(embed).toContain('"embeds"');
    expect(embed).not.toContain('"flags"');
    expect(embed).not.toContain('"type": 17');
    expect(
      screen.getByRole('button', { name: 'Traditional embed' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches documentation body content rather than only guide titles', async () => {
    const user = userEvent.setup();
    renderPage(<DocsPage />, '/docs');
    await user.type(
      screen.getByRole('searchbox', { name: 'Search documentation content' }),
      'webhooks',
    );
    expect(
      screen.getByRole('button', { name: /Set fair participation rules/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Your first server, step by step/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Set fair participation rules/ }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'Set fair participation rules',
        level: 2,
      }),
    ).toBeVisible();
    expect(screen.getByText(/Bots and webhooks are excluded/)).toBeVisible();
  });

  it('uses and filters only commands returned by the running registry', async () => {
    vi.mocked(getPublicCommands).mockResolvedValue({
      commands: [
        {
          name: 'ticket claim',
          description: 'Claim a permitted ticket.',
          category: 'Support',
          usage: '/ticket claim number:12',
          permission: 'tickets.manage',
        },
        {
          name: 'level',
          description: 'Read your progression.',
          category: 'Engagement',
          permission: 'member.read',
        },
      ],
    });
    const user = userEvent.setup();
    renderPage(<CommandsPage />, '/commands');
    expect(await screen.findByText('Claim a permitted ticket.')).toBeVisible();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search commands' }),
      'tickets.manage',
    );
    expect(screen.getByText('Claim a permitted ticket.')).toBeVisible();
    expect(
      screen.queryByText('Read your progression.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('/ban')).not.toBeInTheDocument();
  });

  it('shows an unavailable registry without manufacturing sample commands', async () => {
    vi.mocked(getPublicCommands).mockRejectedValue(
      new Error('Service unavailable'),
    );
    renderPage(<CommandsPage />, '/commands');
    expect(
      await screen.findByText(/No sample commands are shown as available/),
    ).toBeVisible();
    expect(screen.queryByText('/help')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeVisible();
  });

  it('keeps unknown service observations separate from operational claims', async () => {
    renderPage(<StatusPage />, '/status');
    expect(
      await screen.findByRole('heading', { name: 'Unknown', level: 2 }),
    ).toBeVisible();
    expect(screen.getByText('No service observations')).toBeVisible();
    expect(screen.queryByText('Operational')).not.toBeInTheDocument();
    expect(
      screen.getByText(/This is not a historical uptime claim/),
    ).toBeVisible();
  });

  it('keeps feature descriptions visible while reporting unavailable live capability data', async () => {
    vi.mocked(getPublicFeatures).mockRejectedValue(new Error('Offline'));
    renderPage(<FeaturesPage />, '/features');
    await waitFor(() =>
      expect(
        screen.getByText(/Live availability could not be loaded/),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole('link', { name: 'A calmer support inbox' }),
    ).toBeVisible();
    expect(screen.getAllByText('Availability not loaded')).toHaveLength(10);
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });
});
