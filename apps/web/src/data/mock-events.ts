import type {
  Channel,
  EVState,
  PanelApi,
  RoleOption,
  Server,
  Session,
  VoiceChannel,
} from './types';
import {
  evBlank,
  evDefault,
  evEventIssue,
  evIssue,
  evLimits,
  evOpen,
  zonedTime,
  zoneParts,
  type EvAnswer,
  type EvDetails,
  type EvEvent,
  type EvLogEntry,
  type EvRsvp,
  type Events,
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
  | 'getEvents'
  | 'saveEvents'
  | 'listEvents'
  | 'createEvent'
  | 'updateEvent'
  | 'cancelEvent'
  | 'deleteEvent'
  | 'listRsvps'
  | 'setNoShow'
  | 'testEvent'
>;

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
const avatar = (n: number) =>
  `https://cdn.discordapp.com/embed/avatars/${n % 6}.png`;

/** The sample servers' event roles. */
const eventRoles: RoleOption[] = [
  { id: '9310', name: 'Attending 🎟️', color: '#5865F2' },
  { id: '9311', name: 'Event pings', color: '#FACC15' },
];
/** The sample servers' voice and stage channels. */
const voice: VoiceChannel[] = [
  { id: '8100000000000001', name: 'Lounge', category: 'Voice', stage: false },
  {
    id: '8100000000000002',
    name: 'Movie room',
    category: 'Voice',
    stage: false,
  },
  { id: '8100000000000003', name: 'Town hall', category: 'Voice', stage: true },
];

/** Members of the sample servers who answer events. */
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
  'juniper',
  'wren',
  'ash',
].map((name, i) => ({
  userId: `72${String(i).padStart(4, '0')}`,
  name,
  avatar: avatar(i),
}));

type Sample = { event: EvEvent; rsvps: EvRsvp[] };

const counts = (rsvps: EvRsvp[]) => {
  const n = (a: EvAnswer) => rsvps.filter((r) => r.answer === a).length;
  return {
    going: n('going'),
    maybe: n('maybe'),
    no: n('no'),
    waitlist: n('waitlist'),
  };
};

