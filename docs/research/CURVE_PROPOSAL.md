# Linear curve proposal - 2026-10-09

Status: WITHDRAWN following D18 (zero creator allocation). The 500M/300M/200M allocation and corresponding pricing below are historical calculations only; do not implement them. NOT approved parameters, implemented market or deployment. This is an analytical derivation, not mocked market data. Nothing here seeds the application. Approved constraints are DECISIONS.md D12-D17.

## Allocation and price continuity

Propose 500,000,000 tokens sold on the curve, 300,000,000 tokens reserved for graduation liquidity, and the approved 200,000,000 original creator vesting allocation. The 80% combined allocation is therefore 62.5% curve sales and 37.5% pool seeding.

Let S = 500,000,000 whole tokens, L = 300,000,000 whole tokens, x = net tokens circulating from curve purchases (buys increase x, sells decrease x), and T = the graduation reserve in whole CHOG. T is an immutable per-launch configuration once approved; no amount is selected here. Fees and donations are excluded from reserve.

Proposed marginal price and integrated reserve:

```text
u = x / S, with 0 <= u <= 1
p(x) = T / (3*S) * (1 + 4*u)                 [CHOG per token]
R(x) = T * (u + 2*u*u) / 3                  [CHOG]
opening price = T / 1,500,000,000
terminal price = T / 300,000,000 = 5 * opening price
ideal pool opening price = T / L = terminal price
```

This 5x ratio describes the proposed marginal schedule, not a return forecast. Graduation needs net x = S and reserve R(S) = T, not gross trading volume. Repeated buys and sells cannot trigger graduation by inflating volume.

For a linear price schedule p0 to p1, the collected reserve is S*(p0+p1)/2. Requiring reserve/L = p1 implies p0/p1 = 2*L/S - 1. A 600-million sale / 200-million pool split would require a negative opening price, so it cannot use this linear design with all net reserve seeded into the pool and no external subsidy. The proposed 500/300 split gives p0/p1 = 1/5.

## Trades and inverse

```text
buy delta tokens:  base quote = R(x + delta) - R(x)
sell delta tokens: base quote = R(x) - R(x - delta)
inverse for r = R/T: u = (sqrt(1 + 24*r) - 1) / 4
```

Proposal: express the approved 1% fee on base quote notional. Buy gross input is base quote plus fees; sell payout is base quote minus fees. Fees are credited separately to original creator, transaction-time NFT owner and treasury. Exact integer rounding/minimum trade rules remain to be specified and reviewed before Solidity implementation; the real-valued inverse is not suitable for direct floating-point contract computation. Use integer token/quote base units and bounded monotone search or an audited integer square-root implementation. Slippage and deadlines are mandatory. A final buy caps at remaining curve inventory; excess input must be rejected or explicitly returned, not silently donated.

| Net curve tokens sold | Reserve / T | Marginal price / opening |
|---|---|---|
| 0 | 0 | 1 |
| 125,000,000 | 1/8 | 2 |
| 250,000,000 | 1/3 | 3 |
| 375,000,000 | 5/8 | 4 |
| 500,000,000 | 1 | 5 |

These normalized values were checked with exact Python Fraction arithmetic, including allocation sum and R(S)/L = p(S). No CHOG exchange rate, actual trading activity or liquidity estimate is assumed.

## Graduation gates and remaining decisions

The ideal identity above is an economic target, not proof of v4 migration. A v4 implementation must choose price orientation, integer sqrt-price, tick range and position rounding; prove actual seed balances/price continuity; handle residual dust under a disclosed rule; and provide deployment/keeper gas separately rather than deducting fee liabilities or silently reducing T. The position lock must prevent creator/current NFT owner withdrawal. LP fee collection rules, official pool fee scope and LP-inclusive total fees remain separate verification gates.

Graduation must be atomic or use an explicit fail-closed lifecycle that preserves reserve redemption until migration actually succeeds. Do not freeze users indefinitely when a pool cannot initialize. No burned LP, emergency authority or concentrated-liquidity range has been approved.

Required user decisions: (1) approve/revise the 500M sale / 300M liquidity split and linear 5x marginal schedule; (2) choose T after test asset availability and migration constraints are verified. Fixed versus selectable launch tiers also remains open. No default T, mainnet monetary target or fabricated test asset is introduced.
