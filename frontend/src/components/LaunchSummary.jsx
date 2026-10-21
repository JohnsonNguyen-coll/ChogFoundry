import React from 'react';
import useApi from '../hooks/useApi.js';
import NftArtwork from './NftArtwork.jsx';
import {short} from '../lib/api.mjs';

export default function LaunchSummary({id,name,symbol,budget,creator}) {
  const studio=useApi(/^(0|[1-9][0-9]*)$/.test(id)?`/studios/${id}`:null);
  const nft=studio.data?.nft;
  return <aside className="launch-summary">
    <div className="launch-preview-card">
      <div className="launch-preview-top"><span className="eyebrow">YOUR NEXT LAUNCH</span><span className="launch-draft-tag">Draft</span></div>
      <div className="launch-token-mark" aria-hidden="true">{symbol.trim().slice(0,3).toUpperCase()||'✦'}</div>
      <h3>{name.trim()||'Your token name'}</h3>
      <p className="launch-ticker">{symbol.trim()?`$${symbol.trim()}`:'TOKEN'} <span>/ CHOG</span></p>
      <div className="launch-preview-facts"><div><span>Supply</span><strong>1,000,000,000</strong></div><div><span>Creator allocation</span><strong>0 tokens</strong></div><div><span>First-buy budget</span><strong>{budget&&budget!=='0'?`${budget} CHOG`:'No first buy'}</strong></div></div>
      <p className="launch-preview-caption">Draft preview · your token is created only after you confirm the launch in your wallet.</p>
    </div>
    <div className="launch-studio-card">
      <span className="eyebrow">LAUNCHING FROM</span>
      <div className="launch-studio-identity">
        {nft?<NftArtwork id={id} tokenURI={nft.tokenURI} collection={nft.collection} collectionName={nft.collectionName}/>:<div className="launch-studio-placeholder">#{id||'—'}</div>}
        <div><strong>Studio #{id||'—'}</strong><span>{nft?.collectionName||'NFT studio'}</span></div>
      </div>
      {studio.error&&<p className="note" role="status">Studio details unavailable. Ownership will be checked during review.</p>}
      <div className="launch-studio-wallet"><span>Creator wallet</span><span title={creator}>{short(creator)}</span></div>
      <p className="note">The NFT carries the studio. This token keeps its original creator, even when the studio changes hands.</p>
    </div>
  </aside>;
}
