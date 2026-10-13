import { describe, expect, it } from 'vitest';
import {
  ago,
  basePermissions,
  channelPermissions,
  claimJob,
  enabledModules,
  enqueueJob,
  finishJob,
  getModule,
  has,
  latestJob,
  listVersions,
  addVersion,
  openDb,
  Perm,
  requeueRunning,
  sealer,
  writeModule,
} from './index.ts';

const guild = { id: 'g', ownerId: 'owner' };
const roles = [
  { id: 'g', permissions: String(Perm.viewChannel | Perm.sendMessages) },
  { id: 'bot', permissions: String(Perm.embedLinks) },
];
const bot = { id: 'b', roles: ['bot'] };

describe('permissions', () => {
  it('combines @everyone and the bot’s roles, and lets owners do anything', () => {
    const base = basePermissions(guild, roles, bot);
    expect(
      has(base, Perm.viewChannel, Perm.sendMessages, Perm.embedLinks),
    ).toBe(true);
    expect(has(base, Perm.manageRoles)).toBe(false);
    expect(
      has(
        basePermissions(guild, roles, { id: 'owner', roles: [] }),
        Perm.manageRoles,
      ),
    ).toBe(true);
  });

  it('applies channel overwrites in Discord’s order', () => {
    const base = basePermissions(guild, roles, bot);
    // @everyone can't send here, but the bot's role is allowed again.
    const send = String(Perm.sendMessages);
    const locked = [{ id: 'g', type: 0 as const, allow: '0', deny: send }];
    expect(
      has(channelPermissions(base, 'g', bot, locked), Perm.sendMessages),
    ).toBe(false);
    const allowed = [
      ...locked,
      { id: 'bot', type: 0 as const, allow: send, deny: '0' },
    ];
    expect(
      has(channelPermissions(base, 'g', bot, allowed), Perm.sendMessages),
    ).toBe(true);
    // A member overwrite beats roles.
    const member = [
      ...allowed,
      { id: 'b', type: 1 as const, allow: '0', deny: send },
    ];
    expect(
      has(channelPermissions(base, 'g', bot, member), Perm.sendMessages),
    ).toBe(false);
  });
});

describe('store', () => {
  it('migrates a fresh database and keeps module settings with versions', () => {
    const db = openDb(':memory:');
    expect(getModule(db, 'g', 'levels')).toEqual({
      on: false,
      config: null,
      updatedAt: null,
    });
    writeModule(db, 'g', 'levels', { on: true, config: { rate: 2 } }, 1000);
    writeModule(db, 'g', 'levels', { on: false }, 2000);
    expect(getModule(db, 'g', 'levels')).toMatchObject({
      on: false,
      config: { rate: 2 },
    });
    writeModule(db, 'g', 'tickets', { on: true }, 3000);
    expect(enabledModules(db, 'g')).toEqual({ tickets: true });
    addVersion(
      db,
      {
        guildId: 'g',
        moduleId: 'levels',
        title: 'First',
        who: { id: 'u', name: 'Quinn' },
        config: { rate: 1 },
      },
      1,
    );
    expect(listVersions(db, 'g', 'levels')[0]).toMatchObject({
      title: 'First',
      who: 'Quinn',
      config: { rate: 1 },
    });
  });

  it('hands each job to one worker and retries ones cut off by a restart', () => {
    const db = openDb(':memory:');
    enqueueJob(db, { guildId: 'g', moduleId: 'welcome', kind: 'apply' }, 1);
    const job = claimJob(db)!;
    expect(job).toMatchObject({ kind: 'apply', status: 'running' });
    expect(claimJob(db)).toBeUndefined();
    requeueRunning(db);
    const again = claimJob(db)!;
    expect(again.id).toBe(job.id);
    finishJob(db, again.id, 'Missing Access', 2);
    expect(latestJob(db, 'g', 'welcome')).toMatchObject({
      status: 'error',
      error: 'Missing Access',
    });
  });
});

describe('helpers', () => {
  it('seals secrets so only the same key opens them', () => {
    const a = sealer('one');
    const sealed = a.seal('token-123');
    expect(sealed).not.toContain('token-123');
    expect(a.open(sealed)).toBe('token-123');
    expect(() => sealer('two').open(sealed)).toThrow();
  });

  it('says how long ago something happened', () => {
    const now = Date.UTC(2026, 9, 13, 12);
    expect(ago(now - 10_000, now)).toBe('Just now');
    expect(ago(now - 12 * 60_000, now)).toBe('12 min');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h');
    expect(ago(now - 26 * 3_600_000, now)).toBe('Yesterday');
    expect(ago(now - 20 * 86_400_000, now)).toBe('23 Sept');
  });
});
