import React from "react";
import { Link } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ChogArtwork from "./ChogArtwork.jsx";
import NftArtwork from "./NftArtwork.jsx";
import useWalletAssets from "../hooks/useWalletAssets.js";
import { LoadState, Provenance } from "./Onchain.jsx";
export default function ChogPicker({ launch = false }) {
  const { wallet, data, error, loading } = useWalletAssets();
  return (
    <section className="chog-picker">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR NFT / YOUR STUDIO</span>
          <h2>{launch ? "Choose your launch studio." : "Your studios."}</h2>
        </div>
      </div>
      <p className="note">
        Each NFT from the active collection opens its own studio. Select yours to{" "}
        {launch
          ? "prepare a token launch"
          : "manage its profile and next launch"}
        .
      </p>
      {!wallet ? (
        <div className="empty illustrated-empty">
          <div className="empty-illustration">
            <ChogArtwork scene={launch ? "guide" : "studios"} eager />
          </div>
          <div className="empty-copy">
            <span className="eyebrow">
              {launch ? "YOUR NEXT CHAPTER" : "A HOME FOR YOUR IDEAS"}
            </span>
            <h3>Bring your studio NFT.</h3>
            <p>Connect the wallet holding an NFT from the active collection to see your studios.</p>
            <div className="connect-prompt">
              <ConnectButton />
            </div>
          </div>
        </div>
      ) : (
        <>
          <LoadState loading={loading} error={error} />
          {data &&
            (data.nfts.tokenIds.length ? (
              <div className="studio-grid">
                {data.nfts.tokenIds.map((id) => (
                  <article
                    className="studio-preview chog-choice"
                    key={id}
                  >
                    <NftArtwork id={id} collection={data.nfts.collection} collectionName={data.nfts.collectionName}/>
                    <span className="caption">{data.nfts.collectionName}</span>
                    <h3>Studio #{id}</h3>
                    <Link className="text-link" to={launch ? `/app/launch?studio=${id}` : `/app/studios/${id}`}>
                      {launch ? "Prepare launch" : "Open studio"} ↗
                    </Link>
                    {!launch&&<Link className="primary" to={`/app/launch?studio=${id}`}>Launch token ↗</Link>}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty">
                <h3>No {data.nfts.collectionName} NFT in this wallet.</h3>
                <p>You can still explore studios and trade Foundry tokens.</p>
                <Link className="secondary" to="/app/markets">
                  Explore markets ↗
                </Link>
              </div>
            ))}
          <Provenance data={data?.provenance} />
        </>
      )}
    </section>
  );
}
