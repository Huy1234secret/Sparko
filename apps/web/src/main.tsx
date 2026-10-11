import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoadingState } from '@sparko/ui';
import { ApiError } from './services/http';
import {
  AppRoot,
  DashboardShell,
  PublicShell,
  RequireSession,
  RouteError,
} from './components/AppShell';
import {
  ServerPickerPage,
  OverviewPage,
  SetupPage,
} from './pages/DashboardPages';
import {
  TicketConfigPage,
  TicketInboxPage,
  TicketDetailPage,
} from './pages/TicketPages';
import {
  AccountPage,
  PreferencesPage,
  PrivacyAccountPage,
  ProductSupportPage,
} from './pages/AccountPages';
import {
  HomePage,
  FeaturesPage,
  FeatureDetailPage,
  DocsPage,
  CommandsPage,
  StatusPage,
  SupportLandingPage,
  ChangelogPage,
  PrivacyPage,
  TermsPage,
} from './pages/PublicPages';
import './styles.css';

const Studio = lazy(() =>
  import('./pages/StudioPage').then((module) => ({
    default: module.StudioPage,
  })),
);
const ModuleIndex = lazy(() =>
  import('./pages/ModulePages').then((module) => ({
    default: module.ModuleIndexPage,
  })),
);
const Module = lazy(() =>
  import('./pages/community').then((module) => ({
    default: module.ModuleRouter,
  })),
);
const Analytics = lazy(() =>
  import('./pages/ModulePages').then((module) => ({
    default: module.AnalyticsPage,
  })),
);
const MemberPortal = lazy(() =>
  import('./pages/community/MemberPage').then((module) => ({
    default: module.MemberPage,
  })),
);
const Owner = lazy(() =>
  import('./pages/OwnerPages').then((module) => ({
    default: module.OwnerPage,
  })),
);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: true,
      retry: (failures, error) =>
        failures < 1 &&
        !(error instanceof ApiError && [401, 403, 404].includes(error.status)),
    },
    mutations: { retry: false },
  },
});
export const router = createBrowserRouter([
  {
    element: <AppRoot />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'features', element: <FeaturesPage /> },
          { path: 'features/:slug', element: <FeatureDetailPage /> },
          { path: 'docs', element: <DocsPage /> },
          { path: 'commands', element: <CommandsPage /> },
          { path: 'status', element: <StatusPage /> },
          { path: 'support', element: <SupportLandingPage /> },
          { path: 'changelog', element: <ChangelogPage /> },
          { path: 'privacy', element: <PrivacyPage /> },
          { path: 'terms', element: <TermsPage /> },
        ],
      },
      {
        element: <RequireSession />,
        children: [
          {
            element: <DashboardShell />,
            children: [
              { path: 'dashboard', element: <ServerPickerPage /> },
              { path: 'dashboard/:guildId', element: <OverviewPage /> },
              { path: 'dashboard/:guildId/setup', element: <SetupPage /> },
              {
                path: 'dashboard/:guildId/support/tickets',
                element: <TicketInboxPage />,
              },
              {
                path: 'dashboard/:guildId/support/tickets/config',
                element: <TicketConfigPage />,
              },
              {
                path: 'dashboard/:guildId/support/tickets/:ticketId',
                element: <TicketDetailPage />,
              },
              {
                path: 'dashboard/:guildId/messages/studio',
                element: <Studio />,
              },
              {
                path: 'dashboard/:guildId/messages/templates',
                element: <Studio section="templates" />,
              },
              {
                path: 'dashboard/:guildId/messages/publications',
                element: <Studio section="publications" />,
              },
              {
                path: 'dashboard/:guildId/insights/analytics',
                element: <Analytics />,
              },
              {
                path: 'dashboard/:guildId/:group/:module',
                element: <Module />,
              },
              { path: 'dashboard/:guildId/:group', element: <ModuleIndex /> },
              { path: 'account', element: <AccountPage /> },
              { path: 'account/preferences', element: <PreferencesPage /> },
              { path: 'account/privacy', element: <PrivacyAccountPage /> },
              { path: 'account/support', element: <ProductSupportPage /> },
              { path: 'servers/:guildId/me', element: <MemberPortal /> },
              {
                path: 'servers/:guildId/tickets',
                element: <TicketInboxPage member />,
              },
              { path: 'owner', element: <Owner /> },
              { path: 'owner/health', element: <Owner /> },
              { path: 'owner/fleet', element: <Owner section="fleet" /> },
              { path: 'owner/jobs', element: <Owner section="jobs" /> },
              { path: 'owner/support', element: <Owner section="support" /> },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
const root = document.getElementById('root');
if (!root) throw new Error('The Sparko root element is missing.');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<LoadingState label="Opening Sparko…" />}>
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  </StrictMode>,
);