/** Events around now, so every list and status has something to show. */
function samples(c: Events, now: number, plus: boolean): Sample[] {
  const hour = (t: number) => Math.round(t / H) * H;
  /** A day from today at a time of day, in the server's time zone. */
  const on = (days: number, h: number) =>
    zonedTime(
      { ...zoneParts(now + days * D, c.timeZone), hour: h, minute: 0 },
      c.timeZone,
    );
  let n = 0;
  const make = (
    patch: Partial<EvDetails>,
    status: EvEvent['status'],
    answers: [number, EvAnswer][],
    more: Partial<EvEvent> = {},
  ): Sample => {
    n++;
    const start = patch.start ?? hour(now + D);
    const event: EvEvent = {
      ...evBlank(c, now),
      title: '',
      start,
      end: start + 2 * H,
      ...patch,
      number: n,
      status,
      hostId: '200000000000000001',
      hostName: 'quinn.dev',
      channelId: c.channel,
      messageId: `9500000000000${String(n).padStart(4, '0')}`,
      discordEventId: c.sync ? `9600000000000${n}` : null,
      reminded: [],
      startPinged: status !== 'scheduled',
      series: null,
      counts: { going: 0, maybe: 0, no: 0, waitlist: 0 },
      createdAt: now - (10 - n) * D,
      updatedAt: now - (10 - n) * D,
      ...more,
    };
    const rsvps = answers.map(([i, answer], k) => ({
      userId: people[i]!.userId,
      name: people[i]!.name,
      avatar: people[i]!.avatar,
      answer,
      at: event.createdAt + (k + 1) * 37 * M,
      noShow: false,
    }));
    event.counts = counts(rsvps);
    return { event, rsvps };
  };
  const list: Sample[] = [
    make(
      {
        title: 'Speedrun relay',
        description:
          'Teams of three pass the controller every level. Spectators welcome in the Lounge.',
        start: hour(now - H),
        end: hour(now - H) + 3 * H,
        place: { ...voice[0]!, stage: false },
        reminders: ['1h'],
      },
      'started',
      [
        [0, 'going'],
        [1, 'going'],
        [2, 'going'],
        [3, 'maybe'],
        [4, 'no'],
      ],
    ),
    make(
      {
        title: 'Movie night: Spirited Away',
        description:
          'We’re watching together in the Movie room. Grab some snacks and bring your comfiest blanket. 🍿',
        start: on(1, 20),
        place: { ...voice[1]!, stage: false },
        capacity: 8,
        pingRole: eventRoles[1]!.id,
        reminders: ['1d', '1h'],
        remindMaybe: true,
      },
      'scheduled',
      [
        [5, 'going'],
        [6, 'going'],
        [7, 'going'],
        [8, 'going'],
        [9, 'going'],
        [10, 'going'],
        [11, 'going'],
        [12, 'going'],
        [13, 'waitlist'],
        [14, 'waitlist'],
        [15, 'maybe'],
        [16, 'maybe'],
        [17, 'no'],
      ],
    ),
    make(
      {
        title: 'Weekly art jam',
        description:
          'Draw along to a theme picked on the night. Share your piece in #art-share after.',
        start: on(5, 18),
        location: 'Shared whiteboard: https://example.com/board',
        repeat: 'weekly',
        reminders: ['1h', '10m'],
      },
      'scheduled',
      [
        [2, 'going'],
        [8, 'going'],
        [3, 'maybe'],
      ],
      { series: 1 },
    ),
    make(
      {
        title: 'Community Q&A',
        description: 'Ask the staff team anything.',
        start: on(9, 17),
        place: { ...voice[2]!, stage: true },
        postAt: on(7, 12),
      },
      'scheduled',
      [],
      { messageId: null, channelId: null },
    ),
    make(
      {
        title: 'Game night: Among Us',
        start: on(-3, 21),
        location: 'Among Us lobby, code in #general',
        capacity: 10,
      },
      'ended',
      [
        [0, 'going'],
        [1, 'going'],
        [6, 'going'],
        [9, 'going'],
        [12, 'going'],
        [4, 'maybe'],
      ],
    ),
    make(
      {
        title: 'Minecraft build-off',
        start: on(-6, 19),
        location: 'play.pixelplaza.example',
      },
      'cancelled',
      [
        [3, 'going'],
        [10, 'going'],
      ],
    ),
  ];
  // The Game night had a no-show.
  list[4]!.rsvps[3]!.noShow = true;
  if (plus)
    list.push(
      make(
        {
          title: 'Book club: chapter 4',
          start: on(3, 19),
          place: { ...voice[0]!, stage: false },
          repeat: 'biweekly',
          reminders: ['1d', '2h', '15m'],
        },
        'scheduled',
        [
          [4, 'going'],
          [7, 'going'],
          [11, 'going'],
          [15, 'maybe'],
        ],
      ),
    );
  return list;
}

