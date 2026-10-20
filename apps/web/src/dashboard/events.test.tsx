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
import { attendeesCsv } from './modules/EVEvents';

const pixel = '/dashboard/900000000000000001/events';
const cozy = '/dashboard/900000000000000002/events';

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
  screen.findByText(/Live in #general/, { selector: '.sp-pipeline__step' });

describe('Events & RSVP', () => {
  it('checks the settings before saving, then goes live', async () => {
    open(pixel);
    expect(
      await screen.findByText('Where and who', {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    // Free servers have up to 2 reminders.
    const add = screen.getByRole('textbox', {
      name: 'Add a reminder to default reminders',
    });
    await userEvent.type(add, 'soon{Enter}');
    expect(
      screen.getByText('Write it with m, h, d or w, like 1h or 10m.'),
    ).toBeInTheDocument();
    await userEvent.clear(add);
    await userEvent.type(add, '1d{Enter}');
    expect(screen.getByText('1d before')).toBeInTheDocument();
    expect(add).toBeDisabled();
    const size = screen.getByRole('spinbutton', {
      name: 'Names in the attendee list',
    });
    await userEvent.clear(size);
    await userEvent.type(size, '0');
    await save();
    expect(
      await screen.findByText('Show from 1 to 50 names in the attendee list.'),
    ).toBeInTheDocument();
    await userEvent.clear(size);
    await userEvent.type(size, '5');
    await userEvent.click(
      screen.getByRole('switch', { name: /Add events to Discord’s events/ }),
    );
    // Pixel Plaza's Sparko can't manage events, so it says how to fix it.
    expect(screen.getByText(/needs the/)).toHaveTextContent('Manage Events');
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);

  it('schedules an event, checking it first', async () => {
    open(`${pixel}?tab=events`);
    const list = await screen.findByRole(
      'list',
      { name: 'Upcoming events' },
      { timeout: 8000 },
    );
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(list).toHaveTextContent('Movie night: Spirited Away');
    await userEvent.click(
      screen.getByRole('button', { name: 'Schedule an event' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Schedule an event' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Schedule it' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Give the event a title.',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Title' }),
      'Karaoke night',
    );
    // An end before the start isn't taken.
    const starts = screen.getByLabelText('Starts') as HTMLInputElement;
    const ends = screen.getByLabelText('Ends');
    fireEvent.change(ends, { target: { value: starts.value } });
    await userEvent.click(screen.getByRole('button', { name: 'Schedule it' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      /between 5 minutes and 14 days/,
    );
    fireEvent.change(starts, { target: { value: starts.value } });
    fireEvent.change(ends, {
      target: { value: starts.value.replace(/T\d\d/, 'T23') },
    });
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Capacity' }),
      '{backspace}12',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Schedule it' }));
    expect(
      await screen.findByText(/Scheduled #7 Karaoke night/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('list', { name: 'Upcoming events' }),
      ).toHaveTextContent('Karaoke night'),
    );
    // Five upcoming is the free plan's limit.
    expect(
      screen.getByRole('button', { name: 'Schedule an event' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Your plan has up to 5 upcoming events/),
    ).toBeInTheDocument();
  }, 30_000);

  it('shows who’s coming, marks no-shows and cancels', async () => {
    open(`${pixel}?tab=events`);
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Who’s coming to Movie night: Spirited Away' },
        { timeout: 8000 },
      ),
    );
    const dialog = screen.getByRole('dialog', {
      name: /Who’s coming to #2 Movie night/,
    });
    expect(within(dialog).getByRole('list', { name: 'Going' })).toBeVisible();
    const quinn = within(dialog).getByText('quinn').closest('li')!;
    await userEvent.click(
      within(quinn).getByRole('checkbox', { name: 'No-show' }),
    );
    await waitFor(() =>
      expect(
        within(quinn).getByText('No-show', { selector: '.sp-badge' }),
      ).toBeInTheDocument(),
    );
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Waitlist (2)' }),
    );
    expect(
      within(dialog).getByRole('list', { name: 'Waitlist' }),
    ).toHaveTextContent(/bramble.*finn/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel Movie night: Spirited Away' }),
    );
    await userEvent.click(
      within(
        screen.getByRole('dialog', { name: /Cancel Movie night/ }),
      ).getByRole('button', { name: 'Cancel event' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('list', { name: 'Upcoming events' }),
      ).not.toHaveTextContent('Movie night'),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Past/ }));
    const past = await screen.findByRole('list', { name: 'Past events' });
    expect(past).toHaveTextContent(/Movie night: Spirited AwayCancelled/);
  }, 30_000);

  it('exports attendees as CSV', () => {
    expect(
      attendeesCsv([
        {
          userId: '1',
          name: 'rhea, the great',
          avatar: '',
          answer: 'going',
          at: Date.UTC(2026, 9, 20),
          noShow: true,
        },
      ]),
    ).toBe(
      'Name,User ID,Answer,Answered at,No-show\n"rhea, the great",1,Going,2026-10-20T00:00:00.000Z,yes',
    );
  });

  it('starts a reminder DM from a default template', async () => {
    open(`${pixel}?tab=edit`);
    expect(
      await screen.findByText(
        'How should the event look?',
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Reminder DM' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Use a default template' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Default templates' });
    expect(
      within(dialog).queryByRole('button', { name: /Event card/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Modern reminder/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Reminder DM message' }),
    ).toBeInTheDocument();
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);

  it('filters the log', async () => {
    open(`${pixel}?tab=logs`);
    expect(
      await screen.findByText(/\[STARTED\]/, {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Problems' }));
    expect(screen.getByText(/\[FAILED\]/)).toBeInTheDocument();
    expect(screen.queryByText(/\[STARTED\]/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Answers' }));
    expect(screen.getByText(/\[PROMOTED\]/)).toBeInTheDocument();
  }, 30_000);

  it('renames commands and refuses names Discord won’t take', async () => {
    open(`${pixel}?tab=commands`);
    const names = await screen.findAllByRole(
      'textbox',
      { name: 'Name' },
      { timeout: 8000 },
    );
    expect(names).toHaveLength(7);
    await userEvent.clear(names[0]!);
    await userEvent.type(names[0]!, 'Event!');
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
        'Events are off. Turn them on above to edit them.',
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('switch')[0]!);
    await save();
    expect(await live()).toBeInTheDocument();
  }, 30_000);
});
