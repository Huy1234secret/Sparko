import { Link } from 'react-router-dom';
import {
  Code,
  LimitTable,
  SettingsTable,
  Shot,
  Steps,
  TermTable,
  Tip,
  type DocPage,
} from './parts';

const badges = [
  'Discord Staff',
  'Partnered Server Owner',
  'HypeSquad Events',
  'Bug Hunter',
  'HypeSquad Bravery',
  'HypeSquad Brilliance',
  'HypeSquad Balance',
  'Early Supporter',
  'Gold Bug Hunter',
  'Early Verified Bot Developer',
  'Moderator Programs Alumni',
  'Active Developer',
];

export const autorolesDoc: DocPage = {
  id: 'autoroles',
  group: 'Modules',
  title: 'Automatic roles',
  icon: 'users',
  lede: 'Give roles when members join, once they’ve accepted the rules, after they’ve stayed a while, or when they meet your rules.',
  body: () => (
    <>
      <p>
        Automatic roles hands out roles without anyone lifting a finger. Give a
        Newcomer role on join, swap it for Member once they accept the rules,
        add Regular after a month, and a Supporter role to anyone who has been
        boosting for a week.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Automatic roles</b> and switch it on.
          </>,
          <>
            On <b>Triggers</b>, add <b>Join roles</b>, <b>Timed roles</b> or{' '}
            <b>Rules</b>.
          </>,
          <>
            In Discord, drag Sparko’s role above every role it should give. The
            dashboard warns you about any it can’t.
          </>,
          <>
            Save. Sparko records your current members, then checks everyone once
            a minute.
          </>,
        ]}
      />
      <Shot
        name="autoroles-triggers"
        alt="The Triggers tab: join roles before and after verification, and two timed roles."
        caption="Triggers: join roles, timed roles and rules."
      />

      <h2>Join roles</h2>
      <SettingsTable
        noDefault
        rows={[
          [
            'Before verified',
            'Given the moment someone joins, while they still have to accept the server’s rules (Discord’s membership screening). Sparko takes these away and gives the After verified roles once they accept.',
          ],
          [
            'After verified',
            'Given once someone accepts the rules. Without membership screening, these are given as soon as they join.',
          ],
        ]}
      />

      <h2>Timed roles</h2>
      <p>
        A role given once someone has been in the server long enough. Write the
        time with <Code>m</Code> (minutes), <Code>h</Code> (hours) and{' '}
        <Code>d</Code> (days), like <Code>30m</Code>, <Code>12h</Code>,{' '}
        <Code>7d</Code> or <Code>1d 12h</Code>, from 1 minute up to 2 years
        (730d).
      </p>
      <SettingsTable
        rows={[
          [
            'Restart when a member leaves',
            'Their time starts again from zero if they leave and come back. Off counts every stay together.',
            'On',
          ],
          [
            'Stack timed roles',
            'Members keep earlier timed roles. Off swaps each one for the next.',
            'On',
          ],
        ]}
      />

      <h2>Rules</h2>
      <p>
        A rule gives a role once a member meets its requirements. Give each rule
        a name and add up to 10 requirements, joined with <b>AND</b> or{' '}
        <b>OR</b> (click to switch).
      </p>
      <TermTable
        head={['Requirement', 'Means']}
        rows={[
          [
            'Account at least this old',
            'How old their Discord account is, from when it was made. 1 day to 2 years, like 30d.',
          ],
          [
            'Has any of these badges',
            <>
              At least one of the badges you pick: {badges.join(', ')}. Only
              badges on public profiles count, and Discord doesn’t let bots see
              Nitro.
            </>,
          ],
          [
            'Boosting for at least',
            'How long they’ve been boosting without stopping. 1 day to 365 days, like 7d.',
          ],
        ]}
      />
      <SettingsTable
        rows={[
          ['Role it gives', 'The role for members who meet the rule.', '—'],
          [
            'Reset this rule’s data when a member leaves',
            'Forgets the boosts Sparko counted for them.',
            'Off',
          ],
          [
            'Remove the role if they stop meeting the rule',
            'Like when they stop boosting or lose a badge.',
            'Off',
          ],
        ]}
      />
      <LimitTable
        rows={[
          ['Join roles', '5', '10'],
          ['Timed roles', '3', '10'],
          ['Rules', '10', '25'],
          ['Requirements per rule', '10', '10'],
        ]}
      />

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['MET', 'A member met a timed role or rule and received its role.'],
          ['ADDED', 'A member received a join role on joining.'],
          ['LOST', 'They no longer meet a rule, and its role was taken back.'],
          ['DATA SAVED', 'Sparko saved their role data.'],
          ['DATA REMOVED', 'Their role data was wiped.'],
          ['FAILED', 'A role couldn’t be given, and why.'],
        ]}
      />
      <Shot
        name="autoroles-logs"
        alt="The Logs tab: MET, ADDED, DATA SAVED and LOST entries."
        caption="Logs: MET, LOST, ADDED, DATA SAVED, DATA REMOVED and FAILED."
      />

      <h2>Storage tab</h2>
      <p>
        Search a member by username or ID to see what Sparko remembers about
        them: their time in the server and the boosts it has counted. Edit
        either (to credit time from before Sparko joined, say), or wipe their
        data.
      </p>
      <Shot
        name="autoroles-storage"
        alt="The Storage tab with a member search box."
        caption="Storage: look up and edit a member’s saved data."
      />
      <h2>Permissions Sparko needs</h2>
      <p>
        <b>Manage Roles</b>, with Sparko’s role above every role it gives. See{' '}
        <Link to="/docs/permissions">Permissions</Link> for how role order
        works.
      </p>
      <Tip>
        Sparko records your current members when you save, then checks everyone
        once a minute, so timed roles land on time.
      </Tip>
    </>
  ),
};
