-- R23 staff workflow: priority, first-claim time and SLA reminder/escalation markers.
ALTER TABLE "Ticket" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "Ticket" ADD COLUMN "claimedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "remindedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "escalatedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_priority_value"
  CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
