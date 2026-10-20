import type {
  ARLogEntry,
  AutoRoles,
  BdEntry,
  Poll,
  PollDraft,
  PollLogEntry,
  PollVoter,
  Polls,
  BdKind,
  BdLogEntry,
  Birthdays,
  InvCode,
  InvJoinType,
  InvKind,
  InvLogEntry,
  Invites,
  EvDetails,
  EvEvent,
  EvKind,
  EvLogEntry,
  EvRsvp,
  Events,
  TempVoice,
  TvLogEntry,
  TvPrefs,
  TvRoom,
  GreetKind,
  QaLogEntry,
  QaQuestion,
  Questions,
  ReactionRole,
  SbBlocked,
  SbEntry,
  SbLogEntry,
  SgLogEntry,
  SgSuggestion,
  Starboard,
  Suggestions,
  WelcomeConfig,
} from './studio-format';

/**
 * What the dashboard reads and writes. The sample source (mock.ts) and,
 * later, the real backend both provide this same interface.
 */
export type Plan = 'free' | 'plus';

export type Session = {
  user: {
    id: string;
    name: string;
    avatarColor: 1 | 2 | 3 | 4 | 5 | 6;
    /** The Discord avatar, when signed in for real. */
    avatarUrl?: string;
  };
  /** Whether they may use the dashboard yet (before it opens to everyone). */
  allowed?: boolean;
};

export type Server = {
  id: string;
  name: string;
  /** Tint for the server's initials when it has no icon. */
  hue: number;
  /** The server's Discord icon, when it has one. */
  icon?: string;
  members: number;
  plan: Plan;
  /** Sparko is in the server. Servers without it can only be added. */
  installed: boolean;
  /** Set when Sparko staff paused the server. */
  paused?: { reason: string; reference: string };
};

export type StepStatus = 'done' | 'skipped' | 'todo';
export type SetupStep = {
  id: string;
  title: string;
  meta: string;
  description: string;
  status: StepStatus;
  /** The module the step's button opens. */
  moduleId?: string;
  action?: string;
  needsPermission?: boolean;
};

export type ModuleHealth = 'live' | 'off' | 'needs-fix';
export type Overview = {
  server: Server;
  on: Record<string, boolean>;
  steps: SetupStep[];
  health: {
    /** -1 when the bot hasn't reported in for a while. */
    latencyMs: number;
    checkedAt: string;
    missingPermission: { name: string; affects: string } | null;
    commandsSynced: number;
    templates: { used: number; limit: number };
    storageMb: { used: number; limit: number };
  };
  highlights: { moduleId: string; status: ModuleHealth; note: string }[];
  activity: {
    who: string;
    what: string;
    detail: string;
    when: string;
    icon: string;
  }[];
};

export type Channel = {
  id: string;
  name: string;
  category: string;
  /** False when Sparko lacks permission to post there. */
  canPost: boolean;
};
export type Version<T> = {
  id: string;
  title: string;
  who: string;
  whoColor: 1 | 2 | 3 | 4 | 5 | 6;
  when: string;
  config: T;
};
export type GreetLogEntry = {
  id: string;
  kind: GreetKind;
  ok: boolean;
  /** The template's name when it was sent. */
  template: string;
  /** Where it went; null for a direct message. */
  channelId: string | null;
  memberId: string;
  memberName: string;
  reason: string;
  at: number;
};

export type WelcomeState = {
  on: boolean;
  config: WelcomeConfig;
  channels: Channel[];
  /** What was sent, newest first. */
  log: GreetLogEntry[];
};

/** A module without its own page yet: just on or off. */
export type ModuleState = { on: boolean };

export type ApplyResult =
  | { status: 'live' }
  | { status: 'error'; message: string };

/** A role as pickers show it. */
export type RoleOption = {
  id: string;
  name: string;
  color: string | null;
  /** The second colour of a gradient role. */
  color2?: string | null;
  /** False when it's above Sparko's own role, so Sparko can't give it. */
  assignable?: boolean;
};

