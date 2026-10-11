import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormRegisterReturn,
} from 'react-hook-form';
import type { UseQueryResult } from '@tanstack/react-query';
import type { FeatureConfig } from '../../services/guilds';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { getConfig, saveConfig } from '../../services/guilds';
import { ApiError, type ApiFieldError } from '../../services/http';
import { applyServerFieldErrors } from '../../services/formErrors';
import { useActionIdentity } from '../../hooks/useActionIdentity';

/**
 * Typed configuration for one feature: loads the saved revision, binds a
 * react-hook-form instance validated by the shared contract, and saves with
 * optimistic revision, idempotency and server field errors.
 */
export function useFeatureConfig<
  Input extends FieldValues,
  Output extends FieldValues,
>(guildId: string, featureId: string, schema: z.ZodType<Output, Input>) {
  const queryClient = useQueryClient();
  const identity = useActionIdentity();
  const [unmatched, setUnmatched] = useState<ApiFieldError[]>([]);
  const queryKey = ['config', guildId, featureId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getConfig(guildId, featureId, signal),
  });
  const defaults = (stored: unknown): Input => {
    const parsed = schema.safeParse(stored ?? {});
    return (parsed.success
      ? parsed.data
      : schema.parse({})) as unknown as Input;
  };
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema as never),
    defaultValues: defaults({}) as never,
  });
  const dirty = form.formState.isDirty;
  useEffect(() => {
    if (query.data && !dirty) form.reset(defaults(query.data.config) as never);
  }, [query.data, dirty]);
  const save = useMutation({
    mutationFn: (config: Output) => {
      const body = {
        expectedRevision: query.data?.revision ?? 0,
        config: { ...query.data?.config, ...config },
      };
      return saveConfig(
        guildId,
        featureId,
        body,
        identity('config:' + featureId, body),
      );
    },
    onMutate: () => setUnmatched([]),
    onError: (error) => setUnmatched(applyServerFieldErrors(form, error)),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result.data);
      form.reset(defaults(result.data.config) as never);
      void queryClient.invalidateQueries({ queryKey: ['overview', guildId] });
    },
  });
  const submit = form.handleSubmit((values) => save.mutate(values));
  const conflict =
    save.error instanceof ApiError && save.error.code === 'REVISION_CONFLICT';
  const reload = () => {
    form.reset(defaults(query.data?.config) as never);
    save.reset();
    void query.refetch();
  };
  const shell: FeatureConfigController = {
    query,
    save,
    submit: () => submit(),
    conflict,
    unmatched,
    reload,
    dirty,
    enabledField: form.register('enabled' as Path<Input>),
  };
  return { ...shell, form, shell };
}
/** The schema-independent part a page shell needs. */
export type FeatureConfigController = {
  query: UseQueryResult<FeatureConfig>;
  save: {
    error: unknown;
    isPending: boolean;
    isSuccess: boolean;
    data?: { data: FeatureConfig } | undefined;
  };
  submit: () => Promise<void>;
  conflict: boolean;
  unmatched: ApiFieldError[];
  reload: () => void;
  dirty: boolean;
  enabledField: UseFormRegisterReturn;
};
