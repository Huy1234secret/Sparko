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

export type Delivery = 'channel' | 'dm' | 'both';
export type WelcomeConfig = {
  delivery: Delivery;
  channel: string;
  message: string;
  embed: boolean;
  title: string;
  color: string;
  ping: boolean;
  rejoin: boolean;
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
export type Template = { id: string; name: string; message: string };

export type WelcomeState = {
  on: boolean;
  config: WelcomeConfig;
  channels: Channel[];
  templates: Template[];
  templateLimit: number;
  versions: Version<WelcomeConfig>[];
};

/** A module without its own page yet: just on or off. */
export type ModuleState = { on: boolean };

export type ApplyResult =
  | { status: 'live' }
  | { status: 'error'; message: string };

export interface PanelApi {
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
/** One piece of a Components V2 message. */
export type V2Block =
  | { id: string; type: 'text'; content: string }
  | {
      id: string;
      type: 'section';
      content: string;
      accessory:
        | { type: 'thumbnail'; url: string }
        | { type: 'button'; label: string; url: string };
    }
  | {
      id: string;
      type: 'gallery';
      images: { id: string; url: string; description: string }[];
    }
  | {
      id: string;
      type: 'separator';
      divider: boolean;
      spacing: 'small' | 'large';
    }
  | { id: string; type: 'buttons'; buttons: LinkButton[] };

export type StudioMessage = {
  name: string;
  channel: string;
  /** "embed" is the classic message; "v2" uses Components V2 blocks. */
  layout: 'embed' | 'v2';
  /** The Components V2 layout: blocks, optionally in a coloured container. */
  v2: { container: boolean; accent: string; blocks: V2Block[] };
  content: string;
  /** Up to 10 embeds, shown in this order. */
  embeds: StudioEmbed[];
  buttons: { id: string; label: string; url: string }[];
};
export type StudioEmbed = {
  id: string;
  author: string;
  authorIcon: string;
  authorUrl: string;
  title: string;
  description: string;
  color: string;
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
  ): Promise<void>;
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
  /** Uploads a picture (up to 5 MB) and returns a link Discord can load. */
  uploadImage(serverId: string, file: File): Promise<string>;
  listServerEmojis(serverId: string): Promise<ServerEmoji[]>;
}
