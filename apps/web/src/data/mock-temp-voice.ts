import type {
  CategoryOption,
  Channel,
  PanelApi,
  RoleOption,
  Server,
  Session,
  TVState,
  VoiceChannel,
} from './types';
import {
  tvDefault,
  tvIssue,
  tvLimits,
  tvNewHub,
  type TempVoice,
  type TvLogEntry,
  type TvPrefs,
  type TvRoom,
} from './studio-format';

type Helpers = {
  wait: <T>(value: T) => Promise<T>;
  copy: <T>(value: T) => T;
  server: (id: string) => Server;
  channels: (serverId: string) => Channel[];
  roles: (serverId: string) => RoleOption[];
  templates: (serverId: string) => Set<string>;
  isOn: (serverId: string) => boolean;
  setOn: (serverId: string, on: boolean) => void;
  you: () => Session['user'];
};

type Api = Pick<
  PanelApi,
  | 'getTempVoice'
  | 'saveTempVoice'
  | 'postVoicePanel'
  | 'listVoiceRooms'
  | 'closeVoiceRoom'
  | 'listVoicePrefs'
  | 'resetVoicePrefs'
>;

const M = 60_000;
const H = 60 * M;
const D = 24 * H;

/** The sample servers' categories and voice channels. */
const categories: CategoryOption[] = [
  { id: '8100000000000001', name: 'Voice' },
  { id: '8100000000000002', name: 'Gaming' },
  { id: '8100000000000003', name: 'Study rooms' },
];
const voice: VoiceChannel[] = [
  ['➕ Join to create', 'Voice'],
  ['➕ Duo room', 'Voice'],
  ['Lounge', 'Voice'],
  ['➕ Squad up', 'Gaming'],
  ['Game night', 'Gaming'],
  ['➕ Quiet study', 'Study rooms'],
  ['Music', 'No category'],
].map(([name, category], i) => ({
  id: `82000000000000${String(i).padStart(2, '0')}`,
  name: name!,
  category: category!,
  stage: false,
}));
const vc = (name: string) => voice.find((v) => v.name === name)!.id;
const cat = (name: string) => categories.find((c) => c.name === name)!.id;

/** Members of the sample servers who own rooms and saved settings. */
const people = [
  'rhea',
  'ayo',
  'mossy_bun',
  'kestrel',
  'tomoko',
  'jules',
  'pip',
  'marlowe',
  'sunny.d',
].map((name, i) => ({ id: `71${String(i).padStart(4, '0')}`, name }));
const who = (i: number) => people[i]!;

function sampleConfig(plus: boolean, channels: Channel[]): TempVoice {
  const c = tvDefault();
  const general = channels.find((x) => x.name === 'general')?.id ?? '';
  c.hubs = [{ ...tvNewHub('hub-main', vc('➕ Join to create')), bitrate: 96 }];
  c.panel.channel = general;
  c.deleteAfter = 10;
  if (plus) {
    c.hubs.push(
      {
        ...tvNewHub('hub-duo', vc('➕ Duo room')),
        name: '{user.name} & friend',
        limit: 2,
        bitrate: 128,
      },
      {
        ...tvNewHub('hub-squad', vc('➕ Squad up')),
        category: cat('Gaming'),
        name: 'Squad #{count}',
        limit: 5,
        bitrate: 96,
      },
      {
        ...tvNewHub('hub-study', vc('➕ Quiet study')),
        name: '📚 {user.name}’s desk',
        bitrate: 64,
        locked: true,
        chat: false,
      },
    );
    c.maxRooms = 2;
    c.panel.inRooms = true;
    c.panel.buttons = [...c.panel.buttons, 'region', 'bitrate'];
  }
  return c;
}

