import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import {
  RoleMenuConfigSchema,
  RoleMenuSchema,
} from '@sparko/messages/community-contracts';
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
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { ConfigForm } from '../../features/config/ConfigForm';
import { Tabs } from '../../features/config/Tabs';
import { DeliveryState } from '../../features/config/DeliveryState';
import {
  ChannelField,
  DocumentField,
  NumberField,
  fieldError,
  useChannels,
  useRoles,
} from '../../features/config/fields';
import { createRoleMenu, getManagedRoleMenus } from '../../services/community';
import { applyServerFieldErrors } from '../../services/formErrors';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

type MenuInput = z.input<typeof RoleMenuSchema>;

function NewMenu({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const roles = useRoles(guildId);
  const assignable =
    roles.data?.filter(
      (role) =>
        !role.managed && role.id !== guildId && role.assignable !== false,
    ) ?? [];
  const form = useForm<MenuInput, unknown, z.output<typeof RoleMenuSchema>>({
    resolver: zodResolver(RoleMenuSchema),
    defaultValues: {
      name: '',
      channelId: '',
      options: [],
      minSelections: 0,
      maxSelections: 1,
    },
  });
  const options = useFieldArray({ control: form.control, name: 'options' });
  const create = useMutation({
    mutationFn: (body: z.output<typeof RoleMenuSchema>) =>
      createRoleMenu(guildId, body, identity('role-menu', body)),
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: () => {
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['role-menus', guildId] });
    },
  });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <Card>
        <Field
          label="Menu name"
          htmlFor="menu-name"
          error={form.formState.errors.name?.message}
        >
          <Input id="menu-name" {...form.register('name')} />
        </Field>
        <ChannelField
          form={form}
          name="channelId"
          label="Channel"
          guildId={guildId}
        />
        <div className="form-grid">
          <NumberField
            form={form}
            name="minSelections"
            label="Minimum picks"
            min={0}
            max={25}
          />
          <NumberField
            form={form}
            name="maxSelections"
            label="Maximum picks"
            min={1}
            max={25}
          />
        </div>
      </Card>
      <Card>
        <h2>Roles in this menu</h2>
        <p className="muted">
          Only roles Sparko can safely grant are offered. Roles with the same
          group are exclusive: picking one removes the others.
        </p>
        {options.fields.map((item, index) => (
          <fieldset className="stack" key={item.id}>
            <legend>Option {index + 1}</legend>
            <div className="form-grid">
              <Field
                label="Role"
                htmlFor={`option-role-${index}`}
                error={fieldError(form as never, `options.${index}.roleId`)}
              >
                <select
                  id={`option-role-${index}`}
                  {...form.register(`options.${index}.roleId`)}
                >
                  {assignable.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Label members see"
                htmlFor={`option-label-${index}`}
                error={fieldError(form as never, `options.${index}.label`)}
              >
                <Input
                  id={`option-label-${index}`}
                  {...form.register(`options.${index}.label`)}
                />
              </Field>
              <Field
                label="Exclusive group (optional)"
                htmlFor={`option-group-${index}`}
              >
                <Input
                  id={`option-group-${index}`}
                  {...form.register(`options.${index}.group`, {
                    setValueAs: (value: string) => value.trim() || undefined,
                  })}
                />
              </Field>
              <Field
                label="Remove after (seconds, optional)"
                htmlFor={`option-expiry-${index}`}
                hint="Between 60 seconds and 30 days."
                error={fieldError(
                  form as never,
                  `options.${index}.expiresSeconds`,
                )}
              >
                <Input
                  id={`option-expiry-${index}`}
                  type="number"
                  min={60}
                  {...form.register(`options.${index}.expiresSeconds`, {
                    setValueAs: (value: string) =>
                      value === '' ? undefined : Number(value),
                  })}
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => options.remove(index)}
            >
              <Trash2 size={16} /> Remove option
            </Button>
          </fieldset>
        ))}
        {form.formState.errors.options?.message && (
          <p className="field-error" role="alert">
            {form.formState.errors.options.message}
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={!assignable.length || options.fields.length >= 25}
          onClick={() => {
            const used = new Set(
              form.getValues('options').map((o) => o.roleId),
            );
            const role =
              assignable.find((candidate) => !used.has(candidate.id)) ??
              assignable[0];
            if (role)
              options.append({
                roleId: role.id,
                label: role.name.slice(0, 80),
                requiredRoleIds: [],
                blockedRoleIds: [],
              });
          }}
        >
          <Plus size={16} /> Add role
        </Button>
        {roles.data && !assignable.length && (
          <p className="field-hint">
            No roles can be granted yet. Create an ordinary role below Sparko’s
            role in Discord’s server settings.
          </p>
        )}
      </Card>
      <Card>
        <DocumentField
          form={form}
          name="document"
          label="Menu message design"
          guildId={guildId}
        />
      </Card>
      {create.error && <ErrorState message={errorMessage(create.error)} />}
      {create.isSuccess && (
        <p role="status">
          Menu saved. It becomes usable once Discord shows it.
        </p>
      )}
      <div className="save-bar">
        <span>Publishing posts a message with a role picker.</span>
        <Button type="submit" busy={create.isPending}>
          Publish menu
        </Button>
      </div>
    </form>
  );
}

function MenuList({ guildId }: { guildId: string }) {
  const channels = useChannels(guildId);
  const menus = useQuery({
    queryKey: ['role-menus', guildId],
    queryFn: ({ signal }) => getManagedRoleMenus(guildId, signal),
    refetchInterval: 5000,
  });
  if (menus.isPending) return <LoadingState />;
  if (menus.error)
    return (
      <ErrorState
        message={errorMessage(menus.error)}
        retry={() => void menus.refetch()}
      />
    );
  if (!menus.data.length)
    return (
      <EmptyState
        title="No role menus"
        description="Publish one from the New menu tab."
      />
    );
  return (
    <Card>
      {menus.data.map((menu) => (
        <div className="activity-row" key={menu.id}>
          <span>
            <strong>{menu.data.name}</strong>
            <small>
              #
              {channels.data?.find((c) => c.id === menu.data.channelId)?.name ??
                menu.data.channelId}{' '}
              · {menu.data.options.map((option) => option.label).join(', ')}
            </small>
          </span>
          <DeliveryState state={menu.state} error={menu.data.deliveryError} />
        </div>
      ))}
    </Card>
  );
}

function MenuSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R16', RoleMenuConfigSchema);
  return (
    <ConfigForm
      controller={controller.shell}
      title="Self-service roles"
      description="Members pick roles from published menus. Each pick rechecks required and blocked roles and Sparko’s role position."
      enableLabel="Allow role menus"
    >
      <span />
    </ConfigForm>
  );
}

export function RoleMenusPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Community"
        title="Let members choose their place."
        description="Publish role pickers with exclusive groups, limits and optional expiry."
      />
      <Tabs
        tabs={[
          {
            id: 'menus',
            label: 'Menus',
            content: <MenuList guildId={guildId} />,
          },
          {
            id: 'new',
            label: 'New menu',
            content: <NewMenu guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: <MenuSettings guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
