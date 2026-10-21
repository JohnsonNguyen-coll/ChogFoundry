import WalletAction from "./WalletAction.jsx";
import LaunchReceipt from "./LaunchReceipt.jsx";
import LaunchSummary from "./components/LaunchSummary.jsx";
import Modal from './components/Modal.jsx';
import useInitialBuyQuote from './hooks/useInitialBuyQuote.js';
import {Spinner} from './components/Loading.jsx';
import {statusLabel} from './lib/status-label.mjs';
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
    [data, setData] = useState(null),
    [reviewOpen, setReviewOpen] = useState(false),
    [approvalNotice,setApprovalNotice] = useState(''),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef(null);
  const creator = wallet || publicWallet.trim(),
    paid = !!budget && !/^0(?:\.0*)?$/.test(budget),
    nameTooLong = new TextEncoder().encode(name).length > 64,
    symbolTooLong = new TextEncoder().encode(symbol).length > 12;
  const buyQuote=useInitialBuyQuote(id,budget);
  const needsApproval=data?.preflight?.blockers?.includes('FACTORY_APPROVAL_REQUIRED')&&!data?.approval;
  useEffect(() => {
    if (nftId != null) setId(nftId);
  }, [nftId]);
  useEffect(() => {
    pending.current?.abort();
    setData(null);
    setError("");
    setBusy(false);
    return () => pending.current?.abort();
  }, [creator, id, name, symbol, budget]);
  async function inspect(e, approval = false) {
    e?.preventDefault();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    if(!reviewOpen)setData(null);
    setError("");
    setBusy(true);
    try {
      if(nameTooLong)throw new Error('This name is too long. Use fewer letters or symbols.');
      if(symbolTooLong)throw new Error('This ticker is too long. Try a shorter one.');
      const input = new URLSearchParams({
        wallet: creator,
        name,
        symbol,
        initialQuoteIn: paid ? parseAmount(budget) : "0",
        minTokenOut: paid ? "auto" : "0",
        deadline: String(Math.floor(Date.now() / 1000) + 20 * 60),
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
      if (!controller.signal.aborted) {
        const reviewed=body.approval?.steps?.length===0?{...body,approval:undefined}:body;
        setData({ ...reviewed, requestPath });setReviewOpen(true);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function actionConfirmed(result){
    if(result.changedApproval)setApprovalNotice(`Your wallet approved ${units(result.changedApproval.approvedAmountRaw)} CHOG. The reviewed limit was ${units(result.changedApproval.reviewedAmountRaw)} CHOG.`);
    if(data.approval)void inspect(null,data.approval.steps[0]?.kind==='reset');
    else setData(null);
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
            aria-invalid={nameTooLong}
            aria-describedby="launch-name-help"
          />
          <small id="launch-name-help">{nameTooLong?'This name is too long. Use fewer letters or symbols.':'Choose a short, memorable name.'}</small>
        </label>
        <label>
          Ticker
          <input
            aria-label="Launch token symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
            placeholder="e.g. CHOG"
            autoComplete="off"
            spellCheck="false"
            aria-invalid={symbolTooLong}
            aria-describedby="launch-symbol-help"
          />
          <small id="launch-symbol-help">{symbolTooLong?'This ticker is too long. Try a shorter one.':'A short name used in trading, like CHOG.'}</small>
        </label>
        </div>
        <div className="launch-first-buy-heading"><div><h3>Be the first in</h3><p>Buy at launch with your own CHOG, or start without a purchase.</p></div><span>Optional</span></div>
        <div className="launch-fields launch-buy-fields">
        <label>
          CHOG to spend
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
        </div>
        {paid&&<div className="launch-buy-estimate" aria-live="polite">
          {buyQuote.loading?<Spinner label="Checking launch price…"/>:buyQuote.error?<><p role="alert">{buyQuote.error}</p><button type="button" onClick={buyQuote.retry}>Try again</button></>:buyQuote.data?<><span>Estimated tokens received</span><strong>{units(buyQuote.data.firstBuy.tokenOutRaw)} {symbol||'tokens'}</strong><small>Trading fees included. The amount is checked again before you confirm.</small></>:<p>Enter a CHOG amount greater than zero.</p>}
        </div>}
        <div className="launch-form-footer"><p>Review first. Sign when you’re ready.<br/><span>Only the current NFT owner can launch.</span></p><button className="primary" disabled={busy||(paid&&!buyQuote.data)}>
          {busy ? "Checking contracts…" : "Review launch →"}
        </button></div>
        {paid&&<button className="launch-allowance-link" type="button" disabled={busy} onClick={(e) => inspect(e, true)}>
          Check CHOG spending approval ↗
        </button>}
      </form>
      {error && !reviewOpen && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {data && (
        <>
        <button type="button" className="secondary launch-reopen-review" onClick={()=>setReviewOpen(true)}>Open launch review</button>
        <Modal open={reviewOpen} onClose={()=>setReviewOpen(false)} title="Review your launch" className="launch-review-modal">
        <div className="launch-review">
          {busy?<div className="section-loading"><Spinner label="Checking your launch…"/></div>:<>
          {error&&<p className="message error" role="alert">{error}</p>}
          {approvalNotice&&<p className="message" role="status">{approvalNotice}</p>}
          {data.approval && (
            <>
              <p>
                CHOG spending approval: {statusLabel(data.approval.status)}. Required:{" "}
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
            <dd>{statusLabel(data.preflight.status)}</dd>
            <dt>What needs attention</dt>
            <dd>
              {data.preflight.blockers.length
                ? data.preflight.blockers.map(statusLabel).join(" ")
                : "No issues found"}
            </dd>
            <dt>Current studio owner</dt>
            <dd>{data.ownership.ownerAtSnapshot}</dd>
            <dt>Total supply / creator tokens</dt>
            <dd>
              {units(data.baseline.supplyRaw)} /{" "}
              {units(data.baseline.creatorAllocationRaw)}
            </dd>
            <dt>Tokens for launch sales / future liquidity</dt>
            <dd>
              {units(data.baseline.saleSupplyRaw)} /{" "}
              {units(data.baseline.graduationInventoryRaw)}
            </dd>
            <dt>Trading fees: creator / studio / platform</dt>
            <dd>
              {data.baseline.creatorBps / 100}% /{" "}
              {data.baseline.studioBps / 100}% /{" "}
              {data.baseline.platformBps / 100}%
            </dd>
            <dt>Maximum spend / approved spending limit</dt>
            <dd>
              {units(data.funding.requiredRaw)} /{" "}
              {units(data.funding.allowanceRaw)} CHOG
            </dd>
            <dt>Expected token address</dt>
            <dd>
              {data.preflight.simulatedTokenAddress ??
                "Available once launch checks pass"}
            </dd>
            <dt>Network fee</dt>
            <dd>
              Your wallet will show the fee before you confirm.
            </dd>
            {paid&&data.firstBuy&&<><dt>Estimated tokens received</dt><dd>{units(data.firstBuy.tokenOutRaw)} {symbol}</dd><dt>Estimated CHOG spent</dt><dd>{units(data.firstBuy.spentRaw)} CHOG</dd></>}
            <dt>Actual first-buy spend / output</dt>
            <dd>
              Shown after launch; transaction confirmation is
              required
            </dd>
          </dl>
          <details>
            <summary>Transaction details</summary>
            <p>Estimated gas units: {data.preflight.gasEstimateRaw ?? "Not available"}</p>
            <p className="note">{data.ownership.policy} {data.baseline.policy} {data.preflight.policy}</p>
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
          {needsApproval?<div className="wallet-action"><p>Approve the app to spend up to {units(data.funding.requiredRaw)} CHOG for your first buy. You confirm this in your wallet before launching.</p><button type="button" className="primary" onClick={event=>inspect(event,true)}>Approve CHOG to continue</button></div>:<WalletAction
            wallet={wallet}
            body={data}
            kind={data.approval ? "approval" : "preflight"}
            path={data.requestPath}
            label={
              data.approval
                ? data.approval.steps[0]?.kind === "reset"
                  ? "Reset CHOG spending approval in wallet"
                  : `Approve ${units(data.approval.requiredRaw)} CHOG in wallet`
                : "Launch token in wallet"
            }
            onFinalized={actionConfirmed}
          />}
          </>}
        </div>
        </Modal>
        </>
      )}
      <details className="launch-receipt-panel"><summary>Already launched? Verify your transaction ↗</summary><LaunchReceipt nftId={id} wallet={creator} /></details>
      </div>
      <LaunchSummary id={id} name={name} symbol={symbol} budget={budget} creator={creator}/>
      </div>
    </section>
  );
}
