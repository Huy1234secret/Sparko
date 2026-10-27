import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Icon,
  Input,
  Modal,
  Segmented,
  Switch,
  cx,
  useToast,
  type ComboItem,
} from '../../ui';
import {
  LV_FORMULA,
  LV_FORMULA_MAX,
  LV_MAX_CHANGE,
  lvFormulaIssue,
  lvNeed,
  lvRanges,
  lvTotalFor,
  useLevelActions,
  useLevelBoard,
  useLevelCrates,
  useLevelFind,
  useLevelMember,
  type Channel,
  type LVFound,
  type LVRow,
  type LVState,
  type Levels,
  type LvAnnounce,
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

/** Roles for "who" pickers; Sparko doesn't give them, so any can be picked. */
const anyRoles = (roles: RoleOption[]): ComboItem[] =>
  roleItems(roles.map((r) => ({ ...r, assignable: true })));
/** Channels for "where" pickers; Sparko only reads them, so any can be picked. */
const anyChannels = (channels: Channel[]): ComboItem[] =>
  channels.map((c) => ({
    value: c.id,
    label: c.name,
    icon: 'hash',
    group: c.category,
  }));

const n = (v: number) => v.toLocaleString('en-US');
/** A whole number typed in a box, kept within a range. */
const whole = (v: string, max: number) =>
  Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));
const roleName = (roles: RoleOption[], id: string) =>
  roles.find((r) => r.id === id)?.name ?? 'deleted role';
const roleColour = (roles: RoleOption[], id: string) =>
  roles.find((r) => r.id === id)?.color ?? '#99AAB5';
// Settings: how XP is earned --------------------------------------------------

/**
 * The XP each level needs, as a line. Hovering anywhere (or the arrow keys)
 * picks the nearest level and says what it needs.
 */
function CurveChart({ config }: { config: Levels }) {
  const top = Math.max(1, config.maxLevel);
  const needs = useMemo(
    () => Array.from({ length: top }, (_, i) => lvNeed(config.formula, i)),
    [config.formula, top],
  );
  const [level, setLevel] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const most = Math.max(...needs);
  const xOf = (lv: number) => (top === 1 ? 50 : ((lv - 1) / (top - 1)) * 100);
  const yOf = (v: number) => 100 - (v / most) * 100;
  const line = needs
    .map((v, i) => `${i ? 'L' : 'M'}${xOf(i + 1) * 10},${yOf(v) * 2.4}`)
    .join(' ');
  const total = (lv: number) => needs.slice(0, lv).reduce((a, b) => a + b, 0);
  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const at = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setLevel(Math.round(1 + at * (top - 1)));
  };
  const keys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const now = level ?? 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? now + step
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? now - step
          : e.key === 'Home'
            ? 1
            : e.key === 'End'
              ? top
              : null;
    if (next === null) return;
    e.preventDefault();
    setLevel(Math.min(top, Math.max(1, next)));
  };
  const shown = level ?? null;
  const tipLeft = shown ? xOf(shown) : 0;
  return (
    <figure className="sp-lv-chart">
      <div className="sp-lv-chart__y" aria-hidden="true">
        <span>{n(most)} XP</span>
        <span>0</span>
      </div>
      <div
        ref={box}
        className="sp-lv-chart__plot"
        role="slider"
        tabIndex={0}
        aria-label="XP each level needs"
        aria-valuemin={1}
        aria-valuemax={top}
        aria-valuenow={shown ?? 1}
        aria-valuetext={`Level ${shown ?? 1} needs ${n(needs[(shown ?? 1) - 1]!)} XP`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setLevel(null)}
        onFocus={() => setLevel((l) => l ?? 1)}
        onBlur={() => setLevel(null)}
        onKeyDown={keys}
      >
        <svg
          className="sp-lv-chart__svg"
          viewBox="0 0 1000 240"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="sp-lv-chart__line" d={line} />
        </svg>
        {shown && (
          <>
            <span
              className="sp-lv-chart__guide"
              style={{ left: `${tipLeft}%` }}
            />
            <span
              className="sp-lv-chart__dot"
              style={{
                left: `${tipLeft}%`,
                top: `${yOf(needs[shown - 1]!)}%`,
              }}
            />
            <span
              className={cx('sp-lv-chart__tip', tipLeft > 70 && 'is-left')}
              style={{ left: `${tipLeft}%` }}
              aria-hidden="true"
            >
              <b>Level {shown}</b>
              <span>
                {n(needs[shown - 1]!)} XP from level {shown - 1}
              </span>
              <span className="sp-hint">{n(total(shown))} XP in all</span>
            </span>
          </>
        )}
      </div>
      <div className="sp-lv-chart__x" aria-hidden="true">
        <span>Level 1</span>
        <span>Level {top}</span>
      </div>
    </figure>
  );
}

