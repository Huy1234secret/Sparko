import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Briefcase,
  Gift,
  Package,
  Send,
  ShoppingBag,
  Sparkles,
  UserRound,
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
import { Metric } from '../../components/AppShell';
import { Tabs } from '../../features/config/Tabs';
import {
  EconomyState,
  PositiveUnitsInput,
  RarityBadge,
  Units,
  UserId,
  atLeast,
  ledgerKinds,
  readyAt,
  typeLabels,
  untilText,
  useNow,
  useOverview,
  useRefreshEconomy,
  useRetryKey,
} from '../../features/economy/shared';
import {
  claimReward,
  consume,
  getHistory,
  getInventory,
  getShop,
  purchase,
  transfer,
  type Overview,
  type ShopRecord,
} from '../../services/economy';
import { errorMessage } from '../../services/http';
import { TradingTab } from './MemberTrading';
import { CollectionTab, GamesTab, LotteryTab, StandingTab } from './MemberPlay';

/** Shared props for every tab: the guild and the member's overview. */
export type TabProps = { guildId: string; overview: Overview };

function RewardButton({
  guildId,
  overview,
  kind,
}: TabProps & { kind: 'daily' | 'work' }) {
  const now = useNow();
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const [last, setLast] = useState<string | null>(null);
  const claim = useMutation({
    mutationFn: () => claimReward(guildId, kind, retry.key(kind)),
    onSuccess: (result) => {
      retry.done(kind);
      setLast(result.data.awarded ?? null);
      refresh();
    },
  });
  const { rewards, currencyName } = overview;
  const next = kind === 'daily' ? rewards.nextDailyAt : rewards.nextWorkAt;
  const ready = readyAt(next, now);
  const amount =
    kind === 'daily'
      ? `${rewards.dailyAmount}`
      : `${rewards.workMin}–${rewards.workMax}`;
  return (
    <div className="reward-tile">
      <span className="reward-icon" aria-hidden="true">
        {kind === 'daily' ? <Gift size={20} /> : <Briefcase size={20} />}
      </span>
      <span>
        <strong>{kind === 'daily' ? 'Daily reward' : 'Work shift'}</strong>
        <small>
          {amount} {currencyName}
          {ready ? '' : ` · ready ${untilText(next!, now)}`}
        </small>
        {last && (
          <small className="success-text" role="status">
            +{last} {currencyName} added
          </small>
        )}
      </span>
      <Button
        variant={ready ? 'primary' : 'secondary'}
        disabled={!ready || rewards.excluded}
        busy={claim.isPending}
        onClick={() => claim.mutate()}
      >
        {kind === 'daily' ? 'Claim' : 'Work'}
      </Button>
      {claim.error && <ErrorState message={errorMessage(claim.error)} />}
    </div>
  );
}

const TransferForm = z.object({
  recipientId: UserId,
  amount: PositiveUnitsInput,
  reason: z.string().trim().min(1, 'Add a short note.').max(200),
});
function SendFunds({ guildId, overview }: TabProps) {
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const form = useForm<z.input<typeof TransferForm>>({
    resolver: zodResolver(TransferForm),
    defaultValues: { recipientId: '', amount: '', reason: '' },
  });
  const send = useMutation({
    mutationFn: (values: z.output<typeof TransferForm>) =>
      transfer(guildId, values, retry.key(JSON.stringify(values))),
    onSuccess: (_result, values) => {
      retry.done(JSON.stringify(values));
      form.reset();
      refresh();
    },
  });
  const { limits, currencyName } = overview;
  const errors = form.formState.errors;
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => send.mutate(values))}
    >
      <h2>Send {currencyName}</h2>
      <Field
        label="Recipient (Discord user ID)"
        htmlFor="send-recipient"
        error={errors.recipientId?.message}
      >
        <Input
          id="send-recipient"
          inputMode="numeric"
          autoComplete="off"
          {...form.register('recipientId')}
        />
      </Field>
      <Field
        label={`Amount (${currencyName})`}
        htmlFor="send-amount"
        hint={`Up to ${limits.maxTransfer} at once${
          limits.transferFeeBps
            ? `; a ${limits.transferFeeBps / 100}% fee goes to the server`
            : ''
        }.`}
        error={errors.amount?.message}
      >
        <Input
          id="send-amount"
          inputMode="numeric"
          {...form.register('amount')}
        />
      </Field>
      <Field label="Note" htmlFor="send-reason" error={errors.reason?.message}>
        <Input id="send-reason" {...form.register('reason')} />
      </Field>
      <div className="row">
        <Button type="submit" busy={send.isPending}>
          <Send size={16} /> Send
        </Button>
      </div>
      {send.isSuccess && (
        <p className="success-text" role="status">
          Sent.
        </p>
      )}
      {send.error && <ErrorState message={errorMessage(send.error)} />}
    </form>
  );
}

