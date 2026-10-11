import { renderToString } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { commandRegistry } from '@sparko/contracts';
import { AppRoot, PublicShell } from './src/components/AppShell';
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
} from './src/pages/PublicPages';
import { publicFeatureGuides } from './src/content/public';

export const publicPages = [
  {
    path: '/',
    title: 'A little spark for your community',
    description:
      'Create useful Discord workflows with clear setup, thoughtful message design, private support, and honest operation status.',
  },
  {
    path: '/features',
    title: 'Explore the toolkit',
    description:
      'Explore Sparko modules, current service availability, setup requirements, permissions, and restrictions.',
  },
  ...publicFeatureGuides.map((guide) => ({
    path: `/features/${guide.slug}`,
    title: guide.title,
    description: guide.summary,
  })),
  {
    path: '/docs',
    title: 'Documentation',
    description:
      'Find Sparko setup, message design, permissions, commands, privacy, and troubleshooting guides.',
  },
  {
    path: '/commands',
    title: 'Command reference',
    description:
      'Search the actual Sparko command registry, command options, availability, and permission boundaries.',
  },
  {
    path: '/status',
    title: 'Service status',
    description:
      'Read observed Sparko service status and heartbeat freshness without unsupported uptime claims.',
  },
  {
    path: '/support',
    title: 'Support',
    description:
      'Find Sparko setup help, service status, troubleshooting, and private account support.',
  },
  {
    path: '/changelog',
    title: 'Changelog',
    description:
      'Read Sparko development and release notes with release status kept explicit.',
  },
  {
    path: '/privacy',
    title: 'Privacy, with the details in view.',
    description:
      'How Sparko account, server, support, and provider boundaries work.',
  },
  {
    path: '/terms',
    title: 'Terms, plainly stated.',
    description:
      'Intended use, authorization rules, provider limits, and operational responsibilities.',
  },
];

/** Render the actual public components. No credentials, live metrics, or fixtures are supplied. */
export function renderPublicPage(path: string) {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  query.setQueryData(['session'], { user: null, capabilities: [] });
  query.setQueryData(['public', 'commands'], { commands: commandRegistry });
  try {
    return renderToString(
      <QueryClientProvider client={query}>
        <StaticRouter location={path}>
          <Routes>
            <Route element={<AppRoot />}>
              <Route element={<PublicShell />}>
                <Route index element={<HomePage />} />
                <Route path="features" element={<FeaturesPage />} />
                <Route path="features/:slug" element={<FeatureDetailPage />} />
                <Route path="docs" element={<DocsPage />} />
                <Route path="commands" element={<CommandsPage />} />
                <Route path="status" element={<StatusPage />} />
                <Route path="support" element={<SupportLandingPage />} />
                <Route path="changelog" element={<ChangelogPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="terms" element={<TermsPage />} />
              </Route>
            </Route>
          </Routes>
        </StaticRouter>
      </QueryClientProvider>,
    );
  } finally {
    query.clear();
  }
}
