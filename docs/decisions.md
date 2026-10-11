# Decisions

- Fresh pnpm modular monorepo, React/Vite frontend, Fastify API, one PostgreSQL/Prisma schema, Redis/BullMQ reconstructable effects. No legacy dependencies or imports.
- Node 24.19.0 pinned across tooling and containers. Released Prisma 7.10.0 chosen instead of the registry's Prisma 8 release candidate; released discord.js 14.27.0. Stable strict TypeScript 5.9.3 avoids unverified TS7 migration. One lockfile records compatible package peers.
- Guild owner/Administrator is default management; Manage Server alone never grants management. Delegation is explicit and capabilities are separate from global owner/support.
- Serializability plus PostgreSQL guild advisory locks protects aggregate invariants at initial scale. UUID/opaque issued control IDs and row tenant filters accompany authentication; IDs are not authorization.
- Durable SQL operation idempotency records bind actor+guild+route+request key and request hash. Mutations commit outbox effects in the same transaction. External uncertainty remains visible.
- Feature extension records use versioned typed JSON in a tenant-owned Record table; critical identity, ticket, publication, operation, access and ledger state has dedicated models. Explicit feature routes and Zod schemas enforce invariants; there is no arbitrary action execution endpoint.
- English first, Vietnamese locale and Asia/Ho_Chi_Minh default display timezone, UTC persisted instants. Original yellow #FACC15 assets/UI, dark/light/system modes and reduced motion.
- JSON/Lottie plays in browsers; Discord uses valid PNG/GIF/custom emoji/Unicode. Components V2 never combines content/embeds/poll/stickers.
- Application credentials and live domain cutover are operator setup. Production never loads test/mock data. Support conversations remain global and separate from guild tickets.
- Cloud-runtime skill read at skill://plugin_connector_1p_c5b7d5df5d7081918f2c4be5a633ed5d/cloud-environment-runtime/SKILL.md; no unavailable specialist skill claimed.
- Native Prisma generation/migration is now the documented path. Forward migrations enforce same-guild balanced, immutable ledger entries and fenced OAuth refresh leases; no applied migration is rewritten.
- OAuth refresh, asset storage and Discord delivery claim durable fenced ownership in short database transactions, perform external work outside those transactions, then conditionally commit the outcome. Ambiguous effects stay visible rather than silently repeating.
- Browser acceptance uses actual OAuth/session/API/domain/bot/worker code with a controlled external Discord boundary and separate disposable database. Live Discord/provider evidence is tracked separately.
- Uploaded static images are decoded under byte/pixel limits and re-encoded as metadata-free PNG. Pending and clean metadata both consume tenant storage quota; public sharing requires explicit acknowledgement. Private images cannot be used in public publications.
