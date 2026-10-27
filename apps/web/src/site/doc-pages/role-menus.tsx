import { Link } from 'react-router-dom';
import {
  LimitTable,
  SettingsTable,
  Shot,
  Steps,
  TermTable,
  Tip,
  VariableList,
  type DocPage,
} from './parts';

export const roleMenusDoc: DocPage = {
  id: 'role-menus',
  group: 'Modules',
  title: 'Reaction roles',
  icon: 'smile',
  lede: 'Let members give themselves roles with reactions, buttons or a dropdown menu, for colours, pings, games, pronouns or verification.',
  body: () => (
    <>
      <p>
        A reaction role is a message, made in Message Studio, with reactions,
        buttons or a menu under it. Each one gives a role. Members pick what
        they want; Sparko gives or takes the roles and, if you like, tells them
        what changed.
      </p>
      <h2>Set it up</h2>
      <Steps
        items={[
          <>
            Open <b>Community → Reaction roles</b> and press{' '}
            <b>+ Reaction role</b>, or start from a ready-made one.
          </>,
          <>
            Under <b>Settings</b>, give it a <b>Template name</b> and pick the{' '}
            <b>Destination channel</b>.
          </>,
          <>
            Choose how members pick: <b>Reactions</b>, <b>Buttons</b> or a{' '}
            <b>Menu</b>, and add one item per role.
          </>,
          <>
            Pick <b>How roles are given</b> and any limits.
          </>,
          <>
            Write the message above them in the preview, then save. Sparko posts
            it.
          </>,
        ]}
      />
      <Shot
        name="rr-templates"
        alt="Reaction roles with no reaction roles yet, and a button to make one from a template."
        caption="Start from a template. Free keeps 10 reaction role messages; Plus keeps 50."
      />

      <h2>Ways to pick</h2>
      <TermTable
        head={['Kind', 'Each item has']}
        rows={[
          [
            'Reactions (up to 20)',
            'An emoji, all different, and the role it gives. Sparko adds the reactions itself.',
          ],
          [
            'Buttons (up to 25)',
            'A name (up to 80 characters) and/or an emoji, a colour (blurple, grey, green or red), and the role.',
          ],
          [
            'Menu (up to 20 options)',
            'A title and a description (up to 100 characters each), an emoji, and the role. The menu’s text before anything is picked is yours too.',
          ],
        ]}
      />
      <p>
        Click any item to set a <b>Required role</b> (only members with it can
        use the item) or a <b>Blacklisted role</b> (members with it can’t). Drag
        items to reorder them.
      </p>

      <h2>How roles are given</h2>
      <TermTable
        head={['Mode', 'What it does']}
        rows={[
          ['Normal', 'Pick to get the role, pick again to remove it.'],
          [
            'One at a time',
            'Only one role from this message at a time. Picking another swaps it.',
          ],
          ['Add only', 'Roles can’t be removed here. Good for verification.'],
          [
            'Remove only',
            'Picking takes the role away, like leaving a ping role.',
          ],
        ]}
      />
      <SettingsTable
        rows={[
          [
            'Max picks per member',
            'The most roles from this message one member can hold. 0 means no limit.',
            '0',
          ],
          [
            'Min picks per member',
            'Menus only: the fewest options a member must pick. 0 means none needed.',
            '0',
          ],
          [
            'Menu text',
            'What the menu says before anything is picked.',
            'Pick your roles',
          ],
        ]}
      />

      <h2>Responses</h2>
      <p>
        Turn on a response to tell members what changed. Pick where it goes:{' '}
        <b>Send in channel</b> (with buttons and menus, a reply only they can
        see), <b>DM the member</b>, or both. The <b>Claim message</b> is sent
        when a role is given, and the <b>Remove message</b> when one is taken.
        Use Sparko’s own (“Added @Role”) or any template.
      </p>
      <VariableList only="role" />
      <p>
        See <Link to="/docs/variables">Message variables</Link> for the rest.
      </p>

      <h2>Templates and Logs tabs</h2>
      <ul>
        <li>
          <b>Templates</b> lists your reaction role messages. Open, copy or
          delete one. Deleting removes its message from Discord, so nobody can
          pick its roles; its message template stays in Message Studio.
        </li>
        <li>
          <b>Logs</b> shows every role added and removed, and every problem,
          with filters for <b>Added</b>, <b>Removed</b> and <b>Problems</b>.
        </li>
      </ul>
      <LimitTable rows={[['Reaction role messages', '10', '50']]} />

      <h2>Permissions Sparko needs</h2>
      <ul>
        <li>
          <b>Manage Roles</b>, with Sparko’s role <b>above</b> every role it
          gives. Sparko warns you before saving about any role it can’t give.
        </li>
        <li>
          <b>View Channel</b>, <b>Send Messages</b>, <b>Embed Links</b> and{' '}
          <b>Add Reactions</b> in the destination channel.
        </li>
      </ul>
      <Tip icon="refresh-cw" title="Kept in sync">
        Saving posts the message, or edits the one that’s already there.
        Reactions Sparko no longer needs are removed. Deleting a reaction role
        deletes its message from Discord too.
      </Tip>
      <Tip title="Ideas">
        Colour roles with One at a time, ping roles with Normal, and a “✅ I
        read the rules” button with Add only, together with{' '}
        <Link to="/docs/autoroles">Automatic roles</Link>.
      </Tip>
    </>
  ),
};
