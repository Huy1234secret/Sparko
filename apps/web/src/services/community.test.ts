import { describe, expect, it } from 'vitest';
import { ConfigSchema } from './guilds';
import {
  CrateDropSchema,
  GiveawayRecordSchema,
  RoleMenuRecordSchema,
  SubmissionSchema,
} from './community';

const envelope = {
  id: 'r1',
  key: 'k1',
  ownerId: '123456789012345678',
  state: 'open',
  revision: 2,
  createdAt: '2026-10-11T10:00:00.000Z',
};
describe('typed community records', () => {
  it('keeps crate delivery state and claim counters', () => {
    const drop = CrateDropSchema.parse({
      ...envelope,
      data: {
        type: { id: 'spark', name: 'Spark', minXp: 1, maxXp: 5, weight: 1 },
        channelId: '123456789012345679',
        expiresAt: '2026-10-11T10:05:00.000Z',
        capacity: 3,
        claims: 1,
        publicationState: 'failed',
        deliveryError: 'Give Sparko Send Messages permission.',
      },
    });
    expect(drop.data).toMatchObject({
      claims: 1,
      publicationState: 'failed',
      deliveryError: 'Give Sparko Send Messages permission.',
    });
  });
  it('parses giveaways with captured rules and role menus with options', () => {
    expect(
      GiveawayRecordSchema.parse({
        ...envelope,
        data: {
          prize: 'Nitro',
          channelId: '123456789012345679',
          endsAt: '2026-10-12T10:00:00.000Z',
          winnerCount: 2,
          hostId: '123456789012345678',
        },
      }).data.winnerCount,
    ).toBe(2);
    expect(
      RoleMenuRecordSchema.parse({
        ...envelope,
        data: {
          name: 'Colours',
          channelId: '123456789012345679',
          options: [{ roleId: '123456789012345670', label: 'Gold' }],
          minSelections: 0,
          maxSelections: 1,
        },
      }).data.options,
    ).toHaveLength(1);
  });
  it('keeps suggestion vote totals and decision history', () => {
    const row = SubmissionSchema.parse({
      ...envelope,
      data: {
        content: 'Add a music channel',
        visibility: 'public',
        decisions: [
          {
            status: 'planned',
            reason: 'Next month',
            actorId: '1',
            at: '2026-10-11T10:00:00.000Z',
          },
        ],
      },
      votes: { positive: 3, negative: 1, score: 2, myVote: 1 },
    });
    expect(row.votes?.score).toBe(2);
    expect(row.data.decisions[0]?.status).toBe('planned');
  });
  it('accepts prerequisites reported with their setting path', () => {
    expect(
      ConfigSchema.parse({
        featureId: 'R19',
        revision: 1,
        appliedRevision: 1,
        config: {},
        missingPrerequisites: [
          { path: 'channelId', message: 'Choose a channel.' },
          'Enable the Server Members intent.',
        ],
      }).missingPrerequisites,
    ).toEqual([
      'channelId: Choose a channel.',
      'Enable the Server Members intent.',
    ]);
  });
});
