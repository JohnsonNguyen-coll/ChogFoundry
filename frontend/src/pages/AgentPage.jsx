import React, {useEffect,useRef,useState} from "react";
import {Link,useNavigate,useParams,useSearchParams} from "react-router-dom";
import useApi from "../hooks/useApi.js";
import useWalletSession from "../hooks/useWalletSession.js";
import useCommunityAction from "../hooks/useCommunityAction.js";
import WalletSession from "../components/WalletSession.jsx";
import {LoadState} from "../components/Onchain.jsx";
import {Spinner} from "../components/Loading.jsx";
import NftArtwork from "../components/NftArtwork.jsx";
import Modal from '../components/Modal.jsx';
import AssistantTools,{assistantTasks} from "../components/AssistantTools.jsx";
import {communityRequest,timestamp} from "../lib/community.mjs";

const assistantError=value=>/Claude|ANTHROPIC|CLAUDE_/i.test(value||'')?'The assistant is temporarily unavailable. Please try again later.':value;
const sourceNames={'studio-onchain':'Studio ownership','studio-profile':'Studio profile','club-lounge':'Public club discussion','token-onchain':'Token information'};
export default function AgentPage() {
  const {id}=useParams(),[search]=useSearchParams(),auth=useWalletSession();
  const navigate=useNavigate(),promptInput=useRef(null);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [prompt,setPrompt]=useState(''),[token,setToken]=useState(''),[task,setTask]=useState('concept'),[refresh,setRefresh]=useState(0);
  const action=useCommunityAction(`${id}:${auth.wallet}:${auth.session?.expiresAt}`);
  const directory=useApi(!id?'/clubs':null);
  const owned=useApi(!id&&auth.wallet?`/wallets/${auth.wallet}`:null);
  const tokens=useApi(id?`/studios/${id}/tokens`:null);
  const {data,error,loading}=useApi(id&&auth.matches?`/agent/${id}?wallet=${auth.wallet}`:null,refresh);
  const requestedTask=search.get('task');
  useEffect(()=>{
    const preset=assistantTasks.find(item=>item.id===requestedTask);
    setPrompt(preset?.prompt||'');setTask(preset?.id||'concept');setToken('');
  },[id,auth.wallet,requestedTask]);
  const studios=new Map((directory.data?.studios||[]).map(studio=>[String(studio.id),{...studio,mine:false}]));
  for(const nftId of owned.data?.nfts.tokenIds||[]){
    const previous=studios.get(String(nftId));
    studios.set(String(nftId),{id:String(nftId),name:previous?.name||`Studio #${nftId}`,mine:true});
  }
  const studioList=[...studios.values()].sort((a,b)=>Number(b.mine)-Number(a.mine));
  const mine=studioList.filter(studio=>studio.mine);
  const directStudio=!owned.loading&&mine.length===1?mine[0].id:!owned.loading&&!directory.loading&&studioList.length===1?studioList[0].id:null;
  useEffect(()=>{
    if(pickerOpen&&!id&&directStudio){setPickerOpen(false);navigate(`/app/agent/${directStudio}?task=${task}`);}
  },[pickerOpen,id,directStudio,task,navigate]);
  function chooseTask(preset){
    setTask(preset.id);
    if(id){setPrompt(preset.prompt);promptInput.current?.focus();}
    else if(directStudio)navigate(`/app/agent/${directStudio}?task=${preset.id}`);
    else setPickerOpen(true);
  }
  return <div className="assistant-page">
    {!id&&<header className="assistant-hero">
      <div><span className="eyebrow">CHOG FOUNDRY / YOUR CREATIVE PARTNER</span><h1>A spark today.<br/><span>Your next launch tomorrow.</span></h1><p>Meet Foundry Assistant. A little help to shape your ideas, understand your token and bring the club along.</p><div className="assistant-hero-tags"><span>Studio context</span><span>Community ideas</span><span>You make the call</span></div></div>
      <div className="assistant-hero-art" aria-hidden="true"><div className="assistant-orbit"><span>✦</span></div><div className="assistant-orbit-label">IDEA → CONCEPT → LAUNCH</div><span className="assistant-orbit-caption">A little spark goes a long way.</span></div>
    </header>}
    {!id?<>
      <div className="section-heading assistant-section-heading"><div><span className="eyebrow">A GOOD PLACE TO START</span><h2>What are we working on?</h2></div><p>Start with a task or choose a studio below.</p></div>
      <AssistantTools active={task} onSelect={chooseTask}/>
      <div className="section-heading assistant-section-heading"><div><span className="eyebrow">YOUR STUDIO, YOUR CONTEXT</span><h2>Choose a studio</h2></div><Link className="text-link" to="/app/studios">View my studios ↗</Link></div>
      <LoadState loading={directory.loading||owned.loading} error={directory.error||owned.error}/>
      <div className="assistant-studio-grid">{studioList.map(studio=><article className="assistant-studio-choice" key={studio.id}>
        {studio.mine&&owned.data?<NftArtwork id={studio.id} collection={owned.data.nfts.collection} collectionName={owned.data.nfts.collectionName}/>:<span className="assistant-studio-monogram">#{studio.id}</span>}
        <div className="assistant-studio-choice-body"><span className="caption">{studio.mine?'YOUR STUDIO':'COMMUNITY STUDIO'}</span><h3>{studio.name}</h3><Link className="primary assistant-open-button" to={`/app/agent/${studio.id}?task=${task}`} aria-label={`Open assistant for studio ${studio.id}`}>Open assistant</Link></div>
      </article>)}</div>
      {!directory.loading&&!owned.loading&&!directory.error&&!owned.error&&!studioList.length&&<div className="assistant-directory-empty"><span className="assistant-empty-mark" aria-hidden="true">✦</span><div><h3>Every idea needs a home.</h3><p>{auth.wallet?'No studios found yet. Open My studios to check the NFTs in your wallet.':'Connect your wallet to find your NFT studios, or explore a community studio.'}</p><Link className="secondary" to={auth.wallet?'/app/studios':'/app/explore'}>{auth.wallet?'Find my studio':'Explore studios'} ↗</Link></div></div>}
      <Modal open={pickerOpen} onClose={()=>setPickerOpen(false)} title="Choose a studio" eyebrow="FOUNDRY ASSISTANT" className="assistant-studio-modal">
        <p className="note">{assistantTasks.find(item=>item.id===task)?.title} · Choose the studio for this conversation.</p>
        <LoadState loading={directory.loading||owned.loading} error={directory.error||owned.error}/>
        <div className="assistant-studio-options">{studioList.map(studio=><Link key={studio.id} to={`/app/agent/${studio.id}?task=${task}`} onClick={()=>setPickerOpen(false)}><span><strong>{studio.name}</strong><small>{studio.mine?'Your studio':'Community studio'}</small></span><span>Open conversation →</span></Link>)}</div>
        {!directory.loading&&!owned.loading&&!studioList.length&&<><p className="note">{auth.wallet?'No studios found for this wallet yet.':'Connect your wallet to find your studio, or explore public studios.'}</p><Link className="secondary" to={auth.wallet?'/app/studios':'/app/explore'} onClick={()=>setPickerOpen(false)}>{auth.wallet?'Find my studio':'Explore studios'} ↗</Link></>}
      </Modal>
    </>:<>
      <div className="assistant-workspace-bar"><Link to="/app/agent">← All studios</Link><span>Studio #{id}</span><Link to={`/app/clubs/${id}`}>Visit club ↗</Link></div>
      <div className="assistant-workspace-layout"><aside className="assistant-task-sidebar"><span className="eyebrow">MAKE A START</span><AssistantTools active={task} onSelect={chooseTask} disabled={action.busy}/><p className="note">Suggestions become a draft. Your wallet confirms any financial action separately.</p></aside>
      <section className="assistant-conversation" aria-label="Studio assistant conversation">
        <div className="assistant-conversation-heading"><div><span className="assistant-mini-mark" aria-hidden="true">✦</span><div><h2>Foundry Assistant</h2><span>Your creative space · Studio #{id}</span></div></div><WalletSession auth={auth}/></div>
        <LoadState loading={loading} error={assistantError(error||action.error)}/>
        {data&&!data.configuration.configured&&<p className="message" role="status">The assistant is not available yet. Please try again later.</p>}
        <div className="assistant-conversation-history">
          {(!data||!data.history.length)&&!loading&&<div className="assistant-chat-empty"><span aria-hidden="true">✦</span><h3>Where should we begin?</h3><p>Choose a starting point or ask your own question. Replies use the studio information available at the time.</p></div>}
          {data?.history.map(reply=><article className="assistant-exchange" key={reply.id}>
            <div className="assistant-question"><span className="caption">YOU</span><p className="user-content">{reply.prompt}</p></div>
            <div className="assistant-answer"><span className="caption">FOUNDRY ASSISTANT</span><p className="user-content">{reply.response}</p><small>{timestamp(reply.created_at)}</small><details className="assistant-sources"><summary>Sources used for this reply</summary><ul>{reply.sources_json.map(source=><li key={source.id}><strong>{sourceNames[source.id]||'Studio information'}</strong>{source.blockNumber!=null&&<span>Block {source.blockNumber}</span>}{(source.fetchedAt||source.readAt||source.updatedAt)&&<span>{timestamp(source.fetchedAt||source.readAt||source.updatedAt)}</span>}{source.truncated&&<span>Only recent messages were included.</span>}</li>)}</ul></details></div>
          </article>)}
          {action.busy&&<div className="assistant-thinking"><Spinner label="Working on your question…"/></div>}
        </div>
        <form className="assistant-composer" onSubmit={event=>{
          event.preventDefault();action.run(async signal=>{
            await communityRequest(`/agent/${id}`,{prompt,task,tokenAddress:token||undefined},signal);
            if(!signal.aborted){setPrompt('');setRefresh(value=>value+1);}
            return 'Reply saved.';
          });
        }}>
          <label htmlFor="assistant-prompt">Ask about this studio</label><textarea ref={promptInput} id="assistant-prompt" required rows={3} maxLength={4000} value={prompt} disabled={action.busy} onChange={event=>setPrompt(event.target.value)} placeholder="An idea, a question, a starting point…"/>
          <div className="assistant-composer-footer"><div>{tokens.data?.assets.length>0&&<label>Include a token<select value={token} disabled={action.busy} onChange={event=>setToken(event.target.value)}><option value="">Studio overview</option>{tokens.data.assets.map(asset=><option value={asset.token.address} key={asset.token.address}>{asset.token.name} ({asset.token.symbol})</option>)}</select></label>}{tokens.error&&<p className="note">Token details could not be loaded. You can still ask about the studio.</p>}<span className="note">You decide what happens next.</span></div><button className="primary" disabled={!auth.matches||!data?.configuration.configured||action.busy||!prompt.trim()}>{action.busy?'Thinking…':'Send message →'}</button></div>
          {!auth.wallet&&<p className="note">Connect your wallet to start a conversation.</p>}
          {auth.wallet&&!auth.matches&&<p className="note" role="status">{auth.busy?'Confirm the sign-in message in your wallet to send messages. No gas fee is charged.':auth.checking?'Checking your sign-in…':'Sign-in is needed to send messages. Use the sign-in button above to try again.'}</p>}
          <details className="assistant-privacy"><summary>About your conversation</summary><p>Your question, public studio information and recent public club messages are processed by an AI service. Your saved conversation is visible only to your signed-in wallet. The assistant cannot sign, transfer funds or trade.</p></details>
        </form>
      </section></div>
    </>}
  </div>;
}
