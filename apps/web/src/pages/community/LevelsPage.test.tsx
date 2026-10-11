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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelsPage, levelThreshold } from './LevelsPage';
import {
  getChannels,
  getConfig,
  getRoles,
  saveConfig,
} from '../../services/guilds';
import { getTemplates } from '../../services/messages';
import {
  getLevelProfiles,
  getMemberLevel,
  grantXp,
  previewRewardRoles,
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
  getLevelProfiles: vi.fn(),
  getMemberLevel: vi.fn(),
  grantXp: vi.fn(),
  previewRewardRoles: vi.fn(),
  reconcileRewardRoles: vi.fn(),
}));
const guildId = '123456789012345678';
const gold = '123456789012345670';
function renderPage(tab?: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/:guildId/engagement/levels',
        element: <LevelsPage />,
      },
    ],
    {
      initialEntries: [
        `/dashboard/${guildId}/engagement/levels${tab ? '?tab=' + tab : ''}`,
      ],
    },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getConfig).mockImplementation(async (_guild, feature) => ({
    featureId: feature,
    revision: 2,
    appliedRevision: 2,
    config:
      feature === 'R09'
        ? { enabled: true, baseXp: 100, growthXp: 50 }
        : { enabled: true, policy: 'highest', rewards: [] },
    missingPrerequisites: [],
  }));
  vi.mocked(getChannels).mockResolvedValue([
    { id: '123456789012345671', name: 'general', type: 0 },
  ]);
  vi.mocked(getRoles).mockResolvedValue([
    { id: gold, name: 'Gold', managed: false, assignable: true },
    {
      id: '123456789012345672',
      name: 'Admin',
      managed: false,
      assignable: false,
    },
  ]);
  vi.mocked(getTemplates).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('levels page', () => {
  it('matches the domain curve and saves typed settings with the current revision', async () => {
    expect(levelThreshold(1, 100, 50)).toBe(100);
    expect(levelThreshold(5, 100, 50)).toBe(1000);
    const user = userEvent.setup();
    vi.mocked(saveConfig).mockImplementation(async (_g, _f, body) => ({
      data: {
        featureId: 'R09',
        revision: 3,
        appliedRevision: 2,
        config: body.config,
        missingPrerequisites: [],
      },
    }));
    renderPage();
    const table = await screen.findByRole('table', {
      name: 'Total XP needed per level',
    });
    expect(within(table).getByText('1,000')).toBeVisible();
    const base = screen.getByLabelText('Base XP');
    await user.clear(base);
    await user.type(base, '200');
    expect(within(table).getByText('1,500')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saveConfig).toHaveBeenCalledOnce());
    const [, feature, body] = vi.mocked(saveConfig).mock.calls[0]!;
    expect(feature).toBe('R09');
    expect(body.expectedRevision).toBe(2);
    expect(body.config).toMatchObject({
      enabled: true,
      baseXp: 200,
      growthXp: 50,
    });
    expect(
      await screen.findByText(
        'Settings saved. Waiting for the bot to apply them.',
      ),
    ).toBeVisible();
  });
  it('blocks an invalid XP range locally and places server errors on the field', async () => {
    const user = userEvent.setup();
    renderPage();
    const min = await screen.findByLabelText('Minimum XP per message');
    await user.clear(min);
    await user.type(min, '90');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Maximum XP must be at least minimum XP'),
    ).toBeVisible();
    expect(saveConfig).not.toHaveBeenCalled();
    await user.clear(min);
    await user.type(min, '10');
    vi.mocked(saveConfig).mockRejectedValue(
      new ApiError(
        'Check the highlighted fields.',
        'INVALID_INPUT',
        400,
        'r',
        undefined,
        {
          fieldErrors: [
            { path: 'cooldownSeconds', message: 'Too short for this server.' },
          ],
        },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Too short for this server.')).toBeVisible();
    expect(screen.getByLabelText('Cooldown (seconds)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
  it('previews reward roles without applying them and marks roles above Sparko', async () => {
    const user = userEvent.setup();
    vi.mocked(getConfig).mockImplementation(async (_guild, feature) => ({
      featureId: feature,
      revision: 1,
      appliedRevision: 1,
      config: {
        enabled: true,
        policy: 'highest',
        rewards: [{ level: 5, roleId: gold }],
      },
      missingPrerequisites: [],
    }));
    vi.mocked(previewRewardRoles).mockResolvedValue({
      data: {
        userId: '123456789012345699',
        level: 7,
        desiredRoleIds: [gold],
        managedRoleIds: [gold],
        applied: false,
      },
    });
    renderPage('rewards');
    expect(
      await screen.findByRole('option', {
        name: 'Admin — above Sparko’s role',
      }),
    ).toBeDisabled();
    const apply = screen.getByRole('button', { name: 'Apply to Discord' });
    expect(apply).toBeDisabled();
    await user.type(screen.getByLabelText('Member ID'), '123456789012345699');
    await user.click(screen.getByRole('button', { name: 'Preview roles' }));
    expect(await screen.findByText('Level 7: Gold.')).toBeVisible();
    expect(apply).toBeEnabled();
  });
  it('records a reasoned staff XP adjustment for the selected member', async () => {
    const user = userEvent.setup();
    vi.mocked(getLevelProfiles).mockResolvedValue([
      {
        userId: '123456789012345699',
        xp: 400,
        level: 3,
        publicProfile: false,
        lastMessageAt: null,
        updatedAt: '2026-10-11T10:00:00Z',
      },
    ]);
    vi.mocked(getMemberLevel).mockResolvedValue({
      profile: {
        userId: '123456789012345699',
        xp: 400,
        level: 3,
        previousLevelXp: 300,
        nextLevelXp: 550,
        progress: 0.4,
        publicProfile: false,
        card: {},
        revision: 4,
        textSummary: 'Level 3. 400 XP. 150 XP to the next level.',
      },
      history: [],
    });
    vi.mocked(grantXp).mockResolvedValue({ data: {} });
    renderPage('members');
    await user.click(
      await screen.findByRole('button', { name: '123456789012345699' }),
    );
    expect(
      await screen.findByText('Level 3. 400 XP. 150 XP to the next level.'),
    ).toBeVisible();
    const record = screen.getByRole('button', { name: 'Record adjustment' });
    await user.type(screen.getByLabelText('XP adjustment'), '-50');
    expect(record).toBeDisabled();
    await user.type(screen.getByLabelText('Reason'), 'Spam cleanup');
    await user.click(record);
    await waitFor(() =>
      expect(grantXp).toHaveBeenCalledWith(
        guildId,
        { userId: '123456789012345699', amount: -50, reason: 'Spam cleanup' },
        expect.any(String),
      ),
    );
    expect(await screen.findByText('Adjustment recorded.')).toBeVisible();
  });
});
