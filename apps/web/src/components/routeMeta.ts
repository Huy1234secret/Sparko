import type { Crumb } from '@sparko/ui';
import { groupNames, modules } from '../content/modules';

const accountPages: Record<string, string> = {
  preferences: 'Preferences',
  privacy: 'Privacy & data',
  support: 'Product support',
  billing: 'Plans & billing',
};
const ownerPages: Record<string, string> = {
  health: 'Health',
  fleet: 'Servers',
  jobs: 'Jobs',
  support: 'Support queue',
  grants: 'Operator access',
};
const fixedGuildPages: Record<string, Crumb[]> = {
  setup: [{ label: 'Guided setup' }],
  'support/tickets': [{ label: 'Tickets & support' }, { label: 'Inbox' }],
  'support/tickets/config': [
    { label: 'Tickets & support' },
    { label: 'Ticket settings' },
  ],
  'messages/studio': [{ label: 'Message Studio' }],
  'messages/templates': [{ label: 'Message Studio' }, { label: 'Templates' }],
  'messages/publications': [
    { label: 'Message Studio' },
    { label: 'Publications' },
  ],
  'insights/analytics': [{ label: 'Insights' }, { label: 'Analytics' }],
};

/** Breadcrumb trail for a dashboard path; the last crumb names the page. */
export function routeTrail(pathname: string, guildName?: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  const [root, guildId, ...rest] = parts;
  const servers: Crumb = { label: 'Your servers', to: '/dashboard' };
  if (root === 'account')
    return [
      { label: 'Account', to: '/account' },
      ...(guildId ? [{ label: accountPages[guildId] ?? 'Account' }] : []),
    ];
  if (root === 'owner')
    return [
      { label: 'Owner console', to: '/owner' },
      ...(guildId && ownerPages[guildId]
        ? [{ label: ownerPages[guildId] }]
        : []),
    ];
  if (root === 'servers' && guildId) {
    const server = {
      label: guildName ?? 'Server',
      to: `/dashboard/${guildId}`,
    };
    return [
      servers,
      server,
      {
        label:
          rest[0] === 'tickets'
            ? 'Your tickets'
            : rest[0] === 'economy'
              ? 'Your economy'
              : 'Your member profile',
      },
    ];
  }
  if (root !== 'dashboard') return [];
  if (!guildId) return [{ label: 'Your servers' }];
  const base = `/dashboard/${guildId}`;
  const server: Crumb = { label: guildName ?? 'Server', to: base };
  const sub = rest.join('/');
  if (!sub) return [servers, { ...server, to: undefined }];
  const link = (crumbs: Crumb[], to: string) =>
    crumbs.length > 1 ? [{ ...crumbs[0]!, to }, ...crumbs.slice(1)] : crumbs;
  const fixed = fixedGuildPages[sub];
  if (fixed)
    return [
      servers,
      server,
      ...link(
        fixed,
        sub.startsWith('support')
          ? `${base}/support/tickets`
          : sub.startsWith('messages')
            ? `${base}/messages/studio`
            : `${base}/${rest[0]}`,
      ),
    ];
  const [group = '', module, detail] = rest;
  if (group === 'support' && module === 'tickets' && detail)
    return [
      servers,
      server,
      { label: 'Tickets & support', to: `${base}/support/tickets` },
      { label: 'Ticket' },
    ];
  const groupCrumb: Crumb = {
    label: groupNames[group] ?? group,
    to: module ? `${base}/${group}` : undefined,
  };
  if (!module) return [servers, server, groupCrumb];
  const definition = modules.find(
    (item) => item.group === group && item.slug === module,
  );
  return [servers, server, groupCrumb, { label: definition?.name ?? module }];
}

/** Browser tab title: the current page, then its server. */
export function routeTitle(trail: Crumb[], guildName?: string) {
  const page = trail.at(-1)?.label;
  return [
    page,
    guildName && page !== guildName ? guildName : undefined,
    'Sparko',
  ]
    .filter(Boolean)
    .join(' · ');
}
