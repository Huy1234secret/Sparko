import type {
  Channel,
  INVDetail,
  INVFound,
  INVJoin,
  INVRow,
  INVState,
  PanelApi,
  RoleOption,
  Server,
  Session,
} from './types';
import {
  invDefault,
  invIssue,
  invLimits,
  invMax,
  invTotal,
  type InvCode,
  type InvLogEntry,
  type Invites,
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
  | 'getInvites'
  | 'saveInvites'
  | 'inviteLeaderboard'
  | 'inviteMember'
  | 'inviteCodes'
  | 'findInviteMembers'
  | 'giveInviteBonus'
  | 'resetInvites'
  | 'testInvite'
>;

const H = 3_600_000;
const D = 24 * H;
const avatar = (n: number) =>
  `https://cdn.discordapp.com/embed/avatars/${n % 6}.png`;
/** The sample servers' reward roles. */
const rewardRoles: RoleOption[] = [
  { id: '9301', name: 'Recruiter', color: '#57F287' },
  { id: '9302', name: 'Ambassador', color: '#5865F2' },
  { id: '9303', name: 'Legend', color: '#FACC15' },
];

/** Members of the sample servers. The first few invite the rest. */
const people = [
  'rhea',
  'ayo',
  'mossy_bun',
  'kestrel',
  'tomoko',
  'quinn',
  'kit',
  'jules',
  'pip',
  'marlowe',
  'sunny.d',
  'ollie',
  'nadia',
  'bramble',
  'finn',
  'wren',
  'juniper',
  'cass',
  'theo',
  'lumi',
  'sol',
  'ivy',
  'bao',
  'ren',
].map((name, i) => ({
  userId: `72${String(i).padStart(4, '0')}`,
  name,
  avatar: avatar(i),
}));
const person = (i: number) => people[i % people.length]!;

type MockState = {
  config: Invites;
  joins: INVJoin[];
  bonus: Map<string, number>;
  codes: InvCode[];
  vanity: { code: string; uses: number } | null;
  log: InvLogEntry[];
  syncedAt: number;
};

/** Joins over the last few weeks: who came in with whose invite. */
function sampleJoins(now: number, plus: boolean): INVJoin[] {
  // [inviter, how many, of which left, of which fake]
  const plan: [number, number, number, number][] = plus
    ? [
        [0, 9, 2, 1],
        [1, 7, 1, 0],
        [2, 5, 0, 2],
        [3, 4, 1, 0],
        [4, 2, 0, 0],
        [5, 1, 1, 0],
      ]
    : [
        [0, 6, 1, 1],
        [1, 4, 1, 0],
        [2, 3, 0, 1],
        [3, 1, 0, 0],
      ];
  const codes = ['rhea-pp', 'ayo2026', 'mossy', 'kst', 'tomo', 'q'];
  const out: INVJoin[] = [];
  let id = 1;
  let who = 6;
  for (const [inviter, n, left, fake] of plan)
    for (let k = 0; k < n; k++) {
      const p = person(who++);
      const joinedAt = now - (2 + ((id * 37) % 50)) * D - id * H;
      out.push({
        id: id++,
        userId: `${p.userId}${k}`,
        userName: k ? `${p.name}${k}` : p.name,
        avatar: p.avatar,
        inviterId: person(inviter).userId,
        inviterName: person(inviter).name,
        code: codes[inviter]!,
        type: 'normal',
        fake: k >= n - fake,
        counted: true,
        joinedAt,
        leftAt: k < left ? joinedAt + 3 * D : null,
      });
    }
  out.push(
    {
      id: id++,
      userId: '7290001',
      userName: 'driftwood',
      avatar: avatar(2),
      inviterId: null,
      inviterName: '',
      code: plus ? 'cozy' : '',
      type: plus ? 'vanity' : 'unknown',
      fake: false,
      counted: false,
      joinedAt: now - 5 * H,
      leftAt: null,
    },
    {
      id: id++,
      userId: '7290002',
      userName: 'nova_star',
      avatar: avatar(4),
      inviterId: null,
      inviterName: '',
      code: '',
      type: 'unknown',
      fake: false,
      counted: false,
      joinedAt: now - 9 * D,
      leftAt: null,
    },
  );
  return out.sort((a, b) => b.joinedAt - a.joinedAt);
}

function sampleCodes(now: number, channels: Channel[], plus: boolean) {
  const channel = (name: string) =>
    channels.find((c) => c.name === name) ?? channels[0]!;
  const code = (
    c: string,
    inviter: number,
    uses: number,
    where: string,
    extra: Partial<InvCode> = {},
  ): InvCode => ({
    code: c,
    inviterId: person(inviter).userId,
    inviterName: person(inviter).name,
    channelId: channel(where).id,
    channelName: channel(where).name,
    uses,
    maxUses: 0,
    expiresAt: null,
    createdAt: now - 60 * D,
    ...extra,
  });
  const list = [
    code('rhea-pp', 0, plus ? 9 : 6, 'welcome'),
    code('ayo2026', 1, plus ? 7 : 4, 'general'),
    code('mossy', 2, plus ? 5 : 3, 'general', { expiresAt: now + 4 * D }),
    code('kst', 3, 1, 'welcome', { maxUses: 10 }),
    code('tomo', 4, plus ? 2 : 0, 'general', {
      maxUses: 5,
      expiresAt: now + 20 * H,
    }),
  ];
  if (plus) list.push(code('q', 5, 1, 'general', { maxUses: 25 }));
  return list.sort((a, b) => b.uses - a.uses);
}

export function createInvitesMock(h: Helpers) {
  const state = new Map<string, MockState>();
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const plus = h.server(serverId).plan === 'plus';
    const channels = h.channels(serverId);
    const config = invDefault(
      channels.find((c) => c.name === 'general')?.id ?? channels[0]?.id ?? '',
    );
    config.rewards = [
      { id: 'r1', invites: 3, role: rewardRoles[0]!.id },
      { id: 'r2', invites: 5, role: rewardRoles[1]!.id },
    ];
    if (plus) {
      config.rewards.push({ id: 'r3', invites: 10, role: rewardRoles[2]!.id });
      config.leave = { on: true, channel: config.join.channel, template: '' };
      config.stackRewards = false;
      config.fakeAge = '14d';
    }
    const joins = sampleJoins(now, plus);
    const named = (i: number) => ({
      userId: person(i).userId,
      name: person(i).name,
    });
    const entry = (
      n: number,
      action: InvLogEntry['action'],
      who: { userId: string; name: string },
      detail: string,
      ago: number,
    ): InvLogEntry => ({
      id: `i${n}`,
      action,
      userId: who.userId,
      userName: who.name,
      detail,
      at: now - ago,
    });
    const newest = joins.find((j) => j.inviterId)!;
    s = {
      config,
      joins,
      bonus: new Map(plus ? [[person(3).userId, 2]] : [[person(1).userId, 1]]),
      codes: sampleCodes(now, channels, plus),
      vanity: plus ? { code: 'cozy', uses: 31 } : null,
      syncedAt: now - 2 * 60_000,
      log: [
        entry(
          9,
          'joined',
          { userId: '7290001', name: 'driftwood' },
          plus
            ? 'with the vanity link (31 uses)'
            : 'Sparko couldn’t tell which invite they used',
          5 * H,
        ),
        entry(
          8,
          'joined',
          { userId: newest.userId, name: newest.userName },
          `invited by @${newest.inviterName} with ${newest.code} (6 uses)`,
          7 * H,
        ),
        entry(
          7,
          'reward-given',
          named(0),
          '@Ambassador for 5 invites (now 5)',
          7 * H,
        ),
        entry(
          6,
          'left',
          { userId: '7200061', name: 'kit1' },
          'invited by @rhea, who now has 4',
          30 * H,
        ),
        entry(
          5,
          'bonus',
          named(plus ? 3 : 1),
          `+${plus ? 2 : 1} by @quinn.dev, ${plus ? 2 : 1} bonus and ${plus ? 6 : 4} in total`,
          2 * D,
        ),
        entry(
          4,
          'joined',
          { userId: '7200099', name: 'fresh_acc' },
          'invited by @mossy_bun with mossy (3 uses), a new account, counted as fake',
          3 * D,
        ),
        entry(
          3,
          'reward-removed',
          named(2),
          '@Ambassador (now 2 invites)',
          4 * D,
        ),
        entry(2, 'reset', named(4), 'by @quinn.dev', 12 * D),
        entry(
          1,
          'failed',
          named(1),
          'Sparko couldn’t give @Recruiter. It needs Manage Roles, and its role has to be above it.',
          20 * D,
        ),
      ],
    };
    state.set(serverId, s);
    return s;
  };
  const guard = (serverId: string) => {
    if (h.server(serverId).paused)
      throw new Error('This server is paused by Sparko staff.');
  };
  const rolesOf = (serverId: string) => [...h.roles(serverId), ...rewardRoles];
  let nextLog = 100;
  const log = (serverId: string, e: Omit<InvLogEntry, 'id' | 'at'>) =>
    of(serverId).log.unshift({ ...e, id: `i${nextLog++}`, at: Date.now() });

  /** Names and pictures of everyone the sample knows. */
  const known = (s: MockState) => {
    const map = new Map<string, { name: string; avatar: string }>();
    for (const p of people) map.set(p.userId, p);
    for (const j of s.joins)
      map.set(j.userId, { name: j.userName, avatar: j.avatar });
    return map;
  };
  /** Each inviter's numbers, as the server counts them. */
  const rows = (s: MockState): INVRow[] => {
    const c = s.config;
    const ids = new Set([
      ...s.joins.flatMap((j) => (j.inviterId ? [j.inviterId] : [])),
      ...s.bonus.keys(),
    ]);
    const names = known(s);
    return [...ids].map((id) => {
      const mine = s.joins.filter((j) => j.inviterId === id && j.counted);
      const n = {
        regular: mine.length,
        left: mine.filter((j) => j.leftAt).length,
        // A fake member who left only counts once.
        fake: mine.filter((j) => j.fake && !(j.leftAt && c.subtractLeaves))
          .length,
        bonus: s.bonus.get(id) ?? 0,
      };
      return {
        rank: null,
        userId: id,
        name: names.get(id)?.name ?? id,
        avatar: names.get(id)?.avatar ?? '',
        ...n,
        total: invTotal(c, n),
      };
    });
  };
  const board = (s: MockState) =>
    rows(s)
      .filter((r) => r.regular > 0 || r.bonus !== 0)
      .sort(
        (a, b) =>
          b.total - a.total ||
          b.regular - a.regular ||
          a.name.localeCompare(b.name, 'en'),
      )
      .map((r, i) => ({ ...r, rank: i + 1 }));
  const detail = (s: MockState, userId: string): INVDetail => {
    const row = rows(s).find((r) => r.userId === userId);
    const by = s.joins.find((j) => j.userId === userId) ?? null;
    const p = known(s).get(userId);
    return {
      member: {
        userId,
        name: p?.name ?? userId,
        avatar: p?.avatar ?? '',
        regular: row?.regular ?? 0,
        left: row?.left ?? 0,
        fake: row?.fake ?? 0,
        bonus: row?.bonus ?? 0,
        total: row?.total ?? 0,
      },
      invitedBy: by,
      invited: s.joins.filter((j) => j.inviterId === userId).slice(0, 50),
    };
  };

  const api: Api = {
    async getInvites(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy<INVState>({
          on: h.isOn(serverId),
          config: s.config,
          limits: invLimits(h.server(serverId).plan),
          count: board(s).length,
          canSeeInvites: true,
          channels: h.channels(serverId),
          roles: rolesOf(serverId),
          log: s.log,
        }),
      );
    },
    async saveInvites(serverId, change) {
      guard(serverId);
      const issue = invIssue(change.config, {
        plan: h.server(serverId).plan,
        templates: h.templates(serverId),
        roles: new Map(
          rolesOf(serverId).map((r) => [r.id, r.assignable !== false]),
        ),
      });
      if (issue) throw new Error(issue.problem);
      of(serverId).config = h.copy(change.config);
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async inviteLeaderboard(serverId, query, page) {
      const s = of(serverId);
      const q = query.trim().toLowerCase();
      const ranked = board(s);
      const matches = (r: { userId: string; name: string }) =>
        !q || r.userId === q || r.name.toLowerCase().includes(q);
      const onBoard = new Set(ranked.map((r) => r.userId));
      const others: INVRow[] = q
        ? [...known(s)]
            .filter(
              ([id, p]) =>
                !onBoard.has(id) &&
                s.joins.some((j) => j.userId === id) &&
                matches({ userId: id, name: p.name }),
            )
            .map(([id]) => ({ ...detail(s, id).member, rank: null }))
        : [];
      const shown = q ? [...ranked.filter(matches), ...others] : ranked;
      const size = 25;
      const pages = Math.max(1, Math.ceil(shown.length / size));
      const at = Math.min(Math.max(1, page), pages);
      return h.wait(
        h.copy({
          rows: shown.slice((at - 1) * size, at * size),
          total: shown.length,
          count: ranked.length,
          page: at,
          pages,
        }),
      );
    },
    async inviteMember(serverId, userId) {
      return h.wait(h.copy(detail(of(serverId), userId)));
    },
    async inviteCodes(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy({
          codes: s.codes,
          vanity: s.vanity,
          syncedAt: s.syncedAt,
          canSeeInvites: true,
        }),
      );
    },
    async findInviteMembers(serverId, query) {
      const q = query.trim().toLowerCase();
      const s = of(serverId);
      const totals = new Map(rows(s).map((r) => [r.userId, r.total]));
      return h.wait<INVFound[]>(
        q
          ? people
              .filter((p) => p.userId === q || p.name.includes(q))
              .slice(0, 10)
              .map((p) => ({ ...p, total: totals.get(p.userId) ?? 0 }))
          : [],
      );
    },
    async giveInviteBonus(serverId, userId, amount) {
      guard(serverId);
      if (
        !Number.isInteger(amount) ||
        !amount ||
        Math.abs(amount) > invMax.bonus
      )
        throw new Error(
          'Write a whole number of invites, from -100,000 to 100,000, but not 0.',
        );
      const s = of(serverId);
      const who = known(s).get(userId);
      if (!who) throw new Error('That member isn’t in the server.');
      s.bonus.set(userId, (s.bonus.get(userId) ?? 0) + amount);
      const after = detail(s, userId).member;
      log(serverId, {
        action: 'bonus',
        userId,
        userName: who.name,
        detail: `${amount > 0 ? '+' : ''}${amount} by @${h.you().name}, ${after.bonus} bonus and ${after.total} in total`,
      });
      return h.wait(h.copy(detail(s, userId)));
    },
    async resetInvites(serverId, userId) {
      guard(serverId);
      const s = of(serverId);
      for (const j of s.joins)
        if (!userId || j.inviterId === userId) j.counted = false;
      if (userId) s.bonus.delete(userId);
      else s.bonus.clear();
      log(serverId, {
        action: 'reset',
        userId: userId ?? '0',
        userName: userId ? (known(s).get(userId)?.name ?? userId) : 'everyone',
        detail: `by @${h.you().name}`,
      });
      return h.wait(undefined);
    },
    async testInvite(serverId, channel) {
      guard(serverId);
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
    /** Templates invite tracking uses, for the tags in Message Studio. */
    uses: (serverId: string) => {
      const c = of(serverId).config;
      return (['join', 'leave'] as const)
        .filter((k) => c[k].template)
        .map((k) => ({
          id: c[k].template,
          where: `Invite tracking (${k === 'join' ? 'Join' : 'Leave'} message)`,
        }));
    },
  };
}
