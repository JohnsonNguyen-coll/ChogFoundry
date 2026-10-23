import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import useApi from '../hooks/useApi.js';
import NftArtwork from './NftArtwork.jsx';
import ChogArtwork from './ChogArtwork.jsx';
import {LoadState} from './Onchain.jsx';
import PaginatedList from './PaginatedList.jsx';

export default function ClubDirectory({wallet,directory}) {
  const owned=useApi(wallet?`/wallets/${wallet}`:null),configuration=useApi('/config');
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');
  const clubs=new Map((directory.data?.studios||[]).map(studio=>[String(studio.id),{...studio,mine:false}]));
  for(const id of owned.data?.nfts.tokenIds||[]){
    const existing=clubs.get(String(id));
    clubs.set(String(id),{id:String(id),name:existing?.name||`Studio #${id}`,mine:true});
  }
  const list=[...clubs.values()].sort((a,b)=>Number(b.mine)-Number(a.mine));
  const visible=list.filter(club=>(filter!=='mine'||club.mine)&&`${club.name} ${club.id}`.toLowerCase().includes(query.toLowerCase().trim()));
  const collection=owned.data?.nfts.collection||configuration.data?.collection.address;
  const collectionName=owned.data?.nfts.collectionName||configuration.data?.collection.name;
  const loading=directory.loading||owned.loading;
  return <>
    <header className="clubs-hub-hero">
      <div><span className="eyebrow">CHOG FOUNDRY / COMMUNITY</span><h1>Good ideas<br/><span>start with a club.</span></h1><p>A home for every studio’s next chapter. Meet the community, share a wild idea and help shape what launches next.</p><div className="clubs-hub-tags"><span>Open to everyone</span><span>No token needed</span></div></div>
      <div className="clubs-chog-art" aria-hidden="true"><ChogArtwork scene="community" className="page-chog-portrait" eager/><span>Lounge · Concepts & memes · Announcements</span></div>
    </header>
    <section className="clubs-directory-section">
      <div className="section-heading"><div><span className="eyebrow">FIND YOUR PEOPLE</span><h2>Studio clubs</h2></div><Link className="text-link" to="/app/studios">My studios ↗</Link></div>
      <div className="clubs-directory-toolbar"><div className="clubs-directory-filters" aria-label="Filter clubs"><button type="button" className={filter==='all'?'active':''} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All clubs{!loading&&<span>{list.length}</span>}</button><button type="button" className={filter==='mine'?'active':''} aria-pressed={filter==='mine'} onClick={()=>setFilter('mine')}>Your studios{!loading&&<span>{list.filter(club=>club.mine).length}</span>}</button></div><label className="clubs-directory-search"><span className="sr-only">Search clubs by name or studio number</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a club by name or studio #"/></label></div>
      <LoadState loading={loading} error={directory.error||owned.error}/>
      <PaginatedList items={visible} resetKey={`${wallet}:${query}:${filter}`} label="Clubs">{page=><div className="clubs-directory-grid">{page.map(club=><article className="club-directory-card" key={club.id}>
        <div className="club-directory-cover">{collection?<NftArtwork id={club.id} collection={collection} collectionName={collectionName}/>:<span className="club-cover-number">#{club.id}</span>}<span className="club-cover-tag">{club.mine?'YOUR STUDIO':'COMMUNITY CLUB'}</span></div>
        <div className="club-directory-body"><span className="caption">STUDIO #{club.id}</span><h3>{club.name}</h3><p>Come for the conversation.<br/>Stay for the next idea.</p><div className="club-room-labels"><span>Lounge</span><span>Ideas & memes</span><span>Updates</span></div><Link className="primary" to={`/app/clubs/${club.id}`}>Enter club <span>↗</span></Link></div>
      </article>)}</div>}</PaginatedList>
      {!loading&&!visible.length&&<div className="clubs-directory-empty"><span className="clubs-empty-mark" aria-hidden="true">#</span><div><h3>{query?'No matching clubs':filter==='mine'?'Your club starts with your NFT':'Your next community is waiting.'}</h3><p>{query?'Try another name or studio number.':wallet?'Open My studios to find the club attached to your NFT.':'Connect your wallet to find your NFT clubs, or explore public studios.'}</p>{query?<button type="button" onClick={()=>setQuery('')}>Clear search</button>:<Link className="secondary" to={wallet?'/app/studios':'/app/explore'}>{wallet?'Find my studio':'Explore studios'} ↗</Link>}</div></div>}
    </section>
  </>;
}