export type RRTemplate = {
  id: string;
  name: string;
  meta: string;
  config: ReactionRole;
};
export type RRLogEntry = {
  id: string;
  action: 'added' | 'removed' | 'refused' | 'failed';
  template: string;
  userId: string;
  userName: string;
  roleId: string;
  reason: string;
  at: number;
};
export type RRState = {
  templates: RRTemplate[];
  limit: number;
  channels: Channel[];
  roles: RoleOption[];
  log: RRLogEntry[];
};

export type ARState = {
  on: boolean;
  config: AutoRoles;
  limits: {
    timed: number;
    rules: number;
    conditions: number;
    joinRoles: number;
  };
  roles: RoleOption[];
  log: ARLogEntry[];
};
/** One member's saved automatic role data, as Storage shows it. */
export type ARMemberView = {
  userId: string;
  name: string;
  inServer: boolean;
  servedMs: number;
  boosts: number;
  boostingSince: number | null;
  given: string[];
  updatedAt: number;
};

export interface PanelApi {
  getAutoRoles(serverId: string): Promise<ARState>;
  saveAutoRoles(
    serverId: string,
    change: { on: boolean; config: AutoRoles },
  ): Promise<void>;
  searchARMembers(serverId: string, query: string): Promise<ARMemberView[]>;
  editARMember(
    serverId: string,
    userId: string,
    edit: { servedMs?: number; boosts?: number },
  ): Promise<ARMemberView>;
  wipeARMember(serverId: string, userId: string): Promise<ARMemberView | null>;
  getReactionRoles(serverId: string): Promise<RRState>;
  addReactionRole(serverId: string, name: string): Promise<{ id: string }>;
  saveReactionRole(
    serverId: string,
    id: string,
    change: { name?: string; config?: ReactionRole },
  ): Promise<void>;
  cloneReactionRole(serverId: string, id: string): Promise<{ id: string }>;
  deleteReactionRole(serverId: string, id: string): Promise<void>;
  /** Null when signed out. */
  getSession(): Promise<Session | null>;
  signOut(): Promise<void>;
  listServers(): Promise<Server[]>;
  getOverview(serverId: string): Promise<Overview>;
  skipStep(serverId: string, stepId: string, skipped: boolean): Promise<void>;
  checkHealth(serverId: string): Promise<Overview['health']>;
  getModule(serverId: string, moduleId: string): Promise<ModuleState>;
  saveModule(
    serverId: string,
    moduleId: string,
    state: ModuleState,
  ): Promise<void>;
  getWelcome(serverId: string): Promise<WelcomeState>;
  saveWelcome(
    serverId: string,
    change: { on: boolean; config: WelcomeConfig },
  ): Promise<void>;
  /** Waits until a saved change reaches Discord, or says why it couldn't. */
  waitForApply(
    serverId: string,
    moduleId: string,
    options?: { retry?: boolean },
  ): Promise<ApplyResult>;
  /** Re-reads Sparko's server-wide permissions after the owner fixes them. */
  checkPermissions(serverId: string): Promise<boolean>;
  /** Re-reads Sparko's permissions in a channel after the owner fixes them. */
  checkChannel(serverId: string, channelId: string): Promise<boolean>;
}

