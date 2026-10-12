import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Badge } from '@sparko/ui';
import {
  formatUnits,
  getOverview,
  rarityTone,
  unitsPattern,
} from '../../services/economy';
import { mutationIdentity } from '../../services/http';

export function useOverview(guildId: string) {
  return useQuery({
    queryKey: ['economy', guildId, 'overview'],
    queryFn: ({ signal }) => getOverview(guildId, signal),
  });
}
/** Every economy read lives under one key, so a spend refreshes them all. */
export function useRefreshEconomy(guildId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: ['economy', guildId] });
}

/**
 * Idempotency keys for repeatable actions (claim, hunt, play, buy). A retry
 * after a lost response reuses the pending key, so it can never charge or
 * reward twice; once the server confirms, the next attempt is a new action.
 */
export function useRetryKey() {
  const pending = useRef(new Map<string, string>());
  return {
    key(action: string) {
      const existing = pending.current.get(action);
      if (existing) return existing;
      const created = mutationIdentity();
      pending.current.set(action, created);
      return created;
    },
    done(action: string) {
      pending.current.delete(action);
    },
  };
}

/** Re-renders on an interval so countdowns and "ready" states stay current. */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
/** "in 5 min", "in 2 h 10 min", or "now". */
export function untilText(instant: string, now: number) {
  const ms = Date.parse(instant) - now;
  if (ms <= 0) return 'now';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
export const readyAt = (instant: string | null, now: number) =>
  !instant || Date.parse(instant) <= now;

export function Units({ value, name }: { value: string; name?: string }) {
  return <span className="units">{formatUnits(value, name)}</span>;
}
export function RarityBadge({ rarity }: { rarity: string }) {
  return (
    <Badge tone={rarityTone[rarity] ?? 'neutral'}>
      {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
    </Badge>
  );
}
const orderStates: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  'pending-delivery': { label: 'Waiting to deliver', tone: 'warning' },
  'delivery-in-progress': { label: 'Delivering', tone: 'info' },
  'delivery-failed': { label: 'Delivery failed', tone: 'danger' },
  delivered: { label: 'Delivered', tone: 'success' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  open: { label: 'Open', tone: 'success' },
  settled: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  unsold: { label: 'No bids', tone: 'neutral' },
  drawn: { label: 'Drawn', tone: 'success' },
  won: { label: 'Correct', tone: 'success' },
  lost: { label: 'Not quite', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
};
export function EconomyState({ state }: { state: string }) {
  const known = orderStates[state] ?? {
    label: state.replaceAll('-', ' '),
    tone: 'neutral' as const,
  };
  return <Badge tone={known.tone}>{known.label}</Badge>;
}

export const typeLabels: Record<string, string> = {
  collectible: 'Collectible',
  consumable: 'Consumable',
  role: 'Discord role',
};
/** Ledger transaction kinds in member language. */
export const ledgerKinds: Record<string, string> = {
  reward: 'Reward',
  grant: 'Staff grant',
  transfer: 'Transfer',
  purchase: 'Shop purchase',
  refund: 'Refund',
  'escrow-lock': 'Held for a trade',
  'escrow-return': 'Returned from a trade',
  trade: 'Trade',
  'auction-bid': 'Auction bid',
  'auction-refund': 'Outbid refund',
  'auction-payout': 'Auction sale',
  craft: 'Crafting',
  'lottery-entry': 'Lottery tickets',
  'lottery-refund': 'Lottery refund',
  'lottery-prize': 'Lottery prize',
};

export const UnitsInput = z
  .string()
  .trim()
  .regex(unitsPattern, 'Use a whole number, like 250.');
export const PositiveUnitsInput = UnitsInput.refine(
  (v) => v !== '0',
  'Use a whole number above zero.',
);
export const UserId = z
  .string()
  .trim()
  .regex(/^\d{17,20}$/, 'Enter a Discord user ID (17–20 digits).');
export const atLeast = (value: string, other: string) =>
  BigInt(value) >= BigInt(other);
