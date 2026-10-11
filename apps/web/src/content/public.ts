export interface PublicFeatureGuide {
  id: string;
  slug: string;
  title: string;
  group:
    | 'Support'
    | 'Community'
    | 'Engagement'
    | 'Safety'
    | 'Messages'
    | 'Insights';
  summary: string;
  description: string;
  outcomes: string[];
  setup: string[];
  permissions: string[];
  intents: string[];
  commandSearch: string;
  restrictions: string[];
  guideId: string;
}

/** Editorial descriptions are separate from the API's authoritative feature availability. */
export const publicFeatureGuides: PublicFeatureGuide[] = [
  {
    id: 'tickets',
    slug: 'tickets',
    title: 'A calmer support inbox',
    group: 'Support',
    summary:
      'Give members a clear place to ask. Give your team a clear next action.',
    description:
      'Create a support panel, collect the right details, and keep each request with its permitted participants. Ticket history follows the request from creation through closure.',
    outcomes: [
      'Category-based routing and creation forms',
      'Staff claims, participants, and closure history',
      'Private transcript access and visible capture status',
    ],
    setup: [
      'Choose a ticket channel or category and the staff roles that should have access.',
      'Set an open-ticket limit and decide whether a transcript is required before cleanup.',
      'Design your entry panel, send a test, then explicitly publish it.',
      'Open a test ticket in Discord and check its record in the support dashboard.',
    ],
    permissions: [
      'Manage Channels for channel tickets',
      'View Channel and Send Messages in the panel destination',
      'Read Message History for transcript capture',
    ],
    intents: [
      'Guilds',
      'Guild Messages for observed ticket history',
      'Message Content when configured transcript collection requires it',
    ],
    commandSearch: 'ticket',
    restrictions: [
      'Changing a panel does not silently rewrite existing tickets.',
      'A failed required transcript retains the ticket resource for recovery.',
      'Discord thread and channel strategies depend on the configured permissions.',
    ],
    guideId: 'tickets',
  },
  {
    id: 'messages',
    slug: 'message-studio',
    title: 'Messages with a little more spark',
    group: 'Messages',
    summary:
      'Build a reusable design. Check the payload. Publish with confidence.',
    description:
      'Message Studio keeps design, validation, and publication together. Modern Components V2 and traditional embeds have separate valid output modes, with reusable versions and deliberate publication actions.',
    outcomes: [
      'Components V2 and traditional embed designs',
      'Token assistance and compiled payload inspection',
      'Separate saved drafts, test deliveries, and published versions',
    ],
    setup: [
      'Choose Components V2 or traditional embed mode.',
      'Add your message blocks and choose the allowed tokens for the event.',
      'Review validation and the compiled output; check optional media fallbacks.',
      'Save a version, send a test to an authorized channel, and publish deliberately.',
    ],
    permissions: [
      'View Channel and Send Messages',
      'Embed Links for embed mode',
      'Attach Files for uploaded media',
    ],
    intents: ['Guilds'],
    commandSearch: 'message',
    restrictions: [
      'Components V2 cannot be combined with ordinary content or embeds.',
      'Switching a published V2 message to embed mode requires a replacement.',
      'Website JSON animations use exported supported media in Discord.',
      'Discord uses platform button colors.',
    ],
    guideId: 'message-studio',
  },
  {
    id: 'levels',
    slug: 'levels',
    title: 'Progress that makes sense',
    group: 'Engagement',
    summary: 'Recognize participation with clear rules and a readable history.',
    description:
      'Configure eligible channels, cooldowns, progression curves, and reward roles. Progress comes from real observed events, with member-facing rank information and auditable reward identities.',
    outcomes: [
      'Channel and role exclusions',
      'Progression history and rank-card designs',
      'Reward-role policies with hierarchy checks',
    ],
    setup: [
      'Choose eligible channels and exclusions.',
      'Set the XP range, cooldown, and progression curve.',
      'Place Sparko above any reward roles and review the reconciliation policy.',
      'Check a real eligible event before enabling announcements.',
    ],
    permissions: [
      'View Channel for eligible channels',
      'Manage Roles for reward roles',
      'Send Messages and Attach Files for rank-card delivery',
    ],
    intents: [
      'Guild Messages',
      'Message Content only when an enabled rule needs message content',
    ],
    commandSearch: 'level',
    restrictions: [
      'Bots and excluded events do not award XP.',
      'A repeated source event must not award again.',
      'Website requests cannot impersonate Discord activity.',
      'Role rewards are limited by Discord hierarchy.',
    ],
    guideId: 'engagement',
  },
  {
    id: 'roles',
    slug: 'roles',
    title: 'Let members find their place',
    group: 'Community',
    summary:
      'Make role choices understandable, with eligibility checked every time.',
    description:
      'Offer role buttons or select menus with deliberate prerequisites and exclusive groups. Keep role choices useful without exposing privileged or unmanaged roles.',
    outcomes: [
      'Buttons and select menus',
      'Required and blocked role rules',
      'Exclusive groups and optional timed access',
    ],
    setup: [
      'Choose safe member roles and move Sparko above them.',
      'Configure selection limits, exclusive groups, and eligibility.',
      'Explain each role in the message design.',
      'Publish a test menu and check add and remove behavior.',
    ],
    permissions: [
      'Manage Roles',
      'View Channel and Send Messages for the menu',
    ],
    intents: [
      'Guilds',
      'Guild Members where current membership events are required',
    ],
    commandSearch: 'roles',
    restrictions: [
      'Managed, elevated, or privileged roles cannot be offered indiscriminately.',
      'Deleted roles and changed hierarchy can block delivery.',
      'A retry preserves the requested desired state.',
    ],
    guideId: 'community',
  },
  {
    id: 'giveaways',
    slug: 'giveaways',
    title: 'A giveaway with a clear finish',
    group: 'Engagement',
    summary:
      'Set the rules, collect qualified entries, and retain the draw history.',
    description:
      'Manage entry eligibility, deadlines, winner counts, and claims. A giveaway has a durable draw identity so a timer, manual finish, and retry converge on the same business result.',
    outcomes: [
      'Explicit eligibility and entry rules',
      'Durable deadlines and winner history',
      'Separate notification and claim outcomes',
    ],
    setup: [
      'Choose the prize, destination, end time, and winner count.',
      'Set eligibility rules and explain the claim policy.',
      'Review the design and explicitly start the giveaway.',
      'Use the recorded draw and claim history to resolve follow-up questions.',
    ],
    permissions: [
      'View Channel and Send Messages',
      'Embed Links or Attach Files when used in the design',
    ],
    intents: [
      'Guilds',
      'Guild Members when a configured eligibility check needs member data',
    ],
    commandSearch: 'giveaway',
    restrictions: [
      'Live draw rules do not change silently.',
      'An unavailable eligibility fact cannot be assumed true.',
      'Failed notifications do not automatically create a different winner.',
    ],
    guideId: 'engagement',
  },
  {
    id: 'welcome',
    slug: 'welcome',
    title: 'Make the first hello count',
    group: 'Community',
    summary:
      'Give new members a useful first step in a message that feels like your server.',
    description:
      'Design welcome, leave, and boost messages separately. Event tokens, channel destinations, and card variants share the same message platform and validation.',
    outcomes: [
      'Separate welcome, leave, and boost settings',
      'Member and server tokens',
      'Channel and DM delivery with visible failures',
    ],
    setup: [
      'Confirm the required member-event intent is enabled.',
      'Choose a destination and an event-specific template.',
      'Preview tokens with a clearly labeled example context.',
      'Send a harmless test, then enable the event.',
    ],
    permissions: [
      'View Channel and Send Messages',
      'Embed Links and Attach Files when required',
    ],
    intents: [
      'Guild Members for join and leave events',
      'Other event prerequisites are shown per variant',
    ],
    commandSearch: 'setup',
    restrictions: [
      'DM delivery can be denied by a member.',
      'Unavailable events do not produce invented history.',
      'A preview is not a real member join.',
    ],
    guideId: 'community',
  },
  {
    id: 'moderation',
    slug: 'moderation',
    title: 'Keep decisions accountable',
    group: 'Safety',
    summary:
      'Clear cases, scoped permissions, and a reason behind consequential actions.',
    description:
      'Give staff the access they need for moderation without granting unrelated server or global privileges. Consequential actions belong to cases with actors, reasons, outcomes, and recoverable delivery states.',
    outcomes: [
      'Case-based moderation and history',
      'Hierarchy and permission checks',
      'Private evidence and instance-aware expiry',
    ],
    setup: [
      'Delegate the specific moderation capability to trusted staff.',
      'Check bot permissions and role hierarchy for each action type.',
      'Choose logging and retention policies.',
      'Use observe and simulation modes for automated rules before applying consequences.',
    ],
    permissions: [
      'Moderate Members, Kick Members, or Ban Members for the selected action',
      'Manage Messages for purge',
      'View Audit Log where an enabled protection rule requires it',
    ],
    intents: [
      'Guilds',
      'Guild Moderation for supported events',
      'Guild Messages and Message Content for applicable automod rules',
    ],
    commandSearch: 'case',
    restrictions: [
      'Discord server owners and hierarchy restrictions still apply.',
      'Unknown audit attribution is not evidence against a member.',
      'Protection recovery is best effort.',
      'Simulations never apply punishment.',
    ],
    guideId: 'safety',
  },
  {
    id: 'schedules',
    slug: 'automation',
    title: 'Make the repeat work lighter',
    group: 'Messages',
    summary:
      'Plan the message and destination, then see each run and its outcome.',
    description:
      'Schedules and bounded workflows use explicit timezones, versioned messages, deliberate destinations, and persisted execution history. Missing permissions and uncertain delivery stay visible.',
    outcomes: [
      'One-off and recurring messages',
      'Timezone and missed-run policies',
      'Dry runs and bounded workflow actions',
    ],
    setup: [
      'Select the destination and immutable message version.',
      'Choose the local time, timezone, and supported recurring rule.',
      'Review what happens if the service misses a run.',
      'Preview the planned effects, then enable the schedule or workflow.',
    ],
    permissions: ['Permissions for each configured destination and action'],
    intents: ['Required intents depend on the selected trigger'],
    commandSearch: 'automation',
    restrictions: [
      'Uploaded scripts and arbitrary code are not supported.',
      'Cancellation stops future effects rather than undoing completed ones.',
      'Retries do not blindly repeat completed workflow steps.',
    ],
    guideId: 'automation',
  },
  {
    id: 'analytics',
    slug: 'analytics',
    title: 'See what your server is doing',
    group: 'Insights',
    summary:
      'Useful trends with the collection window and missing data in view.',
    description:
      'Read permitted aggregate activity and module outcomes with clear time ranges and freshness. No activity, disabled collection, and unavailable service are different states.',
    outcomes: [
      'Real aggregate trends and time ranges',
      'Collection coverage and freshness labels',
      'Accessible table views and matching exports',
    ],
    setup: [
      'Choose what your server should collect and review retention.',
      'Confirm the event permissions and intents.',
      'Allow real events to populate the collection window.',
      'Inspect freshness and coverage before interpreting a trend.',
    ],
    permissions: [
      'Current delegated analytics.read or server management access',
    ],
    intents: ['Depends on the configured member, message, or voice metric'],
    commandSearch: 'status',
    restrictions: [
      'Unavailable events cannot be reconstructed from nothing.',
      'A zero count is only meaningful when collection was active.',
      'Public widgets require explicit safe opt-in.',
    ],
    guideId: 'analytics',
  },
  {
    id: 'economy',
    slug: 'economy',
    title: 'A virtual economy with a record',
    group: 'Engagement',
    summary:
      'Keep rewards, purchases, and trades connected to a consistent ledger.',
    description:
      'Guild-scoped virtual balances, inventory, and transactions belong to the backend ledger. Delivery results remain separate when an item depends on a Discord role action.',
    outcomes: [
      'Guild-scoped virtual currency',
      'Purchases and inventory history',
      'Explicit escrow and settlement rules',
    ],
    setup: [
      'Enable the module only when its live availability permits it.',
      'Define the currency, sources, sinks, limits, and item eligibility.',
      'Check role item delivery permissions and refund policy.',
      'Review ledger reconciliation before introducing game rewards.',
    ],
    permissions: [
      'Configured economy management access',
      'Manage Roles for eligible role items',
    ],
    intents: ['Depends on configured reward events'],
    commandSearch: 'balance',
    restrictions: [
      'Virtual currency is separate from paid subscriptions.',
      'Virtual lottery is opt-in and has no cash redemption.',
      'A pending role delivery must not charge a purchase again.',
    ],
    guideId: 'economy',
  },
];

