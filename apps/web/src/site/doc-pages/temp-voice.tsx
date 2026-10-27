import { Link } from 'react-router-dom';
import {
  tvActAbout,
  tvActEmoji,
  tvActNames,
  tvActs,
} from '../../data/studio-format';
import {
  Code,
  LimitTable,
  SettingsTable,
  Shot,
  Steps,
  TermTable,
  Tip,
  VariableList,
  type DocPage,
} from './parts';

export const tempVoiceDoc: DocPage = {
  id: 'temp-voice',
  group: 'Modules',
  title: 'Temporary voice channels',
  icon: 'volume-2',
  lede: 'Members join a hub channel and get their own voice room, which they control with a panel or /voice, and which is deleted once it’s empty.',
  body: () => (
    <>
      <p>
        Instead of a long list of empty voice channels, give members one{' '}
        <b>hub</b>. Joining it makes a room just for them and moves them in. The
        owner can rename, lock, hide or hand over their room, and Sparko deletes
        it once everyone has left.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Make a voice channel in Discord for the hub, like “➕ Join to
            create”.
          </>,
          <>
            Open <b>Community → Temporary voice channels</b>, switch it on and
            press <b>+ Hub</b>. Pick that voice channel as the{' '}
            <b>Hub channel</b>.
          </>,
          <>
            Choose how rooms start: their category, name, user limit, bitrate,
            and whether they start locked or hidden.
          </>,
          <>
            Pick a <b>Panel channel</b> and its buttons, and the panel’s text on{' '}
            <b>Edit</b>.
          </>,
          <>
            Save. Sparko posts the panel and adds <Code>/voice</Code> to your
            server.
          </>,
        ]}
      />
      <Shot
        name="temp-voice-settings"
        alt="The Temporary voice Settings tab: a hub with its voice channel, room name, limit and bitrate."
        caption="Settings: hubs, and how their rooms start."
      />

      <h2>Three ways to get a room</h2>
      <ul>
        <li>
          <b>Join a hub</b>: Sparko makes the room in the hub’s category
          straight away and moves the member in.
        </li>
        <li>
          <b>Press Create room</b> on the panel, or use{' '}
          <Code>/voice create</Code> (with an optional name and limit). Sparko
          sends the room’s link privately, and moves them in if they’re already
          in voice. If nobody joins within a minute, the room is deleted.
        </li>
        <li>
          Whoever makes the room <b>owns</b> it. Only the owner can change it;
          anyone in it can <b>claim</b> it once the owner has left.
        </li>
      </ul>

      <h2>Settings tab</h2>
      <h3>Hubs</h3>
      <p>
        Free has 1 hub; Plus has up to 10, each with its own room settings. Each
        hub needs its own voice channel.
      </p>
      <SettingsTable
        rows={[
          [
            'Hub channel',
            'The voice channel members join. Sparko makes their room straight away and moves them into it.',
            '—',
          ],
          [
            'Rooms go in',
            'The category rooms are made in. Rooms in a private category stay private.',
            'The hub’s category',
          ],
          [
            'Room name',
            <>
              Up to 100 characters. Write <Code>{'{user.name}'}</Code> for the
              owner’s name and <Code>{'{count}'}</Code> for a number, like{' '}
              <Code>{'Squad #{count}'}</Code>. Owners can rename their own room.
            </>,
            '{user.name}’s room',
          ],
          [
            'User limit',
            'How many can join, 1 to 99. 0 is no limit. Owners can change it.',
            '0',
          ],
          [
            'Bitrate',
            'Sound quality, from 8 to 384 kbps. Your boost level caps it: 96 kbps with no boosts, 128 at level 1, 256 at level 2, 384 at level 3.',
            '64 kbps',
          ],
          ['Start locked', 'Only members the owner trusts can join.', 'Off'],
          ['Start hidden', 'Only trusted members can see the room.', 'Off'],
          [
            'Text chat in rooms',
            'Members can write in the room’s built-in chat.',
            'On',
          ],
        ]}
      />
      <h3>Rooms made with the button or command</h3>
      <p>
        The same settings as a hub, for rooms made with <b>Create room</b> or{' '}
        <Code>/voice create</Code>. By default they go in the category of the
        channel the button or command was used in.
      </p>
      <h3>All rooms</h3>
      <SettingsTable
        rows={[
          [
            'Delete empty rooms',
            'How long a room waits once the last person leaves: straight away, or after up to 60 seconds. If someone joins in that time, it stays. Rooms emptied while Sparko was offline are cleaned up when it’s back.',
            'Straight away',
          ],
          [
            'Rooms per member',
            'How many rooms one member can own at once, 1 to 5. Joining a hub with none left moves them into their newest room instead.',
            '1 room',
          ],
          [
            'Bypass role',
            'Members with this role can own any number of rooms, and join rooms that are locked or hidden.',
            'None',
          ],
          [
            'Remember each member’s settings',
            'A member’s room name, limit, lock, and trusted and blocked members (up to 25 each) are used again for their next room. Staff can reset them in Storage.',
            'On',
          ],
        ]}
      />
      <h3>Control panel</h3>
      <SettingsTable
        rows={[
          [
            'Panel channel',
            'Where Sparko posts the panel. Saving updates it in place, and Post again re-posts it. Members can still use the commands without a panel.',
            'Don’t post a panel',
          ],
          [
            'Buttons',
            'Which buttons the panel has, at least one. The panel shows how many of Discord’s five rows they take.',
            'All but Region and Bitrate',
          ],
          [
            'Show button names',
            'Off shows only the emoji, for a smaller panel.',
            'On',
          ],
          [
            'Post the panel in every new room',
            <>
              It goes in the room’s own text chat, with the{' '}
              <Code>{'{room}'}</Code> variables filled in.
            </>,
            'Off',
          ],
        ]}
      />

      <h2>Every button and /voice command</h2>
      <p>
        Each panel button is also a <Code>/voice</Code> subcommand. Only a
        room’s owner can use them on it, except <b>Create room</b> and{' '}
        <b>Claim</b>.
      </p>
      <TermTable
        head={['Button and command', 'What it does']}
        rows={tvActs.map((a) => [
          <>
            {tvActEmoji[a]} {tvActNames[a]} · <Code>/voice {a}</Code>
          </>,
          tvActAbout[a],
        ])}
      />

      <h2>Edit tab: the panel’s text</h2>
      <p>
        The panel’s text is a Message Studio template. Start from{' '}
        <b>Voice control panel</b> (an embed explaining each button),{' '}
        <b>Short and simple</b> (one line above the buttons) or{' '}
        <b>Modern panel</b> (Components V2). The buttons take some of Discord’s
        five rows, and the rest are yours.
      </p>
      <h3>Variables</h3>
      <p>
        On top of the <Link to="/docs/variables">usual variables</Link>, a panel
        posted inside a room can use:
      </p>
      <VariableList only="voice" />

      <h2>Storage tab</h2>
      <ul>
        <li>
          <b>Open rooms</b>: every room right now, with its owner, who’s in it,
          and whether it’s locked or hidden. <b>Close</b> one to delete it and
          disconnect everyone.
        </li>
        <li>
          <b>Saved settings</b>: what Sparko remembers for each member.{' '}
          <b>Reset</b> one so their next room starts from the hub’s settings.
        </li>
      </ul>
      <LimitTable
        rows={[
          ['Hubs', '1', '10'],
          ['Rooms one member can own', '5', '5'],
          ['Saved trusted or blocked members, each', '25', '25'],
        ]}
      />

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['CREATED', 'A member got a room.'],
          ['RENAMED', 'The owner renamed it.'],
          ['LIMIT', 'Its user limit changed.'],
          ['LOCKED / UNLOCKED', 'The owner locked or unlocked it.'],
          ['HIDDEN / SHOWN', 'The owner hid it or showed it again.'],
          ['OWNER', 'It changed hands, by claim or transfer.'],
          ['DELETED', 'It was deleted: empty, by its owner or by staff.'],
          ['FAILED', 'Something couldn’t be done.'],
        ]}
      />

      <h2>Commands tab</h2>
      <p>
        Rename <Code>/voice</Code> and each subcommand, change their
        descriptions, or turn any off.
      </p>
      <h2>Permissions Sparko needs</h2>
      <ul>
        <li>
          <b>Manage Channels</b>, to make, change and delete rooms.
        </li>
        <li>
          <b>Manage Roles</b>, to lock, hide, trust and block (these are channel
          permissions).
        </li>
        <li>
          <b>Move Members</b>, to move members into their room and disconnect
          them.
        </li>
        <li>
          <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in
          the panel channel.
        </li>
      </ul>
      <Tip icon="info" title="Rename not working?">
        Discord lets a channel be renamed twice every 10 minutes. Wait a few
        minutes and try again.
      </Tip>
    </>
  ),
};
