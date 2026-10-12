import { z } from 'zod';
import { mutate, read } from './http';

const AttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  bytes: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export const SupportMessageSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  staff: z.boolean().optional(),
  attachments: z.array(AttachmentSchema).default([]),
});
export const SupportTicketSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  subject: z.string(),
  category: z.string(),
  state: z.enum(['open', 'waiting_on_user', 'resolved', 'closed']),
  messages: z.array(SupportMessageSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SupportTicket = z.infer<typeof SupportTicketSchema>;
export type SupportState = SupportTicket['state'];
export type SupportAttachmentInput = { name: string; base64: string };
export type SupportScope = 'account' | 'owner';

export const getSupportTickets = (scope: SupportScope, signal?: AbortSignal) =>
  read(`/${scope}/support`, z.array(SupportTicketSchema), signal);
export const createSupportTicket = (
  body: {
    subject: string;
    category: string;
    message: string;
    attachments: SupportAttachmentInput[];
  },
  key: string,
) => mutate('post', '/account/support', body, SupportTicketSchema, key);
export const replySupport = (
  scope: SupportScope,
  id: string,
  body: { message: string; attachments: SupportAttachmentInput[] },
  key: string,
) => mutate('post', `/${scope}/support/${id}/reply`, body, z.unknown(), key);
export const setSupportState = (
  scope: SupportScope,
  id: string,
  state: SupportState,
  key: string,
) =>
  mutate('post', `/${scope}/support/${id}/status`, { state }, z.unknown(), key);
export const attachmentUrl = (
  scope: SupportScope,
  ticketId: string,
  attachmentId: string,
) => `/api/v1/${scope}/support/${ticketId}/attachments/${attachmentId}`;

/** Reads a chosen screenshot; the server re-encodes it and strips metadata. */
export async function toAttachment(
  file: File,
): Promise<SupportAttachmentInput> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    name: file.name.slice(0, 100) || 'screenshot',
    base64: btoa(binary),
  };
}
