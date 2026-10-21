import React, { useMemo } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import MarketView from "../MarketView.jsx";
import MarketDirectory from '../components/MarketDirectory.jsx';
import useApi from '../hooks/useApi.js';
import { useSelectedWallet } from "../WalletProvider.jsx";
export default function MarketsPage() {
  const { address } = useParams(),
    navigate = useNavigate(),
    { wallet } = useSelectedWallet(),
    selected = useMemo(() => (address ? { address } : null), [address]);
  const {state}=useLocation(),launched=state?.launched;
  const configuration=useApi('/config'),collection=configuration.data?.collection.address;
  return (
    <>
      {launched?.token?.toLowerCase()===address?.toLowerCase()&&launched&&<section className="launch-success-banner" role="status"><div><span className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</span><h2>{launched.name} is live.</h2><p>Your launch is confirmed. Trade and follow your token here.</p></div><a className="secondary" href={`https://monadscan.com/tx/${launched.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a></section>}
      {!address?<MarketDirectory collection={collection}/>:<><div className="market-back-link"><Link to="/app/markets">← All markets</Link></div><MarketView
        collection={collection}
        wallet={wallet}
        selectedToken={selected}
        onSelectToken={(value) => navigate(`/app/markets/${value}`)}
        onOpenStudio={(id) => navigate(`/app/studios/${id}`)}
      /></>}
    </>
  );
}
