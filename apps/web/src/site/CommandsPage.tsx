import { useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, Icon, SearchIcon } from '../ui';
import {
  commandCategories,
  commands,
  type CommandCategory,
} from '../content/commands';
import { usePageTitle } from './SiteLayout';

export function CommandsPage() {
  usePageTitle('Commands');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const catParam = params.get('category');
  const category = commandCategories.includes(catParam as CommandCategory)
    ? (catParam as CommandCategory)
    : null;
  const set = (key: string, value: string | null) => {
    const out = new URLSearchParams(params);
    if (value) out.set(key, value);
    else out.delete(key);
    setParams(out, { replace: true });
  };
  const needle = query.trim().toLowerCase().replace(/^\//, '');
  const list = commands.filter(
    (c) =>
      (!category || c.category === category) &&
      (!needle || `${c.name} ${c.description}`.toLowerCase().includes(needle)),
  );
  return (
    <div className="sw-wrap" style={{ paddingBottom: 96 }}>
      <header className="sw-page-hero">
        <span className="sw-eyebrow">Commands</span>
        <h1 className="sw-h1">Every slash command, in one place.</h1>
        <p className="sw-lede">
          Type / in Discord to see them. Server owners can turn any command off
          or limit who can use it from the dashboard.
        </p>
      </header>
      <div className="sw-toolbar">
        <div className="sp-input" style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <SearchIcon />
          <input
            type="search"
            aria-label="Search commands"
            placeholder="Search commands, like “ban”"
            value={query}
            onChange={(e) => set('q', e.target.value)}
          />
          <span
            className="sp-input__end sp-tnum"
            style={{ fontSize: 13 }}
            aria-live="polite"
          >
            {list.length} commands
          </span>
        </div>
        <div
          className="sw-chips"
          style={{ gap: 8 }}
          role="group"
          aria-label="Filter by category"
        >
          {[null, ...commandCategories].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              className="sp-chip sp-chip--toggle"
              aria-pressed={category === c}
              onClick={() => set('category', c)}
            >
              {c ?? 'All'}
            </button>
          ))}
        </div>
      </div>
      <div className="sw-cmds">
        {list.map((c) => (
          <details key={c.name} className="sw-cmd">
            <summary>
              <span className="sw-cmd__name">{c.name}</span>
              <span className="sw-cmd__desc">{c.description}</span>
              <Badge>{c.category}</Badge>
              <Icon name="chevron-down" className="sw-cmd__chev" />
            </summary>
            <div className="sw-cmd__body">
              <div className="sw-usage">
                <span style={{ color: 'var(--sp-dc-muted)' }}>Example</span>
                {c.example}
              </div>
              <dl className="sw-opts">
                {c.options.map((o) => (
                  <div key={o.name} style={{ display: 'contents' }}>
                    <dt>{o.name}</dt>
                    <dd>{o.description}</dd>
                  </div>
                ))}
                <dt>who</dt>
                <dd>{c.who}</dd>
              </dl>
            </div>
          </details>
        ))}
        {!list.length && (
          <div className="sp-card">
            <EmptyState
              icon="terminal"
              title={`No commands match “${query}”`}
              actions={
                <Button
                  onClick={() =>
                    setParams(new URLSearchParams(), { replace: true })
                  }
                >
                  Show all commands
                </Button>
              }
            >
              Server owners can also make their own with Custom commands.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
