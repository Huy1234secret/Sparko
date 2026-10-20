import type {
  AvatarColor,
  Channel,
  PanelApi,
  Person,
  Server,
  ServerEmoji,
  Session,
  StudioFolder,
  StudioMessage,
  StudioState,
  StudioTemplate,
  Ticket,
  TicketDetail,
  TicketMessage,
  TicketPanel,
  TicketsState,
  RRLogEntry,
  RRTemplate,
} from './types';
import {
  applyMove,
  folderTree,
  itemsIn,
  movesIntoItself,
  nameTaken,
  uniqueTemplateName,
} from './library';
import { greetPresets, parseMessageLink, rrDefault } from './studio-format';

type Helpers = {
  wait: <T>(value: T, slow?: boolean) => Promise<T>;
  copy: <T>(value: T) => T;
  server: (id: string) => Server;
  channels: (serverId: string) => Channel[];
  you: () => Session['user'];
  /** Templates Welcome messages send, and in which message. */
  welcomeUses?: (serverId: string) => { id: string; where: string }[];
  /** Templates Suggestions use, and for what. */
  suggestionUses?: (serverId: string) => { id: string; where: string }[];
  /** Templates Polls use, and for what. */
  pollUses?: (serverId: string) => { id: string; where: string }[];
  /** Templates starboard posts use, and on which board. */
  starboardUses?: (serverId: string) => { id: string; where: string }[];
  /** Templates Birthdays use, and for which message. */
  birthdayUses?: (serverId: string) => { id: string; where: string }[];
  /** Templates Questions & answers use, and for what. */
  questionUses?: (serverId: string) => { id: string; where: string }[];
  /** Templates invite tracking uses, and for which message. */
  inviteUses?: (serverId: string) => { id: string; where: string }[];
  /** Templates Events use, and for which message. */
  eventUses?: (serverId: string) => { id: string; where: string }[];
};

type SupportApi = Pick<
  PanelApi,
  | 'listTickets'
  | 'getTicket'
  | 'sendTicketMessage'
  | 'updateTicket'
  | 'closeTicket'
  | 'reopenTicket'
  | 'getTickets'
  | 'saveTickets'
  | 'getStudio'
  | 'publishStudio'
  | 'saveTemplate'
  | 'updateTemplate'
  | 'cloneTemplate'
  | 'deleteTemplate'
  | 'addFolder'
  | 'renameFolder'
  | 'deleteFolder'
  | 'moveLibraryItem'
  | 'postStudioTest'
  | 'editStudioMessage'
  | 'uploadImage'
  | 'listServerEmojis'
  | 'getReactionRoles'
  | 'addReactionRole'
  | 'saveReactionRole'
  | 'cloneReactionRole'
  | 'deleteReactionRole'
>;

