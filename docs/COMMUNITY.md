# Community, Claude, treasury and engagement raffles

## User-approved direction

The user selected Claude, free raffles using onchain randomness, and engagement with https://x.com/ChogNFT through follow, like, reply and repost. Verified engagement earns non-transferable offchain points; entering a raffle spends earned points. Points are not purchasable, transferable or earned from token purchases/trading volume. Numeric task awards, entry prices, operating/buyback budgets and NFT purchase limits remain unset until the organizer enters them explicitly.

The existing Mainnet/deployer-as-treasury and selected RainbowKit provider decisions remain unchanged. Pyth Entropy is the implemented randomness integration, verified against official documentation and actual Mainnet reads; that implementation is not authorization to deploy a raffle, pay an oracle fee or open a real campaign.

## Setup

Apply the additive backend-only migration with `npm run db:migrate` after configuring the intended Supabase project. It applies migrations 001 and 002 without seeding users, studios, tasks, points, messages, prizes or winners. Existing SQLite files are untouched. Run `npm run db:check` to verify the actual database separately.

Backend-only configuration is listed in `backend/.env.example`; blank keys have also been appended to ignored `backend/.env` without replacing existing values:

- `ANTHROPIC_API_KEY` and `CLAUDE_MODEL`: actual Claude account credentials and an exact model ID available to that account. No model ID or API key is fabricated.
- `X_CLIENT_ID`, with `X_CLIENT_SECRET` for a confidential client. Register the exact callback `APP_ORIGIN/app/campaigns`. Request only `tweet.read users.read follows.read like.read`. The implementation never posts, follows, likes or reposts for the user.
- `FOUNDRY_DEPLOYER_ADDRESS`: the existing public deployer/treasury address, also the platform organizer role.
- `FOUNDRY_RAFFLE_ADDRESS`: the actual reviewed deployment of `FoundryRaffle`, not a predicted or fork address.
- `FOUNDRY_CAMPAIGNS_ENABLED=false`: remains false until an actual reviewed raffle release is explicitly enabled. Draft creation is separate from live publication, points entry and user-confirmed wallet execution.

`npm run raffle:plan` prepares an unsigned independent raffle deployment using the actual public deployer nonce and verified infrastructure. It does not deploy or configure a predicted address as runtime state.

Do not put backend secrets in frontend `VITE_` variables. Supabase/Claude/X services have not been provisioned or authenticated by these source changes. Missing configuration returns unavailable; there is no local database, AI, X verification or randomness fallback.

## Club

Routes `/app/clubs` and `/app/clubs/:id` use published studio profiles and actual NFT identity. A studio page links directly to its club even before it has a profile. Rooms include lounge, owner announcements, ideas and a token-address room whose factory/studio binding is checked onchain. Token rooms cannot bind arbitrary external tokens.

Any signed-in wallet may follow/unfollow a club and post without owning an NFT or buying a token. Chat is stored offchain in PostgreSQL. The UI polls sequentially every five seconds, replaces the bounded latest 100-post window and aborts obsolete reads. Older pages use an explicit ID cursor. Original author attribution is immutable; owner moderation hides public content while retaining the original database record and reason/evidence. Membership is opt-in and does not transfer authority.

Announcements and moderation reuse the existing `ownerProof` implementation: sign-in anchor, bounded complete Transfer scans, canonical snapshot and session recheck. Approved operators and old sessions cannot substitute for the current literal owner, including A-to-B-to-A transfers. This increment intentionally offers owner-only moderation and grants no durable moderator role. Concept/meme proposals have one idempotent support vote per wallet; removing a vote is explicit. Votes never update contracts or release funds. Contribution counts are actual retained public posts, not purchased rewards. Content is rendered as text; submitted meme URLs are explicit HTTPS links, not server-side downloads.

## Claude

Routes `/app/agent/:id` and `/api/agent/:id` expose a wallet-private assistant history. Each explicit request sends the user's question plus public studio/profile data, a timestamped onchain source and up to 20 lounge posts. An optional Foundry token address adds a separately sourced canonical bounded market inspection and holder availability. Different snapshot blocks remain separate sources. Missing holder history or incomplete data is not filled in.

The backend calls the official Claude Messages endpoint. It has no execution tools, signing key, wallet, external URL fetch tool or permission-changing tool. Studio/chat content is supplied as untrusted JSON data; responses render as text. Source IDs, blocks/hashes/times and limits accompany answers. There are no fabricated fallback answers or promises of safety/returns. Generation attempts, including failures, count toward the per-wallet request budget; there is a two-request concurrency cap, 30-second spacing, 20 attempts/day and 100 KB input ceiling. API errors do not expose provider response bodies/credentials. Model calls have a 25-second timeout. Sessions must still be valid before an answer is saved.

Actual Claude generation has not been tested without the user's real credentials/model. Input/prompt boundaries and explicit missing-configuration behavior have been tested; these are not substitutes for a live model call.

## X identity and points

The user links a signed-in wallet to an X account through OAuth 2 PKCE. One-time five-minute state is bound to the exact wallet session. The linked X user ID is unique across wallets and cannot be moved to another wallet to reuse earnings. Tokens and PKCE material remain in process memory, never SQL, frontend storage or logs; restart/expiry requires reauthorization. No offline access scope is requested.

