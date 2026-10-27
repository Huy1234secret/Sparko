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

export const questionsDoc: DocPage = {
  id: 'questions',
  group: 'Modules',
  title: 'Questions & answers',
  icon: 'circle-help',
  lede: 'Members ask with a command, Sparko posts each question with its own thread, staff answer in it, and answered threads close on their own.',
  body: () => (
    <>
      <p>
        Questions & answers turns a busy help channel into a tidy list. Every
        question gets its own thread and an <b>Answer</b> button for staff. The
        answer shows on the question itself, so the next person with the same
        question finds it straight away.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Questions & answers</b> and switch it on.
          </>,
          <>
            On <b>Settings</b>, pick the <b>Questions channel</b>. Sparko needs
            to post, open threads and manage threads there.
          </>,
          <>
            Pick <b>Who can answer</b> (your helpers), and a role to ping for
            new questions if you like.
          </>,
          <>
            Add <b>categories</b> such as Roles, Events or Bugs, each with an
            emoji, so members can say what their question is about.
          </>,
          <>
            On <b>Edit</b>, choose how the question, the answer and the DM look.
          </>,
          <>
            Save. Sparko adds <Code>/question</Code> to your server.
          </>,
        ]}
      />
      <Shot
        name="questions-settings"
        alt="The Questions & answers Settings tab: the questions channel, the role to ping, and who can ask and answer."
        caption="Settings: where questions go, and who asks and answers."
      />

      <h2>How a question works</h2>
      <Steps
        items={[
          <>
            A member runs <Code>/question ask</Code>, optionally with a category
            and up to 3 files. A form asks for a <b>title</b> and the{' '}
            <b>details</b>.
          </>,
          <>
            Sparko posts it as <b>Open</b>, opens a thread on it, adds the asker
            to the thread (unless questions are anonymous) and pings your role.
          </>,
          <>
            Under the question are <b>Answer</b> (staff only),{' '}
            <b>Mark answered</b> (the asker and staff) and <b>Me too</b> for
            anyone with the same question.
          </>,
          <>
            Staff press <b>Answer</b> or use <Code>/question answer</Code>. The
            answer (up to 2,000 characters) is posted in the thread, and its
            first 1,000 characters show on the question with who wrote it. The
            button becomes <b>Change answer</b>.
          </>,
          <>
            The question turns <b>Answered</b>, the asker gets a DM, and the
            thread closes now, later or never, as you choose.
          </>,
        ]}
      />
      <TermTable
        head={['Status', 'Means']}
        rows={[
          ['Open', 'Waiting for an answer.'],
          [
            'Answered',
            'Staff answered it, or the asker pressed Mark answered.',
          ],
          [
            'Closed',
            'Staff closed it without an answer; its thread is locked.',
          ],
          ['Expired', 'Nobody answered it in time.'],
          [
            'Deleted in Discord',
            'Its message was deleted in Discord. Shown in Storage only.',
          ],
        ]}
      />

      <h2>Settings tab</h2>
      <h3>Channels and people</h3>
      <SettingsTable
        rows={[
          [
            'Questions channel',
            'Each question is posted here with its own thread. Required.',
            'Your general channel',
          ],
          [
            'Ping a role for new questions',
            'Mentioned in each new question so helpers hear about it. The role has to be mentionable, or Sparko needs Mention @everyone.',
            'Nobody',
          ],
          [
            'Who can ask',
            'Members with any of these roles can ask. Empty means everyone. Up to 25 roles.',
            'Everyone',
          ],
          [
            'Blacklist role',
            'Members with this role can’t ask, whatever other roles they have. It can’t also be a Who can ask role.',
            'None',
          ],
          [
            'Who can answer',
            'Staff who can answer, close, reopen and delete questions. Empty means members with Manage Server.',
            'Manage Server',
          ],
        ]}
      />
      <h3>Asking</h3>
      <SettingsTable
        rows={[
          [
            'Shortest details',
            'Characters the details need once a member writes something. 0 lets any length through.',
            '0',
          ],
          ['Longest details', 'Characters, 100 to 2,000.', '1,000'],
          [
            'Cooldown between questions',
            'How long a member waits before asking again, from 1 minute to 1 month. Empty is no cooldown.',
            'None',
          ],
          [
            'Open questions per member',
            'How many unanswered questions one member can have at once: 1 to 3 on Free, up to 20 on Plus.',
            '3',
          ],
          [
            'Require details',
            'Members have to write more than the title. Off makes the details box optional.',
            'Off',
          ],
          [
            'Anonymous questions',
            'The post doesn’t say who asked, and they aren’t added to the thread. Staff still see the asker in Storage.',
            'Off',
          ],
          [
            '“Me too” button',
            'Members with the same question press it, so staff see what’s asked most.',
            'On',
          ],
        ]}
      />
      <h3>Categories</h3>
      <p>
        Topics members pick when they ask, each with a name (up to 30
        characters) and an emoji. With none, questions show as <b>General</b>.
        Free has 5 categories; Plus has 25.
      </p>
      <h3>Threads and answers</h3>
      <SettingsTable
        rows={[
          [
            'Hide quiet threads after',
            'How long Discord waits before hiding a quiet thread from the channel list: 1 hour, 1 day, 3 days or 1 week.',
            '1 day',
          ],
          [
            'Once a question is answered, its thread',
            <>
              <b>Close now</b>, <b>Close later</b> or <b>Keep open</b>.
            </>,
            'Close later',
          ],
          [
            'Close the thread after',
            'With Close later: how long after the answer, so the asker can still say thanks. 1 minute to 1 month. Sparko checks every minute.',
            '1d',
          ],
          [
            'Expire unanswered questions after',
            'A question nobody answered in this long becomes Expired and its thread closes. 1 hour to 1 year. Empty keeps them open.',
            'Never',
          ],
          [
            'DM the asker when it’s answered',
            'Sends them the answer with a link to the thread. Members who don’t take DMs from the server won’t get it, and the log says so.',
            'On',
          ],
        ]}
      />

      <h2>Edit tab: three messages</h2>
      <TermTable
        head={['Message', 'Defaults to start from']}
        rows={[
          [
            'The question',
            'Question card (an embed with who asked, the status and the category), Compact, or Modern question (Components V2).',
          ],
          [
            'The answer, in the thread',
            'Answer card, or Modern answer (Components V2).',
          ],
          [
            'The DM to the asker',
            'Sparko’s own: “Your question #12 was answered”, with the answer and a link to the thread.',
          ],
        ]}
      />
      <p>
        The Answer, Mark answered and Me too buttons take one of Discord’s five
        rows, so a question message has up to 4 rows of its own buttons and
        menus.
      </p>
      <h3>Variables</h3>
      <p>
        On top of the <Link to="/docs/variables">usual variables</Link>:
      </p>
      <VariableList only="question" />

      <h2>Storage tab</h2>
      <p>
        Every question with its asker, category, status, Me too count and
        answer. Search and filter by status, open one in Discord, or delete it
        with its message, thread and data.
      </p>
      <LimitTable
        rows={[
          ['Storage', '10 MB', '100 MB'],
          ['Questions kept (4 KB each)', '2,560', '25,600'],
          ['Categories', '5', '25'],
          ['Open questions per member, at most', '3', '20'],
        ]}
      />

      <h2>Logs tab</h2>
      <TermTable
        head={['Entry', 'Means']}
        rows={[
          ['ASKED', 'A question was posted.'],
          ['ANSWERED', 'Staff answered it.'],
          ['RE-ANSWERED', 'Staff changed the answer.'],
          ['MARKED ANSWERED', 'The asker or staff pressed Mark answered.'],
          ['CLOSED', 'Staff closed it without answering.'],
          ['REOPENED', 'Staff reopened it so it can be answered again.'],
          ['EXPIRED', 'Nobody answered in time.'],
          ['DELETED', 'It was deleted.'],
          ['REFUSED', 'A member couldn’t ask, and why.'],
          ['FAILED', 'Something couldn’t be done, such as the DM.'],
        ]}
      />

      <h2>Commands</h2>
      <p>
        On the <b>Commands</b> tab, rename <Code>/question</Code> and its
        subcommands, change their descriptions, or turn any off. The name can’t
        clash with another command in your server.
      </p>
      <CommandTable
        names={[
          '/question ask',
          '/question answer',
          '/question close',
          '/question reopen',
          '/question delete',
        ]}
      />
      <h2>Permissions Sparko needs</h2>
      <ul>
        <li>
          <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in
          the questions channel.
        </li>
        <li>
          <b>Create Public Threads</b>, <b>Send Messages in Threads</b> and{' '}
          <b>Manage Threads</b> to open, answer in and close threads.
        </li>
        <li>
          <b>Mention @everyone</b> only if the role you ping isn’t mentionable.
        </li>
      </ul>
      <Tip title="Pair it with Tickets">
        Use Questions for things anyone might wonder about, and{' '}
        <Link to="/docs/tickets">Tickets</Link> for private problems.
      </Tip>
    </>
  ),
};
