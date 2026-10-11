// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamPanel, TicketStaffControls } from './TicketStaff';
import {
  getTicketMetrics,
  getTicketStaff,
  setMyAvailability,
  TicketSchema,
  updateTicket,
} from '../services/tickets';
import { getSession } from '../services/session';
import { ApiError } from '../services/http';

vi.mock('../services/tickets', async (original) => ({
  ...(await original<typeof import('../services/tickets')>()),
  getTicketMetrics: vi.fn(),
  getTicketStaff: vi.fn(),
  setMyAvailability: vi.fn(),
  updateTicket: vi.fn(),
}));
vi.mock('../services/session', async (original) => ({
  ...(await original<typeof import('../services/session')>()),
  getSession: vi.fn(),
}));
const guildId = '123456789012345678';
const me = '323456789012345678';
const colleague = '323456789012345679';
function renderWith(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const ticket = TicketSchema.parse({
  id: 'ticket-1',
  number: 3,
  state: 'open',
  ownerId: '223456789012345678',
  revision: 4,
  createdAt: '2026-10-01T00:00:00.000Z',
  participants: [],
  priority: 'normal',
  remindedAt: '2026-10-01T00:15:00.000Z',
});
beforeEach(() => {
  vi.mocked(getSession).mockResolvedValue({
    user: { id: me, username: 'me' },
    capabilities: [],
  });
  vi.mocked(getTicketStaff).mockResolvedValue([
    {
      userId: me,
      status: 'away',
      note: '',
      updatedAt: '2026-10-01T00:00:00.000Z',
      claimed: 0,
    },
    {
      userId: colleague,
      status: 'available',
      note: 'Until 18:00',
      updatedAt: '2026-10-01T00:00:00.000Z',
      claimed: 2,
    },
  ]);
  vi.mocked(getTicketMetrics).mockResolvedValue({
    windowDays: 30,
    definitions: {
      firstClaim: 'Minutes from opening to the first claim.',
      resolution: 'Minutes from opening to closing.',
    },
    open: 4,
    unclaimed: 3,
    urgent: 1,
    opened: 10,
    closed: 6,
    escalated: 2,
    medianFirstClaimMinutes: 42,
    medianResolutionMinutes: 180,
    staff: [],
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('support team panel', () => {
  it('shows response times with their definitions and updates my availability', async () => {
    const user = userEvent.setup();
    vi.mocked(setMyAvailability).mockResolvedValue({
      data: { status: 'available' },
    } as never);
    renderWith(<TeamPanel guildId={guildId} />);
    expect(await screen.findByText('42 min')).toBeVisible();
    expect(screen.getByText('3.0 h')).toBeVisible();
    expect(
      screen.getByText('Minutes from opening to the first claim.'),
    ).toBeVisible();
    expect(screen.getByText(/Until 18:00/)).toBeVisible();
    const away = await screen.findByRole('button', { name: 'Away' });
    await waitFor(() => expect(away).toHaveAttribute('aria-pressed', 'true'));
    await user.type(
      screen.getByLabelText('Note for the team (optional)'),
      'Back soon',
    );
    await user.click(screen.getByRole('button', { name: 'Available' }));
    await waitFor(() => expect(setMyAvailability).toHaveBeenCalledTimes(1));
    expect(vi.mocked(setMyAvailability).mock.calls[0]?.[1]).toEqual({
      status: 'available',
      note: 'Back soon',
    });
  });
  it('stays hidden for members without staff access', async () => {
    vi.mocked(getTicketStaff).mockRejectedValue(
      new ApiError('Only ticket staff can do this.', 'FORBIDDEN', 403),
    );
    const { container } = renderWith(<TeamPanel guildId={guildId} />);
    await waitFor(() => expect(getTicketStaff).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('ticket priority and assignment', () => {
  it('changes priority and assigns only to available staff', async () => {
    const user = userEvent.setup();
    vi.mocked(updateTicket).mockResolvedValue({ data: ticket } as never);
    renderWith(<TicketStaffControls guildId={guildId} ticket={ticket} />);
    expect(await screen.findByText(/Staff reminded/)).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Priority'), 'urgent');
    await waitFor(() => expect(updateTicket).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateTicket).mock.calls[0]?.slice(2, 4)).toEqual([
      'priority',
      { priority: 'urgent' },
    ]);
    const assignee = screen.getByLabelText('Assign to');
    const options = Array.from((assignee as HTMLSelectElement).options).map(
      (option) => option.value,
    );
    expect(options).toEqual(['', colleague]);
    await user.selectOptions(assignee, colleague);
    await user.click(screen.getByRole('button', { name: 'Assign ticket' }));
    await waitFor(() => expect(updateTicket).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateTicket).mock.calls[1]?.slice(2, 4)).toEqual([
      'assign',
      { assigneeId: colleague },
    ]);
  });
});
