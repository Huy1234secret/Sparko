import { useEffect, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Icon,
  Input,
  Modal,
  Switch,
  cx,
  useToast,
  type ComboItem,
} from '../../ui';
import {
  invMax,
  invRanges,
  useInviteActions,
  useInviteBoard,
  useInviteCodes,
  useInviteFind,
  useInviteMember,
  type Channel,
  type INVFound,
  type INVJoin,
  type INVRow,
  type InvKind,
  type Invites,
  type RoleOption,
  type Server,
} from '../../data';
import { AnimatedIconButton, InfoTip } from './EditorBits';
import { DurationInput, Used } from './ARTriggers';
import { ChannelPicker, newId, roleItems } from './parts';
import { plusAnimations } from './StudioLibrary';

/** A label with an (i) beside it that says more on hover. */
const tipped = (text: string, tip: string): ReactNode => (
  <>
    {text} <InfoTip text={tip} />
  </>
);

/** Roles for "who can" pickers; Sparko doesn't give them, so any can be picked. */
const anyRoles = (roles: RoleOption[]): ComboItem[] =>
  roleItems(roles.map((r) => ({ ...r, assignable: true })));

const n = (v: number) => v.toLocaleString('en-US');

const messageAbout: Record<InvKind, { title: string; tip: string }> = {
  join: {
    title: 'Join message',
    tip: 'Posted when someone joins, saying who invited them, with which invite and the inviter’s new total. Edit it in the Edit tab.',
  },
  leave: {
    title: 'Leave message',
    tip: 'Posted when someone leaves, saying who had invited them and the inviter’s new total. Edit it in the Edit tab.',
  },
};

