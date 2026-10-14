import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EmptyState,
  Input,
  LottieIcon,
  Segmented,
  Spinner,
  cx,
  preloadAnimations,
  rememberEmojis,
  renderDiscordText,
} from '../../ui';
import { useServerEmojis, type ServerEmoji } from '../../data';
import { useDismiss } from './EditorBits';

/**
 * An emoji picker like the ones in chat apps: every emoji Discord can show,
 * by group and searchable, and a tab with the server's own emojis.
 */
type Emoji = { emoji: string; name: string };
type Group = { name: string; emojis: Emoji[] };

/** Discord draws emojis with Twemoji, which covers Emoji 15.0. */
const DISCORD_EMOJI_VERSION = 15.0;

let groups: Promise<Group[]> | undefined;
const loadGroups = () =>
  (groups ??= import('unicode-emoji-json/data-by-group.json').then((m) =>
    (
      m.default as {
        name: string;
        emojis: { emoji: string; name: string; emoji_version: string }[];
      }[]
    ).map((g) => ({
      name: g.name,
      emojis: g.emojis
        .filter((e) => Number(e.emoji_version) <= DISCORD_EMOJI_VERSION)
        .map(({ emoji, name }) => ({ emoji, name })),
    })),
  ));

// The faces the button picks from, one per visit: each has an animation
// for appearing (_reveal) and one for hover (_hover).
const faceFiles = import.meta.glob<string>(
  '../../../../../design-system/assets/icons/animated-icons/emoji-button/emoji_*_{reveal,hover}.json',
  { query: '?url', import: 'default', eager: true },
);
const faceList = Object.entries(faceFiles)
  .filter(([path]) => path.endsWith('_hover.json'))
  .map(([path, hover]) => ({
    hover,
    reveal: faceFiles[path.replace('_hover.json', '_reveal.json')] ?? hover,
  }));

/**
 * A face picked at random, one per button: it plays its reveal when it
 * appears, then its hover each time the pointer comes over it.
 */
function useFace() {
  const [face] = useState(
    () => faceList[Math.floor(Math.random() * faceList.length)],
  );
  const [play, setPlay] = useState({ src: face?.reveal ?? '', key: 1 });
  // The hover animation is fetched now, so the first hover plays at once.
  useEffect(() => {
    if (face) preloadAnimations([face.hover], true);
  }, [face]);
  return {
    play,
    hover: () => setPlay((p) => ({ src: face?.hover ?? '', key: p.key + 1 })),
  };
}

