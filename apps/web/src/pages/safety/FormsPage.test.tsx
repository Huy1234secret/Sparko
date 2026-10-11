// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormsPage } from './FormsPage';
import { getConfig, getRoles } from '../../services/guilds';
import {
  getApplications,
  getForms,
  publishForm,
  reviewApplication,
  saveForm,
  type ApplicationRecord,
  type FormRecord,
} from '../../services/safety';
import { ApiError } from '../../services/http';

vi.mock('../../services/guilds', () => ({
  getChannels: vi.fn(),
  getConfig: vi.fn(),
  getRoles: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../../services/safety', () => ({
  getApplications: vi.fn(),
  getForms: vi.fn(),
  publishForm: vi.fn(),
  reviewApplication: vi.fn(),
  saveForm: vi.fn(),
}));
const guildId = '123456789012345678';
const body = {
  name: 'Staff application',
  description: '',
  requiredRoleIds: [],
  blockedRoleIds: [],
  maxSubmissions: 1,
  fields: [
    {
      id: 'why',
      label: 'Why do you want to join?',
      required: true,
      maxLength: 1000,
      choices: [],
    },
  ],
  stages: ['Screening', 'Interview'],
};
const draft: FormRecord = {
  id: 'form-1',
  key: 'form-1',
  ownerId: null,
  state: 'draft',
  revision: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
  data: { ...body, versions: [], publishedVersion: null },
};
function application(stage: number): ApplicationRecord {
  return {
    id: 'app-1',
    key: 'app-1',
    ownerId: '223456789012345678',
    state: 'reviewing',
    revision: 5,
    createdAt: '2026-10-02T00:00:00.000Z',
    data: {
      formId: 'form-1',
      version: 1,
      snapshot: body,
      answers: { why: 'I like helping.' },
      stage,
      history: [
        {
          event: 'submitted',
          actorId: '223456789012345678',
          at: '2026-10-02T00:00:00.000Z',
        },
      ],
    },
  };
}
function renderPage(tab: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: '/dashboard/:guildId/support/forms', element: <FormsPage /> }],
    { initialEntries: [`/dashboard/${guildId}/support/forms?tab=${tab}`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getRoles).mockResolvedValue([]);
  vi.mocked(getConfig).mockResolvedValue({
    featureId: 'R25',
    revision: 1,
    appliedRevision: 1,
    config: { enabled: true },
    missingPrerequisites: [],
  });
  vi.mocked(getForms).mockResolvedValue([draft]);
  vi.mocked(getApplications).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('form builder', () => {
  it('validates question identifiers before saving a new form', async () => {
    const user = userEvent.setup();
    vi.mocked(getForms).mockResolvedValue([]);
    vi.mocked(saveForm).mockResolvedValue({
      data: { ...draft, id: 'form-new', revision: 1 },
    } as never);
    renderPage('forms');
    await user.click(await screen.findByRole('button', { name: 'New form' }));
    const id = screen.getByLabelText('Answer identifier');
    await user.clear(id);
    await user.type(id, 'Not Valid');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/Invalid/)).toBeVisible();
    expect(saveForm).not.toHaveBeenCalled();
    await user.clear(id);
    await user.type(id, 'motivation');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveForm).toHaveBeenCalledTimes(1));
    const [, formId, request] = vi.mocked(saveForm).mock.calls[0]!;
    expect(formId).toBeNull();
    expect(request.form).toMatchObject({
      name: 'Staff application',
      fields: [{ id: 'motivation' }],
    });
  });

  it('saves edits against the revision and publishes only a saved draft', async () => {
    const user = userEvent.setup();
    vi.mocked(saveForm).mockResolvedValue({ data: draft } as never);
    vi.mocked(publishForm).mockResolvedValue({ data: draft } as never);
    renderPage('forms');
    await user.click(
      await screen.findByRole('button', { name: /Staff application/ }),
    );
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(publish).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveForm).toHaveBeenCalledTimes(1));
    const [, formId, request] = vi.mocked(saveForm).mock.calls[0]!;
    expect(formId).toBe('form-1');
    expect(request).toMatchObject({ expectedRevision: 2 });
    expect((request.form as { fields: unknown[] }).fields).toHaveLength(2);
  });

  it('keeps edits and offers the newer version after a conflict', async () => {
    const user = userEvent.setup();
    vi.mocked(saveForm).mockRejectedValue(
      new ApiError('Changed.', 'REVISION_CONFLICT', 409, 'request-1', 3),
    );
    renderPage('forms');
    await user.click(
      await screen.findByRole('button', { name: /Staff application/ }),
    );
    const name = screen.getByLabelText('Form name');
    await user.type(name, ' 2026');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText(
        'Someone else changed this form while you were editing',
      ),
    ).toBeVisible();
    expect(name).toHaveValue('Staff application 2026');
    expect(
      screen.getByRole('button', { name: 'Load the newer version' }),
    ).toBeVisible();
  });
});

describe('application review', () => {
  it('requires a reason and advances through each stage', async () => {
    const user = userEvent.setup();
    vi.mocked(getApplications).mockResolvedValue([application(0)]);
    vi.mocked(reviewApplication).mockResolvedValue({ data: {} } as never);
    renderPage('applications');
    await user.click(
      await screen.findByRole('button', { name: /Staff application/ }),
    );
    expect(screen.getByText('I like helping.')).toBeVisible();
    expect(screen.getByText('Submitted')).toBeVisible();
    const advance = screen.getByRole('button', { name: 'Move to Interview' });
    expect(advance).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    await user.type(screen.getByLabelText(/Reason/), 'Strong answers');
    await user.click(advance);
    await waitFor(() => expect(reviewApplication).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reviewApplication).mock.calls[0]?.[2]).toEqual({
      expectedRevision: 5,
      decision: 'advance',
      reason: 'Strong answers',
    });
  });

  it('accepts at the final stage and explains a competing decision', async () => {
    const user = userEvent.setup();
    vi.mocked(getApplications).mockResolvedValue([application(1)]);
    vi.mocked(reviewApplication).mockRejectedValue(
      new ApiError('Changed.', 'REVISION_CONFLICT', 409, 'request-2', 6),
    );
    renderPage('applications');
    await user.click(
      await screen.findByRole('button', { name: /Staff application/ }),
    );
    await user.type(screen.getByLabelText(/Reason/), 'Welcome aboard');
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(
      await screen.findByText(/Another reviewer acted first/),
    ).toBeVisible();
    expect(screen.getByLabelText(/Reason/)).toHaveValue('Welcome aboard');
  });
});
