import { z } from 'zod';
import { mutate, read } from './http';

const PlanSchema = z.object({
  id: z.enum(['free', 'plus']),
  templates: z.number(),
  storageBytes: z.number(),
  automationSteps: z.number(),
  transcriptRetentionDays: z.number(),
  multiServer: z.boolean(),
});
export type Plan = z.infer<typeof PlanSchema>;
const Row = <T extends z.ZodType>(data: T) =>
  z.object({
    id: z.string(),
    state: z.string(),
    revision: z.number(),
    createdAt: z.string(),
    data,
  });
export const EntitlementSchema = Row(
  z
    .object({
      provider: z.string().optional(),
      status: z.string().optional(),
      active: z.boolean().optional(),
      revoked: z.boolean().optional(),
      cancelAtPeriodEnd: z.boolean().optional(),
      expiresAt: z.string().optional(),
      reason: z.string().optional(),
    })
    .loose(),
);
export type Entitlement = z.infer<typeof EntitlementSchema>;
export const BillingSchema = z.object({
  plan: PlanSchema,
  plans: z.object({ free: PlanSchema, plus: PlanSchema }),
  availability: z
    .object({
      available: z.boolean(),
      provider: z.enum(['paypal', 'stripe']).nullable().optional(),
    })
    .loose(),
  entitlements: z.array(EntitlementSchema),
  events: z.array(
    Row(
      z
        .object({
          type: z.string().optional(),
          observedAt: z.string().optional(),
        })
        .loose(),
    ),
  ),
  intents: z.array(
    Row(
      z
        .object({
          plan: z.string().optional(),
          checkoutUrl: z.string().optional(),
          expiresAt: z.string().optional(),
        })
        .loose(),
    ),
  ),
});
export type Billing = z.infer<typeof BillingSchema>;
export const getBilling = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/billing`, BillingSchema, signal);
export const startCheckout = (guild: string, key: string) =>
  mutate(
    'post',
    `/guilds/${guild}/billing/checkout`,
    { plan: 'plus', confirmed: true },
    z.unknown(),
    key,
  );

/** What a subscription row means for the server today. */
export function entitlementStatus(row: Entitlement, now = Date.now()) {
  const expires = row.data.expiresAt ? Date.parse(row.data.expiresAt) : NaN;
  if (row.data.revoked || row.state === 'revoked')
    return { label: 'Revoked', tone: 'danger' as const };
  if (Number.isFinite(expires) && expires <= now)
    return { label: 'Expired', tone: 'neutral' as const };
  if (row.data.active && row.data.cancelAtPeriodEnd)
    return { label: 'Ends at period end', tone: 'warning' as const };
  if (row.data.active) return { label: 'Active', tone: 'success' as const };
  if (row.data.status === 'past_due')
    return { label: 'Payment overdue', tone: 'warning' as const };
  if (row.data.status === 'canceled')
    return { label: 'Cancelled', tone: 'neutral' as const };
  return { label: 'Inactive', tone: 'neutral' as const };
}
