-- Owner feature policy is stored apart from server configuration, so a server
-- manager's save can never clear a block placed by Sparko staff.
CREATE TABLE "FeaturePolicy" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeaturePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeaturePolicy_guildId_featureId_key" ON "FeaturePolicy" ("guildId", "featureId");
ALTER TABLE "FeaturePolicy" ADD CONSTRAINT "FeaturePolicy_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeaturePolicy" ADD CONSTRAINT "FeaturePolicy_reason_present" CHECK (length(trim("reason")) >= 3);
