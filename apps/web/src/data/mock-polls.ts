import type {
  Channel,
  PanelApi,
  PollsState,
  RoleOption,
  Server,
  Session,
} from './types';
import {
  cleanDraft,
  parseDuration,
  pollDefault,
  pollDraftIssue,
  pollLimits,
  pollResults,
  pollsIssue,
  type Poll,
  type PollLogEntry,
  type PollOption,
  type PollRules,
  type PollVoter,
  type Polls,
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
  | 'getPolls'
  | 'savePolls'
  | 'listPolls'
  | 'createPoll'
  | 'endPoll'
  | 'rerollPoll'
  | 'postPollNow'
  | 'deletePoll'
  | 'pollVoters'
  | 'testPoll'
>;

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
const names = [
  'mossy_bun',
  'kestrel',
  'ayo',
  'tomoko',
  'rhea',
  'kit',
  'pixelpaws',
  'duncan_r',
  'newbie42',
  'quinn',
  'lumen',
  'sol',
];

/** Made-up voters adding up to each option's count. */
function votersFor(
  counts: Record<string, number>,
  now: number,
  multiple: boolean,
): PollVoter[] {
  const out: PollVoter[] = [];
  let n = 0;
  for (const [option, count] of Object.entries(counts))
    for (let i = 0; i < count; i++) {
      // In multiple choice some voters picked more than one.
      const again = multiple && n % 3 === 0 ? out[n / 3] : undefined;
      if (again && !again.picks.includes(option)) {
        again.picks.push(option);
        continue;
      }
      out.push({
        userId: `70${String(n).padStart(4, '0')}`,
        userName: `${names[n % names.length]}${n >= names.length ? n : ''}`,
        picks: [option],
        at: now - (n + 1) * 7 * M,
      });
      n++;
    }
  return out;
}

const rules = (patch: Partial<PollRules> = {}): PollRules => ({
  style: 'buttons',
  anonymous: false,
  multiple: false,
  maxPicks: 1,
  changeVotes: true,
  hideResults: false,
  roles: [],
  voteTarget: 0,
  ping: '',
  ...patch,
});
const opts = (...list: string[]): PollOption[] =>
  list.map((l, i) => {
    const [emoji, ...rest] = l.split(' ');
    const hasEmoji = !/^[\p{L}\p{N}]/u.test(emoji!);
    return {
      id: `o${i + 1}`,
      emoji: hasEmoji ? emoji! : '',
      label: hasEmoji ? rest.join(' ') : l,
    };
  });

/** Sample polls in every state, so the Polls tab has something to show. */
function samplePolls(server: Server, channel: string, now: number) {
  const base = (
    id: number,
    patch: Partial<Poll> & { counts: Record<string, number> },
  ): Poll => ({
    id,
    question: '',
    options: [],
    rules: rules(),
    channelId: channel,
    messageId: `97000000000000${id}`,
    status: 'active',
    postAt: now - id * D,
    endsAt: null,
    endedAt: null,
    endedWhy: null,
    endedBy: '',
    picked: null,
    authorId: '200000000000000001',
    authorName: 'quinn.dev',
    createdAt: now - id * D,
    voters: 0,
    ...patch,
  });
  const plus = server.plan === 'plus';
  const list: Poll[] = [
    base(6, {
      question: 'What should our next game night be?',
      options: opts(
        '⛏️ Minecraft',
        '🚀 Among Us',
        '📦 Jackbox',
        '🎨 Gartic Phone',
      ),
      counts: { o1: 14, o2: 9, o3: 6, o4: 3 },
      postAt: now - 5 * H,
      endsAt: now + 19 * H,
      rules: rules({ voteTarget: 50 }),
    }),
    base(5, {
      question: 'Which channels would you like added?',
      options: opts(
        '📸 Pets',
        '🍳 Cooking',
        '🎵 Music share',
        '📚 Book club',
        '🌱 Gardening',
        ...(plus ? ['🎬 Movies', '✈️ Travel', '🧶 Crafts'] : []),
      ),
      counts: {
        o1: 11,
        o2: 8,
        o3: 12,
        o4: 4,
        o5: 2,
        ...(plus ? { o6: 7, o7: 5, o8: 3 } : {}),
      },
      postAt: now - 2 * D,
      // On Free it has ended, so the plan's 3 polls at once aren't all used.
      ...(plus
        ? { endsAt: now + 5 * D }
        : {
            status: 'ended' as const,
            endsAt: now - D,
            endedAt: now - D,
            endedWhy: 'time' as const,
          }),
      rules: rules({
        style: 'menu',
        multiple: true,
        maxPicks: 3,
        hideResults: true,
      }),
    }),
    base(4, {
      question: 'Should we start a weekly art challenge?',
      options: opts('👍 Yes please', '👎 Not for me', '🤷 Don’t mind'),
      counts: {},
      status: 'scheduled',
      messageId: null,
      postAt: now + 2 * D + 3 * H,
      endsAt: now + 4 * D + 3 * H,
      rules: rules({ ping: '' }),
    }),
    base(3, {
      question: 'Best time for community events?',
      options: opts(
        '🌅 Saturday morning',
        '🌆 Saturday evening',
        '🌙 Sunday evening',
      ),
      counts: { o1: 7, o2: 15, o3: 15 },
      status: 'ended',
      endsAt: now - 3 * D,
      endedAt: now - 3 * D,
      endedWhy: 'time',
    }),
    base(2, {
      question: 'Pineapple on pizza?',
      options: opts('🍍 Of course', '🚫 Never'),
      counts: { o1: 21, o2: 21 },
      status: 'ended',
      endedAt: now - 5 * D,
      endedWhy: 'staff',
      endedBy: 'rhea',
      picked: 'o1',
      rules: rules({ anonymous: true }),
    }),
    base(1, {
      question: 'Name for the server mascot?',
      options: opts('✨ Sparky', '🦊 Ember', '🌟 Nova'),
      counts: { o1: 4, o2: 18, o3: 9 },
      status: 'ended',
      endedAt: now - 8 * D,
      endedWhy: 'votes',
      rules: rules({ voteTarget: 31 }),
    }),
  ];
  const votes = new Map<number, PollVoter[]>();
  for (const p of list) {
    const v = votersFor(p.counts, now, p.rules.multiple);
    votes.set(p.id, v);
    p.voters = v.length;
  }
  return { list, votes };
}

export function createPollsMock(h: Helpers) {
  const state = new Map<
    string,
    {
      config: Polls;
      list: Poll[];
      votes: Map<number, PollVoter[]>;
      log: PollLogEntry[];
    }
  >();
  let nextLog = 100;
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const channels = h.channels(serverId);
    const channel =
      channels.find((c) => c.name === 'general')?.id ?? channels[0]?.id ?? '';
    const config = pollDefault(channel);
    const roles = h.roles(serverId);
    const mod = roles.find((r) => /mod/i.test(r.name));
    if (mod) config.creators = [mod.id];
    const { list, votes } = samplePolls(h.server(serverId), channel, now);
    const entry = (
      id: string,
      action: PollLogEntry['action'],
      poll: number,
      detail: string,
      at: number,
      who = { id: '200000000000000001', name: 'quinn.dev' },
    ): PollLogEntry => ({
      id,
      action,
      poll,
      userId: who.id,
      userName: who.name,
      detail,
      at,
    });
    const sparko = { id: '0', name: 'Sparko' };
    s = {
      config,
      list,
      votes,
      log: [
        entry('p9', 'posted', 6, `<#${channel}>`, now - 5 * H),
        entry(
          'p8',
          'created',
          6,
          'What should our next game night be?',
          now - 5 * H,
        ),
        entry(
          'p7',
          'created',
          4,
          'Should we start a weekly art challenge? (posts later)',
          now - D,
        ),
        entry('p6', 'posted', 5, `<#${channel}>`, now - 2 * D),
        entry('p5', 'ended', 3, 'time', now - 3 * D, sparko),
        entry('p4', 'rerolled', 2, 'Of course', now - 5 * D, {
          id: '200000000000000002',
          name: 'rhea',
        }),
        entry('p3', 'ended', 2, 'staff', now - 5 * D, {
          id: '200000000000000002',
          name: 'rhea',
        }),
        entry('p2', 'ended', 1, 'votes', now - 8 * D, sparko),
        entry(
          'p1',
          'failed',
          7,
          '“Movie night?” wasn’t posted: Sparko can’t post in that channel. Give it View Channel, Send Messages and Embed Links there.',
          now - 9 * D,
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
  const open = (serverId: string) =>
    of(serverId).list.filter((p) => p.status !== 'ended').length;
  const find = (serverId: string, id: number) => {
    const p = of(serverId).list.find((x) => x.id === id);
    if (!p) throw new Error('That poll was already deleted.');
    return p;
  };
  const log = (
    serverId: string,
    action: PollLogEntry['action'],
    poll: number,
    detail: string,
  ) =>
    of(serverId).log.unshift({
      id: `p${nextLog++}`,
      action,
      poll,
      userId: h.you().id,
      userName: h.you().name,
      detail,
      at: Date.now(),
    });
  const sorted = (list: Poll[]) =>
    [...list].sort(
      (a, b) =>
        ['active', 'scheduled', 'ended'].indexOf(a.status) -
          ['active', 'scheduled', 'ended'].indexOf(b.status) || b.id - a.id,
    );

  const api: Api = {
    async getPolls(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy<PollsState>({
          on: h.isOn(serverId),
          config: s.config,
          limits: pollLimits(h.server(serverId).plan),
          open: open(serverId),
          channels: h.channels(serverId),
          roles: h.roles(serverId),
          log: s.log,
        }),
      );
    },
    async savePolls(serverId, change) {
      guard(serverId);
      const issue = pollsIssue(change.config, {
        templates: h.templates(serverId),
        roles: new Set(h.roles(serverId).map((r) => r.id)),
      });
      if (issue) throw new Error(issue.problem);
      of(serverId).config = h.copy(change.config);
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async listPolls(serverId) {
      return h.wait(
        h.copy({ polls: sorted(of(serverId).list), open: open(serverId) }),
      );
    },
    async createPoll(serverId, input) {
      guard(serverId);
      const now = Date.now();
      const issue = pollDraftIssue(input, {
        plan: h.server(serverId).plan,
        now,
        active: open(serverId),
        roles: new Set(h.roles(serverId).map((r) => r.id)),
        channels: new Set(
          h
            .channels(serverId)
            .filter((c) => c.canPost)
            .map((c) => c.id),
        ),
      });
      if (issue) throw new Error(issue.problem);
      const d = cleanDraft(input);
      const s = of(serverId);
      const id =
        Math.max(
          0,
          ...s.list.map((p) => p.id),
          ...s.log.map((e) => e.poll ?? 0),
        ) + 1;
      const postAt = Math.max(now, d.postAt ?? now);
      const later = postAt > now + M;
      const length =
        d.end.kind === 'after' ? parseDuration(d.end.duration) : null;
      const poll: Poll = {
        id,
        question: d.question,
        options: d.options,
        rules: d.rules,
        channelId: d.channel,
        messageId: later ? null : `98000000000000${id}`,
        status: later ? 'scheduled' : 'active',
        postAt,
        endsAt:
          d.end.kind === 'at' ? d.end.at : length ? postAt + length : null,
        endedAt: null,
        endedWhy: null,
        endedBy: '',
        picked: null,
        authorId: h.you().id,
        authorName: h.you().name,
        createdAt: now,
        counts: {},
        voters: 0,
      };
      s.list.push(poll);
      s.votes.set(id, []);
      log(serverId, 'created', id, d.question);
      if (!later) log(serverId, 'posted', id, `<#${d.channel}>`);
      return h.wait({ poll: h.copy(poll) });
    },
    async endPoll(serverId, id) {
      guard(serverId);
      const p = find(serverId, id);
      if (p.status !== 'active')
        throw new Error(
          p.status === 'ended'
            ? 'This poll has already ended.'
            : 'This poll hasn’t been posted yet. Delete it instead.',
        );
      Object.assign(p, {
        status: 'ended',
        endedAt: Date.now(),
        endedWhy: 'staff',
        endedBy: h.you().name,
      });
      log(serverId, 'ended', id, 'staff');
      return h.wait(undefined);
    },
    async rerollPoll(serverId, id) {
      guard(serverId);
      const p = find(serverId, id);
      const { winners, tie } = pollResults(p);
      if (p.status !== 'ended' || !tie)
        throw new Error('This poll has a clear winner, so there’s no tie.');
      const pool = winners.filter((o) => o.id !== p.picked);
      const pick = pool[Math.floor(Math.random() * pool.length)]!;
      p.picked = pick.id;
      log(serverId, 'rerolled', id, pick.label);
      return h.wait({ picked: { label: pick.label } });
    },
    async postPollNow(serverId, id) {
      guard(serverId);
      const p = find(serverId, id);
      if (p.status !== 'scheduled')
        throw new Error('This poll has already been posted.');
      const now = Date.now();
      if (p.endsAt) p.endsAt = now + (p.endsAt - p.postAt);
      Object.assign(p, {
        status: 'active',
        postAt: now,
        messageId: `98000000000000${id}`,
      });
      log(serverId, 'posted', id, `<#${p.channelId}>`);
      return h.wait(undefined);
    },
    async deletePoll(serverId, id) {
      guard(serverId);
      const p = find(serverId, id);
      const s = of(serverId);
      s.list = s.list.filter((x) => x !== p);
      s.votes.delete(id);
      log(serverId, 'deleted', id, p.question);
      return h.wait(undefined);
    },
    async pollVoters(serverId, id) {
      const p = find(serverId, id);
      return h.wait(
        h.copy({
          anonymous: p.rules.anonymous,
          voters: p.rules.anonymous ? [] : (of(serverId).votes.get(id) ?? []),
        }),
      );
    },
    async testPoll(serverId, channel) {
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
    /** Templates Polls use, for the tags in Message Studio. */
    uses: (serverId: string) => {
      const c = of(serverId).config;
      return [
        ...(c.message
          ? [{ id: c.message, where: 'Polls (the poll message)' }]
          : []),
        ...(c.results
          ? [{ id: c.results, where: 'Polls (the results message)' }]
          : []),
      ];
    },
  };
}
