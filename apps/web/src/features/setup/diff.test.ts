import { describe, expect, it } from 'vitest';
import { featureLabel, settingChanges } from './diff';

describe('settingChanges', () => {
  it('lists only changed settings in plain words', () => {
    expect(
      settingChanges(
        { enabled: false, maxOpenPerMember: 1, staffRoleIds: [] },
        {
          enabled: true,
          maxOpenPerMember: 1,
          staffRoleIds: ['1', '2'],
          panelChannelId: '',
        },
      ),
    ).toEqual([
      { setting: 'Enabled', before: 'Off', after: 'On' },
      { setting: 'Staff role IDs', before: 'None', after: '2 items' },
    ]);
  });
  it('treats a missing current configuration as unset', () => {
    expect(settingChanges(null, { greeting: { text: 'hi' } })).toEqual([
      { setting: 'Greeting', before: 'Not set', after: 'Custom settings' },
    ]);
  });
  it('names features readably', () => {
    expect(featureLabel('leave-boost')).toBe('Leave boost');
  });
});
