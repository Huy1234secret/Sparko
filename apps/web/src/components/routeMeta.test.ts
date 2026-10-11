import { describe, expect, it } from 'vitest';
import { routeTitle, routeTrail } from './routeMeta';

const g = '/dashboard/123';
describe('routeTrail', () => {
  it('names the server list and the overview', () => {
    expect(routeTrail('/dashboard')).toEqual([{ label: 'Your servers' }]);
    expect(routeTrail(g, 'Cafe')).toEqual([
      { label: 'Your servers', to: '/dashboard' },
      { label: 'Cafe', to: undefined },
    ]);
  });
  it('links each ancestor of a module page', () => {
    expect(routeTrail(`${g}/engagement/levels`, 'Cafe')).toEqual([
      { label: 'Your servers', to: '/dashboard' },
      { label: 'Cafe', to: g },
      { label: 'Engagement', to: `${g}/engagement` },
      { label: 'Levels & XP' },
    ]);
  });
  it('places Studio sections and ticket details under their parent', () => {
    expect(routeTrail(`${g}/messages/templates`, 'Cafe').slice(2)).toEqual([
      { label: 'Message Studio', to: `${g}/messages/studio` },
      { label: 'Templates' },
    ]);
    expect(routeTrail(`${g}/support/tickets/abc`, 'Cafe').slice(2)).toEqual([
      { label: 'Tickets & support', to: `${g}/support/tickets` },
      { label: 'Ticket' },
    ]);
  });
  it('covers account, owner and member pages', () => {
    expect(routeTrail('/account/privacy').at(-1)?.label).toBe('Privacy & data');
    expect(routeTrail('/owner/jobs').at(-1)?.label).toBe('Jobs');
    expect(routeTrail('/servers/123/me', 'Cafe').at(-1)?.label).toBe(
      'Your member profile',
    );
  });
});
describe('routeTitle', () => {
  it('puts the page before the server', () => {
    expect(
      routeTitle(routeTrail(`${g}/insights/analytics`, 'Cafe'), 'Cafe'),
    ).toBe('Analytics · Cafe · Sparko');
    expect(routeTitle(routeTrail(g, 'Cafe'), 'Cafe')).toBe('Cafe · Sparko');
  });
});
