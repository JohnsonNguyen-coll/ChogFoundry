import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import useApi from "../hooks/useApi.js";
import StudioProfile from "../StudioProfile.jsx";
import { useSelectedWallet } from "../WalletProvider.jsx";
import { LoadState, ChainLink, Provenance } from "../components/Onchain.jsx";
import { api } from "../lib/api.mjs";
import NftArtwork from "../components/NftArtwork.jsx";
export default function StudioPage() {
  const { id } = useParams(),
    { wallet } = useSelectedWallet(),
    [refresh, setRefresh] = useState(0),
    {
      data: studio,
      error,
      loading,
    } = useApi(/^(0|[1-9][0-9]*)$/.test(id) ? `/studios/${id}` : null, refresh),
    [busy, setBusy] = useState(false),
    [actionError, setError] = useState(""),
    [transfers, setTransfers] = useState(null);
  const transferRequest = useRef(null);
  const tokens=useApi(/^(0|[1-9][0-9]*)$/.test(id)?`/studios/${id}/tokens`:null,refresh);
  useEffect(() => {
    setTransfers(null);
    setError("");
    return () => transferRequest.current?.abort();
  }, [id]);
  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!/^(0|[1-9][0-9]*)$/.test(id))
    return <p className="message error">Invalid studio link.</p>;
  return (
    <>
      <Link className="back-link" to="/app/studios">
        ← Your studios
      </Link>
      <LoadState error={error || actionError} loading={loading} />
      {studio && (
        <>
          <section className="page-intro">
            <span className="eyebrow">
              {studio.nft.collectionName} / STUDIO #{studio.nft.tokenId}
            </span>
            <h1>
              {studio.profile?.name || `${studio.nft.collectionName} Studio #${studio.nft.tokenId}`}
            </h1>
            <p>
              {studio.profile?.description ||
                "A new chapter starts with your studio NFT."}
            </p>
          </section>
          <div className="studio-community-links">
            <Link className="primary" to={`/app/launch?studio=${id}`}>
              Launch token ↗
            </Link>
            <Link className="secondary" to={`/app/clubs/${id}`}>
              Enter studio club
            </Link>
            <Link className="secondary" to={`/app/agent/${id}`}>
              Ask Claude
            </Link>
          </div>
          <section className="studio-token-list">
            <div className="section-heading"><h2>Studio tokens</h2><Link className="primary" to={`/app/launch?studio=${id}`}>Launch token ↗</Link></div>
            <LoadState loading={tokens.loading} error={tokens.error}/>
            {tokens.data?.assets.map(a=><article key={a.token.address} className="studio-token-row"><div><strong>{a.token.name}</strong><span> {a.token.symbol}</span></div><div className="profile-actions"><Link to={`/app/markets/${a.token.address}`}>Trade & chart ↗</Link><Link to={`/app/clubs/${id}`}>Join discussion ↗</Link></div></article>)}
            {tokens.data&&!tokens.data.assets.length&&<p className="note">No tokens launched from this studio yet. Launch your first token to open its market.</p>}
          </section>
          <article className="nft-card">
            <NftArtwork id={id} collection={studio.nft.collection} tokenURI={studio.nft.tokenURI} collectionName={studio.nft.collectionName}/>
            <dl>
              <dt>Current owner</dt>
              <dd>
                <ChainLink address={studio.nft.owner} />
              </dd>
              <dt>Collection</dt>
              <dd>
                <ChainLink address={studio.nft.collection} />
              </dd>
              <dt>Studio identity</dt>
              <dd>Monad · {studio.nft.collectionName} #{studio.nft.tokenId}</dd>
            </dl>
            {studio.nft.ownerHasCode && (
              <p className="note">
                The literal owner has contract code. No beneficial owner is
                inferred.
              </p>
            )}
            <details>
              <summary>NFT metadata and onchain source</summary>
              <code>{studio.nft.tokenURI}</code>
              <Provenance data={studio.provenance} />
            </details>
            <StudioProfile
              key={`${id}:${wallet}`}
              studio={studio}
              wallet={wallet}
              busy={busy}
              run={run}
              onProfile={() => setRefresh((n) => n + 1)}
            />
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  transferRequest.current?.abort();
                  const controller = new AbortController();
                  transferRequest.current = controller;
                  const data = await api(
                    `/studios/${id}/transfers`,
                    controller.signal,
                  );
                  if (!controller.signal.aborted) setTransfers(data);
                })
              }
            >
              View recent ownership transfers
            </button>
            {transfers && (
              <div className="transfer-list">
                <p>
                  Blocks {transfers.range.fromBlock}–{transfers.range.toBlock}.
                  Bounded window, not complete ownership history.
                </p>
                {transfers.transfers.length ? (
                  transfers.transfers.map((t) => (
                    <p key={`${t.transactionHash}:${t.logIndex}`}>
                      <ChainLink address={t.from} /> →{" "}
                      <ChainLink address={t.to} />
                    </p>
                  ))
                ) : (
                  <p>No transfers in this window.</p>
                )}
                <Provenance data={transfers.provenance} />
              </div>
            )}
          </article>
        </>
      )}
    </>
  );
}
