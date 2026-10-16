import { Fragment, useState, type CSSProperties } from 'react';
import { Badge, Button, Icon, Segmented, Spinner, useToast } from '../ui';
import {
  billingFaq,
  freeFeatures,
  periods,
  planLimits,
  plusFeatures,
  type Period,
} from '../content/site';
import { Faq, RollingPrice } from './parts';
import { PointerGlow, Tilt, useOnScreenClass } from './motion';
import { useAccountActions, usePageTitle } from './SiteLayout';

const order = (i: number) => ({ '--i': i }) as CSSProperties;

/** Room for the longest Plus price, so switching periods rolls in place. */
const priceSlots = Math.max(
  ...Object.values(periods).map(
    (p) => p.price.replace(/^\D*/, '').split('.')[0]?.length ?? 0,
  ),
);

function Features({ items }: { items: string[] }) {
  return (
    <ul className="sp-price__features">
      {items.map((item, i) => (
        <li key={item} className="sw-reveal sw-reveal--line" style={order(i)}>
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
  const grid = useOnScreenClass<HTMLDivElement>('is-rolled');
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
    <>
      <section className="sw-pricing-hero" aria-labelledby="pricing-h">
        <div className="sw-aurora" aria-hidden="true">
          <i />
          <i />
        </div>
        <PointerGlow />
        <div className="sw-wrap">
          <header
            className="sw-page-hero"
            style={{ justifyItems: 'center', textAlign: 'center' }}
          >
            <h1 className="sw-h1" id="pricing-h">
              {['Free', 'for', 'nearly'].map((word, i) => (
                <Fragment key={word}>
                  <span className="sw-word" style={order(i)}>
                    {word}
                  </span>{' '}
                </Fragment>
              ))}
              <span className="sw-word sw-mark" style={order(3)}>
                everything.
              </span>
            </h1>
            <p className="sw-lede sw-enter" style={order(4)}>
              Every module except multi-server tools is free. Plus raises the
              limits for busy servers and lets you copy settings between
              servers.
            </p>
          </header>
          <div className="sw-period sw-enter" style={order(5)}>
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
          <div className="sw-price-grid sw-enter" style={order(6)} ref={grid}>
            <Tilt as="article" max={3} className="sp-price">
              <div className="sp-price__head">
                <h2 className="sp-price__name">Free</h2>
                <p className="sp-price__desc">For any server, big or small.</p>
              </div>
              <div className="sp-price__amount">
                <RollingPrice value="US$0" />
                <span className="sp-price__unit">forever</span>
              </div>
              <Features items={freeFeatures} />
              <div className="sp-price__cta">
                <Button block onClick={addBot}>
                  Add Sparko free
                </Button>
              </div>
            </Tilt>
            <Tilt
              as="article"
              max={3}
              className="sp-price sp-price--featured sp-sparks sw-plus"
            >
              <span className="sw-beam" aria-hidden="true">
                <i />
              </span>
              <div className="sp-price__head">
                <h2 className="sp-price__name">
                  Plus
                  <Badge
                    key={plan.badge}
                    tone="plus"
                    className="sw-shine sw-pop"
                  >
                    {plan.badge}
                  </Badge>
                </h2>
                <p className="sp-price__desc">
                  For servers that outgrow the limits, or run more than one.
                </p>
              </div>
              <div className="sp-price__amount" aria-live="polite">
                <RollingPrice value={plan.price} slots={priceSlots} />
                <span key={plan.unit} className="sp-price__unit sw-pop">
                  {plan.unit}
                </span>
              </div>
              <p key={plan.note} className="sw-per-month sw-pop">
                {plan.note}
              </p>
              <Features items={plusFeatures} />
              <div className="sp-price__cta">
                <Button
                  variant="primary"
                  block
                  className="sw-shine"
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
            </Tilt>
          </div>
        </div>
      </section>
      <div className="sw-wrap">
        <section
          style={{ padding: '72px 0 0', maxWidth: 960, margin: '0 auto' }}
          aria-labelledby="cmp-h"
        >
          <h2
            className="sw-h3 sw-reveal"
            id="cmp-h"
            style={{ fontSize: 20, marginBottom: 16 }}
          >
            Compare limits
          </h2>
          <div className="sp-table-wrap">
            <table className="sp-table sw-compare">
              <thead>
                <tr>
                  <th scope="col">What you get</th>
                  <th scope="col">Free</th>
                  <th scope="col">Plus</th>
                </tr>
              </thead>
              <tbody>
                {planLimits.map(([what, free, plus], i) => (
                  <tr
                    key={what}
                    className="sw-reveal sw-reveal--line"
                    style={order(i)}
                  >
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
    </>
  );
}
