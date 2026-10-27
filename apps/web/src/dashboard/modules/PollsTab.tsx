import { useState, type CSSProperties } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Icon,
  Input,
  Modal,
  RevealIcon,
  Segmented,
  animIcons,
  cx,
  renderDiscordText,
  useToast,
} from '../../ui';
import {
  api,
  pollCsv,
  pollDraftIssue,
  pollLengths,
  pollOptionId,
  pollRanges,
  pollResults,
  pollRowsIssue,
  pollRulesFrom,
  pollShowsResults,
  pollStatusName,
  pollVoteTargetMax,
  pollWinnerText,
  usePollActions,
  usePollList,
  usePollVoters,
  type Channel,
  type Poll,
  type PollDraft,
  type PollOption,
  type PollRules,
  type Polls,
  type PollsState,
  type Server,
  type StudioMessage,
} from '../../data';
import { DurationInput, Used } from './ARTriggers';
import { AnimatedIconButton, InfoTip, flashIssue } from './EditorBits';
import { EmojiField } from './EmojiPicker';
import { ChannelPicker } from './parts';
import { plusAnimations } from './StudioLibrary';
import {
  NONE,
  StyleChoice,
  anyRoles,
  pingItems,
  pollTimeFormat,
  tipped,
} from './PollSettings';

// Times -----------------------------------------------------------------------

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
/** "in 3 hours", "2 days ago". */
export function relative(at: number, now = Date.now()) {
  const diff = at - now;
  const abs = Math.abs(diff);
  const [unit, size] =
    abs < 3_600_000
      ? (['minute', 60_000] as const)
      : abs < 86_400_000
        ? (['hour', 3_600_000] as const)
        : (['day', 86_400_000] as const);
  return relativeFormat.format(Math.round(diff / size), unit);
}
const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
/** A time as a datetime-local input wants it, in the viewer's time zone. */
const localInput = (at: number) => {
  const d = new Date(at - new Date(at).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};
const inAnHour = () => {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

// The builder -----------------------------------------------------------------

type Builder = {
  question: string;
  options: PollOption[];
  channel: string;
  rules: PollRules;
  end: 'none' | 'after' | 'at';
  duration: string;
  endAt: string;
  post: 'now' | 'later';
  postAt: string;
};

const blankOption = (): PollOption => ({
  id: pollOptionId(),
  label: '',
  emoji: '',
});
/** A new poll, set up as the server's defaults say. */
const fresh = (c: Polls): Builder => ({
  question: '',
  options: [blankOption(), blankOption()],
  channel: c.channel,
  rules: pollRulesFrom(c),
  end: c.defaults.duration ? 'after' : 'none',
  duration: c.defaults.duration || '1d',
  endAt: localInput(inAnHour() + 86_400_000),
  post: 'now',
  postAt: localInput(inAnHour()),
});

/** What the builder holds, as the poll the server checks and saves. */
const draftOf = (b: Builder): PollDraft => ({
  question: b.question,
  options: b.options,
  channel: b.channel,
  rules: b.rules,
  end:
    b.end === 'after'
      ? { kind: 'after', duration: b.duration }
      : b.end === 'at'
        ? { kind: 'at', at: new Date(b.endAt).getTime() }
        : { kind: 'none' },
  postAt: b.post === 'later' ? new Date(b.postAt).getTime() : null,
});

const whole = (text: string, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number(text) || 0)));

