// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptViewer } from './TranscriptViewer';
import { getTicketTranscript } from '../services/tickets';

vi.mock('../services/tickets', () => ({ getTicketTranscript: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('transcript viewer', () => {
  it('searches messages oldest first and never links private attachments', async () => {
    const user = userEvent.setup();
    vi.mocked(getTicketTranscript).mockResolvedValue({
      id: 't1',
      status: 'partial',
      checksum: 'x',
      createdAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-11-01T00:00:00.000Z',
      messages: {
        coverage: 'Some history was unavailable.',
        accessibleHistory: [
          {
            id: '2',
            content: 'Here is the receipt',
            timestamp: '2026-10-01T00:02:00.000Z',
            author: { id: 'a', username: 'member' },
            attachments: [
              {
                filename: 'receipt.png',
                size: 2048,
                url: 'https://cdn.discordapp.com/private/receipt.png',
              },
            ],
          },
          {
            id: '1',
            content: 'My payment failed',
            timestamp: '2026-10-01T00:01:00.000Z',
            author: { id: 'a', username: 'member' },
            attachments: [],
          },
        ],
      },
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TranscriptViewer guildId="g" ticketId="t" transcriptId="t1" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Partial transcript')).toBeVisible();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('My payment failed');
    expect(screen.getByText(/receipt\.png · 2 KB/)).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
    await user.type(screen.getByLabelText('Search this transcript'), 'receipt');
    expect(screen.getByText('1 of 2 messages match.')).toBeVisible();
    expect(screen.queryByText('My payment failed')).toBeNull();
  });
});
