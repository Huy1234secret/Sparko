// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialMessage, type MessageDocument } from '@sparko/messages';
import { StudioPage } from './StudioPage';
import { getChannels, getEmojis, getRoles } from '../services/guilds';
import {
  createVersion,
  createTemplate,
  getPublications,
  getTemplates,
  getTemplateVersions,
  type Template,
  type Publication,
} from '../services/messages';

vi.mock('../services/guilds', () => ({
  getChannels: vi.fn(),
  getEmojis: vi.fn(),
  getRoles: vi.fn(),
}));
vi.mock('../services/messages', () => ({
  createTemplate: vi.fn(),
  createVersion: vi.fn(),
  getPublications: vi.fn(),
  getTemplates: vi.fn(),
  getTemplateVersions: vi.fn(),
  publishMessage: vi.fn(),
  testMessage: vi.fn(),
  archivePublication: vi.fn(),
  updatePublication: vi.fn(),
  reconcilePublication: vi.fn(),
  duplicateTemplate: vi.fn(),
  restoreTemplateVersion: vi.fn(),
}));

const guildId = '123456789012345678';
const nextGuildId = '123456789012345679';
function template(id: string, name: string, revision: number): Template {
  const document: MessageDocument = {
    schemaVersion: 1,
    mode: 'v2',
    name,
    visibility: 'public',
    tokenContext: 'generic',
    allowedTokens: [],
    blocks: [{ type: 'text', text: `${name} welcome` }],
  };
  const version = {
    id: `${id}-version-${revision}`,
    templateId: id,
    number: revision,
    label: `${name} saved version`,
    document,
    createdAt: '2026-10-11T14:00:00Z',
  };
  return {
    id,
    name,
    revision,
    versions: [version],
    latestVersionId: version.id,
    document,
  };
}
const templateA = template('template-a', 'Template A', 1);
const templateB = template('template-b', 'Template B', 2);
function savedSnapshot(
  source: Template,
  snapshot: MessageDocument,
): Awaited<ReturnType<typeof createVersion>>['data'] {
  const version = {
    id: `${source.id}-version-${source.revision + 1}`,
    templateId: source.id,
    number: source.revision + 1,
    document: structuredClone(snapshot),
    createdAt: '2026-10-11T15:00:00Z',
  };
  return {
    ...source,
    revision: version.number,
    versions: [version],
    latestVersionId: version.id,
    document: version.document,
  };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise resolver has not been initialized.');
  };
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}
const dispose: (() => void)[] = [];
function renderStudio() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/dashboard/:guildId/messages/studio',
        element: (
          <>
            <Link to="/elsewhere">Leave Studio</Link>
            <Link to={`/dashboard/${nextGuildId}/messages/studio`}>
              Switch server
            </Link>
            <StudioPage />
          </>
        ),
      },
      { path: '/elsewhere', element: <h1>Elsewhere</h1> },
    ],
    { initialEntries: [`/dashboard/${guildId}/messages/studio`] },
  );
  dispose.push(() => {
    router.dispose();
    client.clear();
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
async function openTemplate(
  user: ReturnType<typeof userEvent.setup>,
  saved: Template,
) {
  const title = await screen.findByText(saved.name, { selector: 'strong' });
  const row = title.closest<HTMLDivElement>('.template-row');
  if (!row) throw new Error('Template library row missing.');
  await user.click(
    within(row).getByRole('button', { name: 'Versions and preview' }),
  );
  await screen.findByRole('button', {
    name: `Version ${saved.revision} · ${saved.name} saved version`,
  });
  await user.click(
    screen.getByRole('button', { name: 'Open version as draft' }),
  );
  expect(screen.getByLabelText('Design name')).toHaveValue(saved.name);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTemplates).mockResolvedValue([templateA, templateB]);
  vi.mocked(getTemplateVersions).mockImplementation(async (_guild, id) => {
    const saved = [templateA, templateB].find((item) => item.id === id);
    if (!saved) throw new Error('Unknown saved template.');
    return saved.versions;
  });
  vi.mocked(getChannels).mockResolvedValue([]);
  vi.mocked(getRoles).mockResolvedValue([]);
  vi.mocked(getEmojis).mockResolvedValue([]);
  vi.mocked(getPublications).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  dispose.splice(0).forEach((close) => close());
});

