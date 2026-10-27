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

export const welcomeDoc: DocPage = {
  id: 'welcome',
  group: 'Modules',
  title: 'Welcome messages',
  icon: 'user-plus',
  lede: 'Greet members when they join, say goodbye when they leave, and thank them for boosting, in a channel, by DM, or both.',
  body: () => (
    <>
      <p>
        Welcome messages has three messages: <b>Join</b>, <b>Leave</b> and{' '}
        <b>Boost</b>. Each one is a Message Studio template you edit right here
        with a live preview of a sample member, and each has its own channel, DM
        and timing.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Welcome messages</b> and switch it on at the top
            right.
          </>,
          <>
            On <b>Join message</b>, pick a <b>Message template</b>: start from a
            default like Welcome card, or <b>Create your own</b>.
          </>,
          <>
            Pick the <b>Channel</b>, and whether to <b>DM the member</b> too.
          </>,
          <>
            Write the message in the preview. Use{' '}
            <Link to="/docs/variables">variables</Link> like{' '}
            <Code>{'{user}'}</Code> and <Code>{'{server.members}'}</Code>.
          </>,
          <>
            Do the same on <b>Leave message</b> and <b>Boost message</b> if you
            want them, then save.
          </>,
        ]}
      />
      <Shot
        name="welcome-join"
        alt="The Join message tab: a live preview of the welcome embed, and settings for the template, channel and DM."
        caption="The Join message: live preview on the left, where and how it’s sent on the right."
      />

      <h2>Settings for each message</h2>
      <SettingsTable
        rows={[
          [
            'Message template',
            'The Message Studio template sent. Editing it here changes the template everywhere it’s used.',
            '—',
          ],
          [
            'Channel',
            <>
              Where it’s posted. Pick <b>No sending in a channel</b> to only DM.
            </>,
            'Your general channel',
          ],
          [
            'DM the member',
            <>
              <b>No DM user</b>, <b>Same template sent in channel</b>, or any
              other template. Members who don’t take DMs from the server won’t
              get it, and the log says so.
            </>,
            'No DM user',
          ],
          [
            'Mention user',
            <>
              On: <Code>{'{user}'}</Code> notifies them. Off: the mention shows,
              but nobody is notified.
            </>,
            'On for Join and Boost, off for Leave',
          ],
          [
            'Delete the channel message',
            'After 30 seconds, 1 minute, 5 minutes or 1 hour, or keep it. DMs are never deleted.',
            'Keep it',
          ],
        ]}
      />
      <h3>Join only</h3>
      <SettingsTable
        rows={[
          [
            'Welcome again if they rejoin',
            'Off means someone who leaves and comes back isn’t greeted twice.',
            'Off',
          ],
          [
            'Wait until they accept the rules',
            'For servers with Rules Screening: they’re welcomed once they agree.',
            'Off',
          ],
        ]}
      />
      <p>
        Above the preview, <b>Message to preview</b> switches between the
        channel message and the DM.
      </p>

      <h2>Default templates</h2>
      <TermTable
        head={['Message', 'Defaults to start from']}
        rows={[
          [
            'Join',
            'Welcome card (their picture and the member count), Modern welcome (Components V2), Short and sweet (one line), Squad up (for gaming servers).',
          ],
          ['Leave', 'Goodbye card, Modern goodbye, Short goodbye.'],
          [
            'Boost',
            'Thank-you card (with the server’s new totals), Modern thank-you in boost pink, Short thank-you.',
          ],
        ]}
      />
      <p>
        Picking a default adds it to your Message Studio templates and uses it
        here.
      </p>
      <Tip title="Useful variables here">
        <Code>{'{user}'}</Code>, <Code>{'{user.name}'}</Code>,{' '}
        <Code>{'{user.avatar}'}</Code>, <Code>{'{server}'}</Code>,{' '}
        <Code>{'{server.members}'}</Code> (great for “You’re member #8,214”),{' '}
        <Code>{'{user.created}'}</Code>, and for boosts{' '}
        <Code>{'{server.boosts}'}</Code> and <Code>{'{server.level}'}</Code>.
      </Tip>

      <h2>Logs tab</h2>
      <p>
        Every welcome, goodbye and thank-you, tagged <b>[WM]</b>, <b>[LM]</b>{' '}
        and <b>[BM]</b>, and whether it went out. If one failed, it says why,
        such as a member who doesn’t accept DMs or a channel Sparko can’t post
        in. Filter by kind.
      </p>
      <Shot
        name="welcome-logs"
        alt="The Logs tab: sent and failed welcome messages, with a reason for each failure."
        caption="Logs, filterable by Welcome, Leave and Boost messages."
      />
      <h2>Permissions Sparko needs</h2>
      <p>
        <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> in each
        channel it posts in.
      </p>
      <Tip icon="info" title="Pair it with">
        <Link to="/docs/autoroles">Automatic roles</Link> to give a starter role
        on join, and <Link to="/docs/invites">Invite tracking</Link> to say who
        invited them.
      </Tip>
    </>
  ),
};
