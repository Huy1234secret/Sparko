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

export const pollsDoc: DocPage = {
  id: 'polls',
  group: 'Modules',
  title: 'Polls',
  icon: 'activity',
  lede: 'Ask the server a question with up to 25 options, see the votes come in as live bars, and end on time, at a vote count, or when you say.',
  body: () => (
    <>
      <p>
        Make a poll in the dashboard or with <Code>/poll create</Code>. Members
        vote with buttons or a menu, the message updates with a bar for each
        option, and when it ends Sparko shows the winner, or the tie.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Polls</b> and switch it on.
          </>,
          <>
            On <b>Settings</b>, pick the <b>Default channel</b> and{' '}
            <b>Who can make polls</b>.
          </>,
          <>
            Choose what new polls start with: buttons or a menu, anonymous,
            multiple choice, and how long they run.
          </>,
          <>
            On <b>Edit</b>, pick how a poll and its results look.
          </>,
          <>
            Save, then make your first poll on the <b>Polls</b> tab or with{' '}
            <Code>/poll create</Code>.
          </>,
        ]}
      />
      <Shot
        name="polls-new"
        alt="The Polls tab: your polls with their status and votes, and a button to make a new one."
        caption="The Polls tab: build a poll, then post it now or later."
      />

      <h2>Making a poll</h2>
      <h3>In the dashboard</h3>
      <SettingsTable
        noDefault
        rows={[
          ['Question', 'Up to 300 characters.'],
          [
            'Options',
            'At least 2: up to 5 on Free and 25 on Plus. Each has a name of up to 80 characters, all different, and an emoji if you like.',
          ],
          ['Post in', 'Any channel Sparko can post in.'],
          [
            'Vote rules',
            'Anonymous votes, Multiple choice, Allow changing votes and Hide results until it ends, starting from your defaults.',
          ],
          [
            'Most picks per member',
            'In a multiple-choice poll, how many options one member can pick. 0 or empty is any number.',
          ],
          [
            'Who can vote',
            'Only members with one of these roles can vote. Empty is everyone.',
          ],
          ['Ping when posted', 'A role Sparko mentions as the poll is posted.'],
          [
            'End after this many votes',
            'Ends as soon as this many members have voted, up to 100,000. 0 or empty is off.',
          ],
          [
            'Ends',
            <>
              <b>Never</b> (until staff end it), <b>After a while</b> (1 minute
              to 30 days after it’s posted), or <b>At a time</b> (up to 60 days
              ahead).
            </>,
          ],
          [
            'Post',
            <>
              <b>Now</b>, or <b>Later</b> at a time up to 60 days ahead.
            </>,
          ],
        ]}
      />
      <h3>In Discord</h3>
      <p>
        <Code>/poll create</Code> opens a form for the question, the options
        (one per line, with an emoji at the start if you like) and how long it
        runs. Its options choose anonymous, multiple choice and the channel;
        everything else comes from your defaults.
      </p>
      <Tip title="Who can make polls">
        Staff in Who can make polls (or with Manage Server) can make, end and
        reroll any poll in any channel. With <b>Members can make polls</b> on,
        others can make polls with the command too, and end their own.
      </Tip>

      <h2>Voting and results</h2>
      <ul>
        <li>
          Options show as buttons (up to 5 a row) or as one menu. A Free poll’s
          5 options fit in one row.
        </li>
        <li>
          The message shows each option with a bar, its share and its votes,
          like <Code>▰▰▰▰▰▰▱▱▱▱ 60% (12)</Code>. With hidden results, it shows
          only how many voted until the poll ends.
        </li>
        <li>
          After voting, Sparko tells the member privately what they picked.
        </li>
        <li>
          A poll ends when its time runs out, when it reaches its vote target,
          or when staff (or its maker) end it. The buttons grey out, the winner
          gets a 🏆, and the message becomes the results message.
        </li>
        <li>
          A tie shows as a tie. Staff can press <b>Reroll tie</b> to pick one of
          the tied options at random.
        </li>
      </ul>

      <h2>Settings tab</h2>
      <SettingsTable
        rows={[
          [
            'Default channel',
            'Where polls made with the command or the dashboard go, unless another channel is picked.',
            'Your general channel',
          ],
          [
            'Who can make polls',
            'Staff with these roles can make, end and reroll any poll, in any channel. Empty means Manage Server. Up to 25 roles.',
            'Manage Server',
          ],
          [
            'Members can make polls with /poll create',
            'Members who aren’t staff can ask the server a question. They can end their own polls, but not anyone else’s.',
            'Off',
          ],
          [
            'Only members with',
            'Limit member polls to one role, like Level 5 or Supporter.',
            'Everyone',
          ],
          ['Members vote with', 'Buttons or a menu, for new polls.', 'Buttons'],
          [
            'Anonymous votes',
            'Nobody can see who voted for what, not even staff. Only totals show.',
            'Off',
          ],
          ['Multiple choice', 'Members can pick more than one option.', 'Off'],
          [
            'Allow changing votes',
            'Members can switch, or take a vote back by pressing it again.',
            'On',
          ],
          [
            'Hide results until it ends',
            'The message shows only how many voted. The bars show once the poll ends.',
            'Off',
          ],
          [
            'Default length',
            'How long polls run, from 1 minute to 30 days, like 1h or 1d. Empty keeps them open until staff end them.',
            '1d',
          ],
          [
            'Ping when posted',
            'A role mentioned as each poll is posted, like Poll pings. Edits never ping again.',
            'Nobody',
          ],
        ]}
      />

      <h2>Polls tab</h2>
      <p>
        Below the builder is every poll, filtered by <b>Running</b>,{' '}
        <b>Scheduled</b> and <b>Ended</b>, each with its live bars. On each
        poll: <b>End now</b>, <b>Post now</b> (for scheduled ones),{' '}
        <b>Reroll tie</b>, <b>Voters</b> (who picked what, never on anonymous
        polls), <b>Export CSV</b>, <b>Open in Discord</b> and <b>Delete</b>{' '}
        (removes its message and votes).
      </p>
      <LimitTable
        rows={[
          ['Options per poll', '5', '25'],
          ['Polls running or scheduled at once', '3', '50'],
        ]}
      />

      <h2>Edit tab: two messages</h2>
      <TermTable
        head={['Message', 'Defaults to start from']}
        rows={[
          [
            'The poll',
            'Poll card (the question, the bars and when it ends), Compact, or Modern poll (Components V2).',
          ],
          [
            'The results, once it ends',
            'Results card (the final bars, the winner and how many voted), Compact results, or Modern results.',
          ],
        ]}
      />
      <h3>Variables</h3>
      <p>
        On top of the <Link to="/docs/variables">usual variables</Link>:
      </p>
      <VariableList only="poll" />

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['CREATED', 'Someone made a poll.'],
          ['POSTED', 'A poll was posted, now or at its scheduled time.'],
          [
            'ENDED',
            'It ended: its time ran out, it reached its votes, or it was ended early.',
          ],
          ['REROLLED', 'Staff rerolled a tie, and which option was picked.'],
          ['DELETED', 'A poll was deleted.'],
          ['FAILED', 'Something couldn’t be done, such as posting.'],
        ]}
      />

      <h2>Commands</h2>
      <p>
        On the <b>Commands</b> tab, rename <Code>/poll</Code> and its
        subcommands, change their descriptions, or turn any off.
      </p>
      <CommandTable
        names={['/poll create', '/poll end', '/poll results', '/poll voters']}
      />
      <h2>Permissions Sparko needs</h2>
      <p>
        <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in
        every channel polls are posted in.
      </p>
    </>
  ),
};
