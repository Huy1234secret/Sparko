/**
 * Welcome messages: what Sparko sends when someone joins, leaves or boosts
 * the server. Each one is a Message Studio template, sent in a channel, by
 * direct message, or both. Nothing here touches the database or the
 * network, so the dashboard imports this file too.
 */
import {
  embedDefault,
  v2Default,
  type StudioMessage,
} from './studio-format.ts';

export type GreetKind = 'join' | 'leave' | 'boost';
export const greetKinds: GreetKind[] = ['join', 'leave', 'boost'];
/** How each kind shows in the log: [WM], [LM] and [BM]. */
export const greetCodes: Record<GreetKind, string> = {
  join: 'WM',
  leave: 'LM',
  boost: 'BM',
};
export const greetNames: Record<GreetKind, string> = {
  join: 'join message',
  leave: 'leave message',
  boost: 'boost message',
};

export type GreetSettings = {
  /** The Studio template sent in the channel; '' until one is picked. */
  template: string;
  /** Where it goes; '' sends nothing in a channel. */
  channel: string;
  /** "none", "same" (the channel's template), or another template's id. */
  dm: string;
  /** Lets the message ping the member it's about. */
  ping: boolean;
  /** Seconds before the channel message is deleted; 0 keeps it. */
  deleteAfter: number;
};
export type WelcomeConfig = {
  join: GreetSettings & {
    /** Greets people who leave and come back again. */
    rejoin: boolean;
    /** Waits until they've accepted the server's rules. */
    waitForRules: boolean;
  };
  leave: GreetSettings;
  boost: GreetSettings;
};

/** The choices for deleting a channel message after a while, in seconds. */
export const deleteAfterChoices = [0, 30, 60, 300, 3600] as const;

export const welcomeDefault = (channel: string): WelcomeConfig => ({
  join: {
    template: '',
    channel,
    dm: 'none',
    ping: true,
    deleteAfter: 0,
    rejoin: false,
    waitForRules: false,
  },
  leave: { template: '', channel, dm: 'none', ping: false, deleteAfter: 0 },
  boost: { template: '', channel, dm: 'none', ping: true, deleteAfter: 0 },
});

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;

/**
 * Checks a config sent by the dashboard. `templates` are the ids of the
 * server's Studio templates. Returns a problem in plain words, or null.
 */