export type TicketStatus = 'new' | 'claimed' | 'waiting' | 'closed';
export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
export type AvatarColor = 1 | 2 | 3 | 4 | 5 | 6;
export type Ticket = {
  number: number;
  topic: string;
  member: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** Staff member handling it; "You" is the signed-in user. */
  assignee: string | null;
  /** When the last message was sent, as shown to staff. */
  lastAt: string;
  lastBy: 'member' | 'staff';
  /** Minutes a member has been waiting for staff, when they are. */
  waitingMinutes: number;
  openedAt: string;
  closedBy?: string;
  closeReason?: string;
};
export type TicketMessage = {
  id: string;
  kind: 'opener' | 'message' | 'note';
  author: string;
  authorColor: AvatarColor;
  staff: boolean;
  text: string;
  at: string;
  file?: string;
};
export type Person = {
  name: string;
  color: AvatarColor;
  joined: string;
  account: string;
  roles: string;
  newAccount?: boolean;
};
export type TicketDetail = Ticket & {
  messages: TicketMessage[];
  people: { heading: string; person: Person }[];
};
export type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger';
export type TicketPanel = {
  channel: string;
  title: string;
  description: string;
  color: string;
  topics: { id: string; label: string; style: ButtonStyle; question: string }[];
  roles: string[];
  ping: boolean;
  onePerMember: boolean;
  autoClose: 'never' | '24h' | '48h' | '7d';
};
export type TicketsState = {
  on: boolean;
  panel: TicketPanel;
  channels: Channel[];
  /** Roles that can be staff; the panel stores their ids. */
  roles: { id: string; name: string }[];
  staff: { name: string; color: AvatarColor }[];
  versions: Version<TicketPanel>[];
};

export type LinkButton = { id: string; label: string; url: string };
export type GalleryImage = { id: string; url: string; description: string };
/**
 * Where a button, a menu or the gallery sits in a Components V2 message:
 * above or below the container, inside it after a line of the text (line
 * -1 is the top), or, for a button, beside a line.
 */
export type V2Slot =
  | { at: 'above' }
  | { at: 'below' }
  | { at: 'line'; line: number }
  | { at: 'beside'; line: number };
/** A placed item: a button or menu by its id, or "gallery". */
export type V2Place = { id: string; slot: V2Slot };
/**
 * A Components V2 message: one container with a colour bar, its text
 * ({separator} draws a divider), a thumbnail, an image gallery, and where
 * each button, menu and the gallery sits.
 */
export type StudioV2 = {
  accent: string;
  text: string;
  thumbnail: string;
  gallery: GalleryImage[];
  place: V2Place[];
  /** A random accent each time the message is sent. */
  shuffle?: boolean;
};

export type StudioMessage = {
  name: string;
  channel: string;
  /** "embed" is the classic message; "v2" uses Components V2 blocks. */
  layout: 'embed' | 'v2';
  /** The Components V2 layout. */
  v2: StudioV2;
  content: string;
  /** Up to 10 embeds, shown in this order. */
  embeds: StudioEmbed[];
  /** Buttons and menus under the message, in order. */
  components: StudioComponent[];
};
export type StudioAction =
  | {
      id: string;
      type: 'send';
      templates: string[];
      dm: boolean;
      ephemeral: boolean;
    }
  | { id: string; type: 'role'; mode: 'give' | 'take'; roles: string[] }
  | {
      id: string;
      type: 'suggestion';
      act: 'upvote' | 'downvote' | 'approve' | 'deny';
    };
