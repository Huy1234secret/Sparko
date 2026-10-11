import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { MessageSquareReply } from 'lucide-react';
import { ReplySchema, replyMatches } from '@sparko/contracts';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import {
  ChannelChecklist,
  NumberField,
  RoleChecklist,
  SelectField,
  fieldError,
} from '../../features/config/fields';
import {
  AutomationSettings,
  OffNotice,
} from '../../features/automation/shared';
import {
  RecordList,
  useRecord,
  useRefreshAutomation,
} from '../../features/automation/RecordList';
import { saveAutomation, type ReplyRecord } from '../../services/automation';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

type ReplyInput = z.input<typeof ReplySchema>;
const matchLabels = {
  exact: 'The whole message is',
  contains: 'The message contains',
  starts_with: 'The message starts with',
};

function Tester({ form }: { form: ReturnType<typeof useReplyForm> }) {
  const [message, setMessage] = useState('');
  const [match, pattern] = useWatch({
    control: form.control,
    name: ['match', 'pattern'],
  });
  const ready = !!pattern?.trim() && !!message;
  const hit = ready && replyMatches({ match, pattern }, message);
  return (
    <Card>
      <h2>Try a message</h2>
      <Field
        label="Message"
        htmlFor="reply-test"
        hint="Matching ignores capital letters and font-style characters, the same way the bot does. Channel, role and cooldown rules also apply in Discord."
      >
        <Input
          id="reply-test"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
      <p role="status">
        {ready ? (
          <Badge tone={hit ? 'success' : 'neutral'}>
            {hit ? 'Sparko would reply' : 'No reply'}
          </Badge>
        ) : (
          <span className="muted">Type a message to test the trigger.</span>
        )}
      </p>
    </Card>
  );
}

function useReplyForm(reply?: ReplyRecord) {
  return useForm<ReplyInput, unknown, z.output<typeof ReplySchema>>({
    resolver: zodResolver(ReplySchema),
    defaultValues: reply
      ? {
          name: reply.data.name,
          match: reply.data.match,
          pattern: reply.data.pattern,
          text: reply.data.text,
          channelIds: reply.data.channelIds,
          excludedRoleIds: reply.data.excludedRoleIds,
          cooldownSeconds: reply.data.cooldownSeconds,
        }
      : {
          name: '',
          match: 'contains',
          pattern: '',
          text: '',
          channelIds: [],
          excludedRoleIds: [],
          cooldownSeconds: 60,
        },
  });
}

function ReplyEditor({
  guildId,
  reply,
  onDone,
}: {
  guildId: string;
  reply?: ReplyRecord;
  onDone: () => void;
}) {
  const identity = useActionIdentity();
  const refresh = useRefreshAutomation(guildId, 'replies');
  const form = useReplyForm(reply);
  const save = useMutation({
    mutationFn: (config: z.output<typeof ReplySchema>) =>
      saveAutomation(
        guildId,
        'replies',
        reply?.id ?? null,
        config,
        reply?.revision,
        identity('reply', { id: reply?.id, config }),
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
        <h2>{reply ? `Edit ${reply.data.name}` : 'Trigger'}</h2>
        <Field
          label="Name"
          htmlFor="reply-name"
          hint="Only staff see this."
          required
          error={form.formState.errors.name?.message}
        >
          <Input id="reply-name" maxLength={100} {...form.register('name')} />
        </Field>
        <div className="form-grid">
          <SelectField
            form={form}
            name="match"
            label="Reply when"
            options={Object.entries(matchLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Field
            label="Words"
            htmlFor="reply-pattern"
            required
            error={form.formState.errors.pattern?.message}
          >
            <Input
              id="reply-pattern"
              maxLength={200}
              {...form.register('pattern')}
            />
          </Field>
        </div>
        <Field
          label="Sparko replies with"
          htmlFor="reply-text"
          required
          error={fieldError(form as never, 'text')}
        >
          <textarea
            id="reply-text"
            maxLength={2000}
            {...form.register('text')}
          />
        </Field>
      </Card>
      <Tester form={form} />
      <Card>
        <h2>Limits</h2>
        <NumberField
          form={form}
          name="cooldownSeconds"
          label="Wait before replying again in the same channel"
          unit="seconds"
          min={5}
          max={86400}
        />
        <ChannelChecklist
          form={form}
          name="channelIds"
          label="Only in these channels"
          hint="Leave empty for every channel Sparko can read."
          guildId={guildId}
        />
        <RoleChecklist
          form={form}
          name="excludedRoleIds"
          label="Never reply to members with these roles"
          guildId={guildId}
        />
      </Card>
      {save.error && <ErrorState message={errorMessage(save.error)} />}
      <div className="save-bar">
        {reply ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel editing
          </Button>
        ) : (
          <span>
            Sparko never replies to bots, webhooks or its own messages, and
            sends at most three replies per message.
          </span>
        )}
        <Button type="submit" busy={save.isPending}>
          {reply ? 'Save reply' : 'Create reply'}
        </Button>
      </div>
    </form>
  );
}

function Replies({ guildId }: { guildId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const reply = useRecord(guildId, 'replies', editing);
  if (editing && reply)
    return (
      <ReplyEditor
        key={reply.id}
        guildId={guildId}
        reply={reply}
        onDone={() => setEditing(null)}
      />
    );
  return (
    <RecordList
      guildId={guildId}
      path="replies"
      icon={MessageSquareReply}
      empty={{
        title: 'No auto replies yet',
        description: 'Create one from the New reply tab.',
      }}
      summary={(row) => ({
        title: row.data.name,
        detail: `${matchLabels[row.data.match]} “${row.data.pattern}” · waits ${row.data.cooldownSeconds}s`,
      })}
      onEdit={setEditing}
    />
  );
}

export function RepliesPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Automations"
        title="Auto replies"
        description="Answer common messages automatically, with cooldowns so channels stay readable."
      />
      <OffNotice guildId={guildId} featureId="R43" noun="Auto replies" />
      <Tabs
        tabs={[
          {
            id: 'replies',
            label: 'Replies',
            content: <Replies guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New reply',
            content: (
              <ReplyEditor
                guildId={guildId}
                onDone={() => setParams({ tab: 'replies' }, { replace: true })}
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R43"
                title="Auto replies"
                description="Needs the Message Content intent so Sparko can read messages."
                enableLabel="Send auto replies"
              />
            ),
          },
        ]}
      />
    </>
  );
}
