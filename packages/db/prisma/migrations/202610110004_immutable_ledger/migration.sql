CREATE FUNCTION sparko_ledger_entry_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are immutable; use reversal transactions' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION sparko_ledger_entry_immutable();