export type ButtonColour = 'blurple' | 'grey' | 'green' | 'red';
export type StudioButton = {
  id: string;
  type: 'button';
  label: string;
  emoji: string;
  colour: ButtonColour;
  link: boolean;
  url: string;
  actions: StudioAction[];
  /** A suggestion's upvote or downvote button, placed among the others. */
  vote?: 'up' | 'down';
};
export type MenuOption = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  actions: StudioAction[];
};
export type StudioMenu = {
  id: string;
  type: 'menu';
  placeholder: string;
  multiple: boolean;
  options: MenuOption[];
};
export type StudioComponent = StudioButton | StudioMenu;
export type StudioEmbed = {
  id: string;
  author: string;
  authorIcon: string;
  authorUrl: string;
  title: string;
  description: string;
  color: string;
  /** A random colour each time the message is sent. */
  shuffle?: boolean;
  image: string;
  thumbnail: string;
  footer: string;
  footerIcon: string;
  timestamp: boolean;
  fields: { id: string; name: string; value: string; inline: boolean }[];
};
/** One of the server's own emojis. */
export type ServerEmoji = {
  id: string;
  name: string;
  animated: boolean;
  url: string;
};
export type StudioTemplate = {
  id: string;
  name: string;
  /** The folder it's in, or null at the top level. */
  folderId: string | null;
  /** Its place among the templates and folders beside it. */
  position: number;
  /** "Saved 5 min ago by Rhea". */
  meta: string;
  message: StudioMessage;
  /** Where else it's used, for the tags on its card. */
  usedIn?: {
    kind:
      | 'welcome'
      | 'reaction-role'
      | 'suggestion'
      | 'birthday'
      | 'question'
      | 'starboard'
      | 'poll'
      | 'invite'
      | 'event'
      | 'voice';
    where: string;
  }[];
};
export type StudioFolder = {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
};
export type LibraryMove = {
  kind: 'template' | 'folder';
  id: string;
  /** Where it goes: a folder, or null for the top level. */
  folderId: string | null;
  /** Its place among the other items already there. */
  index: number;
};
export type StudioState = {
  message: StudioMessage;
  channels: Channel[];
  templates: StudioTemplate[];
  folders: StudioFolder[];
  /** Roles a button can give or take; Discord's own bot roles are left out. */
  roles: RoleOption[];
  /** How many templates one "Send message" action can send on this plan. */
  sendLimit: number;
  templateLimit: number;
  folderLimit: number;
  versions: Version<StudioMessage>[];
};

export interface PanelApi {
  listTickets(serverId: string): Promise<Ticket[]>;
  getTicket(serverId: string, number: number): Promise<TicketDetail>;
  sendTicketMessage(
    serverId: string,
    number: number,
    message: { text: string; note: boolean },
  ): Promise<void>;
  updateTicket(
    serverId: string,
    number: number,
    change: { priority?: TicketPriority; assignee?: string | null },
  ): Promise<void>;
  closeTicket(
    serverId: string,
    number: number,
    close: { reason: string; detail: string; dm?: boolean },
  ): Promise<void>;
  reopenTicket(serverId: string, number: number): Promise<void>;
  getTickets(serverId: string): Promise<TicketsState>;
  saveTickets(
    serverId: string,
    change: { on: boolean; panel: TicketPanel },
  ): Promise<void>;
  getStudio(serverId: string): Promise<StudioState>;
  publishStudio(serverId: string, message: StudioMessage): Promise<void>;
  saveTemplate(
    serverId: string,
    template: { name: string; message: StudioMessage; folderId: string | null },
  ): Promise<{ id: string }>;
  updateTemplate(
    serverId: string,
    id: string,
    change: { name?: string; message?: StudioMessage },
  ): Promise<void>;
  cloneTemplate(serverId: string, id: string): Promise<void>;
  deleteTemplate(serverId: string, id: string): Promise<void>;
  addFolder(
    serverId: string,
    folder: { name: string; parentId: string | null },
  ): Promise<void>;
  renameFolder(serverId: string, id: string, name: string): Promise<void>;
  /** Deletes the folder and everything inside it. */
  deleteFolder(serverId: string, id: string): Promise<void>;
  moveLibraryItem(serverId: string, move: LibraryMove): Promise<void>;
  /** Posts the message in its channel as a new message. */
  postStudioTest(serverId: string, message: StudioMessage): Promise<void>;
  /** Turns a message Sparko already sent (by its link) into this one. */
  editStudioMessage(
    serverId: string,
    message: StudioMessage,
    link: string,
  ): Promise<void>;
  /** Uploads a picture (up to 5 MB) and returns a link Discord can load. */
  uploadImage(serverId: string, file: File): Promise<string>;
  listServerEmojis(serverId: string): Promise<ServerEmoji[]>;
}

export type SGStorage = {
  count: number;
  limit: number;
  /** Each suggestion uses this much of the server's storage. */
  perKb: number;
  usedKb: number;
  limitMb: number;
};
export type SGState = {
  on: boolean;
  config: Suggestions;
  limits: { statuses: number; actions: number; storageMb: number };
  storage: SGStorage;
  channels: Channel[];
  roles: RoleOption[];
  log: SgLogEntry[];
};

