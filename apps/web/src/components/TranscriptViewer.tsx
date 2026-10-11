import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Paperclip, Search } from 'lucide-react';
import { ErrorState, LoadingState, Notice } from '@sparko/ui';
import { getTicketTranscript } from '../services/tickets';
import { errorMessage } from '../services/http';

const MessageSchema = z
  .object({
    id: z.string(),
    content: z.string().default(''),
    timestamp: z.string().optional(),
    author: z
      .object({ id: z.string(), username: z.string().optional() })
      .loose()
      .optional(),
    attachments: z
      .array(
        z
          .object({
            filename: z.string().optional(),
            size: z.number().optional(),
          })
          .loose(),
      )
      .default([]),
  })
  .loose();
const CapturedSchema = z
  .object({
    accessibleHistory: z.array(z.unknown()).default([]),
    coverage: z.string().optional(),
  })
  .loose();
const size = (bytes?: number) =>
  bytes === undefined
    ? ''
    : bytes < 1024 * 1024
      ? ` · ${Math.ceil(bytes / 1024)} KB`
      : ` · ${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Reads a retained transcript through the same authorized API as download and
 * searches it in the browser. Attachments show names only: their Discord links
 * would make private files shareable.
 */
export function TranscriptViewer({
  guildId,
  ticketId,
  transcriptId,
}: {
  guildId: string;
  ticketId: string;
  transcriptId: string;
}) {
  const [term, setTerm] = useState('');
  const transcript = useQuery({
    queryKey: ['ticket-transcript', guildId, ticketId, transcriptId],
    queryFn: () => getTicketTranscript(guildId, ticketId, transcriptId),
    staleTime: Infinity,
  });
  if (transcript.isPending) return <LoadingState label="Opening transcript…" />;
  if (transcript.error)
    return (
      <ErrorState
        message={errorMessage(transcript.error)}
        retry={() => void transcript.refetch()}
      />
    );
  const captured = CapturedSchema.parse(transcript.data.messages);
  const messages = captured.accessibleHistory
    .map((item) => MessageSchema.safeParse(item))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    // Discord returns newest first; read oldest first.
    .reverse();
  const needle = term.trim().toLowerCase();
  const shown = needle
    ? messages.filter((message) =>
        `${message.author?.username ?? ''} ${message.content} ${message.attachments.map((file) => file.filename).join(' ')}`
          .toLowerCase()
          .includes(needle),
      )
    : messages;
  return (
    <div className="stack transcript-viewer">
      {captured.coverage && (
        <Notice
          tone={transcript.data.status === 'complete' ? 'info' : 'warning'}
          title={
            transcript.data.status === 'complete'
              ? 'Complete transcript'
              : 'Partial transcript'
          }
        >
          {captured.coverage}
        </Notice>
      )}
      <label className="search-field">
        <Search size={17} aria-hidden="true" />
        <input
          aria-label="Search this transcript"
          placeholder="Search messages, people or files…"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </label>
      <p className="field-hint" aria-live="polite">
        {needle
          ? `${shown.length} of ${messages.length} messages match.`
          : `${messages.length} messages.`}
      </p>
      <ol className="transcript-list">
        {shown.map((message) => (
          <li key={message.id}>
            <p className="transcript-meta">
              <strong>{message.author?.username ?? 'Unknown'}</strong>{' '}
              {message.timestamp && (
                <time dateTime={message.timestamp}>
                  {new Date(message.timestamp).toLocaleString()}
                </time>
              )}
            </p>
            {message.content && (
              <p className="wrap-anywhere transcript-content">
                {message.content}
              </p>
            )}
            {message.attachments.map((file, index) => (
              <p className="transcript-file" key={index}>
                <Paperclip size={13} aria-hidden="true" />{' '}
                {file.filename ?? 'Attachment'}
                {size(file.size)}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}
