import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { SiteLayout } from './site/SiteLayout';
import { HomePage } from './site/HomePage';

/** Pages other than the home page load when first opened. */
const page =
  (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
    Component: (await load()).default,
  });
const info = (name: keyof typeof import('./site/InfoPages')) =>
  page(async () => ({ default: (await import('./site/InfoPages'))[name] }));

export const routes: RouteObject[] = [
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
      { path: 'docs', lazy: info('DocsPage') },
      { path: 'status', lazy: info('StatusPage') },
      { path: 'support', lazy: info('SupportPage') },
      { path: 'privacy', lazy: info('PrivacyPage') },
      { path: 'terms', lazy: info('TermsPage') },
      { path: '*', lazy: info('NotFoundPage') },
    ],
  },
];
export const createRouter = () => createBrowserRouter(routes);