describe('Studio draft ownership', () => {
  it('keeps the current template association when an earlier save finishes after opening another design', async () => {
    const user = userEvent.setup();
    const pending = deferred<Awaited<ReturnType<typeof createVersion>>>();
    vi.mocked(createVersion).mockImplementation((_guild, source, snapshot) =>
      source.id === templateA.id
        ? pending.promise
        : Promise.resolve({ data: savedSnapshot(source, snapshot) }),
    );
    renderStudio();
    await openTemplate(user, templateA);
    await user.type(screen.getByLabelText('Design name'), ' draft');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(createVersion).toHaveBeenCalledTimes(1));
    const first = vi.mocked(createVersion).mock.calls[0];
    if (!first) throw new Error('Expected the first save request.');
    expect(first[1]).toMatchObject({ id: templateA.id, revision: 1 });
    await openTemplate(user, templateB);
    await act(async () => {
      pending.resolve({ data: savedSnapshot(templateA, first[2]) });
    });
    expect(screen.getByLabelText('Design name')).toHaveValue(templateB.name);
    await user.type(screen.getByLabelText('Design name'), ' revised');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(createVersion).toHaveBeenCalledTimes(2));
    const second = vi.mocked(createVersion).mock.calls[1];
    expect(second?.[1]).toMatchObject({ id: templateB.id, revision: 2 });
    expect(second?.[2].name).toBe('Template B revised');
  });

  it('blocks navigation while an unsaved previous draft is retained behind a clean saved design', async () => {
    const user = userEvent.setup();
    renderStudio();
    await user.clear(screen.getByLabelText('Design name'));
    await user.type(
      screen.getByLabelText('Design name'),
      'Unsaved independent design',
    );
    await openTemplate(user, templateB);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Return to previous draft' }),
    ).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Leave Studio' }));
    const guard = await screen.findByRole('dialog', {
      name: 'Keep your changes?',
    });
    expect(
      screen.queryByRole('heading', { name: 'Elsewhere' }),
    ).not.toBeInTheDocument();
    await user.click(within(guard).getByRole('button', { name: 'Stay here' }));
    await user.click(
      screen.getByRole('button', { name: 'Return to previous draft' }),
    );
    expect(screen.getByLabelText('Design name')).toHaveValue(
      'Unsaved independent design',
    );
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });

  it('resets guild-bound publication and destination state after permitted server navigation and ignores an old save', async () => {
    const user = userEvent.setup();
    const otherTemplate = template(
      'other-server-template',
      'Other server template',
      4,
    );
    const sourceChannel = '123456789012345680';
    const publication: Publication = {
      id: 'guild-a-publication',
      channelId: sourceChannel,
      state: 'applied',
      status: 'applied',
      deliveryStatus: 'applied',
      revision: 1,
      appliedRevision: 1,
      test: false,
      document: templateA.document,
      createdAt: '2026-10-11T14:00:00Z',
    };
    vi.mocked(getTemplates).mockImplementation(async (guild) =>
      guild === nextGuildId ? [otherTemplate] : [templateA, templateB],
    );
    vi.mocked(getTemplateVersions).mockImplementation(async (_guild, id) => {
      const saved = [templateA, templateB, otherTemplate].find(
        (item) => item.id === id,
      );
      if (!saved) throw new Error('Unknown saved template.');
      return saved.versions;
    });
    vi.mocked(getChannels).mockImplementation(async (guild) =>
      guild === nextGuildId
        ? [{ id: '123456789012345681', name: 'bravo', type: 0 }]
        : [{ id: sourceChannel, name: 'alpha', type: 0 }],
    );
    vi.mocked(getPublications).mockImplementation(async (guild) =>
      guild === nextGuildId ? [] : [publication],
    );
    const pending = deferred<Awaited<ReturnType<typeof createTemplate>>>();
    vi.mocked(createTemplate).mockReturnValue(pending.promise);
    vi.mocked(createVersion).mockImplementation(
      async (_guild, source, snapshot) => ({
        data: savedSnapshot(source, snapshot),
      }),
    );
    renderStudio();
    await user.click(
      await screen.findByRole('button', { name: 'Edit publication' }),
    );
    expect(
      screen.getByRole('button', { name: 'Update published message' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Discord destination')).toHaveValue(
      sourceChannel,
    );
    await user.type(screen.getByLabelText('Design name'), ' draft');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(createTemplate).toHaveBeenCalledTimes(1));
    const previousSave = vi.mocked(createTemplate).mock.calls[0];
    if (!previousSave)
      throw new Error('Expected the previous guild save request.');
    await user.click(screen.getByRole('link', { name: 'Switch server' }));
    const guard = await screen.findByRole('dialog', {
      name: 'Keep your changes?',
    });
    await user.click(
      within(guard).getByRole('button', { name: 'Discard and leave' }),
    );
    await screen.findByText(otherTemplate.name, { selector: 'strong' });
    expect(screen.getByLabelText('Design name')).toHaveValue(
      initialMessage().name,
    );
    expect(screen.getByLabelText('Discord destination')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Update published message' }),
    ).not.toBeInTheDocument();
    await openTemplate(user, otherTemplate);
    await act(async () => {
      pending.resolve({
        data: savedSnapshot(
          { ...templateA, id: 'saved-guild-a-draft', revision: 0 },
          previousSave[1],
        ),
      });
    });
    await user.type(screen.getByLabelText('Design name'), ' revised');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(createVersion).toHaveBeenCalledTimes(1));
    const newSave = vi.mocked(createVersion).mock.calls[0];
    expect(newSave?.[0]).toBe(nextGuildId);
    expect(newSave?.[1]).toMatchObject({ id: otherTemplate.id, revision: 4 });
    expect(newSave?.[2].name).toBe('Other server template revised');
  });
  it('deep links focus the publication inventory inside the same Studio', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const router = createMemoryRouter(
      [
        {
          path: '/dashboard/:guildId/messages/publications',
          element: <StudioPage section="publications" />,
        },
      ],
      { initialEntries: [`/dashboard/${guildId}/messages/publications`] },
    );
    dispose.push(() => {
      router.dispose();
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Publication inventory' })
          .parentElement,
      ).toHaveFocus(),
    );
    expect(screen.getByLabelText('Design name')).toBeVisible();
  });
});
