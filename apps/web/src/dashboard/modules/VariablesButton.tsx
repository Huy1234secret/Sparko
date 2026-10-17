import { useRef, useState } from 'react';
import {
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
  member,
  role,
  suggestion,
  onPick,
}: {
  /** Components V2 messages also have {separator}. */
  v2: boolean;
  /** Welcome, leave and boost messages fill in more about the member. */
  member?: boolean;
  /** Reaction role responses fill in the role. */
  role?: boolean;
  /** Suggestion messages fill in the suggestion. */
  suggestion?: boolean;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The book draws in, flips its pages on hover, and opens while the list
  // is showing (closing again when it goes).
  const [anim, setAnim] = useState<'reveal' | 'hover' | 'open'>('reveal');
  const [playKey, setPlayKey] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = (next: boolean) => {
    setOpen(next);
    if (next) setAnim('open');
  };
  const pop = useRef<HTMLDivElement>(null);
  useDismiss(open, () => toggle(false), wrap);
  const presence = usePresence(open);
  usePlacement(presence.mounted, wrap, pop, menuPlacement);
  const list = [
    ...studioVariables.filter(
      (v) =>
        (member || !v.member) &&
        (role || !v.role) &&
        (suggestion || !v.suggestion),
    ),
    ...(v2
      ? [
          {
            name: 'separator',
            about:
              'Draws a line across the container and starts a new section.',
          },
        ]
      : []),
  ];
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
          {list.map((v, i) => (
            <button
              key={v.name}
              type="button"
              role="menuitem"
              className="sp-vars-pop__item"
              autoFocus={i === 0}
              onClick={() => {
                onPick(`{${v.name}}`);
                toggle(false);
              }}
            >
              <code>{`{${v.name}}`}</code>
              <span>{v.about}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
