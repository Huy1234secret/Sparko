import type {
  ARLogEntry,
  AutoRoles,
  GreetKind,
  ReactionRole,
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
  | { id: string; type: 'role'; mode: 'give' | 'take'; roles: string[] };
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
  usedIn?: { kind: 'welcome' | 'reaction-role'; where: string }[];
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
