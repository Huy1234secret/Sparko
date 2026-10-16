import type {
  ARMemberView,
  ARState,
  PanelApi,
  RoleOption,
  Server,
} from './types';
import { arDefault, arLimits, type AutoRoles } from './studio-format';

type Helpers = {
  wait: <T>(value: T) => Promise<T>;
  copy: <T>(value: T) => T;
  server: (id: string) => Server;
  roles: (serverId: string) => RoleOption[];
  isOn: (serverId: string) => boolean;
  setOn: (serverId: string, on: boolean) => void;
};

type Api = Pick<
  PanelApi,
  | 'getAutoRoles'
  | 'saveAutoRoles'
  | 'searchARMembers'
  | 'editARMember'
  | 'wipeARMember'
>;

const H = 3_600_000;
const D = 24 * H;

/** Sample automatic roles: a join role, two timed roles and one rule. */
function sample(): AutoRoles {
  return {
    ...arDefault(),
    join: { before: [], after: ['9204'] },
    timed: [
      { id: 't1', after: '7d', role: '9201' },
      { id: 't2', after: '30d', role: '9202' },
    ],
    rules: [
      {
        id: 'r1',
        name: 'Early supporter',
        conditions: [
          { id: 'c1', kind: 'age', min: '365d' },
          { id: 'c2', kind: 'badge', badges: ['early'] },
        ],
        links: ['or'],
        role: '9202',
        resetOnLeave: false,
        removeOnLoss: true,
      },
    ],
  };
}

export function createAutoRolesMock(h: Helpers) {
  const state = new Map<
    string,
    { config: AutoRoles; log: ARState['log']; members: ARMemberView[] }
  >();
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const member = (
      userId: string,
      name: string,
      servedMs: number,
      given: string[],
      inServer = true,
    ): ARMemberView => ({
      userId,
      name,
      inServer,
      servedMs,
      boosts: name === 'rhea' ? 2 : 0,
      boostingSince: name === 'rhea' ? now - 40 * D : null,
      given,
      updatedAt: now - H,
    });
    s = {
      config: sample(),
      members: [
        member('7001', 'tomoko', 3 * D, []),
        member('7002', 'ayo', 12 * D, ['9201']),
        member('7003', 'rhea', 45 * D, ['9201', '9202']),
        member('7004', 'quinn', 9 * D, [], false),
      ],
      log: [
        {
          id: 'a4',
          action: 'met',
          userId: '7002',
          userName: 'ayo',
          roleId: '9201',
          trigger: '7d in the server',
          reason: '',
          at: now - 20 * 60_000,
        },
        {
          id: 'a3',
          action: 'added',
          userId: '7001',
          userName: 'tomoko',
          roleId: '9204',
          trigger: 'Join role',
          reason: '',
          at: now - 3 * D,
        },
        {
          id: 'a2',
          action: 'saved',
          userId: '7004',
          userName: 'quinn',
          roleId: '',
          trigger: '',
          reason: '',
          at: now - 4 * D,
        },
        {
          id: 'a1',
          action: 'lost',
          userId: '7005',
          userName: 'kit',
          roleId: '9202',
          trigger: 'Early supporter',
          reason: '',
          at: now - 6 * D,
        },
      ],
    };
    state.set(serverId, s);
    return s;
  };
  const guard = (serverId: string) => {
    if (h.server(serverId).paused)
      throw new Error('This server is paused by Sparko staff.');
  };
  let nextLog = 100;
  const logData = (
    serverId: string,
    m: ARMemberView,
    action: 'saved' | 'removed',
  ) =>
    of(serverId).log.unshift({
      id: `a${nextLog++}`,
      action,
      userId: m.userId,
      userName: m.name,
      roleId: '',
      trigger: '',
      reason: '',
      at: Date.now(),
    });

  const api: Api = {
    async getAutoRoles(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy({
          on: h.isOn(serverId),
          config: s.config,
          limits: arLimits(h.server(serverId).plan),
          roles: h.roles(serverId),
          log: s.log,
        }),
      );
    },
    async saveAutoRoles(serverId, change) {
      guard(serverId);
      of(serverId).config = h.copy(change.config);
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async searchARMembers(serverId, query) {
      const q = query.trim().toLowerCase();
      return h.wait(
        h.copy(
          of(serverId).members.filter(
            (m) => m.userId === q || m.name.toLowerCase().includes(q),
          ),
        ),
      );
    },
    async editARMember(serverId, userId, edit) {
      guard(serverId);
      const s = of(serverId);
      const m = s.members.find((x) => x.userId === userId);
      if (!m) throw new Error('That member has no saved data any more.');
      if (edit.servedMs !== undefined) m.servedMs = edit.servedMs;
      if (edit.boosts !== undefined) m.boosts = edit.boosts;
      m.updatedAt = Date.now();
      logData(serverId, m, 'saved');
      return h.wait(h.copy(m));
    },
    async wipeARMember(serverId, userId) {
      guard(serverId);
      const s = of(serverId);
      const m = s.members.find((x) => x.userId === userId);
      if (!m) throw new Error('That member has no saved data any more.');
      logData(serverId, m, 'removed');
      if (!m.inServer) {
        s.members = s.members.filter((x) => x !== m);
        return h.wait(null);
      }
      Object.assign(m, { servedMs: 0, boosts: 0, updatedAt: Date.now() });
      return h.wait(h.copy(m));
    },
  };
  return { api, reset: () => state.clear() };
}
