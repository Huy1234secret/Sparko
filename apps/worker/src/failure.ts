import { DiscordAPIError, HTTPError } from 'discord.js';
import { DomainError } from '@sparko/contracts';

export type FailureDecision = { state: 'blocked' | 'unknown' | 'retry' | 'dead'; retryAt?: Date; message: string };
export function classifyDeliveryFailure(error: unknown, attempt: number, createsResource: boolean, now = new Date()): FailureDecision {
  const message = error instanceof Error ? error.message.slice(0, 500) : 'The external delivery failed.';
  if (error instanceof DomainError) return { state: ['MISSING_PERMISSION', 'FORBIDDEN', 'INVALID_INPUT', 'FEATURE_DISABLED', 'NOT_FOUND'].includes(error.code) ? 'blocked' : 'retry', message, ...(error.code === 'SERVICE_UNAVAILABLE' ? { retryAt: new Date(now.getTime() + 30_000) } : {}) };
  if (error instanceof DiscordAPIError && [50001, 50013, 10003, 10008, 10011, 10007, 50007].includes(Number(error.code))) return { state: 'blocked', message: 'Discord denied the action or its target is unavailable. Check permissions and resources.' };
  if (error instanceof DiscordAPIError && error.status < 500 && error.status !== 429) return { state: 'blocked', message: 'Discord rejected this payload. Review the saved design or resource settings.' };
  if (createsResource && (!(error instanceof DiscordAPIError || error instanceof HTTPError) || error.status >= 500)) return { state: 'unknown', message: 'Discord may have accepted this request. Reconcile the resource before retrying.' };
  if (attempt >= 8) return { state: 'dead', message };
  const delay = Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8));
  return { state: 'retry', message, retryAt: new Date(now.getTime() + delay + Math.floor(Math.random() * delay / 4)) };
}
export function isResourceCreation(type: string): boolean { return ['publication.send', 'ticket.create', 'community.message', 'community.crate.publish', 'community.giveaway.publish', 'community.role-menu.publish', 'community.submission.publish', 'community.giveaway.announce', 'automation.send', 'automation.voice.create'].includes(type); }