export interface PanelApi {
  getSuggestions(serverId: string): Promise<SGState>;
  saveSuggestions(
    serverId: string,
    change: { on: boolean; config: Suggestions },
  ): Promise<void>;
  listSuggestions(
    serverId: string,
    filter: { query: string; status: string },
  ): Promise<{ suggestions: SgSuggestion[]; storage: SGStorage }>;
  deleteSuggestion(serverId: string, number: number): Promise<void>;
  /** Posts a made-up suggestion in a channel, to see the message. */
  testSuggestion(serverId: string, channel: string): Promise<void>;
}

export type BDState = {
  on: boolean;
  config: Birthdays;
  /** How many birthdays members have saved. */
  count: number;
  channels: Channel[];
  roles: RoleOption[];
  log: BdLogEntry[];
};
/** A birthday with when it's next, for the Upcoming panel. */
export type BDUpcoming = BdEntry & {
  next: { year: number; month: number; day: number; days: number };
  age: number | null;
};
export type BDList = {
  birthdays: BdEntry[];
  upcoming: BDUpcoming[];
  count: number;
};
/** A server member found to add a birthday for. */
export type BDMemberFound = {
  userId: string;
  name: string;
  avatar: string;
  /** They already saved a birthday. */
  saved: boolean;
};
export type BDDate = {
  day: number;
  month: number;
  year: number | null;
  /** '' for the server's time zone. */
  timeZone: string;
};

export interface PanelApi {
  getBirthdays(serverId: string): Promise<BDState>;
  saveBirthdays(
    serverId: string,
    change: { on: boolean; config: Birthdays },
  ): Promise<void>;
  listBirthdays(serverId: string, query: string): Promise<BDList>;
  findBirthdayMembers(
    serverId: string,
    query: string,
  ): Promise<BDMemberFound[]>;
  /** Staff add or change a member's birthday. */
  setBirthday(serverId: string, userId: string, date: BDDate): Promise<BdEntry>;
  removeBirthday(serverId: string, userId: string): Promise<void>;
  /** Posts a made-up birthday message in a channel, to see it. */
  testBirthday(serverId: string, channel: string, kind: BdKind): Promise<void>;
}

export type QAStorage = SGStorage;
export type QAState = {
  on: boolean;
  config: Questions;
  limits: {
    categories: number;
    maxOpen: number;
    storageMb: number;
    perKb: number;
    questions: number;
  };
  storage: QAStorage;
  channels: Channel[];
  roles: RoleOption[];
  log: QaLogEntry[];
};

export interface PanelApi {
  getQuestions(serverId: string): Promise<QAState>;
  saveQuestions(
    serverId: string,
    change: { on: boolean; config: Questions },
  ): Promise<void>;
  listQuestions(
    serverId: string,
    filter: { query: string; status: string },
  ): Promise<{ questions: QaQuestion[]; storage: QAStorage }>;
  deleteQuestion(serverId: string, number: number): Promise<void>;
  /** Posts a made-up question or answer in a channel, to see the message. */
  testQuestion(
    serverId: string,
    channel: string,
    which: 'question' | 'answer',
  ): Promise<void>;
}

export type SBStorage = {
  count: number;
  limit: number;
  /** Each starred message uses this much of the server's storage. */
  perKb: number;
  usedKb: number;
  limitMb: number;
};
export type SBState = {
  on: boolean;
  config: Starboard;
  limits: { boards: number; emojis: number; storageMb: number };
  storage: SBStorage;
  channels: Channel[];
  roles: RoleOption[];
  log: SbLogEntry[];
  blocked: SbBlocked[];
};

