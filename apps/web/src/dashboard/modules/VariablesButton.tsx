import { useRef, useState } from 'react';
import { cx } from '../../ui';
import { studioVariables } from '../../data';
import { useDismiss } from './EditorBits';

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
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), wrap);
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
        aria-label="Add a variable"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        {'{ }'}
      </button>
      {open && (
        <div className="sp-vars-pop" role="menu" aria-label="Variables">
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
                setOpen(false);
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
