import { claimJob, finishJob, Plain, type Db, type Job } from '@sparko/core';

/** What the bot does for each kind of change saved in the dashboard. */
export type Handlers = Record<string, (job: Job) => Promise<void>>;

/** An error whose message is already written for the server owner. */
export { Plain as Explained };

/** Turns a Discord or code error into words people can act on. */
export function explain(error: unknown) {
  if (error instanceof Plain) return error.message;
  const e = error as { code?: number; message?: string };
  if (e?.code === 50013 || e?.code === 50001)
    return 'Sparko is missing a permission it needs for this. Check its role in Discord.';
  if (e?.code === 10003)
    return 'That channel no longer exists. Pick another one.';
  return e?.message ? `It didn’t apply: ${e.message}` : 'It didn’t apply.';
}

/** Runs every waiting job once. Returns how many ran. */
export async function runJobs(db: Db, handlers: Handlers, now = Date.now) {
  let ran = 0;
  for (let job = claimJob(db); job; job = claimJob(db)) {
    ran++;
    const handler = handlers[job.kind];
    try {
      if (!handler)
        throw new Error(`Sparko doesn’t know how to apply “${job.kind}”.`);
      await handler(job);
      finishJob(db, job.id, null, now());
    } catch (error) {
      console.error(`Job ${job.id} (${job.kind}) failed`, error);
      finishJob(db, job.id, explain(error), now());
    }
  }
  return ran;
}

/** Checks for new jobs every second until stopped. */
export function startJobLoop(db: Db, handlers: Handlers) {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    runJobs(db, handlers)
      .catch((error: unknown) => console.error('Job loop failed', error))
      .finally(() => {
        busy = false;
      });
  }, 1000);
  return () => clearInterval(timer);
}
