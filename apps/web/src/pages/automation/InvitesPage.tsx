import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gift, UserPlus } from 'lucide-react';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageHeading,
} from '@sparko/ui';
import { Metric } from '../../components/AppShell';
import { Tabs } from '../../features/config/Tabs';
import {
  NumberField,
  RoleField,
  SwitchField,
} from '../../features/config/fields';
import {
  AutomationSettings,
  OffNotice,
  StateBadge,
} from '../../features/automation/shared';
import { getInviteRewards, getInvites } from '../../services/automation';
import { errorMessage } from '../../services/http';

function Joins({ guildId }: { guildId: string }) {
  const invites = useQuery({
    queryKey: ['invites', guildId],
    queryFn: ({ signal }) => getInvites(guildId, signal),
  });
  if (invites.isPending) return <LoadingState />;
  if (invites.error)
    return (
      <ErrorState
        message={errorMessage(invites.error)}
        retry={() => void invites.refetch()}
      />
    );
  const count = (state: string) =>
    invites.data.filter((row) => row.state === state).length;
  return (
    <div className="stack">
      <div className="metric-grid">
        <Metric
          label="Confirmed"
          value={count('confirmed')}
          detail="Exactly one invite gained one use"
        />
        <Metric
          label="Ambiguous"
          value={count('ambiguous')}
          detail="More than one invite could explain it"
        />
        <Metric
          label="Unknown"
          value={count('unknown')}
          detail="Not enough evidence to say"
        />
      </div>
      <Card>
        <h2>Recent joins</h2>
        {invites.data.length ? (
          invites.data.map((row) => (
            <div className="activity-row" key={row.id}>
              <span>
                <strong>
                  Member {row.data.memberId}
                  {row.data.inviterId && row.state === 'confirmed'
                    ? ` · invited by ${row.data.inviterId}`
                    : ''}
                </strong>
                <small>
                  {row.data.reason}
                  {row.data.joinedAt &&
                    ` · ${new Date(row.data.joinedAt).toLocaleString()}`}
                </small>
              </span>
              <StateBadge state={row.state} />
            </div>
          ))
        ) : (
          <EmptyState
            compact
            icon={UserPlus}
            title="No joins recorded yet"
            description="Joins appear after tracking is on and Sparko can read the server’s invites."
          />
        )}
      </Card>
    </div>
  );
}

function Rewards({ guildId }: { guildId: string }) {
  const rewards = useQuery({
    queryKey: ['invite-rewards', guildId],
    queryFn: ({ signal }) => getInviteRewards(guildId, signal),
  });
  return (
    <div className="stack">
      <Card>
        <h2>Rewards given</h2>
        {rewards.isPending ? (
          <LoadingState />
        ) : rewards.error ? (
          <ErrorState message={errorMessage(rewards.error)} />
        ) : rewards.data.length ? (
          rewards.data.map((row) => (
            <div className="activity-row" key={row.id}>
              <span>
                <strong>
                  {row.data.inviterId} for inviting {row.data.memberId}
                </strong>
                <small>
                  {row.data.earnedAt &&
                    `Earned ${new Date(row.data.earnedAt).toLocaleString()}`}
                  {row.data.leftAt &&
                    ` · member left ${new Date(row.data.leftAt).toLocaleString()}`}
                </small>
              </span>
              <StateBadge state={row.state} />
            </div>
          ))
        ) : (
          <EmptyState
            compact
            icon={Gift}
            title="No rewards yet"
            description="A reward is earned once an invited member stays long enough."
          />
        )}
      </Card>
      <AutomationSettings
        guildId={guildId}
        featureId="R41"
        title="Invite rewards"
        description="Only confirmed joins count. Ambiguous and unknown joins never earn a reward."
        enableLabel="Reward members who invite"
      >
        {(form) => (
          <Card>
            <div className="form-grid">
              <RoleField
                form={form}
                name="rewardRoleId"
                label="Reward role"
                hint="Must be below Sparko’s role with no moderator permissions."
                guildId={guildId}
                assigns
              />
              <NumberField
                form={form}
                name="minimumTenureHours"
                label="Invited member must stay"
                unit="hours"
                min={1}
                max={8760}
              />
              <NumberField
                form={form}
                name="minimumAccountAgeDays"
                label="Invited account at least"
                unit="days old"
                min={1}
                max={3650}
              />
            </div>
            <SwitchField
              form={form}
              name="reverseOnLeave"
              label="Take the reward back if the invited member leaves"
              hint="The role stays if another of their rewards still earns it."
            />
          </Card>
        )}
      </AutomationSettings>
    </div>
  );
}

export function InvitesPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Invite tracking"
        description="See who invited new members, with honest confidence: when Sparko cannot be sure, it says so."
      />
      <OffNotice guildId={guildId} featureId="R40" noun="Invite tracking" />
      <Notice tone="info" title="How joins are matched">
        Sparko compares invite use counts before and after each join. Only when
        exactly one invite gained exactly one use is the join confirmed.
        Simultaneous joins, vanity links and deleted invites stay ambiguous or
        unknown rather than guessed. Needs the Manage Server permission to read
        invites.
      </Notice>
      <Tabs
        tabs={[
          { id: 'joins', label: 'Joins', content: <Joins guildId={guildId} /> },
          {
            id: 'rewards',
            label: 'Rewards',
            content: <Rewards guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R40"
                title="Invite tracking"
                description="Records join attribution from now on; earlier joins are not reconstructed."
                enableLabel="Track invites"
              />
            ),
          },
        ]}
      />
    </>
  );
}
