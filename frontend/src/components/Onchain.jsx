import React from "react";
import { short } from "../lib/api.mjs";
import {Spinner} from './Loading.jsx';
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
        Blockchain record · block {data.blockNumber} · {data.finality}
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
    <div className="section-loading"><Spinner label="Loading live data…"/></div>
  ) : null;
}
