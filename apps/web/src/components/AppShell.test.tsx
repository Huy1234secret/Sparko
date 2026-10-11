// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardShell, RequireSession, switchPath } from './AppShell';
import { getSession } from '../services/session';
import { getGuilds } from '../services/guilds';

vi.mock('../services/session', async (original) => ({
  ...(await original<typeof import('../services/session')>()),
  getSession: vi.fn(),
}));
vi.mock('../services/guilds', async (original) => ({
  ...(await original<typeof import('../services/guilds')>()),
  getGuilds: vi.fn(),
}));
function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <RequireSession />,
        children: [
          {
            element: <DashboardShell />,
            children: [
              {
                path: 'dashboard/:guildId/engagement/levels',
                element: <h1>Levels & XP</h1>,
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const guild = (id: string, name: string) => ({
  id,
  name,
  installed: true,
  manageable: true,
  capabilities: [],
});

describe('session gate', () => {
  it('explains a cancelled Discord sign-in and offers to start again', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: null, capabilities: [] });
    renderAt('/dashboard/1/engagement/levels?signin=cancelled');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in was cancelled',
    );
    expect(
      screen.getByRole('link', { name: /Continue with Discord/ }),
    ).toBeVisible();
  });
});
describe('dashboard shell', () => {
  it('names the page in breadcrumbs and the tab title, and switches servers to the same page', async () => {
    const user = userEvent.setup();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: '9', username: 'admin' },
      capabilities: [],
    });
    vi.mocked(getGuilds).mockResolvedValue([
      guild('1', 'Cafe'),
      guild('2', 'Garden'),
    ]);
    renderAt('/dashboard/1/engagement/levels');
    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(
      await screen.findByText('Levels & XP', { selector: 'span' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(trail).toHaveTextContent('Your servers');
    expect(document.title).toBe('Levels & XP · Cafe · Sparko');
    const switcher = screen.getAllByRole('button', {
      name: /Switch server/,
    })[0]!;
    await user.click(switcher);
    expect(switcher).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /Garden/ })).toHaveAttribute(
      'href',
      '/dashboard/2/engagement/levels',
    );
    await user.keyboard('{Escape}');
    expect(switcher).toHaveAttribute('aria-expanded', 'false');
    expect(switcher).toHaveFocus();
  });
});
describe('switchPath', () => {
  it('keeps the section but never a record ID', () => {
    expect(switchPath('/dashboard/1/support/tickets/abc', '1', '2')).toBe(
      '/dashboard/2/support/tickets',
    );
    expect(switchPath('/dashboard/1/support/tickets/config', '1', '2')).toBe(
      '/dashboard/2/support/tickets/config',
    );
    expect(switchPath('/account', undefined, '2')).toBe('/dashboard/2');
  });
});
