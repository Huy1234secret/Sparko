-- Product support status lifecycle and private screenshot attachments. Images are
-- re-encoded before storage and are deleted with their support request.
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_state_value"
  CHECK ("state" IN ('open', 'waiting_on_user', 'resolved', 'closed'));
CREATE TABLE "SupportAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportAttachment_ticketId_idx" ON "SupportAttachment" ("ticketId");
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_bytes_limit" CHECK ("bytes" > 0 AND "bytes" <= 4194304 AND octet_length("data") = "bytes");
