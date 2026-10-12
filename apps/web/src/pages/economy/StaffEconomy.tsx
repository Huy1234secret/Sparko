import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2,
  Coins,
  Gavel,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  TriangleAlert,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import {
  NumberField,
  RoleChecklist,
  SwitchField,
  fieldError,
  useRoles,
} from '../../features/config/fields';
import {
  AutomationSettings,
  OffNotice,
} from '../../features/automation/shared';
import {
  DurationField,
  PercentField,
  RoleMultipliers,
  UnitsField,
  useShopItems,
} from '../../features/economy/fields';
import {
  EconomyState,
  PositiveUnitsInput,
  RarityBadge,
  Units,
  UserId,
  typeLabels,
  useRefreshEconomy,
} from '../../features/economy/shared';
import {
  createItem,
  getAuctions,
  getOrders,
  getReconcile,
  grantFunds,
  orderFilters,
  refundOrder,
  setStock,
  type Order,
  type OrderFilter,
  type ShopRecord,
} from '../../services/economy';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

function Ledger({ guildId }: { guildId: string }) {
  const check = useQuery({
    queryKey: ['economy', guildId, 'reconcile'],
    queryFn: ({ signal }) => getReconcile(guildId, signal),
  });
  return (
    <Card>
      <div className="section-heading">
        <div>
          <h2>Ledger health</h2>
          <p className="muted">
            Every balance is rebuilt from the ledger and compared with the
            stored total. Every transaction must add up to zero.
          </p>
        </div>
        <Button
          variant="secondary"
          busy={check.isFetching}
          onClick={() => void check.refetch()}
        >
          <RefreshCw size={16} /> Check again
        </Button>
      </div>
      {check.isPending ? (
        <LoadingState label="Checking the ledger…" />
      ) : check.error ? (
        <ErrorState message={errorMessage(check.error)} />
      ) : check.data.balanced ? (
        <Notice tone="success" title="Balanced">
          {check.data.accounts} accounts match the ledger. Checked{' '}
          {new Date(check.data.checkedAt).toLocaleString()}.
        </Notice>
      ) : (
        <Notice tone="danger" title="Needs attention">
          {check.data.mismatches.length} account(s) differ from the ledger:{' '}
          {check.data.mismatches
            .map((m) => `${m.ownerId} (stored ${m.cached}, ledger ${m.ledger})`)
            .join('; ')}
          . Pause spending in this server and contact Sparko support.
        </Notice>
      )}
    </Card>
  );
}

const GrantForm = z.object({
  userId: UserId,
  amount: PositiveUnitsInput,
  reason: z.string().trim().min(3, 'Record why.').max(500),
});
function Grant({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const form = useForm<z.input<typeof GrantForm>>({
    resolver: zodResolver(GrantForm),
    defaultValues: { userId: '', amount: '', reason: '' },
  });
  const grant = useMutation({
    mutationFn: (values: z.output<typeof GrantForm>) =>
      grantFunds(guildId, values, identity('grant', values)),
    onSuccess: () => {
      form.reset();
      refresh();
    },
  });
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit((values) => grant.mutate(values))}
      >
        <h2>Grant to a member</h2>
        <p className="muted">
          Creates virtual units from the server’s issuer account. The reason is
          kept in the audit log.
        </p>
        <Field
          label="Member (Discord user ID)"
          htmlFor="grant-user"
          error={form.formState.errors.userId?.message}
        >
          <Input
            id="grant-user"
            inputMode="numeric"
            autoComplete="off"
            {...form.register('userId')}
          />
        </Field>
        <Field
          label="Amount"
          htmlFor="grant-amount"
          error={form.formState.errors.amount?.message}
        >
          <Input
            id="grant-amount"
            inputMode="numeric"
            {...form.register('amount')}
          />
        </Field>
        <Field
          label="Reason (recorded)"
          htmlFor="grant-reason"
          error={form.formState.errors.reason?.message}
        >
          <Input id="grant-reason" {...form.register('reason')} />
        </Field>
        <div className="row">
          <Button type="submit" busy={grant.isPending}>
            <Coins size={16} /> Grant
          </Button>
        </div>
        {grant.isSuccess && (
          <p className="success-text" role="status">
            Granted and recorded.
          </p>
        )}
        {grant.error && <ErrorState message={errorMessage(grant.error)} />}
      </form>
    </Card>
  );
}

