import { useRef, useState } from 'react';
import {
  HoverTip,
  Icon,
  LottieIcon,
  cx,
  menuPlacement,
  usePlacement,
  usePresence,
} from '../../ui';
import { studioVariables } from '../../data';
import { useDismiss } from './EditorBits';
import { animIcons } from '../../ui';
const bookReveal = animIcons.infoBook.reveal;
const bookHover = animIcons.infoBook.hover;
const bookOpen = animIcons.infoBook.open;

export const variablesAnimations = [bookReveal, bookHover, bookOpen];

/**
 * The { } button beside the live preview: a list of variables, written in
 * braces, that Sparko fills in when it sends the message.
 */
export function VariablesButton({
  v2,
  role,
  suggestion,
  poll,
  starboard,
  birthday,
  question,
  invite,
  onPick,
}: {
  /** Components V2 messages also have {separator}. */
  v2: boolean;
  /** Reaction role responses fill in the role. */
  role?: boolean;
  /** Poll messages fill in the poll. */
  poll?: boolean;
  /** Starboard posts fill in the starred message. */
  starboard?: boolean;
  /** Suggestion messages fill in the suggestion. */
  suggestion?: boolean;
  /** Birthday messages fill in who it's for. */
  birthday?: boolean;
  /** Question, answer and answered-DM messages fill in the question. */
  question?: boolean;
  /** Invite join and leave messages fill in who invited them. */
  invite?: boolean;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The book draws in, flips its pages on hover, and opens while the list
  // is showing (closing again when it goes).
  const [anim, setAnim] = useState<'reveal' | 'hover' | 'open'>('reveal');
  const [playKey, setPlayKey] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const toggle = (next: boolean) => {
    setOpen(next);
    if (next) {
      setAnim('open');
      setQuery('');
    }
  };
  const pop = useRef<HTMLDivElement>(null);
  useDismiss(open, () => toggle(false), wrap);
  const presence = usePresence(open);
  usePlacement(presence.mounted, wrap, pop, menuPlacement);
  // Every variable is listed. Ones this message can't fill are still there,
  // faded with a tag saying where they work: added anyway, they're sent empty.
  const all = [
    ...studioVariables,
    {
      name: 'separator',
      about: 'Draws a line across the container and starts a new section.',
      v2: true as const,
    },
  ];
  // Variables only some messages fill in, by the flag they carry.
  const owners = [
    {
      key: 'role',
      on: role,
      label: 'Reaction role',
      where: 'reaction role responses',
    },
    {
      key: 'suggestion',
      on: suggestion,
      label: 'Suggestion',
      where: 'suggestion messages',
    },
    {
      key: 'question',
      on: question,
      label: 'Q&A',
      where: 'question, answer and answered-DM messages',
    },
    {
      key: 'starboard',
      on: starboard,
      label: 'Starboard',
      where: 'starboard posts',
    },
    {
      key: 'poll',
      on: poll,
      label: 'Poll',
      where: 'poll messages',
    },
    {
      key: 'birthday',
      on: birthday,
      label: 'Birthday',
      where: 'birthday messages',
    },
    {
      key: 'invite',
      on: invite,
      label: 'Invite',
      where: 'invite join and leave messages',
    },
  ] as const;
  const ownersOf = (v: (typeof all)[number]) =>
    owners.filter((o) => !!(v as Record<string, unknown>)[o.key]);
  // A variable only some messages fill in works where any of them is this one.
  const works = (v: (typeof all)[number]) => {
    const of = ownersOf(v);
    return (!of.length || of.some((o) => o.on)) && (v2 || !('v2' in v && v.v2));
  };
  const needle = query.trim().toLowerCase();
  const found = all.filter(
    (v) =>
      !needle ||
      v.name.includes(needle) ||
      v.about.toLowerCase().includes(needle),
  );
  const list = [...found.filter(works), ...found.filter((v) => !works(v))];
  const tagOf = (v: (typeof all)[number]) => {
    const of = ownersOf(v);
    if (of.length) {
      const where = of.map((o) => o.where);
      return {
        label: (of.find((o) => o.on) ?? of[0]!).label,
        tip: `Only filled in by ${where.length > 1 ? `${where.slice(0, -1).join(', ')} and ${where.at(-1)}` : where[0]}. Anywhere else it’s sent empty.`,
      };
    }
    return 'v2' in v && v.v2
      ? {
          label: 'V2',
          tip: 'Only works in V2 components messages. In an embed message it’s left out.',
        }
      : null;
  };
  return (
    <div ref={wrap} className="sp-pop-anchor">
      <button
        type="button"
        className={cx('sp-plus-btn sp-vars-btn', open && 'is-open')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => toggle(!open)}
        onPointerEnter={() => {
          if (open) return;
          // A new file plays once it has loaded; the same one plays again.
          if (anim === 'hover') setPlayKey((k) => k + 1);
          else setAnim('hover');
        }}
      >
        <span>Variables</span>
        <LottieIcon
          src={
            anim === 'reveal'
              ? bookReveal
              : anim === 'hover'
                ? bookHover
                : bookOpen
          }
          size={22}
          original
          playKey={anim === 'open' ? undefined : playKey}
          open={anim === 'open' ? open : undefined}
          startAt={0}
        />
      </button>
      {presence.mounted && (
        <div
          ref={pop}
          className={cx('sp-vars-pop', presence.closing && 'is-closing')}
          role="menu"
          aria-label="Variables"
        >
          <p className="sp-vars-pop__note">
            Sparko fills these in when it sends the message. Click one to add it
            where you were writing.
          </p>
          <label className="sp-vars-pop__search">
            <Icon name="search" size="sm" />
            <input
              type="search"
              aria-label="Search variables"
              placeholder="Search variables"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {list.map((v) => {
            const ok = works(v);
            const tag = tagOf(v);
            return (
              <button
                key={v.name}
                type="button"
                role="menuitem"
                className={cx('sp-vars-pop__item', !ok && 'is-off')}
                onClick={() => {
                  onPick(`{${v.name}}`);
                  toggle(false);
                }}
              >
                <span className="sp-vars-pop__head">
                  <code>{`{${v.name}}`}</code>
                  {tag && (
                    <HoverTip
                      className="sp-vars-pop__tag"
                      text={tag.tip}
                      focusable={false}
                    >
                      {tag.label}
                    </HoverTip>
                  )}
                </span>
                <span>{v.about}</span>
              </button>
            );
          })}
          {!list.length && (
            <p className="sp-vars-pop__note">Nothing matches “{query}”.</p>
          )}
        </div>
      )}
    </div>
  );
}
