import React from "react";
import { short } from "../lib/api.mjs";
export function ChainLink({ address, children }) {
  return (
    <a
      href={`https://monadscan.com/address/${address}`}
      target="_blank"
      rel="noreferrer"
    >
      {children || short(address)} ↗
    </a>
  );
}
export function Provenance({ data }) {
  if (!data) return null;
  return (
    <details className="provenance">
      <summary>
        Onchain source · block {data.blockNumber} · {data.finality}
      </summary>
      <p>
        {data.blockTime} · read {data.fetchedAt}
      </p>
      <code>{data.blockHash}</code>
      <p>{data.rpcOrigin}</p>
    </details>
  );
}
export function LoadState({ loading, error }) {
  return error ? (
    <div className="message error" role="alert">
      {error}
    </div>
  ) : loading ? (
    <p className="note" role="status">
      Reading live data…
    </p>
  ) : null;
}
