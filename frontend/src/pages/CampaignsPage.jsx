import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import useApi from "../hooks/useApi.js";
import useWalletSession from "../hooks/useWalletSession.js";
import useCommunityAction from "../hooks/useCommunityAction.js";
import RaffleWalletReview from "../components/RaffleWalletReview.jsx";
import WalletSession from "../components/WalletSession.jsx";
import { LoadState } from "../components/Onchain.jsx";
import { communityRequest, timestamp, postId } from "../lib/community.mjs";
import {useConnectModal,useChainModal,useAccountModal} from '@rainbow-me/rainbowkit';
import {useSelectedWallet} from '../WalletProvider.jsx';
import {xLinkControl} from '../lib/x-link.mjs';
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
  const connection=useSelectedWallet(),{openConnectModal}=useConnectModal(),{openChainModal}=useChainModal(),{openAccountModal}=useAccountModal();
  const [linkIntent,setLinkIntent]=useState(null);
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
  function startXLink(){
    action.run(async signal=>{
      const result=await communityRequest('/x/start',{},signal);
      if(!signal.aborted)window.location.assign(result.url);
      return 'Opening X authorization.';
    });
  }
  useEffect(()=>{
    if(!linkIntent)return;
    if(linkIntent!==auth.wallet||auth.error){setLinkIntent(null);return;}
    if(auth.matches){setLinkIntent(null);startXLink();}
  },[linkIntent,auth.wallet,auth.matches,auth.error]);
  const linkControl=xLinkControl({auth,connection,configured:configuration.data?.xConfigured,loading:configuration.loading,busy:action.busy,linked:!!points.data?.link});
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
    <div className="campaign-page">
      <div className="campaign-overview">
      <section className="campaign-hero">
        <span className="eyebrow">CHOG FOUNDRY / CAMPAIGNS</span>
        <h1>A little action.<br/><span>A bigger community.</span></h1>
        <p>
          Support{" "}
          <a href="https://x.com/ChogNFT" target="_blank" rel="noreferrer">
            @ChogNFT on X
          </a>
          , complete community tasks and earn points for showing up.
        </p>
        <a className="secondary campaign-browse" href="#engagement-tasks">Explore tasks</a>
        <div className="campaign-hero-foot"><span>No purchase needed</span><span>You choose what to share</span></div>
      </section>
      <section className="community-account campaign-account">
        <div>
          <div className="campaign-account-heading"><span className="eyebrow">YOUR POINTS</span><span className={`campaign-badge ${points.data?.link?'is-linked':''}`}>{points.data?.link?'X connected':'Connect X to begin'}</span></div>
          <h2>
            {points.data
              ? points.data.balance
              : auth.matches
                ? points.loading ? "Loading…" : "Unavailable"
                : "Sign in to view"}
          </h2>
          <p>
            {points.data?.link
              ? "@" + points.data.link.username
              : "Connect your X account to verify tasks and collect points."}
          </p>
          <span className="note">Earned through verified community tasks.</span>
        </div>
        <button
          className={points.data?.link?"secondary":"primary"}
          disabled={
            linkControl.disabled
          }
          onClick={()=>{
            if(linkControl.step==='network'){openChainModal?.();return;}
            if(linkControl.step==='connect'){openConnectModal?.();return;}
            if(linkControl.step==='reconnect'){openAccountModal?.();return;}
            if(linkControl.step==='signin'){setLinkIntent(auth.wallet);void auth.signIn();return;}
            startXLink();
          }}
        >
          {linkControl.label}
        </button>
      </section>
      </div>
      <WalletSession auth={auth} />
      <LoadState loading={tasks.loading || campaigns.loading || detail.loading} error={action.error || configuration.error || tasks.error || campaigns.error || points.error || detail.error || state.error}/>
      {action.notice && <p className="message" role="status">{action.notice}</p>}
      <div className="campaign-steps">
        <div><span>01</span><div><strong>Connect your X</strong><p>One account, linked to your wallet.</p></div></div>
        <div><span>02</span><div><strong>Pick a task</strong><p>Follow, like, reply or repost on X.</p></div></div>
        <div><span>03</span><div><strong>Verify & earn</strong><p>Return here to collect your points.</p></div></div>
      </div>
      {auth.wallet&&!auth.matches&&!auth.checking&&<p className="note">Sign a wallet message to link X. This does not send a transaction or cost gas.</p>}
      {connection.error&&<p className="message error" role="alert">{connection.error} Reconnect your wallet using the account menu.</p>}
      {configuration.data && !configuration.data.xConfigured && (
        <p className="message">
          X connections are not available yet. Please check back later.
        </p>
      )}
      <section className="campaign-task-section" id="engagement-tasks">
        <div className="section-heading">
          <div><span className="eyebrow">SMALL ACTIONS, SHARED IDEAS</span><h2>Community tasks <span className="campaign-task-count">{tasks.data?.tasks.length??'—'}</span></h2><p>Choose a task, complete it on X, then verify it here.</p></div>
          <button className="secondary" disabled={tasks.loading} onClick={() => setRefresh((n) => n + 1)}>{tasks.loading?'Refreshing…':'Refresh tasks'}</button>
        </div>
        <div className="engagement-grid">
          {tasks.data?.tasks.map((t) => (
            <article className="engagement-task" key={t.id}>
              <div className="campaign-task-top"><span className="campaign-badge">{t.kind.charAt(0).toUpperCase()+t.kind.slice(1)}</span><strong className="task-points">+{t.points} <small>pts</small></strong></div>
              <h3>{t.title}</h3>
              <p className="note">
                {timestamp(t.starts_at)} to {timestamp(t.ends_at)}
              </p>
              <a className="secondary campaign-task-link"
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
                className="primary"
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
                {Date.parse(t.ends_at)<=Date.now()?'Task ended':Date.parse(t.starts_at)>Date.now()?'Starts soon':!points.data?.link?'Connect X to verify':action.busy?'Verifying…':'Verify & earn points'}
              </button>
            </article>
          ))}
        </div>
        {tasks.data && !tasks.data.tasks.length && (
          <div className="campaign-empty"><span className="campaign-empty-symbol" aria-hidden="true">✦</span><h3>The next task starts here.</h3><p>No tasks have been published yet. Once the organizer adds one, you’ll find the action and points here.</p><a className="secondary" href="https://x.com/ChogNFT" target="_blank" rel="noreferrer">Visit @ChogNFT on X</a>{configuration.data?.admin&&<a className="text-link" href="#campaign-organizer">Publish your first task</a>}</div>
        )}
      </section>
      {!id && (
        <section className="campaign-raffles">
          <div className="section-heading"><div><span className="eyebrow">PUT YOUR POINTS TO WORK</span><h2>NFT raffles</h2></div><span className="campaign-badge">{configuration.data?.raffleConfigured&&configuration.data?.campaignsEnabled?'Community rewards':'Waiting for treasury NFT prizes'}</span></div>
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
                <p>Studio collection NFT #{c.prize_token_id}</p>
                <p>
                  {c.entry_points} points per entry / {c.entry_count} entries
                </p>
                <small>Closes {timestamp(c.ends_at)}</small>
              </Link>
            ))}
          </div>
          {campaigns.data && !campaigns.data.campaigns.length && (
            <p className="campaign-raffle-note">Raffles will open when eligible NFT prizes from the treasury are ready and the organizer publishes a draw. Prize details and entry requirements will appear here.</p>
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
            <dd>One NFT from the active studio collection</dd>
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
                rules. Prepare the transaction, then review it before
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
                          return "Transaction checked. Review its details and fee before confirming in your wallet.";
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
      <details className="campaign-points-info"><summary>How points and verification work</summary><p className="note">Points are earned from verified X tasks. They cannot be bought, sold or transferred, and trading does not earn points. We only read your X activity; we never post for you. Each wallet can link one X account. Verification may be delayed if X is unavailable or the activity cannot be found.</p></details>
      {configuration.data?.admin && (
        <details className="community-admin" id="campaign-organizer">
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
              Actual prize NFT token ID
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
    </div>
  );
}
