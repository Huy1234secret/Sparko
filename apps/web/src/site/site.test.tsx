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
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui';
import { routes } from '../router';
import { modules } from '../content/modules';
import { commands } from '../content/commands';
import { setTheme } from '../state/theme';

beforeAll(async () => {
  // jsdom has no matchMedia; the home page asks it about reduced motion.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  // Like current Chrome, where scrolling returns a promise.
  window.scrollTo = vi.fn(() => Promise.resolve()) as never;
  await import('../../../../design-system/assets/icons/sp-icon.js');
});
afterEach(cleanup);

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
  return router;
}

describe('content', () => {
  it('lists each module once, with an icon the design system draws', () => {
    const paths = (window as unknown as { SparkoIconPaths: object })
      .SparkoIconPaths;
    expect(new Set(modules.map((m) => m.id)).size).toBe(modules.length);
    for (const m of modules) expect(paths, m.id).toHaveProperty(m.icon);
    expect(modules.filter((m) => m.plus).map((m) => m.id)).toEqual([
      'multi-server',
    ]);
  });
  it('parses every command’s options', () => {
    const ban = commands.find((c) => c.name === '/ban');
    expect(ban?.options.map((o) => o.name)).toEqual([
      'user',
      'reason',
      'delete',
    ]);
    expect(commands.every((c) => c.name.startsWith('/'))).toBe(true);
  });
});

describe('public site', () => {
  it('opens the home page with one main heading and working navigation', async () => {
    const router = open('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /explains itself/ }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole(
        'link',
        { name: 'Pricing' },
      ),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Free for nearly everything.',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/pricing');
  });

  it('explains Add to Discord instead of leaving the site', async () => {
    open('/');
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Add to Discord' }))[0]!,
    );
    expect(await screen.findByText('Discord would open here')).toBeVisible();
  });

  it('searches features, keeps the search in the address and offers a way back', async () => {
    const router = open('/features');
    const search = await screen.findByRole('searchbox', {
      name: 'Search features',
    });
    await userEvent.type(search, 'giveaway');
    expect(screen.getByRole('link', { name: /Giveaways/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tickets/ })).toBeNull();
    expect(router.state.location.search).toBe('?q=giveaway');
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    await userEvent.click(
      screen.getByRole('button', { name: 'Show all features' }),
    );
    expect(
      screen.getAllByRole('link', { name: /Tickets/ }).length,
    ).toBeGreaterThan(0);
  });

  it('filters features by group from the address', async () => {
    open('/features?group=Safety');
    expect(
      await screen.findByRole('button', { name: 'Safety', pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Safety' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Community' })).toBeNull();
  });

  it('lets visitors try Message Studio with a live preview', async () => {
    open('/features/studio');
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Movie night');
    expect(
      screen.getByText('Movie night', { selector: '.dc-embed__title' }),
    ).toBeVisible();
  });

  it('shows the price for the chosen billing period', async () => {
    open('/pricing');
    await userEvent.click(await screen.findByRole('radio', { name: /Yearly/ }));
    expect(screen.getByText('US$35.91')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Get Plus · yearly' }),
    ).toBeEnabled();
  });

  it('filters commands by category and counts them', async () => {
    open('/commands');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Economy' }),
    );
    expect(screen.getByText('4 commands')).toBeInTheDocument();
    expect(
      screen.getByText('/daily', { selector: '.sw-cmd__name' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('/ban', { selector: '.sw-cmd__name' }),
    ).toBeNull();
  });

  it('shows a helpful page for unknown addresses and unknown features', async () => {
    open('/no-such-page');
    expect(
      await screen.findByText('This page doesn’t exist'),
    ).toBeInTheDocument();
    cleanup();
    open('/features/no-such-module');
    expect(
      await screen.findByText('This page doesn’t exist'),
    ).toBeInTheDocument();
  });

  it('switches theme and remembers it', async () => {
    setTheme('dark');
    open('/');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Switch to light theme' }),
    );
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('sparko-theme')).toBe('light');
    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeInTheDocument();
  });

  it('opens and closes the mobile menu', async () => {
    open('/');
    const toggle = await screen.findByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('crashes', () => {
  it('moves between every top menu page without crashing', async () => {
    const router = open('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const [name, path] of [
      ['Features', '/features'],
      ['Pricing', '/pricing'],
      ['Commands', '/commands'],
      ['Docs', '/docs'],
      ['Status', '/status'],
    ] as const) {
      const before = screen.getByRole('heading', { level: 1 }).textContent;
      await userEvent.click(within(nav).getByRole('link', { name }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe(path);
        expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(
          before,
        );
      });
      expect(screen.queryByText(/Something went wrong/)).toBeNull();
    }
  });
});
