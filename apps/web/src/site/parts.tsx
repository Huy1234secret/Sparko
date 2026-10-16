import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Icon } from '../ui';
import type { SparkoModule } from '../content/modules';
import { freeModuleCount, modules } from '../content/modules';
import { isReady } from '../content/features';
import { type Faq as FaqItem } from '../content/site';
import { useAccountActions } from './SiteLayout';
import { Tilt, useOnScreenClass } from './motion';

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="sw-faq">
      {items.map((f) => (
        <details key={f.q}>
          <summary>
            {f.q}
            <Icon name="plus" />
          </summary>
          <p className="sw-faq__a">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/**
 * A price whose digits spin in like a slot machine when it scrolls into
 * view. Screen readers get the plain price.
 */
export function RollingPrice({ value }: { value: string }) {
  let digit = 0;
  return (
    <span className="sp-price__value">
      <span className="sp-sr-only">{value}</span>
      <span className="sw-roll" aria-hidden="true">
        {[...value].map((char, i) =>
          /\d/.test(char) ? (
            <span
              key={i}
              className="sw-roll__col"
              style={{ '--d': char, '--i': digit++ } as CSSProperties}
            >
              <span className="sw-roll__strip">
                {[...'01234567890123456789'].map((n, j) => (
                  <span key={j}>{n}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={i}>{char}</span>
          ),
        )}
      </span>
    </span>
  );
}

export function PricingTeaser() {
  const { addBot } = useAccountActions();
  const grid = useOnScreenClass<HTMLDivElement>('is-rolled');
  return (
    <div className="sw-price-grid" ref={grid}>
      <Tilt max={4} className="sp-price sw-reveal">
        <div className="sp-price__head">
          <div className="sp-price__name">Free</div>
          <p className="sp-price__desc">
            {freeModuleCount} of {modules.length} modules, for one server or
            many.
          </p>
        </div>
        <div className="sp-price__amount">
          <RollingPrice value="US$0" />
          <span className="sp-price__unit">forever</span>
        </div>
        <div className="sp-price__cta">
          <Button block onClick={addBot}>
            Add Sparko free
          </Button>
        </div>
      </Tilt>
      <Tilt
        max={4}
        className="sp-price sp-price--featured sp-sparks sw-reveal sw-plus"
      >
        <span className="sw-beam" aria-hidden="true">
          <i />
        </span>
        <div className="sp-price__head">
          <div className="sp-price__name">
            Plus
            <Badge tone="plus" className="sw-shine">
              First month US$1.49
            </Badge>
          </div>
          <p className="sp-price__desc">
            Copy settings across servers, 10× the limits.
          </p>
        </div>
        <div className="sp-price__amount">
          <RollingPrice value="US$3.99" />
          <span className="sp-price__unit">/ month</span>
        </div>
        <div className="sp-price__cta">
          <Link
            className="sp-btn sp-btn--primary sp-btn--block sw-shine"
            to="/pricing"
          >
            Compare plans
          </Link>
        </div>
      </Tilt>
    </div>
  );
}

export function ModuleCard({ module }: { module: SparkoModule }) {
  const body = (
    <>
      <span className="sw-card__icon sw-card__icon--plain">
        <Icon name={module.icon} />
      </span>
      <span className="sw-mod__name">
        {module.label}
        {module.plus && (
          <Badge tone="plus" size="sm">
            Plus
          </Badge>
        )}
        {isReady(module.id) ? (
          <Badge tone="success" size="sm" icon="circle-check">
            Ready
          </Badge>
        ) : (
          <Badge size="sm">Coming soon</Badge>
        )}
      </span>
      <span className="sw-mod__desc">{module.description}</span>
    </>
  );
  // Only finished modules open a page; the rest show what's on the way.
  if (!isReady(module.id))
    return (
      <div className="sw-card sw-mod sw-mod--soon" aria-disabled="true">
        {body}
      </div>
    );
  return (
    <Link
      className="sw-card sw-card--link sw-mod"
      to={`/features/${module.id}`}
    >
      {body}
    </Link>
  );
}
