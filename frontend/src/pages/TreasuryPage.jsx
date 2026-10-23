import React, { useState } from "react";
import useApi from "../hooks/useApi.js";
import useWalletSession from "../hooks/useWalletSession.js";
import useCommunityAction from "../hooks/useCommunityAction.js";
import WalletSession from "../components/WalletSession.jsx";
import { LoadState, ChainLink, Provenance } from "../components/Onchain.jsx";
import { communityRequest, timestamp } from "../lib/community.mjs";
import { units, parseAmount } from "../market-format.mjs";
import PaginatedList from '../components/PaginatedList.jsx';
export default function TreasuryPage() {
  const auth = useWalletSession(),
    [refresh, setRefresh] = useState(0),
    { data, error, loading } = useApi("/treasury", refresh),
    configuration = useApi("/community?wallet=" + (auth.session?.wallet || "")),
    action = useCommunityAction(auth.wallet);
  const save = async (path, input, signal) => {
    await communityRequest(path, input, signal);
    if (!signal.aborted) setRefresh((n) => n + 1);
    return "Verified treasury record saved.";
  };
  return (
    <>
      <section className="page-intro">
        <span className="eyebrow">CHOG FOUNDRY / TREASURY</span>
        <h1>Where the community fees go.</h1>
        <p>
          Collected fees, declared budgets and verifiable NFT custody. Buybacks
          are never automatic or a floor-price promise.
        </p>
      </section>
      <LoadState loading={loading} error={error || action.error} />
      {action.notice && <p role="status">{action.notice}</p>}
      {data && (
        <>
          <p>
            Treasury <ChainLink address={data.wallet} />
          </p>
          <div className="stats">
            <article>
              <span className="caption">RECORDED COLLECTED PLATFORM FEES</span>
              <h3>{units(data.verifiedRecordedPlatformRaw)} CHOG</h3>
              <small>Only verified fee payments</small>
            </article>
            <article>
              <span className="caption">FEES WAITING TO BE CLAIMED</span>
              <h3>
                {data.pendingPlatformRaw == null
                  ? "Unavailable"
                  : units(data.pendingPlatformRaw) + " CHOG"}
              </h3>
              <small>Not yet received by the treasury</small>
            </article>
            <article>
              <span className="caption">AVAILABLE BUDGET</span>
              <h3>{units(data.budgetCeilingRaw)} CHOG</h3>
            </article>
          </div>
          <p className="note">{data.scope}</p>
          <section className="treasury-policy">
            <h2>Public allocation</h2>
            {data.policy ? (
              <>
                <dl>
                  <dt>Operating budget</dt>
                  <dd>{units(data.policy.operating_raw)} CHOG</dd>
                  <dt>Buyback budget</dt>
                  <dd>{units(data.policy.buyback_raw)} CHOG</dd>
                  <dt>Maximum NFT price</dt>
                  <dd>{units(data.policy.max_nft_price_raw)} CHOG</dd>
                  <dt>Published by</dt>
                  <dd>
                    {data.policy.author} at {timestamp(data.policy.updated_at)}
                  </dd>
                </dl>
                {!data.policyWithinVerifiedFunds && (
                  <p className="message error">
                    This policy exceeds the currently verified available funds.
                    A fresh budget is required.
                  </p>
                )}
              </>
            ) : (
              <p className="empty">
                No operating or buyback budget has been published.
              </p>
            )}
          </section>
          <section>
            <h2>Studio NFT custody</h2>
            <p className="note">
              NFTs currently in the treasury wallet. Some may have come from sources other than platform fees.
            </p>
            <PaginatedList items={data.inventory} pageSize={20} label="Treasury NFTs">{page=><div className="inventory-list">
              {page.map((id) => (
                <span className="inventory-item" key={id}>
                  NFT #{id}
                </span>
              ))}
            </div>}</PaginatedList>
            {!data.inventory.length && (
              <p>No studio NFTs held when last checked.</p>
            )}
          </section>
          <section>
            <h2>Verified receipt journal</h2>
            <PaginatedList items={data.receipts} pageSize={10} label="Treasury receipts">{page=><>{page.map((r) => (
              <article className="receipt-row" key={r.transactionHash}>
                <strong>{r.kind}</strong>
                <a
                  href={`https://monadscan.com/tx/${r.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
                <p>
                  {r.platformRaw != null
                    ? units(r.platformRaw) + " CHOG platform fees"
                    : `${units(r.quoteSpentRaw || "0")} CHOG / ${units(r.nativeSpentRaw || "0")} MON observed payment`}
                </p>
                {r.nfts?.map((n) => (
                  <p key={n.tokenId}>
                    NFT #{n.tokenId}: {n.from} to {n.to}
                  </p>
                ))}
              </article>
            ))}</>}</PaginatedList>
            {!data.receipts.length && (
              <p className="empty">
                No verified receipts have been attached yet.
              </p>
            )}
            {data.orphanedReceipts.length > 0 && (
              <p className="message error">
                {data.orphanedReceipts.length} orphaned receipts were excluded
                from totals.
              </p>
            )}
          </section>
          <Provenance data={data.provenance} />
        </>
      )}
      {data?.wallet&&auth.wallet?.toLowerCase()===data.wallet.toLowerCase()&&<details className="community-admin"><summary>Manage treasury</summary><WalletSession auth={auth}/></details>}
      {configuration.data?.admin && (
        <details className="community-admin">
          <summary>Treasury administration</summary>
          <form
            className="community-compose"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action.run((signal) =>
                save(
                  "/treasury/receipts",
                  { transactionHash: f.get("hash"), kind: f.get("kind") },
                  signal,
                ),
              );
            }}
          >
            <h3>Attach a finalized transaction</h3>
            <label>
              Receipt type
              <select name="kind">
                <option value="platform-claim">Platform fee claim</option>
                <option value="buyback">NFT purchase</option>
                <option value="giveaway">NFT distribution</option>
              </select>
            </label>
            <label>
              Transaction hash
              <input
                required
                name="hash"
                placeholder="0x..."
                pattern="0x[0-9a-fA-F]{64}"
              />
            </label>
            <button disabled={action.busy}>Verify and attach receipt</button>
          </form>
          <form
            className="community-compose"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action.run((signal) =>
                save(
                  "/treasury/policy",
                  {
                    operatingRaw:
                      f.get("operating") === "0"
                        ? "0"
                        : parseAmount(f.get("operating")),
                    buybackRaw:
                      f.get("buyback") === "0"
                        ? "0"
                        : parseAmount(f.get("buyback")),
                    maxNftPriceRaw:
                      f.get("maximum") === "0"
                        ? "0"
                        : parseAmount(f.get("maximum")),
                  },
                  signal,
                ),
              );
            }}
          >
            <h3>Publish explicit budgets</h3>
            {[
              ["operating", "Operating budget"],
              ["buyback", "Buyback budget"],
              ["maximum", "Maximum NFT price"],
            ].map(([key, label]) => (
              <label key={key}>
                {label} (CHOG)
                <input
                  name={key}
                  required
                  inputMode="decimal"
                  placeholder="Enter amount"
                />
              </label>
            ))}
            <button disabled={action.busy}>Publish budget</button>
            <p className="note">
              This publishes a policy only. It never transfers money or
              purchases an NFT. Limits are checked against collected platform
              claim receipts and actual CHOG balance.
            </p>
          </form>
        </details>
      )}
    </>
  );
}
