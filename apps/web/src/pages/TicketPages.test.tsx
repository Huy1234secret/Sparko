// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketConfigPage } from './TicketPages';
import {
  getChannels,
  getConfig,
  getRoles,
  saveConfig,
} from '../services/guilds';
import { getPublications, publishMessage } from '../services/messages';
import { ApiError } from '../services/http';

vi.mock('../services/guilds', () => ({
  getChannels: vi.fn(),
  getConfig: vi.fn(),
  getRoles: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../services/messages', () => ({
  getPublications: vi.fn(),
  publishMessage: vi.fn(),
}));
const saved = {
  missingPrerequisites: [],
  featureId: 'tickets',
  revision: 3,
  appliedRevision: 2,
  config: {
    enabled: true,
    timezone: 'Asia/Ho_Chi_Minh',
    categoryChannelId: '123456789012345678',
    staffRoleIds: [],
    maxOpenPerMember: 1,
    requireTranscriptBeforeCleanup: true,
    categories: [
      { id: 'general', name: 'General support', description: '', fields: [] },
    ],
  },
};
function renderConfig() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/:guildId/support/tickets/config',
        element: <TicketConfigPage />,
      },
    ],
    {
      initialEntries: ['/dashboard/123456789012345679/support/tickets/config'],
    },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getConfig).mockResolvedValue(structuredClone(saved));
  vi.mocked(getChannels).mockResolvedValue([
    { id: '123456789012345678', name: 'Support', type: 4 },
    { id: '123456789012345670', name: 'support-panel', type: 0 },
  ]);
  vi.mocked(getRoles).mockResolvedValue([]);
  vi.mocked(getPublications).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('ticket configuration and publication', () => {
  it('distinguishes saved settings from applied runtime and blocks publishing a dirty form', async () => {
    const user = userEvent.setup();
    renderConfig();
    expect(await screen.findByText('Waiting for the bot')).toBeVisible();
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText('Publish destination'),
      '123456789012345670',
    );
    expect(
      screen.getByRole('button', { name: 'Publish ticket panel' }),
    ).toBeEnabled();
    await user.clear(screen.getByLabelText('Open tickets per member'));
    await user.type(screen.getByLabelText('Open tickets per member'), '2');
    expect(save).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Publish ticket panel' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Save your settings before publishing.'),
    ).toBeVisible();
  });
  it('retains local changes when another editor saved a newer revision', async () => {
    const user = userEvent.setup();
    vi.mocked(saveConfig).mockRejectedValue(
      new ApiError(
        'Settings changed.',
        'REVISION_CONFLICT',
        409,
        'request-conflict',
        4,
      ),
    );
    renderConfig();
    const input = await screen.findByLabelText('Open tickets per member');
    await user.clear(input);
    await user.type(input, '2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(
        'Someone saved these settings while you were editing.',
      ),
    ).toBeVisible();
    expect(input).toHaveValue(2);
    expect(screen.getByText(/saved version is now 4/)).toBeVisible();
    // Keeping the draft loads the newer revision and saves over it next time.
    vi.mocked(getConfig).mockResolvedValue({
      ...structuredClone(saved),
      revision: 4,
      appliedRevision: 4,
    });
    vi.mocked(saveConfig).mockClear();
    vi.mocked(saveConfig).mockRejectedValue(new Error('stop'));
    await user.click(screen.getByRole('button', { name: 'Keep my changes' }));
    expect(
      await screen.findByText(/replaces version 4 with your changes/),
    ).toBeVisible();
    expect(input).toHaveValue(2);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(vi.mocked(saveConfig).mock.calls[0]?.[2]).toMatchObject({
      expectedRevision: 4,
    });
  });
  it('reports committed pending delivery without inventing a Discord publication', async () => {
    const user = userEvent.setup();
    vi.mocked(publishMessage).mockResolvedValue({
      data: {
        id: 'publication-test',
        channelId: '123456789012345670',
        state: 'pending',
        status: 'pending',
        deliveryStatus: 'pending',
        revision: 1,
        appliedRevision: 0,
        test: false,
        createdAt: '2026-10-11T00:00:00Z',
      },
      operation: {
        id: 'op-test',
        businessStatus: 'committed',
        deliveryStatus: 'pending',
      },
    });
    renderConfig();
    await screen.findByText('Waiting for the bot');
    await user.selectOptions(
      screen.getByLabelText('Publish destination'),
      '123456789012345670',
    );
    await user.click(
      screen.getByRole('button', { name: 'Publish ticket panel' }),
    );
    expect(
      await screen.findByText(
        'Publication saved. Waiting for Discord delivery.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Your panel is published.'),
    ).not.toBeInTheDocument();
  });
  it('preserves a mutation identity when the same save is retried after a network timeout', async () => {
    const user = userEvent.setup();
    vi.mocked(saveConfig).mockRejectedValue(
      new ApiError('Unable to reach Sparko.', 'ECONNABORTED', 0),
    );
    renderConfig();
    const input = await screen.findByLabelText('Open tickets per member');
    await user.clear(input);
    await user.type(input, '2');
    const button = screen.getByRole('button', { name: 'Save changes' });
    await user.click(button);
    await screen.findByText('Unable to reach Sparko.');
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveConfig).mock.calls[0]?.[3]).toBe(
      vi.mocked(saveConfig).mock.calls[1]?.[3],
    );
  });
  it('shows server field errors beside their controls and summarises unknown paths', async () => {
    const user = userEvent.setup();
    vi.mocked(saveConfig).mockRejectedValue(
      new ApiError(
        'A selected channel or role is unavailable.',
        'INVALID_INPUT',
        400,
        'request-invalid',
        undefined,
        {
          fieldErrors: [
            {
              path: 'categoryChannelId',
              message: 'Choose a Discord category the bot can see.',
            },
            { path: 'categories.0.name', message: 'Name is reserved.' },
            { path: 'retiredSetting', message: 'No longer supported.' },
          ],
          retryable: false,
        },
      ),
    );
    renderConfig();
    const input = await screen.findByLabelText('Open tickets per member');
    await user.clear(input);
    await user.type(input, '2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const category = screen.getByLabelText('Ticket category');
    expect(
      await screen.findByText('Choose a Discord category the bot can see.'),
    ).toBeVisible();
    expect(category).toHaveAttribute('aria-invalid', 'true');
    expect(category).toHaveFocus();
    expect(screen.getByLabelText('Topic name')).toHaveAccessibleDescription(
      'Name is reserved.',
    );
    expect(
      screen.getByText('retiredSetting: No longer supported.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
    expect(input).toHaveValue(2);
  });
  it('offers a retry for transient failures that repeats the same request key', async () => {
    const user = userEvent.setup();
    vi.mocked(saveConfig)
      .mockRejectedValueOnce(
        new ApiError(
          'The service is unavailable. Retry with the same request key.',
          'SERVICE_UNAVAILABLE',
          503,
          'request-503',
          undefined,
          { retryable: true },
        ),
      )
      .mockResolvedValueOnce({
        data: {
          ...structuredClone(saved),
          revision: 4,
          config: {
            ...saved.config,
            maxOpenPerMember: 2,
          },
        },
      });
    renderConfig();
    const input = await screen.findByLabelText('Open tickets per member');
    await user.clear(input);
    await user.type(input, '2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Reference: request-503')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveConfig).mock.calls[0]?.[3]).toBe(
      vi.mocked(saveConfig).mock.calls[1]?.[3],
    );
    expect(
      await screen.findByText(
        'Settings saved. Waiting for the bot to apply them.',
      ),
    ).toBeVisible();
  });
});
describe('ticket staff workflow settings', () => {
  it('requires escalation after the reminder and saves both timers', async () => {
    const user = userEvent.setup();
    vi.mocked(saveConfig).mockResolvedValue({
      data: { ...saved, revision: 4 },
    } as never);
    renderConfig();
    const reminder = await screen.findByLabelText(/Remind staff after/);
    const escalation = screen.getByLabelText(/Escalate after/);
    await user.type(reminder, '30');
    await user.type(escalation, '20');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Escalate after the reminder.'),
    ).toBeVisible();
    expect(saveConfig).not.toHaveBeenCalled();
    await user.clear(escalation);
    await user.type(escalation, '90');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveConfig).mock.calls[0]?.[2]).toMatchObject({
      config: {
        workflow: { reminderMinutes: 30, escalationMinutes: 90 },
      },
    });
    expect(
      (
        vi.mocked(saveConfig).mock.calls[0]?.[2] as unknown as {
          config: { workflow: Record<string, unknown> };
        }
      ).config.workflow['escalationRoleId'],
    ).toBeUndefined();
  });
});
