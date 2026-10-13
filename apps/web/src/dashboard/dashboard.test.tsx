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
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ToastProvider } from '../ui';
import { routes } from '../router';
import { createQueryClient } from '../data';
import { resetMock, setMockDelay } from '../data/mock';

const pixel = '/dashboard/900000000000000001';
const paused = '/dashboard/900000000000000004';

beforeAll(async () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  await import('../../../../design-system/assets/icons/sp-icon.js');
});
beforeEach(() => {
  resetMock();
  setMockDelay(0);
});
afterEach(cleanup);

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('entry pages', () => {
  it('signs in and lists servers with Sparko apart from ones to add it to', async () => {
    const router = open('/signin');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue with Discord' }),
    );
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Choose a server' },
        { timeout: 3000 },
      ),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/dashboard');
    const here = await screen.findByRole('region', { name: /Sparko is here/ });
    expect(
      within(here).getByRole('link', { name: /Pixel Plaza/ }),
    ).toBeInTheDocument();
    expect(within(here).getByText('Paused')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add Sparko to Retro Arcade' }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search your servers' }),
      'zzz',
    );
    expect(screen.getByText('No servers match “zzz”')).toBeInTheDocument();
  });

  it('says so when someone opens a server they can’t manage', async () => {
    open('/dashboard/123');
    expect(
      await screen.findByText('You can’t manage this server'),
    ).toBeInTheDocument();
  });
});