export function welcomeProblem(
  c: unknown,
  templates?: Set<string>,
): string | null {
  const x = c as Partial<WelcomeConfig> | null;
  if (!x || typeof x !== 'object') return 'The welcome settings are missing.';
  for (const kind of greetKinds) {
    const s = x[kind] as Partial<GreetSettings> | undefined;
    const name = greetNames[kind];
    if (!s || typeof s !== 'object') return 'Some settings are missing.';
    if (typeof s.template !== 'string' || typeof s.dm !== 'string')
      return 'Some settings are missing.';
    if (s.template && !templateId.test(s.template))
      return `Pick a template for the ${name}.`;
    if (
      typeof s.channel !== 'string' ||
      (s.channel && !snowflake.test(s.channel))
    )
      return `Pick a channel for the ${name}.`;
    if (!['none', 'same'].includes(s.dm) && !templateId.test(s.dm))
      return `Pick what the ${name} sends by DM.`;
    if (typeof s.ping !== 'boolean') return 'Some settings are missing.';
    if (!(deleteAfterChoices as readonly unknown[]).includes(s.deleteAfter))
      return 'Pick when to delete the message.';
    if ((s.channel || s.dm === 'same') && !s.template)
      return `Pick a template for the ${name}.`;
    if (templates)
      for (const id of Object.values(greetTemplates(s as GreetSettings)))
        if (id && !templates.has(id))
          return `A template the ${name} uses was deleted. Pick another one.`;
  }
  const j = x.join as Partial<WelcomeConfig['join']>;
  if (typeof j.rejoin !== 'boolean' || typeof j.waitForRules !== 'boolean')
    return 'Some settings are missing.';
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export function cleanWelcome(c: WelcomeConfig): WelcomeConfig {
  const pick = (s: GreetSettings): GreetSettings => ({
    template: s.template,
    channel: s.channel,
    dm: s.dm,
    ping: s.ping,
    deleteAfter: s.deleteAfter,
  });
  return {
    join: {
      ...pick(c.join),
      rejoin: c.join.rejoin,
      waitForRules: c.join.waitForRules,
    },
    leave: pick(c.leave),
    boost: pick(c.boost),
  };
}

/** The templates a kind sends: in the channel, and by DM. */
export function greetTemplates(s: GreetSettings) {
  return {
    channel: s.channel && s.template ? s.template : '',
    dm: s.dm === 'none' ? '' : s.dm === 'same' ? s.template : s.dm,
  };
}

/** Welcome settings saved before they used Studio templates. */
export type LegacyWelcome = {
  delivery: 'channel' | 'dm' | 'both';
  channel: string;
  message: string;
  embed: boolean;
  title: string;
  color: string;
  ping: boolean;
  rejoin: boolean;
};
export const isLegacyWelcome = (c: unknown): c is LegacyWelcome =>
  !!c && typeof c === 'object' && 'delivery' in c && 'message' in c;

/** The old welcome message as a Studio template. */
export function legacyMessage(c: LegacyWelcome): StudioMessage {
  const text = (t: string) =>
    t.replaceAll('{member_count}', '{server.members}');
  return {
    name: 'Welcome message',
    channel: c.channel,
    layout: 'embed',
    content: c.embed ? (c.ping ? '{user}' : '') : text(c.message),
    embeds: c.embed
      ? [
          {
            ...embedDefault(),
            title: text(c.title),
            description: text(c.message),
            color: c.color,
          },
        ]
      : [],
    components: [],
    v2: v2Default(),
  };
}

/** The new settings for an old welcome, sending the template it became. */
export function upgradeLegacy(c: LegacyWelcome, template: string) {
  const config = welcomeDefault(c.channel);
  config.join = {
    ...config.join,
    template,
    channel: c.delivery === 'dm' ? '' : c.channel,
    dm: c.delivery === 'channel' ? 'none' : 'same',
    ping: c.ping,
    rejoin: c.rejoin,
  };
  return config;
}

// Ready-made messages ---------------------------------------------------------

export type GreetPreset = {
  id: string;
  kind: GreetKind;
  name: string;
  about: string;
  message: StudioMessage;
};

const embedMessage = (
  name: string,
  content: string,
  embed: Partial<ReturnType<typeof embedDefault>>,
): StudioMessage => ({
  name,
  channel: '',
  layout: 'embed',
  content,
  embeds: [{ ...embedDefault(), ...embed }],
  components: [],
  v2: v2Default(),
});
const textMessage = (name: string, content: string): StudioMessage => ({
  name,
  channel: '',
  layout: 'embed',
  content,
  embeds: [],
  components: [],
  v2: v2Default(),
});
const v2Message = (
  name: string,
  accent: string,
  text: string,
  thumbnail = '{user.avatar}',
): StudioMessage => ({
  name,
  channel: '',
  layout: 'v2',
  content: '',
  embeds: [],
  components: [],
  v2: { ...v2Default(), accent, text, thumbnail },
});

/** Messages people can start from, then change in the editor. */
export const greetPresets: GreetPreset[] = [
  {
    id: 'join-card',
    kind: 'join',
    name: 'Welcome card',
    about: 'An embed with their picture and the member count.',
    message: embedMessage('Welcome card', '{user}', {
      author: '{server}',
      authorIcon: '{server.icon}',
      title: 'Welcome, {user.name}!',
      description:
        'Glad you’re here, {user}. You’re member **#{server.members}**.\n\nRead the rules, grab your roles, then come say hi.',
      thumbnail: '{user.avatar}',
      color: '#FACC15',
      footer: 'Joined {server}',
      timestamp: true,
    }),
  },
  {
    id: 'join-v2',
    kind: 'join',
    name: 'Modern welcome',
    about: 'A Components V2 card with a divider.',
    message: v2Message(
      'Modern welcome',
      '#5865F2',
      '## Welcome to {server}!\nHey {user}, make yourself at home.\n{separator}\n-# Member #{server.members} · account made {user.created}',
    ),
  },
  {
    id: 'join-short',
    kind: 'join',
    name: 'Short and sweet',
    about: 'One friendly line, no embed.',
    message: textMessage(
      'Short and sweet',
      'Hi {user} 👋 welcome to **{server}**! You’re member #{server.members}.',
    ),
  },
  {
    id: 'join-gaming',
    kind: 'join',
    name: 'Squad up',
    about: 'For gaming servers.',
    message: embedMessage('Squad up', '{user}', {
      title: '🎮 A new player has joined!',
      description:
        '{user} just joined the squad. Pick your roles and find a team in the voice channels.',
      thumbnail: '{user.avatar}',
      color: '#57F287',
    }),
  },
  {
    id: 'leave-card',
    kind: 'leave',
    name: 'Goodbye card',
    about: 'A quiet embed when someone leaves.',
    message: embedMessage('Goodbye card', '', {
      title: 'Goodbye, {user.name}',
      description:
        '{user.name} has left {server}. They joined {user.joined}.\nWe’re now {server.members} members.',
      thumbnail: '{user.avatar}',
      color: '#ED4245',
    }),
  },
  {
    id: 'leave-v2',
    kind: 'leave',
    name: 'Modern goodbye',
    about: 'A Components V2 card.',
    message: v2Message(
      'Modern goodbye',
      '#4E5058',
      '### {user.name} left the server\nThanks for stopping by. 👋\n{separator}\n-# {server.members} members now',
    ),
  },
  {
    id: 'leave-short',
    kind: 'leave',
    name: 'Short goodbye',
    about: 'One line, no embed.',
    message: textMessage(
      'Short goodbye',
      '👋 **{user.name}** left the server. See you around!',
    ),
  },
  {
    id: 'boost-card',
    kind: 'boost',
    name: 'Thank-you card',
    about: 'Thanks the booster with the server’s new totals.',
    message: embedMessage('Thank-you card', '{user}', {
      title: '💎 Thank you for boosting!',
      description:
        '{user} just boosted **{server}**!\nWe now have **{server.boosts}** boosts and are at level {server.level}.',
      thumbnail: '{user.avatar}',
      color: '#F47FFF',
      timestamp: true,
    }),
  },
  {
    id: 'boost-v2',
    kind: 'boost',
    name: 'Modern thank-you',
    about: 'A Components V2 card in boost pink.',
    message: v2Message(
      'Modern thank-you',
      '#F47FFF',
      '## {user.name} boosted the server! 💎\nThank you, {user}. Your boost unlocks perks for everyone.\n{separator}\n-# {server.boosts} boosts · level {server.level}',
    ),
  },
  {
    id: 'boost-short',
    kind: 'boost',
    name: 'Short thank-you',
    about: 'One line, no embed.',
    message: textMessage(
      'Short thank-you',
      '💎 {user} just boosted the server. Thank you!',
    ),
  },
];
