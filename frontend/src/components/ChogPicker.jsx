import React from "react";
import { Link } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ChogArtwork from "./ChogArtwork.jsx";
import useWalletAssets from "../hooks/useWalletAssets.js";
import { LoadState, Provenance } from "./Onchain.jsx";
export default function ChogPicker({ launch = false }) {
  const { wallet, data, error, loading } = useWalletAssets();
  return (
    <section className="chog-picker">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR CHOG / YOUR STUDIO</span>
          <h2>{launch ? "Choose your launch studio." : "Your studios."}</h2>
        </div>
      </div>
      <p className="note">
        Each Chog in your wallet opens its own studio. Select yours to{" "}
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
            <h3>Bring your Chog.</h3>
            <p>Connect the wallet holding your Chog to see your studios.</p>
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
                  <Link
                    className="studio-preview chog-choice"
                    to={
                      launch ? `/app/launch?studio=${id}` : `/app/studios/${id}`
                    }
                    key={id}
                  >
                    <span className="studio-glyph">◇</span>
                    <span className="caption">CHOG GENESIS</span>
                    <h3>Studio #{id}</h3>
                    <span className="text-link">
                      {launch ? "Prepare launch" : "Open studio"} ↗
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty">
                <h3>No Chog in this wallet.</h3>
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
