// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupsPage, MultiServerPage } from './ConfigToolsPages';
import {
  applyRollout,
  createBackup,
  getBackups,
  importBackup,
  previewRestore,
  previewRollout,
  restoreBackup,
  type BackupPreview,
} from '../../services/configTools';
import { getGuilds } from '../../services/guilds';

vi.mock('../../services/configTools', async (original) => ({
  ...(await original<typeof import('../../services/configTools')>()),
  getBackups: vi.fn(),
  createBackup: vi.fn(),
  importBackup: vi.fn(),
  previewRestore: vi.fn(),
  restoreBackup: vi.fn(),
  previewRollout: vi.fn(),
  applyRollout: vi.fn(),
}));
vi.mock('../../services/guilds', async (original) => ({
  ...(await original<typeof import('../../services/guilds')>()),
  getGuilds: vi.fn(),
  getConfig: vi.fn(async () => ({
    featureId: 'R61',
    revision: 1,
    appliedRevision: 1,
    config: { enabled: true, allowComparison: true, allowRollout: false },
    missingPrerequisites: [],
  })),
  getChannels: vi.fn(async () => [
    { id: '623456789012345678', name: 'general', type: 0 },
  ]),
  getRoles: vi.fn(async () => [{ id: '723456789012345678', name: 'Mods' }]),
}));

const guildId = '123456789012345678',
  otherId = '223456789012345678',
  thirdId = '233456789012345678';
function renderPage(element: ReactElement, path = '') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: '/dashboard/:guildId/settings/x', element }],
    { initialEntries: [`/dashboard/${guildId}/settings/x${path}`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
const backup = {
  id: '9c7f0a52-1d1e-4a4b-9a55-1f0c9e2f5a11',
  label: 'Before launch',
  origin: 'import' as const,
  sourceGuildId: otherId,
  createdBy: '323456789012345678',
  createdAt: '2026-10-01T10:00:00.000Z',
  featureIds: ['R09'],
};
const preview = (missing: boolean): BackupPreview => ({
  backupId: backup.id,
  changes: [
    {
      featureId: 'R09',
      expectedRevision: 3,
      before: { enabled: false },
      proposed: { enabled: true },
      changed: true,
      missing: {
        channels: missing
          ? [
              {
                path: 'channelMultipliers.0.channelId',
                id: '999999999999991234',
              },
            ]
          : [],
        roles: [],
      },
      issues: [],
    },
  ],
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('configuration backups', () => {
  it('says what is never backed up and saves a named backup', async () => {
    vi.mocked(getBackups).mockResolvedValue({ backups: [backup], limit: 25 });
    vi.mocked(createBackup).mockResolvedValue({
      data: { ...backup, label: 'Nightly', origin: 'snapshot' },
    });
    const user = userEvent.setup();
    renderPage(<BackupsPage />);
    expect(await screen.findByText('Before launch')).toBeVisible();
    expect(screen.getByText('1 of 25 kept.')).toBeVisible();
    expect(screen.getByText(/from another server/)).toBeVisible();
    expect(screen.getByText(/AI consent/)).toBeVisible();
    await user.type(screen.getByLabelText('Name'), 'Nightly');
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(createBackup).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createBackup).mock.calls[0]!.slice(0, 2)).toEqual([
      guildId,
      'Nightly',
    ]);
    expect(await screen.findByText('Saved “Nightly”.')).toBeVisible();
  });

  it('refuses a file that is not a Sparko backup before uploading it', async () => {
    vi.mocked(getBackups).mockResolvedValue({ backups: [], limit: 25 });
    const user = userEvent.setup();
    renderPage(<BackupsPage />);
    await user.upload(
      await screen.findByLabelText('Backup file to import'),
      new File(['{"hello":1}'], 'notes.json', { type: 'application/json' }),
    );
    expect(
      await screen.findByText('This is not a Sparko backup file.'),
    ).toBeVisible();
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('restores only after every missing channel is matched and previewed again', async () => {
    vi.mocked(getBackups).mockResolvedValue({ backups: [backup], limit: 25 });
    vi.mocked(previewRestore)
      .mockResolvedValueOnce({ data: preview(true) })
      .mockResolvedValueOnce({ data: preview(false) });
    vi.mocked(restoreBackup).mockResolvedValue({
      data: { restored: [{ featureId: 'R09', revision: 4 }] },
    });
    const user = userEvent.setup();
    renderPage(<BackupsPage />, `?tab=restore&backup=${backup.id}`);
    await user.click(
      await screen.findByRole('button', { name: 'Preview changes' }),
    );
    expect(await screen.findByText('Needs matching')).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'Levels & XP' }),
    ).toBeDisabled();
    const restore = screen.getByRole('button', { name: /Restore 0 module/ });
    expect(restore).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText('Missing channel …1234'),
      '623456789012345678',
    );
    expect(screen.getByText('Preview again to use your choices')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Preview again' }));
    expect(await screen.findByText('Will change')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Restore 1 module/ }));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledTimes(1));
    expect(vi.mocked(restoreBackup).mock.calls[0]![2]).toEqual({
      featureIds: ['R09'],
      expectedRevisions: { R09: 3 },
      remap: {
        channels: { '999999999999991234': '623456789012345678' },
        roles: {},
      },
    });
    expect(await screen.findByText('Settings restored')).toBeVisible();
  });
});

