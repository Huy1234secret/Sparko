import type {
  BDMemberFound,
  BDState,
  Channel,
  PanelApi,
  RoleOption,
  Server,
  Session,
} from './types';
import {
  bdDateProblem,
  bdDateText,
  bdDefault,
  bdIssue,
  bdUpcoming,
  zoneOk,
  type BdEntry,
  type BdLogEntry,
  type Birthdays,
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
  | 'getBirthdays'
  | 'saveBirthdays'
  | 'listBirthdays'
  | 'findBirthdayMembers'
  | 'setBirthday'
  | 'removeBirthday'
  | 'testBirthday'
>;

const H = 3_600_000;
const D = 24 * H;
const avatar = (n: number) =>
  `https://cdn.discordapp.com/embed/avatars/${n % 6}.png`;
/** The sample servers' own birthday role. */
const birthdayRole: RoleOption = {
  id: '9210',
  name: 'Birthday 🎂',
  color: '#F472B6',
};

/** Members of the sample servers, for finding someone to add. */
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
].map((name, i) => ({
  userId: `71${String(i).padStart(4, '0')}`,
  name,
  avatar: avatar(i),
}));

/** Birthdays spread around today, so every list has something to show. */
function sampleBirthdays(now: number, plus: boolean): BdEntry[] {
  const near = (days: number) => {
    const d = new Date(now + days * D);
    return { day: d.getUTCDate(), month: d.getUTCMonth() + 1 };
  };
  const b = (
    i: number,
    when: { day: number; month: number },
    patch: Partial<BdEntry> = {},
  ): BdEntry => ({
    userId: people[i]!.userId,
    name: people[i]!.name,
    avatar: people[i]!.avatar,
    ...when,
    year: null,
    timeZone: '',
    setById: people[i]!.userId,
    setByName: people[i]!.name,
    inServer: true,
    celebratedYear: null,
    roleUntil: null,
    changedAt: now - (40 + i * 9) * D,
    updatedAt: now - (40 + i * 9) * D,
    ...patch,
  });
  const today = near(0);
  const list = [
    b(0, today, {
      year: 1998,
      timeZone: 'Europe/London',
      celebratedYear: new Date(now).getUTCFullYear(),
      roleUntil: now + 14 * H,
    }),
    b(1, near(2), { year: 2001, timeZone: 'Africa/Lagos' }),
    b(2, near(5), { timeZone: 'Asia/Tokyo' }),
    b(3, near(11), {
      year: 1995,
      setById: '200000000000000001',
      setByName: 'quinn.dev',
    }),
    b(4, near(19), { year: 2003, timeZone: 'America/New_York' }),
    b(5, { day: 29, month: 2 }, { year: 2000 }),
    b(6, near(-3), { timeZone: 'Australia/Sydney' }),
    b(7, near(40), { year: 1990 }),
    b(8, near(74)),
    b(9, near(120), { year: 1987, timeZone: 'Europe/Berlin' }),
    b(10, near(200), { inServer: false }),
  ];
  // The Plus server has more members, and more birthdays.
  if (plus)
    list.push(
      b(11, today, { timeZone: 'Asia/Ho_Chi_Minh' }),
      b(12, near(33), { year: 1999 }),
      b(13, near(150)),
    );
  return list.sort((x, y) => x.month - y.month || x.day - y.day);
}

