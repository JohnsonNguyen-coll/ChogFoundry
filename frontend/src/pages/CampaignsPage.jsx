import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import useApi from "../hooks/useApi.js";
import useWalletSession from "../hooks/useWalletSession.js";
import useCommunityAction from "../hooks/useCommunityAction.js";
import RaffleWalletReview from "../components/RaffleWalletReview.jsx";
import WalletSession from "../components/WalletSession.jsx";
import { LoadState } from "../components/Onchain.jsx";
import { communityRequest, timestamp, postId } from "../lib/community.mjs";
const date = (value) => new Date(value).toISOString();
export default function CampaignsPage() {
  const { id } = useParams(),
    auth = useWalletSession(),
    location = useLocation(),
    navigate = useNavigate(),
    [refresh, setRefresh] = useState(0),
    [replies, setReplies] = useState({}),
    [prepared, setPrepared] = useState(null),
    action = useCommunityAction(
      `${auth.wallet}:${id}:${auth.session?.expiresAt}`,
    ),
    oauthHandled = useRef(false);
  const configuration = useApi(
      "/community?wallet=" + (auth.session?.wallet || ""),
      refresh,
    ),
    tasks = useApi("/engagement/tasks", refresh),
    campaigns = useApi("/campaigns", refresh),
    points = useApi(
      auth.matches ? "/points?wallet=" + auth.wallet : null,
      refresh,
    ),
    detail = useApi(id ? "/campaigns/" + id : null, refresh),
    state = useApi(
      id && configuration.data?.raffleConfigured
        ? `/campaigns/${id}/state`
        : null,
      refresh,
    ),
    manifest = detail.data?.campaign.manifest_json;
  useEffect(() => {
    setPrepared(null);
  }, [id, auth.wallet, auth.session?.expiresAt]);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (
      !q.get("state") ||
      !q.get("code") ||
      !auth.matches ||
      oauthHandled.current
    )
      return;
    oauthHandled.current = true;
    action.run(async (signal) => {
      await communityRequest(
        "/x/finish",
        { state: q.get("state"), code: q.get("code") },
        signal,
      );
      if (!signal.aborted) {
        navigate("/app/campaigns", { replace: true });
        setRefresh((n) => n + 1);
      }
      return "X account linked. Verify each action to earn points.";
    });
  }, [auth.matches, location.search]);
  const save = async (path, input, signal) => {
    const result = await communityRequest(path, input, signal);
    if (!signal.aborted) setRefresh((n) => n + 1);
    return result;
  };
  return (
    <>
      <section className="page-intro">
        <span className="eyebrow">CHOG FOUNDRY / COMMUNITY CAMPAIGNS</span>
        <h1>Show up. Earn points. Join the draw.</h1>
        <p>
          Engage with{" "}
          <a href="https://x.com/ChogNFT" target="_blank" rel="noreferrer">
            @ChogNFT on X
          </a>
          , verify your actions and use earned points to enter free NFT raffles.
        </p>
      </section>
      <WalletSession auth={auth} />
      <LoadState
        loading={tasks.loading || campaigns.loading || detail.loading}
        error={
          action.error ||
          configuration.error ||
          tasks.error ||
          campaigns.error ||
          points.error ||
          detail.error ||
          state.error
        }
      />
      {action.notice && <p role="status">{action.notice}</p>}
      <div className="campaign-flow">
        <span>1. Link wallet + X</span>
        <span>2. Verify engagement</span>
        <span>3. Spend earned points</span>
        <span>4. Onchain random draw</span>
      </div>
      <section className="community-account">
        <div>
          <span className="caption">YOUR ENGAGEMENT POINTS</span>
          <h2>
            {points.data
              ? points.data.balance
              : auth.matches
                ? "Unavailable"
                : "Sign in to view"}
          </h2>
          <p>
            {points.data?.link
              ? "Linked X: @" + points.data.link.username
              : "Link an X account for read-only verification."}
          </p>
        </div>
        <button
          className="secondary"
          disabled={
            !auth.matches || !configuration.data?.xConfigured || action.busy
          }
          onClick={() =>
            action.run(async (signal) => {
              const r = await communityRequest("/x/start", {}, signal);
              if (!signal.aborted) window.location.assign(r.url);
              return "Opening X authorization.";
            })
          }
        >
          Link / reauthorize X
        </button>
      </section>
      <p className="note">
        Points cannot be bought, sold or transferred. No trading-volume rewards.
        One linked X account per wallet is not proof of one person. X
        permissions are read-only; actions are performed manually. API access or
        an incomplete scan can prevent verification.
      </p>
      {configuration.data && !configuration.data.xConfigured && (
        <p className="message">
          X OAuth is not configured yet. No unverified actions receive points.
        </p>
      )}
      <section>
        <div className="section-heading">
          <h2>Engagement tasks</h2>
          <button onClick={() => setRefresh((n) => n + 1)}>Refresh</button>
        </div>
        <div className="engagement-grid">
          {tasks.data?.tasks.map((t) => (
            <article className="engagement-task" key={t.id}>
              <span className="caption">{t.kind.toUpperCase()}</span>
              <strong className="task-points">{t.points} points</strong>
              <h3>{t.title}</h3>
              <p className="note">
                {timestamp(t.starts_at)} to {timestamp(t.ends_at)}
              </p>
              <a
                href={
                  t.kind === "follow"
                    ? "https://x.com/ChogNFT"
                    : `https://x.com/ChogNFT/status/${t.target_post_id}`
                }
                target="_blank"
                rel="noreferrer"
              >
                Open task on X
              </a>
              {t.kind === "reply" && (
                <label>
                  Your reply URL or post ID
                  <input
                    value={replies[t.id] || ""}
                    onChange={(e) =>
                      setReplies({ ...replies, [t.id]: e.target.value })
                    }
                  />
                </label>
              )}
              <button
                disabled={
                  !auth.matches ||
                  !points.data?.link ||
                  action.busy ||
                  Date.parse(t.starts_at) > Date.now() ||
                  Date.parse(t.ends_at) <= Date.now()
                }
                onClick={() =>
                  action.run(async (signal) => {
                    const r = await save(
                      `/engagement/tasks/${t.id}/verify`,
                      {
                        replyId:
                          t.kind === "reply"
                            ? postId(replies[t.id] || "")
                            : undefined,
                      },
                      signal,
                    );
                    return r.alreadyClaimed
                      ? "Already verified; no duplicate points."
                      : `${r.credited} verified engagement points earned.`;
                  })
                }
              >
                Verify action
              </button>
            </article>
          ))}
        </div>
        {tasks.data && !tasks.data.tasks.length && (
          <p className="empty">
            No engagement tasks have been published. Point values are set
            explicitly by the organizer.
          </p>
        )}
      </section>
      {!id && (
        <section>
          <h2>NFT raffles</h2>
          <div className="studio-grid">
            {campaigns.data?.campaigns.map((c) => (
              <Link
                className="studio-preview"
                to={`/app/campaigns/${c.id}`}
                key={c.id}
              >
                <span className="caption">
                  {c.status.toUpperCase()} / ONE NFT PRIZE
                </span>
                <h3>{c.title}</h3>
                <p>Chog Genesis #{c.prize_token_id}</p>
                <p>
                  {c.entry_points} points per entry / {c.entry_count} entries
                </p>
                <small>Closes {timestamp(c.ends_at)}</small>
              </Link>
            ))}
          </div>
          {campaigns.data && !campaigns.data.campaigns.length && (
            <p className="empty">
              No campaigns have been created yet. No fake prizes or placeholder
              winners.
            </p>
          )}
        </section>
      )}
      {detail.data && (
        <section className="campaign-detail">
          <Link to="/app/campaigns">All campaigns</Link>
          <h2>{detail.data.campaign.title}</h2>
          <span className="caption">
            {detail.data.campaign.status} / CHOG #
            {detail.data.campaign.prize_token_id}
          </span>
          <p className="user-content">{detail.data.campaign.rules}</p>
          <dl>
            <dt>Entry requirement</dt>
            <dd>
              {detail.data.campaign.entry_points} earned points; one entry per
              wallet/X account
            </dd>
            <dt>Prize count</dt>
            <dd>One Chog Genesis NFT</dd>
            <dt>Opens</dt>
            <dd>{timestamp(detail.data.campaign.starts_at)}</dd>
            <dt>Closes</dt>
            <dd>{timestamp(detail.data.campaign.ends_at)}</dd>
            <dt>Selection</dt>
            <dd>
              Frozen public list, committed Merkle root, Pyth Entropy on Monad
            </dd>
          </dl>
          <p className="note">
            The organizer pays the native MON randomness fee. The winning NFT
            goes to the committed wallet. No token purchase or payment creates
            entries. Offchain task eligibility remains organizer-operated and
            publicly auditable.
          </p>
          <button
            className="primary"
            disabled={
              !auth.matches ||
              action.busy ||
              detail.data.campaign.status !== "open" ||
              !state.data?.state.exists ||
              state.data?.state.cancelled
            }
            onClick={() =>
              action.run(async (signal) => {
                const r = await save(`/campaigns/${id}/enter`, {}, signal);
                return `Entry recorded. ${r.pointsSpent} earned points spent.`;
              })
            }
          >
            Use {detail.data.campaign.entry_points} points to enter
          </button>
          {state.data && (
            <details open>
              <summary>Canonical raffle state</summary>
              <dl>
                <dt>Prize escrowed</dt>
                <dd>
                  {state.data.state.exists &&
                  !state.data.state.cancelled &&
                  !state.data.state.claimed
                    ? "Yes"
                    : "No / already distributed"}
                </dd>
                <dt>Randomness request</dt>
                <dd>
                  {state.data.state.sequence === "0"
                    ? "Not requested"
                    : state.data.state.sequence}
                </dd>
                <dt>Randomness received</dt>
                <dd>{state.data.state.ready ? "Yes" : "No"}</dd>
                <dt>Prize distributed</dt>
                <dd>{state.data.state.claimed ? "Yes" : "No"}</dd>
                {state.data.state.ready && manifest && (
                  <>
                    <dt>Winning wallet</dt>
                    <dd>
                      {manifest.entries[state.data.state.winnerIndex]?.wallet ||
                        "Manifest unavailable"}
                    </dd>
                  </>
                )}
              </dl>
              <p className="note">
                Block {state.data.provenance.blockNumber} /{" "}
                {state.data.provenance.blockHash}
              </p>
            </details>
          )}
          {manifest && (
            <details>
              <summary>
                Frozen entry manifest ({manifest.entries.length} wallets)
              </summary>
              <pre>{JSON.stringify(manifest, null, 2)}</pre>
            </details>
          )}
          {configuration.data?.admin && (
            <details className="community-admin">
              <summary>Raffle administration</summary>
              <p className="note">
                Publishing requires the actual NFT escrow and matching onchain
                rules. Prepare exact calldata, then review it separately before
                confirming in your wallet. Draft creation never sends a
                transaction.
              </p>
              <div className="profile-actions">
                {["publish", "freeze", "refund"].map((op) => (
                  <button
                    key={op}
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async (signal) => {
                        await save(`/campaigns/${id}/${op}`, {}, signal);
                        return op === "refund"
                          ? "Verified cancellation and point refunds recorded."
                          : `${op} completed.`;
                      })
                    }
                  >
                    {op}
                  </button>
                ))}
              </div>
              <div className="profile-actions">
                {["approve", "create", "commit", "draw", "claim", "cancel"].map(
                  (op) => (
                    <button
                      key={op}
                      disabled={
                        action.busy || !configuration.data.raffleConfigured
                      }
                      onClick={() =>
                        action.run(async (signal) => {
                          setPrepared(null);
                          const seed =
                            op === "draw"
                              ? "0x" +
                                Array.from(
                                  crypto.getRandomValues(new Uint8Array(32)),
                                  (n) => n.toString(16).padStart(2, "0"),
                                ).join("")
                              : undefined;
                          const r = await communityRequest(
                            `/campaigns/${id}/prepare`,
                            { action: op, seed },
                            signal,
                          );
                          if (!signal.aborted)
                            setPrepared({
                              body: r,
                              request: { action: op, seed },
                            });
                          return "Unsigned action simulated; inspect exact calldata and fee before any wallet action.";
                        })
                      }
                    >
                      Prepare {op}
                    </button>
                  ),
                )}
              </div>
              {prepared && (
                <>
                  <p className="note">{prepared.body.policy}</p>
                  <pre>{JSON.stringify(prepared.body, null, 2)}</pre>
                  <RaffleWalletReview
                    key={JSON.stringify(prepared.request)}
                    body={prepared.body}
                    request={prepared.request}
                    campaignId={id}
                    auth={auth}
                    enabled={configuration.data?.campaignsEnabled}
                    onFinalized={() => {
                      setPrepared(null);
                      setRefresh((n) => n + 1);
                    }}
                  />
                </>
              )}
            </details>
          )}
        </section>
      )}
      {points.data && (
        <details>
          <summary>Your points ledger</summary>
          {points.data.ledger.map((r) => (
            <p key={r.id}>
              {r.delta} / {r.kind} / {timestamp(r.created_at)}
            </p>
          ))}
        </details>
      )}
      {configuration.data?.admin && (
        <details className="community-admin">
          <summary>Organizer configuration</summary>
          <form
            className="community-compose"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action.run(async (signal) => {
                await save(
                  "/engagement/tasks",
                  {
                    kind: f.get("kind"),
                    title: f.get("title"),
                    points: Number(f.get("points")),
                    targetPostId: f.get("post")
                      ? postId(f.get("post"))
                      : undefined,
                    startsAt: date(f.get("start")),
                    endsAt: date(f.get("end")),
                  },
                  signal,
                );
                return "Immutable engagement task published.";
              });
            }}
          >
            <h3>Publish a verified X task</h3>
            <label>
              Action
              <select name="kind">
                <option value="follow">Follow @ChogNFT</option>
                <option value="like">Like a Chog post</option>
                <option value="reply">Reply to a Chog post</option>
                <option value="repost">Repost a Chog post</option>
              </select>
            </label>
            <label>
              Title
              <input name="title" required maxLength={100} />
            </label>
            <label>
              Target post URL (not needed for follow)
              <input name="post" />
            </label>
            <label>
              Points
              <input
                name="points"
                required
                type="number"
                min="1"
                max="1000000"
              />
            </label>
            <label>
              Starts
              <input name="start" required type="datetime-local" />
            </label>
            <label>
              Ends
              <input name="end" required type="datetime-local" />
            </label>
            <button disabled={action.busy}>
              Verify target and publish task
            </button>
          </form>
          <form
            className="community-compose"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action.run(async (signal) => {
                const c = await save(
                  "/campaigns",
                  {
                    title: f.get("title"),
                    rules: f.get("rules"),
                    prizeTokenId: f.get("prize"),
                    entryPoints: Number(f.get("points")),
                    maxEntries: Number(f.get("capacity")),
                    startsAt: date(f.get("start")),
                    endsAt: date(f.get("end")),
                  },
                  signal,
                );
                if (!signal.aborted) navigate(`/app/campaigns/${c.id}`);
                return "Draft saved. This is not a live raffle.";
              });
            }}
          >
            <h3>Create an NFT raffle draft</h3>
            <label>
              Title
              <input name="title" required maxLength={100} />
            </label>
            <label>
              Public rules
              <textarea name="rules" required rows={4} maxLength={4000} />
            </label>
            <label>
              Actual prize Chog token ID
              <input name="prize" required pattern="(0|[1-9][0-9]*)" />
            </label>
            <label>
              Earned points per entry
              <input name="points" required type="number" min="1" />
            </label>
            <label>
              Entry capacity
              <input
                name="capacity"
                required
                type="number"
                min="1"
                max="5000"
              />
            </label>
            <label>
              Starts
              <input name="start" required type="datetime-local" />
            </label>
            <label>
              Ends
              <input name="end" required type="datetime-local" />
            </label>
            <button disabled={action.busy}>Save raffle draft</button>
          </form>
        </details>
      )}
    </>
  );
}
