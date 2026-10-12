import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Paperclip, X } from 'lucide-react';
import { Badge, Button, ErrorState, Field } from '@sparko/ui';
import {
  attachmentUrl,
  replySupport,
  setSupportState,
  toAttachment,
  type SupportScope,
  type SupportState,
  type SupportTicket,
} from '../services/support';
import { errorMessage } from '../services/http';
import { useActionIdentity } from '../hooks/useActionIdentity';

const labels: Record<
  SupportScope,
  Record<
    SupportState,
    { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' }
  >
> = {
  account: {
    open: { label: 'Waiting for support', tone: 'warning' },
    waiting_on_user: { label: 'Waiting for you', tone: 'info' },
    resolved: { label: 'Resolved', tone: 'success' },
    closed: { label: 'Closed', tone: 'neutral' },
  },
  owner: {
    open: { label: 'Needs a reply', tone: 'warning' },
    waiting_on_user: { label: 'Waiting on the member', tone: 'info' },
    resolved: { label: 'Resolved', tone: 'success' },
    closed: { label: 'Closed', tone: 'neutral' },
  },
};
export function SupportStateBadge({
  scope,
  state,
}: {
  scope: SupportScope;
  state: SupportState;
}) {
  const { label, tone } = labels[scope][state];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Up to three screenshots; PNG, JPEG or WebP, re-encoded by the server. */
export function ScreenshotPicker({
  files,
  onChange,
  id,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  id: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="stack">
      <div className="row">
        <Button
          type="button"
          variant="secondary"
          disabled={files.length >= 3}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} aria-hidden="true" /> Add screenshot
        </Button>
        <span className="field-hint" id={`${id}-hint`}>
          Up to 3 PNG, JPEG or WebP images, 4 MB each. Sparko removes their
          metadata. Leave out passwords and tokens.
        </span>
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          onChange([...files, ...chosen].slice(0, 3));
          event.target.value = '';
        }}
      />
      {files.length > 0 && (
        <ul className="attachment-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <Paperclip size={14} aria-hidden="true" /> {file.name}
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One support conversation. Members reply, close and reopen their own
 * request; support staff reply and set its state.
 */
export function SupportThread({
  scope,
  ticket,
  canReply = true,
}: {
  scope: SupportScope;
  ticket: SupportTicket;
  canReply?: boolean;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [round, setRound] = useState(0);
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['support', scope] });
  const reply = useMutation({
    mutationFn: async () => {
      const attachments = await Promise.all(files.map(toAttachment));
      const body = { message: message.trim(), attachments };
      return replySupport(
        scope,
        ticket.id,
        body,
        identity('support-reply', {
          id: ticket.id,
          round,
          message: body.message,
          files: files.map((file) => `${file.name}:${file.size}`),
        }),
      );
    },
    onSuccess: () => {
      setMessage('');
      setFiles([]);
      setRound((value) => value + 1);
      refresh();
    },
  });
  const status = useMutation({
    mutationFn: (state: SupportState) =>
      setSupportState(
        scope,
        ticket.id,
        state,
        identity('support-state', {
          id: ticket.id,
          state,
          at: ticket.updatedAt,
        }),
      ),
    onSuccess: refresh,
  });
  const closed = ticket.state === 'closed';
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h2 className="wrap-anywhere">{ticket.subject}</h2>
          <p className="muted">
            {ticket.category} · opened{' '}
            {new Date(ticket.createdAt).toLocaleString()}
          </p>
        </div>
        <SupportStateBadge scope={scope} state={ticket.state} />
      </div>
      <ol className="support-thread">
        {ticket.messages.map((item) => {
          const fromSupport =
            item.staff === true || item.authorId !== ticket.ownerId;
          return (
            <li key={item.id} className={fromSupport ? 'from-support' : ''}>
              <p className="transcript-meta">
                <strong>
                  {fromSupport
                    ? 'Sparko support'
                    : scope === 'account'
                      ? 'You'
                      : `Member ${ticket.ownerId}`}
                </strong>{' '}
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </p>
              <p className="wrap-anywhere transcript-content">{item.content}</p>
              {item.attachments.length > 0 && (
                <ul className="support-images">
                  {item.attachments.map((file) => (
                    <li key={file.id}>
                      <a
                        href={attachmentUrl(scope, ticket.id, file.id)}
                        aria-label={`Download ${file.name}`}
                      >
                        <img
                          src={attachmentUrl(scope, ticket.id, file.id)}
                          alt={`Screenshot: ${file.name}`}
                          loading="lazy"
                          width={file.width}
                          height={file.height}
                        />
                        <span>
                          {file.name} · {Math.ceil(file.bytes / 1024)} KB
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {canReply && !closed && (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim()) reply.mutate();
          }}
        >
          <Field label="Reply" htmlFor={`reply-${ticket.id}`}>
            <textarea
              id={`reply-${ticket.id}`}
              maxLength={4000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </Field>
          <ScreenshotPicker
            id={`reply-files-${ticket.id}`}
            files={files}
            onChange={setFiles}
          />
          {reply.error && <ErrorState message={errorMessage(reply.error)} />}
          <div className="row">
            <Button
              type="submit"
              disabled={!message.trim()}
              busy={reply.isPending}
            >
              Send reply
            </Button>
          </div>
        </form>
      )}
      <div className="row">
        {scope === 'account' ? (
          closed ? (
            <Button
              variant="secondary"
              busy={status.isPending}
              onClick={() => status.mutate('open')}
            >
              Reopen request
            </Button>
          ) : (
            <Button
              variant="ghost"
              busy={status.isPending}
              onClick={() => status.mutate('closed')}
            >
              Close request
            </Button>
          )
        ) : (
          canReply && (
            <Field label="Status" htmlFor={`state-${ticket.id}`}>
              <select
                id={`state-${ticket.id}`}
                value={ticket.state}
                disabled={status.isPending}
                onChange={(event) =>
                  status.mutate(event.target.value as SupportState)
                }
              >
                {(Object.keys(labels.owner) as SupportState[]).map((state) => (
                  <option key={state} value={state}>
                    {labels.owner[state].label}
                  </option>
                ))}
              </select>
            </Field>
          )
        )}
      </div>
      {status.error && <ErrorState message={errorMessage(status.error)} />}
    </div>
  );
}
