-- Initial clean Sparko schema. No legacy data is imported.
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "avatar" TEXT,
  "preferences" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "csrfHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session" ("userId", "expiresAt");

CREATE TABLE "OAuthCredential" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "encryptedToken" TEXT NOT NULL,
  "encryptedRefresh" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);


CREATE TABLE "OAuthState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "verifierHash" TEXT NOT NULL,
  "returnTo" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);


CREATE TABLE "Guild" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "installed" BOOLEAN NOT NULL DEFAULT false,
  "observedAt" TIMESTAMP(3),
  "memberCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE "AccessGrant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "capabilities" TEXT[] NOT NULL,
  "expiresAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "AccessGrant_guildId_subjectType_subjectId_key" ON "AccessGrant" ("guildId", "subjectType", "subjectId");

CREATE TABLE "GlobalGrant" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "capabilities" TEXT[] NOT NULL,
  "expiresAt" TIMESTAMP(3)
);


CREATE TABLE "FeatureConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "featureId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "appliedRevision" INTEGER NOT NULL DEFAULT 0,
  "config" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "FeatureConfig_guildId_featureId_key" ON "FeatureConfig" ("guildId", "featureId");

CREATE TABLE "Record" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "ownerId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'active',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Record_guildId_kind_key_key" ON "Record" ("guildId", "kind", "key");
CREATE INDEX "Record_guildId_kind_createdAt_id_idx" ON "Record" ("guildId", "kind", "createdAt", "id");
CREATE INDEX "Record_guildId_kind_ownerId_state_idx" ON "Record" ("guildId", "kind", "ownerId", "state");

CREATE TABLE "Operation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB,
  "businessStatus" TEXT NOT NULL DEFAULT 'committed',
  "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Operation_guildId_actorId_scope_key_key" ON "Operation" ("guildId", "actorId", "scope", "key");
CREATE INDEX "Operation_guildId_createdAt_id_idx" ON "Operation" ("guildId", "createdAt", "id");

CREATE TABLE "Outbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "operationId" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "fence" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Outbox_state_dueAt_leaseUntil_idx" ON "Outbox" ("state", "dueAt", "leaseUntil");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "operationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_guildId_createdAt_id_idx" ON "AuditLog" ("guildId", "createdAt", "id");

CREATE TABLE "Template" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Template_guildId_createdAt_id_idx" ON "Template" ("guildId", "createdAt", "id");

CREATE TABLE "TemplateVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "document" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TemplateVersion_templateId_number_key" ON "TemplateVersion" ("templateId", "number");

CREATE TABLE "Publication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "messageId" TEXT,
  "document" JSONB NOT NULL,
  "templateVersionId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "appliedRevision" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "test" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Publication_guildId_createdAt_id_idx" ON "Publication" ("guildId", "createdAt", "id");

CREATE TABLE "IssuedControl" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "action" JSONB NOT NULL,
  "actorId" TEXT,
  "revoked" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "IssuedControl_publicationId_key_key" ON "IssuedControl" ("publicationId", "key");

CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "ownerId" TEXT NOT NULL,
  "channelId" TEXT,
  "claimantId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'creating',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  "answers" JSONB NOT NULL,
  "participants" TEXT[] NOT NULL,
  "closeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "Ticket_guildId_number_key" ON "Ticket" ("guildId", "number");
CREATE INDEX "Ticket_guildId_ownerId_state_idx" ON "Ticket" ("guildId", "ownerId", "state");

CREATE TABLE "Transcript" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "messages" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Transcript_guildId_ticketId_idx" ON "Transcript" ("guildId", "ticketId");

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'open',
  "messages" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SupportTicket_ownerId_createdAt_id_idx" ON "SupportTicket" ("ownerId", "createdAt", "id");

CREATE TABLE "Heartbeat" (
  "service" TEXT NOT NULL PRIMARY KEY,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);


CREATE TABLE "LedgerAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'spark',
  "balance" BIGINT NOT NULL DEFAULT 0,
  "system" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "LedgerAccount_guildId_ownerId_currency_key" ON "LedgerAccount" ("guildId", "ownerId", "currency");

CREATE TABLE "LedgerTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "LedgerTransaction_guildId_key_key" ON "LedgerTransaction" ("guildId", "key");

CREATE TABLE "LedgerEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "transactionId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL
);
CREATE INDEX "LedgerEntry_accountId_transactionId_idx" ON "LedgerEntry" ("accountId", "transactionId");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OAuthCredential" ADD CONSTRAINT "OAuthCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeatureConfig" ADD CONSTRAINT "FeatureConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Record" ADD CONSTRAINT "Record_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Operation" ADD CONSTRAINT "Operation_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Outbox" ADD CONSTRAINT "Outbox_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Template" ADD CONSTRAINT "Template_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Publication" ADD CONSTRAINT "Publication_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssuedControl" ADD CONSTRAINT "IssuedControl_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssuedControl" ADD CONSTRAINT "IssuedControl_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerAccount" ADD CONSTRAINT "nonnegative_member_balance" CHECK ("system" OR "balance" >= 0);

ALTER TABLE "FeatureConfig" ADD CONSTRAINT "valid_config_revisions" CHECK ("revision" >= "appliedRevision" AND "appliedRevision" >= 0);

ALTER TABLE "Outbox" ADD CONSTRAINT "valid_job_attempts" CHECK ("attempts" >= 0 AND "fence" >= 0);
CREATE TABLE "AccountRequest" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'requested', "data" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "AccountRequest_userId_kind_createdAt_idx" ON "AccountRequest" ("userId", "kind", "createdAt");
