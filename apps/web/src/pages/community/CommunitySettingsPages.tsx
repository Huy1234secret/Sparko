import { LiveEventsNotice } from '../../features/config/LiveEventsNotice';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AutoRoleConfigSchema,
  DepartureConfigSchema,
  StarboardConfigSchema,
  WelcomeConfigSchema,
} from '@sparko/messages/community-contracts';
import {
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { ConfigForm } from '../../features/config/ConfigForm';
import {
  ChannelChecklist,
  ChannelField,
  DocumentField,
  NumberField,
  RoleChecklist,
  SelectField,
  SwitchField,
  fieldError,
} from '../../features/config/fields';
import { getStarboard } from '../../services/community';
import { errorMessage } from '../../services/http';

export function WelcomePage() {
  const { guildId = '' } = useParams();
  const controller = useFeatureConfig(guildId, 'R19', WelcomeConfigSchema);
  const { form } = controller;
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Welcome messages"
        description="Greet new members in a channel, by direct message, or both."
      />
      <LiveEventsNotice
        what="Members are greeted"
        events="member joins"
        intent="Server Members"
      />
      <ConfigForm
        controller={controller.shell}
        title="Welcome messages"
        description="Sent when Discord reports a member joining. Requires the Server Members intent; joins that happen while Sparko is offline are not greeted later."
        enableLabel="Welcome new members"
      >
        <Card>
          <h2>In a channel</h2>
          <ChannelField
            form={form}
            name="channelId"
            label="Welcome channel"
            guildId={guildId}
            placeholder="Do not post in a channel"
          />
          <DocumentField
            form={form}
            name="document"
            label="Channel message"
            guildId={guildId}
            context="member"
          />
        </Card>
        <Card>
          <h2>By direct message</h2>
          <p className="muted">
            Members who have closed their DMs do not receive it; the delivery
            log records that as a real failure.
          </p>
          <DocumentField
            form={form}
            name="dmDocument"
            label="Direct message"
            guildId={guildId}
            context="member"
            hint="Leave empty to skip the DM."
          />
        </Card>
        <Card>
          <RoleChecklist
            form={form}
            name="excludedRoleIds"
            label="Do not greet members who join with these roles"
            guildId={guildId}
          />
        </Card>
      </ConfigForm>
    </>
  );
}

export function LeaveBoostPage() {
  const { guildId = '' } = useParams();
  const controller = useFeatureConfig(guildId, 'R20', DepartureConfigSchema);
  const { form } = controller;
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Leave & boost messages"
        description="Separate messages for members leaving and for new server boosts."
      />
      <LiveEventsNotice
        what="Leaves and boosts are announced"
        events="member updates"
        intent="Server Members"
      />
      <ConfigForm
        controller={controller.shell}
        title="Leave and boost messages"
        description="Each event is announced only when Discord reports it while Sparko is connected."
        enableLabel="Announce leaves and boosts"
      >
        <Card>
          <h2>When a member leaves</h2>
          <ChannelField
            form={form}
            name="leaveChannelId"
            label="Leave channel"
            guildId={guildId}
            placeholder="Do not announce leaves"
          />
          <DocumentField
            form={form}
            name="leaveDocument"
            label="Leave message"
            guildId={guildId}
            context="member"
          />
        </Card>
        <Card>
          <h2>When a member boosts</h2>
          <ChannelField
            form={form}
            name="boostChannelId"
            label="Boost channel"
            guildId={guildId}
            placeholder="Do not announce boosts"
          />
          <DocumentField
            form={form}
            name="boostDocument"
            label="Boost message"
            guildId={guildId}
            context="member"
          />
        </Card>
        <Card>
          <RoleChecklist
            form={form}
            name="excludedRoleIds"
            label="Skip members with these roles"
            guildId={guildId}
          />
        </Card>
      </ConfigForm>
    </>
  );
}

