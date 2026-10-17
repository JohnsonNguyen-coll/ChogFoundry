# Production hosting

The root `npm start` command serves the compiled React application and the existing API from one Node HTTP server. It does not use Vite's development server. It does not deploy contracts, enable wallet execution, migrate the database or submit financial transactions.

## Build and start

1. Install locked dependencies with `npm ci` using Node 22.15 or later.
2. Configure backend-only values in the host environment or ignored `backend/.env`. Existing process environment values take precedence. Never include a private key.
3. Set the public `VITE_WALLETCONNECT_PROJECT_ID` before building if WalletConnect is required. Frontend `VITE_` values are public; never put database credentials there.
4. Run `npm run build` from the repository root.
5. Run `npm start` from the repository root.

`APP_ORIGIN` must be the exact public application origin, including a nonstandard port if used. Production startup requires an HTTPS origin; HTTP is accepted only for localhost/loopback. Authentication continues to validate this configured origin and does not trust forwarded headers to authorize a write. A backend restart clears in-memory sessions and challenges.

`HOST` defaults to `127.0.0.1`; `PORT` defaults to `3001`. A container may require an explicitly configured `HOST=0.0.0.0`. Use the hosting platform's HTTPS termination or reverse proxy for the public origin. Keep the application on one process/replica: sessions, stream clients and the active index worker are process-local, and this release does not add distributed coordination.

For a local production-build check in PowerShell, without modifying the existing environment file:

```powershell
$env:APP_ORIGIN = 'http://127.0.0.1:4173'
$env:PORT = '4173'
$env:HOST = '127.0.0.1'
npm start
```

This is a local server, not a hosted release. Existing real Mainnet reads remain read-only. Missing Supabase or deployment configuration remains an explicit API/UI blocker.

## Routing and proxy behavior

- `/` and extensionless `/app/...` paths serve the built application entry point. Reloading `/app/markets/:address` or `/app/launch?studio=:id` therefore works. React Router handles unknown application pages.
- `/api` and `/api/...` keep the existing API handler, JSON errors, authentication and SSE behavior. Never rewrite API failures to `index.html`.
- Missing JS/CSS/image assets return an error instead of HTML. Hashed build assets receive immutable cache headers; the HTML entry point is revalidated.
- Hidden files, encoded traversal, paths leaving the build root and symlinks outside that root are rejected. Only the explicit `frontend/dist` build is served; source and backend environment files are not a static root.
- A reverse proxy must forward the same origin's paths to this Node process and permit long-lived `text/event-stream` responses without buffering or caching. Preserve query strings. Configure sufficient idle timeout for the 15-second stream heartbeats. No WebSocket transport is required for the current SSE API.
- `/api/health` is process health, not proof of database/RPC readiness or authorization to execute. `/api/execution` reports the existing deployment/database/index blockers.

## Release prerequisites

Before enabling user wallet execution, configure and verify the actual Supabase database, reviewed deployed factory/quoter and exact factory first-code block. Run database migration/check, verify canonical contract receipts and immutable bindings, then wait for the canonical index to catch up. Keep `FOUNDRY_WALLET_EXECUTION=false` until those checks and human wallet review are complete. Use the approved D21 economics; no fork addresses may become runtime configuration.

`npm run deploy:plan` creates an unsigned plan using the actual public deployer address. It is not a deployment or a receipt verifier. Contract security review, actual deployment receipt verification and physical-wallet end-to-end checks remain unfinished. Club, Agent, Treasury accounting/buyback and campaigns are separate product work.
