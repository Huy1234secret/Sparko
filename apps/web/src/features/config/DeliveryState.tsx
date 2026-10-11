import { Badge } from '@sparko/ui';

const labels: Record<string, string> = {
  publishing: 'Waiting for Discord',
  open: 'Open',
  published: 'Published',
  failed: 'Delivery failed',
  expired: 'Expired',
  exhausted: 'All claimed',
  ended: 'Ended',
  drawn: 'Drawn',
  cancelled: 'Cancelled',
  active: 'Active',
};
/** Business state with the actual Discord delivery outcome beside it. */
export function DeliveryState({
  state,
  error,
}: {
  state: string;
  error?: string | undefined;
}) {
  const tone =
    state === 'failed'
      ? 'danger'
      : ['publishing', 'pending'].includes(state)
        ? 'warning'
        : ['open', 'published', 'active'].includes(state)
          ? 'success'
          : 'neutral';
  return (
    <span className="status-line">
      <Badge tone={tone}>{labels[state] ?? state}</Badge>
      {error && <small className="field-error">{error}</small>}
    </span>
  );
}
