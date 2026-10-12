import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeftRight, Gavel, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
} from '@sparko/ui';
import {
  EconomyState,
  PositiveUnitsInput,
  RarityBadge,
  Units,
  UnitsInput,
  UserId,
  untilText,
  useNow,
  useRefreshEconomy,
  useRetryKey,
} from '../../features/economy/shared';
import {
  bid,
  cancelAuction,
  createAuction,
  createTrade,
  getAuctions,
  getInventory,
  getShop,
  getTrades,
  tradeAction,
  type AuctionView,
  type TradeView,
} from '../../services/economy';
import { errorMessage } from '../../services/http';
import type { TabProps } from './MemberEconomy';

const durations = [
  { hours: 1, label: '1 hour' },
  { hours: 6, label: '6 hours' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];
const ItemLine = z.object({
  itemId: z.string().min(1, 'Choose an item.'),
  quantity: z.number().int().min(1, 'At least one.').max(1_000_000),
});
const Side = z.object({ amount: UnitsInput, items: z.array(ItemLine).max(20) });
const filled = (side: z.output<typeof Side>) =>
  side.amount !== '0' || side.items.length > 0;
const TradeForm = z
  .object({
    recipientId: UserId,
    offered: Side,
    requested: Side,
    hours: z.number(),
  })
  .refine((v) => filled(v.offered), {
    path: ['offered', 'amount'],
    message: 'Offer funds or at least one item.',
  })
  .refine((v) => filled(v.requested), {
    path: ['requested', 'amount'],
    message: 'Ask for funds or at least one item.',
  })
  .refine(
    (v) =>
      new Set(v.offered.items.map((i) => i.itemId)).size ===
        v.offered.items.length &&
      new Set(v.requested.items.map((i) => i.itemId)).size ===
        v.requested.items.length,
    { path: ['requested', 'items'], message: 'List each item once per side.' },
  );
type TradeInput = z.input<typeof TradeForm>;

function SideFields({
  form,
  side,
  label,
  choices,
  currencyName,
}: {
  form: ReturnType<typeof useForm<TradeInput>>;
  side: 'offered' | 'requested';
  label: string;
  choices: { id: string; name: string }[];
  currencyName: string;
}) {
  const lines = useFieldArray({ control: form.control, name: `${side}.items` });
  const errors = form.formState.errors[side];
  return (
    <fieldset className="stack">
      <legend>{label}</legend>
      <Field
        label={`${currencyName}`}
        htmlFor={`${side}-amount`}
        error={errors?.amount?.message}
      >
        <Input
          id={`${side}-amount`}
          inputMode="numeric"
          {...form.register(`${side}.amount`)}
        />
      </Field>
      {lines.fields.map((line, index) => (
        <div className="row" key={line.id}>
          <Field
            label={`Item ${index + 1}`}
            htmlFor={`${side}-item-${index}`}
            error={errors?.items?.[index]?.itemId?.message}
          >
            <select
              id={`${side}-item-${index}`}
              {...form.register(`${side}.items.${index}.itemId`)}
            >
              <option value="">Choose an item</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Quantity"
            htmlFor={`${side}-qty-${index}`}
            error={errors?.items?.[index]?.quantity?.message}
          >
            <Input
              id={`${side}-qty-${index}`}
              type="number"
              min={1}
              {...form.register(`${side}.items.${index}.quantity`, {
                valueAsNumber: true,
              })}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove item ${index + 1}`}
            onClick={() => lines.remove(index)}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      {errors?.items?.message && (
        <p className="field-error" role="alert">
          {errors.items.message}
        </p>
      )}
      <div className="row">
        <Button
          type="button"
          variant="secondary"
          disabled={lines.fields.length >= 20 || !choices.length}
          onClick={() => lines.append({ itemId: '', quantity: 1 })}
        >
          <Plus size={16} /> Add an item
        </Button>
      </div>
    </fieldset>
  );
}

function NewTrade({ guildId, overview }: TabProps) {
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const inventory = useQuery({
    queryKey: ['economy', guildId, 'inventory'],
    queryFn: ({ signal }) => getInventory(guildId, signal),
  });
  const shop = useQuery({
    queryKey: ['economy', guildId, 'shop'],
    queryFn: ({ signal }) => getShop(guildId, signal),
  });
  const form = useForm<TradeInput, unknown, z.output<typeof TradeForm>>({
    resolver: zodResolver(TradeForm),
    defaultValues: {
      recipientId: '',
      offered: { amount: '0', items: [] },
      requested: { amount: '0', items: [] },
      hours: 24,
    },
  });
  const create = useMutation({
    mutationFn: (values: z.output<typeof TradeForm>) => {
      const body = {
        recipientId: values.recipientId,
        offered: values.offered,
        requested: values.requested,
        expiresAt: new Date(
          Date.now() + values.hours * 3_600_000,
        ).toISOString(),
      };
      return createTrade(guildId, body, retry.key('trade'));
    },
    onSuccess: () => {
      retry.done('trade');
      form.reset();
      refresh();
    },
  });
  const tradeable =
    inventory.data?.items
      .filter((row) => row.item?.tradeable)
      .map((row) => ({
        id: row.itemId,
        name: `${row.item!.name} (you have ${row.quantity})`,
      })) ?? [];
  const catalog =
    shop.data
      ?.filter((row) => row.data.tradeable)
      .map((row) => ({ id: row.data.itemId, name: row.data.name })) ?? [];
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <h2>Propose a trade</h2>
      <p className="muted">
        What you offer is held safely until the other member accepts, you
        cancel, or the offer expires; then it comes back to you.
      </p>
      <Field
        label="Trade with (Discord user ID)"
        htmlFor="trade-recipient"
        error={form.formState.errors.recipientId?.message}
      >
        <Input
          id="trade-recipient"
          inputMode="numeric"
          autoComplete="off"
          {...form.register('recipientId')}
        />
      </Field>
      <div className="overview-grid">
        <SideFields
          form={form}
          side="offered"
          label="You give"
          choices={tradeable}
          currencyName={overview.currencyName}
        />
        <SideFields
          form={form}
          side="requested"
          label="You ask for"
          choices={catalog}
          currencyName={overview.currencyName}
        />
      </div>
      <Field label="Offer stays open for" htmlFor="trade-hours">
        <select
          id="trade-hours"
          {...form.register('hours', { valueAsNumber: true })}
        >
          {durations.map((d) => (
            <option key={d.hours} value={d.hours}>
              {d.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="row">
        <Button type="submit" busy={create.isPending}>
          <ArrowLeftRight size={16} /> Send offer
        </Button>
      </div>
      {create.error && <ErrorState message={errorMessage(create.error)} />}
    </form>
  );
}

const assetsText = (
  assets: TradeView['offered'],
  currencyName: string,
): string =>
  [
    ...(assets.amount !== '0' ? [`${assets.amount} ${currencyName}`] : []),
    ...assets.items.map((i) => `${i.name} × ${i.quantity}`),
  ].join(', ') || 'nothing';

function TradeRow({
  guildId,
  overview,
  trade,
}: TabProps & { trade: TradeView }) {
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const act = useMutation({
    mutationFn: (action: 'accept' | 'cancel') =>
      tradeAction(guildId, trade.id, action, retry.key(action)),
    onSuccess: refresh,
  });
  const received = trade.direction === 'received';
  const give = received ? trade.requested : trade.offered;
  const get = received ? trade.offered : trade.requested;
  return (
    <li className="activity-row">
      <span>
        <strong>
          {received
            ? `Offer from ${trade.senderId}`
            : `Offer to ${trade.recipientId}`}
        </strong>
        <small>
          You give {assetsText(give, overview.currencyName)} · you get{' '}
          {assetsText(get, overview.currencyName)}
          {trade.state === 'open' &&
            ` · expires ${new Date(trade.expiresAt).toLocaleString()}`}
        </small>
      </span>
      <span className="row">
        <EconomyState state={trade.state} />
        {trade.state === 'open' && received && (
          <Button
            busy={act.isPending && act.variables === 'accept'}
            onClick={() => act.mutate('accept')}
          >
            Accept
          </Button>
        )}
        {trade.state === 'open' && (
          <Button
            variant="ghost"
            busy={act.isPending && act.variables === 'cancel'}
            onClick={() => act.mutate('cancel')}
          >
            {received ? 'Decline' : 'Cancel'}
          </Button>
        )}
      </span>
      {act.error && <ErrorState message={errorMessage(act.error)} />}
    </li>
  );
}

function AuctionRow({
  guildId,
  overview,
  auction,
}: TabProps & { auction: AuctionView }) {
  const now = useNow();
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const minimum = auction.hasBids
    ? (BigInt(auction.bid) + BigInt(auction.minimumIncrement)).toString()
    : auction.minimumBid;
  const [amount, setAmount] = useState(minimum);
  const place = useMutation({
    mutationFn: () => bid(guildId, auction.id, amount, retry.key(amount)),
    onSuccess: () => {
      retry.done(amount);
      refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelAuction(guildId, auction.id, retry.key('cancel')),
    onSuccess: refresh,
  });
  const open = auction.state === 'open' && Date.parse(auction.endsAt) > now;
  const bidId = `bid-${auction.id}`;
  return (
    <li className="activity-row">
      <span>
        <strong className="wrap-anywhere">
          {auction.name} × {auction.quantity}{' '}
          <RarityBadge rarity={auction.rarity} />
        </strong>
        <small>
          {auction.hasBids ? 'Top bid ' : 'Starts at '}
          <Units
            value={auction.hasBids ? auction.bid : auction.minimumBid}
            name={overview.currencyName}
          />
          {auction.leading && ' · you’re winning'}
          {auction.mine && ' · your auction'}
          {open && ` · ends ${untilText(auction.endsAt, now)}`}
        </small>
      </span>
      <span className="row">
        <EconomyState state={auction.state} />
        {open && !auction.mine && (
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              place.mutate();
            }}
          >
            <label className="inline-field" htmlFor={bidId}>
              <span>Your bid</span>
              <Input
                id={bidId}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.trim())}
              />
            </label>
            <Button type="submit" busy={place.isPending}>
              <Gavel size={16} /> Bid
            </Button>
          </form>
        )}
        {open && auction.mine && !auction.hasBids && (
          <Button
            variant="ghost"
            busy={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel auction
          </Button>
        )}
      </span>
      {place.error && <ErrorState message={errorMessage(place.error)} />}
      {cancel.error && <ErrorState message={errorMessage(cancel.error)} />}
    </li>
  );
}

const AuctionForm = z.object({
  itemId: z.string().min(1, 'Choose an item to sell.'),
  quantity: z.number().int().min(1, 'At least one.'),
  minimumBid: PositiveUnitsInput,
  minimumIncrement: PositiveUnitsInput,
  hours: z.number(),
});
function NewAuction({ guildId, overview }: TabProps) {
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const inventory = useQuery({
    queryKey: ['economy', guildId, 'inventory'],
    queryFn: ({ signal }) => getInventory(guildId, signal),
  });
  const form = useForm<z.input<typeof AuctionForm>>({
    resolver: zodResolver(AuctionForm),
    defaultValues: {
      itemId: '',
      quantity: 1,
      minimumBid: '',
      minimumIncrement: '1',
      hours: 24,
    },
  });
  const create = useMutation({
    mutationFn: ({ hours, ...values }: z.output<typeof AuctionForm>) =>
      createAuction(
        guildId,
        {
          ...values,
          endsAt: new Date(Date.now() + hours * 3_600_000).toISOString(),
        },
        retry.key('auction'),
      ),
    onSuccess: () => {
      retry.done('auction');
      form.reset();
      refresh();
    },
  });
  const sellable =
    inventory.data?.items.filter((row) => row.item?.tradeable) ?? [];
  const errors = form.formState.errors;
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <h2>Sell at auction</h2>
      <Field label="Item" htmlFor="auction-item" error={errors.itemId?.message}>
        <select id="auction-item" {...form.register('itemId')}>
          <option value="">
            {sellable.length ? 'Choose an item' : 'No tradeable items'}
          </option>
          {sellable.map((row) => (
            <option key={row.itemId} value={row.itemId}>
              {row.item!.name} (you have {row.quantity})
            </option>
          ))}
        </select>
      </Field>
      <div className="overview-grid">
        <Field
          label="Quantity"
          htmlFor="auction-qty"
          error={errors.quantity?.message}
        >
          <Input
            id="auction-qty"
            type="number"
            min={1}
            {...form.register('quantity', { valueAsNumber: true })}
          />
        </Field>
        <Field
          label={`Starting bid (${overview.currencyName})`}
          htmlFor="auction-min"
          error={errors.minimumBid?.message}
        >
          <Input
            id="auction-min"
            inputMode="numeric"
            {...form.register('minimumBid')}
          />
        </Field>
        <Field
          label="Minimum raise"
          htmlFor="auction-step"
          error={errors.minimumIncrement?.message}
        >
          <Input
            id="auction-step"
            inputMode="numeric"
            {...form.register('minimumIncrement')}
          />
        </Field>
        <Field label="Runs for" htmlFor="auction-hours">
          <select
            id="auction-hours"
            {...form.register('hours', { valueAsNumber: true })}
          >
            {durations.map((d) => (
              <option key={d.hours} value={d.hours}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="field-hint">
        The item is held until the auction ends. With no bids it comes back to
        you; you can cancel only before the first bid.
      </p>
      <div className="row">
        <Button type="submit" busy={create.isPending}>
          <Gavel size={16} /> Start auction
        </Button>
      </div>
      {create.error && <ErrorState message={errorMessage(create.error)} />}
    </form>
  );
}

export function TradingTab(props: TabProps) {
  const { guildId } = props;
  const trades = useQuery({
    queryKey: ['economy', guildId, 'trades'],
    queryFn: ({ signal }) => getTrades(guildId, signal),
  });
  const auctions = useQuery({
    queryKey: ['economy', guildId, 'auctions'],
    queryFn: ({ signal }) => getAuctions(guildId, signal),
  });
  return (
    <div className="stack">
      <Card>
        <h2>Your trades</h2>
        {trades.isPending ? (
          <LoadingState />
        ) : trades.error ? (
          <ErrorState message={errorMessage(trades.error)} />
        ) : trades.data.length ? (
          <ul className="row-list">
            {trades.data.map((trade) => (
              <TradeRow key={trade.id} {...props} trade={trade} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ArrowLeftRight}
            title="No trades yet"
            description="Offers you send or receive appear here."
          />
        )}
      </Card>
      <Card>
        <NewTrade {...props} />
      </Card>
      <Card>
        <h2>Auctions</h2>
        {auctions.isPending ? (
          <LoadingState />
        ) : auctions.error ? (
          <ErrorState message={errorMessage(auctions.error)} />
        ) : auctions.data.length ? (
          <ul className="row-list">
            {auctions.data.map((auction) => (
              <AuctionRow key={auction.id} {...props} auction={auction} />
            ))}
          </ul>
        ) : (
          <p className="muted">No auctions running.</p>
        )}
      </Card>
      <Card>
        <NewAuction {...props} />
      </Card>
    </div>
  );
}
