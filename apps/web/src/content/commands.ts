export type CommandCategory =
  | 'Moderation'
  | 'Tickets'
  | 'Levels'
  | 'Economy'
  | 'Utility'
  | 'Fun';
export type SlashCommand = {
  name: string;
  category: CommandCategory;
  who: string;
  description: string;
  example: string;
  options: { name: string; description: string }[];
};

const rows = [
  '/ban|Moderation|Members with Ban Members|Ban a member and log a case with the reason.|/ban user:@spammy_dan reason:Invite spam delete:1 day|user:Who to ban;reason:Saved to the case and the audit log;delete:How much of their recent history to remove',
  '/timeout|Moderation|Members with Moderate Members|Stop someone chatting for a while.|/timeout user:@kestrel duration:1h reason:Caps after a warning|user:Who to time out;duration:From 1 minute to 28 days;reason:Saved to the case',
  '/warn|Moderation|Members with Moderate Members|Give a warning that’s saved to their record.|/warn user:@duncan_r reason:Off-topic in #support|user:Who to warn;reason:They see this in a DM if you allow it',
  '/kick|Moderation|Members with Kick Members|Remove someone. They can rejoin with an invite.|/kick user:@pixelpaws reason:Alt account|user:Who to kick;reason:Saved to the case',
  '/case|Moderation|Members with Moderate Members|Look up, edit or close a case.|/case number:1042|number:The case number from the log',
  '/purge|Moderation|Members with Manage Messages|Delete recent messages in bulk.|/purge count:50 user:@spammy_dan|count:Up to 100 messages;user:Only delete this member’s messages',
  '/ticket open|Tickets|Everyone|Open a private ticket with your staff.|/ticket open topic:Can’t see #events|topic:A short title for your ticket',
  '/ticket claim|Tickets|Ticket staff|Take a ticket so others know you’re on it.|/ticket claim|',
  '/ticket close|Tickets|Ticket staff|Close a ticket with a reason. The transcript is saved.|/ticket close reason:Solved: added the Events role|reason:Shown to the member and saved with the transcript',
  '/rank|Levels|Everyone|Show your rank card.|/rank user:@mossy_bun|user:Someone else’s card (optional)',
  '/leaderboard|Levels|Everyone|See the most active members this season.|/leaderboard page:2|page:Which page of the leaderboard',
  '/xp give|Levels|Members with Manage Server|Add or remove XP by hand.|/xp give user:@tomoko amount:500|user:Who gets the XP;amount:Use a negative number to remove XP',
  '/balance|Economy|Everyone|See your wallet and bank.|/balance|',
  '/daily|Economy|Everyone|Claim your daily coins.|/daily|',
  '/work|Economy|Everyone|Earn coins, once every few hours.|/work|',
  '/shop|Economy|Everyone|Browse and buy items and roles.|/shop item:Neon name colour|item:Buy straight away (optional)',
  '/remind|Utility|Everyone|Get a ping later.|/remind in:2h text:Stream starts|in:When, like 10m, 2h or tomorrow 9am;text:What to remind you about',
  '/poll|Utility|Everyone, unless limited|Start a quick poll with buttons.|/poll question:Next jam theme? options:Space, Ocean, Forest|question:What you’re asking;options:Up to 10, separated by commas',
  '/suggest|Utility|Everyone, unless limited|Suggest an idea. A form asks for a title and the details, then everyone votes.|/suggest file:mockup.png|file:A picture, video or file to add, up to 3 (optional)',
  '/suggestion-status|Utility|Staff who can approve|Give a suggestion any status. Sparko asks for a reason first.|/suggestion-status id:12 status:Planned|id:The suggestion’s number;status:One of the server’s statuses',
  '/suggestion-approve|Utility|Staff who can approve|Approve a suggestion, with a reason.|/suggestion-approve id:12|id:The suggestion’s number',
  '/suggestion-deny|Utility|Staff who can approve|Deny a suggestion, with a reason.|/suggestion-deny id:12|id:The suggestion’s number',
  '/suggestion-delete|Utility|Staff who can delete|Delete a suggestion, its message and its data.|/suggestion-delete id:12|id:The suggestion’s number',
  '/giveaway start|Fun|Members with Manage Server|Start a giveaway with fair, random winners.|/giveaway start prize:Nitro Basic winners:1 ends:3d|prize:What people can win;winners:How many winners;ends:How long it runs',
  '/birthday set|Fun|Everyone, unless limited|Save your birthday so the server can celebrate. Staff can set someone else’s.|/birthday set day:14 month:March timezone:Europe/London|day:The day of the month;month:The month;year:The year you were born, for your age (optional, never shown);timezone:Your time zone, suggested as you type (optional);member:Staff: someone else (optional)',
  '/birthday remove|Fun|Everyone|Forget your birthday. Staff can remove someone else’s.|/birthday remove|member:Staff: someone else (optional)',
  '/birthday view|Fun|Everyone|See a member’s birthday, and how soon it is.|/birthday view member:@rhea|member:Whose birthday (you if left empty)',
  '/birthday upcoming|Fun|Everyone|The next 10 birthdays in the server.|/birthday upcoming|',
  '/birthday list|Fun|Everyone|Every birthday in a month.|/birthday list month:April|month:Which month',
  '/rep|Fun|Everyone|Thank someone with +rep.|/rep user:@rhea|user:Who to thank',
];

export const commandCategories: CommandCategory[] = [
  'Moderation',
  'Tickets',
  'Levels',
  'Economy',
  'Utility',
  'Fun',
];
export const commands: SlashCommand[] = rows.map((row) => {
  const [
    name = '',
    category,
    who = '',
    description = '',
    example = '',
    opts = '',
  ] = row.split('|');
  return {
    name,
    category: category as CommandCategory,
    who,
    description,
    example,
    options: opts
      .split(';')
      .filter(Boolean)
      .map((option) => {
        const at = option.indexOf(':');
        return { name: option.slice(0, at), description: option.slice(at + 1) };
      }),
  };
});
