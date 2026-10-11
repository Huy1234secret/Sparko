ALTER TABLE "LedgerAccount" DROP CONSTRAINT "nonnegative_member_balance";
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "bounded_ledger_balance"
  CHECK ("balance" BETWEEN -9000000000000000000 AND 9000000000000000000);
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "issuer_only_negative_balance"
  CHECK ("balance" >= 0 OR ("system" AND "ownerId" = '@issuer'));
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "valid_ledger_owner"
  CHECK ((NOT "system" AND "ownerId" ~ '^[0-9]{17,20}$') OR
    ("system" AND "ownerId" ~ '^@(issuer|sink|escrow:[a-z]+:[a-zA-Z0-9-]{1,128})$'));

-- Scope equality is verified before accepting any entry, even through direct SQL.
CREATE FUNCTION sparko_ledger_entry_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "guildId" FROM "LedgerAccount" WHERE "id" = NEW."accountId")
     IS DISTINCT FROM
     (SELECT "guildId" FROM "LedgerTransaction" WHERE "id" = NEW."transactionId") THEN
    RAISE EXCEPTION 'ledger entry tenant mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entry_scope BEFORE INSERT OR UPDATE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION sparko_ledger_entry_scope();

-- A transaction may insert its postings in multiple statements, but commit must balance.
CREATE FUNCTION sparko_ledger_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD."transactionId";
  ELSE target := NEW."transactionId"; END IF;
  IF EXISTS (SELECT 1 FROM "LedgerTransaction" WHERE "id" = target) AND
     (SELECT COALESCE(SUM("amount"), 0) FROM "LedgerEntry" WHERE "transactionId" = target) <> 0 THEN
    RAISE EXCEPTION 'ledger transaction is unbalanced' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT OR UPDATE OR DELETE ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sparko_ledger_balanced();
