import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  Checkbox,
  Combobox,
  Icon,
  Input,
  Segmented,
  cx,
  type ComboItem,
} from '../../ui';
import {
  sgId,
  sgRanges,
  sgVotesMax,
  type Channel,
  type RoleOption,
  type SgAction,
  type SgActionType,
  type SgStatus,
  type SgVoteKind,
  type SgVoteOption,
  type StudioState,
  type Suggestions,
} from '../../data';
import { ColourPicker } from './ColourPicker';
import { DragHandle, Panel, TrashButton } from './ComponentsEditor';
import {
  AnimatedIconButton,
  InfoTip,
  moveItem,
  useReorder,
  HoverTip,
} from './EditorBits';
import { EmojiField } from './EmojiPicker';
import { PlusMenu } from './PlusMenu';
import { DurationInput, Used } from './ARTriggers';
import { ChannelPicker, roleItems } from './parts';
import { plusAnimations } from './StudioLibrary';

const NONE = 'none';
const timeFormat = 'Use mi, h, d, w, mt and y, like 30mi, 12h, 7d or 1mt.';

/** A label with an (i) beside it that says more on hover. */
const tipped = (text: string, tip: string): ReactNode => (
  <>
    {text} <InfoTip text={tip} />
  </>
);

/** Studio templates as menu items, grouped by their folder. */
export function templateItems(studio: StudioState): ComboItem[] {
  const folder = new Map(studio.folders.map((f) => [f.id, f.name]));
  return studio.templates.map((t) => ({
    value: t.id,
    label: t.name,
    icon: 'file-text',
    group: (t.folderId && folder.get(t.folderId)) || 'Templates',
  }));
}

/**
 * Roles for "who can" pickers. Sparko doesn't give these, so roles above its
 * own can be picked too.
 */
const anyRoles = (roles: RoleOption[]): ComboItem[] =>
  roleItems(roles.map((r) => ({ ...r, assignable: true })));

// Voting ----------------------------------------------------------------------

const colours = [
  { value: 'blurple', label: 'Blurple' },
  { value: 'grey', label: 'Grey' },
  { value: 'green', label: 'Green' },
  { value: 'red', label: 'Red' },
] as const;

/**
 * The upvote or the downvote: a reaction's emoji, a button's emoji, name
 * and colour, or a menu option's emoji, title and description.
 */