/** The round button that opens the picker; its face is picked at random. */
export function EmojiButton({
  serverId,
  onPick,
}: {
  serverId: string;
  onPick: (text: string) => void;
}) {
  const { play, hover } = useFace();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), wrap);
  return (
    <div ref={wrap} className="sp-pop-anchor">
      <button
        type="button"
        className={cx('sp-emoji-btn', open && 'is-open')}
        aria-label="Add an emoji"
        aria-expanded={open}
        aria-haspopup="dialog"
        onPointerEnter={hover}
        onClick={() => setOpen((o) => !o)}
      >
        {play.src && (
          <LottieIcon src={play.src} size={24} playKey={play.key} original />
        )}
      </button>
      {open && (
        <EmojiPicker
          serverId={serverId}
          onPick={(text) => {
            onPick(text);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EmojiPicker({
  serverId,
  onPick,
  className,
}: {
  serverId: string;
  onPick: (text: string) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<'emoji' | 'server'>('emoji');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Group[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<string>('');
  const scroller = useRef<HTMLDivElement>(null);
  const server = useServerEmojis(serverId, tab === 'server');
  useEffect(() => {
    let gone = false;
    loadGroups()
      .then((g) => !gone && setList(g))
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
    };
  }, []);
  useEffect(() => {
    if (server.data) rememberEmojis(server.data);
  }, [server.data]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      (list ?? [])
        .map((g) => ({
          ...g,
          emojis: q ? g.emojis.filter((e) => e.name.includes(q)) : g.emojis,
        }))
        .filter((g) => g.emojis.length),
    [list, q],
  );
  const serverShown = (server.data ?? []).filter((e) =>
    e.name.toLowerCase().includes(q),
  );
  const codeOf = (e: ServerEmoji) =>
    `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;

  return (
    <div
      className={cx('sp-emoji-pop', className)}
      role="dialog"
      aria-label="Emoji"
    >
      <Segmented
        label="Emoji set"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'emoji', label: 'Emoji' },
          { value: 'server', label: 'Server' },
        ]}
      />
      <Input
        icon="search"
        aria-label="Search emoji"
        placeholder="Find an emoji"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      {tab === 'emoji' && !q && list && (
        <div
          className="sp-emoji-pop__groups"
          role="toolbar"
          aria-label="Groups"
        >
          {list.map((g, i) => (
            <button
              key={g.name}
              type="button"
              title={g.name}
              aria-label={g.name}
              onClick={() =>
                scroller.current
                  ?.querySelector(`[data-group="${i}"]`)
                  ?.scrollIntoView({ block: 'start' })
              }
            >
              {g.emojis[0]?.emoji}
            </button>
          ))}
        </div>
      )}
      <div ref={scroller} className="sp-emoji-pop__scroll">
        {tab === 'emoji' ? (
          failed ? (
            <p className="sp-hint">
              The emoji list didn’t load. Try again later.
            </p>
          ) : !list ? (
            <div className="sp-emoji-pop__wait">
              <Spinner />
            </div>
          ) : shown.length ? (
            shown.map((g) => (
              <section
                key={g.name}
                data-group={list.findIndex((x) => x.name === g.name)}
                aria-label={g.name}
              >
                <h4 className="sp-emoji-pop__group">{g.name}</h4>
                <div className="sp-emoji-grid">
                  {g.emojis.map((e) => (
                    <button
                      key={e.emoji}
                      type="button"
                      className="sp-emoji-cell"
                      aria-label={e.name}
                      onPointerEnter={() => setHover(`${e.emoji}  ${e.name}`)}
                      onFocus={() => setHover(`${e.emoji}  ${e.name}`)}
                      onClick={() => onPick(e.emoji)}
                    >
                      {e.emoji}
                    </button>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <p className="sp-hint">No emoji match “{query}”.</p>
          )
        ) : server.isPending ? (
          <div className="sp-emoji-pop__wait">
            <Spinner />
          </div>
        ) : serverShown.length ? (
          <div className="sp-emoji-grid">
            {serverShown.map((e) => (
              <button
                key={e.id}
                type="button"
                className="sp-emoji-cell"
                aria-label={e.name}
                onPointerEnter={() => setHover(`:${e.name}:`)}
                onFocus={() => setHover(`:${e.name}:`)}
                onClick={() => onPick(codeOf(e))}
              >
                <img src={e.url} alt="" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon="smile" title="No server emojis">
            {q
              ? `None match “${query}”.`
              : 'Emojis added in Server Settings show up here.'}
          </EmptyState>
        )}
      </div>
      <p className="sp-emoji-pop__name" aria-live="polite">
        {hover || 'Pick an emoji'}
      </p>
    </div>
  );
}

/**
 * The round emoji box in button and menu settings: empty until an emoji is
 * picked, which then shows inside it.
 */
export function EmojiField({
  serverId,
  value,
  onChange,
  label,
}: {
  serverId: string;
  value: string;
  onChange: (emoji: string) => void;
  label: string;
}) {
  const { play, hover } = useFace();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), wrap);
  return (
    <div ref={wrap} className="sp-pop-anchor sp-emoji-field">
      <button
        type="button"
        className={cx('sp-emoji-btn sp-emoji-circle', !!value && 'is-set')}
        onPointerEnter={hover}
        aria-label={
          value ? `${label}: change the emoji` : `${label}: add an emoji`
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        {value
          ? renderDiscordText(value)
          : play.src && (
              <LottieIcon
                src={play.src}
                size={28}
                playKey={play.key}
                original
              />
            )}
      </button>
      {value && (
        <button
          type="button"
          className="sp-emoji-circle__clear"
          aria-label={`${label}: remove the emoji`}
          onClick={() => onChange('')}
        >
          ×
        </button>
      )}
      {open && (
        <EmojiPicker
          serverId={serverId}
          className="sp-emoji-pop--start"
          onPick={(text) => {
            onChange(text);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
