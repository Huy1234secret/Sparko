import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Headphones } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import {
  ChannelField,
  NumberField,
  fieldError,
} from '../../features/config/fields';
import {
  AutomationSettings,
  OffNotice,
  StateBadge,
} from '../../features/automation/shared';
import {
  controlVoiceRoom,
  getVoiceRooms,
  type VoiceControl,
  type VoiceRoomRecord,
} from '../../services/automation';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';
import { useSession } from '../../components/AppShell';

const snowflake = /^\d{17,20}$/;

/** Owner controls. Discord applies each change; the room shows it once done. */
export function VoiceRoomControls({
  guildId,
  room,
}: {
  guildId: string;
  room: VoiceRoomRecord;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [name, setName] = useState(room.data.name);
  const [limit, setLimit] = useState(String(room.data.userLimit));
  const [member, setMember] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const control = useMutation({
    mutationFn: (body: Omit<VoiceControl, 'expectedRevision'>) => {
      const full = { ...body, expectedRevision: room.revision };
      return controlVoiceRoom(guildId, room.id, full, identity('voice', full));
    },
    onSuccess: () => {
      setMember('');
      void queryClient.invalidateQueries({
        queryKey: ['voice-rooms', guildId],
      });
    },
  });
  const memberOk = snowflake.test(member.trim());
  const busy = (action: string) =>
    control.isPending && control.variables?.action === action;
  return (
    <div className="stack">
      <div className="form-grid">
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim())
              control.mutate({ action: 'rename', name: name.trim() });
          }}
        >
          <Field label="Room name" htmlFor={`room-name-${room.id}`}>
            <Input
              id={`room-name-${room.id}`}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary" busy={busy('rename')}>
            Rename
          </Button>
        </form>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            control.mutate({ action: 'limit', limit: Number(limit) || 0 });
          }}
        >
          <Field
            label="People allowed"
            htmlFor={`room-limit-${room.id}`}
            hint="0 means no limit."
          >
            <Input
              id={`room-limit-${room.id}`}
              type="number"
              min={0}
              max={99}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary" busy={busy('limit')}>
            Set limit
          </Button>
        </form>
      </div>
      <div className="row">
        <Button
          variant="secondary"
          busy={busy('lock')}
          onClick={() => control.mutate({ action: 'lock' })}
        >
          Lock room
        </Button>
        <Button
          variant="secondary"
          busy={busy('unlock')}
          onClick={() => control.mutate({ action: 'unlock' })}
        >
          Unlock room
        </Button>
      </div>
      <Field
        label="Member ID"
        htmlFor={`room-member-${room.id}`}
        hint="Right-click a member in Discord and copy their user ID (Developer Mode)."
      >
        <Input
          id={`room-member-${room.id}`}
          inputMode="numeric"
          value={member}
          onChange={(event) => setMember(event.target.value)}
        />
      </Field>
      <div className="row">
        {(['permit', 'revoke', 'transfer'] as const).map((action) => (
          <Button
            key={action}
            variant="secondary"
            disabled={!memberOk}
            busy={busy(action)}
            onClick={() => control.mutate({ action, userId: member.trim() })}
          >
            {action === 'permit'
              ? 'Let them in'
              : action === 'revoke'
                ? 'Remove their access'
                : 'Make them the owner'}
          </Button>
        ))}
      </div>
      {confirmDelete ? (
        <div className="row">
          <Button
            variant="danger"
            busy={busy('delete')}
            onClick={() => control.mutate({ action: 'delete', confirm: true })}
          >
            Delete the room now
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <div className="row">
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Delete room…
          </Button>
        </div>
      )}
      {control.error && <ErrorState message={errorMessage(control.error)} />}
    </div>
  );
}