/** The Settings tab: XP for chat and voice, levels, where XP is earned. */
export function LVRules({
  config,
  channels,
  roles,
  limits,
  onChange,
}: {
  config: Levels;
  channels: Channel[];
  roles: RoleOption[];
  limits: LVState['limits'];
  onChange: (patch: Partial<Levels>) => void;
}) {
  const r = lvRanges;
  const full = config.boosts.length >= limits.boosts;
  const message = config.message;
  const voice = config.voice;
  const editBoost = (id: string, patch: Partial<Levels['boosts'][number]>) =>
    onChange({
      boosts: config.boosts.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  const formulaIssue = lvFormulaIssue(
    config.formula,
    Math.min(Math.max(config.maxLevel, 1), lvRanges.maxLevel.max),
  );
  return (
    <div className="sp-stack sp-ar sp-lv">
      <section className="sp-card" aria-labelledby="lv-earn">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="lv-earn">
              Earning XP
            </h2>
            <p className="sp-card__sub">
              Members earn XP for chatting and for time in voice channels.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <ul className="sp-sg-commands sp-lv-earn">
            <li
              className={cx('sp-sg-command', !message.on && 'is-off')}
              data-issue="message:xp"
            >
              <div className="sp-sg-command__head">
                <span className="sp-sg-command__title">
                  <Icon name="message-square" size="sm" />
                  Chatting
                  <InfoTip text="Each message earns a random amount between the two numbers, once per cooldown. Bots, commands and Discord’s own notices never earn." />
                </span>
                <Switch
                  checked={message.on}
                  onChange={(on) => onChange({ message: { ...message, on } })}
                  description="XP for messages on or off"
                />
              </div>
              <div className="sp-lv-trio">
                <Input
                  label="Least XP"
                  type="number"
                  min={r.xp.min}
                  max={r.xp.max}
                  disabled={!message.on}
                  value={message.min ? String(message.min) : ''}
                  onChange={(e) =>
                    onChange({
                      message: {
                        ...message,
                        min: whole(e.target.value, r.xp.max),
                      },
                    })
                  }
                />
                <Input
                  label="Most XP"
                  type="number"
                  min={r.xp.min}
                  max={r.xp.max}
                  disabled={!message.on}
                  value={message.max ? String(message.max) : ''}
                  onChange={(e) =>
                    onChange({
                      message: {
                        ...message,
                        max: whole(e.target.value, r.xp.max),
                      },
                    })
                  }
                />
                <div data-issue="message:cooldown">
                  <Input
                    label={tipped(
                      'Cooldown (seconds)',
                      'Seconds before the same member can earn from chat again. It stops spam from paying off.',
                    )}
                    aria-label="Cooldown (seconds)"
                    type="number"
                    min={r.cooldown.min}
                    max={r.cooldown.max}
                    disabled={!message.on}
                    value={String(message.cooldown)}
                    onChange={(e) =>
                      onChange({
                        message: {
                          ...message,
                          cooldown: whole(e.target.value, r.cooldown.max),
                        },
                      })
                    }
                  />
                </div>
              </div>
            </li>
            <li
              className={cx('sp-sg-command', !voice.on && 'is-off')}
              data-issue="voice:xp"
            >
              <div className="sp-sg-command__head">
                <span className="sp-sg-command__title">
                  <Icon name="volume-2" size="sm" />
                  Voice
                  <InfoTip text="XP for every minute in a voice channel. The AFK channel never earns." />
                </span>
                <Switch
                  checked={voice.on}
                  onChange={(on) => onChange({ voice: { ...voice, on } })}
                  description="XP for voice on or off"
                />
              </div>
              <div className="sp-lv-trio">
                <Input
                  label="XP a minute"
                  type="number"
                  min={r.perMinute.min}
                  max={r.perMinute.max}
                  disabled={!voice.on}
                  value={voice.perMinute ? String(voice.perMinute) : ''}
                  onChange={(e) =>
                    onChange({
                      voice: {
                        ...voice,
                        perMinute: whole(e.target.value, r.perMinute.max),
                      },
                    })
                  }
                />
              </div>
              <div className="sp-ar__checks">
                <Checkbox
                  checked={voice.needOthers}
                  disabled={!voice.on}
                  onChange={(needOthers) =>
                    onChange({ voice: { ...voice, needOthers } })
                  }
                  label="Only with company"
                  description="Nobody earns alone in a channel, so sitting in an empty room doesn’t farm XP."
                />
                <Checkbox
                  checked={voice.skipMuted}
                  disabled={!voice.on}
                  onChange={(skipMuted) =>
                    onChange({ voice: { ...voice, skipMuted } })
                  }
                  label="Not while muted or deafened"
                  description="Members who muted themselves or were muted don’t earn."
                />
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="lv-curve">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="lv-curve">
              Levels
            </h2>
          </div>
        </div>
        <div className="sp-card__body">
          <div data-issue="formula" className="sp-lv-formula">
            <Input
              label={tipped(
                'XP to reach level x',
                'Use x for the level, numbers, + − * / % ^ and brackets. Level x needs this much XP more than level x − 1. Sparko’s own is 5*x^2 + 40*x + 55.',
              )}
              aria-label="XP to reach level x"
              spellCheck={false}
              autoComplete="off"
              maxLength={LV_FORMULA_MAX}
              placeholder={LV_FORMULA}
              value={config.formula}
              onChange={(e) => onChange({ formula: e.target.value })}
              {...(formulaIssue ? { error: formulaIssue } : {})}
            />
            {config.formula.trim() !== LV_FORMULA && (
              <Button
                size="sm"
                variant="ghost"
                icon="rotate-ccw"
                onClick={() => onChange({ formula: LV_FORMULA })}
              >
                Use Sparko’s
              </Button>
            )}
          </div>
          {formulaIssue ? (
            <p className="sp-hint sp-lv-chart__empty">
              Fix the equation to see each level’s XP.
            </p>
          ) : (
            <CurveChart config={config} />
          )}
          <div data-issue="maxLevel" className="sp-lv-max">
            <Input
              label={tipped(
                'Highest level',
                `From ${r.maxLevel.min} to ${r.maxLevel.max}. Members keep earning XP past it, for the leaderboard.`,
              )}
              aria-label="Highest level"
              type="number"
              min={r.maxLevel.min}
              max={r.maxLevel.max}
              value={config.maxLevel ? String(config.maxLevel) : ''}
              onChange={(e) =>
                onChange({ maxLevel: whole(e.target.value, r.maxLevel.max) })
              }
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="lv-where">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="lv-where">
              Where XP counts
            </h2>
            <p className="sp-card__sub">
              Channels and roles that never earn, and boosts for ones that earn
              more.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="noXpChannels">
              <Combobox
                label={tipped(
                  'No-XP channels',
                  'Messages and voice time here, and in their threads, earn nothing. Good for bot commands and spam channels.',
                )}
                multiple
                placeholder="Every channel earns"
                searchPlaceholder="Search channels"
                value={config.noXpChannels}
                onChange={(noXpChannels) => onChange({ noXpChannels })}
                items={anyChannels(channels)}
              />
            </div>
            <div data-issue="noXpRoles">
              <Combobox
                label={tipped(
                  'No-XP roles',
                  'Members with any of these roles never earn XP, like muted members.',
                )}
                multiple
                placeholder="Every role earns"
                searchPlaceholder="Search roles"
                value={config.noXpRoles}
                onChange={(noXpRoles) => onChange({ noXpRoles })}
                items={anyRoles(roles)}
              />
            </div>
          </div>
          <div className="sp-lv-boosts" data-issue="boosts">
            <div className="sp-lv-boosts__head">
              <h3 className="sp-bd-month__title">
                XP boosts
                <InfoTip text="Multiply XP for members with a role or in a channel. A member gets their best role boost, times the channel’s." />
              </h3>
              <div className="sp-ar__head-actions">
                <Used
                  n={config.boosts.length}
                  max={limits.boosts}
                  what="boosts"
                  icon="boost"
                />
                <AnimatedIconButton
                  size="sm"
                  {...plusAnimations}
                  disabled={full}
                  title={
                    full
                      ? `This plan has up to ${limits.boosts} boosts.`
                      : undefined
                  }
                  onClick={() =>
                    onChange({
                      boosts: [
                        ...config.boosts,
                        {
                          id: newId(),
                          kind: 'role',
                          target: '',
                          multiplier: 2,
                        },
                      ],
                    })
                  }
                >
                  Boost
                </AnimatedIconButton>
              </div>
            </div>
            {config.boosts.length ? (
              <ul className="sp-ar__list">
                {config.boosts.map((b, i) => (
                  <li
                    key={b.id}
                    className="sp-ar__item sp-lv-boost"
                    aria-label={`Boost ${i + 1}`}
                    data-issue={`boost:${b.id}`}
                  >
                    <Segmented
                      label={`Boost ${i + 1} is for`}
                      value={b.kind}
                      onChange={(kind) => editBoost(b.id, { kind, target: '' })}
                      options={[
                        { value: 'role', label: 'Role' },
                        { value: 'channel', label: 'Channel' },
                      ]}
                    />
                    <Combobox
                      label={b.kind === 'role' ? 'Role' : 'Channel'}
                      placeholder={
                        b.kind === 'role' ? 'Pick a role' : 'Pick a channel'
                      }
                      searchPlaceholder="Search"
                      value={b.target}
                      onChange={(target) => editBoost(b.id, { target })}
                      items={
                        b.kind === 'role'
                          ? anyRoles(roles)
                          : anyChannels(channels)
                      }
                    />
                    <Input
                      label={tipped(
                        'Multiplier',
                        `From ${r.multiplier.min} to ${r.multiplier.max}. 2 doubles XP, 0.5 halves it.`,
                      )}
                      aria-label="Multiplier"
                      type="number"
                      step={0.1}
                      min={r.multiplier.min}
                      max={r.multiplier.max}
                      value={String(b.multiplier)}
                      onChange={(e) =>
                        editBoost(b.id, {
                          multiplier:
                            Math.round(
                              Math.min(
                                r.multiplier.max,
                                Math.max(0, Number(e.target.value) || 0),
                              ) * 10,
                            ) / 10,
                        })
                      }
                    />
                    <button
                      type="button"
                      className="sp-icon-btn sp-icon-btn--danger"
                      aria-label={`Remove boost ${i + 1}`}
                      onClick={() =>
                        onChange({
                          boosts: config.boosts.filter((x) => x.id !== b.id),
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
                No boosts. Add one to thank server boosters or liven up a
                channel.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="lv-staff">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="lv-staff">
              Staff
            </h2>
            <p className="sp-card__sub">
              Who can give, take, set and reset XP with /
              {config.commands.xp.name}.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div data-issue="staff" className="sp-inv-staff">
            <Combobox
              label={tipped(
                'Who can change XP',
                'These roles can use the staff command. Leave it empty for members with Manage Server.',
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

// Level-up --------------------------------------------------------------------

const announceNames: Record<LvAnnounce, string> = {
  same: 'Where they chatted',
  channel: 'A channel',
  dm: 'In DMs',
  off: 'Nowhere',
};
const announceAbout: Record<LvAnnounce, string> = {
  same: 'Posted in the channel the member levelled up in. Voice level-ups go to the channel below.',
  channel: 'Every level-up is posted in one channel.',
  dm: 'Sent to the member in a DM. Members who closed their DMs don’t get it.',
  off: 'Nobody is told. Levels and reward roles still work.',
};

/** Where and when level-ups are announced. */
export function LVLevelUpSettings({
  config,
  channels,
  onChange,
}: {
  config: Levels;
  channels: Channel[];
  onChange: (patch: Partial<Levels>) => void;
}) {
  const l = config.levelUp;
  const channel = channels.find((c) => c.id === l.channel);
  const needsChannel = l.where === 'same' || l.where === 'channel';
  const every = Math.max(1, l.every);
  const shown = Array.from({ length: 5 }, (_, i) => (i + 1) * every).filter(
    (x) => x <= config.maxLevel,
  );
  return (
    <section className="sp-card" aria-labelledby="lv-announce">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="lv-announce">
            Announcing level-ups
          </h2>
          <p className="sp-card__sub">{announceAbout[l.where]}</p>
        </div>
      </div>
      <div className="sp-card__body">
        <Segmented
          label="Where"
          className="sp-wrap-seg"
          value={l.where}
          onChange={(where) => onChange({ levelUp: { ...l, where } })}
          options={(['same', 'channel', 'dm', 'off'] as const).map((w) => ({
            value: w,
            label: announceNames[w],
          }))}
        />
        <div className="sp-ar__pair">
          {needsChannel && (
            <div data-issue="levelUp:channel">
              <ChannelPicker
                label={l.where === 'same' ? 'Channel for voice' : 'Channel'}
                channels={channels}
                value={l.channel}
                onChange={(id) => onChange({ levelUp: { ...l, channel: id } })}
                error={
                  channel && !channel.canPost
                    ? 'Sparko can’t post here yet.'
                    : undefined
                }
              />
            </div>
          )}
          <div data-issue="levelUp:every">
            <Input
              label={tipped(
                'Announce every N levels',
                'Only every Nth level is announced. 5 announces levels 5, 10, 15 and so on. Reward roles are always given.',
              )}
              aria-label="Announce every N levels"
              type="number"
              min={lvRanges.every.min}
              max={lvRanges.every.max}
              disabled={l.where === 'off'}
              value={l.every ? String(l.every) : ''}
              onChange={(e) =>
                onChange({
                  levelUp: {
                    ...l,
                    every: whole(e.target.value, lvRanges.every.max),
                  },
                })
              }
            />
          </div>
        </div>
        {l.where !== 'off' && (
          <p className="sp-hint">
            Announced at levels {shown.join(', ')}
            {shown.length === 5 ? ' and so on' : ''}. Reward roles are given at
            every level either way.
          </p>
        )}
      </div>
    </section>
  );
}

// Reward roles ----------------------------------------------------------------

/** The Reward roles tab: roles members get at a level. */
export function LVRewards({
  config,
  roles,
  limits,
  onChange,
}: {
  config: Levels;
  roles: RoleOption[];
  limits: LVState['limits'];
  onChange: (patch: Partial<Levels>) => void;
}) {
  const full = config.rewards.length >= limits.rewards;
  const edit = (id: string, patch: Partial<Levels['rewards'][number]>) =>
    onChange({
      rewards: config.rewards.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    });
  return (
    <div className="sp-stack sp-ar sp-lv">
      <section
        className="sp-card"
        aria-labelledby="lv-rewards"
        data-issue="rewards"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="lv-rewards">
              Reward roles
            </h2>
            <p className="sp-card__sub">
              Roles members get when they reach a level. Sparko’s role has to be
              above them.
            </p>
          </div>
          <div className="sp-ar__head-actions">
            <Used
              n={config.rewards.length}
              max={limits.rewards}
              what="reward roles"
              icon="status"
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
                const top = Math.max(0, ...config.rewards.map((r) => r.level));
                onChange({
                  rewards: [
                    ...config.rewards,
                    {
                      id: newId(),
                      level: Math.min(config.maxLevel, top ? top + 5 : 5),
                      role: '',
                    },
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
            <ul className="sp-ar__list sp-lv-rewards">
              {config.rewards.map((r, i) => (
                <li
                  key={r.id}
                  className="sp-ar__item sp-lv-reward"
                  aria-label={`Reward ${i + 1}`}
                  data-issue={`reward:${r.id}`}
                >
                  <Input
                    label={tipped(
                      'Level',
                      r.level
                        ? `Level ${r.level} takes ${n(lvTotalFor(config.formula, r.level))} XP in all. Pick from 1 to ${config.maxLevel}.`
                        : `The level that gives it, from 1 to ${config.maxLevel}.`,
                    )}
                    aria-label="Level"
                    type="number"
                    min={1}
                    max={config.maxLevel}
                    value={r.level ? String(r.level) : ''}
                    onChange={(e) =>
                      edit(r.id, {
                        level: whole(e.target.value, lvRanges.maxLevel.max),
                      })
                    }
                  />
                  <Combobox
                    label="Role"
                    placeholder="Pick a role"
                    searchPlaceholder="Search roles"
                    value={r.role}
                    onChange={(role) => edit(r.id, { role })}
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
            <EmptyState icon="award" title="No reward roles yet">
              Add one to give members something to level up for, like a Regular
              role at level 10.
            </EmptyState>
          )}
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.stackRewards}
              onChange={(stackRewards) => onChange({ stackRewards })}
              label="Keep every reward earned"
              description="Off: members only keep their highest reward, and lower ones are taken off."
            />
            <Checkbox
              checked={config.removeRewards}
              onChange={(removeRewards) => onChange({ removeRewards })}
              label="Take rewards back below their level"
              description="When staff take XP or reset someone, Sparko takes back rewards they’re no longer at."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// XP crates -------------------------------------------------------------------

const ago = (at: number, now: number) => {
  const m = Math.round((now - at) / 60_000);
  return m < 1
    ? 'just now'
    : m < 60
      ? `${m}m ago`
      : m < 48 * 60
        ? `${Math.round(m / 60)}h ago`
        : `${Math.round(m / 1440)}d ago`;
};

/** Crates dropped so far: how many, opened, and the XP they gave. */
export function LVCrateStats({
  server,
  channels,
}: {
  server: Server;
  channels: Channel[];
}) {
  const crates = useLevelCrates(server.id);
  const [now] = useState(() => Date.now());
  const d = crates.data;
  const rate = d && d.stats.dropped ? d.stats.opened / d.stats.dropped : 0;
  return (
    <section className="sp-card" aria-labelledby="lv-crate-stats">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="lv-crate-stats">
            Recent crates
          </h2>
          <p className="sp-card__sub">The latest drops and who opened them.</p>
        </div>
      </div>
      {!d ? (
        <div className="sp-card__body">
          <div className="sp-skel sp-skel--block" style={{ height: 140 }} />
        </div>
      ) : (
        <div className="sp-card__body sp-stack">
          <dl className="sp-inv-counts">
            {(
              [
                ['Dropped', n(d.stats.dropped)],
                ['Opened', n(d.stats.opened)],
                ['Opened in time', `${Math.round(rate * 100)}%`],
                [
                  'Average win',
                  d.stats.opened
                    ? n(Math.round(d.stats.xp / d.stats.opened))
                    : '–',
                ],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="sp-inv-count">
                <dt>{label}</dt>
                <dd className="sp-tnum">{v}</dd>
              </div>
            ))}
            <div className="sp-inv-count is-total">
              <dt>XP given</dt>
              <dd className="sp-tnum">{n(d.stats.xp)}</dd>
            </div>
          </dl>
          {d.crates.length ? (
            <ul className="sp-bd-rows sp-lv-crates" aria-label="Recent crates">
              {d.crates.slice(0, 8).map((c) => (
                <li
                  key={c.id}
                  className={cx(
                    'sp-bd-row',
                    c.state === 'expired' && 'is-left',
                  )}
                >
                  <span className="sp-lv-crate-icon" aria-hidden="true">
                    <Icon name="gift" size="sm" />
                  </span>
                  <span className="sp-bd-row__main">
                    <span className="sp-bd-row__line">
                      <span className="sp-bd-row__name">
                        {c.state === 'claimed'
                          ? `${c.claimedName} won ${n(c.xp)} XP`
                          : c.state === 'open'
                            ? 'Waiting to be opened'
                            : 'Nobody opened it'}
                      </span>
                      {c.state === 'open' && (
                        <Badge size="sm" tone="success">
                          Live
                        </Badge>
                      )}
                    </span>
                    <span className="sp-hint sp-bd-row__meta">
                      #
                      {channels.find((x) => x.id === c.channelId)?.name ??
                        'deleted-channel'}{' '}
                      · {ago(c.droppedAt, now)}
                      {c.claimedAt
                        ? ` · opened in ${Math.max(1, Math.round((c.claimedAt - c.droppedAt) / 1000))}s`
                        : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="gift" title="No crates yet">
              Once crates are on, they drop as members chat. Send a test from
              the preview to see one.
            </EmptyState>
          )}
        </div>
      )}
    </section>
  );
}

/** The crate settings: on, where, how often and how much. */
export function LVCrateSettings({
  config,
  channels,
  onChange,
}: {
  config: Levels;
  channels: Channel[];
  onChange: (patch: Partial<Levels>) => void;
}) {
  const k = config.crates;
  const r = lvRanges;
  const set = (patch: Partial<Levels['crates']>) =>
    onChange({ crates: { ...k, ...patch } });
  const every = k.chance > 0 ? Math.round(100 / k.chance) : 0;
  return (
    <div className="sp-stack sp-ar sp-lv">
      <section
        className={cx('sp-card', !k.on && 'is-off')}
        aria-labelledby="lv-crates"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="lv-crates">
              XP crates
            </h2>
            <p className="sp-card__sub">
              Now and then a message drops a crate. The first member to press
              Open wins the XP inside.
            </p>
          </div>
          <Switch
            checked={k.on}
            onChange={(on) => set({ on })}
            description="XP crates on or off"
          />
        </div>
        <div className="sp-card__body">
          <div data-issue="crates:channels">
            <Combobox
              label={tipped(
                'Channels',
                'Crates only drop here. Leave it empty for anywhere members earn XP.',
              )}
              multiple
              disabled={!k.on}
              placeholder="Anywhere members earn XP"
              searchPlaceholder="Search channels"
              value={k.channels}
              onChange={(list) => set({ channels: list })}
              items={channels.map((c) => ({
                value: c.id,
                label: c.name,
                icon: 'hash',
                group: c.category,
                disabled: !c.canPost && !k.channels.includes(c.id),
                ...(c.canPost ? {} : { note: 'Sparko can’t post' }),
              }))}
            />
          </div>
          <div className="sp-lv-trio">
            <div data-issue="crates:chance">
              <Input
                label={tipped(
                  'Drop chance (%)',
                  `The chance each message drops one, from ${r.chance.min}% to ${r.chance.max}%.`,
                )}
                aria-label="Drop chance (%)"
                type="number"
                step={0.1}
                min={r.chance.min}
                max={r.chance.max}
                disabled={!k.on}
                value={String(k.chance)}
                onChange={(e) =>
                  set({
                    chance:
                      Math.round(
                        Math.min(
                          r.chance.max,
                          Math.max(0, Number(e.target.value) || 0),
                        ) * 10,
                      ) / 10,
                  })
                }
              />
            </div>
            <div data-issue="crates:cooldown">
              <DurationInput
                label="Cooldown"
                tip="The shortest time between drops in a channel, like 10mi or 1h."
                value={k.cooldown}
                placeholder="10mi"
                range={r.crateCooldown}
                format="Use mi, h and d, like 10mi or 1h."
                onChange={(cooldown) => set({ cooldown })}
              />
            </div>
            <div data-issue="crates:time">
              <Input
                label={tipped(
                  'Open within (seconds)',
                  `Seconds before an unopened crate vanishes, from ${r.crateTime.min} to ${r.crateTime.max}.`,
                )}
                aria-label="Open within (seconds)"
                type="number"
                min={r.crateTime.min}
                max={r.crateTime.max}
                disabled={!k.on}
                value={k.time ? String(k.time) : ''}
                onChange={(e) =>
                  set({ time: whole(e.target.value, r.crateTime.max) })
                }
              />
            </div>
          </div>
          <div className="sp-ar__pair" data-issue="crates:xp">
            <Input
              label="Least XP inside"
              type="number"
              min={r.crateXp.min}
              max={r.crateXp.max}
              disabled={!k.on}
              value={k.min ? String(k.min) : ''}
              onChange={(e) =>
                set({ min: whole(e.target.value, r.crateXp.max) })
              }
            />
            <Input
              label="Most XP inside"
              type="number"
              min={r.crateXp.min}
              max={r.crateXp.max}
              disabled={!k.on}
              value={k.max ? String(k.max) : ''}
              onChange={(e) =>
                set({ max: whole(e.target.value, r.crateXp.max) })
              }
            />
          </div>
          {every > 0 && (
            <p className="sp-hint">
              About 1 in {n(every)} messages drops a crate, at most one per
              channel every {k.cooldown || 'cooldown'}. Each holds {n(k.min)} to{' '}
              {n(k.max)} XP and lasts {k.time} seconds.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

// Rank cards ------------------------------------------------------------------

/** Who sees /rank's answer. */
export function LVRankSettings({
  config,
  onChange,
}: {
  config: Levels;
  onChange: (patch: Partial<Levels>) => void;
}) {
  const rank = config.rank;
  return (
    <section className="sp-card" aria-labelledby="lv-rank">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="lv-rank">
            The /{config.commands.rank.name} command
          </h2>
          <p className="sp-card__sub">
            Members see this card when they use /{config.commands.rank.name},
            for themselves or another member.
          </p>
        </div>
      </div>
      <div className="sp-card__body">
        <Checkbox
          checked={rank.public}
          onChange={(pub) => onChange({ rank: { ...rank, public: pub } })}
          label="Show it to everyone in the channel"
          description="Off: only the member who asked sees their card."
        />
      </div>
    </section>
  );
}

// Leaderboard -----------------------------------------------------------------

type Who = { userId: string; name: string; avatar: string };
type Mode = 'give' | 'take' | 'set';
const modeNames: Record<Mode, string> = {
  give: 'Give',
  take: 'Take',
  set: 'Set to',
};

/** Give, take or set XP for a member found or picked. */
function XpForm({
  server,
  who: picked,
  onClose,
}: {
  server: Server;
  who: Who | null;
  onClose: () => void;
}) {
  const [who, setWho] = useState(picked);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('give');
  const [amount, setAmount] = useState('');
  const [tried, setTried] = useState(false);
  const found = useLevelFind(server.id, query);
  const actions = useLevelActions(server.id);
  const toast = useToast();
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);
  const value = Number(amount);
  const least = mode === 'set' ? 0 : 1;
  const problem = !who
    ? 'Pick the member first.'
    : !amount.trim() ||
        !Number.isInteger(value) ||
        value < least ||
        value > LV_MAX_CHANGE
      ? `Write a whole number of XP from ${least} to ${n(LV_MAX_CHANGE)}.`
      : null;
  const save = () => {
    setTried(true);
    if (problem || !who) return;
    actions.change.mutate(
      { userId: who.userId, mode, amount: value },
      {
        onSuccess: (d) => {
          toast({
            title:
              mode === 'set'
                ? `Set ${who.name}’s XP to ${n(value)}`
                : `${mode === 'give' ? 'Gave' : 'Took'} ${n(value)} XP ${mode === 'give' ? 'to' : 'from'} ${who.name}`,
            body: `They’re level ${d.level} with ${n(d.xp)} XP now.`,
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
      icon="zap"
      title={picked ? `Change ${picked.name}’s XP` : 'Change a member’s XP'}
      description="Levels and reward roles follow the new XP."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={actions.change.isPending}
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
                  {(found.data ?? []).map((m: LVFound) => (
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
                          Level {m.level} · {n(m.xp)} XP
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
        <Segmented
          label="Change"
          value={mode}
          onChange={setMode}
          options={(['give', 'take', 'set'] as const).map((m) => ({
            value: m,
            label: modeNames[m],
          }))}
        />
        <Input
          label="XP"
          aria-label="XP"
          type="number"
          min={least}
          max={LV_MAX_CHANGE}
          placeholder="500"
          value={amount}
          onChange={(e) => setAmount(e.target.value.slice(0, 9))}
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

/** A thin bar for how far into their level someone is. */
const Progress = ({ percent, label }: { percent: number; label: string }) => (
  <span
    className="sp-lv-bar"
    role="progressbar"
    aria-label={label}
    aria-valuenow={percent}
    aria-valuemin={0}
    aria-valuemax={100}
    style={{ '--p': `${percent}%` } as CSSProperties}
  />
);

/** One member: their level, progress, numbers and reward roles. */
function MemberPanel({
  server,
  userId,
  roles,
  paused,
  onChange,
  onReset,
}: {
  server: Server;
  userId: string | null;
  roles: RoleOption[];
  paused: boolean;
  onChange: (who: Who) => void;
  onReset: (who: Who) => void;
}) {
  const detail = useLevelMember(server.id, userId);
  const d = detail.data;
  return (
    <section className="sp-card sp-inv-member" aria-labelledby="lv-member">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="lv-member">
            {d ? d.name : 'Member'}
          </h2>
          <p className="sp-card__sub">
            {d
              ? d.rank
                ? `#${d.rank} on the leaderboard`
                : 'Not on the leaderboard yet'
              : 'Pick someone on the leaderboard.'}
          </p>
        </div>
      </div>
      {!userId ? (
        <EmptyState icon="trending-up" title="Nobody picked">
          Pick a member on the leaderboard to see their level and change their
          XP.
        </EmptyState>
      ) : !d ? (
        <div className="sp-card__body">
          <div className="sp-skel sp-skel--block" style={{ height: 180 }} />
        </div>
      ) : (
        <div className="sp-card__body sp-stack">
          <div className="sp-lv-hero">
            <span
              className="sp-lv-ring"
              style={{ '--p': `${d.percent}` } as CSSProperties}
            >
              <img src={d.avatar || undefined} alt="" />
            </span>
            <span className="sp-lv-hero__text">
              <span className="sp-lv-hero__level">Level {d.level}</span>
              <span className="sp-hint sp-tnum">
                {d.max
                  ? 'The highest level'
                  : `${n(d.into)} / ${n(d.need)} XP to level ${d.level + 1}`}
              </span>
            </span>
          </div>
          <Progress
            percent={d.percent}
            label={`${d.name}’s progress to the next level`}
          />
          <dl className="sp-inv-counts">
            {(
              [
                ['Messages', n(d.messages)],
                ['Voice', `${n(Math.round(d.voiceMinutes / 60))}h`],
                ['Rank', d.rank ? `#${d.rank}` : '–'],
                ['Level', n(d.level)],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="sp-inv-count">
                <dt>{label}</dt>
                <dd className="sp-tnum">{v}</dd>
              </div>
            ))}
            <div className="sp-inv-count is-total">
              <dt>XP</dt>
              <dd className="sp-tnum">{n(d.xp)}</dd>
            </div>
          </dl>
          <div className="sp-inv-member__actions">
            <Button
              size="sm"
              icon="zap"
              disabled={paused}
              onClick={() => onChange(d)}
            >
              Change XP
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="rotate-ccw"
              disabled={paused || !d.xp}
              onClick={() => onReset(d)}
            >
              Reset
            </Button>
          </div>
          <div className="sp-inv-by">
            <h3 className="sp-bd-month__title">Reward roles</h3>
            {d.rewards.length ? (
              <ul className="sp-lv-chips" aria-label="Reward roles earned">
                {d.rewards.map((r) => (
                  <li
                    key={r.level}
                    className="sp-lv-chip"
                    style={
                      { '--c': roleColour(roles, r.role) } as CSSProperties
                    }
                  >
                    @{roleName(roles, r.role)}
                    <span className="sp-hint">Lv {r.level}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sp-hint">None yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const medal = (rank: number | null) =>
  rank === 1
    ? 'is-gold'
    : rank === 2
      ? 'is-silver'
      : rank === 3
        ? 'is-bronze'
        : '';

/** The Leaderboard tab: everyone's XP, one member, and staff changes. */
export function LVLeaderboard({
  server,
  roles,
  count,
  paused,
}: {
  server: Server;
  roles: RoleOption[];
  count: number;
  paused: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const [changing, setChanging] = useState<{ who: Who | null } | null>(null);
  const [resetting, setResetting] = useState<Who | 'everyone' | null>(null);
  const board = useLevelBoard(server.id, query, page);
  const actions = useLevelActions(server.id);
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
            ? 'Reset everyone’s XP'
            : `Reset ${resetting.name}’s XP`,
          body: 'Reward roles follow the new levels.',
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
        <section className="sp-card" aria-labelledby="lv-board">
          <div className="sp-card__head">
            <div className="sp-card__titles">
              <h2 className="sp-card__title" id="lv-board">
                Leaderboard
              </h2>
              <p className="sp-card__sub">
                {n(shown)} {shown === 1 ? 'member has' : 'members have'} XP,
                most first.
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
                icon="zap"
                disabled={paused}
                onClick={() => setChanging({ who: null })}
              >
                Change XP
              </Button>
            </div>
          </div>
          <div className="sp-card__body sp-stack">
            <Input
              aria-label="Search members"
              icon="search"
              placeholder="Search members by name or user ID"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {board.isPending ? (
              <div className="sp-skel sp-skel--block" style={{ height: 260 }} />
            ) : rows.length ? (
              <div className="sp-inv-board-wrap">
                <table
                  className="sp-inv-board sp-lv-board"
                  aria-label="Leaderboard"
                >
                  <thead>
                    <tr>
                      <th className="sp-num">#</th>
                      <th>Member</th>
                      <th className="sp-inv-board__n">Progress</th>
                      <th className="sp-num sp-inv-board__n">Messages</th>
                      <th className="sp-num">XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: LVRow) => (
                      <tr
                        key={r.userId}
                        className={cx(picked === r.userId && 'is-picked')}
                        onClick={() => setPicked(r.userId)}
                      >
                        <td className="sp-num sp-inv-rank">
                          <span className={cx('sp-lv-rank', medal(r.rank))}>
                            {r.rank ?? '–'}
                          </span>
                        </td>
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
                              <span className="sp-hint">Level {r.level}</span>
                            </span>
                          </button>
                        </td>
                        <td className="sp-inv-board__n sp-lv-board__bar">
                          <Progress
                            percent={r.percent}
                            label={`${r.name}’s progress to level ${r.level + 1}`}
                          />
                        </td>
                        <td className="sp-num sp-inv-board__n">
                          {n(r.messages)}
                        </td>
                        <td className="sp-num sp-inv-total">{n(r.xp)}</td>
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
              <EmptyState icon="trending-up" title="Nobody here yet">
                {query.trim()
                  ? 'Nothing matches. Try another name or ID.'
                  : 'When members chat and talk in voice, they show here.'}
              </EmptyState>
            )}
          </div>
        </section>
        <MemberPanel
          server={server}
          userId={picked}
          roles={roles}
          paused={paused}
          onChange={(who) => setChanging({ who })}
          onReset={(who) => setResetting(who)}
        />
      </div>
      {changing && (
        <XpForm
          server={server}
          who={changing.who}
          onClose={() => setChanging(null)}
        />
      )}
      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        icon="rotate-ccw"
        title={
          resetting === 'everyone'
            ? 'Reset everyone’s XP?'
            : `Reset ${resetting?.name ?? ''}’s XP?`
        }
        description={
          resetting === 'everyone'
            ? 'Every member goes back to level 0. Their messages and voice time are cleared, and reward roles they’re no longer at are taken back.'
            : 'They go back to level 0, and reward roles they’re no longer at are taken back.'
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
