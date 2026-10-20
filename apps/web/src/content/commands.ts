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
  '/poll create|Utility|Staff, and members if allowed|Make a poll. A form asks for the question, the options (one per line) and how long it runs.|/poll create multiple:True channel:#events|anonymous:Hide who voted for what (optional);multiple:Let members pick more than one (optional);channel:Where to post it (optional)',
  '/poll end|Utility|Staff, or whoever made the poll|End a poll now. Its message shows the final results and the winner.|/poll end id:4|id:The poll’s number',
  '/poll results|Utility|Everyone|See a poll’s results privately. Hidden results show once it ends.|/poll results id:4|id:The poll’s number',
  '/poll voters|Utility|Everyone|See who voted for what. Anonymous polls never say.|/poll voters id:4|id:The poll’s number',
  '/suggest|Utility|Everyone, unless limited|Suggest an idea. A form asks for a title and the details, then everyone votes.|/suggest file:mockup.png|file:A picture, video or file to add, up to 3 (optional)',
  '/suggestion-status|Utility|Staff who can approve|Give a suggestion any status. Sparko asks for a reason first.|/suggestion-status id:12 status:Planned|id:The suggestion’s number;status:One of the server’s statuses',
  '/suggestion-approve|Utility|Staff who can approve|Approve a suggestion, with a reason.|/suggestion-approve id:12|id:The suggestion’s number',
  '/suggestion-deny|Utility|Staff who can approve|Deny a suggestion, with a reason.|/suggestion-deny id:12|id:The suggestion’s number',
  '/suggestion-delete|Utility|Staff who can delete|Delete a suggestion, its message and its data.|/suggestion-delete id:12|id:The suggestion’s number',
  '/starboard top|Utility|Everyone|See the 10 most-starred messages, on one board or from one member.|/starboard top board:Hall of fame|board:Which board (optional);member:Only their messages (optional)',
  '/starboard random|Utility|Everyone|Pull up a random message from the board.|/starboard random|board:Which board (optional)',
  '/starboard stats|Utility|Everyone|See how many stars someone has received and given.|/starboard stats member:@mossy_bun|member:Whose stars (you by default)',
  '/starboard freeze|Utility|Starboard staff|Stop a post’s star count from changing, or let it change again.|/starboard freeze message:https://discord.com/channels/…|message:The message’s link or ID',
  '/starboard block|Utility|Starboard staff|Keep a message or a member off every board, or let them back.|/starboard block member:@spammy_dan|message:A message’s link or ID;member:A member to block or unblock',
  '/question ask|Utility|Everyone, unless limited|Ask the staff a question. A form asks for a title and the details; Sparko posts it with a thread for the answer.|/question ask category:Roles file:screenshot.png|category:What it’s about (optional);file:A picture, video or file to add, up to 3 (optional)',
  '/question answer|Utility|Staff who can answer|Answer a question. The answer goes in its thread and shows on the question.|/question answer id:12 text:Check #rules|id:The question’s number;text:Your answer',
  '/question close|Utility|Staff who can answer|Close a question without answering it, and lock its thread.|/question close id:12|id:The question’s number',
  '/question reopen|Utility|Staff who can answer|Reopen an answered, closed or expired question so it can be answered again.|/question reopen id:12|id:The question’s number',
  '/question delete|Utility|Staff who can answer|Delete a question, its message, thread and data.|/question delete id:12|id:The question’s number',
  '/giveaway start|Fun|Members with Manage Server|Start a giveaway with fair, random winners.|/giveaway start prize:Nitro Basic winners:1 ends:3d|prize:What people can win;winners:How many winners;ends:How long it runs',
  '/birthday set|Fun|Everyone, unless limited|Save your birthday so the server can celebrate. Staff can set someone else’s.|/birthday set day:14 month:March timezone:Europe/London|day:The day of the month;month:The month;year:The year you were born, for your age (optional, never shown);timezone:Your time zone, suggested as you type (optional);member:Staff: someone else (optional)',
  '/birthday remove|Fun|Everyone|Forget your birthday. Staff can remove someone else’s.|/birthday remove|member:Staff: someone else (optional)',
  '/birthday view|Fun|Everyone|See a member’s birthday, and how soon it is.|/birthday view member:@rhea|member:Whose birthday (you if left empty)',
  '/birthday upcoming|Fun|Everyone|The next 10 birthdays in the server.|/birthday upcoming|',
  '/birthday list|Fun|Everyone|Every birthday in a month.|/birthday list month:April|month:Which month',
  '/invites view|Utility|Everyone|See someone’s invites: regular, left, fake, bonus and the total.|/invites view member:@rhea|member:Whose invites (you if left empty)',
  '/invites leaderboard|Utility|Everyone|The server’s top inviters, 10 to a page.|/invites leaderboard page:2|page:Which page (optional)',
  '/invites who|Utility|Everyone|See who invited a member, with which invite.|/invites who member:@kit|member:Who to look up (you if left empty)',
  '/invites list|Utility|Everyone|The members someone invited, newest first.|/invites list member:@rhea|member:Whose invited members (you if left empty)',
  '/invites bonus|Utility|Staff who can manage invites|Add or take away bonus invites.|/invites bonus member:@rhea amount:5|member:Who gets the bonus;amount:Bonus invites; a negative number takes some away',
  '/invites reset|Utility|Staff who can manage invites|Reset a member’s invites, or everyone’s. Who invited whom is kept.|/invites reset member:@rhea|member:Whose invites to reset;everyone:Reset everyone’s instead (optional)',
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
