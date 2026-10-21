import { useSelectedWallet } from './WalletProvider.jsx';
import React, { useEffect, useState } from 'react';

async function request(route, method = 'GET', data) {
  const response = await fetch('/api' + route, {
    method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'The request failed.');
  return result;
}
const empty = { name: '', description: '', website: '', coverUrl: '' };
export default function StudioProfile({ studio, wallet, busy, run, onProfile }) {
  const {provider}=useSelectedWallet();
  const [session, setSession] = useState(null);
  const [access, setAccess] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [saved, setSaved] = useState('');
  useEffect(() => {
    let alive = true; setAccess(false); setSaved('');
    setDraft({ ...empty, ...studio.profile });
    request('/session').then(data => { if (alive) setSession(data.session); }).catch(() => { if (alive) setSession(null); });
    return () => { alive = false; };
  }, [studio.nft.tokenId, studio.profile]);
  useEffect(() => { setAccess(false); }, [wallet, session, provider]);
  const matches = wallet && session?.wallet.toLowerCase() === wallet.toLowerCase();
  const owner = wallet && studio.nft.owner.toLowerCase() === wallet.toLowerCase();
  async function signIn() {
    setAccess(false); setSaved('');
    if(!provider||!wallet)throw new Error('Connect your wallet on Monad Mainnet before signing in.');
    const currentAccounts=await provider.request({method:'eth_accounts'}),currentChain=await provider.request({method:'eth_chainId'});
    if(currentAccounts[0]?.toLowerCase()!==wallet.toLowerCase()||BigInt(currentChain)!==143n)throw new Error('Connected account/network does not match sign-in.');
    const { challengeId, message } = await request('/auth/challenge', 'POST', { wallet });
    const hex = '0x' + Array.from(new TextEncoder().encode(message), byte => byte.toString(16).padStart(2, '0')).join('');
    const signature = await provider.request({ method: 'personal_sign', params: [hex, wallet] });
    const accounts = await provider.request({ method: 'eth_accounts' });
    const chainId = await provider.request({ method: 'eth_chainId' });
    if (accounts[0]?.toLowerCase() !== wallet.toLowerCase() || BigInt(chainId) !== 143n) throw new Error('Wallet or network changed during sign-in.');
    const result = await request('/auth/verify', 'POST', { challengeId, message, signature });
    setSession(result.session);
  }
  async function checkAccess() {
    setAccess(false);
    const result = await request('/studios/' + studio.nft.tokenId + '/access');
    setAccess(result.canEdit);
  }
  async function save(event) {
    event.preventDefault();
    await run(async () => {
      setAccess(false); setSaved('');
      const { name, description, website, coverUrl } = draft;
      const result = await request('/studios/' + studio.nft.tokenId + '/profile', 'PUT', {
        name, description, website, coverUrl, expectedRevision: studio.profile?.revision || 0
      });
      onProfile(result.profile); setSaved('Studio profile saved.');
    });
  }
  return <section className="profile-panel">
    <div className="section-heading"><div><span className="caption">YOUR STUDIO / OFFCHAIN PROFILE</span><h3>{studio.profile?.name || 'Make this NFT your studio.'}</h3></div></div>
    {studio.profile && <div className="profile-details">
      {studio.profile.coverUrl && <img className="studio-cover" src={studio.profile.coverUrl} alt={studio.profile.name + " cover"} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = "none"; }}/>}
      <p className="profile-description">{studio.profile.description}</p>
      {studio.profile.website && <a href={studio.profile.website} target="_blank" rel="noreferrer">Studio website ↗</a>}
      <p className="note">Created by {studio.profile.createdBy}. Revision {studio.profile.revision}, last edited by {studio.profile.updatedBy} at {new Date(studio.profile.updatedAt).toLocaleString('en-US')}.</p>
    </div>}
    <p className="note">The current NFT owner can edit this profile. Original author attribution remains attached to saved revisions. This does not deploy a token or move funds.</p>
    <div className="profile-actions">
      {!wallet && <p>Connect your wallet to sign in.</p>}
      {wallet && <button disabled={busy} className="primary" onClick={() => run(signIn)}>{matches ? 'Sign in again' : 'Sign in with wallet'} ↗</button>}
      {session && <button disabled={busy} className="text-button" onClick={() => run(async () => {
        await request('/auth/logout', 'POST'); setSession(null); setAccess(false);
      })}>Sign out</button>}
      {matches && owner && <button disabled={busy} onClick={() => run(checkAccess)}>Verify edit access ↗</button>}
    </div>
    {session && <p className="note">Signed in as {session.wallet}. Expires {new Date(session.expiresAt).toLocaleTimeString('en-US')}. Smart contract wallets cannot sign in yet.</p>}
    {matches && !owner && <p className="note">Your connected wallet is not the owner at the displayed block.</p>}
    {access && matches && <form className="profile-form" onSubmit={save}>
      <label>Studio name<input required maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
      <label>Description<textarea maxLength={2000} rows={4} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>
      <label>Website URL<input type="url" placeholder="https://" maxLength={2048} value={draft.website} onChange={e => setDraft({ ...draft, website: e.target.value })}/></label>
      <label>Cover image URL<input type="url" placeholder="https://" maxLength={2048} value={draft.coverUrl} onChange={e => setDraft({ ...draft, coverUrl: e.target.value })}/></label>
      <p className="note">We check NFT ownership each time you save. If the NFT has moved since you signed in, sign in again before editing.</p>
      <button className="primary" disabled={busy} type="submit">Save studio profile ↗</button>
    </form>}
    {saved && <p role="status">{saved}</p>}
  </section>;
}
