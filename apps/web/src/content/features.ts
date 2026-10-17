/**
 * What the public site says about each module that's finished in the
 * dashboard. Only modules listed here are "ready": the features catalogue
 * links to them, and every other module shows as coming soon.
 */
export type FeatureDetail = {
  headline: string;
  /** Three short reasons to use it, shown beside the hero. */
  points: string[];
  /** How it works, a few short sections. */
  how: { icon: string; title: string; body: string }[];
  /** Setting it up, in order. */
  steps: string[];
  /** Slash commands members or staff use with it. */
  commands?: string[];
  /** Other ready modules that pair well with it. */
  pairs?: string[];
};

export const featureDetails: Record<string, FeatureDetail> = {
  welcome: {
    headline: 'Greet every member the way your server talks.',
    points: [
      'Separate messages for joins, leaves and boosts',
      'Send in a channel, by DM, or both',
      'A live preview with the member’s real name and picture filled in',
    ],
    how: [
      {
        icon: 'user-plus',
        title: 'Joins, leaves and boosts',
        body: 'Each has its own message, channel and switches. Turn on only the ones you want; the rest stay quiet.',
      },
      {
        icon: 'mail',
        title: 'Channel, DM or both',
        body: 'Post where everyone sees it, send it privately, or do both with the same message. Channel messages can delete themselves after a while.',
      },
      {
        icon: 'shield-check',
        title: 'Polite by default',
        body: 'People who rejoin aren’t greeted twice unless you want them to be, and servers with Rules Screening can wait until the rules are accepted.',
      },
      {
        icon: 'scroll-text',
        title: 'A log of every greeting',
        body: 'The Logs tab lists who was welcomed, said goodbye to or thanked for boosting, and whether the message went out.',
      },
    ],
    steps: [
      'Open Welcome messages and switch it on.',
      'Pick a channel, a DM, or both for the join message.',
      'Choose a message template, or write one in Message Studio.',
      'Check the live preview, then save. Sparko shows when it’s live.',
    ],
    pairs: ['studio', 'autoroles'],
  },
  studio: {
    headline: 'Build Discord messages you can see before you send.',
    points: [
      'A visual editor for text, embeds, buttons and menus',
      'Exactly the preview Discord shows, in dark and light',
      'Templates, saved versions and edit-after-publish',
    ],
    how: [
      {
        icon: 'square-pen',
        title: 'Text, embeds and containers',
        body: 'Write plain text, build an embed with author, title, fields, images and footer, or lay out a Components V2 container with sections and separators.',
      },
      {
        icon: 'eye',
        title: 'A true preview',
        body: 'The preview follows Discord’s own layout on desktop and phone, and checks links, colours and the 6,000-character embed limit before you publish.',
      },
      {
        icon: 'file-text',
        title: 'Templates everywhere',
        body: 'Save a message as a template and use it in Welcome, Tickets and Reaction roles. Free includes 10 templates; Plus includes 100.',
      },
      {
        icon: 'rotate-ccw',
        title: 'Versions and editing',
        body: 'Every publish is kept under Versions. Edit a published message and Sparko updates it in Discord, keeping its reactions and replies.',
      },
    ],
    steps: [
      'Open Message Studio and start from a blank message or a template.',
      'Add text, an embed or a container, and up to 5 link buttons.',
      'Fill in variables like {user} and {server} for personal messages.',
      'Pick a channel and publish, or save it as a template for later.',
    ],
    pairs: ['welcome', 'role-menus', 'tickets'],
  },
  'role-menus': {
    headline: 'Let members pick their own roles, cleanly.',
    points: [
      'Reactions, buttons or a dropdown menu',
      'Limits on how many roles each member can pick',
      'Optional replies when a role is claimed or removed',
    ],
    how: [
      {
        icon: 'smile',
        title: 'Three ways to pick',
        body: 'Members react with an emoji, press a button, or choose from a menu. Buttons come in Discord’s four colours; menu options can have an emoji and a description.',
      },
      {
        icon: 'sliders-horizontal',
        title: 'Rules for picking',
        body: 'Set how roles are given, and the most and fewest roles a member can hold from one menu, so colour or region roles stay one per person.',
      },
      {
        icon: 'message-square-text',
        title: 'Responses',
        body: 'Send a message when someone claims or removes a role, using a template, privately or in the channel.',
      },
      {
        icon: 'refresh-cw',
        title: 'Kept in sync',
        body: 'Saving posts the message or edits the one that’s there. Deleting the reaction role removes its message from Discord too.',
      },
    ],
    steps: [
      'Open Reaction roles and add a reaction role.',
      'Pick its message template and the channel it goes in.',
      'Choose reactions, buttons or a menu, and add a role to each option.',
      'Set any limits and responses, then save to post it.',
    ],
    pairs: ['autoroles', 'studio'],
  },
  tickets: {
    headline: 'Private help, without the messy channels.',
    points: [
      'A ticket panel with up to 5 buttons, each with its own opening question',
      'An inbox that puts people waiting longest first',
      'Claiming, priority, staff notes and transcripts',
    ],
    how: [
      {
        icon: 'inbox',
        title: 'One inbox for your team',
        body: 'Tickets sort into Needs a reply, Assigned to me, All open and Closed, with search. Members waiting over an hour and higher priorities come first.',
      },
      {
        icon: 'message-square',
        title: 'Every ticket in one place',
        body: 'Read and answer the thread, add staff-only notes, set priority, assign or take over, and close with a reason. Closed tickets can be reopened.',
      },
      {
        icon: 'layout-dashboard',
        title: 'Your panel, previewed',
        body: 'Design the panel message, its buttons and the question each one asks, and see the opener members will get before you post it.',
      },
      {
        icon: 'clock',
        title: 'Tidy on its own',
        body: 'Choose your staff roles and auto-close quiet tickets. Transcripts are kept 7 days on Free and 30 days on Plus.',
      },
    ],
    steps: [
      'Open Tickets, then Settings, and pick the panel’s channel.',
      'Write the panel message and add up to 5 buttons with their questions.',
      'Choose which roles are ticket staff.',
      'Post the panel. New tickets appear in the Inbox tab.',
    ],
    commands: ['/ticket open', '/ticket claim', '/ticket close'],
    pairs: ['studio', 'welcome'],
  },
  autoroles: {
    headline: 'Roles that give themselves out, at the right time.',
    points: [
      'Join roles, before or after members accept the rules',
      'Timed roles, from 1 minute to 2 years',
      'Rules based on account age, Discord badges and boosting',
    ],
    how: [
      {
        icon: 'user-plus',
        title: 'On join',
        body: 'Give roles the moment someone joins, or wait until they accept your rules if the server uses Rules Screening.',
      },
      {
        icon: 'timer',
        title: 'After a while',
        body: 'Give a role once someone has been in the server long enough, typed like 30m, 12h or 7d. Choose whether time restarts or carries over if they leave, and whether roles stack or swap.',
      },
      {
        icon: 'list-checks',
        title: 'When they meet your rules',
        body: 'Combine account age, Discord badges and boosting with AND or OR. Sparko can take the role back when someone no longer qualifies.',
      },
      {
        icon: 'scroll-text',
        title: 'Logs and member data',
        body: 'See every role met, lost, added or failed, with filters. Look up a member to edit their time in the server or counted boosts, or wipe their data.',
      },
    ],
    steps: [
      'Open Automatic roles and switch it on.',
      'Add a join role, a timed role or a rule.',
      'Pick the roles to give. Sparko warns about any it can’t give.',
      'Save. Sparko records current members and checks everyone every minute.',
    ],
    pairs: ['role-menus', 'welcome'],
  },
  suggestions: {
    headline: 'Ideas from members, decided in the open.',
    points: [
      'Vote with reactions, buttons or a menu',
      'Approved, Denied and your own statuses, each with a reason',
      'Optional staff review before anything is posted',
    ],
    how: [
      {
        icon: 'message-square',
        title: 'Members suggest',
        body: '/suggest opens a short form for a title and the idea, with up to 3 files. Choose who can suggest, a minimum account age, a cooldown, a pending limit and lengths up to 12,000 characters. Duplicates are turned away.',
      },
      {
        icon: 'trending-up',
        title: 'Everyone votes',
        body: 'Two fixed votes as reactions, buttons or a menu, with the ratio in the message. Allow or block changing votes and voting on your own idea, and open a discussion thread on each one.',
      },
      {
        icon: 'flag',
        title: 'Staff decide',
        body: 'Set a status with a command; Sparko asks for a reason and shows it under the suggestion with who set it. Statuses can close voting, DM the author or blacklist them. Approve, deny or close on their own after a number of votes or a time.',
      },
      {
        icon: 'layers',
        title: 'Storage, logs and commands',
        body: 'Every suggestion with its author, status, votes and reason, coloured by how it’s doing. Logs of everything that happened, and the commands renamed to suit your server.',
      },
    ],
    steps: [
      'Open Suggestions, switch it on and pick the suggestions channel.',
      'Choose who can suggest, approve and delete, and how members vote.',
      'In Edit, start from a default message or make your own.',
      'Save. Sparko adds the commands to your server.',
    ],
    commands: [
      '/suggest',
      '/suggestion-status',
      '/suggestion-approve',
      '/suggestion-deny',
      '/suggestion-delete',
    ],
    pairs: ['studio', 'role-menus'],
  },
};

export const isReady = (id: string) => id in featureDetails;
