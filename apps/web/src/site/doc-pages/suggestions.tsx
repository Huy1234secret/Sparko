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

export const suggestionsDoc: DocPage = {
  id: 'suggestions',
  group: 'Modules',
  title: 'Suggestions',
  icon: 'message-square',
  lede: 'Members suggest ideas with a command, everyone votes, and staff give each one a status with a reason, in the open.',
  body: () => (
    <>
      <p>
        A member types <Code>/suggest</Code>, fills in a short form, and Sparko
        posts their idea in your suggestions channel with an upvote and a
        downvote. Everyone votes, the count updates on the message, and staff
        decide with <b>Approved</b>, <b>Denied</b> or a status of your own,
        always with a reason that shows under the suggestion.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            In the dashboard, open your server, go to <b>Community</b> and pick{' '}
            <b>Suggestions</b>. Switch it on at the top right.
          </>,
          <>
            On <b>Settings</b>, pick the <b>Suggestion channel</b>. If staff
            should check ideas before members see them, pick a{' '}
            <b>Review channel</b> too.
          </>,
          <>
            Choose who can suggest, who can approve or deny, and who can delete.
            Leave them empty to let everyone suggest and only Manage Server
            decide.
          </>,
          <>
            Under <b>Voting</b>, pick reactions, buttons or a menu, and set the
            vote rules.
          </>,
          <>
            On <b>Edit</b>, choose <b>Use a default template</b> or{' '}
            <b>Create your own</b>. Send a test to see it in Discord.
          </>,
          <>
            Press <b>Save changes</b>. Sparko adds <Code>/suggest</Code> and the
            staff commands to your server within a few seconds.
          </>,
        ]}
      />
      <Shot
        name="suggestions-settings"
        alt="The Suggestions Settings tab: channels and people, with the suggestion channel, review channel and role pickers."
        caption="Settings: where suggestions go, and who can suggest, approve and delete."
      />

      <h2>How a suggestion travels</h2>
      <Steps
        items={[
          <>
            The member runs <Code>/suggest</Code>, optionally with up to 3
            files. A form asks for a <b>title</b> and <b>the suggestion</b>,
            with a second box for long ideas.
          </>,
          <>
            Sparko checks they’re allowed: not blacklisted, in a Who can suggest
            role (if you picked any), old enough, past their cooldown, under the
            pending limit, within the length limits and not a duplicate. If not,
            only they see why.
          </>,
          <>
            With a review channel, it goes there first as{' '}
            <b>Waiting for review</b>. Staff press <b>Post it</b> or{' '}
            <b>Reject</b> (with a reason). Without one, it’s posted straight
            away as <b>Pending</b>.
          </>,
          <>
            Members vote. With auto-threads on, a thread opens under it for
            discussion.
          </>,
          <>
            Staff set a status. Sparko asks for a reason, shows it under the
            suggestion with who set it, and runs the status’s actions.
          </>,
        ]}
      />

      <h2>Settings tab</h2>
      <h3>Channels and people</h3>
      <SettingsTable
        rows={[
          [
            'Suggestion channel',
            'Where suggestions are posted for everyone to vote on. Required.',
            'Your general channel',
          ],
          [
            'Review channel (staff)',
            <>
              New suggestions wait here until staff press <b>Post it</b> or{' '}
              <b>Reject</b>. Pick <b>None</b> to post straight away. It has to
              be a different channel from the suggestion channel.
            </>,
            'None',
          ],
          [
            'Who can suggest',
            'Members with any of these roles can suggest. Empty means everyone. Up to 25 roles.',
            'Everyone',
          ],
          [
            'Blacklist role',
            'Members with this role can’t suggest, whatever other roles they have. A status with Blacklist the author gives it. It can’t also be a Who can suggest role.',
            'None',
          ],
          [
            'Minimum account age',
            'How old a Discord account must be to suggest, from 1 day to 1 year, like 3d, 2w, 1mt or 1y. Empty means any age.',
            'Any age',
          ],
          [
            'Roles allowed to suggest bypass the minimum account age',
            'On: members with a Who can suggest role skip the age check. Off: they need both.',
            'On',
          ],
          [
            'Who can approve or deny',
            'Roles that can set statuses and use Post it and Reject. This isn’t voting: everyone votes normally. Empty means members with Manage Server.',
            'Manage Server',
          ],
          [
            'Who can delete',
            'Roles that can delete suggestions. If someone else deletes one in Discord, Sparko posts it again and keeps its data. Empty means Manage Server.',
            'Manage Server',
          ],
        ]}
      />
      <h3>Voting</h3>
      <SettingsTable
        rows={[
          [
            'Members vote with',
            <>
              <b>Reactions</b> (Sparko adds both to every suggestion),{' '}
              <b>Buttons</b> (always two: one for, one against) or a <b>Menu</b>{' '}
              with two options.
            </>,
            'Buttons',
          ],
          [
            'Upvote and downvote',
            'Each has an emoji; buttons also have a name (up to 80 characters) and a colour; menu options have a title and a description (up to 100 each). Reactions need two different emojis. Drag them to choose which comes first.',
            '👍 Upvote (green), 👎 Downvote (red)',
          ],
          [
            'Menu text',
            'What the menu says before anything is picked, up to 150 characters. Closed suggestions say Voting is closed.',
            'Vote on this suggestion',
          ],
          [
            'Allow changing votes',
            'Members can switch their vote, or take it back by voting the same way again.',
            'On',
          ],
          [
            'Allow voting on your own suggestion',
            'Off means the author’s vote doesn’t count.',
            'Off',
          ],
          [
            'Auto-threads',
            'Opens a thread on each suggestion for discussion, and locks it when voting closes.',
            'Off',
          ],
          [
            'Anonymous suggestions',
            'The post says Anonymous instead of the author. Staff still see who it was in Storage.',
            'Off',
          ],
        ]}
      />
      <p>
        With buttons or a menu, each vote can also do more after it counts, up
        to 9 more actions: send a message or give or take roles. Those run only
        when a vote counts, not when it’s taken back.
      </p>
      <h3>Status and workflow</h3>
      <p>
        Every suggestion starts as <b>Pending</b> (or <b>Waiting for review</b>
        ). <b>Approved</b> and <b>Denied</b> are built in: you can rename them
        and change their colour and what else they do, but not remove them. Add
        your own, like Planned or In progress, with <b>+ Status</b>. Each status
        has a name (up to 25 characters, not “Pending” or “Review”), an embed
        colour, and actions that run from top to bottom:
      </p>
      <TermTable
        head={['Action', 'What it does']}
        rows={[
          [
            'Approve',
            'Counts it as approved. A status can approve or deny, not both. Auto-approve uses Approved.',
          ],
          [
            'Deny',
            'Counts it as denied. A suggestion denied while waiting for review is never posted.',
          ],
          [
            'Close voting',
            'Nobody can vote any more. Its buttons are greyed out and its thread is locked.',
          ],
          [
            'DM the author',
            'Sends the author a message with the status and reason: Sparko’s own, or a Message Studio template. Members who don’t take DMs from the server won’t get it, and the log says so.',
          ],
          [
            'Blacklist the author',
            'Gives the author the blacklist role, so they can’t suggest again. Sparko must be able to give that role.',
          ],
        ]}
      />
      <SettingsTable
        rows={[
          [
            'Auto-approve at',
            'Sets Approved once a suggestion has this many upvotes, up to 10,000. 0 or empty is off.',
            'Off',
          ],
          [
            'Auto-deny at',
            'Sets Denied once it has this many downvotes, up to 10,000. 0 or empty is off.',
            'Off',
          ],
          [
            'Auto-close after',
            'Closes voting this long after posting, from 1 minute to 1 month, like 30mi, 12h, 7d or 1mt. Empty keeps voting open.',
            'Never',
          ],
          [
            'Restart the timer when someone votes',
            'Each vote starts the auto-close time again, so busy suggestions stay open.',
            'Off',
          ],
        ]}
      />
      <h3>Limits</h3>
      <SettingsTable
        rows={[
          [
            'Cooldown between suggestions',
            'How long a member waits before suggesting again, from 1 hour to 1 month, like 1h, 12h, 1d or 1mt. Empty is no cooldown.',
            'None',
          ],
          [
            'Max pending suggestions per user',
            'How many suggestions one member can have waiting for a status at once, 1 to 10. 0 is no limit.',
            'No limit',
          ],
          [
            'Shortest suggestion',
            'Fewest characters, 0 or more. 0 lets any length through.',
            '10',
          ],
          [
            'Longest suggestion',
            'Most characters, 100 to 12,000. Long suggestions carry on in more embeds or containers under the first, like pages.',
            '5,000',
          ],
          [
            'Duplicate detection',
            'If someone suggests the same thing again (ignoring case and punctuation), it isn’t posted and only they see a link to the first.',
            'On',
          ],
        ]}
      />

      <h2>Edit tab: the message</h2>
      <p>
        The suggestion is posted with a Message Studio template that you edit
        right in the live preview. Until you pick one, Sparko uses its{' '}
        <b>Suggestion card</b>. Start from one of four defaults:
      </p>
      <TermTable
        head={['Default', 'Looks like']}
        rows={[
          ['Suggestion card', 'An embed with the author, status and votes.'],
          ['Compact', 'Just the idea, with the details in the footer.'],
          [
            'Modern suggestion',
            'A Components V2 card with the votes under a divider.',
          ],
          ['Poll style', 'Shows the votes as percentages.'],
        ]}
      />
      <ul>
        <li>
          A suggestion message is <b>one embed or one container</b>, without a
          picture of its own. Members’ files show with <Code>{'{files}'}</Code>;
          the first picture becomes the embed’s image.
        </li>
        <li>
          Click a vote button in the preview to change it. You can add your own
          buttons and menus too, including ones that vote, approve or deny. The
          vote buttons take one of Discord’s five rows, so you have 4 of your
          own.
        </li>
        <li>
          When a status is set, a box with the reason and who set it is added
          under the suggestion, in the status’s colour.
        </li>
        <li>
          <b>Send a test message to</b> posts a made-up suggestion in a channel
          you pick, using what’s saved.
        </li>
      </ul>
      <h3>Variables</h3>
      <p>
        On top of the <Link to="/docs/variables">usual variables</Link>,
        suggestion messages and status DMs can use:
      </p>
      <VariableList only="suggestion" />
      <p>
        Status DMs can also use <Code>{'{reason}'}</Code> and{' '}
        <Code>{'{staff}'}</Code> (who set it). With anonymous suggestions,{' '}
        <Code>{'{user}'}</Code> and <Code>{'{user.name}'}</Code> say Anonymous.
      </p>

      <h2>Storage tab</h2>
      <p>
        Every suggestion posted, with its author, title, status, votes and
        reason, coloured from green to red by how it’s doing. Search by{' '}
        <Code>#number</Code>, title, username or user ID, and filter by status.
        Click one to open it in Discord, or delete it: its message, thread and
        votes leave Discord and its data is removed.
      </p>
      <LimitTable
        rows={[
          ['Storage', '10 MB', '100 MB'],
          ['Suggestions kept (4 KB each)', '2,560', '25,600'],
          ['Statuses, Approved and Denied included', '6', '20'],
          ['Actions per status', '5', '5'],
        ]}
      />

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['POSTED', 'A suggestion was posted.'],
          ['REVIEW', 'A suggestion is waiting for staff to check it.'],
          ['ACCEPTED', 'Staff checked it and pressed Post it.'],
          ['STATUS', 'Staff, or auto-approve and auto-deny, set a status.'],
          ['CLOSED', 'Voting closed, by a status or Auto-close.'],
          ['DELETED', 'Someone with a delete role deleted it.'],
          [
            'RESENT',
            'Someone without a delete role deleted it in Discord, so Sparko posted it again.',
          ],
          ['REFUSED', 'A member couldn’t suggest, and why.'],
          ['FAILED', 'Something couldn’t be done, such as a DM.'],
        ]}
      />
      <p>
        Filter by <b>All</b>, <b>Posted</b>, <b>Statuses</b>, <b>Deleted</b> and{' '}
        <b>Problems</b>.
      </p>

      <h2>Commands tab and commands</h2>
      <p>
        Rename any command (1 to 32 lowercase letters, numbers, - or _), change
        the description Discord shows under it (up to 100 characters), or turn
        it off. Changes reach Discord a few seconds after you save.
      </p>
      <CommandTable
        names={[
          '/suggest',
          '/suggestion-status',
          '/suggestion-approve',
          '/suggestion-deny',
          '/suggestion-delete',
        ]}
      />

      <h2>Permissions Sparko needs</h2>
      <ul>
        <li>
          <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in
          the suggestion and review channels.
        </li>
        <li>
          <b>Add Reactions</b> when members vote with reactions.
        </li>
        <li>
          <b>Create Public Threads</b> when auto-threads are on.
        </li>
        <li>
          <b>Manage Roles</b>, above the blacklist role, when a status
          blacklists authors.
        </li>
      </ul>
      <Tip icon="info" title="Common questions">
        Votes not counting? Check Allow voting on your own suggestion. A status
        missing from <Code>/suggestion-status</Code>? It suggests every status
        by name as you type, so save first. Someone can’t suggest? The Logs tab
        says exactly why under REFUSED.
      </Tip>
    </>
  ),
};
