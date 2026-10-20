import type {
  Channel,
  PanelApi,
  RoleOption,
  SBState,
  Server,
  Session,
} from './types';
import {
  sbBoardDefault,
  sbDefault,
  sbIssue,
  sbLimits,
  type SbBlocked,
  type SbEntry,
  type SbLogEntry,
  type Starboard,
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
  | 'getStarboard'
  | 'saveStarboard'
  | 'listStarred'
  | 'removeStarred'
  | 'freezeStarred'
  | 'blockStarboard'
  | 'unblockStarboard'
  | 'testStarboard'
>;

const H = 3_600_000;
const D = 24 * H;
const avatar = (n: number) =>
  `https://cdn.discordapp.com/embed/avatars/${n}.png`;

/** Sample starred messages, so Storage and Logs have something to show. */
function sampleEntries(
  now: number,
  channel: (name: string) => string,
  boards: { id: string; channel: string; threshold: number }[],
): SbEntry[] {
  const people = [
    ['7001', 'tomoko'],
    ['7002', 'ayo'],
    ['7003', 'rhea'],
    ['7004', 'mossy_bun'],
    ['7005', 'kestrel'],
    ['7006', 'pixelpaws'],
  ] as const;
  const rows: [number, string, string, number, string | null, number][] = [
    // [person, channel, text, stars, picture, hours ago]
    [
      3,
      'art-share',
      'Finished the bloom jam piece! Watercolour and a lot of patience 🌸',
      31,
      null,
      20,
    ],
    [
      0,
      'general',
      'whoever named the voice channels after cheeses deserves a raise',
      18,
      null,
      30,
    ],
    [5, 'art-share', '', 12, 'pic', 52],
    [
      1,
      'general',
      'PSA: the bot now counts stars. Behave accordingly ⭐',
      9,
      null,
      70,
    ],
    [
      4,
      'introductions',
      'Hi all! I make tiny pixel worlds and very loud music. Glad to be here.',
      5,
      null,
      6,
    ],
    [
      2,
      'general',
      'Server birthday is next week and I have Plans™',
      3,
      null,
      6 * 24,
    ],
  ];
  const out: SbEntry[] = [];
  rows.forEach(([who, where, text, stars, picture, ago], i) => {
    const [authorId, authorName] = people[who]!;
    for (const [j, b] of boards.entries()) {
      if (stars < b.threshold) continue;
      out.push({
        boardId: b.id,
        messageId: `97000000000000${String(i).padStart(4, '0')}`,
        channelId: channel(where),
        authorId,
        authorName,
        authorAvatar: avatar(who % 5),
        // Without the Message Content Intent, Discord keeps text back.
        content: picture ? (i === 2 ? null : '') : text,
        image: picture ? avatar(4) : '',
        stars,
        postChannelId: b.channel,
        postId: `98000000000000${j}${String(i).padStart(3, '0')}`,
        frozen: i === 1 && j === 0,
        deleted: i === 3,
        messageAt: now - ago * H,
        postedAt: now - ago * H + 2 * H,
        updatedAt: now - H,
      });
    }
  });
  return out;
}

export function createStarboardMock(h: Helpers) {
  const state = new Map<
    string,
    {
      config: Starboard;
      entries: SbEntry[];
      blocked: SbBlocked[];
      log: SbLogEntry[];
    }
  >();
  let nextLog = 100;
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const channels = h.channels(serverId);
    const byName = (name: string) =>
      channels.find((c) => c.name === name)?.id ?? channels[0]?.id ?? '';
    const plus = h.server(serverId).plan === 'plus';
    const config = sbDefault(byName('starboard'));
    config.boards[0]!.channels = [byName('mod-log'), byName('ticket-logs')];
    if (plus) {
      config.boards[0]!.emojis = ['⭐', '🌟'];
      config.boards.push(
        sbBoardDefault(byName('hall-of-fame'), {
          id: 'hof',
          name: 'Hall of fame',
          emojis: ['⭐', '🌟'],
          threshold: 15,
          belowThreshold: 'keep',
          onDelete: 'keep',
        }),
      );
    }
    const entries = sampleEntries(now, byName, config.boards);
    const log = (
      action: SbLogEntry['action'],
      e: SbEntry | undefined,
      patch: Partial<SbLogEntry>,
    ): SbLogEntry => {
      const board = config.boards.find((b) => b.id === e?.boardId);
      return {
        id: `s${nextLog++}`,
        action,
        boardId: board?.id ?? '',
        boardName: board?.name ?? '',
        messageId: e?.messageId ?? '',
        channelId: e?.channelId ?? '',
        authorId: e?.authorId ?? '',
        authorName: e?.authorName ?? '',
        userId: '0',
        userName: 'Sparko',
        stars: e?.stars ?? 0,
        detail: '',
        at: now,
        ...patch,
      };
    };
    const first = entries[0];
    const second = entries.find((e) => e.authorName === 'tomoko');
    s = {
      config,
      entries,
      blocked: [
        {
          kind: 'member',
          id: '7010',
          channelId: '',
          name: 'spammy_dan',
          preview: '',
          byName: 'rhea',
          at: now - 3 * D,
        },
        {
          kind: 'message',
          id: '970000000000009001',
          channelId: byName('general'),
          name: 'kit',
          preview: 'vote for my minecraft server in the bio!!',
          byName: 'quinn.dev',
          at: now - 5 * D,
        },
      ],
      log: [
        log('milestone', first, { stars: 25, at: now - 2 * H }),
        log('frozen', second, {
          userId: '200000000000000002',
          userName: 'rhea',
          at: now - 5 * H,
        }),
        log('milestone', first, { stars: 10, at: now - 18 * H }),
        log('posted', first, { stars: 3, at: now - 19 * H }),
        log('removed', entries.at(-1), {
          stars: 2,
          detail: 'below',
          at: now - 26 * H,
        }),
        log('blocked', undefined, {
          authorId: '7010',
          authorName: 'spammy_dan',
          userId: '200000000000000002',
          userName: 'rhea',
          at: now - 3 * D,
        }),
        log('failed', undefined, {
          boardId: config.boards[0]!.id,
          boardName: config.boards[0]!.name,
          detail:
            'Sparko can’t post in Starboard’s channel. Give it View Channel, Send Messages and Embed Links there.',
          at: now - 4 * D,
        }),
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
    const limits = sbLimits(h.server(serverId).plan);
    const count = of(serverId).entries.length;
    return {
      count,
      limit: limits.posts,
      perKb: limits.perKb,
      usedKb: count * limits.perKb,
      limitMb: limits.storageMb,
    };
  };
  const find = (
    serverId: string,
    { boardId, messageId }: { boardId: string; messageId: string },
  ) => {
    const e = of(serverId).entries.find(
      (x) => x.boardId === boardId && x.messageId === messageId,
    );
    if (!e) throw new Error('That message isn’t on the board any more.');
    return e;
  };
  const addLog = (
    serverId: string,
    action: SbLogEntry['action'],
    patch: Partial<SbLogEntry>,
  ) => {
    of(serverId).log.unshift({
      id: `s${nextLog++}`,
      action,
      boardId: '',
      boardName: '',
      messageId: '',
      channelId: '',
      authorId: '',
      authorName: '',
      userId: h.you().id,
      userName: h.you().name,
      stars: 0,
      detail: '',
      at: Date.now(),
      ...patch,
    });
  };
  const fromEntry = (serverId: string, e: SbEntry) => ({
    boardId: e.boardId,
    boardName:
      of(serverId).config.boards.find((b) => b.id === e.boardId)?.name ?? '',
    messageId: e.messageId,
    channelId: e.channelId,
    authorId: e.authorId,
    authorName: e.authorName,
    stars: e.stars,
  });

  const api: Api = {
    async getStarboard(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy<SBState>({
          on: h.isOn(serverId),
          config: s.config,
          limits: sbLimits(h.server(serverId).plan),
          storage: storage(serverId),
          channels: h.channels(serverId),
          roles: h.roles(serverId),
          log: s.log,
          blocked: s.blocked,
        }),
      );
    },
    async saveStarboard(serverId, change) {
      guard(serverId);
      const issue = sbIssue(change.config, {
        plan: h.server(serverId).plan,
        templates: h.templates(serverId),
        roles: new Map(
          h.roles(serverId).map((r) => [r.id, r.assignable !== false]),
        ),
      });
      if (issue) throw new Error(issue.problem);
      const s = of(serverId);
      s.config = h.copy(change.config);
      // A removed board takes its starred messages with it.
      const ids = new Set(s.config.boards.map((b) => b.id));
      s.entries = s.entries.filter((e) => ids.has(e.boardId));
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async listStarred(serverId, { board, sort, query }) {
      const s = of(serverId);
      const q = query.trim().toLowerCase();
      const entries = s.entries
        .filter(
          (e) =>
            (!board || e.boardId === board) &&
            (!q ||
              e.authorId === q ||
              e.messageId === q ||
              e.authorName.toLowerCase().includes(q) ||
              (e.content ?? '').toLowerCase().includes(q)),
        )
        .sort((a, b) =>
          sort === 'newest'
            ? b.messageAt - a.messageAt
            : b.stars - a.stars || b.messageAt - a.messageAt,
        );
      return h.wait(
        h.copy({ entries, storage: storage(serverId), blocked: s.blocked }),
      );
    },
    async removeStarred(serverId, target) {
      guard(serverId);
      const e = find(serverId, target);
      const s = of(serverId);
      s.entries = s.entries.filter((x) => x !== e);
      addLog(serverId, 'removed', {
        ...fromEntry(serverId, e),
        detail: 'staff',
      });
      return h.wait(undefined);
    },
    async freezeStarred(serverId, target, frozen) {
      guard(serverId);
      const e = find(serverId, target);
      if (e.frozen !== frozen) {
        e.frozen = frozen;
        addLog(
          serverId,
          frozen ? 'frozen' : 'unfrozen',
          fromEntry(serverId, e),
        );
      }
      return h.wait(undefined);
    },
    async blockStarboard(serverId, target) {
      guard(serverId);
      const s = of(serverId);
      if (s.blocked.some((b) => b.kind === target.kind && b.id === target.id))
        return h.wait(undefined);
      const e = s.entries.find((x) => x.messageId === target.id);
      s.blocked.unshift({
        kind: target.kind,
        id: target.id,
        channelId: target.kind === 'message' ? target.channelId : '',
        name: target.kind === 'member' ? target.name : (e?.authorName ?? ''),
        preview: (e?.content ?? '').slice(0, 200),
        byName: h.you().name,
        at: Date.now(),
      });
      if (target.kind === 'message') {
        s.entries = s.entries.filter((x) => x.messageId !== target.id);
        addLog(
          serverId,
          'blocked',
          e ? fromEntry(serverId, e) : { messageId: target.id },
        );
      } else
        addLog(serverId, 'blocked', {
          authorId: target.id,
          authorName: target.name,
        });
      return h.wait(undefined);
    },
    async unblockStarboard(serverId, kind, id) {
      guard(serverId);
      const s = of(serverId);
      const was = s.blocked.find((b) => b.kind === kind && b.id === id);
      if (!was) throw new Error('That was already unblocked.');
      s.blocked = s.blocked.filter((b) => b !== was);
      addLog(serverId, 'unblocked', {
        ...(kind === 'message'
          ? { messageId: id, channelId: was.channelId }
          : { authorId: id }),
        authorName: was.name,
      });
      return h.wait(undefined);
    },
    async testStarboard(serverId, _board, channel) {
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
    /** Templates boards post with, for the tags in Message Studio. */
    uses: (serverId: string) =>
      of(serverId)
        .config.boards.filter((b) => b.message)
        .map((b) => ({ id: b.message, where: `Starboard (${b.name} posts)` })),
  };
}
