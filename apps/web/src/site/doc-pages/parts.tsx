import { type ReactNode } from 'react';
import { Icon } from '../../ui';
import { commands } from '../../content/commands';
import { featureDetails } from '../../content/features';
import { studioVariables } from '../../data/studio-format';

export type DocPage = {
  id: string;
  group: 'Getting started' | 'Modules' | 'Reference';
  title: string;
  icon: string;
  lede: string;
  body: () => ReactNode;
};

/** A dashboard screenshot, in whichever theme the visitor is using. */
export function Shot({
  name,
  alt,
  caption,
  wide,
}: {
  name: string;
  alt: string;
  caption?: ReactNode;
  /** Whole-window shots are 1200×750; the rest are the main area. */
  wide?: boolean;
}) {
  const [width, height] = wide ? [1200, 750] : [1176, 869];
  return (
    <figure className="sw-shot">
      <img
        className="sw-shot__img sw-shot__img--dark"
        src={`/docs/${name}-dark.webp`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
      <img
        className="sw-shot__img sw-shot__img--light"
        src={`/docs/${name}-light.webp`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function Tip({
  icon = 'sparkles',
  title = 'Tip',
  children,
}: {
  icon?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="sw-tip">
      <Icon name={icon} />
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
    </aside>
  );
}

export const Code = ({ children }: { children: ReactNode }) => (
  <code className="sp-mono">{children}</code>
);

/** Every command a module uses, with its options, as a small table. */
export function CommandTable({ names }: { names: string[] }) {
  const rows = commands.filter((c) => names.includes(c.name));
  return (
    <div className="sp-table-wrap">
      <table className="sp-table sw-doc-table">
        <thead>
          <tr>
            <th scope="col">Command</th>
            <th scope="col">What it does</th>
            <th scope="col">Who can use it</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name}>
              <td data-label="Command" data-primary="true">
                <Code>{c.name}</Code>
              </td>
              <td data-label="What it does">
                {c.description}
                {c.options.length > 0 && (
                  <ul className="sw-doc-opts">
                    {c.options.map((o) => (
                      <li key={o.name}>
                        <Code>{o.name}</Code> {o.description}
                      </li>
                    ))}
                  </ul>
                )}
                {c.example && (
                  <span className="sw-doc-example">
                    Example: <Code>{c.example}</Code>
                  </span>
                )}
              </td>
              <td data-label="Who">{c.who}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Numbered steps. Each step is wrapped in a span, so bold text and links
 * stay on one line beside the number instead of breaking the grid.
 */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="sw-doc-steps">
      {items.map((step, i) => (
        <li key={i}>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** "To set it up" steps for a finished module, from the features content. */
export function SetupSteps({ id }: { id: string }) {
  return <Steps items={featureDetails[id]?.steps ?? []} />;
}

/** A setting, what it does, and what it starts as. */
export type SettingRow = [name: ReactNode, what: ReactNode, start?: ReactNode];

/** Settings in a card of the dashboard, with what each does. */
export function SettingsTable({
  rows,
  noDefault,
}: {
  rows: SettingRow[];
  /** Leaves out the "Starts as" column, for things with no default. */
  noDefault?: boolean;
}) {
  return (
    <div className="sp-table-wrap">
      <table className="sp-table sw-doc-table">
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">What it does</th>
            {!noDefault && <th scope="col">Starts as</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, what, start], i) => (
            <tr key={i}>
              <td data-label="Setting" data-primary="true">
                <b>{name}</b>
              </td>
              <td data-label="What it does">{what}</td>
              {!noDefault && <td data-label="Starts as">{start ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two columns: a name and what it means, like log tags or modes. */
export function TermTable({
  head,
  rows,
}: {
  head: [string, string];
  rows: [ReactNode, ReactNode][];
}) {
  return (
    <div className="sp-table-wrap">
      <table className="sp-table sw-doc-table">
        <thead>
          <tr>
            <th scope="col">{head[0]}</th>
            <th scope="col">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([term, meaning], i) => (
            <tr key={i}>
              <td data-label={head[0]} data-primary="true">
                <b>{term}</b>
              </td>
              <td data-label={head[1]}>{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What Free and Plus allow. */
export function LimitTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="sp-table-wrap">
      <table className="sp-table sw-doc-table">
        <thead>
          <tr>
            <th scope="col">Limit</th>
            <th scope="col">Free</th>
            <th scope="col">Plus</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([what, free, plus]) => (
            <tr key={what}>
              <td data-label="Limit" data-primary="true">
                {what}
              </td>
              <td data-label="Free">{free}</td>
              <td data-label="Plus">{plus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type StudioVariable = (typeof studioVariables)[number];
type VariableKind = Exclude<keyof StudioVariable, 'name' | 'about'>;

/** The variables only one module fills in, as a list. */
export function VariableList({ only }: { only: VariableKind }) {
  return (
    <dl className="sw-vars">
      {studioVariables
        .filter((v) => v[only])
        .map((v) => (
          <div key={v.name}>
            <dt>
              <Code>{`{${v.name}}`}</Code>
            </dt>
            <dd>{v.about}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Time written the way Sparko reads it, like 30mi, 12h or 7d. */
export function TimeUnits() {
  return (
    <TermTable
      head={['Write', 'For']}
      rows={[
        [
          <>
            <Code>mi</Code> or <Code>m</Code>
          </>,
          'Minutes, like 30mi',
        ],
        [<Code key="h">h</Code>, 'Hours, like 12h'],
        [<Code key="d">d</Code>, 'Days, like 7d'],
        [<Code key="w">w</Code>, 'Weeks, like 2w'],
        [<Code key="mt">mt</Code>, 'Months of 30 days, like 1mt'],
        [<Code key="y">y</Code>, 'Years of 365 days, like 1y'],
        [
          <Code key="mix">1d 12h</Code>,
          'Mix them, with a space or a comma between',
        ],
      ]}
    />
  );
}
