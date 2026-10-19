import type { ReactNode } from 'react';
import {
  Checkbox,
  Combobox,
  Icon,
  Input,
  Segmented,
  cx,
  renderDiscordText,
  type ComboItem,
} from '../../ui';
import {
  sbBoardDefault,
  sbId,
  sbRanges,
  type Channel,
  type RoleOption,
  type SbBoard,
  type Starboard,
} from '../../data';
import { AnimatedIconButton, HoverTip, InfoTip } from './EditorBits';
import { EmojiField } from './EmojiPicker';
import { Used } from './ARTriggers';
import { ChannelPicker, roleItems } from './parts';
import { plusAnimations } from './StudioLibrary';

/** A label with an (i) beside it that says more on hover. */
const tipped = (text: string, tip: string): ReactNode => (
  <>
    {text} <InfoTip text={tip} />
  </>
);

const whole = (text: string, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number(text) || 0)));

/**
 * Roles for "who can" pickers. Sparko doesn't give these, so roles above its
 * own can be picked too.
 */
const anyRoles = (roles: RoleOption[]): ComboItem[] =>
  roleItems(roles.map((r) => ({ ...r, assignable: true })));

/** A new board: a hall of fame after the first, with a higher threshold. */
export function newBoard(config: Starboard): SbBoard {
  const names = new Set(config.boards.map((b) => b.name.toLowerCase()));
  const name = !names.has('hall of fame')
    ? 'Hall of fame'
    : `Board ${config.boards.length + 1}`;
  const top = Math.max(0, ...config.boards.map((b) => b.threshold));
  return sbBoardDefault('', {
    id: sbId(),
    name,
    emojis: [...(config.boards[0]?.emojis ?? ['⭐'])],
    threshold: Math.min(sbRanges.threshold.max, Math.max(3, top * 3)),
  });
}

/** The list of boards: pick one to edit it. */
function BoardList({
  config,
  channels,
  limit,
  selected,
  onSelect,
  onChange,
}: {
  config: Starboard;
  channels: Channel[];
  limit: number;
  selected: string;
  onSelect: (id: string) => void;
  onChange: (patch: Partial<Starboard>) => void;
}) {
  const full = config.boards.length >= limit;
  return (
    <section
      className="sp-card"
      aria-labelledby="sb-boards"
      data-issue="boards"
    >
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="sb-boards">
            Boards
          </h2>
          <p className="sp-card__sub">
            Each board has its own channel, stars and rules. Add one with a
            higher threshold for a hall of fame.
          </p>
        </div>
        <div className="sp-ar__head-actions">
          <Used n={config.boards.length} max={limit} what="boards" />
          <AnimatedIconButton
            size="sm"
            {...plusAnimations}
            disabled={full}
            title={
              full
                ? limit === 1
                  ? 'This plan has 1 board. Plus has up to 5.'
                  : `This plan has up to ${limit} boards.`
                : undefined
            }
            onClick={() => {
              const board = newBoard(config);
              onChange({ boards: [...config.boards, board] });
              onSelect(board.id);
            }}
          >
            Board
          </AnimatedIconButton>
        </div>
      </div>
      <div className="sp-card__body">
        <ul className="sp-sb-boards" aria-label="Boards">
          {config.boards.map((b) => {
            const channel = channels.find((c) => c.id === b.channel);
            const on = b.id === selected;
            return (
              <li
                key={b.id}
                className={cx('sp-sb-board', on && 'is-selected')}
                data-issue={`board:${b.id}`}
              >
                <button
                  type="button"
                  className="sp-sb-board__pick"
                  aria-pressed={on}
                  aria-label={`Edit ${b.name || 'this board'}`}
                  onClick={() => onSelect(b.id)}
                >
                  <span className="sp-sb-board__emoji" aria-hidden="true">
                    {renderDiscordText(b.emojis[0] ?? '⭐')}
                  </span>
                  <span className="sp-sb-board__text">
                    <span className="sp-sb-board__name">
                      {b.name.trim() || 'Unnamed board'}
                    </span>
                    <span className="sp-hint">
                      {channel ? `#${channel.name}` : 'No channel yet'} ·{' '}
                      {b.threshold} {b.threshold === 1 ? 'star' : 'stars'}
                    </span>
                  </span>
                </button>
                {config.boards.length > 1 ? (
                  <button
                    type="button"
                    className="sp-icon-btn sp-icon-btn--danger"
                    aria-label={`Remove ${b.name || 'this board'}`}
                    onClick={() => {
                      const rest = config.boards.filter((x) => x.id !== b.id);
                      onChange({ boards: rest });
                      if (on) onSelect(rest[0]!.id);
                    }}
                  >
                    <Icon name="trash-2" size="sm" />
                  </button>
                ) : (
                  <HoverTip
                    className="sp-sg-fixed"
                    text="The starboard needs at least one board."
                    label
                  >
                    <Icon name="lock" size="sm" />
                  </HoverTip>
                )}
              </li>
            );
          })}
        </ul>
        <p className="sp-hint">
          Removing a board forgets its starred messages when you save. Posts
          already in its channel stay.
        </p>
      </div>
    </section>
  );
}

