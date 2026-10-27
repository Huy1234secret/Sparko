import { Link } from 'react-router-dom';
import {
  Code,
  CommandTable,
  SettingsTable,
  Shot,
  Steps,
  TermTable,
  Tip,
  VariableList,
  type DocPage,
} from './parts';

export const birthdaysDoc: DocPage = {
  id: 'birthdays',
  group: 'Modules',
  title: 'Birthdays',
  icon: 'gift',
  lede: 'Members save their birthday with a command, and Sparko celebrates on the day at your hour, with a post, a role for the day and a DM.',
  body: () => (
    <>
      <p>
        Members type <Code>/birthday set</Code> once. On the day, at the hour
        you pick, Sparko posts in your birthday channel, gives them a birthday
        role for 24 hours and, if you like, sends them a DM. On the 1st it can
        post every birthday that month.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Birthdays</b> in the dashboard and switch it on.
          </>,
          <>
            On <b>Settings</b>, pick the <b>Birthday channel</b>, the hour to{' '}
            <b>Celebrate at</b> and the <b>Server time zone</b>.
          </>,
          <>
            Pick a <b>Birthday role</b> if you’d like one, and drag Sparko’s
            role above it in Discord’s role list.
          </>,
          <>
            On <b>Edit</b>, start each message from a default or make your own.
          </>,
          <>
            Save. Sparko adds <Code>/birthday</Code> to your server, and members
            can start saving their dates.
          </>,
        ]}
      />
      <Shot
        name="birthdays-settings"
        alt="The Birthdays Settings tab: the birthday channel, the hour, the time zone and how birthdays are posted."
        caption="Settings: when and where Sparko celebrates."
      />

      <h2>What happens on the day</h2>
      <ul>
        <li>
          At the hour, in the server’s time zone (or each member’s own), Sparko
          posts the birthday message. If it was offline at that hour, it posts
          as soon as it’s back, the same day.
        </li>
        <li>
          With <b>One post for everyone</b>, members whose birthdays land at the
          same time share one post (the Several birthdays message). With{' '}
          <b>One post each</b>, everyone gets their own.
        </li>
        <li>The birthday role goes on, and comes off 24 hours later.</li>
        <li>
          Sparko never celebrates the same birthday twice in a year, and never
          celebrates someone who isn’t in the server.
        </li>
        <li>
          <b>29 February</b> is celebrated on the 28th in years that aren’t leap
          years.
        </li>
      </ul>

      <h2>Settings tab</h2>
      <h3>When and where</h3>
      <SettingsTable
        rows={[
          [
            'Birthday channel',
            'Where birthdays and the monthly list are posted. Required.',
            'Your general channel',
          ],
          [
            'Celebrate at',
            'The hour Sparko posts on the day, from 00:00 to 23:00.',
            '09:00',
          ],
          [
            'Server time zone',
            'The time zone the hour is in, and the server’s day for the monthly post. Pick from every time zone, searchable by city. The current offset is shown beside it.',
            'UTC',
          ],
          [
            'Whose time',
            <>
              <b>The server’s</b>: everyone is celebrated at the hour in the
              server’s time zone. <b>Each member’s own</b>: at the hour in the
              time zone they saved, or the server’s if they didn’t.
            </>,
            'The server’s',
          ],
          [
            'Posts',
            <>
              <b>One post for everyone</b> whose birthday it is, or{' '}
              <b>One post each</b>.
            </>,
            'One post for everyone',
          ],
        ]}
      />
      <h3>Celebrating</h3>
      <SettingsTable
        rows={[
          [
            'Birthday role',
            'Given on their birthday and taken back 24 hours later. Sparko’s role has to be above it.',
            'None',
          ],
          [
            'Ping the birthday members',
            'Their mentions in the post notify them. Nobody else is pinged.',
            'On',
          ],
          [
            'Show their age',
            <>
              Fills <Code>{'{birthday.age}'}</Code> when they saved the year
              they were born. The year itself is never shown.
            </>,
            'On',
          ],
          [
            'Send a birthday DM',
            'Each member also gets the DM message. Members who don’t take DMs from the server won’t get it, and the log says so.',
            'Off',
          ],
          [
            'Post “Birthdays this month” on the 1st',
            'At the same hour, in the server’s time zone, with every birthday that month.',
            'Off',
          ],
        ]}
      />
      <h3>Who and how often</h3>
      <SettingsTable
        rows={[
          [
            'Who can manage birthdays',
            'These roles can set and remove anyone’s birthday with the command, without the limits below. Empty means members with Manage Server. Up to 25 roles.',
            'Manage Server',
          ],
          [
            'Time between changes',
            'How long after changing their date a member can change it again, from 1 day to 1 year, like 30d or 1mt. Empty allows changes any time. Staff changes skip it.',
            '30d',
          ],
          [
            'Minimum account age',
            'How old a Discord account must be to save a birthday, from 1 day to 1 year. Empty is any age.',
            'Any age',
          ],
          [
            'Minimum time in the server',
            'How long someone has to have been in the server first, from 1 hour to 1 year, like 12h or 3d. Empty is no wait.',
            'No wait',
          ],
          [
            'Ask for the year',
            'Members have to give the year they were born. It’s only used for their age.',
            'Off',
          ],
          [
            'Hide birthdays of members who left',
            'They’re left out of lists and the monthly post until they’re back.',
            'On',
          ],
          [
            'Forget members who leave',
            'Their birthday is deleted when they leave, so they’d have to save it again.',
            'Off',
          ],
        ]}
      />
      <p>
        Years are checked so a typo can’t make someone 3 or 300: a saved year
        has to make them 13 to 120 years old. Dates are checked too, so 31 April
        or 29 February in a year that wasn’t a leap year are turned away with a
        clear note.
      </p>

      <h2>Edit tab: the four messages</h2>
      <TermTable
        head={['Message', 'When it’s sent']}
        rows={[
          ['Birthday', 'Posted for one member’s birthday.'],
          [
            'Several birthdays',
            'Posted when several members have their birthday at the same time, listing them all. Not used with One post each.',
          ],
          [
            'This month',
            'Posted on the 1st with every birthday that month, when the monthly post is on.',
          ],
          [
            'DM',
            'Sent to each member in their DMs on their birthday, when birthday DMs are on.',
          ],
        ]}
      />
      <p>
        Each is a Message Studio template you edit in the live preview, or
        Sparko’s own until you pick one. Defaults to start from include{' '}
        <b>Birthday card</b>, <b>With their age</b>, <b>Modern card</b>,{' '}
        <b>Birthday crowd</b>, <b>Modern crowd</b>, <b>This month</b>,{' '}
        <b>Modern month</b> and <b>Birthday DM</b>. A note tells you when a
        message won’t be sent with your current settings. Send a test to any
        channel to see it.
      </p>
      <h3>Variables</h3>
      <p>
        On top of the <Link to="/docs/variables">usual variables</Link>:
      </p>
      <VariableList only="birthday" />

      <h2>Storage tab</h2>
      <p>
        <b>Upcoming</b> shows the next birthdays and how many days away each is.
        Below it, every saved birthday sorted by month, with search by name or
        ID. Staff can <b>Add a birthday</b> for any member (day, month, optional
        year and time zone), change one, or remove one. Removing takes the
        birthday role back if they have it today.
      </p>

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['SET', 'A member saved their birthday.'],
          ['CHANGED', 'A birthday’s date changed.'],
          ['REMOVED', 'A birthday was removed, by the member or staff.'],
          ['CELEBRATED', 'Sparko posted for their birthday.'],
          ['ROLE GIVEN', 'They got the birthday role for the day.'],
          ['ROLE REMOVED', 'The birthday role was taken back.'],
          ['MONTHLY', 'Sparko posted this month’s birthdays.'],
          ['FAILED', 'Something couldn’t be done, like a DM or the role.'],
        ]}
      />
      <p>
        Filter by <b>All</b>, <b>Saved</b>, <b>Celebrated</b> and{' '}
        <b>Problems</b>.
      </p>

      <h2>Commands</h2>
      <p>
        The <b>Commands</b> tab renames <Code>/birthday</Code> and each of its
        subcommands, changes their descriptions, or turns any off.
      </p>
      <CommandTable
        names={[
          '/birthday set',
          '/birthday remove',
          '/birthday view',
          '/birthday upcoming',
          '/birthday list',
        ]}
      />
      <h2>Permissions Sparko needs</h2>
      <ul>
        <li>
          <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in
          the birthday channel.
        </li>
        <li>
          <b>Manage Roles</b>, above the birthday role, to give it.
        </li>
      </ul>
      <Tip icon="info" title="Someone wasn’t celebrated?">
        Check the Logs tab for FAILED, that they’re still in the server, and
        Whose time: with each member’s own time zone, someone far away is
        celebrated at your hour in their zone, not yours.
      </Tip>
    </>
  ),
};
