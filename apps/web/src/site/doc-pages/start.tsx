import { Link } from 'react-router-dom';
import { legal } from '../../content/legal';
import { periods, planLimits } from '../../content/site';
import {
  Code,
  LimitTable,
  Shot,
  Steps,
  TermTable,
  Tip,
  type DocPage,
} from './parts';

export const startDocs: DocPage[] = [
  {
    id: 'start',
    group: 'Getting started',
    title: 'Get started',
    icon: 'zap',
    lede: 'Add Sparko to your server, sign in to the dashboard and follow the setup checklist. It takes about five minutes.',
    body: () => (
      <>
        <h2>Before you start</h2>
        <ul>
          <li>
            You need the <b>Manage Server</b> permission (or to own the server)
            to add Sparko and manage it.
          </li>
          <li>
            Everything is set up in the dashboard on this site. Members use
            Sparko in Discord with buttons, menus and slash commands.
          </li>
        </ul>
        <h2>1. Add Sparko to your server</h2>
        <p>
          Choose <b>Add to Discord</b> anywhere on this site. Discord asks which
          server to add Sparko to and shows the permissions it needs.
        </p>
        <p>
          Sparko never asks for Administrator. It asks only for what its modules
          use; <Link to="/docs/permissions">Permissions</Link> lists each one
          and why.
        </p>
        <h2>2. Sign in and pick a server</h2>
        <p>
          Choose <b>Sign in with Discord</b>. The dashboard lists every server
          where you have Manage Server: the ones that already have Sparko first,
          then the ones you can add it to.
        </p>
        <Shot
          name="servers"
          wide
          alt="The server picker, with Sparko’s servers and servers you can add it to."
          caption="Pick a server to manage, or add Sparko to another one."
        />
        <h2>3. Follow the setup checklist</h2>
        <p>
          A server’s <b>Overview</b> starts with a short checklist: choose a log
          channel, switch on Auto moderation, write a welcome, give members a
          starter role and post a ticket panel. Every step previews what Sparko
          will post before anything is sent, and you can skip any step and come
          back later.
        </p>
        <Shot
          name="overview"
          alt="A server overview: the setup checklist, health, modules and recent activity."
          caption="The overview: setup checklist, health checks, modules that are on, and recent activity."
        />
        <p>
          Beside the checklist, <b>Health</b> keeps an eye on:
        </p>
        <ul>
          <li>whether Sparko is online, and how fast it’s answering;</li>
          <li>
            any permission Sparko is missing, with a <b>Fix it</b> guide;
          </li>
          <li>whether its slash commands are up to date in Discord;</li>
          <li>how much of your plan’s templates and storage you’ve used.</li>
        </ul>
        <h2>4. Turn on what you need</h2>
        <p>
          Each module has its own page in the dashboard and its own guide here.
          A good first hour for a new community:
        </p>
        <Steps
          items={[
            <>
              <Link to="/docs/welcome">Welcome messages</Link> to greet people,
              and <Link to="/docs/autoroles">Automatic roles</Link> for a
              starter role.
            </>,
            <>
              <Link to="/docs/role-menus">Reaction roles</Link> so members pick
              their own pings, colours or games.
            </>,
            <>
              <Link to="/docs/tickets">Tickets</Link> or{' '}
              <Link to="/docs/questions">Questions & answers</Link> so people
              can get help.
            </>,
            <>
              Then the fun parts:{' '}
              <Link to="/docs/suggestions">Suggestions</Link>,{' '}
              <Link to="/docs/polls">Polls</Link>,{' '}
              <Link to="/docs/events">Events</Link>,{' '}
              <Link to="/docs/starboard">Starboard</Link>,{' '}
              <Link to="/docs/birthdays">Birthdays</Link> and{' '}
              <Link to="/docs/temp-voice">Temporary voice channels</Link>.
            </>,
          ]}
        />
        <Tip title="Where to next">
          Read <Link to="/docs/dashboard">Finding your way around</Link>, then
          pick a module from the menu. Each guide covers setup, every setting,
          the commands and what to check when something doesn’t work.
        </Tip>
      </>
    ),
  },
  {
    id: 'dashboard',
    group: 'Getting started',
    title: 'Finding your way around',
    icon: 'layout-dashboard',
    lede: 'The sidebar, search, and the parts every module page shares.',
    body: () => (
      <>
        <h2>The sidebar</h2>
        <p>
          Modules are grouped the same way everywhere on Sparko: Support,
          Messages, Safety, Community, Engagement, Automation, Insights and
          Server settings. Each group shows how many of its modules are on, and
          a green dot marks every module that’s live. Use the server switcher at
          the top to move between your servers.
        </p>
        <h2>Search and jump</h2>
        <p>
          Press <Code>Ctrl K</Code> (<Code>⌘ K</Code> on a Mac) or use the
          search box at the top to jump to any module or page by name.
        </p>
        <h2>Every module page works the same way</h2>
        <ul>
          <li>
            <b>The header</b> has the module’s on/off switch and an honest
            status: Off, Live, Unsaved changes, Saving…, Applying…, Couldn’t
            apply, or Paused.
          </li>
          <li>
            <b>Tabs</b> split the module into its parts. Most modules have{' '}
            <b>Settings</b>, <b>Edit</b> (its messages), <b>Storage</b> (what it
            keeps), <b>Logs</b> and <b>Commands</b>. The tab you’re on is in the
            address, so you can share a link to it.
          </li>
          <li>
            <b>Live previews</b> show anything Sparko posts exactly as Discord
            will, in dark and light. Click a part of the preview to edit it.
          </li>
          <li>
            <b>(i) tips</b> beside a setting explain it in more detail.
          </li>
          <li>
            <b>The save bar</b> appears at the bottom as soon as you change
            something. See{' '}
            <Link to="/docs/saving">Saving, applying and undoing</Link>.
          </li>
        </ul>
        <Shot
          name="tickets-inbox"
          alt="The Tickets module: the header with its switch and Live status, the tabs, and the inbox."
          caption="A module page: header with its switch and status, then tabs."
        />
        <h2>Tabs you’ll see often</h2>
        <TermTable
          head={['Tab', 'What it’s for']}
          rows={[
            ['Settings', 'Channels, roles, limits and how the module behaves.'],
            [
              'Edit',
              'The module’s messages, as Message Studio templates, with ready-made defaults to start from and a test button.',
            ],
            [
              'Storage',
              'What the module keeps, like suggestions, birthdays or starred messages, with search, and how much of your storage it uses.',
            ],
            [
              'Logs',
              'Everything the module did, newest first, with filters and a reason for anything that failed.',
            ],
            [
              'Commands',
              'Rename the module’s slash commands, change what Discord shows under them, or turn any off.',
            ],
          ]}
        />
        <Tip icon="info" title="Problems show where they happen">
          If Sparko can’t do something, such as post in a channel, the module
          says so above the setting it affects, with <b>Show me how</b> to fix
          it in Discord and <b>Check again</b> once you have.
        </Tip>
      </>
    ),
  },
  {
    id: 'saving',
    group: 'Getting started',
    title: 'Saving, applying and undoing',
    icon: 'save',
    lede: 'What happens when you press Save, how to tell when a change is live, and how to go back.',
    body: () => (
      <>
        <h2>Nothing changes until you save</h2>
        <p>
          Edit as much as you like. The header shows <b>Unsaved changes</b> and
          a bar appears at the bottom with <b>Save changes</b> and{' '}
          <b>Discard</b>. Leaving the page with unsaved changes asks first.
        </p>
        <Shot
          name="welcome-join"
          alt="Welcome messages with unsaved changes: the header says Unsaved changes and the save bar is at the bottom."
          caption="Unsaved changes in the header, and the save bar at the bottom."
        />
        <h2>Checks before saving</h2>
        <p>
          Sparko checks your settings before it saves. If something’s wrong, it
          takes you to the tab and field with the problem, highlights it, and
          says what to change, like “Pick the channel suggestions are posted in”
          or “Sparko can’t give that role.”
        </p>
        <h2>The three stages</h2>
        <Steps
          items={[
            <>
              <b>Saved</b>: your change is stored safely.
            </>,
            <>
              <b>Applying to Discord</b>: Sparko’s bot picks it up and makes it
              happen, such as posting or editing a message, or updating slash
              commands.
            </>,
            <>
              <b>Live</b>: it’s working in your server.
            </>,
          ]}
        />
        <p>
          If the bot can’t apply it, the status turns to <b>Couldn’t apply</b>{' '}
          and says why, for example a missing permission. Your change stays
          saved, and Sparko applies it once the problem is fixed or the bot is
          back online.
        </p>
        <h2>Undoing</h2>
        <ul>
          <li>
            <b>Discard</b> throws away changes you haven’t saved.
          </li>
          <li>
            <b>Versions</b>: Message Studio and Tickets keep every save. Open
            the Versions or History tab and choose <b>Restore</b> on any of
            them.
          </li>
          <li>
            <b>Configuration backups</b> (coming soon) will snapshot your whole
            setup so you can compare and roll back several modules at once.
          </li>
        </ul>
        <Shot
          name="studio-versions"
          alt="Message Studio’s Versions tab, with three versions and a Restore button on each."
          caption="Versions: every publish is kept, and any of them can be restored."
        />
        <h2>Paused servers</h2>
        <p>
          If Sparko staff pause a server, its modules show <b>Paused</b> and
          their settings are locked until it’s lifted. Nothing is lost.
        </p>
      </>
    ),
  },
  {
    id: 'permissions',
    group: 'Getting started',
    title: 'Permissions',
    icon: 'shield-check',
    lede: 'Sparko never asks for Administrator. Here is every permission it uses, which modules need it, and what stops working without it.',
    body: () => (
      <>
        <div className="sp-table-wrap">
          <table className="sp-table sw-doc-table">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                <th scope="col">Used by</th>
                <th scope="col">Without it</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  'View Channels',
                  'Every module',
                  'Sparko can’t see your channels.',
                ],
                [
                  'Send Messages',
                  'Every module that posts',
                  'Sparko can’t post anywhere.',
                ],
                [
                  'Embed Links',
                  'Every module that posts',
                  'Messages with embeds can’t be sent.',
                ],
                [
                  'Read Message History',
                  'Message Studio, Starboard',
                  'Sparko can’t edit a message from its link, or read starred messages.',
                ],
                [
                  'Add Reactions',
                  'Reaction roles, Suggestions',
                  'Sparko can’t add the reactions members press.',
                ],
                [
                  'Manage Roles',
                  'Automatic roles, Reaction roles, Birthdays, Invite tracking, Events, Suggestions, Temporary voice',
                  'Roles can’t be given or taken, and voice rooms can’t be locked or hidden.',
                ],
                [
                  'Manage Server',
                  'Invite tracking',
                  'Sparko can’t see your invites, so it can’t tell who invited whom.',
                ],
                [
                  'Manage Channels',
                  'Temporary voice',
                  'Voice rooms can’t be made, changed or deleted.',
                ],
                [
                  'Move Members',
                  'Temporary voice',
                  'Members can’t be moved into their room or disconnected.',
                ],
                [
                  'Manage Events',
                  'Events & RSVP',
                  'Events can’t be added to Discord’s own Events list.',
                ],
                [
                  'Create Private Threads',
                  'Tickets',
                  'Tickets can’t open private threads.',
                ],
                [
                  'Create Public Threads',
                  'Questions & answers, Suggestions',
                  'Questions can’t get threads, and suggestions can’t get discussion threads.',
                ],
                [
                  'Send Messages in Threads',
                  'Tickets, Questions & answers',
                  'Sparko can’t write in ticket or question threads.',
                ],
                [
                  'Manage Threads',
                  'Questions & answers',
                  'Answered threads can’t be closed or locked.',
                ],
              ].map(([perm, who, without]) => (
                <tr key={perm}>
                  <td data-label="Permission" data-primary="true">
                    <b>{perm}</b>
                  </td>
                  <td data-label="Used by">{who}</td>
                  <td data-label="Without it">{without}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>When one is missing</h2>
        <p>
          The server’s Health card and the affected module both say which
          permission is missing and what it stops. <b>Fix it</b> walks you
          through switching it on in Discord, then <b>Check again</b> confirms
          it worked.
        </p>
        <Shot
          name="permissions-fix"
          wide
          alt="The Fix it guide for Manage Roles: four numbered steps and a Check again button."
          caption="The Fix it guide, step by step."
        />
        <h2>Role order matters</h2>
        <p>
          Discord only lets a bot give roles that sit <b>below its own role</b>.
          If Sparko can’t give a role, drag the Sparko role above it in{' '}
          <b>Server Settings → Roles</b>. Modules that give roles warn you about
          any role Sparko can’t give before you save.
        </p>
        <Tip icon="lock" title="Channel overrides">
          A channel can block Sparko even when the server allows it. If Sparko
          can’t post in one channel, check that channel’s own permissions for
          the Sparko role.
        </Tip>
        <h2>Slash commands</h2>
        <p>
          Sparko adds each module’s commands to your server when you save. If
          they don’t show up in Discord, re-invite Sparko with the{' '}
          <b>applications.commands</b> permission, then save the module again.
        </p>
      </>
    ),
  },
  {
    id: 'access',
    group: 'Getting started',
    title: 'Who can manage Sparko',
    icon: 'users',
    lede: 'Who sees a server in the dashboard, and how to share parts of it with your team.',
    body: () => (
      <>
        <p>
          Server owners and members with <b>Manage Server</b> can manage
          everything. They see the server in the dashboard as soon as they sign
          in.
        </p>
        <p>
          <b>Dashboard access</b> (coming soon) will let you give other roles
          specific modules, like Tickets for your support team, without giving
          them the rest of the dashboard.
        </p>
        <h2>Staff roles in Discord</h2>
        <p>
          Many modules let you pick staff roles that can do things in Discord
          without the dashboard. Left empty, most fall back to members with
          Manage Server.
        </p>
        <TermTable
          head={['Module', 'Staff can']}
          rows={[
            ['Tickets', 'See every ticket thread and reply.'],
            ['Suggestions', 'Approve, deny, set statuses and delete.'],
            [
              'Questions & answers',
              'Answer, close, reopen and delete questions.',
            ],
            ['Starboard', 'Freeze and block (Manage Messages when empty).'],
            ['Polls', 'Make, end and reroll any poll.'],
            ['Events & RSVP', 'Create, cancel and send reminders.'],
            ['Birthdays', 'Set and remove anyone’s birthday.'],
            ['Invite tracking', 'Give bonus invites and reset counts.'],
          ]}
        />
        <Tip icon="scroll-text" title="Every change is recorded">
          The audit log shows who changed what in the dashboard, and when.
        </Tip>
      </>
    ),
  },
  {
    id: 'plans',
    group: 'Getting started',
    title: 'Free and Plus',
    icon: 'crown',
    lede: 'Every module except multi-server tools is free. Plus raises the limits for busy servers.',
    body: () => (
      <>
        <LimitTable rows={planLimits} />
        <h2>Module limits</h2>
        <p>Where a module’s limits differ between plans:</p>
        <LimitTable
          rows={[
            ['Message Studio templates', '100', '500'],
            ['Message Studio folders', '20', '100'],
            ['Templates one Send message action sends', '1', '10'],
            ['Image studio images', '25', '200'],
            ['Reaction role messages', '10', '50'],
            ['Automatic roles: join roles', '5', '10'],
            ['Automatic roles: timed roles', '3', '10'],
            ['Automatic roles: rules', '10', '25'],
            ['Suggestions: statuses', '6', '20'],
            ['Questions: categories', '5', '25'],
            ['Questions: open per member, at most', '3', '20'],
            ['Starboard: boards', '1', '5'],
            ['Polls: options per poll', '5', '25'],
            ['Polls: running or scheduled at once', '3', '50'],
            ['Events: upcoming at once', '5', '100'],
            ['Events: reminders per event', '2', '5'],
            ['Invite tracking: reward roles', '3', '25'],
            ['Temporary voice: hubs', '1', '10'],
            [
              'Storage for suggestions, questions and starboard',
              '10 MB',
              '100 MB',
            ],
            ['Ticket transcripts kept', '7 days', '30 days'],
          ]}
        />
        <h2>Prices</h2>
        <ul>
          {Object.values(periods).map((p) => (
            <li key={p.label}>
              <b>{p.label}</b>: {p.price} {p.unit}. {p.note}
            </li>
          ))}
        </ul>
        <p>
          Plus is paid through PayPal, and you can cancel or change the period
          any time. See <Link to="/pricing">Pricing</Link> to compare plans.
        </p>
      </>
    ),
  },
  {
    id: 'data',
    group: 'Getting started',
    title: 'Your data',
    icon: 'lock',
    lede: 'What Sparko keeps, and when it’s deleted.',
    body: () => (
      <>
        <p>
          The <Link to="/privacy">Privacy Policy</Link> explains everything
          Sparko stores and for how long. In short:
        </p>
        <ul>
          <li>
            Sparko stores your modules’ settings, the logs they keep and the
            data they need to work, such as when members joined for timed roles,
            saved birthdays, or who voted on a suggestion.
          </li>
          <li>
            Ticket transcripts are kept 7 days on Free and 30 days on Plus.
          </li>
          <li>
            When Sparko is removed from a server, that server’s data is deleted{' '}
            {legal.removalGraceDays} days later, in case it was a mistake.
          </li>
          <li>
            Staff can delete what a module keeps from its Storage tab: a
            suggestion, a question, a starred message, a birthday, or a member’s
            saved data in Automatic roles and Temporary voice.
          </li>
          <li>
            Some modules can forget members who leave, like Birthdays’ Forget
            members who leave.
          </li>
        </ul>
      </>
    ),
  },
];
