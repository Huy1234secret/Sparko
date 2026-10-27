import { Code, CommandTable, Tip, VariableList, type DocPage } from './parts';

export const levelsDoc: DocPage = {
  id: 'levels',
  group: 'Modules',
  title: 'Levels & XP',
  icon: 'trending-up',
  lede: 'Members earn XP for chatting and time in voice, climb levels, get reward roles, race to claim XP crates and show off their rank card.',
  body: () => (
    <>
      <p>
        Levels & XP rewards the people who keep your server alive. Every message
        and every minute in voice earns XP, XP adds up to levels by an equation
        you control, and levels unlock roles. On top of that, XP crates drop in
        chat now and then for members to race for, and <Code>/rank</Code> shows
        each member a picture of their progress.
      </p>
      <h2>Set it up in five minutes</h2>
      <ol className="sw-doc-steps">
        <li>
          <span>
            Open your server in the dashboard, go to <b>Engagement</b> and pick{' '}
            <b>Levels & XP</b>. Switch it on at the top right.
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
            Add <b>No-XP channels</b> such as bot commands or spam, so XP can’t
            be farmed there.
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
            <Code>/leaderboard</Code> and <Code>/xp</Code> in your server within
            a few seconds.
          </span>
        </li>
      </ol>
      <Tip title="Permissions Sparko needs">
        Send Messages, Embed Links and View Channel where it posts level-ups and
        crates, and Manage Roles, with its role above every reward role, to give
        reward roles.
      </Tip>

      <h2>How members earn XP</h2>
      <h3>Chatting</h3>
      <p>
        Each message gives a random amount between the least and most you set (1
        to 1,000 XP), at most once per cooldown (0 to 3,600 seconds, 60 by
        default). The cooldown stops members spamming short messages for XP:
        they still count as messages, they just don’t earn until the cooldown is
        over. Bots never earn XP, and neither do messages in No-XP channels (and
        their threads) or from members with a No-XP role.
      </p>
      <h3>Voice</h3>
      <p>
        Every minute in a voice channel gives the XP a minute you set (1 to
        100). Two options keep it fair: <b>Only with company</b> skips members
        sitting alone, and <b>Not while muted or deafened</b> skips members who
        are muted or deafened.
      </p>
      <h3>Boosts</h3>
      <p>
        A boost multiplies XP for members with a role, or for anyone in a
        channel, from 0.1× to 5× in steps of 0.1. A member gets their best role
        boost, times the boost of the channel they’re in. For example, a 1.5×
        Server Booster role in a 2× event channel earns 3× XP. Boosts below 1×
        slow XP down, which is handy for busy off-topic channels. Free servers
        have 3 boosts and Plus servers 25.
      </p>

      <h2>The XP equation</h2>
      <p>
        The equation says how much XP each level takes, written with{' '}
        <Code>x</Code> for the level. Sparko’s is <Code>5*x^2 + 40*x + 55</Code>
        : level 1 needs 100 XP, level 10 needs 955 XP, and each level takes a
        little longer than the last. Hover or use the arrow keys on the chart to
        read any level.
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
        dividing by zero. <b>Highest level</b> (1 to 500) is where members stop
        levelling; their XP still counts on the leaderboard.
      </p>
      <Tip>
        Changing the equation moves members to the level their XP is worth now.
        Nobody loses XP, and reward roles follow their new level.
      </Tip>

      <h2>Level-ups</h2>
      <p>
        When a member reaches a new level, Sparko can announce it where they
        chatted, in one channel, by DM, or not at all.{' '}
        <b>Announce every N levels</b> lets you announce only every 5th or 10th
        level so chat stays calm. The message is a Message Studio template:
        start from one of Sparko’s, or design your own right in the preview. A
        level-up in a channel pings only the member who levelled up; DMs never
        ping.
      </p>

      <h2>Reward roles</h2>
      <p>
        Give a role at a level. Free servers have 5 reward roles and Plus
        servers 50, each at its own level with its own role.
      </p>
      <ul>
        <li>
          <b>Keep every reward earned</b>: on, members collect every role
          they’ve reached. Off, they keep only their highest and lower ones are
          taken off.
        </li>
        <li>
          <b>Take rewards back below their level</b>: when staff take XP or
          reset someone, Sparko removes the rewards they’re no longer at.
        </li>
      </ul>
      <p>
        Saving checks your current members and gives or takes roles to match, so
        changes apply to everyone, not just new level-ups.
      </p>

      <h2>XP crates</h2>
      <p>
        Crates are surprise drops. Each crate you add is its own card, with its
        own picture, rules and messages. Free servers have 2 crates and Plus
        servers 10. Switch crates on with the switch beside <b>+ Crate</b>.
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
            A member sends a message that earns XP. Sparko gives each crate its
            chance in order; at most one drops per message.
          </span>
        </li>
        <li>
          <span>
            The <b>crate message</b> appears with a green <b>Open</b> button (it
            says <b>Open · 3 left</b> when several can claim).
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
            “kit got 120 XP” for a one-member crate). If time runs out first, it
            reads <b>Nobody opened it in time</b> or <b>Closed · 1 claimed</b>.
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
        default it sends Sparko’s rank card: a picture with their avatar, name,
        level, place on the leaderboard and a progress bar, drawn on Sparko’s
        banner. Prefer text? Pick <b>A message</b> on the Rank cards tab and
        design it in Message Studio. Either way, choose whether everyone in the
        channel sees it or only the member who asked.
      </p>

      <h2>Leaderboard and staff tools</h2>
      <p>
        The Leaderboard tab lists every member by XP, 25 to a page, with a
        search. Open a member to see their level, progress and reward roles, and
        to give, take or set their XP (up to 10,000,000 at once) or reset them.
        Resetting everyone can’t be undone. In Discord,{' '}
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
      <VariableList only="level" />

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
        Check the module is on and saved, the channel isn’t a No-XP channel, the
        member has no No-XP role, and the message cooldown isn’t very long.
      </p>
      <h3>Reward roles aren’t given</h3>
      <p>
        Sparko needs Manage Roles, and its highest role has to be above the
        reward role in Server Settings, then Roles. The Logs tab shows a FAILED
        line when this happens.
      </p>
      <h3>Crates never drop</h3>
      <p>
        Crates need to be switched on, a message has to earn XP to drop one, and
        the cooldown has to have passed in that channel. A 2% chance means about
        1 in 50 messages, so quiet channels can take a while.
      </p>
      <h3>/rank doesn’t show up</h3>
      <p>
        Make sure the command is on in the Commands tab and you saved. Discord
        can take a moment to show new commands; restarting Discord helps.
      </p>
    </>
  ),
};
