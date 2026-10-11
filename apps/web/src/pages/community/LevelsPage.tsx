import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import {
  CommunityRewardConfigSchema,
  LevelConfigSchema,
} from '@sparko/messages/community-contracts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { LiveEventsNotice } from '../../features/config/LiveEventsNotice';
import { ConfigForm } from '../../features/config/ConfigForm';
import { Tabs } from '../../features/config/Tabs';
import {
  ChannelChecklist,
  ChannelField,
  DocumentField,
  NumberField,
  RoleChecklist,
  SelectField,
  fieldError,
  useChannels,
  useRoles,
} from '../../features/config/fields';
import {
  getLevelProfiles,
  getMemberLevel,
  grantXp,
  previewRewardRoles,
  reconcileRewardRoles,
} from '../../services/community';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

/** Same curve as the domain: base × L + growth × L × (L − 1) / 2. */
export function levelThreshold(level: number, base: number, growth: number) {
  return base * level + (growth * level * (level - 1)) / 2;
}

function LevelSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R09', LevelConfigSchema);
  const { form } = controller;
  const roleMultipliers = useFieldArray({
    control: form.control,
    name: 'roleMultipliers',
  });
  const channelMultipliers = useFieldArray({
    control: form.control,
    name: 'channelMultipliers',
  });
  const roles = useRoles(guildId);
  const channels = useChannels(guildId);
  const [base, growth, maxLevel, minXp, maxXp] = form.watch([
    'baseXp',
    'growthXp',
    'maxLevel',
    'minXp',
    'maxXp',
  ]);
  const average = ((Number(minXp) || 0) + (Number(maxXp) || 0)) / 2;
  const curve = [1, 2, 5, 10, 20, 50]
    .filter((level) => level <= (Number(maxLevel) || 1))
    .map((level) => {
      const xp = levelThreshold(level, Number(base) || 1, Number(growth) || 0);
      return {
        level,
        xp,
        messages: average > 0 ? Math.ceil(xp / average) : null,
      };
    });
  return (
    <ConfigForm
      controller={controller.shell}
      title="Message leveling"
      description="Members earn XP for eligible messages. Bots, webhooks, excluded channels and roles never earn XP."
      enableLabel="Award XP for messages"
    >
      <Card>
        <h2>Earning</h2>
        <div className="form-grid">
          <NumberField
            form={form}
            name="minXp"
            label="Minimum XP per message"
            min={0}
          />
          <NumberField
            form={form}
            name="maxXp"
            label="Maximum XP per message"
            min={0}
          />
          <NumberField
            form={form}
            name="cooldownSeconds"
            label="Cooldown"
            unit="seconds"
            min={1}
            hint="A member earns XP at most once per cooldown."
          />
          <NumberField
            form={form}
            name="maxMultiplier"
            label="Highest combined multiplier"
            min={0}
            max={10}
            step={0.1}
          />
        </div>
      </Card>
      <Card>
        <h2>Level curve</h2>
        <div className="form-grid">
          <NumberField form={form} name="baseXp" label="Base XP" min={1} />
          <NumberField
            form={form}
            name="growthXp"
            label="Growth per level"
            min={0}
          />
          <NumberField
            form={form}
            name="maxLevel"
            label="Maximum level"
            min={1}
            max={1000}
          />
        </div>
        <table className="curve-table" aria-label="Total XP needed per level">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Total XP</th>
              <th scope="col">About this many messages</th>
            </tr>
          </thead>
          <tbody>
            {curve.map((row) => (
              <tr key={row.level}>
                <td>{row.level}</td>
                <td>{row.xp.toLocaleString()}</td>
                <td>{row.messages?.toLocaleString() ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="field-hint">
          Message estimates use the average XP per message and ignore the
          cooldown. Changing the curve keeps every member’s lifetime XP and
          recalculates levels.
        </p>
      </Card>
      <Card>
        <h2>Multipliers</h2>
        <p className="muted">
          The highest matching role multiplier is combined with a channel
          multiplier, then capped. A multiplier of 0 disables XP for that match.
        </p>
        <h3>Role multipliers</h3>
        {roleMultipliers.fields.map((item, index) => (
          <div className="repeat-row" key={item.id}>
            <Field
              label="Role"
              htmlFor={`role-mult-${index}`}
              error={fieldError(
                form as never,
                `roleMultipliers.${index}.roleId`,
              )}
            >
              <select
                id={`role-mult-${index}`}
                {...form.register(`roleMultipliers.${index}.roleId`)}
              >
                {roles.data
                  ?.filter((role) => role.id !== guildId)
                  .map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
              </select>
            </Field>
            <NumberField
              form={form}
              name={`roleMultipliers.${index}.multiplier`}
              label="Multiplier"
              min={0}
              max={10}
              step={0.1}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label="Remove role multiplier"
              onClick={() => roleMultipliers.remove(index)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={!roles.data?.length || roleMultipliers.fields.length >= 30}
          onClick={() =>
            roleMultipliers.append({
              roleId: roles.data?.find((role) => role.id !== guildId)?.id ?? '',
              multiplier: 1.5,
            })
          }
        >
          <Plus size={16} /> Add role multiplier
        </Button>
        <h3>Channel multipliers</h3>
        {channelMultipliers.fields.map((item, index) => (
          <div className="repeat-row" key={item.id}>
            <Field
              label="Channel"
              htmlFor={`channel-mult-${index}`}
              error={fieldError(
                form as never,
                `channelMultipliers.${index}.channelId`,
              )}
            >
              <select
                id={`channel-mult-${index}`}
                {...form.register(`channelMultipliers.${index}.channelId`)}
              >
                {channels.data
                  ?.filter((channel) => [0, 5].includes(channel.type))
                  .map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      # {channel.name}
                    </option>
                  ))}
              </select>
            </Field>
            <NumberField
              form={form}
              name={`channelMultipliers.${index}.multiplier`}
              label="Multiplier"
              min={0}
              max={10}
              step={0.1}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label="Remove channel multiplier"
              onClick={() => channelMultipliers.remove(index)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={
            !channels.data?.length || channelMultipliers.fields.length >= 30
          }
          onClick={() =>
            channelMultipliers.append({
              channelId:
                channels.data?.find((channel) => [0, 5].includes(channel.type))
                  ?.id ?? '',
              multiplier: 2,
            })
          }
        >
          <Plus size={16} /> Add channel multiplier
        </Button>
      </Card>
      <Card>
        <h2>Exclusions</h2>
        <div className="form-grid">
          <ChannelChecklist
            form={form}
            name="excludedChannelIds"
            label="Channels that never award XP"
            guildId={guildId}
          />
          <RoleChecklist
            form={form}
            name="excludedRoleIds"
            label="Roles that never earn XP"
            guildId={guildId}
          />
        </div>
      </Card>
      <Card>
        <h2>Level-up announcement</h2>
        <ChannelField
          form={form}
          name="announcementChannelId"
          label="Announcement channel"
          guildId={guildId}
          placeholder="Do not announce level-ups"
        />
        <DocumentField
          form={form}
          name="announcement"
          label="Announcement design"
          guildId={guildId}
        />
      </Card>
    </ConfigForm>
  );
}

function RewardRoles({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(
    guildId,
    'R11',
    CommunityRewardConfigSchema,
  );
  const { form } = controller;
  const rewards = useFieldArray({ control: form.control, name: 'rewards' });
  const roles = useRoles(guildId);
  const identity = useActionIdentity();
  const [userId, setUserId] = useState('');
  const validUser = /^\d{17,20}$/.test(userId);
  const preview = useMutation({
    mutationFn: () =>
      previewRewardRoles(guildId, userId, identity('reward-preview', userId)),
  });
  const apply = useMutation({
    mutationFn: () =>
      reconcileRewardRoles(guildId, userId, identity('reward-apply', userId)),
  });
  const roleName = (id: string) =>
    roles.data?.find((role) => role.id === id)?.name ?? id;
  return (
    <div className="stack">
      <ConfigForm
        controller={controller.shell}
        title="Reward roles"
        description="Members receive roles when they reach a level. Sparko only manages the roles listed here and never removes unrelated roles."
        enableLabel="Grant level reward roles"
      >
        <Card>
          <SelectField
            form={form}
            name="policy"
            label="When a member qualifies for several rewards"
            options={[
              { value: 'highest', label: 'Keep only the highest reward' },
              { value: 'stack', label: 'Keep every earned reward' },
            ]}
          />
          {rewards.fields.map((item, index) => (
            <div className="repeat-row" key={item.id}>
              <Field
                label="Role"
                htmlFor={`reward-role-${index}`}
                error={fieldError(form as never, `rewards.${index}.roleId`)}
              >
                <select
                  id={`reward-role-${index}`}
                  {...form.register(`rewards.${index}.roleId`)}
                >
                  {roles.data
                    ?.filter((role) => !role.managed && role.id !== guildId)
                    .map((role) => (
                      <option
                        key={role.id}
                        value={role.id}
                        disabled={role.assignable === false}
                      >
                        {role.name}
                        {role.assignable === false
                          ? ' — above Sparko’s role'
                          : ''}
                      </option>
                    ))}
                </select>
              </Field>
              <NumberField
                form={form}
                name={`rewards.${index}.level`}
                label="Level"
                min={1}
                max={1000}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label="Remove reward"
                onClick={() => rewards.remove(index)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={rewards.fields.length >= 100}
            onClick={() =>
              rewards.append({
                level: 5,
                roleId:
                  roles.data?.find(
                    (role) =>
                      !role.managed &&
                      role.id !== guildId &&
                      role.assignable !== false,
                  )?.id ?? '',
              })
            }
          >
            <Plus size={16} /> Add reward role
          </Button>
        </Card>
      </ConfigForm>
      <Card>
        <h2>Check a member</h2>
        <p className="muted">
          Preview shows the saved reward roles for a member’s current level
          without changing Discord. Apply queues the change; Discord confirms it
          separately.
        </p>
        <Field
          label="Member ID"
          htmlFor="reward-member"
          error={userId && !validUser ? 'Enter a Discord user ID.' : undefined}
        >
          <Input
            id="reward-member"
            inputMode="numeric"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value.trim());
              preview.reset();
              apply.reset();
            }}
          />
        </Field>
        <div className="row">
          <Button
            type="button"
            variant="secondary"
            disabled={!validUser}
            busy={preview.isPending}
            onClick={() => preview.mutate()}
          >
            Preview roles
          </Button>
          <Button
            type="button"
            disabled={!validUser || !preview.data}
            busy={apply.isPending}
            onClick={() => apply.mutate()}
          >
            Apply to Discord
          </Button>
        </div>
        {preview.data && (
          <p role="status">
            Level {preview.data.data.level}:{' '}
            {preview.data.data.desiredRoleIds.length
              ? preview.data.data.desiredRoleIds.map(roleName).join(', ')
              : 'no reward roles'}
            .
          </p>
        )}
        {apply.data && (
          <p role="status">Queued. Discord will confirm the role change.</p>
        )}
        {(preview.error || apply.error) && (
          <ErrorState message={errorMessage(preview.error ?? apply.error)} />
        )}
      </Card>
    </div>
  );
}

function Members({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const profiles = useQuery({
    queryKey: ['levels', guildId],
    queryFn: ({ signal }) => getLevelProfiles(guildId, signal),
  });
  const member = useQuery({
    queryKey: ['levels', guildId, 'member', selected],
    queryFn: ({ signal }) => getMemberLevel(guildId, selected ?? '', signal),
    enabled: !!selected,
  });
  const delta = Number(amount);
  const validAmount =
    amount !== '' &&
    Number.isInteger(delta) &&
    delta !== 0 &&
    Math.abs(delta) <= 1_000_000;
  const adjust = useMutation({
    mutationFn: () => {
      const body = {
        userId: selected ?? '',
        amount: delta,
        reason: reason.trim(),
      };
      return grantXp(guildId, body, identity('xp-adjust', body));
    },
    onSuccess: () => {
      setAmount('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['levels', guildId] });
    },
  });
  if (profiles.isPending) return <LoadingState label="Loading members…" />;
  if (profiles.error)
    return (
      <ErrorState
        message={errorMessage(profiles.error)}
        retry={() => void profiles.refetch()}
      />
    );
  if (!profiles.data.length)
    return (
      <EmptyState
        title="No XP recorded yet"
        description="Members appear here after they earn XP from eligible messages."
      />
    );
  return (
    <div className="overview-grid">
      <Card className="table-wrap">
        <table>
          <caption className="sr-only">Members with recorded XP</caption>
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Level</th>
              <th scope="col">XP</th>
              <th scope="col">Leaderboard</th>
            </tr>
          </thead>
          <tbody>
            {profiles.data.map((row) => (
              <tr key={row.userId}>
                <td>
                  <button
                    type="button"
                    className="text-link"
                    aria-pressed={selected === row.userId}
                    onClick={() => {
                      setSelected(row.userId);
                      adjust.reset();
                    }}
                  >
                    {row.userId}
                  </button>
                </td>
                <td>{row.level}</td>
                <td>{row.xp.toLocaleString()}</td>
                <td>{row.publicProfile ? 'Opted in' : 'Private'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        {!selected ? (
          <EmptyState
            title="Choose a member"
            description="Select a member to review their XP history or make a recorded adjustment."
          />
        ) : member.isPending ? (
          <LoadingState />
        ) : member.error ? (
          <ErrorState message={errorMessage(member.error)} />
        ) : (
          <div className="stack">
            <h2>Member {selected}</h2>
            <p>{member.data.profile.textSummary}</p>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (validAmount && reason.trim()) adjust.mutate();
              }}
            >
              <Field
                label="XP adjustment"
                htmlFor="xp-amount"
                hint="Use a negative number to remove XP. Every adjustment is recorded with its reason."
                error={
                  amount && !validAmount
                    ? 'Enter a whole number between −1,000,000 and 1,000,000, other than 0.'
                    : undefined
                }
              >
                <Input
                  id="xp-amount"
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label="Reason" htmlFor="xp-reason">
                <Input
                  id="xp-reason"
                  value={reason}
                  maxLength={1000}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                busy={adjust.isPending}
                disabled={!validAmount || !reason.trim()}
              >
                Record adjustment
              </Button>
              {adjust.error && (
                <ErrorState message={errorMessage(adjust.error)} />
              )}
              {adjust.isSuccess && <p role="status">Adjustment recorded.</p>}
            </form>
            <h3>History</h3>
            {member.data.history.length ? (
              member.data.history.map((entry) => (
                <div className="activity-row" key={entry.id}>
                  <span>
                    <strong>
                      {entry.data.delta > 0 ? '+' : ''}
                      {entry.data.delta.toLocaleString()} XP
                    </strong>
                    <small>{entry.data.reason}</small>
                  </span>
                  <Badge tone="neutral">
                    {new Date(entry.data.observedAt).toLocaleString()}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="muted">No XP history yet.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export function LevelsPage({ defaultTab }: { defaultTab?: string }) {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Levels & XP"
        description="Set how members earn XP, what each level is worth, and which roles reward progress."
      />
      <LiveEventsNotice what="XP is awarded" events="new messages" />
      <Tabs
        defaultTab={defaultTab}
        tabs={[
          {
            id: 'settings',
            label: 'XP & levels',
            content: <LevelSettings guildId={guildId} />,
          },
          {
            id: 'rewards',
            label: 'Reward roles',
            content: <RewardRoles guildId={guildId} />,
          },
          {
            id: 'members',
            label: 'Members',
            content: <Members guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
