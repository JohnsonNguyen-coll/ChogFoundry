# Railway backend + Vercel frontend

Both services use the repository root, not `backend/` or `frontend/`, because npm workspaces share the root lockfile.

## 1. Railway

1. Create a service from the repository, keeping Root Directory at the repository root. `railway.json` selects `Dockerfile.backend`, applies the existing idempotent Supabase migrations, starts the API and checks `/api/health`.
2. Add Variables from `deploy/railway.env.example`. Fill the existing Supabase connection, Claude and X credentials locally in the Railway dashboard. Never upload either local `.env` file or the deployment private key.
3. Set `APP_ORIGIN` to the final frontend origin, such as `https://your-project.vercel.app`, without a path. It is the frontend domain, not the Railway domain.
4. Keep one replica in one region, and disable service sleeping. Wallet sessions, X authorization state and active X API tokens currently live in process memory; restarts require sign-in/X reauthorization. Supabase retains application and indexed market data.
5. Deploy, then generate the Railway public HTTPS domain. Check `https://YOUR-RAILWAY-DOMAIN/api/health`.

The container includes the checked-in public Supabase CA certificate. Keep `SUPABASE_DB_CA_PATH=/app/backend/certs/prod-ca-2021.crt`; a Windows path from local development will not work in the container. Use the CA that belongs to your actual Supabase project if different. Railway supplies `PORT`; do not hardcode a local port.

## 2. Vercel

1. Import the same repository. Root Directory: repository root. Framework Preset: **Other**. Node.js: **22.x**. Leave Output Directory unset. `vercel.json` sets install/build commands.
2. Add `FOUNDRY_API_ORIGIN` with the Railway HTTPS origin, for example `https://your-api.up.railway.app` (no `/api`). Optionally add the public `VITE_WALLETCONNECT_PROJECT_ID`. Do not add backend secrets to Vercel.
3. Deploy. `npm run build:vercel` creates `.vercel/output/static` and Build Output API routing configuration. `/api/*` proxies to Railway, static assets are served directly, and `/app/*` and `/docs/*` fall back to the SPA. Missing assets/API routes do not fall back to HTML.
4. If the actual frontend domain differs from Railway's `APP_ORIGIN`, update that Railway variable and redeploy the backend before signing in.

All frontend API, RPC and EventSource calls remain same-origin through Vercel. The HttpOnly Secure session cookie stays on the frontend domain; no cross-site cookie or wildcard CORS changes are needed. Live market/club streams reconnect automatically after proxy/network interruptions. Use the configured production frontend domain for authenticated features; arbitrary Vercel preview domains are deliberately not authorized.

## 3. X and wallet configuration

- In the X developer application, register the exact callback `https://YOUR-FRONTEND-DOMAIN/app/campaigns`. The application is a confidential Web App and uses the existing read-only OAuth permissions.
- In the Reown dashboard, allow the final frontend origin if using WalletConnect.
- Changing the frontend domain requires updating Railway `APP_ORIGIN`, the X callback and the Reown domain configuration. Changing the backend domain requires updating Vercel `FOUNDRY_API_ORIGIN` and rebuilding Vercel.

## 4. Verify after deployment

- Open frontend `/app/campaigns` directly and refresh; it should remain an application page.
- Frontend `/api/health` returns JSON, not HTML.
- Frontend `/api/config` reports Chog Genesis and `/api/execution` reports the configured new factory; index readiness can take time after a fresh deploy.
- Connect/sign in once, navigate between pages, then link X and return to the same frontend domain.
- Check market and club stream updates and transaction tracking. A deployment/restart expires the current in-memory session, not blockchain history.

These files prepare hosting; they do not deploy a service, submit blockchain transactions, verify contract source, create tasks or open a raffle. Use the existing Supabase database to retain current data.
