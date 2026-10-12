import { describe, expect, it } from 'vitest';
import {
  compareConfigs,
  configReferences,
  isProtectedFeature,
  remapConfig,
} from './config-tools.js';

const settings = {
  enabled: true,
  logChannelId: '100000000000000001',
  exemptRoleIds: ['200000000000000001', '200000000000000002'],
  rules: [{ name: 'Links', alertChannelId: '100000000000000002' }],
  welcomeDocument: { channelId: '100000000000000009' },
};

describe('configuration references', () => {
  it('finds channels and roles at any depth but leaves message documents alone', () => {
    expect(configReferences(settings)).toEqual({
      channels: [
        { path: 'logChannelId', id: '100000000000000001' },
        { path: 'rules.0.alertChannelId', id: '100000000000000002' },
      ],
      roles: [
        { path: 'exemptRoleIds.0', id: '200000000000000001' },
        { path: 'exemptRoleIds.1', id: '200000000000000002' },
      ],
    });
  });

  it('remaps only mapped IDs and keeps everything else', () => {
    expect(
      remapConfig(settings, {
        channels: { '100000000000000001': '300000000000000001' },
        roles: { '200000000000000002': '400000000000000002' },
      }),
    ).toEqual({
      ...settings,
      logChannelId: '300000000000000001',
      exemptRoleIds: ['200000000000000001', '400000000000000002'],
    });
  });

  it('compares after remapping and names what the target lacks', () => {
    const [change] = compareConfigs(
      [{ featureId: 'R17', revision: 4, config: { enabled: false } }],
      [{ featureId: 'R17', revision: 9, config: settings }],
      ['R17'],
      {
        channels: { '100000000000000001': '300000000000000001' },
        roles: {},
      },
      {
        channels: new Set(['300000000000000001']),
        roles: new Set(['200000000000000001', '200000000000000002']),
      },
    );
    expect(change).toMatchObject({
      featureId: 'R17',
      expectedRevision: 4,
      changed: true,
      missing: {
        channels: [
          { path: 'rules.0.alertChannelId', id: '100000000000000002' },
        ],
        roles: [],
      },
    });
  });

  it('never copies access, billing, consent or public exposure settings', () => {
    for (const id of ['R04', 'R60', 'R61', 'R62', 'R64', 'R65', 'R69', 'R70'])
      expect(isProtectedFeature(id)).toBe(true);
    expect(isProtectedFeature('R17')).toBe(false);
    expect(isProtectedFeature('tickets')).toBe(false);
  });
});