function History({ guildId, overview }: TabProps) {
  const history = useQuery({
    queryKey: ['economy', guildId, 'history'],
    queryFn: ({ signal }) => getHistory(guildId, signal),
  });
  if (history.isPending) return <LoadingState />;
  if (history.error)
    return (
      <ErrorState
        message={errorMessage(history.error)}
        retry={() => void history.refetch()}
      />
    );
  if (!history.data.length)
    return <p className="muted">No activity yet. Claim a reward to start.</p>;
  return (
    <ul className="row-list" aria-label="Recent activity">
      {history.data.map((entry) => (
        <li className="activity-row" key={entry.id}>
          <span>
            <strong>{ledgerKinds[entry.kind] ?? entry.kind}</strong>
            <small>{new Date(entry.createdAt).toLocaleString()}</small>
          </span>
          <strong
            className={entry.amount.startsWith('-') ? 'muted' : 'success-text'}
          >
            {entry.amount.startsWith('-') ? '' : '+'}
            <Units value={entry.amount} name={overview.currencyName} />
          </strong>
        </li>
      ))}
    </ul>
  );
}

function WalletTab(props: TabProps) {
  const { overview } = props;
  return (
    <div className="stack">
      {overview.modules['R52'] ? (
        <Card>
          <h2>Earn</h2>
          {overview.rewards.excluded && (
            <Notice tone="info" title="Rewards aren’t available to you">
              One of your roles is excluded from rewards in this server.
            </Notice>
          )}
          <div className="reward-grid">
            <RewardButton {...props} kind="daily" />
            <RewardButton {...props} kind="work" />
          </div>
          <p className="field-hint">
            Earned today: {overview.rewards.earnedToday} of{' '}
            {overview.rewards.dailyCap} {overview.currencyName}.
          </p>
        </Card>
      ) : null}
      <div className="overview-grid">
        <Card>
          <SendFunds {...props} />
        </Card>
        <Card>
          <h2>Recent activity</h2>
          <History {...props} />
        </Card>
      </div>
    </div>
  );
}

