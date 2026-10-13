import type { DiscordButton } from '../ui';
import { freeModuleCount, modules } from './modules';

/** The rotating previews in the home page hero. */
export type Scene = {
  key: string;
  label: string;
  channel: string;
  color: string;
  mention?: string;
  content?: string;
  user?: string;
  userText?: string;
  title: string;
  description: string;
  fields: [string, string][];
  footer: string;
  buttons: DiscordButton[];
  note: string;
};
export const scenes: Scene[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    channel: 'welcome',
    color: '#FACC15',
    mention: '@tomoko',
    content: 'just landed!',
    title: 'Welcome to Pixel Plaza',
    description:
      'You’re member #8,215. Read #rules, then say hi in #introductions.',
    fields: [
      ['Start here', '#rules'],
      ['Need help?', '#support'],
    ],
    footer: 'Welcome · Today at 18:42',
    buttons: [
      { label: 'Pick your roles', style: 'primary' },
      { label: 'Server guide' },
    ],
    note: 'Welcome · edited in plain language, previewed before it’s sent.',
  },
  {
    key: 'tickets',
    label: 'Tickets',
    channel: 'support',
    color: '#5865F2',
    user: 'kestrel',
    userText: 'I can’t see #events anymore?',
    title: 'Ticket #213 opened',
    description:
      'Thanks, kestrel. A staff member will reply here. Most tickets are answered within 15 minutes.',
    fields: [
      ['Priority', 'Normal'],
      ['Claimed by', 'Rhea'],
      ['Wait', '2 min'],
    ],
    footer: 'Tickets · transcript saved when closed',
    buttons: [
      { label: 'Claim', style: 'success' },
      { label: 'Close with reason', style: 'danger' },
    ],
    note: 'Tickets · claim, assign, set priority and keep transcripts.',
  },
  {
    key: 'automod',
    label: 'AutoMod',
    channel: 'mod-log',
    color: '#ED4245',
    title: 'Message removed in #general',
    description:
      'spammy_dan posted an invite link. Rule: Invite links (tested in the simulator on 2 Oct).',
    fields: [
      ['Action', 'Deleted · 10 min timeout'],
      ['Strike', '1 of 3'],
    ],
    footer: 'Auto moderation · Case #1043',
    buttons: [{ label: 'Undo' }, { label: 'Timeout 1 hour', style: 'danger' }],
    note: 'Auto moderation · every rule can be tested before it’s live.',
  },
  {
    key: 'levels',
    label: 'Levels',
    channel: 'general',
    color: '#57F287',
    mention: '@mossy_bun',
    content: 'levelled up!',
    title: 'Level 20 reached',
    description: 'mossy_bun earned the Regular role and 250 coins.',
    fields: [
      ['Rank', '#14 of 8,214'],
      ['Next level', '1,240 XP'],
    ],
    footer: 'Levels & XP · Reward roles',
    buttons: [{ label: 'View rank card', style: 'primary' }],
    note: 'Levels & XP · with reward roles and seasons.',
  },
];

export type Faq = { q: string; a: string };
export const homeFaq: Faq[] = [
  {
    q: 'Is Sparko really free?',
    a: 'Yes. Every module except multi-server tools is free, for as many servers as you like. Plus only raises limits like templates, storage and transcript history.',
  },
  {
    q: 'Does Sparko need Administrator?',
    a: 'Never. Sparko asks only for the permissions your modules use, and if one is missing it tells you exactly where to switch it on.',
  },
  {
    q: 'Can I undo a change?',
    a: 'Yes. Every save is kept as a version, and Configuration backups let you snapshot, compare and restore your whole setup.',
  },
  {
    q: 'Will I break something while setting up?',
    a: 'Unlikely. You see a live preview of every message, and Auto moderation rules can be tested in a simulator before they go live.',
  },
  {
    q: 'I already use another bot. Can I switch?',
    a: 'Yes. Turn on Sparko modules one at a time, and switch the same feature off in your old bot when you’re happy.',
  },
  {
    q: 'Is the virtual economy real money?',
    a: 'No. Server currency, items and the lottery have no real-world value and can’t be bought or cashed out.',
  },
];
export const billingFaq: Faq[] = [
  {
    q: 'How do I pay?',
    a: 'Plus is paid through PayPal. You can use a PayPal balance or a card through PayPal.',
  },
  {
    q: 'What happens after the US$1.49 first month?',
    a: 'Monthly Plus continues at US$3.99 a month. You can switch to every 6 months or yearly at any time.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time, from Plan & billing in your account. Plus stays on until the end of the period you paid for.',
  },
  {
    q: 'What happens to my data if I go back to Free?',
    a: 'Nothing is deleted straight away. Anything over the Free limits becomes read-only until you remove it or upgrade again.',
  },
];

export type Period = 'monthly' | 'semiannual' | 'annual';
/** Plus prices, matching the PayPal plans. PayPal charges what is set there. */
export const periods: Record<
  Period,
  {
    label: string;
    save?: string;
    price: string;
    unit: string;
    badge: string;
    note: string;
  }
> = {
  monthly: {
    label: 'Monthly',
    price: 'US$3.99',
    unit: '/ month',
    badge: 'First month US$1.49',
    note: 'Your first month is US$1.49, then US$3.99 a month.',
  },
  semiannual: {
    label: '6 months',
    save: 'Save 10%',
    price: 'US$21.55',
    unit: '/ 6 months',
    badge: 'Save 10%',
    note: 'About US$3.59 a month, billed every 6 months.',
  },
  annual: {
    label: 'Yearly',
    save: 'Save 25%',
    price: 'US$35.91',
    unit: '/ year',
    badge: 'Save 25%',
    note: 'About US$2.99 a month, billed once a year.',
  },
};

export const planLimits: [string, string, string][] = [
  [
    'Modules',
    `${freeModuleCount} of ${modules.length}`,
    `All ${modules.length}`,
  ],
  ['Multi-server tools', '—', 'Included'],
  ['Message templates', '10', '100'],
  ['Storage', '10 MB', '100 MB'],
  ['Steps per workflow', '10', '25'],
  ['Ticket transcripts kept', '7 days', '30 days'],
  ['Live previews, versions and backups', 'Included', 'Included'],
];
export const freeFeatures = [
  'All modules except multi-server tools',
  '10 message templates',
  '10 MB storage',
  '10 steps per workflow',
  'Ticket transcripts kept 7 days',
];
export const plusFeatures = [
  'Everything in Free',
  'Multi-server tools: copy settings with a preview',
  '100 message templates',
  '100 MB storage',
  '25 steps per workflow',
  'Ticket transcripts kept 30 days',
];
