/**
 * Every Sparko module, grouped as the dashboard sidebar groups them. The
 * public catalogue, the feature pages and (later) the dashboard read this list.
 */
export type ModuleGroup =
  | 'Support'
  | 'Messages'
  | 'Safety'
  | 'Community'
  | 'Engagement'
  | 'Automation'
  | 'Insights'
  | 'Server settings';

export type SparkoModule = {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** The first thing to do once the module is on. */
  firstStep: string;
  group: ModuleGroup;
  plus: boolean;
};

const table: [ModuleGroup, string[]][] = [
  [
    'Support',
    [
      'tickets|Tickets|ticket|Private help threads between members and your staff, with claiming, priority and transcripts.|Create a ticket panel',
      'forms|Forms & applications|file-text|Collect staff applications, event sign-ups or reports with a simple form.|Create a form',
      'staff-workflows|Staff workflows|list-checks|Checklists your staff follow for common jobs, like handling a report.|Create a checklist',
    ],
  ],
  [
    'Messages',
    [
      'studio|Message Studio|message-square-text|Build Discord messages and embeds visually, see them exactly as members will, then publish.|Create a message',
    ],
  ],
  [
    'Safety',
    [
      'cases|Moderation cases|gavel|Every warn, timeout, kick and ban, with who did it and why.|Open the case log',
      'automod|Auto moderation|shield|Rules that catch spam, invite links and banned words. Try them in the simulator before they go live.|Add a rule',
      'raid-guard|Raid guard|shield-alert|Slows joins and locks channels when lots of new accounts arrive at once.|Choose what happens in a raid',
      'anti-nuke|Anti-nuke|shield-check|Stops anyone, even admins, from deleting channels or roles in bulk.|Choose protected actions',
      'reports|Reports & appeals|flag|Members report messages and banned members appeal. Your staff review both here.|Set up reports',
      'verification|Verification|lock|New members confirm they’re a person before they can chat.|Set up verification',
    ],
  ],
  [
    'Community',
    [
      'welcome|Welcome messages|user-plus|Send a message when someone joins, leaves or boosts the server.|Write a welcome',
      'role-menus|Reaction roles|smile|Members give themselves roles with reactions, buttons or a menu.|Make a reaction role',
      'autoroles|Automatic roles|users|Give roles when members join, once they’ve stayed a while, or when they meet your rules.|Add a rule',
      'suggestions|Suggestions|message-square|Members suggest ideas, everyone votes, and staff mark them done.|Pick a suggestions channel',
      'questions|Questions & answers|circle-help|Members ask with /question; staff answer in a thread, and answered threads close on their own.|Pick a questions channel',
      'starboard|Starboard|star|Messages that get enough stars are reposted to a highlights channel.|Pick a highlights channel',
      'polls|Polls|activity|Quick polls with buttons and live results.|Create a poll',
      'events|Events & RSVP|calendar|Schedule events, collect RSVPs and remind people before they start.|Schedule an event',
      'birthdays|Birthdays|gift|Members save their birthday and Sparko celebrates on the day.|Pick a birthday channel',
      'temp-voice|Temporary voice channels|volume-2|Join a hub channel to get your own voice room, removed when it’s empty.|Choose a hub channel',
      'invites|Invite tracking|link|See who invited whom and reward your best inviters.|Start tracking invites',
    ],
  ],
  [
    'Engagement',
    [
      'levels|Levels & XP|trending-up|Members earn XP for chatting and level up over time.|Set XP rules',
      'crates|XP crates|gift|Surprise drops members open for bonus XP or items.|Create a crate',
      'reward-roles|Reward roles|award|Give a role when someone reaches a level.|Add a reward',
      'rank-cards|Rank cards|image|Design the card members see when they use /rank.|Design a card',
      'counting|Counting|hash|A channel where members count up together, one number at a time.|Pick a counting channel',
      'giveaways|Giveaways|party-popper|Run giveaways with entry rules and fair, random winners.|Start a giveaway',
      'seasons|Seasons|sun|Reset leaderboards on a schedule and reward the top members.|Plan a season',
      'achievements|Achievements|award|Badges members unlock for milestones.|Create an achievement',
      'economy|Virtual economy|layers|A server currency members earn and spend. It has no real-world value.|Name your currency',
      'rewards|Daily & work rewards|clock|Members claim coins once a day or with /work.|Set reward amounts',
      'shop|Shop & inventory|puzzle|Sell roles and items for server currency.|Add an item',
      'trades|Trades & auctions|arrow-up-down|Members swap items or auction them to each other.|Turn on trading',
      'collections|Collections|layers|Sets of items members collect for a bonus.|Create a collection',
      'games|Mini-games|zap|Trivia, word games and more, right in chat.|Pick games',
      'lottery|Virtual lottery|ticket|Members buy tickets with server currency and one wins the pot.|Start a lottery',
      'reputation|Reputation|heart|Members thank each other with +rep.|Turn on reputation',
    ],
  ],
  [
    'Automation',
    [
      'schedules|Scheduled messages|calendar|Post a message at a set time, once or on repeat.|Schedule a message',
      'replies|Auto replies|corner-down-left|Reply automatically when someone says a keyword.|Add a reply',
      'sticky|Sticky messages|flag|Keep one message at the bottom of a channel.|Add a sticky message',
      'workflows|Workflows|zap|When something happens, check a condition, then do something. Built visually, no code.|Build a workflow',
      'commands|Custom commands|terminal|Make your own slash commands with replies and actions.|Create a command',
      'reminders|Reminders|bell|Members set reminders and Sparko pings them on time.|Turn on reminders',
      'social|Social & RSS alerts|globe|Post when a YouTube video, Twitch stream, GitHub release or RSS item goes live.|Add an alert',
      'webhooks|External events|plug|Let other apps send events into Sparko with a webhook.|Create a webhook',
    ],
  ],
  [
    'Insights',
    [
      'analytics|Analytics|activity|Members, messages and module use over time.|Open analytics',
      'audit|Audit log|scroll-text|Who changed what in this dashboard, and when.|Open the audit log',
    ],
  ],
  [
    'Server settings',
    [
      'access|Dashboard access|lock|Choose which roles can manage which modules.|Add a role',
      'backups|Configuration backups|save|Snapshot your setup, compare versions and restore any of them.|Take a snapshot',
      'multi-server|Multi-server tools|server|Copy settings to your other servers, with a preview first.|Copy settings',
      'widgets|Public widgets|monitor|Show a live member count or leaderboard on your website.|Create a widget',
      'billing|Plan & billing|crown|Your plan, limits and payments.|See your plan',
      'music|Music|music|Play music in voice channels.|Pick a DJ role',
      'ai|AI assistance|sparkles|Draft messages and summarize tickets with AI. You review everything before it’s sent.|Turn on AI drafts',
    ],
  ],
];

