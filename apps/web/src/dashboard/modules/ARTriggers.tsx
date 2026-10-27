import { Fragment, type CSSProperties } from 'react';
import { Checkbox, Combobox, Icon, Input, svgIcons } from '../../ui';
import {
  arBadges,
  arConditionNames,
  arRanges,
  parseDuration,
  type ARCondition,
  type ARConditionKind,
  type ARRule,
  type ARTimed,
  type AutoRoles,
  type RoleOption,
} from '../../data';
import { AnimatedIconButton } from './EditorBits';
import { PlusMenu } from './PlusMenu';
import { newId, roleItems } from './parts';
import { plusAnimations } from './StudioLibrary';

type Limits = { timed: number; rules: number; conditions: number };

const arFormat = 'Use m, h and d, like 30m, 12h or 7d.';

/** A time written like "7d": shows what it means, or what's wrong with it. */
function durationHint(
  text: string,
  range: { min: number; max: number },
  format: string,
) {
  const ms = parseDuration(text);
  if (ms === null) return format;
  if (ms < range.min || ms > range.max) return null;
  return undefined;
}

export function DurationInput({
  label,
  tip,
  value,
  onChange,
  range,
  placeholder,
  format = arFormat,
}: {
  label: string;
  tip: string;
  value: string;
  onChange: (v: string) => void;
  range: { min: number; max: number; label: string };
  placeholder: string;
  /** How to write it, shown when it can't be read. */
  format?: string;
}) {
  const hint = value.trim() ? durationHint(value, range, format) : undefined;
  return (
    <Input
      label={label}
      hint={tip}
      value={value}
      placeholder={placeholder}
      maxLength={20}
      onChange={(e) => onChange(e.target.value)}
      {...(hint === null
        ? { error: `Has to be between ${range.label}.` }
        : hint
          ? { error: hint }
          : {})}
    />
  );
}

/** "2/3 ⏳": how many of the plan's slots are used, with a small icon. */
export function Used({
  n,
  max,
  what,
  icon = 'sand',
}: {
  n: number;
  max: number;
  what: string;
  /** Sand clock by default; a cog, tag, star, ballot box, party popper, speaker, rocket or gift. */
  icon?:
    | 'sand'
    | 'gear'
    | 'status'
    | 'star'
    | 'poll'
    | 'party'
    | 'voice'
    | 'boost'
    | 'gift';
}) {
  const masks = {
    sand: svgIcons.sandClock,
    gear: svgIcons.cog,
    status: svgIcons.status,
    star: svgIcons.star,
    poll: svgIcons.poll,
    party: svgIcons.party,
    voice: svgIcons.voice,
    boost: svgIcons.boost,
    gift: svgIcons.gift,
  };
  const mask = masks[icon] || svgIcons.sandClock;
  return (
    <span className="sp-ar__used" title={`${n} of ${max} ${what} used`}>
      {n}/{max}
      <span
        className="sp-mask-icon"
        role="img"
        aria-label="used"
        style={{ '--sp-mask': `url("${mask}")` } as CSSProperties}
      />
    </span>
  );
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="sp-icon-btn sp-icon-btn--danger"
      aria-label={label}
      onClick={onClick}
    >
      <Icon name="trash-2" size="sm" />
    </button>
  );
}

