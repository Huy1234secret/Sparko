import type {
  Channel,
  LVBoard,
  LVCrate,
  LVDetail,
  LVFound,
  LVRow,
  LVState,
  PanelApi,
  RoleOption,
  Server,
  Session,
} from './types';
import {
  LV_MAX_CHANGE,
  lvDefault,
  lvIssue,
  lvKinds,
  lvLimits,
  lvProgress,
  type Levels,
  type LvLogEntry,
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
  | 'getLevels'
  | 'saveLevels'
  | 'levelLeaderboard'
  | 'levelMember'
  | 'levelCrates'
  | 'findLevelMembers'
  | 'changeXp'
  | 'resetXp'
  | 'testLevels'
>;

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
const avatar = (n: number) =>
  `https://cdn.discordapp.com/embed/avatars/${n % 6}.png`;
/** The sample servers' reward roles. */
const rewardRoles: RoleOption[] = [
  { id: '9401', name: 'Chatter', color: '#57F287' },
  { id: '9402', name: 'Regular', color: '#5865F2' },
  { id: '9403', name: 'Veteran', color: '#EB459E' },
  { id: '9404', name: 'Legend', color: '#FACC15' },
];
/** Roles for XP boosts. */
const boostRoles: RoleOption[] = [
  { id: '9411', name: 'Server Booster', color: '#F47FFF' },
];

/** Members of the sample servers, with their XP, messages and voice time. */
const people: [string, number, number, number][] = [
  ['rhea', 48_210, 2410, 1320],
  ['ayo', 39_870, 1980, 860],
  ['mossy_bun', 31_400, 1702, 240],
  ['kestrel', 24_950, 1220, 610],
  ['tomoko', 18_300, 940, 180],
  ['quinn', 12_640, 702, 90],
  ['kit', 9_120, 498, 45],
  ['jules', 6_480, 360, 30],
  ['pip', 4_200, 233, 0],
  ['marlowe', 2_910, 160, 20],
  ['sunny.d', 1_780, 98, 0],
  ['ollie', 1_150, 64, 12],
  ['nadia', 640, 35, 0],
  ['bramble', 310, 17, 0],
  ['finn', 120, 6, 0],
];
type Person = {
  userId: string;
  name: string;
  avatar: string;
  xp: number;
  messages: number;
  voiceMinutes: number;
};
const sample = (plus: boolean): Person[] =>
  people.map(([name, xp, messages, voiceMinutes], i) => ({
    userId: `73${String(i).padStart(4, '0')}`,
    name,
    avatar: avatar(i),
    // The Plus sample server is busier.
    xp: plus ? Math.round(xp * 1.6) : xp,
    messages: plus ? Math.round(messages * 1.6) : messages,
    voiceMinutes,
  }));
/** Members with no XP yet, to find and give some. */
const quiet = ['driftwood', 'nova_star', 'lumi', 'sol'].map((name, i) => ({
  userId: `7390${i}`,
  name,
  avatar: avatar(i + 2),
}));

type MockState = {
  config: Levels;
  members: Map<string, Person>;
  crates: LVCrate[];
  log: LvLogEntry[];
};

export function createLevelsMock(h: Helpers) {
  const state = new Map<string, MockState>();
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const plus = h.server(serverId).plan === 'plus';
    const channels = h.channels(serverId);
    const channel = (name: string) =>
      channels.find((c) => c.name === name)?.id ?? channels[0]?.id ?? '';
    const config = lvDefault(channel('general'));
    config.rewards = [
      { id: 'r1', level: 5, role: rewardRoles[0]!.id },
      { id: 'r2', level: 10, role: rewardRoles[1]!.id },
      { id: 'r3', level: 20, role: rewardRoles[2]!.id },
    ];
    config.boosts = [
      { id: 'b1', kind: 'role', target: boostRoles[0]!.id, multiplier: 1.5 },
    ];
    if (plus) {
      config.rewards.push({ id: 'r4', level: 30, role: rewardRoles[3]!.id });
      config.crates = { ...config.crates, on: true };
      config.levelUp = { ...config.levelUp, where: 'channel', every: 1 };
    }
    const members = new Map(sample(plus).map((p) => [p.userId, p]));
    const who = (i: number) => sample(plus)[i]!;
    const crate = (
      id: number,
      i: number | null,
      xp: number,
      ago: number,
    ): LVCrate => ({
      id,
      channelId: channel('general'),
      messageId: `88${id}`,
      xp,
      state: i === null ? 'expired' : 'claimed',
      droppedAt: now - ago,
      endsAt: now - ago + config.crates.time * 1000,
      claimedBy: i === null ? null : who(i).userId,
      claimedName: i === null ? '' : who(i).name,
      claimedAt: i === null ? null : now - ago + 4000 + id * 1000,
    });
    const entry = (
      n: number,
      action: LvLogEntry['action'],
      i: number,
      detail: string,
      ago: number,
    ): LvLogEntry => ({
      id: `l${n}`,
      action,
      userId: who(i).userId,
      userName: who(i).name,
      detail,
      at: now - ago,
    });
    s = {
      config,
      members,
      crates: plus
        ? [
            crate(4, 2, 118, 25 * M),
            crate(3, null, 0, 3 * H),
            crate(2, 0, 74, 9 * H),
            crate(1, 6, 140, 2 * D),
          ]
        : [],
      log: [
        entry(9, 'level-up', 6, 'reached level 12', 40 * M),
        ...(plus
          ? [
              entry(8, 'crate-opened', 2, 'and won 118 XP', 25 * M),
              entry(
                7,
                'crate-dropped',
                2,
                'A crate dropped in #general',
                26 * M,
              ),
            ]
          : []),
        entry(6, 'reward-given', 6, '@Regular for level 10', 3 * H),
        entry(5, 'level-up', 9, 'reached level 7', 5 * H),
        entry(
          4,
          'xp-changed',
          4,
          'gave 500 XP, by @quinn.dev (17,800 → 18,300)',
          D,
        ),
        entry(3, 'reward-removed', 8, '@Chatter (now level 4)', 2 * D),
        entry(
          2,
          'failed',
          3,
          'Sparko couldn’t give @Veteran. It needs Manage Roles, and its role has to be above it.',
          6 * D,
        ),
        entry(1, 'level-up', 0, 'reached level 25', 9 * D),
      ],
    };
    state.set(serverId, s);
    return s;
  };
  const guard = (serverId: string) => {
    if (h.server(serverId).paused)
      throw new Error('This server is paused by Sparko staff.');
  };
  const rolesOf = (serverId: string) => [
    ...h.roles(serverId),
    ...rewardRoles,
    ...boostRoles,
  ];
  let nextLog = 100;
  const log = (serverId: string, e: Omit<LvLogEntry, 'id' | 'at'>) =>
    of(serverId).log.unshift({ ...e, id: `l${nextLog++}`, at: Date.now() });

  const ranked = (s: MockState) =>
    [...s.members.values()]
      .filter((m) => m.xp > 0)
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name, 'en'));
  const rowOf = (s: MockState, m: Person, rank: number | null): LVRow => {
    const p = lvProgress(s.config.formula, m.xp, s.config.maxLevel);
    return { rank, ...m, level: p.level, percent: p.percent };
  };
  const anyone = (userId: string) =>
    quiet.find((q) => q.userId === userId) ?? null;
  const detail = (s: MockState, userId: string): LVDetail => {
    const m = s.members.get(userId);
    const base = m ?? {
      userId,
      name: anyone(userId)?.name ?? userId,
      avatar: anyone(userId)?.avatar ?? '',
      xp: 0,
      messages: 0,
      voiceMinutes: 0,
    };
    const p = lvProgress(s.config.formula, base.xp, s.config.maxLevel);
    const at = ranked(s).findIndex((r) => r.userId === userId);
    return {
      ...base,
      rank: at < 0 ? null : at + 1,
      ...p,
      rewards: [...s.config.rewards]
        .sort((a, b) => a.level - b.level)
        .filter((r) => r.level <= p.level)
        .map((r) => ({ level: r.level, role: r.role })),
    };
  };

  const api: Api = {
    async getLevels(serverId) {
      const s = of(serverId);
      const claimed = s.crates.filter((c) => c.state === 'claimed');
      return h.wait(
        h.copy<LVState>({
          on: h.isOn(serverId),
          config: s.config,
          limits: lvLimits(h.server(serverId).plan),
          count: ranked(s).length,
          crates: {
            dropped: s.crates.length,
            opened: claimed.length,
            xp: claimed.reduce((n, c) => n + c.xp, 0),
          },
          channels: h.channels(serverId),
          roles: rolesOf(serverId),
          log: s.log,
        }),
      );
    },
    async saveLevels(serverId, change) {
      guard(serverId);
      const issue = lvIssue(change.config, {
        plan: h.server(serverId).plan,
        templates: h.templates(serverId),
        roles: new Map(
          rolesOf(serverId).map((r) => [r.id, r.assignable !== false]),
        ),
        channels: new Set(h.channels(serverId).map((c) => c.id)),
      });
      if (issue) throw new Error(issue.problem);
      of(serverId).config = h.copy(change.config);
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async levelLeaderboard(serverId, query, page) {
      const s = of(serverId);
      const q = query.trim().toLowerCase();
      const all = ranked(s).map((m, i) => rowOf(s, m, i + 1));
      const shown = q
        ? all.filter((r) => r.userId === q || r.name.toLowerCase().includes(q))
        : all;
      const size = 25;
      const pages = Math.max(1, Math.ceil(shown.length / size));
      const at = Math.min(Math.max(1, page), pages);
      return h.wait(
        h.copy<LVBoard>({
          rows: shown.slice((at - 1) * size, at * size),
          total: shown.length,
          count: all.length,
          page: at,
          pages,
        }),
      );
    },
    async levelMember(serverId, userId) {
      return h.wait(h.copy(detail(of(serverId), userId)));
    },
    async levelCrates(serverId) {
      const s = of(serverId);
      const claimed = s.crates.filter((c) => c.state === 'claimed');
      return h.wait(
        h.copy({
          crates: s.crates,
          stats: {
            dropped: s.crates.length,
            opened: claimed.length,
            xp: claimed.reduce((n, c) => n + c.xp, 0),
          },
        }),
      );
    },
    async findLevelMembers(serverId, query) {
      const q = query.trim().toLowerCase();
      const s = of(serverId);
      const everyone = [
        ...[...s.members.values()],
        ...quiet.filter((p) => !s.members.has(p.userId)),
      ];
      return h.wait<LVFound[]>(
        q
          ? everyone
              .filter((p) => p.userId === q || p.name.includes(q))
              .slice(0, 10)
              .map((p) => {
                const d = detail(s, p.userId);
                return {
                  userId: p.userId,
                  name: p.name,
                  avatar: p.avatar,
                  xp: d.xp,
                  level: d.level,
                };
              })
          : [],
      );
    },
    async changeXp(serverId, userId, mode, amount) {
      guard(serverId);
      const least = mode === 'set' ? 0 : 1;
      if (!Number.isInteger(amount) || amount < least || amount > LV_MAX_CHANGE)
        throw new Error(
          `Write a whole number of XP from ${least} to ${LV_MAX_CHANGE.toLocaleString('en-US')}.`,
        );
      const s = of(serverId);
      const known = s.members.get(userId) ?? anyone(userId);
      if (!known) throw new Error('That member isn’t in the server.');
      const m: Person = s.members.get(userId) ?? {
        ...known,
        xp: 0,
        messages: 0,
        voiceMinutes: 0,
      };
      const before = m.xp;
      m.xp =
        mode === 'give'
          ? Math.min(before + amount, LV_MAX_CHANGE * 10)
          : mode === 'take'
            ? Math.max(0, before - amount)
            : amount;
      s.members.set(userId, m);
      const n = (v: number) => v.toLocaleString('en-US');
      log(serverId, {
        action: 'xp-changed',
        userId,
        userName: m.name,
        detail: `${mode === 'give' ? 'gave' : mode === 'take' ? 'took' : 'set'} ${n(amount)} XP, by @${h.you().name} (${n(before)} → ${n(m.xp)})`,
      });
      return h.wait(h.copy(detail(s, userId)));
    },
    async resetXp(serverId, userId) {
      guard(serverId);
      const s = of(serverId);
      if (userId) {
        const m = s.members.get(userId);
        if (m) Object.assign(m, { xp: 0, messages: 0, voiceMinutes: 0 });
      } else
        for (const m of s.members.values())
          Object.assign(m, { xp: 0, messages: 0, voiceMinutes: 0 });
      log(serverId, {
        action: 'reset',
        userId: userId ?? '0',
        userName: userId ? (s.members.get(userId)?.name ?? userId) : 'everyone',
        detail: `by @${h.you().name}`,
      });
      return h.wait(undefined);
    },
    async testLevels(serverId, channel, kind) {
      guard(serverId);
      if (!lvKinds.includes(kind))
        throw new Error(
          'Pick the level-up message, the rank card or the XP crate to test.',
        );
      const c = h.channels(serverId).find((x) => x.id === channel);
      if (!c) throw new Error('Pick a channel to send the test message to.');
      if (!c.canPost)
        throw new Error(`Sparko can’t post in #${c.name}. Pick another one.`);
      return h.wait(undefined);
    },
  };
  return {
    api,
    reset: () => state.clear(),
    /** Templates Levels & XP uses, for the tags in Message Studio. */
    uses: (serverId: string) => {
      const c = of(serverId).config;
      return [
        { id: c.levelUp.template, where: 'Levels & XP (level-up message)' },
        { id: c.rank.template, where: 'Levels & XP (rank card)' },
        { id: c.crates.template, where: 'Levels & XP (XP crate)' },
      ].filter((u) => u.id);
    },
  };
}
