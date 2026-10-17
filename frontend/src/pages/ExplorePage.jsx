import React, { useState } from "react";
import { Link } from "react-router-dom";
import PageIntro from "../components/PageIntro.jsx";
import useApi from "../hooks/useApi.js";
import { LoadState } from "../components/Onchain.jsx";
import { short } from "../lib/api.mjs";
export default function ExplorePage() {
  const [refresh, setRefresh] = useState(0),
    { data, error, loading } = useApi("/studios", refresh);
  return (
    <>
      <PageIntro
        scene="community"
        eyebrow="THE FOUNDRY / EXPLORE"
        title="Ideas find their people."
      >
        <p>Discover Chog studios and the stories behind their next launch.</p>
        <Link className="primary" to="/app/studios">
          Open your studio &#8599;
        </Link>
      </PageIntro>
      <section>
        <div className="section-heading">
          <h2>Explore studios</h2>
          <button onClick={() => setRefresh((n) => n + 1)}>
            Refresh studios ↻
          </button>
        </div>
        <LoadState loading={loading} error={error} />
        {data &&
          (data.profiles.length ? (
            <div className="studio-grid">
              {data.profiles.map((p) => (
                <Link
                  className="studio-preview"
                  to={`/app/studios/${p.tokenId}`}
                  key={p.key}
                >
                  <span className="caption">CHOG GENESIS #{p.tokenId}</span>
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <small>Originally created by {short(p.createdBy)}</small>
                  <span className="text-link">Explore studio ↗</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">
              <span className="empty-orbit">◇</span>
              <h3>The next story could be yours.</h3>
              <p>No studio profiles have been published yet.</p>
              <Link to="/app/studios" className="secondary">
                Choose your Chog ↗
              </Link>
            </div>
          ))}
        <p className="note">{data?.source}</p>
      </section>
    </>
  );
}
