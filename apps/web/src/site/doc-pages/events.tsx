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

export const eventsDoc: DocPage = {
  id: 'events',
  group: 'Modules',
  title: 'Events & RSVP',
  icon: 'calendar',
  lede: 'Schedule events, collect Going, Maybe and Can’t go answers, keep a waitlist, and remind people before they start.',
  body: () => (
    <>
      <p>
        Schedule an event in the dashboard or with <Code>/event create</Code>.
        Sparko posts it with RSVP buttons and an <b>Add to calendar</b> link,
        keeps the counts up to date, DMs reminders, pings when it starts, and
        posts the next one when an event repeats.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Events & RSVP</b> and switch it on.
          </>,
          <>
            On <b>Settings</b>, pick the <b>Events channel</b> and your server’s{' '}
            <b>Time zone</b>.
          </>,
          <>Set the default reminders and answers new events start with.</>,
          <>
            Save, then schedule your first event on the <b>Events</b> tab or
            with <Code>/event create</Code>.
          </>,
        ]}
      />
      <Shot
        name="events-new"
        alt="The Events tab: upcoming events with their dates, places and RSVP counts, and Schedule an event."
        caption="The Events tab: schedule an event, then see who’s coming."
      />

      <h2>Scheduling an event</h2>
      <SettingsTable
        noDefault
        rows={[
          ['Title', 'Up to 100 characters, like Movie night.'],
          [
            'Description',
            <>
              What’s happening and anything to bring, up to 1,000 characters.
              Shown with <Code>{'{event.description}'}</Code>.
            </>,
          ],
          [
            'Starts and Ends',
            'A date and time, up to 2 years ahead. An event lasts 5 minutes to 14 days. Once it has started, the start is fixed.',
          ],
          [
            'Time zone',
            'The start and end are in this time zone. Members always see times in their own.',
          ],
          [
            'Repeats',
            'Doesn’t repeat, Every day, Every week, Every 2 weeks or Every month. When it ends, Sparko schedules and posts the next one with the same details.',
          ],
          [
            'Voice or stage channel',
            'Where it happens on Discord, if it does. The start ping says where to join.',
          ],
          [
            'Place',
            'Somewhere else it happens, like “Minecraft server” or a link, up to 100 characters.',
          ],
          [
            'Capacity',
            'How many can go, up to 10,000. Anyone after that joins a waitlist and moves up when a spot opens. 0 is no limit.',
          ],
          [
            'Picture',
            'A link to a picture shown in the event message, starting with https://.',
          ],
          [
            'Who can answer',
            'Only members with these roles can press the buttons. Empty is everyone.',
          ],
          [
            'Ping when it’s posted',
            'A role mentioned once, when the event is first posted.',
          ],
          ['Answers', 'This event’s RSVP buttons, from your defaults.'],
          [
            'Reminders',
            'DMs to Going members this long before the start, from your defaults.',
          ],
          ['Remind Maybe answers too', 'Maybe answers get the reminders too.'],
          [
            'Ping when it starts',
            'Mentions everyone going in the events channel at the start.',
          ],
          [
            'Post it',
            <>
              <b>Straight away</b>, or <b>Later</b> at a time you pick.
            </>,
          ],
        ]}
      />
      <h3>With /event create</h3>
      <p>
        A form asks for the title, description, when it starts, how long it
        lasts and where. Times are read the way people write them, in your
        server’s time zone:
      </p>
      <ul>
        <li>
          <Code>2026-10-20 19:00</Code>, <Code>20 Oct 7pm</Code>,{' '}
          <Code>Oct 20 2026 19:30</Code>
        </li>
        <li>
          <Code>tomorrow 18:00</Code>, <Code>friday 8pm</Code>, or just{' '}
          <Code>19:00</Code> for the next 7 pm
        </li>
        <li>
          <Code>in 2h</Code>, <Code>in 30 minutes</Code>, <Code>in 3 days</Code>
        </li>
      </ul>
      <p>
        A date written as <Code>20/10</Code> or <Code>10/20</Code> only counts
        when it can’t be read the other way round.
      </p>

      <h2>Answers and the waitlist</h2>
      <ul>
        <li>
          Members press <b>Going</b>, <b>Maybe</b> or <b>Can’t go</b>, or use{' '}
          <Code>/event rsvp</Code>. The message shows the counts and the first
          names going.
        </li>
        <li>
          With a capacity, Going members past it join the <b>waitlist</b> in the
          order they answered. When someone stops going, the next in line moves
          up to Going and gets a DM.
        </li>
        <li>
          With an <b>attending role</b>, Going members get it until the event
          ends, so you can open a channel just for them.
        </li>
      </ul>
      <TermTable
        head={['Status', 'Means']}
        rows={[
          ['Upcoming', 'Scheduled and taking answers.'],
          ['Happening now', 'It has started.'],
          ['Ended', 'Its end time passed. The buttons are off.'],
          [
            'Cancelled',
            'Staff cancelled it. The message says so, the buttons are off, and Going members get a DM.',
          ],
        ]}
      />

      <h2>Settings tab</h2>
      <h3>Where and who</h3>
      <SettingsTable
        rows={[
          [
            'Events channel',
            'Where each event is posted with its RSVP buttons, and where Sparko pings when one starts.',
            'Your general channel',
          ],
          [
            'Time zone',
            'New events start in this time zone, and /event create reads times in it. The current offset is shown beside it.',
            'UTC',
          ],
          [
            'Who can manage events',
            'Roles that can create, cancel and send reminders with /event. Empty means Manage Server.',
            'Manage Server',
          ],
        ]}
      />
      <h3>What new events start with</h3>
      <SettingsTable
        rows={[
          [
            'Default reminders',
            'DMs to Going members this long before the start, 1 minute to 30 days, like 1d, 1h or 10m. Up to 2 on Free, 5 on Plus.',
            '1h',
          ],
          [
            'Remind Maybe answers too',
            'Members who answered Maybe also get the reminders.',
            'Off',
          ],
          [
            'Ping when it starts',
            'Posts in the events channel at the start, mentioning everyone going.',
            'On',
          ],
          [
            'Answers',
            'The buttons under each event, each with a name (up to 30 characters) and an emoji. Going is always there; Maybe and Can’t go can be turned off.',
            '✅ Going, 🤔 Maybe, ❌ Can’t go',
          ],
          [
            'Names in the attendee list',
            <>
              How many members <Code>{'{going.list}'}</Code> names before it
              says “and 5 more”. 1 to 50.
            </>,
            '10',
          ],
        ]}
      />
      <h3>Roles and Discord</h3>
      <SettingsTable
        rows={[
          [
            'Attending role',
            'Going members get a role until the event ends. Sparko takes it back when they change their answer or the event is over. Sparko’s role has to be above it.',
            'Off',
          ],
          [
            'Add events to Discord’s events',
            'Each event also shows in the server’s Events list, and is updated, started and cancelled along with Sparko’s.',
            'Off',
          ],
        ]}
      />
      <h3>DMs</h3>
      <SettingsTable
        rows={[
          [
            'Reminders',
            'Before each event starts, at its reminder times.',
            'On',
          ],
          ['Cancelled events', 'To everyone who was going.', 'On'],
          [
            'Off the waitlist',
            'When a spot opens and someone moves up to Going.',
            'On',
          ],
        ]}
      />
      <p>Members who don’t take DMs from the server simply don’t get them.</p>

      <h2>Events tab</h2>
      <p>
        Below the builder are your <b>Upcoming</b> and <b>Past</b> events with
        their Going, Maybe and waitlist counts. On each one:
      </p>
      <ul>
        <li>
          <b>Who’s coming</b>: everyone who answered, by answer. Mark anyone as
          a <b>No-show</b>, and <b>Export CSV</b> with names, IDs, answers and
          when they answered.
        </li>
        <li>
          <b>Edit</b> its details, or <b>Duplicate</b> it as a new event.
        </li>
        <li>
          <b>Cancel</b>: the message shows Cancelled, Going members get a DM,
          and Discord’s event is cancelled too. This can’t be undone.
        </li>
        <li>
          <b>Delete</b>: removes its message, answers and Discord’s event, and
          takes the attending role back. Nobody gets a DM, so cancel first if
          you want to tell people.
        </li>
      </ul>
      <LimitTable
        rows={[
          ['Upcoming events at once', '5', '100'],
          ['Reminders per event', '2', '5'],
          ['Past events kept', '100', '100'],
        ]}
      />

      <h2>Edit tab: four messages</h2>
      <TermTable
        head={['Message', 'When it’s sent, and defaults']}
        rows={[
          [
            'Event',
            'Posted in the events channel and kept up to date. The RSVP and Add to calendar buttons are added under it. Defaults: Event card, Compact, Modern event.',
          ],
          [
            'Reminder DM',
            'To Going (and Maybe, if set) members before the start. Defaults: Reminder, Modern reminder.',
          ],
          [
            'Cancelled DM',
            'To Going members when an event is cancelled. Default: Cancelled notice.',
          ],
          [
            'Waitlist DM',
            'When someone moves up from the waitlist. Default: You’re in!',
          ],
        ]}
      />
      <h3>Variables</h3>
      <p>
        On top of the <Link to="/docs/variables">usual variables</Link>:
      </p>
      <VariableList only="event" />

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['CREATED', 'An event was scheduled.'],
          ['EDITED', 'Its details changed.'],
          ['RSVP', 'A member answered.'],
          ['PROMOTED', 'Someone moved from the waitlist to Going.'],
          ['REMINDER', 'Reminder DMs went out.'],
          ['STARTED', 'It started.'],
          ['ENDED', 'It ended.'],
          ['CANCELLED', 'Staff cancelled it.'],
          ['DELETED', 'Staff deleted it.'],
          ['REPEATED', 'A repeating event was scheduled again.'],
          ['FAILED', 'Something couldn’t be done.'],
        ]}
      />

      <h2>Commands</h2>
      <p>
        On the <b>Commands</b> tab, rename <Code>/event</Code> and its
        subcommands, change their descriptions, or turn any off.
      </p>
      <CommandTable
        names={[
          '/event create',
          '/event list',
          '/event info',
          '/event rsvp',
          '/event cancel',
          '/event remind',
        ]}
      />
      <h2>Permissions Sparko needs</h2>
      <ul>
        <li>
          <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in
          the events channel.
        </li>
        <li>
          <b>Manage Roles</b>, above the attending role, when it’s on.
        </li>
        <li>
          <b>Manage Events</b>, to add events to Discord’s own list.
        </li>
      </ul>
      <Tip title="Weekly game night in one go">
        Schedule it once with Repeats set to Every week and a capacity. Each
        week’s event is posted as soon as the last one ends, with its own
        answers and waitlist.
      </Tip>
    </>
  ),
};
