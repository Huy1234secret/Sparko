import { Link } from 'react-router-dom';
import { Badge, Icon } from '../../ui';
import { isReady } from '../../content/features';
import { groupMeta, groups, modules } from '../../content/modules';
import { studioVariables } from '../../data/studio-format';
import {
  Code,
  TermTable,
  TimeUnits,
  Tip,
  VariableList,
  type DocPage,
} from './parts';

/** Variables only some messages fill in, and where to read about them. */
const variableGroups = [
  { only: 'role', title: 'Reaction role responses', doc: 'role-menus' },
  { only: 'suggestion', title: 'Suggestions', doc: 'suggestions' },
  { only: 'question', title: 'Questions & answers', doc: 'questions' },
  { only: 'birthday', title: 'Birthdays', doc: 'birthdays' },
  { only: 'starboard', title: 'Starboard', doc: 'starboard' },
  { only: 'poll', title: 'Polls', doc: 'polls' },
  { only: 'invite', title: 'Invite tracking', doc: 'invites' },
  { only: 'event', title: 'Events & RSVP', doc: 'events' },
  { only: 'voice', title: 'Temporary voice panel', doc: 'temp-voice' },
] as const;

const everywhere = studioVariables.filter(
  (v) =>
    !v.role &&
    !v.suggestion &&
    !v.question &&
    !v.birthday &&
    !v.starboard &&
    !v.poll &&
    !v.invite &&
    !v.event &&
    !v.voice,
);

export const referenceDocs: DocPage[] = [
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
          “Welcome to Pixel Plaza, @tomoko!”. The <b>Variables</b> button beside
          every live preview lists the variables you can use there.
        </p>
        <ul>
          <li>
            Variables work in text, embed titles, descriptions, fields, footers,
            author names and button labels.
          </li>
          <li>
            Picture variables like <Code>{'{user.avatar}'}</Code> and{' '}
            <Code>{'{server.icon}'}</Code> also work as picture links, in an
            embed’s image, thumbnail, author or footer icon.
          </li>
          <li>
            A variable with nothing to fill it (no member, when staff post from
            the dashboard) is sent empty. Text in braces that isn’t a variable
            is left as written.
          </li>
          <li>
            Mentions like <Code>{'{user}'}</Code> never ping unless the module’s
            ping setting is on.
          </li>
        </ul>
        <h2>Everywhere</h2>
        <dl className="sw-vars">
          {everywhere.map((v) => (
            <div key={v.name}>
              <dt>
                <Code>{`{${v.name}}`}</Code>
              </dt>
              <dd>{v.about}</dd>
            </div>
          ))}
          <div>
            <dt>
              <Code>{'{separator}'}</Code>
            </dt>
            <dd>
              Draws a line across a Components V2 container and starts a new
              section. Dropped from embed messages.
            </dd>
          </div>
        </dl>
        {variableGroups.map((g) => (
          <section key={g.only}>
            <h2>{g.title}</h2>
            <p>
              Only in <Link to={`/docs/${g.doc}`}>{g.title}</Link> messages.
            </p>
            <VariableList only={g.only} />
          </section>
        ))}
      </>
    ),
  },
  {
    id: 'times',
    group: 'Reference',
    title: 'Writing times',
    icon: 'clock',
    lede: 'Cooldowns, ages and timers across Sparko are written the same short way, like 30mi, 12h or 7d.',
    body: () => (
      <>
        <TimeUnits />
        <p>
          <Code>mi</Code> and <Code>mt</Code> are there because <Code>m</Code>{' '}
          could mean minutes or months. Sparko reads <Code>m</Code> as minutes.
          Each setting says its shortest and longest time, and the dashboard
          tells you straight away if what you wrote is out of range.
        </p>
        <h2>Where you’ll write them</h2>
        <TermTable
          head={['Setting', 'Range']}
          rows={[
            ['Automatic roles: timed role', '1 minute to 2 years'],
            [
              'Automatic roles: account age, boosting',
              '1 day to 2 years / 365 days',
            ],
            ['Suggestions: minimum account age', '1 day to 1 year'],
            ['Suggestions: auto-close', '1 minute to 1 month'],
            ['Suggestions: cooldown', '1 hour to 1 month'],
            ['Questions: cooldown, close after', '1 minute to 1 month'],
            ['Questions: expire unanswered', '1 hour to 1 year'],
            ['Birthdays: time between changes, account age', '1 day to 1 year'],
            ['Birthdays: time in the server', '1 hour to 1 year'],
            ['Polls: length', '1 minute to 30 days'],
            ['Events: reminders', '1 minute to 30 days before'],
            ['Invite tracking: fake account age', '1 hour to 1 year'],
          ]}
        />
        <Tip icon="calendar" title="Dates for events">
          Events read dates and times the way people write them, like{' '}
          <Code>friday 8pm</Code> or <Code>in 2h</Code>. See{' '}
          <Link to="/docs/events">Events & RSVP</Link>.
        </Tip>
      </>
    ),
  },
  {
    id: 'troubleshooting',
    group: 'Reference',
    title: 'Troubleshooting',
    icon: 'circle-help',
    lede: 'The usual reasons something isn’t working, and how to fix each one.',
    body: () => (
      <>
        <h2>Sparko doesn’t post anything</h2>
        <ul>
          <li>Is the module switched on, and did you save?</li>
          <li>
            Does Sparko have <b>View Channel</b>, <b>Send Messages</b> and{' '}
            <b>Embed Links</b> in that channel? Check the channel’s own
            overrides too.
          </li>
          <li>
            Is the header saying <b>Couldn’t apply</b>? It says why.
          </li>
          <li>Check the module’s Logs tab for FAILED entries.</li>
        </ul>
        <h2>A role isn’t given</h2>
        <ul>
          <li>
            Sparko needs <b>Manage Roles</b>, and its own role has to be{' '}
            <b>above</b> the role it gives in Server Settings → Roles.
          </li>
          <li>Managed roles (from bots or boosts) can’t be given by anyone.</li>
        </ul>
        <h2>Slash commands don’t show up</h2>
        <ul>
          <li>Save the module: its commands are added when you save.</li>
          <li>
            Check the module’s Commands tab: a command can be turned off there.
          </li>
          <li>
            Re-invite Sparko with the <b>applications.commands</b> permission.
          </li>
          <li>Restart Discord, which can hold on to an old command list.</li>
        </ul>
        <h2>DMs don’t arrive</h2>
        <p>
          Members can turn off DMs from server members, and then nobody, Sparko
          included, can DM them. The module’s log says so when that happens.
        </p>
        <h2>Times are off</h2>
        <p>
          Birthdays and Events use the time zone in their settings, not your
          computer’s. Members always see event times in their own time zone.
        </p>
        <h2>Still stuck?</h2>
        <p>
          The server’s Health card on the Overview checks permissions and
          commands for you. If it’s all green and something still isn’t right,{' '}
          <Link to="/support">get in touch</Link>.
        </p>
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
