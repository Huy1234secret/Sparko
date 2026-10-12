export type ModuleDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  group: string;
  resource?: string;
  effect?: string;
};
export const modules: ModuleDefinition[] = [
  {
    id: 'R09',
    slug: 'levels',
    name: 'Levels & XP',
    description:
      'Reward eligible Discord activity with persisted XP and clear cooldown rules.',
    group: 'engagement',
    resource: 'levels',
  },
  {
    id: 'R10',
    slug: 'crates',
    name: 'XP crates',
    description: 'Publish limited, weighted rewards with atomic member claims.',
    group: 'engagement',
    resource: 'crates',
  },
  {
    id: 'R11',
    slug: 'reward-roles',
    name: 'Reward roles',
    description:
      'Reconcile desired reward roles against member levels and hierarchy.',
    group: 'engagement',
  },
  {
    id: 'R12',
    slug: 'rank-cards',
    name: 'Rank cards',
    description:
      'Choose a readable rank card design and shared render settings.',
    group: 'engagement',
  },
  {
    id: 'R15',
    slug: 'counting',
    name: 'Counting',
    description:
      'Keep one persistent channel count with turn rules and milestone rewards.',
    group: 'engagement',
    resource: 'counting',
  },
  {
    id: 'R31',
    slug: 'giveaways',
    name: 'Giveaways',
    description:
      'Run qualified entries, one secure draw, and tracked winner claims.',
    group: 'engagement',
    resource: 'giveaways',
  },
  {
    id: 'R13',
    slug: 'seasons',
    name: 'Seasons',
    description:
      'Keep lifetime and seasonal progression separate with archived results.',
    group: 'engagement',
    resource: 'seasons',
  },
  {
    id: 'R14',
    slug: 'achievements',
    name: 'Achievements',
    description: 'Award declared milestones once per member and scope.',
    group: 'engagement',
    resource: 'achievements',
  },
  {
    id: 'R51',
    slug: 'economy',
    name: 'Virtual economy',
    description:
      'Manage a server-scoped balanced ledger, rewards, and audited transfers.',
    group: 'engagement',
  },
  {
    id: 'R52',
    slug: 'rewards',
    name: 'Daily & work rewards',
    description:
      'Pay bounded daily and work rewards with cooldowns, caps and role multipliers.',
    group: 'engagement',
  },
  {
    id: 'R53',
    slug: 'shop',
    name: 'Shop & inventory',
    description:
      'Offer items with stock, prices, eligibility, and real delivery state.',
    group: 'engagement',
    resource: 'shop',
  },
  {
    id: 'R54',
    slug: 'trades',
    name: 'Trades & auctions',
    description: 'Escrow assets and settle authorized offers once.',
    group: 'engagement',
    resource: 'auctions',
  },
  {
    id: 'R55',
    slug: 'collections',
    name: 'Collections',
    description: 'Define collectible rarity, recipes, and controlled rewards.',
    group: 'engagement',
    resource: 'collections',
  },
  {
    id: 'R56',
    slug: 'games',
    name: 'Mini-games',
    description:
      'Run bounded quizzes and community games with configured rewards.',
    group: 'engagement',
    resource: 'games/questions',
  },
  {
    id: 'R67',
    slug: 'lottery',
    name: 'Virtual lottery',
    description: 'Keep immutable draw rules and virtual-only entry settlement.',
    group: 'engagement',
    resource: 'lotteries',
  },
  {
    id: 'R68',
    slug: 'reputation',
    name: 'Reputation',
    description:
      'Recognize members with scoped commendations and anti-farming limits.',
    group: 'engagement',
  },
  {
    id: 'R19',
    slug: 'welcome',
    name: 'Welcome',
    description:
      'Greet joins through allowed channels and configured message designs.',
    group: 'community',
  },
  {
    id: 'R20',
    slug: 'leave-boost',
    name: 'Leave & boost',
    description: 'Configure separate observed leave and boost messages.',
    group: 'community',
  },
  {
    id: 'R16',
    slug: 'roles',
    name: 'Self-service roles',
    description:
      'Publish eligible role menus with hierarchy and selection checks.',
    group: 'community',
    resource: 'role-menus',
  },
  {
    id: 'R17',
    slug: 'autoroles',
    name: 'Automatic roles',
    description:
      'Grant roles from supported observed events with durable expiry.',
    group: 'community',
  },
  {
    id: 'R34',
    slug: 'suggestions',
    name: 'Suggestions',
    description:
      'Collect ideas, unique votes, staff decisions, and their history.',
    group: 'community',
    resource: 'suggestions',
  },
  {
    id: 'R35',
    slug: 'questions',
    name: 'Questions & answers',
    description: 'Give questions an authorized answer and clear resolution.',
    group: 'community',
    resource: 'questions',
  },
  {
    id: 'R36',
    slug: 'starboard',
    name: 'Starboard',
    description:
      'Mirror eligible unique reactions and retain message provenance.',
    group: 'community',
    resource: 'starboard',
  },
  {
    id: 'R33',
    slug: 'polls',
    name: 'Polls',
    description:
      'Configure choices, role eligibility, deadlines, and vote changes.',
    group: 'community',
    resource: 'polls',
  },
  {
    id: 'R37',
    slug: 'events',
    name: 'Events & RSVP',
    description:
      'Plan timezone-aware events with capacity, waitlist, and reminders.',
    group: 'community',
    resource: 'events',
  },
  {
    id: 'R38',
    slug: 'birthdays',
    name: 'Birthdays',
    description:
      'Respect opt-in dates, privacy, timezones, and leap-day policy.',
    group: 'community',
  },
  {
    id: 'R39',
    slug: 'voice',
    name: 'Temporary voice',
    description:
      'Create owner-controlled rooms and safely clean empty resources.',
    group: 'community',
    resource: 'voice-rooms',
  },
  {
    id: 'R40',
    slug: 'invites',
    name: 'Invite tracking',
    description:
      'Keep confirmed, ambiguous, and unknown join attribution distinct.',
    group: 'community',
    resource: 'invites',
  },
  {
    id: 'R25',
    slug: 'forms',
    name: 'Forms & applications',
    description: 'Publish versioned forms and review immutable submissions.',
    group: 'support',
    resource: 'forms',
  },
  {
    id: 'R23',
    slug: 'staff-workflows',
    name: 'Staff workflows',
    description: 'Configure routing, priority, availability, and escalation.',
    group: 'support',
  },
  {
    id: 'R26',
    slug: 'moderation',
    name: 'Moderation cases',
    description:
      'Track consequential actions with reasons, hierarchy checks, and expiry.',
    group: 'safety',
    resource: 'cases',
  },
  {
    id: 'R27',
    slug: 'automod',
    name: 'Auto moderation',
    description:
      'Test deterministic rules before enabling controlled runtime actions.',
    group: 'safety',
  },
  {
    id: 'R28',
    slug: 'raid-guard',
    name: 'Raid guard',
    description:
      'Observe configured join bursts, alert staff, and review incidents.',
    group: 'safety',
    resource: 'incidents',
  },
  {
    id: 'R29',
    slug: 'anti-nuke',
    name: 'Anti-nuke',
    description:
      'Use available event evidence and attribution confidence for protective responses.',
    group: 'safety',
  },
  {
    id: 'R30',
    slug: 'reports',
    name: 'Reports & appeals',
    description: 'Keep member intake and auditable reviewer decisions private.',
    group: 'safety',
    resource: 'reports',
  },
  {
    id: 'R18',
    slug: 'verification',
    name: 'Verification',
    description: 'Use configured rules acknowledgement and eligibility checks.',
    group: 'safety',
  },
  {
    id: 'R42',
    slug: 'schedules',
    name: 'Scheduled messages',
    description:
      'Schedule immutable messages with timezone and misfire policy.',
    group: 'automations',
    resource: 'schedules',
  },
  {
    id: 'R43',
    slug: 'replies',
    name: 'Auto replies',
    description: 'Match declarative rules with cooldowns and loop prevention.',
    group: 'automations',
    resource: 'replies',
  },
  {
    id: 'R44',
    slug: 'sticky',
    name: 'Sticky messages',
    description:
      'Debounce controlled reposts and track the current owned message.',
    group: 'automations',
    resource: 'sticky',
  },
  {
    id: 'R45',
    slug: 'workflows',
    name: 'Workflows',
    description:
      'Build typed trigger, condition, and action steps with durable history.',
    group: 'automations',
    resource: 'workflows',
  },
  {
    id: 'R46',
    slug: 'commands',
    name: 'Custom commands',
    description: 'Declare safe slash actions and track registration results.',
    group: 'automations',
    resource: 'custom-commands',
  },
  {
    id: 'R66',
    slug: 'reminders',
    name: 'Reminders',
    description:
      'Choose explicit personal or server destinations and cancellation rules.',
    group: 'automations',
    resource: 'reminders',
  },
  {
    id: 'R47',
    slug: 'social',
    name: 'Social & RSS alerts',
    description:
      'Connect supported sources with dedupe and provider rate budgets.',
    group: 'automations',
  },
  {
    id: 'R69',
    slug: 'webhooks',
    name: 'External events',
    description:
      'Verify narrow tenant-specific webhook schemas and replay controls.',
    group: 'automations',
    resource: 'webhooks',
  },
  {
    id: 'R49',
    slug: 'audit',
    name: 'Audit log',
    description:
      'Review authorized actor, scope, outcome, and correlation records.',
    group: 'insights',
    resource: 'audit',
  },
  {
    id: 'R50',
    slug: 'backups',
    name: 'Configuration backups',
    description:
      'Export protected configuration and preview resource remapping before restore.',
    group: 'settings',
  },
  {
    id: 'R61',
    slug: 'multi-server',
    name: 'Multi-server tools',
    description: 'Compare opted-in servers and review each authorized rollout.',
    group: 'settings',
  },
  {
    id: 'R70',
    slug: 'widgets',
    name: 'Public widgets',
    description:
      'Publish only opted-in safe aggregates and permitted profile fields.',
    group: 'settings',
  },
  {
    id: 'R60',
    slug: 'billing',
    name: 'Plan & billing',
    description: 'See the plan, its real limits and the subscription history.',
    group: 'settings',
    resource: 'billing',
  },
  {
    id: 'R64',
    slug: 'music',
    name: 'Music',
    description:
      'Configure permitted provider sources, voice requirements, and quotas.',
    group: 'settings',
  },
  {
    id: 'R65',
    slug: 'ai',
    name: 'AI assistance',
    description:
      'Opt in to bounded assistance with disclosed provider data use.',
    group: 'settings',
  },
];
export const groupNames: Record<string, string> = {
  engagement: 'Engagement',
  community: 'Community',
  support: 'Support workflows',
  safety: 'Safety',
  automations: 'Automation',
  insights: 'Insights',
  settings: 'Server settings',
};
