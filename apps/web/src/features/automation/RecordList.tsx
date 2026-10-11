import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '@sparko/ui';
import {
  disableAutomation,
  listAutomation,
  type CrudPath,
} from '../../services/automation';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';
import { StateBadge } from './shared';

type Row = {
  id: string;
  state: string;
  revision: number;
};
/**
 * Active and turned-off configurations of one automation kind. Turning one
 * off keeps its history; edits apply only to active ones.
 */
export function RecordList<P extends CrudPath>({
  guildId,
  path,
  icon,
  empty,
  summary,
  onEdit,
  actions,
}: {
  guildId: string;
  path: P;
  icon: LucideIcon;
  empty: { title: string; description: string };
  summary: (row: Awaited<ReturnType<typeof listAutomation<P>>>[number]) => {
    title: ReactNode;
    detail: ReactNode;
  };
  onEdit?: (id: string) => void;
  actions?: (
    row: Awaited<ReturnType<typeof listAutomation<P>>>[number],
  ) => ReactNode;
}) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: [path, guildId],
    queryFn: ({ signal }) => listAutomation(guildId, path, signal),
  });
  const disable = useMutation({
    mutationFn: (row: Row) =>
      disableAutomation(
        guildId,
        path,
        row.id,
        row.revision,
        identity(`${path}-off`, row.id),
      ),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: [path, guildId] }),
  });
  if (list.isPending) return <LoadingState />;
  if (list.error)
    return (
      <ErrorState
        message={errorMessage(list.error)}
        retry={() => void list.refetch()}
      />
    );
  if (!list.data.length) return <EmptyState icon={icon} {...empty} />;
  return (
    <Card>
      {list.data.map((row) => {
        const { title, detail } = summary(row);
        return (
          <div className="activity-row" key={row.id}>
            <span>
              <strong className="wrap-anywhere">{title}</strong>
              <small>{detail}</small>
            </span>
            <span className="row">
              <StateBadge state={row.state} />
              {row.state === 'active' && (
                <>
                  {actions?.(row)}
                  {onEdit && (
                    <Button variant="secondary" onClick={() => onEdit(row.id)}>
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    busy={disable.isPending && disable.variables?.id === row.id}
                    onClick={() => disable.mutate(row)}
                  >
                    Turn off
                  </Button>
                </>
              )}
            </span>
          </div>
        );
      })}
      {disable.error && <ErrorState message={errorMessage(disable.error)} />}
    </Card>
  );
}

/** The record being edited, from the shared list cache. */
export function useRecord<P extends CrudPath>(
  guildId: string,
  path: P,
  id: string | null,
) {
  const list = useQuery({
    queryKey: [path, guildId],
    queryFn: ({ signal }) => listAutomation(guildId, path, signal),
    enabled: !!id,
  });
  return id ? list.data?.find((row) => row.id === id) : undefined;
}

export function useRefreshAutomation(guildId: string, path: CrudPath) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: [path, guildId] });
}
