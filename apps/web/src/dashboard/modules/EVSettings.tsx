import { useState, type ReactNode } from 'react';
import {
  Button,
  Checkbox,
  Combobox,
  Icon,
  Input,
  Switch,
  type ComboItem,
} from '../../ui';
import {
  evAnswerNames,
  evChoices,
  evRanges,
  evTextLimits,
  parseDuration,
  zoneOffset,
  type Channel,
  type EvChoice,
  type EvOptions,
  type Events,
  type RoleOption,
} from '../../data';
import { InfoTip } from './EditorBits';
import { Used } from './ARTriggers';
import { useZoneItems } from './BDSettings';
import { ChannelPicker, roleItems } from './parts';

const NONE = 'none';

/** A label with an (i) beside it that says more on hover. */
export const tipped = (text: string, tip: string): ReactNode => (
  <>
    {text} <InfoTip text={tip} />
  </>
);

/** Roles for "who can" pickers; Sparko doesn't give them, so any can be picked. */
export const anyRoles = (roles: RoleOption[]): ComboItem[] =>
  roleItems(roles.map((r) => ({ ...r, assignable: true })));

/** Why a reminder time can't be added, or null when it can. */
export function reminderProblem(text: string, list: string[]) {
  const ms = parseDuration(text);
  if (ms === null) return 'Write it with m, h, d or w, like 1h or 10m.';
  if (ms < evRanges.reminder.min || ms > evRanges.reminder.max)
    return `Reminders are between ${evRanges.reminder.label} before the start.`;
  if (list.some((r) => parseDuration(r) === ms))
    return 'There’s already a reminder at that time.';
  return null;
}