Only the organizer can publish immutable tasks with explicit points and dates. The backend resolves @ChogNFT through the actual X API, and verifies that task posts belong to that returned user ID. Checks read the linked user's following/liked posts, the target post's reposting users, or a submitted direct reply's author/reference. They paginate at most five pages and require positive evidence. Missing access, rate limits, private/unavailable content or incomplete scans do not grant points. Verification observes an action at that time; it does not guarantee the user retains a follow/like forever.

A PostgreSQL transaction serializes each wallet's point ledger. Unique X-user/action/target keys prevent the same follow or post interaction being credited again even through a second task. No administrative arbitrary-point mint route exists. Public task values have no numerical defaults. A point-spend entry atomically locks the campaign and wallet, checks the window/capacity/link, inserts one entry and debits the balance; simultaneous retries cannot overspend or create duplicate entries. No one-person or complete Sybil-resistance claim is made.

The actual X OAuth callback and four live action checks remain unverified until a real developer application and eligible API access are configured. No screenshots, browser intents, manually supplied X handles or URLs alone are accepted as completion evidence.

## Raffle lifecycle

The initial implementation uses one Chog NFT prize and one entry per linked wallet/X account per campaign, with a maximum of 5,000 entries. These are implementation bounds, not approved entry prices or prize funding. Rules include explicit opening/closing times, point cost and capacity; the serialized rules hash is bound to onchain prize/deadline.

1. Organizer creates an offchain draft; nothing opens or spends automatically.
2. The organizer separately reviews an exact single-NFT approval and escrow `create` action in their selected wallet. The contract's collection, organizer, Entropy deployment and provider are checked from finalized onchain getters. Matching prize custody and rules must be observed before publication.
3. With publication explicitly enabled, eligible wallets spend already earned engagement points to enter during the published window. No participant financial transaction or token balance is required.
4. After the deadline the backend freezes the sorted full entry list, Merkle root and manifest hash in one transaction. Public manifests include wallets, spent points and proofs, not X access tokens or private user data. Offchain eligibility/list inclusion remains an organizer-operated trust boundary.
5. The organizer commits the frozen root/count/hash onchain. The contract cannot replace the commitment. A randomness request must be in a later block, and there is only one request per campaign. The organizer reviews the actual native fee read from Pyth before signing; no default fee is hardcoded.
6. Pyth's authenticated callback stores the random value only. It never transfers an NFT. Rejection sampling derives the winner without modulo bias; only the committed winning leaf/proof can receive the NFT. Any onchain caller may deliver the prize to that fixed wallet, while the current application preparation UI is organizer-operated.
7. Before commitment the organizer may cancel and recover the escrowed prize. Only a canonical onchain cancellation permits the backend's atomic idempotent point refunds. After commitment no cancellation, reroll or rescue is provided. Oracle/provider liveness and delivery remain real dependencies; no browser/backend random fallback exists.

The manifest leaf is a double keccak of ABI-encoded chain ID, raffle address, onchain campaign ID, zero-based sorted entry index and wallet. Pairs are lexically/numerically sorted keccak hashes; an unpaired last leaf is promoted. `raffle-manifest.mjs` supplies the canonical serialization/proofs. Manifest JSON object keys are recursively sorted before hashing so PostgreSQL JSONB key order cannot change the commitment; arrays retain their committed order. The contract's rules/manifest hashes do not independently enforce X eligibility; public list review is essential.

The native-fee wallet path requires an exact reviewed/fresh action match, finalized backend source, immediate selected-wallet account/chain checks and same-block wallet simulation/gas/canonical verification. Only `draw` can carry the exact native value; approval/create/commit/claim/cancel carry zero. Pending hashes use the existing public transaction journal and never automatically retry. Backend inspection remains read-only. Configuration flags alone are not a contract audit or deployment approval.

`FoundryRaffle` is undeployed/unaudited. A real-state fork verifies actual NFT escrow/cancel, commitment timing/immutability, actual Pyth request and native-fee transport, wrong-fee refusal, unauthenticated callback refusal and pre-randomness claim refusal. The external provider cannot observe a disposable child fork; no callback, winner or complete prize award is fabricated. Real Mainnet callback/award and physical-wallet checks remain release requirements.

## Treasury

`/app/treasury` reads the configured deployer wallet's actual finalized MON/CHOG balances and literal Chog NFT holdings. Platform credit still owed by a bound vault is displayed separately from collected revenue. An organizer can attach canonical finalized platform claim, observed NFT purchase or distribution receipts. Platform receipts require the bound factory/vault assets/registrar/treasury, exact `Claimed` platform category and matching funded CHOG payment. Other creator/studio fees in the same payment are never counted as platform revenue.

Attached receipts are revalidated, orphaned receipts are excluded, and the journal scope is explicit. It is not complete wallet transaction history or proof of a marketplace's total price/funding origin. Native MON purchase payments remain separate from CHOG accounting; no exchange rate is invented. An NFT gift without an observable payment is not recorded as a purchase. Custody is not proof that an NFT was bought with platform revenue.

Public operating/buyback budgets and maximum NFT price require explicit organizer input and cannot exceed canonical recorded collected platform fees less recorded CHOG purchases, capped by actual CHOG balance. These are published remaining-budget declarations, not a custody contract or complete expense ledger. Pending fees, curve reserves and LP custody are not available funds. No buyback or NFT distribution is automated or signed by the backend/agent. Full independent accounting, unclassified spending and CHOG-to-MON conversion attribution remain operational follow-ups before treating the journal as audited treasury accounts.