export interface PanelApi {
  getStarboard(serverId: string): Promise<SBState>;
  saveStarboard(
    serverId: string,
    change: { on: boolean; config: Starboard },
  ): Promise<void>;
  listStarred(
    serverId: string,
    filter: { board: string; sort: 'stars' | 'newest'; query: string },
  ): Promise<{ entries: SbEntry[]; storage: SBStorage; blocked: SbBlocked[] }>;
  /** Takes a message off a board; its stars are forgotten. */
  removeStarred(
    serverId: string,
    entry: { boardId: string; messageId: string },
  ): Promise<void>;
  freezeStarred(
    serverId: string,
    entry: { boardId: string; messageId: string },
    frozen: boolean,
  ): Promise<void>;
  /** Keeps a message or a member off every board. */
  blockStarboard(
    serverId: string,
    target:
      | { kind: 'message'; id: string; channelId: string }
      | { kind: 'member'; id: string; name: string },
  ): Promise<void>;
  unblockStarboard(
    serverId: string,
    kind: SbBlocked['kind'],
    id: string,
  ): Promise<void>;
  /** Posts a made-up starred message in a channel, to see the post. */
  testStarboard(
    serverId: string,
    board: string,
    channel: string,
  ): Promise<void>;
}

export type PollsState = {
  on: boolean;
  config: Polls;
  limits: { options: number; active: number };
  /** Polls posted or waiting to be, toward the plan's limit. */
  open: number;
  channels: Channel[];
  roles: RoleOption[];
  log: PollLogEntry[];
};

export interface PanelApi {
  getPolls(serverId: string): Promise<PollsState>;
  savePolls(
    serverId: string,
    change: { on: boolean; config: Polls },
  ): Promise<void>;
  listPolls(serverId: string): Promise<{ polls: Poll[]; open: number }>;
  /** Saves a new poll; the bot posts it now or at its time. */
  createPoll(serverId: string, draft: PollDraft): Promise<{ poll: Poll }>;
  endPoll(serverId: string, id: number): Promise<void>;
  /** Picks one of a tie's options at random. */
  rerollPoll(
    serverId: string,
    id: number,
  ): Promise<{ picked: { label: string } }>;
  /** Posts a scheduled poll now. */
  postPollNow(serverId: string, id: number): Promise<void>;
  deletePoll(serverId: string, id: number): Promise<void>;
  pollVoters(
    serverId: string,
    id: number,
  ): Promise<{ anonymous: boolean; voters: PollVoter[] }>;
  /** Posts a made-up poll, or its results, in a channel. */
  testPoll(
    serverId: string,
    channel: string,
    kind: 'poll' | 'results',
  ): Promise<void>;
}

export type INVState = {
  on: boolean;
  config: Invites;
  limits: { rewards: number };
  /** How many inviters are on the leaderboard. */
  count: number;
  /** Sparko can see the server's invites (it needs Manage Server). */
  canSeeInvites: boolean;
  channels: Channel[];
  roles: RoleOption[];
  log: InvLogEntry[];
};
/** A row of the leaderboard; rank is null for members who only joined. */
export type INVRow = {
  rank: number | null;
  userId: string;
  name: string;
  avatar: string;
  regular: number;
  left: number;
  fake: number;
  bonus: number;
  total: number;
};
export type INVBoard = {
  rows: INVRow[];
  /** How many rows match, over every page. */
  total: number;
  count: number;
  page: number;
  pages: number;
};
/** One time someone joined, and who it counts for. */
export type INVJoin = {
  id: number;
  userId: string;
  userName: string;
  avatar: string;
  inviterId: string | null;
  inviterName: string;
  code: string;
  type: InvJoinType;
  fake: boolean;
  counted: boolean;
  joinedAt: number;
  leftAt: number | null;
};
/** A member's counts, who invited them, and who they invited. */
export type INVDetail = {
  member: Omit<INVRow, 'rank'>;
  invitedBy: INVJoin | null;
  invited: INVJoin[];
};
export type INVCodes = {
  codes: InvCode[];
  vanity: { code: string; uses: number } | null;
  syncedAt: number | null;
  canSeeInvites: boolean;
};
/** A server member found to give a bonus to. */
export type INVFound = {
  userId: string;
  name: string;
  avatar: string;
  total: number;
};

