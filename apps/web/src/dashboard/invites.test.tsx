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

const pixel = '/dashboard/900000000000000001/invites';
const cozy = '/dashboard/900000000000000002/invites';

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
const live = () =>
  screen.findByText(/Invite tracking is live/, {
    selector: '.sp-pipeline__step',
  });

describe('Invite tracking', () => {
  it('checks the settings before saving, then goes live', async () => {
    open(pixel);
    const age = await screen.findByRole(
      'textbox',
      { name: 'Fake account age' },
      { timeout: 8000 },
    );
    await userEvent.clear(age);
    await userEvent.type(age, '2y');
    expect(
      await screen.findByText('Has to be between 1h and 1y.'),
    ).toBeInTheDocument();
    await save();
    expect(
      await screen.findByText(/The fake account age has to be between/),
    ).toBeInTheDocument();
    await userEvent.clear(age);
    await userEvent.type(age, '3d');
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Count members who rejoin/ }),
    );
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);

  it('adds reward roles up to the plan’s limit, and checks each one', async () => {
    open(pixel);
    const rewards = await screen.findByRole(
      'region',
      { name: 'Reward roles' },
      { timeout: 8000 },
    );
    expect(
      within(rewards).getByTitle('2 of 3 reward roles used'),
    ).toBeVisible();
    await userEvent.click(
      within(rewards).getByRole('button', { name: /Reward/ }),
    );
    expect(
      within(rewards).getByTitle('3 of 3 reward roles used'),
    ).toBeVisible();
    expect(
      within(rewards).getByRole('button', { name: /^Reward$/ }),
    ).toBeDisabled();
    await save();
    expect(
      await screen.findByText('Pick a role for reward 3.'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(rewards).getByRole('button', { name: 'Remove reward 3' }),
    );
    const counts = within(rewards).getAllByRole('spinbutton', {
      name: 'Invites',
    });
    await userEvent.clear(counts[1]!);
    await userEvent.type(counts[1]!, '3');
    await save();
    expect(
      await screen.findByText('Two rewards are at 3 invites. Change one.'),
    ).toBeInTheDocument();
  }, 30_000);

  it('turns off the join message, then needs a channel to turn it back on', async () => {
    open(pixel);
    const messages = await screen.findByRole(
      'region',
      { name: 'Join and leave messages' },
      { timeout: 8000 },
    );
    expect(within(messages).getAllByRole('switch')[1]).not.toBeChecked();
    await userEvent.click(within(messages).getAllByRole('switch')[1]!);
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);

  it('starts a message from a default template, one kind at a time', async () => {
    open(`${pixel}?tab=edit`);
    expect(
      await screen.findByText(
        'How should the join message look?',
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Leave' }));
    expect(
      screen.getByText(/The leave message is off, so this isn’t sent/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Use a default template' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Default templates' });
    expect(
      within(dialog).queryByRole('button', { name: /Join card/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Leave card/ }),
    );
    expect(await screen.findByText('Live preview')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Leave message' }),
    ).toBeInTheDocument();
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);

  it('shows the leaderboard, a member, and gives a bonus', async () => {
    open(`${pixel}?tab=storage`);
    const board = await screen.findByRole(
      'table',
      { name: 'Leaderboard' },
      { timeout: 8000 },
    );
    const rows = within(board).getAllByRole('row');
    // A header, then rhea first with 4.
    expect(rows[1]).toHaveTextContent(/1rhea.*4$/);
    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: /rhea/ }),
    );
    const member = await screen.findByRole('region', { name: 'rhea' });
    expect(
      within(member).getByRole('list', { name: 'Members they invited' }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(member).getByRole('button', { name: 'Bonus' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Bonus invites for rhea',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      within(dialog).getByText(/Write a whole number of invites/),
    ).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByRole('spinbutton', { name: 'Bonus invites' }),
      '5',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        within(member).getByText('Bonus', { selector: 'dt' }).nextSibling,
      ).toHaveTextContent('5'),
    );
    expect(
      within(member).getByText('Total', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('9');
  }, 30_000);

  it('finds members who only joined, and resets everyone', async () => {
    open(`${pixel}?tab=storage`);
    await screen.findByRole(
      'table',
      { name: 'Leaderboard' },
      { timeout: 8000 },
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search members' }),
      'driftwood',
    );
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /driftwood/ },
        { timeout: 4000 },
      ),
    );
    const member = await screen.findByRole('region', { name: 'driftwood' });
    expect(within(member).getByText(/Unknown invite/)).toBeInTheDocument();
    await userEvent.clear(
      screen.getByRole('textbox', { name: 'Search members' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    await userEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Reset everyone’s invites?' }),
      ).getByRole('button', { name: 'Reset' }),
    );
    expect(await screen.findByText('Nobody here yet')).toBeInTheDocument();
  }, 30_000);

  it('lists the invite codes', async () => {
    open(`${cozy}?tab=storage`);
    const codes = await screen.findByRole(
      'region',
      { name: 'Invite codes' },
      { timeout: 8000 },
    );
    expect(await within(codes).findByText('rhea-pp')).toBeInTheDocument();
    expect(within(codes).getByText(/Vanity link cozy/)).toBeInTheDocument();
  }, 30_000);

  it('filters the log', async () => {
    open(`${pixel}?tab=logs`);
    expect(
      await screen.findByText(/\[REWARD GIVEN\]/, {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Problems' }));
    expect(screen.getByText(/\[FAILED\]/)).toBeInTheDocument();
    expect(screen.queryByText(/\[REWARD GIVEN\]/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Staff' }));
    expect(screen.getByText(/\[BONUS\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[RESET\]/)).toBeInTheDocument();
  }, 30_000);

  it('renames commands and refuses names Discord won’t take', async () => {
    open(`${pixel}?tab=commands`);
    const names = await screen.findAllByRole(
      'textbox',
      { name: 'Name' },
      { timeout: 8000 },
    );
    expect(names).toHaveLength(7);
    await userEvent.clear(names[1]!);
    await userEvent.type(names[1]!, 'see invites');
    expect(names[1]).toHaveValue('see-invites');
    await userEvent.clear(names[0]!);
    await userEvent.type(names[0]!, 'inv!');
    await save();
    expect(
      await screen.findByText(/Command names are 1 to 32/),
    ).toBeInTheDocument();
  }, 30_000);

  it('shows a server that has it off, ready to switch on', async () => {
    open(cozy);
    expect(
      await screen.findByText(
        'Invite tracking is off. Turn it on above to edit it.',
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('switch')[0]!);
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);
});