/** "1h before": reminder times as chips, with a box to add more. */
export function ReminderList({
  label,
  tip,
  value,
  max,
  onChange,
}: {
  label: string;
  tip: string;
  value: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState(false);
  const problem = typed.trim() ? reminderProblem(typed.trim(), value) : null;
  const full = value.length >= max;
  const add = () => {
    setTried(true);
    if (!typed.trim() || problem || full) return;
    onChange(
      [...value, typed.trim().toLowerCase()].sort(
        (a, b) => (parseDuration(b) ?? 0) - (parseDuration(a) ?? 0),
      ),
    );
    setTyped('');
    setTried(false);
  };
  return (
    <div className="sp-field sp-ev-reminders">
      <span className="sp-label">
        {label} <InfoTip text={tip} />
        <Used n={value.length} max={max} what="reminders" />
      </span>
      <div className="sp-ev-chips">
        {value.map((r) => (
          <span key={r} className="sp-combo-chip">
            <Icon name="bell" className="sp-channel-glyph" />
            <span className="sp-combo-chip__label">{r} before</span>
            <button
              type="button"
              className="sp-chip__remove"
              aria-label={`Remove the ${r} reminder`}
              onClick={() => onChange(value.filter((x) => x !== r))}
            >
              <Icon name="x" />
            </button>
          </span>
        ))}
        {!value.length && <span className="sp-hint">No reminders</span>}
      </div>
      <div className="sp-ev-add">
        <Input
          aria-label={`Add a reminder to ${label.toLowerCase()}`}
          placeholder={full ? `Up to ${max} on your plan` : 'Like 1h or 10m'}
          value={typed}
          disabled={full}
          maxLength={12}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          {...(tried && problem ? { error: problem } : {})}
        />
        <Button size="sm" icon="plus" disabled={full} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** The three answers: each one's emoji and name, and Maybe and Can’t go on or off. */
export function OptionsEditor({
  value,
  onChange,
  where,
}: {
  value: EvOptions;
  onChange: (next: EvOptions) => void;
  /** The `data-issue` prefix problems point at. */
  where: string;
}) {
  const edit = (k: EvChoice, patch: Partial<EvOptions[EvChoice]>) =>
    onChange({ ...value, [k]: { ...value[k], ...patch } });
  return (
    <ul className="sp-ev-options" aria-label="Answers">
      {evChoices.map((k) => {
        const o = value[k];
        return (
          <li
            key={k}
            className="sp-ev-option"
            data-issue={`${where}:${k}`}
            data-off={!o.on || undefined}
          >
            <Input
              aria-label={`${evAnswerNames[k]} emoji`}
              className="sp-ev-option__emoji"
              value={o.emoji}
              maxLength={64}
              disabled={!o.on}
              onChange={(e) => edit(k, { emoji: e.target.value.trim() })}
            />
            <Input
              aria-label={`${evAnswerNames[k]} button name`}
              value={o.label}
              maxLength={evTextLimits.label}
              disabled={!o.on}
              placeholder={evAnswerNames[k]}
              onChange={(e) => edit(k, { label: e.target.value })}
              {...(o.on && !o.label.trim() ? { error: 'Give it a name.' } : {})}
            />
            {k === 'going' ? (
              <span className="sp-hint sp-ev-option__always">Always on</span>
            ) : (
              <Switch
                checked={o.on}
                onChange={(on) => edit(k, { on })}
                description={`${evAnswerNames[k]} on or off`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The Settings tab: where events go, new events' defaults, roles and DMs. */
export function EVSettings({
  config,
  channels,
  roles,
  limits,
  canSync,
  onChange,
}: {
  config: Events;
  channels: Channel[];
  roles: RoleOption[];
  limits: { upcoming: number; reminders: number };
  canSync: boolean;
  onChange: (patch: Partial<Events>) => void;
}) {
  const channel = channels.find((c) => c.id === config.channel);
  const zones = useZoneItems();
  const offset = zoneOffset(config.timeZone);
  return (
    <div className="sp-stack sp-ar sp-ev">
      <section className="sp-card" aria-labelledby="ev-where">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="ev-where">
              Where and who
            </h2>
            <p className="sp-card__sub">
              Where events are announced, their time zone, and who runs them.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="channel">
              <ChannelPicker
                label="Events channel"
                channels={channels}
                value={config.channel}
                onChange={(id) => onChange({ channel: id })}
                error={
                  channel && !channel.canPost
                    ? 'Sparko can’t post here yet.'
                    : undefined
                }
                hint="Where each event is posted with its RSVP buttons, and where Sparko pings when one starts."
              />
            </div>
            <div data-issue="timeZone">
              <Combobox
                label={tipped(
                  'Time zone',
                  `New events start in this time zone, and /event create reads times in it. It’s ${offset.replace('UTC', 'UTC ')} there now. Members always see times in their own.`,
                )}
                searchPlaceholder="Search time zones, like London"
                value={config.timeZone}
                onChange={(timeZone) => onChange({ timeZone })}
                items={zones}
              />
            </div>
          </div>
          <div data-issue="managers" className="sp-ev-narrow">
            <Combobox
              label={tipped(
                'Who can manage events',
                'These roles can create, cancel and send reminders with /event. Leave it empty for members with Manage Server.',
              )}
              multiple
              placeholder="Manage Server only"
              searchPlaceholder="Search roles"
              value={config.managers}
              onChange={(managers) => onChange({ managers })}
              items={anyRoles(roles)}
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="ev-defaults">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="ev-defaults">
              New events
            </h2>
            <p className="sp-card__sub">
              What each new event starts with. You can change them for any event
              when you make it.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div data-issue="reminders">
            <ReminderList
              label="Default reminders"
              tip="Sparko DMs Going members this long before the start. Use m, h, d or w, like 1d, 1h or 10m."
              value={config.reminders}
              max={limits.reminders}
              onChange={(reminders) => onChange({ reminders })}
            />
          </div>
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.remindMaybe}
              onChange={(remindMaybe) => onChange({ remindMaybe })}
              label="Remind Maybe answers too"
              description="Members who answered Maybe also get the reminder DMs."
            />
            <Checkbox
              checked={config.startPing}
              onChange={(startPing) => onChange({ startPing })}
              label="Ping when it starts"
              description="Sparko posts in the events channel when an event starts, mentioning everyone going."
            />
          </div>
          <div className="sp-field" data-issue="options">
            <span className="sp-label">
              Answers{' '}
              <InfoTip text="The buttons under each event. Going is always there; Maybe and Can’t go can be turned off. The emoji can be any emoji, or a server one written like <:name:id>." />
            </span>
            <OptionsEditor
              value={config.options}
              where="options"
              onChange={(options) => onChange({ options })}
            />
          </div>
          <div data-issue="listSize" className="sp-ev-size">
            <Input
              label="Names in the attendee list"
              hint="How many members {going.list} names before it says “and 5 more”. From 1 to 50."
              type="number"
              min={1}
              max={evTextLimits.listSize}
              value={String(config.listSize)}
              onChange={(e) =>
                onChange({ listSize: Math.round(Number(e.target.value)) })
              }
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="ev-roles">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="ev-roles">
              Roles and Discord events
            </h2>
            <p className="sp-card__sub">
              A role for members who are going, and events in Discord’s own
              list.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <Switch
            checked={config.attending}
            onChange={(attending) => onChange({ attending })}
            label="Attending role"
            description="Going members get a role until the event ends, so you can open a channel just for them. Sparko takes it back when they change their answer or the event is over."
          />
          {config.attending && (
            <div data-issue="attendingRole" className="sp-ev-narrow">
              <Combobox
                label={tipped(
                  'The role',
                  'Sparko’s role has to be above it so Sparko can give it.',
                )}
                placeholder="Pick a role"
                searchPlaceholder="Search roles"
                value={config.attendingRole || NONE}
                onChange={(v) =>
                  onChange({ attendingRole: v === NONE ? '' : v })
                }
                items={roleItems(roles, [config.attendingRole])}
              />
            </div>
          )}
          <Switch
            checked={config.sync}
            onChange={(sync) => onChange({ sync })}
            label="Add events to Discord’s events"
            description="Each event also shows in the server’s Events list at the top of the channel list, and is updated, started and cancelled with Sparko’s."
          />
          {config.sync && !canSync && (
            <p className="sp-edit-banner" role="note">
              <Icon name="info" size="sm" />
              <span>
                Sparko needs the <b>Manage Events</b> permission for this. Give
                it to Sparko’s role in Server Settings → Roles.
              </span>
            </p>
          )}
        </div>
      </section>

      <section className="sp-card" aria-labelledby="ev-dms">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="ev-dms">
              Direct messages
            </h2>
            <p className="sp-card__sub">
              Which DMs Sparko sends. Change how they look in Edit.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.dms.reminder}
              onChange={(reminder) =>
                onChange({ dms: { ...config.dms, reminder } })
              }
              label="Reminders"
              description="Before each event starts, at its reminder times."
            />
            <Checkbox
              checked={config.dms.cancelled}
              onChange={(cancelled) =>
                onChange({ dms: { ...config.dms, cancelled } })
              }
              label="Cancelled events"
              description="To everyone who was going."
            />
            <Checkbox
              checked={config.dms.waitlist}
              onChange={(waitlist) =>
                onChange({ dms: { ...config.dms, waitlist } })
              }
              label="Off the waitlist"
              description="When a spot opens and someone moves up to Going."
            />
          </div>
          <p className="sp-hint">
            Members who don’t take DMs from the server simply don’t get them.
          </p>
        </div>
      </section>
    </div>
  );
}
