/** Welcome: settings, checks, and the message Sparko sends when someone joins. */
export type WelcomeConfig = {
  delivery: 'channel' | 'dm' | 'both';
  channel: string;
  message: string;
  embed: boolean;
  title: string;
  color: string;
  ping: boolean;
  rejoin: boolean;
};

export const welcomeTemplates = [
  {
    id: 't1',
    name: 'Default welcome',
    message:
      'Hey {user}, welcome to **{server}**! You’re member #{member_count}. Read the rules, then say hi.',
  },
  {
    id: 't2',
    name: 'Short and sweet',
    message: 'Hi {user} 👋 Glad you’re here.',
  },
  {
    id: 't3',
    name: 'Community',
    message:
      'Welcome to {server}, {user}! Introduce yourself and tell us what brought you here.',
  },
  {
    id: 't4',
    name: 'Gaming',
    message:
      '{user} just joined the squad! Grab your roles and find a team in the voice channels.',
  },
];

export const welcomeDefault = (
  serverName: string,
  channel: string,
): WelcomeConfig => ({
  delivery: 'channel',
  channel,
  message: welcomeTemplates[0]!.message,
  embed: true,
  title: `Welcome to ${serverName}`,
  color: '#FACC15',
  ping: true,
  rejoin: false,
});

const hex = /^#[0-9a-f]{6}$/i;

/** Checks a config sent by the dashboard. Returns a problem in plain words, or null. */
export function welcomeProblem(c: unknown): string | null {
  const x = c as Partial<WelcomeConfig> | null;
  if (!x || typeof x !== 'object') return 'The welcome settings are missing.';
  if (!['channel', 'dm', 'both'].includes(x.delivery as string))
    return 'Pick where the welcome goes.';
  if (x.delivery !== 'dm' && !/^\d{1,25}$/.test(x.channel ?? ''))
    return 'Pick a channel for the welcome.';
  if (typeof x.message !== 'string' || x.message.length > 2000)
    return 'The message must be 2,000 characters or fewer.';
  if (typeof x.title !== 'string' || x.title.length > 256)
    return 'The title must be 256 characters or fewer.';
  if (typeof x.color !== 'string' || !hex.test(x.color))
    return 'Use a colour like #FACC15.';
  for (const key of ['embed', 'ping', 'rejoin'] as const)
    if (typeof x[key] !== 'boolean') return 'Some settings are missing.';
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export const cleanWelcome = (c: WelcomeConfig): WelcomeConfig => ({
  delivery: c.delivery,
  channel: c.channel,
  message: c.message,
  embed: c.embed,
  title: c.title,
  color: c.color,
  ping: c.ping,
  rejoin: c.rejoin,
});

/** The message for one new member, ready for discord.js's send(). */
export function renderWelcome(
  c: WelcomeConfig,
  who: { id: string; server: string; memberCount: number },
) {
  const fill = (text: string) =>
    text
      .replaceAll('{user}', `<@${who.id}>`)
      .replaceAll('{server}', who.server)
      .replaceAll('{member_count}', who.memberCount.toLocaleString('en-US'));
  // Only the new member can be pinged: never @everyone or roles.
  const allowedMentions = { parse: [] as never[], users: [who.id] };
  if (!c.embed) return { content: fill(c.message), allowedMentions };
  return {
    ...(c.ping ? { content: `<@${who.id}>` } : {}),
    embeds: [
      {
        title: fill(c.title).slice(0, 256),
        description: fill(c.message).slice(0, 4096),
        color: Number.parseInt(c.color.slice(1), 16),
      },
    ],
    allowedMentions,
  };
}