describe('multi-server rollout', () => {
  it('previews per server, skips comparison-only servers and reports each result', async () => {
    vi.mocked(getGuilds).mockResolvedValue([
      {
        id: guildId,
        name: 'Home',
        installed: true,
        manageable: true,
        capabilities: [],
      },
      {
        id: otherId,
        name: 'Sister server',
        installed: true,
        manageable: true,
        capabilities: [],
      },
      {
        id: thirdId,
        name: 'Partner server',
        installed: true,
        manageable: true,
        capabilities: [],
      },
    ]);
    vi.mocked(previewRollout).mockResolvedValue({
      data: {
        sourceGuildId: guildId,
        excludedFeatures: [],
        notConfiguredInSource: [],
        targets: [
          {
            guildId: otherId,
            rolloutAllowed: true,
            changes: [
              {
                featureId: 'R09',
                expectedRevision: 2,
                before: null,
                proposed: { enabled: true },
                changed: true,
                missing: { channels: [], roles: [] },
              },
            ],
          },
          {
            guildId: thirdId,
            rolloutAllowed: false,
            changes: [
              {
                featureId: 'R09',
                expectedRevision: 0,
                before: null,
                proposed: { enabled: true },
                changed: true,
                missing: { channels: [], roles: [] },
              },
            ],
          },
        ],
      },
    });
    vi.mocked(applyRollout).mockResolvedValue({
      data: {
        sourceGuildId: guildId,
        excludedFeatures: [],
        results: [{ guildId: otherId, status: 'applied' }],
      },
    });
    const user = userEvent.setup();
    renderPage(<MultiServerPage />);
    expect(
      screen.queryByRole('checkbox', { name: 'Home' }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Sister server' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Partner server' }));
    expect(
      screen.queryByRole('checkbox', { name: 'Public widgets' }),
    ).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Levels & XP' }));
    await user.click(screen.getByRole('button', { name: 'Preview changes' }));
    expect(await screen.findByText('Comparison only')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Roll out to 1 server(s)' }),
    );
    await waitFor(() => expect(applyRollout).toHaveBeenCalledTimes(1));
    expect(vi.mocked(applyRollout).mock.calls[0]![0]).toEqual({
      sourceGuildId: guildId,
      featureIds: ['R09'],
      targets: [
        {
          guildId: otherId,
          expectedRevisions: { R09: 2 },
          remap: { channels: {}, roles: {} },
        },
      ],
    });
    expect(await screen.findByText('Applied')).toBeVisible();
  });
});
