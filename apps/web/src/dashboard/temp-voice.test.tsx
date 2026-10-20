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

const pixel = '/dashboard/900000000000000001/temp-voice';
const cozy = '/dashboard/900000000000000002/temp-voice';

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
const live = (text: RegExp) =>
  screen.findByText(text, { selector: '.sp-pipeline__step' });

describe('Temporary voice', () => {
  it('checks the hubs before saving, then goes live', async () => {
    open(pixel);
    const hub = await screen.findByRole(
      'listitem',
      { name: 'Hub 1' },
      { timeout: 8000 },
    );
    // Free holds one hub.
    expect(screen.getByRole('button', { name: /^Hub$/ })).toBeDisabled();
    expect(screen.getByText(/Plus has up to 10 hubs/)).toBeInTheDocument();
    const name = within(hub).getByRole('textbox', { name: 'Room name' });
    await userEvent.clear(name);
    expect(within(hub).getByText('Give rooms a name.')).toBeInTheDocument();
    await save();
    expect(
      await screen.findByText(
        'Give the hub’s rooms a name of up to 100 characters.',
      ),
    ).toBeInTheDocument();
    await userEvent.type(name, 'Room {{count}');
    await userEvent.click(
      within(hub).getByRole('checkbox', { name: /Start hidden/ }),
    );
    await save();
    expect(await live(/Live with 1 hub/)).toBeInTheDocument();
  }, 30_000);

  it('removes and adds hubs, and picks the panel’s buttons', async () => {
    open(pixel);
    await screen.findByRole('listitem', { name: 'Hub 1' }, { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: 'Remove hub 1' }));
    expect(screen.getByText(/No hubs yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Hub$/ }));
    expect(screen.getByRole('listitem', { name: 'Hub 1' })).toBeInTheDocument();
    await save();
    // A new hub needs its voice channel first.
    expect(
      await screen.findByText(
        'Pick the voice channel members join to get a room.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('16 buttons · 4 rows of 5')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Region/ }));
    expect(screen.getByText('17 buttons · 4 rows of 5')).toBeInTheDocument();
  }, 30_000);

  it('posts the panel, but only once changes are saved', async () => {
    open(pixel);
    const post = await screen.findByRole(
      'button',
      { name: 'Post again' },
      { timeout: 8000 },
    );
    expect(screen.getByText(/Posted in #general/)).toBeInTheDocument();
    await userEvent.click(post);
    expect(await screen.findByText('Panel posted')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Show button names/ }),
    );
    expect(screen.getByRole('button', { name: 'Post again' })).toBeDisabled();
    expect(screen.getByText(/Save first/)).toBeInTheDocument();
  }, 30_000);

  it('starts the panel from a default template, with its buttons under it', async () => {
    open(`${pixel}?tab=edit`);
    expect(
      await screen.findByText(
        'How should the control panel look?',
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Use a default template' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Default templates' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Modern panel/ }),
    );
    expect(await screen.findByText('Live preview')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Control panel' }),
    ).toBeInTheDocument();
    const buttons = screen.getByLabelText('Panel buttons');
    expect(within(buttons).getByText('Create room')).toBeInTheDocument();
    expect(within(buttons).getByText('Delete')).toBeInTheDocument();
    expect(within(buttons).queryByText('Region')).not.toBeInTheDocument();
    await save();
    expect(await live(/Live with 1 hub/)).toBeInTheDocument();
  }, 30_000);

  it('lists open rooms and closes one, and resets saved settings', async () => {
    open(`${pixel}?tab=storage`);
    const rooms = await screen.findByRole(
      'list',
      { name: 'Open rooms' },
      { timeout: 8000 },
    );
    expect(within(rooms).getAllByRole('listitem')).toHaveLength(3);
    expect(within(rooms).getByText('Waiting for someone')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Close Movie night 🍿' }),
    );
    await userEvent.click(
      within(
        screen.getByRole('dialog', { name: /Close “Movie night/ }),
      ).getByRole('button', { name: 'Close room' }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Open rooms' })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(2),
    );

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search saved settings' }),
      'jazz',
    );
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('list', { name: 'Saved settings' }),
        ).getAllByRole('listitem'),
      ).toHaveLength(1),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Reset marlowe’s settings' }),
    );
    await userEvent.click(
      within(
        screen.getByRole('dialog', { name: /Reset marlowe’s settings/ }),
      ).getByRole('button', { name: 'Reset' }),
    );
    expect(await screen.findByText('Nothing saved')).toBeInTheDocument();
  }, 30_000);

  it('filters the log', async () => {
    open(`${pixel}?tab=logs`);
    expect(
      await screen.findByText(/\[LOCKED\]/, {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Rooms' }));
    expect(screen.queryByText(/\[LOCKED\]/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\[CREATED\]/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('radio', { name: 'Problems' }));
    expect(screen.getByText(/\[FAILED\]/)).toBeInTheDocument();
    expect(screen.queryByText(/\[CREATED\]/)).not.toBeInTheDocument();
  }, 30_000);

  it('renames commands and refuses names Discord won’t take', async () => {
    open(`${pixel}?tab=commands`);
    const names = await screen.findAllByRole(
      'textbox',
      { name: 'Name' },
      { timeout: 8000 },
    );
    expect(names).toHaveLength(19);
    await userEvent.clear(names[2]!);
    await userEvent.type(names[2]!, 'close');
    await userEvent.clear(names[4]!);
    await userEvent.type(names[4]!, 'close');
    await save();
    expect(
      await screen.findByText('Two commands are called /voice close.'),
    ).toBeInTheDocument();
  }, 30_000);

  it('shows a server that has it off, ready to switch on', async () => {
    open(cozy);
    expect(
      await screen.findByText(
        /Temporary voice is off\. Turn it on above to edit it\./,
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    // Plus servers have more hubs.
    expect(screen.getByText('4/10')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch'));
    await save();
    expect(await live(/Live with 4 hubs/)).toBeInTheDocument();
  }, 30_000);
});
