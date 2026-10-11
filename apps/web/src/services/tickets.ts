import { z } from 'zod';
import { mutate, read } from './http';

export const TicketSchema = z
  .object({
    id: z.string(),
    number: z.number(),
    state: z.string(),
    ownerId: z.string(),
    claimantId: z.string().nullable().optional(),
    channelId: z.string().nullable().optional(),
    revision: z.number(),
    createdAt: z.string(),
    closedAt: z.string().nullable().optional(),
    closeReason: z.string().nullable().optional(),
    snapshot: z.unknown().optional(),
    answers: z.record(z.string(), z.string()).optional(),
    participants: z.array(z.string()).default([]),
    transcriptStatus: z.string().nullable().optional(),
    events: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
          createdAt: z.string(),
          detail: z.string().optional(),
        }),
      )
      .optional(),
  })
  .transform((ticket) => ({
    ...ticket,
    status: ticket.state,
    creatorId: ticket.ownerId,
    subject: `Support ticket #${ticket.number}`,
  }));
export type Ticket = z.infer<typeof TicketSchema>;
export const getTickets = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/tickets`, z.array(TicketSchema), signal);
export const getTicket = (guild: string, id: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/tickets/${id}`, TicketSchema, signal);
export const createTicket = (
  guild: string,
  body: { categoryId: string; answers: Record<string, string> },
  key: string,
) => mutate('post', `/guilds/${guild}/tickets`, body, TicketSchema, key);
export const TicketCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  fields: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      required: z.boolean(),
      maxLength: z.number(),
    }),
  ),
});
export const getTicketCategories = (guild: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/tickets/categories`,
    z.array(TicketCategorySchema),
    signal,
  );
export const claimTicket = (guild: string, ticket: Ticket, key: string) =>
  mutate(
    'post',
    `/guilds/${guild}/tickets/${ticket.id}/claim`,
    { expectedRevision: ticket.revision },
    TicketSchema,
    key,
  );
export const closeTicket = (
  guild: string,
  ticket: Ticket,
  reason: string,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/tickets/${ticket.id}/close`,
    { expectedRevision: ticket.revision, reason },
    TicketSchema,
    key,
  );
export const updateTicket = (
  guild: string,
  ticket: Ticket,
  action: string,
  input: Record<string, unknown>,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/tickets/${ticket.id}/${action}`,
    { expectedRevision: ticket.revision, ...input },
    TicketSchema,
    key,
  );
