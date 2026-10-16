import { Link } from 'react-router-dom';
import { Badge, Button, Icon } from '../ui';
import type { SparkoModule } from '../content/modules';
import { freeModuleCount, modules } from '../content/modules';
import { type Faq as FaqItem } from '../content/site';
import { useAccountActions } from './SiteLayout';
import { Tilt } from './motion';

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

export function PricingTeaser() {
  const { addBot } = useAccountActions();
  return (
    <div className="sw-price-grid">
      <Tilt max={4} className="sp-price sw-reveal">
        <div className="sp-price__head">
          <div className="sp-price__name">Free</div>
          <p className="sp-price__desc">
            {freeModuleCount} of {modules.length} modules, for one server or
            many.
          </p>
        </div>
        <div className="sp-price__amount">
          <span className="sp-price__value">US$0</span>
          <span className="sp-price__unit">forever</span>
        </div>
        <div className="sp-price__cta">
          <Button block onClick={addBot}>
            Add Sparko free
          </Button>
        </div>
      </Tilt>
      <Tilt max={4} className="sp-price sp-price--featured sp-sparks sw-reveal">
        <div className="sp-price__head">
          <div className="sp-price__name">
            Plus<Badge tone="plus">First month US$1.49</Badge>
          </div>
          <p className="sp-price__desc">
            Copy settings across servers, 10× the limits.
          </p>
        </div>
        <div className="sp-price__amount">
          <span className="sp-price__value">US$3.99</span>
          <span className="sp-price__unit">/ month</span>
        </div>
        <div className="sp-price__cta">
          <Link className="sp-btn sp-btn--primary sp-btn--block" to="/pricing">
            Compare plans
          </Link>
        </div>
      </Tilt>
    </div>
  );
}

export function ModuleCard({ module }: { module: SparkoModule }) {
  return (
    <Link
      className="sw-card sw-card--link sw-mod"
      to={`/features/${module.id}`}
    >
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
      </span>
      <span className="sw-mod__desc">{module.description}</span>
    </Link>
  );
}
