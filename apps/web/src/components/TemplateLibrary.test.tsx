// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageDocument } from '@sparko/messages';
import { TemplateLibrary } from './TemplateLibrary';
import {
  duplicateTemplate,
  getTemplateVersions,
  restoreTemplateVersion,
  type Template,
  type TemplateVersion,
} from '../services/messages';
import { ApiError } from '../services/http';

vi.mock('../services/messages', () => ({
  duplicateTemplate: vi.fn(),
  getTemplateVersions: vi.fn(),
  restoreTemplateVersion: vi.fn(),
}));

const guildId = '123456789012345678';
function document(name: string, text: string): MessageDocument {
  return {
    schemaVersion: 1,
    mode: 'v2',
    name,
    visibility: 'public',
    tokenContext: 'generic',
    allowedTokens: [],
    blocks: [{ type: 'text', text: `## ${text}` }],
  };
}
const original: TemplateVersion = {
  id: 'immutable-version-one',
  templateId: 'support-template',
  number: 1,
  label: 'Original welcome',
  createdAt: '2026-10-10T14:00:00Z',
  document: document('Original design', 'Original support welcome'),
};
const latest: TemplateVersion = {
  id: 'immutable-version-two',
  templateId: 'support-template',
  number: 2,
  label: 'Current welcome',
  createdAt: '2026-10-11T14:00:00Z',
  document: document('Current design', 'Current support welcome'),
};
const saved: Template = {
  id: 'support-template',
  name: 'Support panel',
  revision: 2,
  versions: [latest],
  latestVersionId: latest.id,
  document: latest.document,
};
const restored: TemplateVersion = {
  ...original,
  id: 'immutable-version-three',
  number: 3,
  label: 'Restored welcome',
};
const copy: Template = {
  ...saved,
  id: 'copied-template',
  name: 'Support panel copy',
  revision: 1,
  versions: [
    { ...original, id: 'copy-version', templateId: 'copied-template' },
  ],
  latestVersionId: 'copy-version',
  document: original.document,
};
const clients: QueryClient[] = [];
function renderLibrary(dirty = true) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const onOpen = vi.fn();
  const tree = (templates: Template[]) => (
    <QueryClientProvider client={client}>
      <TemplateLibrary
        guildId={guildId}
        templates={templates}
        pending={false}
        error={null}
        onRetry={vi.fn()}
        onOpen={onOpen}
        dirty={dirty}
      />
    </QueryClientProvider>
  );
  const view = render(tree([saved]));
  return {
    onOpen,
    updateTemplates: (templates: Template[]) => view.rerender(tree(templates)),
  };
}
async function openOriginal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: 'Versions and preview' }),
  );
  await user.click(
    await screen.findByRole('button', {
      name: 'Version 1 · Original welcome',
    }),
  );
  expect(
    screen.getByRole('heading', { name: 'Original support welcome' }),
  ).toBeVisible();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTemplateVersions).mockResolvedValue([latest, original]);
  vi.mocked(duplicateTemplate).mockResolvedValue({ data: copy });
  vi.mocked(restoreTemplateVersion).mockResolvedValue({ data: restored });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('immutable template version history', () => {
  it('previews named saved versions and opens only the version explicitly chosen as a draft', async () => {
    const user = userEvent.setup();
    const { onOpen } = renderLibrary(false);
    expect(screen.getByText('Support panel')).toBeVisible();
    expect(screen.getByText('Saved revision 2')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Versions and preview' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Current support welcome' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Version 2 · Current welcome' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(/Opening a historical version makes a new local draft/),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Version 1 · Original welcome' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Original support welcome' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Current support welcome' }),
    ).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Open version as draft' }),
    );
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(saved, original);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(duplicateTemplate).not.toHaveBeenCalled();
    expect(restoreTemplateVersion).not.toHaveBeenCalled();
  });

  it('requires explicit restore confirmation and keeps the editor draft after saving the selected immutable version', async () => {
    const user = userEvent.setup();
    const { onOpen } = renderLibrary();
    await openOriginal(user);
    expect(
      screen.getByText(/Your unsaved editor draft will be kept/),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Restore this version' }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'Restore version 1 as a new saved version',
      }),
    ).toBeVisible();
    expect(screen.getByText(/This creates saved revision 3/)).toBeVisible();
    expect(restoreTemplateVersion).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Restored version name'));
    await user.type(
      screen.getByLabelText('Restored version name'),
      '  Restored welcome  ',
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm version restore' }),
    );
    expect(
      await screen.findByText(
        'Version restored as saved revision 3. Your editor draft has been kept.',
      ),
    ).toBeVisible();
    expect(restoreTemplateVersion).toHaveBeenCalledExactlyOnceWith(
      guildId,
      saved,
      { versionId: original.id, label: 'Restored welcome' },
      expect.any(String),
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Restored version name')).toHaveValue(
      '  Restored welcome  ',
    );
    expect(
      screen.getByRole('heading', { name: 'Original support welcome' }),
    ).toBeVisible();
  });

  it('copies the previewed version under the requested name without loading it into the editor', async () => {
    const user = userEvent.setup();
    const { onOpen } = renderLibrary();
    await openOriginal(user);
    await user.click(
      screen.getByRole('button', { name: 'Duplicate this version' }),
    );
    expect(screen.getByLabelText('New template name')).toHaveValue(
      'Support panel copy',
    );
    await user.clear(screen.getByLabelText('New template name'));
    await user.type(
      screen.getByLabelText('New template name'),
      '  Application welcome  ',
    );
    expect(duplicateTemplate).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Create template copy' }),
    );
    expect(
      await screen.findByText(
        'Template copy created. Your editor draft has been kept.',
      ),
    ).toBeVisible();
    expect(duplicateTemplate).toHaveBeenCalledExactlyOnceWith(
      guildId,
      saved,
      { name: 'Application welcome', sourceVersionId: original.id },
      expect.any(String),
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New template name')).toHaveValue(
      '  Application welcome  ',
    );
    expect(
      screen.getByText(/Your unsaved editor draft will be kept/),
    ).toBeVisible();
  });

  it.each([
    {
      mode: 'restore',
      action: 'Restore this version',
      confirm: 'Confirm version restore',
      field: 'Restored version name',
    },
    {
      mode: 'duplicate',
      action: 'Duplicate this version',
      confirm: 'Create template copy',
      field: 'New template name',
    },
  ])(
    'retains the preview and $mode inputs through a revision conflict and history refresh',
    async ({ mode, action, confirm, field }) => {
      const user = userEvent.setup();
      const conflict = new ApiError(
        'A newer revision exists.',
        'REVISION_CONFLICT',
        409,
        'request-conflict',
        3,
      );
      if (mode === 'restore')
        vi.mocked(restoreTemplateVersion).mockRejectedValueOnce(conflict);
      else vi.mocked(duplicateTemplate).mockRejectedValueOnce(conflict);
      const { onOpen, updateTemplates } = renderLibrary();
      await openOriginal(user);
      await user.click(screen.getByRole('button', { name: action }));
      await user.clear(screen.getByLabelText(field));
      await user.type(screen.getByLabelText(field), 'My chosen version name');
      await user.click(screen.getByRole('button', { name: confirm }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Your preview and editor draft are kept. Refresh history',
      );
      expect(screen.getByLabelText(field)).toHaveValue(
        'My chosen version name',
      );
      expect(
        screen.getByRole('heading', { name: 'Original support welcome' }),
      ).toBeVisible();
      expect(onOpen).not.toHaveBeenCalled();
      const currentVersion: TemplateVersion = {
        ...restored,
        document: latest.document,
      };
      vi.mocked(getTemplateVersions).mockResolvedValue([
        currentVersion,
        latest,
        original,
      ]);
      const refreshed: Template = {
        ...saved,
        revision: 3,
        versions: [currentVersion],
        latestVersionId: currentVersion.id,
        document: currentVersion.document,
      };
      updateTemplates([refreshed]);
      await user.click(
        within(alert).getByRole('button', { name: 'Try again' }),
      );
      await waitFor(() => expect(getTemplateVersions).toHaveBeenCalledTimes(2));
      expect(
        await screen.findByRole('button', {
          name: 'Version 3 · Restored welcome',
        }),
      ).toBeVisible();
      expect(screen.getByLabelText(field)).toHaveValue(
        'My chosen version name',
      );
      expect(
        screen.getByRole('heading', { name: 'Original support welcome' }),
      ).toBeVisible();
      expect(onOpen).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: confirm }));
      await waitFor(() => {
        const call =
          mode === 'restore'
            ? vi.mocked(restoreTemplateVersion).mock.lastCall
            : vi.mocked(duplicateTemplate).mock.lastCall;
        expect(call?.[1]).toEqual(refreshed);
        expect(call?.[2]).toEqual(
          mode === 'restore'
            ? { versionId: original.id, label: 'My chosen version name' }
            : { sourceVersionId: original.id, name: 'My chosen version name' },
        );
      });
      expect(onOpen).not.toHaveBeenCalled();
    },
  );
});
