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
  birthdays: {
    headline: 'Every birthday celebrated, at the right time.',
    points: [
      'Posts at your hour, in the server’s or each member’s time zone',
      'A birthday role for the day, a DM and a monthly list',
      '29 February is celebrated on the 28th in other years',
    ],
    how: [
      {
        icon: 'gift',
        title: 'Members save their birthday',
        body: '/birthday set takes the day, the month, and the year and time zone if they like, with time zones suggested as they type. The year is only used for their age. Limit how often it can change, and how new an account or member can be.',
      },
      {
        icon: 'party-popper',
        title: 'Sparko celebrates on the day',
        body: 'At the hour you pick, one post names everyone (or one post each), with a ping if you like. Sparko gives a birthday role for 24 hours, can DM them, and never posts twice in a year.',
      },
      {
        icon: 'calendar',
        title: 'Birthdays this month',
        body: 'On the 1st, a list of every birthday that month. Members can see upcoming birthdays and any month’s with commands.',
      },
      {
        icon: 'layers',
        title: 'Storage, logs and commands',
        body: 'Every birthday by month with an Upcoming panel, where staff add, change or remove them. Logs of everything that happened, and the commands renamed to suit your server.',
      },
    ],
    steps: [
      'Open Birthdays, switch it on and pick the birthday channel.',
      'Choose the hour, the time zone and a birthday role.',
      'In Edit, start each message from a default or make your own.',
      'Save. Sparko adds /birthday to your server.',
    ],
    commands: [
      '/birthday set',
      '/birthday remove',
      '/birthday view',
      '/birthday upcoming',
      '/birthday list',
    ],
    pairs: ['welcome', 'autoroles'],
  },
  questions: {
    headline: 'Questions asked once, answered in the open.',
    points: [
      'A thread on every question, with an Answer button for staff',
      'Answered threads close straight away or after a while',
      'Categories, “Me too” counts and a DM when it’s answered',
    ],
    how: [
      {
        icon: 'circle-help',
        title: 'Members ask',
        body: '/question ask opens a short form for a title and the details, with a category and up to 3 files. Choose who can ask, a blacklist role, a cooldown, how many open questions each member can have, and anonymous asking.',
      },
      {
        icon: 'message-square',
        title: 'Staff answer in a thread',
        body: 'Each question is posted with its own thread. Staff press Answer (or use /question answer); the answer goes in the thread and shows on the question with who wrote it. The asker can press Mark answered, and others press Me too.',
      },
      {
        icon: 'lock',
        title: 'Threads close on their own',
        body: 'Once answered, the thread closes straight away, after a time you pick, or stays open. Questions nobody answers can expire. Staff can close, reopen or delete any question.',
      },
      {
        icon: 'layers',
        title: 'Storage, logs and commands',
        body: 'Every question with its asker, category, status and answer. Logs of everything that happened, and the commands renamed to suit your server.',
      },
    ],
    steps: [
      'Open Questions & answers, switch it on and pick the questions channel.',
      'Choose who can ask and who answers, and add categories if you like.',
      'In Edit, start the question and answer messages from a default or make your own.',
      'Save. Sparko adds /question to your server.',
    ],
    commands: [
      '/question ask',
      '/question answer',
      '/question close',
      '/question reopen',
      '/question delete',
    ],
    pairs: ['suggestions', 'tickets'],
  },
  starboard: {
    headline: 'The best of your server, in one channel.',
    points: [
      'Several boards, each with its own emojis and threshold',
      'A count that updates as members star, without spamming edits',
      'Freeze posts and block messages or members',
    ],
    how: [
      {
        icon: 'star',
        title: 'Members star messages',
        body: 'React with any of a board’s emojis. Each member counts once, and you choose whether the author’s own star and bots’ stars count. Stars on the board post count too.',
      },
      {
        icon: 'trending-up',
        title: 'Boards and a hall of fame',
        body: 'Each board has its own channel, emojis, threshold and rules: watch every channel or only some, skip age-restricted ones, old or short messages, bots and blocked roles. A second board with a higher threshold makes a hall of fame.',
      },
      {
        icon: 'message-square',
        title: 'Posts that keep up',
        body: 'The post is your own Message Studio template with a Jump to message button. Its count updates within a couple of seconds, and it can come down when stars drop or the original is deleted.',
      },
      {
        icon: 'layers',
        title: 'Storage, logs and commands',
        body: 'Every starred message with its stars, to freeze, remove or block. Logs of posts, milestones and removals, and /starboard top, random and stats renamed to suit your server.',
      },
    ],
    steps: [
      'Open Starboard, switch it on and pick the highlights channel.',
      'Choose the star emojis, how many stars it takes and the rules.',
      'In Edit, start from a default post or make your own.',
      'Save. Sparko adds /starboard to your server.',
    ],
    commands: [
      '/starboard top',
      '/starboard random',
      '/starboard stats',
      '/starboard freeze',
      '/starboard block',
    ],
    pairs: ['studio', 'suggestions'],
  },
  polls: {
    headline: 'Ask the server, see the answers come in.',
    points: [
      'Vote with buttons or a menu, with live result bars',
      'Anonymous, multiple choice, hidden results and role-only votes',
      'Ends on time, at a vote count, or when staff say',
    ],
    how: [
      {
        icon: 'list-checks',
        title: 'Make a poll',
        body: 'Build one in the dashboard, or use /poll create for a quick form. Up to 25 options with emoji, posted now or scheduled for later, with an optional role ping.',
      },
      {
        icon: 'trending-up',
        title: 'Live results',
        body: 'The message shows a bar for each option and updates as votes come in. Hide the results until it ends if you’d rather not sway anyone.',
      },
      {
        icon: 'award',
        title: 'A clear ending',
        body: 'Polls end at their time, once enough members have voted, or when staff end them. The winner is shown, ties are shown as ties, and staff can reroll a tie.',
      },
      {
        icon: 'scroll-text',
        title: 'Voters, exports and logs',
        body: 'See who voted for what on public polls, export the votes as CSV, and look back at every poll made, ended or deleted.',
      },
    ],
    steps: [
      'Open Polls, switch it on and pick the default channel.',
      'Choose who can make polls and what new polls start with.',
      'In Edit, start the poll and results messages from a default or your own.',
      'Save, then make a poll in the Polls tab or with /poll create.',
    ],
    commands: ['/poll create', '/poll end', '/poll results', '/poll voters'],
    pairs: ['studio', 'suggestions'],
  },
  invites: {
    headline: 'See who invited whom, and thank your best inviters.',
    points: [
      'Knows which invite each member used, or the vanity link',
      'Leaves, fake accounts and bonuses counted the way you like',
      'Reward roles at the totals you pick, given and taken by Sparko',
    ],
    how: [
      {
        icon: 'link',
        title: 'Every join matched to its invite',
        body: 'Sparko keeps track of your server’s invites and how often each is used, so when someone joins it knows whose invite they used. Joins with the vanity link or through Discovery are labelled too.',
      },
      {
        icon: 'users',
        title: 'Fair counts',
        body: 'Each inviter has regular, left, fake and bonus invites. Choose whether leaves and fake accounts come off the total, how new an account has to be to count as fake, and whether members who rejoin count again.',
      },
      {
        icon: 'award',
        title: 'Reward roles',
        body: 'Give a role at 5 invites, another at 10, and keep them all or only the highest. Sparko takes them back if someone drops below, if you like. Free has 3 rewards; Plus has 25.',
      },
      {
        icon: 'scroll-text',
        title: 'Messages, storage and logs',
        body: 'Join and leave messages say who invited them, as templates you edit in Message Studio. Staff see the leaderboard, who invited anyone, the invite codes, and a log of every join, leave, reward and bonus.',
      },
    ],
    steps: [
      'Open Invite tracking and switch it on.',
      'Give Sparko’s role Manage Server, so it can see your invites.',
      'Pick the join message channel and add reward roles.',
      'Save. Sparko adds /invites to your server.',
    ],
    commands: [
      '/invites view',
      '/invites leaderboard',
      '/invites who',
      '/invites list',
      '/invites bonus',
      '/invites reset',
    ],
    pairs: ['welcome', 'autoroles'],
  },
  levels: {
    headline: 'Give members something to chat for.',
    points: [
      'XP for chatting and time in voice, with anti-spam cooldowns',
      'Reward roles, XP crates and boosts for roles and channels',
      'Rank cards, level-up messages and crates you design in Message Studio',
    ],
    how: [
      {
        icon: 'trending-up',
        title: 'XP and levels',
        body: 'Each message earns a random amount of XP once per cooldown, and voice earns XP every minute when someone else is in the channel. Write the XP each level needs as an equation like 5*x^2 + 40*x + 55, hover the chart to see any level, and leave out channels and roles that shouldn’t earn.',
      },
      {
        icon: 'award',
        title: 'Reward roles',
        body: 'Give a role at level 5, another at 10, and keep them all or only the highest. Sparko takes them back if staff lower someone’s XP, if you like. Free has 5 rewards; Plus has 50.',
      },
      {
        icon: 'gift',
        title: 'XP crates',
        body: 'Add your own crates, each with a picture, a name and how many members can claim it. Now and then a message drops one with an Open button, and the crate message updates to show who claimed it and how many claims are left.',
      },
      {
        icon: 'image',
        title: 'Rank cards and level-ups',
        body: 'The /rank card, the level-up message and the crate are templates you edit in Message Studio, with variables like {level}, {xp} and {progress.bar}. Announce level-ups where members chatted, in one channel or by DM.',
      },
    ],
    steps: [
      'Open Levels & XP and switch it on.',
      'Set how much XP chatting and voice give, and the equation for each level.',
      'Add reward roles, and turn on XP crates if you like.',
      'Save. Sparko adds /rank, /leaderboard and /xp to your server.',
    ],
    commands: ['/rank', '/leaderboard', '/xp give', '/xp set', '/xp reset'],
    pairs: ['studio', 'autoroles'],
  },
  events: {
    headline: 'Events people show up to.',
    points: [
      'Going, Maybe and Can’t go buttons with live counts',
      'Capacity with a waitlist that moves people up',
      'Reminders, a start ping and events that repeat',
    ],
    how: [
      {
        icon: 'calendar',
        title: 'Schedule in seconds',
        body: 'Build an event in the dashboard, or with /event create in Discord. Times are read the way people write them, like “tomorrow 7pm”, in your server’s time zone, and members see them in their own.',
      },
      {
        icon: 'users',
        title: 'Answers and a waitlist',
        body: 'Members answer with buttons under the event, which shows who’s going. Set a capacity and anyone after that joins a waitlist; when a spot opens, the next in line moves up and gets a DM.',
      },
      {
        icon: 'bell',
        title: 'Reminders and repeats',
        body: 'DM reminders before the start, a ping when it begins, and an attending role for the night. Weekly or monthly events post the next one as soon as one ends. Events can show in Discord’s own events list too.',
      },
      {
        icon: 'layers',
        title: 'Attendees, logs and commands',
        body: 'See who answered what, mark no-shows and export a CSV. Every message is a Message Studio template, every change is logged, and the commands can be renamed.',
      },
    ],
    steps: [
      'Open Events & RSVP, switch it on and pick the events channel.',
      'Choose the time zone, default reminders and answers.',
      'Schedule your first event in the Events tab.',
      'Save. Sparko adds /event to your server.',
    ],
    commands: [
      '/event create',
      '/event list',
      '/event info',
      '/event rsvp',
      '/event cancel',
      '/event remind',
    ],
    pairs: ['studio', 'role-menus'],
  },
  'temp-voice': {
    headline: 'A voice room for everyone who wants one.',
    points: [
      'Join a hub, press Create room or use /voice create',
      'A control panel with buttons to rename, lock, hide, trust and more',
      'Empty rooms are deleted, even ones left while Sparko was offline',
    ],
    how: [
      {
        icon: 'volume-2',
        title: 'Join to create',
        body: 'Members join a hub channel and Sparko makes their room in its category and moves them in. Pick the name, user limit, bitrate and whether rooms start locked or hidden, hub by hub (1 hub on Free, 10 on Plus).',
      },
      {
        icon: 'sliders-horizontal',
        title: 'The control panel',
        body: 'A message with buttons: rename, limit, lock, hide, trust, invite, kick, block, claim, transfer, region, bitrate and delete. Its text is a Message Studio template, and it can go in each new room’s chat too.',
      },
      {
        icon: 'terminal',
        title: '/voice commands',
        body: 'Every button is also a /voice command, renamed to suit your server. Only a room’s owner can change it; anyone can claim a room its owner left.',
      },
      {
        icon: 'layers',
        title: 'Storage, logs and memory',
        body: 'See every open room and close one, and reset what members saved. Sparko remembers each member’s name, limit, lock and lists for their next room, if you like.',
      },
    ],
    steps: [
      'Open Temporary voice, switch it on and add a hub.',
      'Pick the voice channel members join, and how rooms start.',
      'Pick a panel channel and its buttons, and its text in Edit.',
      'Save. Sparko posts the panel and adds /voice to your server.',
    ],
    commands: [
      '/voice create',
      '/voice lock',
      '/voice hide',
      '/voice trust',
      '/voice block',
      '/voice claim',
      '/voice transfer',
    ],
    pairs: ['studio', 'autoroles'],
  },
};

export const isReady = (id: string) => id in featureDetails;