export interface PanelApi {
  getInvites(serverId: string): Promise<INVState>;
  saveInvites(
    serverId: string,
    change: { on: boolean; config: Invites },
  ): Promise<void>;
  inviteLeaderboard(
    serverId: string,
    query: string,
    page: number,
  ): Promise<INVBoard>;
  inviteMember(serverId: string, userId: string): Promise<INVDetail>;
  inviteCodes(serverId: string): Promise<INVCodes>;
  findInviteMembers(serverId: string, query: string): Promise<INVFound[]>;
  /** Staff add (or with a negative amount, take) bonus invites. */
  giveInviteBonus(
    serverId: string,
    userId: string,
    amount: number,
  ): Promise<INVDetail>;
  /** Resets one member's invites, or everyone's with null. */
  resetInvites(serverId: string, userId: string | null): Promise<void>;
  /** Posts a made-up join or leave message in a channel, to see it. */
  testInvite(serverId: string, channel: string, kind: InvKind): Promise<void>;
}

/** A voice or stage channel an event can happen in. */
export type VoiceChannel = {
  id: string;
  name: string;
  category: string;
  stage: boolean;
};
export type EVState = {
  on: boolean;
  config: Events;
  /** Events still to come or happening, and past ones kept. */
  upcoming: number;
  past: number;
  limits: { upcoming: number; reminders: number };
  /** Sparko has Manage Events, so it can add events to Discord's list. */
  canSync: boolean;
  channels: Channel[];
  voice: VoiceChannel[];
  roles: RoleOption[];
  log: EvLogEntry[];
};

export interface PanelApi {
  getEvents(serverId: string): Promise<EVState>;
  saveEvents(
    serverId: string,
    change: { on: boolean; config: Events },
  ): Promise<void>;
  listEvents(serverId: string, when: 'upcoming' | 'past'): Promise<EvEvent[]>;
  createEvent(serverId: string, details: EvDetails): Promise<EvEvent>;
  updateEvent(
    serverId: string,
    number: number,
    details: EvDetails,
  ): Promise<EvEvent>;
  cancelEvent(serverId: string, number: number): Promise<void>;
  deleteEvent(serverId: string, number: number): Promise<void>;
  listRsvps(serverId: string, number: number): Promise<EvRsvp[]>;
  /** Staff mark a Going member as not having come. */
  setNoShow(
    serverId: string,
    number: number,
    userId: string,
    noShow: boolean,
  ): Promise<void>;
  /** Posts a made-up event message in a channel, to see it. */
  testEvent(serverId: string, channel: string, kind: EvKind): Promise<void>;
}

/** A voice channel members can join to get a room. */
export type CategoryOption = { id: string; name: string };
export type TVState = {
  on: boolean;
  config: TempVoice;
  limits: { hubs: number; maxRooms: number; deleteAfter: number };
  /** The server's boost level, which caps the bitrate. */
  boostLevel: number;
  /** How many rooms are open, and how many members saved settings. */
  rooms: number;
  prefs: number;
  /** Where the panel is posted now, if it is. */
  panel: { channelId: string } | null;
  channels: Channel[];
  voice: VoiceChannel[];
  categories: CategoryOption[];
  roles: RoleOption[];
  log: TvLogEntry[];
};
export type TVPrefsList = { prefs: TvPrefs[]; count: number };

export interface PanelApi {
  getTempVoice(serverId: string): Promise<TVState>;
  saveTempVoice(
    serverId: string,
    change: { on: boolean; config: TempVoice },
  ): Promise<void>;
  /** Posts (or updates) the control panel with the saved settings. */
  postVoicePanel(serverId: string): Promise<ApplyResult>;
  listVoiceRooms(serverId: string): Promise<TvRoom[]>;
  /** Staff close a room: Sparko deletes it in Discord. */
  closeVoiceRoom(serverId: string, channelId: string): Promise<void>;
  listVoicePrefs(serverId: string, query: string): Promise<TVPrefsList>;
  resetVoicePrefs(serverId: string, userId: string): Promise<void>;
}
