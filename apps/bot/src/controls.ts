import { z } from 'zod';
import { DomainError } from '@sparko/contracts';
import { ActionSchema, MessageDocumentSchema, validateControlSubmission } from '@sparko/messages';

export const PersistedControlSchema = z.object({
  id: z.string(), guildId: z.string(), actorId: z.string().nullable(), revoked: z.boolean(), expiresAt: z.date().nullable(), key: z.string(), action: ActionSchema,
  publication: z.object({ guildId: z.string(), channelId: z.string(), messageId: z.string().nullable(), state: z.string(), document: MessageDocumentSchema }),
});
export type ControlFacts = { guildId: string; channelId: string; messageId: string; actorId: string; values: string[]; now?: Date };

export function validateIssuedControl(input: unknown, facts: ControlFacts) {
  const control = PersistedControlSchema.parse(input); const now = facts.now ?? new Date();
  if (control.revoked || (control.expiresAt && control.expiresAt <= now) || control.guildId !== facts.guildId || control.publication.guildId !== facts.guildId || control.publication.channelId !== facts.channelId || control.publication.messageId !== facts.messageId || !['applied', 'published'].includes(control.publication.state)) throw new DomainError('FORBIDDEN', 'This published control is unavailable.', 403);
  if (control.actorId && control.actorId !== facts.actorId) throw new DomainError('FORBIDDEN', 'This view belongs to another member. Open your own view.', 403);
  const submission = validateControlSubmission(control.publication.document, control.key, facts.values);
  if (JSON.stringify(submission.action) !== JSON.stringify(control.action)) throw new DomainError('FORBIDDEN', 'This control no longer matches its publication.', 403);
  return { control, action: submission.action, values: submission.values };
}
