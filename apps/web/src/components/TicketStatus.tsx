import { Badge } from '@sparko/ui';

const statuses: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  open: { label: 'Waiting for staff', tone: 'warning' },
  claimed: { label: 'Claimed', tone: 'info' },
  awaiting_member: { label: 'Waiting for the member', tone: 'neutral' },
  awaiting_staff: { label: 'Waiting for staff', tone: 'warning' },
  closing: { label: 'Closing', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
  creating: { label: 'Creating in Discord', tone: 'warning' },
  capture_failed: { label: 'Transcript capture failed', tone: 'danger' },
  failed: { label: 'Creation failed', tone: 'danger' },
};
/** Plain-language ticket lifecycle state; unknown states show as stored. */
export function ticketStatus(status: string) {
  return (
    statuses[status] ?? {
      label: status.replaceAll('_', ' '),
      tone: status.includes('fail')
        ? ('danger' as const)
        : ('neutral' as const),
    }
  );
}
export function TicketStatusBadge({ status }: { status: string }) {
  const { label, tone } = ticketStatus(status);
  return <Badge tone={tone}>{label}</Badge>;
}
