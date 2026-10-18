import { describe, expect, it, vi } from 'vitest';
import { openDb } from './db.ts';
import { DiscordError } from './discord.ts';
import { writeModule } from './store.ts';
import { addTemplate, deleteTemplate, updateTemplate } from './templates.ts';
import { studioDefault } from './studio-format.ts';
import {
  RR_SPARKO,
  rrDecide,
  rrDefault,
  rrIssue,
  rrItem,
  rrRoleList,
  type ReactionRole,
} from './reaction-roles.ts';
import {
  applyReactionRole,
  listRRLog,
  rrPostFor,
  RR_MODULE,
  syncReactionRole,
} from './rr-store.ts';
import type { Rest } from './discord.ts';

const items = [
  rrItem({ id: 'a', emoji: '🎮', label: 'Gamer', role: '11' }),
  rrItem({ id: 'b', emoji: '🎨', label: 'Artist', role: '12' }),
  rrItem({ id: 'c', emoji: '📣', label: 'Pings', role: '13', required: '99' }),
];
const rr = (patch: Partial<ReactionRole> = {}): ReactionRole => ({
  ...rrDefault('501', '7'),
  items,
  ...patch,
});

describe('reaction roles', () => {
  it('gives, swaps, refuses and keeps roles as each mode says', () => {
    const none = new Set<string>();
    expect(rrDecide(rr(), { kind: 'react', item: 'a' }, none).give).toEqual([
      '11',
    ]);
    // Unique: picking another swaps the role.
    expect(
      rrDecide(
        rr({ mode: 'unique' }),
        { kind: 'button', item: 'b' },
        new Set(['11']),
      ),
    ).toMatchObject({ give: ['12'], take: ['11'] });
    // Add-only: unreacting keeps the role; clicking again says so.
    expect(
      rrDecide(
        rr({ mode: 'add' }),
        { kind: 'unreact', item: 'a' },
        new Set(['11']),
      ).take,
    ).toEqual([]);
    expect(
      rrDecide(
        rr({ mode: 'add' }),
        { kind: 'button', item: 'a' },
        new Set(['11']),
      ).refused[0]?.reason,
    ).toContain('already have');
    // Remove-only: picking takes it away.
    expect(
      rrDecide(
        rr({ mode: 'remove' }),
        { kind: 'react', item: 'a' },
        new Set(['11']),
      ).take,
    ).toEqual(['11']);
    // Required role and max picks.
    expect(
      rrDecide(rr(), { kind: 'react', item: 'c' }, none).refused[0]?.reason,
    ).toContain('<@&99>');
    expect(
      rrDecide(rr({ max: 1 }), { kind: 'react', item: 'b' }, new Set(['11']))
        .refused[0]?.reason,
    ).toContain('up to 1');
    // A menu sets the member's roles from it.
    expect(
      rrDecide(
        rr({ kind: 'menu' }),
        { kind: 'menu', items: ['b'] },
        new Set(['11']),
      ),
    ).toMatchObject({ give: ['12'], take: ['11'] });
  });

  it('checks settings and lists roles for {role-list}', () => {
    expect(rrIssue(rr())).toBeNull();
    expect(
      rrIssue(rr({ items: [items[0]!, { ...items[1]!, emoji: '🎮' }] }))
        ?.problem,
    ).toContain('same emoji');
    expect(rrIssue(rr(), { roles: new Map([['11', false]]) })?.at).toBe(
      'item:a',
    );
    expect(rrIssue({ ...rr(), max: 9 })?.at).toBe('max');
    expect(rrRoleList(rr({ items: items.slice(0, 2) }))).toBe(
      '> 🎮 | <@&11>\n> 🎨 | <@&12>',
    );
    expect(rrRoleList(rr({ kind: 'button', items: items.slice(0, 1) }))).toBe(
      '> 🎮 Gamer | <@&11>',
    );
    expect(
      rrRoleList(
        rr({ kind: 'menu', placeholder: 'Games', items: items.slice(0, 1) }),
      ),
    ).toBe('**Games**\n> 🎮 Gamer | <@&11>');
  });

  it('posts, edits, reacts, gives roles with a log, and deletes', async () => {
    const db = openDb(':memory:');
    const message = addTemplate(
      db,
      {
        guildId: 'g',
        moduleId: 'studio',
        name: 'Roles',
        who: 'Rhea',
        message: {
          ...studioDefault('501'),
          content: '{role-list}',
          embeds: [],
        },
      },
      1,
    );
    const id = addTemplate(
      db,
      {
        guildId: 'g',
        moduleId: RR_MODULE,
        name: 'Games',
        who: 'Rhea',
        message: rr({ message, items: items.slice(0, 2) }),
      },
      1,
    );
    writeModule(db, 'g', RR_MODULE, { on: true }, 1);
    const calls: string[] = [];
    const rest = {
      post: vi.fn(async (path: string, body: { content?: string }) => {
        calls.push(`POST ${path} ${body.content ?? ''}`);
        return { id: 'm1' };
      }),
      patch: vi.fn(async (path: string) => calls.push(`PATCH ${path}`)),
      put: vi.fn(async (path: string) => calls.push(`PUT ${path}`)),
      delete: vi.fn(async (path: string) => calls.push(`DELETE ${path}`)),
    } as unknown as Rest;

    await syncReactionRole(rest, db, 'g', id);
    expect(calls).toEqual([
      'POST /channels/501/messages > 🎮 | <@&11>\n> 🎨 | <@&12>',
      `PUT /channels/501/messages/m1/reactions/${encodeURIComponent('🎮')}/@me`,
      `PUT /channels/501/messages/m1/reactions/${encodeURIComponent('🎨')}/@me`,
    ]);
    expect(rrPostFor(db, 'g', id)?.messageId).toBe('m1');

    calls.length = 0;
    const done = await applyReactionRole(rest, db, {
      messageId: 'm1',
      user: { id: '7', name: 'tomoko' },
      roles: [],
      action: 'react',
      emoji: '🎮',
    });
    expect(done).toMatchObject({ given: ['11'] });
    expect(calls).toEqual(['PUT /guilds/g/members/7/roles/11']);
    expect(listRRLog(db, 'g')[0]).toMatchObject({
      action: 'added',
      userId: '7',
      roleId: '11',
    });

    // A role Sparko can't give is logged as failed.
    (rest.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DiscordError(403, 50013, 'Missing Permissions'),
    );
    await applyReactionRole(rest, db, {
      messageId: 'm1',
      user: { id: '7', name: 'tomoko' },
      roles: [],
      action: 'react',
      emoji: '🎨',
    });
    expect(listRRLog(db, 'g')[0]).toMatchObject({ action: 'failed' });

    // Using it as something it isn't (a button press on a reaction
    // message) does nothing.
    expect(
      await applyReactionRole(rest, db, {
        messageId: 'm1',
        user: { id: '7', name: 'tomoko' },
        roles: [],
        action: 'button',
        item: 'a',
      }),
    ).toBeNull();

    // Sparko's own responses list the roles given and taken.
    updateTemplate(
      db,
      'g',
      RR_MODULE,
      id,
      {
        who: 'Rhea',
        message: rr({
          message,
          items: items.slice(0, 2),
          response: {
            on: true,
            delivery: 'dm',
            claim: RR_SPARKO,
            remove: RR_SPARKO,
          },
        }),
      },
      2,
    );
    const claimed = await applyReactionRole(rest, db, {
      messageId: 'm1',
      user: { id: '7', name: 'tomoko' },
      roles: [],
      action: 'react',
      emoji: '🎮',
    });
    // Reactions can't be answered privately, so they get no response.
    expect(claimed?.off === false && claimed.given).toEqual(['11']);
    expect(claimed?.off === false && claimed.response).toBeNull();
    const removed = await applyReactionRole(rest, db, {
      messageId: 'm1',
      user: { id: '7', name: 'tomoko' },
      roles: ['11'],
      action: 'unreact',
      emoji: '🎮',
    });
    expect(removed?.off === false && removed.taken).toEqual(['11']);
    expect(removed?.off === false && removed.response).toBeNull();

    // Buttons answer privately, so they do get the response.
    updateTemplate(
      db,
      'g',
      RR_MODULE,
      id,
      {
        who: 'Rhea',
        message: rr({
          kind: 'button',
          message,
          items: items.slice(0, 2),
          response: {
            on: true,
            delivery: 'dm',
            claim: RR_SPARKO,
            remove: RR_SPARKO,
          },
        }),
      },
      3,
    );
    const pressed = await applyReactionRole(rest, db, {
      messageId: 'm1',
      user: { id: '7', name: 'tomoko' },
      roles: [],
      action: 'button',
      item: 'a',
    });
    expect(pressed?.off === false && pressed.response).toMatchObject({
      content: 'Added <@&11>',
    });
    expect(
      rrIssue(
        rr({
          response: { on: true, delivery: 'dm', claim: RR_SPARKO, remove: '' },
        }),
        { templates: new Set(['7']) },
      ),
    ).toBeNull();

    // Deleting the reaction role takes its message down.
    calls.length = 0;
    deleteTemplate(db, 'g', RR_MODULE, id);
    await syncReactionRole(rest, db, 'g', id);
    expect(calls).toEqual(['DELETE /channels/501/messages/m1']);
    expect(rrPostFor(db, 'g', id)).toBeUndefined();
  });
});
