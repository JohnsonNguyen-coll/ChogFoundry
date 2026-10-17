import React, { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MarketView from "../MarketView.jsx";
import { useSelectedWallet } from "../WalletProvider.jsx";
export default function MarketsPage() {
  const { address } = useParams(),
    navigate = useNavigate(),
    { wallet } = useSelectedWallet(),
    selected = useMemo(() => (address ? { address } : null), [address]);
  return (
    <MarketView
      wallet={wallet}
      selectedToken={selected}
      onSelectToken={(value) => navigate(`/app/markets/${value}`)}
      onOpenStudio={(id) => navigate(`/app/studios/${id}`)}
    />
  );
}
