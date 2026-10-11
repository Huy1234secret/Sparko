// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModerationPage } from './ModerationPage';
import { getChannels, getConfig } from '../../services/guilds';
import { addCaseNote, createCase, getCases } from '../../services/safety';

vi.mock('../../services/guilds', () => ({
  getChannels: vi.fn(),
  getConfig: vi.fn(),
  getRoles: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../../services/safety', () => ({
  addCaseNote: vi.fn(),
  createCase: vi.fn(),
  getCases: vi.fn(),
}));
const guildId = '123456789012345678';
const channel = '123456789012345671';
const member = '123456789012345699';
function renderPage(tab = 'cases') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/:guildId/safety/moderation',
        element: <ModerationPage />,
      },
    ],
    { initialEntries: [`/dashboard/${guildId}/safety/moderation?tab=${tab}`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getChannels).mockResolvedValue([
    { id: channel, name: 'general', type: 0 },
  ]);
  vi.mocked(getConfig).mockResolvedValue({
    featureId: 'R26',
    revision: 1,
    appliedRevision: 1,
    config: { enabled: true },
    missingPrerequisites: [],
  });
  vi.mocked(getCases).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('moderation', () => {
  it('requires confirmation for a ban and sends an optional duration in seconds', async () => {
    const user = userEvent.setup();
    vi.mocked(createCase).mockResolvedValue({ data: {} });
    renderPage('new');
    await user.selectOptions(await screen.findByLabelText('Action'), 'ban');
    await user.type(screen.getByLabelText('Member ID'), member);
    await user.type(screen.getByLabelText('Duration (optional)'), '2');
    await user.selectOptions(screen.getByLabelText('Unit'), 'days');
    await user.type(screen.getByLabelText('Reason'), 'Repeated raids');
    await user.click(screen.getByRole('button', { name: 'Record ban' }));
    expect(
      await screen.findByText('Confirm this consequential action'),
    ).toBeVisible();
    expect(createCase).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('checkbox', { name: /takes effect in Discord/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Record ban' }));
    await waitFor(() =>
      expect(createCase).toHaveBeenCalledWith(
        guildId,
        {
          action: 'ban',
          reason: 'Repeated raids',
          confirm: true,
          targetId: member,
          durationSeconds: 172800,
        },
        expect.any(String),
      ),
    );
  });
  it('puts the missing channel error on the channel field for a lock', async () => {
    const user = userEvent.setup();
    renderPage('new');
    await user.selectOptions(await screen.findByLabelText('Action'), 'lock');
    await user.type(screen.getByLabelText('Reason'), 'Cool down');
    await user.click(screen.getByRole('checkbox', { name: /takes effect/ }));
    await user.click(
      screen.getByRole('button', { name: 'Record lock channel' }),
    );
    expect(
      await screen.findByText('This action needs a channel'),
    ).toBeVisible();
    expect(screen.getByLabelText('Channel')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
  it('shows what Discord actually did and adds a note against the current revision', async () => {
    const user = userEvent.setup();
    vi.mocked(getCases).mockResolvedValue([
      {
        id: 'c1',
        key: '7',
        ownerId: member,
        state: 'pending',
        revision: 2,
        createdAt: '2026-10-11T10:00:00Z',
        deliveryStatus: 'blocked',
        deliveryError:
          'Move the bot and moderator roles above the target’s roles.',
        data: {
          number: 7,
          action: 'timeout',
          targetId: member,
          reason: 'Spam',
          durationSeconds: 600,
          actorId: '1',
          requestedAt: '2026-10-11T10:00:00Z',
          notes: [],
        },
      },
    ]);
    vi.mocked(addCaseNote).mockResolvedValue({ data: {} });
    renderPage();
    await user.click(await screen.findByRole('button', { name: /#7 Timeout/ }));
    expect(
      screen.getByText(
        'Move the bot and moderator roles above the target’s roles.',
      ),
    ).toBeVisible();
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    await user.type(
      screen.getByLabelText('Add a note'),
      'Asked to rejoin later',
    );
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() =>
      expect(addCaseNote).toHaveBeenCalledWith(
        guildId,
        'c1',
        { text: 'Asked to rejoin later', expectedRevision: 2 },
        expect.any(String),
      ),
    );
  });
});
