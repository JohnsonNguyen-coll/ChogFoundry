import React, { useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import MarketView from "../MarketView.jsx";
import { useSelectedWallet } from "../WalletProvider.jsx";
export default function MarketsPage() {
  const { address } = useParams(),
    navigate = useNavigate(),
    { wallet } = useSelectedWallet(),
    selected = useMemo(() => (address ? { address } : null), [address]);
  const {state}=useLocation(),launched=state?.launched;
  return (
    <>
      {launched?.token?.toLowerCase()===address?.toLowerCase()&&launched&&<section className="launch-success-banner" role="status"><div><span className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</span><h2>{launched.name} is live.</h2><p>Your launch is confirmed. Trade and follow your token here.</p></div><a className="secondary" href={`https://monadscan.com/tx/${launched.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a></section>}
      <MarketView
        wallet={wallet}
        selectedToken={selected}
        onSelectToken={(value) => navigate(`/app/markets/${value}`)}
        onOpenStudio={(id) => navigate(`/app/studios/${id}`)}
      />
    </>
  );
}
