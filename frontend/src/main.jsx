import WalletPortfolio from './WalletPortfolio.jsx';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import StudioProfile from './StudioProfile.jsx';
import MarketView from './MarketView.jsx';
import foundryLogo from '../assets/chog-foundry-logo.webp';

async function api(route) {
  const response = await fetch(`/api${route}`, { signal: AbortSignal.timeout(25000), cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'Unable to load data.');
  return body;
}
function short(value) { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'; }
function amount(value) {
  if (value == null) return '—';
  const [whole, fraction] = value.split('.');
  return `${BigInt(whole).toLocaleString('en-US')}${fraction && fraction !== '0' ? '.' + fraction : ''}`;
}
function ChainLink({ address, children }) { return <a href={`https://monadscan.com/address/${address}`} target="_blank" rel="noreferrer">{children || short(address)} ↗</a>; }
function Provenance({ data }) {
  if (!data) return null;
  return <div className="provenance"><span>Monad · block <a href={`https://monadscan.com/block/${data.blockNumber}`} target="_blank" rel="noreferrer">{data.blockNumber.toLocaleString('en-US')} ↗</a></span><span>Read at {new Date(data.fetchedAt).toLocaleString('en-US')}</span><details><summary>Source & block hash</summary><code>{data.blockHash}</code><p>{data.rpcOrigin} · latest block</p></details></div>;
}
function App() {
  const [overview, setOverview] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [profilesError, setProfilesError] = useState('');
  const [studio, setStudio] = useState(null);
  const [transfers, setTransfers] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [portfolioToken,setPortfolioToken]=useState(null);
  const [balance, setBalance] = useState(null);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    api('/overview').then(data => { if (alive) setOverview(data); }).catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setBusy(false); });
    api('/studios').then(data => { if (alive) setProfiles(data); }).catch(err => { if (alive) setProfilesError(err.message); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const ethereum = window.ethereum;
    const invalidate = () => { setWallet(null); setBalance(null); setNotice('Wallet or network changed. Reconnect to refresh balances.'); };
    ethereum?.on?.('accountsChanged', invalidate); ethereum?.on?.('chainChanged', invalidate);
    return () => { ethereum?.removeListener?.('accountsChanged', invalidate); ethereum?.removeListener?.('chainChanged', invalidate); };
  }, []);
  async function run(action) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err.message || 'Unable to complete this request.'); }
    finally { setBusy(false); }
  }
  async function connect() {
    if (!window.ethereum) throw new Error('No EVM wallet was found in this browser.');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts[0]) throw new Error('The wallet did not provide an account.');
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (BigInt(chainId) !== 143n) throw new Error('Select Monad Mainnet in your wallet and reconnect.');
    const data = await api(`/wallets/${accounts[0]}`);
    // Recheck after RPC work so an account/network change cannot display stale wallet state.
    const current = await window.ethereum.request({ method: 'eth_accounts' });
    const currentChain = await window.ethereum.request({ method: 'eth_chainId' });
    if (current[0]?.toLowerCase() !== accounts[0].toLowerCase() || BigInt(currentChain) !== 143n) throw new Error('The wallet changed while loading data.');
    setWallet(accounts[0]); setBalance(data);
  }
  async function lookup(event) {
    event.preventDefault();
    await openStudio(id.trim());
  }
  async function openStudio(tokenId) {
    setId(tokenId); setStudio(null); setTransfers(null);
    await run(async () => { setStudio(await api(`/studios/${encodeURIComponent(tokenId)}`)); });
    document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' });
  }
  async function refreshProfiles() {
    setProfilesError('');
    try { setProfiles(await api('/studios')); } catch (err) { setProfiles(null); setProfilesError(err.message); }
  }
  function savedProfile(profile) {
    setStudio(current => ({ ...current, profile }));
    void refreshProfiles();
  }
  const owns = wallet && studio?.nft.owner.toLowerCase() === wallet.toLowerCase();
  return <>
    <header className="topbar"><a href="#" className="brand"><img className="brand-symbol" src={foundryLogo} alt="" width="48" height="48"/>CHOG FOUNDRY</a><nav><a href="#explore">Explore</a><a href="#studio">Studio</a><a href="#markets">Markets</a><a href="#portfolio">Portfolio</a><a href="#chog">$CHOG</a><a href="https://build.chog.xyz/" target="_blank" rel="noreferrer">Build with Chog ↗</a></nav><button className="wallet" disabled={busy} onClick={() => run(connect)}>{wallet ? short(wallet) : 'Connect wallet'} <span>↗</span></button></header>
    <main>
      <section className="hero"><div><div className="eyebrow"><span className="dot" /> MONAD / LIVE ONCHAIN</div><h1>Your Chog.<br />Your studio.<br /><span>Your next launch.</span></h1><p>One Chog. A studio with a story.<br />Build your next launch with your community.</p><a className="primary" href="#studio">Explore your Chog <span>↓</span></a></div><div className="forge" aria-hidden="true"><div className="forge-label">THE NEXT THING<br />STARTS WITH YOUR CHOG.</div><img className="forge-logo" src={foundryLogo} alt=""/><div className="forge-bottom">CHOG FOUNDRY <span>EST. 2026</span></div></div></section>
      <div className="statusline"><span className="status-tag">LIVE DATA</span><p>{profilesError ? 'Studio profiles are unavailable. Live Monad reads remain active; launch, trade and claims await Foundry contracts.' : profiles ? 'Live Monad data. Owner-managed profiles are available; launch, trade and claims await Foundry contracts.' : 'Checking studio availability. Launch, trade and claims await Foundry contracts.'}</p><button disabled={busy} onClick={() => run(async () => setOverview(await api('/overview')))}>Refresh ↻</button></div>
      {busy && <div className="message" role="status">Loading live data…</div>}
      {error && <div className="message error" role="alert">{error}</div>}
      {notice && <div className="message" role="status">{notice}</div>}
      <section id="chog" className="network-section"><div className="section-heading"><div><span className="eyebrow">01 / ONCHAIN FOUNDATION</span><h2>Chog on Monad</h2></div><span className="live-label">{overview ? '● RPC verified' : 'Data unavailable'}</span></div><div className="stats"><article><span className="caption">QUOTE ASSET</span><h3>{overview?.quote.symbol || '—'}</h3><p>{overview ? <ChainLink address={overview.quote.address}/> : 'Waiting for onchain data'}</p></article><article><span className="caption">TOTAL SUPPLY · $CHOG</span><h3>{amount(overview?.quote.totalSupply)}</h3><p>{overview ? `${overview.quote.decimals} decimals · read from contract` : '—'}</p></article><article><span className="caption">CHOG GENESIS · NFT SUPPLY</span><h3>{amount(overview?.collection.totalSupply)}</h3><p>{overview ? <ChainLink address={overview.collection.address}/> : '—'}</p></article></div><Provenance data={overview?.provenance}/></section>
      <MarketView onOpenStudio={openStudio} wallet={wallet} selectedToken={portfolioToken} />
      <WalletPortfolio wallet={wallet} onOpenToken={address=>{setPortfolioToken({address});document.getElementById('markets')?.scrollIntoView({behavior:'smooth'});}} />
      <section id="explore" className="explore-section"><div className="section-heading"><div><span className="eyebrow">STUDIOS / COMMUNITY</span><h2>Built around a Chog.</h2></div><button className="text-button" disabled={busy} onClick={() => run(refreshProfiles)}>Refresh studios</button></div><p className="note">Up to 50 recently updated profiles saved to this backend. Open a studio to read its current NFT owner on Monad.</p>{profilesError ? <div className="message error" role="alert">Studio directory unavailable: {profilesError}</div> : profiles == null ? <p className="note">Loading saved studios...</p> : profiles.profiles.length ? <div className="studio-grid">{profiles.profiles.map(profile => <article className="studio-preview" key={profile.key}><span className="caption">CHOG GENESIS #{profile.tokenId}</span><h3>{profile.name}</h3><p>{profile.description}</p><small>Originally created by {short(profile.createdBy)} / revision {profile.revision}</small><button className="primary" disabled={busy} onClick={() => openStudio(profile.tokenId)}>Open studio</button></article>)}</div> : <div className="empty"><p>No studio profiles have been saved yet.</p><small>Connect the wallet holding your Chog to create its profile.</small></div>}<p className="note">{profiles?.source}</p></section>
      <section id="studio" className="studio-section"><div className="section-heading"><div><span className="eyebrow">02 / YOUR CHOG</span><h2>Start with your NFT.</h2></div><p>Look up the onchain token ID.<br />The NFT display name may differ from its token ID.</p></div><form className="lookup" onSubmit={lookup}><label htmlFor="token-id">Chog Genesis token ID</label><div><input id="token-id" value={id} onChange={e => setId(e.target.value)} placeholder="Enter onchain token ID" inputMode="numeric" pattern="(0|[1-9][0-9]*)" required aria-describedby="token-help"/><button type="submit" className="primary" disabled={busy}>Look up NFT ↗</button></div><p id="token-help">Owner and token URI are read at the same block. Studio identity follows the NFT.</p></form>
      {studio ? <article className="nft-card"><div className="nft-heading"><div><span className="caption">CHOG GENESIS / TOKEN ID</span><h3>#{studio.nft.tokenId}</h3></div><span className="status-tag">NFT ONCHAIN</span></div><dl><dt>Current owner</dt><dd><ChainLink address={studio.nft.owner}>{studio.nft.owner}</ChainLink></dd><dt>Collection address</dt><dd><ChainLink address={studio.nft.collection}>{studio.nft.collection}</ChainLink></dd><dt>Token URI</dt><dd><code>{studio.nft.tokenURI}</code></dd><dt>Studio access</dt><dd>{owns ? 'The connected wallet matches ownerOf at the block below.' : 'Sign-in and a fresh ownership check are required to edit the profile.'}</dd></dl>{studio.nft.ownerHasCode && <p className="note">The owner address has code: it may be a smart wallet, an EIP-7702 wallet or another contract. No beneficial owner is inferred.</p>}<div className="not-ready">Onchain launches and fees are unavailable. Studio profiles are stored offchain.</div><StudioProfile studio={studio} wallet={wallet} busy={busy} run={run} onProfile={savedProfile}/><Provenance data={studio.provenance}/><button className="text-button" disabled={busy} onClick={() => run(async () => setTransfers(await api(`/studios/${studio.nft.tokenId}/transfers`)))}>Read transfers from the latest 100 blocks ↗</button>{transfers && <div className="transfer-list"><p>Range {transfers.range.fromBlock}–{transfers.range.toBlock}. This is a bounded window, not a complete ownership history.</p>{transfers.transfers.length ? transfers.transfers.map(tx => <p key={`${tx.transactionHash}:${tx.logIndex}`}><a href={`https://monadscan.com/tx/${tx.transactionHash}`} target="_blank" rel="noreferrer">{short(tx.from)} → {short(tx.to)} · block {tx.blockNumber} ↗</a></p>) : <p>No Transfer events were found in this range.</p>}<Provenance data={transfers.provenance}/></div>}</article> : <div className="empty"><span>↗</span><p>Enter a token ID to read a real NFT from Monad.</p><small>No simulated studios or statistics.</small></div>}
      </section>
      {balance && <section className="wallet-section"><span className="eyebrow">03 / YOUR WALLET</span><h2>Wallet balances</h2><p><ChainLink address={wallet}>{wallet}</ChainLink></p><div className="stats"><article><span className="caption">MON</span><h3>{amount(balance.balances.mon)}</h3></article><article><span className="caption">$CHOG</span><h3>{amount(balance.balances.chog)}</h3></article><article><span className="caption">CHOG GENESIS</span><h3>{amount(balance.balances.nftCount)}</h3></article></div><h3>Your Chog NFTs</h3><p className="note">Token IDs returned by the collection at the block below. Opening a studio checks ownerOf again; this list grants no edit permissions.</p>{balance.nfts.tokenIds.length ? <div className="nft-picker">{balance.nfts.tokenIds.map(tokenId => <button key={tokenId} disabled={busy} onClick={() => openStudio(tokenId)}>Chog #{tokenId}</button>)}</div> : <p className="note">This wallet held no Chog Genesis NFTs at this block.</p>}<Provenance data={balance.provenance}/><p className="note">Connecting reads your account. A separate signature is required to sign in and edit your studio.</p></section>}
    </main><footer><a className="brand" href="#"><img className="brand-symbol" src={foundryLogo} alt="" width="32" height="32"/>CHOG FOUNDRY</a><span>Your Chog. Your studio. Your next launch.</span><a href="https://www.chog.xyz/" target="_blank" rel="noreferrer">Chog ↗</a></footer>
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