export interface DocumentationGuide {
  id: string;
  title: string;
  category: string;
  description: string;
  keywords: string[];
  sections: { title: string; body: string[]; steps?: string[] }[];
}

export const documentationGuides: DocumentationGuide[] = [
  {
    id: 'quick-start',
    title: 'Your first server, step by step',
    category: 'Getting started',
    description:
      'Invite, sign in, choose a server, and check a real first workflow.',
    keywords: [
      'login',
      'OAuth',
      'invite',
      'administrator',
      'setup',
      'preset',
      'permissions',
      'test',
    ],
    sections: [
      {
        title: 'Start with the right account',
        body: [
          'Sign in with Discord using the account that owns the server or has Administrator. Manage Server alone does not grant Sparko management access by default. Deliberately delegated staff can use only their granted capabilities.',
        ],
        steps: [
          'Use Add to Discord to install the configured application.',
          'Open the dashboard and sign in with Discord.',
          'Choose a manageable server. If the bot is missing, complete installation first.',
        ],
      },
      {
        title: 'Choose the first outcome',
        body: [
          'Setup previews the settings it would change. A preset does not secretly post messages, create channels, assign roles, or punish members. Optional modules remain off until configured.',
        ],
        steps: [
          'Open server setup and choose a goal.',
          'Select real channels and roles, then review prerequisites and the proposed changes.',
          'Save the configuration and wait for the applied status.',
          'Send a harmless test. Explicitly publish or enable the finished module.',
        ],
      },
      {
        title: 'Check what happened',
        body: [
          'Saved means the backend stored your change. Applied means the runtime acknowledged that revision. Published means Discord delivery succeeded. If the bot is disconnected or a permission is missing, check the operation status before repeating the action.',
        ],
      },
    ],
  },
  {
    id: 'tickets',
    title: 'Publish a ticket panel',
    category: 'Support',
    description:
      'Configure private support, publish the entry point, and verify a ticket record.',
    keywords: [
      'ticket',
      'panel',
      'claim',
      'category',
      'staff',
      'transcript',
      'close',
      'open limit',
    ],
    sections: [
      {
        title: 'Configure access before publication',
        body: [
          'Select the ticket destination and staff roles. Check that the selected strategy can create private resources with the intended channel overwrites. Configure the open-ticket limit and transcript requirement.',
        ],
        steps: [
          'Open Support → Tickets in the selected server.',
          'Choose category, destination, staff roles, and member limits.',
          'Review and save the settings, then check the applied revision.',
        ],
      },
      {
        title: 'Test the complete journey',
        body: [
          'An entry panel is a versioned design. Saving settings does not post the panel. Publication is a separate operation with its own delivery status.',
        ],
        steps: [
          'Preview the design and resolve validation errors.',
          'Publish to a permitted Discord channel.',
          'Open the ticket through its Discord control.',
          'Verify that the dashboard shows the persisted ticket and its current state.',
          'Have an authorized staff member claim and close the test ticket.',
        ],
      },
      {
        title: 'Capture and cleanup',
        body: [
          'A required transcript must be captured before destructive cleanup. If capture fails or required history is unavailable, retain the ticket resource and follow the recovery status. A transcript records observed or retrieved history; deleted content that was never observed cannot be reconstructed.',
          'Transcript downloads recheck current access. Keep private assets out of public static hosting.',
        ],
      },
    ],
  },
  {
    id: 'message-studio',
    title: 'Design, validate, and publish a message',
    category: 'Messages',
    description:
      'Understand the two Discord output modes and the draft-to-publication lifecycle.',
    keywords: [
      'Components V2',
      'embed',
      'tokens',
      'template',
      'media',
      'animation',
      'custom_id',
      'versions',
      'replace',
    ],
    sections: [
      {
        title: 'Choose an output mode',
        body: [
          'Components V2 uses component content and the V2 flag. Traditional embed mode uses embeds and compatible legacy controls. V2 cannot include ordinary message content, embeds, polls, or stickers. A V2 message cannot have its flag removed later.',
          'The web preview uses the shared compiler, but Discord clients can differ in layout. Review validation and use a real test delivery before publication.',
        ],
      },
      {
        title: 'Keep actions deliberate',
        body: [
          'Save draft stores a design. Send test posts an explicitly labeled test. Publish creates the live publication. Update and archive operate on the tracked publication. Controls receive persisted server-issued identities; text typed into a design is not an authorization grant.',
        ],
        steps: [
          'Choose the mode and build the message blocks.',
          'Use only tokens supported by the selected event context.',
          'Inspect character and component budgets and the compiled output.',
          'Save a version, send a test, then publish to a verified destination.',
        ],
      },
      {
        title: 'Media and motion',
        body: [
          'Website animations are JSON assets played by a lifecycle-aware wrapper. Discord uses validated animated emoji, exported GIF, or static media equivalents. A website animation name is not a Discord emoji ID.',
          'Use alt text and a static fallback. Motion preferences and reduced motion should preserve every essential function.',
        ],
      },
    ],
  },
  {
    id: 'engagement',
    title: 'Set fair participation rules',
    category: 'Engagement',
    description:
      'XP, counting, crates, and giveaways need eligible events and clear identities.',
    keywords: [
      'XP',
      'levels',
      'crates',
      'counting',
      'cooldown',
      'giveaway',
      'draw',
      'claim',
      'rank',
      'reward roles',
    ],
    sections: [
      {
        title: 'Progression and roles',
        body: [
          'Choose eligible events, channel and role exclusions, cooldowns, and a deterministic progression curve. Replayed source events do not create another reward. Bots and webhooks are excluded from ordinary message progression.',
          'Reward roles require Manage Roles and a bot role above the target role. Choose whether rewards stack or only the highest eligible role is retained. Review reconciliation before a bulk change.',
        ],
      },
      {
        title: 'Claims and turns',
        body: [
          'Crate claims commit capacity, member uniqueness, and XP together. A zero-reward test is a preview, not a production claim.',
          'Counting advances only for an eligible real Discord turn. The dashboard can configure or request an authorized reset; it cannot impersonate member turns.',
        ],
      },
      {
        title: 'Giveaway rules',
        body: [
          'Publish eligibility, deadline, winner count, and the claim or reroll policy before entries begin. Timer completion, manual completion, and retry use one draw identity. Missing notification delivery does not itself justify a different winner.',
          'Unavailable eligibility evidence must be shown as unavailable rather than assumed to pass.',
        ],
      },
    ],
  },
  {
    id: 'community',
    title: 'Welcome members and offer roles',
    category: 'Community',
    description: 'Make joining useful while keeping access intentional.',
    keywords: [
      'welcome',
      'leave',
      'boost',
      'join',
      'roles',
      'verification',
      'DM',
      'exclusive group',
      'hierarchy',
    ],
    sections: [
      {
        title: 'Event coverage',
        body: [
          'Welcome and leave depend on real member events and their required intents. Confirm the Discord application settings before enabling them. DM delivery can be denied; that result does not mean a channel message also failed.',
        ],
      },
      {
        title: 'Safe role menus',
        body: [
          'Use non-privileged roles that Sparko can manage. Define exclusive groups, minimum and maximum choices, and required or blocked roles. Eligibility and hierarchy are rechecked when a member uses the control.',
          'Verification badges alone do not restrict channel access. Configure actual channel permissions and explain the limits of the challenge you choose.',
        ],
      },
    ],
  },
  {
    id: 'safety',
    title: 'Moderation with an audit trail',
    category: 'Safety',
    description:
      'Delegate carefully, review hierarchy, and simulate automated rules first.',
    keywords: [
      'warn',
      'timeout',
      'kick',
      'ban',
      'automod',
      'raid',
      'anti-nuke',
      'case',
      'observe',
      'exemption',
    ],
    sections: [
      {
        title: 'Authority and cases',
        body: [
          'Moderation requires the configured capability plus current Discord authority and bot permissions. Server ownership and role hierarchy still constrain the target. Consequential actions retain the actor, reason, source, and delivery outcome.',
          'A failed DM does not reverse a successful moderation action. Retrying a notification must not create a second punishment.',
        ],
      },
      {
        title: 'Try a rule before a consequence',
        body: [
          'Use the same deterministic rule engine in simulator and observe modes. Review exclusions, escalation windows, and action budgets. Simulation never punishes a member.',
          'Audit attribution can be delayed or unknown. Protection is best effort and cannot faithfully recreate all deleted resources. Check the recorded evidence before acting.',
        ],
      },
    ],
  },
  {
    id: 'automation',
    title: 'Schedule with an explicit timezone',
    category: 'Messages',
    description:
      'Choose recurrence and recovery behavior before enabling repeated work.',
    keywords: [
      'schedule',
      'timezone',
      'DST',
      'misfire',
      'workflow',
      'sticky',
      'auto reply',
      'reminder',
      'cancel',
    ],
    sections: [
      {
        title: 'Dates and recurrence',
        body: [
          'Select an IANA timezone such as Asia/Ho_Chi_Minh. The service stores actual instants in UTC while preserving the local recurrence rule. Review daylight-saving and missed-run policy for supported schedules.',
          'Cancelling stops future effects. It does not undo a message already delivered. Check the run history when a request times out before creating a different schedule.',
        ],
      },
      {
        title: 'Bounded effects',
        body: [
          'Workflow actions are typed and allowlisted. A dry run shows planned effects without executing them. Actions, recursion, mentions, time, and fan-out have limits.',
          'Successful earlier steps are persisted so a retry can resume. Uploaded scripts and arbitrary runtime evaluation are not supported.',
        ],
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Read metrics with their coverage',
    category: 'Insights',
    description:
      'Understand no activity, disabled collection, and stale observations.',
    keywords: [
      'analytics',
      'metrics',
      'range',
      'freshness',
      'collection',
      'export',
      'voice',
      'status',
      'gap',
    ],
    sections: [
      {
        title: 'What a zero means',
        body: [
          'No activity means collection was enabled and no eligible activity was observed for the range. Not collected means the metric was not observed for that period. Unavailable means the service cannot currently establish the result.',
          'Check timezone, date range, source coverage, and freshness before comparing totals. Table views and exports should describe the same underlying aggregates.',
        ],
      },
      {
        title: 'Public data',
        body: [
          'Public status describes service observations, not private server activity. Opt-in widgets and leaderboards expose only allowed fields. Unsupported server counts, member counts, and uptime claims are omitted.',
        ],
      },
    ],
  },
  {
    id: 'economy',
    title: 'Configure a virtual economy',
    category: 'Engagement',
    description: 'Keep currency scope, stock, delivery, and escrow explicit.',
    keywords: [
      'balance',
      'ledger',
      'daily',
      'work',
      'shop',
      'inventory',
      'trade',
      'auction',
      'lottery',
      'escrow',
    ],
    sections: [
      {
        title: 'Start with the ledger',
        body: [
          'The default economy is guild-scoped. Currency uses integer units, declared sources and sinks, bounded rewards, and a reconciled backend ledger. Browser values cannot grant or spend currency without an authorized operation.',
          'Purchases and settlement need atomic balance and stock checks. If a role item is paid for but Discord delivery fails, use the recorded pending delivery or refund policy rather than charging again.',
        ],
      },
      {
        title: 'Escrow and games',
        body: [
          'Trades and auctions hold assets under explicit escrow ownership and settle once. Review expiry and cancellation rules before use.',
          'Virtual lottery is a separate opt-in feature with virtual-only entries and no cash redemption. Paid subscriptions do not share the virtual ledger.',
        ],
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Control your data and sessions',
    category: 'Account',
    description:
      'Review collection, request an export, and revoke connected sessions.',
    keywords: [
      'privacy',
      'export',
      'delete',
      'retention',
      'session',
      'logout',
      'support',
      'transcript',
      'AI',
    ],
    sections: [
      {
        title: 'Account and server boundaries',
        body: [
          'Account preferences and product-support conversations belong to the account. A guild administrator does not automatically receive access to product support.',
          'Server features can observe configured events and retain data necessary for their behavior. Transcripts, moderation evidence, and provider assistance have different scopes and retention requirements. Review enabled modules and the policy for the deployed service.',
        ],
      },
      {
        title: 'Export and deletion',
        body: [
          'Open account privacy to request your permitted data export or a deletion workflow. Server exports require server authority and privacy filtering. Retention and pending operations can affect when a deletion finishes.',
          'Use connected sessions to revoke access. Logging out revokes the current session and its scoped updates. Never send bot tokens or OAuth secrets to support.',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: "Why didn't this work?",
    category: 'Getting started',
    description:
      'Follow the saved, applied, and delivery states to the next useful action.',
    keywords: [
      'offline',
      'permission',
      'forbidden',
      'conflict',
      'stale',
      'failed',
      'pending',
      'intent',
      'provider',
      'retry',
    ],
    sections: [
      {
        title: 'Saved, but not applied',
        body: [
          'The backend has your configuration, but the runtime has not acknowledged it. Check the bot connection and operation status. Re-saving the same setting does not prove the bot applied it.',
        ],
      },
      {
        title: 'Design saved, publication failed',
        body: [
          'Check View Channel, Send Messages, the mode-specific permissions, and channel overwrites. Move the bot role above an affected role when the action requires role management. Use the existing operation’s safe retry when offered.',
        ],
      },
      {
        title: 'Settings changed elsewhere',
        body: [
          'A revision conflict means another editor saved a newer revision. Keep your local changes and review the current version. Do not overwrite or discard a draft automatically.',
        ],
      },
      {
        title: 'A module is unavailable',
        body: [
          'Configured enabled, owner allowed, plan entitled, prerequisites available, and runtime applied are separate checks. Connect the required provider or fix the displayed prerequisite. A visible menu item does not prove a module is operational.',
        ],
      },
    ],
  },
  {
    id: 'operators',
    title: 'Operator and deployment reference',
    category: 'Operators',
    description:
      'Use the repository runbooks for clean deployment and live verification.',
    keywords: [
      'API',
      'Docker',
      'deploy',
      'PostgreSQL',
      'Redis',
      'backup',
      'restore',
      'OAuth callback',
      'domain',
      'secrets',
    ],
    sections: [
      {
        title: 'Service boundaries',
        body: [
          'The web, Fastify API, Discord Gateway bot, and workers run as separate processes. PostgreSQL owns business records and durable operations. Redis queues can be reconstructed from durable state.',
          'Use the checked-in README and operational runbooks for the exact environment variables, migration, command registration, backup, restore verification, and health smoke commands.',
        ],
      },
      {
        title: 'Same-origin deployment',
        body: [
          'The initial canonical origin is https://panel.coin-sprite.com. Route /api/v1 to the API, /ws/events to the authenticated event stream, and public or authenticated pages to the web app. Keep private transcript and support assets behind authorized API routes.',
          'Register the exact Discord callback: https://panel.coin-sprite.com/api/v1/auth/discord/callback. Configure credentials through the operator environment, never in frontend build variables.',
        ],
      },
      {
        title: 'Verification boundaries',
        body: [
          'Local compiler, API, and worker tests do not prove live Discord delivery. Complete the authorized test-server journey, provider sandbox checks, and staging smoke steps with the configured credentials before claiming those results.',
        ],
      },
    ],
  },
];

export const publicFaqs = [
  {
    question: 'Which Discord permissions do I need?',
    answer:
      'The server owner or an Administrator can begin setup. Staff can receive explicit capabilities for individual tasks. Each module checks its own bot permissions, channel access, and role hierarchy.',
  },
  {
    question: 'Can I try a design before publishing it?',
    answer:
      'Yes. The website preview compiles a labeled example locally. In your server, Send test and Publish are separate actions with separate delivery outcomes.',
  },
  {
    question: 'Do I have to enable every module?',
    answer:
      'No. Start with a useful first workflow. Optional modules stay off until you configure and enable them, and each prerequisite is shown where it matters.',
  },
  {
    question: 'Can I use Components V2 and embeds?',
    answer:
      'You can choose either output mode for a design. They have separate validation rules. Switching a published Components V2 message to an embed requires a replacement message.',
  },
  {
    question: 'Are website animations supported inside Discord?',
    answer:
      'Website JSON animations use a web player. Discord uses validated animated emoji, supported exported GIFs, or static media equivalents instead.',
  },
  {
    question: 'What about pricing and unavailable features?',
    answer:
      'Feature and plan availability comes from the running service. Provider-dependent features remain unavailable until configured. Check the feature catalogue and your server’s capability checks before enabling them.',
  },
  {
    question: 'How can I export or remove my data?',
    answer:
      'Account privacy provides authorized export and deletion workflows. Server collection and retention depend on the enabled modules. The privacy page explains the boundaries, including transcripts and product support.',
  },
  {
    question: 'Where do I ask for help?',
    answer:
      'Start with the setup and troubleshooting guides. Signed-in users can open a private product-support request in their account. Product support is separate from tickets inside a Discord server.',
  },
];

export const setupSteps = [
  {
    title: 'Bring Sparko in',
    description: 'Install the configured Discord application in your server.',
  },
  {
    title: 'Pick your server',
    description: 'Sign in and choose a server you can manage.',
  },
  {
    title: 'Make it yours',
    description: 'Choose a goal, channels, roles, and a message design.',
  },
  {
    title: 'Test, then enable',
    description: 'Check permissions and real delivery before going live.',
  },
];
