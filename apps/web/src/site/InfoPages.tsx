import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, Icon, Notice, Spinner } from '../ui';
import { legal } from '../content/legal';
import { groups, groupMeta, modules } from '../content/modules';
import { featureDetails } from '../content/features';
import { studioVariables } from '../data/studio-format';
import { supportServer } from './links';
import { usePageTitle } from './SiteLayout';

function PageHero({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
}) {
  return (
    <header className="sw-page-hero">
      <span className="sw-eyebrow">{eyebrow}</span>
      <h1 className="sw-h1">{title}</h1>
      <p className="sw-lede">{lede}</p>
    </header>
  );
}

const guides: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'start',
    title: 'Get started',
    body: (
      <ol>
        <li>Choose Add to Discord, pick your server and approve.</li>
        <li>
          Sign in to the dashboard with Discord. You see every server where you
          have Manage Server.
        </li>
        <li>
          Follow the setup checklist on the server’s overview. Each step shows a
          preview before anything is posted.
        </li>
      </ol>
    ),
  },
  {
    id: 'permissions',
    title: 'Permissions Sparko asks for',
    body: (
      <p>
        Sparko never asks for Administrator. It asks only for what the modules
        you turn on need, such as Manage Roles for automatic roles or Moderate
        Members for timeouts. If one is missing, the dashboard says which module
        needs it and where to switch it on in Discord.
      </p>
    ),
  },
  {
    id: 'saving',
    title: 'Saving, applying and undoing',
    body: (
      <p>
        When you save, the dashboard shows each stage: saved, applying to
        Discord, then live. Every save is kept as a version you can restore, and
        Configuration backups snapshot your whole setup so you can compare and
        roll back.
      </p>
    ),
  },
  {
    id: 'access',
    title: 'Who can manage Sparko',
    body: (
      <p>
        Server owners and members with Manage Server can manage everything.
        Dashboard access lets you give other roles specific modules, like
        Tickets for your support team, without giving them the rest.
      </p>
    ),
  },
  {
    id: 'plans',
    title: 'Free and Plus',
    body: (
      <p>
        Every module except multi-server tools is free. Plus raises limits and
        is paid through PayPal; see <Link to="/pricing">Pricing</Link>.
      </p>
    ),
  },
  {
    id: 'data',
    title: 'Your data',
    body: (
      <p>
        The <Link to="/privacy">Privacy Policy</Link> explains what Sparko
        stores and for how long. When Sparko is removed from a server, that
        server’s data is deleted {legal.removalGraceDays} days later.
      </p>
    ),
  },
];

const readyModules = modules.filter((m) => m.id in featureDetails);

/** Everything the table of contents lists, in page order. */
const docsToc = [
  ...guides.map((g) => ({ id: g.id, title: g.title })),
  { id: 'ready', title: 'Modules ready today' },
  ...readyModules.map((m) => ({ id: `m-${m.id}`, title: m.label, sub: true })),
  { id: 'variables', title: 'Message variables' },
  { id: 'modules', title: 'Modules by group' },
];

