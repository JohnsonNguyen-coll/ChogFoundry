import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import useApi from "../hooks/useApi.js";
import usePollingApi from "../hooks/usePollingApi.js";
import useWalletSession from "../hooks/useWalletSession.js";
import useCommunityAction from "../hooks/useCommunityAction.js";
import WalletSession from "../components/WalletSession.jsx";
import ClubDirectory from '../components/ClubDirectory.jsx';
import NftArtwork from '../components/NftArtwork.jsx';
import { LoadState, Provenance } from "../components/Onchain.jsx";
import { communityRequest, timestamp } from "../lib/community.mjs";
import { short } from "../lib/api.mjs";
import {mergeClubPost} from '../club-live.mjs';
export default function ClubsPage() {
  const { id } = useParams(),
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
      `${id}:${selectedRoom}:${before}:${auth.wallet}:${auth.session?.expiresAt}`,
    );
  const directory = useApi(!id ? "/clubs" : null),
    valid = id && /^(0|[1-9][0-9]*)$/.test(id),
    room = valid ? selectedRoom : null,
    route = valid
      ? `/clubs/${id}?room=${encodeURIComponent(room)}&wallet=${auth.session?.wallet || ""}${before ? "&before=" + before : ""}`
      : null,
    { data, error, loading,update } = usePollingApi(route, refresh);
  const [liveStatus,setLiveStatus]=useState('connecting');
  useEffect(()=>{
    if(!valid||before)return;
    setLiveStatus('connecting');
    const stream=new EventSource(`/api/clubs/${id}/stream?room=${encodeURIComponent(room)}`);
    stream.addEventListener('ready',()=>{setLiveStatus('connected');setRefresh(n=>n+1);});
    stream.addEventListener('change',event=>{
      try{
        const next=JSON.parse(event.data);if(next.room!==room)return;
        if(next.post)update(previous=>mergeClubPost(previous,next.post));
        else setRefresh(n=>n+1);
      }catch{setRefresh(n=>n+1);}
    });
    stream.onerror=()=>setLiveStatus('polling');
    return()=>stream.close();
  },[valid,id,room,before,update]);
  const tokens=useApi(valid?`/studios/${id}/tokens`:null);
  const isOwner=!!auth.wallet&&auth.wallet.toLowerCase()===data?.studio.nft.owner.toLowerCase();
  const hasClubAccess=isOwner||!!data?.membership?.following;
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
    if(!signal.aborted){
      if(r.post&&!before)update(previous=>mergeClubPost(previous,r.post));
      else{if(r.post)setBefore(null);setRefresh(n=>n+1);}
    }
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
    <div className="clubs-page">
      {id&&<><Link className="back-link" to="/app/clubs">← All clubs</Link><header className="club-detail-header"><div className="club-detail-identity">{data&&<NftArtwork id={id} collection={data.studio.nft.collection} collectionName={data.studio.nft.collectionName} tokenURI={data.studio.nft.tokenURI}/>}<div><span className="eyebrow">CHOG FOUNDRY / STUDIO COMMUNITY</span><h1>Studio #{id} club</h1><p>Good conversations. Shared ideas. Your next launch.</p></div></div><WalletSession auth={auth}/></header></>}
      <LoadState
        loading={!!id&&loading}
        error={id?(error||action.error):null}
      />
      {action.notice&&action.notice!=='Posted publicly to the club.'&&<p role="status">{action.notice}</p>}
      {!id&&<ClubDirectory wallet={auth.wallet} directory={directory}/>}
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
              <p className="note">A dedicated room for each launched token.</p>
              {tokens.error&&<p role="alert">{tokens.error}</p>}
              {isOwner&&<Link to={`/app/launch?studio=${id}`}>Launch a token ↗</Link>}
            </div>
          </div>
          {data && (
            <div className="club-layout">
              <section className="club-conversation">
                <div className="section-heading">
                  <h2>{room.startsWith("token:") ? tokens.data?.assets.find(a=>`token:${a.token.address.toLowerCase()}`===room)?.token.name||"Token discussion" : room[0].toUpperCase()+room.slice(1)}</h2>
                  <span>{data.members} following · {before?'Earlier messages':liveStatus==='connected'?'Live':liveStatus==='polling'?'Reconnecting…':'Connecting…'}</span>
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
                    <div className="club-room-empty"><span aria-hidden="true">{room==='ideas'?'✦':'#'}</span><h3>{room==='announcements'?'Studio updates live here.':room==='ideas'?'A wild idea belongs here.':'Make yourself at home.'}</h3><p>{room==='announcements'?'Announcements from the studio owner will appear here.':room==='ideas'?'Share a concept, a meme or a different point of view.':'Say hello and start the first conversation.'}</p></div>
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
                  {auth.matches&&!hasClubAccess&&<p className="message" role="status">Join this club to post. Joining is free and does not require buying a token.</p>}
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
                      id="club-message"
                      required
                      maxLength={2000}
                      rows={4}
                      placeholder={room==='ideas'?'What should we make next?':room==='announcements'?'Share an update with your club…':'Say something to the club…'}
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
                    type={auth.matches&&hasClubAccess?'submit':'button'}
                    onClick={!auth.matches?auth.signIn:!hasClubAccess?()=>action.run(s=>write(`/clubs/${id}/membership`,{following:true},s)):undefined}
                    disabled={!auth.wallet||auth.busy||action.busy||(room==='announcements'&&!isOwner)}
                  >
                    {auth.busy||action.busy?'Please wait…':!auth.wallet?'Connect wallet to chat':!auth.matches?'Sign in to chat':!hasClubAccess?'Join club to chat':'Send message'}
                  </button>
                </form>
              </section>
              <aside className="club-members">
                <h3>{isOwner?'Your studio club':'Your membership'}</h3>
                {isOwner?<p className="club-owner-access">Studio owner · You already have access.</p>:<button
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
                </button>}
                <p className="note">
                  Membership does not grant studio administration.
                </p>
                <h3>Contributors</h3>
                {!data.contributions.length&&<p className="note">People who contribute will appear here.</p>}
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
    </div>
  );
}