/** The Triggers tab: join roles, timed roles and unique rules. */
export function ARTriggers({
  config,
  roles,
  limits,
  onChange,
}: {
  config: AutoRoles;
  roles: RoleOption[];
  limits: Limits;
  onChange: (patch: Partial<AutoRoles>) => void;
}) {
  const editTimed = (id: string, patch: Partial<ARTimed>) =>
    onChange({
      timed: config.timed.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  const editRule = (id: string, patch: Partial<ARRule>) =>
    onChange({
      rules: config.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });

  return (
    <div className="sp-stack sp-ar">
      <section className="sp-card" aria-labelledby="ar-join" data-issue="join">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="ar-join">
              Join roles
            </h2>
            <p className="sp-card__sub">
              Roles members get when they join the server.
            </p>
          </div>
        </div>
        <div className="sp-card__body sp-ar__pair">
          <Combobox
            label="Before verified"
            hint="Given the moment someone joins, while they still have to accept the server’s rules (Discord’s membership screening). Sparko takes these away and gives the After verified roles once they accept."
            multiple
            placeholder="No roles"
            searchPlaceholder="Search roles"
            value={config.join.before}
            onChange={(before) =>
              onChange({ join: { ...config.join, before } })
            }
            items={roleItems(roles, config.join.before)}
          />
          <Combobox
            label="After verified"
            hint="Given once someone accepts the server’s rules. If the server doesn’t ask new members to accept rules, these are given as soon as they join."
            multiple
            placeholder="No roles"
            searchPlaceholder="Search roles"
            value={config.join.after}
            onChange={(after) => onChange({ join: { ...config.join, after } })}
            items={roleItems(roles, config.join.after)}
          />
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="ar-timed"
        data-issue="timed"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="ar-timed">
              Timed roles
            </h2>
            <p className="sp-card__sub">
              Roles members get once they’ve been in the server for a while.
            </p>
          </div>
          <div className="sp-ar__head-actions">
            <Used
              n={config.timed.length}
              max={limits.timed}
              what="timed roles"
            />
            <AnimatedIconButton
              size="sm"
              {...plusAnimations}
              disabled={config.timed.length >= limits.timed}
              title={
                config.timed.length >= limits.timed
                  ? `This plan has up to ${limits.timed} timed roles.`
                  : undefined
              }
              onClick={() =>
                onChange({
                  timed: [
                    ...config.timed,
                    { id: newId(), after: '', role: '' },
                  ],
                })
              }
            >
              Timed role
            </AnimatedIconButton>
          </div>
        </div>
        <div className="sp-card__body">
          {config.timed.length ? (
            <ul className="sp-ar__list">
              {config.timed.map((t, i) => (
                <li
                  key={t.id}
                  className="sp-ar__item sp-ar__timed"
                  aria-label={`Timed role ${i + 1}`}
                  data-issue={`timed:${t.id}`}
                >
                  <h3 className="sp-ar__item-title">Timed role {i + 1}</h3>
                  <DurationInput
                    label="Time in the server"
                    tip="How long a member has to be in the server before they get this role. Write it with m (minutes), h (hours) and d (days), like 30m, 12h, 7d or 1d 12h. From 1 minute up to 2 years (730d)."
                    value={t.after}
                    placeholder="e.g. 7d"
                    range={arRanges.timed}
                    onChange={(after) => editTimed(t.id, { after })}
                  />
                  <Combobox
                    label="Role"
                    placeholder="Pick a role"
                    searchPlaceholder="Search roles"
                    value={t.role}
                    onChange={(role) => editTimed(t.id, { role })}
                    items={roleItems(roles, [t.role])}
                  />
                  <RemoveButton
                    label={`Remove timed role ${i + 1}`}
                    onClick={() =>
                      onChange({
                        timed: config.timed.filter((x) => x.id !== t.id),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="sp-hint">
              No timed roles yet. Add one to reward members who stay.
            </p>
          )}
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.restartOnLeave}
              onChange={(restartOnLeave) => onChange({ restartOnLeave })}
              label="Restart when a member leaves"
              description="Their time starts again from zero if they leave and come back. Off counts every stay together."
            />
            <Checkbox
              checked={config.stack}
              onChange={(stack) => onChange({ stack })}
              label="Stack timed roles"
              description="Members keep earlier timed roles. Off swaps each one for the next."
            />
          </div>
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="ar-rules"
        data-issue="rules"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="ar-rules">
              Unique rules
            </h2>
            <p className="sp-card__sub">
              Roles for members who meet your requirements.
            </p>
          </div>
          <div className="sp-ar__head-actions">
            <Used
              n={config.rules.length}
              max={limits.rules}
              what="rules"
              icon="gear"
            />
            <AnimatedIconButton
              size="sm"
              {...plusAnimations}
              disabled={config.rules.length >= limits.rules}
              title={
                config.rules.length >= limits.rules
                  ? `This plan has up to ${limits.rules} rules.`
                  : undefined
              }
              onClick={() =>
                onChange({
                  rules: [
                    ...config.rules,
                    {
                      id: newId(),
                      name: `Rule ${config.rules.length + 1}`,
                      conditions: [],
                      links: [],
                      role: '',
                      resetOnLeave: false,
                      removeOnLoss: true,
                    },
                  ],
                })
              }
            >
              Rule
            </AnimatedIconButton>
          </div>
        </div>
        <div className="sp-card__body">
          {config.rules.length ? (
            <ul className="sp-ar__list">
              {config.rules.map((r, i) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  index={i}
                  roles={roles}
                  maxConditions={limits.conditions}
                  onChange={(patch) => editRule(r.id, patch)}
                  onRemove={() =>
                    onChange({
                      rules: config.rules.filter((x) => x.id !== r.id),
                    })
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="sp-hint">
              No rules yet. A rule gives a role for things like an old account,
              a Discord badge or boosting.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

const newCondition = (kind: ARConditionKind): ARCondition =>
  kind === 'age'
    ? { id: newId(), kind, min: '30d' }
    : kind === 'badge'
      ? { id: newId(), kind, badges: [] }
      : { id: newId(), kind, for: '7d' };

const badgeItems = arBadges.map((b) => ({ value: b.id, label: b.label }));

function RuleCard({
  rule,
  index,
  roles,
  maxConditions,
  onChange,
  onRemove,
}: {
  rule: ARRule;
  index: number;
  roles: RoleOption[];
  maxConditions: number;
  onChange: (patch: Partial<ARRule>) => void;
  onRemove: () => void;
}) {
  const editCondition = (id: string, next: ARCondition) =>
    onChange({
      conditions: rule.conditions.map((c) => (c.id === id ? next : c)),
    });
  const add = (kind: ARConditionKind) =>
    onChange({
      conditions: [...rule.conditions, newCondition(kind)],
      links: rule.conditions.length ? [...rule.links, 'and'] : rule.links,
    });
  const remove = (at: number) =>
    onChange({
      conditions: rule.conditions.filter((_, i) => i !== at),
      // The link before it goes, or the one after for the first.
      links: rule.links.filter((_, i) => i !== Math.max(0, at - 1)),
    });
  const full = rule.conditions.length >= maxConditions;

  return (
    <li className="sp-ar__item sp-ar__rule" data-issue={`rule:${rule.id}`}>
      <div className="sp-ar__rule-head">
        <Input
          label={`Rule ${index + 1} name`}
          value={rule.name}
          maxLength={60}
          placeholder="Veteran"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <RemoveButton
          label={`Remove ${rule.name || `rule ${index + 1}`}`}
          onClick={onRemove}
        />
      </div>

      <div className="sp-ar__conds-head">
        <span className="sp-label">Requirements</span>
        <PlusMenu
          label={`Add a requirement to ${rule.name || `rule ${index + 1}`}`}
          items={(['age', 'badge', 'booster'] as const).map((kind) => ({
            label: arConditionNames[kind],
            disabled: full,
            note: `A rule has up to ${maxConditions} requirements.`,
            onSelect: () => add(kind),
          }))}
        />
      </div>
      {rule.conditions.length ? (
        <ol className="sp-ar__conds">
          {rule.conditions.map((c, i) => (
            <Fragment key={c.id}>
              {i > 0 && (
                <li
                  className="sp-ar__link"
                  aria-label={`How requirement ${i + 1} joins the one before`}
                >
                  <button
                    type="button"
                    className="sp-ar__link-btn"
                    aria-pressed={rule.links[i - 1] === 'or'}
                    title="Switch between AND and OR"
                    onClick={() =>
                      onChange({
                        links: rule.links.map((l, j) =>
                          j === i - 1 ? (l === 'and' ? 'or' : 'and') : l,
                        ),
                      })
                    }
                  >
                    {rule.links[i - 1] === 'or' ? 'OR' : 'AND'}
                  </button>
                </li>
              )}
              <li className="sp-ar__cond" data-issue={`cond:${c.id}`}>
                <span className="sp-ar__cond-name">
                  {arConditionNames[c.kind]}
                </span>
                <div className="sp-ar__cond-body">
                  {c.kind === 'age' && (
                    <DurationInput
                      label="Account at least this old"
                      tip="How old the member’s Discord account has to be, counted from when it was made. Use h and d, like 12h or 30d. From 1 day up to 2 years (730d)."
                      value={c.min}
                      placeholder="e.g. 30d"
                      range={arRanges.age}
                      onChange={(min) => editCondition(c.id, { ...c, min })}
                    />
                  )}
                  {c.kind === 'badge' && (
                    <Combobox
                      label="Has any of these badges"
                      hint="The member needs at least one of the badges you pick. Only badges on public profiles count; Discord doesn’t let bots see Nitro."
                      multiple
                      placeholder="Pick badges"
                      searchPlaceholder="Search badges"
                      value={c.badges}
                      onChange={(badges) =>
                        editCondition(c.id, { ...c, badges })
                      }
                      items={badgeItems}
                    />
                  )}
                  {c.kind === 'booster' && (
                    <>
                      <DurationInput
                        label="Boosting for at least"
                        tip="How long the member has been boosting without stopping. Use h and d, like 12h or 7d. From 1 day up to 365 days."
                        value={c.for}
                        placeholder="e.g. 7d"
                        range={arRanges.boost}
                        onChange={(v) => editCondition(c.id, { ...c, for: v })}
                      />
                    </>
                  )}
                </div>
                <RemoveButton
                  label={`Remove requirement ${i + 1}`}
                  onClick={() => remove(i)}
                />
              </li>
            </Fragment>
          ))}
        </ol>
      ) : (
        <p className="sp-hint">
          Add a requirement with +: account age, a Discord badge or boosting.
        </p>
      )}

      <Combobox
        label="Role it gives"
        placeholder="Pick a role"
        searchPlaceholder="Search roles"
        value={rule.role}
        onChange={(role) => onChange({ role })}
        items={roleItems(roles, [rule.role])}
      />
      <div className="sp-ar__checks">
        <Checkbox
          checked={rule.resetOnLeave}
          onChange={(resetOnLeave) => onChange({ resetOnLeave })}
          label="Reset this rule’s data when a member leaves"
          description="Forgets the boosts Sparko counted for them."
        />
        <Checkbox
          checked={rule.removeOnLoss}
          onChange={(removeOnLoss) => onChange({ removeOnLoss })}
          label="Remove the role if they stop meeting the rule"
          description="Like when they stop boosting or lose a badge."
        />
      </div>
    </li>
  );
}
