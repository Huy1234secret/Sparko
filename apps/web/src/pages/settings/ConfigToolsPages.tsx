import { useId, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Download,
  FileUp,
  GitCompareArrows,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import {
  SwitchField,
  useChannels,
  useRoles,
} from '../../features/config/fields';
import { AutomationSettings } from '../../features/automation/shared';
import { useRetryKey } from '../../features/economy/shared';
import {
  applyRollout,
  createBackup,
  deleteBackup,
  emptyRemap,
  featureName,
  getBackupFile,
  getBackups,
  importBackup,
  isProtected,
  previewRestore,
  previewRollout,
  readBackupFile,
  restoreBackup,
  type BackupPreview,
  type BackupSummary,
  type Change,
  type ResourceRemap,
  type RolloutPreview,
  type RolloutResult,
} from '../../services/configTools';
import { getGuilds, type Guild } from '../../services/guilds';
import { modules } from '../../content/modules';
import { ApiError, errorMessage } from '../../services/http';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
/** "Levels & XP › channel multipliers 1", for a setting path. */
function settingLabel(featureId: string, path: string) {
  const words = path
    .split('.')
    .map((part) =>
      /^\d+$/.test(part)
        ? String(Number(part) + 1)
        : part
            .replace(/Ids?$/, '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .toLowerCase(),
    )
    .join(' ');
  return `${featureName(featureId)} › ${words}`;
}
function FieldErrors({ error }: { error: unknown }) {
  if (!error) return null;
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : [];
  return (
    <ErrorState
      message={
        fieldErrors.length
          ? `${errorMessage(error)} ${fieldErrors
              .map((e) => {
                const [featureId = '', ...rest] = e.path.split('.');
                return rest.length
                  ? `${settingLabel(featureId, rest.join('.'))}: ${e.message}`
                  : `${featureName(featureId)}: ${e.message}`;
              })
              .join(' ')}`
          : errorMessage(error)
      }
    />
  );
}

type Missing = Change['missing'];
/**
 * Lets the person pick, for each channel or role the settings name that this
 * server lacks, which of this server's channels or roles to use instead.
 */
function RemapFields({
  guildId,
  changes,
  remap,
  onChange,
}: {
  guildId: string;
  changes: { featureId: string; missing: Missing }[];
  remap: ResourceRemap;
  onChange: (remap: ResourceRemap) => void;
}) {
  const base = useId();
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);
  const collect = (kind: 'channels' | 'roles') => {
    const uses = new Map<string, string[]>();
    for (const id of Object.keys(remap[kind])) uses.set(id, []);
    for (const change of changes)
      for (const ref of change.missing[kind])
        uses.set(ref.id, [
          ...(uses.get(ref.id) ?? []),
          settingLabel(change.featureId, ref.path),
        ]);
    return [...uses];
  };
  const groups = [
    {
      kind: 'channels' as const,
      noun: 'channel',
      items: collect('channels'),
      options: (channels.data ?? []).map((c) => ({
        id: c.id,
        label: `#${c.name}`,
      })),
    },
    {
      kind: 'roles' as const,
      noun: 'role',
      items: collect('roles'),
      options: (roles.data ?? [])
        .filter((r) => !r.managed && r.id !== guildId)
        .map((r) => ({ id: r.id, label: `@${r.name}` })),
    },
  ];
  if (!groups.some((g) => g.items.length)) return null;
  return (
    <fieldset className="stack">
      <legend>Match channels and roles</legend>
      <p className="field-hint">
        These settings name channels or roles this server doesn’t have. Choose
        what to use here, then preview again.
      </p>
      {groups.map((group) =>
        group.items.map(([id, uses], index) => {
          const fieldId = `${base}-${group.kind}-${index}`;
          return (
            <Field
              key={`${group.kind}-${id}`}
              label={`Missing ${group.noun} …${id.slice(-4)}`}
              htmlFor={fieldId}
              hint={uses.length ? `Used by ${uses.join('; ')}` : undefined}
            >
              <select
                id={fieldId}
                value={remap[group.kind][id] ?? ''}
                onChange={(event) => {
                  const next = { ...remap[group.kind] };
                  if (event.target.value) next[id] = event.target.value;
                  else delete next[id];
                  onChange({ ...remap, [group.kind]: next });
                }}
              >
                <option value="">Choose a {group.noun}</option>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          );
        }),
      )}
    </fieldset>
  );
}
const missingCount = (missing: Missing) =>
  missing.channels.length + missing.roles.length;
function ChangeBadge({ change }: { change: Change & { issues?: unknown[] } }) {
  if (change.issues?.length) return <Badge tone="danger">Invalid</Badge>;
  if (missingCount(change.missing))
    return <Badge tone="warning">Needs matching</Badge>;
  return change.changed ? (
    <Badge tone="info">Will change</Badge>
  ) : (
    <Badge>Already the same</Badge>
  );
}

// Configuration backups (R50)

function NewBackup({ guildId, full }: { guildId: string; full: boolean }) {
  const queryClient = useQueryClient();
  const retry = useRetryKey();
  const fileInput = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['backups', guildId] });
  const create = useMutation({
    mutationFn: (value: string) =>
      createBackup(guildId, value, retry.key(`create:${value}`)),
    onSuccess: (result, value) => {
      retry.done(`create:${value}`);
      setLabel('');
      setCreated(`Saved “${result.data.label}”.`);
      refresh();
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await readBackupFile(file);
      const action = `import:${file.name}:${file.size}:${file.lastModified}`;
      const result = await importBackup(guildId, parsed, retry.key(action));
      retry.done(action);
      return result;
    },
    onSuccess: (result) => {
      setCreated(`Imported “${result.data.label}”.`);
      refresh();
    },
    onSettled: () => {
      if (fileInput.current) fileInput.current.value = '';
    },
  });
  const trimmed = label.trim();
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) create.mutate(trimmed);
        }}
      >
        <h2>New backup</h2>
        {full && (
          <Notice tone="warning" title="Backup limit reached">
            Delete an older backup to save or import another.
          </Notice>
        )}
        <Field
          label="Name"
          htmlFor="backup-label"
          hint="For example “Before the event weekend”."
        >
          <Input
            id="backup-label"
            maxLength={80}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <div className="row">
          <Button
            type="submit"
            busy={create.isPending}
            disabled={!trimmed || full}
          >
            <Archive size={16} aria-hidden="true" /> Back up now
          </Button>
          <Button
            type="button"
            variant="secondary"
            busy={upload.isPending}
            disabled={full}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp size={16} aria-hidden="true" /> Import a file…
          </Button>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="Backup file to import"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </div>
        <p className="field-hint">
          Imported files are checked like any settings change, and nothing
          changes until you restore.
        </p>
        {created && (
          <p className="field-hint" role="status">
            {created}
          </p>
        )}
        <FieldErrors error={create.error ?? upload.error} />
      </form>
    </Card>
  );
}
async function download(guildId: string, backup: BackupSummary) {
  const file = await getBackupFile(guildId, backup.id);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `sparko-backup-${backup.label.replace(/[^\w-]+/g, '-').toLowerCase()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
function BackupRow({
  guildId,
  backup,
}: {
  guildId: string;
  backup: BackupSummary;
}) {
  const queryClient = useQueryClient();
  const retry = useRetryKey();
  const [, setParams] = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () =>
      deleteBackup(guildId, backup.id, retry.key(`delete:${backup.id}`)),
    onSuccess: () => {
      retry.done(`delete:${backup.id}`);
      void queryClient.invalidateQueries({ queryKey: ['backups', guildId] });
    },
  });
  const save = useMutation({ mutationFn: () => download(guildId, backup) });
  const fromHere = backup.sourceGuildId === guildId;
  return (
    <li className="activity-row">
      <span>
        <strong className="wrap-anywhere">{backup.label}</strong>
        <small>
          {dateTime(backup.createdAt)} ·{' '}
          {backup.featureIds.length
            ? `${backup.featureIds.length} module(s)`
            : 'No module settings'}
          {!fromHere && ' · from another server'}
        </small>
        {remove.error && <FieldErrors error={remove.error} />}
        {save.error && <FieldErrors error={save.error} />}
      </span>
      <span className="row">
        <Badge tone={backup.origin === 'import' ? 'info' : 'neutral'}>
          {backup.origin === 'import' ? 'Imported' : 'Saved here'}
        </Badge>
        {confirming ? (
          <>
            <Button
              variant="danger"
              busy={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete backup
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={!backup.featureIds.length}
              onClick={() => setParams({ tab: 'restore', backup: backup.id })}
            >
              <RotateCcw size={16} aria-hidden="true" /> Restore…
            </Button>
            <Button
              variant="ghost"
              busy={save.isPending}
              aria-label={`Download ${backup.label}`}
              onClick={() => save.mutate()}
            >
              <Download size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              aria-label={`Delete ${backup.label}…`}
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </>
        )}
      </span>
    </li>
  );
}
function useBackups(guildId: string) {
  return useQuery({
    queryKey: ['backups', guildId],
    queryFn: ({ signal }) => getBackups(guildId, signal),
  });
}
function BackupList({ guildId }: { guildId: string }) {
  const backups = useBackups(guildId);
  if (backups.isPending) return <LoadingState />;
  if (backups.error)
    return <ErrorState message={errorMessage(backups.error)} />;
  const { backups: rows, limit } = backups.data;
  return (
    <div className="stack">
      <NewBackup guildId={guildId} full={rows.length >= limit} />
      {rows.length ? (
        <Card>
          <h2>Saved backups</h2>
          <p className="field-hint">
            {rows.length} of {limit} kept.
          </p>
          <ul className="row-list">
            {rows.map((backup) => (
              <BackupRow key={backup.id} guildId={guildId} backup={backup} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={Archive}
          title="No backups yet"
          description="Save one before big changes so you can compare and roll back."
        />
      )}
    </div>
  );
}
function ChangeList({
  changes,
  selected,
  onToggle,
}: {
  changes: (Change & { issues?: { message: string }[] })[];
  selected?: Set<string>;
  onToggle?: (featureId: string, on: boolean) => void;
}) {
  return (
    <ul className="row-list">
      {changes.map((change) => {
        const blocked =
          !change.changed ||
          !!change.issues?.length ||
          missingCount(change.missing) > 0;
        return (
          <li className="activity-row" key={change.featureId}>
            <span>
              {onToggle && selected ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selected.has(change.featureId)}
                    disabled={blocked}
                    onChange={(e) =>
                      onToggle(change.featureId, e.target.checked)
                    }
                  />
                  <strong>{featureName(change.featureId)}</strong>
                </label>
              ) : (
                <strong>{featureName(change.featureId)}</strong>
              )}
              {!!change.issues?.length && (
                <small>
                  {change.issues.map((issue) => issue.message).join(' ')}
                </small>
              )}
            </span>
            <ChangeBadge change={change} />
          </li>
        );
      })}
    </ul>
  );
}
function Restore({ guildId }: { guildId: string }) {
  const [params, setParams] = useSearchParams();
  const backups = useBackups(guildId);
  const queryClient = useQueryClient();
  const retry = useRetryKey();
  const backupId = params.get('backup') ?? '';
  const [remap, setRemap] = useState<ResourceRemap>(emptyRemap);
  const [preview, setPreview] = useState<{
    remap: ResourceRemap;
    result: BackupPreview;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restored, setRestored] = useState<string[] | null>(null);
  const check = useMutation({
    mutationFn: (value: ResourceRemap) =>
      previewRestore(guildId, backupId, value, crypto.randomUUID()),
    onSuccess: (result, value) => {
      setPreview({ remap: value, result: result.data });
      setRestored(null);
      setSelected(
        new Set(
          result.data.changes
            .filter(
              (c) => c.changed && !c.issues.length && !missingCount(c.missing),
            )
            .map((c) => c.featureId),
        ),
      );
    },
  });
  const body = preview && {
    featureIds: [...selected],
    expectedRevisions: Object.fromEntries(
      preview.result.changes
        .filter((c) => selected.has(c.featureId))
        .map((c) => [c.featureId, c.expectedRevision]),
    ),
    remap: preview.remap,
  };
  const restore = useMutation({
    mutationFn: () => {
      const action = `restore:${backupId}:${JSON.stringify(body)}`;
      return restoreBackup(guildId, backupId, body!, retry.key(action)).then(
        (result) => {
          retry.done(action);
          return result;
        },
      );
    },
    onSuccess: (result) => {
      setRestored(result.data.restored.map((r) => r.featureId));
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['config', guildId] });
    },
  });
  if (backups.isPending) return <LoadingState />;
  if (backups.error)
    return <ErrorState message={errorMessage(backups.error)} />;
  const choices = backups.data.backups.filter((b) => b.featureIds.length);
  if (!choices.length)
    return (
      <EmptyState
        icon={RotateCcw}
        title="Nothing to restore"
        description="Save or import a backup first."
      />
    );
  const stale =
    preview && JSON.stringify(preview.remap) !== JSON.stringify(remap);
  return (
    <Card>
      <div className="stack">
        <h2>Restore settings</h2>
        <Field
          label="Backup"
          htmlFor="restore-backup"
          hint="Restoring replaces only the modules you tick. Nothing changes until you confirm."
        >
          <select
            id="restore-backup"
            value={backupId}
            onChange={(event) => {
              setParams({ tab: 'restore', backup: event.target.value });
              setPreview(null);
              setRemap(emptyRemap());
              setRestored(null);
            }}
          >
            <option value="">Choose a backup</option>
            {choices.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} — {dateTime(b.createdAt)}
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <Button
            variant="secondary"
            disabled={!backupId}
            busy={check.isPending}
            onClick={() => check.mutate(remap)}
          >
            <GitCompareArrows size={16} aria-hidden="true" />{' '}
            {preview ? 'Preview again' : 'Preview changes'}
          </Button>
        </div>
        <FieldErrors error={check.error} />
        {preview && (
          <>
            <ChangeList
              changes={preview.result.changes}
              selected={selected}
              onToggle={(id, on) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (on) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
            />
            <RemapFields
              guildId={guildId}
              changes={preview.result.changes}
              remap={remap}
              onChange={setRemap}
            />
            {stale && (
              <Notice tone="info" title="Preview again to use your choices" />
            )}
            <div className="row">
              <Button
                busy={restore.isPending}
                disabled={!selected.size || !!stale}
                onClick={() => restore.mutate()}
              >
                <RotateCcw size={16} aria-hidden="true" /> Restore{' '}
                {selected.size} module(s)
              </Button>
            </div>
            <FieldErrors error={restore.error} />
          </>
        )}
        {restored && (
          <Notice tone="success" title="Settings restored">
            {restored.map(featureName).join(', ')} now use the backup’s
            settings. Sparko applies them shortly.
          </Notice>
        )}
      </div>
    </Card>
  );
}
const protectedNotice = (
  <Notice tone="info" title="Only module settings are copied">
    Staff access, plan and billing, privacy, AI consent, music, external events,
    public widgets and multi-server opt-in are never included. Set those
    directly in each server.
  </Notice>
);
export function BackupsPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Server settings"
        title="Configuration backups"
        description="Save this server’s module settings, download them, and restore them here or in another server."
      />
      {protectedNotice}
      <Tabs
        tabs={[
          {
            id: 'backups',
            label: 'Backups',
            content: <BackupList guildId={guildId} />,
          },
          {
            id: 'restore',
            label: 'Restore',
            content: <Restore guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}

// Multi-server tools (R61)

const rolloutModules = modules.filter(
  (m) => !isProtected(m.id) && m.id !== 'R50',
);
const resultLabels: Record<
  RolloutResult['results'][number]['status'],
  { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }
> = {
  applied: { label: 'Applied', tone: 'success' },
  unchanged: { label: 'Already the same', tone: 'neutral' },
  'not-allowed': { label: 'Rollout not allowed', tone: 'warning' },
  conflict: { label: 'Changed since preview', tone: 'warning' },
  'needs-changes': { label: 'Needs changes', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
};
function Rollout({ guildId }: { guildId: string }) {
  const retry = useRetryKey();
  const guilds = useQuery({
    queryKey: ['guilds'],
    queryFn: ({ signal }) => getGuilds(signal),
  });
  const [targets, setTargets] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [remaps, setRemaps] = useState<Record<string, ResourceRemap>>({});
  const [preview, setPreview] = useState<{
    remaps: Record<string, ResourceRemap>;
    result: RolloutPreview;
  } | null>(null);
  const [outcome, setOutcome] = useState<RolloutResult | null>(null);
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...list, id] : list.filter((v) => v !== id);
  const check = useMutation({
    mutationFn: () =>
      previewRollout(
        {
          sourceGuildId: guildId,
          targetGuildIds: targets,
          featureIds: features,
          remaps,
        },
        crypto.randomUUID(),
      ),
    onSuccess: (result) => {
      setPreview({ remaps, result: result.data });
      setOutcome(null);
    },
  });
  const body = preview && {
    sourceGuildId: guildId,
    featureIds: features,
    targets: preview.result.targets
      .filter((t) => t.rolloutAllowed)
      .map((t) => ({
        guildId: t.guildId,
        expectedRevisions: Object.fromEntries(
          t.changes.map((c) => [c.featureId, c.expectedRevision]),
        ),
        remap: preview.remaps[t.guildId] ?? emptyRemap(),
      })),
  };
  const apply = useMutation({
    mutationFn: () => {
      const action = `rollout:${JSON.stringify(body)}`;
      return applyRollout(body!, retry.key(action)).then((result) => {
        retry.done(action);
        return result;
      });
    },
    onSuccess: (result) => {
      setOutcome(result.data);
      setPreview(null);
    },
  });
  if (guilds.isPending) return <LoadingState />;
  if (guilds.error) return <ErrorState message={errorMessage(guilds.error)} />;
  const others = guilds.data.filter(
    (g) => g.id !== guildId && g.installed && g.manageable,
  );
  const nameOf = (id: string) =>
    guilds.data.find((g: Guild) => g.id === id)?.name ?? 'Another server';
  if (!others.length)
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="No other servers to compare"
        description="Install Sparko in another server you manage, and turn on multi-server tools there too."
      />
    );
  const stale =
    preview && JSON.stringify(preview.remaps) !== JSON.stringify(remaps);
  const blocked = preview?.result.targets.some(
    (t) =>
      t.rolloutAllowed &&
      t.changes.some((c) => c.changed && missingCount(c.missing)),
  );
  const writable = preview?.result.targets.filter(
    (t) => t.rolloutAllowed && t.changes.some((c) => c.changed),
  ).length;
  const failedFor =
    check.error instanceof ApiError ? check.error.guildId : undefined;
  return (
    <div className="stack">
      <Card>
        <div className="stack">
          <h2>Copy settings from this server</h2>
          <fieldset className="stack">
            <legend>Servers to update</legend>
            {others.map((g) => (
              <label className="checkbox-row" key={g.id}>
                <input
                  type="checkbox"
                  checked={targets.includes(g.id)}
                  onChange={(e) => {
                    setTargets(toggle(targets, g.id, e.target.checked));
                    setPreview(null);
                  }}
                />
                <span>{g.name}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="stack">
            <legend>Modules to copy</legend>
            <div className="check-grid">
              {rolloutModules.map((m) => (
                <label className="checkbox-row" key={m.id}>
                  <input
                    type="checkbox"
                    checked={features.includes(m.id)}
                    onChange={(e) => {
                      setFeatures(toggle(features, m.id, e.target.checked));
                      setPreview(null);
                    }}
                  />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <Button
              variant="secondary"
              disabled={!targets.length || !features.length}
              busy={check.isPending}
              onClick={() => check.mutate()}
            >
              <GitCompareArrows size={16} aria-hidden="true" />{' '}
              {preview ? 'Preview again' : 'Preview changes'}
            </Button>
          </div>
          {check.error && (
            <ErrorState
              message={`${failedFor ? `${nameOf(failedFor)}: ` : ''}${errorMessage(check.error)}`}
            />
          )}
        </div>
      </Card>
      {preview && (
        <>
          {!!preview.result.notConfiguredInSource.length && (
            <Notice tone="info" title="Not set up in this server">
              {preview.result.notConfiguredInSource.map(featureName).join(', ')}{' '}
              {preview.result.notConfiguredInSource.length === 1
                ? 'has'
                : 'have'}{' '}
              never been saved here, so there is nothing to copy.
            </Notice>
          )}
          {preview.result.targets.map((target) => (
            <Card key={target.guildId}>
              <div className="stack">
                <div className="row">
                  <h2 className="wrap-anywhere">{nameOf(target.guildId)}</h2>
                  {!target.rolloutAllowed && (
                    <Badge tone="warning">Comparison only</Badge>
                  )}
                </div>
                {!target.rolloutAllowed && (
                  <p className="field-hint">
                    This server allows comparison but not rollout. Its staff can
                    allow rollout in its own Multi-server settings.
                  </p>
                )}
                {target.changes.length ? (
                  <ChangeList changes={target.changes} />
                ) : (
                  <p className="field-hint">Nothing to compare.</p>
                )}
                {target.rolloutAllowed && (
                  <RemapFields
                    guildId={target.guildId}
                    changes={target.changes.filter((c) => c.changed)}
                    remap={remaps[target.guildId] ?? emptyRemap()}
                    onChange={(value) =>
                      setRemaps({ ...remaps, [target.guildId]: value })
                    }
                  />
                )}
              </div>
            </Card>
          ))}
          {stale && (
            <Notice tone="info" title="Preview again to use your choices" />
          )}
          <div className="row">
            <Button
              busy={apply.isPending}
              disabled={!writable || !!stale || !!blocked}
              onClick={() => apply.mutate()}
            >
              <Send size={16} aria-hidden="true" /> Roll out to {writable ?? 0}{' '}
              server(s)
            </Button>
          </div>
          {blocked && (
            <p className="field-hint">
              Match every missing channel and role before rolling out.
            </p>
          )}
          <FieldErrors error={apply.error} />
        </>
      )}
      {outcome && (
        <Card>
          <h2>Rollout results</h2>
          <p className="field-hint">
            Each server is updated on its own; one failing never changes
            another.
          </p>
          <ul className="row-list">
            {outcome.results.map((r) => (
              <li className="activity-row" key={r.guildId}>
                <span>
                  <strong className="wrap-anywhere">{nameOf(r.guildId)}</strong>
                  {r.message && <small>{r.message}</small>}
                </span>
                <Badge tone={resultLabels[r.status].tone}>
                  {resultLabels[r.status].label}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
export function MultiServerPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Server settings"
        title="Multi-server tools"
        description="Compare this server’s settings with other servers you manage, and roll them out where those servers allow it."
      />
      {protectedNotice}
      <Tabs
        tabs={[
          {
            id: 'rollout',
            label: 'Compare & roll out',
            content: <Rollout guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R61"
                title="Multi-server tools"
                description="Both servers must opt in. Each server decides separately whether others may change its settings."
                enableLabel="Turn on multi-server tools"
              >
                {(form) => (
                  <>
                    <SwitchField
                      form={form}
                      name="allowComparison"
                      label="Allow comparison"
                      hint="Staff who manage both servers can compare this server’s settings."
                    />
                    <SwitchField
                      form={form}
                      name="allowRollout"
                      label="Allow rollout into this server"
                      hint="Staff who manage both servers can overwrite this server’s settings after a preview."
                    />
                  </>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}

// Public widgets (R70)

function WidgetLink({
  guildId,
  type,
  title,
}: {
  guildId: string;
  type: 'status' | 'leaderboard';
  title: string;
}) {
  const url = `${window.location.origin}/api/v1/public/widgets/${guildId}/${type}`;
  const live = useQuery({
    queryKey: ['public-widget', guildId, type],
    queryFn: async ({ signal }) => {
      const response = await fetch(url, {
        signal,
        credentials: 'omit',
      });
      return response.ok;
    },
  });
  return (
    <li className="activity-row">
      <span>
        <strong>{title}</strong>
        <small className="mono wrap-anywhere">{url}</small>
      </span>
      {live.isPending ? (
        <Badge>Checking</Badge>
      ) : live.data ? (
        <Badge tone="success">Public</Badge>
      ) : (
        <Badge>Not public</Badge>
      )}
    </li>
  );
}
export function WidgetsPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Server settings"
        title="Public widgets"
        description="Publish a status badge or leaderboard that anyone can read without signing in."
      />
      <Notice tone="warning" title="Anyone with the link can read these">
        The status widget shows only whether Sparko is installed. The
        leaderboard shows Discord user IDs and XP for members who made their
        profile public, and nothing else.
      </Notice>
      <Tabs
        tabs={[
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R70"
                title="Public widgets"
                description="Each widget is off until you turn it on here."
                enableLabel="Turn on public widgets"
              >
                {(form) => (
                  <>
                    <SwitchField
                      form={form}
                      name="publicStatus"
                      label="Publish server status"
                    />
                    <SwitchField
                      form={form}
                      name="publicLeaderboard"
                      label="Publish the XP leaderboard"
                      hint="Only members who chose a public profile appear."
                    />
                  </>
                )}
              </AutomationSettings>
            ),
          },
          {
            id: 'links',
            label: 'Links',
            content: (
              <Card>
                <h2>Widget links</h2>
                <ul className="row-list">
                  <WidgetLink
                    guildId={guildId}
                    type="status"
                    title="Server status"
                  />
                  <WidgetLink
                    guildId={guildId}
                    type="leaderboard"
                    title="XP leaderboard"
                  />
                </ul>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
