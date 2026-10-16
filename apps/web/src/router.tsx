import {
  createBrowserRouter,
  Outlet,
  useRouteError,
  type RouteObject,
} from 'react-router-dom';
import { RouteLoader } from './RouteLoader';
import { SiteGate } from './SiteGate';
import { SiteLayout } from './site/SiteLayout';
import { HomePage } from './site/HomePage';

/** Pages other than the home page load when first opened. */
const page =
  (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
    Component: (await load()).default,
  });
const info = (name: keyof typeof import('./site/InfoPages')) =>
  page(async () => ({ default: (await import('./site/InfoPages'))[name] }));

const docs = page(async () => ({
  default: (await import('./site/docs')).DocsPage,
}));

const dashboard = (name: keyof typeof import('./dashboard')) =>
  page(async () => ({ default: (await import('./dashboard'))[name] }));

/** Shown instead of a blank or broken page if something crashes. */
function CrashPage() {
  console.error(useRouteError());
  return (
    <main className="sp-crash" role="alert">
      <h1>Something went wrong on this page</h1>
      <p>Reloading usually fixes it. If it keeps happening, let us know.</p>
      <p>
        <button
          type="button"
          className="sp-btn sp-btn--primary"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>{' '}
        <a className="sp-btn sp-btn--ghost" href="/">
          Go to the home page
        </a>
      </p>
    </main>
  );
}

const pages: RouteObject[] = [
  { path: 'signin', lazy: dashboard('SignInPage') },
  { path: 'dashboard', lazy: dashboard('ServerPickerPage') },
  {
    path: 'dashboard/:serverId',
    lazy: dashboard('ServerLayout'),
    children: [
      { index: true, lazy: dashboard('OverviewPage') },
      { path: 'tickets/:ticketNumber', lazy: dashboard('TicketPage') },
      { path: ':moduleId', lazy: dashboard('ModulePage') },
    ],
  },
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'features',
        lazy: page(async () => ({
          default: (await import('./site/FeaturesPage')).FeaturesPage,
        })),
      },
      {
        path: 'features/:id',
        lazy: page(async () => ({
          default: (await import('./site/FeaturesPage')).FeaturePage,
        })),
      },
      {
        path: 'pricing',
        lazy: page(async () => ({
          default: (await import('./site/PricingPage')).PricingPage,
        })),
      },
      {
        path: 'commands',
        lazy: page(async () => ({
          default: (await import('./site/CommandsPage')).CommandsPage,
        })),
      },
      { path: 'docs', lazy: docs },
      { path: 'docs/:page', lazy: docs },
      { path: 'status', lazy: info('StatusPage') },
      { path: 'support', lazy: info('SupportPage') },
      { path: 'privacy', lazy: info('PrivacyPage') },
      { path: 'terms', lazy: info('TermsPage') },
      { path: '*', lazy: info('NotFoundPage') },
    ],
  },
];
/**
 * Every page, behind the coming-soon gate until launch, with the loading
 * screen that covers page changes.
 */
function Root() {
  return (
    <>
      <SiteGate>
        <Outlet />
      </SiteGate>
      <RouteLoader />
    </>
  );
}

export const routes: RouteObject[] = [
  { element: <Root />, errorElement: <CrashPage />, children: pages },
];
export const createRouter = () => createBrowserRouter(routes);
