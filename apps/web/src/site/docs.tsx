import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../ui';
import { groups, modules, type ModuleGroup } from '../content/modules';
import { NotFoundPage } from './InfoPages';
import { usePageTitle } from './SiteLayout';
import { type DocPage } from './doc-pages/parts';
import { startDocs } from './doc-pages/start';
import { referenceDocs } from './doc-pages/reference';
import { ticketsDoc } from './doc-pages/tickets';
import { studioDoc } from './doc-pages/studio';
import { welcomeDoc } from './doc-pages/welcome';
import { roleMenusDoc } from './doc-pages/role-menus';
import { autorolesDoc } from './doc-pages/autoroles';
import { suggestionsDoc } from './doc-pages/suggestions';
import { questionsDoc } from './doc-pages/questions';
import { starboardDoc } from './doc-pages/starboard';
import { pollsDoc } from './doc-pages/polls';
import { eventsDoc } from './doc-pages/events';
import { birthdaysDoc } from './doc-pages/birthdays';
import { tempVoiceDoc } from './doc-pages/temp-voice';
import { invitesDoc } from './doc-pages/invites';

const pages: DocPage[] = [
  ...startDocs,
  ticketsDoc,
  studioDoc,
  welcomeDoc,
  roleMenusDoc,
  autorolesDoc,
  suggestionsDoc,
  questionsDoc,
  starboardDoc,
  pollsDoc,
  eventsDoc,
  birthdaysDoc,
  tempVoiceDoc,
  invitesDoc,
  ...referenceDocs,
];

const docGroups = ['Getting started', 'Modules', 'Reference'] as const;

/** Where a module sits in the catalogue, so module pages follow its order. */
const place = (p: DocPage) => {
  const at = modules.findIndex((m) => m.id === p.id);
  return at < 0 ? modules.length : at;
};
const groupOf = (p: DocPage): ModuleGroup | undefined =>
  modules.find((m) => m.id === p.id)?.group;

/** Module pages under the sidebar group they belong to, in sidebar order. */
const moduleSections = groups
  .map((g) => ({
    group: g,
    pages: pages
      .filter((p) => p.group === 'Modules' && groupOf(p) === g)
      .sort((a, b) => place(a) - place(b)),
  }))
  .filter((s) => s.pages.length);

/** Every page in reading order, for the menu and Previous and Next. */
const ordered: DocPage[] = [
  ...pages.filter((p) => p.group === 'Getting started'),
  ...moduleSections.flatMap((s) => s.pages),
  ...pages.filter((p) => p.group === 'Modules' && !groupOf(p)),
  ...pages.filter((p) => p.group === 'Reference'),
];

const sectionsOf = (g: (typeof docGroups)[number]) =>
  g === 'Modules'
    ? [
        ...moduleSections.map((s) => ({ label: s.group, pages: s.pages })),
        ...ordered
          .filter((p) => p.group === 'Modules' && !groupOf(p))
          .map((p) => ({ label: null, pages: [p] })),
      ]
    : [{ label: null, pages: ordered.filter((p) => p.group === g) }];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The page's h2 headings, given ids so "On this page" can link to them. */
function useHeadings(id: string) {
  const body = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<{ id: string; text: string }[]>([]);
  useEffect(() => {
    const seen = new Set<string>();
    const found = Array.from(body.current?.querySelectorAll('h2') ?? []).map(
      (h) => {
        const text = h.textContent ?? '';
        let hid = slug(text) || 'section';
        while (seen.has(hid)) hid += '-2';
        seen.add(hid);
        h.id = hid;
        return { id: hid, text };
      },
    );
    setHeadings(found);
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, [id]);
  return { body, headings };
}

export function DocsPage() {
  const { page: id = 'start' } = useParams();
  const page = ordered.find((p) => p.id === id);
  usePageTitle(page ? `${page.title} · Docs` : 'Not found');
  const navigate = useNavigate();
  const { body, headings } = useHeadings(id);
  if (!page) return <NotFoundPage />;
  const at = ordered.indexOf(page);
  const prev = ordered[at - 1];
  const next = ordered[at + 1];
  return (
    <div className="sw-wrap sw-docs-page">
      <aside className="sw-docs-nav">
        <label className="sw-docs-nav__pick">
          <span className="sp-input sp-input--select">
            <span className="sp-sr-only">Go to a docs page</span>
            <select
              value={page.id}
              onChange={(e) => navigate(`/docs/${e.target.value}`)}
            >
              {docGroups.flatMap((g) =>
                sectionsOf(g).map((s, i) => (
                  <optgroup
                    key={`${g}-${s.label ?? i}`}
                    label={s.label ? `${g}: ${s.label}` : g}
                  >
                    {s.pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </optgroup>
                )),
              )}
            </select>
          </span>
        </label>
        <nav className="sw-docs-nav__list" aria-label="Docs">
          {docGroups.map((g) => (
            <div key={g} className="sw-docs-nav__group">
              <h2>{g}</h2>
              {sectionsOf(g).map((s, i) => (
                <div key={s.label ?? i} className="sw-docs-nav__section">
                  {s.label && <h3>{s.label}</h3>}
                  <ul>
                    {s.pages.map((p) => (
                      <li key={p.id}>
                        <Link
                          to={`/docs/${p.id}`}
                          aria-current={p.id === page.id ? 'page' : undefined}
                        >
                          <Icon name={p.icon} size="sm" />
                          {p.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <article className="sw-doc" key={page.id}>
        <header className="sw-doc__head">
          <span className="sw-doc__group">
            {page.group === 'Modules' && groupOf(page)
              ? `Modules · ${groupOf(page)}`
              : page.group}
          </span>
          <h1 className="sw-h1">{page.title}</h1>
          <p className="sw-lede">{page.lede}</p>
          {page.group === 'Modules' && (
            <p className="sw-doc__links">
              <Link to={`/features/${page.id}`}>
                See {page.title} on the features page
              </Link>
            </p>
          )}
          {headings.length > 2 && (
            <nav className="sw-doc__toc" aria-label="On this page">
              <span>On this page</span>
              <ul>
                {headings.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`}>{h.text}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </header>
        <div className="sw-prose sw-doc__body" ref={body}>
          {page.body()}
        </div>
        <nav className="sw-doc__pager" aria-label="Previous and next page">
          {prev ? (
            <Link to={`/docs/${prev.id}`} className="sw-doc__pager-link">
              <span>Previous</span>
              <b>
                <Icon name="arrow-left" size="sm" />
                {prev.title}
              </b>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              to={`/docs/${next.id}`}
              className="sw-doc__pager-link is-next"
            >
              <span>Next</span>
              <b>
                {next.title}
                <Icon name="arrow-right" size="sm" />
              </b>
            </Link>
          )}
        </nav>
      </article>
    </div>
  );
}
