import type {
  ApplyResult,
  Channel,
  ModuleState,
  Overview,
  PanelApi,
  Server,
  Session,
  SetupStep,
  Template,
  Version,
  WelcomeConfig,
  WelcomeState,
} from './types';
import { createSupportMock } from './mock-support';

/**
 * Sample data for building the dashboard before the backend is reconnected.
 * It behaves like the real service: short delays, saving then applying to
 * Discord, and a channel Sparko can't post in until the owner fixes it.
 * Changes last until the page is reloaded.
 */
let delayMs = 350;
/** Tests set this to 0. */
export function setMockDelay(ms: number) {
  delayMs = ms;
}
const wait = <T>(value: T, ms = delayMs) =>
  new Promise<T>((resolve) =>
    ms ? setTimeout(() => resolve(value), ms) : resolve(value),
  );
const copy = <T>(value: T): T => structuredClone(value);

const session: Session = {
  user: { id: '200000000000000001', name: 'quinn.dev', avatarColor: 2 },
};

const sampleServers: Server[] = [
  {
    id: '900000000000000001',
    name: 'Pixel Plaza',
    hue: 85,
    members: 8214,
    plan: 'free',
    installed: true,
  },
  {
    id: '900000000000000002',
    name: 'Cozy Corner Café',
    hue: 30,
    members: 1920,
    plan: 'plus',
    installed: true,
  },
  {
    id: '900000000000000003',
    name: 'Night Owls Gaming',
    hue: 260,
    members: 3407,
    plan: 'free',
    installed: true,
  },
  {
    id: '900000000000000004',
    name: 'Study Hall 24/7',
    hue: 150,
    members: 12880,
    plan: 'plus',
    installed: true,
    paused: {
      reason:
        'Welcome messages were used to send unsolicited invite links to new members. Sparko won’t send them until the review is finished. Your settings are kept.',
      reference: 'PA-20931',
    },
  },
  {
    id: '900000000000000005',
    name: 'Lumen Art Club',
    hue: 300,
    members: 412,
    plan: 'free',
    installed: false,
  },
  {
    id: '900000000000000006',
    name: 'Retro Arcade',
    hue: 200,
    members: 96,
    plan: 'free',
    installed: false,
  },
];
let servers = sampleServers;

const firstServerOn: Record<string, boolean> = {
  workflows: true,
  commands: true,
  social: true,
  'rank-cards': true,
  economy: true,
  polls: true,
  events: true,
  'role-menus': true,
  studio: true,
  'raid-guard': true,
  'anti-nuke': true,
  reports: true,
  verification: true,
  automod: true,
  cases: true,
  tickets: true,
  levels: true,
  autoroles: true,
  giveaways: true,
  welcome: false,
};

const channels: Channel[] = [
  ['mod-log', 'Staff'],
  ['ticket-logs', 'Staff'],
  ['welcome', 'Information'],
  ['rules', 'Information', false],
  ['announcements', 'Information'],
  ['arrivals', 'Community'],
  ['general', 'Community'],
  ['introductions', 'Community'],
  ['art-share', 'Community'],
  ['roles', 'Community'],
  ['support', 'Help'],
].map(([name, category, canPost = true], i) => ({
  id: `80000000000000${String(i).padStart(4, '0')}`,
  name: name as string,
  category: category as string,
  canPost: canPost as boolean,
}));

const defaultMessage =
  'Hey {user}, welcome to **{server}**! You’re member #{member_count}. Read #rules, then say hi in #introductions.';
const welcomeDefault = (server: Server): WelcomeConfig => ({
  delivery: 'channel',
  channel: channels[2]!.id,
  message: defaultMessage,
  embed: true,
  title: `Welcome to ${server.name}`,
  color: '#FACC15',
  ping: true,
  rejoin: false,
});

type ServerState = {
  on: Record<string, boolean>;
  skipped: Set<string>;
  welcome: WelcomeState;
  /** Channels Sparko can't post in yet, beyond the locked ones. */
  blockedChannels: Set<string>;
  permissionFixed: boolean;
};
const state = new Map<string, ServerState>();