function sampleRooms(serverId: string, plus: boolean, now: number): TvRoom[] {
  const room = (
    n: number,
    owner: number,
    patch: Partial<TvRoom> = {},
  ): TvRoom => ({
    channelId: `83000000000000${String(n).padStart(2, '0')}`,
    guildId: serverId,
    ownerId: who(owner).id,
    ownerName: who(owner).name,
    hubId: 'hub-main',
    name: `${who(owner).name}’s room`,
    limit: 0,
    locked: false,
    hidden: false,
    chat: true,
    trusted: [],
    blocked: [],
    members: 1,
    state: 'open',
    emptySince: null,
    createdAt: now - (n + 1) * 23 * M,
    ...patch,
  });
  const list = [
    room(0, 0, { name: 'Movie night 🍿', members: 6, limit: 8 }),
    room(1, 1, { locked: true, members: 2, trusted: [who(2).id] }),
    room(2, 3, {
      hubId: '',
      name: 'Late night chat',
      state: 'waiting',
      members: 0,
      emptySince: now - 20_000,
      createdAt: now - 20_000,
    }),
  ];
  if (plus)
    list.push(
      room(3, 4, {
        hubId: 'hub-squad',
        name: 'Squad #4',
        limit: 5,
        members: 5,
      }),
      room(4, 5, {
        hubId: 'hub-study',
        name: '📚 jules’s desk',
        locked: true,
        hidden: true,
        chat: false,
        members: 1,
      }),
      room(5, 6, {
        hubId: 'hub-duo',
        name: 'pip & friend',
        limit: 2,
        members: 2,
      }),
    );
  return list;
}

function samplePrefs(plus: boolean, now: number): TvPrefs[] {
  const p = (i: number, patch: Partial<TvPrefs>): TvPrefs => ({
    userId: who(i).id,
    userName: who(i).name,
    name: '',
    limit: null,
    locked: false,
    trusted: [],
    blocked: [],
    updatedAt: now - (i + 1) * 7 * H,
    ...patch,
  });
  const list = [
    p(0, { name: 'Movie night 🍿', limit: 8 }),
    p(1, { locked: true, trusted: [who(2).id, who(3).id] }),
    p(3, { blocked: [who(8).id] }),
    p(7, { name: 'Marlowe’s jazz bar', limit: 4, locked: true }),
  ];
  if (plus)
    list.push(
      p(4, { limit: 5 }),
      p(5, { name: '📚 jules’s desk', locked: true }),
    );
  return list;
}

function sampleLog(rooms: TvRoom[], now: number): TvLogEntry[] {
  const [movie, locked] = rooms;
  let n = 20;
  const e = (
    action: TvLogEntry['action'],
    room: { channelId: string; name: string },
    by: { id: string; name: string },
    detail: string,
    ago: number,
  ): TvLogEntry => ({
    id: `v${n--}`,
    action,
    roomId: room.channelId,
    roomName: room.name,
    userId: by.id,
    userName: by.name,
    detail,
    at: now - ago,
  });
  const old = { channelId: '8300000000000099', name: 'kit’s room' };
  const sparko = { id: '0', name: 'Sparko' };
  return [
    e('locked', locked!, who(1), '', 12 * M),
    e('renamed', movie!, who(0), '“rhea’s room” → “Movie night 🍿”', 20 * M),
    e('limit', movie!, who(0), '8 people', 21 * M),
    e('created', movie!, who(0), 'joined the hub', 23 * M),
    e('created', locked!, who(1), 'joined the hub', 46 * M),
    e('deleted', old, sparko, 'it was empty', 2 * H),
    e('owner', old, who(6), 'they claimed it after the owner left', 3 * H),
    e('hidden', old, who(4), '', 4 * H),
    e('shown', old, who(4), '', 4 * H + 5 * M),
    e(
      'deleted',
      { channelId: '8300000000000098', name: 'Ranked grind' },
      who(1),
      'from the dashboard by @quinn.dev',
      D,
    ),
    e(
      'failed',
      { channelId: '', name: 'tomoko’s room' },
      who(4),
      'Sparko couldn’t make the room. Sparko needs Manage Channels, Manage Roles and Move Members for voice rooms. Check its role in Server Settings → Roles.',
      2 * D,
    ),
  ];
}

