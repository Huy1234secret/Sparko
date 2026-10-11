// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleMenusPage } from './RoleMenusPage';
import { SubmissionsPage } from './SubmissionsPage';
import { AutoRolesPage } from './CommunitySettingsPages';
import {
  getChannels,
  getConfig,
  getRoles,
  saveConfig,
} from '../../services/guilds';
import { getTemplates } from '../../services/messages';
import {
  createRoleMenu,
  getManagedRoleMenus,
  getSubmissions,
  submissionAction,
} from '../../services/community';
import { ApiError } from '../../services/http';

vi.mock('../../services/guilds', () => ({
  getChannels: vi.fn(),
  getConfig: vi.fn(),
  getRoles: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../../services/messages', () => ({ getTemplates: vi.fn() }));
vi.mock('../../services/community', () => ({
  createRoleMenu: vi.fn(),
  getManagedRoleMenus: vi.fn(),
  getStarboard: vi.fn(),
  getSubmissions: vi.fn(),
  submissionAction: vi.fn(),
}));
const guildId = '123456789012345678';
const channel = '123456789012345671';
const gold = '123456789012345672';
const mod = '123456789012345673';
const high = '123456789012345674';
function renderAt(path: string, element: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: '/dashboard/:guildId/community/:module', element }],
    { initialEntries: [`/dashboard/${guildId}/community/${path}`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getChannels).mockResolvedValue([
    { id: channel, name: 'roles', type: 0 },
  ]);
  vi.mocked(getRoles).mockResolvedValue([
    {
      id: gold,
      name: 'Gold',
      managed: false,
      assignable: true,
      privileged: false,
    },
    {
      id: mod,
      name: 'Moderator',
      managed: false,
      assignable: false,
      privileged: true,
    },
    {
      id: high,
      name: 'Owner team',
      managed: false,
      assignable: false,
      privileged: false,
    },
  ]);
  vi.mocked(getTemplates).mockResolvedValue([]);
  vi.mocked(getConfig).mockImplementation(async (_g, featureId) => ({
    featureId,
    revision: 1,
    appliedRevision: 1,
    missingPrerequisites: [],
    config: { enabled: true },
  }));
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('role menus', () => {
  it('offers only grantable roles and blocks impossible selection limits', async () => {
    const user = userEvent.setup();
    vi.mocked(getManagedRoleMenus).mockResolvedValue([]);
    vi.mocked(createRoleMenu).mockResolvedValue({ data: {} as never });
    renderAt('roles?tab=new', <RoleMenusPage />);
    await user.type(await screen.findByLabelText('Menu name'), 'Colours');
    await user.selectOptions(screen.getByLabelText('Channel'), channel);
    await user.click(screen.getByRole('button', { name: 'Add role' }));
    const role = screen.getByLabelText('Role');
    expect(
      Array.from((role as HTMLSelectElement).options).map(
        (option) => option.text,
      ),
    ).toEqual(['Gold']);
    const max = screen.getByLabelText('Maximum picks');
    await user.clear(max);
    await user.type(max, '2');
    await user.click(screen.getByRole('button', { name: 'Publish menu' }));
    expect(
      await screen.findByText(
        'Maximum picks must be at least the minimum and no more than the number of roles.',
      ),
    ).toBeVisible();
    expect(createRoleMenu).not.toHaveBeenCalled();
    await user.clear(max);
    await user.type(max, '1');
    await user.click(screen.getByRole('button', { name: 'Publish menu' }));
    await waitFor(() => expect(createRoleMenu).toHaveBeenCalledOnce());
    expect(vi.mocked(createRoleMenu).mock.calls[0]![1]).toMatchObject({
      name: 'Colours',
      channelId: channel,
      options: [{ roleId: gold, label: 'Gold' }],
      maxSelections: 1,
    });
    expect(
      await screen.findByText(
        'Menu saved. It becomes usable once Discord shows it.',
      ),
    ).toBeVisible();
  });
  it('shows a failed delivery with its reason', async () => {
    vi.mocked(getManagedRoleMenus).mockResolvedValue([
      {
        id: 'm1',
        key: 'k',
        ownerId: '1',
        state: 'failed',
        revision: 1,
        createdAt: '2026-10-11T10:00:00Z',
        data: {
          name: 'Colours',
          channelId: channel,
          options: [{ roleId: gold, label: 'Gold' }],
          minSelections: 0,
          maxSelections: 1,
          deliveryError:
            'Give Sparko Send Messages permission in this channel.',
        },
      },
    ]);
    renderAt('roles', <RoleMenusPage />);
    expect(await screen.findByText('Delivery failed')).toBeVisible();
    expect(
      screen.getByText('Give Sparko Send Messages permission in this channel.'),
    ).toBeVisible();
  });
});
describe('automatic roles', () => {
  it('explains why moderator and higher roles cannot be granted', async () => {
    renderAt('autoroles', <AutoRolesPage />);
    expect(
      await screen.findAllByText(
        'Moderator — has moderator permissions, cannot be assigned',
      ),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText(
        'Owner team — above Sparko’s role, cannot be assigned',
      ),
    ).not.toHaveLength(0);
    expect(saveConfig).not.toHaveBeenCalled();
  });
});
describe('staff queues', () => {
  const suggestion = {
    id: 's1',
    key: 'k',
    ownerId: '123456789012345690',
    state: 'open',
    revision: 3,
    createdAt: '2026-10-11T10:00:00Z',
    data: {
      content: 'Add a music channel',
      visibility: 'private' as const,
      decisions: [],
      answers: [],
    },
    votes: { positive: 4, negative: 1, score: 3, myVote: 0 },
  };
  it('records a reasoned decision against the reviewed revision', async () => {
    const user = userEvent.setup();
    vi.mocked(getSubmissions).mockResolvedValue([suggestion]);
    vi.mocked(submissionAction).mockResolvedValue({ data: {} });
    renderAt('suggestions', <SubmissionsPage kind="suggestions" />);
    await user.click(
      await screen.findByRole('button', { name: /Add a music channel/ }),
    );
    expect(screen.getByText('4 for · 1 against · score 3')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Decision'), 'planned');
    await user.type(screen.getByLabelText('Reason'), 'Coming next month');
    await user.type(
      screen.getByLabelText('Discussion link (optional)'),
      'https://example.com',
    );
    expect(
      screen.getByRole('button', { name: 'Record decision' }),
    ).toBeDisabled();
    await user.clear(screen.getByLabelText('Discussion link (optional)'));
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    await waitFor(() =>
      expect(submissionAction).toHaveBeenCalledWith(
        guildId,
        'suggestions',
        's1',
        'decision',
        { expectedRevision: 3, status: 'planned', reason: 'Coming next month' },
        expect.any(String),
      ),
    );
  });
  it('keeps the staff answer when another reviewer answered first', async () => {
    const user = userEvent.setup();
    vi.mocked(getSubmissions).mockResolvedValue([
      {
        ...suggestion,
        id: 'q1',
        votes: undefined,
        data: { ...suggestion.data, content: 'How do I verify?' },
      },
    ]);
    vi.mocked(submissionAction).mockRejectedValue(
      new ApiError('Changed', 'REVISION_CONFLICT', 409, 'r', 4),
    );
    renderAt('questions', <SubmissionsPage kind="questions" />);
    await user.click(
      await screen.findByRole('button', { name: /How do I verify/ }),
    );
    await user.type(screen.getByLabelText('Answer'), 'Use /verify');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(
      await screen.findByText('Someone else updated this question.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Answer')).toHaveValue('Use /verify');
  });
});
