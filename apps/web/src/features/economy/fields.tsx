import { useQuery } from '@tanstack/react-query';
import {
  Controller,
  useFieldArray,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Field, Input } from '@sparko/ui';
import { fieldError, useRoles } from '../config/fields';
import { getShop } from '../../services/economy';

type Props<T extends FieldValues> = {
  form: UseFormReturn<T, unknown, FieldValues>;
  name: Path<T>;
  label: string;
  hint?: string;
};
const idFor = (name: string) => 'eco-' + name.replace(/\W+/g, '-');

/** Whole virtual units, kept as a decimal string so large values stay exact. */
export function UnitsField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
}: Props<T>) {
  const id = idFor(name);
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={fieldError(form as never, name)}
    >
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        {...form.register(name, {
          setValueAs: (v: unknown) => String(v ?? '').trim(),
        })}
      />
    </Field>
  );
}

const units = { minutes: 60, hours: 3600, days: 86400 } as const;
/** Stores seconds; shows minutes, hours or days, whichever the field uses. */
export function DurationField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  unit = 'minutes',
}: Props<T> & { unit?: keyof typeof units }) {
  const id = idFor(name);
  const factor = units[unit];
  return (
    <Field
      label={`${label} (${unit})`}
      htmlFor={id}
      hint={hint}
      error={fieldError(form as never, name)}
    >
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <input
            className="input"
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            ref={field.ref}
            onBlur={field.onBlur}
            value={
              typeof field.value === 'number'
                ? Math.round((field.value / factor) * 100) / 100
                : ''
            }
            onChange={(e) =>
              field.onChange(
                e.target.value === ''
                  ? undefined
                  : Math.round(Number(e.target.value) * factor),
              )
            }
          />
        )}
      />
    </Field>
  );
}

/** Stores basis points (10000 = 100%); shows a percentage. */
export function PercentField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
}: Props<T>) {
  const id = idFor(name);
  return (
    <Field
      label={`${label} (%)`}
      htmlFor={id}
      hint={hint}
      error={fieldError(form as never, name)}
    >
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <input
            className="input"
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            ref={field.ref}
            onBlur={field.onBlur}
            value={typeof field.value === 'number' ? field.value / 100 : ''}
            onChange={(e) =>
              field.onChange(
                e.target.value === ''
                  ? undefined
                  : Math.round(Number(e.target.value) * 100),
              )
            }
          />
        )}
      />
    </Field>
  );
}

export function useShopItems(guildId: string) {
  return useQuery({
    queryKey: ['economy', guildId, 'shop'],
    queryFn: ({ signal }) => getShop(guildId, signal),
  });
}
/** Picks a shop item by its permanent ID, optionally limited to one type. */
export function ItemSelect<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  guildId,
  type,
}: Props<T> & { guildId: string; type?: string }) {
  const shop = useShopItems(guildId);
  const id = idFor(name);
  const items =
    shop.data?.filter((row) => !type || row.data.type === type) ?? [];
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={fieldError(form as never, name)}
    >
      <select id={id} {...form.register(name)} disabled={shop.isPending}>
        <option value="">
          {shop.isPending
            ? 'Loading items…'
            : items.length
              ? 'Choose an item'
              : 'Add an item in the shop first'}
        </option>
        {items.map((row) => (
          <option key={row.id} value={row.data.itemId}>
            {row.data.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Reward multipliers per role, stored as basis points. */
export function RoleMultipliers<T extends FieldValues>({
  form,
  guildId,
}: {
  form: UseFormReturn<T, unknown, FieldValues>;
  guildId: string;
}) {
  const roles = useRoles(guildId);
  const rows = useFieldArray({
    control: form.control as never,
    name: 'roleMultipliers' as never,
  });
  return (
    <fieldset className="stack">
      <legend>Role multipliers</legend>
      <p className="field-hint">
        Members with a listed role earn more (150% = half again). The highest
        matching multiplier applies, up to the maximum below.
      </p>
      {rows.fields.map((row, index) => (
        <div className="row" key={row.id}>
          <Field
            label={`Role ${index + 1}`}
            htmlFor={`mult-role-${index}`}
            error={fieldError(form as never, `roleMultipliers.${index}.roleId`)}
          >
            <select
              id={`mult-role-${index}`}
              {...form.register(`roleMultipliers.${index}.roleId` as Path<T>)}
            >
              <option value="">Choose a role</option>
              {roles.data?.map((role) => (
                <option key={role.id} value={role.id}>
                  @{role.name}
                </option>
              ))}
            </select>
          </Field>
          <PercentField
            form={form}
            name={`roleMultipliers.${index}.multiplierBps` as Path<T>}
            label="Multiplier"
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove role ${index + 1}`}
            onClick={() => rows.remove(index)}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <div className="row">
        <Button
          type="button"
          variant="secondary"
          disabled={rows.fields.length >= 20}
          onClick={() =>
            rows.append({ roleId: '', multiplierBps: 15000 } as never)
          }
        >
          <Plus size={16} /> Add a role multiplier
        </Button>
      </div>
    </fieldset>
  );
}
