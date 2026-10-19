// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
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
import { resetBackend } from '../data/live';

const pixel = '/dashboard/900000000000000001';
const paused = '/dashboard/900000000000000004';

beforeAll(async () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  // Like current Chrome, where scrolling returns a promise.
  window.scrollTo = vi.fn(() => Promise.resolve()) as never;
  Element.prototype.scrollTo = vi.fn(() => Promise.resolve()) as never;
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
    // The first page in this file waits for the dashboard code to load.
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Continue with Discord' },
        { timeout: 4000 },
      ),
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
      await screen.findByRole('button', { name: 'Fix it' }, { timeout: 4000 }),
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
    expect(
      await screen.findByText('All permissions OK', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 15_000);
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
      screen.getByRole('switch', { name: 'Welcome messages on or off' }),
    ).toBeDisabled();
    expect(
      await screen.findByRole('button', { name: /Message template/ }),
    ).toBeDisabled();
  });
});

describe('Welcome messages', () => {
  it('edits the join template in the preview, saves, and goes live once the channel is fixed', async () => {
    open(`${pixel}/welcome`);
    expect(await screen.findByText(/Editing/)).toHaveTextContent(
      'Welcome card',
    );
    expect(
      screen.getByRole('button', { name: /Message template/ }),
    ).toHaveTextContent('Welcome card');
    // Member variables are listed for these messages.
    await userEvent.click(screen.getByRole('button', { name: /Variables/ }));
    expect(
      screen.getByRole('menuitem', { name: /\{user\.avatar\}/ }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    // While Welcome messages are off, the tabs and editor can't be used.
    const body = document.querySelector('.sp-greet-body');
    expect(body).toHaveAttribute('inert');
    await userEvent.click(
      screen.getByRole('switch', { name: 'Welcome messages on or off' }),
    );
    expect(body).not.toHaveAttribute('inert');
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
    expect(
      await screen.findByText('Welcome messages are live', {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  });

  it('won’t send in a channel without a template', async () => {
    const router = open(`${pixel}/welcome`);
    await userEvent.click(
      await screen.findByRole('tab', { name: 'Boost message' }),
    );
    expect(router.state.location.search).toBe('?tab=boost');
    expect(
      screen.getByText('Pick a template for the boost message'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Channel/ }));
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Search channels' }),
      'arriv',
    );
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Pick a template for the boost message.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pick a template to send.')).toBeInTheDocument();
  });

  it('starts a tab from a default template, and puts one into the template in use', async () => {
    open(`${pixel}/welcome?tab=leave`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Use a default template' }),
    );
    let dialog = screen.getByRole('dialog', { name: 'Default templates' });
    expect(within(dialog).getByText('Embed message')).toBeInTheDocument();
    expect(within(dialog).getByText('Any kind')).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Goodbye card/ }),
    );
    expect(await screen.findByText(/Editing/)).toHaveTextContent(
      'Goodbye card',
    );
    expect(
      screen.getByRole('button', { name: /Message template/ }),
    ).toHaveTextContent('Goodbye card');

    await userEvent.click(screen.getByRole('tab', { name: 'Join message' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Use default templates' }),
    );
    dialog = screen.getByRole('dialog', { name: 'Default templates' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Short and sweet/ }),
    );
    expect(
      await screen.findByText('“Welcome card” now looks like Short and sweet'),
    ).toBeInTheDocument();
    expect(document.querySelector('.dc-embed')).toBeNull();
  });

  it('creates a new template for an empty tab', async () => {
    open(`${pixel}/welcome?tab=boost`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create new template' }),
    );
    expect(await screen.findByText(/Editing/)).toHaveTextContent(
      'Boost message',
    );
    // Deleting the channel message is picked from the menu.
    await userEvent.click(screen.getByRole('button', { name: /^Channel/ }));
    await userEvent.click(screen.getByRole('option', { name: /arrivals/ }));
    await userEvent.click(
      screen.getByRole('button', { name: /Delete the channel message/ }),
    );
    await userEvent.click(screen.getByRole('option', { name: /1 minute/ }));
    expect(
      screen.getByRole('button', { name: /Delete the channel message/ }),
    ).toHaveTextContent('After 1 minute');
  });

  it('logs what was sent and why sends failed', async () => {
    open(`${pixel}/welcome?tab=logs`);
    expect(
      await screen.findByText(
        '[WM] Sent “Welcome card” to #welcome (800000000000000002)',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'BM' }));
    expect(screen.queryByText(/\[WM\]/)).toBeNull();
    expect(
      screen.getByText(
        /\[BM\] Failed to send “Thank-you card” to #announcements .*reason: Sparko doesn’t have permission/,
      ),
    ).toBeInTheDocument();
  });
});

