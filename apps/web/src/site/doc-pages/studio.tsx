import { Link } from 'react-router-dom';
import {
  Code,
  LimitTable,
  SettingsTable,
  Shot,
  Steps,
  TermTable,
  Tip,
  type DocPage,
} from './parts';

export const studioDoc: DocPage = {
  id: 'studio',
  group: 'Modules',
  title: 'Message Studio',
  icon: 'message-square-text',
  lede: 'Build Discord messages visually, see them exactly as members will, then post, reuse and edit them. Every other module’s messages are Studio templates too.',
  body: () => (
    <>
      <p>
        Message Studio is where Sparko’s messages are made. You edit right on a
        live preview that looks like Discord, in dark and light, and save the
        result as a <b>template</b>. Post it to a channel, or use it in Welcome,
        Reaction roles, Suggestions, Birthdays and every other module that sends
        a message.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Messages → Message Studio</b>. The <b>Editor</b> tab opens
            with a blank message, or pick one on <b>Templates</b>.
          </>,
          <>
            Choose <b>Embed message</b> or <b>V2 components</b> at the top of
            the preview.
          </>,
          <>
            Click any part of the preview to write in it. Use the <b>+</b>{' '}
            buttons to add embeds, images, buttons, menus and separators.
          </>,
          <>
            Under <b>Message settings</b>, give it a <b>Template name</b> and
            pick where to <b>Post in</b>.
          </>,
          <>
            <b>Save template</b>, then <b>Post test</b> to send it.
          </>,
        ]}
      />
      <Shot
        name="studio-editor"
        alt="The Message Studio editor: a live preview of an event announcement, and the message settings with its channel."
        caption="The editor: the live preview on the left, settings and the channel on the right."
      />

      <h2>Two kinds of message</h2>
      <h3>Embed message</h3>
      <p>
        The classic Discord message: some text, then up to 10 embeds. Each embed
        can have:
      </p>
      <SettingsTable
        noDefault
        rows={[
          ['Author', 'A name, a small picture beside it, and a link.'],
          ['Title', 'Up to 256 characters.'],
          ['Description', 'Up to 4,096 characters, with Discord formatting.'],
          [
            'Colour',
            'The bar down the side. Pick any colour, or shuffle for a random one each time it’s sent.',
          ],
          ['Image and thumbnail', 'Picture links starting with https://.'],
          [
            'Fields',
            'Up to 25, each with a name (256 characters) and value (1,024), side by side or full width.',
          ],
          ['Footer', 'Text and a small picture, and an optional timestamp.'],
        ]}
      />
      <p>
        The message’s own text is up to 2,000 characters. Everything in all its
        embeds together can be up to 6,000 characters.
      </p>
      <h3>V2 components</h3>
      <p>
        Discord’s newer layout: one container with a colour bar, up to 4,000
        characters of text, a thumbnail beside the first part, and a gallery of
        up to 10 images. Write <Code>{'{separator}'}</Code> on its own line, or
        use <b>Add separator</b>, to draw a divider. Buttons, menus and the
        gallery can sit above or below the container, between lines of text, or
        (for a button) beside a line.
      </p>
      <Tip icon="info" title="Switching layouts">
        Switching between Embed and V2 carries your text, pictures and buttons
        across as well as it can, so you can try both.
      </Tip>

      <h2>Buttons and menus</h2>
      <p>
        Up to 5 rows of components under a message. Buttons share a row, up to 5
        each; a menu takes a row of its own.
      </p>
      <SettingsTable
        noDefault
        rows={[
          [
            'Link button',
            'Opens a link starting with https://. Text up to 80 characters and an emoji.',
          ],
          [
            'Action button',
            'Green, blurple, red or grey. Runs its actions, top to bottom, when clicked.',
          ],
          [
            'Menu',
            'A dropdown with 1 to 25 options, each with a title and description (up to 100 characters each), an emoji and its own actions. Placeholder up to 150 characters. Allow picking several if you like.',
          ],
        ]}
      />
      <h3>Actions</h3>
      <TermTable
        head={['Action', 'What it does']}
        rows={[
          [
            'Send message',
            <>
              Sends one or more templates, one after another: in the channel, to
              the clicker’s <b>DMs</b>, or as an <b>ephemeral</b> reply only
              they can see. Free sends 1 template per action; Plus up to 10.
            </>,
          ],
          [
            'Give or take role',
            'Gives the clicker roles, or takes them away. Sparko’s role must be above them.',
          ],
          [
            'Suggestion vote',
            <>
              Upvote, Downvote, Approve or Deny. Only works on a{' '}
              <Link to="/docs/suggestions">suggestion message</Link>. A vote
              goes first; Approve and Deny stand alone.
            </>,
          ],
        ]}
      />
      <p>A button or option can have up to 10 actions.</p>

      <h2>Variables, emoji and JSON</h2>
      <ul>
        <li>
          The <b>Variables</b> button beside the preview lists every{' '}
          <Link to="/docs/variables">variable</Link> you can use, like{' '}
          <Code>{'{user}'}</Code> and <Code>{'{server}'}</Code>.
        </li>
        <li>The emoji picker has every Unicode emoji and your server’s own.</li>
        <li>
          The <b>JSON</b> panel shows exactly what Sparko sends to Discord. Edit
          it, import a file (from another bot’s builder, say), or export it.
        </li>
      </ul>

      <h2>Checks before posting</h2>
      <p>
        Studio checks links, colours, lengths and fields as you go, and warns
        about anything Discord would refuse or a channel Sparko can’t post in.
        The field with the problem is highlighted and the save bar says what’s
        wrong.
      </p>

      <h2>Posting and editing</h2>
      <ul>
        <li>
          <b>Post test</b> sends the saved template to the <b>Post in</b>{' '}
          channel.
        </li>
        <li>
          To change a message that’s already posted, edit the template and post
          again: Sparko edits the same message in Discord, keeping its reactions
          and replies.
        </li>
        <li>
          <b>Edit message</b> turns a message Sparko already sent into a
          template. In Discord, right-click the message, pick{' '}
          <b>Copy Message Link</b>, and paste it. It keeps its place and its
          link.
        </li>
      </ul>

      <h2>Templates tab</h2>
      <p>
        Your saved templates as cards, in folders as deep as you like. Drag
        cards and folders to move them (or use the keyboard). <b>Edit</b>,{' '}
        <b>Clone</b> or <b>Delete</b> a template; rename or delete a folder
        (deleting a folder can take everything in it, after you confirm). Each
        card has a tag showing which module uses it, like Welcome Message,
        Reaction Role, Suggestion or Voice panel. Deleting a template leaves
        messages already posted in Discord.
      </p>
      <Shot
        name="studio-templates"
        alt="The Templates tab: five templates with Edit, Clone and Delete, and a folder."
        caption="Templates, with a folder. Edit opens one in the editor."
      />
      <LimitTable
        rows={[
          ['Templates', '100', '500'],
          ['Folders', '20', '100'],
          ['Templates a Send message action sends', '1', '10'],
        ]}
      />

      <h2>Versions tab</h2>
      <p>
        Every post is kept. <b>Restore</b> loads a version into the template
        that’s open in the editor; nothing changes until you save.
      </p>
      <Shot
        name="studio-versions"
        alt="Message Studio’s Versions tab, with three versions and a Restore button on each."
        caption="Versions: every post is kept, and any of them can be restored."
      />
      <h2>Permissions Sparko needs</h2>
      <p>
        <b>View Channel</b>, <b>Send Messages</b> and <b>Embed Links</b> where
        it posts, and <b>Read Message History</b> to edit a message from its
        link. <b>Manage Roles</b> for buttons that give roles.
      </p>
    </>
  ),
};
