import {loadingFetch} from './lib/loading.mjs';
import WalletAction from "./WalletAction.jsx";
import LaunchReceipt from "./LaunchReceipt.jsx";
import LaunchSummary from "./components/LaunchSummary.jsx";
import React, { useEffect, useRef, useState } from "react";
import { parseAmount, units } from "./market-format.mjs";
export default function LaunchWizard({
  wallet,
  nftId,
  inspectionMode = false,
}) {
  const [id, setId] = useState(""),
    [publicWallet, setPublicWallet] = useState(""),
    [name, setName] = useState(""),
    [symbol, setSymbol] = useState(""),
    [budget, setBudget] = useState("0"),
    [minimum, setMinimum] = useState(""),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef(null);
  const creator = wallet || publicWallet.trim(),
    paid = budget !== "0";
  useEffect(() => {
    if (nftId != null) setId(nftId);
  }, [nftId]);
  useEffect(() => {
    pending.current?.abort();
    setData(null);
    setError("");
    setBusy(false);
    return () => pending.current?.abort();
  }, [creator, id, name, symbol, budget, minimum]);
  async function inspect(e, approval = false) {
    e.preventDefault();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setData(null);
    setError("");
    setBusy(true);
    try {
      const input = new URLSearchParams({
        wallet: creator,
        name,
        symbol,
        initialQuoteIn: paid ? parseAmount(budget) : "0",
        minTokenOut: paid ? parseAmount(minimum) : "0",
        deadline: String(Math.floor(Date.now() / 1000) + 20 * 60),
      });
      const requestPath = `/api/studios/${encodeURIComponent(id)}/${approval ? "launch-approval" : "launch-preflight"}?${input}`;
      const response = await loadingFetch(requestPath, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(25000),
          ]),
          cache: "no-store",
        }),
        body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Launch inspection unavailable.",
        );
      if (!controller.signal.aborted) setData({ ...body, requestPath });
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section id="launch" className="launch-workspace">
      <header className="launch-page-heading">
        <div><span className="eyebrow">CHOG FOUNDRY / TOKEN LAUNCH</span>
        <h1>Your idea.<br/><span>Next onchain.</span></h1>
        <p>Give your next token a name. Your studio takes it from here.</p></div>
        <span className="launch-network"><span/>Monad Mainnet</span>
      </header>
      <ol className="launch-progress" aria-label="Launch progress">
        <li className={!data?'is-current':'is-complete'} aria-current={!data?'step':undefined}><span>01</span><div><strong>Configure</strong><small>Name it. Make it yours.</small></div></li>
        <li className={data?'is-current':''} aria-current={data?'step':undefined}><span>02</span><div><strong>Review</strong><small>Check the onchain details.</small></div></li>
        <li><span>03</span><div><strong>Launch</strong><small>Confirm in your wallet.</small></div></li>
      </ol>
      <div className="launch-columns">
      <div className="launch-main-column">
      <form className="launch-config-card" onSubmit={inspect}>
        <div className="launch-card-heading"><span className="launch-section-number">01</span><div><h2>Make it yours</h2><p>A name and a ticker. The start of your next story.</p></div></div>
        <div className="launch-fields">
        {inspectionMode ? (
          <label>
            Studio NFT token ID
            <input
              aria-label="Launch NFT token ID"
              value={id}
              onChange={(e) => setId(e.target.value)}
              pattern="(0|[1-9][0-9]*)"
              required
              inputMode="numeric"
            />
          </label>
        ) : null}
        {!wallet && (
          <label>
            Creator wallet to inspect
            <input
              aria-label="Launch creator wallet"
              value={publicWallet}
              onChange={(e) => setPublicWallet(e.target.value)}
              placeholder="0x…"
              required
              spellCheck="false"
            />
          </label>
        )}
        <label className="launch-name-field">
          Token name
          <input
            aria-label="Launch token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Give your token a name"
            autoComplete="off"
          />
          <small>1–64 UTF-8 bytes</small>
        </label>
        <label>
          Symbol
          <input
            aria-label="Launch token symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
            placeholder="e.g. CHOG"
            autoComplete="off"
            spellCheck="false"
          />
          <small>1–12 UTF-8 bytes</small>
        </label>
        </div>
        <div className="launch-first-buy-heading"><div><h3>Be the first in</h3><p>Buy at launch with your own CHOG, or start without a purchase.</p></div><span>Optional</span></div>
        <div className="launch-fields launch-buy-fields">
        <label>
          Maximum first-buy budget
          <div className="launch-amount-input">
          <input
            aria-label="Launch first buy budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            required
          />
          <span>CHOG</span></div>
          <small>Enter 0 to launch without buying. Unused CHOG is returned.</small>
        </label>
        {paid && (
          <label>
            Minimum first-buy tokens
            <input
              aria-label="Launch minimum tokens"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
              inputMode="decimal"
              required
            />
            <small>The least tokens you accept for your first buy.</small>
          </label>
        )}
        </div>
        <div className="launch-form-footer"><p>Review first. Sign when you’re ready.<br/><span>Only the current NFT owner can launch.</span></p><button className="primary" disabled={busy}>
          {busy ? "Checking contracts…" : "Review launch →"}
        </button></div>
        {paid&&<button className="launch-allowance-link" type="button" disabled={busy} onClick={(e) => inspect(e, true)}>
          Check CHOG spending approval ↗
        </button>}
      </form>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {data && (
        <div className="launch-review">
          <h3>Onchain launch review</h3>
          {data.approval && (
            <>
              <p>
                Factory allowance: {data.approval.status}. Required:{" "}
                {units(data.approval.requiredRaw)} CHOG. Spender:{" "}
                {data.approval.spender}
              </p>
              <p className="note">{data.approval.policy}</p>
              {data.approval.steps.map((step, i) => (
                <p key={i}>
                  {i + 1}. {step.kind}: {units(step.amountRaw)} CHOG ·{" "}
                  {step.status}
                </p>
              ))}
            </>
          )}
          <dl>
            <dt>Launch status</dt>
            <dd>{data.preflight.status}</dd>
            <dt>Blockers</dt>
            <dd>
              {data.preflight.blockers.length
                ? data.preflight.blockers.join(", ")
                : "None at the recorded block"}
            </dd>
            <dt>Owner at snapshot</dt>
            <dd>{data.ownership.ownerAtSnapshot}</dd>
            <dt>Supply / creator allocation</dt>
            <dd>
              {units(data.baseline.supplyRaw)} /{" "}
              {units(data.baseline.creatorAllocationRaw)}
            </dd>
            <dt>Curve sales / graduation inventory</dt>
            <dd>
              {units(data.baseline.saleSupplyRaw)} /{" "}
              {units(data.baseline.graduationInventoryRaw)}
            </dd>
            <dt>Curve fees: creator / studio / platform</dt>
            <dd>
              {data.baseline.creatorBps / 100}% /{" "}
              {data.baseline.studioBps / 100}% /{" "}
              {data.baseline.platformBps / 100}%
            </dd>
            <dt>Maximum funding / factory allowance</dt>
            <dd>
              {units(data.funding.requiredRaw)} /{" "}
              {units(data.funding.allowanceRaw)} CHOG
            </dd>
            <dt>Simulated token address</dt>
            <dd>
              {data.preflight.simulatedTokenAddress ??
                "Unavailable: launch blocked"}
            </dd>
            <dt>Launch gas estimate</dt>
            <dd>
              {data.preflight.gasEstimateRaw ?? "Unavailable: launch blocked"}
            </dd>
            <dt>Actual first-buy spend / output</dt>
            <dd>
              Unavailable from the factory call return; receipt evidence is
              required
            </dd>
          </dl>
          <p className="note">
            {data.ownership.policy} {data.baseline.policy}
          </p>
          <p className="note">{data.preflight.policy}</p>
          <details>
            <summary>Unsigned launch calldata and source</summary>
            <p>
              From: {data.preflight.transaction.from} · To:{" "}
              {data.preflight.transaction.to} · Value: 0
            </p>
            <code style={{ overflowWrap: "anywhere" }}>
              {data.preflight.transaction.data}
            </code>
            <p>
              Chain {data.preflight.transaction.chainId} · block{" "}
              {data.snapshot.blockNumber} · {data.snapshot.blockTime} ·{" "}
              {data.provenance?.finality ?? "unavailable"}
            </p>
            <code style={{ overflowWrap: "anywhere" }}>
              {data.snapshot.blockHash}
            </code>
            <p>
              {data.provenance?.rpcOrigin} · {data.provenance?.fetchedAt}
            </p>
          </details>
          <WalletAction
            wallet={wallet}
            body={data}
            kind={data.approval ? "approval" : "preflight"}
            path={data.requestPath}
            label={
              data.approval
                ? data.approval.steps[0]?.kind === "reset"
                  ? "Reset factory allowance in wallet"
                  : "Approve exact launch budget in wallet"
                : "Launch token in wallet"
            }
            onFinalized={() => setData(null)}
          />
        </div>
      )}
      <details className="launch-receipt-panel"><summary>Already launched? Verify your transaction ↗</summary><LaunchReceipt nftId={id} wallet={creator} /></details>
      </div>
      <LaunchSummary id={id} name={name} symbol={symbol} budget={budget} creator={creator}/>
      </div>
    </section>
  );
}
