import { type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Icon } from '../ui';
import { legal } from '../content/legal';
import { commands } from '../content/commands';
import { featureDetails, isReady } from '../content/features';
import { groupMeta, groups, modules } from '../content/modules';
import { periods, planLimits } from '../content/site';
import { studioVariables } from '../data/studio-format';
import { NotFoundPage } from './InfoPages';
import { usePageTitle } from './SiteLayout';

/** A dashboard screenshot, in whichever theme the visitor is using. */
function Shot({
  name,
  alt,
  caption,
  wide,
}: {
  name: string;
  alt: string;
  caption?: ReactNode;
  /** Whole-window shots are 1200×750; the rest are the main area. */
  wide?: boolean;
}) {
  const [width, height] = wide ? [1200, 750] : [1176, 869];
  return (
    <figure className="sw-shot">
      <img
        className="sw-shot__img sw-shot__img--dark"
        src={`/docs/${name}-dark.webp`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
      <img
        className="sw-shot__img sw-shot__img--light"
        src={`/docs/${name}-light.webp`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Tip({
  icon = 'sparkles',
  title = 'Tip',
  children,
}: {
  icon?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="sw-tip">
      <Icon name={icon} />
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
    </aside>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="sp-mono">{children}</code>
);

/** Every command a module uses, as a small table. */
function CommandTable({ names }: { names: string[] }) {
  const rows = commands.filter((c) => names.includes(c.name));
  return (
    <div className="sp-table-wrap">
      <table className="sp-table">
        <thead>
          <tr>
            <th scope="col">Command</th>
            <th scope="col">What it does</th>
            <th scope="col">Who can use it</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name}>
              <td data-label="Command" data-primary="true">
                <Code>{c.name}</Code>
              </td>
              <td data-label="What it does">{c.description}</td>
              <td data-label="Who">{c.who}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "To set it up" steps for a finished module, from the features content. */
function SetupSteps({ id }: { id: string }) {
  return (
    <ol className="sw-doc-steps">
      {featureDetails[id]?.steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

type DocPage = {
  id: string;
  group: 'Getting started' | 'Modules' | 'Reference';
  title: string;
  icon: string;
  lede: string;
  body: () => ReactNode;
};

const pages: DocPage[] = [
  {
    id: 'start',
    group: 'Getting started',
    title: 'Get started',
    icon: 'zap',
    lede: 'Add Sparko to your server, sign in to the dashboard and follow the setup checklist. It takes about five minutes.',
    body: () => (
      <>
        <h2>1. Add Sparko to your server</h2>
        <p>
          Choose <b>Add to Discord</b> anywhere on this site. Discord asks which
          server to add Sparko to and shows the permissions it needs. You need
          the <b>Manage Server</b> permission in that server.
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
        <Tip title="Where to next">
          Read <Link to="/docs/dashboard">Finding your way around</Link>, then
          pick a module from the menu on the left. Each one has its own guide.
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
          a green dot marks every module that’s live.
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
            <b>Tabs</b> split the module into its parts, such as Settings, Inbox
            and History for Tickets, or Triggers, Logs and Storage for Automatic
            roles.
          </li>
          <li>
            <b>Live previews</b> show anything Sparko posts exactly as Discord
            will, in dark and light.
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
          <b>Discard</b>.
        </p>
        <Shot
          name="welcome-join"
          alt="Welcome messages with unsaved changes: the header says Unsaved changes and the save bar is at the bottom."
          caption="Unsaved changes in the header, and the save bar at the bottom."
        />
        <h2>The three stages</h2>
        <ol className="sw-doc-steps">
          <li>
            <b>Saved</b>: your change is stored safely.
          </li>
          <li>
            <b>Applying to Discord</b>: Sparko’s bot picks it up and makes it
            happen, such as posting or editing a message.
          </li>
          <li>
            <b>Live</b>: it’s working in your server.
          </li>
        </ol>
        <p>
          If the bot can’t apply it, the status turns to <b>Couldn’t apply</b>{' '}
          and says why, for example a missing permission. Your change stays
          saved, and Sparko applies it once the problem is fixed or the bot is
          back online.
        </p>
        <h2>Undoing</h2>
        <ul>
          <li>
            <b>Versions</b>: modules that post messages keep every save. Open
            the History or Versions tab and choose <b>Restore</b> on any of
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
      </>
    ),
  },
  {
    id: 'permissions',
    group: 'Getting started',
    title: 'Permissions',
    icon: 'shield-check',
    lede: 'Sparko never asks for Administrator. Here is every permission it uses, and what stops working without it.',
    body: () => (
      <>
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                <th scope="col">Without it</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['View Channels', 'Sparko can’t see your channels.'],
                ['Send Messages', 'Sparko can’t post anywhere.'],
                ['Embed Links', 'Messages with embeds can’t be sent.'],
                [
                  'Manage Roles',
                  'Automatic roles and Reward roles can’t give roles.',
                ],
                [
                  'Create Private Threads',
                  'Tickets can’t open private threads.',
                ],
              ].map(([perm, without]) => (
                <tr key={perm}>
                  <td data-label="Permission" data-primary="true">
                    <b>{perm}</b>
                  </td>
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
        <p>
          Ticket staff are chosen in Tickets itself: members with a staff role
          can claim, answer and close tickets in Discord, whether or not they
          use the dashboard.
        </p>
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
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">What you get</th>
                <th scope="col">Free</th>
                <th scope="col">Plus</th>
              </tr>
            </thead>
            <tbody>
              {planLimits.map(([what, free, plus]) => (
                <tr key={what}>
                  <td data-label="Feature" data-primary="true">
                    {what}
                  </td>
                  <td data-label="Free">{free}</td>
                  <td data-label="Plus">{plus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            data they need to work, such as when members joined for timed roles.
          </li>
          <li>
            Ticket transcripts are kept 7 days on Free and 30 days on Plus.
          </li>
          <li>
            When Sparko is removed from a server, that server’s data is deleted{' '}
            {legal.removalGraceDays} days later, in case it was a mistake.
          </li>
          <li>
            In Automatic roles, staff can look up a member’s saved data and wipe
            it.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'tickets',
    group: 'Modules',
    title: 'Tickets',
    icon: 'ticket',
    lede: 'Private help threads between members and your staff, with an inbox, claiming, priority and transcripts.',
    body: () => (
      <>
        <h2>Set it up</h2>
        <SetupSteps id="tickets" />
        <h2>The ticket panel</h2>
        <p>
          The panel is the message members use to open a ticket. In the{' '}
          <b>Settings</b> tab you choose its channel, title, description and
          colour, and up to <b>5 buttons</b>. Each button has its own label,
          colour and opening question, so “Report a member” and “Access &amp;
          roles” can ask different things.
        </p>
        <Shot
          name="tickets-settings"
          alt="Ticket settings: the panel’s channel, title and description, with a live preview of the panel and of a ticket’s opener."
          caption="Settings: the panel on the left, and a live preview of the panel and the opener on the right."
        />
        <p>
          Also in Settings: which roles are <b>ticket staff</b>, and{' '}
          <b>auto-close</b> for quiet tickets after 24 hours, 48 hours or 7 days
          (or never).
        </p>
        <h2>The inbox</h2>
        <p>
          The <b>Inbox</b> tab sorts tickets into <b>Needs a reply</b>,{' '}
          <b>Assigned to me</b>, <b>All open</b> and <b>Closed</b>, with search
          by member, topic or ticket number. Members who have waited over an
          hour, and higher priorities, come first.
        </p>
        <h2>Working a ticket</h2>
        <p>Open a ticket to see the whole thread and the people involved.</p>
        <ul>
          <li>Reply to the member, or add a staff note only staff can see.</li>
          <li>Set the priority: Urgent, High, Normal or Low.</li>
          <li>Assign it to someone, or take it over yourself.</li>
          <li>Close it with a reason. Closed tickets can be reopened.</li>
        </ul>
        <Shot
          name="tickets-ticket"
          alt="One ticket: the thread with Sparko’s opener and the member’s message, a reply box, priority, assign and close, and details about the member."
          caption="One ticket: the thread, a reply box, and who’s involved."
        />
        <h2>Commands</h2>
        <CommandTable
          names={['/ticket open', '/ticket claim', '/ticket close']}
        />
        <Tip>
          Sparko opens each ticket as a private thread, so it needs the Create
          Private Threads permission in the panel’s channel.
        </Tip>
      </>
    ),
  },
  {
    id: 'studio',
    group: 'Modules',
    title: 'Message Studio',
    icon: 'message-square-text',
    lede: 'Build Discord messages visually, see them exactly as members will, then publish, reuse and edit them.',
    body: () => (
      <>
        <h2>Set it up</h2>
        <SetupSteps id="studio" />
        <h2>Building a message</h2>
        <p>A message can have any of these:</p>
        <ul>
          <li>
            <b>Text</b>, with Discord formatting, mentions and emoji.
          </li>
          <li>
            <b>Embeds</b>: author, title, description, colour, image, thumbnail,
            footer, timestamp and up to 25 fields. Everything in an embed
            together can be up to 6,000 characters.
          </li>
          <li>
            <b>Components V2</b> containers, with sections, galleries and
            separators.
          </li>
          <li>
            <b>Buttons</b>: up to 5 link buttons.
          </li>
        </ul>
        <Shot
          name="studio-editor"
          alt="The Message Studio editor: a live preview of an event announcement, and the message settings with its channel."
          caption="The editor: the live preview on the left, settings and the channel on the right."
        />
        <p>
          Before publishing, Studio checks links, colours and fields, and warns
          about anything Discord would refuse, or a channel Sparko can’t post
          in.
        </p>
        <h2>Templates and folders</h2>
        <p>
          Save a message as a template to use it again in Welcome, Tickets and
          Reaction roles. Templates can be cloned, deleted and kept in folders.
          Free includes 10 templates; Plus includes 100.
        </p>
        <Shot
          name="studio-templates"
          alt="The Templates tab: five templates with Edit, Clone and Delete, and a folder."
          caption="Templates, with a folder. Edit opens one in the editor."
        />
        <h2>Publishing and editing</h2>
        <p>
          Publish to any channel Sparko can post in. To change a message that’s
          already posted, edit it and publish again: Sparko updates the same
          message in Discord, keeping its reactions and replies. Every publish
          is kept under <b>Versions</b>.
        </p>
        <Tip>
          Use <Link to="/docs/variables">variables</Link> like{' '}
          <Code>{'{user}'}</Code> and <Code>{'{server}'}</Code> to make one
          template feel personal for everyone.
        </Tip>
      </>
    ),
  },
  {
    id: 'welcome',
    group: 'Modules',
    title: 'Welcome messages',
    icon: 'user-plus',
    lede: 'Greet members when they join, say goodbye when they leave, and thank them for boosting.',
    body: () => (
      <>
        <h2>Set it up</h2>
        <SetupSteps id="welcome" />
        <h2>Three kinds of message</h2>
        <p>
          The <b>Join</b>, <b>Leave</b> and <b>Boost</b> tabs each have their
          own message and settings. Each message is a template from Message
          Studio, edited right here with a live preview using a sample member.
        </p>
        <Shot
          name="welcome-join"
          alt="The Join message tab: a live preview of the welcome embed, and settings for the template, channel and DM."
          caption="The Join message: live preview on the left, where and how it’s sent on the right."
        />
        <h2>Where it goes</h2>
        <ul>
          <li>
            <b>Channel</b>: post in a channel everyone sees.
          </li>
          <li>
            <b>DM the member</b>: send it privately, as well as or instead of
            the channel.
          </li>
          <li>
            <b>Delete the channel message</b> after 30 seconds, a minute, 5
            minutes or an hour, or keep it.
          </li>
        </ul>
        <h2>Settings worth knowing</h2>
        <ul>
          <li>
            <b>Welcome again if they rejoin</b>: off means nobody is greeted
            twice.
          </li>
          <li>
            <b>Wait until they accept the rules</b>: for servers with Rules
            Screening, members are welcomed once they agree.
          </li>
          <li>
            <b>Mention user</b>: on, <Code>{'{user}'}</Code> notifies them; off,
            the mention shows but nobody is pinged.
          </li>
        </ul>
        <h2>Logs</h2>
        <p>
          The <b>Logs</b> tab lists every welcome, goodbye and thank-you, and
          whether it went out. If one failed, it says why, such as a member who
          doesn’t accept DMs.
        </p>
        <Shot
          name="welcome-logs"
          alt="The Logs tab: sent and failed welcome messages, with a reason for each failure."
          caption="Logs, filterable by Welcome, Leave and Boost messages."
        />
      </>
    ),
  },
  {
    id: 'role-menus',
    group: 'Modules',
    title: 'Reaction roles',
    icon: 'smile',
    lede: 'Let members give themselves roles with reactions, buttons or a dropdown menu.',
    body: () => (
      <>
        <h2>Set it up</h2>
        <SetupSteps id="role-menus" />
        <Shot
          name="rr-templates"
          alt="Reaction roles with no reaction roles yet, and a button to make one from a template."
          caption="Start from a template. Free keeps 10 reaction role messages; Plus keeps 50."
        />
        <h2>Ways to pick</h2>
        <ul>
          <li>
            <b>Reactions</b>: members react with an emoji. Up to 20 per message.
          </li>
          <li>
            <b>Buttons</b>: in Discord’s four colours. Up to 25 per message.
          </li>
          <li>
            <b>Menu</b>: a dropdown with up to 20 options, each with an emoji
            and a description.
          </li>
        </ul>
        <h2>How roles are given</h2>
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Mode</th>
                <th scope="col">What it does</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Normal', 'Pick to get the role, pick again to remove it.'],
                [
                  'One at a time',
                  'Only one role from this message at a time. Picking another swaps it.',
                ],
                [
                  'Add only',
                  'Roles can’t be removed here. Good for verification.',
                ],
                [
                  'Remove only',
                  'Picking takes the role away, like leaving a ping role.',
                ],
              ].map(([mode, what]) => (
                <tr key={mode}>
                  <td data-label="Mode" data-primary="true">
                    <b>{mode}</b>
                  </td>
                  <td data-label="What it does">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          You can also set the most and fewest roles a member can hold from one
          message (0 means no limit).
        </p>
        <h2>Responses</h2>
        <p>
          Optionally send a message when someone claims or removes a role, from
          a template, in the channel or privately. Role responses can use{' '}
          <Code>{'{role}'}</Code>.
        </p>
        <Tip icon="refresh-cw" title="Kept in sync">
          Saving posts the message, or edits the one that’s already there.
          Deleting a reaction role deletes its message from Discord too.
        </Tip>
      </>
    ),
  },
  {
    id: 'autoroles',
    group: 'Modules',
    title: 'Automatic roles',
    icon: 'users',
    lede: 'Give roles when members join, once they’ve stayed a while, or when they meet your rules.',
    body: () => (
      <>
        <h2>Set it up</h2>
        <SetupSteps id="autoroles" />
        <h2>Triggers</h2>
        <Shot
          name="autoroles-triggers"
          alt="The Triggers tab: join roles before and after verification, and two timed roles."
          caption="Triggers: join roles, timed roles and rules."
        />
        <h3>Join roles</h3>
        <p>
          Roles given the moment someone joins (<b>Before verified</b>), or once
          they accept your rules (<b>After verified</b>) on servers with Rules
          Screening.
        </p>
        <h3>Timed roles</h3>
        <p>
          A role given once someone has been in the server long enough. Type the
          time like <Code>30m</Code>, <Code>12h</Code>, <Code>7d</Code> or{' '}
          <Code>2w</Code>, from 1 minute up to 2 years. Choose whether time
          restarts or carries over if they leave and come back, and whether
          timed roles stack or replace each other.
        </p>
        <h3>Rules</h3>
        <p>
          Combine account age, Discord badges and boosting with <b>AND</b> or{' '}
          <b>OR</b>. Sparko can take the role back when someone no longer
          qualifies, and forget their data when they leave.
        </p>
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Limit</th>
                <th scope="col">Free</th>
                <th scope="col">Plus</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Join roles', '5', '10'],
                ['Timed roles', '3', '10'],
                ['Rules', '10', '25'],
                ['Conditions per rule', '10', '10'],
              ].map(([what, free, plus]) => (
                <tr key={what}>
                  <td data-label="Limit" data-primary="true">
                    {what}
                  </td>
                  <td data-label="Free">{free}</td>
                  <td data-label="Plus">{plus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>Logs</h2>
        <p>
          Every role met, lost, added or failed, and every change to a member’s
          saved data, with filters.
        </p>
        <Shot
          name="autoroles-logs"
          alt="The Logs tab: MET, ADDED, DATA SAVED and LOST entries."
          caption="Logs: MET, LOST, ADDED, DATA SAVED, DATA REMOVED and FAILED."
        />
        <h2>Storage</h2>
        <p>
          Search a member by username or ID to see what Sparko remembers about
          them: their time in the server and the boosts it has counted. You can
          edit either, or wipe their data.
        </p>
        <Shot
          name="autoroles-storage"
          alt="The Storage tab with a member search box."
          caption="Storage: look up and edit a member’s saved data."
        />
        <Tip>
          Sparko records your current members when you save, then checks
          everyone once a minute, so timed roles land on time.
        </Tip>
      </>
    ),
  },
  {
    id: 'levels',
    group: 'Modules',
    title: 'Levels & XP',
    icon: 'trending-up',
    lede: 'Members earn XP for chatting and time in voice, climb levels, get reward roles, race to claim XP crates and show off their rank card.',
    body: () => (
      <>
        <p>
          Levels & XP rewards the people who keep your server alive. Every
          message and every minute in voice earns XP, XP adds up to levels by an
          equation you control, and levels unlock roles. On top of that, XP
          crates drop in chat now and then for members to race for, and{' '}
          <Code>/rank</Code> shows each member a picture of their progress.
        </p>
        <h2>Set it up in five minutes</h2>
        <ol className="sw-doc-steps">
          <li>
            <span>
              Open your server in the dashboard, go to <b>Engagement</b> and
              pick <b>Levels & XP</b>. Switch it on at the top right.
            </span>
          </li>
          <li>
            <span>
              On <b>Settings</b>, check the XP each message and each minute in
              voice gives. Sparko’s defaults (15 to 25 XP a message, once a
              minute, and 5 XP a minute in voice) suit most servers.
            </span>
          </li>
          <li>
            <span>
              Leave the XP equation as it is to start, or write your own. Hover
              the chart to see what any level needs.
            </span>
          </li>
          <li>
            <span>
              Add <b>No-XP channels</b> such as bot commands or spam, so XP
              can’t be farmed there.
            </span>
          </li>
          <li>
            <span>
              On <b>Level-up</b>, pick where level-ups are announced: where the
              member chatted, one channel, a DM, or nowhere.
            </span>
          </li>
          <li>
            <span>
              On <b>Reward roles</b>, add a role for a few milestones, like
              Regular at level 10. Drag Sparko’s role above them in your server
              settings so it can give them.
            </span>
          </li>
          <li>
            <span>
              Optionally, on <b>XP crates</b>, add a crate and switch crates on.
            </span>
          </li>
          <li>
            <span>
              Press <b>Save</b>. Sparko registers <Code>/rank</Code>,{' '}
              <Code>/leaderboard</Code> and <Code>/xp</Code> in your server
              within a few seconds.
            </span>
          </li>
        </ol>
        <Tip title="Permissions Sparko needs">
          Send Messages, Embed Links and View Channel where it posts level-ups
          and crates, and Manage Roles, with its role above every reward role,
          to give reward roles.
        </Tip>

        <h2>How members earn XP</h2>
        <h3>Chatting</h3>
        <p>
          Each message gives a random amount between the least and most you set
          (1 to 1,000 XP), at most once per cooldown (0 to 3,600 seconds, 60 by
          default). The cooldown stops members spamming short messages for XP:
          they still count as messages, they just don’t earn until the cooldown
          is over. Bots never earn XP, and neither do messages in No-XP channels
          (and their threads) or from members with a No-XP role.
        </p>
        <h3>Voice</h3>
        <p>
          Every minute in a voice channel gives the XP a minute you set (1 to
          100). Two options keep it fair: <b>Only with company</b> skips members
          sitting alone, and <b>Not while muted or deafened</b> skips members
          who are muted or deafened.
        </p>
        <h3>Boosts</h3>
        <p>
          A boost multiplies XP for members with a role, or for anyone in a
          channel, from 0.1× to 5× in steps of 0.1. A member gets their best
          role boost, times the boost of the channel they’re in. For example, a
          1.5× Server Booster role in a 2× event channel earns 3× XP. Boosts
          below 1× slow XP down, which is handy for busy off-topic channels.
          Free servers have 3 boosts and Plus servers 25.
        </p>

        <h2>The XP equation</h2>
        <p>
          The equation says how much XP each level takes, written with{' '}
          <Code>x</Code> for the level. Sparko’s is{' '}
          <Code>5*x^2 + 40*x + 55</Code>: level 1 needs 100 XP, level 10 needs
          955 XP, and each level takes a little longer than the last. Hover or
          use the arrow keys on the chart to read any level.
        </p>
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Write</th>
                <th scope="col">Means</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['x', 'The level being reached, like 1, 2, 3…'],
                ['+  -', 'Add and take away'],
                ['*  /', 'Multiply and divide'],
                ['%', 'The remainder after dividing'],
                ['^ or **', 'To the power of, like x^2'],
                ['( )', 'Work this part out first'],
              ].map(([write, means]) => (
                <tr key={write}>
                  <td data-label="Write" data-primary="true">
                    <Code>{write}</Code>
                  </td>
                  <td data-label="Means">{means}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>A few equations to start from:</p>
        <ul>
          <li>
            <Code>100*x</Code>: steady. Level 1 takes 100 XP, level 10 takes
            1,000.
          </li>
          <li>
            <Code>3*x^2 + 24*x + 48</Code>: gentle, for smaller servers.
          </li>
          <li>
            <Code>8*x^2 + 64*x + 78</Code>: steep, for big, busy servers.
          </li>
          <li>
            <Code>500</Code> won’t work: the equation has to use <Code>x</Code>.
          </li>
        </ul>
        <p>
          Every level up to the highest has to need at least 1 XP and at most
          100,000,000 XP, and the equation can be up to 120 characters. If
          something’s off, Sparko says which level breaks and why, for example
          dividing by zero. <b>Highest level</b> (1 to 500) is where members
          stop levelling; their XP still counts on the leaderboard.
        </p>
        <Tip>
          Changing the equation moves members to the level their XP is worth
          now. Nobody loses XP, and reward roles follow their new level.
        </Tip>

        <h2>Level-ups</h2>
        <p>
          When a member reaches a new level, Sparko can announce it where they
          chatted, in one channel, by DM, or not at all.{' '}
          <b>Announce every N levels</b> lets you announce only every 5th or
          10th level so chat stays calm. The message is a Message Studio
          template: start from one of Sparko’s, or design your own right in the
          preview. A level-up in a channel pings only the member who levelled
          up; DMs never ping.
        </p>

        <h2>Reward roles</h2>
        <p>
          Give a role at a level. Free servers have 5 reward roles and Plus
          servers 50, each at its own level with its own role.
        </p>
        <ul>
          <li>
            <b>Keep every reward earned</b>: on, members collect every role
            they’ve reached. Off, they keep only their highest and lower ones
            are taken off.
          </li>
          <li>
            <b>Take rewards back below their level</b>: when staff take XP or
            reset someone, Sparko removes the rewards they’re no longer at.
          </li>
        </ul>
        <p>
          Saving checks your current members and gives or takes roles to match,
          so changes apply to everyone, not just new level-ups.
        </p>

        <h2>XP crates</h2>
        <p>
          Crates are surprise drops. Each crate you add is its own card, with
          its own picture, rules and messages. Free servers have 2 crates and
          Plus servers 10. Switch crates on with the switch beside{' '}
          <b>+ Crate</b>.
        </p>
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">What it does</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  'Picture',
                  'Upload a PNG, JPEG, GIF or WebP up to 5 MB. Without one, Sparko’s gold crate is used. Show it in the message with {crate.image}.',
                ],
                ['Crate name', 'Up to 40 characters, shown with {crate.name}.'],
                [
                  'Drop channels',
                  'Where it can drop. Leave it empty for anywhere members earn XP.',
                ],
                [
                  'Claim amount',
                  'How many members can claim it, 1 to 100. Each gets their own random XP, and nobody can claim the same crate twice.',
                ],
                [
                  'Drop chance',
                  'The chance each XP-earning message drops it, 0.1% to 25%.',
                ],
                [
                  'Cooldown',
                  'The shortest time between this crate’s drops in a channel, 1 minute to 1 day, like 10mi or 1h.',
                ],
                ['Open within', 'Seconds before it vanishes, 10 to 3,600.'],
                ['Min and max XP', 'The XP each claim gives, 1 to 100,000.'],
              ].map(([setting, about]) => (
                <tr key={setting}>
                  <td data-label="Setting" data-primary="true">
                    {setting}
                  </td>
                  <td data-label="What it does">{about}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>How a drop plays out</h3>
        <ol className="sw-doc-steps">
          <li>
            <span>
              A member sends a message that earns XP. Sparko gives each crate
              its chance in order; at most one drops per message.
            </span>
          </li>
          <li>
            <span>
              The <b>crate message</b> appears with a green <b>Open</b> button
              (it says <b>Open · 3 left</b> when several can claim).
            </span>
          </li>
          <li>
            <span>
              Each member who presses it gets XP and the <b>claim message</b>,
              which only they can see. The crate message updates to show who
              claimed it and how many claims are left.
            </span>
          </li>
          <li>
            <span>
              When every claim is used the button reads <b>All 3 claimed</b> (or
              “kit got 120 XP” for a one-member crate). If time runs out first,
              it reads <b>Nobody opened it in time</b> or{' '}
              <b>Closed · 1 claimed</b>.
            </span>
          </li>
        </ol>
        <p>
          Press <b>Crate message</b> or <b>Claim message</b> on a card to edit
          that message below the cards, pick a template, or send a test.
        </p>

        <h2>Rank cards</h2>
        <p>
          <Code>/rank</Code> shows a member’s level, rank, XP and progress. By
          default it sends Sparko’s rank card: a picture with their avatar,
          name, level, place on the leaderboard and a progress bar, drawn on
          Sparko’s banner. Prefer text? Pick <b>A message</b> on the Rank cards
          tab and design it in Message Studio. Either way, choose whether
          everyone in the channel sees it or only the member who asked.
        </p>

        <h2>Leaderboard and staff tools</h2>
        <p>
          The Leaderboard tab lists every member by XP, 25 to a page, with a
          search. Open a member to see their level, progress and reward roles,
          and to give, take or set their XP (up to 10,000,000 at once) or reset
          them. Resetting everyone can’t be undone. In Discord,{' '}
          <Code>/leaderboard</Code> shows 10 to a page.
        </p>
        <p>
          <b>Who can change XP</b> on Settings picks the roles that can use{' '}
          <Code>/xp</Code>. Left empty, only members with Manage Server can.
        </p>
        <CommandTable
          names={[
            '/rank',
            '/leaderboard',
            '/xp give',
            '/xp take',
            '/xp set',
            '/xp reset',
          ]}
        />
        <p>
          On the Commands tab you can rename any of these, change their
          descriptions, or turn them off.
        </p>

        <h2>Variables</h2>
        <p>
          Level-up messages, rank messages and crate messages can use these, as
          well as the usual member and server variables.
        </p>
        <dl className="sw-vars">
          {studioVariables
            .filter((v) => v.level)
            .map((v) => (
              <div key={v.name}>
                <dt>
                  <Code>{`{${v.name}}`}</Code>
                </dt>
                <dd>{v.about}</dd>
              </div>
            ))}
        </dl>

        <h2>Logs</h2>
        <p>
          Every level-up, reward role given or taken, XP change by staff, reset,
          crate dropped, claimed or expired, and anything that failed, with
          filters. Sparko keeps the latest 500.
        </p>

        <h2>Limits</h2>
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Limit</th>
                <th scope="col">Free</th>
                <th scope="col">Plus</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Reward roles', '5', '50'],
                ['XP boosts', '3', '25'],
                ['XP crates', '2', '10'],
                ['Highest level', '500', '500'],
              ].map(([what, free, plus]) => (
                <tr key={what}>
                  <td data-label="Limit" data-primary="true">
                    {what}
                  </td>
                  <td data-label="Free">{free}</td>
                  <td data-label="Plus">{plus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Troubleshooting</h2>
        <h3>Nobody is earning XP</h3>
        <p>
          Check the module is on and saved, the channel isn’t a No-XP channel,
          the member has no No-XP role, and the message cooldown isn’t very
          long.
        </p>
        <h3>Reward roles aren’t given</h3>
        <p>
          Sparko needs Manage Roles, and its highest role has to be above the
          reward role in Server Settings, then Roles. The Logs tab shows a
          FAILED line when this happens.
        </p>
        <h3>Crates never drop</h3>
        <p>
          Crates need to be switched on, a message has to earn XP to drop one,
          and the cooldown has to have passed in that channel. A 2% chance means
          about 1 in 50 messages, so quiet channels can take a while.
        </p>
        <h3>/rank doesn’t show up</h3>
        <p>
          Make sure the command is on in the Commands tab and you saved. Discord
          can take a moment to show new commands; restarting Discord helps.
        </p>
      </>
    ),
  },
  {
    id: 'variables',
    group: 'Reference',
    title: 'Message variables',
    icon: 'hash',
    lede: 'Write these in braces in any message, and Sparko fills them in when it sends.',
    body: () => (
      <>
        <p>
          For example, <Code>{'Welcome to {server}, {user}!'}</Code> becomes
          “Welcome to Pixel Plaza, @tomoko!”. The <b>{'{ }'}</b> button beside
          every live preview lists the variables you can use there.
        </p>
        <dl className="sw-vars">
          {studioVariables.map((v) => (
            <div key={v.name}>
              <dt>
                <Code>{`{${v.name}}`}</Code>
              </dt>
              <dd>
                {v.about}
                {v.role && ' Reaction role responses only.'}
              </dd>
            </div>
          ))}
          <div>
            <dt>
              <Code>{'{separator}'}</Code>
            </dt>
            <dd>
              Draws a line across a Components V2 container and starts a new
              section.
            </dd>
          </div>
        </dl>
      </>
    ),
  },
  {
    id: 'modules',
    group: 'Reference',
    title: 'All modules',
    icon: 'layers',
    lede: `Every Sparko module by group. ${modules.filter((m) => isReady(m.id)).length} are ready in the dashboard today; the rest are on the way.`,
    body: () => (
      <>
        {groups.map((g) => (
          <section key={g} className="sw-doc-group">
            <h2>
              <Icon name={groupMeta[g].icon} />
              {g}
            </h2>
            <ul className="sw-doc-mods">
              {modules
                .filter((m) => m.group === g)
                .map((m) => (
                  <li key={m.id}>
                    {isReady(m.id) ? (
                      <Link to={`/docs/${m.id}`}>{m.label}</Link>
                    ) : (
                      <span>{m.label}</span>
                    )}
                    {isReady(m.id) ? (
                      <Badge tone="success" size="sm">
                        Ready
                      </Badge>
                    ) : (
                      <Badge size="sm">Coming soon</Badge>
                    )}
                    <span className="sw-body">{m.description}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </>
    ),
  },
];

const docGroups = ['Getting started', 'Modules', 'Reference'] as const;

export function DocsPage() {
  const { page: id = 'start' } = useParams();
  const page = pages.find((p) => p.id === id);
  usePageTitle(page ? `${page.title} · Docs` : 'Not found');
  const navigate = useNavigate();
  if (!page) return <NotFoundPage />;
  const at = pages.indexOf(page);
  const prev = pages[at - 1];
  const next = pages[at + 1];
  return (
    <div className="sw-wrap sw-docs-page">
      <aside className="sw-docs-nav">
        <label className="sw-docs-nav__pick">
          <span className="sp-input sp-input--select">
            <span className="sp-sr-only">Go to a docs page</span>
            <select
              value={page.id}
              onChange={(e) => navigate(`/docs/${e.target.value}`)}
            >
              {docGroups.map((g) => (
                <optgroup key={g} label={g}>
                  {pages
                    .filter((p) => p.group === g)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </span>
        </label>
        <nav className="sw-docs-nav__list" aria-label="Docs">
          {docGroups.map((g) => (
            <div key={g} className="sw-docs-nav__group">
              <h2>{g}</h2>
              <ul>
                {pages
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/docs/${p.id}`}
                        aria-current={p.id === page.id ? 'page' : undefined}
                      >
                        <Icon name={p.icon} size="sm" />
                        {p.title}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <article className="sw-doc" key={page.id}>
        <header className="sw-doc__head">
          <span className="sw-doc__group">{page.group}</span>
          <h1 className="sw-h1">{page.title}</h1>
          <p className="sw-lede">{page.lede}</p>
          {page.group === 'Modules' && (
            <p className="sw-doc__links">
              <Link to={`/features/${page.id}`}>
                See {page.title} on the features page
              </Link>
            </p>
          )}
        </header>
        <div className="sw-prose sw-doc__body">{page.body()}</div>
        <nav className="sw-doc__pager" aria-label="Previous and next page">
          {prev ? (
            <Link to={`/docs/${prev.id}`} className="sw-doc__pager-link">
              <span>Previous</span>
              <b>
                <Icon name="arrow-left" size="sm" />
                {prev.title}
              </b>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              to={`/docs/${next.id}`}
              className="sw-doc__pager-link is-next"
            >
              <span>Next</span>
              <b>
                {next.title}
                <Icon name="arrow-right" size="sm" />
              </b>
            </Link>
          )}
        </nav>
      </article>
    </div>
  );
}