export function VoteCard({
  kind,
  which,
  option,
  serverId,
  onChange,
}: {
  kind: SgVoteKind;
  which: 'up' | 'down';
  option: SgVoteOption;
  serverId: string;
  onChange: (patch: Partial<SgVoteOption>) => void;
}) {
  const name = which === 'up' ? 'Upvote' : 'Downvote';
  const emoji = (
    <EmojiField
      serverId={serverId}
      value={option.emoji}
      label={`${name} emoji`}
      onChange={(e) => onChange({ emoji: e })}
    />
  );
  return (
    <li
      className={cx(
        'sp-rr-item sp-sg-vote',
        `sp-rr-item--${kind}`,
        `sp-sg-vote--${which}`,
      )}
    >
      <span className="sp-sg-vote__tag">{name}</span>
      {kind === 'menu' ? (
        <div className="sp-rr-opt">
          <div className="sp-rr-opt__row">
            {emoji}
            <Input
              aria-label={`${name} option title`}
              placeholder="Title"
              maxLength={100}
              value={option.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </div>
          <Input
            aria-label={`${name} option description`}
            placeholder="Description (optional)"
            maxLength={100}
            value={option.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
      ) : (
        <>
          {emoji}
          {kind === 'button' && (
            <div className="sp-rr-item__main">
              <Input
                aria-label={`${name} button name`}
                placeholder="Button name"
                maxLength={80}
                value={option.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
              <div
                className="sp-colour-squares"
                role="radiogroup"
                aria-label={`${name} button colour`}
              >
                {colours.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={option.colour === c.value}
                    aria-label={c.label}
                    className={cx(
                      'sp-colour-square',
                      `sp-colour-square--${c.value}`,
                      option.colour === c.value && 'is-on',
                    )}
                    onClick={() => onChange({ colour: c.value })}
                  />
                ))}
              </div>
            </div>
          )}
          {kind === 'reaction' && (
            <span className="sp-hint">
              {which === 'up'
                ? 'Members react with this to vote for it.'
                : 'Members react with this to vote against it.'}
            </span>
          )}
        </>
      )}
    </li>
  );
}

// Statuses --------------------------------------------------------------------

export const actionNames: Record<SgActionType, string> = {
  approve: 'Approve',
  deny: 'Deny',
  close: 'Close voting',
  dm: 'DM user',
  blacklist: 'Blacklist the author',
};
const actionAbout: Record<SgActionType, string> = {
  approve:
    'Counts it as approved. A status can approve or deny, not both. Auto-approve uses Approved.',
  deny: 'Counts it as denied. A suggestion denied while waiting for review is never posted.',
  close:
    'Nobody can vote on it any more. Its buttons are greyed out and its thread is locked.',
  dm: 'Sends the author a direct message saying what happened, with the reason. People who don’t take DMs from the server won’t get it; the log says so.',
  blacklist:
    'Gives the author the blacklisted role from Who can suggest, so they can’t suggest again.',
};

/** One action of a status, in the same card as a button's actions. */
function ActionCard({
  action,
  index,
  count,
  fixed,
  templates,
  reorder,
  onChange,
  onRemove,
}: {
  action: SgAction;
  index: number;
  count: number;
  /** Built-in statuses keep their approve or deny. */
  fixed: boolean;
  templates: ComboItem[];
  reorder: Omit<ReturnType<typeof useReorder>, 'list'>;
  onChange: (a: SgAction) => void;
  onRemove: () => void;
}) {
  const [fading, setFading] = useState(false);
  return (
    <li
      {...reorder.item(index, action.id)}
      className={cx(
        'sp-action',
        reorder.dropClass(index, count),
        fading && 'is-fading',
      )}
    >
      <DragHandle
        label={`Move action ${index + 1}. Drag it, or use the arrow keys.`}
        disabled={count < 2}
        onPointerDown={reorder.start(index)}
        onKeyDown={reorder.keys(index, count)}
      />
      <div className="sp-action__body">
        <span className="sp-action__title">
          {actionNames[action.type]} <InfoTip text={actionAbout[action.type]} />
        </span>
        {action.type === 'dm' && (
          <Combobox
            label={<span className="sp-sr-only">Message to send</span>}
            searchPlaceholder="Search templates"
            value={action.template || NONE}
            onChange={(v) =>
              onChange({ ...action, template: v === NONE ? '' : v })
            }
            footer="Sparko’s template doesn’t use one of your templates."
            items={[
              {
                value: NONE,
                label: 'Sparko’s template',
                icon: 'sparkles',
                group: 'Default',
                note: 'Says the status, the reason and who set it',
              },
              ...templates,
            ]}
          />
        )}
      </div>
      {fixed ? (
        <HoverTip
          className="sp-action__trash sp-sg-fixed"
          text="This action is always on, so it can’t be removed."
          label
        >
          <Icon name="lock" size="sm" />
        </HoverTip>
      ) : (
        <TrashButton
          label={`Remove action ${index + 1}`}
          className="sp-action__trash"
          onHover={setFading}
          onClick={onRemove}
        />
      )}
    </li>
  );
}

/** The gear's panel: what a status does, from top to bottom. */
function StatusActions({
  status,
  builtIn,
  maxActions,
  templates,
  onChange,
  onClose,
}: {
  status: SgStatus;
  builtIn: boolean;
  maxActions: number;
  templates: ComboItem[];
  onChange: (actions: SgAction[]) => void;
  onClose: () => void;
}) {
  const actions = status.actions;
  const { list: listRef, ...reorder } = useReorder({
    onMove: (from, to) => onChange(moveItem(actions, from, to)),
  });
  const has = (t: SgActionType) => actions.some((a) => a.type === t);
  const kinds: SgActionType[] = builtIn
    ? ['dm']
    : ['close', 'approve', 'deny', 'dm', 'blacklist'];
  const full = actions.length >= maxActions;
  return (
    <Panel
      title={`What “${status.name || 'this status'}” does`}
      description={
        builtIn
          ? `${status.name} always ${status.id === 'approved' ? 'approves' : 'denies'} the suggestion. It can also DM the author.`
          : 'Actions run from top to bottom when staff set this status.'
      }
      onClose={onClose}
    >
      <div className="sp-actions">
        <div className="sp-actions__head">
          <span className="sp-label">
            Actions{' '}
            <InfoTip text="What happens when staff set this status. Drag the dots to change the order." />
          </span>
          <PlusMenu
            label="Add an action"
            items={kinds.map((type) => ({
              label: actionNames[type],
              disabled:
                full ||
                has(type) ||
                (type === 'approve' && has('deny')) ||
                (type === 'deny' && has('approve')),
              note: full
                ? `A status has up to ${maxActions} actions.`
                : has(type)
                  ? 'Already added'
                  : 'A status can approve or deny, not both.',
              onSelect: () =>
                onChange([
                  ...actions,
                  type === 'dm'
                    ? { id: sgId(), type, template: '' }
                    : { id: sgId(), type },
                ]),
            }))}
          />
        </div>
        {actions.length ? (
          <ol ref={listRef} className="sp-actions__list">
            {actions.map((a, i) => (
              <ActionCard
                key={a.id}
                action={a}
                index={i}
                count={actions.length}
                fixed={builtIn && a.type !== 'dm'}
                templates={templates}
                reorder={reorder}
                onChange={(next) =>
                  onChange(actions.map((x) => (x.id === a.id ? next : x)))
                }
                onRemove={() => onChange(actions.filter((x) => x.id !== a.id))}
              />
            ))}
          </ol>
        ) : (
          <p className="sp-hint">
            Nothing happens yet besides the status and reason showing on the
            suggestion. Use + to add actions.
          </p>
        )}
      </div>
    </Panel>
  );
}

function StatusCard({
  status,
  builtIn,
  maxActions,
  templates,
  onChange,
  onRemove,
}: {
  status: SgStatus;
  builtIn: boolean;
  maxActions: number;
  templates: ComboItem[];
  onChange: (patch: Partial<SgStatus>) => void;
  onRemove: () => void;
}) {
  const [pop, setPop] = useState<'colour' | 'gear' | null>(null);
  const summary = status.actions.map((a) => actionNames[a.type]).join(' → ');
  return (
    <li className="sp-sg-status" data-issue={`status:${status.id}`}>
      <span className="sp-pop-anchor">
        <button
          type="button"
          className="sp-sg-status__colour"
          aria-label={`Colour of ${status.name || 'this status'}`}
          aria-expanded={pop === 'colour'}
          style={{ '--sg-colour': status.color } as CSSProperties}
          onClick={() => setPop(pop === 'colour' ? null : 'colour')}
        />
        {pop === 'colour' && (
          <ColourPicker
            title="Embed colour"
            value={status.color}
            onChange={(color) => onChange({ color })}
            onClose={() => setPop(null)}
          />
        )}
      </span>
      <div className="sp-sg-status__main">
        <Input
          aria-label="Status name"
          maxLength={25}
          placeholder="Status name"
          value={status.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <span className="sp-hint">
          {summary || 'Shows the status and reason only'}
          {builtIn && ' · built in'}
        </span>
      </div>
      <button
        type="button"
        className="sp-icon-btn"
        aria-label={`Actions for ${status.name || 'this status'}`}
        onClick={() => setPop('gear')}
      >
        <Icon name="settings" size="lg" />
      </button>
      {builtIn ? (
        <HoverTip
          className="sp-sg-fixed"
          text="Approved and Denied are built in, so they can’t be removed. You can still rename them and change what they do."
          label
        >
          <Icon name="lock" size="sm" />
        </HoverTip>
      ) : (
        <button
          type="button"
          className="sp-icon-btn sp-icon-btn--danger"
          aria-label={`Remove ${status.name || 'this status'}`}
          onClick={onRemove}
        >
          <Icon name="trash-2" size="sm" />
        </button>
      )}
      {pop === 'gear' && (
        <StatusActions
          status={status}
          builtIn={builtIn}
          maxActions={maxActions}
          templates={templates}
          onChange={(actions) => onChange({ actions })}
          onClose={() => setPop(null)}
        />
      )}
    </li>
  );
}

// The tab ---------------------------------------------------------------------

const whole = (text: string, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number(text) || 0)));

