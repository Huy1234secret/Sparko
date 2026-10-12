import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ExternalLink } from 'lucide-react';
import {
  Advanced,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageHeading,
} from '@sparko/ui';
import {
  entitlementStatus,
  getBilling,
  startCheckout,
  type Billing,
  type Plan,
} from '../services/billing';
import { getGuilds } from '../services/guilds';
import { ApiError, errorMessage } from '../services/http';
import { useActionIdentity } from '../hooks/useActionIdentity';
import { periodOptions, type BillingPeriod } from '../content/pricing';

const planName = (id: string) => (id === 'plus' ? 'Plus' : 'Free');
const limitRows: {
  key: keyof Plan;
  label: string;
  format: (v: never) => string;
}[] = [
  {
    key: 'templates',
    label: 'Saved message designs',
    format: (v: number) => String(v),
  },
  {
    key: 'storageBytes',
    label: 'Image library',
    format: (v: number) => `${v / 1_000_000} MB`,
  },
  {
    key: 'automationSteps',
    label: 'Steps in one workflow',
    format: (v: number) => String(v),
  },
  {
    key: 'transcriptRetentionDays',
    label: 'Ticket transcripts kept',
    format: (v: number) => `${v} days`,
  },
  {
    key: 'multiServer',
    label: 'Multi-server tools',
    format: (v: boolean) => (v ? 'Included' : 'Not included'),
  },
];

