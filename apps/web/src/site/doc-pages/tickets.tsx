import { Link } from 'react-router-dom';
import {
  Code,
  SettingsTable,
  Shot,
  Steps,
  TermTable,
  Tip,
  type DocPage,
} from './parts';

export const ticketsDoc: DocPage = {
  id: 'tickets',
  group: 'Modules',
  title: 'Tickets',
  icon: 'ticket',
  lede: 'Private help threads between members and your staff, with an inbox, claiming, priority, staff notes and transcripts.',
  body: () => (
    <>
      <p>
        Sparko posts a <b>ticket panel</b> in a channel you pick. When a member
        presses one of its buttons, a private thread opens with just them and
        your staff, starting with the question that button asks. Your team
        answers in Discord or from the dashboard’s inbox, and every message is
        kept in one place.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Support → Tickets</b> in the dashboard and go to{' '}
            <b>Settings</b>.
          </>,
          <>
            Under <b>Where the panel goes</b>, pick the channel. Sparko needs to
            post and open private threads there.
          </>,
          <>
            Write the <b>Panel message</b>: a title, a description and a colour
            bar.
          </>,
          <>
            Add up to 5 <b>Buttons</b>, one for each kind of problem, each with
            the question Sparko asks first.
          </>,
          <>
            Under <b>Who handles tickets</b>, pick your staff roles.
          </>,
          <>
            Save. Sparko posts the panel, and new tickets appear in the{' '}
            <b>Inbox</b> tab.
          </>,
        ]}
      />
      <Shot
        name="tickets-settings"
        alt="Ticket settings: the panel’s channel, title and description, with a live preview of the panel and of a ticket’s opener."
        caption="Settings: the panel on the left, and a live preview of the panel and the opener on the right."
      />

      <h2>What a member sees</h2>
      <Steps
        items={[
          <>They press a button on the panel, like “Get help”.</>,
          <>
            Sparko opens a private thread named <Code>ticket-12</Code>, adds
            them, and posts an opener: who opened it, the topic, and that
            button’s question. Staff roles are pinged if you chose that.
          </>,
          <>
            They explain, attach screenshots, and talk to staff in the thread.
            Nobody else in the server can see it.
          </>,
          <>
            When it’s closed, the thread is locked. If you chose to, they get a
            DM with the reason.
          </>,
        ]}
      />
      <p>
        With <b>One open ticket per member</b> on, pressing a button again takes
        them to the ticket they already have.
      </p>

      <h2>Settings tab</h2>
      <h3>Panel</h3>
      <SettingsTable
        rows={[
          [
            'Panel channel',
            'Where Sparko posts the panel. Each ticket opens as a private thread in this channel.',
            '—',
          ],
          ['Title', 'Up to 256 characters.', 'Need a hand?'],
          [
            'Description',
            'What members read before pressing a button, up to 1,000 characters.',
            'Press a button below and a private thread opens…',
          ],
          ['Colour bar', 'The panel embed’s colour.', '#FACC15'],
        ]}
      />
      <h3>Buttons</h3>
      <p>
        1 to 5 buttons. Each is a ticket topic with a label (up to 80
        characters), one of Discord’s four colours (blurple, grey, green or
        red), and the <b>Question Sparko asks first</b> (up to 200 characters).
        It starts with <b>Get help</b> (“What can we help with?”) and{' '}
        <b>Report a member</b> (“Who is it, and what happened? Screenshots help
        a lot.”). Press the buttons in the preview to see each opener.
      </p>
      <h3>Who handles tickets</h3>
      <SettingsTable
        rows={[
          [
            'Staff roles',
            'These roles can see every ticket thread and reply. At least one is needed.',
            '—',
          ],
          [
            'Ping these roles on new tickets',
            'Off means staff check the inbox instead.',
            'On',
          ],
          [
            'One open ticket per member',
            'Stops duplicate tickets about the same thing.',
            'On',
          ],
          [
            'Close automatically when the member stops replying',
            'Never, after 24 hours, after 48 hours or after 7 days of no reply from the member after staff wrote. Sparko warns them 2 hours before closing.',
            'After 48 hours',
          ],
        ]}
      />

      <h2>Inbox tab</h2>
      <p>
        Every ticket, filtered by <b>Needs a reply</b>, <b>Assigned to me</b>,{' '}
        <b>All open</b> and <b>Closed</b>, and searchable by member, a word from
        the topic, or a number like 213. Tickets waiting longest and with the
        highest priority come first.
      </p>
      <Shot
        name="tickets-inbox"
        alt="The Tickets inbox: a list of tickets with status, priority, who is handling each and the last message."
        caption="The inbox, with filters for what needs a reply."
      />
      <TermTable
        head={['Status', 'Means']}
        rows={[
          ['Needs a first reply', 'Nobody from staff has answered yet.'],
          ['In progress', 'Someone is handling it, and the member wrote last.'],
          ['Waiting on member', 'Staff replied last; the member’s turn.'],
          ['Closed', 'Locked, with its transcript kept.'],
        ]}
      />

      <h2>Working a ticket</h2>
      <p>Open a ticket to see the whole thread and the people involved.</p>
      <ul>
        <li>
          <b>Reply</b> to the member: Sparko posts it in the thread. Or switch
          to <b>Note</b>: only staff see notes, and they stay out of the
          member’s transcript. Press <Code>Ctrl Enter</Code> (
          <Code>⌘ Enter</Code> on a Mac) to send.
        </li>
        <li>
          Set the <b>priority</b>: Urgent, High, Normal or Low.
        </li>
        <li>
          <b>Assign</b> it to a teammate, take it over, or set it back to Nobody
          so it shows in Needs a reply for the whole team. The first staff
          member to reply is assigned on their own.
        </li>
        <li>
          <b>Close</b> it with a reason: Solved, Duplicate, No reply from the
          member, Not a support issue, or Something else (explain it). Add a
          note for the transcript, and choose whether to tell the member by DM.
          Staff notes are never shared.
        </li>
        <li>
          <b>Reopen</b> a closed ticket to unlock its thread.
        </li>
        <li>
          Download the <b>transcript</b> as an HTML file with every message.
        </li>
      </ul>
      <Shot
        name="tickets-ticket"
        alt="One ticket: the thread with Sparko’s opener and the member’s message, a reply box, priority, assign and close, and details about the member."
        caption="One ticket: the thread, a reply box, and who’s involved."
      />
      <p>
        Messages written in the thread in Discord show up in the dashboard too,
        so staff can use whichever they like.
      </p>

      <h2>History tab</h2>
      <p>
        Every saved version of your panel. Load one into the editor, check the
        preview, and save to use it again.
      </p>

      <h2>Transcripts and limits</h2>
      <ul>
        <li>Transcripts are kept 7 days on Free and 30 days on Plus.</li>
        <li>Each server’s tickets are numbered from 1.</li>
      </ul>

      <h2>Permissions Sparko needs</h2>
      <p>
        In the panel channel: <b>View Channel</b>, <b>Send Messages</b>,{' '}
        <b>Embed Links</b>, <b>Create Private Threads</b> and{' '}
        <b>Send Messages in Threads</b>. If one is missing, the Tickets page
        says so above the settings, with <b>Show me how</b> and{' '}
        <b>Check again</b>.
      </p>
      <Tip title="Works well with">
        <Link to="/docs/questions">Questions & answers</Link> for public
        questions anyone might have, and{' '}
        <Link to="/docs/studio">Message Studio</Link> for the rest of your
        support channel.
      </Tip>
    </>
  ),
};
