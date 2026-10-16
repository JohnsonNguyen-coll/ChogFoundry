# Supabase primary database

User decision: Supabase PostgreSQL is the primary database. Runtime studio profiles and indexed market history use PostgreSQL. SQLite files are retained for read-only legacy import and explicit local storage tests. There is no automatic SQLite fallback or dual write. Wallet sessions/challenges remain in RAM and expire on restart; this does not implement multi-instance authentication.

## Connect

1. Open the intended Supabase project and choose Connect. For this persistent Node backend, use the direct connection when reachable, or Session pooler for IPv4-only hosting. Copy the actual supplied connection string; do not compose a host from a project ref/region.
2. Copy backend/.env.example to backend/.env and set SUPABASE_DATABASE_URL to the PostgreSQL connection string. Replace the password placeholder locally and percent-encode reserved password characters. This is a database connection string, not an anon/publishable key or service-role API key. Do not send credentials in chat or put them in frontend environment variables.
3. TLS verification is enabled. If your project requires its downloadable CA certificate, place it in a private local path and set SUPABASE_DB_CA_PATH. The application does not disable certificate validation.
4. From the repository root run npm run db:migrate, then npm run db:check. Alternatively, review/run backend/supabase/migrations/001_foundry.sql in Supabase SQL Editor. No application seed data is inserted. Then restart npm run dev.

The dedicated foundry schema contains studio_profiles, studio_revisions, market_indexes, market_chunks and market_windows, plus schema_migrations. Select that schema in the Supabase table viewer. Tables have RLS enabled and no grants/policies for anon or authenticated roles. Backend connections use the supplied privileged database owner; never expose that credential to a browser. A dedicated least-privilege backend login is a deployment hardening step requiring deliberate role/policy configuration.

Missing connection returns SUPABASE_NOT_CONFIGURED. Failed connections/transactions return DATABASE_UNAVAILABLE. /api/health reports storage provider/configuration only, not a successful DB ping; db:check is the actual connection/schema check. Application endpoints never log raw database errors or credentials.

## Existing SQLite data

Stop all API/indexer writers before import. Keep the old files under backend/data/; do not delete them. Run npm run db:import-sqlite for a dry-run count. After the target schema is migrated, run npm run db:import-sqlite -- --apply to create consistent VACUUM INTO backups and copy both profile/revision records and canonical market state. The import uses one PostgreSQL transaction and requires an empty Foundry target. Existing cloud rows are not overwritten. Profile authors, revision history, block hashes, deployment anchors and raw token amounts are preserved. Fork/test market data is rejected as production history. Resume the backend only after the import and db:check succeed.

This is a one-time transfer, not continuous SQLite/Supabase mirroring. Supabase is authoritative afterwards. Market caches and chart/holder derivations continue to come from canonical onchain logs; changing storage does not create a deployed token or grant wallet/NFT authority.

## Verification scope

The migration and PostgreSQL repository SQL execute against a real PGlite PostgreSQL WASM engine in tests. No SQL response mocks are used. Profile revision conflicts and browser-role denial are tested. Actual Monad fork events exercise the PostgreSQL market repository, transactional checkpoint gap rejection, rollback and rebuild. Local engine validation does not prove a hosted Supabase connection, production TLS, Supavisor behavior or multi-worker operation. Those need the actual project configuration and db:check/live operation. PGlite is a dev dependency only and never a runtime substitute for Supabase.

Official references: [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), [node-postgres transactions](https://node-postgres.com/features/transactions), [node-postgres SSL](https://node-postgres.com/features/ssl), [PGlite engine documentation](https://pglite.dev/docs/).


## Prepared local environment — 2026-10-16

Ignored backend/.env has been created from backend/.env.example without credentials. Fill SUPABASE_DATABASE_URL from your actual project's Connect panel (direct or Session pooler), optionally SUPABASE_DB_CA_PATH if the project requires a CA file, and FOUNDRY_DEPLOYER_ADDRESS with your public Monad wallet address. The user selected this same wallet as platform treasury. Never put a private key in this file. Leave Foundry factory/deployment/quoter fields empty until actual deployment receipts are verified; keep wallet execution false until then.

After saving the actual database connection, run npm run db:migrate and npm run db:check. These operate on the intended Supabase project, so inspect the project/connection first. No hosted connection or migration has been performed merely by creating the template. Restart npm run dev after changing backend/.env. The backend dev command uses the environment file; the integrated dev launcher does too.