/** The Settings tab: counting rules, messages, reward roles and staff. */
export function INVSettings({
  config,
  channels,
  roles,
  limits,
  onChange,
}: {
  config: Invites;
  channels: Channel[];
  roles: RoleOption[];
  limits: { rewards: number };
  onChange: (patch: Partial<Invites>) => void;
}) {
  const full = config.rewards.length >= limits.rewards;
  const editReward = (id: string, patch: Partial<Invites['rewards'][number]>) =>
    onChange({
      rewards: config.rewards.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    });
  return (
    <div className="sp-stack sp-ar sp-inv">
      <section className="sp-card" aria-labelledby="inv-count">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="inv-count">
              Counting
            </h2>
            <p className="sp-card__sub">
              What counts as an invite. Total = regular − left − fake + bonus.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div data-issue="fakeAge" className="sp-inv-age">
            <DurationInput
              label="Fake account age"
              tip="Members whose Discord account is younger than this count as fake. Use h, d, w, mt and y, like 7d. Leave it empty to count nobody as fake."
              value={config.fakeAge}
              placeholder="Nobody is fake"
              range={invRanges.fakeAge}
              format="Use h, d, w, mt and y, like 7d or 2w."
              onChange={(fakeAge) => onChange({ fakeAge })}
            />
          </div>
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.subtractLeaves}
              onChange={(subtractLeaves) => onChange({ subtractLeaves })}
              label="Take off members who leave"
              description="An inviter loses the invite when the member they invited leaves."
            />
            <Checkbox
              checked={config.subtractFakes}
              onChange={(subtractFakes) => onChange({ subtractFakes })}
              label="Take off fake accounts"
              description="Members with an account younger than the fake account age don’t count. A fake who left is only taken off once."
            />
            <Checkbox
              checked={config.countRejoins}
              onChange={(countRejoins) => onChange({ countRejoins })}
              label="Count members who rejoin"
              description="Off: someone who leaves and comes back counts once, for whoever invited them first. On: each join counts for that invite’s inviter."
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="inv-messages">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="inv-messages">
              Join and leave messages
            </h2>
            <p className="sp-card__sub">
              Where Sparko says who invited whom. Edit how they look in the Edit
              tab.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <ul className="sp-sg-commands sp-inv-messages">
            {(['join', 'leave'] as const).map((k) => {
              const m = config[k];
              const channel = channels.find((c) => c.id === m.channel);
              return (
                <li
                  key={k}
                  className={cx('sp-sg-command', !m.on && 'is-off')}
                  data-issue={`${k}:channel`}
                >
                  <div className="sp-sg-command__head">
                    <span className="sp-sg-command__title">
                      <Icon
                        name={k === 'join' ? 'user-plus' : 'user-x'}
                        size="sm"
                      />
                      {messageAbout[k].title}
                      <InfoTip text={messageAbout[k].tip} />
                    </span>
                    <Switch
                      checked={m.on}
                      onChange={(on) => onChange({ [k]: { ...m, on } })}
                      description={`${messageAbout[k].title} on or off`}
                    />
                  </div>
                  <div className="sp-inv-channel">
                    <ChannelPicker
                      label="Channel"
                      channels={channels}
                      value={m.channel}
                      onChange={(id) =>
                        onChange({ [k]: { ...m, channel: id } })
                      }
                      error={
                        channel && !channel.canPost && m.on
                          ? 'Sparko can’t post here yet.'
                          : undefined
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="inv-rewards"
        data-issue="rewards"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="inv-rewards">
              Reward roles
            </h2>
            <p className="sp-card__sub">
              Roles inviters get when their total reaches a number.
            </p>
          </div>
          <div className="sp-ar__head-actions">
            <Used
              n={config.rewards.length}
              max={limits.rewards}
              what="reward roles"
              icon="gift"
            />
            <AnimatedIconButton
              size="sm"
              {...plusAnimations}
              disabled={full}
              title={
                full
                  ? `This plan has up to ${limits.rewards} reward roles.`
                  : undefined
              }
              onClick={() => {
                const top = Math.max(
                  0,
                  ...config.rewards.map((r) => r.invites),
                );
                onChange({
                  rewards: [
                    ...config.rewards,
                    { id: newId(), invites: top ? top + 5 : 5, role: '' },
                  ],
                });
              }}
            >
              Reward
            </AnimatedIconButton>
          </div>
        </div>
        <div className="sp-card__body">
          {config.rewards.length ? (
            <ul className="sp-ar__list">
              {config.rewards.map((r, i) => (
                <li
                  key={r.id}
                  className="sp-ar__item sp-ar__timed"
                  aria-label={`Reward ${i + 1}`}
                  data-issue={`reward:${r.id}`}
                >
                  <h3 className="sp-ar__item-title">Reward {i + 1}</h3>
                  <Input
                    label={tipped(
                      'Invites',
                      `The total an inviter needs, from 1 to ${n(invMax.tier)}.`,
                    )}
                    aria-label="Invites"
                    type="number"
                    min={1}
                    max={invMax.tier}
                    value={r.invites ? String(r.invites) : ''}
                    onChange={(e) =>
                      editReward(r.id, {
                        invites: Math.min(
                          invMax.tier,
                          Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        ),
                      })
                    }
                  />
                  <Combobox
                    label="Role"
                    placeholder="Pick a role"
                    searchPlaceholder="Search roles"
                    value={r.role}
                    onChange={(role) => editReward(r.id, { role })}
                    items={roleItems(roles, [r.role])}
                  />
                  <button
                    type="button"
                    className="sp-icon-btn sp-icon-btn--danger"
                    aria-label={`Remove reward ${i + 1}`}
                    onClick={() =>
                      onChange({
                        rewards: config.rewards.filter((x) => x.id !== r.id),
                      })
                    }
                  >
                    <Icon name="trash-2" size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sp-hint">
              No reward roles yet. Add one to thank your best inviters.
            </p>
          )}
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.stackRewards}
              onChange={(stackRewards) => onChange({ stackRewards })}
              label="Keep every reward earned"
              description="Off: inviters only keep their highest reward, and lower ones are taken off."
            />
            <Checkbox
              checked={config.removeRewards}
              onChange={(removeRewards) => onChange({ removeRewards })}
              label="Take rewards back below their number"
              description="When leaves, fakes or a reset bring someone’s total under a reward, Sparko takes its role back."
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="inv-staff">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="inv-staff">
              Staff
            </h2>
            <p className="sp-card__sub">
              Who can give bonus invites and reset counts with the command.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div data-issue="staff" className="sp-inv-staff">
            <Combobox
              label={tipped(
                'Who can manage invites',
                'These roles can use the bonus and reset commands. Leave it empty for members with Manage Server.',
              )}
              multiple
              placeholder="Manage Server only"
              searchPlaceholder="Search roles"
              value={config.staff}
              onChange={(staff) => onChange({ staff })}
              items={anyRoles(roles)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// Storage ---------------------------------------------------------------------

const when = (at: number) =>
  new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const expiresText = (at: number | null, now: number) => {
  if (at === null) return 'Never';
  const hours = Math.round((at - now) / 3_600_000);
  return hours < 48
    ? `In ${Math.max(1, hours)}h`
    : `In ${Math.round(hours / 24)} days`;
};

/** How a join reads in a list: left, fake, not counted. */
function JoinBadges({ j }: { j: INVJoin }) {
  return (
    <>
      {j.leftAt !== null && <Badge size="sm">Left</Badge>}
      {j.fake && (
        <Badge size="sm" tone="warning">
          Fake
        </Badge>
      )}
      {!j.counted && j.inviterId && <Badge size="sm">Not counted</Badge>}
    </>
  );
}

/** Add or take bonus invites, for a member found or picked. */
function BonusForm({
  server,
  who: picked,
  onClose,
}: {
  server: Server;
  who: { userId: string; name: string; avatar: string } | null;
  onClose: () => void;
}) {
  const [who, setWho] = useState(picked);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [tried, setTried] = useState(false);
  const found = useInviteFind(server.id, query);
  const actions = useInviteActions(server.id);
  const toast = useToast();
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);
  const value = Number(amount);
  const problem = !who
    ? 'Pick the member first.'
    : !amount.trim() || !Number.isInteger(value) || !value
      ? 'Write a whole number of invites, but not 0. Use a negative number to take some away.'
      : Math.abs(value) > invMax.bonus
        ? `Write a number from -${n(invMax.bonus)} to ${n(invMax.bonus)}.`
        : null;
  const save = () => {
    setTried(true);
    if (problem || !who) return;
    actions.bonus.mutate(
      { userId: who.userId, amount: value },
      {
        onSuccess: (d) => {
          toast({
            title: `${value > 0 ? 'Gave' : 'Took'} ${who.name} ${value > 0 ? '' : 'away '}${n(Math.abs(value))} bonus ${Math.abs(value) === 1 ? 'invite' : 'invites'}`,
            body: `They have ${n(d.member.total)} now.`,
          });
          onClose();
        },
        onError: (e) =>
          toast({
            tone: 'danger',
            title: 'Couldn’t change it',
            body: e.message,
          }),
      },
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      icon="plus"
      title={picked ? `Bonus invites for ${picked.name}` : 'Add bonus invites'}
      description="Bonus invites add to the total and count toward reward roles."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={actions.bonus.isPending}
            onClick={save}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="sp-stack sp-bd-form">
        {!picked &&
          (who ? (
            <div className="sp-bd-picked">
              <img
                className="sp-bd-avatar"
                src={who.avatar || undefined}
                alt=""
              />
              <span className="sp-bd-row__name">{who.name}</span>
              <span className="sp-hint sp-tnum">{who.userId}</span>
              <Button size="sm" variant="ghost" onClick={() => setWho(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="sp-stack sp-bd-find">
              <Input
                label={tipped(
                  'Member',
                  'Search by their name or paste their user ID.',
                )}
                icon="search"
                aria-label="Find a member"
                placeholder="Name or user ID"
                value={typed}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
              />
              {query.trim() && (
                <ul className="sp-bd-found" aria-label="Members found">
                  {(found.data ?? []).map((m: INVFound) => (
                    <li key={m.userId}>
                      <button
                        type="button"
                        className="sp-bd-found__item"
                        onClick={() => setWho(m)}
                      >
                        <img className="sp-bd-avatar" src={m.avatar} alt="" />
                        <span className="sp-bd-row__name">{m.name}</span>
                        <span className="sp-hint sp-tnum">{m.userId}</span>
                        <Badge size="sm" className="sp-bd-found__saved">
                          {n(m.total)} {m.total === 1 ? 'invite' : 'invites'}
                        </Badge>
                      </button>
                    </li>
                  ))}
                  {found.isSuccess && !found.data.length && (
                    <li className="sp-hint sp-bd-found__none">
                      Nobody in the server matches “{query.trim()}”.
                    </li>
                  )}
                </ul>
              )}
            </div>
          ))}
        <Input
          label={tipped(
            'Bonus invites',
            'A negative number takes bonus invites away, like -2.',
          )}
          aria-label="Bonus invites"
          type="number"
          min={-invMax.bonus}
          max={invMax.bonus}
          placeholder="5"
          value={amount}
          onChange={(e) => setAmount(e.target.value.slice(0, 7))}
        />
        {tried && problem && (
          <p className="sp-field-error">
            <Icon name="circle-alert" />
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** One member: their counts, who invited them and who they invited. */
function MemberPanel({
  server,
  userId,
  paused,
  onBonus,
  onReset,
}: {
  server: Server;
  userId: string | null;
  paused: boolean;
  onBonus: (who: { userId: string; name: string; avatar: string }) => void;
  onReset: (who: { userId: string; name: string }) => void;
}) {
  const detail = useInviteMember(server.id, userId);
  const d = detail.data;
  return (
    <section className="sp-card sp-inv-member" aria-labelledby="inv-member">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="inv-member">
            {d ? d.member.name : 'Member'}
          </h2>
          <p className="sp-card__sub">
            {d
              ? 'Who invited them, and who they invited.'
              : 'Pick someone on the leaderboard.'}
          </p>
        </div>
      </div>
      {!userId ? (
        <EmptyState icon="users" title="Nobody picked">
          Pick a member on the leaderboard, or search for anyone, to see who
          invited them and who they invited.
        </EmptyState>
      ) : !d ? (
        <div className="sp-card__body">
          <div className="sp-skel sp-skel--block" style={{ height: 180 }} />
        </div>
      ) : (
        <div className="sp-card__body sp-stack">
          <dl className="sp-inv-counts">
            {(
              [
                ['Regular', d.member.regular],
                ['Left', d.member.left],
                ['Fake', d.member.fake],
                ['Bonus', d.member.bonus],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="sp-inv-count">
                <dt>{label}</dt>
                <dd className="sp-tnum">{n(v)}</dd>
              </div>
            ))}
            <div className="sp-inv-count is-total">
              <dt>Total</dt>
              <dd className="sp-tnum">{n(d.member.total)}</dd>
            </div>
          </dl>
          <div className="sp-inv-member__actions">
            <Button
              size="sm"
              icon="plus"
              disabled={paused}
              onClick={() => onBonus(d.member)}
            >
              Bonus
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="rotate-ccw"
              disabled={paused}
              onClick={() => onReset(d.member)}
            >
              Reset
            </Button>
          </div>
          <div className="sp-inv-by">
            <h3 className="sp-bd-month__title">Invited by</h3>
            <p className="sp-inv-by__text">
              {!d.invitedBy ? (
                'Sparko hasn’t seen them join since tracking was turned on.'
              ) : d.invitedBy.type === 'vanity' ? (
                <>The vanity link, {when(d.invitedBy.joinedAt)}</>
              ) : d.invitedBy.inviterId ? (
                <>
                  <b>{d.invitedBy.inviterName}</b> with{' '}
                  <code>{d.invitedBy.code}</code>, {when(d.invitedBy.joinedAt)}
                </>
              ) : (
                <>Unknown invite, {when(d.invitedBy.joinedAt)}</>
              )}
            </p>
          </div>
          <div className="sp-inv-by">
            <h3 className="sp-bd-month__title">
              Invited
              <span className="sp-hint sp-tnum">{d.invited.length}</span>
            </h3>
            {d.invited.length ? (
              <ul
                className="sp-bd-rows sp-inv-invited"
                aria-label="Members they invited"
              >
                {d.invited.map((j) => (
                  <li
                    key={j.id}
                    className={cx('sp-bd-row', j.leftAt !== null && 'is-left')}
                  >
                    <img
                      className="sp-bd-avatar"
                      src={j.avatar || undefined}
                      alt=""
                    />
                    <span className="sp-bd-row__main">
                      <span className="sp-bd-row__line">
                        <span className="sp-bd-row__name">{j.userName}</span>
                        <JoinBadges j={j} />
                      </span>
                      <span className="sp-hint sp-bd-row__meta">
                        {when(j.joinedAt)} · {j.code}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sp-hint">Nobody yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** The server's invites, as Sparko last read them. */
function Codes({ server, channels }: { server: Server; channels: Channel[] }) {
  const codes = useInviteCodes(server.id);
  const [now] = useState(() => Date.now());
  const d = codes.data;
  return (
    <section className="sp-card sp-inv-codes" aria-labelledby="inv-codes">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="inv-codes">
            Invite codes
          </h2>
          <p className="sp-card__sub">
            {d?.syncedAt
              ? `The server’s invites, most used first. Read from Discord ${new Date(d.syncedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`
              : 'The server’s invites, most used first.'}
          </p>
        </div>
        {d?.vanity && (
          <Badge icon="link" tone="brand">
            Vanity link {d.vanity.code} · {n(d.vanity.uses)} uses
          </Badge>
        )}
      </div>
      {!d ? (
        <div className="sp-card__body">
          <div className="sp-skel sp-skel--block" style={{ height: 160 }} />
        </div>
      ) : !d.canSeeInvites && !d.codes.length ? (
        <EmptyState icon="lock" title="Sparko can’t see your invites">
          Give Sparko’s role the Manage Server permission so it can read the
          server’s invites and tell which one each member used.
        </EmptyState>
      ) : d.codes.length ? (
        <div className="sp-table-wrap sp-inv-table">
          <table className="sp-table" aria-label="Invite codes">
            <thead>
              <tr>
                <th>Code</th>
                <th>Made by</th>
                <th className="sp-num">Uses</th>
                <th>Channel</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {d.codes.map((c) => (
                <tr key={c.code}>
                  <td data-primary data-label="Code">
                    <code className="sp-inv-code">{c.code}</code>
                  </td>
                  <td data-label="Made by">{c.inviterName || 'Unknown'}</td>
                  <td className="sp-num" data-label="Uses">
                    <span>
                      {n(c.uses)}
                      {c.maxUses ? (
                        <span className="sp-table__muted">
                          {' '}
                          / {n(c.maxUses)}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td data-label="Channel">
                    #
                    {channels.find((x) => x.id === c.channelId)?.name ??
                      (c.channelName || 'unknown')}
                  </td>
                  <td data-label="Expires" className="sp-table__muted">
                    {expiresText(c.expiresAt, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="link" title="No invites yet">
          Invites people make in Discord show here, with how often they’re used.
        </EmptyState>
      )}
    </section>
  );
}

/** The Storage tab: the leaderboard, one member, and the invite codes. */
export function INVStorage({
  server,
  channels,
  count,
  paused,
}: {
  server: Server;
  channels: Channel[];
  count: number;
  paused: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const [bonus, setBonus] = useState<{
    who: { userId: string; name: string; avatar: string } | null;
  } | null>(null);
  const [resetting, setResetting] = useState<
    { userId: string; name: string } | 'everyone' | null
  >(null);
  const board = useInviteBoard(server.id, query, page);
  const actions = useInviteActions(server.id);
  const toast = useToast();
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(typed);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [typed]);

  const data = board.data;
  const rows = data?.rows ?? [];
  const shown = data?.count ?? count;
  const doReset = () => {
    if (!resetting) return;
    const everyone = resetting === 'everyone';
    actions.reset.mutate(everyone ? null : resetting.userId, {
      onSuccess: () => {
        toast({
          title: everyone
            ? 'Reset everyone’s invites'
            : `Reset ${resetting.name}’s invites`,
          body: 'Who invited whom is kept.',
        });
        setResetting(null);
      },
      onError: (e) =>
        toast({ tone: 'danger', title: 'Couldn’t reset', body: e.message }),
    });
  };

  return (
    <div className="sp-stack">
      <div className="sp-bd-storage sp-inv-storage">
        <section className="sp-card" aria-labelledby="inv-board">
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="inv-board">
                Leaderboard
              </h2>
              <p className="sp-card__sub">
                {n(shown)} {shown === 1 ? 'inviter' : 'inviters'}, most invites
                first.
              </p>
            </div>
            <div className="sp-ar__head-actions">
              <Button
                size="sm"
                variant="ghost"
                icon="rotate-ccw"
                disabled={paused || !shown}
                onClick={() => setResetting('everyone')}
              >
                Reset all
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon="plus"
                disabled={paused}
                onClick={() => setBonus({ who: null })}
              >
                Add bonus
              </Button>
            </div>
          </div>
          <div className="sp-card__body sp-stack">
            <Input
              aria-label="Search members"
              icon="search"
              placeholder="Search inviters and members by name or user ID"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {board.isPending ? (
              <div className="sp-skel sp-skel--block" style={{ height: 260 }} />
            ) : rows.length ? (
              <div className="sp-inv-board-wrap">
                <table className="sp-inv-board" aria-label="Leaderboard">
                  <thead>
                    <tr>
                      <th className="sp-num">#</th>
                      <th>Member</th>
                      <th className="sp-num sp-inv-board__n">Regular</th>
                      <th className="sp-num sp-inv-board__n">Left</th>
                      <th className="sp-num sp-inv-board__n">Fake</th>
                      <th className="sp-num sp-inv-board__n">Bonus</th>
                      <th className="sp-num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: INVRow) => (
                      <tr
                        key={r.userId}
                        className={cx(picked === r.userId && 'is-picked')}
                        onClick={() => setPicked(r.userId)}
                      >
                        <td className="sp-num sp-inv-rank">{r.rank ?? '–'}</td>
                        <td>
                          <button
                            type="button"
                            className="sp-user sp-inv-who"
                            aria-pressed={picked === r.userId}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPicked(r.userId);
                            }}
                          >
                            <img
                              className="sp-bd-avatar"
                              src={r.avatar || undefined}
                              alt=""
                            />
                            <span className="sp-user__text">
                              <span className="sp-user__name">{r.name}</span>
                              {/* The numbers in one line, when there's no room for columns. */}
                              <span className="sp-hint sp-inv-board__mini">
                                {n(r.regular)} regular · {n(r.left)} left ·{' '}
                                {n(r.fake)} fake · {r.bonus > 0 ? '+' : ''}
                                {n(r.bonus)} bonus
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="sp-num sp-inv-board__n">
                          {n(r.regular)}
                        </td>
                        <td className="sp-num sp-inv-board__n">{n(r.left)}</td>
                        <td className="sp-num sp-inv-board__n">{n(r.fake)}</td>
                        <td className="sp-num sp-inv-board__n">
                          {r.bonus > 0 ? `+${n(r.bonus)}` : n(r.bonus)}
                        </td>
                        <td className="sp-num sp-inv-total">{n(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data && data.pages > 1 && (
                  <div className="sp-table-foot">
                    <span>
                      Page {data.page} of {data.pages}
                    </span>
                    <div className="sp-table-foot__pager">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="chevron-left"
                        disabled={data.page <= 1}
                        onClick={() => setPage(data.page - 1)}
                      >
                        Back
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={data.page >= data.pages}
                        onClick={() => setPage(data.page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon="link" title="Nobody here yet">
                {query.trim()
                  ? 'Nothing matches. Try another name or ID.'
                  : 'When members join with someone’s invite, the inviter shows here.'}
              </EmptyState>
            )}
          </div>
        </section>
        <MemberPanel
          server={server}
          userId={picked}
          paused={paused}
          onBonus={(who) => setBonus({ who })}
          onReset={(who) => setResetting(who)}
        />
      </div>
      <Codes server={server} channels={channels} />
      {bonus && (
        <BonusForm
          server={server}
          who={bonus.who}
          onClose={() => setBonus(null)}
        />
      )}
      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        icon="rotate-ccw"
        title={
          resetting === 'everyone'
            ? 'Reset everyone’s invites?'
            : `Reset ${resetting?.name ?? ''}’s invites?`
        }
        description={
          resetting === 'everyone'
            ? 'Every inviter goes back to 0 and loses their bonus. Who invited whom is kept, and reward roles follow the new totals.'
            : 'Their invites go back to 0 and their bonus goes. Who they invited is kept, and reward roles follow the new total.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actions.reset.isPending}
              onClick={doReset}
            >
              Reset
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}
