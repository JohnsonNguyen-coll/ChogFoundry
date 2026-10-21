import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import useApi from "../hooks/useApi.js";
import usePollingApi from "../hooks/usePollingApi.js";
import useWalletSession from "../hooks/useWalletSession.js";
import useCommunityAction from "../hooks/useCommunityAction.js";
import WalletSession from "../components/WalletSession.jsx";
import { LoadState, Provenance } from "../components/Onchain.jsx";
import { communityRequest, timestamp } from "../lib/community.mjs";
import { short } from "../lib/api.mjs";
export default function ClubsPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    auth = useWalletSession(),
    [selectedRoom, setRoom] = useState("lounge"),
    [refresh, setRefresh] = useState(0),
    [draft, setDraft] = useState({
      kind: "message",
      title: "",
      content: "",
      imageUrl: "",
    }),
    [before, setBefore] = useState(null),
    action = useCommunityAction(
      `${id}:${auth.wallet}:${auth.session?.expiresAt}`,
    );
  const directory = useApi(!id ? "/clubs" : null),
    valid = id && /^(0|[1-9][0-9]*)$/.test(id),
    room = valid ? selectedRoom : null,
    route = valid
      ? `/clubs/${id}?room=${encodeURIComponent(room)}&wallet=${auth.session?.wallet || ""}${before ? "&before=" + before : ""}`
      : null,
    { data, error, loading } = usePollingApi(route, refresh);
  const tokens=useApi(valid?`/studios/${id}/tokens`:null);
  const isOwner=!!auth.wallet&&auth.wallet.toLowerCase()===data?.studio.nft.owner.toLowerCase();
  useEffect(() => {
    setRoom("lounge");
    setBefore(null);
    setDraft({ kind: "message", title: "", content: "", imageUrl: "" });
  }, [id]);
  useEffect(() => {
    if (room !== "ideas")
      setDraft((d) => ({ ...d, kind: "message", title: "", imageUrl: "" }));
  }, [room]);
  const write = async (path, input, signal) => {
    const r = await communityRequest(path, input, signal);
    if (!signal.aborted) setRefresh((n) => n + 1);
    return r;
  };
  const post = async (e) => {
    e.preventDefault();
    await action.run(async (signal) => {
      await write(`/clubs/${id}/posts`, { ...draft, room }, signal);
      if (!signal.aborted)
        setDraft({ kind: "message", title: "", content: "", imageUrl: "" });
      return "Posted publicly to the club.";
    });
  };
  return (
    <>
      <section className="page-intro">
        <span className="eyebrow">CHOG FOUNDRY / CLUBS</span>
        <h1>{id ? `Studio #${id} club` : "Build the next idea together."}</h1>
        <p>
          Chat, share concepts and credit contributors. Everyone can
          participate, including people who do not hold tokens.
        </p>
      </section>
      <WalletSession auth={auth} />
      <LoadState
        loading={loading || directory.loading}
        error={error || directory.error || action.error}
      />
      {action.notice && <p role="status">{action.notice}</p>}
      {!id && (
        <div className="studio-grid">
          {directory.data?.studios.map((s) => (
            <Link
              className="studio-preview"
              key={s.id}
              to={`/app/clubs/${s.id}`}
            >
              <span className="caption">STUDIO #{s.id}</span>
              <h3>{s.name}</h3>
              <span>Enter club</span>
            </Link>
          ))}
          {directory.data && !directory.data.studios.length && (
            <p className="empty">
              No studio profiles have been published yet. Open a studio to visit
              its club.
            </p>
          )}
        </div>
      )}
      {id && !valid && <p className="message error">Invalid studio link.</p>}
      {valid && (
        <>
          <div className="community-toolbar">
            <div className="room-tabs">
              {["lounge", "announcements", "ideas"].map((r) => (
                <button
                  key={r}
                  className={room === r ? "active" : ""}
                  onClick={() => {
                    setRoom(r);
                    setBefore(null);
                  }}
                >
                  {r === "ideas"
                    ? "Concepts & memes"
                    : r[0].toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <div className="token-room-picker">
              <label>Token discussions
                <select value={room.startsWith('token:')?room:''} disabled={!tokens.data?.assets.length}
                  onChange={e=>{if(e.target.value){setRoom(e.target.value);setBefore(null);}}}>
                  <option value="">{tokens.data?.assets.length?'Choose a studio token':'No tokens launched yet'}</option>
                  {tokens.data?.assets.map(a=><option key={a.token.address} value={`token:${a.token.address.toLowerCase()}`}>{a.token.name} ({a.token.symbol})</option>)}
                </select>
              </label>
              <p className="note">Each launched token gets its own discussion room. No token purchase is required.</p>
              {tokens.error&&<p role="alert">{tokens.error}</p>}
              {isOwner&&<Link to={`/app/launch?studio=${id}`}>Launch a token ↗</Link>}
            </div>
          </div>
          {data && (
            <div className="club-layout">
              <section className="club-conversation">
                <div className="section-heading">
                  <h2>{room.startsWith("token:") ? tokens.data?.assets.find(a=>`token:${a.token.address.toLowerCase()}`===room)?.token.name||"Token discussion" : room[0].toUpperCase()+room.slice(1)}</h2>
                  <span>{data.members} following</span>
                </div>
                <p className="note">
                  Current owner: {short(data.studio.nft.owner)}. New owners
                  manage announcements; authorship and club history stay
                  attached to the studio.
                </p>
                <div className="club-feed" aria-live="polite">
                  {data.posts.map((p) => (
                    <article className="club-post" key={p.id}>
                      <div className="post-meta">
                        <strong>{short(p.author)}</strong>
                        <time>{timestamp(p.createdAt)}</time>
                        <span>{p.kind}</span>
                      </div>
                      {p.title && <h3>{p.title}</h3>}
                      <p className="user-content">{p.content}</p>
                      {p.imageUrl && (
                        <a href={p.imageUrl} target="_blank" rel="noreferrer">
                          View submitted meme
                        </a>
                      )}
                      {p.hidden && (
                        <p className="note">
                          Hidden by {short(p.moderation.author)}:{" "}
                          {p.moderation.reason}
                        </p>
                      )}
                      {p.kind !== "message" && !p.hidden && (
                        <div className="profile-actions">
                          <span>{p.votes} votes</span>
                          <button
                            disabled={!auth.matches || action.busy}
                            onClick={() =>
                              action.run((s) =>
                                write(
                                  `/clubs/${id}/votes`,
                                  { postId: p.id, active: true },
                                  s,
                                ),
                              )
                            }
                          >
                            Support
                          </button>
                          <button
                            disabled={!auth.matches || action.busy}
                            onClick={() =>
                              action.run((s) =>
                                write(
                                  `/clubs/${id}/votes`,
                                  { postId: p.id, active: false },
                                  s,
                                ),
                              )
                            }
                          >
                            Remove vote
                          </button>
                        </div>
                      )}
                      {auth.session?.wallet.toLowerCase() ===
                        data.studio.nft.owner.toLowerCase() &&
                        !p.hidden && (
                          <details>
                            <summary>Owner moderation</summary>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const reason = new FormData(
                                  e.currentTarget,
                                ).get("reason");
                                action.run((s) =>
                                  write(
                                    `/clubs/${id}/moderation`,
                                    { postId: p.id, reason },
                                    s,
                                  ),
                                );
                              }}
                            >
                              <input
                                name="reason"
                                placeholder="Public reason"
                                required
                                maxLength={500}
                              />
                              <button disabled={action.busy}>Hide post</button>
                            </form>
                          </details>
                        )}
                    </article>
                  ))}
                  {!data.posts.length && (
                    <p className="empty">No messages in this room yet.</p>
                  )}
                </div>
                <div className="profile-actions">
                  {data.hasOlder && (
                    <button onClick={() => setBefore(data.posts[0]?.id)}>
                      Older messages
                    </button>
                  )}
                  {before && (
                    <button onClick={() => setBefore(null)}>
                      Back to live room
                    </button>
                  )}
                </div>
                <form className="community-compose" onSubmit={post}>
                  <h3>
                    {room === "announcements"
                      ? "Official announcement"
                      : "Add to the conversation"}
                  </h3>
                  {!auth.matches&&<p className="message" role="status">Sign in with your wallet to send messages. Connecting your wallet alone does not sign you in.</p>}
                  {auth.matches&&!data.membership?.following&&<p className="message" role="status">Join this club to post. Joining is free and does not require buying a token.</p>}
                  {room==='announcements'&&!isOwner&&<p className="note">Only the current studio owner can publish announcements. Use Lounge to chat.</p>}
                  {room === "ideas" && (
                    <>
                      <label>
                        Contribution type
                        <select
                          value={draft.kind}
                          onChange={(e) =>
                            setDraft({ ...draft, kind: e.target.value })
                          }
                        >
                          <option value="message">Discussion</option>
                          <option value="concept">Concept proposal</option>
                          <option value="meme">Meme proposal</option>
                        </select>
                      </label>
                      <label>
                        Title
                        <input
                          value={draft.title}
                          maxLength={100}
                          onChange={(e) =>
                            setDraft({ ...draft, title: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Meme URL (HTTPS, optional)
                        <input
                          type="url"
                          value={draft.imageUrl}
                          onChange={(e) =>
                            setDraft({ ...draft, imageUrl: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Message
                    <textarea
                      required
                      maxLength={2000}
                      rows={4}
                      value={draft.content}
                      onChange={(e) =>
                        setDraft({ ...draft, content: e.target.value })
                      }
                    />
                  </label>
                  <p className="note">
                    Messages and wallet attribution are public. Votes are
                    advisory and never change contracts or release funds.
                  </p>
                  <button
                    className="primary"
                    type={auth.matches&&data.membership?.following?'submit':'button'}
                    onClick={!auth.matches?auth.signIn:!data.membership?.following?()=>action.run(s=>write(`/clubs/${id}/membership`,{following:true},s)):undefined}
                    disabled={!auth.wallet||auth.busy||action.busy||(room==='announcements'&&!isOwner)}
                  >
                    {auth.busy||action.busy?'Please wait…':!auth.wallet?'Connect wallet to chat':!auth.matches?'Sign in to chat':!data.membership?.following?'Join club to chat':'Send message'}
                  </button>
                </form>
              </section>
              <aside className="club-members">
                <h3>Your membership</h3>
                <button
                  disabled={!auth.matches || action.busy}
                  onClick={() =>
                    action.run((s) =>
                      write(
                        `/clubs/${id}/membership`,
                        { following: !data.membership?.following },
                        s,
                      ),
                    )
                  }
                >
                  {data.membership?.following ? "Unfollow club" : "Join club"}
                </button>
                <p className="note">
                  Membership does not grant studio administration.
                </p>
                <h3>Contributors</h3>
                {data.contributions.map((c) => (
                  <p key={c.author}>
                    {short(c.author)} <span>{c.posts} posts</span>
                  </p>
                ))}
                <Link to={`/app/agent/${id}`}>Ask the studio assistant</Link>
                <Provenance data={data.studio.provenance} />
              </aside>
            </div>
          )}
        </>
      )}
    </>
  );
}