export function EconomyPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Virtual economy"
        description="A server-only virtual currency with a balanced ledger. It has no cash value and is never tied to billing."
      />
      <OffNotice guildId={guildId} featureId="R51" noun="Economy features" />
      <Tabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            content: (
              <div className="stack">
                <Ledger guildId={guildId} />
                <Grant guildId={guildId} />
              </div>
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R51"
                title="Virtual economy"
                description="Name the currency and set the limits for balances and transfers."
                enableLabel="Turn on the economy"
              >
                {(form) => (
                  <>
                    <Field
                      label="Currency name"
                      htmlFor="eco-name"
                      error={fieldError(form as never, 'name')}
                    >
                      <Input id="eco-name" {...form.register('name')} />
                    </Field>
                    <div className="overview-grid">
                      <UnitsField
                        form={form}
                        name="maxBalance"
                        label="Largest balance"
                      />
                      <UnitsField
                        form={form}
                        name="maxTransfer"
                        label="Largest single transfer"
                      />
                      <UnitsField
                        form={form}
                        name="transferDailyCap"
                        label="Transfers per member per day"
                      />
                      <PercentField
                        form={form}
                        name="transferFeeBps"
                        label="Transfer fee"
                        hint="Up to 25%. The fee is removed from circulation."
                      />
                    </div>
                    <SwitchField
                      form={form}
                      name="publicLeaderboard"
                      label="Show balances on the public widget"
                      hint="Only members who share a public profile appear."
                    />
                  </>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}

export function RewardsPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Daily & work rewards"
        description="Let members earn virtual currency on a cooldown, within a daily cap you set."
      />
      <Notice tone="info" title="Needs the economy">
        Rewards are paid in the virtual economy, so it must be on too.
      </Notice>
      <AutomationSettings
        guildId={guildId}
        featureId="R52"
        title="Rewards"
        description="Amounts are whole units. Multipliers and exclusions use each member’s current roles."
        enableLabel="Pay daily and work rewards"
      >
        {(form) => (
          <>
            <div className="overview-grid">
              <NumberField
                form={form}
                name="dailyAmount"
                label="Daily reward"
                min={0}
              />
              <DurationField
                form={form}
                name="dailyCooldownSeconds"
                label="Daily cooldown"
                unit="hours"
              />
              <NumberField
                form={form}
                name="workMin"
                label="Work pays at least"
                min={0}
              />
              <NumberField
                form={form}
                name="workMax"
                label="Work pays at most"
                min={0}
              />
              <DurationField
                form={form}
                name="workCooldownSeconds"
                label="Work cooldown"
                unit="minutes"
              />
              <UnitsField
                form={form}
                name="dailyCap"
                label="Most a member can earn per day"
              />
            </div>
            <RoleMultipliers form={form} guildId={guildId} />
            <PercentField
              form={form}
              name="maxMultiplierBps"
              label="Maximum multiplier"
            />
            <RoleChecklist
              form={form}
              name="excludedRoleIds"
              label="Roles that can’t earn rewards"
              guildId={guildId}
            />
          </>
        )}
      </AutomationSettings>
    </>
  );
}

const ItemForm = z
  .object({
    itemId: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9-]{1,40}$/,
        'Use lowercase letters, numbers and dashes (it can’t change later).',
      ),
    name: z.string().trim().min(1, 'Name the item.').max(80),
    description: z.string().max(1000),
    type: z.enum(['collectible', 'consumable', 'role']),
    rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
    price: PositiveUnitsInput,
    limited: z.boolean(),
    stock: z.number().int().min(0).max(1_000_000),
    perMemberLimit: z.number().int().min(1).max(1_000_000),
    unique: z.boolean(),
    tradeable: z.boolean(),
    roleId: z.string().optional(),
    requiredRoleIds: z.array(z.string()),
    consumeReward: z
      .string()
      .trim()
      .regex(/^(0|[1-9][0-9]{0,18})$/, {
        message: 'Use a whole number.',
      }),
  })
  .refine((v) => v.type !== 'role' || !!v.roleId, {
    path: ['roleId'],
    message: 'Choose the role this item gives.',
  });
type ItemInput = z.input<typeof ItemForm>;