export function createTempVoiceMock(h: Helpers) {
  const state = new Map<
    string,
    { config: TempVoice; rooms: TvRoom[]; prefs: TvPrefs[]; log: TvLogEntry[] }
  >();
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const plus = h.server(serverId).plan === 'plus';
    const rooms = sampleRooms(serverId, plus, now);
    s = {
      config: sampleConfig(plus, h.channels(serverId)),
      rooms,
      prefs: samplePrefs(plus, now),
      log: sampleLog(rooms, now),
    };
    state.set(serverId, s);
    return s;
  };
  const guard = (serverId: string) => {
    if (h.server(serverId).paused)
      throw new Error('This server is paused by Sparko staff.');
  };
  const boostLevel = (serverId: string) =>
    h.server(serverId).plan === 'plus' ? 2 : 1;
  let nextLog = 100;

  const api: Api = {
    async getTempVoice(serverId) {
      const s = of(serverId);
      const server = h.server(serverId);
      return h.wait(
        h.copy<TVState>({
          on: h.isOn(serverId),
          config: s.config,
          limits: tvLimits(server.plan),
          boostLevel: boostLevel(serverId),
          rooms: s.rooms.length,
          prefs: s.prefs.length,
          panel: s.config.panel.channel
            ? { channelId: s.config.panel.channel }
            : null,
          channels: h.channels(serverId),
          voice,
          categories,
          roles: h.roles(serverId),
          log: s.log,
        }),
      );
    },
    async saveTempVoice(serverId, change) {
      guard(serverId);
      const issue = tvIssue(change.config, {
        plan: h.server(serverId).plan,
        templates: h.templates(serverId),
        voice: new Set(voice.map((v) => v.id)),
        categories: new Set(categories.map((c) => c.id)),
        channels: new Set(h.channels(serverId).map((c) => c.id)),
        roles: new Set(h.roles(serverId).map((r) => r.id)),
        boostLevel: boostLevel(serverId),
      });
      if (issue) throw new Error(issue.problem);
      of(serverId).config = h.copy(change.config);
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async postVoicePanel(serverId) {
      guard(serverId);
      const s = of(serverId);
      const c = h
        .channels(serverId)
        .find((x) => x.id === s.config.panel.channel);
      if (!h.isOn(serverId))
        throw new Error('Turn Temporary voice on and save first.');
      if (!c) throw new Error('Pick the panel’s channel and save first.');
      return h.wait(
        c.canPost
          ? { status: 'live' as const }
          : {
              status: 'error' as const,
              message: `Sparko can’t post the voice panel. Give it View Channel, Send Messages and Embed Links in #${c.name}.`,
            },
      );
    },
    async listVoiceRooms(serverId) {
      return h.wait(h.copy(of(serverId).rooms));
    },
    async closeVoiceRoom(serverId, channelId) {
      guard(serverId);
      const s = of(serverId);
      const room = s.rooms.find((r) => r.channelId === channelId);
      if (!room) throw new Error('That room was already deleted.');
      s.rooms = s.rooms.filter((r) => r !== room);
      s.log.unshift({
        id: `v${nextLog++}`,
        action: 'deleted',
        roomId: room.channelId,
        roomName: room.name,
        userId: h.you().id,
        userName: h.you().name,
        detail: `from the dashboard by @${h.you().name}`,
        at: Date.now(),
      });
      return h.wait(undefined);
    },
    async listVoicePrefs(serverId, query) {
      const s = of(serverId);
      const q = query.trim().toLowerCase();
      return h.wait(
        h.copy({
          prefs: s.prefs.filter(
            (p) =>
              !q ||
              p.userId === q ||
              p.userName.toLowerCase().includes(q) ||
              p.name.toLowerCase().includes(q),
          ),
          count: s.prefs.length,
        }),
      );
    },
    async resetVoicePrefs(serverId, userId) {
      guard(serverId);
      const s = of(serverId);
      if (!s.prefs.some((p) => p.userId === userId))
        throw new Error('Those settings were already reset.');
      s.prefs = s.prefs.filter((p) => p.userId !== userId);
      return h.wait(undefined);
    },
  };
  return {
    api,
    reset: () => state.clear(),
    /** The template the panel uses, for its tag in Message Studio. */
    uses: (serverId: string) => {
      const id = of(serverId).config.panel.message;
      return id ? [{ id, where: 'Temporary voice (control panel)' }] : [];
    },
  };
}
