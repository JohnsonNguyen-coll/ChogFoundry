# Chog Foundry

**Your Chog. Your studio. Your next launch.**

Real Monad data and NFT-owned studio profiles. No seeded studios, simulated fees or fake RPC fallback. Foundry contracts are not deployed; launch, trade and claims remain unavailable.

## Run

Node 22.15+ and npm:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The API listens on loopback port 3001. On Windows, stop the dev server before running npm ci again to avoid locking Vite native files.

Copy backend/.env.example to backend/.env if needed. APP_ORIGIN must exactly match the browser origin used for sign-in and profile writes. The default is http://127.0.0.1:5173.

## Workspaces

| Folder | Implementation |
| --- | --- |
| contracts/ | Solidity, OpenZeppelin, compiler and excluded historical research |
| backend/ | Node HTTP API, ethers live RPC reads, signature authentication and SQLite |
| frontend/ | React/Vite, English interface, NFT lookup and studio profile editor |
| docs/ | Product, decisions, plan, sources and implementation status |

## Use your studio

1. Connect an EVM wallet on Monad Mainnet.
2. Enter your Chog Genesis onchain token ID. Display names may use a different number.
3. Sign in with a wallet message. This does not authorize a transaction.
4. Verify edit access, then save the studio name, description, HTTPS website and cover image URL.

The backend checks current ownerOf and all Transfer logs since the finalized sign-in anchor before each save. A transfer, including A→B→A, requires a new sign-in. Original profile authors and revision history are preserved. Approved operators and inferred custody beneficiaries do not receive editing privileges.

Sessions last at most five minutes and are held in memory. Restarting the backend signs everyone out. EOA signatures are supported; ERC-1271 contract-wallet signatures are not implemented. Profiles persist in backend/data/foundry.sqlite, which is ignored by Git. Back up this directory before migration. Node's built-in SQLite API is experimental in the current runtime.

Profile writes are authorized against a recorded canonical chain snapshot, not an atomic transaction spanning SQLite and the blockchain. They fail closed on RPC errors, failed log queries, expired sessions, orphaned anchors and excessive scan gaps. A persistent transfer indexer and moderation epochs remain future work.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /api/health | Process health; does not claim RPC health |
| GET | /api/overview | Verified chain, token and collection data |
| GET | /api/studios | Real profiles saved to this backend |
| GET | /api/studios/:tokenId | Live NFT identity, stored profile and revision attribution |
| GET | /api/studios/:tokenId/transfers | Public transfer window, at most 100 blocks |
| GET | /api/studios/:tokenId/access | Session and fresh ownership/transfer check |
| GET | /api/wallets/:address | Live MON, $CHOG and NFT balances |
| GET | /api/session | Current sign-in identity |
| POST | /api/auth/challenge | Server-issued wallet sign-in message |
| POST | /api/auth/verify | Verify the exact challenge and set session cookie |
| POST | /api/auth/logout | Revoke the session |
| PUT | /api/studios/:tokenId/profile | Owner-checked profile write with expectedRevision |

Onchain responses include source, block number/hash and timestamps. Calls are pinned to one block and checked for canonical hash after the read. No generic RPC relay or server-side arbitrary metadata fetching is exposed.

## Checks

```sh
npm test
npm run test:live
npm run build
```

Local tests use real validation and SQLite transactions. Live tests compare independent RPC reads and exercise real wallet signatures, challenge replay rejection, origin restrictions, non-owner denial and logout. They do not move NFTs or spend funds.

StudioToken, CreatorVesting, StudioTokenFactory and StudioFeeVault compile and remain undeployed/unaudited. The fee vault has isolated real-state fork tests; token/factory/vesting lack comprehensive behavioral suites. Factory market initialization remains incomplete. Curve, graduation, AMM, fees and LP policy remain undecided. No club, agent, treasury buyback or campaign is live.

Historical product/decision documents retain the earlier Vietnamese record; new implementation documentation and application copy use English.

## Market research

Run npm run check:markets for a live, read-only inspection of CHOG implementation, NFT state, candidate Uniswap deployments and actual V3 pools. Findings and unresolved settlement/fee-scope questions are in docs/research/LAUNCH_FEASIBILITY.md. The dated snapshot is evidence only; no AMM is configured for Foundry.

## Fee vault fork test

StudioFeeVault source now records funded category credits and preserves claims across NFT transfers. Run npm run test:fork for the isolated real-state Monad fork test. It uses actual CHOG/NFT contracts with local-only writes and test impersonation; it is not a mainnet launch, real wallet signature or AMM integration. See contracts/README.md for Anvil setup and remaining integration boundaries.
