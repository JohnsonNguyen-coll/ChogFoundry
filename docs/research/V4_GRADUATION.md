# Actual v4 migration verification - 2026-10-09

This report records an actual isolated real-state Monad fork test, not application seed data or a deployed launchpad. Source finalized block: 111859589; hash: 0x49a9db6a368df4e00d62cd734cec3515169b961f6f703fdb97111aa2950e5997. Source chain 143, local mutation chain 31337. PoolManager bytecode hash and pool ID are recorded in V4_GRADUATION.json.

Verified: atomic real TOKEN/CHOG pool initialization and full-range liquidity settlement through the officially documented Monad PoolManager; independent StateView price/liquidity; actual buy/sell swaps; swap slippage rollback; duplicate graduation rejection; curve closure after successful migration; failure rollback preserving curve redemption; fixed position custody after NFT transfer; historical fee claim after graduation. No mainnet writes, mock AMM or fake RPC.

The lock has no principal withdrawal, liquidity removal, upgrade, rescue or fee-harvest entry point. Seed rounding leftovers are reported as dust and remain held in the lock. Migration cannot use fee-vault liabilities or another curve's accounted reserves. All constructor economics in this fork test are execution inputs, not approved product parameters.

Current pool hooks are zero: post-graduation studio/creator/platform fees are NOT implemented. Swap fees in this proof are LP fees only. LP fees remain with the position. The test LP fee of 3000 units (0.3%) and full-range/tick-spacing-1 choice are not approved deployment configuration. Source/admin verification of CHOG, authenticated pool initialization, direct-route fee capture, exact-output routing, final economics/LP policy and public testnet deployment remain outstanding.

The failed-migration test deliberately preinitializes the pool at an incompatible price. It confirms rollback and redemption, not prevention of this griefing vector. A pool-bound hook that authorizes initialization is a remaining production gate.

Reproduce: npm run test:fork. The fresh output is contracts/artifacts/v4-graduation.json. Neither this snapshot nor fork balances are application fallback.
