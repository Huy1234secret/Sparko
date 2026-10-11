// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsPage } from './AnalyticsPage';
import { getAnalytics } from '../../services/modules';

vi.mock('../../services/modules', () => ({ getAnalytics: vi.fn() }));
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('analytics', () => {
  it('reports coverage and keeps uncollected days out of the totals', async () => {
    const user = userEvent.setup();
    vi.mocked(getAnalytics).mockResolvedValue({
      range: {
        from: '2026-10-10T00:00:00.000Z',
        to: '2026-10-11T23:00:00.000Z',
        timezone: 'UTC',
        precision: 'hour',
      },
      enabled: true,
      status: 'collection-gaps',
      observedAt: '2026-10-11T23:10:00.000Z',
      rows: [
        {
          hour: '2026-10-11T10:00:00.000Z',
          metric: 'messages',
          count: 12,
          observedAt: '2026-10-11T10:59:00Z',
        },
        {
          hour: '2026-10-11T11:00:00.000Z',
          metric: 'joins',
          count: 2,
          observedAt: '2026-10-11T11:30:00Z',
        },
      ],
      gaps: [
        {
          metric: 'messages',
          from: '2026-10-10T00:00:00.000Z',
          to: '2026-10-11T00:00:00.000Z',
          reason: 'Bot offline',
        },
        {
          metric: 'members',
          from: '2026-10-10T00:00:00.000Z',
          to: '2026-10-12T00:00:00.000Z',
          reason: 'Members intent missing',
        },
      ],
      members: { count: 140, observedAt: '2026-10-11T23:00:00.000Z' },
      moduleActions: [{ action: 'config:R09', count: 3 }],
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [
        {
          path: '/dashboard/:guildId/insights/analytics',
          element: <AnalyticsPage />,
        },
      ],
      { initialEntries: ['/dashboard/1/insights/analytics'] },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Collected with gaps')).toBeVisible();
    expect(screen.getByText('50%')).toBeVisible();
    expect(screen.getByText('24 of 48 hours observed')).toBeVisible();
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByText('Not observed')).toBeVisible();
    expect(within(rows[2]!).getByText('12')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Joins' }));
    // Only the hour with an actual observation counts; the rest stay gaps.
    expect(await screen.findByText('1 of 48 hours observed')).toBeVisible();
    expect(screen.getByText('Members intent missing')).toBeVisible();
  });
});