describe('overview', () => {
  it('walks the setup checklist and lets a step be skipped and undone', async () => {
    open(pixel);
    expect(
      await screen.findByText('3 of 6 done · about 4 min left'),
    ).toBeInTheDocument();
    const current = screen.getByRole('listitem', { current: 'step' });
    expect(within(current).getByText('Greet new members')).toBeInTheDocument();
    await userEvent.click(
      within(current).getByRole('button', { name: 'Skip for now' }),
    );
    expect(
      within(
        await screen.findByRole('listitem', { current: 'step' }),
      ).getByText('Give members a starter role'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo skip' }));
    expect(
      within(
        await screen.findByRole('listitem', { current: 'step' }),
      ).getByText('Greet new members'),
    ).toBeInTheDocument();
  });

  it('explains a missing permission and clears it after a re-check', async () => {
    open(pixel);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Fix it' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Give Sparko the Manage Roles permission',
    });
    expect(
      within(dialog).getByText(/never asks for Administrator/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Check again' }),
    );
    expect(await screen.findByText('All permissions OK')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('navigation', () => {
  it('finds modules in the sidebar and opens them', async () => {
    const router = open(pixel);
    const nav = await screen.findByRole('navigation', {
      name: 'Pixel Plaza dashboard',
    });
    await userEvent.type(
      within(nav).getByRole('textbox', { name: 'Find a module' }),
      'giveaway',
    );
    expect(within(nav).queryByRole('button', { name: /Tickets/ })).toBeNull();
    await userEvent.click(
      within(nav).getByRole('button', { name: /Giveaways/ }),
    );
    expect(router.state.location.pathname).toBe(`${pixel}/giveaways`);
    expect(
      await screen.findByRole('heading', { name: /Giveaways/, level: 1 }),
    ).toBeInTheDocument();
  });

  it('jumps anywhere with Ctrl+K', async () => {
    const router = open(pixel);
    await screen.findByText('Get Pixel Plaza set up');
    await userEvent.keyboard('{Control>}k{/Control}');
    const palette = screen.getByRole('dialog', { name: 'Search Sparko' });
    await userEvent.type(within(palette).getByRole('combobox'), 'ticket');
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe(`${pixel}/tickets`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches servers from the sidebar', async () => {
    const router = open(pixel);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Switch server, current: Pixel Plaza',
      }),
    );
    await userEvent.click(
      screen.getByRole('option', { name: /Night Owls Gaming/ }),
    );
    expect(router.state.location.pathname).toBe(
      '/dashboard/900000000000000003',
    );
  });
});

describe('module pages', () => {
  it('turns a module on with the save bar and shows it go live', async () => {
    open(`${pixel}/counting`);
    const power = await screen.findByRole('switch', {
      name: 'Counting on or off',
    });
    expect(power).not.toBeChecked();
    await userEvent.click(power);
    const bar = screen.getByRole('region', { name: 'Unsaved changes' });
    await userEvent.click(
      within(bar).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await screen.findByText('Done. Members see the new version from now on.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Unsaved changes' }),
    ).toBeNull();
    expect(
      screen.getByRole('switch', { name: 'Counting on or off' }),
    ).toBeChecked();
  });

  it('offers Plus instead of a Plus-only module on a Free server', async () => {
    open(`${pixel}/multi-server`);
    expect(
      await screen.findByRole('heading', {
        name: 'Multi-server tools are part of Plus',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Yearly' }));
    expect(screen.getByText('US$35.91')).toBeVisible();
  });

  it('locks a paused server’s modules and says why', async () => {
    open(`${paused}/welcome`);
    expect(
      await screen.findByText('Sparko is paused on Study Hall 24/7'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Welcome on or off' }),
    ).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
  });
});

describe('Welcome', () => {
  it('previews the message live and validates it before saving', async () => {
    open(`${pixel}/welcome`);
    const message = await screen.findByRole('textbox', { name: 'Message' });
    await userEvent.clear(message);
    await userEvent.type(message, 'Hi {{user}, enjoy **{{server}**!');
    const preview = document.querySelector('.dc-embed__desc')!;
    expect(preview.textContent).toBe('Hi @tomoko, enjoy Pixel Plaza!');
    expect(preview.querySelector('b')?.textContent).toBe('Pixel Plaza');

    await userEvent.click(
      screen.getByRole('switch', { name: 'Welcome on or off' }),
    );
    await userEvent.clear(message);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      screen.getAllByText('Write a message, or turn Welcome off.').length,
    ).toBeGreaterThan(0);
    expect(message).toHaveAttribute('aria-invalid', 'true');
  });

  it('saves, reports that the channel is blocked, and goes live once it is fixed', async () => {
    open(`${pixel}/welcome`);
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Welcome on or off' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Couldn’t apply', {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show me how' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Let Sparko post in #welcome',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Check again' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Sparko can’t post in #welcome')).toBeNull(),
    );
    // Once fixed, the saved change goes live without saving again.
    expect(
      await screen.findByText('Live in #welcome', {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  });

  it('sends only a DM without needing a channel', async () => {
    open(`${pixel}/welcome`);
    await userEvent.click(
      await screen.findByRole('radio', { name: /Direct message/ }),
    );
    expect(screen.getByRole('button', { name: /Channel/ })).toBeDisabled();
    expect(
      screen.getByText('Not needed when sending only a direct message.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sparko can’t post in #welcome')).toBeNull();
  });

  it('picks a channel with the keyboard and refuses ones Sparko can’t post in', async () => {
    open(`${pixel}/welcome`);
    await userEvent.click(
      await screen.findByRole('button', { name: /Channel/ }),
    );
    const search = screen.getByRole('combobox', { name: 'Search channels' });
    expect(screen.getByRole('option', { name: /rules/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.type(search, 'arriv');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(
      screen.getByRole('button', { name: /Channel arrivals/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('#arrivals', { selector: '.sp-hint' }),
    ).toBeInTheDocument();
  });

  it('uses a template and restores an earlier version into the editor', async () => {
    const router = open(`${pixel}/welcome?tab=items`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Use Short and sweet' }),
    );
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Hi {user} 👋 Glad you’re here.',
    );

    await userEvent.click(screen.getByRole('tab', { name: /History/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Restore “First version”' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Load into editor',
      }),
    );
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Welcome to {server}, {user}!',
    );
    expect(
      screen.getByRole('switch', { name: /Send as an embed/ }),
    ).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Hey {user}, welcome to **{server}**! You’re member #{member_count}. Read #rules, then say hi in #introductions.',
    );
  });
});
