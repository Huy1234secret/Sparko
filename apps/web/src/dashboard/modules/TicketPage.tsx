import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  DiscordMessage,
  EmptyState,
  Icon,
  Modal,
  Notice,
  Segmented,
  Switch,
  Textarea,
  renderDiscordText,
  useToast,
} from '../../ui';
import {
  useSession,
  useTicket,
  useTicketActions,
  useTicketList,
  useTicketsConfig,
  useBackend,
  ticketTranscriptUrl,
  type Person,
  type TicketDetail,
  type TicketMessage,
  type TicketPriority,
} from '../../data';
import { isMac, useCurrentServer, useDashboardTitle } from '../shared';
import { PausedNotice } from './frame';
import { priorityInfo, StatusBadge } from './TicketsModule';

const closeReasons = [
  ['Solved', 'The member got what they needed.'],
  ['Duplicate', 'Another ticket covers this.'],
  ['No reply from the member', 'They stopped answering.'],
  ['Not a support issue', 'Better handled somewhere else.'],
  ['Something else', 'Explain below.'],
] as const;
type CloseReason = (typeof closeReasons)[number][0];

function CloseModal({
  ticket,
  open,
  busy,
  onClose,
  onConfirm,
}: {
  ticket: TicketDetail;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (close: { reason: string; detail: string; dm: boolean }) => void;
}) {
  const [reason, setReason] = useState<CloseReason>('Solved');
  const [note, setNote] = useState('');
  const [dm, setDm] = useState(true);
  const [tried, setTried] = useState(false);
  const other = reason === 'Something else';
  const bad = tried && other && !note.trim();
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      icon="circle-check"
      title={`Close ticket #${ticket.number}?`}
      description="The thread is locked so nobody can write in it. You can reopen it later."
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            loadingLabel="Saving transcript…"
            onClick={() => {
              setTried(true);
              if (other && !note.trim()) return;
              onConfirm({
                reason: other ? note.trim() : reason,
                detail: other ? '' : note.trim(),
                dm,
              });
            }}
          >
            Close ticket
          </Button>
        </>
      }
    >
      <div className="sp-stack" style={{ gap: 16 }}>
        <fieldset className="sp-fieldset" style={{ display: 'grid' }}>
          <legend className="sp-label" style={{ marginBottom: 4 }}>
            Why are you closing it?
          </legend>
          {closeReasons.map(([label, description]) => (
            <label
              key={label}
              className="sp-check sp-check--radio"
              style={{ padding: '8px 0' }}
            >
              <input
                className="sp-choice-input"
                type="radio"
                name="close-reason"
                checked={reason === label}
                onChange={() => setReason(label)}
              />
              <span className="sp-check__box" />
              <span className="sp-check__text">
                {label}
                <span className="sp-check__desc">{description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Textarea
          label={other ? 'Reason' : 'Note for the transcript (optional)'}
          rows={2}
          maxLength={500}
          value={note}
          error={
            bad ? 'Add a short reason so the team knows what happened.' : null
          }
          onChange={(e) => setNote(e.target.value)}
        />
        <Switch
          checked={dm}
          onChange={setDm}
          label={`Tell ${ticket.member} by DM`}
          description="They get your reason. Staff notes are never shared."
        />
      </div>
    </Modal>
  );
}

function AssignMenu({
  ticket,
  staff,
  you,
  disabled,
  onPick,
}: {
  ticket: TicketDetail;
  staff: { name: string; color: Person['color'] }[];
  you: string;
  disabled: boolean;
  onPick: (assignee: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tickets = useTicketList(useCurrentServer().serverId).data ?? [];
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const assignee = staff.find((s) => s.name === ticket.assignee);
  const label = !ticket.assignee
    ? 'Assign'
    : ticket.assignee === 'You'
      ? 'Assigned to you'
      : `Assigned to ${ticket.assignee}`;
  const options = [
    ...staff.map((s) => ({
      value: s.name as string | null,
      label: s.name === 'You' ? `Me (${you})` : s.name,
      color: s.color,
      meta: `${tickets.filter((t) => t.status !== 'closed' && t.assignee === s.name).length} open`,
    })),
    { value: null, label: 'Nobody', color: undefined, meta: '' },
  ];
  return (
    <div className="sp-menu-anchor" ref={root}>
      <Button
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {assignee ? (
          <Avatar
            name={assignee.name === 'You' ? you : assignee.name}
            color={assignee.color}
            size="xs"
          />
        ) : (
          <Icon name="user-plus" />
        )}
        {label}
        <Icon name="chevron-down" size="sm" />
      </Button>
      {open && (
        <div
          className="sp-popover sp-menu sp-assign-menu"
          role="listbox"
          aria-label={`Assign ticket ${ticket.number}`}
        >
          <div className="sp-option-group">Assign to</div>
          {options.map((o) => {
            const selected = ticket.assignee === o.value;
            return (
              <button
                key={o.label}
                type="button"
                className="sp-option"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onPick(o.value);
                }}
              >
                {o.color ? (
                  <Avatar
                    name={o.value === 'You' ? you : o.label}
                    color={o.color}
                    size="xs"
                  />
                ) : (
                  <Icon name="user-x" />
                )}
                <span className="sp-option__label">{o.label}</span>
                {o.meta && <span className="sp-option__meta">{o.meta}</span>}
                {selected && (
                  <span className="sp-option__check">
                    <Icon name="check" />
                  </span>
                )}
              </button>
            );
          })}
          <div className="sp-popover__foot">
            They get a DM and the ticket shows in their inbox.
          </div>
        </div>
      )}
    </div>
  );
}

function Message({
  ticket,
  message,
}: {
  ticket: TicketDetail;
  message: TicketMessage;
}) {
  if (message.kind === 'note')
    return (
      <div className="sp-staff-note">
        <span className="sp-staff-note__head">
          <Icon name="lock" size="sm" />
          Staff note from {message.author} · members can’t see this
          <span className="sp-staff-note__time">{message.at}</span>
        </span>
        <span>{message.text}</span>
      </div>
    );
  if (message.kind === 'opener')
    return (
      <DiscordMessage
        time={message.at}
        content={
          <>
            <span className="dc-mention">@{ticket.member}</span> {message.text}
          </>
        }
        embed={{
          color: '#FACC15',
          title: `Ticket #${ticket.number}`,
          fields: [
            {
              name: 'Opened by',
              value: <span className="dc-mention">@{ticket.member}</span>,
              inline: true,
            },
            { name: 'Topic', value: ticket.category, inline: true },
          ],
        }}
      />
    );
  return (
    <DiscordMessage
      author={message.author}
      avatarColor={message.authorColor}
      bot={false}
      time={message.at}
      content={renderDiscordText(message.text)}
    >
      {message.file && (
        <div className="sp-dc-file">
          <Icon name="image" />
          {message.file}
        </div>
      )}
    </DiscordMessage>
  );
}

function Composer({
  ticket,
  disabled,
  onSent,
}: {
  ticket: TicketDetail;
  disabled: boolean;
  onSent: (note: boolean) => void;
}) {
  const server = useCurrentServer().serverId;
  const { send } = useTicketActions(server, ticket.number);
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [draft, setDraft] = useState('');
  const toast = useToast();
  const note = mode === 'note';
  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(
      { text, note },
      {
        onSuccess: () => {
          setDraft('');
          onSent(note);
        },
        onError: (e) =>
          toast({
            tone: 'danger',
            title: note ? 'Note didn’t save' : 'Reply didn’t send',
            body: e instanceof Error ? e.message : 'Try again in a moment.',
          }),
      },
    );
  };
  return (
    <div className="sp-composer">
      <div className="sp-composer__row">
        <Segmented
          label="Message type"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'reply',
              label: (
                <>
                  <Icon name="message-square" size="sm" />
                  Reply
                </>
              ),
            },
            {
              value: 'note',
              label: (
                <>
                  <Icon name="lock" size="sm" />
                  Staff note
                </>
              ),
            },
          ]}
        />
        <span className="sp-hint">
          {note
            ? 'Only staff see notes. They stay out of the member’s transcript.'
            : `${ticket.member} gets this in the ticket thread.`}
        </span>
      </div>
      <div
        className={
          'sp-input sp-input--multiline' + (disabled ? ' is-disabled' : '')
        }
      >
        <textarea
          rows={3}
          maxLength={2000}
          disabled={disabled}
          aria-label={note ? 'Staff note' : `Reply to ${ticket.member}`}
          placeholder={
            note ? 'Write a note for the team' : `Message @${ticket.member}`
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <div className="sp-composer__row">
        <span className="sp-hint sp-kbd-group">
          <span className="sp-kbd">{isMac() ? '⌘' : 'Ctrl'}</span>
          <span className="sp-kbd">Enter</span>
          to send
        </span>
        <Button
          variant="primary"
          icon={note ? 'lock' : 'send'}
          loading={send.isPending}
          disabled={disabled || !draft.trim()}
          onClick={submit}
        >
          {note ? 'Add note' : 'Send reply'}
        </Button>
      </div>
    </div>
  );
}

