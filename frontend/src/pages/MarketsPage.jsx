import React, { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageIntro from "../components/PageIntro.jsx";
import MarketView from "../MarketView.jsx";
import { useSelectedWallet } from "../WalletProvider.jsx";
export default function MarketsPage() {
  const { address } = useParams(),
    navigate = useNavigate(),
    { wallet } = useSelectedWallet(),
    selected = useMemo(() => (address ? { address } : null), [address]);
  return (
    <>
      {!address && (
        <PageIntro
          scene="markets"
          eyebrow="THE FOUNDRY / MARKETS"
          title="Find your next curiosity."
          compact
        >
          <p>Explore live Foundry markets, priced in CHOG.</p>
        </PageIntro>
      )}
      <MarketView
        wallet={wallet}
        selectedToken={selected}
        onSelectToken={(value) => navigate(`/app/markets/${value}`)}
        onOpenStudio={(id) => navigate(`/app/studios/${id}`)}
      />
    </>
  );
}
