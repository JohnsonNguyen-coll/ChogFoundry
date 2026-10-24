import React,{useEffect,useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {api} from '../lib/api.mjs';
import {Spinner} from './Loading.jsx';
import TokenAvatar from './TokenAvatar.jsx';
import {units} from '../market-format.mjs';
import PaginatedList from './PaginatedList.jsx';

export default function MarketDirectory({collection}) {
  const navigate=useNavigate();
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[address,setAddress]=useState(''),[lookupError,setLookupError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();let timer;
    const poll=async()=>{
      try{const next=await api('/tokens',controller.signal);if(!controller.signal.aborted){setData(next);setError('');}}
      catch{if(!controller.signal.aborted)setError('The token list is temporarily unavailable. Retrying automatically.');}
      finally{if(!controller.signal.aborted){setLoading(false);timer=setTimeout(poll,10000);}}
    };
    void poll();return()=>{controller.abort();clearTimeout(timer);};
  },[refresh]);
  const assets=data?.assets||[],visible=useMemo(()=>{
    const search=query.trim().toLowerCase();
    return assets.filter(({token,launch})=>(filter==='all'||(filter==='pool')===!!launch.graduated)&&`${token.name} ${token.symbol} ${token.address} ${launch.nftId}`.toLowerCase().includes(search));
  },[data,query,filter]);
  function openAddress(event){
    event.preventDefault();const value=address.trim();
    if(!/^0x[0-9a-fA-F]{40}$/.test(value)){setLookupError('Enter a complete token address, starting with 0x.');return;}
    navigate(`/app/markets/${value}`);
  }
  return <section className="market-directory">
    <header className="market-directory-hero"><div><span className="eyebrow">CHOG FOUNDRY / MARKETS</span><h1>Every token starts<br/>with a studio.</h1><p>Find your next token. Open its market to follow the chart and trade with CHOG.</p></div><Link className="primary" to="/app/launch">Launch a token ↗</Link></header>
    <div className="market-directory-heading"><div><h2>Explore tokens</h2><span>{data?`${assets.length} ${assets.length===1?'token':'tokens'} listed`:'Loading markets…'}</span></div><button className="text-button" onClick={()=>setRefresh(n=>n+1)}>Refresh ↻</button></div>
    <div className="market-directory-toolbar"><div className="market-directory-filters" role="group" aria-label="Filter tokens">{[['all','All tokens'],['curve','Bonding curve'],['pool','Liquidity pools']].map(([value,label])=><button key={value} aria-pressed={filter===value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><label><span className="sr-only">Search tokens</span><input type="search" placeholder="Search name, ticker, studio or address" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    {error&&<div className="message" role="status">{error}{data?' Showing the last loaded list.':''}</div>}
    {loading&&!data?<div className="market-directory-loading"><Spinner label="Loading tokens…"/></div>:<>
      <PaginatedList items={visible} resetKey={`${query}:${filter}`} label="Tokens">{page=><div className="market-directory-grid">{page.map(({token,launch})=><article key={token.address} className="market-token-card">
        <Link className="market-token-main" to={`/app/markets/${token.address}`}><TokenAvatar collection={collection} nftId={launch.nftId} name={token.name}/><div><h3>{token.name}</h3><span>{token.symbol} / CHOG</span></div><span className="market-token-arrow" aria-hidden="true">↗</span></Link>
        <div className="market-token-meta"><Link to={`/app/studios/${launch.nftId}`}>Studio #{launch.nftId} ↗</Link><span className={`token-stage ${launch.graduated?'pool':'curve'}`}>{launch.graduated?'Liquidity pool':'Bonding curve'}</span></div>
        <dl><div><dt>Supply</dt><dd>{token.supplyRaw?units(token.supplyRaw,token.decimals):'Unavailable'}</dd></div><div><dt>Token address</dt><dd title={token.address}>{token.address.slice(0,6)}…{token.address.slice(-4)}</dd></div></dl>
        <Link className="primary market-token-open" to={`/app/markets/${token.address}`}>Open market</Link>
      </article>)}</div>}</PaginatedList>
      {data&&!visible.length&&<div className="market-directory-empty"><h3>{query||filter!=='all'?'No matching tokens':data.index?.caughtUp?'The next launch could be yours.':'Launch history is syncing…'}</h3><p>{query||filter!=='all'?'Try a different search or choose another filter.':data.index?.caughtUp?'Launch a token from your studio to open its market here.':'Tokens appear as their launches are confirmed.'}</p>{query||filter!=='all'?<button onClick={()=>{setQuery('');setFilter('all');}}>Show all tokens</button>:<Link className="secondary" to="/app/launch">Start a launch ↗</Link>}</div>}
    </>}
    <details className="directory-address-lookup"><summary>Already have a token address?</summary><form onSubmit={openAddress}><label className="sr-only" htmlFor="directory-token-address">Foundry token address</label><input id="directory-token-address" placeholder="Paste a Foundry token address" value={address} onChange={e=>{setAddress(e.target.value);setLookupError('');}} spellCheck="false" required/><button className="secondary">Open market</button></form>{lookupError&&<p role="alert">{lookupError}</p>}</details>
  </section>;
}
