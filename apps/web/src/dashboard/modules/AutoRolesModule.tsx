import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Input,
  Modal,
  Segmented,
  animIcons,
  cx,
  preloadCombobox,
  useToast,
} from '../../ui';
import type { SparkoModule } from '../../content/modules';
import {
  arIssue,
  formatDuration,
  parseDuration,
  useARMemberActions,
  useARMembers,
  useAutoRoles,
  useSaveAutoRoles,
  type ARLogEntry,
  type ARMemberView,
  type AutoRoles,
  type RoleOption,
  type Server,
} from '../../data';
import {
  ModuleHeader,
  ModuleSaveBar,
  ModuleTabs,
  PausedNotice,
  SavePipeline,
  syncState,
  useModuleTab,
  useSaveFlow,
  ModuleSkeleton,
  SkelCards,
} from './frame';
import { flashIssue, type ShownIssue } from './EditorBits';
import { ARTriggers } from './ARTriggers';

const MODULE = 'autoroles';

const tabIcons = [
  { icon: 'zap', anim: animIcons.settingOutline },
  { icon: 'scroll-text', anim: animIcons.log },
  { icon: 'database', anim: undefined },
];

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function AutoRolesModule({
  module,
  server,
}: {
  module: SparkoModule;
  server: Server;
}) {
  const ar = useAutoRoles(server.id);
  const save = useSaveAutoRoles(server.id);
  const flow = useSaveFlow(server.id, MODULE);
  const toast = useToast();
  const [tab, setTab] = useModuleTab();
  const [draft, setDraft] = useState<AutoRoles | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [issue, setIssue] = useState<ShownIssue | null>(null);

  useEffect(() => {
    preloadCombobox();
  }, []);
  useEffect(() => {
    if (!issue) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => flashIssue(issue.at));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [issue]);

  const saved = ar.data?.config;
  const current = draft ?? saved;
  const savedOn = ar.data?.on ?? false;
  const isOn = on ?? savedOn;
  const dirty =
    (on !== null && on !== savedOn) ||
    (!!draft && JSON.stringify(draft) !== JSON.stringify(saved));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (ar.isPending)
    return (
      <ModuleSkeleton module={module}>
        <SkelCards />
      </ModuleSkeleton>
    );
  if (ar.isError || !ar.data || !current)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load Automatic roles"
          actions={<Button onClick={() => void ar.refetch()}>Try again</Button>}
        />
      </div>
    );

  const data = ar.data;
  const paused = !!server.paused;

  const doSave = async () => {
    const found = arIssue(current, {
      plan: server.plan,
      roles: new Map(data.roles.map((r) => [r.id, r.assignable !== false])),
    });
    if (found) {
      setTab('settings');
      setIssue((i) => ({ at: found.at, n: (i?.n ?? 0) + 1 }));
      toast({ tone: 'danger', title: 'Can’t save yet', body: found.problem });
      return;
    }
    const ok = await flow.run(() =>
      save.mutateAsync({ on: isOn, config: current }),
    );
    if (ok) {
      setDraft(null);
      setOn(null);
    }
  };

  return (
    <>
      <ModuleHeader
        module={module}
        sync={syncState({ paused, dirty, phase: flow.phase, on: savedOn })}
        power={{
          on: isOn,
          onChange: (next) => {
            setOn(next);
            flow.clear();
          },
          disabled: paused || flow.busy,
          hint: paused
            ? 'Locked by Sparko staff'
            : isOn
              ? 'Roles are given automatically'
              : 'No roles are given',
        }}
      />
      <PausedNotice server={server} />
      <SavePipeline
        phase={flow.phase}
        liveLabel="Automatic roles are live"
        error={flow.error}
      />
      {!isOn && (
        <p className="sp-edit-banner sp-greet-off-note" role="status">
          <Icon name="info" size="sm" />
          <span>Automatic roles are off. Turn them on above to edit them.</span>
        </p>
      )}
      <div className={cx('sp-greet-body', !isOn && 'is-off')} inert={!isOn}>
        <ModuleTabs
          module={module}
          tab={tab}
          onChange={setTab}
          labels={['Triggers', 'Logs', 'Storage']}
          icons={tabIcons}
          counts={[undefined, data.log.length, undefined]}
        />
        {tab === 'settings' && (
          <fieldset className="sp-fieldset" disabled={paused}>
            <legend className="sp-sr-only">Triggers</legend>
            <ARTriggers
              config={current}
              roles={data.roles}
              limits={data.limits}
              onChange={(patch) => {
                setDraft({ ...current, ...patch });
                flow.clear();
              }}
            />
          </fieldset>
        )}
        {tab === 'items' && <ARLog entries={data.log} roles={data.roles} />}
        {tab === 'history' && (
          <ARStorage server={server} roles={data.roles} paused={paused} />
        )}
      </div>
      <ModuleSaveBar
        visible={dirty && !paused}
        saving={flow.phase === 'saving'}
        error={flow.saveError}
        onReset={() => {
          setDraft(null);
          setOn(null);
        }}
        onSave={() => void doSave()}
      />
    </>
  );
}