function PersonCard({ heading, person }: { heading: string; person: Person }) {
  return (
    <section className="sp-card" aria-label={`${heading}: ${person.name}`}>
      <div className="sp-card__body" style={{ gap: 14 }}>
        <span className="sp-page-head__eyebrow" style={{ margin: 0 }}>
          {heading}
        </span>
        <div className="sp-person">
          <Avatar name={person.name} color={person.color} size="lg" />
          <span className="sp-person__text">
            <b className="sp-person__name">{person.name}</b>
            {person.newAccount && (
              <Badge tone="warning" size="sm">
                New account
              </Badge>
            )}
          </span>
        </div>
        <dl className="sp-facts">
          <dt>Joined</dt>
          <dd>{person.joined}</dd>
          <dt>Account</dt>
          <dd>{person.account}</dd>
          <dt>Roles</dt>
          <dd>{person.roles}</dd>
        </dl>
      </div>
    </section>
  );
}

export function TicketPage() {
  const { ticketNumber = '' } = useParams();
  const number = Number(ticketNumber);
  const { server } = useCurrentServer();
  const serverId = server?.id ?? '';
  const ticket = useTicket(serverId, number);
  const config = useTicketsConfig(serverId);
  const actions = useTicketActions(serverId, number);
  const session = useSession().data;
  const [closeOpen, setCloseOpen] = useState(false);
  const live = !!useBackend().data?.live;
  const toast = useToast();
  const log = useRef<HTMLDivElement>(null);
  useDashboardTitle(`Ticket #${ticketNumber}`, server?.name);
  const count = ticket.data?.messages.length;
  useEffect(() => {
    log.current?.scrollTo?.(0, log.current.scrollHeight);
  }, [count]);

  if (!server) return null;
  const back = (
    <Link
      className="sp-link-btn sp-back-link"
      to={`/dashboard/${server.id}/tickets?tab=items`}
    >
      <Icon name="arrow-left" size="sm" />
      All tickets
    </Link>
  );
  if (ticket.isPending)
    return (
      <div className="sp-stack" aria-busy="true" aria-label="Loading">
        <span className="sp-skel sp-skel--title" />
        <div className="sp-skel sp-skel--block" style={{ height: 420 }} />
      </div>
    );
  if (ticket.isError)
    return (
      <div className="sp-stack">
        {back}
        <div className="sp-card">
          <EmptyState icon="ticket" title={`Ticket #${ticketNumber} not found`}>
            It may have been deleted, or the link is from another server.
          </EmptyState>
        </div>
      </div>
    );

  const t = ticket.data;
  const you = session?.user.name ?? 'you';
  const closed = t.status === 'closed';
  const paused = !!server.paused;
  const locked = paused || closed;
  const otherClaim = !closed && !!t.assignee && t.assignee !== 'You';
  const fail = (e: unknown) =>
    toast({
      tone: 'danger',
      title: 'That didn’t save',
      body: e instanceof Error ? e.message : 'Try again in a moment.',
    });
  const assign = (assignee: string | null) =>
    actions.update.mutate(
      { assignee },
      {
        onSuccess: () =>
          toast({
            tone: 'success',
            title: assignee
              ? assignee === 'You'
                ? `You’re handling #${t.number}`
                : `Assigned #${t.number} to ${assignee}`
              : `#${t.number} is unassigned`,
            body:
              assignee && assignee !== 'You'
                ? `${assignee} got a DM about it.`
                : 'It shows in Needs a reply for the whole team.',
          }),
        onError: fail,
      },
    );
  const reopen = () =>
    actions.reopen.mutate(undefined, {
      onSuccess: () =>
        toast({
          tone: 'success',
          title: `Ticket #${t.number} reopened`,
          body: `${t.member} can reply in the thread again.`,
        }),
      onError: fail,
    });

  return (
    <>
      <header className="sp-ticket-head">
        {back}
        <div className="sp-ticket-head__row">
          <div className="sp-ticket-head__titles">
            <div className="sp-page-head__eyebrow">
              Ticket #{t.number} · {t.category}
            </div>
            <h1 className="sp-page-head__title">{t.topic}</h1>
            <div className="sp-ticket-head__meta">
              <span role="status">
                <StatusBadge status={t.status} />
              </span>
              <span className="sp-hint">
                Opened by {t.member} · {t.openedAt}
              </span>
            </div>
          </div>
          <div className="sp-ticket-head__actions">
            <div className="sp-input sp-input--select sp-priority-select">
              <select
                aria-label="Priority"
                value={t.priority}
                disabled={locked}
                onChange={(e) =>
                  actions.update.mutate(
                    { priority: e.target.value as TicketPriority },
                    { onError: fail },
                  )
                }
              >
                {(Object.keys(priorityInfo) as TicketPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {priorityInfo[p].label} priority
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" className="sp-input__chev" />
            </div>
            <AssignMenu
              ticket={t}
              staff={config.data?.staff ?? []}
              you={you}
              disabled={locked}
              onPick={assign}
            />
            {closed ? (
              <Button
                icon="rotate-ccw"
                disabled={paused}
                loading={actions.reopen.isPending}
                onClick={reopen}
              >
                Reopen
              </Button>
            ) : (
              <Button
                variant="primary"
                icon="circle-check"
                disabled={paused}
                onClick={() => setCloseOpen(true)}
              >
                Close ticket
              </Button>
            )}
          </div>
        </div>
      </header>
      <PausedNotice server={server} />
      {otherClaim && (
        <Notice
          tone="info"
          title={`${t.assignee} is handling this ticket`}
          actions={
            <button
              type="button"
              className="sp-link-btn"
              disabled={paused}
              onClick={() => assign('You')}
            >
              Take over
            </button>
          }
        >
          You can still reply. If {t.assignee} is away, take it over so{' '}
          {t.member} isn’t answered twice.
        </Notice>
      )}
      <div className="sp-split sp-split--wide">
        <section className="sp-card sp-thread" aria-labelledby="th-h">
          <div className="sp-thread__head">
            <h2 id="th-h" className="sp-thread__title">
              <Icon name="hash" size="sm" />
              ticket-{t.number}
            </h2>
            <span className="sp-hint">Private thread in #support</span>
          </div>
          <div
            ref={log}
            className="dc-chat sp-thread__log"
            role="log"
            aria-label={`Messages in ticket ${t.number}`}
          >
            {t.messages.map((m) => (
              <Message key={m.id} ticket={t} message={m} />
            ))}
          </div>
          {closed ? (
            <div className="sp-thread__closed">
              <Icon name="archive" />
              <span className="sp-thread__closed-text">
                <b>
                  Closed by {t.closedBy === 'You' ? 'you' : t.closedBy} ·{' '}
                  {t.closeReason ?? 'Solved'}.
                </b>{' '}
                The thread is locked. You can download the transcript any time.
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon="download"
                onClick={() =>
                  live
                    ? window.location.assign(
                        ticketTranscriptUrl(server.id, t.number),
                      )
                    : toast({
                        title: `Transcript #${t.number} would download`,
                        body: 'An HTML file with every message. Staff notes are included for staff copies only.',
                      })
                }
              >
                Transcript
              </Button>
            </div>
          ) : (
            <Composer
              ticket={t}
              disabled={paused}
              onSent={(note) =>
                note ||
                toast({
                  tone: 'success',
                  title: 'Reply sent',
                  body: `${t.member} sees it in the thread.`,
                })
              }
            />
          )}
        </section>
        <aside className="sp-stack sp-sticky-lg" aria-label="Ticket details">
          {t.people.map((p) => (
            <PersonCard key={p.heading} {...p} />
          ))}
          <section className="sp-card" aria-label="About this ticket">
            <div className="sp-card__body" style={{ gap: 12 }}>
              <span className="sp-page-head__eyebrow" style={{ margin: 0 }}>
                About this ticket
              </span>
              <dl className="sp-facts">
                <dt>Opened</dt>
                <dd>{t.openedAt}</dd>
                <dt>From</dt>
                <dd>Help panel in #support</dd>
                <dt>Handled by</dt>
                <dd>{t.assignee ?? 'Nobody yet'}</dd>
                <dt>Transcript</dt>
                <dd>Download it here once closed</dd>
              </dl>
            </div>
          </section>
        </aside>
      </div>
      <CloseModal
        key={String(closeOpen)}
        ticket={t}
        open={closeOpen}
        busy={actions.close.isPending}
        onClose={() => setCloseOpen(false)}
        onConfirm={({ dm, ...close }) =>
          actions.close.mutate(
            { ...close, dm },
            {
              onSuccess: () => {
                setCloseOpen(false);
                toast({
                  tone: 'success',
                  title: `Ticket #${t.number} closed`,
                  body: `The thread is locked.${dm ? ` ${t.member} got the reason by DM.` : ''}`,
                });
              },
              onError: fail,
            },
          )
        }
      />
    </>
  );
}
