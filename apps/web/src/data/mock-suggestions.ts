import type {
  Channel,
  PanelApi,
  RoleOption,
  SGState,
  Server,
  Session,
} from './types';
import {
  sgDefault,
  sgIssue,
  sgLimits,
  type SgLogEntry,
  type SgSuggestion,
  type Suggestions,
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
  | 'getSuggestions'
  | 'saveSuggestions'
  | 'listSuggestions'
  | 'deleteSuggestion'
  | 'testSuggestion'
>;

const H = 3_600_000;
const D = 24 * H;
const avatar = (n: number) =>
  `https://cdn.discordapp.com/embed/avatars/${n}.png`;

/** Sample suggestions in every state, so Storage has something to show. */
function sampleSuggestions(now: number): SgSuggestion[] {
  const s = (number: number, patch: Partial<SgSuggestion>): SgSuggestion => ({
    number,
    authorId: `70${String(number).padStart(2, '0')}`,
    authorName: 'tomoko',
    authorAvatar: avatar(number % 5),
    title: '',
    body: '',
    files: [],
    status: 'open',
    closed: false,
    up: 0,
    down: 0,
    channelId: '800000000000000006',
    messageId: `95000000000000${number}`,
    threadId: null,
    reason: null,
    createdAt: now - number * D,
    lastAt: now - number * H,
    ...patch,
  });
  return [
    s(6, {
      authorName: 'kestrel',
      title: 'A channel for memes',
      body: 'General keeps getting flooded with memes. A separate channel would keep things tidy.',
      up: 3,
      down: 3,
    }),
    s(5, {
      authorName: 'mossy_bun',
      title: 'Weekly art challenge',
      body: 'A theme every Monday, with a showcase on Sunday.',
      status: 'approved',
      up: 41,
      down: 4,
      reason: {
        text: 'Love it. Starting next Monday in #art-share!',
        byId: '200000000000000001',
        byName: 'quinn.dev',
        byAvatar: avatar(2),
        at: now - 2 * D,
      },
    }),
    s(4, {
      authorName: 'ayo',
      title: 'Remove slowmode in #general',
      body: 'It makes conversations hard to follow.',
      status: 'denied',
      closed: true,
      up: 5,
      down: 22,
      reason: {
        text: 'Slowmode stops raids. We’ll keep it, but shorten it to 3 seconds.',
        byId: '200000000000000002',
        byName: 'rhea',
        byAvatar: avatar(3),
        at: now - 3 * D,
      },
    }),
    s(3, {
      authorName: 'rhea',
      title: 'Movie nights on Fridays',
      body: 'Watch a film together in voice every Friday, and vote on it during the week.',
      up: 18,
      down: 2,
      threadId: '960000000000000003',
    }),
    s(2, {
      authorName: 'quinn',
      title: 'Server banner contest',
      body: 'Members design the next server banner, and everyone votes on the winner.',
      status: 'review',
      channelId: null,
      messageId: null,
    }),
  ];
}

export function createSuggestionsMock(h: Helpers) {
  const state = new Map<
    string,
    { config: Suggestions; list: SgSuggestion[]; log: SgLogEntry[] }
  >();
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const channels = h.channels(serverId);
    const config = sgDefault(
      channels.find((c) => c.name === 'general')?.id ?? channels[0]?.id ?? '',
    );
    config.statuses.push({
      id: 'planned',
      name: 'Planned',
      color: '#5865F2',
      actions: [{ id: 'a1', type: 'dm', template: '' }],
    });
    const list = sampleSuggestions(now);
    s = {
      config,
      list,
      log: [
        {
          id: 'g5',
          action: 'posted',
          number: 6,
          userId: '7006',
          userName: 'kestrel',
          detail: 'A channel for memes',
          at: now - 6 * H,
        },
        {
          id: 'g4',
          action: 'review',
          number: 2,
          userId: '7002',
          userName: 'quinn',
          detail: 'Server banner contest',
          at: now - 2 * D,
        },
        {
          id: 'g3',
          action: 'status',
          number: 5,
          userId: '200000000000000001',
          userName: 'quinn.dev',
          detail: 'Approved',
          at: now - 2 * D,
        },
        {
          id: 'g2',
          action: 'resent',
          number: 3,
          userId: '7009',
          userName: 'kit',
          detail: '',
          at: now - 3 * D,
        },
        {
          id: 'g1',
          action: 'refused',
          number: null,
          userId: '7010',
          userName: 'newbie42',
          detail:
            'Your Discord account has to be at least 7d old to suggest here.',
          at: now - 4 * D,
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
  const storage = (serverId: string) => {
    const limits = sgLimits(h.server(serverId).plan);
    const count = of(serverId).list.length;
    return {
      count,
      limit: limits.suggestions,
      perKb: limits.perKb,
      usedKb: count * limits.perKb,
      limitMb: limits.storageMb,
    };
  };
  let nextLog = 100;

  const api: Api = {
    async getSuggestions(serverId) {
      const s = of(serverId);
      const limits = sgLimits(h.server(serverId).plan);
      return h.wait(
        h.copy<SGState>({
          on: h.isOn(serverId),
          config: s.config,
          limits,
          storage: storage(serverId),
          channels: h.channels(serverId),
          roles: h.roles(serverId),
          log: s.log,
        }),
      );
    },
    async saveSuggestions(serverId, change) {
      guard(serverId);
      const issue = sgIssue(change.config, {
        plan: h.server(serverId).plan,
        templates: h.templates(serverId),
        roles: new Map(
          h.roles(serverId).map((r) => [r.id, r.assignable !== false]),
        ),
      });
      if (issue) throw new Error(issue.problem);
      of(serverId).config = h.copy(change.config);
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async listSuggestions(serverId, { query, status }) {
      const q = query.trim().toLowerCase().replace(/^#/, '');
      return h.wait(
        h.copy({
          suggestions: of(serverId).list.filter(
            (s) =>
              (!status || s.status === status) &&
              (!q ||
                String(s.number) === q ||
                s.authorId === q ||
                s.authorName.toLowerCase().includes(q) ||
                s.title.toLowerCase().includes(q)),
          ),
          storage: storage(serverId),
        }),
      );
    },
    async deleteSuggestion(serverId, number) {
      guard(serverId);
      const s = of(serverId);
      const gone = s.list.find((x) => x.number === number);
      if (!gone) throw new Error('That suggestion was already deleted.');
      s.list = s.list.filter((x) => x !== gone);
      s.log.unshift({
        id: `g${nextLog++}`,
        action: 'deleted',
        number,
        userId: h.you().id,
        userName: h.you().name,
        detail: gone.title,
        at: Date.now(),
      });
      return h.wait(undefined);
    },
    async testSuggestion(serverId, channel) {
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
    /** Templates Suggestions use, for the tags in Message Studio. */
    uses: (serverId: string) => {
      const c = of(serverId).config;
      return [
        ...(c.message
          ? [{ id: c.message, where: 'Suggestions (the suggestion message)' }]
          : []),
        ...c.statuses.flatMap((st) =>
          st.actions
            .filter((a) => a.type === 'dm' && a.template)
            .map((a) => ({
              id: (a as { template: string }).template,
              where: `Suggestions (${st.name} DM)`,
            })),
        ),
      ];
    },
  };
}