/** A board's emojis: any of them counts as one star per member. */
function EmojiList({
  board,
  serverId,
  max,
  onChange,
}: {
  board: SbBoard;
  serverId: string;
  max: number;
  onChange: (emojis: string[]) => void;
}) {
  return (
    <div className="sp-field" data-issue={`board:${board.id}/emojis`}>
      <span className="sp-label">
        Star emojis{' '}
        <InfoTip
          text={`A reaction with any of these counts as a star. Someone who reacts with two of them still counts once. Up to ${max}.`}
        />
      </span>
      <div className="sp-sb-emojis">
        {board.emojis.map((e, i) => (
          <span key={`${i}-${e}`} className="sp-sb-emoji">
            <EmojiField
              serverId={serverId}
              value={e}
              label={`Star emoji ${i + 1}`}
              onChange={(next) =>
                onChange(
                  next
                    ? board.emojis.map((x, j) => (j === i ? next : x))
                    : board.emojis.filter((_, j) => j !== i),
                )
              }
            />
          </span>
        ))}
        {board.emojis.length < max && (
          <EmojiField
            key={board.emojis.length}
            serverId={serverId}
            value=""
            label="Another star emoji"
            onChange={(next) => next && onChange([...board.emojis, next])}
          />
        )}
      </div>
    </div>
  );
}