function PollBuilder({
  server,
  config,
  data,
  pollMessage,
  resultsMessage,
}: {
  server: Server;
  config: Polls;
  data: PollsState;
  pollMessage: StudioMessage | null;
  resultsMessage: StudioMessage | null;
}) {
  const [b, setB] = useState<Builder>(() => fresh(config));
  const actions = usePollActions(server.id);
  const toast = useToast();
  const edit = (patch: Partial<Builder>) => setB((x) => ({ ...x, ...patch }));
  const rules = (patch: Partial<PollRules>) =>
    setB((x) => ({ ...x, rules: { ...x.rules, ...patch } }));
  const paused = !!server.paused;
  const full = data.open >= data.limits.active;
  const maxOptions = data.limits.options;
  const channel = data.channels.find((c) => c.id === b.channel);

  const point = (at: string, problem: string) => {
    toast({ tone: 'danger', title: 'Can’t post this poll yet', body: problem });
    if (at) requestAnimationFrame(() => flashIssue(at));
  };
  const submit = () => {
    if (b.end === 'at' && !b.endAt)
      return point('end', 'Pick when the poll ends.');
    if (b.post === 'later' && !b.postAt)
      return point('postAt', 'Pick when to post the poll.');
    const draft = draftOf(b);
    const issue =
      pollDraftIssue(draft, {
        plan: server.plan,
        now: Date.now(),
        active: data.open,
        roles: new Set(data.roles.map((r) => r.id)),
        channels: new Set(
          data.channels.filter((c) => c.canPost).map((c) => c.id),
        ),
      }) ??
      pollRowsIssue(pollMessage, b.rules.style, b.options.length) ??
      pollRowsIssue(resultsMessage, b.rules.style, b.options.length);
    if (issue) return point(issue.at, issue.problem);
    actions.create.mutate(draft, {
      onSuccess: async ({ poll }) => {
        setB(fresh(config));
        const where = `#${channel?.name ?? 'the channel'}`;
        if (poll.status === 'scheduled')
          return toast({
            title: `Poll #${poll.id} scheduled`,
            body: `Sparko posts it in ${where} on ${when(poll.postAt)}.`,
          });
        // The bot posts it; wait to hear whether Discord took it.
        const done = await api.waitForApply(server.id, 'polls');
        toast(
          done.status === 'live'
            ? {
                title: `Poll #${poll.id} posted`,
                body: `It’s live in ${where}.`,
              }
            : {
                tone: 'danger',
                title: `Sparko couldn’t post poll #${poll.id}`,
                body: done.message,
              },
        );
      },
      onError: (e) =>
        toast({
          tone: 'danger',
          title: 'Couldn’t make the poll',
          body: e.message,
        }),
    });
  };

  return (
    <section className="sp-card" aria-labelledby="pl-new">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="pl-new">
            New poll
          </h2>
          <p className="sp-card__sub">
            Ask a question, add the options, and post it now or later.
          </p>
        </div>
        <Used
          n={data.open}
          max={data.limits.active}
          what="polls running or scheduled"
          icon="poll"
        />
      </div>
      <fieldset className="sp-fieldset" disabled={paused}>
        <legend className="sp-sr-only">New poll</legend>
        <div className="sp-card__body">
          {full && (
            <p className="sp-edit-banner" role="status">
              <Icon name="info" size="sm" />
              <span>
                This plan runs up to {data.limits.active} polls at once. End or
                delete one below to make another.
              </span>
            </p>
          )}
          <div data-issue="question">
            <Input
              label="Question"
              placeholder="What should our next game night be?"
              maxLength={pollLengths.question}
              value={b.question}
              onChange={(e) => edit({ question: e.target.value })}
            />
          </div>
          <div className="sp-field" data-issue="options">
            <div className="sp-pl-options__head">
              <span className="sp-label">
                Options{' '}
                <InfoTip
                  text={`From 2 up to ${maxOptions} on this plan. Each one is a button or a menu option, with an emoji if you like.`}
                />
              </span>
              <Used
                n={b.options.length}
                max={maxOptions}
                what="options"
                icon="status"
              />
            </div>
            <ol className="sp-pl-options">
              {b.options.map((o, i) => (
                <li
                  key={o.id}
                  className="sp-pl-option"
                  data-issue={`option:${o.id}`}
                >
                  <span className="sp-pl-option__n sp-tnum">{i + 1}</span>
                  <EmojiField
                    serverId={server.id}
                    value={o.emoji}
                    label={`Option ${i + 1} emoji`}
                    onChange={(emoji) =>
                      edit({
                        options: b.options.map((x) =>
                          x.id === o.id ? { ...x, emoji } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`Option ${i + 1}`}
                    placeholder={`Option ${i + 1}`}
                    maxLength={pollLengths.option}
                    value={o.label}
                    onChange={(e) =>
                      edit({
                        options: b.options.map((x) =>
                          x.id === o.id ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="sp-icon-btn sp-icon-btn--danger"
                    aria-label={`Remove option ${i + 1}`}
                    disabled={b.options.length <= 2}
                    onClick={() =>
                      edit({ options: b.options.filter((x) => x.id !== o.id) })
                    }
                  >
                    <Icon name="trash-2" size="sm" />
                  </button>
                </li>
              ))}
            </ol>
            <div>
              <AnimatedIconButton
                size="sm"
                {...plusAnimations}
                disabled={b.options.length >= maxOptions}
                title={
                  b.options.length >= maxOptions
                    ? `This plan has up to ${maxOptions} options in a poll.`
                    : undefined
                }
                onClick={() => edit({ options: [...b.options, blankOption()] })}
              >
                Option
              </AnimatedIconButton>
            </div>
          </div>
          <div className="sp-ar__pair">
            <div data-issue="channel">
              <ChannelPicker
                label="Post in"
                channels={data.channels}
                value={b.channel}
                onChange={(id) => edit({ channel: id })}
              />
            </div>
            <StyleChoice
              value={b.rules.style}
              onChange={(style) => rules({ style })}
            />
          </div>
          <span className="sp-label">Vote rules</span>
          <div className="sp-ar__checks">
            <Checkbox
              checked={b.rules.anonymous}
              onChange={(anonymous) => rules({ anonymous })}
              label="Anonymous votes"
              description="Nobody can see who voted for what, not even staff."
            />
            <Checkbox
              checked={b.rules.multiple}
              onChange={(multiple) => rules({ multiple, maxPicks: 0 })}
              label="Multiple choice"
              description="Members can pick more than one option."
            />
            <Checkbox
              checked={b.rules.changeVotes}
              onChange={(changeVotes) => rules({ changeVotes })}
              label="Allow changing votes"
              description="Members can switch, or take a vote back by pressing it again."
            />
            <Checkbox
              checked={b.rules.hideResults}
              onChange={(hideResults) => rules({ hideResults })}
              label="Hide results until it ends"
              description="The message shows only how many voted until then."
            />
          </div>
          <div className="sp-ar__pair">
            <div data-issue="maxPicks">
              <Input
                label={tipped(
                  'Most picks per member',
                  'In a multiple-choice poll, how many options one member can pick. 0 or empty is any number.',
                )}
                aria-label="Most picks per member"
                type="number"
                min={0}
                max={b.options.length}
                placeholder="Any"
                disabled={!b.rules.multiple}
                value={
                  b.rules.multiple && b.rules.maxPicks
                    ? String(b.rules.maxPicks)
                    : ''
                }
                onChange={(e) =>
                  rules({ maxPicks: whole(e.target.value, 0, maxOptions) })
                }
              />
            </div>
            <div data-issue="roles">
              <Combobox
                label={tipped(
                  'Who can vote',
                  'Only members with one of these roles can vote. Leave it empty for everyone.',
                )}
                multiple
                placeholder="Everyone"
                searchPlaceholder="Search roles"
                value={b.rules.roles}
                onChange={(roles) => rules({ roles })}
                items={anyRoles(data.roles)}
              />
            </div>
          </div>
          <div className="sp-ar__pair">
            <div data-issue="ping">
              <Combobox
                label={tipped(
                  'Ping when posted',
                  'A role Sparko mentions as the poll is posted.',
                )}
                searchPlaceholder="Search roles"
                value={b.rules.ping || NONE}
                onChange={(v) => rules({ ping: v === NONE ? '' : v })}
                items={pingItems(data.roles)}
              />
            </div>
            <div data-issue="voteTarget">
              <Input
                label={tipped(
                  'End after this many votes',
                  'The poll ends as soon as this many members have voted. 0 or empty is off. Up to 100,000.',
                )}
                aria-label="End after this many votes"
                type="number"
                min={0}
                max={pollVoteTargetMax}
                placeholder="Off"
                value={b.rules.voteTarget ? String(b.rules.voteTarget) : ''}
                onChange={(e) =>
                  rules({
                    voteTarget: whole(e.target.value, 0, pollVoteTargetMax),
                  })
                }
              />
            </div>
          </div>
          <div className="sp-ar__pair">
            <div className="sp-field" data-issue="end">
              <span className="sp-label">
                Ends{' '}
                <InfoTip text="When the poll closes on its own and shows its results. Staff can end it early either way." />
              </span>
              <Segmented<Builder['end']>
                label="Ends"
                value={b.end}
                onChange={(end) => edit({ end })}
                options={[
                  { value: 'none', label: 'Never' },
                  { value: 'after', label: 'After a while' },
                  { value: 'at', label: 'At a time' },
                ]}
              />
              {b.end === 'after' && (
                <DurationInput
                  label="Runs for"
                  tip="From 1 minute up to 30 days, counted from when it’s posted."
                  value={b.duration}
                  placeholder="1d"
                  range={pollRanges.duration}
                  format={pollTimeFormat}
                  onChange={(duration) => edit({ duration })}
                />
              )}
              {b.end === 'at' && (
                <Input
                  aria-label="Ends at"
                  type="datetime-local"
                  value={b.endAt}
                  onChange={(e) => edit({ endAt: e.target.value })}
                />
              )}
            </div>
            <div className="sp-field" data-issue="postAt">
              <span className="sp-label">
                Post{' '}
                <InfoTip text="Post it straight away, or pick a time up to 60 days ahead. Scheduled polls count toward the plan’s polls at once." />
              </span>
              <Segmented<Builder['post']>
                label="Post"
                value={b.post}
                onChange={(post) => edit({ post })}
                options={[
                  { value: 'now', label: 'Now' },
                  { value: 'later', label: 'Later' },
                ]}
              />
              {b.post === 'later' && (
                <Input
                  aria-label="Post at"
                  type="datetime-local"
                  value={b.postAt}
                  onChange={(e) => edit({ postAt: e.target.value })}
                />
              )}
            </div>
          </div>
          <div className="sp-pl-builder__foot">
            <Button variant="ghost" onClick={() => setB(fresh(config))}>
              Clear
            </Button>
            <Button
              variant="primary"
              icon={b.post === 'later' ? 'calendar' : 'send'}
              loading={actions.create.isPending}
              disabled={paused || full}
              onClick={submit}
            >
              {b.post === 'later' ? 'Schedule poll' : 'Post poll'}
            </Button>
          </div>
        </div>
      </fieldset>
    </section>
  );
}

// The list --------------------------------------------------------------------

/** Each option's bar, share and votes; the winner marked once it ends. */
function Bars({ poll }: { poll: Poll }) {
  const { rows, winners } = pollResults(poll);
  const won = new Set(
    poll.status === 'ended'
      ? poll.picked
        ? [poll.picked]
        : winners.map((o) => o.id)
      : [],
  );
  return (
    <ul className="sp-pl-bars" aria-label={`Results of poll #${poll.id}`}>
      {rows.map((r) => (
        <li
          key={r.option.id}
          className={cx('sp-pl-bar', won.has(r.option.id) && 'is-winner')}
          style={{ '--pl-share': `${r.percent}%` } as CSSProperties}
        >
          <span className="sp-pl-bar__fill" aria-hidden />
          <span className="sp-pl-bar__label">
            {won.has(r.option.id) && (
              <Icon name="crown" size="sm" className="sp-pl-bar__crown" />
            )}
            {r.option.emoji && (
              <span className="sp-pl-bar__emoji">
                {renderDiscordText(r.option.emoji)}
              </span>
            )}
            {r.option.label}
          </span>
          <span className="sp-pl-bar__count sp-tnum">
            {r.percent}% · {r.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

const endedText = (p: Poll) =>
  p.endedWhy === 'votes'
    ? 'reached its votes'
    : p.endedWhy === 'staff'
      ? `ended by ${p.endedBy || 'staff'}`
      : 'its time ran out';

function PollCard({
  poll,
  server,
  channels,
  onVoters,
  onDelete,
}: {
  poll: Poll;
  server: Server;
  channels: Channel[];
  onVoters: () => void;
  onDelete: () => void;
}) {
  const actions = usePollActions(server.id);
  const toast = useToast();
  const paused = !!server.paused;
  const { tie } = pollResults(poll);
  const channel = channels.find((c) => c.id === poll.channelId);
  const url = poll.messageId
    ? `https://discord.com/channels/${server.id}/${poll.channelId}/${poll.messageId}`
    : null;
  const failed = (title: string) => (e: Error) =>
    toast({ tone: 'danger', title, body: e.message });
  const chips = [
    poll.rules.style === 'menu' ? 'Menu' : 'Buttons',
    poll.rules.anonymous && 'Anonymous',
    poll.rules.multiple &&
      (poll.rules.maxPicks
        ? `Pick up to ${poll.rules.maxPicks}`
        : 'Multiple choice'),
    poll.rules.hideResults && 'Hidden results',
    !poll.rules.changeVotes && 'Votes locked',
    poll.rules.roles.length > 0 && 'Some roles only',
    poll.rules.voteTarget > 0 && `Ends at ${poll.rules.voteTarget} votes`,
  ].filter((x): x is string => !!x);
  const exportCsv = async () => {
    try {
      const voters = poll.rules.anonymous
        ? null
        : (await api.pollVoters(server.id, poll.id)).voters;
      const blob = new Blob([pollCsv(poll, voters)], {
        type: 'text/csv;charset=utf-8',
      });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `poll-${poll.id}-votes.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      failed('Couldn’t export the votes')(e as Error);
    }
  };
  return (
    <li className={cx('sp-card sp-pl-card', `is-${poll.status}`)}>
      <div className="sp-pl-card__head">
        <div className="sp-pl-card__titles">
          <span className="sp-pl-card__title">
            <span className="sp-hint sp-tnum">#{poll.id}</span> {poll.question}
          </span>
          <span className="sp-pl-card__meta sp-hint">
            <span>
              <Icon name="hash" size="sm" />
              {channel?.name ?? 'deleted channel'}
            </span>
            <span>
              {poll.voters} {poll.voters === 1 ? 'vote' : 'votes'}
            </span>
            <span>
              {poll.status === 'scheduled'
                ? `Posts ${relative(poll.postAt)}`
                : poll.status === 'ended'
                  ? `Ended ${relative(poll.endedAt ?? poll.postAt)}, ${endedText(poll)}`
                  : poll.endsAt
                    ? `Ends ${relative(poll.endsAt)}`
                    : 'No end time'}
            </span>
            <span>by {poll.authorName}</span>
          </span>
        </div>
        <Badge
          size="sm"
          dot
          {...(poll.status === 'ended'
            ? {}
            : { tone: poll.status === 'active' ? 'success' : 'info' })}
        >
          {pollStatusName(poll)}
        </Badge>
      </div>
      <ul className="sp-pl-chips" aria-label="Rules">
        {chips.map((c) => (
          <li key={c} className="sp-pl-chip">
            {c}
          </li>
        ))}
      </ul>
      {poll.status === 'scheduled' ? (
        <ul className="sp-pl-preview-options">
          {poll.options.map((o) => (
            <li key={o.id} className="dc-btn">
              {o.emoji && (
                <span className="dc-emoji">{renderDiscordText(o.emoji)}</span>
              )}
              {o.label}
            </li>
          ))}
        </ul>
      ) : (
        <Bars poll={poll} />
      )}
      {poll.status === 'ended' && (
        <p className="sp-pl-card__winner">
          <Icon name="award" size="sm" />
          <span>
            <b>Winner:</b> {pollWinnerText(poll)}
          </span>
        </p>
      )}
      {poll.status === 'active' && !pollShowsResults(poll) && (
        <p className="sp-hint sp-pl-card__note">
          <Icon name="eye" size="sm" /> Only staff see these bars until the poll
          ends. Members see how many voted.
        </p>
      )}
      <div className="sp-pl-card__actions">
        {poll.status === 'active' && (
          <Button
            size="sm"
            icon="circle-pause"
            disabled={paused}
            loading={actions.end.isPending}
            onClick={() =>
              actions.end.mutate(poll.id, {
                onSuccess: () =>
                  toast({
                    title: `Ended poll #${poll.id}`,
                    body: 'Its message now shows the final results.',
                  }),
                onError: failed('Couldn’t end the poll'),
              })
            }
          >
            End now
          </Button>
        )}
        {poll.status === 'scheduled' && (
          <Button
            size="sm"
            icon="send"
            disabled={paused}
            loading={actions.postNow.isPending}
            onClick={() =>
              actions.postNow.mutate(poll.id, {
                onSuccess: () =>
                  toast({ title: `Posting poll #${poll.id} now` }),
                onError: failed('Couldn’t post the poll'),
              })
            }
          >
            Post now
          </Button>
        )}
        {poll.status === 'ended' && tie && (
          <Button
            size="sm"
            icon="refresh-cw"
            disabled={paused}
            loading={actions.reroll.isPending}
            onClick={() =>
              actions.reroll.mutate(poll.id, {
                onSuccess: ({ picked }) =>
                  toast({
                    title: `Picked “${picked.label}”`,
                    body: 'Chosen at random from the tie. The message shows it as the winner.',
                  }),
                onError: failed('Couldn’t reroll the tie'),
              })
            }
          >
            Reroll tie
          </Button>
        )}
        {poll.status !== 'scheduled' && !poll.rules.anonymous && (
          <Button size="sm" variant="ghost" icon="users" onClick={onVoters}>
            Voters
          </Button>
        )}
        {poll.status !== 'scheduled' && (
          <Button
            size="sm"
            variant="ghost"
            icon="file-text"
            onClick={() => void exportCsv()}
          >
            Export CSV
          </Button>
        )}
        {url && (
          <a
            className="sp-btn sp-btn--ghost sp-btn--sm"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external-link" />
            Open in Discord
          </a>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon="trash-2"
          className="sp-pl-card__delete"
          disabled={paused}
          aria-label={`Delete poll #${poll.id}`}
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

/** Who voted for what, by option. */
function VotersDialog({
  server,
  poll,
  onClose,
}: {
  server: Server;
  poll: Poll | null;
  onClose: () => void;
}) {
  const voters = usePollVoters(server.id, poll?.id ?? null);
  const list = voters.data?.voters ?? [];
  return (
    <Modal
      open={!!poll}
      onClose={onClose}
      icon="users"
      title={`Who voted on poll #${poll?.id ?? ''}`}
      description={poll?.question ?? ''}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {voters.isPending ? (
        <div className="sp-skel sp-skel--block" style={{ height: 120 }} />
      ) : !list.length ? (
        <p className="sp-hint">Nobody has voted yet.</p>
      ) : (
        <div className="sp-pl-voters">
          {poll?.options.map((o) => {
            const who = list.filter((v) => v.picks.includes(o.id));
            return (
              <section key={o.id} className="sp-pl-voters__group">
                <h3 className="sp-pl-voters__title">
                  {o.emoji && renderDiscordText(o.emoji)} {o.label}{' '}
                  <span className="sp-count">{who.length}</span>
                </h3>
                {who.length ? (
                  <ul className="sp-pl-voters__list">
                    {who.map((v) => (
                      <li key={v.userId}>
                        <span>{v.userName}</span>
                        <span className="sp-hint">{v.userId}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sp-hint">Nobody picked this.</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

type Filter = 'all' | 'active' | 'scheduled' | 'ended';

function PollList({
  server,
  config,
  channels,
}: {
  server: Server;
  config: Polls;
  channels: Channel[];
}) {
  const list = usePollList(server.id);
  const actions = usePollActions(server.id);
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [voters, setVoters] = useState<Poll | null>(null);
  const [deleting, setDeleting] = useState<Poll | null>(null);
  const polls = list.data?.polls ?? [];
  const shown = polls.filter((p) => filter === 'all' || p.status === filter);
  const count = (s: Filter) => polls.filter((p) => p.status === s).length;
  return (
    <section className="sp-card" aria-labelledby="pl-list">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="pl-list">
            Polls
          </h2>
          <p className="sp-card__sub">
            Running, scheduled and ended polls, with their results as votes come
            in.
          </p>
        </div>
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: `Running (${count('active')})` },
            { value: 'scheduled', label: `Scheduled (${count('scheduled')})` },
            { value: 'ended', label: `Ended (${count('ended')})` },
          ]}
        />
      </div>
      <div className="sp-card__body">
        {list.isPending ? (
          <div className="sp-skel sp-skel--block" style={{ height: 220 }} />
        ) : shown.length ? (
          <ul className="sp-pl-list">
            {shown.map((p) => (
              <PollCard
                key={p.id}
                poll={p}
                server={server}
                channels={channels}
                onVoters={() => setVoters(p)}
                onDelete={() => setDeleting(p)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={
              <RevealIcon
                anim={animIcons.storage}
                fallback="list-checks"
                size={28}
              />
            }
            title={filter === 'all' ? 'No polls yet' : 'No polls here'}
          >
            {filter === 'all'
              ? `Make one above, or with /${config.commands.name} ${config.commands.subs.create.name} in Discord.`
              : 'Pick another filter to see the rest.'}
          </EmptyState>
        )}
      </div>
      <VotersDialog
        server={server}
        poll={voters}
        onClose={() => setVoters(null)}
      />
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        icon="trash-2"
        title={`Delete poll #${deleting?.id ?? ''}?`}
        description="Its message is taken out of Discord and its votes are removed. This can’t be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actions.remove.isPending}
              onClick={() =>
                deleting &&
                actions.remove.mutate(deleting.id, {
                  onSuccess: () => {
                    toast({ title: `Deleted poll #${deleting.id}` });
                    setDeleting(null);
                  },
                  onError: (e) =>
                    toast({
                      tone: 'danger',
                      title: 'Couldn’t delete it',
                      body: e.message,
                    }),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </section>
  );
}

/** The Polls tab: the builder, then every poll. */
export function PollsTab(props: {
  server: Server;
  config: Polls;
  data: PollsState;
  pollMessage: StudioMessage | null;
  resultsMessage: StudioMessage | null;
}) {
  return (
    <div className="sp-stack sp-ar sp-pl">
      <PollBuilder {...props} />
      <PollList
        server={props.server}
        config={props.config}
        channels={props.data.channels}
      />
    </div>
  );
}