function ShopItem({ guildId, overview, row }: TabProps & { row: ShopRecord }) {
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const [quantity, setQuantity] = useState(1);
  const item = row.data;
  const total = (BigInt(item.price) * BigInt(Math.max(1, quantity))).toString();
  const affordable = atLeast(overview.balance.balance, total);
  const soldOut = item.stock !== null && item.stock < 1;
  const buy = useMutation({
    mutationFn: () =>
      purchase(
        guildId,
        { itemId: item.itemId, quantity },
        retry.key(`${item.itemId}:${quantity}`),
      ),
    onSuccess: () => {
      retry.done(`${item.itemId}:${quantity}`);
      refresh();
    },
  });
  const qtyId = `qty-${row.id}`;
  return (
    <Card className="shop-item">
      <div className="section-heading">
        <h3 className="wrap-anywhere">{item.name}</h3>
        <RarityBadge rarity={item.rarity} />
      </div>
      <p className="muted">
        {typeLabels[item.type]}
        {item.unique ? ' · one per member' : ''}
        {item.type === 'consumable' && item.consumeReward !== '0'
          ? ` · use for ${item.consumeReward} ${overview.currencyName}`
          : ''}
      </p>
      {item.description && <p>{item.description}</p>}
      {item.type === 'role' && (
        <p className="field-hint">
          Gives you a Discord role. If delivery fails, staff can refund the
          order.
        </p>
      )}
      <p>
        <strong>
          <Units value={item.price} name={overview.currencyName} />
        </strong>
        {item.stock !== null && (
          <small className="muted"> · {item.stock} left</small>
        )}
      </p>
      <div className="row">
        {!item.unique && (
          <label className="inline-field" htmlFor={qtyId}>
            <span>Quantity</span>
            <Input
              id={qtyId}
              type="number"
              min={1}
              max={item.stock ?? 1000}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </label>
        )}
        <Button
          disabled={soldOut || !affordable}
          busy={buy.isPending}
          onClick={() => buy.mutate()}
        >
          <ShoppingBag size={16} />
          {soldOut ? 'Sold out' : `Buy for ${total} ${overview.currencyName}`}
        </Button>
      </div>
      {!affordable && !soldOut && (
        <p className="field-hint">You need more {overview.currencyName}.</p>
      )}
      {buy.isSuccess && (
        <p className="success-text" role="status">
          Bought. It’s in your inventory.
        </p>
      )}
      {buy.error && <ErrorState message={errorMessage(buy.error)} />}
    </Card>
  );
}
function ShopTab(props: TabProps) {
  const shop = useQuery({
    queryKey: ['economy', props.guildId, 'shop'],
    queryFn: ({ signal }) => getShop(props.guildId, signal),
  });
  if (shop.isPending) return <LoadingState label="Opening the shop…" />;
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
        title="The shop is empty"
        description="Server staff haven’t added anything to buy yet."
      />
    );
  return (
    <div className="card-grid">
      {shop.data.map((row) => (
        <ShopItem key={row.id} {...props} row={row} />
      ))}
    </div>
  );
}

