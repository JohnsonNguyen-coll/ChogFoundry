import WalletAction from "./WalletAction.jsx";
import LaunchReceipt from "./LaunchReceipt.jsx";
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
    [minutes, setMinutes] = useState(""),
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
  }, [creator, id, name, symbol, budget, minimum, minutes]);
  async function inspect(e, approval = false) {
    e.preventDefault();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setData(null);
    setError("");
    setBusy(true);
    try {
      if (!/^[1-9][0-9]?$/.test(minutes) || Number(minutes) > 60)
        throw new Error("Choose a deadline of 1 to 60 minutes.");
      const input = new URLSearchParams({
        wallet: creator,
        name,
        symbol,
        initialQuoteIn: paid ? parseAmount(budget) : "0",
        minTokenOut: paid ? parseAmount(minimum) : "0",
        deadline: String(Math.floor(Date.now() / 1000) + Number(minutes) * 60),
      });
      const requestPath = `/api/studios/${encodeURIComponent(id)}/${approval ? "launch-approval" : "launch-preflight"}?${input}`;
      const response = await fetch(requestPath, {
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
    <section id="launch" className="market-section">
      <span className="eyebrow">LAUNCH / REVIEW BEFORE SIGNING</span>
      <h2>Prepare your next launch.</h2>
      <p className="note">
        Approved baseline: 1 billion fixed supply, zero creator allocation,
        optional paid first buy. Supply goes to curve/graduation inventory. Only
        the literal NFT owner can launch. Inspect first, then review each
        transaction in your connected wallet.
      </p>
      <form className="trade-form" onSubmit={inspect}>
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
        ) : (
          <label>
            Selected studio<strong>NFT #{nftId}</strong>
          </label>
        )}
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
        <label>
          Token name
          <input
            aria-label="Launch token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Symbol
          <input
            aria-label="Launch token symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
          />
        </label>
        <label>
          Maximum first-buy CHOG budget
          <input
            aria-label="Launch first buy budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            required
          />
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
          </label>
        )}
        <label>
          Deadline (minutes)
          <input
            aria-label="Launch deadline minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputMode="numeric"
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Inspecting factory…" : "Inspect launch"}
        </button>
        <button type="button" disabled={busy} onClick={(e) => inspect(e, true)}>
          Inspect launch approval
        </button>
      </form>
      <p className="note">
        Name: 1–64 UTF-8 bytes. Symbol: 1–12 bytes. Enter 0 budget for no
        purchase. A paid first buy needs your own positive minimum output; no
        minimum or curve price is fabricated.
      </p>
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
      <LaunchReceipt nftId={id} wallet={creator} />
    </section>
  );
}
