import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import useApi from "../hooks/useApi.js";
import useWalletSession from "../hooks/useWalletSession.js";
import useCommunityAction from "../hooks/useCommunityAction.js";
import WalletSession from "../components/WalletSession.jsx";
import { LoadState } from "../components/Onchain.jsx";
import { communityRequest, timestamp } from "../lib/community.mjs";
export default function AgentPage() {
  const { id } = useParams(),
    auth = useWalletSession(),
    [prompt, setPrompt] = useState(""),
    [token, setToken] = useState(""),
    [refresh, setRefresh] = useState(0),
    action = useCommunityAction(
      `${id}:${auth.wallet}:${auth.session?.expiresAt}`,
    ),
    directory = useApi(!id ? "/clubs" : null),
    { data, error, loading } = useApi(
      id && auth.matches ? `/agent/${id}?wallet=${auth.wallet}` : null,
      refresh,
    );
  useEffect(() => {
    setPrompt("");
    setToken("");
  }, [id, auth.wallet]);
  return (
    <>
      <section className="page-intro">
        <span className="eyebrow">CHOG FOUNDRY / CLAUDE</span>
        <h1>Your next idea, with a little help.</h1>
        <p>
          Draft concepts, understand launch settings and summarize public studio
          conversations. You make the final decisions.
        </p>
      </section>
      <WalletSession auth={auth} />
      <LoadState
        loading={loading || directory.loading}
        error={error || directory.error || action.error}
      />
      {!id && (
        <div className="studio-grid">
          {directory.data?.studios.map((s) => (
            <Link
              className="studio-preview"
              to={`/app/agent/${s.id}`}
              key={s.id}
            >
              <h3>{s.name}</h3>
              <span>Open studio assistant</span>
            </Link>
          ))}
          {directory.data && !directory.data.studios.length && (
            <p className="empty">
              Visit a studio to open its assistant. No studio profiles have been
              published yet.
            </p>
          )}
        </div>
      )}
      {id && (
        <section className="agent-workspace">
          <div className="section-heading">
            <h2>Studio #{id} assistant</h2>
            <Link to={`/app/clubs/${id}`}>Visit club</Link>
          </div>
          <p className="note">
            Claude has no wallet or execution tools. Your question, public
            studio profile, current onchain studio snapshot and up to 100 lounge
            posts are sent to Claude. Private assistant history is visible only
            to its signed-in wallet.
          </p>
          {data && !data.configuration.configured && (
            <p className="message">
              Claude is not configured. Add ANTHROPIC_API_KEY and CLAUDE_MODEL
              to the backend environment.
            </p>
          )}
          <div className="agent-history">
            {data?.history.map((r) => (
              <article className="agent-turn" key={r.id}>
                <span className="caption">YOUR QUESTION</span>
                <p className="user-content">{r.prompt}</p>
                <span className="caption">CLAUDE / {r.model}</span>
                <p className="user-content">{r.response}</p>
                <small>{timestamp(r.created_at)}</small>
                <details>
                  <summary>Sources and scope</summary>
                  {r.sources_json.map((s) => (
                    <pre key={s.id}>{JSON.stringify(s, null, 2)}</pre>
                  ))}
                </details>
              </article>
            ))}
          </div>
          <form
            className="community-compose"
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async (signal) => {
                await communityRequest(
                  `/agent/${id}`,
                  { prompt, tokenAddress: token || undefined },
                  signal,
                );
                if (!signal.aborted) {
                  setPrompt("");
                  setRefresh((n) => n + 1);
                }
                return "Claude response saved.";
              });
            }}
          >
            <label>
              Foundry token address (optional onchain inspection)
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="0x..."
              />
            </label>
            <label>
              Ask about this studio
              <textarea
                required
                rows={4}
                maxLength={4000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Help turn our community ideas into a launch concept..."
              />
            </label>
            <button
              className="primary"
              disabled={
                !auth.matches || !data?.configuration.configured || action.busy
              }
            >
              {action.busy ? "Asking Claude..." : "Send to Claude"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