function PlanTable({ billing }: { billing: Billing }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Plan limits</caption>
        <thead>
          <tr>
            <th scope="col">Limit</th>
            <th scope="col">Free</th>
            <th scope="col">Plus</th>
          </tr>
        </thead>
        <tbody>
          {limitRows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {(['free', 'plus'] as const).map((id) => (
                <td
                  key={id}
                  aria-current={billing.plan.id === id ? 'true' : undefined}
                >
                  {row.format(billing.plans[id][row.key] as never)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One server's plan, subscription history and checkout. */
export function ServerBilling({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const billing = useQuery({
    queryKey: ['billing', guildId],
    queryFn: ({ signal }) => getBilling(guildId, signal),
    refetchInterval: (query) =>
      query.state.data?.intents.some((i) => i.state === 'checkout-pending')
        ? 3000
        : false,
  });
  const [period, setPeriod] = useState<BillingPeriod | null>(null);
  const [changing, setChanging] = useState(false);
  const checkout = useMutation({
    mutationFn: (chosen: BillingPeriod) =>
      startCheckout(
        guildId,
        identity('checkout', [chosen, billing.dataUpdatedAt]),
        chosen,
      ),
    onSuccess: () => {
      setChanging(false);
      void queryClient.invalidateQueries({ queryKey: ['billing', guildId] });
    },
  });
  if (billing.isPending) return <LoadingState label="Loading plan…" />;
  if (billing.error)
    return (
      <ErrorState
        message={errorMessage(billing.error)}
        retry={() => void billing.refetch()}
      />
    );
  const data = billing.data;
  const ready = data.intents.find(
    (intent) =>
      intent.state === 'checkout-ready' &&
      intent.data.checkoutUrl &&
      (!intent.data.expiresAt ||
        Date.parse(intent.data.expiresAt) > Date.now()),
  );
  const preparing = data.intents.some((i) => i.state === 'checkout-pending');
  const offered = data.availability.periods;
  const chosen = period && offered.includes(period) ? period : offered[0];
  const readyPeriod = periodOptions[ready?.data.period as BillingPeriod]
    ? (ready?.data.period as BillingPeriod)
    : 'monthly';
  return (
    <div className="stack">
      <Card>
        <div className="section-heading">
          <div>
            <h2>Current plan</h2>
            <p className="muted">
              Paid plans raise real limits. Privacy and permission checks are
              the same on every plan.
            </p>
          </div>
          <Badge tone={data.plan.id === 'plus' ? 'success' : 'neutral'}>
            {planName(data.plan.id)}
          </Badge>
        </div>
        <PlanTable billing={data} />
        <p className="field-hint">
          If Plus ends, nothing is deleted. Work already over a Free limit stays
          usable; only new work past the limit is refused, and new transcripts
          follow the Free retention.
        </p>
      </Card>
      {data.plan.id === 'free' && (
        <Card>
          <h2>Upgrade to Plus</h2>
          {!data.availability.available ? (
            <Notice tone="info" title="Checkout isn’t available yet">
              The operator hasn’t finished setting up the billing provider, so
              nothing can be bought here.
            </Notice>
          ) : ready && !changing ? (
            <>
              <p className="muted">
                {periodOptions[readyPeriod].label}:{' '}
                {periodOptions[readyPeriod].price}.
              </p>
              <div className="row">
                <a
                  className="button button-primary"
                  href={ready.data.checkoutUrl}
                >
                  {data.availability.provider === 'paypal'
                    ? 'Continue to PayPal'
                    : 'Continue to secure checkout'}{' '}
                  <ExternalLink size={15} />
                </a>
                {offered.length > 1 && (
                  <Button variant="ghost" onClick={() => setChanging(true)}>
                    Choose another billing period
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                Checkout opens on the payment provider’s page. Plus starts only
                once the provider confirms payment to Sparko; returning to this
                page does not by itself turn it on.
              </p>
              {offered.length > 0 && (
                <fieldset className="stack period-options">
                  <legend>Billing period</legend>
                  {offered.map((id) => (
                    <label className="checkbox-row" key={id}>
                      <input
                        type="radio"
                        name="billing-period"
                        checked={chosen === id}
                        onChange={() => setPeriod(id)}
                      />
                      <span>
                        <strong>{periodOptions[id].label}</strong> ·{' '}
                        {periodOptions[id].price}{' '}
                        <Badge tone="info">{periodOptions[id].note}</Badge>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="row">
                <Button
                  busy={checkout.isPending || preparing}
                  disabled={!chosen}
                  onClick={() => chosen && checkout.mutate(chosen)}
                >
                  <CreditCard size={16} /> Prepare checkout
                </Button>
              </div>
            </>
          )}
          {checkout.error && (
            <ErrorState message={errorMessage(checkout.error)} />
          )}
        </Card>
      )}
      <Card>
        <h2>Subscriptions and grants</h2>
        {data.entitlements.length ? (
          data.entitlements.map((row) => {
            const status = entitlementStatus(row);
            return (
              <div className="activity-row" key={row.id}>
                <span>
                  <strong>
                    {row.data.provider === 'staff'
                      ? 'Granted by Sparko staff'
                      : 'Subscription'}
                  </strong>
                  <small>
                    {row.data.expiresAt
                      ? `${status.label === 'Expired' ? 'Ended' : 'Runs until'} ${new Date(row.data.expiresAt).toLocaleDateString()}`
                      : 'No end date recorded'}
                    {row.data.provider === 'staff' && row.data.reason
                      ? ` · ${row.data.reason}`
                      : ''}
                  </small>
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
            );
          })
        ) : (
          <p className="muted">No subscription or grant yet.</p>
        )}
        {data.events.length > 0 && (
          <Advanced summary={`Provider events (${data.events.length})`}>
            {data.events.map((event) => (
              <div className="activity-row" key={event.id}>
                <span>
                  <strong>{event.data.type ?? 'Event'}</strong>
                  <small>{new Date(event.createdAt).toLocaleString()}</small>
                </span>
              </div>
            ))}
          </Advanced>
        )}
      </Card>
    </div>
  );
}

export function BillingPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Server settings"
        title="Plan & billing"
        description="See this server’s plan, what each plan includes and the history of its subscription."
      />
      <ServerBilling guildId={guildId} />
    </>
  );
}

/** Account-wide view: every server you manage, and the checkout return. */
export function AccountBillingPage() {
  const [params] = useSearchParams();
  const guilds = useQuery({
    queryKey: ['guilds'],
    queryFn: ({ signal }) => getGuilds(signal),
  });
  const returned = params.get('checkout');
  const managed = guilds.data?.filter((g) => g.manageable && g.installed) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="Your account"
        title="Plans & billing"
        description="Plans belong to a server. Pick a server you manage to see its plan or upgrade it."
      />
      {returned === 'returned' && (
        <Notice tone="info" title="Payment is being confirmed">
          Plus turns on when the payment provider confirms the payment to
          Sparko, usually within a minute. Returning here does not by itself
          change a plan.
        </Notice>
      )}
      {returned === 'cancelled' && (
        <Notice tone="info" title="Checkout cancelled">
          Nothing was charged and no plan changed.
        </Notice>
      )}
      {guilds.isPending ? (
        <LoadingState />
      ) : guilds.error ? (
        <ErrorState message={errorMessage(guilds.error)} />
      ) : managed.length ? (
        <div className="stack">
          {managed.map((guild) => (
            <AccountServerPlan
              key={guild.id}
              guildId={guild.id}
              name={guild.name}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No servers to manage"
          description="Plans are managed by server owners and administrators."
        />
      )}
    </>
  );
}
function AccountServerPlan({
  guildId,
  name,
}: {
  guildId: string;
  name: string;
}) {
  const billing = useQuery({
    queryKey: ['billing', guildId],
    queryFn: ({ signal }) => getBilling(guildId, signal),
    retry: false,
  });
  const forbidden =
    billing.error instanceof ApiError && billing.error.status === 403;
  return (
    <Card>
      <div className="section-heading">
        <div>
          <h2 className="wrap-anywhere">{name}</h2>
          <p className="muted">
            {billing.isPending
              ? 'Loading plan…'
              : forbidden
                ? 'Only server managers with settings access can see the plan.'
                : billing.error
                  ? errorMessage(billing.error)
                  : `${planName(billing.data.plan.id)} plan`}
          </p>
        </div>
        <Link
          className="button button-secondary"
          to={`/dashboard/${guildId}/settings/billing`}
        >
          Manage plan
        </Link>
      </div>
    </Card>
  );
}
