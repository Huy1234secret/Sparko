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

describe('Tickets', () => {
  it('lists tickets needing a reply, longest waits first, and searches them', async () => {
    open(`${pixel}/tickets`);
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    // #208 and #213 have waited over an hour; #213 is urgent so comes first.
    expect(rows[0]).toHaveTextContent('#213');
    expect(rows[1]).toHaveTextContent('#208');
    expect(rows).toHaveLength(4);
    await userEvent.click(screen.getByRole('radio', { name: /Closed/ }));
    expect(screen.getByText('Lost my colour role')).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search tickets' }),
      'zzz',
    );
    expect(screen.getByText('No tickets match “zzz”')).toBeInTheDocument();
  });

  it('opens a ticket, assigns it, replies, adds a note and closes it', async () => {
    const router = open(`${pixel}/tickets`);
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /#214 Can’t see #events/ },
        { timeout: 4000 },
      ),
    );
    expect(router.state.location.pathname).toBe(`${pixel}/tickets/214`);
    expect(
      await screen.findByRole('heading', {
        name: 'Can’t see #events after verifying',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('log')).getByText('Ticket #214'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Assign/ }));
    await userEvent.click(screen.getByRole('option', { name: /Rhea/ }));
    expect(
      await screen.findByText('Rhea is handling this ticket'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(
      await screen.findByRole('button', { name: /Assigned to you/ }),
    ).toBeInTheDocument();

    const reply = screen.getByRole('textbox', { name: 'Reply to tomoko' });
    await userEvent.type(reply, 'Try verifying again now.');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    const log = screen.getByRole('log');
    expect(
      await within(log).findByText('Try verifying again now.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Waiting on member')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Staff note' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Staff note' }),
      'Role sync was slow.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await within(log).findByText(/Staff note from/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close ticket' }));
    const dialog = screen.getByRole('dialog', { name: 'Close ticket #214?' });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: /Something else/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close ticket' }),
    );
    expect(
      within(dialog).getByText(
        'Add a short reason so the team knows what happened.',
      ),
    ).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Reason' }),
      'Fixed by role sync',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close ticket' }),
    );
    expect(
      await screen.findByText(/Closed by you · Fixed by role sync/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Reply/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(
      await screen.findByRole('textbox', { name: 'Reply to tomoko' }),
    ).toBeInTheDocument();
  }, 20_000);

  it('validates the ticket panel and previews each button’s opener', async () => {
    open(`${pixel}/tickets?tab=settings`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Report a member' }),
    );
    expect(
      screen.getByText(/Who is it, and what happened\?/),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Title' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Give the panel a title.')).toBeInTheDocument();
    expect(
      screen.getByText('Fix the highlighted fields first.'),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Title' }),
      'Get help',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Live in #support', {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  });

  it('says when a ticket doesn’t exist', async () => {
    open(`${pixel}/tickets/999`);
    expect(
      await screen.findByText('Ticket #999 not found', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});

describe('Message Studio', () => {
  it('previews edits live and checks fields, links and colours before publishing', async () => {
    open(`${pixel}/studio`);
    const title = await screen.findByRole(
      'textbox',
      { name: /^Title/ },
      { timeout: 4000 },
    );
    await userEvent.clear(title);
    await userEvent.type(title, 'Summer Jam');
    expect(document.querySelector('.dc-embed__title')).toHaveTextContent(
      'Summer Jam',
    );

    await userEvent.clear(screen.getByRole('textbox', { name: /Image link/ }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /Image link/ }),
      'x',
    );
    expect(
      screen.getByText(
        'The link must start with https:// so Discord can load it.',
      ),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('textbox', { name: /Image link/ }));

    const hex = screen.getByRole('textbox', { name: 'Custom colour, hex' });
    await userEvent.clear(hex);
    await userEvent.type(hex, '#12');
    expect(
      screen.getByText('Use a hex colour like #FACC15.'),
    ).toBeInTheDocument();
    await userEvent.type(hex, '3456');
    expect(screen.queryByText('Use a hex colour like #FACC15.')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Add a field' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Field 4 name' }),
      'Judges',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Publish changes' }),
    );
    expect(
      screen.getByText('Fields need both a name and a value.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Fix the highlighted fields first.'),
    ).toBeInTheDocument();
  }, 20_000);

  it('publishes, reports the locked channel, and updates once it is fixed', async () => {
    open(`${pixel}/studio`);
    expect(
      await screen.findByText(
        'Sparko can’t post in #announcements',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Text/ }),
      ' See you there.',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Publish changes' }),
    );
    expect(
      await screen.findByText('Couldn’t apply', {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(
      await screen.findByText('Updated in #announcements', {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Versions/ }));
    expect(screen.getByText('Published changes')).toBeInTheDocument();
  });

  it('uses, saves and deletes templates', async () => {
    open(`${pixel}/studio?tab=items`);
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Delete Server rules' },
        { timeout: 4000 },
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Server rules')).toBeNull());
    await userEvent.click(
      screen.getByRole('button', { name: 'Save current as a template' }),
    );
    expect(
      await screen.findByText('Saved “Spring art jam announcement”'),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Use Weekly recap' }),
    );
    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue(
      'This week in Pixel Plaza',
    );
    expect(
      screen.getByRole('button', { name: 'Publish changes' }),
    ).toBeInTheDocument();
  });
});
