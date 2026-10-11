import { describe, expect, it } from 'vitest';
import { replyMatches } from '@sparko/contracts';
import {
  formatInZone,
  recurrenceFrom,
  recurrenceLabel,
  utcToZonedInput,
  zonedToUtc,
} from './time';
import {
  describeStep,
  moveStep,
  removeStep,
  traceWorkflow,
  type WorkflowStep,
} from './workflow';

describe('wall-clock time in a chosen zone', () => {
  it('converts local input to UTC and back', () => {
    expect(zonedToUtc('2026-10-12T09:30', 'Asia/Bangkok')?.toISOString()).toBe(
      '2026-10-12T02:30:00.000Z',
    );
    expect(utcToZonedInput('2026-10-12T02:30:00.000Z', 'Asia/Bangkok')).toBe(
      '2026-10-12T09:30',
    );
    expect(
      zonedToUtc('2026-07-01T12:00', 'America/New_York')?.toISOString(),
    ).toBe('2026-07-01T16:00:00.000Z');
    expect(
      zonedToUtc('2026-12-01T12:00', 'America/New_York')?.toISOString(),
    ).toBe('2026-12-01T17:00:00.000Z');
  });
  it('handles daylight-saving gaps and repeats like the server', () => {
    // 02:30 does not exist on 8 March 2026 in New York (02:00 → 03:00).
    const skipped = zonedToUtc('2026-03-08T02:30', 'America/New_York')!;
    expect(utcToZonedInput(skipped.toISOString(), 'America/New_York')).toBe(
      '2026-03-08T03:00',
    );
    // 01:30 happens twice on 1 November 2026; the first (EDT) is used.
    expect(
      zonedToUtc('2026-11-01T01:30', 'America/New_York')?.toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z');
  });
  it('rejects incomplete input and names the zone when formatting', () => {
    expect(zonedToUtc('2026-10-12', 'UTC')).toBeNull();
    expect(formatInZone('2026-10-12T02:30:00.000Z', 'Asia/Bangkok')).toContain(
      '(Asia/Bangkok)',
    );
    expect(formatInZone(null, 'UTC')).toBe('—');
  });
  it('repeats on the first occurrence’s local weekday and time', () => {
    // 12 October 2026 is a Monday.
    expect(recurrenceFrom('weekly', '2026-10-12T18:05')).toEqual({
      type: 'weekly',
      weekday: 1,
      hour: 18,
      minute: 5,
    });
    expect(recurrenceFrom('daily', '2026-10-12T07:00')).toEqual({
      type: 'daily',
      hour: 7,
      minute: 0,
    });
    expect(recurrenceFrom('once', '2026-10-12T07:00')).toEqual({
      type: 'once',
    });
    expect(
      recurrenceLabel({ type: 'weekly', weekday: 1, hour: 18, minute: 5 }),
    ).toBe('Every Monday at 18:05');
  });
});

const names = {
  channel: (id: string) => `#${id}`,
  role: (id: string) => `@${id}`,
  category: (id: string) => id,
};
const steps: WorkflowStep[] = [
  { type: 'branch', requiredRoleId: 'vip', onMatch: 1, onMiss: 2 },
  { type: 'role', roleId: 'lounge', action: 'add' },
  { type: 'wait', seconds: 3600 },
  { type: 'send', channelId: 'welcome', text: 'Hi' },
];

describe('workflow dry run', () => {
  it('follows role checks forward and counts only actions', () => {
    const vip = traceWorkflow(steps, 5, ['vip'], names);
    expect(vip.lines.map((line) => line.index)).toEqual([0, 1, 2, 3]);
    expect(vip.actions).toBe(2);
    const guest = traceWorkflow(steps, 5, [], names);
    expect(guest.lines.map((line) => line.index)).toEqual([0, 2, 3]);
    expect(guest.lines[0]!.text).toBe('@vip: does not have it → step 3');
    expect(guest.lines[1]!.text).toBe('Wait 1 hour');
    expect(guest.actions).toBe(1);
  });
  it('stops where the action limit runs out, as the engine does', () => {
    const trace = traceWorkflow(steps, 1, ['vip'], names);
    expect(trace.lines.at(-1)).toMatchObject({ index: 3, overBudget: true });
    expect(trace.actions).toBe(1);
  });
  it('keeps branch targets on the same steps when steps move or go', () => {
    const moved = moveStep(steps, 3, 1);
    expect(moved.map((step) => step.type)).toEqual([
      'branch',
      'send',
      'role',
      'wait',
    ]);
    expect(moved[0]).toMatchObject({ onMatch: 2, onMiss: 3 });
    const removed = removeStep(steps, 1);
    expect(removed[0]).toMatchObject({ onMatch: 1, onMiss: 1 });
    expect(describeStep(removed[1]!, names)).toBe('Wait 1 hour');
  });
});

describe('auto reply matching shared with the bot', () => {
  it('ignores case and font-style characters', () => {
    expect(
      replyMatches(
        { match: 'contains', pattern: 'Rules' },
        'where are the RULES?',
      ),
    ).toBe(true);
    expect(replyMatches({ match: 'exact', pattern: 'hi' }, 'ｈｉ')).toBe(true);
    expect(
      replyMatches({ match: 'starts_with', pattern: '!help' }, 'please !help'),
    ).toBe(false);
  });
});
