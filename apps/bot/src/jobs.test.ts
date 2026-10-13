import { enqueueJob, latestJob, openDb } from '@sparko/core';
import { describe, expect, it } from 'vitest';
import { explain, runJobs } from './jobs.ts';

describe('job queue', () => {
  it('applies saved changes and records what went wrong in plain words', async () => {
    const db = openDb(':memory:');
    enqueueJob(db, { guildId: 'g', moduleId: 'levels', kind: 'module' }, 1);
    enqueueJob(db, { guildId: 'g', moduleId: 'welcome', kind: 'post' }, 2);
    enqueueJob(db, { guildId: 'g', moduleId: 'polls', kind: 'mystery' }, 3);
    const ran = await runJobs(db, {
      module: async () => {},
      post: async () => {
        throw Object.assign(new Error('Missing Permissions'), { code: 50013 });
      },
    });
    expect(ran).toBe(3);
    expect(latestJob(db, 'g', 'levels')?.status).toBe('done');
    expect(latestJob(db, 'g', 'welcome')).toMatchObject({
      status: 'error',
      error: explain({ code: 50013 }),
    });
    expect(latestJob(db, 'g', 'polls')?.error).toContain('mystery');
  });
});
