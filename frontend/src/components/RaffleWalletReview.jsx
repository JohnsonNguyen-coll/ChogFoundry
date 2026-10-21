import React, { useEffect, useRef, useState } from "react";
import { useSelectedWallet } from "../WalletProvider.jsx";
import { communityRequest } from "../lib/community.mjs";
import { reviewedRaffle } from "../raffle-wallet.mjs";
import {
  submitReviewedTransaction,
  inspectTransaction,
} from "../wallet-transaction.mjs";
import {
  pendingFor,
  subscribe,
  updateTransaction,
} from "../transaction-journal.mjs";
import { units } from "../market-format.mjs";
export default function RaffleWalletReview({
  body,
  campaignId,
  request,
  auth,
  enabled,
  onFinalized,
}) {
  const { provider } = useSelectedWallet(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [state, setState] = useState(null),
    [, rerender] = useState(0),
    life = useRef(null),
    pending = useRef(null);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    return () => c.abort();
  }, []);
  useEffect(() => subscribe(() => rerender((n) => n + 1)), []);
  async function sign() {
    if (busy || pending.current) return;
    const signal = life.current.signal;
    setBusy(true);
    setError("");
    try {
      if (!enabled || !auth.matches || !provider)
        throw new Error(
          "Configured raffle execution and the signed-in organizer wallet are required.",
        );
      const configuration = await communityRequest(
        "/community",
        undefined,
        signal,
      );
      if (
        !configuration.campaignsEnabled ||
        !configuration.admin ||
        !configuration.raffleConfigured
      )
        throw new Error("Raffle execution is unavailable.");
      const review = reviewedRaffle(body, auth.wallet),
        fresh = await communityRequest(
          `/campaigns/${campaignId}/prepare`,
          request,
          signal,
        ),
        freshReview = reviewedRaffle(fresh, auth.wallet);
      pending.current = await submitReviewedTransaction(
        provider,
        review,
        freshReview,
        {
          wallet: auth.wallet,
          signal,
          onState: (value) => {
            if (!signal.aborted) setState(value);
          },
        },
      );
    } catch (e) {
      if (!signal.aborted) setError(e.message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  async function check() {
    if (!pending.current || busy) return;
    const signal = life.current.signal;
    setBusy(true);
    setError("");
    try {
      const result = await inspectTransaction(
        provider,
        pending.current.hash,
        pending.current.transaction,
      );
      updateTransaction(pending.current.hash, result);
      if (!signal.aborted) setState(result);
      if (["finalized", "reverted"].includes(result.status)) {
        pending.current = null;
        if (result.status === "finalized" && !signal.aborted) onFinalized?.();
      }
    } catch (e) {
      if (!signal.aborted) setError(e.message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="wallet-action">
      <dl>
        <dt>Action</dt>
        <dd>{body.action}</dd>
        <dt>Native value</dt>
        <dd>{units(BigInt(body.transaction.value).toString())} MON</dd>
        <dt>Gas estimate</dt>
        <dd>{body.gasEstimateRaw}</dd>
        <dt>Target</dt>
        <dd>{body.transaction.to}</dd>
      </dl>
      <p className="note">
        Your selected wallet confirms this exact transaction. No automatic
        submission or retry. Price/fee changes require a fresh review.
      </p>
      <button
        className="primary"
        disabled={
          !enabled ||
          !auth.matches ||
          busy ||
          !!pending.current ||
          pendingFor(auth.wallet)
        }
        onClick={sign}
      >
        {busy ? "Checking..." : "Confirm reviewed action in wallet"}
      </button>
      {pending.current && (
        <button disabled={busy} onClick={check}>
          Check confirmation
        </button>
      )}
      {state && (
        <p role="status">
          {state.status}
          {state.hash && (
            <>
              {" "}
              /{" "}
              <a
                href={`https://monadscan.com/tx/${state.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                Transaction
              </a>
            </>
          )}
        </p>
      )}
      {error && <p className="message error">{error}</p>}
    </div>
  );
}