export function VoiceRoomList({
  guildId,
  mineOnly = false,
}: {
  guildId: string;
  mineOnly?: boolean;
}) {
  const session = useSession();
  const me = session.data?.user?.id;
  const rooms = useQuery({
    queryKey: ['voice-rooms', guildId],
    queryFn: ({ signal }) => getVoiceRooms(guildId, signal),
    refetchInterval: 10000,
  });
  if (rooms.isPending) return <LoadingState />;
  if (rooms.error) return <ErrorState message={errorMessage(rooms.error)} />;
  const shown = rooms.data.filter(
    (room) =>
      ['creating', 'active', 'deleting'].includes(room.state) &&
      (!mineOnly || room.ownerId === me),
  );
  if (!shown.length)
    return (
      <EmptyState
        compact
        icon={Headphones}
        title="No rooms right now"
        description="Join the lobby voice channel in Discord to get a room of your own."
      />
    );
  return (
    <div className="stack">
      {shown.map((room) => (
        <div className="stack" key={room.id}>
          <div className="section-heading">
            <div>
              <h3 className="wrap-anywhere">{room.data.name}</h3>
              <p className="muted">
                {room.ownerId === me ? 'Yours' : `Owner ${room.ownerId}`} ·{' '}
                {room.data.occupants.length} inside
                {room.data.userLimit ? ` · limit ${room.data.userLimit}` : ''}
              </p>
            </div>
            <StateBadge state={room.state} />
          </div>
          {room.ownerId === me && room.state === 'active' && (
            <VoiceRoomControls guildId={guildId} room={room} />
          )}
        </div>
      ))}
    </div>
  );
}

export function VoicePage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Temporary voice"
        description="Members join a lobby to get their own voice room. Empty rooms are cleaned up after a short delay."
      />
      <OffNotice guildId={guildId} featureId="R39" noun="Temporary rooms" />
      <Tabs
        tabs={[
          {
            id: 'rooms',
            label: 'Rooms',
            content: (
              <Card>
                <VoiceRoomList guildId={guildId} />
              </Card>
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R39"
                title="Temporary voice"
                description="Sparko needs Manage Channels and Move Members in the room category."
                enableLabel="Create rooms from the lobby"
              >
                {(form) => (
                  <Card>
                    <div className="form-grid">
                      <ChannelField
                        form={form}
                        name="lobbyChannelId"
                        label="Lobby voice channel"
                        hint="Joining it creates a room and moves the member in."
                        types={[2]}
                        placeholder="Choose a voice channel"
                        guildId={guildId}
                      />
                      <ChannelField
                        form={form}
                        name="categoryId"
                        label="Create rooms in"
                        types={[4]}
                        placeholder="Same place as the lobby"
                        guildId={guildId}
                      />
                      <Field
                        label="Room name"
                        htmlFor="voice-name-template"
                        hint="{member} becomes the member’s display name."
                        error={fieldError(form as never, 'nameTemplate')}
                      >
                        <Input
                          id="voice-name-template"
                          maxLength={80}
                          {...form.register('nameTemplate')}
                        />
                      </Field>
                      <NumberField
                        form={form}
                        name="userLimit"
                        label="Default people allowed"
                        hint="0 means no limit."
                        min={0}
                        max={99}
                      />
                      <NumberField
                        form={form}
                        name="cleanupDelaySeconds"
                        label="Delete empty rooms after"
                        unit="seconds"
                        hint="Sparko checks the room is still empty before deleting it."
                        min={5}
                        max={300}
                      />
                    </div>
                  </Card>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}

/** Member portal: shown only while the member owns a room. */
export function VoiceRoomCard({ guildId }: { guildId: string }) {
  const session = useSession();
  const rooms = useQuery({
    queryKey: ['voice-rooms', guildId],
    queryFn: ({ signal }) => getVoiceRooms(guildId, signal),
  });
  const mine = rooms.data?.some(
    (room) =>
      room.ownerId === session.data?.user?.id &&
      ['creating', 'active'].includes(room.state),
  );
  if (!mine) return null;
  return (
    <Card>
      <h2>
        <Headphones size={18} aria-hidden="true" /> Your voice room
      </h2>
      <VoiceRoomList guildId={guildId} mineOnly />
    </Card>
  );
}
