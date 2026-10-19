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

const pixel = '/dashboard/900000000000000001/birthdays';
const cozy = '/dashboard/900000000000000002/birthdays';

beforeAll(async () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
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
const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

describe('Birthdays', () => {
  it('checks the settings before saving, then goes live', async () => {
    open(pixel);
    expect(
      await screen.findByText('When and where', {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    const cooldown = screen.getByRole('textbox', {
      name: 'Time between changes',
    });
    await userEvent.clear(cooldown);
    await userEvent.type(cooldown, '2y');
    expect(
      await screen.findByText('Has to be between 1d and 1y.'),
    ).toBeInTheDocument();
    await save();
    expect(
      await screen.findByText(/The time between changes has to be between/),
    ).toBeInTheDocument();
    await userEvent.clear(cooldown);
    await userEvent.type(cooldown, '2w');
    await userEvent.click(screen.getByRole('radio', { name: 'One post each' }));
    await save();
    expect(
      await screen.findByText(/Live in #general/, {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  }, 30_000);

  it('starts a message from a default template, one kind at a time', async () => {
    open(`${pixel}?tab=edit`);
    expect(
      await screen.findByText(
        'How should the birthday message look?',
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'This month' }));
    expect(
      screen.getByText('How should the this month message look?'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Use a default template' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Default templates' });
    // Only this month's presets are offered.
    expect(
      within(dialog).queryByRole('button', { name: /Birthday card/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Modern month/ }),
    );
    expect(await screen.findByText('Live preview')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'This month message' }),
    ).toBeInTheDocument();
    // The other messages are still Sparko's own.
    await userEvent.click(screen.getByRole('radio', { name: 'DM' }));
    expect(
      screen.getByText('How should the dm message look?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Birthday DMs are off, so this isn’t sent/),
    ).toBeInTheDocument();
    await save();
    expect(
      await screen.findByText(/Live in #general/, {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  }, 30_000);

  it('lists birthdays by month, adds one for a member and removes it', async () => {
    open(`${pixel}?tab=storage`);
    const february = await screen.findByRole(
      'region',
      { name: 'February' },
      { timeout: 8000 },
    );
    expect(february).toHaveTextContent(/quinn29 February/);
    expect(
      screen.getByRole('heading', { name: 'Upcoming' }),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search birthdays' }),
      'kit',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'February' }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.clear(
      screen.getByRole('textbox', { name: 'Search birthdays' }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Add a birthday' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Add a birthday' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Find a member' }),
      'oll',
    );
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /ollie/ }),
    );
    await userEvent.type(
      within(dialog).getByRole('spinbutton', { name: 'Day' }),
      '31',
    );
    await userEvent.click(within(dialog).getByText('Pick a month'));
    await userEvent.click(screen.getByRole('option', { name: 'April' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      within(dialog).getByText('April has 30 days. Pick a day from 1 to 30.'),
    ).toBeInTheDocument();
    const day = within(dialog).getByRole('spinbutton', { name: 'Day' });
    await userEvent.clear(day);
    await userEvent.type(day, '30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const april = await screen.findByRole('region', { name: 'April' });
    expect(april).toHaveTextContent(/ollie30 April/);

    await userEvent.click(
      within(april).getByRole('button', { name: 'Remove ollie’s birthday' }),
    );
    await userEvent.click(
      within(
        screen.getByRole('dialog', { name: /Remove ollie’s birthday/ }),
      ).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'April' }),
      ).not.toBeInTheDocument(),
    );
  }, 30_000);

  it('filters the log', async () => {
    open(`${pixel}?tab=logs`);
    expect(
      await screen.findByText(/\[ROLE GIVEN\]/, {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Problems' }));
    expect(screen.getByText(/\[FAILED\]/)).toBeInTheDocument();
    expect(screen.queryByText(/\[ROLE GIVEN\]/)).not.toBeInTheDocument();
  }, 30_000);

  it('renames commands and refuses names Discord won’t take', async () => {
    open(`${pixel}?tab=commands`);
    const names = await screen.findAllByRole(
      'textbox',
      { name: 'Name' },
      { timeout: 8000 },
    );
    expect(names).toHaveLength(6);
    await userEvent.clear(names[0]!);
    await userEvent.type(names[0]!, 'bday!');
    expect(
      screen.getByText('1 to 32 lowercase letters, numbers, - or _.'),
    ).toBeInTheDocument();
    await save();
    expect(
      await screen.findByText(/Command names are 1 to 32/),
    ).toBeInTheDocument();
  }, 30_000);

  it('shows a server that has it off, ready to switch on', async () => {
    open(cozy);
    expect(
      await screen.findByText(
        'Birthdays are off. Turn them on above to edit them.',
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch'));
    await save();
    expect(
      await screen.findByText(/Live in #general/, {
        selector: '.sp-pipeline__step',
      }),
    ).toBeInTheDocument();
  }, 30_000);
});