function InventoryTab({ guildId, overview }: TabProps) {
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const inventory = useQuery({
    queryKey: ['economy', guildId, 'inventory'],
    queryFn: ({ signal }) => getInventory(guildId, signal),
  });
  const use = useMutation({
    mutationFn: (itemId: string) =>
      consume(guildId, { itemId, quantity: 1 }, retry.key(`use:${itemId}`)),
    onSuccess: (_r, itemId) => {
      retry.done(`use:${itemId}`);
      refresh();
    },
  });
  if (inventory.isPending) return <LoadingState />;
  if (inventory.error)
    return (
      <ErrorState
        message={errorMessage(inventory.error)}
        retry={() => void inventory.refetch()}
      />
    );
  const { items, orders } = inventory.data;
  return (
    <div className="stack">
      <Card>
        <h2>Your items</h2>
        {items.length ? (
          <ul className="row-list">
            {items.map((row) => (
              <li className="activity-row" key={row.itemId}>
                <span>
                  <strong className="wrap-anywhere">
                    {row.item?.name ?? row.itemId}{' '}
                    <span className="muted">× {row.quantity}</span>
                  </strong>
                  <small>
                    {row.item ? typeLabels[row.item.type] : 'Retired item'}
                    {row.item && !row.item.tradeable ? ' · not tradeable' : ''}
                  </small>
                </span>
                <span className="row">
                  {row.item && <RarityBadge rarity={row.item.rarity} />}
                  {row.item?.type === 'consumable' && (
                    <Button
                      variant="secondary"
                      busy={use.isPending && use.variables === row.itemId}
                      onClick={() => use.mutate(row.itemId)}
                      aria-label={`Use one ${row.item.name}`}
                    >
                      Use
                      {row.item.consumeReward !== '0' &&
                        ` (+${row.item.consumeReward})`}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Package}
            title="Nothing here yet"
            description="Items you buy, hunt or win appear here."
          />
        )}
        {use.error && <ErrorState message={errorMessage(use.error)} />}
      </Card>
      <Card>
        <h2>Your orders</h2>
        {orders.length ? (
          <ul className="row-list">
            {orders.map((order) => (
              <li className="activity-row" key={order.id}>
                <span>
                  <strong className="wrap-anywhere">
                    {order.name} × {order.quantity}
                  </strong>
                  <small>
                    <Units value={order.price} name={overview.currencyName} /> ·{' '}
                    {new Date(order.createdAt).toLocaleString()}
                    {order.state === 'delivery-failed' &&
                      ' · staff can refund this order'}
                    {order.refundReason && ` · ${order.refundReason}`}
                  </small>
                </span>
                <EconomyState state={order.state} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No orders yet.</p>
        )}
      </Card>
    </div>
  );
}

const tabs = [
  { id: 'wallet', label: 'Wallet', feature: 'R51', Tab: WalletTab },
  { id: 'shop', label: 'Shop', feature: 'R53', Tab: ShopTab },
  { id: 'inventory', label: 'Inventory', feature: 'R53', Tab: InventoryTab },
  { id: 'trading', label: 'Trading', feature: 'R54', Tab: TradingTab },
  { id: 'collection', label: 'Collection', feature: 'R55', Tab: CollectionTab },
  { id: 'games', label: 'Trivia', feature: 'R56', Tab: GamesTab },
  { id: 'lottery', label: 'Lottery', feature: 'R67', Tab: LotteryTab },
  { id: 'standing', label: 'Standing', feature: 'standing', Tab: StandingTab },
];

/** The member's own wallet, shop, trades and games in one server. */
export function MemberEconomyPage() {
  const { guildId = '' } = useParams();
  const overview = useOverview(guildId);
  if (overview.isPending) return <LoadingState label="Opening your wallet…" />;
  if (overview.error)
    return (
      <ErrorState
        message={errorMessage(overview.error)}
        retry={() => void overview.refetch()}
      />
    );
  const data = overview.data;
  const on = (feature: string) =>
    feature === 'standing'
      ? ['R13', 'R14', 'R68'].some((id) => data.modules[id])
      : data.modules[feature] === true;
  const visible = tabs.filter((tab) => on(tab.feature));
  return (
    <>
      <PageHeading
        eyebrow="Member portal"
        title="Your economy"
        description={`${data.currencyName} are this server’s virtual currency. They have no cash value and can’t be bought or redeemed.`}
        actions={
          <Link
            className="button button-secondary"
            to={`/servers/${guildId}/me`}
          >
            <UserRound size={16} /> Your profile
          </Link>
        }
      />
      <div className="metric-grid">
        <Metric
          label="Balance"
          value={
            <Units value={data.balance.balance} name={data.currencyName} />
          }
          detail="Virtual only"
        />
        <Metric
          label="Earned today"
          value={data.rewards.earnedToday}
          detail={`Daily cap ${data.rewards.dailyCap}`}
        />
        <Metric
          label="Modules on"
          value={visible.length}
          detail="Chosen by server staff"
        />
      </div>
      {visible.length ? (
        <Tabs
          tabs={visible.map(({ id, label, Tab }) => ({
            id,
            label,
            content: <Tab guildId={guildId} overview={data} />,
          }))}
        />
      ) : (
        <EmptyState
          icon={Sparkles}
          title="The economy is off in this server"
          description="Server staff can turn on rewards, the shop, trading and games from the dashboard."
        />
      )}
      <p className="field-hint">
        <Badge tone="neutral">Virtual only</Badge> Nothing here can be exchanged
        for real money.
      </p>
    </>
  );
}