describe('Reaction roles', () => {
  it('adds one, sets its roles and checks them before saving', async () => {
    open(`${pixel}/role-menus?tab=items`);
    expect(
      await screen.findByText(/You have 0\/10/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /RR Template/ }));
    expect(await screen.findByText(/You’re editing/)).toHaveTextContent(
      'Reaction role',
    );
    // Roles Sparko can't give can't be picked.
    await userEvent.click(
      screen.getByRole('button', { name: /Reaction 1 role/ }),
    );
    expect(screen.getByRole('option', { name: /Moderator/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(screen.getByRole('option', { name: /Artist/ }));

    // A second reaction with the same emoji is refused on save.
    await userEvent.click(screen.getByRole('button', { name: 'Add reaction' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Give each reaction an emoji.'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove item 2' }),
    );

    // Buttons get their settings from the gear.
    await userEvent.click(screen.getByRole('radio', { name: 'Buttons' }));
    await userEvent.click(
      screen.getByRole('button', { name: /^Settings for/ }),
    );
    const dialog = screen.getByRole('dialog', { name: /Editing/ });
    expect(
      within(dialog).getByRole('button', { name: /Gives role/ }),
    ).toHaveTextContent('Artist');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    // It has an emoji, so it saves and goes live.
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Live in #/, { selector: '.sp-pipeline__step' }),
    ).toBeInTheDocument();
  }, 20_000);

  it('logs each role it gave or took', async () => {
    open(`${pixel}/role-menus?tab=history`);
    expect(await screen.findByText('Nothing yet')).toBeInTheDocument();
  });
});

describe('Automatic roles', () => {
  it('adds a timed role, checks it before saving, and goes live', async () => {
    open(`${pixel}/autoroles`);
    expect(
      await screen.findByText('Join roles', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Timed role$/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Write how long for timed role 3/),
    ).toBeInTheDocument();
    const third = screen.getByRole('listitem', { name: 'Timed role 3' });
    await userEvent.type(
      within(third).getByRole('textbox', { name: 'Time in the server' }),
      '90d',
    );
    // Roles Sparko can't give can't be picked.

    await userEvent.click(within(third).getByRole('button', { name: /^Role/ }));
    expect(screen.getByRole('option', { name: /Moderator/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(screen.getByRole('option', { name: /Member/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(/Automatic roles are live/, {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  }, 20_000);

  it('links requirements with AND or OR', async () => {
    open(`${pixel}/autoroles`);
    const link = await screen.findByRole(
      'button',
      { name: 'OR', pressed: true },
      { timeout: 4000 },
    );
    await userEvent.click(link);
    expect(link).toHaveTextContent('AND');
  });

  it('shows saved member data only after a search, and wipes it', async () => {
    open(`${pixel}/autoroles?tab=history`);
    expect(await screen.findByText('Search for a member')).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search members' }),
      'rhea',
    );
    expect(await screen.findByText(/45d in the server/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /Wipe rhea’s data/ }),
    );
    const dialog = screen.getByRole('dialog', { name: /Wipe rhea/ });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Wipe data' }),
    );
    expect(await screen.findByText(/0m in the server/)).toBeInTheDocument();
  }, 20_000);
});

describe('Reaction roles: Sparko’s template', () => {
  it('offers Sparko’s own claim message, shown but not editable', async () => {
    open(`${pixel}/role-menus?tab=items`);
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /RR Template/ },
        { timeout: 4000 },
      ),
    );
    await screen.findByText(/You’re editing/);
    await userEvent.click(
      screen.getByRole('switch', { name: /Send a response/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Claim message/ }),
    );
    await userEvent.click(
      screen.getByRole('option', { name: /Sparko’s template/ }),
    );
    expect(
      await screen.findByText(/It doesn’t use one of your templates/),
    ).toBeInTheDocument();
    expect(screen.getByText('{role.selected.list}')).toBeInTheDocument();
  }, 20_000);
});

describe('Suggestions', () => {
  it('checks the settings before saving, then goes live', async () => {
    open(`${pixel}/suggestions`);
    expect(
      await screen.findByText('Channels and people', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    const age = screen.getByRole('textbox', { name: 'Minimum account age' });
    await userEvent.type(age, '2y');
    expect(
      await screen.findByText('Has to be between 1d and 1y.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/The account age has to be between 1d and 1y/),
    ).toBeInTheDocument();
    await userEvent.clear(age);
    await userEvent.type(age, '2w');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Live in #general/, {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  }, 20_000);

  it('adds a status and sets what it does', async () => {
    open(`${pixel}/suggestions`);
    await userEvent.click(
      await screen.findByRole('button', { name: /Status$/ }, { timeout: 4000 }),
    );
    // A new status needs a name before it saves.
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Give each status a name/),
    ).toBeInTheDocument();
    const names = screen.getAllByRole('textbox', { name: 'Status name' });
    await userEvent.type(names.at(-1)!, 'In progress');
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for In progress' }),
    );
    const panel = screen.getByRole('dialog', {
      name: /What “In progress” does/,
    });
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Add an action' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Close voting/ }),
    );
    expect(within(panel).getByText('Close voting')).toBeInTheDocument();
    // Built-in statuses keep their approve.
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Close voting')).toBeInTheDocument();
  }, 20_000);

  it('starts the message from a default template, locked to one embed', async () => {
    open(`${pixel}/suggestions?tab=edit`);
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Use a default template' },
        { timeout: 4000 },
      ),
    );
    const dialog = screen.getByRole('dialog', { name: 'Default templates' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Suggestion card/ }),
    );
    expect(await screen.findByText('Live preview')).toBeInTheDocument();
    // Buttons and menus can be added, but no pictures or extra embeds.
    await userEvent.click(
      screen.getByRole('button', { name: 'Add to the message' }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'Add button' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Add menu' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Add embed' }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(
      screen.queryByRole('button', { name: 'Add an image' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove embed 1' }),
    ).not.toBeInTheDocument();
    // The vote buttons are edited like any button, but always vote first
    // and can't be removed.
    expect(
      screen.queryByRole('button', { name: 'Remove the upvote button' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit the upvote button' }),
    );
    const vote = screen.getByRole('dialog', { name: 'Upvote button' });
    const label = within(vote).getByRole('textbox', { name: /Button text/ });
    await userEvent.clear(label);
    await userEvent.type(label, 'Yes please');
    expect(within(vote).getByText('Upvote')).toBeInTheDocument();
    await userEvent.click(
      within(vote).getByRole('button', { name: 'Add an action' }),
    );
    expect(
      within(vote).getByRole('menuitem', { name: 'Approve' }),
    ).toBeDisabled();
    await userEvent.click(
      within(vote).getByRole('menuitem', { name: 'Give or take role' }),
    );
    expect(within(vote).getByText('Give or take role')).toBeInTheDocument();
    await userEvent.click(within(vote).getByRole('button', { name: 'Close' }));
    expect(
      screen.getByRole('button', { name: 'Edit the upvote button' }),
    ).toHaveTextContent('Yes please');
    // Its own buttons can vote, approve or deny.
    await userEvent.click(
      screen.getByRole('button', { name: 'Add to the message' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add button' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Edit button Button/ }),
    );
    const panel = screen.getByRole('dialog', { name: 'Button settings' });
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Add an action' }),
    );
    await userEvent.click(
      within(panel).getByRole('menuitem', { name: 'Approve' }),
    );
    expect(within(panel).getByRole('radio', { name: 'Approve' })).toBeChecked();
    // It answers the click itself, so nothing else can join it.
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Add an action' }),
    );
    expect(
      within(panel).getByRole('menuitem', { name: 'Send message' }),
    ).toBeDisabled();
  }, 20_000);

  it('lists suggestions in Storage with their reasons, and deletes them', async () => {
    open(`${pixel}/suggestions?tab=storage`);
    expect(
      await screen.findByText('Weekly art challenge', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Love it. Starting next Monday in #art-share!'),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search suggestions' }),
      'memes',
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Weekly art challenge'),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete suggestion #6' }),
    );
    const dialog = screen.getByRole('dialog', { name: /Delete suggestion #6/ });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    );
    expect(await screen.findByText('No suggestions here')).toBeInTheDocument();
  }, 20_000);

  it('renames commands and refuses names Discord won’t take', async () => {
    open(`${pixel}/suggestions?tab=commands`);
    const names = await screen.findAllByRole(
      'textbox',
      { name: 'Name' },
      { timeout: 4000 },
    );
    await userEvent.clear(names[0]!);
    await userEvent.type(names[0]!, 'idea!');
    expect(
      screen.getByText('1 to 32 lowercase letters, numbers, - or _.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Command names are 1 to 32/),
    ).toBeInTheDocument();
  }, 20_000);
});

describe('Questions & answers', () => {
  const cozy = '/dashboard/900000000000000002';

  it('checks the settings before saving, then goes live', async () => {
    open(`${pixel}/questions`);
    expect(
      await screen.findByText('Channel and people', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    const expire = screen.getByRole('textbox', {
      name: 'Expire unanswered questions after',
    });
    await userEvent.type(expire, '30mi');
    expect(
      await screen.findByText('Has to be between 1h and 1y.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Expire after has to be between 1h and 1y/),
    ).toBeInTheDocument();
    await userEvent.clear(expire);
    await userEvent.type(expire, '1w');
    // Keeping threads open hides how long to wait.
    await userEvent.click(screen.getByRole('radio', { name: 'Keep open' }));
    expect(
      screen.queryByRole('textbox', { name: 'Close the thread after' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Live in #support/, {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  }, 20_000);

  it('adds categories up to the plan’s limit', async () => {
    open(`${pixel}/questions`);
    const add = await screen.findByRole(
      'button',
      { name: /Category$/ },
      { timeout: 4000 },
    );
    expect(screen.getByTitle('4 of 5 categories used')).toBeInTheDocument();
    await userEvent.click(add);
    expect(screen.getByTitle('5 of 5 categories used')).toBeInTheDocument();
    expect(add).toBeDisabled();
    // A new category needs a name before it saves.
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Give each category a name/),
    ).toBeInTheDocument();
    const names = screen.getAllByRole('textbox', { name: 'Category name' });
    await userEvent.type(names.at(-1)!, 'Art');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Roles' }));
    expect(
      screen.getAllByRole('textbox', { name: 'Category name' }),
    ).toHaveLength(4);
  }, 20_000);

  it('edits the question and answer messages from default templates', async () => {
    open(`${pixel}/questions?tab=edit`);
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Use a default template' },
        { timeout: 4000 },
      ),
    );
    const dialog = screen.getByRole('dialog', { name: 'Default templates' });
    expect(
      within(dialog).queryByRole('button', { name: /Answer card/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Question card/ }),
    );
    expect(await screen.findByText('Live preview')).toBeInTheDocument();
    // The fixed buttons show under the question.
    const fixed = screen.getByLabelText('Question buttons');
    expect(within(fixed).getByText('Mark answered')).toBeInTheDocument();
    expect(within(fixed).getByText(/Me too/)).toBeInTheDocument();
    // No pictures or extra embeds.
    await userEvent.click(
      screen.getByRole('button', { name: 'Add to the message' }),
    );
    expect(
      screen.queryByRole('menuitem', { name: 'Add embed' }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    // Question variables are listed for this message.
    await userEvent.click(screen.getByRole('button', { name: 'Variables' }));
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search variables' }),
      'metoo',
    );
    const item = screen.getByRole('menuitem', { name: /\{metoo\.count\}/ });
    expect(item).not.toHaveClass('is-off');
    await userEvent.keyboard('{Escape}');
    // The answer message is its own template.
    await userEvent.click(
      screen.getByRole('radio', { name: 'Answer message' }),
    );
    expect(
      await screen.findByText('How should answers look?'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Use a default template' }),
    );
    await userEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Default templates' }),
      ).getByRole('button', { name: /Modern answer/ }),
    );
    expect(await screen.findByText('Live preview')).toBeInTheDocument();
    expect(screen.queryByLabelText('Question buttons')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Live in #support/, {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  }, 20_000);

  it('lists questions in Storage with their answers, and deletes them', async () => {
    open(`${pixel}/questions?tab=storage`);
    expect(
      await screen.findByText(
        'How do I get the Artist role?',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Only in #introductions, once/),
    ).toBeInTheDocument();
    expect(screen.getByText('Deleted in Discord')).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search questions' }),
      'stream',
    );
    await waitFor(() =>
      expect(
        screen.queryByText('How do I get the Artist role?'),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete question #8' }),
    );
    const dialog = screen.getByRole('dialog', { name: /Delete question #8/ });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    );
    expect(await screen.findByText('No questions here')).toBeInTheDocument();
  }, 20_000);

  it('filters the log', async () => {
    open(`${pixel}/questions?tab=logs`);
    expect(
      await screen.findByText(
        /\[ASKED\] #8 asked by @kestrel/,
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Answers' }));
    expect(screen.queryByText(/\[ASKED\]/)).not.toBeInTheDocument();
    expect(screen.getByText(/\[RE-ANSWERED\] #7/)).toBeInTheDocument();
  }, 20_000);

  it('renames commands and refuses names Discord or Suggestions use', async () => {
    open(`${pixel}/questions?tab=commands`);
    const names = await screen.findAllByRole(
      'textbox',
      { name: 'Name' },
      { timeout: 4000 },
    );
    expect(names).toHaveLength(6);
    await userEvent.clear(names[0]!);
    await userEvent.type(names[0]!, 'Help desk!');
    expect(
      screen.getByText('1 to 32 lowercase letters, numbers, - or _.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Command names are 1 to 32/),
    ).toBeInTheDocument();
    await userEvent.clear(names[0]!);
    await userEvent.type(names[0]!, 'suggest');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/already a command in this server/),
    ).toBeInTheDocument();
  }, 20_000);

  it('works while it’s off, on Plus', async () => {
    open(`${cozy}/questions`);
    expect(
      await screen.findByText(
        'Questions & answers is off. Turn it on above to edit it.',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByTitle('6 of 25 categories used')).toBeInTheDocument();
    expect(
      screen.getByTitle('5 of 20 open questions per member used'),
    ).toBeInTheDocument();
  }, 20_000);
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

/** Opens the first sample template in the editor. */
async function openEditor() {
  open(`${pixel}/studio?tab=items`);
  await userEvent.click(
    await screen.findByRole(
      'button',
      { name: 'Edit Spring art jam announcement' },
      { timeout: 4000 },
    ),
  );
  await screen.findByText('Live preview');
}

describe('Message Studio', () => {
  it('asks for a template first, then edits it right in the preview', async () => {
    open(`${pixel}/studio`);
    expect(
      await screen.findByText(
        'Select a template to start editing!',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open templates' }),
    );
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Edit Spring art jam announcement',
      }),
    );
    expect(screen.getByText(/You’re editing/)).toHaveTextContent(
      'Spring art jam announcement',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Edit title' }));
    const title = screen.getByRole('textbox', { name: 'title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Summer Jam{Enter}');
    expect(document.querySelector('.dc-embed__title')).toHaveTextContent(
      'Summer Jam',
    );

    // Writing in the empty field at the end adds a field, and another appears.
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit field 4 name' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'field 4 name' }),
      'Judges{Enter}',
    );
    expect(
      screen.getByRole('button', { name: 'Edit field 5 name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move field 1 up' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move field 4 down' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Move field 4 up' }),
    );
    expect(
      screen.getAllByRole('button', { name: /^Edit field \d name$/ })[2],
    ).toHaveTextContent('Judges');
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Field 3 inline' }),
    );

    // Saving from the settings card (the save bar offers it too).
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Save template' })[0]!,
    );
    expect(
      await screen.findByText('Saved “Spring art jam announcement”'),
    ).toBeInTheDocument();
  }, 20_000);

  it('adds embeds, buttons and pictures from the plus menu', async () => {
    await openEditor();
    const plus = screen.getByRole('button', { name: 'Add to the message' });
    await userEvent.click(plus);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add embed' }));
    expect(
      screen.getByRole('button', { name: 'Colour of embed 2' }),
    ).toBeInTheDocument();

    await userEvent.click(plus);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add image' }));
    const pictureLink = within(
      screen.getByRole('dialog', { name: 'Image URL' }),
    ).getByRole('textbox', { name: 'Image URL' });
    await userEvent.type(pictureLink, 'not a link{Enter}');
    expect(
      screen.getByText('Use a link that starts with https://.'),
    ).toBeInTheDocument();
    await userEvent.clear(pictureLink);
    await userEvent.type(pictureLink, 'https://img.example/a.png{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Image URL' })).toBeNull();

    await userEvent.click(plus);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add button' }));
    // A new button's settings open only when it's clicked.
    expect(
      screen.queryByRole('dialog', { name: 'Button settings' }),
    ).toBeNull();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Edit button Button' }).at(-1)!,
    );
    const dialog = screen.getByRole('dialog', { name: 'Button settings' });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Link button' }),
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'URL' }),
      'https://example.com',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close' }),
    );
    expect(screen.getByText(/"url": "https:\/\/example.com"/)).toBeTruthy();

    // The colour wheel recolours the embed.
    await userEvent.click(
      screen.getByRole('button', { name: 'Colour of embed 1' }),
    );
    const picker = screen.getByRole('dialog', { name: 'Colour picker' });
    const hex = within(picker).getByRole('textbox', { name: 'Hex colour' });
    await userEvent.clear(hex);
    await userEvent.type(hex, '5865f2');
    expect(screen.getByText(/"color": 5793266/)).toBeTruthy();
    // The other formats show the same colour.
    await userEvent.click(within(picker).getByRole('radio', { name: 'RGB' }));
    expect(within(picker).getByRole('spinbutton', { name: 'Red' })).toHaveValue(
      88,
    );
    await userEvent.click(
      within(picker).getByRole('button', { name: 'Close the colour picker' }),
    );
    expect(screen.queryByRole('dialog', { name: 'Colour picker' })).toBeNull();
  }, 20_000);

  it('adds emoji where you were writing, from Unicode or the server', async () => {
    await openEditor();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit description' }),
    );
    const description = screen.getByRole('textbox', { name: 'description' });
    await userEvent.type(description, '{End} ');
    await userEvent.click(screen.getByRole('button', { name: 'Add an emoji' }));
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: 'grinning face' },
        { timeout: 4000 },
      ),
    );
    expect(document.querySelector('.dc-embed__desc')).toHaveTextContent(
      /500 XP\. 😀$/,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add an emoji' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Server' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'pixel_heart' }),
    );
    expect(
      document.querySelector('.dc-embed__desc img.dc-custom-emoji'),
    ).toHaveAttribute('alt', ':pixel_heart:');
  }, 20_000);

  it('turns a message Sparko sent into the template, from its link', async () => {
    await openEditor();
    const field = screen.getByRole('textbox', { name: /Edit message/ });
    const button = screen.getByRole('button', { name: 'Edit message' });
    expect(button).toBeDisabled();
    await userEvent.type(field, 'https://discord.com/channels/42/1/2');
    expect(
      screen.getByText('That message is in another server.'),
    ).toBeInTheDocument();
    expect(button).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(
      field,
      'https://discord.com/channels/900000000000000001/1/2',
    );
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(
      await screen.findByText(
        'Message edited in Discord',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
  });

  it('edits the message as JSON, and points at problems on saving', async () => {
    await openEditor();
    const code = document.querySelector<HTMLTextAreaElement>('.sp-code__text')!;
    // JSON that doesn't read turns the box red and names the line.
    fireEvent.change(code, {
      target: { value: '{\n  "content": "Hello there",\n  oops\n}' },
    });
    expect(document.querySelector('.sp-code')).toHaveClass('is-error');
    expect(document.querySelector('#studio-json-error')).toHaveTextContent(
      'Line 3 isn’t valid JSON',
    );
    expect(
      document.querySelector('.sp-code__gutter .is-bad'),
    ).toHaveTextContent('3');
    // JSON that reads changes the message.
    fireEvent.change(code, {
      target: {
        value: JSON.stringify({
          content: 'Hello there',
          components: [
            {
              type: 1,
              components: [{ type: 2, style: 1, label: 'Go', custom_id: 'x' }],
            },
          ],
        }),
      },
    });
    expect(document.querySelector('.sp-code')).not.toHaveClass('is-error');
    expect(document.querySelector('.dc-content')).toHaveTextContent(
      'Hello there',
    );
    // The new button does nothing yet, so saving opens it and points there.
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Save template' })[0]!,
    );
    expect(await screen.findByText('Can’t save yet')).toBeInTheDocument();
    expect(screen.getByText('Button settings')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('.is-flagged')).toHaveClass('sp-actions'),
    );
  });

  it('sets up buttons with actions, link buttons and menus', async () => {
    await openEditor();
    const json = () =>
      (document.querySelector('.sp-code__text') as HTMLTextAreaElement).value;

    // An action button: its colour, text and a "Send message" action.
    await userEvent.click(
      screen.getByRole('button', { name: /Edit button I’m in/ }),
    );
    const panel = screen.getByRole('dialog', { name: 'Button settings' });
    await userEvent.click(within(panel).getByRole('radio', { name: 'Red' }));
    expect(json()).toMatch(/"style": 4/);
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Add an action' }),
    );
    // Suggestion actions only work on the suggestion message.
    expect(
      within(panel).getByRole('menuitem', { name: 'Upvote' }),
    ).toBeDisabled();
    await userEvent.click(
      within(panel).getByRole('menuitem', { name: 'Send message' }),
    );
    await userEvent.click(
      within(panel).getByRole('combobox', { name: 'Send message template' }),
    );
    await userEvent.click(screen.getByRole('option', { name: /Weekly recap/ }));
    // Free servers send one template per action, so the rest are off.
    expect(
      screen.getByRole('option', { name: /Server rules/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      within(panel).getByRole('checkbox', { name: /DM user/ }),
    );
    expect(
      within(panel).getByRole('checkbox', { name: /Send as ephemeral/ }),
    ).toBeDisabled();

    // Switching to a link checks the link.
    await userEvent.click(
      within(panel).getByRole('radio', { name: 'Link button' }),
    );
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'URL' }),
      'nope',
    );
    expect(
      within(panel).getByText('Use a link that starts with https://.'),
    ).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));

    // A menu from the plus menu, with a second option and its actions.
    await userEvent.click(
      screen.getByRole('button', { name: 'Add to the message' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add menu' }));
    expect(screen.queryByRole('dialog', { name: 'Menu settings' })).toBeNull();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Edit menu' }).at(-1)!,
    );
    const menu = screen.getByRole('dialog', { name: 'Menu settings' });
    await userEvent.click(
      within(menu).getByRole('button', { name: 'Add option' }),
    );
    expect(
      within(menu).getByRole('textbox', { name: 'Option 2 title' }),
    ).toHaveValue('Option 2');
    await userEvent.click(
      within(menu).getByRole('button', { name: 'Actions for option 2' }),
    );
    expect(within(menu).getByText('Option 2 actions')).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: 'Return' }));
    await userEvent.click(within(menu).getByRole('button', { name: 'Close' }));
    expect(json()).toMatch(/"custom_id": "sp:m:/);

    // Rearranging from the keyboard, and removing with the trash.
    screen.getByRole('button', { name: /Move button Jam rules/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(json().indexOf('I’m in')).toBeLessThan(json().indexOf('Jam rules'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove menu' }));
    expect(json()).not.toMatch(/sp:m:/);
  }, 30_000);

  it('posts a test, reports the locked channel, and posts once it is fixed', async () => {
    await openEditor();
    expect(
      screen.getByText('Sparko can’t post in #announcements'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Post test' }));
    expect(
      await screen.findByText('Couldn’t apply', {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(
      await screen.findByText('Posted in #announcements', {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Versions/ }));
    expect(
      screen.getByText('Posted “Spring art jam announcement”'),
    ).toBeInTheDocument();
  });

  it('keeps templates and folders: add, clone, move, edit and delete', async () => {
    open(`${pixel}/studio?tab=items`);
    expect(
      await screen.findByText(/You have 5\/100/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();

    // Deleting asks first.
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Server rules' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Server rules')).toBeNull());

    // + Template saves what's in the editor.
    await userEvent.click(screen.getByRole('button', { name: 'New template' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }),
    );
    expect(
      await screen.findByText('Saved “Spring art jam announcement (x2)”'),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Clone Maintenance notice' }),
    );
    expect(
      await screen.findByText('Maintenance notice (copy)'),
    ).toBeInTheDocument();

    // Picking a card up with the keyboard and dropping it into a folder.
    const card = screen.getByRole('listitem', {
      name: 'Template Maintenance notice (copy)',
    });
    card.focus();
    await userEvent.keyboard(' ');
    const recaps = screen.getByRole('listitem', { name: 'Folder Recaps' });
    for (let i = 0; i < 6 && !recaps.className.includes('is-drop-into'); i++)
      await userEvent.keyboard('{ArrowUp}');
    expect(recaps).toHaveClass('is-drop-into');
    await userEvent.keyboard(' ');
    await waitFor(() =>
      expect(screen.queryByText('Maintenance notice (copy)')).toBeNull(),
    );
    expect(screen.getByText('Containing 2 templates.')).toBeInTheDocument();

    // A new folder.
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }));
    await userEvent.type(
      within(screen.getByRole('dialog')).getByRole('textbox', {
        name: 'Name',
      }),
      'Events',
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }),
    );
    expect(
      await screen.findByRole('listitem', { name: 'Folder Events' }),
    ).toBeInTheDocument();

    // Opening a folder, then editing a template from it.
    await userEvent.click(screen.getByText('Recaps'));
    expect(
      screen.getByRole('button', { name: 'All templates' }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Weekly recap' }),
    );
    expect(document.querySelector('.dc-embed__title')).toHaveTextContent(
      'This week in Pixel Plaza',
    );
    expect(screen.getByText(/You’re editing/)).toHaveTextContent(
      'Weekly recap',
    );

    // A folder with things in it asks twice before it goes.
    // Coming back to the tab starts at the top level again.
    await userEvent.click(screen.getByRole('tab', { name: /Templates/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Recaps' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Continue',
      }),
    );
    expect(
      within(screen.getByRole('dialog')).getByText('Are you sure?'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete everything',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', { name: 'Folder Recaps' }),
      ).toBeNull(),
    );
    // An empty folder only asks once.
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Events' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', { name: 'Folder Events' }),
      ).toBeNull(),
    );
  });
});

describe('Components V2 in the editor', () => {
  it('builds a container with text, a gallery and variables', async () => {
    await openEditor();
    const json = () =>
      (document.querySelector('.sp-code__text') as HTMLTextAreaElement).value;
    await userEvent.click(screen.getByRole('radio', { name: 'V2 components' }));

    // The text is edited where it's shown, a stretch between dividers at a
    // time; {separator} draws a line.
    await userEvent.click(
      screen.getAllByRole('button', { name: /^Edit text/ })[0]!,
    );
    const text = screen.getByRole('textbox', { name: /^text/ });
    await userEvent.clear(text);
    await userEvent.type(text, '## Summer Jam{{separator}See you there ');
    // A variable goes where the caret was.
    await userEvent.click(screen.getByRole('button', { name: 'Variables' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /\{user\}/ }));
    expect(document.querySelector('.dc-h2')).toHaveTextContent('Summer Jam');
    expect(document.querySelector('.dc-separator')).toBeInTheDocument();
    expect(document.querySelector('.dc-var')).toHaveTextContent('{user}');
    expect(json()).toMatch(/"type": 14/);

    // Pictures go in the gallery, which needs their links before posting.
    await userEvent.click(
      screen.getByRole('button', { name: 'Add an image to the gallery' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Add a link for image 1' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Image 1 URL' }),
      'https://img.example/a.png{Enter}',
    );
    expect(json()).toMatch(/"type": 12/);
    expect(json()).toMatch(/img\.example\/a\.png/);

    // The gallery can move above the text, and out of the container.
    const moveGallery = async (key: string) => {
      screen.getByRole('button', { name: /Move the gallery/ }).focus();
      await userEvent.keyboard(key);
    };
    // Up past each line of text, to the top of the container.
    for (let i = 0; i < 10; i++) {
      if (json().indexOf('"type": 12') < json().indexOf('Summer Jam')) break;
      await moveGallery('{ArrowUp}');
    }
    expect(json().indexOf('"type": 17')).toBeLessThan(
      json().indexOf('"type": 12'),
    );
    expect(json().indexOf('"type": 12')).toBeLessThan(
      json().indexOf('Summer Jam'),
    );
    await moveGallery('{ArrowUp}');
    expect(json().indexOf('"type": 12')).toBeLessThan(
      json().indexOf('"type": 17'),
    );
    // A button can sit beside a line of the text.
    screen.getByRole('button', { name: /Move button Jam rules/ }).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(json()).toMatch(/"accessory": \{\s+"type": 2/);
    expect(
      document.querySelector('.sp-v2-text__side .sp-comp'),
    ).toHaveTextContent('Jam rules');
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove image 1' }),
    );
    expect(json()).not.toMatch(/"type": 12/);
  }, 30_000);
});

describe('real sign-in', () => {
  const realFetch = globalThis.fetch;
  const backendWith = (session: unknown, servers: unknown = []) => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const body: Record<string, unknown> = {
        '/api/v1/health': { ok: true, signIn: true },
        '/api/v1/session': session,
        '/api/v1/servers': servers,
      };
      return new Response(JSON.stringify(body[String(url)] ?? {}), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    resetBackend();
  };
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetBackend();
  });

  it('sends signed-out people to sign in', async () => {
    backendWith({ user: null });
    const router = open('/dashboard');
    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'));
    expect(
      await screen.findByRole('button', { name: 'Continue with Discord' }),
    ).toBeEnabled();
  });

  it('lists the person’s real servers and their Discord avatar', async () => {
    backendWith(
      {
        user: {
          id: '111111111111111111',
          name: 'Quinn',
          avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png',
        },
      },
      [
        {
          id: '1234',
          name: 'Real Server',
          hue: 10,
          members: 42,
          plan: 'free',
          installed: true,
          icon: 'https://cdn.discordapp.com/icons/1234/x.png',
        },
        {
          id: '5678',
          name: 'Needs Sparko',
          hue: 20,
          members: 7,
          plan: 'free',
          installed: false,
        },
      ],
    );
    const router = open('/dashboard');
    expect(await screen.findByText('Signed in as Quinn')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Welcome, Tickets and Message Studio work in Discord now/,
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Add Sparko to Needs Sparko' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /Real Server/ }));
    expect(router.state.location.pathname).toBe('/dashboard/1234');
    // Module pages show sample settings for the real server.
    expect(
      await screen.findByRole('navigation', { name: 'Real Server dashboard' }),
    ).toBeInTheDocument();
  });
});
