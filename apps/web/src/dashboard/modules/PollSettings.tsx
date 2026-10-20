import type { ReactNode } from 'react';
import {
  Checkbox,
  Combobox,
  Segmented,
  Switch,
  type ComboItem,
} from '../../ui';
import {
  pollRanges,
  type Channel,
  type PollStyle,
  type Polls,
  type RoleOption,
} from '../../data';
import { InfoTip } from './EditorBits';
import { DurationInput } from './ARTriggers';
import { ChannelPicker, roleItems } from './parts';

export const NONE = 'none';
export const pollTimeFormat = 'Use mi, h, d and w, like 30mi, 12h, 3d or 1w.';

/** A label with an (i) beside it that says more on hover. */
export const tipped = (text: string, tip: string): ReactNode => (
  <>
    {text} <InfoTip text={tip} />
  </>
);

/**
 * Roles for "who can" pickers. Sparko doesn't give these, so roles above
 * its own can be picked too.
 */
export const anyRoles = (roles: RoleOption[]): ComboItem[] =>
  roleItems(roles.map((r) => ({ ...r, assignable: true })));

/** A role to ping, or none. */
export const pingItems = (roles: RoleOption[]): ComboItem[] => [
  { value: NONE, label: 'Nobody', icon: 'ban', group: 'Default' },
  ...anyRoles(roles),
];

/** Buttons or a menu, as people pick them. */
export function StyleChoice({
  value,
  onChange,
}: {
  value: PollStyle;
  onChange: (style: PollStyle) => void;
}) {
  return (
    <div className="sp-field" data-issue="style">
      <span className="sp-label">
        Members vote with{' '}
        <InfoTip text="Buttons sit five to a row under the message. A menu holds up to 25 options in one row and suits long lists." />
      </span>
      <Segmented<PollStyle>
        label="Members vote with"
        value={value}
        onChange={onChange}
        options={[
          { value: 'buttons', label: 'Buttons' },
          { value: 'menu', label: 'Menu' },
        ]}
      />
    </div>
  );
}

/** The Settings tab: where polls go, who makes them, and what they start with. */
export function PollSettings({
  config,
  channels,
  roles,
  onChange,
}: {
  config: Polls;
  channels: Channel[];
  roles: RoleOption[];
  onChange: (patch: Partial<Polls>) => void;
}) {
  const channel = channels.find((c) => c.id === config.channel);
  const d = config.defaults;
  const setDefaults = (patch: Partial<Polls['defaults']>) =>
    onChange({ defaults: { ...d, ...patch } });
  const create = `/${config.commands.name} ${config.commands.subs.create.name}`;
  return (
    <div className="sp-stack sp-ar sp-pl">
      <section className="sp-card" aria-labelledby="pl-where">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="pl-where">
              Channel and people
            </h2>
            <p className="sp-card__sub">
              Where polls go unless another channel is picked, and who can make
              them.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="channel">
              <ChannelPicker
                label="Default channel"
                channels={channels}
                value={config.channel}
                onChange={(id) => onChange({ channel: id })}
                error={
                  channel && !channel.canPost
                    ? 'Sparko can’t post here yet.'
                    : undefined
                }
                hint={`Polls made with ${create} or the dashboard go here unless another channel is picked.`}
              />
            </div>
            <div data-issue="creators">
              <Combobox
                label={tipped(
                  'Who can make polls',
                  'Staff with these roles can make, end and reroll any poll, and post them in any channel. Leave it empty for members with Manage Server.',
                )}
                multiple
                placeholder="Manage Server only"
                searchPlaceholder="Search roles"
                value={config.creators}
                onChange={(creators) => onChange({ creators })}
                items={anyRoles(roles)}
              />
            </div>
          </div>
          <Switch
            checked={config.members}
            onChange={(members) => onChange({ members })}
            label={`Members can make polls with ${create}`}
            description="Members who aren’t staff can ask the server a question. They can end their own polls, but not anyone else’s."
          />
          <div data-issue="memberRole" className="sp-pl-indent">
            <Combobox
              label={tipped(
                'Only members with',
                'Limit member polls to one role, like Level 5 or Supporter. Pick Everyone to let any member make one.',
              )}
              searchPlaceholder="Search roles"
              disabled={!config.members}
              value={config.memberRole || NONE}
              onChange={(v) => onChange({ memberRole: v === NONE ? '' : v })}
              items={[
                {
                  value: NONE,
                  label: 'Everyone',
                  icon: 'users',
                  group: 'Default',
                },
                ...anyRoles(roles),
              ]}
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="pl-defaults">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="pl-defaults">
              New polls start with
            </h2>
            <p className="sp-card__sub">
              What each new poll is set to. Change any of it on the poll itself.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <StyleChoice
            value={d.style}
            onChange={(style) => setDefaults({ style })}
          />
          <span className="sp-label">Vote rules</span>
          <div className="sp-ar__checks">
            <Checkbox
              checked={d.anonymous}
              onChange={(anonymous) => setDefaults({ anonymous })}
              label="Anonymous votes"
              description="Nobody can see who voted for what, not even staff. Only the totals show."
            />
            <Checkbox
              checked={d.multiple}
              onChange={(multiple) => setDefaults({ multiple })}
              label="Multiple choice"
              description="Members can pick more than one option."
            />
            <Checkbox
              checked={d.changeVotes}
              onChange={(changeVotes) => setDefaults({ changeVotes })}
              label="Allow changing votes"
              description="Members can switch their vote, or take it back by pressing it again."
            />
            <Checkbox
              checked={d.hideResults}
              onChange={(hideResults) => setDefaults({ hideResults })}
              label="Hide results until it ends"
              description="The message shows only how many voted. The bars show once the poll ends."
            />
          </div>
          <div className="sp-ar__pair">
            <div data-issue="duration">
              <DurationInput
                label="Default length"
                tip="How long a poll runs before it ends on its own. From 1 minute up to 30 days. Leave it empty to keep polls open until staff end them."
                value={d.duration}
                placeholder="No end"
                range={pollRanges.duration}
                format={pollTimeFormat}
                onChange={(duration) => setDefaults({ duration })}
              />
            </div>
            <div data-issue="ping">
              <Combobox
                label={tipped(
                  'Ping when posted',
                  'A role Sparko mentions as a poll is posted, like Poll pings. It’s only pinged once; edits never ping again.',
                )}
                searchPlaceholder="Search roles"
                value={config.ping || NONE}
                onChange={(v) => onChange({ ping: v === NONE ? '' : v })}
                items={pingItems(roles)}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
