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

/** A blank, then 0–9 twice, so every digit can spin a full turn. */
const rollCells = [' ', ...'01234567890123456789'];

/**
 * A price whose digits spin in like a slot machine when it scrolls into
 * view, and roll like an odometer when it changes. Digits line up on the
 * decimal point; `slots` keeps room for the longest price, so a digit that
 * appears rolls up from blank and slides in, and one that goes rolls away
 * and slides out. Screen readers get the plain price.
 */
export function RollingPrice({
  value,
  slots = 0,
}: {
  value: string;
  slots?: number;
}) {
  const match = /^(\D*)(\d+)(?:\.(\d+))?(.*)$/.exec(value);
  if (!match) return <span className="sp-price__value">{value}</span>;
  const [, prefix = '', int = '', dec = '', suffix = ''] = match;
  const width = Math.max(slots, int.length);
  const intSlots = Array.from(
    { length: width },
    (_, i) => int[i - (width - int.length)],
  );
  let place = 0;
  const column = (digit: string | undefined, key: string) => (
    <span
      key={key}
      className={'sw-roll__col' + (digit ? '' : ' is-empty')}
      style={
        {
          '--t': digit ? 11 + Number(digit) : 0,
          '--i': place++,
        } as CSSProperties
      }
    >
      <span className="sw-roll__win">
        <span className="sw-roll__strip">
          {rollCells.map((n, j) => (
            <span key={j}>{n}</span>
          ))}
        </span>
      </span>
    </span>
  );
  return (
    <span className="sp-price__value">
      <span className="sp-sr-only">{value}</span>
      <span className="sw-roll" aria-hidden="true">
        {prefix}
        {intSlots.map((digit, i) => column(digit, `i${i}`))}
        {dec && '.'}
        {[...dec].map((digit, i) => column(digit, `d${i}`))}
        {suffix}
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
