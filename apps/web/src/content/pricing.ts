/**
 * Plus prices as set in the operator's PayPal plans. PayPal charges the
 * amounts configured there; keep these labels in step when they change.
 */
export type BillingPeriod = 'monthly' | 'semiannual' | 'annual';
export const periodOptions: Record<
  BillingPeriod,
  { label: string; price: string; note: string }
> = {
  monthly: {
    label: 'Monthly',
    price: 'US$3.99 a month',
    note: 'First month US$1.49',
  },
  semiannual: {
    label: 'Every 6 months',
    price: 'US$21.55 every 6 months',
    note: 'Save 10%',
  },
  annual: {
    label: 'Yearly',
    price: 'US$35.91 a year',
    note: 'Save 25%',
  },
};
