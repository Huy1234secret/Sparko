import { useState } from 'react';
import { Badge, Button, Icon, Segmented, Spinner, useToast } from '../ui';
import {
  billingFaq,
  freeFeatures,
  periods,
  planLimits,
  plusFeatures,
  type Period,
} from '../content/site';
import { Faq } from './parts';
import { useAccountActions, usePageTitle } from './SiteLayout';

function Features({ items }: { items: string[] }) {
  return (
    <ul className="sp-price__features">
      {items.map((item) => (
        <li key={item}>
          <Icon name="check" size="sm" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PricingPage() {
  usePageTitle('Pricing');
  const [period, setPeriod] = useState<Period>('monthly');
  const [buying, setBuying] = useState(false);
  const { addBot } = useAccountActions();
  const toast = useToast();
  const plan = periods[period];
  const buy = () => {
    setBuying(true);
    setTimeout(() => {
      setBuying(false);
      toast({
        title: 'Sign in, then PayPal',
        body: `You’d sign in with Discord, pick a server and pay ${plan.price} through PayPal.`,
      });
    }, 900);
  };
  return (
    <div className="sw-wrap">
      <header
        className="sw-page-hero"
        style={{ justifyItems: 'center', textAlign: 'center' }}
      >
        <span className="sw-eyebrow">Pricing</span>
        <h1 className="sw-h1">Free for nearly everything.</h1>
        <p className="sw-lede">
          Every module except multi-server tools is free. Plus raises the limits
          for busy servers and lets you copy settings between servers.
        </p>
      </header>
      <div className="sw-period">
        <Segmented
          label="Billing period"
          value={period}
          onChange={setPeriod}
          options={(Object.keys(periods) as Period[]).map((key) => ({
            value: key,
            label: (
              <>
                {periods[key].label}
                {periods[key].save && (
                  <Badge tone="success" size="sm">
                    {periods[key].save}
                  </Badge>
                )}
              </>
            ),
          }))}
        />
      </div>
      <div className="sw-price-grid">
        <article className="sp-price">
          <div className="sp-price__head">
            <h2 className="sp-price__name">Free</h2>
            <p className="sp-price__desc">For any server, big or small.</p>
          </div>
          <div className="sp-price__amount">
            <span className="sp-price__value">US$0</span>
            <span className="sp-price__unit">forever</span>
          </div>
          <Features items={freeFeatures} />
          <div className="sp-price__cta">
            <Button block onClick={addBot}>
              Add Sparko free
            </Button>
          </div>
        </article>
        <article className="sp-price sp-price--featured sp-sparks">
          <div className="sp-price__head">
            <h2 className="sp-price__name">
              Plus<Badge tone="plus">{plan.badge}</Badge>
            </h2>
            <p className="sp-price__desc">
              For servers that outgrow the limits, or run more than one.
            </p>
          </div>
          <div className="sp-price__amount" aria-live="polite">
            <span className="sp-price__value">{plan.price}</span>
            <span className="sp-price__unit">{plan.unit}</span>
          </div>
          <p className="sw-per-month">{plan.note}</p>
          <Features items={plusFeatures} />
          <div className="sp-price__cta">
            <Button
              variant="primary"
              block
              aria-busy={buying}
              disabled={buying}
              onClick={buy}
            >
              {buying && <Spinner />}
              {buying
                ? 'Opening PayPal…'
                : `Get Plus · ${plan.label.toLowerCase()}`}
            </Button>
            <p className="sp-price__note">
              Paid through PayPal. Cancel or change period any time.
            </p>
          </div>
        </article>
      </div>
      <section
        style={{ padding: '72px 0 0', maxWidth: 880, margin: '0 auto' }}
        aria-labelledby="cmp-h"
      >
        <h2
          className="sw-h3"
          id="cmp-h"
          style={{ fontSize: 20, marginBottom: 16 }}
        >
          Compare limits
        </h2>
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">What you get</th>
                <th scope="col">Free</th>
                <th scope="col">Plus</th>
              </tr>
            </thead>
            <tbody>
              {planLimits.map(([what, free, plus]) => (
                <tr key={what}>
                  <td
                    data-label="Feature"
                    data-primary="true"
                    style={{ fontWeight: 500 }}
                  >
                    {what}
                  </td>
                  <td data-label="Free">{free}</td>
                  <td data-label="Plus">{plus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="sw-section" aria-labelledby="bfaq-h">
        <div className="sw-head sw-head--center">
          <h2 className="sw-h2" id="bfaq-h">
            Billing questions
          </h2>
        </div>
        <Faq items={billingFaq} />
      </section>
    </div>
  );
}