/** The Settings tab: where, who, voting, statuses and limits. */
export function SGSettings({
  config,
  serverId,
  channels,
  roles,
  studio,
  limits,
  onChange,
}: {
  config: Suggestions;
  serverId: string;
  channels: Channel[];
  roles: RoleOption[];
  studio: StudioState;
  limits: { statuses: number; actions: number };
  onChange: (patch: Partial<Suggestions>) => void;
}) {
  const channel = channels.find((c) => c.id === config.channel);
  const review = channels.find((c) => c.id === config.review);
  const templates = templateItems(studio);
  const vote = config.vote;
  const editVote = (which: 'up' | 'down', patch: Partial<SgVoteOption>) =>
    onChange({ vote: { ...vote, [which]: { ...vote[which], ...patch } } });
  const editStatus = (id: string, patch: Partial<SgStatus>) =>
    onChange({
      statuses: config.statuses.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    });
  const fullStatuses = config.statuses.length >= limits.statuses;

  return (
    <div className="sp-stack sp-ar sp-sg">
      <section className="sp-card" aria-labelledby="sg-where">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sg-where">
              Channels and people
            </h2>
            <p className="sp-card__sub">
              Where suggestions go, and who can suggest, approve and delete.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="channel">
              <ChannelPicker
                label="Suggestion channel"
                channels={channels}
                value={config.channel}
                onChange={(id) => onChange({ channel: id })}
                error={
                  channel && !channel.canPost
                    ? 'Sparko can’t post here yet.'
                    : undefined
                }
                hint="Where suggestions get posted."
              />
            </div>
            <div data-issue="review">
              <Combobox
                label={tipped(
                  'Review channel (staff)',
                  'New suggestions go here first. Staff press Post it or Reject before members see them. Pick None to post them straight away.',
                )}
                searchPlaceholder="Search channels"
                value={config.review || NONE}
                onChange={(id) => onChange({ review: id === NONE ? '' : id })}
                error={
                  review && !review.canPost
                    ? 'Sparko can’t post here yet.'
                    : undefined
                }
                footer="Locked channels are ones Sparko can’t post in yet."
                items={[
                  {
                    value: NONE,
                    label: 'None: post straight away',
                    icon: 'ban',
                    group: 'Default',
                  },
                  ...channels.map((c) => ({
                    value: c.id,
                    label: c.name,
                    icon: 'hash',
                    group: c.category,
                    disabled:
                      (!c.canPost && c.id !== config.review) ||
                      c.id === config.channel,
                    ...(c.id === config.channel
                      ? { note: 'The suggestion channel' }
                      : c.canPost
                        ? {}
                        : { note: 'Sparko can’t post' }),
                  })),
                ]}
              />
            </div>
          </div>
          <div className="sp-ar__pair">
            <div data-issue="suggesters">
              <Combobox
                label={tipped(
                  'Who can suggest',
                  'Members with any of these roles can suggest. Leave it empty for everyone.',
                )}
                multiple
                placeholder="Everyone"
                searchPlaceholder="Search roles"
                value={config.suggesters}
                onChange={(suggesters) => onChange({ suggesters })}
                items={anyRoles(roles).map((r) =>
                  r.value === config.blacklist
                    ? { ...r, disabled: true, note: 'Blacklisted' }
                    : r,
                )}
              />
            </div>
            <div data-issue="blacklist">
              <Combobox
                label={tipped(
                  'Blacklist role',
                  'Members with this role can’t suggest, whatever other roles they have. A status with “Blacklist the author” gives it.',
                )}
                searchPlaceholder="Search roles"
                value={config.blacklist || NONE}
                onChange={(v) => onChange({ blacklist: v === NONE ? '' : v })}
                items={[
                  { value: NONE, label: 'None', icon: 'ban', group: 'Default' },
                  ...roleItems(roles, [config.blacklist]).map((r) =>
                    config.suggesters.includes(r.value)
                      ? { ...r, disabled: true, note: 'Can suggest' }
                      : r,
                  ),
                ]}
              />
            </div>
          </div>
          <div data-issue="minAge" className="sp-sg-age">
            <DurationInput
              label="Minimum account age"
              tip="How old a member’s Discord account has to be before they can suggest. Use d, w, mt and y, like 3d, 2w, 1mt or 1y. From 1 day up to 1 year. Leave it empty for any age."
              value={config.minAge}
              placeholder="Any age"
              range={sgRanges.minAge}
              format="Use d, w, mt and y, like 3d, 2w, 1mt or 1y."
              onChange={(minAge) => onChange({ minAge })}
            />
            <Checkbox
              checked={config.bypassAge}
              disabled={!config.minAge.trim() || !config.suggesters.length}
              onChange={(bypassAge) => onChange({ bypassAge })}
              label="Roles allowed to suggest bypass the minimum account age"
              description={
                config.suggesters.length
                  ? 'On: members with a Who can suggest role don’t need the account age. Off: they need both.'
                  : 'Pick roles in Who can suggest first.'
              }
            />
          </div>
          <div className="sp-ar__pair">
            <div data-issue="approvers">
              <Combobox
                label={tipped(
                  'Who can approve or deny',
                  'This is approval and denial, not voting. Everyone can vote normally. Leave it empty for members with Manage Server.',
                )}
                multiple
                placeholder="Manage Server only"
                searchPlaceholder="Search roles"
                value={config.approvers}
                onChange={(approvers) => onChange({ approvers })}
                items={anyRoles(roles)}
              />
              <p className="sp-hint">
                Approval and denial, not voting. Everyone can vote normally.
              </p>
            </div>
            <div data-issue="deleters">
              <Combobox
                label={tipped(
                  'Who can delete',
                  'Only these roles can delete suggestions. If someone else deletes one in Discord, Sparko posts it again and keeps its data. Leave it empty for members with Manage Server.',
                )}
                multiple
                placeholder="Manage Server only"
                searchPlaceholder="Search roles"
                value={config.deleters}
                onChange={(deleters) => onChange({ deleters })}
                items={anyRoles(roles)}
              />
              <p className="sp-hint">
                If someone without the role deletes one, Sparko posts it again
                and nothing is removed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="sg-vote" data-issue="vote">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sg-vote">
              Voting
            </h2>
            <p className="sp-card__sub">
              How members vote: reactions, buttons or a menu.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-field">
            <span className="sp-label">Members vote with</span>
            <Segmented<SgVoteKind>
              label="Members vote with"
              value={vote.kind}
              onChange={(kind) => onChange({ vote: { ...vote, kind } })}
              options={[
                { value: 'reaction', label: 'Reactions' },
                { value: 'button', label: 'Buttons' },
                { value: 'menu', label: 'Menu' },
              ]}
            />
          </div>
          {vote.kind === 'menu' && (
            <Input
              label="Menu text"
              placeholder="Vote on this suggestion"
              maxLength={150}
              value={vote.placeholder}
              onChange={(e) =>
                onChange({ vote: { ...vote, placeholder: e.target.value } })
              }
            />
          )}
          <ul className="sp-rr-items sp-sg-votes" aria-label="Votes">
            {(['up', 'down'] as const).map((which) => (
              <VoteCard
                key={which}
                kind={vote.kind}
                which={which}
                option={vote[which]}
                serverId={serverId}
                onChange={(patch) => editVote(which, patch)}
              />
            ))}
          </ul>
          <p className="sp-hint">
            {vote.kind === 'menu'
              ? 'A menu always has these two options.'
              : vote.kind === 'button'
                ? 'Always two buttons: one to vote for, one against.'
                : 'Sparko adds both reactions to every suggestion.'}
          </p>
          <span className="sp-label">Vote rules</span>
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.changeVotes}
              onChange={(changeVotes) => onChange({ changeVotes })}
              label="Allow changing votes"
              description="Members can switch their vote, or take it back by voting the same way again."
            />
            <Checkbox
              checked={config.selfVote}
              onChange={(selfVote) => onChange({ selfVote })}
              label="Allow voting on your own suggestion"
              description="Off means the author’s vote doesn’t count."
            />
            <Checkbox
              checked={config.threads}
              onChange={(threads) => onChange({ threads })}
              label="Auto-threads"
              description="Sparko opens a thread on each suggestion for discussion, and locks it when voting closes."
            />
            <Checkbox
              checked={config.anonymous}
              onChange={(anonymous) => onChange({ anonymous })}
              label="Anonymous suggestions"
              description="The post doesn’t say who suggested it. Staff still see the author in Storage."
            />
          </div>
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="sg-status"
        data-issue="statuses"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sg-status">
              Status and workflow
            </h2>
            <p className="sp-card__sub">
              The statuses staff give suggestions, and what each one does.
            </p>
          </div>
          <div className="sp-ar__head-actions">
            <Used
              n={config.statuses.length}
              max={limits.statuses}
              what="statuses"
              icon="status"
            />
            <AnimatedIconButton
              size="sm"
              {...plusAnimations}
              disabled={fullStatuses}
              title={
                fullStatuses
                  ? `This plan has up to ${limits.statuses} statuses.`
                  : undefined
              }
              onClick={() =>
                onChange({
                  statuses: [
                    ...config.statuses,
                    {
                      id: sgId(),
                      name: '',
                      color: '#5865F2',
                      actions: [],
                    },
                  ],
                })
              }
            >
              Status
            </AnimatedIconButton>
          </div>
        </div>
        <div className="sp-card__body">
          <p className="sp-edit-banner" role="note">
            <Icon name="info" size="sm" />
            <span>
              Use <code>/{config.commands.status.name} [ID] [status]</code> to
              set a status, or <code>/{config.commands.approve.name} [ID]</code>{' '}
              and <code>/{config.commands.deny.name} [ID]</code>. Sparko asks
              for a reason first, then adds it under the suggestion with who set
              it.
            </span>
          </p>
          <ul className="sp-sg-statuses">
            {config.statuses.map((s, i) => (
              <StatusCard
                key={s.id}
                status={s}
                builtIn={i < 2}
                maxActions={limits.actions}
                templates={templates}
                onChange={(patch) => editStatus(s.id, patch)}
                onRemove={() =>
                  onChange({
                    statuses: config.statuses.filter((x) => x.id !== s.id),
                  })
                }
              />
            ))}
          </ul>
          <div className="sp-ar__pair">
            <div data-issue="autoApprove">
              <Input
                label={tipped(
                  'Auto-approve at',
                  'Sparko sets Approved once a suggestion has this many upvotes. 0 or empty is off. Up to 10,000.',
                )}
                aria-label="Auto-approve at"
                type="number"
                min={0}
                max={sgVotesMax}
                placeholder="Off"
                value={config.autoApprove ? String(config.autoApprove) : ''}
                hint="Upvotes. 0 or empty is off."
                onChange={(e) =>
                  onChange({
                    autoApprove: whole(e.target.value, 0, sgVotesMax),
                  })
                }
              />
            </div>
            <div data-issue="autoDeny">
              <Input
                label={tipped(
                  'Auto-deny at',
                  'Sparko sets Denied once a suggestion has this many downvotes. 0 or empty is off. Up to 10,000.',
                )}
                aria-label="Auto-deny at"
                type="number"
                min={0}
                max={sgVotesMax}
                placeholder="Off"
                value={config.autoDeny ? String(config.autoDeny) : ''}
                hint="Downvotes. 0 or empty is off."
                onChange={(e) =>
                  onChange({ autoDeny: whole(e.target.value, 0, sgVotesMax) })
                }
              />
            </div>
          </div>
          <div data-issue="autoClose" className="sp-sg-age">
            <DurationInput
              label="Auto-close after"
              tip="Voting closes on its own this long after a suggestion is posted. Use mi, h, d, w and mt, like 30mi, 12h, 7d or 1mt. From 1 minute up to 1 month. Leave it empty to keep voting open."
              value={config.autoClose}
              placeholder="Never"
              range={sgRanges.autoClose}
              format={timeFormat}
              onChange={(autoClose) => onChange({ autoClose })}
            />
            <Checkbox
              checked={config.restartOnVote}
              disabled={!config.autoClose.trim()}
              onChange={(restartOnVote) => onChange({ restartOnVote })}
              label="Restart the timer when someone votes"
              description="Each upvote or downvote starts the time again, so busy suggestions stay open."
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="sg-limits">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sg-limits">
              Limits
            </h2>
            <p className="sp-card__sub">
              How often and how much members can suggest.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="cooldown">
              <DurationInput
                label="Cooldown between suggestions"
                tip="How long a member waits after suggesting before they can again. Use h, d, w and mt, like 1h, 12h, 1d or 1mt. From 1 hour up to 1 month. Leave it empty for no cooldown."
                value={config.cooldown}
                placeholder="No cooldown"
                range={sgRanges.cooldown}
                format={timeFormat}
                onChange={(cooldown) => onChange({ cooldown })}
              />
            </div>
            <div data-issue="maxPending">
              <Input
                label={tipped(
                  'Max pending suggestions per user',
                  'How many suggestions one member can have waiting for a status at once, from 1 to 10. 0 is no limit.',
                )}
                aria-label="Max pending suggestions per user"
                type="number"
                min={0}
                max={10}
                value={String(config.maxPending)}
                hint="0 means no limit."
                onChange={(e) =>
                  onChange({ maxPending: whole(e.target.value, 0, 10) })
                }
              />
            </div>
          </div>
          <div className="sp-ar__pair" data-issue="length">
            <Input
              label="Shortest suggestion"
              type="number"
              min={0}
              max={config.maxLength}
              value={String(config.minLength)}
              hint="Characters. 0 lets any length through."
              onChange={(e) =>
                onChange({
                  minLength: whole(e.target.value, 0, config.maxLength),
                })
              }
            />
            <Input
              label={tipped(
                'Longest suggestion',
                'From 100 to 12,000 characters. Long suggestions carry on in another embed or container under the first, like pages.',
              )}
              aria-label="Longest suggestion"
              type="number"
              min={100}
              max={12000}
              value={String(config.maxLength)}
              hint="Characters, 100 to 12,000."
              onChange={(e) =>
                onChange({ maxLength: whole(e.target.value, 0, 12000) })
              }
            />
          </div>
          <Checkbox
            checked={config.duplicates}
            onChange={(duplicates) => onChange({ duplicates })}
            label="Duplicate detection"
            description="If a member suggests the same thing again, it isn’t posted and only they see a note pointing to the first one."
          />
        </div>
      </section>
    </div>
  );
}