/** The Settings tab: the boards, the picked board's settings and staff. */
export function SBSettings({
  config,
  serverId,
  channels,
  roles,
  limits,
  selected,
  onSelect,
  onChange,
}: {
  config: Starboard;
  serverId: string;
  channels: Channel[];
  roles: RoleOption[];
  limits: { boards: number; emojis: number };
  selected: string;
  onSelect: (id: string) => void;
  onChange: (patch: Partial<Starboard>) => void;
}) {
  const board =
    config.boards.find((b) => b.id === selected) ?? config.boards[0];
  if (!board) return null;
  const edit = (patch: Partial<SbBoard>) =>
    onChange({
      boards: config.boards.map((b) =>
        b.id === board.id ? { ...b, ...patch } : b,
      ),
    });
  const at = (field: string) => `board:${board.id}/${field}`;
  const channel = channels.find((c) => c.id === board.channel);
  // Channels other boards post in, which this one can't use too.
  const taken = new Map(
    config.boards
      .filter((b) => b.id !== board.id && b.channel)
      .map((b) => [b.channel, b.name]),
  );
  const label = board.name.trim() || 'This board';

  return (
    <div className="sp-stack sp-ar sp-sb">
      <BoardList
        config={config}
        channels={channels}
        limit={limits.boards}
        selected={board.id}
        onSelect={onSelect}
        onChange={onChange}
      />

      <section
        className="sp-card"
        aria-labelledby="sb-board"
        key={`board-${board.id}`}
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sb-board">
              {label}
            </h2>
            <p className="sp-card__sub">
              Where it posts, which emojis count, and how many stars it takes.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue={at('name')}>
              <Input
                label="Board name"
                hint="Shown in the dashboard, in /starboard and in posts with {board}."
                maxLength={32}
                placeholder="Starboard"
                value={board.name}
                onChange={(e) => edit({ name: e.target.value })}
              />
            </div>
            <div data-issue={at('channel')}>
              <ChannelPicker
                label="Highlights channel"
                channels={channels.map((c) =>
                  taken.has(c.id) ? { ...c, canPost: false } : c,
                )}
                value={board.channel}
                onChange={(id) => edit({ channel: id })}
                error={
                  channel && !channel.canPost
                    ? 'Sparko can’t post here yet.'
                    : undefined
                }
                hint="Where messages that get enough stars are posted. Each board needs its own channel."
              />
            </div>
          </div>
          <div className="sp-ar__pair sp-sb-stars">
            <EmojiList
              board={board}
              serverId={serverId}
              max={limits.emojis}
              onChange={(emojis) => edit({ emojis })}
            />
            <div data-issue={at('threshold')}>
              <Input
                label={tipped(
                  'Stars needed',
                  'How many members have to star a message before it’s posted here. From 1 to 1,000.',
                )}
                aria-label="Stars needed"
                type="number"
                min={sbRanges.threshold.min}
                max={sbRanges.threshold.max}
                value={String(board.threshold)}
                onChange={(e) =>
                  edit({
                    threshold: whole(
                      e.target.value,
                      sbRanges.threshold.min,
                      sbRanges.threshold.max,
                    ),
                  })
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="sb-rules"
        key={`rules-${board.id}`}
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sb-rules">
              Rules
            </h2>
            <p className="sp-card__sub">
              Which messages {label} watches, and whose stars count.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-field">
            <span className="sp-label">Watch</span>
            <Segmented<'all' | 'only'>
              label="Watch"
              value={board.watch}
              onChange={(watch) => edit({ watch })}
              options={[
                { value: 'all', label: 'Every channel except' },
                { value: 'only', label: 'Only these channels' },
              ]}
            />
          </div>
          <div data-issue={at('channels')}>
            <Combobox
              label={tipped(
                board.watch === 'all'
                  ? 'Channels to skip'
                  : 'Channels to watch',
                board.watch === 'all'
                  ? 'Stars on messages in these channels don’t count. Threads count as the channel they’re in. The board’s own channel is always skipped.'
                  : 'Only messages in these channels can reach the board. Threads count as the channel they’re in.',
              )}
              multiple
              placeholder={
                board.watch === 'all'
                  ? 'None: watch every channel'
                  : 'Pick channels'
              }
              searchPlaceholder="Search channels"
              value={board.channels}
              onChange={(list) => edit({ channels: list })}
              items={channels.map((c) => ({
                value: c.id,
                label: c.name,
                icon: 'hash',
                group: c.category,
                ...(c.id === board.channel
                  ? {
                      disabled: !board.channels.includes(c.id),
                      note: 'The board’s channel',
                    }
                  : {}),
              }))}
            />
          </div>
          <div className="sp-ar__pair">
            <div data-issue={at('maxAgeDays')}>
              <Input
                label={tipped(
                  'Ignore messages older than',
                  'Stars on messages sent longer ago than this don’t count. In days, up to 365. 0 or empty is no limit.',
                )}
                aria-label="Ignore messages older than"
                type="number"
                min={0}
                max={sbRanges.maxAgeDays.max}
                placeholder="No limit"
                end="days"
                value={board.maxAgeDays ? String(board.maxAgeDays) : ''}
                onChange={(e) =>
                  edit({
                    maxAgeDays: whole(
                      e.target.value,
                      0,
                      sbRanges.maxAgeDays.max,
                    ),
                  })
                }
              />
            </div>
            <div data-issue={at('minLength')}>
              <Input
                label={tipped(
                  'Shortest message',
                  'Messages with fewer characters can’t reach the board. 0 lets any length through, pictures too.',
                )}
                aria-label="Shortest message"
                type="number"
                min={0}
                max={sbRanges.minLength.max}
                end="characters"
                value={String(board.minLength)}
                onChange={(e) =>
                  edit({
                    minLength: whole(e.target.value, 0, sbRanges.minLength.max),
                  })
                }
              />
            </div>
          </div>
          <div data-issue={at('blockedRoles')}>
            <Combobox
              label={tipped(
                'Blocked roles',
                'Members with any of these roles can’t reach this board, and their stars don’t count on it.',
              )}
              multiple
              placeholder="No blocked roles"
              searchPlaceholder="Search roles"
              value={board.blockedRoles}
              onChange={(blockedRoles) => edit({ blockedRoles })}
              items={anyRoles(roles)}
            />
          </div>
          <span className="sp-label">Who and what counts</span>
          <div className="sp-ar__checks">
            <Checkbox
              checked={board.selfStar}
              onChange={(selfStar) => edit({ selfStar })}
              label="Count the author’s own star"
              description="Off means starring your own message does nothing."
            />
            <Checkbox
              checked={board.ignoreBots}
              onChange={(ignoreBots) => edit({ ignoreBots })}
              label="Ignore stars from bots"
              description="Reactions added by bots, Sparko included, don’t count."
            />
            <Checkbox
              checked={board.allowBots}
              onChange={(allowBots) => edit({ allowBots })}
              label="Allow messages from bots"
              description="Bots’ messages, like announcements, can reach the board."
            />
            <Checkbox
              checked={board.skipNsfw}
              onChange={(skipNsfw) => edit({ skipNsfw })}
              label="Skip age-restricted channels"
              description="Messages from age-restricted (NSFW) channels only reach the board if its own channel is age-restricted too."
            />
          </div>
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="sb-changes"
        key={`changes-${board.id}`}
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sb-changes">
              When stars change
            </h2>
            <p className="sp-card__sub">
              The count on a post updates as members star it, a couple of
              seconds at most behind.
            </p>
          </div>
        </div>
        <div className="sp-card__body sp-ar__pair">
          <div className="sp-field">
            <span className="sp-label">
              Drops below {board.threshold}{' '}
              {board.threshold === 1 ? 'star' : 'stars'}{' '}
              <InfoTip text="When members take stars off a posted message so it has fewer than the board needs." />
            </span>
            <Segmented<'keep' | 'remove'>
              label="When a post drops below the threshold"
              value={board.belowThreshold}
              onChange={(belowThreshold) => edit({ belowThreshold })}
              options={[
                { value: 'remove', label: 'Take the post down' },
                { value: 'keep', label: 'Keep it' },
              ]}
            />
          </div>
          <div className="sp-field">
            <span className="sp-label">
              Original deleted{' '}
              <InfoTip text="When the starred message itself is deleted. A kept post stays as it was, with its count frozen." />
            </span>
            <Segmented<'keep' | 'remove'>
              label="When the original message is deleted"
              value={board.onDelete}
              onChange={(onDelete) => edit({ onDelete })}
              options={[
                { value: 'remove', label: 'Take the post down' },
                { value: 'keep', label: 'Keep it' },
              ]}
            />
          </div>
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="sb-staff"
        data-issue="staff"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="sb-staff">
              Staff
            </h2>
            <p className="sp-card__sub">
              Who can freeze posts and block messages or members, on every
              board.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <Combobox
            label={tipped(
              'Staff roles',
              'Members with any of these roles can use /starboard freeze and /starboard block. Leave it empty for members with Manage Messages.',
            )}
            multiple
            placeholder="Manage Messages only"
            searchPlaceholder="Search roles"
            value={config.staff}
            onChange={(staff) => onChange({ staff })}
            items={anyRoles(roles)}
          />
        </div>
      </section>
    </div>
  );
}
