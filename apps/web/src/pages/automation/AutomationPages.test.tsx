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
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PollsPage } from './PollsPage';
import { EventsPage } from './EventsPage';
import { WorkflowsPage } from './WorkflowsPage';
import { RepliesPage } from './RepliesPage';
import { CommandsPage } from './CommandsPage';
import { InvitesPage } from './InvitesPage';
import { EventsCard, PollsCard, RemindersCard } from './MemberAutomation';
import { getChannels, getConfig, getRoles } from '../../services/guilds';
import { getSession } from '../../services/session';
import {
  cancelEvent,
  createPoll,
  createReminder,
  getEvents,
  getInviteRewards,
  getInvites,
  getPolls,
  getReminders,
  listAutomation,
  rsvpEvent,
  saveAutomation,
  votePoll,
  type EventRecord,
  type PollRecord,
} from '../../services/automation';

vi.mock('../../services/guilds', () => ({
  getChannels: vi.fn(),
  getConfig: vi.fn(),
  getRoles: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../../services/session', async (original) => ({
  ...(await original<typeof import('../../services/session')>()),
  getSession: vi.fn(),
}));
vi.mock('../../services/messages', () => ({
  getTemplates: vi.fn(async () => []),
}));
vi.mock('../../services/automation', async (original) => {
  const actual = await original<typeof import('../../services/automation')>();
  const mocked = Object.fromEntries(
    Object.entries(actual)
      .filter(([, value]) => typeof value === 'function')
      .filter(([name]) => !name.endsWith('Schema'))
      .map(([name]) => [name, vi.fn()]),
  );
  return { ...actual, ...mocked };
});