// Logs ------------------------------------------------------------------------

const roleName = (roles: RoleOption[], id: string) =>
  `@${roles.find((r) => r.id === id)?.name ?? id}`;

/** One log line, with names where Sparko knows them. */
export function arLogLine(e: ARLogEntry, roles: RoleOption[]) {
  const who = `@${e.userName}`;
  const role = roleName(roles, e.roleId);
  switch (e.action) {
    case 'met':
      return `[MET] ${who} met the ${e.trigger} requirement and received ${role}.`;
    case 'lost':
      return `[LOST] ${who} lost ${role}: they no longer meet the ${e.trigger} requirement.`;
    case 'added':
      return `[ADDED] ${who} received ${role} on joining the server.`;
    case 'saved':
      return `[DATA SAVED] ${who}’s role data was saved.`;
    case 'removed':
      return `[DATA REMOVED] ${who}’s role data was wiped.`;
    default:
      return `[FAILED] Couldn’t give ${who} ${role}: ${e.reason}`;
  }
}

const logIcon: Record<ARLogEntry['action'], string> = {
  met: 'circle-check',
  added: 'circle-check',
  lost: 'minus',
  saved: 'save',
  removed: 'trash-2',
  failed: 'circle-x',
};

function ARLog({
  entries,
  roles,
}: {
  entries: ARLogEntry[];
  roles: RoleOption[];
}) {
  const [filter, setFilter] = useState<
    'all' | 'roles' | 'lost' | 'data' | 'failed'
  >('all');
  const shown = entries.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'roles'
        ? e.action === 'met' || e.action === 'added'
        : filter === 'data'
          ? e.action === 'saved' || e.action === 'removed'
          : e.action === filter,
  );
  return (
    <section className="sp-card" aria-labelledby="ar-log">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="ar-log">
            Logs
          </h2>
          <p className="sp-card__sub">
            Every role automatic roles gave or took, and every change to a
            member’s saved data.
          </p>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'roles', label: 'Given' },
            { value: 'lost', label: 'Lost' },
            { value: 'data', label: 'Data' },
            { value: 'failed', label: 'Problems' },
          ]}
        />
      </div>
      {shown.length ? (
        <ol className="sp-greet-log">
          {shown.map((e) => (
            <li
              key={e.id}
              className={cx(
                'sp-greet-log__row',
                e.action === 'failed' && 'is-failed',
              )}
            >
              <Icon
                name={logIcon[e.action]}
                size="sm"
                className="sp-greet-log__icon"
              />
              <span className="sp-greet-log__text">{arLogLine(e, roles)}</span>
              <span className="sp-greet-log__meta">
                {e.userId} · {when(e.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon="scroll-text" title="Nothing yet">
          When Sparko gives or takes a role, it shows here.
        </EmptyState>
      )}
    </section>
  );
}

// Storage ---------------------------------------------------------------------

function ARStorage({
  server,
  roles,
  paused,
}: {
  server: Server;
  roles: RoleOption[];
  paused: boolean;
}) {
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const members = useARMembers(server.id, query);
  const actions = useARMemberActions(server.id);
  const toast = useToast();
  const [editing, setEditing] = useState<ARMemberView | null>(null);
  const [wiping, setWiping] = useState<ARMemberView | null>(null);

  // Searches a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const list = members.data ?? [];
  return (
    <section className="sp-card" aria-labelledby="ar-storage">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="ar-storage">
            Storage
          </h2>
          <p className="sp-card__sub">
            What Sparko remembers about each member: their time in the server
            and the boosts it counted.
          </p>
        </div>
      </div>
      <div className="sp-card__body sp-stack">
        <Input
          aria-label="Search members"
          icon="search"
          placeholder="Search by username or user ID"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        {!query.trim() ? (
          <EmptyState icon="search" title="Search for a member">
            Type a username or a user ID to see their saved data.
          </EmptyState>
        ) : members.isPending ? (
          <div className="sp-skel sp-skel--block" style={{ height: 120 }} />
        ) : list.length ? (
          <ul className="sp-ar-members">
            {list.map((m) => (
              <li key={m.userId} className="sp-card sp-ar-member">
                <button
                  type="button"
                  className="sp-ar-member__open"
                  aria-label={`Open ${m.name}’s data`}
                  onClick={() => setEditing(m)}
                >
                  <span className="sp-ar-member__name">
                    {m.name}
                    {!m.inServer && <Badge size="sm">Left</Badge>}
                  </span>
                  <span className="sp-hint">{m.userId}</span>
                  <span className="sp-hint">
                    {formatDuration(m.servedMs)} in the server · {m.boosts}{' '}
                    {m.boosts === 1 ? 'boost' : 'boosts'} ·{' '}
                    {m.given.length
                      ? m.given.map((id) => roleName(roles, id)).join(', ')
                      : 'no roles from Sparko'}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash-2"
                  disabled={paused}
                  aria-label={`Wipe ${m.name}’s data`}
                  onClick={() => setWiping(m)}
                >
                  Wipe data
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="user-x" title="No one found">
            Sparko has no saved data for “{query.trim()}”.
          </EmptyState>
        )}
      </div>

      {editing && (
        <MemberEditor
          member={editing}
          roles={roles}
          saving={actions.edit.isPending}
          disabled={paused}
          onClose={() => setEditing(null)}
          onSave={(edit) =>
            actions.edit.mutate(
              { userId: editing.userId, ...edit },
              {
                onSuccess: () => {
                  setEditing(null);
                  void members.refetch();
                  toast({ title: `Saved ${editing.name}’s data` });
                },
                onError: (e) =>
                  toast({
                    tone: 'danger',
                    title: 'Couldn’t save it',
                    body: e.message,
                  }),
              },
            )
          }
        />
      )}
      <Modal
        open={!!wiping}
        onClose={() => setWiping(null)}
        icon="trash-2"
        title={`Wipe ${wiping?.name ?? ''}’s data?`}
        description="Their time in the server and counted boosts start again from zero. Roles that depended on them are taken back at the next check."
        footer={
          <>
            <Button variant="ghost" onClick={() => setWiping(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actions.wipe.isPending}
              onClick={() =>
                wiping &&
                actions.wipe.mutate(wiping.userId, {
                  onSuccess: () => {
                    toast({ title: `Wiped ${wiping.name}’s data` });
                    setWiping(null);
                    void members.refetch();
                  },
                  onError: (e) =>
                    toast({
                      tone: 'danger',
                      title: 'Couldn’t wipe it',
                      body: e.message,
                    }),
                })
              }
            >
              Wipe data
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </section>
  );
}

function MemberEditor({
  member,
  roles,
  saving,
  disabled,
  onClose,
  onSave,
}: {
  member: ARMemberView;
  roles: RoleOption[];
  saving: boolean;
  disabled: boolean;
  onClose: () => void;
  onSave: (edit: { servedMs: number; boosts: number }) => void;
}) {
  const [served, setServed] = useState(formatDuration(member.servedMs));
  const [boosts, setBoosts] = useState(String(member.boosts));
  const servedMs = served.trim() === '0m' ? 0 : parseDuration(served);
  const boostCount = Number(boosts);
  const valid =
    servedMs !== null &&
    Number.isInteger(boostCount) &&
    boostCount >= 0 &&
    boostCount <= 1000;
  return (
    <Modal
      open
      onClose={onClose}
      icon="user"
      title={member.name}
      description={`${member.userId} · ${member.inServer ? 'In the server' : 'Left the server'} · saved ${when(member.updatedAt)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!valid || disabled}
            onClick={() =>
              valid && onSave({ servedMs: servedMs, boosts: boostCount })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="sp-stack">
        <Input
          label="Time in the server"
          value={served}
          onChange={(e) => setServed(e.target.value)}
          {...(servedMs === null
            ? { error: 'Use m, h and d, like 30m, 12h or 7d.' }
            : { hint: 'Timed roles count from this.' })}
        />
        <Input
          label="Boosts counted"
          type="number"
          min={0}
          max={1000}
          value={boosts}
          onChange={(e) => setBoosts(e.target.value)}
          hint={
            member.boostingSince
              ? `Boosting since ${when(member.boostingSince)}.`
              : 'Not boosting right now.'
          }
        />
        <div>
          <span className="sp-label">Roles from automatic roles</span>
          <p className="sp-hint">
            {member.given.length
              ? member.given.map((id) => roleName(roles, id)).join(', ')
              : 'None yet.'}
          </p>
        </div>
      </div>
    </Modal>
  );
}