function NewItem({ guildId, onDone }: { guildId: string; onDone: () => void }) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const roles = useRoles(guildId);
  const form = useForm<ItemInput, unknown, z.output<typeof ItemForm>>({
    resolver: zodResolver(ItemForm),
    defaultValues: {
      itemId: '',
      name: '',
      description: '',
      type: 'collectible',
      rarity: 'common',
      price: '',
      limited: false,
      stock: 10,
      perMemberLimit: 1000,
      unique: false,
      tradeable: true,
      requiredRoleIds: [],
      consumeReward: '0',
    },
  });
  const type = form.watch('type');
  const limited = form.watch('limited');
  const create = useMutation({
    mutationFn: (v: z.output<typeof ItemForm>) => {
      const role = v.type === 'role';
      const body = {
        itemId: v.itemId,
        name: v.name,
        description: v.description,
        type: v.type,
        rarity: v.rarity,
        price: v.price,
        stock: v.limited ? v.stock : null,
        perMemberLimit: v.perMemberLimit,
        // Role items are one per member and never tradeable.
        unique: role ? true : v.unique,
        tradeable: role ? false : v.tradeable,
        requiredRoleIds: v.requiredRoleIds,
        consumeReward: v.type === 'consumable' ? v.consumeReward : '0',
        ...(role && v.roleId ? { roleId: v.roleId } : {}),
      };
      return createItem(guildId, body, identity('item', body));
    },
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  const errors = form.formState.errors;
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <h2>New item</h2>
        <div className="overview-grid">
          <Field label="Name" htmlFor="item-name" error={errors.name?.message}>
            <Input id="item-name" {...form.register('name')} />
          </Field>
          <Field
            label="Item ID"
            htmlFor="item-id"
            hint="Permanent; used in recipes and drops."
            error={errors.itemId?.message}
          >
            <Input id="item-id" {...form.register('itemId')} />
          </Field>
          <Field label="Kind" htmlFor="item-type">
            <select id="item-type" {...form.register('type')}>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rarity" htmlFor="item-rarity">
            <select id="item-rarity" {...form.register('rarity')}>
              {['common', 'uncommon', 'rare', 'epic', 'legendary'].map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Price"
            htmlFor="item-price"
            error={errors.price?.message}
          >
            <Input
              id="item-price"
              inputMode="numeric"
              {...form.register('price')}
            />
          </Field>
          <NumberField
            form={form}
            name="perMemberLimit"
            label="Most one member can buy"
            min={1}
          />
        </div>
        <Field label="Description" htmlFor="item-description">
          <textarea
            id="item-description"
            rows={2}
            {...form.register('description')}
          />
        </Field>
        {type === 'role' && (
          <>
            <Field
              label="Role to give"
              htmlFor="item-role"
              hint="Sparko’s highest role must be above it. Role items are one per member and can’t be traded."
              error={errors.roleId?.message}
            >
              <select id="item-role" {...form.register('roleId')}>
                <option value="">Choose a role</option>
                {roles.data
                  ?.filter((role) => !role.managed && role.id !== guildId)
                  .map((role) => (
                    <option
                      key={role.id}
                      value={role.id}
                      disabled={role.privileged || role.assignable === false}
                    >
                      @{role.name}
                      {role.privileged
                        ? ' — has moderator permissions'
                        : role.assignable === false
                          ? ' — above Sparko’s role'
                          : ''}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        {type === 'consumable' && (
          <Field
            label="Using one pays"
            htmlFor="item-reward"
            error={errors.consumeReward?.message}
          >
            <Input
              id="item-reward"
              inputMode="numeric"
              {...form.register('consumeReward')}
            />
          </Field>
        )}
        <SwitchField form={form} name="limited" label="Limited stock" />
        {limited && (
          <NumberField form={form} name="stock" label="In stock" min={0} />
        )}
        {type !== 'role' && (
          <>
            <SwitchField
              form={form}
              name="unique"
              label="One per member"
              hint="Counts items held in trades and winning bids."
            />
            <SwitchField
              form={form}
              name="tradeable"
              label="Members can trade and auction it"
            />
          </>
        )}
        <RoleChecklist
          form={form}
          name="requiredRoleIds"
          label="Only members with one of these roles can buy (optional)"
          guildId={guildId}
        />
        <p className="field-hint">
          The ID, kind and delivery rules are fixed once created; stock and
          availability can change later.
        </p>
        <div className="row">
          <Button type="submit" busy={create.isPending}>
            <ShoppingBag size={16} /> Add to shop
          </Button>
        </div>
        {create.error && <ErrorState message={errorMessage(create.error)} />}
      </form>
    </Card>
  );
}

function StockEditor({ guildId, row }: { guildId: string; row: ShopRecord }) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const [open, setOpen] = useState(false);
  const [stock, setStockValue] = useState(
    row.data.stock === null ? '' : String(row.data.stock),
  );
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => {
      const body = {
        stock: stock.trim() === '' ? null : Number(stock),
        expectedRevision: row.revision,
        reason: reason.trim(),
      };
      return setStock(
        guildId,
        row.data.itemId,
        body,
        identity('stock', { id: row.id, ...body }),
      );
    },
    onSuccess: () => {
      setOpen(false);
      setReason('');
      refresh();
    },
  });
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Change stock
      </Button>
    );
  const valid =
    reason.trim().length >= 3 &&
    (stock.trim() === '' || /^\d{1,7}$/.test(stock.trim()));
  return (
    <form
      className="row policy-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <label className="inline-field" htmlFor={`stock-${row.id}`}>
        <span>Stock</span>
        <Input
          id={`stock-${row.id}`}
          inputMode="numeric"
          placeholder="Unlimited"
          value={stock}
          onChange={(e) => setStockValue(e.target.value)}
        />
      </label>
      <Field label="Reason (recorded)" htmlFor={`stock-reason-${row.id}`}>
        <Input
          id={`stock-reason-${row.id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={!valid} busy={save.isPending}>
        Save stock
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {save.error && <ErrorState message={errorMessage(save.error)} />}
    </form>
  );
}

function Items({ guildId }: { guildId: string }) {
  const shop = useShopItems(guildId);
  const [, setParams] = useSearchParams();
  if (shop.isPending) return <LoadingState />;
  if (shop.error)
    return (
      <ErrorState
        message={errorMessage(shop.error)}
        retry={() => void shop.refetch()}
      />
    );
  if (!shop.data.length)
    return (
      <EmptyState
        icon={ShoppingBag}
        title="No items yet"
        description="Add collectibles, consumables or Discord roles for members to buy."
        action={
          <Button onClick={() => setParams({ tab: 'new' }, { replace: true })}>
            Add an item
          </Button>
        }
      />
    );
  return (
    <Card>
      <ul className="row-list">
        {shop.data.map((row) => (
          <li className="activity-row" key={row.id}>
            <span>
              <strong className="wrap-anywhere">
                {row.data.name} <RarityBadge rarity={row.data.rarity} />
              </strong>
              <small>
                {typeLabels[row.data.type]} · {row.data.itemId} ·{' '}
                <Units value={row.data.price} />
                {' · '}
                {row.data.stock === null
                  ? 'unlimited stock'
                  : `${row.data.stock} in stock`}
                {row.data.unique ? ' · one per member' : ''}
              </small>
            </span>
            <StockEditor guildId={guildId} row={row} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

const filterLabels: Record<OrderFilter, string> = {
  attention: 'Needs attention',
  delivered: 'Delivered',
  refunded: 'Refunded',
  all: 'All',
};
function OrderRow({ guildId, order }: { guildId: string; order: Order }) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const refund = useMutation({
    mutationFn: () =>
      refundOrder(
        guildId,
        order.id,
        reason.trim(),
        identity('refund', order.id),
      ),
    onSuccess: refresh,
  });
  const refundable = ['pending-delivery', 'delivery-failed'].includes(
    order.state,
  );
  return (
    <li className="activity-row">
      <span>
        <strong className="wrap-anywhere">
          {order.name} × {order.quantity} for {order.userId}
        </strong>
        <small>
          <Units value={order.price} /> · ordered{' '}
          {new Date(order.createdAt).toLocaleString()}
          {order.deliveryError && ` · ${order.deliveryError}`}
          {order.refundReason &&
            ` · refunded: ${order.refundReason}${
              order.refundedAt
                ? ` (${new Date(order.refundedAt).toLocaleString()})`
                : ''
            }`}
          {order.state === 'delivery-in-progress' &&
            ' · waiting for Discord to answer; refund unlocks if delivery fails'}
        </small>
      </span>
      <span className="row">
        <EconomyState state={order.state} />
        {refundable && !open && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Refund…
          </Button>
        )}
      </span>
      {refundable && open && (
        <form
          className="row policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim().length >= 3) refund.mutate();
          }}
        >
          <Field
            label="Refund reason (shown to the member)"
            htmlFor={`refund-${order.id}`}
          >
            <Input
              id={`refund-${order.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            disabled={reason.trim().length < 3}
            busy={refund.isPending}
          >
            Refund order
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      )}
      {refund.error && <ErrorState message={errorMessage(refund.error)} />}
    </li>
  );
}
function Orders({ guildId }: { guildId: string }) {
  const [filter, setFilter] = useState<OrderFilter>('attention');
  const orders = useQuery({
    queryKey: ['economy', guildId, 'orders', filter],
    queryFn: ({ signal }) => getOrders(guildId, filter, signal),
  });
  return (
    <div className="stack">
      <p className="muted">
        Role purchases are charged first and delivered by the bot. A refund
        returns the price, stock and purchase allowance together, once.
      </p>
      <div className="queue-filters" role="group" aria-label="Show orders">
        {orderFilters.map((value) => (
          <Button
            key={value}
            variant={filter === value ? 'primary' : 'secondary'}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {filterLabels[value]}
          </Button>
        ))}
      </div>
      {orders.isPending ? (
        <LoadingState />
      ) : orders.error ? (
        <ErrorState
          message={errorMessage(orders.error)}
          retry={() => void orders.refetch()}
        />
      ) : orders.data.length ? (
        <Card>
          <ul className="row-list">
            {orders.data.map((order) => (
              <OrderRow key={order.id} guildId={guildId} order={order} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={filter === 'attention' ? CheckCircle2 : PackageCheck}
          title={
            filter === 'attention' ? 'Nothing waiting' : 'No orders to show'
          }
          description={
            filter === 'attention'
              ? 'Every order has been delivered or refunded.'
              : 'Orders appear here once members buy something.'
          }
        />
      )}
    </div>
  );
}

export function ShopPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  const attention = useQuery({
    queryKey: ['economy', guildId, 'orders', 'attention'],
    queryFn: ({ signal }) => getOrders(guildId, 'attention', signal),
  });
  const waiting = attention.data?.length ?? 0;
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Shop & inventory"
        description="Items members can buy with virtual currency, and the orders that still need delivering."
      />
      <OffNotice guildId={guildId} featureId="R53" noun="Shop sales" />
      {waiting > 0 && (
        <Notice tone="warning" title={`${waiting} order(s) need attention`}>
          <TriangleAlert size={14} aria-hidden="true" /> Open the Orders tab to
          retry delivery or refund.
        </Notice>
      )}
      <Tabs
        tabs={[
          { id: 'items', label: 'Items', content: <Items guildId={guildId} /> },
          {
            id: 'new',
            label: 'New item',
            content: (
              <NewItem
                guildId={guildId}
                onDone={() => setParams({ tab: 'items' }, { replace: true })}
              />
            ),
          },
          {
            id: 'orders',
            label: waiting ? `Orders (${waiting})` : 'Orders',
            content: <Orders guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R53"
                title="Shop"
                description="Role items need Sparko to manage roles below its own. A failed delivery stays in the queue until it is retried or refunded."
                enableLabel="Open the shop"
              />
            ),
          },
        ]}
      />
    </>
  );
}

function AuctionsOverview({ guildId }: { guildId: string }) {
  const auctions = useQuery({
    queryKey: ['economy', guildId, 'auctions'],
    queryFn: ({ signal }) => getAuctions(guildId, signal),
  });
  if (auctions.isPending) return <LoadingState />;
  if (auctions.error)
    return <ErrorState message={errorMessage(auctions.error)} />;
  if (!auctions.data.length)
    return (
      <EmptyState
        icon={Gavel}
        title="No auctions yet"
        description="Members list tradeable items from their economy page."
      />
    );
  return (
    <Card>
      <ul className="row-list">
        {auctions.data.map((a) => (
          <li className="activity-row" key={a.id}>
            <span>
              <strong className="wrap-anywhere">
                {a.name} × {a.quantity}
              </strong>
              <small>
                Seller {a.sellerId} · {a.hasBids ? 'top bid ' : 'starts at '}
                <Units value={a.hasBids ? a.bid : a.minimumBid} /> · ends{' '}
                {new Date(a.endsAt).toLocaleString()}
              </small>
            </span>
            <EconomyState state={a.state} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TradesPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Trades & auctions"
        description="Members trade directly or auction items. Offered assets are held in escrow and settle once."
      />
      <OffNotice guildId={guildId} featureId="R54" noun="Trades" />
      <Tabs
        tabs={[
          {
            id: 'auctions',
            label: 'Auctions',
            content: <AuctionsOverview guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R54"
                title="Trades & auctions"
                description="Trades are private between two members; staff can’t see or change them."
                enableLabel="Allow trades and auctions"
              >
                {(form) => (
                  <div className="overview-grid">
                    <DurationField
                      form={form}
                      name="maxDurationSeconds"
                      label="Longest offer or auction"
                      unit="hours"
                    />
                    <UnitsField form={form} name="maxBid" label="Highest bid" />
                  </div>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
      <p className="field-hint economy-footnote">
        <Badge tone="neutral">Virtual only</Badge> Expired offers and unsold
        auctions return their items automatically.
      </p>
    </>
  );
}