export const groups = table.map(([group]) => group);
export const modules: SparkoModule[] = table.flatMap(([group, rows]) =>
  rows.map((row) => {
    const [id = '', label = '', icon = '', description = '', firstStep = ''] =
      row.split('|');
    return {
      id,
      label,
      icon,
      description,
      firstStep,
      group,
      plus: id === 'multi-server',
    };
  }),
);
export const freeModuleCount = modules.filter((m) => !m.plus).length;

export const groupMeta: Record<ModuleGroup, { icon: string; blurb: string }> = {
  Support: { icon: 'ticket', blurb: 'Tickets, forms and staff checklists.' },
  Messages: {
    icon: 'message-square-text',
    blurb: 'A visual builder for messages and embeds.',
  },
  Safety: {
    icon: 'shield',
    blurb: 'Moderation, AutoMod, raid and nuke protection.',
  },
  Community: {
    icon: 'users',
    blurb: 'Welcome, roles, polls, events and more.',
  },
  Engagement: {
    icon: 'trending-up',
    blurb: 'Levels, economy, giveaways and games.',
  },
  Automation: {
    icon: 'zap',
    blurb: 'Schedules, auto replies and no-code workflows.',
  },
  Insights: { icon: 'activity', blurb: 'Analytics and a full audit log.' },
  'Server settings': {
    icon: 'settings',
    blurb: 'Access, backups, widgets and billing.',
  },
};

export const moduleById = (id: string) => modules.find((m) => m.id === id);