function serverById(id: string) {
  const server = servers.find((s) => s.id === id && s.installed);
  if (!server) throw new Error('Server not found');
  return server;
}
function stateOf(serverId: string): ServerState {
  const server = serverById(serverId);
  let s = state.get(serverId);
  if (!s) {
    const config = welcomeDefault(server);
    const versions: Version<WelcomeConfig>[] = [
      {
        id: 'v4',
        title: 'Welcome turned off for the server move',
        who: 'You',
        whoColor: 2,
        when: 'Today, 09:12',
        config,
      },
      {
        id: 'v3',
        title: 'Added #introductions to the message',
        who: 'Ayo',
        whoColor: 3,
        when: '11 Oct, 21:40',
        config: {
          ...config,
          message:
            'Hey {user}, welcome to **{server}**! Say hi in #introductions.',
        },
      },
      {
        id: 'v2',
        title: 'Switched to an embed with a yellow bar',
        who: 'Rhea',
        whoColor: 5,
        when: '3 Oct, 16:05',
        config: {
          ...config,
          title: 'Hi there!',
          message: 'Welcome {user}! Check #rules first.',
        },
      },
      {
        id: 'v1',
        title: 'First version',
        who: 'You',
        whoColor: 2,
        when: '28 Sep, 12:30',
        config: {
          ...config,
          embed: false,
          message: 'Welcome to {server}, {user}!',
        },
      },
    ];
    const templates: Template[] = [
      { id: 't1', name: 'Default welcome', message: defaultMessage },
      {
        id: 't2',
        name: 'Weekend art jam',
        message:
          'Welcome {user}! Our weekend jam starts Saturday in #art-share.',
      },
      {
        id: 't3',
        name: 'Lunar New Year',
        message: 'Happy new year, {user}, and welcome to {server}!',
      },
      {
        id: 't4',
        name: 'Short and sweet',
        message: 'Hi {user} 👋 Glad you’re here.',
      },
    ];
    const isFirst = serverId === servers[0]!.id;
    s = {
      on: isFirst
        ? { ...firstServerOn }
        : {
            automod: true,
            cases: true,
            welcome: true,
            tickets: server.members > 2000,
            levels: true,
          },
      skipped: new Set(),
      welcome: {
        on: isFirst ? false : true,
        config,
        channels,
        templates,
        templateLimit: server.plan === 'plus' ? 100 : 10,
        versions,
      },
      // On the first server Sparko can't post in #welcome until it's fixed.
      blockedChannels: new Set(
        isFirst ? [channels[2]!.id, channels[4]!.id] : [],
      ),
      permissionFixed: !isFirst,
    };
    s.on['welcome'] = s.welcome.on;
    state.set(serverId, s);
  }
  return s;
}
const channelsFor = (s: ServerState) =>
  channels.map((c) => ({
    ...c,
    canPost: c.canPost && !s.blockedChannels.has(c.id),
  }));

function steps(server: Server, s: ServerState): SetupStep[] {
  const welcomeDone = s.welcome.on;
  const list: SetupStep[] = [
    {
      id: 'add',
      title: `Add Sparko to ${server.name}`,
      meta: '2 days ago',
      description: '',
      status: 'done',
    },
    {
      id: 'log',
      title: 'Choose a log channel',
      meta: '#mod-log',
      description: '',
      status: 'done',
    },
    {
      id: 'automod',
      title: 'Turn on Auto moderation',
      meta: 'Spam and invite links',
      description: '',
      status: 'done',
      moduleId: 'automod',
    },
    {
      id: 'welcome',
      title: 'Greet new members',
      meta: '1 min',
      description:
        'Sparko welcomes people in a channel you pick. You’ll see a preview before anything is sent.',
      status: welcomeDone ? 'done' : 'todo',
      moduleId: 'welcome',
      action: 'Set up Welcome',
    },
    {
      id: 'starter-role',
      title: 'Give members a starter role',
      meta: '1 min',
      description: s.permissionFixed
        ? 'Everyone who joins gets a role you pick, so they can see your channels.'
        : 'Sparko needs the Manage Roles permission before it can give roles.',
      status: 'todo',
      moduleId: 'autoroles',
      action: 'Set up Automatic roles',
      needsPermission: !s.permissionFixed,
    },
    {
      id: 'tickets',
      title: 'Post a ticket panel',
      meta: '2 min',
      description:
        'Members open a private ticket with one click. Your staff answer in a thread.',
      status: 'todo',
      moduleId: 'tickets',
      action: 'Set up Tickets',
    },
  ];
  return list.map((step) =>
    step.status === 'todo' && s.skipped.has(step.id)
      ? { ...step, status: 'skipped' }
      : step,
  );
}

function health(s: ServerState): Overview['health'] {
  return {
    latencyMs: 48,
    checkedAt: new Date().toISOString(),
    missingPermission: s.permissionFixed
      ? null
      : {
          name: 'Manage Roles',
          affects:
            'Automatic roles and Reward roles can’t give roles until Sparko has it.',
        },
    commandsSynced: 64,
    templates: {
      used: s.welcome.templates.length,
      limit: s.welcome.templateLimit,
    },
    storageMb: { used: 4.1, limit: s.welcome.templateLimit === 100 ? 100 : 10 },
  };
}

/**
 * Signed in for real, the list is the person's own servers, and module
 * pages show sample settings for them.
 */
export function adoptServers(list: Server[]) {
  servers = copy(list);
}

