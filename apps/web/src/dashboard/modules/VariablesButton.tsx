import { useRef, useState } from 'react';
import { LottieIcon, cx, usePlacement } from '../../ui';
import { studioVariables } from '../../data';
import { useDismiss } from './EditorBits';
import bookReveal from '../../../../../design-system/assets/icons/animated-icons/info-book-icon-reveal.json?url';
import bookHover from '../../../../../design-system/assets/icons/animated-icons/info-book-icon-hover.json?url';
import bookOpen from '../../../../../design-system/assets/icons/animated-icons/info-book-icon-open.json?url';

export const variablesAnimations = [bookReveal, bookHover, bookOpen];

/**
 * The { } button beside the live preview: a list of variables, written in
 * braces, that Sparko fills in when it sends the message.
 */
export function VariablesButton({
  v2,
  onPick,
}: {
  /** Components V2 messages also have {separator}. */
  v2: boolean;
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
  usePlacement(open, wrap, pop, { gap: 8 });
  const list = [
    ...studioVariables,
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
      {open && (
        <div
          ref={pop}
          className="sp-vars-pop"
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
