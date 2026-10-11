// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketDetailPage } from './TicketPages';
import {
  claimTicket,
  getTicket,
  getTicketTranscripts,
  TicketSchema,
} from '../services/tickets';

vi.mock('../services/tickets', async (original) => ({
  ...(await original<typeof import('../services/tickets')>()),
  getTicket: vi.fn(),
  getTicketTranscripts: vi.fn(),
  getTicketTranscript: vi.fn(),
  claimTicket: vi.fn(),
  closeTicket: vi.fn(),
  updateTicket: vi.fn(),
}));
const ticket = (state: string, claimantId: string | null = null) =>
  TicketSchema.parse({
    id: 'ticket-1',
    number: 7,
    state,
    ownerId: '223456789012345678',
    claimantId,
    revision: 1,
    createdAt: '2026-10-01T10:00:00.000Z',
    participants: [],
  });
function renderDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/:guildId/support/tickets/:ticketId',
        element: <TicketDetailPage />,
      },
    ],
    { initialEntries: ['/dashboard/123/support/tickets/ticket-1'] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.mocked(getTicketTranscripts).mockResolvedValue([]));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('ticket detail', () => {
  it('explains the next step and confirms a claim', async () => {
    const user = userEvent.setup();
    vi.mocked(getTicket).mockResolvedValue(ticket('open'));
    vi.mocked(claimTicket).mockResolvedValue({
      data: ticket('claimed', '323456789012345678'),
    } as never);
    renderDetail();
    expect(await screen.findByText('Next: claim this ticket')).toBeVisible();
    expect(screen.getByText('Waiting for staff')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Claim ticket' }));
    expect(await screen.findByText('You claimed this ticket.')).toBeVisible();
    expect(screen.getByText('Next: help the member, then close')).toBeVisible();
    expect(screen.getByText('323456789012345678')).toBeVisible();
  });
  it('requires a reason before closing and keeps the channel on failed capture', async () => {
    const user = userEvent.setup();
    vi.mocked(getTicket).mockResolvedValue(ticket('capture_failed'));
    renderDetail();
    expect(
      await screen.findByText('Transcript capture failed', {
        selector: 'strong',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close ticket' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', {
      name: 'Close this ticket',
    });
    expect(confirm).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText(/Reason for closing/),
      'Resolved',
    );
    expect(confirm).toBeEnabled();
    expect(within(dialog).getByText(/992 characters left/)).toBeVisible();
  });
});
