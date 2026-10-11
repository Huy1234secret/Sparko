import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Pin } from 'lucide-react';
import { StickySchema } from '@sparko/contracts';
import { Button, Card, ErrorState, PageHeading } from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import { ChannelField, NumberField } from '../../features/config/fields';
import { TemplateVersionField } from '../../features/automation/fields';
import {
  AutomationSettings,
  ChannelName,
  OffNotice,
} from '../../features/automation/shared';
import {
  RecordList,
  useRecord,
  useRefreshAutomation,
} from '../../features/automation/RecordList';
import { saveAutomation, type StickyRecord } from '../../services/automation';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

type StickyInput = z.input<typeof StickySchema>;

function StickyEditor({
  guildId,
  sticky,
  onDone,
}: {
  guildId: string;
  sticky?: StickyRecord;
  onDone: () => void;
}) {
  const identity = useActionIdentity();
  const refresh = useRefreshAutomation(guildId, 'sticky');
  const form = useForm<StickyInput, unknown, z.output<typeof StickySchema>>({
    resolver: zodResolver(StickySchema),
    defaultValues: {
      channelId: sticky?.data.channelId ?? '',
      templateVersionId: sticky?.data.templateVersionId ?? '',
      debounceSeconds: sticky?.data.debounceSeconds ?? 15,
    },
  });
  const save = useMutation({
    mutationFn: (config: z.output<typeof StickySchema>) =>
      saveAutomation(
        guildId,
        'sticky',
        sticky?.id ?? null,
        config,
        sticky?.revision,
        identity('sticky', { id: sticky?.id, config }),
      ),
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Card>
        <h2>{sticky ? 'Edit sticky message' : 'Sticky message'}</h2>
        {sticky ? (
          <p className="muted">
            In <ChannelName guildId={guildId} id={sticky.data.channelId} />. To
            move it, turn this one off and create a new one.
          </p>
        ) : (
          <ChannelField
            form={form}
            name="channelId"
            label="Channel"
            hint="One sticky message per channel."
            guildId={guildId}
          />
        )}
        <TemplateVersionField
          form={form}
          name="templateVersionId"
          label="Design"
          hint="Public designs from Message Studio. The current version is copied when you save."
          guildId={guildId}
        />
        <NumberField
          form={form}
          name="debounceSeconds"
          label="Wait for the channel to go quiet"
          unit="seconds"
          hint="Sparko reposts after this pause, so busy chats don’t get a repost per message. It removes only the copy it posted last."
          min={5}
          max={300}
        />
      </Card>
      {save.error && <ErrorState message={errorMessage(save.error)} />}
      <div className="save-bar">
        {sticky ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel editing
          </Button>
        ) : (
          <span>
            The message appears after the next activity in the channel.
          </span>
        )}
        <Button type="submit" busy={save.isPending}>
          {sticky ? 'Save sticky message' : 'Create sticky message'}
        </Button>
      </div>
    </form>
  );
}

function StickyList({ guildId }: { guildId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const sticky = useRecord(guildId, 'sticky', editing);
  if (editing && sticky)
    return (
      <StickyEditor
        key={sticky.id}
        guildId={guildId}
        sticky={sticky}
        onDone={() => setEditing(null)}
      />
    );
  return (
    <RecordList
      guildId={guildId}
      path="sticky"
      icon={Pin}
      empty={{
        title: 'No sticky messages',
        description:
          'Keep a message at the bottom of a channel from the New tab.',
      }}
      summary={(row) => ({
        title: <ChannelName guildId={guildId} id={row.data.channelId} />,
        detail: `${row.data.document?.name ?? 'Message'} · reposts after ${row.data.debounceSeconds}s of quiet${row.data.deliveryError ? ` · last repost failed: ${row.data.deliveryError}` : ''}`,
      })}
      onEdit={setEditing}
    />
  );
}

export function StickyPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Automations"
        title="Sticky messages"
        description="Keep one message at the bottom of a channel by reposting it when the channel goes quiet."
      />
      <OffNotice guildId={guildId} featureId="R44" noun="Sticky messages" />
      <Tabs
        tabs={[
          {
            id: 'sticky',
            label: 'Sticky messages',
            content: <StickyList guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New',
            content: (
              <StickyEditor
                guildId={guildId}
                onDone={() => setParams({ tab: 'sticky' }, { replace: true })}
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R44"
                title="Sticky messages"
                description="Sparko needs to send messages and manage its own messages in each channel."
                enableLabel="Keep sticky messages"
              />
            ),
          },
        ]}
      />
    </>
  );
}
