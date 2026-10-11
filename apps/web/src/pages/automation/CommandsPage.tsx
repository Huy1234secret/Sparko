import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SquareSlash } from 'lucide-react';
import { CustomCommandSchema } from '@sparko/contracts';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import { RoleChecklist, SelectField } from '../../features/config/fields';
import {
  AutomationSettings,
  OffNotice,
} from '../../features/automation/shared';
import {
  RecordList,
  useRecord,
  useRefreshAutomation,
} from '../../features/automation/RecordList';
import {
  listAutomation,
  saveAutomation,
  type CustomCommandRecord,
} from '../../services/automation';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

/** Staff type the part after `spark-`; the prefix keeps commands apart from Sparko’s own. */
const CommandForm = z.object({
  suffix: z
    .string()
    .regex(
      /^[a-z0-9-]{1,25}$/,
      'Use 1–25 lowercase letters, numbers or hyphens.',
    ),
  description: z.string().trim().min(1, 'Describe what it does.').max(100),
  requiredRoleIds: z.array(z.string()),
  workflowId: z.string().min(1, 'Choose a workflow.'),
});
type CommandInput = z.input<typeof CommandForm>;
const registration: Record<string, string> = {
  pending: 'Registering with Discord',
  applied: 'Ready in Discord',
};

function CommandEditor({
  guildId,
  command,
  onDone,
}: {
  guildId: string;
  command?: CustomCommandRecord;
  onDone: () => void;
}) {
  const identity = useActionIdentity();
  const refresh = useRefreshAutomation(guildId, 'custom-commands');
  const workflows = useQuery({
    queryKey: ['workflows', guildId],
    queryFn: ({ signal }) => listAutomation(guildId, 'workflows', signal),
  });
  const active = workflows.data?.filter((row) => row.state === 'active') ?? [];
  const form = useForm<CommandInput, unknown, z.output<typeof CommandForm>>({
    resolver: zodResolver(CommandForm),
    defaultValues: {
      suffix: command?.data.name.replace(/^spark-/, '') ?? '',
      description: command?.data.description ?? '',
      requiredRoleIds: command?.data.requiredRoleIds ?? [],
      workflowId: command?.data.workflowId ?? '',
    },
  });
  const save = useMutation({
    mutationFn: ({ suffix, ...rest }: z.output<typeof CommandForm>) => {
      const config = CustomCommandSchema.parse({
        ...rest,
        name: `spark-${suffix}`,
      });
      return saveAutomation(
        guildId,
        'custom-commands',
        command?.id ?? null,
        config,
        command?.revision,
        identity('command', { id: command?.id, config }),
      );
    },
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
        <h2>{command ? `Edit /${command.data.name}` : 'Command'}</h2>
        <Field
          label="Command name"
          htmlFor="command-suffix"
          hint={
            command
              ? 'To rename a command, turn this one off and create a new one.'
              : 'Members type /spark- followed by this.'
          }
          required
          error={form.formState.errors.suffix?.message}
        >
          <div className="input-prefix">
            <span aria-hidden="true">/spark-</span>
            <Input
              id="command-suffix"
              maxLength={25}
              autoCapitalize="none"
              readOnly={!!command}
              {...form.register('suffix')}
            />
          </div>
        </Field>
        <Field
          label="Description members see"
          htmlFor="command-description"
          required
          error={form.formState.errors.description?.message}
        >
          <Input
            id="command-description"
            maxLength={100}
            {...form.register('description')}
          />
        </Field>
        <SelectField
          form={form}
          name="workflowId"
          label="Runs the workflow"
          hint={
            workflows.isPending
              ? 'Loading workflows…'
              : active.length
                ? 'The workflow runs for the member who used the command.'
                : 'Create an active workflow first.'
          }
          options={[
            { value: '', label: 'Choose a workflow' },
            ...active.map((row) => ({ value: row.id, label: row.data.name })),
          ]}
        />
        <RoleChecklist
          form={form}
          name="requiredRoleIds"
          label="Only members with all of these roles can use it"
          guildId={guildId}
        />
      </Card>
      {save.error && <ErrorState message={errorMessage(save.error)} />}
      <div className="save-bar">
        {command ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel editing
          </Button>
        ) : (
          <span>Up to 20 commands per server.</span>
        )}
        <Button type="submit" busy={save.isPending}>
          {command ? 'Save command' : 'Create command'}
        </Button>
      </div>
    </form>
  );
}

function Commands({ guildId }: { guildId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const command = useRecord(guildId, 'custom-commands', editing);
  if (editing && command)
    return (
      <CommandEditor
        key={command.id}
        guildId={guildId}
        command={command}
        onDone={() => setEditing(null)}
      />
    );
  return (
    <RecordList
      guildId={guildId}
      path="custom-commands"
      icon={SquareSlash}
      empty={{
        title: 'No custom commands',
        description: 'Create one from the New command tab.',
      }}
      summary={(row) => ({
        title: `/${row.data.name}`,
        detail: `${row.data.description} · ${
          registration[row.data.registrationState] ?? row.data.registrationState
        }`,
      })}
      onEdit={setEditing}
    />
  );
}

export function CommandsPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  return (
    <>
      <PageHeading
        eyebrow="Automations"
        title="Custom commands"
        description="Give members a slash command that runs one of your workflows."
      />
      <OffNotice guildId={guildId} featureId="R46" noun="Custom commands" />
      <Notice tone="info" title="Commands only run workflows">
        A command cannot run code or reply with arbitrary content; it starts a
        workflow for the member who used it, with the same role checks and
        action limit as any other run.
      </Notice>
      <Tabs
        tabs={[
          {
            id: 'commands',
            label: 'Commands',
            content: <Commands guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New command',
            content: (
              <CommandEditor
                guildId={guildId}
                onDone={() => setParams({ tab: 'commands' }, { replace: true })}
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R46"
                title="Custom commands"
                description="Discord can take a minute to show new or changed commands."
                enableLabel="Allow custom commands"
              />
            ),
          },
        ]}
      />
    </>
  );
}