/** Pretend server emojis, drawn as small pictures so they work offline. */
const emojiPicture = (fill: string, text: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${fill}"/><text x="16" y="21" font-family="sans-serif" font-size="14" font-weight="700" text-anchor="middle" fill="#fff">${text}</text></svg>`,
  )}`;
const sampleEmojis: ServerEmoji[] = [
  {
    id: '9100',
    name: 'pixel_heart',
    animated: false,
    url: emojiPicture('#ED4245', '♥'),
  },
  {
    id: '9101',
    name: 'jam',
    animated: false,
    url: emojiPicture('#FACC15', 'J'),
  },
  {
    id: '9102',
    name: 'gg',
    animated: false,
    url: emojiPicture('#5865F2', 'GG'),
  },
  {
    id: '9103',
    name: 'sparkle',
    animated: true,
    url: emojiPicture('#57F287', '✦'),
  },
];

const people: Record<string, Partial<Person>> = {
  tomoko: {
    color: 4,
    joined: 'Today',
    account: '3 years old',
    roles: 'None yet',
  },
  'nadia.r': {
    color: 5,
    joined: '2 days ago',
    account: '1 year old',
    roles: 'Member',
  },
  kestrel: {
    color: 1,
    joined: '6 days ago',
    account: '9 days old',
    roles: 'Member',
    newAccount: true,
  },
  mossy_bun: { color: 6 },
  'quiet.fox': { color: 3 },
  pebble: { color: 5 },
  'jun.k': { color: 2 },
  arlo: { color: 4 },
  'sunny.d': { color: 6 },
  bramble: { color: 1 },
};
const staffColors: Record<string, AvatarColor> = { You: 2, Rhea: 5, Ayo: 3 };
const person = (name: string): Person => ({
  name,
  color: 3,
  joined: '8 months ago',
  account: '4 years old',
  roles: 'Member, Regular',
  ...people[name],
});

type Seed = Omit<Ticket, 'waitingMinutes'> & {
  waitingMinutes?: number;
  first: string;
  file?: string;
  about?: string;
  reply?: [string, string, string];
};
const seeds: Seed[] = [
  {
    number: 214,
    topic: 'Can’t see #events after verifying',
    member: 'tomoko',
    category: 'Access',
    status: 'new',
    priority: 'normal',
    assignee: null,
    lastAt: '12 min ago',
    lastBy: 'member',
    waitingMinutes: 12,
    openedAt: 'Today at 18:31',
    first:
      'hi! I clicked verify in #rules about an hour ago but #events is still hidden for me. Other channels work fine.',
  },
  {
    number: 213,
    topic: 'Someone is DMing scam links',
    member: 'nadia.r',
    category: 'Report',
    status: 'new',
    priority: 'urgent',
    assignee: null,
    lastAt: '1 h 8 min ago',
    lastBy: 'member',
    waitingMinutes: 68,
    openedAt: 'Today at 17:35',
    about: 'kestrel',
    file: 'dm-screenshot.png',
    first:
      'kestrel has been DMing new members a “free Nitro” link. I got one ten minutes after joining. Screenshot attached.',
  },
  {
    number: 212,
    topic: 'Art jam entry didn’t post',
    member: 'mossy_bun',
    category: 'Events',
    status: 'claimed',
    priority: 'normal',
    assignee: 'You',
    lastAt: '34 min ago',
    lastBy: 'member',
    waitingMinutes: 34,
    openedAt: 'Today at 16:50',
    first:
      'I submitted my piece with /jam submit but it never showed up in #art-share.',
  },
  {
    number: 211,
    topic: 'Appeal: timeout on Saturday',
    member: 'quiet.fox',
    category: 'Appeal',
    status: 'waiting',
    priority: 'normal',
    assignee: 'Rhea',
    lastAt: '2 h ago',
    lastBy: 'staff',
    openedAt: 'Today at 14:02',
    first:
      'I got timed out for spam but I was only posting links to my art. Can someone look?',
    reply: [
      'Rhea',
      'Thanks! I’m checking the AutoMod log for Saturday now.',
      'Today at 16:40',
    ],
  },
  {
    number: 210,
    topic: 'How do I get the Artist role?',
    member: 'pebble',
    category: 'Roles',
    status: 'waiting',
    priority: 'low',
    assignee: 'You',
    lastAt: '5 h ago',
    lastBy: 'staff',
    openedAt: 'Today at 12:10',
    first: 'I saw people with a purple Artist role. How do I get it?',
    reply: [
      'You',
      'Share three pieces in #art-share and an Artist can vouch for you. The role usually comes within a day.',
      'Today at 13:05',
    ],
  },
  {
    number: 209,
    topic: 'Level reset after I rejoined',
    member: 'jun.k',
    category: 'Levels',
    status: 'claimed',
    priority: 'normal',
    assignee: 'Ayo',
    lastAt: '50 min ago',
    lastBy: 'staff',
    openedAt: 'Today at 15:20',
    first: 'I left by accident and came back, and now I’m level 1 again.',
    reply: [
      'Ayo',
      'Levels are kept for 30 days after someone leaves, so we can restore yours. Give me a few minutes.',
      'Today at 17:52',
    ],
  },
  {
    number: 208,
    topic: 'Voice channel keeps kicking me',
    member: 'arlo',
    category: 'Other',
    status: 'new',
    priority: 'high',
    assignee: null,
    lastAt: '1 h 21 min ago',
    lastBy: 'member',
    waitingMinutes: 81,
    openedAt: 'Today at 17:22',
    first:
      'Every time I join Chill VC I get disconnected after about a minute.',
  },
  {
    number: 207,
    topic: 'Partnership request',
    member: 'sunny.d',
    category: 'Other',
    status: 'closed',
    priority: 'low',
    assignee: 'Rhea',
    closedBy: 'Rhea',
    closeReason: 'Not a support issue',
    lastAt: 'Yesterday',
    lastBy: 'staff',
    openedAt: 'Yesterday at 20:14',
    first:
      'Hi, I run a small art server and wanted to ask about a partnership.',
    reply: [
      'Rhea',
      'Thanks for asking! We’re not taking partners right now, but we’ll post in #announcements when we do.',
      'Yesterday at 21:02',
    ],
  },
  {
    number: 206,
    topic: 'Lost my colour role',
    member: 'bramble',
    category: 'Roles',
    status: 'closed',
    priority: 'low',
    assignee: 'You',
    closedBy: 'You',
    closeReason: 'Solved',
    lastAt: '2 days ago',
    lastBy: 'staff',
    openedAt: '11 Oct at 10:30',
    first: 'My colour role disappeared after the update.',
    reply: [
      'You',
      'Fixed. The colour menu had reset. It’s back now.',
      '11 Oct at 10:44',
    ],
  },
];

const panelDefault = (channelId: string): TicketPanel => ({
  channel: channelId,
  title: 'Need a hand?',
  description:
    'Press a button below and a private thread opens with our staff. Only you and the team can see it.',
  color: '#FACC15',
  topics: [
    {
      id: 'tp1',
      label: 'Access & roles',
      style: 'primary',
      question: 'Which channel or role is missing for you?',
    },
    {
      id: 'tp2',
      label: 'Report a member',
      style: 'danger',
      question: 'Who is it, and what happened? Screenshots help a lot.',
    },
    {
      id: 'tp3',
      label: 'Something else',
      style: 'secondary',
      question: 'What can we help with?',
    },
  ],
  roles: ['Moderator', 'Helper'],
  ping: true,
  onePerMember: true,
  autoClose: '48h',
});

const studioDefault = (server: Server, channelId: string): StudioMessage => ({
  name: 'Spring art jam announcement',
  channel: channelId,
  content: '@Artists the spring jam starts Saturday!',
  embeds: [
    {
      id: 'e1',
      author: `${server.name} events`,
      authorIcon: '',
      authorUrl: '',
      footerIcon: '',
      title: 'Spring Art Jam',
      description:
        'Draw anything with the theme **bloom** and post it in #art-share before Sunday 22:00. Everyone who enters gets 500 XP.',
      color: '#FACC15',
      image: 'https://pixelplaza.gg/img/jam-banner.png',
      footer: 'Hosted by the event team',
      thumbnail: '',
      timestamp: true,
      fields: [
        { id: 'f1', name: 'Theme', value: 'Bloom', inline: true },
        { id: 'f2', name: 'Deadline', value: 'Sunday 22:00', inline: true },
        {
          id: 'f3',
          name: 'Prize',
          value: 'Artist role + 2,000 XP',
          inline: true,
        },
      ],
    },
  ],
  components: [
    {
      id: 'b1',
      type: 'button',
      label: 'Jam rules',
      emoji: '',
      colour: 'grey',
      link: true,
      url: 'https://pixelplaza.gg/jam',
      actions: [],
    },
    {
      id: 'b2',
      type: 'button',
      label: 'I’m in',
      emoji: '🎨',
      colour: 'green',
      link: false,
      url: '',
      actions: [{ id: 'a1', type: 'role', mode: 'give', roles: ['9201'] }],
    },
  ],
  layout: 'embed',
  v2: {
    accent: '#FACC15',
    text: '## Spring Art Jam\nDraw anything with the theme **bloom**, {user}.\n{separator}\n**Deadline:** Sunday 22:00\n**Prize:** Artist role + 2,000 XP',
    thumbnail: '',
    gallery: [],
    place: [],
  },
});
const simple = (
  base: StudioMessage,
  name: string,
  title: string,
  description: string,
  color: string,
): StudioMessage => ({
  ...base,
  name,
  content: '',
  embeds: [
    {
      ...base.embeds[0]!,
      author: '',
      title,
      description,
      color,
      image: '',
      fields: [],
    },
  ],
  components: [],
});

type SupportState = {
  tickets: (Seed & { messages: TicketMessage[]; waitingMinutes: number })[];
  ticketsOn: boolean;
  panel: TicketPanel;
  panelVersions: TicketsState['versions'];
  studio: StudioState;
  rr: { templates: RRTemplate[]; log: RRLogEntry[] };
};

export function createSupportMock(h: Helpers) {
  const state = new Map<string, SupportState>();
  let nextId = 1;
  const id = (prefix: string) => `${prefix}${nextId++}`;

  function of(serverId: string): SupportState {
    const server = h.server(serverId);
    let s = state.get(serverId);
    if (s) return s;
    const channels = h.channels(serverId);
    const byName = (name: string) =>
      channels.find((c) => c.name === name)?.id ?? channels[0]!.id;
    const first = serverId === '900000000000000001';
    const tickets = (first ? seeds : seeds.slice(0, 3)).map((seed) => {
      const messages: TicketMessage[] = [
        {
          id: id('m'),
          kind: 'opener',
          author: 'Sparko',
          authorColor: 1,
          staff: true,
          text: `thanks, a staff member will be with you soon. Only you and staff can see this thread.`,
          at: seed.openedAt,
        },
        {
          id: id('m'),
          kind: 'message',
          author: seed.member,
          authorColor: person(seed.member).color,
          staff: false,
          text: seed.first,
          at: seed.openedAt,
          ...(seed.file ? { file: seed.file } : {}),
        },
      ];
      if (seed.reply)
        messages.push({
          id: id('m'),
          kind: 'message',
          author: seed.reply[0] === 'You' ? h.you().name : seed.reply[0],
          authorColor: staffColors[seed.reply[0]] ?? 3,
          staff: true,
          text: seed.reply[1],
          at: seed.reply[2],
        });
      return { ...seed, waitingMinutes: seed.waitingMinutes ?? 0, messages };
    });
    const base = studioDefault(server, byName('announcements'));
    const panel = panelDefault(byName('support'));
    s = {
      tickets,
      ticketsOn: true,
      panel,
      panelVersions: [
        {
          id: id('v'),
          title: 'Added the “Report a member” button',
          who: 'Rhea',
          whoColor: 5,
          when: 'Yesterday, 18:20',
          config: panel,
        },
        {
          id: id('v'),
          title: 'First version',
          who: 'You',
          whoColor: 2,
          when: '28 Sep, 12:30',
          config: {
            ...panel,
            topics: panel.topics.filter((t) => t.id !== 'tp2'),
          },
        },
      ],
      rr: { templates: [], log: [] },
      studio: {
        message: base,
        channels,
        folders: [
          {
            id: 'f-recaps',
            name: 'Recaps',
            parentId: null,
            position: 1,
          },
        ],
        templates: [
          {
            id: id('t'),
            name: base.name,
            folderId: null,
            position: 0,
            meta: 'Saved just now by you',
            message: base,
          },
          {
            id: id('t'),
            name: 'Weekly recap',
            folderId: 'f-recaps',
            position: 0,
            meta: 'Saved 2 days ago by Ayo',
            message: simple(
              base,
              'Weekly recap',
              `This week in ${server.name}`,
              '**3** new artists joined, the jam got **41** entries, and #art-share hit 2,000 posts.',
              '#5865F2',
            ),
          },
          {
            // Welcome messages send this one when someone joins.
            id: 'tw',
            name: 'Welcome card',
            folderId: null,
            position: 1,
            meta: 'Saved 3 days ago by Rhea',
            message: { ...greetPresets[0]!.message, channel: base.channel },
          },
          {
            id: id('t'),
            name: 'Server rules',
            folderId: null,
            position: 2,
            meta: 'Saved on 9 Oct by Rhea',
            message: simple(
              base,
              'Server rules',
              'House rules',
              'Be kind. No NSFW. Credit other artists. Ask before you DM someone.',
              '#ED4245',
            ),
          },
          {
            id: id('t'),
            name: 'Maintenance notice',
            folderId: null,
            position: 3,
            meta: 'Saved on 28 Sep by you',
            message: simple(
              base,
              'Maintenance notice',
              'Quick maintenance',
              'Sparko is restarting at 03:00 UTC. Levels and tickets pause for about five minutes.',
              '#57F287',
            ),
          },
        ],
        roles: [
          { id: '9201', name: 'Artist', color: '#EB459E' },
          {
            id: '9202',
            name: 'Event pings',
            color: '#FACC15',
            color2: '#ED4245',
          },
          // Above Sparko's own role, so it can't give it.
          {
            id: '9203',
            name: 'Moderator',
            color: '#5865F2',
            assignable: false,
          },
          { id: '9204', name: 'Member', color: null },
        ],
        sendLimit: server.plan === 'plus' ? 10 : 1,
        templateLimit: server.plan === 'plus' ? 500 : 100,
        folderLimit: server.plan === 'plus' ? 100 : 20,
        versions: [
          {
            id: id('v'),
            title: 'Moved the deadline to Sunday 22:00',
            who: 'You',
            whoColor: 2,
            when: 'Today, 10:15',
            config: base,
          },
          {
            id: id('v'),
            title: 'Added the prize field',
            who: 'Ayo',
            whoColor: 3,
            when: 'Yesterday, 19:40',
            config: {
              ...base,
              embeds: [
                {
                  ...base.embeds[0]!,
                  description:
                    'Draw anything with the theme **bloom** and post it in #art-share before Saturday 22:00.',
                  fields: base.embeds[0]!.fields.slice(0, 2),
                },
              ],
            },
          },
          {
            id: id('v'),
            title: 'First version',
            who: 'Rhea',
            whoColor: 5,
            when: '12 Oct, 14:02',
            config: {
              ...base,
              content: '',
              embeds: [
                {
                  ...base.embeds[0]!,
                  image: '',
                  fields: [],
                  description: 'Spring jam this weekend. Theme coming soon!',
                },
              ],
              components: [],
            },
          },
        ],
      },
    };
    state.set(serverId, s);
    return s;
  }
  const ticketOf = (serverId: string, number: number) => {
    const t = of(serverId).tickets.find((x) => x.number === number);
    if (!t) throw new Error('Ticket not found');
    return t;
  };
  const summary = ({
    first: _f,
    file: _x,
    about: _a,
    reply: _r,
    messages: _m,
    ...t
  }: SupportState['tickets'][number]): Ticket => t;
  const guardPaused = (serverId: string) => {
    if (h.server(serverId).paused)
      throw new Error('This server is paused by Sparko staff.');
  };

  const api: SupportApi = {
    listTickets: (serverId) =>
      h.wait(h.copy(of(serverId).tickets.map(summary))),
    async getTicket(serverId, number) {
      const t = ticketOf(serverId, number);
      const detail: TicketDetail = {
        ...summary(t),
        messages: t.messages,
        people: [
          { heading: 'Opened by', person: person(t.member) },
          ...(t.about
            ? [{ heading: 'Reported member', person: person(t.about) }]
            : []),
        ],
      };
      return h.wait(h.copy(detail));
    },
    async sendTicketMessage(serverId, number, { text, note }) {
      guardPaused(serverId);
      const t = ticketOf(serverId, number);
      if (t.status === 'closed') throw new Error('This ticket is closed.');
      t.messages.push({
        id: id('m'),
        kind: note ? 'note' : 'message',
        author: h.you().name,
        authorColor: h.you().avatarColor,
        staff: true,
        text,
        at: 'Just now',
      });
      if (!note) {
        t.lastAt = 'Just now';
        t.lastBy = 'staff';
        t.waitingMinutes = 0;
        t.status = 'waiting';
        if (!t.assignee) t.assignee = 'You';
      }
      return h.wait(undefined);
    },
    async updateTicket(serverId, number, change) {
      guardPaused(serverId);
      const t = ticketOf(serverId, number);
      if (change.priority) t.priority = change.priority;
      if (change.assignee !== undefined) {
        t.assignee = change.assignee;
        if (t.status === 'new' && change.assignee) t.status = 'claimed';
        if (!change.assignee && t.status === 'claimed') t.status = 'new';
      }
      return h.wait(undefined);
    },
    async closeTicket(serverId, number, { reason, detail }) {
      guardPaused(serverId);
      const t = ticketOf(serverId, number);
      t.status = 'closed';
      t.closedBy = 'You';
      t.closeReason = detail ? `${reason}: ${detail}` : reason;
      t.waitingMinutes = 0;
      return h.wait(undefined);
    },
    async reopenTicket(serverId, number) {
      guardPaused(serverId);
      const t = ticketOf(serverId, number);
      t.status = t.assignee ? 'claimed' : 'new';
      delete t.closedBy;
      delete t.closeReason;
      return h.wait(undefined);
    },
    async getTickets(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy<TicketsState>({
          on: s.ticketsOn,
          panel: s.panel,
          channels: h.channels(serverId),
          roles: ['Admin', 'Moderator', 'Helper', 'Event team'].map((r) => ({
            id: r,
            name: r,
          })),
          staff: [
            { name: 'You', color: 2 },
            { name: 'Rhea', color: 5 },
            { name: 'Ayo', color: 3 },
          ],
          versions: s.panelVersions,
        }),
      );
    },
    async saveTickets(serverId, change) {
      guardPaused(serverId);
      const s = of(serverId);
      s.ticketsOn = change.on;
      s.panel = h.copy(change.panel);
      s.panelVersions.unshift({
        id: id('v'),
        title: change.on ? 'Updated the ticket panel' : 'Turned Tickets off',
        who: 'You',
        whoColor: h.you().avatarColor,
        when: 'Just now',
        config: h.copy(change.panel),
      });
      return h.wait(undefined);
    },
    async getStudio(serverId) {
      const s = of(serverId);
      // Where each template is used outside Message Studio.
      const uses = new Map<string, NonNullable<StudioTemplate['usedIn']>>();
      const add = (
        id: string,
        kind:
          | 'welcome'
          | 'reaction-role'
          | 'suggestion'
          | 'birthday'
          | 'question'
          | 'starboard'
          | 'poll'
          | 'invite'
          | 'event',
        where: string,
      ) => {
        if (!id) return;
        const list = uses.get(id) ?? [];
        if (!list.some((u) => u.where === where)) list.push({ kind, where });
        uses.set(id, list);
      };
      for (const u of h.welcomeUses?.(serverId) ?? [])
        add(u.id, 'welcome', u.where);
      for (const u of h.suggestionUses?.(serverId) ?? [])
        add(u.id, 'suggestion', u.where);
      for (const u of h.birthdayUses?.(serverId) ?? [])
        add(u.id, 'birthday', u.where);
      for (const u of h.questionUses?.(serverId) ?? [])
        add(u.id, 'question', u.where);
      for (const u of h.starboardUses?.(serverId) ?? [])
        add(u.id, 'starboard', u.where);
      for (const u of h.pollUses?.(serverId) ?? []) add(u.id, 'poll', u.where);
      for (const u of h.inviteUses?.(serverId) ?? [])
        add(u.id, 'invite', u.where);
      for (const u of h.eventUses?.(serverId) ?? [])
        add(u.id, 'event', u.where);
      for (const r of s.rr.templates)
        for (const t of [
          r.config.message,
          r.config.response.claim,
          r.config.response.remove,
        ])
          add(t, 'reaction-role', `Reaction roles (${r.name})`);
      return h.wait(
        h.copy({
          ...s.studio,
          templates: s.studio.templates.map((t) => ({
            ...t,
            usedIn: uses.get(t.id) ?? [],
          })),
          channels: h.channels(serverId),
        }),
      );
    },
    async getReactionRoles(serverId) {
      const s = of(serverId);
      return h.wait(
        h.copy({
          templates: s.rr.templates,
          limit: h.server(serverId).plan === 'plus' ? 50 : 10,
          channels: h.channels(serverId),
          roles: s.studio.roles,
          log: s.rr.log,
        }),
      );
    },
    async addReactionRole(serverId, name) {
      guardPaused(serverId);
      const s = of(serverId);
      if (
        s.rr.templates.length >= (h.server(serverId).plan === 'plus' ? 50 : 10)
      )
        throw new Error('You’ve used every reaction role on this plan.');
      const channel = h.channels(serverId).find((c) => c.canPost)?.id ?? '';
      const message = {
        ...s.studio.message,
        name,
        channel,
        layout: 'embed' as const,
        content: '',
        components: [],
        embeds: [
          {
            ...s.studio.message.embeds[0]!,
            id: 'e1',
            title: 'Pick your roles',
            description:
              'React below to get a role. React again to drop it.\n\n{role-list}',
            fields: [],
            image: '',
          },
        ],
      };
      const { id: messageId } = await api.saveTemplate(serverId, {
        name,
        message,
        folderId: null,
      });
      const rr = {
        id: id('rr'),
        name: uniqueTemplateName(s.rr.templates, name),
        meta: 'Saved just now by you',
        config: rrDefault(channel, messageId),
      };
      s.rr.templates.unshift(rr);
      return h.wait({ id: rr.id });
    },
    async saveReactionRole(serverId, rrId, change) {
      guardPaused(serverId);
      const s = of(serverId);
      if (change.name && nameTaken(s.rr.templates, change.name, rrId))
        throw new Error(
          `A reaction role named “${change.name.trim()}” already exists. Pick another name.`,
        );
      s.rr.templates = s.rr.templates.map((t) =>
        t.id === rrId
          ? {
              ...t,
              ...(change.name ? { name: change.name } : {}),
              ...(change.config ? { config: h.copy(change.config) } : {}),
              meta: 'Saved just now by you',
            }
          : t,
      );
      return h.wait(undefined);
    },
    async cloneReactionRole(serverId, rrId) {
      const s = of(serverId);
      const t = s.rr.templates.find((x) => x.id === rrId);
      if (!t) throw new Error('That reaction role no longer exists.');
      const copy = {
        ...h.copy(t),
        id: id('rr'),
        name: uniqueTemplateName(s.rr.templates, `${t.name} (copy)`),
        meta: 'Saved just now by you',
      };
      s.rr.templates.splice(s.rr.templates.indexOf(t) + 1, 0, copy);
      return h.wait({ id: copy.id });
    },
    async deleteReactionRole(serverId, rrId) {
      const s = of(serverId);
      s.rr.templates = s.rr.templates.filter((t) => t.id !== rrId);
      return h.wait(undefined);
    },
    async publishStudio(serverId, message) {
      guardPaused(serverId);
      const s = of(serverId);
      s.studio.message = h.copy(message);
      s.studio.versions.unshift({
        id: id('v'),
        title: 'Published changes',
        who: 'You',
        whoColor: h.you().avatarColor,
        when: 'Just now',
        config: h.copy(message),
      });
      return h.wait(undefined);
    },
    async saveTemplate(serverId, { name, message, folderId }) {
      const s = of(serverId);
      if (s.studio.templates.length >= s.studio.templateLimit)
        throw new Error('You’ve used every template on this plan.');
      const t = {
        id: id('t'),
        name: uniqueTemplateName(s.studio.templates, name),
        folderId,
        position: -1,
        meta: 'Saved just now by you',
        message: h.copy(message),
      };
      s.studio.templates.push(t);
      Object.assign(
        s.studio,
        applyMove(s.studio, { kind: 'template', id: t.id, folderId, index: 0 }),
      );
      return h.wait({ id: t.id });
    },
    async updateTemplate(serverId, templateId, change) {
      const s = of(serverId);
      if (change.name && nameTaken(s.studio.templates, change.name, templateId))
        throw new Error(
          `A template named “${change.name.trim()}” already exists. Pick another name.`,
        );
      s.studio.templates = s.studio.templates.map((t) =>
        t.id === templateId
          ? {
              ...t,
              ...(change.name ? { name: change.name } : {}),
              ...(change.message ? { message: h.copy(change.message) } : {}),
              meta: 'Saved just now by you',
            }
          : t,
      );
      return h.wait(undefined);
    },
    async cloneTemplate(serverId, templateId) {
      const s = of(serverId);
      const t = s.studio.templates.find((x) => x.id === templateId);
      if (!t) throw new Error('That template no longer exists.');
      if (s.studio.templates.length >= s.studio.templateLimit)
        throw new Error('You’ve used every template on this plan.');
      const copy = {
        ...h.copy(t),
        id: id('t'),
        name: uniqueTemplateName(
          s.studio.templates,
          `${t.name} (copy)`.slice(0, 80),
        ),
        meta: 'Saved just now by you',
      };
      const index =
        itemsIn(s.studio, t.folderId).findIndex(
          (x) => x.kind === 'template' && x.id === t.id,
        ) + 1;
      s.studio.templates.push(copy);
      Object.assign(
        s.studio,
        applyMove(s.studio, {
          kind: 'template',
          id: copy.id,
          folderId: t.folderId,
          index,
        }),
      );
      return h.wait(undefined);
    },
    async deleteTemplate(serverId, templateId) {
      const s = of(serverId);
      s.studio.templates = s.studio.templates.filter(
        (t) => t.id !== templateId,
      );
      return h.wait(undefined);
    },
    async addFolder(serverId, { name, parentId }) {
      const s = of(serverId);
      if (s.studio.folders.length >= s.studio.folderLimit)
        throw new Error('You’ve used every folder on this plan.');
      const f: StudioFolder = { id: id('f'), name, parentId, position: -1 };
      s.studio.folders.push(f);
      Object.assign(
        s.studio,
        applyMove(s.studio, {
          kind: 'folder',
          id: f.id,
          folderId: parentId,
          index: 0,
        }),
      );
      return h.wait(undefined);
    },
    async renameFolder(serverId, folderId, name) {
      const s = of(serverId);
      s.studio.folders = s.studio.folders.map((f) =>
        f.id === folderId ? { ...f, name } : f,
      );
      return h.wait(undefined);
    },
    async deleteFolder(serverId, folderId) {
      const s = of(serverId);
      const tree = folderTree(s.studio, folderId);
      s.studio.folders = s.studio.folders.filter((f) => !tree.has(f.id));
      s.studio.templates = s.studio.templates.filter(
        (t) => !t.folderId || !tree.has(t.folderId),
      );
      return h.wait(undefined);
    },
    async postStudioTest(serverId, message) {
      const s = of(serverId);
      s.studio.message = h.copy(message);
      s.studio.versions.unshift({
        id: id('v'),
        title: `Posted “${message.name}”`,
        who: 'You',
        whoColor: h.you().avatarColor,
        when: 'Just now',
        config: h.copy(message),
      });
      return h.wait(undefined);
    },
    async editStudioMessage(serverId, message, link) {
      const target = parseMessageLink(link);
      if (!target)
        throw new Error(
          'Paste a message link, like https://discord.com/channels/…/…/…',
        );
      if (target.guildId !== serverId)
        throw new Error('That message is in another server.');
      of(serverId).studio.versions.unshift({
        id: id('v'),
        title: `Edited a message with “${message.name}”`,
        who: 'You',
        whoColor: h.you().avatarColor,
        when: 'Just now',
        config: h.copy(message),
      });
      return h.wait(undefined);
    },
    async uploadImage(_serverId, file) {
      if (file.size > 5 * 1024 * 1024)
        throw new Error('Pictures can be up to 5 MB.');
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type))
        throw new Error('Upload a PNG, JPEG, GIF or WebP picture.');
      // The sample data keeps the picture in this browser only.
      return h.wait(URL.createObjectURL(file));
    },
    async listServerEmojis() {
      return h.wait(sampleEmojis);
    },
    async moveLibraryItem(serverId, move) {
      const s = of(serverId);
      if (movesIntoItself(s.studio, move))
        throw new Error('A folder can’t go inside itself.');
      Object.assign(s.studio, applyMove(s.studio, move));
      return h.wait(undefined);
    },
  };

  return {
    api,
    reset: () => state.clear(),
    /** The server's roles, shared with other sample modules. */
    rolesOf: (serverId: string) => of(serverId).studio.roles,
    /** The server's Studio templates, for checking what other modules pick. */
    templateIds: (serverId: string) =>
      new Set(of(serverId).studio.templates.map((t) => t.id)),
    /** The channel a module posts in, for the apply check. */
    postingChannel: (serverId: string, moduleId: string) => {
      if (moduleId === 'tickets') {
        const s = of(serverId);
        return s.ticketsOn ? s.panel.channel : undefined;
      }
      if (moduleId === 'studio') return of(serverId).studio.message.channel;
      return undefined;
    },
  };
}