export function AutoRolesPage() {
  const { guildId = '' } = useParams();
  const controller = useFeatureConfig(guildId, 'R17', AutoRoleConfigSchema);
  const { form } = controller;
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Automatic roles"
        description="Give roles when members join or boost. Sparko checks its role position before every change."
      />
      <LiveEventsNotice
        what="Roles are given"
        events="member joins and boosts"
        intent="Server Members"
      />
      <ConfigForm
        controller={controller.shell}
        title="Automatic roles"
        enableLabel="Assign roles automatically"
      >
        <Card>
          <h2>On join</h2>
          <RoleChecklist
            form={form}
            name="joinRoleIds"
            label="Roles for new members"
            guildId={guildId}
            assigns
          />
          <NumberField
            form={form}
            name="delaySeconds"
            label="Wait before assigning"
            unit="seconds"
            min={0}
            hint="Delayed roles survive restarts; a member who leaves first does not receive them."
          />
        </Card>
        <Card>
          <h2>On boost</h2>
          <RoleChecklist
            form={form}
            name="boostRoleIds"
            label="Roles for boosters"
            guildId={guildId}
            assigns
          />
        </Card>
      </ConfigForm>
    </>
  );
}

function StarboardHistory({ guildId }: { guildId: string }) {
  const history = useQuery({
    queryKey: ['starboard', guildId],
    queryFn: ({ signal }) => getStarboard(guildId, signal),
  });
  if (history.isPending) return <LoadingState />;
  if (history.error)
    return (
      <ErrorState
        message={errorMessage(history.error)}
        retry={() => void history.refetch()}
      />
    );
  if (!history.data.length)
    return (
      <EmptyState
        title="Nothing starred yet"
        description="Messages appear here once they reach the threshold."
      />
    );
  return (
    <>
      {history.data.map((row) => {
        const data = row.data;
        const count = typeof data['count'] === 'number' ? data['count'] : null;
        const deleted = row.state === 'deleted' || data['deleted'] === true;
        return (
          <div className="activity-row" key={row.id}>
            <span>
              <strong>
                {deleted
                  ? 'Source deleted'
                  : typeof data['content'] === 'string' && data['content']
                    ? String(data['content']).slice(0, 120)
                    : 'Message content unavailable'}
              </strong>
              <small>
                Source {String(data['sourceMessageId'] ?? row.key)} ·{' '}
                {data['mirrorMessageId'] ? 'mirrored' : 'not mirrored'} ·
                updated{' '}
                {new Date(row.updatedAt ?? row.createdAt).toLocaleString()}
              </small>
            </span>
            {count !== null && <span>{count} ⭐</span>}
          </div>
        );
      })}
    </>
  );
}

export function StarboardPage() {
  const { guildId = '' } = useParams();
  const controller = useFeatureConfig(guildId, 'R36', StarboardConfigSchema);
  const { form } = controller;
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Starboard"
        description="Mirror messages that collect enough reactions. Each member’s vote counts once."
      />
      <LiveEventsNotice what="Reactions are counted" events="reaction events" />
      <ConfigForm
        controller={controller.shell}
        title="Starboard"
        enableLabel="Run the starboard"
      >
        <Card>
          <ChannelField
            form={form}
            name="channelId"
            label="Starboard channel"
            guildId={guildId}
          />
          <div className="form-grid">
            <Field
              label="Reaction emoji"
              htmlFor="starboard-emoji"
              hint="A Unicode emoji or a custom emoji ID."
              error={fieldError(form as never, 'emoji')}
            >
              <Input id="starboard-emoji" {...form.register('emoji')} />
            </Field>
            <NumberField
              form={form}
              name="threshold"
              label="Reactions needed"
              min={1}
              max={1000}
            />
          </div>
          <SwitchField
            form={form}
            name="allowSelf"
            label="Count the author’s own reaction"
          />
          <SelectField
            form={form}
            name="removedVotes"
            label="When reactions are removed"
            options={[
              { value: 'update', label: 'Update the count' },
              { value: 'keep', label: 'Keep the highest count' },
            ]}
          />
          <SelectField
            form={form}
            name="deletePolicy"
            label="When the original message is deleted"
            options={[
              { value: 'delete', label: 'Delete the starboard copy' },
              {
                value: 'tombstone',
                label: 'Replace it with a deletion notice',
              },
            ]}
          />
        </Card>
        <Card>
          <div className="form-grid">
            <ChannelChecklist
              form={form}
              name="excludedChannelIds"
              label="Ignore these channels"
              guildId={guildId}
            />
            <RoleChecklist
              form={form}
              name="excludedRoleIds"
              label="Ignore reactions from these roles"
              guildId={guildId}
            />
          </div>
        </Card>
      </ConfigForm>
      <Card>
        <h2>Starred messages</h2>
        <StarboardHistory guildId={guildId} />
      </Card>
    </>
  );
}