const guildId = '123456789012345678';
const channel = '423456789012345678';
const vip = '523456789012345679';
const welcome = '623456789012345670';
function renderAt(path: string, element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: '/dashboard/:guildId/:group/:module', element }],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
const record = {
  key: 'k',
  ownerId: null,
  revision: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
};
const poll = (data: Partial<PollRecord['data']> = {}): PollRecord => ({
  ...record,
  id: 'poll-1',
  state: 'open',
  data: {
    question: 'Movie night genre?',
    choices: ['Horror', 'Comedy', 'Drama'],
    maxSelections: 1,
    allowChange: true,
    resultsVisibility: 'public',
    requiredRoleIds: [],
    endsAt: '2099-01-01T00:00:00.000Z',
    ...data,
  },
  myVote: [],
  results: [
    { choice: 'Horror', votes: 3 },
    { choice: 'Comedy', votes: 1 },
    { choice: 'Drama', votes: 0 },
  ],
  voterCount: 4,
});
const event: EventRecord = {
  ...record,
  id: 'event-1',
  state: 'scheduled',
  data: {
    title: 'Game night',
    description: 'Bring snacks.',
    startsAt: '2099-01-01T18:00:00.000Z',
    endsAt: '2099-01-01T20:00:00.000Z',
    timezone: 'UTC',
    capacity: 2,
    requiredRoleIds: [],
    remindBeforeMinutes: 30,
  },
  attending: 2,
  waiting: 1,
  myRsvp: null,
};
beforeEach(() => {
  vi.mocked(getChannels).mockResolvedValue([
    { id: channel, name: 'general', type: 0 },
    { id: welcome, name: 'welcome', type: 0 },
  ]);
  vi.mocked(getRoles).mockResolvedValue([
    { id: vip, name: 'VIP', assignable: true },
  ]);
  vi.mocked(getConfig).mockResolvedValue({
    featureId: 'R45',
    revision: 1,
    appliedRevision: 1,
    config: { enabled: true },
    missingPrerequisites: [],
  });
  vi.mocked(getSession).mockResolvedValue({
    user: { id: '323456789012345678', username: 'me' },
    capabilities: [],
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('polls', () => {
  it('builds a poll from typed choices and refuses duplicates', async () => {
    const user = userEvent.setup();
    vi.mocked(getPolls).mockResolvedValue([]);
    vi.mocked(createPoll).mockResolvedValue({ data: {} } as never);
    renderAt(`/dashboard/${guildId}/community/polls?tab=new`, <PollsPage />);
    await user.type(await screen.findByLabelText(/^Question/), 'Pizza?');
    await user.type(screen.getByLabelText('Choice 1'), 'Yes');
    await user.type(screen.getByLabelText('Choice 2'), 'yes');
    await user.type(screen.getByLabelText(/Voting closes/), '2099-05-01T10:00');
    await user.click(screen.getByRole('button', { name: 'Start poll' }));
    expect(
      await screen.findByText('Each choice must be different.'),
    ).toBeVisible();
    expect(createPoll).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Choice 2'));
    await user.type(screen.getByLabelText('Choice 2'), 'No');
    await user.click(screen.getByRole('button', { name: 'Add choice' }));
    await user.type(screen.getByLabelText('Choice 3'), 'Maybe');
    await user.click(screen.getByRole('button', { name: 'Start poll' }));
    await waitFor(() => expect(createPoll).toHaveBeenCalledTimes(1));
    const body = vi.mocked(createPoll).mock.calls[0]![1];
    expect(body).toMatchObject({
      question: 'Pizza?',
      choices: ['Yes', 'No', 'Maybe'],
      maxSelections: 1,
      endsAt: new Date('2099-05-01T10:00').toISOString(),
    });
    expect(body).not.toHaveProperty('channelId');
  });
  it('shows results and lets managers close voting', async () => {
    vi.mocked(getPolls).mockResolvedValue([poll()]);
    renderAt(`/dashboard/${guildId}/community/polls`, <PollsPage />);
    const results = await screen.findByRole('list', { name: 'Results' });
    expect(within(results).getByText('3 votes')).toBeVisible();
    expect(screen.getByText(/4 voters/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Close voting now' }),
    ).toBeEnabled();
  });
});

describe('member polls, events and reminders', () => {
  it('casts a single vote and locks a final one', async () => {
    const user = userEvent.setup();
    vi.mocked(getPolls).mockResolvedValue([
      poll(),
      {
        ...poll({ question: 'Final?', allowChange: false }),
        id: 'poll-2',
        myVote: [0],
      },
    ]);
    vi.mocked(votePoll).mockResolvedValue({ data: {} } as never);
    renderAt(
      `/dashboard/${guildId}/member/me`,
      <PollsCard guildId={guildId} />,
    );
    const vote = (await screen.findAllByRole('button', { name: 'Vote' }))[0]!;
    expect(vote).toBeDisabled();
    await user.click(screen.getAllByLabelText('Comedy')[0]!);
    await user.click(vote);
    await waitFor(() =>
      expect(votePoll).toHaveBeenCalledWith(
        guildId,
        'poll-1',
        [1],
        expect.any(String),
      ),
    );
    expect(screen.getByText(/Your vote is final/)).toBeVisible();
  });
  it('offers the waitlist when an event is full', async () => {
    const user = userEvent.setup();
    vi.mocked(getEvents).mockResolvedValue([event]);
    vi.mocked(rsvpEvent).mockResolvedValue({ data: {} } as never);
    renderAt(
      `/dashboard/${guildId}/member/me`,
      <EventsCard guildId={guildId} />,
    );
    expect(await screen.findByText(/0 of 2 places left/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    await waitFor(() =>
      expect(rsvpEvent).toHaveBeenCalledWith(
        guildId,
        'event-1',
        'attending',
        expect.any(String),
      ),
    );
  });
  it('sets a personal weekly reminder without a channel option', async () => {
    const user = userEvent.setup();
    vi.mocked(getReminders).mockResolvedValue([]);
    vi.mocked(createReminder).mockResolvedValue({ data: {} } as never);
    renderAt(
      `/dashboard/${guildId}/member/me`,
      <RemindersCard guildId={guildId} />,
    );
    await user.click(
      await screen.findByRole('button', { name: 'New reminder' }),
    );
    expect(screen.queryByText('A server channel')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Remind about/), 'Water the plants');
    await user.selectOptions(screen.getByLabelText('Time zone'), 'UTC');
    await user.type(screen.getByLabelText(/^When/), '2099-06-01T08:15');
    await user.selectOptions(screen.getByLabelText('Repeat'), 'weekly');
    await user.click(screen.getByRole('button', { name: 'Set reminder' }));
    await waitFor(() => expect(createReminder).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createReminder).mock.calls[0]![1]).toEqual({
      text: 'Water the plants',
      destination: { type: 'dm' },
      timezone: 'UTC',
      dueAt: '2099-06-01T08:15:00.000Z',
      // 1 June 2099 is a Monday.
      recurrence: { type: 'weekly', weekday: 1, hour: 8, minute: 15 },
      misfire: 'send_once',
    });
  });
});

describe('events', () => {
  it('cancels only with a reason that attendees receive', async () => {
    const user = userEvent.setup();
    vi.mocked(getEvents).mockResolvedValue([event]);
    vi.mocked(cancelEvent).mockResolvedValue({ data: {} } as never);
    renderAt(`/dashboard/${guildId}/community/events`, <EventsPage />);
    expect(await screen.findByText('2 / 2')).toBeVisible();
    const cancel = screen.getByRole('button', { name: 'Cancel event' });
    expect(cancel).toBeDisabled();
    await user.type(
      screen.getByLabelText('Reason for cancelling'),
      'Host is ill',
    );
    await user.click(cancel);
    await waitFor(() =>
      expect(vi.mocked(cancelEvent).mock.calls[0]![2]).toEqual({
        expectedRevision: 3,
        reason: 'Host is ill',
      }),
    );
  });
});

describe('workflow builder', () => {
  it('builds typed steps, previews the path and saves without raw JSON', async () => {
    const user = userEvent.setup();
    vi.mocked(listAutomation).mockResolvedValue([]);
    vi.mocked(saveAutomation).mockResolvedValue({ data: {} } as never);
    renderAt(
      `/dashboard/${guildId}/automations/workflows?tab=new`,
      <WorkflowsPage />,
    );
    await user.type(await screen.findByLabelText(/^Name/), 'Welcome VIPs');
    // Steps are typed controls; there is no JSON box for them.
    expect(document.querySelector('[name="steps"]')).toBeNull();
    // Step 1: check a role. Step 2: give it. Step 3: send.
    await user.selectOptions(screen.getByLabelText('Step 1'), 'branch');
    await user.click(screen.getByRole('button', { name: /Add step/ }));
    await user.selectOptions(screen.getByLabelText('Step 2'), 'role');
    await user.click(screen.getByRole('button', { name: /Add step/ }));
    await user.selectOptions(
      await screen.findByLabelText('If the member has the role'),
      vip,
    );
    await user.selectOptions(screen.getByLabelText('Otherwise go to'), '2');
    const roles = screen.getAllByLabelText('Role');
    await user.selectOptions(roles[0]!, vip);
    await user.selectOptions(screen.getByLabelText('Channel'), welcome);
    await user.type(screen.getAllByLabelText(/^Message/)[0]!, 'Welcome!');
    const run = screen.getByRole('list', { name: 'Dry run' });
    expect(
      within(run).getByText(/VIP: does not have it → step 3/),
    ).toBeVisible();
    await user.click(screen.getAllByRole('checkbox', { name: 'VIP' }).at(-1)!);
    expect(within(run).getByText(/Give the VIP role/)).toBeVisible();
    // Moving the send step up keeps the role check pointing at it.
    await user.click(screen.getByRole('button', { name: 'Move step 3 up' }));
    await user.click(screen.getByRole('button', { name: 'Create workflow' }));
    await waitFor(() => expect(saveAutomation).toHaveBeenCalledTimes(1));
    const [, path, id, config] = vi.mocked(saveAutomation).mock.calls[0]!;
    expect([path, id]).toEqual(['workflows', null]);
    expect(config).toMatchObject({
      name: 'Welcome VIPs',
      trigger: 'manual',
      steps: [
        { type: 'branch', requiredRoleId: vip, onMatch: 2, onMiss: 1 },
        { type: 'send', channelId: welcome, text: 'Welcome!' },
        { type: 'role', roleId: vip, action: 'add' },
      ],
    });
  });
});

describe('auto replies and custom commands', () => {
  it('tests a message with the bot’s own matching', async () => {
    const user = userEvent.setup();
    vi.mocked(listAutomation).mockResolvedValue([]);
    renderAt(
      `/dashboard/${guildId}/automations/replies?tab=new`,
      <RepliesPage />,
    );
    await user.type(await screen.findByLabelText(/^Words/), 'rules');
    await user.type(screen.getByLabelText('Message'), 'Where are the RULES?');
    expect(screen.getByText('Sparko would reply')).toBeVisible();
    await user.clear(screen.getByLabelText('Message'));
    await user.type(screen.getByLabelText('Message'), 'hello');
    expect(screen.getByText('No reply')).toBeVisible();
  });
  it('prefixes command names and offers only active workflows', async () => {
    const user = userEvent.setup();
    vi.mocked(listAutomation).mockImplementation(async (_g, path) =>
      path === 'workflows'
        ? ([
            {
              ...record,
              id: '7b3c3f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
              state: 'active',
              data: { name: 'Roll call', trigger: 'custom', steps: [] },
            },
            {
              ...record,
              id: '8b3c3f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
              state: 'disabled',
              data: { name: 'Old one', trigger: 'custom', steps: [] },
            },
          ] as never)
        : [],
    );
    vi.mocked(saveAutomation).mockResolvedValue({ data: {} } as never);
    renderAt(
      `/dashboard/${guildId}/automations/commands?tab=new`,
      <CommandsPage />,
    );
    const workflow = await screen.findByLabelText('Runs the workflow');
    await waitFor(() =>
      expect(within(workflow).getAllByRole('option')).toHaveLength(2),
    );
    expect(within(workflow).queryByText('Old one')).toBeNull();
    await user.type(screen.getByLabelText(/Command name/), 'Roll Call');
    await user.type(screen.getByLabelText(/Description/), 'Answer roll call');
    await user.selectOptions(workflow, 'Roll call');
    await user.click(screen.getByRole('button', { name: 'Create command' }));
    expect(
      await screen.findByText(/lowercase letters, numbers or hyphens/),
    ).toBeVisible();
    await user.clear(screen.getByLabelText(/Command name/));
    await user.type(screen.getByLabelText(/Command name/), 'roll-call');
    await user.click(screen.getByRole('button', { name: 'Create command' }));
    await waitFor(() => expect(saveAutomation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveAutomation).mock.calls[0]![3]).toMatchObject({
      name: 'spark-roll-call',
      workflowId: '7b3c3f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    });
  });
});

describe('invite tracking', () => {
  it('keeps uncertain joins apart from confirmed ones', async () => {
    vi.mocked(getInviteRewards).mockResolvedValue([]);
    vi.mocked(getInvites).mockResolvedValue([
      {
        ...record,
        id: 'a',
        state: 'confirmed',
        data: {
          memberId: '1',
          inviterId: '2',
          reason: 'One stable invite increased by exactly one',
        },
      },
      {
        ...record,
        id: 'b',
        state: 'ambiguous',
        data: {
          memberId: '3',
          inviterId: '4',
          reason: 'Simultaneous joins or vanity invite changes',
        },
      },
    ]);
    renderAt(`/dashboard/${guildId}/community/invites`, <InvitesPage />);
    expect(await screen.findByText('Member 1 · invited by 2')).toBeVisible();
    // An ambiguous join never names an inviter.
    expect(screen.getByText('Member 3')).toBeVisible();
    expect(screen.getByText('Ambiguous', { selector: '.badge' })).toBeVisible();
  });
});
