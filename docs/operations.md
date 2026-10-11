# Operations, backup, and recovery

PostgreSQL is the authoritative business store. Redis queues are reconstructed from PostgreSQL outbox records. Private transcripts/files have a separate persistent volume and are not included in a database archive.

## Health and shutdown

`/health/live` identifies the API process; `/health/ready` checks database availability. Public status reports heartbeat observations and unavailable services, without an uptime claim. Container checks inspect current API readiness and fresh bot/worker heartbeats; worker health also requires a ready Redis connection. Review the owner diagnostics' actual outbox states when service state is degraded.

Compose gives each application a 30-second termination grace. Send SIGTERM and allow the process to close Gateway/queue/database connections; do not force-kill a worker routinely. Persisted leases and fences provide recovery after an unavoidable crash. A lease or queue acknowledgement does not prove that an ambiguous external effect failed.

Retry known failed jobs only through authorized narrow recovery paths. An `unknown` external creation requires reconciliation of the actual Discord/provider resource before another creation attempt. Preserve the original idempotency identity after a timeout.

## Database backup

Install `pg_dump`/`pg_restore` matching PostgreSQL major version 17. On a secure host with PostgreSQL 17 clients, private network access to the database, and `DATABASE_URL` configured:

```sh
BACKUP_DIRECTORY=/secure/sparko-backups pnpm backup
```

The command creates a custom `.dump`, `.sha256`, and metadata `.json` with restricted permissions. It passes the database connection through the child environment, not a command-line password, and removes partial archives on dump failure. Metadata contains version/bytes/checksum and no connection credential. Keep archives encrypted at rest and outside the repository/web root. Schedule with the host's credential-aware job runner, alert on failure, and set retention from the operator's actual privacy/recovery policy.

Archive private files separately. Stop or quiesce file-writing workers while capturing the corresponding private volume and database recovery point. Record the two artifact identities together. Verify permissions, checksums, access keys, and restoration of referenced files. Do not expose a private volume through nginx or a public bucket.

## Disposable restore rehearsal

Never rehearse against the production database. Start disposable services from `infra/compose.test.yaml` if the test ports are free. A separate `sparko_restore_test` database is reserved for this procedure:

```sh
RESTORE_FILE=/secure/sparko-backups/ACTUAL_BACKUP.dump TEST_DATABASE_URL=postgresql://sparko:sparko@localhost:55432/sparko_restore_test pnpm restore:verify
```

The command requires the matching SHA-256 sidecar and PostgreSQL custom format, restores atomically with `pg_restore --single-transaction`, and verifies core relations, balanced ledger transactions, and account balances. Test target validation refuses production/remote URLs. The restore contains the archive's schema and records; it does not start bot/worker or execute effects. Keep those services stopped on restored data until operator reconciliation prevents delivery replay.

This rehearsal verifies database consistency, not every provider resource or missing file. Restore the paired private volume into an isolated location, check referenced files/download policy, rehearse forward migrations on the recovered database, and run staging acceptance before promoting recovery.

## Secrets and retention

Use independent keys per purpose. Sessions use random opaque tokens with hashes stored in PostgreSQL. Rotating the currently validated `SESSION_SECRET` setting alone does not revoke them; use the authorized session-revocation flow and revoke OAuth grants deliberately when needed. Token encryption rotation requires a reviewed re-encryption procedure or clearing/reconnecting encrypted provider credentials before changing the active key. Retain old decryption keys only in a protected rotation window; no raw key belongs in exports/logs.

Preserve audit/business records according to the disclosed enabled-feature policy. A deletion request or bot removal does not authorize ad hoc deletion of the database or private storage. Record backup retention, private-media retention, and provider sharing in the operator-reviewed legal policy before live release.
