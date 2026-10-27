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

const pixel = '/dashboard/900000000000000001/levels';
const cozy = '/dashboard/900000000000000002/levels';

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
  screen.findByText(/Levels & XP is live/, {
    selector: '.sp-pipeline__step',
  });

describe('Levels & XP', () => {
  it('has a tab for each part, and the old pages lead to theirs', async () => {
    const router = open('/dashboard/900000000000000001/reward-roles');
    const tabs = await screen.findByRole(
      'tablist',
      { name: 'Levels & XP' },
      { timeout: 8000 },
    );
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent?.replace(/\d+$/, '').trim()),
    ).toEqual([
      'Settings',
      'Level-up',
      'Reward roles',
      'XP crates',
      'Rank cards',
      'Leaderboard',
      'Logs',
      'Commands',
    ]);
    expect(
      within(tabs).getByRole('tab', { name: /Reward roles/ }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.search).toBe('?tab=rewards');
  }, 30_000);

  it('checks the XP rules before saving, then goes live', async () => {
    open(pixel);
    const earn = await screen.findByRole(
      'region',
      { name: 'Earning XP' },
      { timeout: 8000 },
    );
    const most = within(earn).getByRole('spinbutton', { name: 'Most XP' });
    await userEvent.clear(most);
    await userEvent.type(most, '5');
    await save();
    expect(
      await screen.findByText(
        /smallest XP per message can’t be more than the largest/,
      ),
    ).toBeInTheDocument();
    await userEvent.clear(most);
    await userEvent.type(most, '40');
    const formula = screen.getByRole('textbox', {
      name: 'XP to reach level x',
    });
    await userEvent.clear(formula);
    await userEvent.type(formula, '100 * (x');
    expect(
      screen.getByText('A bracket isn’t closed at the end.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Fix the equation to see each level’s XP.'),
    ).toBeInTheDocument();
    await userEvent.type(formula, ')');
    const chart = screen.getByRole('slider', { name: 'XP each level needs' });
    chart.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(chart).toHaveAttribute('aria-valuetext', 'Level 3 needs 300 XP');
    expect(screen.getByText('600 XP in all')).toBeInTheDocument();
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);

  it('adds reward roles up to the plan’s limit, and checks each one', async () => {
    open(`${pixel}?tab=rewards`);
    const rewards = await screen.findByRole(
      'region',
      { name: 'Reward roles' },
      { timeout: 8000 },
    );
    expect(
      within(rewards).getByTitle('3 of 5 reward roles used'),
    ).toBeVisible();
    await userEvent.click(
      within(rewards).getByRole('button', { name: /^Reward$/ }),
    );
    await save();
    expect(
      await screen.findByText('Pick a role for reward 4.'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(rewards).getByRole('button', { name: 'Remove reward 4' }),
    );
    const levels = within(rewards).getAllByRole('spinbutton', {
      name: 'Level',
    });
    await userEvent.clear(levels[1]!);
    await userEvent.type(levels[1]!, '5');
    await save();
    expect(
      await screen.findByText('Two rewards are at level 5. Change one.'),
    ).toBeInTheDocument();
  }, 30_000);

  it('turns on crates and starts the crate message from a default', async () => {
    open(`${pixel}?tab=crates`);
    expect(
      await screen.findByText(
        /Crates are off, so none drop/,
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('switch', { name: /XP crates on or off/ }),
    );
    expect(
      screen.getByText(/About 1 in 50 messages drops it/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Use a default template' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Default templates' });
    expect(
      within(dialog).queryByRole('button', { name: /Rank card/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Crate drop/ }),
    );
    expect(await screen.findByText('Live preview')).toBeInTheDocument();
    expect(screen.getByLabelText('Crate button')).toHaveTextContent('Open');
    // Each crate has its own claim message too.
    const crate = screen.getByRole('listitem', { name: 'XP crate' });
    await userEvent.click(
      within(crate).getByRole('button', { name: /Claim message/ }),
    );
    expect(
      await screen.findByText(
        'How should the claim message for XP crate look?',
      ),
    ).toBeInTheDocument();
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);

  it('adds crates as cards, up to the plan’s limit', async () => {
    open(`${pixel}?tab=crates`);
    const add = await screen.findByRole(
      'button',
      { name: 'Crate' },
      { timeout: 8000 },
    );
    await userEvent.click(
      screen.getByRole('switch', { name: /XP crates on or off/ }),
    );
    await userEvent.click(add);
    const card = screen.getByRole('listitem', { name: 'Crate 2' });
    await userEvent.clear(within(card).getByLabelText('Crate name'));
    await userEvent.type(
      within(card).getByLabelText('Crate name'),
      'Golden crate',
    );
    await userEvent.clear(within(card).getByLabelText('Claim amount'));
    await userEvent.type(within(card).getByLabelText('Claim amount'), '3');
    expect(
      screen.getByRole('listitem', { name: 'Golden crate' }),
    ).toHaveTextContent(/Up to 3 members claim/);
    expect(screen.getByRole('button', { name: 'Crate' })).toBeDisabled();
  }, 30_000);

  it('shows the leaderboard, a member, and changes their XP', async () => {
    open(`${pixel}?tab=leaderboard`);
    const board = await screen.findByRole(
      'table',
      { name: 'Leaderboard' },
      { timeout: 8000 },
    );
    const rows = within(board).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(/1rhea.*48,210$/);
    await userEvent.click(
      within(rows[1]!).getByRole('button', { name: /rhea/ }),
    );
    const member = await screen.findByRole('region', { name: 'rhea' });
    expect(
      within(member).getByRole('list', { name: 'Reward roles earned' }),
    ).toHaveTextContent('@Veteran');
    await userEvent.click(
      within(member).getByRole('button', { name: 'Change XP' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Change rhea’s XP' });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Set to' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      within(dialog).getByText(/Write a whole number of XP from 0/),
    ).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByRole('spinbutton', { name: 'XP' }),
      '100',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        within(member).getByText('XP', { selector: 'dt' }).nextSibling,
      ).toHaveTextContent('100'),
    );
    expect(within(member).getByText('Level 1')).toBeInTheDocument();
  }, 30_000);

  it('finds members with no XP yet, and resets everyone', async () => {
    open(`${pixel}?tab=leaderboard`);
    await screen.findByRole(
      'table',
      { name: 'Leaderboard' },
      { timeout: 8000 },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Change XP' }));
    const dialog = screen.getByRole('dialog', { name: 'Change a member’s XP' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Find a member' }),
      'drift',
    );
    await userEvent.click(
      await within(dialog).findByRole(
        'button',
        { name: /driftwood/ },
        { timeout: 4000 },
      ),
    );
    await userEvent.type(
      within(dialog).getByRole('spinbutton', { name: 'XP' }),
      '250',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('They’re level 1 with 250 XP now.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    await userEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Reset everyone’s XP?' }),
      ).getByRole('button', { name: 'Reset' }),
    );
    expect(await screen.findByText('Nobody here yet')).toBeInTheDocument();
  }, 30_000);

  it('lists recent crates and who claimed them', async () => {
    open(`${cozy}?tab=crates`);
    const recent = await screen.findByRole(
      'region',
      { name: 'Recent crates' },
      { timeout: 8000 },
    );
    expect(
      await within(recent).findByText('XP crate: mossy_bun got 118 XP'),
    ).toBeInTheDocument();
    expect(
      within(recent).getByText(/^Golden crate: .* and 1 more got 947 XP$/),
    ).toBeInTheDocument();
    expect(
      within(recent).getByText('XP crate: nobody claimed it'),
    ).toBeInTheDocument();
    expect(
      within(recent).getByText('XP given', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('1,479');
  }, 30_000);

  it('filters the log', async () => {
    open(`${pixel}?tab=logs`);
    expect(
      await screen.findAllByText(/\[LEVEL UP\]/, {}, { timeout: 8000 }),
    ).not.toHaveLength(0);
    await userEvent.click(screen.getByRole('radio', { name: 'Problems' }));
    expect(screen.getByText(/\[FAILED\]/)).toBeInTheDocument();
    expect(screen.queryByText(/\[LEVEL UP\]/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Staff' }));
    expect(screen.getByText(/\[XP CHANGED\]/)).toBeInTheDocument();
  }, 30_000);

  it('renames commands and refuses names Discord won’t take', async () => {
    open(`${pixel}?tab=commands`);
    const names = await screen.findAllByRole(
      'textbox',
      { name: 'Name' },
      { timeout: 8000 },
    );
    expect(names).toHaveLength(3);
    await userEvent.clear(names[0]!);
    await userEvent.type(names[0]!, 'my level');
    expect(names[0]).toHaveValue('my-level');
    await userEvent.clear(names[1]!);
    await userEvent.type(names[1]!, 'top!');
    await save();
    expect(
      await screen.findByText(/Command names are 1 to 32/),
    ).toBeInTheDocument();
  }, 30_000);

  it('turns it off, and says how to turn it back on', async () => {
    open(pixel);
    await screen.findByRole(
      'region',
      { name: 'Earning XP' },
      { timeout: 8000 },
    );
    await userEvent.click(screen.getAllByRole('switch')[0]!);
    expect(
      screen.getByText('Levels & XP is off. Turn it on above to edit it.'),
    ).toBeInTheDocument();
    await save();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument(),
    );
  }, 30_000);
});