export function DocsPage() {
  usePageTitle('Docs');
  return (
    <div className="sw-wrap" style={{ paddingBottom: 96 }}>
      <PageHero
        eyebrow="Docs"
        title="How Sparko works"
        lede="Short guides for setting up Sparko and understanding what it does in your server."
      />
      <div className="sw-docs">
        <nav className="sw-docs__toc" aria-label="On this page">
          <ul>
            {docsToc.map((g) => (
              <li key={g.id} className={'sub' in g ? 'is-sub' : undefined}>
                <a href={`#${g.id}`}>{g.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sw-prose">
          {guides.map((g) => (
            <section key={g.id} id={g.id}>
              <h2>{g.title}</h2>
              {g.body}
            </section>
          ))}
          <section id="ready">
            <h2>Modules ready today</h2>
            <p>
              These modules are finished in the dashboard. The others on the{' '}
              <Link to="/features">Features</Link> page are still being built
              and show as coming soon.
            </p>
          </section>
          {readyModules.map((m) => {
            const detail = featureDetails[m.id]!;
            return (
              <section key={m.id} id={`m-${m.id}`} className="sw-docs__module">
                <h3>
                  <Icon name={m.icon} size="sm" />
                  {m.label}
                </h3>
                <p>{m.description}</p>
                <ul>
                  {detail.how.map((h) => (
                    <li key={h.title}>
                      <b>{h.title}.</b> {h.body}
                    </li>
                  ))}
                </ul>
                <p>
                  <b>To set it up:</b>
                </p>
                <ol>
                  {detail.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {detail.commands && (
                  <p>
                    Commands:{' '}
                    {detail.commands.map((c, i) => (
                      <span key={c}>
                        {i > 0 && ', '}
                        <code className="sp-mono">{c}</code>
                      </span>
                    ))}
                    .
                  </p>
                )}
                <p>
                  <Link to={`/features/${m.id}`}>More about {m.label}</Link>
                </p>
              </section>
            );
          })}
          <section id="variables">
            <h2>Message variables</h2>
            <p>
              Write these in braces in any message, like{' '}
              <code className="sp-mono">{'{user}'}</code>, and Sparko fills them
              in when it sends. The {'{ }'} button beside every live preview
              lists them too.
            </p>
            <dl className="sw-vars">
              {studioVariables.map((v) => (
                <div key={v.name}>
                  <dt>
                    <code className="sp-mono">{`{${v.name}}`}</code>
                  </dt>
                  <dd>
                    {v.about}
                    {v.member && ' Welcome, leave and boost messages only.'}
                    {v.role && ' Reaction role responses only.'}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section id="modules">
            <h2>Modules by group</h2>
            <ul className="sw-docs__groups">
              {groups.map((g) => (
                <li key={g}>
                  <Icon name={groupMeta[g].icon} size="sm" />
                  <Link to={`/features?group=${encodeURIComponent(g)}`}>
                    {g}
                  </Link>
                  <span className="sw-body">{groupMeta[g].blurb}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

type Status = 'loading' | 'operational' | 'degraded' | 'unreachable';
export function StatusPage() {
  usePageTitle('Status');
  const [status, setStatus] = useState<Status>('loading');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/public/status', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { status?: unknown };
        setStatus(body.status === 'operational' ? 'operational' : 'degraded');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setStatus('unreachable');
        return error;
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="sw-wrap" style={{ paddingBottom: 96, maxWidth: 880 }}>
      <PageHero
        eyebrow="Status"
        title="Is Sparko working?"
        lede="This page checks the Sparko service directly. Planned work and incidents are also announced in the support server."
      />
      <div className="sp-card" aria-live="polite">
        {status === 'loading' && (
          <div className="sw-status-row">
            <Spinner />
            Checking the service…
          </div>
        )}
        {status === 'operational' && (
          <div className="sw-status-row">
            <Badge tone="success" dot>
              Operational
            </Badge>
            The bot and the dashboard are working normally.
          </div>
        )}
        {status === 'degraded' && (
          <div className="sw-status-row">
            <Badge tone="warning" dot>
              Some problems
            </Badge>
            Parts of Sparko are slow or unavailable. We’re on it.
          </div>
        )}
        {status === 'unreachable' && (
          <EmptyState
            error
            title="We couldn’t reach the status service"
            actions={
              <a
                className="sp-btn sp-btn--secondary"
                href={supportServer}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the support server
              </a>
            }
          >
            Either your connection dropped or Sparko is down. Updates are posted
            in the support server.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

export function SupportPage() {
  usePageTitle('Support');
  const options: [string, string, ReactNode, ReactNode][] = [
    [
      'message-square',
      'Ask in the support server',
      'The fastest way to get help, see announcements and talk to other server owners.',
      <a href={supportServer} target="_blank" rel="noopener noreferrer">
        Join the support server
      </a>,
    ],
    [
      'mail',
      'Email us',
      'For account, billing or privacy questions you’d rather not ask in public.',
      <a href={`mailto:${legal.email}`}>{legal.email}</a>,
    ],
    [
      'file-text',
      'Read the docs',
      'Short guides on setup, permissions, undoing changes and plans.',
      <Link to="/docs">Open the docs</Link>,
    ],
  ];
  return (
    <div className="sw-wrap" style={{ paddingBottom: 96 }}>
      <PageHero
        eyebrow="Support"
        title="Get help with Sparko"
        lede="Real people answer, usually within a day."
      />
      <div className="sw-grid sw-grid--3">
        {options.map(([icon, title, body, action]) => (
          <article key={title} className="sw-card">
            <span className="sw-card__icon">
              <Icon name={icon} />
            </span>
            <h2 className="sw-h3">{title}</h2>
            <p className="sw-body">{body}</p>
            <div className="sw-card__action">{action}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Contact() {
  return (
    <>
      email <a href={`mailto:${legal.email}`}>{legal.email}</a> or ask in our{' '}
      <a href={legal.discordInvite} rel="noopener noreferrer" target="_blank">
        Discord support server
      </a>
    </>
  );
}

function LegalPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  usePageTitle(title);
  return (
    <div className="sw-wrap" style={{ paddingBottom: 96 }}>
      <PageHero
        eyebrow={`Effective ${legal.effectiveDate}`}
        title={title}
        lede={lede}
      />
      <article className="sw-prose sw-legal">
        {children}
        <section>
          <h2>Contact</h2>
          <p>
            Sparko is run by {legal.operator}, an individual based in{' '}
            {legal.country}. For questions about these documents or your data,{' '}
            <Contact />.
          </p>
        </section>
      </article>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lede="What Sparko collects, why, who it is shared with, how long it is kept and how to control it."
    >
      <section>
        <h2>Who we are</h2>
        <p>
          Sparko is a Discord bot and the website at {legal.site}. It is run by{' '}
          {legal.operator}, an individual in {legal.country} (“we”, “us”), who
          decides how the personal data described here is used. This policy
          covers people who sign in to the website and members of Discord
          servers that use Sparko, even if they never visit the website.
        </p>
      </section>
      <section>
        <h2>What we collect</h2>
        <h3>When you sign in with Discord</h3>
        <ul>
          <li>
            Your Discord user ID, username and avatar, and the list of servers
            you are in with your permissions there, so we can show the servers
            you may manage.
          </li>
          <li>
            Discord sign-in tokens, stored encrypted on our server and never
            sent to your browser.
          </li>
          <li>
            Your preferences (theme, language, timezone, motion, notifications
            and whether your profile is public).
          </li>
          <li>
            Messages and screenshots you send to product support, and export or
            deletion requests you make.
          </li>
        </ul>
        <h3>In servers that use Sparko</h3>
        <p>
          A server’s staff choose which modules to turn on. Depending on those
          choices, Sparko processes:
        </p>
        <ul>
          <li>
            Member IDs, roles, join dates and account age, for welcome messages,
            verification, auto roles and safety features.
          </li>
          <li>
            Message activity and content, for levels, counting, auto moderation,
            auto replies, starboard and ticket transcripts.
          </li>
          <li>
            Voice activity, reactions and invites, for voice rooms, reaction
            roles, invite tracking and analytics.
          </li>
          <li>
            Things you create or do: tickets and form answers, reports and
            appeals, suggestions, polls, events, reminders, birthdays, economy
            balances and items, and moderation cases.
          </li>
          <li>An audit log of staff actions in the dashboard.</li>
        </ul>
        <h3>Technical data</h3>
        <p>
          Our servers keep short rolling logs of requests, which can include
          your IP address as passed on by Cloudflare. They are used only for
          security and fixing faults, never contain your sign-in tokens or
          message content, and are overwritten automatically.
        </p>
      </section>
      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>
            To provide the features you or your server’s staff turned on. This
            is necessary to run the service you asked for.
          </li>
          <li>
            To keep Sparko secure: sign-in sessions, permission checks, abuse
            prevention and audit records.
          </li>
          <li>
            To take payments for Premium and keep the records the law requires.
          </li>
          <li>To answer support requests.</li>
        </ul>
        <p>
          We do not sell personal data, show advertising or use your data to
          train AI models.
        </p>
      </section>
      <section>
        <h2>Who we share it with</h2>
        <p>
          Only with the services needed to run Sparko, each under its own
          privacy terms:
        </p>
        <ul>
          <li>
            <strong>Discord</strong>, where the bot runs and through which you
            sign in.
          </li>
          <li>
            <strong>Vultr</strong>, which hosts our servers and database.
          </li>
          <li>
            <strong>Cloudflare</strong>, which provides DNS, HTTPS and
            protection from attacks for the website, and stores our encrypted
            backups.
          </li>
          <li>
            <strong>PayPal</strong>, which handles Premium payments. We never
            see your card or bank details.
          </li>
          <li>
            <strong>Google (Gmail)</strong>, if you email us.
          </li>
          <li>
            <strong>OpenAI</strong>, only if a server turns on AI assistance,
            and only the text a staff member submits for it.
          </li>
        </ul>
        <p>
          Social alerts read public feeds from YouTube, Twitch, GitHub or RSS
          sites; no personal data is sent to them. We may disclose data when the
          law requires it. Staff of a server can see the records of that server
          their role allows.
        </p>
        <p>
          These services may store data outside {legal.country}, including in
          the United States. We only use providers that protect personal data to
          a standard required by applicable law.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>
            <strong>Server data</strong> is kept while Sparko is in the server.
            When the bot is removed, the server’s data is deleted{' '}
            {legal.removalGraceDays} days later. The delay lets a server that
            removed Sparko by mistake add it back without losing its setup.
          </li>
          <li>
            <strong>Ticket transcripts</strong> are deleted automatically after{' '}
            {legal.transcriptDays} days at most ({legal.freeTranscriptDays} days
            on the Free plan).
          </li>
          <li>
            <strong>Your account</strong> is kept until you delete it. Sign-in
            sessions end after {legal.sessionDays} days, and data exports can be
            downloaded for {legal.exportDays} days.
          </li>
          <li>
            <strong>Payment records</strong> are kept for as long as tax and
            accounting law requires, even after a server or account is deleted.
          </li>
          <li>
            <strong>Backups</strong> of the database and uploaded files are
            encrypted and kept for {legal.backupDays} days, so data deleted from
            Sparko also leaves the backups within that time.
          </li>
        </ul>
      </section>
      <section>
        <h2>Your rights and choices</h2>
        <p>
          Depending on where you live, including under {legal.country}’s
          personal data protection law and the EU GDPR, you can ask to see,
          copy, correct or delete your data, withdraw consent, or object to or
          restrict how it is used.
        </p>
        <ul>
          <li>
            Account privacy, in your account settings, lets you download your
            data or delete your account yourself. Deleting your account ends
            your sessions, removes your sign-in tokens, support conversations,
            reminders, birthdays and uploads, and replaces your name with
            “Deleted user”.
          </li>
          <li>
            Records a server keeps about its members (such as tickets,
            moderation cases, levels and economy history) stay with that server
            until it removes Sparko. To have them removed sooner, ask that
            server’s staff, or contact us.
          </li>
          <li>
            For anything else, <Contact />. We answer within the time limits the
            law sets. You may also complain to your data protection authority.
          </li>
        </ul>
      </section>
      <section>
        <h2>Cookies and storage</h2>
        <p>
          We use only cookies needed to keep you signed in and to protect forms
          from cross-site attacks, plus your theme choice stored in your
          browser. Cloudflare may set its own security cookies. There are no
          advertising or analytics trackers.
        </p>
      </section>
      <section>
        <h2>Children</h2>
        <p>
          You must be at least {legal.minimumAge}, and old enough to use Discord
          where you live. If you are under 16, use Sparko only with permission
          from a parent or guardian. If we learn that we hold data about a child
          who is too young, we will delete it.
        </p>
      </section>
      <section>
        <h2>Security</h2>
        <p>
          Connections use HTTPS, sign-in tokens and integration secrets are
          encrypted, and every action is checked against your current Discord
          permissions. No system is perfectly secure; if a breach affects your
          data, we will tell you and the authorities as the law requires.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>
          We will update this page and its effective date when this policy
          changes, and announce important changes in our Discord support server.
        </p>
      </section>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lede="The agreement between you and Sparko’s operator for using the bot and website."
    >
      <section>
        <h2>The agreement</h2>
        <p>
          These terms are an agreement between you and {legal.operator}, the
          individual in {legal.country} who runs Sparko. By adding Sparko to a
          server, signing in to {legal.site} or using the bot, you accept them
          and our <Link to="/privacy">Privacy Policy</Link>. If you do not
          agree, do not use Sparko.
        </p>
      </section>
      <section>
        <h2>Who can use Sparko</h2>
        <p>
          You must be at least {legal.minimumAge}, old enough to use Discord
          where you live, and follow Discord’s Terms of Service and Community
          Guidelines. If you are under 18, you need a parent or guardian’s
          permission to buy Premium.
        </p>
      </section>
      <section>
        <h2>Server staff</h2>
        <p>If you add Sparko to a server or manage it there, you agree to:</p>
        <ul>
          <li>Only manage servers you are authorized to manage.</li>
          <li>
            Tell your members which features you turn on, especially ones that
            record messages, such as transcripts and moderation.
          </li>
          <li>
            Check channels, roles and audiences before publishing messages or
            running automations.
          </li>
          <li>
            Use Sparko in line with Discord’s rules and the law, and handle
            member requests about the server’s records.
          </li>
        </ul>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>You must not use Sparko to:</p>
        <ul>
          <li>
            Harass, spam or harm people, or share illegal content or content you
            have no right to share.
          </li>
          <li>
            Get around permissions, access other servers’ data, or attack,
            overload or reverse-engineer the service.
          </li>
          <li>
            Run gambling for real money or real-world prizes, or sell virtual
            currency or items.
          </li>
          <li>Pretend to be Sparko staff or another person.</li>
        </ul>
        <p>
          We may remove content, limit features, or stop providing Sparko to a
          user or server that breaks these terms.
        </p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          You keep ownership of what you create and upload. You give us
          permission to store, display and send it only as needed to run the
          features you use. You are responsible for having the rights to content
          you publish through Sparko.
        </p>
      </section>
      <section>
        <h2>Virtual currency and items</h2>
        <p>
          Economy balances, items, lottery tickets and rewards are game records
          with no real-world value. They cannot be exchanged for money, sold, or
          transferred outside Sparko, and they may be reset or removed. The
          virtual lottery uses virtual currency only.
        </p>
      </section>
      <section>
        <h2>Premium</h2>
        <ul>
          <li>
            Premium (the Plus plan) is paid through PayPal. The price and
            billing period are shown before you pay, and PayPal’s terms also
            apply to the payment.
          </li>
          <li>
            Subscriptions renew automatically until cancelled. You can cancel
            any time in PayPal; Premium then stays active until the end of the
            period already paid for.
          </li>
          <li>
            If you were charged by mistake, or Premium does not work and we
            cannot fix it, contact us within {legal.refundWindowDays} days of
            the payment for a refund. Otherwise payments are not refundable,
            except where the law gives you a right to a refund.
          </li>
          <li>
            If a payment is reversed or charged back, Premium may be removed.
            When Premium ends, your server keeps its data and returns to Free
            limits.
          </li>
          <li>
            We may change prices or Premium features; a price change applies
            from your next billing period after we announce it.
          </li>
        </ul>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          Sparko depends on Discord and other services and may change, be
          interrupted, or stop. We provide it “as is” and do not promise that it
          will always be available or free of errors.
        </p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>
          To the extent the law allows, we are not liable for indirect or
          consequential losses, or for loss of data, revenue or community
          members, arising from use of Sparko. Our total liability to you is
          limited to the amount you paid us in the 12 months before the claim.
          Nothing in these terms removes rights you have under consumer
          protection law.
        </p>
      </section>
      <section>
        <h2>Ending use</h2>
        <p>
          You can stop at any time by removing Sparko from your server or
          deleting your account. A removed server’s data is deleted{' '}
          {legal.removalGraceDays} days after the bot leaves, as described in
          the <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </section>
      <section>
        <h2>Changes and law</h2>
        <p>
          We will post changes to these terms on this page with a new effective
          date and announce important changes in our Discord support server.
          Using Sparko after a change means you accept it. These terms are
          governed by the laws of {legal.country}. Please contact us first so we
          can try to resolve any dispute informally; otherwise disputes go to
          the competent courts of {legal.country}, without affecting any right
          you have to bring a claim where you live.
        </p>
      </section>
    </LegalPage>
  );
}

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <div className="sw-wrap" style={{ padding: '72px 16px' }}>
      <div className="sp-card">
        <EmptyState
          icon="circle-help"
          title="This page doesn’t exist"
          actions={
            <Link className="sp-btn sp-btn--secondary" to="/">
              Go to the home page
            </Link>
          }
        >
          The link may be old, or the address has a typo.
        </EmptyState>
      </div>
      <Notice tone="info" title="Looking for a feature?">
        Browse all of them on the <Link to="/features">Features</Link> page.
      </Notice>
    </div>
  );
}
