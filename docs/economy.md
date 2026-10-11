# Virtual economy and advanced community

Sparks are guild-scoped integer virtual units. They have no cash redemption and never change a billing entitlement. Amounts cross API/JSON boundaries as decimal strings. No legacy balance is imported.

All mutation routes run through the shared capability policy and serializable PostgreSQL operation transaction with a guild advisory lock. An idempotency key identifies the actor, route, parameters and body; retries preserve that key. The ledger has explicit issuer, sink and per-business-record escrow accounts. Every posting balances to zero, and only the issuer may carry debt. The forward database migration also enforces account ownership, tenant equality, bounds and balanced posting sums.

## Member and manager actions

The domain and API support balance/history, daily/work claims, bounded transfers, shop purchases, inventory consumption, trade offers/accept/cancel, auctions/bids/cancel before first bid, hunting/crafting, trivia, virtual lottery entry, commendations, achievements and seasonal leaderboards. Manager routes define items, stock, recipes, questions, lotteries, achievements and seasons. Member routes expose their own balance, inventory, orders, trades, reputation and awards; public progression requires explicit profile/widget sharing.

Rewards reserve persistent cooldown and daily budgets in the same transaction as their ledger posting. Transfers require a recent non-bot membership observation for the recipient. Role reward multipliers and exclusions come from current actor roles. A failed or stale operation rolls back balances, stock, inventory and budget changes together.

Shop definitions have permanent IDs and immutable ownership/delivery rules. Stock changes require the current revision and reason. Unique ownership includes items held in open trade/auction escrow and an open winning auction bid. That reservation prevents a member acquiring a second unique item while the first one is awaiting return or delivery.

## Delivery and escrow recovery

A role purchase commits its charge and an order in `pending-delivery`. The worker persists `delivery-in-progress` before Discord REST execution. A manager cannot refund an in-flight order. A definitive permission/hierarchy failure changes it to `delivery-failed`, where an explicit manager refund atomically returns the price, stock, purchase allowance and inventory. Repeated refund requests create one refund ledger transaction. A refunded order cannot restart delivery. A timeout retains the in-progress state for reconciliation; an idempotent role PUT can be checked/retried without charging again.

Trade creation escrows the offered assets. Only the named recipient can accept; acceptance escrows requested assets and transfers both sides atomically. Insufficient requested funds/items leave the original escrow intact. Cancellation or the durable expiry job returns the offered assets once. A settled trade cannot return already transferred assets.

Auctions escrow the item, refund the previous bidder atomically when outbid, and charge only the increment when a winning bidder increases their bid. Durable settlement transfers the item and pays the seller once; no-bid settlement returns the item. The seller can cancel only before the first bid. Jobs execute cleanup even when a module has since been disabled, preserving existing obligations.

Lottery rules are captured when created, require manager acknowledgement and member opt-in, and enforce per-member/draw limits. The pot stays in its own escrow. A cryptographic ticket index gives each purchased ticket one position. Concurrent timers converge on one immutable draw; cancellation refunds each entry instead. Lottery fees/payments never involve real money.

## Progression and privacy

Seasons snapshot lifetime XP at creation and compute positive progression above that baseline. Archiving preserves lifetime history, captures the results and public-profile opt-ins, and does not reset lifetime XP. Achievement rewards have a unique actor/achievement/scope identity. Trivia questions expose choices without the answer until a final answer is submitted; one game session can reward once. Commendations require current membership, reject self-commendations, and enforce daily/pair limits.

Public widgets require guild opt-in. Leaderboard rows additionally require each member's public-profile opt-in. Status output contains only installation state and its observation timestamp. Private member histories, guild configuration and billing fields are excluded.

## Verification and remaining work

Focused unit tests cover decimal precision, inventory bounds, issuer/escrow rules, ticket-index fairness, role item constraints and seasonal arithmetic. PostgreSQL tests exercise direct database constraints, large integer round trips, concurrent spending/daily claims/final stock, role delivery/refunds, escrow acceptance/expiry, unique reservations, outbid/settlement, crafting rollback, trivia/lottery races, seasonal privacy, achievements/reputation and tenant/capability denial.

These tests establish local domain invariants. They do not establish complete member/staff UX, live role delivery or full M7 acceptance. Multi-server tools currently provide a fresh-authority, explicit-opt-in comparison/diff; resource-remapped, confirmed rollout and per-target recovery remain unfinished. Review the feature traceability and progress checkpoint before treating any advanced workflow as released.

For a local smoke test, enable only the desired modules, create a collectible with stock one, grant test virtual funds with a manager reason, submit competing purchases, and verify one order plus `/economy/reconcile` reporting `balanced: true`. Create a trade, reject acceptance with insufficient requested funds, then cancel it and verify the original assets returned. Use a configured authorized Discord test server for role delivery, hierarchy failure, ambiguous timeout and refund checks.
