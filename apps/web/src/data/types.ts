/**
 * What the dashboard reads and writes. The sample source (mock.ts) and,
 * later, the real backend both provide this same interface.
 */
export type Plan = 'free' | 'plus';

export type Session = {
  user: { id: string; name: string; avatarColor: 1 | 2 | 3 | 4 | 5 | 6 };
};

export type Server = {
  id: string;
  name: string;
  /** Tint for the server's initials when it has no icon. */
  hue: number;
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
  getSession(): Promise<Session>;
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
  waitForApply(serverId: string, moduleId: string): Promise<ApplyResult>;
  /** Re-reads Sparko's server-wide permissions after the owner fixes them. */
  checkPermissions(serverId: string): Promise<boolean>;
  /** Re-reads Sparko's permissions in a channel after the owner fixes them. */
  checkChannel(serverId: string, channelId: string): Promise<boolean>;
}