export function createBirthdaysMock(h: Helpers) {
  const state = new Map<
    string,
    { config: Birthdays; list: BdEntry[]; log: BdLogEntry[] }
  >();
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const plus = h.server(serverId).plan === 'plus';
    const channels = h.channels(serverId);
    const config = bdDefault(
      channels.find((c) => c.name === 'general')?.id ?? channels[0]?.id ?? '',
    );
    config.role = birthdayRole.id;
    config.timeZone = plus ? 'America/New_York' : 'Europe/London';
    config.monthly = true;
    if (plus) {
      config.zoneMode = 'member';
      config.style = 'each';
      config.dm = true;
    }
    const list = sampleBirthdays(now, plus);
    const [first, second, third] = list.filter((b) => b.inServer);
    const entry = (
      n: number,
      action: BdLogEntry['action'],
      who: { userId: string; name: string },
      detail: string,
      ago: number,
    ): BdLogEntry => ({
      id: `b${n}`,
      action,
      userId: who.userId,
      userName: who.name,
      detail,
      at: now - ago,
    });
    const today = list.find((b) => b.roleUntil)!;
    s = {
      config,
      list,
      log: [
        entry(8, 'role-given', today, '', 10 * H),
        entry(
          7,
          'celebrated',
          today,
          `${bdDateText(today.day, today.month)}, turning 28`,
          10 * H,
        ),
        entry(6, 'set', first!, bdDateText(first!.day, first!.month), 2 * D),
        entry(
          5,
          'changed',
          second!,
          `${bdDateText(second!.day === 1 ? 2 : 1, second!.month)} → ${bdDateText(second!.day, second!.month)} by @quinn.dev`,
          4 * D,
        ),
        entry(4, 'role-removed', third!, '', 9 * D),
        entry(
          3,
          'monthly',
          { userId: '0', name: 'Sparko' },
          '6 birthdays this month',
          12 * D,
        ),
        entry(2, 'removed', people[14]!, 'they left the server', 20 * D),
        entry(
          1,
          'failed',
          third!,
          'Sparko couldn’t give the birthday role. It needs Manage Roles, and its role has to be above it.',
          30 * D,
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
  const rolesOf = (serverId: string) => [...h.roles(serverId), birthdayRole];
  let nextLog = 100;
  const log = (serverId: string, e: Omit<BdLogEntry, 'id' | 'at'>) =>
    of(serverId).log.unshift({ ...e, id: `b${nextLog++}`, at: Date.now() });

  const api: Api = {
    async getBirthdays(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy<BDState>({
          on: h.isOn(serverId),
          config: s.config,
          count: s.list.length,
          channels: h.channels(serverId),
          roles: rolesOf(serverId),
          log: s.log,
        }),
      );
    },
    async saveBirthdays(serverId, change) {
      guard(serverId);
      const issue = bdIssue(change.config, {
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
    async listBirthdays(serverId, query) {
      const s = of(serverId);
      const q = query.trim().toLowerCase();
      return h.wait(
        h.copy({
          birthdays: s.list.filter(
            (b) => !q || b.userId === q || b.name.toLowerCase().includes(q),
          ),
          upcoming: bdUpcoming(s.config, s.list, Date.now()),
          count: s.list.length,
        }),
      );
    },
    async findBirthdayMembers(serverId, query) {
      const q = query.trim().toLowerCase();
      const saved = new Set(of(serverId).list.map((b) => b.userId));
      return h.wait<BDMemberFound[]>(
        q
          ? people
              .filter((p) => p.userId === q || p.name.includes(q))
              .slice(0, 10)
              .map((p) => ({ ...p, saved: saved.has(p.userId) }))
          : [],
      );
    },
    async setBirthday(serverId, userId, date) {
      guard(serverId);
      const s = of(serverId);
      const problem = bdDateProblem(s.config, date, Date.now());
      if (problem) throw new Error(problem);
      if (date.timeZone && !zoneOk(date.timeZone))
        throw new Error('Pick a time zone from the list, or none.');
      const who =
        s.list.find((b) => b.userId === userId) ??
        people.find((p) => p.userId === userId);
      if (!who) throw new Error('That member isn’t in the server.');
      const old = s.list.find((b) => b.userId === userId);
      const now = Date.now();
      const next: BdEntry = {
        userId,
        name: who.name,
        avatar: who.avatar,
        ...date,
        setById: h.you().id,
        setByName: h.you().name,
        inServer: true,
        celebratedYear: old?.celebratedYear ?? null,
        roleUntil: old?.roleUntil ?? null,
        changedAt: now,
        updatedAt: now,
      };
      s.list = [...s.list.filter((b) => b.userId !== userId), next].sort(
        (x, y) => x.month - y.month || x.day - y.day,
      );
      log(serverId, {
        action: old ? 'changed' : 'set',
        userId,
        userName: who.name,
        detail: `by @${h.you().name}`,
      });
      return h.wait(h.copy(next));
    },
    async removeBirthday(serverId, userId) {
      guard(serverId);
      const s = of(serverId);
      const gone = s.list.find((b) => b.userId === userId);
      if (!gone) throw new Error('That birthday was already removed.');
      s.list = s.list.filter((b) => b !== gone);
      log(serverId, {
        action: 'removed',
        userId,
        userName: gone.name,
        detail: `by @${h.you().name}`,
      });
      return h.wait(undefined);
    },
    async testBirthday(serverId, channel) {
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
    /** Templates Birthdays use, for the tags in Message Studio. */
    uses: (serverId: string) => {
      const m = of(serverId).config.messages;
      const where = {
        single: 'Birthdays (Birthday)',
        multiple: 'Birthdays (Several birthdays)',
        monthly: 'Birthdays (This month)',
        dm: 'Birthdays (DM)',
      } as const;
      return (Object.keys(where) as (keyof typeof where)[])
        .filter((k) => m[k])
        .map((k) => ({ id: m[k], where: where[k] }));
    },
  };
}
