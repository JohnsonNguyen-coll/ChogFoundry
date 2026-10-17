import React from "react";
import { Link } from "react-router-dom";
import useApi from "../hooks/useApi.js";
import { amount } from "../lib/api.mjs";
import { LoadState, ChainLink, Provenance } from "../components/Onchain.jsx";
import NetworkReadiness from "../NetworkReadiness.jsx";
export default function NetworkPage() {
  const { data, error, loading } = useApi("/overview");
  return (
    <>
      <section className="page-intro">
        <span className="eyebrow">MONAD / LIVE ONCHAIN</span>
        <h1>The onchain foundation.</h1>
        <p>Actual assets, explicit deployment status and verifiable sources.</p>
      </section>
      <LoadState loading={loading} error={error} />
      {data && (
        <>
          <div className="stats">
            <article>
              <span className="caption">QUOTE ASSET</span>
              <h3>{data.quote.symbol}</h3>
              <ChainLink address={data.quote.address} />
            </article>
            <article>
              <span className="caption">CHOG TOTAL SUPPLY</span>
              <h3>{amount(data.quote.totalSupply)}</h3>
            </article>
            <article>
              <span className="caption">CHOG GENESIS SUPPLY</span>
              <h3>{amount(data.collection.totalSupply)}</h3>
              <ChainLink address={data.collection.address} />
            </article>
          </div>
          <Provenance data={data.provenance} />
        </>
      )}
      <NetworkReadiness />
      <details className="advanced-tools">
        <summary>Advanced inspection</summary>
        <p className="note">
          Inspect a public launch configuration or receipt without connecting
          its owner wallet. Inspection grants no ownership or signing authority.
        </p>
        <Link className="secondary" to="/app/launch/inspect">
          Open launch inspection ↗
        </Link>
      </details>
    </>
  );
}
