import { useId, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Accessible tabs whose selection is kept in the URL (`?tab=`). */
export function Tabs({
  tabs,
  defaultTab,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  defaultTab?: string | undefined;
}) {
  const [params, setParams] = useSearchParams();
  const base = useId();
  const active =
    tabs.find((tab) => tab.id === (params.get('tab') ?? defaultTab)) ?? tabs[0];
  if (!active) return null;
  const select = (id: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('tab', id);
        return next;
      },
      { replace: true },
    );
  return (
    <div className="stack">
      <div className="tabs module-tabs" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${base}-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === active.id}
            aria-controls={`${base}-${tab.id}-panel`}
            tabIndex={tab.id === active.id ? 0 : -1}
            className={tab.id === active.id ? 'active' : ''}
            onClick={() => select(tab.id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              const next =
                tabs[
                  (index +
                    (event.key === 'ArrowRight' ? 1 : -1) +
                    tabs.length) %
                    tabs.length
                ];
              if (!next) return;
              select(next.id);
              document.getElementById(`${base}-${next.id}`)?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-${active.id}-panel`}
        aria-labelledby={`${base}-${active.id}`}
      >
        {active.content}
      </div>
    </div>
  );
}
