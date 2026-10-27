import { Link } from 'react-router-dom';
import {
  Code,
  CommandTable,
  LimitTable,
  SettingsTable,
  Shot,
  Steps,
  TermTable,
  Tip,
  VariableList,
  type DocPage,
} from './parts';

export const invitesDoc: DocPage = {
  id: 'invites',
  group: 'Modules',
  title: 'Invite tracking',
  icon: 'link',
  lede: 'See which invite every member used, count each inviter’s invites fairly, and give reward roles to your best inviters.',
  body: () => (
    <>
      <p>
        Sparko remembers your server’s invites and how often each was used. When
        someone joins, it works out whose invite they used, adds it to that
        inviter’s count, posts a join message saying so, and gives reward roles
        when an inviter reaches your numbers.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Invite tracking</b> and switch it on.
          </>,
          <>
            Give Sparko’s role <b>Manage Server</b> in Discord. Without it,
            Discord won’t show Sparko your invites, so it can’t tell which one
            was used.
          </>,
          <>
            On <b>Settings</b>, choose how invites count, and pick the channel
            for the join message (and the leave message, if you want one).
          </>,
          <>
            Add <b>reward roles</b>, like Recruiter at 5 invites, and drag
            Sparko’s role above them.
          </>,
          <>
            Save. Sparko adds <Code>/invites</Code> to your server.
          </>,
        ]}
      />
      <Shot
        name="invites-settings"
        alt="The Invite tracking Settings tab: how invites count, the join and leave messages, and reward roles."
        caption="Settings: counting, messages and reward roles."
      />

      <h2>How Sparko knows who invited whom</h2>
      <p>
        When someone joins, Sparko compares each invite’s uses with what it knew
        a moment before. The one invite that went up by one is theirs. An invite
        that hit its use limit and disappeared counts too.
      </p>
      <TermTable
        head={['Join type', 'Means']}
        rows={[
          ['Normal', 'They used a member’s invite, and that member gets it.'],
          ['Vanity', 'They used your server’s vanity link. Nobody gets it.'],
          [
            'Unknown',
            'Sparko couldn’t tell, for example two people joined at once, they came through Discovery, or Sparko was offline.',
          ],
        ]}
      />

      <h2>How invites count</h2>
      <p>Each inviter has four numbers:</p>
      <TermTable
        head={['Number', 'What it counts']}
        rows={[
          ['Regular', 'Members who joined with their invites.'],
          ['Left', 'Of those, members who have since left.'],
          [
            'Fake',
            'Of those, members whose Discord account was younger than the fake account age.',
          ],
          ['Bonus', 'Invites staff added or took away by hand.'],
        ]}
      />
      <p>
        <b>Total = regular − left − fake + bonus</b>, with left and fake only
        taken off when those settings are on. The total is what the leaderboard
        and reward roles use.
      </p>

      <h2>Settings tab</h2>
      <h3>Counting</h3>
      <SettingsTable
        rows={[
          [
            'Fake account age',
            'Members whose Discord account is younger than this count as fake, from 1 hour to 1 year, like 7d. Empty counts nobody as fake.',
            '7d',
          ],
          [
            'Take off members who leave',
            'An inviter loses the invite when the member they invited leaves.',
            'On',
          ],
          [
            'Take off fake accounts',
            'Fake accounts don’t count. A fake who left is only taken off once.',
            'On',
          ],
          [
            'Count members who rejoin',
            'Off: someone who leaves and comes back counts once, for whoever invited them first. On: each join counts for that invite’s inviter.',
            'Off',
          ],
        ]}
      />
      <h3>Messages</h3>
      <SettingsTable
        rows={[
          [
            'Join message',
            'Posted when someone joins, saying who invited them, with which invite and the inviter’s new total. On or off, with its channel.',
            'On',
          ],
          [
            'Leave message',
            'Posted when someone leaves, saying who had invited them and the inviter’s new total.',
            'Off',
          ],
        ]}
      />
      <h3>Reward roles</h3>
      <p>
        Each reward is a number of invites (1 to 100,000, each number used once)
        and a role. Free has 3 rewards; Plus has 25.
      </p>
      <SettingsTable
        rows={[
          [
            'Keep every reward earned',
            'Off: inviters only keep their highest reward, and lower ones are taken off.',
            'On',
          ],
          [
            'Take rewards back below their number',
            'When leaves, fakes or a reset bring someone’s total under a reward, Sparko takes its role back.',
            'On',
          ],
          [
            'Who can manage invites',
            'Roles that can use the bonus and reset commands. Empty means Manage Server. Up to 25 roles.',
            'Manage Server',
          ],
        ]}
      />

      <h2>Edit tab: join and leave messages</h2>
      <TermTable
        head={['Message', 'Defaults to start from']}
        rows={[
          [
            'Join',
            'Join card (who invited them and their new total), One line, or Modern card (Components V2).',
          ],
          [
            'Leave',
            'Leave card (who had invited them), One line, or Modern card in red.',
          ],
        ]}
      />
      <h3>Variables</h3>
      <p>
        On top of the <Link to="/docs/variables">usual variables</Link>:
      </p>
      <VariableList only="invite" />

      <h2>Storage tab</h2>
      <ul>
        <li>
          <b>Leaderboard</b>: every inviter by total, with their regular, left,
          fake and bonus invites. Reset one inviter or everyone from here; who
          invited whom is kept, and reward roles follow the new totals.
        </li>
        <li>
          <b>A member</b>: look anyone up to see their numbers, who invited
          them, and everyone they invited. Add or take away bonus invites.
        </li>
        <li>
          <b>Invite codes</b>: every invite with who made it, its uses, its
          channel and when it expires.
        </li>
      </ul>
      <LimitTable rows={[['Reward roles', '3', '25']]} />

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['JOINED', 'Someone joined, and whose invite they used.'],
          ['LEFT', 'Someone left, and who had invited them.'],
          ['REWARD GIVEN', 'An inviter got a reward role.'],
          ['REWARD REMOVED', 'An inviter lost a reward role.'],
          ['BONUS', 'Staff changed someone’s bonus invites.'],
          ['RESET', 'Someone’s invites, or everyone’s, were reset.'],
          ['FAILED', 'Something couldn’t be done, like giving a role.'],
        ]}
      />

      <h2>Commands</h2>
      <p>
        On the <b>Commands</b> tab, rename <Code>/invites</Code> and its
        subcommands, change their descriptions, or turn any off.
      </p>
      <CommandTable
        names={[
          '/invites view',
          '/invites leaderboard',
          '/invites who',
          '/invites list',
          '/invites bonus',
          '/invites reset',
        ]}
      />
      <h2>Permissions Sparko needs</h2>
      <ul>
        <li>
          <b>Manage Server</b>, to see your invites and how often each was used.
        </li>
        <li>
          <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in
          the join and leave channels.
        </li>
        <li>
          <b>Manage Roles</b>, above every reward role.
        </li>
      </ul>
      <Tip icon="info" title="Joins showing as Unknown?">
        Check that Sparko has Manage Server. Invites made while Sparko was
        offline are picked up when it’s back, but joins during that time can’t
        be matched.
      </Tip>
    </>
  ),
};
