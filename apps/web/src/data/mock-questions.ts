import type {
  Channel,
  PanelApi,
  QAState,
  RoleOption,
  Server,
  Session,
} from './types';
import {
  qaDefault,
  qaIssue,
  qaLimits,
  type QaLogEntry,
  type QaQuestion,
  type Questions,
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
  | 'getQuestions'
  | 'saveQuestions'
  | 'listQuestions'
  | 'deleteQuestion'
  | 'testQuestion'
>;

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
const avatar = (n: number) =>
  `https://cdn.discordapp.com/embed/avatars/${n}.png`;

const staff = (name: string, n: number, text: string, at: number) => ({
  text,
  byId: `20000000000000000${n}`,
  byName: name,
  byAvatar: avatar(n),
  at,
});

/** Sample questions in every state, so Storage has something to show. */
function sampleQuestions(now: number, plus: boolean): QaQuestion[] {
  const q = (number: number, patch: Partial<QaQuestion>): QaQuestion => ({
    number,
    askerId: `70${String(number).padStart(2, '0')}`,
    askerName: 'tomoko',
    askerAvatar: avatar(number % 5),
    title: '',
    body: '',
    category: '',
    files: [],
    status: 'open',
    meToo: 0,
    channelId: '800000000000000010',
    messageId: `97000000000000${number}`,
    threadId: `98000000000000${number}`,
    answerId: null,
    answer: null,
    closedBy: null,
    createdAt: now - number * 7 * H,
    answeredAt: null,
    closeAt: null,
    threadClosed: false,
    ...patch,
  });
  const list = [
    q(8, {
      askerName: 'kestrel',
      title: 'Can I stream games in the voice channels?',
      body: 'I’d like to stream some indie games on Friday nights. Do I need a role for Go Live?',
      category: 'events',
      meToo: 4,
      createdAt: now - 40 * M,
    }),
    q(7, {
      askerName: 'mossy_bun',
      title: 'How do I get the Artist role?',
      body: 'I’ve posted a few drawings in #art-share already.',
      category: 'roles',
      status: 'answered',
      meToo: 9,
      files: [
        {
          name: 'sketch.png',
          url: 'https://cdn.discordapp.com/embed/avatars/1.png',
          kind: 'image',
        },
      ],
      answerId: '99000000000000007',
      answer: staff(
        'quinn.dev',
        1,
        'Share three pieces in #art-share, then press the Artist button in #roles. A moderator checks your posts and gives the role within a day. Keep tagging your work with the topic of the week so it shows in the Sunday showcase!',
        now - 3 * H,
      ),
      answeredAt: now - 3 * H,
      closeAt: now + 21 * H,
    }),
    q(6, {
      askerName: 'ayo',
      title: 'Is there a server rule about self-promotion?',
      body: '',
      category: 'rules',
      status: 'answered',
      createdAt: now - 3 * D,
      answer: staff(
        'rhea',
        3,
        'Only in #introductions, once. Links anywhere else are removed.',
        now - 2 * D,
      ),
      answeredAt: now - 2 * D,
      closeAt: now - D,
      threadClosed: true,
    }),
    q(5, {
      askerName: 'rhea',
      title: 'Where do I report a bug in the music bot?',
      body: 'The queue skips songs when more than three people add tracks.',
      category: 'bots',
      status: 'closed',
      createdAt: now - 4 * D,
      closedBy: { id: '7005', name: 'rhea' },
      answeredAt: now - 3 * D,
      closeAt: now - 2 * D,
      threadClosed: true,
    }),
    q(4, {
      askerName: 'quinn',
      title: 'When is the next movie night?',
      body: 'The calendar in #announcements still shows last month.',
      category: 'events',
      status: 'expired',
      meToo: 2,
      createdAt: now - 9 * D,
      closeAt: now - 2 * D,
      threadClosed: true,
    }),
    q(3, {
      askerName: 'kit',
      title: 'Can I change my nickname colour?',
      body: 'Asking for a friend.',
      status: 'deleted',
      createdAt: now - 5 * D,
      messageId: null,
      threadClosed: true,
    }),
  ];
  if (plus)
    list.unshift(
      q(9, {
        askerName: 'latte_lover',
        title: 'Are the café playlists on Spotify?',
        body: 'The lo-fi one from last weekend was perfect for studying.',
        category: 'music',
        meToo: 12,
        createdAt: now - 15 * M,
      }),
    );
  return list;
}

export function createQuestionsMock(h: Helpers) {
  const state = new Map<
    string,
    { config: Questions; list: QaQuestion[]; log: QaLogEntry[] }
  >();
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const plus = h.server(serverId).plan === 'plus';
    const channels = h.channels(serverId);
    const config = qaDefault(
      channels.find((c) => c.name === 'support')?.id ?? channels[0]?.id ?? '',
    );
    config.categories = [
      { id: 'roles', name: 'Roles', emoji: '🎭' },
      { id: 'events', name: 'Events', emoji: '📅' },
      { id: 'bots', name: 'Bots', emoji: '🤖' },
      { id: 'rules', name: 'Rules', emoji: '📜' },
    ];
    if (plus) {
      config.categories.push(
        { id: 'music', name: 'Music', emoji: '🎵' },
        { id: 'menu', name: 'Café menu', emoji: '☕' },
      );
      config.maxOpen = 5;
      config.expire = '7d';
      config.anonymous = true;
    }
    s = {
      config,
      list: sampleQuestions(now, plus),
      log: [
        {
          id: 'q6',
          action: 'asked',
          number: 8,
          userId: '7008',
          userName: 'kestrel',
          detail: 'Can I stream games in the voice channels?',
          at: now - 40 * M,
        },
        {
          id: 'q5',
          action: 'reanswered',
          number: 7,
          userId: '200000000000000001',
          userName: 'quinn.dev',
          detail: 'Share three pieces in #art-share, then press the Artist…',
          at: now - 3 * H,
        },
        {
          id: 'q4',
          action: 'answered',
          number: 7,
          userId: '200000000000000003',
          userName: 'rhea',
          detail: 'Post three drawings and ask a moderator.',
          at: now - 5 * H,
        },
        {
          id: 'q3',
          action: 'marked',
          number: 5,
          userId: '7005',
          userName: 'rhea',
          detail: '',
          at: now - 3 * D,
        },
        {
          id: 'q2',
          action: 'expired',
          number: 4,
          userId: '0',
          userName: 'Sparko',
          detail: '7d passed',
          at: now - 2 * D,
        },
        {
          id: 'q1',
          action: 'refused',
          number: null,
          userId: '7010',
          userName: 'newbie42',
          detail: 'You can ask again later.',
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
    const limits = qaLimits(h.server(serverId).plan);
    const count = of(serverId).list.length;
    return {
      count,
      limit: limits.questions,
      perKb: limits.perKb,
      usedKb: count * limits.perKb,
      limitMb: limits.storageMb,
    };
  };
  let nextLog = 100;

  const api: Api = {
    async getQuestions(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy<QAState>({
          on: h.isOn(serverId),
          config: s.config,
          limits: qaLimits(h.server(serverId).plan),
          storage: storage(serverId),
          channels: h.channels(serverId),
          roles: h.roles(serverId),
          log: s.log,
        }),
      );
    },
    async saveQuestions(serverId, change) {
      guard(serverId);
      const issue = qaIssue(change.config, {
        plan: h.server(serverId).plan,
        templates: h.templates(serverId),
        taken: new Set(['suggest']),
        roles: new Map(
          h.roles(serverId).map((r) => [r.id, r.assignable !== false]),
        ),
      });
      if (issue) throw new Error(issue.problem);
      of(serverId).config = h.copy(change.config);
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async listQuestions(serverId, { query, status }) {
      const q = query.trim().toLowerCase().replace(/^#/, '');
      return h.wait(
        h.copy({
          questions: of(serverId).list.filter(
            (x) =>
              (!status || x.status === status) &&
              (!q ||
                String(x.number) === q ||
                x.askerId === q ||
                x.askerName.toLowerCase().includes(q) ||
                x.title.toLowerCase().includes(q)),
          ),
          storage: storage(serverId),
        }),
      );
    },
    async deleteQuestion(serverId, number) {
      guard(serverId);
      const s = of(serverId);
      const gone = s.list.find((x) => x.number === number);
      if (!gone) throw new Error('That question was already deleted.');
      s.list = s.list.filter((x) => x !== gone);
      s.log.unshift({
        id: `q${nextLog++}`,
        action: 'deleted',
        number,
        userId: h.you().id,
        userName: h.you().name,
        detail: gone.title,
        at: Date.now(),
      });
      return h.wait(undefined);
    },
    async testQuestion(serverId, channel) {
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
    /** Templates Questions & answers use, for the tags in Message Studio. */
    uses: (serverId: string) => {
      const c = of(serverId).config;
      return [
        [c.message, 'Questions & answers (the question message)'],
        [c.answerMessage, 'Questions & answers (the answer message)'],
        [c.dmMessage, 'Questions & answers (the answered DM)'],
      ]
        .filter(([id]) => id)
        .map(([id, where]) => ({ id: id!, where: where! }));
    },
  };
}