const coreApi = {
  getSession: () => wait<Session | null>(copy(session)),
  signOut: () => wait(undefined),
  listServers: () => wait(copy(servers)),
  async getOverview(serverId) {
    const server = serverById(serverId);
    const s = stateOf(serverId);
    const welcome = s.welcome.on
      ? channelsFor(s).find((c) => c.id === s.welcome.config.channel)
      : undefined;
    return wait<Overview>(
      copy({
        server,
        on: s.on,
        steps: steps(server, s),
        health: health(s),
        highlights: [
          {
            moduleId: 'automod',
            status: s.on['automod'] ? 'live' : 'off',
            note: 'Blocked 126 messages this week',
          },
          {
            moduleId: 'tickets',
            status: s.on['tickets'] ? 'live' : 'off',
            note: '3 open · 1 waiting over an hour',
          },
          {
            moduleId: 'levels',
            status: s.on['levels'] ? 'live' : 'off',
            note: 'mossy_bun reached level 20 today',
          },
          {
            moduleId: 'autoroles',
            status: !s.on['autoroles']
              ? 'off'
              : s.permissionFixed
                ? 'live'
                : 'needs-fix',
            note: s.permissionFixed
              ? 'Gives Member on join'
              : 'Can’t give roles: missing Manage Roles',
          },
          {
            moduleId: 'giveaways',
            status: s.on['giveaways'] ? 'live' : 'off',
            note: '1 running · ends Friday',
          },
          {
            moduleId: 'welcome',
            status: !s.welcome.on
              ? 'off'
              : welcome?.canPost
                ? 'live'
                : 'needs-fix',
            note: s.welcome.on
              ? `Greeting in #${welcome?.name ?? 'a channel'}`
              : 'Not set up yet',
          },
        ],
        activity: [
          {
            who: 'Ayo',
            what: 'turned on Giveaways',
            detail: 'Spring art giveaway · ends Friday',
            when: '12 min',
            icon: 'party-popper',
          },
          {
            who: 'AutoMod',
            what: 'removed a message from kestrel',
            detail: 'Invite link in #general',
            when: '25 min',
            icon: 'shield',
          },
          {
            who: 'Rhea',
            what: 'closed ticket #212',
            detail: '“Can’t see #events”. Solved: missing role',
            when: '1 h',
            icon: 'ticket',
          },
          {
            who: 'Sparko',
            what: 'applied 3 changes to Discord',
            detail: 'Levels & XP settings by Ayo',
            when: '2 h',
            icon: 'refresh-cw',
          },
          {
            who: 'mossy_bun',
            what: 'reached level 20',
            detail: 'Got the Regular role',
            when: '3 h',
            icon: 'trending-up',
          },
        ],
      }),
    );
  },
  async skipStep(serverId, stepId, skipped) {
    const s = stateOf(serverId);
    if (skipped) s.skipped.add(stepId);
    else s.skipped.delete(stepId);
    return wait(undefined);
  },
  checkHealth: (serverId) => wait(copy(health(stateOf(serverId))), delayMs * 2),
  getModule: (serverId, moduleId) =>
    wait<ModuleState>({ on: !!stateOf(serverId).on[moduleId] }),
  async saveModule(serverId, moduleId, next) {
    const s = stateOf(serverId);
    if (serverById(serverId).paused)
      throw new Error('This server is paused by Sparko staff.');
    s.on[moduleId] = next.on;
    return wait(undefined);
  },
  async getWelcome(serverId) {
    const s = stateOf(serverId);
    return wait(copy({ ...s.welcome, channels: channelsFor(s) }));
  },
  async saveWelcome(serverId, change) {
    const s = stateOf(serverId);
    if (serverById(serverId).paused)
      throw new Error('This server is paused by Sparko staff.');
    s.welcome.on = change.on;
    s.on['welcome'] = change.on;
    s.welcome.config = copy(change.config);
    s.welcome.versions.unshift({
      id: `v${Date.now()}`,
      title: change.on ? 'Updated the welcome message' : 'Turned Welcome off',
      who: 'You',
      whoColor: session.user.avatarColor,
      when: 'Just now',
      config: copy(change.config),
    });
    return wait(undefined);
  },
  async waitForApply(serverId, moduleId): Promise<ApplyResult> {
    const s = stateOf(serverId);
    const postsIn =
      moduleId === 'welcome'
        ? s.welcome.on && s.welcome.config.delivery !== 'dm'
          ? s.welcome.config.channel
          : undefined
        : postingChannel(serverId, moduleId);
    const blocked =
      postsIn !== undefined &&
      !channelsFor(s).find((c) => c.id === postsIn)?.canPost;
    return wait<ApplyResult>(
      blocked
        ? { status: 'error', message: 'Sparko can’t post in that channel yet.' }
        : { status: 'live' },
      delayMs * 2,
    );
  },
  async checkPermissions(serverId) {
    // In the sample, the owner has fixed it by the time they check again.
    stateOf(serverId).permissionFixed = true;
    return wait(true, delayMs * 2);
  },
  async checkChannel(serverId, channelId) {
    const s = stateOf(serverId);
    // In the sample, the owner has fixed it by the time they check again.
    s.blockedChannels.delete(channelId);
    return wait(true, delayMs * 2);
  },
} satisfies Partial<PanelApi>;

/** Resets the sample data; for tests. */
export function resetMock() {
  state.clear();
  servers = sampleServers;
  resetSupport();
}

const {
  api: supportApi,
  reset: resetSupport,
  postingChannel,
} = createSupportMock({
  wait: <T>(value: T, slow?: boolean) =>
    wait(value, slow ? delayMs * 2 : delayMs),
  copy,
  server: serverById,
  channels: (serverId) => channelsFor(stateOf(serverId)),
  you: () => session.user,
});
export const mockApi: PanelApi = { ...coreApi, ...supportApi };