export function createEventsMock(h: Helpers) {
  const state = new Map<
    string,
    { config: Events; list: Sample[]; log: EvLogEntry[] }
  >();
  const of = (serverId: string) => {
    let s = state.get(serverId);
    if (s) return s;
    const now = Date.now();
    const plus = h.server(serverId).plan === 'plus';
    const channels = h.channels(serverId);
    const config = evDefault(
      channels.find((c) => c.name === 'general')?.id ?? channels[0]?.id ?? '',
    );
    config.timeZone = plus ? 'America/New_York' : 'Europe/London';
    config.reminders = plus ? ['1d', '1h'] : ['1h'];
    config.attending = true;
    config.attendingRole = eventRoles[0]!.id;
    if (plus) {
      config.sync = true;
      config.remindMaybe = true;
    }
    const list = samples(config, now, plus);
    const e = (n: number) => list[n - 1]!.event;
    const who = (i: number) => ({
      userId: people[i]!.userId,
      userName: people[i]!.name,
    });
    const sparko = { userId: '0', userName: 'Sparko' };
    const quinn = { userId: '200000000000000001', userName: 'quinn.dev' };
    let id = 0;
    const entry = (
      n: number,
      action: EvLogEntry['action'],
      by: { userId: string; userName: string },
      detail: string,
      ago: number,
    ): EvLogEntry => ({
      id: `e${++id}`,
      action,
      number: n,
      title: e(n).title,
      ...by,
      detail,
      at: now - ago,
    });
    s = {
      config,
      list,
      log: [
        entry(1, 'started', sparko, '3 going', H),
        entry(2, 'rsvp', who(14), 'joined the waitlist for', 2 * H),
        entry(2, 'promoted', who(12), '', 3 * H),
        entry(2, 'rsvp', who(5), 'is going to', 5 * H),
        entry(
          1,
          'reminded',
          sparko,
          'the 1h reminder went to 3 of 3 members',
          2 * H,
        ),
        entry(3, 'edited', quinn, 'start, place', D),
        entry(5, 'ended', sparko, '5 went, 1 maybe', 3 * D - 2 * H),
        entry(6, 'cancelled', quinn, '2 going were told', 6 * D + 4 * H),
        entry(
          6,
          'failed',
          sparko,
          'Sparko couldn’t add it to Discord’s events. It needs the Manage Events permission.',
          8 * D,
        ),
        entry(4, 'created', quinn, '', 9 * D),
      ].sort((a, b) => b.at - a.at),
    };
    state.set(serverId, s);
    return s;
  };
  const guard = (serverId: string) => {
    if (h.server(serverId).paused)
      throw new Error('This server is paused by Sparko staff.');
  };
  const rolesOf = (serverId: string) => [...h.roles(serverId), ...eventRoles];
  let nextLog = 100;
  const log = (
    serverId: string,
    e: EvEvent,
    action: EvLogEntry['action'],
    detail = '',
  ) =>
    of(serverId).log.unshift({
      id: `e${nextLog++}`,
      action,
      number: e.number,
      title: e.title,
      userId: h.you().id,
      userName: h.you().name,
      detail,
      at: Date.now(),
    });
  const find = (serverId: string, number: number) => {
    const found = of(serverId).list.find((x) => x.event.number === number);
    if (!found) throw new Error(`There’s no event #${number}.`);
    return found;
  };
  const known = (serverId: string) => ({
    roles: new Set(rolesOf(serverId).map((r) => r.id)),
    places: new Set(voice.map((v) => v.id)),
  });
  const upcoming = (serverId: string) =>
    of(serverId).list.filter((x) => evOpen(x.event));

  const api: Api = {
    async getEvents(serverId) {
      const s = of(serverId);
      const plan = h.server(serverId).plan;
      return h.wait(
        h.copy<EVState>({
          on: h.isOn(serverId),
          config: s.config,
          upcoming: upcoming(serverId).length,
          past: s.list.length - upcoming(serverId).length,
          limits: evLimits(plan),
          canSync: plan === 'plus',
          channels: h.channels(serverId),
          voice,
          roles: rolesOf(serverId),
          log: s.log,
        }),
      );
    },
    async saveEvents(serverId, change) {
      guard(serverId);
      const issue = evIssue(change.config, {
        templates: h.templates(serverId),
        plan: h.server(serverId).plan,
        roles: new Map(
          rolesOf(serverId).map((r) => [r.id, r.assignable !== false]),
        ),
      });
      if (issue) throw new Error(issue.problem);
      of(serverId).config = h.copy(change.config);
      h.setOn(serverId, change.on);
      return h.wait(undefined);
    },
    async listEvents(serverId, when) {
      const list = of(serverId)
        .list.map((x) => x.event)
        .filter((e) => (when === 'upcoming' ? evOpen(e) : !evOpen(e)));
      list.sort((a, b) =>
        when === 'upcoming' ? a.start - b.start : b.end - a.end,
      );
      return h.wait(h.copy(list));
    },
    async createEvent(serverId, details) {
      guard(serverId);
      const s = of(serverId);
      const now = Date.now();
      const plan = h.server(serverId).plan;
      const issue = evEventIssue(details, { now, plan, ...known(serverId) });
      if (issue) throw new Error(issue.problem);
      const max = evLimits(plan).upcoming;
      if (upcoming(serverId).length >= max)
        throw new Error(
          `Your plan has up to ${max} upcoming events. Cancel or delete one, or wait for one to end.`,
        );
      const number = Math.max(0, ...s.list.map((x) => x.event.number)) + 1;
      const event: EvEvent = {
        ...h.copy(details),
        number,
        status: 'scheduled',
        hostId: h.you().id,
        hostName: h.you().name,
        channelId: details.postAt ? null : s.config.channel,
        messageId: details.postAt ? null : `95${now}`,
        discordEventId: null,
        reminded: [],
        startPinged: false,
        series: null,
        counts: { going: 0, maybe: 0, no: 0, waitlist: 0 },
        createdAt: now,
        updatedAt: now,
      };
      s.list.push({ event, rsvps: [] });
      log(serverId, event, 'created');
      return h.wait(h.copy(event));
    },
    async updateEvent(serverId, number, details) {
      guard(serverId);
      const x = find(serverId, number);
      if (!evOpen(x.event))
        throw new Error(`Event #${number} is over, so it can’t change.`);
      const issue = evEventIssue(details, {
        now: Date.now(),
        plan: h.server(serverId).plan,
        editing: x.event,
        ...known(serverId),
      });
      if (issue) throw new Error(issue.problem);
      x.event = { ...x.event, ...h.copy(details), updatedAt: Date.now() };
      // More room moves people off the waitlist.
      for (const r of x.rsvps.filter((r) => r.answer === 'waitlist')) {
        if (
          x.event.capacity &&
          x.rsvps.filter((g) => g.answer === 'going').length >= x.event.capacity
        )
          break;
        r.answer = 'going';
      }
      x.event.counts = counts(x.rsvps);
      log(serverId, x.event, 'edited');
      return h.wait(h.copy(x.event));
    },
    async cancelEvent(serverId, number) {
      guard(serverId);
      const x = find(serverId, number);
      if (!evOpen(x.event))
        throw new Error(`Event #${number} has already ended.`);
      x.event = { ...x.event, status: 'cancelled', updatedAt: Date.now() };
      log(
        serverId,
        x.event,
        'cancelled',
        x.event.counts.going ? `${x.event.counts.going} going were told` : '',
      );
      return h.wait(undefined);
    },
    async deleteEvent(serverId, number) {
      guard(serverId);
      const s = of(serverId);
      const x = find(serverId, number);
      s.list = s.list.filter((y) => y !== x);
      log(serverId, x.event, 'deleted');
      return h.wait(undefined);
    },
    async listRsvps(serverId, number) {
      return h.wait(h.copy(find(serverId, number).rsvps));
    },
    async setNoShow(serverId, number, userId, noShow) {
      guard(serverId);
      const r = find(serverId, number).rsvps.find((x) => x.userId === userId);
      if (!r) throw new Error('They didn’t answer this event.');
      r.noShow = noShow;
      return h.wait(undefined);
    },
    async testEvent(serverId, channel) {
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
    /** Templates Events use, for the tags in Message Studio. */
    uses: (serverId: string) => {
      const m = of(serverId).config.messages;
      const where = {
        event: 'Events (Event)',
        reminder: 'Events (Reminder DM)',
        cancelled: 'Events (Cancelled DM)',
        waitlist: 'Events (Waitlist DM)',
      } as const;
      return (Object.keys(where) as (keyof typeof where)[])
        .filter((k) => m[k])
        .map((k) => ({ id: m[k], where: where[k] }));
    },
  };
}
