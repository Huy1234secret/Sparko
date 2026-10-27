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

export const starboardDoc: DocPage = {
  id: 'starboard',
  group: 'Modules',
  title: 'Starboard',
  icon: 'star',
  lede: 'Messages that collect enough star reactions are reposted to a highlights channel, with a count that keeps up.',
  body: () => (
    <>
      <p>
        Members react with ⭐ (or your own emojis) on messages they love. Once a
        message has enough stars, Sparko posts it in your highlights channel
        with a <b>Jump to message</b> button, and keeps the count up to date.
        Add a second board with a higher threshold for a hall of fame.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Starboard</b> and switch it on.
          </>,
          <>
            On <b>Settings</b>, pick the board’s <b>Highlights channel</b> and
            how many <b>Stars needed</b>.
          </>,
          <>
            Choose the star emojis, up to 5, and which channels the board
            watches.
          </>,
          <>
            On <b>Edit</b>, pick how posts look, or keep Sparko’s classic post.
          </>,
          <>
            Save. Sparko adds <Code>/starboard</Code> to your server.
          </>,
        ]}
      />
      <Shot
        name="starboard-settings"
        alt="The Starboard Settings tab: the board list, the highlights channel, the star emojis and the stars needed."
        caption="Settings: each board with its channel, emojis and threshold."
      />

      <h2>How stars count</h2>
      <ul>
        <li>
          A reaction with <b>any</b> of the board’s emojis is a star. Each
          member counts once, however many star emojis they add.
        </li>
        <li>
          Stars on the board post count too, so people can star from the
          highlights channel.
        </li>
        <li>
          The post’s count updates within a couple of seconds, at most one edit
          every couple of seconds, so a flood of stars doesn’t spam edits.
        </li>
        <li>Passing 10, 25, 50 and 100 stars gets its own line in the log.</li>
      </ul>

      <h2>Settings tab</h2>
      <h3>Boards</h3>
      <p>
        Free has 1 board; Plus has up to 5. Each board has its own channel,
        emojis, threshold, rules and post. Removing a board forgets its starred
        messages when you save; posts already in its channel stay.
      </p>
      <SettingsTable
        rows={[
          [
            'Board name',
            <>
              Up to 32 characters. Shown in the dashboard, in{' '}
              <Code>/starboard</Code> and in posts with <Code>{'{board}'}</Code>
              .
            </>,
            'Starboard',
          ],
          [
            'Highlights channel',
            'Where messages with enough stars are posted. Each board needs its own channel.',
            '—',
          ],
          [
            'Stars needed',
            'How many members have to star a message before it’s posted. 1 to 1,000.',
            '3',
          ],
          [
            'Star emojis',
            'Up to 5, all different. Server emojis work too.',
            '⭐',
          ],
        ]}
      />
      <h3>Rules</h3>
      <SettingsTable
        rows={[
          [
            'Watch',
            <>
              <b>Every channel except</b> the ones you pick, or{' '}
              <b>Only these channels</b>. Up to 50 channels. Threads count as
              the channel they’re in, and the board’s own channel is never
              watched.
            </>,
            'Every channel',
          ],
          [
            'Ignore messages older than',
            'Stars on older messages don’t count. In days, up to 365. 0 is no limit.',
            'No limit',
          ],
          [
            'Shortest message',
            'Messages with fewer characters can’t reach the board, up to 2,000. 0 lets any length through, pictures too.',
            '0',
          ],
          [
            'Blocked roles',
            'Members with these roles can’t reach this board, and their stars don’t count on it. Up to 25.',
            'None',
          ],
          [
            'Count the author’s own star',
            'Off means starring your own message does nothing.',
            'Off',
          ],
          [
            'Ignore stars from bots',
            'Reactions added by bots, Sparko included, don’t count.',
            'On',
          ],
          [
            'Allow messages from bots',
            'Bots’ messages, like announcements, can reach the board.',
            'Off',
          ],
          [
            'Skip age-restricted channels',
            'Messages from age-restricted (NSFW) channels only reach the board if its own channel is age-restricted too.',
            'On',
          ],
        ]}
      />
      <h3>When things change</h3>
      <SettingsTable
        rows={[
          [
            'When a post drops below the threshold',
            <>
              <b>Take the post down</b>, or <b>Keep it</b>.
            </>,
            'Take the post down',
          ],
          [
            'When the original message is deleted',
            <>
              <b>Take the post down</b>, or <b>Keep it</b> (the post remembers
              what it said).
            </>,
            'Take the post down',
          ],
          [
            'Staff roles',
            'Roles that can use /starboard freeze and /starboard block. Empty means members with Manage Messages. Applies to every board.',
            'Manage Messages',
          ],
        ]}
      />

      <h2>Edit tab: the post</h2>
      <p>
        Each board posts with a Message Studio template, edited right in the
        preview. Sparko adds a <b>Jump to message</b> button under every post;
        it can’t be changed or removed and takes one of Discord’s five rows.
        Defaults to start from:
      </p>
      <TermTable
        head={['Default', 'Looks like']}
        rows={[
          [
            'Classic starboard',
            'The count above an embed with the author, text and picture.',
          ],
          ['Compact', 'One small embed: who, where and the stars.'],
          [
            'Highlight card',
            'A Components V2 card with the picture below the text.',
          ],
        ]}
      />
      <h3>Variables</h3>
      <p>
        On top of the <Link to="/docs/variables">usual variables</Link>:
      </p>
      <VariableList only="starboard" />
      <Tip icon="info" title="“Discord didn’t share the text of this message”?">
        Sparko needs Discord’s Message Content Intent to read message text.
        Without it, posts keep the pictures and show that note instead of the
        text.
      </Tip>

      <h2>Storage tab</h2>
      <p>
        Every starred message, sorted by <b>Most stars</b> or <b>Newest</b>,
        filtered by board, and searchable by text, username or ID. On each one
        you can:
      </p>
      <ul>
        <li>
          <b>Freeze</b> it, so its count stops changing, or unfreeze it.
        </li>
        <li>
          <b>Remove</b> its post from the board.
        </li>
        <li>
          <b>Block</b> the message, or <b>Block author</b> so nothing of theirs
          reaches any board. The <b>Blocked</b> list shows who and what is
          blocked, by whom, with Unblock.
        </li>
      </ul>
      <LimitTable
        rows={[
          ['Boards', '1', '5'],
          ['Star emojis per board', '5', '5'],
          ['Storage', '10 MB', '100 MB'],
          ['Starred messages kept (2 KB each)', '5,120', '51,200'],
        ]}
      />
      <p>
        When storage is full, new messages aren’t posted; removing old ones
        frees space.
      </p>

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['POSTED', 'A message reached the threshold and was posted.'],
          ['MILESTONE', 'A post passed 10, 25, 50 or 100 stars.'],
          [
            'REMOVED',
            'A post left the board: it dropped below the threshold, the original was deleted, or staff took it off.',
          ],
          ['FROZEN / UNFROZEN', 'Staff froze or unfroze a post’s count.'],
          [
            'BLOCKED / UNBLOCKED',
            'Staff blocked or unblocked a message or member.',
          ],
          ['FAILED', 'Something couldn’t be done, such as posting.'],
        ]}
      />

      <h2>Commands</h2>
      <p>
        On the <b>Commands</b> tab, rename <Code>/starboard</Code> and each
        subcommand, change their descriptions, or turn any off. Turning off{' '}
        <Code>/starboard</Code> turns them all off.
      </p>
      <CommandTable
        names={[
          '/starboard top',
          '/starboard random',
          '/starboard stats',
          '/starboard freeze',
          '/starboard block',
        ]}
      />
      <h2>Permissions Sparko needs</h2>
      <ul>
        <li>
          <b>View Channel</b> and <b>Read Message History</b> in the channels it
          watches, to see reactions.
        </li>
        <li>
          <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in
          each highlights channel.
        </li>
      </ul>
    </>
  ),
};
