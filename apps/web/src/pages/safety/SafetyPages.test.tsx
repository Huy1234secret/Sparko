// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsPage } from './ReportsPage';
import { AntiNukePage, AutomodPage } from './ProtectionPages';
import { ReportsAndAppealsCard, VerifyCard } from './MemberSafety';
import { getChannels, getConfig, getRoles } from '../../services/guilds';
import {
  completeVerification,
  decideIntake,
  getIncidents,
  getIntake,
  getMyCases,
  recoverIncident,
  startVerification,
  submitAppeal,
  testSafetyRule,
  type IncidentRecord,
  type ReportRecord,
} from '../../services/safety';
import { ApiError } from '../../services/http';

vi.mock('../../services/guilds', () => ({
  getChannels: vi.fn(),
  getConfig: vi.fn(),
  getRoles: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../../services/safety', () => ({
  completeVerification: vi.fn(),
  decideIntake: vi.fn(),
  getIncidents: vi.fn(),
  getIntake: vi.fn(),
  getMyCases: vi.fn(),
  recoverIncident: vi.fn(),
  startVerification: vi.fn(),
  submitAppeal: vi.fn(),
  submitReport: vi.fn(),
  testSafetyRule: vi.fn(),
}));
const guildId = '123456789012345678';
const member = '223456789012345678';
function renderAt(path: string, element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: '/dashboard/:guildId/:group/:module', element }],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
const report: ReportRecord = {
  id: 'report-1',
  key: 'report-1',
  ownerId: member,
  state: 'open',
  revision: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  data: {
    subject: 'Spam in general',
    description: 'Someone keeps posting invite links.',
    evidence: ['https://example.com/shot.png'],
    history: [],
  },
};
const incident = (data: Partial<IncidentRecord['data']>): IncidentRecord => ({
  id: 'incident-1',
  key: 'incident-1',
  ownerId: null,
  state: 'observed',
  revision: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  data: { feature: 'R29', ...data },
});
beforeEach(() => {
  vi.mocked(getChannels).mockResolvedValue([]);
  vi.mocked(getRoles).mockResolvedValue([]);
  vi.mocked(getConfig).mockResolvedValue({
    featureId: 'R27',
    revision: 1,
    appliedRevision: 1,
    config: {
      enabled: true,
      mode: 'observe',
      maximumActionsPerMinute: 5,
      rules: [
        {
          id: 'invites',
          name: 'No invites',
          enabled: true,
          kind: 'invites',
          keywords: [],
          threshold: 5,
          windowSeconds: 10,
          action: 'timeout',
          timeoutSeconds: 60,
          cooldownSeconds: 60,
          exemptRoleIds: [],
          exemptChannelIds: [],
          exemptMemberIds: [],
        },
      ],
    },
    missingPrerequisites: [],
  });
  vi.mocked(getIncidents).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('reports and appeals', () => {
  it('shows private evidence safely and records a reasoned decision', async () => {
    const user = userEvent.setup();
    vi.mocked(getIntake).mockResolvedValue([report]);
    vi.mocked(decideIntake).mockResolvedValue({ data: {} } as never);
    renderAt(`/dashboard/${guildId}/safety/reports`, <ReportsPage />);
    await user.click(
      await screen.findByRole('button', { name: /Spam in general/ }),
    );
    const link = screen.getByRole('link', { name: /example\.com/ });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    const record = screen.getByRole('button', { name: 'Record decision' });
    expect(record).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Decision'), 'accepted');
    await user.type(screen.getByLabelText(/Reason/), 'Confirmed and warned');
    await user.click(record);
    await waitFor(() => expect(decideIntake).toHaveBeenCalledTimes(1));
    expect(vi.mocked(decideIntake).mock.calls[0]?.slice(1, 4)).toEqual([
      'report',
      'report-1',
      {
        expectedRevision: 1,
        decision: 'accepted',
        reason: 'Confirmed and warned',
      },
    ]);
  });
  it('lets a member appeal an appealable case once', async () => {
    const user = userEvent.setup();
    vi.mocked(getIntake).mockResolvedValue([]);
    vi.mocked(getMyCases).mockResolvedValue([
      {
        id: '0b8f7d1c-3a0e-4b77-9a5f-7a9b6c1d2e3f',
        number: 4,
        action: 'warn',
        reason: 'Spam',
        state: 'applied',
        createdAt: '2026-10-01T00:00:00.000Z',
        appealed: false,
        appealable: true,
      },
    ]);
    vi.mocked(submitAppeal).mockResolvedValue({ data: {} } as never);
    renderAt(
      `/dashboard/${guildId}/me/x`,
      <ReportsAndAppealsCard guildId={guildId} />,
    );
    await user.click(await screen.findByRole('button', { name: 'Appeal' }));
    const send = screen.getByRole('button', { name: 'Send appeal' });
    expect(send).toBeDisabled();
    await user.type(
      screen.getByLabelText(/case #4/),
      'I was answering a question with a link.',
    );
    await user.click(send);
    await waitFor(() => expect(submitAppeal).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitAppeal).mock.calls[0]?.[1]).toEqual({
      caseId: '0b8f7d1c-3a0e-4b77-9a5f-7a9b6c1d2e3f',
      description: 'I was answering a question with a link.',
    });
    expect(await screen.findByText(/Appeal sent/)).toBeVisible();
  });
});

describe('auto moderation', () => {
  it('tests the selected rule with the server engine and enforces nothing', async () => {
    const user = userEvent.setup();
    vi.mocked(testSafetyRule).mockResolvedValue({
      data: {
        matched: true,
        detail: 'Discord invite URL',
        plannedAction: 'timeout',
        simulation: true,
      },
    } as never);
    renderAt(`/dashboard/${guildId}/safety/automod`, <AutomodPage />);
    expect(
      await screen.findByRole('button', { name: 'No invites' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.type(
      screen.getByLabelText('Sample message'),
      'join discord.gg/abc',
    );
    await user.click(screen.getByRole('button', { name: 'Run test' }));
    expect(
      await screen.findByText(/Matches — the bot would: Timeout the member/),
    ).toBeVisible();
    expect(screen.getByText(/nothing was enforced/)).toBeVisible();
    const body = vi.mocked(testSafetyRule).mock.calls[0]?.[1];
    expect(body?.rule).toMatchObject({ id: 'invites', kind: 'invites' });
    expect(body?.message.content).toBe('join discord.gg/abc');
  });
});

describe('protection incidents', () => {
  it('shows attribution limits and records manual recovery with a reason', async () => {
    const user = userEvent.setup();
    vi.mocked(getConfig).mockResolvedValue({
      featureId: 'R29',
      revision: 0,
      appliedRevision: 0,
      config: {},
      missingPrerequisites: [],
    });
    vi.mocked(getIncidents).mockResolvedValue([
      incident({
        event: { type: 'destructive', action: 'channel_delete' },
        burstCount: 4,
        attribution: 'unknown',
        recoveryLimits: 'Deleted messages cannot be reconstructed.',
      }),
    ]);
    vi.mocked(recoverIncident).mockResolvedValue({ data: {} } as never);
    renderAt(`/dashboard/${guildId}/safety/anti-nuke`, <AntiNukePage />);
    await user.click(
      await screen.findByRole('button', { name: /channel delete/ }),
    );
    expect(
      screen.getByText('Unknown: Discord did not say who did this'),
    ).toBeVisible();
    expect(screen.getByText('What Sparko cannot restore')).toBeVisible();
    const save = screen.getByRole('button', { name: 'Record manual recovery' });
    expect(save).toBeDisabled();
    await user.type(
      screen.getByLabelText(/What did staff check/),
      'Recreated #rules from backup',
    );
    await user.click(save);
    await waitFor(() => expect(recoverIncident).toHaveBeenCalledTimes(1));
    expect(vi.mocked(recoverIncident).mock.calls[0]?.[2]).toEqual({
      expectedRevision: 1,
      reason: 'Recreated #rules from backup',
    });
  });
});

describe('member verification', () => {
  it('answers the challenge for the current rules version', async () => {
    const user = userEvent.setup();
    vi.mocked(startVerification).mockResolvedValue({
      data: {
        id: 'challenge-1',
        question: '3 + 4',
        rulesVersion: 2,
        rulesText: 'Be kind.',
      },
    } as never);
    vi.mocked(completeVerification).mockResolvedValue({
      data: { state: 'pending' },
    } as never);
    renderAt(`/dashboard/${guildId}/me/x`, <VerifyCard guildId={guildId} />);
    await user.click(
      screen.getByRole('button', { name: 'Start verification' }),
    );
    expect(await screen.findByText('Be kind.')).toBeVisible();
    const accept = screen.getByRole('button', { name: 'I accept these rules' });
    expect(accept).toBeDisabled();
    await user.type(screen.getByLabelText(/What is 3 \+ 4/), '7');
    await user.click(accept);
    await waitFor(() => expect(completeVerification).toHaveBeenCalledTimes(1));
    expect(vi.mocked(completeVerification).mock.calls[0]?.[1]).toEqual({
      rulesVersion: 2,
      acknowledge: true,
      challengeId: 'challenge-1',
      answer: '7',
    });
    expect(await screen.findByText('Verification sent')).toBeVisible();
  });
  it('says plainly when the server does not use verification', async () => {
    const user = userEvent.setup();
    vi.mocked(startVerification).mockRejectedValue(
      new ApiError('Disabled.', 'FEATURE_DISABLED', 409),
    );
    renderAt(`/dashboard/${guildId}/me/x`, <VerifyCard guildId={guildId} />);
    await user.click(
      screen.getByRole('button', { name: 'Start verification' }),
    );
    expect(
      await screen.findByText('This server does not use verification.'),
    ).toBeVisible();
  });
});
