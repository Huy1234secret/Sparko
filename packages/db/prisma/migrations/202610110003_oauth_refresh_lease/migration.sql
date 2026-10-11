ALTER TABLE "OAuthCredential" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refreshLeaseId" TEXT,
  ADD COLUMN "refreshLeaseUntil" TIMESTAMP(3);
ALTER TABLE "OAuthCredential" ADD CONSTRAINT "valid_refresh_lease"
  CHECK (("refreshLeaseId" IS NULL) = ("refreshLeaseUntil" IS NULL));
ALTER TABLE "OAuthCredential" ADD CONSTRAINT "valid_credential_revision" CHECK ("revision" >= 0);
